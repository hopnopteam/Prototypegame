import * as THREE from 'three';
import { damp } from '../core/math';

const PITCH = THREE.MathUtils.degToRad(55);
const FOV = 44;
const BASE_DISTANCE = 20;
/** Metres of floor that must fit across the screen at the focus point. */
const MIN_VISIBLE_WIDTH = 8.4;
const LOOK_AHEAD = 1.2;
const FOLLOW_SHARPNESS = 5;

/**
 * Portrait follow camera tilted ~55°, damped so it glides behind the player. Supports screen shake (coupling
 * clunk) and a temporary focus override (the new carriage rolling in).
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.5, 220);
  private readonly focus = new THREE.Vector3();
  private distance = BASE_DISTANCE;
  private baseDistance = BASE_DISTANCE;
  private zoom = 1;
  /** A short zoom-in kick on big moments; decays back to rest. */
  private punchAmount = 0;
  private shakeTime = 0;
  private shakeStrength = 0;
  private overrideTarget: THREE.Vector3 | null = null;
  private overrideTime = 0;
  private overrideZoom = 1;
  private initialised = false;
  clampX: [number, number] = [-2.5, 6];

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    const halfFov = THREE.MathUtils.degToRad(FOV / 2);
    this.baseDistance = Math.max(BASE_DISTANCE, MIN_VISIBLE_WIDTH / (2 * Math.tan(halfFov) * aspect));
    this.camera.updateProjectionMatrix();
  }

  /** Pixels per metre at unit distance; the particle shader needs it. */
  pixelScale(viewportHeightPx: number): number {
    return viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  }

  shake(strength: number, seconds: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  /** Look at a point for a while (celebrations), then glide back to the player. */
  /** A quick zoom-in kick (0.04 = subtle, 0.1 = big) that springs back: weight for a reward moment. */
  punch(amount: number): void {
    this.punchAmount = Math.max(this.punchAmount, amount);
  }

  focusOn(target: THREE.Vector3, seconds: number, zoom = 1.25): void {
    this.overrideTarget = target.clone();
    this.overrideTime = seconds;
    this.overrideZoom = zoom;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  /** Where the camera is looking (ground level); ambient life stages itself around it. */
  get target(): THREE.Vector3 {
    return this.focus;
  }

  snapTo(x: number, z: number): void {
    this.focus.set(x, 0, z - LOOK_AHEAD);
    this.initialised = false;
  }

  update(dt: number, followX: number, followZ: number): void {
    let tx = Math.min(this.clampX[1], Math.max(this.clampX[0], followX * 0.75));
    let tz = followZ - LOOK_AHEAD;
    let zoom = this.zoom;
    if (this.overrideTarget && this.overrideTime > 0) {
      this.overrideTime -= dt;
      tx = this.overrideTarget.x;
      tz = this.overrideTarget.z;
      zoom *= this.overrideZoom;
      if (this.overrideTime <= 0) this.overrideTarget = null;
    }
    if (!this.initialised) {
      this.focus.set(tx, 0, tz);
      this.distance = this.baseDistance * zoom;
      this.initialised = true;
    }
    this.focus.x = damp(this.focus.x, tx, FOLLOW_SHARPNESS, dt);
    this.focus.z = damp(this.focus.z, tz, FOLLOW_SHARPNESS, dt);
    this.distance = damp(this.distance, this.baseDistance * zoom, 3, dt);
    if (this.punchAmount > 0.001) this.punchAmount = damp(this.punchAmount, 0, 6, dt);
    else this.punchAmount = 0;

    let sx = 0;
    let sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = this.shakeStrength * Math.min(1, this.shakeTime * 3);
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
      if (this.shakeTime <= 0) this.shakeStrength = 0;
    }

    const cam = this.camera;
    const distance = this.distance * (1 - this.punchAmount);
    cam.position.set(
      this.focus.x + sx,
      Math.sin(PITCH) * distance + sy,
      this.focus.z + Math.cos(PITCH) * distance,
    );
    cam.lookAt(this.focus.x + sx * 0.5, 0, this.focus.z);
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }
}
