import * as THREE from 'three';
import { CARRIAGE_CATALOGUE, MAX_CARRIAGES, type BedMess, type ComfortKey, type MessPiece, type UnlockDef } from '../config/content';
import { buildUnlocks, carriageChoices } from '../sim/unlockPlan';
import { CLASSES, classFare, classOfTier, classStartingAt, isPassengerType, type ClassDef, type ClassId } from '../config/classes';
import { ClassChips } from '../world/ClassChips';
import { easeOutBack, easeOutCubic } from '../core/math';
import type { CarriageType, ItemKind, Vec2 } from '../core/types';
import { CarriageView, FLOOR_Y, type RoomDoor } from '../world/CarriageView';
import { BATH_PILE_OFFSET, CARRIAGE_LENGTH, GANGWAY_LENGTH, carriageOriginZ, getLayout, HALF_WIDTH, ZONE_RADIUS, type BathroomLayout, type CabinLayout } from '../world/layout';
import { ExteriorView } from '../world/ExteriorView';
import { DEFAULT_TRAIN_NAME } from '../config/press';
import { LocomotiveView } from '../world/LocomotiveView';
import { buildRearDeck } from '../world/RearDeck';
import { clippedMaterials, swapMaterials } from '../world/materials';
import { trainLightInput } from '../world/trainLight';
import { TIER_NAMES } from '../world/palette';
import type { Actor } from './Actor';
import type { Guest } from './Guests';
import { sourceActive, sourceStay, type SourceSpec } from './Pickup';
import type { World } from './World';
import type { IconName } from '../ui/icons';
import { Zone } from './Zones';

export class Cabin {
  readonly id: string;
  unlocked = false;
  /** Occupant, or the guest walking to it after check-in. */
  guest: Guest | null = null;
  /** One flag per cleaning spot (a cabin has one: the heart of its walk-in). */
  readonly dirty: boolean[];
  readonly center: Vec2;
  readonly spots: Vec2[];
  readonly bedPose: Vec2;
  /** Where a sleeper's root goes so their head lands on the pillow (CharacterView sleep pose). */
  readonly sleepPose: Vec2;
  /** Where a new guest stands by the bed, and where they sit on its edge to read before lying down. */
  readonly bedSide: Vec2;
  readonly sitPose: Vec2;
  readonly tipPile: Vec2;
  readonly node: string;
  readonly pileId: string;
  requestZone: Zone | null = null;
  spotZones: Zone[] = [];
  /** Staff member walking here to clean it. */
  cleaner: Actor | null = null;
  /** What the last guest left behind (chosen as they get off; null: a default mess). */
  messPlan: { pieces: MessPiece[]; bed: BedMess; seed: number } | null = null;

  constructor(readonly carriage: number, readonly layout: CabinLayout, originZ: number) {
    this.id = `c${carriage}_${layout.index}`;
    const w = (p: Vec2): Vec2 => ({ x: p.x, z: p.z + originZ });
    this.center = w(layout.center);
    this.spots = layout.spots.map(w);
    this.dirty = layout.spots.map(() => false);
    this.bedPose = w(layout.bedPose);
    this.sleepPose = { x: this.bedPose.x, z: layout.bed.z0 + originZ + PILLOW_Z + SLEEPER_HEAD };
    this.bedSide = { x: layout.bed.x0 - 0.24, z: this.bedPose.z };
    this.sitPose = { x: layout.bed.x0 + 0.12, z: this.bedPose.z };
    this.tipPile = w(layout.tipPile);
    this.node = `c${carriage}:${layout.node}`;
    this.pileId = `cabin:${this.id}`;
  }

  get index(): number {
    return this.layout.index;
  }

