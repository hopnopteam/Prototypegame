import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { GeoBuilder, type PartStyle } from './geo';
import { PATTERN } from './materials';

/**
 * The lakeside line, piece by piece. Every piece is CHUNK metres of scenery in chunk-local coordinates
 * (x across, the lake at -x; z along the line, 0 to CHUNK) built once as a template and reused as the
 * scenery scrolls. Trees are listed, not built: they are drawn instanced by Scenery.
 */
export const CHUNK = 24;

/** Where the ballast ends on either side of the line. */
const TRACK_EDGE = 1.98;
/** The far edge of the real water (past it, the painted distance shows): see Water's mist. */
export const WATER_EDGE_X = -8.6;

export type PieceKind = 'shore' | 'cove' | 'point' | 'pier' | 'lighthouse' | 'bridge' | 'village' | 'meadow' | 'forest' | 'tunnel';

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  rot: number;
  /** 0 pine, 1 spruce, 2 birch-like broadleaf (lighter, by clearings). */
  kind: 0 | 1 | 2;
  land: boolean;
}

export interface PieceBuild {
  kind: PieceKind;
  /** Land slab and the lake bank (always shown). */
  base: GeoBuilder;
  /** Lake-side things (rocks, reeds, pier, lighthouse). */
  lake: GeoBuilder;
  /** Land-side things (houses, fences); hidden under the station platform. */
  land: GeoBuilder;
  /** Self-lit parts (windows, lanterns), split by side like the rest. */
  lakeGlow: GeoBuilder;
  landGlow: GeoBuilder;
  trees: TreeSpot[];
  /** A lighthouse lamp to sweep (chunk-local), if any. */
  beacon: THREE.Vector3 | null;
  /** A cutting: the moonlight dims while the train runs through it. */
  dark: boolean;
}

export interface PieceDef {
  kind: PieceKind;
  weight: number;
  /** At least this many pieces between two of this kind. */
  gap: number;
  variants: number;
}

export const PIECES: PieceDef[] = [
  { kind: 'shore', weight: 3, gap: 1, variants: 3 },
  { kind: 'forest', weight: 2.2, gap: 1, variants: 3 },
  { kind: 'cove', weight: 1.8, gap: 2, variants: 2 },
  { kind: 'point', weight: 1.4, gap: 3, variants: 2 },
  { kind: 'meadow', weight: 1.1, gap: 4, variants: 2 },
  { kind: 'pier', weight: 0.9, gap: 7, variants: 2 },
  { kind: 'village', weight: 0.8, gap: 9, variants: 2 },
  { kind: 'bridge', weight: 0.7, gap: 12, variants: 2 },
  { kind: 'lighthouse', weight: 0.45, gap: 22, variants: 1 },
  { kind: 'tunnel', weight: 0.35, gap: 26, variants: 1 },
];

/** The night palette of the countryside by the lake (lit by moonlight, so a little brighter than it reads). */
const C = {
  grass: '#4E6E52',
  grass2: '#587A5B',
  bank: '#5C7A55',
  bank2: '#66855E',
  pebbles: '#A39680',
  pebbles2: '#8F8470',
  gravel: '#8C877D',
  gravel2: '#7C776E',
  rock: '#8C95A3',
  rockDark: '#6D7684',
  reed: '#7A8A55',
  reedTop: '#9A7E52',
  wood: '#7C604A',
  woodDark: '#584434',
  stone: '#9D988E',
  stoneDark: '#827D74',
  white: '#ECEEF0',
  red: '#B94A58',
  slate: '#56657A',
  roofRed: '#7C5A50',
  wall: '#D6CAB2',
  wall2: '#CBBFA6',
  glow: '#FFD08A',
  boat: '#9E5B46',
  hay: '#B89A5E',
  cliff: '#6C7482',
  cliff2: '#5E6674',
};

const FLAT: PartStyle = { shade: 1 };

/** A faceted rock (flat-shaded icosahedron, squashed). */
function rock(b: GeoBuilder, x: number, y: number, z: number, r: number, rng: Rng, color = C.rock): void {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, rng.range(0.45, 0.8), rng.range(0.8, 1.2));
  g.computeVertexNormals();
  b.add(g, rng.chance(0.4) ? C.rockDark : color, x, y, z, 0, rng.range(0, Math.PI * 2), 0, { shade: 0.75, surface: 'stone' });
}

