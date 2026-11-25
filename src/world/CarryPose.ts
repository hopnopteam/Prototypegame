import * as THREE from 'three';

/**
 * Session 63 (owner: "individual detailed animation… when he picks up the bags, when he is holding the bags… zero clip
 * ins"): the arithmetic of carrying, kept apart from the figure so it can be tested on its own.
 *
 *  - `solveArm`: two-bone IK for the clay arm (a shoulder ball, an elbow hinge, a mitten), so a hand lands exactly on a
 *    grip point (under a tray's back corners, round a suitcase's handle, against a box on the shoulder) instead of the
 *    arm being posed by hand and the item floating near it.
 *  - `Clearance`: how far forward the figure reaches at each height (its belly, its collar, its nose, its hat's peak),
 *    measured from its own meshes, so a stack in front is placed just clear of it and never inside it.
 */

/** A body-space arm chain: where its pivot is and how long its two bones are. */
export interface ArmChain {
  shoulder: THREE.Vector3;
  /** Shoulder pivot to elbow pivot. */
  upper: number;
  /** Elbow pivot to the grip point (the middle of the mitten). */
  fore: number;
  /** Which side of the body (+1 is +x). */
  side: 1 | -1;
}

export interface ArmSolution {
  /** The shoulder pivot's rotation (relative to the body). */
  shoulder: THREE.Quaternion;
  /** The elbow's bend (its rotation.x; never positive: the forearm only folds forward). */
  bend: number;
  /** Whether the target was within reach (otherwise the hand stops short along the line to it). */
  reached: boolean;
}

const tA = new THREE.Vector3();
const tN = new THREE.Vector3();
const tM = new THREE.Vector3();
const tE = new THREE.Vector3();
const tU = new THREE.Vector3();
const tF = new THREE.Vector3();
const tX = new THREE.Vector3();
const tY = new THREE.Vector3();
const tZ = new THREE.Vector3();
const tMat = new THREE.Matrix4();

/**
 * Puts the hand's grip point on `target` (body space). `pole` is the way the elbow should point (down, back and out
 * for a figure carrying in front). The arm's own frame: it hangs along −y, the elbow folds the forearm toward +z.
 */
export function solveArm(arm: ArmChain, target: THREE.Vector3, pole: THREE.Vector3, out: ArmSolution): ArmSolution {
  const L1 = arm.upper;
  const L2 = arm.fore;
  tA.subVectors(target, arm.shoulder);
  let d = tA.length();
  const max = L1 + L2 - 1e-4;
  const min = Math.abs(L1 - L2) + 1e-3;
  out.reached = d <= max;
  tN.copy(tA).divideScalar(Math.max(d, 1e-6));
  d = Math.min(max, Math.max(min, d));
  // The elbow lies on a circle round the shoulder→target line; the pole picks the point on it.
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  tM.copy(pole).addScaledVector(tN, -pole.dot(tN));
  if (tM.lengthSq() < 1e-8) tM.set(0, -1, 0).addScaledVector(tN, tN.y);
  tM.normalize();
  tE.copy(arm.shoulder).addScaledVector(tN, a).addScaledVector(tM, r);
  tU.subVectors(tE, arm.shoulder).normalize();
  // The hand's point (on the line, clamped to reach).
  tF.copy(arm.shoulder).addScaledVector(tN, d).sub(tE).normalize();
  // The arm's frame: y along the upper arm back to the shoulder, z toward the way the forearm folds.
  tY.copy(tU).negate();
  tZ.copy(tF).addScaledVector(tU, -tF.dot(tU));
  if (tZ.lengthSq() < 1e-8) tZ.copy(tM).negate().addScaledVector(tU, tM.dot(tU));
  if (tZ.lengthSq() < 1e-8) tZ.set(0, 0, 1);
  tZ.normalize();
  tX.crossVectors(tY, tZ).normalize();
  tMat.makeBasis(tX, tY, tZ);
  out.shoulder.setFromRotationMatrix(tMat);
  out.bend = -Math.acos(Math.max(-1, Math.min(1, tU.dot(tF))));
  return out;
}

