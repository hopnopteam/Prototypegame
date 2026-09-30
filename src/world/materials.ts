import * as THREE from 'three';
import { VISUALS } from '../config/visuals';
import { PALETTE } from './palette';
import { SURFACES, type Surface } from './surfaces';

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
  /**
   * MPH-style floorboards along z: long planks, each its own tone (a random share of the second colour),
   * soft seams and staggered end joints. `scale` is the plank width.
   */
  boards: 10,
  /** Chevron parquet: diagonal blocks mirrored column to column (luxurious rooms). `scale` is the column width. */
  chevron: 11,
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
float hash21(vec2 q) {
  return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
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
  if (type < 9.5) return thin(p.x, 0.08) + thin(p.y * 0.23 + floor(p.x) * 0.37, 0.03);
  if (type > 10.5) {
    // Chevron: columns of diagonal blocks, the diagonal flipping each column; each block its own tone.
    float c = floor(p.x);
    float s = mod(c, 2.0) < 0.5 ? 1.0 : -1.0;
    float d = (p.y + s * fract(p.x)) * 2.2;
    float seamC = thin(p.x, 0.05);
    float seamD = thin(d, 0.07);
    float tone = hash21(vec2(c, floor(d)));
    return max(max(seamC, seamD) * 0.85, tone * 0.35);
  }
  // Boards: plank index across, a staggered segment index along; each board gets its own tone.
  float ix = floor(p.x);
  float along = p.y * 0.2 + hash21(vec2(ix, 3.1)) * 5.0;
  float tone = hash21(vec2(ix, floor(along)));
  float seam = max(thin(p.x, 0.06), thin(along, 0.02));
  return max(seam * 0.9, tone * 0.32);
}
`;

const PATTERN_FRAGMENT_BODY = /* glsl */ `
#include <color_fragment>
if (vPattern.x > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vColor2, clamp(patternMask(vObjPos, vObjNormal, vPattern), 0.0, 1.0));
`;

/** Most lamp pools a material can take (the tier picks how many are used). */
export const MAX_LAMPS = 24;

/**
 * Shared by every lit train material, updated once a frame by Lighting: warm pools from the lamps nearest the
 * camera (view space, w = strength), the warm ambient inside the carriages, and the night's glow on
 * self-lit parts. One object, referenced by every compiled program, so one write updates them all.
 */
export const LIGHT_UNIFORMS = {
  uNxLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
  uNxLampColor: { value: new THREE.Color('#FFAE5C') },
  uNxLampRadius: { value: 2.4 },
  /** Interior ambient, already scaled by intensity and the night amount. */
  uNxInterior: { value: new THREE.Color(0, 0, 0) },
  /** The train's extent along z (front, rear): the interior warmth only applies inside it. */
  uNxTrainZ: { value: new THREE.Vector2(-1.2, 16) },
  /** Night amount scaling per-vertex glow (lamps, crystal). */
  uNxGlow: { value: 0 },
};

/** Inner half-width of the carriages (the warm interior stops at the inside of the side walls). */
const INTERIOR_HALF = 2.06;

interface LitOptions {
  /** Painted patterns (aColor2 / aPattern). */
  pattern?: boolean;
  /** Per-vertex surfaces (aSurface) or one surface for the whole material. */
  surface?: 'vertex' | Surface;
  /** Lamp pools and interior warmth. */
  light?: boolean;
}

interface Recipe {
  kind: 'lit' | 'glass' | 'glow';
  params: THREE.MeshStandardMaterialParameters;
  options: LitOptions;
}

const LIT_VERTEX_HEAD = /* glsl */ `
attribute vec4 aSurface;
varying vec4 vNxSurface;
varying vec3 vNxWorld;
`;

const LIT_VERTEX_BODY = /* glsl */ `
vNxSurface = aSurface;
{
  vec4 nxWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  nxWorld = instanceMatrix * nxWorld;
  #endif
  vNxWorld = (modelMatrix * nxWorld).xyz;
}
`;

const LIT_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vNxSurface;
varying vec3 vNxWorld;
uniform vec4 uNxFixedSurface;
#ifdef NX_LIGHT
uniform vec4 uNxLamps[NX_LAMPS];
uniform vec3 uNxLampColor;
uniform float uNxLampRadius;
uniform vec3 uNxInterior;
uniform vec2 uNxTrainZ;
#endif
uniform float uNxGlow;
vec4 nxSurface() {
  #ifdef NX_VERTEX_SURFACE
  return vNxSurface;
  #else
  return uNxFixedSurface;
  #endif
}
`;

