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
 * The bed they slept in, on top of the made one (session 17: one look in every room, in that room's own colours;
 * session 23: in pieces, so tidying it is something you watch happen). Each piece is built round its own pivot, at
 * the made cover's surface (y 0), so the room can flatten it, pull it up the bed or turn it back:
 * the creased white sheet where they lay, the duvet kicked down into a roll across the foot, one corner thrown back,
 * and the pillow knocked askew. `w`/`d` are the free mattress area below the pillows.
 */
export interface BedMessParts {
  /** Each piece and where its pivot sits, from the bed's centre (x, z). */
  sheet: { build: (b: GeoBuilder) => void; x: number; z: number };
  duvet: { build: (b: GeoBuilder) => void; x: number; z: number };
  corner: { build: (b: GeoBuilder) => void; x: number; z: number; ry: number };
}

export function bedMessParts(w: number, d: number, color: string, fold: string): BedMessParts {
  const sheet = PALETTE.linen;
  const head = -d / 2 + 0.3;
  const roll = d * 0.16;
  const sheetLength = roll - head + 0.04;
  const rollLength = d / 2 - roll;
  return {
    sheet: {
      x: 0, z: head + sheetLength / 2,
      build: (b) => {
        b.rounded(0, 0.012, 0, w * 0.92, 0.024, sheetLength, 0.012, sheet, { shade: 0.97 });
        // Two soft creases where they turned over.
        b.rounded(-w * 0.12, 0.03, -sheetLength * 0.15, w * 0.46, 0.022, 0.05, 0.011, sheet, { shade: 0.9 }, 0.3);
        b.rounded(w * 0.14, 0.03, sheetLength * 0.18, w * 0.38, 0.022, 0.05, 0.011, sheet, { shade: 0.9 }, -0.25);
      },
    },
    duvet: {
      x: 0, z: roll + rollLength / 2,
      build: (b) => {
        b.rounded(0, 0.06, 0, w, 0.12, rollLength, 0.06, color, { shade: 0.92 }, 0.04);
        // A fold along its top, where it was kicked down.
        b.rounded(0, 0.118, -rollLength * 0.18, w * 0.94, 0.02, rollLength * 0.3, 0.01, fold, { shade: 0.95 }, 0.04);
      },
    },
    corner: {
      x: w * 0.22, z: roll - 0.1, ry: 0.45,
      build: (b) => b.rounded(0, 0.036, 0, w * 0.38, 0.05, 0.3, 0.025, fold, { shade: 0.9 }),
    },
  };
}

/** A pillow knocked askew, dented where a head lay; sits on top of the made bed's own. */
export function buildMessPillow(b: GeoBuilder, w: number): void {
  b.rounded(0, 0.045, 0, w, 0.09, 0.26, 0.06, PALETTE.pillow, { shade: 0.88 });
  b.rounded(0.02, 0.094, 0.01, w * 0.45, 0.008, 0.12, 0.004, '#E9E4DA', { shade: 1 });
}

/**
 * The little things swept up round the cleaning spot (session 23): a crumpled paper ball, a paper cup on its side, a
 * banana peel, a sweet wrapper and a dust bunny. Strong shapes and colours, so they read at play distance.
 */
export type LitterKind = 'paper' | 'cup' | 'peel' | 'wrapper' | 'dust';
export const LITTER_KINDS: LitterKind[] = ['paper', 'cup', 'peel', 'wrapper', 'dust'];
export function buildLitter(b: GeoBuilder, kind: LitterKind): void {
  switch (kind) {
    case 'paper':
      // A crumpled ball: two lumpy low-detail spheres.
      b.sphere(0, 0.05, 0, 0.055, '#F4F1EA', 0, 0.9, { shade: 0.95 });
      b.sphere(0.03, 0.04, 0.02, 0.035, '#E6E1D6', 0, 1, { shade: 0.95 });
      break;
    case 'cup':
      // A paper cup lying on its side, a red band round it.
      b.cylinder(0, 0.04, 0, 0.04, 0.03, 0.11, '#F2EEE6', 10, 'x', { shade: 0.95 });
      b.cylinder(0.012, 0.04, 0, 0.0415, 0.037, 0.03, '#C8463E', 10, 'x', { shade: 1 });
      break;
    case 'peel':
      // A banana peel: three yellow flaps round a little brown stalk.
      for (const a of [0, 2.1, 4.2]) b.box(Math.cos(a) * 0.045, 0.008, Math.sin(a) * 0.045, 0.085, 0.014, 0.035, '#E8C547', -a, { shade: 1 });
      b.sphere(0, 0.018, 0, 0.022, '#D9B23A', 0, 0.8, { shade: 1 });
      b.box(0.0, 0.034, 0, 0.014, 0.022, 0.014, '#6B4A2A', 0, { shade: 1 });
      break;
    case 'wrapper':
      b.box(0, 0.007, 0, 0.11, 0.014, 0.07, '#D8524A', 0.3, { shade: 1 });
      b.box(0, 0.016, 0, 0.05, 0.004, 0.032, '#F2D58C', 0.3, { shade: 1 });
      // Twisted ends.
      b.box(-0.07, 0.0045, -0.02, 0.03, 0.008, 0.04, '#B8423B', 0.3, { shade: 1 });
      b.box(0.07, 0.0045, 0.02, 0.03, 0.008, 0.04, '#B8423B', 0.3, { shade: 1 });
      break;
    case 'dust':
      for (const [x, z, r] of [[0, 0, 0.05], [0.045, 0.02, 0.034], [-0.04, 0.025, 0.03], [0.01, -0.04, 0.028]]) b.sphere(x, r * 0.6, z, r, '#A9A196', 1, 0.6, { shade: 0.95 });
      break;
  }
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
