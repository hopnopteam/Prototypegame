import * as THREE from 'three';
import { VISUALS, type QualityTier, type TierSettings } from '../config/visuals';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { LightMap } from './LightMap';
import { installGradedToneMapping } from './toneMap';
import type { Particles } from './Particles';
import { PostFx } from './PostFx';
import { clippedClones, MATERIALS, setLiteShading } from './materials';
import { detectTier, lowerTier, tierSettings, type QualitySetting } from './Quality';

/** A tiny triangle with every vertex attribute the game's materials read (stand-ins for the warm-up). */
function warmGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const set = (name: string, size: number): void => {
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * size).fill(0.5), size));
  };
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  set('normal', 3);
  set('uv', 2);
  set('color', 3);
  set('aColor2', 3);
  set('aPattern', 2);
  set('aSurface', 4);
  return g;
}

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
  /** Called when dynamic resolution settles on a new scale (the game remembers it for next launch). */
  onRenderScale: ((tier: QualityTier, scale: number) => void) | null = null;
  /** Called after a tier is applied (the lake switches reflections on or off). */
  readonly tierListeners: ((tier: TierSettings) => void)[] = [];
  private readonly contextAntialias: boolean;
  private pixelRatio = 1;
  private fx: PostFx | null = null;
  private preRender: PreRender | null = null;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  /** Dynamic resolution: the current window's frames, how many were slow, smooth time, and the ceiling. */
  private windowTime = 0;
  private windowFrames = 0;
  private windowSlow = 0;
  private smoothSeconds = 0;
  private floorSeconds = 0;
  private scaleCeiling = 1;
  /** When the scale last stepped up (a drop soon after means that scale is too much for this device). */
  private steppedUpAt = -1;
  private clock = 0;
  /** No judging the frame rate until this clock time (start-up, a hitch, a tier change). */
  private judgeFrom = 0;
  /** Auto on Low, still slow at the floor: frames held to the fallback rate (0 = no hold). */
  fpsHold = 0;
  /** The WebGL context was lost (a phone under memory pressure): nothing renders until it is restored. */
  contextLost = false;
  private particles: Particles | null = null;
  private width = 1;
  private height = 1;
  private readonly projected = new THREE.Vector3();
  /** Warm-up stand-ins kept alive so their shaders stay compiled (see warmUp). */
  private readonly warmMaterials: THREE.Material[] = [];
  /** Every material replaced by a tier change, old → new, so meshes built earlier can be moved over. */
  private readonly replaced = new Map<THREE.Material, THREE.Material>();

  /**
   * `startScale` is the render scale to open at (the one remembered from last time for this tier, or the
   * device's default from config): no stutter while it finds its feet.
   */
  constructor(private readonly canvas: HTMLCanvasElement, setting: QualitySetting, remembered: QualityTier | null, private readonly startScale: (tier: QualityTier) => number = () => 1) {
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.contextAntialias, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
    // A phone may drop the context under memory pressure: wait for it to come back instead of freezing on a
    // black canvas (three rebuilds its programs and uploads on the next render; the light maps and static
    // shadows are redrawn).
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.lightMap.invalidate();
      this.lighting.invalidateShadows();
      this.renderer.shadowMap.needsUpdate = true;
      this.judgeFrom = this.clock + VISUALS.quality.dynamicResolution.graceSeconds;
    });
    // Reading back every shader's log after compiling makes the browser wait for it (no parallel compiling):
    // only worth it while developing.
    this.renderer.debug.checkShaderErrors = false;
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

  /** Tools: switch lite shading on or off without changing the tier (A/B timing). */
  devLite(on: boolean): void {
    setLiteShading(on);
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

  /** Shader errors are reported (and compiles wait for them) only with the dev tools on. */
  set checkShaderErrors(on: boolean) {
    this.renderer.debug.checkShaderErrors = on;
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    const s = tierSettings(tier);
    const dr = VISUALS.quality.dynamicResolution;
    this.renderScale = this.dynamicResolution ? Math.min(1, Math.max(dr.minScale, dr.rememberFloor, this.startScale(tier))) : 1;
    this.scaleCeiling = 1;
    this.fpsHold = 0;
    this.judgeFrom = this.clock + dr.graceSeconds;
    this.resetWindow();
    this.updatePixelRatio();
    // Lite (per-vertex) shading on the phone tiers; set before anything compiles (see warmUp).
    setLiteShading(s.lite);
    // PCF filtering throughout; the soft tiers sample a wider radius (this three.js has no separate soft type).
    this.renderer.shadowMap.enabled = s.shadows !== 'off';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.lighting.setShadows(s.shadows, s.shadowMap, s.softShadows ? 4 : 1.5, this.renderer.capabilities.maxTextureSize);
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

  /** The shortest a frame may be (ms): the 60 fps cap, or the fallback hold on a device that cannot keep up. */
  get minFrameMs(): number {
    const q = VISUALS.quality;
    return this.fpsHold > 0 ? (1000 / this.fpsHold) * 0.92 : (1000 / q.maxFps) * q.skipShare;
  }

  render(dt: number): void {
    if (this.contextLost) return;
    this.trackFps(dt);
    this.lightMap.update();
    this.frameNo++;
    // Static shadows redraw only when the train changed; following shadows on the tier's cadence.
    if (this.lighting.shadowMode === 'static') {
      if (this.lighting.takeStaticRedraw()) this.renderer.shadowMap.needsUpdate = true;
    } else if (this.frameNo % tierSettings(this.tier).shadowInterval === 0) this.renderer.shadowMap.needsUpdate = true;
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    this.lighting.follow(this.rig.focusPoint, this.rig.viewDirection);
    this.fx?.setNight(this.lighting.night);
    this.renderer.info.reset();
    this.preRender?.render(this.renderer, this.scene, cam);
    if (this.fx) this.fx.render(dt);
    else this.renderer.render(this.scene, cam);
  }

  /**
   * Compiles every shader the game will need before the first frame. A shader first met mid-game (the
   * refurbishment wipe's clipped materials, a poster's texture, a new carriage) is compiled on the spot,
   * which stalls a phone for a few hundred milliseconds right at a big moment. Everything already built
   * (hidden parts included) compiles in parallel where the browser can; then one hidden render of stand-ins
   * for what comes later (and the moon's shadow pass) covers the rest. Resolves when done, or after
   * `timeoutMs` at most.
   */
  async warmUp(timeoutMs = 5000): Promise<void> {
    const group = new THREE.Group();
    const geometry = warmGeometry();
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    const materials: THREE.Material[] = [
      ...Object.values(MATERIALS),
      ...clippedClones(),
      new THREE.MeshLambertMaterial({ map: texture }),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
    ];
    for (const material of materials) {
      const mesh = new THREE.Mesh(geometry, material);
      const instanced = new THREE.InstancedMesh(geometry, material, 1);
      for (const m of [mesh, instanced]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.scale.setScalar(1e-3);
        m.position.copy(this.rig.focusPoint).setY(-6);
        group.add(m);
      }
    }
    const sprites = [
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }),
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, sizeAttenuation: false }),
    ];
    for (const material of sprites) group.add(Object.assign(new THREE.Sprite(material), { frustumCulled: false }));
    this.scene.add(group);
    const timeout = new Promise<void>((done) => setTimeout(done, timeoutMs));
    try {
      await Promise.race([this.renderer.compileAsync(this.scene, this.rig.camera), timeout]);
      // The shadow pass's depth shaders (and anything compileAsync left) compile on a real render.
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.rig.camera);
    } catch {
      // A failed warm-up only means shaders compile when first needed, as before.
    }
    this.scene.remove(group);
    // The stand-in materials are kept (never disposed): three frees a shader as soon as no material uses it,
    // and the textured ones are the only users until a poster or nameplate needs that shader later.
    this.warmMaterials.push(...materials.slice(-3), ...sprites);
    this.renderer.shadowMap.needsUpdate = true;
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
    this.clock += dt;
    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator >= 1) {
      const fps = this.fpsFrames / this.fpsAccumulator;
      this.smoothedFps = this.smoothedFps * 0.6 + fps * 0.4;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }
    if (!this.dynamicResolution) return;
    const dr = VISUALS.quality.dynamicResolution;
    // A single long frame is a hitch (a build, a texture upload), not a slow device: give it a moment.
    if (dt * 1000 > dr.hitchMs) this.judgeFrom = Math.max(this.judgeFrom, this.clock + dr.hitchGraceSeconds);
    if (this.clock < this.judgeFrom) {
      this.resetWindow();
      return;
    }
    // Judged on the share of slow frames in a window of a couple of seconds: sustained, not one stutter.
    this.windowTime += dt;
    this.windowFrames++;
    if (dt * 1000 > dr.slowFrameMs) this.windowSlow++;
    if (this.windowTime < dr.windowSeconds) return;
    const slow = this.windowSlow / Math.max(1, this.windowFrames) > dr.slowShare;
    const elapsed = this.windowTime;
    this.resetWindow();
    if (slow) {
      this.smoothSeconds = 0;
      // A scale that was just stepped up to and is already too slow is the ceiling for this session.
      if (this.steppedUpAt >= 0 && this.clock - this.steppedUpAt < dr.recoverSeconds * 1.5) this.scaleCeiling = Math.max(dr.minScale, this.renderScale - dr.stepUp);
      this.steppedUpAt = -1;
      if (this.renderScale > dr.minScale + 1e-3) {
        this.setRenderScale(Math.max(dr.minScale, this.renderScale - dr.stepDown), true);
        return;
      }
    } else {
      this.smoothSeconds += elapsed;
      if (this.smoothSeconds >= dr.recoverSeconds && this.renderScale < this.scaleCeiling - 1e-3) {
        this.smoothSeconds = 0;
        this.steppedUpAt = this.clock;
        this.setRenderScale(Math.min(this.scaleCeiling, this.renderScale + dr.stepUp), true);
      }
      // Held to 30 and smooth for a good while: try full rate again.
      if (this.fpsHold > 0 && this.smoothSeconds >= dr.recoverSeconds * 2) {
        this.fpsHold = 0;
        this.judgeFrom = this.clock + dr.hitchGraceSeconds;
      }
    }
    const atFloor = this.renderScale <= dr.minScale + 1e-3;
    this.floorSeconds = atFloor && slow ? this.floorSeconds + elapsed : 0;
    if (this.floorSeconds < VISUALS.quality.downgradeSeconds) return;
    this.floorSeconds = 0;
    // Auto steps down a tier (never up) only when even the lowest scale stays slow; on Low, an even 30.
    if (this.setting === 'auto' && this.tier !== 'low') {
      this.smoothedFps = 60;
      const next = lowerTier(this.tier);
      this.applyTier(next);
      this.onAutoTier?.(next);
    } else if (this.fpsHold === 0) {
      this.fpsHold = VISUALS.quality.fallbackFps;
      this.judgeFrom = this.clock + dr.hitchGraceSeconds;
    }
  }

  private resetWindow(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.windowSlow = 0;
  }

  private setRenderScale(scale: number, remember = false): void {
    this.renderScale = scale;
    if (remember) this.onRenderScale?.(this.tier, scale);
    this.updatePixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.fx?.setSize(this.width, this.height, this.pixelRatio);
    this.updateParticleScale();
  }

  private updateParticleScale(): void {
    this.particles?.setScale(this.rig.pixelScale(this.height * this.pixelRatio));
  }
}
