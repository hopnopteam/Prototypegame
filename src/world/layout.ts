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
/** Corridor runs along the left; cabins sit to the right of this partition. */
export const PARTITION_X0 = -0.75;
export const PARTITION_X1 = -0.6;
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

export type PropKind =
  | 'bed' | 'desk' | 'urn' | 'linen' | 'rack' | 'bin' | 'toilet' | 'sink' | 'bathtub'
  | 'shelfTowel' | 'shelfRoll' | 'crateBay' | 'bench' | 'luggageRack' | 'plant' | 'lamp';

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
    this.wallAlongX(0, WALL, -HALF_WIDTH, HALF_WIDTH, options.frontGangway ? [[-GANGWAY_HALF, GANGWAY_HALF]] : [], 'exterior');
    this.wallAlongX(L - WALL, L, -HALF_WIDTH, HALF_WIDTH, [[-GANGWAY_HALF, GANGWAY_HALF]], 'exterior');

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
      const doorZ0 = cz0 + 0.25;
      const doorZ1 = cz0 + 1.15;
      const doorZ = (doorZ0 + doorZ1) / 2;
      partitionGaps.push([doorZ0, doorZ1]);

      // Divider wall at the front of each cabin (the last cabin also gets one at its rear).
      this.wall(PARTITION_X1, cz0 - 0.06, INNER, cz0 + 0.06);
      if (c === count - 1) this.wall(PARTITION_X1, cz1 - 0.06, INNER, cz1 + 0.06);

      const room = rect(PARTITION_X1, cz0 + 0.06, INNER, cz1 - 0.06);
      this.room(room.x0, room.z0, room.x1, room.z1);
      this.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');

      const bed = rect(INNER - 1.1, cz0 + 0.2, INNER, cz0 + 0.2 + Math.min(1.9, len - 0.45));
      this.prop('bed', bed.x0, bed.z0, bed.x1, bed.z1, 'front');

      const corridorNode = this.node(`corr_${c}`, (-INNER + PARTITION_X0) / 2, doorZ);
      const cabinNode = this.node(`cabin_${c}`, 0.12, doorZ + 0.15);
      this.chain(previousCorridor, corridorNode);
      this.edge(corridorNode, cabinNode);
      previousCorridor = corridorNode;

      const openX0 = PARTITION_X1 + 0.35;
      const openX1 = bed.x0 - 0.3;
      this.layout.cabins.push({
        index: c,
        room,
        doorZ,
        bed,
        spots: [
          { x: openX0, z: cz0 + 0.55 },
          { x: openX1, z: cz0 + len * 0.5 },
          { x: openX0 + 0.1, z: cz1 - 0.5 },
        ],
        center: { x: (openX0 + openX1) / 2, z: cz0 + len * 0.52 },
        bedPose: { x: (bed.x0 + bed.x1) / 2, z: (bed.z0 + bed.z1) / 2 },
        tipPile: { x: openX1 - 0.12, z: cz1 - 0.45 },
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
  const lobbyEnd = 6.0;
  const cabinsEnd = INTERIOR_END;
  b.shell({ frontGangway: false, doors: true });
  b.vestibules(0);
  b.room(-INNER, WALL, INNER, lobbyEnd);

  b.prop('desk', -1.2, 2.1, -0.5, 3.5, 'right');
  b.prop('urn', -INNER, WALL, -1.5, 0.75, 'rear');
  b.prop('linen', -0.95, WALL, 0.45, 0.62, 'rear');
  b.prop('rack', 1.45, 4.2, INNER, 5.85, 'left');
  b.prop('bin', 1.72, WALL, INNER, 0.5, 'left');
  b.prop('plant', -INNER, 5.4, -1.8, 5.85, 'right', false);

  b.anchor('deskService', -1.68, 2.8);
  b.anchor('deskCash', -1.62, 3.95);
  b.anchor('startCash', -1.62, 4.75);
  b.anchor('playerSpawn', -0.7, 4.7);
  b.anchor('urn', -1.6, 1.12);
  b.anchor('blanket', -0.6, 0.98);
  b.anchor('pillow', 0.12, 0.98);
  b.anchor('rack', 1.1, 5.0);
  b.anchor('bin', 1.3, 0.88);
  b.anchor('home_attendant', -0.25, 5.05);
  b.anchor('home_porter', 0.55, 1.45);
  b.anchor('tile_bedding', 1.05, CARRIAGE_LENGTH - 0.75);
  b.anchor('tile_up_attendant', -0.25, 5.05);
  b.anchor('tile_up_porter', 0.55, 1.45);
  b.anchor('stackItems', 0.8, 1.2);

  b.layout.queue = [
    { x: -0.15, z: 2.8 }, { x: 0.55, z: 2.8 }, { x: 1.25, z: 2.8 },
    { x: 1.25, z: 3.55 }, { x: 0.55, z: 3.55 }, { x: -0.15, z: 3.55 },
  ];

  const doorIn = 'door_in';
  b.node('lobby_front', 0.25, 1.5);
  b.node('lobby_fl', -1.62, 1.55);
  b.node('desk', -1.68, 2.8);
  b.node('lobby_rl', -1.55, 4.45);
  b.node('lobby_rear', 0.35, 4.45);
  b.node('rack', 1.1, 5.0);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, lobbyEnd - 0.1);
  // The desk is reached from behind (lobby_rl), so guests never walk through the staff side.
  b.chain(doorIn, 'lobby_front', 'lobby_fl');
  b.chain('desk', 'lobby_rl', 'corr_in');
  b.chain('lobby_front', 'lobby_rear', 'rack');
  b.edge('lobby_rl', 'lobby_rear');

  b.cabins(lobbyEnd, cabinsEnd, 3, 'corr_in');
  return b.layout;
}

