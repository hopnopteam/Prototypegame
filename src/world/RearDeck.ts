import * as THREE from 'three';
import { STATIC_CASTER_LAYER } from './Lighting';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { GANGWAY_LENGTH, HALF_WIDTH, REAR_DECK_LENGTH } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { NEW_LOOK } from '../config/look';
import { ACTIVE_ROUTE } from '../config/routes';

/** Deck boards' thickness. */
const PLANK_DEPTH = 0.05;

/** The railing's line, inside the deck's edge. */
/** The finished train's end balcony: shorter and a little narrower than the coupling platform. */
const END_DECK_HALF = HALF_WIDTH - 0.45;
const END_DECK_LENGTH = 1.45;
/**
 * The coupling platform while carriages are still to come (owner, after De-Slop B: "far too big, does not look like how
 * and where the train would connect"): an end platform the width of the gangway (the walkable deck is 2.6 m across) on
 * the carriage's own frame, no bogie of its own, buffers and a screw coupling hooked to the waiting carriage and the
 * gangway's bellows reaching across the gap to it (cut down to the sill height of every wall facing the camera).
 */
const COUPLE_HALF = 1.45;
/** The soft shadow under the deck: layers stacked from wide and faint to the deck's own size, just over the ballast. */
const SHADOW_LAYERS = 4;
const SHADOW_SPREAD = 0.4;
const SHADOW_Y = 0.112;
const SHADOW = new THREE.MeshBasicMaterial({ color: '#0E0B12', transparent: true, opacity: 0.3, depthWrite: false });

/**
 * The open observation platform behind the last carriage, where new carriages couple on. Owner (25 Nov: "the train end
 * patio looks very weird and incomplete, it should look like the end of train and there should be some depth from the
 * train tracks to the floor, it currently looks attached on the floor"): it is now the end of a carriage, its full
 * width, standing on its own bogie on the rails with the dark underframe and the open space under it showing, buffers
 * and a coupling at the back, steps down at each rear corner, an ornate railing with a round tail sign and red tail
 * lamps.
 */
