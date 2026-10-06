import * as THREE from 'three';
import { ARCHETYPES, COMMON_MESS, type ArchetypeDef, type MessPiece, type StoryDef } from '../config/content';
import { CLASS_BY_ID, type ClassId, type ServiceNeed } from '../config/classes';
import type { Vec2 } from '../core/types';
import type { IconName } from '../ui/icons';
import { BED_TOP, FLOOR_Y } from '../world/CarriageView';
import { CharacterView, type CharacterLook } from '../world/CharacterView';
import { BED_MESS } from '../world/Mess';
import { Mover, type Actor } from './Actor';
import type { Bathroom, Cabin } from './TrainState';
import type { World } from './World';
import type { Zone } from './Zones';
import type { Outing } from './Venues';

export type GuestState =
  | 'platform' | 'boarding' | 'queue' | 'toCabin' | 'settling' | 'resting' | 'requesting'
  | 'toBathroom' | 'waitingBathroom' | 'inBathroom' | 'returning' | 'alighting' | 'leaving' | 'gone'
  // Session 20: an outing to a venue carriage (walking there, in its queue, seated waiting, eating or watching).
  | 'toVenue' | 'venueQueue' | 'seated' | 'consuming';

/** Guest states on an outing to a venue (the venue runs them). */
const OUTING_STATES: ReadonlySet<GuestState> = new Set<GuestState>(['toVenue', 'venueQueue', 'seated', 'consuming']);

export type GuestRequest = ServiceNeed | 'bathroom';

