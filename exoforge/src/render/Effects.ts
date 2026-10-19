// Juice for the flight (SPEC B9 rule 9, B11): turns sim events and the suit's state into particles, shake,
// flashes and floating words. Visual only: it reads the simulation and never changes it.
import { RAPIER, LAYER, groups } from '../sim/physics';
import type { Run } from '../sim/Run';
import type { SimEvent } from '../sim/events';
import { NOZZLES, PLATES } from '../sim/rig';
import { HEAT } from '../econ/balance';
import type { Particles } from './Particles';
import type { CameraRig } from './CameraRig';
import type { SuitView } from './SuitView';
import type { DroneView } from './DroneView';

const PLATE_ART = ['suit.w1.plate.chest', 'suit.w1.plate.shoulder', 'suit.w1.plate.hip'];
const RAY_GROUPS = groups(LAYER.suit, LAYER.terrain);
/** Thrust kicks up dust from ground closer than this, metres. */
const DUST_RANGE = 2.6;

export interface FxHost {
  /** A floating word at a world point (crisp HTML text over the canvas). */
  floatText(text: string, x: number, y: number, kind: 'rest' | 'patch' | 'hit' | 'warn'): void;
  /** The HUD reacts (a plate icon pops, a dial shakes). */
  hudPulse(what: 'plates' | 'heat' | 'battery'): void;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export class Effects {
  private run: Run | null = null;
  private dustAcc = 0;
  private steamAcc = 0;
  private smokeAcc = 0;
  private sparkCooldown = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0 }, { x: 0, y: -1 });

  constructor(
    private readonly particles: Particles,
    private readonly camera: CameraRig,
    private readonly suit: SuitView,
    private readonly drone: DroneView,
    private readonly host: FxHost,
  ) {
    suit.onPlateLost = (index, x, y) => {
      this.particles.emit({ id: PLATE_ART[index], x, y, vx: rand(-2.5, 2.5), vy: rand(2, 4), life: 1.6, gravity: 14, spin: rand(-9, 9), alpha: 1, alphaEnd: 0.8 });
    };
  }

  begin(run: Run): void {
    this.run = run;
    this.dustAcc = this.steamAcc = this.smokeAcc = 0;
    this.particles.clear();
    this.drone.reset();
  }

  handle(events: readonly SimEvent[]): void {
    const run = this.run;
    if (!run) return;
    for (const e of events) {
      switch (e.type) {
        case 'bump':
          if (this.sparkCooldown <= 0) {
            this.sparks(e.x, e.y, e.nx, e.ny, 4, 4);
            this.dust(e.x, e.y, 2, 0.6);
            this.camera.addTrauma(0.12);
            this.sparkCooldown = 0.08;
          }
          break;
        case 'hit':
          this.suit.hitFlash();
          this.suit.addDent();
          this.sparks(e.x, e.y, e.nx, e.ny, 12, 7);
          this.dust(e.x, e.y, 5, 1.2);
          this.particles.emit({ id: 'vfx.ring', x: e.x, y: e.y, life: 0.35, size: 0.6, sizeEnd: 1.6, alpha: 0.9, rotation: Math.atan2(-e.nx, e.ny) });
          this.camera.addTrauma(Math.min(0.75, 0.3 + e.damage * 0.35));
          this.host.hudPulse('plates');
          break;
        case 'overheatWarn': {
          const p = this.suit.worldPoint(-0.45, 1.4);
          for (let i = 0; i < 4; i++) this.steam(p.x, p.y, 1.4);
          this.host.hudPulse('heat');
          break;
        }
        case 'sputter': {
          for (const n of NOZZLES) {
            const p = this.suit.worldPoint(n.x, n.y);
            for (let i = 0; i < 5; i++) this.smoke(p.x, p.y, true);
          }
          this.host.floatText('OVERHEAT!', run.suit.soles().x, run.suit.soles().y + 2.6, 'warn');
          this.camera.addTrauma(0.25);
          this.host.hudPulse('heat');
          break;
        }
        case 'liftoff': {
          const s = run.suit.soles();
          this.particles.emit({ id: 'vfx.ring', x: s.x, y: s.y + 0.05, life: 0.4, size: 0.5, sizeEnd: 1.4, alpha: 0.8 });
          this.dust(s.x, s.y, 5, 1.0);
          break;
        }
        case 'rest': {
          const s = run.suit.soles();
          this.host.floatText('REST', s.x, s.y + 2.4, 'rest');
          for (let i = 0; i < 6; i++) this.steam(s.x + rand(-0.4, 0.4), s.y + rand(0.8, 1.6), 0.8);
          break;
        }
        case 'patchIncoming': {
          const s = run.suit.soles();
          const side = -run.suit.facing;
          this.drone.comeToPatch({ x: s.x + side * 6, y: s.y + 4 }, { x: s.x + side * 0.85, y: s.y + 2.1 });
          break;
        }
        case 'patch': {
          const p = this.suit.worldPoint(PLATES[0].cx, PLATES[0].cy);
          for (let i = 0; i < 8; i++) this.particles.emit({ id: 'vfx.sparkle', x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), vy: rand(0.5, 1.5), life: 0.6, size: rand(0.4, 0.9), sizeEnd: 0, additive: true, tint: 0x9ff7ee });
          this.sparks(p.x, p.y, -run.suit.facing, 0.3, 6, 3);
          this.host.floatText('+1 PLATE', p.x, p.y + 1.4, 'patch');
          this.host.hudPulse('plates');
          this.drone.celebrate();
          const s = run.suit.soles();
          setTimeout(() => this.drone.leave({ x: s.x - run.suit.facing * 7, y: s.y + 6 }), 420);
          break;
        }
        case 'patchCancel': {
          const s = run.suit.soles();
          this.drone.leave({ x: s.x - run.suit.facing * 7, y: s.y + 6 });
          break;
        }
        case 'batteryEmpty': {
          const s = run.suit.soles();
          this.host.floatText('BATTERY FLAT', s.x, s.y + 2.6, 'warn');
          this.host.hudPulse('battery');
          for (const n of NOZZLES) {
            const p = this.suit.worldPoint(n.x, n.y);
            for (let i = 0; i < 3; i++) this.smoke(p.x, p.y, true);
          }
          break;
        }
        case 'crash': {
          const p = this.suit.torsoPoint();
          this.sparks(p.x, p.y, 0, 1, 18, 8);
          this.dust(p.x, p.y, 8, 1.6);
          this.camera.addTrauma(0.9);
          break;
        }
        case 'towAttach': {
          const p = this.suit.torsoPoint();
          this.sparks(p.x, p.y + 0.4, 0, 1, 4, 2);
          break;
        }
        case 'exit':
          this.camera.addTrauma(0.3);
          break;
        default:
          break;
      }
    }
  }

  /** Continuous effects: dust under the boots, steam when hot, smoke while sputtering. */
  update(dt: number): void {
    this.particles.update(dt);
    this.sparkCooldown -= dt;
    const run = this.run;
    if (!run) return;
    const hook = run.tow ? this.suit.torsoPoint() : null;
    this.drone.update(run, hook, dt);
    if (run.phase !== 'flight') return;
    const suit = run.suit;
    const s = suit.soles();
    this.drone.follow({ x: s.x - suit.facing * 0.85, y: s.y + 2.1 });

    // Thrust blows dust off the ground below.
    if (suit.thrust > 0.15) {
      this.ray.origin = { x: s.x, y: s.y + 0.05 };
      this.ray.dir = { x: 0, y: -1 };
      const hit = run.world.castRay(this.ray, DUST_RANGE, true, undefined, RAY_GROUPS);
      if (hit) {
        const gap = hit.timeOfImpact;
        this.dustAcc += dt * 28 * suit.thrust * (1 - gap / DUST_RANGE);
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          this.particles.emit({ id: 'vfx.dust', x: s.x + rand(-0.2, 0.2), y: s.y - gap + 0.08, vx: side * rand(1.5, 3.5), vy: rand(0.2, 0.9), life: rand(0.5, 0.9), size: rand(0.4, 0.7), sizeEnd: rand(1.1, 1.6), alpha: 0.55, drag: 0.15 });
        }
      }
    }
    // Steam vents from the backpack above the warning line.
    if (suit.heat.heat > HEAT.warnAt || suit.heat.sputterLeft > 0) {
      this.steamAcc += dt * (suit.heat.sputterLeft > 0 ? 14 : 8);
      while (this.steamAcc >= 1) {
        this.steamAcc -= 1;
        const p = this.suit.worldPoint(-0.45, 1.45);
        this.steam(p.x, p.y, 1.1);
      }
    }
    // Sputter coughs smoke from the boots.
    if (suit.heat.sputterLeft > 0) {
      this.smokeAcc += dt * 16;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const n = NOZZLES[Math.random() < 0.5 ? 0 : 1];
        const p = this.suit.worldPoint(n.x, n.y);
        this.smoke(p.x, p.y, false);
      }
    }
  }

  private sparks(x: number, y: number, nx: number, ny: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(ny, nx) + rand(-1.1, 1.1);
      const v = speed * rand(0.4, 1.1);
      this.particles.emit({ id: 'vfx.spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.18, 0.4), size: rand(0.6, 1.1), sizeEnd: 0.2, gravity: 9, align: true, additive: true, tint: 0xffd27a });
    }
  }

  private dust(x: number, y: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.emit({ id: 'vfx.dust', x: x + rand(-0.2, 0.2), y: y + rand(-0.1, 0.2), vx: rand(-spread, spread), vy: rand(0, spread), life: rand(0.5, 1.0), size: rand(0.3, 0.6), sizeEnd: rand(0.9, 1.4), alpha: 0.6, drag: 0.2 });
    }
  }

  private steam(x: number, y: number, rise: number): void {
    this.particles.emit({ id: 'vfx.steam', x: x + rand(-0.08, 0.08), y, vx: rand(-0.6, 0.2), vy: rand(0.6, 1.4) * rise, life: rand(0.6, 1.1), size: rand(0.3, 0.5), sizeEnd: rand(1.0, 1.5), alpha: 0.7, drag: 0.3 });
  }

  private smoke(x: number, y: number, burst: boolean): void {
    const k = burst ? 1.6 : 1;
    this.particles.emit({ id: 'vfx.smoke', x, y, vx: rand(-0.8, 0.8) * k, vy: rand(-1.8, -0.6) * k, life: rand(0.6, 1.1), size: rand(0.3, 0.5), sizeEnd: rand(1.1, 1.7), alpha: 0.75, drag: 0.25, tint: 0x8a8090 });
  }
}
