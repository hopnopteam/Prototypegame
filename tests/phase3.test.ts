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
