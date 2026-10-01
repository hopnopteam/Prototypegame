import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VISUALS, type TierSettings } from '../config/visuals';
import { GRADED_TONE_MAP, gradeDefines } from './toneMap';

/**
 * The final pass: the shared graded tone map (world/toneMap.ts), sRGB output, FXAA on the tiers that do not
 * multisample, and fine grain (which also hides banding in the dark sky).
 */
function finalShader(fxaa: boolean): THREE.ShaderMaterialParameters & { uniforms: Record<string, THREE.IUniform> } {
  return {
    name: 'NightFinal',
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: VISUALS.night.exposure },
      uGrain: { value: VISUALS.night.grade.grain },
      uTime: { value: 0 },
    },
    defines: fxaa ? { NX_FXAA: '' } : {},
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      uniform float uExposure;
      uniform float uGrain;
      uniform float uTime;
      varying vec2 vUv;
      ${gradeDefines()}
      ${GRADED_TONE_MAP}
      vec3 nxTone(vec3 c) { return nxGradedToneMap(c, uExposure); }
      float nxLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      vec3 nxSrgb(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
      void main() {
        vec3 c = nxTone(texture2D(tDiffuse, vUv).rgb);
        #ifdef NX_FXAA
        // FXAA (the compact "console" variant): blend along the local edge where luma contrast is high.
        vec3 nw = nxTone(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
        vec3 ne = nxTone(texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb);
        vec3 sw = nxTone(texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb);
        vec3 se = nxTone(texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb);
        float lNW = nxLuma(nw), lNE = nxLuma(ne), lSW = nxLuma(sw), lSE = nxLuma(se), lM = nxLuma(c);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
        float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        if (lMax - lMin > max(0.05, lMax * 0.125)) {
          vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
          float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
          float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
          dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
          vec3 a = 0.5 * (nxTone(texture2D(tDiffuse, vUv - dir * (1.0 / 6.0)).rgb) + nxTone(texture2D(tDiffuse, vUv + dir * (1.0 / 6.0)).rgb));
          vec3 b = a * 0.5 + 0.25 * (nxTone(texture2D(tDiffuse, vUv - dir * 0.5).rgb) + nxTone(texture2D(tDiffuse, vUv + dir * 0.5).rgb));
          float lB = nxLuma(b);
          c = (lB < lMin || lB > lMax) ? a : b;
        }
        #endif
        c = nxSrgb(c);
        c += (hash(gl_FragCoord.xy) - 0.5) * uGrain;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }
    `,
  };
}

/**
 * Post-processing: the scene in half float (HDR; multisampled on High and Ultra), optional ambient occlusion
 * (Ultra), bloom on everything brighter than white (lamps, the moon on the water), then one final pass:
 * the shared graded tone map, sRGB, FXAA on Medium, grain.
 */
export class PostFx {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass | null = null;
  private readonly gtao: GTAOPass | null = null;
  private readonly final: ShaderPass;
  private readonly bloomScale: number;
  /** Ambient occlusion sees the solid world only (no pads, bubbles or particles). */
  private readonly aoCamera: THREE.PerspectiveCamera | null = null;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, tier: TierSettings, width: number, height: number, pixelRatio: number) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier.msaa });
    // The scene renders linear and un-tone-mapped into the target; the final pass grades it.
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.addPass(new RenderPass(scene, camera));
    if (tier.ssao) {
      this.aoCamera = camera.clone();
      this.aoCamera.layers.set(0);
      const gtao = new GTAOPass(scene, this.aoCamera, width, height);
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
      gtao.blendIntensity = 0.75;
      this.gtao = gtao;
      this.composer.addPass(gtao);
    }
    this.bloomScale = tier.bloom;
    if (tier.bloom > 0) {
      const b = VISUALS.night.bloom;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(finalShader(tier.fxaa));
    // It tone-maps itself; three must not add its own tone-mapping chunk (which carries the same functions).
    this.final.material.toneMapped = false;
    this.composer.addPass(this.final);
    this.setSize(width, height, pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Bloom is soft by nature: a reduced buffer looks the same and costs a fraction.
    if (this.bloom) this.bloom.setSize(Math.max(64, width * pixelRatio * this.bloomScale), Math.max(64, height * pixelRatio * this.bloomScale));
    this.final.uniforms.uTexel.value.set(1 / Math.max(1, width * pixelRatio), 1 / Math.max(1, height * pixelRatio));
  }

  /** How much of the grade applies (0 by day in the cycle, full at night). */
  setNight(night: number): void {
    if (this.bloom) this.bloom.strength = VISUALS.night.bloom.strength * (0.35 + 0.65 * night);
  }

  render(dt: number): void {
    this.time = (this.time + dt) % 1000;
    this.final.uniforms.uTime.value = this.time;
    if (this.aoCamera) {
      const c = this.camera;
      this.aoCamera.position.copy(c.position);
      this.aoCamera.quaternion.copy(c.quaternion);
      this.aoCamera.fov = c.fov;
      this.aoCamera.aspect = c.aspect;
      this.aoCamera.near = c.near;
      this.aoCamera.far = c.far;
      this.aoCamera.updateProjectionMatrix();
      this.aoCamera.updateMatrixWorld();
    }
    this.composer.render(dt);
  }

  dispose(): void {
    this.bloom?.dispose();
    this.gtao?.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer.dispose();
  }
}