/** Lamp pools through three's own lighting equations (diffuse and, on PBR, GGX highlights), plus warmth. */
const LIT_LIGHTS = /* glsl */ `
#ifdef NX_LIGHT
{
  float nxInside = step(abs(vNxWorld.x), ${INTERIOR_HALF.toFixed(2)}) * step(vNxWorld.z, uNxTrainZ.y) * step(uNxTrainZ.x, vNxWorld.z) * step(vNxWorld.y, 2.2);
  irradiance += uNxInterior * nxInside;
  float nxR2 = uNxLampRadius * uNxLampRadius;
  for (int i = 0; i < NX_LAMPS; i++) {
    vec4 nxLamp = uNxLamps[i];
    if (nxLamp.w <= 0.0) continue;
    vec3 nxToLamp = nxLamp.xyz - geometryPosition;
    float nxD2 = dot(nxToLamp, nxToLamp);
    if (nxD2 >= nxR2) continue;
    float nxFall = 1.0 - nxD2 / nxR2;
    IncidentLight nxLight;
    nxLight.direction = nxToLamp * inversesqrt(max(nxD2, 1e-4));
    nxLight.color = uNxLampColor * (nxLamp.w * nxFall * nxFall);
    nxLight.visible = true;
    RE_Direct(nxLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  }
}
#endif
#include <lights_fragment_end>
{
  // Velvet and wool catch a soft rim of light at grazing angles.
  float nxSheen = 1.0 - nxSurface().w;
  if (nxSheen > 0.0) {
    float nxRim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
    reflectedLight.directDiffuse *= 1.0 + nxSheen * nxRim * 1.4;
    reflectedLight.indirectDiffuse *= 1.0 + nxSheen * nxRim * 1.4;
  }
}
`;

/** Adds patterns, per-vertex surfaces, lamp pools, interior warmth and glow to a Lambert or Standard material. */
function patchLit(material: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial, options: LitOptions, lamps: number): void {
  const pbr = (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  const fixed = typeof options.surface === 'object' ? options.surface : SURFACES.matte;
  const fixedSurface = new THREE.Vector4(1 - fixed.roughness, fixed.metalness, fixed.glow ?? 0, 1 - (fixed.sheen ?? 0));
  const defines: Record<string, string | number> = {};
  if (options.surface === 'vertex') defines.NX_VERTEX_SURFACE = '';
  if (options.light) {
    defines.NX_LIGHT = '';
    defines.NX_LAMPS = Math.max(1, lamps);
  }
  material.defines = { ...(material.defines ?? {}), ...defines };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNxFixedSurface = { value: fixedSurface };
    Object.assign(shader.uniforms, LIGHT_UNIFORMS);
    let vs = LIT_VERTEX_HEAD + shader.vertexShader;
    let fs = LIT_FRAGMENT_HEAD + shader.fragmentShader;
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${LIT_VERTEX_BODY}`);
    if (options.pattern) {
      vs = PATTERN_VERTEX_HEAD + vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${PATTERN_VERTEX_BODY}`);
      fs = PATTERN_FRAGMENT_HEAD + fs.replace('#include <color_fragment>', PATTERN_FRAGMENT_BODY);
    }
    if (pbr) {
      fs = fs
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 1.0 - nxSurface().x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = nxSurface().y;');
    }
    fs = fs
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * nxSurface().z * uNxGlow;')
      .replace('#include <lights_fragment_end>', LIT_LIGHTS);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  const key = `nx|${pbr ? 'pbr' : 'lam'}|${options.pattern ? 'p' : ''}|${options.surface === 'vertex' ? 'v' : 'f'}|${options.light ? `l${lamps}` : ''}`;
  material.customProgramCacheKey = () => key;
}

let pbrNow = false;
let lampsNow = 6;
let nightNow = 0;
const recipes = new Map<THREE.Material, Recipe>();

