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
  /** A little moustache (the conductor). */
  moustache?: boolean;
}

const HIP_Y = 0.36;
const SHOULDER_Y = 0.78;
const HEAD_Y = 1.02;
export const STACK_BASE_Y = 0.76;
const SHOE = '#2A2433';

const bodyCache = new Map<string, THREE.BufferGeometry>();
const limbCache = new Map<string, THREE.BufferGeometry>();

/** Merged body: rounded coat, head with a face, hair or hat, and the accessory that tells you who they are. */
function bodyGeometry(look: CharacterLook): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const b = new GeoBuilder();
  const fur = look.accessory === 'furcoat';
  const smooth = { shade: 0.82 };
  // Coat: a tapered body with a rounded hem, collar and buttons.
  b.cylinder(0, HIP_Y + 0.24, 0, fur ? 0.25 : 0.19, fur ? 0.32 : 0.24, 0.48, look.body, 16, 'y', smooth);
  b.sphere(0, HIP_Y + 0.02, 0, fur ? 0.32 : 0.24, look.body, 2, 0.45, smooth);
  b.sphere(0, SHOULDER_Y - 0.02, 0, fur ? 0.27 : 0.2, look.body, 2, 0.55, smooth);
  if (fur) b.cylinder(0, SHOULDER_Y + 0.03, 0, 0.27, 0.29, 0.12, look.accent, 16, 'y', smooth);
  else b.cylinder(0, SHOULDER_Y + 0.06, 0.02, 0.1, 0.13, 0.08, look.accent, 12, 'y', { shade: 1 });
  if (look.accent === PALETTE.gold) for (const y of [0.5, 0.61, 0.72]) b.sphere(0, y, 0.215, 0.022, PALETTE.gold, 0, 1, { shade: 1 });

  // Head and face.
  b.sphere(0, HEAD_Y, 0, 0.25, look.skin, 2, 1, { shade: 0.85 });
  for (const x of [-0.085, 0.085]) b.sphere(x, HEAD_Y + 0.015, 0.228, 0.032, SHOE, 0, 1.35, { shade: 1 });
  for (const x of [-0.15, 0.15]) b.sphere(x, HEAD_Y - 0.06, 0.2, 0.045, '#F29C9C', 0, 0.55, { shade: 1 });
  b.sphere(0, HEAD_Y - 0.03, 0.245, 0.03, look.skin, 0, 1, { shade: 0.95 });
  if (look.moustache) {
    for (const side of [-1, 1]) b.add(new THREE.SphereGeometry(0.05, 10, 6).scale(1.3, 0.5, 0.6), look.hair, side * 0.045, HEAD_Y - 0.075, 0.232, 0, 0, side * -0.25, { shade: 1 });
  }
  const hatted = look.hat === 'conductor' || look.hat === 'cap' || look.hat === 'beanie' || look.hat === 'pillbox';
  b.sphere(0, HEAD_Y + (hatted ? 0.03 : 0.07), -0.05, 0.255, look.hair, 2, 0.95, { shade: 0.85 });

  switch (look.hat) {
    case 'conductor':
      b.cylinder(0, HEAD_Y + 0.25, -0.01, 0.28, 0.25, 0.15, PALETTE.navy, 18, 'y', { shade: 0.85 });
      b.cylinder(0, HEAD_Y + 0.2, -0.01, 0.255, 0.255, 0.05, PALETTE.locoRed, 18, 'y', { shade: 1 });
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.75), PALETTE.navyDark, 0, HEAD_Y + 0.17, 0.12, 0.25, 0, 0, { shade: 1 });
      b.sphere(0, HEAD_Y + 0.27, 0.26, 0.04, PALETTE.gold, 1, 1, { shade: 1 });
      break;
    case 'pillbox':
      b.cylinder(0, HEAD_Y + 0.27, 0, 0.16, 0.16, 0.14, look.accent, 16, 'y', { shade: 0.9 });
      b.cylinder(0, HEAD_Y + 0.22, 0, 0.165, 0.165, 0.03, PALETTE.gold, 16, 'y', { shade: 1 });
      break;
    case 'cap':
      b.sphere(0, HEAD_Y + 0.12, 0, 0.24, look.accent, 2, 0.75, { shade: 0.9 });
      b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 14, 1, false, -Math.PI / 2, Math.PI), look.accent, 0, HEAD_Y + 0.1, 0.16, 0.1, 0, 0, { shade: 1 });
      break;
    case 'beanie':
      b.sphere(0, HEAD_Y + 0.13, -0.01, 0.255, look.accent, 2, 0.8, { shade: 0.9 });
      b.cylinder(0, HEAD_Y + 0.06, -0.01, 0.262, 0.262, 0.06, shadeOf(look.accent), 16, 'y', { shade: 1 });
      b.sphere(0, HEAD_Y + 0.35, -0.02, 0.07, PALETTE.linen, 1, 1, { shade: 1 });
      break;
    case 'bun':
      b.sphere(0, HEAD_Y + 0.27, -0.12, 0.11, look.hair, 2, 1, { shade: 0.85 });
      break;
    default:
      break;
  }

  switch (look.accessory) {
    case 'backpack':
      b.rounded(0, HIP_Y + 0.3, -0.26, 0.36, 0.42, 0.2, 0.06, look.accent, { shade: 0.8 });
      b.rounded(0, HIP_Y + 0.54, -0.26, 0.3, 0.1, 0.18, 0.05, '#8C5A32', { shade: 1 });
      break;
    case 'flower':
      b.sphere(0.1, SHOULDER_Y - 0.1, 0.2, 0.05, look.accent, 1);
      b.sphere(0.1, SHOULDER_Y - 0.1, 0.235, 0.025, PALETTE.mustard, 1);
      break;
    case 'apron':
      b.box(0, HIP_Y + 0.18, 0.2, 0.3, 0.36, 0.03, PALETTE.linen, 0, { shade: 1 });
      break;
    case 'camera':
      b.rounded(0, SHOULDER_Y - 0.12, 0.23, 0.18, 0.12, 0.08, 0.02, '#2B2B33', { shade: 1 });
      b.cylinder(0, SHOULDER_Y - 0.12, 0.29, 0.04, 0.04, 0.06, '#5A6273', 10, 'z');
      break;
    case 'handbag':
      for (let i = 0; i < 5; i++) b.sphere(-0.12 + i * 0.06, SHOULDER_Y + 0.02 - Math.abs(i - 2) * 0.012, 0.16, 0.022, PALETTE.linen, 0, 1, { shade: 1 });
      break;
    default:
      break;
  }
  const geometry = b.build();
  bodyCache.set(key, geometry);
  return geometry;
}

