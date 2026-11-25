import * as THREE from 'three';
import { GeoBuilder, type PartStyle } from './geo';
import { addSkin, armWeight, legWeight } from './Skin';
import { modelEntry, type ModelId, type Recolor } from './models/library';

/**
 * The people, as soft clay toys (owner, 26 Nov, with a reference sheet: "match the style 1:1"). Every number below is
 * measured from the reference in docs/art/CHARACTER_SPEC.md:
 *
 * - a big, softly squared head with no neck, sitting on round high shoulders: 2.85 heads tall, a 0.40 m head on a
 *   1.20 m adult (the old height, so bubbles, stacks, seats, beds and the scooter keep their heights);
 * - a torso as wide as the head (0.95 of it; 0.82 slim, 1.12 stout), garments as smooth tubes whose edges are rolls:
 *   rolled sleeve cuffs, turned-up trouser hems over a sock band, a tee's hem band, a dark belt with a pale buckle;
 * - thick tube limbs (a forearm 0.26 of the head's width in a sleeve, 0.23 bare) jointed by spheres of the tube's own
 *   radius at the elbow and knee, so a bend never opens a gap or a crease (rigid parts with joint caps: §9);
 * - mitten hands and chunky shoes with a paler sole;
 * - a tiny low face: wide-set blue oval eyes at the head's middle, a round bulb of a nose, a small red mouth.
 *
 * The heads with their hair helmets and the shoes are modelled in Blender (art/blender/characters/char_kit.py) and
 * carry Cycles-baked occlusion; the garments are built here from data. Every part also gets crease shading at build
 * time from a few sphere proxies of the body in its rest pose (`occlude`): under the chin, in the armpits, between the
 * legs. Smooth-shaded vertex colour on the shared character material, so a crowd stays one draw (CharacterBatch).
 */

export const HIP_Y = 0.42;
export const SHOULDER_Y = 0.75;
export const HEAD_Y = 1.0;
/** Head half-sizes (width, height, depth) and squareness: the Blender skull's (char_kit.py HEAD_*). */
export const HEAD = { a: 0.21, b: 0.2, c: 0.198, n: 2.5 };
export const HEAD_TOP = HEAD_Y + HEAD.b;
/** The torso is a lathe squashed front to back by this much. */
const TORSO_DEPTH = 0.84;
/** Where the hand ends, below the shoulder pivot (arm length). */
export const HAND_Y = -0.335;
/** The leg's length below the hip pivot, to the sole. */
export const LEG_LENGTH = HIP_Y;
/** The elbow sits this far below the shoulder pivot, the knee this far below the hip pivot. */
export const ELBOW_Y = -0.165;
export const KNEE_Y = -0.205;
/** The neck pivot: the head turns and nods about it. */
export const NECK_Y = 0.835;

import type { Build, HairStyle, Outfit } from '../config/crowd';
import type { DetailName } from './detail';
export type { Build, HairStyle, Outfit };

/** Torso radius at the belly by build (CHARACTER_SPEC §2: 0.82, 0.95 and 1.12 of the head's 0.42 m width). */
const TORSO_R: Record<Build, number> = { slim: 0.172, regular: 0.2, stout: 0.235 };
/** The shoulder pivots stand just inside the torso's side, the hips under its round. */
export function shoulderX(build: Build = 'regular'): number {
  // Session 63 ("zero clip ins"): far enough out that a hanging sleeve clears the torso (it sat inside its edge, so
  // an arm hanging down went into the body); the shoulder ball still meets the torso's top as a rounded shoulder.
  return TORSO_R[build] + 0.046;
}
export const SHOULDER_X = shoulderX();
export function hipX(build: Build = 'regular'): number {
  return build === 'slim' ? 0.088 : build === 'stout' ? 0.11 : 0.098;
}

/** Limb tube radii (§2). */
const SLEEVE_R = 0.058;
const FORE_SLEEVE_R = 0.054;
const ARM_R = 0.046;
const TROUSER_R = 0.088;
const SHIN_R = 0.082;
const BARE_LEG_R = 0.043;
/** The mitten hand's scale over the figure kit's model, and where the wrist sits below the elbow. */
const HAND_SCALE = 1.45;
const WRIST_Y = HAND_Y - ELBOW_Y + 0.07;
/** Session 63: the middle of the mitten in the forearm's frame (from the elbow pivot): where a hand grips. */
export const GRIP: readonly [number, number, number] = [0, WRIST_Y - 0.033, 0.009];

/**
 * The cloth being built (session 63): its detail layer (suiting twill, jersey, denim, tweed, shirting, felt…) is set by
 * `wearing` round each garment, so every tube, roll and lathe of that garment carries its weave.
 */
const SOFT: PartStyle = { shade: 0.9, surface: 'fabric', detail: undefined };

/** Builds `make` with `cloth` as the weave of everything soft in it. */
export function wearing<T>(cloth: DetailName | undefined, make: () => T): T {
  const was = SOFT.detail;
  SOFT.detail = cloth;
  try {
    return make();
  } finally {
    SOFT.detail = was;
  }
}

/** The weave of a figure's top (session 63, owner: "no realism to their clothes"). */
export function topCloth(f: Pick<FigureSpec, 'outfit'>): DetailName {
  switch (f.outfit) {
    case 'jacket':
      return 'twill';
    case 'coat':
      return 'tweed';
    case 'shirt':
    case 'dress':
      return 'oxford';
    case 'gown':
      return 'felt';
    default:
      return 'knit';
  }
}

/** The weave of a figure's trousers: denim for blue trousers under a tee or a shirt, suiting otherwise. */
export function pantsCloth(f: Pick<FigureSpec, 'outfit' | 'pants'>): DetailName {
  if (f.outfit === 'tee' || f.outfit === 'shirt') {
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(f.pants).getHSL(hsl);
    if (hsl.h > 0.52 && hsl.h < 0.72 && hsl.s > 0.15) return 'denim';
  }
  return 'twill';
}
const SKIN: PartStyle = { shade: 0.94, surface: 'matte' };
const FLAT: PartStyle = { shade: 1, surface: 'matte' };
const EYE = '#24348E';
const LIPS = '#C0392B';
const SOLE = '#D8D2C6';
const SMART_SOLE = '#A99F93';
const BELT = '#3A2418';
const BUCKLE = '#D8D2C0';

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function mixHex(a: string, b2: string, t: number): string {
  const c = new THREE.Color(a).lerp(new THREE.Color(b2), t);
  return `#${c.getHexString()}`;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The z of the face's surface at (x, y) (head space, y from the head's centre): the Blender skull's, cheeks and all. */
export function faceZ(x: number, y: number): number {
  const { b, c, n } = HEAD;
  const a = HEAD.a * (1 + 0.05 * smoothstep(0.3, -0.5, y / b));
  const k = 1 - Math.abs(x / a) ** n - Math.abs(y / b) ** n;
  return k > 0 ? c * k ** (1 / n) : 0;
}

/** A lathe round the y axis from [radius, height] pairs, its seam at the back, squashed front to back. */
function lathe(profile: [number, number][], segments = 18, depth = TORSO_DEPTH): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, Math.PI, Math.PI * 2);
  g.scale(1, 1, depth);
  g.deleteAttribute('uv');
  return g;
}

