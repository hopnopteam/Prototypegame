import { describe, expect, it } from 'vitest';
import { BASIC_REPAIRED_FARE, CLASSES, CLASS_BY_ID, classFare, classOfTier, classStartingAt, isPassengerType, maxTier } from '../src/config/classes';
import { ACTIVE_ROUTE } from '../src/config/routes';
import { ARCHETYPES, CARRIAGE_CATALOGUE, DEFAULT_TRAIN } from '../src/config/content';
import { buildUnlocks, refitMatches } from '../src/sim/unlockPlan';
import { getLayout, roomsAt } from '../src/world/layout';

describe('carriage classes', () => {
  it('climb in order: tiers, levels, fares, tips and stars never go down', () => {
    for (let i = 1; i < CLASSES.length; i++) {
      const [a, b] = [CLASSES[i - 1], CLASSES[i]];
      expect(b.tier, b.id).toBeGreaterThan(a.tier);
      expect(b.level, b.id).toBeGreaterThan(a.level);
      expect(b.fare, b.id).toBeGreaterThan(a.fare);
      expect(b.tip, b.id).toBeGreaterThan(a.tip);
      expect(b.stars, b.id).toBeGreaterThanOrEqual(a.stars);
    }
  });

  it('maps refit tiers to classes (tier 1 is Basic, repaired)', () => {
    expect([0, 1, 2, 3, 4, 5].map((t) => classOfTier(t).id)).toEqual(['basic', 'basic', 'comfort', 'business', 'first', 'royal']);
    expect(classStartingAt(1)).toBeNull();
    expect(classStartingAt(4)?.id).toBe('first');
    expect(classFare(0)).toBe(1);
    expect(classFare(1)).toBe(BASIC_REPAIRED_FARE);
    expect(classFare(5)).toBe(38);
  });

  it('earns clearly more per carriage with every class (Business keeps the Basic rooms; a sleeper holds two Royal Suites)', () => {
    for (const type of ['lobby', 'sleeper'] as const) {
      let last = 0;
      for (let tier = 1; tier <= 5; tier++) {
        const perRide = roomsAt(type, tier) * classFare(tier);
        expect(perRide, `${type} tier ${tier}`).toBeGreaterThan(last * 1.3);
        expect(getLayout(type, tier).cabins.length, `${type} tier ${tier}`).toBe(roomsAt(type, tier));
        last = perRide;
      }
      expect(roomsAt(type, 5)).toBe(type === 'lobby' ? 1 : 2);
    }
  });

  it('gives passenger carriages five classes and service cars four tiers', () => {
    expect(maxTier('lobby')).toBe(5);
    expect(maxTier('sleeper')).toBe(5);
    for (const type of ['bathroom', 'supply', 'luggage'] as const) {
      expect(isPassengerType(type)).toBe(false);
      expect(maxTier(type)).toBe(3);
    }
  });

  it('has guests for every class', () => {
    for (const c of CLASSES) expect(ARCHETYPES.some((a) => a.cls === c.id), c.id).toBe(true);
  });

  it('offers each class refit in every passenger carriage, gated by its level, dearer each step', () => {
    // Phase 1: the Repair, then one refit per class on the route's ladder (Business folded into First Class).
    const ladder = ACTIVE_ROUTE.classLadder.map((id) => CLASS_BY_ID[id].tier).filter((t) => t > 0);
    for (const type of ['lobby', 'sleeper'] as const) {
      const refits = CARRIAGE_CATALOGUE[type].unlocks.filter((u) => u.kind === 'refurb').sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      expect(refits.map((r) => r.tier), type).toEqual([1, ...ladder]);
      for (let i = 1; i < refits.length; i++) expect(refits[i].price, `${type} tier ${refits[i].tier}`).toBeGreaterThan(refits[i - 1].price);
      for (const r of refits) {
        const cls = classStartingAt(r.tier ?? 0);
        // A refit is offered at its class's level at the latest (a folded class comes at the level of the one it absorbs).
        const gate = Number((r.flags ?? []).find((f) => f.startsWith('level_'))?.slice(6) ?? 1);
        if (cls && cls.level > 1) expect(gate, `${type} ${cls.id}`).toBeLessThanOrEqual(cls.level);
        if (cls && cls.level > 1) expect(gate, `${type} ${cls.id}`).toBeGreaterThan(1);
      }
    }
  });

  it('counts class goals only on passenger carriages', () => {
    const defs = buildUnlocks(DEFAULT_TRAIN);
    const comfort = defs.filter((d) => refitMatches(d, 'class:comfort', DEFAULT_TRAIN[d.carriage]));
    expect(comfort.length).toBeGreaterThan(0);
    for (const d of comfort) expect(isPassengerType(DEFAULT_TRAIN[d.carriage])).toBe(true);
    // A service car's Cosy refit (tier 2) is not Comfort class, but still counts for a plain tier goal.
    const cosy = defs.find((d) => d.kind === 'refurb' && d.tier === 2 && !isPassengerType(DEFAULT_TRAIN[d.carriage]));
    expect(cosy).toBeDefined();
    if (cosy) {
      expect(refitMatches(cosy, 'class:comfort', DEFAULT_TRAIN[cosy.carriage])).toBe(false);
      expect(refitMatches(cosy, '2', DEFAULT_TRAIN[cosy.carriage])).toBe(true);
    }
  });
});
