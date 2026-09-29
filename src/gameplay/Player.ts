import { SCOOTER_SPEED_BONUS } from '../config/content';
import { approach, dampAngle } from '../core/math';
import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import { CharacterView, CONDUCTOR_LOOK } from '../world/CharacterView';
import type { Actor } from './Actor';
import { CarryStack } from './CarryStack';
import { OUTFITS, type OutfitDef } from '../config/wardrobe';
import { ConductorGear } from '../world/ConductorGear';
import type { Input } from './Input';
import { PathFollower } from './PathPlanner';
import type { World } from './World';

const PLAYER_SCALE = 1.1;

/** The conductor: one finger to walk, everything else happens by walking over things. */
export class Player implements Actor {
  readonly isPlayer = true;
  readonly workMultiplier = 1;
  readonly pos: Vec2;
  /** A touch taller than everyone else, so the eye finds the conductor first. */
  readonly view = new CharacterView(CONDUCTOR_LOOK, PLAYER_SCALE);
  private readonly gear: ConductorGear;
  readonly stack: CarryStack;
  private vx = 0;
  private vz = 0;
  private facing = Math.PI;
  idleSeconds = 0;
  speedNow = 0;
  /** Current velocity (m/s), for the camera's lead. */
  get velocity(): { x: number; z: number } {
    return { x: this.vx, z: this.vz };
  }

  /** 0…1: how far into a stride the conductor is (the camera eases out a touch as they pick up pace). */
  strideAmount = 0;
  private strideTime = 0;
  private strideAngle = 0;
  /** Quick travel (tap a carriage on the train map): walks the route at dash speed until you touch the stick. */
  readonly travel: PathFollower;
  private dashTrail = 0;

  constructor(private readonly w: World, private readonly input: Input, spawn: Vec2) {
    this.pos = { x: spawn.x, z: spawn.z };
    this.stack = new CarryStack(this.view.stackAnchor, w.scene, w.tweens, this.capacity());
    this.travel = new PathFollower(w);
    this.gear = new ConductorGear(this.view, CONDUCTOR_LOOK);
    w.scene.add(this.view.root);
  }

  /** The outfit being worn (falls back to the classic navy if the saved one is not available). */
  outfit(): OutfitDef {
    const w = this.w;
    const chosen = OUTFITS.find((o) => o.id === w.data.cosmetics.outfit);
    const available = (o: OutfitDef): boolean => (o.minLevel !== undefined ? w.progression.level >= o.minLevel : w.data.cosmetics.outfits.includes(o.id));
    return chosen && available(chosen) ? chosen : OUTFITS[0];
  }

  travelTo(target: Vec2): void {
    this.travel.go(this.pos, target);
  }

  capacity(): number {
    return this.w.econ.player.baseCarryCapacity + this.w.data.conductor.capacity * this.w.econ.conductor.capacity.perLevel;
  }

  speed(): number {
    const w = this.w;
    let speed = w.econ.player.moveSpeed * (1 + w.data.conductor.speed * w.econ.conductor.speed.perLevel) * (1 + w.data.meta.perks.speedBonus);
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
    let stick = this.input.read();
    let max = this.speed();
    if (this.travel.active) {
      // Any touch on the stick takes back control.
      if (Math.hypot(stick.x, stick.y) > 0.15) this.travel.stop();
      else {
        const left = this.travel.remaining(this.pos);
        stick = this.travel.steer(this.pos, dt) ?? { x: 0, y: 0 };
        // Quick travel takes at most a second and a half, however long the train has grown.
        const p = w.econ.player;
        max *= Math.min(p.maxDashMultiplier, Math.max(p.dashMultiplier, left / (p.dashMaxSeconds * this.speed())));
        this.dashTrail -= dt;
        if (this.dashTrail <= 0 && this.speedNow > 1) {
          this.dashTrail = 0.06;
          w.particles.emit('dust', this.pos.x, FLOOR_Y + 0.05, this.pos.z, 1, 0.15);
        }
      }
    }
    // Stride: a steady push the same way builds pace (quick travel has its own).
    const push = Math.hypot(stick.x, stick.y);
    const stride = w.econ.player.stride;
    if (!this.travel.active && push > 0.7) {
      const angle = Math.atan2(stick.x, stick.y);
      const turn = Math.abs(Math.atan2(Math.sin(angle - this.strideAngle), Math.cos(angle - this.strideAngle)));
      if (this.strideTime === 0 || turn > (stride.turnResetDegrees * Math.PI) / 180) {
        this.strideTime = dt;
        this.strideAngle = angle;
      } else {
        this.strideTime += dt;
        this.strideAngle = dampAngle(this.strideAngle, angle, 4, dt);
      }
    } else {
      this.strideTime = 0;
    }
    const ramp = Math.min(1, Math.max(0, (this.strideTime - stride.delaySeconds) / stride.rampSeconds));
    this.strideAmount = ramp * ramp * (3 - 2 * ramp);
    max *= 1 + (stride.multiplier - 1) * this.strideAmount;
    if (this.strideAmount > 0.5) {
      this.dashTrail -= dt;
      if (this.dashTrail <= 0 && this.speedNow > 1) {
        this.dashTrail = 0.09;
        w.particles.emit('dust', this.pos.x, FLOOR_Y + 0.05, this.pos.z, 1, 0.12);
      }
    }
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
    const m = w.data.monetization;
    this.gear.update(dt, {
      outfit: this.outfit(),
      speedLevel: w.data.conductor.speed,
      capacityLevel: w.data.conductor.capacity,
      charmLevel: w.data.conductor.fareBonus,
      skating: this.boosted,
      scooter: w.iap.isOwned('conductor_scooter'),
      doubled: m.doubleFaresStop !== null && m.doubleFaresStop >= w.journey.stopSerial && m.doubleFaresStop <= w.journey.stopSerial + 1,
      carrying: !this.stack.isEmpty,
    });
    this.stack.update(dt, moving, w.time);

    if (this.boosted && moving && Math.random() < dt * 12) {
      w.particles.emit('sparkle', this.pos.x, FLOOR_Y + 0.1, this.pos.z, 1, 0.2);
    }
  }
}
