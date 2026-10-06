import { describe, expect, it } from 'vitest';
import { freshWish, nextTripPhase, rideProgress, type TripPhase } from '../src/sim/trip';

const rules = { eveningEnd: 0.35, morningStart: 0.7, minSleepSeconds: 4 };

describe('trip: one trip, one sleep', () => {
  it('measures the ride from boarding to the guest stop', () => {
    expect(rideProgress(2, 3, 2, 0)).toBe(0);
    expect(rideProgress(2, 3, 2, 0.5)).toBeCloseTo(0.5);
    expect(rideProgress(2, 3, 3, 0)).toBe(1);
    // Two legs: halfway at the station in between.
    expect(rideProgress(2, 4, 3, 0)).toBeCloseTo(0.5);
    expect(rideProgress(2, 4, 3, 0.5)).toBeCloseTo(0.75);
    expect(rideProgress(2, 4, 9, 0)).toBe(1);
  });

  it('goes evening, night, morning, and never back', () => {
    let phase: TripPhase = 'evening';
    let sleeps = 0;
    let slept = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const next = nextTripPhase(phase, t, false, slept, rules);
      if (next === 'night' && phase !== 'night') sleeps++;
      if (next === 'night') slept += 1;
      expect(['evening', 'night', 'morning'].indexOf(next)).toBeGreaterThanOrEqual(['evening', 'night', 'morning'].indexOf(phase));
      phase = next;
    }
    expect(sleeps).toBe(1);
    expect(phase).toBe('morning');
  });

  it('waits for a pending request before lights out, and still sleeps the shortest night', () => {
    expect(nextTripPhase('evening', 0.9, true, 0, rules)).toBe('evening');
    expect(nextTripPhase('evening', 0.9, false, 0, rules)).toBe('night');
    expect(nextTripPhase('night', 0.95, false, 1, rules)).toBe('night');
    expect(nextTripPhase('night', 0.95, false, 4, rules)).toBe('morning');
    expect(nextTripPhase('morning', 0.1, false, 0, rules)).toBe('morning');
  });

  it('never asks for the same thing twice', () => {
    const asked = new Set<string>(['tea']);
    for (let roll = 0; roll < 1; roll += 0.05) expect(freshWish({ tea: 3, towel: 1 }, asked, roll)).toBe('towel');
    asked.add('towel');
    expect(freshWish({ tea: 3, towel: 1 }, asked, 0.5)).toBeNull();
  });
});
