import * as THREE from 'three';
import { bakeLight, type BakeInput, type BakedLight } from './lightBake';
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
export class LightMap {
  private train: Layer | null = null;
  private platform: Layer | null = null;
  private readonly neutral = neutralTexture();

  constructor() {
    LIGHT_UNIFORMS.uNxLightMap.value = this.neutral;
    LIGHT_UNIFORMS.uNxPlatMap.value = this.neutral;
  }

  /** Bakes and shows the train's light. Returns the bake (for tools). */
  setTrain(input: BakeInput): BakedLight {
    const baked = bakeLight(input);
    this.train = this.upload(this.train, baked, input);
    LIGHT_UNIFORMS.uNxLightMap.value = this.train.texture;
    this.writeBox(this.train, 0, LIGHT_UNIFORMS.uNxLightBox.value);
    return baked;
  }

  /** Bakes the platform's light (or clears it), in the platform's own coordinates. */
  setPlatform(input: BakeInput | null): void {
    if (!input) {
      LIGHT_UNIFORMS.uNxPlatMap.value = this.neutral;
      return;
    }
    this.platform = this.upload(this.platform, bakeLight(input), input);
    LIGHT_UNIFORMS.uNxPlatMap.value = this.platform.texture;
    this.writeBox(this.platform, 0, LIGHT_UNIFORMS.uNxPlatBox.value);
  }

  /** Slides the platform's light along the train with the platform. */
  setPlatformOffset(dz: number): void {
    if (this.platform) this.writeBox(this.platform, dz, LIGHT_UNIFORMS.uNxPlatBox.value);
  }

  private upload(layer: Layer | null, baked: BakedLight, input: BakeInput): Layer {
    const n = baked.width * baked.height * 4;
    const half = new Uint16Array(n);
    for (let i = 0; i < n; i++) half[i] = THREE.DataUtils.toHalfFloat(baked.data[i]);
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