function build(recipe: Recipe): THREE.Material {
  const p = recipe.params;
  let material: THREE.Material;
  if (recipe.kind === 'lit') {
    const m = pbrNow ? new THREE.MeshStandardMaterial(p) : new THREE.MeshLambertMaterial(p as THREE.MeshLambertMaterialParameters);
    patchLit(m, recipe.options, lampsNow);
    material = m;
  } else if (recipe.kind === 'glass') {
    material = pbrNow ? new THREE.MeshStandardMaterial({ ...p, roughness: 0.08, metalness: 0 }) : new THREE.MeshLambertMaterial(p as THREE.MeshLambertMaterialParameters);
  } else {
    // Lamp shades and bulbs: self-lit, so they read (and bloom) whatever the tier.
    const m = pbrNow ? new THREE.MeshStandardMaterial({ ...p, roughness: 0.6, metalness: 0 }) : new THREE.MeshLambertMaterial(p as THREE.MeshLambertMaterialParameters);
    patchLit(m, { surface: SURFACES.matte }, lampsNow);
    material = m;
  }
  recipes.set(material, recipe);
  return material;
}

const lit = (params: THREE.MeshStandardMaterialParameters, options: LitOptions): THREE.Material => build({ kind: 'lit', params, options });

/**
 * Shared materials. Static geometry is merged and vertex-coloured, with painted patterns and a baked
 * floor-level gradient (ambient occlusion). The cheapest tier shades with Lambert; the others are physically
 * based (roughness and metalness per part: brass, varnish, velvet). Night light comes from the moon, the
 * lamp pools and the interior warmth, all shared through LIGHT_UNIFORMS.
 */
export const MATERIALS = {
  /** The train, platform and props. */
  solid: lit({ vertexColors: true }, { pattern: true, surface: 'vertex', light: true }),
  /** The train's paint job (body and trim): enamel, tinted by the livery colour. */
  livery: lit({ vertexColors: true, color: '#9A7462' }, { surface: SURFACES.paint, light: true }),
  liveryTrim: lit({ vertexColors: true, color: '#7A6D66' }, { surface: SURFACES.paint, light: true }),
  /** Everything outside the train (moonlit, never lamplit). */
  scenery: lit({ vertexColors: true }, { pattern: true, surface: 'vertex' }),
  /** The ground's own texture is painted by Scenery. */
  ground: lit({}, { surface: SURFACES.stone }),
  /** Interior floors. */
  floor: lit({ vertexColors: true }, { pattern: true, surface: 'vertex', light: true }),
  windows: build({ kind: 'glass', params: { color: PALETTE.windowDay, emissive: new THREE.Color(PALETTE.windowNight), emissiveIntensity: 0 }, options: {} }),
  /** Lamp shades and bulbs: lit from within at night. */
  lamps: build({ kind: 'glow', params: { vertexColors: true, emissive: new THREE.Color('#FFD68A'), emissiveIntensity: 0.05 }, options: {} }),
  lamp: new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow }) as THREE.Material,
  character: lit({ vertexColors: true }, { surface: 'vertex', light: true }),
  shadow: new THREE.MeshBasicMaterial({ color: '#1A1420', transparent: true, opacity: 0.16, depthWrite: false }) as THREE.Material,
  lockedOverlay: new THREE.MeshBasicMaterial({ color: '#3C4A63', transparent: true, opacity: 0.32, depthWrite: false }) as THREE.Material,
};

type MaterialKey = keyof typeof MATERIALS;

/** Extra lit materials made at runtime (per-class liveries), rebuilt with the rest on a quality change. */
const extras = new Map<string, THREE.Material>();

/** A lit material made once per key (per-class liveries); follows quality changes like the shared ones. */
export function litMaterial(key: string, params: THREE.MeshStandardMaterialParameters, options: LitOptions): THREE.Material {
  let m = extras.get(key);
  if (!m) {
    m = lit(params, options);
    extras.set(key, m);
  }
  return m;
}

/**
 * Switches every recipe-built material between Lambert and physically based shading and sets how many lamp
 * pools they take. Returns old → new so the scene can be swapped over (see swapMaterials); MATERIALS and
 * the runtime extras already point at the new ones, so anything built later uses them too.
 */
export function setMaterialQuality(pbr: boolean, lamps: number): Map<THREE.Material, THREE.Material> {
  const map = new Map<THREE.Material, THREE.Material>();
  const count = Math.max(1, Math.min(MAX_LAMPS, lamps));
  if (pbr === pbrNow && count === lampsNow) return map;
  pbrNow = pbr;
  lampsNow = count;
  const rebuild = (old: THREE.Material): THREE.Material => {
    const recipe = recipes.get(old);
    if (!recipe) return old;
    const next = build(recipe);
    copyState(old, next);
    recipes.delete(old);
    map.set(old, next);
    return next;
  };
  for (const key of Object.keys(MATERIALS) as MaterialKey[]) MATERIALS[key] = rebuild(MATERIALS[key]);
  for (const [key, m] of extras) extras.set(key, rebuild(m));
  applyNight();
  return map;
}

