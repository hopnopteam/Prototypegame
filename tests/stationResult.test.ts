import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { nextStreak, ratingEffect, stopQuality, stopRating, streakBonus, trainRating } from '../src/sim/stationResult';

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

describe('train rating (fix list 4.2)', () => {
  const w = ECONOMY.rating.weights;
  it('scores a stop from who boarded, the bags and the service', () => {
    expect(stopQuality(4, 0, 2, 2, true, 1, w)).toBeCloseTo(1);
    expect(stopQuality(0, 4, 0, 2, false, 0, w)).toBeCloseTo(0);
    // Nobody had a bed and there were no bags: only the service counts against it.
    expect(stopQuality(0, 0, 0, 0, true, 0.5, w)).toBeCloseTo((w.boarded + w.bags + 0.5 * w.service) / (w.boarded + w.bags + w.service));
  });

  it('is 1 + 4 × the average of the recent stops, the start value before any', () => {
    expect(trainRating([], ECONOMY.rating.start)).toBe(ECONOMY.rating.start);
    expect(trainRating([1, 1, 1], 3)).toBe(5);
    expect(trainRating([0, 0.5, 1], 3)).toBe(3);
  });

  it('always recovers: good stops push an old bad run out of the window', () => {
    const recent = [0, 0, 0, 0, 0];
    for (let i = 0; i < ECONOMY.rating.window; i++) {
      recent.push(1);
      while (recent.length > ECONOMY.rating.window) recent.shift();
    }
    expect(trainRating(recent, 3)).toBe(5);
  });

  it('has no effect at three stars and moves smoothly to either end', () => {
    expect(ratingEffect(3, 0.8, 1.25)).toBe(1);
    expect(ratingEffect(1, 0.8, 1.25)).toBeCloseTo(0.8);
    expect(ratingEffect(5, 0.8, 1.25)).toBeCloseTo(1.25);
    expect(ratingEffect(2, 0.8, 1.25)).toBeCloseTo(0.9);
  });
});
