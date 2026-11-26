import * as THREE from 'three';
import data from '../../../assets/models/models.bin';
import aoData from '../../../assets/models/models_ao.bin';
import { NEW_LOOK, PROP_AO } from '../../config/look';
import { MODEL_INDEX, MODEL_TOTALS } from './modelIndex';
import type { ModelEntry } from './types';

/**
 * Session 49: the CC0 models baked by scripts/assets/bake_models.py (vertex-coloured, no textures), decoded once from
 * the inlined binary. `modelGeometry` hands out an indexed geometry per model (position, normal, colour in linear
 * space), cached; GeoBuilder.model places one into a merged mesh, recoloured and fitted (world/geo.ts).
 */
export type ModelId = keyof typeof MODEL_INDEX;

interface Arrays {
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  indices: Uint16Array;
}

let arrays: Arrays | null = null;
const cache = new Map<ModelId, THREE.BufferGeometry>();

function decode(): Arrays {
  if (arrays) return arrays;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const v = MODEL_TOTALS.vertices;
  const buf = bytes.buffer;
  let o = 0;
  const positions = new Float32Array(buf, o, v * 3);
  o += v * 12;
  const normals = new Int8Array(buf, o, v * 3);
  o += v * 3;
  const colors = new Uint8Array(buf, o, v * 3);
  o += v * 3;
  if (o % 2) o += 1;
  const indices = new Uint16Array(buf, o, MODEL_TOTALS.indices);
  arrays = { positions, normals, colors, indices };
  return arrays;
}

let aoBytes: Uint8Array | null = null;
/** One byte of baked occlusion per model vertex (255 open), decoded once. */
function propAo(): Uint8Array {
  if (aoBytes) return aoBytes;
  const binary = atob(aoData);
  aoBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) aoBytes[i] = binary.charCodeAt(i);
  return aoBytes;
}

export function modelEntry(id: ModelId): ModelEntry {
  return MODEL_INDEX[id];
}

/** The model as an indexed geometry: position, normal, and `color` in linear space (sRGB decoded). Shared: clone it. */
export function modelGeometry(id: ModelId): THREE.BufferGeometry {
  const hit = cache.get(id);
  if (hit) return hit;
  const a = decode();
  const e = MODEL_INDEX[id];
  const n = e.vertices;
  const pos = a.positions.slice(e.vertex * 3, (e.vertex + n) * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const ao = NEW_LOOK ? propAo() : null;
  for (let i = 0; i < n; i++) {
    const s = (e.vertex + i) * 3;
    for (let k = 0; k < 3; k++) nor[i * 3 + k] = a.normals[s + k] / 127;
    c.setRGB(a.colors[s] / 255, a.colors[s + 1] / 255, a.colors[s + 2] / 255, THREE.SRGBColorSpace);
    // Visual overhaul: the prop's own Cycles-baked occlusion (art/blender/bake_prop_ao.py), softened so a vertex
    // sitting in a corner of its own flat-shaded faces never goes black.
    if (ao) c.multiplyScalar(PROP_AO.floor + (1 - PROP_AO.floor) * Math.min(1, ao[e.vertex + i] / 255 * PROP_AO.gain));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(a.indices.slice(e.index, e.index + e.indices), 1));
  cache.set(id, g);
  return g;
}

/**
 * Repaints one family of a model's colours (a hue band: KayKit paints each part as a little gradient in one hue) in
 * one of ours, keeping each vertex's brightness relative to the family's reference colour.
 */
export interface Recolor {
  /** Hue band in degrees (wraps through 360: [340, 20] is reds). */
  hue: [number, number];
  /** Saturation band (0–1); defaults to anything with some colour. */
  sat?: [number, number];
  /** Value band (0–1). */
  val?: [number, number];
  /** The family's typical colour in the model (sRGB hex): its brightness maps to `to`'s. */
  ref: string;
  /** Our colour (sRGB hex). */
  to: string;
}

const hsv = { h: 0, s: 0, v: 0 };
function toHsv(r: number, g: number, b: number): typeof hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  hsv.h = h;
  hsv.s = max > 0 ? d / max : 0;
  hsv.v = max;
  return hsv;
}

