import { welded } from './weld';
import * as THREE from 'three';
import type { ItemKind, StaffRole } from '../core/types';
import { Clearance, gripOf, layoutStack, solveArm, type ArmChain, type ArmSolution, type StackItem } from './CarryPose';
import type { IconName } from '../ui/icons';
import { GeoBuilder } from './geo';
import { LIGHT_UNIFORMS, MATERIALS, SHADOW_GEOMETRY } from './materials';
import { PALETTE } from './palette';
import { bubbleTexture, makeSprite, moodBubbleTexture, type BubbleStyle, type Mood } from './sprites';
import { WORLD_UI_LAYER } from './CameraRig';
import { GRIP, TORSO_DEPTH, torsoRadius, addApron, pantsCloth, topCloth, wearing, addHat, addHead, addStrap, addTorso, apronFlapGeometry, coatHalfGeometry, COAT_PIVOT_Y, hairPieceGeometry, HAIR_PIVOT, skirtGeometry, WAIST_Y, warmSkin, type FeltHat, ELBOW_Y, eyelidGeometry, faceDepth, forearmGeometry, HAND_Y, HEAD_TOP, HEAD_Y, hipX, HIP_Y, KNEE_Y, LEG_LENGTH, NECK_Y, occludeBody, occludeHead, shinGeometry, shoulderX, SHOULDER_Y, thighGeometry, upperArmGeometry, type Build, type FigureSpec, type HairStyle, type Outfit } from './CharacterParts';
import { underPopup } from './screenMask';
import { ON_TRAY } from './ItemMeshes';
import type { CharacterBatch } from './CharacterBatch';

export type HatKind = 'conductor' | 'boater' | 'bowler' | 'pillbox' | 'cap' | 'beanie' | 'bun' | 'crown' | 'tophat' | 'toque' | 'none';
export type AccessoryKind = 'briefcase' | 'backpack' | 'handbag' | 'flower' | 'furcoat' | 'apron' | 'child' | 'camera' | 'sash' | 'basket' | 'hymnbook' | 'cane' | 'surfboard' | 'partner' | 'whistle' | 'none';

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
  /** The clay figures' build (CHARACTER_SPEC §2): torso width against the head's. */
  build?: Build;
}

/** Character pass 2: the stack sits on the forearms, held out level in front (they were straight arms at shoulder height). */
export const STACK_BASE_Y = 0.665;
const SHOE = '#2A2433';
/** Session 38b: the mood bubble's world size (its canvas is square), how fast a bubble pops in, and how much higher it hangs. */
const MOOD_BUBBLE_SIZE = 1.0;
const BUBBLE_POP_RATE = 4.5;
const MOOD_BUBBLE_LIFT = 0.08;
/** World size of a guest's request bubble (fix list 3.4: smaller, was 0.9). */
const BUBBLE_SIZE = 0.74;
/** Lounging (the Beach Lounge): how far the body tips back, and the hip's height over the root (the lounger's top). */
const LOUNGE_TILT = 1.05;
const LOUNGE_HIP = 0.06;
/** How far the body drops to sit (hips onto a seat about 0.24 m up). */
const SIT_DROP = HIP_Y - 0.26;
/** The share of a scooter kick cycle the back foot is down pushing; the rest is coasting. */
const RIDE_PUSH = 0.45;
/** The arms' reach forward to the scooter's handlebar. */
const RIDE_ARM = -1.05;

/**
 * The toy walk and run (CHARACTER_SPEC §8): thigh swing each way, the passing knee's fold, the arm swing and the
 * elbow's bend, the bob, the roll over the stance foot, the hip twist and the forward lean.
 */
const WALK = { stride: 0.45, knee: 0.62, arm: 0.78, elbow: 0.4, bob: 0.035, sway: 0.06, twist: 0.1, lean: 0.06 };
const RUN = { stride: 0.8, knee: 1.1, arm: 0.88, elbow: 1.2, bob: 0.07, sway: 0.04, twist: 0.14, lean: 0.16 };
/** How quickly a turn eases round (rad/s of the remaining angle): quick, never a snap. */
const TURN_RATE = 16;
function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

const bodyCache = new Map<string, THREE.BufferGeometry>();
const limbCache = new Map<string, THREE.BufferGeometry>();

/** The look's figure: the outfit, sleeves and hairdo it implies when it does not say. */
const skinCache = new Map<string, string>();
/** The look's skin, warmed toward the reference's peach (CharacterParts `warmSkin`), cached per colour. */
function skinOf(look: CharacterLook): string {
  let k = skinCache.get(look.skin);
  if (!k) {
    k = warmSkin(look.skin);
    skinCache.set(look.skin, k);
  }
  return k;
}

function figureOf(look: CharacterLook): FigureSpec & { long: boolean } {
  const fur = look.accessory === 'furcoat';
  const outfit: Outfit = fur ? 'coat' : look.outfit ?? (look.arms ? 'jacket' : 'tee');
  const hairStyle: HairStyle = look.hairStyle ?? (look.longHair ? 'long' : look.hat === 'bun' ? 'bun' : 'short');
  return {
    skin: skinOf(look),
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
    hatted: look.hat !== undefined && look.hat !== 'none' && look.hat !== 'bun' && look.hat !== 'pillbox' && look.hat !== 'crown',
    build: look.build ?? 'regular',
    long: look.sleeves ? look.sleeves === 'long' : outfit === 'jacket' || outfit === 'coat' || outfit === 'shirt' || outfit === 'gown',
  };
}

/** Merged body: torso, head with a face and hair, a hat, and the accessory that tells you who they are. */
const headCache = new Map<string, THREE.BufferGeometry>();

/**
 * The head, face, hair and hat, about the neck pivot (character pass 2: the head is its own part, so a figure can turn
 * to look, nod as it pays and tilt its head as it waits).
 */
function headGeometry(look: CharacterLook): THREE.BufferGeometry {
  const key = JSON.stringify([look.skin, look.hair, look.hairStyle, look.longHair, look.hat, look.hatColor, look.bandColor, look.accent, look.body, look.moustache, look.glasses, look.accessory === 'furcoat', look.outfit, look.arms, look.build]);
  const cached = headCache.get(key);
  if (cached) return cached;
  const b = new GeoBuilder();
  const f = figureOf(look);
  addHead(b, f);
  const T = HEAD_TOP;
  // Session 62 ("flat hat crowns"): every hat but the crown is a soft felt model (art/blender/characters/char_kit.py),
  // its crown, band, peak and badge in the look's colours.
  const felt = (kind: FeltHat, crown: string, band: string, peak = crown, trim = PALETTE.gold): void => addHat(b, kind, { crown, band, peak, trim });
  switch (look.hat) {
    case 'conductor': {
      const crown = look.hatColor ?? PALETTE.navy;
      felt('conductor', crown, look.bandColor ?? PALETTE.locoRed, shadeOf(crown), PALETTE.gold);
      break;
    }
    case 'boater':
      felt('boater', look.hatColor ?? '#E8D29A', look.bandColor ?? PALETTE.raspberry);
      break;
    case 'bowler':
      felt('bowler', look.hatColor ?? '#2B2A30', look.bandColor ?? '#4A3A36');
      break;
    case 'pillbox':
      felt('pillbox', look.hatColor ?? look.body, look.hatColor ?? look.body, look.hatColor ?? look.body, PALETTE.gold);
      break;
    case 'cap':
      felt('cap', look.hatColor ?? look.accent, look.hatColor ?? look.accent, shadeOf(look.hatColor ?? look.accent), shadeOf(look.hatColor ?? look.accent));
      break;
    case 'beanie':
      felt('beanie', look.hatColor ?? look.accent, shadeOf(look.hatColor ?? look.accent), look.hatColor ?? look.accent, PALETTE.linen);
      break;
    case 'tophat':
      felt('tophat', look.hatColor ?? '#1E1B24', look.bandColor ?? PALETTE.gold);
      break;
    case 'toque':
      felt('toque', PALETTE.linen, PALETTE.linen);
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
    default:
      break;
  }
  const head = b.build();
  head.translate(0, -NECK_Y, 0);
  const welds = welded(occludeHead(head, figureOf(look).build));
  headCache.set(key, welds);
  return welds;
}

/** The body: the torso and what is worn on it (the head is its own part, `headGeometry`). */
function bodyGeometry(look: CharacterLook): THREE.BufferGeometry {
  const key = JSON.stringify(look);
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const b = new GeoBuilder();
  const f = figureOf(look);
  addTorso(b, f);
  const flat = { shade: 1 };
  const front = (y: number): number => faceDepth(y, f.build);
  /** How much deeper the clay torso is at the back than the old one (backpacks, boards sit out on it). */
  const back = faceDepth(0.6, f.build) - 0.124;
  switch (look.accessory) {
    case 'backpack':
      b.rounded(0, 0.6, -0.2 - back, 0.3, 0.36, 0.15, 0.06, look.accent, { shade: 0.82, surface: 'fabric', detail: 'oxford' });
      b.rounded(0, 0.53, -0.285 - back, 0.22, 0.12, 0.04, 0.02, shadeOf(look.accent), flat);
      // Straps that hug the round chest from the belly up over each shoulder to the pack.
      for (const sx of [-1, 1]) addStrap(b, sx * 0.1, '#5A3A26', f.build);
      break;
    case 'flower':
      b.sphere(0.08, 0.68, front(0.68) + 0.01, 0.038, look.accent, 1);
      b.sphere(0.08, 0.68, front(0.68) + 0.035, 0.018, PALETTE.mustard, 1);
      break;
    case 'apron':
      // Session 62: the apron's skirt swings with the legs (a piece of its own, or part of the dress's bell).
      addApron(b, PALETTE.linen, f.build, f.outfit === 'dress' || f.outfit === 'gown', 'bib');
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
    // Phase 1, the Countryside Express's own passengers.
    case 'basket': {
      // A farmer's wicker basket of produce on the hip: apples, a cabbage, carrot tops.
      const bx = 0.2;
      const by = 0.46;
      const bz = front(0.46) - 0.02;
      b.rounded(bx, by, bz, 0.16, 0.1, 0.13, 0.03, '#B98A4E', { shade: 0.85, surface: 'fabric', detail: 'straw' });
      b.add(new THREE.TorusGeometry(0.065, 0.01, 6, 12, Math.PI), '#8C6438', bx, by + 0.05, bz, 0, Math.PI / 2, 0, flat);
      b.sphere(bx - 0.035, by + 0.06, bz + 0.02, 0.032, '#C0392B', 1);
      b.sphere(bx + 0.03, by + 0.065, bz - 0.01, 0.038, '#7FA34E', 1);
      b.sphere(bx + 0.01, by + 0.06, bz + 0.04, 0.028, '#D9542A', 1);
      break;
    }
    case 'hymnbook':
      // The choir's hymn book held open at the chest, a gold edge to its pages.
      b.box(0, 0.6, front(0.6) + 0.04, 0.15, 0.11, 0.02, '#2A1E22', 0.15, flat);
      b.box(0, 0.6, front(0.6) + 0.052, 0.13, 0.095, 0.006, '#F2EAD8', 0.15, flat);
      break;
    case 'cane':
      // A walking cane at the grandfather's side, its crook by the hand.
      b.cylinder(0.24, 0.25, front(0.3) - 0.04, 0.012, 0.012, 0.5, '#5E4232', 8, 'y', flat);
      b.add(new THREE.TorusGeometry(0.035, 0.012, 6, 10, Math.PI), '#5E4232', 0.24, 0.5, front(0.3) - 0.04, 0, Math.PI / 2, 0, flat);
      break;
    case 'handbag':
      for (let i = 0; i < 5; i++) b.sphere(-0.08 + i * 0.04, 0.79 - Math.abs(i - 2) * 0.012, front(0.79) + 0.01, 0.018, PALETTE.linen, 0, 1, flat);
      break;
    // Phase 4, the Riviera: a surfer's board is held in the hand (forearmGeometry, session 63).
    // The lifeguard's whistle on a red cord.
    case 'whistle':
      b.add(new THREE.TorusGeometry(0.1, 0.008, 5, 14, Math.PI).scale(1, 1.4, 1), '#C0283A', 0, 0.72, front(0.68) - 0.02, Math.PI, 0, 0, flat);
      b.rounded(0, 0.6, front(0.6) + 0.02, 0.05, 0.03, 0.03, 0.01, '#E8E2D6', { shade: 1, surface: 'steel' });
      break;
    default:
      break;
  }
  const geometry = welded(occludeBody(b.build(), f.build));
  bodyCache.set(key, geometry);
  return geometry;
}

/** The crown of a soft hat: the top `frac` of a sphere of `radius`, squashed to `sy`, open underneath. */
/** A limb part, built once per look and kept (welded, so the batch draws fewer vertices). */
/**
 * Session 62 (owner: "make sure their clothing actually genuinely behaves somewhat like clothing… everything is way too
 * stiff"): the pieces that hang and swing. Each is a mesh on its own pivot, swung by a damped spring (`Cloth`).
 */
type ClothKind = 'skirt' | 'coat' | 'apron' | 'hair';
interface ClothSpec {
  kind: ClothKind;
  /** Pivot in body space (hair: head space). */
  at: [number, number, number];
  side: 1 | -1 | 0;
  geometry: THREE.BufferGeometry;
}
const clothCache = new Map<string, THREE.BufferGeometry>();
function clothPieces(look: CharacterLook): ClothSpec[] {
  const f = figureOf(look);
  const out: ClothSpec[] = [];
  const cached = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
    let g = clothCache.get(key);
    if (!g) {
      g = welded(make());
      clothCache.set(key, g);
    }
    return g;
  };
  const apron = look.accessory === 'apron' ? PALETTE.linen : null;
  if (f.outfit === 'dress' || f.outfit === 'gown') {
    out.push({ kind: 'skirt', at: [0, WAIST_Y, 0], side: 0, geometry: cached(`skirt:${f.outfit}:${f.pants}:${f.build}:${apron}`, () => skirtGeometry(f, apron)) });
  } else if (apron) {
    out.push({ kind: 'apron', at: [0, WAIST_Y, 0], side: 0, geometry: cached(`apron:${apron}:${f.build}`, () => apronFlapGeometry(apron, f.build)) });
  }
  if (f.outfit === 'coat') {
    const lining = f.fur ?? (look.trim && look.trim !== look.body ? look.trim : shadeOf(look.body));
    for (const side of [-1, 1] as const) out.push({ kind: 'coat', at: [0, COAT_PIVOT_Y, 0], side, geometry: cached(`coat:${f.top}:${lining}:${f.build}:${side}`, () => coatHalfGeometry(f, side, lining)) });
  }
  const hair = f.hairStyle === 'long' ? 'long' : f.hairStyle === 'ponytail' && !f.hatted ? 'ponytail' : null;
  if (hair) {
    const g = cached(`hair:${hair}:${f.hair}:${f.skin}:${f.top}`, () => hairPieceGeometry(f)!);
    const p = HAIR_PIVOT[hair];
    // Head space is the neck pivot's: the head's centre sits HEAD_Y − NECK_Y above it.
    out.push({ kind: 'hair', at: [p[0], p[1] + HEAD_Y - NECK_Y, p[2]], side: 0, geometry: g });
  }
  return out;
}

