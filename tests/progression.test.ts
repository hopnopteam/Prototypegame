import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/config/economy';
import { UNLOCKS } from '../src/config/content';
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
    expect(p.addStars(89)).toEqual([]);
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
    expect(progress.needed).toBe(90);
  });

  it('gates features by level (§9)', () => {
    const p = new Progression(ECONOMY.progression, { stars: 0, level: 1 });
    expect(p.isFeatureUnlocked('conductorUpgrades')).toBe(false);
    p.addStars(90);
    expect(p.isFeatureUnlocked('conductorUpgrades')).toBe(true);
    expect(p.isFeatureUnlocked('stories')).toBe(false);
  });
});

describe('UnlockChain', () => {
  const makeChain = (flags: Record<string, boolean> = {}) => new UnlockChain(UNLOCKS, { unlocked: [], partial: {} }, () => flags);

  it('shows only the first tile at the start', () => {
    expect(makeChain().available().map((d) => d.id)).toEqual(['cabin_0_1']);
  });

  it('takes payment in instalments and completes once', () => {
    const chain = makeChain();
    expect(chain.pay('cabin_0_1', 4)).toBe(4);
    expect(chain.complete('cabin_0_1')).toBe(false);
    expect(chain.pay('cabin_0_1', 100)).toBe(16);
    expect(chain.complete('cabin_0_1')).toBe(true);
    expect(chain.complete('cabin_0_1')).toBe(false);
    expect(chain.available().map((d) => d.id)).toEqual(['cabin_0_2']);
  });

  it('waits for gameplay flags (hire after the first manual clean)', () => {
    const flags: Record<string, boolean> = {};
    const chain = new UnlockChain(UNLOCKS, { unlocked: ['cabin_0_1', 'cabin_0_2'], partial: {} }, () => flags);
    expect(chain.isAvailable('hire_attendant_0')).toBe(false);
    flags.firstCabinCleaned = true;
    expect(chain.isAvailable('hire_attendant_0')).toBe(true);
  });

  it('every requirement refers to a real unlock and the chain has no dead ends', () => {
    const ids = new Set(UNLOCKS.map((u) => u.id));
    for (const def of UNLOCKS) for (const r of def.requires) expect(ids.has(r)).toBe(true);
    const chain = new UnlockChain(UNLOCKS, { unlocked: [], partial: {} }, () => ({ firstCabinCleaned: true }));
    let guard = 0;
    while (chain.available().length > 0 && guard++ < 100) {
      for (const def of chain.available()) chain.forceComplete(def.id);
    }
    expect(UNLOCKS.every((u) => chain.isUnlocked(u.id))).toBe(true);
  });

  it('points at the cheapest available tile', () => {
    const chain = new UnlockChain(UNLOCKS, { unlocked: ['cabin_0_1', 'cabin_0_2', 'hire_attendant_0'], partial: {} }, () => ({}));
    expect(chain.cheapestAvailable()?.id).toBe('bedding_0');
  });
});
