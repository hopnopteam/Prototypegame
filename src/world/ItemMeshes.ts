import * as THREE from 'three';
import type { ItemKind } from '../core/types';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

/** Height each carried item adds to a stack. */
export const ITEM_HEIGHT: Record<ItemKind, number> = {
  tea: 0.2,
  blanket: 0.13,
  pillow: 0.14,
  towel: 0.11,
  roll: 0.15,
  luggage: 0.3,
  crate: 0.34,
};

const cache = new Map<ItemKind, THREE.BufferGeometry>();

function build(kind: ItemKind): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'tea':
      b.box(0, 0.015, 0, 0.42, 0.03, 0.3, PALETTE.brass);
      b.cylinder(-0.08, 0.1, 0, 0.07, 0.055, 0.12, '#FFFFFF', 8);
      b.cylinder(0.1, 0.11, 0, 0.06, 0.07, 0.15, PALETTE.porcelain, 8);
      b.cylinder(0.1, 0.2, 0, 0.02, 0.03, 0.04, PALETTE.brass, 6);
      break;
    case 'blanket':
      b.box(0, 0.06, 0, 0.44, 0.12, 0.32, PALETTE.blanket);
      b.box(0, 0.121, 0.05, 0.45, 0.004, 0.05, '#E8B04B');
      break;
    case 'pillow':
      b.box(0, 0.07, 0, 0.44, 0.14, 0.3, PALETTE.pillow);
      break;
    case 'towel':
      b.box(0, 0.05, 0, 0.36, 0.1, 0.26, PALETTE.towel);
      b.box(0, 0.101, 0.07, 0.37, 0.004, 0.05, '#FFFFFF');
      break;
    case 'roll':
      b.cylinder(-0.1, 0.07, 0, 0.07, 0.07, 0.15, '#FFFFFF', 8);
      b.cylinder(0.1, 0.07, 0, 0.07, 0.07, 0.15, '#FFFFFF', 8);
      break;
    case 'luggage':
      b.box(0, 0.14, 0, 0.5, 0.28, 0.34, PALETTE.suitcase);
      b.box(0, 0.14, 0, 0.52, 0.05, 0.36, PALETTE.brass);
      b.box(0, 0.3, 0, 0.16, 0.04, 0.06, PALETTE.ink);
      break;
    case 'crate':
      b.box(0, 0.17, 0, 0.5, 0.34, 0.42, '#C99A5B');
      b.box(0, 0.17, 0.212, 0.5, 0.06, 0.01, '#9C7A52');
      b.box(0.1, 0.36, 0, 0.14, 0.06, 0.18, PALETTE.towel);
      b.box(-0.12, 0.36, 0, 0.14, 0.06, 0.18, '#FFFFFF');
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
  mesh.userData.kind = kind;
  return mesh;
}
