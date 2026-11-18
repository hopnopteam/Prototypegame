import { CLASS_BY_ID } from '../config/classes';
import * as THREE from 'three';
import { STATION_UPGRADES, STATIONS } from '../config/content';
import type { JourneyPhase, Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import { FLOOR_Y } from '../world/CarriageView';
import { createItemMesh } from '../world/ItemMeshes';
import { HALF_WIDTH, PLATFORM_X0 } from '../world/layout';
import { nextClassOnRoute, type ClassId } from '../config/classes';
import { PlatformView } from '../world/PlatformView';
import { gateCounter, PLATFORM, queueSpot } from '../world/platformLayout';
import { ACTIVE_ROUTE } from '../config/routes';
import { rect, type Rect } from '../core/types';
import { billboardTexture } from '../world/sprites';
import { DEFAULT_TRAIN_NAME } from '../config/press';
import { nextStreak, ratingEffect, starBonus, stopStars, streakBonus } from '../sim/stationResult';
import { log } from '../core/log';
import type { StationResult } from './events';
import { sourceActive, sourceStay, type SourceSpec } from './Pickup';
import { platformLightInput } from '../world/trainLight';
import type { World } from './World';
import { Zone } from './Zones';

const APPROACH_MARGIN = 40;
const DEPART_HIDE_DISTANCE = 70;
/** Seconds after the train changes before the platform is rebuilt (unless it comes into view first). */
const PLATFORM_REBUILD_DELAY = 1.2;
/** Roadside billboards once the billboard campaign is bought. */
/** A copy of `items` in random order. */
function shuffled<T>(items: readonly T[], rng: { next(): number }): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BILLBOARD_COUNT = 3;
/** Phase 2 (≥30 fps on a low-end phone): on Low quality a platform holds at most this many travellers. */
const LOW_TIER_BOARDERS = 10;
/** Session 55: the fruit kiosk's till, at the walkway's edge in front of its stall (the kiosk bay). */
const KIOSK_TILL = { dx: 5.15, z: 6.0 };
/** Where a new game's conductor stands on the platform: a few steps from the ticket stand's serving side. */
const PROLOGUE_SPAWN = { x: PLATFORM.serve.x + 0.35, z: PLATFORM.serve.z + 1.7 };
/** Travellers who turn up during a stop (out of the station house), and the window of the stop they come in. */
const LATECOMERS: [number, number] = [0, 2];
const LATE_WINDOW: [number, number] = [5, 22];
/** Session 40: seconds into a stop the first day rider comes out of the station house. */
const DAY_RIDER_START = 2.5;

/**
 * The journey rhythm made physical (§5): the platform glides in and stops at the doors, guests board and
 * alight, luggage and vendor crates wait on the platform, and each stop ends with a result card and a bonus
 * for a clean stop. Nothing here can fail: guests who miss the train simply wait for the next one.
 */
/** Session 56: the supplies box on the conductor's shoulder (body space) and its size. */
const SUPPLY_BOX_AT = { x: 0.2, y: 0.93, z: -0.04 };
const SUPPLY_BOX_SCALE = 0.75;

export class Station {
  readonly view = new PlatformView();
  platformOffset = 1e6;
  luggagePile = 0;
  private luggageTotal = 0;
  vendorCrates = 0;
  private spawnedForStop = -1;
  private readonly crateMeshes: THREE.Mesh[] = [];
  private boardingZone!: Zone;
  private luggageZone!: Zone;
  private vendorZone!: Zone;
  /** The stop the bell was last rung at (session 29: once a stop). */
  private bellRungFor = -1;
  private boardedThisStop = 0;
  private alightedThisStop = 0;
  private tipsThisStop = 0;
  private starsAtArrival = 0;
  private luggageLoadedThisStop = 0;
  /** Fares sold at the ticket stand this stop (session 24: the result card's total). */
  private faresThisStop = 0;
  private readonly tmp = new THREE.Vector3();
  /**
   * The opening at Millbrook (config: flow `prologue`): the train stands at the platform with the clock held
   * until the travellers it has rooms for are aboard. Travellers step aboard by themselves as rooms open.
   */
  prologue = false;
  /**
   * At Millbrook the conductor collects the first traveller's ticket by hand (session 19); after that, whoever
   * gets a bed steps aboard by themselves, since the conductor is inside by then.
   */
  prologueTicketsDone = false;

  constructor(private readonly w: World) {
    w.scene.add(this.view.group);
    w.events.on('station.restocked', ({ items, helper }) => w.analytics.log(EVENTS.stationRestock, { items, helper: helper ?? false }));
    w.events.on('luggage.loaded', () => this.luggageLoadedThisStop++);
    w.events.on('guest.alighted', () => this.alightedThisStop++);
    w.events.on('guest.checkedIn', ({ fare }) => { this.faresThisStop += fare; });
    w.events.on('guest.boarded', ({ byPlayer }) => {
      this.boardedThisStop++;
      if (this.prologue && byPlayer && !this.prologueTicketsDone) {
        this.prologueTicketsDone = true;
        w.ftue('first_ticket');
      }
    });
  }

  /** Where a new game's conductor starts: on the Millbrook platform, a few steps from the ticket stand. */
  static prologueSpawn(_door: { outside: Vec2 }): Vec2 {
    return { ...PROLOGUE_SPAWN };
  }

  init(): void {
    this.createZones();
    this.onTrainChanged();
    this.refreshMarketing();
    const w = this.w;
    w.events.on('unlock.completed', ({ id }) => {
      if (w.unlocks.get(id)?.kind === 'marketing') this.refreshMarketing(true);
      if (id.startsWith('st.')) {
        this.refreshUpgrades();
        w.data.station.owned[ACTIVE_ROUTE.id] = [...new Set([...(w.data.station.owned[ACTIVE_ROUTE.id] ?? []), id.slice(3)])];
        w.analytics.log(EVENTS.stationUpgrade, { id: id.slice(3), time: Math.round(w.lifetimeSeconds()) });
      }
    });
    this.refreshUpgrades();
    w.events.on('train.named', () => this.refreshMarketing());
    w.events.on('livery.changed', () => this.refreshMarketing());
    document.fonts?.ready.then(() => this.refreshMarketing()).catch(() => undefined);
    this.view.setStationName(this.currentStation().name);
    // The sign is painted on canvas: repaint once the embedded display font is ready.
    document.fonts?.ready.then(() => this.view.setStationName(this.currentStation().name)).catch(() => undefined);
  }

  currentStation(): (typeof STATIONS)[number] {
    return STATIONS[this.w.journey.stationIndex % STATIONS.length];
  }

  /** The station the platform being prepared belongs to (the current one while stopped or approaching). */
  private nextStation(): (typeof STATIONS)[number] {
    return this.currentStation();
  }

  boardingPoint(): Vec2 {
    return { x: this.boardingZone.x, z: this.boardingZone.z };
  }

  luggagePoint(): Vec2 {
    return { x: this.luggageZone.x, z: this.luggageZone.z };
  }

  vendorPoint(): Vec2 {
    return { x: this.vendorZone.x, z: this.vendorZone.z };
  }

  recordTip(amount: number): void {
    this.tipsThisStop += amount;
  }

  /**
   * Marketing on show: posters of the train on every platform, a brass band at the door, and billboards in
   * the countryside. `fresh` plays the reveal (the band strikes up, confetti over the posters).
   */
  private marketingKey = '';

  refreshMarketing(fresh = false): void {
    const w = this.w;
    const has = (key: string): boolean => w.unlocks.isUnlocked(`st.${key}`);
    const livery = w.currentLivery();
    const name = w.data.press.trainName ?? DEFAULT_TRAIN_NAME;
    const marketingKey = `${has('posters')}|${has('band')}|${has('billboard')}|${name}|${livery.body}`;
    if (marketingKey === this.marketingKey && !fresh) return;
    this.marketingKey = marketingKey;
    this.view.setMarketing({ posters: has('posters'), band: has('band'), billboard: has('billboard') }, name, livery.body, livery.trim);
    const boards = has('billboard');
    const key = `${boards}|${name}|${livery.body}`;
    if (key !== this.billboardKey) {
      this.billboardKey = key;
      w.scenery.setBillboards(boards ? billboardTexture(name, livery.body, livery.trim) : null, BILLBOARD_COUNT);
    }
    if (fresh) {
      w.audio.play('sparkle');
      w.particles.emit('confetti', w.player.pos.x, FLOOR_Y + 2.4, w.player.pos.z - 1, 50, 1.2);
    }
  }
  private billboardKey = '';
  private platformBuilt = false;
  /** When a deferred platform rebuild is due (sim time), or null. */
  private platformBuildAt: number | null = null;
  private buildPlatform(): void {
    const train = this.w.train;
    this.w.background.cancel('platform');
    this.view.build(this.w.map.rearZ, train.indexOfType('supply'), train.indexOfType('luggage'));
    this.platformBuilt = true;
    this.platformBuildAt = null;
  }

  /** Queues a due rebuild as background work; finishes it at once if the platform must show now. */
  private stepPlatformBuild(visible: boolean): void {
    const bg = this.w.background;
    if (this.platformBuildAt !== null && (visible || this.w.time >= this.platformBuildAt)) {
      const train = this.w.train;
      this.platformBuildAt = null;
      bg.add('platform', this.view.buildSteps(this.w.map.rearZ, train.indexOfType('supply'), train.indexOfType('luggage')));
    }
    if (visible) bg.finish('platform');
  }

  /**
   * Train grew: the luggage pile and vendor move to match now, and the platform is rebuilt a moment later (or
   * as it comes into view), so its geometry never lands in the same frame as the new carriage's.
   */
  onTrainChanged(): void {
    const train = this.w.train;
    const supply = train.indexOfType('supply');
    const luggage = train.indexOfType('luggage');
    if (!this.platformBuilt) this.buildPlatform();
    else this.platformBuildAt = this.w.time + PLATFORM_REBUILD_DELAY;
    void luggage;
    if (!this.luggageZone) return;
    if (supply !== null) {
      const vendor = PlatformView.vendorPosition(supply);
      this.vendorZone.moveTo(vendor.x, vendor.z);
    }
    this.layoutPlatformItems();
    this.refreshUpgrades();
    this.w.scenerySpanChanged?.();
  }

  private upgradeObstacleKey = '';
  private solidsSeen = -1;

  /**
   * Phase 2: the station upgrades owned stand on the platform (at every station of the route), and what they stand on
   * is no longer walkable. The second gate stands at the train's second entrance (none until it has one).
   */
  refreshUpgrades(): void {
    const w = this.w;
    const owned = new Set<string>();
    for (const u of STATION_UPGRADES) if (w.unlocks.isUnlocked(`st.${u.key}`)) owned.add(u.key);
    const gateZ = this.gateZ();
    this.view.setUpgrades(owned, gateZ);
    const rects: Rect[] = [];
    for (const u of STATION_UPGRADES) {
      if (!owned.has(u.key) || !u.size || u.at.door) continue;
      const x = PLATFORM_X0 + u.at.dx;
      rects.push(rect(x - u.size.w / 2, u.at.z - u.size.d / 2, x + u.size.w / 2, u.at.z + u.size.d / 2));
    }
    if (owned.has('gate2') && gateZ !== null) rects.push(gateCounter(gateZ));
    // Everything else standing on the deck (lamp posts, tubs, benches, the station master) is solid too.
    rects.push(...this.view.solids, ...this.view.upgradeSolids);
    const key = rects.map((r) => `${r.x0.toFixed(2)},${r.z0.toFixed(2)},${r.x1.toFixed(2)}`).join('|');
    if (key !== this.upgradeObstacleKey) {
      this.upgradeObstacleKey = key;
      w.map.setPlatformExtras(rects);
    }
  }

  /** Phase 2: where the second ticket gate stands (the second entrance's door), or null on a train with one door. */
  gateZ(): number | null {
    return this.w.map.doors()[1]?.outside.z ?? null;
  }

  /** Phase 2: the second gate is open at this stop (bought, and the train has a second entrance). */
  gateOpen(): boolean {
    const w = this.w;
    return w.journey.phase === 'stationStop' && !this.prologue && w.stationPerks().secondDoor && this.gateZ() !== null;
  }

  /**
   * A brand-new game opens here (session 17, owner: "where guests are coming from"; session 22: the station start;
   * session 23: paced as a story). Night at Millbrook, the old carriage covered beside the platform, the clock held.
   * The first traveller waits at the ticket stand's window; the next comes out of the station house a few seconds
   * later. Each ticket's fare pays for a room: the first opens the carriage (the reveal), the next builds a cabin.
   * Once the carriage is open the clock starts; the train leaves when it runs out, waiting a little for anyone
   * with a ticket still outside. Passengers only ever come from a station platform.
   */
  startPrologue(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || !j.held) return;
    this.prologue = true;
    this.prologueTicketsDone = false;
    this.spawnedForStop = j.stopSerial;
    w.map.setDoorsOpen(true);
    // The covered carriage's doors stay shut until its reveal opens them.
    if (!w.train.covered) w.train.setDoors(true);
    this.platformOffset = 0;
    this.view.setOffset(0);
    this.view.setHeadline(`${this.currentStation().name} awaits the night train`);
    const rules = w.econ.flow.prologue;
    // Session 40 (owner: "the first two passengers should come together"): everyone due at 0 s is already in the
    // ticket queue when play begins; any later arrival still comes out of the station house on its time.
    const arrivals = rules.arrivals.slice(0, rules.travellers);
    const together = Math.max(1, arrivals.filter((at) => at <= 0).length);
    const spots = Array.from({ length: together }, (_, i) => (i === 0 ? PLATFORM.window : queueSpot(i)));
    w.guests.spawnPlatformGuests(spots, null, spots.map(() => 'basic' as const), rules.archetypes.slice(0, together));
    this.prologueArrivals = arrivals.slice(together).map((at, i) => ({ at, archetype: rules.archetypes[together + i] }));
    w.audio.setStationAmbience(true);
    this.prologueClock = 0;
  }

  /**
   * Session 33 (owner: "the train should open only after both tickets have been collected"): true while a Millbrook
   * traveller is still to come or still to buy their ticket; the Open carriage tile waits for it.
   */
  get prologueTicketsLeft(): boolean {
    if (!this.prologue) return false;
    return this.prologueArrivals.length > 0 || this.w.guests.list.some((g) => g.state === 'platform' && !g.paid);
  }

  /** Seconds since play began at Millbrook, and the travellers still to come out of the station house. */
  private prologueClock = 0;
  private prologueArrivals: { at: number; archetype?: string }[] = [];
  /** When the opening's carriage was opened (prologue clock), or null while it is still covered. */
  private prologueOpenedAt: number | null = null;

  /**
   * At Millbrook: travellers arrive on time, the clock starts once the carriage is opened, and the train waits a
   * little for anyone with a ticket still on the platform.
   */
  private updatePrologue(dt: number): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop') {
      this.prologue = false;
      return;
    }
    const rules = w.econ.flow.prologue;
    this.prologueClock += dt;
    while (this.prologueArrivals.length > 0 && this.prologueClock >= this.prologueArrivals[0].at) {
      const next = this.prologueArrivals.shift();
      w.guests.spawnLatecomer('basic', next?.archetype);
    }
    if (!j.held) return;
    if (w.train.covered) return;
    if (this.prologueOpenedAt === null) this.prologueOpenedAt = this.prologueClock;
    if (w.journey.heldStops) {
      // Phase 2: no clock at Millbrook either. The train leaves once both travellers have their tickets and are
      // through the door, and the conductor is aboard (the bell is taught at the first real stop).
      if (this.prologueTicketsLeft || w.guests.waitingCount() > 0 || this.outsideTrain(w.player.pos)) return;
      j.release(rules.lastCallSeconds);
      return;
    }
    j.release(rules.afterOpenSec);
  }

  onPhase(phase: JourneyPhase, previous: JourneyPhase): void {
    const w = this.w;
    if (phase === 'departing' && previous === 'stationStop' && this.prologue) {
      // Leaving Millbrook: the doors close and the flag goes up, but it was not a stop of the ride (no ticket).
      this.prologue = false;
      this.view.setFlag(true);
      this.closeDoors();
      return;
    }
    if (phase === 'stationStop') {
      w.map.setDoorsOpen(true);
      w.train.setDoors(true);
      this.platformOffset = 0;
      this.view.setOffset(0);
      this.boardedThisStop = 0;
      this.alightedThisStop = 0;
      this.tipsThisStop = 0;
      this.faresThisStop = 0;
      this.luggageLoadedThisStop = 0;
      this.starsAtArrival = w.progression.stars;
      this.bellAt = null;
      this.grumpyThisStop = 0;
      this.restocksThisStop = 0;
      this.unhappyAtArrival = w.guests.audit.unhappy;
      if (w.stationPerks().helper) w.tweens.delay(w.econ.station.supply.porterSeconds, () => this.helperRestock());
      w.guests.onStationStop(w.journey.stopSerial);
      const station = this.currentStation();
      const newPostcard = w.meta.onStationVisited(station.id, station.name);
      w.ui.stationBanner(station.name, station.id);
      if (newPostcard) w.ui.postcardToast(station.id);
      w.audio.play('whistle');
      w.audio.setStationAmbience(true);
      w.ftue('first_station');
      w.breaks.request('arrival');
      w.stationEvents.onArrival();
    } else if (phase === 'departing' && previous === 'stationStop') {
      this.view.setFlag(true);
      this.closeDoors();
      this.finishStop();
      w.stationEvents.onDeparture();
      w.breaks.request('departure');
    } else if (phase === 'onTheMove' && previous === 'departing') {
      this.view.setFlag(false);
      w.journey.stationIndex = (w.journey.stationIndex + 1) % STATIONS.length;
      w.data.route.stationIndex = w.journey.stationIndex;
      w.data.route.legsCompleted = w.journey.legsCompleted;
      w.save.markDirty();
      this.view.setStationName(this.currentStation().name);
    }
  }

  onLastCall(): void {
    // Session 29: the departure warning is a gentle bell (a little lower than the station bell the conductor rings).
    this.w.audio.play('bell', { pitch: 0.8 });
  }

  /** The last whole second the station clock ticked on (fix list 4.3). */
  private lastTick = -1;

  /** The station clock's last seconds: a tick each second and a warning whistle before the doors close. */
  private updateClock(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || j.held) {
      this.lastTick = -1;
      return;
    }
    const timer = w.econ.journey.timer;
    const second = Math.ceil(j.timeLeft);
    if (second === this.lastTick || second <= 0) return;
    const first = this.lastTick < 0;
    this.lastTick = second;
    if (first) return;
    if (second <= timer.tickFrom) w.audio.play('tick', { pitch: second <= 3 ? 1.25 : 1 });
  }

  update(_dt: number): void {
    const w = this.w;
    const j = w.journey;
    if (!j.heldStops) this.updateClock();
    this.updateKiosk(_dt);
    this.updateSupply();
    if (this.prologue) this.updatePrologue(_dt);
    // Phase 2, no teleport: once the bell has rung, the doors wait for the conductor (and anyone still walking in).
    if (j.phase === 'stationStop' && !j.held && j.heldStops && j.timeLeft < 0.6 && (this.outsideTrain(w.player.pos) || w.guests.walkingIn())) j.extend(_dt);
    this.updateLatecomers();
    this.updateDayRiders();
    const toStop = j.distanceToStop;
    const sinceDeparture = j.distanceSinceDeparture;
    const length = this.view.length;
    let visible = false;
    if (j.phase === 'stationStop') {
      this.platformOffset = 0;
      visible = true;
    } else if (toStop !== null && toStop < length + APPROACH_MARGIN) {
      this.platformOffset = -toStop;
      visible = true;
      if (this.spawnedForStop !== j.stopSerial + 1) this.prepareStop(j.stopSerial + 1);
    } else if (sinceDeparture !== null && sinceDeparture < length + DEPART_HIDE_DISTANCE) {
      this.platformOffset = sinceDeparture;
      visible = true;
    } else {
      if (this.view.group.visible) this.clearPlatform();
      this.platformOffset = 1e6;
    }
    this.stepPlatformBuild(visible);
    if (this.view.solidsVersion !== this.solidsSeen) {
      this.solidsSeen = this.view.solidsVersion;
      this.refreshUpgrades();
    }
    this.view.group.visible = visible;
    this.view.setOffset(this.platformOffset);
    if (visible) this.view.animate(_dt, w.player.pos.x, w.player.pos.z);
    // The platform's lamps light the deck, the waiting guests and the train's side as it slides in.
    const light = w.stage.lightMap;
    if (visible !== this.lampsShown) {
      this.lampsShown = visible;
      light.setPlatform(visible ? platformLightInput(this.view.lampAnchors, this.view.z0, this.view.z1) : null);
    }
    if (visible) light.setPlatformOffset(this.platformOffset);
    const zOffset = this.platformOffset;
    w.scenery.setHiddenRegion(visible ? { x0: PLATFORM_X0 - 0.2, x1: PLATFORM_X0 + 19, z0: this.view.z0 + zOffset - 2, z1: this.view.z1 + zOffset + 2 } : null);
  }

  private lampsShown = false;

  private prepareStop(stopSerial: number): void {
    const w = this.w;
    this.spawnedForStop = stopSerial;
    w.guests.removePlatformGuests();
    // The newsstand carries the latest story about your train (or the paper's own welcome).
    const latest = w.data.press.items[0];
    this.view.setHeadline(latest ? latest.headline : `${this.nextStation().name} awaits the night train`);
    const econ = w.econ.guests;
    // Enough travellers to fill every free bed, plus one or two more who will have to wait for the next
    // train: visible demand that says "build more cabins".
    const free = w.guests.bedsFree(stopSerial);
    // At the first stop exactly one traveller per free bed (config: flow `crowd`): boarding is learnt on its own,
    // before anyone has to be left behind.
    const crowd = w.flow.allows('crowd');
    const extra = crowd ? w.rng.int(econ.extraBoarders[0], econ.extraBoarders[1]) : 0;
    const early = crowd && w.data.route.stopsCompleted < 2 ? econ.minBoarders : 1;
    // Marketing (posters, billboard, band) draws a few more travellers each stop. The Train Rating (fix list 4.2):
    // a well-rated train fills every bed and draws a crowd beyond them; a poorly rated one leaves beds empty.
    const rating = w.trainRating();
    const r = w.econ.rating;
    const filled = crowd ? Math.round(free * Math.min(1, ratingEffect(rating, r.fill.low, r.fill.high))) : free;
    const drawn = crowd && rating > 3 ? Math.round(((rating - 3) / 2) * r.extraTravellers.high) : 0;
    // Phase 2: a special stop (Rush Hour doubles the crowd; a poor review thins it), and fewer people on Low quality.
    const crowdScale = w.stationEvents.prepare(stopSerial);
    const cap = w.stage.tier === 'low' ? Math.min(econ.maxBoarders, LOW_TIER_BOARDERS) : econ.maxBoarders;
    const count = Math.max(early, Math.min(cap, Math.round((filled + extra + drawn + w.stationPerks().passengers) * crowdScale)));
    const spots = new Array<Vec2>(count).fill(PLATFORM.window);
    const story = w.meta.storyGuestForStop();
    const classes = this.travellerClasses(stopSerial, count);
    const guests = w.guests.spawnPlatformGuests(spots, story, classes, this.familiesFor(classes));
    w.stationEvents.dress(guests);
    this.luggagePile = Math.min(this.view.barrowCapacity, guests.filter((g) => g.hasLuggage).length);
    // A traveller or two turns up during the stop, out of the station house (once the crowd is part of the ride).
    this.latecomers.length = 0;
    if (crowd && !w.journey.heldStops) {
      for (let n = w.rng.int(LATECOMERS[0], LATECOMERS[1]); n > 0; n--) this.latecomers.push(w.rng.range(LATE_WINDOW[0], LATE_WINDOW[1]));
    }
    this.luggageTotal = this.luggagePile;
    // Session 40: day riders for the venues (a pass, no cabin), out of the station house once the doors open.
    this.dayRiders.length = 0;
    if (crowd && w.venues.list.length > 0) {
      const rules = w.econ.dayRiders;
      const seats = w.venues.list.reduce((n, v) => n + v.seats.filter((seat) => seat.state !== 'locked').length, 0);
      const room = rules.maxAboard - w.guests.list.length;
      let t = DAY_RIDER_START;
      for (let n = Math.min(rules.max, Math.round(seats * rules.perSeat), room); n > 0; n--) {
        this.dayRiders.push(t);
        t += w.rng.range(rules.stagger[0], rules.stagger[1]);
      }
    }
    this.vendorCrates = w.train.hasSupplyCar() ? w.econ.facilities.vendorCratesPerStop : 0;
    this.layoutPlatformItems();
  }

  /**
   * Who is waiting, by class: a traveller for every free bed of each class the train sells, the rest spread
   * across those classes, and now and then someone with a ticket for the next class up (once it can be bought),
   * who waits with a "no room" sign: the clearest nudge toward the next upgrade.
   */
  /** Phase 2, Delayed Connection: a second wave of travellers comes out of the station house mid-stop. */
  spawnWave(n: number): void {
    const w = this.w;
    for (let i = 0; i < n; i++) w.tweens.delay(i * 0.9, () => {
      if (w.journey.phase === 'stationStop' && w.journey.held) w.guests.spawnLatecomer(this.travellerClasses(w.journey.stopSerial, 1)[0]);
    });
  }

  private travellerClasses(stopSerial: number, count: number): ClassId[] {
    const w = this.w;
    const capacity = w.train.classCapacity();
    const boardable: ClassId[] = [];
    for (const cls of capacity.keys()) for (let i = w.guests.bedsFree(stopSerial, cls); i > 0; i--) boardable.push(cls);
    const out = shuffled(boardable, w.rng).slice(0, count);
    const best = w.train.bestClass();
    const above = nextClassOnRoute(best);
    const weights: Partial<Record<ClassId, number>> = {};
    for (const [cls, n] of capacity) weights[cls] = n;
    while (out.length < count) {
      const richer = ratingEffect(w.trainRating(), w.econ.rating.richer.low, w.econ.rating.richer.high);
      if (above && w.progression.level >= above.level && w.rng.chance(w.econ.classes.aspirantChance * richer)) out.push(above.id);
      else out.push(capacity.size > 0 ? w.rng.weighted(weights) : 'basic');
    }
    return shuffled(out, w.rng);
  }

  /**
   * Phase 1, the Family Sleeper: one family (a parent and a child, boarding together) for each of its free cabins of a
   * class; everyone else is whoever their class brings. Returns an archetype per traveller ('' for the class's pick).
   */
  private familiesFor(classes: ClassId[]): string[] {
    const quota = new Map<ClassId, number>();
    return classes.map((cls) => {
      if (!quota.has(cls)) quota.set(cls, this.w.train.freeFamilyRooms(cls));
      const left = quota.get(cls) ?? 0;
      if (left <= 0) return '';
      quota.set(cls, left - 1);
      return 'family';
    });
  }

  /** Seconds into this stop each latecomer turns up (session 23). */
  private readonly latecomers: number[] = [];
  /** Session 40: seconds into the stop each day rider comes out of the station house. */
  private readonly dayRiders: number[] = [];

  /** Latecomers come out of the station house while the stop is on (never in its last few seconds). */
  private updateDayRiders(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || !j.doorsOpen || this.prologue || this.dayRiders.length === 0) return;
    if (j.heldStops ? !j.held : j.timeLeft < j.lastCallSeconds + 6) {
      this.dayRiders.length = 0;
      return;
    }
    while (this.dayRiders.length && j.stopTime >= this.dayRiders[0]) {
      this.dayRiders.shift();
      if (w.guests.list.length >= w.econ.dayRiders.maxAboard) continue;
      w.guests.spawnDayRider(this.travellerClasses(j.stopSerial, 1)[0]);
    }
  }

  private updateLatecomers(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || this.prologue || this.latecomers.length === 0) return;
    if (j.heldStops ? !j.held : j.timeLeft < j.lastCallSeconds + 4) {
      this.latecomers.length = 0;
      return;
    }
    for (let i = this.latecomers.length - 1; i >= 0; i--) {
      if (j.stopTime < this.latecomers[i]) continue;
      this.latecomers.splice(i, 1);
      w.guests.spawnLatecomer(this.travellerClasses(j.stopSerial, 1)[0]);
    }
  }

  private closeDoors(): void {
    const w = this.w;
    w.guests.onDoorsClosing();
    w.staff.onDoorsClosing();
    // The player is never left behind: a little hop back aboard.
    const player = w.player;
    if (player.pos.x > 2.3) {
      const door = w.map.doors()[0];
      w.particles.emit('dust', player.pos.x, FLOOR_Y + 0.3, player.pos.z, 10, 0.3);
      player.pos.x = door.inside.x - 0.2;
      player.pos.z = door.inside.z;
      player.view.bounce(1);
    }
    w.map.setDoorsOpen(false);
    // Anyone standing in a doorway as it shut steps inside onto open floor (never left inside the wall).
    const walk = w.map.walk;
    const rescue = (pos: { x: number; z: number }): void => {
      if (walk.isWalkable(pos.x, pos.z)) return;
      const free = walk.nearestWalkable(pos.x, pos.z);
      pos.x = free.x;
      pos.z = free.z;
    };
    rescue(player.pos);
    for (const m of w.staff.members) rescue(m.pos);
    for (const g of w.guests.list) if (g.aboard) rescue(g.pos);
    w.train.setDoors(false);
    // Fares left at the booth come aboard with the conductor (the platform is about to slide away).
    w.cash.collect('booth');
    w.cash.collect('kiosk');
    w.audio.setStationAmbience(false);
    w.audio.play('depart');
  }

  private finishStop(): void {
    const w = this.w;
    const platform = w.guests.platformGuests();
    // Only travellers who had a bed count (Phase 2: on a held stop nobody with one is left; the rest are demand for
    // more cabins, never a miss).
    const missed = platform.filter((g) => g.eligible);
    const waiting = missed.length;
    const leftBehind = platform.length - waiting;
    w.feedback.onDeparture(missed, platform.filter((g) => !g.eligible));
    const storageFull = w.train.luggageStored >= w.train.luggageCapacity;
    const { bags: bagsLeft, refund: bagRefund } = this.chargeLeftBags(storageFull);
    // Phase 2 (owner: "rewards only… no grades, no negative wording"): a star for everyone aboard, one for the train
    // restocked, one for every guest happy (nobody grumpy from waiting, no bag left, nobody off unhappy here).
    const restocked = this.trainStocked();
    const unhappy = w.guests.audit.unhappy - this.unhappyAtArrival;
    const happy = this.grumpyThisStop === 0 && bagsLeft === 0 && unhappy === 0;
    const stars = stopStars(waiting === 0, restocked, happy);
    const clean = stars === 3;
    const money = w.econ.money;
    const route = w.data.route;
    const tutorial = w.coach?.tutorial ?? false;
    // The perfect streak (session 24): each perfect stop in a row grows the bonus; any other stop starts again.
    route.perfectStreak = nextStreak(route.perfectStreak ?? 0, clean);
    let bonusCash = 0;
    let streakExtra = 0;
    const door = w.map.doors()[0];
    if (stars > 0) {
      const full = money.stationBonusCash * (1 + money.stationBonusPerCarriage * (w.train.count - 1)) * (1 + w.stationPerks().stationBonus) * (w.stationEvents?.bonusScale() ?? 1);
      if (clean) {
        const bonus = streakBonus(full, route.perfectStreak, money.perfectStreakStep, money.perfectStreakMax);
        bonusCash = bonus.total;
        streakExtra = bonus.extra;
      } else bonusCash = starBonus(full, stars, w.econ.rating.stopBonusShare);
      if (bonusCash > 0) w.cash.add('bonus', bonusCash, this.tmp.set(door.inside.x + 0.5, FLOOR_Y + 1.5, door.inside.z));
    }
    if (clean) {
      w.addStars(w.econ.stars.cleanStationStop, 'cleanStop', door.inside);
      w.particles.emit('star', door.inside.x, FLOOR_Y + 1.2, door.inside.z, 16, 0.5);
      w.particles.emit('confetti', door.inside.x, FLOOR_Y + 2.2, door.inside.z, 40, 0.8);
      const p = w.player.pos;
      w.particles.emit('confetti', p.x, FLOOR_Y + 2.4, p.z, 30, 0.7);
      w.audio.play('perfect');
      w.audio.play('chest', { volume: 0.7 });
      w.haptics.success();
      w.meta.onCleanStop();
    } else if (stars > 0) {
      w.particles.emit('star', door.inside.x, FLOOR_Y + 1.2, door.inside.z, 6 * stars, 0.4);
      w.audio.play('chest', { volume: 0.55 });
    }
    // Timed stops only (Phase 2 holds every stop for its travellers): those who missed it storm off, fares lost.
    const showMissed = missed.length > 0 && w.feedback.cuesOn && !tutorial;
    let missedFare = 0;
    for (const guest of missed) missedFare += w.guests.estimatedFare(guest);
    missed.forEach((guest, i) => w.guests.stormOff(guest, 0.25 + i * 0.3));
    const result: StationResult = {
      stationName: this.currentStation().name,
      boarded: this.boardedThisStop,
      waiting,
      leftBehind,
      alighted: this.alightedThisStop,
      tips: this.tipsThisStop,
      luggageLoaded: this.luggageLoadedThisStop,
      luggageTotal: this.luggageTotal,
      stars: w.progression.stars - this.starsAtArrival,
      clean,
      bonusCash,
      rating: stars,
      earned: this.faresThisStop + this.tipsThisStop,
      streak: route.perfectStreak,
      streakBonus: streakExtra,
      missedFare,
      showMissed,
      bagsLeft,
      bagRefund,
      rating5: w.trainRating(),
      ratingDelta: 0,
      restocked,
      happy,
      seconds: Math.round(w.journey.stopTime),
      grumpy: this.grumpyThisStop,
    };
    w.data.route.stopsCompleted++;
    w.save.markDirty();
    const stopSeconds = Math.round(this.bellAt ?? w.journey.stopTime);
    log.info('Stop', `stop ${w.journey.stopSerial} at ${result.stationName}: ${stars}★, ${stopSeconds}s to the bell, ${Math.round(w.journey.stopTime)}s in all, boarded ${result.boarded}, restocked ${restocked}, happy ${happy}, grumpy ${this.grumpyThisStop}`);
    w.analytics.log(EVENTS.stationResult, {
      station: result.stationName,
      boarded: result.boarded,
      missed: result.waiting,
      bonus: result.clean,
      luggage_loaded: result.luggageLoaded,
      bags_left: result.bagsLeft,
      no_room: result.leftBehind,
      earned: result.earned,
      stars,
      streak: result.streak,
      stop_number: w.data.route.stopsCompleted,
      train_rating: Math.round(result.rating5 * 10) / 10,
      seconds: Math.round(w.journey.stopTime),
      restocked,
      happy,
    });
    w.analytics.log(EVENTS.stationStop, { stars, seconds: Math.round(w.journey.stopTime) });
    if (this.grumpyThisStop > 0) w.analytics.log(EVENTS.stationGrumpy, { count: this.grumpyThisStop });
    w.events.emit('station.result', result);
    w.ui.showResult(result);
    w.setFlag('firstStationDone');
    this.luggagePile = 0;
    this.vendorCrates = 0;
    this.layoutPlatformItems();
    w.staff.dismissTemporary();
  }

  /**
   * Bags left on the barrow as the doors close (session 30): each is sent on after its owner at the train's cost, a
   * refund taken from the wallet (never below zero), and the owner, who boarded without it, counts a service missed.
   * Not when the rack was full (that is the rack's limit, not a miss). Shown over the barrow and on the station card.
   */
  private chargeLeftBags(storageFull: boolean): { bags: number; refund: number } {
    const w = this.w;
    const bags = storageFull ? 0 : this.luggagePile;
    if (bags <= 0) return { bags: 0, refund: 0 };
    const owners = w.guests.list.filter((g) => g.aboard && g.hasLuggage && g.boardStop === w.journey.stopSerial).slice(-bags);
    let due = 0;
    for (let i = 0; i < bags; i++) {
      const owner = owners[i];
      due += w.econ.luggage.refundPerBag * (owner ? CLASS_BY_ID[owner.cls].tip : 1);
      if (owner) owner.unmet++;
    }
    const refund = w.wallet.take('cash', Math.round(due), 'luggageRefund');
    const pad = PLATFORM.luggagePad;
    const x = pad.x;
    const z = pad.z + this.platformOffset;
    w.ui.floatIcon('luggage', x, FLOOR_Y + 1.6, z, 'miss', true);
    if (refund > 0) w.ui.floatText(`−${refund}`, x, FLOOR_Y + 2.1, z, 'miss');
    w.audio.play('grumble');
    return { bags, refund };
  }

  private clearPlatform(): void {
    this.w.guests.removePlatformGuests();
    this.view.resetLife();
    this.luggagePile = 0;
    this.vendorCrates = 0;
    this.layoutPlatformItems();
  }

  private createZones(): void {
    const w = this.w;
    // The fares paid at the ticket stand stack up a step from the server, toward the door (session 23).
    w.cash.create('booth', PLATFORM.till.x, PLATFORM.till.z);
    // Session 23: whoever sells tickets stands behind the stand's counter; the traveller at its window pays, takes
    // their ticket and walks back along the platform to the door. Nobody walks through the server's spot.
    this.boardingZone = w.zones.add(new Zone({
      id: 'board',
      kind: 'work',
      x: PLATFORM.serve.x,
      z: PLATFORM.serve.z,
      radius: 0.6,
      icon: 'ticket',
      active: () => w.journey.doorsOpen && w.guests.canBoard(),
      stay: (zone, actor, dt) => {
        if (!w.guests.canBoard()) return false;
        // Nobody at the window yet: wait behind the counter, the ring empty (it fills once, for a real sale).
        if (!w.guests.windowReady()) {
          zone.progress = 0;
          return true;
        }
        // Facing the window over the counter, stamping the ticket.
        actor.view.act('stamp');
        // Session 55: the Ticket Office sells each ticket in half the time.
        const ticketSeconds = w.econ.zones.boardIntervalSeconds * (w.stationPerks().fastTickets ? 0.5 : 1);
        zone.progress += (dt / ticketSeconds) * actor.workMultiplier;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        const guest = w.guests.boardNext(actor.isPlayer);
        if (guest) {
          if (actor.isPlayer) w.haptics.light();
          w.particles.emit('sparkle', guest.pos.x, FLOOR_Y + 1.2, guest.pos.z, 4, 0.2);
        }
        return true;
      },
    }));

    const pile = PLATFORM.luggagePad;
    const luggagePoint = new THREE.Vector3();
    const luggageSpec: SourceSpec = {
      kind: 'luggage',
      point: () => {
        const bag = PlatformView.bagPosition(this.luggagePile - 1);
        return luggagePoint.set(bag.x, bag.y, bag.z);
      },
      stock: () => (w.journey.doorsOpen ? this.luggagePile : 0),
      take: () => {
        this.luggagePile--;
        this.layoutPlatformItems();
      },
      giveBack: () => {
        this.luggagePile++;
        this.layoutPlatformItems();
      },
      interval: w.econ.zones.pickupIntervalSeconds * 1.5,
    };
    this.luggageZone = w.zones.add(new Zone({
      id: 'luggagePile',
      kind: 'pickup',
      x: pile.x,
      z: pile.z,
      radius: 0.62,
      icon: 'luggage',
      active: () => w.journey.doorsOpen && sourceActive(w, luggageSpec),
      highlight: () => w.demand.playerWants('luggage') > 0,
      stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, luggageSpec),
    }));

    // Phase 2: the platform kiosk's till (its takings pile up while the train is in).
    w.cash.create('kiosk', PLATFORM_X0 + KIOSK_TILL.dx, KIOSK_TILL.z);

    // Session 56 (owner: "even if we have other things in our hands, the restock should still work"): the supply cart.
    // Stand by it a moment and the conductor takes the day's supplies as one box in their hand, whatever is on their
    // tray; then they put it in the lobby's cupboard (`createCupboard`).
    const cart = PLATFORM.restockPad;
    w.zones.add(new Zone({
      id: 'restock',
      kind: 'pickup',
      x: cart.x,
      z: cart.z,
      radius: 0.62,
      icon: 'crate',
      staff: false,
      active: () => this.cartWanted(),
      highlight: () => this.cartWanted(),
      stay: (zone, actor, dt) => {
        if (!actor.isPlayer || !this.cartWanted()) {
          zone.progress = 0;
          return false;
        }
        zone.progress += dt / w.econ.station.restockSeconds;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        this.takeSupplies();
        actor.view.bounce(0.4);
        w.audio.play('pickup', { pitch: 1.1 });
        w.haptics.light();
        w.particles.emit('sparkle', cart.x, FLOOR_Y + 1, cart.z, 6, 0.25);
        return true;
      },
    }));
    this.createCupboard();

    // Session 29: the station bell. Ring it and latecomers hurry out of the station house (the conductor's job: staff
    // never ring it, so a hired porter leaves the conductor this beat of the stop).
    w.zones.add(new Zone({
      id: 'bell',
      kind: 'work',
      x: PLATFORM.bellPad.x,
      z: PLATFORM.bellPad.z,
      radius: 0.6,
      icon: 'bell',
      staff: false,
      active: () => this.bellReady(),
      stay: (zone, actor, dt) => {
        if (!actor.isPlayer || !this.bellReady()) return false;
        actor.view.act('wave');
        zone.progress += dt / w.econ.bell.seconds;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        this.ringBell();
        return true;
      },
    }));

    const supply = w.train.indexOfType('supply') ?? 2;
    const vendor = PlatformView.vendorPosition(supply);
    const vendorPoint = new THREE.Vector3();
    const vendorSpec: SourceSpec = {
      kind: 'crate',
      point: () => vendorPoint.set(this.vendorZone.x + 1, FLOOR_Y + 1, this.vendorZone.z),
      stock: () => (w.journey.doorsOpen ? this.vendorCrates : 0),
      take: () => {
        this.vendorCrates--;
        this.layoutPlatformItems();
      },
      giveBack: () => {
        this.vendorCrates++;
        this.layoutPlatformItems();
      },
      interval: 0.35,
    };
    this.vendorZone = w.zones.add(new Zone({
      id: 'vendor',
      kind: 'pickup',
      x: vendor.x,
      z: vendor.z,
      radius: 0.6,
      icon: 'crate',
      active: () => w.journey.doorsOpen && sourceActive(w, vendorSpec),
      highlight: () => w.demand.playerWants('crate') > 0,
      stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, vendorSpec),
    }));
  }

  /** The bell can be rung: a real stop (not the opening), once each, with time left for the latecomers to board. */
  bellReady(): boolean {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || this.prologue || this.bellRungFor === j.stopSerial) return false;
    // Phase 2: the bell is how every stop ends, ready once everyone waiting is aboard (and nothing the stop's event
    // asks for is left undone).
    if (j.heldStops) return j.held && this.platformDone();
    return w.flow.allows('bell') && j.timeLeft > w.econ.bell.before && this.platformDone();
  }

  /**
   * Everyone waiting is aboard. Phase 2: travellers with a bed (sold a ticket and through the door); bags left on
   * the barrow no longer hold the train (they are a service missed, as before). Timed stops also wait for the bags.
   */
  platformDone(): boolean {
    const w = this.w;
    if (!w.journey.doorsOpen) return false;
    if (w.journey.heldStops) return w.guests.waitingCount() === 0 && (this.blocker?.() ?? true);
    const waiting = Math.min(w.guests.platformGuests().length, w.guests.bedsFree());
    const storageFull = w.train.luggageStored >= w.train.luggageCapacity;
    return waiting === 0 && (this.luggagePile === 0 || storageFull);
  }

  /**
   * Session 55: the lobby's supply cupboard, in boxes (0 to `station.supply.capacity`). It is used up over each ride
   * (`updateSupply`) and filled at a stop from the platform's supply cart. Not saved: a relaunch finds it full.
   */
  supply = 3;

  /** Session 56: the conductor has the supplies box in hand (carried apart from the tray, so nothing else blocks it). */
  supplyInHand = false;
  private supplyBox: THREE.Mesh | null = null;

  /** The supply cart wants the conductor: the cupboard is short and they have no box yet. */
  cartWanted(): boolean {
    const w = this.w;
    if (!w.journey.doorsOpen || this.prologue || w.coach?.tutorial || this.supplyInHand) return false;
    return this.cupboardNeed() > 0;
  }

  /** The box of supplies in the conductor's right hand (Tiny Treats' parcel), until it goes in the cupboard. */
  private takeSupplies(): void {
    this.supplyInHand = true;
    if (!this.supplyBox) {
      this.supplyBox = createItemMesh('crate');
      this.supplyBox.scale.setScalar(SUPPLY_BOX_SCALE);
    }
    // On the shoulder, so the tray in front stays free (and both read at a glance).
    this.supplyBox.position.set(SUPPLY_BOX_AT.x, SUPPLY_BOX_AT.y, SUPPLY_BOX_AT.z);
    this.supplyBox.rotation.set(0, 0, -0.18);
    this.w.player.view.body.add(this.supplyBox);
  }

  /** The box goes in the cupboard: flown there from the hand. */
  private stowSupplies(to: THREE.Vector3): void {
    const box = this.supplyBox;
    this.supplyInHand = false;
    if (!box) return;
    const from = box.getWorldPosition(new THREE.Vector3());
    box.parent?.remove(box);
    const fly = createItemMesh('crate');
    fly.scale.setScalar(SUPPLY_BOX_SCALE);
    fly.position.copy(from);
    this.w.stage.scene.add(fly);
    this.w.tweens.run(0.3, (t) => {
      fly.position.lerpVectors(from, to, t);
      fly.position.y += Math.sin(t * Math.PI) * 0.5;
    }, { complete: () => this.w.stage.scene.remove(fly) });
  }

  /** Session 55: boxes the cupboard still lacks (what a carried box is wanted for). */
  cupboardNeed(): number {
    return Math.max(0, this.w.econ.station.supply.capacity - this.supply);
  }

  /** Where the lobby's supply cupboard is (its pad, in front of the linen cupboard on the lobby's front wall). */
  cupboardPoint(): Vec2 {
    const w = this.w;
    return w.map.anchor(w.train.indexOfType('lobby') ?? 0, 'linen');
  }

  /** The second star (session 55): the lobby's supply cupboard full as the doors close. */
  trainStocked(): boolean {
    return this.supply >= this.w.econ.station.supply.capacity;
  }

  /** Session 55: the cupboard empties box by box over each ride (full as the train leaves, empty as it pulls in). */
  private updateSupply(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'onTheMove' && j.phase !== 'arriving') return;
    const cap = w.econ.station.supply.capacity;
    const left = j.phase === 'arriving' ? 0 : Math.ceil(cap * (1 - j.travelShare) - 1e-6);
    if (left < this.supply) this.supply = Math.max(0, left);
  }

  /** The cupboard's drop zone: walk in with the boxes and they go onto its shelves. */
  private createCupboard(): void {
    const w = this.w;
    const p = this.cupboardPoint();
    const to = new THREE.Vector3(p.x, FLOOR_Y + 1.2, p.z - 0.6);
    w.zones.add(new Zone({
      id: 'supplyCupboard',
      kind: 'drop',
      x: p.x,
      z: p.z,
      radius: 0.62,
      icon: 'crate',
      staff: false,
      active: () => this.supplyInHand,
      stay: (zone, actor, dt) => {
        if (!actor.isPlayer || !this.supplyInHand) return false;
        zone.progress += dt / 0.5;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        const filled = this.cupboardNeed();
        this.stowSupplies(to);
        this.supply = w.econ.station.supply.capacity;
        w.audio.play('done');
        w.haptics.light();
        w.particles.emit('sparkle', p.x, FLOOR_Y + 1.4, p.z - 0.5, 10, 0.4);
        w.ui.floatIcon('crate', p.x, FLOOR_Y + 2.2, p.z - 0.4, 'info', true);
        if (filled > 0) {
          this.restocksThisStop++;
          w.events.emit('station.restocked', { items: filled });
        }
        return true;
      },
    }));
  }


  /** Phase 2: the kiosk trades while the train is in, into its till on the platform. */
  private kioskCarry = 0;
  private updateKiosk(dt: number): void {
    const w = this.w;
    if (!w.journey.doorsOpen || this.prologue || !w.stationPerks().kiosk) return;
    const k = w.econ.station.kiosk;
    this.kioskCarry += dt * k.perSecond * (1 + k.perCarriage * (w.train.count - 1));
    if (this.kioskCarry < 1) return;
    const n = Math.floor(this.kioskCarry);
    this.kioskCarry -= n;
    w.cash.add('kiosk', n, this.tmp.set(PLATFORM_X0 + KIOSK_TILL.dx + 1.1, FLOOR_Y + 1, KIOSK_TILL.z));
  }

  /** Session 55, the Supply Porter: a few seconds after the doors open the cupboard is full again. */
  private helperRestock(): void {
    const w = this.w;
    if (!w.journey.doorsOpen || this.trainStocked()) return;
    const n = this.cupboardNeed();
    this.supply = w.econ.station.supply.capacity;
    this.view.helperWave();
    const p = this.cupboardPoint();
    w.particles.emit('sparkle', p.x, FLOOR_Y + 1.4, p.z - 0.5, 8, 0.35);
    w.events.emit('station.restocked', { items: n, helper: true });
  }

  /** Phase 2: something the stop's event asks for before the bell (the sheep on the line), or null. */
  blocker: (() => boolean) | null = null;
  /** Stop time the bell was rung at this stop (Phase 2: the stop's length is logged), or null. */
  bellAt: number | null = null;
  /** Travellers who turned grumpy waiting on the platform this stop. */
  grumpyThisStop = 0;
  /** Trips to the restock cart this stop. */
  restocksThisStop = 0;
  /** Guests who had got off unhappy before this stop (the audit's count at arrival). */
  private unhappyAtArrival = 0;

  /** The conductor (or anyone) is out on the platform, not aboard. */
  outsideTrain(pos: Vec2): boolean {
    return pos.x > HALF_WIDTH - 0.2;
  }

  /**
   * "All aboard!" (session 33): the bell rings, everyone looks up, the doors close in a moment and every second
   * saved is paid as an on-time bonus.
   */
  private ringBell(): void {
    const w = this.w;
    const j = w.journey;
    const bell = PLATFORM.bell;
    const rules = w.econ.bell;
    this.bellRungFor = j.stopSerial;
    this.bellAt = j.stopTime;
    // Phase 2: no clock, so no seconds saved (the stop bonus is the reward); a timed stop pays for every one.
    const saved = j.heldStops ? 0 : Math.max(0, j.timeLeft - rules.leaveIn);
    const bonus = Math.round(saved * rules.bonusPerSecond * w.train.count);
    w.audio.play('bell');
    w.haptics.light();
    w.particles.emit('sparkle', bell.x - 0.32, FLOOR_Y + 1.2, bell.z, 12, 0.35);
    w.guests.lookUp();
    if (bonus > 0) {
      w.wallet.add('cash', bonus, 'bell');
      w.ui.floatText(`+${bonus}`, bell.x, FLOOR_Y + 2.2, bell.z, 'cash');
      w.ui.floatIcon('clock', bell.x, FLOOR_Y + 2.7, bell.z, 'info');
    }
    if (j.heldStops) j.release(rules.leaveIn, true);
    else j.departIn(rules.leaveIn);
    w.analytics.log(EVENTS.stationBell, { seconds: Math.round(j.stopTime) });
    w.events.emit('station.bell', { byPlayer: true, x: bell.x, z: bell.z });
  }

  /** Bags on the luggage barrow and crates at the vendor, as part of the platform so they glide with it. */
  private layoutPlatformItems(): void {
    const group = this.view.group;
    this.view.setBarrowBags(this.luggagePile);
    while (this.crateMeshes.length < this.vendorCrates) {
      const mesh = createItemMesh('crate');
      group.add(mesh);
      this.crateMeshes.push(mesh);
    }
    this.crateMeshes.forEach((mesh, i) => {
      mesh.visible = i < this.vendorCrates;
      if (this.vendorZone) mesh.position.set(this.vendorZone.x + 0.9, FLOOR_Y + 0.9 + i * 0.36, this.vendorZone.z);
    });
  }
}
