import { describe, expect, it } from 'vitest';
import type { CarriageType } from '../src/core/types';
import { VISUALS } from '../src/config/visuals';
import { COVER_BASE, COVER_INSET, COVER_TOP, footprints, getLayout, layoutKey, type CarriageLayout, type Footprint, type WallBox } from '../src/world/layout';

/**
 * Session 15 (owner: "the upgrade markers are still hidden… something where the player can actually see what
 * the upgrade is"): the camera looks down on the train from one side and one end, so anything on the floor
 * just behind a wall (as the camera sees it) is hidden by that wall. Nothing the player pays for or works on
 * may sit there: every tile and pad must be in full view of the camera, from wherever it looks.
 */

const TYPES: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper', 'cafe', 'dining', 'bar', 'dome', 'cinema'];
const VARIANTS: { type: CarriageType; tier: number; name: string }[] = [];
for (const type of TYPES) {
  const seen = new Set<string>();
  for (let tier = 0; tier <= 5; tier++) {
    const key = layoutKey(type, tier);
    if (seen.has(key)) continue;
    seen.add(key);
    VARIANTS.push({ type, tier, name: key });
  }
}

const yaw = (VISUALS.camera.trainYawDeg * Math.PI) / 180;
const rise = Math.tan((VISUALS.camera.pitchDeg * Math.PI) / 180);
/** Horizontal direction from the floor toward the camera, in carriage coordinates. */
const toCamera = { x: Math.sin(yaw), z: Math.cos(yaw) };

/** True when the line of sight from (x, z) on the floor up to the camera clears every wall (and any extra boxes). */
function seen(layout: CarriageLayout, x: number, z: number, extra: WallBox[] = []): boolean {
  for (const w of extra.length ? [...layout.walls, ...extra] : layout.walls) {
    // Where the sight line passes over the wall's footprint, it is this high: a slab test along the ray.
    let t0 = 0;
    let t1 = w.height / rise;
    for (const [p, d, lo, hi] of [[x, toCamera.x, w.x0, w.x1], [z, toCamera.z, w.z0, w.z1]] as const) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) t1 = -1;
        continue;
      }
      const a = (lo - p) / d;
      const b = (hi - p) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 < t1) return false;
  }
  return true;
}

/** Share of a footprint (tiles square, pads round) the camera can see. */
function visibleShare(layout: CarriageLayout, f: Footprint, extra: WallBox[] = []): number {
  const n = 9;
  let total = 0;
  let visible = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      if (f.kind !== 'tile' && u * u + v * v > 1) continue;
      total++;
      if (seen(layout, f.x + u * f.r, f.z + v * f.r, extra)) visible++;
    }
  }
  return visible / Math.max(1, total);
}

describe('visibility: every tile and pad is in full view of the camera', () => {
  for (const { type, tier, name } of VARIANTS) {
    const layout = getLayout(type, tier);
    it(`${name}: tiles are fully visible`, () => {
      for (const f of footprints(layout)) {
        if (f.kind !== 'tile') continue;
        expect(visibleShare(layout, f), `${name}.${f.id} at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`).toBeGreaterThanOrEqual(0.97);
      }
    });
    it(`${name}: pads are (almost) fully visible`, () => {
      for (const f of footprints(layout)) {
        if (f.kind !== 'zone') continue;
        expect(visibleShare(layout, f), `${name}.${f.id} at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`).toBeGreaterThanOrEqual(0.9);
      }
    });
  }
});

/**
 * Session 22: a locked room wears a lid (CarriageView buildCover), modelled here as two boxes: its edge at the
 * lid's base height and its inset top. With every other room covered, each locked room's door tile and every pad
 * in the open rooms and the corridor must still be in view.
 */
function lids(layout: CarriageLayout, except: number | null, kind: 'cabin' | 'bath'): WallBox[] {
  const out: WallBox[] = [];
  const rooms = kind === 'cabin' ? layout.cabins : layout.bathrooms;
  for (const r of rooms) {
    if (r.index === except) continue;
    const x0 = r.room.x0 - 0.07;
    const x1 = r.room.x1;
    const z0 = r.room.z0 - 0.06;
    const z1 = r.room.z1 + 0.06;
    out.push({ x0, z0, x1, z1, height: COVER_BASE, kind: 'interior' } as WallBox);
    out.push({ x0: x0 + COVER_INSET, z0: z0 + COVER_INSET, x1: x1 - COVER_INSET, z1: z1 - COVER_INSET, height: COVER_TOP, kind: 'interior' } as WallBox);
  }
  return out;
}

describe('visibility: covered rooms never hide a tile or a pad', () => {
  for (const { type, tier, name } of VARIANTS) {
    const layout = getLayout(type, tier);
    if (layout.cabins.length === 0 && layout.bathrooms.length === 0) continue;
    it(`${name}: door tiles and pads in view with the other rooms covered`, () => {
      for (const kind of ['cabin', 'bath'] as const) {
        const rooms = kind === 'cabin' ? layout.cabins : layout.bathrooms;
        for (const open of [null, ...rooms.map((r) => r.index)]) {
          const extra = lids(layout, open, kind);
          if (extra.length === 0) continue;
          for (const f of footprints(layout)) {
            const inCovered = rooms.some((r) => r.index !== open && f.x >= r.room.x0 && f.x <= r.room.x1 && f.z >= r.room.z0 && f.z <= r.room.z1);
            if (inCovered) continue;
            const need = f.kind === 'tile' ? 0.97 : 0.9;
            if (f.kind !== 'tile' && f.kind !== 'zone') continue;
            expect(visibleShare(layout, f, extra), `${name}.${f.id} with ${kind}s covered except ${open}`).toBeGreaterThanOrEqual(need);
          }
        }
      }
    });
  }
});
