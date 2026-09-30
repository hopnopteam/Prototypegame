import * as THREE from 'three';
import { VISUALS } from '../config/visuals';
import { clamp01, lerp } from '../core/math';
import { LIGHT_UNIFORMS, MAX_LAMPS, setNightAmount } from './materials';

interface Key {
  t: number;
  /** Background and fog colour. */
  sky: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  night: number;
  /** How strongly the sky is reflected (and fills the shade) on the physically based tiers. */
  env: number;
  fog: number;
}

const N = VISUALS.night;
const NIGHT_KEY = { sky: N.fog.color, hemiSky: N.hemi.sky, hemiGround: N.hemi.ground, hemi: N.hemi.intensity, sun: N.moon.color, sunIntensity: N.moon.intensity, night: 1, env: N.environment, fog: N.fog.density };
const DAY_KEY = { sky: '#DCE6EE', hemiSky: '#FFF8EC', hemiGround: '#8C9A78', hemi: 1.9, sun: '#FFF1DC', sunIntensity: 2.6, night: 0, env: 0.9, fog: 0.006 };

/**
 * Day → golden hour → dusk → night → dawn across a journey (VISUALS.time.mode 'cycle'). The default holds
 * the night key: the moonlit hero look.
 */
const KEYS: Key[] = [
  { t: 0.0, ...DAY_KEY },
  { t: 0.5, ...DAY_KEY },
  { t: 0.6, sky: '#F1D6BC', hemiSky: '#FFF0DC', hemiGround: '#948B78', hemi: 1.7, sun: '#FFD8AC', sunIntensity: 2.2, night: 0.05, env: 0.8, fog: 0.007 },
  { t: 0.68, sky: '#6F6E93', hemiSky: '#E8C9C4', hemiGround: '#4F4E62', hemi: 1.4, sun: '#FFB894', sunIntensity: 1.5, night: 0.5, env: 0.65, fog: 0.009 },
  { t: 0.75, ...NIGHT_KEY },
  { t: 0.9, ...NIGHT_KEY },
  { t: 0.96, sky: '#C9B2B4', hemiSky: '#F4DCD4', hemiGround: '#7C7672', hemi: 1.6, sun: '#FFD6BC', sunIntensity: 1.9, night: 0.3, env: 0.75, fog: 0.008 },
  { t: 1.0, ...DAY_KEY },
];

const a = new THREE.Color();
const b = new THREE.Color();

/** Moon (and sun) direction, from the target toward the light: high over the lake, a little ahead of the train. */
const LIGHT_OFFSET = new THREE.Vector3(-9, 16, -6);
/** Half-size of the shadow camera, and how far it is centred ahead of the focus along the view. */
const SHADOW_HALF = 14;
const SHADOW_LEAD = 3;

/** A lamp the lamp pools can use: a world position and a strength (1 = a room's ceiling light). */
export interface LampAnchor {
  x: number;
  y: number;
  z: number;
  strength: number;
}

/**
 * Warm pools of lamplight without dozens of real lights: every carriage (and the platform) registers its
 * lamps; each frame the ones nearest the camera are written into the shared lamp uniforms, fading out at
 * the edge of the chosen set so nothing pops as the view moves.
 */
class LampField {
  private readonly sources = new Map<string, { anchors: LampAnchor[]; dz: number }>();
  private readonly flat: { anchor: LampAnchor; source: { dz: number } }[] = [];
  private dirty = true;
  private readonly distances: number[] = [];
  private readonly order: number[] = [];
  private readonly tmp = new THREE.Vector3();

  set(key: string, anchors: LampAnchor[] | null, dz = 0): void {
    if (anchors && anchors.length > 0) this.sources.set(key, { anchors, dz });
    else this.sources.delete(key);
    this.dirty = true;
  }

  /** Slides a source along the line (the platform arriving and leaving) without rebuilding it. */
  offset(key: string, dz: number): void {
    const source = this.sources.get(key);
    if (source) source.dz = dz;
  }