/** A soft roll round a tube (a cuff, a hem, a turned-up trouser leg): a torus of the given tube radius. */
function roll(b: GeoBuilder, y: number, r: number, tube: number, color: string, depth = 1, z = 0): void {
  b.add(new THREE.TorusGeometry(r, tube, 6, 20).scale(1, depth, 1), color, 0, y, z, Math.PI / 2, 0, 0, SOFT);
}

/** A tube down the y axis from `y0` to `y1` (y1 < y0), open-ended (caps are the joints' spheres). */
function tube(b: GeoBuilder, y0: number, y1: number, r0: number, r1: number, color: string, style: PartStyle = SOFT, segments = 16): void {
  b.add(new THREE.CylinderGeometry(r0, r1, y0 - y1, segments, 1, true), color, 0, (y0 + y1) / 2, 0, 0, 0, 0, style);
}


export interface FigureSpec {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: Outfit;
  top: string;
  /** A second colour for the top: stripes on a tee, the lapels and buttons of a jacket or coat. */
  trim?: string;
  stripes?: boolean;
  pants: string;
  belt?: boolean;
  fur?: string;
  moustache?: boolean;
  glasses?: boolean;
  /** A hat sits on the hair: short hair is pressed flat under it (the `hat` helmet). */
  hatted?: boolean;
  build?: Build;
}

// ── The occlusion proxies: the body's big round masses in its rest pose (figure space) ──────────────────────────────

interface Proxy {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** The rest pose's masses, which shade each other where they meet (CHARACTER_SPEC §6 "creases"). */
function proxies(build: Build): Proxy[] {
  const R = TORSO_R[build];
  const sx = shoulderX(build);
  const hx = hipX(build);
  return [
    { x: 0, y: HEAD_Y, z: 0, r: 0.2 },
    { x: 0, y: 0.6, z: 0, r: R * 0.92 },
    { x: 0, y: 0.74, z: 0, r: R * 0.82 },
    { x: -sx, y: SHOULDER_Y - 0.08, z: 0, r: SLEEVE_R },
    { x: sx, y: SHOULDER_Y - 0.08, z: 0, r: SLEEVE_R },
    { x: -sx, y: SHOULDER_Y + ELBOW_Y - 0.06, z: 0.01, r: FORE_SLEEVE_R },
    { x: sx, y: SHOULDER_Y + ELBOW_Y - 0.06, z: 0.01, r: FORE_SLEEVE_R },
    { x: -hx, y: HIP_Y - 0.1, z: 0, r: TROUSER_R },
    { x: hx, y: HIP_Y - 0.1, z: 0, r: TROUSER_R },
    { x: -hx, y: 0.12, z: 0, r: SHIN_R },
    { x: hx, y: 0.12, z: 0, r: SHIN_R },
  ];
}

/** How dark the deepest crease gets (the reference's 0.7) and how strongly the proxies shade. */
const CREASE_FLOOR = 0.68;
const CREASE_GAIN = 0.85;

/**
 * Crease shading baked into a part's vertex colours (the classic sphere occlusion: a sphere of radius r at distance d
 * hides (r/d)² of the sky, weighted by how much the surface faces it). `at` is the part's pivot in figure space, so
 * proxies are read in the part's own frame; `skip` leaves out the proxies the part itself is (a limb never shades
 * itself).
 */
function occlude(g: THREE.BufferGeometry, build: Build, at: [number, number, number], skip: (p: Proxy) => boolean): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  if (!pos || !nor || !col) return g;
  const list = proxies(build).filter((p) => !skip(p)).map((p) => ({ x: p.x - at[0], y: p.y - at[1], z: p.z - at[2], r: p.r }));
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    let occ = 0;
    for (const p of list) {
      const dx = p.x - px;
      const dy = p.y - py;
      const dz = p.z - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < p.r * 0.9) continue; // inside the mass: it is the surface's own volume, not a neighbour
      const facing = (nx * dx + ny * dy + nz * dz) / d;
      if (facing <= 0) continue;
      occ += facing * (p.r * p.r) / (d * d);
    }
    const k = Math.max(CREASE_FLOOR, 1 - Math.min(1, occ * CREASE_GAIN) * (1 - CREASE_FLOOR) * 1.6);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return g;
}

/** Figure-space centres of the parts, for picking out a part's own proxy. */
const near = (p: Proxy, x: number, y: number): boolean => Math.abs(p.x - x) < 0.02 && Math.abs(p.y - y) < 0.2;

// ── The head ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Session 62 ("hair has no gloss"): the reference's hair carries a soft highlight a little glossier than the skin. The
 * hair's vertices take this surface (smoothness 0.62), which the figure shading turns into a broad sheen on every tier.
 */
export const HAIR_SURFACE = { roughness: 0.38, metalness: 0, sheen: 0.12 };
const HEAD_KEYS = (skin: string, hair: string): Recolor[] => [
  { hue: [345, 15], sat: [0.6, 1], val: [0.2, 1], ref: '#FF2A2A', to: skin },
  { hue: [45, 75], sat: [0.6, 1], val: [0.2, 1], ref: '#FFFF2A', to: hair, surface: HAIR_SURFACE, detail: 'hair' },
];

/**
 * Session 62: the reference's skin is a warm peach (#DEB385), ours read pale and pink under daylight. Every skin is
 * moved toward that warmth (hue toward 28°, a little more saturation), keeping its own lightness, so the range of
 * tones stays as it is.
 */
export function warmSkin(hex: string): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const target = 28 / 360;
  hsl.h += (target - hsl.h) * 0.45;
  hsl.s = Math.min(0.62, hsl.s * 1.12 + 0.03);
  c.setHSL(hsl.h, hsl.s, hsl.l * 0.985);
  return `#${c.getHexString()}`;
}

/** Which Blender head: the hairdo's own helmet, or hair pressed flat under a hat that covers the crown. */
function headModel(f: FigureSpec): ModelId {
  const flat = f.hatted && (f.hairStyle === 'short' || f.hairStyle === 'side' || f.hairStyle === 'quiff' || f.hairStyle === 'curly' || f.hairStyle === 'ponytail');
  // A ponytail is short hair swept back with a tail of its own (the tail swings: `hairPieceGeometry`).
  return (flat ? 'ch_head_hat' : f.hairStyle === 'ponytail' ? 'ch_head_side' : `ch_head_${f.hairStyle}`) as ModelId;
}

/** A kit model placed with its own origin at (x, y, z) (GeoBuilder.model places by the bounding box's foot). */
function atOrigin(b: GeoBuilder, id: ModelId, x: number, y: number, z: number, scale: number, keys: Recolor[], shadeK = 1, surface: 'matte' | 'fabric' | 'leather' = 'matte'): void {
  const e = modelEntry(id);
  const cx = (e.min[0] + e.max[0]) / 2;
  const cz = (e.min[2] + e.max[2]) / 2;
  b.model(id, x + cx * scale, y + e.min[1] * scale, z + cz * scale, 0, scale, scale, scale, { recolor: keys, shade: shadeK, surface });
}

/** Whether the face is a man's (a moustache), for the size of the nose. */
function noseRadius(f: FigureSpec): number {
  // Session 62 ("smaller noses"): in three-quarter view the reference's bulb noses read bigger than ours did.
  return f.moustache ? 0.043 : 0.035;
}

