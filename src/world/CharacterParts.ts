import * as THREE from 'three';
import { GeoBuilder, type PartStyle } from './geo';
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
export type { Build, HairStyle, Outfit };

/** Torso radius at the belly by build (CHARACTER_SPEC §2: 0.82, 0.95 and 1.12 of the head's 0.42 m width). */
const TORSO_R: Record<Build, number> = { slim: 0.172, regular: 0.2, stout: 0.235 };
/** The shoulder pivots stand just inside the torso's side, the hips under its round. */
export function shoulderX(build: Build = 'regular'): number {
  return TORSO_R[build] + 0.008;
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

const SOFT: PartStyle = { shade: 0.9, surface: 'fabric' };
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
  b.add(new THREE.TorusGeometry(r, tube, 5, 16).scale(1, depth, 1), color, 0, y, z, Math.PI / 2, 0, 0, SOFT);
}

/** A tube down the y axis from `y0` to `y1` (y1 < y0), open-ended (caps are the joints' spheres). */
function tube(b: GeoBuilder, y0: number, y1: number, r0: number, r1: number, color: string, style: PartStyle = SOFT, segments = 12): void {
  b.add(new THREE.CylinderGeometry(r0, r1, y0 - y1, segments, 1, true), color, 0, (y0 + y1) / 2, 0, 0, 0, 0, style);
}

