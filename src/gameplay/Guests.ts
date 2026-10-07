import * as THREE from 'three';
import { ARCHETYPES, COMMON_MESS, type ArchetypeDef, type MessPiece, type StoryDef } from '../config/content';
import { CLASS_BY_ID, isDwellNeed, type ClassId, type ServiceNeed } from '../config/classes';
import { CROWD, IDLES, type IdleAction } from '../config/crowd';
import { log } from '../core/log';
import type { Vec2 } from '../core/types';
import { freshWish, nextTripPhase, rideProgress, type TripPhase } from '../sim/trip';
import type { IconName } from '../ui/icons';
import { BED_TOP, FLOOR_Y } from '../world/CarriageView';
import { CharacterView, type CharacterLook } from '../world/CharacterView';
import { BED_MESS } from '../world/Mess';
import { PLATFORM, QUEUE_SPOTS, queueSpot, waitingSpot } from '../world/platformLayout';
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
/** A guest back from the washroom or a venue sits a moment before anything else. */
const RETURN_SETTLE_SECONDS = 0.8;
/** Waking up: a stretch on the edge of the bed before the morning's request. */
const WAKE_SECONDS = 1.2;
/** How each part of a guest's trip is named in the debug log (the design's words). */
const TRIP_LOG: Record<TripPhase | 'boarding' | 'arrival', string> = {
  boarding: 'boarding', evening: 'settling in', night: 'lights out', morning: 'wake-up', arrival: 'arrival',
};
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
  /** Seconds to sit on the bed edge (reading) before anything else. */
  settleFor = 0;
  destinationStop = Infinity;
  /**
   * Session 22, one trip and one sleep: the stop they boarded at, which part of the night it is for them
   * (evening, night, morning: never back), whether this part's request and outing have happened, seconds
   * until the request, what they have asked for (never the same thing twice), and counts for the trip audit.
   */
  boardStop = 0;
  trip: TripPhase = 'evening';
  phaseRequested = false;
  phaseOuting = false;
  wishIn = 0;
  readonly asked = new Set<ServiceNeed>();
  sleptFor = 0;
  sleeps = 0;
  washes = 0;
  /** This guest's own bedtime and waking (the trip's shares, moved a little per guest). */
  readonly rules = { eveningEnd: 0.4, morningStart: 0.64, minSleepSeconds: 4 };
  happyTime = 0;
  hasLuggage = false;
  readonly childPos: Vec2;
  /** The class on their ticket: they board only a carriage of this class. */
  cls: ClassId;
  /** Royal, in the morning: the rest of the butler's list (asked for one after another, paid as one generous tip). */
  pending: ServiceNeed[] = [];
  /** On an outing to a venue carriage (session 20): where, which seat, seated yet, paid yet. */
  outing: Outing | null = null;
  /**
   * Session 22: paid their fare at the ticket booth. Their room ready, they walk straight to it; not yet, they wait
   * (on the platform while the opening's carriage is covered, else in the lobby's waiting line) and walk to it by
   * themselves once it is made up.
   */
  paid = false;
  /** Session 24: booked a table at the desk for the evening; their evening outing goes to a venue. */
  booked = false;
  /**
   * Session 23, the ticket queue: where on the platform they are headed (`q0` the window, `q3` fourth in line,
   * `w1` the second place by the bench, `d` by the door with a ticket), whether they have got there, and the
   * order they arrived in (the queue keeps it).
   */
  spot: string | null = null;
  atSpot = false;
  order = 0;
  /** Just came out of the station house: walks in along the walkway first. */
  late = false;
  /** Session 23: what they do while standing about, for how much longer, and when the next one comes. */
  idleAct: IdleAction = 'watch';
  idleLeft = 0;
  idleIn = 1 + Math.random() * 3;

  constructor(readonly archetype: ArchetypeDef, x: number, z: number, speed: number, readonly story: StoryDef | null, variant = 0) {
    this.cls = archetype.cls;
    this.pos = { x, z };
    this.childPos = { x, z: z + 0.6 };
    this.mover = new Mover(this.pos, speed);
    const colors = story ? story.colors : archetype.colors;
    const base: CharacterLook = {
      ...colors,
      accessory: story ? (story.id === 'priya' ? 'camera' : 'none') : archetype.accessory === 'child' ? 'none' : archetype.accessory,
      hat: story?.id === 'walter' ? 'conductor' : story ? 'none' : archetype.hat ?? 'none',
      hatColor: story ? undefined : archetype.hatColor,
    };
    const look = story ? base : guestLook(base, archetype, variant);
    const [short, tall] = CROWD.height;
    this.view = new CharacterView(look, story ? 1 : short + (tall - short) * Math.random());
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
 * One of a guest type's few looks (session 23): look 0 is the type's own; the others change the skin tone, the
 * hair (never a grandma's silver), the coat's shade, add spectacles or long hair, and sometimes leave the hat off.
 * The bounded set keeps the body geometries cached (types × variants).
 */
function guestLook(base: CharacterLook, archetype: ArchetypeDef, v: number): CharacterLook {
  if (v === 0) return base;
  const a = ARCHETYPES.indexOf(archetype);
  const silver = /^#(E|F)/i.test(archetype.colors.hair);
  const casualHat = base.hat === 'cap' || base.hat === 'beanie' || base.hat === 'boater';
  return {
    ...base,
    skin: CROWD.skinTones[(a * 3 + v * 2) % CROWD.skinTones.length],
    hair: silver ? base.hair : CROWD.hairColours[(a + v * 2) % CROWD.hairColours.length],
    body: v === 2 ? shadeHex(base.body, 18) : v === 3 ? shadeHex(base.body, -16) : base.body,
    hat: v === 3 && casualHat ? 'none' : base.hat,
    glasses: (a + v) % 3 === 0,
    longHair: v % 2 === 1 && base.hat !== 'bun' && base.hat !== 'crown',
  };
}

/** A hex colour lightened (+) or darkened (−) by `amount` per channel. */
function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
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
  /**
   * The trip audit (session 22; the smoke run reads it): guests whose trip began, any who slept twice, any request
   * repeated or out of its part of the night or class.
   */
  readonly audit = { trips: 0, sleeps: 0, sleptTwice: 0, repeats: 0, misplaced: 0, requests: 0 };
  /** Arrival order on the platform (the queue keeps it). */
  private arrivals = 0;
  /** Guests created so far: their look variant turns over with it (no game randomness). */
  private looks = 0;

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
      guest.order = this.arrivals++;
      guest.mover.facing = -Math.PI / 2 + (this.w.rng.next() - 0.5) * 0.8;
      // Bags join the flow from the second station (config: flow); they wait on the luggage barrow.
      guest.hasLuggage = this.w.flow.allows('luggage') && this.w.rng.chance(this.w.econ.guests.luggageChance);
      created.push(guest);
    });
    // Everyone straight to their place: the queue at the ticket stand, or the bench if there is no bed for them.
    this.arrangePlatform(true);
    return created;
  }

  /**
   * A traveller who arrives during the stop (session 23: the platform comes alive): out of the station house
   * doors, in through the gate and along the walkway to the end of the queue (or the bench). They carry their own
   * small bag.
   */
  spawnLatecomer(cls: ClassId, archetype?: string): Guest {
    const door = PLATFORM.houseDoor;
    const guest = this.create(this.pickArchetype(cls, archetype), door.x, door.z, null);
    guest.cls = cls;
    guest.state = 'platform';
    guest.onPlatform = true;
    guest.order = this.arrivals++;
    guest.late = true;
    guest.mover.facing = -Math.PI / 2;
    this.arrangePlatform(false);
    return guest;
  }

  /**
   * Where everyone on the platform stands (session 23): travellers with a bed this stop queue at the ticket stand
   * in the order they arrived, the rest wait by the bench with a "no room" sign; when a bed opens they walk over and
   * join the queue's end, and the queue moves up as each ticket is sold. `snap` puts them there at once.
   */
  arrangePlatform(snap: boolean): void {
    const w = this.w;
    const j = w.journey;
    const serial = j.phase === 'stationStop' ? j.stopSerial : j.stopSerial + 1;
    const prologue = w.station.prologue;
    const waiting = this.list.filter((g) => g.state === 'platform' && !g.paid);
    waiting.sort((a, b) => a.order - b.order);
    this.bedsLeft.clear();
    let q = 0;
    let k = 0;
    for (const guest of waiting) {
      let eligible = prologue;
      if (!prologue) {
        if (!this.bedsLeft.has(guest.cls)) this.bedsLeft.set(guest.cls, this.bedsFree(serial, guest.cls));
        const beds = this.bedsLeft.get(guest.cls) ?? 0;
        eligible = beds > 0;
        if (eligible) this.bedsLeft.set(guest.cls, beds - 1);
      }
      // A ticket in their class's colour, or a "no room" sign: they cannot board this time.
      if (eligible) guest.view.showBubble('ticket', guest.cls, 1.85);
      else guest.view.showBubble('noroom', 'alert', 1.85);
      const key = eligible && q < QUEUE_SPOTS ? `q${q++}` : `w${k++}`;
      if (key !== guest.spot) this.sendToSpot(guest, key, snap);
    }
  }

  private spotPosition(key: string): Vec2 {
    const i = Number(key.slice(1));
    return key[0] === 'q' ? queueSpot(i) : waitingSpot(i);
  }

  /** Each place in the queue faces the one ahead of it (the window faces the counter); the bench faces the train. */
  private spotFacing(key: string): number {
    if (key[0] === 'w') return -Math.PI / 2 + (Number(key.slice(1)) % 3 - 1) * 0.35;
    const i = Number(key.slice(1));
    if (i === 0) return Math.PI / 2;
    const here = queueSpot(i);
    const ahead = queueSpot(i - 1);
    return Math.atan2(ahead.x - here.x, ahead.z - here.z);
  }

  private sendToSpot(guest: Guest, key: string, snap: boolean): void {
    const target = this.spotPosition(key);
    guest.spot = key;
    guest.atSpot = false;
    const arrive = (): void => {
      guest.atSpot = true;
      guest.stateTime = 0;
      guest.mover.facing = this.spotFacing(key);
    };
    if (snap) {
      guest.mover.stop();
      guest.pos.x = target.x;
      guest.pos.z = target.z;
      arrive();
      return;
    }
    // Out of the station house they come along the walkway first, then over to their place.
    const route = guest.late ? [PLATFORM.entrance, PLATFORM.concourse[2], target] : [target];
    guest.late = false;
    guest.mover.go(route, arrive);
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

  /** The traveller at the ticket stand's window, if they have reached it (and the platform is alongside). */
  private atWindow(): Guest | null {
    if (this.w.journey.phase !== 'stationStop') return null;
    return this.list.find((g) => g.state === 'platform' && !g.paid && g.spot === 'q0' && g.atSpot) ?? null;
  }

  /** Someone is queueing for a ticket (the window's pad lights up as they step up to it). */
  canBoard(): boolean {
    if (this.w.journey.phase !== 'stationStop') return false;
    return this.list.some((g) => g.state === 'platform' && !g.paid && g.spot === 'q0');
  }

  /** Someone on the platform has a bed of their class this stop (they are in the ticket queue). */
  hasBoarder(): boolean {
    return this.list.some((g) => g.state === 'platform' && !g.paid && g.spot !== null && g.spot[0] === 'q');
  }

  /**
   * The ticket stand (session 22; session 23: a queue at its window): the traveller at the window pays their fare
   * and walks back along the platform to the door and on to their room (in the opening, while the carriage is still
   * covered, they wait by its door with their ticket). The queue moves up behind them.
   */
  boardNext(byPlayer = false): Guest | null {
    const w = this.w;
    const guest = this.atWindow();
    if (!guest) return null;
    // The fare is that of a room of their class (theirs once one is ready).
    const room = w.train.freeCabin(guest.cls) ?? w.train.cabins.find((c) => w.train.cabinClass(c) === guest.cls) ?? w.train.cabins[0];
    if (!room) return null;
    this.sellTicket(guest, room, byPlayer);
    guest.paid = true;
    guest.spot = null;
    this.boardPaid(guest);
    this.arrangePlatform(false);
    return guest;
  }

  /**
   * A paid traveller boards: in through the door to the reception desk's line, where they are handed the key to a
   * room of their class (session 24: the ticket stand sells the fare, the desk checks them in). While the opening's
   * carriage is still covered they wait by its door.
   */
  private boardPaid(guest: Guest): void {
    const w = this.w;
    // While the opening's carriage is covered, and while it comes open (the doors open last), they wait by its door.
    if (w.train.covered || w.reveal?.busy) {
      if (guest.spot === 'd') return;
      const waiting = this.list.filter((g) => g.state === 'platform' && g.paid && g.spot === 'd').length;
      const spot = PLATFORM.doorWait[waiting % PLATFORM.doorWait.length];
      guest.spot = 'd';
      guest.atSpot = false;
      guest.mover.go([PLATFORM.toDoor, spot], () => {
        guest.atSpot = true;
        guest.mover.facing = -Math.PI / 2;
      });
      return;
    }
    if (!w.journey.doorsOpen) return;
    const door = w.map.doors()[0];
    guest.onPlatform = false;
    guest.spot = null;
    guest.view.showBubble(null);
    guest.state = 'boarding';
    guest.stateTime = 0;
    guest.queueSlot = this.queue.length;
    guest.arrivedInQueue = false;
    this.queue.push(guest);
    guest.mover.go([...this.toTheDoor(guest), door.outside, door.inside, this.slotPosition(guest.queueSlot)], () => this.arriveInQueue(guest));
  }

  /** From the ticket queue's side of the platform, back along the edge toward the door. */
  private toTheDoor(guest: Guest): Vec2[] {
    return guest.pos.z < PLATFORM.toDoor.z - 0.3 ? [PLATFORM.toDoor] : [];
  }

  /**
   * What a traveller's ticket would have cost (session 24: shown on the result card when they miss the train,
   * never taken): a free room of their class if there is one, else their class's own fare.
   */
  estimatedFare(guest: Guest): number {
    const w = this.w;
    const room = w.train.freeCabin(guest.cls);
    const multiplier = room ? w.train.fareMultiplier(room) : CLASS_BY_ID[guest.cls].fare;
    return Math.round(w.econ.money.baseFare * multiplier * guest.archetype.fareMultiplier * w.fareMultiplier());
  }

  /** The fare, paid at the booth: cash on the booth's pile, the bell, a little bounce. */
  private sellTicket(guest: Guest, cabin: Cabin, byPlayer: boolean): void {
    const w = this.w;
    const money = w.econ.money;
    const doubled = w.data.monetization.doubleFaresStop !== null && w.data.monetization.doubleFaresStop >= w.journey.stopSerial;
    const fare = Math.round(money.baseFare * w.train.fareMultiplier(cabin) * guest.archetype.fareMultiplier * w.fareMultiplier() * (doubled ? 2 : 1));
    w.cash.add('booth', fare, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z + w.station.platformOffset));
    w.audio.play('bell');
    w.haptics.light();
    w.ui.floatText(`+${fare}`, guest.pos.x, FLOOR_Y + 1.9, guest.pos.z + w.station.platformOffset, 'cash');
    guest.view.bounce(0.7);
    guest.view.act('wave', 0.8);
    w.events.emit('guest.boarded', { byPlayer });
    w.events.emit('guest.checkedIn', { fare, x: guest.pos.x, z: guest.pos.z, byPlayer });
    if (guest.story) w.meta?.onStoryGuestCheckedIn(guest.story);
    w.feedback.onCheckIn(guest);
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

  /** Desk zone: hand the first guest the key to a clean cabin of their class, if there is one. */
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
    if (isDwellNeed(need)) {
      // Turning the bed down (folding the cover back, a chocolate on the pillow) or a wake-up call (a knock at
      // the door): a moment at the room, nothing to carry.
      const seconds = need === 'turndown' ? this.w.econ.classes.turndownSeconds : this.w.econ.trip.wakeupSeconds;
      zone.progress += (dt / seconds) * actor.workMultiplier;
      actor.view.act(need === 'turndown' ? 'hug' : 'wave');
      if (zone.progress < 1) return true;
      zone.progress = 0;
      const guest = cabin.guest!;
      guest.request = null;
      this.w.audio.play('soft', { volume: 0.6, pitch: 1.2 });
      this.fulfil(guest, need, actor.isPlayer);
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
    // Nobody who has paid is left behind: anyone with a ticket still on the platform steps aboard to wait.
    for (const guest of [...this.list]) {
      if (guest.state !== 'platform' || !guest.paid) continue;
      guest.pos.x = door.outside.x;
      guest.pos.z = door.outside.z;
      guest.onPlatform = false;
      guest.state = 'boarding';
      guest.queueSlot = this.queue.length;
      guest.arrivedInQueue = false;
      this.queue.push(guest);
    }
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
    // Everyone on the platform is in their place: the ticket queue (a ticket in their class's colour) or the
    // bench (a "no room" sign: no bed for them this time). Paid travellers board once the train is open.
    if (this.list.some((g) => g.state === 'platform')) this.arrangePlatform(false);
    for (const guest of this.list) {
      if (guest.state !== 'platform' || !guest.paid) continue;
      guest.view.showBubble('check', 'plain', 1.85);
      this.boardPaid(guest);
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
        // New aboard, they read the paper before turning in; up in the morning, a big stretch.
        if (guest.settleFor > 1) guest.view.act(guest.sleeps > 0 ? 'yawn' : 'read', 0.3);
      } else {
        guest.view.setPose('stand');
        guest.view.setPosition(guest.pos.x, y, z);
        guest.view.setFacing(guest.mover.facing);
        this.idleAction(guest, dt);
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

  /** What someone standing about does: waves at the train coming in, washes at the sink, and otherwise their own idles. */
  private idleAction(guest: Guest, dt: number): void {
    const w = this.w;
    if (guest.mover.isMoving) {
      guest.idleLeft = 0;
      guest.idleIn = Math.max(guest.idleIn, 1.2);
      return;
    }
    switch (guest.state) {
      case 'platform':
        if (w.journey.phase === 'arriving') guest.view.act('wave', 0.3);
        else if (guest.stateTime > 1.5) this.idle(guest, dt);
        break;
      case 'queue':
        if (guest.arrivedInQueue && guest.stateTime > 2) this.idle(guest, dt);
        break;
      case 'venueQueue':
        if (guest.stateTime > 2.5) this.idle(guest, dt);
        break;
      case 'inBathroom':
        guest.view.act('wash', 0.3);
        break;
    }
  }

  /**
   * Session 23, a livelier crowd: every few seconds someone waiting does something that suits them (checks the
   * time, looks about, takes a call), and two people standing together now and then chat. Visual only: it uses
   * no game randomness, so the simulation is the same with or without it.
   */
  private idle(guest: Guest, dt: number): void {
    if (guest.idleLeft > 0) {
      guest.idleLeft -= dt;
      guest.view.act(guest.idleAct, 0.3);
      return;
    }
    guest.idleIn -= dt;
    if (guest.idleIn > 0) return;
    const [g0, g1] = CROWD.idleGap;
    const [s0, s1] = CROWD.idleSeconds;
    const seconds = s0 + (s1 - s0) * Math.random();
    const list = IDLES[guest.archetype.id] ?? ['watch', 'look'];
    let act = list[Math.floor(Math.random() * list.length)];
    if (Math.random() < CROWD.chatChance) {
      const near = this.list.find((o) => o !== guest && o.state === guest.state && !o.mover.isMoving && o.idleLeft <= 0
        && Math.hypot(o.pos.x - guest.pos.x, o.pos.z - guest.pos.z) < CROWD.chatDistance);
      if (near) {
        act = 'chat';
        near.idleAct = 'chat';
        near.idleLeft = seconds;
        near.idleIn = g0 + (g1 - g0) * Math.random();
      }
    }
    guest.idleAct = act;
    guest.idleLeft = seconds;
    guest.idleIn = g0 + (g1 - g0) * Math.random();
  }

  private think(guest: Guest, dt: number): void {
    const w = this.w;
    if (OUTING_STATES.has(guest.state)) {
      w.venues.thinkGuest(guest, dt);
      return;
    }
    switch (guest.state) {
      case 'queue':
        // Waiting at the desk for a key: the first in line shows it once a room of their class is made up.
        if (guest.queueSlot !== 0 || !guest.arrivedInQueue) guest.view.showBubble(null);
        else if (w.train.freeCabin(guest.cls)) guest.view.showBubble('key', guest.cls);
        else guest.view.showBubble('noroom', 'alert');
        break;
      case 'settling': {
        // Awake in their room (evening or morning), sitting on the bed. Their stop may have come: off they get.
        if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen) {
          this.startAlighting(guest);
          break;
        }
        if (this.advanceTrip(guest, guest.stateTime < guest.settleFor)) break;
        if (!guest.phaseRequested) {
          // Reading on the bed edge counts toward the request.
          guest.wishIn -= dt;
          if (guest.wishIn <= 0 && this.requestsAllowed()) this.makeRequest(guest);
        } else if (!guest.phaseOuting && guest.stateTime >= guest.settleFor) this.maybeOuting(guest);
        break;
      }
      case 'resting':
        // Asleep: the only lights out of their trip. Their stop may have come while they slept: off they get.
        if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen) {
          this.startAlighting(guest);
          break;
        }
        guest.view.showBubble('zzz', 'plain', 1.3);
        guest.sleptFor += dt;
        this.advanceTrip(guest, false);
        break;
      case 'requesting':
        if (guest.destinationStop <= w.journey.stopSerial && w.journey.doorsOpen && guest.happyTime <= 0) {
          this.startAlighting(guest);
        } else if (guest.happyTime > 0) {
          guest.happyTime -= dt;
          if (guest.happyTime <= 0) this.afterRequest(guest);
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

  /** How far through their ride a guest is (0 when they board, 1 pulling into their stop). */
  progressOf(guest: Guest): number {
    if (!Number.isFinite(guest.destinationStop)) return 0;
    const j = this.w.journey;
    return rideProgress(guest.boardStop, guest.destinationStop, j.stopSerial, j.travelShare);
  }

  /**
   * Moves a guest on to the next part of their night when it is time (see sim/trip.ts), never back: lights out
   * once nothing is pending, the morning once the night has run. True when they changed.
   */
  private advanceTrip(guest: Guest, busy: boolean): boolean {
    const rules = this.w.econ.trip;
    const progress = this.progressOf(guest);
    const next = nextTripPhase(guest.trip, progress, busy, guest.sleptFor, guest.rules);
    if (next === guest.trip) return false;
    this.logTrip(guest, guest.trip, next, progress);
    guest.trip = next;
    guest.phaseRequested = false;
    guest.phaseOuting = false;
    guest.request = null;
    guest.pending = [];
    if (next === 'night') {
      // Lights out: they lie down, the room dims and the blind comes down (TrainState shows it).
      guest.sleptFor = 0;
      guest.sleeps++;
      this.audit.sleeps++;
      if (guest.sleeps > 1) this.audit.sleptTwice++;
      this.setState(guest, 'resting');
      guest.view.showBubble(null);
    } else {
      // Morning: the lights come up, a stretch on the bed edge, then the morning's request.
      this.setState(guest, 'settling');
      guest.settleFor = WAKE_SECONDS;
      guest.wishIn = WAKE_SECONDS + this.w.rng.range(...rules.requestDelay);
      guest.view.showBubble(null);
      guest.view.bounce(0.5);
    }
    return true;
  }

  private logTrip(guest: Guest, from: TripPhase | 'boarding', to: TripPhase | 'arrival', progress: number): void {
    log.info('Trip', `guest ${guest.id} (${guest.archetype.id}, ${guest.cls}): ${TRIP_LOG[from]} → ${TRIP_LOG[to]} at ${Math.round(progress * 100)}% (stop ${this.w.journey.stopSerial}, ride ${guest.boardStop}→${guest.destinationStop})`);
  }

  /**
   * This part of the night's one request: their story's next step, or one thing from their class's evening or
   * morning list they have not asked for yet. Royal mornings bring the butler's whole list, one after another.
   */
  private makeRequest(guest: Guest): void {
    const w = this.w;
    guest.phaseRequested = true;
    guest.pending = [];
    const story = guest.story ? (w.meta?.storyRequest(guest.story) as ServiceNeed | null) : null;
    let need: ServiceNeed | null = story;
    if (!need) {
      const cls = CLASS_BY_ID[guest.cls];
      const pool = guest.trip === 'morning' ? cls.morning : cls.evening;
      if (cls.butler && guest.trip === 'morning') {
        const list = (Object.keys(pool) as ServiceNeed[]).filter((k) => !guest.asked.has(k));
        need = list.shift() ?? null;
        guest.pending = list;
      } else need = freshWish(pool, guest.asked, w.rng.next());
      // The audit: a class request must come from this part of the night's list.
      if (need && !(need in pool)) this.audit.misplaced++;
    }
    if (!need) return;
    for (const n of [need, ...guest.pending]) {
      if (guest.asked.has(n)) this.audit.repeats++;
      guest.asked.add(n);
    }
    this.audit.requests++;
    guest.request = need;
    guest.requestAt = w.time;
    guest.slow = false;
    this.setState(guest, 'requesting');
    guest.happyTime = 0;
    if (guest.cabin) {
      guest.pos.x = guest.cabin.center.x;
      guest.pos.z = guest.cabin.center.z + 0.2;
      guest.mover.facing = -Math.PI / 2;
    }
    guest.view.showBubble(need as IconName, guest.pending.length > 0 ? 'royal' : 'request', 1.85, TIP_RING_STEPS);
    guest.view.act('wave', w.econ.guests.waveSeconds);
    w.audio.play('soft', { volume: 0.5 });
  }

  /**
   * After their request, now and then an outing: a venue that suits the time of night with a free seat, or else
   * a wash (at most once a trip). Never during the night.
   */
  private maybeOuting(guest: Guest): void {
    const w = this.w;
    const rules = w.econ.trip;
    guest.phaseOuting = true;
    // A table booked at the desk is kept (session 24): the evening's outing, if a seat is free.
    if (guest.booked && guest.trip === 'evening' && w.venues.tryOuting(guest, 'evening')) {
      guest.booked = false;
      return;
    }
    if (guest.story || !w.rng.chance(rules.outingChance)) return;
    if (guest.trip !== 'night' && w.venues.tryOuting(guest, guest.trip)) return;
    const bathroomOpen = w.train.bathrooms.some((b) => b.unlocked);
    if (!bathroomOpen || guest.washes >= rules.washroomsPerTrip || !w.rng.chance(rules.washroomChance)) return;
    guest.washes++;
    guest.request = 'bathroom';
    guest.requestAt = w.time;
    guest.slow = false;
    this.goToBathroom(guest);
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
    if (guest.story && !isDwellNeed(item)) w.meta?.onStoryRequestDone(guest.story, item);
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
    // The turndown leaves a chocolate on the pillow.
    if (item === 'turndown') w.ui.floatIcon('turndown', guest.pos.x, FLOOR_Y + 2.3, guest.pos.z, 'info');
    guest.view.showBubble('heart', 'plain', 1.75);
    guest.happyTime = w.econ.guests.enjoySeconds;
    // They enjoy it where you can see it: a sip of the tea, coffee or champagne, the paper read, a hug of the blanket.
    const drink = item === 'tea' || item === 'coffee' || item === 'champagne' || item === 'breakfast';
    guest.view.act(drink ? 'sip' : item === 'newspaper' ? 'read' : item === 'wakeup' ? 'wave' : 'hug', w.econ.guests.enjoySeconds);
  }

  /** Served: they sit back on the bed (the night comes when it is time, see advanceTrip). */
  private afterRequest(guest: Guest): void {
    this.setState(guest, 'settling');
    guest.settleFor = 0;
    guest.view.showBubble(null);
  }

  private goToBathroom(guest: Guest): void {
    const bath = this.pickBathroom();
    if (!bath) {
      guest.request = null;
      this.afterRequest(guest);
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
    });
  }

  /**
   * Check-in (session 24): the fare was paid at the ticket stand, so the desk hands over the cabin key (no second
   * payment) and, now and then, books the guest a table for the evening in a venue: the desk's one extra, a small
   * fee of its own. Then the guest walks to their room.
   */
  private checkIn(guest: Guest, cabin: Cabin, actor: Actor): void {
    const w = this.w;
    const desk = w.econ.desk;
    w.audio.play('ding', { pitch: 1.15 });
    w.audio.play('pop', { pitch: 1.2, volume: 0.6 });
    w.haptics.light();
    w.ui.floatIcon('key', guest.pos.x, FLOOR_Y + 1.9, guest.pos.z, 'info');
    guest.view.bounce(0.7);
    actor.view.bounce(0.4);
    const venue = !guest.story && w.venues.bookable();
    const booked = !!venue && w.rng.chance(desk.reserveChance);
    if (venue && booked) {
      const fee = Math.max(1, Math.round(desk.reserveFee * CLASS_BY_ID[guest.cls].tip * w.tipMultiplier()));
      guest.booked = true;
      w.cash.add('desk', fee, this.tmp.set(guest.pos.x, FLOOR_Y + 1, guest.pos.z));
      w.ui.floatText(`+${fee}`, guest.pos.x, FLOOR_Y + 2.3, guest.pos.z, 'cash');
      guest.view.showBubble(venue, 'intent', 1.85);
      guest.view.act('wave', 0.8);
    } else {
      guest.view.showBubble(null);
    }
    this.queue.shift();
    this.reflowQueue();
    this.assignRoom(guest, cabin);
    const path = w.map.nav.findPath(w.map.nearestNode(guest.pos.x, guest.pos.z) ?? 'c0:desk', cabin.node);
    guest.mover.go([...(path ?? []), cabin.bedSide], () => this.arriveAtRoom(guest));
    w.events.emit('guest.keyed', { x: guest.pos.x, z: guest.pos.z, byPlayer: actor.isPlayer, booked });
    w.ftue('first_key');
  }

  /** A room is theirs: where they get off, and the start of their night (one trip, one sleep). */
  private assignRoom(guest: Guest, cabin: Cabin): void {
    const w = this.w;
    cabin.guest = guest;
    guest.cabin = cabin;
    guest.queueSlot = -1;
    // The opening is scripted: everyone gets off at the next stop, so cabins turn over on time, every time.
    const early = w.data.route.stopsCompleted < w.econ.guests.earlyStopsOneLeg;
    const legs = early ? 1 : Number(w.rng.weighted(w.econ.guests.rideLegsWeights as unknown as Record<string, number>));
    guest.destinationStop = w.journey.stopSerial + (guest.story ? 2 : legs);
    // One trip, one sleep: their night starts now.
    guest.boardStop = w.journey.stopSerial;
    guest.trip = 'evening';
    guest.phaseRequested = false;
    guest.phaseOuting = false;
    guest.asked.clear();
    guest.sleeps = 0;
    guest.washes = 0;
    guest.sleptFor = 0;
    const trip = w.econ.trip;
    guest.rules.eveningEnd = trip.eveningEnd + w.rng.range(-trip.jitter, trip.jitter);
    guest.rules.morningStart = trip.morningStart + w.rng.range(-trip.jitter, trip.jitter);
    guest.rules.minSleepSeconds = trip.minSleepSeconds;
    guest.wishIn = w.econ.guests.settleSeconds + w.rng.range(...trip.requestDelay);
    this.audit.trips++;
    this.logTrip(guest, 'boarding', 'evening', this.progressOf(guest));
    this.setState(guest, 'toCabin');
  }

  /** At their room: First and Royal wait for the turndown; everyone else sits on the bed with the paper a while. */
  private arriveAtRoom(guest: Guest): void {
    if (CLASS_BY_ID[guest.cls].turndown && !guest.story) {
      this.askTurndown(guest);
      return;
    }
    this.setState(guest, 'settling');
    guest.settleFor = this.w.econ.guests.settleSeconds;
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
    this.logTrip(guest, guest.trip, 'arrival', this.progressOf(guest));
    // They leave a tip and a lived-in cabin behind: the bed slept in and something of theirs on the floor.
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
    // Off along the platform's walkway (clear of the ticket queue) to the station house doors.
    const exit = [...PLATFORM.concourse, PLATFORM.entrance, PLATFORM.houseDoor];
    guest.mover.go([...(path ?? [door.inside, door.outside]), ...exit], () => this.finishAlighting(guest, false));
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
      guest.pos.z = door.outside.z - 0.6;
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
    const guest = new Guest(archetype, x, z, speed, story, this.looks++ % CROWD.variants);
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
      // Deck passengers get off at the first stop: they never hold a bed past it. A traveller with a ticket
      // waiting on the platform has a bed spoken for.
      if ((g.paid && g.state === 'platform') || (g.aboard && (g.cabin === null ? g.state !== 'platform' : g.destinationStop > stopSerial))) n++;
    }
    return n;
  }
}
