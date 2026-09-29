import * as THREE from 'three';
import { rect, type CarriageType, type Rect } from '../core/types';
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
  type CarriageLayout,
  type PropDef,
  type WallBox,
} from './layout';
import { MATERIALS, PATTERN } from './materials';
import { CARRIAGE_THEMES, PALETTE, type CarriageTheme } from './palette';
import { getDirtTexture } from './sprites';

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
/** Trims and rails stop this short of a wall's ends, so their end faces never share a plane with it. */
const END_INSET = 0.006;
/** A rect shortened at both ends of its long axis. */
const shortenEnds = (r: Rect, by: number): Rect => (r.z1 - r.z0 >= r.x1 - r.x0 ? rect(r.x0, r.z0 + by, r.x1, r.z1 - by) : rect(r.x0 + by, r.z0, r.x1 - by, r.z1));
/** Supply stand steps: stock sits on these. */
const SHELF_LOW = 0.3;
const SHELF_HIGH = 0.62;
const SHELF_TOP = 0.012;
/** Room door leaves: height, and each leaf's offset from the partition centre (they pass inside it). */
const LEAF_HEIGHT = 0.66;
const LEAF_GAP = 0.04;

/** How a carriage looks at a refurbishment tier: the whole rags-to-riches story in one table. */
interface Finish {
  wall: string;
  wallLow: string;
  /** Lower wall is wood panelling rather than paint (tier 3). */
  panelled: boolean;
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
  if (tier <= 0) {
    return {
      wall: PALETTE.wallWorn, wallLow: PALETTE.wallWornLow, panelled: false, cap: '#9DAFA3',
      floor: PALETTE.plankWorn, floorSeam: PALETTE.plankWornSeam, floorPattern: PATTERN.planks, floorScale: 0.34,
      room: PALETTE.plankWorn, roomSeam: PALETTE.plankWornSeam, roomPattern: PATTERN.planks, roomScale: 0.34,
      runner: null, curtains: false, lamps: 0, decor: false,
    };
  }
  const oakRoom = tiled ? { room: '#F4F1EA', roomSeam: '#E6EAE4', roomPattern: PATTERN.checker, roomScale: 0.3 } : { room: PALETTE.oak, roomSeam: PALETTE.oakMid, roomPattern: PATTERN.planks, roomScale: 0.3 };
  const carpetRoom = tiled ? oakRoom : { room: t.carpet, roomSeam: t.carpet, roomPattern: PATTERN.none, roomScale: 1 };
  const base = {
    wall: t.wall, wallLow: t.wallLow, panelled: tier >= 3, cap: PALETTE.walnut,
    floor: PALETTE.oak, floorSeam: PALETTE.oakMid, floorPattern: PATTERN.planks, floorScale: 0.3,
  };
  if (tier === 1) return { ...base, ...oakRoom, runner: null, curtains: false, lamps: 1, decor: false };
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
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A row of stock (towels, rolls, suitcases) as instanced meshes: one draw per look however much is on the
 * shelf. Slots fill in order; slot i uses geometry i % looks.
 */
class StockRack {
  private readonly meshes: THREE.InstancedMesh[];
  private shown = -1;

