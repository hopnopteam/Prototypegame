/**
 * The lakeside as continuous functions of where you are, not of which piece you are on: the shoreline, the
 * ground's height and its colour are all functions of (x across the line, s along it), so pieces built at any
 * point join without a seam, and the water shader (which runs the same shoreline in GLSL, below) knows how
 * deep the lake is everywhere.
 *
 * `s` is scroll space: world z minus how far the train has travelled, so the world slides past at train speed.
 * x < 0 is the lake side, x > 0 the land side; the track bed runs down the middle (|x| < TRACK_HALF).
 */

/** The track bed's half-width (ballast); nothing of the scenery comes inside it. */
export const TRACK_HALF = 2.5;
/** The water's surface. */
export const WATER_Y = 0;
/** Height of the grass verges beside the ballast. */
export const VERGE_Y = 0.12;

/** The gravel footpath along the land side. */
export const PATH_X = 3.2;

/** The shoreline wanders between these (x), never nearer the track than SHORE_NEAREST. */
export const SHORE_NEAREST = -3.5;
export const SHORE_MID = -5.0;

/**
 * Everything that varies along the line repeats exactly every WORLD_PERIOD metres (whole numbers of waves fit
 * in it), so the distance travelled can be wrapped for the GPU (float precision) without any visible jump.
 */
export const WORLD_PERIOD = 2400;
const K1 = (Math.PI * 2 * 16) / WORLD_PERIOD;
const K2 = (Math.PI * 2 * 42) / WORLD_PERIOD;
const K3 = (Math.PI * 2 * 103) / WORLD_PERIOD;

/**
 * Where the lake begins at `s`: a slow wander and two quicker ripples, kept between about −3.5 and −6.6, so
 * the bank is never straight and never the same twice in a minute.
 */
export function shoreX(s: number): number {
  const w = Math.sin(s * K1 + 1.3) * 0.95 + Math.sin(s * K2 + 0.4) * 0.45 + Math.sin(s * K3 + 2.1) * 0.18;
  return Math.min(SHORE_NEAREST, SHORE_MID + w);
}

/** The same shoreline in GLSL for the water shader. Keep in step with shoreX. */
export const SHORE_GLSL = /* glsl */ `
float nxShoreX(float s) {
  float w = sin(s * ${K1.toFixed(7)} + 1.3) * 0.95 + sin(s * ${K2.toFixed(7)} + 0.4) * 0.45 + sin(s * ${K3.toFixed(7)} + 2.1) * 0.18;
  return min(${SHORE_NEAREST.toFixed(2)}, ${SHORE_MID.toFixed(2)} + w);
}
`;

/** Cheap deterministic hash in [0,1). */
export function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth value noise in [0,1). */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Ground height. Lake side: a grassy verge that rolls down a pebbly bank into the water and on down to the
 * lake bed. Land side: nearly flat meadow near the line (the platform and its building stand there at
 * stations, so nothing rises above them), gentle swells further out.
 */
export function groundHeight(x: number, s: number): number {
  if (x < -TRACK_HALF) {
    const shore = shoreX(s);
    if (x >= shore) {
      // Verge to waterline: flat by the ballast, then a rounded bank.
      const t = (x - shore) / Math.max(0.2, -TRACK_HALF - shore);
      return VERGE_Y * smooth(0, 0.55, t) + -0.06 * (1 - smooth(0, 0.25, t));
    }
    // Under the water: shelving down to the lake bed.
    return -0.06 - Math.min(1.6, (shore - x) * 0.45);
  }
  if (x <= TRACK_HALF) return VERGE_Y;
  const swell = x > 20 ? (x - 20) * 0.08 * (0.6 + 0.4 * noise2(x * 0.05, s * 0.05)) : 0;
  return VERGE_Y + (noise2(x * 0.35, s * 0.35) - 0.5) * 0.06 * smooth(3, 6, x) + Math.min(2.5, swell);
}

export type Rgb = [number, number, number];

const hex = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The night palette of the ground: moonlit meadow greens, a pale pebble bank, darker grass under the hedges. */
export const GROUND = {
  grass: hex('#4C7D60'),
  grassLight: hex('#67967A'),
  grassDark: hex('#38604E'),
  bank: hex('#8C8A86'),
  sand: hex('#B3A893'),
  bed: hex('#5E6A6E'),
  lane: hex('#8A7E70'),
  path: hex('#A49A8C'),
  field: hex('#6F7A4E'),
  fieldDark: hex('#56603C'),
};

/** Ground colour at (x, s) in sRGB 0..1 (vertex colours). `lane` marks a country lane's centre x, if any. */
export function groundColor(x: number, s: number, lane: number | null = null, field = false): Rgb {
  if (x < -TRACK_HALF) {
    const shore = shoreX(s);
    const d = x - shore;
    if (d < 0) return GROUND.bed;
    // Pebbles at the waterline, sand above it, then the verge.
    const pebble = 1 - smooth(0.15, 0.7, d);
    const n = noise2(x * 2.3, s * 2.3);
    const g = mix(GROUND.grass, GROUND.grassLight, n * 0.6);
    return mix(mix(g, GROUND.sand, smooth(0.9, 0.3, d) * 0.85), GROUND.bank, pebble);
  }
  const n = noise2(x * 0.7, s * 0.7);
  const fine = noise2(x * 3.1, s * 3.1);
  let c = mix(GROUND.grassDark, GROUND.grass, smooth(0.25, 0.75, n));
  c = mix(c, GROUND.grassLight, fine * 0.22);
  if (field && x > 7) {
    const row = 0.5 + 0.5 * Math.sin(x * 4.2);
    c = mix(mix(GROUND.fieldDark, GROUND.field, row), c, smooth(7.6, 7, x));
  }
  if (lane !== null) {
    const d = Math.abs(x - lane);
    c = mix(c, GROUND.lane, 1 - smooth(0.85, 1.15, d));
  }
  // A gravel footpath runs beside the line the whole way (the onlookers stand on it).
  const p = Math.abs(x - PATH_X);
  c = mix(c, mix(GROUND.path, GROUND.lane, fine * 0.5), 1 - smooth(0.3, 0.42, p));
  return c;
}
