import { describe, expect, it } from 'vitest';
import type { CarriageType } from '../src/core/types';
import { footprints, getLayout, layoutKey, PARTITION_X0, PARTITION_X1, ROOM_DOOR, type CarriageLayout } from '../src/world/layout';

/**
 * Session 16 (owner: "the doors are half animated… make them feel like part of the train… accessible"): room
 * doors are two hinged leaves that swing into the room. Through the whole swing a leaf must pass clear of the
 * room's furniture, its tiles and every wall but the partition it hangs in.
 */

const TYPES: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper', 'cafe', 'dining', 'bar', 'dome'];
const { hingeInset: HINGE_INSET, meetGap: LEAF_MEET_GAP, swing: DOOR_SWING } = ROOM_DOOR;
const HALF_THICK = ROOM_DOOR.thickness / 2;

const variants: { name: string; layout: CarriageLayout }[] = [];
for (const type of TYPES) {
  const seen = new Set<string>();
  for (let tier = 0; tier <= 5; tier++) {
    const key = layoutKey(type, tier);
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ name: key, layout: getLayout(type, tier) });
  }
}

interface Box { x0: number; z0: number; x1: number; z1: number }

const inside = (b: Box, x: number, z: number, pad: number): boolean => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

describe('room doors swing clear', () => {
  for (const { name, layout } of variants) {
    // A room's own tile (buy this cabin or washroom) only shows while the room is locked, and a locked door
    // stays shut: the swing never meets it.
    const doors = [
      ...layout.cabins.map((c) => ({ span: c.door, own: `cabin_tile_${c.index}` })),
      ...layout.bathrooms.map((b) => ({ span: b.door, own: `bath_tile_${b.index}` })),
    ];
    if (doors.length === 0) continue;
    it(`${name}: every leaf, through its whole swing, misses furniture, tiles and other walls`, () => {
      const x = (PARTITION_X0 + PARTITION_X1) / 2;
      const props = layout.props.map((p) => ({ label: `prop:${p.kind}`, box: p.rect as Box }));
      const tiles = footprints(layout).filter((f) => f.kind === 'tile').map((f) => ({ label: f.id, box: { x0: f.x - f.r, z0: f.z - f.r, x1: f.x + f.r, z1: f.z + f.r } }));
      const sharedTiles = (own: string): { label: string; box: Box }[] => tiles.filter((t) => t.label !== own);
      // The partition (the wall the doors hang in) is the one wall a leaf may touch at its hinge.
      const walls = layout.walls.filter((w) => !(Math.abs(w.x0 - PARTITION_X0) < 0.02 && Math.abs(w.x1 - PARTITION_X1) < 0.02)).map((w, i) => ({ label: `wall${i}`, box: w as Box }));
      for (const { span, own } of doors) {
        const obstacles = [...props, ...sharedTiles(own), ...walls];
        const width = span[1] - span[0];
        const length = width / 2 - HINGE_INSET - LEAF_MEET_GAP / 2;
        const hinges = [span[0] + HINGE_INSET, span[1] - HINGE_INSET];
        for (let k = 0; k < 2; k++) {
          for (let step = 0; step <= 12; step++) {
            const swing = (DOOR_SWING * step) / 12;
            const yaw = k === 0 ? swing : Math.PI - swing;
            const dx = Math.sin(yaw);
            const dz = Math.cos(yaw);
            for (let s = 0.04; s <= length; s += 0.04) {
              const px = x + dx * s;
              const pz = hinges[k] + dz * s;
              for (const o of obstacles) {
                expect(inside(o.box, px, pz, HALF_THICK), `${name} door at z ${span[0].toFixed(2)}: leaf ${k} at ${(swing * 180 / Math.PI).toFixed(0)}° hits ${o.label}`).toBe(false);
              }
            }
          }
        }
      }
    });
  }
});