/** A clump of reeds with brown heads. */
function reeds(b: GeoBuilder, x: number, z: number, rng: Rng): void {
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.5, 0.9);
    const dx = rng.range(-0.25, 0.25);
    const dz = rng.range(-0.25, 0.25);
    b.add(new THREE.CylinderGeometry(0.012, 0.02, h, 4), C.reed, x + dx, h / 2, z + dz, rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15), { shade: 0.7, surface: 'foliage' });
    if (rng.chance(0.6)) b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), C.reedTop, x + dx, h + 0.02, z + dz, 0, 0, 0, FLAT);
  }
}

/** The lake bank from the ballast to the shoreline, extruded from its outline (x from the track to `shore(z)`). */
function bank(b: GeoBuilder, shore: (z: number) => number, z0 = 0, z1 = CHUNK): void {
  const outline = (inset: number, top: number, color: string, color2: string, pattern: number, scale: number): void => {
    const shape = new THREE.Shape();
    shape.moveTo(-TRACK_EDGE + 0.02, -z0);
    shape.lineTo(-TRACK_EDGE + 0.02, -z1);
    for (let z = z1; z >= z0 - 1e-6; z -= 0.8) shape.lineTo(Math.min(-TRACK_EDGE - 0.3, shore(z) + inset), -z);
    shape.closePath();
    const depth = top + 0.4;
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.4, 0);
    b.add(g, color, 0, 0, 0, 0, 0, 0, { pattern, color2, scale, shade: 1, surface: 'stone' });
  };
  // A pebble lip at the waterline, then the grass bank on top of it.
  outline(0, 0.05, C.pebbles, C.pebbles2, PATTERN.dots, 0.18);
  outline(0.55, 0.16, C.bank, C.bank2, PATTERN.dots, 0.5);
  // The gravel verge beside the ballast.
  b.box(-TRACK_EDGE - 0.28, 0.08, (z0 + z1) / 2, 0.56, 0.2, z1 - z0, C.gravel, 0, { pattern: PATTERN.dots, color2: C.gravel2, scale: 0.12, shade: 1, surface: 'stone' });
}

/** Rocks and reeds along a stretch of shoreline. */
function waterline(b: GeoBuilder, shore: (z: number) => number, rng: Rng, z0 = 0.5, z1 = CHUNK - 0.5, every = 1.6): void {
  for (let z = z0; z < z1; z += every * rng.range(0.6, 1.4)) {
    const x = shore(z) + rng.range(-0.25, 0.2);
    if (x > -TRACK_EDGE - 0.6) continue;
    if (rng.chance(0.55)) rock(b, x, 0.04, z, rng.range(0.18, 0.42), rng);
    else reeds(b, x + 0.3, z, rng);
  }
}

/** The land beside the line: ground slab and verge, with an optional gap for an inlet. */
function land(b: GeoBuilder, gap: [number, number] | null = null): void {
  const slab = (z0: number, z1: number): void => {
    if (z1 - z0 <= 0.01) return;
    b.box(16, -0.2, (z0 + z1) / 2, 28, 0.44, z1 - z0, C.grass, 0, { pattern: PATTERN.dots, color2: C.grass2, scale: 0.7, shade: 1, surface: 'foliage' });
    b.box(TRACK_EDGE + 0.4, 0.07, (z0 + z1) / 2, 0.8, 0.18, z1 - z0, C.gravel, 0, { pattern: PATTERN.dots, color2: C.gravel2, scale: 0.12, shade: 1, surface: 'stone' });
  };
  if (!gap) slab(0, CHUNK);
  else {
    slab(0, gap[0]);
    slab(gap[1], CHUNK);
  }
}

/** Trees scattered in a band, keeping clear of listed spots. */
function forest(trees: TreeSpot[], rng: Rng, opts: { x0: number; x1: number; z0?: number; z1?: number; density: number; land: boolean; clear?: { x: number; z: number; r: number }[]; broadleaf?: number }): void {
  const z0 = opts.z0 ?? 0.4;
  const z1 = opts.z1 ?? CHUNK - 0.4;
  const area = (opts.x1 - opts.x0) * (z1 - z0);
  const n = Math.round(area * opts.density);
  for (let i = 0; i < n; i++) {
    const x = rng.range(opts.x0, opts.x1);
    const z = rng.range(z0, z1);
    if (opts.clear?.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < c.r * c.r)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 1.1)) continue;
    // Trees right beside the line stay small, so they never hide the train from the camera.
    const near = Math.abs(x) < 6 ? 0.75 : 1;
    const kind: 0 | 1 | 2 = rng.chance(opts.broadleaf ?? 0) ? 2 : rng.chance(0.35) ? 1 : 0;
    trees.push({ x, z, scale: rng.range(0.75, 1.25) * near, rot: rng.range(0, Math.PI * 2), kind, land: opts.land });
  }
}

