import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rect } from '../core/types';

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3(1, 1, 1);
const tmpPos = new THREE.Vector3();

/** How a part is painted: an optional pattern (see materials.ts) and how much its base is shaded. */
export interface PartStyle {
  pattern?: number;
  color2?: string;
  /** Pattern cell size in metres. */
  scale?: number;
  /**
   * Brightness at the bottom of the part relative to its top (baked ambient occlusion). Defaults to a
   * gentle gradient on anything taller than a few centimetres, so objects sit on the floor.
   */
  shade?: number;
}

const DEFAULT_SHADE = 0.8;
const FLAT_PART = 0.1;

/**
 * Collects coloured primitives and merges them into one BufferGeometry with vertex colours, so a whole
 * carriage (walls, beds, desk…) is a single draw call. Every part also carries pattern attributes, and a
 * vertical light gradient is baked into its colours: darker where it meets the floor, bright on top.
 */
export class GeoBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0, style: PartStyle = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    tmpEuler.set(rotX, rotY, rotZ);
    tmpQuat.setFromEuler(tmpEuler);
    tmpPos.set(x, y, z);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    g.applyMatrix4(tmpMatrix);
    tmpColor.set(color);
    tmpColor2.set(style.color2 ?? color);
    const position = g.getAttribute('position');
    const count = position.count;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const vy = position.getY(i);
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    const height = maxY - minY;
    const shade = style.shade ?? (height > FLAT_PART ? DEFAULT_SHADE : 1);
    const colors = new Float32Array(count * 3);
    const colors2 = new Float32Array(count * 3);
    const pattern = new Float32Array(count * 2);
    const type = style.pattern ?? 0;
    const scale = style.scale ?? 0.4;
    for (let i = 0; i < count; i++) {
      const t = height > 1e-6 ? (position.getY(i) - minY) / height : 1;
      const k = shade + (1 - shade) * t;
      colors[i * 3] = tmpColor.r * k;
      colors[i * 3 + 1] = tmpColor.g * k;
      colors[i * 3 + 2] = tmpColor.b * k;
      colors2[i * 3] = tmpColor2.r * k;
      colors2[i * 3 + 1] = tmpColor2.g * k;
      colors2[i * 3 + 2] = tmpColor2.b * k;
      pattern[i * 2] = type;
      pattern[i * 2 + 1] = scale;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aColor2', new THREE.BufferAttribute(colors2, 3));
    g.setAttribute('aPattern', new THREE.BufferAttribute(pattern, 2));
    this.parts.push(g);
    return this;
  }

  /** Box by centre and size. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, rotY = 0, style?: PartStyle): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, 0, rotY, 0, style);
  }

  /** Box spanning a floor rect between two heights. */
  slab(r: Rect, y0: number, y1: number, color: string, dz = 0, inset = 0, style?: PartStyle): this {
    const w = r.x1 - r.x0 - inset * 2;
    const d = r.z1 - r.z0 - inset * 2;
    if (w <= 0 || d <= 0 || y1 <= y0) return this;
    return this.box((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2 + dz, w, y1 - y0, d, color, 0, style);
  }

  /** Box with rounded vertical edges (cushions, cabinets, bodies), `radius` in metres. */
  rounded(x: number, y: number, z: number, w: number, h: number, d: number, radius: number, color: string, style?: PartStyle): this {
    const r = Math.min(radius, w / 2 - 1e-3, d / 2 - 1e-3);
    const shape = new THREE.Shape();
    const hw = w / 2 - r;
    const hd = d / 2 - r;
    shape.moveTo(-hw, -d / 2);
    shape.lineTo(hw, -d / 2);
    shape.absarc(hw, -hd, r, -Math.PI / 2, 0, false);
    shape.lineTo(w / 2, hd);
    shape.absarc(hw, hd, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw, d / 2);
    shape.absarc(-hw, hd, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-w / 2, -hd);
    shape.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5, false);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, h / 2, 0);
    return this.add(geometry, color, x, y, z, 0, 0, 0, style);
  }

  cylinder(x: number, y: number, z: number, radiusTop: number, radiusBottom: number, height: number, color: string, segments = 10, axis: 'x' | 'y' | 'z' = 'y', style?: PartStyle): this {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    if (axis === 'x') return this.add(geometry, color, x, y, z, 0, 0, Math.PI / 2, style);
    if (axis === 'z') return this.add(geometry, color, x, y, z, Math.PI / 2, 0, 0, style);
    return this.add(geometry, color, x, y, z, 0, 0, 0, style);
  }

  /** Smooth sphere (or squashed ellipsoid via `sy`). */
  sphere(x: number, y: number, z: number, radius: number, color: string, detail = 1, sy = 1, style?: PartStyle): this {
    const segments = 6 + detail * 4;
    const geometry = new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.7)));
    if (sy !== 1) geometry.scale(1, sy, 1);
    return this.add(geometry, color, x, y, z, 0, 0, 0, style ?? { shade: 0.85 });
  }

  cone(x: number, y: number, z: number, radius: number, height: number, color: string, segments = 8, style?: PartStyle): this {
    return this.add(new THREE.ConeGeometry(radius, height, segments), color, x, y, z, 0, 0, 0, style);
  }

  /** Triangular prism roof along z, apex along the z axis. */
  prism(x: number, y: number, z: number, w: number, h: number, d: number, color: string, style?: PartStyle): this {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geometry.translate(0, 0, -d / 2);
    return this.add(geometry, color, x, y, z, 0, 0, 0, style ?? { shade: 1 });
  }

  /** Flat disc lying on the floor (rugs, plates, clock faces). */
  disc(x: number, y: number, z: number, radius: number, color: string, segments = 20, style?: PartStyle): this {
    return this.add(new THREE.CylinderGeometry(radius, radius, 0.01, segments), color, x, y, z, 0, 0, 0, style ?? { shade: 1 });
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}
