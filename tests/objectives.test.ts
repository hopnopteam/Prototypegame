import { describe, expect, it } from 'vitest';
import { REACTIONS } from '../src/config/chatter';
import { DEFAULT_TRAIN } from '../src/config/content';
import { OBJECTIVES } from '../src/config/objectives';
import { buildUnlocks } from '../src/sim/unlockPlan';

describe('objective chain', () => {
  const defs = buildUnlocks(DEFAULT_TRAIN);

  it('has unique ids and positive targets', () => {
    expect(new Set(OBJECTIVES.map((o) => o.id)).size).toBe(OBJECTIVES.length);
    for (const o of OBJECTIVES) expect(o.target, o.id).toBeGreaterThan(0);
  });

  it('only asks for things the default train can deliver', () => {
    for (const o of OBJECTIVES) {
      if (o.event === 'unlock') {
        const [kind, detail] = (o.filter ?? '').split(':');
        const matching = defs.filter((d) => d.kind === kind && (!detail || d.role === detail || d.comfort === detail));
        expect(matching.length, o.id).toBeGreaterThanOrEqual(o.target);
      }
      if (o.event === 'refurb') {
        const matching = defs.filter((d) => d.kind === 'refurb' && (!o.filter || String(d.tier) === o.filter));
        expect(matching.length, o.id).toBeGreaterThanOrEqual(o.target);
      }
      if (o.event === 'coupling') expect(o.target, o.id).toBeLessThanOrEqual(DEFAULT_TRAIN.length - 1);
      if (o.event === 'level') expect(o.target, o.id).toBeLessThanOrEqual(8);
    }
  });

  it('asks for the carriages in order and the levels in order', () => {
    const couplings = OBJECTIVES.filter((o) => o.event === 'coupling').map((o) => o.target);
    expect(couplings).toEqual([1, 2, 3, 4]);
    const levels = OBJECTIVES.filter((o) => o.event === 'level').map((o) => o.target);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });
});

describe('comforts', () => {
  it('each cabin and washroom carriage has comforts that build on each other', () => {
    const defs = buildUnlocks(DEFAULT_TRAIN);
    const comforts = defs.filter((d) => d.kind === 'comfort');
    expect(comforts.length).toBeGreaterThanOrEqual(8);
    for (const c of comforts) {
      expect(c.comfort, c.id).toBeDefined();
      expect(c.id).toMatch(/^c\d\.comfort_/);
      for (const r of c.requires) expect(defs.some((d) => d.id === r), `${c.id} needs ${r}`).toBe(true);
    }
  });
});

describe('reactions', () => {
  it('gives every situation an icon (pictures, not sentences)', () => {
    for (const [situation, reaction] of Object.entries(REACTIONS)) expect(typeof reaction.icon, situation).toBe('string');
  });
});
