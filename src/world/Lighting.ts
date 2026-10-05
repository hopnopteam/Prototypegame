import * as THREE from 'three';
import { VISUALS } from '../config/visuals';
import { clamp01, lerp } from '../core/math';
import { LIGHT_UNIFORMS, setNightAmount } from './materials';

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
/** The fill comes from where the camera stands (the land side, behind the train), a little above. */
const FILL_OFFSET = new THREE.Vector3(9, 6, 12);
/** Half-size of the shadow camera, and how far it is centred ahead of the focus along the view. */
const SHADOW_HALF = 14;
const SHADOW_LEAD = 3;

/**
 * Static shadows (session 18, the phone tiers): the train never moves under the moon, so one shadow map covers
 * the whole train and is drawn again only when the train changes (a carriage built, refitted or coupled, a room
 * opened). Only the train's fixed parts cast into it (they are put on this layer); people keep their soft blob
 * shadows. The per-frame shadow pass, half of every other frame on a phone, is gone.
 */
export const STATIC_CASTER_LAYER = 3;
/** Static map: texel size along and across the train (metres), the largest side, and a margin round the train. */
const STATIC_TEXEL = 0.035;
const STATIC_MAX_SIZE = 4096;
const STATIC_MARGIN = 1.5;
/** The train's extent across (x) and its tallest point (the locomotive's chimney), for the static frustum. */
const TRAIN_HALF_X = 3.4;
const TRAIN_TOP = 4.6;

/** A lamp in a carriage or on the platform: a world position and a strength (1 = a room's ceiling light). */
export interface LampAnchor {
  x: number;
  y: number;
  z: number;
  strength: number;
}

/**
 * Moonlight, sky fill, a reflected night sky for metal and polish, and fog (lamplight is baked: LightMap). One shadow-casting
 * light (the moon) with a tight frustum that follows the view.
 */
