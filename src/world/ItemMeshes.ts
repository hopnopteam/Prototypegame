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
  smoothie: 0.22,
  icecream: 0.2,
  seafood: 0.12,
  robe: 0.14,
  lemonade: 0.2,
  aloe: 0.16,
  surfboard: 0.12,
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

/**
 * Session 56 (owner: "the game is missing the tray… where burger and all the food is on"): food and drink ride on one
 * serving tray under the carrier's stack (`CarryStack`), Tiny Treats' tray in walnut with a cream cloth, 0.5 × 0.36.
 */
export const TRAY_TOP = 0.035;
/** What goes on the tray (food and drink); bags, linen and boxes are carried as they are. */
export const ON_TRAY: ReadonlySet<ItemKind> = new Set<ItemKind>(['tea', 'coffee', 'champagne', 'latte', 'pastry', 'meal', 'cocktail', 'popcorn', 'newspaper', 'breakfast', 'snack', 'sandwich', 'smoothie', 'icecream', 'seafood', 'lemonade']);
let trayGeometry: THREE.BufferGeometry | null = null;
export function createTrayMesh(): THREE.Mesh {
  if (!trayGeometry) {
    const b = new GeoBuilder();
    const e = modelEntry('tray');
    b.model('tray', 0, 0, 0, 0, 0.5 / (e.max[0] - e.min[0]), TRAY_TOP / (e.max[1] - e.min[1]), 0.36 / (e.max[2] - e.min[2]), { recolor: [key('ttWood', '#6E4630'), key('ttBlue', PALETTE.creamBand), key('ttLight', PALETTE.linen)], surface: 'varnish', shade: 0.92 });
    trayGeometry = b.build();
  }
  const mesh = new THREE.Mesh(trayGeometry, MATERIALS.solid);
  mesh.castShadow = true;
  mesh.userData.kind = 'tray';
  return mesh;
}

