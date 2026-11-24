import * as THREE from 'three';
import type { Rect } from '../core/types';
import type { GeoBuilder } from './geo';
import type { CarriageLayout } from './layout';

/**
 * The Riviera revamp's sand floors (owner, 24 Nov: "proper sand floors… very real… stylised realism with depth and
 * actual weight"). A sculpted surface laid over a carriage's boards: a fine grid whose height follows gentle
 * undulations and drifts banked up against every wall, tinted damper in the hollows and paler on the crests, carrying
 * the wind-ripple layer baked in Blender (art/blender/sand_texture.py). Everything on the floor stands a centimetre or
 * two into it, so feet and furniture legs settle in rather than float.
 *
 * Visual only: walking, collision and every gameplay spot stay on the floor plan.
 */
export const SAND = {
  /** Grid spacing (m). */
  cell: 0.09,
  /** Lowest sand over the boards (clear of their faces) and the average layer in the open. */
  base: 0.02,
  open: 0.028,
  /** How much the open floor undulates (±m), and its wavelength (m). */
  swell: 0.009,
  swellLength: 1.7,
  /** Drifts against walls: how high and how far out from the wall they reach. */
  drift: 0.07,
  driftReach: 0.42,
  colour: '#E2CB9C',
  damp: '#C9AE7E',
  crest: '#F1E0B8',
};

/** Distance from (x, z) to a rect (0 inside). */
function distTo(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/** The sand's height over FLOOR_Y at a point of the carriage (local coordinates), given its walls. */
export function sandHeight(walls: readonly Rect[], x: number, z: number, seed: number): number {
  const k = (Math.PI * 2) / SAND.swellLength;
  const swell = Math.sin(x * k * 0.8 + seed) * Math.cos(z * k * 0.55 + seed * 1.7) + 0.5 * Math.sin((x + z) * k * 1.3 + seed * 0.3);
  let near = Infinity;
  for (const w of walls) near = Math.min(near, distTo(w, x, z));
  const t = Math.max(0, 1 - near / SAND.driftReach);
  // A soft rounded bank: steep at the wall, easing out across the floor, a little uneven along it.
  const bank = SAND.drift * t * t * (0.8 + 0.2 * Math.sin(z * 2.3 + x * 1.1 + seed));
  return Math.max(SAND.base, SAND.open + SAND.swell * swell * 0.67 + bank);
}

/**
 * Lays the sand over `area` (local coordinates), leaving out `holes` (a back room, anything walled off). `top` is the
 * boards' top (FLOOR_Y). Returns nothing; the sand is part of the floor's mesh.
 */
export function buildSand(f: GeoBuilder, layout: CarriageLayout, area: Rect, holes: readonly Rect[], top: number, seed: number): void {
  const walls = layout.walls.map((w) => ({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1 }));
  const w = area.x1 - area.x0;
  const d = area.z1 - area.z0;
  const nx = Math.max(2, Math.round(w / SAND.cell));
  const nz = Math.max(2, Math.round(d / SAND.cell));
  const positions: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = area.x0 + (w * i) / nx;
      const z = area.z0 + (d * j) / nz;
      positions.push(x, top + sandHeight(walls, x, z, seed), z);
    }
  }
  const inHole = (x: number, z: number): boolean => holes.some((h) => x > h.x0 - 0.02 && x < h.x1 + 0.02 && z > h.z0 - 0.02 && z < h.z1 + 0.02);
  const index: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const e = c + 1;
      const cx = area.x0 + (w * (i + 0.5)) / nx;
      const cz = area.z0 + (d * (j + 0.5)) / nz;
      if (inHole(cx, cz)) continue;
      index.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  f.add(g, SAND.colour, 0, 0, 0, 0, 0, 0, { shade: 1, detail: 'sand', surface: { roughness: 0.92, metalness: 0, sheen: 0.25 } });
  // Damp sand in the hollows, pale dry sand on the crests and the drifts' tops: tone by height over the open layer.
  f.blendLast(SAND.damp, (_x, y) => Math.max(0, Math.min(1, (top + SAND.open - y) / 0.012)) * 0.7);
  f.blendLast(SAND.crest, (_x, y) => Math.max(0, Math.min(1, (y - top - SAND.open - 0.006) / 0.04)) * 0.8);
}
