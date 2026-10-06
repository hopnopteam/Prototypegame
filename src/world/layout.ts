import { rect, type CarriageType, type Rect, type Vec2 } from '../core/types';

/**
 * Carriage floor plans as pure data: rooms, doorways, furniture footprints, walls, nav nodes and anchors.
 * The renderer, collision, pathfinding and gameplay all read these, so what you see is what you walk.
 * Local coordinates: x across the carriage (+x = platform side), z along it (0 = front end).
 */

/**
 * Session 20 (owner: "no single train is this wide… the train feeling so wide just feels off"): carriages are
 * 18 m long and 5 m wide (were 14 m by 6.4 m). About the same floor to walk on, in a train's proportions.
 */
export const CARRIAGE_LENGTH = 18;
export const GANGWAY_LENGTH = 1.2;
export const CARRIAGE_PITCH = CARRIAGE_LENGTH + GANGWAY_LENGTH;
/**
 * Half the carriage's width. Session 14 (owner: "a bit wider so there's more breathing area"): 5.4 m across
 * (was 4.4). Session 19: 6.4 m. Session 20: 5 m, the length doing the work (see CARRIAGE_LENGTH).
 */
export const HALF_WIDTH = 2.5;
export const WALL = 0.16;
export const INNER = HALF_WIDTH - WALL;
/**
 * How far each outer wall has moved since the floor plans were drawn (at 5.4 m; inward now): furniture that
 * stands against an outer wall moves with it (`out`), so it keeps its size.
 */
const GROW = HALF_WIDTH - 2.7;
/** An x drawn against an outer wall, moved out with that wall (left of the middle moves left, right moves right). */
const out = (x: number): number => (x < 0 ? x - GROW : x + GROW);
/**
 * Corridor runs along the left; rooms sit to the right of this partition. Session 15 (owner: "make more room
 * to walk around"): 1.62 m (was 1.44), so two people pass without either stopping. Session 20: 1.6 m, rooms
 * 2.94 m deep and longer along the train.
 */
export const PARTITION_X0 = -0.74;
export const PARTITION_X1 = -0.6;
/**
 * Room doorways: wide and in the middle of the room's wall, so you walk straight in onto the room's work spot
 * without threading a needle (bi-parting doors slide into the wall on both sides as you come).
 */
export const ROOM_DOOR_WIDTH = 1.4;
/** A doorway centred on a room's corridor wall. */
const centredDoor = (z0: number, z1: number): [number, number] => [(z0 + z1) / 2 - ROOM_DOOR_WIDTH / 2, (z0 + z1) / 2 + ROOM_DOOR_WIDTH / 2];
export const EXTERIOR_WALL_HEIGHT = 1.1;
/**
 * Walls between rooms stop at knee height (session 15, was 0.85 m): from the camera's angle a taller wall hid
 * the floor just behind it, and with it the pads, tiles, mess and guests there. The floor plan still reads at
 * a glance, like a dolls' house with the front walls cut down.
 */
export const INTERIOR_WALL_HEIGHT = 0.52;
/**
 * Room doors (session 16): two hinged leaves per doorway that swing into the room (the partition beside a
 * doorway is too short for sliding leaves to clear it). A hinge sits `hingeInset` inside its door post, the
 * leaves meet with `meetGap` between them, an open door swings `swing` radians, a leaf is `thickness` thick.
 * `tests/doors.test.ts` sweeps every leaf through its swing in every floor plan.
 */
export const ROOM_DOOR = { hingeInset: 0.04, meetGap: 0.01, swing: Math.PI * 0.47, thickness: 0.035 };
/**
 * The rear end wall faces the camera (it looks down the train from the back): cut down to a low sill so the
 * end of every carriage, where its improvement and staff tiles stand, is in full view.
 */
export const CUTAWAY_WALL_HEIGHT = 0.36;
export const GANGWAY_HALF = 0.7;
export const DOOR_Z0 = 0.8;
export const DOOR_Z1 = 2.2;
export const LOCOMOTIVE_LENGTH = 10;
export const REAR_DECK_LENGTH = 2.4;
/**
 * Depth of the rear vestibule; everything else in a carriage ends before it. Deep enough (session 15, was
 * 1.3 m) for the improvement and staff tiles either side of the gangway to stand clear of every wall.
 */
export const REAR_VESTIBULE = 1.5;
/** Where the rear vestibule's tiles stand: either side of the gangway, in full view (see tests/visibility). */
export const REAR_TILE_Z = CARRIAGE_LENGTH - 0.95;
export const REAR_TILE_X = 1.35;
export const INTERIOR_END = CARRIAGE_LENGTH - REAR_VESTIBULE - 0.06;
export const PLATFORM_X0 = HALF_WIDTH + 0.25;
export const PLATFORM_WIDTH = 6.5;

/** The lobby queue: slot 0 at the desk, a row across the lobby, then back along a second row. */
export const QUEUE_SLOTS: Vec2[] = [
  { x: -0.3, z: 3.0 }, { x: 0.42, z: 3.0 }, { x: 1.14, z: 3.0 },
  { x: 1.14, z: 3.8 }, { x: 0.42, z: 3.8 }, { x: -0.3, z: 3.8 },
];

