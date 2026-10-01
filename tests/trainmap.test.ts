import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAIN } from '../src/config/content';
import { ECONOMY } from '../src/config/economy';
import type { Vec2 } from '../src/core/types';
import { TrainMap } from '../src/sim/TrainMap';
import { carriageOriginZ, getLayout } from '../src/world/layout';

const FULL_TRAIN = [...DEFAULT_TRAIN];
const GRID = 0.05;

/** Flood-fills walkable space on a grid from a start point; returns a lookup for reachability. */
function reachable(map: TrainMap, start: Vec2): (p: Vec2, tolerance?: number) => boolean {
  const key = (ix: number, iz: number): string => `${ix},${iz}`;
  const seen = new Set<string>();
  const sx = Math.round(start.x / GRID);
  const sz = Math.round(start.z / GRID);
  const queue: [number, number][] = [[sx, sz]];
  seen.add(key(sx, sz));
  while (queue.length > 0) {
    const [ix, iz] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const nz = iz + dz;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (!map.walk.isWalkable(nx * GRID, nz * GRID)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return (p, tolerance = 0.45) => {
    const r = Math.ceil(tolerance / GRID);
    const cx = Math.round(p.x / GRID);
    const cz = Math.round(p.z / GRID);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        if (seen.has(key(cx + dx, cz + dz))) return true;
      }
    }
    return false;
  };
}

describe('TrainMap', () => {
  const map = new TrainMap(ECONOMY.player.radius);
  map.rebuild(FULL_TRAIN, false);
  const spawn = map.anchor(0, 'playerSpawn');
  const canReach = reachable(map, spawn);

  it('spawns the player on walkable floor', () => {
    expect(map.walk.isWalkable(spawn.x, spawn.z)).toBe(true);
  });

  it('lets the player reach every anchor in every carriage', () => {
    for (const c of map.carriages) {
      for (const name of Object.keys(c.layout.anchors)) {
        expect(canReach(map.anchor(c.index, name)), `carriage ${c.index} anchor ${name}`).toBe(true);
      }
    }
  });

  it('lets the player reach every cabin, dirty spot and bathroom', () => {
    for (const c of map.carriages) {
      for (const cabin of c.layout.cabins) {
        expect(canReach(map.toWorld(c.index, cabin.center)), `cabin ${c.index}/${cabin.index}`).toBe(true);
        for (const spot of cabin.spots) expect(canReach(map.toWorld(c.index, spot), 0.35), `spot in ${c.index}/${cabin.index}`).toBe(true);
      }
      for (const bath of c.layout.bathrooms) {
        expect(canReach(map.toWorld(c.index, bath.restock)), `bathroom ${c.index}/${bath.index}`).toBe(true);
      }
    }
  });

  it('lets the player reach the rear coupling tile', () => {
    expect(canReach(map.rearDeck().tile)).toBe(true);
  });

  it('keeps the platform out of reach while the doors are shut', () => {
    const door = map.doors()[0];
    expect(canReach(door.outside, 0.2)).toBe(false);
  });

  it('opens the platform during a station stop', () => {
    const open = new TrainMap(ECONOMY.player.radius);
    open.rebuild(FULL_TRAIN, true);
    const openReach = reachable(open, spawn);
    for (const door of open.doors()) expect(openReach(door.outside, 0.2)).toBe(true);
  });

  it('routes guests from the door to every cabin and bathroom', () => {
    const open = new TrainMap(ECONOMY.player.radius);
    open.rebuild(FULL_TRAIN, true);
    const from = open.doors()[0].outsideNode;
    for (const c of open.carriages) {
      for (const cabin of c.layout.cabins) expect(open.nav.findPath(from, open.nodeId(c.index, cabin.node))).not.toBeNull();
      for (const bath of c.layout.bathrooms) expect(open.nav.findPath(from, open.nodeId(c.index, bath.useNode))).not.toBeNull();
    }
    expect(open.nav.findPath(from, 'deck')).not.toBeNull();
  });

  it('closes platform routes when the doors shut', () => {
    const open = new TrainMap(ECONOMY.player.radius);
    open.rebuild(FULL_TRAIN, true);
    const door = open.doors()[0];
    open.setDoorsOpen(false);
    expect(open.nav.findPath(door.insideNode, door.outsideNode)).toBeNull();
  });

  it('works with a single carriage (the start of the game)', () => {
    const small = new TrainMap(ECONOMY.player.radius);
    small.rebuild(['lobby'], false);
    const reach = reachable(small, small.anchor(0, 'playerSpawn'));
    expect(reach(small.anchor(0, 'deskService'))).toBe(true);
    expect(reach(small.rearDeck().tile)).toBe(true);
  });

  it('slides the conductor into a doorway when they walk into the wall beside it', () => {
    const cabin = getLayout('lobby').cabins[0];
    const doorZ = carriageOriginZ(0) + cabin.door[0];
    // In the corridor, lined up with the very edge of the doorway, walking straight across at the frame.
    const pos = { x: -1.2, z: doorZ + 0.05 };
    const plain = { ...pos };
    for (let i = 0; i < 40; i++) map.walk.move(plain, 0.05, 0);
    expect(plain.x).toBeLessThan(-0.9);
    for (let i = 0; i < 40; i++) map.walk.move(pos, 0.05, 0, ECONOMY.player.doorAssist);
    expect(pos.x).toBeGreaterThan(-0.3);
  });

  it('reaches every room, spot and anchor in every class floor plan', () => {
    // Tiers 0–1 share the Basic plan tested above.
    for (let tier = 2; tier <= 5; tier++) {
      const m = new TrainMap(ECONOMY.player.radius);
      m.rebuild(FULL_TRAIN, false, true, FULL_TRAIN.map(() => tier));
      const reach = reachable(m, m.anchor(0, 'playerSpawn'));
      const from = m.doors()[0].insideNode;
      for (const c of m.carriages) {
        for (const name of Object.keys(c.layout.anchors)) expect(reach(m.anchor(c.index, name)), `tier ${tier}: carriage ${c.index} anchor ${name}`).toBe(true);
        for (const cabin of c.layout.cabins) {
          expect(reach(m.toWorld(c.index, cabin.center)), `tier ${tier}: cabin ${c.index}/${cabin.index}`).toBe(true);
          expect(reach(m.toWorld(c.index, { x: cabin.bed.x0 - 0.24, z: cabin.bedPose.z }), 0.35), `tier ${tier}: bedside ${c.index}/${cabin.index}`).toBe(true);
          expect(reach(m.toWorld(c.index, cabin.tipPile), 0.35), `tier ${tier}: tips ${c.index}/${cabin.index}`).toBe(true);
          expect(m.nav.findPath(from, m.nodeId(c.index, cabin.node)), `tier ${tier}: route to ${c.index}/${cabin.index}`).not.toBeNull();
        }
      }
    }
  }, 30000);

  it('snaps a stranded point back onto walkable floor', () => {
    const p = map.walk.nearestWalkable(5, 1.5);
    expect(map.walk.isWalkable(p.x, p.z)).toBe(true);
  });
});