/** The head, its hair helmet and ears (Blender), and the face. */
export function addHead(b: GeoBuilder, f: FigureSpec): void {
  atOrigin(b, headModel(f), 0, HEAD_Y, 0, 1, HEAD_KEYS(f.skin, f.hair), 0.97);
  // Session 62 ("the characters are too flat… add some important details"): a warm blush on the cheeks, painted into the
  // head's own skin (no extra surface to flicker), just below and outside the eyes.
  const blush = mixHex(f.skin, '#EE7468', 0.7);
  b.blendLast(blush, (x, y, z) => {
    if (z < 0.06) return 0;
    const d = Math.hypot(Math.abs(x) - 0.118, (y - HEAD_Y) + 0.056, (z - faceZ(0.118, -0.056)) * 0.5);
    return 0.8 * (1 - smoothstep(0.012, 0.062, d));
  });
  // The face (CHARACTER_SPEC §3): wide-set blue ovals at the head's middle, a bulb nose, a small red mouth.
  const ey = -0.012;
  for (const x of [-0.08, 0.08]) {
    b.add(new THREE.SphereGeometry(0.028, 10, 7).scale(0.9, 1.35, 0.42), EYE, x, HEAD_Y + ey, faceZ(x, ey) - 0.003, 0, 0, 0, FLAT);
    // Session 62: soft brows in the hair's colour (a shade darker), tilted a touch, so the face has expression.
    const by = ey + 0.06;
    b.add(new THREE.SphereGeometry(0.03, 10, 5).scale(1.25, 0.3, 0.36), shade(f.hair, 0.82), x * 1.04, HEAD_Y + by, faceZ(x, by) - 0.002, 0, 0, x > 0 ? -0.16 : 0.16, FLAT);
  }
  const nr = noseRadius(f);
  const ny = -0.062;
  b.add(new THREE.SphereGeometry(nr, 12, 8).scale(1, 0.92, 0.9), f.skin, 0, HEAD_Y + ny, faceZ(0, ny) + nr * 0.12, 0, 0, 0, SKIN);
  const my = f.moustache ? -0.128 : -0.112;
  b.add(new THREE.SphereGeometry(0.03, 10, 6).scale(1.1, 0.42, 0.4), LIPS, 0, HEAD_Y + my, faceZ(0, my) - 0.002, 0, 0, 0, FLAT);
  if (f.moustache) {
    // A soft dark bar under the nose: two lobes meeting in the middle, tips turned down.
    for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.042, 10, 7).scale(1.25, 0.52, 0.62), f.hair, s * 0.036, HEAD_Y - 0.094, faceZ(s * 0.036, -0.094) + 0.006, 0, 0, s * -0.28, FLAT);
  }
  if (f.glasses) {
    for (const x of [-0.08, 0.08]) b.add(new THREE.TorusGeometry(0.05, 0.009, 6, 24), '#3A3F8C', x, HEAD_Y + ey, faceZ(x, ey) + 0.016, 0, 0, 0, FLAT);
    b.box(0, HEAD_Y + ey + 0.008, faceZ(0, ey) + 0.022, 0.06, 0.012, 0.012, '#3A3F8C', 0, FLAT);
  }
}

/** Closed eyes for the sleepers: skin lids over the eyes and a lash line. */
export function eyelidGeometry(skin: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const ey = -0.012;
  for (const x of [-0.08, 0.08]) {
    b.add(new THREE.SphereGeometry(0.034, 12, 8).scale(1, 1.25, 0.5), skin, x, HEAD_Y + ey, faceZ(x, ey) + 0.001, 0, 0, 0, FLAT);
    b.box(x, HEAD_Y + ey - 0.012, faceZ(x, ey - 0.012) + 0.016, 0.052, 0.01, 0.008, EYE, 0, FLAT);
  }
  return b.build();
}

/** The head's own crease shading (under the chin, where it sits on the shoulders), about the neck pivot. */
export function occludeHead(g: THREE.BufferGeometry, build: Build = 'regular'): THREE.BufferGeometry {
  return occlude(g, build, [0, NECK_Y, 0], (p) => p.y === HEAD_Y && p.x === 0);
}

// ── The torso ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The torso's outline by build: a round belly, round high shoulders, a dome the head sits on (no neck). */
function chestProfile(build: Build): [number, number][] {
  const R = TORSO_R[build];
  const belly = build === 'stout' ? 1.05 : 1;
  return [[0, 0.37], [R * 0.84, 0.37], [R * 0.97, 0.41], [R * belly, 0.48], [R * 1.02 * belly, 0.56], [R, 0.65], [R * 0.95, 0.72], [R * 0.84, 0.78], [R * 0.64, 0.826], [R * 0.34, 0.852], [0, 0.858]];
}

/** Session 63: the torso's own radius (its chest and its hips, before anything worn on them) at a height, by build. */
export function torsoRadius(build: Build, y: number): number {
  const R = TORSO_R[build];
  const hips: [number, number][] = [[0, 0.3], [R * 0.72, 0.3], [R * 0.86, 0.34], [R * 0.92, 0.4], [R * 0.9, 0.44], [0, 0.45]];
  return Math.max(profileAt(chestProfile(build), y), profileAt(hips, y));
}
export { TORSO_DEPTH };

/** How far the torso's front stands out at a height (for buttons and badges). */
export function faceDepth(y: number, build: Build = 'regular'): number {
  const p = chestProfile(build);
  for (let i = 1; i < p.length; i++) {
    const [r0, a] = p[i - 1];
    const [r1, c] = p[i];
    if (y >= a && y <= c) return (r0 + ((y - a) / (c - a)) * (r1 - r0)) * TORSO_DEPTH;
  }
  return TORSO_R[build] * TORSO_DEPTH;
}

/**
 * A strap that hugs the torso at `x` from the belly over the shoulder and down the back (a backpack's, a satchel's):
 * a slim tube along the torso's own surface, a hair proud of it.
 */
export function addStrap(b: GeoBuilder, x: number, color: string, build: Build = 'regular', from = 0.52, to = 0.6): void {
  const prof = chestProfile(build);
  const radius = (y: number): number => {
    for (let i = 1; i < prof.length; i++) {
      const [r0, a] = prof[i - 1];
      const [r1, c] = prof[i];
      if (y >= a && y <= c) return r0 + ((y - a) / (c - a)) * (r1 - r0);
    }
    return 0;
  };
  const pts: THREE.Vector3[] = [];
  const surfaceZ = (y: number): number => TORSO_DEPTH * Math.sqrt(Math.max(0, radius(y) ** 2 - x * x)) + 0.012;
  for (let y = from; y < 0.8; y += 0.05) pts.push(new THREE.Vector3(x, y, surfaceZ(y)));
  // Over the shoulder's round top.
  const top = 0.83;
  pts.push(new THREE.Vector3(x, 0.8, surfaceZ(0.8) * 0.9), new THREE.Vector3(x, top + 0.012, 0), new THREE.Vector3(x, 0.8, -surfaceZ(0.8) * 0.9));
  for (let y = 0.75; y >= to; y -= 0.05) pts.push(new THREE.Vector3(x, y, -surfaceZ(y)));
  const curve = new THREE.CatmullRomCurve3(pts);
  b.add(new THREE.TubeGeometry(curve, 28, 0.013, 6, false).scale(1.25, 1, 1), color, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'leather' });
}

/** The torso, its hem, and whatever covers the hips (trousers, a skirt, a coat's tails). */
export function addTorso(b: GeoBuilder, f: FigureSpec): void {
  wearing(topCloth(f), () => torso(b, f));
}

