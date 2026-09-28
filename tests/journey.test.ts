import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import type { JourneyPhase } from '../src/core/types';
import { Journey, type JourneyConfig } from '../src/sim/Journey';

const config: JourneyConfig = {
  firstLegMoveSeconds: 54,
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
    run(journey, 60.1);
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
    expect(ECONOMY.journey.firstLegMoveSeconds + ECONOMY.journey.arrivingSeconds).toBeLessThanOrEqual(65);
    expect(ECONOMY.journey.stationSeconds).toBe(40);
  });
});
