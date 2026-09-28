import * as THREE from 'three';
import { BEDDING_FARE_BONUS, ROUTE1_CARRIAGES, UNLOCKS, type UnlockDef } from '../config/content';
import { easeOutBack, easeOutCubic } from '../core/math';
import type { CarriageType, ItemKind, Vec2 } from '../core/types';
import { CarriageView, FLOOR_Y } from '../world/CarriageView';
import { carriageOriginZ, getLayout, type BathroomLayout, type CabinLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { GeoBuilder } from '../world/geo';
import { MATERIALS } from '../world/materials';
import { PALETTE } from '../world/palette';
import { GANGWAY_LENGTH, REAR_DECK_LENGTH } from '../world/layout';
import type { Actor } from './Actor';
import type { Guest } from './Guests';
import type { World } from './World';
import { Zone } from './Zones';

const SOURCE_DWELL = 0.18;

export class Cabin {
  readonly id: string;
  unlocked = false;
  /** Occupant, or the guest walking to it after check-in. */
  guest: Guest | null = null;
  readonly dirty = [false, false, false];
  readonly center: Vec2;
  readonly spots: Vec2[];
  readonly bedPose: Vec2;
  readonly tipPile: Vec2;
  readonly node: string;
  readonly pileId: string;
  requestZone: Zone | null = null;
  spotZones: Zone[] = [];
  /** Staff member walking here to clean it. */
  cleaner: Actor | null = null;

  constructor(readonly carriage: number, readonly layout: CabinLayout, originZ: number) {
    this.id = `c${carriage}_${layout.index}`;
    const w = (p: Vec2): Vec2 => ({ x: p.x, z: p.z + originZ });
    this.center = w(layout.center);
    this.spots = layout.spots.map(w);
    this.bedPose = w(layout.bedPose);
    this.tipPile = w(layout.tipPile);
    this.node = `c${carriage}:${layout.node}`;
    this.pileId = `cabin:${this.id}`;
  }

  get index(): number {
    return this.layout.index;
  }

  get isDirty(): boolean {
    return this.dirty[0] || this.dirty[1] || this.dirty[2];
  }

  get isFree(): boolean {
    return this.unlocked && !this.guest && !this.isDirty;
  }
}

export class Bathroom {
  readonly id: string;
  unlocked = false;
  occupant: Guest | null = null;
  readonly waiting: Guest[] = [];
  readonly restock: Vec2;
  readonly useSpot: Vec2;
  readonly node: string;
  readonly useNode: string;
  readonly pileId: string;
  restocker: Actor | null = null;

  constructor(readonly carriage: number, readonly layout: BathroomLayout, originZ: number, public towels: number, public rolls: number) {
    this.id = `c${carriage}_b${layout.index}`;
    this.restock = { x: layout.restock.x, z: layout.restock.z + originZ };
    this.useSpot = { x: layout.useSpot.x, z: layout.useSpot.z + originZ };
    this.node = `c${carriage}:${layout.node}`;
    this.useNode = `c${carriage}:${layout.useNode}`;
    this.pileId = `bath:${this.id}`;
  }

  get stocked(): boolean {
    return this.towels > 0 && this.rolls > 0;
  }
}

const tmp = new THREE.Vector3();

/** Floor, brass railing and a lamp: the little rear platform where new carriages couple on. */
function buildRearDeck(): THREE.Group {
  const b = new GeoBuilder();
  const y = FLOOR_Y;
  const z0 = GANGWAY_LENGTH;
  const z1 = GANGWAY_LENGTH + REAR_DECK_LENGTH;
  b.box(0, (0.4 + y) / 2, GANGWAY_LENGTH / 2, 1.5, y - 0.4, GANGWAY_LENGTH, PALETTE.undercarriage);
  b.box(0, y - 0.02, GANGWAY_LENGTH / 2, 1.4, 0.04, GANGWAY_LENGTH, PALETTE.floorPlank);
  b.box(0, (0.35 + y) / 2, (z0 + z1) / 2, 2.8, y - 0.35, REAR_DECK_LENGTH, PALETTE.trainBodyDark);
  b.box(0, y - 0.02, (z0 + z1) / 2, 2.7, 0.04, REAR_DECK_LENGTH - 0.1, PALETTE.floorPlank);
  for (const x of [-1.35, 1.35]) b.box(x, y + 0.45, (z0 + z1) / 2, 0.06, 0.06, REAR_DECK_LENGTH, PALETTE.brass);
  b.box(0, y + 0.45, z1 - 0.03, 2.76, 0.06, 0.06, PALETTE.brass);
  for (const [x, z] of [[-1.35, z0], [1.35, z0], [-1.35, z1], [1.35, z1], [0, z1]]) b.box(x, y + 0.23, z, 0.06, 0.46, 0.06, PALETTE.brass);
  b.cylinder(1.2, y + 0.9, z1 - 0.1, 0.04, 0.05, 0.9, PALETTE.ink, 6);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), MATERIALS.solid));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MATERIALS.lamp);
  lamp.position.set(1.2, y + 1.4, z1 - 0.1);
  group.add(lamp);
  return group;
}

