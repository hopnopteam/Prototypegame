import * as THREE from 'three';
import { rect, type Rect } from '../core/types';
import { GeoBuilder, type PartStyle } from './geo';
import {
  CARRIAGE_LENGTH,
  DOOR_Z0,
  DOOR_Z1,
  GANGWAY_LENGTH,
  HALF_WIDTH,
  INNER,
  PARTITION_X0,
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

/** Wall anatomy, in metres above the floor. */
const WAINSCOT = 0.34;
const RAIL = 0.035;
const WINDOW_Y0 = 0.44;
const WINDOW_Y1 = 0.94;
const SKIN = 0.05;
const LIFT = 0.004;
const WINDOW_SLOT = 1.55;

const VESTIBULE_FLOOR: PartStyle = { pattern: PATTERN.checker, color2: '#D8C8AC', scale: 0.2, shade: 1 };

interface StockSlots {
  meshes: THREE.Mesh[];
}

/**
 * One carriage as a dollhouse cross-section, built from its floor plan: two-skin walls (wallpaper and
 * wainscot inside, livery outside) with windows, curtains and sconces; a patterned floor per room; the
 * gangway bellows to the next car; and furniture. Static parts merge into four meshes (structure, floor,
 * glass, lamps). Things that change (beds that pop in, dirt, stock on shelves, doors) are small separate
 * meshes the gameplay layer toggles.
 */
export class CarriageView {
  readonly group = new THREE.Group();
  readonly cabinBeds: THREE.Group[] = [];
  readonly bathroomFixtures: THREE.Group[] = [];
  private readonly cabinLocks: THREE.Mesh[] = [];
  private readonly bathroomLocks: THREE.Mesh[] = [];
  private readonly dirt: THREE.Mesh[][] = [];
  private readonly doors: THREE.Mesh[] = [];
  private readonly bathroomTowels: StockSlots[] = [];
  private readonly bathroomRolls: StockSlots[] = [];
  private shelfTowels: StockSlots | null = null;
  private shelfRolls: StockSlots | null = null;
  private readonly luggage: StockSlots = { meshes: [] };
  private doorOpen = 0;
  private readonly theme: CarriageTheme;

  constructor(readonly layout: CarriageLayout, readonly index: number) {
    this.theme = CARRIAGE_THEMES[layout.type];
    this.buildStatic();
    this.buildRooms();
    this.buildDoors();
    this.buildStock();
  }

  setCabinLocked(cabin: number, locked: boolean): void {
    const lock = this.cabinLocks[cabin];
    const bed = this.cabinBeds[cabin];
    if (lock) lock.visible = locked;
    if (bed) bed.visible = !locked;
  }

  setBathroomLocked(bathroom: number, locked: boolean): void {
    const lock = this.bathroomLocks[bathroom];
    const fixtures = this.bathroomFixtures[bathroom];
    if (lock) lock.visible = locked;
    if (fixtures) fixtures.visible = !locked;
  }

  setDirt(cabin: number, spots: boolean[]): void {
    const meshes = this.dirt[cabin];
    if (!meshes) return;
    for (let i = 0; i < meshes.length; i++) meshes[i].visible = !!spots[i];
  }

  setBathroomStock(bathroom: number, towels: number, rolls: number): void {
    showCount(this.bathroomTowels[bathroom], towels);
    showCount(this.bathroomRolls[bathroom], rolls);
  }

  setShelfStock(towels: number, rolls: number): void {
    showCount(this.shelfTowels, towels);
    showCount(this.shelfRolls, rolls);
  }

  setLuggageCount(count: number): void {
    showCount(this.luggage, count);
  }

  /** 0 = closed, 1 = open. Doors slide along the carriage. */
  setDoorOpen(amount: number): void {
    if (amount === this.doorOpen) return;
    this.doorOpen = amount;
    for (const door of this.doors) {
      const closedZ = door.userData.closedZ as number;
      door.position.z = closedZ + amount * (DOOR_Z1 - DOOR_Z0) * 0.92;
    }
  }

  // ─── Static build ──────────────────────────────────────────────────────────

  private buildStatic(): void {
    const L = CARRIAGE_LENGTH;
    const s = new GeoBuilder();
    const f = new GeoBuilder();
    const glass = new GeoBuilder();
    const lamps = new GeoBuilder();
    const t = this.theme;

    // Chassis: a navy skirt with a gold line (seen at stations and between cars), dark bogies below.
    s.box(0, 0.46, L / 2, HALF_WIDTH * 2 - 0.06, 0.16, L - 0.12, PALETTE.navy, 0, { shade: 0.85 });
    s.box(0, 0.535, L / 2, HALF_WIDTH * 2 - 0.04, 0.025, L - 0.1, PALETTE.gold, 0, { shade: 1 });
    s.box(0, 0.28, L / 2, HALF_WIDTH * 2 - 0.6, 0.2, L - 0.8, PALETTE.undercarriage);
    for (const z of [2.3, L - 2.3]) {
      s.box(0, 0.2, z, 2.4, 0.18, 2.2, PALETTE.wheel);
      for (const x of [-1.28, 1.28]) for (const dz of [-0.6, 0.6]) s.cylinder(x, 0.24, z + dz, 0.25, 0.25, 0.13, PALETTE.wheel, 12, 'x');
    }
    for (const z of [0.02, L - 0.02]) for (const x of [-1.3, 1.3]) s.cylinder(x, 0.42, z, 0.11, 0.11, 0.25, PALETTE.chrome, 10, 'z');

    // Floors: a base under everything, then each room with its own pattern.
    f.box(0, FLOOR_Y - 0.03, L / 2, HALF_WIDTH * 2 - 0.04, 0.06, L - 0.04, t.room, 0, { shade: 1 });
    const frontDepth = this.layout.frontNode ? this.frontDepth() : 0;
    for (const room of this.layout.rooms) {
      const isRoom = this.layout.cabins.some((c) => sameRect(c.room, room)) || this.layout.bathrooms.some((b) => sameRect(b.room, room));
      const isVestibule = room.z1 <= frontDepth + 0.01 || room.z0 >= L - REAR_VESTIBULE - 0.01;
      if (isVestibule) f.slab(room, FLOOR_Y, FLOOR_Y + LIFT, '#EFE6D6', 0, 0, VESTIBULE_FLOOR);
      else if (isRoom) f.slab(room, FLOOR_Y, FLOOR_Y + LIFT, t.room, 0, 0, { pattern: t.roomPattern, color2: t.room2, scale: t.roomScale, shade: 1 });
      else f.slab(room, FLOOR_Y, FLOOR_Y + LIFT, t.floor, 0, 0, { pattern: t.floorPattern, color2: t.floor2, scale: t.floorScale, shade: 1 });
    }
    // Corridor runner with a contrasting border (only carriages with a side corridor).
    if (this.layout.cabins.length > 0 || this.layout.bathrooms.length > 0) {
      const z0 = this.layout.type === 'lobby' ? 5.95 : Math.max(0.3, frontDepth - 0.1);
      const z1 = L - REAR_VESTIBULE + 0.6;
      const x0 = -INNER + 0.06;
      const x1 = PARTITION_X0 - 0.06;
      f.slab(rect(x0, z0, x1, z1), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, t.runnerEdge, 0, 0, { shade: 1 });
      f.slab(rect(x0 + 0.07, z0 + 0.07, x1 - 0.07, z1 - 0.07), FLOOR_Y + LIFT * 2, FLOOR_Y + LIFT * 3, t.runner, 0, 0, { pattern: PATTERN.dots, color2: t.runnerEdge, scale: 0.26, shade: 1 });
    }

    // Gangway to the next car: a steel plate between concertina bellows.
    f.box(0, FLOOR_Y - 0.02, L + GANGWAY_LENGTH / 2, 1.36, 0.04, GANGWAY_LENGTH + 0.1, '#8E8A86', 0, { pattern: PATTERN.stripesZ, color2: '#7A7672', scale: 0.08, shade: 1 });
    for (const x of [-0.74, 0.74]) s.box(x, FLOOR_Y + 0.45, L + GANGWAY_LENGTH / 2, 0.1, 0.9, GANGWAY_LENGTH, '#3F3E48', 0, { pattern: PATTERN.stripesZ, color2: '#2C2B33', scale: 0.07, shade: 0.8 });

    for (const wall of this.layout.walls) this.buildWall(s, glass, lamps, wall);
    for (const prop of this.layout.props) {
      if (prop.kind === 'bed' || prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') continue;
      buildProp(s, lamps, prop, t);
    }
    this.buildDecor(s, f, lamps);

    const structure = new THREE.Mesh(s.build(), MATERIALS.solid);
    structure.castShadow = true;
    structure.receiveShadow = true;
    this.group.add(structure);
    const floor = new THREE.Mesh(f.build(), MATERIALS.floor);
    floor.receiveShadow = true;
    this.group.add(floor);
    if (!glass.isEmpty) this.group.add(new THREE.Mesh(glass.build(), MATERIALS.windows));
    if (!lamps.isEmpty) this.group.add(new THREE.Mesh(lamps.build(), MATERIALS.lamps));
  }

  private frontDepth(): number {
    let depth = 0;
    for (const room of this.layout.rooms) if (room.z0 <= WALL + 0.01 && room.z1 < CARRIAGE_LENGTH / 2) depth = Math.max(depth, room.z1);
    return depth;
  }

  private buildWall(s: GeoBuilder, glass: GeoBuilder, lamps: GeoBuilder, wall: WallBox): void {
    const alongZ = wall.z1 - wall.z0 >= wall.x1 - wall.x0;
    if (wall.kind === 'interior') this.partition(s, wall, wall.height, alongZ);
    else if (alongZ) this.sideWall(s, glass, lamps, wall);
    else this.endWall(s, wall);
  }

  /** Interior wall: wainscot, a brass chair rail, striped wallpaper and a walnut cap; posts at the ends. */
  private partition(s: GeoBuilder, r: Rect, h: number, alongZ: boolean): void {
    const t = this.theme;
    const grow = (d: number): Rect => (alongZ ? rect(r.x0 - d, r.z0, r.x1 + d, r.z1) : rect(r.x0, r.z0 - d, r.x1, r.z1 + d));
    s.slab(r, FLOOR_Y, FLOOR_Y + WAINSCOT, t.wainscot, 0, 0, { shade: 0.72 });
    s.slab(grow(0.012), FLOOR_Y + WAINSCOT, FLOOR_Y + WAINSCOT + RAIL, t.trim, 0, 0, { shade: 1 });
    s.slab(r, FLOOR_Y + WAINSCOT + RAIL, FLOOR_Y + h, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 0.94 });
    s.slab(grow(0.02), FLOOR_Y + h, FLOOR_Y + h + 0.045, PALETTE.walnut, 0, 0, { shade: 1 });
    // Door posts at each end of the run give the floor plan crisp edges.
    const len = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
    if (len > 0.3) {
      for (const end of [0, 1]) {
        const post = alongZ
          ? rect(r.x0 - 0.02, end ? r.z1 - 0.06 : r.z0, r.x1 + 0.02, end ? r.z1 : r.z0 + 0.06)
          : rect(end ? r.x1 - 0.06 : r.x0, r.z0 - 0.02, end ? r.x1 : r.x0 + 0.06, r.z1 + 0.02);
        s.slab(post, FLOOR_Y, FLOOR_Y + h + 0.06, PALETTE.walnut, 0, 0, { shade: 0.8 });
      }
    }
  }

  /**
   * Long exterior wall: wallpaper and wainscot on the inside skin, livery outside, a band of windows with
   * curtains and brass sconces between them, and a rounded cornice where the roof would be.
   */
  private sideWall(s: GeoBuilder, glass: GeoBuilder, lamps: GeoBuilder, r: WallBox): void {
    const t = this.theme;
    const left = r.x0 < 0;
    const inner = left ? rect(r.x1 - SKIN, r.z0, r.x1, r.z1) : rect(r.x0, r.z0, r.x0 + SKIN, r.z1);
    const outer = left ? rect(r.x0, r.z0, r.x1 - SKIN, r.z1) : rect(r.x0 + SKIN, r.z0, r.x1, r.z1);
    const innerFace = left ? r.x1 : r.x0;
    const inward = left ? 1 : -1;
    const h = r.height;
    const len = r.z1 - r.z0;
    const zr = (z0: number, z1: number, base: Rect): Rect => rect(base.x0, z0, base.x1, z1);

    // Below the windows: wainscot and rail inside; navy skirt, gold line, livery outside.
    s.slab(inner, FLOOR_Y, FLOOR_Y + WAINSCOT, t.wainscot, 0, 0, { shade: 0.72 });
    s.slab(rect(inner.x0 - (left ? 0 : 0.012), r.z0, inner.x1 + (left ? 0.012 : 0), r.z1), FLOOR_Y + WAINSCOT, FLOOR_Y + WAINSCOT + RAIL, t.trim, 0, 0, { shade: 1 });
    s.slab(inner, FLOOR_Y + WAINSCOT + RAIL, FLOOR_Y + WINDOW_Y0, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 0.94 });
    s.slab(outer, 0.38, FLOOR_Y + 0.26, PALETTE.navy, 0, 0, { shade: 0.85 });
    s.slab(outer, FLOOR_Y + 0.26, FLOOR_Y + 0.3, PALETTE.gold, 0, 0, { shade: 1 });
    s.slab(outer, FLOOR_Y + 0.3, FLOOR_Y + WINDOW_Y0, PALETTE.livery, 0, 0, { shade: 0.95 });
    // Above the windows: a solid header.
    s.slab(inner, FLOOR_Y + WINDOW_Y1, FLOOR_Y + h, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 1 });
    s.slab(outer, FLOOR_Y + WINDOW_Y1, FLOOR_Y + h, PALETTE.livery, 0, 0, { shade: 1 });

    const count = len > 1.2 ? Math.floor(len / WINDOW_SLOT) : 0;
    if (count === 0) {
      s.slab(inner, FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 1 });
      s.slab(outer, FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, PALETTE.livery, 0, 0, { shade: 1 });
    } else {
      const slot = len / count;
      const width = Math.min(0.95, slot - 0.42);
      let cursor = r.z0;
      for (let i = 0; i < count; i++) {
        const zc = r.z0 + slot * (i + 0.5);
        const w0 = zc - width / 2;
        const w1 = zc + width / 2;
        // Pillar before this window.
        s.slab(zr(cursor, w0, inner), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 1 });
        s.slab(zr(cursor, w0, outer), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, PALETTE.livery, 0, 0, { shade: 1 });
        // Glass, a sill, and tied-back curtains.
        glass.box((r.x0 + r.x1) / 2, FLOOR_Y + (WINDOW_Y0 + WINDOW_Y1) / 2, zc, 0.03, WINDOW_Y1 - WINDOW_Y0, width, PALETTE.windowDay);
        s.box(innerFace + inward * 0.03, FLOOR_Y + WINDOW_Y0 + 0.015, zc, 0.07, 0.03, width + 0.08, t.trim, 0, { shade: 1 });
        for (const side of [-1, 1]) {
          s.box(innerFace + inward * 0.03, FLOOR_Y + (WINDOW_Y0 + WINDOW_Y1) / 2 + 0.03, zc + side * (width / 2 - 0.02), 0.035, WINDOW_Y1 - WINDOW_Y0 + 0.06, 0.12, t.curtain, 0, { shade: 0.8 });
        }
        s.box(innerFace + inward * 0.035, FLOOR_Y + WINDOW_Y1 + 0.02, zc, 0.03, 0.03, width + 0.24, PALETTE.brass, 0, { shade: 1 });
        // A sconce on the pillar that follows every other window.
        if (i < count - 1 && i % 2 === 0) {
          const pz = zc + slot / 2;
          s.box(innerFace + inward * 0.04, FLOOR_Y + 0.72, pz, 0.08, 0.03, 0.03, PALETTE.brass, 0, { shade: 1 });
          lamps.cylinder(innerFace + inward * 0.1, FLOOR_Y + 0.78, pz, 0.045, 0.07, 0.1, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
        }
        cursor = w1;
      }
      s.slab(zr(cursor, r.z1, inner), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 1 });
      s.slab(zr(cursor, r.z1, outer), FLOOR_Y + WINDOW_Y0, FLOOR_Y + WINDOW_Y1, PALETTE.livery, 0, 0, { shade: 1 });
    }
    // Cap and cornice: the carriage outline you read from above.
    s.slab(rect(r.x0 - (left ? 0.05 : 0), r.z0, r.x1 + (left ? 0 : 0.05), r.z1), FLOOR_Y + h, FLOOR_Y + h + 0.05, PALETTE.liveryDark, 0, 0, { shade: 1 });
    s.cylinder(left ? r.x0 - 0.02 : r.x1 + 0.02, FLOOR_Y + h + 0.03, (r.z0 + r.z1) / 2, 0.06, 0.06, len, PALETTE.livery, 8, 'z', { shade: 1 });
  }

  /** End wall: theme inside (it faces the camera at the front of each car), livery outside. */
  private endWall(s: GeoBuilder, r: WallBox): void {
    const t = this.theme;
    const front = r.z0 < CARRIAGE_LENGTH / 2;
    const inner = front ? rect(r.x0, r.z1 - SKIN, r.x1, r.z1) : rect(r.x0, r.z0, r.x1, r.z0 + SKIN);
    const outer = front ? rect(r.x0, r.z0, r.x1, r.z1 - SKIN) : rect(r.x0, r.z0 + SKIN, r.x1, r.z1);
    const h = r.height;
    const railRect = front ? rect(r.x0, inner.z0, r.x1, inner.z1 + 0.012) : rect(r.x0, inner.z0 - 0.012, r.x1, inner.z1);
    s.slab(inner, FLOOR_Y, FLOOR_Y + WAINSCOT, t.wainscot, 0, 0, { shade: 0.72 });
    s.slab(railRect, FLOOR_Y + WAINSCOT, FLOOR_Y + WAINSCOT + RAIL, t.trim, 0, 0, { shade: 1 });
    s.slab(inner, FLOOR_Y + WAINSCOT + RAIL, FLOOR_Y + h, t.wall, 0, 0, { pattern: PATTERN.wallpaper, color2: t.wallStripe, scale: 0.09, shade: 0.94 });
    s.slab(outer, 0.38, FLOOR_Y + 0.26, PALETTE.navy, 0, 0, { shade: 0.85 });
    s.slab(outer, FLOOR_Y + 0.26, FLOOR_Y + 0.3, PALETTE.gold, 0, 0, { shade: 1 });
    s.slab(outer, FLOOR_Y + 0.3, FLOOR_Y + h, PALETTE.livery, 0, 0, { shade: 0.95 });
    s.slab(rect(r.x0, r.z0 - (front ? 0.05 : 0), r.x1, r.z1 + (front ? 0 : 0.05)), FLOOR_Y + h, FLOOR_Y + h + 0.05, PALETTE.liveryDark, 0, 0, { shade: 1 });
  }

  /** Small touches that make each car a place: frames, a clock, rugs, the key rack, a palm. */
  private buildDecor(s: GeoBuilder, f: GeoBuilder, lamps: GeoBuilder): void {
    const type = this.layout.type;
    const t = this.theme;
    const frontWallZ = WALL + 0.012;
    const frame = (x: number, y: number, w: number, hgt: number, canvas: string): void => {
      s.box(x, FLOOR_Y + y, frontWallZ, w, hgt, 0.02, PALETTE.gold, 0, { shade: 1 });
      s.box(x, FLOOR_Y + y, frontWallZ + 0.011, w - 0.06, hgt - 0.06, 0.004, canvas, 0, { shade: 1 });
      s.box(x, FLOOR_Y + y - hgt * 0.12, frontWallZ + 0.014, w - 0.06, (hgt - 0.06) * 0.35, 0.003, PALETTE.hedge, 0, { shade: 1 });
    };

    if (type === 'lobby') {
      // Pigeon-hole key rack on the wall behind the reception desk.
      const kx = -INNER + 0.05;
      s.box(kx, FLOOR_Y + 0.62, 2.8, 0.1, 0.44, 1.1, PALETTE.walnut, 0, { shade: 0.9 });
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          const z = 2.34 + col * 0.184;
          const y = FLOOR_Y + 0.47 + row * 0.14;
          s.box(kx + 0.052, y, z, 0.012, 0.1, 0.13, '#5A3A28', 0, { shade: 1 });
          if ((row * 6 + col) % 3 !== 1) s.box(kx + 0.06, y - 0.02, z, 0.01, 0.04, 0.02, PALETTE.brass, 0, { shade: 1 });
        }
      }
      // A clock and a painting on the front wall, a mat inside the door.
      s.cylinder(1.2, FLOOR_Y + 0.72, frontWallZ + 0.01, 0.17, 0.17, 0.03, PALETTE.gold, 18, 'z', { shade: 1 });
      s.cylinder(1.2, FLOOR_Y + 0.72, frontWallZ + 0.026, 0.14, 0.14, 0.01, PALETTE.linen, 18, 'z', { shade: 1 });
      s.box(1.2, FLOOR_Y + 0.76, frontWallZ + 0.034, 0.012, 0.09, 0.004, PALETTE.ink, 0, { shade: 1 });
      s.box(1.24, FLOOR_Y + 0.72, frontWallZ + 0.034, 0.08, 0.012, 0.004, PALETTE.ink, 0, { shade: 1 });
      f.slab(rect(1.35, DOOR_Z0 + 0.1, INNER - 0.05, DOOR_Z1 - 0.1), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, PALETTE.navy, 0, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.gold, scale: 0.12, shade: 1 });
      // A round rug in front of the desk marks where guests queue.
      f.disc(0.55, FLOOR_Y + LIFT * 2, 3.15, 0.95, t.runnerEdge, 28);
      f.disc(0.55, FLOOR_Y + LIFT * 3, 3.15, 0.88, t.runner, 28, { pattern: PATTERN.dots, color2: t.runnerEdge, scale: 0.24, shade: 1 });
    }

    if (type === 'bathroom' || type === 'supply' || type === 'luggage') {
      frame(-1.35, 0.66, 0.46, 0.34, PALETTE.frameCanvas[this.index % 4]);
      frame(1.35, 0.66, 0.46, 0.34, PALETTE.frameCanvas[(this.index + 1) % 4]);
    }

    for (const cabin of this.layout.cabins) {
      const { room, bed } = cabin;
      // A rug on the free floor and a reading lamp above the pillow.
      const rx0 = room.x0 + 0.22;
      const rx1 = bed.x0 - 0.16;
      const rz0 = room.z0 + 0.45;
      const rz1 = room.z1 - 0.35;
      f.slab(rect(rx0, rz0, rx1, rz1), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, t.blanket2, 0, 0, { shade: 1 });
      f.slab(rect(rx0 + 0.05, rz0 + 0.05, rx1 - 0.05, rz1 - 0.05), FLOOR_Y + LIFT * 2, FLOOR_Y + LIFT * 3, t.runner, 0, 0, { pattern: PATTERN.diamond, color2: t.blanket2, scale: 0.18, shade: 1 });
      s.box(INNER - 0.04, FLOOR_Y + 0.74, bed.z0 + 0.32, 0.06, 0.03, 0.03, PALETTE.brass, 0, { shade: 1 });
      lamps.cylinder(INNER - 0.1, FLOOR_Y + 0.8, bed.z0 + 0.32, 0.04, 0.065, 0.09, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
    }

    for (const bath of this.layout.bathrooms) {
      const sink = this.layout.props.find((p) => p.kind === 'sink' && rectInside(p.rect, bath.room));
      if (sink) {
        const cz = (sink.rect.z0 + sink.rect.z1) / 2;
        s.box(INNER - 0.03, FLOOR_Y + 0.98, cz, 0.03, 0.34, 0.5, PALETTE.gold, 0, { shade: 1 });
        s.box(INNER - 0.045, FLOOR_Y + 0.98, cz, 0.01, 0.28, 0.44, '#D6ECF2', 0, { shade: 1 });
        f.slab(rect(sink.rect.x0 - 0.55, cz - 0.3, sink.rect.x0 - 0.05, cz + 0.3), FLOOR_Y + LIFT, FLOOR_Y + LIFT * 2, PALETTE.towel, 0, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.towelStripe, scale: 0.1, shade: 1 });
      }
    }
  }

  private buildRooms(): void {
    const t = this.theme;
    for (const cabin of this.layout.cabins) {
      const bed = new GeoBuilder();
      const bedLamps = new GeoBuilder();
      buildProp(bed, bedLamps, { kind: 'bed', rect: cabin.bed }, t);
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

      const lock = new THREE.Mesh(new THREE.PlaneGeometry(cabin.room.x1 - cabin.room.x0, cabin.room.z1 - cabin.room.z0).rotateX(-Math.PI / 2), MATERIALS.lockedOverlay);
      lock.position.set((cabin.room.x0 + cabin.room.x1) / 2, FLOOR_Y + 0.012, (cabin.room.z0 + cabin.room.z1) / 2);
      lock.visible = false;
      this.group.add(lock);
      this.cabinLocks[cabin.index] = lock;

      const dirtMaterial = new THREE.MeshBasicMaterial({ map: getDirtTexture(), transparent: true, depthWrite: false });
      this.dirt[cabin.index] = cabin.spots.map((spot, i) => {
        const size = 0.56 + (i % 2) * 0.1;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), dirtMaterial);
        mesh.position.set(spot.x, FLOOR_Y + 0.014, spot.z);
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
        if ((prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub') && rectInside(prop.rect, bath.room)) buildProp(builder, bathLamps, prop, t);
      }
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(builder.build(), MATERIALS.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.group.add(group);
      this.bathroomFixtures[bath.index] = group;

      const lock = new THREE.Mesh(new THREE.PlaneGeometry(bath.room.x1 - bath.room.x0, bath.room.z1 - bath.room.z0).rotateX(-Math.PI / 2), MATERIALS.lockedOverlay);
      lock.position.set((bath.room.x0 + bath.room.x1) / 2, FLOOR_Y + 0.012, (bath.room.z0 + bath.room.z1) / 2);
      lock.visible = false;
      this.group.add(lock);
      this.bathroomLocks[bath.index] = lock;
    }
  }

  private buildDoors(): void {
    const len = DOOR_Z1 - DOOR_Z0;
    const builder = new GeoBuilder();
    builder.box(0, 0, 0, 0.07, 1.05, len, PALETTE.livery, 0, { shade: 0.85 });
    builder.box(0, -0.36, 0, 0.075, 0.26, len, PALETTE.navy, 0, { shade: 1 });
    builder.box(0.04, 0.2, 0, 0.01, 0.34, len * 0.55, PALETTE.windowDay, 0, { shade: 1 });
    builder.box(0.045, -0.05, len * 0.3, 0.02, 0.14, 0.03, PALETTE.brass, 0, { shade: 1 });
    const doorGeometry = builder.build();
    const steps = new GeoBuilder();
    for (const door of this.layout.doors) {
      const mesh = new THREE.Mesh(doorGeometry, MATERIALS.solid);
      mesh.castShadow = true;
      const closedZ = (door.z0 + door.z1) / 2;
      mesh.position.set(HALF_WIDTH + 0.05, FLOOR_Y + 0.52, closedZ);
      mesh.userData.closedZ = closedZ;
      this.group.add(mesh);
      this.doors.push(mesh);
      steps.box(HALF_WIDTH + 0.18, FLOOR_Y - 0.03, closedZ, 0.35, 0.05, len, PALETTE.brass, 0, { shade: 1 });
    }
    if (!steps.isEmpty) this.group.add(new THREE.Mesh(steps.build(), MATERIALS.solid));
  }

  private buildStock(): void {
    const towelGeo = new GeoBuilder()
      .rounded(0, 0, 0, 0.26, 0.09, 0.2, 0.03, PALETTE.towel)
      .box(0, 0.006, 0.07, 0.265, 0.07, 0.03, PALETTE.towelStripe, 0, { shade: 1 })
      .build();
    const rollGeo = new GeoBuilder().cylinder(0, 0, 0, 0.07, 0.07, 0.14, PALETTE.rollPaper, 12, 'x', { shade: 0.9 }).build();
    const suitcaseGeos = ['#C9764A', '#2C4A6E', '#E9B949', '#3F8F8B', '#C0485C'].map((color) =>
      new GeoBuilder()
        .rounded(0, 0, 0, 0.42, 0.26, 0.3, 0.05, color)
        .box(0, 0.14, 0, 0.14, 0.04, 0.05, PALETTE.ink, 0, { shade: 1 })
        .box(-0.11, 0, 0, 0.035, 0.265, 0.305, PALETTE.creamBand, 0, { shade: 1 })
        .box(0.11, 0, 0, 0.035, 0.265, 0.305, PALETTE.creamBand, 0, { shade: 1 })
        .build(),
    );

    for (const bath of this.layout.bathrooms) {
      const sink = this.layout.props.find((p) => p.kind === 'sink' && rectInside(p.rect, bath.room));
      if (!sink) continue;
      const baseZ = sink.rect.z1 + 0.25;
      const towels: THREE.Mesh[] = [];
      const rolls: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const tm = new THREE.Mesh(towelGeo, MATERIALS.solid);
        tm.position.set(INNER - 0.18, FLOOR_Y + 0.7 + (i % 2) * 0.1, baseZ + Math.floor(i / 2) * 0.24);
        this.group.add(tm);
        towels.push(tm);
        const rm = new THREE.Mesh(rollGeo, MATERIALS.solid);
        rm.position.set(INNER - 0.14, FLOOR_Y + 0.45 + (i % 2) * 0.15, bath.room.z0 + 1.25 + Math.floor(i / 2) * 0.17);
        this.group.add(rm);
        rolls.push(rm);
      }
      this.bathroomTowels[bath.index] = { meshes: towels };
      this.bathroomRolls[bath.index] = { meshes: rolls };
    }

    const towelShelf = this.layout.props.find((p) => p.kind === 'shelfTowel');
    const rollShelf = this.layout.props.find((p) => p.kind === 'shelfRoll');
    if (towelShelf) this.shelfTowels = { meshes: this.fillShelf(towelShelf.rect, towelGeo, 16) };
    if (rollShelf) this.shelfRolls = { meshes: this.fillShelf(rollShelf.rect, rollGeo, 16) };

    const racks = this.layout.props.filter((p) => p.kind === 'rack' || p.kind === 'luggageRack');
    let n = 0;
    for (const rack of racks) {
      const capacity = rack.kind === 'rack' ? 4 : 8;
      const cols = rack.kind === 'rack' ? 1 : 2;
      const rows = Math.ceil(capacity / cols);
      const depth = rack.rect.z1 - rack.rect.z0;
      for (let i = 0; i < capacity; i++) {
        const mesh = new THREE.Mesh(suitcaseGeos[n++ % suitcaseGeos.length], MATERIALS.solid);
        mesh.castShadow = true;
        const col = i % cols;
        const row = Math.floor(i / cols) % rows;
        const layer = Math.floor(i / (cols * rows));
        const x = rack.rect.x0 + (rack.rect.x1 - rack.rect.x0) * ((col + 0.5) / cols);
        const z = rack.rect.z0 + depth * ((row + 0.5) / rows);
        // Sit on the top shelf so suitcases read from the top-down camera.
        mesh.position.set(x, FLOOR_Y + 0.86 + layer * 0.28, z);
        mesh.rotation.y = Math.PI / 2 + ((i % 3) - 1) * 0.08;
        mesh.visible = false;
        this.group.add(mesh);
        this.luggage.meshes.push(mesh);
      }
    }
  }

  private fillShelf(r: Rect, geometry: THREE.BufferGeometry, count: number): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const rows = 4;
    const cols = count / rows;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, MATERIALS.solid);
      const col = i % cols;
      const row = Math.floor(i / cols);
      mesh.position.set((r.x0 + r.x1) / 2, FLOOR_Y + 0.35 + (row % 2) * 0.33, r.z0 + 0.4 + (col + (row >= 2 ? 0 : 0.5)) * ((r.z1 - r.z0 - 0.8) / cols));
      this.group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

