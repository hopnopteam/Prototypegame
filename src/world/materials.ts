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

/**
 * Shared by every lit material: the baked light maps (world/LightMap.ts) of the train and of the platform
 * (which slides in and out with its own offset), how strongly they show (the night amount), and the night's
 * glow on self-lit parts. One object referenced by every compiled program, so one write updates them all.
 *
 * A map's box packs the world → texture mapping: uv = xz * (box.x, box.z) + (box.y, box.w).
 */
export const LIGHT_UNIFORMS = {
  uNxLightMap: { value: null as THREE.Texture | null },
  uNxLightBox: { value: new THREE.Vector4(0, -10, 0, -10) },
  uNxPlatMap: { value: null as THREE.Texture | null },
  uNxPlatBox: { value: new THREE.Vector4(0, -10, 0, -10) },
  uNxLightOn: { value: 1 },
  /** Night amount scaling per-vertex glow (lamps, crystal). */
  uNxGlow: { value: 0 },
  /**
   * The night sky that brass, varnish, glass and water reflect: an analytic gradient (zenith, horizon, ground)
   * and a moon glint, instead of a pre-filtered environment map (a fraction of the cost on a phone, and the
   * same on every tier). World space; written by Lighting.
   */
  uNxSkyZenith: { value: new THREE.Color('#0B1330') },
  uNxSkyHorizon: { value: new THREE.Color('#2E4478') },
  uNxSkyGround: { value: new THREE.Color('#0A0C14') },
  uNxMoonDir: { value: new THREE.Vector3(-0.45, 0.8, -0.3).normalize() },
  uNxMoonColor: { value: new THREE.Color('#E6EEFF') },
  uNxSkyAmount: { value: 0.35 },
};

/** Heights in the light map are measured from the train's floor. */
const LIGHT_FLOOR_Y = 0.55;

interface LitOptions {
  /** Painted patterns (aColor2 / aPattern). */
  pattern?: boolean;
  /** Per-vertex surfaces (aSurface) or one surface for the whole material. */
  surface?: 'vertex' | Surface;
  /** Reads the baked light (lamps, window spill, contact shading). */
  light?: boolean;
}

