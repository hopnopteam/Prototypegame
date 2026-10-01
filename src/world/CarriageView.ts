import * as THREE from 'three';
import { rect, type CarriageType, type Rect } from '../core/types';
import type { ComfortKey } from '../config/content';
import { buildBedMess, buildMessPiece, seeded, type BedMess, type MessPiece } from './Mess';
import { GeoBuilder, type PartStyle } from './geo';
import {
  CARRIAGE_LENGTH,
  DOOR_Z0,
  DOOR_Z1,
  GANGWAY_LENGTH,
  HALF_WIDTH,
  INNER,
  INTERIOR_WALL_HEIGHT,
  PARTITION_X0,
  PARTITION_X1,
  QUEUE_SLOTS,
  REAR_VESTIBULE,
  WALL,
  type CabinLayout,
  type CarriageLayout,
  type PropDef,
  type WallBox,
} from './layout';
import { litMaterial, MATERIALS, PATTERN } from './materials';
import { CARRIAGE_THEMES, CLASS_THEMES, PALETTE, type CarriageTheme } from './palette';
import { classOfTier, isPassengerType, type ClassDef } from '../config/classes';
import { SURFACES } from './surfaces';
import { buildCobwebs, buildFloor, type FloorResult } from './Floors';
import type { LampAnchor } from './Lighting';
import { REFLECT_LAYER } from './Water';

/** Metres between ceiling lights along a room or corridor (lamp pools). */
const LAMP_SPACING = 3.2;

/** Height of every walkable floor (train and platform); the ground is at y = 0. */
export const FLOOR_Y = 0.55;
/** Mattress top above the floor, for every bed at every tier (sleepers lie here). */
export const BED_TOP = 0.4;

/** Wall anatomy, in metres above the floor. */
const WAINSCOT = 0.34;
export const WINDOW_Y0 = 0.44;
export const WINDOW_Y1 = 0.94;
const SKIN = 0.05;
const LIFT = 0.006;
const WINDOW_SLOT = 1.55;

/** Window spacing along a side wall; shared with the exterior dressing so window boxes sit under windows. */
export function windowSpacing(len: number): { count: number; slot: number; width: number } {
  const count = len > 1.2 ? Math.floor(len / WINDOW_SLOT) : 0;
  const slot = count > 0 ? len / count : 0;
  return { count, slot, width: Math.min(0.9, slot - 0.45) };
}
const FLAT: PartStyle = { shade: 1 };
/**
 * Heights (above the floor) of everything lying flat on it, each in its own layer at least 4 mm from the
 * next: rooms 0–6 mm, queue marks to 11, runners 12, cabin mess from 40.
 */
/** Each piece of a cabin's mess is swept in to the broom over this share of the tidying. */
const MESS_POP = 0.2;
/** How high a swept piece hops on its way in (metres). */
const MESS_HOP = 0.35;
/** A hex colour lightened (+) or darkened (−). */
function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}
/** Trims and rails stop this short of a wall's ends, so their end faces never share a plane with it. */
const END_INSET = 0.006;
/** A rect shortened at both ends of its long axis. */
const shortenEnds = (r: Rect, by: number): Rect => (r.z1 - r.z0 >= r.x1 - r.x0 ? rect(r.x0, r.z0 + by, r.x1, r.z1 - by) : rect(r.x0 + by, r.z0, r.x1 - by, r.z1));
/** Supply stand steps: stock sits on these. */
const SHELF_LOW = 0.3;
const SHELF_HIGH = 0.62;
const SHELF_TOP = 0.012;
/** Mess pieces are built this much bigger than their MESS_CELL, so they read at phone zoom. */
const MESS_SCALE = 1.9;
/**
 * Mess floor slots on the boards around the mat, outside the cleaning pad: front left, front right, back
 * left (the back right corner is where the tip is left). The room stays one spot to clean from.
 */
const MESS_SLOTS = [{ x: -0.38, z: -0.82 }, { x: 0.4, z: -0.82 }, { x: -0.38, z: 0.82 }];

interface CabinMess {
  group: THREE.Group;
  items: THREE.Mesh[];
  key: string;
  /** The cleaning spot: swept pieces fly here. */
  heart: { x: number; z: number };
}


/** The washroom stock stand: panel width, board tops and overall height (metres above the floor). */
const WASH_SHELF = { side: 0.03, middle: 0.33, top: 0.6, height: 0.64 };
/** Room door leaves: height, and each leaf's offset from the partition centre (they pass inside it). */
const LEAF_HEIGHT = 0.66;
const LEAF_GAP = 0.04;
/** An open leaf stops this far short of the end of the wall it slides into. */
const DOOR_POCKET_MARGIN = 0.015;

/** How a carriage looks at a refurbishment tier: the whole rags-to-riches story in one table. */
interface Finish {
  wall: string;
  wallLow: string;
  /** Lower wall is wood panelling rather than paint (Luxurious, and passenger classes from Business). */
  panelled: boolean;
  /** The panelling's colour (walnut, or burgundy in the Royal Suite). */
  panel: string;
  cap: string;
  floor: string;
  floorSeam: string;
  floorPattern: number;
  floorScale: number;
  room: string;
  roomSeam: string;
  roomPattern: number;
  roomScale: number;
  runner: { body: string; edge: string } | null;
  curtains: boolean;
  /** 0 bare bulbs, 1 shaded lamps, 2 sconces, 3 brass sconces. */
  lamps: number;
  decor: boolean;
}

function finishFor(type: CarriageType, tier: number, t: CarriageTheme): Finish {
  const tiled = type === 'bathroom';
  if (isPassengerType(type) && tier >= 3) {
    // Business, First Class and the Royal Suite: panelled, a runner edged in silver or gold, brass sconces.
    const edge = tier === 3 ? '#C9D2DC' : PALETTE.gold;
    return {
      wall: t.wall, wallLow: t.wallLow, panelled: true, panel: tier >= 5 ? '#5A1A28' : PALETTE.walnut, cap: tier >= 5 ? PALETTE.gold : PALETTE.walnut,
      floor: PALETTE.boards, floorSeam: PALETTE.boardsSeam, floorPattern: PATTERN.boards, floorScale: 0.3,
      room: PALETTE.boards, roomSeam: PALETTE.boardsSeam, roomPattern: PATTERN.boards, roomScale: 0.3,
      runner: { body: t.deep, edge }, curtains: true, lamps: 3, decor: true,
    };
  }
  if (tier <= 0) {
    return {
      wall: PALETTE.wallWorn, wallLow: PALETTE.wallWornLow, panelled: false, panel: PALETTE.walnut, cap: '#9DAFA3',
      floor: PALETTE.plankWorn, floorSeam: PALETTE.plankWornSeam, floorPattern: PATTERN.boards, floorScale: 0.3,
      room: PALETTE.plankWorn, roomSeam: PALETTE.plankWornSeam, roomPattern: PATTERN.boards, roomScale: 0.3,
      runner: null, curtains: false, lamps: 0, decor: false,
    };
  }
  const oakRoom = tiled ? { room: '#F4F1EA', roomSeam: '#DCE3E0', roomPattern: PATTERN.checker, roomScale: 0.3 } : { room: PALETTE.boards, roomSeam: PALETTE.boardsSeam, roomPattern: PATTERN.boards, roomScale: 0.3 };
  // Cabins keep their floorboards at every tier: the mat is what gets finer.
  const carpetRoom = oakRoom;
  const base = {
    wall: t.wall, wallLow: t.wallLow, panelled: tier >= 3, panel: PALETTE.walnut, cap: PALETTE.walnut,
    floor: PALETTE.boards, floorSeam: PALETTE.boardsSeam, floorPattern: PATTERN.boards, floorScale: 0.3,
  };
  // Repaired: sound, clean and plain (neutral paint); the carriage's own colours arrive at Cosy.
  if (tier === 1) return { ...base, wall: '#EFEADF', wallLow: '#D8D0C0', ...oakRoom, runner: null, curtains: false, lamps: 1, decor: false };
  if (tier === 2) return { ...base, ...carpetRoom, runner: { body: t.deep, edge: t.wall }, curtains: true, lamps: 2, decor: false };
  return { ...base, ...carpetRoom, runner: { body: t.deep, edge: PALETTE.gold }, curtains: true, lamps: 3, decor: true };
}

interface Slot {
  x: number;
  y: number;
  z: number;
  ry?: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const tmpScale = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A row of stock (towels, rolls, suitcases) as instanced meshes: one draw per look however much is on the
 * shelf. Slots fill in order; slot i uses geometry i % looks.
 */
class StockRack {
  private readonly meshes: THREE.InstancedMesh[];
  private shown = -1;

  constructor(parent: THREE.Group, geometries: THREE.BufferGeometry[], slots: Slot[], castShadow = false, label = 'stock') {
    const looks = geometries.length;
    this.meshes = geometries.map((geometry, k) => {
      const capacity = Math.max(1, Math.ceil((slots.length - k) / looks));
      const mesh = new THREE.InstancedMesh(geometry, MATERIALS.solid, capacity);
      // Each instance is an object for the clipping audit.
      mesh.userData.stock = label;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.userData.shared = true;
      parent.add(mesh);
      return mesh;
    });
    slots.forEach((slot, i) => {
      tmpQuat.setFromAxisAngle(UP, slot.ry ?? 0);
      tmpMatrix.compose(tmpPos.set(slot.x, slot.y, slot.z), tmpQuat, ONE);
      this.meshes[i % looks].setMatrixAt(Math.floor(i / looks), tmpMatrix);
    });
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      // Bounds over every slot, so culling stays right whatever is shown.
      mesh.computeBoundingSphere();
      mesh.count = 0;
    }
    this.looks = looks;
  }

  private readonly looks: number;

  show(count: number): void {
    if (count === this.shown) return;
    this.shown = count;
    this.meshes.forEach((mesh, k) => {
      mesh.count = Math.max(0, Math.min(mesh.instanceMatrix.count, Math.ceil((count - k) / this.looks)));
    });
  }
}

/** A doorway's sliding door: two leaves that part and slide into the wall on either side. */
export interface RoomDoor {
  kind: 'cabin' | 'bath';
  index: number;
  /** Doorway centre in carriage-local coordinates. */
  x: number;
  z: number;
  open: number;
  locked: boolean;
  width: number;
  /** First of this door's two instances in the carriage's leaf mesh, and each leaf's closed position. */
  instance: number;
  closedZ: [number, number];
  /**
   * Each leaf's length, which is also how far it slides (front leaf toward −z, back leaf toward +z). A leaf
   * is only as long as the wall beside it, so an open door always vanishes completely.
   */
  lengths: [number, number];
}

/**
 * One carriage as a clean dollhouse cross-section, built from its floor plan and its refurbishment tier:
 * two-skin walls (interior finish inside, livery outside) with windows; a flat, quiet floor per room;
 * sliding doors on every room; the gangway to the next car; furniture that improves with the tier.
 * Static parts merge into a handful of meshes. Things that change (beds that pop in, dirt, stock, doors)
 * are small separate meshes the gameplay layer toggles.
 */
export class CarriageView {
  readonly group = new THREE.Group();
  readonly cabinBeds: THREE.Group[] = [];
  readonly bathroomFixtures: THREE.Group[] = [];
  readonly roomDoors: RoomDoor[] = [];
  /** Washing-machine drums: spun by animate() so the laundry is always going. */
  private readonly spinners: THREE.Object3D[] = [];
  private readonly cabinLocks: THREE.Mesh[] = [];
  private readonly bathroomLocks: THREE.Mesh[] = [];
  /** Comfort props per room (lamps, flowers, radios; soaps, towel rails), rebuilt when one is bought. */
  private cabinComforts: THREE.Group[] = [];
  private bathComforts: THREE.Group[] = [];
  /** Each cabin's mess after a guest leaves: pieces that clear away as it is tidied, and floor stains. */
  private readonly mess: CabinMess[] = [];
  /** Each cabin's mat: its own material, so a dirty room's mat dims and brightens back as it is tidied. */
  private readonly cabinLocked: boolean[] = [];
  private readonly doors: THREE.Mesh[] = [];
  private readonly bathroomTowels: StockRack[] = [];
  private readonly bathroomRolls: StockRack[] = [];
  private shelfTowels: StockRack | null = null;
  private shelfRolls: StockRack | null = null;
  private luggage: StockRack | null = null;
  /** Every room door's two leaves, instanced: one draw for the whole carriage. */
  private leafMesh: THREE.InstancedMesh | null = null;
  private doorOpen = 0;
  readonly theme: CarriageTheme;
  /** What sleepers are tucked under: matches the bedspread at this tier. */
  readonly blanketColor: string;
  private readonly finish: Finish;
  private floorInfo: FloorResult = { queueBase: FLOOR_Y };

  /** A passenger carriage's class (from its tier); null for service cars. */
  readonly cls: ClassDef | null;
  /** The paint outside: the class's own livery on passenger carriages, the train's livery on service cars. */
  readonly liveryBody: THREE.Material;
  readonly liveryTrim: THREE.Material;

