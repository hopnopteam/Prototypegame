import type { Vec2 } from '../core/types';
import type { World } from './World';

/** Distance at which a waypoint counts as reached. */
export const WAYPOINT_REACHED = 0.22;
/** A waypoint overshot by less than this along its leg counts as reached. */
const PASSED_WITHIN = 1.2;

/** True when a straight walk from a to b never leaves the floor. */
export function lineOfSight(w: World, a: Vec2, b: Vec2): boolean {
  const walk = w.map.walk;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(d / 0.15));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!walk.isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return !walk.segmentBlocked(a.x, a.z, b.x, b.z);
}

/** Grid step (m) and reach of the way out of a pocket where no nav node is in sight. */
const ESCAPE_STEP = 0.1;
const ESCAPE_RADIUS = 10;
/** At most this many grid cells are searched, and only nodes this near (m) count, so the search stays cheap. */
const ESCAPE_CELLS = 4000;
const ESCAPE_SIGHT = 6;

function visibleNode(w: World, p: Vec2): string | null {
  return seenNode(w, p) ?? w.map.nearestNode(p.x, p.z);
}

/** The nearest nav node in a straight, open line from `p`, if any. */
function seenNode(w: World, p: Vec2, within = Infinity): string | null {
  const map = w.map;
  let best: string | null = null;
  let bestD = within * within;
  for (const id of map.nav.ids()) {
    if (id.startsWith('p:') && !map.areDoorsOpen) continue;
    const n = map.nav.position(id);
    const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
    if (d < bestD && lineOfSight(w, p, n)) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/**
 * Phase 3 (found by the pacing simulator): a narrow channel of open floor (behind a café table along the window wall)
 * can hold the walker where no nav node is in a straight line, and walking at the nearest node then pushes into the
 * furniture for ever. The way out: a breadth-first walk over a fine grid of open floor to the nearest point that can
 * see a node. Null when there is none within reach.
 */
function escapeRoute(w: World, from: Vec2): Vec2[] | null {
  const walk = w.map.walk;
  const span = Math.round(ESCAPE_RADIUS / ESCAPE_STEP);
  const size = span * 2 + 1;
  const prev = new Int32Array(size * size).fill(-2);
  const start = span * size + span;
  prev[start] = -1;
  const queue = [start];
  const at = (cell: number): Vec2 => ({ x: from.x + ((cell % size) - span) * ESCAPE_STEP, z: from.z + (Math.floor(cell / size) - span) * ESCAPE_STEP });
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const p = at(cell);
    if (head > ESCAPE_CELLS) return null;
    if (head > 0 && seenNode(w, p, ESCAPE_SIGHT)) {
      const route: Vec2[] = [];
      for (let c = cell; c !== start; c = prev[c]) route.push(at(c));
      return route.reverse();
    }
    const i = cell % size;
    const j = Math.floor(cell / size);
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
      const next = nj * size + ni;
      if (prev[next] !== -2) continue;
      const q = at(next);
      if (!walk.isWalkable(q.x, q.z)) continue;
      prev[next] = cell;
      queue.push(next);
    }
  }
  return null;
}
const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A walkable route for the player from `from` to `target` over the nav graph, string-pulled so it never
 * zigzags or walks backwards. Shared by the autopilot and quick travel.
 */
export function planPath(w: World, from: Vec2, target: Vec2): Vec2[] {
  if (lineOfSight(w, from, target)) return [target];
  // Out of a pocket first, if no node can be seen from where the walker stands.
  const escape = seenNode(w, from) ? [] : escapeRoute(w, from) ?? [];
  const startAt = escape.length ? escape[escape.length - 1] : from;
  const start = visibleNode(w, startAt);
  const end = visibleNode(w, target);
  if (!start || !end) return [...escape, target];
  const path = [...escape, ...(w.map.nav.findPath(start, end) ?? []), target];
  const smoothed: Vec2[] = [];
  let cursor = from;
  let i = 0;
  while (i < path.length) {
    let furthest = i;
    for (let j = path.length - 1; j > i; j--) {
      if (lineOfSight(w, cursor, path[j])) {
        furthest = j;
        break;
      }
    }
    smoothed.push(path[furthest]);
    cursor = path[furthest];
    i = furthest + 1;
  }
  return smoothed;
}