  get isDirty(): boolean {
    return this.dirty.some(Boolean);
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
/** A cabin's mess clears away in this many visible steps while it is tidied. */
const CLEAN_STEPS = 7;
/** Where the conductor steps to (metres ahead of the old rear) while a new carriage rolls in. */
const COUPLING_STEP_BACK = 0.8;
/** How long the refurbishment wipe takes to sweep the carriage (seconds). */
const MAKEOVER_SECONDS = 1.4;
const MAKEOVER_BAND_GEOMETRY = new THREE.BoxGeometry(HALF_WIDTH * 2 + 0.3, 1.5, 0.12);
const MAKEOVER_BAND_MATERIAL = new THREE.MeshBasicMaterial({ color: '#FFF1C4', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });


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
  /** Refit tier per carriage: service cars 0 second-hand … 3 luxurious; passenger carriages 0 … 5 Royal Suite. */
  tiers: number[] = [];
  /** Comforts bought per carriage. */
  private comfortCounts: number[] = [];
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
  /** The class chip over every passenger carriage. */
  private readonly chips = new ClassChips();

  constructor(private readonly w: World) {
    this.group.add(this.loco.group);
    this.group.add(this.exterior.group);
    this.group.add(this.chips.group);
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

  /** The cabin or washroom (world rect) the point is inside, if any: the camera frames it. */
  roomAt(p: Vec2): { x0: number; z0: number; x1: number; z1: number } | null {
    for (const list of [this.cabins, this.bathrooms] as (Cabin | Bathroom)[][]) {
      for (const room of list) {
        const r = room.layout.room;
        const oz = carriageOriginZ(room.carriage);
        if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 + oz && p.z < r.z1 + oz) return { x0: r.x0, z0: r.z0 + oz, x1: r.x1, z1: r.z1 + oz };
      }
    }
    return null;
  }

  /**
   * Nearest place to pick up towels or rolls: the washroom car's closet (always stocked) or the stores'
   * shelves while they hold stock.
   */
  supplySource(kind: 'towel' | 'roll', from: Vec2): Vec2 | null {
    const map = this.w.map;
    const options: Vec2[] = [];
    const bath = this.indexOfType('bathroom');
    if (bath !== null && map.hasAnchor(bath, 'closet')) options.push(map.anchor(bath, 'closet'));
    const supply = this.indexOfType('supply');
    const stock = kind === 'towel' ? this.supplyTowel : this.supplyRoll;
    if (supply !== null && stock > 0) options.push(map.anchor(supply, kind === 'towel' ? 'shelf_towel' : 'shelf_roll'));
    let best: Vec2 | null = null;
    for (const o of options) if (!best || Math.abs(o.z - from.z) < Math.abs(best.z - from.z)) best = o;
    return best;
  }

  /** Towels or rolls can be had somewhere on the train right now. */
  hasSupply(kind: 'towel' | 'roll'): boolean {
    return this.indexOfType('bathroom') !== null || (kind === 'towel' ? this.supplyTowel : this.supplyRoll) > 0;
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

  /** A passenger carriage's class (from its refit tier); service cars have none. */
  classOf(carriage: number): ClassDef | null {
    const type = this.types[carriage];
    return type !== undefined && isPassengerType(type) ? classOfTier(this.tiers[carriage] ?? 0) : null;
  }

  /** The class a cabin sells (its carriage's). */
  cabinClass(cabin: Cabin): ClassId {
    return this.classOf(cabin.carriage)?.id ?? 'basic';
  }

  /** Classes the train sells right now, with how many open cabins each has (for who turns up on the platform). */
  classCapacity(): Map<ClassId, number> {
    const out = new Map<ClassId, number>();
    for (const cabin of this.cabins) if (cabin.unlocked) out.set(this.cabinClass(cabin), (out.get(this.cabinClass(cabin)) ?? 0) + 1);
    return out;
  }

  /** Each carriage's outside paint, front to back: its class livery, or the train's for service cars. */
  paints(): { body: string; trim: string }[] {
    const livery = this.w.currentLivery();
    return this.types.map((_, i) => {
      const c = this.classOf(i);
      return c ? { body: c.livery.body, trim: c.livery.trim } : { body: livery.body, trim: livery.trim };
    });
  }

  /** The best class on the train (what the next upgrade builds on). */
  bestClass(): ClassDef {
    let best = CLASSES[0];
    this.types.forEach((_, i) => {
      const c = this.classOf(i);
      if (c && c.tier > best.tier) best = c;
    });
    return best;
  }

  /** The class sets the fare (Basic ×1 … Royal ×15; a repaired Basic carriage ×1.25). */
  fareMultiplier(cabin: Cabin): number {
    return classFare(this.tiers[cabin.carriage] ?? 0);
  }

  bathTipMultiplier(bath: Bathroom): number {
    return 1 + (this.tiers[bath.carriage] ?? 0) * this.w.econ.refurb.bathTipBonusPerTier + (this.comfortCounts[bath.carriage] ?? 0) * this.w.econ.comfort.bathTipBonus;
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

  /** The best free cabin for a new guest of this class (any class if none given): the lowest carriage first. */
  freeCabin(cls?: ClassId): Cabin | null {
    for (const cabin of this.cabins) if (cabin.isFree && (!cls || this.cabinClass(cabin) === cls)) return cabin;
    return null;
  }

  /** Open cabins (of one class, or all). */
  openCabinCount(cls?: ClassId): number {
    let n = 0;
    for (const cabin of this.cabins) if (cabin.unlocked && (!cls || this.cabinClass(cabin) === cls)) n++;
    return n;
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
      case 'comfort':
        this.furnish(def.carriage, animate);
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
    // The observation deck rides in on the back of the new carriage (it never sits where the carriage will
    // stop), and the conductor steps off it into the last carriage so nothing rolls through them.
    const deckStays = MAX_CARRIAGES > index + 1;
    w.particles.emit('dust', 0, FLOOR_Y + 0.3, w.map.rearZ + GANGWAY_LENGTH + 1, 14, 0.8);
    this.deck.visible = deckStays;
    this.deck.position.z = startZ + CARRIAGE_LENGTH;
    const p = w.player.pos;
    if (p.z > w.map.rearZ - 0.2) {
      p.x = 0;
      p.z = w.map.rearZ - COUPLING_STEP_BACK;
      w.player.view.bounce(1);
    }
    w.stage.rig.focusOn(new THREE.Vector3(0, 0, targetZ + 2), 3.6, 1.3);
    w.audio.play('whistleShort');
    w.tweens.run(2.3, (t) => {
      view.group.position.z = startZ + (targetZ - startZ) * t;
      this.deck.position.z = view.group.position.z + CARRIAGE_LENGTH;
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
        w.ui.celebrate(this.carriageName(index), null, 'carriage');
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
    this.loco.setNight(w.stage.lighting.night);

    for (const view of this.views) view.animate(dt);
    this.publishLamps();
    this.chips.sync(this.views.map((v) => v.cls), (i) => this.views[i]?.group.position.z ?? carriageOriginZ(i), dt, this.w.stage.rig.zoomNow);

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
      if (cabin.messPlan) view.setMess(cabin.index, cabin.messPlan.pieces, cabin.messPlan.bed, cabin.messPlan.seed);
      view.setDirt(cabin.index, cabin.dirty);
      for (let i = 0; i < cabin.spotZones.length; i++) if (cabin.dirty[i]) view.setDirtFade(cabin.index, i, cabin.spotZones[i].progress, this.onMessPop);
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
      cabin.unlocked = alwaysOpen || this.roomUnlocked('cabin', index, cl.index);
      view.setCabinLocked(cl.index, !cabin.unlocked);
      this.cabins.push(cabin);
      this.createCabinZones(cabin);
    }

    const facilities = this.w.data.facilities;
    for (const bl of layout.bathrooms) {
      const saved = facilities.bathrooms[bl.index];
      const bath = new Bathroom(index, bl, originZ, saved?.towel ?? this.w.econ.facilities.bathroomTowelMax, saved?.roll ?? this.w.econ.facilities.bathroomRollMax);
      bath.unlocked = bl.index === 0 || this.roomUnlocked('bathroom', index, bl.index);
      view.setBathroomLocked(bl.index, !bath.unlocked);
      this.bathrooms.push(bath);
      this.createBathroomZones(bath);
    }

    if (type === 'supply') {
      if (facilities.supplyTowel < 0) facilities.supplyTowel = this.w.econ.facilities.supplyShelfStart;
      if (facilities.supplyRoll < 0) facilities.supplyRoll = this.w.econ.facilities.supplyShelfStart;
    }
    this.createFixtureZones(index, type);
    this.comfortCounts[index] = this.comfortsOf(index).length;
    view.setComforts(this.comfortsOf(index));
    if (animate) this.popIn(view.group);
  }

  /** A comfort arrives in every room of the carriage at once: each one pops in with a sparkle. */
  private furnish(index: number, animate: boolean): void {
    const view = this.views[index];
    if (!view) return;
    const keys = this.comfortsOf(index);
    this.comfortCounts[index] = keys.length;
    const rooms = view.setComforts(keys);
    if (!animate) return;
    const w = this.w;
    const originZ = carriageOriginZ(index);
    w.audio.play('pop');
    rooms.forEach((room, i) => {
      if (!room.visible) return;
      room.scale.setScalar(0.01);
      w.tweens.run(0.36, (t) => room.scale.setScalar(Math.max(0.01, t)), {
        ease: easeOutBack,
        delay: 0.1 + i * 0.12,
        complete: () => {
          room.scale.setScalar(1);
          w.particles.emit('sparkle', room.position.x, FLOOR_Y + 0.8, originZ + room.position.z, 10, 0.4);
        },
      });
    });
  }

  private syncCarriageView(view: CarriageView, index: number, type: CarriageType): void {
    const layout = getLayout(type);
    for (const cl of layout.cabins) view.setCabinLocked(cl.index, !(type === 'lobby' && cl.index === 0) && !this.roomUnlocked('cabin', index, cl.index));
    for (const bl of layout.bathrooms) view.setBathroomLocked(bl.index, bl.index !== 0 && !this.roomUnlocked('bathroom', index, bl.index));
    view.setComforts(this.comfortsOf(index));
  }

  /** Whether the tile that opens this cabin or washroom has been bought (restoring a save). */
  private roomUnlocked(kind: 'cabin' | 'bathroom', carriage: number, room: number): boolean {
    const u = this.w.unlocks;
    return u.defs.some((d) => d.kind === kind && d.carriage === carriage && (kind === 'cabin' ? d.cabin : d.bathroom) === room && u.isUnlocked(d.id));
  }

  /** The comforts bought for a carriage (lamps, flowers, radios; soaps, towel rails). */
  comfortsOf(carriage: number): ComfortKey[] {
    const u = this.w.unlocks;
    const out: ComfortKey[] = [];
    for (const d of u.defs) if (d.kind === 'comfort' && d.carriage === carriage && d.comfort && u.isUnlocked(d.id)) out.push(d.comfort);
    return out;
  }

  /** Tips left in a cabin: its class (Royal guests tip like royalty) and the comforts bought for it. */
  cabinTipMultiplier(cabin: Cabin): number {
    const cls = this.classOf(cabin.carriage);
    return (cls?.tip ?? 1) * (1 + (this.comfortCounts[cabin.carriage] ?? 0) * this.w.econ.comfort.cabinTipBonus);
  }

  /** The views the light map was last baked from; re-baked when a carriage is added or rebuilt. */
  private readonly litViews: CarriageView[] = [];

  /** Re-bakes the train's light (lamps, window spill, contact shading) when any carriage changed. */
  private publishLamps(): void {
    let changed = this.litViews.length !== this.views.length;
    for (let i = 0; i < this.views.length && !changed; i++) if (this.litViews[i] !== this.views[i]) changed = true;
    if (!changed) return;
    this.litViews.length = 0;
    this.litViews.push(...this.views);
    this.w.stage.lightMap.setTrain(trainLightInput(this.views.map((view, i) => ({ layout: view.layout, originZ: carriageOriginZ(i), tier: view.tier, lamps: view.lampAnchors(carriageOriginZ(i)) }))));
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
    view.setComforts(this.comfortsOf(index));
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
      const cls = isPassengerType(type) ? classStartingAt(tier) : null;
      if (cls) {
        // A new class: its name and emblem, and a shimmer along the fresh paint outside.
        w.ui.celebrate(cls.name, null, cls.icon);
        for (let k = 0; k < 5; k++) w.particles.emit('sparkle', HALF_WIDTH + 0.15, FLOOR_Y + 0.9, originZ + 1.5 + k * 2.6, 8, 0.6);
        w.audio.play('levelup');
      } else w.ui.celebrate(TIER_NAMES[tier] ?? this.carriageName(index), null, 'paint');
    });
    w.events.emit('carriage.refurbished', { index, type, tier });
    if (isPassengerType(type) && classStartingAt(tier)) w.events.emit('carriage.classUp', { index, cls: classOfTier(tier).id });
  }

  /**
   * The makeover: a line of sparkle sweeps from the front of the carriage to the back, the refurbished
   * carriage appearing behind it and the old one still ahead of it, then a flourish.
   */
  private makeoverWipe(old: CarriageView, view: CarriageView, originZ: number, done: () => void): void {
    const w = this.w;
    const front = new THREE.Plane(new THREE.Vector3(0, 0, -1), originZ);
    const back = new THREE.Plane(new THREE.Vector3(0, 0, 1), -originZ);
    // The paint changes with the class, so the wipe repaints the outside too.
    const newSide = clippedMaterials(front, [view.liveryBody, view.liveryTrim]);
    const oldSide = clippedMaterials(back, [old.liveryBody, old.liveryTrim]);
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

  /** Each bit of mess going: a puff, a pop, a glint. */
  private readonly onMessPop = (x: number, y: number, z: number): void => {
    const w = this.w;
    w.audio.play('pop', { volume: 0.5, pitch: 1.1 + Math.random() * 0.3 });
    w.particles.emit('dust', x, y - 0.15, z, 6, 0.25);
    w.particles.emit('sparkle', x, y, z, 3, 0.2);
  };

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
      // The one place to stand: a broom pad in the middle of the mat, shown only while the room is dirty.
      icon: 'broom',
      ring: true,
      hideWhenInactive: true,
      active: () => cabin.dirty[i] && !cabin.guest,
      stay: (zone, actor, dt) => {
        const before = zone.progress;
        zone.progress += (dt / w.econ.zones.cleanCabinSeconds) * actor.workMultiplier;
        // Out comes the broom: a side-to-side sweep, brush sounds, a little dust at the feet. Each piece of
        // mess pops away in turn (onMessPop) and the mat brightens back.
        actor.view.act('sweep');
        if (zone.progress < 1) {
          const steps = CLEAN_STEPS;
          if (Math.floor(zone.progress * steps) > Math.floor(before * steps)) {
            w.audio.play('scrub', { volume: 0.4, pitch: 0.9 + zone.progress * 0.4 });
            w.particles.emit('dust', actor.pos.x, FLOOR_Y + 0.1, actor.pos.z + 0.3, 3, 0.2);
          }
          return true;
        }
        zone.progress = 0;
        cabin.dirty[i] = false;
        w.events.emit('spot.cleaned', { x: spot.x, z: spot.z, byPlayer: actor.isPlayer });
        if (!cabin.isDirty) {
          cabin.cleaner = null;
          // The after: bed made, floor clear, and a ring of sparkle round the whole room.
          w.audio.play('sparkle', { volume: 0.7 });
          w.audio.play('ding');
          const room = cabin.layout.room;
          const originZ = carriageOriginZ(cabin.carriage);
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            w.particles.emit('sparkle', (room.x0 + room.x1) / 2 + Math.cos(a) * 0.9, FLOOR_Y + 0.5, originZ + (room.z0 + room.z1) / 2 + Math.sin(a) * 0.8, 2, 0.25);
          }
          w.particles.emit('star', cabin.center.x, FLOOR_Y + 0.8, cabin.center.z, 8, 0.4);
          const bed = this.views[cabin.carriage]?.cabinBeds[cabin.index];
          if (bed) {
            bed.scale.set(1, 0.85, 1);
            w.tweens.run(0.45, (t) => bed.scale.set(1, 0.85 + 0.15 * t, 1), { ease: easeOutBack });
          }
          w.ui.floatIcon('check', cabin.center.x, FLOOR_Y + 1.6, cabin.center.z, 'info');
          w.addStars(w.econ.stars.cabinCleaned * (this.classOf(cabin.carriage)?.stars ?? 1), 'clean', cabin.center);
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
        w.events.emit('bathroom.restocked', { byPlayer: actor.isPlayer });
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
      // The urn is the service counter (tea; coffee for Business, champagne for First and Royal); the linen
      // cupboard has blankets, pillows and fresh towels for Comfort-class guests.
      this.sourceZone('src:tea', at('urn'), ['tea', 'coffee', 'champagne'], undefined, undefined, 'tea');
      this.sourceZone('src:linen', at('linen'), ['blanket', 'pillow', 'towel']);
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
      this.sourceZone(`src:tea:${index}`, at('urn'), ['tea', 'coffee', 'champagne'], undefined, undefined, 'tea');
      this.sourceZone(`src:linen:${index}`, at('linen'), ['blanket', 'pillow', 'towel']);
    }

    // The washroom car keeps its own towels and rolls: it works the day it couples on.
    if (type === 'bathroom') this.sourceZone(`src:closet:${index}`, at('closet'), ['towel', 'roll']);

    if (type === 'luggage') this.luggageDropZone('rack:luggage', at('rack'));
  }

  /**
   * A supply source: it only hands out what someone is waiting for (see Demand), after a short dwell, and
   * takes back anything nobody needs any more. One station can hold several items (the linen cupboard has
   * blankets and pillows): it gives whichever is wanted. Unlimited sources (tea urn, linen) pass no stock.
   */
  private sourceZone(id: string, p: Vec2, items: ItemKind[], stock?: () => number, adjust?: (delta: number) => void, icon?: IconName): void {
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
      icon: icon ?? (items.length > 1 ? 'linen' : items[0]),
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
