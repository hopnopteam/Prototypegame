// The flight camera: a critically damped spring on each axis (never a jittery lerp), a lead in the direction of
// climb, and screen shake from a decaying trauma value (shake = trauma², SPEC B11).
import { CAMERA } from './config';
import { toScreenY, type Stage } from './Stage';

/** One step of a critically damped spring, solved implicitly so it is stable at any frame time. */
export function springStep(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  return [(f * x + dt * v + hhoo * target) * det, (v + hoo * (target - x)) * det];
}

export class CameraRig {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  private trauma = 0;
  private time = 0;
  zoom = 1;

  constructor(private readonly stage: Stage) {}

  /** Jumps straight to a target (a new run). */
  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.trauma = 0;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Where the camera wants to be for a point (the suit's soles) moving at vy, within the course's floor. */
  target(x: number, y: number, vy: number, floorY: number): [number, number] {
    const lead = Math.max(CAMERA.leadMinM, Math.min(CAMERA.leadMaxM, vy * CAMERA.leadSeconds));
    const halfH = this.stage.viewHeightM / 2 / this.zoom;
    const halfW = this.stage.viewWidthM / 2 / this.zoom;
    const side = Math.max(0, this.courseHalfWidth - halfW);
    return [Math.max(-side, Math.min(side, x * CAMERA.followX)), Math.max(floorY - CAMERA.floorMarginM + halfH, y + CAMERA.lookUpM + lead)];
  }

  /** Half the course's width: the camera never shows past it. */
  courseHalfWidth = 5;

  follow(targetX: number, targetY: number, vy: number, floorY: number, dt: number): void {
    const [tx, ty] = this.target(targetX, targetY, vy, floorY);
    [this.y, this.vy] = springStep(this.y, this.vy, ty, CAMERA.omegaY, dt);
    [this.x, this.vx] = springStep(this.x, this.vx, tx, CAMERA.omegaX, dt);
  }

  /** Positions the world container for this frame. */
  apply(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - CAMERA.traumaDecay * dt);
    const shake = this.trauma * this.trauma;
    const t = this.time * CAMERA.shakeHz;
    const nx = Math.sin(t * 1.0) * 0.6 + Math.sin(t * 2.31 + 1.7) * 0.4;
    const ny = Math.sin(t * 1.37 + 0.4) * 0.6 + Math.sin(t * 2.83 + 2.9) * 0.4;
    const nr = Math.sin(t * 0.91 + 3.1);
    const world = this.stage.layers.world;
    const ppm = this.stage.ppm * this.zoom;
    // Pivot on the camera point so the shake's roll turns about the middle of the screen.
    world.scale.set(ppm);
    world.rotation = nr * CAMERA.shakeRoll * shake;
    world.pivot.set(this.x + nx * CAMERA.shakeM * shake, toScreenY(this.y + ny * CAMERA.shakeM * shake));
    world.position.set(this.stage.widthPx / 2, this.stage.heightPx / 2);
  }
}
