// A small browser tool to draw and edit course chunks (SPEC A7). Coordinates are chunk metres, origin bottom-left,
// y up. It checks the chunk live with the same functions the game and tests use.
import { asChunk, continuityIssues, seamOpening, validateChunk, type ChunkData, type Point } from '../../src/sim/Course';
import { formatChunkJson } from '../../src/sim/chunkFormat';

const files = import.meta.glob('../../src/content/chunks/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const library: ChunkData[] = Object.values(files).map(asChunk).sort((a, b) => a.id.localeCompare(b.id));

type Tool = 'select' | 'polygon' | 'insert' | 'delete' | 'ledge' | 'guide' | 'decor' | 'pickup' | 'hazard' | 'wind';
const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'Drag points, ledge ends and markers.'],
  ['polygon', 'Polygon', 'Click to add points; double-click or Enter to close it.'],
  ['insert', 'Insert', 'Click an edge to add a point on it.'],
  ['delete', 'Delete', 'Click a point, ledge, marker or guide point to remove it.'],
  ['ledge', 'Ledge', 'Drag along a flat top to mark a rest ledge.'],
  ['guide', 'Guide', 'Click to add the next guide point (bottom to top).'],
  ['decor', 'Decor', 'Click to place a decoration of the marker kind.'],
  ['pickup', 'Pickup', 'Click to place a pickup of the marker kind.'],
  ['hazard', 'Hazard', 'Click to place a hazard of the marker kind.'],
  ['wind', 'Wind', 'Drag a rectangle for a wind zone of the marker kind.'],
];

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let chunk: ChunkData = structuredClone(library[0] ?? blank('w1_01'));
let tool: Tool = 'select';
let draft: Point[] | null = null;
let drag: { kind: string; a: number; b?: number; start?: Point } | null = null;
let hover: Point = [0, 0];
let scale = 30;
let ox = 40;
let oy = 20;

function blank(id: string): ChunkData {
  return { id, world: Number(id.slice(1, id.indexOf('_'))) || 1, name: 'New chunk', width: 10, height: 21, terrain: [], ledges: [], pickups: [], hazards: [], wind: [], guide: [], decor: [] };
}

function neighbours(): { below: ChunkData | null; above: ChunkData | null } {
  const prefix = chunk.id.split('_')[0];
  const same = library.filter((c) => c.id.startsWith(`${prefix}_`));
  const j = same.findIndex((c) => c.id === chunk.id);
  return { below: j > 0 ? same[j - 1] : null, above: j >= 0 && j + 1 < same.length ? same[j + 1] : null };
}

// ------------------------------------------------------------ view
function fit(): void {
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * devicePixelRatio;
  canvas.height = r.height * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  // Fit the chunk plus a third of each neighbour.
  const span = chunk.height * 1.6;
  scale = Math.min((r.height - 40) / span, (r.width - 80) / chunk.width);
  ox = (r.width - chunk.width * scale) / 2;
  oy = r.height / 2 + (chunk.height / 2) * scale;
  draw();
}
const sx = (x: number) => ox + x * scale;
const sy = (y: number) => oy - y * scale;
function toChunk(e: MouseEvent): Point {
  const r = canvas.getBoundingClientRect();
  let x = (e.clientX - r.left - ox) / scale;
  let y = (oy - (e.clientY - r.top)) / scale;
  if ($<HTMLInputElement>('snap').checked) {
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
  }
  return [x, y];
}

function polyPath(points: readonly Point[], dy = 0): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y + dy)) : ctx.lineTo(sx(x), sy(y + dy))));
  ctx.closePath();
}

