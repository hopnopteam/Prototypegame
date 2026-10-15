import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder, type PartStyle } from './geo';

/**
 * The people's art direction (session 30, owner: "the player model and NPC models… have no proper form and actual art
 * direction", with reference sheets of soft toy-like figures). Every person is built from the same few rounded forms:
 *
 * - a big, softly squared head (a superellipsoid, not a ball) with ears, two small dark oval eyes set wide, a button
 *   nose and a small red mouth; no blush, no outline;
 * - hair as one chunky cap that grows out of the skull (one deformed shell per hairdo, so the hairline is a clean line
 *   where the shell meets the head and nothing floats);
 * - a short tee or shirt torso (a lathe, so it is round and soft), short puffed sleeves or long ones, a long coat or a
 *   dress where the type calls for it;
 * - thin arms ending in round mitten hands, legs in trousers or bare under a skirt with a sock, and chunky sneakers
 *   with a pale sole.
 *
 * Proportions follow the references: the head is about a third of the height, the legs a little longer than the
 * torso, the hands reach the top of the thigh. Everything is smooth-shaded vertex colour on the shared character
 * material, so a crowd stays one draw (CharacterBatch).
 */

export const HIP_Y = 0.42;
export const SHOULDER_Y = 0.75;
export const SHOULDER_X = 0.158;
export const HEAD_Y = 1.0;
/** Head half-sizes (width, height, depth) and the squareness of its superellipsoid (2 is a ball). */
export const HEAD = { a: 0.205, b: 0.198, c: 0.19, n: 2.6 };
export const HEAD_TOP = HEAD_Y + HEAD.b;
/** The torso is a lathe squashed front to back by this much. */
const TORSO_DEPTH = 0.8;
/** Where the hand ends, below the shoulder pivot (arm length). */
export const HAND_Y = -0.335;
/** The leg's length below the hip pivot, to the sole. */
export const LEG_LENGTH = HIP_Y;

import type { HairStyle, Outfit } from '../config/crowd';
export type { HairStyle, Outfit };

const SOFT: PartStyle = { shade: 0.88 };
const FLAT: PartStyle = { shade: 1 };
const EYE = '#1F2B57';
const LIPS = '#C24E56';
const SOLE = '#F2EEE6';

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Radial distance to the head's surface along a unit direction. */
function headRadius(ux: number, uy: number, uz: number): number {
  const { a, b, c, n } = HEAD;
  const k = Math.abs(ux / a) ** n + Math.abs(uy / b) ** n + Math.abs(uz / c) ** n;
  return k > 0 ? k ** (-1 / n) : 0;
}

/** The z of the face's surface at (x, y) (head space, y measured from the head's centre). */
export function faceZ(x: number, y: number): number {
  const { a, b, c, n } = HEAD;
  const k = 1 - Math.abs(x / a) ** n - Math.abs(y / b) ** n;
  return k > 0 ? c * k ** (1 / n) : 0;
}

/** A unit sphere with welded seams, so a deformed copy shades smoothly all round. */
function weldedSphere(widthSegments: number, heightSegments: number): THREE.BufferGeometry {
  const s = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  s.deleteAttribute('uv');
  s.deleteAttribute('normal');
  const g = mergeVertices(s, 1e-5);
  s.dispose();
  return g;
}

