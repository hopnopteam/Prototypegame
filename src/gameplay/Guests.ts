import * as THREE from 'three';
import { ARCHETYPES, REQUEST_ITEMS, type ArchetypeDef, type StoryDef } from '../config/content';
import type { ItemKind, Vec2 } from '../core/types';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from '../world/CarriageView';
import { CharacterView, type CharacterLook } from '../world/CharacterView';
import { Mover, type Actor } from './Actor';
import type { Bathroom, Cabin } from './TrainState';
import type { World } from './World';
import type { Zone } from './Zones';

export type GuestState =
  | 'platform' | 'boarding' | 'queue' | 'toCabin' | 'settling' | 'resting' | 'requesting'
  | 'toBathroom' | 'waitingBathroom' | 'inBathroom' | 'returning' | 'alighting' | 'leaving' | 'gone';

export type GuestRequest = ItemKind | 'bathroom';

const BATHROOM_USE_SECONDS = 2.6;
const BATHROOM_EMPTY_WAIT = 6;
const HAPPY_SECONDS = 1.1;

let nextId = 1;

export class Guest {
  readonly id = nextId++;
  readonly view: CharacterView;
  readonly child: CharacterView | null;
  readonly pos: Vec2;
  readonly mover: Mover;
  state: GuestState = 'platform';
  stateTime = 0;
  onPlatform = false;
  cabin: Cabin | null = null;
  bathroom: Bathroom | null = null;
  queueSlot = -1;
  arrivedInQueue = false;
  request: GuestRequest | null = null;
  nextRequestIn = 0;
  destinationStop = Infinity;
  happyTime = 0;
  hasLuggage = false;
  readonly childPos: Vec2;

  constructor(readonly archetype: ArchetypeDef, x: number, z: number, speed: number, readonly story: StoryDef | null) {
    this.pos = { x, z };
    this.childPos = { x, z: z + 0.6 };
    this.mover = new Mover(this.pos, speed);
    const colors = story ? story.colors : archetype.colors;
    const look: CharacterLook = {
      ...colors,
      accessory: story ? (story.id === 'priya' ? 'camera' : 'none') : archetype.accessory === 'child' ? 'none' : archetype.accessory,
      hat: story?.id === 'walter' ? 'conductor' : archetype.id === 'backpacker' ? 'beanie' : archetype.id === 'grandma' ? 'bun' : 'none',
    };
    this.view = new CharacterView(look);
    this.child = !story && archetype.accessory === 'child'
      ? new CharacterView({ body: '#F2C94C', accent: '#E26D8C', skin: colors.skin, hair: colors.hair, hat: 'none' }, 0.62)
      : null;
  }

  get inCabin(): boolean {
    return this.state === 'settling' || this.state === 'resting' || this.state === 'requesting';
  }

  get aboard(): boolean {
    return this.state !== 'platform' && this.state !== 'leaving' && this.state !== 'gone';
  }
}

/**
 * Guests: spawning (platform and the FTUE queue), the desk queue, check-in, requests, bathroom visits and
 * alighting. The only failure state is "no tip this time"; nobody ever gets angry or leaves unpaid.
 */
export class Guests {
  readonly list: Guest[] = [];
  readonly queue: Guest[] = [];
  private readonly tmp = new THREE.Vector3();
  private alightStagger = 0;

  constructor(private readonly w: World) {}

  /** Guests already aboard when a session starts (boarded at the previous station). */
  spawnStartingQueue(count: number): void {
    const slots = this.queueSlots();
    for (let i = 0; i < count; i++) {
      const guest = this.create(this.pickArchetype(i === 0 ? 'businessman' : i === 1 ? 'grandma' : undefined), slots[i].x, slots[i].z, null);
      guest.state = 'queue';
      guest.queueSlot = i;
      guest.arrivedInQueue = true;
      guest.mover.facing = -Math.PI / 2;
      this.queue.push(guest);
    }
  }

  /** Guests waiting on the platform, in platform-local coordinates. */
  spawnPlatformGuests(spots: Vec2[], storyGuest: StoryDef | null): Guest[] {
    const created: Guest[] = [];
    spots.forEach((spot, i) => {
      const story = i === 0 ? storyGuest : null;
      const guest = this.create(this.pickArchetype(), spot.x, spot.z, story);
      guest.state = 'platform';
      guest.onPlatform = true;
      guest.mover.facing = -Math.PI / 2 + (this.w.rng.next() - 0.5) * 0.8;
      guest.hasLuggage = this.w.rng.chance(this.w.econ.guests.luggageChance);
      created.push(guest);
    });
    return created;
  }