/** A joint cap: a sphere of the tube's radius at a pivot, so a bend stays a continuous round outline. */
function joint(b: GeoBuilder, y: number, r: number, color: string, style: PartStyle = SOFT): void {
  b.add(new THREE.SphereGeometry(r, 12, 7), color, 0, y, 0, 0, 0, 0, style);
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

const HEAD_KEYS = (skin: string, hair: string): Recolor[] => [
  { hue: [345, 15], sat: [0.6, 1], val: [0.2, 1], ref: '#FF2A2A', to: skin },
  { hue: [45, 75], sat: [0.6, 1], val: [0.2, 1], ref: '#FFFF2A', to: hair },
];

/** Which Blender head: the hairdo's own helmet, or hair pressed flat under a hat that covers the crown. */
function headModel(f: FigureSpec): ModelId {
  const flat = f.hatted && (f.hairStyle === 'short' || f.hairStyle === 'side' || f.hairStyle === 'quiff' || f.hairStyle === 'curly');
  return (flat ? 'ch_head_hat' : `ch_head_${f.hairStyle}`) as ModelId;
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
  return f.moustache ? 0.036 : 0.028;
}

/** The head, its hair helmet and ears (Blender), and the face. */
export function addHead(b: GeoBuilder, f: FigureSpec): void {
  atOrigin(b, headModel(f), 0, HEAD_Y, 0, 1, HEAD_KEYS(f.skin, f.hair), 0.97);
  // The face (CHARACTER_SPEC §3): wide-set blue ovals at the head's middle, a bulb nose, a small red mouth.
  const ey = -0.012;
  for (const x of [-0.08, 0.08]) {
    b.add(new THREE.SphereGeometry(0.028, 8, 6).scale(0.9, 1.35, 0.42), EYE, x, HEAD_Y + ey, faceZ(x, ey) - 0.003, 0, 0, 0, FLAT);
  }
  const nr = noseRadius(f);
  const ny = -0.062;
  b.add(new THREE.SphereGeometry(nr, 10, 7).scale(1, 0.92, 0.9), f.skin, 0, HEAD_Y + ny, faceZ(0, ny) + nr * 0.12, 0, 0, 0, SKIN);
  const my = f.moustache ? -0.128 : -0.112;
  b.add(new THREE.SphereGeometry(0.03, 8, 5).scale(1.1, 0.42, 0.4), LIPS, 0, HEAD_Y + my, faceZ(0, my) - 0.002, 0, 0, 0, FLAT);
  if (f.moustache) {
    // A soft dark bar under the nose: two lobes meeting in the middle, tips turned down.
    for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.042, 8, 6).scale(1.25, 0.52, 0.62), f.hair, s * 0.036, HEAD_Y - 0.094, faceZ(s * 0.036, -0.094) + 0.006, 0, 0, s * -0.28, FLAT);
  }
  if (f.glasses) {
    for (const x of [-0.08, 0.08]) b.add(new THREE.TorusGeometry(0.05, 0.009, 6, 18), '#3A3F8C', x, HEAD_Y + ey, faceZ(x, ey) + 0.016, 0, 0, 0, FLAT);
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
      // One smooth bell from the waist to the knee (or the ankle), its hem a soft roll.
      const hem = f.outfit === 'dress' ? 0.21 : 0.07;
      const flare = f.outfit === 'dress' ? 1.32 : 1.38;
      b.add(lathe([[R * 0.97, 0.47], [R * 1.05, 0.4], [R * 1.2, 0.3], [R * flare, hem + 0.02], [0, hem]].reverse() as [number, number][], 22), f.pants, 0, 0, 0, 0, 0, 0, SOFT);
      roll(b, hem + 0.012, R * flare * 0.99, 0.016, shade(f.pants, 0.92), TORSO_DEPTH);
      break;
    }
    case 'coat': {
      // A long coat to the knee over the trousers, its hem a roll; a collar (or a fur stole) and two buttons.
      b.add(lathe([[0, 0.24], [R * 1.12, 0.24], [R * 1.08, 0.33], [R * 1.02, 0.44], [R, 0.5]], 22), f.top, 0, 0, 0, 0, 0, 0, SOFT);
      roll(b, 0.25, R * 1.11, 0.016, shade(f.top, 0.9), TORSO_DEPTH);
      hips(b, f);
      const trim = f.fur ?? f.trim ?? f.top;
      if (f.fur) b.add(new THREE.TorusGeometry(R * 0.62, 0.055, 10, 22).scale(1, 0.84, 1), f.fur, 0, 0.8, 0, Math.PI / 2, 0, 0, { shade: 0.92, surface: 'fabric' });
      else collar(b, trim, build);
      for (const y of [0.62, 0.52]) b.sphere(0, y, faceDepth(y, build) + 0.004, 0.018, trim, 1, 1, FLAT);
      break;
    }
    case 'jacket': {
      // A uniform jacket: a hem band just over the hips, a row of buttons, a soft collar.
      roll(b, 0.39, R * 0.98, 0.02, shade(f.top, 0.9), TORSO_DEPTH);
      hips(b, f);
      if (f.trim) for (const y of [0.7, 0.61, 0.52]) b.sphere(0, y, faceDepth(y, build) + 0.004, 0.019, f.trim, 1, 1, FLAT);
      collar(b, shade(f.top, 0.92), build);
      break;
    }
    case 'shirt':
      roll(b, 0.39, R * 0.97, 0.018, shade(f.top, 0.92), TORSO_DEPTH);
      hips(b, f);
      collar(b, f.trim && f.trim !== f.top ? f.trim : shade(f.top, 0.95), build);
      break;
    default:
      // A tee: its hem band over the trousers' waist.
      roll(b, 0.385, R * 0.95, 0.018, shade(f.top, 0.9), TORSO_DEPTH);
      hips(b, f);
      break;
  }
}

/**
 * An apron that follows the body (it was a flat card in front of it): a bib curved round the chest and a skirt curved
 * round the hips or the dress's bell, a hair's breadth proud of what it covers, the front third of the way round.
 */
export function addApron(b: GeoBuilder, color: string, build: Build = 'regular', dress = false): void {
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
  b.add(panel(bib, 0.6), color, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'fabric' });
  const skirt: [number, number][] = dress
    ? [[R * 1.32 + 0.012, 0.25], [R * 1.2 + 0.012, 0.3], [R * 1.05 + 0.012, 0.4], [R * 0.97 + 0.012, 0.47]]
    : [[R * 0.98, 0.26], [R * 0.95, 0.36], [R * 0.95, 0.47]];
  b.add(panel(skirt, 0.75), color, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'fabric' });
  roll(b, 0.475, R * 0.98, 0.012, shade(color, 0.92), TORSO_DEPTH);
}

