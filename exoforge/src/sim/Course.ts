// A world's course: authored chunks stacked bottom to top (SPEC A7). Chunk coordinates are metres with the
// origin at the chunk's bottom-left; the course centres every chunk on x = 0 and stacks them upward.
import { RAPIER, LAYER, groups, type World } from './physics';

export type Point = [number, number];

export interface ChunkPolygon {
  id: string;
  /** A closed outline (the last point joins the first). Edges along the chunk's own border are seams, not walls. */
  points: Point[];
}

export interface ChunkLedge {
  id: string;
  x1: number;
  x2: number;
  y: number;
}

export interface ChunkMarker {
  kind: string;
  x: number;
  y: number;
}

export interface ChunkZone {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChunkData {
  id: string;
  world: number;
  name: string;
  width: number;
  height: number;
  terrain: ChunkPolygon[];
  ledges: ChunkLedge[];
  pickups: ChunkMarker[];
  hazards: ChunkMarker[];
  wind: ChunkZone[];
  /** The line bots and the debug overlay follow, bottom to top. */
  guide: Point[];
  /** Where decorations go (lanterns, beams, crystals). */
  decor: ChunkMarker[];
}

export interface CourseLedge {
  /** `<chunk id>.<ledge id>`, unique in the course. */
  id: string;
  chunk: number;
  x1: number;
  x2: number;
  y: number;
}

export interface CourseChunk {
  data: ChunkData;
  index: number;
  /** World position of the chunk's bottom-left corner. */
  x0: number;
  y0: number;
}

export interface Course {
  world: number;
  chunks: CourseChunk[];
  ledges: CourseLedge[];
  /** The launch ledge: the first ledge of the first chunk. */
  start: { x: number; y: number; ledge: string };
  /** Reaching this height (the suit's soles) is the exit. */
  exitY: number;
  top: number;
  width: number;
  guide: Point[];
}

const SEAM_EPS = 1e-6;

export function buildCourse(world: number, chunks: readonly ChunkData[]): Course {
  if (chunks.length === 0) throw new Error('A course needs at least one chunk');
  const width = chunks[0].width;
  let y0 = 0;
  const placed: CourseChunk[] = [];
  const ledges: CourseLedge[] = [];
  const guide: Point[] = [];
  chunks.forEach((data, index) => {
    const x0 = -data.width / 2;
    placed.push({ data, index, x0, y0 });
    for (const l of data.ledges) ledges.push({ id: `${data.id}.${l.id}`, chunk: index, x1: l.x1 + x0, x2: l.x2 + x0, y: l.y + y0 });
    for (const [x, y] of data.guide) guide.push([x + x0, y + y0]);
    y0 += data.height;
  });
  const first = ledges.find((l) => l.chunk === 0);
  if (!first) throw new Error(`Chunk ${chunks[0].id} needs a launch ledge`);
  return {
    world,
    chunks: placed,
    ledges,
    start: { x: (first.x1 + first.x2) / 2, y: first.y, ledge: first.id },
    exitY: y0 - 0.5,
    top: y0,
    width,
    guide,
  };
}

/** True if an edge lies along the chunk's border (a seam with the next chunk or the outside of the rock). */
export function isSeamEdge(a: Point, b: Point, width: number, height: number): boolean {
  const onLine = (va: number, vb: number, line: number) => Math.abs(va - line) < SEAM_EPS && Math.abs(vb - line) < SEAM_EPS;
  return onLine(a[0], b[0], 0) || onLine(a[0], b[0], width) || onLine(a[1], b[1], 0) || onLine(a[1], b[1], height);
}

/** The wall edges of a polygon (seams left out), as index pairs into its points. */
export function wallEdges(poly: ChunkPolygon, width: number, height: number): [number, number][] {
  const edges: [number, number][] = [];
  const n = poly.points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (!isSeamEdge(poly.points[i], poly.points[j], width, height)) edges.push([i, j]);
  }
  return edges;
}

/** Adds every chunk's walls to the physics world as static polylines. Returns the colliders' handles. */
export function addCourseColliders(world: World, course: Course, friction: number): Set<number> {
  const handles = new Set<number>();
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const chunk of course.chunks) {
    const { width, height } = chunk.data;
    for (const poly of chunk.data.terrain) {
      const edges = wallEdges(poly, width, height);
      if (edges.length === 0) continue;
      const vertices = new Float32Array(poly.points.length * 2);
      poly.points.forEach(([x, y], i) => {
        vertices[i * 2] = x + chunk.x0;
        vertices[i * 2 + 1] = y + chunk.y0;
      });
      const indices = new Uint32Array(edges.length * 2);
      edges.forEach(([a, b], i) => {
        indices[i * 2] = a;
        indices[i * 2 + 1] = b;
      });
      const desc = RAPIER.ColliderDesc.polyline(vertices, indices)
        .setFriction(friction)
        .setCollisionGroups(groups(LAYER.terrain, 0xffff));
      handles.add(world.createCollider(desc, body).handle);
    }
  }
  return handles;
}

// ---------------------------------------------------------------- checks (chunk editor, tests)

/** Open stretches of a horizontal line through the chunk (outside every polygon), sorted, in chunk x. */
export function openIntervals(chunk: ChunkData, y: number): [number, number][] {
  const xs: number[] = [];
  for (const poly of chunk.terrain) {
    const pts = poly.points;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
  }
  xs.sort((a, b) => a - b);
  // Even-odd: inside rock between pairs. Polygons do not overlap, so pairs alternate cleanly.
  const open: [number, number][] = [];
  let cursor = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i] > cursor + 1e-6) open.push([cursor, xs[i]]);
    cursor = xs[i + 1];
  }
  if (chunk.width > cursor + 1e-6) open.push([cursor, chunk.width]);
  return open;
}

