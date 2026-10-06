import * as THREE from 'three';
import { rect, type Rect } from '../core/types';
import type { GeoBuilder, PartStyle } from './geo';
import { DOOR_Z0, DOOR_Z1, HALF_WIDTH, INNER, PARTITION_X0, PARTITION_X1, QUEUE_SLOTS, REAR_VESTIBULE, type CarriageLayout } from './layout';
import { FLOOR_Y } from './CarriageView';
import { PATTERN } from './materials';
import { seeded } from './Mess';
import { PALETTE, shadeHex, type CarriageTheme } from './palette';

/**
 * Floors tell the rags-to-riches story at a glance, tier by tier:
 *
 * 0 Run-down: real grey planks with open seams over a dark subfloor and joists, and one hole per room (a
 *   board or two missing, splintered ends, the joists below). Washrooms have dingy tiles, one missing.
 * 1 Repaired: the same boards, sanded to honey and tightened; each hole has a new board in exactly its place,
 *   a shade lighter than the rest. Tiles regrouted, the missing one replaced.
 *
 * Session 20 (owner: "weird textures issues all over the floor"): at phone size the old floor read as noise:
 * narrow boards each in one of six contrasting shades, random joints, a split and a warped board and nail
 * heads in every room, and bright patches where the repairs were. Boards are now wider, in three close shades,
 * jointed in a regular stagger, and the damage is one clear hole per room.
 * 2 Cosy: polished oak boards; the lobby gets a waiting-room rug and a doormat.
 * 3 Luxurious: walnut chevron parquet in a border in every room; a grand rug in the lobby.
 * 4 (passenger carriages, Royal Suite): marble checker in a dark red border with a gold line.
 *
 * Damage never sits on a pad, a doorway, a guest's spot or under furniture (where it would be hidden
 * anyway), so the floor tells the story without getting in the way.
 */

/** Room floors sit this far above the corridor (their thresholds cover the step). */
const ROOM_LIFT = 0.006;
/** Plank thickness, and the joists they rest on. */
const PLANK_T = 0.045;
const JOIST_H = 0.05;
const JOIST_SPACING = 0.6;
/** Board width and length (session 20: 0.19 m boards of random length read as noise on a phone). */
const BOARD = 0.3;
const BOARD_LENGTH = 2.1;
const TILE = 0.25;
const FLAT: PartStyle = { shade: 1 };

/** Three close shades per tier (a whisper of variety, never a pattern of its own). */
const OLD_TONES = ['#8D8476', '#918879', '#898072'];
const REPAIRED_TONES = ['#C6A97E', '#C9AD82', '#C2A57A'];
/** The board laid where a hole was: a shade lighter than its neighbours, so the repair reads without shouting. */
const PATCH_TONE = '#D0B489';
/**
 * What shows through a hole and the open seams: a dark timber subfloor and lighter joists (session 17: was near
 * black, so a missing board read as a black square cut out of the picture rather than a hole with depth).
 */
const SUBFLOOR = '#3B2F27';
const JOIST = '#76604C';
const TILE_OLD = ['#CFC8B9', '#CBC4B5', '#D2CBBD'];
const TILE_REPAIRED = ['#ECE9E2', '#E9E6DE'];
const TILE_NEW = '#F2F0EA';
const GROUT_OLD = '#4F4A44';
const GROUT_NEW = '#B9B4AA';

export interface FloorResult {
  /** Height the lobby's painted queue places should sit on (a rug lifts them). */
  queueBase: number;
}

interface Hole extends Rect {
  /** Strip index range it removes. */
  s0: number;
  s1: number;
}

