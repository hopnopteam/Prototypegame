import * as THREE from 'three';
import { CARRIAGE_CATALOGUE, MAX_CARRIAGES, type UnlockDef } from '../config/content';
import { buildUnlocks, carriageChoices } from '../sim/unlockPlan';
import { easeOutBack, easeOutCubic } from '../core/math';
import type { CarriageType, ItemKind, Vec2 } from '../core/types';
import { CarriageView, FLOOR_Y, type RoomDoor } from '../world/CarriageView';
import { BATH_PILE_OFFSET, CARRIAGE_LENGTH, carriageOriginZ, getLayout, HALF_WIDTH, ZONE_RADIUS, type BathroomLayout, type CabinLayout } from '../world/layout';
import { ExteriorView } from '../world/ExteriorView';
import { DEFAULT_TRAIN_NAME } from '../config/press';
import { LocomotiveView } from '../world/LocomotiveView';
import { GeoBuilder } from '../world/geo';
import { clippedMaterials, MATERIALS, PATTERN, swapMaterials } from '../world/materials';
import { PALETTE, TIER_NAMES } from '../world/palette';
import { GANGWAY_LENGTH, REAR_DECK_LENGTH } from '../world/layout';
import type { Actor } from './Actor';
import type { Guest } from './Guests';
import { sourceActive, sourceStay, type SourceSpec } from './Pickup';
import type { World } from './World';
import { Zone } from './Zones';

export class Cabin {
  readonly id: string;
  unlocked = false;
  /** Occupant, or the guest walking to it after check-in. */
  guest: Guest | null = null;
  readonly dirty = [false, false, false];
  readonly center: Vec2;
  readonly spots: Vec2[];
  readonly bedPose: Vec2;
  /** Where a sleeper's root goes so their head lands on the pillow (CharacterView sleep pose). */
  readonly sleepPose: Vec2;
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
    this.sleepPose = { x: this.bedPose.x, z: layout.bed.z0 + originZ + PILLOW_Z + SLEEPER_HEAD };
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
/** Pillow centre from the head of the bed, and the sleeper's head from their root (CharacterView). */
const PILLOW_Z = 0.27;
const SLEEPER_HEAD = 1.02;
/** Room doors open when someone is this close to the doorway centre (metres), at these rates (per second). */
const ROOM_DOOR_REACH = 1.25;
const ROOM_DOOR_OPEN_RATE = 4;
const ROOM_DOOR_CLOSE_RATE = 1.6;
/** How long the refurbishment wipe takes to sweep the carriage (seconds). */
const MAKEOVER_SECONDS = 1.4;
const MAKEOVER_BAND_GEOMETRY = new THREE.BoxGeometry(HALF_WIDTH * 2 + 0.3, 1.5, 0.12);
const MAKEOVER_BAND_MATERIAL = new THREE.MeshBasicMaterial({ color: '#FFF1C4', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });

/** The open observation platform behind the last carriage, where new carriages couple on. */
function buildRearDeck(): THREE.Group {
  const b = new GeoBuilder();
  const y = FLOOR_Y;
  const z0 = GANGWAY_LENGTH;
  const z1 = GANGWAY_LENGTH + REAR_DECK_LENGTH;
  const zc = (z0 + z1) / 2;
  const liv = new GeoBuilder().box(0, (0.38 + y) / 2, zc, 2.8, y - 0.38, REAR_DECK_LENGTH, '#FFFFFF', 0, { shade: 0.85 });
  b.box(0, y - 0.02, zc, 2.7, 0.04, REAR_DECK_LENGTH - 0.1, PALETTE.oak, 0, { pattern: PATTERN.planks, color2: PALETTE.walnut, scale: 0.22, shade: 1 });
  // Brass railing with balusters, a gate rail at the back.
  for (const x of [-1.35, 1.35]) b.box(x, y + 0.5, zc, 0.05, 0.05, REAR_DECK_LENGTH, PALETTE.brass, 0, { shade: 1 });
  b.box(0, y + 0.5, z1 - 0.03, 2.75, 0.05, 0.05, PALETTE.brass, 0, { shade: 1 });
  for (let z = z0 + 0.1; z <= z1; z += 0.3) for (const x of [-1.35, 1.35]) b.box(x, y + 0.25, z, 0.03, 0.5, 0.03, PALETTE.brass, 0, { shade: 0.85 });
  for (let x = -1.2; x <= 1.21; x += 0.3) b.box(x, y + 0.25, z1 - 0.03, 0.03, 0.5, 0.03, PALETTE.brass, 0, { shade: 0.85 });
  b.cylinder(1.2, y + 0.9, z1 - 0.1, 0.035, 0.05, 0.9, PALETTE.navy, 8);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh, new THREE.Mesh(liv.build(), MATERIALS.livery));
  const lamp = new GeoBuilder().cylinder(0, 0, 0, 0.07, 0.1, 0.18, PALETTE.lampShade, 10, 'y', { shade: 0.9 }).build();
  const lampMesh = new THREE.Mesh(lamp, MATERIALS.lamps);
  lampMesh.position.set(1.2, y + 1.42, z1 - 0.1);
  group.add(lampMesh);
  return group;
}

