import * as THREE from 'three';
import { LIGHT_UNIFORMS } from './materials';
import type { PreRender } from './Stage';
import { SHORE_GLSL, WORLD_PERIOD } from './terrain';

/** Objects on this layer are mirrored in the lake (the train's lake side, shore trees, lighthouse, pier). */
export const REFLECT_LAYER = 2;

const WATER_VERTEX = /* glsl */ `
uniform mat4 uReflectMatrix;
varying vec3 vWorld;
varying vec4 vReflect;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vReflect = uReflectMatrix * world;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uBed;
uniform vec3 uFoam;
uniform vec3 uHaze;
uniform float uNight;
uniform sampler2D uReflection;
uniform float uReflect;
uniform sampler2D uNxLightMap;
uniform vec4 uNxLightBox;
uniform sampler2D uNxPlatMap;
uniform vec4 uNxPlatBox;
uniform float uNxLightOn;
uniform vec3 uNxSkyZenith;
uniform vec3 uNxSkyHorizon;
uniform vec3 uNxSkyGround;
uniform vec3 uNxMoonDir;
uniform vec3 uNxMoonColor;
varying vec3 vWorld;
varying vec4 vReflect;
#include <common>
#include <fog_pars_fragment>
${SHORE_GLSL}

// Noise that repeats every "period" cells along y, so it stays seamless when the scroll wraps.
float hash2(vec2 q, float period) { q.y = mod(q.y, period); return fract(sin(dot(q, vec2(41.3, 289.1))) * 43758.5453); }
float valueNoise(vec2 q, float period) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i, period), hash2(i + vec2(1.0, 0.0), period), u.x), mix(hash2(i + vec2(0.0, 1.0), period), hash2(i + vec2(1.0, 1.0), period), u.x), u.y);
}
// Wave numbers along the line are whole cycles per world period (see terrain.ts).
#define NX_KZ(n) (6.2831853 * (n) / ${WORLD_PERIOD.toFixed(1)})

// Small waves: a few directional swells (in scroll space, so they pass with the scenery) plus a fine chop.
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 k1 = vec2(1.28, NX_KZ(367.0));
  vec2 k2 = vec2(-1.35, NX_KZ(889.0));
  vec2 k3 = vec2(1.07, -NX_KZ(1593.0));
  g += normalize(k1) * cos(dot(p, k1) + t * 1.2) * 0.035;
  g += normalize(k2) * cos(dot(p, k2) - t * 1.6) * 0.025;
  g += normalize(k3) * cos(dot(p, k3) + t * 2.1) * 0.018;
  vec2 q = p * 2.2 + vec2(t * 0.35, 0.0);
  float period = ${(WORLD_PERIOD * 2.2).toFixed(1)};
  float n0 = valueNoise(q, period);
  g += (vec2(valueNoise(q + vec2(0.4, 0.0), period), valueNoise(q + vec2(0.0, 0.4), period)) - n0) * 0.07;
  return g;
}

vec3 nightSky(vec3 r) {
  vec3 sky = mix(uNxSkyHorizon, uNxSkyZenith, smoothstep(0.05, 0.85, r.y));
  return mix(uNxSkyGround, sky, smoothstep(-0.25, 0.04, r.y));
}

void main() {
  vec2 p = vec2(vWorld.x, vWorld.z - uScroll);
  // How far out from the bank (metres): the same shoreline the ground was built from.
  float depth = nxShoreX(p.y) - vWorld.x;
  vec2 g = waveGrad(p, uTime);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 5.0);

  // The bed shows through the shallows; the lake deepens to ink a few metres out.
  vec3 water = mix(uShallow, uDeep, smoothstep(0.4, 7.0, depth));
  vec3 color = mix(uBed, water, 1.0 - exp(-max(depth, 0.0) * 1.1));

  // The night sky in the water (a little held up: from this high the true fresnel would all but hide it).
  vec3 r = reflect(-view, n);
  color = mix(color, nightSky(r), clamp(0.1 + fresnel * 0.9, 0.0, 1.0));
  if (uReflect > 0.5) {
    vec4 rp = vReflect;
    rp.xy += g * 0.06 * rp.w;
    vec4 mirror = texture2DProj(uReflection, rp);
    color = mix(color, mirror.rgb, mirror.a * (0.45 + 0.45 * fresnel));
  }

  // Moonlight glittering on the wave faces that tilt toward it: where it lands follows the real moon.
  // A soft broad sheen where the moon reflects, and fine sparkles riding the wave crests inside it.
  float facing = max(dot(r, uNxMoonDir), 0.0);
  float sheen = pow(facing, 24.0) * 0.22;
  float sparkle = smoothstep(0.72, 0.98, valueNoise(p * 7.0 + vec2(uTime * 1.3, 0.0), ${(WORLD_PERIOD * 7).toFixed(1)}));
  float glint = pow(facing, 160.0) * (0.4 + 2.2 * sparkle);
  color += uNxMoonColor * (sheen + glint) * uNight;

  // The train's warm windows and the platform lamps, rippling on the surface (the baked light map).
  vec2 q = vWorld.xz + g * vec2(1.6, 0.6);
  vec3 spill = texture2D(uNxLightMap, q * uNxLightBox.xz + uNxLightBox.yw).rgb + texture2D(uNxPlatMap, q * uNxPlatBox.xz + uNxPlatBox.yw).rgb;
  color += spill * uNxLightOn * (0.7 + 0.6 * sparkle);

  // A soft line of foam where the water meets the bank.
  float lap = 0.5 + 0.5 * sin(uTime * 1.4 + p.y * NX_KZ(344.0));
  float foam = (1.0 - smoothstep(0.0, 0.32 + lap * 0.12, depth)) * (0.45 + 0.55 * valueNoise(p * 5.0 + vec2(uTime * 0.6, 0.0), ${(WORLD_PERIOD * 5).toFixed(1)}));
  color = mix(color, uFoam, foam * 0.55);

  // Far out, the lake softens into the night haze (it goes on beyond what the camera can see).
  color = mix(color, uHaze, smoothstep(9.0, 26.0, depth) * 0.55);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * The lake: one big plane under everything (the ground covers it where there is land), stretching far past
 * anything the camera can see so it never ends. Depth comes from the same shoreline the ground is built
 * from (terrain.ts), so the shallows, the foam and the deep water always line up with the bank.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(x0: number, x1: number, z0: number, z1: number) {
    const u = LIGHT_UNIFORMS;
    this.material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uDeep: { value: new THREE.Color('#18234E') },
        uShallow: { value: new THREE.Color('#2E6380') },
        uBed: { value: new THREE.Color('#6F7C76') },
        uFoam: { value: new THREE.Color('#B9C6D8') },
        uHaze: { value: new THREE.Color('#3A4178') },
        uNight: { value: 1 },
        uReflection: { value: null },
        uReflect: { value: 0 },
        uReflectMatrix: { value: new THREE.Matrix4() },
        // Shared with every lit material (the same objects), so the water always sees the current light.
        uNxLightMap: u.uNxLightMap,
        uNxLightBox: u.uNxLightBox,
        uNxPlatMap: u.uNxPlatMap,
        uNxPlatBox: u.uNxPlatBox,
        uNxLightOn: u.uNxLightOn,
        uNxSkyZenith: u.uNxSkyZenith,
        uNxSkyHorizon: u.uNxSkyHorizon,
        uNxSkyGround: u.uNxSkyGround,
        uNxMoonDir: u.uNxMoonDir,
        uNxMoonColor: u.uNxMoonColor,
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
    });
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.object = 'scenery:water';
  }

  update(dt: number, scroll: number, night: number): void {
    const u = this.material.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 1000;
    // Wrapped for float precision; everything along the line repeats every WORLD_PERIOD, so no jump shows.
    u.uScroll.value = ((scroll % WORLD_PERIOD) + WORLD_PERIOD) % WORLD_PERIOD;
    u.uNight.value = night;
  }
}

/**
 * A mirror image of the scene under the lake's surface, rendered at a reduced size before the main pass
 * (HIGH and ULTRA only). Only REFLECT_LAYER objects are drawn into it, with an oblique near plane at the
 * water line so nothing below the surface shows.
 */
export class PlanarReflection implements PreRender {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly mirror = new THREE.PerspectiveCamera();
  private readonly textureMatrix = new THREE.Matrix4();
  private readonly plane = new THREE.Plane();
  private readonly clip = new THREE.Vector4();
  private readonly q = new THREE.Vector4();
  private readonly tmp = new THREE.Vector3();
  private readonly target3 = new THREE.Vector3();
  private readonly clearColor = new THREE.Color();

  constructor(private readonly water: Water, private scale: number) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.mirror.layers.set(REFLECT_LAYER);
    const u = water.material.uniforms;
    u.uReflection.value = this.target.texture;
    u.uReflectMatrix.value = this.textureMatrix;
    u.uReflect.value = 1;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  dispose(): void {
    this.target.dispose();
    const u = this.water.material.uniforms;
    u.uReflect.value = 0;
    u.uReflection.value = null;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(4, Math.round(size.x * this.scale));
    const h = Math.max(4, Math.round(size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    // Mirror the camera in the water plane (y = 0).
    const m = this.mirror;
    m.position.copy(camera.position);
    m.position.y = -camera.position.y;
    this.tmp.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    this.target3.copy(this.tmp);
    this.target3.y = -this.tmp.y;
    m.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    m.up.y = -m.up.y;
    m.lookAt(this.target3);
    m.near = camera.near;
    m.far = camera.far;
    m.updateMatrixWorld();
    m.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);

    // Oblique near plane on the water line (Lengyel), so the lake bed and anything under it never show.
    this.plane.setFromNormalAndCoplanarPoint(this.tmp.set(0, 1, 0), this.target3.set(0, 0, 0));
    this.plane.applyMatrix4(m.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const p = m.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + p[8]) / p[0], (Math.sign(this.clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    p[2] = this.clip.x;
    p[6] = this.clip.y;
    p[10] = this.clip.z + 1 - 0.003;
    p[14] = this.clip.w;

    const visible = this.water.mesh.visible;
    this.water.mesh.visible = false;
    const current = renderer.getRenderTarget();
    const autoShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    // Clear to transparent: only mirrored objects cover the water, the rest keeps its own sky tint.
    const background = scene.background;
    const fog = scene.fog;
    scene.background = null;
    renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, m);
    renderer.setClearColor(this.clearColor, clearAlpha);
    scene.background = background;
    scene.fog = fog;
    renderer.setRenderTarget(current);
    renderer.shadowMap.autoUpdate = autoShadow;
    this.water.mesh.visible = visible;
  }
}