/** Everything a floor must keep clear of: pads, doorways, guest spots, furniture. */
function keepOuts(layout: CarriageLayout): { rects: Rect[]; circles: { x: number; z: number; r: number }[] } {
  const rects: Rect[] = [];
  const circles: { x: number; z: number; r: number }[] = [];
  // Furniture (beds too: a mattress would hide the damage) and a margin round it.
  for (const p of layout.props) rects.push(rect(p.rect.x0 - 0.06, p.rect.z0 - 0.06, p.rect.x1 + 0.06, p.rect.z1 + 0.06));
  for (const a of Object.values(layout.anchors)) circles.push({ x: a.x, z: a.z, r: 0.5 });
  for (const q of layout.queue) circles.push({ x: q.x, z: q.z, r: 0.4 });
  for (const c of layout.cabins) {
    const heart = c.spots[0] ?? c.center;
    circles.push({ x: heart.x, z: heart.z, r: 0.55 });
    // The mess slots round the cleaning spot, the tip pile, where a new guest stands by the bed.
    for (const o of [[-0.38, -0.82], [0.4, -0.82], [-0.38, 0.82]]) circles.push({ x: heart.x + o[0], z: heart.z + o[1], r: 0.3 });
    circles.push({ x: c.tipPile.x, z: c.tipPile.z, r: 0.3 });
    circles.push({ x: c.bed.x0 - 0.24, z: (c.bed.z0 + c.bed.z1) / 2, r: 0.3 });
    rects.push(rect(PARTITION_X0 - 0.35, c.door[0] - 0.08, PARTITION_X1 + 0.35, c.door[1] + 0.08));
  }
  for (const b of layout.bathrooms) {
    circles.push({ x: b.restock.x, z: b.restock.z, r: 0.55 }, { x: b.useSpot.x, z: b.useSpot.z, r: 0.4 });
    rects.push(rect(PARTITION_X0 - 0.35, b.door[0] - 0.08, PARTITION_X1 + 0.35, b.door[1] + 0.08));
  }
  // Platform doors, the gangways and the vestibules at each end.
  for (const x of [-1, 1]) rects.push(rect(x > 0 ? INNER - 0.9 : -INNER, DOOR_Z0 - 0.2, x > 0 ? INNER : -INNER + 0.9, DOOR_Z1 + 0.2));
  rects.push(rect(-0.9, 0, 0.9, 0.9), rect(-INNER, layout.length - REAR_VESTIBULE - 0.1, INNER, layout.length));
  return { rects, circles };
}

/** Whether a rect stays clear of every keep-out (`relax` shrinks the round ones, for small damage). */
function clear(r: Rect, ko: ReturnType<typeof keepOuts>, relax = 1): boolean {
  for (const k of ko.rects) if (r.x0 < k.x1 && r.x1 > k.x0 && r.z0 < k.z1 && r.z1 > k.z0) return false;
  for (const c of ko.circles) {
    const dx = Math.max(r.x0 - c.x, 0, c.x - r.x1);
    const dz = Math.max(r.z0 - c.z, 0, c.z - r.z1);
    if (dx * dx + dz * dz < c.r * c.r * relax * relax) return false;
  }
  return true;
}

/** The floor split into rooms and the open floor around them (a clean set of non-overlapping rects). */
function regions(layout: CarriageLayout): { room: boolean; tiled: boolean; r: Rect }[] {
  const rooms = [
    ...layout.cabins.map((c) => ({ r: c.room, tiled: false })),
    ...layout.bathrooms.map((b) => ({ r: b.room, tiled: true })),
  ];
  const X0 = -HALF_WIDTH + 0.02;
  const X1 = HALF_WIDTH - 0.02;
  const Z0 = 0.02;
  const Z1 = layout.length - 0.02;
  const xs = [...new Set([X0, X1, ...rooms.flatMap((o) => [o.r.x0, o.r.x1])])].sort((a, b) => a - b);
  const out: { room: boolean; tiled: boolean; r: Rect }[] = rooms.map((o) => ({ room: true, tiled: o.tiled, r: o.r }));
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (b - a < 1e-3) continue;
    // Free z intervals in this column once the rooms that span it are taken out.
    const taken = rooms.filter((o) => o.r.x0 <= a + 1e-4 && o.r.x1 >= b - 1e-4).map((o) => [o.r.z0, o.r.z1]).sort((p, q) => p[0] - q[0]);
    let z = Z0;
    for (const [t0, t1] of taken) {
      if (t0 - z > 1e-3) out.push({ room: false, tiled: false, r: rect(a, z, b, t0) });
      z = Math.max(z, t1);
    }
    if (Z1 - z > 1e-3) out.push({ room: false, tiled: false, r: rect(a, z, b, Z1) });
  }
  return out;
}

