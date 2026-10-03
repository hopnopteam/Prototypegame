import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAIN } from '../src/config/content';
import { ECONOMY } from '../src/config/economy';
import { Flow } from '../src/gameplay/Flow';
import type { World } from '../src/gameplay/World';
import { buildUnlocks } from '../src/sim/unlockPlan';
import { UnlockChain } from '../src/sim/UnlockChain';

/**
 * Session 16 (owner: "one room, one guest, one upgrade… we need a FLOW"): the opening sells one thing at a
 * time in a set order, and every later feature joins when the ride reaches it.
 */

describe('the opening', () => {
  const opening = ECONOMY.flow.openingTiles;

  it('names real tiles, ending with the first coupling', () => {
    const ids = new Set(buildUnlocks(DEFAULT_TRAIN).map((d) => d.id));
    for (const id of opening) expect(ids.has(id), id).toBe(true);
    expect(opening[opening.length - 1]).toBe('couple_1');
  });

  it('can be bought in its order: each tile is the next one available (the attendant after the first tidy)', () => {
    const flags: Record<string, boolean> = {};
    const chain = new UnlockChain(buildUnlocks(['lobby']), { unlocked: [], partial: {} }, () => flags);
    for (const id of opening) {
      if (id === 'c0.hire_attendant') {
        expect(chain.isAvailable(id), 'the attendant waits for a room tidied by hand').toBe(false);
        flags.firstCabinCleaned = true;
      }
      expect(chain.isAvailable(id), id).toBe(true);
      chain.pay(id, chain.get(id)!.price);
      expect(chain.complete(id)).toBe(true);
    }
  });

  it('starts with one guest and nothing on the floor, and the first cabin costs no more than the first fare', () => {
    expect(ECONOMY.guests.initialGuests).toBe(1);
    expect(ECONOMY.money.startingFloorCash).toBe(0);
    const first = buildUnlocks(['lobby']).find((d) => d.id === opening[0])!;
    expect(first.price).toBeLessThanOrEqual(ECONOMY.money.baseFare);
  });
});

describe('Flow', () => {
  /** Just what Flow reads from the world. */
  const world = (state: { stops?: number; carriages?: number; seconds?: number; level?: number; unlocked?: string[] }): World => {
    const unlocked = new Set(state.unlocked ?? []);
    return {
      econ: ECONOMY,
      data: { route: { stopsCompleted: state.stops ?? 0 } },
      train: { count: state.carriages ?? 1 },
      progression: { level: state.level ?? 1 },
      unlocks: { isUnlocked: (id: string) => unlocked.has(id) },
      lifetimeSeconds: () => state.seconds ?? 0,
    } as unknown as World;
  };

  it('walks the opening one tile at a time and ends it at the first coupling', () => {
    expect(new Flow(world({})).openingTile()).toBe('c0.cabin_1');
    expect(new Flow(world({ unlocked: ['c0.cabin_1'] })).openingTile()).toBe('c0.cabin_2');
    const done = new Flow(world({ unlocked: [...ECONOMY.flow.openingTiles] }));
    expect(done.openingTile()).toBeNull();
    expect(done.opening).toBe(false);
  });

  it('brings in each feature when the ride reaches it', () => {
    const start = new Flow(world({}));
    for (const feature of ['luggage', 'crowd', 'reactions', 'rush', 'classChips', 'couplePreview', 'offers', 'workshop', 'moreTiles', 'manyRequests'] as const) {
      expect(start.allows(feature), feature).toBe(false);
    }
    // After the first stop: bags, a crowd on the platform, reactions, more than one request at a time.
    const afterStop = new Flow(world({ stops: 1 }));
    expect(afterStop.allows('luggage')).toBe(true);
    expect(afterStop.allows('crowd')).toBe(true);
    expect(afterStop.allows('workshop')).toBe(false);
    // The second carriage: Rush, class badges, the next-carriage plate; offers once the opening minutes are over.
    const coupled = new Flow(world({ stops: 1, carriages: 2, seconds: 60 }));
    expect(coupled.allows('rush')).toBe(true);
    expect(coupled.allows('couplePreview')).toBe(true);
    expect(coupled.allows('offers')).toBe(false);
    expect(new Flow(world({ stops: 1, carriages: 2, seconds: 200 })).allows('offers')).toBe(true);
    // The station workshop from the third stop with a second carriage; two tiles from route level 2.
    expect(new Flow(world({ stops: 2, carriages: 2 })).allows('workshop')).toBe(true);
    expect(new Flow(world({ level: 2 })).allows('moreTiles')).toBe(true);
  });

  it('walk-ins belong to the first leg only', () => {
    expect(new Flow(world({ stops: 0 })).walkIns).toBe(true);
    expect(new Flow(world({ stops: 1 })).walkIns).toBe(false);
  });
});