  constructor(readonly layout: CarriageLayout, readonly index: number, readonly tier = 0) {
    const passenger = isPassengerType(layout.type);
    this.cls = passenger ? classOfTier(tier) : null;
    const cls = this.cls;
    this.theme = cls && cls.id !== 'basic' ? CLASS_THEMES[cls.id] : CARRIAGE_THEMES[layout.type];
    this.finish = finishFor(layout.type, tier, this.theme);
    this.blanketColor = tier <= 0 ? PALETTE.greyWool : tier >= 3 ? (tier >= 4 ? this.theme.blanket : this.theme.deep) : this.theme.blanket;
    this.liveryBody = cls ? litMaterial(`livery:${cls.id}`, { vertexColors: true, color: cls.livery.body }, { surface: SURFACES.paint, light: true }) : MATERIALS.livery;
    this.liveryTrim = cls ? litMaterial(`trim:${cls.id}`, { vertexColors: true, color: cls.livery.trim }, { surface: tier >= 4 ? SURFACES.brass : SURFACES.paint, light: true }) : MATERIALS.liveryTrim;
    this.buildStatic();
    this.buildRooms();
    this.buildRoomDoors();
    this.buildDoors();
    this.buildStock();
  }

  setCabinLocked(cabin: number, locked: boolean): void {
    const lock = this.cabinLocks[cabin];
    const bed = this.cabinBeds[cabin];
    if (lock) lock.visible = locked;
    if (bed) bed.visible = !locked;
    const comforts = this.cabinComforts[cabin];
    if (comforts) comforts.visible = !locked;
    this.cabinLocked[cabin] = locked;
    const mess = this.mess[cabin];
    if (mess && locked) mess.group.visible = false;
    const door = this.roomDoors.find((d) => d.kind === 'cabin' && d.index === cabin);
    if (door) door.locked = locked;
  }

  setBathroomLocked(bathroom: number, locked: boolean): void {
    const lock = this.bathroomLocks[bathroom];
    const fixtures = this.bathroomFixtures[bathroom];
    if (lock) lock.visible = locked;
    if (fixtures) fixtures.visible = !locked;
    const comforts = this.bathComforts[bathroom];
    if (comforts) comforts.visible = !locked;
    const door = this.roomDoors.find((d) => d.kind === 'bath' && d.index === bathroom);
    if (door) door.locked = locked;
  }

  /** A cabin after its guest leaves: an unmade heap on the bed, a pillow on the floor, litter, stains. */
  setDirt(cabin: number, spots: boolean[]): void {
    const mess = this.mess[cabin];
    if (!mess) return;
    // A room still for sale has nothing in it to tidy.
    const dirty = spots.some(Boolean) && !this.cabinLocked[cabin];
    if (mess.group.visible === dirty) return;
    mess.group.visible = dirty;
    if (dirty) this.setDirtFade(cabin, 0, 0);
  }

  /**
   * Tidying (0..1): one after another, each piece is swept in to the broom (a hop and a shrink toward the
   * cleaning spot) and pops; last of all the bed straightens flat.
   * `onPop` hears each piece as it vanishes (world position), for the puff and the sound.
   */
  setDirtFade(cabin: number, _spot: number, progress: number, onPop?: (x: number, y: number, z: number) => void): void {
    const mess = this.mess[cabin];
    if (!mess) return;
    const n = mess.items.length;
    mess.items.forEach((item, k) => {
      const home = item.userData.home as { x: number; y: number; z: number; scale: number };
      const gone = (k + 1) / (n + 1);
      const t = Math.min(1, Math.max(0, (progress - (gone - MESS_POP)) / MESS_POP));
      const visible = t < 1;
      if (item.visible && !visible && onPop) {
        item.getWorldPosition(tmpPos);
        onPop(tmpPos.x, FLOOR_Y + 0.25, tmpPos.z);
      }
      item.visible = visible;
      if (k === n - 1) {
        // The unmade bed smooths down into the made one.
        const flat = t * t;
        item.scale.set(1, Math.max(0.001, 1 - flat), 1);
        item.position.y = home.y + (BED_TOP + 0.03) * flat;
        return;
      }
      const p = t * t * (3 - 2 * t);
      item.position.set(
        home.x + (mess.heart.x - home.x) * p,
        home.y + Math.sin(p * Math.PI) * MESS_HOP,
        home.z + (mess.heart.z - home.z) * p,
      );
      item.scale.setScalar(Math.max(0.001, home.scale * (1 - 0.8 * p)));
    });
  }



  setBathroomStock(bathroom: number, towels: number, rolls: number): void {
    this.bathroomTowels[bathroom]?.show(towels);
    this.bathroomRolls[bathroom]?.show(rolls);
  }

  setShelfStock(towels: number, rolls: number): void {
    this.shelfTowels?.show(towels);
    this.shelfRolls?.show(rolls);
  }

  setLuggageCount(count: number): void {
    this.luggage?.show(count);
  }

  /** 0 = closed, 1 = open. Platform doors slide along the carriage. */
  setDoorOpen(amount: number): void {
    if (amount === this.doorOpen) return;
    this.doorOpen = amount;
    for (const door of this.doors) {
      const closedZ = door.userData.closedZ as number;
      door.position.z = closedZ + amount * (DOOR_Z1 - DOOR_Z0) * 0.92;
    }
  }

  /** Slides a room door: the two leaves part and disappear into the wall on either side. */
  setRoomDoor(door: RoomDoor, amount: number): void {
    if (amount === door.open || !this.leafMesh) return;
    door.open = amount;
    for (let k = 0; k < 2; k++) {
      tmpPos.set(door.x + (k === 0 ? -LEAF_GAP : LEAF_GAP), FLOOR_Y + LEAF_HEIGHT / 2, door.closedZ[k] + amount * door.lengths[k] * (k === 0 ? -1 : 1));
      tmpMatrix.compose(tmpPos, tmpQuat.identity(), tmpScale.set(1, 1, door.lengths[k] / (door.width / 2)));
      this.leafMesh.setMatrixAt(door.instance + k, tmpMatrix);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Dresses every room with the comforts bought for this carriage and returns one group per room (each
   * pivots on its cluster of props, so the gameplay layer can pop them in). Locked rooms stay bare.
   */
  setComforts(keys: readonly ComfortKey[]): THREE.Group[] {
    for (const g of [...this.cabinComforts, ...this.bathComforts]) {
      this.group.remove(g);
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.cabinComforts = [];
    this.bathComforts = [];
    if (keys.length === 0) return [];
    const make = (build: (b: GeoBuilder, glow: GeoBuilder) => void, pivot: { x: number; z: number }, visible: boolean): THREE.Group | null => {
      const b = new GeoBuilder();
      const glow = new GeoBuilder();
      build(b, glow);
      if (b.isEmpty && glow.isEmpty) return null;
      const group = new THREE.Group();
      group.position.set(pivot.x, FLOOR_Y, pivot.z);
      for (const [builder, material] of [[b, MATERIALS.solid], [glow, MATERIALS.lamps]] as const) {
        if (builder.isEmpty) continue;
        const geometry = builder.build();
        geometry.translate(-pivot.x, -FLOOR_Y, -pivot.z);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = material === MATERIALS.solid;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      group.visible = visible;
      this.group.add(group);
      return group;
    };
    const out: THREE.Group[] = [];
    for (const cabin of this.layout.cabins) {
      const pivot = { x: cabin.bed.x0 - 0.2, z: cabin.room.z0 + 0.2 };
      const group = make((b, glow) => buildCabinComforts(b, glow, cabin, keys, this.theme, this.tier), pivot, this.cabinBeds[cabin.index]?.visible ?? true);
      if (!group) continue;
      this.cabinComforts[cabin.index] = group;
      out.push(group);
    }
    for (const bath of this.layout.bathrooms) {
      const fixtures = this.layout.props.filter((p) => (p.kind === 'sink' || p.kind === 'bathtub') && rectInside(p.rect, bath.room));
      const pivot = { x: 0, z: bath.room.z0 + 0.3 };
      const group = make((b) => buildBathComforts(b, bath.room, fixtures, keys, this.theme, this.tier), pivot, this.bathroomFixtures[bath.index]?.visible ?? true);
      if (!group) continue;
      this.bathComforts[bath.index] = group;
      out.push(group);
    }
    return out;
  }

  /**
   * Where this carriage's light comes from, for the lamp pools (carriage-local): a ceiling light every few
   * metres along each room and the corridor, like the lamps of a real sleeper, just above the cut-away walls.
   */
  lampAnchors(originZ: number): LampAnchor[] {
    const out: LampAnchor[] = [];
    const y = FLOOR_Y + 1.25;
    for (const room of this.layout.rooms) {
      const w = room.x1 - room.x0;
      const d = room.z1 - room.z0;
      if (w < 0.6 || d < 0.6) continue;
      const alongZ = d >= w;
      const length = alongZ ? d : w;
      const count = Math.max(1, Math.round(length / LAMP_SPACING));
      const strength = Math.min(1, 0.55 + (w * d) / 10);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        out.push({
          x: alongZ ? (room.x0 + room.x1) / 2 : room.x0 + w * t,
          y,
          z: originZ + (alongZ ? room.z0 + d * t : (room.z0 + room.z1) / 2),
          strength,
        });
      }
    }
    return out;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && !(mesh.userData.shared as boolean)) mesh.geometry.dispose();
    });
  }

  // ─── Static build ──────────────────────────────────────────────────────────

