import * as THREE from 'three';
import { frameWork } from '../core/Background';
import { bakeLight, bakeSteps, type BakeInput, type BakedLight } from './lightBake';
import { LIGHT_UNIFORMS } from './materials';

/** A 1×1 map that reads as no light and no shade (no train yet, no platform in view). */
function neutralTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint16Array([0, 0, 0, THREE.DataUtils.toHalfFloat(1)]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  t.needsUpdate = true;
  return t;
}

interface Layer {
  texture: THREE.DataTexture;
  box: THREE.Vector4;
  /** The bake's world origin and texel size, to rebuild the box when the layer slides. */
  x0: number;
  z0: number;
  texel: number;
  width: number;
  height: number;
}

/**
 * The baked light maps every lit material reads (see world/lightBake.ts): one for the train, rebuilt when a
 * carriage joins or is refitted, and one for the platform, baked once per station and slid along with it.
 */
/** Milliseconds per frame given to a re-bake in progress (the old map shows until it is done). */
const BAKE_BUDGET_MS = 2;

/** A re-bake in progress: its slices, then the conversion to half floats, then the swap. */
type Job = Generator<void, void>;

export class LightMap {
  private train: Layer | null = null;
  private platform: Layer | null = null;
  private readonly neutral = neutralTexture();
  private trainJob: Job | null = null;
  private platformJob: Job | null = null;

  constructor() {
    LIGHT_UNIFORMS.uNxLightMap.value = this.neutral;
    LIGHT_UNIFORMS.uNxPlatMap.value = this.neutral;
  }

  /**
   * Bakes the train's light. The first bake happens at once (nothing shows unlit); later ones run a slice per
   * frame in `update`, the previous map showing until the new one is ready.
   */
  setTrain(input: BakeInput, immediate = !this.train): void {
    this.trainJob = this.job(input, (layer) => {
      this.train = layer;
      LIGHT_UNIFORMS.uNxLightMap.value = layer.texture;
      this.writeBox(layer, 0, LIGHT_UNIFORMS.uNxLightBox.value);
    }, () => this.train);
    if (immediate) this.finish('train');
  }

  /** Bakes the platform's light (or clears it), in the platform's own coordinates. */
  setPlatform(input: BakeInput | null): void {
    if (!input) {
      this.platformJob = null;
      LIGHT_UNIFORMS.uNxPlatMap.value = this.neutral;
      return;
    }
    this.platformJob = this.job(input, (layer) => {
      this.platform = layer;
      LIGHT_UNIFORMS.uNxPlatMap.value = layer.texture;
      this.writeBox(layer, this.platformOffset, LIGHT_UNIFORMS.uNxPlatBox.value);
    }, () => this.platform);
  }

  /** Advances any bake in progress within the frame's budget. */
  update(): void {
    if (!this.trainJob && !this.platformJob) return;
    const end = Math.min(performance.now() + BAKE_BUDGET_MS, frameWork.until);
    do {
      const job = this.trainJob ?? this.platformJob;
      if (!job) return;
      if (job.next().done) {
        if (job === this.trainJob) this.trainJob = null;
        else this.platformJob = null;
      }
    } while (performance.now() < end);
  }

  /** After a lost WebGL context: every map is uploaded again on the next render. */
  invalidate(): void {
    this.neutral.needsUpdate = true;
    if (this.train) this.train.texture.needsUpdate = true;
    if (this.platform) this.platform.texture.needsUpdate = true;
  }

  /** Runs a bake in progress to the end now (tools, tests, the first bake). */
  finish(which: 'train' | 'platform' = 'train'): void {
    const job = which === 'train' ? this.trainJob : this.platformJob;
    if (!job) return;
    while (!job.next().done) {
      // keep going
    }
    if (which === 'train') this.trainJob = null;
    else this.platformJob = null;
  }

  /** A bake for tools: the train's light computed now (not shown). */
  bakeNow(input: BakeInput): BakedLight {
    return bakeLight(input);
  }

  private *job(input: BakeInput, show: (layer: Layer) => void, current: () => Layer | null): Job {
    const baked = yield* bakeSteps(input);
    const half = new Uint16Array(baked.width * baked.height * 4);
    const slice = baked.width * 4 * 64;
    for (let i = 0; i < half.length; i++) {
      if (i % slice === 0) yield;
      half[i] = THREE.DataUtils.toHalfFloat(baked.data[i]);
    }
    show(this.upload(current(), baked, input, half));
  }

  private platformOffset = 0;

  /** Slides the platform's light along the train with the platform. */
  setPlatformOffset(dz: number): void {
    this.platformOffset = dz;
    if (this.platform) this.writeBox(this.platform, dz, LIGHT_UNIFORMS.uNxPlatBox.value);
  }

  private upload(layer: Layer | null, baked: BakedLight, input: BakeInput, half: Uint16Array): Layer {
    let texture = layer?.texture;
    if (!texture || !layer || layer.width !== baked.width || layer.height !== baked.height) {
      texture?.dispose();
      texture = new THREE.DataTexture(half, baked.width, baked.height, THREE.RGBAFormat, THREE.HalfFloatType);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
    } else {
      (texture.image.data as Uint16Array).set(half);
    }
    texture.needsUpdate = true;
    return { texture, box: new THREE.Vector4(), x0: input.box.x0, z0: input.box.z0, texel: input.texel, width: baked.width, height: baked.height };
  }

  /** World xz → texel-centred uv: u = (x − x0) / (texel · width) + 0.5 / width (and the same along z). */
  private writeBox(layer: Layer, dz: number, out: THREE.Vector4): void {
    const ax = 1 / (layer.texel * layer.width);
    const az = 1 / (layer.texel * layer.height);
    out.set(ax, -layer.x0 * ax + 0.5 / layer.width, az, -(layer.z0 + dz) * az + 0.5 / layer.height);
  }
}