function showCount(slots: StockSlots | null | undefined, count: number): void {
  if (!slots) return;
  for (let i = 0; i < slots.meshes.length; i++) slots.meshes[i].visible = i < count;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.abs(a.x0 - b.x0) < 1e-6 && Math.abs(a.z0 - b.z0) < 1e-6 && Math.abs(a.x1 - b.x1) < 1e-6 && Math.abs(a.z1 - b.z1) < 1e-6;

const rectInside = (inner: Rect, outer: Rect): boolean => inner.x0 >= outer.x0 - 0.01 && inner.x1 <= outer.x1 + 0.01 && inner.z0 >= outer.z0 - 0.01 && inner.z1 <= outer.z1 + 0.01;

/** Furniture from a footprint. `lamps` collects shades that glow at night. */
export function buildProp(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme = CARRIAGE_THEMES.lobby): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  switch (prop.kind) {
    case 'bed': {
      // Walnut frame, a plump mattress, two pillows, a striped blanket with a turned-down sheet.
      b.slab(r, y, y + 0.24, PALETTE.walnut, 0, 0, { shade: 0.7 });
      b.rounded(cx, y + 0.31, cz + 0.02, w - 0.06, 0.14, d - 0.08, 0.06, PALETTE.mattress, { shade: 0.9 });
      for (const side of [-1, 1]) b.rounded(cx + side * (w / 4 - 0.02), y + 0.42, r.z0 + 0.27, w / 2 - 0.1, 0.1, 0.28, 0.06, PALETTE.pillow, { shade: 0.88 });
      b.rounded(cx, y + 0.395, r.z0 + d * 0.63, w - 0.02, 0.09, d * 0.68, 0.04, theme.blanket, { pattern: PATTERN.stripesX, color2: theme.blanket2, scale: 0.16, shade: 0.9 });
      b.box(cx, y + 0.445, r.z0 + d * 0.3, w - 0.02, 0.012, 0.12, PALETTE.linen, 0, { shade: 1 });
      // Headboard with a rounded top rail, facing the camera.
      b.box(cx, y + 0.5, r.z0 + 0.04, w, 0.62, 0.08, PALETTE.walnut, 0, { shade: 0.8 });
      b.cylinder(cx, y + 0.83, r.z0 + 0.04, 0.06, 0.06, w + 0.04, PALETTE.walnutDark, 10, 'x', { shade: 1 });
      b.box(cx, y + 0.55, r.z0 + 0.085, w - 0.2, 0.34, 0.01, theme.wainscot, 0, { shade: 0.9 });
      break;
    }
    case 'desk': {
      b.slab(r, y, y + 0.88, PALETTE.walnut, 0, 0, { shade: 0.65 });
      b.box(r.x1 + 0.006, y + 0.46, cz, 0.012, 0.6, d - 0.24, theme.wainscot, 0, { shade: 0.85 });
      b.box(r.x1 + 0.014, y + 0.46, cz, 0.006, 0.56, 0.035, PALETTE.brass, 0, { shade: 1 });
      b.slab(r, y + 0.88, y + 0.92, PALETTE.walnutDark, 0, -0.03, { shade: 1 });
      b.slab(r, y + 0.921, y + 0.925, '#3F7A58', 0, 0.06, { shade: 1 });
      b.slab(r, y + 0.915, y + 0.922, PALETTE.brass, 0, 0.03, { shade: 1 });
      // Service bell, ledger, banker's lamp.
      b.sphere(cx + 0.12, y + 0.95, r.z0 + 0.3, 0.07, PALETTE.brass, 1, 0.7);
      b.box(cx - 0.05, y + 0.94, cz + 0.22, 0.3, 0.03, 0.4, PALETTE.linen, 0, { shade: 1 });
      b.box(cx - 0.05, y + 0.957, cz + 0.22, 0.02, 0.004, 0.38, PALETTE.raspberry, 0, { shade: 1 });
      b.cylinder(cx - 0.1, y + 1.02, r.z1 - 0.25, 0.015, 0.05, 0.14, PALETTE.brass, 8);
      lamps.cylinder(cx - 0.1, y + 1.1, r.z1 - 0.25, 0.06, 0.08, 0.07, '#4E9A6E', 12, 'y', { shade: 0.9 });
      break;
    }
    case 'urn': {
      b.slab(r, y, y + 0.72, PALETTE.walnut, 0, 0, { shade: 0.65 });
      b.slab(r, y + 0.72, y + 0.76, theme.trim, 0, -0.02, { shade: 1 });
      b.cylinder(cx, y + 0.98, cz, 0.15, 0.19, 0.4, PALETTE.brass, 14, 'y', { shade: 0.8 });
      b.sphere(cx, y + 1.2, cz, 0.12, PALETTE.brass, 1, 0.8);
      b.cylinder(cx, y + 1.32, cz, 0.03, 0.05, 0.06, PALETTE.walnutDark, 8);
      b.cylinder(cx + 0.18, y + 0.8, cz + 0.12, 0.07, 0.07, 0.01, PALETTE.porcelain, 12);
      b.cylinder(cx + 0.18, y + 0.84, cz + 0.12, 0.045, 0.035, 0.07, PALETTE.porcelain, 12);
      break;
    }
    case 'linen': {
      b.slab(r, y, y + 0.9, PALETTE.walnut, 0, 0, { shade: 0.65 });
      b.slab(r, y + 0.9, y + 0.93, theme.trim, 0, -0.02, { shade: 1 });
      const half = w / 2;
      for (let i = 0; i < 4; i++) {
        b.rounded(r.x0 + half * 0.5, y + 0.98 + i * 0.1, cz, half - 0.12, 0.09, d - 0.14, 0.03, i % 2 ? theme.blanket : theme.blanket2, { shade: 0.85 });
        b.rounded(r.x0 + half * 1.5, y + 0.97 + i * 0.09, cz, half - 0.16, 0.08, d - 0.18, 0.04, PALETTE.pillow, { shade: 0.88 });
      }
      break;
    }
    case 'rack':
    case 'luggageRack': {
      for (const level of [0.3, 0.72]) b.slab(r, y + level - 0.03, y + level, PALETTE.oak, 0, 0.02, { pattern: PATTERN.stripesZ, color2: PALETTE.walnut, scale: 0.08, shade: 1 });
      for (const px of [r.x0 + 0.05, r.x1 - 0.05]) for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(px, y + 0.42, pz, 0.05, 0.84, 0.05, PALETTE.brass, 0, { shade: 0.85 });
      b.box(r.x0 + 0.05, y + 0.84, cz, 0.03, 0.03, d - 0.1, PALETTE.brass, 0, { shade: 1 });
      b.box(r.x1 - 0.05, y + 0.84, cz, 0.03, 0.03, d - 0.1, PALETTE.brass, 0, { shade: 1 });
      break;
    }
    case 'bin':
      b.cylinder(cx, y + 0.28, cz, Math.min(w, d) * 0.45, Math.min(w, d) * 0.38, 0.56, theme.wainscot, 14, 'y', { shade: 0.7 });
      b.cylinder(cx, y + 0.57, cz, Math.min(w, d) * 0.47, Math.min(w, d) * 0.47, 0.04, PALETTE.brass, 14, 'y', { shade: 1 });
      break;
    case 'plant': {
      // Potted palm: a terracotta pot and fronds arching outward.
      b.cylinder(cx, y + 0.2, cz, 0.17, 0.13, 0.4, PALETTE.coral, 12, 'y', { shade: 0.75 });
      b.cylinder(cx, y + 0.41, cz, 0.18, 0.18, 0.04, '#D97760', 12, 'y', { shade: 1 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(new THREE.SphereGeometry(0.28, 8, 6).scale(0.28, 0.08, 1), i % 2 ? PALETTE.treeGreen : PALETTE.cypress, cx + Math.sin(a) * 0.2, y + 0.72 - (i % 3) * 0.04, cz + Math.cos(a) * 0.2, 0.5, a, 0, { shade: 0.85 });
      }
      b.sphere(cx, y + 0.72, cz, 0.08, PALETTE.hedge, 1);
      break;
    }
    case 'toilet':
      b.rounded(cx + 0.14, y + 0.62, cz, 0.18, 0.3, d * 0.75, 0.05, PALETTE.porcelain, { shade: 0.9 });
      b.cylinder(cx - 0.08, y + 0.2, cz, 0.21, 0.16, 0.4, PALETTE.porcelain, 16, 'y', { shade: 0.75 });
      b.cylinder(cx - 0.08, y + 0.42, cz, 0.23, 0.23, 0.04, PALETTE.walnut, 16, 'y', { shade: 1 });
      b.cylinder(cx + 0.05, y + 0.52, cz, 0.015, 0.015, 0.3, PALETTE.brass, 6, 'x');
      break;
    case 'sink':
      b.cylinder(cx, y + 0.34, cz, 0.07, 0.12, 0.68, PALETTE.porcelain, 12, 'y', { shade: 0.75 });
      b.rounded(cx - 0.02, y + 0.72, cz, w, 0.1, d * 0.85, 0.08, PALETTE.porcelain, { shade: 0.9 });
      b.rounded(cx - 0.02, y + 0.775, cz, w * 0.66, 0.02, d * 0.55, 0.06, '#A9D8EA', { shade: 1 });
      for (const dz of [-0.1, 0.1]) b.cylinder(r.x1 - 0.1, y + 0.82, cz + dz, 0.018, 0.018, 0.08, PALETTE.brass, 6);
      break;
    case 'bathtub': {
      // Clawfoot tub: coloured outside, white inside, brass feet.
      b.rounded(cx, y + 0.3, cz, w, 0.42, d, 0.2, theme.wainscot, { shade: 0.75 });
      b.rounded(cx, y + 0.52, cz, w - 0.02, 0.04, d - 0.02, 0.19, PALETTE.porcelain, { shade: 1 });
      b.rounded(cx, y + 0.54, cz, w - 0.14, 0.02, d - 0.14, 0.14, '#9FD2E8', { shade: 1 });
      for (const fx of [r.x0 + 0.15, r.x1 - 0.15]) for (const fz of [r.z0 + 0.15, r.z1 - 0.15]) b.sphere(fx, y + 0.05, fz, 0.06, PALETTE.brass, 0);
      b.cylinder(r.x1 - 0.08, y + 0.7, cz, 0.02, 0.02, 0.3, PALETTE.brass, 6);
      break;
    }
    case 'shelfTowel':
    case 'shelfRoll':
      b.slab(r, y, y + 0.08, PALETTE.walnut, 0, 0, { shade: 0.8 });
      for (const level of [0.28, 0.61, 0.94]) b.slab(r, y + level, y + level + 0.04, PALETTE.oak, 0, 0.02, { shade: 1 });
      b.box(prop.kind === 'shelfTowel' ? r.x0 + 0.04 : r.x1 - 0.04, y + 0.5, cz, 0.06, 1.0, d, PALETTE.walnut, 0, { shade: 0.8 });
      for (const pz of [r.z0 + 0.04, r.z1 - 0.04]) b.box(cx, y + 0.5, pz, w, 1.0, 0.05, PALETTE.walnut, 0, { shade: 0.8 });
      break;
    case 'crateBay':
      b.slab(r, y, y + 0.02, PALETTE.walnutDark, 0, 0, { shade: 1 });
      b.box(cx, y + 0.25, r.z0 + 0.5, w * 0.7, 0.5, 0.7, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#A87544', scale: 0.12, shade: 0.8 });
      b.box(cx, y + 0.72, r.z0 + 0.5, w * 0.6, 0.44, 0.6, '#D2A06C', 0, { pattern: PATTERN.stripesZ, color2: '#B3834F', scale: 0.1, shade: 0.8 });
      b.box(cx, y + 0.25, r.z1 - 0.6, w * 0.7, 0.5, 0.7, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#A87544', scale: 0.12, shade: 0.8 });
      break;
    case 'bench':
      b.slab(r, y + 0.1, y + 0.36, PALETTE.walnut, 0, 0.05, { shade: 0.7 });
      b.rounded(cx, y + 0.4, cz, w - 0.1, 0.08, d - 0.1, 0.04, theme.runner, { shade: 0.9 });
      b.rounded(r.x0 + 0.1, y + 0.66, cz, 0.1, 0.44, d - 0.1, 0.04, theme.runner, { shade: 0.85 });
      break;
    case 'lamp':
      b.cylinder(cx, y + 0.8, cz, 0.03, 0.05, 1.6, PALETTE.brass, 6);
      lamps.cylinder(cx, y + 1.6, cz, 0.12, 0.2, 0.22, PALETTE.lampShade, 12);
      break;
  }
}