  platformGuests(): Guest[] {
    return this.list.filter((g) => g.state === 'platform');
  }

  /** Boards the next platform guest: they walk in through the door and join the desk queue. */
  boardNext(): Guest | null {
    const guest = this.list.find((g) => g.state === 'platform');
    if (!guest) return null;
    const map = this.w.map;
    const door = map.doors()[0];
    guest.onPlatform = false;
    guest.state = 'boarding';
    guest.stateTime = 0;
    guest.queueSlot = this.queue.length;
    guest.arrivedInQueue = false;
    this.queue.push(guest);
    const slot = this.slotPosition(guest.queueSlot);
    const path = [door.outside, door.inside, slot];
    guest.mover.go(path, () => this.arriveInQueue(guest));
    this.w.events.emit('guest.boarded', {});
    return guest;
  }

  hasGuestAtDesk(): boolean {
    const first = this.queue[0];
    return !!first && first.arrivedInQueue && first.state === 'queue';
  }

  /** Desk zone: check the first guest in, if there is a clean cabin for them. */
  deskStay(zone: Zone, actor: Actor, dt: number): boolean {
    const guest = this.queue[0];
    if (!guest || !this.hasGuestAtDesk()) return false;
    const cabin = this.w.train.freeCabin();
    if (!cabin) {
      zone.progress = 0;
      return false;
    }
    zone.progress += (dt / this.w.econ.zones.checkInSeconds) * actor.workMultiplier;
    if (zone.progress < 1) return true;
    zone.progress = 0;
    this.checkIn(guest, cabin, actor);
    return true;
  }

  requestFor(cabin: Cabin): ItemKind | null {
    const guest = cabin.guest;
    if (!guest || guest.state !== 'requesting' || !guest.request || guest.request === 'bathroom') return null;
    return guest.request;
  }

  /** Cabin zone: hand the requested item over for a tip and a star. */
  deliverStay(cabin: Cabin, zone: Zone, actor: Actor, dt: number): boolean {
    const item = this.requestFor(cabin);
    if (!item || !actor.stack.has(item)) return false;
    zone.timer += dt * actor.workMultiplier;
    if (zone.timer < this.w.econ.zones.dropIntervalSeconds) return true;
    zone.timer = 0;
    const guest = cabin.guest!;
    guest.request = null;
    const head = (): THREE.Vector3 => this.tmp.set(guest.pos.x, FLOOR_Y + 1.0, guest.pos.z);
    actor.stack.remove(item, head, () => this.fulfil(guest, item, actor.isPlayer));
    this.w.audio.play('drop');
    this.w.events.emit('item.dropped', { item, byPlayer: actor.isPlayer });
    return true;
  }

  /** Guests needing something, for staff and the guidance arrow. */
  openRequests(): Guest[] {
    return this.list.filter((g) => g.state === 'requesting' && g.request !== null && g.request !== 'bathroom');
  }

  /** Every guest whose stop this is gets up and heads for the door (staggered so they don't overlap). */
  onStationStop(stopSerial: number): void {
    this.alightStagger = 0;
    for (const guest of this.list) {
      if (guest.destinationStop <= stopSerial && guest.cabin && (guest.inCabin || guest.state === 'toCabin')) {
        this.w.tweens.delay(this.alightStagger, () => this.startAlighting(guest));
        this.alightStagger += 0.45;
      }
    }
  }

  /** Doors are closing: nobody is left half-way through a door. */
  onDoorsClosing(): void {
    const door = this.w.map.doors()[0];
    for (const guest of this.list) {
      if (guest.state === 'boarding') {
        guest.pos.x = door.inside.x;
        guest.pos.z = door.inside.z;
        guest.mover.go([this.slotPosition(guest.queueSlot)], () => this.arriveInQueue(guest));
      } else if (guest.state === 'alighting') {
        guest.mover.stop();
        this.finishAlighting(guest, true);
      }
    }
  }