/** A cottage with a pitched roof, a chimney and lit windows on the sides the camera sees (+x and +z). */
function cottage(b: GeoBuilder, glow: GeoBuilder, x: number, z: number, w: number, d: number, rng: Rng): void {
  const h = rng.range(1.7, 2.1);
  const wall = rng.chance(0.5) ? C.wall : C.wall2;
  const roof = rng.chance(0.5) ? C.slate : C.roofRed;
  b.object('scenery:cottage');
  b.box(x, h / 2, z, w, h, d, wall, 0, { shade: 0.8 });
  b.prism(x, h, z, w + 0.4, 1.3, d + 0.35, roof, { pattern: PATTERN.stripesZ, color2: '#46525F', scale: 0.25, shade: 1 });
  b.box(x + w * 0.25, h + 1.05, z - d * 0.2, 0.34, 0.9, 0.34, C.stoneDark, 0, { shade: 0.85 });
  b.box(x + w / 2 + 0.01, 0.55, z + d * 0.28, 0.04, 1.05, 0.6, C.woodDark, 0, FLAT);
  b.endObject();
  // Windows glow warm: two on the long side, one on the end.
  for (const dz of [-d * 0.22, d * 0.12]) glow.box(x + w / 2 + 0.015, h * 0.55, z + dz, 0.03, 0.45, 0.42, C.glow, 0, FLAT);
  glow.box(x - w * 0.15, h * 0.55, z + d / 2 + 0.015, 0.42, 0.45, 0.03, C.glow, 0, FLAT);
}

/** An old lamp post with a lantern head. */
function lampPost(b: GeoBuilder, glow: GeoBuilder, x: number, z: number): void {
  b.object('scenery:lamp');
  b.cylinder(x, 1.1, z, 0.05, 0.07, 2.2, '#2E3440', 8, 'y', { shade: 0.8, surface: 'iron' });
  b.box(x, 2.28, z, 0.24, 0.05, 0.24, '#2E3440', 0, { surface: 'iron' });
  b.endObject();
  glow.box(x, 2.12, z, 0.16, 0.24, 0.16, C.glow, 0, FLAT);
}

/** A rowing boat, pulled up or moored. */
function boat(b: GeoBuilder, x: number, y: number, z: number, ry: number): void {
  b.object('scenery:boat');
  b.add(new THREE.CylinderGeometry(0.42, 0.34, 1.9, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1), C.boat, x, y + 0.22, z, 0, ry, 0, { shade: 0.8, surface: 'wood' });
  b.box(x, y + 0.2, z, 0.72, 0.05, 0.18, C.wood, ry, FLAT);
  b.endObject();
}

/** A wavy shoreline: `base` metres from the line with gentle bays. */
function shoreline(base: number, amp: number, rng: Rng): (z: number) => number {
  const p1 = rng.range(0, 6.28);
  const p2 = rng.range(0, 6.28);
  const k1 = (Math.PI * 2 * rng.int(1, 2)) / CHUNK;
  const k2 = (Math.PI * 2 * rng.int(2, 4)) / CHUNK;
  // Every piece meets its neighbours at the same distance (its ends are pinned to `base`).
  return (z) => {
    const pin = Math.sin((Math.PI * z) / CHUNK);
    return -(base + pin * (amp * Math.sin(k1 * z + p1) + amp * 0.4 * Math.sin(k2 * z + p2)));
  };
}

const SHORE_BASE = 3.5;

