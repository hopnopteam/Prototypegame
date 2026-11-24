import type { Vec2 } from '../core/types';
import { planPath } from './PathPlanner';
import type { World } from './World';

const ARRIVE = 0.22;
const REPATH_SECONDS = 0.6;
/** The average player's work bursts (seconds, min and max) before each breather. */
const IDLE_BURST: [number, number] = [20, 60];
/** The bot saves for the next carriage once it is this many seconds of income away (Phase 3). */
const SAVE_WITHIN = 120;
/** Seconds of earnings in each income sample. */
const INCOME_WINDOW = 30;
/** How often a wandering player changes their mind (seconds). */
const WANDER_STEP = 1.5;

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
  /**
   * Phase 3, the pacing simulator's profiles: the extra time an average player spends idle or wandering, as a share of
   * the time spent working (0 = the efficient "fast player"; 0.3 = the "average player": 30% more time on top). Work
   * comes in bursts of `IDLE_BURST` seconds, each followed by `idleShare` × that idling: half of it standing still,
   * half wandering in short random pushes. Its own seeded random, so the game's randomness is untouched.
   */
  idleShare = 0;
  private burstLeft = 0;
  private lastBurst = 0;
  private idleLeft = 0;
  private wanderLeft = 0;
  private seed = 0x2f6b1;
  /** Income per second (an average over about a minute), from the wallet going up. */
  incomeRate = 0;
  /**
   * Phase 4d (owner): once the bot starts saving for a coupling it keeps saving until it buys it. With false it
   * re-decides every frame from its recent income (the Phase 3 rule), so a stop's fares can tip it either way, like a
   * distracted player (the pacing simulator's `--save=old`).
   */
  stickySave = true;
  private savingFor: string | null = null;
  private lastCash = -1;
  private earned = 0;
  private window = 0;

  constructor(private readonly w: World, private readonly setStick: (x: number, y: number) => void) {}

  update(dt: number): void {
    if (!this.enabled) return;
    const w = this.w;
    const player = w.player;
    this.repath -= dt;
    this.trackIncome(dt);
    // Like a player who follows the Rail Miles hint: spend them as soon as the Conductor sheet unlocks.
    if (w.progression.level >= w.econ.progression.unlockLevels.conductorUpgrades) {
      for (const key of ['capacity', 'fareBonus'] as const) if (w.buyConductorUpgrade(key)) break;
    }
    if (this.idleShare > 0 && this.idle(dt)) return;
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

  /**
   * Phase 3 (owner: "real players chase the new carriage, and the bot should too"): keep an average of what the
   * player earns, and while the next coupling is within `SAVE_WITHIN` seconds of that income, save for it instead of
   * spending on cheaper tiles (`Guidance.botSaving`).
   */
  private trackIncome(dt: number): void {
    const w = this.w;
    const cash = w.wallet.get('cash');
    if (this.lastCash >= 0 && cash > this.lastCash) this.earned += cash - this.lastCash;
    this.lastCash = cash;
    this.window += dt;
    if (this.window >= INCOME_WINDOW) {
      const rate = this.earned / this.window;
      this.incomeRate = this.incomeRate === 0 ? rate : this.incomeRate * 0.5 + rate * 0.5;
      this.earned = 0;
      this.window = 0;
    }
    const couple = w.tiles.coupling();
    const left = couple ? w.unlocks.remaining(couple.def.id) - cash : Infinity;
    const within = left > 0 && left <= this.incomeRate * SAVE_WITHIN;
    if (!this.stickySave) {
      w.guidance.botSaving = within;
      return;
    }
    // Saving once started holds while that same coupling is on show and unpaid.
    if (this.savingFor && (!couple || couple.def.id !== this.savingFor || left <= 0)) this.savingFor = null;
    if (!this.savingFor && within && couple) this.savingFor = couple.def.id;
    w.guidance.botSaving = this.savingFor !== null && left > 0;
  }

  /** True while the average player is taking a breather (looking around, wandering); the stick is set here. */
  private idle(dt: number): boolean {
    if (this.idleLeft > 0) {
      this.idleLeft -= dt;
      this.wanderLeft -= dt;
      if (this.wanderLeft <= 0) {
        this.wanderLeft = WANDER_STEP;
        // Half the pushes stand still, half walk a few steps a random way (walls simply stop them).
        if (this.rand() < 0.5) this.setStick(0, 0);
        else {
          const a = this.rand() * Math.PI * 2;
          this.setStick(Math.cos(a) * 0.7, Math.sin(a) * 0.7);
        }
      }
      if (this.idleLeft <= 0) {
        this.repath = 0;
        this.setStick(0, 0);
      }
      return this.idleLeft > 0;
    }
    this.burstLeft -= dt;
    if (this.burstLeft <= 0) {
      // A breather after each burst of work (none before the first), as long as `idleShare` of that burst.
      if (this.lastBurst > 0) this.idleLeft = this.lastBurst * this.idleShare;
      this.lastBurst = IDLE_BURST[0] + this.rand() * (IDLE_BURST[1] - IDLE_BURST[0]);
      this.burstLeft = this.lastBurst;
    }
    return false;
  }

  /** A small seeded random of its own (mulberry32), so the game's random stream is unchanged. */
  private rand(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private plan(target: Vec2): Vec2[] {
    return planPath(this.w, this.w.player.pos, target);
  }
}
