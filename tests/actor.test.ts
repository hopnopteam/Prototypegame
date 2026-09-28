import { describe, expect, it } from 'vitest';
import { formatNumber } from '../src/core/math';
import { Mover } from '../src/gameplay/Actor';

describe('Mover', () => {
  it('walks a path and calls back on arrival', () => {
    const pos = { x: 0, z: 0 };
    const mover = new Mover(pos, 2);
    let arrived = false;
    mover.go([{ x: 1, z: 0 }, { x: 1, z: 1 }], () => (arrived = true));
    for (let i = 0; i < 60; i++) mover.update(1 / 30);
    expect(arrived).toBe(true);
    expect(pos).toEqual({ x: 1, z: 1 });
  });

  it('treats a waypoint someone is standing on as reached once close and stalled', () => {
    const pos = { x: 0, z: 0 };
    const mover = new Mover(pos, 2);
    let arrived = false;
    mover.go([{ x: 2, z: 0 }, { x: 2, z: 2 }], () => (arrived = true));
    // A guest stands on (2, 0): personal space keeps pushing the walker back to 0.5 m short of it.
    for (let i = 0; i < 90 && !arrived; i++) {
      mover.update(1 / 30);
      if (pos.z === 0 && pos.x > 1.5) pos.x = 1.5;
    }
    expect(arrived).toBe(true);
  });
});

describe('formatNumber', () => {
  it('stays short on the HUD and never rounds up past what you have', () => {
    expect(formatNumber(9_999)).toBe('9,999');
    expect(formatNumber(99_999)).toBe('99.9K');
    expect(formatNumber(123_456)).toBe('123K');
    expect(formatNumber(9_999_999)).toBe('9.9M');
  });
});
