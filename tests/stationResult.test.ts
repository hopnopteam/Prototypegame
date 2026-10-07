import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { nextStreak, stopRating, streakBonus } from '../src/sim/stationResult';

describe('station result', () => {
  it('gives three stars only to a perfect stop', () => {
    expect(stopRating(0, true)).toBe(3);
    expect(stopRating(2, true)).toBe(2);
    expect(stopRating(0, false)).toBe(2);
    expect(stopRating(1, false)).toBe(1);
  });

  it('grows the streak on perfect stops and starts again otherwise', () => {
    expect(nextStreak(0, true)).toBe(1);
    expect(nextStreak(3, true)).toBe(4);
    expect(nextStreak(5, false)).toBe(0);
  });

  it('grows the bonus with the streak, capped, and never below the base', () => {
    const { perfectStreakStep: step, perfectStreakMax: max } = ECONOMY.money;
    expect(streakBonus(40, 1, step, max)).toEqual({ total: 40, extra: 0 });
    expect(streakBonus(40, 2, step, max).total).toBe(Math.round(40 * (1 + step)));
    expect(streakBonus(40, 100, step, max).total).toBe(Math.round(40 * (1 + step * max)));
    expect(streakBonus(40, 0, step, max).extra).toBe(0);
  });
});