function torso(b: GeoBuilder, f: FigureSpec): void {
  const build = f.build ?? 'regular';
  const R = TORSO_R[build];
  const chest = chestProfile(build);
  if (f.stripes && f.trim) {
    const bands: [number, number][] = [[0.37, 0.47], [0.47, 0.52], [0.52, 0.57], [0.57, 0.62], [0.62, 0.67], [0.67, 0.86]];
    bands.forEach(([y0, y1], i) => b.add(lathe(slice(chest, y0, y1)), i % 2 === 1 ? f.trim! : f.top, 0, 0, 0, 0, 0, 0, SOFT));
  } else {
    b.add(lathe(chest), f.top, 0, 0, 0, 0, 0, 0, SOFT);
  }

  switch (f.outfit) {
    case 'dress':
    case 'gown': {
      // Session 62: the bell is its own piece that swings from the waist (`skirtGeometry`). Here: a sash at the waist
      // with a bow at the back, and a soft round collar at the neck.
      b.add(lathe([[R * 1.0, 0.448], [R * 1.035, 0.468], [R * 1.0, 0.49]], 22), shade(f.trim ?? f.pants, 0.95), 0, 0, 0, 0, 0, 0, SOFT);
      const bz = -faceDepth(0.47, build) - 0.012;
      for (const s2 of [-1, 1]) b.add(new THREE.SphereGeometry(0.045, 12, 8).scale(1.2, 0.62, 0.42), shade(f.trim ?? f.pants, 0.95), s2 * 0.045, 0.475, bz, 0, 0, s2 * 0.35, SOFT);
      b.sphere(0, 0.47, bz - 0.006, 0.022, shade(f.trim ?? f.pants, 0.85), 1, 1, SOFT);
      roundCollar(b, f.outfit === 'gown' ? shade(f.top, 1.12) : '#F6F1E6', build);
      break;
    }
    case 'coat': {
      // A long coat: its skirts are two pieces that swing with the legs (`coatHalfGeometry`), open at the front with a
      // vent at the back. Here: a self belt with a buckle, lapels, a collar (or a fur stole), two rows of buttons.
      hips(b, f);
      b.add(lathe([[R * 1.02, 0.455], [R * 1.045, 0.475], [R * 1.02, 0.495]], 22), shade(f.top, 0.85), 0, 0, 0, 0, 0, 0, SOFT);
      b.rounded(0, 0.475, faceDepth(0.475, build) + 0.02, 0.05, 0.036, 0.012, 0.006, shade(f.trim ?? f.top, 1), { shade: 1, surface: 'steel' });
      const trim = f.fur ?? f.trim ?? f.top;
      if (f.fur) b.add(new THREE.TorusGeometry(R * 0.62, 0.055, 10, 22).scale(1, 0.84, 1), f.fur, 0, 0.8, 0, Math.PI / 2, 0, 0, { shade: 0.92, surface: 'fabric' });
      else {
        collar(b, trim, build);
        lapels(b, shade(f.top, 0.9), build);
      }
      for (const y of [0.64, 0.55]) for (const x of [-0.05, 0.05]) onFront(b, x, y, build, (z, ry) => b.add(new THREE.SphereGeometry(0.016, 8, 6).scale(1, 1, 0.6), trim, x, y, z + 0.004, 0, ry, 0, FLAT));
      break;
    }
    case 'jacket': {
      // A uniform jacket: a hem band just over the hips, a placket with a row of buttons, lapels under a soft collar,
      // two pocket flaps at the hips (session 62: the details that keep a uniform from reading as a flat tube).
      roll(b, 0.39, R * 0.98, 0.02, shade(f.top, 0.9), TORSO_DEPTH);
      hips(b, f);
      placket(b, shade(f.top, 0.86), build, 0.41, 0.76);
      if (f.trim) for (const y of [0.7, 0.61, 0.52]) b.sphere(0, y, faceDepth(y, build) + 0.008, 0.019, f.trim, 1, 1, FLAT);
      collar(b, shade(f.top, 0.92), build);
      lapels(b, shade(f.top, 0.84), build);
      for (const x of [-0.105, 0.105]) pocketFlap(b, x, 0.445, shade(f.top, 0.86), build, f.trim);
      break;
    }
    case 'shirt':
      roll(b, 0.39, R * 0.97, 0.018, shade(f.top, 0.92), TORSO_DEPTH);
      hips(b, f);
      collar(b, f.trim && f.trim !== f.top ? f.trim : shade(f.top, 0.95), build);
      // A button placket and a breast pocket.
      placket(b, shade(f.top, 0.9), build, 0.4, 0.76);
      for (const y of [0.69, 0.6, 0.51]) b.sphere(0, y, faceDepth(y, build) + 0.007, 0.011, '#F4F1EA', 1, 1, FLAT);
      pocketFlap(b, 0.095, 0.66, shade(f.top, 0.9), build, undefined, true);
      break;
    default:
      // A tee: its hem band over the trousers' waist and a ribbed neckline.
      roll(b, 0.385, R * 0.95, 0.018, shade(f.top, 0.9), TORSO_DEPTH);
      roll(b, 0.815, R * 0.6, 0.016, shade(f.trim && f.stripes ? f.trim : f.top, 0.88), TORSO_DEPTH);
      hips(b, f);
      break;
  }
}

/**
 * An apron that follows the body (it was a flat card in front of it): a bib curved round the chest and a skirt curved
 * round the hips or the dress's bell, a hair's breadth proud of what it covers, the front third of the way round.
 */
export function addApron(b: GeoBuilder, color: string, build: Build = 'regular', dress = false, part: 'bib' | 'skirt' | 'all' = 'all'): void {
  const R = TORSO_R[build];
  const chest = chestProfile(build);
  const at = (p: [number, number][], y: number): number => {
    for (let i = 1; i < p.length; i++) {
      const [r0, a] = p[i - 1];
      const [r1, c] = p[i];
      if (y >= Math.min(a, c) && y <= Math.max(a, c)) return c === a ? r1 : r0 + ((y - a) / (c - a)) * (r1 - r0);
    }
    return R;
  };
  const panel = (profile: [number, number][], half: number): THREE.BufferGeometry => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14, -half, half * 2);
    g.scale(1, 1, TORSO_DEPTH);
    g.deleteAttribute('uv');
    return g;
  };
  const bib: [number, number][] = [];
  for (let y = 0.5; y <= 0.721; y += 0.044) bib.push([at(chest, y) + 0.008, y]);
  if (part !== 'skirt') {
    b.add(panel(bib, 0.6), color, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'fabric', detail: 'oxford' });
    // Its waistband ties round outside whatever the waist wears (a dress's sash, a belt).
    roll(b, 0.475, R * (dress ? 1.06 : 0.98), 0.012, shade(color, 0.92), TORSO_DEPTH);
  }
  if (part === 'bib') return;
  const skirt: [number, number][] = dress
    ? [[R * 1.32 + 0.012, 0.25], [R * 1.2 + 0.012, 0.3], [R * 1.05 + 0.012, 0.4], [R * 0.97 + 0.012, 0.47]]
    : [[R * 0.98, 0.26], [R * 0.95, 0.36], [R * 0.95, 0.47]];
  b.add(panel(skirt, 0.75), color, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'fabric', detail: 'oxford' });
  // Its hem, a soft roll along the bottom edge.
  const hemR = skirt[0][0];
  const hemY = skirt[0][1];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -0.75 + (1.5 * i) / 10;
    pts.push(new THREE.Vector3(hemR * Math.sin(a), hemY, hemR * Math.cos(a) * TORSO_DEPTH));
  }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.01, 5, false), shade(color, 0.92), 0, 0, 0, 0, 0, 0, SOFT);
}

