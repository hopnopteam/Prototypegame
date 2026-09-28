import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { carriageOriginZ, DOOR_Z0, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { signTexture } from './sprites';

/**
 * The station platform on the right of the train: a tiled deck, a pink station house with a clock, a mint
 * canopy with a scalloped valance, lamps, planters and benches. Built in local coordinates that equal world
 * coordinates when the train is stopped (z offset 0); the game slides it along z as the train arrives and
 * departs.
 */
export class PlatformView {
  readonly group = new THREE.Group();
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private readonly glows: THREE.Sprite[] = [];
  private staticMesh: THREE.Mesh | null = null;
  private deckMesh: THREE.Mesh | null = null;
  private lampMesh: THREE.Mesh | null = null;
  private vendor: THREE.Group | null = null;
  length = 0;
  z0 = 0;
  z1 = 0;

  constructor() {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), this.signMaterial);
    sign.position.set(PLATFORM_X0 + 4.2, FLOOR_Y + 2.1, -1.2);
    sign.rotation.x = -0.9;
    sign.name = 'sign';
    this.group.add(sign);
    this.group.visible = false;
  }

  setStationName(name: string): void {
    this.signMaterial.map?.dispose();
    this.signMaterial.map = signTexture(name, PALETTE.navy, PALETTE.creamBand);
    this.signMaterial.needsUpdate = true;
  }

  /** Rebuilds for the current train length; the vendor stall appears once the supply car exists. */
  build(trainRearZ: number, supplyCarIndex: number | null, luggageCarIndex: number | null): void {
    for (const mesh of [this.staticMesh, this.deckMesh, this.lampMesh]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const glow of this.glows) this.group.remove(glow);
    this.glows.length = 0;
    if (this.vendor) this.group.remove(this.vendor);
    this.vendor = null;

    this.z0 = -LOCOMOTIVE_LENGTH - 4;
    this.z1 = trainRearZ + 8;
    this.length = this.z1 - this.z0;
    const zc = (this.z0 + this.z1) / 2;
    const x0 = PLATFORM_X0;
    const x1 = PLATFORM_X0 + PLATFORM_WIDTH;
    const b = new GeoBuilder();
    const deck = new GeoBuilder();
    const lamps = new GeoBuilder();

    // Deck: stone base, a tiled top, the yellow safety line and a coping stone along the edge.
    b.box((x0 + x1) / 2, FLOOR_Y / 2 - 0.02, zc, x1 - x0, FLOOR_Y - 0.04, this.length, '#D9CCB4', 0, { shade: 0.75 });
    deck.box((x0 + x1) / 2 + 0.2, FLOOR_Y - 0.01, zc, x1 - x0 - 0.4, 0.02, this.length, PALETTE.platformTile, 0, { pattern: PATTERN.diamond, color2: PALETTE.platformTile2, scale: 0.7, shade: 1 });
    deck.box(x0 + 0.2, FLOOR_Y - 0.008, zc, 0.4, 0.024, this.length, '#F4EEE2', 0, { shade: 1 });
    deck.box(x0 + 0.34, FLOOR_Y + 0.006, zc, 0.12, 0.004, this.length, PALETTE.platformEdge, 0, { shade: 1 });

    // Back railing: navy with brass caps.
    b.box(x1 - 0.05, FLOOR_Y + 0.55, zc, 0.05, 0.05, this.length, PALETTE.navy, 0, { shade: 1 });
    for (let z = this.z0; z <= this.z1; z += 1.2) b.box(x1 - 0.05, FLOOR_Y + 0.28, z, 0.04, 0.56, 0.04, PALETTE.navy, 0, { shade: 0.85 });

    // Station house behind the railing, near the lobby door: pink with cream trim, terracotta roof.
    const bz0 = -9;
    const bz1 = 9;
    const bx = x1 + 3.2;
    b.box(bx, 1.8, (bz0 + bz1) / 2, 5.6, 3.6, bz1 - bz0, PALETTE.stationPink, 0, { shade: 0.8 });
    b.box(bx, 0.35, (bz0 + bz1) / 2, 5.7, 0.7, bz1 - bz0 + 0.1, '#D98E8C', 0, { shade: 0.85 });
    b.box(bx, 3.65, (bz0 + bz1) / 2, 6.0, 0.2, bz1 - bz0 + 0.4, PALETTE.stationTrim, 0, { shade: 1 });
    b.prism(bx, 3.75, (bz0 + bz1) / 2, 6.4, 2.0, bz1 - bz0 + 0.8, PALETTE.roofTerracotta, { pattern: PATTERN.stripesZ, color2: '#B85A4D', scale: 0.25, shade: 1 });
    b.box(bx, 5.3, bz0 + 3, 0.8, 1.2, 0.8, PALETTE.stationTrim, 0, { shade: 0.85 });
    // Facade toward the train: tall cream-framed windows and doors, and the big clock.
    const face = x1 + 0.39;
    for (let z = bz0 + 1.2; z < bz1 - 0.8; z += 2.2) {
      const door = Math.abs(z) < 1.2;
      b.box(face - 0.02, door ? 1.4 : 1.8, z, 0.06, door ? 2.2 : 1.4, 1.1, PALETTE.stationTrim, 0, { shade: 1 });
      b.box(face - 0.05, door ? 1.35 : 1.8, z, 0.03, door ? 2.0 : 1.2, 0.9, door ? PALETTE.canopyDark : PALETTE.windowDay, 0, { shade: 1 });
    }
    b.cylinder(face - 0.05, 3.1, 0, 0.55, 0.55, 0.08, PALETTE.gold, 24, 'x', { shade: 1 });
    b.cylinder(face - 0.1, 3.1, 0, 0.48, 0.48, 0.04, PALETTE.linen, 24, 'x', { shade: 1 });
    b.box(face - 0.13, 3.25, 0, 0.02, 0.3, 0.035, PALETTE.ink, 0, { shade: 1 });
    b.box(face - 0.13, 3.1, 0.1, 0.02, 0.035, 0.22, PALETTE.ink, 0, { shade: 1 });

    // Canopy over the back half of the platform, clear of the walking area, with a scalloped valance.
    const canopyX = x1 - 1.0;
    b.box(canopyX + 0.4, FLOOR_Y + 3.02, zc, 2.4, 0.1, this.length - 2, PALETTE.canopy, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.stationTrim, scale: 0.5, shade: 1 });
    for (let z = this.z0 + 1.2; z < this.z1 - 1; z += 0.5) b.cylinder(canopyX - 0.8, FLOOR_Y + 2.93, z, 0.24, 0.24, 0.04, PALETTE.canopyDark, 10, 'x', { shade: 1 });
    for (let z = this.z0 + 3; z < this.z1 - 2; z += 6) {
      b.cylinder(x1 - 0.5, FLOOR_Y + 1.5, z, 0.07, 0.09, 3.0, PALETTE.navy, 10, 'y', { shade: 0.85 });
      b.box(x1 - 0.5, FLOOR_Y + 2.95, z, 0.2, 0.1, 0.2, PALETTE.gold, 0, { shade: 1 });
      lamps.sphere(x1 - 0.9, FLOOR_Y + 2.55, z, 0.16, PALETTE.lampShade, 1);
      b.box(x1 - 0.72, FLOOR_Y + 2.72, z, 0.36, 0.03, 0.03, PALETTE.navy, 0, { shade: 1 });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: PALETTE.lampGlow, transparent: true, opacity: 0, depthWrite: false }));
      glow.scale.set(1.8, 1.8, 1);
      glow.position.set(x1 - 0.9, FLOOR_Y + 2.55, z);
      this.group.add(glow);
      this.glows.push(glow);
    }

    // Benches and flower planters.
    for (let z = this.z0 + 6; z < this.z1 - 3; z += 11) {
      b.box(x1 - 1.1, FLOOR_Y + 0.36, z, 0.5, 0.07, 1.6, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.walnut, scale: 0.1, shade: 1 });
      b.box(x1 - 0.88, FLOOR_Y + 0.6, z, 0.06, 0.4, 1.6, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.walnut, scale: 0.1, shade: 1 });
      for (const dz of [-0.7, 0.7]) b.box(x1 - 1.1, FLOOR_Y + 0.17, z + dz, 0.42, 0.34, 0.06, PALETTE.navy, 0, { shade: 0.85 });
      b.box(x1 - 1.0, FLOOR_Y + 0.25, z + 2.4, 0.6, 0.5, 0.6, PALETTE.stationTrim, 0, { shade: 0.8 });
      b.sphere(x1 - 1.08, FLOOR_Y + 0.62, z + 2.3, 0.2, PALETTE.blossom, 1);
      b.sphere(x1 - 0.92, FLOOR_Y + 0.6, z + 2.52, 0.18, PALETTE.mustard, 1);
      b.sphere(x1 - 1.0, FLOOR_Y + 0.66, z + 2.46, 0.15, PALETTE.hedge, 1);
    }

    // A row of lamp posts with flower tubs between them, behind where guests wait.
    const rowX = x1 - 2.05;
    deck.box(rowX, FLOOR_Y + 0.003, zc, 1.1, 0.01, this.length - 1, PALETTE.stationPink, 0, { pattern: PATTERN.stripesZ, color2: '#EAA5A2', scale: 0.45, shade: 1 });
    for (let z = this.z0 + 5; z < this.z1 - 3; z += 8) {
      b.cylinder(rowX, FLOOR_Y + 0.08, z, 0.14, 0.18, 0.16, PALETTE.navy, 12, 'y', { shade: 0.8 });
      b.cylinder(rowX, FLOOR_Y + 1.2, z, 0.04, 0.06, 2.2, PALETTE.navy, 10, 'y', { shade: 0.85 });
      b.box(rowX, FLOOR_Y + 2.2, z, 0.5, 0.04, 0.04, PALETTE.navy, 0, { shade: 1 });
      for (const dz of [-0.25, 0.25]) lamps.sphere(rowX, FLOOR_Y + 2.12, z + dz, 0.11, PALETTE.lampShade, 1);
      const tubZ = z + 4;
      b.rounded(rowX, FLOOR_Y + 0.2, tubZ, 0.7, 0.4, 0.7, 0.12, PALETTE.canopy, { shade: 0.75 });
      b.sphere(rowX - 0.12, FLOOR_Y + 0.52, tubZ - 0.1, 0.2, PALETTE.blossom, 1);
      b.sphere(rowX + 0.14, FLOOR_Y + 0.5, tubZ + 0.12, 0.18, PALETTE.linen, 1);
      b.sphere(rowX, FLOOR_Y + 0.56, tubZ + 0.05, 0.14, PALETTE.hedge, 1);
    }

    // Sign posts under the name board.
    for (const dz of [-1.5, 1.5]) b.box(x0 + 4.2 + dz * 0.7, FLOOR_Y + 1.0, -1.2, 0.07, 2.0, 0.07, PALETTE.navy, 0, { shade: 0.9 });

    // Luggage trolley near where suitcases wait.
    const luggageZ = luggageCarIndex !== null ? carriageOriginZ(luggageCarIndex) + DOOR_Z0 + 3.2 : DOOR_Z0 + 3.2;
    b.box(x0 + 1.6, FLOOR_Y + 0.2, luggageZ, 1.3, 0.06, 1.8, PALETTE.oak, 0, { pattern: PATTERN.stripesX, color2: PALETTE.walnut, scale: 0.12, shade: 1 });
    b.box(x0 + 1.6, FLOOR_Y + 0.5, luggageZ - 0.88, 1.3, 0.6, 0.05, PALETTE.navy, 0, { shade: 0.9 });
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.7, 0.7]) b.cylinder(x0 + 1.6 + dx, FLOOR_Y + 0.1, luggageZ + dz, 0.1, 0.1, 0.06, PALETTE.ink, 10, 'x');

    this.staticMesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    this.staticMesh.castShadow = true;
    this.staticMesh.receiveShadow = true;
    this.group.add(this.staticMesh);
    this.deckMesh = new THREE.Mesh(deck.build(), MATERIALS.solid);
    this.deckMesh.receiveShadow = true;
    this.group.add(this.deckMesh);
    this.lampMesh = new THREE.Mesh(lamps.build(), MATERIALS.lamps);
    this.group.add(this.lampMesh);

    if (supplyCarIndex !== null) this.vendor = buildVendor(carriageOriginZ(supplyCarIndex));
    if (this.vendor) this.group.add(this.vendor);
  }

  /** Where the suitcases for boarding guests are piled (local = world when stopped). */
  static luggagePilePosition(luggageCarIndex: number | null): { x: number; z: number } {
    const z = luggageCarIndex !== null ? carriageOriginZ(luggageCarIndex) + DOOR_Z0 + 3.0 : DOOR_Z0 + 3.2;
    return { x: PLATFORM_X0 + 1.6, z };
  }

  static vendorPosition(supplyCarIndex: number): { x: number; z: number } {
    return { x: PLATFORM_X0 + 2.2, z: carriageOriginZ(supplyCarIndex) + DOOR_Z0 - 1.2 };
  }

  setOffset(z: number): void {
    this.group.position.z = z;
  }

  setNight(amount: number): void {
    for (const glow of this.glows) (glow.material as THREE.SpriteMaterial).opacity = 0.55 * amount;
  }
}

