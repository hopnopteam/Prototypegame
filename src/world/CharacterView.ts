import * as THREE from 'three';
import type { StaffRole } from '../core/types';
import type { IconName } from '../ui/icons';
import { GeoBuilder } from './geo';
import { MATERIALS, SHADOW_GEOMETRY } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, type BubbleStyle } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';
import { addHead, addTorso, armGeometry, eyelidGeometry, faceDepth, HAND_Y, HEAD_TOP, HEAD_Y, HIP_Y, legGeometry, SHOULDER_X, SHOULDER_Y, type FigureSpec, type HairStyle, type Outfit } from './CharacterParts';
import { underPopup } from './screenMask';
import type { CharacterBatch } from './CharacterBatch';

export type HatKind = 'conductor' | 'boater' | 'bowler' | 'pillbox' | 'cap' | 'beanie' | 'bun' | 'crown' | 'tophat' | 'toque' | 'none';
export type AccessoryKind = 'briefcase' | 'backpack' | 'handbag' | 'flower' | 'furcoat' | 'apron' | 'child' | 'camera' | 'sash' | 'none';

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
  /** Session 23, a crowd of individuals: round spectacles, and hair that falls to the shoulders. */
  glasses?: boolean;
  longHair?: boolean;
  /**
   * Session 30, the new figures: the hairdo, what they wear (a tee, a shirt, a uniform jacket, a long coat, a dress to
   * the knee or a gown), stripes on the top in `trim`, long or short sleeves, a belt and the sock colour. Each is
   * inferred when absent (uniforms with `arms` wear a jacket, everyone else a tee).
   */
  hairStyle?: HairStyle;
  outfit?: Outfit;
  trim?: string;
  stripes?: boolean;
  sleeves?: 'short' | 'long';
  belt?: boolean;
  sock?: string;
}

export const STACK_BASE_Y = 0.74;
const SHOE = '#2A2433';
/** World size of a guest's request bubble (fix list 3.4: smaller, was 0.9). */
const BUBBLE_SIZE = 0.74;
/** How far the body drops to sit (hips onto a seat about 0.24 m up). */
const SIT_DROP = HIP_Y - 0.26;

const bodyCache = new Map<string, THREE.BufferGeometry>();
const limbCache = new Map<string, THREE.BufferGeometry>();

/** The look's figure: the outfit, sleeves and hairdo it implies when it does not say. */
function figureOf(look: CharacterLook): FigureSpec & { long: boolean } {
  const fur = look.accessory === 'furcoat';
  const outfit: Outfit = fur ? 'coat' : look.outfit ?? (look.arms ? 'jacket' : 'tee');
  const hairStyle: HairStyle = look.hairStyle ?? (look.longHair ? 'long' : look.hat === 'bun' ? 'bun' : 'short');
  return {
    skin: look.skin,
    hair: look.hair,
    hairStyle,
    outfit,
    top: look.body,
    trim: look.trim ?? look.accent,
    stripes: look.stripes,
    pants: look.pants ?? '#3A3440',
    belt: look.belt ?? (outfit === 'tee' || outfit === 'shirt'),
    fur: fur ? look.accent : undefined,
    moustache: look.moustache,
    glasses: look.glasses,
    hatted: look.hat !== undefined && look.hat !== 'none' && look.hat !== 'bun',
    long: look.sleeves ? look.sleeves === 'long' : outfit === 'jacket' || outfit === 'coat' || outfit === 'shirt' || outfit === 'gown',
  };
}

