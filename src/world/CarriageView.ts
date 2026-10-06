import { TrainCat } from './TrainCat';
import * as THREE from 'three';
import { rect, type CarriageType, type Rect, type VenueKind } from '../core/types';
import type { ComfortKey } from '../config/content';
import { buildBedMess, buildMessPiece, seeded, type BedMess, type MessPiece } from './Mess';
import { GeoBuilder, PaneBuilder, type PartStyle } from './geo';
import {
  CARRIAGE_LENGTH,
  DOOR_Z0,
  DOOR_Z1,
  GANGWAY_LENGTH,
  HALF_WIDTH,
  INNER,
  INTERIOR_WALL_HEIGHT,
  ROOM_DOOR,
  PARTITION_X0,
  PARTITION_X1,
  REAR_VESTIBULE,
  WALL,
  isVenueType,
  type CabinLayout,
  type CarriageLayout,
  type PropDef,
  type WallBox,
} from './layout';
import { litMaterial, MATERIALS, PATTERN } from './materials';
import { CARRIAGE_THEMES, CLASS_THEMES, PALETTE, shadeHex, type CarriageTheme } from './palette';
import { smoothstep01 } from '../core/math';
import { classOfTier, isPassengerType, type ClassDef } from '../config/classes';
import { SURFACES } from './surfaces';
import { buildCobwebs, floorSteps, type WindowCorner } from './Floors';
import { STATIC_CASTER_LAYER } from './Lighting';
import type { LampAnchor } from './Lighting';
import { REFLECT_LAYER } from './Water';
import { buildBarBulbs, buildDomeCanopy, buildPassPlate, buildTableDirt, buildVenueProp, projectorLens, screenArea } from './VenueProps';
import { bubbleTexture, makeSprite } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';
import type { IconName } from '../ui/icons';

/** Metres between ceiling lights along a room or corridor (lamp pools). */
const LAMP_SPACING = 3.2;

/** Height of every walkable floor (train and platform); the ground is at y = 0. */
export const FLOOR_Y = 0.55;
/**
 * The chassis trim line ends this much short of the carriage (both ends together): an odd length, so its end
 * faces never fall in the plane of a floorboard's end (session 19: one flickered at a sleeper's rear).
 */
const TRIM_INSET = 0.093;
/** Mattress top above the floor, for every bed at every tier (sleepers lie here). */
export const BED_TOP = 0.4;

/** Wall anatomy, in metres above the floor. */
const WAINSCOT = 0.34;
/** The usual side-window band (a carriage may set its own: `CarriageLayout.windowBand`). */
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
 * next: rooms 0–6 mm, runners 12, cabin mess from 40.
 */
/** Each piece of a cabin's mess is swept in to the broom over this share of the tidying. */
const MESS_POP = 0.2;
/** How high a swept piece hops on its way in (metres). */
const MESS_HOP = 0.35;
/** A hex colour lightened (+) or darkened (−). */
/** Trims and rails stop this short of a wall's ends, so their end faces never share a plane with it. */
const END_INSET = 0.006;
/** A rect shortened at both ends of its long axis. */
const shortenEnds = (r: Rect, by: number): Rect => (r.z1 - r.z0 >= r.x1 - r.x0 ? rect(r.x0, r.z0 + by, r.x1, r.z1 - by) : rect(r.x0 + by, r.z0, r.x1 - by, r.z1));
/** Supply stand steps: stock sits on these. */
const SHELF_LOW = 0.3;
const SHELF_HIGH = 0.62;
const SHELF_TOP = 0.012;
/**
 * Mess pieces are built a little bigger than their MESS_CELL so they read at phone zoom (session 17: 1.35, was
 * 1.9, when a newspaper was half a metre across and the rooms looked like a toy box).
 */
const MESS_SCALE = 1.35;
/** The guest's one floor piece lies this far out from the bed's side (centre), in the lane by the bed. */
const MESS_BESIDE_BED = 0.27;
/** …and at least this far from the tip they left (centres), so the two never touch. */
const MESS_TIP_CLEAR = 0.56;
/** …and clear of a nightstand at the bed's head (from the head wall). */
const MESS_HEAD_CLEAR = 0.62;

interface CabinMess {
  group: THREE.Group;
  items: THREE.Mesh[];
  key: string;
  /** The cleaning spot: swept pieces fly here. */
  heart: { x: number; z: number };
}


/** The washroom stock stand: panel width, board tops and overall height (metres above the floor). */
const WASH_SHELF = { side: 0.03, middle: 0.33, top: 0.6, height: 0.64 };
/**
 * Room doors (session 16, owner: "the doors are half animated… make them feel like part of the train"): two
 * hinged leaves per doorway, as tall as the cut-away partition, that swing into the room. The partition beside a
 * doorway is only ~0.3 m, too short for sliding leaves to clear a 1.4 m opening (they used to stop at a third of
 * it); a swing reads clearly from above and needs no wall to hide in.
 */
const LEAF_HEIGHT = INTERIOR_WALL_HEIGHT - 0.04;
const { hingeInset: HINGE_INSET, meetGap: LEAF_MEET_GAP, swing: DOOR_SWING, thickness: LEAF_THICKNESS } = ROOM_DOOR;
/** The gangway's concertina sides. */
const BELLOWS_HEIGHT = 0.4;
/** The lobby clock hangs on the front wall between the tea urn and the linen cupboard. */
const CLOCK_X = -1.03;
/** A cabin's picture and wireless shelf sit on the knee-high partition (their tops stay under its cap). */
const PICTURE_Y = INTERIOR_WALL_HEIGHT - 0.14;
const RADIO_SHELF_Y = INTERIOR_WALL_HEIGHT - 0.32;

/** The cinema's film: a few scenes, each four corner colours (top back, bottom front, bottom back, top front). */
const FILM_SCENES: readonly (readonly (readonly number[])[])[] = [
  [[0.25, 0.45, 0.85], [0.15, 0.45, 0.1], [0.1, 0.35, 0.08], [0.4, 0.6, 0.95]],
  [[0.95, 0.5, 0.2], [0.45, 0.18, 0.08], [0.35, 0.14, 0.06], [1.0, 0.65, 0.3]],
  [[0.12, 0.15, 0.5], [0.05, 0.06, 0.22], [0.08, 0.05, 0.18], [0.25, 0.25, 0.65]],
  [[0.7, 0.7, 0.6], [0.3, 0.25, 0.2], [0.25, 0.2, 0.18], [0.85, 0.8, 0.7]],
  [[0.85, 0.3, 0.45], [0.35, 0.08, 0.2], [0.25, 0.06, 0.15], [0.95, 0.45, 0.55]],
];

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
  /** The curtains' colour where it is not the carriage theme's (a venue's own). */
  curtain?: string;
  /** 0 bare bulbs, 1 shaded lamps, 2 sconces, 3 brass sconces. */
  lamps: number;
  /** Stacked white globe sconces (the bar's Luxury refit, from the owner's reference). */
  globes?: boolean;
  decor: boolean;
}

/**
 * The venues' walls by refit tier (session 21): worn, then plain cream, then the venue's own colours, then each one's
 * grand finish (the café's green panelling, the dining car's walnut, the bar's warm wood under cream with globe
 * sconces, the dome's midnight blue, the picture palace's mahogany under deep red).
 */
const VENUE_WALLS: Record<VenueKind, { wall: string; wallLow: string; panel?: string; cap?: string; curtain?: string }[]> = {
  cafe: [
    { wall: '#EFE6D3', wallLow: '#D3C6AA' },
    { wall: '#EBDDBF', wallLow: '#8FA66A', curtain: '#E9D9A8' },
    { wall: '#F1E6CF', wallLow: '#2F5A3E', panel: '#2F5A3E', cap: PALETTE.gold, curtain: '#F2E9D6' },
  ],
  dining: [
    { wall: '#EFE5D8', wallLow: '#CDBCA9' },
    { wall: '#EAD8CC', wallLow: '#8C2F3F', curtain: '#E2B653' },
    { wall: '#F0E2CE', wallLow: PALETTE.walnut, panel: PALETTE.walnut, cap: PALETTE.gold, curtain: '#8C2F3F' },
  ],
  bar: [
    { wall: '#E8E4DA', wallLow: '#A9BCB7' },
    { wall: '#C9DBD7', wallLow: '#24585A', curtain: '#E2B653' },
    { wall: '#F2EBDD', wallLow: '#5A3A28', panel: '#5A3A28', cap: PALETTE.brass, curtain: '#F2E9D6' },
  ],
  dome: [
    { wall: '#E6EBEF', wallLow: '#BCCAD6' },
    { wall: '#CBDDEB', wallLow: '#3E6A93', curtain: '#E2B653' },
    { wall: '#D6DEEC', wallLow: '#22324F', panel: '#22324F', cap: PALETTE.gold, curtain: '#E2B653' },
  ],
  cinema: [
    { wall: '#8C8590', wallLow: '#55505C', cap: '#3A3940' },
    { wall: '#4A3F4E', wallLow: '#6B2A4A', cap: PALETTE.walnutDark, curtain: '#A3283A' },
    { wall: '#7A2A30', wallLow: '#5A2C1E', panel: '#5A2C1E', cap: PALETTE.gold, curtain: '#8E1F2B' },
  ],
};