export type PropKind =
  | 'bed' | 'desk' | 'urn' | 'linen' | 'rack' | 'bin' | 'toilet' | 'sink' | 'bathtub'
  | 'shelfTowel' | 'shelfRoll' | 'crateBay' | 'bench' | 'luggageRack' | 'plant' | 'lamp' | 'washShelf'
  | 'closet' | 'laundry' | 'table' | 'sofa' | 'bureau' | 'armchair' | 'wardrobe' | 'grandPiano' | 'dining';

export interface PropDef {
  kind: PropKind;
  rect: Rect;
  /** Which way the prop faces, for props that have a front. */
  facing?: 'left' | 'right' | 'front' | 'rear';
}

export interface WallBox extends Rect {
  height: number;
  kind: 'exterior' | 'interior';
}

export interface Connector {
  rect: Rect;
  /** Direction of travel through the connector; it is only narrowed across this axis. */
  axis: 'x' | 'z';
  /** Platform doors only open during station stops. */
  door?: boolean;
}

/**
 * How a room is furnished, by class: a Basic berth (a narrow cot in a short room), a Comfort cabin, a Business
 * cabin (a double bed and an armchair), a First Class suite (a grand bed and a lounge), the Royal Suite (a
 * four-poster, a lounge, a piano and a dining table: the whole carriage).
 */
export type RoomStyle = 'berth' | 'cabin' | 'business' | 'first' | 'royal';

export interface CabinLayout {
  index: number;
  style: RoomStyle;
  room: Rect;
  doorZ: number;
  /** The doorway in the partition (z range); a sliding door fills it when nobody is near. */
  door: [number, number];
  bed: Rect;
  spots: Vec2[];
  center: Vec2;
  bedPose: Vec2;
  tipPile: Vec2;
  corridorNode: string;
  node: string;
}

export interface BathroomLayout {
  index: number;
  room: Rect;
  doorZ: number;
  door: [number, number];
  restock: Vec2;
  useSpot: Vec2;
  node: string;
  useNode: string;
}

export interface DoorLayout {
  z0: number;
  z1: number;
  inside: Vec2;
  outside: Vec2;
  insideNode: string;
  outsideNode: string;
}

export interface NavNodeDef {
  id: string;
  x: number;
  z: number;
}

export interface NavEdgeDef {
  a: string;
  b: string;
  door?: boolean;
}

export interface CarriageLayout {
  type: CarriageType;
  length: number;
  rooms: Rect[];
  connectors: Connector[];
  blocked: Rect[];
  walls: WallBox[];
  props: PropDef[];
  cabins: CabinLayout[];
  bathrooms: BathroomLayout[];
  anchors: Record<string, Vec2>;
  queue: Vec2[];
  nodes: NavNodeDef[];
  edges: NavEdgeDef[];
  doors: DoorLayout[];
  frontNode: string | null;
  rearNode: string;
}

class LayoutBuilder {
  readonly layout: CarriageLayout;

  constructor(type: CarriageType) {
    this.layout = {
      type, length: CARRIAGE_LENGTH, rooms: [], connectors: [], blocked: [], walls: [], props: [],
      cabins: [], bathrooms: [], anchors: {}, queue: [], nodes: [], edges: [], doors: [], frontNode: null, rearNode: 'vest_rear',
    };
  }

  room(x0: number, z0: number, x1: number, z1: number): void {
    this.layout.rooms.push(rect(x0, z0, x1, z1));
  }

  connector(x0: number, z0: number, x1: number, z1: number, axis: 'x' | 'z', door = false): void {
    this.layout.connectors.push({ rect: rect(x0, z0, x1, z1), axis, door });
  }

  prop(kind: PropKind, x0: number, z0: number, x1: number, z1: number, facing?: PropDef['facing'], blocks = true): void {
    const r = rect(x0, z0, x1, z1);
    this.layout.props.push({ kind, rect: r, facing });
    if (blocks) this.layout.blocked.push(r);
  }

  wall(x0: number, z0: number, x1: number, z1: number, kind: WallBox['kind'] = 'interior', height = kind === 'exterior' ? EXTERIOR_WALL_HEIGHT : INTERIOR_WALL_HEIGHT): void {
    this.layout.walls.push({ ...rect(x0, z0, x1, z1), height, kind });
  }

