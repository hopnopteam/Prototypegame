import { SCOOTER_SPEED_BONUS } from '../config/content';
import { approach, dampAngle } from '../core/math';
import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import { CharacterView, CONDUCTOR_LOOK } from '../world/CharacterView';
import type { Actor } from './Actor';
import { CarryStack } from './CarryStack';
import type { Input } from './Input';
import type { World } from './World';

/** The conductor: one finger to walk, everything else happens by walking over things. */
export class Player implements Actor {
  readonly isPlayer = true;
  readonly workMultiplier = 1;
  readonly pos: Vec2;
  readonly view = new CharacterView(CONDUCTOR_LOOK);
  readonly stack: CarryStack;
  private vx = 0;
  private vz = 0;
  private facing = Math.PI;
  idleSeconds = 0;
  speedNow = 0;

  constructor(private readonly w: World, private readonly input: Input, spawn: Vec2) {
    this.pos = { x: spawn.x, z: spawn.z };
    this.stack = new CarryStack(this.view.stackAnchor, w.scene, w.tweens, this.capacity());
    w.scene.add(this.view.root);
  }

  capacity(): number {
    return this.w.econ.player.baseCarryCapacity + this.w.data.conductor.capacity * this.w.econ.conductor.capacity.perLevel;
  }

  speed(): number {
    const w = this.w;
    let speed = w.econ.player.moveSpeed * (1 + w.data.conductor.speed * w.econ.conductor.speed.perLevel);
    if (w.iap.isOwned('conductor_scooter')) speed *= 1 + SCOOTER_SPEED_BONUS;
    if (Date.now() < w.data.monetization.speedBoostUntil) speed *= w.econ.rewarded.speedBoost.multiplier;
    return speed;
  }

  get boosted(): boolean {
    return Date.now() < this.w.data.monetization.speedBoostUntil;
  }

  update(dt: number): void {
    const w = this.w;
    this.stack.capacity = this.capacity();
    const stick = this.input.read();
    const max = this.speed();
    // Screen up is world -z; screen right is world +x (the camera looks up the train).
    const tx = stick.x * max;
    const tz = stick.y * max;
    const accel = w.econ.player.acceleration * dt;
    this.vx = approach(this.vx, tx, accel);
    this.vz = approach(this.vz, tz, accel);
    const moving = Math.hypot(this.vx, this.vz) > 0.05;
    if (moving) {
      const before = { x: this.pos.x, z: this.pos.z };
      w.map.walk.move(this.pos, this.vx * dt, this.vz * dt);
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.speedNow = moved / Math.max(1e-4, dt);
      if (Math.hypot(tx, tz) > 0.1) this.facing = dampAngle(this.facing, Math.atan2(tx, tz), 14, dt);
      this.idleSeconds = 0;
    } else {
      this.speedNow = 0;
      this.idleSeconds += dt;
    }
    this.view.setPosition(this.pos.x, FLOOR_Y, this.pos.z);
    this.view.setFacing(this.facing);
    this.view.setCarrying(!this.stack.isEmpty);
    this.view.update(dt, this.speedNow);
    this.stack.update(dt, moving, w.time);

    if (this.boosted && moving && Math.random() < dt * 12) {
      w.particles.emit('sparkle', this.pos.x, FLOOR_Y + 0.1, this.pos.z, 1, 0.2);
    }
  }
}
