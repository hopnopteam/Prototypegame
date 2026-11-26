import * as THREE from 'three';
import { NEW_LOOK } from '../config/look';
import type { Build, Outfit } from '../config/crowd';
import { packPattern, type DetailName } from './detail';
import { modelGeometry, type ModelId } from './models/library';
import { BODY_KIT } from './models/bodyKit';
import { SURFACES } from './surfaces';

/**
 * Session 66 (owner: "the bodies are still smooth, simple shapes… the stick nature… make character that actually looks
 * well connected"): a figure's torso, neck, arms and legs are one sculpted surface (art/blender/characters/body_kit.py,
 * `ch_body_<build>`), not tubes put together. The game cuts it into the pieces its bones move (the torso with the body,
 * each arm from its shoulder, each leg from its hip) and skins them where they meet, so a shoulder rolls, an elbow and
 * a knee bend, and nothing comes apart:
 *
 *  - each vertex follows its limb, the body (near the shoulder or the hip), or the limb's lower bone (past the elbow or
 *    the knee), blended smoothly by where it sits (`weights`); a triangle touching a limb belongs to that limb's piece,
 *    and the vertices it shares with the torso follow the body exactly as the torso's do, so no seam can open;
 *  - the clothes are painted on by region per outfit (a sleeve to its hem, a neckline, a waistband, a trouser hem, a
 *    sock), each boundary cut through the mesh so it is a clean line, never a smear (`splitAt`);
 *  - the occlusion Cycles baked into the model (the armpits, between the legs, under the chin) shades every colour.
 *
 * The pieces are in their bones' frames: the torso in the body's, an arm from its shoulder pivot, a leg from its hip
 * pivot, carrying the `aSkin` attribute world/Skin.ts reads (code 1 the body, code 2 the elbow or the knee).
 */

const SHOULDER_Y = 0.75;
const HIP_Y = 0.42;
const ELBOW_Y = -0.165;
const KNEE_Y = -0.205;
const WRIST_Y = -0.1;
/** The shoe's top (the shoe is its own model) and how far above it a trouser hem falls. */
const SHOE_TOP = 0.068;
const HEM_ABOVE_SHOE = 0.026;
/** Where a top ends over trousers, and where a short sleeve ends (below the shoulder pivot). */
const WAIST_HEM = 0.39;
/** Under a dress, bare legs up to here (the skirt covers the rest; a cut there keeps the line clean). */
const BARE_TOP = 0.3;
const SHORT_SLEEVE = -0.105;
/** A jacket's cuff, above the wrist. */
const CUFF = 0.024;
/** The neckline: skin above it, round the neck (lower at the front than the back, easing round the sides). */
const NECKLINE = { front: 0.795, back: 0.812, radius: 0.066 };
function neckHeight(z: number): number {
  const mid = (NECKLINE.front + NECKLINE.back) / 2;
  return mid - ((NECKLINE.back - NECKLINE.front) / 2) * Math.tanh(z / 0.025);
}
/** Tee stripes (heights where a band starts). */
const STRIPE_EDGES = [0.47, 0.52, 0.57, 0.62, 0.67];

export interface BodyPaint {
  build: Build;
  outfit: Outfit;
  skin: string;
  top: string;
  /** The tee's stripe colour (with `stripes`), the jacket's cuff colour. */
  trim?: string;
  stripes?: boolean;
  cuff?: string;
  pants: string;
  sock: string;
  long: boolean;
  topCloth: DetailName;
  pantsCloth: DetailName;
}

export interface BodyPieces {
  /** Body frame. */
  torso: THREE.BufferGeometry;
  /** Index 0 is the figure's right (x < 0), 1 its left: from the shoulder pivot. */
  arms: [THREE.BufferGeometry, THREE.BufferGeometry];
  /** From the hip pivot. */
  legs: [THREE.BufferGeometry, THREE.BufferGeometry];
}

/** The sculpted body's bones and measured outline, per build (art/blender/characters/body_kit.py). */
export function bodyKit(build: Build): (typeof BODY_KIT)[Build] {
  return BODY_KIT[build];
}