function draw(): void {
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  // Grid: 1 m lines, 5 m stronger.
  for (let x = 0; x <= chunk.width; x++) line(sx(x), sy(-chunk.height), sx(x), sy(chunk.height * 2), x % 5 === 0 ? '#3a3446' : '#26222f');
  for (let y = -Math.ceil(chunk.height); y <= chunk.height * 2; y++) line(sx(0), sy(y), sx(chunk.width), sy(y), y % 5 === 0 ? '#3a3446' : '#26222f');
  // Neighbours as ghosts.
  const { below, above } = neighbours();
  ctx.globalAlpha = 0.28;
  if (below) for (const p of below.terrain) fillPoly(p.points, -below.height, '#7a6a60');
  if (above) for (const p of above.terrain) fillPoly(p.points, chunk.height, '#7a6a60');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff55';
  ctx.strokeRect(sx(0), sy(chunk.height), chunk.width * scale, chunk.height * scale);
  for (const p of chunk.terrain) {
    fillPoly(p.points, 0, '#5a4a42');
    ctx.strokeStyle = '#c9b49c';
    ctx.lineWidth = 2;
    polyPath(p.points);
    ctx.stroke();
    for (const [x, y] of p.points) dot(x, y, 4, '#fff2d6');
  }
  if (draft) {
    ctx.strokeStyle = '#4fd1c5';
    ctx.beginPath();
    draft.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
    ctx.lineTo(sx(hover[0]), sy(hover[1]));
    ctx.stroke();
    for (const [x, y] of draft) dot(x, y, 4, '#4fd1c5');
  }
  ctx.lineWidth = 5;
  for (const l of chunk.ledges) {
    line(sx(l.x1), sy(l.y), sx(l.x2), sy(l.y), '#ffb547');
    text(l.id, sx((l.x1 + l.x2) / 2), sy(l.y) - 8, '#ffb547');
  }
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#4fd1c5';
  ctx.beginPath();
  chunk.guide.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of chunk.guide) dot(x, y, 3, '#4fd1c5');
  for (const w of chunk.wind) {
    ctx.fillStyle = '#6cb6f033';
    ctx.fillRect(sx(w.x), sy(w.y + w.h), w.w * scale, w.h * scale);
    text(w.kind, sx(w.x) + 4, sy(w.y + w.h) + 14, '#6cb6f0', 'left');
  }
  const marker = (list: { kind: string; x: number; y: number }[], color: string) => list.forEach((m) => {
    dot(m.x, m.y, 6, color);
    text(m.kind, sx(m.x), sy(m.y) - 10, color);
  });
  marker(chunk.decor, '#c9a0ff');
  marker(chunk.pickups, '#8fe06b');
  marker(chunk.hazards, '#ff5a3a');
  // Seam openings, so joins are easy to line up.
  for (const [side, y] of [['bottom', 0], ['top', chunk.height]] as const) {
    for (const [a, b] of seamOpening(chunk, side)) {
      ctx.lineWidth = 3;
      line(sx(a), sy(y), sx(b), sy(y), '#7dff7a');
      text(`${a.toFixed(2)}–${b.toFixed(2)}`, sx((a + b) / 2), sy(y) + (side === 'bottom' ? 16 : -6), '#7dff7a');
    }
  }
  ctx.lineWidth = 1;
  text(`${hover[0].toFixed(2)}, ${hover[1].toFixed(2)} m`, 8, 16, '#b8aac4', 'left');
}

function line(x1: number, y1: number, x2: number, y2: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function dot(x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2);
  ctx.fill();
}
function fillPoly(points: readonly Point[], dy: number, color: string): void {
  ctx.fillStyle = color;
  polyPath(points, dy);
  ctx.fill('evenodd');
}
function text(t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = '12px system-ui';
  ctx.fillText(t, x, y);
}

