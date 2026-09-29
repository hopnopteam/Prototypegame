import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Pattern ids painted by the shared "patterned" material. Patterns are computed in the fragment shader from
 * object-space position (no textures, crisp at any resolution, anti-aliased with screen derivatives), with
 * a second colour carried per vertex. One material draws every wallpaper, carpet, checker and parquet.
 */
export const PATTERN = {
  none: 0,
  checker: 1,
  /** Stripes that change along x (run along z). */
  stripesX: 2,
  /** Stripes that change along z (run along x). */
  stripesZ: 3,
  diamond: 4,
  /** Basket-weave parquet. */
  parquet: 5,
  dots: 6,
  /** Vertical wallpaper stripes on whichever way a wall faces. */
  wallpaper: 7,
  /** Thin pinstripes on whichever way a wall faces. */
  pinstripe: 8,
  /** Floorboard seams running along z. */
  planks: 9,
} as const;

const PATTERN_VERTEX_HEAD = /* glsl */ `
attribute vec3 aColor2;
attribute vec2 aPattern;
varying vec3 vColor2;
varying vec2 vPattern;
varying vec3 vObjPos;
varying vec3 vObjNormal;
`;

const PATTERN_VERTEX_BODY = /* glsl */ `
vColor2 = aColor2;
vPattern = aPattern;
vObjPos = position;
vObjNormal = normal;
`;

const PATTERN_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vColor2;
varying vec2 vPattern;
varying vec3 vObjPos;
varying vec3 vObjNormal;
// Anti-aliased square wave: 1 near integers, 0 near halves.
float sqw(float v) {
  float t = abs(fract(v) - 0.5) * 2.0;
  float w = fwidth(v) * 2.0 + 1e-5;
  return clamp((t - 0.5) / w + 0.5, 0.0, 1.0);
}
float thin(float v, float width) {
  float t = abs(fract(v) - 0.5) * 2.0;
  float w = fwidth(v) * 2.0 + 1e-5;
  return clamp((t - (1.0 - width)) / w + 0.5, 0.0, 1.0);
}
float patternMask(vec3 pos, vec3 n, vec2 pat) {
  float type = pat.x;
  vec2 p = pos.xz / pat.y;
  float h = (abs(n.x) > abs(n.z) ? pos.z : pos.x) / pat.y;
  if (type < 1.5) { float a = sqw(p.x * 0.5); float b = sqw(p.y * 0.5); return a + b - 2.0 * a * b; }
  if (type < 2.5) return sqw(p.x * 0.5);
  if (type < 3.5) return sqw(p.y * 0.5);
  if (type < 4.5) { vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071; float a = sqw(q.x * 0.5); float b = sqw(q.y * 0.5); return a + b - 2.0 * a * b; }
  if (type < 5.5) {
    vec2 cell = floor(p);
    float parity = mod(cell.x + cell.y, 2.0);
    float along = parity < 0.5 ? p.x : p.y;
    return max(sqw(along * 2.0) * 0.6, thin(p.x, 0.05) + thin(p.y, 0.05));
  }
  if (type < 6.5) { float d = length(fract(p) - 0.5); float w = fwidth(d) + 1e-5; return 1.0 - smoothstep(0.17 - w, 0.17 + w, d); }
  if (type < 7.5) return sqw(h * 0.5);
  if (type < 8.5) return thin(h, 0.14);
  return thin(p.x, 0.08) + thin(p.y * 0.23 + floor(p.x) * 0.37, 0.03);
}
`;

const PATTERN_FRAGMENT_BODY = /* glsl */ `
#include <color_fragment>
if (vPattern.x > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vColor2, clamp(patternMask(vObjPos, vObjNormal, vPattern), 0.0, 1.0));
`;

/** Adds pattern support to a Lambert material (vertex colours are the base, `aColor2` the pattern ink). */
function patterned(material: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = PATTERN_VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${PATTERN_VERTEX_BODY}`);
    shader.fragmentShader = PATTERN_FRAGMENT_HEAD + shader.fragmentShader.replace('#include <color_fragment>', PATTERN_FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () => 'patterned';
  return material;
}

/**
 * Shared materials. Static geometry is merged, vertex-coloured Lambert (cheap on phones) with patterns and
 * a baked floor-level gradient; real-time sun shadows give the cross-section its depth. Night warmth is an
 * emissive uniform on floors, windows and lamps, not extra lights.
 */
export const MATERIALS = {
  /** The train, platform and props: at night they glow faintly warm, as if lit from within. */
  solid: patterned(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#FFB870'), emissiveIntensity: 0 })),
  /** The train's paint job (body and trim): one colour for every carriage, changed as reputation grows. */
  livery: new THREE.MeshLambertMaterial({ vertexColors: true, color: '#9A7462', emissive: new THREE.Color('#FFB870'), emissiveIntensity: 0 }),
  liveryTrim: new THREE.MeshLambertMaterial({ vertexColors: true, color: '#7A6D66', emissive: new THREE.Color('#FFB870'), emissiveIntensity: 0 }),
  /** The countryside: tinted moonlit blue at night while the train stays lamplit. */
  scenery: patterned(new THREE.MeshLambertMaterial({ vertexColors: true })),
  /** The field patchwork (its texture is painted by Scenery). */
  ground: new THREE.MeshLambertMaterial(),
  /** Interior floors glow warmly at night so the train reads as lit from inside. */
  floor: patterned(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#FFB866'), emissiveIntensity: 0 })),
  windows: new THREE.MeshLambertMaterial({ color: PALETTE.windowDay, emissive: new THREE.Color(PALETTE.windowNight), emissiveIntensity: 0 }),
  /** Lamp shades and bulbs: lit from within at night. */
  lamps: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#FFD68A'), emissiveIntensity: 0.05 }),
  lamp: new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow }),
  character: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#FFB870'), emissiveIntensity: 0 }),
  shadow: new THREE.MeshBasicMaterial({ color: '#1A1420', transparent: true, opacity: 0.16, depthWrite: false }),
  lockedOverlay: new THREE.MeshBasicMaterial({ color: '#3C4A63', transparent: true, opacity: 0.32, depthWrite: false }),
};