function venueFinish(kind: VenueKind, tier: number): Finish | null {
  if (tier <= 0) return null;
  const w = VENUE_WALLS[kind][Math.min(3, tier) - 1];
  const boards = { floor: PALETTE.boards, floorSeam: PALETTE.boardsSeam, floorPattern: PATTERN.boards, floorScale: 0.3, room: PALETTE.boards, roomSeam: PALETTE.boardsSeam, roomPattern: PATTERN.boards, roomScale: 0.3 };
  return {
    ...boards,
    wall: w.wall, wallLow: w.wallLow, panelled: !!w.panel, panel: w.panel ?? PALETTE.walnut, cap: w.cap ?? PALETTE.walnut,
    runner: null, curtains: tier >= 2, curtain: w.curtain, lamps: Math.min(3, tier), globes: kind === 'bar' && tier >= 3, decor: false,
  };
}

function finishFor(type: CarriageType, tier: number, t: CarriageTheme): Finish {
  const tiled = type === 'bathroom';
  const venue = isVenueType(type) ? venueFinish(type as VenueKind, tier) : null;
  if (venue) return venue;
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
  /** First of this door's two instances in the carriage's leaf mesh. */
  instance: number;
  /** Each leaf's hinge (z, at the front and back posts), and the leaves' length: they meet in the middle. */
  hinges: [number, number];
  leafLength: number;
}

/**
 * One carriage as a clean dollhouse cross-section, built from its floor plan and its refurbishment tier:
 * two-skin walls (interior finish inside, livery outside) with windows; a flat, quiet floor per room;
 * sliding doors on every room; the gangway to the next car; furniture that improves with the tier.
 * Static parts merge into a handful of meshes. Things that change (beds that pop in, dirt, stock, doors)
 * are small separate meshes the gameplay layer toggles.
 */