/** Merged body: torso, head with a face and hair, a hat, and the accessory that tells you who they are. */
function bodyGeometry(look: CharacterLook): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const b = new GeoBuilder();
  const f = figureOf(look);
  addTorso(b, f);
  addHead(b, f);
  const T = HEAD_TOP;
  const flat = { shade: 1 };
  switch (look.hat) {
    case 'conductor': {
      const crown = look.hatColor ?? PALETTE.navy;
      b.cylinder(0, T + 0.02, -0.01, 0.235, 0.215, 0.13, crown, 20, 'y', { shade: 0.86 });
      b.cylinder(0, T - 0.03, -0.01, 0.22, 0.22, 0.05, look.bandColor ?? PALETTE.locoRed, 20, 'y', flat);
      b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.022, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.72), shadeOf(crown), 0, T - 0.055, 0.12, 0.25, 0, 0, flat);
      b.sphere(0, T + 0.01, 0.215, 0.032, PALETTE.gold, 1, 1, flat);
      break;
    }
    case 'boater':
      b.cylinder(0, T - 0.02, -0.01, 0.34, 0.34, 0.026, look.hatColor ?? '#E8D29A', 22, 'y', { shade: 0.95 });
      b.cylinder(0, T + 0.05, -0.01, 0.19, 0.2, 0.13, look.hatColor ?? '#E8D29A', 20, 'y', { shade: 0.9 });
      b.cylinder(0, T + 0.015, -0.01, 0.204, 0.204, 0.05, look.bandColor ?? PALETTE.raspberry, 20, 'y', flat);
      break;
    case 'bowler':
      b.cylinder(0, T - 0.03, -0.01, 0.29, 0.29, 0.024, look.hatColor ?? '#2B2A30', 22, 'y', { shade: 0.95 });
      b.sphere(0, T - 0.02, -0.01, 0.215, look.hatColor ?? '#2B2A30', 2, 0.82, { shade: 0.86 });
      b.cylinder(0, T - 0.005, -0.01, 0.214, 0.214, 0.04, look.bandColor ?? '#4A3A36', 20, 'y', flat);
      break;
    case 'pillbox':
      b.cylinder(0, T + 0.04, 0, 0.14, 0.14, 0.12, look.hatColor ?? look.body, 18, 'y', { shade: 0.9 });
      b.cylinder(0, T - 0.01, 0, 0.144, 0.144, 0.026, PALETTE.gold, 18, 'y', flat);
      break;
    case 'cap':
      // A baseball cap: a soft crown over the hair and a peak forward.
      b.add(dome(0.236, 0.74, 0.56), look.hatColor ?? look.accent, 0, HEAD_Y + 0.045, -0.005, 0, 0, 0, { shade: 0.9 });
      b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.022, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.15), shadeOf(look.hatColor ?? look.accent), 0, HEAD_Y + 0.085, 0.17, 0.12, 0, 0, flat);
      b.sphere(0, HEAD_Y + 0.215, -0.005, 0.022, shadeOf(look.hatColor ?? look.accent), 0, 1, flat);
      break;
    case 'beanie':
      b.add(dome(0.234, 0.85, 0.52), look.accent, 0, HEAD_Y + 0.06, -0.01, 0, 0, 0, { shade: 0.9 });
      b.cylinder(0, HEAD_Y + 0.07, -0.01, 0.238, 0.238, 0.06, shadeOf(look.accent), 20, 'y', flat);
      b.sphere(0, HEAD_Y + 0.27, -0.02, 0.055, PALETTE.linen, 1, 1, flat);
      break;
    case 'crown': {
      b.cylinder(0, T + 0.06, -0.02, 0.14, 0.13, 0.07, PALETTE.gold, 16, 'y', { shade: 0.9, surface: 'brass' });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        b.cone(Math.cos(a) * 0.12, T + 0.13, -0.02 + Math.sin(a) * 0.12, 0.03, 0.08, PALETTE.gold, 6, { shade: 1, surface: 'brass' });
      }
      b.sphere(0, T + 0.06, 0.115, 0.022, PALETTE.raspberry, 0, 1, { shade: 1, surface: 'crystal' });
      break;
    }
    case 'tophat':
      b.cylinder(0, T - 0.02, -0.01, 0.28, 0.28, 0.026, look.hatColor ?? '#1E1B24', 22, 'y', { shade: 0.95, surface: 'leather' });
      b.cylinder(0, T + 0.13, -0.01, 0.17, 0.18, 0.29, look.hatColor ?? '#1E1B24', 20, 'y', { shade: 0.9, surface: 'leather' });
      b.cylinder(0, T + 0.03, -0.01, 0.182, 0.182, 0.05, look.bandColor ?? PALETTE.gold, 20, 'y', flat);
      break;
    case 'toque':
      b.cylinder(0, T + 0.02, -0.01, 0.2, 0.2, 0.1, PALETTE.linen, 18, 'y', { shade: 0.95 });
      b.sphere(0, T + 0.16, -0.01, 0.23, PALETTE.linen, 2, 0.72, { shade: 0.9 });
      break;
    default:
      break;
  }

  const front = (y: number): number => faceDepth(y);
  switch (look.accessory) {
    case 'backpack':
      b.rounded(0, 0.6, -0.2, 0.28, 0.34, 0.15, 0.06, look.accent, { shade: 0.82 });
      b.rounded(0, 0.53, -0.285, 0.2, 0.12, 0.04, 0.02, shadeOf(look.accent), flat);
      // Session 32: straps that run from the front up over each shoulder to the pack (they were flat bars on the chest).
      for (const s of [-1, 1]) {
        b.add(new THREE.TorusGeometry(0.1, 0.014, 6, 12, Math.PI).scale(1, 0.75, 1.35), '#5A3A26', s * 0.088, 0.72, -0.02, 0, Math.PI / 2, 0, flat);
        b.box(s * 0.088, 0.62, front(0.62) + 0.004, 0.032, 0.2, 0.012, '#5A3A26', 0, flat);
      }
      break;
    case 'flower':
      b.sphere(0.08, 0.68, front(0.68) + 0.01, 0.038, look.accent, 1);
      b.sphere(0.08, 0.68, front(0.68) + 0.035, 0.018, PALETTE.mustard, 1);
      break;
    case 'apron':
      b.add(apronGeometry(), PALETTE.linen, 0, 0, 0, 0, 0, 0, { shade: 1 });
      break;
    case 'camera':
      b.rounded(0, 0.6, front(0.6) + 0.04, 0.14, 0.09, 0.06, 0.02, '#2B2B33', flat);
      b.cylinder(0, 0.6, front(0.6) + 0.085, 0.032, 0.032, 0.04, '#5A6273', 12, 'z');
      for (const s of [-1, 1]) b.box(s * 0.07, 0.7, front(0.7), 0.014, 0.16, 0.01, '#2B2B33', 0, flat);
      break;
    case 'sash':
      b.add(new THREE.BoxGeometry(0.06, 0.48, 0.02), look.accent, 0.01, 0.6, front(0.6) + 0.01, 0.08, 0, 0.62, { shade: 1, surface: 'fabric' });
      b.sphere(0.07, 0.67, front(0.67) + 0.02, 0.028, PALETTE.gold, 1, 1, { shade: 1, surface: 'brass' });
      break;
    case 'handbag':
      for (let i = 0; i < 5; i++) b.sphere(-0.08 + i * 0.04, 0.79 - Math.abs(i - 2) * 0.012, front(0.79) + 0.01, 0.018, PALETTE.linen, 0, 1, flat);
      break;
    default:
      break;
  }
  const geometry = b.build();
  bodyCache.set(key, geometry);
  return geometry;
}

