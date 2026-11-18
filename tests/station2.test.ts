import { describe, expect, it } from 'vitest';
import { COUNTRYSIDE_EXPRESS } from '../src/config/routes';
import { criticScore, criticVerdict, eventChoices, nextGap, pickEvent } from '../src/sim/stationEvents';
import { guestReview, reviewRating, starBonus, stopStars } from '../src/sim/stationResult';
import { Journey } from '../src/sim/Journey';

const rules = COUNTRYSIDE_EXPRESS.station;
const state = { stopsCompleted: 6, sinceEvent: 5, eventGap: 3, lastEvent: null, carriages: 4, station: 1 };

describe('Phase 2: held stops', () => {
  it('waits at the platform until the bell releases it, and never leaves on its own', () => {
    const events: string[] = [];
    const j = new Journey({ firstLegMoveSeconds: 1, moveSeconds: 1, arrivingSeconds: 1, stationSeconds: 5, departingSeconds: 1, holdTheTrainSeconds: 15, cruiseSpeed: 10, lastCallSeconds: 2, heldStops: true }, { onPhase: (p) => events.push(p), onLastCall: () => events.push('lastCall') });
    for (let i = 0; i < 30; i++) j.update(0.1);
    expect(j.phase).toBe('stationStop');
    for (let i = 0; i < 600; i++) j.update(0.1);
    expect(j.phase).toBe('stationStop');
    expect(j.stopTime).toBeGreaterThan(59);
    expect(j.holdTrain()).toBe(false);
    j.release(3, true);
    for (let i = 0; i < 40; i++) j.update(0.1);
    expect(j.phase).not.toBe('stationStop');
    expect(events).not.toContain('lastCall');
  });
});

describe('Phase 2: stop stars and reviews', () => {
  it('gives a star for everyone aboard, one for restocked, one for every guest happy', () => {
    expect(stopStars(true, false, false)).toBe(1);
    expect(stopStars(true, true, false)).toBe(2);
    expect(stopStars(true, false, true)).toBe(2);
    expect(stopStars(true, true, true)).toBe(3);
    expect(stopStars(false, true, true)).toBe(0);
    expect(starBonus(100, 1, [0, 0.35, 0.65, 1])).toBe(35);
    expect(starBonus(100, 3, [0, 0.35, 0.65, 1])).toBe(100);
  });

  it('reviews from how a guest was treated, between 1 and 5 stars', () => {
    const r = { perUnmet: 1, grumpy: 2, perLate: 0.5 };
    expect(guestReview(0, false, 0, r)).toBe(5);
    expect(guestReview(1, false, 1, r)).toBe(3.5);
    expect(guestReview(5, true, 4, r)).toBe(1);
    expect(guestReview(0, true, 0, r)).toBe(3);
  });

  it('rates the train as the average of recent reviews, eased toward the start while there are few', () => {
    expect(reviewRating([], 3, 5)).toBe(3);
    expect(reviewRating([5], 3, 5)).toBeCloseTo((5 + 3 * 4) / 5);
    expect(reviewRating([5, 5, 5, 5, 5, 5], 3, 5)).toBe(5);
    expect(reviewRating([1, 1, 1, 1, 1, 5, 5, 5, 5, 5], 3, 5)).toBe(3);
  });
});

describe('Phase 2: special stops', () => {
  it('waits for the gap, never repeats the last event, and keeps station events at their station', () => {
    expect(eventChoices(rules, { ...state, sinceEvent: 1, eventGap: 3 })).toEqual([]);
    expect(eventChoices(rules, { ...state, stopsCompleted: 0 })).toEqual([]);
    const here = eventChoices(rules, { ...state, station: 1 });
    expect(here.some((e) => e.kind === 'harvest')).toBe(false);
    const market = eventChoices(rules, { ...state, station: 2 });
    expect(market.some((e) => e.kind === 'harvest')).toBe(true);
    const last = eventChoices(rules, { ...state, lastEvent: 'sheep' });
    expect(last.some((e) => e.id === 'sheep')).toBe(false);
    const small = eventChoices(rules, { ...state, carriages: 1 });
    expect(small.every((e) => (e.minCarriages ?? 0) <= 1)).toBe(true);
  });

  it('comes about one stop in four or five, never two in a row', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let since = 0;
    let gap = nextGap(rules, rnd);
    let last: string | null = null;
    let events = 0;
    let prevWasEvent = false;
    for (let stop = 0; stop < 400; stop++) {
      const e = pickEvent(rules, { stopsCompleted: stop, sinceEvent: since, eventGap: gap, lastEvent: last, carriages: 6, station: stop % 5 }, rnd);
      if (e) {
        expect(prevWasEvent).toBe(false);
        events++;
        since = 0;
        gap = nextGap(rules, rnd);
        last = e.id;
      } else since++;
      prevWasEvent = !!e;
    }
    expect(events / 400).toBeGreaterThan(0.18);
    expect(events / 400).toBeLessThan(0.28);
  });

  it('scores the critic from what they saw and gives a verdict', () => {
    expect(criticScore([10, 10], [10, 10], [10, 10])).toBe(1);
    expect(criticVerdict(criticScore([5, 10], [5, 10], [5, 10]), rules.critic)).toBe('poor');
    expect(criticVerdict(0.7, rules.critic)).toBe('mixed');
    expect(criticVerdict(0.9, rules.critic)).toBe('great');
  });
});

import { SAVE_MIGRATIONS } from '../src/save/SaveSystem';
import { SAVE_VERSION } from '../src/save/SaveData';

describe('Phase 2: save v6', () => {
  it('keeps the station upgrades already bought as the route\'s platform upgrades, and turns recent stops into reviews', () => {
    expect(SAVE_VERSION).toBe(6);
    const raw: Record<string, unknown> = { route: { id: 'countryside', unlocked: ['c0.open', 'st.posters', 'st.windowboxes', 'couple_1'], recentStops: [1, 0.5, 0] } };
    SAVE_MIGRATIONS.find((m) => m.from === 5)?.apply(raw);
    expect((raw.station as { owned: Record<string, string[]> }).owned.countryside).toEqual(['posters', 'windowboxes']);
    expect((raw.route as { reviews: number[] }).reviews).toEqual([5, 3, 1]);
    expect((raw.route as { unlocked: string[] }).unlocked).toContain('st.posters');
  });
});
