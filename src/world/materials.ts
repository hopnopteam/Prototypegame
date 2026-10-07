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
  /** Plaid (session 21, the bar's Luxury carpet): broad crossing bands with fine lines. `scale` is the band width. */
  plaid: 12,
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
  if (type > 11.5) {
    // Plaid: two crossing sets of broad bands (overlaps darkest) with a fine line through each band.
    float a = sqw(p.x * 0.5);
    float b = sqw(p.y * 0.5);
    float lines = max(thin(p.x + 0.5, 0.07), thin(p.y + 0.5, 0.07));
    return clamp((a + b) * 0.38 + lines * 0.75, 0.0, 1.0);
  }
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
  /**
   * Session 22: each room's lamps on or off (world/RoomDimmer.ts): a small map over the train that scales the
   * train's baked lamp light (1 lit, 0 dark), for lights out and a covered room. Same box packing as above.
   */
  uNxDimMap: { value: null as THREE.Texture | null },
  uNxDimBox: { value: new THREE.Vector4(0, 0.5, 0, 0.5) },
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
  /**
   * The conductor's rim light (session 16, in place of the ring on the floor): colour × strength, applied only
   * to the parts CharacterBatch marks as highlighted. Written by ConductorGear.
   */
  uNxHighlight: { value: new THREE.Color('#FFC75A') },
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
varying float vNxHighlight;
`;

const LIT_VERTEX_BODY = /* glsl */ `
vNxSurface = aSurface;
vNxHighlight = 0.0;
#ifdef USE_BATCHING_COLOR
// CharacterBatch keeps every part's colour white and uses its alpha as the highlight (1 = none); the colour
// multiply is a no-op and an opaque material ignores alpha.
vNxHighlight = 1.0 - getBatchingColor(getIndirectIndex(gl_DrawID)).a;
#endif
{
  vec4 nxWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  nxWorld = instanceMatrix * nxWorld;
  #endif
  #ifdef USE_BATCHING
  nxWorld = batchingMatrix * nxWorld;
  #endif
  vNxWorld = (modelMatrix * nxWorld).xyz;
}
`;

const LIT_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vNxSurface;
varying vec3 vNxWorld;
varying float vNxHighlight;
uniform vec3 uNxHighlight;
uniform vec4 uNxFixedSurface;
#ifdef NX_LIGHT
uniform sampler2D uNxLightMap;
uniform vec4 uNxLightBox;
uniform sampler2D uNxPlatMap;
uniform vec4 uNxPlatBox;
uniform sampler2D uNxDimMap;
uniform vec4 uNxDimBox;
uniform float uNxLightOn;
vec4 nxBaked(vec3 p) {
  vec4 a = texture2D(uNxLightMap, p.xz * uNxLightBox.xz + uNxLightBox.yw);
  a.rgb *= texture2D(uNxDimMap, p.xz * uNxDimBox.xz + uNxDimBox.yw).r;
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
/**
 * The conductor's highlight: a thin rim of warm light on the silhouette (how sharply it hugs the edge and its
 * strength there) and a lift of their own colours (a share of the albedo added as light: brighter, same hue),
 * like a hero's key light on a night set.
 */
const HIGHLIGHT_EDGE_POWER = 4.0;
const HIGHLIGHT_RIM = 0.5;
const HIGHLIGHT_FILL = 0.22;
/** The brightest a specular highlight may get (linear), kept under the bloom threshold. */
const SPECULAR_MAX = Math.min(0.9, VISUALS.night.bloom.threshold * 0.9);

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
{
  // Highlights glint but never bloom: only lamps and glowing things pass the bloom threshold, so a gold rail
  // catching the moon stays a gleam instead of a smear (scaled as a whole, so gold stays gold).
  float nxDs = max(max(reflectedLight.directSpecular.r, reflectedLight.directSpecular.g), reflectedLight.directSpecular.b);
  reflectedLight.directSpecular *= min(1.0, ${SPECULAR_MAX.toFixed(2)} / max(nxDs, 1e-4));
  float nxIs = max(max(reflectedLight.indirectSpecular.r, reflectedLight.indirectSpecular.g), reflectedLight.indirectSpecular.b);
  reflectedLight.indirectSpecular *= min(1.0, ${SPECULAR_MAX.toFixed(2)} / max(nxIs, 1e-4));
}
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
if (vNxHighlight > 0.001) {
  // The conductor: a soft rim of warm light round the silhouette and a touch of fill, so the eye finds them on
  // any floor without a marking on the ground (which clipped into beds and walls). Kept under the bloom threshold.
  float nxEdge = pow(1.0 - saturate(dot(normal, geometryViewDir)), ${HIGHLIGHT_EDGE_POWER.toFixed(1)});
  totalEmissiveRadiance += vNxHighlight * (uNxHighlight * (nxEdge * ${HIGHLIGHT_RIM.toFixed(2)}) + diffuseColor.rgb * ${HIGHLIGHT_FILL.toFixed(2)});
}
`;

