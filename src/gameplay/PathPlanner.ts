import type { Vec2 } from '../core/types';
import type { World } from './World';

/** Distance at which a waypoint counts as reached. */
export const WAYPOINT_REACHED = 0.22;

/** True when a straight walk from a to b never leaves the floor. */
export function lineOfSight(w: World, a: Vec2, b: Vec2): boolean {
  const walk = w.map.walk;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(d / 0.15));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!walk.isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

function visibleNode(w: World, p: Vec2): string | null {
  const map = w.map;
  let best: string | null = null;
  let bestD = Infinity;
  for (const id of map.nav.ids()) {
    if (id.startsWith('p:') && !map.areDoorsOpen) continue;
    const n = map.nav.position(id);
    const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
    if (d < bestD && lineOfSight(w, p, n)) {
      bestD = d;
      best = id;
    }
  }
  return best ?? map.nearestNode(p.x, p.z);
}

/**
 * A walkable route for the player from `from` to `target` over the nav graph, string-pulled so it never
 * zigzags or walks backwards. Shared by the autopilot and quick travel.
 */
export function planPath(w: World, from: Vec2, target: Vec2): Vec2[] {
  if (lineOfSight(w, from, target)) return [target];
  const start = visibleNode(w, from);
  const end = visibleNode(w, target);
  if (!start || !end) return [target];
  const path = [...(w.map.nav.findPath(start, end) ?? []), target];
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
  private readonly stick = { x: 0, y: 0 };

  constructor(private readonly w: World) {}

  go(from: Vec2, target: Vec2): void {
    this.target = { ...target };
    this.path = planPath(this.w, from, target);
    this.stuck = 0;
    this.last = { ...from };
  }

  stop(): void {
    this.target = null;
    this.path = [];
  }

  get active(): boolean {
    return this.target !== null;
  }

  steer(pos: Vec2, dt: number): { x: number; y: number } | null {
    const target = this.target;
    if (!target) return null;
    while (this.path.length > 1 && Math.hypot(this.path[0].x - pos.x, this.path[0].z - pos.z) < WAYPOINT_REACHED * 1.5) this.path.shift();
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
      if (this.path.length > 1 && d < 0.8) this.path.shift();
      else this.path = planPath(this.w, pos, target);
    }
    const k = Math.min(1, d / 0.5);
    this.stick.x = (dx / d) * k;
    this.stick.y = (dz / d) * k;
    return this.stick;
  }
}