/** Carried items, each with one clear silhouette and colour so a stack reads at thumb size. */
function build(kind: ItemKind): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'tea':
      // A teapot and a china mug (session 56: on the carrier's tray, `CarryStack`).
      put(b, 'teapot', 0.07, 0, 0, 0.14, [key('ttTeal', PALETTE.porcelain)]);
      put(b, 'mug', -0.12, 0, 0.03, 0.065, [key('ttLight', PALETTE.porcelain)]);
      break;
    case 'coffee':
      // A red coffee mug and a takeaway cup.
      put(b, 'mug', 0.06, 0, 0, 0.1, [key('ttLight', '#B23A2C')]);
      put(b, 'takeaway', -0.12, 0, 0.02, 0.1);
      break;
    case 'champagne':
      // A bottle (gold foil) and a glass.
      put(b, 'wine_bottle', 0.06, 0, 0, 0.3, [key('ttWood', PALETTE.gold)], 'glass');
      put(b, 'wine_glass', -0.12, 0, 0.02, 0.12, [key('ttBlue', '#E9F2F5')], 'glass');
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
      // A cocktail glass (Kenney's).
      put(b, 'cocktail', 0, 0, 0, 0.2, [], 'glass');
      break;
    case 'popcorn':
      // A red-and-white striped carton heaped with popcorn.
      b.cylinder(0, 0.1, 0, 0.085, 0.06, 0.2, '#D9433F', 12, 'y', { pattern: PATTERN.stripesZ, color2: '#FBF5EA', scale: 0.05, shade: 0.95 });
      for (const [x, z, y] of [[0, 0, 0.23], [0.04, 0.03, 0.215], [-0.04, 0.02, 0.215], [0.02, -0.04, 0.22], [-0.03, -0.03, 0.21]]) b.sphere(x, y, z, 0.035, '#FFF1C9', 1, 0.85, { shade: 1 });
      break;
    case 'newspaper':
      // The morning paper, folded.
      b.box(0, 0.013, 0, 0.28, 0.026, 0.2, '#F3EEE2', 0, { shade: 0.95 });
      b.box(0, 0.0275, -0.06, 0.24, 0.002, 0.03, '#2B2230', 0, { shade: 1 });
      b.box(-0.06, 0.0275, 0.03, 0.1, 0.002, 0.08, '#9DB8CF', 0, { shade: 1 });
      break;
    case 'breakfast':
      // Breakfast: a croissant on a plate, a muffin and a mug of coffee.
      put(b, 'plate', -0.06, 0, 0, 0.018, [key('ttBlue', PALETTE.porcelain)]);
      put(b, 'croissant', -0.06, 0.015, 0, 0.06, [], 'matte', 0.6);
      put(b, 'mug', 0.12, 0, 0.04, 0.07, [key('ttLight', PALETTE.porcelain)]);
      put(b, 'muffin', 0.11, 0, -0.08, 0.06, [], 'matte');
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
    // Phase 4, the Riviera. A mango smoothie in a tall glass with a striped straw and an orange slice.
    case 'smoothie':
      b.cylinder(0, 0.09, 0, 0.05, 0.04, 0.18, '#F6A84A', 14, 'y', { shade: 0.95, surface: 'glass' });
      b.cylinder(0, 0.183, 0, 0.052, 0.052, 0.012, '#FFD27A', 14, 'y', { shade: 1 });
      b.cylinder(0.02, 0.22, 0, 0.006, 0.006, 0.12, '#E8525E', 6, 'y', { shade: 1 });
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12, 1, false, 0, Math.PI), '#FF9F2E', -0.05, 0.17, 0, Math.PI / 2, 0, 0, { shade: 1 });
      break;
    case 'icecream':
      // A gelato cone with two scoops, in a holder.
      b.add(new THREE.ConeGeometry(0.04, 0.12, 10), '#E2A75A', 0, 0.08, 0, Math.PI, 0, 0, { shade: 0.9 });
      b.sphere(0, 0.13, 0, 0.045, '#A8D98A', 1, 1, { shade: 0.95 });
      b.sphere(0, 0.18, 0, 0.04, '#F49AB4', 1, 1, { shade: 0.95 });
      b.cylinder(0, 0.01, 0, 0.05, 0.05, 0.02, PALETTE.porcelain, 12, 'y', { shade: 1 });
      break;
    case 'seafood':
      // A grilled fish on a white plate, a lemon wedge beside it.
      b.cylinder(0, 0.01, 0, 0.16, 0.15, 0.02, PALETTE.porcelain, 18, 'y', { shade: 1, surface: 'ceramic' });
      b.add(new THREE.SphereGeometry(0.5, 12, 8).scale(0.22, 0.05, 0.08), '#E9A36A', -0.01, 0.045, 0, 0, 0.3, 0, { shade: 0.9 });
      b.cone(0.11, 0.045, -0.04, 0.035, 0.05, '#E9A36A', 6, { shade: 0.9 });
      b.sphere(-0.08, 0.04, 0.07, 0.03, '#F5D22E', 1, 0.7, { shade: 1 });
      break;
    case 'robe':
      // A fluffy white robe, folded, its blue belt on top.
      b.rounded(0, 0.06, 0, 0.42, 0.12, 0.3, 0.05, '#F8F4EC', { shade: 0.9 });
      b.box(0, 0.122, 0, 0.43, 0.012, 0.05, '#7FC1D9', 0, { shade: 1 });
      break;
    case 'lemonade':
      // A tall glass of lemonade, a lemon slice on its rim.
      b.cylinder(0, 0.08, 0, 0.045, 0.04, 0.16, '#FFF19A', 14, 'y', { shade: 0.95, surface: 'glass' });
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12, 1, false, 0, Math.PI), '#F5D22E', 0.045, 0.16, 0, Math.PI / 2, 0, 0, { shade: 1 });
      break;
    case 'aloe':
      // A pump bottle of aloe gel.
      b.rounded(0, 0.06, 0, 0.09, 0.12, 0.06, 0.02, '#7CCB7A', { shade: 0.95 });
      b.cylinder(0, 0.135, 0, 0.012, 0.012, 0.03, '#F2F2EA', 8, 'y', { shade: 1 });
      b.box(0.02, 0.15, 0, 0.04, 0.01, 0.012, '#F2F2EA', 0, { shade: 1 });
      break;
    case 'surfboard':
      // A surfboard carried flat, blue with a white stripe.
      b.add(new THREE.SphereGeometry(0.5, 16, 8).scale(0.32, 0.05, 1.2), '#4FA8E0', 0, 0.03, 0, 0, 0, 0, { shade: 0.95, surface: 'varnish' });
      b.box(0, 0.056, 0, 0.04, 0.004, 1.0, '#FFFFFF', 0, { shade: 1 });
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
