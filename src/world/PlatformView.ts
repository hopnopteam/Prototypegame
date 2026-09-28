import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder } from './geo';
import { carriageOriginZ, DOOR_Z0, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';
import { signTexture } from './sprites';

/**
 * The station platform on the right of the train. Built in local coordinates that equal world coordinates
 * when the train is stopped (z offset 0); the game slides it along z as the train arrives and departs.
 */
export class PlatformView {
  readonly group = new THREE.Group();
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private readonly glows: THREE.Sprite[] = [];
  private staticMesh: THREE.Mesh | null = null;
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
    this.signMaterial.map = signTexture(name, '#1F3B57', '#FFF6E4');
    this.signMaterial.needsUpdate = true;
  }

  /** Rebuilds for the current train length; the vendor stall appears once the supply car exists. */
  build(trainRearZ: number, supplyCarIndex: number | null, luggageCarIndex: number | null): void {
    if (this.staticMesh) {
      this.group.remove(this.staticMesh);
      this.staticMesh.geometry.dispose();
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

    b.box((x0 + x1) / 2, FLOOR_Y / 2, zc, x1 - x0, FLOOR_Y, this.length, PALETTE.platformStone);
    b.box(x0 + 0.18, FLOOR_Y + 0.004, zc, 0.36, 0.01, this.length, PALETTE.platformEdge);
    // Paving lines.
    for (let z = this.z0 + 2; z < this.z1; z += 2.5) b.box((x0 + x1) / 2 + 0.2, FLOOR_Y + 0.003, z, x1 - x0 - 0.6, 0.006, 0.05, '#C9BCA4');
    // Back railing.
    b.box(x1 - 0.05, FLOOR_Y + 0.55, zc, 0.06, 0.06, this.length, PALETTE.ink);
    for (let z = this.z0; z <= this.z1; z += 2) b.box(x1 - 0.05, FLOOR_Y + 0.3, z, 0.06, 0.6, 0.06, PALETTE.ink);

    // Station building behind the railing, near the lobby door.
    const bz0 = -9;
    const bz1 = 9;
    b.box(x1 + 3.2, 1.8, (bz0 + bz1) / 2, 5.6, 3.6, bz1 - bz0, PALETTE.brick);
    b.box(x1 + 3.2, 3.7, (bz0 + bz1) / 2, 6.0, 0.2, bz1 - bz0 + 0.4, PALETTE.cream);
    b.prism(x1 + 3.2, 3.8, (bz0 + bz1) / 2, 6.4, 2.0, bz1 - bz0 + 0.8, PALETTE.roofSlate);
    b.box(x1 + 3.2, 5.3, bz0 + 3, 0.8, 1.2, 0.8, PALETTE.brick);
    // Clock above the entrance.
    b.cylinder(x1 + 0.35, 3.1, 0, 0.45, 0.45, 0.1, PALETTE.cream, 16, 'x');

    // Canopy over the back half of the platform, clear of the walking area.
    for (let z = this.z0 + 3; z < this.z1 - 2; z += 6) {
      b.box(x1 - 0.5, FLOOR_Y + 1.5, z, 0.14, 3.0, 0.14, PALETTE.trainBodyDark);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ color: PALETTE.lampGlow, transparent: true, opacity: 0, depthWrite: false }));
      lamp.scale.set(1.8, 1.8, 1);
      lamp.position.set(x1 - 0.9, FLOOR_Y + 2.6, z);
      this.group.add(lamp);
      this.glows.push(lamp);
      b.box(x1 - 0.9, FLOOR_Y + 2.6, z, 0.3, 0.3, 0.3, PALETTE.lampGlow);
    }
    b.box(x1 + 0.2, FLOOR_Y + 3.05, zc, 1.8, 0.12, this.length - 2, PALETTE.trainBody);

    // Benches and planters.
    for (let z = this.z0 + 6; z < this.z1 - 3; z += 11) {
      b.box(x1 - 1.1, FLOOR_Y + 0.35, z, 0.5, 0.08, 1.6, PALETTE.woodLight);
      b.box(x1 - 0.9, FLOOR_Y + 0.6, z, 0.08, 0.4, 1.6, PALETTE.woodLight);
      b.box(x1 - 1.1, FLOOR_Y + 0.17, z, 0.4, 0.34, 1.4, PALETTE.ink);
      b.box(x1 - 1.0, FLOOR_Y + 0.25, z + 2.4, 0.6, 0.5, 0.6, PALETTE.brick);
      b.sphere(x1 - 1.0, FLOOR_Y + 0.7, z + 2.4, 0.38, '#E26D8C', 0);
    }

    // Sign posts under the name board.
    for (const dz of [-1.5, 1.5]) b.box(x0 + 4.2 + dz * 0.7, FLOOR_Y + 1.0, -1.2, 0.08, 2.0, 0.08, PALETTE.ink);

    // Luggage trolley near where suitcases wait.
    const luggageZ = luggageCarIndex !== null ? carriageOriginZ(luggageCarIndex) + DOOR_Z0 + 3.2 : DOOR_Z0 + 3.2;
    b.box(x0 + 1.6, FLOOR_Y + 0.2, luggageZ, 1.3, 0.08, 1.8, PALETTE.chrome);
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.7, 0.7]) b.cylinder(x0 + 1.6 + dx, FLOOR_Y + 0.1, luggageZ + dz, 0.1, 0.1, 0.06, PALETTE.ink, 8, 'x');

    this.staticMesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    this.group.add(this.staticMesh);

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

function buildVendor(originZ: number): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const x = PLATFORM_X0 + 3.4;
  const z = originZ + DOOR_Z0 - 1.2;
  b.box(x, FLOOR_Y + 0.45, z, 1.4, 0.9, 2.0, PALETTE.woodLight);
  for (const dz of [-0.9, 0.9]) b.box(x + 0.55, FLOOR_Y + 1.2, z + dz, 0.08, 1.5, 0.08, PALETTE.ink);
  for (let i = 0; i < 5; i++) b.box(x + 0.2, FLOOR_Y + 2.0, z - 1.0 + 0.2 + i * 0.4, 1.8, 0.08, 0.4, i % 2 ? PALETTE.cream : PALETTE.trainBody);
  b.box(x - 0.2, FLOOR_Y + 1.05, z - 0.5, 0.6, 0.3, 0.5, '#C99A5B');
  b.box(x - 0.2, FLOOR_Y + 1.05, z + 0.4, 0.5, 0.3, 0.6, '#B8864E');
  group.add(new THREE.Mesh(b.build(), MATERIALS.solid));
  return group;
}
