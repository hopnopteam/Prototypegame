import * as THREE from 'three';
import { STATIONS } from '../config/content';
import type { JourneyPhase, Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import { FLOOR_Y } from '../world/CarriageView';
import { createItemMesh } from '../world/ItemMeshes';
import { PLATFORM_X0 } from '../world/layout';
import { PlatformView } from '../world/PlatformView';
import type { StationResult } from './events';
import { sourceActive, sourceStay, type SourceSpec } from './Pickup';
import type { World } from './World';
import { Zone } from './Zones';

const APPROACH_MARGIN = 40;
const DEPART_HIDE_DISTANCE = 70;

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

  constructor(private readonly w: World) {
    w.scene.add(this.view.group);
    w.events.on('luggage.loaded', () => this.luggageLoadedThisStop++);
    w.events.on('guest.alighted', () => this.alightedThisStop++);
    w.events.on('guest.boarded', () => this.boardedThisStop++);
  }

  init(): void {
    this.createZones();
    this.onTrainChanged();
    this.view.setStationName(this.currentStation().name);
    // The sign is painted on canvas: repaint once the embedded display font is ready.
    document.fonts?.ready.then(() => this.view.setStationName(this.currentStation().name)).catch(() => undefined);
  }

  currentStation(): (typeof STATIONS)[number] {
    return STATIONS[this.w.journey.stationIndex % STATIONS.length];
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

  /** Train grew: platform geometry, luggage pile and vendor move to match. */
  onTrainChanged(): void {
    const train = this.w.train;
    const supply = train.indexOfType('supply');
    const luggage = train.indexOfType('luggage');
    this.view.build(this.w.map.rearZ, supply, luggage);
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

  onPhase(phase: JourneyPhase, previous: JourneyPhase): void {
    const w = this.w;
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
      w.ui.stationBanner(station.name, newPostcard ? 'All aboard · New postcard' : 'All aboard');
      w.audio.play('whistle');
      w.audio.setStationAmbience(true);
      w.ftue('first_station');
    } else if (phase === 'departing' && previous === 'stationStop') {
      this.closeDoors();
      this.finishStop();
    } else if (phase === 'onTheMove' && previous === 'departing') {
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
    this.view.group.visible = visible;
    this.view.setOffset(this.platformOffset);
    this.view.setNight(w.stage.lighting.night);
    const zOffset = this.platformOffset;
    w.scenery.setHiddenRegion(visible ? { x0: PLATFORM_X0 - 0.2, x1: PLATFORM_X0 + 16, z0: this.view.z0 + zOffset - 2, z1: this.view.z1 + zOffset + 2 } : null);
  }

  private prepareStop(stopSerial: number): void {
    const w = this.w;
    this.spawnedForStop = stopSerial;
    w.guests.removePlatformGuests();
    const econ = w.econ.guests;
    const staying = w.guests.stayingPast(stopSerial);
    const free = Math.max(0, w.train.openCabinCount() - staying);
    const extra = w.rng.int(econ.extraBoarders[0], econ.extraBoarders[1]);
    const room = Math.max(0, w.guests.queueCapacity - w.guests.queue.length);
    // Enough guests to fill the free cabins plus a couple waiting (a reason to clean and unlock), but
    // never a crowd that piles up stop after stop when every cabin is full.
    const wanted = free + extra - w.guests.queue.length;
    const early = w.data.route.stopsCompleted < 2 ? econ.minBoarders : 1;
    const count = Math.min(room, Math.max(early, Math.min(econ.maxBoarders, wanted)));
    const spots = this.waitingSpots(count);
    const story = w.meta.storyGuestForStop();
    const guests = w.guests.spawnPlatformGuests(spots, story);
    this.luggagePile = guests.filter((g) => g.hasLuggage).length;
    this.luggageTotal = this.luggagePile;
    this.vendorCrates = w.train.hasSupplyCar() ? w.econ.facilities.vendorCratesPerStop : 0;
    this.layoutPlatformItems();
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
    w.train.setDoors(false);
    w.audio.setStationAmbience(false);
    w.audio.play('whistle');
  }

  private finishStop(): void {
    const w = this.w;
    const waiting = w.guests.platformGuests().length;
    const storageFull = w.train.luggageStored >= w.train.luggageCapacity;
    const clean = waiting === 0 && (this.luggagePile === 0 || storageFull);
    let bonusCash = 0;
    if (clean) {
      bonusCash = Math.round(w.econ.money.stationBonusCash * (1 + w.econ.money.stationBonusPerCarriage * (w.train.count - 1)));
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
      active: () => w.journey.doorsOpen && w.guests.platformGuests().length > 0,
      hideWhenInactive: true,
      stay: (zone, actor, dt) => {
        if (w.guests.queue.length >= w.guests.queueCapacity) return false;
        zone.progress += (dt / w.econ.zones.boardIntervalSeconds) * actor.workMultiplier;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        const guest = w.guests.boardNext();
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
