import * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { GeoBuilder } from './geo';
import { MATERIALS, SHADOW_GEOMETRY } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, type BubbleStyle } from './sprites';

export type HatKind = 'conductor' | 'pillbox' | 'cap' | 'beanie' | 'bun' | 'none';
export type AccessoryKind = 'briefcase' | 'backpack' | 'handbag' | 'flower' | 'furcoat' | 'apron' | 'child' | 'camera' | 'none';

export interface CharacterLook {
  body: string;
  accent: string;
  skin: string;
  hair: string;
  pants?: string;
  hat?: HatKind;
  accessory?: AccessoryKind;
  /** Staff and the conductor animate their arms (for carrying). */
  arms?: boolean;
}

const HIP_Y = 0.36;
const SHOULDER_Y = 0.8;
const HEAD_Y = 1.04;
export const STACK_BASE_Y = 0.78;

const bodyCache = new Map<string, THREE.BufferGeometry>();
const limbCache = new Map<string, THREE.BufferGeometry>();

function bodyGeometry(look: CharacterLook): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const b = new GeoBuilder();
  const fur = look.accessory === 'furcoat';
  b.cylinder(0, HIP_Y + 0.23, 0, fur ? 0.25 : 0.2, fur ? 0.34 : 0.24, 0.46, look.body, 8);
  if (fur) b.cylinder(0, SHOULDER_Y + 0.02, 0, 0.26, 0.26, 0.1, look.accent, 10);
  // Head, hair shell, eyes and cheeks.
  b.sphere(0, HEAD_Y, 0, 0.25, look.skin, 1);
  if (look.hat !== 'conductor' && look.hat !== 'cap' && look.hat !== 'beanie' && look.hat !== 'pillbox') {
    b.sphere(0, HEAD_Y + 0.07, -0.05, 0.25, look.hair, 1);
  } else {
    b.sphere(0, HEAD_Y + 0.02, -0.07, 0.24, look.hair, 1);
  }
  for (const x of [-0.085, 0.085]) b.box(x, HEAD_Y + 0.01, 0.235, 0.05, 0.07, 0.03, PALETTE.ink);
  for (const x of [-0.15, 0.15]) b.box(x, HEAD_Y - 0.07, 0.2, 0.06, 0.03, 0.02, '#F0A2A2');

  switch (look.hat) {
    case 'conductor':
      b.cylinder(0, HEAD_Y + 0.24, -0.01, 0.27, 0.25, 0.14, look.accent === PALETTE.brass ? '#233459' : look.body, 12);
      b.cylinder(0, HEAD_Y + 0.2, -0.01, 0.255, 0.255, 0.04, PALETTE.brass, 12);
      b.box(0, HEAD_Y + 0.17, 0.24, 0.3, 0.03, 0.14, PALETTE.ink);
      break;
    case 'pillbox':
      b.cylinder(0, HEAD_Y + 0.26, 0, 0.17, 0.17, 0.14, look.accent, 10);
      break;
    case 'cap':
      b.sphere(0, HEAD_Y + 0.12, 0, 0.23, look.accent, 1);
      b.box(0, HEAD_Y + 0.12, -0.25, 0.26, 0.03, 0.16, look.accent);
      break;
    case 'beanie':
      b.cone(0, HEAD_Y + 0.28, -0.02, 0.24, 0.3, look.accent, 8);
      break;
    case 'bun':
      b.sphere(0, HEAD_Y + 0.28, -0.1, 0.1, look.hair, 1);
      break;
    default:
      break;
  }

  switch (look.accessory) {
    case 'backpack':
      b.box(0, HIP_Y + 0.28, -0.26, 0.36, 0.42, 0.2, look.accent);
      b.box(0, HIP_Y + 0.52, -0.26, 0.3, 0.1, 0.18, '#8C5A32');
      break;
    case 'flower':
      b.sphere(0.1, SHOULDER_Y - 0.08, 0.2, 0.06, look.accent, 0);
      b.sphere(0.1, SHOULDER_Y - 0.08, 0.22, 0.03, '#FFE08A', 0);
      break;
    case 'apron':
      b.box(0, HIP_Y + 0.18, 0.2, 0.3, 0.36, 0.03, '#FFFFFF');
      break;
    case 'camera':
      b.box(0, SHOULDER_Y - 0.1, 0.22, 0.18, 0.12, 0.08, '#2B2B33');
      b.cylinder(0, SHOULDER_Y - 0.1, 0.28, 0.04, 0.04, 0.06, '#5A6273', 8, 'z');
      break;
    default:
      break;
  }
  // Brass buttons for uniforms with brass accents.
  if (look.accent === PALETTE.brass) for (const y of [0.5, 0.62, 0.74]) b.box(0, y, 0.215, 0.04, 0.04, 0.02, PALETTE.brass);
  const geometry = b.build();
  bodyCache.set(key, geometry);
  return geometry;
}

