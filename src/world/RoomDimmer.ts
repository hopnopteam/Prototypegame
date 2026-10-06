import * as THREE from 'three';
import { LIGHT_UNIFORMS } from './materials';

/** Texels per metre: a room's light fades over about one texel at its edge. */
const TEXELS_PER_METRE = 4;
/** Light levels are written in steps this fine, so a fade re-uploads the map a handful of times, not every frame. */
const LEVEL_STEPS = 16;

interface DimRoom {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  level: number;
}

/**
 * Each room's lamps on or off (session 22): lights out when a guest goes to sleep, and (later) a covered room
 * dark until it is revealed. A small one-channel map over the train scales the train's baked lamp light in
 * every lit material (`nxBaked`), so dimming a room costs one texture read, not a re-bake. The edge texels stay
 * lit, so everything outside the train reads full light.
 */
export class RoomDimmer {
  private texture: THREE.DataTexture;
  private data: Uint8Array;
  private width = 1;
  private height = 1;
  private x0 = 0;
  private z0 = 0;
  private readonly rooms = new Map<string, DimRoom>();
  private dirty = false;

  constructor() {
    this.data = new Uint8Array([255]);
    this.texture = this.makeTexture();
    LIGHT_UNIFORMS.uNxDimMap.value = this.texture;
  }

  /** The area the map covers (the train's footprint, with a margin); re-laid when the train grows. */
  setSpan(x0: number, x1: number, z0: number, z1: number): void {
    const width = Math.max(3, Math.ceil((x1 - x0) * TEXELS_PER_METRE) + 2);
    const height = Math.max(3, Math.ceil((z1 - z0) * TEXELS_PER_METRE) + 2);
    const ox = x0 - 1 / TEXELS_PER_METRE;
    const oz = z0 - 1 / TEXELS_PER_METRE;
    if (width === this.width && height === this.height && ox === this.x0 && oz === this.z0) return;
    this.width = width;
    this.height = height;
    this.x0 = ox;
    this.z0 = oz;
    this.data = new Uint8Array(width * height);
    this.texture.dispose();
    this.texture = this.makeTexture();
    LIGHT_UNIFORMS.uNxDimMap.value = this.texture;
    const ax = 1 / (width / TEXELS_PER_METRE);
    const az = 1 / (height / TEXELS_PER_METRE);
    LIGHT_UNIFORMS.uNxDimBox.value.set(ax, -ox * ax, az, -oz * az);
    this.dirty = true;
  }

  /** A room's lamp light, 0 (dark) to 1 (lit), over a world rectangle. */
  set(key: string, x0: number, z0: number, x1: number, z1: number, level: number): void {
    const stepped = Math.round(Math.min(1, Math.max(0, level)) * LEVEL_STEPS) / LEVEL_STEPS;
    const room = this.rooms.get(key);
    if (stepped >= 1) {
      if (room) {
        this.rooms.delete(key);
        this.dirty = true;
      }
      return;
    }
    if (room && room.level === stepped && room.x0 === x0 && room.z0 === z0 && room.x1 === x1 && room.z1 === z1) return;
    this.rooms.set(key, { x0, z0, x1, z1, level: stepped });
    this.dirty = true;
  }

  /** Every room lit again (a new game, a rebuilt train). */
  clear(): void {
    if (this.rooms.size === 0) return;
    this.rooms.clear();
    this.dirty = true;
  }

  /** Repaints and re-uploads the map if anything changed (once a frame at most). */
  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { data, width, height } = this;
    data.fill(255);
    for (const room of this.rooms.values()) {
      const value = Math.round(room.level * 255);
      const i0 = Math.max(1, Math.ceil((room.x0 - this.x0) * TEXELS_PER_METRE - 0.5));
      const i1 = Math.min(width - 2, Math.floor((room.x1 - this.x0) * TEXELS_PER_METRE - 0.5));
      const j0 = Math.max(1, Math.ceil((room.z0 - this.z0) * TEXELS_PER_METRE - 0.5));
      const j1 = Math.min(height - 2, Math.floor((room.z1 - this.z0) * TEXELS_PER_METRE - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) data[j * width + i] = Math.min(data[j * width + i], value);
    }
    this.texture.needsUpdate = true;
  }

  /** After a lost WebGL context: uploaded again on the next render. */
  invalidate(): void {
    this.texture.needsUpdate = true;
  }

  private makeTexture(): THREE.DataTexture {
    const t = new THREE.DataTexture(this.data, this.width, this.height, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  }
}