/**
 * Lite shading (session 18, owner: "the performance in mobile is completely trash… insane frame rate drops…
 * the whole game is completely blurred"): the phone tiers light every surface per vertex instead of per
 * pixel. The geometry is flat-shaded low-poly, so a face's three vertices share its normal and per-vertex light
 * is the face's light: the moon, the fill, the sky and the analytic sky reflection come out the same, at a
 * fraction of the cost (no GGX, no DFG lookup, no per-pixel sky). Per pixel only what really varies across a
 * face remains: the painted pattern, the moon's shadow, the baked lamplight and contact shading, and fog. That
 * leaves room to draw phones at a crisp resolution.
 */
const LITE_VERTEX_HEAD = /* glsl */ `
#include <lights_pars_begin>
uniform vec4 uNxFixedSurface;
uniform vec3 uNxSkyZenith;
uniform vec3 uNxSkyHorizon;
uniform vec3 uNxSkyGround;
uniform vec3 uNxMoonDir;
uniform float uNxSkyAmount;
varying vec4 vNxMoon;
varying vec3 vNxRest;
varying vec3 vNxEnv;
vec3 nxSkyV(vec3 r, float rough) {
  float up = r.y;
  vec3 sky = mix(uNxSkyHorizon, uNxSkyZenith, smoothstep(0.05, 0.85, up));
  sky = mix(uNxSkyGround, sky, smoothstep(-0.25, 0.04, up));
  vec3 avg = (uNxSkyZenith + uNxSkyHorizon * 2.0 + uNxSkyGround) * 0.25;
  return mix(sky, avg, rough * rough);
}
`;

const LITE_VERTEX_BODY = /* glsl */ `
{
  #ifdef NX_VERTEX_SURFACE
  vec4 nxSurf = aSurface;
  #else
  vec4 nxSurf = uNxFixedSurface;
  #endif
  float nxRough = 1.0 - nxSurf.x;
  vec3 nxNv = normalize(transformedNormal);
  vec3 nxMoon = vec3(0.0);
  float nxSpec = 0.0;
  vec3 nxRest = getAmbientLightIrradiance(ambientLightColor);
  vec3 nxViewV = normalize(-(modelViewMatrix * vec4(transformed, 1.0)).xyz);
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    vec3 l = directionalLights[i].direction;
    float d = max(dot(nxNv, l), 0.0);
    if (i == 0) {
      // The moon (the shadow-casting light comes first): its share is shadowed per pixel; a Blinn glint whose
      // tightness follows the surface's smoothness.
      nxMoon = directionalLights[i].color * d;
      float shine = mix(240.0, 6.0, nxRough);
      vec3 h = normalize(l + nxViewV);
      nxSpec = pow(max(dot(nxNv, h), 0.0), shine) * (shine + 8.0) * 0.04 * d;
    } else {
      nxRest += directionalLights[i].color * d;
    }
  }
  #endif
  #if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) nxRest += getHemisphereLightIrradiance(hemisphereLights[i], nxNv);
  #endif
  vec3 nxNw = inverseTransformDirection(nxNv, viewMatrix);
  vec3 nxVw = normalize(cameraPosition - vNxWorld);
  nxRest += nxSkyV(nxNw, 1.0) * (uNxSkyAmount * PI);
  vNxMoon = vec4(nxMoon, nxSpec);
  vNxRest = nxRest;
  // The night sky the surface reflects (fresnel-weighted; tinted by F0 per pixel).
  float nxFres = pow(1.0 - max(dot(nxNw, nxVw), 0.0), 5.0);
  vNxEnv = nxSkyV(reflect(-nxVw, nxNw), nxRough) * uNxSkyAmount * (nxSurf.x * nxSurf.x) * (0.25 + 0.75 * nxFres + nxSurf.y);
}
`;

