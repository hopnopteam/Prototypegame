import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rect } from '../core/types';
import { inferSurface, SURFACES, type Surface, type SurfaceName } from './surfaces';

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
  /** What it is made of (physically based tiers): a preset name or explicit values; inferred when absent. */
  surface?: SurfaceName | Surface;
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
  /** Each part's paint (colour, second colour, pattern), kept for the geometry audit. */
  private readonly looks: string[] = [];
  /** Named objects (a bed, a sink, a towel stack) as part ranges, kept for the clipping audit. */
  private readonly marks: { label: string; from: number; to: number }[] = [];

  /**
   * Starts a named object: every part added until the next `object` or `endObject` belongs to it. The
   * clipping audit checks that no two objects (or an object and a wall) pass through each other.
   */
  object(label: string): this {
    this.endObject();
    this.marks.push({ label, from: this.parts.length, to: -1 });
    return this;
  }

  endObject(): this {
    const open = this.marks[this.marks.length - 1];
    if (open && open.to < 0) open.to = this.parts.length;
    return this;
  }

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
    const surfaceAttr = new Float32Array(count * 4);
    const type = style.pattern ?? 0;
    const scale = style.scale ?? 0.4;
    const surface = typeof style.surface === 'string' ? SURFACES[style.surface] : style.surface ?? inferSurface(color, type);
    // Stored as (smoothness, metalness, glow, 1 - sheen): a mesh without the attribute reads (0,0,0,1), matte.
    const smooth = 1 - surface.roughness;
    const metal = surface.metalness;
    const glow = surface.glow ?? 0;
    const sheen = surface.sheen ?? 0;
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
      surfaceAttr[i * 4] = smooth;
      surfaceAttr[i * 4 + 1] = metal;
      surfaceAttr[i * 4 + 2] = glow;
      surfaceAttr[i * 4 + 3] = 1 - sheen;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aColor2', new THREE.BufferAttribute(colors2, 3));
    g.setAttribute('aPattern', new THREE.BufferAttribute(pattern, 2));
    g.setAttribute('aSurface', new THREE.BufferAttribute(surfaceAttr, 4));
    this.parts.push(g);
    this.looks.push(`${color}|${style.color2 ?? ''}|${type}`);
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
  rounded(x: number, y: number, z: number, w: number, h: number, d: number, radius: number, color: string, style?: PartStyle, rotY = 0): this {
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
    return this.add(geometry, color, x, y, z, 0, rotY, 0, style);
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
    // Where each part starts (in vertices), so the geometry audit can tell parts of one mesh apart.
    const starts: number[] = [];
    let offset = 0;
    for (const part of this.parts) {
      starts.push(offset);
      offset += part.getAttribute('position').count;
    }
    merged.userData.partStarts = starts;
    merged.userData.partLooks = this.looks.slice();
    this.endObject();
    // Objects as vertex ranges [start, end).
    merged.userData.objects = this.marks
      .filter((m) => m.to > m.from)
      .map((m) => ({ label: m.label, start: starts[m.from], end: m.to < starts.length ? starts[m.to] : offset }));
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    this.looks.length = 0;
    this.marks.length = 0;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Joins textured planes (same material) into one geometry: one draw call for a set of signs, posters or decals. */
export function mergePlanes(planes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const p of planes) {
    vertices += p.getAttribute('position').count;
    indices += p.getIndex()?.count ?? 0;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index: number[] = [];
  let v = 0;
  for (const p of planes) {
    const pos = p.getAttribute('position');
    const nor = p.getAttribute('normal');
    const tex = p.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], (v + i) * 3);
      if (nor) normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], (v + i) * 3);
      uv.set([tex.getX(i), tex.getY(i)], (v + i) * 2);
    }
    const idx = p.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + v);
    v += pos.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  // Normals too: without them three switches to a flat-shading shader variant, compiled mid-game (session 19).
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Window panes: single vertical quads with their own uvs (the pane material paints the glow, the gradient
 * and the curtains) and a tint (the curtains' colour; white for none). A pane facing the room carries
 * uv.y in 1..2, so one material draws lamplit glass from outside and night glass from inside. No top or
 * edge faces, so nothing glows when seen from above.
 */
export class PaneBuilder {
  private readonly position: number[] = [];
  private readonly uv: number[] = [];
  private readonly color: number[] = [];
  private readonly normal: number[] = [];

  /** A pane spanning z0..z1 and y0..y1 in the plane x = `x`, facing +x (dir 1) or −x (dir −1). */
  paneX(x: number, y0: number, y1: number, z0: number, z1: number, dir: 1 | -1, inside: boolean, tint = '#FFFFFF'): this {
    const v = inside ? 1 : 0;
    const a = [x, y0, z0, 0, v];
    const b = [x, y0, z1, 1, v];
    const c = [x, y1, z1, 1, v + 1];
    const d = [x, y1, z0, 0, v + 1];
    // Counter-clockwise seen from the side the pane faces.
    const tris = dir > 0 ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    return this.push(tris, [dir, 0, 0], tint);
  }

  /** A pane spanning x0..x1 and y0..y1 in the plane z = `z`, facing +z (dir 1) or −z. */
  paneZ(z: number, y0: number, y1: number, x0: number, x1: number, dir: 1 | -1, inside: boolean, tint = '#FFFFFF'): this {
    const v = inside ? 1 : 0;
    const a = [x0, y0, z, 0, v];
    const b = [x1, y0, z, 1, v];
    const c = [x1, y1, z, 1, v + 1];
    const d = [x0, y1, z, 0, v + 1];
    const tris = dir > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    return this.push(tris, [0, 0, dir], tint);
  }

  private push(tris: number[][], n: number[], tint: string): this {
    tmpColor.set(tint);
    for (const t of tris) {
      this.position.push(t[0], t[1], t[2]);
      this.uv.push(t[3], t[4]);
      this.color.push(tmpColor.r, tmpColor.g, tmpColor.b);
      this.normal.push(n[0], n[1], n[2]);
    }
    return this;
  }

  get isEmpty(): boolean {
    return this.position.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
