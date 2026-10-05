import * as THREE from 'three';
import { STATIONS } from '../config/content';
import type { JourneyPhase, Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import { FLOOR_Y } from '../world/CarriageView';
import { createItemMesh } from '../world/ItemMeshes';
import { PLATFORM_X0 } from '../world/layout';
import { CLASSES, type ClassId } from '../config/classes';
import { PlatformView } from '../world/PlatformView';
import { billboardTexture } from '../world/sprites';
import { DEFAULT_TRAIN_NAME } from '../config/press';
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
/** Where the first travellers wait on the Millbrook platform (along the lobby, in the opening's view). */
const PROLOGUE_WAIT_Z = 5.9;

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
  private readonly luggageMeshes: THREE.Mesh[] = [];
  private readonly crateMeshes: THREE.Mesh[] = [];
  private boardingZone!: Zone;
  private luggageZone!: Zone;
  private vendorZone!: Zone;
  private boardedThisStop = 0;
  private alightedThisStop = 0;
  private tipsThisStop = 0;
  private starsAtArrival = 0;
  private luggageLoadedThisStop = 0;
  private readonly tmp = new THREE.Vector3();
  /**
   * The opening at Millbrook (config: flow `prologue`): the train stands at the platform with the clock held
   * until the travellers it has rooms for are aboard. Travellers step aboard by themselves as rooms open.
   */
  prologue = false;
  /** Seconds a traveller on the Millbrook platform has had a free bed (they step aboard after a beat). */
  private prologueWait = 0;

  constructor(private readonly w: World) {
    w.scene.add(this.view.group);
    w.events.on('luggage.loaded', () => this.luggageLoadedThisStop++);
    w.events.on('guest.alighted', () => this.alightedThisStop++);
    w.events.on('guest.boarded', () => this.boardedThisStop++);
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
  refreshMarketing(fresh = false): void {
    const w = this.w;
    const has = (key: string): boolean => w.unlocks.isUnlocked(`st.${key}`);
    const livery = w.currentLivery();
    const name = w.data.press.trainName ?? DEFAULT_TRAIN_NAME;
    this.view.setMarketing({ posters: has('posters'), band: has('band') }, name, livery.body, livery.trim);
    const boards = has('billboard');
    const key = `${boards}|${name}|${livery.body}`;
    if (key !== this.billboardKey) {
      this.billboardKey = key;
      w.scenery.setBillboards(boards ? billboardTexture(name, livery.body, livery.trim) : null, BILLBOARD_COUNT);
    }
    if (fresh) {
      w.audio.play('fanfare');
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
    if (!this.luggageZone) return;
    const pile = PlatformView.luggagePilePosition(luggage);
    this.luggageZone.moveTo(pile.x, pile.z);
    if (supply !== null) {
      const vendor = PlatformView.vendorPosition(supply);
      this.vendorZone.moveTo(vendor.x, vendor.z);
    }
    this.layoutPlatformItems();
    this.w.scenerySpanChanged?.();
  }

  /**
   * A brand-new game opens here (session 17, owner: "where guests are coming from"): standing at Millbrook,
   * doors open, the platform alongside. One guest has already stepped in and waits at the desk; a traveller
   * waits outside with a "no room" sign, because the one ready cabin is spoken for. Build a cabin and they walk
   * aboard; once everyone the train has a bed for is inside, the last call sounds and it pulls out. Passengers
   * only ever come from a station platform.
   */
  startPrologue(): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop' || !j.held) return;
    this.prologue = true;
    this.prologueWait = 0;
    this.spawnedForStop = j.stopSerial;
    w.map.setDoorsOpen(true);
    w.train.setDoors(true);
    this.platformOffset = 0;
    this.view.setOffset(0);
    this.view.setHeadline(`${this.currentStation().name} awaits the night train`);
    const count = w.econ.flow.prologue.travellers;
    w.guests.spawnPlatformGuests(this.prologueSpots(count), null, new Array<ClassId>(count).fill('basic'));
    w.audio.setStationAmbience(true);
  }

  /** At Millbrook: whoever has a bed steps aboard; when nobody is left outside, the train gets ready to go. */
  private updatePrologue(dt: number): void {
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'stationStop') {
      this.prologue = false;
      return;
    }
    if (!j.held) return;
    const rules = w.econ.flow.prologue;
    if (w.guests.hasBoarder()) {
      this.prologueWait += dt;
      if (this.prologueWait >= rules.boardDelay) {
        this.prologueWait = 0;
        const guest = w.guests.boardNext(false);
        guest?.view.act('wave', 0.8);
      }
      return;
    }
    this.prologueWait = 0;
    const outside = w.guests.list.some((g) => g.state === 'platform' || (g.state === 'boarding' && g.pos.x > w.map.doors()[0].inside.x + 0.3));
    if (!outside) j.release(rules.lastCallSeconds);
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
    this.w.audio.play('chime');
  }

  update(_dt: number): void {
    const w = this.w;
    const j = w.journey;
    if (this.prologue) this.updatePrologue(_dt);
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
    this.view.setNight(w.stage.lighting.night);
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
    // Marketing (posters, billboard, band) draws a few more travellers each stop.
    const count = Math.max(early, Math.min(econ.maxBoarders, free + extra + w.stationPerks().passengers));
    const spots = this.waitingSpots(count);
    const story = w.meta.storyGuestForStop();
    const guests = w.guests.spawnPlatformGuests(spots, story, this.travellerClasses(stopSerial, count));
    this.luggagePile = guests.filter((g) => g.hasLuggage).length;
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
      if (above && w.progression.level >= above.level && w.rng.chance(w.econ.classes.aspirantChance)) out.push(above.id);
      else out.push(capacity.size > 0 ? w.rng.weighted(weights) : 'basic');
    }
    return shuffled(out, w.rng);
  }

  /**
   * At Millbrook the travellers wait further down the platform, beside the lobby's windows, where the opening's
   * camera (on the desk) sees them; boarding, they walk along the platform to the door.
   */
  private prologueSpots(count: number): Vec2[] {
    const door = this.w.map.doors()[0];
    const spots: Vec2[] = [];
    for (let i = 0; i < count; i++) spots.push({ x: door.outside.x - 0.25 + (i % 2) * 0.6, z: PROLOGUE_WAIT_Z + i * 0.7 });
    return spots;
  }

  private waitingSpots(count: number): Vec2[] {
    const door = this.w.map.doors()[0];
    const spots: Vec2[] = [];
    for (let i = 0; i < count; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      spots.push({ x: door.outside.x + 1.3 + col * 0.75, z: door.outside.z - 1.2 + row * 0.8 + (col % 2) * 0.25 });
    }
    return spots;
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
    w.audio.setStationAmbience(false);
    w.audio.play('whistle');
  }

  private finishStop(): void {
    const w = this.w;
    const platform = w.guests.platformGuests();
    const onPlatform = platform.length;
    // Only guests who had a bed count against a perfect stop; the rest are demand, not a miss.
    const waiting = Math.min(onPlatform, w.guests.bedsFree());
    const leftBehind = onPlatform - waiting;
    // The first in line had the beds (they carry no "no room" sign), so they are the ones who missed it.
    w.feedback.onDeparture(platform.slice(0, waiting), platform.slice(waiting));
    const storageFull = w.train.luggageStored >= w.train.luggageCapacity;
    const clean = waiting === 0 && (this.luggagePile === 0 || storageFull);
    let bonusCash = 0;
    if (clean) {
      bonusCash = Math.round(w.econ.money.stationBonusCash * (1 + w.econ.money.stationBonusPerCarriage * (w.train.count - 1)) * (1 + w.stationPerks().stationBonus));
      const door = w.map.doors()[0];
      w.cash.add('bonus', bonusCash, this.tmp.set(door.inside.x + 0.5, FLOOR_Y + 1.5, door.inside.z));
      w.addStars(w.econ.stars.cleanStationStop, 'cleanStop', door.inside);
      w.particles.emit('star', door.inside.x, FLOOR_Y + 1.2, door.inside.z, 16, 0.5);
      w.particles.emit('confetti', door.inside.x, FLOOR_Y + 2.2, door.inside.z, 40, 0.8);
      w.audio.play('chest');
      w.haptics.success();
      w.meta.onCleanStop();
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
    };
    w.data.route.stopsCompleted++;
    w.save.markDirty();
    w.analytics.log(EVENTS.stationResult, {
      station: result.stationName,
      boarded: result.boarded,
      missed: result.waiting,
      bonus: result.clean,
      luggage_loaded: result.luggageLoaded,
      stop_number: w.data.route.stopsCompleted,
    });
    w.events.emit('station.result', result);
    w.ui.showResult(result);
    w.setFlag('firstStationDone');
    this.luggagePile = 0;
    this.vendorCrates = 0;
    this.layoutPlatformItems();
    w.staff.dismissTemporary();
  }

  private clearPlatform(): void {
    this.w.guests.removePlatformGuests();
    this.luggagePile = 0;
    this.vendorCrates = 0;
    this.layoutPlatformItems();
  }

  private createZones(): void {
    const w = this.w;
    const door = w.map.doors()[0];
    this.boardingZone = w.zones.add(new Zone({
      id: 'board',
      x: door.outside.x + 0.15,
      z: door.outside.z,
      radius: 0.6,
      icon: 'ticket',
      active: () => w.journey.doorsOpen && w.guests.canBoard(),
      hideWhenInactive: true,
      stay: (zone, actor, dt) => {
        if (!w.guests.canBoard()) return false;
        zone.progress += (dt / w.econ.zones.boardIntervalSeconds) * actor.workMultiplier;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        const guest = w.guests.boardNext(actor.isPlayer);
        if (guest) {
          w.audio.play('punch');
          if (actor.isPlayer) w.haptics.light();
          w.particles.emit('sparkle', guest.pos.x, FLOOR_Y + 1.2, guest.pos.z, 4, 0.2);
        }
        return true;
      },
    }));

    const pile = PlatformView.luggagePilePosition(w.train.indexOfType('luggage'));
    const luggagePoint = new THREE.Vector3();
    const luggageSpec: SourceSpec = {
      kind: 'luggage',
      point: () => luggagePoint.set(this.luggageZone.x, FLOOR_Y + 0.4, this.luggageZone.z + 0.8),
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
      x: pile.x,
      z: pile.z,
      radius: 0.62,
      icon: 'luggage',
      active: () => w.journey.doorsOpen && sourceActive(w, luggageSpec),
      highlight: () => w.demand.playerWants('luggage') > 0,
      hideWhenInactive: true,
      stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, luggageSpec),
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
      x: vendor.x,
      z: vendor.z,
      radius: 0.6,
      icon: 'crate',
      active: () => w.journey.doorsOpen && sourceActive(w, vendorSpec),
      highlight: () => w.demand.playerWants('crate') > 0,
      hideWhenInactive: true,
      stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, vendorSpec),
    }));
  }

  /** Suitcases and crates on the platform, as children of the platform so they glide with it. */
  private layoutPlatformItems(): void {
    const group = this.view.group;
    while (this.luggageMeshes.length < this.luggagePile) {
      const mesh = createItemMesh('luggage');
      group.add(mesh);
      this.luggageMeshes.push(mesh);
    }
    this.luggageMeshes.forEach((mesh, i) => {
      mesh.visible = i < this.luggagePile;
      if (this.luggageZone) mesh.position.set(this.luggageZone.x + ((i % 2) - 0.5) * 0.55, FLOOR_Y + 0.22 + Math.floor(i / 4) * 0.3, this.luggageZone.z + 0.9 + (Math.floor(i / 2) % 2) * 0.4);
      mesh.rotation.y = (i % 3) * 0.3;
    });
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