/**
 * The train: carriages and their views, cabins, bathrooms, supplies and luggage storage, every fixture's
 * walk-over zone, and the coupling moment when a new carriage rolls in (the signature progress beat, §6).
 */
export class TrainState {
  readonly group = new THREE.Group();
  readonly loco = new LocomotiveView();
  readonly views: CarriageView[] = [];
  readonly cabins: Cabin[] = [];
  readonly bathrooms: Bathroom[] = [];
  types: CarriageType[] = [];
  beddingLevel: number[] = [];
  luggageStored = 0;
  coupling = false;
  private doorTarget = 0;
  private doorAmount = 0;
  private smokeTimer = 0;
  private jolt = 0;
  /** The open observation deck behind the last carriage, where the coupling tile sits. */
  private readonly deck: THREE.Group;

  constructor(private readonly w: World) {
    this.group.add(this.loco.group);
    this.deck = buildRearDeck();
    this.group.add(this.deck);
  }

  /** Builds the train from the save: one carriage plus every coupling already bought. */
  init(): void {
    const coupled = ROUTE1_CARRIAGES.filter((_, i) => i === 0 || this.w.unlocks.isUnlocked(`couple_${i}`)).length;
    for (let i = 0; i < coupled; i++) this.addCarriage(ROUTE1_CARRIAGES[i].type, false);
    this.rebuildMap();
  }

  get count(): number {
    return this.types.length;
  }

  get rearZ(): number {
    return this.w.map.rearZ;
  }

  indexOfType(type: CarriageType): number | null {
    const i = this.types.indexOf(type);
    return i >= 0 ? i : null;
  }

  get luggageCapacity(): number {
    let capacity = this.w.econ.facilities.lobbyRackCapacity;
    if (this.indexOfType('luggage') !== null) capacity += this.w.econ.facilities.luggageCarCapacity;
    return capacity;
  }

  get supplyTowel(): number {
    return this.w.data.facilities.supplyTowel;
  }

  get supplyRoll(): number {
    return this.w.data.facilities.supplyRoll;
  }

  hasSupplyCar(): boolean {
    return this.indexOfType('supply') !== null;
  }

  fareBonus(cabin: Cabin): number {
    return (this.beddingLevel[cabin.carriage] ?? 0) * BEDDING_FARE_BONUS;
  }

  /** The best free cabin for a new guest: the lowest carriage first, so walks stay short. */
  freeCabin(): Cabin | null {
    for (const cabin of this.cabins) if (cabin.isFree) return cabin;
    return null;
  }

  openCabinCount(): number {
    return this.cabins.filter((c) => c.unlocked).length;
  }

  setDoors(open: boolean): void {
    this.doorTarget = open ? 1 : 0;
    this.w.audio.play('door');
  }

