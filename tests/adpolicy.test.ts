import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { AdPolicy, type AdContext, type AdHistory } from '../src/sim/AdPolicy';

const rules = () => ({ ...ECONOMY.ads });

const baseContext = (overrides: Partial<AdContext> = {}): AdContext => ({
  phase: 'departing',
  lifetimeSeconds: 20 * 60,
  stopSerial: 10,
  midTask: false,
  noForcedAds: false,
  ...overrides,
});

const freshHistory = (): AdHistory => ({ lastInterstitialAt: null, lastInterstitialStop: null, lastRewardedStop: null });

describe('AdPolicy (§12 interstitial rules)', () => {
  it('allows an interstitial when every rule passes', () => {
    expect(new AdPolicy(rules, freshHistory()).checkInterstitial(baseContext())).toBe('ok');
  });

  it.each(['onTheMove', 'arriving', 'stationStop'] as const)('never shows outside the Departing phase (%s)', (phase) => {
    expect(new AdPolicy(rules, freshHistory()).checkInterstitial(baseContext({ phase }))).toBe('wrongPhase');
  });

  it('never shows before minute 10 of lifetime play', () => {
    const policy = new AdPolicy(rules, freshHistory());
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 9 * 60 + 59 }))).toBe('tooEarlyInLifetime');
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 10 * 60 }))).toBe('ok');
  });

  it('keeps at least the minimum interval between interstitials', () => {
    const policy = new AdPolicy(rules, freshHistory());
    policy.recordInterstitial(20 * 60, 4);
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 20 * 60 + 179, stopSerial: 8 }))).toBe('tooSoonSinceLast');
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 20 * 60 + 180, stopSerial: 8 }))).toBe('ok');
  });

  it('never shows at two stations in a row early on', () => {
    const policy = new AdPolicy(rules, freshHistory());
    policy.recordInterstitial(11 * 60, 5);
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 15 * 60, stopSerial: 6 }))).toBe('consecutiveStation');
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 15 * 60, stopSerial: 7 }))).toBe('ok');
  });

  it('allows consecutive stations once the early game is over', () => {
    const policy = new AdPolicy(rules, freshHistory());
    policy.recordInterstitial(40 * 60, 20);
    expect(policy.checkInterstitial(baseContext({ lifetimeSeconds: 44 * 60, stopSerial: 21 }))).toBe('ok');
  });

  it('never interrupts a task', () => {
    expect(new AdPolicy(rules, freshHistory()).checkInterstitial(baseContext({ midTask: true }))).toBe('midTask');
  });

  it('never follows a rewarded ad in the same stop', () => {
    const policy = new AdPolicy(rules, freshHistory());
    policy.recordRewarded(10);
    expect(policy.checkInterstitial(baseContext({ stopSerial: 10 }))).toBe('rewardedThisStop');
    expect(policy.checkInterstitial(baseContext({ stopSerial: 11 }))).toBe('ok');
  });

  it('respects the First Class Ticket and the kill switch', () => {
    expect(new AdPolicy(rules, freshHistory()).checkInterstitial(baseContext({ noForcedAds: true }))).toBe('purchasedNoAds');
    const off = new AdPolicy(() => ({ ...ECONOMY.ads, interstitialsEnabled: false }), freshHistory());
    expect(off.checkInterstitial(baseContext())).toBe('disabled');
  });

  it('holds rewarded offers back until the first couple of minutes (§14)', () => {
    const policy = new AdPolicy(rules, freshHistory());
    expect(policy.canOfferRewarded(60)).toBe(false);
    expect(policy.canOfferRewarded(2 * 60)).toBe(true);
  });
});
