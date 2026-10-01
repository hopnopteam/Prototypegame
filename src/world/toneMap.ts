import * as THREE from 'three';
import { VISUALS } from '../config/visuals';

/**
 * One tone map for every tier: ACES (three.js's fit), then the night grade (blue lifted into the shadows,
 * warmth in the highlights, a touch of contrast and saturation). Installed as three's CustomToneMapping so
 * materials apply it directly when there is no post-processing (Low), and reused by the final post pass, so
 * Low and Ultra share the same colours.
 */
export const GRADED_TONE_MAP = /* glsl */ `
vec3 nxRRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 nxGradedToneMap(vec3 color, float exposure) {
  const mat3 inMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = clamp(outMat * nxRRTAndODTFit(inMat * color), 0.0, 1.0);
  // The grade, in display-referred linear: lift, warm highlights, contrast, saturation.
  float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color += NX_SHADOWS * NX_SHADOW_AMOUNT * (1.0 - smoothstep(0.0, 0.3, l));
  color = mix(color, color * NX_HIGHLIGHTS, NX_HIGHLIGHT_AMOUNT * smoothstep(0.15, 1.0, l));
  float g = pow(max(l, 1e-5), 1.0 / 2.2);
  float gc = clamp((g - 0.5) * NX_CONTRAST + 0.5, 0.0, 1.0);
  color *= pow(gc, 2.2) / max(l, 1e-5);
  float l2 = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(l2), color, NX_SATURATION), 0.0, 1.0);
}
`;

const vec3 = (hex: string): string => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/** The grade constants as GLSL defines (shared by the tone-mapping chunk and the final pass). */
export function gradeDefines(): string {
  const g = VISUALS.night.grade;
  return [
    `#define NX_SHADOWS ${vec3(g.shadows)}`,
    `#define NX_SHADOW_AMOUNT ${g.shadowAmount.toFixed(4)}`,
    `#define NX_HIGHLIGHTS ${vec3(g.highlights)}`,
    `#define NX_HIGHLIGHT_AMOUNT ${g.highlightAmount.toFixed(4)}`,
    `#define NX_CONTRAST ${g.contrast.toFixed(4)}`,
    `#define NX_SATURATION ${g.saturation.toFixed(4)}`,
  ].join('\n');
}

let installed = false;

/** Replaces three's custom tone-mapping hook with the graded ACES (call before any material compiles). */
export function installGradedToneMapping(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.CustomToneMapping;
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `${gradeDefines()}\n${GRADED_TONE_MAP}\nvec3 CustomToneMapping( vec3 color ) { return nxGradedToneMap( color, toneMappingExposure ); }`,
  );
}
