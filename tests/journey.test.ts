import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import type { JourneyPhase } from '../src/core/types';
import { Journey, type JourneyConfig } from '../src/sim/Journey';

const config: JourneyConfig = {
  firstLegMoveSeconds: 48,
  moveSeconds: 150,
  arrivingSeconds: 6,
  stationSeconds: 40,
  departingSeconds: 6,
  holdTheTrainSeconds: 15,
  cruiseSpeed: 14,
  lastCallSeconds: 12,
};

function makeJourney(legs = 0, stops = 0): { journey: Journey; phases: JourneyPhase[]; lastCalls: number[] } {
  const phases: JourneyPhase[] = [];
  const lastCalls: number[] = [];
  const journey = new Journey(config, { onPhase: (p) => phases.push(p), onLastCall: () => lastCalls.push(1) }, 0, legs, stops);
  return { journey, phases, lastCalls };
}

const run = (journey: Journey, seconds: number, step = 0.05): void => {
  for (let t = 0; t < seconds - 1e-9; t += step) journey.update(step);
};

describe('Journey', () => {
  it('reaches the first station at about one minute (§14)', () => {
    const { journey, phases } = makeJourney();
    run(journey, config.firstLegMoveSeconds + config.arrivingSeconds + 0.1);
    expect(phases).toEqual(['arriving', 'stationStop']);
    expect(journey.stopSerial).toBe(1);
  });

  it('opens pulling out of the first station, then keeps the first leg short', () => {
    const phases: JourneyPhase[] = [];
    const journey = new Journey(config, { onPhase: (p) => phases.push(p), onLastCall: () => undefined }, 0, 0, 0, undefined, 'departing');
    expect(journey.phase).toBe('departing');
    expect(journey.distanceSinceDeparture).toBe(0);
    run(journey, config.departingSeconds + 0.05);
    expect(journey.phase).toBe('onTheMove');
    expect(journey.distanceSinceDeparture).toBeGreaterThan(0);
    run(journey, config.firstLegMoveSeconds + config.arrivingSeconds);
    expect(phases).toEqual(['onTheMove', 'arriving', 'stationStop']);
  });

  it('can open standing at the first station, held until released, then leaves on the short first leg (session 17)', () => {
    const phases: JourneyPhase[] = [];
    const lastCalls: number[] = [];
    const journey = new Journey(config, { onPhase: (p) => phases.push(p), onLastCall: () => lastCalls.push(1) }, 0, 0, 0, undefined, 'stationStop');
    expect(journey.phase).toBe('stationStop');
    expect(journey.held).toBe(true);
    expect(journey.doorsOpen).toBe(true);
    // Nobody is rushed: a held stop never runs down and cannot be held for longer.
    run(journey, 300);
    expect(phases).toEqual([]);
    expect(journey.holdTrain()).toBe(false);
    journey.release(6);
    run(journey, 0.1);
    expect(lastCalls).toEqual([1]);
    run(journey, 6 + config.departingSeconds);
    expect(phases).toEqual(['departing', 'onTheMove']);
    // Millbrook was not a stop of the ride: the first stop is still ahead.
    expect(journey.stopSerial).toBe(0);
    expect(journey.duration).toBe(config.firstLegMoveSeconds);
  });

  it('loops through every phase in order', () => {
    const { journey, phases } = makeJourney(1, 1);
    run(journey, config.moveSeconds + 6 + 40 + 6 + 0.1);
    expect(phases).toEqual(['arriving', 'stationStop', 'departing', 'onTheMove']);
    expect(journey.legsCompleted).toBe(2);
  });

  it('stops the platform exactly at the doors: distance to stop reaches zero as speed does', () => {
    const { journey } = makeJourney(1, 1);
    let previous = journey.distanceToStop!;
    let travelled = 0;
    while (journey.phase !== 'stationStop') {
      const dt = 0.01;
      travelled += journey.speed * dt;
      journey.update(dt);
      const d = journey.distanceToStop;
      if (d !== null) {
        expect(d).toBeLessThanOrEqual(previous + 1e-9);
        previous = d;
      }
    }
    const expected = config.moveSeconds * config.cruiseSpeed + (config.cruiseSpeed * config.arrivingSeconds) / 2;
    expect(travelled).toBeCloseTo(expected, 0);
    expect(journey.speed).toBe(0);
  });

  it('holds the train once per stop and re-arms the last call', () => {
    const { journey, lastCalls } = makeJourney();
    run(journey, config.firstLegMoveSeconds + config.arrivingSeconds + 0.1);
    expect(journey.phase).toBe('stationStop');
    run(journey, 30);
    expect(lastCalls.length).toBe(1);
    expect(journey.holdTrain()).toBe(true);
    expect(journey.holdTrain()).toBe(false);
    expect(journey.timeLeft).toBeGreaterThan(20);
    run(journey, 20);
    expect(lastCalls.length).toBe(2);
    expect(journey.phase).toBe('stationStop');
  });

  it('cannot hold the train while moving', () => {
    const { journey } = makeJourney();
    expect(journey.holdTrain()).toBe(false);
  });

  it('survives a huge frame (background tab) by carrying overflow across phases', () => {
    const { journey, phases } = makeJourney(1, 1);
    journey.update(1000);
    expect(phases.length).toBeGreaterThan(3);
  });

  it('uses the tuned economy values', () => {
    // Opening departure + first leg + arrival: the first station lands at about one minute.
    expect(ECONOMY.journey.departingSeconds + ECONOMY.journey.firstLegMoveSeconds + ECONOMY.journey.arrivingSeconds).toBeLessThanOrEqual(65);
    expect(ECONOMY.journey.stationSeconds).toBe(40);
  });

  it('rides grow from the short first leg to the cruise, never jumping (session 16)', () => {
    const ramped = new Journey({ ...config, earlyLegSeconds: [90, 120] }, { onPhase: () => undefined, onLastCall: () => undefined });
    expect([0, 1, 2, 3, 9].map((stops) => ramped.legSeconds(stops))).toEqual([48, 90, 120, 150, 150]);
    const legs = [0, 1, 2, 3].map((stops) => new Journey(ECONOMY.journey, { onPhase: () => undefined, onLastCall: () => undefined }).legSeconds(stops));
    for (let i = 1; i < legs.length; i++) expect(legs[i]).toBeGreaterThanOrEqual(legs[i - 1]);
  });
});