  constructor(parent: THREE.Group, geometries: THREE.BufferGeometry[], slots: Slot[], castShadow = false) {
    const looks = geometries.length;
    this.meshes = geometries.map((geometry, k) => {
      const capacity = Math.max(1, Math.ceil((slots.length - k) / looks));
      const mesh = new THREE.InstancedMesh(geometry, MATERIALS.solid, capacity);
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

/** A doorway's sliding door: two leaves that telescope into the wall beside it. */
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
  private readonly cabinLocks: THREE.Mesh[] = [];
  private readonly bathroomLocks: THREE.Mesh[] = [];
  private readonly dirt: THREE.Mesh[][] = [];
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

  constructor(readonly layout: CarriageLayout, readonly index: number, readonly tier = 0) {
    this.theme = CARRIAGE_THEMES[layout.type];
    this.finish = finishFor(layout.type, tier, this.theme);
    this.blanketColor = tier <= 0 ? PALETTE.greyWool : tier >= 3 ? this.theme.deep : this.theme.blanket;
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
    const door = this.roomDoors.find((d) => d.kind === 'cabin' && d.index === cabin);
    if (door) door.locked = locked;
  }

  setBathroomLocked(bathroom: number, locked: boolean): void {
    const lock = this.bathroomLocks[bathroom];
    const fixtures = this.bathroomFixtures[bathroom];
    if (lock) lock.visible = locked;
    if (fixtures) fixtures.visible = !locked;
    const door = this.roomDoors.find((d) => d.kind === 'bath' && d.index === bathroom);
    if (door) door.locked = locked;
  }

  setDirt(cabin: number, spots: boolean[]): void {
    const meshes = this.dirt[cabin];
    if (!meshes) return;
    for (let i = 0; i < meshes.length; i++) meshes[i].visible = !!spots[i];
  }

  /** Scrubbing: the mark fades and shrinks with cleaning progress (0..1). */
  setDirtFade(cabin: number, spot: number, progress: number): void {
    const mesh = this.dirt[cabin]?.[spot];
    if (!mesh) return;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - 0.85 * progress;
    mesh.scale.setScalar(1 - 0.35 * progress);
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

  /** Slides a room door: the front leaf travels a full width, the back leaf half, both into the wall. */
  setRoomDoor(door: RoomDoor, amount: number): void {
    if (amount === door.open || !this.leafMesh) return;
    door.open = amount;
    for (let k = 0; k < 2; k++) {
      tmpMatrix.makeTranslation(door.x + (k === 0 ? -LEAF_GAP : LEAF_GAP), FLOOR_Y + LEAF_HEIGHT / 2, door.closedZ[k] + amount * door.width * (k === 0 ? 1 : 0.5));
      this.leafMesh.setMatrixAt(door.instance + k, tmpMatrix);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
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

    // Chassis: a skirt in the livery with a trim line, dark bogies below.
    liv.box(0, 0.46, L / 2, HALF_WIDTH * 2 - 0.06, 0.16, L - 0.12, '#FFFFFF', 0, { shade: 0.8 });
    trim.box(0, 0.525, L / 2, HALF_WIDTH * 2 - 0.02, 0.025, L - 0.1, '#FFFFFF', 0, FLAT);
    s.box(0, 0.28, L / 2, HALF_WIDTH * 2 - 0.6, 0.2, L - 0.8, PALETTE.undercarriage);
    for (const z of [2.3, L - 2.3]) {
      s.box(0, 0.2, z, 2.4, 0.18, 2.2, PALETTE.wheel);
      for (const x of [-1.28, 1.28]) for (const dz of [-0.6, 0.6]) s.cylinder(x, 0.24, z + dz, 0.25, 0.25, 0.13, PALETTE.wheel, 12, 'x');
    }
    for (const z of [0.02, L - 0.02]) for (const x of [-1.3, 1.3]) s.cylinder(x, 0.42, z, 0.11, 0.11, 0.25, PALETTE.chrome, 10, 'z');

    // Floor: one quiet base everywhere; rooms and the runner are the only overlays, and none overlap.
    f.box(0, FLOOR_Y - 0.03, L / 2, HALF_WIDTH * 2 - 0.04, 0.06, L - 0.04, fin.floor, 0, { pattern: fin.floorPattern, color2: fin.floorSeam, scale: fin.floorScale, shade: 1 });
    for (const cabin of this.layout.cabins) f.slab(cabin.room, FLOOR_Y, FLOOR_Y + LIFT, fin.room, 0, 0, { pattern: fin.roomPattern, color2: fin.roomSeam, scale: fin.roomScale, shade: 1 });
    for (const bath of this.layout.bathrooms) f.slab(bath.room, FLOOR_Y, FLOOR_Y + LIFT, fin.room, 0, 0, { pattern: fin.roomPattern, color2: fin.roomSeam, scale: fin.roomScale, shade: 1 });
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
      if (prop.kind === 'bed' || prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') continue;
      if (prop.kind === 'plant' && this.tier < 2) continue;
      buildProp(s, lamps, prop, this.theme, this.tier);
    }
    this.buildDecor(s, f, lamps);
    this.buildDoorFrames(s);

    const add = (builder: GeoBuilder, material: THREE.Material, cast: boolean, receive: boolean): void => {
      if (builder.isEmpty) return;
      const mesh = new THREE.Mesh(builder.build(), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      this.group.add(mesh);
    };
    add(s, MATERIALS.solid, true, true);
    add(liv, MATERIALS.livery, true, true);
    add(trim, MATERIALS.liveryTrim, false, true);
    add(f, MATERIALS.floor, false, true);
    add(glass, MATERIALS.windows, false, false);
    add(lamps, MATERIALS.lamps, false, false);
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
    if (low > y0) s.slab(r, y0, low, fin.panelled ? PALETTE.walnut : fin.wallLow, 0, 0, { shade: 0.82 });
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
      s.box(x, FLOOR_Y + y, frontWallZ, w, hgt, 0.02, PALETTE.gold, 0, FLAT);
      s.box(x, FLOOR_Y + y, frontWallZ + 0.011, w - 0.06, hgt - 0.06, 0.004, canvas, 0, FLAT);
    };

    if (type === 'lobby' && this.tier >= 1) {
      // A clock above the counter, and (once cosy) the pigeon-hole key rack behind the desk.
      s.cylinder(1.2, FLOOR_Y + 0.74, frontWallZ + 0.01, 0.16, 0.16, 0.03, this.tier >= 3 ? PALETTE.gold : PALETTE.walnut, 18, 'z', FLAT);
      s.cylinder(1.2, FLOOR_Y + 0.74, frontWallZ + 0.026, 0.13, 0.13, 0.01, PALETTE.linen, 18, 'z', FLAT);
      s.box(1.2, FLOOR_Y + 0.78, frontWallZ + 0.034, 0.012, 0.08, 0.004, PALETTE.ink, 0, FLAT);
      s.box(1.235, FLOOR_Y + 0.74, frontWallZ + 0.034, 0.07, 0.012, 0.004, PALETTE.ink, 0, FLAT);
      if (this.tier >= 2) {
        const kx = -INNER + 0.05;
        s.box(kx, FLOOR_Y + 0.62, 2.8, 0.08, 0.4, 1.0, PALETTE.walnut, 0, { shade: 0.9 });
        for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
          s.box(kx + 0.042, FLOOR_Y + 0.52 + row * 0.18, 2.4 + col * 0.2, 0.008, 0.12, 0.16, PALETTE.walnutDark, 0, FLAT);
          if ((row + col) % 2 === 0) s.box(kx + 0.05, FLOOR_Y + 0.5 + row * 0.18, 2.4 + col * 0.2, 0.01, 0.04, 0.02, PALETTE.brass, 0, FLAT);
        }
      }
    }
    if (type === 'lobby') {
      // Painted queue places: where to stand reads at a glance, and the line stays tidy.
      const mark = this.tier >= 2 ? this.theme.deep : '#B9AE9C';
      QUEUE_SLOTS.forEach((p, i) => {
        f.disc(p.x, FLOOR_Y + LIFT, p.z, 0.22, mark, 24);
        f.disc(p.x, FLOOR_Y + LIFT * 2, p.z, 0.17, fin.floor, 24);
        const next = QUEUE_SLOTS[i + 1];
        if (!next) return;
        // A dotted guide to the next place.
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          f.disc(p.x + (next.x - p.x) * t, FLOOR_Y + LIFT, p.z + (next.z - p.z) * t, 0.035, mark, 10);
        }
      });
    }
    if (fin.decor && type !== 'lobby') {
      frame(-1.35, 0.66, 0.44, 0.32, PALETTE.frameCanvas[this.index % 4]);
      frame(1.35, 0.66, 0.44, 0.32, PALETTE.frameCanvas[(this.index + 1) % 4]);
    }

    for (const cabin of this.layout.cabins) {
      const { room, bed } = cabin;
      if (fin.decor) {
        const rx0 = room.x0 + 0.3;
        const rx1 = bed.x0 - 0.2;
        f.slab(rect(rx0, room.z0 + 0.55, rx1, room.z1 - 0.4), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, this.theme.deep, 0, 0, FLAT);
      }
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
      this.dirt[cabin.index] = cabin.spots.map((spot, i) => {
        const size = 0.54 + (i % 2) * 0.08;
        // Each spot has its own material so it can fade on its own as it is scrubbed.
        const dirtMaterial = new THREE.MeshBasicMaterial({ map: getDirtTexture(), transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), dirtMaterial);
        mesh.position.set(spot.x, FLOOR_Y + 0.02, spot.z);
        mesh.rotation.y = i * 1.9 + cabin.index;
        mesh.visible = false;
        mesh.renderOrder = 1;
        this.group.add(mesh);
        return mesh;
      });
    }

    for (const bath of this.layout.bathrooms) {
      const builder = new GeoBuilder();
      const bathLamps = new GeoBuilder();
      for (const prop of this.layout.props) {
        if ((prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') && rectInside(prop.rect, bath.room)) buildProp(builder, bathLamps, prop, this.theme, this.tier);
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
    lock.position.set((room.x0 + room.x1) / 2, FLOOR_Y + 0.03, (room.z0 + room.z1) / 2);
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
    doors.forEach((d, i) => {
      const closedZ: [number, number] = [d.span[0] + leafLength * 0.5, d.span[0] + leafLength * 1.5];
      const door: RoomDoor = { kind: d.kind, index: d.index, x, z: (d.span[0] + d.span[1]) / 2, open: -1, locked: false, width, instance: i * 2, closedZ };
      this.roomDoors.push(door);
      this.setRoomDoor(door, 0);
    });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  private doorMetal(): string {
    return this.tier >= 2 ? PALETTE.brass : this.tier <= 0 ? PALETTE.iron : '#C9B79C';
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
      const mesh = new THREE.Mesh(body, MATERIALS.livery);
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
    const towelGeo = new GeoBuilder()
      .rounded(0, 0, 0, 0.26, 0.09, 0.2, 0.03, PALETTE.towel)
      .box(0, 0.006, 0.07, 0.265, 0.07, 0.03, PALETTE.towelStripe, 0, FLAT)
      .build();
    const rollGeo = new GeoBuilder().cylinder(0, 0, 0, 0.07, 0.07, 0.14, PALETTE.rollPaper, 12, 'x', { shade: 0.9 }).build();
    const suitcaseGeos = ['#C98A5E', '#5E7FA0', '#D9B45E', '#6E9C86'].map((color) =>
      new GeoBuilder()
        .rounded(0, 0, 0, 0.42, 0.26, 0.3, 0.05, color)
        .box(0, 0.14, 0, 0.14, 0.04, 0.05, PALETTE.ink, 0, FLAT)
        .box(-0.11, 0, 0, 0.03, 0.265, 0.305, PALETTE.creamBand, 0, FLAT)
        .box(0.11, 0, 0, 0.03, 0.265, 0.305, PALETTE.creamBand, 0, FLAT)
        .build(),
    );

    const shelves = new GeoBuilder();
    for (const bath of this.layout.bathrooms) {
      const anchorZ = bath.room.z0 + 1.35;
      const towels: Slot[] = [];
      const rolls: Slot[] = [];
      for (let i = 0; i < 4; i++) {
        towels.push({ x: INNER - 0.16, y: FLOOR_Y + 0.62 + (i % 2) * 0.1, z: anchorZ + Math.floor(i / 2) * 0.24 });
        rolls.push({ x: INNER - 0.12, y: FLOOR_Y + 0.42 + (i % 2) * 0.15, z: bath.room.z0 + 1.05 + Math.floor(i / 2) * 0.17 });
      }
      // A little shelf for them.
      shelves.box(INNER - 0.14, FLOOR_Y + 0.56, anchorZ + 0.12, 0.26, 0.03, 0.62, PALETTE.oak, 0, FLAT);
      this.bathroomTowels[bath.index] = new StockRack(this.group, [towelGeo], towels);
      this.bathroomRolls[bath.index] = new StockRack(this.group, [rollGeo], rolls);
    }
    if (!shelves.isEmpty) this.group.add(new THREE.Mesh(shelves.build(), MATERIALS.solid));

    const towelShelf = this.layout.props.find((p) => p.kind === 'shelfTowel');
    const rollShelf = this.layout.props.find((p) => p.kind === 'shelfRoll');
    if (towelShelf) this.shelfTowels = new StockRack(this.group, [towelGeo], this.shelfSlots(towelShelf.rect, 16, -1));
    if (rollShelf) this.shelfRolls = new StockRack(this.group, [rollGeo], this.shelfSlots(rollShelf.rect, 16, 1));

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
    if (cases.length > 0) this.luggage = new StockRack(this.group, suitcaseGeos, cases, true);
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
      if (tier >= 2) b.cylinder(cx, y + hb + 0.2, r.z0 + 0.04, 0.05, 0.05, w + 0.03, PALETTE.walnutDark, 10, 'x', FLAT);
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
      b.cylinder(cx, y + 0.2, cz, 0.16, 0.12, 0.4, PALETTE.coral, 12, 'y', { shade: 0.78 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(0.26, 8, 6).scale(0.3, 0.08, 1), i % 2 ? PALETTE.treeGreen : PALETTE.cypress, cx + Math.sin(a) * 0.18, y + 0.68, cz + Math.cos(a) * 0.18, 0.5, a, 0, { shade: 0.85 });
      }
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
  }
}