/** Picks up to `count` holes in a region: one or two boards wide, clear of every keep-out. */
function pickHoles(r: Rect, strip: number, count: number, rand: () => number, ko: ReturnType<typeof keepOuts>, big = false): Hole[] {
  const holes: Hole[] = [];
  const strips = Math.floor((r.x1 - r.x0) / strip);
  // A proper hole if one fits; failing that, one missing short piece of board in a tighter spot.
  for (let attempt = 0; attempt < 200 && holes.length < count; attempt++) {
    const small = attempt >= 120;
    const relax = small ? 0.7 : 1;
    const wide = !small && rand() < (big ? 0.7 : 0.45) ? 2 : 1;
    const s0 = 1 + Math.floor(rand() * Math.max(1, strips - 1 - wide));
    const s1 = s0 + wide - 1;
    // Corridor holes are long enough that a joist shows across them; room holes stay modest.
    const len = small ? 0.16 + rand() * 0.08 : big ? 0.5 + rand() * 0.3 : 0.26 + rand() * 0.3;
    // Try the front of the region first: the camera looks up the train, so the far side of a room's
    // back wall is the part of the floor it sees least.
    const reach = attempt < 60 ? 0.55 : 1;
    const z0 = r.z0 + 0.12 + rand() * Math.max(0, (r.z1 - r.z0 - 0.24 - len) * reach);
    const h: Hole = { x0: r.x0 + s0 * strip, x1: Math.min(r.x1, r.x0 + (s1 + 1) * strip), z0, z1: z0 + len, s0, s1 };
    if (h.x1 > r.x1 - 0.1 || h.z1 > r.z1 - 0.1) continue;
    const pad = rect(h.x0 - 0.05, h.z0 - 0.05, h.x1 + 0.05, h.z1 + 0.05);
    if (!clear(pad, ko, relax) || holes.some((o) => pad.x0 < o.x1 + 0.3 && pad.x1 > o.x0 - 0.3 && pad.z0 < o.z1 + 0.3 && pad.z1 > o.z0 - 0.3)) continue;
    holes.push(h);
  }
  return holes;
}

/**
 * Boards along z across a region, jointed in a regular stagger. Tier 0: weathered, open seams, one hole (a
 * missing stretch with splintered ends). Tier 1: the same boards sanded and tight, a new board in the hole.
 */
function boardField(f: GeoBuilder, r: Rect, top: number, tier: number, rand: () => number, ko: ReturnType<typeof keepOuts>, room: boolean): void {
  const seam = tier <= 0 ? 0.007 : 0.003;
  const strips = Math.max(1, Math.round((r.x1 - r.x0) / BOARD));
  const w = (r.x1 - r.x0) / strips;
  // One hole per room, and one per long run of corridor (a short strip of open floor has none).
  const holes = pickHoles(r, w, room ? 1 : r.z1 - r.z0 > 6 && r.x1 - r.x0 > 0.9 ? 1 : 0, rand, ko, !room);
  if ((globalThis as { __floorDebug?: string[] }).__floorDebug) (globalThis as { __floorDebug?: string[] }).__floorDebug!.push(`${room ? 'room' : 'open'} ${r.x0.toFixed(2)},${r.z0.toFixed(2)}-${r.x1.toFixed(2)},${r.z1.toFixed(2)} holes ${holes.map((h) => `${h.x0.toFixed(2)},${h.z0.toFixed(2)}`).join(' ')}`);
  const bottom = top - PLANK_T;
  const y = (top + bottom) / 2;
  const tones = tier <= 0 ? OLD_TONES : REPAIRED_TONES;
  const phase = rand();
  for (let s = 0; s < strips; s++) {
    const x0 = r.x0 + s * w + seam / 2;
    const x1 = r.x0 + (s + 1) * w - seam / 2;
    const cx = (x0 + x1) / 2;
    const bw = x1 - x0;
    // Each strip starts a golden-ratio share of a board further back than its neighbour: joints that never
    // line up, in a rhythm the eye reads as one floor.
    let z = r.z0 - ((phase + s * 0.618) % 1) * BOARD_LENGTH;
    let k = 0;
    while (z < r.z1) {
      const len = BOARD_LENGTH;
      const a = Math.max(r.z0, z) + (z > r.z0 ? seam / 2 : 0);
      const b = Math.min(r.z1, z + len) - (z + len < r.z1 ? seam / 2 : 0);
      z += len;
      const board = tones[(s * 2 + k++) % tones.length];
      if (b - a < 0.05) continue;
      const hole = holes.find((h) => s >= h.s0 && s <= h.s1 && h.z0 < b && h.z1 > a);
      if (!hole) {
        plank(f, cx, y, a, b, bw, board);
        continue;
      }
      if (tier <= 0) {
        // A missing stretch: the board stops short on either side with splintered ends.
        // (A joint can fall inside the hole: each board only breaks at the edge it actually reaches.)
        if (hole.z0 - a > 0.04) plank(f, cx, y, a, hole.z0, bw, board);
        if (b - hole.z1 > 0.04) plank(f, cx, y, hole.z1, b, bw, board);
        if (a < hole.z0 && b > hole.z0) splinters(f, cx, bw, y, hole.z0, 1, rand, board);
        if (a < hole.z1 && b > hole.z1) splinters(f, cx, bw, y, hole.z1, -1, rand, board);
      } else {
        // Repaired: the old board up to the patch, a new board across it.
        if (hole.z0 - a > 0.04) plank(f, cx, y, a, hole.z0 - seam / 2, bw, board);
        if (b - hole.z1 > 0.04) plank(f, cx, y, hole.z1 + seam / 2, b, bw, board);
        plank(f, cx, y, Math.max(a, hole.z0 + seam / 2), Math.min(b, hole.z1 - seam / 2), bw, PATCH_TONE);
      }
    }
  }
}

