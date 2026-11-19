import { describe, expect, it } from 'vitest';
import { SAVE_MIGRATIONS } from '../src/save/SaveSystem';
import { SAVE_VERSION } from '../src/save/SaveData';
import { capConductor } from '../src/sim/meta';
import { ECONOMY } from '../src/config/economy';
import { ACTIVE_ROUTE } from '../src/config/routes';
import { buildUnlocks, couplePrice, routePrice } from '../src/sim/unlockPlan';

describe('Phase 3: conductor upgrades 3 × 3', () => {
  it('caps levels at the new maximum and refunds the levels above it at what they cost', () => {
    const old = { speed: [2, 3, 5, 8, 12], capacity: [3, 5, 8, 12, 16] };
    const r = capConductor({ speed: 5, capacity: 2 }, old, 3);
    expect(r.levels).toEqual({ speed: 3, capacity: 2 });
    expect(r.refund).toBe(8 + 12);
  });

  it('migrates a v6 save: levels capped, Rail Miles refunded, stories dropped', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(7);
    const raw: Record<string, unknown> = { conductor: { speed: 4, capacity: 5, fareBonus: 1 }, wallet: { railMiles: 7 }, meta: { stories: { walter: { step: 2 } } } };
    SAVE_MIGRATIONS.find((m) => m.from === 6)?.apply(raw);
    expect(raw.conductor).toEqual({ speed: 3, capacity: 3, fareBonus: 1 });
    expect((raw.wallet as { railMiles: number }).railMiles).toBe(7 + 8 + 12 + 16);
    expect((raw.meta as { stories?: unknown }).stories).toBeUndefined();
  });

  it('keeps every conductor track at three levels', () => {
    for (const t of Object.values(ECONOMY.conductor)) {
      expect(t.maxLevel).toBe(3);
      expect(t.costs.length).toBe(3);
    }
  });
});

describe('Phase 3: the route economy', () => {
  it('applies the route block to ECONOMY', () => {
    const r = ACTIVE_ROUTE.economy;
    expect(ECONOMY.player.moveSpeed).toBe(r.moveSpeed);
    expect(ECONOMY.progression.levelThresholds).toEqual(r.levels.thresholds);
    expect(ECONOMY.route.couplePrices).toEqual(r.couplePrices);
    expect(ECONOMY.offline.efficiency).toBe(r.offline.efficiency);
  });

  it('prices the couplings from the route, and scales every price by the route multiplier', () => {
    const defs = buildUnlocks(['lobby']);
    expect(defs.find((d) => d.id === 'couple_1')?.price).toBe(ACTIVE_ROUTE.economy.couplePrices[0]);
    const econ = structuredClone(ECONOMY);
    econ.route.priceMultiplier = 2.5;
    expect(couplePrice(1, econ)).toBe(Math.round((ACTIVE_ROUTE.economy.couplePrices[0] * 2.5) / 5) * 5);
    expect(routePrice(15, econ)).toBe(38);
  });

  it('keeps the shoes within the speed cap', () => {
    const r = ACTIVE_ROUTE.economy;
    expect(1 + r.shoes.prices.length * r.shoes.step).toBeLessThanOrEqual(r.speedCap);
  });
});

import { carryOver } from '../src/sim/carryOver';
import { createDefaultSave } from '../src/save/SaveData';

describe('Phase 3: carry-over to the next route', () => {
  it('keeps gems, Rail Miles and the conductor; resets cash, carriages, unlocks, staff, station upgrades and the level', () => {
    const save = createDefaultSave(1000, 'install-1');
    save.wallet = { cash: 5400, gems: 37, railMiles: 21 };
    save.conductor = { speed: 2, capacity: 3, fareBonus: 1 };
    save.route = { ...save.route, level: 8, stars: 9000, carriages: ['lobby', 'cafe', 'sleeper', 'bathroom', 'bar', 'dining', 'familySleeper', 'cinema'], unlocked: ['c0.open', 'c0.shoes_1', 'couple_1'], partial: { 'c0.refurb_5': 300 } };
    save.staff = { attendant: { level: 2 } } as unknown as typeof save.staff;
    save.station.owned = { countryside: ['posters', 'benches'] };
    save.meta.postcards = ['millbrook'];
    save.profile.lifetimePlaySeconds = 9600;
    const { data, kept, cashLeft } = carryOver(save, 'riviera', 2000);
    expect(kept).toEqual({ gems: 37, railMiles: 21, conductor: { speed: 2, capacity: 3, fareBonus: 1 } });
    expect(data.wallet.cash).toBe(0);
    expect(cashLeft).toBe(5400);
    expect(data.route.id).toBe('riviera');
    expect(data.route.level).toBe(1);
    expect(data.route.stars).toBe(0);
    expect(data.route.carriages).toEqual(['lobby']);
    expect(data.route.unlocked).toEqual([]);
    expect(data.route.partial).toEqual({});
    expect(data.staff).toEqual({});
    expect(data.station.owned.riviera).toEqual([]);
    expect(data.station.owned.countryside).toEqual(['posters', 'benches']);
    expect(data.meta.postcards).toEqual(['millbrook']);
    expect(data.profile.lifetimePlaySeconds).toBe(9600);
    // The save passed in is untouched.
    expect(save.wallet.cash).toBe(5400);
  });
});

import { stuckBucket, translate } from '../src/services/gaMapping';

describe('Phase 3: analytics', () => {
  it('names the new events by the rules', () => {
    expect(translate('offline_return', { hours: 2, amount: 340 })).toEqual([{ kind: 'design', id: 'Offline:Return:2', value: 340 }]);
    expect(translate('offline_return', { hours: 30, amount: 10 })[0]).toMatchObject({ id: 'Offline:Return:12plus' });
    expect(translate('economy_stuck', { seconds: 250 })[0]).toMatchObject({ id: 'Economy:Stuck:180', value: 250 });
    expect(stuckBucket(700)).toBe('600');
    expect(stuckBucket(4000)).toBe('1800plus');
  });
});
