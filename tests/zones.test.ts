import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../src/gameplay/Actor';
import { Zone, ZoneSystem, type ZoneOptions } from '../src/gameplay/Zones';

/**
 * Session 27 (owner: "players should be able to stand on or near the hover indicator… I don't want designated
 * spots"): a job counts the conductor on its spot, near its spot, near the thing its badge floats over, or anywhere in
 * its room, never through a wall; an unlock tile still has to be stood on.
 */
function setup(opts: Partial<ZoneOptions> = {}, wall = false) {
  const system = new ZoneSystem({} as THREE.Scene);
  system.reach = 1.6;
  system.badgeReach = 1.1;
  // A wall runs along x = 1.9: no straight line across it is clear.
  system.reachClear = (ax, _az, bx) => !wall || (ax < 1.9) === (bx < 1.9);
  // The job's furniture stands 1 m along x from its spot.
  system.anchor = (x, z) => ({ x: x + 1, z, height: 0.9 });
  let worked = 0;
  const zone = system.add(new Zone({ id: 'job', x: 0, z: 0, radius: 0.5, kind: 'work', icon: null, stay: () => { worked++; return true; }, ...opts }));
  const player = { isPlayer: true, pos: { x: 0, z: 0 } } as unknown as Actor;
  const at = (x: number, z: number): boolean => {
    player.pos.x = x;
    player.pos.z = z;
    worked = 0;
    // Twice: the first pass also finds where the badge hangs.
    system.update(1 / 30, [player]);
    system.update(1 / 30, [player]);
    return worked > 0;
  };
  return { zone, at };
}

describe('job zones', () => {
  it('count the conductor on the spot and near it', () => {
    const { at } = setup();
    expect(at(0, 0)).toBe(true);
    expect(at(0, 0.75)).toBe(true);
    expect(at(0, 1.2)).toBe(false);
  });

  it('count the conductor near the thing the badge floats over', () => {
    const { zone, at } = setup();
    expect(at(2.0, 0)).toBe(true);
    expect(zone.ax).toBe(1);
    expect(at(2.3, 0)).toBe(false);
  });

  it('never count through a wall', () => {
    const { at } = setup({}, true);
    expect(at(1.8, 0)).toBe(true);
    expect(at(2.0, 0)).toBe(false);
  });

  it('count anywhere in their room', () => {
    const { at } = setup({ area: (x, z) => x > -3 && x < -1 && z > -2 && z < 2 });
    expect(at(-2.8, 1.8)).toBe(true);
    expect(at(-3.2, 1.8)).toBe(false);
  });

  it('leave unlock tiles to be stood on', () => {
    const { at } = setup({ kind: undefined, marker: false });
    expect(at(0, 0.3)).toBe(true);
    expect(at(0, 0.75)).toBe(false);
    expect(at(2.0, 0)).toBe(false);
  });
});
