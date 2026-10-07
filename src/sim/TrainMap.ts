import { platformObstacles } from '../world/platformLayout';
import type { CarriageType, Rect, Vec2 } from '../core/types';
import {
  carriageOriginZ,
  getLayout,
  PLATFORM_X0,
  platformRoom,
  rearDeck,
  trainRearZ,
  type CarriageLayout,
} from '../world/layout';
import { NavGraph } from './NavGraph';
import { Walkable, type PlacedLayout } from './Walkable';

export interface PlacedCarriage extends PlacedLayout {
  index: number;
  type: CarriageType;
}

/** The platform's walkway (session 23: outside the ticket stand's lane, so staff never cut through the queue). */
const PLATFORM_SPINE_X = PLATFORM_X0 + 4.5;
/** The ticket stand, the luggage barrow, the bench and the newsstand (session 23). */
const PLATFORM_BLOCKED = platformObstacles();
const PLATFORM_SPINE_STEP = 4;

/**
 * The train as one navigable place: carriages placed end to end, the rear deck, and (at stations) the
 * platform. Owns the nav graph for guests/staff and the walkable areas for everyone.
 */
export class TrainMap {
  readonly nav = new NavGraph();
  readonly walk: Walkable;
  carriages: PlacedCarriage[] = [];
  private doorsOpen = false;
  /** Session 22: the opening's covered carriage: its platform doors stay shut until it is opened. */
  private sealed = false;
  private rearDeckEnabled = true;
  /** What is not there yet in each carriage (a venue's tables and extras still to buy): it does not block. */
  closedProps: (index: number) => ReadonlySet<number> | undefined = () => undefined;
  /** Rooms still locked in a carriage (session 22): their doorways are shut until bought. */
  lockedRooms: (index: number) => ReadonlySet<string> | undefined = () => undefined;

  constructor(radius: number) {
    this.walk = new Walkable(radius);
  }

  /** `tiers` picks each passenger carriage's floor plan (its class); service cars have one plan. */
  rebuild(types: CarriageType[], doorsOpen = this.doorsOpen, rearDeckEnabled = this.rearDeckEnabled, tiers: readonly number[] = []): void {
    this.doorsOpen = doorsOpen;
    this.rearDeckEnabled = rearDeckEnabled;
    this.carriages = types.map((type, index) => ({ index, type, layout: getLayout(type, tiers[index] ?? 0), originZ: carriageOriginZ(index) }));
    this.buildNav();
    this.buildWalkable();
  }

  setDoorsOpen(open: boolean): void {
    if (open === this.doorsOpen) return;
    this.doorsOpen = open;
    this.nav.setDoorsOpen(open);
    this.buildWalkable();
  }

  get areDoorsOpen(): boolean {
    return this.doorsOpen;
  }

  get count(): number {
    return this.carriages.length;
  }

  get rearZ(): number {
    return trainRearZ(this.carriages.length);
  }

  layoutOf(index: number): CarriageLayout {
    return this.carriages[index].layout;
  }

  nodeId(carriage: number, local: string): string {
    return `c${carriage}:${local}`;
  }

  /** World position of a named anchor in a carriage. */
  anchor(carriage: number, name: string): Vec2 {
    const placed = this.carriages[carriage];
    const a = placed?.layout.anchors[name];
    if (!placed || !a) throw new Error(`Carriage ${carriage} has no anchor "${name}"`);
    return { x: a.x, z: a.z + placed.originZ };
  }

  hasAnchor(carriage: number, name: string): boolean {
    return !!this.carriages[carriage]?.layout.anchors[name];
  }

  toWorld(carriage: number, local: Vec2): Vec2 {
    return { x: local.x, z: local.z + this.carriages[carriage].originZ };
  }

  rearDeck(): { room: Rect; tile: Vec2 } {
    return rearDeck(this.carriages.length);
  }

  platformRoom(): Rect {
    return platformRoom(this.carriages.length);
  }