/** The chest's radius at a height (the lathe's profile), for things laid on its surface. */
function chestRadius(build: Build, y: number): number {
  const prof = chestProfile(build);
  for (let i = 1; i < prof.length; i++) {
    const [r0, a] = prof[i - 1];
    const [r1, c] = prof[i];
    if (y >= a && y <= c) return r0 + ((y - a) / (c - a)) * (r1 - r0);
  }
  return TORSO_R[build];
}

/** Lays something on the chest's front at (x, y): the surface's depth there and the turn that follows its curve. */
function onFront(b: GeoBuilder, x: number, y: number, build: Build, place: (z: number, rotY: number) => void): void {
  const r = chestRadius(build, y);
  const z = TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
  place(z, Math.atan2(x / Math.max(1e-3, r), z / Math.max(1e-3, r * TORSO_DEPTH)) * 0.9);
  void b;
}

/** A jacket's or coat's lapels: two soft tapered tabs from under the collar down to the first button. */
function lapels(b: GeoBuilder, color: string, build: Build): void {
  // A soft tapered strip from the collar's point down and in to the top button, laid on the chest.
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = 0.79 - t * 0.17;
      const x = s * (0.085 - t * 0.065);
      const r = chestRadius(build, y);
      pts.push(new THREE.Vector3(x, y, TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x)) + 0.004));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.016, 5, false);
    // Flatten it against the chest: thinner toward the body than across.
    g.scale(1, 1, 1);
    b.add(g, color, 0, 0, 0, 0, 0, 0, SOFT);
  }
}

/** A placket: a narrow raised band down the front where the garment buttons. */
function placket(b: GeoBuilder, color: string, build: Build, y0: number, y1: number): void {
  const pts: THREE.Vector3[] = [];
  for (let y = y0; y <= y1 + 1e-6; y += (y1 - y0) / 8) pts.push(new THREE.Vector3(0, y, faceDepth(y, build) + 0.003));
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.011, 5, false).scale(1.5, 1, 0.5), color, 0, 0, 0, 0, 0, 0, SOFT);
}

/** A pocket flap (or, `patch`, a breast pocket): a soft rounded tab on the front, a button on it when given. */
function pocketFlap(b: GeoBuilder, x: number, y: number, color: string, build: Build, button?: string, patch = false): void {
  onFront(b, x, y, build, (z, ry) => {
    if (patch) b.rounded(x, y - 0.02, z + 0.004, 0.07, 0.07, 0.012, 0.012, shade(color, 1.04), { shade: 1, surface: 'fabric' });
    b.rounded(x, y, z + 0.008, 0.085, 0.03, 0.014, 0.008, color, { shade: 1, surface: 'fabric' });
    if (button) b.sphere(x, y - 0.006, z + 0.016, 0.01, button, 1, 1, FLAT);
    void ry;
  });
}

/** A dress's round collar: two soft half discs either side of the throat. */
function roundCollar(b: GeoBuilder, color: string, build: Build): void {
  const y = 0.8;
  const z = faceDepth(y, build) - 0.016;
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.055, 12, 7).scale(1.1, 0.34, 0.6), color, s * 0.056, y, z, 0.3, 0, s * 0.3, SOFT);
}

/** Two soft collar points under the chin, either side of the front. */
function collar(b: GeoBuilder, color: string, build: Build): void {
  const y = 0.79;
  const z = faceDepth(y, build) - 0.012;
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.05, 12, 8).scale(1, 0.42, 0.3), color, s * 0.055, y, z, 0.35, 0, s * 0.55, SOFT);
}

/** The trousers' seat (the legs hang from the hip pivots under it) and, if worn, a belt with a buckle. */
function hips(b: GeoBuilder, f: FigureSpec): void {
  const build = f.build ?? 'regular';
  const R = TORSO_R[build];
  b.add(lathe([[0, 0.3], [R * 0.72, 0.3], [R * 0.86, 0.34], [R * 0.92, 0.4], [R * 0.9, 0.44], [0, 0.45]], 20), f.pants, 0, 0, 0, 0, 0, 0, { ...SOFT, detail: pantsCloth(f) });
  if (f.belt) {
    b.add(lathe([[R * 0.95, 0.405], [R * 0.975, 0.42], [R * 0.95, 0.435]], 22), BELT, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'leather', detail: 'leather' });
    b.rounded(0, 0.42, faceDepth(0.42, build) + 0.016, 0.045, 0.034, 0.012, 0.006, BUCKLE, { shade: 1, surface: 'steel' });
  }
}

/** The torso's crease shading (the head over the shoulders, the arms at the sides), in figure space. */
export function occludeBody(g: THREE.BufferGeometry, build: Build = 'regular'): THREE.BufferGeometry {
  return occlude(g, build, [0, 0, 0], (p) => p.x === 0 && p.y !== HEAD_Y);
}

/** The part of a lathe profile between two heights (for stripes), interpolated at the cuts. */
function slice(profile: [number, number][], y0: number, y1: number): [number, number][] {
  const at = (y: number): number => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, a] = profile[i - 1];
      const [r1, c] = profile[i];
      if ((y >= a && y <= c) || (y <= a && y >= c)) return c === a ? r1 : r0 + ((y - a) / (c - a)) * (r1 - r0);
    }
    return 0;
  };
  const out: [number, number][] = [[at(y0), y0]];
  for (const p of profile) if (p[1] > y0 && p[1] < y1 && p[0] > 0) out.push(p);
  out.push([at(y1), y1]);
  return out;
}

// ── The limbs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The figure kit's role keys (art/blender/figure_kit.py and characters/char_kit.py paint hands and shoes in pure hues;
 * each is recoloured to the look's own colour here).
 */
const FIG_BAND = { sat: [0.6, 1] as [number, number], val: [0.2, 1] as [number, number] };
function figKeys(skin: string, shoe: string, sole: string, lace: string): Recolor[] {
  return [
    { hue: [345, 15], ...FIG_BAND, ref: '#FF2A2A', to: skin },
    { hue: [105, 135], ...FIG_BAND, ref: '#2AFF2A', to: shoe },
    { hue: [225, 255], ...FIG_BAND, ref: '#2A2AFF', to: sole },
    { hue: [45, 75], ...FIG_BAND, ref: '#FFFF2A', to: lace },
  ];
}

/** A kit model placed with its top centre at (x, top, z), scaled uniformly. */
function kitAt(b: GeoBuilder, id: ModelId, x: number, top: number, z: number, scale: number, keys: Recolor[]): void {
  const e = modelEntry(id);
  b.model(id, x, top - (e.max[1] - e.min[1]) * scale, z, 0, scale, scale, scale, { recolor: keys, shade: 0.94, surface: 'matte' });
}

/**
 * Session 64: a limb's outline as one smooth lathe profile, bottom to top: the radius eased between `stations`
 * ([y, r], top first), a row every `LIMB_ROW` (dense enough to bend smoothly at the joint), and a rounded top (a
 * quarter circle of the top radius, so the shoulder or hip is round where it meets the body, with no ball).
 */