/** The grip point in body space for an arm pose (forward kinematics), into `out`. */
export function gripOf(arm: ArmChain, shoulder: THREE.Quaternion, bend: number, twist: number, grip: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  tQ.setFromEuler(tEuler.set(bend, twist, 0, 'XYZ'));
  out.copy(grip).applyQuaternion(tQ);
  out.y += -arm.upper;
  return out.applyQuaternion(shoulder).add(arm.shoulder);
}
const tQ = new THREE.Quaternion();
const tEuler = new THREE.Euler();

/** Height bins of the figure's forward reach (body space, metres): the most forward point at each height. */
export const CLEAR_BIN = 0.02;
export const CLEAR_TOP = 1.5;
const BINS = Math.ceil(CLEAR_TOP / CLEAR_BIN);

export class Clearance {
  /** Most forward z per height bin (body space), and the widest |x| (where a bag at the side must hang clear). */
  readonly front = new Float32Array(BINS).fill(-1);
  readonly wide = new Float32Array(BINS).fill(0);

  clear(): this {
    this.front.fill(-1);
    this.wide.fill(0);
    return this;
  }

  /** Adds a mesh's vertices (in its own space) moved by `matrix` into body space. */
  add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, front = true, wide = true): this {
    const p = geometry.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      const b = Math.floor(v.y / CLEAR_BIN);
      if (b < 0 || b >= BINS) continue;
      if (front && v.z > this.front[b]) this.front[b] = v.z;
      if (wide && Math.abs(v.x) > this.wide[b]) this.wide[b] = Math.abs(v.x);
    }
    return this;
  }

  /** The widest the figure is between two heights. */
  widest(y0: number, y1: number): number {
    const b0 = Math.max(0, Math.floor(y0 / CLEAR_BIN) - 1);
    const b1 = Math.min(BINS - 1, Math.floor(y1 / CLEAR_BIN) + 1);
    let x = 0;
    for (let b = b0; b <= b1; b++) if (this.wide[b] > x) x = this.wide[b];
    return x;
  }

  /** The most forward point of the figure between two heights (a bin either side for safety). */
  between(y0: number, y1: number): number {
    const b0 = Math.max(0, Math.floor(y0 / CLEAR_BIN) - 1);
    const b1 = Math.min(BINS - 1, Math.floor(y1 / CLEAR_BIN) + 1);
    let z = -1;
    for (let b = b0; b <= b1; b++) if (this.front[b] > z) z = this.front[b];
    return z;
  }
}

/** One stacked item's footprint (already at its carried scale). */
export interface StackItem {
  /** Width across the body (x), depth (z), height (y). */
  w: number;
  d: number;
  h: number;
}

/**
 * Places a stack in front of the figure: each item's centre z (body space) clear of the figure at its heights by
 * `gap`, each a little further out than the one below where the figure is deeper (the belly, the chin, a hat's peak),
 * but never so far that it would not rest on the one under it. Returns the bottom item's centre z.
 */
export function layoutStack(items: readonly StackItem[], baseY: number, clear: Clearance, gap: number, out: number[]): number {
  out.length = items.length;
  let y = baseY;
  let prev = -Infinity;
  let prevD = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const need = clear.between(i === 0 ? y - 0.08 : y, y + it.h) + gap + it.d / 2;
    out[i] = Math.max(need, prev === -Infinity ? need : prev);
    y += it.h;
    prev = out[i];
    prevD = it.d;
  }
  // Each item must still rest on the one below (its centre within a third of the lower one's depth): where a higher one
  // had to step out further, the ones below come out with it.
  for (let i = items.length - 1; i > 0; i--) {
    const limit = Math.min(items[i].d, items[i - 1].d) / 3;
    if (out[i] - out[i - 1] > limit) out[i - 1] = out[i] - limit;
  }
  void prevD;
  return out[0] ?? 0;
}
