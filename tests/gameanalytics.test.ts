import { describe, expect, it } from 'vitest';
import { ANALYTICS } from '../src/config/analytics';
import { EVENTS } from '../src/services/analytics';
import { FTUE_ORDER, part, resourceItem, translate, type GaCall } from '../src/services/gaMapping';

// The GameAnalytics SDK's own rules (GAValidator in node_modules/gameanalytics), so nothing we send is dropped.
const EVENT_ID = /^[A-Za-z0-9\s\-_.()!?]{1,64}(:[A-Za-z0-9\s\-_.()!?]{1,64}){0,4}$/;
const PART = /^[A-Za-z0-9\s\-_.()!?]{1,64}$/;
const CURRENCY = /^[A-Za-z]+$/;

function valid(call: GaCall): void {
  switch (call.kind) {
    case 'design':
      expect(call.id).toMatch(EVENT_ID);
      if (call.value !== undefined) expect(Number.isFinite(call.value)).toBe(true);
      break;
    case 'progression':
      for (const p of [call.p1, call.p2, call.p3]) if (p !== undefined) expect(p).toMatch(PART);
      break;
    case 'resource':
      expect(Object.values(ANALYTICS.currencies)).toContain(call.currency);
      expect(ANALYTICS.itemTypes).toContain(call.itemType);
      expect(call.itemId).toMatch(PART);
      expect(call.amount).toBeGreaterThan(0);
      break;
    case 'ad':
      expect(call.placement).toMatch(PART);
      break;
    case 'business':
      expect(call.currency).toMatch(/^[A-Z]{3}$/);
      expect(Number.isInteger(call.cents)).toBe(true);
      break;
  }
}

describe('GameAnalytics configuration', () => {
  it('declares what the SDK accepts', () => {
    for (const c of Object.values(ANALYTICS.currencies)) expect(c).toMatch(CURRENCY);
    expect(ANALYTICS.itemTypes.length).toBeLessThanOrEqual(20);
    for (const t of ANALYTICS.itemTypes) {
      expect(t).toMatch(PART);
      expect(t.length).toBeLessThanOrEqual(32);
    }
    for (const list of Object.values(ANALYTICS.dimensions)) {
      expect(list.length).toBeLessThanOrEqual(20);
      for (const v of list) expect(v.length).toBeLessThanOrEqual(32);
    }
    expect(ANALYTICS.build.length).toBeLessThanOrEqual(24);
  });
});