const LIMB_ROW = 0.012;
const LIMB_SIDES = 16;
function limbProfile(stations: [number, number][], domeRows = 6): [number, number][] {
  const out: [number, number][] = [];
  const bottom = stations[stations.length - 1][0];
  const top = stations[0][0];
  const radiusAt = (y: number): number => {
    for (let i = 1; i < stations.length; i++) {
      const [y0, r0] = stations[i - 1];
      const [y1, r1] = stations[i];
      if (y <= y0 && y >= y1) {
        const t = (y0 - y) / Math.max(1e-6, y0 - y1);
        return r0 + (r1 - r0) * (t * t * (3 - 2 * t));
      }
    }
    return stations[0][1];
  };
  const rows = Math.max(2, Math.ceil((top - bottom) / LIMB_ROW));
  for (let i = 0; i <= rows; i++) {
    const y = bottom + ((top - bottom) * i) / rows;
    out.push([radiusAt(y), y]);
  }
  const rTop = stations[0][1];
  for (let k = 1; k <= domeRows; k++) {
    const a = (k / domeRows) * (Math.PI / 2);
    out.push([k === domeRows ? 0 : rTop * Math.cos(a), top + rTop * Math.sin(a)]);
  }
  return out;
}

/**
 * The arm's sleeve or bare skin, from the shoulder to the wrist, as one surface (session 64): it bends at the elbow by
 * skinning (`armWeight`), its top rounds into the shoulder. A short sleeve is puffed, ends in a soft rolled hem, and
 * the bare arm runs on from inside it. The cuff and the hand ride on the forearm (`forearmGeometry`).
 */
export function upperArmGeometry(sleeve: string, skin: string, long: boolean, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const wrist = ELBOW_Y + WRIST_Y;
  if (long) {
    b.add(lathe(limbProfile([[0, SLEEVE_R], [ELBOW_Y + 0.05, FORE_SLEEVE_R * 1.01], [ELBOW_Y, FORE_SLEEVE_R], [wrist + 0.02, FORE_SLEEVE_R * 0.96]]), LIMB_SIDES, 1), sleeve, 0, 0, 0, 0, 0, 0, SOFT);
  } else {
    // The sleeve: round over the shoulder, a little fuller to its hem, a slim rolled hem with its dark inside.
    const hem = -0.105;
    b.add(lathe(limbProfile([[0, SLEEVE_R], [hem, SLEEVE_R * 1.04]]), LIMB_SIDES, 1), sleeve, 0, 0, 0, 0, 0, 0, SOFT);
    roll(b, hem, SLEEVE_R * 0.98, 0.011, shade(sleeve, 0.92));
    b.add(new THREE.CircleGeometry(SLEEVE_R * 0.98, 16), shade(sleeve, 0.6), 0, hem - 0.001, 0, Math.PI / 2, 0, 0, FLAT);
    // The bare arm, from inside the sleeve down to the wrist, tapering gently (no elbow knob).
    const arm = lathe(limbProfile([[hem + 0.03, ARM_R], [ELBOW_Y, ARM_R * 0.97], [wrist + 0.01, ARM_R * 0.88]], 0), LIMB_SIDES, 1);
    b.add(arm, skin, 0, 0, 0, 0, 0, 0, SKIN);
  }
  const g = occlude(b.build(), build, [side * shoulderX(build), SHOULDER_Y, 0], (p) => p.x * side > 0 && Math.abs(p.x) > 0.1);
  return addSkin(g, armWeight(ELBOW_Y));
}

/**
 * The cuff and the hand, from the elbow pivot (the forearm's sleeve is the arm's own surface, `upperArmGeometry`): a
 * rolled cuff on a sleeve, and the sculpted mitten hand (figure kit) with its thumb toward the body's middle. It turns
 * with the palm (the wrist's twist); the sleeve bends with the elbow and does not twist.
 */
export function forearmGeometry(sleeve: string, skin: string, long: boolean, side: 1 | -1, carry: 'briefcase' | 'handbag' | 'surfboard' | null, cuff?: string, build: Build = 'regular'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (long) {
    roll(b, WRIST_Y + 0.025, FORE_SLEEVE_R * 0.93, 0.013, cuff ?? shade(sleeve, 0.92));
    b.add(new THREE.CircleGeometry(FORE_SLEEVE_R * 0.95, 16), shade(sleeve, 0.55), 0, WRIST_Y + 0.012, 0, Math.PI / 2, 0, 0, FLAT);
  }
  // Side −1 is the figure's right (x < 0): its thumb points toward +x; the kit's right hand has its thumb toward −x.
  kitAt(b, side === 1 ? 'ch_hand_r' : 'ch_hand_l', 0, WRIST_Y + 0.035, 0.004, HAND_SCALE, figKeys(skin, skin, skin, skin));
  if (carry === 'briefcase' && side === 1) {
    b.rounded(0, HAND_Y - ELBOW_Y - 0.12, 0.02, 0.08, 0.19, 0.28, 0.035, '#6B4430', { shade: 0.9, surface: 'leather', detail: 'leather' });
    b.box(0, HAND_Y - ELBOW_Y - 0.015, 0.02, 0.024, 0.034, 0.09, '#4A2E20', 0, FLAT);
  }
  if (carry === 'surfboard' && side === 1) {
    // Session 63: a surfer's board held by its rail, stood on its tail beside them, its flat side to the body, clear of
    // the hand (it was part of the body, where the hanging arm went through it).
    const gy = GRIP[1];
    const bx = 0.095;
    b.add(new THREE.SphereGeometry(0.5, 20, 12).scale(0.05, 0.64, 0.22), '#4FA8E0', bx, gy - 0.05, 0, 0, 0, 0, { shade: 0.95, surface: 'varnish' });
    b.box(bx + 0.026, gy - 0.05, 0, 0.006, 0.54, 0.03, '#FFFFFF', 0, FLAT);
    b.box(bx + 0.026, gy + 0.0, 0, 0.006, 0.03, 0.1, '#F28C2E', 0, FLAT);
  }
  if (carry === 'handbag' && side === -1) b.rounded(0, HAND_Y - ELBOW_Y - 0.1, 0, 0.09, 0.14, 0.2, 0.045, '#C94F6D', { shade: 0.9, surface: 'leather', detail: 'leather' });
  return occlude(b.build(), build, [side * shoulderX(build), SHOULDER_Y + ELBOW_Y, 0], (p) => p.x * side > 0 && Math.abs(p.x) > 0.1);
}


/** A seam laid along a limb's side, following its outline (many points, so it bends with the skin). */
function limbSeam(b: GeoBuilder, side: 1 | -1, profile: [number, number][], y0: number, y1: number, color: string): void {
  const pts = profile.filter(([, y]) => y <= y0 && y >= y1).map(([r, y]) => new THREE.Vector3(side * (r + 0.001), y, 0));
  if (pts.length < 2) return;
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.0045, 4, false), shade(color, 0.8), 0, 0, 0, 0, 0, 0, FLAT);
}

/**
 * The leg, from the hip to the ankle, as one surface (session 64): the trouser leg down to its turned-up hem (or a
 * bare leg under a skirt, down to the sock), bending at the knee by skinning (`legWeight`), its top rounded under the
 * hips. The hem, the sock and the shoe ride on the shin (`shinGeometry`).
 */