const OUTLINE_Y0 = 0.3;
const OUTLINE_STEP = 0.01;
/** The torso as sculpted at a height: [half-width at the side, front depth, back depth] (metres, figure space). */
export function bodyOutline(build: Build, y: number): [number, number, number] {
  const rows = BODY_KIT[build].outline;
  const f = Math.max(0, Math.min(rows.length - 1.0001, (y - OUTLINE_Y0) / OUTLINE_STEP));
  const i = Math.floor(f);
  const t = f - i;
  const a = rows[i];
  const b = rows[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ── The bind mesh ────────────────────────────────────────────────────────────────────────────────────────────────────

interface Bind {
  pos: Float32Array;
  nor: Float32Array;
  ao: Float32Array;
  index: ArrayLike<number>;
}
const binds = new Map<Build, Bind>();
/** The skin key's red as baked (linear), so a vertex's baked occlusion is its red over this. */
const KEY_RED = new THREE.Color('#FF2A2A').r;

function bind(build: Build): Bind {
  let b = binds.get(build);
  if (b) return b;
  const g = modelGeometry(`ch_body_${build}` as ModelId);
  const pos = g.getAttribute('position').array as Float32Array;
  const nor = g.getAttribute('normal').array as Float32Array;
  const col = g.getAttribute('color').array as Float32Array;
  const n = pos.length / 3;
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) ao[i] = NEW_LOOK ? Math.min(1, col[i * 3] / KEY_RED) : 1;
  b = { pos, nor, ao, index: g.getIndex()!.array };
  binds.set(build, b);
  return b;
}

// ── Cutting at the hems ──────────────────────────────────────────────────────────────────────────────────────────────

/** A triangle soup: per corner position (3), normal (3), occlusion (1). */
interface Soup {
  v: number[];
}
const STRIDE = 7;

function soupOf(b: Bind): Soup {
  const v: number[] = [];
  for (let k = 0; k < b.index.length; k++) {
    const i = b.index[k];
    v.push(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2], b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2], b.ao[i]);
  }
  return { v };
}

/** Cuts every triangle crossing the zero of `f` (a function of a corner's position) in two along it, so a colour can
 * change exactly there (the crossing found by linear interpolation along each edge). */
function splitBy(s: Soup, f: (x: number, y: number, z: number) => number): Soup {
  const out: number[] = [];
  const v = s.v;
  const corner = (t: number, c: number): number[] => v.slice((t * 3 + c) * STRIDE, (t * 3 + c + 1) * STRIDE);
  const lerp = (a: number[], b: number[], t: number): number[] => a.map((x, i) => x + (b[i] - x) * t);
  const tris = v.length / (3 * STRIDE);
  for (let t = 0; t < tris; t++) {
    const c = [corner(t, 0), corner(t, 1), corner(t, 2)];
    const val = c.map((p) => f(p[0], p[1], p[2]));
    const side = val.map((x) => (x >= 0 ? 1 : -1));
    if (side[0] === side[1] && side[1] === side[2]) {
      for (const p of c) out.push(...p);
      continue;
    }
    // The lone corner (on its own side) and the other two, in winding order from it.
    const lone = side[0] === side[1] ? 2 : side[0] === side[2] ? 1 : 0;
    const ib = (lone + 1) % 3;
    const id = (lone + 2) % 3;
    const a = c[lone];
    const ab = lerp(a, c[ib], val[lone] / (val[lone] - val[ib]));
    const ad = lerp(a, c[id], val[lone] / (val[lone] - val[id]));
    out.push(...a, ...ab, ...ad);
    out.push(...ab, ...c[ib], ...c[id]);
    out.push(...ab, ...c[id], ...ad);
  }
  return { v: out };
}

function splitAt(s: Soup, y0: number): Soup {
  return splitBy(s, (_x, y) => y - y0);
}

// ── Which bone moves a vertex ────────────────────────────────────────────────────────────────────────────────────────

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function stations(r: readonly number[], at: readonly number[], y: number): number {
  // r and at top to bottom; eased between.
  if (y >= at[0]) return r[0];
  for (let i = 1; i < at.length; i++) {
    if (y >= at[i]) {
      const t = (at[i - 1] - y) / (at[i - 1] - at[i]);
      return r[i - 1] + (r[i] - r[i - 1]) * t * t * (3 - 2 * t);
    }
  }
  return r[r.length - 1];
}

/** A vertex's limb (0, 1 the arms right and left; 2, 3 the legs), how much it follows it, and its lower bone's share. */
interface Influence {
  limb: number;
  w: number;
  lower: number;
}