const LITE_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vNxMoon;
varying vec3 vNxRest;
varying vec3 vNxEnv;
`;

const LITE_LIGHTS = /* glsl */ `
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
float nxShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
{
  DirectionalLightShadow nxSh = directionalLightShadows[ 0 ];
  #if defined( SHADOWMAP_TYPE_PCF )
  // Four hardware-filtered compares (each a 2×2 PCF) on a rotated grid a texel apart. Session 20: one tap left
  // stair-stepped edges on the floor under every wall on a sharp phone screen (read as "weird textures");
  // four soften them for three more fetches.
  vec4 nxSc = vDirectionalShadowCoord[ 0 ];
  nxSc.xyz /= nxSc.w;
  nxSc.z += nxSh.shadowBias;
  if ( receiveShadow && nxSc.x >= 0.0 && nxSc.x <= 1.0 && nxSc.y >= 0.0 && nxSc.y <= 1.0 && nxSc.z <= 1.0 ) {
    vec2 nxT = 1.0 / nxSh.shadowMapSize;
    float nxLit = texture( directionalShadowMap[ 0 ], vec3( nxSc.xy + vec2( -0.9, -0.35 ) * nxT, nxSc.z ) )
      + texture( directionalShadowMap[ 0 ], vec3( nxSc.xy + vec2( 0.35, -0.9 ) * nxT, nxSc.z ) )
      + texture( directionalShadowMap[ 0 ], vec3( nxSc.xy + vec2( 0.9, 0.35 ) * nxT, nxSc.z ) )
      + texture( directionalShadowMap[ 0 ], vec3( nxSc.xy + vec2( -0.35, 0.9 ) * nxT, nxSc.z ) );
    nxShadow = mix( 1.0, nxLit * 0.25, nxSh.shadowIntensity );
  }
  #else
  nxShadow = receiveShadow ? getShadow( directionalShadowMap[ 0 ], nxSh.shadowMapSize, nxSh.shadowIntensity, nxSh.shadowBias, nxSh.shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
  #endif
}
#endif
vec4 nxS = nxSurface();
vec3 nxDiffuse = diffuseColor.rgb * (1.0 - nxS.y) * RECIPROCAL_PI;
vec3 nxF0 = mix(vec3(0.04), diffuseColor.rgb, nxS.y);
vec3 nxBakedLight = vec3(0.0);
float nxAo = 1.0;
#ifdef NX_LIGHT
{
  vec4 nxB = nxBaked(vNxWorld);
  float nxH = vNxWorld.y - ${LIGHT_FLOOR_Y.toFixed(2)};
  nxBakedLight = nxB.rgb * (uNxLightOn * (1.0 - smoothstep(1.3, 2.6, nxH)));
  nxAo = mix(nxB.a, 1.0, smoothstep(0.06, 0.85, nxH));
}
#endif
reflectedLight.indirectDiffuse = nxDiffuse * (vNxRest + nxBakedLight) * nxAo;
reflectedLight.directDiffuse = nxDiffuse * vNxMoon.rgb * nxShadow * mix(1.0, nxAo, 0.55);
{
  vec3 nxSpec = nxF0 * (vNxEnv * nxAo + uNxMoonColor * (vNxMoon.a * nxShadow));
  float nxM = max(max(nxSpec.r, nxSpec.g), nxSpec.b);
  reflectedLight.indirectSpecular = nxSpec * min(1.0, ${SPECULAR_MAX.toFixed(2)} / max(nxM, 1e-4));
}
{
  float nxSheen = 1.0 - nxS.w;
  if (nxSheen > 0.0) {
    float nxRim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 3.0);
    reflectedLight.directDiffuse *= 1.0 + nxSheen * nxRim * 1.4;
    reflectedLight.indirectDiffuse *= 1.0 + nxSheen * nxRim * 1.4;
  }
}
if (vNxHighlight > 0.001) {
  float nxEdge = pow(1.0 - saturate(dot(normal, geometryViewDir)), ${HIGHLIGHT_EDGE_POWER.toFixed(1)});
  totalEmissiveRadiance += vNxHighlight * (uNxHighlight * (nxEdge * ${HIGHLIGHT_RIM.toFixed(2)}) + diffuseColor.rgb * ${HIGHLIGHT_FILL.toFixed(2)});
}
`;

/** Lite shading on (the phone tiers) or off (full physically based shading). Set before the first compile. */
let liteShading = false;

/** Every material built from a recipe (and its clipped clones), to recompile when the shading mode changes. */
const shaded = new Set<THREE.Material>();

/**
 * Switches every lit material between lite (per-vertex) and full shading. Programs are cached per mode, so a
 * tier change recompiles once; call it before warm-up so the first frame already has the right shaders.
 */
export function setLiteShading(on: boolean): void {
  if (on === liteShading) return;
  liteShading = on;
  for (const m of shaded) m.needsUpdate = true;
}

export function isLiteShading(): boolean {
  return liteShading;
}

/** Adds patterns, per-vertex surfaces, the baked light and glow to a physically based material. */
function patchLit(material: THREE.MeshStandardMaterial, options: LitOptions): void {
  const fixed = typeof options.surface === 'object' ? options.surface : SURFACES.matte;
  const fixedSurface = new THREE.Vector4(1 - fixed.roughness, fixed.metalness, fixed.glow ?? 0, 1 - (fixed.sheen ?? 0));
  const defines: Record<string, string | number> = {};
  if (options.surface === 'vertex') defines.NX_VERTEX_SURFACE = '';
  if (options.light) defines.NX_LIGHT = '';
  material.defines = { ...(material.defines ?? {}), ...defines };
  shaded.add(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNxFixedSurface = { value: fixedSurface };
    Object.assign(shader.uniforms, LIGHT_UNIFORMS);
    const lite = liteShading;
    let vs = LIT_VERTEX_HEAD + shader.vertexShader;
    // The vertex lighting needs three's light uniforms and helpers, after <common> (PI, saturate).
    if (lite) vs = vs.replace('#include <common>', `#include <common>\n${LITE_VERTEX_HEAD}`);
    let fs = (lite ? LITE_FRAGMENT_HEAD : '') + LIT_FRAGMENT_HEAD + shader.fragmentShader;
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${LIT_VERTEX_BODY}${lite ? LITE_VERTEX_BODY : ''}`);
    if (options.pattern) {
      vs = PATTERN_VERTEX_HEAD + vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${PATTERN_VERTEX_BODY}`);
      fs = PATTERN_FRAGMENT_HEAD + fs.replace('#include <color_fragment>', PATTERN_FRAGMENT_BODY);
    }
    fs = fs
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 1.0 - nxSurface().x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = nxSurface().y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * nxSurface().z * uNxGlow;');
    if (lite) {
      fs = fs
        .replace('#include <lights_physical_fragment>', '')
        .replace('#include <lights_fragment_begin>', LITE_LIGHTS)
        .replace('#include <lights_fragment_maps>', '')
        .replace('#include <lights_fragment_end>', '');
    } else {
      fs = fs.replace('#include <lights_fragment_end>', LIT_LIGHTS);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  const key = `nx|${options.pattern ? 'p' : ''}|${options.surface === 'vertex' ? 'v' : 'f'}|${options.light ? 'l' : ''}`;
  material.customProgramCacheKey = () => `${key}|${liteShading ? 'lite' : 'pbr'}`;
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
/**
 * A soft glow that can only ever add light (session 24, owner: lamps drew as dark squares on a phone). The
 * texture is opaque: white in the middle fading to pure black at the edges, and the blend is ONE + ONE, so
 * whatever a device does with alpha, the black corners add nothing. Not tone-mapped and no fog, so black stays
 * black (the night grade lifts the shadows: a tone-mapped black corner would add a faint blue square).
 * `radial` draws the canvas: centre (cx, cy), inner and outer radius, and up to three stops of brightness.
 */
const glowTextures = new Map<string, THREE.CanvasTexture>();
export function glowTexture(width: number, height: number, cx: number, cy: number, r0: number, r1: number, stops: [number, number][]): THREE.CanvasTexture {
  const key = `${width}x${height}:${cx},${cy}:${r0},${r1}:${stops.join(';')}`;
  const cached = glowTextures.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const [at, v] of stops) {
    const b = Math.round(255 * v);
    g.addColorStop(at, `rgb(${b},${b},${b})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const t = new THREE.CanvasTexture(c);
  // Read as plain numbers: the stops are linear brightness (times `color`, which carries the hue).
  t.colorSpace = THREE.NoColorSpace;
  glowTextures.set(key, t);
  return t;
}

/** Blending settings for `glowTexture` glows: added as they are (brightness through `color`, not opacity). */
export const ADD_GLOW = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
  toneMapped: false,
  fog: false,
} as const;

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
  // Both faces of the thin panes block the moon in the shadow pass (each pane is a single quad).
  windows: Object.assign(paneMaterial(), { shadowSide: THREE.DoubleSide }) as THREE.Material,
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
 * The refurbishment wipe shows the new carriage on one side of a moving line and the old one on the other:
 * clones of the train's materials that keep only one side of a plane. The clones live for the whole game and
 * are compiled at start-up (see Stage.warmUp): a clone made per wipe and thrown away after compiled fresh
 * shaders every time, a stall of a few hundred milliseconds on a phone at the best moment of the game.
 */
export interface ClipSide {
  readonly plane: THREE.Plane;
  readonly map: Map<THREE.Material, THREE.Material>;
}

const CLIP_BASE = (): THREE.Material[] => [MATERIALS.solid, MATERIALS.floor, MATERIALS.livery, MATERIALS.liveryTrim, MATERIALS.windows, MATERIALS.lamps, MATERIALS.lockedOverlay];
/** One pair of sides per wipe running at once (two refits bought back to back each get their own line). */
const clipSlots: Record<'front' | 'back', ClipSide>[] = [];

/** The clipped clones for one side of a wipe (`extra`: per-class liveries, cloned once each). */
export function clipSide(side: 'front' | 'back', extra: THREE.Material[] = [], slot = 0): ClipSide {
  while (clipSlots.length <= slot) {
    clipSlots.push({
      front: { plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), map: new Map() },
      back: { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), map: new Map() },
    });
  }
  const s = clipSlots[slot][side];
  for (const source of [...CLIP_BASE(), ...extra]) {
    if (s.map.has(source)) continue;
    const clone = source.clone();
    const recipe = recipes.get(source);
    if (recipe) patchLit(clone as THREE.MeshStandardMaterial, recipe.kind === 'glow' ? { surface: SURFACES.matte } : recipe.options);
    else if ((source as THREE.ShaderMaterial).isShaderMaterial) (clone as THREE.ShaderMaterial).uniforms = (source as THREE.ShaderMaterial).uniforms;
    clone.clippingPlanes = [s.plane];
    s.map.set(source, clone);
  }
  return s;
}

/** The first wipe's clipped clones (both sides), for compiling up front (later slots share their shaders). */
export function clippedClones(): THREE.Material[] {
  return [...clipSide('front').map.values(), ...clipSide('back').map.values()];
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