/** A sphere pushed onto `radius(ux, uy, uz)`, normals smoothed after. */
function deformed(widthSegments: number, heightSegments: number, radius: (ux: number, uy: number, uz: number) => number): THREE.BufferGeometry {
  const g = weldedSphere(widthSegments, heightSegments);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = radius(x, y, z);
    p.setXYZ(i, x * r, y * r, z * r);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * How much hair covers the skull in a direction (0 bare, 1 full), and how far it stands off it. The shell is drawn a
 * little inside the skull where it is bare, so it disappears under the skin with a clean hairline.
 */
function hairCover(style: HairStyle, ux: number, uy: number, uz: number): number {
  const side = Math.abs(ux);
  switch (style) {
    case 'bald': {
      // A horseshoe of hair round the back and over the ears, the crown bare.
      const band = smoothstep(-0.55, -0.42, uy) * (1 - smoothstep(0.12, 0.26, uy));
      return band * (1 - smoothstep(0.05, 0.3, uz));
    }
    case 'bob':
    case 'long': {
      // To the jaw at the sides and back, a straight fringe over the forehead; the face stays open.
      const face = smoothstep(0.3, 0.62, uz) * (1 - smoothstep(0.62, 0.86, side));
      const line = -0.62 + (0.4 + 0.62) * face;
      return smoothstep(line - 0.06, line + 0.04, uy);
    }
    default: {
      // Short hair: down to the nape at the back, above the ears at the sides, a hairline high on the forehead.
      const back = smoothstep(-0.65, 0.05, uz);
      let line = -0.55 + (0.12 + 0.55) * back;
      const front = smoothstep(0.22, 0.72, uz);
      let fringe = style === 'side' ? 0.46 - 0.2 * smoothstep(-0.3, 0.6, ux) : style === 'bun' ? 0.36 : 0.44 - 0.06 * side;
      if (style === 'curly') fringe = 0.4;
      line += (fringe - line) * front;
      return smoothstep(line - 0.05, line + 0.05, uy);
    }
  }
}

function hairThickness(style: HairStyle, ux: number, uy: number, uz: number): number {
  const top = Math.max(0, uy);
  switch (style) {
    case 'bald':
      return 0.07;
    case 'curly':
      // Lumpy curls all over.
      return 0.12 + top * 0.06 + 0.035 * Math.sin(ux * 11) * Math.sin(uy * 9 + 1) * Math.sin(uz * 10 + 2);
    case 'quiff':
      // A swept-up wave over the forehead.
      return 0.1 + top * 0.06 + 0.12 * smoothstep(0.1, 0.7, uz) * smoothstep(0.35, 0.8, uy);
    case 'bob':
    case 'long':
      return 0.1 + top * 0.06 + 0.04 * smoothstep(0.0, -0.5, uy);
    default:
      return 0.09 + top * 0.07;
  }
}

const headCache = new Map<string, THREE.BufferGeometry>();

/** The bare head (shared shape), positioned at the origin. */
function headShape(): THREE.BufferGeometry {
  let g = headCache.get('head');
  if (!g) {
    g = deformed(22, 16, headRadius);
    headCache.set('head', g);
  }
  return g.clone();
}

function hairShape(style: HairStyle, hatted: boolean): THREE.BufferGeometry {
  const key = `${style}:${hatted}`;
  let g = headCache.get(key);
  if (!g) {
    // Under a hat the hair lies flat (the hat sits on it), so nothing pokes through the crown.
    // A flat layer still stands clear of the skull (a hair's breadth would flicker against it).
    g = deformed(30, 22, (ux, uy, uz) => {
      const c = hairCover(style, ux, uy, uz);
      const t = hatted ? 0.035 + hairThickness(style, ux, uy, uz) * 0.12 : hairThickness(style, ux, uy, uz);
      return headRadius(ux, uy, uz) * (0.86 + c * (0.14 + t));
    });
    headCache.set(key, g);
  }
  return g.clone();
}

/** A lathe round the y axis from [radius, height] pairs, its seam at the back, squashed front to back. */
function lathe(profile: [number, number][], segments = 18, depth = TORSO_DEPTH): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, Math.PI, Math.PI * 2);
  g.scale(1, 1, depth);
  g.deleteAttribute('uv');
  return g;
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
  /** A hat sits on the hair: the hair lies flat under it. */
  hatted?: boolean;
}

/** The head, face and hair. */
export function addHead(b: GeoBuilder, f: FigureSpec): void {
  b.add(headShape(), f.skin, 0, HEAD_Y, 0, 0, 0, 0, { shade: 0.86 });
  const open = f.hairStyle !== 'bob' && f.hairStyle !== 'long';
  if (open) {
    // Ears: round and a little forward of centre, so they read from the three-quarter view.
    for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.05, 10, 8).scale(0.55, 1, 0.8), f.skin, s * 0.2, HEAD_Y - 0.02, 0.01, 0, 0, 0, SOFT);
  }
  b.add(hairShape(f.hairStyle, f.hatted ?? false), f.hair, 0, HEAD_Y, 0, 0, 0, 0, { shade: 0.84 });
  if (f.hairStyle === 'bun') b.sphere(0, HEAD_Y + 0.15, -0.16, 0.085, f.hair, 2, 1, { shade: 0.86 });
  if (f.hairStyle === 'long') b.rounded(0, HEAD_Y - 0.17, -0.12, 0.36, 0.3, 0.13, 0.06, f.hair, { shade: 0.84 });

  // The face: small dark ovals for eyes set wide and low, a button nose, a small red mouth.
  for (const x of [-0.078, 0.078]) b.add(new THREE.SphereGeometry(0.024, 10, 8).scale(0.78, 1.3, 0.45), EYE, x, HEAD_Y - 0.005, faceZ(x, -0.005) - 0.002, 0, 0, 0, FLAT);
  b.add(new THREE.SphereGeometry(0.03, 10, 8).scale(1, 0.9, 0.8), f.skin, 0, HEAD_Y - 0.055, faceZ(0, -0.055) + 0.008, 0, 0, 0, { shade: 0.94 });
  b.add(new THREE.SphereGeometry(0.03, 10, 6).scale(0.85, 0.42, 0.4), LIPS, 0, HEAD_Y - 0.112, faceZ(0, -0.112) - 0.002, 0, 0, 0, FLAT);
  if (f.moustache) {
    for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.04, 10, 6).scale(1.25, 0.5, 0.6), f.hair, s * 0.04, HEAD_Y - 0.083, faceZ(0, -0.083) + 0.004, 0, 0, s * -0.3, FLAT);
  }
  if (f.glasses) {
    for (const x of [-0.078, 0.078]) b.add(new THREE.TorusGeometry(0.044, 0.008, 6, 16), '#2B2733', x, HEAD_Y - 0.005, faceZ(x, -0.005) + 0.012, 0, 0, 0, FLAT);
    b.box(0, HEAD_Y + 0.005, faceZ(0, 0.005) + 0.012, 0.07, 0.01, 0.01, '#2B2733', 0, FLAT);
  }
}

