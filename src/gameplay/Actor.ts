import { dampAngle } from '../core/math';
import type { Vec2 } from '../core/types';
import type { CharacterView } from '../world/CharacterView';
import type { CarryStack } from './CarryStack';

/** Anything that can stand in a zone and do work there: the player and staff. */
export interface Actor {
  readonly isPlayer: boolean;
  readonly pos: Vec2;
  readonly stack: CarryStack;
  readonly view: CharacterView;
  /** Staff work a little slower than the player (§ "doing it yourself feels best"). */
  readonly workMultiplier: number;
}

/**
 * Follows a list of waypoints at a given speed and faces the way it walks. Shared by guests and staff so
 * both move with the same readable, unhurried gait.
 */
export class Mover {
  private path: Vec2[] = [];
  private index = 0;
  private onArrive: (() => void) | null = null;
  facing = 0;
  speedNow = 0;

  constructor(readonly pos: Vec2, public speed: number) {}

  get isMoving(): boolean {
    return this.index < this.path.length;
  }

  /** Starts walking; `path` is in world coordinates and should end at the destination. */
  go(path: Vec2[], onArrive?: () => void): void {
    this.path = path;
    this.index = 0;
    this.onArrive = onArrive ?? null;
    if (path.length === 0) this.finish();
  }

  stop(): void {
    this.path = [];
    this.index = 0;
    this.onArrive = null;
  }

  faceTowards(x: number, z: number): void {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-6) this.facing = Math.atan2(dx, dz);
  }

  update(dt: number, faceSharpness = 12): void {
    if (this.index >= this.path.length) {
      this.speedNow = 0;
      return;
    }
    let remaining = this.speed * dt;
    while (remaining > 0 && this.index < this.path.length) {
      const target = this.path[this.index];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= remaining) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        remaining -= d;
        this.index++;
      } else {
        this.pos.x += (dx / d) * remaining;
        this.pos.z += (dz / d) * remaining;
        this.facing = dampAngle(this.facing, Math.atan2(dx, dz), faceSharpness, dt);
        remaining = 0;
      }
    }
    this.speedNow = this.speed;
    if (this.index >= this.path.length) this.finish();
  }

  private finish(): void {
    const callback = this.onArrive;
    this.onArrive = null;
    this.path = [];
    this.index = 0;
    this.speedNow = 0;
    callback?.();
  }
}