  /** A wall along z from z0 to z1 at [x0,x1], leaving the given gaps open. */
  wallAlongZ(x0: number, x1: number, z0: number, z1: number, gaps: [number, number][], kind: WallBox['kind']): void {
    let cursor = z0;
    for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (g0 > cursor) this.wall(x0, cursor, x1, g0, kind);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < z1) this.wall(x0, cursor, x1, z1, kind);
  }

  /** A wall across x from x0 to x1 at [z0,z1], leaving the given gaps open. */
  wallAlongX(z0: number, z1: number, x0: number, x1: number, gaps: [number, number][], kind: WallBox['kind'], height?: number): void {
    let cursor = x0;
    for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (g0 > cursor) this.wall(cursor, z0, g0, z1, kind, height);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < x1) this.wall(cursor, z0, x1, z1, kind, height);
  }

  node(id: string, x: number, z: number): string {
    this.layout.nodes.push({ id, x, z });
    return id;
  }

  edge(a: string, b: string, door = false): void {
    this.layout.edges.push({ a, b, door });
  }

  chain(...ids: string[]): void {
    for (let i = 1; i < ids.length; i++) this.edge(ids[i - 1], ids[i]);
  }

  anchor(name: string, x: number, z: number): void {
    this.layout.anchors[name] = { x, z };
  }

  /** Shell: exterior walls, end walls with gangway gaps, and platform doors. */
  shell(options: { frontGangway: boolean; doors: boolean }): void {
    const L = CARRIAGE_LENGTH;
    const doorGaps: [number, number][] = options.doors ? [[DOOR_Z0, DOOR_Z1]] : [];
    this.wallAlongZ(-HALF_WIDTH, -INNER, 0, L, [], 'exterior');
    this.wallAlongZ(INNER, HALF_WIDTH, 0, L, doorGaps, 'exterior');
    // End walls run between the side walls: the corners belong to the side walls alone (overlapping shells
    // would put two coplanar faces at every corner, which flicker).
    this.wallAlongX(0, WALL, -INNER, INNER, options.frontGangway ? [[-GANGWAY_HALF, GANGWAY_HALF]] : [], 'exterior');
    this.wallAlongX(L - WALL, L, -INNER, INNER, [[-GANGWAY_HALF, GANGWAY_HALF]], 'exterior', CUTAWAY_WALL_HEIGHT);

    if (options.doors) {
      const doorZ = (DOOR_Z0 + DOOR_Z1) / 2;
      const inside = this.node('door_in', INNER - 0.9, doorZ);
      const outside = this.node('door_out', PLATFORM_X0 + 0.9, doorZ);
      this.edge(inside, outside, true);
      this.connector(INNER - 0.5, DOOR_Z0, PLATFORM_X0 + 0.6, DOOR_Z1, 'x', true);
      this.layout.doors.push({
        z0: DOOR_Z0, z1: DOOR_Z1,
        inside: { x: INNER - 0.9, z: doorZ }, outside: { x: PLATFORM_X0 + 0.9, z: doorZ },
        insideNode: inside, outsideNode: outside,
      });
    }
  }

  /** Front and rear vestibules with the gangway connectors. */
  vestibules(frontDepth: number): void {
    const L = CARRIAGE_LENGTH;
    if (frontDepth > 0) {
      this.room(-INNER, WALL, INNER, frontDepth);
      this.layout.frontNode = this.node('vest_front', 0, Math.max(WALL + 0.4, frontDepth * 0.5));
    }
    this.room(-INNER, L - REAR_VESTIBULE, INNER, L - WALL);
    this.node('vest_rear', 0, L - 0.6);
    // Rear gangway toward the next carriage (or the rear deck on the last carriage).
    this.connector(-GANGWAY_HALF, L - 0.8, GANGWAY_HALF, L + GANGWAY_LENGTH + 0.8, 'z');
  }

  /**
   * Rooms on the right of a corridor, between z0 and z1, furnished in a class's style. The corridor stays on
   * the left whatever the class (it is the way through the train); fewer, longer rooms as the class rises.
   */
  rooms(z0: number, z1: number, count: number, corridorEntryNode: string, style: RoomStyle): void {
    const len = (z1 - z0) / count;
    const partitionGaps: [number, number][] = [];
    this.connector(-INNER, z0 - 0.5, PARTITION_X0, z1 + 0.55, 'z');
    let previousCorridor = corridorEntryNode;

    for (let c = 0; c < count; c++) {
      const cz0 = z0 + c * len;
      const cz1 = cz0 + len;
      const [doorZ0, doorZ1] = centredDoor(cz0, cz1);
      const doorZ = (doorZ0 + doorZ1) / 2;
      partitionGaps.push([doorZ0, doorZ1]);

      // Divider wall at the front of each room (the last room also gets one at its rear).
      this.wall(PARTITION_X1, cz0 - 0.06, INNER, cz0 + 0.06);
      if (c === count - 1) this.wall(PARTITION_X1, cz1 - 0.06, INNER, cz1 + 0.06);

      const room = rect(PARTITION_X1, cz0 + 0.06, INNER, cz1 - 0.06);
      this.room(room.x0, room.z0, room.x1, room.z1);
      this.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');

      // The bed against the outer wall: wider and grander with each class.
      const bedWidth = { berth: 0.92, cabin: 1.05, business: 1.35, first: 1.45, royal: 1.62 }[style];
      const bedLength = style === 'berth' ? Math.min(1.72, len - 0.22) : style === 'cabin' ? Math.min(1.85, len - 0.4) : 1.95;
      const bedStart = style === 'royal' && len > 6 ? cz0 + 0.45 : cz0 + (style === 'berth' ? 0.1 : 0.18);
      const bed = rect(INNER - bedWidth, bedStart, INNER, bedStart + bedLength);
      this.prop('bed', bed.x0, bed.z0, bed.x1, bed.z1, 'front');

      // What each class keeps at the foot of the bed (a bench, a minibar, an ottoman, a slipper bath: drawn
      // by the carriage view) is solid too, so nobody walks through it.
      const footZ0 = bed.z1 + 0.05;
      const footZ1 = Math.min(cz1 - 0.04, footZ0 + 0.62);
      if (footZ1 - footZ0 >= 0.3) this.layout.blocked.push(rect(bed.x0 + 0.06, footZ0, INNER, footZ1));

      // The bigger rooms get a lounge beyond the bed (kept off the walk from the door to the room's heart).
      if (style === 'business' && len > 3.2) this.prop('armchair', INNER - 0.72, cz1 - 0.92, INNER - 0.04, cz1 - 0.2, 'left');
      if ((style === 'first' || style === 'royal') && len > 5) {
        // The sofa starts clear of whatever stands at the foot of the bed (the Royal slipper bath).
        const sofa = rect(INNER - 0.62, Math.max(cz1 - 2.5, footZ1 + 0.1), INNER - 0.04, cz1 - 0.95);
        const table = rect(INNER - 1.38, cz1 - 2.05, INNER - 0.86, cz1 - 1.4);
        this.prop('sofa', sofa.x0, sofa.z0, sofa.x1, sofa.z1, 'left');
        this.prop('table', table.x0, table.z0, table.x1, table.z1);
      }
      if (style === 'royal' && len > 9) {
        // The grand suite: a dining table for two near the middle and a piano against the partition.
        const dcx = (PARTITION_X1 + INNER) / 2 + 0.3;
        const dining = rect(dcx - 0.5, cz0 + len * 0.5 - 0.55, dcx + 0.5, cz0 + len * 0.5 + 0.55);
        this.prop('dining', dining.x0, dining.z0, dining.x1, dining.z1);
        // A grand piano in the far corner, its keys (and the stool) toward the room.
        this.prop('grandPiano', PARTITION_X1 + 0.04, cz1 - 2.0, PARTITION_X1 + 1.0, cz1 - 0.1, 'front');
        // A tall armoire on the corridor wall between the writing desk (past the door, at most 0.95 m long)
        // and the piano.
        const armoireZ0 = Math.max(cz1 - 3.6, doorZ1 + 0.06 + 0.95 + 0.1);
        this.prop('wardrobe', PARTITION_X1 + 0.02, armoireZ0, PARTITION_X1 + 0.46, Math.min(armoireZ0 + 1.1, cz1 - 2.08), 'right');
      }

      const corridorNode = this.node(`corr_${c}`, (-INNER + PARTITION_X0) / 2, doorZ);
      const cabinNode = this.node(`cabin_${c}`, PARTITION_X1 + 0.92, doorZ + 0.1);
      this.chain(previousCorridor, corridorNode);
      this.edge(corridorNode, cabinNode);
      previousCorridor = corridorNode;
      if (len > 4) {
        // A suite is long: a waypoint in the lane beside the foot of the bed, so a walk from the door to the
        // bedside (or the tips left by its head) goes round the bed, not through the wall.
        const laneX = (PARTITION_X1 + 0.06 + bed.x0) / 2;
        this.edge(cabinNode, this.node(`bed_${c}`, laneX, bed.z1 + 0.14));
      }

      // The walk-in beside the bed: one spot in its middle is where you clean, deliver and build. In a long
      // suite it is just inside the door, where the walk from the corridor ends.
      const openX0 = PARTITION_X1 + 0.32;
      const openX1 = bed.x0 - 0.42;
      // Nearer the room's front wall than its back one: the camera looks over the back wall (the next room's
      // front), and the pad must stay clear of the strip of floor that wall hides (tests/visibility).
      const heartZ = len > 4 ? doorZ : cz0 + len * 0.45;
      const heart = { x: Math.min((openX0 + openX1) / 2, PARTITION_X1 + 1.1), z: heartZ };
      // Tips: the far corner of a small room; in a suite, by the head of the bed (the heart is at the door).
      const tipZ = style === 'berth' ? cz1 - 0.38 : len > 4 ? bed.z0 + 0.62 : cz1 - 0.42;
      this.layout.cabins.push({
        index: c,
        style,
        room,
        doorZ,
        door: [doorZ0, doorZ1],
        bed,
        spots: [{ ...heart }],
        center: { ...heart },
        bedPose: { x: (bed.x0 + bed.x1) / 2, z: (bed.z0 + bed.z1) / 2 },
        tipPile: { x: len > 4 ? bed.x0 - 0.36 : Math.max(openX0 + 0.1, Math.min(openX1, bed.x0 - 0.42)), z: tipZ },
        corridorNode,
        node: cabinNode,
      });
    }

    this.wallAlongZ(PARTITION_X0, PARTITION_X1, z0, z1, partitionGaps, 'interior');
    // Corner waypoint: the corridor only meets the vestibule at its end, so paths must turn here.
    this.node('corr_end', (-INNER + PARTITION_X0) / 2, CARRIAGE_LENGTH - REAR_VESTIBULE + 0.35);
    this.chain(previousCorridor, 'corr_end', 'vest_rear');
  }
}

