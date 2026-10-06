import { describe, expect, it } from 'vitest';
import type { CarriageType } from '../src/core/types';
import { VISUALS } from '../src/config/visuals';
import { footprints, getLayout, layoutKey, type CarriageLayout, type Footprint } from '../src/world/layout';

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

/** True when the line of sight from (x, z) on the floor up to the camera clears every wall. */
function seen(layout: CarriageLayout, x: number, z: number): boolean {
  for (const w of layout.walls) {
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
function visibleShare(layout: CarriageLayout, f: Footprint): number {
  const n = 9;
  let total = 0;
  let visible = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = ((i + 0.5) / n) * 2 - 1;
      const v = ((j + 0.5) / n) * 2 - 1;
      if (f.kind !== 'tile' && u * u + v * v > 1) continue;
      total++;
      if (seen(layout, f.x + u * f.r, f.z + v * f.r)) visible++;
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