function influence(build: Build, x: number, y: number, z: number, out: Influence): Influence {
  const k = BODY_KIT[build];
  out.limb = -1;
  out.w = 0;
  out.lower = 0;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    // The arm: near its axis, below the shoulder's top. Tight below (the chest is 13 mm clear of it), wider over the
    // shoulder and the trapezius, which roll with the arm a little.
    const ly = y - SHOULDER_Y;
    if (ly < ELBOW_Y + WRIST_Y - 0.06 || ly > 0.1 || s * x < 0.04) continue;
    const a = k.arm;
    const r = ly > -0.03 ? a[0] * 1.25 : stations([a[0], a[1], a[2], a[3], a[4]], [-0.03, -0.06, ELBOW_Y, ELBOW_Y - 0.035, ELBOW_Y + WRIST_Y], ly);
    const d = Math.hypot(x - s * k.shoulderX, z);
    const open = smooth01((y - 0.68) / 0.06);
    const band = 0.004 + 0.034 * open;
    const reach = 0.006 + 0.02 * open;
    const inArm = smooth01((r + reach + band - d) / band);
    const w = inArm * (1 - smooth01((y - 0.705) / 0.095));
    if (w > 0) {
      out.limb = i;
      out.w = w;
      out.lower = smooth01((ELBOW_Y + 0.045 - ly) / 0.09);
      return out;
    }
  }
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const ly = y - HIP_Y;
    if (ly > 0.05 || s * x < 0.0) continue;
    const l = k.leg;
    const r = ly > -0.02 ? l[0] * 1.15 : stations([l[0], l[1], l[2], l[3], l[4]], [-0.02, -0.1, KNEE_Y, KNEE_Y - 0.05, -0.32], ly);
    const d = Math.hypot(x - s * k.hipX, z);
    const open = smooth01((y - 0.27) / 0.07);
    const band = 0.004 + 0.036 * open;
    const reach = 0.006 + 0.02 * open;
    const inLeg = smooth01((r + reach + band - d) / band);
    const w = inLeg * (1 - smooth01((y - 0.3) / 0.13));
    if (w > 0) {
      out.limb = 2 + i;
      out.w = w;
      out.lower = smooth01((KNEE_Y + 0.05 - ly) / 0.1);
      return out;
    }
  }
  return out;
}

// ── What is worn where ───────────────────────────────────────────────────────────────────────────────────────────────

type Region = 'skin' | 'top' | 'trim' | 'cuff' | 'pants' | 'sock';

function trousers(o: Outfit): boolean {
  return o === 'tee' || o === 'shirt' || o === 'jacket';
}

/** The torso's own rule (also for the arms' and legs' triangles that are torso surface). */
function torsoRegion(p: BodyPaint, x: number, y: number, z: number): Region {
  if (y > neckHeight(z) && Math.hypot(x, z) < NECKLINE.radius) return 'skin';
  if (trousers(p.outfit) && y < WAIST_HEM) return 'pants';
  if (p.outfit === 'coat' && y < 0.42) return 'pants';
  if (p.stripes && p.trim && p.outfit === 'tee' && y >= STRIPE_EDGES[0] && y < 0.86) {
    let band = 0;
    for (const e of STRIPE_EDGES) if (y >= e) band++;
    return band % 2 === 1 ? 'trim' : 'top';
  }
  return 'top';
}

function regionAt(p: BodyPaint, piece: number, x: number, y: number, z: number): Region {
  if (piece === 0 || piece === 1) {
    // A sleeve is the top's own cloth (stripes run round it at the same heights), down to its hem or its cuff: one
    // rule for the arm's whole surface, so no uncut boundary zigzags over the shoulder.
    const ly = y - SHOULDER_Y;
    if (!p.long && ly < SHORT_SLEEVE) return 'skin';
    if (p.long && p.cuff && ly < ELBOW_Y + WRIST_Y + CUFF) return 'cuff';
    return torsoRegion(p, x, y, z);
  }
  if (piece === 2 || piece === 3) {
    const bare = p.outfit === 'dress' || p.outfit === 'gown';
    if (y > (bare ? BARE_TOP : 0.3)) return torsoRegion(p, x, y, z);
    const hem = SHOE_TOP + (bare ? 0.04 : HEM_ABOVE_SHOE);
    if (y < hem) return 'sock';
    return bare ? 'skin' : 'pants';
  }
  return torsoRegion(p, x, y, z);
}

function cuts(p: BodyPaint): number[] {
  const ys: number[] = [];
  if (trousers(p.outfit)) ys.push(WAIST_HEM);
  if (p.outfit === 'coat') ys.push(0.42);
  if (p.stripes && p.trim && p.outfit === 'tee') ys.push(...STRIPE_EDGES);
  if (!p.long) ys.push(SHOULDER_Y + SHORT_SLEEVE);
  else if (p.cuff) ys.push(SHOULDER_Y + ELBOW_Y + WRIST_Y + CUFF);
  const bare = p.outfit === 'dress' || p.outfit === 'gown';
  if (bare) ys.push(BARE_TOP);
  ys.push(SHOE_TOP + (bare ? 0.04 : HEM_ABOVE_SHOE));
  return ys;
}

// ── The pieces ───────────────────────────────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, BodyPieces>();
const tmpI = { limb: -1, w: 0, lower: 0 };
const tmpC = new THREE.Color();