  /** Applies a completed unlock tile to the train. */
  applyUnlock(def: UnlockDef, animate: boolean): void {
    switch (def.kind) {
      case 'cabin': {
        const cabin = this.cabins.find((c) => c.carriage === def.carriage && c.index === def.cabin);
        if (cabin) this.unlockCabin(cabin, animate);
        break;
      }
      case 'bathroom': {
        const bath = this.bathrooms.find((b) => b.carriage === def.carriage && b.layout.index === def.bathroom);
        if (bath) this.unlockBathroom(bath, animate);
        break;
      }
      case 'bedding':
        this.beddingLevel[def.carriage] = (this.beddingLevel[def.carriage] ?? 0) + 1;
        if (animate) this.celebrateBeds(def.carriage);
        break;
      case 'couple':
        if (animate) this.coupleNext();
        break;
      default:
        break;
    }
  }

  /** Rolls the next carriage in from off-screen and couples it with a clunk. */
  coupleNext(onDone?: () => void): void {
    const index = this.types.length;
    const plan = ROUTE1_CARRIAGES[index];
    if (!plan || this.coupling) return;
    this.coupling = true;
    const view = new CarriageView(getLayout(plan.type), index);
    const targetZ = carriageOriginZ(index);
    const startZ = targetZ + 48;
    view.group.position.z = startZ;
    this.group.add(view.group);
    this.syncCarriageView(view, index, plan.type);
    const w = this.w;
    w.stage.rig.focusOn(new THREE.Vector3(0, 0, targetZ + 2), 3.6, 1.3);
    w.audio.play('whistleShort');
    w.tweens.run(2.3, (t) => {
      view.group.position.z = startZ + (targetZ - startZ) * t;
    }, {
      ease: easeOutCubic,
      delay: 0.5,
      complete: () => {
        view.group.position.z = targetZ;
        this.group.remove(view.group);
        this.addCarriage(plan.type, true, view);
        this.rebuildMap();
        w.audio.play('clunk');
        w.audio.play('fanfare');
        w.haptics.heavy();
        w.stage.rig.shake(0.45, 0.5);
        this.jolt = 1;
        const cz = targetZ - 0.6;
        w.particles.emit('dust', 0, FLOOR_Y + 0.3, cz, 28, 1.2);
        w.particles.emit('confetti', 0, FLOOR_Y + 2.5, targetZ + 2, 60, 1.5);
        w.ui.celebrate(plan.name, 'Coupled!', 'carriage');
        w.events.emit('carriage.coupled', { index, type: plan.type });
        this.coupling = false;
        onDone?.();
      },
    });
  }

  update(dt: number): void {
    const w = this.w;
    const speed = w.journey.speed;
    this.loco.update(dt, speed);

    // Doors slide open at stations.
    if (this.doorAmount !== this.doorTarget) {
      this.doorAmount += Math.sign(this.doorTarget - this.doorAmount) * dt * 2.2;
      this.doorAmount = Math.min(1, Math.max(0, this.doorAmount));
      for (const view of this.views) view.setDoorOpen(this.doorAmount);
    }

    // Chimney smoke streams back with speed; gentle steam at stops.
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      const c = this.loco.chimneyTop;
      if (speed > 0.5) {
        w.particles.emit('smoke', c.x, c.y, c.z, 1, 0.1, { x: 0, y: 0.4, z: speed * 0.55 });
        this.smokeTimer = 0.12 + 0.4 * (1 - speed / w.econ.journey.cruiseSpeed);
      } else {
        w.particles.emit('steam', c.x, c.y - 0.2, c.z, 1, 0.1);
        this.smokeTimer = 0.9;
      }
    }

    // A small jolt through the whole train when a carriage couples.
    if (this.jolt > 0) {
      this.jolt = Math.max(0, this.jolt - dt * 2.5);
      const offset = Math.sin(this.jolt * Math.PI * 3) * 0.12 * this.jolt;
      this.views.forEach((v, i) => (v.group.position.z = carriageOriginZ(i) + offset));
    }

