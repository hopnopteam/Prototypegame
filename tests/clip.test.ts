import { describe, expect, it } from 'vitest';
import { createItemMesh } from '../src/world/ItemMeshes';
import { CARRIERS, chores, gestures, GUESTS, LOADS, reseed, run, seated, summarise, wander, type Clip } from './clipkit';

/**
 * Session 63: nothing clips (the kit and how it measures: tests/clipkit.ts). The everyday run walks every guest once
 * and puts each carrier through one load of each kind; `npm run audit:clip` (CLIP_FULL=1) runs everything: three
 * stride starts for every walker, every gesture for every figure, every carrier with every load (about 5 minutes).
 */
const FULL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CLIP_FULL === '1';

describe('nothing clips', { timeout: 900_000 }, () => {
  it('guests walking, running, stopping and turning (bodies, limbs, skirts, coats, hair)', () => {
    // Three walks each, from different steps of the stride.
    const clips: Clip[] = [];
    for (const seed of FULL ? [1, 2, 3] : [1]) {
      reseed(seed);
      clips.push(...GUESTS.flatMap((g) => run(g, `wander s${seed}`, 8, wander, false)));
    }
    if (clips.length) console.log(summarise(clips));
    expect(clips.length).toBe(0);
  });

  it('every gesture, standing and seated', () => {
    const clips: Clip[] = [];
    for (const g of FULL ? [...GUESTS.filter((n) => n.endsWith(':0')), ...CARRIERS] : ['grandma:0', 'businessman:0', 'vip:0', 'student:0', 'conductor', 'attendant']) {
      clips.push(...run(g, 'gestures', 17 * 1.6, gestures, false));
      clips.push(...run(g, 'seated', 6 * 1.6, seated, false));
    }
    if (clips.length) console.log(summarise(clips));
    expect(clips.length).toBe(0);
  });

  it('every carrier with every kind of load, through every take and hand-over', () => {
    const clips: Clip[] = [];
    const loads = FULL ? LOADS : LOADS.filter((_, i) => [0, 3, 6, 7, 8].includes(i));
    const carriers = FULL ? CARRIERS : ['conductor', 'porter', 'attendant', 'chef', 'lifeguard'];
    for (const who of carriers) for (const load of loads) clips.push(...run(who, load.join('+'), (2 * load.length + 3) * 0.7 + 0.5, chores(load), true));
    if (clips.length) console.log(summarise(clips));
    expect(clips.length).toBe(0);
  });

  it('the supply box on the shoulder (with a tray in front)', () => {
    const clips = run('conductor', 'box', 4, (view, st, t) => {
      if (t < 0.02) {
        const box = createItemMesh('crate');
        box.scale.setScalar(0.5);
        box.position.set(0.36, 0.815, -0.03);
        box.rotation.set(0, 0, -0.08);
        box.userData.carried = true;
        view.body.add(box);
        view.setCarrying(false, false, true);
        st!.add('tea');
      }
      view.setFacing(t * 0.8);
      return t % 2 < 1 ? 1.6 : 0;
    }, true);
    if (clips.length) console.log(summarise(clips));
    expect(clips.length).toBe(0);
  });
});