function legGeometry(color: string): THREE.BufferGeometry {
  const key = `leg:${color}`;
  let g = limbCache.get(key);
  if (!g) {
    g = new GeoBuilder().box(0, -0.17, 0, 0.13, 0.34, 0.14, color).box(0, -0.33, 0.03, 0.14, 0.05, 0.2, PALETTE.ink).build();
    limbCache.set(key, g);
  }
  return g;
}

function armGeometry(color: string, skin: string, carried: AccessoryKind | undefined, side: 1 | -1): THREE.BufferGeometry {
  const key = `arm:${color}:${skin}:${carried}:${side}`;
  let g = limbCache.get(key);
  if (!g) {
    const b = new GeoBuilder().box(0, -0.15, 0, 0.1, 0.32, 0.11, color).sphere(0, -0.33, 0, 0.065, skin, 0);
    if (carried === 'briefcase' && side === 1) b.box(0, -0.42, 0.02, 0.07, 0.2, 0.28, '#5A3B2A');
    if (carried === 'handbag' && side === -1) b.box(0, -0.4, 0, 0.07, 0.14, 0.2, '#C94F6D');
    g = b.build();
    limbCache.set(key, g);
  }
  return g;
}

/**
 * A chibi character: merged body + separate legs (and arms for staff), a blob shadow, an optional speech
 * bubble, and an anchor where carried items stack.
 */
export class CharacterView {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly stackAnchor = new THREE.Object3D();
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly shadow: THREE.Mesh;
  private bubble: THREE.Sprite | null = null;
  private bubbleKey = '';
  private phase = Math.random() * 10;
  private carrying = false;
  private pose: 'stand' | 'sleep' | 'sit' = 'stand';
  private bubbleTime = 0;
  private bubbleBaseY = 1.85;
  private squash = 0;