/** Builds one variant of a piece. `seed` picks the variant. */
export function buildPiece(kind: PieceKind, seed: number): PieceBuild {
  const rng = new Rng(seed * 7919 + kind.length * 104729);
  const out: PieceBuild = { kind, base: new GeoBuilder(), lake: new GeoBuilder(), land: new GeoBuilder(), lakeGlow: new GeoBuilder(), landGlow: new GeoBuilder(), trees: [], beacon: null, dark: false };
  const { base, lake, trees } = out;
  let shore = shoreline(SHORE_BASE, 0.6, rng);
  let landGap: [number, number] | null = null;
  const landClear: { x: number; z: number; r: number }[] = [];
  let landDensity = 0.16;
  let broadleaf = 0.08;

  switch (kind) {
    case 'shore': {
      if (rng.chance(0.5)) {
        // A bench and a lamp on the bank: somewhere to watch the trains go by.
        const z = rng.range(6, 18);
        lake.object('scenery:bench');
        lake.box(-2.95, 0.42, z, 0.4, 0.06, 1.2, C.wood, 0, FLAT);
        lake.box(-3.12, 0.62, z, 0.06, 0.34, 1.2, C.wood, 0, FLAT);
        for (const dz of [-0.5, 0.5]) lake.box(-2.95, 0.3, z + dz, 0.36, 0.3, 0.06, C.woodDark, 0, FLAT);
        lake.endObject();
        lampPost(lake, out.lakeGlow, -2.75, z + 1.3);
      }
      break;
    }
    case 'cove': {
      shore = shoreline(2.7, 0.35, rng);
      boat(lake, -3.3, 0.02, rng.range(7, 16), rng.range(-0.4, 0.4));
      break;
    }
    case 'point': {
      const mid = rng.range(9, 15);
      const reach = rng.range(6.2, 7.4);
      const wobble = shoreline(0, 0.3, rng);
      shore = (z) => -(SHORE_BASE + (reach - SHORE_BASE) * Math.exp(-(((z - mid) / 4.2) ** 2))) + wobble(z) * 0.5;
      forest(trees, rng, { x0: -reach + 0.8, x1: -3.2, z0: mid - 4, z1: mid + 4, density: 0.35, land: false });
      break;
    }
    case 'lighthouse': {
      const mid = 12;
      const reach = 7.2;
      shore = (z) => -(SHORE_BASE + (reach - SHORE_BASE) * Math.exp(-(((z - mid) / 4.6) ** 2)));
      const lx = -reach + 1.3;
      lake.object('scenery:lighthouse');
      rock(lake, lx, 0.1, mid, 1.1, rng, C.rockDark);
      lake.cylinder(lx, 0.55, mid, 0.95, 1.05, 0.5, C.stone, 12, 'y', { shade: 0.85, surface: 'stone' });
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const y0 = 0.8 + i * 1.0;
        lake.cylinder(lx, y0 + 0.5, mid, 0.62 - (i + 1) * 0.05, 0.62 - i * 0.05, 1.0, i % 2 === 0 ? C.white : C.red, 14, 'y', { shade: 0.9, surface: 'paint' });
      }
      lake.cylinder(lx, 5.88, mid, 0.55, 0.55, 0.08, '#2F3440', 14, 'y', { surface: 'iron' });
      lake.cone(lx, 6.75, mid, 0.42, 0.45, C.red, 12, { shade: 1, surface: 'paint' });
      lake.endObject();
      out.lakeGlow.cylinder(lx, 6.2, mid, 0.3, 0.3, 0.55, C.glow, 12, 'y', FLAT);
      out.beacon = new THREE.Vector3(lx, 6.2, mid);
      break;
    }
    case 'pier': {
      const z = rng.range(8, 15);
      lake.object('scenery:pier');
      lake.box(-5.4, 0.36, z, 5.6, 0.07, 1.2, C.wood, 0, { pattern: PATTERN.stripesX, color2: C.woodDark, scale: 0.18, shade: 1, surface: 'wood' });
      for (let x = -3.2; x >= -8.1; x -= 1.2) for (const dz of [-0.52, 0.52]) lake.cylinder(x, 0.1, z + dz, 0.07, 0.07, 0.62, C.woodDark, 6, 'y', { surface: 'wood' });
      lake.endObject();
      lampPost(lake, out.lakeGlow, -7.9, z - 0.45);
      boat(lake, -6.6, -0.12, z + 1.25, Math.PI / 2 + 0.2);
      break;
    }
    case 'bridge': {
      // An inlet runs under the line: water on both sides, stone parapets along the track.
      const g0 = rng.range(5, 7);
      const g1 = rng.range(17, 19);
      landGap = [g0, g1];
      const lakeShore = shoreline(SHORE_BASE, 0.4, rng);
      shore = (z) => (z > g0 - 1 && z < g1 + 1 ? -TRACK_EDGE - 0.2 : lakeShore(z));
      base.object('scenery:bridge');
      for (const side of [-1, 1]) {
        base.box(side * 2.06, 0.3, (g0 + g1) / 2, 0.22, 0.62, g1 - g0 + 2.2, C.stone, 0, { pattern: PATTERN.stripesZ, color2: C.stoneDark, scale: 0.5, shade: 0.8, surface: 'stone' });
        base.box(side * 2.06, 0.64, (g0 + g1) / 2, 0.3, 0.06, g1 - g0 + 2.4, C.stoneDark, 0, { surface: 'stone' });
      }
      // The causeway's face on the land side, with arches (the side the camera sees).
      base.box(2.0, -0.3, (g0 + g1) / 2, 0.14, 1.0, g1 - g0, C.stoneDark, 0, { surface: 'stone' });
      base.endObject();
      for (const z of [g0 - 0.2, g1 + 0.2]) for (let i = 0; i < 3; i++) rock(lake, rng.range(2.6, 4.2), 0.05, z + rng.range(-0.6, 0.6), rng.range(0.25, 0.5), rng);
      landClear.push({ x: 8, z: (g0 + g1) / 2, r: 9 });
      break;
    }
    case 'village': {
      const houses = rng.int(3, 5);
      for (let i = 0; i < houses; i++) {
        const z = 3 + (i + rng.range(0.1, 0.6)) * ((CHUNK - 6) / houses);
        const x = rng.range(7, 13) + (i % 2) * 2.5;
        cottage(out.land, out.landGlow, x, z, rng.range(2.4, 3.0), rng.range(3.0, 3.8), rng);
        landClear.push({ x, z, r: 3.2 });
      }
      for (const z of [4, 12, 20]) lampPost(out.land, out.landGlow, 3.6, z + rng.range(-1, 1));
      landClear.push({ x: 4, z: 12, r: 2.5 });
      landDensity = 0.06;
      broadleaf = 0.35;
      break;
    }
    case 'meadow': {
      const cx = rng.range(9, 12);
      const cz = rng.range(8, 16);
      landClear.push({ x: cx, z: cz, r: 7 });
      cottage(out.land, out.landGlow, cx + 2.5, cz - 1.5, 2.2, 2.8, rng);
      out.land.object('scenery:fence');
      for (let z = cz - 5; z < cz + 5; z += 1.1) out.land.box(cx - 3, 0.38, z, 0.08, 0.76, 0.08, C.wood, 0, { shade: 0.85, surface: 'wood' });
      for (const y of [0.3, 0.6]) out.land.box(cx - 3, y, cz, 0.05, 0.06, 10, C.wood, 0, { surface: 'wood' });
      out.land.endObject();
      for (let i = 0; i < 4; i++) {
        out.land.object('scenery:hay');
        out.land.cylinder(cx + rng.range(-2, 2), 0.5, cz + rng.range(-4, 4), 0.55, 0.55, 1.0, C.hay, 14, 'x', { shade: 0.8, surface: 'fabric' });
        out.land.endObject();
      }
      broadleaf = 0.3;
      break;
    }
    case 'forest': {
      landDensity = 0.24;
      forest(trees, rng, { x0: -SHORE_BASE + 0.4, x1: -2.6, density: 0.12, land: false });
      break;
    }
    case 'tunnel': {
      // A rock cutting: cliffs rising from the line on both sides, stone portals at each end. The cliffs
      // step up away from the track so they never hide the train from the camera.
      out.dark = true;
      shore = () => -2.3;
      landGap = [0, CHUNK];
      for (let i = 0; i < 18; i++) {
        const z = (i / 17) * CHUNK;
        const x = rng.range(3.4, 5.5);
        const r = rng.range(1.6, 2.6);
        rock(out.land, x + r * 0.6, r * 0.3, z, r, rng, C.cliff);
        rock(out.land, x + 4 + rng.range(0, 3), r * 0.6, z + rng.range(-1, 1), r * 1.6, rng, C.cliff2);
        rock(lake, -rng.range(3.2, 4.4), r * 0.4, z, r * 1.3, rng, C.cliff);
      }
      base.box(16, -0.2, CHUNK / 2, 28, 0.44, CHUNK, C.cliff2, 0, { pattern: PATTERN.dots, color2: C.cliff, scale: 0.6, shade: 1, surface: 'stone' });
      base.box(TRACK_EDGE + 0.4, 0.07, CHUNK / 2, 0.8, 0.18, CHUNK, C.gravel, 0, { pattern: PATTERN.dots, color2: C.gravel2, scale: 0.12, shade: 1, surface: 'stone' });
      out.land.object('scenery:portal');
      for (const z of [0.4, CHUNK - 0.4]) {
        out.land.box(2.75, 1.3, z, 0.7, 2.6, 0.8, C.stone, 0, { pattern: PATTERN.stripesZ, color2: C.stoneDark, scale: 0.4, shade: 0.8, surface: 'stone' });
        out.land.box(3.6, 2.4, z, 2.4, 0.5, 0.9, C.stoneDark, 0, { surface: 'stone' });
      }
      out.land.endObject();
      lake.object('scenery:portal');
      for (const z of [0.4, CHUNK - 0.4]) {
        lake.box(-2.75, 1.6, z, 0.7, 3.2, 0.8, C.stone, 0, { pattern: PATTERN.stripesZ, color2: C.stoneDark, scale: 0.4, shade: 0.8, surface: 'stone' });
        lake.box(-3.7, 3.0, z, 2.2, 0.6, 0.9, C.stoneDark, 0, { surface: 'stone' });
      }
      lake.endObject();
      break;
    }
  }

  if (kind !== 'tunnel') {
    bank(base, shore);
    land(base, landGap);
    if (kind !== 'bridge') waterline(lake, shore, rng);
    else waterline(lake, shore, rng, 0.5, landGap ? landGap[0] - 1 : CHUNK, 1.4);
    // A tree or two on the bank, clear of the line.
    if (kind === 'shore' || kind === 'cove') forest(trees, rng, { x0: Math.max(-SHORE_BASE + 0.5, -3.3), x1: -2.7, density: 0.06, land: false });
    if (landGap) {
      forest(trees, rng, { x0: 4.2, x1: 22, z0: 0.4, z1: landGap[0] - 0.8, density: landDensity, land: true, clear: landClear, broadleaf });
      forest(trees, rng, { x0: 4.2, x1: 22, z0: landGap[1] + 0.8, z1: CHUNK - 0.4, density: landDensity, land: true, clear: landClear, broadleaf });
    } else {
      forest(trees, rng, { x0: 4.2, x1: 22, density: landDensity, land: true, clear: landClear, broadleaf });
    }
  }
  return out;
}