/** The crown of a soft hat: the top `frac` of a sphere of `radius`, squashed to `sy`, open underneath. */
function dome(radius: number, sy: number, frac: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 22, 12, 0, Math.PI * 2, 0, Math.PI * frac);
  g.scale(1, sy, 1);
  return g;
}

/** An apron's bib and skirt over the front of the torso. */
function apronGeometry(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.rounded(0, 0.56, faceDepth(0.56) + 0.006, 0.18, 0.26, 0.012, 0.02, PALETTE.linen, { shade: 1 });
  g.rounded(0, 0.37, faceDepth(0.44) + 0.012, 0.26, 0.2, 0.012, 0.02, PALETTE.linen, { shade: 1 });
  return g.build();
}

function legGeometryFor(look: CharacterLook): THREE.BufferGeometry {
  const f = figureOf(look);
  const bare = f.outfit === 'dress' || f.outfit === 'gown';
  const key = `leg:${f.pants}:${look.shoe}:${bare}:${look.skin}:${look.sock}`;
  let g = limbCache.get(key);
  if (!g) {
    g = legGeometry(f.pants, look.shoe ?? SHOE, bare, look.skin, look.sock ?? '#F4F1EA');
    limbCache.set(key, g);
  }
  return g;
}

function armGeometryFor(look: CharacterLook, side: 1 | -1): THREE.BufferGeometry {
  const f = figureOf(look);
  const carried = look.accessory === 'briefcase' || look.accessory === 'handbag' ? look.accessory : null;
  const cuff = f.outfit === 'jacket' && look.accent !== look.body ? look.accent : undefined;
  const key = `arm:${look.body}:${look.skin}:${f.long}:${carried}:${side}:${cuff}`;
  let g = limbCache.get(key);
  if (!g) {
    g = armGeometry(look.body, look.skin, f.long, side, carried, cuff);
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
      .rounded(0, 0.22, -0.15, 0.64, 0.3, 1.0, 0.12, color, { shade: 0.9 })
      .rounded(0, 0.235, -0.64, 0.66, 0.28, 0.12, 0.05, PALETTE.linen, { shade: 0.95 })
      .build();
    blanketCache.set(color, g);
  }
  return g;
}

