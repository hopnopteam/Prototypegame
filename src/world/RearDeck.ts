import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, REAR_DECK_LENGTH } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { NEW_LOOK } from '../config/look';
import { ACTIVE_ROUTE } from '../config/routes';

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
  // Visual overhaul (owner, 24 Nov: "the train abruptly ends… an end car with a standing area and a railing"): the deck
  // stays on a finished train and is furnished as a place to stand and watch the line go by.
  if (NEW_LOOK) dressDeck(b, y, z0, z1);
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

/** The deck's dressing in the new look: two deck chairs facing back down the line, plants at the corners, a lantern post. */
function dressDeck(b: GeoBuilder, y: number, z0: number, z1: number): void {
  const tropical = ACTIVE_ROUTE.id === 'riviera';
  const frame = tropical ? '#C9A46A' : '#6B4A32';
  const cloth = tropical ? '#F28C6B' : '#2F5D50';
  for (const [i, x] of [-0.62, 0.62].entries()) {
    const z = z1 - 0.7;
    b.object(`deck:chair${i}`);
    // A deck chair: a slung seat between two frame sides, leaning back toward the carriage.
    for (const side of [-0.24, 0.24]) b.box(x + side, y + 0.26, z, 0.04, 0.04, 0.7, frame, 0, { shade: 0.9, surface: 'wood' });
    b.add(new THREE.BoxGeometry(0.46, 0.03, 0.62), cloth, x, y + 0.32, z - 0.02, -0.5, 0, 0, { shade: 1, surface: 'fabric' });
    for (const [dz, h] of [[-0.3, 0.5], [0.28, 0.3]] as [number, number][]) for (const side of [-0.22, 0.22]) b.box(x + side, y + h / 2, z + dz, 0.035, h, 0.035, frame, 0, { shade: 0.85, surface: 'wood' });
    b.endObject();
  }
  for (const [i, x] of [-1.12, 1.12].entries()) {
    const z = z0 + 0.35;
    b.object(`deck:plant${i}`);
    b.cylinder(x, y + 0.17, z, 0.15, 0.12, 0.34, tropical ? '#E9DCC4' : '#8C5A3C', 12, 'y', { shade: 0.9, surface: 'ceramic' });
    if (tropical) {
      // A small palm: a trunk and a fan of fronds.
      b.cylinder(x, y + 0.6, z, 0.035, 0.05, 0.6, '#8A6A44', 6, 'y', { shade: 0.85, surface: 'wood' });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.add(new THREE.BoxGeometry(0.06, 0.015, 0.42), k % 2 ? '#4E9A4A' : '#3E8A40', x + Math.sin(a) * 0.18, y + 0.92, z + Math.cos(a) * 0.18, 0.45, a, 0, { shade: 0.9, surface: 'foliage' });
      }
    } else {
      b.sphere(x, y + 0.48, z, 0.22, '#3F7A3E', 1, 1, { shade: 0.85, surface: 'foliage' });
    }
    b.endObject();
  }
}
