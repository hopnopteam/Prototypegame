import { describe, expect, it } from 'vitest';
import { newHeat, stepHeat, thrustFactor } from '../src/sim/Heat';
import { BARE_FRAME, HEAT, SIM_DT } from '../src/econ/balance';

describe('heat', () => {
  it('overheats after about 2.5 s of full thrust (the Scrap Rig feel target)', () => {
    const s = newHeat();
    let t = 0;
    while (stepHeat(s, BARE_FRAME, 1, false, SIM_DT) !== 'sputter') {
      t += SIM_DT;
      expect(t).toBeLessThan(5);
    }
    expect(t).toBeGreaterThan(2.45);
    expect(t).toBeLessThan(2.55);
  });

  it('warns once on crossing 80%', () => {
    const s = newHeat();
    const events: string[] = [];
    for (let i = 0; i < 300; i++) {
      const e = stepHeat(s, BARE_FRAME, 1, false, SIM_DT);
      if (e) events.push(e);
      if (e === 'sputter') break;
    }
    expect(events.filter((e) => e === 'overheatWarn')).toHaveLength(1);
  });

  it('sputters for 1.5 s at 15% thrust while cooling to 60%', () => {
    const s = newHeat();
    s.heat = 0.999;
    expect(stepHeat(s, BARE_FRAME, 1, false, SIM_DT)).toBe('sputter');
    expect(thrustFactor(s)).toBe(HEAT.sputterThrust);
    let t = 0;
    let end: string | null = null;
    while (end !== 'sputterEnd') {
      end = stepHeat(s, BARE_FRAME, 1, false, SIM_DT);
      t += SIM_DT;
      expect(t).toBeLessThan(3);
    }
    expect(t).toBeCloseTo(HEAT.sputterSeconds, 1);
    expect(s.heat).toBeCloseTo(HEAT.sputterCoolTo, 3);
    expect(thrustFactor(s)).toBe(1);
  });

  it('cools faster idle than thrusting, and three times faster resting', () => {
    const rate = (throttle: number, resting: boolean) => {
      const s = newHeat();
      s.heat = 0.5;
      stepHeat(s, BARE_FRAME, throttle, resting, 1);
      return 0.5 - s.heat + BARE_FRAME.heatPerSecond * throttle;
    };
    expect(rate(0, false)).toBeGreaterThan(rate(1, false));
    expect(rate(0, true)).toBeCloseTo(rate(0, false) * BARE_FRAME.restCoolingMultiplier, 6);
  });
});
