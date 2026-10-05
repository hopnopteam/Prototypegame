import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, REAR_DECK_LENGTH } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';

/** Deck boards' thickness. */
const PLANK_DEPTH = 0.05;

/** The open observation platform behind the last carriage, where new carriages couple on. */
export function buildRearDeck(): THREE.Group {
  const b = new GeoBuilder();
  const y = FLOOR_Y;
  const z0 = GANGWAY_LENGTH;
  const z1 = GANGWAY_LENGTH + REAR_DECK_LENGTH;
  const zc = (z0 + z1) / 2;
  // The painted skirt stops under the planks (a shared top face would z-fight), showing as a thin trim edge.
  const skirtTop = y - PLANK_DEPTH;
  const liv = new GeoBuilder().box(0, (0.38 + skirtTop) / 2, zc, 2.8, skirtTop - 0.38, REAR_DECK_LENGTH, '#FFFFFF', 0, { shade: 0.85 });
  b.box(0, y - PLANK_DEPTH / 2, zc, 2.7, PLANK_DEPTH, REAR_DECK_LENGTH - 0.1, PALETTE.oak, 0, { pattern: PATTERN.planks, color2: PALETTE.walnut, scale: 0.22, shade: 1 });
  // Brass railing with balusters, a gate rail at the back.
  for (const x of [-1.35, 1.35]) b.box(x, y + 0.5, zc, 0.05, 0.05, REAR_DECK_LENGTH, PALETTE.brass, 0, { shade: 1 });
  b.box(0, y + 0.5, z1 - 0.03, 2.75, 0.05, 0.05, PALETTE.brass, 0, { shade: 1 });
  for (let z = z0 + 0.1; z <= z1; z += 0.3) for (const x of [-1.35, 1.35]) b.box(x, y + 0.25, z, 0.03, 0.5, 0.03, PALETTE.brass, 0, { shade: 0.85 });
  for (let x = -1.2; x <= 1.21; x += 0.3) b.box(x, y + 0.25, z1 - 0.03, 0.03, 0.5, 0.03, PALETTE.brass, 0, { shade: 0.85 });
  b.cylinder(1.2, y + 0.9, z1 - 0.1, 0.035, 0.05, 0.9, PALETTE.navy, 8);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.layers.enable(STATIC_CASTER_LAYER);
  group.add(mesh, new THREE.Mesh(liv.build(), MATERIALS.livery));
  const lamp = new GeoBuilder().cylinder(0, 0, 0, 0.07, 0.1, 0.18, PALETTE.lampShade, 10, 'y', { shade: 0.9 }).build();
  const lampMesh = new THREE.Mesh(lamp, MATERIALS.lamps);
  lampMesh.position.set(1.2, y + 1.42, z1 - 0.1);
  group.add(lampMesh);
  return group;
}
