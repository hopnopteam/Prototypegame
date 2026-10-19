// Painted terrain (SPEC B9): each rock polygon is filled with a tiling texture in world space, and a textured
// edge strip runs along every wall (its lip on the collision line, the rest sunk into the rock). Only chunks near
// the camera are built.
import earcut from 'earcut';
import { Container, Mesh, MeshGeometry, Sprite } from 'pixi.js';
import { wallEdges, type Course, type CourseChunk, type ChunkPolygon } from '../sim/Course';
import { texture, entry } from './assets';
import { toScreenY } from './Stage';

/** Edge strip: how far the lip stands out into the passage and how deep the strip sinks into the rock, metres. */
const EDGE_LIP = 0.06;
const EDGE_DEPTH = 0.42;
/** The strip texture repeats every this many metres along the wall. */
const EDGE_TILE = 2.0;
/** The fill texture repeats every this many metres. */
const FILL_TILE = 4.0;
const MITER_MIN = 0.35;

/** Index sequences along a polygon's walls, split where the outline runs along a seam. */
export function wallRuns(poly: ChunkPolygon, width: number, height: number): number[][] {
  const n = poly.points.length;
  const walls = new Set(wallEdges(poly, width, height).map(([a]) => a));
  if (walls.size === 0) return [];
  if (walls.size === n) return [[...Array(n).keys(), 0]];
  const runs: number[][] = [];
  let start = 0;
  while (walls.has(start) || !walls.has((start + 1) % n)) start = (start + 1) % n;
  start = (start + 1) % n;
  let i = start;
  let run: number[] = [];
  for (let k = 0; k < n; k++) {
    if (walls.has(i)) {
      if (run.length === 0) run.push(i);
      run.push((i + 1) % n);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
    i = (i + 1) % n;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function signedArea(points: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) a += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1]);
  return a / 2;
}

function buildFill(poly: ChunkPolygon, x0: number, y0: number): Mesh {
  const flat: number[] = [];
  for (const [x, y] of poly.points) flat.push(x + x0, toScreenY(y + y0));
  const indices = earcut(flat);
  const positions = new Float32Array(flat);
  const uvs = new Float32Array(flat.length);
  for (let i = 0; i < flat.length; i += 2) {
    uvs[i] = flat[i] / FILL_TILE;
    uvs[i + 1] = flat[i + 1] / FILL_TILE;
  }
  return new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices: new Uint32Array(indices) }), texture: texture('terrain.w1.rock.fill') });
}

function buildEdge(poly: ChunkPolygon, run: number[], x0: number, y0: number): Mesh {
  const pts = run.map((i) => [poly.points[i][0] + x0, poly.points[i][1] + y0] as [number, number]);
  // Rock is on the left of a counter-clockwise outline (y up), so the passage is on the right.
  const side = signedArea(poly.points) > 0 ? 1 : -1;
  const closed = run[0] === run[run.length - 1];
  const count = pts.length;
  const normals: [number, number][] = [];
  for (let i = 0; i + 1 < count; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([(side * dy) / len, (-side * dx) / len]);
  }
  const positions = new Float32Array(count * 4);
  const uvs = new Float32Array(count * 4);
  let along = 0;
  for (let i = 0; i < count; i++) {
    const prev = i > 0 ? normals[i - 1] : closed ? normals[normals.length - 1] : normals[0];
    const next = i < normals.length ? normals[i] : closed ? normals[0] : normals[normals.length - 1];
    let nx = prev[0] + next[0];
    let ny = prev[1] + next[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const miter = 1 / Math.max(MITER_MIN, nx * next[0] + ny * next[1]);
    if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [px, py] = pts[i];
    positions[i * 4] = px + nx * EDGE_LIP * miter;
    positions[i * 4 + 1] = toScreenY(py + ny * EDGE_LIP * miter);
    positions[i * 4 + 2] = px - nx * EDGE_DEPTH * miter;
    positions[i * 4 + 3] = toScreenY(py - ny * EDGE_DEPTH * miter);
    uvs[i * 4] = along / EDGE_TILE;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = along / EDGE_TILE;
    uvs[i * 4 + 3] = 1;
  }
  const indices = new Uint32Array((count - 1) * 6);
  for (let i = 0; i + 1 < count; i++) {
    const a = i * 2;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  return new Mesh({ geometry: new MeshGeometry({ positions, uvs, indices }), texture: texture('terrain.w1.rock.edge') });
}

function decorSprite(kind: string, x: number, y: number): Sprite | null {
  const id = `decor.w1.${kind}`;
  let e;
  try {
    e = entry(id);
  } catch {
    return null;
  }
  const s = new Sprite(texture(id));
  s.anchor.set(e.pivot[0], e.pivot[1]);
  const [w, h] = e.worldSizeM ?? [1, 1];
  s.width = w;
  s.height = h;
  s.position.set(x, toScreenY(y));
  return s;
}

export class TerrainView {
  private readonly built = new Map<number, Container>();
  private readonly decorFor = new Map<number, Container>();

  constructor(
    private readonly course: Course,
    private readonly terrainLayer: Container,
    private readonly decorLayer: Container,
  ) {}

  /** Builds chunks within a chunk of the view and frees the rest. */
  update(camY: number, viewHeightM: number): void {
    const lo = camY - viewHeightM;
    const hi = camY + viewHeightM;
    for (const chunk of this.course.chunks) {
      const near = chunk.y0 + chunk.data.height > lo && chunk.y0 < hi;
      const have = this.built.get(chunk.index);
      if (near && !have) this.built.set(chunk.index, this.build(chunk));
      else if (!near && have) {
        have.destroy({ children: true });
        this.decorFor.get(chunk.index)?.destroy({ children: true });
        this.decorFor.delete(chunk.index);
        this.built.delete(chunk.index);
      }
    }
  }

  get builtCount(): number {
    return this.built.size;
  }

  private build(chunk: CourseChunk): Container {
    const group = new Container();
    const { width, height } = chunk.data;
    for (const poly of chunk.data.terrain) group.addChild(buildFill(poly, chunk.x0, chunk.y0));
    for (const poly of chunk.data.terrain) {
      for (const run of wallRuns(poly, width, height)) if (run.length > 1) group.addChild(buildEdge(poly, run, chunk.x0, chunk.y0));
    }
    this.terrainLayer.addChild(group);
    const decor = new Container();
    for (const d of chunk.data.decor) {
      const s = decorSprite(d.kind, d.x + chunk.x0, d.y + chunk.y0);
      if (s) decor.addChild(s);
    }
    this.decorLayer.addChild(decor);
    this.decorFor.set(chunk.index, decor);
    return group;
  }

  destroy(): void {
    for (const c of this.built.values()) c.destroy({ children: true });
    for (const c of this.decorFor.values()) c.destroy({ children: true });
    this.built.clear();
    this.decorFor.clear();
  }
}
