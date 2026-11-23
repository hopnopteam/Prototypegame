import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_CATCH_UP_STEPS, SIM_STEP, advanceClock, snapToSteps } from '../src/sim/stepClock';
import { PoseHistory } from '../src/world/Interpolation';

/** Runs frames of the given lengths and returns how many steps they ran and what is left owed. */
function play(frames: number[]): { steps: number; carry: number; dropped: number } {
  let carry = 0;
  let steps = 0;
  let dropped = 0;
  for (const f of frames) {
    const c = advanceClock(carry, f);
    steps += c.steps;
    carry = c.carry;
    dropped += c.dropped;
  }
  return { steps, carry, dropped };
}

describe('the fixed simulation step (Phase 4c)', () => {
  it('runs the same steps at 30 and at 60 frames a second', () => {
    const at60 = play(new Array(600).fill(1 / 60));
    const at30 = play(new Array(300).fill(1 / 30));
    expect(at60.steps).toBe(600);
    expect(at30.steps).toBe(600);
    expect(at60.dropped).toBe(0);
    expect(at30.dropped).toBe(0);
  });

  it('snaps a frame a hair off a whole number of steps', () => {
    expect(snapToSteps(0.0168)).toBe(SIM_STEP);
    expect(snapToSteps(0.0331)).toBe(2 * SIM_STEP);
    // 90 Hz frames are not snapped: they are carried and drawn in between.
    expect(snapToSteps(1 / 90)).toBeCloseTo(1 / 90, 10);
  });

  it('carries the part of a step a frame did not fill, and interpolates by it', () => {
    const c = advanceClock(0, 1.5 * SIM_STEP);
    expect(c.steps).toBe(1);
    expect(c.carry).toBeCloseTo(0.5 * SIM_STEP, 10);
    expect(c.alpha).toBeCloseTo(0.5, 6);
    // 45 fps (a 90 Hz screen held to every other frame): steps alternate 1, 2, … and none are lost.
    const at45 = play(new Array(450).fill(1 / 45));
    expect(at45.steps).toBe(600);
  });

  it('never runs more than the catch-up allows in one frame, and drops the rest', () => {
    const c = advanceClock(0, 0.25);
    expect(c.steps).toBe(MAX_CATCH_UP_STEPS);
    expect(c.carry).toBe(0);
    expect(c.dropped).toBeGreaterThan(0);
    // The dev fast-forward raises the cap with it.
    expect(advanceClock(0, SIM_STEP, 8).steps).toBe(8);
  });
});

describe('render interpolation', () => {
  it('draws an object between its last two steps and puts it back', () => {
    const poses = new PoseHistory();
    const o = new THREE.Object3D();
    poses.beginStep();
    poses.record(o);
    o.position.set(0.5, 0, 0);
    poses.beginStep();
    poses.record(o);
    expect(poses.apply(o, 0.5)).toBe(true);
    expect(o.position.x).toBeCloseTo(0.25, 6);
    poses.restore(o);
    expect(o.position.x).toBe(0.5);
  });

  it('draws a jump where it lands, never sliding across', () => {
    const poses = new PoseHistory();
    const o = new THREE.Object3D();
    poses.beginStep();
    poses.record(o);
    o.position.set(5, 0, 0);
    poses.beginStep();
    poses.record(o);
    poses.apply(o, 0.5);
    expect(o.position.x).toBe(5);
    poses.restore(o);
  });

  it('leaves alone an object moved since its last step', () => {
    const poses = new PoseHistory();
    const o = new THREE.Object3D();
    poses.beginStep();
    poses.record(o);
    o.position.set(0.2, 0, 0);
    poses.beginStep();
    poses.record(o);
    o.position.set(0.3, 0, 0);
    expect(poses.apply(o, 0.5)).toBe(false);
    expect(o.position.x).toBe(0.3);
  });
});