  /** The platform has gone: anyone still standing on it waits for the next train. */
  removePlatformGuests(): number {
    let removed = 0;
    for (const guest of [...this.list]) {
      if (guest.state === 'platform' || guest.state === 'leaving') {
        this.destroy(guest);
        removed++;
      }
    }
    return removed;
  }

  update(dt: number): void {
    const w = this.w;
    const platformOffset = w.station.platformOffset;
    for (const guest of [...this.list]) {
      guest.stateTime += dt;
      guest.mover.update(dt);
      this.think(guest, dt);
      if (guest.state === 'gone') continue;

      const y = FLOOR_Y;
      const z = guest.pos.z + (guest.onPlatform ? platformOffset : 0);
      if (guest.state === 'resting' && guest.cabin) {
        guest.view.setPose('sleep');
        guest.view.setPosition(guest.cabin.bedPose.x, y, guest.cabin.bedPose.z);
        guest.view.setFacing(0);
      } else {
        guest.view.setPose('stand');
        guest.view.setPosition(guest.pos.x, y, z);
        guest.view.setFacing(guest.mover.facing);
      }
      guest.view.update(dt, guest.mover.speedNow);

      if (guest.child) {
        const cz = guest.childPos;
        const behindX = guest.pos.x - Math.sin(guest.mover.facing) * 0.55 + 0.25;
        const behindZ = guest.pos.z - Math.cos(guest.mover.facing) * 0.55;
        const moving = guest.mover.speedNow > 0;
        cz.x += (behindX - cz.x) * Math.min(1, dt * 6);
        cz.z += (behindZ - cz.z) * Math.min(1, dt * 6);
        const visible = guest.state !== 'resting' && guest.state !== 'inBathroom';
        guest.child.root.visible = visible;
        guest.child.setPosition(cz.x, y, cz.z + (guest.onPlatform ? platformOffset : 0));
        guest.child.setFacing(guest.mover.facing);
        guest.child.update(dt, moving ? guest.mover.speed : 0);
      }
    }
  }

