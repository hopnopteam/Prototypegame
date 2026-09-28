import type { Vec2 } from '../core/types';
import type { World } from './World';

const ARRIVE = 0.22;
const REPATH_SECONDS = 0.6;

/**
 * Plays the game like an attentive player: asks the guidance system for the most useful target and walks
 * there along the nav graph. Used to measure first-session pacing against the §14 timeline and to catch
 * soft-locks; also handy for recording hands-free footage. Enable with the #autoplay link or dev tools.
 */
export class Autopilot {
  enabled = false;
  private path: Vec2[] = [];
  private target: Vec2 | null = null;
  private repath = 0;
  private stuck = 0;
  private lastPos: Vec2 = { x: 0, z: 0 };

  constructor(private readonly w: World, private readonly setStick: (x: number, y: number) => void) {}

  update(dt: number): void {
    if (!this.enabled) return;
    const w = this.w;
    const player = w.player;
    this.repath -= dt;
    const target = w.guidance.bestTarget(true);
    const changed = !target || !this.target || Math.hypot(target.x - this.target.x, target.z - this.target.z) > 0.3;
    if (changed || this.repath <= 0) {
      this.target = target;
      this.path = target ? this.plan(target) : [];
      this.repath = REPATH_SECONDS;
    }
    if (!this.target) {
      this.setStick(0, 0);
      return;
    }
    // Drop waypoints already reached.
    while (this.path.length > 1 && Math.hypot(this.path[0].x - player.pos.x, this.path[0].z - player.pos.z) < ARRIVE * 1.5) this.path.shift();
    const next = this.path[0] ?? this.target;
    const dx = next.x - player.pos.x;
    const dz = next.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE && this.path.length <= 1) {
      this.setStick(0, 0);
      return;
    }
    const k = Math.min(1, d / 0.5);
    this.setStick((dx / d) * k, (dz / d) * k);

    // Unstick: if we barely moved while trying, re-plan from scratch.
    const moved = Math.hypot(player.pos.x - this.lastPos.x, player.pos.z - this.lastPos.z);
    this.lastPos = { x: player.pos.x, z: player.pos.z };
    this.stuck = moved < 0.002 ? this.stuck + dt : 0;
    if (this.stuck > 0.8) {
      this.stuck = 0;
      this.repath = 0;
      this.path = [];
    }
  }

  private plan(target: Vec2): Vec2[] {
    const w = this.w;
    const map = w.map;
    const player = w.player.pos;
    if (this.lineOfSight(player, target)) return [target];
    const from = this.visibleNode(player);
    const to = this.visibleNode(target);
    if (!from || !to) return [target];
    const path = [...(map.nav.findPath(from, to) ?? []), target];
    // String-pull: skip any waypoint when a later one is in plain sight, so re-plans never walk backwards.
    const smoothed: Vec2[] = [];
    let cursor = player;
    let i = 0;
    while (i < path.length) {
      let furthest = i;
      for (let j = path.length - 1; j > i; j--) {
        if (this.lineOfSight(cursor, path[j])) {
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

  private visibleNode(p: Vec2): string | null {
    const map = this.w.map;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of map.nav.ids()) {
      if (id.startsWith('p:') && !map.areDoorsOpen) continue;
      const n = map.nav.position(id);
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bestD && this.lineOfSight(p, n)) {
        bestD = d;
        best = id;
      }
    }
    return best ?? map.nearestNode(p.x, p.z);
  }

  private lineOfSight(a: Vec2, b: Vec2): boolean {
    const walk = this.w.map.walk;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(2, Math.ceil(d / 0.15));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!walk.isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }
}