/** Rooms per passenger carriage and their style, by class (refit tier 0–1 Basic … 5 Royal Suite). */
const LOBBY_ROOMS: [number, RoomStyle][] = [[3, 'berth'], [3, 'berth'], [2, 'cabin'], [2, 'business'], [2, 'first'], [1, 'royal']];
const SLEEPER_ROOMS: [number, RoomStyle][] = [[6, 'berth'], [6, 'berth'], [4, 'cabin'], [3, 'business'], [2, 'first'], [1, 'royal']];

/** How many rooms a passenger carriage has at a refit tier (the economy and the tiles use this). */
export function roomsAt(type: CarriageType, tier: number): number {
  const table = type === 'lobby' ? LOBBY_ROOMS : type === 'sleeper' ? SLEEPER_ROOMS : null;
  if (!table) return 0;
  return table[Math.min(table.length - 1, Math.max(0, tier))][0];
}

function buildLobby(tier: number): CarriageLayout {
  const b = new LayoutBuilder('lobby');
  // A generous reception (8.6 m) and the cabins behind it.
  const lobbyEnd = 8.6;
  const cabinsEnd = INTERIOR_END;
  b.shell({ frontGangway: false, doors: true });
  b.vestibules(0);
  b.room(-INNER, WALL, INNER, lobbyEnd);

  // Front counter along the end wall: the tea urn and the linen cupboard, pads centred in front. The
  // reception desk stands on the left facing the door with a staff lane behind it; the queue snakes in
  // front of it across open floor; the luggage rack and bin line the right wall toward the cabins.
  // The desk spans the queue's two rows, so the rug in front of it lines up with it end to end; a clear
  // lane runs round the queue on every side (to the door, the counter, the rack and the cabins).
  b.prop('desk', -1.55, 2.55, -0.79, 4.25, 'right');
  b.prop('urn', -INNER, WALL, out(-1.45), 0.66, 'rear');
  b.prop('linen', -0.6, WALL, 0.9, 0.62, 'rear');
  b.prop('rack', out(1.9), 5.9, INNER, 7.65, 'left');
  b.prop('bin', out(2.12), 4.9, INNER, 5.3, 'left');
  b.prop('plant', out(2.06), WALL, INNER, 0.55, 'left', false);
  // A slim piece on the front wall, between the linen cupboard and the plant, that grows with the class
  // (crates, a cupboard, a bookcase, a bureau, then a piano). Session 15 (owner: "remove the cupboard from
  // the corridor"): it used to stand where the corridor starts and pinched the way to the cabins.
  b.prop('bureau', 0.98, WALL + 0.012, 1.72, 0.51, 'rear');

  // The staff lane behind the desk runs between it and the outer wall.
  const lane = (-INNER + -1.55) / 2;
  b.anchor('deskService', lane, 3.4);
  b.anchor('deskCash', lane, 4.75);
  b.anchor('startCash', -1.75, 5.55);
  b.anchor('playerSpawn', 0.0, 5.25);
  b.anchor('urn', out(-2.0), 1.12);
  b.anchor('linen', 0.15, 1.12);
  b.anchor('blanket', 0.15, 1.12);
  b.anchor('pillow', 0.15, 1.12);
  b.anchor('rack', out(1.3), 6.75);
  b.anchor('bin', out(1.66), 5.1);
  b.anchor('home_attendant', 0.0, 6.9);
  b.anchor('tile_up_attendant', 0.0, 6.9);
  // The porter's post is at the carriage's back door, out of the busy lobby.
  b.anchor('home_porter', -REAR_TILE_X, REAR_TILE_Z);
  // Between jobs the porter waits behind the desk, like a receptionist, not in the gangway everyone uses.
  b.anchor('idle_porter', lane, 2.15);
  b.anchor('tile_up_porter', -REAR_TILE_X, REAR_TILE_Z);
  b.anchor('tile_refurb', REAR_TILE_X, REAR_TILE_Z);
  b.anchor('stackItems', 0.9, 1.3);

  // One tidy snake from the desk, each place painted on the floor (drawn by CarriageView).
  b.layout.queue = QUEUE_SLOTS.map((p) => ({ ...p }));

  const doorIn = 'door_in';
  b.node('lobby_front', 0.3, 1.6);
  b.node('lobby_fl', lane, 1.6);
  b.node('desk', lane, 3.4);
  // Clear of the desk and of the back corner's piece, so the walk from the desk to the cabins is never pinched.
  b.node('lobby_rl', -1.75, 4.95);
  b.node('lobby_rear', 0.4, 4.95);
  b.node('rack', out(1.3), 6.75);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, lobbyEnd - 0.1);
  // The desk is reached from behind (lobby_rl), so guests never walk through the staff side.
  b.chain(doorIn, 'lobby_front', 'lobby_fl');
  b.chain('desk', 'lobby_rl', 'corr_in');
  b.chain('lobby_front', 'lobby_rear', 'rack');
  b.edge('lobby_rl', 'lobby_rear');

  const [count, style] = LOBBY_ROOMS[Math.min(LOBBY_ROOMS.length - 1, Math.max(0, tier))];
  b.rooms(lobbyEnd, cabinsEnd, count, 'corr_in', style);
  return b.layout;
}

