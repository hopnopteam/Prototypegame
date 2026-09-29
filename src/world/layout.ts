import { rect, type CarriageType, type Rect, type Vec2 } from '../core/types';

/**
 * Carriage floor plans as pure data: rooms, doorways, furniture footprints, walls, nav nodes and anchors.
 * The renderer, collision, pathfinding and gameplay all read these, so what you see is what you walk.
 * Local coordinates: x across the carriage (+x = platform side), z along it (0 = front end).
 */

export const CARRIAGE_LENGTH = 14;
export const GANGWAY_LENGTH = 1.2;
export const CARRIAGE_PITCH = CARRIAGE_LENGTH + GANGWAY_LENGTH;
export const HALF_WIDTH = 2.2;
export const WALL = 0.16;
export const INNER = HALF_WIDTH - WALL;
/** Corridor runs along the left (1.2 m, room to pass); rooms sit to the right of this partition. */
export const PARTITION_X0 = -0.84;
export const PARTITION_X1 = -0.7;
/** Room doorways: wide enough to walk through without threading a needle (they slide open as you come). */
export const ROOM_DOOR_WIDTH = 1.2;
export const ROOM_DOOR_OFFSET = 0.3;
export const EXTERIOR_WALL_HEIGHT = 1.1;
export const INTERIOR_WALL_HEIGHT = 0.85;
export const GANGWAY_HALF = 0.7;
export const DOOR_Z0 = 0.8;
export const DOOR_Z1 = 2.2;
export const LOCOMOTIVE_LENGTH = 10;
export const REAR_DECK_LENGTH = 2.4;
/** Depth of the rear vestibule; everything else in a carriage ends before it. */
export const REAR_VESTIBULE = 1.3;
export const INTERIOR_END = CARRIAGE_LENGTH - REAR_VESTIBULE - 0.06;
export const PLATFORM_X0 = HALF_WIDTH + 0.25;
export const PLATFORM_WIDTH = 6.5;

/** The lobby queue: slot 0 at the desk, a row across the lobby, then back along a second row. */
export const QUEUE_SLOTS: Vec2[] = [
  { x: -0.02, z: 3.3 }, { x: 0.64, z: 3.3 }, { x: 1.3, z: 3.3 },
  { x: 1.3, z: 4.05 }, { x: 0.64, z: 4.05 }, { x: -0.02, z: 4.05 },
];

export type PropKind =
  | 'bed' | 'desk' | 'urn' | 'linen' | 'rack' | 'bin' | 'toilet' | 'sink' | 'bathtub'
  | 'shelfTowel' | 'shelfRoll' | 'crateBay' | 'bench' | 'luggageRack' | 'plant' | 'lamp'
  | 'closet' | 'laundry' | 'table' | 'sofa';

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

export interface CabinLayout {
  index: number;
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

