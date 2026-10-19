// The helper drone flies in, hooks the suit (or what is left of it) with a cable and drags it off (SPEC A5.3).
import type { RigidBody } from './physics';
import { TOW } from '../econ/balance';
import type { SimEvent } from './events';

export type TowPhase = 'approach' | 'lift' | 'done';

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t;

export class Tow {
  phase: TowPhase = 'approach';
  /** The drone's position. */
  readonly drone = { x: 0, y: 0 };
  /** Where the cable hooks the suit, in the world (for the cable sprite). */
  readonly hook = { x: 0, y: 0 };
  attached = false;
  private t = 0;
  private readonly start = { x: 0, y: 0 };
  private readonly liftFrom = { x: 0, y: 0 };
  private readonly side: number;

  constructor(private readonly target: RigidBody, private readonly mass: number, side: number) {
    this.side = side >= 0 ? 1 : -1;
    const p = target.translation();
    this.start.x = p.x - this.side * TOW.startOffset.x;
    this.start.y = p.y + TOW.startOffset.y;
    this.drone.x = this.start.x;
    this.drone.y = this.start.y;
  }

  step(dt: number, events: SimEvent[]): void {
    if (this.phase === 'done') return;
    this.t += dt;
    const p = this.target.translation();
    this.hook.x = p.x;
    this.hook.y = p.y;
    if (this.phase === 'approach') {
      const k = easeInOut(Math.min(1, this.t / TOW.approachSeconds));
      const hoverX = p.x;
      const hoverY = p.y + TOW.cableLength + 0.4;
      this.drone.x = this.start.x + (hoverX - this.start.x) * k;
      this.drone.y = this.start.y + (hoverY - this.start.y) * k;
      if (this.t >= TOW.approachSeconds) {
        this.phase = 'lift';
        this.attached = true;
        this.t = 0;
        this.liftFrom.x = this.drone.x;
        this.liftFrom.y = this.drone.y;
        events.push({ type: 'towAttach' });
      }
      return;
    }
    // Lift: the drone climbs away, accelerating; a damped spring on the cable drags the suit after it.
    const k = easeIn(Math.min(1, this.t / TOW.liftSeconds));
    this.drone.x = this.liftFrom.x + this.side * 3 * k;
    this.drone.y = this.liftFrom.y + TOW.liftDistance * k;
    const ax = this.drone.x;
    const ay = this.drone.y - TOW.cableLength;
    const v = this.target.linvel();
    const fx = TOW.stiffnessPerKg * this.mass * (ax - p.x) - TOW.dampingPerKg * this.mass * v.x;
    const fy = TOW.stiffnessPerKg * this.mass * (ay - p.y) - TOW.dampingPerKg * this.mass * v.y;
    this.target.applyImpulse({ x: fx * dt, y: fy * dt }, true);
    if (this.t >= TOW.liftSeconds) this.phase = 'done';
  }
}