/** The instanced tree shapes: a layered pine, a slim spruce and a round broadleaf for clearings. */
export function treeGeometries(): THREE.BufferGeometry[] {
  const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    return n;
  };
  const pine = new GeoBuilder();
  pine.cylinder(0, 0.4, 0, 0.1, 0.14, 0.8, '#5B4535', 6, 'y', { surface: 'wood' });
  const tiers: [number, number, number, string][] = [[1.25, 1.6, 1.05, '#2C473C'], [2.05, 1.35, 0.85, '#33524A'], [2.8, 1.1, 0.62, '#3E6153']];
  for (const [y, h, r, color] of tiers) pine.add(flat(new THREE.ConeGeometry(r, h, 7)), color, 0, y, 0, 0, 0, 0, { shade: 0.62, surface: 'foliage' });
  const spruce = new GeoBuilder();
  spruce.cylinder(0, 0.35, 0, 0.08, 0.12, 0.7, '#5B4535', 6, 'y', { surface: 'wood' });
  const tiers2: [number, number, number, string][] = [[1.3, 1.9, 0.78, '#284236'], [2.35, 1.6, 0.6, '#2F4D40'], [3.25, 1.3, 0.42, '#3A5C4E']];
  for (const [y, h, r, color] of tiers2) spruce.add(flat(new THREE.ConeGeometry(r, h, 6)), color, 0, y, 0, 0, 0, 0, { shade: 0.6, surface: 'foliage' });
  const broad = new GeoBuilder();
  broad.cylinder(0, 0.6, 0, 0.1, 0.14, 1.2, '#6B5646', 6, 'y', { surface: 'wood' });
  broad.add(flat(new THREE.IcosahedronGeometry(0.95, 0)), '#4A6B4A', 0, 1.75, 0, 0, 0, 0, { shade: 0.7, surface: 'foliage' });
  broad.add(flat(new THREE.IcosahedronGeometry(0.6, 0)), '#557A54', 0.35, 2.2, 0.2, 0, 0.6, 0, { shade: 0.85, surface: 'foliage' });
  return [pine.build(), spruce.build(), broad.build()];
}