/** The sculpted body for a build, cut into its bones' pieces and dressed for an outfit (cached per paint). */
export function sculptedBody(p: BodyPaint): BodyPieces {
  const key = JSON.stringify(p);
  const hit = cache.get(key);
  if (hit) return hit;
  const b = bind(p.build);
  const k = BODY_KIT[p.build];
  let soup = soupOf(b);
  // The neckline is two cuts (its height round the neck, and the neck's own radius), so it is a clean line too.
  soup = splitBy(soup, (_x, y, z) => y - neckHeight(z));
  soup = splitBy(soup, (x, y, z) => (y > NECKLINE.front - 0.01 ? NECKLINE.radius - Math.hypot(x, z) : 1));
  for (const y of cuts(p)) soup = splitAt(soup, y);

  const colours: Record<Region, string> = { skin: p.skin, top: p.top, trim: p.trim ?? p.top, cuff: p.cuff ?? p.top, pants: p.pants, sock: p.sock };
  const details: Record<Region, DetailName | undefined> = { skin: undefined, top: p.topCloth, trim: p.topCloth, cuff: p.topCloth, pants: p.pantsCloth, sock: 'knit' };
  const fabric = SURFACES.fabric;
  const matte = SURFACES.matte;

  // Five pieces' corner lists: position (local), normal, colour, pattern, surface, skin.
  const pieces = [0, 1, 2, 3, 4].map(() => ({ pos: [] as number[], nor: [] as number[], col: [] as number[], pat: [] as number[], surf: [] as number[], skin: [] as number[] }));
  const v = soup.v;
  const tris = v.length / (3 * STRIDE);
  const inf: Influence[] = [{ ...tmpI }, { ...tmpI }, { ...tmpI }];
  for (let t = 0; t < tris; t++) {
    let piece = 4;
    for (let c = 0; c < 3; c++) {
      const o = (t * 3 + c) * STRIDE;
      influence(p.build, v[o], v[o + 1], v[o + 2], inf[c]);
      if (inf[c].limb >= 0 && (piece === 4 || inf[c].limb < piece)) piece = inf[c].limb;
    }
    const o0 = t * 3 * STRIDE;
    const cx = (v[o0] + v[o0 + STRIDE] + v[o0 + 2 * STRIDE]) / 3;
    const cy = (v[o0 + 1] + v[o0 + STRIDE + 1] + v[o0 + 2 * STRIDE + 1]) / 3;
    const cz = (v[o0 + 2] + v[o0 + STRIDE + 2] + v[o0 + 2 * STRIDE + 2]) / 3;
    const region = regionAt(p, piece, cx, cy, cz);
    tmpC.set(colours[region]);
    const surf = region === 'skin' ? matte : fabric;
    const pat = packPattern(0, details[region]);
    const side = piece === 0 || piece === 2 ? -1 : 1;
    const ox = piece === 4 ? 0 : side * (piece < 2 ? k.shoulderX : k.hipX);
    const oy = piece === 4 ? 0 : piece < 2 ? SHOULDER_Y : HIP_Y;
    const P = pieces[piece];
    for (let c = 0; c < 3; c++) {
      const o = (t * 3 + c) * STRIDE;
      P.pos.push(v[o] - ox, v[o + 1] - oy, v[o + 2]);
      const n = Math.hypot(v[o + 3], v[o + 4], v[o + 5]) || 1;
      P.nor.push(v[o + 3] / n, v[o + 4] / n, v[o + 5] / n);
      const ao = v[o + 6];
      P.col.push(tmpC.r * ao, tmpC.g * ao, tmpC.b * ao);
      P.pat.push(pat, 0.4);
      P.surf.push(1 - surf.roughness, surf.metalness, surf.glow ?? 0, 1 - (surf.sheen ?? 0));
      if (piece < 4) {
        const f = inf[c];
        // A corner of a limb's triangle that is pure body follows the body exactly (as the torso's corners do).
        const mine = f.limb === piece ? f.w : 0;
        const toBody = 1 - mine;
        const lower = f.limb === piece ? f.lower : 0;
        if (toBody >= lower) P.skin.push(toBody > 1e-4 ? 1 : 0, toBody > 1e-4 ? toBody : 0);
        else P.skin.push(2, lower);
      }
    }
  }

  const make = (i: number): THREE.BufferGeometry => {
    const P = pieces[i];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
    g.setAttribute('aColor2', new THREE.Float32BufferAttribute(P.col, 3));
    g.setAttribute('aPattern', new THREE.Float32BufferAttribute(P.pat, 2));
    g.setAttribute('aSurface', new THREE.Float32BufferAttribute(P.surf, 4));
    if (i < 4) g.setAttribute('aSkin', new THREE.Float32BufferAttribute(P.skin, 2));
    g.computeBoundingSphere();
    return g;
  };
  const out: BodyPieces = { torso: make(4), arms: [make(0), make(1)], legs: [make(2), make(3)] };
  cache.set(key, out);
  return out;
}