// ------------------------------------------------------------ picking
const near = (a: Point, b: Point, px = 9) => Math.hypot((a[0] - b[0]) * scale, (a[1] - b[1]) * scale) < px;
function pickVertex(p: Point): { a: number; b: number } | null {
  for (let a = 0; a < chunk.terrain.length; a++) {
    const pts = chunk.terrain[a].points;
    for (let b = 0; b < pts.length; b++) if (near(pts[b], p)) return { a, b };
  }
  return null;
}
function pickMarker(p: Point): { kind: 'decor' | 'pickups' | 'hazards'; a: number } | null {
  for (const kind of ['decor', 'pickups', 'hazards'] as const) {
    const i = chunk[kind].findIndex((m) => near([m.x, m.y], p));
    if (i >= 0) return { kind, a: i };
  }
  return null;
}
function pickLedgeEnd(p: Point): { a: number; b: number } | null {
  for (let a = 0; a < chunk.ledges.length; a++) {
    const l = chunk.ledges[a];
    if (near([l.x1, l.y], p)) return { a, b: 1 };
    if (near([l.x2, l.y], p)) return { a, b: 2 };
  }
  return null;
}
function pickEdge(p: Point): { a: number; b: number; at: Point } | null {
  for (let a = 0; a < chunk.terrain.length; a++) {
    const pts = chunk.terrain[a].points;
    for (let b = 0; b < pts.length; b++) {
      const [x1, y1] = pts[b];
      const [x2, y2] = pts[(b + 1) % pts.length];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy || 1)));
      const at: Point = [x1 + dx * t, y1 + dy * t];
      if (near(at, p, 7)) return { a, b, at };
    }
  }
  return null;
}

// ------------------------------------------------------------ editing
canvas.addEventListener('mousemove', (e) => {
  hover = toChunk(e);
  if (drag) {
    const [x, y] = hover;
    if (drag.kind === 'vertex') chunk.terrain[drag.a].points[drag.b!] = [x, y];
    else if (drag.kind === 'ledgeEnd') {
      const l = chunk.ledges[drag.a];
      if (drag.b === 1) l.x1 = x;
      else l.x2 = x;
      l.y = y;
    } else if (drag.kind === 'decor' || drag.kind === 'pickups' || drag.kind === 'hazards') Object.assign(chunk[drag.kind][drag.a], { x, y });
    else if (drag.kind === 'guide') chunk.guide[drag.a] = [x, y];
    changed(false);
  }
  draw();
});

canvas.addEventListener('mousedown', (e) => {
  const p = toChunk(e);
  const kind = $<HTMLInputElement>('kind').value.trim() || 'lantern';
  if (tool === 'select') {
    const v = pickVertex(p);
    if (v) return void (drag = { kind: 'vertex', ...v });
    const l = pickLedgeEnd(p);
    if (l) return void (drag = { kind: 'ledgeEnd', ...l });
    const m = pickMarker(p);
    if (m) return void (drag = { kind: m.kind, a: m.a });
    const g = chunk.guide.findIndex((q) => near(q, p));
    if (g >= 0) drag = { kind: 'guide', a: g };
  } else if (tool === 'polygon') {
    draft = [...(draft ?? []), p];
  } else if (tool === 'insert') {
    const edge = pickEdge(p);
    if (edge) chunk.terrain[edge.a].points.splice(edge.b + 1, 0, edge.at.map((v) => Math.round(v * 100) / 100) as Point);
    changed();
  } else if (tool === 'delete') {
    const v = pickVertex(p);
    if (v) {
      chunk.terrain[v.a].points.splice(v.b, 1);
      if (chunk.terrain[v.a].points.length < 3) chunk.terrain.splice(v.a, 1);
    } else {
      const m = pickMarker(p);
      if (m) chunk[m.kind].splice(m.a, 1);
      const g = chunk.guide.findIndex((q) => near(q, p));
      if (g >= 0) chunk.guide.splice(g, 1);
      const l = chunk.ledges.findIndex((q) => p[0] >= q.x1 && p[0] <= q.x2 && Math.abs(p[1] - q.y) * scale < 8);
      if (l >= 0) chunk.ledges.splice(l, 1);
    }
    changed();
  } else if (tool === 'ledge' || tool === 'wind') {
    drag = { kind: tool, a: 0, start: p };
  } else if (tool === 'guide') {
    chunk.guide.push(p);
    changed();
  } else {
    const list = tool === 'decor' ? chunk.decor : tool === 'pickup' ? chunk.pickups : chunk.hazards;
    list.push({ kind, x: p[0], y: p[1] });
    changed();
  }
});