function buildSleeper(tier: number): CarriageLayout {
  const b = new LayoutBuilder('sleeper');
  // Deep enough that the linen pad in the nook stands clear of the first room's wall (in full view).
  const front = 2.1;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  // A small service nook in the front vestibule: supplies sit next to the cabins that need them.
  // The service nook either side of the gangway: tea on the left, linen on the right.
  b.prop('urn', -INNER, WALL, out(-1.45), 0.66, 'rear');
  // The linen cupboard stands in from the outer wall, so its pad is clear of the strip that wall hides.
  b.prop('linen', out(0.82), WALL, out(2.02), 0.62, 'rear');
  b.anchor('urn', out(-2.0), 1.12);
  b.anchor('linen', out(1.42), 1.12);
  b.anchor('blanket', out(1.42), 1.12);
  b.anchor('pillow', out(1.42), 1.12);
  b.anchor('home_attendant', REAR_TILE_X, REAR_TILE_Z);
  b.anchor('tile_up_attendant', REAR_TILE_X, REAR_TILE_Z);
  b.anchor('tile_refurb', -REAR_TILE_X, REAR_TILE_Z);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front - 0.1);
  b.node('nook', 0, 1.05);
  b.chain('vest_front', 'nook', 'corr_in');
  const [count, style] = SLEEPER_ROOMS[Math.min(SLEEPER_ROOMS.length - 1, Math.max(0, tier))];
  b.rooms(front, INTERIOR_END, count, 'corr_in', style);
  return b.layout;
}