    // Keep visuals in sync with state (cheap: a handful of visibility flags).
    for (const cabin of this.cabins) this.views[cabin.carriage]?.setDirt(cabin.index, cabin.dirty);
    for (const bath of this.bathrooms) this.views[bath.carriage]?.setBathroomStock(bath.layout.index, bath.towels, bath.rolls);
    const supply = this.indexOfType('supply');
    if (supply !== null) this.views[supply].setShelfStock(Math.ceil(this.supplyTowel / 1), Math.ceil(this.supplyRoll / 1));
    const lobbyCap = w.econ.facilities.lobbyRackCapacity;
    this.views[0]?.setLuggageCount(Math.min(lobbyCap, this.luggageStored));
    const luggage = this.indexOfType('luggage');
    if (luggage !== null) this.views[luggage].setLuggageCount(Math.max(0, this.luggageStored - lobbyCap));
  }

  private addCarriage(type: CarriageType, animate: boolean, existingView?: CarriageView): void {
    const index = this.types.length;
    const view = existingView ?? new CarriageView(getLayout(type), index);
    view.group.position.z = carriageOriginZ(index);
    this.group.add(view.group);
    this.views.push(view);
    this.types.push(type);
    this.beddingLevel[index] = UNLOCKS.filter((u) => u.kind === 'bedding' && u.carriage === index && this.w.unlocks.isUnlocked(u.id)).length;
    const layout = getLayout(type);
    const originZ = carriageOriginZ(index);

    for (const cl of layout.cabins) {
      const cabin = new Cabin(index, cl, originZ);
      const alwaysOpen = type === 'lobby' && cl.index === 0;
      cabin.unlocked = alwaysOpen || this.w.unlocks.isUnlocked(`cabin_${index}_${cl.index}`);
      view.setCabinLocked(cl.index, !cabin.unlocked);
      this.cabins.push(cabin);
      this.createCabinZones(cabin);
    }

    const facilities = this.w.data.facilities;
    for (const bl of layout.bathrooms) {
      const saved = facilities.bathrooms[bl.index];
      const bath = new Bathroom(index, bl, originZ, saved?.towel ?? this.w.econ.facilities.bathroomTowelMax, saved?.roll ?? this.w.econ.facilities.bathroomRollMax);
      bath.unlocked = bl.index === 0 || this.w.unlocks.isUnlocked(`bath_${index}_${bl.index}`);
      view.setBathroomLocked(bl.index, !bath.unlocked);
      this.bathrooms.push(bath);
      this.createBathroomZones(bath);
    }

    if (type === 'supply') {
      if (facilities.supplyTowel < 0) facilities.supplyTowel = this.w.econ.facilities.supplyShelfStart;
      if (facilities.supplyRoll < 0) facilities.supplyRoll = this.w.econ.facilities.supplyShelfStart;
    }
    this.createFixtureZones(index, type);
    if (animate) this.popIn(view.group);
  }

  private syncCarriageView(view: CarriageView, index: number, type: CarriageType): void {
    const layout = getLayout(type);
    for (const cl of layout.cabins) view.setCabinLocked(cl.index, !(this.w.unlocks.isUnlocked(`cabin_${index}_${cl.index}`)));
    for (const bl of layout.bathrooms) view.setBathroomLocked(bl.index, bl.index !== 0);
  }

  rebuildMap(): void {
    const w = this.w;
    const moreToCome = ROUTE1_CARRIAGES.length > this.types.length;
    w.map.rebuild(this.types, w.journey.doorsOpen, moreToCome);
    this.deck.visible = moreToCome;
    this.deck.position.z = w.map.rearZ;
    w.station?.onTrainChanged();
    // Anyone left where a wall now stands is gently moved onto the floor.
    if (w.player) {
      const p = w.map.walk.nearestWalkable(w.player.pos.x, w.player.pos.z);
      w.player.pos.x = p.x;
      w.player.pos.z = p.z;
    }
  }

  private unlockCabin(cabin: Cabin, animate: boolean): void {
    cabin.unlocked = true;
    const view = this.views[cabin.carriage];
    view.setCabinLocked(cabin.index, false);
    if (animate) {
      const bed = view.cabinBeds[cabin.index];
      if (bed) this.popIn(bed);
      this.w.particles.emit('sparkle', cabin.center.x, FLOOR_Y + 0.6, cabin.center.z, 18, 0.6);
    }
  }

  private unlockBathroom(bath: Bathroom, animate: boolean): void {
    bath.unlocked = true;
    const view = this.views[bath.carriage];
    view.setBathroomLocked(bath.layout.index, false);
    if (animate) {
      const fixtures = view.bathroomFixtures[bath.layout.index];
      if (fixtures) this.popIn(fixtures);
      this.w.particles.emit('sparkle', bath.restock.x, FLOOR_Y + 0.6, bath.restock.z, 18, 0.8);
    }
  }

  private celebrateBeds(carriage: number): void {
    for (const cabin of this.cabins) {
      if (cabin.carriage !== carriage || !cabin.unlocked) continue;
      this.w.particles.emit('sparkle', cabin.bedPose.x, FLOOR_Y + 0.6, cabin.bedPose.z, 8, 0.5);
      const bed = this.views[carriage].cabinBeds[cabin.index];
      if (bed) this.popIn(bed, 0.8);
    }
  }

  /** Things pop into existence with a scale bounce (§ juice). */
  popIn(object: THREE.Object3D, from = 0.2): void {
    object.scale.setScalar(from);
    this.w.tweens.run(0.5, (t) => object.scale.setScalar(from + (1 - from) * t), { ease: easeOutBack });
  }

  private createCabinZones(cabin: Cabin): void {
    const w = this.w;
    w.cash.create(cabin.pileId, cabin.tipPile.x, cabin.tipPile.z);
    cabin.requestZone = w.zones.add(new Zone({
      id: `req:${cabin.id}`,
      x: cabin.center.x,
      z: cabin.center.z,
      radius: 0.62,
      icon: null,
      ring: true,
      hideWhenInactive: true,
      active: () => w.guests.requestFor(cabin) !== null,
      stay: (zone, actor, dt) => w.guests.deliverStay(cabin, zone, actor, dt),
    }));
    cabin.spotZones = cabin.spots.map((spot, i) => w.zones.add(new Zone({
      id: `spot:${cabin.id}:${i}`,
      x: spot.x,
      z: spot.z,
      radius: 0.36,
      icon: null,
      color: '#F2E6C9',
      hideWhenInactive: true,
      active: () => cabin.dirty[i] && !cabin.guest,
      stay: (zone, actor, dt) => {
        zone.progress += (dt / w.econ.zones.cleanSpotSeconds) * actor.workMultiplier;
        if (zone.progress < 1) {
          if (Math.random() < dt * 6) w.particles.emit('sparkle', spot.x, FLOOR_Y + 0.1, spot.z, 1, 0.2);
          return true;
        }
        zone.progress = 0;
        cabin.dirty[i] = false;
        w.audio.play('scrub');
        w.audio.play('sparkle', { volume: 0.6 });
        w.particles.emit('sparkle', spot.x, FLOOR_Y + 0.2, spot.z, 10, 0.3);
        w.events.emit('spot.cleaned', { x: spot.x, z: spot.z, byPlayer: actor.isPlayer });
        if (!cabin.isDirty) {
          cabin.cleaner = null;
          w.audio.play('ding');
          w.particles.emit('star', cabin.center.x, FLOOR_Y + 0.8, cabin.center.z, 8, 0.4);
          w.addStars(w.econ.stars.cabinCleaned, 'clean', cabin.center);
          if (actor.isPlayer) w.setFlag('firstCabinCleaned');
          w.events.emit('cabin.cleaned', { byPlayer: actor.isPlayer, x: cabin.center.x, z: cabin.center.z });
        }
        return true;
      },
    })));
  }

  private createBathroomZones(bath: Bathroom): void {
    const w = this.w;
    const max = w.econ.facilities;
    w.cash.create(bath.pileId, bath.restock.x + 0.55, bath.restock.z + 1.0);
    w.zones.add(new Zone({
      id: `restock:${bath.id}`,
      x: bath.restock.x,
      z: bath.restock.z,
      radius: 0.6,
      icon: 'towel',
      active: () => bath.unlocked && (bath.towels < max.bathroomTowelMax || bath.rolls < max.bathroomRollMax),
      hideWhenInactive: false,
      stay: (zone, actor, dt) => {
        zone.timer += dt * actor.workMultiplier;
        if (zone.timer < w.econ.zones.dropIntervalSeconds) return true;
        zone.timer = 0;
        const target = (): THREE.Vector3 => tmp.set(bath.restock.x + 1.2, FLOOR_Y + 0.8, bath.restock.z);
        if (bath.towels < max.bathroomTowelMax && actor.stack.has('towel')) {
          actor.stack.remove('towel', target);
          bath.towels++;
        } else if (bath.rolls < max.bathroomRollMax && actor.stack.has('roll')) {
          actor.stack.remove('roll', target);
          bath.rolls++;
        } else {
          return false;
        }
        w.audio.play('drop');
        this.persistBathrooms();
        w.events.emit('bathroom.restocked', {});
        w.events.emit('item.dropped', { item: 'towel', byPlayer: actor.isPlayer });
        return true;
      },
    }));
  }

  persistBathrooms(): void {
    const list = this.w.data.facilities.bathrooms;
    for (const bath of this.bathrooms) list[bath.layout.index] = { towel: bath.towels, roll: bath.rolls };
    this.w.save.markDirty();
  }

  private createFixtureZones(index: number, type: CarriageType): void {
    const w = this.w;
    const map = w.map;
    const layout = getLayout(type);
    const originZ = carriageOriginZ(index);
    const at = (name: string): Vec2 => ({ x: layout.anchors[name].x, z: layout.anchors[name].z + originZ });
    void map;

    if (type === 'lobby') {
      const desk = at('deskService');
      w.zones.add(new Zone({
        id: 'desk',
        x: desk.x,
        z: desk.z,
        radius: 0.55,
        icon: 'ticket',
        active: () => w.guests.hasGuestAtDesk(),
        stay: (zone, actor, dt) => w.guests.deskStay(zone, actor, dt),
      }));
      const deskCash = at('deskCash');
      w.cash.create('desk', deskCash.x, deskCash.z);
      this.sourceZone(`src:tea`, at('urn'), 'tea', 'tea', () => Infinity, () => undefined);
      this.sourceZone(`src:blanket`, at('blanket'), 'blanket', 'blanket', () => Infinity, () => undefined);
      this.sourceZone(`src:pillow`, at('pillow'), 'pillow', 'pillow', () => Infinity, () => undefined);
      this.luggageDropZone('rack:lobby', at('rack'));
      this.binZone('bin:lobby', at('bin'));
    }

    if (type === 'supply') {
      const facilities = w.data.facilities;
      this.sourceZone('src:towel', at('shelf_towel'), 'towel', 'towel', () => facilities.supplyTowel, () => {
        facilities.supplyTowel--;
        w.save.markDirty();
      });
      this.sourceZone('src:roll', at('shelf_roll'), 'roll', 'roll', () => facilities.supplyRoll, () => {
        facilities.supplyRoll--;
        w.save.markDirty();
      });
      const crate = at('crateDrop');
      w.zones.add(new Zone({
        id: 'crateDrop',
        x: crate.x,
        z: crate.z,
        radius: 0.6,
        icon: 'crate',
        active: () => w.player.stack.has('crate') || w.staff.anyCarrying('crate'),
        hideWhenInactive: false,
        stay: (zone, actor, dt) => {
          if (!actor.stack.has('crate')) return false;
          zone.timer += dt * actor.workMultiplier;
          if (zone.timer < w.econ.zones.dropIntervalSeconds * 2) return true;
          zone.timer = 0;
          actor.stack.remove('crate', () => tmp.set(crate.x + 1, FLOOR_Y + 0.5, crate.z));
          const max = w.econ.facilities.supplyShelfMax;
          facilities.supplyTowel = Math.min(max, facilities.supplyTowel + w.econ.facilities.crateRefill);
          facilities.supplyRoll = Math.min(max, facilities.supplyRoll + w.econ.facilities.crateRefill);
          w.save.markDirty();
          w.audio.play('pop');
          w.particles.emit('sparkle', crate.x + 0.8, FLOOR_Y + 0.8, crate.z, 12, 0.5);
          w.events.emit('crate.delivered', {});
          return true;
        },
      }));
      this.binZone('bin:supply', at('bin'));
    }

    if (type === 'sleeper') {
      this.sourceZone(`src:tea:${index}`, at('urn'), 'tea', 'tea', () => Infinity, () => undefined);
      this.sourceZone(`src:blanket:${index}`, at('blanket'), 'blanket', 'blanket', () => Infinity, () => undefined);
      this.sourceZone(`src:pillow:${index}`, at('pillow'), 'pillow', 'pillow', () => Infinity, () => undefined);
    }

    if (type === 'luggage') this.luggageDropZone('rack:luggage', at('rack'));
  }

  /** Stand here to pick items up, one every pickup interval, while there is room and stock. */
  private sourceZone(id: string, p: Vec2, item: ItemKind, icon: 'tea' | 'blanket' | 'pillow' | 'towel' | 'roll', stock: () => number, take: () => void): void {
    const w = this.w;
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: 0.45,
      icon,
      active: () => stock() > 0,
      stay: (zone, actor, dt) => {
        if (actor.stack.isFull || stock() <= 0) return false;
        if (!actor.isPlayer && !(actor as Actor & { wants?: (k: ItemKind) => boolean }).wants?.(item)) return false;
        zone.timer += dt * actor.workMultiplier;
        if (zone.timer < SOURCE_DWELL) return true;
        if (zone.timer < SOURCE_DWELL + w.econ.zones.pickupIntervalSeconds && actor.stack.count > 0) return true;
        zone.timer = SOURCE_DWELL;
        actor.stack.add(item, tmp.set(p.x, FLOOR_Y + 1.0, p.z));
        take();
        actor.view.bounce(0.3);
        w.audio.play('pickup', { pitch: 1 + actor.stack.count * 0.06 });
        if (actor.isPlayer) w.haptics.light();
        w.events.emit('item.picked', { item, byPlayer: actor.isPlayer });
        return true;
      },
    }));
  }

  private luggageDropZone(id: string, p: Vec2): void {
    const w = this.w;
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: 0.6,
      icon: 'luggage',
      active: () => this.luggageStored < this.luggageCapacity && (w.player.stack.has('luggage') || w.staff.anyCarrying('luggage')),
      hideWhenInactive: false,
      stay: (zone, actor, dt) => {
        if (!actor.stack.has('luggage') || this.luggageStored >= this.luggageCapacity) return false;
        zone.timer += dt * actor.workMultiplier;
        if (zone.timer < w.econ.zones.dropIntervalSeconds) return true;
        zone.timer = 0;
        actor.stack.remove('luggage', () => tmp.set(p.x + 0.6, FLOOR_Y + 0.9, p.z));
        this.luggageStored++;
        w.audio.play('drop', { pitch: 0.8 });
        w.events.emit('luggage.loaded', { byPlayer: actor.isPlayer });
        return true;
      },
    }));
  }

  private binZone(id: string, p: Vec2): void {
    const w = this.w;
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: 0.4,
      icon: null,
      color: '#C9BFB0',
      active: () => w.player.stack.count > 0,
      hideWhenInactive: true,
      stay: (zone, actor, dt) => {
        if (actor.stack.isEmpty) return false;
        zone.timer += dt;
        if (zone.timer < 0.35) return true;
        zone.timer = 0;
        actor.stack.clear(new THREE.Vector3(p.x, FLOOR_Y + 0.5, p.z));
        w.audio.play('whoosh');
        return false;
      },
    }));
  }

  get allCabinsDirtyOrFull(): boolean {
    return this.cabins.every((c) => !c.unlocked || !c.isFree);
  }

  /** World position of a named anchor, e.g. a staff home. */
  anchor(carriage: number, name: string): Vec2 {
    return this.w.map.anchor(carriage, name);
  }
}