/** How each kind of piece swings: stiffness, damping (per second²/second), how far it may swing (radians). */
const CLOTH_SPRING: Record<ClothKind, { k: number; c: number; max: number; drag: number; accel: number }> = {
  skirt: { k: 95, c: 6.5, max: 0.5, drag: 0.035, accel: 0.03 },
  coat: { k: 120, c: 7.5, max: 0.6, drag: 0.045, accel: 0.035 },
  apron: { k: 140, c: 8, max: 0.6, drag: 0.05, accel: 0.04 },
  hair: { k: 70, c: 5, max: 0.7, drag: 0.06, accel: 0.04 },
};

interface Cloth {
  spec: ClothSpec;
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  /** Swing about x (forward-back), z (side to side) and y (twist), in the parent's frame plus the parent's own motion. */
  wx: number;
  vx: number;
  wz: number;
  vz: number;
  wy: number;
  vy: number;
  /** The hem's flare (a scale of its spread), bouncing with the steps. */
  flare: number;
  vf: number;
  /** Session 63: the flare and swing that keep the legs inside it (eased out, never in). */
  keepFlare: number;
  keepSwing: number;
}

/**
 * Session 63 ("zero clip ins"): a swinging piece's outline round its own axis (its pivot's y), the furthest its surface
 * reaches in each direction at each height, measured from its mesh. A leg inside it must stay inside it: where a stride
 * would take a knee or a shoe through it, the piece flares out just enough (`containLegs`).
 */
class ClothShape {
  static readonly DY = 0.02;
  static readonly AB = 24;
  readonly y0: number;
  readonly rows: number;
  readonly r: Float32Array;
  constructor(g: THREE.BufferGeometry) {
    const p = g.getAttribute('position');
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      lo = Math.min(lo, p.getY(i));
      hi = Math.max(hi, p.getY(i));
    }
    this.y0 = lo;
    this.rows = Math.max(1, Math.ceil((hi - lo) / ClothShape.DY) + 1);
    const r = new Float32Array(this.rows * ClothShape.AB).fill(-1);
    for (let i = 0; i < p.count; i++) {
      const row = Math.floor((p.getY(i) - lo) / ClothShape.DY);
      const a = ClothShape.bin(p.getX(i), p.getZ(i));
      const k = row * ClothShape.AB + a;
      r[k] = Math.max(r[k], Math.hypot(p.getX(i), p.getZ(i)));
    }
    // A lathe has vertices only on its profile's rings: between two rings the surface runs straight, so fill the rows
    // between them (in each direction it covers) by interpolation.
    for (let a = 0; a < ClothShape.AB; a++) {
      let last = -1;
      for (let row = 0; row < this.rows; row++) {
        if (r[row * ClothShape.AB + a] < 0) continue;
        if (last >= 0 && row - last > 1) {
          const r0 = r[last * ClothShape.AB + a];
          const r1 = r[row * ClothShape.AB + a];
          for (let k = last + 1; k < row; k++) r[k * ClothShape.AB + a] = r0 + ((r1 - r0) * (k - last)) / (row - last);
        }
        last = row;
      }
    }
    this.r = r;
  }
  static bin(x: number, z: number): number {
    return Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * ClothShape.AB) % ClothShape.AB;
  }
  /** The piece's reach at a height and direction (−1 where it does not hang: a coat's open front). */
  at(y: number, x: number, z: number): number {
    const row = Math.floor((y - this.y0) / ClothShape.DY);
    if (row < 1 || row >= this.rows - 1) return -1;
    const a = ClothShape.bin(x, z);
    let best = -1;
    // The smallest of its own bin and its neighbours (the surface between a lathe's segments, never beyond its edge).
    for (const dr of [0, -1, 1]) {
      const v = this.r[(row + dr) * ClothShape.AB + a];
      if (v < 0) return -1;
      best = best < 0 ? v : Math.min(best, v);
    }
    return best;
  }
}
const clothShapes = new WeakMap<THREE.BufferGeometry, ClothShape>();
function clothShape(g: THREE.BufferGeometry): ClothShape {
  let s = clothShapes.get(g);
  if (!s) {
    s = new ClothShape(g);
    clothShapes.set(g, s);
  }
  return s;
}
/** A part's surface thinned to one point per cell (what a skirt must keep inside it), cached per geometry. */
const SURFACE_CELL = 0.022;
const surfaceCache = new WeakMap<THREE.BufferGeometry, Float32Array>();
function surfacePoints(g: THREE.BufferGeometry): Float32Array {
  let pts = surfaceCache.get(g);
  if (!pts) {
    const p = g.getAttribute('position');
    const seen = new Map<string, number[]>();
    for (let i = 0; i < p.count; i++) {
      const key = `${Math.round(p.getX(i) / SURFACE_CELL)},${Math.round(p.getY(i) / SURFACE_CELL)},${Math.round(p.getZ(i) / SURFACE_CELL)}`;
      if (!seen.has(key)) seen.set(key, [p.getX(i), p.getY(i), p.getZ(i)]);
    }
    pts = new Float32Array([...seen.values()].flat());
    surfaceCache.set(g, pts);
  }
  return pts;
}

/** How far clear of a leg a skirt or coat stays, and how far out it may flare to keep it in. */
const LEG_ROOM = 0.032;
/** How far a skirt or coat may swing sideways (radians): a bag beside it or a hanging hand keeps clear of it. */
const SIDE_SWING = 0.07;
/** Session 63: how far out (radians) an arm raised overhead goes: clear of the wide clay head, a cheer's Y. */
const ARMS_UP_OUT = 0.78;
const FREE_STRIDE = { walk: 1, run: 1, kick: 1 };
const GOWN_STRIDE = { walk: 0.58, run: 0.4, kick: 0.33 };
const DRESS_STRIDE = { walk: 0.82, run: 0.58, kick: 0.45 };
const COAT_STRIDE = { walk: 0.9, run: 0.62, kick: 0.5 };
const APRON_STRIDE = { walk: 0.95, run: 0.82, kick: 0.65 };
const MAX_FLARE = 1.3;
const cv = new THREE.Vector3();
/** What `containLegs` found this frame. */
const contain = { scale: 1, swing: 0 };
/** The swings a skirt or coat tries (radians about its pivot's x, forward negative) to keep the legs inside it. */
const SWING_TRIES = [0, 0, -0.12, 0.12, -0.25, 0.25, -0.4, 0.4, -0.55, 0.55, -0.7, 0.7];
const cq = new THREE.Quaternion();
const cm = new THREE.Matrix4();

function limb(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = limbCache.get(key);
  if (!g) {
    g = welded(build());
    limbCache.set(key, g);
  }
  return g;
}

/** Smart shoes for uniforms, coats, jackets and gowns; sneakers for everyone in a tee or a shirt. */
function smartShoes(f: FigureSpec): boolean {
  return f.outfit === 'jacket' || f.outfit === 'coat' || f.outfit === 'gown';
}

function thighGeometryFor(look: CharacterLook, side: 1 | -1): THREE.BufferGeometry {
  const f = figureOf(look);
  const bare = f.outfit === 'dress' || f.outfit === 'gown';
  const cloth = pantsCloth(f);
  return limb(`thigh:${f.pants}:${bare}:${f.skin}:${f.build}:${side}:${cloth}`, () => wearing(cloth, () => thighGeometry(f.pants, bare, f.skin, f.build, side)));
}

function shinGeometryFor(look: CharacterLook, side: 1 | -1): THREE.BufferGeometry {
  const f = figureOf(look);
  const bare = f.outfit === 'dress' || f.outfit === 'gown';
  const smart = smartShoes(f);
  const cloth = pantsCloth(f);
  return limb(`shin:${f.pants}:${look.shoe}:${bare}:${f.skin}:${look.sock}:${smart}:${f.build}:${side}:${cloth}`, () => wearing(cloth, () => shinGeometry(f.pants, look.shoe ?? SHOE, bare, f.skin, look.sock ?? '#F4F1EA', smart, f.build, side)));
}

function upperArmGeometryFor(look: CharacterLook, side: 1 | -1): THREE.BufferGeometry {
  const f = figureOf(look);
  const cloth = topCloth(f);
  return limb(`upper:${look.body}:${f.skin}:${f.long}:${f.build}:${side}:${cloth}`, () => wearing(cloth, () => upperArmGeometry(look.body, f.skin, f.long, f.build, side)));
}

function forearmGeometryFor(look: CharacterLook, side: 1 | -1): THREE.BufferGeometry {
  const f = figureOf(look);
  const carried = look.accessory === 'briefcase' || look.accessory === 'handbag' || look.accessory === 'surfboard' ? look.accessory : null;
  const cuff = f.outfit === 'jacket' && look.accent !== look.body ? look.accent : undefined;
  const cloth = topCloth(f);
  return limb(`fore:${look.body}:${f.skin}:${f.long}:${carried}:${side}:${cuff}:${f.build}:${cloth}`, () => wearing(cloth, () => forearmGeometry(look.body, f.skin, f.long, side, carried, cuff, f.build)));
}

function shadeOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v - 28));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

/**
 * Session 62 ("no long cast shadow"): the reference's figures throw a long soft shadow away from the key light. Shadow
 * maps are off on every tier, so each figure lays a soft stretched blob from its feet away from the light (the moon at
 * night, the low sun at golden hour), as long as the light is low. One more quad fan per person, in the shadows' batch.
 */
const CAST_GEOMETRY = ((): THREE.BufferGeometry => {
  const rings = [0, 0.25, 0.5, 0.75, 1];
  const alpha = [0.7, 0.62, 0.42, 0.18, 0];
  const seg = 18;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // An egg from the feet outward: centred half a length out, narrow near the feet, fuller at the far end.
      const z = 0.5 + Math.sin(a) * 0.5 * rings[r];
      const w = 0.24 + 0.08 * Math.max(0, Math.sin(a));
      pos.push(Math.cos(a) * w * rings[r], 0, z);
      col.push(1, 1, 1, alpha[r]);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * seg + i;
      const b = r * seg + ((i + 1) % seg);
      const c = (r + 1) * seg + i;
      const d = (r + 1) * seg + ((i + 1) % seg);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
})();
/** The cast shadow's length for a light this high (metres for a 1.2 m figure), and its limits. */
const CAST_MIN = 0.35;
const CAST_MAX = 1.5;
/** Children (a figure drawn at under this scale) have a bigger head for their body: 2.4 heads tall (CHARACTER_SPEC §2). */
const CHILD_SCALE = 0.8;
const CHILD_HEAD = 1.25;

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
export type CharacterAction = 'none' | 'sweep' | 'read' | 'sip' | 'watch' | 'wash' | 'stamp' | 'hug' | 'wave' | 'look' | 'phone' | 'chat' | 'yawn' | 'waveTicket' | 'stomp' | 'pickup' | 'place' | 'cheer' | 'work' | 'skim';

/**
 * Character pass 2: the quick moves that answer what a figure just did. They restart each time they are asked for (a
 * pickup per item taken, a reach per thing handed over), so picking up three towels reads as three quick dips.
 */

/**
 * Session 63 (owner: "individual detailed animation… picking up the bags, holding the bags, and picking up everything
 * else… zero clip ins"): what a figure carries and how. Every load has its own hold, solved by IK so the hands are
 * really on it (`CarryPose`):
 *  - a tray (food and drink): palms up under its back corners, elbows tucked;
 *  - linen (towels, blankets, pillows, rolls, robes): an armful on the forearms, hands under it;
 *  - a crate: low and close, the body leaning back against its weight;
 *  - luggage: one or two bags by their handles, hanging at the sides clear of the legs (more go in front, stacked);
 * and its own take and hand-over moves (`MOTION`): a tray offered forward to receive and to serve, an armful reached
 * for and hugged in, a crate squatted for, a bag picked up with a bend toward its side and set down the same way.
 * A stack in front is placed clear of the figure at every height (its belly, its collar, its nose, its hat), measured
 * from its own meshes (`Clearance`); a tall one steps out where the face is and the head turns to peek round it.
 */
export type CarryKind = 'tray' | 'linen' | 'crate' | 'luggage';
export interface CarryLoad {
  /** The stack in front, bottom first (a tray, when there is one, is its bottom item), at its carried size. */
  front: readonly StackItem[];
  frontKind: CarryKind;
  /** A bag in each hand (index as the arms: 0 is −x), its footprint as carried, turned so its depth is across x. */
  hands: readonly (StackItem | null)[];
}
export const EMPTY_LOAD: CarryLoad = { front: [], frontKind: 'linen', hands: [null, null] };
type Motion = 'none' | CarryKind | 'bag' | 'board';
/** How long each take and hand-over move lasts (seconds). */
const MOTION_SECONDS: Record<Motion, { pickup: number; place: number }> = {
  none: { pickup: 0.34, place: 0.32 },
  tray: { pickup: 0.42, place: 0.44 },
  linen: { pickup: 0.44, place: 0.42 },
  crate: { pickup: 0.62, place: 0.56 },
  luggage: { pickup: 0.54, place: 0.5 },
  bag: { pickup: 0.52, place: 0.46 },
  board: { pickup: 0.45, place: 0.4 },
};
/** The front stack's bottom (body space) and how clear of the figure it stands. */
const HOLD_Y = 0.66;
const STACK_GAP = 0.014;
/** The grip below the stack's bottom (a palm-up mitten's half-thickness) and in from its back edge. */
const PALM_UNDER = 0.047;
const GRIP_IN = 0.07;
const GRIP_SPREAD = 0.15;
/** Beyond this from the shoulder the stack is lifted closer (an arm a little short of straight). */
const REACH = 0.285;
/** A stack whose top rises past here is in front of the face: it steps out and the head peeks round it. */
const PEEK_Y = 0.84;
const PEEK_YAW = 0.52;
/** A bag hangs from the hand at this height, this clear of whatever is beside it (legs, a skirt, a coat). */
const BAG_GRIP_Y = 0.47;
const BAG_GAP = 0.016;
const BAG_MIN_X = 0.29;
/** The hand on a box on the shoulder (Station's SUPPLY_BOX_AT): against its front face. */
const BOX_HAND = new THREE.Vector3(0.34, 0.86, 0.16);
const POLE_FRONT = [new THREE.Vector3(-0.75, -0.5, -0.45), new THREE.Vector3(0.75, -0.5, -0.45)];
const POLE_BAG = [new THREE.Vector3(-0.25, 0.1, -1), new THREE.Vector3(0.25, 0.1, -1)];
const POLE_BOX = new THREE.Vector3(0.6, -0.8, -0.2);
/** Where a cup is drunk from and a phone is held (body space): the mouth's and the ear's height, how far out of them. */
const MOUTH_Y = HEAD_Y - 0.11;
const EAR_Y = HEAD_Y - 0.01;
const CUP_OUT = 0.075;
const PHONE_OUT = 0.05;
const SIP_POLE = new THREE.Vector3(0.7, -0.7, -0.1);
const PHONE_POLE = new THREE.Vector3(0.8, -0.5, -0.2);
const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, -1);
const IN = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)];
const GRIP_V = new THREE.Vector3(...GRIP);
const hv = new THREE.Vector3();
const hv2 = new THREE.Vector3();
const hq = new THREE.Quaternion();
const hE = new THREE.Euler();
const hM = new THREE.Matrix4();
const hTargets = [new THREE.Vector3(), new THREE.Vector3()];
const armTip = new THREE.Vector3();
/** How clear of the torso an arm reaching round it keeps (metres). */
const ARM_ROOM = 0.004;
const hPalm: (THREE.Vector3 | null)[] = [null, null];
const hPole: THREE.Vector3[] = [POLE_FRONT[0], POLE_FRONT[1]];

