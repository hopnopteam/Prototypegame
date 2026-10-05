import type { BedMess, MessPiece } from '../config/content';
import { GeoBuilder, type PartStyle } from './geo';

export type { BedMess, MessPiece };
import { PALETTE } from './palette';

/**
 * What a guest leaves behind: the bed they slept in and one thing of theirs on the floor beside it (a businessman's
 * paper, a backpacker's map, grandma's yarn…), from a small library of pieces, each built around its own origin
 * inside a MESS_CELL square. Which piece depends on who stayed (`mess` on each archetype in config/content.ts).
 * Heights are relative to the floor or the mattress top.
 */

/** Every floor piece fits inside this square (metres), centred on its slot. */
export const MESS_CELL = 0.3;

const FLAT: PartStyle = { shade: 1 };

type Builder = (b: GeoBuilder, y: number) => void;

const FLOOR: Record<MessPiece, Builder> = {
  newspaper: (b, y) => {
    b.box(0, y + 0.004, 0, 0.26, 0.008, 0.2, '#EFE8D8', 0, FLAT);
    b.box(-0.03, y + 0.01, -0.05, 0.16, 0.004, 0.025, '#8A8378', 0, FLAT);
    b.box(-0.03, y + 0.01, 0.02, 0.16, 0.004, 0.025, '#8A8378', 0, FLAT);
    b.box(0.08, y + 0.01, 0.0, 0.05, 0.004, 0.1, '#B7AFA2', 0, FLAT);
  },
  cup: (b, y) => {
    b.cylinder(0, y + 0.006, 0, 0.08, 0.08, 0.012, PALETTE.porcelain, 14, 'y', FLAT);
    b.cylinder(0.03, y + 0.02, 0.03, 0.035, 0.03, 0.02, '#9B6B45', 12, 'y', FLAT);
    b.cylinder(-0.035, y + 0.05, -0.03, 0.05, 0.04, 0.09, PALETTE.porcelain, 10, 'z');
  },
  papers: (b, y) => {
    b.box(-0.04, y + 0.004, -0.03, 0.18, 0.008, 0.13, '#F7F3EA', 0.3, FLAT);
    b.box(0.04, y + 0.012, 0.03, 0.18, 0.008, 0.13, '#EDE6D6', -0.25, FLAT);
    b.box(0.03, y + 0.024, 0.03, 0.12, 0.004, 0.02, '#6D7A8C', -0.25, FLAT);
  },
  paperBalls: (b, y) => {
    for (const [x, z, r] of [[-0.07, -0.05, 0.045], [0.06, -0.02, 0.04], [-0.01, 0.07, 0.05]]) b.sphere(x, y + r * 0.9, z, r, '#F2EDE2', 0, 0.9);
  },
  socks: (b, y) => {
    b.rounded(-0.04, y + 0.015, 0, 0.07, 0.03, 0.2, 0.03, '#C0485C', { shade: 0.9 });
    b.rounded(0.06, y + 0.015, 0.02, 0.07, 0.03, 0.18, 0.03, '#E0A93B', { shade: 0.9 });
  },
  map: (b, y) => {
    b.box(0, y + 0.004, 0, 0.26, 0.008, 0.18, '#E8DDB5', 0.15, FLAT);
    b.box(-0.04, y + 0.01, -0.02, 0.07, 0.004, 0.07, '#8FB07F', 0.15, FLAT);
    b.box(0.05, y + 0.01, 0.03, 0.06, 0.004, 0.05, '#7FA7C9', 0.15, FLAT);
  },
  wrappers: (b, y) => {
    for (const [x, z, c, ry] of [[-0.08, -0.06, '#EE8F4A', 0.4], [0.07, -0.03, '#6FA36B', -0.3], [-0.01, 0.07, '#C0485C', 1.1]] as [number, number, string, number][]) {
      b.box(x, y + 0.008, z, 0.08, 0.016, 0.05, c, ry, FLAT);
    }
  },
  bottle: (b, y) => {
    b.cylinder(0, y + 0.04, 0, 0.04, 0.04, 0.2, '#7FA66B', 10, 'x', { shade: 0.9 });
    b.cylinder(0.12, y + 0.04, 0, 0.016, 0.02, 0.05, '#7FA66B', 8, 'x', FLAT);
  },
  book: (b, y) => {
    b.box(-0.055, y + 0.014, 0, 0.1, 0.028, 0.16, '#34507A', 0.1, { shade: 0.9 });
    b.box(0.055, y + 0.014, 0, 0.1, 0.028, 0.16, '#34507A', -0.1, { shade: 0.9 });
    b.box(0, y + 0.03, 0, 0.02, 0.006, 0.15, '#E2B653', 0, FLAT);
  },
  yarn: (b, y) => {
    b.sphere(-0.04, y + 0.06, 0, 0.06, '#E8849A', 1, 0.95);
    b.sphere(0.07, y + 0.045, 0.05, 0.045, '#9BC4D8', 1, 0.95);
    b.cylinder(0.02, y + 0.012, -0.07, 0.006, 0.006, 0.2, '#C9A878', 6, 'x', FLAT);
  },
  petals: (b, y) => {
    const spots = [[-0.09, -0.07], [0.02, -0.09], [0.1, -0.02], [-0.05, 0.03], [0.05, 0.08], [-0.1, 0.09], [0.1, 0.1]];
    spots.forEach(([x, z], i) => b.sphere(x, y + 0.008, z, 0.028, i % 2 ? '#E8849A' : '#C0485C', 0, 0.3));
  },
  champagne: (b, y) => {
    b.cylinder(0, y + 0.045, 0, 0.045, 0.045, 0.2, '#3F6E5A', 10, 'x', { shade: 0.9 });
    b.cylinder(0.12, y + 0.045, 0, 0.018, 0.022, 0.05, PALETTE.gold, 8, 'x', FLAT);
  },
  teddy: (b, y) => {
    b.sphere(0, y + 0.06, 0.02, 0.07, '#C08A5A', 1, 0.95);
    b.sphere(0, y + 0.15, 0.0, 0.05, '#C08A5A', 1, 1);
    for (const x of [-0.035, 0.035]) b.sphere(x, y + 0.195, 0, 0.018, '#A8744A', 0, 1);
  },
  toyTrain: (b, y) => {
    b.box(-0.065, y + 0.045, 0, 0.12, 0.07, 0.09, '#C8453A', 0, { shade: 0.9 });
    b.box(-0.09, y + 0.1, 0, 0.04, 0.04, 0.04, PALETTE.ink, 0, { shade: 0.9 });
    b.box(0.07, y + 0.04, 0, 0.12, 0.06, 0.09, '#34507A', 0, { shade: 0.9 });
    for (const x of [-0.1, -0.03, 0.035, 0.105]) for (const z of [-0.05, 0.05]) b.cylinder(x, y + 0.016, z, 0.016, 0.016, 0.01, PALETTE.ink, 8, 'z', FLAT);
  },
  appleCore: (b, y) => {
    b.cylinder(0.02, y + 0.055, -0.02, 0.03, 0.03, 0.09, '#F2E6C4', 10, 'y', { shade: 0.9 });
    b.sphere(0.02, y + 0.105, -0.02, 0.045, '#C0485C', 0, 0.5);
    b.sphere(0.02, y + 0.018, -0.02, 0.045, '#C0485C', 0, 0.5);
    b.box(-0.07, y + 0.01, 0.08, 0.1, 0.02, 0.065, '#EE8F4A', 0.5, FLAT);
  },
  boa: (b, y) => {
    for (let i = 0; i < 6; i++) b.sphere(-0.11 + i * 0.044, y + 0.03, Math.sin(i * 1.2) * 0.06, 0.035, '#F2A7B5', 0, 0.85);
  },
  cards: (b, y) => {
    // A fanned hand, each card 5 mm above the last (closer faces would flicker), and one stray under it, clear of
    // the floor and of the hand by more than the audit's 3 mm at the pieces' scale.
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25;
      b.box(Math.sin(a) * 0.05, y + 0.009 + i * 0.005, Math.cos(a) * 0.035 - 0.03, 0.08, 0.002, 0.115, i % 2 ? '#FBF7EF' : '#F3EBDA', a, FLAT);
    }
    b.box(-0.08, y + 0.004, 0.09, 0.07, 0.002, 0.095, '#C0485C', 0.3, FLAT);
  },
};

