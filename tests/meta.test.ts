import { describe, expect, it } from 'vitest';
import { QUEST_POOL } from '../src/config/content';
import { ECONOMY } from '../src/config/economy';
import { applyOverrides, LocalRemoteConfig } from '../src/services/remoteConfig';
import { MockAnalyticsService } from '../src/services/analytics';
import { conductorCost, DailyLogin, dayKey, ensureTodayQuests, offlineEarnings, progressQuests, rollQuests } from '../src/sim/meta';
import { vi } from 'vitest';

describe('offline earnings', () => {
  const automation = { openCabins: 3, staff: { attendant: 1 } };

  it('pays nothing for short absences or with no staff', () => {
    expect(offlineEarnings(60, automation, ECONOMY.offline).amount).toBe(0);
    expect(offlineEarnings(3600, { openCabins: 3, staff: {} }, ECONOMY.offline).amount).toBe(0);
  });

  it('scales with automation and caps the time away', () => {
    const hour = offlineEarnings(3600, automation, ECONOMY.offline);
    const perMinute = 3 * ECONOMY.offline.perCabinPerMinute + ECONOMY.offline.perStaffPerMinute.attendant;
    expect(hour.amount).toBe(Math.floor(perMinute * 60 * ECONOMY.offline.efficiency));
    const week = offlineEarnings(7 * 24 * 3600, automation, ECONOMY.offline);
    expect(week.seconds).toBe(ECONOMY.offline.capSeconds);
  });
});

describe('daily login', () => {
  it('claims once per day and never resets after a missed day', () => {
    const state = { lastClaimDay: null as string | null, day: 0 };
    const login = new DailyLogin(state, 7);
    expect(login.claim('2026-09-01')).toBe(0);
    expect(login.claim('2026-09-01')).toBeNull();
    expect(login.claim('2026-09-05')).toBe(1);
    for (let d = 6; d <= 10; d++) login.claim(`2026-09-${String(d).padStart(2, '0')}`);
    expect(login.claim('2026-09-11')).toBe(0);
  });

  it('formats local day keys', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('daily quests', () => {
  it('rolls the same quests for the same day, distinct kinds', () => {
    const a = rollQuests(QUEST_POOL, '2026-09-28', 3);
    const b = rollQuests(QUEST_POOL, '2026-09-28', 3);
    expect(a).toEqual(b);
    expect(new Set(a.map((q) => q.kind)).size).toBe(3);
  });

  it('refreshes on a new day only and tracks progress to completion', () => {
    const state = { day: null as string | null, items: [] as ReturnType<typeof rollQuests> };
    expect(ensureTodayQuests(state, QUEST_POOL, '2026-09-28', 3)).toBe(true);
    expect(ensureTodayQuests(state, QUEST_POOL, '2026-09-28', 3)).toBe(false);
    const quest = state.items[0];
    const done = progressQuests(state.items, quest.kind, quest.target);
    expect(done).toEqual([quest]);
    expect(progressQuests(state.items, quest.kind, 1)).toEqual([]);
  });
});

describe('conductor upgrades', () => {
  it('costs rise and stop at max level', () => {
    const track = ECONOMY.conductor.speed;
    expect(conductorCost(track, 0)).toBe(track.costs[0]);
    expect(conductorCost(track, track.maxLevel)).toBeNull();
  });
});

describe('remote config', () => {
  it('overrides known keys only, keeping types', () => {
    const target = { ads: { minIntervalSeconds: 180, interstitialsEnabled: true } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remote = new LocalRemoteConfig({ 'ads.minIntervalSeconds': '240', 'ads.interstitialsEnabled': 'false', 'ads.nope': 1 });
    const applied = applyOverrides(target, remote);
    expect(target.ads.minIntervalSeconds).toBe(240);
    expect(target.ads.interstitialsEnabled).toBe(false);
    expect(applied).toEqual(['ads.minIntervalSeconds', 'ads.interstitialsEnabled']);
    warn.mockRestore();
  });

  it('falls back when a value is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const remote = new LocalRemoteConfig({ x: 'soon' });
    expect(remote.number('x', 90)).toBe(90);
    warn.mockRestore();
  });
});

describe('analytics', () => {
  it('rejects names real SDKs would refuse', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const analytics = new MockAnalyticsService(10, () => 0);
    analytics.log('Bad Name');
    analytics.log('session_start', { session_number: 1 });
    expect(analytics.total).toBe(1);
    expect(analytics.history[0].event).toBe('session_start');
    error.mockRestore();
  });
});