describe('GameAnalytics mapping', () => {
  it('turns every game event into valid calls', () => {
    const samples: [string, Record<string, string | number | boolean>][] = [
      [EVENTS.ftueStep, { step: 'first_key', elapsed: 12 }],
      [EVENTS.ftueStep, { step: 'brand_new_beat', elapsed: 3 }],
      [EVENTS.unlockCompleted, { id: 'c0.cabin_1', kind: 'cabin', price: 15, time: 10 }],
      [EVENTS.staffHired, { role: 'attendant', carriage: 0, time: 700 }],
      ['work_earned', { role: 'attendant', time: 600 }],
      [EVENTS.carriageCoupled, { index: 1, type: 'sleeper', count: 2, time: 260 }],
      [EVENTS.routeLevelUp, { level: 2, time: 300 }],
      [EVENTS.stationResult, { station: 'Ashby', boarded: 3, missed: 1, bonus: false, luggage_loaded: 2, bags_left: 1, no_room: 2, earned: 120, stars: 2, streak: 0, stop_number: 3, train_rating: 3.4 }],
      ['objective_completed', { id: 'obj_open', index: 0, time: 30 }],
      [EVENTS.currencyEarned, { currency: 'cash', amount: 12, source: 'pile:cabin' }],
      [EVENTS.currencyEarned, { currency: 'gems', amount: 3, source: 'chest' }],
      [EVENTS.currencySpent, { currency: 'cash', amount: 340, sink: 'unlock:couple' }],
      [EVENTS.currencySpent, { currency: 'railMiles', amount: 4, sink: 'conductor:speed' }],
      [EVENTS.currencySpent, { currency: 'cash', amount: 20, sink: 'luggageRefund' }],
      ['chest_opened', { cash: 60, gems: 3 }],
      ['login_claimed', { day: 0, doubled: false }],
      ['quest_claimed', { kind: 'fulfilRequests' }],
      ['offline_earnings', { amount: 14, minutes: 60 }],
      ['press_printed', { trigger: 'couple', level: 2 }],
      ['award_won', { award: 'rising_star', stops: 8, rating: 4.3, minute: 40 }],
      ['perk_earned', { perk: 'skates', streak: 3 }],
      [EVENTS.rewardedOfferShown, { placement: 'holdTrain' }],
      [EVENTS.rewardedOfferCompleted, { placement: 'holdTrain', method: 'ad' }],
      [EVENTS.interstitialShown, { placement: 'departing', session_minute: 12 }],
      [EVENTS.iapOfferPurchased, { product: 'livery:navy', currency: 'gems', amount: 120 }],
      [EVENTS.iapOfferPurchased, { product: 'first_class_ticket', usd_cents: 499 }],
      ['perf_sample', { fps: 58, quality: 'low' }],
      ['setting_changed', { setting: 'Sound', value: 'off' }],
      ['something_new', { x: 1 }],
    ];
    for (const [event, params] of samples) {
      const calls = translate(event, params);
      expect(calls.length, event).toBeGreaterThan(0);
      calls.forEach(valid);
    }
  });

  it('leaves sessions to GameAnalytics itself', () => {
    expect(translate(EVENTS.sessionStart, { session_number: 2 })).toEqual([]);
    expect(translate(EVENTS.sessionEnd, { session_seconds: 30 })).toEqual([]);
  });

  it('numbers the first-session beats in play order', () => {
    expect(translate(EVENTS.ftueStep, { step: 'first_ticket', elapsed: 1 })[0]).toEqual({ kind: 'design', id: 'FTUE:01_first_ticket', value: 1 });
    expect(FTUE_ORDER.length).toBeLessThan(99);
  });

  it('completes a route level and starts the next', () => {
    const calls = translate(EVENTS.routeLevelUp, { level: 3, time: 600 });
    expect(calls).toEqual([
      { kind: 'progression', status: 'complete', p1: 'Route1', p2: 'Level02', score: 10 },
      { kind: 'progression', status: 'start', p1: 'Route1', p2: 'Level03' },
    ]);
  });

  it('sorts every currency source and sink the game uses into a declared item type', () => {
    const sources = ['pile:cabin', 'pile:bath', 'pile:venue', 'pile:booth', 'pile:desk', 'pile:floor', 'pile:bonus', 'press', 'objective:obj_3', 'objective:catchup', 'login', 'quest', 'chest', 'levelUp', 'rival', 'rush', 'offline', 'refund:berth', 'exchange', 'iap:gems_small', 'rewarded:cashStash', 'dev', 'creative'];
    const sinks = ['unlock:cabin', 'conductor:speed', 'livery:navy', 'outfit:linen', 'luggageRefund', 'exchange'];
    for (const s of sources) expect(ANALYTICS.itemTypes, s).toContain(resourceItem('source', s).itemType);
    for (const s of sinks) expect(ANALYTICS.itemTypes, s).toContain(resourceItem('sink', s).itemType);
  });

  it('books café and dining takings as venues and the bell bonus as a station bonus', () => {
    expect(resourceItem('source', 'venue:cafe')).toEqual({ itemType: 'Venues', itemId: 'cafe' });
    expect(resourceItem('source', 'venue:dining')).toEqual({ itemType: 'Venues', itemId: 'dining' });
    // Session 43: every venue pays straight into the wallet.
    for (const kind of ['bar', 'dome', 'cinema']) expect(resourceItem('source', `venue:${kind}`)).toEqual({ itemType: 'Venues', itemId: kind });
    expect(resourceItem('source', 'bell')).toEqual({ itemType: 'StationBonus', itemId: 'bell' });
  });

  it('cleans parts the SDK would refuse', () => {
    expect(part('All aboard!')).toMatch(PART);
    expect(part('a/b#c')).toBe('a_b_c');
    expect(part('')).toBe('none');
    expect(part('x'.repeat(100)).length).toBe(64);
  });
});
