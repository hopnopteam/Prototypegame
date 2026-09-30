import * as THREE from 'three';
import type { PreRender } from './Stage';

/** Objects on this layer are mirrored in the lake (the train's lake side, shore trees, lighthouse, pier). */
export const REFLECT_LAYER = 2;

/** Where the moon hangs in the painted sky (screen space, 0..1 from the top left); the moon path lies under it. */
export const MOON_UV = new THREE.Vector2(0.14, 0.055);

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
uniform vec3 uSky;
uniform vec3 uMist;
uniform vec2 uMistX;
uniform vec3 uMoon;
uniform vec2 uMoonUv;
uniform vec2 uResolution;
uniform float uNight;
uniform sampler2D uReflection;
uniform float uReflect;
varying vec3 vWorld;
varying vec4 vReflect;
#include <common>
#include <fog_pars_fragment>

// Small ripples that drift past the train (the water is still; the train moves).
vec2 ripples(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(cos(p.x * 1.7 + t * 1.1), cos(p.y * 1.3 - t * 0.9)) * 0.5;
  g += vec2(cos(p.x * 3.1 - p.y * 1.9 + t * 1.7), cos(p.y * 2.7 + p.x * 1.2 + t * 1.3)) * 0.28;
  g += vec2(cos(p.x * 6.3 + p.y * 4.1 - t * 2.3), cos(p.y * 5.9 - p.x * 3.7 + t * 2.9)) * 0.14;
  return g;
}

float hash2(vec2 q) { return fract(sin(dot(q, vec2(41.3, 289.1))) * 43758.5453); }
float valueNoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = vec2(vWorld.x, vWorld.z - uScroll);
  vec2 g = ripples(p, uTime);
  vec3 normal = normalize(vec3(-g.x * 0.12, 1.0, -g.y * 0.12));
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 4.0);

  // Shallow and a little lighter near the banks, deep out in the lake.
  float deep = smoothstep(-3.0, -7.5, vWorld.x) * 0.8 + 0.2;
  vec3 color = mix(uShallow, uDeep, deep);

  // The sky (or, on high tiers, the real mirror image of the shore and the train) in the water.
  vec3 sky = uSky;
  if (uReflect > 0.5) {
    vec4 r = vReflect;
    r.xy += normal.xz * 0.35 * r.w;
    vec3 mirror = texture2DProj(uReflection, r).rgb;
    sky = mix(uSky, mirror, 0.85);
  }
  color = mix(color, sky, 0.18 + 0.7 * fresnel);

  // The moon path: a narrow column under the moon made of short horizontal glints (wave crests catching
  // the light), in screen space so they always lie level whatever the camera angle.
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;
  float below = uv.y - uMoonUv.y;
  if (below > 0.0) {
    float aspect = uResolution.x / uResolution.y;
    float width = 0.006 + below * 0.05;
    float across = (uv.x - uMoonUv.x + g.x * 0.006) * aspect;
    float column = exp(-(across * across) / (width * width));
    float along = smoothstep(0.03, 0.14, below) * (1.0 - smoothstep(0.3, 0.62, below));
    vec2 q = vec2(uv.x * 70.0, uv.y * 360.0) + vec2(uTime * 0.7, uTime * 2.2) + g * 1.5;
    float dash = smoothstep(0.7, 0.95, valueNoise(q));
    color += uMoon * column * along * (0.12 + 1.3 * dash) * uNight;
  }

  // Mist over the far water: it melts into the painted distance behind.
  float mist = smoothstep(uMistX.x, uMistX.y, -vWorld.x);
  color = mix(color, uMist, mist);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * The lake: one big still plane under everything (land covers it where there is land). Ripples drift with
 * the scenery, the sky (or a real mirror image on HIGH and ULTRA) shows at grazing angles, the moon lays a
 * path of sparkles across it, and mist swallows the far side where the painted backdrop takes over.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(x0: number, x1: number, z0: number, z1: number) {
    this.material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uScroll: { value: 0 },
          uDeep: { value: new THREE.Color('#0B1A36') },
          uShallow: { value: new THREE.Color('#1B3152') },
          uSky: { value: new THREE.Color('#34507F') },
          uMist: { value: new THREE.Color('#26375E') },
          uMistX: { value: new THREE.Vector2(6.2, 8.4) },
          uMoon: { value: new THREE.Color('#DCE6FF').multiplyScalar(1.6) },
          uMoonUv: { value: MOON_UV.clone() },
          uResolution: { value: new THREE.Vector2(390, 844) },
          uNight: { value: 1 },
          uReflection: { value: null },
          uReflect: { value: 0 },
          uReflectMatrix: { value: new THREE.Matrix4() },
        },
      ]),
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
    });
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.userData.object = 'scenery:water';
  }

  update(dt: number, scroll: number, night: number, resolution: { width: number; height: number }): void {
    const u = this.material.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 1000;
    u.uScroll.value = scroll % 2000;
    u.uNight.value = night;
    u.uResolution.value.set(resolution.width, resolution.height);
  }

  /** Day or night colours (the cycle), mixed by the night amount. */
  setColors(deep: THREE.Color, shallow: THREE.Color, sky: THREE.Color, mist: THREE.Color): void {
    const u = this.material.uniforms;
    u.uDeep.value.copy(deep);
    u.uShallow.value.copy(shallow);
    u.uSky.value.copy(sky);
    u.uMist.value.copy(mist);
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
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, m);
    renderer.setRenderTarget(current);
    renderer.shadowMap.autoUpdate = autoShadow;
    this.water.mesh.visible = visible;
  }
}
