import * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { GeoBuilder } from './geo';
import { MATERIALS, SHADOW_GEOMETRY } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, type BubbleStyle } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';

export type HatKind = 'conductor' | 'boater' | 'pillbox' | 'cap' | 'beanie' | 'bun' | 'none';
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
  /** Conductor's cap (or boater) colours; default navy with a red band. */
  hatColor?: string;
  bandColor?: string;
  /** Shoe colour (the conductor's shoes change with speed upgrades). */
  shoe?: string;
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
  const hatted = look.hat === 'conductor' || look.hat === 'boater' || look.hat === 'cap' || look.hat === 'beanie' || look.hat === 'pillbox';
  // Hair sits clearly outside the head where they overlap (near-coincident spheres flicker at the hairline).
  b.sphere(0, HEAD_Y + (hatted ? 0.03 : 0.07), -0.05, 0.268, look.hair, 2, 0.95, { shade: 0.85 });

  switch (look.hat) {
    case 'conductor': {
      const crown = look.hatColor ?? PALETTE.navy;
      b.cylinder(0, HEAD_Y + 0.25, -0.01, 0.28, 0.25, 0.15, crown, 18, 'y', { shade: 0.85 });
      b.cylinder(0, HEAD_Y + 0.2, -0.01, 0.255, 0.255, 0.05, look.bandColor ?? PALETTE.locoRed, 18, 'y', { shade: 1 });
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.75), shadeOf(crown), 0, HEAD_Y + 0.17, 0.12, 0.25, 0, 0, { shade: 1 });
      b.sphere(0, HEAD_Y + 0.27, 0.26, 0.04, PALETTE.gold, 1, 1, { shade: 1 });
      break;
    }
    case 'boater':
      // A summer straw boater: flat brim, low crown, a ribbon band.
      b.cylinder(0, HEAD_Y + 0.2, -0.01, 0.4, 0.4, 0.03, look.hatColor ?? '#E8D29A', 20, 'y', { shade: 0.95 });
      b.cylinder(0, HEAD_Y + 0.29, -0.01, 0.22, 0.23, 0.16, look.hatColor ?? '#E8D29A', 18, 'y', { shade: 0.9 });
      b.cylinder(0, HEAD_Y + 0.25, -0.01, 0.235, 0.235, 0.06, look.bandColor ?? PALETTE.raspberry, 18, 'y', { shade: 1 });
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

