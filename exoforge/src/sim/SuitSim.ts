// The suit in flight: one rigid body (a capsule torso and two box legs) driven by boot thrust, a gyro and drag,
// with heat, battery, armor and rest (SPEC A5.2, A6). Pure simulation: no rendering.
import { RAPIER, LAYER, groups, NO_COLLISION, type World, type RigidBody, type Collider } from './physics';
import { FLIGHT_SHAPES } from './rig';
import { G0, HEAT, IMPACT, REST, type SuitParams, type WorldPhysics } from '../econ/balance';
import { newHeat, stepHeat, thrustFactor, type HeatState } from './Heat';
import { impactDamage, patched } from './Damage';
import type { PilotInput } from './Input';
import type { CourseLedge } from './Course';
import type { SimEvent } from './events';

const DEG = Math.PI / 180;

export interface SuitFlags {
  invulnerable: boolean;
  infiniteBattery: boolean;
  noHeat: boolean;
}

export const NO_FLAGS: Readonly<SuitFlags> = Object.freeze({ invulnerable: false, infiniteBattery: false, noHeat: false });

/** What the debug overlay draws: the last step's forces and contacts. */
export interface SuitVectors {
  thrust: { x: number; y: number };
  velocity: { x: number; y: number };
  com: { x: number; y: number };
  contacts: { x: number; y: number; nx: number; ny: number }[];
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class Suit {
  readonly body: RigidBody;
  readonly colliders: Collider[];
  readonly params: SuitParams;
  /** 0 to 1, after the ramp (what the boots are actually asked for). */
  throttle = 0;
  /** Effective thrust share this step (throttle × sputter × battery). */
  thrust = 0;
  readonly heat: HeatState = newHeat();
  /** 0 to 1. */
  battery = 1;
  batteryEmpty = false;
  integrity: number;
  /** +1 facing right, −1 facing left (the sprite and the ragdoll follow it). */
  facing = 1;
  /** The tilt the gyro is steering for, radians, positive leaning right. */
  targetTilt = 0;
  holding = false;
  grounded = false;
  resting = false;
  restLedge: string | null = null;
  readonly restedLedges = new Set<string>();
  readonly patchedLedges = new Set<string>();
  readonly vectors: SuitVectors = { thrust: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, com: { x: 0, y: 0 }, contacts: [] };

  private restTimer = 0;
  private patchTimer = -1;
  private patchLedge: string | null = null;
  private lastHitTime = -1;
  private lastHitSpeed = 0;
  private wasGrounded = true;
  private time = 0;
  private readonly preVel = { x: 0, y: 0 };
  private preAngVel = 0;
  private readonly preCom = { x: 0, y: 0 };
  private readonly terrain: Set<number>;
  private readonly ledges: readonly CourseLedge[];

  constructor(
    private readonly world: World,
    params: SuitParams,
    spawn: { x: number; y: number },
    terrain: Set<number>,
    ledges: readonly CourseLedge[],
    private readonly env: WorldPhysics,
    private readonly flags: SuitFlags,
  ) {
    this.params = params;
    this.integrity = params.plates;
    this.terrain = terrain;
    this.ledges = ledges;
    const inertia = params.massKg * params.gyrationRadius * params.gyrationRadius;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y + 0.01)
      .setAdditionalMassProperties(params.massKg, { x: 0, y: params.comHeight }, inertia)
      .setCcdEnabled(true)
      .setCanSleep(false);
    this.body = world.createRigidBody(desc);
    const collide = groups(LAYER.suit, LAYER.terrain);
    const forceThreshold = IMPACT.forceEventPerKg * params.massKg;
    const finish = (d: InstanceType<typeof RAPIER.ColliderDesc>) =>
      d
        .setDensity(0)
        .setFriction(params.friction)
        .setRestitution(params.restitution)
        .setCollisionGroups(collide)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(forceThreshold);
    const t = FLIGHT_SHAPES.torso;
    this.colliders = [world.createCollider(finish(RAPIER.ColliderDesc.capsule(t.halfHeight, t.radius).setTranslation(t.cx, t.cy)), this.body)];
    for (const leg of FLIGHT_SHAPES.legs) {
      this.colliders.push(world.createCollider(finish(RAPIER.ColliderDesc.cuboid(leg.hw, leg.hh).setTranslation(leg.cx, leg.cy)), this.body));
    }
  }

  /** The suit's tilt from upright, radians, positive leaning right. */
  get tilt(): number {
    return -this.body.rotation();
  }

  /** The body's up axis in the world. */
  up(): { x: number; y: number } {
    const a = this.body.rotation();
    return { x: -Math.sin(a), y: Math.cos(a) };
  }