const BATHROOM_USE_SECONDS = 2.6;
const BATHROOM_EMPTY_WAIT = 6;
/** A seated guest's root sits this far above the floor so they rest on the mattress (hips 0.24 m up). */
const SIT_ROOT = BED_TOP - 0.24;
/** A guest back from the washroom sits only briefly before lying down again. */
const RETURN_SETTLE_SECONDS = 0.8;
/** Steps in the "generous tip" ring drawn around a request bubble. */
export const TIP_RING_STEPS = 12;

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
  /** Game time the current request was made (fast service earns a bigger tip). */
  requestAt = 0;
  /** The current request has waited too long (a soft cue: the bubble turns red). */
  slow = false;
  /** Already grumbled about an empty washroom this visit. */
  complained = false;
  /** Seconds to sit on the bed edge (reading) before lying down. */
  settleFor = 0;
  nextRequestIn = 0;
  destinationStop = Infinity;
  happyTime = 0;
  hasLuggage = false;
  readonly childPos: Vec2;
  /** The class on their ticket: they board only a carriage of this class. */
  cls: ClassId;
  /** Royal: the rest of the butler's list (asked for one after another, paid as one generous tip). */
  pending: ServiceNeed[] = [];
  /** On an outing to a venue carriage (session 20): where, which seat, seated yet, paid yet. */
  outing: Outing | null = null;

  constructor(readonly archetype: ArchetypeDef, x: number, z: number, speed: number, readonly story: StoryDef | null) {
    this.cls = archetype.cls;
    this.pos = { x, z };
    this.childPos = { x, z: z + 0.6 };
    this.mover = new Mover(this.pos, speed);
    const colors = story ? story.colors : archetype.colors;
    const look: CharacterLook = {
      ...colors,
      accessory: story ? (story.id === 'priya' ? 'camera' : 'none') : archetype.accessory === 'child' ? 'none' : archetype.accessory,
      hat: story?.id === 'walter' ? 'conductor' : story ? 'none' : archetype.hat ?? 'none',
      hatColor: story ? undefined : archetype.hatColor,
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
  private readonly bedsLeft = new Map<ClassId, number>();

  constructor(private readonly w: World) {}

  /** Guests already aboard when a session starts (boarded at the previous station). */
  spawnStartingQueue(count: number): void {
    const slots = this.queueSlots();
    for (let i = 0; i < count; i++) {
      const guest = this.create(this.pickArchetype('basic', i === 0 ? 'backpacker' : i === 1 ? 'student' : undefined), slots[i].x, slots[i].z, null);
      guest.state = 'queue';
      guest.queueSlot = i;
      guest.arrivedInQueue = true;
      guest.mover.facing = this.queueFacing(i);
      this.queue.push(guest);
    }
  }

  /**
   * Guests waiting on the platform, in platform-local coordinates, one class per spot (Station decides: the
   * classes the train sells, and now and then one it does not yet).
   */
  spawnPlatformGuests(spots: Vec2[], storyGuest: StoryDef | null, classes: ClassId[], archetypes: string[] = []): Guest[] {
    const created: Guest[] = [];
    spots.forEach((spot, i) => {
      const story = i === 0 ? storyGuest : null;
      const cls = classes[i] ?? 'basic';
      const guest = this.create(this.pickArchetype(cls, archetypes[i]), spot.x, spot.z, story);
      // A story guest rides in whatever class they are given a ticket for.
      guest.cls = cls;
      guest.state = 'platform';
      guest.onPlatform = true;
      guest.mover.facing = -Math.PI / 2 + (this.w.rng.next() - 0.5) * 0.8;
      // Bags join the flow from the second station (config: flow).
      guest.hasLuggage = this.w.flow.allows('luggage') && this.w.rng.chance(this.w.econ.guests.luggageChance);
      created.push(guest);
    });
    return created;
  }

  platformGuests(): Guest[] {
    return this.list.filter((g) => g.state === 'platform');
  }

  /**
   * Beds not spoken for at this stop: open cabins minus everyone aboard who is not getting off here. Only
   * that many can board; the rest wait for the next train (the clearest sign you need more cabins).
   */
  bedsFree(stopSerial = this.w.journey.stopSerial, cls?: ClassId): number {
    return Math.max(0, this.w.train.openCabinCount(cls) - this.stayingPast(stopSerial, cls));
  }

  /** The next platform guest with a bed of their class waiting for them. */
  private nextBoarder(stopSerial = this.w.journey.stopSerial): Guest | null {
    const free = new Map<ClassId, number>();
    for (const guest of this.list) {
      if (guest.state !== 'platform') continue;
      if (!free.has(guest.cls)) free.set(guest.cls, this.bedsFree(stopSerial, guest.cls));
      if ((free.get(guest.cls) ?? 0) > 0) return guest;
    }
    return null;
  }

  /**
   * Someone on the platform has a bed of their class waiting for them (and the conductor can board them: at
   * Millbrook, before the first departure, travellers step aboard by themselves as rooms open).
   */
  canBoard(): boolean {
    // At Millbrook only the first ticket is collected at the pad; after that travellers step aboard by themselves.
    const station = this.w.station;
    return (!station.prologue || !station.prologueTicketsDone) && this.nextBoarder() !== null;
  }

  /** Someone on the platform has a bed of their class (whoever boards them). */
  hasBoarder(): boolean {
    return this.nextBoarder() !== null;
  }

  /** Boards the next platform guest who has a bed: they walk in through the door and join the desk queue. */
  boardNext(byPlayer = false): Guest | null {
    const guest = this.nextBoarder();
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
    this.w.events.emit('guest.boarded', { byPlayer });
    return guest;
  }

  /** The guest waiting at the desk, if one has reached it. */
  deskGuest(): Guest | null {
    return this.hasGuestAtDesk() ? this.queue[0] : null;
  }

  /** Someone is at the desk and a clean cabin of their class (or someone else's in the line) is ready. */
  deskReady(): boolean {
    if (!this.hasGuestAtDesk()) return false;
    return this.queue.some((g) => g.arrivedInQueue && g.state === 'queue' && this.w.train.freeCabin(g.cls) !== null);
  }

  hasGuestAtDesk(): boolean {
    const first = this.queue[0];
    return !!first && first.arrivedInQueue && first.state === 'queue';
  }

  /** Desk zone: check the first guest in, if there is a clean cabin of their class for them. */
  deskStay(zone: Zone, actor: Actor, dt: number): boolean {
    this.callForward();
    const guest = this.queue[0];
    if (!guest || !this.hasGuestAtDesk()) return false;
    const cabin = this.w.train.freeCabin(guest.cls);
    if (!cabin) {
      zone.progress = 0;
      return false;
    }
    zone.progress += (dt / this.w.econ.zones.checkInSeconds) * actor.workMultiplier;
    // Whoever is behind the desk stamps the ticket.
    actor.view.act('stamp');
    if (zone.progress < 1) return true;
    zone.progress = 0;
    this.checkIn(guest, cabin, actor);
    return true;
  }

  /**
   * If the guest at the front has no clean cabin of their class yet but someone behind them does, that guest
   * is called forward ("Business class, this way!") so one class never holds up another.
   */
  private callForward(): void {
    const head = this.queue[0];
    if (!head || !head.arrivedInQueue || head.state !== 'queue' || this.w.train.freeCabin(head.cls)) return;
    const i = this.queue.findIndex((g) => g.arrivedInQueue && g.state === 'queue' && this.w.train.freeCabin(g.cls) !== null);
    if (i <= 0) return;
    const [next] = this.queue.splice(i, 1);
    this.queue.unshift(next);
    this.reflowQueue();
  }

  requestFor(cabin: Cabin): ServiceNeed | null {
    const guest = cabin.guest;
    if (!guest || guest.state !== 'requesting' || !guest.request || guest.request === 'bathroom') return null;
    return guest.request;
  }

  /** Cabin zone: hand the requested item over (or turn the bed down) for a tip and a star. */
  deliverStay(cabin: Cabin, zone: Zone, actor: Actor, dt: number): boolean {
    const need = this.requestFor(cabin);
    if (!need) return false;
    if (need === 'turndown') {
      // Turning the bed down: a moment at the bedside, folding the cover back.
      zone.progress += (dt / this.w.econ.classes.turndownSeconds) * actor.workMultiplier;
      actor.view.act('hug');
      if (zone.progress < 1) return true;
      zone.progress = 0;
      const guest = cabin.guest!;
      guest.request = null;
      this.w.audio.play('soft', { volume: 0.6, pitch: 1.2 });
      this.fulfil(guest, 'turndown', actor.isPlayer);
      return true;
    }
    const item = need;
    if (!actor.stack.has(item)) return false;
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
    // Everyone on the platform holds up a ticket in their class's colour; those beyond the free beds of their
    // class hold up a "no room" sign instead: they cannot board this time.
    const atStation = w.journey.phase === 'stationStop' || w.journey.phase === 'arriving';
    const serial = w.journey.phase === 'arriving' ? w.journey.stopSerial + 1 : w.journey.stopSerial;
    this.bedsLeft.clear();
    for (const guest of this.list) {
      if (guest.state !== 'platform') continue;
      if (!atStation) {
        guest.view.showBubble('ticket', guest.cls, 1.85);
        continue;
      }
      if (!this.bedsLeft.has(guest.cls)) this.bedsLeft.set(guest.cls, this.bedsFree(serial, guest.cls));
      const beds = this.bedsLeft.get(guest.cls) ?? 0;
      if (beds > 0) {
        this.bedsLeft.set(guest.cls, beds - 1);
        guest.view.showBubble('ticket', guest.cls, 1.85);
      } else guest.view.showBubble('noroom', 'alert', 1.85);
    }
    for (const guest of [...this.list]) {
      guest.stateTime += dt;
      guest.mover.update(dt);
      this.think(guest, dt);
      if (guest.state === 'gone') continue;

      const y = FLOOR_Y;
      const z = guest.pos.z + (guest.onPlatform ? platformOffset : 0);
      guest.view.leans = guest.aboard;
      if (guest.child) guest.child.leans = guest.aboard;
      if (guest.state === 'resting' && guest.cabin) {
        guest.view.setPose('sleep', w.train.views[guest.cabin.carriage]?.blanketColor);
        guest.view.setPosition(guest.cabin.sleepPose.x, y + BED_TOP, guest.cabin.sleepPose.z);
        guest.view.setFacing(0);
      } else if (guest.outing?.seated && (guest.state === 'seated' || guest.state === 'consuming')) {
        // Sat at a venue's table, stool or dome seat.
        const seat = guest.outing.seat;
        guest.view.setPose('sit');
        guest.view.setPosition(seat.sit.x, y + seat.layout.top - 0.24, seat.sit.z);
        guest.view.setFacing(seat.layout.facing);
      } else if (guest.state === 'settling' && guest.cabin && !guest.mover.isMoving) {
        guest.view.setPose('sit');
        guest.view.setPosition(guest.cabin.sitPose.x, y + SIT_ROOT, guest.cabin.sitPose.z);
        guest.view.setFacing(-Math.PI / 2);
        if (guest.settleFor > 1) guest.view.act('read', 0.3);
      } else {
        guest.view.setPose('stand');
        guest.view.setPosition(guest.pos.x, y, z);
        guest.view.setFacing(guest.mover.facing);
        this.idleAction(guest);
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

  /** What someone standing about does with their hands: watches in queues, waves at the train. */
  private idleAction(guest: Guest): void {
    const w = this.w;
    if (guest.mover.isMoving) return;
    switch (guest.state) {
      case 'platform':
        if (w.journey.phase === 'arriving') guest.view.act('wave', 0.3);
        else if (guest.stateTime > 2) guest.view.act('watch', 0.3);
        break;
      case 'queue':
        if (guest.arrivedInQueue && guest.stateTime > 2.5) guest.view.act('watch', 0.3);
        break;
      case 'venueQueue':
        if (guest.stateTime > 3) guest.view.act('watch', 0.3);
        break;
      case 'inBathroom':
        guest.view.act('wash', 0.3);
        break;
    }
  }

  private think(guest: Guest, dt: number): void {
    const w = this.w;
    if (OUTING_STATES.has(guest.state)) {
      w.venues.thinkGuest(guest, dt);
      return;
    }
    switch (guest.state) {
      case 'queue':
        if (guest.queueSlot !== 0 || !guest.arrivedInQueue) guest.view.showBubble(null);
        else if (w.train.freeCabin(guest.cls)) guest.view.showBubble('ticket', guest.cls);
        else guest.view.showBubble('noroom', 'alert');
        break;
      case 'settling':
        // Reading on the bed edge counts toward their first request.
        guest.nextRequestIn -= dt;
        if (guest.stateTime > guest.settleFor) this.setState(guest, 'resting');
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
          guest.view.showBubble(guest.request as IconName, guest.slow ? 'alert' : guest.pending.length > 0 ? 'royal' : 'request', 1.85, this.tipRingStep(guest));
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
          const tip = Math.max(1, Math.round(w.econ.money.bathroomTip * guest.archetype.tipMultiplier * CLASS_BY_ID[guest.cls].tip * w.tipMultiplier() * w.train.bathTipMultiplier(bath)));
          w.cash.add(bath.pileId, tip, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
          w.audio.play('flush');
          w.events.emit('bathroom.used', { tipped: true });
          this.leaveBathroom(guest);
        } else {
          guest.view.showBubble(bath.towels <= 0 ? 'towel' : 'roll', 'alert');
          if (!guest.complained) {
            guest.complained = true;
            w.feedback.onEmptyWashroom(guest, bath.towels <= 0 ? 'towel' : 'roll');
          }
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

  /** The ring around a request bubble shrinks as the generous-tip window runs out (never a penalty). */
  private tipRingStep(guest: Guest): number {
    const elapsed = this.w.time - guest.requestAt;
    const fraction = 1 - elapsed / this.w.econ.service.quickSeconds;
    return fraction <= 0 ? -1 : Math.ceil(fraction * TIP_RING_STEPS);
  }

  private requestsAllowed(): boolean {
    const w = this.w;
    if (w.flow.allows('manyRequests')) return true;
    // The opening (config: flow): one thing at a time. The first request waits until the first cabin is built,
    // and a guest asks only when nobody else is waiting for something and nobody stands at the desk.
    return w.data.profile.ftue.first_unlock !== undefined && this.openRequests().length === 0 && !this.deskReady();
  }

  /** What a guest of this class asks for: the class's own list, seasoned by what their kind likes best. */
  private classRequest(guest: Guest, except?: ServiceNeed): ServiceNeed {
    const cls = CLASS_BY_ID[guest.cls];
    const liked = guest.archetype.requests as Partial<Record<ServiceNeed, number>>;
    const weights: Partial<Record<ServiceNeed, number>> = {};
    for (const [need, weight] of Object.entries(cls.requests) as [ServiceNeed, number][]) {
      if (need === except || need === 'turndown') continue;
      weights[need] = weight * (liked[need] ?? 1);
    }
    return this.w.rng.weighted(weights);
  }

  private makeRequest(guest: Guest): void {
    const w = this.w;
    const story = guest.story ? w.meta?.storyRequest(guest.story) : null;
    let request: GuestRequest;
    guest.pending = [];
    if (story) request = story as GuestRequest;
    else {
      // Session 20: now and then the wish is an outing to a venue with room (a coffee, dinner, a drink, the view).
      if (w.venues.tryOuting(guest)) return;
      const bathroomOpen = w.train.bathrooms.some((b) => b.unlocked);
      request = bathroomOpen && w.rng.chance(w.econ.guests.bathroomVisitWeight) ? 'bathroom' : this.classRequest(guest);
      // Royal: the butler's list, two things at once.
      if (request !== 'bathroom' && CLASS_BY_ID[guest.cls].butler) guest.pending = [this.classRequest(guest, request)];
    }
    guest.request = request;
    guest.requestAt = w.time;
    guest.slow = false;
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
    guest.view.showBubble(request, guest.pending.length > 0 ? 'royal' : 'request', 1.85, TIP_RING_STEPS);
    guest.view.act('wave', w.econ.guests.waveSeconds);
    w.audio.play('soft', { volume: 0.5 });
  }

  /** First and Royal: on arriving at the cabin the guest waits by the bed for it to be turned down. */
  private askTurndown(guest: Guest): void {
    const w = this.w;
    guest.request = 'turndown';
    guest.pending = [];
    guest.requestAt = w.time;
    guest.slow = false;
    guest.happyTime = 0;
    this.setState(guest, 'requesting');
    if (guest.cabin) {
      guest.pos.x = guest.cabin.center.x;
      guest.pos.z = guest.cabin.center.z + 0.2;
      guest.mover.facing = -Math.PI / 2;
    }
    guest.view.showBubble('turndown', 'request', 1.85, TIP_RING_STEPS);
    guest.view.act('wave', w.econ.guests.waveSeconds);
  }

  private fulfil(guest: Guest, item: ServiceNeed, byPlayer: boolean): void {
    const w = this.w;
    if (guest.state !== 'requesting' || !guest.cabin) return;
    const service = w.econ.service;
    const elapsed = w.time - guest.requestAt;
    const speed = elapsed <= service.speedySeconds ? service.speedyTipMultiplier : elapsed <= service.quickSeconds ? service.quickTipMultiplier : 1;
    const comfort = guest.cabin ? w.train.cabinTipMultiplier(guest.cabin) : 1;
    const base = item === 'turndown' ? w.econ.classes.turndownTip : w.econ.money.requestTip;
    // Royal: the butler's list pays out with a flourish once everything on it has been brought.
    const listDone = CLASS_BY_ID[guest.cls].butler && guest.pending.length === 0 && item !== 'turndown';
    const butler = listDone ? w.econ.classes.butlerBonus : 1;
    const tip = Math.max(1, Math.round(base * guest.archetype.tipMultiplier * w.tipMultiplier() * comfort * speed * butler));
    w.cash.add(guest.cabin.pileId, tip, this.tmp.set(guest.pos.x, FLOOR_Y + 1.1, guest.pos.z));
    if (byPlayer && speed > 1) {
      w.ui.floatIcon('bolt', guest.pos.x, FLOOR_Y + 2.3, guest.pos.z, speed >= service.speedyTipMultiplier ? 'star' : 'info');
      w.audio.play('sparkle', { pitch: speed >= service.speedyTipMultiplier ? 1.25 : 1 });
    }
    w.addStars(w.econ.stars.requestFulfilled * CLASS_BY_ID[guest.cls].stars, 'request', guest.pos);
    w.particles.emit('heart', guest.pos.x, FLOOR_Y + 1.6, guest.pos.z, 5, 0.2);
    w.audio.play('heart');
    guest.view.bounce(1);
    guest.slow = false;
    w.events.emit('request.fulfilled', { item, tip, x: guest.pos.x, z: guest.pos.z, byPlayer, speedy: speed >= service.speedyTipMultiplier });
    if (guest.story && item !== 'turndown') w.meta?.onStoryRequestDone(guest.story, item);
    w.feedback.onRequestServed(guest, elapsed, byPlayer);
    // The butler's list: the next thing on it straight away.
    const next = guest.pending.shift();
    if (next) {
      guest.request = next;
      guest.requestAt = w.time;
      guest.view.showBubble(next as IconName, guest.pending.length > 0 ? 'royal' : 'request', 1.85, TIP_RING_STEPS);
      return;
    }
    if (listDone) {
      w.ui.floatIcon('crown', guest.pos.x, FLOOR_Y + 2.3, guest.pos.z, 'star');
      w.particles.emit('sparkle', guest.pos.x, FLOOR_Y + 1.6, guest.pos.z, 14, 0.4);
    }
    guest.view.showBubble('heart', 'plain', 1.75);
    guest.happyTime = w.econ.guests.enjoySeconds;
    // They enjoy it where you can see it: a sip of the tea, coffee or champagne, a hug of the pillow or blanket.
    guest.view.act(item === 'tea' || item === 'coffee' || item === 'champagne' ? 'sip' : 'hug', w.econ.guests.enjoySeconds);
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
    guest.complained = false;
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

  /** The venue moves a guest on their outing from state to state. */
  setOutingState(guest: Guest, state: GuestState): void {
    this.setState(guest, state);
  }

  /** Back from a venue: to bed (or off the train, if their stop has come). */
  returnFromOuting(guest: Guest): void {
    this.returnToCabin(guest);
  }

  private returnToCabin(guest: Guest): void {
    const w = this.w;
    guest.view.showBubble(null);
    if (!guest.cabin) {
      this.destroy(guest);
      return;
    }
    // If their stop came while they were in the bathroom, they alight now. They are out of the washroom
    // first: alighting refuses anyone still in one, which once held them there for the whole stop.
    if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen) {
      this.setState(guest, 'returning');
      this.startAlighting(guest);
      return;
    }
    this.setState(guest, 'returning');
    const from = w.map.nearestNode(guest.pos.x, guest.pos.z);
    const path = from ? w.map.nav.findPath(from, guest.cabin.node) : null;
    const cabin = guest.cabin;
    guest.mover.go([...(path ?? []), cabin.bedSide], () => {
      this.setState(guest, 'settling');
      guest.settleFor = RETURN_SETTLE_SECONDS;
      guest.nextRequestIn = w.rng.range(...w.econ.guests.requestInterval);
    });
  }

  private checkIn(guest: Guest, cabin: Cabin, actor: Actor): void {
    const w = this.w;
    const money = w.econ.money;
    const doubled = w.data.monetization.doubleFaresStop !== null && w.data.monetization.doubleFaresStop >= w.journey.stopSerial;
    const fare = Math.round(money.baseFare * w.train.fareMultiplier(cabin) * guest.archetype.fareMultiplier * w.fareMultiplier() * (doubled ? 2 : 1));
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
    // The opening is scripted: everyone gets off at the next stop, so cabins turn over on time, every time.
    const early = w.data.route.stopsCompleted < w.econ.guests.earlyStopsOneLeg;
    const legs = early ? 1 : Number(w.rng.weighted(w.econ.guests.rideLegsWeights as unknown as Record<string, number>));
    guest.destinationStop = w.journey.stopSerial + (guest.story ? 2 : legs);
    this.setState(guest, 'toCabin');
    const deskNode = 'c0:desk';
    const path = w.map.nav.findPath(w.map.nearestNode(guest.pos.x, guest.pos.z) ?? deskNode, cabin.node);
    guest.mover.go([...(path ?? []), cabin.bedSide], () => {
      const first = w.econ.guests.firstRequestDelay;
      guest.nextRequestIn = w.rng.range(first[0], first[1]);
      // First and Royal: the bed is turned down before they turn in.
      if (CLASS_BY_ID[guest.cls].turndown && !guest.story) {
        this.askTurndown(guest);
        return;
      }
      // They sit on the edge of the bed with the paper for a moment before turning in.
      this.setState(guest, 'settling');
      guest.settleFor = w.econ.guests.settleSeconds;
    });
    w.events.emit('guest.checkedIn', { fare, x: guest.pos.x, z: guest.pos.z, byPlayer: actor.isPlayer });
    if (guest.story) w.meta?.onStoryGuestCheckedIn(guest.story);
    w.feedback.onCheckIn(guest);
  }

  /** What this guest leaves behind: a few things only their kind would (a teddy, a map, petals) and an unmade bed. */
  private messFor(guest: Guest): { pieces: MessPiece[]; bed: (typeof BED_MESS)[number]; seed: number } {
    const w = this.w;
    const rules = w.econ.mess;
    const pool = [...guest.archetype.mess];
    const count = Math.min(pool.length, w.rng.int(rules.minPieces, rules.maxPieces));
    const pieces: MessPiece[] = [];
    while (pieces.length < count) pieces.push(pool.splice(Math.floor(w.rng.next() * pool.length), 1)[0]);
    if (w.rng.chance(rules.commonChance)) {
      const extra = w.rng.pick(COMMON_MESS);
      if (!pieces.includes(extra)) pieces[pieces.length - 1] = extra;
    }
    return { pieces, bed: w.rng.pick(BED_MESS), seed: w.rng.int(1, 1e6) };
  }

  private startAlighting(guest: Guest): void {
    const w = this.w;
    if (!guest.cabin || guest.state === 'alighting' || guest.state === 'leaving' || guest.state === 'gone') return;
    if (guest.state === 'toBathroom' || guest.state === 'waitingBathroom' || guest.state === 'inBathroom') return;
    if (!w.journey.doorsOpen) return;
    const cabin = guest.cabin;
    const fromBed = guest.inCabin;
    // They leave a tip and a lived-in cabin behind.
    let tip = w.econ.money.alightTip * guest.archetype.tipMultiplier * w.tipMultiplier() * w.train.cabinTipMultiplier(cabin);
    if (w.train.luggageStored > 0) {
      w.train.luggageStored--;
      tip += w.econ.money.luggageTip;
    }
    const tipAmount = Math.max(1, Math.round(tip));
    w.cash.add(cabin.pileId, tipAmount, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
    cabin.messPlan = this.messFor(guest);
    cabin.dirty.fill(true);
    w.station.recordTip(tipAmount);
    guest.request = null;
    this.setState(guest, 'alighting');
    guest.view.act('wave', 1.2);
    guest.view.showBubble(null);
    const door = w.map.doors()[0];
    // From the bed, or from wherever they are (a washroom, the corridor): a path from the cabin's node would
    // have them walk straight through the walls to reach it.
    const from = fromBed ? cabin.node : (w.map.nearestNode(guest.pos.x, guest.pos.z) ?? cabin.node);
    const path = w.map.nav.findPath(from, door.outsideNode);
    const exit = { x: door.outside.x + 2.2, z: door.outside.z - 3 - w.rng.next() * 3 };
    guest.mover.go([...(path ?? [door.inside, door.outside]), exit], () => this.finishAlighting(guest, false));
    w.feedback.onAlight(guest);
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
    guest.mover.facing = this.queueFacing(guest.queueSlot);
  }

  /** Everyone in line faces the place ahead of them (the first faces the desk): an orderly queue. */
  private queueFacing(slot: number): number {
    if (slot <= 0) return -Math.PI / 2;
    const here = this.slotPosition(slot);
    const ahead = this.slotPosition(slot - 1);
    return Math.atan2(ahead.x - here.x, ahead.z - here.z);
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

  /** Someone who travels in this class (a VIP boost from the billboards favours the grandest of them). */
  private pickArchetype(cls: ClassId, force?: string): ArchetypeDef {
    if (force) return ARCHETYPES.find((a) => a.id === force) ?? ARCHETYPES[0];
    const weights: Record<string, number> = {};
    const vipBoost = 1 + this.w.stationPerks().vip;
    for (const a of ARCHETYPES) if (a.cls === cls) weights[a.id] = a.id === 'vip' || a.id === 'celebrity' ? a.weight * vipBoost : a.weight;
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
    this.w.venues?.releaseGuest(guest);
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

  /**
   * A carriage was rebuilt to a new floor plan (a class refit): everyone who had a room there gets one in the
   * new plan, then any free room of their class elsewhere, then any free room; anyone left over (a Basic carriage
   * of six berths becoming four cabins, every other room full) is thanked with a generous tip and set down at
   * the next stop off-screen. Guests keep what they were doing; sleepers stay asleep, in their new bed.
   */
  rehome(oldCabins: readonly Cabin[], fresh: readonly Cabin[]): void {
    const w = this.w;
    const moving = this.list.filter((g) => g.cabin && oldCabins.includes(g.cabin));
    // Those already in bed first, so the sleepers are the ones who keep a room in this carriage.
    moving.sort((a, b) => Number(b.inCabin) - Number(a.inCabin));
    for (const guest of moving) {
      const from = guest.cabin as Cabin;
      if (from.guest === guest) from.guest = null;
      const room = fresh.find((c) => c.isFree) ?? w.train.freeCabin(guest.cls) ?? w.train.cabins.find((c) => c.isFree) ?? null;
      if (!room) {
        // No room anywhere: a thank-you tip where they were, and they slip away.
        const tip = Math.round(w.econ.money.alightTip * 2 * w.train.fareMultiplier(from));
        const pile = fresh[0]?.pileId;
        if (pile) w.cash.add(pile, tip, new THREE.Vector3(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
        w.particles.emit('sparkle', guest.pos.x, FLOOR_Y + 0.8, guest.pos.z, 10, 0.4);
        guest.cabin = null;
        this.destroy(guest);
        continue;
      }
      room.guest = guest;
      guest.cabin = room;
      if (guest.inCabin) {
        guest.pos.x = room.bedSide.x;
        guest.pos.z = room.bedSide.z;
        guest.mover.stop();
      } else if (guest.state === 'toCabin') {
        const path = w.map.nav.findPath(w.map.nearestNode(guest.pos.x, guest.pos.z) ?? room.node, room.node);
        guest.mover.go([...(path ?? []), room.bedSide], () => {
          this.setState(guest, 'settling');
          guest.settleFor = w.econ.guests.settleSeconds;
        });
      }
    }
  }

  /** Guests (of one class, or all) who will still be aboard after this stop (for sizing the platform crowd). */
  stayingPast(stopSerial: number, cls?: ClassId): number {
    let n = 0;
    for (const g of this.list) {
      if (cls && g.cls !== cls) continue;
      // Deck passengers get off at the first stop: they never hold a bed past it.
      if (g.aboard && (g.cabin === null ? g.state !== 'platform' : g.destinationStop > stopSerial)) n++;
    }
    return n;
  }
}