function inBand(h: number, band: [number, number]): boolean {
  return band[0] <= band[1] ? h >= band[0] && h <= band[1] : h >= band[0] || h <= band[1];
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
/** Recolours linear vertex colours in place (bands are judged in sRGB, as the artist painted them). */
export function recolor(colors: Float32Array, rules: readonly Recolor[]): void {
  if (!rules.length) return;
  const refs = rules.map((r) => {
    tmpA.set(r.ref);
    return { lum: 0.2126 * tmpA.r + 0.7152 * tmpA.g + 0.0722 * tmpA.b, to: new THREE.Color(r.to) };
  });
  for (let i = 0; i < colors.length; i += 3) {
    tmpB.setRGB(colors[i], colors[i + 1], colors[i + 2]);
    const lum = 0.2126 * tmpB.r + 0.7152 * tmpB.g + 0.0722 * tmpB.b;
    tmpB.convertLinearToSRGB();
    const c = toHsv(tmpB.r, tmpB.g, tmpB.b);
    for (let k = 0; k < rules.length; k++) {
      const rule = rules[k];
      const sat = rule.sat ?? [0.15, 1];
      const val = rule.val ?? [0, 1];
      if (!inBand(c.h, rule.hue) || c.s < sat[0] || c.s > sat[1] || c.v < val[0] || c.v > val[1]) continue;
      const ratio = Math.min(1.6, Math.max(0.45, lum / Math.max(1e-4, refs[k].lum)));
      colors[i] = Math.min(1, refs[k].to.r * ratio);
      colors[i + 1] = Math.min(1, refs[k].to.g * ratio);
      colors[i + 2] = Math.min(1, refs[k].to.b * ratio);
      break;
    }
  }
}

type Band = Omit<Recolor, 'to'>;
/**
 * Session 51: the key colours the baker paints flat-coloured models in (scripts/assets/bake_models.py: WOOD, COVER,
 * CUSHION, BLANKET, METAL, LINEN), and Tiny Treats' own palette families (cool greys, warm wood, the red accent), each
 * a hue band to recolour by.
 */
export const KEY = {
  wood: { hue: [5, 25], sat: [0.45, 0.75], val: [0.3, 0.72], ref: '#8A4A37' },
  cover: { hue: [28, 45], sat: [0.5, 0.8], val: [0.75, 1], ref: '#FBB856' },
  cushion: { hue: [195, 215], sat: [0.4, 0.6], val: [0.78, 0.9], ref: '#68A8D4' },
  blanket: { hue: [195, 215], sat: [0.45, 0.7], val: [0.6, 0.77], ref: '#4E8DBA' },
  metal: { hue: [0, 360], sat: [0, 0.05], val: [0.3, 0.62], ref: '#7A7A7A' },
  linen: { hue: [0, 360], sat: [0, 0.05], val: [0.8, 1], ref: '#F2F2F2' },
  ttLight: { hue: [175, 245], sat: [0, 0.25], val: [0.76, 1], ref: '#D7DEE6' },
  ttMid: { hue: [175, 245], sat: [0, 0.32], val: [0.5, 0.76], ref: '#A3ABB8' },
  ttDark: { hue: [175, 245], sat: [0, 0.25], val: [0, 0.5], ref: '#454B52' },
  ttWood: { hue: [10, 32], sat: [0.35, 0.72], val: [0.55, 1], ref: '#B8774F' },
  ttRed: { hue: [350, 22], sat: [0.74, 1], val: [0.5, 1], ref: '#D2402A' },
  ttTeal: { hue: [165, 200], sat: [0.35, 0.8], val: [0.4, 1], ref: '#4FA9A8' },
  ttBlue: { hue: [195, 225], sat: [0.3, 0.75], val: [0.6, 1], ref: '#6FA6D6' },
} satisfies Record<string, Band>;

/** One recolour rule: a key family painted in our colour. */
export function key(family: keyof typeof KEY, to: string): Recolor {
  return { ...(KEY[family] as Band), to };
}