  /** Soles position in the world. */
  soles(): { x: number; y: number } {
    const p = this.body.translation();
    return { x: p.x, y: p.y };
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y);
  }

  /** Applies this step's controls and forces, before the world steps. */
  preStep(input: PilotInput, dt: number, events: SimEvent[]): void {
    const p = this.params;
    this.time += dt;
    this.holding = input.hold;
    const canThrust = !this.batteryEmpty;
    const target = input.hold && canThrust ? 1 : 0;
    const wasThrusting = this.throttle > 0.05;
    if (this.throttle < target) this.throttle = Math.min(target, this.throttle + dt / p.rampUp);
    else this.throttle = Math.max(target, this.throttle - dt / p.rampDown);

    // Heat (the rest flag is the previous step's: resting is decided after the world moves).
    if (this.flags.noHeat) {
      this.heat.heat = 0;
      this.heat.sputterLeft = 0;
      this.heat.warning = false;
    } else {
      const heatEvent = stepHeat(this.heat, p, this.throttle, this.resting, dt);
      if (heatEvent) events.push({ type: heatEvent });
    }
    this.thrust = this.throttle * thrustFactor(this.heat);

    // Battery.
    if (!this.flags.infiniteBattery && this.thrust > 0) {
      this.battery = Math.max(0, this.battery - (this.thrust * dt) / p.batterySeconds);
      if (this.battery <= 0 && !this.batteryEmpty) {
        this.batteryEmpty = true;
        events.push({ type: 'batteryEmpty' });
      }
    }
    if (this.thrust > 0.05 && !wasThrusting && this.grounded) events.push({ type: 'liftoff' });

    const mass = p.massKg;
    const up = this.up();
    const force = this.thrust * p.thrustG * mass * G0;
    const fx = up.x * force;
    const fy = up.y * force;

    // Air drag: linear plus quadratic, scaled by the world's air.
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.y);
    const drag = (p.dragLinear + p.dragQuadratic * speed) * this.env.airDensity;
    this.body.applyImpulse({ x: (fx - drag * v.x) * dt, y: (fy - drag * v.y) * dt }, true);

    // Gyro: a PD controller toward the target tilt, clamped to the gyro's torque; gentler upright pull when not holding.
    const maxTilt = p.maxTiltDeg * DEG;
    this.targetTilt = input.hold ? Math.max(-1, Math.min(1, input.tilt)) * maxTilt : 0;
    const strength = input.hold ? 1 : p.uprightStrength;
    const angle = this.body.rotation();
    const error = wrapAngle(-this.targetTilt - angle);
    const w = this.body.angvel();
    let torque = p.gyroKp * strength * error - p.gyroKd * Math.sqrt(strength) * w;
    const maxTorque = p.gyroMaxTorque * strength;
    torque = Math.max(-maxTorque, Math.min(maxTorque, torque));
    this.body.applyTorqueImpulse(torque * dt, true);

    // Facing follows the tilt asked for, with a dead band so it never flickers.
    if (input.hold && Math.abs(input.tilt) > 0.25) this.facing = input.tilt > 0 ? 1 : -1;

    const lv = this.body.linvel();
    this.preVel.x = lv.x;
    this.preVel.y = lv.y;
    this.preAngVel = this.body.angvel();
    const com = this.body.worldCom();
    this.preCom.x = com.x;
    this.preCom.y = com.y;
    this.vectors.thrust.x = fx / (mass * G0);
    this.vectors.thrust.y = fy / (mass * G0);
  }

  /** Reads impacts and contacts after the world stepped. */
  postStep(dt: number, forceColliders: Iterable<[number, number]>, events: SimEvent[]): void {
    const world = this.world;
    const p = this.params;
    // Impacts: contact force events say which pairs pushed hard; the approach speed comes from the
    // pre-step velocity of the contact points along the contact normal.
    let bestSpeed = 0;
    let best = { x: 0, y: 0, nx: 0, ny: 1 };
    for (const [suitHandle, otherHandle] of forceColliders) {
      const mine = world.getCollider(suitHandle);
      const other = world.getCollider(otherHandle);
      if (!mine || !other || !this.terrain.has(otherHandle)) continue;
      world.contactPair(mine, other, (manifold, flipped) => {
        const n = manifold.normal();
        // The manifold's normal points from its first collider to its second; turn it to point at the suit.
        const nx = flipped ? n.x : -n.x;
        const ny = flipped ? n.y : -n.y;
        const count = manifold.numSolverContacts();
        for (let i = 0; i < Math.max(1, count); i++) {
          const pt = count > 0 ? manifold.solverContactPoint(i) : null;
          const px = pt ? pt.x : this.preCom.x;
          const py = pt ? pt.y : this.preCom.y;
          const rx = px - this.preCom.x;
          const ry = py - this.preCom.y;
          const vx = this.preVel.x - this.preAngVel * ry;
          const vy = this.preVel.y + this.preAngVel * rx;
          const approach = -(vx * nx + vy * ny);
          if (approach > bestSpeed) {
            bestSpeed = approach;
            best = { x: px, y: py, nx, ny };
          }
        }
      });
    }
    if (bestSpeed > IMPACT.bumpMinSpeed) {
      const fresh = this.time - this.lastHitTime > IMPACT.hitCooldown || bestSpeed > this.lastHitSpeed;
      if (fresh) {
        const damage = impactDamage(bestSpeed, p.armorThreshold, p.damagePerMs);
        if (damage > 0) {
          this.lastHitTime = this.time;
          this.lastHitSpeed = bestSpeed;
          if (!this.flags.invulnerable) this.integrity = Math.max(0, this.integrity - damage);
          events.push({ type: 'hit', ...best, speed: bestSpeed, damage, integrity: this.integrity });
        } else {
          events.push({ type: 'bump', ...best, speed: bestSpeed });
        }
      }
    }

    // Ground contacts: flat enough to stand on, and which ledge they are on.
    const cosSlope = Math.cos(REST.maxSlopeDeg * DEG);
    const found: { grounded: boolean; ledge: CourseLedge | null } = { grounded: false, ledge: null };
    const contacts = this.vectors.contacts;
    contacts.length = 0;
    for (const mine of this.colliders) {
      world.contactPairsWith(mine, (other) => {
        if (!this.terrain.has(other.handle)) return;
        world.contactPair(mine, other, (manifold, flipped) => {
          const count = manifold.numSolverContacts();
          if (count === 0) return;
          const n = manifold.normal();
          const nx = flipped ? n.x : -n.x;
          const ny = flipped ? n.y : -n.y;
          for (let i = 0; i < count; i++) {
            const pt = manifold.solverContactPoint(i);
            if (!pt) continue;
            if (contacts.length < 8) contacts.push({ x: pt.x, y: pt.y, nx, ny });
            if (ny < cosSlope) continue;
            found.grounded = true;
            if (!found.ledge) found.ledge = this.ledgeAt(pt.x, pt.y);
          }
        });
      });
    }
    const { grounded, ledge } = found;
    this.grounded = grounded;

    const v = this.body.linvel();
    this.vectors.velocity.x = v.x;
    this.vectors.velocity.y = v.y;
    const com = this.body.worldCom();
    this.vectors.com.x = com.x;
    this.vectors.com.y = com.y;

    // Rest: landed gently on a ledge, upright, boots off.
    const still =
      grounded &&
      ledge !== null &&
      Math.hypot(v.x, v.y) < REST.landingSpeed &&
      Math.abs(this.body.angvel()) < REST.maxAngularSpeed &&
      Math.abs(this.tilt) < REST.maxTiltDeg * DEG &&
      this.throttle < 0.1;
    if (still) {
      this.restTimer += dt;
      const ledgeId = ledge?.id ?? null;
      if (!this.resting && this.restTimer >= REST.settleSeconds && ledgeId) {
        this.resting = true;
        this.restLedge = ledgeId;
        const first = !this.restedLedges.has(ledgeId);
        this.restedLedges.add(ledgeId);
        events.push({ type: 'rest', ledge: ledgeId, first });
        if (!this.patchedLedges.has(ledgeId) && this.integrity < p.plates - 1e-6) {
          this.patchTimer = REST.patchDelay;
          this.patchLedge = ledgeId;
          events.push({ type: 'patchIncoming', ledge: ledgeId });
        }
      }
    } else {
      this.restTimer = 0;
      if (this.resting) this.resting = false;
      if (this.patchTimer >= 0 && this.patchLedge) {
        events.push({ type: 'patchCancel', ledge: this.patchLedge });
        this.patchTimer = -1;
        this.patchLedge = null;
      }
    }
    if (this.resting && this.patchTimer >= 0 && this.patchLedge) {
      this.patchTimer -= dt;
      if (this.patchTimer <= 0) {
        this.integrity = patched(this.integrity, p.plates);
        this.patchedLedges.add(this.patchLedge);
        events.push({ type: 'patch', ledge: this.patchLedge, integrity: this.integrity });
        this.patchTimer = -1;
        this.patchLedge = null;
      }
    }
    this.wasGrounded = grounded;
  }

  /** True while the suit was on the ground last step. */
  get onGround(): boolean {
    return this.wasGrounded;
  }

  private ledgeAt(x: number, y: number): CourseLedge | null {
    const tol = REST.ledgeTolerance;
    for (const l of this.ledges) {
      if (x >= l.x1 - tol && x <= l.x2 + tol && Math.abs(y - l.y) <= tol) return l;
    }
    return null;
  }

  /** Stops the suit touching anything (while it is towed off). */
  disableCollisions(): void {
    for (const c of this.colliders) c.setCollisionGroups(NO_COLLISION);
  }

  /** Puts the suit somewhere at rest (debug jumps). */
  teleport(x: number, y: number): void {
    this.body.setTranslation({ x, y: y + 0.01 }, true);
    this.body.setLinvel({ x: 0, y: 0 }, true);
    this.body.setAngvel(0, true);
    this.body.setRotation(0, true);
  }

  /** Heat warning line, for the views. */
  static readonly warnAt = HEAT.warnAt;
}