  wall(x0: number, z0: number, x1: number, z1: number, kind: WallBox['kind'] = 'interior'): void {
    const height = kind === 'exterior' ? EXTERIOR_WALL_HEIGHT : INTERIOR_WALL_HEIGHT;
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
  wallAlongX(z0: number, z1: number, x0: number, x1: number, gaps: [number, number][], kind: WallBox['kind']): void {
    let cursor = x0;
    for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (g0 > cursor) this.wall(cursor, z0, g0, z1, kind);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < x1) this.wall(cursor, z0, x1, z1, kind);
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
    this.wallAlongX(L - WALL, L, -INNER, INNER, [[-GANGWAY_HALF, GANGWAY_HALF]], 'exterior');

    if (options.doors) {
      const doorZ = (DOOR_Z0 + DOOR_Z1) / 2;
      const inside = this.node('door_in', 1.45, doorZ);
      const outside = this.node('door_out', PLATFORM_X0 + 0.9, doorZ);
      this.edge(inside, outside, true);
      this.connector(INNER - 0.5, DOOR_Z0, PLATFORM_X0 + 0.6, DOOR_Z1, 'x', true);
      this.layout.doors.push({
        z0: DOOR_Z0, z1: DOOR_Z1,
        inside: { x: 1.45, z: doorZ }, outside: { x: PLATFORM_X0 + 0.9, z: doorZ },
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

  /** Sleeper cabins on the right of a corridor, between z0 and z1. */
  cabins(z0: number, z1: number, count: number, corridorEntryNode: string): void {
    const len = (z1 - z0) / count;
    const partitionGaps: [number, number][] = [];
    this.connector(-INNER, z0 - 0.5, PARTITION_X0, z1 + 0.55, 'z');
    let previousCorridor = corridorEntryNode;

    for (let c = 0; c < count; c++) {
      const cz0 = z0 + c * len;
      const cz1 = cz0 + len;
      const doorZ0 = cz0 + ROOM_DOOR_OFFSET;
      const doorZ1 = doorZ0 + ROOM_DOOR_WIDTH;
      const doorZ = (doorZ0 + doorZ1) / 2;
      partitionGaps.push([doorZ0, doorZ1]);

      // Divider wall at the front of each cabin (the last cabin also gets one at its rear).
      this.wall(PARTITION_X1, cz0 - 0.06, INNER, cz0 + 0.06);
      if (c === count - 1) this.wall(PARTITION_X1, cz1 - 0.06, INNER, cz1 + 0.06);

      const room = rect(PARTITION_X1, cz0 + 0.06, INNER, cz1 - 0.06);
      this.room(room.x0, room.z0, room.x1, room.z1);
      this.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');

      const bed = rect(INNER - 1.05, cz0 + 0.18, INNER, cz0 + 0.18 + Math.min(1.85, len - 0.4));
      this.prop('bed', bed.x0, bed.z0, bed.x1, bed.z1, 'front');

      const corridorNode = this.node(`corr_${c}`, (-INNER + PARTITION_X0) / 2, doorZ);
      const cabinNode = this.node(`cabin_${c}`, 0.22, doorZ + 0.1);
      this.chain(previousCorridor, corridorNode);
      this.edge(corridorNode, cabinNode);
      previousCorridor = corridorNode;

      // The walk-in beside the bed: one spot in its middle is where you clean, deliver and build (a room
      // is small enough that tidying it from one place reads better than walking a circuit of it).
      const openX0 = PARTITION_X1 + 0.32;
      const openX1 = bed.x0 - 0.42;
      const heart = { x: (openX0 + openX1) / 2, z: cz0 + len * 0.52 };
      this.layout.cabins.push({
        index: c,
        room,
        doorZ,
        door: [doorZ0, doorZ1],
        bed,
        spots: [{ ...heart }],
        center: { ...heart },
        bedPose: { x: (bed.x0 + bed.x1) / 2, z: (bed.z0 + bed.z1) / 2 },
        tipPile: { x: openX1, z: cz1 - 0.42 },
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

function buildLobby(): CarriageLayout {
  const b = new LayoutBuilder('lobby');
  // A generous reception (7.4 m) and two proper cabins behind it.
  const lobbyEnd = 7.4;
  const cabinsEnd = INTERIOR_END;
  b.shell({ frontGangway: false, doors: true });
  b.vestibules(0);
  b.room(-INNER, WALL, INNER, lobbyEnd);

  // Front counter along the end wall: the tea urn and the linen cupboard, pads centred in front. The
  // reception desk stands on the left facing the door with a staff lane behind it; the queue snakes in
  // front of it across open floor; the luggage rack and bin line the right wall toward the cabins.
  b.prop('desk', -1.22, 2.45, -0.46, 4.15, 'right');
  b.prop('urn', -INNER, WALL, -1.2, 0.66, 'rear');
  b.prop('linen', -0.5, WALL, 0.9, 0.62, 'rear');
  b.prop('rack', 1.42, 5.35, INNER, 7.1, 'left');
  b.prop('bin', 1.64, 4.65, INNER, 5.05, 'left');
  b.prop('plant', 1.62, WALL, INNER, 0.55, 'left', false);
  b.prop('plant', -INNER, 6.72, -1.64, 7.12, 'right', false);

  b.anchor('deskService', -1.66, 3.3);
  b.anchor('deskCash', -1.66, 4.55);
  b.anchor('startCash', -1.62, 5.4);
  b.anchor('playerSpawn', -0.5, 5.2);
  b.anchor('urn', -1.62, 1.12);
  b.anchor('linen', 0.2, 1.12);
  b.anchor('blanket', 0.2, 1.12);
  b.anchor('pillow', 0.2, 1.12);
  b.anchor('rack', 0.82, 6.25);
  b.anchor('bin', 1.2, 4.85);
  b.anchor('home_attendant', -0.5, 6.35);
  b.anchor('tile_up_attendant', -0.5, 6.35);
  // The porter's post is at the carriage's back door, out of the busy lobby.
  b.anchor('home_porter', -1.05, CARRIAGE_LENGTH - 0.72);
  // Between jobs the porter waits behind the desk, like a receptionist, not in the gangway everyone uses.
  b.anchor('idle_porter', -1.66, 2.15);
  b.anchor('tile_up_porter', -1.05, CARRIAGE_LENGTH - 0.72);
  b.anchor('tile_refurb', 1.05, CARRIAGE_LENGTH - 0.72);
  b.anchor('stackItems', 0.8, 1.2);

  // One tidy snake from the desk, each place painted on the floor (drawn by CarriageView).
  b.layout.queue = QUEUE_SLOTS.map((p) => ({ ...p }));

  const doorIn = 'door_in';
  b.node('lobby_front', 0.25, 1.5);
  b.node('lobby_fl', -1.62, 1.6);
  b.node('desk', -1.66, 3.3);
  b.node('lobby_rl', -1.6, 4.9);
  b.node('lobby_rear', 0.3, 4.9);
  b.node('rack', 0.82, 6.25);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, lobbyEnd - 0.1);
  // The desk is reached from behind (lobby_rl), so guests never walk through the staff side.
  b.chain(doorIn, 'lobby_front', 'lobby_fl');
  b.chain('desk', 'lobby_rl', 'corr_in');
  b.chain('lobby_front', 'lobby_rear', 'rack');
  b.edge('lobby_rl', 'lobby_rear');

  b.cabins(lobbyEnd, cabinsEnd, 2, 'corr_in');
  return b.layout;
}

function buildSleeper(): CarriageLayout {
  const b = new LayoutBuilder('sleeper');
  const front = 1.6;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  // A small service nook in the front vestibule: supplies sit next to the cabins that need them.
  // The service nook either side of the gangway: tea on the left, linen on the right.
  b.prop('urn', -INNER, WALL, -1.2, 0.66, 'rear');
  b.prop('linen', 1.0, WALL, INNER, 0.62, 'rear');
  b.anchor('urn', -1.62, 1.12);
  b.anchor('linen', 1.45, 1.12);
  b.anchor('blanket', 1.45, 1.12);
  b.anchor('pillow', 1.45, 1.12);
  b.anchor('home_attendant', 1.05, CARRIAGE_LENGTH - 0.72);
  b.anchor('tile_up_attendant', 1.05, CARRIAGE_LENGTH - 0.72);
  b.anchor('tile_refurb', -1.05, CARRIAGE_LENGTH - 0.72);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front - 0.1);
  b.node('nook', 0, 1.05);
  b.chain('vest_front', 'nook', 'corr_in');
  b.cabins(front, INTERIOR_END, 4, 'corr_in');
  return b.layout;
}

function buildBathroom(): CarriageLayout {
  const b = new LayoutBuilder('bathroom');
  // A washroom lounge up front (its own towel and roll closet, the laundry, a bench for whoever is
  // waiting), then three compact washrooms: a train loo, not a spa.
  const front = 5.6;
  const end = INTERIOR_END;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  b.connector(-INNER, front - 0.5, PARTITION_X0, end + 0.55, 'z');
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front);

  b.prop('closet', -INNER, 1.0, -1.3, 2.9, 'right');
  b.prop('laundry', 1.3, 0.35, INNER, 2.35, 'left');
  b.prop('bench', 1.6, 3.0, INNER, 4.8, 'left');
  b.prop('plant', -INNER, 4.6, -1.64, 5.0, 'right', false);
  b.anchor('closet', -0.86, 1.95);
  b.anchor('towel', -0.86, 1.95);
  b.anchor('roll', -0.86, 1.95);
  // Where waiting guests stand (in front of the bench) and the lounge's nav points.
  b.anchor('wait_0', 1.2, 3.45);
  b.anchor('wait_1', 1.2, 4.35);
  b.node('lounge', 0.1, 2.6);
  b.node('lounge_rear', 0.3, 4.2);

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
    const doorZ0 = z0 + ROOM_DOOR_OFFSET;
    const doorZ1 = doorZ0 + ROOM_DOOR_WIDTH;
    const doorZ = (doorZ0 + doorZ1) / 2;
    gaps.push([doorZ0, doorZ1]);
    b.room(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06);
    b.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');
    b.prop('toilet', INNER - 0.62, z0 + 0.22, INNER, z0 + 0.87, 'left');
    if (index < count - 1) b.prop('sink', INNER - 0.5, z1 - 0.82, INNER, z1 - 0.22, 'left');
    else b.prop('bathtub', 0.62, z1 - 1.12, INNER, z1 - 0.14, 'left');
    const corridorNode = b.node(`corr_${index}`, (-INNER + PARTITION_X0) / 2, doorZ);
    const node = b.node(`bath_${index}`, 0.05, doorZ + 0.1);
    const useNode = b.node(`bath_use_${index}`, INNER - 1.05, z0 + 0.62);
    b.chain(previous, corridorNode, node, useNode);
    previous = corridorNode;
    b.layout.bathrooms.push({
      index,
      room: rect(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06),
      doorZ,
      door: [doorZ0, doorZ1],
      // The restock pad stands in the middle of the little room, clear of the loo and the basin.
      restock: { x: 0.0, z: z0 + 1.35 },
      useSpot: { x: INNER - 1.05, z: z0 + 0.62 },
      node,
      useNode,
    });
  }
  b.wallAlongZ(PARTITION_X0, PARTITION_X1, front, end, gaps, 'interior');
  b.node('corr_end', (-INNER + PARTITION_X0) / 2, CARRIAGE_LENGTH - REAR_VESTIBULE + 0.35);
  b.chain(previous, 'corr_end', 'vest_rear');
  b.anchor('tile_refurb', 1.05, CARRIAGE_LENGTH - 0.75);
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
  b.room(-1.35, front - 0.9, 1.35, CARRIAGE_LENGTH - 0.45);
  b.prop('shelfTowel', -INNER, 3.0, -1.35, 5.8, 'right');
  b.prop('shelfRoll', 1.35, 3.0, INNER, 5.8, 'left');
  b.prop('crateBay', 1.35, 6.5, INNER, 8.4, 'left');
  b.prop('sofa', -INNER, 9.0, -1.45, 11.2, 'right');
  b.prop('table', -1.25, 9.55, -0.65, 10.65);
  b.prop('laundry', 1.45, 9.2, INNER, 10.8, 'left');
  b.anchor('shelf_towel', -0.95, 4.4);
  b.anchor('shelf_roll', 0.95, 4.4);
  b.anchor('crateDrop', 0.95, 7.45);
  b.anchor('home_runner', 0.1, 10.1);
  b.anchor('tile_up_runner', 0.1, 10.1);
  b.anchor('bin', -0.95, 12.2);
  b.anchor('tile_refurb', 1.05, CARRIAGE_LENGTH - 0.75);
  b.node('aisle_front', 0, front + 0.2);
  b.node('aisle_mid', 0, 6.5);
  b.node('aisle_rear', 0.1, 11.4);
  b.chain('door_in', 'vest_front', 'aisle_front', 'aisle_mid', 'aisle_rear', 'vest_rear');
  return b.layout;
}

function buildLuggage(): CarriageLayout {
  const b = new LayoutBuilder('luggage');
  const front = 2.5;
  b.shell({ frontGangway: true, doors: true });
  b.vestibules(front);
  b.room(-1.25, front - 0.9, 1.25, CARRIAGE_LENGTH - 0.45);
  b.prop('luggageRack', -INNER, 3.2, -1.25, 12.4, 'right');
  b.prop('luggageRack', 1.25, 4.4, INNER, 12.4, 'left');
  b.anchor('rack', 0, 6.8);
  b.anchor('home_porter', 0.6, 3.4);
  b.anchor('tile_up_porter', 0.6, 3.4);
  b.anchor('tile_refurb', 1.05, CARRIAGE_LENGTH - 0.75);
  b.node('aisle_front', 0, front + 0.3);
  b.node('rack', 0, 6.8);
  b.node('aisle_rear', 0, 11.2);
  b.chain('door_in', 'vest_front', 'aisle_front', 'rack', 'aisle_rear', 'vest_rear');
  return b.layout;
}

const BUILDERS: Record<CarriageType, () => CarriageLayout> = {
  lobby: buildLobby,
  sleeper: buildSleeper,
  bathroom: buildBathroom,
  supply: buildSupply,
  luggage: buildLuggage,
};

const cache = new Map<CarriageType, CarriageLayout>();

export function getLayout(type: CarriageType): CarriageLayout {
  let layout = cache.get(type);
  if (!layout) {
    layout = BUILDERS[type]();
    cache.set(type, layout);
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
export const TILE_SIZE = 1.2;
export const COUPLE_TILE_SIZE = 1.6;
/** A washroom's tip pile sits this far from its restock point. */
export const BATH_PILE_OFFSET: Vec2 = { x: -0.35, z: 0.6 };

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