function plank(f: GeoBuilder, cx: number, y: number, z0: number, z1: number, width: number, color: string): void {
  f.box(cx, y, (z0 + z1) / 2, width, PLANK_T, z1 - z0, color, 0, { shade: 0.97 });
}

/** A broken board end: a few ragged fingers of wood reaching into the hole. */
function splinters(f: GeoBuilder, cx: number, bw: number, y: number, edge: number, dir: 1 | -1, rand: () => number, color: string): void {
  let x = cx - bw / 2;
  while (x < cx + bw / 2 - 0.02) {
    const piece = Math.min(cx + bw / 2 - x, 0.025 + rand() * 0.04);
    const reach = 0.015 + rand() * 0.05;
    const z0 = dir > 0 ? edge : edge - reach;
    f.box(x + piece / 2, y - 0.002, z0 + reach / 2, piece - 0.004, PLANK_T - 0.004, reach, color, 0, { shade: 0.9 });
    x += piece;
  }
}

/** Tiles over grout: tier 0 dingy with gaps and a crack, tier 1 regrouted with a few bright new tiles. */
function tileField(f: GeoBuilder, r: Rect, top: number, tier: number, rand: () => number, ko: ReturnType<typeof keepOuts>): void {
  const grout = tier <= 0 ? 0.006 : 0.004;
  f.slab(r, top - 0.012, top - 0.006, tier <= 0 ? GROUT_OLD : GROUT_NEW, 0, 0, FLAT);
  const nx = Math.max(1, Math.round((r.x1 - r.x0) / TILE));
  const nz = Math.max(1, Math.round((r.z1 - r.z0) / TILE));
  const tw = (r.x1 - r.x0) / nx;
  const td = (r.z1 - r.z0) / nz;
  // One missing tile per room (session 20: was three damaged tiles), never under a pad or a fitting.
  const damaged = new Map<string, 'missing' | 'cracked'>();
  for (let attempt = 0; attempt < 30 && damaged.size < 1; attempt++) {
    const i = 1 + Math.floor(rand() * Math.max(1, nx - 2));
    const j = 1 + Math.floor(rand() * Math.max(1, nz - 2));
    const cell = rect(r.x0 + i * tw - 0.05, r.z0 + j * td - 0.05, r.x0 + (i + 1) * tw + 0.05, r.z0 + (j + 1) * td + 0.05);
    if (!clear(cell, ko) || damaged.has(`${i},${j}`)) continue;
    damaged.set(`${i},${j}`, damaged.size === 0 ? 'missing' : 'cracked');
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = r.x0 + i * tw + grout / 2;
      const z0 = r.z0 + j * td + grout / 2;
      const w = tw - grout;
      const d = td - grout;
      const state = damaged.get(`${i},${j}`);
      const tones = tier <= 0 ? TILE_OLD : TILE_REPAIRED;
      const color = tones[(i + j * 2) % tones.length];
      if (state && tier >= 1) {
        f.box(x0 + w / 2, top - 0.003, z0 + d / 2, w, 0.006, d, TILE_NEW, 0, FLAT);
        continue;
      }
      if (state === 'missing') continue;
      if (state === 'cracked') {
        const cut = d * (0.35 + rand() * 0.3);
        f.box(x0 + w / 2, top - 0.003, z0 + cut / 2 - 0.002, w, 0.006, cut - 0.004, color, 0, FLAT);
        f.box(x0 + w / 2, top - 0.003, z0 + cut + (d - cut) / 2 + 0.002, w, 0.006, d - cut - 0.004, color, 0.04, FLAT);
        continue;
      }
      f.box(x0 + w / 2, top - 0.003, z0 + d / 2, w, 0.006, d, color, 0, FLAT);
    }
  }
}

