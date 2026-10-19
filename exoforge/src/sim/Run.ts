// One run up the course: the physics world, the suit, and what happens when it crashes, dies or escapes.
// Step it 120 times a second with the pilot's input; the same inputs always give the same run.
import { RAPIER, type World, type RigidBody } from './physics';
import { Suit, NO_FLAGS, type SuitFlags } from './SuitSim';
import { Ragdoll } from './Ragdoll';
import { Tow } from './Tow';
import { addCourseColliders, type Course } from './Course';
import type { PilotInput } from './Input';
import type { EndReason, SimEvent } from './events';
import { BATTERY_END, CRASH, G0, SIM_DT, WORLD_PHYSICS, type SuitParams, type WorldPhysics } from '../econ/balance';
import { PLATES } from './rig';

export type RunPhase = 'flight' | 'ragdoll' | 'tow' | 'done';

/** Below the course's floor by this much, a suit has left the course. */
const OUT_OF_COURSE_M = 8;

export interface RunStats {
  maxHeight: number;
  /** Distinct ledges rested on. */
  rests: number;
  platesLeft: number;
  plates: number;
  seconds: number;
  reason: EndReason | null;
}

export class Run {
  readonly world: World;
  readonly course: Course;
  readonly suit: Suit;
  readonly env: WorldPhysics;
  ragdoll: Ragdoll | null = null;
  tow: Tow | null = null;
  phase: RunPhase = 'flight';
  /** Simulated seconds and steps. */
  time = 0;
  tick = 0;
  maxHeight = 0;
  endReason: EndReason | null = null;
  /** Events since the presentation last drained them. */
  readonly events: SimEvent[] = [];

  private readonly queue: InstanceType<typeof RAPIER.EventQueue>;
  private readonly suitHandles: Set<number>;
  private readonly forcePairs: [number, number][] = [];
  private phaseTime = 0;
  private settleTime = 0;
  /** Seconds since the battery died. */
  private deadTime = 0;

  constructor(course: Course, params: SuitParams, flags: SuitFlags = NO_FLAGS) {
    this.course = course;
    this.env = WORLD_PHYSICS[course.world] ?? WORLD_PHYSICS[1];
    this.world = new RAPIER.World({ x: 0, y: -G0 * this.env.gravityScale });
    this.world.timestep = SIM_DT;
    const terrain = addCourseColliders(this.world, course, params.friction);
    this.suit = new Suit(this.world, params, course.start, terrain, course.ledges, this.env, flags);
    this.suitHandles = new Set(this.suit.colliders.map((c) => c.handle));
    this.queue = new RAPIER.EventQueue(true);
  }

  /** Height of the suit's soles above the launch ledge, metres. */
  height(): number {
    const body = this.trackedBody();
    return Math.max(0, body.translation().y - this.course.start.y);
  }

  /** The body the camera and HUD follow: the suit, or the ragdoll's torso. */
  trackedBody(): RigidBody {
    return this.ragdoll ? this.ragdoll.torso : this.suit.body;
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  stats(): RunStats {
    return {
      maxHeight: this.maxHeight,
      rests: this.suit.restedLedges.size,
      platesLeft: this.suit.integrity,
      plates: this.suit.params.plates,
      seconds: this.time,
      reason: this.endReason,
    };
  }

  /** Ends the run now (the pause menu's End run). */
  quit(): void {
    if (this.phase === 'done') return;
    this.finish('quit');
  }

  /** Debug: puts the suit at rest on a chunk's first ledge. */
  jumpToChunk(index: number): void {
    if (this.phase !== 'flight') return;
    const ledge = this.course.ledges.find((l) => l.chunk === index);
    const chunk = this.course.chunks[index];
    if (!chunk) return;
    if (ledge) this.suit.teleport((ledge.x1 + ledge.x2) / 2, ledge.y);
    else this.suit.teleport(0, chunk.y0 + 1);
  }

  step(input: PilotInput): void {
    if (this.phase === 'done') return;
    const dt = SIM_DT;
    this.time += dt;
    this.tick++;
    this.phaseTime += dt;
    const flying = this.phase === 'flight';
    if (flying) this.suit.preStep(input, dt, this.events);
    else if (this.tow) this.tow.step(dt, this.events);

    this.world.step(this.queue);
    this.forcePairs.length = 0;
    this.queue.drainContactForceEvents((event) => {
      const a = event.collider1();
      const b = event.collider2();
      if (this.suitHandles.has(a)) this.forcePairs.push([a, b]);
      else if (this.suitHandles.has(b)) this.forcePairs.push([b, a]);
    });

    if (flying) {
      this.suit.postStep(dt, this.forcePairs, this.events);
      this.maxHeight = Math.max(this.maxHeight, this.height());
      this.checkFlightEnd(dt);
    } else if (this.phase === 'ragdoll' && this.ragdoll) {
      const torso = this.ragdoll.torso.linvel();
      this.settleTime = Math.hypot(torso.x, torso.y) < CRASH.settleSpeed ? this.settleTime + dt : 0;
      if (this.phaseTime >= CRASH.ragdollSeconds || this.settleTime >= CRASH.settleSeconds) this.startTow(this.ragdoll.torso, this.ragdoll.mass);
    } else if (this.phase === 'tow' && this.tow?.phase === 'done') {
      this.finish(this.endReason ?? 'crash');
    }
  }

  private checkFlightEnd(dt: number): void {
    const suit = this.suit;
    // Safety net: a suit that somehow left the course (it should never) ends the run instead of falling forever.
    if (suit.soles().y < -OUT_OF_COURSE_M) {
      this.endReason = 'crash';
      suit.disableCollisions();
      this.startTow(suit.body, suit.params.massKg);
      return;
    }
    if (suit.soles().y >= this.course.exitY) {
      this.events.push({ type: 'exit' });
      this.finish('exit');
      return;
    }
    if (suit.integrity <= 0) {
      this.events.push({ type: 'crash' });
      this.endReason = 'crash';
      this.ragdoll = new Ragdoll(this.world, suit.body, suit.facing, suit.params.massKg, PLATES.length, suit.params.friction);
      for (const plate of this.ragdoll.plates) this.events.push({ type: 'plateOff', index: plate.index });
      // Disabled rather than removed, so anything still reading the flight body stays safe.
      suit.body.setEnabled(false);
      this.setPhase('ragdoll');
      return;
    }
    if (suit.batteryEmpty) {
      this.deadTime += dt;
      this.settleTime = suit.speed() < BATTERY_END.restSpeed ? this.settleTime + dt : 0;
      if (this.settleTime >= BATTERY_END.settleSeconds || this.deadTime >= BATTERY_END.maxWaitSeconds) {
        this.endReason = 'battery';
        suit.disableCollisions();
        this.startTow(suit.body, suit.params.massKg);
      }
    }
  }

  private startTow(target: RigidBody, mass: number): void {
    this.ragdoll?.disableCollisions();
    this.tow = new Tow(target, mass, this.suit.facing);
    this.events.push({ type: 'towStart' });
    this.setPhase('tow');
  }

  private setPhase(phase: RunPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.settleTime = 0;
  }

  private finish(reason: EndReason): void {
    this.endReason = reason;
    this.phase = 'done';
    this.events.push({ type: 'end', reason });
  }

  dispose(): void {
    this.world.free();
    this.queue.free();
  }
}