/**
 * The train: carriages and their views, cabins, bathrooms, supplies and luggage storage, every fixture's
 * walk-over zone, and the coupling moment when a new carriage rolls in (the signature progress beat, §6).
 */
export class TrainState {
  readonly group = new THREE.Group();
  readonly loco = new LocomotiveView();
  /** Window boxes, lamps, lining, nameboards and the red carpet (station workshop upgrades). */
  readonly exterior = new ExteriorView();
  readonly views: CarriageView[] = [];
  readonly cabins: Cabin[] = [];
  readonly bathrooms: Bathroom[] = [];
  types: CarriageType[] = [];
  /** Refurbishment tier per carriage: 0 second-hand … 3 luxurious. */
  tiers: number[] = [];
  luggageStored = 0;
  coupling = false;
  /** The chooser is open. */
  private choosing = false;
  private pendingChoice = false;
  private lastLeftBehind = 0;
  private lastLuggageLeft = 0;
  private doorTarget = 0;
  private doorAmount = 0;
  private smokeTimer = 0;
  private jolt = 0;
  /** The open observation deck behind the last carriage, where the coupling tile sits. */
  private readonly deck: THREE.Group;

  constructor(private readonly w: World) {
    this.group.add(this.loco.group);
    this.group.add(this.exterior.group);
    this.deck = buildRearDeck();
    this.group.add(this.deck);
  }

  /** Builds the train from the save: one carriage plus every coupling already bought. */
  init(): void {
    if (this.w.data.press.trainName) this.loco.setName(this.w.data.press.trainName);
    this.w.events.on('train.named', ({ name }) => {
      this.loco.setName(name);
      this.rebuildExterior();
    });
    document.fonts?.ready.then(() => this.loco.refreshName()).catch(() => undefined);
    for (const type of this.w.data.route.carriages) this.addCarriage(type, false);
    // A coupling was paid for but the choice never made (the app closed on the chooser): ask again.
    this.pendingChoice = this.w.unlocks.isUnlocked(`couple_${this.count}`);
    this.w.events.on('station.result', (r) => {
      this.lastLeftBehind = r.leftBehind;
      this.lastLuggageLeft = r.luggageTotal - r.luggageLoaded;
    });
    this.rebuildMap();
    this.rebuildExterior();
  }

  /** Re-dresses the outside of the train from the exterior upgrades bought so far. */
  rebuildExterior(): void {
    const has = (key: string): boolean => this.w.unlocks.isUnlocked(`st.${key}`);
    const name = this.w.data.press.trainName ?? DEFAULT_TRAIN_NAME;
    this.exterior.build(this.types, { windowboxes: has('windowboxes'), lamps: has('lamps'), lining: has('lining'), nameboards: has('nameboards'), redcarpet: has('redcarpet') }, name);
  }

  /** Display name: the catalogue name, numbered when the train has more than one of a kind. */
  carriageName(index: number): string {
    const type = this.types[index] ?? this.w.data.route.carriages[index];
    if (!type) return 'Carriage';
    const name = CARRIAGE_CATALOGUE[type].name;
    const nth = this.w.data.route.carriages.slice(0, index + 1).filter((t) => t === type).length;
    return nth > 1 ? `${name} ${'I'.repeat(nth)}` : name;
  }

