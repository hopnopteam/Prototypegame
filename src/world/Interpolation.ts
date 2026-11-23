import * as THREE from 'three';

/**
 * Phase 4c, render interpolation for the fixed simulation step. The game moves in fixed 1/60 s steps (`SIM_STEP` in
 * Game.ts), so a frame can fall between two steps: drawing the last step as it is would judder whenever frames and
 * steps drift apart (a 90 Hz screen held to ~45 fps, an uneven frame). Each step records where a tracked object
 * stood before and after it; a frame draws it `alpha` of the way between the two, then puts the step's own pose
 * back, so the simulation never sees the drawn pose. Only the pose (position and rotation) of the object itself is
 * blended; what is inside it (a character's limbs) moves at the step's rate.
 */

/** A move this long in one step is a jump (set down elsewhere, a carriage rebuilt): it is drawn there at once. */
const JUMP = 1.0;

interface Pose {
  prev: THREE.Vector3;
  cur: THREE.Vector3;
  prevQ: THREE.Quaternion;
  curQ: THREE.Quaternion;
  /** The step this pose was last recorded on (an object not seen for a step starts afresh). */
  step: number;
  /** The pose the step left, held while a blended one is drawn. */
  heldP: THREE.Vector3;
  heldQ: THREE.Quaternion;
  held: boolean;
}

export class PoseHistory {
  private readonly poses = new Map<THREE.Object3D, Pose>();
  private stepNo = 0;

  /** A new step has run: what follows records its poses. */
  beginStep(): void {
    this.stepNo++;
  }

  /** Records `object`'s pose after the current step. */
  record(object: THREE.Object3D): void {
    let pose = this.poses.get(object);
    if (!pose) {
      pose = {
        prev: object.position.clone(),
        cur: object.position.clone(),
        prevQ: object.quaternion.clone(),
        curQ: object.quaternion.clone(),
        step: this.stepNo,
        heldP: new THREE.Vector3(),
        heldQ: new THREE.Quaternion(),
        held: false,
      };
      this.poses.set(object, pose);
      return;
    }
    const fresh = pose.step !== this.stepNo - 1;
    pose.step = this.stepNo;
    if (fresh || object.position.distanceToSquared(pose.cur) > JUMP * JUMP) {
      pose.prev.copy(object.position);
      pose.prevQ.copy(object.quaternion);
    } else {
      pose.prev.copy(pose.cur);
      pose.prevQ.copy(pose.curQ);
    }
    pose.cur.copy(object.position);
    pose.curQ.copy(object.quaternion);
  }

  /**
   * Draws `object` `alpha` of the way from the last step's start to its end (1: where the step left it). Returns true
   * if it moved it; `restore` puts it back. Only an object recorded on the latest step, and still where that step
   * left it, is blended.
   */
  apply(object: THREE.Object3D, alpha: number): boolean {
    if (alpha >= 1) return false;
    const pose = this.poses.get(object);
    if (!pose || pose.held || pose.step !== this.stepNo) return false;
    if (!object.position.equals(pose.cur)) return false;
    pose.heldP.copy(object.position);
    pose.heldQ.copy(object.quaternion);
    pose.held = true;
    object.position.lerpVectors(pose.prev, pose.cur, alpha);
    object.quaternion.slerpQuaternions(pose.prevQ, pose.curQ, alpha);
    if (object.matrixAutoUpdate) object.updateMatrix();
    return true;
  }

  restore(object: THREE.Object3D): void {
    const pose = this.poses.get(object);
    if (!pose || !pose.held) return;
    object.position.copy(pose.heldP);
    object.quaternion.copy(pose.heldQ);
    if (object.matrixAutoUpdate) object.updateMatrix();
    pose.held = false;
  }

  forget(object: THREE.Object3D): void {
    this.poses.delete(object);
  }
}
