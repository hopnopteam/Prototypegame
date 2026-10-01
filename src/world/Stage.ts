import * as THREE from 'three';
import { VISUALS, type QualityTier, type TierSettings } from '../config/visuals';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { LightMap } from './LightMap';
import { installGradedToneMapping } from './toneMap';
import type { Particles } from './Particles';
import { PostFx } from './PostFx';
import { detectTier, lowerTier, tierSettings, type QualitySetting } from './Quality';

/** Something that renders before the main pass each frame (the lake's planar reflection). */
export interface PreRender {
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
}

/**
 * Renderer, scene, camera and the quality tier. Every tier shades the same (same materials, same baked
 * light); the tier sets resolution, shadow softness, bloom, antialiasing, reflections and ambient occlusion.
 * While playing, the render scale steps down when the frame rate sags (dynamic resolution) and creeps back
 * up; `auto` drops a tier only once the scale is at its floor and it is still slow.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly lighting: Lighting;
  readonly lightMap = new LightMap();
  /** Dynamic resolution: a share of the tier's pixel ratio (1 = full). */
  renderScale = 1;
  /** Off when a tier is forced for tools and screenshots (a software renderer is always "slow"). */
  dynamicResolution = true;
  /** What the player picked ('auto' by default) and the tier in use. */
  setting: QualitySetting;
  tier: QualityTier;
  smoothedFps = 60;
  /** Called when auto settles on a lower tier (the game remembers it for next time). */
  onAutoTier: ((tier: QualityTier) => void) | null = null;
  /** Called after a tier is applied (the lake switches reflections on or off). */
  readonly tierListeners: ((tier: TierSettings) => void)[] = [];
  private readonly contextAntialias: boolean;
  private pixelRatio = 1;
  private fx: PostFx | null = null;
  private preRender: PreRender | null = null;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private slowSeconds = 0;
  private fastSeconds = 0;
  private floorSeconds = 0;
  private particles: Particles | null = null;
  private width = 1;
  private height = 1;
  private readonly projected = new THREE.Vector3();
  /** Every material replaced by a tier change, old → new, so meshes built earlier can be moved over. */
  private readonly replaced = new Map<THREE.Material, THREE.Material>();

  constructor(private readonly canvas: HTMLCanvasElement, setting: QualitySetting, remembered: QualityTier | null) {
    this.setting = setting;
    // The tier must be known before the context exists (canvas antialiasing is fixed at creation). Detection
    // needs a context, so a throwaway one answers first.
    const probe = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: false });
    const detected = detectTier(probe);
    probe.dispose();
    probe.forceContextLoss();
    this.tier = setting === 'auto' ? remembered ?? detected : setting;
    // Without post-processing (Low) the canvas antialiases itself.
    const first = tierSettings(this.tier);
    this.contextAntialias = first.msaa === 0 && first.bloom === 0 && !first.fxaa;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.contextAntialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    // Only the refurbishment wipe uses clipping planes (on temporary material clones).
    this.renderer.localClippingEnabled = true;
    // Stats cover the whole frame (the reflection, the scene and every post pass), not just the last pass.
    this.renderer.info.autoReset = false;
    installGradedToneMapping(this.renderer);
    this.renderer.toneMappingExposure = VISUALS.night.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // Shadows are redrawn on the tier's cadence (see `shadowInterval`), never again by the reflection pass.
    this.renderer.shadowMap.autoUpdate = false;
    this.lighting = new Lighting(this.scene);
    this.scene.add(this.rig.camera);
    this.applyTier(this.tier);
    this.resize();
  }

  /** The detected tier for this device, for the settings sheet. */
  get tierLabel(): string {
    return tierSettings(this.tier).label;
  }

  get settings(): TierSettings {
    return tierSettings(this.tier);
  }

  /** Player's choice from Settings: a tier, or back to automatic. */
  setQuality(setting: QualitySetting, remembered: QualityTier | null): void {
    this.setting = setting;
    const tier = setting === 'auto' ? remembered ?? this.tier : setting;
    this.applyTier(tier);
  }

  setPreRender(pass: PreRender | null): void {
    this.preRender = pass;
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    const s = tierSettings(tier);
    this.renderScale = 1;
    this.updatePixelRatio();
    // PCF filtering throughout; the soft tiers sample a wider radius (this three.js has no separate soft type).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.lighting.setShadows(true, s.shadowMap, s.softShadows ? 4 : 1.5);
    this.renderer.shadowMap.needsUpdate = true;
    this.fx?.dispose();
    this.fx = null;
    // Post-processing when the tier blooms or antialiases offscreen; a canvas that cannot antialias itself
    // (it was created for a post-processed tier) always gets it.
    if (s.bloom > 0 || s.msaa > 0 || s.fxaa || !this.contextAntialias) {
      const tierForFx = s.msaa > 0 || s.fxaa ? s : { ...s, fxaa: true };
      this.fx = new PostFx(this.renderer, this.scene, this.rig.camera, tierForFx, this.width, this.height, this.pixelRatio);
    }
    for (const listen of this.tierListeners) listen(s);
    this.resize();
  }

  /** The tier's pixel ratio, capped by its pixel budget for this screen, times the dynamic render scale. */
  private updatePixelRatio(): void {
    const s = tierSettings(this.tier);
    const dpr = window.devicePixelRatio || 1;
    const css = Math.max(1, this.width * this.height);
    const budget = Math.sqrt((s.maxMegapixels * 1e6) / css);
    this.pixelRatio = Math.max(0.5, Math.min(dpr, s.pixelRatio, budget) * this.renderScale);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  /**
   * Moves every mesh onto the current version of its material (after a tier change, or once everything is
   * built: meshes made before the tier was applied still hold the defaults).
   */
  syncMaterials(): void {
    if (this.replaced.size === 0) return;
    const resolve = (m: THREE.Material): THREE.Material => {
      let next = m;
      for (let guard = 0; guard < 8 && this.replaced.has(next); guard++) next = this.replaced.get(next) as THREE.Material;
      return next;
    };
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const next = resolve(mesh.material);
      if (next !== mesh.material) mesh.material = next;
    });
  }

  attachParticles(particles: Particles): void {
    this.particles = particles;
    this.updateParticleScale();
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
    this.height = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
    this.updatePixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.fx?.setSize(this.width, this.height, this.pixelRatio);
    this.rig.resize(this.width / this.height);
    this.updateParticleScale();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Projects a world point to CSS pixels in the canvas, or null when behind the camera. */
  project(point: THREE.Vector3, out: { x: number; y: number }): boolean {
    const v = this.projected.copy(point).project(this.rig.camera);
    if (v.z > 1) return false;
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
    return true;
  }

  private frameNo = 0;

  render(dt: number): void {
    this.trackFps(dt);
    this.lightMap.update();
    this.frameNo++;
    if (this.frameNo % tierSettings(this.tier).shadowInterval === 0) this.renderer.shadowMap.needsUpdate = true;
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    this.lighting.follow(this.rig.focusPoint, this.rig.viewDirection);
    this.fx?.setNight(this.lighting.night);
    this.renderer.info.reset();
    this.preRender?.render(this.renderer, this.scene, cam);
    if (this.fx) this.fx.render(dt);
    else this.renderer.render(this.scene, cam);
  }

  /** Draw calls in the last frame, all passes included. */
  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  /** Triangles drawn in the last frame, all passes included. */
  get triangles(): number {
    return this.renderer.info.render.triangles;
  }

  private trackFps(dt: number): void {
    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator < 1) return;
    const fps = this.fpsFrames / this.fpsAccumulator;
    this.smoothedFps = this.smoothedFps * 0.6 + fps * 0.4;
    const elapsed = this.fpsAccumulator;
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;
    if (!this.dynamicResolution) return;
    // Dynamic resolution first: a lower render scale is invisible next to a stutter.
    const dr = VISUALS.quality.dynamicResolution;
    this.slowSeconds = this.smoothedFps < dr.targetFps ? this.slowSeconds + elapsed : 0;
    this.fastSeconds = this.smoothedFps > dr.targetFps + 6 ? this.fastSeconds + elapsed : 0;
    if (this.slowSeconds >= dr.settleSeconds && this.renderScale > dr.minScale + 1e-3) {
      this.slowSeconds = 0;
      this.setRenderScale(Math.max(dr.minScale, this.renderScale - dr.stepDown));
    } else if (this.fastSeconds >= dr.recoverSeconds && this.renderScale < 1) {
      this.fastSeconds = 0;
      this.setRenderScale(Math.min(1, this.renderScale + dr.stepUp));
    }
    // Auto steps down a tier (never up) only when even the lowest scale stays slow.
    if (this.setting !== 'auto' || this.tier === 'low') return;
    const atFloor = this.renderScale <= dr.minScale + 1e-3;
    this.floorSeconds = atFloor && this.smoothedFps < VISUALS.quality.downgradeFps ? this.floorSeconds + elapsed : 0;
    if (this.floorSeconds >= VISUALS.quality.downgradeSeconds) {
      this.floorSeconds = 0;
      this.smoothedFps = 60;
      const next = lowerTier(this.tier);
      this.applyTier(next);
      this.onAutoTier?.(next);
    }
  }

  private setRenderScale(scale: number): void {
    this.renderScale = scale;
    this.updatePixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.fx?.setSize(this.width, this.height, this.pixelRatio);
    this.updateParticleScale();
  }

  private updateParticleScale(): void {
    this.particles?.setScale(this.rig.pixelScale(this.height * this.pixelRatio));
  }
}