/** Two soft collar points under the chin, either side of the front. */
function collar(b: GeoBuilder, color: string, build: Build): void {
  const y = 0.79;
  const z = faceDepth(y, build) - 0.012;
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.05, 10, 7).scale(1, 0.42, 0.3), color, s * 0.055, y, z, 0.35, 0, s * 0.55, SOFT);
}

/** The trousers' seat (the legs hang from the hip pivots under it) and, if worn, a belt with a buckle. */
function hips(b: GeoBuilder, f: FigureSpec): void {
  const build = f.build ?? 'regular';
  const R = TORSO_R[build];
  b.add(lathe([[0, 0.3], [R * 0.72, 0.3], [R * 0.86, 0.34], [R * 0.92, 0.4], [R * 0.9, 0.44], [0, 0.45]], 20), f.pants, 0, 0, 0, 0, 0, 0, SOFT);
  if (f.belt) {
    b.add(lathe([[R * 0.95, 0.405], [R * 0.975, 0.42], [R * 0.95, 0.435]], 22), BELT, 0, 0, 0, 0, 0, 0, { shade: 1, surface: 'leather' });
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

/** The upper arm, from the shoulder pivot to the elbow: a long sleeve, or a puffed short sleeve with a rolled cuff. */
export function upperArmGeometry(sleeve: string, skin: string, long: boolean, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // The shoulder: a ball of the sleeve's radius at the pivot, so the arm swings out of a round shoulder.
  joint(b, 0, SLEEVE_R, sleeve);
  if (long) {
    tube(b, 0, ELBOW_Y, SLEEVE_R, FORE_SLEEVE_R, sleeve);
    joint(b, ELBOW_Y, FORE_SLEEVE_R, sleeve);
  } else {
    tube(b, 0, -0.105, SLEEVE_R, SLEEVE_R * 1.04, sleeve);
    roll(b, -0.105, SLEEVE_R * 0.94, 0.016, shade(sleeve, 0.92));
    b.add(new THREE.CircleGeometry(SLEEVE_R * 0.96, 12), shade(sleeve, 0.6), 0, -0.106, 0, Math.PI / 2, 0, 0, FLAT);
    tube(b, -0.09, ELBOW_Y, ARM_R, ARM_R * 0.98, skin, SKIN);
    joint(b, ELBOW_Y, ARM_R * 0.98, skin, SKIN);
  }
  return occlude(b.build(), build, [side * shoulderX(build), SHOULDER_Y, 0], (p) => p.x * side > 0 && Math.abs(p.x) > 0.1);
}

/**
 * The forearm and hand, from the elbow pivot: the sleeve or bare arm down to the wrist, a rolled cuff on a sleeve, and
 * the sculpted mitten hand (figure kit) with its thumb toward the body's middle.
 */
export function forearmGeometry(sleeve: string, skin: string, long: boolean, side: 1 | -1, carry: 'briefcase' | 'handbag' | null, cuff?: string, build: Build = 'regular'): THREE.BufferGeometry {
  const b = new GeoBuilder();
  // The elbow's ball is the upper arm's (a sphere looks the same however the forearm turns about its centre).
  if (long) {
    tube(b, 0, WRIST_Y + 0.02, FORE_SLEEVE_R, FORE_SLEEVE_R * 0.96, sleeve);
    roll(b, WRIST_Y + 0.025, FORE_SLEEVE_R * 0.92, 0.018, cuff ?? shade(sleeve, 0.92));
    b.add(new THREE.CircleGeometry(FORE_SLEEVE_R * 0.95, 12), shade(sleeve, 0.55), 0, WRIST_Y + 0.012, 0, Math.PI / 2, 0, 0, FLAT);
  } else {
    tube(b, 0, WRIST_Y + 0.01, ARM_R * 0.98, ARM_R * 0.9, skin, SKIN);
  }
  // Side −1 is the figure's right (x < 0): its thumb points toward +x; the kit's right hand has its thumb toward −x.
  kitAt(b, side === 1 ? 'ch_hand_r' : 'ch_hand_l', 0, WRIST_Y + 0.035, 0.004, HAND_SCALE, figKeys(skin, skin, skin, skin));
  if (carry === 'briefcase' && side === 1) {
    b.rounded(0, HAND_Y - ELBOW_Y - 0.12, 0.02, 0.08, 0.19, 0.28, 0.035, '#6B4430', { shade: 0.9, surface: 'leather' });
    b.box(0, HAND_Y - ELBOW_Y - 0.015, 0.02, 0.024, 0.034, 0.09, '#4A2E20', 0, FLAT);
  }
  if (carry === 'handbag' && side === -1) b.rounded(0, HAND_Y - ELBOW_Y - 0.1, 0, 0.09, 0.14, 0.2, 0.045, '#C94F6D', { shade: 0.9, surface: 'leather' });
  return occlude(b.build(), build, [side * shoulderX(build), SHOULDER_Y + ELBOW_Y, 0], (p) => p.x * side > 0 && Math.abs(p.x) > 0.1);
}

/** The thigh, from the hip pivot to the knee: trousers, or a bare leg under a skirt. */
export function thighGeometry(color: string, bare: boolean, skin: string, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (bare) {
    tube(b, -0.04, KNEE_Y, BARE_LEG_R, BARE_LEG_R * 0.96, skin, SKIN);
    joint(b, KNEE_Y, BARE_LEG_R * 0.96, skin, SKIN);
  } else {
    joint(b, -0.03, TROUSER_R, color);
    tube(b, -0.03, KNEE_Y, TROUSER_R, SHIN_R, color);
    joint(b, KNEE_Y, SHIN_R, color);
  }
  return occlude(b.build(), build, [side * hipX(build), HIP_Y, 0], (p) => near(p, side * hipX(build), 0.2) || p.y < 0.3);
}

/**
 * The shin and shoe, from the knee pivot: the trouser leg ending in a rolled cuff over a sock band (or a bare leg and a
 * sock), and the chunky clay shoe on its paler sole, or a sneaker under a tee.
 */
export function shinGeometry(color: string, shoe: string, bare: boolean, skin: string, sock: string, smart: boolean, build: Build = 'regular', side: 1 | -1 = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const foot = -(LEG_LENGTH + KNEE_Y);
  const shoeTop = foot + 0.085;
  // The knee's ball is the thigh's.
  if (bare) {
    tube(b, 0, shoeTop + 0.03, BARE_LEG_R * 0.96, BARE_LEG_R * 0.86, skin, SKIN);
    tube(b, shoeTop + 0.04, shoeTop - 0.005, BARE_LEG_R * 1.06, BARE_LEG_R * 1.06, sock, SOFT);
  } else {
    const cuff = shoeTop + 0.045;
    tube(b, 0, cuff, SHIN_R, SHIN_R * 0.97, color);
    // The turned-up hem: a roll a touch wider than the leg, its inside dark, the sock band showing under it.
    roll(b, cuff, SHIN_R * 0.95, 0.024, shade(color, 1.08));
    b.add(new THREE.CircleGeometry(SHIN_R * 0.95, 12), shade(color, 0.5), 0, cuff - 0.02, 0, Math.PI / 2, 0, 0, FLAT);
    tube(b, cuff - 0.01, shoeTop - 0.005, 0.045, 0.045, sock, SOFT, 12);
  }
  // The clay shoe (CHARACTER_SPEC §2): a domed bean on a paler sole; dark leather on a mid sole for uniforms, coats
  // and gowns, the look's own colour on a pale sole for everyone else.
  const s = smart ? 1.08 : 1.1;
  b.model('ch_shoe', 0, foot, 0.03, 0, s, s, s, { recolor: figKeys(skin, shoe, smart ? SMART_SOLE : SOLE, shoe), shade: 0.94, surface: smart ? 'leather' : 'matte' });
  return occlude(b.build(), build, [side * hipX(build), HIP_Y + KNEE_Y, 0], (p) => Math.abs(p.x - side * hipX(build)) < 0.02 || p.y > 0.4);
}