export function buildRearDeck(end = true, gap = 0.6): THREE.Group {
  // Owner: "the end train patio is way too huge": the finished train's end is a short balcony off the last carriage's
  // gangway, a little narrower than the body; the coupling platform keeps its size (it is walked on to buy a carriage).
  const half = end ? END_DECK_HALF : COUPLE_HALF;
  const len = end ? END_DECK_LENGTH : REAR_DECK_LENGTH;
  const railX = half - 0.08;
  const b = new GeoBuilder();
  const under = new GeoBuilder();
  const y = FLOOR_Y;
  const z0 = GANGWAY_LENGTH;
  const z1 = GANGWAY_LENGTH + len;
  const zc = (z0 + z1) / 2;
  const w = half * 2;
  // The painted skirt stops under the planks (a shared top face would z-fight), showing as a thin trim edge; a hollow
  // frame like the carriages', so the underframe shows through below.
  const skirtTop = y - PLANK_DEPTH;
  const rim = 0.12;
  const liv = new GeoBuilder();
  for (const side of [-1, 1]) {
    liv.box(side * (half - rim / 2), (0.4 + skirtTop) / 2, zc, rim, skirtTop - 0.4, len, '#FFFFFF', 0, { shade: 0.85 });
    liv.box(0, (0.4 + skirtTop) / 2, zc + side * (len / 2 - rim / 2), w - rim * 2 - 0.004, skirtTop - 0.4, rim, '#FFFFFF', 0, { shade: 0.85 });
  }
  b.box(0, y - PLANK_DEPTH / 2, zc, w - 0.04, PLANK_DEPTH, len - 0.06, PALETTE.oak, 0, { pattern: PATTERN.planks, color2: PALETTE.walnut, scale: 0.22, shade: 1, ...(NEW_LOOK ? { surface: 'wood' as const, detail: 'wood' as const } : {}) });
  // The underframe: dark sole bars and a bogie sitting on the rails (the carriages' wheels and spacing), the open space
  // under the floor in shadow, buffers and a coupling hook at the back.
  under.box(0, 0.3, zc, w - 0.7, 0.16, len - 0.3, PALETTE.undercarriage, 0, { shade: 0.8 });
  for (const x of [-1, 1]) under.box(x * (half - 0.32), 0.33, zc, 0.12, 0.12, len - 0.1, PALETTE.undercarriage, 0, { shade: 0.75 });
  // The finished train's balcony stands on its own bogie; the coupling platform is carried on the carriage's frame.
  if (end) {
    const bogie = Math.min(1.7, len - 0.1);
    under.box(0, 0.2, zc, 2.4, 0.16, bogie, PALETTE.wheel, 0, { shade: 0.85 });
    for (const x of [-1.28, 1.28]) for (const dz of [-1, 1]) under.cylinder(x, 0.24, zc + dz * (bogie / 2 - 0.3), 0.24, 0.24, 0.12, PALETTE.wheel, 14, 'x', { shade: 0.9 });
    for (const x of [-1.28, 1.28]) under.box(x, 0.24, zc, 0.08, 0.06, bogie - 0.6, PALETTE.chrome, 0, { shade: 0.9, surface: 'iron' });
  }
  const bufferX = end ? 1.3 : 0.92;
  for (const x of [-bufferX, bufferX]) {
    under.cylinder(x, 0.36, z1 + 0.06, 0.09, 0.09, 0.12, PALETTE.chrome, 12, 'z', { shade: 1, surface: 'iron' });
    under.cylinder(x, 0.36, z1 + 0.135, 0.13, 0.13, 0.03, PALETTE.chrome, 14, 'z', { shade: 1, surface: 'iron' });
  }
  // A red buffer beam across the back under the skirt, the buffers and the coupling on it: the end of the train.
  under.box(0, 0.34, z1 - 0.04, w - 0.3, 0.14, 0.1, '#A8352C', 0, { shade: 0.9, surface: 'paint' });
  under.box(0, 0.34, z1 + 0.06, 0.16, 0.1, 0.12, PALETTE.wheel, 0, { shade: 0.85 });
  under.cylinder(0, 0.34, z1 + 0.17, 0.04, 0.04, 0.1, PALETTE.wheel, 8, 'z', { shade: 0.85 });
  // Steps down at each rear corner, outside the skirt, the way a guard climbs aboard.
  for (const x of [-1, 1]) {
    for (const [i, sy] of [0.42, 0.26].entries()) {
      b.box(x * (half + 0.12), sy, z1 - 0.32, 0.26, 0.03, 0.42, PALETTE.undercarriage, 0, { shade: 0.85, surface: 'iron' });
      if (i === 0) for (const dz of [-0.2, 0.2]) b.box(x * (half + 0.24), (sy + 0.26) / 2, z1 - 0.32 + dz, 0.025, 0.2, 0.025, PALETTE.undercarriage, 0, { shade: 0.85 });
    }
  }
  // The railing: brass top rails on posts and balusters along both sides and across the back, with the steps' gaps at
  // the rear corners (a gate in each side), a round tail sign at the middle of the back rail.
  const sideZ1 = z1 - 0.62;
  for (const x of [-railX, railX]) {
    b.box(x, y + 0.62, (z0 + sideZ1) / 2, 0.05, 0.05, sideZ1 - z0, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
    b.box(x, y + 0.08, (z0 + sideZ1) / 2, 0.04, 0.04, sideZ1 - z0, PALETTE.brass, 0, { shade: 0.9, surface: 'brass' });
    for (let z = z0 + 0.1; z <= sideZ1 + 0.001; z += 0.26) b.box(x, y + 0.34, z, 0.025, 0.52, 0.025, PALETTE.brass, 0, { shade: 0.85, surface: 'brass' });
    for (const z of [z0 + 0.05, sideZ1]) b.cylinder(x, y + 0.34, z, 0.035, 0.035, 0.66, PALETTE.brass, 8, 'y', { shade: 1, surface: 'brass' });
    for (const z of [z1 - 0.06]) b.cylinder(x, y + 0.34, z, 0.035, 0.035, 0.66, PALETTE.brass, 8, 'y', { shade: 1, surface: 'brass' });
  }
  if (!end) {
    // The screw coupling: the hook on the buffer beam, a turnbuckle across the gap and its link over the waiting
    // carriage's hook, sagging a little.
    const span = gap - 0.17;
    for (let i = 0, n = 5; i < n; i++) {
      const t = (i + 0.5) / n;
      const z = z1 + 0.17 + t * span;
      const sag = 0.03 * Math.sin(t * Math.PI);
      if (i === 2) under.cylinder(0, 0.34 - sag, z, 0.03, 0.03, span / n + 0.02, PALETTE.chrome, 10, 'z', { shade: 1, surface: 'iron' });
      else under.add(new THREE.TorusGeometry(0.035, 0.012, 6, 10), PALETTE.wheel, 0, 0.34 - sag, z, 0, i % 2 ? Math.PI / 2 : 0, 0, { shade: 0.9, surface: 'iron' });
    }
    // The gangway's bellows across the gap to the next carriage: dark ribbed rubber, cut down like the end walls.
    const bellowsW = 1.7;
    const bellowsH = 0.5;
    for (let k = 0, n = 6; k < n; k++) {
      const z = z1 + 0.02 + (k / (n - 1)) * (gap - 0.04);
      b.box(0, y + bellowsH / 2, z, bellowsW + (k % 2) * 0.06, bellowsH, 0.035, '#2B2724', 0, { shade: 0.85 });
    }
    for (const side of [-1, 1]) b.box(side * (bellowsW / 2 + 0.02), y + bellowsH / 2, z1 + gap / 2, 0.04, bellowsH, gap, '#34302C', 0, { shade: 0.8 });
    return finish(b, under, liv, y, z1, zc, w, false, half, len);
  }
  b.box(0, y + 0.62, z1 - 0.06, railX * 2, 0.05, 0.05, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
  b.box(0, y + 0.08, z1 - 0.06, railX * 2, 0.04, 0.04, PALETTE.brass, 0, { shade: 0.9, surface: 'brass' });
  for (let x = -railX + 0.2; x <= railX - 0.19; x += 0.26) if (Math.abs(x) > 0.36) b.box(x, y + 0.34, z1 - 0.06, 0.025, 0.52, 0.025, PALETTE.brass, 0, { shade: 0.85, surface: 'brass' });
  b.object('deck:tailSign');
  b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 28).rotateX(Math.PI / 2), PALETTE.brass, 0, y + 0.42, z1 - 0.02, 0, 0, 0, { shade: 1, surface: 'brass' });
  b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 28).rotateX(Math.PI / 2), PALETTE.navy, 0, y + 0.42, z1 + 0.005, 0, 0, 0, { shade: 1 });
  b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 20).rotateX(Math.PI / 2), PALETTE.lampShade, 0, y + 0.42, z1 + 0.02, 0, 0, 0, { shade: 1 });
  b.endObject();
  b.cylinder(1.2, y + 0.9, z1 - 0.1, 0.035, 0.05, 0.9, PALETTE.navy, 8);
  // Visual overhaul (owner, 24 Nov: "the train abruptly ends… an end car with a standing area and a railing"): the deck
  // stays on a finished train and is furnished as a place to stand and watch the line go by.
  if (NEW_LOOK) dressDeck(b, y, z0, z1, railX);
  return finish(b, under, liv, y, z1, zc, w, true, half, len);
}