function eyelidGeometryFor(skin: string): THREE.BufferGeometry {
  let g = eyelidCache.get(skin);
  if (!g) {
    g = eyelidGeometry(skin);
    eyelidCache.set(skin, g);
  }
  return g;
}

/**
 * Little things people do (the world reacts to them): sweeping a cabin, reading on the bed, sipping the tea
 * you brought, checking a watch in the queue, washing hands, stamping tickets, hugging a pillow.
 */
export type CharacterAction = 'none' | 'sweep' | 'read' | 'sip' | 'watch' | 'wash' | 'stamp' | 'hug' | 'wave' | 'look' | 'phone' | 'chat' | 'yawn' | 'waveTicket' | 'stomp';
type PropKind = 'broom' | 'paper' | 'cup' | 'stamp' | 'bundle' | 'phone' | 'ticket';

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
    case 'ticket':
      // A train ticket waved overhead (session 24: travellers who missed the train), cream with a red band.
      b.box(0, 0, 0, 0.13, 0.08, 0.008, '#FBF3DF', 0, style);
      b.box(-0.035, 0, 0.0045, 0.025, 0.08, 0.002, '#C0485C', 0, { shade: 1 });
      break;
    case 'phone':
      // A phone held to the ear (rides in the right hand), its screen lit.
      b.rounded(0, 0, 0, 0.05, 0.13, 0.018, 0.008, '#25222B', style);
      b.box(0, 0.005, 0.0095, 0.038, 0.1, 0.002, '#9FD3E8', 0, { shade: 1 });
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
  private readonly inHand = new Map<PropKind, THREE.Mesh>();
  /** The whole train's sway (radians about x): everyone lurches when it brakes or pulls away. */
  static lean = 0;
  /** Aboard the train (sways with it); people on the platform or by the line stand still. */
  leans = true;
  /** When set (the game sets it), every character is drawn through this batch: one draw for the crowd. */
  static batch: CharacterBatch | null = null;

  private readonly bodyMesh: THREE.Mesh;
  private readonly legMeshes: THREE.Mesh[] = [];
  private readonly armMeshes: THREE.Mesh[] = [];

  constructor(public look: CharacterLook, scale = 1) {
    this.root.add(this.body);
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.078, HIP_Y, 0);
      const leg = castsShadow(new THREE.Mesh(legGeometryFor(look), MATERIALS.character));
      pivot.add(leg);
      this.body.add(pivot);
      this.legs.push(pivot);
      this.legMeshes.push(leg);
    }
    this.bodyMesh = castsShadow(new THREE.Mesh(bodyGeometry(look), MATERIALS.character));
    this.body.add(this.bodyMesh);

    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      const arm = castsShadow(new THREE.Mesh(armGeometryFor(look, side), MATERIALS.character));
      pivot.add(arm);
      pivot.rotation.z = side * 0.1;
      this.body.add(pivot);
      this.arms.push(pivot);
      this.armMeshes.push(arm);
    }

    this.stackAnchor.position.set(0, STACK_BASE_Y, 0.3);
    this.body.add(this.stackAnchor);

    this.shadow = new THREE.Mesh(SHADOW_GEOMETRY, MATERIALS.shadow);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    this.root.scale.setScalar(scale);
    CharacterView.batch?.register(this.root);
  }

  /** Changes outfit in place (geometry is cached per look, so this is cheap after the first time). */
  setLook(look: CharacterLook): void {
    this.look = look;
    this.bodyMesh.geometry = bodyGeometry(look);
    this.legMeshes.forEach((m) => (m.geometry = legGeometryFor(look)));
    this.armMeshes.forEach((m, i) => (m.geometry = armGeometryFor(look, i === 0 ? -1 : 1)));
  }

  /** Leg pivots (for footwear attachments) and the body group (for chest and shoulder gear). */
  get legPivots(): readonly THREE.Object3D[] {
    return this.legs;
  }

  private lastStrideSide = true;
  private footfall = false;

  /** True once each time a foot has landed in the walk cycle since the last call (footstep sounds follow it). */
  takeFootfall(): boolean {
    const f = this.footfall;
    this.footfall = false;
    return f;
  }

  /** Hide the walk cycle (riding a scooter): legs straight, no bob. */
  riding = false;
  /** Right arm up, waving (onlookers by the line, the station master's flag). */
  waving = false;
  private waveTime = Math.random() * 10;

  /** Puts something in the right hand (a flag, a balloon); it follows the arm, waving included. */
  holdInRightHand(object: THREE.Object3D): void {
    object.position.y += HAND_Y;
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

  /** The tea cup and the phone ride in the right hand (they follow the arm up to the mouth or the ear). */
  private showInHand(kind: PropKind | null): void {
    if (kind && !this.inHand.has(kind)) {
      const mesh = new THREE.Mesh(propGeometry(kind), MATERIALS.character);
      mesh.userData.shared = true;
      mesh.position.set(0, HAND_Y + (kind === 'phone' ? -0.03 : kind === 'ticket' ? -0.08 : -0.03), kind === 'phone' ? 0.03 : 0.06);
      this.arms[1].add(mesh);
      this.inHand.set(kind, mesh);
    }
    for (const [k, mesh] of this.inHand) mesh.visible = k === kind;
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
    this.showInHand(a === 'sip' ? 'cup' : a === 'phone' ? 'phone' : a === 'waveTicket' ? 'ticket' : null);
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
      case 'stomp': {
        // Fix list 4.1: missed the train and storming off: fists low and pumping, leaning into each heavy step.
        const beat = Math.sin(t * 10);
        aim(0, beat * 0.7, 0.18);
        aim(1, -beat * 0.7, -0.18);
        this.body.position.y += Math.abs(beat) * 0.07;
        this.body.rotation.x += 0.2;
        this.body.rotation.z = beat * 0.07;
        break;
      }
      case 'waveTicket':
        // Waving the ticket overhead, a little hop now and then: "wait for me!"
        aim(1, -2.85, 0.2 + Math.sin(t * 10) * 0.45);
        this.body.position.y += Math.max(0, Math.sin(t * 5)) * 0.04;
        break;
      case 'look': {
        // Looking about: a slow turn one way, a pause, then the other (hands behind the back).
        aim(0, 0.35, 0.05);
        aim(1, 0.35, -0.05);
        const k = t % 5;
        const side = k < 1.2 ? Math.sin((k / 1.2) * Math.PI * 0.5) : k < 2.4 ? 1 : k < 3.6 ? Math.cos(((k - 2.4) / 1.2) * Math.PI) : -1 + Math.min(1, (k - 3.6) / 1.4);
        this.body.rotation.y = side * 0.55;
        break;
      }
      case 'phone':
        // On the phone: the hand at the ear, the other on the hip, a nod now and then.
        aim(1, -2.35, -0.55);
        aim(0, 0.2, 0.45);
        this.body.rotation.x += Math.max(0, Math.sin(t * 2.2)) * 0.06;
        break;
      case 'chat': {
        // Talking with their hands: one gesture, then the other, a little bob.
        const g = Math.sin(t * 4.2);
        aim(0, -0.7 - Math.max(0, g) * 0.6, 0.35);
        aim(1, -0.7 - Math.max(0, -g) * 0.6, -0.35);
        this.body.position.y += Math.abs(Math.sin(t * 4.2)) * 0.015;
        break;
      }
      case 'yawn': {
        // A big stretch: both arms up overhead, leaning back, then down again.
        const k = Math.min(1, t / 0.5) * (t > 1.6 ? Math.max(0, 1 - (t - 1.6) / 0.5) : 1);
        aim(0, -2.9 * k, 0.35 * k);
        aim(1, -2.9 * k, -0.35 * k);
        this.body.rotation.x -= 0.12 * k;
        break;
      }
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
        this.eyelids = new THREE.Mesh(eyelidGeometryFor(this.look.skin), MATERIALS.character);
        this.eyelids.userData.shared = true;
        this.body.add(this.eyelids);
      }
    } else if (pose === 'sit') {
      this.body.position.y = -SIT_DROP;
    }
    if (this.blanket) this.blanket.visible = pose === 'sleep';
    if (this.eyelids) this.eyelids.visible = pose === 'sleep';
    if (this.bubble) this.bubble.position.z = this.bubbleZ;
  }

  /**
   * `ring` (0..steps, or -1 for none) draws a ring around the bubble. Fix list 3.4 (owner: "no countdowns over
   * passengers"): gameplay no longer passes one; quick service still earns the bigger tip, unseen.
   */
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
      // Fix list 3.4: a small bubble with just the wanted thing (was 0.9, with a countdown ring round it).
      this.bubble = makeSprite(bubbleTexture(icon, style, ring), BUBBLE_SIZE);
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
      // Pop in with a small overshoot, then bob gently so requests catch the eye. Fix list 6.3: shrunk away while a
      // pop-up or label is over it on screen.
      const pop = Math.min(1, this.bubbleTime * 5);
      const p = this.root.position;
      const masked = underPopup(p.x, p.y + this.bubbleBaseY, p.z);
      const s = masked ? 0.0001 : 0.9 * (pop < 1 ? 0.5 + 0.6 * Math.sin(pop * Math.PI * 0.5) : 1);
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
        this.body.position.y = -SIT_DROP;
        this.body.rotation.set(0, 0, 0);
        this.applyAction(dt);
      }
      return;
    }

    const moving = speed > 0.2 && !this.riding;
    this.phase += dt * (moving ? 3 + speed * 2.2 : 1.6);
    const swing = moving ? Math.min(0.75, 0.25 + speed * 0.12) : 0;
    const s = Math.sin(this.phase);
    // A foot lands at each end of the stride (the swing turns), twice a cycle.
    const side = Math.cos(this.phase) >= 0;
    if (moving && side !== this.lastStrideSide) this.footfall = true;
    this.lastStrideSide = side;
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

  /**
   * Session 32: makes a pooled character a fresh one (a new guest from the pool). Every field a character carries is
   * set again here, so nothing of whoever wore it before survives: look, size, pose, eyes, bubble, action, props,
   * walk cycle, transforms and visibility. It is drawn through the batch again from the next frame.
   */
  reset(look: CharacterLook, scale: number): void {
    this.setLook(look);
    if (this.eyelids) this.eyelids.geometry = eyelidGeometryFor(look.skin);
    this.setPose('stand');
    this.showBubble(null);
    this.bubbleTime = 0;
    this.bubbleBaseY = 1.85;
    this.action = 'none';
    this.actionTime = 0;
    this.actionClock = 0;
    for (const mesh of this.props.values()) mesh.visible = false;
    for (const mesh of this.inHand.values()) mesh.visible = false;
    this.carrying = false;
    this.riding = false;
    this.waving = false;
    this.leans = true;
    this.squash = 0;
    this.footfall = false;
    this.phase = Math.random() * 10;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    for (const leg of this.legs) leg.rotation.set(0, 0, 0);
    this.arms.forEach((arm, i) => arm.rotation.set(0, 0, (i === 0 ? -1 : 1) * 0.1));
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(scale);
    this.root.visible = true;
    this.shadow.visible = true;
    CharacterView.batch?.register(this.root);
  }

  /** Session 32: back to the pool (out of the scene and the batch; its meshes and materials are kept for reuse). */
  park(): void {
    this.root.removeFromParent();
    CharacterView.batch?.unregister(this.root);
  }

  dispose(): void {
    if (this.bubble) (this.bubble.material as THREE.SpriteMaterial).dispose();
    CharacterView.batch?.unregister(this.root);
  }
}

