import * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from './CarriageView';
import { createZoneMaterial } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, TileFace } from './sprites';

const RING_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Floor ring for a walk-over zone, with an optional floating icon so its purpose reads at a glance. */
export class ZoneRing {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly icon: THREE.Sprite | null;
  private time = Math.random() * 5;

  constructor(radius: number, icon: IconName | null, color = PALETTE.zone, iconHeight = 0.9) {
    this.material = createZoneMaterial(color);
    const ring = new THREE.Mesh(RING_GEOMETRY, this.material);
    ring.scale.set(radius * 2, 1, radius * 2);
    ring.position.y = FLOOR_Y + 0.015;
    ring.renderOrder = 2;
    this.group.add(ring);
    if (icon) {
      this.icon = makeSprite(bubbleTexture(icon, 'plain'), 0.5);
      this.icon.position.y = FLOOR_Y + iconHeight;
      this.group.add(this.icon);
    } else {
      this.icon = null;
    }
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  set progress(value: number) {
    this.material.uniforms.uProgress.value = value;
  }

  set pulse(value: number) {
    this.material.uniforms.uPulse.value = value;
  }

  set visible(value: boolean) {
    this.group.visible = value;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  set dimmed(value: boolean) {
    this.material.uniforms.uOpacity.value = value ? 0.35 : 1;
    if (this.icon) (this.icon.material as THREE.SpriteMaterial).opacity = value ? 0.4 : 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this.icon) this.icon.position.y = FLOOR_Y + 0.9 + Math.sin(this.time * 2.2) * 0.06;
  }
}

/** MPH-style unlock tile: a square on the floor showing what it unlocks and what is left to pay. */
export class TileView {
  readonly group = new THREE.Group();
  readonly face = new TileFace();
  private readonly plane: THREE.Mesh;
  private time = Math.random() * 3;
  private popT = 1;

  constructor(size = 1.3) {
    const material = new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
    this.plane.position.y = FLOOR_Y + 0.02;
    this.plane.renderOrder = 3;
    this.group.add(this.plane);
    this.popT = 0;
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  update(dt: number, affordable: boolean, active: boolean): void {
    this.time += dt;
    this.popT = Math.min(1, this.popT + dt * 3);
    const appear = this.popT < 1 ? 0.4 + 0.6 * Math.sin(this.popT * Math.PI * 0.5) * 1.08 : 1;
    const breathe = affordable && !active ? 1 + Math.sin(this.time * 4) * 0.035 : 1;
    const press = active ? 0.94 : 1;
    const s = appear * breathe * press;
    this.plane.scale.set(s, 1, s);
  }

  dispose(): void {
    this.face.dispose();
    (this.plane.material as THREE.Material).dispose();
    this.plane.geometry.dispose();
  }
}