interface Recipe {
  kind: 'lit' | 'glow';
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
uniform sampler2D uNxLightMap;
uniform vec4 uNxLightBox;
uniform sampler2D uNxPlatMap;
uniform vec4 uNxPlatBox;
uniform float uNxLightOn;
vec4 nxBaked(vec3 p) {
  vec4 a = texture2D(uNxLightMap, p.xz * uNxLightBox.xz + uNxLightBox.yw);
  vec4 b = texture2D(uNxPlatMap, p.xz * uNxPlatBox.xz + uNxPlatBox.yw);
  return vec4(a.rgb + b.rgb, a.a * b.a);
}
#endif
uniform float uNxGlow;
uniform vec3 uNxSkyZenith;
uniform vec3 uNxSkyHorizon;
uniform vec3 uNxSkyGround;
uniform vec3 uNxMoonDir;
uniform vec3 uNxMoonColor;
uniform float uNxSkyAmount;
/** The night sky seen along a world direction, blurred toward its average as the surface gets rougher. */
vec3 nxSky(vec3 r, float rough) {
  float up = r.y;
  vec3 sky = mix(uNxSkyHorizon, uNxSkyZenith, smoothstep(0.05, 0.85, up));
  sky = mix(uNxSkyGround, sky, smoothstep(-0.25, 0.04, up));
  vec3 avg = (uNxSkyZenith + uNxSkyHorizon * 2.0 + uNxSkyGround) * 0.25;
  float shine = mix(900.0, 6.0, rough);
  float glint = pow(max(dot(r, uNxMoonDir), 0.0), shine) * (shine + 2.0) * 0.012;
  return mix(sky, avg, rough * rough) + uNxMoonColor * glint;
}
vec4 nxSurface() {
  #ifdef NX_VERTEX_SURFACE
  return vNxSurface;
  #else
  return uNxFixedSurface;
  #endif
}
`;

/**
 * The baked light as soft fill (lamps and window spill near the floor, fading high up) and its contact shading
 * (strongest at floor level, gone by knee height), then a soft rim on velvet and wool.
 */
const LIT_LIGHTS = /* glsl */ `
#if defined( RE_IndirectSpecular )
{
  // Sky reflections (world space) through three's own split-sum: fresnel, roughness and metalness apply.
  vec3 nxN = inverseTransformDirection(geometryNormal, viewMatrix);
  vec3 nxV = inverseTransformDirection(geometryViewDir, viewMatrix);
  vec3 nxR = reflect(-nxV, nxN);
  radiance += nxSky(nxR, roughnessFactor) * uNxSkyAmount;
  iblIrradiance += nxSky(nxN, 1.0) * (uNxSkyAmount * PI);
}
#endif
#ifdef NX_LIGHT
float nxAo = 1.0;
{
  vec4 nxB = nxBaked(vNxWorld);
  float nxH = vNxWorld.y - ${LIGHT_FLOOR_Y.toFixed(2)};
  irradiance += nxB.rgb * (uNxLightOn * (1.0 - smoothstep(1.3, 2.6, nxH)));
  nxAo = mix(nxB.a, 1.0, smoothstep(0.06, 0.85, nxH));
}
#endif
#include <lights_fragment_end>
#ifdef NX_LIGHT
reflectedLight.indirectDiffuse *= nxAo;
reflectedLight.directDiffuse *= mix(1.0, nxAo, 0.55);
reflectedLight.indirectSpecular *= nxAo;
#endif
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

/** Adds patterns, per-vertex surfaces, the baked light and glow to a physically based material. */
function patchLit(material: THREE.MeshStandardMaterial, options: LitOptions): void {
  const fixed = typeof options.surface === 'object' ? options.surface : SURFACES.matte;
  const fixedSurface = new THREE.Vector4(1 - fixed.roughness, fixed.metalness, fixed.glow ?? 0, 1 - (fixed.sheen ?? 0));
  const defines: Record<string, string | number> = {};
  if (options.surface === 'vertex') defines.NX_VERTEX_SURFACE = '';
  if (options.light) defines.NX_LIGHT = '';
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
    fs = fs
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 1.0 - nxSurface().x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = nxSurface().y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * nxSurface().z * uNxGlow;')
      .replace('#include <lights_fragment_end>', LIT_LIGHTS);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  const key = `nx|${options.pattern ? 'p' : ''}|${options.surface === 'vertex' ? 'v' : 'f'}|${options.light ? 'l' : ''}`;
  material.customProgramCacheKey = () => key;
}

let nightNow = 0;
const recipes = new Map<THREE.Material, Recipe>();

function build(recipe: Recipe): THREE.Material {
  const p = recipe.params;
  let material: THREE.MeshStandardMaterial;
  if (recipe.kind === 'lit') {
    material = new THREE.MeshStandardMaterial(p);
    patchLit(material, recipe.options);
  } else {
    // Lamp shades and bulbs: self-lit, so they read (and bloom) whatever the tier.
    material = new THREE.MeshStandardMaterial({ ...p, roughness: 0.6, metalness: 0 });
    patchLit(material, { surface: SURFACES.matte });
  }
  recipes.set(material, recipe);
  return material;
}

const lit = (params: THREE.MeshStandardMaterialParameters, options: LitOptions): THREE.Material => build({ kind: 'lit', params, options });

/**
 * Window panes, seen from outside (warm, framed, below the bloom threshold) or from inside (night glass):
 * unlit, a soft vertical gradient (brighter toward the sill, where the reading lamps are) and drawn curtain
 * edges, tinted per vertex (each class has its curtains). The outside and inside faces are separate quads
 * and carry their side in uv.y > 1 (inside) so one material draws both.
 */
function paneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    fog: true,
    clipping: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uGlow: { value: 0 },
      uNight: { value: 1 },
      uGlass: { value: new THREE.Color(VISUALS.night.window.nightGlass) },
      uDay: { value: new THREE.Color(PALETTE.windowDay) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_vertex>
      #include <clipping_planes_pars_vertex>
      void main() {
        vUv = uv;
        vTint = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      uniform float uNight;
      uniform vec3 uGlass;
      uniform vec3 uDay;
      varying vec2 vUv;
      varying vec3 vTint;
      #include <fog_pars_fragment>
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        bool inside = vUv.y > 1.0;
        vec2 p = vec2(vUv.x, fract(vUv.y));
        vec3 day = uDay * (0.82 + 0.18 * p.y);
        vec3 color;
        if (inside) {
          // Night glass from inside: deep blue, a faint cool sheen across the top, the curtains at the sides.
          float sheen = smoothstep(0.55, 1.0, p.y) * 0.16;
          color = mix(day, uGlass * (1.0 + sheen) + vec3(0.04, 0.05, 0.09) * sheen, uNight);
        } else {
          // Lamplit from inside: warm, brightest low (the lamps), a little cooler near the top.
          vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.8, 0.52), p.y);
          float body = 0.72 + 0.28 * (1.0 - p.y);
          color = mix(day, warm * body * uGlow, uNight);
        }
        // Curtains drawn at both sides (tinted per class), with a soft fold.
        float edge = min(p.x, 1.0 - p.x);
        float curtain = 1.0 - smoothstep(0.1, 0.16, edge);
        float fold = 0.85 + 0.15 * sin(p.x * 60.0);
        vec3 cloth = vTint * fold * mix(0.95, inside ? 0.55 : 0.75 * uGlow, uNight);
        color = mix(color, cloth, curtain * step(0.01, length(vTint - vec3(1.0))));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

/**
 * Shared materials. Static geometry is merged and vertex-coloured, with painted patterns, per-part surfaces
 * (brass, varnish, velvet) and the baked light. Every quality tier uses these same materials, so the game
 * looks the same everywhere; tiers only change resolution and effects.
 */
export const MATERIALS = {
  /** The train, platform and props. */
  solid: lit({ vertexColors: true }, { pattern: true, surface: 'vertex', light: true }),
  /** The train's paint job (body and trim): enamel, tinted by the livery colour. */
  livery: lit({ vertexColors: true, color: '#9A7462' }, { surface: SURFACES.paint, light: true }),
  liveryTrim: lit({ vertexColors: true, color: '#7A6D66' }, { surface: SURFACES.paint, light: true }),
  /** Everything outside the train: moonlit, and warmed by the train's window spill where it passes. */
  scenery: lit({ vertexColors: true }, { pattern: true, surface: 'vertex', light: true }),
  /** The ground's own texture is painted by Scenery. */
  ground: lit({}, { surface: SURFACES.stone, light: true }),
  /** Interior floors. */
  floor: lit({ vertexColors: true }, { pattern: true, surface: 'vertex', light: true }),
  windows: paneMaterial() as THREE.Material,
  /** Lamp shades and bulbs: lit from within at night. */
  lamps: build({ kind: 'glow', params: { vertexColors: true, emissive: new THREE.Color('#FFD68A'), emissiveIntensity: 0.05 }, options: {} }),
  lamp: new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow }) as THREE.Material,
  character: lit({ vertexColors: true }, { surface: 'vertex', light: true }),
  shadow: new THREE.MeshBasicMaterial({ color: '#1A1420', transparent: true, opacity: 0.16, depthWrite: false }) as THREE.Material,
  lockedOverlay: new THREE.MeshBasicMaterial({ color: '#3C4A63', transparent: true, opacity: 0.32, depthWrite: false }) as THREE.Material,
};