  update(focus: THREE.Vector3, view: THREE.Matrix4, count: number, strength: number): void {
    if (this.dirty) {
      this.flat.length = 0;
      for (const source of this.sources.values()) for (const anchor of source.anchors) this.flat.push({ anchor, source });
      this.dirty = false;
    }
    const lamps = LIGHT_UNIFORMS.uNxLamps.value;
    const n = this.flat.length;
    this.distances.length = n;
    this.order.length = n;
    for (let i = 0; i < n; i++) {
      const { anchor, source } = this.flat[i];
      this.distances[i] = Math.hypot(anchor.x - focus.x, anchor.z + source.dz - focus.z);
      this.order[i] = i;
    }
    this.order.sort((i, j) => this.distances[i] - this.distances[j]);
    const used = Math.min(count, n, MAX_LAMPS);
    // The first lamp left out sets the edge: lamps near it fade to nothing, so swaps are invisible.
    const edge = n > used ? this.distances[this.order[used]] : Infinity;
    const fade = 3;
    for (let k = 0; k < MAX_LAMPS; k++) {
      const v = lamps[k];
      if (k >= used || strength <= 0) {
        v.w = 0;
        continue;
      }
      const { anchor, source } = this.flat[this.order[k]];
      const d = this.distances[this.order[k]];
      const w = Number.isFinite(edge) ? clamp01((edge - d) / fade) : 1;
      this.tmp.set(anchor.x, anchor.y, anchor.z + source.dz).applyMatrix4(view);
      v.set(this.tmp.x, this.tmp.y, this.tmp.z, anchor.strength * w * strength);
    }
  }
}

/**
 * Moonlight, sky fill, a reflected night sky for metal and polish, fog, and the lamp pools. One shadow-casting
 * light (the moon) with a tight frustum that follows the view.
 */
