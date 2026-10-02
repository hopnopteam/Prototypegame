import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAIN } from '../src/config/content';
import { ECONOMY } from '../src/config/economy';
import { VISUALS } from '../src/config/visuals';
import type { Vec2 } from '../src/core/types';
import { TrainMap } from '../src/sim/TrainMap';
import { PARTITION_X0 } from '../src/world/layout';

/**
 * Session 15 (owner: "entering rooms is still a problem, make them easily enterable"): a thumb aimed at a
 * room from anywhere in the corridor beside it gets the conductor in, quickly, every time. The walk uses the
 * player's own movement rules (acceleration, the stick's axis snap, wall gliding and the doorway funnel).
 */
const p = ECONOMY.player;
const snap = (VISUALS.camera.axisSnapDeg * Math.PI) / 180;
const DT = 1 / 60;

/** Seconds to come within reach of `target` pushing straight at it (Infinity if it never gets there). */
function walkTo(map: TrainMap, start: Vec2, target: Vec2, limit = 3): number {
  const pos = { ...start };
  let vx = 0;
  let vz = 0;
  for (let t = 0; t < limit; t += DT) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.35) return t;
    // The stick snaps onto the train's axes only when within a few degrees of them, as the camera rig does.
    const a = Math.atan2(dx, dz);
    const off = a - Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    const k = Math.abs(off) < snap ? 1 : Math.abs(off) < snap * 2 ? 2 - Math.abs(off) / snap : 0;
    const dir = a - off * k;
    const acc = p.acceleration * DT;
    vx += Math.max(-acc, Math.min(acc, Math.sin(dir) * p.moveSpeed - vx));
    vz += Math.max(-acc, Math.min(acc, Math.cos(dir) * p.moveSpeed - vz));
    map.walk.move(pos, vx * DT, vz * DT, p.doorAssist, p.wallGlide);
  }
  return Infinity;
}

describe('rooms are easy to enter', () => {
  for (const tier of [0, 2, 3, 4, 5]) {
    it(`class tier ${tier}: from anywhere in the corridor beside a room, a push at it gets in within a second`, () => {
      const map = new TrainMap(p.radius);
      const types = [...DEFAULT_TRAIN];
      map.rebuild(types, false, false, types.map((t) => (t === 'lobby' || t === 'sleeper' ? tier : 0)));
      const corridorX = (-2.54 + PARTITION_X0) / 2;
      for (const c of map.carriages) {
        const rooms = [
          ...c.layout.cabins.map((r) => ({ room: r.room, spot: r.center, name: `cabin ${r.index}` })),
          ...c.layout.bathrooms.map((b) => ({ room: b.room, spot: b.restock, name: `washroom ${b.index}` })),
        ];
        for (const r of rooms) {
          const origin = map.toWorld(c.index, { x: 0, z: 0 });
          const mid = origin.z + (r.room.z0 + r.room.z1) / 2;
          const target = map.toWorld(c.index, r.spot);
          for (const dz of [-1.0, -0.5, 0, 0.5, 1.0]) {
            const start = { x: corridorX, z: mid + dz };
            if (!map.walk.isWalkable(start.x, start.z)) continue;
            const seconds = walkTo(map, start, target);
            expect(seconds, `${c.layout.type} ${r.name}, starting ${dz} m along the corridor`).toBeLessThan(1.0);
          }
        }
      }
    });
  }
});