  /** Every platform door, as world positions and nav node ids. */
  doors(): { carriage: number; inside: Vec2; outside: Vec2; insideNode: string; outsideNode: string }[] {
    const out: { carriage: number; inside: Vec2; outside: Vec2; insideNode: string; outsideNode: string }[] = [];
    for (const c of this.carriages) {
      for (const door of c.layout.doors) {
        out.push({
          carriage: c.index,
          inside: { x: door.inside.x, z: door.inside.z + c.originZ },
          outside: { x: door.outside.x, z: door.outside.z + c.originZ },
          insideNode: this.nodeId(c.index, door.insideNode),
          outsideNode: this.nodeId(c.index, door.outsideNode),
        });
      }
    }
    return out;
  }

  /** Path between world positions, snapping each end to the nearest suitable node. */
  pathBetweenNodes(from: string, to: string): Vec2[] | null {
    return this.nav.findPath(from, to);
  }

  nearestNode(x: number, z: number): string | null {
    // Platform nodes are only valid while the doors are open.
    return this.nav.nearest(x, z, (id) => this.doorsOpen || !id.startsWith('p:'));
  }

  private buildNav(): void {
    const nav = this.nav;
    nav.clear();
    for (const c of this.carriages) {
      for (const node of c.layout.nodes) nav.addNode(this.nodeId(c.index, node.id), node.x, node.z + c.originZ);
      for (const edge of c.layout.edges) nav.addEdge(this.nodeId(c.index, edge.a), this.nodeId(c.index, edge.b), edge.door);
    }
    for (let i = 1; i < this.carriages.length; i++) {
      const front = this.carriages[i].layout.frontNode;
      if (front) nav.addEdge(this.nodeId(i - 1, this.carriages[i - 1].layout.rearNode), this.nodeId(i, front));
    }

    // Rear deck, so the coupling moment can be staged and staff can reach it.
    const deck = this.rearDeck();
    nav.addNode('deck', deck.tile.x, deck.tile.z);
    const last = this.carriages[this.carriages.length - 1];
    if (last) nav.addEdge(this.nodeId(last.index, last.layout.rearNode), 'deck');

    // Platform spine: a line of nodes along the platform, joined to every door.
    const room = this.platformRoom();
    const spine: string[] = [];
    for (let z = room.z0 + 2, k = 0; z <= room.z1 - 1; z += PLATFORM_SPINE_STEP, k++) {
      const id = `p:spine_${k}`;
      nav.addNode(id, PLATFORM_SPINE_X, z);
      if (spine.length > 0) nav.addEdge(spine[spine.length - 1], id, true);
      spine.push(id);
    }
    for (const door of this.doors()) {
      let best = spine[0];
      let bestD = Infinity;
      for (const id of spine) {
        const p = nav.position(id);
        const d = Math.abs(p.z - door.outside.z);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      nav.addEdge(door.outsideNode, best, true);
    }
    nav.setDoorsOpen(this.doorsOpen);
  }

  /** The opening's covered carriage seals its doors (session 22); opening it lets everyone through. */
  setSealed(sealed: boolean): void {
    if (sealed === this.sealed) return;
    this.sealed = sealed;
    this.buildWalkable();
  }

  /** Something bought appeared (or the walls moved): the walkable floor is worked out again. */
  refreshWalkable(): void {
    this.buildWalkable();
  }

  private buildWalkable(): void {
    for (const c of this.carriages) {
      c.closed = this.closedProps(c.index);
      c.locked = this.lockedRooms(c.index);
    }
    this.walk.rebuild(this.carriages, {
      doorsOpen: this.doorsOpen,
      doorsSealed: this.sealed,
      platform: this.doorsOpen ? this.platformRoom() : null,
      platformBlocked: PLATFORM_BLOCKED,
      rearDeck: this.rearDeckEnabled ? this.rearDeck().room : null,
    });
  }
}
