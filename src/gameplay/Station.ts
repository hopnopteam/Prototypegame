import { CLASS_BY_ID } from '../config/classes';
import * as THREE from 'three';
import { STATIONS } from '../config/content';
import type { JourneyPhase, Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import { FLOOR_Y } from '../world/CarriageView';
import { createItemMesh } from '../world/ItemMeshes';
import { PLATFORM_X0 } from '../world/layout';
import { CLASSES, type ClassId } from '../config/classes';
import { PlatformView } from '../world/PlatformView';
import { PLATFORM } from '../world/platformLayout';
import { billboardTexture } from '../world/sprites';
import { DEFAULT_TRAIN_NAME } from '../config/press';
import { nextStreak, ratingEffect, stopQuality, stopRating, streakBonus } from '../sim/stationResult';
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
/** Where a new game's conductor stands on the platform: a few steps from the ticket stand's serving side. */
const PROLOGUE_SPAWN = { x: PLATFORM.serve.x + 0.35, z: PLATFORM.serve.z + 1.7 };
/** Travellers who turn up during a stop (out of the station house), and the window of the stop they come in. */
const LATECOMERS: [number, number] = [0, 2];
const LATE_WINDOW: [number, number] = [5, 22];

/**
 * The journey rhythm made physical (§5): the platform glides in and stops at the doors, guests board and
 * alight, luggage and vendor crates wait on the platform, and each stop ends with a result card and a bonus
 * for a clean stop. Nothing here can fail: guests who miss the train simply wait for the next one.
 */
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
    });
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
    this.view.setMarketing({ posters: has('posters'), band: has('band') }, name, livery.body, livery.trim);
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
    this.w.scenerySpanChanged?.();
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
    w.guests.spawnPlatformGuests([PLATFORM.window], null, ['basic'], rules.archetypes.slice(0, 1));
    this.prologueArrivals = rules.arrivals.slice(1, rules.travellers).map((at, i) => ({ at, archetype: rules.archetypes[i + 1] }));
    w.audio.setStationAmbience(true);
    this.prologueClock = 0;
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
    if (j.held) {
      if (w.train.covered) return;
      this.prologueOpenedAt = this.prologueClock;
      j.release(rules.afterOpenSec);
      return;
    }
    // Everyone with a ticket aboard (or the cap reached): the clock runs out and the train leaves.
    const outside = w.guests.list.some((g) => g.paid && (g.state === 'platform' || g.state === 'boarding'));
    const late = this.prologueClock - (this.prologueOpenedAt ?? 0) > rules.afterOpenSec + rules.holdCapSec;
    if (outside && !late && j.timeLeft < j.lastCallSeconds + 1) j.extend(dt);
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
      w.guests.onStationStop(w.journey.stopSerial);
      const station = this.currentStation();
      const newPostcard = w.meta.onStationVisited(station.id, station.name);
      w.ui.stationBanner(station.name, newPostcard ? 'album' : undefined);
      w.audio.play('whistle');
      w.audio.setStationAmbience(true);
      w.ftue('first_station');
    } else if (phase === 'departing' && previous === 'stationStop') {
      this.view.setFlag(true);
      this.closeDoors();
      this.finishStop();
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
    this.updateClock();
    if (this.prologue) this.updatePrologue(_dt);
    this.updateLatecomers();
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
    this.view.group.visible = visible;
    this.view.setOffset(this.platformOffset);
    if (visible) this.view.animate(_dt);
    // The platform's lamps light the deck, the waiting guests and the train's side as it slides in.
    const light = w.stage.lightMap;
    if (visible !== this.lampsShown) {
      this.lampsShown = visible;
      light.setPlatform(visible ? platformLightInput(this.view.lampAnchors, this.view.z0, this.view.z1) : null);
    }
    if (visible) light.setPlatformOffset(this.platformOffset);
    const zOffset = this.platformOffset;
    w.scenery.setHiddenRegion(visible ? { x0: PLATFORM_X0 - 0.2, x1: PLATFORM_X0 + 16, z0: this.view.z0 + zOffset - 2, z1: this.view.z1 + zOffset + 2 } : null);
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
    const count = Math.max(early, Math.min(econ.maxBoarders, filled + extra + drawn + w.stationPerks().passengers));
    const spots = new Array<Vec2>(count).fill(PLATFORM.window);
    const story = w.meta.storyGuestForStop();
    const guests = w.guests.spawnPlatformGuests(spots, story, this.travellerClasses(stopSerial, count));
    this.luggagePile = Math.min(this.view.barrowCapacity, guests.filter((g) => g.hasLuggage).length);
    // A traveller or two turns up during the stop, out of the station house (once the crowd is part of the ride).
    this.latecomers.length = 0;
    if (crowd) {
      for (let n = w.rng.int(LATECOMERS[0], LATECOMERS[1]); n > 0; n--) this.latecomers.push(w.rng.range(LATE_WINDOW[0], LATE_WINDOW[1]));
    }
    this.luggageTotal = this.luggagePile;
    this.vendorCrates = w.train.hasSupplyCar() ? w.econ.facilities.vendorCratesPerStop : 0;
    this.layoutPlatformItems();
  }

  /**
   * Who is waiting, by class: a traveller for every free bed of each class the train sells, the rest spread
   * across those classes, and now and then someone with a ticket for the next class up (once it can be bought),
   * who waits with a "no room" sign: the clearest nudge toward the next upgrade.
   */
  private travellerClasses(stopSerial: number, count: number): ClassId[] {
    const w = this.w;
    const capacity = w.train.classCapacity();
    const boardable: ClassId[] = [];
    for (const cls of capacity.keys()) for (let i = w.guests.bedsFree(stopSerial, cls); i > 0; i--) boardable.push(cls);
    const out = shuffled(boardable, w.rng).slice(0, count);
    const best = w.train.bestClass();
    const above = CLASSES.find((c) => c.tier > best.tier) ?? null;
    const weights: Partial<Record<ClassId, number>> = {};
    for (const [cls, n] of capacity) weights[cls] = n;
    while (out.length < count) {
      const richer = ratingEffect(w.trainRating(), w.econ.rating.richer.low, w.econ.rating.richer.high);
      if (above && w.progression.level >= above.level && w.rng.chance(w.econ.classes.aspirantChance * richer)) out.push(above.id);
      else out.push(capacity.size > 0 ? w.rng.weighted(weights) : 'basic');
    }
    return shuffled(out, w.rng);
  }

  /** Seconds into this stop each latecomer turns up (session 23). */
  private readonly latecomers: number[] = [];

  /** Latecomers come out of the station house while the stop is on (never in its last few seconds). */
  private updateLatecomers(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || this.prologue || this.latecomers.length === 0) return;
    if (j.timeLeft < j.lastCallSeconds + 4) {
      this.latecomers.length = 0;
      return;
    }
    for (let i = this.latecomers.length - 1; i >= 0; i--) {
      if (j.time < this.latecomers[i]) continue;
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
    w.audio.setStationAmbience(false);
    w.audio.play('depart');
  }

  private finishStop(): void {
    const w = this.w;
    const platform = w.guests.platformGuests();
    const onPlatform = platform.length;
    // Only guests who had a bed count against a perfect stop; the rest are demand, not a miss.
    const waiting = Math.min(onPlatform, w.guests.bedsFree());
    const leftBehind = onPlatform - waiting;
    // The first in line had the beds (they carry no "no room" sign), so they are the ones who missed it.
    const missed = platform.slice(0, waiting);
    w.feedback.onDeparture(missed, platform.slice(waiting));
    const storageFull = w.train.luggageStored >= w.train.luggageCapacity;
    const bagsDone = this.luggagePile === 0 || storageFull;
    const { bags: bagsLeft, refund: bagRefund } = this.chargeLeftBags(storageFull);
    const clean = waiting === 0 && bagsDone;
    const money = w.econ.money;
    const route = w.data.route;
    // The perfect streak (session 24): each perfect stop in a row grows the bonus; any other stop starts again.
    route.perfectStreak = nextStreak(route.perfectStreak ?? 0, clean);
    let bonusCash = 0;
    let streakExtra = 0;
    if (clean) {
      const base = money.stationBonusCash * (1 + money.stationBonusPerCarriage * (w.train.count - 1)) * (1 + w.stationPerks().stationBonus);
      const bonus = streakBonus(base, route.perfectStreak, money.perfectStreakStep, money.perfectStreakMax);
      bonusCash = bonus.total;
      streakExtra = bonus.extra;
      const door = w.map.doors()[0];
      w.cash.add('bonus', bonusCash, this.tmp.set(door.inside.x + 0.5, FLOOR_Y + 1.5, door.inside.z));
      w.addStars(w.econ.stars.cleanStationStop, 'cleanStop', door.inside);
      w.particles.emit('star', door.inside.x, FLOOR_Y + 1.2, door.inside.z, 16, 0.5);
      w.particles.emit('confetti', door.inside.x, FLOOR_Y + 2.2, door.inside.z, 40, 0.8);
      const p = w.player.pos;
      w.particles.emit('confetti', p.x, FLOOR_Y + 2.4, p.z, 30, 0.7);
      w.audio.play('perfect');
      w.audio.play('chest', { volume: 0.7 });
      w.haptics.success();
      w.meta.onCleanStop();
    }
    // Fix list 4.1: those who missed it go red in the face and stomp off to the station house, their fares lost
    // for good; the camera glances back at them once the soft cues are on, and the card shows the fares lost.
    const tutorial = w.coach?.tutorial ?? false;
    const showMissed = missed.length > 0 && w.feedback.cuesOn && !tutorial;
    let missedFare = 0;
    for (const guest of missed) missedFare += w.guests.estimatedFare(guest);
    let x = 0;
    let z = 0;
    missed.forEach((guest, i) => {
      x += guest.pos.x;
      z += guest.pos.z;
      w.guests.stormOff(guest, 0.25 + i * 0.3);
    });
    if (showMissed) {
      const glide = w.econ.feedback.missedGlide;
      if (!w.stage.rig.focusing) w.stage.rig.focusOn(this.tmp.set(x / missed.length, 0, z / missed.length + this.platformOffset), glide.seconds, glide.zoom);
    }
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
      rating: stopRating(waiting, bagsDone),
      earned: this.faresThisStop + this.tipsThisStop,
      streak: route.perfectStreak,
      streakBonus: streakExtra,
      missedFare,
      showMissed,
      bagsLeft,
      bagRefund,
      rating5: 0,
      ratingDelta: 0,
    };
    // The Train Rating (fix list 4.2): this stop's quality joins the recent ones.
    const before = w.trainRating();
    const quality = stopQuality(this.boardedThisStop, waiting, this.luggageLoadedThisStop, this.luggageTotal, bagsDone, w.feedback.mood, w.econ.rating.weights);
    const recent = (route.recentStops ??= []);
    // (Session 32: a stop during the first-passengers tutorial never counts against the rating.)
    if (!tutorial) recent.push(Math.round(quality * 1000) / 1000);
    while (recent.length > w.econ.rating.window) recent.shift();
    result.rating5 = w.trainRating();
    result.ratingDelta = result.rating5 - before;
    w.data.route.stopsCompleted++;
    w.save.markDirty();
    w.analytics.log(EVENTS.stationResult, {
      station: result.stationName,
      boarded: result.boarded,
      missed: result.waiting,
      bonus: result.clean,
      luggage_loaded: result.luggageLoaded,
      bags_left: result.bagsLeft,
      no_room: result.leftBehind,
      earned: result.earned,
      stars: Math.round(result.rating),
      streak: result.streak,
      stop_number: w.data.route.stopsCompleted,
      train_rating: Math.round(result.rating5 * 10) / 10,
    });
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
        zone.progress += (dt / w.econ.zones.boardIntervalSeconds) * actor.workMultiplier;
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
    return j.phase === 'stationStop' && !this.prologue && this.bellRungFor !== j.stopSerial && w.flow.allows('bell') && j.timeLeft > w.econ.bell.before;
  }

  /** "All aboard!": the bell rings, everyone on the platform looks up, and latecomers hurry out of the station house. */
  private ringBell(): void {
    const w = this.w;
    const j = w.journey;
    const bell = PLATFORM.bell;
    this.bellRungFor = j.stopSerial;
    w.audio.play('bell');
    w.haptics.light();
    w.particles.emit('sparkle', bell.x - 0.32, FLOOR_Y + 1.2, bell.z, 12, 0.35);
    w.ui.floatIcon('person', PLATFORM.houseDoor.x, FLOOR_Y + 2, PLATFORM.houseDoor.z, 'info');
    w.guests.lookUp();
    const stop = j.stopSerial;
    for (let i = 0; i < w.econ.bell.travellers; i++) {
      w.tweens.delay(0.6 + i * w.econ.bell.stagger, () => {
        if (j.phase !== 'stationStop' || j.stopSerial !== stop) return;
        w.guests.spawnLatecomer(this.travellerClasses(stop, 1)[0]);
      });
    }
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