  /**
   * A coupling has been paid for: the player chooses what joins the train (recommended pick first), then
   * it rolls in. The unlock chain grows the new carriage's tiles.
   */
  requestCoupling(onDone?: () => void): void {
    const w = this.w;
    if (this.coupling || this.choosing) return;
    const choices = carriageChoices(w.data.route.carriages, { leftBehind: this.lastLeftBehind, luggageLeft: this.lastLuggageLeft });
    if (choices.length === 0) return;
    this.choosing = true;
    this.pendingChoice = false;
    w.audio.play('fanfare');
    w.ui.showCarriageChoice(choices.map((c) => {
      const entry = CARRIAGE_CATALOGUE[c.type];
      return { type: c.type, name: entry.name, pitch: entry.pitch, inside: entry.inside, reason: c.reason };
    }), (type) => {
      this.choosing = false;
      w.data.route.carriages.push(type);
      w.unlocks.setDefs(buildUnlocks(w.data.route.carriages));
      w.save.markDirty();
      w.analytics.log('carriage_chosen', { type, slot: this.count, offered: choices.map((c) => c.type).join(',') });
      this.coupleNext(type, onDone);
    });
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

  /** Refurbished cabins pay more: the whole point of doing up a rusty carriage. */
  fareMultiplier(cabin: Cabin): number {
    return 1 + (this.tiers[cabin.carriage] ?? 0) * this.w.econ.refurb.fareBonusPerTier;
  }

  bathTipMultiplier(bath: Bathroom): number {
    return 1 + (this.tiers[bath.carriage] ?? 0) * this.w.econ.refurb.bathTipBonusPerTier;
  }

  /** A smart supply and luggage car lift every tip on the train. */
  trainTipBonus(): number {
    let tiers = 0;
    this.types.forEach((type, i) => {
      if (type === 'supply' || type === 'luggage') tiers += this.tiers[i] ?? 0;
    });
    return tiers * this.w.econ.refurb.trainTipBonusPerTier;
  }

  tierOf(carriage: number): number {
    return this.tiers[carriage] ?? 0;
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

  /** Something new on the outside: a ripple of sparkle along the platform side of every carriage. */
  private dressUpMoment(): void {
    const w = this.w;
    w.audio.play('fanfare');
    w.stage.rig.shake(0.18, 0.3);
    this.views.forEach((_, i) => {
      const cz = carriageOriginZ(i) + CARRIAGE_LENGTH / 2;
      w.tweens.run(0.01, () => undefined, {
        delay: i * 0.12,
        complete: () => {
          w.particles.emit('sparkle', HALF_WIDTH + 0.2, FLOOR_Y + 1.0, cz - 3, 10, 0.8);
          w.particles.emit('sparkle', HALF_WIDTH + 0.2, FLOOR_Y + 1.0, cz + 3, 10, 0.8);
        },
      });
    });
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
      case 'refurb':
        this.refurbish(def.carriage, def.tier ?? 1, animate);
        break;
      case 'exterior':
        this.rebuildExterior();
        if (animate) this.dressUpMoment();
        break;
      default:
        break;
    }
  }

  /** Rolls the chosen carriage in from off-screen and couples it with a clunk. */
  coupleNext(type: CarriageType, onDone?: () => void): void {
    const index = this.types.length;
    if (this.coupling) return;
    this.coupling = true;
    const plan = { type, name: '' };
    const view = new CarriageView(getLayout(plan.type), index, this.savedTier(index));
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
        this.rebuildExterior();
        w.audio.play('clunk');
        w.audio.play('fanfare');
        w.haptics.heavy();
        w.stage.rig.shake(0.45, 0.5);
        this.jolt = 1;
        const cz = targetZ - 0.6;
        w.particles.emit('dust', 0, FLOOR_Y + 0.3, cz, 28, 1.2);
        w.particles.emit('confetti', 0, FLOOR_Y + 2.5, targetZ + 2, 60, 1.5);
        w.ui.celebrate(this.carriageName(index), 'Coupled!', 'carriage');
        w.events.emit('carriage.coupled', { index, type: plan.type });
        this.coupling = false;
        onDone?.();
      },
    });
  }

  update(dt: number): void {
    const w = this.w;
    if (this.pendingChoice && dt > 0) this.requestCoupling(() => w.tiles.refresh());
    const speed = w.journey.speed;
    this.loco.update(dt, speed);

    // Doors slide open at stations.
    if (this.doorAmount !== this.doorTarget) {
      this.doorAmount += Math.sign(this.doorTarget - this.doorAmount) * dt * 2.2;
      this.doorAmount = Math.min(1, Math.max(0, this.doorAmount));
      for (const view of this.views) view.setDoorOpen(this.doorAmount);
      this.exterior.setCarpet(this.doorAmount);
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

    if (w.player) this.updateRoomDoors(dt);

    // Keep visuals in sync with state (cheap: a handful of visibility flags).
    for (const cabin of this.cabins) {
      const view = this.views[cabin.carriage];
      if (!view) continue;
      view.setDirt(cabin.index, cabin.dirty);
      for (let i = 0; i < cabin.spotZones.length; i++) if (cabin.dirty[i]) view.setDirtFade(cabin.index, i, cabin.spotZones[i].progress);
    }
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
    const view = existingView ?? new CarriageView(getLayout(type), index, this.savedTier(index));
    view.group.position.z = carriageOriginZ(index);
    this.group.add(view.group);
    this.views.push(view);
    this.types.push(type);
    this.tiers[index] = view.tier;
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

  private savedTier(index: number): number {
    let tier = 0;
    for (const u of this.w.unlocks.defs) if (u.kind === 'refurb' && u.carriage === index && this.w.unlocks.isUnlocked(u.id)) tier = Math.max(tier, u.tier ?? 1);
    return tier;
  }

  /**
   * The makeover: the carriage is rebuilt at its new tier (walls, floors, furniture, lamps) while
   * everything living in it (beds, dirt, stock, luggage) carries over. The glow-up is the reward you see.
   */
  refurbish(index: number, tier: number, animate: boolean): void {
    const old = this.views[index];
    const type = this.types[index];
    if (!old || type === undefined || tier <= old.tier) return;
    const view = new CarriageView(getLayout(type), index, tier);
    view.group.position.copy(old.group.position);
    for (const cabin of this.cabins) if (cabin.carriage === index) view.setCabinLocked(cabin.index, !cabin.unlocked);
    for (const bath of this.bathrooms) if (bath.carriage === index) view.setBathroomLocked(bath.layout.index, !bath.unlocked);
    view.setDoorOpen(this.doorAmount);
    this.group.add(view.group);
    this.views[index] = view;
    this.tiers[index] = tier;
    // Refresh stock visibility this frame rather than next.
    this.update(0);
    if (!animate) {
      this.group.remove(old.group);
      old.dispose();
      return;
    }
    const w = this.w;
    const originZ = carriageOriginZ(index);
    w.stage.rig.focusOn(new THREE.Vector3(0, 0, originZ + 7), 2.6, 1.0);
    w.audio.play('fanfare');
    w.haptics.success();
    this.makeoverWipe(old, view, originZ, () => {
      w.stage.rig.shake(0.15, 0.3);
      w.stage.rig.punch(0.06);
      w.particles.emit('confetti', 0, FLOOR_Y + 2.2, originZ + 7, 40, 1.8);
      w.ui.celebrate(this.carriageName(index), TIER_NAMES[tier] ?? 'Refurbished', 'paint');
    });
    w.events.emit('carriage.refurbished', { index, type, tier });
  }

  /**
   * The makeover: a line of sparkle sweeps from the front of the carriage to the back, the refurbished
   * carriage appearing behind it and the old one still ahead of it, then a flourish.
   */
  private makeoverWipe(old: CarriageView, view: CarriageView, originZ: number, done: () => void): void {
    const w = this.w;
    const front = new THREE.Plane(new THREE.Vector3(0, 0, -1), originZ);
    const back = new THREE.Plane(new THREE.Vector3(0, 0, 1), -originZ);
    const newSide = clippedMaterials(front);
    const oldSide = clippedMaterials(back);
    swapMaterials(view.group, newSide);
    swapMaterials(old.group, oldSide);
    const z0 = originZ - 0.6;
    const z1 = originZ + CARRIAGE_LENGTH + 0.6;
    let sparkle = 0;
    // A band of warm light rides the cut, like fresh paint catching the sun.
    const band = new THREE.Mesh(MAKEOVER_BAND_GEOMETRY, MAKEOVER_BAND_MATERIAL);
    band.position.set(0, FLOOR_Y + 0.7, z0);
    this.group.add(band);
    const finish = (): void => {
      this.group.remove(band);
      swapMaterials(view.group, newSide, true);
      this.group.remove(old.group);
      old.dispose();
      for (const m of [...newSide.values(), ...oldSide.values()]) m.dispose();
      done();
    };
    w.tweens.run(MAKEOVER_SECONDS, (t) => {
      const cut = z0 + (z1 - z0) * t;
      front.constant = cut;
      back.constant = -cut;
      band.position.z = cut;
      sparkle -= 1;
      if (sparkle <= 0) {
        sparkle = 2;
        w.particles.emit('sparkle', -1.4 + Math.random() * 2.8, FLOOR_Y + 0.4 + Math.random() * 0.8, cut, 3, 0.5);
      }
    }, { delay: 0.35, complete: finish });
  }

  /** Room doors slide open for anyone walking up to them, and close behind. Locked rooms stay shut. */
  private updateRoomDoors(dt: number): void {
    const w = this.w;
    const reach2 = ROOM_DOOR_REACH * ROOM_DOOR_REACH;
    for (let i = 0; i < this.views.length; i++) {
      const view = this.views[i];
      const originZ = view.group.position.z;
      for (const door of view.roomDoors) {
        const want = door.locked ? 0 : this.someoneNear(door, originZ, reach2) ? 1 : 0;
        if (door.open === want) continue;
        const rate = want > door.open ? ROOM_DOOR_OPEN_RATE : ROOM_DOOR_CLOSE_RATE;
        const next = want > door.open ? Math.min(1, door.open + dt * rate) : Math.max(0, door.open - dt * rate);
        if (door.open === 0 && want === 1 && dt > 0) w.audio.play('door', { volume: 0.25, pitch: 1.4 });
        view.setRoomDoor(door, next);
      }
    }
  }

  private someoneNear(door: RoomDoor, originZ: number, reach2: number): boolean {
    const w = this.w;
    const dz = door.z + originZ;
    const near = (p: Vec2): boolean => {
      const x = p.x - door.x;
      const z = p.z - dz;
      return x * x + z * z < reach2;
    };
    if (near(w.player.pos)) return true;
    for (const m of w.staff.members) if (near(m.pos)) return true;
    for (const g of w.guests.list) if (!g.inCabin && near(g.pos)) return true;
    return false;
  }

  rebuildMap(): void {
    const w = this.w;
    const moreToCome = MAX_CARRIAGES > this.types.length;
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
      radius: ZONE_RADIUS.request,
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
      radius: ZONE_RADIUS.spot,
      icon: null,
      // The mess itself is the marker: it fades as you scrub (no ring cluttering the cabin).
      ring: false,
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
    w.cash.create(bath.pileId, bath.restock.x + BATH_PILE_OFFSET.x, bath.restock.z + BATH_PILE_OFFSET.z);
    w.zones.add(new Zone({
      id: `restock:${bath.id}`,
      x: bath.restock.x,
      z: bath.restock.z,
      radius: ZONE_RADIUS.restock,
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
        radius: ZONE_RADIUS.desk,
        icon: 'ticket',
        active: () => w.guests.hasGuestAtDesk(),
        stay: (zone, actor, dt) => w.guests.deskStay(zone, actor, dt),
      }));
      const deskCash = at('deskCash');
      w.cash.create('desk', deskCash.x, deskCash.z);
      this.sourceZone('src:tea', at('urn'), ['tea']);
      this.sourceZone('src:linen', at('linen'), ['blanket', 'pillow']);
      this.luggageDropZone('rack:lobby', at('rack'));
      this.binZone('bin:lobby', at('bin'));
    }

    if (type === 'supply') {
      const facilities = w.data.facilities;
      const max = w.econ.facilities.supplyShelfMax;
      this.sourceZone('src:towel', at('shelf_towel'), ['towel'], () => facilities.supplyTowel, (delta) => {
        facilities.supplyTowel = Math.min(max, facilities.supplyTowel + delta);
        w.save.markDirty();
      });
      this.sourceZone('src:roll', at('shelf_roll'), ['roll'], () => facilities.supplyRoll, (delta) => {
        facilities.supplyRoll = Math.min(max, facilities.supplyRoll + delta);
        w.save.markDirty();
      });
      const crate = at('crateDrop');
      w.zones.add(new Zone({
        id: 'crateDrop',
        x: crate.x,
        z: crate.z,
        radius: ZONE_RADIUS.crate,
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
      this.sourceZone(`src:tea:${index}`, at('urn'), ['tea']);
      this.sourceZone(`src:linen:${index}`, at('linen'), ['blanket', 'pillow']);
    }

    if (type === 'luggage') this.luggageDropZone('rack:luggage', at('rack'));
  }

  /**
   * A supply source: it only hands out what someone is waiting for (see Demand), after a short dwell, and
   * takes back anything nobody needs any more. One station can hold several items (the linen cupboard has
   * blankets and pillows): it gives whichever is wanted. Unlimited sources (tea urn, linen) pass no stock.
   */
  private sourceZone(id: string, p: Vec2, items: ('tea' | 'blanket' | 'pillow' | 'towel' | 'roll')[], stock?: () => number, adjust?: (delta: number) => void): void {
    const w = this.w;
    const point = new THREE.Vector3(p.x, FLOOR_Y + 1.0, p.z);
    const specs: SourceSpec[] = items.map((item) => ({
      kind: item,
      point: () => point,
      stock: stock ?? (() => Infinity),
      take: () => adjust?.(-1),
      giveBack: () => adjust?.(1),
      interval: w.econ.zones.pickupIntervalSeconds,
    }));
    const pick = (actor: Actor): SourceSpec => {
      const d = w.demand;
      return specs.find((s) => s.giveBack && d.surplus(actor, s.kind) > 0) ?? specs.find((s) => d.wants(actor, s.kind)) ?? specs[0];
    };
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: ZONE_RADIUS.source,
      icon: items.length > 1 ? 'linen' : items[0],
      active: () => specs.some((s) => sourceActive(w, s)),
      highlight: () => specs.some((s) => w.demand.playerWants(s.kind) > 0 && s.stock() > 0),
      stay: (zone, actor, dt) => sourceStay(w, zone, actor, dt, pick(actor)),
    }));
  }

  private luggageDropZone(id: string, p: Vec2): void {
    const w = this.w;
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: ZONE_RADIUS.rack,
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

  /** The bin takes surplus only (never what a guest is waiting for), and only after a deliberate pause. */
  private binZone(id: string, p: Vec2): void {
    const w = this.w;
    const target = new THREE.Vector3(p.x, FLOOR_Y + 0.5, p.z);
    const binnable = (actor: Actor): ItemKind | null => {
      for (const kind of actor.stack.items) if (kind !== 'luggage' && w.demand.surplus(actor, kind) > 0) return kind;
      return null;
    };
    w.zones.add(new Zone({
      id,
      x: p.x,
      z: p.z,
      radius: ZONE_RADIUS.bin,
      icon: null,
      color: '#C9BFB0',
      active: () => binnable(w.player) !== null || w.staff.members.some((m) => binnable(m) !== null),
      hideWhenInactive: true,
      stay: (zone, actor, dt) => {
        const kind = binnable(actor);
        if (!kind) return false;
        if (zone.timer < w.econ.zones.binDwellSeconds) {
          zone.timer += dt;
          zone.progress = Math.min(1, zone.timer / w.econ.zones.binDwellSeconds);
          return true;
        }
        zone.repeat -= dt;
        if (zone.repeat > 0) return true;
        zone.repeat = w.econ.zones.pickupIntervalSeconds;
        actor.stack.remove(kind, () => target);
        w.audio.play('whoosh', { volume: 0.6 });
        return true;
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
