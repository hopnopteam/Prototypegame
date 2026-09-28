import type { Vec2 } from '../core/types';

interface NavNode {
  id: string;
  x: number;
  z: number;
  edges: { to: string; door: boolean }[];
}

/**
 * Waypoint graph for guests and staff: carriage corridors, cabin doors, gangways and platform spots.
 * A* over a few hundred nodes is instant, and door edges switch off whenever the platform doors close.
 */
export class NavGraph {
  private readonly nodes = new Map<string, NavNode>();
  private doorsOpen = false;

  addNode(id: string, x: number, z: number): void {
    const existing = this.nodes.get(id);
    if (existing) {
      existing.x = x;
      existing.z = z;
      return;
    }
    this.nodes.set(id, { id, x, z, edges: [] });
  }

  addEdge(a: string, b: string, door = false): void {
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (!na || !nb) throw new Error(`NavGraph edge ${a} -> ${b} references a missing node`);
    if (!na.edges.some((e) => e.to === b)) na.edges.push({ to: b, door });
    if (!nb.edges.some((e) => e.to === a)) nb.edges.push({ to: a, door });
  }

  ids(): IterableIterator<string> {
    return this.nodes.keys();
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  position(id: string): Vec2 {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`NavGraph has no node ${id}`);
    return { x: node.x, z: node.z };
  }

  setDoorsOpen(open: boolean): void {
    this.doorsOpen = open;
  }

  clear(): void {
    this.nodes.clear();
  }

  nearest(x: number, z: number, filter?: (id: string) => boolean): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const node of this.nodes.values()) {
      if (filter && !filter(node.id)) continue;
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = node.id;
      }
    }
    return best;
  }

  /** Waypoints from one node to another (both included), or null when no route exists right now. */
  findPath(from: string, to: string): Vec2[] | null {
    const start = this.nodes.get(from);
    const goal = this.nodes.get(to);
    if (!start || !goal) return null;
    if (from === to) return [{ x: goal.x, z: goal.z }];

    const open: string[] = [from];
    const cameFrom = new Map<string, string>();
    const g = new Map<string, number>([[from, 0]]);
    const f = new Map<string, number>([[from, heuristic(start, goal)]]);
    const closed = new Set<string>();

    while (open.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        if ((f.get(open[i]) ?? Infinity) < (f.get(open[bestIndex]) ?? Infinity)) bestIndex = i;
      }
      const currentId = open.splice(bestIndex, 1)[0];
      if (currentId === to) return this.reconstruct(cameFrom, currentId);
      closed.add(currentId);
      const current = this.nodes.get(currentId)!;

      for (const edge of current.edges) {
        if (edge.door && !this.doorsOpen) continue;
        if (closed.has(edge.to)) continue;
        const next = this.nodes.get(edge.to)!;
        const tentative = (g.get(currentId) ?? Infinity) + Math.hypot(next.x - current.x, next.z - current.z);
        if (tentative < (g.get(edge.to) ?? Infinity)) {
          cameFrom.set(edge.to, currentId);
          g.set(edge.to, tentative);
          f.set(edge.to, tentative + heuristic(next, goal));
          if (!open.includes(edge.to)) open.push(edge.to);
        }
      }
    }
    return null;
  }

  private reconstruct(cameFrom: Map<string, string>, end: string): Vec2[] {
    const ids = [end];
    let cursor = end;
    while (cameFrom.has(cursor)) {
      cursor = cameFrom.get(cursor)!;
      ids.push(cursor);
    }
    ids.reverse();
    return ids.map((id) => this.position(id));
  }

  get size(): number {
    return this.nodes.size;
  }
}

const heuristic = (a: NavNode, b: NavNode): number => Math.hypot(a.x - b.x, a.z - b.z);