/** A rug: plain layered slabs (no pattern can crawl) with a border, stacked a few millimetres apart. */
function rug(f: GeoBuilder, r: Rect, base: number, layers: { color: string; inset: number; pattern?: PartStyle }[]): number {
  const step = 0.005;
  layers.forEach((layer, i) => f.slab(r, base + i * step, base + (i + 1) * step, layer.color, 0, layer.inset, layer.pattern ?? FLAT));
  return base + layers.length * step;
}

/**
 * Builds a carriage's whole floor for its tier into `f` (the floor builder, which glows warm at night).
 * Returns what other floor dressing needs to know.
 */
export function buildFloor(f: GeoBuilder, layout: CarriageLayout, tier: number, theme: CarriageTheme, seed: number): FloorResult {
  const steps = floorSteps(f, layout, tier, theme, seed);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/**
 * The floor a room at a time (session 16): the run-down tiers lay every plank, seam, hole and patch by hand,
 * about 20 ms for a carriage on a desktop, so a refit during play lays it over several frames.
 */
export function* floorSteps(f: GeoBuilder, layout: CarriageLayout, tier: number, theme: CarriageTheme, seed: number): Generator<void, FloorResult, void> {
  const L = layout.length;
  const ko = keepOuts(layout);
  let queueBase = FLOOR_Y;
  if (tier <= 1) {
    // Subfloor and joists: only ever seen through seams and holes.
    f.box(0, FLOOR_Y - PLANK_T - JOIST_H - 0.02, L / 2, HALF_WIDTH * 2 - 0.04, 0.04, L - 0.04, SUBFLOOR, 0, { shade: 0.75 });
    for (let z = 0.3; z < L - 0.1; z += JOIST_SPACING) f.box(0, FLOOR_Y - PLANK_T - JOIST_H / 2, z, HALF_WIDTH * 2 - 0.1, JOIST_H, 0.07, JOIST, 0, FLAT);
    for (const region of regions(layout)) {
      const top = FLOOR_Y + (region.room ? ROOM_LIFT : 0);
      // Same seed per region at every tier, so the repairs land exactly where the damage was.
      const local = seeded(seed * 131 + Math.round(region.r.x0 * 100) * 7 + Math.round(region.r.z0 * 100));
      if (region.tiled) tileField(f, region.r, top, tier, local, ko);
      else boardField(f, region.r, top, tier, local, ko, region.room);
      yield;
    }
    if (layout.type === 'lobby' && tier >= 1) {
      // A coir doormat inside the platform door: the first thing a repaired lobby offers.
      rug(f, rect(INNER - 0.62, DOOR_Z0 + 0.12, INNER - 0.08, DOOR_Z1 - 0.12), FLOOR_Y, [{ color: '#8A6B45', inset: 0 }, { color: '#A8875B', inset: 0.04 }]);
    }
    venueCarpets(f, layout, theme);
    return { queueBase };
  }
  // Cosy and Luxurious: one sound base of wide boards, rooms laid over it, and rugs.
  f.box(0, FLOOR_Y - 0.03, L / 2, HALF_WIDTH * 2 - 0.04, 0.06, L - 0.04, PALETTE.boards, 0, { pattern: PATTERN.boards, color2: PALETTE.boardsSeam, scale: 0.3, shade: 1 });
  for (const cabin of layout.cabins) {
    if (tier >= 4) marbleRoom(f, cabin.room);
    else if (tier >= 3) parquetRoom(f, cabin.room);
    else f.slab(cabin.room, FLOOR_Y, FLOOR_Y + ROOM_LIFT, PALETTE.boardsPolished, 0, 0, { pattern: PATTERN.boards, color2: PALETTE.boardsSeam, scale: 0.3, shade: 1 });
  }
  // A suite's lounge and dining table stand on rugs (never near the door, where the cleaning spot and the
  // mess are).
  for (const cabin of layout.cabins) {
    const room = cabin.room;
    const inRoom = layout.props.filter((p) => p.rect.z0 >= room.z0 && p.rect.z1 <= room.z1 && p.rect.x0 >= room.x0);
    const sofa = inRoom.find((p) => p.kind === 'sofa');
    const table = inRoom.find((p) => p.kind === 'table');
    const dining = inRoom.find((p) => p.kind === 'dining');
    const base = FLOOR_Y + ROOM_LIFT;
    const layers = (gold: boolean): { color: string; inset: number; pattern?: PartStyle }[] => [
      { color: gold ? PALETTE.gold : theme.deep, inset: 0 },
      { color: theme.deep, inset: 0.035 },
      { color: '#F1E7D4', inset: 0.1 },
      { color: theme.deep, inset: 0.13, pattern: { pattern: PATTERN.diamond, color2: shadeHex(theme.deep, 20), scale: 0.2, shade: 1 } },
    ];
    if (sofa && table) rug(f, rect(table.rect.x0 - 0.22, sofa.rect.z0 + 0.04, sofa.rect.x1 - 0.02, sofa.rect.z1 - 0.04), base, layers(tier >= 5));
    if (dining) rug(f, rect(dining.rect.x0 - 0.06, dining.rect.z0 - 0.06, dining.rect.x1 + 0.06, dining.rect.z1 + 0.06), base, layers(true));
  }
  for (const bath of layout.bathrooms) {
    const style = tier >= 3
      ? { pattern: PATTERN.diamond, color2: '#D9DEE3', scale: 0.24, shade: 1 }
      : { pattern: PATTERN.checker, color2: '#DCE3E0', scale: 0.3, shade: 1 };
    f.slab(bath.room, FLOOR_Y, FLOOR_Y + ROOM_LIFT, '#F4F1EA', 0, 0, style);
  }
  if (layout.type === 'lobby') {
    rug(f, rect(INNER - 0.62, DOOR_Z0 + 0.12, INNER - 0.08, DOOR_Z1 - 0.12), FLOOR_Y, [{ color: theme.deep, inset: 0 }, { color: '#B08E62', inset: 0.035 }]);
    // The waiting rug under the queue: the painted places sit on top of it.
    const xs = QUEUE_SLOTS.map((q) => q.x);
    const zs = QUEUE_SLOTS.map((q) => q.z);
    const area = rect(Math.min(...xs) - 0.42, Math.min(...zs) - 0.42, Math.max(...xs) + 0.42, Math.max(...zs) + 0.42);
    queueBase = tier >= 3
      ? rug(f, area, FLOOR_Y, [
        { color: PALETTE.gold, inset: 0 },
        { color: theme.deep, inset: 0.04 },
        { color: '#F4EBDA', inset: 0.12 },
        { color: theme.deep, inset: 0.16, pattern: { pattern: PATTERN.diamond, color2: shadeHex(theme.deep, 22), scale: 0.18, shade: 1 } },
      ])
      : rug(f, area, FLOOR_Y, [{ color: theme.deep, inset: 0 }, { color: '#EFE5D2', inset: 0.06 }]);
  }
  venueCarpets(f, layout, theme);
  return { queueBase };
}

/**
 * A venue's floor coverings (session 21): each refit lays its own (a jute runner, the venue's runner, a Persian rug,
 * the bar's plaid, the picture palace's red carpet, the café's marble checker, the dome's starry carpet). Plain
 * layered slabs like every rug, the pattern only on the top one.
 */
function venueCarpets(f: GeoBuilder, layout: CarriageLayout, theme: CarriageTheme): void {
  const venue = layout.venue;
  if (!venue) return;
  const base = FLOOR_Y + ROOM_LIFT + 0.001;
  const deep = theme.deep;
  for (const c of venue.carpets) {
    switch (c.style) {
      case 'jute':
        rug(f, c.rect, base, [{ color: '#A88E66', inset: 0 }, { color: '#C2AA82', inset: 0.04, pattern: { pattern: PATTERN.checker, color2: '#B59C74', scale: 0.05, shade: 1 } }]);
        break;
      case 'runner':
        rug(f, c.rect, base, [
          { color: '#C9A45C', inset: 0 },
          { color: deep, inset: 0.04 },
          { color: deep, inset: 0.1, pattern: { pattern: PATTERN.diamond, color2: shadeHex(deep, 16), scale: 0.22, shade: 1 } },
        ]);
        break;
      case 'persian':
        rug(f, c.rect, base, [
          { color: '#3A1A22', inset: 0 },
          { color: '#C9A45C', inset: 0.04 },
          { color: '#EAD9B8', inset: 0.07 },
          { color: deep, inset: 0.14, pattern: { pattern: PATTERN.diamond, color2: shadeHex(deep, 12), scale: 0.13, shade: 1 } },
        ]);
        break;
      case 'plaid':
        rug(f, c.rect, base, [
          { color: '#4A3022', inset: 0 },
          { color: '#C9AA82', inset: 0.06, pattern: { pattern: PATTERN.plaid, color2: '#6E4C34', scale: 0.2, shade: 1, surface: 'fabric' } },
        ]);
        break;
      case 'theatre':
        // A deep wine carpet with a small gold figure (the seats in brighter red stand out on it).
        rug(f, c.rect, base, [
          { color: '#C9A45C', inset: 0 },
          { color: '#4E1420', inset: 0.05, pattern: { pattern: PATTERN.dots, color2: '#A47A3A', scale: 0.22, shade: 1, surface: 'velvet' } },
        ]);
        break;
      case 'checker':
        rug(f, c.rect, base, [
          { color: '#5A564F', inset: 0 },
          { color: '#EFE9DE', inset: 0.07, pattern: { pattern: PATTERN.checker, color2: '#8A847A', scale: 0.36, shade: 1, surface: 'marble' } },
        ]);
        break;
      case 'starry':
        rug(f, c.rect, base, [
          { color: '#C9A45C', inset: 0 },
          { color: '#2C3C62', inset: 0.05, pattern: { pattern: PATTERN.dots, color2: '#C9A45C', scale: 0.3, shade: 1 } },
        ]);
        break;
    }
  }
}

/** The Royal Suite: cream and grey marble in a checker, framed in dark red marble with a gold line. */
function marbleRoom(f: GeoBuilder, r: Rect): void {
  const border = 0.1;
  const y0 = FLOOR_Y;
  const y1 = FLOOR_Y + ROOM_LIFT;
  const edge = '#5A2330';
  const marble = { shade: 1, surface: 'marble' as const };
  f.slab(rect(r.x0, r.z0, r.x1, r.z0 + border), y0, y1, edge, 0, 0, marble);
  f.slab(rect(r.x0, r.z1 - border, r.x1, r.z1), y0, y1, edge, 0, 0, marble);
  f.slab(rect(r.x0, r.z0 + border, r.x0 + border, r.z1 - border), y0, y1, edge, 0, 0, marble);
  f.slab(rect(r.x1 - border, r.z0 + border, r.x1, r.z1 - border), y0, y1, edge, 0, 0, marble);
  const inner = rect(r.x0 + border, r.z0 + border, r.x1 - border, r.z1 - border);
  // A gold line just inside the border, then the checker (each a separate, non-overlapping band).
  const line = 0.02;
  f.slab(rect(inner.x0, inner.z0, inner.x1, inner.z0 + line), y0, y1, PALETTE.gold, 0, 0, { shade: 1, surface: 'brass' });
  f.slab(rect(inner.x0, inner.z1 - line, inner.x1, inner.z1), y0, y1, PALETTE.gold, 0, 0, { shade: 1, surface: 'brass' });
  f.slab(rect(inner.x0, inner.z0 + line, inner.x0 + line, inner.z1 - line), y0, y1, PALETTE.gold, 0, 0, { shade: 1, surface: 'brass' });
  f.slab(rect(inner.x1 - line, inner.z0 + line, inner.x1, inner.z1 - line), y0, y1, PALETTE.gold, 0, 0, { shade: 1, surface: 'brass' });
  f.slab(rect(inner.x0 + line, inner.z0 + line, inner.x1 - line, inner.z1 - line), y0, y1, '#EFEAE2', 0, 0, { pattern: PATTERN.checker, color2: '#D5CEC3', scale: 0.32, shade: 1, surface: 'marble' });
}

/** Walnut chevron parquet inside a plain border of the same wood. */
function parquetRoom(f: GeoBuilder, r: Rect): void {
  const border = 0.1;
  const y0 = FLOOR_Y;
  const y1 = FLOOR_Y + ROOM_LIFT;
  const edge = PALETTE.walnutDark;
  f.slab(rect(r.x0, r.z0, r.x1, r.z0 + border), y0, y1, edge, 0, 0, FLAT);
  f.slab(rect(r.x0, r.z1 - border, r.x1, r.z1), y0, y1, edge, 0, 0, FLAT);
  f.slab(rect(r.x0, r.z0 + border, r.x0 + border, r.z1 - border), y0, y1, edge, 0, 0, FLAT);
  f.slab(rect(r.x1 - border, r.z0 + border, r.x1, r.z1 - border), y0, y1, edge, 0, 0, FLAT);
  f.slab(rect(r.x0 + border, r.z0 + border, r.x1 - border, r.z1 - border), y0, y1, PALETTE.walnut, 0, 0, { pattern: PATTERN.chevron, color2: PALETTE.walnutDark, scale: 0.22, shade: 1 });
}

/** A window opening on a wall that faces the camera: its inner face (x), its span along the wall and its top. */
export interface WindowCorner {
  x: number;
  /** +1 if the room is toward +x of the wall face. */
  inward: number;
  z0: number;
  z1: number;
  top: number;
}

/**
 * Cobwebs (session 17, owner: "the spiderwebs… doesn't look natural, instead looks hung up on the ceiling"): in an
 * old carriage a few windows on the camera's side have a small web in an upper corner of the frame, flat against
 * it, where a real spider would spin one. The old webs were laid flat at a height the walls no longer reach (they
 * were cut to knee height in session 15), so they floated in the air.
 */
export function buildCobwebs(windows: readonly WindowCorner[], seed: number): THREE.Mesh | null {
  const rand = seeded(seed * 17 + 5);
  const positions: number[] = [];
  const uvs: number[] = [];
  let count = 0;
  // One window in three (never two side by side), starting from a different one in each carriage.
  const first = Math.floor(rand() * Math.min(WEB_EVERY, windows.length));
  windows.forEach((win, i) => {
    if (i % WEB_EVERY !== first) return;
    const size = WEB_SIZE * (0.85 + rand() * 0.3);
    const left = rand() < 0.5;
    const x = win.x + win.inward * WEB_PROUD;
    const cz = left ? win.z0 + WEB_INSET : win.z1 - WEB_INSET;
    const along = left ? 1 : -1;
    const y = win.top - WEB_INSET;
    // A right triangle in the frame's corner: one leg down the post, one along the header.
    positions.push(x, y, cz, x, y - size, cz, x, y, cz + along * size);
    uvs.push(0, 0, 1, 0, 0, 1);
    count++;
  });
  if (count === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Each web is its own object for the clipping audit (they share one mesh and one draw).
  geometry.userData.objects = Array.from({ length: count }, (_, i) => ({ label: 'decor:cobweb', start: i * 3, end: i * 3 + 3 }));
  const mesh = new THREE.Mesh(geometry, cobwebMaterial());
  mesh.renderOrder = 2;
  return mesh;
}

/** One window in this many has a web. */
const WEB_EVERY = 3;
/** A web's legs (metres): small, a corner of a window, not a sheet. */
const WEB_SIZE = 0.2;
/** How far in front of the wall's face a web hangs, and how far inside the frame's corner it starts. */
const WEB_PROUD = 0.012;
const WEB_INSET = 0.008;

let webMaterial: THREE.MeshBasicMaterial | null = null;

function cobwebMaterial(): THREE.MeshBasicMaterial {
  if (webMaterial) return webMaterial;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Threads bold enough to survive being drawn a few dozen pixels across on a phone.
    // A dusty haze thickest in the corner, so the web reads even over a pale wall.
    const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    haze.addColorStop(0, 'rgba(226, 223, 214, 0.35)');
    haze.addColorStop(0.7, 'rgba(226, 223, 214, 0.1)');
    haze.addColorStop(1, 'rgba(226, 223, 214, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, size, size);
    // Dusty grey-white threads: they belong to the old carriage, they are not a sticker on it.
    ctx.strokeStyle = 'rgba(232, 229, 220, 0.8)';
    ctx.shadowColor = 'rgba(40, 36, 30, 0.3)';
    ctx.shadowBlur = 2;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    // Spokes from the corner (canvas top-left is the corner; v is flipped by the texture).
    const spokes = 5;
    const reach = size * 0.98;
    const ends: [number, number][] = [];
    for (let i = 0; i <= spokes; i++) {
      const angle = (i / spokes) * (Math.PI / 2);
      const end: [number, number] = [Math.cos(angle) * reach, Math.sin(angle) * reach];
      ends.push(end);
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
    }
    // Rings that sag between the spokes, thinner toward the edge.
    for (let ring = 1; ring <= 4; ring++) {
      const t = ring / 4.4;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let i = 0; i < spokes; i++) {
        const p = [ends[i][0] * t, ends[i][1] * t];
        const q = [ends[i + 1][0] * t, ends[i + 1][1] * t];
        const mid = [(p[0] + q[0]) / 2 * 0.9, (p[1] + q[1]) / 2 * 0.9];
        if (i === 0) ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(mid[0], mid[1], q[0], q[1]);
      }
      ctx.stroke();
    }
    // Keep the web inside the triangle (the far edge is the diagonal): an opaque mask, no shadow.
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  // No mipmaps: the threads stay crisp rather than fading to nothing a few dozen pixels across.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  webMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
  return webMaterial;
}
