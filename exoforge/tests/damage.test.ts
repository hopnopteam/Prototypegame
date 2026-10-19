import { describe, expect, it } from 'vitest';
import { impactDamage, patched, plateStates } from '../src/sim/Damage';

describe('damage', () => {
  it('shrugs off impacts under the threshold', () => {
    expect(impactDamage(5.9, 6, 0.35)).toBe(0);
    expect(impactDamage(10, 6, 0.35)).toBeCloseTo(1.4, 6);
  });

  it('reads plates as full, cracked or lost', () => {
    expect(plateStates(3, 3)).toEqual(['full', 'full', 'full']);
    expect(plateStates(1.4, 3)).toEqual(['full', 'cracked', 'lost']);
    expect(plateStates(0, 3)).toEqual(['lost', 'lost', 'lost']);
  });

  it('patches one plate, never above the suit plates', () => {
    expect(patched(1.4, 3)).toBeCloseTo(2.4, 6);
    expect(patched(2.6, 3)).toBe(3);
  });
});
