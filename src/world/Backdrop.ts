import * as THREE from 'three';
import { MOON_UV } from './Water';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // A full-screen card on the far plane: drawn first, behind everything.
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uLayers;
uniform float uHorizon;
uniform vec2 uMoonUv;
uniform float uNight;
uniform vec3 uZenith;
uniform vec3 uGlow;
uniform vec3 uMist;
uniform vec3 uFar;
uniform vec3 uMid;
uniform vec3 uNear;
uniform vec3 uSnow;
uniform vec3 uMoonColor;
varying vec2 vUv;
#include <common>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 1.7)), hash(vec2(i + 1.0, 1.7)), u);
}
// A ridge line: a few octaves of noise, with sharp-ish peaks.
float ridge(float x, float seed) {
  float h = 0.0;
  float a = 0.55;
  float f = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = noise(x * f + seed * 13.1);
    h += a * (1.0 - abs(n * 2.0 - 1.0));
    a *= 0.5;
    f *= 2.1;
  }
  return h;
}

void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  float aspect = uResolution.x / uResolution.y;
  vec2 px = vec2(s.x * aspect, s.y);

  // Sky: deep at the top, a soft glow toward the horizon, brightest around the moon.
  float toHorizon = clamp(s.y / max(uHorizon, 0.01), 0.0, 1.0);
  vec3 color = mix(uZenith, uGlow, pow(toHorizon, 1.6));
  vec2 m = vec2(uMoonUv.x * aspect, uMoonUv.y);
  float d = length(px - m);
  color += uMoonColor * (0.14 * exp(-d * 14.0) + 0.05 * exp(-d * 4.0)) * uNight;

  // Stars, twinkling, thinning toward the horizon.
  vec2 cell = floor(px * 90.0);
  float star = hash(cell);
  if (star > 0.985) {
    vec2 c = (cell + vec2(hash(cell + 3.1), hash(cell + 7.7))) / 90.0;
    float r = length(px - c) * 90.0;
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + star * 4.0) + star * 40.0);
    color += vec3(0.85, 0.9, 1.0) * smoothstep(0.35, 0.0, r) * twinkle * (1.0 - toHorizon * 0.8) * uNight * 1.6;
  }

  // The moon: a bright disc with a faint face.
  float disc = smoothstep(0.021, 0.018, d);
  float face = 0.9 + 0.1 * noise(px.x * 90.0 + px.y * 60.0);
  color = mix(color, uMoonColor * 1.5 * face, disc * uNight);

  // Mountains in three layers, the far ones pale with haze, drifting slower than the near ones.
  float farH = uHorizon - 0.13 * ridge(s.x * 1.8 + uLayers.x, 1.0) - 0.012;
  float midH = uHorizon - 0.075 * ridge(s.x * 3.0 + uLayers.y, 2.0) + 0.004;
  float nearH = uHorizon - 0.03 * ridge(s.x * 5.8 + uLayers.z, 3.0) + 0.014;
  float aa = 1.5 / uResolution.y;
  float farMask = smoothstep(farH - aa, farH + aa, s.y);
  vec3 far = mix(uFar, uSnow, smoothstep(farH + 0.025, farH, s.y) * step(0.58, ridge(s.x * 1.8 + uLayers.x, 1.0)));
  color = mix(color, far, farMask);
  color = mix(color, uMid, smoothstep(midH - aa, midH + aa, s.y));
  // The near ridge is the far shore's pines: a dark serrated line, with the lights of a village.
  float teeth = 0.006 * abs(sin(s.x * 260.0 + uLayers.z * 40.0));
  float nearLine = nearH - teeth;
  float nearMask = smoothstep(nearLine - aa, nearLine + aa, s.y);
  color = mix(color, uNear, nearMask);
  float lights = step(0.975, hash(vec2(floor((s.x + uLayers.z * 0.172) * 140.0), 5.0)));
  float lightRow = smoothstep(0.004, 0.0, abs(s.y - (nearH + 0.012)));
  color += vec3(1.0, 0.72, 0.38) * lights * lightRow * 2.2 * uNight;

  // Below the shore: mist on the far water.
  float mist = smoothstep(nearH + 0.01, nearH + 0.05, s.y);
  color = mix(color, uMist, mist);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The painted distance behind the lake: sky, stars and moon, three ranges of mountains and the dark pines
 * of the far shore with a village's lights, sinking into mist. A full-screen card drawn before everything,
 * so the real world covers it wherever there is world: it shows only past the far edge of the water (top
 * left). The camera never looks up at a horizon; this is how the lake still has one. The ranges drift at
 * different speeds as the train runs (parallax) and shift a little with the camera.
 */
export class Backdrop {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private scroll = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(390, 844) },
        uTime: { value: 0 },
        uLayers: { value: new THREE.Vector3() },
        uHorizon: { value: 0.2 },
        uMoonUv: { value: MOON_UV.clone() },
        uNight: { value: 1 },
        uZenith: { value: new THREE.Color('#0A1230') },
        uGlow: { value: new THREE.Color('#2B4273') },
        uMist: { value: new THREE.Color('#26375E') },
        uFar: { value: new THREE.Color('#4A5F8E') },
        uMid: { value: new THREE.Color('#2C3D66') },
        uNear: { value: new THREE.Color('#141E36') },
        uSnow: { value: new THREE.Color('#9FB2DA') },
        uMoonColor: { value: new THREE.Color('#E4ECFF') },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.userData.object = 'scenery:backdrop';
  }

  /**
   * `distance` is how far the train has run (metres); `focus` is where the camera looks (the ranges shift
   * a touch with it, far less than the real world does, so they read as far away).
   */
  update(dt: number, dz: number, focus: THREE.Vector3, night: number, resolution: { width: number; height: number }, horizon: number): void {
    this.scroll += dz;
    const u = this.material.uniforms;
    u.uTime.value = (u.uTime.value + dt) % 1000;
    // The train runs toward the top right, so the distance slides left; far ranges barely move.
    const s = this.scroll % 20000;
    u.uLayers.value.set(s * 0.0004 + focus.z * 0.0008, s * 0.0011 + focus.z * 0.002, s * 0.0028 + focus.z * 0.004);
    u.uNight.value = night;
    u.uHorizon.value = horizon;
    u.uResolution.value.set(resolution.width, resolution.height);
  }
}
