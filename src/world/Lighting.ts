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

/** A day → golden hour → dusk → night → dawn loop across the journey. */
const KEYS: Key[] = [
  { t: 0.0, sky: '#F4E2B4', hemiSky: '#FFF4DC', hemiGround: '#8FA06A', hemi: 1.75, sun: '#FFF1D6', sunIntensity: 2.4, night: 0 },
  { t: 0.42, sky: '#F4E2B4', hemiSky: '#FFF4DC', hemiGround: '#8FA06A', hemi: 1.75, sun: '#FFF1D6', sunIntensity: 2.4, night: 0 },
  { t: 0.56, sky: '#F6C98A', hemiSky: '#FFE2B0', hemiGround: '#9A8660', hemi: 1.6, sun: '#FFC27A', sunIntensity: 2.1, night: 0.05 },
  { t: 0.66, sky: '#E48E77', hemiSky: '#F4B49A', hemiGround: '#6E5E62', hemi: 1.4, sun: '#FF9A6A', sunIntensity: 1.4, night: 0.45 },
  { t: 0.74, sky: '#22304F', hemiSky: '#7D8FC4', hemiGround: '#39394F', hemi: 1.35, sun: '#AFC2F0', sunIntensity: 0.8, night: 1 },
  { t: 0.9, sky: '#22304F', hemiSky: '#7D8FC4', hemiGround: '#39394F', hemi: 1.35, sun: '#AFC2F0', sunIntensity: 0.8, night: 1 },
  { t: 0.96, sky: '#E8B39A', hemiSky: '#F7D2B8', hemiGround: '#7E7466', hemi: 1.55, sun: '#FFCB9A', sunIntensity: 1.6, night: 0.3 },
  { t: 1.0, sky: '#F4E2B4', hemiSky: '#FFF4DC', hemiGround: '#8FA06A', hemi: 1.75, sun: '#FFF1D6', sunIntensity: 2.4, night: 0 },
];

const a = new THREE.Color();
const b = new THREE.Color();

export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#FFF4DC', '#8FA06A', 1.75);
  readonly sun = new THREE.DirectionalLight('#FFF1D6', 2.4);
  readonly fog = new THREE.Fog('#F4E2B4', 45, 120);
  readonly background = new THREE.Color('#F4E2B4');
  night = 0;

  constructor(scene: THREE.Scene) {
    this.sun.position.set(-10, 18, 9);
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    scene.background = this.background;
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
