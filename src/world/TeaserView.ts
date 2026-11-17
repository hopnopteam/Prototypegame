import * as THREE from 'three';
import { buildCarriageRoof, FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { CARRIAGE_LENGTH, EXTERIOR_WALL_HEIGHT, HALF_WIDTH } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { STATIC_CASTER_LAYER } from './Lighting';

/**
 * Phase 1 (owner: "the next carriage is already hitched behind the train under a tarp, showing only a small sliver, not
 * enterable"): the next carriage waiting behind the rear deck. It is cheap on purpose (one body box, an underframe, two
 * bogies and the canvas tarp the real carriage arrives under: three draws), never walkable, and says nothing about
 * what is under the tarp: every carriage is a surprise (session 29). On coupling the real carriage, covered the same
 * way, takes its place and rolls forward the few metres to the train.
 */
export class TeaserView {
  readonly group = new THREE.Group();
  private readonly tarp: THREE.Mesh;

  constructor() {
    const body = new GeoBuilder();
    const top = FLOOR_Y + EXTERIOR_WALL_HEIGHT;
    const zc = CARRIAGE_LENGTH / 2;
    // The sides and ends (the tarp's hems hang over their tops), in the train's livery.
    body.box(0, (FLOOR_Y + top) / 2, zc, HALF_WIDTH * 2 - 0.04, top - FLOOR_Y, CARRIAGE_LENGTH - 0.04, '#FFFFFF', 0, { shade: 0.82 });
    const frame = new GeoBuilder();
    // The underframe and two bogies with their wheels.
    frame.box(0, FLOOR_Y - 0.12, zc, HALF_WIDTH * 2 - 0.3, 0.2, CARRIAGE_LENGTH - 0.6, '#2E3138', 0, { shade: 0.8 });
    for (const bz of [2.6, CARRIAGE_LENGTH - 2.6]) {
      frame.box(0, 0.3, bz, 1.9, 0.18, 2.2, '#3A3D44', 0, { shade: 0.8 });
      for (const dz of [-0.7, 0.7]) for (const x of [-1.0, 1.0]) frame.cylinder(x, 0.26, bz + dz, 0.26, 0.26, 0.1, PALETTE.iron, 12, 'x', { shade: 0.85 });
    }
    const bodyMesh = new THREE.Mesh(body.build(), MATERIALS.livery);
    const frameMesh = new THREE.Mesh(frame.build(), MATERIALS.solid);
    this.tarp = buildCarriageRoof();
    for (const mesh of [bodyMesh, frameMesh, this.tarp]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.enable(STATIC_CASTER_LAYER);
    }
    this.group.add(bodyMesh, frameMesh, this.tarp);
    this.group.visible = false;
  }
}