  private think(guest: Guest, dt: number): void {
    const w = this.w;
    switch (guest.state) {
      case 'queue':
        if (guest.queueSlot !== 0 || !guest.arrivedInQueue) guest.view.showBubble(null);
        else if (w.train.freeCabin()) guest.view.showBubble('ticket', 'request');
        else guest.view.showBubble('noroom', 'alert');
        break;
      case 'settling':
        if (guest.stateTime > 0.6) this.setState(guest, 'resting');
        break;
      case 'resting':
        // Their stop may have arrived while they were busy (bathroom, a request): get off now.
        if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen) {
          this.startAlighting(guest);
          break;
        }
        guest.view.showBubble('zzz', 'plain', 1.3);
        guest.nextRequestIn -= dt;
        if (guest.nextRequestIn <= 0 && this.requestsAllowed()) this.makeRequest(guest);
        break;
      case 'requesting':
        if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen && guest.happyTime <= 0) {
          this.startAlighting(guest);
        } else if (guest.happyTime > 0) {
          guest.happyTime -= dt;
          if (guest.happyTime <= 0) this.backToBed(guest);
        } else if (guest.request && guest.request !== 'bathroom') {
          guest.view.showBubble(guest.request as IconName, 'request');
        }
        break;
      case 'waitingBathroom': {
        const bath = guest.bathroom;
        if (bath && !bath.occupant) this.enterBathroom(guest, bath);
        break;
      }
      case 'inBathroom': {
        const bath = guest.bathroom;
        if (!bath) {
          this.returnToCabin(guest);
          break;
        }
        if (guest.stateTime < BATHROOM_USE_SECONDS) break;
        if (bath.stocked) {
          bath.towels--;
          bath.rolls--;
          w.train.persistBathrooms();
          const tip = Math.max(1, Math.round(w.econ.money.bathroomTip * guest.archetype.tipMultiplier * w.tipMultiplier()));
          w.cash.add(bath.pileId, tip, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
          w.audio.play('flush');
          w.events.emit('bathroom.used', { tipped: true });
          this.leaveBathroom(guest);
        } else {
          guest.view.showBubble(bath.towels <= 0 ? 'towel' : 'roll', 'alert');
          if (guest.stateTime > BATHROOM_USE_SECONDS + BATHROOM_EMPTY_WAIT) {
            w.events.emit('bathroom.used', { tipped: false });
            this.leaveBathroom(guest);
          }
        }
        break;
      }
      case 'leaving':
        if (guest.stateTime > 1.6) {
          const s = Math.max(0, 1 - (guest.stateTime - 1.6) * 3);
          guest.view.root.scale.setScalar(s);
          if (s <= 0) this.destroy(guest);
        }
        break;
      default:
        break;
    }
  }

  private requestsAllowed(): boolean {
    // Requests fill the first minute (before the first station) so there is never a dead moment.
    return true;
  }

  private makeRequest(guest: Guest): void {
    const w = this.w;
    const story = guest.story ? w.meta?.storyRequest(guest.story) : null;
    let request: GuestRequest;
    if (story) request = story;
    else {
      const bathroomOpen = w.train.bathrooms.some((b) => b.unlocked);
      request = bathroomOpen && w.rng.chance(w.econ.guests.bathroomVisitWeight) ? 'bathroom' : w.rng.pick(REQUEST_ITEMS);
    }
    guest.request = request;
    if (request === 'bathroom') {
      this.goToBathroom(guest);
      return;
    }
    this.setState(guest, 'requesting');
    guest.happyTime = 0;
    if (guest.cabin) {
      guest.pos.x = guest.cabin.center.x;
      guest.pos.z = guest.cabin.center.z + 0.2;
      guest.mover.facing = -Math.PI / 2;
    }
    guest.view.showBubble(request, 'request');
    w.audio.play('soft', { volume: 0.5 });
  }

  private fulfil(guest: Guest, item: ItemKind, byPlayer: boolean): void {
    const w = this.w;
    if (guest.state !== 'requesting' || !guest.cabin) return;
    const tip = Math.max(1, Math.round(w.econ.money.requestTip * guest.archetype.tipMultiplier * w.tipMultiplier()));
    w.cash.add(guest.cabin.pileId, tip, this.tmp.set(guest.pos.x, FLOOR_Y + 1.1, guest.pos.z));
    w.addStars(w.econ.stars.requestFulfilled, 'request', guest.pos);
    w.particles.emit('heart', guest.pos.x, FLOOR_Y + 1.6, guest.pos.z, 5, 0.2);
    w.audio.play('heart');
    guest.view.showBubble('heart', 'plain', 1.75);
    guest.view.bounce(1);
    guest.happyTime = HAPPY_SECONDS;
    w.events.emit('request.fulfilled', { item, tip, x: guest.pos.x, z: guest.pos.z, byPlayer });
    if (guest.story) w.meta?.onStoryRequestDone(guest.story, item);
    if (w.rng.chance(0.3)) w.ui.speechLine(w.rng.pick(guest.archetype.lines), guest.pos.x, FLOOR_Y + 2.1, guest.pos.z);
  }

  private backToBed(guest: Guest): void {
    this.setState(guest, 'resting');
    guest.view.showBubble(null);
    guest.nextRequestIn = this.w.rng.range(...this.w.econ.guests.requestInterval);
  }

  private goToBathroom(guest: Guest): void {
    const bath = this.pickBathroom();
    if (!bath) {
      guest.request = null;
      this.backToBed(guest);
      return;
    }
    guest.bathroom = bath;
    bath.waiting.push(guest);
    this.setState(guest, 'toBathroom');
    guest.view.showBubble('bath', 'intent');
    const from = guest.cabin?.node ?? this.w.map.nearestNode(guest.pos.x, guest.pos.z);
    const path = from ? this.w.map.nav.findPath(from, bath.node) : null;
    guest.mover.go(path ?? [bath.restock], () => {
      if (bath.occupant) this.setState(guest, 'waitingBathroom');
      else this.enterBathroom(guest, bath);
    });
  }

  private pickBathroom(): Bathroom | null {
    let best: Bathroom | null = null;
    for (const bath of this.w.train.bathrooms) {
      if (!bath.unlocked) continue;
      if (!best || bath.waiting.length + (bath.occupant ? 1 : 0) < best.waiting.length + (best.occupant ? 1 : 0)) best = bath;
    }
    return best;
  }

  private enterBathroom(guest: Guest, bath: Bathroom): void {
    bath.occupant = guest;
    const i = bath.waiting.indexOf(guest);
    if (i >= 0) bath.waiting.splice(i, 1);
    guest.mover.go([bath.useSpot], () => {
      this.setState(guest, 'inBathroom');
      guest.view.showBubble(null);
    });
  }

  private leaveBathroom(guest: Guest): void {
    const bath = guest.bathroom;
    if (bath && bath.occupant === guest) bath.occupant = null;
    guest.bathroom = null;
    guest.request = null;
    this.returnToCabin(guest);
  }

  private returnToCabin(guest: Guest): void {
    const w = this.w;
    guest.view.showBubble(null);
    if (!guest.cabin) {
      this.destroy(guest);
      return;
    }
    // If their stop came and went while they were in the bathroom, they alight now.
    if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen) {
      this.startAlighting(guest);
      return;
    }
    this.setState(guest, 'returning');
    const from = w.map.nearestNode(guest.pos.x, guest.pos.z);
    const path = from ? w.map.nav.findPath(from, guest.cabin.node) : null;
    const cabin = guest.cabin;
    guest.mover.go([...(path ?? []), cabin.center], () => {
      this.setState(guest, 'settling');
      guest.nextRequestIn = w.rng.range(...w.econ.guests.requestInterval);
    });
  }

  private checkIn(guest: Guest, cabin: Cabin, actor: Actor): void {
    const w = this.w;
    const money = w.econ.money;
    const doubled = w.data.monetization.doubleFaresStop !== null && w.data.monetization.doubleFaresStop >= w.journey.stopSerial;
    const fare = Math.round((money.baseFare + w.train.fareBonus(cabin)) * guest.archetype.fareMultiplier * w.fareMultiplier() * (doubled ? 2 : 1));
    w.cash.add('desk', fare, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
    w.audio.play('bell');
    w.haptics.light();
    w.ui.floatText(`+${fare}`, guest.pos.x, FLOOR_Y + 1.9, guest.pos.z, 'cash');
    guest.view.showBubble(null);
    guest.view.bounce(0.7);
    actor.view.bounce(0.4);

    this.queue.shift();
    this.reflowQueue();
    cabin.guest = guest;
    guest.cabin = cabin;
    guest.queueSlot = -1;
    const legs = Number(w.rng.weighted(w.econ.guests.rideLegsWeights as unknown as Record<string, number>));
    guest.destinationStop = w.journey.stopSerial + (guest.story ? 2 : legs);
    this.setState(guest, 'toCabin');
    const deskNode = 'c0:desk';
    const path = w.map.nav.findPath(w.map.nearestNode(guest.pos.x, guest.pos.z) ?? deskNode, cabin.node);
    guest.mover.go([...(path ?? []), cabin.center], () => {
      this.setState(guest, 'settling');
      const first = w.econ.guests.firstRequestDelay;
      guest.nextRequestIn = w.rng.range(first[0], first[1]);
    });
    w.events.emit('guest.checkedIn', { fare, x: guest.pos.x, z: guest.pos.z });
    if (guest.story) w.meta?.onStoryGuestCheckedIn(guest.story);
  }

  private startAlighting(guest: Guest): void {
    const w = this.w;
    if (!guest.cabin || guest.state === 'alighting' || guest.state === 'leaving' || guest.state === 'gone') return;
    if (guest.state === 'toBathroom' || guest.state === 'waitingBathroom' || guest.state === 'inBathroom') return;
    if (!w.journey.doorsOpen) return;
    const cabin = guest.cabin;
    // They leave a tip and a lived-in cabin behind.
    let tip = w.econ.money.alightTip * guest.archetype.tipMultiplier * w.tipMultiplier();
    if (w.train.luggageStored > 0) {
      w.train.luggageStored--;
      tip += w.econ.money.luggageTip;
    }
    const tipAmount = Math.max(1, Math.round(tip));
    w.cash.add(cabin.pileId, tipAmount, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
    cabin.dirty[0] = cabin.dirty[1] = cabin.dirty[2] = true;
    w.station.recordTip(tipAmount);
    guest.request = null;
    this.setState(guest, 'alighting');
    guest.view.showBubble(null);
    const door = w.map.doors()[0];
    const from = cabin.node;
    const path = w.map.nav.findPath(from, door.outsideNode);
    const exit = { x: door.outside.x + 2.2, z: door.outside.z - 3 - w.rng.next() * 3 };
    guest.mover.go([...(path ?? [door.inside, door.outside]), exit], () => this.finishAlighting(guest, false));
    if (w.rng.chance(0.35)) w.ui.speechLine('Thank you! Lovely ride!', guest.pos.x, FLOOR_Y + 2.1, guest.pos.z);
  }

  private finishAlighting(guest: Guest, teleported: boolean): void {
    const w = this.w;
    if (guest.cabin && guest.cabin.guest === guest) guest.cabin.guest = null;
    guest.cabin = null;
    this.setState(guest, 'leaving');
    guest.onPlatform = true;
    if (teleported) {
      const door = w.map.doors()[0];
      guest.pos.x = door.outside.x + 1.5;
      guest.pos.z = door.outside.z - 2;
    }
    guest.view.showBubble('heart', 'plain', 1.7);
    w.events.emit('guest.alighted', { tip: 0 });
    if (guest.story) w.meta?.onStoryGuestAlighted(guest.story);
  }

  private arriveInQueue(guest: Guest): void {
    guest.arrivedInQueue = true;
    guest.state = 'queue';
    guest.stateTime = 0;
    guest.mover.facing = -Math.PI / 2;
  }

  private reflowQueue(): void {
    this.queue.forEach((guest, i) => {
      guest.queueSlot = i;
      if (guest.state === 'queue' && guest.arrivedInQueue) {
        guest.arrivedInQueue = false;
        guest.mover.go([this.slotPosition(i)], () => this.arriveInQueue(guest));
      } else if (guest.state === 'boarding') {
        const door = this.w.map.doors()[0];
        const inside = guest.pos.x < door.inside.x + 0.5;
        guest.mover.go(inside ? [this.slotPosition(i)] : [door.outside, door.inside, this.slotPosition(i)], () => this.arriveInQueue(guest));
      }
    });
  }

  private queueSlots(): Vec2[] {
    return this.w.map.layoutOf(0).queue;
  }

  slotPosition(i: number): Vec2 {
    const slots = this.queueSlots();
    if (i < slots.length) return slots[i];
    // Overflow waits in a loose group by the door.
    const door = this.w.map.doors()[0];
    return { x: door.inside.x - 0.3 - (i % 2) * 0.5, z: door.inside.z + 0.4 + Math.floor((i - slots.length) / 2) * 0.5 };
  }

  get queueCapacity(): number {
    return this.queueSlots().length + 4;
  }

  private setState(guest: Guest, state: GuestState): void {
    guest.state = state;
    guest.stateTime = 0;
  }

  private pickArchetype(force?: string): ArchetypeDef {
    if (force) return ARCHETYPES.find((a) => a.id === force) ?? ARCHETYPES[0];
    const carriages = this.w.train.count;
    const weights: Record<string, number> = {};
    for (const a of ARCHETYPES) if (carriages >= a.minCarriages) weights[a.id] = a.weight;
    const id = this.w.rng.weighted(weights);
    return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0];
  }

  private create(archetype: ArchetypeDef, x: number, z: number, story: StoryDef | null): Guest {
    const speed = this.w.econ.guests.walkSpeed * archetype.speedMultiplier;
    const guest = new Guest(archetype, x, z, speed, story);
    this.w.scene.add(guest.view.root);
    if (guest.child) this.w.scene.add(guest.child.root);
    this.list.push(guest);
    return guest;
  }

  private destroy(guest: Guest): void {
    if (guest.story && guest.state !== 'leaving') this.w.meta?.onStoryGuestLost(guest.story);
    guest.state = 'gone';
    if (guest.cabin && guest.cabin.guest === guest) guest.cabin.guest = null;
    if (guest.bathroom) {
      if (guest.bathroom.occupant === guest) guest.bathroom.occupant = null;
      const i = guest.bathroom.waiting.indexOf(guest);
      if (i >= 0) guest.bathroom.waiting.splice(i, 1);
    }
    const qi = this.queue.indexOf(guest);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      this.reflowQueue();
    }
    this.w.scene.remove(guest.view.root);
    if (guest.child) this.w.scene.remove(guest.child.root);
    guest.view.dispose();
    const i = this.list.indexOf(guest);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Guests who will still be aboard after this stop (for sizing the platform crowd). */
  stayingPast(stopSerial: number): number {
    return this.list.filter((g) => g.aboard && (g.cabin === null ? g.state !== 'platform' : g.destinationStop > stopSerial)).length;
  }
}