/**
 * Follows a planned path: returns the stick direction toward the next waypoint (length ≤ 1), or null on
 * arrival. Re-plans if the walker stalls (someone standing on a waypoint).
 */
export class PathFollower {
  path: Vec2[] = [];
  target: Vec2 | null = null;
  private stuck = 0;
  private last: Vec2 = { x: 0, z: 0 };
  /** Where the leg to the current waypoint started (the start, then each waypoint passed). */
  private prev: Vec2 = { x: 0, z: 0 };
  private readonly stick = { x: 0, y: 0 };

  constructor(private readonly w: World) {}

  go(from: Vec2, target: Vec2): void {
    this.target = { ...target };
    this.path = planPath(this.w, from, target);
    this.stuck = 0;
    this.last = { ...from };
    this.prev = { ...from };
  }

  /** Metres to the next turn of the route (a waypoint with more after it), or Infinity on the last leg. */
  toTurn(pos: Vec2): number {
    if (this.path.length <= 1) return Infinity;
    return Math.hypot(this.path[0].x - pos.x, this.path[0].z - pos.z);
  }

  stop(): void {
    this.target = null;
    this.path = [];
  }

  get active(): boolean {
    return this.target !== null;
  }

  /** Metres left along the route from here. */
  remaining(pos: Vec2): number {
    if (!this.target) return 0;
    let total = 0;
    let from = pos;
    for (const p of this.path.length > 0 ? this.path : [this.target]) {
      total += Math.hypot(p.x - from.x, p.z - from.z);
      from = p;
    }
    return total;
  }

  /** The walker is already past the current waypoint along its leg, and close to it (never walk back to it). */
  private passed(pos: Vec2): boolean {
    const wp = this.path[0];
    const lx = wp.x - this.prev.x;
    const lz = wp.z - this.prev.z;
    return (pos.x - wp.x) * lx + (pos.z - wp.z) * lz > 0 && Math.hypot(pos.x - wp.x, pos.z - wp.z) < PASSED_WITHIN;
  }

  steer(pos: Vec2, dt: number): { x: number; y: number } | null {
    const target = this.target;
    if (!target) return null;
    // A waypoint is done once it is reached or the one after it is in plain sight (session 36, owner: "the player
    // reverses for some reason when entering the carriage": at dash speed the conductor overshot the waypoint at a
    // gangway and turned back to touch it).
    while (this.path.length > 1 && (Math.hypot(this.path[0].x - pos.x, this.path[0].z - pos.z) < WAYPOINT_REACHED * 1.5 || this.passed(pos) || lineOfSight(this.w, pos, this.path[1]))) {
      this.prev = this.path.shift()!;
    }
    const next = this.path[0] ?? target;
    const dx = next.x - pos.x;
    const dz = next.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < WAYPOINT_REACHED && this.path.length <= 1) {
      this.stop();
      return null;
    }
    const moved = Math.hypot(pos.x - this.last.x, pos.z - this.last.z);
    this.last.x = pos.x;
    this.last.z = pos.z;
    this.stuck = moved < 0.002 ? this.stuck + dt : 0;
    if (this.stuck > 0.8) {
      this.stuck = 0;
      if (this.path.length > 1 && d < 0.8) this.prev = this.path.shift()!;
      else {
        this.path = planPath(this.w, pos, target);
        this.prev = { ...pos };
      }
    }
    const k = Math.min(1, d / 0.5);
    this.stick.x = (dx / d) * k;
    this.stick.y = (dz / d) * k;
    return this.stick;
  }
}
