import * as THREE from 'three';
import { damp } from '../core/math';

/**
 * Pads, tiles and the guide arrow draw on their own camera layer, so the title screen and the intro can
 * show the train alone (showWorldUi).
 */
export const WORLD_UI_LAYER = 1;

const PITCH = THREE.MathUtils.degToRad(55);
const FOV = 44;
const BASE_DISTANCE = 20;
/** Metres of floor that must fit across the screen at the focus point. */
const MIN_VISIBLE_WIDTH = 8.4;
const LOOK_AHEAD = 1.2;
const FOLLOW_SHARPNESS = 5;
const CAMERA_NEAR = 6;
const CONTEXT_SHARPNESS = 2.2;
const CAMERA_FAR = 160;

/**
 * Portrait follow camera tilted ~55°, damped so it glides behind the player. Supports screen shake (coupling
 * clunk) and a temporary focus override (the new carriage rolling in).
 */
export class CameraRig {
  // A deep near plane buys depth precision: phones with 16-bit depth buffers otherwise flicker on surfaces
  // a few millimetres apart. Nothing is ever within 6 m of the camera (it hangs 18 m+ above the train).
  readonly camera = new THREE.PerspectiveCamera(FOV, 9 / 16, CAMERA_NEAR, CAMERA_FAR);
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
  /** How briskly the camera glides to an override (slower for the intro's cinematic moves). */
  private overrideSharpness = FOLLOW_SHARPNESS;
  private initialised = false;
  /** Context framing (rooms, platform, stride): targets, and the smoothed values actually used. */
  private readonly context = { zoom: 1, x: 0, z: 0 };
  private readonly contextNow = { zoom: 1, x: 0, z: 0 };
  clampX: [number, number] = [-2.5, 6];

  constructor() {
    this.camera.layers.enable(WORLD_UI_LAYER);
  }

  /** Pads, tiles and the guide arrow (hidden for the title screen and the intro, so the train reads alone). */
  showWorldUi(on: boolean): void {
    if (on) this.camera.layers.enable(WORLD_UI_LAYER);
    else this.camera.layers.disable(WORLD_UI_LAYER);
  }

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

  focusOn(target: THREE.Vector3, seconds: number, zoom = 1.25, sharpness = FOLLOW_SHARPNESS): void {
    this.overrideTarget = target.clone();
    this.overrideTime = seconds;
    this.overrideZoom = zoom;
    this.overrideSharpness = sharpness;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  /** Framing for where the player is: a zoom factor and an offset of the look point (smoothed here). */
  setContext(zoom: number, offsetX: number, offsetZ: number): void {
    this.context.zoom = zoom;
    this.context.x = offsetX;
    this.context.z = offsetZ;
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
    // Slow, even easing so framing changes read as a glide, never a jolt.
    const c = this.contextNow;
    c.zoom = damp(c.zoom, this.context.zoom, CONTEXT_SHARPNESS, dt);
    c.x = damp(c.x, this.context.x, CONTEXT_SHARPNESS, dt);
    c.z = damp(c.z, this.context.z, CONTEXT_SHARPNESS, dt);
    let tx = Math.min(this.clampX[1], Math.max(this.clampX[0], followX * 0.75 + c.x));
    let tz = followZ - LOOK_AHEAD + c.z;
    let zoom = this.zoom * c.zoom;
    let sharpness = FOLLOW_SHARPNESS;
    if (this.overrideTarget && this.overrideTime > 0) {
      this.overrideTime -= dt;
      tx = this.overrideTarget.x;
      tz = this.overrideTarget.z;
      zoom *= this.overrideZoom;
      sharpness = this.overrideSharpness;
      if (this.overrideTime <= 0) this.overrideTarget = null;
    }
    if (!this.initialised) {
      this.focus.set(tx, 0, tz);
      this.distance = this.baseDistance * zoom;
      this.initialised = true;
    }
    this.focus.x = damp(this.focus.x, tx, sharpness, dt);
    this.focus.z = damp(this.focus.z, tz, sharpness, dt);
    this.distance = damp(this.distance, this.baseDistance * zoom, Math.min(3, sharpness), dt);
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
