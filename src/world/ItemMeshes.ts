import * as THREE from 'three';
import type { ItemKind } from '../core/types';
import { GeoBuilder } from './geo';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';

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
  bedding: 0.2,
  laundry: 0.22,
};

const cache = new Map<ItemKind, THREE.BufferGeometry>();

/** Carried items, each with one clear silhouette and colour so a stack reads at thumb size. */
function build(kind: ItemKind): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'tea':
      // A brass tray with a blue-banded teapot and a cup.
      b.rounded(0, 0.015, 0, 0.44, 0.03, 0.3, 0.06, PALETTE.brass, { shade: 0.9 });
      b.sphere(0.08, 0.1, 0, 0.08, PALETTE.porcelain, 1, 0.85);
      b.cylinder(0.08, 0.1, 0, 0.082, 0.082, 0.025, PALETTE.navy, 14, 'y', { shade: 1 });
      b.cylinder(0.08, 0.18, 0, 0.02, 0.03, 0.03, PALETTE.navy, 8);
      b.cylinder(0.17, 0.11, 0, 0.012, 0.018, 0.08, PALETTE.porcelain, 6, 'x');
      b.cylinder(-0.11, 0.06, 0.02, 0.05, 0.04, 0.07, PALETTE.porcelain, 12);
      b.cylinder(-0.11, 0.035, 0.02, 0.07, 0.07, 0.01, PALETTE.porcelain, 12);
      break;
    case 'coffee':
      // A silver tray with a tall dark coffee pot and a cup.
      b.rounded(0, 0.015, 0, 0.44, 0.03, 0.3, 0.06, PALETTE.chrome, { shade: 0.9, surface: 'steel' });
      b.cylinder(0.08, 0.12, 0, 0.06, 0.075, 0.18, '#3A2A24', 14, 'y', { shade: 0.8, surface: 'paint' });
      b.cylinder(0.08, 0.22, 0, 0.03, 0.05, 0.03, PALETTE.chrome, 10, 'y', { surface: 'steel' });
      b.cylinder(0.16, 0.14, 0, 0.012, 0.02, 0.1, PALETTE.chrome, 6, 'x', { surface: 'steel' });
      b.cylinder(-0.11, 0.06, 0.02, 0.05, 0.04, 0.07, PALETTE.porcelain, 12);
      b.cylinder(-0.11, 0.098, 0.02, 0.043, 0.043, 0.004, '#5A3524', 12, 'y', { shade: 1 });
      b.cylinder(-0.11, 0.035, 0.02, 0.07, 0.07, 0.01, PALETTE.porcelain, 12);
      break;
    case 'champagne':
      // A silver ice bucket with a green bottle and a flute beside it.
      b.rounded(0, 0.015, 0, 0.44, 0.03, 0.3, 0.06, PALETTE.brass, { shade: 0.9, surface: 'brass' });
      b.cylinder(0.06, 0.1, 0, 0.1, 0.08, 0.16, PALETTE.chrome, 16, 'y', { shade: 0.85, surface: 'steel' });
      b.cylinder(0.06, 0.2, 0.01, 0.045, 0.045, 0.18, '#1F4A34', 12, 'y', { shade: 0.8, surface: 'glass' });
      b.cylinder(0.06, 0.3, 0.01, 0.02, 0.03, 0.04, PALETTE.gold, 8, 'y', { surface: 'brass' });
      b.cylinder(-0.12, 0.05, 0, 0.012, 0.012, 0.07, '#E8EEF2', 6, 'y', { surface: 'glass' });
      b.cylinder(-0.12, 0.12, 0, 0.03, 0.016, 0.08, '#F3D36E', 10, 'y', { shade: 1, surface: 'glass' });
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
      b.rounded(0, 0.05, 0, 0.36, 0.1, 0.26, 0.04, PALETTE.towel, { shade: 0.85 });
      b.box(0, 0.101, 0.07, 0.365, 0.004, 0.05, PALETTE.towelStripe, 0, { shade: 1 });
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
      // A café glass of milky coffee with its foam, on a saucer.
      b.cylinder(0, 0.008, 0, 0.09, 0.09, 0.016, PALETTE.porcelain, 14);
      b.cylinder(0, 0.09, 0, 0.055, 0.045, 0.15, '#C99B6D', 14, 'y', { shade: 0.95, surface: 'glass' });
      b.cylinder(0, 0.168, 0, 0.056, 0.056, 0.012, '#FBF1DF', 14, 'y', { shade: 1 });
      break;
    case 'pastry':
      // A croissant on a little plate.
      b.cylinder(0, 0.008, 0, 0.12, 0.12, 0.016, PALETTE.porcelain, 14);
      b.add(new THREE.TorusGeometry(0.075, 0.035, 6, 12, Math.PI * 1.1).rotateX(Math.PI / 2).rotateY(Math.PI * 0.45), '#E2A04A', 0, 0.045, 0.02, 0, 0, 0, { shade: 0.9 });
      break;
    case 'meal':
      // A plate under a silver cloche.
      b.cylinder(0, 0.01, 0, 0.17, 0.17, 0.02, PALETTE.porcelain, 16);
      b.sphere(0, 0.03, 0, 0.13, PALETTE.chrome, 1, 0.75, { shade: 0.95, surface: 'steel' });
      b.sphere(0, 0.135, 0, 0.022, PALETTE.chrome, 0, 1, { shade: 1, surface: 'steel' });
      break;
    case 'cocktail':
      // A coupe glass, pink, with a cherry, on a small silver tray.
      b.rounded(0, 0.01, 0, 0.24, 0.02, 0.18, 0.04, PALETTE.chrome, { shade: 0.9, surface: 'steel' });
      b.cylinder(0, 0.06, 0, 0.01, 0.02, 0.09, '#E8EEF2', 6, 'y', { surface: 'glass' });
      b.cylinder(0, 0.13, 0, 0.07, 0.025, 0.06, '#F3A3B3', 12, 'y', { shade: 1, surface: 'glass' });
      b.sphere(0.03, 0.17, 0, 0.016, '#C0485C', 0);
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
      // A breakfast tray: a croissant, a cup of coffee, a little pot of jam.
      b.rounded(0, 0.015, 0, 0.44, 0.03, 0.3, 0.06, PALETTE.brass, { shade: 0.9, surface: 'brass' });
      b.cylinder(-0.06, 0.04, 0, 0.11, 0.11, 0.016, PALETTE.porcelain, 14);
      b.add(new THREE.TorusGeometry(0.065, 0.03, 6, 12, Math.PI * 1.1).rotateX(Math.PI / 2).rotateY(Math.PI * 0.45), '#E2A04A', -0.06, 0.07, 0.02, 0, 0, 0, { shade: 0.9 });
      b.cylinder(0.12, 0.07, 0.04, 0.045, 0.036, 0.07, PALETTE.porcelain, 12);
      b.cylinder(0.12, 0.106, 0.04, 0.04, 0.04, 0.004, '#5A3524', 12, 'y', { shade: 1 });
      b.cylinder(0.12, 0.05, -0.08, 0.03, 0.03, 0.04, '#C0485C', 10, 'y', { shade: 1, surface: 'glass' });
      break;
    case 'bedding':
      // A fresh bedding set: folded white linen with a pillow on top, tied with a blue band.
      b.rounded(0, 0.06, 0, 0.44, 0.12, 0.32, 0.03, '#F6F2EA', { shade: 0.9 });
      b.box(0, 0.06, 0, 0.06, 0.124, 0.324, '#7D9CBB', 0, { shade: 1 });
      b.rounded(0, 0.16, 0, 0.36, 0.08, 0.24, 0.05, PALETTE.pillow, { shade: 0.9 });
      break;
    case 'laundry':
      // Used bedding bundled up for the laundry: a crumpled heap of sheet with the cover's colour showing.
      b.sphere(-0.07, 0.09, 0, 0.13, '#DCE3EA', 1, 0.7, { shade: 0.85 });
      b.sphere(0.08, 0.08, 0.03, 0.11, '#C9D2DC', 1, 0.7, { shade: 0.85 });
      b.sphere(0.02, 0.15, -0.04, 0.09, '#B7A79A', 1, 0.7, { shade: 0.85 });
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