function buildBathroom(): CarriageLayout {
  const b = new LayoutBuilder('bathroom');
  // A washroom lounge up front (its own towel and roll closet, the laundry, a bench for whoever is
  // waiting), then three compact washrooms: a train loo, not a spa.
  const front = 7.4;
  const end = INTERIOR_END;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  b.connector(-INNER, front - 0.5, PARTITION_X0, end + 0.55, 'z');
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front);

  b.prop('closet', -INNER, 1.0, out(-1.8), 2.9, 'right');
  b.prop('laundry', out(1.8), 0.35, INNER, 2.35, 'left');
  b.prop('bench', out(2.1), 3.4, INNER, 5.6, 'left');
  b.prop('plant', -INNER, 6.3, out(-2.14), 6.7, 'right', false);
  b.anchor('closet', out(-1.36), 1.95);
  b.anchor('towel', out(-1.36), 1.95);
  b.anchor('roll', out(-1.36), 1.95);
  // Where waiting guests stand (in front of the bench) and the lounge's nav points.
  b.anchor('wait_0', out(1.7), 3.95);
  b.anchor('wait_1', out(1.7), 5.05);
  b.node('lounge', 0.1, 2.6);
  b.node('lounge_rear', 0.3, 5.4);

  const count = 3;
  const len = (end - front) / count;
  const gaps: [number, number][] = [];
  let previous = 'corr_in';
  b.chain('vest_front', 'lounge', 'lounge_rear', 'corr_in');
  for (let index = 0; index < count; index++) {
    const z0 = front + index * len;
    const z1 = z0 + len;
    b.wall(PARTITION_X1, z0 - 0.06, INNER, z0 + 0.06);
    if (index === count - 1) b.wall(PARTITION_X1, z1 - 0.06, INNER, z1 + 0.06);
    const [doorZ0, doorZ1] = centredDoor(z0, z1);
    const doorZ = (doorZ0 + doorZ1) / 2;
    gaps.push([doorZ0, doorZ1]);
    b.room(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06);
    b.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');
    b.prop('toilet', INNER - 0.62, z0 + 0.22, INNER, z0 + 0.87, 'left');
    // The washroom's own towels and rolls, on an open stand against the front wall.
    b.prop('washShelf', PARTITION_X1 + 0.08, z0 + 0.08, PARTITION_X1 + 0.68, z0 + 0.38, 'rear');
    if (index < count - 1) b.prop('sink', INNER - 0.5, z1 - 0.82, INNER, z1 - 0.22, 'left');
    else b.prop('bathtub', INNER - 1.5, z1 - 1.12, INNER, z1 - 0.14, 'left');
    const corridorNode = b.node(`corr_${index}`, (-INNER + PARTITION_X0) / 2, doorZ);
    const node = b.node(`bath_${index}`, PARTITION_X1 + 0.92, doorZ + 0.1);
    const useNode = b.node(`bath_use_${index}`, INNER - 1.05, z0 + 0.62);
    b.chain(previous, corridorNode, node, useNode);
    previous = corridorNode;
    b.layout.bathrooms.push({
      index,
      room: rect(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06),
      doorZ,
      door: [doorZ0, doorZ1],
      // The restock pad stands in the middle of the little room, clear of the loo and the basin.
      restock: { x: PARTITION_X1 + 1.05, z: z0 + 1.25 },
      useSpot: { x: INNER - 1.05, z: z0 + 0.62 },
      node,
      useNode,
    });
  }
  b.wallAlongZ(PARTITION_X0, PARTITION_X1, front, end, gaps, 'interior');
  b.node('corr_end', (-INNER + PARTITION_X0) / 2, CARRIAGE_LENGTH - REAR_VESTIBULE + 0.35);
  b.chain(previous, 'corr_end', 'vest_rear');
  b.anchor('tile_refurb', REAR_TILE_X, REAR_TILE_Z);
  return b.layout;
}

