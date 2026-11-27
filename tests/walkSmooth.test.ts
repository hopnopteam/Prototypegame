// The walk never jumps (owner, 27 Nov: "the player animation looks stiff when walking, it glitches"). Measured: the
// hands jumped up to 24 cm in a single frame, because the arms rested inside the chest and were pushed clear every
// frame, forward or out by turns. Every figure now walks, runs, stops and carries at 60 frames a second, and no hand
// or foot moves further in one frame than its own swing can take it (a step of ~4-5 cm at a run).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARCHETYPES } from '../src/config/content';
import { guestLook } from '../src/gameplay/guestLook';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../src/world/CharacterView';
import { ELBOW_Y, HAND_Y, KNEE_Y, LEG_LENGTH } from '../src/world/CharacterParts';

const LOOKS: [string, CharacterLook][] = [['conductor', CONDUCTOR_LOOK], ...Object.entries(STAFF_LOOKS).map(([r, l]) => [`staff:${r}`, l] as [string, CharacterLook])];
for (const a of ARCHETYPES) {
  const base: CharacterLook = { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor };
  LOOKS.push([a.id, guestLook(base, a, 0)]);
}
/** The most a hand or a foot may move in one frame (m) at the fastest pace tested. */
const MAX_STEP = 0.075;

describe('the walk never jumps', () => {
  for (const [name, look] of LOOKS) {
    it(name, () => {
      const v = new CharacterView(look);
      v.leans = false;
      const any = v as unknown as { elbows: THREE.Object3D[]; knees: THREE.Object3D[] };
      const ends = [...any.elbows.map((e) => [e, HAND_Y - ELBOW_Y] as const), ...any.knees.map((k) => [k, -(LEG_LENGTH + KNEE_Y)] as const)];
      const last = ends.map(() => new THREE.Vector3());
      let worst = 0;
      let at = '';
      // Walk, run, stop, walk with a stack, stop.
      const plan: [number, number, boolean][] = [[1.6, 1.2, false], [3.2, 1.2, false], [5, 1, false], [0, 0.8, false], [2.6, 1.2, true], [0, 0.8, true]];
      let f = 0;
      for (const [speed, seconds, carry] of plan) {
        v.setCarrying(carry);
        for (let t = 0; t < seconds; t += 1 / 60, f++) {
          v.update(1 / 60, speed);
          v.root.updateMatrixWorld(true);
          ends.forEach(([o, y], i) => {
            const p = new THREE.Vector3(0, y, 0).applyMatrix4(o.matrixWorld);
            // A change of what is carried moves the arms on purpose (eased over a few frames): skip that frame.
            if (f > 20 && t > 0.1) {
              const d = p.distanceTo(last[i]);
              if (d > worst) { worst = d; at = `${speed} m/s${carry ? ' carrying' : ''}, ${i < 2 ? 'hand' : 'foot'}`; }
            }
            last[i].copy(p);
          });
        }
      }
      expect(worst, at).toBeLessThan(MAX_STEP);
    });
  }
});
