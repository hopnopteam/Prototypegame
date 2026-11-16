import * as THREE from 'three';
import type { ItemKind } from '../core/types';
import { GeoBuilder } from './geo';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { key, modelEntry, type ModelId, type Recolor } from './models/library';

/** Height each carried item adds to a stack. */
export const ITEM_HEIGHT: Record<ItemKind, number> = {
  tea: 0.2,
  coffee: 0.22,
  champagne: 0.3,
  blanket: 0.13,
  pillow: 0.14,
  towel: 0.11,
  roll: 0.15,
  luggage: 0.3,
  crate: 0.34,
  latte: 0.2,
  pastry: 0.1,
  meal: 0.2,
  cocktail: 0.22,
  popcorn: 0.24,
  newspaper: 0.06,
  breakfast: 0.16,
  snack: 0.12,
  sandwich: 0.14,
};

const cache = new Map<ItemKind, THREE.BufferGeometry>();

/**
 * Session 51: carried things are the same models the venues show (Tiny Treats' teapot, mugs, tray, croissant,
 * sandwich; KayKit's dinner; Kenney's cocktail), so the cup on the tray is the cup on the café table.
 */
function put(b: GeoBuilder, id: ModelId, x: number, y: number, z: number, height: number, recolor: Recolor[] = [], surface: 'ceramic' | 'matte' | 'glass' | 'brass' = 'ceramic', rotY = 0): void {
  const e = modelEntry(id);
  const s = height / (e.max[1] - e.min[1]);
  b.model(id, x, y, z, rotY, s, s, s, { recolor, surface, shade: 0.92 });
}

/** A serving tray (Tiny Treats'), its cloth in our colour, about 0.44 × 0.3. */
function tray(b: GeoBuilder, rim: string, cloth: string): void {
  const e = modelEntry('tray');
  const sx = 0.44 / (e.max[0] - e.min[0]);
  b.model('tray', 0, 0, 0, 0, sx, 0.03 / (e.max[1] - e.min[1]), 0.3 / (e.max[2] - e.min[2]), { recolor: [key('ttWood', rim), key('ttBlue', cloth), key('ttLight', PALETTE.linen)], surface: 'brass', shade: 0.92 });
}