/** Extra lit materials made at runtime (per-class liveries). */
const extras = new Map<string, THREE.Material>();

/** A lit material made once per key (per-class liveries). */
export function litMaterial(key: string, params: THREE.MeshStandardMaterialParameters, options: LitOptions): THREE.Material {
  let m = extras.get(key);
  if (!m) {
    m = lit(params, options);
    extras.set(key, m);
  }
  return m;
}

/**
 * 0 = day, 1 = full night. Lights do the staging (moon, baked lamplight); this sets what glows: windows, lamp
 * shades and any self-lit part.
 */
export function setNightAmount(amount: number): void {
  nightNow = amount;
  applyNight();
}

function applyNight(): void {
  const n = nightNow;
  const night = VISUALS.night;
  const pane = MATERIALS.windows as THREE.ShaderMaterial;
  pane.uniforms.uGlow.value = night.window.glow;
  pane.uniforms.uNight.value = n;
  (MATERIALS.lamps as THREE.MeshStandardMaterial).emissiveIntensity = 0.08 + night.lampGlow * n;
  LIGHT_UNIFORMS.uNxGlow.value = n * 2.5;
  LIGHT_UNIFORMS.uNxLightOn.value = 0.25 + 0.75 * n;
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
    if (recipe) patchLit(clone as THREE.MeshStandardMaterial, recipe.kind === 'glow' ? { surface: SURFACES.matte } : recipe.options);
    else if ((source as THREE.ShaderMaterial).isShaderMaterial) (clone as THREE.ShaderMaterial).uniforms = (source as THREE.ShaderMaterial).uniforms;
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