/** 0 = day, 1 = full night. */
const DAY_TINT = new THREE.Color('#FFFFFF');
const NIGHT_TINT = new THREE.Color('#5E6FA6');

/**
 * 0 = day, 1 = full night. Night is staged, not simulated: the lights stay warm (the train's own lamps)
 * while everything outside the train is tinted deep moonlit blue, so the carriages glow against the dark.
 */
export function setNightAmount(amount: number): void {
  MATERIALS.scenery.color.copy(DAY_TINT).lerp(NIGHT_TINT, amount);
  MATERIALS.ground.color.copy(DAY_TINT).lerp(NIGHT_TINT, amount * 0.85);
  MATERIALS.solid.emissiveIntensity = 0.06 * amount;
  MATERIALS.livery.emissiveIntensity = 0.05 * amount;
  MATERIALS.liveryTrim.emissiveIntensity = 0.05 * amount;
  MATERIALS.character.emissiveIntensity = 0.05 * amount;
  MATERIALS.floor.emissiveIntensity = 0.22 * amount;
  MATERIALS.windows.emissiveIntensity = 1.25 * amount;
  MATERIALS.windows.color.set(amount > 0.5 ? '#6A5A48' : PALETTE.windowDay);
  MATERIALS.lamps.emissiveIntensity = 0.05 + 0.9 * amount;
}

/** Soft round contact shadow under characters (the sun shadow does the rest). */
export const SHADOW_GEOMETRY = new THREE.CircleGeometry(0.3, 20).rotateX(-Math.PI / 2);

/**
 * Radial-fill ring for walk-over zones: a soft outline that sweeps clockwise as the action completes.
 * One tiny shader instead of rebuilding ring geometry every frame.
 */
export function createZoneMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uFill: { value: new THREE.Color(PALETTE.zoneActive) },
      uProgress: { value: 0 },
      uPulse: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uLit: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uFill;
      uniform float uProgress;
      uniform float uPulse;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uLit;
      varying vec2 vUv;
      const float PI = 3.14159265;
      // Rounded square: a painted floor pad, like a station marking.
      float roundBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = roundBox(p, vec2(0.9), 0.34);
        float aa = fwidth(d) * 1.2;
        float inside = 1.0 - smoothstep(-aa, aa, d);
        if (inside <= 0.0) discard;
        float border = smoothstep(-0.13 - aa, -0.13 + aa, d) * inside;
        float angle = atan(p.x, p.y);
        float a = (angle + PI) / (2.0 * PI);
        float filled = step(a, uProgress) * step(0.001, uProgress);
        float breathe = 0.5 + 0.5 * sin(uTime * 4.0);
        vec3 edge = mix(uColor, uFill, max(uLit, step(0.001, uProgress)));
        vec3 color = mix(vec3(1.0, 0.99, 0.96), uFill, filled * 0.85 + uLit * 0.25);
        color = mix(color, edge, border);
        float alpha = inside * (0.34 + 0.2 * uLit * breathe + 0.4 * filled + 0.1 * uPulse) + border * 0.62;
        gl_FragColor = vec4(color, min(1.0, alpha) * uOpacity);
      }
    `,
  });
}

/** Repaints every carriage at once (livery parts are white in geometry and take the material colour). */
export function setLivery(body: string, trim: string): void {
  MATERIALS.livery.color.set(body);
  MATERIALS.liveryTrim.color.set(trim);
}

/**
 * Temporary clones of the train's shared materials that keep only one side of `plane` (the refurbishment
 * wipe shows the new carriage on one side of a moving line and the old one on the other). Dispose the
 * clones when the wipe ends.
 */
export function clippedMaterials(plane: THREE.Plane): Map<THREE.Material, THREE.Material> {
  const map = new Map<THREE.Material, THREE.Material>();
  const clip = (source: THREE.Material, isPatterned: boolean): void => {
    const clone = source.clone();
    if (isPatterned) patterned(clone as THREE.MeshLambertMaterial);
    clone.clippingPlanes = [plane];
    map.set(source, clone);
  };
  clip(MATERIALS.solid, true);
  clip(MATERIALS.floor, true);
  clip(MATERIALS.livery, false);
  clip(MATERIALS.liveryTrim, false);
  clip(MATERIALS.windows, false);
  clip(MATERIALS.lamps, false);
  clip(MATERIALS.lockedOverlay, false);
  return map;
}

/** Swaps every mesh under `root` onto its clipped clone (or back, with `restore`). */
export function swapMaterials(root: THREE.Object3D, map: Map<THREE.Material, THREE.Material>, restore = false): void {
  const reverse = restore ? new Map([...map].map(([a, b]) => [b, a] as const)) : map;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const next = reverse.get(mesh.material);
    if (next) mesh.material = next;
  });
}