/** Builds one floor piece around its slot's origin; `y` is the surface it rests on (the mat's top). */
export function buildMessPiece(b: GeoBuilder, piece: MessPiece, y: number): void {
  FLOOR[piece](b, y);
}

export const MESS_PIECES = Object.keys(FLOOR) as MessPiece[];

/**
 * The bed they slept in, on top of the made one (session 17, owner: "a better unified system to represent room being
 * dirty that doesn't look thrown together"): one look in every room, in that room's own colours. The duvet is
 * kicked down into a soft roll across the foot with one corner thrown back, and the creased white sheet shows where
 * they lay. `w`/`d` are the free mattress area below the pillows, `top` the made cover's surface, `color` the
 * cover and `fold` its underside.
 */
export function buildBedMess(b: GeoBuilder, w: number, d: number, top: number, color: string, fold: string): void {
  const sheet = PALETTE.linen;
  // From below the pillows (and a grand bed's bolster) to where the duvet roll begins.
  const head = -d / 2 + 0.3;
  const roll = d * 0.16;
  const sheetLength = roll - head + 0.04;
  b.rounded(0, top + 0.012, head + sheetLength / 2, w * 0.92, 0.024, sheetLength, 0.012, sheet, { shade: 0.97 });
  // Two soft creases where they turned over.
  b.rounded(-w * 0.12, top + 0.03, head + sheetLength * 0.35, w * 0.46, 0.022, 0.05, 0.011, sheet, { shade: 0.9 }, 0.3);
  b.rounded(w * 0.14, top + 0.03, head + sheetLength * 0.68, w * 0.38, 0.022, 0.05, 0.011, sheet, { shade: 0.9 }, -0.25);
  // The duvet kicked down into a roll across the foot…
  const rollLength = d / 2 - roll;
  b.rounded(0, top + 0.06, roll + rollLength / 2, w, 0.12, rollLength, 0.06, color, { shade: 0.92 }, 0.04);
  // …with one corner thrown back up the bed, its underside showing.
  b.rounded(w * 0.22, top + 0.036, roll - 0.1, w * 0.38, 0.05, 0.3, 0.025, fold, { shade: 0.9 }, 0.45);
}

export const BED_MESS: BedMess[] = ['unmade'];

/** A tiny deterministic generator, so a room's mess stays the same while it waits to be cleaned. */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}