function buildSleeper(): CarriageLayout {
  const b = new LayoutBuilder('sleeper');
  const front = 1.6;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  // A small service nook in the front vestibule: supplies sit next to the cabins that need them.
  b.prop('urn', -INNER, WALL, -1.5, 0.7, 'rear');
  b.prop('linen', 0.85, WALL, INNER, 0.6, 'rear');
  b.anchor('urn', -1.6, 1.12);
  b.anchor('blanket', 1.05, 1.0);
  b.anchor('pillow', 1.72, 1.0);
  b.anchor('home_attendant', 1.2, CARRIAGE_LENGTH - 0.75);
  b.anchor('tile_up_attendant', 1.2, CARRIAGE_LENGTH - 0.75);
  b.anchor('tile_bedding', -0.9, CARRIAGE_LENGTH - 0.75);
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front - 0.1);
  b.node('nook', 0, 1.05);
  b.chain('vest_front', 'nook', 'corr_in');
  b.cabins(front, INTERIOR_END, 5, 'corr_in');
  return b.layout;
}

function buildBathroom(): CarriageLayout {
  const b = new LayoutBuilder('bathroom');
  const front = 1.3;
  const end = INTERIOR_END;
  b.shell({ frontGangway: true, doors: false });
  b.vestibules(front);
  b.connector(-INNER, front - 0.5, PARTITION_X0, end + 0.55, 'z');
  b.node('corr_in', (-INNER + PARTITION_X0) / 2, front);

  const mid = (front + end) / 2;
  const rooms: [number, number][] = [[front, mid], [mid, end]];
  const gaps: [number, number][] = [];
  let previous = 'corr_in';
  b.edge('vest_front', 'corr_in');
  rooms.forEach(([z0, z1], index) => {
    b.wall(PARTITION_X1, z0 - 0.06, INNER, z0 + 0.06);
    if (index === rooms.length - 1) b.wall(PARTITION_X1, z1 - 0.06, INNER, z1 + 0.06);
    const doorZ0 = z0 + 0.3;
    const doorZ1 = z0 + 1.3;
    const doorZ = (doorZ0 + doorZ1) / 2;
    gaps.push([doorZ0, doorZ1]);
    b.room(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06);
    b.connector(PARTITION_X0 - 0.45, doorZ0, PARTITION_X1 + 0.45, doorZ1, 'x');
    b.prop('toilet', INNER - 0.7, z0 + 0.35, INNER, z0 + 1.05, 'left');
    b.prop('sink', INNER - 0.55, z0 + 2.3, INNER, z0 + 3.1, 'left');
    b.prop('bathtub', 0.1, z1 - 1.35, INNER, z1 - 0.12, 'left');
    const corridorNode = b.node(`corr_${index}`, (-INNER + PARTITION_X0) / 2, doorZ);
    const node = b.node(`bath_${index}`, 0.1, doorZ + 0.3);
    const useNode = b.node(`bath_use_${index}`, INNER - 1.05, z0 + 0.8);
    b.chain(previous, corridorNode, node, useNode);
    previous = corridorNode;
    b.layout.bathrooms.push({
      index,
      room: rect(PARTITION_X1, z0 + 0.06, INNER, z1 - 0.06),
      doorZ,
      restock: { x: 0.35, z: z0 + 2.7 },
      useSpot: { x: INNER - 1.05, z: z0 + 0.8 },
      node,
      useNode,
    });
  });
  b.wallAlongZ(PARTITION_X0, PARTITION_X1, front, end, gaps, 'interior');
  b.node('corr_end', (-INNER + PARTITION_X0) / 2, CARRIAGE_LENGTH - REAR_VESTIBULE + 0.35);
  b.chain(previous, 'corr_end', 'vest_rear');
  return b.layout;
}

function buildSupply(): CarriageLayout {
  const b = new LayoutBuilder('supply');
  const front = 2.5;
  b.shell({ frontGangway: true, doors: true });
  b.vestibules(front);
  // The aisle overlaps both vestibules so the collision margin never opens a gap between them.
  b.room(-1.35, front - 0.9, 1.35, CARRIAGE_LENGTH - 0.45);
  b.prop('shelfTowel', -INNER, 3.0, -1.35, 7.0, 'right');
  b.prop('shelfRoll', 1.35, 3.0, INNER, 7.0, 'left');
  b.prop('crateBay', 1.35, 8.4, INNER, 11.6, 'left');
  b.prop('bench', -INNER, 9.0, -1.4, 11.0, 'right');
  b.anchor('shelf_towel', -0.95, 5.0);
  b.anchor('shelf_roll', 0.95, 5.0);
  b.anchor('crateDrop', 0.95, 10.0);
  b.anchor('home_runner', -0.9, 8.3);
  b.anchor('tile_up_runner', -0.9, 8.3);
  b.anchor('bin', -0.95, 12.2);
  b.node('aisle_front', 0, front + 0.2);
  b.node('aisle_mid', 0, 6.5);
  b.node('aisle_rear', 0, 11.2);
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
