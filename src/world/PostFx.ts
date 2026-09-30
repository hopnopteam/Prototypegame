import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VISUALS, type TierSettings } from '../config/visuals';

/**
 * The colour grade, in display space after tone mapping: blue lifted into the shadows, warmth in the
 * highlights, a touch of contrast and saturation, and fine grain (which also hides banding in the dark sky).
 */
const GradeShader = {
  name: 'NightGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadows: { value: new THREE.Color() },
    uShadowAmount: { value: 0 },
    uHighlights: { value: new THREE.Color() },
    uHighlightAmount: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadows;
    uniform float uShadowAmount;
    uniform vec3 uHighlights;
    uniform float uHighlightAmount;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += uShadows * uShadowAmount * (1.0 - smoothstep(0.0, 0.55, l));
      c = mix(c, c * uHighlights, uHighlightAmount * smoothstep(0.4, 1.0, l));
      c = (c - 0.5) * uContrast + 0.5;
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, uSaturation);
      c += (hash(gl_FragCoord.xy) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

/**
 * Post-processing for the physically based tiers: MSAA scene render in half float (HDR), optional ambient
 * occlusion (ULTRA), bloom on everything brighter than white (windows, lamps, the moon on the water), ACES
 * tone mapping and sRGB output, then the grade.
 */
export class PostFx {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass | null = null;
  private readonly gtao: GTAOPass | null = null;
  private readonly grade: ShaderPass;
  private readonly bloomScale: number;
  /** Ambient occlusion sees the solid world only (no pads, bubbles or particles). */
  private readonly aoCamera: THREE.PerspectiveCamera | null = null;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, tier: TierSettings, width: number, height: number, pixelRatio: number) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier.msaa });
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
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    const g = VISUALS.night.grade;
    const u = this.grade.uniforms;
    u.uShadows.value = new THREE.Color(g.shadows);
    u.uShadowAmount.value = g.shadowAmount;
    u.uHighlights.value = new THREE.Color(g.highlights);
    u.uHighlightAmount.value = g.highlightAmount;
    u.uContrast.value = g.contrast;
    u.uSaturation.value = g.saturation;
    u.uGrain.value = g.grain;
    this.composer.addPass(this.grade);
    this.setSize(width, height, pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Bloom is soft by nature: a reduced buffer looks the same and costs a fraction.
    if (this.bloom) this.bloom.setSize(Math.max(64, width * pixelRatio * this.bloomScale), Math.max(64, height * pixelRatio * this.bloomScale));
  }

  /** How much of the grade applies (0 by day in the cycle, full at night). */
  setNight(night: number): void {
    const g = VISUALS.night.grade;
    const u = this.grade.uniforms;
    u.uShadowAmount.value = g.shadowAmount * night;
    u.uHighlightAmount.value = g.highlightAmount * night;
    if (this.bloom) this.bloom.strength = VISUALS.night.bloom.strength * (0.35 + 0.65 * night);
  }

  render(dt: number): void {
    this.time = (this.time + dt) % 1000;
    this.grade.uniforms.uTime.value = this.time;
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