/** The torso, its hem, and whatever covers the hips (trousers, a skirt, a coat's tails). */
export function addTorso(b: GeoBuilder, f: FigureSpec): void {
  const chest: [number, number][] = [[0, 0.43], [0.138, 0.43], [0.15, 0.47], [0.155, 0.56], [0.15, 0.66], [0.138, 0.73], [0.112, 0.785], [0.068, 0.81], [0, 0.815]];
  if (f.stripes && f.trim) {
    // A striped tee: the same lathe cut into bands of the two colours.
    const bands: [number, number][] = [[0.43, 0.52], [0.52, 0.555], [0.555, 0.6], [0.6, 0.635], [0.635, 0.68], [0.68, 0.815]];
    bands.forEach(([y0, y1], i) => b.add(lathe(slice(chest, y0, y1)), i % 2 === 1 ? f.trim! : f.top, 0, 0, 0, 0, 0, 0, SOFT));
  } else {
    b.add(lathe(chest), f.top, 0, 0, 0, 0, 0, 0, SOFT);
  }
  // A short neck so the head sits on the shoulders rather than in them.
  b.cylinder(0, 0.82, 0, 0.055, 0.06, 0.06, f.skin, 12, 'y', SOFT);

  switch (f.outfit) {
    case 'dress':
      // A skirt to the knee, flaring from the waist.
      b.add(lathe([[0.15, 0.47], [0.17, 0.4], [0.2, 0.3], [0.215, 0.22], [0, 0.22]].reverse() as [number, number][], 18), f.pants, 0, 0, 0, 0, 0, 0, SOFT);
      break;
    case 'gown':
      // A long skirt to the ankle.
      b.add(lathe([[0.15, 0.47], [0.17, 0.38], [0.2, 0.22], [0.225, 0.08], [0, 0.08]].reverse() as [number, number][], 18), f.pants, 0, 0, 0, 0, 0, 0, SOFT);
      break;
    case 'coat': {
      // A long coat to the knee over the trousers, a collar and two buttons in the trim colour.
      b.add(lathe([[0, 0.25], [0.19, 0.25], [0.178, 0.34], [0.165, 0.44], [0.16, 0.5]], 18), f.top, 0, 0, 0, 0, 0, 0, SOFT);
      hips(b, f);
      const trim = f.fur ?? f.trim ?? f.top;
      if (f.fur) b.add(new THREE.TorusGeometry(0.12, 0.05, 8, 18).scale(1, 1, 0.82), f.fur, 0, 0.79, 0, Math.PI / 2, 0, 0, { shade: 0.92 });
      else for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(0.06, 0.16, 0.02), trim, s * 0.05, 0.72, 0.112, -0.12, s * 0.25, s * 0.35, FLAT);
      for (const y of [0.6, 0.5]) b.sphere(0, y, faceDepth(y) + 0.004, 0.016, trim, 0, 1, FLAT);
      break;
    }
    case 'jacket': {
      // A uniform jacket: a hem just over the hips, a row of buttons.
      b.add(lathe([[0, 0.39], [0.168, 0.39], [0.164, 0.44]], 18), f.top, 0, 0, 0, 0, 0, 0, SOFT);
      hips(b, f);
      if (f.trim) for (const y of [0.68, 0.59, 0.5]) b.sphere(0, y, faceDepth(y) + 0.004, 0.017, f.trim, 0, 1, FLAT);
      break;
    }
    default:
      hips(b, f);
      break;
  }
}