/** Carries what the game changes at runtime (colours, emissive strength, textures) onto a rebuilt material. */
function copyState(from: THREE.Material, to: THREE.Material): void {
  const a = from as THREE.MeshStandardMaterial;
  const b = to as THREE.MeshStandardMaterial;
  if (a.color && b.color) b.color.copy(a.color);
  if (a.emissive && b.emissive) b.emissive.copy(a.emissive);
  if (a.emissiveIntensity !== undefined) b.emissiveIntensity = a.emissiveIntensity;
  if (a.map) b.map = a.map;
  from.dispose();
}

export function isPbr(): boolean {
  return pbrNow;
}

/**
 * 0 = day, 1 = full night. Lights do the staging now (moon, lamps, warmth inside the train); this sets what
 * glows: windows, lamp shades and any self-lit part.
 */
export function setNightAmount(amount: number): void {
  nightNow = amount;
  applyNight();
}

function applyNight(): void {
  const n = nightNow;
  const night = VISUALS.night;
  const win = MATERIALS.windows as THREE.MeshStandardMaterial;
  win.emissiveIntensity = night.windowGlow * n;
  win.color.set(n > 0.5 ? '#3A3430' : PALETTE.windowDay);
  (MATERIALS.lamps as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + night.lampGlow * n;
  LIGHT_UNIFORMS.uNxGlow.value = n * 2.5;
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
      uFill: { value: new THREE.Color(PALETTE.zoneWorking) },
      uLitColor: { value: new THREE.Color(PALETTE.zoneActive) },
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
      uniform vec3 uLitColor;
      uniform float uProgress;
      uniform float uPulse;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uLit;
      varying vec2 vUv;
      #include <common>
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
        // A game marking, never furniture: a bold white border with a thin dark outline (reads on any floor),
        // a light wash inside, a green sweep while it works, gold when it wants you.
        float outline = smoothstep(-0.05 - aa, -0.05 + aa, d) * inside;
        float border = smoothstep(-0.2 - aa, -0.2 + aa, d) * inside;
        float angle = atan(p.x, p.y);
        float a = (angle + PI) / (2.0 * PI);
        float filled = step(a, uProgress) * step(0.001, uProgress);
        float breathe = 0.5 + 0.5 * sin(uTime * 4.0);
        vec3 edge = mix(mix(uColor, uLitColor, uLit), uFill, step(0.001, uProgress));
        vec3 color = mix(mix(vec3(1.0, 0.99, 0.96), uLitColor, uLit * 0.2), uFill, filled * 0.9);
        color = mix(color, edge, border);
        color = mix(color, vec3(0.17, 0.15, 0.21), outline * 0.5);
        float alpha = inside * (0.2 + 0.2 * uLit * breathe + 0.6 * filled + 0.1 * uPulse) + border * 0.85;
        gl_FragColor = vec4(color, min(1.0, alpha) * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Repaints the locomotive and rear deck (livery parts are white in geometry and take the material colour). */
export function setLivery(body: string, trim: string): void {
  (MATERIALS.livery as THREE.MeshStandardMaterial).color.set(body);
  (MATERIALS.liveryTrim as THREE.MeshStandardMaterial).color.set(trim);
}

/**
 * Temporary clones of the train's materials that keep only one side of `plane` (the refurbishment wipe shows
 * the new carriage on one side of a moving line and the old one on the other). Dispose the clones when the
 * wipe ends.
 */
export function clippedMaterials(plane: THREE.Plane, extra: THREE.Material[] = []): Map<THREE.Material, THREE.Material> {
  const map = new Map<THREE.Material, THREE.Material>();
  const clip = (source: THREE.Material): void => {
    if (map.has(source)) return;
    const clone = source.clone();
    const recipe = recipes.get(source);
    if (recipe && recipe.kind !== 'glass') patchLit(clone as THREE.MeshStandardMaterial, recipe.kind === 'glow' ? { surface: SURFACES.matte } : recipe.options, lampsNow);
    clone.clippingPlanes = [plane];
    map.set(source, clone);
  };
  for (const m of [MATERIALS.solid, MATERIALS.floor, MATERIALS.livery, MATERIALS.liveryTrim, MATERIALS.windows, MATERIALS.lamps, MATERIALS.lockedOverlay, ...extra]) clip(m);
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
