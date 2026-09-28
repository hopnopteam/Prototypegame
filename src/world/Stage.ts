import * as THREE from 'three';
import { ECONOMY } from '../config/economy';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import type { Particles } from './Particles';

/**
 * Renderer, scene and camera plumbing. Resolution adapts to the device: if the smoothed frame rate stays
 * low, the pixel ratio drops so the game keeps its 60 fps target on mid-range phones.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly lighting: Lighting;
  private pixelRatio: number;
  private lowQuality = false;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  smoothedFps = 60;
  private particles: Particles | null = null;
  private width = 1;
  private height = 1;
  private readonly projected = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, ECONOMY.performance.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.lighting = new Lighting(this.scene);
    this.lighting.setShadows(true, this.pixelRatio > 1.5 ? 2048 : 1024);
    this.scene.add(this.rig.camera);
    this.resize();
  }

  attachParticles(particles: Particles): void {
    this.particles = particles;
    this.updateParticleScale();
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect?.width ?? window.innerWidth));
    this.height = Math.max(1, Math.floor(rect?.height ?? window.innerHeight));
    this.renderer.setSize(this.width, this.height, false);
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

  render(dt: number): void {
    this.trackFps(dt);
    this.lighting.follow(this.rig.focusPoint);
    this.renderer.render(this.scene, this.rig.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  setLowQuality(low: boolean): void {
    if (low === this.lowQuality) return;
    this.lowQuality = low;
    this.pixelRatio = low ? Math.min(this.pixelRatio, ECONOMY.performance.lowPixelRatio) : Math.min(window.devicePixelRatio || 1, ECONOMY.performance.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    // Shadows are the first thing a struggling phone gives up (a smaller map rather than none at all).
    this.lighting.setShadows(true, low ? 512 : this.pixelRatio > 1.5 ? 2048 : 1024);
    this.resize();
  }

  get isLowQuality(): boolean {
    return this.lowQuality;
  }

  private trackFps(dt: number): void {
    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator < 1) return;
    const fps = this.fpsFrames / this.fpsAccumulator;
    this.smoothedFps = this.smoothedFps * 0.6 + fps * 0.4;
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;
    if (!this.lowQuality && this.smoothedFps < ECONOMY.performance.downgradeFps && this.pixelRatio > ECONOMY.performance.lowPixelRatio) {
      this.setLowQuality(true);
    }
  }

  private updateParticleScale(): void {
    this.particles?.setScale(this.rig.pixelScale(this.height * this.pixelRatio));
  }
}