  private buildStatic(): void {
    const L = CARRIAGE_LENGTH;
    const s = new GeoBuilder();
    const f = new GeoBuilder();
    const liv = new GeoBuilder();
    const trim = new GeoBuilder();
    const glass = new GeoBuilder();
    const lamps = new GeoBuilder();
    const fin = this.finish;

    // Chassis: a skirt in the livery with a trim line, dark bogies below. Skirt and trim are hollow frames,
    // so the space under the floor stays open for the run-down subfloor and joists to show through holes.
    const skirtW = HALF_WIDTH * 2 - 0.06;
    const skirtL = L - 0.12;
    const rim = 0.14;
    for (const side of [-1, 1]) {
      liv.box(side * (skirtW / 2 - rim / 2), 0.46, L / 2, rim, 0.16, skirtL, '#FFFFFF', 0, { shade: 0.8 });
      liv.box(0, 0.46, L / 2 + side * (skirtL / 2 - rim / 2), skirtW - rim * 2 - 0.004, 0.16, rim, '#FFFFFF', 0, { shade: 0.8 });
      trim.box(side * (HALF_WIDTH - 0.01 - rim / 2), 0.525, L / 2, rim, 0.025, L - 0.1, '#FFFFFF', 0, FLAT);
      trim.box(0, 0.525, L / 2 + side * ((L - 0.1) / 2 - rim / 2), HALF_WIDTH * 2 - 0.02 - rim * 2 - 0.004, 0.025, rim, '#FFFFFF', 0, FLAT);
    }
    s.box(0, 0.28, L / 2, HALF_WIDTH * 2 - 0.6, 0.2, L - 0.8, PALETTE.undercarriage);
    for (const z of [2.3, L - 2.3]) {
      s.box(0, 0.2, z, 2.4, 0.18, 2.2, PALETTE.wheel);
      for (const x of [-1.28, 1.28]) for (const dz of [-0.6, 0.6]) s.cylinder(x, 0.24, z + dz, 0.25, 0.25, 0.13, PALETTE.wheel, 12, 'x');
    }
    for (const z of [0.02, L - 0.02]) for (const x of [-1.3, 1.3]) s.cylinder(x, 0.42, z, 0.11, 0.11, 0.25, PALETTE.chrome, 10, 'z');

    // Floor: the tier's boards (broken and old, then repaired, polished, parquet), rooms and rugs (Floors.ts).
    // Passenger classes: Comfort and Business polished boards, First chevron parquet, Royal marble.
    const floorTier = this.cls ? [0, 1, 2, 2, 3, 4][this.tier] ?? 4 : this.tier;
    this.floorInfo = buildFloor(f, this.layout, floorTier, this.theme, this.index * 7 + this.layout.type.length);
    if (this.tier <= 0) {
      const webs = buildCobwebs(this.layout, this.index + 3);
      if (webs) this.group.add(webs);
    }
    if (fin.runner && (this.layout.cabins.length > 0 || this.layout.bathrooms.length > 0)) {
      const z0 = this.layout.type === 'lobby' ? 6.1 : this.frontDepth() + 0.05;
      const z1 = L - REAR_VESTIBULE - 0.05;
      const x0 = -INNER + 0.12;
      const x1 = PARTITION_X0 - 0.12;
      f.slab(rect(x0, z0, x1, z1), FLOOR_Y, FLOOR_Y + LIFT, fin.runner.edge, 0, 0, FLAT);
      f.slab(rect(x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, fin.runner.body, 0, 0, FLAT);
    }

    // Service cars get a runner down the aisle once they are cosy.
    if (fin.runner && (this.layout.type === 'supply' || this.layout.type === 'luggage')) {
      const hw = this.layout.type === 'supply' ? 0.55 : 0.5;
      f.slab(rect(-hw, 3.0, hw, L - REAR_VESTIBULE - 0.3), FLOOR_Y, FLOOR_Y + LIFT, fin.runner.edge, 0, 0, FLAT);
      f.slab(rect(-hw + 0.05, 3.05, hw - 0.05, L - REAR_VESTIBULE - 0.35), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, fin.runner.body, 0, 0, FLAT);
    }

    // Gangway to the next car: a steel plate between concertina bellows.
    f.box(0, FLOOR_Y - 0.02, L + GANGWAY_LENGTH / 2, 1.36, 0.04, GANGWAY_LENGTH - 0.02, '#8F8B87', 0, FLAT);
    for (const x of [-0.74, 0.74]) s.box(x, FLOOR_Y + 0.45, L + GANGWAY_LENGTH / 2, 0.1, 0.9, GANGWAY_LENGTH - 0.02, '#46444D', 0, { pattern: PATTERN.stripesZ, color2: '#3A3840', scale: 0.08, shade: 0.8 });

    for (const wall of this.layout.walls) this.buildWall(s, liv, trim, glass, lamps, wall);
    for (const prop of this.layout.props) {
      if (prop.kind === 'bed' || prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub' || prop.kind === 'washShelf') continue;
      if (prop.kind === 'plant' && this.tier < 2) continue;
      s.object(`prop:${prop.kind}`);
      lamps.object(`prop:${prop.kind}~glow`);
      buildProp(s, lamps, prop, this.theme, this.tier);
      s.endObject();
      lamps.endObject();
    }
    this.buildDecor(s, f, lamps);
    if (this.cls) for (const cabin of this.layout.cabins) buildClassDressing(s, lamps, cabin, this.tier, this.theme);
    this.buildDoorFrames(s);
    this.buildSpinners();

    const add = (builder: GeoBuilder, material: THREE.Material, cast: boolean, receive: boolean, reflect = false): void => {
      if (builder.isEmpty) return;
      const mesh = new THREE.Mesh(builder.build(), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      // The outside of the train (paint, glowing windows) is mirrored in the lake on the high tiers.
      if (reflect) mesh.layers.enable(REFLECT_LAYER);
      this.group.add(mesh);
    };
    add(s, MATERIALS.solid, true, true);
    add(liv, this.liveryBody, true, true, true);
    add(trim, this.liveryTrim, false, true, true);
    add(f, MATERIALS.floor, false, true);
    add(glass, MATERIALS.windows, false, false, true);
    add(lamps, MATERIALS.lamps, false, false, true);
  }

  /**
   * The mess a guest leaves: a crumpled heap of bedding on the bed, the pillow on the floor, yesterday's
   * paper, a cup on its side, and a couple of stains. Each piece is its own small mesh so it can pop away
   * as the cabin is tidied; the neat bed underneath is what's left.
   */
  private buildMess(cabin: CabinLayout): CabinMess {
    const group = new THREE.Group();
    group.visible = false;
    this.group.add(group);
    const heart = cabin.spots[0] ?? cabin.center;
    const mess: CabinMess = { group, items: [], key: '', heart: { x: heart.x, z: heart.z } };
    this.mess[cabin.index] = mess;
    // A default mess (previews and the audit); the game sets each guest's own with setMess().
    this.setMess(cabin.index, ['newspaper', 'cup', 'paperBalls'], 'heap', 1);
    return mess;
  }

  /**
   * What the last guest left: floor pieces in the mat's corner slots (clear of the cleaner in the middle),
   * then the unmade bed, in the order they get tidied (floor first, the bed last: the big reveal).
   */
  setMess(cabinIndex: number, pieces: readonly MessPiece[], bed: BedMess, seed: number): void {
    const mess = this.mess[cabinIndex];
    const cabin = this.layout.cabins[cabinIndex];
    if (!mess || !cabin) return;
    const key = `${pieces.join(',')}|${bed}|${seed}`;
    if (key === mess.key) return;
    mess.key = key;
    for (const item of mess.items) {
      mess.group.remove(item);
      item.geometry.dispose();
    }
    mess.items.length = 0;
    const rand = seeded(seed);
    const heart = mess.heart;
    const floor = FLOOR_Y + LIFT;
    const add = (build: (b: GeoBuilder) => void, x: number, y: number, z: number, ry: number, scale: number, name: string): void => {
      const b = new GeoBuilder();
      build(b);
      const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
      mesh.userData.object = `mess:${name}`;
      mesh.userData.home = { x, y, z, scale };
      mesh.castShadow = true;
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.scale.setScalar(scale);
      mess.group.add(mesh);
      mess.items.push(mesh);
    };
    // Slots in a shuffled order, so the same pieces never sit in the same places twice.
    const slots = MESS_SLOTS.map((o) => ({ x: heart.x + o.x, z: heart.z + o.z })).sort(() => rand() - 0.5);
    pieces.slice(0, slots.length).forEach((piece, i) => {
      const slot = slots[i];
      // Quarter turns only: a piece's square cell stays a square cell.
      add((b) => buildMessPiece(b, piece, 0), slot.x, floor, slot.z, Math.floor(rand() * 4) * (Math.PI / 2), MESS_SCALE, piece);
    });
    const r = cabin.bed;
    const w = r.x1 - r.x0 - 0.1;
    const d = r.z1 - r.z0 - 0.3;
    add((b) => buildBedMess(b, bed, w, d, BED_TOP + 0.03, this.blanketColor, shadeHex(this.blanketColor, -26)), (r.x0 + r.x1) / 2, FLOOR_Y, (r.z0 + r.z1) / 2 + 0.1, 0, 1, `bed-${bed}`);
    if (mess.group.visible) this.setDirtFade(cabinIndex, 0, 0);
  }




  /** A drum of washing behind each machine's round window, turning slowly. */
  private buildSpinners(): void {
    for (const prop of this.layout.props) {
      if (prop.kind !== 'laundry') continue;
      const r = prop.rect;
      const d = r.z1 - r.z0;
      const w = r.x1 - r.x0;
      const count = Math.max(1, Math.floor(d / 0.78));
      const size = Math.min(w - 0.06, 0.62);
      for (let i = 0; i < count; i++) {
        const geo = new GeoBuilder()
          .cylinder(0, 0, 0, size * 0.33, size * 0.33, 0.012, '#6FA3C8', 20, 'y', FLAT)
          .box(0, 0.009, 0, size * 0.5, 0.008, 0.08, PALETTE.towel, 0, FLAT)
          .box(0, 0.013, 0, 0.08, 0.008, size * 0.44, '#F4EEE2', 0, FLAT)
          .build();
        const drum = new THREE.Mesh(geo, MATERIALS.solid);
        drum.position.set(r.x1 - size / 2 - 0.03, FLOOR_Y + 0.862, r.z0 + (d / count) * (i + 0.5));
        drum.rotation.y = i * 1.3;
        this.group.add(drum);
        this.spinners.push(drum);
      }
    }
  }

  /** Per-frame life: the laundry turns. */
  animate(dt: number): void {
    for (let i = 0; i < this.spinners.length; i++) this.spinners[i].rotation.y += dt * (2.6 + (i % 2) * 0.7);
  }

  private frontDepth(): number {
    if (!this.layout.frontNode) return 0;
    let depth = 0;
    for (const room of this.layout.rooms) if (room.z0 <= WALL + 0.01 && room.z1 < CARRIAGE_LENGTH / 2) depth = Math.max(depth, room.z1);
    return depth;
  }

  private buildWall(s: GeoBuilder, liv: GeoBuilder, trim: GeoBuilder, glass: GeoBuilder, lamps: GeoBuilder, wall: WallBox): void {
    const alongZ = wall.z1 - wall.z0 >= wall.x1 - wall.x0;
    if (wall.kind === 'interior') this.partition(s, wall, wall.height, alongZ);
    else if (alongZ) this.sideWall(s, liv, trim, glass, lamps, wall);
    else this.endWall(s, liv, trim, wall);
  }

  /** The inside finish of any wall face: a lower band (paint or panelling) and the upper wall. */
  private innerFinish(s: GeoBuilder, r: Rect, y0: number, y1: number, rail: Rect): void {
    const fin = this.finish;
    const low = Math.min(y1, FLOOR_Y + WAINSCOT);
    if (low > y0) s.slab(r, y0, low, fin.panelled ? fin.panel : fin.wallLow, 0, 0, { shade: 0.82, surface: fin.panelled ? 'varnish' : 'matte' });
    if (y1 > low) s.slab(r, Math.max(y0, low), y1, fin.wall, 0, 0, { shade: 0.96 });
    if (fin.panelled && y0 <= FLOOR_Y + WAINSCOT && y1 >= FLOOR_Y + WAINSCOT) s.slab(shortenEnds(rail, END_INSET), FLOOR_Y + WAINSCOT - 0.012, FLOOR_Y + WAINSCOT + 0.018, PALETTE.brass, 0, 0, FLAT);
  }

  /** Interior wall: the finish on both faces and a clean wooden cap. */
  private partition(s: GeoBuilder, r: Rect, h: number, alongZ: boolean): void {
    const grow = (d: number): Rect => (alongZ ? rect(r.x0 - d, r.z0, r.x1 + d, r.z1) : rect(r.x0, r.z0 - d, r.x1, r.z1 + d));
    this.innerFinish(s, r, FLOOR_Y, FLOOR_Y + h, grow(0.01));
    s.slab(grow(0.015), FLOOR_Y + h, FLOOR_Y + h + 0.04, this.finish.cap, 0, 0, FLAT);
  }

  /**
   * Long exterior wall: interior finish on the inside skin, livery outside, a band of windows (with
   * curtains from tier 2) and lamps between them, and a rounded cornice where the roof would be.
   */
  private sideWall(s: GeoBuilder, liv: GeoBuilder, trim: GeoBuilder, glass: GeoBuilder, lamps: GeoBuilder, r: WallBox): void {
    const fin = this.finish;
    const left = r.x0 < 0;
    const inner = left ? rect(r.x1 - SKIN, r.z0, r.x1, r.z1) : rect(r.x0, r.z0, r.x0 + SKIN, r.z1);
    const outer = left ? rect(r.x0, r.z0, r.x1 - SKIN, r.z1) : rect(r.x0 + SKIN, r.z0, r.x1, r.z1);
    const innerFace = left ? r.x1 : r.x0;
    const inward = left ? 1 : -1;
    const rail = left ? rect(inner.x0, r.z0, inner.x1 + 0.01, r.z1) : rect(inner.x0 - 0.01, r.z0, inner.x1, r.z1);
    const h = r.height;
    const len = r.z1 - r.z0;
    const zr = (z0: number, z1: number, base: Rect): Rect => rect(base.x0, z0, base.x1, z1);
    const white = '#FFFFFF';

    // Below and above the windows: solid.
    this.innerFinish(s, inner, FLOOR_Y, FLOOR_Y + WINDOW_Y0, rail);
    this.innerFinish(s, inner, FLOOR_Y + WINDOW_Y1, FLOOR_Y + h, rail);
    liv.slab(outer, 0.38, FLOOR_Y + WINDOW_Y0, white, 0, 0, { shade: 0.85 });
    liv.slab(outer, FLOOR_Y + WINDOW_Y1, FLOOR_Y + h, white, 0, 0, FLAT);
    trim.slab(rect(outer.x0 - (left ? 0.004 : 0), r.z0 + END_INSET, outer.x1 + (left ? 0 : 0.004), r.z1 - END_INSET), FLOOR_Y + 0.28, FLOOR_Y + 0.32, white, 0, 0, FLAT);

    const { count, slot, width } = windowSpacing(len);
    if (count === 0) {
      this.innerFinish(s, inner, FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, rail);
      liv.slab(outer, FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, white, 0, 0, FLAT);
    } else {
      let cursor = r.z0;
      for (let i = 0; i < count; i++) {
        const zc = r.z0 + slot * (i + 0.5);
        const w0 = zc - width / 2;
        const w1 = zc + width / 2;
        this.innerFinish(s, zr(cursor, w0, inner), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, rail);
        liv.slab(zr(cursor, w0, outer), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, white, 0, 0, FLAT);
        glass.box((r.x0 + r.x1) / 2, FLOOR_Y + (WINDOW_Y0 + WINDOW_Y1) / 2, zc, 0.03, WINDOW_Y1 - WINDOW_Y0, width, PALETTE.windowDay, 0, FLAT);
        s.box(innerFace + inward * 0.025, FLOOR_Y + WINDOW_Y0 + 0.012, zc, 0.05, 0.024, width + 0.06, fin.cap, 0, FLAT);
        if (fin.curtains) {
          for (const side of [-1, 1]) {
            s.box(innerFace + inward * 0.03, FLOOR_Y + (WINDOW_Y0 + WINDOW_Y1) / 2 + 0.03, zc + side * (width / 2 - 0.02), 0.03, WINDOW_Y1 - WINDOW_Y0 + 0.06, 0.08, this.theme.curtain, 0, { shade: 0.82 });
          }
        }
        // Lamps between windows: a bare bulb in the old carriage, proper sconces once refurbished.
        const lampEvery = fin.lamps >= 2 ? 2 : 3;
        if (i < count - 1 && i % lampEvery === 0) {
          const pz = zc + slot / 2;
          if (fin.lamps === 0) {
            // Bare bulbs on a flex: plain, not yet shaded.
            s.box(innerFace + inward * 0.02, FLOOR_Y + 0.9, pz, 0.02, 0.1, 0.02, PALETTE.ink, 0, FLAT);
            lamps.sphere(innerFace + inward * 0.05, FLOOR_Y + 0.82, pz, 0.035, PALETTE.lampShade, 0, 1, FLAT);
          } else {
            s.box(innerFace + inward * 0.035, FLOOR_Y + 0.72, pz, 0.07, 0.025, 0.025, fin.lamps >= 3 ? PALETTE.brass : fin.cap, 0, FLAT);
            lamps.cylinder(innerFace + inward * 0.09, FLOOR_Y + 0.78, pz, 0.04, 0.065, 0.09, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
          }
        }
        cursor = w1;
      }
      this.innerFinish(s, zr(cursor, r.z1, inner), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, rail);
      liv.slab(zr(cursor, r.z1, outer), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, white, 0, 0, FLAT);
    }
    // Cap and cornice: the carriage outline you read from above, in the livery.
    liv.slab(rect(r.x0 - (left ? 0.05 : 0), r.z0, r.x1 + (left ? 0 : 0.05), r.z1), FLOOR_Y + h, FLOOR_Y + h + 0.05, white, 0, 0, { shade: 0.92 });
    liv.cylinder(left ? r.x0 - 0.02 : r.x1 + 0.02, FLOOR_Y + h + 0.03, (r.z0 + r.z1) / 2, 0.06, 0.06, len, white, 8, 'z', FLAT);
  }

  /** End wall: interior finish inside (it faces the camera at the front of each car), livery outside. */
  private endWall(s: GeoBuilder, liv: GeoBuilder, trim: GeoBuilder, r: WallBox): void {
    const front = r.z0 < CARRIAGE_LENGTH / 2;
    const inner = front ? rect(r.x0, r.z1 - SKIN, r.x1, r.z1) : rect(r.x0, r.z0, r.x1, r.z0 + SKIN);
    const outer = front ? rect(r.x0, r.z0, r.x1, r.z1 - SKIN) : rect(r.x0, r.z0 + SKIN, r.x1, r.z1);
    const rail = front ? rect(r.x0, inner.z0, r.x1, inner.z1 + 0.01) : rect(r.x0, inner.z0 - 0.01, r.x1, inner.z1);
    const h = r.height;
    const white = '#FFFFFF';
    this.innerFinish(s, inner, FLOOR_Y, FLOOR_Y + h, rail);
    liv.slab(outer, 0.38, FLOOR_Y + h, white, 0, 0, { shade: 0.85 });
    trim.slab(rect(r.x0, outer.z0 - (front ? 0.004 : 0), r.x1, outer.z1 + (front ? 0 : 0.004)), FLOOR_Y + 0.28, FLOOR_Y + 0.32, white, 0, 0, FLAT);
    liv.slab(rect(r.x0, r.z0 - (front ? 0.05 : 0), r.x1, r.z1 + (front ? 0 : 0.05)), FLOOR_Y + h, FLOOR_Y + h + 0.05, white, 0, 0, { shade: 0.92 });
  }

  /** A few touches that grow with the tier: a clock and key rack in the lobby, frames and rugs later. */
  private buildDecor(s: GeoBuilder, f: GeoBuilder, lamps: GeoBuilder): void {
    const type = this.layout.type;
    const fin = this.finish;
    const frontWallZ = WALL + 0.012;
    const frame = (x: number, y: number, w: number, hgt: number, canvas: string): void => {
      s.object('decor:frame');
      s.box(x, FLOOR_Y + y, frontWallZ, w, hgt, 0.02, PALETTE.gold, 0, FLAT);
      s.box(x, FLOOR_Y + y, frontWallZ + 0.011, w - 0.06, hgt - 0.06, 0.004, canvas, 0, FLAT);
      s.endObject();
    };

    if (type === 'lobby' && this.tier >= 1) {
      // A clock above the counter, and (once cosy) the pigeon-hole key rack behind the desk.
      s.object('decor:clock');
      s.cylinder(1.2, FLOOR_Y + 0.74, frontWallZ + 0.01, 0.16, 0.16, 0.03, this.tier >= 3 ? PALETTE.gold : PALETTE.walnut, 18, 'z', FLAT);
      s.cylinder(1.2, FLOOR_Y + 0.74, frontWallZ + 0.026, 0.13, 0.13, 0.01, PALETTE.linen, 18, 'z', FLAT);
      s.box(1.2, FLOOR_Y + 0.78, frontWallZ + 0.034, 0.012, 0.08, 0.004, PALETTE.ink, 0, FLAT);
      s.box(1.235, FLOOR_Y + 0.74, frontWallZ + 0.034, 0.07, 0.012, 0.004, PALETTE.ink, 0, FLAT);
      s.endObject();
      if (this.tier >= 2) {
        const kx = -INNER + 0.05;
        s.object('decor:keyrack');
        s.box(kx, FLOOR_Y + 0.62, 2.8, 0.08, 0.4, 1.0, PALETTE.walnut, 0, { shade: 0.9 });
        for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
          s.box(kx + 0.042, FLOOR_Y + 0.52 + row * 0.18, 2.4 + col * 0.2, 0.008, 0.12, 0.16, PALETTE.walnutDark, 0, FLAT);
          if ((row + col) % 2 === 0) s.box(kx + 0.05, FLOOR_Y + 0.5 + row * 0.18, 2.4 + col * 0.2, 0.01, 0.04, 0.02, PALETTE.brass, 0, FLAT);
        }
        s.endObject();
      }
    }
    if (type === 'lobby') {
      // Painted queue places: where to stand reads at a glance, and the line stays tidy.
      const mark = this.tier >= 2 ? this.theme.deep : '#B9AE9C';
      const base = this.floorInfo.queueBase;
      const inner = base > FLOOR_Y ? '#EFE5D2' : fin.floor;
      QUEUE_SLOTS.forEach((p, i) => {
        f.disc(p.x, base + LIFT, p.z, 0.22, mark, 24);
        f.disc(p.x, base + LIFT * 2, p.z, 0.17, inner, 24);
        const next = QUEUE_SLOTS[i + 1];
        if (!next) return;
        // A dotted guide to the next place.
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          f.disc(p.x + (next.x - p.x) * t, base + LIFT, p.z + (next.z - p.z) * t, 0.035, mark, 10);
        }
      });
    }
    if (fin.decor && type !== 'lobby') {
      // Pictures only where nothing already stands against the front wall.
      const wallFree = (x: number, w: number): boolean => !this.layout.props.some((p) => p.rect.z0 < 0.8 && p.rect.x0 < x + w / 2 && p.rect.x1 > x - w / 2);
      if (wallFree(-1.35, 0.44)) frame(-1.35, 0.66, 0.44, 0.32, PALETTE.frameCanvas[this.index % 4]);
      if (wallFree(1.35, 0.44)) frame(1.35, 0.66, 0.44, 0.32, PALETTE.frameCanvas[(this.index + 1) % 4]);
    }

    for (const cabin of this.layout.cabins) {
      const { bed } = cabin;
      if (fin.lamps >= 2) {
        s.box(INNER - 0.035, FLOOR_Y + 0.74, bed.z0 + 0.3, 0.05, 0.025, 0.025, fin.lamps >= 3 ? PALETTE.brass : PALETTE.walnut, 0, FLAT);
        lamps.cylinder(INNER - 0.09, FLOOR_Y + 0.8, bed.z0 + 0.3, 0.035, 0.06, 0.08, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
      }
    }

    for (const bath of this.layout.bathrooms) {
      const sink = this.layout.props.find((p) => p.kind === 'sink' && rectInside(p.rect, bath.room));
      if (sink && this.tier >= 1) {
        const cz = (sink.rect.z0 + sink.rect.z1) / 2;
        s.box(INNER - 0.03, FLOOR_Y + 0.98, cz, 0.03, 0.32, 0.46, this.tier >= 3 ? PALETTE.gold : PALETTE.walnut, 0, FLAT);
        s.box(INNER - 0.045, FLOOR_Y + 0.98, cz, 0.01, 0.26, 0.4, '#DDEEF3', 0, FLAT);
      }
    }
  }

  private buildRooms(): void {
    for (const cabin of this.layout.cabins) {
      const bed = new GeoBuilder();
      const bedLamps = new GeoBuilder();
      bed.object('bed');
      buildProp(bed, bedLamps, { kind: 'bed', rect: cabin.bed }, this.theme, this.tier);
      const bedGroup = new THREE.Group();
      const centerX = (cabin.bed.x0 + cabin.bed.x1) / 2;
      const centerZ = (cabin.bed.z0 + cabin.bed.z1) / 2;
      const geometry = bed.build();
      geometry.translate(-centerX, -FLOOR_Y, -centerZ);
      const mesh = new THREE.Mesh(geometry, MATERIALS.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bedGroup.add(mesh);
      bedGroup.position.set(centerX, FLOOR_Y, centerZ);
      this.group.add(bedGroup);
      this.cabinBeds[cabin.index] = bedGroup;

      this.cabinLocks[cabin.index] = this.lockOverlay(cabin.room);
      this.buildMess(cabin);
    }

    for (const bath of this.layout.bathrooms) {
      const builder = new GeoBuilder();
      const bathLamps = new GeoBuilder();
      for (const prop of this.layout.props) {
        if ((prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub' || prop.kind === 'washShelf') && rectInside(prop.rect, bath.room)) {
          builder.object(prop.kind === 'washShelf' ? 'prop:washShelf' : `fixture:${prop.kind}`);
          buildProp(builder, bathLamps, prop, this.theme, this.tier);
        }
      }
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(builder.build(), MATERIALS.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.group.add(group);
      this.bathroomFixtures[bath.index] = group;
      this.bathroomLocks[bath.index] = this.lockOverlay(bath.room);
    }
  }

  private lockOverlay(room: Rect): THREE.Mesh {
    const lock = new THREE.Mesh(new THREE.PlaneGeometry(room.x1 - room.x0 - 0.04, room.z1 - room.z0 - 0.04).rotateX(-Math.PI / 2), MATERIALS.lockedOverlay);
    lock.position.set((room.x0 + room.x1) / 2, FLOOR_Y + 0.08, (room.z0 + room.z1) / 2);
    lock.visible = false;
    this.group.add(lock);
    return lock;
  }

  /**
   * Room doors: two leaves per doorway inside the partition's thickness, so they vanish into the wall when
   * open. They sit a little lower than the wall and wear the carriage's accent, with a frame and a
   * threshold (built into the static mesh), so a doorway reads as one from above even when shut.
   */
  private buildRoomDoors(): void {
    const doors: { kind: 'cabin' | 'bath'; index: number; span: [number, number] }[] = [
      ...this.layout.cabins.map((c) => ({ kind: 'cabin' as const, index: c.index, span: c.door })),
      ...this.layout.bathrooms.map((b) => ({ kind: 'bath' as const, index: b.index, span: b.door })),
    ];
    if (doors.length === 0) return;
    const width = doors[0].span[1] - doors[0].span[0];
    const leafLength = width / 2;
    const x = (PARTITION_X0 + PARTITION_X1) / 2;
    const colour = this.tier <= 0 ? '#A48B72' : this.theme.deep;
    const metal = this.doorMetal();
    const leaf = new GeoBuilder()
      // Glass, rail and handle stand a clear 1 cm proud of the panel (a hair's breadth would flicker).
      .box(0, 0, 0, 0.035, LEAF_HEIGHT, leafLength - 0.01, colour, 0, { shade: 0.85 })
      .box(0, 0.12, 0, 0.055, 0.22, leafLength * 0.6, this.tier <= 0 ? '#C2B29C' : '#E4EEF0', 0, FLAT)
      .box(0, LEAF_HEIGHT / 2 + 0.005, 0, 0.055, 0.012, leafLength - 0.01, metal, 0, FLAT)
      .box(0, -0.04, leafLength * 0.34, 0.075, 0.06, 0.025, metal, 0, FLAT)
      .build();
    const mesh = new THREE.InstancedMesh(leaf, MATERIALS.solid, doors.length * 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.leafMesh = mesh;
    // The partition's solid stretches either side of each doorway: a leaf slides as far as its wall allows.
    const partition = this.layout.walls.filter((w) => Math.abs(w.x0 - PARTITION_X0) < 0.02 && Math.abs(w.x1 - PARTITION_X1) < 0.02);
    const wallRoom = (edge: number, forward: boolean): number => {
      const wall = partition.find((w) => Math.abs((forward ? w.z0 : w.z1) - edge) < 0.02);
      return wall ? wall.z1 - wall.z0 : 0;
    };
    doors.forEach((d, i) => {
      const front = wallRoom(d.span[0], false) - DOOR_POCKET_MARGIN;
      const rear = wallRoom(d.span[1], true) - DOOR_POCKET_MARGIN;
      let a = Math.min(width / 2, front);
      let b = width - a;
      if (b > rear) {
        b = rear;
        a = Math.min(width - b, front);
      }
      const closedZ: [number, number] = [d.span[0] + a / 2, d.span[1] - b / 2];
      const door: RoomDoor = { kind: d.kind, index: d.index, x, z: (d.span[0] + d.span[1]) / 2, open: -1, locked: false, width, instance: i * 2, closedZ, lengths: [a, b] };
      this.roomDoors.push(door);
      this.setRoomDoor(door, 0);
    });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  private doorMetal(): string {
    return this.tier >= 5 ? PALETTE.gold : this.tier >= 2 ? PALETTE.brass : this.tier <= 0 ? PALETTE.iron : '#C9B79C';
  }

  /** Door frames and thresholds, merged into the carriage's static mesh. */
  private buildDoorFrames(s: GeoBuilder): void {
    const x = (PARTITION_X0 + PARTITION_X1) / 2;
    const thick = PARTITION_X1 - PARTITION_X0;
    const spans = [...this.layout.cabins.map((c) => c.door), ...this.layout.bathrooms.map((b) => b.door)];
    for (const span of spans) {
      for (const z of span) s.box(x, FLOOR_Y + (INTERIOR_WALL_HEIGHT + 0.06) / 2, z, thick + 0.04, INTERIOR_WALL_HEIGHT + 0.06, 0.06, this.finish.cap, 0, { shade: 0.85 });
      s.box(x, FLOOR_Y + 0.004, (span[0] + span[1]) / 2, thick, 0.008, span[1] - span[0], this.doorMetal(), 0, FLAT);
    }
  }

  private buildDoors(): void {
    const len = DOOR_Z1 - DOOR_Z0;
    const body = new GeoBuilder()
      .box(0, 0, 0, 0.07, 1.05, len, '#FFFFFF', 0, { shade: 0.85 })
      .build();
    const details = new GeoBuilder()
      .box(0.04, 0.2, 0, 0.012, 0.34, len * 0.55, PALETTE.windowDay, 0, FLAT)
      .box(0.045, -0.05, len * 0.3, 0.02, 0.14, 0.03, PALETTE.brass, 0, FLAT)
      .build();
    const steps = new GeoBuilder();
    for (const door of this.layout.doors) {
      const group = new THREE.Group();
      const closedZ = (door.z0 + door.z1) / 2;
      const mesh = new THREE.Mesh(body, this.liveryBody);
      mesh.castShadow = true;
      group.add(mesh, new THREE.Mesh(details, MATERIALS.solid));
      group.position.set(HALF_WIDTH + 0.05, FLOOR_Y + 0.52, closedZ);
      group.userData.closedZ = closedZ;
      this.group.add(group);
      this.doors.push(group as unknown as THREE.Mesh);
      steps.box(HALF_WIDTH + 0.18, FLOOR_Y - 0.03, closedZ, 0.35, 0.05, len, PALETTE.brass, 0, FLAT);
    }
    if (!steps.isEmpty) this.group.add(new THREE.Mesh(steps.build(), MATERIALS.solid));
  }

  private buildStock(): void {
    // Trims stand a clear centimetre proud of what they wrap (flush trims flicker).
    const towelGeo = new GeoBuilder()
      .rounded(0, 0, 0, 0.26, 0.09, 0.2, 0.03, PALETTE.towel)
      .box(0, 0.006, 0.07, 0.28, 0.07, 0.03, PALETTE.towelStripe, 0, FLAT)
      .build();
    const rollGeo = new GeoBuilder().cylinder(0, 0, 0, 0.065, 0.065, 0.12, PALETTE.rollPaper, 12, 'x', { shade: 0.9 }).build();
    const suitcaseGeos = ['#C98A5E', '#5E7FA0', '#D9B45E', '#6E9C86'].map((color) =>
      new GeoBuilder()
        .rounded(0, 0, 0, 0.42, 0.26, 0.3, 0.05, color)
        .box(0, 0.14, 0, 0.14, 0.04, 0.05, PALETTE.ink, 0, FLAT)
        .box(-0.11, 0, 0, 0.03, 0.28, 0.32, PALETTE.creamBand, 0, FLAT)
        .box(0.11, 0, 0, 0.03, 0.28, 0.32, PALETTE.creamBand, 0, FLAT)
        .build(),
    );

    // Each washroom's stock lives on its own open shelf by the door: towels on top, rolls below.
    for (const bath of this.layout.bathrooms) {
      const shelf = this.layout.props.find((p) => p.kind === 'washShelf' && rectInside(p.rect, bath.room));
      if (!shelf) continue;
      const r = shelf.rect;
      const cz = (r.z0 + r.z1) / 2;
      const inner = r.x0 + WASH_SHELF.side;
      const towels: Slot[] = [];
      const rolls: Slot[] = [];
      for (let i = 0; i < 4; i++) {
        towels.push({ x: inner + 0.135 + (i % 2) * 0.27, y: FLOOR_Y + WASH_SHELF.top + 0.045 + Math.floor(i / 2) * 0.09, z: cz });
        rolls.push({ x: inner + 0.07 + i * 0.135, y: FLOOR_Y + WASH_SHELF.middle + 0.065, z: cz });
      }
      this.bathroomTowels[bath.index] = new StockRack(this.group, [towelGeo], towels, false, 'stock:towel');
      this.bathroomRolls[bath.index] = new StockRack(this.group, [rollGeo], rolls, false, 'stock:roll');
    }

    const towelShelf = this.layout.props.find((p) => p.kind === 'shelfTowel');
    const rollShelf = this.layout.props.find((p) => p.kind === 'shelfRoll');
    if (towelShelf) this.shelfTowels = new StockRack(this.group, [towelGeo], this.shelfSlots(towelShelf.rect, 16, -1), false, 'stock:shelfTowel');
    if (rollShelf) this.shelfRolls = new StockRack(this.group, [rollGeo], this.shelfSlots(rollShelf.rect, 16, 1), false, 'stock:shelfRoll');

    const racks = this.layout.props.filter((p) => p.kind === 'rack' || p.kind === 'luggageRack');
    const cases: Slot[] = [];
    for (const rack of racks) {
      const capacity = rack.kind === 'rack' ? 4 : 8;
      const cols = rack.kind === 'rack' ? 1 : 2;
      const rows = Math.ceil(capacity / cols);
      const depth = rack.rect.z1 - rack.rect.z0;
      for (let i = 0; i < capacity; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols) % rows;
        const layer = Math.floor(i / (cols * rows));
        const x = rack.rect.x0 + (rack.rect.x1 - rack.rect.x0) * ((col + 0.5) / cols);
        const z = rack.rect.z0 + depth * ((row + 0.5) / rows);
        cases.push({ x, y: FLOOR_Y + 0.86 + layer * 0.28, z, ry: Math.PI / 2 });
      }
    }
    if (cases.length > 0) this.luggage = new StockRack(this.group, suitcaseGeos, cases, true, 'stock:luggage');
  }

  /** Stock positions on a stepped supply stand: the low step (by the aisle) fills first. */
  private shelfSlots(r: Rect, count: number, wallSide: number): Slot[] {
    const slots: Slot[] = [];
    const perStep = count / 2;
    const quarter = (r.x1 - r.x0) / 4;
    const cx = (r.x0 + r.x1) / 2;
    for (let i = 0; i < count; i++) {
      const high = i >= perStep;
      const col = i % perStep;
      slots.push({
        x: cx + (high ? wallSide : -wallSide) * quarter,
        y: FLOOR_Y + (high ? SHELF_HIGH : SHELF_LOW) + SHELF_TOP + 0.06,
        z: r.z0 + 0.35 + (col + 0.5) * ((r.z1 - r.z0 - 0.7) / perStep),
      });
    }
    return slots;
  }
}

const rectInside = (inner: Rect, outer: Rect): boolean => inner.x0 >= outer.x0 - 0.01 && inner.x1 <= outer.x1 + 0.01 && inner.z0 >= outer.z0 - 0.01 && inner.z1 <= outer.z1 + 0.01;

/**
 * Furniture from a footprint, dressed for the carriage's tier: tier 0 is second-hand (iron cots, crates,
 * a dented kettle), tier 1 honest wood, tier 2 upholstered, tier 3 velvet and brass. `lamps` collects
 * shades that glow at night.
 */

/**
 * Cabin comforts, clustered at the head of the bed where the camera sees them: a nightstand with a
 * reading lamp, a vase of flowers and a picture, a wireless on a wall shelf.
 */
function buildCabinComforts(b: GeoBuilder, glow: GeoBuilder, cabin: CabinLayout, keys: readonly ComfortKey[], theme: CarriageTheme, tier: number): void {
  const y = FLOOR_Y;
  const wallZ = cabin.room.z0;
  const wood = tier >= 2 ? PALETTE.walnut : '#A98D6F';
  const nx1 = cabin.bed.x0 - 0.04;
  const nx0 = nx1 - 0.28;
  const nz0 = wallZ + 0.04;
  const nz1 = nz0 + 0.3;
  const ncx = (nx0 + nx1) / 2;
  const nightstand = keys.includes('lamp') || keys.includes('flowers');
  if (nightstand) {
    b.object('comfort:nightstand');
    b.slab(rect(nx0, nz0, nx1, nz1), y, y + 0.42, wood, 0, 0, { shade: 0.8 });
    b.slab(rect(nx0, nz0, nx1, nz1), y + 0.42, y + 0.45, PALETTE.walnutDark, 0, -0.012, FLAT);
    b.box(ncx, y + 0.27, nz1 + 0.006, 0.2, 0.1, 0.01, shadeHex(wood, 1.1), 0, FLAT);
    b.sphere(ncx, y + 0.27, nz1 + 0.018, 0.016, PALETTE.brass, 0);
  }
  if (keys.includes('lamp')) {
    b.object('comfort:lamp');
    glow.object('comfort:lamp~glow');
    // Back corner, the vase in the front one: they never touch.
    const lx = nx0 + 0.085;
    const lz = nz0 + 0.085;
    b.cylinder(lx, y + 0.465, lz, 0.04, 0.045, 0.03, PALETTE.brass, 10);
    b.cylinder(lx, y + 0.56, lz, 0.011, 0.011, 0.16, PALETTE.brass, 6);
    glow.cylinder(lx, y + 0.68, lz, 0.05, 0.085, 0.1, PALETTE.lampShade, 12, 'y', { shade: 0.9 });
  }
  if (keys.includes('flowers')) {
    b.object('comfort:flowers');
    const vx = nx1 - 0.065;
    const vz = nz1 - 0.065;
    b.cylinder(vx, y + 0.51, vz, 0.03, 0.04, 0.12, theme.deep, 10, 'y', { shade: 0.9 });
    const blooms = ['#F2A7B5', '#FFD35C', '#F7F2E8'];
    blooms.forEach((color, i) => {
      const a = (i / blooms.length) * Math.PI * 2;
      b.sphere(vx + Math.cos(a) * 0.026, y + 0.62 + (i % 2) * 0.025, vz + Math.sin(a) * 0.026, 0.028, color, 1, 0.9);
    });
    b.sphere(vx, y + 0.6, vz + 0.03, 0.02, '#7FA66B', 0, 0.9);
    // A little picture above, on the wall between the door and the bed.
    b.object('comfort:picture');
    const fx = cabin.room.x0 + 0.24;
    b.box(fx, y + 0.56, wallZ + 0.012, 0.3, 0.22, 0.02, PALETTE.gold, 0, FLAT);
    b.box(fx, y + 0.56, wallZ + 0.026, 0.24, 0.16, 0.004, PALETTE.frameCanvas[cabin.index % 4], 0, FLAT);
  }
  if (keys.includes('radio')) {
    // A wall shelf with a wireless, beside the picture.
    const rx = (cabin.room.x0 + 0.42 + nx0) / 2 + 0.04;
    b.object('comfort:radio');
    b.box(rx, y + 0.47, wallZ + 0.075, 0.3, 0.02, 0.15, PALETTE.walnutDark, 0, FLAT);
    b.rounded(rx, y + 0.556, wallZ + 0.075, 0.24, 0.15, 0.11, 0.03, tier >= 3 ? PALETTE.walnut : '#B5835A', { shade: 0.9 });
    b.box(rx - 0.04, y + 0.556, wallZ + 0.132, 0.1, 0.09, 0.006, '#E9D9B0', 0, FLAT);
    b.cylinder(rx + 0.07, y + 0.556, wallZ + 0.134, 0.022, 0.022, 0.01, PALETTE.brass, 10, 'z');
  }
}

/** Washroom comforts: scented soaps by the basin (or on the tub's rim) and a brass towel rail. */
function buildBathComforts(b: GeoBuilder, room: Rect, fixtures: PropDef[], keys: readonly ComfortKey[], theme: CarriageTheme, tier: number): void {
  const y = FLOOR_Y;
  if (keys.includes('soap')) {
    for (const f of fixtures) {
      b.object(`comfort:soap@${f.kind}`);
      const r = f.rect;
      const bottles = ['#F2A7B5', '#AFCBA7'];
      if (f.kind === 'sink') {
        // Together on the front corner of the counter, clear of the basin and the tap.
        bottles.forEach((color, i) => b.cylinder(r.x1 - 0.07, y + 0.812, r.z0 + 0.07 + i * 0.055, 0.022, 0.022, 0.09, color, 10, 'y', { shade: 0.9 }));
        b.rounded(r.x1 - 0.16, y + 0.776, r.z0 + 0.075, 0.07, 0.02, 0.045, 0.01, theme.blanket, FLAT);
      } else {
        bottles.forEach((color, i) => b.cylinder(r.x1 - 0.045, y + 0.55, r.z0 + 0.12 + i * 0.07, 0.02, 0.02, 0.09, color, 10, 'y', { shade: 0.9 }));
      }
    }
  }
  if (keys.includes('rail')) {
    b.object('comfort:rail');
    // On the front wall between the stock shelf and the toilet.
    const x0 = 0.2;
    const x1 = 0.82;
    const z = room.z0 + 0.05;
    const metal = tier >= 3 ? PALETTE.gold : PALETTE.brass;
    for (const px of [x0, x1]) b.cylinder(px, y + 0.52, z, 0.014, 0.014, 0.24, metal, 6);
    for (const py of [0.43, 0.61]) b.cylinder((x0 + x1) / 2, y + py, z, 0.012, 0.012, x1 - x0, metal, 6, 'x');
    // A towel folded over the top bar, hanging down its front.
    b.box((x0 + x1) / 2, y + 0.54, z + 0.024, 0.3, 0.16, 0.012, theme.blanket, 0, { shade: 0.95 });
    b.box((x0 + x1) / 2, y + 0.47, z + 0.035, 0.3, 0.02, 0.01, PALETTE.towelStripe, 0, FLAT);
  }
}

export function buildProp(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme = CARRIAGE_THEMES.lobby, tier = 1): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  const wood = tier <= 0 ? '#9C8570' : PALETTE.walnut;
  switch (prop.kind) {
    case 'bed': {
      if (tier <= 0) {
        // An iron cot: thin frame on legs, a thin mattress, a grey wool blanket, one flat pillow.
        for (const px of [r.x0 + 0.04, r.x1 - 0.04]) for (const pz of [r.z0 + 0.04, r.z1 - 0.04]) b.box(px, y + 0.14, pz, 0.04, 0.28, 0.04, PALETTE.iron, 0, FLAT);
        b.slab(r, y + 0.26, y + 0.3, PALETTE.iron, 0, 0, FLAT);
        b.slab(r, y + 0.3, y + BED_TOP - 0.02, '#E9E2D5', 0, 0.04, { shade: 0.95 });
        b.rounded(cx, y + BED_TOP + 0.02, r.z0 + 0.25, w - 0.3, 0.06, 0.26, 0.05, '#F1ECE3', { shade: 0.9 });
        b.box(cx, y + BED_TOP, r.z0 + d * 0.64, w - 0.06, 0.05, d * 0.64, PALETTE.greyWool, 0, { shade: 0.95 });
        b.box(cx, y + 0.5, r.z0 + 0.02, w, 0.04, 0.04, PALETTE.iron, 0, FLAT);
        for (const px of [r.x0 + 0.04, r.x1 - 0.04]) b.box(px, y + 0.38, r.z0 + 0.02, 0.04, 0.3, 0.04, PALETTE.iron, 0, FLAT);
        break;
      }
      if (tier >= 4) {
        buildGrandBed(b, r, theme, tier);
        break;
      }
      b.slab(r, y, y + 0.24, wood, 0, 0, { shade: 0.75 });
      b.rounded(cx, y + 0.31, cz + 0.02, w - 0.06, BED_TOP - 0.24, d - 0.08, 0.06, PALETTE.mattress, { shade: 0.92 });
      const pillows = tier >= 2 ? [-1, 1] : [0];
      for (const side of pillows) b.rounded(cx + side * (w / 4 - 0.02), y + BED_TOP + 0.03, r.z0 + 0.27, tier >= 2 ? w / 2 - 0.1 : w - 0.3, 0.08, 0.26, 0.06, PALETTE.pillow, { shade: 0.9 });
      const cover = tier >= 3 ? theme.deep : theme.blanket;
      b.rounded(cx, y + BED_TOP - 0.005, r.z0 + d * 0.63, w - 0.02, 0.07, d * 0.68, 0.04, cover, { shade: 0.9 });
      b.box(cx, y + BED_TOP + 0.03, r.z0 + d * 0.3, w - 0.02, 0.012, 0.1, PALETTE.linen, 0, FLAT);
      if (tier >= 3) b.box(cx, y + BED_TOP + 0.031, r.z1 - 0.1, w - 0.02, 0.012, 0.05, PALETTE.gold, 0, FLAT);
      // Headboard: low and plain at tier 1, taller with a rounded rail from tier 2.
      const hb = tier >= 2 ? 0.62 : 0.4;
      b.box(cx, y + hb / 2 + 0.2, r.z0 + 0.04, w, hb, 0.08, wood, 0, { shade: 0.82 });
      if (tier >= 2) b.cylinder(cx, y + hb + 0.2, r.z0 + 0.04, 0.05, 0.05, w - 0.02, PALETTE.walnutDark, 10, 'x', FLAT);
      break;
    }
    case 'desk': {
      if (tier <= 0) {
        // A plain trestle table with a tin bell and a ledger.
        b.slab(r, y + 0.78, y + 0.84, '#A98D6F', 0, 0, FLAT);
        for (const pz of [r.z0 + 0.1, r.z1 - 0.1]) b.box(cx, y + 0.39, pz, w - 0.12, 0.78, 0.06, '#8E7560', 0, { shade: 0.8 });
        b.sphere(cx + 0.1, y + 0.87, r.z0 + 0.3, 0.06, PALETTE.iron, 1, 0.7);
        b.box(cx - 0.05, y + 0.86, cz + 0.2, 0.28, 0.03, 0.36, '#E9E0CF', 0, FLAT);
        break;
      }
      b.slab(r, y, y + 0.88, wood, 0, 0, { shade: 0.7 });
      b.box(r.x1 + 0.006, y + 0.46, cz, 0.012, 0.56, d - 0.24, tier >= 2 ? theme.wallLow : PALETTE.oakMid, 0, { shade: 0.9 });
      b.slab(r, y + 0.88, y + 0.92, PALETTE.walnutDark, 0, -0.03, FLAT);
      if (tier >= 2) b.slab(r, y + 0.921, y + 0.925, '#5F8A6E', 0, 0.06, FLAT);
      b.sphere(cx + 0.12, y + 0.95, r.z0 + 0.3, 0.065, PALETTE.brass, 1, 0.7);
      b.box(cx - 0.05, y + 0.94, cz + 0.22, 0.28, 0.03, 0.38, PALETTE.linen, 0, FLAT);
      if (tier >= 3) {
        b.cylinder(cx - 0.1, y + 1.02, r.z1 - 0.25, 0.015, 0.05, 0.14, PALETTE.brass, 8);
        lamps.cylinder(cx - 0.1, y + 1.1, r.z1 - 0.25, 0.06, 0.08, 0.07, '#6E9C80', 12, 'y', { shade: 0.9 });
      }
      break;
    }
    case 'urn': {
      if (tier <= 0) {
        // A dented kettle on a crate.
        b.box(cx, y + 0.3, cz, w * 0.8, 0.6, d * 0.8, '#A98D6F', 0, { pattern: PATTERN.stripesZ, color2: '#9C8264', scale: 0.12, shade: 0.8 });
        b.sphere(cx, y + 0.72, cz, 0.15, PALETTE.iron, 1, 0.85);
        b.cylinder(cx + 0.16, y + 0.75, cz, 0.02, 0.03, 0.14, PALETTE.iron, 6, 'x');
        break;
      }
      b.slab(r, y, y + 0.72, wood, 0, 0, { shade: 0.7 });
      b.cylinder(cx, y + 0.96, cz, 0.14, 0.18, 0.38, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 14, 'y', { shade: 0.82 });
      b.sphere(cx, y + 1.17, cz, 0.11, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 1, 0.8);
      b.cylinder(cx + 0.18, y + 0.77, cz + 0.12, 0.06, 0.06, 0.01, PALETTE.porcelain, 12);
      b.cylinder(cx + 0.18, y + 0.81, cz + 0.12, 0.04, 0.032, 0.07, PALETTE.porcelain, 12);
      break;
    }
    case 'linen': {
      if (tier <= 0) {
        b.box(cx, y + 0.3, cz, w, 0.6, d, '#A98D6F', 0, { pattern: PATTERN.stripesZ, color2: '#9C8264', scale: 0.14, shade: 0.8 });
        for (let i = 0; i < 3; i++) b.rounded(cx + (i - 1) * w * 0.3, y + 0.66, cz, w * 0.26, 0.1, d - 0.12, 0.03, i === 1 ? '#EFEAE0' : PALETTE.greyWool, { shade: 0.9 });
        break;
      }
      b.slab(r, y, y + 0.9, wood, 0, 0, { shade: 0.7 });
      const half = w / 2;
      for (let i = 0; i < 3; i++) {
        b.rounded(r.x0 + half * 0.5, y + 0.96 + i * 0.1, cz, half - 0.12, 0.09, d - 0.14, 0.03, theme.blanket, { shade: 0.88 });
        b.rounded(r.x0 + half * 1.5, y + 0.95 + i * 0.09, cz, half - 0.16, 0.08, d - 0.18, 0.04, PALETTE.pillow, { shade: 0.9 });
      }
      break;
    }
    case 'rack':
    case 'luggageRack': {
      const metal = tier >= 2 ? PALETTE.brass : PALETTE.iron;
      for (const level of [0.3, 0.72]) b.slab(r, y + level - 0.03, y + level, tier <= 0 ? '#A98D6F' : PALETTE.oak, 0, 0.02, FLAT);
      for (const px of [r.x0 + 0.05, r.x1 - 0.05]) for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(px, y + 0.42, pz, 0.045, 0.84, 0.045, metal, 0, { shade: 0.85 });
      break;
    }
    case 'bin':
      b.cylinder(cx, y + 0.26, cz, Math.min(w, d) * 0.44, Math.min(w, d) * 0.38, 0.52, tier <= 0 ? PALETTE.iron : theme.wallLow, 14, 'y', { shade: 0.75 });
      b.cylinder(cx, y + 0.53, cz, Math.min(w, d) * 0.46, Math.min(w, d) * 0.46, 0.03, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 14, 'y', FLAT);
      break;
    case 'plant': {
      // Pot and leaves stay inside the plant's own footprint, so nothing reaches into a wall.
      const half = Math.min(w, d) / 2;
      b.cylinder(cx, y + 0.2, cz, half * 0.72, half * 0.55, 0.4, PALETTE.coral, 12, 'y', { shade: 0.78 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(half * 0.55, 8, 6).scale(0.3, 0.08, 1), i % 2 ? PALETTE.treeGreen : PALETTE.cypress, cx + Math.sin(a) * half * 0.4, y + 0.62, cz + Math.cos(a) * half * 0.4, 0.5, a, 0, { shade: 0.85 });
      }
      break;
    }
    case 'bureau':
      buildBureau(b, lamps, r, tier);
      break;
    case 'washShelf': {
      // An open stand against the wall: side panels and three boards, the stock sits on the top two.
      const wood2 = tier <= 0 ? '#A99A86' : wood;
      const side = WASH_SHELF.side;
      for (const sx of [r.x0 + side / 2, r.x1 - side / 2]) b.box(sx, y + WASH_SHELF.height / 2, cz, side, WASH_SHELF.height, d, wood2, 0, { shade: 0.8 });
      const board = rect(r.x0 + side, r.z0, r.x1 - side, r.z1);
      for (const top of [0.07, WASH_SHELF.middle, WASH_SHELF.top]) b.slab(board, y + top - 0.03, y + top, wood2, 0, 0, FLAT);
      break;
    }
    case 'toilet':
      b.rounded(cx + 0.14, y + 0.6, cz, 0.16, 0.28, d * 0.72, 0.05, PALETTE.porcelain, { shade: 0.92 });
      b.cylinder(cx - 0.06, y + 0.2, cz, 0.2, 0.15, 0.4, PALETTE.porcelain, 16, 'y', { shade: 0.78 });
      b.cylinder(cx - 0.06, y + 0.41, cz, 0.21, 0.21, 0.03, tier <= 0 ? '#B9B4AC' : PALETTE.walnut, 16, 'y', FLAT);
      break;
    case 'sink':
      b.cylinder(cx, y + 0.34, cz, 0.07, 0.11, 0.68, PALETTE.porcelain, 12, 'y', { shade: 0.78 });
      b.rounded(cx - 0.02, y + 0.72, cz, w, 0.09, d * 0.85, 0.08, PALETTE.porcelain, { shade: 0.92 });
      b.rounded(cx - 0.02, y + 0.77, cz, w * 0.64, 0.02, d * 0.54, 0.06, '#B4DCEA', FLAT);
      b.object('fixture:tap');
      b.cylinder(r.x1 - 0.1, y + 0.82, cz, 0.016, 0.016, 0.08, tier >= 3 ? PALETTE.brass : PALETTE.chrome, 6);
      break;
    case 'bathtub': {
      b.rounded(cx, y + 0.28, cz, w, 0.4, d, 0.2, tier >= 1 ? theme.wallLow : PALETTE.porcelain, { shade: 0.8 });
      b.rounded(cx, y + 0.49, cz, w - 0.02, 0.03, d - 0.02, 0.19, PALETTE.porcelain, FLAT);
      b.rounded(cx, y + 0.51, cz, w - 0.14, 0.02, d - 0.14, 0.14, '#A9D6E8', FLAT);
      for (const fx of [r.x0 + 0.15, r.x1 - 0.15]) for (const fz of [r.z0 + 0.15, r.z1 - 0.15]) b.sphere(fx, y + 0.05, fz, 0.05, tier >= 3 ? PALETTE.brass : PALETTE.iron, 0);
      break;
    }
    case 'shelfTowel':
    case 'shelfRoll': {
      // A stepped stand, so the camera sees every towel and roll on it: low step by the aisle, high by the wall.
      const wallSide = prop.kind === 'shelfTowel' ? -1 : 1;
      const mid = cx;
      const low = wallSide < 0 ? rect(mid, r.z0, r.x1, r.z1) : rect(r.x0, r.z0, mid, r.z1);
      const high = wallSide < 0 ? rect(r.x0, r.z0, mid, r.z1) : rect(mid, r.z0, r.x1, r.z1);
      b.slab(low, y, y + SHELF_LOW, wood, 0, 0.02, { shade: 0.8 });
      b.slab(high, y, y + SHELF_HIGH, wood, 0, 0.02, { shade: 0.8 });
      // The oak tops sit a clear centimetre proud of the stand (a shared top face flickered).
      b.slab(low, y + SHELF_LOW - 0.03, y + SHELF_LOW + SHELF_TOP, PALETTE.oak, 0, 0.03, FLAT);
      b.slab(high, y + SHELF_HIGH - 0.03, y + SHELF_HIGH + SHELF_TOP, PALETTE.oak, 0, 0.03, FLAT);
      for (const pz of [r.z0 + 0.03, r.z1 - 0.03]) b.box(cx, y + SHELF_HIGH / 2 + 0.05, pz, w, SHELF_HIGH + 0.1, 0.05, wood, 0, { shade: 0.85 });
      break;
    }
    case 'crateBay':
      b.box(cx, y + 0.25, r.z0 + 0.5, w * 0.7, 0.5, 0.7, PALETTE.oak, 0, { shade: 0.82 });
      b.box(cx, y + 0.72, r.z0 + 0.5, w * 0.6, 0.44, 0.6, '#D8BD95', 0, { shade: 0.82 });
      b.box(cx, y + 0.25, r.z1 - 0.6, w * 0.7, 0.5, 0.7, PALETTE.oak, 0, { shade: 0.82 });
      break;
    case 'bench':
      b.slab(r, y + 0.1, y + 0.36, wood, 0, 0.05, { shade: 0.75 });
      if (tier >= 2) b.rounded(cx, y + 0.4, cz, w - 0.1, 0.08, d - 0.16, 0.04, theme.deep, { shade: 0.9 });
      b.box(r.x0 + 0.1, y + 0.62, cz, 0.08, 0.44, d - 0.1, wood, 0, { shade: 0.85 });
      break;
    case 'lamp':
      b.cylinder(cx, y + 0.8, cz, 0.03, 0.05, 1.6, PALETTE.brass, 6);
      lamps.cylinder(cx, y + 1.6, cz, 0.12, 0.2, 0.22, PALETTE.lampShade, 12);
      break;
    case 'closet': {
      // The washroom car's own linen closet: a stepped stand stacked with towels (front half) and loo rolls
      // (back half), open to the camera, so the car works from day one without the stores.
      const wallX = prop.facing === 'right' ? r.x0 : r.x1;
      const out = prop.facing === 'right' ? 1 : -1;
      const mid = wallX + out * (w / 2);
      const low = out > 0 ? rect(mid, r.z0, r.x1, r.z1) : rect(r.x0, r.z0, mid, r.z1);
      const high = out > 0 ? rect(r.x0, r.z0, mid, r.z1) : rect(mid, r.z0, r.x1, r.z1);
      const body = tier <= 0 ? '#9C8570' : wood;
      b.slab(low, y, y + SHELF_LOW, body, 0, 0.02, { shade: 0.8 });
      b.slab(high, y, y + SHELF_HIGH, body, 0, 0.02, { shade: 0.8 });
      b.slab(low, y + SHELF_LOW - 0.03, y + SHELF_LOW + SHELF_TOP, PALETTE.oak, 0, 0.03, FLAT);
      b.slab(high, y + SHELF_HIGH - 0.03, y + SHELF_HIGH + SHELF_TOP, PALETTE.oak, 0, 0.03, FLAT);
      const towel = tier <= 0 ? '#D8CFC2' : PALETTE.towel;
      const split = r.z0 + d * 0.5;
      for (const [step, top] of [[low, SHELF_LOW], [high, SHELF_HIGH]] as [Rect, number][]) {
        const sx = (step.x0 + step.x1) / 2;
        for (let z = r.z0 + 0.22; z < split - 0.1; z += 0.26) b.rounded(sx, y + top + SHELF_TOP + 0.05, z, step.x1 - step.x0 - 0.12, 0.09, 0.2, 0.03, towel, { shade: 0.9 });
        for (let z = split + 0.18; z < r.z1 - 0.12; z += 0.22) b.cylinder(sx, y + top + SHELF_TOP + 0.07, z, 0.075, 0.075, 0.13, PALETTE.rollPaper, 10, 'y', { shade: 0.92 });
      }
      for (const pz of [r.z0 + 0.03, split, r.z1 - 0.03]) b.box(cx, y + SHELF_HIGH / 2 + 0.05, pz, w, SHELF_HIGH + 0.1, 0.05, body, 0, { shade: 0.85 });
      break;
    }
    case 'laundry': {
      // Top-loading washing machines against the wall (their drums spin: see CarriageView.spinners).
      const count = Math.max(1, Math.floor(d / 0.78));
      const size = Math.min(w - 0.06, 0.62);
      const shellColour = tier <= 0 ? '#D9D2C2' : tier >= 3 ? '#F4EEE2' : '#EDEAE4';
      for (let i = 0; i < count; i++) {
        const mz = r.z0 + (d / count) * (i + 0.5);
        const mx = r.x1 - size / 2 - 0.03;
        b.rounded(mx, y + 0.42, mz, size, 0.84, size, 0.06, shellColour, { shade: 0.8 });
        b.cylinder(mx, y + 0.845, mz, size * 0.36, size * 0.36, 0.012, tier <= 0 ? '#8E969C' : PALETTE.chrome, 20, 'y', FLAT);
        b.box(mx, y + 0.86, mz - size / 2 + 0.045, size - 0.1, 0.02, 0.05, tier >= 2 ? PALETTE.brass : '#7F8A92', 0, FLAT);
      }
      // A basket of towels waiting to go in.
      if (w > 0.7) b.rounded(r.x0 + 0.22, y + 0.16, r.z1 - 0.25, 0.34, 0.32, 0.34, 0.08, tier <= 0 ? '#B79B73' : '#C9A77A', { shade: 0.8 });
      break;
    }
    case 'table': {
      b.cylinder(cx, y + 0.34, cz, 0.04, 0.12, 0.68, tier <= 0 ? PALETTE.iron : PALETTE.walnut, 10);
      b.cylinder(cx, y + 0.7, cz, Math.min(w, d) / 2, Math.min(w, d) / 2, 0.04, tier <= 0 ? '#A98D6F' : PALETTE.oak, 20, 'y', FLAT);
      b.sphere(cx - 0.06, y + 0.8, cz - 0.08, 0.09, tier >= 2 ? PALETTE.brass : PALETTE.porcelain, 1, 0.85);
      for (const [dx, dz] of [[0.14, 0.12], [-0.12, 0.16]]) b.cylinder(cx + dx, y + 0.76, cz + dz, 0.04, 0.032, 0.07, PALETTE.porcelain, 10);
      break;
    }
    case 'sofa': {
      const cushion = tier <= 0 ? '#8E8577' : theme.deep;
      b.slab(r, y + 0.08, y + 0.3, tier <= 0 ? '#7B6A58' : wood, 0, 0.02, { shade: 0.75 });
      b.rounded(cx + (prop.facing === 'right' ? 0.05 : -0.05), y + 0.36, cz, w - 0.16, 0.12, d - 0.2, 0.05, cushion, { shade: 0.9 });
      const backX = prop.facing === 'right' ? r.x0 + 0.09 : r.x1 - 0.09;
      b.rounded(backX, y + 0.58, cz, 0.16, 0.5, d - 0.04, 0.06, cushion, { shade: 0.85 });
      for (const az of [r.z0 + 0.08, r.z1 - 0.08]) b.rounded(cx, y + 0.44, az, w - 0.08, 0.3, 0.14, 0.05, cushion, { shade: 0.85 });
      if (tier >= 2) for (const pz of [cz - d * 0.22, cz + d * 0.22]) b.rounded(cx + (prop.facing === 'right' ? 0.05 : -0.05), y + 0.48, pz, 0.12, 0.18, 0.3, 0.05, PALETTE.pillow, { shade: 0.9 });
      break;
    }
  }
}


/**
 * First Class and the Royal Suite beds. First: a tall buttoned velvet headboard, a red velvet throw with a gold
 * edge, plump pillows and a bolster. Royal: the same bed as a four-poster, turned walnut posts with gold finials
 * and a burgundy valance round the top (open above, so the sleeper stays in view).
 */
function buildGrandBed(b: GeoBuilder, r: Rect, theme: CarriageTheme, tier: number): void {
  const y = FLOOR_Y;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const frame = tier >= 5 ? '#4A2A22' : PALETTE.walnutDark;
  b.slab(r, y, y + 0.24, frame, 0, 0, { shade: 0.75, surface: 'varnish' });
  b.slab(rect(r.x0 + 0.01, r.z0 + 0.01, r.x1 - 0.01, r.z1 - 0.01), y + 0.2, y + 0.23, PALETTE.gold, 0, 0.0, { shade: 1, surface: 'brass' });
  b.rounded(cx, y + 0.31, cz + 0.02, w - 0.06, BED_TOP - 0.24, d - 0.08, 0.06, PALETTE.mattress, { shade: 0.92, surface: 'fabric' });
  for (const side of [-1, 1]) b.rounded(cx + side * (w / 4 - 0.02), y + BED_TOP + 0.035, r.z0 + 0.27, w / 2 - 0.1, 0.1, 0.26, 0.07, PALETTE.pillow, { shade: 0.9, surface: 'fabric' });
  b.cylinder(cx, y + BED_TOP + 0.05, r.z0 + 0.46, 0.055, 0.055, w - 0.24, theme.deep, 12, 'x', { shade: 0.9, surface: 'velvet' });
  b.rounded(cx, y + BED_TOP - 0.005, r.z0 + d * 0.63, w - 0.02, 0.07, d * 0.68, 0.04, theme.blanket, { shade: 0.9, surface: 'velvet' });
  b.box(cx, y + BED_TOP + 0.03, r.z0 + d * 0.3, w - 0.02, 0.012, 0.1, PALETTE.linen, 0, FLAT);
  b.box(cx, y + BED_TOP + 0.031, r.z1 - 0.1, w - 0.02, 0.012, 0.05, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
  // Headboard: buttoned velvet in a gilt frame.
  b.box(cx, y + 0.55, r.z0 + 0.04, w, 0.7, 0.08, frame, 0, { shade: 0.82, surface: 'varnish' });
  b.rounded(cx, y + 0.6, r.z0 + 0.095, w - 0.14, 0.5, 0.03, 0.08, theme.deep, { shade: 0.9, surface: 'velvet' });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.sphere(cx - 0.25 + i * 0.25, y + 0.5 + j * 0.2, r.z0 + 0.114, 0.015, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
  b.cylinder(cx, y + 0.92, r.z0 + 0.04, 0.035, 0.035, w - 0.02, PALETTE.gold, 10, 'x', { shade: 1, surface: 'brass' });
  if (tier < 5) return;
  // The four-poster.
  const top = y + 1.38;
  const posts: [number, number][] = [[r.x0 + 0.04, r.z0 + 0.04], [r.x1 - 0.04, r.z0 + 0.04], [r.x0 + 0.04, r.z1 - 0.04], [r.x1 - 0.04, r.z1 - 0.04]];
  for (const [px, pz] of posts) {
    b.cylinder(px, (y + 0.24 + top) / 2, pz, 0.028, 0.034, top - y - 0.24, frame, 8, 'y', { shade: 0.85, surface: 'varnish' });
    b.sphere(px, top + 0.05, pz, 0.045, PALETTE.gold, 1, 1.2, { shade: 1, surface: 'brass' });
  }
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const along = Math.abs(z1 - z0) > Math.abs(x1 - x0);
    b.box((x0 + x1) / 2, top - 0.02, (z0 + z1) / 2, along ? 0.04 : Math.abs(x1 - x0) - 0.06, 0.04, along ? Math.abs(z1 - z0) - 0.06 : 0.04, frame, 0, { shade: 1, surface: 'varnish' });
    // The valance hangs just inside the rail: burgundy with a gold fringe.
    const inset = 0.025;
    if (along) {
      const vx = x0 + (x0 < cx ? inset : -inset);
      b.box(vx, top - 0.13, (z0 + z1) / 2, 0.012, 0.18, Math.abs(z1 - z0) - 0.1, theme.deep, 0, { shade: 0.9, surface: 'velvet' });
      b.box(vx, top - 0.225, (z0 + z1) / 2, 0.014, 0.018, Math.abs(z1 - z0) - 0.1, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
    } else {
      const vz = z0 + (z0 < cz ? inset : -inset);
      b.box((x0 + x1) / 2, top - 0.13, vz, Math.abs(x1 - x0) - 0.1, 0.18, 0.012, theme.deep, 0, { shade: 0.9, surface: 'velvet' });
      b.box((x0 + x1) / 2, top - 0.225, vz, Math.abs(x1 - x0) - 0.1, 0.018, 0.014, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
    }
  };
  rail(r.x0 + 0.04, r.z0 + 0.04, r.x0 + 0.04, r.z1 - 0.04);
  rail(r.x1 - 0.04, r.z0 + 0.04, r.x1 - 0.04, r.z1 - 0.04);
  rail(r.x0 + 0.04, r.z1 - 0.04, r.x1 - 0.04, r.z1 - 0.04);
}

/** The lobby's back corner, class by class: crates, a cupboard, a bookcase, a bureau, a piano, a gilded piano. */
function buildBureau(b: GeoBuilder, lamps: GeoBuilder, r: Rect, tier: number): void {
  const y = FLOOR_Y;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const face = r.x1;
  if (tier <= 0) {
    // Crates and a battered trunk, waiting to be unpacked.
    b.box(cx, y + 0.22, r.z0 + 0.3, w - 0.02, 0.44, 0.5, '#A98D6F', 0, { pattern: PATTERN.stripesZ, color2: '#9C8264', scale: 0.12, shade: 0.8, surface: 'wood' });
    b.box(cx, y + 0.18, r.z1 - 0.35, w - 0.04, 0.36, 0.6, '#7C5A45', 0, { shade: 0.8, surface: 'leather' });
    b.box(cx, y + 0.37, r.z1 - 0.35, w - 0.02, 0.03, 0.62, PALETTE.iron, 0, FLAT);
    return;
  }
  if (tier === 1) {
    b.box(cx, y + 0.5, cz, w, 1.0, d - 0.1, PALETTE.oakMid, 0, { shade: 0.8, surface: 'wood' });
    b.box(face + 0.006, y + 0.5, cz, 0.012, 0.9, 0.01, '#A08868', 0, FLAT);
    for (const dz of [-0.12, 0.12]) b.sphere(face + 0.02, y + 0.55, cz + dz, 0.02, PALETTE.iron, 0);
    return;
  }
  if (tier === 2) {
    // A bookcase, full of colour.
    b.box(cx, y + 0.55, cz, w, 1.1, d - 0.1, PALETTE.walnut, 0, { shade: 0.8, surface: 'varnish' });
    const spines = ['#C0485C', '#5E7FA0', '#E5B452', '#6E9C86', '#8E6A8C', '#E08A6E'];
    for (let shelf = 0; shelf < 3; shelf++) {
      let z = r.z0 + 0.12;
      let k = shelf * 2;
      while (z < r.z1 - 0.16) {
        const bw = 0.05 + ((k * 7) % 4) * 0.012;
        b.box(face - 0.03, y + 0.22 + shelf * 0.32, z + bw / 2, 0.04, 0.24, bw, spines[k % spines.length], 0, FLAT);
        z += bw + 0.008;
        k++;
      }
    }
    return;
  }
  if (tier === 3) {
    // A bureau with drawers and a green-shaded banker's lamp.
    b.box(cx, y + 0.4, cz, w, 0.8, d - 0.1, PALETTE.walnut, 0, { shade: 0.8, surface: 'varnish' });
    for (let i = 0; i < 3; i++) {
      b.box(face + 0.006, y + 0.16 + i * 0.22, cz, 0.012, 0.18, d - 0.3, PALETTE.walnutDark, 0, FLAT);
      b.sphere(face + 0.02, y + 0.16 + i * 0.22, cz, 0.018, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
    }
    b.box(cx, y + 0.815, cz, w + 0.02, 0.03, d - 0.08, '#3E5F4E', 0, { shade: 1, surface: 'leather' });
    b.cylinder(cx, y + 0.9, r.z0 + 0.3, 0.014, 0.05, 0.14, PALETTE.brass, 8, 'y', { surface: 'brass' });
    lamps.cylinder(cx, y + 1.0, r.z0 + 0.3, 0.07, 0.1, 0.06, '#3F8A5E', 12, 'y', { shade: 0.9 });
    return;
  }
  // An upright piano: black lacquer (ivory and gold in the Royal Suite), keys toward the room.
  const body = tier >= 5 ? '#F2EDE4' : '#1C1A20';
  const trim = PALETTE.gold;
  b.box(cx, y + 0.62, cz, w, 1.24, d - 0.1, body, 0, { shade: 0.85, surface: 'varnish' });
  // The keyboard stands only 10 cm proud of the case: the path from the desk to the cabins runs past it.
  b.box(face + 0.05, y + 0.72, cz, 0.1, 0.06, d - 0.14, body, 0, { shade: 1, surface: 'varnish' });
  b.box(face + 0.07, y + 0.755, cz, 0.06, 0.012, d - 0.2, '#F7F4EC', 0, FLAT);
  for (let i = 0; i < 7; i++) b.box(face + 0.06, y + 0.768, r.z0 + 0.2 + i * ((d - 0.4) / 6), 0.04, 0.012, 0.03, '#1A1A1A', 0, FLAT);
  b.box(face + 0.006, y + 1.1, cz, 0.012, 0.03, d - 0.12, trim, 0, { shade: 1, surface: 'brass' });
  b.box(face + 0.006, y + 0.35, cz, 0.012, 0.03, d - 0.12, trim, 0, { shade: 1, surface: 'brass' });
  // Music stand, and candles (a candelabra in the Royal Suite).
  b.box(face - 0.03, y + 0.95, cz, 0.02, 0.2, 0.36, '#F4EEDC', 0, FLAT);
  const candles = tier >= 5 ? [-0.3, -0.15, 0.15, 0.3] : [-0.3, 0.3];
  for (const dz of candles) {
    b.cylinder(cx, y + 1.3, cz + dz, 0.02, 0.03, 0.08, trim, 8, 'y', { surface: 'brass' });
    lamps.cylinder(cx, y + 1.39, cz + dz, 0.014, 0.014, 0.1, '#FFF1D0', 8);
  }
}

/**
 * What a cabin's class adds, placed where it can never touch the cleaning pad, the mess or the tip pile: the
 * light hanging over the walk-in (a bare bulb, a fabric shade, brass, a glass globe, a chandelier), a writing
 * desk on the corridor wall past the door (Business and up), and at the foot of the bed a stool (Basic), a
 * minibar (Business), a velvet ottoman and champagne on ice (First) or a slipper bath (Royal).
 */
function buildClassDressing(b: GeoBuilder, lamps: GeoBuilder, cabin: CabinLayout, tier: number, theme: CarriageTheme): void {
  const y = FLOOR_Y;
  const room = cabin.room;
  const bed = cabin.bed;
  const heart = cabin.center;
  // Hanging light, just toward the corridor side of the walk-in, high above everyone's heads.
  const hx = PARTITION_X1 + 0.42;
  const hz = heart.z;
  const hang = y + 1.5;
  b.object('class:pendant');
  lamps.object('class:pendant~glow');
  b.cylinder(hx, (hang + y + 2.1) / 2, hz, 0.006, 0.006, y + 2.1 - hang, PALETTE.ink, 4);
  if (tier <= 1) lamps.sphere(hx, hang - 0.05, hz, 0.05, PALETTE.lampShade, 1);
  else if (tier === 2) {
    b.cone(hx, hang - 0.06, hz, 0.15, 0.13, theme.curtain, 12, { shade: 0.9, surface: 'fabric' });
    lamps.sphere(hx, hang - 0.12, hz, 0.045, PALETTE.lampShade, 1);
  } else if (tier <= 4) {
    b.cylinder(hx, hang, hz, 0.03, 0.05, 0.05, PALETTE.brass, 10, 'y', { surface: 'brass' });
    lamps.sphere(hx, hang - 0.1, hz, tier >= 4 ? 0.1 : 0.08, tier >= 4 ? '#FFF4D8' : PALETTE.lampShade, 1);
  } else {
    // The chandelier: a gilt ring of candle bulbs round crystal drops.
    b.cylinder(hx, hang, hz, 0.16, 0.16, 0.025, PALETTE.gold, 18, 'y', { surface: 'brass' });
    b.cylinder(hx, hang + 0.08, hz, 0.02, 0.05, 0.16, PALETTE.gold, 8, 'y', { surface: 'brass' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lamps.cylinder(hx + Math.cos(a) * 0.16, hang + 0.05, hz + Math.sin(a) * 0.16, 0.012, 0.012, 0.07, '#FFF1D0', 6);
      b.sphere(hx + Math.cos(a + 0.5) * 0.09, hang - 0.07, hz + Math.sin(a + 0.5) * 0.09, 0.022, '#E8F2FF', 1, 1.6, { shade: 1, surface: 'crystal' });
    }
    lamps.sphere(hx, hang - 0.12, hz, 0.04, '#FFF4D8', 1);
  }
  b.endObject();
  lamps.endObject();

  // Business and up: a writing desk on the corridor wall, past the door, with a reading lamp.
  if (tier >= 3) {
    const z0 = cabin.door[1] + 0.06;
    const z1 = room.z1 - 0.05;
    if (z1 - z0 > 0.3) {
      const x0 = PARTITION_X1 + 0.005;
      const x1 = x0 + 0.26;
      const zc = (z0 + z1) / 2;
      b.object('class:desk');
      lamps.object('class:desk~glow');
      b.box((x0 + x1) / 2, y + 0.7, zc, x1 - x0, 0.04, z1 - z0, tier >= 4 ? PALETTE.walnutDark : PALETTE.walnut, 0, { shade: 1, surface: 'varnish' });
      b.box(x0 + 0.02, y + 0.6, zc, 0.03, 0.16, z1 - z0 - 0.1, tier >= 4 ? PALETTE.gold : PALETTE.walnutDark, 0, { shade: 0.9, surface: tier >= 4 ? 'brass' : 'varnish' });
      b.box((x0 + x1) / 2 + 0.02, y + 0.726, zc - 0.05, 0.14, 0.012, 0.18, '#F1EAD8', 0, FLAT);
      b.cylinder(x0 + 0.1, y + 0.78, z1 - 0.1, 0.012, 0.035, 0.12, PALETTE.brass, 8, 'y', { surface: 'brass' });
      lamps.cylinder(x0 + 0.1, y + 0.87, z1 - 0.1, 0.045, 0.07, 0.06, tier >= 4 ? '#F6E6BD' : '#3F8A5E', 12, 'y', { shade: 0.9 });
      b.endObject();
      lamps.endObject();
    }
  }

  // At the foot of the bed.
  const fz0 = bed.z1 + 0.05;
  const fz1 = room.z1 - 0.04;
  if (fz1 - fz0 < 0.3) return;
  const fzc = (fz0 + fz1) / 2;
  const fd = fz1 - fz0;
  if (tier <= 1) {
    b.object('class:stool');
    const sx = bed.x0 + 0.35;
    b.cylinder(sx, y + 0.4, fzc, 0.16, 0.16, 0.04, tier <= 0 ? '#9C8570' : PALETTE.oakMid, 12, 'y', { surface: 'wood' });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.cylinder(sx + Math.cos(a) * 0.1, y + 0.2, fzc + Math.sin(a) * 0.1, 0.015, 0.015, 0.4, tier <= 0 ? '#8E7560' : PALETTE.walnut, 6, 'y', { surface: 'wood' });
    }
    b.endObject();
    return;
  }
  if (tier === 3) {
    // A minibar: a little walnut fridge with a bottle and glasses on top.
    const mx0 = bed.x0 + 0.12;
    const mx1 = mx0 + 0.44;
    b.object('class:minibar');
    b.box((mx0 + mx1) / 2, y + 0.25, fzc, mx1 - mx0, 0.5, Math.min(fd, 0.42), PALETTE.walnut, 0, { shade: 0.8, surface: 'varnish' });
    b.box((mx0 + mx1) / 2, y + 0.25, fzc - Math.min(fd, 0.42) / 2 - 0.006, mx1 - mx0 - 0.08, 0.36, 0.012, '#B8C4CF', 0, { shade: 1, surface: 'steel' });
    b.cylinder(mx0 + 0.12, y + 0.6, fzc, 0.035, 0.035, 0.2, '#3E5F4E', 10, 'y', { surface: 'glass' });
    for (const dx of [0.24, 0.32]) b.cylinder(mx0 + dx, y + 0.54, fzc, 0.02, 0.018, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
    b.endObject();
    return;
  }
  if (tier === 4) {
    // A velvet ottoman and champagne on ice.
    b.object('class:ottoman');
    b.rounded(bed.x0 + 0.38, y + 0.2, fzc, 0.52, 0.4, Math.min(fd, 0.36), 0.08, theme.blanket, { shade: 0.85, surface: 'velvet' });
    for (const dx of [-0.2, 0.2]) b.sphere(bed.x0 + 0.38 + dx, y + 0.03, fzc, 0.03, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
    b.object('class:champagne');
    const bx = bed.x1 - 0.2;
    b.cylinder(bx, y + 0.3, fzc, 0.04, 0.06, 0.6, PALETTE.gold, 10, 'y', { surface: 'brass' });
    b.cylinder(bx, y + 0.66, fzc, 0.11, 0.09, 0.16, PALETTE.chrome, 14, 'y', { shade: 0.9, surface: 'steel' });
    b.cylinder(bx, y + 0.78, fzc + 0.01, 0.04, 0.04, 0.2, '#1F4A34', 10, 'y', { surface: 'glass' });
    b.cylinder(bx, y + 0.9, fzc + 0.01, 0.018, 0.026, 0.05, PALETTE.gold, 8, 'y', { surface: 'brass' });
    b.endObject();
    return;
  }
  // The Royal Suite's private bath: a slipper tub on gold claw feet, a gold tap and a folded towel.
  b.object('class:bath');
  const tx0 = bed.x0 + 0.06;
  const tx1 = bed.x1 - 0.06;
  const tcx = (tx0 + tx1) / 2;
  const td = Math.min(fd, 0.46);
  b.rounded(tcx, y + 0.3, fzc, tx1 - tx0, 0.4, td, 0.2, '#F7F4EE', { shade: 0.85, surface: 'ceramic' });
  b.rounded(tcx, y + 0.505, fzc, tx1 - tx0 - 0.02, 0.03, td - 0.02, 0.19, PALETTE.gold, { shade: 1, surface: 'brass' });
  b.rounded(tcx, y + 0.51, fzc, tx1 - tx0 - 0.14, 0.02, td - 0.14, 0.14, '#BFE0EC', { shade: 1, surface: 'glass' });
  for (const fx of [tx0 + 0.12, tx1 - 0.12]) for (const dz of [-td / 2 + 0.1, td / 2 - 0.1]) b.sphere(fx, y + 0.05, fzc + dz, 0.045, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
  b.cylinder(tx1 - 0.08, y + 0.62, fzc, 0.016, 0.016, 0.2, PALETTE.gold, 6, 'y', { surface: 'brass' });
  b.box(tx0 + 0.18, y + 0.53, fzc, 0.24, 0.05, 0.16, theme.blanket, 0, { shade: 0.95, surface: 'fabric' });
  b.endObject();
}
