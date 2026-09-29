import type { Vec2 } from '../core/types';
import { planPath } from './PathPlanner';
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
    // Like a player who follows the Rail Miles hint: spend them as soon as the Conductor sheet unlocks.
    if (w.progression.level >= w.econ.progression.unlockLevels.conductorUpgrades) {
      for (const key of ['speed', 'capacity', 'fareBonus'] as const) if (w.buyConductorUpgrade(key)) break;
    }
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
      // Someone is standing on the waypoint: if it is close, treat it as reached and carry on.
      if (this.path.length > 1 && d < 0.8) this.path.shift();
      else {
        this.repath = 0;
        this.path = [];
      }
    }
  }

  private plan(target: Vec2): Vec2[] {
    return planPath(this.w, this.w.player.pos, target);
  }
}
