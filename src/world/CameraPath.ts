import * as THREE from 'three';

/** One key of a camera path: where the camera is, what it looks at, its lens, at a time (seconds from the shot's start). */
export interface CameraKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

/**
 * The Grand Departure's camera paths: a shot is a few keys joined by a centripetal Catmull-Rom spline (for the
 * position and the aim alike), eased in and out between its first and last key, so a pull-back or a swing reads as one
 * glide with no corner. `follow` adds a moving offset (a train pulling away), so a path can ride along with it.
 */
export class CameraPath {
  readonly duration: number;
  private readonly times: number[];
  private readonly pos: THREE.CatmullRomCurve3;
  private readonly look: THREE.CatmullRomCurve3;
  private readonly fovs: number[];

  constructor(readonly keys: CameraKey[], private readonly ease = true) {
    if (keys.length < 2) throw new Error('A camera path needs two keys');
    this.duration = keys[keys.length - 1].t;
    this.times = keys.map((k) => k.t);
    this.pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
    this.look = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal');
    this.fovs = keys.map((k) => k.fov ?? 33);
  }

  /** The camera at `t` seconds into the shot (clamped to the path). */
  sample(t: number, outPos: THREE.Vector3, outLook: THREE.Vector3): number {
    const d = this.duration;
    let u = d > 0 ? Math.min(1, Math.max(0, t / d)) : 1;
    if (this.ease) u = u * u * (3 - 2 * u);
    // The spline's own parameter runs evenly over its keys; map time onto it through the keys' times.
    const time = u * d;
    let i = 0;
    while (i < this.times.length - 2 && time > this.times[i + 1]) i++;
    const span = Math.max(1e-6, this.times[i + 1] - this.times[i]);
    const local = Math.min(1, Math.max(0, (time - this.times[i]) / span));
    const s = (i + local) / (this.times.length - 1);
    this.pos.getPoint(s, outPos);
    this.look.getPoint(s, outLook);
    return this.fovs[i] + (this.fovs[i + 1] - this.fovs[i]) * local;
  }
}