window.addEventListener('mouseup', (e) => {
  if (drag?.start && (drag.kind === 'ledge' || drag.kind === 'wind')) {
    const p = toChunk(e);
    const [x0, y0] = drag.start;
    if (drag.kind === 'ledge' && Math.abs(p[0] - x0) > 0.3) {
      const n = chunk.ledges.length;
      chunk.ledges.push({ id: n === 0 ? 'L0' : `L${n}`, x1: Math.min(x0, p[0]), x2: Math.max(x0, p[0]), y: y0 });
    } else if (drag.kind === 'wind' && Math.abs(p[0] - x0) > 0.3 && Math.abs(p[1] - y0) > 0.3) {
      chunk.wind.push({ kind: $<HTMLInputElement>('kind').value.trim() || 'updraft', x: Math.min(x0, p[0]), y: Math.min(y0, p[1]), w: Math.abs(p[0] - x0), h: Math.abs(p[1] - y0) });
    }
    changed();
  }
  if (drag) changed();
  drag = null;
});

function closeDraft(): void {
  if (draft && draft.length >= 3) chunk.terrain.push({ id: `poly${chunk.terrain.length + 1}`, points: draft });
  draft = null;
  changed();
}
canvas.addEventListener('dblclick', closeDraft);
window.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('input')) return;
  if (e.key === 'Enter') closeDraft();
  if (e.key === 'Escape') {
    draft = null;
    draw();
  }
});

function changed(full = true): void {
  if (full) {
    $<HTMLInputElement>('id').value = chunk.id;
    $<HTMLInputElement>('name').value = chunk.name;
    $<HTMLInputElement>('width').value = String(chunk.width);
    $<HTMLInputElement>('height').value = String(chunk.height);
  }
  const { below, above } = neighbours();
  const issues = [...validateChunk(chunk), ...(below ? continuityIssues(below, chunk) : []), ...(above ? continuityIssues(chunk, above) : [])];
  const box = $('issues');
  box.textContent = issues.length ? issues.join('\n') : 'All good: valid, and it joins its neighbours.';
  box.classList.toggle('ok', issues.length === 0);
  draw();
}

// ------------------------------------------------------------ panel
function load(c: ChunkData): void {
  chunk = structuredClone(c);
  draft = null;
  changed();
  fit();
}
const pick = $<HTMLSelectElement>('pick');
for (const c of library) pick.append(new Option(`${c.id} · ${c.name}`, c.id));
pick.addEventListener('change', () => load(library.find((c) => c.id === pick.value)!));
$('new').addEventListener('click', () => load(blank(`w1_${String(library.length + 1).padStart(2, '0')}`)));
for (const key of ['id', 'name', 'width', 'height'] as const) {
  $<HTMLInputElement>(key).addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (key === 'width' || key === 'height') chunk[key] = Number(v);
    else chunk[key] = v;
    changed();
    fit();
  });
}
const tools = $('tools');
for (const [id, label, help] of TOOLS) {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = help;
  b.addEventListener('click', () => {
    tool = id;
    draft = null;
    tools.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    $('help').textContent = help;
    draw();
  });
  if (id === 'select') b.classList.add('on');
  tools.append(b);
}
$('help').textContent = TOOLS[0][2];
const json = () => formatChunkJson(chunk);
const status = (t: string) => ($('status').textContent = t);
$('save').addEventListener('click', async () => {
  try {
    const r = await fetch('/__chunks/save', { method: 'POST', body: json() });
    const out = (await r.json()) as { ok: boolean; file?: string; error?: string };
    status(out.ok ? `Saved ${out.file}` : `Not saved: ${out.error}`);
  } catch {
    status('Saving needs the dev server (npm run chunks); use Copy or Download.');
  }
});
$('copy').addEventListener('click', () => navigator.clipboard.writeText(json()).then(() => status('Copied'), () => status('Copy refused by the browser')));
$('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
  a.download = `${chunk.id}.json`;
  a.click();
});
window.addEventListener('resize', fit);
load(chunk);