export function thighGeometry(color: string, bare: boolean, skin: string, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const foot = -(LEG_LENGTH + KNEE_Y);
  const shoeTop = foot + 0.085;
  if (bare) {
    b.add(lathe(limbProfile([[-0.04, BARE_LEG_R], [KNEE_Y, BARE_LEG_R * 0.96], [KNEE_Y + shoeTop + 0.03, BARE_LEG_R * 0.86]]), LIMB_SIDES, 1), skin, 0, 0, 0, 0, 0, 0, SKIN);
  } else {
    const cuff = KNEE_Y + shoeTop + 0.045;
    const prof = limbProfile([[-0.03, TROUSER_R], [KNEE_Y, SHIN_R], [cuff, SHIN_R * 0.97]]);
    b.add(lathe(prof, LIMB_SIDES, 1), color, 0, 0, 0, 0, 0, 0, SOFT);
    limbSeam(b, side, prof, -0.04, cuff + 0.02, color);
  }
  const g = occlude(b.build(), build, [side * hipX(build), HIP_Y, 0], (p) => near(p, side * hipX(build), 0.2) || p.y < 0.3);
  return addSkin(g, legWeight(KNEE_Y));
}

/**
 * The ankle, from the knee pivot (the shin's trouser or skin is the leg's own surface, `thighGeometry`): the turned-up
 * hem over a sock band (or the sock on a bare leg), and the chunky clay shoe on its paler sole, or a sneaker under a tee.
 */
export function shinGeometry(color: string, shoe: string, bare: boolean, skin: string, sock: string, smart: boolean, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const foot = -(LEG_LENGTH + KNEE_Y);
  const shoeTop = foot + 0.085;
  if (bare) {
    tube(b, shoeTop + 0.04, shoeTop - 0.005, BARE_LEG_R * 1.06, BARE_LEG_R * 1.06, sock, { ...SOFT, detail: 'knit' });
  } else {
    const cuff = shoeTop + 0.045;
    // The turned-up hem: a slim roll a touch wider than the leg, its inside dark, the sock band showing under it.
    roll(b, cuff, SHIN_R * 0.95, 0.018, shade(color, 1.08));
    b.add(new THREE.CircleGeometry(SHIN_R * 0.95, 16), shade(color, 0.5), 0, cuff - 0.02, 0, Math.PI / 2, 0, 0, FLAT);
    tube(b, cuff - 0.01, shoeTop - 0.005, 0.045, 0.045, sock, { ...SOFT, detail: 'knit' }, 16);
  }
  // The clay shoe (CHARACTER_SPEC §2): a domed bean on a paler sole; dark leather on a mid sole for uniforms, coats
  // and gowns, the look's own colour on a pale sole for everyone else.
  const s = smart ? 1.08 : 1.1;
  const keys = figKeys(skin, shoe, smart ? SMART_SOLE : SOLE, shoe);
  keys[1].detail = smart ? 'leather' : 'oxford';
  b.model('ch_shoe', 0, foot, 0.03, 0, s, s, s, { recolor: keys, shade: 0.94, surface: smart ? 'leather' : 'matte' });
  // Session 62: laces across the instep (pale on everyday shoes, the shoe's own darker shade on smart ones), laid on the
  // upper's dome (art/blender/characters/char_kit.py: centre 0.044 up and 0.022 forward, radii 0.042 up, 0.114 long).
  for (const dz of [0.03, 0.058]) {
    const h = 0.044 + 0.042 * Math.sqrt(1 - (dz / 0.114) ** 2);
    b.add(new THREE.CapsuleGeometry(0.0065, 0.04, 3, 6), smart ? shade(shoe, 0.7) : '#F4F1EA', 0, foot + h * s - 0.001, 0.03 + (0.022 + dz) * s, 0, 0, Math.PI / 2, FLAT);
  }
  return occlude(b.build(), build, [side * hipX(build), HIP_Y + KNEE_Y, 0], (p) => Math.abs(p.x - side * hipX(build)) < 0.02 || p.y > 0.4);
}


// ── Clothes that move (session 62, owner: "make sure their clothing actually genuinely behaves somewhat like clothing") ──
//
// Skirts, coat tails, an apron's skirt and long hair are their own pieces, each hung from a pivot (the waist, the back of
// the head) and swung by a damped spring in CharacterView: they trail as the figure sets off, swing past as it stops,
// flick out on a turn, bounce with each step, and the coat's two halves are pushed by the legs. Each piece is built in
// figure space with soft folds and a lining, then moved so its pivot is its origin.

/** Where a skirt or a coat's tails hang from (figure space). */
export const WAIST_Y = 0.47;
export const COAT_PIVOT_Y = 0.5;

/** A lathe whose radius ripples round its circumference toward the hem: soft vertical folds, like hanging cloth. */
function foldedLathe(profile: [number, number][], folds: number, depth: number, top: number, bottom: number, phiStart = 0, phiLength = Math.PI * 2, segments = 28): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const phi = Math.atan2(x, z);
    const t = Math.max(0, Math.min(1, (top - y) / Math.max(1e-3, top - bottom)));
    const k = 1 + depth * t * t * Math.cos(phi * folds);
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.scale(1, 1, TORSO_DEPTH);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** The same surface seen from inside: a lining (the winding and normals reversed). */
function inside(g: THREE.BufferGeometry, shrink = 0.985): THREE.BufferGeometry {
  const h = g.clone();
  h.scale(shrink, 1, shrink);
  const index = h.getIndex();
  if (index) {
    const a = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  const n = h.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return h;
}

/** A soft roll along an arc of the hem (phi from a0 to a1, 0 is the front), at height y and radius r. */
function hemArc(b: GeoBuilder, y: number, r: number, a0: number, a1: number, color: string, tube = 0.016): void {
  const pts: THREE.Vector3[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a) * TORSO_DEPTH));
  }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, tube, 5, a1 - a0 >= Math.PI * 2 - 1e-3), color, 0, 0, 0, 0, 0, 0, SOFT);
}

/** A dress's or a gown's bell (and an apron's skirt over it), hung from the waist. */
export function skirtGeometry(f: FigureSpec, apron: string | null): THREE.BufferGeometry {
  return wearing(topCloth(f), () => skirt(f, apron));
}

function skirt(f: FigureSpec, apron: string | null): THREE.BufferGeometry {
  const build = f.build ?? 'regular';
  const R = TORSO_R[build];
  const b = new GeoBuilder();
  const hem = f.outfit === 'dress' ? 0.21 : 0.07;
  // Session 63: a gown is a full skirt (a walking stride stays inside its hem).
  const flare = f.outfit === 'dress' ? 1.32 : 1.52;
  const prof: [number, number][] = [[R * flare, hem + 0.012], [R * flare * 0.98, hem + 0.05], [R * 1.2, 0.3], [R * 1.05, 0.4], [R * 0.97, WAIST_Y + 0.005]];
  const bell = foldedLathe(prof, 9, 0.045, WAIST_Y, hem);
  b.add(bell, f.pants, 0, 0, 0, 0, 0, 0, SOFT);
  b.add(inside(bell), shade(f.pants, 0.62), 0, 0, 0, 0, 0, 0, SOFT);
  hemArc(b, hem + 0.012, R * flare * 0.995, 0, Math.PI * 2, shade(f.pants, 0.92));
  if (apron) {
    // The apron over the front of the bell, a hair proud of it and folded with it, shorter than the dress.
    const radiusAt = (y: number): number => {
      for (let i = 1; i < prof.length; i++) {
        const [r0, a] = prof[i - 1];
        const [r1, c] = prof[i];
        if (y >= a && y <= c) return r0 + ((y - a) / (c - a)) * (r1 - r0);
      }
      return R;
    };
    const top = WAIST_Y - 0.005;
    const low = hem + 0.06;
    const ap: [number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const y = low + ((top - low) * i) / 5;
      ap.push([radiusAt(y) + 0.012, y]);
    }
    b.add(foldedLathe(ap, 9, 0.045, WAIST_Y, hem, -0.75, 1.5, 14), apron, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'fabric', detail: 'oxford' });
    hemArc(b, low + 0.004, radiusAt(low) + 0.012, -0.75, 0.75, shade(apron, 0.92), 0.01);
  }
  const g = occlude(b.build(), build, [0, 0, 0], (p) => p.x === 0 && p.y !== HEAD_Y);
  g.translate(0, -WAIST_Y, 0);
  return g;
}

