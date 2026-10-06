import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { DEFAULT_TRAIN, MAX_CARRIAGES, STATION_UPGRADES } from '../src/config/content';
import type { CarriageType } from '../src/core/types';
import { allowedCarriages, buildUnlocks, carriageChoices, legacyCarriages, migrateLegacyId, stationPerks } from '../src/sim/unlockPlan';
import { Progression } from '../src/sim/Progression';
import { UnlockChain } from '../src/sim/UnlockChain';
import { Wallet } from '../src/sim/Wallet';

describe('Wallet', () => {
  it('adds, spends and reports every change with its source', () => {
    const changes: [string, number, string][] = [];
    const wallet = new Wallet({ cash: 0, gems: 0, railMiles: 0 }, (kind, _amount, delta, source) => changes.push([kind, delta, source]));
    wallet.add('cash', 20, 'fare');
    expect(wallet.trySpend('cash', 30, 'tile')).toBe(false);
    expect(wallet.trySpend('cash', 5, 'tile')).toBe(true);
    expect(wallet.take('cash', 100, 'tile')).toBe(15);
    expect(wallet.get('cash')).toBe(0);
    expect(changes).toEqual([
      ['cash', 20, 'fare'],
      ['cash', -5, 'tile'],
      ['cash', -15, 'tile'],
    ]);
  });

  it('ignores non-positive additions', () => {
    const wallet = new Wallet({ cash: 0, gems: 0, railMiles: 0 });
    wallet.add('gems', -5, 'x');
    wallet.add('gems', Number.NaN, 'x');
    expect(wallet.get('gems')).toBe(0);
  });
});

