import * as THREE from 'three';

/**
 * Session 64 (owner: "why are there so many circular round things in character that connects these? I need human
 * anatomy naturally to flow"): a limb is one continuous surface, not a tube per bone joined by balls. Its vertices
 * follow their own bone, and near a joint blend toward the next one (linear blend skinning with two bones a vertex):
 *
 *  - the sleeve runs from the shoulder to the cuff: its top blends a little into the body (the shoulder rolls with
 *    the arm), its lower half follows the elbow (the forearm), the band between bends smoothly;
 *  - the trouser leg runs from the hip to its hem: its top blends a little into the hips, its lower half follows the
 *    knee (the shin).
 *
 * Which bone and how much is a function of a vertex's height along its limb (its own frame), so the GPU (the
 * `aSkin` attribute the batch turns into a second matrix and a weight) and the CPU tools (the clip test, the cloth's
 * containment of the legs, the stack clearance) compute the same bend from the same numbers. Code 0: no blend; 1:
 * the limb's parent (the body); 2: its child (the elbow or the shin).
 */
export type SkinWeight = (y: number) => [code: number, weight: number];

/** A partner bone: the object whose world matrix the blended vertices follow, and the limb's origin in its frame. */
export interface SkinPartner {
  object: THREE.Object3D;
  /** Where a point of the limb's own frame lands in the partner's frame in the bind pose: p + offset. */
  offset: THREE.Vector3;
}

/** What a skinned limb mesh carries in `userData.skin`. */
export interface SkinDef {
  /** The blend by height along the limb (session 64's tubes); the sculpted body (session 66) carries it per vertex. */
  weight?: SkinWeight;
  /** Partners for codes 1 and 2. */
  partners: [SkinPartner | null, SkinPartner | null];
}

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** How the shoulder and the elbow blend (metres along the arm, from the shoulder pivot; the elbow at `elbowY`). */
export const ARM_BLEND = { shoulderFrom: -0.07, shoulderTo: 0.05, shoulderMax: 0.35, elbowHalf: 0.045 };
/** How the hip and the knee blend (from the hip pivot; the knee at `kneeY`). */
export const LEG_BLEND = { hipFrom: -0.1, hipTo: 0.0, hipMax: 0.4, kneeHalf: 0.05 };

export function armWeight(elbowY: number): SkinWeight {
  const b = ARM_BLEND;
  return (y) => {
    if (y > b.shoulderFrom) return [1, b.shoulderMax * smooth01((y - b.shoulderFrom) / (b.shoulderTo - b.shoulderFrom))];
    if (y < elbowY + b.elbowHalf) return [2, smooth01((elbowY + b.elbowHalf - y) / (2 * b.elbowHalf))];
    return [0, 0];
  };
}

export function legWeight(kneeY: number): SkinWeight {
  const b = LEG_BLEND;
  return (y) => {
    if (y > b.hipFrom) return [1, b.hipMax * smooth01((y - b.hipFrom) / (b.hipTo - b.hipFrom))];
    if (y < kneeY + b.kneeHalf) return [2, smooth01((kneeY + b.kneeHalf - y) / (2 * b.kneeHalf))];
    return [0, 0];
  };
}

/** Writes the `aSkin` attribute (code, weight) of a limb geometry from its weight function. */
export function addSkin(g: THREE.BufferGeometry, weight: SkinWeight): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const [code, w] = weight(p.getY(i));
    a[i * 2] = w > 0 ? code : 0;
    a[i * 2 + 1] = w > 0 ? w : 0;
  }
  g.setAttribute('aSkin', new THREE.BufferAttribute(a, 2));
  return g;
}

const tB = new THREE.Vector3();
const tM = new THREE.Matrix4();

/**
 * A point of a limb (its own frame) where it is drawn: `own` is the limb's matrix and `partner(code)` the matrix of the
 * partner bone, in the same space (world, or the body's). Without a skin, or with no partner, the point is rigid.
 */
export function skinPoint(def: SkinDef | undefined, x: number, y: number, z: number, own: THREE.Matrix4, partner: (code: 1 | 2) => THREE.Matrix4 | null, out: THREE.Vector3, codeW?: readonly [number, number]): THREE.Vector3 {
  out.set(x, y, z).applyMatrix4(own);
  if (!def) return out;
  const [code, w] = codeW ?? def.weight?.(y) ?? [0, 0];
  if (w <= 0 || code === 0) return out;
  const m = partner(code as 1 | 2);
  const p = def.partners[code - 1];
  if (!m || !p) return out;
  tB.set(x, y, z).add(p.offset).applyMatrix4(m);
  return out.lerp(tB, w);
}

const tCW: [number, number] = [0, 0];

/** The world position of vertex `i` of a mesh, skinned when it carries a skin (the clip test). */
export function skinnedWorld(mesh: THREE.Mesh, i: number, out: THREE.Vector3): THREE.Vector3 {
  const pos = mesh.geometry.getAttribute('position');
  const def = mesh.userData.skin as SkinDef | undefined;
  const a = mesh.geometry.getAttribute('aSkin');
  if (a) {
    tCW[0] = a.getX(i);
    tCW[1] = a.getY(i);
  }
  return skinPoint(def, pos.getX(i), pos.getY(i), pos.getZ(i), mesh.matrixWorld, (code) => {
    const p = def?.partners[code - 1];
    if (!p) return null;
    return tM.copy(p.object.matrixWorld);
  }, out, a ? tCW : undefined);
}

