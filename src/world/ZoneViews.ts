import * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { FLOOR_Y } from './CarriageView';
import { createZoneMaterial } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, TILE_MARKER_ASPECT, TILE_MARKER_WIDTH, TileFace, TileMarker } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';

const RING_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Floor ring for a walk-over zone, with an optional floating icon so its purpose reads at a glance. */

/** Moves an object and everything in it onto the world-UI layer. */
export function markWorldUi(object: THREE.Object3D): void {
  object.traverse((o) => o.layers.set(WORLD_UI_LAYER));
}

export class ZoneRing {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly icon: THREE.Sprite | null;
  private time = Math.random() * 5;
  private lit = false;
  private litAmount = 0;

  constructor(radius: number, icon: IconName | null, color = PALETTE.zone, iconHeight = 0.9) {
    this.material = createZoneMaterial(color);
    const ring = new THREE.Mesh(RING_GEOMETRY, this.material);
    ring.scale.set(radius * 2, 1, radius * 2);
    // Above the cabin mat's top layer (3 cm), so a mat never hides a pad.
    ring.position.y = FLOOR_Y + 0.036;
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

  /** "You're needed here": the ring brightens and the icon bobs higher. */
  set highlight(value: boolean) {
    this.lit = value;
  }

  set iconShown(value: boolean) {
    if (this.icon) this.icon.visible = value;
  }

  /** A pad whose job changes (a room's pad: strip the bed, then make it) shows the icon of the job now. */
  setIcon(name: IconName): void {
    if (!this.icon) return;
    const material = this.icon.material as THREE.SpriteMaterial;
    material.map = bubbleTexture(name, 'plain');
  }

  set dimmed(value: boolean) {
    this.material.uniforms.uOpacity.value = value ? 0.35 : 1;
    if (this.icon) (this.icon.material as THREE.SpriteMaterial).opacity = value ? 0.4 : 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.litAmount += ((this.lit ? 1 : 0) - this.litAmount) * Math.min(1, dt * 8);
    const lit = this.litAmount;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uLit.value = lit;
    if (this.icon) {
      this.icon.position.y = FLOOR_Y + 0.9 + lit * 0.25 + Math.sin(this.time * (2.2 + lit * 3)) * (0.06 + lit * 0.08);
      const s = 0.5 + lit * 0.18;
      this.icon.scale.set(s, s, 1);
    }
  }
}

/** How far the tile's pad stands proud of the floor: a physical plate you step on, not a sticker. */
const PAD_HEIGHT = 0.06;
/** How high a tile's marker floats over the floor: above the room walls, below the HUD's reach. */
const MARKER_HEIGHT = 1.3;
/** Where a tile's floating marker hangs (world height); the close-up label takes its exact place. */
export const TILE_MARKER_Y = FLOOR_Y + MARKER_HEIGHT;
/** Lip colours by state (the face's border colour, a shade darker). */
const LIP = { idle: '#9C7A52', affordable: '#2F7D50', active: '#C8891B', locked: '#8D8478' };

/** A rounded square, as flat geometry lying on the floor (the pad under a tile's face). */
function roundedPad(size: number, height: number): THREE.BufferGeometry {
  const half = size / 2;
  const r = size * (30 / 256);
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * MPH-style unlock tile: a raised, rounded plate on the floor with a bright face showing what it unlocks and
 * what is left to pay. Its lip takes the state colour (green when you can afford it, gold while paying).
 */
export class TileView {
  readonly group = new THREE.Group();
  readonly face = new TileFace();
  /** Floats over the plate: what it is and what it costs, never hidden behind a wall. */
  readonly marker = new TileMarker();
  private readonly pad = new THREE.Group();
  private readonly plane: THREE.Mesh;
  private readonly lip: THREE.Mesh;
  private readonly lipMaterial = new THREE.MeshLambertMaterial({ color: LIP.idle });
  private lipState = '';
  private time = Math.random() * 3;
  private popT = 1;

  constructor(size = 1.3, private readonly locked = false) {
    const material = new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.lip = new THREE.Mesh(roundedPad(size * 0.97, PAD_HEIGHT), this.lipMaterial);
    this.lip.position.y = 0.004;
    this.lip.receiveShadow = true;
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
    this.plane.position.y = 0.004 + PAD_HEIGHT + 0.008;
    this.plane.renderOrder = 3;
    // The pad pivots on the floor, so pressing it squashes the plate down onto the floor, never through it.
    this.pad.position.y = FLOOR_Y;
    this.pad.add(this.lip, this.plane);
    this.group.add(this.pad);
    this.marker.sprite.position.y = FLOOR_Y + MARKER_HEIGHT;
    this.group.add(this.marker.sprite);
    this.popT = 0;
    this.setLip(locked ? 'locked' : 'idle');
  }

  private setLip(state: keyof typeof LIP): void {
    if (state === this.lipState) return;
    this.lipState = state;
    this.lipMaterial.color.set(LIP[state]);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  /** `marker`: whether the floating marker shows (the close-up label takes its place near the conductor). */
  update(dt: number, affordable: boolean, active: boolean, marker = true): void {
    this.time += dt;
    this.popT = Math.min(1, this.popT + dt * 3);
    const appear = this.popT < 1 ? 0.4 + 0.6 * Math.sin(this.popT * Math.PI * 0.5) * 1.08 : 1;
    const breathe = affordable && !active ? 1 + Math.sin(this.time * 4) * 0.035 : 1;
    const s = appear * breathe;
    // Stepping on it presses the plate down a little, like a real button.
    this.pad.scale.set(s, active ? 0.45 : 1, s);
    // The marker bobs gently, and steps aside while you stand on the tile (the plate shows the fill).
    this.marker.sprite.visible = marker && !active;
    this.marker.sprite.position.y = FLOOR_Y + MARKER_HEIGHT + Math.sin(this.time * 2.2) * 0.04;
    this.marker.sprite.scale.set(TILE_MARKER_WIDTH * appear, TILE_MARKER_WIDTH * TILE_MARKER_ASPECT * appear, 1);
    if (!this.locked) this.setLip(active ? 'active' : affordable ? 'affordable' : 'idle');
  }

  dispose(): void {
    this.face.dispose();
    this.marker.dispose();
    (this.plane.material as THREE.Material).dispose();
    this.plane.geometry.dispose();
    this.lip.geometry.dispose();
    this.lipMaterial.dispose();
  }
}