function legGeometry(color: string): THREE.BufferGeometry {
  const key = `leg:${color}`;
  let g = limbCache.get(key);
  if (!g) {
    g = new GeoBuilder()
      .cylinder(0, -0.16, 0, 0.065, 0.06, 0.32, color, 10, 'y', { shade: 0.85 })
      .add(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 0.6, 1.5), SHOE, 0, -0.33, 0.04, 0, 0, 0, { shade: 1 })
      .build();
    limbCache.set(key, g);
  }
  return g;
}

function armGeometry(color: string, skin: string, carried: AccessoryKind | undefined, side: 1 | -1): THREE.BufferGeometry {
  const key = `arm:${color}:${skin}:${carried}:${side}`;
  let g = limbCache.get(key);
  if (!g) {
    const b = new GeoBuilder()
      .cylinder(0, -0.14, 0, 0.055, 0.05, 0.3, color, 10, 'y', { shade: 0.85 })
      .sphere(0, -0.31, 0, 0.06, skin, 1);
    if (carried === 'briefcase' && side === 1) b.rounded(0, -0.42, 0.02, 0.07, 0.2, 0.28, 0.03, '#6B4430', { shade: 0.85 });
    if (carried === 'handbag' && side === -1) b.rounded(0, -0.4, 0, 0.08, 0.14, 0.2, 0.04, '#C94F6D', { shade: 0.85 });
    g = b.build();
    limbCache.set(key, g);
  }
  return g;
}

function shadeOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v - 28));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
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
      pivot.position.set(side * 0.095, HIP_Y, 0);
      pivot.add(castsShadow(new THREE.Mesh(legGeometry(pants), MATERIALS.character)));
      this.body.add(pivot);
      this.legs.push(pivot);
    }
    const bodyMesh = castsShadow(new THREE.Mesh(bodyGeometry(look), MATERIALS.character));
    this.body.add(bodyMesh);

    const carried = look.accessory;
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.25, SHOULDER_Y, 0);
      pivot.add(castsShadow(new THREE.Mesh(armGeometry(look.body, look.skin, carried, side), MATERIALS.character)));
      pivot.rotation.z = side * 0.1;
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

  /** `ring` (0..steps, or -1 for none) draws the generous-tip ring around a request bubble. */
  showBubble(icon: IconName | null, style: BubbleStyle = 'request', height = 1.85, ring = -1): void {
    const key = icon ? `${icon}:${style}:${ring}` : '';
    if (key === this.bubbleKey) return;
    const sameIcon = icon !== null && this.bubbleKey.startsWith(`${icon}:${style}:`);
    this.bubbleKey = key;
    if (!icon) {
      if (this.bubble) this.bubble.visible = false;
      return;
    }
    if (!this.bubble) {
      this.bubble = makeSprite(bubbleTexture(icon, style, ring), 0.9);
      this.root.add(this.bubble);
    } else {
      (this.bubble.material as THREE.SpriteMaterial).map = bubbleTexture(icon, style, ring);
      (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true;
    }
    this.bubble.visible = true;
    this.bubbleBaseY = height;
    this.bubble.position.set(0, height, 0);
    // A ring tick is not a new bubble: only pop in when the icon itself changes.
    if (!sameIcon) this.bubbleTime = 0;
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
  body: PALETTE.navy, accent: PALETTE.gold, skin: '#F1C7A5', hair: '#4A3426', pants: PALETTE.navyDark, hat: 'conductor', arms: true, moustache: true,
};

/** Staff uniforms: bellhop purple for attendants, signal red for porters, mustard for supply runners. */
export const STAFF_LOOKS: Record<string, CharacterLook> = {
  attendant: { body: '#7B5AA6', accent: '#7B5AA6', skin: '#E3AE87', hair: '#2F2520', pants: '#3F2F5A', hat: 'pillbox', accessory: 'apron', arms: true },
  porter: { body: '#C8453A', accent: '#C8453A', skin: '#C98E68', hair: '#1D1616', pants: '#3A2A2E', hat: 'pillbox', arms: true },
  runner: { body: '#E0A93B', accent: '#3F6E5A', skin: '#F2CFB3', hair: '#8C5A32', pants: '#5A4632', hat: 'cap', arms: true },
};

function castsShadow<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  return mesh;
}
