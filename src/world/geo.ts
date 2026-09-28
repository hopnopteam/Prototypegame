import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rect } from '../core/types';

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3(1, 1, 1);
const tmpPos = new THREE.Vector3();

/**
 * Collects coloured primitives and merges them into one BufferGeometry with vertex colours, so a whole
 * carriage (walls, beds, desk…) is a single draw call. Faceted low-poly look comes from flat shading.
 */
export class GeoBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    tmpEuler.set(rotX, rotY, rotZ);
    tmpQuat.setFromEuler(tmpEuler);
    tmpPos.set(x, y, z);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    g.applyMatrix4(tmpMatrix);
    tmpColor.set(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  /** Box by centre and size. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, rotY = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, 0, rotY, 0);
  }

  /** Box spanning a floor rect between two heights. */
  slab(r: Rect, y0: number, y1: number, color: string, dz = 0, inset = 0): this {
    const w = r.x1 - r.x0 - inset * 2;
    const d = r.z1 - r.z0 - inset * 2;
    if (w <= 0 || d <= 0 || y1 <= y0) return this;
    return this.box((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2 + dz, w, y1 - y0, d, color);
  }

  cylinder(x: number, y: number, z: number, radiusTop: number, radiusBottom: number, height: number, color: string, segments = 8, axis: 'x' | 'y' | 'z' = 'y'): this {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    if (axis === 'x') return this.add(geometry, color, x, y, z, 0, 0, Math.PI / 2);
    if (axis === 'z') return this.add(geometry, color, x, y, z, Math.PI / 2, 0, 0);
    return this.add(geometry, color, x, y, z);
  }

  sphere(x: number, y: number, z: number, radius: number, color: string, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(radius, detail), color, x, y, z);
  }

  cone(x: number, y: number, z: number, radius: number, height: number, color: string, segments = 6): this {
    return this.add(new THREE.ConeGeometry(radius, height, segments), color, x, y, z);
  }

  /** Triangular prism roof along z, apex along the z axis. */
  prism(x: number, y: number, z: number, w: number, h: number, d: number, color: string): this {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geometry.translate(0, 0, -d / 2);
    return this.add(geometry, color, x, y, z);
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
