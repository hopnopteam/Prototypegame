import * as THREE from 'three';
import { clamp01, lerp } from '../core/math';
import { setNightAmount } from './materials';

interface Key {
  t: number;
  sky: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  night: number;
}

/**
 * A day → golden hour → dusk → night → dawn loop across the journey. Daylight is soft and even (the
 * storybook look), with a low warm sun at golden hour and a cool moon at night.
 */
const KEYS: Key[] = [
  { t: 0.0, sky: '#F2E4C4', hemiSky: '#FFF6E8', hemiGround: '#A7B386', hemi: 1.55, sun: '#FFF0D8', sunIntensity: 2.1, night: 0 },
  { t: 0.42, sky: '#F2E4C4', hemiSky: '#FFF6E8', hemiGround: '#A7B386', hemi: 1.55, sun: '#FFF0D8', sunIntensity: 2.1, night: 0 },
  { t: 0.56, sky: '#F5CFA0', hemiSky: '#FFE6C4', hemiGround: '#A99270', hemi: 1.45, sun: '#FFC98A', sunIntensity: 1.95, night: 0.04 },
  { t: 0.66, sky: '#E7A18E', hemiSky: '#F5BFB0', hemiGround: '#7A6A74', hemi: 1.3, sun: '#FF9E78', sunIntensity: 1.35, night: 0.45 },
  { t: 0.74, sky: '#1F2A4A', hemiSky: '#FFE6C8', hemiGround: '#6A5C66', hemi: 1.2, sun: '#FFD9AE', sunIntensity: 0.75, night: 1 },
  { t: 0.9, sky: '#1F2A4A', hemiSky: '#FFE6C8', hemiGround: '#6A5C66', hemi: 1.2, sun: '#FFD9AE', sunIntensity: 0.75, night: 1 },
  { t: 0.96, sky: '#EDBBA6', hemiSky: '#F8D6C2', hemiGround: '#857B6E', hemi: 1.4, sun: '#FFCFA2', sunIntensity: 1.5, night: 0.3 },
  { t: 1.0, sky: '#F2E4C4', hemiSky: '#FFF6E8', hemiGround: '#A7B386', hemi: 1.55, sun: '#FFF0D8', sunIntensity: 2.1, night: 0 },
];

const a = new THREE.Color();
const b = new THREE.Color();

/** Sun direction (from the target toward the light): high, from the front-left, so walls cast short shadows. */
const SUN_OFFSET = new THREE.Vector3(-7, 16, -5);
/** Half-size of the shadow camera: covers what the portrait camera can see around its focus. */
const SHADOW_HALF = 12;

export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#FFF6E8', '#A7B386', 1.55);
  readonly sun = new THREE.DirectionalLight('#FFF0D8', 2.1);
  readonly fog = new THREE.Fog('#F2E4C4', 42, 110);
  readonly background = new THREE.Color('#F2E4C4');
  night = 0;
  private shadowTexel = (SHADOW_HALF * 2) / 1024;

  constructor(scene: THREE.Scene) {
    this.sun.position.copy(SUN_OFFSET);
    const shadow = this.sun.shadow;
    shadow.mapSize.set(1024, 1024);
    const cam = shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = 45;
    shadow.bias = -0.0006;
    shadow.normalBias = 0.025;
    shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    scene.background = this.background;
  }

  /** Shadows on or off (low-quality devices), and the shadow map size. */
  setShadows(enabled: boolean, size = 1024): void {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowTexel = (SHADOW_HALF * 2) / size;
    }
  }

  /**
   * Keeps the shadow camera centred on what the player sees. Snapped to whole shadow texels so shadows
   * never shimmer as the camera glides.
   */
  follow(focus: THREE.Vector3): void {
    const step = this.shadowTexel;
    const x = Math.round(focus.x / step) * step;
    const z = Math.round(focus.z / step) * step;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
    this.sun.target.updateMatrixWorld();
  }

  /** `t` in [0,1): position in the day cycle. */
  setTime(t: number): void {
    const time = ((t % 1) + 1) % 1;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= time) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const f = clamp01((time - k0.t) / Math.max(1e-6, k1.t - k0.t));
    this.mix(this.background, k0.sky, k1.sky, f);
    this.fog.color.copy(this.background);
    this.mix(this.hemi.color, k0.hemiSky, k1.hemiSky, f);
    this.mix(this.hemi.groundColor, k0.hemiGround, k1.hemiGround, f);
    this.hemi.intensity = lerp(k0.hemi, k1.hemi, f);
    this.mix(this.sun.color, k0.sun, k1.sun, f);
    this.sun.intensity = lerp(k0.sunIntensity, k1.sunIntensity, f);
    this.night = lerp(k0.night, k1.night, f);
    setNightAmount(this.night);
  }

  private mix(target: THREE.Color, from: string, to: string, f: number): void {
    a.set(from);
    b.set(to);
    target.copy(a).lerp(b, f);
  }
}