function buildSupply(): CarriageLayout {
  const b = new LayoutBuilder('supply');
  // Stores up front (towels, rolls, the crate bay for the platform vendor's deliveries), then the staff
  // room at the back where the runner takes a break between rounds.
  const front = 2.5;
  b.shell({ frontGangway: true, doors: true });
  b.vestibules(front);
  // The aisle overlaps both vestibules so the collision margin never opens a gap between them.
  b.room(out(-1.85), front - 0.9, out(1.85), CARRIAGE_LENGTH - 0.45);
  b.prop('shelfTowel', -INNER, 3.2, out(-1.85), 6.4, 'right');
  b.prop('shelfRoll', out(1.85), 3.2, INNER, 6.4, 'left');
  b.prop('crateBay', out(1.85), 7.6, INNER, 9.6, 'left');
  b.prop('sofa', -INNER, 11.4, out(-1.95), 13.6, 'right');
  b.prop('table', out(-1.75), 11.95, out(-1.15), 13.05);
  b.prop('laundry', out(1.95), 11.6, INNER, 13.2, 'left');
  b.anchor('shelf_towel', out(-1.2), 4.8);
  b.anchor('shelf_roll', out(1.2), 4.8);
  b.anchor('crateDrop', out(1.2), 8.6);
  b.anchor('home_runner', 0.1, 12.5);
  b.anchor('tile_up_runner', 0.1, 12.5);
  b.anchor('bin', out(-1.2), 15.4);
  b.anchor('tile_refurb', REAR_TILE_X, REAR_TILE_Z);
  b.node('aisle_front', 0, front + 0.2);
  b.node('aisle_mid', 0, 8.6);
  b.node('aisle_rear', 0.1, 14.6);
  b.chain('door_in', 'vest_front', 'aisle_front', 'aisle_mid', 'aisle_rear', 'vest_rear');
  return b.layout;
}

function buildLuggage(): CarriageLayout {
  const b = new LayoutBuilder('luggage');
  const front = 2.5;
  b.shell({ frontGangway: true, doors: true });
  b.vestibules(front);
  b.room(out(-1.75), front - 0.9, out(1.75), CARRIAGE_LENGTH - 0.45);
  b.prop('luggageRack', -INNER, 3.2, out(-1.75), 15.9, 'right');
  b.prop('luggageRack', out(1.75), 4.4, INNER, 15.9, 'left');
  b.anchor('rack', 0, 8.8);
  b.anchor('home_porter', 0.8, 3.4);
  b.anchor('tile_up_porter', 0.8, 3.4);
  b.anchor('tile_refurb', REAR_TILE_X, REAR_TILE_Z);
  b.node('aisle_front', 0, front + 0.3);
  b.node('rack', 0, 8.8);
  b.node('aisle_rear', 0, 15.0);
  b.chain('door_in', 'vest_front', 'aisle_front', 'rack', 'aisle_rear', 'vest_rear');
  return b.layout;
}

const BUILDERS: Record<CarriageType, (tier: number) => CarriageLayout> = {
  lobby: buildLobby,
  sleeper: buildSleeper,
  bathroom: buildBathroom,
  supply: buildSupply,
  luggage: buildLuggage,
};

const cache = new Map<string, CarriageLayout>();

/** Which floor plan a carriage uses at a refit tier: passenger carriages change plan with their class. */
export function layoutKey(type: CarriageType, tier = 0): string {
  if (type !== 'lobby' && type !== 'sleeper') return type;
  const t = Math.min(5, Math.max(0, tier));
  return `${type}:${t <= 1 ? 0 : t}`;
}

/** The floor plan of a carriage type (passenger carriages: at a refit tier, which sets their class). */
export function getLayout(type: CarriageType, tier = 0): CarriageLayout {
  const key = layoutKey(type, tier);
  let layout = cache.get(key);
  if (!layout) {
    layout = BUILDERS[type](tier);
    cache.set(key, layout);
  }
  return layout;
}

export const carriageOriginZ = (index: number): number => index * CARRIAGE_PITCH;

export const trainRearZ = (carriageCount: number): number => carriageOriginZ(carriageCount - 1) + CARRIAGE_LENGTH;