export const CONDUCTOR_LOOK: CharacterLook = {
  body: PALETTE.navy, accent: PALETTE.gold, skin: '#F1C7A5', hair: '#4A3426', pants: PALETTE.navyDark, hat: 'conductor', arms: true, moustache: true,
};

/** Staff uniforms: bellhop purple for attendants, signal red for porters, mustard for supply runners. */
export const STAFF_LOOKS: Record<StaffRole, CharacterLook> = {
  attendant: { body: '#7B5AA6', accent: '#7B5AA6', skin: '#E3AE87', hair: '#2F2520', pants: '#6A4C93', hat: 'pillbox', accessory: 'apron', arms: true, outfit: 'dress', sleeves: 'long', hairStyle: 'bob' },
  porter: { body: '#C8453A', accent: '#C8453A', skin: '#C98E68', hair: '#1D1616', pants: '#3A2A2E', hat: 'pillbox', arms: true },
  runner: { body: '#E0A93B', accent: '#3F6E5A', skin: '#F2CFB3', hair: '#8C5A32', pants: '#5A4632', hat: 'cap', arms: true },
  // The venue carriages' staff (session 20): each reads as their job at a glance.
  barista: { body: '#6B4A36', accent: '#3F6E5A', skin: '#E9BC97', hair: '#3A2418', pants: '#2F2A28', hat: 'cap', accessory: 'apron', arms: true },
  chef: { body: '#F2EEE6', accent: '#F2EEE6', skin: '#D9A07A', hair: '#2A1C16', pants: '#3B3B44', hat: 'toque', accessory: 'apron', arms: true, moustache: true },
  waiter: { body: '#1F2433', accent: '#F2EEE6', skin: '#F0C8A8', hair: '#5A3A22', pants: '#1A1C26', accessory: 'flower', arms: true },
  bartender: { body: '#8E2F45', accent: PALETTE.gold, skin: '#B97E5A', hair: '#141012', pants: '#22181C', hat: 'none', accessory: 'sash', arms: true },
  host: { body: '#2E5A7A', accent: '#2E5A7A', skin: '#F2CFB3', hair: '#C9A15A', pants: '#22324A', hat: 'pillbox', arms: true },
  // Session 21: the cinema's projectionist, in an usher's red jacket with gold braid and a cap.
  projectionist: { body: '#A3283A', accent: PALETTE.gold, skin: '#E3AE87', hair: '#2A1C16', pants: '#22181C', hat: 'pillbox', accessory: 'sash', arms: true },
};

function castsShadow<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  return mesh;
}