function legGeometry(color: string, shoe = SHOE): THREE.BufferGeometry {
  const key = `leg:${color}:${shoe}`;
  let g = limbCache.get(key);
  if (!g) {
    g = new GeoBuilder()
      .cylinder(0, -0.16, 0, 0.065, 0.06, 0.32, color, 10, 'y', { shade: 0.85 })
      .add(new THREE.SphereGeometry(0.075, 10, 6).scale(1, 0.6, 1.5), shoe, 0, -0.33, 0.04, 0, 0, 0, { shade: 1 })
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

/** Sleepers lie on their back: the body's back rests this far above the root (on the mattress). */
const SLEEP_LIFT = 0.2;
const blanketCache = new Map<string, THREE.BufferGeometry>();
const eyelidCache = new Map<string, THREE.BufferGeometry>();

/** A plump blanket from the shoulders to past the feet, with a folded-back linen edge. */
function blanketGeometry(color: string): THREE.BufferGeometry {
  let g = blanketCache.get(color);
  if (!g) {
    g = new GeoBuilder()
      .rounded(0, 0.25, -0.2, 0.8, 0.42, 1.2, 0.14, color, { shade: 0.9 })
      .rounded(0, 0.27, -0.78, 0.82, 0.4, 0.14, 0.06, PALETTE.linen, { shade: 0.95 })
      .build();
    blanketCache.set(color, g);
  }
  return g;
}

/** Closed eyes: lids in skin colour over the eyes, with a small dark lash line. */
function eyelidGeometry(skin: string): THREE.BufferGeometry {
  let g = eyelidCache.get(skin);
  if (!g) {
    const b = new GeoBuilder();
    for (const x of [-0.085, 0.085]) {
      b.sphere(x, HEAD_Y + 0.015, 0.232, 0.04, skin, 0, 1.3, { shade: 1 });
      b.box(x, HEAD_Y - 0.008, 0.268, 0.06, 0.012, 0.01, SHOE, 0, { shade: 1 });
    }
    g = b.build();
    eyelidCache.set(skin, g);
  }
  return g;
}

/**
 * Little things people do (the world reacts to them): sweeping a cabin, reading on the bed, sipping the tea
 * you brought, checking a watch in the queue, washing hands, stamping tickets, hugging a pillow.
 */
export type CharacterAction = 'none' | 'sweep' | 'read' | 'sip' | 'watch' | 'wash' | 'stamp' | 'hug' | 'wave';
type PropKind = 'broom' | 'paper' | 'cup' | 'stamp' | 'bundle';

const propCache = new Map<PropKind, THREE.BufferGeometry>();
/** Hand-held props, built once and shared (positioned for the body group, facing +z). */
function propGeometry(kind: PropKind): THREE.BufferGeometry {
  let g = propCache.get(kind);
  if (g) return g;
  const b = new GeoBuilder();
  const style = { shade: 0.95 };
  switch (kind) {
    case 'broom':
      // Held at the hands, leaning forward so the brush sweeps just in front of the feet.
      b.cylinder(0, 0, 0, 0.018, 0.018, 0.72, '#A87A4E', 6, 'y', style);
      b.rounded(0, -0.38, 0, 0.26, 0.08, 0.07, 0.03, '#E2B653', style);
      break;
    case 'paper':
      // An open newspaper held up in front of the face.
      b.box(-0.11, 0, 0, 0.2, 0.26, 0.012, '#F4EFE3', 0.25, style);
      b.box(0.11, 0, 0, 0.2, 0.26, 0.012, '#F4EFE3', -0.25, style);
      b.box(-0.11, 0.08, 0.012, 0.14, 0.03, 0.004, '#6D6A66', 0.25, style);
      b.box(0.11, 0.05, 0.012, 0.14, 0.02, 0.004, '#9A968F', -0.25, style);
      break;
    case 'cup':
      b.cylinder(0, 0, 0, 0.045, 0.036, 0.08, PALETTE.porcelain, 10, 'y', style);
      b.cylinder(0, 0.035, 0, 0.038, 0.038, 0.012, '#9B6B45', 10, 'y', style);
      b.cylinder(0, -0.045, 0, 0.07, 0.07, 0.01, PALETTE.porcelain, 12, 'y', style);
      break;
    case 'stamp':
      b.cylinder(0, 0, 0, 0.022, 0.022, 0.1, '#6E5140', 8, 'y', style);
      b.cylinder(0, -0.065, 0, 0.045, 0.045, 0.03, '#C0485C', 10, 'y', style);
      break;
    case 'bundle':
      // A pillow or folded blanket hugged to the chest.
      b.rounded(0, 0, 0, 0.36, 0.22, 0.14, 0.06, '#FFFFFF', style);
      break;
  }
  g = b.build();
  propCache.set(kind, g);
  return g;
}

/** Which prop goes with which action, and where it sits on the body (hand height, in front). */
const ACTION_PROPS: Partial<Record<CharacterAction, { kind: PropKind; pos: [number, number, number]; rot: [number, number, number] }>> = {
  sweep: { kind: 'broom', pos: [0.08, 0.46, 0.26], rot: [0.75, 0, 0] },
  read: { kind: 'paper', pos: [0, 0.74, 0.34], rot: [-0.25, 0, 0] },
  stamp: { kind: 'stamp', pos: [0.2, 0.6, 0.3], rot: [0, 0, 0] },
  hug: { kind: 'bundle', pos: [0, 0.58, 0.3], rot: [0, 0, 0] },
};

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
  private bubbleZ = 0;
  private squash = 0;
  private blanket: THREE.Mesh | null = null;
  private eyelids: THREE.Mesh | null = null;
  /** The current action and how much longer it lasts (callers refresh it while it goes on). */
  private action: CharacterAction = 'none';
  private actionTime = 0;
  private actionClock = 0;
  private readonly props = new Map<PropKind, THREE.Mesh>();
  private cupInHand: THREE.Mesh | null = null;
  /** The whole train's sway (radians about x): everyone lurches when it brakes or pulls away. */
  static lean = 0;
  /** Aboard the train (sways with it); people on the platform or by the line stand still. */
  leans = true;

  private readonly bodyMesh: THREE.Mesh;
  private readonly legMeshes: THREE.Mesh[] = [];
  private readonly armMeshes: THREE.Mesh[] = [];

  constructor(public look: CharacterLook, scale = 1) {
    this.root.add(this.body);
    const pants = look.pants ?? '#3A3440';
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.095, HIP_Y, 0);
      const leg = castsShadow(new THREE.Mesh(legGeometry(pants, look.shoe), MATERIALS.character));
      pivot.add(leg);
      this.body.add(pivot);
      this.legs.push(pivot);
      this.legMeshes.push(leg);
    }
    this.bodyMesh = castsShadow(new THREE.Mesh(bodyGeometry(look), MATERIALS.character));
    this.body.add(this.bodyMesh);

    const carried = look.accessory;
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.25, SHOULDER_Y, 0);
      const arm = castsShadow(new THREE.Mesh(armGeometry(look.body, look.skin, carried, side), MATERIALS.character));
      pivot.add(arm);
      pivot.rotation.z = side * 0.1;
      this.body.add(pivot);
      this.arms.push(pivot);
      this.armMeshes.push(arm);
    }

    this.stackAnchor.position.set(0, STACK_BASE_Y, 0.34);
    this.body.add(this.stackAnchor);

    this.shadow = new THREE.Mesh(SHADOW_GEOMETRY, MATERIALS.shadow);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    this.root.scale.setScalar(scale);
  }

  /** Changes outfit in place (geometry is cached per look, so this is cheap after the first time). */
  setLook(look: CharacterLook): void {
    this.look = look;
    this.bodyMesh.geometry = bodyGeometry(look);
    this.legMeshes.forEach((m) => (m.geometry = legGeometry(look.pants ?? '#3A3440', look.shoe)));
    this.armMeshes.forEach((m, i) => (m.geometry = armGeometry(look.body, look.skin, look.accessory, i === 0 ? -1 : 1)));
  }

  /** Leg pivots (for footwear attachments) and the body group (for chest and shoulder gear). */
  get legPivots(): readonly THREE.Object3D[] {
    return this.legs;
  }

  /** Hide the walk cycle (riding a scooter): legs straight, no bob. */
  riding = false;
  /** Right arm up, waving (onlookers by the line, the station master's flag). */
  waving = false;
  private waveTime = Math.random() * 10;

  /** Puts something in the right hand (a flag, a balloon); it follows the arm, waving included. */
  holdInRightHand(object: THREE.Object3D): void {
    object.position.y += -0.33;
    this.arms[1].add(object);
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

  /**
   * Do something for a moment (`seconds`), or keep doing it by calling every frame: the cleaner sweeps
   * while they clean, the porter stamps while checking in. Props appear only while the action runs.
   */
  act(action: CharacterAction, seconds = 0.25): void {
    const same = action === this.action;
    if (!same) this.actionClock = 0;
    this.action = action;
    this.actionTime = Math.max(same ? this.actionTime : 0, seconds);
  }

  get currentAction(): CharacterAction {
    return this.action;
  }

  private showProp(kind: PropKind | null): void {
    for (const [k, mesh] of this.props) mesh.visible = k === kind;
    if (!kind || this.props.has(kind)) return;
    const spec = Object.values(ACTION_PROPS).find((p) => p?.kind === kind);
    if (!spec) return;
    const mesh = new THREE.Mesh(propGeometry(kind), MATERIALS.character);
    mesh.userData.shared = true;
    mesh.castShadow = true;
    mesh.position.set(...spec.pos);
    mesh.rotation.set(...spec.rot);
    this.body.add(mesh);
    this.props.set(kind, mesh);
  }

  /** The tea cup rides in the right hand (it follows the arm up to the mouth). */
  private showCup(on: boolean): void {
    if (on && !this.cupInHand) {
      this.cupInHand = new THREE.Mesh(propGeometry('cup'), MATERIALS.character);
      this.cupInHand.userData.shared = true;
      this.cupInHand.position.set(0, -0.36, 0.06);
      this.arms[1].add(this.cupInHand);
    }
    if (this.cupInHand) this.cupInHand.visible = on;
  }

  /** Arms, body and props for the current action (after the walk cycle has had its say). */
  private applyAction(dt: number): void {
    if (this.actionTime > 0) {
      this.actionTime -= dt;
      this.actionClock += dt;
      if (this.actionTime <= 0) this.action = 'none';
    }
    const a = this.action;
    const spec = ACTION_PROPS[a];
    this.showProp(spec ? spec.kind : null);
    this.showCup(a === 'sip');
    if (a === 'none') return;
    const t = this.actionClock;
    const ease = Math.min(1, dt * 12);
    const aim = (i: number, x: number, z: number): void => {
      this.arms[i].rotation.x += (x - this.arms[i].rotation.x) * ease;
      this.arms[i].rotation.z += (z - this.arms[i].rotation.z) * ease;
    };
    switch (a) {
      case 'sweep':
        // Both hands on the broom, a side-to-side sweep from the hips.
        aim(0, -0.8, 0.45);
        aim(1, -0.7, -0.35);
        this.body.rotation.y = Math.sin(t * 7) * 0.32;
        this.body.position.y -= 0.03;
        break;
      case 'read':
        aim(0, -1.25, 0.4);
        aim(1, -1.25, -0.4);
        this.body.rotation.x += Math.sin(t * 1.3) * 0.03;
        break;
      case 'sip': {
        // Lift, sip, lower, on a slow loop.
        const cycle = t % 2.2;
        const up = cycle < 0.35 ? cycle / 0.35 : cycle < 1.1 ? 1 : cycle < 1.45 ? 1 - (cycle - 1.1) / 0.35 : 0;
        aim(1, -0.6 - up * 1.7, -0.25 * up);
        break;
      }
      case 'watch': {
        const raised = t % 3.6 < 1.4;
        aim(0, raised ? -1.5 : 0, raised ? 0.7 : 0.1);
        if (raised) this.body.rotation.x += 0.1;
        break;
      }
      case 'wash':
        aim(0, -1.0 + Math.sin(t * 11) * 0.15, 0.3);
        aim(1, -1.0 - Math.sin(t * 11) * 0.15, -0.3);
        break;
      case 'stamp': {
        const down = Math.max(0, Math.sin(t * 9));
        aim(1, -1.3 + down * 0.8, -0.2);
        const stamp = this.props.get('stamp');
        if (stamp) stamp.position.y = 0.6 - down * 0.12;
        break;
      }
      case 'hug':
        aim(0, -1.05, 0.55);
        aim(1, -1.05, -0.55);
        this.body.rotation.z = Math.sin(t * 2.5) * 0.06;
        break;
      case 'wave':
        aim(1, -2.75, 0.25 + Math.sin(t * 9) * 0.4);
        break;
    }
  }

  /** A little squash-and-stretch hop (pickups, payments). */
  bounce(amount = 1): void {
    this.squash = Math.max(this.squash, amount);
  }

  /**
   * `sleep` lays the character on their back with the head toward local −z (put the root at the foot end
   * of the pillow + 1 m), closes their eyes and tucks them under a blanket of `blanketColor`.
   */
  setPose(pose: 'stand' | 'sleep' | 'sit', blanketColor = PALETTE.greyWool): void {
    if (pose === this.pose && (pose !== 'sleep' || this.blanket?.userData.color === blanketColor)) return;
    this.pose = pose;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.shadow.visible = pose === 'stand';
    this.bubbleZ = 0;
    if (pose === 'sleep') {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.set(0, SLEEP_LIFT, 0);
      this.body.scale.z = 0.8;
      this.bubbleZ = -HEAD_Y;
      if (!this.blanket || this.blanket.userData.color !== blanketColor) {
        if (this.blanket) this.root.remove(this.blanket);
        this.blanket = new THREE.Mesh(blanketGeometry(blanketColor), MATERIALS.character);
        this.blanket.userData.color = blanketColor;
        this.blanket.userData.shared = true;
        this.blanket.castShadow = true;
        this.root.add(this.blanket);
      }
      if (!this.eyelids) {
        this.eyelids = new THREE.Mesh(eyelidGeometry(this.look.skin), MATERIALS.character);
        this.eyelids.userData.shared = true;
        this.body.add(this.eyelids);
      }
    } else if (pose === 'sit') {
      this.body.position.y = -0.12;
    }
    if (this.blanket) this.blanket.visible = pose === 'sleep';
    if (this.eyelids) this.eyelids.visible = pose === 'sleep';
    if (this.bubble) this.bubble.position.z = this.bubbleZ;
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
      // Bubbles are world UI: hidden with the pads on the title screen and in the intro.
      this.bubble.layers.set(WORLD_UI_LAYER);
      this.root.add(this.bubble);
    } else {
      (this.bubble.material as THREE.SpriteMaterial).map = bubbleTexture(icon, style, ring);
      (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true;
    }
    this.bubble.visible = true;
    this.bubbleBaseY = height;
    this.bubble.position.set(0, height, this.bubbleZ);
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
    this.root.rotation.x = this.pose === 'sleep' || !this.leans ? 0 : CharacterView.lean;
    if (this.pose !== 'stand') {
      for (const leg of this.legs) leg.rotation.x = this.pose === 'sit' ? -1.3 : 0;
      this.phase += dt;
      // Slow breathing: the blanket rises and falls.
      if (this.pose === 'sleep' && this.blanket) this.blanket.scale.y = 1 + Math.sin(this.phase * 1.6) * 0.06;
      if (this.pose === 'sit') {
        this.body.position.y = -0.12;
        this.body.rotation.set(0, 0, 0);
        this.applyAction(dt);
      }
      return;
    }

    const moving = speed > 0.2 && !this.riding;
    this.phase += dt * (moving ? 3 + speed * 2.2 : 1.6);
    const swing = moving ? Math.min(0.75, 0.25 + speed * 0.12) : 0;
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * swing;
    this.legs[1].rotation.x = -s * swing;
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.06 : Math.sin(this.phase) * 0.008;
    this.body.position.y = bob;
    this.body.rotation.x = moving ? 0.08 : 0;

    // An action owns the arms while it runs; otherwise they swing with the walk (or carry, or wave).
    if (this.action === 'none') {
      for (let i = 0; i < 2; i++) {
        const arm = this.arms[i];
        const target = this.waving && i === 1 ? -2.75 : this.carrying ? -1.35 : (i === 0 ? -s : s) * swing * 0.8;
        arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 14);
        const rest = i === 0 ? -0.1 : 0.1;
        if (!(this.waving && i === 1)) arm.rotation.z += (rest - arm.rotation.z) * Math.min(1, dt * 14);
      }
      if (this.waving) {
        this.waveTime += dt;
        this.arms[1].rotation.z = 0.25 + Math.sin(this.waveTime * 9) * 0.4;
      }
    }

    this.body.rotation.y = 0;
    this.body.rotation.z = 0;
    this.applyAction(dt);

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
