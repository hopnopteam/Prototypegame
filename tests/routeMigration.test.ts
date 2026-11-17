import { describe, expect, it } from 'vitest';
import { CARRIAGE_ORDER } from '../src/config/content';
import { migrateRoute } from '../src/sim/routeMigration';
import { buildUnlocks } from '../src/sim/unlockPlan';
import { refitStep } from '../src/sim/refitSteps';
import { SAVE_MIGRATIONS } from '../src/save/SaveSystem';
import type { CarriageType } from '../src/core/types';

const priceOf = (train: CarriageType[], id: string): number => buildUnlocks(train).find((d) => d.id === id)?.price ?? 0;

describe('Phase 1: save v4 → v5, the Countryside Express', () => {
  it('rebuilds a full nine-carriage train into the new lineup, refunding the dome', () => {
    const old: CarriageType[] = ['lobby', 'cafe', 'sleeper', 'bathroom', 'sleeper', 'dining', 'cinema', 'bar', 'dome'];
    const unlocked = ['c0.open', 'c0.refurb_1', 'c0.refurb_2', 'c0.refurb_3', 'c4.cabin_0', 'c4.refurb_4', 'c6.seats_2', 'c7.stool_2', 'c8.row_1', 'c8.refurb_1', 'st.posters'];
    for (let n = 1; n <= 8; n++) unlocked.push(`couple_${n}`);
    const result = migrateRoute({ carriages: old, unlocked, partial: { 'c8.row_2': 50, 'c2.cabin_3': 20 } }, { host_8: { level: 1 }, attendant_4: { level: 2 }, bartender_7: { level: 1 } }, 6);
    expect(result.carriages).toEqual(CARRIAGE_ORDER);
    // The second Sleeper is the Family Sleeper, in its new place; its First Class refit (which it does not sell) is refunded.
    const family = CARRIAGE_ORDER.indexOf('familySleeper');
    expect(result.unlocked).toContain(`c${family}.cabin_0`);
    expect(result.unlocked).not.toContain(`c${family}.refurb_4`);
    // The bar moved up, the cinema to the end, their tiles and helpers with them.
    expect(result.unlocked).toContain(`c${CARRIAGE_ORDER.indexOf('bar')}.stool_2`);
    expect(result.unlocked).toContain(`c${CARRIAGE_ORDER.indexOf('cinema')}.seats_2`);
    expect(result.staff).toEqual({ attendant_6: { level: 2 }, bartender_4: { level: 1 } });
    // A lobby at Business keeps it; the station upgrades stay; the couplings follow the carriages kept.
    expect(result.unlocked).toContain('c0.refurb_3');
    expect(result.unlocked).toContain('st.posters');
    expect(result.unlocked).not.toContain('couple_8');
    expect(result.unlocked).toContain('couple_7');
    // What left the train comes back as cash: the dome's tiles, the eighth coupling, part-payments on the dome.
    const refund = priceOf(old, 'c8.row_1') + priceOf(old, 'c8.refurb_1') + priceOf(old, 'c4.refurb_4') + 50;
    expect(result.refund).toBeGreaterThan(refund);
    expect(result.partial).toEqual({ 'c2.cabin_3': 20 });
    // Nothing the old train already reached is sent to analytics again.
    expect(result.gaSent['train:9']).toBe(true);
    expect(result.gaSent['coupled:cinema']).toBe(true);
    expect(result.gaSent['level:6']).toBe(true);
  });

  it('drops the stores and luggage cars of a chooser-era train and re-sorts the rest', () => {
    const old: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper'];
    const unlocked = ['c0.open', 'c1.bath_1', 'c2.hire_runner', 'c3.refurb_1', 'c4.cabin_0', 'couple_1', 'couple_2', 'couple_3', 'couple_4'];
    const result = migrateRoute({ carriages: old, unlocked, partial: {} }, { runner_2: { level: 1 } }, 3);
    expect(result.carriages).toEqual(['lobby', 'sleeper', 'bathroom']);
    expect(result.unlocked).toEqual(expect.arrayContaining(['c0.open', 'c1.cabin_0', 'c2.bath_1', 'couple_1', 'couple_2']));
    expect(result.unlocked).not.toContain('couple_3');
    expect(result.staff).toEqual({});
    expect(result.refund).toBe(priceOf(old, 'c2.hire_runner') + priceOf(old, 'c3.refurb_1') + priceOf(old, 'couple_3') + priceOf(old, 'couple_4'));
  });

  it('leaves gems, Rail Miles, level and stars alone and adds the refund to the cash', () => {
    const raw: Record<string, unknown> = {
      wallet: { cash: 100, gems: 77, railMiles: 12 },
      route: { carriages: ['lobby', 'cafe', 'sleeper', 'bathroom', 'sleeper', 'dining', 'cinema', 'bar', 'dome'], unlocked: ['c8.row_1', 'couple_8'], partial: {}, level: 7, stars: 1234 },
      staff: {},
      profile: { flags: { openingSeen: true } },
    };
    SAVE_MIGRATIONS.find((m) => m.from === 4)?.apply(raw);
    const wallet = raw.wallet as { cash: number; gems: number; railMiles: number };
    const route = raw.route as { level: number; stars: number; migrationRefund: number };
    expect(wallet.gems).toBe(77);
    expect(wallet.railMiles).toBe(12);
    expect(route.level).toBe(7);
    expect(route.stars).toBe(1234);
    expect(route.migrationRefund).toBeGreaterThan(0);
    expect(wallet.cash).toBe(100 + route.migrationRefund);
  });

  it('counts three refit tiers on every carriage (the passenger carriages after their Repair)', () => {
    expect([1, 2, 4, 5].map((t) => refitStep('lobby', t))).toEqual([0, 1, 2, 3]);
    expect([1, 2, 3].map((t) => refitStep('cafe', t))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((t) => refitStep('familySleeper', t))).toEqual([1, 2, 3]);
    // An older Business refit sits under Comfort's step.
    expect(refitStep('sleeper', 3)).toBe(1);
  });
});
