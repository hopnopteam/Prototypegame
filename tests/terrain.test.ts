import { describe, expect, it } from 'vitest';
import { BOAT_LANE, buildChunk, CHUNK, LAND_DECK, SHORE_DECK, type FillKind } from '../src/world/Lakeside';
import { groundHeight, SHORE_MID, SHORE_NEAREST, shoreX, TRACK_HALF, WORLD_PERIOD } from '../src/world/terrain';

/** Rough heights of the fill shapes at scale 1 (metres). */
const FILL_HEIGHT: Record<FillKind, number> = { pine: 3.4, spruce: 3.95, broadleaf: 2.8, bush: 0.6, reed: 1.0, rock: 0.35, lily: 0.05, flower: 0.27, sheep: 0.8 };
/** Land side: anything nearer the line than this many metres per metre of height would hide the train. */
const HIDE_SLOPE = 0.45;

describe('the lakeside ground', () => {
  it('has a shoreline that wanders but stays clear of the track, and never jumps', () => {
    let previous = shoreX(0);
    for (let s = 0; s < WORLD_PERIOD; s += 0.25) {
      const x = shoreX(s);
      expect(x).toBeLessThanOrEqual(SHORE_NEAREST);
      expect(x).toBeGreaterThan(SHORE_MID - 2);
      expect(Math.abs(x - previous)).toBeLessThan(0.08);
      previous = x;
    }
  });

  it('repeats exactly every world period (so the GPU can wrap the distance travelled)', () => {
    for (const s of [0, 13.7, 401.2, 1999.5]) expect(shoreX(s + WORLD_PERIOD)).toBeCloseTo(shoreX(s), 6);
  });

  it('is continuous across stretch boundaries and below water past the shoreline', () => {
    for (const s of [-480, -24, 0, 24, 312]) {
      for (const x of [-12, -8, -5, -3, 3, 6, 12]) expect(groundHeight(x, s)).toBeCloseTo(groundHeight(x, s + 1e-6), 4);
      expect(groundHeight(shoreX(s) - 1, s)).toBeLessThan(0);
      expect(groundHeight(shoreX(s) + 0.6, s)).toBeGreaterThan(-0.05);
    }
  });
});

describe('the lakeside pieces', () => {
  const builds = SHORE_DECK.flatMap((shore, i) => LAND_DECK.map((land, j) => buildChunk(-CHUNK * (i * 9 + j + 3), shore.kind, land.kind, 101 + i * 31 + j)));

  it('keep everything out of the track bed', () => {
    for (const b of builds) {
      for (const f of b.fill) expect(Math.abs(f.x), `${b.shore}/${b.land} ${f.kind}`).toBeGreaterThanOrEqual(TRACK_HALF);
      for (const g of [b.lake, b.landProps]) {
        if (g.isEmpty) continue;
        const geometry = g.build();
        const box = geometry.boundingBox;
        if (!box) continue;
        // A side's props stay on its side of the line.
        expect(box.max.x < -TRACK_HALF || box.min.x > TRACK_HALF, `${b.shore}/${b.land} x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} ${JSON.stringify(geometry.userData.objects?.map((o: { label: string }) => o.label))}`).toBe(true);
      }
    }
  });

  it('never put anything tall enough to hide the train between the camera and the train', () => {
    for (const b of builds) {
      for (const f of b.fill) {
        if (f.x <= 0) continue;
        const height = FILL_HEIGHT[f.kind] * f.scale;
        expect(height, `${b.land} ${f.kind} at x ${f.x.toFixed(2)}`).toBeLessThan((f.x - 2.9) / HIDE_SLOPE);
      }
    }
  });

  it('leave the boats a clear lane on the lake', () => {
    for (const b of builds) {
      for (const f of b.fill) {
        if (f.x > 0) continue;
        const inLane = f.x < BOAT_LANE[0] && f.x > BOAT_LANE[1];
        expect(inLane, `${b.shore} ${f.kind} at x ${f.x.toFixed(2)}`).toBe(false);
      }
      if (!b.lake.isEmpty) {
        const box = b.lake.build().boundingBox;
        if (box && b.shore !== 'island') expect(box.min.x, b.shore).toBeGreaterThan(BOAT_LANE[0]);
      }
    }
  });
});