/** The trousers' seat (the legs hang from the hip pivots under it) and, if worn, a belt with a buckle. */
function hips(b: GeoBuilder, f: FigureSpec): void {
  b.add(lathe([[0, 0.35], [0.125, 0.35], [0.142, 0.39], [0.144, 0.44], [0, 0.46]], 16), f.pants, 0, 0, 0, 0, 0, 0, SOFT);
  if (f.belt) {
    b.add(lathe([[0.147, 0.425], [0.15, 0.44], [0.147, 0.455]], 18), '#5A3A26', 0, 0, 0, 0, 0, 0, FLAT);
    b.box(0, 0.44, faceDepth(0.44) + 0.012, 0.035, 0.026, 0.008, '#D9B45A', 0, FLAT);
  }
}

/** How far the torso's front stands out at a height (for buttons and badges). */
export function faceDepth(y: number): number {
  return 0.152 * TORSO_DEPTH * (y > 0.7 ? 0.95 : 1);
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

/** One leg, hanging from the hip pivot: trousers or a bare leg with a sock, and a chunky sneaker. */
export function legGeometry(color: string, shoe: string, bare: boolean, skin: string, sock: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const foot = -LEG_LENGTH;
  if (bare) {
    b.cylinder(0, -0.2, 0, 0.034, 0.03, 0.36, skin, 10, 'y', SOFT);
    b.cylinder(0, foot + 0.1, 0, 0.036, 0.036, 0.07, sock, 10, 'y', SOFT);
  } else {
    b.cylinder(0, -0.16, 0, 0.062, 0.056, 0.32, color, 12, 'y', SOFT);
    b.cylinder(0, foot + 0.11, 0, 0.058, 0.058, 0.04, color, 12, 'y', { shade: 0.8 });
    b.cylinder(0, foot + 0.085, 0, 0.034, 0.034, 0.03, sock, 10, 'y', SOFT);
  }
  // The sneaker: a rounded upper over a pale sole, toes forward.
  b.add(new THREE.SphereGeometry(0.068, 12, 8).scale(0.86, 0.6, 1.42), shoe, 0, foot + 0.045, 0.03, 0, 0, 0, { shade: 0.9 });
  b.rounded(0, foot + 0.012, 0.03, 0.12, 0.024, 0.2, 0.05, SOLE, FLAT);
  return b.build();
}

/** One arm, hanging from the shoulder pivot: a puffed short sleeve or a long one, a thin arm, a round mitten hand. */
export function armGeometry(sleeve: string, skin: string, long: boolean, side: 1 | -1, carry: 'briefcase' | 'handbag' | null, cuff?: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  if (long) {
    b.add(lathe([[0, 0.025], [0.045, 0.02], [0.046, -0.05], [0.04, -0.25], [0.039, -0.27], [0, -0.27]].reverse() as [number, number][], 12, 1), sleeve, 0, 0, 0, 0, 0, 0, SOFT);
    if (cuff) b.cylinder(0, -0.26, 0, 0.045, 0.045, 0.025, cuff, 12, 'y', FLAT);
    b.cylinder(0, -0.29, 0, 0.03, 0.03, 0.04, skin, 10, 'y', SOFT);
  } else {
    b.add(lathe([[0, 0.03], [0.046, 0.024], [0.052, -0.035], [0.047, -0.1], [0, -0.104]].reverse() as [number, number][], 12, 1), sleeve, 0, 0, 0, 0, 0, 0, SOFT);
    b.cylinder(0, -0.2, 0, 0.031, 0.029, 0.2, skin, 10, 'y', SOFT);
  }
  b.add(new THREE.SphereGeometry(0.046, 12, 8).scale(0.86, 1.08, 0.9), skin, 0, HAND_Y + 0.02, 0.004, 0, 0, 0, { shade: 0.92 });
  if (carry === 'briefcase' && side === 1) {
    b.rounded(0, HAND_Y - 0.1, 0.02, 0.07, 0.18, 0.26, 0.03, '#6B4430', SOFT);
    b.box(0, HAND_Y - 0.005, 0.02, 0.02, 0.03, 0.08, '#4A2E20', 0, FLAT);
  }
  if (carry === 'handbag' && side === -1) b.rounded(0, HAND_Y - 0.08, 0, 0.08, 0.13, 0.19, 0.04, '#C94F6D', SOFT);
  return b.build();
}

/** Closed eyes for the sleepers: skin lids over the eyes and a lash line. */
export function eyelidGeometry(skin: string): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (const x of [-0.078, 0.078]) {
    b.add(new THREE.SphereGeometry(0.032, 10, 8).scale(1, 1.15, 0.5), skin, x, HEAD_Y - 0.005, faceZ(x, -0.005) + 0.002, 0, 0, 0, FLAT);
    b.box(x, HEAD_Y - 0.02, faceZ(x, -0.02) + 0.014, 0.05, 0.01, 0.008, EYE, 0, FLAT);
  }
  return b.build();
}
