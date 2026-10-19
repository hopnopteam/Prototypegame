import { beforeAll, describe, expect, it } from 'vitest';
import { ready, courseRun } from './helpers';
import { SIM_HZ } from '../src/econ/balance';
import type { PilotInput } from '../src/sim/Input';

beforeAll(async () => { await ready; });

/** A fixed, wiggly flight: hops with feathered throttle and a swinging tilt. */
function script(tick: number): PilotInput {
  const t = tick / SIM_HZ;
  return { hold: Math.sin(t * 2.1) > -0.2, tilt: Math.sin(t * 0.7) * 0.8 };
}

function record(): string {
  const run = courseRun();
  const trace: number[] = [];
  const events: string[] = [];
  for (let i = 0; i < 25 * SIM_HZ && !run.done; i++) {
    run.step(script(run.tick));
    for (const e of run.events) events.push(JSON.stringify(e));
    run.events.length = 0;
    if (i % 12 === 0) {
      const body = run.trackedBody();
      const p = body.translation();
      trace.push(p.x, p.y, body.rotation(), run.suit.heat.heat, run.suit.battery);
    }
  }
  const out = JSON.stringify({ trace, events, stats: run.stats() });
  run.dispose();
  return out;
}

describe('determinism', () => {
  it('the same inputs give exactly the same run', () => {
    expect(record()).toBe(record());
  });
});