export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#FFF6E8', '#A7B386', 1.55);
  readonly sun = new THREE.DirectionalLight('#FFF0D8', 2.1);
  readonly fog = new THREE.FogExp2('#1E2A4A', 0.01);
  readonly background = new THREE.Color('#1E2A4A');
  readonly lamps = new LampField();
  night = 1;
  /** 0 open sky, 1 deep in a rock cutting: the moon and sky fill dim, the lamps carry on. */
  darkness = 0;
  private shadowTexel = (SHADOW_HALF * 2) / 1024;
  private envNight: THREE.Texture | null = null;
  private envDay: THREE.Texture | null = null;
  private envStrength = 0;
  private lampCount = 6;

  constructor(private readonly scene: THREE.Scene) {
    this.sun.position.copy(LIGHT_OFFSET);
    const shadow = this.sun.shadow;
    shadow.mapSize.set(1024, 1024);
    const cam = shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = 50;
    shadow.bias = -0.0006;
    shadow.normalBias = 0.025;
    shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    scene.background = this.background;
  }

  /**
   * Night and day skies for reflections, pre-filtered once. The night one is deep blue with a bright moon and a
   * few warm glows low down (the lamps of a village), so brass and varnish catch warm and cool highlights.
   */
  buildEnvironment(renderer: THREE.WebGLRenderer): void {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envNight = pmrem.fromScene(skyScene(true), 0.04).texture;
    this.envDay = pmrem.fromScene(skyScene(false), 0.04).texture;
    pmrem.dispose();
  }

  /** Reflections and sky fill on (physically based tiers) or off (the Lambert tier ignores them anyway). */
  setEnvironmentEnabled(on: boolean): void {
    this.envStrength = on ? 1 : 0;
    if (!on) this.scene.environment = null;
  }

  /** How many lamp pools the tier affords. */
  setLampCount(count: number): void {
    this.lampCount = count;
  }

  /** Shadows on or off, the map size, and how soft their edges are (PCF sampling radius in texels). */
  setShadows(enabled: boolean, size = 1024, radius = 2): void {
    this.sun.castShadow = enabled;
    this.sun.shadow.radius = radius;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowTexel = (SHADOW_HALF * 2) / size;
    }
  }

  /**
   * Keeps the shadow camera on what the player sees (a little ahead of the focus, where the view reaches
   * further), snapped to whole shadow texels so shadows never shimmer as the camera glides, and writes the
   * lamp pools nearest the view.
   */
  follow(focus: THREE.Vector3, viewDirection: THREE.Vector2, camera: THREE.Camera): void {
    const step = this.shadowTexel;
    const x = Math.round((focus.x + viewDirection.x * SHADOW_LEAD) / step) * step;
    const z = Math.round((focus.z + viewDirection.y * SHADOW_LEAD) / step) * step;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + LIGHT_OFFSET.x, LIGHT_OFFSET.y, z + LIGHT_OFFSET.z);
    this.sun.target.updateMatrixWorld();
    this.lamps.update(focus, camera.matrixWorldInverse, this.lampCount, this.night);
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
    this.fog.density = lerp(k0.fog, k1.fog, f);
    this.mix(this.hemi.color, k0.hemiSky, k1.hemiSky, f);
    this.mix(this.hemi.groundColor, k0.hemiGround, k1.hemiGround, f);
    this.hemi.intensity = lerp(k0.hemi, k1.hemi, f);
    this.mix(this.sun.color, k0.sun, k1.sun, f);
    this.sun.intensity = lerp(k0.sunIntensity, k1.sunIntensity, f) * (1 - 0.7 * this.darkness);
    this.hemi.intensity *= 1 - 0.45 * this.darkness;
    this.night = lerp(k0.night, k1.night, f);
    if (this.envStrength > 0 && this.envNight && this.envDay) {
      this.scene.environment = this.night > 0.5 ? this.envNight : this.envDay;
      this.scene.environmentIntensity = lerp(k0.env, k1.env, f) * this.envStrength;
    }
    const interior = VISUALS.night.interior;
    LIGHT_UNIFORMS.uNxInterior.value.set(interior.color).multiplyScalar(interior.intensity * this.night);
    LIGHT_UNIFORMS.uNxLampColor.value.set(VISUALS.night.lamp.color);
    LIGHT_UNIFORMS.uNxLampRadius.value = VISUALS.night.lamp.radius;
    setNightAmount(this.night);
  }

  private mix(target: THREE.Color, from: string, to: string, f: number): void {
    a.set(from);
    b.set(to);
    target.copy(a).lerp(b, f);
  }
}

/** A tiny sky for the environment map: a gradient dome, the moon (or sun) and a few glows. */
function skyScene(night: boolean): THREE.Scene {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const colors = new Float32Array(dome.getAttribute('position').count * 3);
  const pos = dome.getAttribute('position');
  const zenith = new THREE.Color(night ? '#0B1330' : '#7FA6D6');
  const horizon = new THREE.Color(night ? '#2E4478' : '#E8EEF2');
  const below = new THREE.Color(night ? '#0A0C14' : '#8A9278');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y >= 0) c.copy(horizon).lerp(zenith, Math.pow(y, 0.6));
    else c.copy(horizon).lerp(below, Math.min(1, -y * 3));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const light = LIGHT_OFFSET.clone().normalize().multiplyScalar(9);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(night ? 0.7 : 1.1, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(night ? '#E6EEFF' : '#FFF6E0').multiplyScalar(night ? 10 : 14) }));
  disc.position.copy(light);
  scene.add(disc);
  if (night) {
    // Warm village lights low on the horizon: brass and varnish pick these up.
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2 + 0.4;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB066').multiplyScalar(2.2) }));
      glow.position.set(Math.cos(angle) * 9, 0.6 + (k % 2) * 0.8, Math.sin(angle) * 9);
      scene.add(glow);
    }
  }
  return scene;
}
