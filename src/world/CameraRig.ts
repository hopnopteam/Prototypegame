import * as THREE from 'three';
import { VISUALS } from '../config/visuals';
import { damp } from '../core/math';

/**
 * Pads, tiles and the guide arrow draw on their own camera layer, so the intro can show the train alone
 * (showWorldUi).
 */
export const WORLD_UI_LAYER = 1;

const DEG = Math.PI / 180;

/**
 * Three-quarter follow camera. The world is laid out in train coordinates (x across the train, +x the land
 * side; z along it, the locomotive toward -z) and never rotates: the camera orbits it instead, so the
 * train runs diagonally across the portrait screen (VISUALS.camera.trainYawDeg). Rotating the view rather
 * than the world keeps every system (collision, navigation, zones, scenery scroll) in one frame, so
 * changing the angle is a single number. Damped follow with a lead along the train, screen shake,
 * zoom punches and a temporary focus override for celebrations.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly focus = new THREE.Vector3();
  private distance = 20;
  private baseDistance = 20;
  private zoom = 1;
  /** A short zoom-in kick on big moments; decays back to rest. */
  private punchAmount = 0;
  private shakeTime = 0;
  private shakeStrength = 0;
  private overrideTarget: THREE.Vector3 | null = null;
  private overrideTime = 0;
  private overrideZoom = 1;
  /** How briskly the camera glides to an override (slower for the intro's cinematic moves). */
  private overrideSharpness = VISUALS.camera.followSharpness;
  private initialised = false;
  /** Context framing (rooms, platform, stride): targets, and the smoothed values actually used. */
  private readonly context = { zoom: 1, x: 0, z: 0 };
  private readonly contextNow = { zoom: 1, x: 0, z: 0 };
  /** Where the focus may go across the train (metres, train x) and along it (train z). */
  clampX: [number, number] = [-2.5, 6];
  clampZ: [number, number] = [-40, 120];
  /** Horizontal view direction (unit, on the ground) and screen-right direction, in train coordinates. */
  private readonly forward = new THREE.Vector2();
  private readonly right = new THREE.Vector2();
  private yaw = 0;
  private pitch = 0;
  private fov = 33;

  constructor() {
    const c = VISUALS.camera;
    this.camera = new THREE.PerspectiveCamera(c.fovDeg, 9 / 16, c.near, c.far);
    this.camera.layers.enable(WORLD_UI_LAYER);
    this.setAngles(c.trainYawDeg, c.pitchDeg, c.fovDeg);
  }

  /** Re-aims the view (degrees). Everything else follows automatically. */
  setAngles(trainYawDeg: number, pitchDeg: number, fovDeg: number): void {
    this.yaw = trainYawDeg * DEG;
    this.pitch = pitchDeg * DEG;
    this.fov = fovDeg;
    // Looking toward the lake side (-x) and up the train (-z): the locomotive lands top right.
    this.forward.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), -Math.sin(this.yaw));
    this.camera.fov = fovDeg;
    this.resize(this.camera.aspect);
  }

  /** Ground direction the camera looks along (unit vector in train x/z). */
  get viewDirection(): THREE.Vector2 {
    return this.forward;
  }

  /** Ground direction of screen-right (unit vector in train x/z). */
  get screenRight(): THREE.Vector2 {
    return this.right;
  }

  /** Pads, tiles and the guide arrow (hidden for the intro, so the train reads alone). */
  showWorldUi(on: boolean): void {
    if (on) this.camera.layers.enable(WORLD_UI_LAYER);
    else this.camera.layers.disable(WORLD_UI_LAYER);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    const halfFov = (this.fov / 2) * DEG;
    this.baseDistance = VISUALS.camera.minVisibleWidth / (2 * Math.tan(halfFov) * aspect);
    this.camera.updateProjectionMatrix();
  }

  /** Pixels per metre at unit distance; the particle shader needs it. */
  pixelScale(viewportHeightPx: number): number {
    return viewportHeightPx / (2 * Math.tan((this.fov / 2) * DEG));
  }

  /**
   * Turns a stick direction read on screen (x right, y down, length ≤ 1) into a walking direction on the
   * ground, so the conductor walks where the thumb points on screen whatever the camera angle. Directions
   * close to the train's length or width snap onto it (corridors, doorways).
   */
  screenToGround(sx: number, sy: number, out: { x: number; y: number }): { x: number; y: number } {
    const m = Math.hypot(sx, sy);
    if (m < 1e-6) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    // Ground distances along the view are foreshortened on screen by sin(pitch): undo it.
    const a = sx;
    const b = sy / Math.sin(this.pitch);
    let gx = a * this.right.x - b * this.forward.x;
    let gz = a * this.right.y - b * this.forward.y;
    const snap = VISUALS.camera.axisSnapDeg * DEG;
    if (snap > 0) {
      const angle = Math.atan2(gx, gz);
      const axis = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      const delta = angle - axis;
      // Within `snap` of an axis: exactly on it. From snap to 2×snap: easing back. Beyond: exactly where the
      // thumb points (a remap of the whole circle would bend every direction toward the train's axes).
      const ad = Math.abs(delta);
      const bent = ad <= snap ? 0 : ad >= 2 * snap ? delta : Math.sign(delta) * (ad - snap) * 2;
      gx = Math.sin(axis + bent);
      gz = Math.cos(axis + bent);
    }
    const l = Math.hypot(gx, gz);
    out.x = (gx / l) * m;
    out.y = (gz / l) * m;
    return out;
  }

  shake(strength: number, seconds: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  /** A quick zoom-in kick (0.04 = subtle, 0.1 = big) that springs back: weight for a reward moment. */
  punch(amount: number): void {
    this.punchAmount = Math.max(this.punchAmount, amount);
  }

  /** Look at a point for a while (celebrations), then glide back to the player. */
  focusOn(target: THREE.Vector3, seconds: number, zoom = 1.25, sharpness = VISUALS.camera.followSharpness): void {
    this.overrideTarget = target.clone();
    this.overrideTime = seconds;
    this.overrideZoom = zoom;
    this.overrideSharpness = sharpness;
  }

  /** A focus override (a celebration, a reveal) is running. */
  get focusing(): boolean {
    return this.overrideTime > 0;
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
    this.focus.set(x, 0, z - VISUALS.camera.lookAhead);
    this.initialised = false;
  }

  update(dt: number, followX: number, followZ: number): void {
    const cfg = VISUALS.camera;
    // Slow, even easing so framing changes read as a glide, never a jolt.
    const c = this.contextNow;
    c.zoom = damp(c.zoom, this.context.zoom, cfg.contextSharpness, dt);
    c.x = damp(c.x, this.context.x, cfg.contextSharpness, dt);
    c.z = damp(c.z, this.context.z, cfg.contextSharpness, dt);
    // Follow the conductor fully on both axes: on a diagonal train anything less makes them drift across
    // the screen in a different direction from the stick (session 13).
    let tx = Math.min(this.clampX[1], Math.max(this.clampX[0], followX + c.x)) - cfg.lakeBias;
    // Lead along the train toward the locomotive, never past either end of the world.
    let tz = Math.min(this.clampZ[1], Math.max(this.clampZ[0], followZ - cfg.lookAhead + c.z));
    let zoom = this.zoom * c.zoom;
    let sharpness = cfg.followSharpness;
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

    // Shake in screen space (right and up), so it reads the same at any angle.
    let sr = 0;
    let su = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = this.shakeStrength * Math.min(1, this.shakeTime * 3);
      sr = (Math.random() - 0.5) * k;
      su = (Math.random() - 0.5) * k;
      if (this.shakeTime <= 0) this.shakeStrength = 0;
    }

    const cam = this.camera;
    const distance = this.distance * (1 - this.punchAmount);
    const back = Math.cos(this.pitch) * distance;
    const fx = this.focus.x + this.right.x * sr;
    const fz = this.focus.z + this.right.y * sr;
    cam.position.set(fx - this.forward.x * back, Math.sin(this.pitch) * distance + su, fz - this.forward.y * back);
    cam.lookAt(fx, 0, fz);
  }

  /** The current zoom relative to the default framing (above 1 is further out). */
  get zoomNow(): number {
    return this.distance / Math.max(1e-3, this.baseDistance);
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }
}