/** The passage at a chunk's bottom (or top) edge, measured just inside it. */
export function seamOpening(chunk: ChunkData, side: 'bottom' | 'top'): [number, number][] {
  return openIntervals(chunk, side === 'bottom' ? 0.001 : chunk.height - 0.001);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Point-in-polygon (even-odd). */
export function insidePolygon(points: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Everything wrong with a chunk, in plain words (an empty list means it is fine). */
export function validateChunk(chunk: ChunkData): string[] {
  const issues: string[] = [];
  const { width, height } = chunk;
  if (!(width > 0 && height > 0)) issues.push('width and height must be positive');
  for (const poly of chunk.terrain) {
    const pts = poly.points;
    if (pts.length < 3) issues.push(`${poly.id}: needs at least 3 points`);
    for (const [x, y] of pts) {
      if (x < -SEAM_EPS || x > width + SEAM_EPS || y < -SEAM_EPS || y > height + SEAM_EPS) issues.push(`${poly.id}: point (${x}, ${y}) is outside the chunk`);
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) issues.push(`${poly.id}: points ${i} and ${(i + 1) % pts.length} are too close`);
      for (let j = i + 2; j < pts.length; j++) {
        if (i === 0 && j === pts.length - 1) continue;
        if (segmentsCross(a, b, pts[j], pts[(j + 1) % pts.length])) issues.push(`${poly.id}: edges ${i} and ${j} cross`);
      }
    }
  }
  for (const ledge of chunk.ledges) {
    if (ledge.x2 - ledge.x1 < 0.6) issues.push(`ledge ${ledge.id}: narrower than a suit`);
    // A ledge sits on a flat wall edge that covers most of it.
    let covered = 0;
    for (const poly of chunk.terrain) {
      for (const [a, b] of wallEdges(poly, width, height)) {
        const pa = poly.points[a];
        const pb = poly.points[b];
        if (Math.abs(pa[1] - ledge.y) > 0.05 || Math.abs(pb[1] - ledge.y) > 0.05) continue;
        const lo = Math.max(Math.min(pa[0], pb[0]), ledge.x1);
        const hi = Math.min(Math.max(pa[0], pb[0]), ledge.x2);
        if (hi > lo) covered += hi - lo;
      }
    }
    if (covered < 0.8 * (ledge.x2 - ledge.x1)) issues.push(`ledge ${ledge.id}: not on flat ground`);
    // Room for the suit to stand on it.
    for (const poly of chunk.terrain) {
      if (insidePolygon(poly.points, (ledge.x1 + ledge.x2) / 2, ledge.y + 1.0)) issues.push(`ledge ${ledge.id}: no headroom`);
    }
  }
  for (const [x, y] of chunk.guide) {
    for (const poly of chunk.terrain) if (insidePolygon(poly.points, x, y)) issues.push(`guide point (${x}, ${y}) is inside rock`);
  }
  return issues;
}

/** Problems joining one chunk's top to the next one's bottom. */
export function continuityIssues(lower: ChunkData, upper: ChunkData): string[] {
  const issues: string[] = [];
  if (Math.abs(lower.width - upper.width) > 1e-6) issues.push(`${lower.id} and ${upper.id} have different widths`);
  const top = seamOpening(lower, 'top');
  const bottom = seamOpening(upper, 'bottom');
  if (top.length !== bottom.length) {
    issues.push(`${lower.id} top has ${top.length} openings, ${upper.id} bottom has ${bottom.length}`);
    return issues;
  }
  top.forEach(([a, b], i) => {
    const [c, d] = bottom[i];
    if (Math.abs(a - c) > 0.05 || Math.abs(b - d) > 0.05) {
      issues.push(`${lower.id} top opening ${a.toFixed(2)}–${b.toFixed(2)} does not meet ${upper.id} bottom ${c.toFixed(2)}–${d.toFixed(2)}`);
    }
  });
  return issues;
}

/** Reads a chunk from parsed JSON, failing loudly with what is wrong (chunk files are hand- and editor-made). */
export function asChunk(raw: unknown): ChunkData {
  const c = raw as Partial<ChunkData> | null;
  const where = typeof c?.id === 'string' ? c.id : 'chunk';
  const isPoint = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number');
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') throw new Error(`${where}: missing id or name`);
  if (typeof c.width !== 'number' || typeof c.height !== 'number' || typeof c.world !== 'number') throw new Error(`${where}: missing size or world`);
  if (!Array.isArray(c.terrain) || !c.terrain.every((t) => typeof t.id === 'string' && Array.isArray(t.points) && t.points.every(isPoint))) {
    throw new Error(`${where}: terrain must be polygons of [x, y] points`);
  }
  if (!Array.isArray(c.ledges) || !Array.isArray(c.guide) || !c.guide.every(isPoint)) throw new Error(`${where}: ledges and guide are required`);
  return {
    id: c.id,
    world: c.world,
    name: c.name,
    width: c.width,
    height: c.height,
    terrain: c.terrain,
    ledges: c.ledges,
    pickups: c.pickups ?? [],
    hazards: c.hazards ?? [],
    wind: c.wind ?? [],
    guide: c.guide,
    decor: c.decor ?? [],
  };
}