  constructor(readonly look: CharacterLook, scale = 1) {
    this.root.add(this.body);
    const pants = look.pants ?? '#3A3440';
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.1, HIP_Y, 0);
      pivot.add(new THREE.Mesh(legGeometry(pants), MATERIALS.character));
      this.body.add(pivot);
      this.legs.push(pivot);
    }
    const bodyMesh = new THREE.Mesh(bodyGeometry(look), MATERIALS.character);
    this.body.add(bodyMesh);

    const carried = look.accessory;
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.27, SHOULDER_Y, 0);
      pivot.add(new THREE.Mesh(armGeometry(look.body, look.skin, carried, side), MATERIALS.character));
      pivot.rotation.z = side * 0.12;
      this.body.add(pivot);
      this.arms.push(pivot);
    }

    this.stackAnchor.position.set(0, STACK_BASE_Y, 0.34);
    this.body.add(this.stackAnchor);

    this.shadow = new THREE.Mesh(SHADOW_GEOMETRY, MATERIALS.shadow);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    this.root.scale.setScalar(scale);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setFacing(angle: number): void {
    this.root.rotation.y = angle;
  }

  setCarrying(carrying: boolean): void {
    this.carrying = carrying;
  }

  /** A little squash-and-stretch hop (pickups, payments). */
  bounce(amount = 1): void {
    this.squash = Math.max(this.squash, amount);
  }

  setPose(pose: 'stand' | 'sleep' | 'sit'): void {
    if (pose === this.pose) return;
    this.pose = pose;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.shadow.visible = pose === 'stand';
    if (pose === 'sleep') {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, 0.45, -0.3);
    } else if (pose === 'sit') {
      this.body.position.y = -0.12;
    }
  }

  showBubble(icon: IconName | null, style: BubbleStyle = 'request', height = 1.85): void {
    const key = icon ? `${icon}:${style}` : '';
    if (key === this.bubbleKey) return;
    this.bubbleKey = key;
    if (!icon) {
      if (this.bubble) this.bubble.visible = false;
      return;
    }
    if (!this.bubble) {
      this.bubble = makeSprite(bubbleTexture(icon, style), 0.9);
      this.root.add(this.bubble);
    } else {
      (this.bubble.material as THREE.SpriteMaterial).map = bubbleTexture(icon, style);
      (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true;
    }
    this.bubble.visible = true;
    this.bubbleBaseY = height;
    this.bubble.position.set(0, height, 0);
    this.bubbleTime = 0;
  }

  get hasBubble(): boolean {
    return this.bubbleKey !== '';
  }

  /** `speed` is the current ground speed in m/s; drives walk cycle amplitude and rate. */
  update(dt: number, speed: number): void {
    this.bubbleTime += dt;
    if (this.bubble?.visible) {
      // Pop in with a small overshoot, then bob gently so requests catch the eye.
      const pop = Math.min(1, this.bubbleTime * 5);
      const s = 0.9 * (pop < 1 ? 0.5 + 0.6 * Math.sin(pop * Math.PI * 0.5) : 1);
      this.bubble.scale.set(s, s, 1);
      this.bubble.position.y = this.bubbleBaseY + Math.sin(this.bubbleTime * 3) * 0.05;
    }
    if (this.pose !== 'stand') {
      for (const leg of this.legs) leg.rotation.x = this.pose === 'sit' ? -1.3 : 0;
      this.phase += dt;
      if (this.pose === 'sleep') this.body.scale.set(1, 1, 1 + Math.sin(this.phase * 2) * 0.02);
      return;
    }

    const moving = speed > 0.2;
    this.phase += dt * (moving ? 3 + speed * 2.2 : 1.6);
    const swing = moving ? Math.min(0.75, 0.25 + speed * 0.12) : 0;
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * swing;
    this.legs[1].rotation.x = -s * swing;
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.06 : Math.sin(this.phase) * 0.008;
    this.body.position.y = bob;
    this.body.rotation.x = moving ? 0.08 : 0;

    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const target = this.carrying ? -1.35 : (i === 0 ? -s : s) * swing * 0.8;
      arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 14);
    }

    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const k = Math.sin(this.squash * Math.PI) * 0.12;
      this.body.scale.set(1 + k, 1 - k, 1 + k);
    } else {
      this.body.scale.set(1, 1, 1);
    }
  }

  dispose(): void {
    if (this.bubble) (this.bubble.material as THREE.SpriteMaterial).dispose();
  }
}

export const CONDUCTOR_LOOK: CharacterLook = {
  body: '#2E3F6E', accent: PALETTE.brass, skin: '#F1C7A5', hair: '#4A3426', pants: '#23304F', hat: 'conductor', arms: true,
};

export const STAFF_LOOKS: Record<string, CharacterLook> = {
  attendant: { body: '#3A7D8C', accent: '#FFFFFF', skin: '#E3AE87', hair: '#2F2520', pants: '#2C4A52', hat: 'bun', accessory: 'apron', arms: true },
  porter: { body: '#8C2A3C', accent: '#C4303F', skin: '#C98E68', hair: '#1D1616', pants: '#3A2530', hat: 'pillbox', arms: true },
  runner: { body: '#8A6A45', accent: '#E48A3A', skin: '#F2CFB3', hair: '#8C5A32', pants: '#4A3A2A', hat: 'cap', arms: true },
};