describe('Progression', () => {
  it('levels up at the thresholds and caps at the route max', () => {
    const p = new Progression(ECONOMY.progression, { stars: 0, level: 1 });
    const toLevel2 = ECONOMY.progression.levelThresholds[1];
    expect(p.addStars(toLevel2 - 1)).toEqual([]);
    expect(p.addStars(1)).toEqual([2]);
    expect(p.addStars(10_000)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(p.isMaxLevel).toBe(true);
    expect(p.levelProgress().fraction).toBe(1);
  });

  it('reports progress within the level', () => {
    const p = new Progression(ECONOMY.progression, { stars: 0, level: 1 });
    p.addStars(22);
    const progress = p.levelProgress();
    expect(progress.current).toBe(22);
    expect(progress.needed).toBe(ECONOMY.progression.levelThresholds[1]);
  });

  it('gates features by level (§9)', () => {
    const p = new Progression(ECONOMY.progression, { stars: 0, level: 1 });
    expect(p.isFeatureUnlocked('conductorUpgrades')).toBe(false);
    p.addStars(90);
    expect(p.isFeatureUnlocked('conductorUpgrades')).toBe(true);
    expect(p.isFeatureUnlocked('stories')).toBe(false);
  });
});

const UNLOCKS = buildUnlocks(DEFAULT_TRAIN);

describe('UnlockChain', () => {
  const makeChain = (flags: Record<string, boolean> = {}) => new UnlockChain(UNLOCKS, { unlocked: [], partial: {} }, () => flags);

  it('shows only the first tile at the start (session 22: Open carriage, then the second cabin)', () => {
    expect(makeChain().available().map((d) => d.id)).toEqual(['c0.open']);
  });

  it('takes payment in instalments and completes once', () => {
    const chain = new UnlockChain(UNLOCKS, { unlocked: ['c0.open'], partial: {} }, () => ({}));
    expect(chain.pay('c0.cabin_1', 4)).toBe(4);
    expect(chain.complete('c0.cabin_1')).toBe(false);
    expect(chain.pay('c0.cabin_1', 100)).toBe(chain.get('c0.cabin_1')!.price - 4);
    expect(chain.complete('c0.cabin_1')).toBe(true);
    expect(chain.complete('c0.cabin_1')).toBe(false);
    expect(chain.available().map((d) => d.id)).not.toContain('c0.cabin_1');
  });

  it('waits for gameplay flags (hire after the first manual clean)', () => {
    const flags: Record<string, boolean> = {};
    const chain = new UnlockChain(UNLOCKS, { unlocked: ['c0.open', 'c0.cabin_1', 'c0.cabin_2'], partial: {} }, () => flags);
    expect(chain.isAvailable('c0.hire_attendant')).toBe(false);
    flags.firstCabinCleaned = true;
    expect(chain.isAvailable('c0.hire_attendant')).toBe(true);
  });

  it('every requirement refers to a real unlock and every chosen train has no dead ends', () => {
    const trains: CarriageType[][] = [
      [...DEFAULT_TRAIN],
      ['lobby', 'sleeper', 'bathroom', 'sleeper', 'supply'],
      ['lobby', 'luggage', 'sleeper', 'bathroom', 'supply'],
    ];
    for (const train of trains) {
      const defs = buildUnlocks(train);
      const ids = new Set(defs.map((u) => u.id));
      for (const def of defs) for (const r of def.requires) expect(ids.has(r), `${train.join(',')}: ${def.id} needs ${r}`).toBe(true);
      // Every milestone reached: the first cabin cleaned by hand and every route level (class upgrades wait for theirs).
      const flags: Record<string, boolean> = { firstCabinCleaned: true };
      for (let level = 1; level <= 8; level++) flags[`level_${level}`] = true;
      const chain = new UnlockChain(defs, { unlocked: [], partial: {} }, () => flags);
      let guard = 0;
      while (chain.available().length > 0 && guard++ < 200) {
        for (const def of chain.available()) chain.forceComplete(def.id);
      }
      expect(defs.every((u) => chain.isUnlocked(u.id)), train.join(',')).toBe(true);
    }
  });

  it('points at the cheapest available tile', () => {
    const chain = new UnlockChain(UNLOCKS, { unlocked: ['c0.open', 'c0.cabin_1', 'c0.cabin_2', 'c0.hire_attendant'], partial: {} }, () => ({}));
    expect(chain.cheapestAvailable()?.id).toBe('c0.refurb_1');
  });

  it('keeps completed tiles when the chain grows with a new carriage', () => {
    const state = { unlocked: ['c0.cabin_1'], partial: {} };
    const chain = new UnlockChain(buildUnlocks(['lobby']), state, () => ({}));
    chain.setDefs(buildUnlocks(['lobby', 'sleeper']));
    expect(chain.isUnlocked('c0.cabin_1')).toBe(true);
    expect(chain.get('c1.cabin_0')?.label).toBe('Cabin 4');
  });

  it('refurbishes every carriage one tier at a time, and says what each tile does', () => {
    for (const def of UNLOCKS) expect(def.effect.length, def.id).toBeGreaterThan(0);
    for (const def of UNLOCKS.filter((u) => u.kind === 'refurb')) {
      const tier = def.tier ?? 0;
      expect(tier, def.id).toBeGreaterThanOrEqual(1);
      if (tier > 1) expect(def.requires, def.id).toContain(`c${def.carriage}.refurb_${tier - 1}`);
      expect(def.id).toBe(`c${def.carriage}.refurb_${tier}`);
    }
  });
});

describe('carriage choice', () => {
  const none = { leftBehind: 0, luggageLeft: 0 };

  it('recommends beds first, then the café, then a washroom car (the stores on offer once it is there)', () => {
    expect(carriageChoices(['lobby'], none)[0]).toEqual({ type: 'sleeper', reason: expect.any(String) });
    expect(carriageChoices(['lobby'], none).map((c) => c.type)).not.toContain('supply');
    expect(carriageChoices(['lobby', 'sleeper'], none)[0].type).toBe('cafe');
    expect(carriageChoices(['lobby', 'sleeper', 'cafe'], none)[0].type).toBe('bathroom');
    expect(carriageChoices(['lobby', 'sleeper', 'cafe', 'bathroom'], none).map((c) => c.type)).toContain('supply');
  });

  it('the recommended picks grow the default train', () => {
    const train: CarriageType[] = ['lobby'];
    while (train.length < DEFAULT_TRAIN.length) train.push(carriageChoices(train, none)[0].type);
    expect(train).toEqual(DEFAULT_TRAIN);
  });

  it('offers racks when bags were left behind, recommends more beds when guests were', () => {
    expect(carriageChoices(['lobby', 'sleeper', 'bathroom'], { leftBehind: 0, luggageLeft: 4 }).map((c) => c.type)).toContain('luggage');
    expect(carriageChoices(['lobby', 'sleeper', 'cafe', 'bathroom'], { leftBehind: 3, luggageLeft: 0 })[0].type).toBe('sleeper');
    expect(carriageChoices(['lobby'], { leftBehind: 2, luggageLeft: 0 })[0].reason).toContain('beds');
  });

  it('respects each type\'s limit and the train length', () => {
    expect(allowedCarriages(['lobby', 'sleeper', 'sleeper'])).not.toContain('sleeper');
    expect(allowedCarriages([...DEFAULT_TRAIN])).toEqual([]);
    expect(MAX_CARRIAGES).toBe(DEFAULT_TRAIN.length);
  });

  it('maps pre-choice save ids onto carriage slots', () => {
    expect(migrateLegacyId('cabin_0_1')).toBe('c0.cabin_1');
    expect(migrateLegacyId('hire_attendant_0')).toBe('c0.hire_attendant');
    expect(migrateLegacyId('refurb_4_2')).toBe('c4.refurb_2');
    expect(migrateLegacyId('up_runner_2')).toBe('c2.up_runner');
    expect(migrateLegacyId('couple_3')).toBe('couple_3');
    expect(legacyCarriages(['couple_1', 'couple_2'])).toEqual(['lobby', 'bathroom', 'supply']);
  });

  it('offers station upgrades in order, each reachable once the train has grown', () => {
    const defs = buildUnlocks([...DEFAULT_TRAIN]);
    const ids = new Set(defs.map((d) => d.id));
    const station = defs.filter((d) => d.kind === 'exterior' || d.kind === 'marketing');
    expect(station.map((d) => d.id)).toEqual(STATION_UPGRADES.map((u) => `st.${u.key}`));
    for (const d of station) {
      expect(d.carriage).toBe(-1);
      for (const r of d.requires) expect(ids.has(r)).toBe(true);
    }
  });

  it('adds up the bonuses of the station upgrades bought', () => {
    expect(stationPerks(() => false)).toEqual({ tips: 0, fares: 0, passengers: 0, vip: 0, stationBonus: 0 });
    const all = stationPerks(() => true);
    expect(all.passengers).toBe(STATION_UPGRADES.reduce((sum, u) => sum + (u.bonus.passengers ?? 0), 0));
    expect(all.tips).toBeCloseTo(0.1);
    const posters = stationPerks((id) => id === 'st.posters');
    expect(posters.passengers).toBe(1);
    expect(posters.tips).toBe(0);
  });
});