/** The deck's meshes, its lamps (the post lamp and the red tail lamps only at the end of the train) and its shadow. */
function finish(b: GeoBuilder, under: GeoBuilder, liv: GeoBuilder, y: number, z1: number, zc: number, w: number, end: boolean, half: number, len: number): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.layers.enable(STATIC_CASTER_LAYER);
  const underMesh = new THREE.Mesh(under.build(), MATERIALS.solid);
  underMesh.layers.enable(STATIC_CASTER_LAYER);
  group.add(mesh, underMesh, new THREE.Mesh(liv.build(), MATERIALS.livery));
  if (end) {
    const lamps = new GeoBuilder().cylinder(1.2, y + 1.42, z1 - 0.1, 0.07, 0.1, 0.18, PALETTE.lampShade, 10, 'y', { shade: 0.9 });
    // The red tail lamps at the back corners: the end of the train.
    for (const x of [-1, 1]) {
      lamps.object(`deck:tailLamp${x > 0 ? 1 : 0}~glow`);
      lamps.sphere(x * (half - 0.14), 0.47, z1 + 0.04, 0.06, '#FF3B30', 0, 1, { shade: 1 });
      lamps.endObject();
    }
    group.add(new THREE.Mesh(lamps.build(), MATERIALS.lamps));
  }
  // The open space under the deck in shadow on the ballast, soft at its edges (the deck stands on its bogie, 45 cm over
  // the track; without it the deck read as lying on the ground).
  for (let i = 0; i < SHADOW_LAYERS; i++) {
    const grow = SHADOW_SPREAD * (1 - i / SHADOW_LAYERS);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(w + grow * 2, len + grow * 2).rotateX(-Math.PI / 2), SHADOW);
    quad.position.set(0, SHADOW_Y + i * 0.002, zc);
    quad.renderOrder = -1;
    group.add(quad);
  }
  return group;
}

/** The deck's dressing in the new look: two deck chairs facing back down the line, plants at the corners, a lantern post. */
function dressDeck(b: GeoBuilder, y: number, z0: number, z1: number, railX: number): void {
  const tropical = ACTIVE_ROUTE.id === 'riviera';
  const frame = tropical ? '#C9A46A' : '#6B4A32';
  const cloth = tropical ? '#F28C6B' : '#2F5D50';
  for (const [i, x] of [-0.95, 0.95].entries()) {
    const z = z1 - 0.75;
    b.object(`deck:chair${i}`);
    // A deck chair: a slung seat between two frame sides, leaning back toward the carriage.
    for (const side of [-0.24, 0.24]) b.box(x + side, y + 0.26, z, 0.04, 0.04, 0.7, frame, 0, { shade: 0.9, surface: 'wood' });
    b.add(new THREE.BoxGeometry(0.46, 0.03, 0.62), cloth, x, y + 0.32, z - 0.02, -0.5, 0, 0, { shade: 1, surface: 'fabric' });
    for (const [dz, h] of [[-0.3, 0.5], [0.28, 0.3]] as [number, number][]) for (const side of [-0.22, 0.22]) b.box(x + side, y + h / 2, z + dz, 0.035, h, 0.035, frame, 0, { shade: 0.85, surface: 'wood' });
    b.endObject();
  }
  for (const [i, x] of [-(railX - 0.26), railX - 0.26].entries()) {
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
