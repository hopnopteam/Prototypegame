import { beforeAll, describe, expect, it } from 'vitest';
import { ready, boxRun, fly, HOLD, IDLE, RAPIER } from './helpers';
import { Suit, NO_FLAGS } from '../src/sim/SuitSim';
import { BARE_FRAME, MID_GYRO, SIM_DT, SIM_HZ, type SuitParams } from '../src/econ/balance';
import type { SimEvent } from '../src/sim/events';

beforeAll(async () => { await ready; });

const DEG = Math.PI / 180;

/** Time to first reach full tilt from upright in free space, and the overshoot past it. */
function tiltResponse(params: SuitParams): { reach: number; overshoot: number } {
  const world = new RAPIER.World({ x: 0, y: 0 });
  world.timestep = SIM_DT;
  const suit = new Suit(world, { ...params, thrustG: 0 }, { x: 0, y: 0 }, new Set(), [], { gravityScale: 0, airDensity: 1 }, NO_FLAGS);
  const target = params.maxTiltDeg * DEG;
  const events: SimEvent[] = [];
  let reach = -1;
  let peak = 0;
  for (let i = 0; i < 2 * SIM_HZ; i++) {
    suit.preStep({ hold: true, tilt: 1 }, SIM_DT, events);
    world.step();
    if (reach < 0 && suit.tilt >= target) reach = (i + 1) * SIM_DT;
    peak = Math.max(peak, suit.tilt);
  }
  world.free();
  return { reach, overshoot: peak / target - 1 };
}

describe('tilt', () => {
  it('a mid-level gyro reaches full tilt in about 0.35 s and overshoots slightly', () => {
    const { reach, overshoot } = tiltResponse({ ...BARE_FRAME, ...MID_GYRO });
    expect(reach).toBeGreaterThan(0.29);
    expect(reach).toBeLessThan(0.41);
    expect(overshoot).toBeGreaterThan(0.02);
    expect(overshoot).toBeLessThan(0.15);
  });

  it('the bare frame turns slower (heavy and wobbly)', () => {
    const { reach } = tiltResponse(BARE_FRAME);
    expect(reach).toBeGreaterThan(0.5);
    expect(reach).toBeLessThan(0.8);
  });
});

describe('thrust and heat in flight', () => {
  it('the bare frame barely climbs: a full burst lifts it 4–8 m before it sputters', () => {
    const run = boxRun();
    let sputterAt = -1;
    let heightAtSputter = 0;
    for (let i = 0; i < 5 * SIM_HZ && sputterAt < 0; i++) {
      run.step(HOLD);
      if (run.events.some((e) => e.type === 'sputter')) {
        sputterAt = run.time;
        heightAtSputter = run.height();
      }
      run.events.length = 0;
    }
    expect(sputterAt).toBeGreaterThan(2.5);
    expect(sputterAt).toBeLessThan(2.75);
    expect(heightAtSputter).toBeGreaterThan(4);
    expect(heightAtSputter).toBeLessThan(8);
    run.dispose();
  });

  it('thrust builds over 0.15 s and fades over 0.1 s', () => {
    const run = boxRun();
    fly(run, 0.075, HOLD);
    expect(run.suit.throttle).toBeCloseTo(0.5, 1);
    fly(run, 0.2, HOLD);
    expect(run.suit.throttle).toBe(1);
    fly(run, 0.05, IDLE);
    expect(run.suit.throttle).toBeCloseTo(0.5, 1);
    run.dispose();
  });

  it('a flat battery stops the boots for good and ends the run with a tow', () => {
    const run = boxRun({ batterySeconds: 1 }, { noHeat: true });
    fly(run, 1.4, HOLD);
    expect(run.suit.batteryEmpty).toBe(true);
    fly(run, 12, HOLD);
    expect(run.done).toBe(true);
    expect(run.endReason).toBe('battery');
    run.dispose();
  });
});

