import { describe, expect, it } from 'vitest';
import { CharacterPool } from '../src/world/CharacterPool';
import { CONDUCTOR_LOOK, STAFF_LOOKS } from '../src/world/CharacterView';

// Session 32: guests' characters are recycled, never made or freed during play, and a recycled one keeps nothing of
// whoever wore it before.
describe('CharacterPool', () => {
  it('keeps active + pooled constant and hands out each character to one owner at a time', () => {
    const pool = new CharacterPool(4);
    const a = pool.take(CONDUCTOR_LOOK, 1);
    const b = pool.take(STAFF_LOOKS.porter, 1);
    expect(a).not.toBe(b);
    expect(pool.active.size + pool.pooled).toBe(4);
    pool.give(a);
    pool.give(a);
    expect(pool.active.size + pool.pooled).toBe(4);
    expect(pool.made).toBe(4);
  });

  it('resets every field on reuse', () => {
    const pool = new CharacterPool(1);
    const first = pool.take(STAFF_LOOKS.porter, 0.9);
    first.setPose('sleep');
    first.act('wave', 5);
    first.setPosition(3, 0, 4);
    first.setFacing(1.2);
    pool.give(first);
    const again = pool.take(STAFF_LOOKS.chef, 1.05);
    expect(again).toBe(first);
    expect(again.look).toBe(STAFF_LOOKS.chef);
    expect(again.currentAction).toBe('none');
    expect(again.root.position.toArray()).toEqual([0, 0, 0]);
    expect(again.root.rotation.y).toBe(0);
    expect(again.root.scale.x).toBeCloseTo(1.05);
    expect(again.body.rotation.x).toBe(0);
    expect(again.hasBubble).toBe(false);
  });
});