export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#FFF6E8', '#A7B386', 1.55);
  readonly sun = new THREE.DirectionalLight('#FFF0D8', 2.1);
  /**
   * A soft, shadowless fill from the camera's side: moonlight bouncing off the platform and the lake. Without
   * it the sides of the carriages that face the camera (their liveries, the passengers' faces) sit in shadow.
   */
  readonly fill = new THREE.DirectionalLight('#B9C9FF', 0.6);
  readonly fog = new THREE.FogExp2('#1E2A4A', 0.01);
  readonly background = new THREE.Color('#1E2A4A');
  night = 1;
  /** 0 open sky, 1 deep in a rock cutting: the moon and sky fill dim, the lamps carry on. */
  darkness = 0;
  private shadowTexel = (SHADOW_HALF * 2) / 1024;
  /** 'follow': a tight frustum on the view, redrawn on the tier's cadence; 'static': the whole train, redrawn on change. */
  shadowMode: 'follow' | 'static' = 'follow';
  /** Static mode: the map must be redrawn (the train changed). */
  private staticDirty = true;
  private trainZ: [number, number] = [-12, 16];
  private maxTexture = STATIC_MAX_SIZE;
  private readonly corner = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sun.position.copy(LIGHT_OFFSET);
    LIGHT_UNIFORMS.uNxMoonDir.value.copy(LIGHT_OFFSET).normalize();
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
    scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    scene.fog = this.fog;
    scene.background = this.background;
  }

  /**
   * Shadows: off, following the view (`size` square map, redrawn on the tier's cadence) or static (the whole
   * train, redrawn when it changes); `radius` is how soft their edges are (PCF sampling radius in texels).
   */
  setShadows(mode: 'off' | 'follow' | 'static', size = 1024, radius = 2, maxTexture = STATIC_MAX_SIZE): void {
    this.sun.castShadow = mode !== 'off';
    this.sun.shadow.radius = radius;
    this.maxTexture = Math.min(STATIC_MAX_SIZE, maxTexture);
    this.shadowMode = mode === 'static' ? 'static' : 'follow';
    const cam = this.sun.shadow.camera;
    // Static: only the train's fixed parts cast; following: everything that casts (people included).
    cam.layers.set(mode === 'static' ? STATIC_CASTER_LAYER : 0);
    if (mode === 'static') {
      cam.up.set(0, 0, 1);
      this.staticDirty = true;
      return;
    }
    cam.up.set(0, 1, 0);
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = 50;
    cam.updateProjectionMatrix();
    this.setMapSize(size, size);
    this.shadowTexel = (SHADOW_HALF * 2) / size;
  }

  private setMapSize(width: number, height: number): void {
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x === width && shadow.mapSize.y === height) return;
    shadow.mapSize.set(width, height);
    shadow.map?.dispose();
    shadow.map = null;
  }

  /** The train's length changed (front and rear in z), or something on it that casts did: redraw static shadows. */
  setTrainSpan(z0: number, z1: number): void {
    if (Math.abs(z0 - this.trainZ[0]) > 1e-3 || Math.abs(z1 - this.trainZ[1]) > 1e-3) {
      this.trainZ = [z0, z1];
      this.staticDirty = true;
    }
  }

  /** Something that casts into the static map changed (a carriage built or refitted, a bed or a fixture shown). */
  invalidateShadows(): void {
    this.staticDirty = true;
  }

  /** Static mode: true once when the map must be redrawn (and fits the frustum round the train first). */
  takeStaticRedraw(): boolean {
    if (this.shadowMode !== 'static' || !this.staticDirty || !this.sun.castShadow) return false;
    this.staticDirty = false;
    this.fitStatic();
    return true;
  }

  /** Aims the moon at the middle of the train and fits an orthographic frustum round all of it (train along y). */
  private fitStatic(): void {
    const [z0, z1] = this.trainZ;
    const cz = (z0 + z1) / 2;
    this.sun.target.position.set(0, 0, cz);
    this.sun.position.set(LIGHT_OFFSET.x, LIGHT_OFFSET.y, cz + LIGHT_OFFSET.z);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
    const cam = this.sun.shadow.camera;
    cam.position.copy(this.sun.position);
    cam.lookAt(this.sun.target.position);
    cam.updateMatrixWorld();
    const inverse = cam.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const x of [-TRAIN_HALF_X, TRAIN_HALF_X]) for (const y of [-0.5, TRAIN_TOP]) for (const z of [z0, z1]) {
      const p = this.corner.set(x, y, z).applyMatrix4(inverse);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    cam.left = minX - STATIC_MARGIN;
    cam.right = maxX + STATIC_MARGIN;
    cam.bottom = minY - STATIC_MARGIN;
    cam.top = maxY + STATIC_MARGIN;
    // Light-space depth runs along -z; receivers below the train (ground, platform, water) stay inside.
    cam.near = Math.max(0.1, -maxZ - 4);
    cam.far = -minZ + 12;
    cam.updateProjectionMatrix();
    const pow2 = (v: number): number => Math.min(this.maxTexture, 2 ** Math.ceil(Math.log2(Math.max(64, v))));
    this.setMapSize(pow2((cam.right - cam.left) / STATIC_TEXEL), pow2((cam.top - cam.bottom) / STATIC_TEXEL));
  }

  /**
   * Keeps the shadow camera on what the player sees (a little ahead of the focus, where the view reaches
   * further), snapped to whole shadow texels so shadows never shimmer as the camera glides.
   */
  follow(focus: THREE.Vector3, viewDirection: THREE.Vector2): void {
    this.fill.target.position.set(focus.x, 0, focus.z);
    this.fill.position.set(focus.x + FILL_OFFSET.x, FILL_OFFSET.y, focus.z + FILL_OFFSET.z);
    this.fill.target.updateMatrixWorld();
    // A static map stays on the train (fitStatic aims the moon).
    if (this.shadowMode === 'static') return;
    const step = this.shadowTexel;
    const x = Math.round((focus.x + viewDirection.x * SHADOW_LEAD) / step) * step;
    const z = Math.round((focus.z + viewDirection.y * SHADOW_LEAD) / step) * step;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + LIGHT_OFFSET.x, LIGHT_OFFSET.y, z + LIGHT_OFFSET.z);
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
    this.fog.density = lerp(k0.fog, k1.fog, f);
    this.mix(this.hemi.color, k0.hemiSky, k1.hemiSky, f);
    this.mix(this.hemi.groundColor, k0.hemiGround, k1.hemiGround, f);
    this.hemi.intensity = lerp(k0.hemi, k1.hemi, f);
    this.mix(this.sun.color, k0.sun, k1.sun, f);
    this.sun.intensity = lerp(k0.sunIntensity, k1.sunIntensity, f) * (1 - 0.7 * this.darkness);
    this.hemi.intensity *= 1 - 0.45 * this.darkness;
    this.fill.color.copy(this.sun.color);
    this.fill.intensity = VISUALS.night.fill * (0.4 + 0.6 * lerp(k0.night, k1.night, f)) * (1 - 0.5 * this.darkness);
    this.night = lerp(k0.night, k1.night, f);
    // The sky that polished surfaces reflect (analytic: see nxSky in materials.ts).
    const u = LIGHT_UNIFORMS;
    const sky = VISUALS.night.sky;
    a.set('#7FA6D6');
    u.uNxSkyZenith.value.set(sky.zenith).lerp(a, 1 - this.night);
    a.set('#E8EEF2');
    u.uNxSkyHorizon.value.set(sky.horizon).lerp(a, 1 - this.night);
    a.set('#8A9278');
    u.uNxSkyGround.value.set(sky.ground).lerp(a, 1 - this.night);
    u.uNxMoonColor.value.copy(this.sun.color).multiplyScalar(this.night > 0.5 ? 1.2 : 1.6);
    u.uNxSkyAmount.value = lerp(k0.env, k1.env, f);
    setNightAmount(this.night);
  }

  private mix(target: THREE.Color, from: string, to: string, f: number): void {
    a.set(from);
    b.set(to);
    target.copy(a).lerp(b, f);
  }
}