/** Sliced builds (session 16): walls and props laid per slice before a frame may end. */
const WALLS_PER_SLICE = 3;
const PROPS_PER_SLICE = 4;

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

  /** A passenger carriage's class (from its tier); null for service cars. */
  readonly cls: ClassDef | null;
  /** The paint outside: the class's own livery on passenger carriages, the train's livery on service cars. */
  readonly liveryBody: THREE.Material;
  readonly liveryTrim: THREE.Material;

  /** Venue carriages (session 20): each table, stool or row of seats, shown once bought. */
  private readonly venueGroups: THREE.Group[] = [];
  /** The dining car's plates left on a table after a meal, per table. */
  private readonly venueDirt: THREE.Group[] = [];
  /** What menu and station tiles add (the pastries, a second machine, the piano, telescopes), by unlock key. */
  private readonly venueExtras = new Map<string, THREE.Group>();
  /** Plates waiting on the dining car's pass. */
  private readonly passPlates: THREE.Group[] = [];
  /** The bar's party bulbs: one mesh, lit a bulb at a time through its draw range. */
  private barBulbs: THREE.Mesh | null = null;
  private barBulbCount = 0;
  private barLit = -1;
  private barParty = false;
  private clock = 0;
  /** The cinema (session 21): the picture on the screen and the projector's beam, shown while a film is on. */
  private filmPicture: THREE.Mesh | null = null;
  private filmBeam: THREE.Mesh | null = null;
  private filmOn = false;
  /** The dome's "next view" bubble. */
  private venueSign: THREE.Sprite | null = null;
  private venueSignKey = '';

  /**
   * `sliced`: build nothing yet; the owner runs `buildSteps()` a slice at a time over several frames (a refit or
   * a coupling during play must never stall a frame; session 16). Otherwise it is built at once (loading a save).
   */
  constructor(readonly layout: CarriageLayout, readonly index: number, readonly tier = 0, sliced = false) {
    const passenger = isPassengerType(layout.type);
    this.cls = passenger ? classOfTier(tier) : null;
    const cls = this.cls;
    this.theme = cls && cls.id !== 'basic' ? CLASS_THEMES[cls.id] : CARRIAGE_THEMES[layout.type];
    this.finish = finishFor(layout.type, tier, this.theme);
    this.blanketColor = tier <= 0 ? PALETTE.greyWool : tier >= 3 ? (tier >= 4 ? this.theme.blanket : this.theme.deep) : this.theme.blanket;
    this.liveryBody = cls ? litMaterial(`livery:${cls.id}`, { vertexColors: true, color: cls.livery.body }, { surface: SURFACES.paint, light: true }) : MATERIALS.livery;
    this.liveryTrim = cls ? litMaterial(`trim:${cls.id}`, { vertexColors: true, color: cls.livery.trim }, { surface: tier >= 4 ? SURFACES.brass : SURFACES.paint, light: true }) : MATERIALS.liveryTrim;
    if (sliced) return;
    const steps = this.buildSteps();
    while (!steps.next().done) {
      // built at once
    }
  }

  /** The whole build in small slices (each yield is a point where a frame may end). */
  *buildSteps(): Generator<void, void, void> {
    yield* this.buildStatic();
    yield* this.buildRooms();
    yield* this.buildVenue();
    this.buildRoomDoors();
    this.buildDoors();
    yield;
    this.buildStock();
    this.buildCat();
    CarriageView.shadowEpoch++;
  }

  /** The lobby cat, curled up on the reception desk (session 18); null in carriages without a desk. */
  cat: TrainCat | null = null;

  private buildCat(): void {
    const desk = this.layout.props.find((p) => p.kind === 'desk');
    if (!desk) return;
    this.cat = new TrainCat();
    // The desk's top: a trestle table when run down, a felt-topped counter once repaired (see buildProp).
    this.cat.place(desk.rect, FLOOR_Y + (this.tier <= 0 ? 0.84 : 0.925));
    this.group.add(this.cat.group);
  }

  /**
   * Bumped whenever something that casts into the static moon shadow appears, disappears or is finished
   * (a carriage built, a bed or a fixture shown): TrainState redraws the static shadows when it changes.
   */
  static shadowEpoch = 0;

  setCabinLocked(cabin: number, locked: boolean): void {
    if (this.cabinLocked[cabin] !== locked) CarriageView.shadowEpoch++;
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
    CarriageView.shadowEpoch++;
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
      // Not quite the whole width: the open leaf stops clear of the first window frame along the wall.
      door.position.z = closedZ + amount * (DOOR_Z1 - DOOR_Z0) * 0.88;
    }
  }

  /** Slides a room door: the two leaves part and disappear into the wall on either side. */
  /** 0 shut, 1 open: both leaves swing into the room together (eased, so they settle softly either way). */
  setRoomDoor(door: RoomDoor, amount: number): void {
    if (amount === door.open || !this.leafMesh) return;
    door.open = amount;
    const swing = DOOR_SWING * smoothstep01(amount);
    for (let k = 0; k < 2; k++) {
      // The front leaf points back along the doorway when shut and turns toward the room (+x) as it opens; the
      // back leaf is its mirror image.
      const yaw = k === 0 ? swing : Math.PI - swing;
      tmpPos.set(door.x, FLOOR_Y + LEAF_HEIGHT / 2, door.hinges[k]);
      tmpQuat.setFromAxisAngle(UP, yaw);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale.set(1, 1, door.leafLength));
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
  /** The height of the outside walls (the dome's glass rises from their top). */
  private exteriorHeight(): number {
    return this.layout.walls.find((w) => w.kind === 'exterior')?.height ?? 1.1;
  }

  /**
   * A venue's furniture that comes and goes: each table, stool or row (shown once bought), the plates left on a
   * dining table, what the menu and station tiles add, the plates on the pass and the bar's party bulbs. All
   * hidden until the game says otherwise (Venues.syncView).
   */
  private *buildVenue(): Generator<void, void, void> {
    const venue = this.layout.venue;
    if (!venue) return;
    const part = (build: (b: GeoBuilder, glow: GeoBuilder) => void, cast = true): THREE.Group => {
      const b = new GeoBuilder();
      const glow = new GeoBuilder();
      build(b, glow);
      const group = new THREE.Group();
      if (!b.isEmpty) {
        const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        if (cast) mesh.layers.enable(STATIC_CASTER_LAYER);
        group.add(mesh);
      }
      if (!glow.isEmpty) group.add(new THREE.Mesh(glow.build(), MATERIALS.lamps));
      group.visible = false;
      this.group.add(group);
      return group;
    };
    const props = (indices: number[]) => (b: GeoBuilder, glow: GeoBuilder): void => {
      for (const i of indices) {
        const prop = this.layout.props[i];
        b.object(`prop:${prop.kind}`);
        glow.object(`prop:${prop.kind}~glow`);
        buildProp(b, glow, prop, this.theme, this.tier);
        b.endObject();
        glow.endObject();
      }
    };
    for (const g of venue.groups) {
      this.venueGroups[g.index] = part(props(g.props));
      if (venue.kind === 'dining') {
        const table = this.layout.props[g.props[0]];
        this.venueDirt[g.index] = part((b) => {
          b.object('venue:plates');
          buildTableDirt(b, table);
          b.endObject();
        }, false);
      }
      yield;
    }
    for (const e of venue.extras) {
      this.venueExtras.set(e.key, part(props(e.props)));
      yield;
    }
    if (venue.kind === 'dining') {
      const pass = this.layout.props.find((p) => p.kind === 'pass');
      if (pass) {
        const r = pass.rect;
        const cz = (r.z0 + r.z1) / 2;
        for (let i = 0; i < 3; i++) {
          const x = r.x0 + 0.17 + i * ((r.x1 - r.x0 - 0.34) / 2);
          this.passPlates.push(part((b) => {
            b.object('venue:passPlate');
            buildPassPlate(b, x, cz, this.tier);
            b.endObject();
          }, false));
        }
      }
    }
    if (venue.kind === 'cinema') this.buildFilm();
    const bar = this.layout.props.find((p) => p.kind === 'bar');
    if (bar) {
      const glow = new GeoBuilder();
      buildBarBulbs(glow, bar);
      const geometry = glow.build();
      this.barBulbs = new THREE.Mesh(geometry, MATERIALS.lamps);
      this.barBulbCount = 8;
      this.group.add(this.barBulbs);
      this.setBarLit(0);
    }
  }

  /**
   * The cinema's film: a picture on the screen whose colours drift scene to scene, and a soft beam from the
   * projector's lens to it. Both additive like the headlight's beam (the same shader program, so a film starting
   * never compiles one).
   */
  private buildFilm(): void {
    const screen = this.layout.props.find((p) => p.kind === 'screen');
    const projector = this.layout.props.find((p) => p.kind === 'projector');
    if (!screen) return;
    const a = screenArea(screen, this.tier);
    const x = a.x + 0.004;
    const quad = (points: number[][], colours: number[][]): THREE.BufferGeometry => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colours.flat(), 3));
      return geo;
    };
    const film = (opacity: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    // Two triangles facing +x; colours are rewritten each frame while it plays.
    const picture = quad(
      [[x, a.y0, a.z0], [x, a.y0, a.z1], [x, a.y1, a.z1], [x, a.y0, a.z0], [x, a.y1, a.z1], [x, a.y1, a.z0]],
      [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
    );
    this.filmPicture = new THREE.Mesh(picture, film(1));
    this.filmPicture.visible = false;
    this.filmPicture.renderOrder = 2;
    this.group.add(this.filmPicture);
    if (projector) {
      const l = projectorLens(projector, this.tier);
      const lens = [l.x, l.y, l.z];
      const c = [[x, a.y0 + 0.06, a.z0 + 0.1], [x, a.y0 + 0.06, a.z1 - 0.1], [x, a.y1 - 0.06, a.z1 - 0.1], [x, a.y1 - 0.06, a.z0 + 0.1]];
      const bright = [1, 0.92, 0.72];
      const dim = [0.22, 0.2, 0.16];
      const points: number[][] = [];
      const colours: number[][] = [];
      for (let i = 0; i < 4; i++) {
        points.push(lens, c[i], c[(i + 1) % 4]);
        colours.push(bright, dim, dim);
      }
      this.filmBeam = new THREE.Mesh(quad(points, colours), film(0.16));
      this.filmBeam.visible = false;
      this.filmBeam.renderOrder = 3;
      this.group.add(this.filmBeam);
    }
  }

  /** The film's progress (0..1), or below 0 when none is on: the picture and the beam show while it plays. */
  setVenueFilm(progress: number): void {
    const on = progress >= 0;
    if (on === this.filmOn) return;
    this.filmOn = on;
    if (this.filmPicture) this.filmPicture.visible = on;
    if (this.filmBeam) this.filmBeam.visible = on;
  }

  /** The picture's colours: a few "scenes" a couple of seconds each, the light flickering a little. */
  private animateFilm(): void {
    const mesh = this.filmPicture;
    if (!mesh || !this.filmOn) return;
    const n = FILM_SCENES.length;
    const scene = Math.floor(Math.abs(this.clock) / 2.3);
    const palette = FILM_SCENES[((scene % n) + n) % n];
    const flicker = 0.92 + 0.08 * Math.sin(this.clock * 23) * Math.sin(this.clock * 7);
    const colours = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    // Vertices 0, 3: bottom front; 1: bottom back; 2, 4: top back; 5: top front. Sky on top, ground below.
    const set = (i: number, c: readonly number[]): void => {
      colours.setXYZ(i, c[0] * flicker, c[1] * flicker, c[2] * flicker);
    };
    set(0, palette[1]); set(3, palette[1]); set(1, palette[2]);
    set(2, palette[0]); set(4, palette[0]); set(5, palette[3]);
    colours.needsUpdate = true;
    if (this.filmBeam) (this.filmBeam.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.04 * flicker;
  }

  /** A table, stool or row of seats bought (or not yet). */
  setVenueGroupOpen(group: number, open: boolean): void {
    const g = this.venueGroups[group];
    if (!g || g.visible === open) return;
    g.visible = open;
    CarriageView.shadowEpoch++;
    if (!open && this.venueDirt[group]) this.venueDirt[group].visible = false;
  }

  /** The plates a diner left on their table (until it is cleared). */
  setVenueDirty(group: number, dirty: boolean): void {
    const g = this.venueDirt[group];
    if (g) g.visible = dirty && !!this.venueGroups[group]?.visible;
  }

  /** What has been bought from the menu and station tiles (by unlock key). */
  setVenueExtras(keys: readonly string[]): void {
    for (const [key, group] of this.venueExtras) {
      const show = keys.includes(key);
      if (group.visible !== show) CarriageView.shadowEpoch++;
      group.visible = show;
    }
  }

  /** Plates the chef has left on the pass. */
  setVenuePass(count: number): void {
    this.passPlates.forEach((p, i) => (p.visible = i < count));
  }

  /**
   * The venue's meter. The bar: its eight bulbs light one by one as drinks are paid for and twinkle through
   * Happy Hour. The dome: a small bubble over the seats while a view is coming up (the last third of the wait).
   */
  setVenueSign(icon: IconName, progress: number, active: boolean): void {
    if (this.barBulbs) {
      this.barParty = active;
      if (!active) this.setBarLit(Math.floor(Math.max(0, Math.min(1, progress)) * this.barBulbCount + 1e-6));
      return;
    }
    const sign = this.layout.venue?.sign;
    if (!sign) return;
    const show = progress > 0.66;
    const ring = Math.round((1 - progress) * 12);
    const key = show ? `${icon}:${ring}` : '';
    if (key === this.venueSignKey) return;
    this.venueSignKey = key;
    if (!show) {
      if (this.venueSign) this.venueSign.visible = false;
      return;
    }
    const texture = bubbleTexture(icon, 'intent', ring);
    if (!this.venueSign) {
      this.venueSign = makeSprite(texture, 0.62);
      this.venueSign.layers.set(WORLD_UI_LAYER);
      this.venueSign.position.set(sign.x, FLOOR_Y + 1.7, sign.z);
      this.group.add(this.venueSign);
    }
    (this.venueSign.material as THREE.SpriteMaterial).map = texture;
    this.venueSign.visible = true;
  }

  private setBarLit(count: number): void {
    if (!this.barBulbs || count === this.barLit) return;
    this.barLit = count;
    const index = this.barBulbs.geometry.index;
    const total = index ? index.count : this.barBulbs.geometry.getAttribute('position').count;
    this.barBulbs.geometry.setDrawRange(0, Math.round((total / this.barBulbCount) * count));
    this.barBulbs.visible = count > 0;
  }

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
    for (const m of [this.filmPicture, this.filmBeam]) (m?.material as THREE.Material | undefined)?.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && !(mesh.userData.shared as boolean)) mesh.geometry.dispose();
    });
  }

  // ─── Static build ──────────────────────────────────────────────────────────

  private *buildStatic(): Generator<void, void, void> {
    const L = CARRIAGE_LENGTH;
    const s = new GeoBuilder();
    const f = new GeoBuilder();
    const liv = new GeoBuilder();
    const trim = new GeoBuilder();
    const glass = new PaneBuilder();
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
      // The trim line stands 2 cm proud of the floor's ends (its end faces never flush with a board's).
      trim.box(side * (HALF_WIDTH - 0.01 - rim / 2), 0.525, L / 2, rim, 0.025, L - TRIM_INSET, '#FFFFFF', 0, FLAT);
      trim.box(0, 0.525, L / 2 + side * ((L - TRIM_INSET) / 2 - rim / 2), HALF_WIDTH * 2 - 0.02 - rim * 2 - 0.004, 0.025, rim, '#FFFFFF', 0, FLAT);
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
    yield;
    yield* floorSteps(f, this.layout, floorTier, this.theme, this.index * 7 + this.layout.type.length);
    yield;
    if (this.tier <= 0) {
      const webs = buildCobwebs(this.cameraSideWindows(), this.index + 3);
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
    // Low bellows (session 15): the camera looks into the next carriage over them.
    for (const x of [-0.74, 0.74]) s.box(x, FLOOR_Y + BELLOWS_HEIGHT / 2, L + GANGWAY_LENGTH / 2, 0.1, BELLOWS_HEIGHT, GANGWAY_LENGTH - 0.02, '#46444D', 0, { pattern: PATTERN.stripesZ, color2: '#3A3840', scale: 0.08, shade: 0.8 });

    yield;
    let n = 0;
    for (const wall of this.layout.walls) {
      this.buildWall(s, liv, trim, glass, lamps, wall);
      if (++n % WALLS_PER_SLICE === 0) yield;
    }
    yield;
    n = 0;
    // A venue's tables and extras are built on their own (they appear when bought): see buildVenue.
    const owned = new Set<PropDef>();
    const venue = this.layout.venue;
    if (venue) {
      for (const g of venue.groups) for (const i of g.props) owned.add(this.layout.props[i]);
      for (const e of venue.extras) for (const i of e.props) owned.add(this.layout.props[i]);
    }
    for (const prop of this.layout.props) {
      if (owned.has(prop)) continue;
      if (prop.kind === 'bed' || prop.kind === 'toilet' || prop.kind === 'sink' || prop.kind === 'bathtub' || prop.kind === 'washShelf') continue;
      if (prop.kind === 'plant' && this.tier < 2) continue;
      s.object(`prop:${prop.kind}`);
      lamps.object(`prop:${prop.kind}~glow`);
      buildProp(s, lamps, prop, this.theme, this.tier);
      s.endObject();
      lamps.endObject();
      if (++n % PROPS_PER_SLICE === 0) yield;
    }
    yield;
    this.buildDecor(s, lamps);
    yield;
    if (this.cls) {
      for (const cabin of this.layout.cabins) {
        buildClassDressing(s, lamps, cabin, this.tier, this.theme);
        yield;
      }
    }
    this.buildDoorFrames(s);
    this.buildSpinners();
    // The dome's glass: its own mesh that throws no shadow (session 21: as part of the shell it laid a dark band
    // over the whole lake side of the room, which read as an empty, unlit half).
    const canopy = new GeoBuilder();
    if (this.layout.type === 'dome') buildDomeCanopy(canopy, -HALF_WIDTH + WALL / 2, FLOOR_Y + this.exteriorHeight(), 0.5, CARRIAGE_LENGTH - 0.5, this.tier);
    yield;

    const add = (builder: GeoBuilder, material: THREE.Material, cast: boolean, receive: boolean, reflect = false): void => {
      if (builder.isEmpty) return;
      const mesh = new THREE.Mesh(builder.build(), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      // The carriage's fixed shell casts into the static moon shadow on the phone tiers (Lighting).
      if (cast) mesh.layers.enable(STATIC_CASTER_LAYER);
      // The outside of the train (paint, glowing windows) is mirrored in the lake on the high tiers.
      if (reflect) mesh.layers.enable(REFLECT_LAYER);
      this.group.add(mesh);
    };
    // Each merge is its own slice: the big ones (the shell, the floor) take a few milliseconds apiece.
    add(s, MATERIALS.solid, true, true);
    add(canopy, MATERIALS.solid, false, true);
    yield;
    add(liv, this.liveryBody, true, true, true);
    add(trim, this.liveryTrim, false, true, true);
    yield;
    add(f, MATERIALS.floor, false, true);
    yield;
    if (!glass.isEmpty) {
      const panes = new THREE.Mesh(glass.build(), MATERIALS.windows);
      panes.layers.enable(REFLECT_LAYER);
      // The glass stops the moon (session 20): through bare openings it laid pale streaks along the corridor
      // floor under every window, which read as stray marks, not moonlight.
      panes.castShadow = true;
      panes.layers.enable(STATIC_CASTER_LAYER);
      this.group.add(panes);
    }
    add(lamps, MATERIALS.lamps, false, false, true);
    yield;
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
    this.setMess(cabin.index, ['newspaper'], 'unmade', 1);
    return mess;
  }

  /**
   * What the last guest left: one thing of theirs on the floor beside the bed (always the same place, clear of
   * the cleaning pad, the tip and the nightstand), then the bed they slept in, in the order they get tidied (the
   * bed last: the big reveal).
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
    const slot = this.messSlot(cabin);
    const piece = pieces[0];
    // Quarter turns only: a piece's square cell stays a square cell.
    if (piece) add((b) => buildMessPiece(b, piece, 0), slot.x, floor, slot.z, Math.floor(rand() * 4) * (Math.PI / 2), MESS_SCALE, piece);
    const r = cabin.bed;
    const w = r.x1 - r.x0 - 0.1;
    const d = r.z1 - r.z0 - 0.3;
    add((b) => buildBedMess(b, w, d, BED_TOP + 0.03, this.blanketColor, shadeHex(this.blanketColor, -26)), (r.x0 + r.x1) / 2, FLOOR_Y, (r.z0 + r.z1) / 2 + 0.1, 0, 1, `bed-${bed}`);
    if (mess.group.visible) this.setDirtFade(cabinIndex, 0, 0);
  }

  /** Where a guest's one floor piece lies: beside the middle of the bed, nudged clear of the tip and the head. */
  private messSlot(cabin: CabinLayout): { x: number; z: number } {
    const bed = cabin.bed;
    const x = bed.x0 - MESS_BESIDE_BED;
    let z = Math.max((bed.z0 + bed.z1) / 2, cabin.room.z0 + MESS_HEAD_CLEAR);
    const tip = cabin.tipPile;
    if (Math.hypot(tip.x - x, tip.z - z) < MESS_TIP_CLEAR) {
      const dx = Math.min(Math.abs(tip.x - x), MESS_TIP_CLEAR);
      const dz = Math.sqrt(MESS_TIP_CLEAR * MESS_TIP_CLEAR - dx * dx);
      const towardHead = tip.z - dz;
      z = towardHead >= cabin.room.z0 + MESS_HEAD_CLEAR ? towardHead : tip.z + dz;
    }
    return { x, z };
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
    this.clock += dt;
    if (this.barBulbs && this.barParty) this.setBarLit(Math.floor(this.clock * 6) % 2 === 0 ? this.barBulbCount : Math.floor(this.clock * 12) % this.barBulbCount);
    this.animateFilm();
    for (let i = 0; i < this.spinners.length; i++) this.spinners[i].rotation.y += dt * (2.6 + (i % 2) * 0.7);
  }

  /** The window openings on the long wall whose inside faces the camera (the lake side), front to back. */
  private cameraSideWindows(): WindowCorner[] {
    const out: WindowCorner[] = [];
    for (const wall of this.layout.walls) {
      if (wall.kind !== 'exterior' || wall.x1 > 0 || wall.z1 - wall.z0 < wall.x1 - wall.x0) continue;
      const { count, slot, width } = windowSpacing(wall.z1 - wall.z0);
      for (let i = 0; i < count; i++) {
        const zc = wall.z0 + slot * (i + 0.5);
        out.push({ x: wall.x1, inward: 1, z0: zc - width / 2, z1: zc + width / 2, top: FLOOR_Y + this.layout.windowBand[1] });
      }
    }
    return out.sort((a, b) => a.z0 - b.z0);
  }

  private frontDepth(): number {
    if (!this.layout.frontNode) return 0;
    let depth = 0;
    for (const room of this.layout.rooms) if (room.z0 <= WALL + 0.01 && room.z1 < CARRIAGE_LENGTH / 2) depth = Math.max(depth, room.z1);
    return depth;
  }

  private buildWall(s: GeoBuilder, liv: GeoBuilder, trim: GeoBuilder, glass: PaneBuilder, lamps: GeoBuilder, wall: WallBox): void {
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
  private sideWall(s: GeoBuilder, liv: GeoBuilder, trim: GeoBuilder, glass: PaneBuilder, lamps: GeoBuilder, r: WallBox): void {
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
    const [WY0, WY1] = this.layout.windowBand;

    // Below and above the windows: solid.
    this.innerFinish(s, inner, FLOOR_Y, FLOOR_Y + WY0, rail);
    this.innerFinish(s, inner, FLOOR_Y + WY1, FLOOR_Y + h, rail);
    liv.slab(outer, 0.38, FLOOR_Y + WY0, white, 0, 0, { shade: 0.85 });
    liv.slab(outer, FLOOR_Y + WY1, FLOOR_Y + h, white, 0, 0, FLAT);
    trim.slab(rect(outer.x0 - (left ? 0.004 : 0), r.z0 + END_INSET, outer.x1 + (left ? 0 : 0.004), r.z1 - END_INSET), FLOOR_Y + 0.28, FLOOR_Y + 0.32, white, 0, 0, FLAT);

    const { count, slot, width } = windowSpacing(len);
    if (count === 0) {
      this.innerFinish(s, inner, FLOOR_Y + WY0, FLOOR_Y + WY1, rail);
      liv.slab(outer, FLOOR_Y + WY0, FLOOR_Y + WY1, white, 0, 0, FLAT);
    } else {
      let cursor = r.z0;
      for (let i = 0; i < count; i++) {
        const zc = r.z0 + slot * (i + 0.5);
        const w0 = zc - width / 2;
        const w1 = zc + width / 2;
        this.innerFinish(s, zr(cursor, w0, inner), FLOOR_Y + WY0, FLOOR_Y + WY1, rail);
        liv.slab(zr(cursor, w0, outer), FLOOR_Y + WY0, FLOOR_Y + WY1, white, 0, 0, FLAT);
        // The glass: a lamplit pane set back in the outer face (curtains painted on it from tier 2) and night
        // glass on the room side; a framed opening with a sash bar outside. Thin quads, so seen from above
        // nothing glows: the light shows on the faces and spills onto the ground (the light map).
        const outerFace = left ? r.x0 : r.x1;
        const out = left ? -1 : 1;
        const y0 = FLOOR_Y + WY0;
        const y1 = FLOOR_Y + WY1;
        glass.paneX(outerFace - out * 0.035, y0, y1, w0, w1, out as 1 | -1, false, fin.curtains ? fin.curtain ?? this.theme.curtain : '#FFFFFF');
        glass.paneX(innerFace - inward * 0.022, y0, y1, w0, w1, inward as 1 | -1, true);
        // The frame stands proud of the outer face (never sharing a face with the panels round it).
        trim.box(outerFace + out * 0.035, y0 - 0.016, zc, 0.07, 0.032, width + 0.1, white, 0, FLAT);
        trim.box(outerFace + out * 0.03, y1 + 0.014, zc, 0.06, 0.028, width + 0.1, white, 0, FLAT);
        for (const pz of [w0 - 0.016, w1 + 0.016]) trim.box(outerFace + out * 0.025, (y0 + y1) / 2, pz, 0.05, y1 - y0 - 0.004, 0.032, white, 0, FLAT);
        trim.box(outerFace - out * 0.026, y0 + (y1 - y0) * 0.64, zc, 0.012, 0.022, width - 0.004, white, 0, FLAT);
        s.box(innerFace + inward * 0.025, FLOOR_Y + WY0 + 0.012, zc, 0.05, 0.024, width + 0.06, fin.cap, 0, FLAT);
        if (fin.curtains) {
          for (const side of [-1, 1]) {
            s.box(innerFace + inward * 0.03, FLOOR_Y + (WY0 + WY1) / 2 + 0.03, zc + side * (width / 2 - 0.02), 0.03, WY1 - WY0 + 0.06, 0.08, fin.curtain ?? this.theme.curtain, 0, { shade: 0.82 });
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
          } else if (fin.globes) {
            // Two white globes stacked on a brass bracket (the bar's Luxury refit).
            s.box(innerFace + inward * 0.03, FLOOR_Y + 0.62, pz, 0.06, 0.02, 0.025, PALETTE.brass, 0, { ...FLAT, surface: 'brass' });
            s.box(innerFace + inward * 0.062, FLOOR_Y + 0.7, pz, 0.014, 0.16, 0.014, PALETTE.brass, 0, { ...FLAT, surface: 'brass' });
            lamps.sphere(innerFace + inward * 0.062, FLOOR_Y + 0.69, pz, 0.042, '#FFF4DE', 1, 1, FLAT);
            lamps.sphere(innerFace + inward * 0.062, FLOOR_Y + 0.8, pz, 0.036, '#FFF4DE', 1, 1, FLAT);
          } else {
            s.box(innerFace + inward * 0.035, FLOOR_Y + 0.72, pz, 0.07, 0.025, 0.025, fin.lamps >= 3 ? PALETTE.brass : fin.cap, 0, FLAT);
            lamps.cylinder(innerFace + inward * 0.09, FLOOR_Y + 0.78, pz, 0.04, 0.065, 0.09, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
          }
        }
        cursor = w1;
      }
      this.innerFinish(s, zr(cursor, r.z1, inner), FLOOR_Y + WY0, FLOOR_Y + WY1, rail);
      liv.slab(zr(cursor, r.z1, outer), FLOOR_Y + WY0, FLOOR_Y + WY1, white, 0, 0, FLAT);
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
    // The stripe stops just short of the gangway opening, so its end never shares a face with the panel's.
    trim.slab(rect(r.x0 + 0.006, outer.z0 - (front ? 0.004 : 0), r.x1 - 0.006, outer.z1 + (front ? 0 : 0.004)), FLOOR_Y + 0.28, FLOOR_Y + 0.32, white, 0, 0, FLAT);
    liv.slab(rect(r.x0, r.z0 - (front ? 0.05 : 0), r.x1, r.z1 + (front ? 0 : 0.05)), FLOOR_Y + h, FLOOR_Y + h + 0.05, white, 0, 0, { shade: 0.92 });
  }

  /** A few touches that grow with the tier: a clock and key rack in the lobby, frames and rugs later. */
  private buildDecor(s: GeoBuilder, lamps: GeoBuilder): void {
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
      // A clock on the front wall, and (once cosy) the pigeon-hole key rack behind the desk.
      s.object('decor:clock');
      s.cylinder(CLOCK_X, FLOOR_Y + 0.74, frontWallZ + 0.01, 0.16, 0.16, 0.03, this.tier >= 3 ? PALETTE.gold : PALETTE.walnut, 18, 'z', FLAT);
      s.cylinder(CLOCK_X, FLOOR_Y + 0.74, frontWallZ + 0.026, 0.13, 0.13, 0.01, PALETTE.linen, 18, 'z', FLAT);
      s.box(CLOCK_X, FLOOR_Y + 0.78, frontWallZ + 0.034, 0.012, 0.08, 0.004, PALETTE.ink, 0, FLAT);
      s.box(CLOCK_X + 0.035, FLOOR_Y + 0.74, frontWallZ + 0.034, 0.07, 0.012, 0.004, PALETTE.ink, 0, FLAT);
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
    // Session 17: no painted queue places. Flat discs over the old boards read as stains, not as a line; the
    // guests waiting in it are the line (and from the Cosy refit the waiting rug frames it).
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
        // Standing a little proud of the wall: where a window falls behind the sink, the mirror hangs in front of
        // its curtains, never in the same plane.
        s.box(INNER - 0.075, FLOOR_Y + 1.0, cz, 0.03, 0.28, 0.46, this.tier >= 3 ? PALETTE.gold : PALETTE.walnut, 0, FLAT);
        s.box(INNER - 0.095, FLOOR_Y + 1.0, cz, 0.01, 0.22, 0.4, '#DDEEF3', 0, FLAT);
      }
    }
  }

  private *buildRooms(): Generator<void, void, void> {
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
      mesh.layers.enable(STATIC_CASTER_LAYER);
      bedGroup.add(mesh);
      bedGroup.position.set(centerX, FLOOR_Y, centerZ);
      this.group.add(bedGroup);
      this.cabinBeds[cabin.index] = bedGroup;

      this.cabinLocks[cabin.index] = this.lockOverlay(cabin.room);
      yield;
      this.buildMess(cabin);
      yield;
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
      mesh.layers.enable(STATIC_CASTER_LAYER);
      group.add(mesh);
      this.group.add(group);
      this.bathroomFixtures[bath.index] = group;
      this.bathroomLocks[bath.index] = this.lockOverlay(bath.room);
      yield;
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
    const x = (PARTITION_X0 + PARTITION_X1) / 2;
    const colour = this.tier <= 0 ? '#A48B72' : this.theme.deep;
    const panel = this.tier <= 0 ? '#B79E84' : shadeHex(this.theme.deep, 18);
    const metal = this.doorMetal();
    // One leaf, one metre long from its hinge (z = 0) toward +z; each instance is scaled to its length. Its face
    // is a raised panel, a brass rail along the top and a handle near the free end, a clear centimetre proud of
    // the leaf (flush trims flicker).
    const leaf = new GeoBuilder()
      .box(0, 0, 0.5, LEAF_THICKNESS, LEAF_HEIGHT, 1, colour, 0, { shade: 0.85 })
      .box(0, -0.03, 0.5, LEAF_THICKNESS + 0.02, LEAF_HEIGHT * 0.55, 0.7, panel, 0, FLAT)
      .box(0, LEAF_HEIGHT / 2 + 0.006, 0.5, LEAF_THICKNESS + 0.01, 0.012, 1, metal, 0, FLAT)
      .box(0, 0.06, 0.88, LEAF_THICKNESS + 0.05, 0.05, 0.03, metal, 0, FLAT)
      .build();
    const mesh = new THREE.InstancedMesh(leaf, MATERIALS.solid, doors.length * 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.leafMesh = mesh;
    doors.forEach((d, i) => {
      const width = d.span[1] - d.span[0];
      const hinges: [number, number] = [d.span[0] + HINGE_INSET, d.span[1] - HINGE_INSET];
      const leafLength = width / 2 - HINGE_INSET - LEAF_MEET_GAP / 2;
      const door: RoomDoor = { kind: d.kind, index: d.index, x, z: (d.span[0] + d.span[1]) / 2, open: -1, locked: false, width, instance: i * 2, hinges, leafLength };
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
    b.box(fx, y + PICTURE_Y, wallZ + 0.012, 0.3, 0.2, 0.02, PALETTE.gold, 0, FLAT);
    b.box(fx, y + PICTURE_Y, wallZ + 0.026, 0.24, 0.14, 0.004, PALETTE.frameCanvas[cabin.index % 4], 0, FLAT);
  }
  if (keys.includes('radio')) {
    // A wall shelf with a wireless, beside the picture.
    const rx = (cabin.room.x0 + 0.42 + nx0) / 2 + 0.04;
    b.object('comfort:radio');
    const sy = y + RADIO_SHELF_Y;
    b.box(rx, sy, wallZ + 0.075, 0.3, 0.02, 0.15, PALETTE.walnutDark, 0, FLAT);
    b.rounded(rx, sy + 0.086, wallZ + 0.075, 0.24, 0.15, 0.11, 0.03, tier >= 3 ? PALETTE.walnut : '#B5835A', { shade: 0.9 });
    b.box(rx - 0.04, sy + 0.086, wallZ + 0.132, 0.1, 0.09, 0.006, '#E9D9B0', 0, FLAT);
    b.cylinder(rx + 0.07, sy + 0.086, wallZ + 0.134, 0.022, 0.022, 0.01, PALETTE.brass, 10, 'z');
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
      buildBureau(b, lamps, r, tier, prop.facing === 'rear');
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
      if (tier >= 4) {
        // A suite's lounge light: a little brass lamp with a silk shade, on the table.
        const lx = cx + 0.13;
        const lz = cz - 0.12;
        b.cylinder(lx, y + 0.735, lz, 0.035, 0.04, 0.03, PALETTE.brass, 10, 'y', { surface: 'brass' });
        b.cylinder(lx, y + 0.8, lz, 0.009, 0.009, 0.11, PALETTE.brass, 6, 'y', { surface: 'brass' });
        lamps.cylinder(lx, y + 0.88, lz, 0.04, 0.065, 0.07, '#F6E6BD', 12, 'y', { shade: 0.9 });
      }
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
    case 'armchair': {
      // A Business Class wingback: buttoned leather in the carriage's colour on turned walnut feet.
      const cover = theme.deep;
      const back = prop.facing === 'right' ? r.x0 + 0.1 : r.x1 - 0.1;
      const seat = prop.facing === 'right' ? 0.05 : -0.05;
      for (const fx of [r.x0 + 0.1, r.x1 - 0.1]) for (const fz of [r.z0 + 0.1, r.z1 - 0.1]) b.cylinder(fx, y + 0.06, fz, 0.025, 0.018, 0.12, PALETTE.walnutDark, 8, 'y', { surface: 'varnish' });
      b.rounded(cx, y + 0.22, cz, w - 0.06, 0.2, d - 0.06, 0.05, cover, { shade: 0.8, surface: 'leather' });
      b.rounded(cx + seat, y + 0.37, cz, w - 0.26, 0.1, d - 0.26, 0.05, shadeHex(cover, 1.12), { shade: 0.95, surface: 'leather' });
      b.rounded(back, y + 0.62, cz, 0.18, 0.62, d - 0.04, 0.07, cover, { shade: 0.85, surface: 'leather' });
      // Wings and arms.
      for (const az of [r.z0 + 0.08, r.z1 - 0.08]) {
        b.rounded(cx, y + 0.44, az, w - 0.08, 0.26, 0.15, 0.06, cover, { shade: 0.85, surface: 'leather' });
        b.rounded(back + (prop.facing === 'right' ? 0.08 : -0.08), y + 0.78, az, 0.16, 0.3, 0.12, 0.05, cover, { shade: 0.85, surface: 'leather' });
      }
      for (let i = 0; i < 3; i++) b.sphere(back + (prop.facing === 'right' ? 0.092 : -0.092), y + 0.56 + (i % 2) * 0.14, cz - 0.16 + i * 0.16, 0.014, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
      b.rounded(cx + seat, y + 0.47, cz, 0.12, 0.16, 0.26, 0.05, PALETTE.pillow, { shade: 0.9, surface: 'fabric' });
      break;
    }
    case 'grandPiano': {
      // Black lacquer, a gold harp and strings under the open case, keys toward the room (−z), a velvet stool.
      const black = '#17151B';
      const lacquer = { shade: 0.9, surface: 'varnish' as const };
      const kz = r.z0 + 0.42;
      const stoolZ = r.z0 + 0.17;
      const x0 = r.x0 + 0.02;
      const width = w - 0.04;
      // The case: one smooth outline (a straight spine on the wall side, the bentside curving in to a round
      // tail), the lid closed, a gold band just under it.
      const len = r.z1 - 0.04 - kz;
      b.add(grandPianoGeometry(width + 0.03, len + 0.03, 0.03), PALETTE.gold, x0 - 0.015, y + 0.905, kz - 0.015, 0, 0, 0, { shade: 1, surface: 'brass' });
      b.add(grandPianoGeometry(width, len, 0.3), black, x0, y + 0.95, kz, 0, 0, 0, lacquer);
      // Keyboard and its cheeks.
      b.box(x0 + width / 2, y + 0.72, kz - 0.09, width, 0.1, 0.18, black, 0, lacquer);
      b.box(x0 + width / 2, y + 0.776, kz - 0.1, width - 0.14, 0.012, 0.13, '#F7F4EC', 0, FLAT);
      for (let k = 0; k < 9; k++) b.box(x0 + 0.1 + k * ((width - 0.2) / 8), y + 0.786, kz - 0.07, 0.03, 0.01, 0.07, '#1A1A1A', 0, FLAT);
      b.box(x0 + width / 2, y + 0.86, kz + 0.02, width - 0.14, 0.12, 0.02, black, 0, lacquer);
      b.box(x0 + width / 2, y + 0.9, kz + 0.035, 0.3, 0.14, 0.01, '#F4EEDC', 0, FLAT);
      // Three legs with gold castors.
      for (const [lx, lz] of [[x0 + 0.08, kz], [x0 + width - 0.08, kz], [x0 + width * 0.3, r.z1 - 0.2]] as [number, number][]) {
        b.cylinder(lx, y + 0.33, lz, 0.035, 0.028, 0.6, black, 8, 'y', lacquer);
        b.sphere(lx, y + 0.025, lz, 0.028, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
      }
      b.cylinder(x0 + width * 0.45, y + 0.45, kz + 0.25, 0.02, 0.02, 0.5, black, 6, 'y', lacquer);
      // The stool.
      b.rounded(x0 + width / 2, y + 0.46, stoolZ, 0.5, 0.08, 0.28, 0.04, theme.deep, { shade: 0.9, surface: 'velvet' });
      for (const dx of [-0.2, 0.2]) for (const dz of [-0.1, 0.1]) b.cylinder(x0 + width / 2 + dx, y + 0.21, stoolZ + dz, 0.018, 0.014, 0.42, PALETTE.gold, 6, 'y', { surface: 'brass' });
      // A candelabra on the case.
      b.cylinder(x0 + 0.14, y + 0.975, kz + 0.2, 0.04, 0.05, 0.04, PALETTE.gold, 8, 'y', { surface: 'brass' });
      for (const dz of [0.12, 0.2, 0.28]) {
        b.cylinder(x0 + 0.14, y + 1.035, kz + dz, 0.012, 0.012, 0.08, PALETTE.gold, 6, 'y', { surface: 'brass' });
        lamps.cylinder(x0 + 0.14, y + 1.115, kz + dz, 0.011, 0.011, 0.08, '#FFF1D0', 6);
      }
      break;
    }
    case 'wardrobe': {
      // The Royal armoire: walnut with gilt mouldings, a mirror in each door, a crown of carving on top.
      const face = prop.facing === 'right' ? r.x1 : r.x0;
      const out = prop.facing === 'right' ? 1 : -1;
      b.box(cx, y + 0.04, cz, w, 0.08, d, PALETTE.walnutDark, 0, { shade: 0.8, surface: 'varnish' });
      b.box(cx - out * 0.01, y + 0.74, cz, w - 0.02, 1.32, d - 0.04, PALETTE.walnut, 0, { shade: 0.82, surface: 'varnish' });
      b.box(cx, y + 1.44, cz, w + 0.04, 0.08, d + 0.04, PALETTE.walnutDark, 0, { shade: 0.9, surface: 'varnish' });
      b.box(cx, y + 1.5, cz, w * 0.5, 0.06, d * 0.5, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
      for (const side of [-1, 1]) {
        const dz = cz + side * d * 0.245;
        b.box(face - out * 0.012, y + 0.76, dz, 0.012, 1.16, d * 0.44, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
        b.box(face - out * 0.003, y + 0.8, dz, 0.012, 0.86, d * 0.34, '#C9D6E2', 0, { shade: 1, surface: 'glass' });
        b.sphere(face + out * 0.012, y + 0.74, cz + side * 0.04, 0.018, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
      }
      break;
    }
    case 'dining': {
      // The Royal Suite's dinner for two: a round table under a white cloth, gilt chairs, a candle and roses.
      const radius = Math.min(w, d) * 0.32;
      b.cylinder(cx, y + 0.36, cz, 0.05, 0.16, 0.72, PALETTE.walnutDark, 12, 'y', { surface: 'varnish' });
      b.cylinder(cx, y + 0.74, cz, radius, radius, 0.03, PALETTE.walnut, 24, 'y', { surface: 'varnish' });
      b.cylinder(cx, y + 0.66, cz, radius + 0.03, radius + 0.06, 0.15, '#F7F3EA', 24, 'y', { shade: 0.95, surface: 'fabric' });
      b.cylinder(cx, y + 0.757, cz, radius + 0.03, radius + 0.03, 0.006, '#F7F3EA', 24, 'y', FLAT);
      for (const side of [-1, 1]) {
        // Place settings: a gold-rimmed plate, a glass.
        const pz = cz + side * radius * 0.55;
        b.cylinder(cx, y + 0.764, pz, 0.085, 0.085, 0.008, '#FBF8F2', 16, 'y', { surface: 'ceramic' });
        b.cylinder(cx, y + 0.769, pz, 0.06, 0.06, 0.004, PALETTE.gold, 16, 'y', { shade: 1, surface: 'brass' });
        b.cylinder(cx + 0.11, y + 0.81, pz - side * 0.06, 0.022, 0.016, 0.09, '#E8EEF2', 8, 'y', { surface: 'glass' });
        // The chair, set back from the table.
        const chz = cz + side * (radius + 0.2);
        b.rounded(cx, y + 0.42, chz, 0.38, 0.06, 0.34, 0.03, theme.deep, { shade: 0.9, surface: 'velvet' });
        for (const fx of [cx - 0.15, cx + 0.15]) for (const fz of [chz - 0.13, chz + 0.13]) b.cylinder(fx, y + 0.2, fz, 0.016, 0.014, 0.4, PALETTE.gold, 6, 'y', { surface: 'brass' });
        const backZ = chz + side * 0.15;
        b.rounded(cx, y + 0.68, backZ, 0.36, 0.46, 0.05, 0.05, PALETTE.gold, { shade: 1, surface: 'brass' });
        b.rounded(cx, y + 0.68, backZ - side * 0.03, 0.28, 0.36, 0.03, 0.05, theme.deep, { shade: 0.9, surface: 'velvet' });
      }
      // A gilt candelabra (the suite's light: there is no ceiling to hang a chandelier from).
      b.cylinder(cx - 0.08, y + 0.8, cz, 0.03, 0.045, 0.08, PALETTE.gold, 8, 'y', { surface: 'brass' });
      b.cylinder(cx - 0.08, y + 0.88, cz, 0.008, 0.008, 0.1, PALETTE.gold, 6, 'y', { surface: 'brass' });
      b.box(cx - 0.08, y + 0.925, cz, 0.016, 0.012, 0.13, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
      for (const dz of [-0.06, 0, 0.06]) {
        b.cylinder(cx - 0.08, y + 0.94, cz + dz, 0.014, 0.01, 0.016, PALETTE.gold, 6, 'y', { surface: 'brass' });
        lamps.cylinder(cx - 0.08, y + 0.99 + (dz === 0 ? 0.02 : 0), cz + dz, 0.009, 0.009, 0.08, '#FFF1D0', 6);
      }
      b.cylinder(cx + 0.06, y + 0.82, cz, 0.025, 0.035, 0.12, '#E8EEF2', 8, 'y', { surface: 'glass' });
      for (let i = 0; i < 3; i++) b.sphere(cx + 0.06 + (i - 1) * 0.03, y + 0.9 + (i % 2) * 0.02, cz + (i - 1) * 0.015, 0.025, '#C0485C', 1, 0.9);
      break;
    }
    default:
      // The venue carriages' furniture (session 20).
      buildVenueProp(b, lamps, prop, theme, tier);
      break;
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
      b.box(vx, top - 0.229, (z0 + z1) / 2, 0.022, 0.018, Math.abs(z1 - z0) - 0.1, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
    } else {
      const vz = z0 + (z0 < cz ? inset : -inset);
      b.box((x0 + x1) / 2, top - 0.13, vz, Math.abs(x1 - x0) - 0.1, 0.18, 0.012, theme.deep, 0, { shade: 0.9, surface: 'velvet' });
      b.box((x0 + x1) / 2, top - 0.229, vz, Math.abs(x1 - x0) - 0.1, 0.018, 0.022, PALETTE.gold, 0, { shade: 1, surface: 'brass' });
    }
  };
  rail(r.x0 + 0.04, r.z0 + 0.04, r.x0 + 0.04, r.z1 - 0.04);
  rail(r.x1 - 0.04, r.z0 + 0.04, r.x1 - 0.04, r.z1 - 0.04);
  rail(r.x0 + 0.04, r.z1 - 0.04, r.x1 - 0.04, r.z1 - 0.04);
}

/**
 * A piece against a wall, described across (out from the wall, toward the room) and along it, then turned to
 * stand on a side wall (`rear` false: out is +x) or the front wall (`rear` true: out is +z).
 */
class WallPiece {
  /** Out from the wall: from `o0` (at the wall) to `face` (the front of the piece). */
  readonly o0: number;
  readonly face: number;
  readonly a0: number;
  readonly a1: number;
  readonly oc: number;
  readonly ac: number;
  /** Depth (out from the wall) and width (along it). */
  readonly w: number;
  readonly d: number;

  constructor(r: Rect, private readonly rear: boolean) {
    this.o0 = rear ? r.z0 : r.x0;
    this.face = rear ? r.z1 : r.x1;
    this.a0 = rear ? r.x0 : r.z0;
    this.a1 = rear ? r.x1 : r.z1;
    this.oc = (this.o0 + this.face) / 2;
    this.ac = (this.a0 + this.a1) / 2;
    this.w = this.face - this.o0;
    this.d = this.a1 - this.a0;
  }

  box(g: GeoBuilder, o: number, y: number, a: number, so: number, h: number, sa: number, color: string, style?: PartStyle): void {
    if (this.rear) g.box(a, y, o, sa, h, so, color, 0, style);
    else g.box(o, y, a, so, h, sa, color, 0, style);
  }

  sphere(g: GeoBuilder, o: number, y: number, a: number, radius: number, color: string, detail = 0, squash = 1, style?: PartStyle): void {
    if (this.rear) g.sphere(a, y, o, radius, color, detail, squash, style);
    else g.sphere(o, y, a, radius, color, detail, squash, style);
  }

  upright(g: GeoBuilder, o: number, y: number, a: number, rTop: number, rBottom: number, h: number, color: string, segments: number, style?: PartStyle): void {
    if (this.rear) g.cylinder(a, y, o, rTop, rBottom, h, color, segments, 'y', style);
    else g.cylinder(o, y, a, rTop, rBottom, h, color, segments, 'y', style);
  }
}

/**
 * The lobby's corner piece, class by class: crates, a cupboard, a bookcase, a bureau, a piano, a gilded
 * piano. Session 15 (owner: "remove the cupboard from the corridor"): it stands on the front wall now
 * (`rear`), out of the way to the cabins.
 */
function buildBureau(b: GeoBuilder, lamps: GeoBuilder, r: Rect, tier: number, rear = false): void {
  const y = FLOOR_Y;
  const p = new WallPiece(r, rear);
  const { oc, ac, w, d, face, a0, a1 } = p;
  if (tier <= 0) {
    // A crate and a battered trunk side by side, waiting to be unpacked (the trunk's iron band stands proud).
    const crate = Math.min(0.42, d * 0.4);
    p.box(b, oc, y + 0.22, a0 + 0.02 + crate / 2, w - 0.02, 0.44, crate, '#A98D6F', { pattern: rear ? PATTERN.stripesX : PATTERN.stripesZ, color2: '#9C8264', scale: 0.12, shade: 0.8, surface: 'wood' });
    const trunk0 = a0 + crate + 0.06;
    p.box(b, oc, y + 0.18, (trunk0 + a1 - 0.02) / 2, w - 0.04, 0.36, a1 - 0.02 - trunk0, '#7C5A45', { shade: 0.8, surface: 'leather' });
    p.box(b, oc, y + 0.37, (trunk0 + a1 - 0.02) / 2, w - 0.02, 0.03, a1 - trunk0, PALETTE.iron, FLAT);
    return;
  }
  if (tier === 1) {
    p.box(b, oc, y + 0.5, ac, w, 1.0, d - 0.1, PALETTE.oakMid, { shade: 0.8, surface: 'wood' });
    p.box(b, face + 0.006, y + 0.5, ac, 0.012, 0.9, 0.01, '#A08868', FLAT);
    for (const da of [-0.12, 0.12]) p.sphere(b, face + 0.02, y + 0.55, ac + da, 0.02, PALETTE.iron, 0);
    return;
  }
  if (tier === 2) {
    // A bookcase, full of colour.
    p.box(b, oc, y + 0.55, ac, w, 1.1, d - 0.1, PALETTE.walnut, { shade: 0.8, surface: 'varnish' });
    const spines = ['#C0485C', '#5E7FA0', '#E5B452', '#6E9C86', '#8E6A8C', '#E08A6E'];
    for (let shelf = 0; shelf < 3; shelf++) {
      let a = a0 + 0.12;
      let k = shelf * 2;
      while (a < a1 - 0.16) {
        const bw = 0.05 + ((k * 7) % 4) * 0.012;
        p.box(b, face - 0.03, y + 0.22 + shelf * 0.32, a + bw / 2, 0.04, 0.24, bw, spines[k % spines.length], FLAT);
        a += bw + 0.008;
        k++;
      }
    }
    return;
  }
  if (tier === 3) {
    // A bureau with drawers and a green-shaded banker's lamp.
    p.box(b, oc, y + 0.4, ac, w, 0.8, d - 0.1, PALETTE.walnut, { shade: 0.8, surface: 'varnish' });
    for (let i = 0; i < 3; i++) {
      p.box(b, face + 0.006, y + 0.16 + i * 0.22, ac, 0.012, 0.18, d - 0.3, PALETTE.walnutDark, FLAT);
      p.sphere(b, face + 0.02, y + 0.16 + i * 0.22, ac, 0.018, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
    }
    p.box(b, oc, y + 0.815, ac, w + 0.02, 0.03, d - 0.08, '#3E5F4E', { shade: 1, surface: 'leather' });
    p.upright(b, oc, y + 0.9, a0 + 0.3, 0.014, 0.05, 0.14, PALETTE.brass, 8, { surface: 'brass' });
    p.upright(lamps, oc, y + 1.0, a0 + 0.3, 0.07, 0.1, 0.06, '#3F8A5E', 12, { shade: 0.9 });
    return;
  }
  buildPiano(b, lamps, r, tier, rear);
}

/** An upright piano: black lacquer (ivory and gold in the Royal Suite), its keys toward the room. */
function buildPiano(b: GeoBuilder, lamps: GeoBuilder, r: Rect, tier: number, rear = false): void {
  const y = FLOOR_Y;
  const p = new WallPiece(r, rear);
  const { oc, ac, w, d, face, a0 } = p;
  const body = tier >= 5 ? '#F2EDE4' : '#1C1A20';
  const trim = PALETTE.gold;
  p.box(b, oc, y + 0.62, ac, w, 1.24, d - 0.1, body, { shade: 0.85, surface: 'varnish' });
  // The keyboard stands only 10 cm proud of the case: nothing to walk round.
  p.box(b, face + 0.05, y + 0.72, ac, 0.1, 0.06, d - 0.14, body, { shade: 1, surface: 'varnish' });
  p.box(b, face + 0.065, y + 0.755, ac, 0.06, 0.012, d - 0.2, '#F7F4EC', FLAT);
  for (let i = 0; i < 7; i++) p.box(b, face + 0.06, y + 0.768, a0 + 0.2 + i * ((d - 0.4) / 6), 0.04, 0.012, 0.03, '#1A1A1A', FLAT);
  p.box(b, face + 0.006, y + 1.1, ac, 0.012, 0.03, d - 0.12, trim, { shade: 1, surface: 'brass' });
  p.box(b, face + 0.006, y + 0.35, ac, 0.012, 0.03, d - 0.12, trim, { shade: 1, surface: 'brass' });
  // Music stand, and candles (a candelabra in the Royal Suite).
  p.box(b, face - 0.03, y + 0.95, ac, 0.02, 0.2, 0.36, '#F4EEDC', FLAT);
  const candles = tier >= 5 ? [-0.3, -0.15, 0.15, 0.3] : [-0.3, 0.3];
  for (const da of candles) {
    p.upright(b, oc, y + 1.3, ac + da, 0.02, 0.03, 0.08, trim, 8, { surface: 'brass' });
    p.upright(lamps, oc, y + 1.39, ac + da, 0.014, 0.014, 0.1, '#FFF1D0', 8);
  }
}

/**
 * What a cabin's class adds, placed where it can never touch the cleaning pad, the mess or the tip pile: a
 * writing desk with a reading lamp on the corridor wall past the door (Business and up), and at the foot of the
 * bed a stool with a hurricane lantern (Basic), a luggage bench (Comfort), a minibar (Business), a velvet ottoman
 * and champagne on ice (First) or a slipper bath (Royal).
 */
function buildClassDressing(b: GeoBuilder, lamps: GeoBuilder, cabin: CabinLayout, tier: number, theme: CarriageTheme): void {
  const y = FLOOR_Y;
  const room = cabin.room;
  const bed = cabin.bed;
  // Session 17: no hanging lights. The roof is cut away, so a lamp on a wire hung from nothing above the walls
  // (and threw a dark disc onto the floor). Each class's light stands on its furniture instead: a lantern on the
  // stool, a reading lamp on the desk, a lamp on the lounge table, a candelabra on the dinner table.

  // Business and up: a writing desk on the corridor wall, past the door, with a reading lamp (never longer
  // than a desk, however long the suite).
  if (tier >= 3) {
    const z0 = cabin.door[1] + 0.06;
    const z1 = Math.min(room.z1 - 0.05, z0 + 0.95);
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

  // At the foot of the bed (in a suite, just there: the lounge is further on).
  const fz0 = bed.z1 + 0.05;
  const fz1 = Math.min(room.z1 - 0.04, fz0 + 0.62);
  if (fz1 - fz0 < 0.3) return;
  const fzc = (fz0 + fz1) / 2;
  const fd = fz1 - fz0;
  if (tier <= 1) {
    b.object('class:stool');
    lamps.object('class:stool~glow');
    const sx = bed.x0 + 0.35;
    b.cylinder(sx, y + 0.4, fzc, 0.16, 0.16, 0.04, tier <= 0 ? '#9C8570' : PALETTE.oakMid, 12, 'y', { surface: 'wood' });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.cylinder(sx + Math.cos(a) * 0.1, y + 0.2, fzc + Math.sin(a) * 0.1, 0.015, 0.015, 0.4, tier <= 0 ? '#8E7560' : PALETTE.walnut, 6, 'y', { surface: 'wood' });
    }
    // The berth's light: a hurricane lantern on the stool (iron, then brass once repaired), its glass lit.
    const metal = tier <= 0 ? PALETTE.iron : PALETTE.brass;
    const lx = sx - 0.04;
    b.cylinder(lx, y + 0.435, fzc, 0.05, 0.055, 0.03, metal, 10, 'y', { surface: tier <= 0 ? 'matte' : 'brass' });
    lamps.cylinder(lx, y + 0.5, fzc, 0.032, 0.04, 0.1, PALETTE.lampShade, 10, 'y', { shade: 0.95 });
    b.cylinder(lx, y + 0.565, fzc, 0.045, 0.03, 0.03, metal, 10, 'y', { surface: tier <= 0 ? 'matte' : 'brass' });
    b.cylinder(lx, y + 0.6, fzc, 0.006, 0.006, 0.05, metal, 4);
    b.endObject();
    lamps.endObject();
    return;
  }
  if (tier === 2) {
    // A luggage bench: oak slats on brass legs, with a little case in the carriage's colour.
    const lx0 = bed.x0 + 0.1;
    const lx1 = Math.min(bed.x1 - 0.1, lx0 + 0.8);
    const ld = Math.min(fd, 0.34);
    b.object('class:bench');
    b.box((lx0 + lx1) / 2, y + 0.38, fzc, lx1 - lx0, 0.04, ld, PALETTE.oakMid, 0, { shade: 0.9, surface: 'varnish' });
    for (const lx of [lx0 + 0.05, lx1 - 0.05]) for (const dz of [-ld / 2 + 0.05, ld / 2 - 0.05]) b.cylinder(lx, y + 0.18, fzc + dz, 0.016, 0.016, 0.36, PALETTE.brass, 6, 'y', { surface: 'brass' });
    const cx = lx0 + 0.3;
    b.rounded(cx, y + 0.511, fzc, 0.44, 0.22, ld - 0.08, 0.04, theme.deep, { shade: 0.9, surface: 'leather' });
    b.box(cx, y + 0.635, fzc, 0.12, 0.025, 0.03, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
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
  b.rounded(tcx, y + 0.525, fzc, tx1 - tx0 - 0.14, 0.02, td - 0.14, 0.14, '#BFE0EC', { shade: 1, surface: 'glass' });
  for (const fx of [tx0 + 0.12, tx1 - 0.12]) for (const dz of [-td / 2 + 0.1, td / 2 - 0.1]) b.sphere(fx, y + 0.05, fzc + dz, 0.045, PALETTE.gold, 0, 1, { shade: 1, surface: 'brass' });
  b.cylinder(tx1 - 0.08, y + 0.62, fzc, 0.016, 0.016, 0.2, PALETTE.gold, 6, 'y', { surface: 'brass' });
  b.box(tx0 + 0.18, y + 0.53, fzc, 0.24, 0.05, 0.16, theme.blanket, 0, { shade: 0.95, surface: 'fabric' });
  b.endObject();
}

/**
 * A grand piano's case seen from above: x 0..w across (the spine at 0), z 0..l from the keyboard to the
 * tail, top at y 0 and `h` deep below it. A fresh geometry each call (GeoBuilder.add bakes it in place).
 */
function grandPianoGeometry(w: number, l: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, l * 0.9);
  shape.quadraticCurveTo(0, l, w * 0.18, l);
  shape.bezierCurveTo(w * 0.42, l, w * 0.48, l * 0.72, w * 0.62, l * 0.55);
  shape.bezierCurveTo(w * 0.78, l * 0.38, w, l * 0.38, w, l * 0.22);
  shape.lineTo(w, 0);
  shape.lineTo(0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 14 });
  // Shape (u, v) → floor (x, z); the extrusion runs downward from y 0.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
