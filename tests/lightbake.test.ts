import { describe, expect, it } from 'vitest';
import { bakeLight, sampleBake, type BakeInput } from '../src/world/lightBake';
import { trainLightInput } from '../src/world/trainLight';
import { getLayout, carriageOriginZ } from '../src/world/layout';

/** Two rooms side by side along z with a wall between them, a lamp in the first, a window on the left. */
function twoRooms(): BakeInput {
  return {
    box: { x0: -4, z0: -1, x1: 2, z1: 9 },
    texel: 0.1,
    rooms: [
      { rect: { x0: -1.5, z0: 0, x1: 1.5, z1: 3.9 }, ambient: [0.1, 0.08, 0.05] },
      { rect: { x0: -1.5, z0: 4.1, x1: 1.5, z1: 8 }, ambient: [0.1, 0.08, 0.05] },
    ],
    lamps: [{ x: 0, z: 3, strength: 2, radius: 2.5, color: [1, 0.8, 0.6] }],
    occluders: [{ rect: { x0: -1.5, z0: 3.9, x1: 1.5, z1: 4.1 }, strength: 0.4, reach: 0.4 }],
    spills: [{ z0: 1, z1: 2, x: -1.5, dir: -1, reach: 2.4, strength: 0.5, color: [1, 0.7, 0.4] }],
  };
}

describe('light bake', () => {
  const input = twoRooms();
  const baked = bakeLight(input);
  const at = (x: number, z: number) => sampleBake(baked, input.box, input.texel, x, z);

  it('pools a lamp in its own room and barely through the wall', () => {
    const near = at(0, 3.5).light[0];
    const beyond = at(0, 4.5).light[0];
    expect(near).toBeGreaterThan(0.5);
    // Same distance from the lamp, but the far side of the wall gets only a little of it.
    expect(beyond).toBeLessThan(near * 0.35);
    expect(beyond).toBeGreaterThan(0.09);
  });

  it('shades the floor against walls, not in the open', () => {
    expect(at(0, 3.85).ao).toBeLessThan(0.85);
    expect(at(0, 1.5).ao).toBeGreaterThan(0.97);
  });

  it('spills window light outside the hull, fading with distance', () => {
    const close = at(-1.8, 1.5).light[0];
    const far = at(-3.5, 1.5).light[0];
    expect(close).toBeGreaterThan(0.1);
    expect(far).toBeLessThan(close);
    expect(at(-1.8, 6).light[0]).toBeLessThan(0.02);
  });

  it('reads as no light and no shade past its edges', () => {
    const edge = sampleBake(baked, input.box, input.texel, 50, 50);
    expect(edge.light).toEqual([0, 0, 0]);
    expect(edge.ao).toBe(1);
  });

  it('bakes the whole train, every class floor plan, without NaNs', () => {
    for (const tier of [0, 2, 5]) {
      const cars = (['lobby', 'sleeper', 'bathroom'] as const).map((type, i) => ({ layout: getLayout(type, tier), originZ: carriageOriginZ(i), tier, lamps: [{ x: 0, y: 1.3, z: carriageOriginZ(i) + 7, strength: 1 }] }));
      const t = trainLightInput(cars);
      const b = bakeLight(t);
      expect(b.data.every((v) => Number.isFinite(v)), `tier ${tier}`).toBe(true);
      expect(Math.max(...b.data.filter((_, k) => k % 4 === 0))).toBeGreaterThan(0.2);
    }
  });
});