/** The platform vendor who sells supply crates: a cart under a striped awning. */
function buildVendor(originZ: number): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const x = PLATFORM_X0 + 3.4;
  const z = originZ + DOOR_Z0 - 1.2;
  b.rounded(x, FLOOR_Y + 0.45, z, 1.4, 0.9, 2.0, 0.08, PALETTE.canopy, { shade: 0.8 });
  b.box(x - 0.71, FLOOR_Y + 0.5, z, 0.02, 0.5, 1.7, PALETTE.stationTrim, 0, { shade: 1 });
  for (const dz of [-0.9, 0.9]) b.cylinder(x + 0.55, FLOOR_Y + 1.2, z + dz, 0.035, 0.035, 1.5, PALETTE.navy, 8);
  b.box(x + 0.2, FLOOR_Y + 2.0, z, 1.8, 0.06, 2.1, PALETTE.stationPink, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.stationTrim, scale: 0.26, shade: 1 });
  for (let dz = -0.95; dz <= 0.96; dz += 0.3) b.cylinder(x - 0.7, FLOOR_Y + 1.95, z + dz, 0.15, 0.15, 0.04, PALETTE.stationPink, 10, 'x', { shade: 1 });
  b.box(x - 0.2, FLOOR_Y + 1.05, z - 0.5, 0.6, 0.3, 0.5, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#A87544', scale: 0.1, shade: 0.85 });
  b.box(x - 0.2, FLOOR_Y + 1.05, z + 0.4, 0.5, 0.3, 0.6, '#D2A06C', 0, { pattern: PATTERN.stripesZ, color2: '#B3834F', scale: 0.1, shade: 0.85 });
  for (const dx of [-0.5, 0.5]) b.cylinder(x + dx, FLOOR_Y + 0.12, z + 0.95, 0.12, 0.12, 0.05, PALETTE.ink, 10, 'z');
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