/** Rear deck behind the last carriage, where the coupling tile sits. */
export function rearDeck(carriageCount: number): { room: Rect; tile: Vec2 } {
  const z = trainRearZ(carriageCount) + GANGWAY_LENGTH;
  return { room: rect(-1.3, z, 1.3, z + REAR_DECK_LENGTH), tile: { x: 0, z: z + REAR_DECK_LENGTH / 2 } };
}

/** Station platform walkable area (world coordinates, platform stopped). */
export function platformRoom(carriageCount: number): Rect {
  return rect(PLATFORM_X0, -LOCOMOTIVE_LENGTH, PLATFORM_X0 + PLATFORM_WIDTH, trainRearZ(carriageCount) + 3);
}

/** Walk-over zone radii (metres), shared by gameplay and the placement test so they cannot drift apart. */
export const ZONE_RADIUS = {
  desk: 0.45,
  source: 0.5,
  rack: 0.6,
  bin: 0.42,
  request: 0.62,
  spot: 0.36,
  restock: 0.6,
  crate: 0.6,
  tile: 0.6,
  coupleTile: 0.8,
} as const;
/** Unlock tiles are squares this wide on the floor. */
/** Unlock tiles: a metre square (session 15, was 1.2 m: the big plates would not fit clear of the walls). */
export const TILE_SIZE = 1.0;
export const COUPLE_TILE_SIZE = 1.6;
/** A washroom's tip pile sits this far from its restock point. */
export const BATH_PILE_OFFSET: Vec2 = { x: -0.35, z: 0.55 };

/** Station upgrade tiles on the platform (world coordinates while the train is in), beside the lobby. */
export const STATION_TILE_POS: Record<'exterior' | 'marketing', Vec2> = {
  exterior: { x: PLATFORM_X0 + 2.4, z: 7.0 },
  marketing: { x: PLATFORM_X0 + 2.4, z: 9.2 },
};

export type FootprintKind = 'zone' | 'tile' | 'pile' | 'home';

/**
 * Everything the player walks over in a carriage, in local coordinates: zones, unlock tiles, cash piles
 * and staff homes. `group` marks things that never exist at the same time (a cabin's tile and its
 * request zone), so they may share a spot.
 */
export interface Footprint {
  id: string;
  kind: FootprintKind;
  x: number;
  z: number;
  /** Circle radius, or half the side for tiles. */
  r: number;
  group?: string;
}

export function footprints(layout: CarriageLayout): Footprint[] {
  const out: Footprint[] = [];
  const a = layout.anchors;
  const zone = (id: string, p: Vec2 | undefined, r: number, group?: string): void => {
    if (p) out.push({ id, kind: 'zone', x: p.x, z: p.z, r, group });
  };
  const tile = (id: string, p: Vec2 | undefined, group?: string): void => {
    if (p) out.push({ id, kind: 'tile', x: p.x, z: p.z, r: TILE_SIZE / 2, group });
  };
  const pile = (id: string, p: Vec2 | undefined): void => {
    if (p) out.push({ id, kind: 'pile', x: p.x, z: p.z, r: 0.28 });
  };
  zone('desk', a.deskService, ZONE_RADIUS.desk);
  pile('deskCash', a.deskCash);
  pile('startCash', a.startCash);
  zone('urn', a.urn, ZONE_RADIUS.source);
  zone('linen', a.linen, ZONE_RADIUS.source);
  zone('rack', a.rack, ZONE_RADIUS.rack);
  zone('bin', a.bin, ZONE_RADIUS.bin);
  zone('closet', a.closet, ZONE_RADIUS.source);
  zone('shelf_towel', a.shelf_towel, ZONE_RADIUS.source);
  zone('shelf_roll', a.shelf_roll, ZONE_RADIUS.source);
  zone('crateDrop', a.crateDrop, ZONE_RADIUS.crate);
  tile('tile_refurb', a.tile_refurb);
  for (const role of ['attendant', 'porter', 'runner']) {
    // A staff member's hire tile sits on their home, then the training tile does: never together.
    tile(`tile_up_${role}`, a[`tile_up_${role}`], `staff_${role}`);
    tile(`hire_${role}`, a[`home_${role}`], `staff_${role}`);
  }
  for (const cabin of layout.cabins) {
    zone(`request_${cabin.index}`, cabin.center, ZONE_RADIUS.request, `cabin_${cabin.index}`);
    tile(`cabin_tile_${cabin.index}`, cabin.center, `cabin_${cabin.index}`);
    cabin.spots.forEach((s, i) => zone(`spot_${cabin.index}_${i}`, s, ZONE_RADIUS.spot, `cabin_${cabin.index}`));
    pile(`tips_${cabin.index}`, cabin.tipPile);
  }
  for (const bath of layout.bathrooms) {
    zone(`restock_${bath.index}`, bath.restock, ZONE_RADIUS.restock, `bath_${bath.index}`);
    tile(`bath_tile_${bath.index}`, bath.restock, `bath_${bath.index}`);
    pile(`bath_tips_${bath.index}`, { x: bath.restock.x + BATH_PILE_OFFSET.x, z: bath.restock.z + BATH_PILE_OFFSET.z });
  }
  return out;
}