/** One half of a long coat's skirts (side +1 is +x), open at the front, vented at the back, lined, hung at the waist. */
export function coatHalfGeometry(f: FigureSpec, side: 1 | -1, lining: string): THREE.BufferGeometry {
  return wearing(topCloth(f), () => coatHalf(f, side, lining));
}

function coatHalf(f: FigureSpec, side: 1 | -1, lining: string): THREE.BufferGeometry {
  const build = f.build ?? 'regular';
  const R = TORSO_R[build];
  const b = new GeoBuilder();
  const gap = 0.07;
  const phi0 = side > 0 ? gap : Math.PI + 0.01;
  const len = Math.PI - gap - 0.01;
  // Session 63: the hem just above the knee (a running heel swept through the lowest few centimetres of a longer one).
  const hem = 0.27;
  const prof: [number, number][] = [[R * 1.2, hem], [R * 1.15, 0.31], [R * 1.06, 0.4], [R * 1.01, 0.47], [R * 0.99, COAT_PIVOT_Y + 0.01]];
  const shell = foldedLathe(prof, 7, 0.035, COAT_PIVOT_Y, hem, phi0, len, 16);
  b.add(shell, f.top, 0, 0, 0, 0, 0, 0, SOFT);
  b.add(inside(shell), lining, 0, 0, 0, 0, 0, 0, SOFT);
  hemArc(b, hem + 0.004, R * 1.215, phi0, phi0 + len, shade(f.top, 0.9));
  // A pocket flap low on the front of each half.
  const a = side > 0 ? 0.62 : -0.62;
  const r = R * 1.07;
  b.add(new THREE.BoxGeometry(0.085, 0.028, 0.012), shade(f.top, 0.86), r * Math.sin(a), 0.36, r * Math.cos(a) * TORSO_DEPTH + 0.008, 0, a * 0.85, 0, SOFT);
  const g = occlude(b.build(), build, [0, 0, 0], (p) => p.x === 0 && p.y !== HEAD_Y);
  g.translate(0, -COAT_PIVOT_Y, 0);
  return g;
}

/** An apron's skirt over trousers, hung from the waistband (the bib stays on the body). */
export function apronFlapGeometry(color: string, build: Build = 'regular'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  wearing('oxford', () => addApron(b, color, build, false, 'skirt'));
  const g = b.build();
  g.translate(0, -WAIST_Y, 0);
  return g;
}

/** The pivot (head-centre space) a swinging hair piece hangs from: the back of the head, a little below its middle. */
export const HAIR_PIVOT: Record<'long' | 'ponytail', [number, number, number]> = { long: [0, -0.02, -0.14], ponytail: [0, 0.06, -0.2] };

/** Long hair or a ponytail as its own piece (head-centre space, moved so its pivot is the origin); null otherwise. */
export function hairPieceGeometry(f: FigureSpec): THREE.BufferGeometry | null {
  const kind = f.hairStyle === 'long' ? 'long' : f.hairStyle === 'ponytail' && !f.hatted ? 'ponytail' : null;
  if (!kind) return null;
  const b = new GeoBuilder();
  atOrigin(b, kind === 'long' ? 'ch_hair_long' : 'ch_hair_tail', 0, 0, 0, 1, [
    ...HEAD_KEYS(f.skin, f.hair),
    { hue: [285, 315], sat: [0.6, 1], val: [0.2, 1], ref: '#FF2AFF', to: shade(f.top, 1) },
  ], 0.97);
  const g = b.build();
  // Session 63 ("zero clip ins"): where the hair falls past the collar it lies on the back and shoulders, never in them:
  // any part of it inside the torso (plus a finger's breadth) is lifted straight out from the body's axis.
  const chest = chestProfile(f.build ?? 'regular');
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + HEAD_Y;
    if (y > chest[chest.length - 1][1]) continue;
    const r = profileAt(chest, y) + HAIR_LIE;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const e = Math.hypot(x, z / TORSO_DEPTH);
    if (e < r && e > 1e-4) pos.setXYZ(i, (x * r) / e, pos.getY(i), (z * r) / e);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  const p = HAIR_PIVOT[kind];
  g.translate(-p[0], -p[1], -p[2]);
  return g;
}

/** How far clear of the torso long hair lies (it swings out from there, never in: CharacterView's hair spring). */
const HAIR_LIE = 0.022;

/** A lathe profile's radius at a height (straight lines between its points). */
function profileAt(p: [number, number][], y: number): number {
  for (let i = 1; i < p.length; i++) {
    const [r0, a] = p[i - 1];
    const [r1, c] = p[i];
    if (y >= a && y <= c) return c === a ? Math.max(r0, r1) : r0 + ((y - a) / (c - a)) * (r1 - r0);
  }
  return 0;
}

/** The soft felt hats (art/blender/characters/char_kit.py), placed on the head (head-centre at HEAD_Y). */
export type FeltHat = 'conductor' | 'bowler' | 'boater' | 'pillbox' | 'beanie' | 'tophat' | 'toque' | 'cap';
const HAT_CLOTH: Record<FeltHat, DetailName> = { conductor: 'felt', bowler: 'felt', boater: 'straw', pillbox: 'felt', beanie: 'knit', tophat: 'felt', toque: 'oxford', cap: 'twill' };

export function addHat(b: GeoBuilder, kind: FeltHat, c: { crown: string; band: string; peak: string; trim: string }): void {
  const keys: Recolor[] = [
    // Session 63: felt crowns (a knitted beanie, a straw boater, a cotton cap and toque), a ribbon band, a felt brim.
    { hue: [105, 135], sat: [0.6, 1], val: [0.2, 1], ref: '#2AFF2A', to: c.crown, detail: HAT_CLOTH[kind] },
    { hue: [225, 255], sat: [0.6, 1], val: [0.2, 1], ref: '#2A2AFF', to: c.band, detail: kind === 'beanie' ? 'knit' : 'oxford' },
    { hue: [45, 75], sat: [0.6, 1], val: [0.2, 1], ref: '#FFFF2A', to: c.peak, detail: kind === 'boater' ? 'straw' : kind === 'conductor' || kind === 'cap' ? 'leather' : HAT_CLOTH[kind] },
    { hue: [285, 315], sat: [0.6, 1], val: [0.2, 1], ref: '#FF2AFF', to: c.trim, surface: { roughness: 0.32, metalness: kind === 'conductor' || kind === 'pillbox' ? 1 : 0 } },
  ];
  atOrigin(b, `ch_hat_${kind}` as ModelId, 0, HEAD_Y, 0, 1, keys, 0.95, 'fabric');
}