/** A smooth rise to 1 at `peak` and back to 0 at 1. */
function envelope(p: number, peak: number): number {
  if (p <= 0 || p >= 1) return 0;
  return p < peak ? smooth01(p / peak) : smooth01((1 - p) / (1 - peak));
}

const SNAP_ACTIONS: ReadonlySet<CharacterAction> = new Set(['pickup', 'place', 'cheer']);
/** How long each of them lasts (s). */
const SNAP_SECONDS: Partial<Record<CharacterAction, number>> = { pickup: 0.34, place: 0.32, cheer: 0.95 };
type PropKind = 'broom' | 'paper' | 'cup' | 'stamp' | 'bundle' | 'phone' | 'ticket' | 'net';

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
    case 'net':
      // The pool's skimmer (owner, 26 Nov: "what does our player do exactly?"): a long pole held in both hands,
      // reaching down and out over the water to a hoop of green net.
      b.cylinder(0, -0.2, 0.5, 0.016, 0.016, 1.5, '#E9E4D8', 6, 'z', style);
      b.cylinder(0, -0.2, -0.1, 0.022, 0.022, 0.12, '#3FA0C8', 6, 'z', style);
      b.add(new THREE.TorusGeometry(0.17, 0.014, 6, 16).rotateX(Math.PI / 2), '#E9E4D8', 0, -0.2, 1.4, 0, 0, 0, style);
      b.add(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.7, 1), '#5FA86A', 0, -0.205, 1.4, 0, 0, 0, style);
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
  skim: { kind: 'net', pos: [0.04, 0.62, 0.2], rot: [0.32, 0, 0] },
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
  /** Where a carried surfboard rides: on its edge under the left arm, pointing the way they walk. */
  readonly boardAnchor = new THREE.Object3D();
  /**
   * Session 63: a bag hangs from each of these (body space, placed on the hand's grip point every frame, swinging
   * with the walk), index as the arms (0 is −x).
   */
  readonly handAnchors: readonly THREE.Object3D[] = [new THREE.Object3D(), new THREE.Object3D()];
  /** Each stacked item's centre z relative to the stack anchor (clear of the figure), bottom first. */
  readonly stackZ: number[] = [];
  private load: CarryLoad = EMPTY_LOAD;
  /** What was last held in front (the hands finish handing it over after it has gone). */
  private ghost: StackItem[] = [];
  private ghostKind: CarryKind = 'linen';
  private readonly clearRest = new Clearance();
  private readonly clearPeek = new Clearance();
  private clearKey = -1;
  private readonly chains: ArmChain[] = [];
  /** How much each arm follows its IK hold (eased, so taking hold and letting go never snap). */
  private readonly ikWeight = [0, 0];
  private readonly ikSolved: ArmSolution[] = [{ shoulder: new THREE.Quaternion(), bend: 0, reached: true }, { shoulder: new THREE.Quaternion(), bend: 0, reached: true }];
  /** The kind of take or hand-over move under way, which hand it is for, and how long it lasts. */
  private motion: Motion = 'none';
  private motionHand = 1;
  private motionPlace = false;
  private motionLength = 0.34;
  private motionArmed = false;
  /** The take or hand-over's reach this frame (set by the move, read by the hold). */
  private reachDy = 0;
  private reachDz = 0;
  private bagDy = 0;
  private bagDz = 0;
  private bagDx = 0;
  private walkS = 0;
  private lookStamp = 0;
  /** A carried bag's swing (radians about x) and its rate, and the hand's last body-space z (for its velocity). */
  private readonly bagSwing = [0, 0];
  private readonly bagRate = [0, 0];
  private readonly lastHandZ = [0, 0];
  /** The front stack's bottom-centre z and base height, eased (the hands and the items follow it together). */
  private stackBaseZ = 0.3;
  private readonly legs: THREE.Object3D[] = [];
  private readonly arms: THREE.Object3D[] = [];
  private readonly shadow: THREE.Mesh;
  /** The long soft shadow away from the key light (session 62). */
  private readonly cast: THREE.Mesh;
  /** The swinging pieces (skirts, coat tails, an apron, long hair) and their springs. */
  private readonly cloth: Cloth[] = [];
  /** Where the root was last frame and how fast it moved (world, per second), for the cloth's inertia. */
  private lastPos = new THREE.Vector3(Number.NaN, 0, 0);
  private velX = 0;
  private velZ = 0;
  private accX = 0;
  private accZ = 0;
  private lastYawSeen = 0;
  private lastBodyY = 0;
  private bodyVy = 0;
  private bubble: THREE.Sprite | null = null;
  private bubbleKey = '';
  private phase = Math.random() * 10;
  private carrying = false;
  private pose: 'stand' | 'sleep' | 'sit' | 'lounge' = 'stand';
  private bubbleTime = 0;
  private bubbleBaseY = 1.85;
  private bubbleZ = 0;
  /** Session 38b: the face in the bubble (null for a plain icon bubble) and whether it is the wide mood bubble. */
  private bubbleMood: Mood | null = null;
  private bubbleWide = false;
  private squash = 0;
  /** Session 38b: the walk's swing and forward lean, eased in and out. */
  private swingNow = 0;
  /** The way the character faces (radians about y): the root's rotation is always (tilt, yaw, 0), written whole. */
  private yaw = 0;
  /** The train's sway, for those aboard and awake. */
  private tilt(): number {
    return this.pose === 'sleep' || !this.leans ? 0 : CharacterView.lean;
  }
  private leanNow = 0;
  /** The walk's roll over the stance foot and the hips' twist (CHARACTER_SPEC §8). */
  private swayZ = 0;
  private twistY = 0;
  /** Eased turns: the way the figure is asked to face, and the way it faces now (radians about y). */
  private yawTarget = 0;
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
  private readonly headMesh: THREE.Mesh;
  /** Character pass 2: the neck, knees and elbows (each a pivot below its hip, shoulder or the body). */
  private readonly head = new THREE.Object3D();
  private readonly knees: THREE.Object3D[] = [];
  private readonly elbows: THREE.Object3D[] = [];
  private readonly thighMeshes: THREE.Mesh[] = [];
  private readonly shinMeshes: THREE.Mesh[] = [];
  private readonly upperMeshes: THREE.Mesh[] = [];
  private readonly foreMeshes: THREE.Mesh[] = [];

  constructor(public look: CharacterLook, scale = 1) {
    this.root.add(this.body);
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * hipX(figureOf(look).build), HIP_Y, 0);
      const thigh = castsShadow(new THREE.Mesh(thighGeometryFor(look, side), MATERIALS.character));
      pivot.add(thigh);
      const knee = new THREE.Object3D();
      knee.position.y = KNEE_Y;
      const shin = castsShadow(new THREE.Mesh(shinGeometryFor(look, side), MATERIALS.character));
      knee.add(shin);
      pivot.add(knee);
      this.body.add(pivot);
      this.legs.push(pivot);
      this.knees.push(knee);
      this.thighMeshes.push(thigh);
      this.shinMeshes.push(shin);
    }
    this.bodyMesh = castsShadow(new THREE.Mesh(bodyGeometry(look), MATERIALS.character));
    this.body.add(this.bodyMesh);
    this.head.position.y = NECK_Y;
    this.headMesh = castsShadow(new THREE.Mesh(headGeometry(look), MATERIALS.character));
    this.head.add(this.headMesh);
    this.body.add(this.head);

    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * shoulderX(figureOf(look).build), SHOULDER_Y, 0);
      const upper = castsShadow(new THREE.Mesh(upperArmGeometryFor(look, side), MATERIALS.character));
      pivot.add(upper);
      const elbow = new THREE.Object3D();
      elbow.position.y = ELBOW_Y;
      const fore = castsShadow(new THREE.Mesh(forearmGeometryFor(look, side), MATERIALS.character));
      elbow.add(fore);
      pivot.add(elbow);
      pivot.rotation.z = side * 0.1;
      this.body.add(pivot);
      this.arms.push(pivot);
      this.elbows.push(elbow);
      this.upperMeshes.push(upper);
      this.foreMeshes.push(fore);
    }

    this.stackAnchor.position.set(0, STACK_BASE_Y, 0.29);
    this.body.add(this.stackAnchor);
    this.boardAnchor.position.set(-0.27, 0.43, 0.04);
    this.body.add(this.boardAnchor);
    for (const a of this.handAnchors) this.body.add(a);
    for (let i = 0; i < 2; i++) this.chains.push({ shoulder: new THREE.Vector3(), upper: -ELBOW_Y, fore: Math.hypot(GRIP[1], GRIP[2]), side: i === 0 ? -1 : 1 });

    this.shadow = new THREE.Mesh(SHADOW_GEOMETRY, MATERIALS.shadow);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    this.cast = new THREE.Mesh(CAST_GEOMETRY, MATERIALS.shadow);
    this.cast.position.y = 0.01;
    this.root.add(this.cast);
    // Shadows on the floor are not solid (the clipping audit leaves them out).
    this.shadow.userData.noAudit = true;
    this.cast.userData.noAudit = true;
    this.buildCloth();
    this.measureRestArm();
    this.arms.forEach((arm, i) => (arm.rotation.z = (i === 0 ? -1 : 1) * this.restAbduct));
    this.root.scale.setScalar(scale);
    this.head.scale.setScalar(scale < CHILD_SCALE ? CHILD_HEAD : 1);
    CharacterView.batch?.register(this.root);
  }

  /** The look's swinging pieces, made again when the look changes (meshes reused where they can be). */
  private buildCloth(): void {
    const specs = clothPieces(this.look);
    while (this.cloth.length > specs.length) {
      const c = this.cloth.pop()!;
      c.pivot.removeFromParent();
    }
    specs.forEach((spec, i) => {
      let c = this.cloth[i];
      if (!c) {
        const pivot = new THREE.Object3D();
        const mesh = castsShadow(new THREE.Mesh(spec.geometry, MATERIALS.character));
        pivot.add(mesh);
        c = { spec, pivot, mesh, wx: 0, vx: 0, wz: 0, vz: 0, wy: 0, vy: 0, flare: 0, vf: 0, keepFlare: 1, keepSwing: 0 };
        this.cloth.push(c);
      }
      c.spec = spec;
      c.mesh.geometry = spec.geometry;
      c.pivot.position.set(...spec.at);
      (spec.kind === 'hair' ? this.head : this.body).add(c.pivot);
    });
    this.settleCloth();
  }

  /** Puts every piece at rest (a teleport, a pose change, a new look). */
  private settleCloth(): void {
    for (const c of this.cloth) {
      c.wx = c.vx = c.wz = c.vz = c.wy = c.vy = c.flare = c.vf = 0;
      c.keepFlare = 1;
      c.keepSwing = 0;
      c.pivot.rotation.set(0, 0, 0);
      c.pivot.scale.set(1, 1, 1);
    }
    this.lastPos.x = Number.NaN;
    this.velX = this.velZ = this.accX = this.accZ = 0;
    this.bodyVy = 0;
  }

  /**
   * The cloth's springs (session 62). Each piece's angle is simulated in the world's frame and shown relative to its
   * parent, so when the body leans, sways or twists the cloth lags behind and catches up; on top of that it trails as
   * the figure sets off (inertia) and with speed (air), swings out on a turn, bounces at each footfall, the coat's
   * halves and the apron are pushed by the legs, and a skirt drapes over the lap when its wearer sits.
   */
  private lastDt = 1 / 60;

  private stepCloth(dt: number, footfall: boolean, stepSide: boolean): void {
    this.lastDt = dt;
    if (!this.cloth.length) return;
    // The root's motion: velocity and acceleration in the world, turned into the figure's frame (z forward, x side).
    const p = this.root.position;
    if (Number.isNaN(this.lastPos.x) || dt <= 0) {
      this.lastPos.copy(p);
      this.lastYawSeen = this.yaw;
      this.lastBodyY = this.body.position.y;
    }
    const inv = 1 / Math.max(dt, 1e-3);
    let vx = (p.x - this.lastPos.x) * inv;
    let vz = (p.z - this.lastPos.z) * inv;
    // A jump (a teleport, a seat, a lift into bed) is not motion: start again from rest.
    if (vx * vx + vz * vz > 100) {
      vx = vz = 0;
      this.velX = this.velZ = 0;
    }
    const ax = (vx - this.velX) * inv;
    const az = (vz - this.velZ) * inv;
    this.accX += (ax - this.accX) * Math.min(1, dt * 14);
    this.accZ += (az - this.accZ) * Math.min(1, dt * 14);
    this.velX = vx;
    this.velZ = vz;
    this.lastPos.copy(p);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const fwdV = vx * sy + vz * cy;
    const fwdA = this.accX * sy + this.accZ * cy;
    const sideA = this.accX * cy - this.accZ * sy;
    let yawRate = this.yaw - this.lastYawSeen;
    yawRate = Math.atan2(Math.sin(yawRate), Math.cos(yawRate)) * inv;
    this.lastYawSeen = this.yaw;
    const by = this.body.position.y;
    this.bodyVy += ((by - this.lastBodyY) * inv - this.bodyVy) * Math.min(1, dt * 20);
    this.lastBodyY = by;
    const seated = this.pose === 'sit' || this.pose === 'lounge';
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / steps;
    for (const c of this.cloth) {
      const k = CLOTH_SPRING[c.spec.kind];
      const onHead = c.spec.kind === 'hair';
      // The parent's own angles (the body's lean, sway and twist; for hair, the head's on top).
      const px = this.body.rotation.x + (onHead ? this.head.rotation.x : 0);
      const pz = this.body.rotation.z;
      const pyaw = this.yaw + this.body.rotation.y + (onHead ? this.head.rotation.y : 0);
      // What the piece wants relative to its parent.
      const air = Math.min(0.32, Math.max(-0.1, fwdV * k.drag));
      let tx = air + fwdA * k.accel;
      let tz = -sideA * k.accel * 0.8 - yawRate * Math.max(0, fwdV) * 0.03;
      const l0 = this.legs[0].rotation.x;
      const l1 = this.legs[1].rotation.x;
      if (c.spec.kind === 'coat') {
        const leg = c.spec.side < 0 ? l0 : l1;
        tx += seated ? leg * 0.85 : leg * 0.9;
        tz += c.spec.side * Math.max(0, -leg) * 0.12;
      } else if (c.spec.kind === 'apron') {
        tx += Math.min(0, l0, l1) * (seated ? 0.9 : 0.7);
      } else if (c.spec.kind === 'skirt') {
        tx += seated ? -0.62 : Math.min(0, l0, l1) * 0.22;
        tz += (l0 - l1) * 0.05;
      } else if (onHead && this.pose === 'sleep') {
        tx = 0;
        tz = 0;
      }
      // Seated, a coat's tails lie forward over the lap (as far as the thighs go).
      const kmax = seated && c.spec.kind === 'coat' ? 1.45 : k.max;
      tx = Math.max(-kmax, Math.min(kmax, tx));
      tz = Math.max(onHead ? -0.18 : -SIDE_SWING, Math.min(onHead ? 0.18 : SIDE_SWING, tz));
      if (footfall && !seated) {
        // Each step: a little bounce back and a sway toward the foot that landed.
        c.vx += onHead ? 0.9 : 0.35;
        c.vz += (stepSide ? 1 : -1) * (onHead ? 0.5 : 0.7);
        c.vf += c.spec.kind === 'skirt' ? 0.45 : 0.2;
      }
      for (let i = 0; i < steps; i++) {
        c.vx += (k.k * (px + tx - c.wx) - k.c * c.vx) * h;
        c.wx += c.vx * h;
        c.vz += (k.k * (pz + tz - c.wz) - k.c * c.vz) * h;
        c.wz += c.vz * h;
        let dy = pyaw - c.wy;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        c.vy += (k.k * 0.8 * dy - k.c * c.vy) * h;
        c.wy += c.vy * h;
        c.vf += (-160 * c.flare - 9 * c.vf - this.bodyVy * 6) * h;
        c.flare += c.vf * h;
      }
      // Never more than the piece's reach from its parent (so a fast spin or a teleport cannot fling it).
      // Long hair swings out behind and a little to the sides, never forward into the back or the shoulders.
      // Hair never swings forward of hanging straight down behind the head, wherever the head tips (a yawn throws it
      // back toward the shoulders).
      const lx = Math.max(onHead ? -0.03 - Math.min(0, this.head.rotation.x) * 1.15 : -kmax, Math.min(kmax, c.wx - px));
      // A skirt or coat swings fore and aft freely but only a little to the sides (a hand or a bag hangs there).
      const side = onHead ? 0.18 : SIDE_SWING;
      const lz = Math.max(-side, Math.min(side, c.wz - pz));
      let ly = c.wy - pyaw;
      // A coat's tails lag a turn only a little (twisted further, a leg comes through its side).
      const twist = c.spec.kind === 'coat' ? 0.2 : 0.5;
      ly = Math.max(-twist, Math.min(twist, Math.atan2(Math.sin(ly), Math.cos(ly))));
      c.wx = px + lx;
      c.wz = pz + lz;
      c.wy = pyaw + ly;
      c.pivot.rotation.set(lx, onHead ? 0 : ly * 0.7, lz);
      const f = Math.max(-0.06, Math.min(0.1, c.flare));
      if (!onHead) {
        // Session 63: a leg never goes through it. A skirt flares (both legs are inside it); an apron or a coat's half
        // swings out of the leg's way (forward for a knee coming through, back for a heel); either eases back after.
        this.containLegs(c);
        const up = Math.min(1, dt * 40);
        const down = Math.min(1, dt * 6);
        c.keepFlare += (contain.scale - c.keepFlare) * (contain.scale > c.keepFlare ? 1 : down);
        // Exactly the swing that was found to keep the legs in (its own easing back was the first one tried).
        c.keepSwing = contain.swing;
        void up;
        c.pivot.rotation.x += c.keepSwing;
        c.pivot.scale.set(Math.max(1 + f, c.keepFlare), 1 - f * 0.4, Math.max(1 + f, c.keepFlare));
      }
    }
  }

  /** Leg surface points (body space), refreshed each frame for `containLegs`. */
  private readonly legSamples: { p: THREE.Vector3; r: number }[] = [];

  private sampleLegs(): void {
    const out = this.legSamples;
    let n = 0;
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      leg.updateMatrix();
      this.knees[i].updateMatrix();
      for (const [mesh, m] of [[this.thighMeshes[i], cm.copy(leg.matrix)], [this.shinMeshes[i], null]] as [THREE.Mesh, THREE.Matrix4 | null][]) {
        const mat = m ?? cm.copy(leg.matrix).multiply(this.knees[i].matrix);
        const pts = surfacePoints(mesh.geometry);
        for (let k = 0; k < pts.length; k += 3) {
          if (!out[n]) out[n] = { p: new THREE.Vector3(), r: 0 };
          out[n].p.set(pts[k], pts[k + 1], pts[k + 2]).applyMatrix4(mat);
          out[n].r = 0;
          n++;
        }
      }
    }
    out.length = n;
  }

  /**
   * What a skirt, coat half or apron must do this frame to keep both legs inside it (`contain`): flare (a scale of its
   * spread; a skirt, closed all round) or swing (radians about its pivot's x: an apron or a coat half, open pieces).
   */
  private containLegs(c: Cloth): void {
    contain.scale = 1;
    // Its last push eases off (the legs at rest are inside it wherever it settles from there).
    contain.swing = c.keepSwing * (1 - Math.min(1, this.lastDt * 6));
    if (c.spec.kind === 'hair' || this.pose === 'sleep') return;
    // Standing still (legs at rest, no take or hand-over) nothing moves the legs through it, so nothing is measured.
    if (this.pose === 'stand' && this.swingNow < 0.02 && this.kneeNow[0] < 0.12 && this.kneeNow[1] < 0.12) return;
    if (c === this.cloth.find((x) => x.spec.kind !== 'hair')) this.sampleLegs();
    const shape = clothShape(c.mesh.geometry);
    // Each candidate swing (nearest to how the spring hangs it first): the flare it would still need; the first that
    // needs none is taken, otherwise the one needing least, flared by the rest.
    const rx = c.pivot.rotation.x;
    let bestSwing = 0;
    let bestNeed = Infinity;
    // First where it is heading anyway (its last push easing off), so it settles smoothly whenever that fits.
    SWING_TRIES[0] = c.keepSwing * (1 - Math.min(1, this.lastDt * 6));
    for (const sw of SWING_TRIES) {
      cq.setFromEuler(hE.set(rx + sw, c.pivot.rotation.y, c.pivot.rotation.z)).invert();
      let need = 1;
      for (const s of this.legSamples) {
        cv.copy(s.p).sub(c.pivot.position).applyQuaternion(cq);
        if (cv.y > -0.02) continue;
        const reach = shape.at(cv.y, cv.x, cv.z);
        if (reach <= 0) continue;
        const out = Math.hypot(cv.x, cv.z) + s.r + LEG_ROOM;
        if (out > reach * need) need = out / reach;
        if (need >= bestNeed) break;
      }
      if (need < bestNeed) {
        bestNeed = need;
        bestSwing = sw;
      }
      if (need <= 1) break;
    }
    contain.swing = bestSwing;
    contain.scale = Math.min(MAX_FLARE, bestNeed);
  }

  /** Changes outfit in place (geometry is cached per look, so this is cheap after the first time). */
  setLook(look: CharacterLook): void {
    this.look = look;
    this.lookStamp++;
    this.bodyMesh.geometry = bodyGeometry(look);
    this.headMesh.geometry = headGeometry(look);
    const build = figureOf(look).build;
    this.thighMeshes.forEach((m, i) => (m.geometry = thighGeometryFor(look, i === 0 ? -1 : 1)));
    this.shinMeshes.forEach((m, i) => (m.geometry = shinGeometryFor(look, i === 0 ? -1 : 1)));
    this.upperMeshes.forEach((m, i) => (m.geometry = upperArmGeometryFor(look, i === 0 ? -1 : 1)));
    this.legs.forEach((p, i) => (p.position.x = (i === 0 ? -1 : 1) * hipX(build)));
    this.arms.forEach((p, i) => (p.position.x = (i === 0 ? -1 : 1) * shoulderX(build)));
    this.foreMeshes.forEach((m, i) => (m.geometry = forearmGeometryFor(look, i === 0 ? -1 : 1)));
    this.buildCloth();
    this.measureRestArm();
  }

  /** Leg pivots (for footwear attachments) and the body group (for chest and shoulder gear). */
  get legPivots(): readonly THREE.Object3D[] {
    return this.legs;
  }

  /** The knees (footwear rides on the shin: its sole is `LEG_LENGTH + KNEE_Y` below the knee). */
  get kneePivots(): readonly THREE.Object3D[] {
    return this.knees;
  }

  private lastStrideSide = true;
  private footfall = false;

  /** True once each time a foot has landed in the walk cycle since the last call (footstep sounds follow it). */
  takeFootfall(): boolean {
    const f = this.footfall;
    this.footfall = false;
    return f;
  }

  /**
   * Riding a scooter (session 36, owner: "the player just stands on top of it"): the front foot on the deck, the
   * back foot kicking off the floor in a rhythm while moving, hands on the handlebar, a lean into the ride.
   */
  riding = false;
  /** How high the deck stands off the floor while riding. */
  rideLift = 0;
  private kick = 0;
  /** Right arm up, waving (onlookers by the line, the station master's flag). */
  waving = false;
  private waveTime = Math.random() * 10;

  /** Puts something in the right hand (a flag, a balloon); it follows the arm, waving included. */
  holdInRightHand(object: THREE.Object3D): void {
    object.position.y += HAND_Y - ELBOW_Y;
    this.elbows[1].add(object);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setFacing(angle: number): void {
    // The whole rotation, never one angle of it: an Euler read back from a quaternion (render interpolation puts poses
    // back that way) may hold a turn as (π, π − y, π), and writing y alone into that turns the figure upside down.
    // The clay toys turn with an ease (CHARACTER_SPEC §8): the figure is asked to face `angle` and swings round to it in
    // `update` (visual only: nothing in play reads the figure's yaw).
    this.yawTarget = angle;
    this.root.rotation.set(this.tilt(), this.yaw, 0);
  }

  /** Faces `angle` at once (a figure placed, not walking: pooled guests, poses). */
  snapFacing(angle: number): void {
    this.yawTarget = angle;
    this.yaw = angle;
    this.root.rotation.set(this.tilt(), angle, 0);
  }

  /**
   * What the figure is carrying, which sets the arms (character pass 2): a stack held out in front on bent arms (the
   * forearms under it), a surfboard tucked under the left arm, a box on the right shoulder steadied by the right hand.
   */
  setCarrying(carrying: boolean, board = false, box = false): void {
    this.carrying = carrying;
    this.carryBoard = board;
    this.carryBox = box;
  }

  /** Session 63: what the figure carries now (CarryStack tells it on every change). */
  setLoad(load: CarryLoad): void {
    if (this.load.front.length > 0 && load.front.length === 0) {
      this.ghost = this.load.front.slice();
      this.ghostKind = this.load.frontKind;
    }
    this.load = load;
  }

  /** Whether a hand is free to carry a bag (the surfboard takes the left arm, the box on the shoulder the right). */
  handFree(i: number): boolean {
    return !(i === 0 && this.carryBoard) && !(i === 1 && this.carryBox);
  }

  /**
   * The take (or the hand-over) of one thing: `kind` the item, `hand` the hand a bag goes into or comes from (null for
   * the stack in front). Each kind has its own move (`MOTION_SECONDS`, `motionPose`).
   */
  startMotion(kind: ItemKind | 'box', place: boolean, hand: number | null): void {
    const m: Motion = hand !== null ? 'bag' : kind === 'surfboard' ? 'board' : kind === 'box' || kind === 'crate' ? 'crate' : kind === 'luggage' ? 'luggage' : ON_TRAY.has(kind) ? 'tray' : 'linen';
    this.motion = m;
    this.motionHand = hand ?? 1;
    this.motionPlace = place;
    this.motionLength = MOTION_SECONDS[m][place ? 'place' : 'pickup'];
    this.motionArmed = true;
    this.act(place ? 'place' : 'pickup');
  }

  /** The take or hand-over move's body, knees and head, and how far it reaches (the hold follows the reach). */
  private motionPose(t: number): boolean {
    const m = this.motion;
    this.reachDy = this.reachDz = this.bagDy = this.bagDz = this.bagDx = 0;
    if (m === 'none') return false;
    const p = Math.min(1, t / this.motionLength);
    const place = this.motionPlace;
    const still = this.swingNow < 0.2 ? 1 : 0.5;
    let knee = 0;
    let thigh = 0;
    let dip = 0;
    let tilt = 0;
    let nod = 0;
    let lean = 0;
    switch (m) {
      case 'tray': {
        // Taking: the tray offered forward and a touch lower to meet the cup; serving: carried out and up to them
        // with a small bow, then back in to the chest.
        const k = envelope(p, place ? 0.5 : 0.42);
        this.reachDz = (place ? 0.09 : 0.06) * k;
        this.reachDy = (place ? 0.025 : -0.03) * k;
        tilt = (place ? 0.11 : 0.06) * k;
        nod = (place ? 0.14 : 0.2) * k;
        knee = 0.14 * k;
        break;
      }
      case 'linen': {
        // Reaching out for the folded pile, then hugging it in (a little squeeze at the end); handing it over, held out
        // and a touch lower.
        const k = envelope(p, place ? 0.5 : 0.38);
        const hug = place ? 0 : envelope(p, 0.82) * 0.4;
        this.reachDz = (place ? 0.08 : 0.07) * k - 0.012 * hug;
        this.reachDy = (place ? -0.03 : 0.04) * k;
        tilt = (place ? 0.14 : 0.1) * k;
        nod = 0.2 * k;
        knee = 0.2 * k;
        break;
      }
      case 'luggage':
      case 'crate': {
        // A weight from low down: a real squat (knees and hips), the back tipping forward, the load brought up close;
        // set down the same way. A crate goes lower and slower than a bag.
        const heavy = m === 'crate' ? 1 : 0.65;
        const k = envelope(p, place ? 0.55 : 0.42);
        this.reachDy = -0.17 * heavy * k;
        this.reachDz = 0.03 * k;
        knee = 0.95 * heavy * k;
        thigh = 0.5 * heavy * k;
        dip = 0.1 * heavy * k;
        tilt = 0.3 * heavy * k;
        nod = 0.3 * k;
        break;
      }
      case 'bag': {
        // One bag by its handle: a bend at the knees toward its side, the hand reaching down and out for the handle,
        // then up straight with it hanging; set down, the hand swings it forward and down.
        const k = envelope(p, place ? 0.5 : 0.4);
        this.bagDy = -0.19 * k;
        this.bagDz = (place ? 0.14 : 0.09) * k;
        this.bagDx = 0.035 * k;
        knee = 0.62 * k;
        thigh = 0.32 * k;
        dip = 0.065 * k;
        tilt = 0.2 * k;
        nod = 0.22 * k;
        lean = (this.motionHand === 0 ? 1 : -1) * 0.12 * k;
        break;
      }
      case 'board': {
        const k = envelope(p, 0.45);
        knee = 0.25 * k;
        dip = 0.025 * k;
        nod = 0.15 * k;
        break;
      }
    }
    this.kneeAim[0] = Math.max(this.kneeAim[0], knee * still);
    this.kneeAim[1] = Math.max(this.kneeAim[1], knee * still);
    this.legs[0].rotation.x -= thigh * still;
    this.legs[1].rotation.x -= thigh * still;
    this.body.position.y -= dip * still;
    this.body.rotation.x += tilt;
    this.body.rotation.z += lean;
    this.headPitch = Math.max(this.headPitch, nod);
    return true;
  }

  /** How far forward and how wide the figure is at each height (from its own meshes; again when they change). */
  private ensureClearance(): void {
    let key = this.lookStamp * 7919 + (this.cloth.length + 1) * 31;
    this.body.children.forEach((c, i) => {
      if (c.visible && (c as THREE.Mesh).isMesh && !c.userData.carried && !c.userData.prop) key += (i + 1) * 131;
    });
    if (key === this.clearKey) return;
    this.clearKey = key;
    const rest = this.clearRest.clear();
    const peek = this.clearPeek.clear();
    const add = (g: THREE.BufferGeometry, m: THREE.Matrix4, front = true): void => {
      rest.add(g, m, front);
      peek.add(g, m, front);
    };
    for (const c of this.body.children) {
      if (!(c as THREE.Mesh).isMesh || !c.visible || c.userData.carried || c.userData.prop) continue;
      c.updateMatrix();
      add((c as THREE.Mesh).geometry, c.matrix);
    }
    // The head turns and nods: everywhere it can be while carrying (and, peeking, turned round the stack).
    const hs = this.head.scale.x;
    const headAt = (yaw: number, pitch: number, into: Clearance): void => {
      hM.compose(hv.set(0, NECK_Y, 0), hq.setFromEuler(hE.set(pitch, yaw, 0)), hv2.setScalar(hs));
      into.add(this.headMesh.geometry, hM, true, true);
    };
    for (const yaw of [-0.34, 0, 0.34]) for (const pitch of [-0.24, 0, 0.32]) headAt(yaw, pitch, rest);
    for (const yaw of [PEEK_YAW - 0.08, PEEK_YAW + 0.08]) for (const pitch of [-0.12, 0.14]) headAt(yaw, pitch, peek);
    // The legs and what hangs at the waist, standing (for a bag beside them; the stack in front is far above them).
    for (let i = 0; i < 2; i++) {
      hM.makeTranslation(this.legs[i].position.x, this.legs[i].position.y, this.legs[i].position.z);
      add(this.thighMeshes[i].geometry, hM, false);
      hM.makeTranslation(this.legs[i].position.x, this.legs[i].position.y + KNEE_Y, this.legs[i].position.z);
      add(this.shinMeshes[i].geometry, hM, false);
    }
    for (const c of this.cloth) {
      hM.makeTranslation(c.pivot.position.x, c.pivot.position.y, c.pivot.position.z);
      // Hair hangs from the head (its pivot is in head space): it only matters for the width beside the shoulders.
      if (c.spec.kind === 'hair') hM.premultiply(new THREE.Matrix4().makeTranslation(0, NECK_Y, 0));
      add(c.mesh.geometry, hM, c.spec.kind !== 'hair');
    }
  }

  /**
   * Session 63: the hands on what is carried. Solves each arm that holds something (IK onto its grip), blends it with
   * the walk's own swing as a hold begins or ends, and places the stack and the bags so they meet the hands.
   */
  private applyHold(dt: number): void {
    const L = this.load;
    const placing = this.action === 'place' && this.actionTime > 0;
    // Handing over the last of a stack, the hands finish the move as if it were still there (not while bags hang from them).
    const front = L.front.length > 0 ? L.front : placing && this.motion !== 'bag' && this.ghost.length > 0 && !L.hands[0] && !L.hands[1] ? this.ghost : null;
    const kind = L.front.length > 0 ? L.frontKind : this.ghostKind;
    const anyBag = !!(L.hands[0] || L.hands[1]) || (placing && this.motion === 'bag');
    const want = [false, false];
    hPalm[0] = hPalm[1] = null;
    if (front || anyBag || this.carryBox) this.ensureClearance();
    for (let i = 0; i < 2; i++) this.chains[i].shoulder.copy(this.arms[i].position);

    let peekTarget = 0;
    if (front) {
      let top = 0;
      for (const it of front) top += it.h;
      const peeking = HOLD_Y + top > PEEK_Y;
      const clear = peeking ? this.clearPeek : this.clearRest;
      peekTarget = peeking ? PEEK_YAW : 0;
      const kindY = kind === 'tray' ? 0.03 : kind === 'crate' ? -0.03 : 0;
      let baseY = HOLD_Y + kindY + this.reachDy;
      const hands = [0, 1].filter((i) => this.handFree(i));
      let z0 = 0;
      let gx = 0;
      let gz = 0;
      // Lift the stack closer to the shoulders until the hands reach it (a deep stack, or one stepped out round a face).
      for (let lift = 0; lift <= 0.12; lift += 0.02) {
        z0 = layoutStack(front, baseY + lift, clear, STACK_GAP, this.stackZ);
        const b = front[0];
        gz = z0 - b.d / 2 + Math.min(GRIP_IN, b.d * 0.4);
        // One hand free (the other on a box or a board): it holds the stack from under its own side.
        gx = hands.length === 2 ? Math.min(GRIP_SPREAD, b.w / 2 - 0.03) : Math.min(0.1, b.w / 2 - 0.02);
        const sx = shoulderX(figureOf(this.look).build);
        const reach = Math.hypot(sx - gx, SHOULDER_Y - (baseY + lift - PALM_UNDER), gz);
        if (reach <= REACH || lift >= 0.12) {
          baseY += lift;
          break;
        }
      }
      this.stackBaseZ = z0 + this.reachDz;
      const shift = hands.length === 1 ? (hands[0] === 0 ? -1 : 1) * 0.03 : 0;
      this.stackAnchor.position.set(shift, baseY, this.stackBaseZ);
      for (let i = 0; i < this.stackZ.length; i++) this.stackZ[i] -= z0;
      for (const i of hands) {
        const side = i === 0 ? -1 : 1;
        hTargets[i].set(side * gx + shift, baseY - PALM_UNDER - (hands.length === 1 ? 0.03 : 0), gz + this.reachDz);
        hPole[i] = POLE_FRONT[i];
        hPalm[i] = UP;
        want[i] = true;
      }
    }
    for (let i = 0; i < 2; i++) {
      const bag = L.hands[i] ?? (placing && this.motion === 'bag' && this.motionHand === i ? { w: 0.19, d: 0.19, h: 0.18 } : null);
      if (!bag || want[i]) continue;
      const side = i === 0 ? -1 : 1;
      const mine = this.motionHand === i ? 1 : 0;
      const gy = BAG_GRIP_Y + this.bagDy * mine;
      // Clear of the legs and anything at the waist beside the bag's whole height (it hangs below the hand).
      const swinging = this.cloth.some((c) => c.spec.kind !== 'hair') ? 0.06 : 0;
      const x = Math.max(BAG_MIN_X, this.clearRest.widest(gy - bag.h - 0.02, gy) + bag.w / 2 + BAG_GAP + swinging) + this.bagDx * mine;
      // The hand swings a little against the leg on its side as they walk.
      const swing = (i === 0 ? -this.walkS : this.walkS) * this.swingNow * 0.12;
      hTargets[i].set(side * x, gy, 0.02 + swing + this.bagDz * mine);
      hPole[i] = POLE_BAG[i];
      hPalm[i] = IN[i];
      want[i] = true;
    }
    if (this.gestureHand >= 0 && !want[this.gestureHand]) {
      const i = this.gestureHand;
      hTargets[i].copy(this.gestureTarget);
      hPole[i] = this.gesturePole;
      hPalm[i] = this.gesturePalm;
      want[i] = true;
    }
    if (this.carryBox && !want[1]) {
      hTargets[1].copy(BOX_HAND);
      hPole[1] = POLE_BOX;
      hPalm[1] = BACK;
      want[1] = true;
    }

    // The head peeks round a tall stack.
    if (peekTarget !== 0 || this.peekNow !== 0) {
      this.peekNow += (peekTarget - this.peekNow) * Math.min(1, dt * 7);
      if (Math.abs(this.peekNow) < 1e-3 && peekTarget === 0) this.peekNow = 0;
      this.head.rotation.y = this.peekNow + (this.head.rotation.y - this.peekNow) * (1 - Math.min(1, Math.abs(this.peekNow) / PEEK_YAW));
    }
    if (front || anyBag) {
      // Held: the head keeps to where the clearance was measured.
      this.head.rotation.x = Math.max(-0.22, Math.min(0.3, this.head.rotation.x));
      if (this.peekNow === 0) this.head.rotation.y = Math.max(-0.32, Math.min(0.32, this.head.rotation.y));
    }

    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const elbow = this.elbows[i];
      const target = want[i] ? 1 : 0;
      this.ikWeight[i] += (target - this.ikWeight[i]) * Math.min(1, dt * (target ? 14 : this.lastGesture === i ? 24 : 9));
      // A gesture's own timing (the cup lifted and lowered) sets how far the hand is on its point.
      if (i === this.gestureHand && want[i]) this.ikWeight[i] = Math.min(this.ikWeight[i], this.gestureBlend);
      if (i === this.gestureHand) this.lastGesture = i;
      else if (this.lastGesture === i && this.ikWeight[i] === 0) this.lastGesture = -1;
      if (!want[i] && this.ikWeight[i] < 0.002) this.ikWeight[i] = 0;
      const w = this.ikWeight[i];
      if (w <= 0) {
        // No hold: the forearm's roll and the arm's twist come back to rest.
        arm.rotation.y += (0 - arm.rotation.y) * Math.min(1, dt * 12);
        elbow.rotation.y += (0 - elbow.rotation.y) * Math.min(1, dt * 12);
        continue;
      }
      const chain = this.chains[i];
      let sol = solveArm(chain, hTargets[i], hPole[i], this.ikSolved[i]);
      // The arm itself must not pass through the body on its way to the grip (reaching under a narrow pile, or round a
      // stack held close): swing the elbow wider, then, if it still would, bring the hand a little out to its side.
      const build = figureOf(this.look).build ?? 'regular';
      for (let tries = 0; tries < 8 && this.armHitsTorso(chain, sol, build); tries++) {
        if (tries < 4) {
          hv.copy(hPole[i]);
          hv.x += chain.side * 0.6 * (tries + 1);
          hv.y -= 0.15 * (tries + 1);
          sol = solveArm(chain, hTargets[i], hv.normalize(), this.ikSolved[i]);
        } else {
          hTargets[i].x += chain.side * 0.025;
          sol = solveArm(chain, hTargets[i], hv, this.ikSolved[i]);
        }
      }
      // The forearm rolls so the palm faces where it should (up under a tray, in round a handle, back against a box).
      let twist = 0;
      const palm = hPalm[i];
      if (palm) {
        const sd = chain.side;
        hq.setFromEuler(hE.set(sol.bend, 0, 0, 'XYZ')).premultiply(sol.shoulder);
        const ad = hv.set(1, 0, 0).applyQuaternion(hq).dot(palm);
        const cd = hv2.set(0, 0, 1).applyQuaternion(hq).dot(palm);
        twist = Math.max(-2, Math.min(2, Math.atan2(sd * cd, -sd * ad)));
      }
      if (w >= 0.999) {
        arm.quaternion.copy(sol.shoulder);
        elbow.rotation.set(sol.bend, twist, 0);
      } else {
        arm.quaternion.slerp(sol.shoulder, w);
        elbow.rotation.set(elbow.rotation.x + (sol.bend - elbow.rotation.x) * w, twist * w, 0);
      }
      this.elbowNow[i] = elbow.rotation.x;
      // The bag hangs from the hand: its anchor on the grip, swinging a little behind the hand's motion.
      const a = this.handAnchors[i];
      gripOf(chain, arm.quaternion, elbow.rotation.x, elbow.rotation.y, GRIP_V, a.position);
      const vz = (a.position.z - this.lastHandZ[i]) / Math.max(dt, 1e-3);
      this.lastHandZ[i] = a.position.z;
      const aim = Math.max(-0.35, Math.min(0.35, vz * 0.35 - this.body.rotation.x));
      this.bagRate[i] += ((aim - this.bagSwing[i]) * 60 - this.bagRate[i] * 7) * Math.min(dt, 0.05);
      this.bagSwing[i] += this.bagRate[i] * Math.min(dt, 0.05);
      a.rotation.set(this.bagSwing[i], 0, 0);
    }
  }
  private peekNow = 0;

  /** How much further out the hands must hang while a skirt or coat flares (radians). */
  private clothSpread(): number {
    let f = 0;
    for (const c of this.cloth) if (c.spec.kind !== 'hair') f = Math.max(f, c.pivot.scale.x - 1);
    return f * 1.1;
  }
  /** A gesture's hand on a point (the cup at the lips, the phone at the ear): which hand, how far there, where. */
  private gestureHand = -1;
  private lastGesture = -1;
  private gestureBlend = 0;
  private readonly gestureTarget = new THREE.Vector3();
  private gesturePole = SIP_POLE;
  private gesturePalm = IN[1];

  /** Whether a hand holds something that is part of the figure (a briefcase, a handbag, a surfboard). */
  private heldIn(i: number): boolean {
    const a = this.look.accessory;
    return i === 1 ? a === 'briefcase' || a === 'surfboard' : a === 'handbag';
  }

  private gestureAt(i: number, blend: number, x: number, y: number, z: number, pole: THREE.Vector3, palm: THREE.Vector3): void {
    // The free hand does it when this one holds something.
    if (this.heldIn(i) && !this.heldIn(1 - i)) {
      i = 1 - i;
      pole = new THREE.Vector3(-pole.x, pole.y, pole.z);
      palm = IN[i];
    }
    this.gestureHand = i;
    this.gestureBlend = blend;
    const t = this.gestureTarget.set((i === 0 ? -1 : 1) * x, y, z);
    // Short clay arms: within reach of the shoulder (a cup comes up to the chin and the head bows to it), and never
    // inside the face on the way (lower until it is clear of it).
    const sh = this.arms[i].position;
    hv.subVectors(t, sh);
    if (hv.length() > REACH) t.copy(sh).addScaledVector(hv.normalize(), REACH);
    for (let k = 0; k < 8 && Math.abs(t.x) < this.clearRest.widest(t.y - 0.03, t.y + 0.03) && t.z < this.clearRest.between(t.y - 0.03, t.y + 0.03) + 0.05; k++) t.y -= 0.025;
    this.gesturePole = pole;
    this.gesturePalm = palm;
  }

  /** How much of the usual stride (walking, running) and of the running back-kick long clothes allow. */
  private strideScale(): { walk: number; run: number; kick: number } {
    const o = figureOf(this.look).outfit;
    if (o === 'gown') return GOWN_STRIDE;
    if (o === 'dress') return DRESS_STRIDE;
    if (this.cloth.some((c) => c.spec.kind === 'coat')) return COAT_STRIDE;
    if (this.cloth.some((c) => c.spec.kind === 'apron')) return APRON_STRIDE;
    return FREE_STRIDE;
  }

  /** Whether an arm pose passes through the torso (its lathe, by build), below the shoulder ball. */
  private armHitsTorso(chain: ArmChain, sol: ArmSolution, build: Build): boolean {
    const e = hv2.set(0, -chain.upper, 0).applyQuaternion(sol.shoulder).add(chain.shoulder);
    const ex = e.x;
    const ey = e.y;
    const ez = e.z;
    gripOf(chain, sol.shoulder, sol.bend, 0, GRIP_V, armTip);
    const clear = this.clearKey >= 0 ? this.clearRest : null;
    const check = (x: number, y: number, z: number, r: number): boolean => {
      if (torsoRadius(build, y) + r + ARM_ROOM > Math.hypot(x, z / TORSO_DEPTH)) return true;
      // The head (and its hair and hat), from the figure's own measured outline at that height.
      if (clear && y > NECK_Y - 0.05) {
        const wide = clear.widest(y - 0.02, y + 0.02);
        const front = clear.between(y - 0.02, y + 0.02);
        if (wide > 0 && Math.abs(x) - r < wide - 0.01 && z - r < front && z + r > -wide) return true;
      }
      return false;
    };
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      // The upper arm below the shoulder ball (its top two thirds sit at the shoulder by design).
      if (t > 0.55 && check(chain.shoulder.x + (ex - chain.shoulder.x) * t, chain.shoulder.y + (ey - chain.shoulder.y) * t, chain.shoulder.z + (ez - chain.shoulder.z) * t, this.upperR)) return true;
      if (check(ex + (armTip.x - ex) * t, ey + (armTip.y - ey) * t, ez + (armTip.z - ez) * t, t > 0.8 ? 0.045 : 0.054)) return true;
    }
    return false;
  }
  /**
   * Session 63 ("zero clip ins"): how far out each arm hangs at rest (radians from straight down), measured for this
   * figure from what it wears: just clear of its torso, belt, sash, apron, skirt or coat tails and hips, so a hanging
   * hand never sinks into its clothes (it was 0.12 for everyone: a dress's bell or a coat's tails took the hand).
   */
  private restAbduct = 0.14;
  /** The sleeve's radius below the shoulder ball (measured: a puffed short sleeve is thicker). */
  private upperR = 0.058;

  private measureRestArm(): void {
    const c = new Clearance();
    this.bodyMesh.updateMatrix();
    c.add(this.bodyMesh.geometry, this.bodyMesh.matrix, false);
    for (let i = 0; i < 2; i++) {
      hM.makeTranslation(this.legs[i].position.x, this.legs[i].position.y, 0);
      c.add(this.thighMeshes[i].geometry, hM, false);
    }
    for (const cl of this.cloth) {
      if (cl.spec.kind === 'hair') continue;
      hM.makeTranslation(cl.pivot.position.x, cl.pivot.position.y, cl.pivot.position.z);
      c.add(cl.mesh.geometry, hM, false);
    }
    const sx = this.arms[1].position.x;
    const swinging = this.cloth.some((cl) => cl.spec.kind !== 'hair');
    // How thick the sleeve is below the shoulder ball (a puffed short sleeve and its roll are thicker than a long one).
    let upperR = 0.058;
    const up = this.upperMeshes[1].geometry.getAttribute('position');
    for (let i = 0; i < up.count; i++) if (up.getY(i) < -0.07) upperR = Math.max(upperR, Math.hypot(up.getX(i), up.getZ(i)));
    this.upperR = upperR;
    // The arm down from the shoulder: the sleeve, the forearm, then the mitten (its thumb toward the body).
    const parts: [number, number, number][] = [[0.11, 0.165, upperR], [0.165, 0.23, 0.054], [0.23, 0.335, 0.061]];
    for (let a = 0.08; a <= 0.6; a += 0.01) {
      let ok = true;
      for (const [l0, l1, r] of parts) {
        for (let l = l0; l <= l1 && ok; l += 0.01) {
          const x = sx + l * Math.sin(a) - r;
          const y = SHOULDER_Y - l * Math.cos(a);
          if (x < c.widest(y - r, y + r) + (swinging ? 0.025 : 0.012)) ok = false;
        }
      }
      if (ok) {
        this.restAbduct = a;
        return;
      }
    }
    this.restAbduct = 0.6;
  }

  private carryBoard = false;
  private carryBox = false;
  /** How many things are on the stack (a tall one makes the figure lean back to balance it). */
  stackCount = 0;
  /** Eased joint targets (knees and elbows), so every pose change is quick but never a snap. */
  private readonly kneeNow = [0, 0];
  private readonly elbowNow = [-0.12, -0.12];
  private readonly kneeAim = [0, 0];
  private readonly elbowAim = [-0.12, -0.12];
  private headYaw = 0;
  private headPitch = 0;

  /**
   * Do something for a moment (`seconds`), or keep doing it by calling every frame: the cleaner sweeps
   * while they clean, the porter stamps while checking in. Props appear only while the action runs.
   */
  act(action: CharacterAction, seconds = 0.25): void {
    const same = action === this.action;
    if ((action === 'pickup' || action === 'place') && !this.motionArmed) {
      // Called directly (not through `startMotion`): the plain dip.
      this.motion = 'none';
      this.motionLength = MOTION_SECONDS.none[action];
    }
    this.motionArmed = false;
    if (SNAP_ACTIONS.has(action)) {
      // A snap move starts over each time (a dip per item), unless it has only just begun.
      const length = action === 'pickup' || action === 'place' ? this.motionLength : SNAP_SECONDS[action] ?? seconds;
      if (!same || this.actionClock > length * 0.45) this.actionClock = 0;
      this.action = action;
      this.actionTime = length - this.actionClock;
      return;
    }
    // A snap move in progress finishes before an ordinary action takes the arms.
    if (SNAP_ACTIONS.has(this.action) && this.actionTime > 0) return;
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
    mesh.userData.prop = true;
    this.body.add(mesh);
    this.props.set(kind, mesh);
  }

  /** The tea cup and the phone ride in the right hand (they follow the arm up to the mouth or the ear). */
  private showInHand(kind: PropKind | null): void {
    // In the free hand (the other one may hold a briefcase or a handbag of its own).
    const hand = this.heldIn(1) && !this.heldIn(0) ? 0 : 1;
    for (const mesh of this.inHand.values()) if (mesh.parent !== this.elbows[hand]) this.elbows[hand].add(mesh);
    if (kind && !this.inHand.has(kind)) {
      const mesh = new THREE.Mesh(propGeometry(kind), MATERIALS.character);
      mesh.userData.shared = true;
      mesh.position.set(0, HAND_Y - ELBOW_Y + (kind === 'phone' ? -0.03 : kind === 'ticket' ? -0.08 : -0.03), kind === 'phone' ? 0.03 : 0.06);
      this.elbows[hand].add(mesh);
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
    this.gestureHand = -1;
    if (a !== 'pickup' && a !== 'place') this.reachDy = this.reachDz = this.bagDy = this.bagDz = this.bagDx = 0;
    if (a === 'none') return;
    const t = this.actionClock;
    const ease = Math.min(1, dt * 16);
    const aim = (i: number, x: number, z: number, elbow = -0.35): void => {
      // Session 63 ("zero clip ins"): an arm never swings in toward the body further than the figure's own clearance
      // (its torso, skirt, coat or apron): a hand on the hip, hands behind the back or pumping fists used to go into it.
      const side = i === 0 ? -1 : 1;
      if (x > -1.6 && z * side < this.restAbduct + this.clothSpread()) z = side * (this.restAbduct + this.clothSpread());
      // A hand holding something of its own (a briefcase, a handbag, a surfboard) stays low: lifted, it would swing it
      // up over the head.
      if (this.heldIn(i)) {
        x = Math.max(x, -0.45);
        elbow = Math.max(elbow, -0.5);
      }
      this.arms[i].rotation.x += (x - this.arms[i].rotation.x) * ease;
      this.arms[i].rotation.z += (z - this.arms[i].rotation.z) * ease;
      this.elbowAim[i] = elbow;
    };
    switch (a) {
      case 'pickup': {
        // Session 63: each kind of thing has its own take (`motionPose`); the plain dip is for anyone holding nothing.
        if (this.motionPose(t)) break;
        // A quick dip to take something: knees bend, the body tips forward, both hands reach down and in, then up again.
        const k = Math.sin(Math.min(1, t / (SNAP_SECONDS.pickup ?? 0.34)) * Math.PI);
        const still = this.swingNow < 0.2 ? 1 : 0.45;
        aim(0, -0.75 * k, 0.12, -0.55 * k - 0.1);
        aim(1, -0.75 * k, -0.12, -0.55 * k - 0.1);
        this.kneeAim[0] = Math.max(this.kneeAim[0], 0.75 * k * still);
        this.kneeAim[1] = Math.max(this.kneeAim[1], 0.75 * k * still);
        this.legs[0].rotation.x -= 0.38 * k * still;
        this.legs[1].rotation.x -= 0.38 * k * still;
        this.body.position.y -= 0.075 * k * still;
        this.body.rotation.x += 0.32 * k;
        this.headPitch = 0.22 * k;
        break;
      }
      case 'place': {
        if (this.motionPose(t)) break;
        // Handing over or setting down: a step of the body forward and both hands out, palms up, then back.
        const k = Math.sin(Math.min(1, t / (SNAP_SECONDS.place ?? 0.32)) * Math.PI);
        aim(0, -1.25 * k, 0.15 * k, -0.25 - 0.2 * (1 - k));
        aim(1, -1.25 * k, -0.15 * k, -0.25 - 0.2 * (1 - k));
        this.body.rotation.x += 0.16 * k;
        this.body.position.y -= 0.02 * k;
        this.headPitch = 0.12 * k;
        break;
      }
      case 'cheer': {
        // A little celebration: arms flung up and a hop or two.
        const d = SNAP_SECONDS.cheer ?? 0.95;
        const up = Math.min(1, t / 0.12) * Math.min(1, (d - t) / 0.18 + 0.2);
        aim(0, -2.6 * up, -ARMS_UP_OUT * up, -0.25);
        aim(1, -2.6 * up, ARMS_UP_OUT * up, -0.25);
        const hop = Math.max(0, Math.sin(t * 13)) * Math.max(0, 1 - t / d);
        this.body.position.y += hop * 0.07;
        this.kneeAim[0] = Math.max(this.kneeAim[0], (1 - hop) * 0.25 * up);
        this.kneeAim[1] = Math.max(this.kneeAim[1], (1 - hop) * 0.25 * up);
        this.headPitch = -0.18 * up;
        break;
      }
      case 'work': {
        // Busy hands at a counter (making a drink, writing a ticket): both forearms forward at waist height, working.
        const w1 = Math.sin(t * 9);
        aim(0, -0.55 + w1 * 0.08, 0.12, -1.05 - w1 * 0.12);
        aim(1, -0.55 - w1 * 0.08, -0.12, -1.05 + w1 * 0.12);
        this.body.rotation.x += 0.08;
        this.headPitch = 0.2;
        break;
      }
      case 'sweep':
        // Both hands on the broom, a side-to-side sweep from the hips.
        aim(0, -0.55, 0.45, -0.55);
        aim(1, -0.45, -0.35, -0.6);
        this.kneeAim[0] = 0.18;
        this.kneeAim[1] = 0.18;
        this.headPitch = 0.25;
        this.body.rotation.y = Math.sin(t * 7) * 0.32;
        this.body.position.y -= 0.03;
        break;
      case 'skim':
        // Both hands forward on the pole, leaning over the water, drawing the net slowly from side to side.
        aim(0, -1.0, 0.25, -0.5);
        aim(1, -0.95, -0.2, -0.55);
        this.kneeAim[0] = 0.22;
        this.kneeAim[1] = 0.12;
        this.headPitch = 0.35;
        this.body.rotation.x += 0.12;
        this.body.rotation.y = Math.sin(t * 2.6) * 0.42;
        break;
      case 'read':
        aim(0, -0.75, 0.35, -1.0);
        aim(1, -0.75, -0.35, -1.0);
        this.headPitch = 0.22;
        this.body.rotation.x += Math.sin(t * 1.3) * 0.03;
        break;
      case 'sip': {
        // Lift, sip, lower, on a slow loop.
        const cycle = t % 2.2;
        const up = cycle < 0.35 ? cycle / 0.35 : cycle < 1.1 ? 1 : cycle < 1.45 ? 1 - (cycle - 1.1) / 0.35 : 0;
        aim(1, -0.5, 0, -0.6);
        // Session 63: the cup to the lips (IK onto a point just in front of this figure's own mouth, never into it).
        this.ensureClearance();
        this.gestureAt(1, smooth01(up), 0.06, MOUTH_Y, this.clearRest.between(MOUTH_Y - 0.05, MOUTH_Y + 0.08) + CUP_OUT, SIP_POLE, IN[1]);
        this.headPitch = 0.16 * up;
        break;
      }
      case 'watch': {
        const raised = t % 3.6 < 1.4;
        aim(0, raised ? -0.9 : 0, raised ? 0.55 : 0.1, raised ? -1.35 : -0.15);
        if (raised) this.body.rotation.x += 0.06;
        this.headPitch = raised ? 0.35 : 0;
        break;
      }
      case 'wash':
        aim(0, -0.7 + Math.sin(t * 11) * 0.12, 0.3, -0.75);
        aim(1, -0.7 - Math.sin(t * 11) * 0.12, -0.3, -0.75);
        this.headPitch = 0.3;
        break;
      case 'stamp': {
        const down = Math.max(0, Math.sin(t * 9));
        aim(1, -0.9 + down * 0.5, -0.2, -0.7 + down * 0.3);
        this.headPitch = 0.25;
        const stamp = this.props.get('stamp');
        if (stamp) stamp.position.y = 0.6 - down * 0.12;
        break;
      }
      case 'hug':
        aim(0, -0.8, 0.5, -1.1);
        aim(1, -0.8, -0.5, -1.1);
        this.headPitch = 0.15;
        this.body.rotation.z = Math.sin(t * 2.5) * 0.06;
        break;
      case 'wave':
        aim(1, -2.6, ARMS_UP_OUT + 0.1 + Math.sin(t * 9) * 0.22, -0.35 + Math.sin(t * 9) * 0.35);
        break;
      case 'stomp': {
        // Fix list 4.1: missed the train and storming off: fists low and pumping, leaning into each heavy step.
        const beat = Math.sin(t * 10);
        aim(0, beat * 0.7, 0.18, -1.2);
        aim(1, -beat * 0.7, -0.18, -1.2);
        this.headPitch = 0.25;
        this.body.position.y += Math.abs(beat) * 0.07;
        this.body.rotation.x += 0.2;
        this.body.rotation.z = beat * 0.07;
        break;
      }
      case 'waveTicket':
        // Waving the ticket overhead, a little hop now and then: "wait for me!"
        aim(1, -2.6, ARMS_UP_OUT + 0.1 + Math.sin(t * 10) * 0.22, -0.3 + Math.sin(t * 10) * 0.3);
        this.body.position.y += Math.max(0, Math.sin(t * 5)) * 0.04;
        break;
      case 'look': {
        // Looking about: a slow turn one way, a pause, then the other (hands behind the back).
        aim(0, 0.35, 0.05, -0.6);
        aim(1, 0.35, -0.05, -0.6);
        const k = t % 5;
        const side = k < 1.2 ? Math.sin((k / 1.2) * Math.PI * 0.5) : k < 2.4 ? 1 : k < 3.6 ? Math.cos(((k - 2.4) / 1.2) * Math.PI) : -1 + Math.min(1, (k - 3.6) / 1.4);
        this.body.rotation.y = side * 0.25;
        this.headYaw = side * 0.55;
        break;
      }
      case 'phone':
        // On the phone: the hand at the ear, the other on the hip, a nod now and then.
        aim(1, -0.35, 0, -1.6);
        aim(0, 0.05, 0, -0.25);
        // Session 63: the phone at the ear, outside this figure's own hair (IK); the other hand hangs.
        this.ensureClearance();
        this.gestureAt(1, 1, this.clearRest.widest(EAR_Y - 0.04, EAR_Y + 0.04) + PHONE_OUT, EAR_Y, 0.01, PHONE_POLE, IN[1]);
        this.headYaw = -0.15;
        this.body.rotation.x += Math.max(0, Math.sin(t * 2.2)) * 0.06;
        break;
      case 'chat': {
        // Talking with their hands: one gesture, then the other, a little bob.
        const g = Math.sin(t * 4.2);
        aim(0, -0.45 - Math.max(0, g) * 0.4, 0.35, -0.8 - Math.max(0, g) * 0.5);
        aim(1, -0.45 - Math.max(0, -g) * 0.4, -0.35, -0.8 - Math.max(0, -g) * 0.5);
        this.headYaw = Math.sin(t * 0.9) * 0.2;
        this.body.position.y += Math.abs(Math.sin(t * 4.2)) * 0.015;
        break;
      }
      case 'yawn': {
        // A big stretch: both arms up overhead, leaning back, then down again.
        const k = Math.min(1, t / 0.5) * (t > 1.6 ? Math.max(0, 1 - (t - 1.6) / 0.5) : 1);
        // Session 63: up and out in a wide Y (the clay head is as wide as the shoulders: straight up went through it).
        aim(0, -2.85 * k, -ARMS_UP_OUT * k, -0.3 * k);
        aim(1, -2.85 * k, ARMS_UP_OUT * k, -0.3 * k);
        this.headPitch = -0.3 * k;
        this.body.rotation.x -= 0.12 * k;
        break;
      }
    }
  }

  /**
   * Session 56 (owner: "the band guys are just standing there and bouncing"): a player in the station's brass band,
   * posed after `update` on the beat `t` (in beats). Everyone sways with the tune and taps a foot; the trumpet is
   * held to the lips and its bell lifts on the phrase, the tuba rocks side to side, the drummer strikes on every beat
   * with the hands in turn.
   */
  playInstrument(kind: 'trumpet' | 'tuba' | 'drum', t: number): void {
    const beat = t * Math.PI;
    const sway = Math.sin(beat * 0.5);
    const lift = Math.abs(Math.sin(beat));
    this.body.position.y += lift * 0.035;
    this.body.rotation.z = sway * (kind === 'tuba' ? 0.11 : 0.06);
    this.body.rotation.y = sway * 0.1;
    // A foot taps on the beat (the other one stays planted).
    this.legs[0].rotation.x = -Math.max(0, Math.sin(beat)) * 0.28;
    this.legs[1].rotation.x = 0;
    const [left, right] = this.arms;
    this.elbows[0].rotation.x = kind === 'drum' ? -0.6 : -1.2;
    this.elbows[1].rotation.x = kind === 'drum' ? -0.6 : -1.1;
    if (kind === 'trumpet') {
      // Four-beat phrases: the bell rises through the phrase, then a breath.
      const phrase = (t % 4) / 4;
      this.body.rotation.x = -0.05 - Math.sin(phrase * Math.PI) * 0.16;
      left.rotation.set(-1.45 - Math.sin(beat * 2) * 0.04, 0, -0.25);
      right.rotation.set(-1.4 + Math.sin(beat * 2) * 0.06, 0, 0.3);
    } else if (kind === 'tuba') {
      this.body.rotation.x = 0.04 + lift * 0.04;
      left.rotation.set(-0.95, 0, -0.15);
      right.rotation.set(-1.1, 0, 0.35);
    } else {
      this.body.rotation.x = 0.1;
      const hitL = Math.max(0, Math.sin(beat));
      const hitR = Math.max(0, -Math.sin(beat));
      left.rotation.set(-0.7 - hitL * 0.7, 0, -0.2);
      right.rotation.set(-0.7 - hitR * 0.7, 0, 0.2);
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
  setPose(pose: 'stand' | 'sleep' | 'sit' | 'lounge', blanketColor = PALETTE.greyWool): void {
    if (pose === this.pose && (pose !== 'sleep' || this.blanket?.userData.color === blanketColor)) return;
    this.pose = pose;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.shadow.visible = pose === 'stand';
    this.cast.visible = pose === 'stand';
    this.settleCloth();
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
        this.eyelids = new THREE.Mesh(eyelidGeometryFor(skinOf(this.look)), MATERIALS.character);
        this.eyelids.userData.shared = true;
        this.eyelids.position.y = -NECK_Y;
        this.head.add(this.eyelids);
      }
    } else if (pose === 'sit') {
      this.body.position.y = -SIT_DROP;
    } else if (pose === 'lounge') {
      // Reclined on a lounger: the body tipped back about the hip, which rests on the lounger (the root's height).
      const a = LOUNGE_TILT;
      this.body.rotation.x = -a;
      this.body.position.set(0, LOUNGE_HIP - HIP_Y * Math.cos(a), HIP_Y * Math.sin(a));
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
    this.bubbleMood = null;
    this.bubbleWide = false;
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

  /**
   * Session 38b (after the ad playable): how a passenger feels, a drawn face in their bubble beside what they want
   * (`icon`), or the face alone. `null` hides it. Shares the bubble sprite with `showBubble`.
   */
  showMood(mood: Mood | null, icon: IconName | null = null, height = 1.85): void {
    if (!mood) {
      this.showBubble(null);
      return;
    }
    const key = `mood:${mood}:${icon ?? ''}`;
    if (key === this.bubbleKey) return;
    // Pops in again only when the face changes (a new wish keeps the same face: a little re-pop all the same).
    const sameMood = this.bubbleKey.startsWith(`mood:${mood}:`) && mood !== 'love';
    this.bubbleKey = key;
    const texture = moodBubbleTexture(mood, icon);
    if (!this.bubble) {
      this.bubble = makeSprite(texture, MOOD_BUBBLE_SIZE);
      this.bubble.layers.set(WORLD_UI_LAYER);
      this.root.add(this.bubble);
    } else {
      (this.bubble.material as THREE.SpriteMaterial).map = texture;
      (this.bubble.material as THREE.SpriteMaterial).needsUpdate = true;
    }
    this.bubbleMood = mood;
    this.bubbleWide = true;
    this.bubble.visible = true;
    this.bubbleBaseY = height + MOOD_BUBBLE_LIFT;
    this.bubble.position.set(0, this.bubbleBaseY, this.bubbleZ);
    if (!sameMood) this.bubbleTime = 0;
  }

  get hasBubble(): boolean {
    return this.bubbleKey !== '';
  }

  /** `speed` is the current ground speed in m/s; drives walk cycle amplitude and rate. */
  update(dt: number, speed: number): void {
    this.updatePose(dt, speed);
    this.stepCloth(dt, this.clothStep, this.lastStrideSide);
    this.clothStep = false;
    if (this.cast.visible) {
      // The long shadow lies away from the key light (the moon, or the low sun), longer the lower the light.
      const d = LIGHT_UNIFORMS.uNxMoonDir.value;
      const flat = Math.hypot(d.x, d.z);
      const len = Math.max(CAST_MIN, Math.min(CAST_MAX, (0.9 * flat) / Math.max(0.05, d.y)));
      this.cast.rotation.set(0, Math.atan2(-d.x, -d.z) - this.yaw, 0);
      this.cast.scale.set(1, 1, len);
    }
  }

  /** A footfall since the cloth last stepped (each step bounces the hems and the hair). */
  private clothStep = false;

  private updatePose(dt: number, speed: number): void {
    this.bubbleTime += dt;
    if (this.bubble?.visible) {
      // Pop in with a small overshoot, then bob gently so requests catch the eye. Fix list 6.3: shrunk away while a
      // pop-up or label is over it on screen.
      // Session 38b (after the ad playable): a springy pop (a quick overshoot that settles), a slow breath once in, a
      // gentle bob, and a cross passenger's bubble shakes.
      const pop = Math.min(1, this.bubbleTime * BUBBLE_POP_RATE);
      const p = this.root.position;
      const masked = underPopup(p.x, p.y + this.bubbleBaseY, p.z);
      const spring = pop < 1 ? Math.min(1.25, 1 - Math.cos(pop * Math.PI * 2.6) * Math.exp(-pop * 4.5)) : 1 + Math.sin(this.bubbleTime * 3) * 0.02;
      const s = masked ? 0.0001 : (this.bubbleWide ? MOOD_BUBBLE_SIZE : 0.9) * spring;
      this.bubble.scale.set(s, s, 1);
      this.bubble.position.x = this.bubbleMood === 'angry' ? Math.sin(this.bubbleTime * 38) * 0.015 : 0;
      this.bubble.position.y = this.bubbleBaseY + Math.sin(this.bubbleTime * 2.4) * 0.025;
    }
    {
      let d = this.yawTarget - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * TURN_RATE);
    }
    this.root.rotation.set(this.tilt(), this.yaw, 0);
    this.kneeAim[0] = this.kneeAim[1] = 0.03;
    this.headYaw = 0;
    this.headPitch = 0;
    if (this.pose !== 'stand') {
      // Sitting: thighs forward along the seat, shins straight down from the knee (pass 2: the knee bends). Lounging:
      // legs out straight along the lounger, one knee up.
      const lounge = this.pose === 'lounge';
      this.legs[0].rotation.x = this.pose === 'sit' ? -1.42 : lounge ? -(Math.PI / 2 - LOUNGE_TILT) - 0.35 : 0;
      this.legs[1].rotation.x = this.pose === 'sit' ? -1.42 : lounge ? -(Math.PI / 2 - LOUNGE_TILT) : 0;
      this.kneeAim[0] = this.pose === 'sit' ? 1.42 : lounge ? 0.7 : 0;
      this.kneeAim[1] = this.pose === 'sit' ? 1.42 : 0;
      if (lounge) {
        // Hands behind the head, the head lifted to look out.
        for (let i = 0; i < 2; i++) {
          this.arms[i].rotation.x = -2.7;
          this.arms[i].rotation.z = (i === 0 ? -1 : 1) * 0.55;
          this.elbowAim[i] = -2.1;
        }
        this.headPitch = 0.45;
        this.headYaw = Math.sin(this.phase * 0.3) * 0.15;
      }
      this.phase += dt;
      // Slow breathing: the blanket rises and falls.
      if (this.pose === 'sleep' && this.blanket) this.blanket.scale.y = 1 + Math.sin(this.phase * 1.6) * 0.06;
      if (this.pose === 'sit') {
        this.body.position.y = -SIT_DROP;
        this.body.rotation.set(0, 0, 0);
        // Seated hands rest on the lap, elbows bent; an action takes them.
        if (this.action === 'none') for (let i = 0; i < 2; i++) {
          const arm = this.arms[i];
          arm.rotation.x += (-0.45 - arm.rotation.x) * Math.min(1, dt * 12);
          this.elbowAim[i] = -0.75;
        }
        this.headYaw = Math.sin(this.phase * 0.35) * 0.18;
        this.applyAction(dt);
      } else if (!lounge) {
        for (let i = 0; i < 2; i++) this.elbowAim[i] = -0.1;
      }
      this.applyJoints(dt, this.pose === 'sit' ? 30 : 12);
      return;
    }

    if (this.riding) {
      this.animateRide(dt, speed);
      for (let i = 0; i < 2; i++) this.elbowAim[i] = -0.45;
      this.kneeAim[0] = 0.25;
      this.applyAction(dt);
      this.body.scale.set(1, 1, 1);
      this.applyJoints(dt, 18);
      this.applyHold(dt);
      return;
    }
    for (const leg of this.legs) leg.scale.y = 1;
    const moving = speed > 0.2;
    // The clay toy's walk (CHARACTER_SPEC §8): quick bouncy steps, the body rolling over the stance foot, the hips
    // twisting with the stride and the shoulders countering; a run is a longer, bouncier stride with a deeper lean and
    // pumping arms. `run` blends the walk into the run with the pace.
    const run = smooth01((speed - 2.4) / 2);
    this.phase += dt * (moving ? 3.4 + speed * 2.3 : 1.6);
    // Session 38b (after the ad playable): the swing and the forward lean ease in and out, so starting and stopping
    // never snap the legs.
    // Session 63: long clothes shorten the step (a gown most, then a dress, a coat, an apron), as they do: a stride never
    // takes a knee or a heel through the hem.
    const hobble = this.strideScale();
    const swingTarget = moving ? (WALK.stride * hobble.walk + (RUN.stride * hobble.run - WALK.stride * hobble.walk) * run) * Math.min(1, 0.45 + speed * 0.35) : 0;
    this.swingNow += (swingTarget - this.swingNow) * Math.min(1, dt * (moving ? 12 : 9));
    const swing = this.swingNow;
    const amount = Math.min(1, swing / WALK.stride);
    const s = Math.sin(this.phase);
    // A foot lands at each end of the stride (the swing turns), twice a cycle.
    const side = Math.cos(this.phase) >= 0;
    if (moving && side !== this.lastStrideSide) {
      this.footfall = true;
      this.clothStep = true;
    }
    this.lastStrideSide = side;
    const c = Math.cos(this.phase);
    this.walkS = s;
    this.legs[0].rotation.x = s * swing;
    this.legs[1].rotation.x = -s * swing;
    // The passing leg folds at the knee (the foot clears the floor) and straightens to land.
    // In a long skirt, a coat or an apron the run is shorter-stepped and the back foot kicks up less (as people do).
    const fold = (WALK.knee + (RUN.knee - WALK.knee) * run) * (hobble.walk + (hobble.kick - hobble.walk) * run);
    this.kneeAim[0] = 0.05 + Math.max(0, -c) * fold * amount + Math.max(0, s) * swing * 0.3;
    this.kneeAim[1] = 0.05 + Math.max(0, c) * fold * amount + Math.max(0, -s) * swing * 0.3;
    // The bounce: up as the legs pass (twice a cycle), a slow breath while standing. A tall stack makes the walker
    // lean back to balance it.
    const bob = (WALK.bob + (RUN.bob - WALK.bob) * run) * amount;
    this.body.position.y = Math.abs(c) * bob + (1 - Math.min(1, swing / 0.2)) * Math.sin(this.phase) * 0.006;
    const balance = this.carrying ? -Math.min(0.09, Math.max(0, this.stackCount - 2) * 0.02) : 0;
    const lean = moving ? WALK.lean + (RUN.lean - WALK.lean) * run : 0;
    this.leanNow += (lean + balance - this.leanNow) * Math.min(1, dt * 8);
    this.body.rotation.x = this.leanNow;
    // Standing still, the weight shifts from one foot to the other now and then, and the head looks about.
    const idle = 1 - Math.min(1, swing / 0.2);
    this.body.position.x = Math.sin(this.phase * 0.55) * 0.012 * idle;
    // Rolling over the stance foot and twisting with the stride; the head counters the twist so the face stays on.
    const sway = (WALK.sway + (RUN.sway - WALK.sway) * run) * amount;
    const twist = (WALK.twist + (RUN.twist - WALK.twist) * run) * amount;
    this.swayZ = -s * sway + Math.sin(this.phase * 0.55) * 0.02 * idle;
    this.twistY = s * twist;
    this.headYaw = Math.sin(this.phase * 0.42) * 0.22 * idle - s * twist * 0.8;

    // An action owns the arms while it runs; otherwise they swing with the walk (or carry, or wave).
    if (this.action === 'none') {
      for (let i = 0; i < 2; i++) {
        const arm = this.arms[i];
        const side = i === 0 ? -1 : 1;
        let x = (i === 0 ? -s : s) * swing * (WALK.arm + (RUN.arm - WALK.arm) * run);
        // A skirt or coat flaring round the legs takes the hanging hands out with it.
        let z = side * (this.restAbduct + this.clothSpread());
        // The elbow bends more as the arm swings forward, and a little all the time (a relaxed arm is never straight);
        // running, the arms pump bent.
        let elbow = -(WALK.elbow + (RUN.elbow - WALK.elbow) * run) * (0.5 + 0.5 * amount) - Math.max(0, -x) * 0.6;
        if (this.carrying) {
          // Holding the stack out in front: upper arms forward, forearms level under it, hands in toward the middle.
          x = -0.5 + Math.sin(this.phase * 2) * 0.03 * swing;
          z = -side * 0.22;
          elbow = -1.1;
        }
        if (this.carryBoard && i === 0) {
          // A surfboard under the left arm: the arm out round it, the forearm along it, the hand under its rail.
          x = -0.15;
          z = side * 0.42;
          elbow = -0.6;
        }
        if (this.carryBox && i === 1) {
          // A box on the right shoulder: the arm raised and the hand steadying it from the side.
          x = -2.25;
          z = side * 0.3;
          elbow = -1.25;
        }
        if (this.waving && i === 1) {
          x = -2.6;
          elbow = -0.35;
        }
        arm.rotation.x += (x - arm.rotation.x) * Math.min(1, dt * 16);
        if (!(this.waving && i === 1)) arm.rotation.z += (z - arm.rotation.z) * Math.min(1, dt * 16);
        this.elbowAim[i] = elbow;
      }
      if (this.waving) {
        this.waveTime += dt;
        this.arms[1].rotation.z = ARMS_UP_OUT + 0.1 + Math.sin(this.waveTime * 9) * 0.22;
        this.elbowAim[1] = -0.35 + Math.sin(this.waveTime * 9) * 0.3;
      }
    }

    this.body.rotation.y = this.twistY;
    this.body.rotation.z = this.swayZ;
    this.applyAction(dt);
    this.applyJoints(dt, 20);
    this.applyHold(dt);

    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const k = Math.sin(this.squash * Math.PI) * 0.12;
      this.body.scale.set(1 + k, 1 - k, 1 + k);
    } else {
      // Standing still, a slow breath (barely there: it only keeps a waiting figure from looking frozen).
      // Standing still, a slow breath (about 0.25 Hz): the chest swells a touch, so a waiting figure never looks frozen.
      const breath = moving ? 0 : Math.sin(this.phase * 1.0) * 0.015;
      this.body.scale.set(1 + breath * 0.4, 1 + breath, 1 + breath * 0.4);
    }
  }

  /** Eases the knees, elbows and head toward their targets (quick: crisp but never a snap). */
  private applyJoints(dt: number, rate: number): void {
    const k = Math.min(1, dt * rate);
    for (let i = 0; i < 2; i++) {
      this.kneeNow[i] += (this.kneeAim[i] - this.kneeNow[i]) * k;
      this.elbowNow[i] += (this.elbowAim[i] - this.elbowNow[i]) * k;
      this.knees[i].rotation.x = this.kneeNow[i];
      this.elbows[i].rotation.x = this.elbowNow[i];
    }
    const h = Math.min(1, dt * 8);
    this.head.rotation.y += (this.headYaw - this.head.rotation.y) * h;
    this.head.rotation.x += (this.headPitch - this.head.rotation.x) * h;
  }

  /**
   * The scooter ride: a kick cycle while moving (the back leg reaches down and back to the floor, stretching a
   * little so the toe touches, the body dipping on the front knee), coasting between kicks; standing still, both
   * feet on the deck. A footfall is reported as the kicking foot meets the floor.
   */
  private animateRide(dt: number, speed: number): void {
    const moving = speed > 0.3;
    const before = this.kick;
    if (moving) this.kick = (this.kick + dt * (0.9 + speed * 0.12)) % 1;
    else this.kick = 0;
    const push = moving && this.kick < RIDE_PUSH ? Math.sin((this.kick / RIDE_PUSH) * Math.PI) : 0;
    if (moving && before < RIDE_PUSH * 0.5 && this.kick >= RIDE_PUSH * 0.5) this.footfall = true;
    const lean = moving ? 0.1 + 0.05 * push : 0.03;
    const bodyY = this.rideLift - 0.035 * push;
    this.body.position.y = bodyY;
    this.body.rotation.set(lean, 0, 0.035 * push);
    // The front foot stays planted on the deck; the back foot kicks.
    const front = this.legs[0];
    front.rotation.x = -lean - 0.08;
    front.scale.y = 1;
    const back = this.legs[1];
    const angle = 0.1 + 0.55 * push;
    back.rotation.x = angle - lean;
    const reach = (HIP_Y + bodyY) / (LEG_LENGTH * Math.cos(angle));
    back.scale.y = 1 + (reach - 1) * push;
    if (this.action === 'none') {
      for (let i = 0; i < 2; i++) {
        const arm = this.arms[i];
        arm.rotation.x += (RIDE_ARM - lean - arm.rotation.x) * Math.min(1, dt * 14);
        const rest = (i === 0 ? -1 : 1) * this.restAbduct;
        arm.rotation.z += (rest - arm.rotation.z) * Math.min(1, dt * 14);
      }
    }
  }

  /**
   * Session 32: makes a pooled character a fresh one (a new guest from the pool). Every field a character carries is
   * set again here, so nothing of whoever wore it before survives: look, size, pose, eyes, bubble, action, props,
   * walk cycle, transforms and visibility. It is drawn through the batch again from the next frame.
   */
  reset(look: CharacterLook, scale: number): void {
    this.setLook(look);
    if (this.eyelids) this.eyelids.geometry = eyelidGeometryFor(skinOf(look));
    this.setPose('stand');
    this.showBubble(null);
    this.bubbleTime = 0;
    this.bubbleBaseY = 1.85;
    this.bubbleMood = null;
    this.bubbleWide = false;
    this.action = 'none';
    this.actionTime = 0;
    this.actionClock = 0;
    for (const mesh of this.props.values()) mesh.visible = false;
    for (const mesh of this.inHand.values()) mesh.visible = false;
    this.carrying = false;
    this.riding = false;
    this.rideLift = 0;
    this.kick = 0;
    this.waving = false;
    this.leans = true;
    this.squash = 0;
    this.swingNow = 0;
    this.leanNow = 0;
    this.footfall = false;
    this.phase = Math.random() * 10;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    for (const leg of this.legs) {
      leg.rotation.set(0, 0, 0);
      leg.scale.set(1, 1, 1);
    }
    this.arms.forEach((arm, i) => arm.rotation.set(0, 0, (i === 0 ? -1 : 1) * this.restAbduct));
    for (let i = 0; i < 2; i++) {
      this.kneeNow[i] = this.kneeAim[i] = 0;
      this.elbowNow[i] = this.elbowAim[i] = -0.12;
      this.knees[i].rotation.set(0, 0, 0);
      this.elbows[i].rotation.set(0, 0, 0);
    }
    this.head.rotation.set(0, 0, 0);
    this.carryBoard = false;
    this.carryBox = false;
    this.stackCount = 0;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.yaw = 0;
    this.yawTarget = 0;
    this.swayZ = 0;
    this.twistY = 0;
    this.root.scale.setScalar(scale);
    this.head.scale.setScalar(scale < CHILD_SCALE ? CHILD_HEAD : 1);
    this.root.visible = true;
    this.shadow.visible = true;
    this.cast.visible = true;
    this.settleCloth();
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
  // Phase 4, the Riviera: the children's entertainer in a striped top and a bright cap, the masseur in a mint tunic,
  // the lifeguard in red with a sun cap and a whistle.
  entertainer: { body: '#F7B32B', accent: '#4FA8E0', skin: '#E3AE87', hair: '#C9532F', pants: '#4FA8E0', hat: 'cap', hatColor: '#F25C54', arms: true, outfit: 'tee', stripes: true, trim: '#FFFFFF', hairStyle: 'curly', shoe: '#F25C54' },
  masseur: { body: '#9FD8C8', accent: '#F2EEE6', skin: '#C98E68', hair: '#1D1616', pants: '#F2EEE6', hat: 'none', arms: true, outfit: 'shirt', sleeves: 'short', hairStyle: 'bun', shoe: '#F2EEE6' },
  lifeguard: { body: '#D9363E', accent: '#F2EEE6', skin: '#D49A6E', hair: '#E8CF8E', pants: '#F2C94C', hat: 'cap', hatColor: '#F2EEE6', accessory: 'whistle', arms: true, outfit: 'tee', sleeves: 'short', hairStyle: 'short', shoe: '#F2EEE6' },
};

/**
 * A trained helper's look (session 36, owner: "the Expert Attendant should look different, more professional, and
 * visually more distinct"): from the staff level named here, the uniform changes. The Expert Attendant is a head
 * housekeeper: a tailored aubergine jacket with gold buttons and sash, a peaked cap with a gold band, her hair in a bun.
 */
export const EXPERT_STAFF_LOOKS: Partial<Record<StaffRole, { fromLevel: number; look: CharacterLook }>> = {
  attendant: {
    fromLevel: 3,
    look: {
      body: '#4A3262', accent: PALETTE.gold, skin: '#E3AE87', hair: '#2F2520', pants: '#2A2034', hat: 'conductor', hatColor: '#4A3262',
      bandColor: PALETTE.gold, accessory: 'sash', arms: true, outfit: 'jacket', sleeves: 'long', hairStyle: 'bun', trim: '#F2EEE6', shoe: '#1A1418',
    },
  },
};

function castsShadow<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  return mesh;
}