/** Carried items, each with one clear silhouette and colour so a stack reads at thumb size. */
function build(kind: ItemKind): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'tea':
      // A brass tray with a teapot and a china mug.
      tray(b, PALETTE.brass, PALETTE.navy);
      put(b, 'teapot', 0.07, 0.03, 0, 0.14, [key('ttTeal', PALETTE.porcelain)]);
      put(b, 'mug', -0.12, 0.03, 0.03, 0.065, [key('ttLight', PALETTE.porcelain)]);
      break;
    case 'coffee':
      // A silver tray with a red coffee mug and a takeaway cup.
      tray(b, PALETTE.chrome, '#5A3524');
      put(b, 'mug', 0.06, 0.03, 0, 0.1, [key('ttLight', '#B23A2C')]);
      put(b, 'takeaway', -0.12, 0.03, 0.02, 0.1);
      break;
    case 'champagne':
      // A brass tray with a bottle (gold foil) and a glass.
      tray(b, PALETTE.brass, PALETTE.navy);
      put(b, 'wine_bottle', 0.06, 0.03, 0, 0.3, [key('ttWood', PALETTE.gold)], 'glass');
      put(b, 'wine_glass', -0.12, 0.03, 0.02, 0.12, [key('ttBlue', '#E9F2F5')], 'glass');
      break;
    case 'blanket':
      b.rounded(0, 0.06, 0, 0.44, 0.12, 0.32, 0.04, PALETTE.mustard, { pattern: PATTERN.stripesX, color2: PALETTE.raspberry, scale: 0.1, shade: 0.85 });
      b.box(0, 0.121, 0.1, 0.45, 0.006, 0.06, PALETTE.linen, 0, { shade: 1 });
      break;
    case 'pillow':
      b.rounded(0, 0.07, 0, 0.44, 0.14, 0.3, 0.1, PALETTE.pillow, { shade: 0.85 });
      b.box(0, 0.141, 0, 0.06, 0.004, 0.3, PALETTE.powder, 0, { shade: 1 });
      break;
    case 'towel':
      // Session 51: Tiny Treats' stacked towels, recoloured to our towel stripes.
      put(b, 'towels', 0, 0, 0, 0.11, [key('ttBlue', PALETTE.towel), key('cover', PALETTE.towelStripe)], 'matte');
      break;
    case 'roll':
      b.cylinder(-0.09, 0.07, 0, 0.07, 0.07, 0.15, PALETTE.rollPaper, 14, 'x', { shade: 0.85 });
      b.cylinder(0.09, 0.07, 0, 0.07, 0.07, 0.15, PALETTE.rollPaper, 14, 'x', { shade: 0.85 });
      b.cylinder(0.09, 0.07, 0, 0.072, 0.072, 0.03, PALETTE.mint, 14, 'x', { shade: 1 });
      break;
    case 'luggage':
      b.rounded(0, 0.14, 0, 0.5, 0.28, 0.34, 0.06, PALETTE.suitcase, { shade: 0.8 });
      for (const x of [-0.14, 0.14]) b.box(x, 0.14, 0, 0.04, 0.285, 0.345, PALETTE.creamBand, 0, { shade: 1 });
      b.cylinder(0, 0.3, 0, 0.02, 0.02, 0.16, PALETTE.ink, 6, 'x');
      b.box(0.18, 0.22, 0.172, 0.08, 0.06, 0.004, PALETTE.linen, 0, { shade: 1 });
      break;
    case 'latte':
      // A takeaway latte (Tiny Treats').
      put(b, 'takeaway', 0, 0, 0, 0.18);
      break;
    case 'pastry':
      // A croissant on a little plate.
      put(b, 'plate', 0, 0, 0, 0.02, [key('ttBlue', PALETTE.porcelain)]);
      put(b, 'croissant', 0, 0.015, 0, 0.07, [], 'matte', 0.6);
      break;
    case 'meal':
      // A plated roast dinner (KayKit's).
      put(b, 'dinner', 0, 0, 0, 0.2, [], 'matte');
      break;
    case 'cocktail':
      // A cocktail glass (Kenney's) on a small silver tray.
      b.rounded(0, 0.01, 0, 0.24, 0.02, 0.18, 0.04, PALETTE.chrome, { shade: 0.9, surface: 'steel' });
      put(b, 'cocktail', 0, 0.02, 0, 0.2, [], 'glass');
      break;
    case 'popcorn':
      // A red-and-white striped carton heaped with popcorn.
      b.cylinder(0, 0.1, 0, 0.085, 0.06, 0.2, '#D9433F', 12, 'y', { pattern: PATTERN.stripesZ, color2: '#FBF5EA', scale: 0.05, shade: 0.95 });
      for (const [x, z, y] of [[0, 0, 0.23], [0.04, 0.03, 0.215], [-0.04, 0.02, 0.215], [0.02, -0.04, 0.22], [-0.03, -0.03, 0.21]]) b.sphere(x, y, z, 0.035, '#FFF1C9', 1, 0.85, { shade: 1 });
      break;
    case 'newspaper':
      // The morning paper, folded, on a small silver tray.
      b.rounded(0, 0.008, 0, 0.36, 0.016, 0.26, 0.04, PALETTE.chrome, { shade: 0.9, surface: 'steel' });
      b.box(0, 0.03, 0, 0.28, 0.026, 0.2, '#F3EEE2', 0, { shade: 0.95 });
      b.box(0, 0.0435, -0.06, 0.24, 0.002, 0.03, '#2B2230', 0, { shade: 1 });
      b.box(-0.06, 0.0435, 0.03, 0.1, 0.002, 0.08, '#9DB8CF', 0, { shade: 1 });
      break;
    case 'breakfast':
      // A breakfast tray: a croissant on a plate, a muffin and a mug of coffee.
      tray(b, PALETTE.brass, PALETTE.linen);
      put(b, 'plate', -0.06, 0.03, 0, 0.018, [key('ttBlue', PALETTE.porcelain)]);
      put(b, 'croissant', -0.06, 0.045, 0, 0.06, [], 'matte', 0.6);
      put(b, 'mug', 0.12, 0.03, 0.04, 0.07, [key('ttLight', PALETTE.porcelain)]);
      put(b, 'muffin', 0.11, 0.03, -0.08, 0.06, [], 'matte');
      break;
    case 'snack':
      // A minibar's refill: a little box with a chocolate bar and a bag of crisps peeking out.
      b.rounded(0, 0.05, 0, 0.3, 0.1, 0.2, 0.02, '#C9473F', { shade: 0.9 });
      b.box(0, 0.101, 0, 0.22, 0.004, 0.12, '#FBF5EA', 0, { shade: 1 });
      b.box(-0.06, 0.13, 0, 0.1, 0.05, 0.16, '#5A3524', 0, { shade: 0.95 });
      b.box(-0.06, 0.156, 0, 0.11, 0.004, 0.17, '#E2B653', 0, { shade: 1 });
      b.rounded(0.07, 0.15, 0, 0.12, 0.1, 0.07, 0.03, '#FFD35C', { shade: 0.95 });
      break;
    case 'sandwich':
      // Session 38, models since 51: a sandwich (Tiny Treats') on a white plate.
      put(b, 'plate', 0, 0, 0, 0.02, [key('ttBlue', PALETTE.porcelain)]);
      put(b, 'sandwich', 0, 0.015, 0, 0.11, [], 'matte');
      break;
    case 'crate':
      b.box(0, 0.17, 0, 0.5, 0.34, 0.42, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#A87544', scale: 0.09, shade: 0.8 });
      b.box(0, 0.34, 0, 0.52, 0.02, 0.44, '#A87544', 0, { shade: 1 });
      b.rounded(0.1, 0.38, 0, 0.16, 0.06, 0.2, 0.03, PALETTE.towel, { shade: 1 });
      b.cylinder(-0.12, 0.39, 0, 0.05, 0.05, 0.16, PALETTE.rollPaper, 10, 'z', { shade: 1 });
      break;
  }
  return b.build();
}

export function createItemMesh(kind: ItemKind): THREE.Mesh {
  let geometry = cache.get(kind);
  if (!geometry) {
    geometry = build(kind);
    cache.set(kind, geometry);
  }
  const mesh = new THREE.Mesh(geometry, MATERIALS.solid);
  mesh.castShadow = true;
  mesh.userData.kind = kind;
  return mesh;
}