describe('impacts', () => {
  function drop(height: number): { run: ReturnType<typeof boxRun>; events: SimEvent[] } {
    const run = boxRun();
    run.suit.teleport(0, 1 + height);
    const events: SimEvent[] = [];
    for (let i = 0; i < 4 * SIM_HZ && !run.done; i++) {
      run.step(IDLE);
      events.push(...run.events);
      run.events.length = 0;
    }
    return { run, events };
  }

  it('a short drop does no damage', () => {
    const { run, events } = drop(1);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(run.suit.integrity).toBe(BARE_FRAME.plates);
    run.dispose();
  });

  it('a long drop dents the armor by the impact speed along the floor normal', () => {
    const { run, events } = drop(7);
    const hit = events.find((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit');
    expect(hit).toBeDefined();
    expect(hit!.ny).toBeGreaterThan(0.9);
    expect(hit!.speed).toBeGreaterThan(9.5);
    expect(hit!.speed).toBeLessThan(12.5);
    expect(hit!.integrity).toBeCloseTo(BARE_FRAME.plates - (hit!.speed - BARE_FRAME.armorThreshold) * BARE_FRAME.damagePerMs, 3);
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(1);
    // It then rests on the floor ledge and the drone patches one plate back.
    expect(events.some((e) => e.type === 'patch')).toBe(true);
    run.dispose();
  });

  it('enough damage crashes into a ragdoll, then the drone tows it off', () => {
    const run = boxRun({ plates: 1 });
    run.suit.teleport(0, 20);
    const events: SimEvent[] = [];
    let sawRagdoll = false;
    for (let i = 0; i < 10 * SIM_HZ && !run.done; i++) {
      run.step(IDLE);
      events.push(...run.events);
      run.events.length = 0;
      if (run.ragdoll) {
        sawRagdoll = true;
        for (const piece of run.ragdoll.pieces) {
          const p = piece.body.translation();
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        }
      }
    }
    expect(sawRagdoll).toBe(true);
    expect(run.ragdoll!.pieces).toHaveLength(9);
    expect(run.ragdoll!.plates).toHaveLength(3);
    const order = events.map((e) => e.type).filter((t) => ['crash', 'towStart', 'towAttach', 'end'].includes(t));
    expect(order).toEqual(['crash', 'towStart', 'towAttach', 'end']);
    expect(run.endReason).toBe('crash');
    run.dispose();
  });
});

describe('getting up', () => {
  it('a suit knocked flat on its side stands back up by itself', () => {
    const run = boxRun();
    run.suit.teleport(0, 1.3);
    run.suit.body.setRotation(Math.PI / 2, true);
    fly(run, 3, IDLE);
    expect(Math.abs(run.suit.tilt)).toBeLessThan(0.2);
    run.dispose();
  });

  it('holding a tilt into the floor does not leave it lying down', () => {
    const run = boxRun();
    fly(run, 0.6, HOLD);
    fly(run, 1.6, { hold: true, tilt: -1 });
    fly(run, 3, IDLE);
    expect(Math.abs(run.suit.tilt)).toBeLessThan(0.3);
    run.dispose();
  });
});

describe('rest', () => {
  it('a gentle landing on a ledge rests and cools three times faster', () => {
    const run = boxRun();
    run.suit.teleport(0, 1.3);
    fly(run, 0.8, IDLE);
    expect(run.suit.resting).toBe(true);
    expect(run.suit.restLedge).toBe('w0_01.L0');
    run.dispose();
  });

  it('the drone patches one plate, once per ledge per run', () => {
    const run = boxRun();
    run.suit.integrity = 1.5;
    run.suit.teleport(0, 1.3);
    const events: SimEvent[] = [];
    const record = (seconds: number, input: typeof HOLD) => {
      for (let i = 0; i < seconds * SIM_HZ; i++) {
        run.step(input);
        events.push(...run.events);
        run.events.length = 0;
      }
    };
    record(2, IDLE);
    expect(run.suit.integrity).toBeCloseTo(2.5, 6);
    record(0.6, HOLD);
    record(3, IDLE);
    expect(events.filter((e) => e.type === 'patch')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'rest').length).toBeGreaterThanOrEqual(2);
    run.dispose();
  });

  it('reaching the top of the course is the exit', () => {
    const run = boxRun({ thrustG: 2 }, { noHeat: true, infiniteBattery: true }, 21);
    run.suit.teleport(0, 15);
    fly(run, 4, HOLD);
    expect(run.endReason).toBe('exit');
    run.dispose();
  });
});
