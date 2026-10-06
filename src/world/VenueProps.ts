import * as THREE from 'three';
import { rect, type Rect } from '../core/types';
import type { GeoBuilder, PartStyle } from './geo';
import type { PropDef } from './layout';
import { PATTERN } from './materials';
import { PALETTE, shadeHex, type CarriageTheme } from './palette';

/**
 * The venue carriages' furniture (session 20), dressed by the refit tier (session 21, owner: "the interiors… should
 * have levels of upgrades… significant changes whenever they are updated"). Every piece has four looks:
 *
 * 0 Run-down: makeshift. A counter of crates and a plank, a bar on barrels, folding chairs, a bedsheet for a screen.
 * 1 Repaired: plain and sound. Honest wood, bentwood chairs, white cloths, a proper screen in a black frame.
 * 2 Cosy: the venue's own colours. Upholstery, brass, rugs, leafy plants, a sideboard that serves the room.
 * 3 Luxury: each venue's grand look (the owner's references): the bar's green panelled counter and arched glass
 *   back-bar, ochre velvet tub chairs, side tables on striped pedestals with brass mushroom lamps and a tufted
 *   orange banquette; the picture palace's red velvet recliners, gold frames and curtains; marble and palms.
 *
 * Every piece stays inside its own footprint, so the clipping audit can check it against its neighbours. Large
 * metal parts are enamel (a big polished metal block reads as black at night); brass is kept for trims.
 */

const FLAT: PartStyle = { shade: 1 };
/** The floor's top (CarriageView.FLOOR_Y; kept here so this file does not import the view). */
const Y = 0.55;

interface Dress {
  /** Cabinet and table wood. */
  wood: string;
  woodDark: string;
  /** Counter and table tops. */
  top: string;
  topSurface: PartStyle['surface'];
  /** Rails, taps, stool posts. */
  metal: string;
  metalSurface: PartStyle['surface'];
  /** Upholstery (stools, chairs, dome seats). */
  cushion: string;
  cushionSurface: PartStyle['surface'];
}

function dress(theme: CarriageTheme, tier: number): Dress {
  if (tier <= 0) return { wood: '#9C8570', woodDark: '#86705D', top: '#B39A80', topSurface: 'wood', metal: PALETTE.iron, metalSurface: 'iron', cushion: '#8E8577', cushionSurface: 'fabric' };
  if (tier === 1) return { wood: PALETTE.walnut, woodDark: PALETTE.walnutDark, top: PALETTE.oak, topSurface: 'varnish', metal: PALETTE.chrome, metalSurface: 'steel', cushion: shadeHex(theme.deep, 1.25), cushionSurface: 'fabric' };
  if (tier === 2) return { wood: PALETTE.walnut, woodDark: PALETTE.walnutDark, top: PALETTE.oak, topSurface: 'varnish', metal: PALETTE.brass, metalSurface: 'brass', cushion: theme.deep, cushionSurface: 'velvet' };
  return { wood: PALETTE.walnutDark, woodDark: '#4F3A2E', top: '#F1ECE4', topSurface: 'marble', metal: PALETTE.gold, metalSurface: 'brass', cushion: theme.deep, cushionSurface: 'velvet' };
}

/** The Luxury refits' own colours, from the owner's references. */
const LUX = {
  barGreen: '#2F5A3E',
  barGreenDeep: '#244A33',
  ochre: '#C9902E',
  ochreDeep: '#A8741F',
  orange: '#C8622E',
  cream: '#F2E9D6',
  velvetRed: '#B0283A',
  velvetRedDeep: '#7E1A28',
  mahogany: '#5A2C1E',
  beige: '#B89A74',
  stripeDark: '#2B2A2E',
};

/** Cushion colours for a home cinema's sofa (the owner's reference: reds, oranges and a pattern). */
const CUSHIONS = ['#B03A3E', '#D9783A', '#8E2F45', '#E0A43E'];

/** Crates (run-down storage, makeshift furniture): slatted wood. */
const CRATE: PartStyle = { pattern: PATTERN.stripesX, color2: '#86705D', scale: 0.12, shade: 0.78, surface: 'wood' };

/** A plant's leaves: flattened spheres fanned round a stem. */
function foliage(b: GeoBuilder, cx: number, y: number, cz: number, radius: number, count: number, tint: string): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    b.add(new THREE.SphereGeometry(radius, 8, 6).scale(0.32, 0.1, 1), i % 2 ? tint : shadeHex(tint, -14), cx + Math.sin(a) * radius * 0.45, y, cz + Math.cos(a) * radius * 0.45, 0.55, a, 0, { shade: 0.88, surface: 'foliage' });
  }
}

/** Builds a venue prop; false when the kind is not a venue's (CarriageView builds the rest). */
export function buildVenueProp(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): boolean {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const k = dress(theme, tier);
  // Which way the front faces across x: +1 for a prop against the left wall ('right'), −1 against the right.
  const out = prop.facing === 'right' ? 1 : -1;
  const front = out > 0 ? r.x1 : r.x0;
  const back = out > 0 ? r.x0 : r.x1;
  switch (prop.kind) {
    case 'counter':
    case 'concession': {
      // The café counter and the cinema's popcorn counter: crates and a plank when run down, panelled wood, then the
      // venue's colour with a brass rail, then (Luxury) deep panels with gold mouldings under a marble top.
      const h = 0.92;
      const cinema = prop.kind === 'concession';
      if (tier <= 0) {
        const crates = Math.max(2, Math.round(d / 0.7));
        for (let i = 0; i < crates; i++) {
          const pz = r.z0 + (d / crates) * (i + 0.5);
          b.box(cx, Y + (h - 0.06) / 2, pz, w - 0.08, h - 0.06, d / crates - 0.04, i % 2 ? '#A88C6C' : '#9A7F61', 0, CRATE);
        }
        b.slab(rect(r.x0, r.z0, r.x1, r.z1), Y + h - 0.06, Y + h + 0.03, '#B39A80', 0, 0, { ...FLAT, surface: 'wood' });
      } else {
        const body = tier >= 3 ? (cinema ? LUX.mahogany : LUX.barGreen) : tier === 2 && cinema ? theme.deep : k.wood;
        b.box(cx, Y + 0.04, cz, w - 0.06, 0.08, d - 0.04, k.woodDark, 0, { shade: 0.7 });
        b.box(cx, Y + h / 2, cz, w - 0.04, h - 0.04, d - 0.02, body, 0, { shade: 0.75, surface: tier >= 2 ? 'varnish' : 'wood' });
        const panels = Math.max(2, Math.round(d / 0.9));
        for (let i = 0; i < panels; i++) {
          const pz = r.z0 + (d / panels) * (i + 0.5);
          const panel = tier >= 3 ? shadeHex(body, 10) : tier === 2 ? (cinema ? shadeHex(theme.deep, 14) : theme.deep) : k.woodDark;
          b.box(front + out * 0.012, Y + 0.48, pz, 0.02, 0.5, d / panels - 0.16, panel, 0, { shade: 0.9, surface: tier >= 2 ? 'varnish' : 'wood' });
          if (tier >= 3) {
            // A gold moulding round each panel.
            for (const dy of [-0.26, 0.26]) b.box(front + out * 0.024, Y + 0.48 + dy, pz, 0.006, 0.014, d / panels - 0.12, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
            for (const s of [-1, 1]) b.box(front + out * 0.024, Y + 0.48, pz + s * (d / panels / 2 - 0.06), 0.006, 0.52, 0.014, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
          }
        }
        b.slab(rect(r.x0, r.z0, r.x1, r.z1), Y + h - 0.02, Y + h + 0.03, k.top, 0, 0, { ...FLAT, surface: k.topSurface });
        if (tier >= 2) b.box(front + out * 0.004, Y + h + 0.005, cz, 0.012, 0.03, d - 0.02, k.metal, 0, { ...FLAT, surface: k.metalSurface });
        if (tier >= 3) b.cylinder(front + out * 0.06, Y + 0.12, cz, 0.016, 0.016, d - 0.12, PALETTE.gold, 8, 'z', { surface: 'brass' });
      }
      if (cinema) {
        // Jars of sweets at the far end, on a little tray lit from below from the Cosy refit.
        const gz = r.z1 - 0.42;
        b.slab(rect(cx - 0.18, gz - 0.25, cx + 0.18, gz + 0.25), Y + h + 0.03, Y + h + 0.05, k.woodDark, 0, 0, FLAT);
        const jars = ['#E05A73', '#F2C14E', '#6FB7D9'];
        jars.forEach((c, i) => b.cylinder(cx, Y + h + 0.11, gz - 0.16 + i * 0.16, 0.045, 0.045, 0.12, c, 10, 'y', { shade: 1, surface: 'glass' }));
        if (tier >= 2) lamps.box(front - out * 0.02, Y + h - 0.12, cz, 0.008, 0.04, d - 0.2, '#FFD9A0', 0, FLAT);
      } else {
        // A bell and a little stack of cups by the serving spot.
        b.cylinder(front - out * 0.18, Y + h + 0.06, cz - 0.1, 0.04, 0.032, 0.07, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
        b.cylinder(front - out * 0.18, Y + h + 0.13, cz - 0.1, 0.04, 0.032, 0.07, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      }
      return true;
    }
    case 'espresso': {
      // An espresso machine on the counter: a stove-top pot when run down, then enamel bodies (cream, the café's
      // green, ivory) with chrome and later brass.
      const top = Y + 0.95;
      if (tier <= 0) {
        b.cylinder(cx, top + 0.1, cz, 0.12, 0.14, 0.2, '#8F969C', 10, 'y', { surface: 'paint' });
        b.cylinder(cx, top + 0.25, cz, 0.08, 0.12, 0.1, '#8F969C', 10, 'y', { surface: 'paint' });
        b.box(cx + out * 0.12, top + 0.14, cz, 0.12, 0.03, 0.03, '#3B3A40', 0, FLAT);
        b.cylinder(front - out * 0.06, top + 0.04, cz + 0.2, 0.035, 0.028, 0.06, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
        return true;
      }
      const body = tier === 1 ? '#E6E1D6' : tier === 2 ? theme.deep : '#F4EEDF';
      const metal = tier >= 2 ? 'brass' : 'steel';
      b.rounded(cx + out * 0.08, top + 0.21, cz, w * 0.62, 0.42, d - 0.06, 0.06, body, { shade: 0.85, surface: 'paint' });
      b.box(cx + out * 0.08, top + 0.44, cz, w * 0.5, 0.04, d - 0.16, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, { ...FLAT, surface: metal });
      if (tier >= 2) b.sphere(cx + out * 0.08, top + 0.5, cz, 0.06, PALETTE.gold, 1, 0.9, { shade: 1, surface: 'brass' });
      for (const dz of [-0.14, 0.14]) {
        b.cylinder(front - out * 0.06, top + 0.24, cz + dz, 0.035, 0.035, 0.07, '#2E2D33', 10, 'y', { surface: 'steel' });
        b.cylinder(front - out * 0.06, top + 0.04, cz + dz, 0.035, 0.028, 0.06, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      }
      lamps.sphere(cx + out * 0.08, top + 0.3, cz + (d / 2 - 0.05), 0.018, '#FFB765', 0, 1, FLAT);
      return true;
    }
    case 'pastryCase': {
      // A tiered cake stand on the counter: a wooden base, posts and trays.
      const top = Y + 0.95;
      b.slab(r, top, top + 0.05, k.wood, 0, 0.02, { shade: 0.85 });
      const trays = Math.max(2, Math.floor(d / 0.36));
      for (let i = 0; i < trays; i++) {
        const pz = r.z0 + (d / trays) * (i + 0.5);
        const rad = Math.min(w, d / trays) * 0.42;
        b.cylinder(cx, top + 0.16, pz, 0.012, 0.012, 0.22, k.metal, 6, 'y', { surface: k.metalSurface });
        b.cylinder(cx, top + 0.08, pz, rad, rad, 0.012, PALETTE.porcelain, 16, 'y', { surface: 'ceramic' });
        b.cylinder(cx, top + 0.2, pz, rad * 0.72, rad * 0.72, 0.012, PALETTE.porcelain, 16, 'y', { surface: 'ceramic' });
        b.sphere(cx, top + 0.28, pz, 0.018, k.metal, 0, 1, { shade: 1, surface: k.metalSurface });
      }
      return true;
    }
    case 'pastries': {
      // Croissants on the lower trays and little cakes on the upper ones.
      const top = Y + 0.95;
      const trays = Math.max(2, Math.floor(d / 0.36));
      const span = (d + 0.2) / trays;
      for (let i = 0; i < trays; i++) {
        const pz = r.z0 - 0.1 + span * (i + 0.5);
        for (const a of [0, 2.1, 4.2]) {
          const ox = Math.cos(a) * 0.08;
          const oz = Math.sin(a) * 0.08;
          b.add(new THREE.TorusGeometry(0.032, 0.017, 6, 10, Math.PI * 1.2), '#D99A4E', cx + ox, top + 0.11, pz + oz, Math.PI / 2, 0, a, { shade: 0.9 });
        }
        b.cylinder(cx + 0.03, top + 0.235, pz, 0.035, 0.035, 0.04, i % 2 ? '#F2D6C8' : '#7A4A35', 12, 'y', { shade: 0.95 });
        b.sphere(cx + 0.03, top + 0.262, pz, 0.012, '#C0485C', 0, 1, FLAT);
      }
      return true;
    }
    case 'beans': {
      // A grinder and jars of beans by the machine: the better coffee.
      const top = Y + 0.95;
      b.cylinder(cx, top + 0.1, cz - 0.12, 0.06, 0.07, 0.2, tier >= 2 ? PALETTE.brass : '#3B3A40', 12, 'y', { surface: tier >= 2 ? 'brass' : 'steel' });
      b.cone(cx, top + 0.27, cz - 0.12, 0.07, 0.12, '#CFE2EA', 10, { shade: 1, surface: 'glass' });
      for (const [dz, c] of [[0.1, '#6B3F2A'], [0.22, '#4E2E1F']] as [number, string][]) {
        b.cylinder(cx + 0.06, top + 0.08, cz + dz, 0.045, 0.045, 0.16, '#DDEBEF', 10, 'y', { shade: 1, surface: 'glass' });
        b.cylinder(cx + 0.06, top + 0.065, cz + dz, 0.038, 0.038, 0.12, c, 10, 'y', FLAT);
      }
      return true;
    }
    case 'cafeTable': {
      const radius = Math.min(w, d) / 2 - 0.02;
      if (tier <= 0) {
        // A cable drum turned on its end: two wooden discs and a fat core.
        b.cylinder(cx, Y + 0.03, cz, radius * 0.86, radius * 0.86, 0.06, '#8E7860', 14, 'y', { surface: 'wood' });
        b.cylinder(cx, Y + 0.36, cz, radius * 0.42, radius * 0.42, 0.62, '#9C8570', 12, 'y', { shade: 0.8, surface: 'wood' });
        b.cylinder(cx, Y + 0.7, cz, radius, radius, 0.05, '#A88F74', 16, 'y', { ...FLAT, surface: 'wood' });
        b.cylinder(cx + 0.08, Y + 0.755, cz, 0.03, 0.026, 0.05, '#C9C2B5', 10, 'y', { surface: 'ceramic' });
        return true;
      }
      // A round bistro table on a pedestal: wood on iron, then marble on brass.
      b.cylinder(cx, Y + 0.02, cz, 0.18, 0.2, 0.04, tier >= 2 ? k.metal : '#3B3A40', 14, 'y', { surface: tier >= 2 ? 'brass' : 'iron' });
      b.cylinder(cx, Y + 0.37, cz, 0.03, 0.04, 0.68, tier >= 2 ? k.metal : '#3B3A40', 8, 'y', { surface: tier >= 2 ? 'brass' : 'iron' });
      b.cylinder(cx, Y + 0.72, cz, radius, radius, 0.035, tier >= 2 ? '#F1ECE4' : k.top, 20, 'y', { ...FLAT, surface: tier >= 2 ? 'marble' : k.topSurface });
      if (tier >= 2) b.cylinder(cx, Y + 0.705, cz, radius + 0.005, radius + 0.005, 0.012, k.metal, 20, 'y', { ...FLAT, surface: k.metalSurface });
      b.cylinder(cx + 0.08, Y + 0.765, cz, 0.03, 0.026, 0.05, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      if (tier >= 2) {
        b.cylinder(cx - 0.08, Y + 0.79, cz, 0.012, 0.018, 0.1, '#DDEBEF', 8, 'y', { surface: 'glass' });
        b.sphere(cx - 0.08, Y + 0.86, cz, 0.025, theme.blanket, 1, 0.9, FLAT);
      }
      if (tier >= 3) {
        // A little shaded candle lamp.
        b.cylinder(cx, Y + 0.755, cz + 0.1, 0.03, 0.035, 0.03, PALETTE.gold, 10, 'y', { surface: 'brass' });
        lamps.cylinder(cx, Y + 0.81, cz + 0.1, 0.035, 0.045, 0.06, '#F6D9B5', 10, 'y', { shade: 0.95 });
      }
      return true;
    }
    case 'chair': {
      // A dining or café chair, its back on the side away from the table. Run down: a plain stick chair (no two
      // alike); repaired: bentwood; cosy: upholstered in the venue's colour; luxury: a velvet high back on gilt feet.
      const seatY = Y + 0.42;
      const rear = prop.facing === 'rear';
      const backZ = rear ? r.z0 + 0.05 : r.z1 - 0.05;
      const toSeat = rear ? 1 : -1;
      const odd = Math.abs(Math.round((r.x0 + r.z0) * 10)) % 3;
      const wood = tier <= 0 ? ['#9C8570', '#8A7864', '#A38B6E'][odd] : tier >= 3 ? '#3E2C24' : tier === 2 ? k.woodDark : '#6E4F3A';
      const legs = tier >= 3 ? PALETTE.gold : wood;
      for (const fx of [r.x0 + 0.05, r.x1 - 0.05]) for (const fz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(fx, Y + 0.2, fz, 0.035, 0.4, 0.035, legs, 0, { shade: 0.85, surface: tier >= 3 ? 'paint' : 'wood' });
      if (tier <= 0) {
        b.box(cx, seatY, cz, w - 0.04, 0.04, d - 0.04, wood, 0, { shade: 0.9, surface: 'wood' });
        for (const fx of [r.x0 + 0.06, r.x1 - 0.06]) b.box(fx, seatY + 0.22, backZ, 0.03, 0.44, 0.03, wood, 0, { shade: 0.85 });
        b.box(cx, seatY + 0.36, backZ, w - 0.08, 0.08, 0.025, wood, 0, { shade: 0.9 });
        return true;
      }
      if (tier === 1) {
        // Bentwood: a round caned seat and a hoop back.
        const sr = Math.min(w, d) / 2 - 0.02;
        b.cylinder(cx, seatY, cz, sr, sr, 0.04, wood, 14, 'y', { shade: 0.9, surface: 'varnish' });
        b.cylinder(cx, seatY + 0.025, cz, sr - 0.04, sr - 0.04, 0.012, '#C9A97A', 14, 'y', { ...FLAT, surface: 'fabric' });
        b.add(new THREE.TorusGeometry((w - 0.12) / 2, 0.016, 6, 14, Math.PI), wood, cx, seatY + 0.2, backZ, 0, 0, 0, { shade: 0.9, surface: 'varnish' });
        for (const fx of [r.x0 + 0.06, r.x1 - 0.06]) b.box(fx, seatY + 0.1, backZ, 0.03, 0.2, 0.03, wood, 0, { shade: 0.9 });
        return true;
      }
      const cover = tier >= 3 ? shadeHex(theme.deep, -8) : theme.deep;
      b.rounded(cx, seatY, cz, w - 0.04, 0.05, d - 0.04, 0.02, wood, { shade: 0.9 });
      b.rounded(cx, seatY + 0.055, cz, w - 0.08, 0.06, d - 0.08, 0.025, cover, { shade: 0.95, surface: 'velvet' });
      const backH = tier >= 3 ? 0.52 : 0.4;
      b.rounded(cx, seatY + 0.1 + backH / 2, backZ, w - 0.04, backH, 0.07, 0.03, cover, { shade: 0.92, surface: 'velvet' });
      if (tier >= 3) {
        // Gilt piping along the top of the back, buttons on its face.
        b.box(cx, seatY + 0.11 + backH, backZ, w - 0.06, 0.02, 0.075, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
        for (const dx of [-0.08, 0.08]) b.sphere(cx + dx, seatY + 0.38, backZ + toSeat * 0.038, 0.012, PALETTE.gold, 0, 1, { ...FLAT, surface: 'brass' });
      }
      return true;
    }
    case 'range': {
      // The kitchen range: a black iron stove, then cream enamel, the dining car's colour, then black with brass.
      const h = 0.88;
      const body = tier <= 0 ? '#5E6168' : tier === 1 ? '#E9E3D6' : tier === 2 ? theme.deep : '#22242B';
      b.box(cx, Y + h / 2, cz, w - 0.04, h, d - 0.04, body, 0, { shade: 0.75, surface: tier >= 1 ? 'paint' : 'iron' });
      b.slab(r, Y + h, Y + h + 0.03, '#2E2F35', 0, 0.01, { ...FLAT, surface: 'iron' });
      const doors = Math.max(1, Math.floor(d / 0.8));
      for (let i = 0; i < doors; i++) {
        const pz = r.z0 + (d / doors) * (i + 0.5);
        b.box(front + out * 0.01, Y + 0.42, pz, 0.02, 0.4, d / doors - 0.2, '#2B2C32', 0, { shade: 0.9 });
        b.box(front + out * 0.02, Y + 0.68, pz, 0.025, 0.025, d / doors - 0.3, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, { ...FLAT, surface: tier >= 2 ? 'brass' : 'steel' });
      }
      const rings = Math.max(2, Math.floor(d / 0.45));
      for (let i = 0; i < rings; i++) {
        const pz = r.z0 + (d / rings) * (i + 0.5);
        b.cylinder(cx, Y + h + 0.035, pz, 0.11, 0.11, 0.01, '#16161A', 14, 'y', FLAT);
        if (i % 2 === 0) b.cylinder(cx, Y + h + 0.09, pz, 0.1, 0.09, 0.1, tier >= 3 ? '#C27A55' : PALETTE.chrome, 14, 'y', { shade: 0.9, surface: tier >= 3 ? 'brass' : 'steel' });
        else lamps.cylinder(cx, Y + h + 0.042, pz, 0.075, 0.075, 0.006, '#FF8A45', 14, 'y', FLAT);
      }
      return true;
    }
    case 'pass': {
      // The pass between the kitchen and the tables: a steel shelf with a heat lamp over it.
      const h = 0.92;
      b.box(cx, Y + h / 2, cz, w - 0.04, h, d - 0.04, tier >= 2 ? k.wood : '#B9BFC4', 0, { shade: 0.75, surface: tier >= 2 ? 'varnish' : 'paint' });
      b.slab(r, Y + h, Y + h + 0.03, tier >= 3 ? '#F1ECE4' : '#D5DADE', 0, 0, { ...FLAT, surface: tier >= 3 ? 'marble' : 'paint' });
      for (const px of [r.x0 + 0.04, r.x1 - 0.04]) b.box(px, Y + h + 0.24, cz, 0.025, 0.45, 0.025, k.metal, 0, { ...FLAT, surface: k.metalSurface });
      b.box(cx, Y + h + 0.47, cz, w - 0.04, 0.04, 0.1, k.metal, 0, { ...FLAT, surface: k.metalSurface });
      lamps.box(cx, Y + h + 0.44, cz, w - 0.12, 0.02, 0.06, '#FFB060', 0, FLAT);
      return true;
    }
    case 'diningTable': {
      // A window table: bare boards and a candle stub when run down, a white cloth from Repaired, a velvet runner and
      // a silk-shaded lamp when cosy, gold-rimmed china and a rose at Luxury.
      const wallEnd = Math.abs(r.x0) > Math.abs(r.x1) ? r.x0 : r.x1;
      const inward = wallEnd < 0 ? 1 : -1;
      const topY = Y + 0.72;
      for (const fx of [r.x0 + 0.08, r.x1 - 0.08]) for (const fz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(fx, Y + 0.35, fz, 0.04, 0.7, 0.04, k.woodDark, 0, { shade: 0.85 });
      b.slab(r, topY - 0.03, topY, tier <= 0 ? '#A88F74' : k.wood, 0, 0.01, { shade: 0.9, surface: tier <= 0 ? 'wood' : 'varnish' });
      if (tier >= 1) {
        b.slab(r, topY, topY + 0.008, PALETTE.linen, 0, 0, { ...FLAT, surface: 'fabric' });
        b.box(r.x0 + w / 2, topY - 0.08, r.z0 + 0.005, w - 0.01, 0.16, 0.01, PALETTE.linen, 0, { ...FLAT, surface: 'fabric' });
        b.box(r.x0 + w / 2, topY - 0.08, r.z1 - 0.005, w - 0.01, 0.16, 0.01, PALETTE.linen, 0, { ...FLAT, surface: 'fabric' });
      }
      if (tier >= 2) b.slab(rect(r.x0 + 0.06, cz - 0.08, r.x1 - 0.06, cz + 0.08), topY + 0.008, topY + 0.012, theme.deep, 0, 0, { ...FLAT, surface: 'velvet' });
      const lx = wallEnd + inward * 0.14;
      if (tier <= 0) {
        b.cylinder(lx, topY + 0.006, cz, 0.05, 0.05, 0.012, '#C9C2B5', 10, 'y', FLAT);
        lamps.cylinder(lx, topY + 0.047, cz, 0.015, 0.015, 0.07, '#FFE2B0', 8, 'y', FLAT);
      } else {
        b.cylinder(lx, topY + 0.03, cz, 0.04, 0.05, 0.04, k.metal, 10, 'y', { surface: k.metalSurface });
        b.cylinder(lx, topY + 0.12, cz, 0.01, 0.01, 0.15, k.metal, 6, 'y', { surface: k.metalSurface });
        lamps.cylinder(lx, topY + 0.22, cz, 0.045, 0.07, 0.08, tier >= 2 ? '#F6D9B5' : PALETTE.lampShade, 12, 'y', { shade: 0.9 });
      }
      const px = r.x0 + w * 0.55;
      const pz = cz - 0.2;
      b.cylinder(px, topY + 0.015, pz, 0.1, 0.1, 0.012, tier <= 0 ? '#E3DED3' : '#FBF8F2', 16, 'y', { surface: 'ceramic' });
      if (tier >= 3) {
        b.cylinder(px, topY + 0.022, pz, 0.075, 0.075, 0.004, PALETTE.gold, 16, 'y', { ...FLAT, surface: 'brass' });
        b.cylinder(lx, topY + 0.07, cz + 0.22, 0.014, 0.02, 0.12, '#DDEBEF', 8, 'y', { surface: 'glass' });
        b.sphere(lx, topY + 0.15, cz + 0.22, 0.03, '#C0485C', 1, 0.9, FLAT);
      }
      b.cylinder(px + inward * 0.15, topY + 0.06, pz + 0.06, 0.022, 0.016, 0.1, '#E8EEF2', 8, 'y', { surface: 'glass' });
      return true;
    }
    case 'bar':
      buildBar(b, prop, theme, tier, k);
      return true;
    case 'bottles': {
      // The cocktail list: a crowd of bright bottles on the back-bar and a silver shaker.
      const bx = (r.x0 + r.x1) / 2;
      const y = tier >= 3 ? Y + 0.79 : Y + 0.87;
      const colours = ['#C0485C', '#E5B452', '#6FA8DC', '#8E6A8C', '#4F9591', '#E08A6E'];
      for (let i = 0, z = r.z0 + 0.2; z < r.z1 - 0.15; z += 0.5, i++) {
        if (tier >= 3 && i % 3 === 0) continue;
        const c = colours[i % colours.length];
        b.cylinder(bx - out * 0.08, y, z, 0.028, 0.028, 0.12, c, 8, 'y', { shade: 0.95, surface: 'glass' });
        b.cylinder(bx - out * 0.08, y + 0.09, z, 0.01, 0.016, 0.06, c, 6, 'y', { shade: 1, surface: 'glass' });
      }
      b.cylinder(bx - out * 0.08, y + 0.03, r.z1 - 0.12, 0.035, 0.03, 0.17, PALETTE.chrome, 10, 'y', { surface: 'steel' });
      return true;
    }
    case 'stool': {
      // A bar stool: a wooden milking stool when run down, then a round seat on a post with a foot ring, in leather,
      // then ochre velvet on brass.
      const radius = Math.min(w, d) / 2 - 0.02;
      if (tier <= 0) {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          b.add(new THREE.CylinderGeometry(0.018, 0.022, 0.6, 6), '#86705D', cx + Math.cos(a) * radius * 0.45, Y + 0.3, cz + Math.sin(a) * radius * 0.45, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12, { shade: 0.85 });
        }
        b.cylinder(cx, Y + 0.62, cz, radius, radius, 0.05, '#9C8570', 14, 'y', { shade: 0.95, surface: 'wood' });
        return true;
      }
      const seat = tier >= 3 ? LUX.ochre : tier === 2 ? '#6B3A26' : k.cushion;
      b.cylinder(cx, Y + 0.02, cz, radius * 0.8, radius * 0.9, 0.04, k.metal, 12, 'y', { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.3, cz, 0.025, 0.025, 0.56, k.metal, 8, 'y', { surface: k.metalSurface });
      b.add(new THREE.TorusGeometry(radius * 0.7, 0.012, 6, 14), k.metal, cx, Y + 0.24, cz, Math.PI / 2, 0, 0, { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.6, cz, radius, radius * 0.92, 0.07, seat, 16, 'y', { shade: 0.95, surface: tier >= 3 ? 'velvet' : 'leather' });
      return true;
    }
    case 'loungeChair':
      buildLoungeChair(b, prop, theme, tier);
      return true;
    case 'sideTable':
      buildSideTable(b, lamps, prop, tier);
      return true;
    case 'banquette':
      buildBanquette(b, prop, theme, tier);
      return true;
    case 'domeSeat': {
      // A seat turned toward the lake windows (−x): a slatted bench when run down, then padded, plush and (Luxury)
      // velvet with gold piping and a tartan blanket over the arm.
      const facing = prop.facing === 'left' ? -1 : 1;
      const backX = facing < 0 ? r.x1 - 0.08 : r.x0 + 0.08;
      if (tier <= 0) {
        for (const fz of [r.z0 + 0.06, r.z1 - 0.06]) b.box(cx, Y + 0.2, fz, w - 0.1, 0.4, 0.05, '#86705D', 0, { shade: 0.8 });
        for (let i = 0; i < 4; i++) b.box(cx, Y + 0.415, r.z0 + 0.1 + (d - 0.2) * (i / 3), w - 0.06, 0.03, 0.08, '#9C8570', 0, { shade: 0.95 });
        b.box(backX, Y + 0.64, cz, 0.04, 0.36, d - 0.08, '#9C8570', 0, { shade: 0.9 });
        return true;
      }
      const cover = tier === 1 ? '#8E9AAA' : theme.deep;
      const surface = tier >= 2 ? 'velvet' : 'fabric';
      b.box(cx, Y + 0.1, cz, w - 0.08, 0.2, d - 0.08, tier >= 3 ? PALETTE.walnutDark : k.woodDark, 0, { shade: 0.75 });
      b.rounded(cx, Y + 0.28, cz, w - 0.04, 0.16, d - 0.04, 0.06, cover, { shade: 0.85, surface });
      b.rounded(backX, Y + 0.56, cz, 0.14, 0.5, d - 0.06, 0.06, cover, { shade: 0.85, surface });
      for (const az of [r.z0 + 0.06, r.z1 - 0.06]) b.rounded(cx, Y + 0.44, az, w - 0.12, 0.14, 0.1, 0.04, cover, { shade: 0.9, surface });
      if (tier >= 2) b.rounded(backX + facing * 0.11, Y + 0.5, cz, 0.08, 0.2, d * 0.5, 0.04, PALETTE.pillow, { shade: 0.95, surface: 'fabric' });
      if (tier >= 3) {
        b.box(backX, Y + 0.82, cz, 0.15, 0.02, d - 0.08, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
        // A tartan blanket folded over the front arm.
        b.box(cx, Y + 0.525, r.z1 - 0.06, w - 0.14, 0.03, 0.12, '#B23A3A', 0, { pattern: PATTERN.checker, color2: '#2E4A6E', scale: 0.04, shade: 1, surface: 'fabric' });
      }
      return true;
    }
    case 'basket': {
      b.rounded(cx, Y + 0.2, cz, w - 0.04, 0.4, d - 0.04, 0.12, tier <= 0 ? '#A98D6F' : '#C9A77A', { shade: 0.8, pattern: PATTERN.checker, color2: tier <= 0 ? '#957A5E' : '#B8956A', scale: 0.05 });
      for (let i = 0; i < 3; i++) b.rounded(cx, Y + 0.44 + i * 0.07, cz, w - 0.16, 0.07, d - 0.14, 0.04, i % 2 ? PALETTE.linen : theme.blanket, { shade: 0.92, surface: 'fabric' });
      return true;
    }
    case 'rope': {
      // Posts with a rope between them: the dome's "please wait to be seated" (string on stakes when run down).
      const posts = Math.max(2, Math.round(w / 0.7) + 1);
      const post = tier <= 0 ? '#86705D' : k.metal;
      const postSurface = tier <= 0 ? 'wood' : k.metalSurface;
      for (let i = 0; i < posts; i++) {
        const px = r.x0 + 0.04 + (w - 0.08) * (i / (posts - 1));
        b.cylinder(px, Y + 0.02, cz, 0.06, 0.07, 0.04, post, 10, 'y', { surface: postSurface });
        b.cylinder(px, Y + 0.46, cz, 0.018, 0.018, 0.88, post, 8, 'y', { surface: postSurface });
        b.sphere(px, Y + 0.92, cz, 0.035, post, 1, 1, { shade: 1, surface: postSurface });
        if (i < posts - 1) {
          const nx = r.x0 + 0.04 + (w - 0.08) * ((i + 1) / (posts - 1));
          const span = nx - px;
          b.add(new THREE.TorusGeometry(span / 2, tier <= 0 ? 0.008 : 0.016, 6, 12, Math.PI), tier <= 0 ? '#BFAF92' : '#9C2F45', (px + nx) / 2, Y + 0.86, cz, Math.PI, 0, 0, { shade: 1, surface: 'velvet' });
        }
      }
      return true;
    }
    case 'wineRack': {
      const h = 0.9;
      b.box(cx, Y + h / 2, cz, w - 0.02, h, d - 0.02, k.woodDark, 0, { shade: 0.75 });
      for (let row = 0; row < 4; row++) {
        for (let i = 0, z = r.z0 + 0.15; z < r.z1 - 0.1; z += 0.2, i++) {
          const colour = (row + i) % 3 === 0 ? '#6E2433' : '#2F4A33';
          b.cylinder(front + out * 0.006, Y + 0.15 + row * 0.2, z, 0.045, 0.045, 0.02, colour, 8, 'x', { shade: 1, surface: 'glass' });
        }
      }
      b.slab(r, Y + h, Y + h + 0.03, k.top, 0, 0, { ...FLAT, surface: k.topSurface });
      return true;
    }
    case 'aquarium': {
      const cab = 0.48;
      b.box(cx, Y + cab / 2, cz, w - 0.02, cab, d - 0.02, k.woodDark, 0, { shade: 0.75 });
      b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + cab, Y + cab + 0.03, '#C9B98F', 0, 0, FLAT);
      lamps.slab(rect(r.x0 + 0.04, r.z0 + 0.04, r.x1 - 0.04, r.z1 - 0.04), Y + cab + 0.03, Y + cab + 0.36, '#4E9BB8', 0, 0, { shade: 0.8 });
      b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + cab + 0.37, Y + cab + 0.4, k.metal, 0, 0, { ...FLAT, surface: k.metalSurface });
      b.add(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 0.6, 1.8), '#C8453A', cx, Y + cab + 0.4, cz, 0, 0, 0, FLAT);
      for (const side of [-1, 1]) b.add(new THREE.SphereGeometry(0.03, 6, 4).scale(1, 0.6, 1.6), '#D9583F', cx + side * 0.06, Y + cab + 0.42, cz - 0.1, 0, side * 0.5, 0, FLAT);
      return true;
    }
    case 'telescope': {
      const tx = cx;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const fx = tx + Math.cos(a) * 0.13;
        const fz = cz + Math.sin(a) * 0.13;
        b.add(new THREE.CylinderGeometry(0.012, 0.016, 0.82, 6), k.woodDark, (tx + fx) / 2, Y + 0.4, (cz + fz) / 2, Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16, { shade: 0.85 });
      }
      b.add(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10), PALETTE.brass, tx, Y + 0.86, cz, 0, 0, Math.PI / 2 + out * -0.25, { shade: 0.95, surface: 'brass' });
      return true;
    }
    // ── Session 21: the cinema ─────────────────────────────────────────────────────────────
    case 'screen':
      buildScreen(b, prop, theme, tier);
      return true;
    case 'cinemaSeat':
      buildCinemaSeat(b, prop, tier, Math.round(cz * 10));
      return true;
    case 'projector':
      buildProjector(b, lamps, prop, tier);
      return true;
    case 'popcornMachine': {
      // On the counter: a pot of popcorn when run down, then a glass popcorn machine with a red top (gold at Luxury),
      // lit inside and heaped with popcorn.
      const top = Y + 0.95;
      if (tier <= 0) {
        b.cylinder(cx, top + 0.09, cz, 0.15, 0.13, 0.18, '#8F969C', 12, 'y', { surface: 'paint' });
        for (const [dx, dz] of [[0, 0], [0.06, 0.04], [-0.05, 0.05], [0.03, -0.06], [-0.06, -0.03]]) b.sphere(cx + dx, top + 0.19, cz + dz, 0.04, '#FFF1C9', 1, 0.8, FLAT);
        return true;
      }
      const frame = tier >= 3 ? PALETTE.gold : '#C93B36';
      b.box(cx, top + 0.06, cz, w - 0.1, 0.12, d - 0.12, frame, 0, { shade: 0.85, surface: 'paint' });
      for (const fx of [r.x0 + 0.07, r.x1 - 0.07]) for (const fz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(fx, top + 0.33, fz, 0.025, 0.42, 0.025, frame, 0, { ...FLAT, surface: 'paint' });
      b.box(cx, top + 0.57, cz, w - 0.1, 0.06, d - 0.12, frame, 0, { ...FLAT, surface: 'paint' });
      b.prism(cx, top + 0.65, cz, w - 0.14, 0.1, d - 0.16, frame, { shade: 1, surface: 'paint' });
      lamps.box(cx, top + 0.18, cz, w - 0.2, 0.1, d - 0.24, '#FFE7A8', 0, { shade: 0.9 });
      for (const [dx, dz] of [[0.05, 0.1], [-0.06, -0.08], [0.02, -0.2], [-0.04, 0.18], [0.06, -0.02]]) b.sphere(cx + dx, top + 0.28, cz + dz, 0.035, '#FFF1C9', 1, 0.8, FLAT);
      b.cylinder(cx, top + 0.47, cz, 0.06, 0.05, 0.05, '#9AA0A6', 10, 'y', { surface: 'steel' });
      return true;
    }
    case 'candyCart': {
      // The candy bar: a cart with a striped canopy on poles and jars of sweets.
      const cart = tier >= 3 ? LUX.mahogany : tier === 2 ? theme.deep : '#C93B36';
      b.box(cx, Y + 0.38, cz, w - 0.06, 0.46, d - 0.06, cart, 0, { shade: 0.8, surface: 'paint' });
      for (const fz of [r.z0 + 0.14, r.z1 - 0.14]) b.cylinder(cx, Y + 0.08, fz, 0.07, 0.07, 0.04, '#2B2A2E', 12, 'x', FLAT);
      b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + 0.61, Y + 0.64, tier >= 3 ? '#F1ECE4' : PALETTE.linen, 0, 0, FLAT);
      const sweets = ['#E05A73', '#F2C14E', '#6FB7D9', '#8BC37A', '#C985D6'];
      for (let i = 0; i < 5; i++) b.cylinder(cx + (i % 2 ? 0.06 : -0.06), Y + 0.71, r.z0 + 0.15 + (d - 0.3) * (i / 4), 0.05, 0.05, 0.14, sweets[i], 10, 'y', { shade: 1, surface: 'glass' });
      for (const fz of [r.z0 + 0.05, r.z1 - 0.05]) b.cylinder(back + out * 0.06, Y + 0.95, fz, 0.012, 0.012, 0.62, tier >= 2 ? PALETTE.brass : '#CFCFCF', 6, 'y', { surface: tier >= 2 ? 'brass' : 'steel' });
      b.box(back + out * 0.2, Y + 1.27, cz, 0.32, 0.03, d - 0.02, '#F7EFE2', 0, { pattern: PATTERN.stripesZ, color2: '#D9433F', scale: 0.12, shade: 1, surface: 'fabric' });
      return true;
    }
    case 'speakers': {
      if (prop.variant === 'spot') {
        // A premiere spotlight on a tripod, its lamp tilted up toward the screen.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          b.add(new THREE.CylinderGeometry(0.012, 0.014, 0.8, 6), '#2B2A2E', cx + Math.cos(a) * 0.08, Y + 0.38, cz + Math.sin(a) * 0.08, Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14, FLAT);
        }
        b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 12), '#2B2A2E', cx, Y + 0.86, cz, 0, 0, -out * 0.9, { shade: 0.9, surface: 'paint' });
        lamps.add(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 12), '#FFF2C8', cx + out * 0.085, Y + 0.93, cz, 0, 0, -out * 0.9, FLAT);
        return true;
      }
      // A tall speaker cabinet beside the screen: two cones and a horn on its front.
      const h = 1.2;
      const box = tier >= 3 ? LUX.mahogany : '#26252B';
      b.box(cx, Y + h / 2, cz, w - 0.04, h, d - 0.04, box, 0, { shade: 0.8, surface: 'varnish' });
      for (const [cy, rad] of [[0.32, 0.17], [0.72, 0.13]] as [number, number][]) {
        b.cylinder(front + out * 0.012, Y + cy, cz, Math.min(rad, d / 2 - 0.06), Math.min(rad, d / 2 - 0.06), 0.02, '#3A3940', 16, 'x', FLAT);
        b.cylinder(front + out * 0.02, Y + cy, cz, rad * 0.35, rad * 0.35, 0.02, '#55545C', 10, 'x', FLAT);
      }
      b.box(front + out * 0.015, Y + 1.0, cz, 0.03, 0.12, d * 0.6, '#3A3940', 0, FLAT);
      if (tier >= 3) b.box(cx, Y + h + 0.01, cz, w - 0.02, 0.02, d - 0.02, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
      return true;
    }
    case 'premiere': {
      // A red carpet from the door to the seats, edged in gold.
      // (Above the thickest carpet a refit lays, so the two never share a face.)
      b.slab(r, Y + 0.032, Y + 0.038, PALETTE.gold, 0, 0, FLAT);
      b.slab(rect(r.x0 + 0.04, r.z0, r.x1 - 0.04, r.z1), Y + 0.038, Y + 0.044, '#B3242E', 0, 0, { ...FLAT, surface: 'velvet' });
      return true;
    }
    case 'reels': {
      // Film cans stacked on a crate and a rack of reels: the stock room in a corner.
      b.box(cx - 0.08, Y + 0.22, r.z0 + d * 0.25, Math.min(w - 0.2, 0.6), 0.44, d * 0.42, '#9C8570', 0, CRATE);
      for (let i = 0; i < 4; i++) b.cylinder(cx - 0.08, Y + 0.465 + i * 0.045, r.z0 + d * 0.25, 0.17, 0.17, 0.04, i % 2 ? '#7E8790' : '#9AA2AA', 16, 'y', { surface: 'paint' });
      b.box(back + out * 0.2, Y + 0.45, r.z0 + d * 0.72, 0.36, 0.9, d * 0.42, tier >= 1 ? PALETTE.walnut : '#8A7864', 0, { shade: 0.8 });
      for (let i = 0; i < 3; i++) b.cylinder(back + out * 0.385, Y + 0.25 + i * 0.25, r.z0 + d * 0.72, 0.1, 0.1, 0.02, '#3A3940', 14, 'x', FLAT);
      return true;
    }
    case 'cornerSofa':
      buildCornerSofa(b, prop, tier);
      return true;
    // ── Session 21: the furnishings ────────────────────────────────────────────────────────
    case 'planter':
      buildPlanter(b, prop, theme, tier);
      return true;
    case 'crates': {
      // Storage before the place is done up: crates and sacks where a dresser will go.
      const n = Math.max(1, Math.round(d / 0.55));
      for (let i = 0; i < n; i++) {
        const pz = r.z0 + (d / n) * (i + 0.5);
        const cw = Math.min(w - 0.04, 0.42);
        const ch = i % 2 ? 0.36 : 0.42;
        b.box(back + out * (cw / 2 + 0.02), Y + ch / 2, pz, cw, ch, d / n - 0.06, i % 2 ? '#A88C6C' : '#9A7F61', 0, CRATE);
        if (i % 2 === 0 && d / n > 0.4) b.box(back + out * (cw / 2 + 0.02), Y + ch + 0.15, pz, cw - 0.08, 0.3, d / n - 0.16, '#9A7F61', 0, CRATE);
        // A sack slumped beside the crate.
        if (w > 0.66) b.rounded(back + out * (cw + 0.16), Y + 0.17, pz, Math.min(0.24, w - cw - 0.1), 0.34, Math.min(0.36, d / n - 0.1), 0.1, '#B79C74', { shade: 0.85, surface: 'fabric' });
      }
      return true;
    }
    case 'sideboard':
      buildSideboard(b, lamps, prop, theme, tier);
      return true;
    case 'wallBoard':
      buildWallBoard(b, lamps, prop, tier);
      return true;
    case 'coatStand': {
      // A coat stand by the door with a coat and a hat on it (brass from the Cosy refit, an umbrella at Luxury).
      const pole = tier >= 2 ? PALETTE.brass : PALETTE.walnutDark;
      const surface = tier >= 2 ? 'brass' : 'varnish';
      const rad = Math.min(w, d) / 2 - 0.03;
      b.cylinder(cx, Y + 0.02, cz, rad * 0.9, rad, 0.04, pole, 12, 'y', { surface });
      b.cylinder(cx, Y + 0.8, cz, 0.018, 0.022, 1.56, pole, 8, 'y', { surface });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 5), pole, cx + Math.cos(a) * 0.05, Y + 1.5, cz + Math.sin(a) * 0.05, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, { surface });
      }
      b.rounded(cx + 0.04, Y + 1.2, cz, 0.12, 0.5, 0.2, 0.05, tier >= 2 ? theme.deep : '#5E5A54', { shade: 0.85, surface: 'fabric' });
      b.cylinder(cx - 0.02, Y + 1.6, cz, 0.08, 0.08, 0.01, '#3A3440', 12, 'y', FLAT);
      b.cylinder(cx - 0.02, Y + 1.645, cz, 0.05, 0.055, 0.08, '#3A3440', 12, 'y', FLAT);
      if (tier >= 3) b.cylinder(cx - 0.1, Y + 0.38, cz + 0.08, 0.014, 0.014, 0.74, '#2B2A2E', 6, 'y', FLAT);
      return true;
    }
    case 'trolley':
      buildTrolley(b, prop, tier);
      return true;
    default:
      return false;
  }
}

/**
 * The bar along the wall: the counter toward the room with a back-bar against the wall behind it. Run down: a plank on
 * barrels and crates for a back-bar. Repaired: plain panelled wood. Cosy: buttoned leather panels in the bar's teal, a
 * brass rail and a mirror. Luxury (the owner's reference): a green panelled counter with gold mouldings and a marble
 * top, and an arched glass cabinet of bottles behind. Eight bulbs along the front light up as the party builds.
 */
function buildBar(b: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number, k: Dress): void {
  const r = prop.rect;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0;
  const out = prop.facing === 'right' ? 1 : -1;
  const front = out > 0 ? r.x1 : r.x0;
  const back = out > 0 ? r.x0 : r.x1;
  const h = 1.0;
  const cx0 = out > 0 ? front - 0.45 : front;
  const cx1 = out > 0 ? front : front + 0.45;
  const ccx = (cx0 + cx1) / 2;
  if (tier <= 0) {
    const barrels = Math.max(3, Math.round(d / 0.75));
    for (let i = 0; i < barrels; i++) {
      const pz = r.z0 + (d / barrels) * (i + 0.5);
      b.cylinder(ccx, Y + (h - 0.06) / 2, pz, 0.2, 0.2, h - 0.06, '#8A6A4C', 14, 'y', { shade: 0.8, surface: 'wood' });
      for (const by of [0.2, 0.74]) b.cylinder(ccx, Y + by, pz, 0.205, 0.205, 0.03, PALETTE.iron, 14, 'y', { surface: 'iron' });
    }
    b.slab(rect(cx0, r.z0, cx1, r.z1), Y + h - 0.06, Y + h + 0.02, '#A88F74', 0, 0, { ...FLAT, surface: 'wood' });
  } else {
    const body = tier >= 3 ? LUX.barGreen : k.wood;
    b.box(ccx, Y + 0.04, cz, 0.4, 0.08, d - 0.04, k.woodDark, 0, { shade: 0.7 });
    b.box(ccx, Y + h / 2, cz, 0.42, h - 0.04, d - 0.02, body, 0, { shade: 0.72, surface: tier >= 2 ? 'varnish' : 'wood' });
    const panels = Math.max(3, Math.round(d / 0.85));
    for (let i = 0; i < panels; i++) {
      const pz = r.z0 + (d / panels) * (i + 0.5);
      const panel = tier >= 3 ? LUX.barGreenDeep : tier === 2 ? theme.deep : k.woodDark;
      b.box(front + out * 0.011, Y + 0.5, pz, 0.02, 0.6, d / panels - 0.14, panel, 0, { shade: 0.9, surface: tier === 2 ? 'leather' : 'varnish' });
      if (tier === 2) for (let j = 0; j < 3; j++) b.sphere(front + out * 0.024, Y + 0.32 + j * 0.18, pz, 0.012, PALETTE.brass, 0, 1, { ...FLAT, surface: 'brass' });
      if (tier >= 3) {
        for (const dy of [-0.31, 0.31]) b.box(front + out * 0.024, Y + 0.5 + dy, pz, 0.006, 0.014, d / panels - 0.1, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
        for (const s of [-1, 1]) b.box(front + out * 0.024, Y + 0.5, pz + s * (d / panels / 2 - 0.05), 0.006, 0.62, 0.014, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
      }
    }
    b.slab(rect(cx0 - (out < 0 ? 0.04 : 0), r.z0, cx1 + (out > 0 ? 0.04 : 0), r.z1), Y + h - 0.02, Y + h + 0.03, tier >= 3 ? '#E9E3D8' : k.top, 0, 0, { ...FLAT, surface: tier >= 3 ? 'marble' : k.topSurface });
    if (tier >= 2) b.cylinder(front + out * 0.07, Y + 0.16, cz, 0.018, 0.018, d - 0.1, k.metal, 8, 'z', { surface: k.metalSurface });
  }
  // The back-bar against the wall.
  const bx0 = out > 0 ? back : cx1 + 0.07;
  const bx1 = out > 0 ? cx0 - 0.07 : back;
  const bxc = (bx0 + bx1) / 2;
  const bw = bx1 - bx0;
  const base = ['#3E6B4A', '#7A4A2E', '#2F4E6E', '#8E3A3A'];
  if (tier <= 0) {
    for (let i = 0, z = r.z0 + 0.45; z < r.z1 - 0.3; z += 0.9, i++) {
      b.box(bxc, Y + 0.22, z, bw - 0.02, 0.44, 0.7, i % 2 ? '#A88C6C' : '#9A7F61', 0, CRATE);
      b.cylinder(bxc, Y + 0.52, z, 0.035, 0.035, 0.16, base[i % base.length], 8, 'y', { shade: 0.95, surface: 'glass' });
    }
  } else if (tier < 3) {
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y, Y + 0.78, k.woodDark, 0, 0, { shade: 0.75 });
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y + 0.78, Y + 0.81, k.top, 0, 0, { ...FLAT, surface: k.topSurface });
    for (let i = 0, z = r.z0 + 0.35; z < r.z1 - 0.3; z += 0.5, i++) {
      b.cylinder(bxc + out * 0.06, Y + 0.89, z, 0.035, 0.035, 0.16, base[i % base.length], 8, 'y', { shade: 0.95, surface: 'glass' });
      b.cylinder(bxc + out * 0.06, Y + 1.0, z, 0.012, 0.02, 0.06, base[i % base.length], 6, 'y', { shade: 1, surface: 'glass' });
    }
  } else {
    // An arched glass cabinet: a green base, glazed bays with round heads, bottles on glass shelves inside and a gold
    // crown along the top. It stands taller than the cut-away wall, on the lake side, where it hides nothing.
    const top = Y + 1.5;
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y, Y + 0.7, LUX.barGreenDeep, 0, 0, { shade: 0.75, surface: 'varnish' });
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y + 0.7, Y + 0.73, '#E9E3D8', 0, 0, { ...FLAT, surface: 'marble' });
    const bays = Math.max(3, Math.round((d - 0.2) / 1.3));
    const bayLen = (d - 0.2) / bays;
    const glassFace = (out > 0 ? bx1 : bx0) - out * 0.01;
    for (let i = 0; i < bays; i++) {
      const z0 = r.z0 + 0.1 + i * bayLen;
      const zc = z0 + bayLen / 2;
      b.box(bxc, (Y + 0.73 + top) / 2, z0 + 0.03, bw - 0.02, top - Y - 0.73, 0.06, PALETTE.walnutDark, 0, { shade: 0.85, surface: 'varnish' });
      b.box(back + out * 0.012, (Y + 0.73 + top) / 2, zc, 0.02, top - Y - 0.73, bayLen - 0.06, '#3B2A22', 0, { shade: 0.9 });
      for (const sy of [0.98, 1.24]) {
        b.box(bxc, Y + sy, zc, bw - 0.08, 0.012, bayLen - 0.08, '#D7E6EA', 0, { ...FLAT, surface: 'glass' });
        for (let j = 0; j < 3; j++) b.cylinder(bxc, Y + sy + 0.076, z0 + 0.22 + (bayLen - 0.44) * (j / 2), 0.03, 0.03, 0.14, base[(i + j) % base.length], 8, 'y', { shade: 1, surface: 'glass' });
      }
      // The bay's round head: a gilt arch on the glass face.
      b.add(new THREE.TorusGeometry(bayLen / 2 - 0.06, 0.018, 6, 16, Math.PI), PALETTE.gold, glassFace, top - bayLen / 2 + 0.02, zc, 0, Math.PI / 2, 0, { shade: 1, surface: 'brass' });
    }
    b.box(bxc, (Y + 0.73 + top) / 2, r.z1 - 0.13, bw - 0.02, top - Y - 0.73, 0.06, PALETTE.walnutDark, 0, { shade: 0.85, surface: 'varnish' });
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), top, top + 0.05, PALETTE.walnutDark, 0, 0, { shade: 0.9, surface: 'varnish' });
    b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), top + 0.05, top + 0.07, PALETTE.gold, 0, 0.02, { ...FLAT, surface: 'brass' });
  }
  // Glasses at the mixing end and a dish of lemons.
  const topY = Y + h + (tier <= 0 ? 0.02 : 0.03);
  b.cylinder(cx0 + 0.15, topY + 0.04, r.z0 + 0.2, 0.03, 0.022, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
  b.cylinder(cx0 + 0.28, topY + 0.04, r.z0 + 0.24, 0.03, 0.022, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
  b.cylinder(cx0 + 0.2, topY + 0.015, r.z0 + 0.42, 0.07, 0.05, 0.03, PALETTE.porcelain, 12, 'y', { surface: 'ceramic' });
  for (const dz of [-0.025, 0.025]) b.sphere(cx0 + 0.2, topY + 0.05, r.z0 + 0.42 + dz, 0.025, '#E9C94A', 0, 0.85, FLAT);
  // The bulbs' sockets (the bulbs themselves glow from CarriageView).
  for (const z of barBulbs(r, out)) b.cylinder(front + out * 0.02, Y + 0.86, z, 0.022, 0.022, 0.03, tier <= 0 ? PALETTE.iron : k.metal, 8, 'x', { surface: tier <= 0 ? 'iron' : k.metalSurface });
}

/** A lounge armchair turned to the room: worn, then leather, velvet, and (Luxury) an ochre velvet tub chair. */
function buildLoungeChair(b: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const toRoom = prop.facing === 'right' ? 1 : -1;
  const backX = toRoom > 0 ? r.x0 + 0.1 : r.x1 - 0.1;
  if (tier >= 3) {
    // A tub chair: a barrel back curving round the seat (a ring of panels), a deep cushion, short gilt feet.
    const radius = Math.min(w, d) / 2 - 0.03;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.cylinder(cx + Math.cos(a) * radius * 0.7, Y + 0.05, cz + Math.sin(a) * radius * 0.7, 0.02, 0.016, 0.1, PALETTE.gold, 6, 'y', { surface: 'paint' });
    }
    b.cylinder(cx, Y + 0.25, cz, radius, radius, 0.3, LUX.ochreDeep, 20, 'y', { shade: 0.8, surface: 'velvet' });
    b.cylinder(cx + toRoom * 0.03, Y + 0.43, cz, radius - 0.08, radius - 0.08, 0.08, LUX.ochre, 18, 'y', { shade: 0.95, surface: 'velvet' });
    // The back: panels round the half of the ring away from the room.
    const segments = 7;
    const span = Math.PI * 1.2;
    const facing = toRoom > 0 ? Math.PI : 0;
    for (let i = 0; i < segments; i++) {
      const a = facing - span / 2 + span * ((i + 0.5) / segments);
      const px = cx + Math.cos(a) * (radius - 0.05);
      const pz = cz + Math.sin(a) * (radius - 0.05);
      const chord = 2 * (radius - 0.02) * Math.sin(span / segments / 2) + 0.01;
      b.add(new THREE.BoxGeometry(0.09, 0.36, chord), LUX.ochre, px, Y + 0.58, pz, 0, -a, 0, { shade: 0.9, surface: 'velvet' });
    }
    b.rounded(backX + toRoom * 0.12, Y + 0.56, cz, 0.08, 0.2, d * 0.4, 0.04, LUX.cream, { shade: 0.95, pattern: PATTERN.diamond, color2: LUX.orange, scale: 0.06, surface: 'fabric' });
    return;
  }
  const cover = tier <= 0 ? '#8E8577' : tier === 1 ? '#6B3A26' : theme.deep;
  const surface = tier === 1 ? 'leather' : tier === 2 ? 'velvet' : 'fabric';
  for (const fx of [r.x0 + 0.1, r.x1 - 0.1]) for (const fz of [r.z0 + 0.1, r.z1 - 0.1]) b.cylinder(fx, Y + 0.05, fz, 0.025, 0.02, 0.1, PALETTE.walnutDark, 8, 'y', { surface: 'varnish' });
  b.rounded(cx, Y + 0.22, cz, w - 0.06, 0.22, d - 0.06, 0.06, cover, { shade: 0.8, surface });
  b.rounded(cx + toRoom * 0.05, Y + 0.38, cz, w - 0.26, 0.1, d - 0.26, 0.05, shadeHex(cover, 1.1), { shade: 0.95, surface });
  b.rounded(backX, Y + 0.6, cz, 0.18, 0.56, d - 0.04, 0.08, cover, { shade: 0.85, surface });
  for (const az of [r.z0 + 0.08, r.z1 - 0.08]) b.rounded(cx, Y + 0.46, az, w - 0.08, 0.26, 0.15, 0.07, cover, { shade: 0.85, surface });
  if (tier === 1) for (let i = 0; i < 3; i++) b.sphere(backX + toRoom * 0.092, Y + 0.56 + (i % 2) * 0.14, cz - 0.16 + i * 0.16, 0.014, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
  if (tier === 2) b.rounded(backX + toRoom * 0.14, Y + 0.54, cz, 0.08, 0.2, d * 0.4, 0.04, PALETTE.pillow, { shade: 0.95, surface: 'fabric' });
}

/**
 * A small round table: a barrel or a crate when run down, plain wood, brass-rimmed with a lamp when cosy, and (Luxury)
 * the owner's reference: a marble top on a black-and-cream striped pedestal with a brass mushroom lamp.
 */
function buildSideTable(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const radius = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 - 0.02;
  const cinema = prop.variant === 'cinema';
  const height = cinema ? 0.5 : 0.56;
  if (tier <= 0) {
    if (prop.variant === 'bar') {
      b.cylinder(cx, Y + height / 2, cz, radius * 0.9, radius * 0.9, height, '#8A6A4C', 14, 'y', { shade: 0.8, surface: 'wood' });
      for (const by of [0.12, height - 0.1]) b.cylinder(cx, Y + by, cz, radius * 0.92, radius * 0.92, 0.03, PALETTE.iron, 14, 'y', { surface: 'iron' });
    } else b.box(cx, Y + height / 2, cz, radius * 1.6, height, radius * 1.6, '#9A7F61', 0, CRATE);
    return;
  }
  const topY = Y + height;
  if (tier >= 3) {
    b.cylinder(cx, Y + 0.02, cz, radius * 0.7, radius * 0.75, 0.04, LUX.stripeDark, 14, 'y', FLAT);
    b.cylinder(cx, Y + height / 2, cz, 0.05, 0.06, height - 0.04, LUX.cream, 12, 'y', { pattern: PATTERN.stripesX, color2: LUX.stripeDark, scale: 0.08, shade: 0.95, surface: 'varnish' });
    b.cylinder(cx, topY - 0.015, cz, radius, radius, 0.03, '#EFE9E0', 20, 'y', { ...FLAT, surface: 'marble' });
    b.cylinder(cx, topY - 0.036, cz, radius + 0.004, radius + 0.004, 0.012, PALETTE.gold, 20, 'y', { ...FLAT, surface: 'brass' });
  } else {
    b.cylinder(cx, Y + 0.02, cz, radius * 0.6, radius * 0.65, 0.04, PALETTE.walnutDark, 12, 'y', FLAT);
    b.cylinder(cx, Y + height / 2, cz, 0.03, 0.04, height - 0.04, PALETTE.walnutDark, 8, 'y', { surface: 'varnish' });
    b.cylinder(cx, topY - 0.015, cz, radius, radius, 0.03, tier === 2 ? PALETTE.walnut : PALETTE.oakMid, 18, 'y', { ...FLAT, surface: 'varnish' });
    if (tier === 2) b.cylinder(cx, topY - 0.036, cz, radius + 0.004, radius + 0.004, 0.012, PALETTE.brass, 18, 'y', { ...FLAT, surface: 'brass' });
  }
  if (cinema) {
    // A carton of popcorn waiting on it.
    b.cylinder(cx, topY + 0.045, cz, 0.04, 0.03, 0.09, '#D9433F', 10, 'y', { pattern: PATTERN.stripesZ, color2: '#FBF5EA', scale: 0.04, shade: 0.95 });
    b.sphere(cx, topY + 0.1, cz, 0.035, '#FFF1C9', 1, 0.7, FLAT);
    return;
  }
  if (tier >= 2) {
    // A lamp: a brass mushroom at Luxury, a pleated shade when cosy.
    b.cylinder(cx, topY + 0.015, cz, 0.05, 0.06, 0.03, PALETTE.brass, 12, 'y', { surface: 'brass' });
    b.cylinder(cx, topY + 0.13, cz, 0.012, 0.012, 0.2, PALETTE.brass, 6, 'y', { surface: 'brass' });
    if (tier >= 3) {
      b.add(new THREE.SphereGeometry(0.1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.gold, cx, topY + 0.23, cz, 0, 0, 0, { shade: 1, surface: 'paint' });
      lamps.cylinder(cx, topY + 0.225, cz, 0.08, 0.08, 0.008, '#FFE2B0', 14, 'y', FLAT);
    } else {
      lamps.cylinder(cx, topY + 0.28, cz, 0.05, 0.08, 0.1, '#F6D9B5', 12, 'y', { shade: 0.9 });
    }
  } else if (prop.variant === 'dome') {
    // Binoculars left on it.
    for (const dz of [-0.03, 0.03]) b.cylinder(cx, topY + 0.022, cz + dz, 0.022, 0.022, 0.08, '#3F4E66', 8, 'x', FLAT);
  } else {
    b.cylinder(cx + 0.04, topY + 0.04, cz, 0.03, 0.022, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
  }
}

/** A banquette against the wall, facing the room: a bench with a blanket, upholstered, buttoned leather, tufted velvet. */
function buildBanquette(b: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const toRoom = prop.facing === 'right' ? 1 : -1;
  const backX = toRoom > 0 ? r.x0 + 0.09 : r.x1 - 0.09;
  if (tier <= 0) {
    for (const fz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(cx, Y + 0.2, fz, w - 0.12, 0.4, 0.06, '#86705D', 0, { shade: 0.8 });
    b.box(cx, Y + 0.425, cz, w - 0.06, 0.05, d - 0.04, '#9C8570', 0, { shade: 0.95, surface: 'wood' });
    b.box(backX, Y + 0.72, cz, 0.05, 0.5, d - 0.04, '#9C8570', 0, { shade: 0.9, surface: 'wood' });
    b.box(cx + toRoom * 0.04, Y + 0.465, cz + d * 0.2, w - 0.24, 0.03, 0.3, '#8E6A5A', 0, { pattern: PATTERN.checker, color2: '#6E5A4E', scale: 0.05, shade: 1, surface: 'fabric' });
    return;
  }
  const cover = tier >= 3 ? LUX.orange : tier === 2 ? theme.deep : '#7A5A48';
  const surface = tier >= 3 ? 'velvet' : 'leather';
  b.box(cx, Y + 0.12, cz, w - 0.04, 0.24, d - 0.02, tier >= 3 ? PALETTE.walnutDark : PALETTE.walnut, 0, { shade: 0.75, surface: 'varnish' });
  b.rounded(cx + toRoom * 0.04, Y + 0.32, cz, w - 0.12, 0.16, d - 0.04, 0.05, cover, { shade: 0.88, surface });
  b.rounded(backX, Y + 0.66, cz, 0.16, 0.56, d - 0.02, 0.06, cover, { shade: 0.85, surface });
  if (tier >= 2) {
    // Buttons on the back, cushions leaning against it.
    const cols = Math.max(3, Math.round(d / 0.22));
    for (let i = 0; i < 2; i++) for (let j = 0; j < cols; j++) {
      const z = r.z0 + 0.12 + (d - 0.24) * ((j + (i % 2) * 0.5) / cols);
      if (z > r.z1 - 0.1) continue;
      b.sphere(backX + toRoom * 0.082, Y + 0.56 + i * 0.18, z, 0.012, tier >= 3 ? shadeHex(cover, -24) : PALETTE.brass, 0, 1, { ...FLAT, surface: tier >= 3 ? 'velvet' : 'brass' });
    }
    const colours = tier >= 3 ? [LUX.cream, '#2E5A6E'] : [PALETTE.pillow, shadeHex(theme.deep, 20)];
    for (let i = 0; i < 2; i++) {
      const z = r.z0 + d * (0.3 + i * 0.4);
      b.rounded(backX + toRoom * 0.16, Y + 0.56, z, 0.08, 0.24, 0.3, 0.04, colours[i], tier >= 3 && i === 0 ? { shade: 0.95, pattern: PATTERN.diamond, color2: LUX.orange, scale: 0.06, surface: 'fabric' } : { shade: 0.95, surface: 'fabric' });
    }
  }
}

/** The film screen on the lake side: a bedsheet on a frame, a white screen in a black frame on a stage, in gold. */
function buildScreen(b: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0;
  const s = screenArea(prop, tier);
  const face = s.x - 0.004;
  if (tier <= 0) {
    // Two posts and a pole, a sheet hung from it.
    for (const z of [r.z0 + 0.08, r.z1 - 0.08]) {
      b.box(face - 0.05, Y + 0.85, z, 0.07, 1.7, 0.07, '#86705D', 0, { shade: 0.85 });
      b.box(face - 0.05, Y + 0.02, z, 0.24, 0.04, 0.16, '#86705D', 0, { shade: 0.85 });
    }
    b.box(face - 0.05, Y + 1.66, cz, 0.05, 0.05, d - 0.1, '#86705D', 0, { shade: 0.9 });
    b.box(face - 0.006, (s.y0 + s.y1) / 2, cz, 0.012, s.y1 - s.y0 + 0.08, s.z1 - s.z0 + 0.1, '#A8A397', 0, { shade: 0.96, surface: 'fabric' });
    return;
  }
  // A low stage under it, and the frame.
  const stage = tier >= 3 ? LUX.mahogany : tier === 2 ? '#2C2630' : '#3A3940';
  b.slab(rect(r.x0, r.z0, r.x1 - (tier >= 2 ? 0.02 : 0), r.z1), Y, Y + 0.16, stage, 0, 0, { shade: 0.8, surface: 'varnish' });
  if (tier >= 2) b.box(r.x1 - 0.01, Y + 0.075, cz, 0.02, 0.11, d - 0.02, tier >= 3 ? PALETTE.gold : '#4A4250', 0, { ...FLAT, surface: tier >= 3 ? 'paint' : 'varnish' });
  const frame = tier >= 3 ? PALETTE.gold : '#17151B';
  b.box(face - 0.035, (s.y0 + s.y1) / 2, cz, 0.06, s.y1 - s.y0 + 0.14, s.z1 - s.z0 + 0.14, frame, 0, { shade: 0.95, surface: tier >= 3 ? 'paint' : 'matte' });
  // A silver screen: mid grey, so the projected picture (an additive layer in front of it) reads in colour.
  b.box(face - 0.002, (s.y0 + s.y1) / 2, cz, 0.004, s.y1 - s.y0, s.z1 - s.z0, '#9A9893', 0, { ...FLAT, surface: 'matte' });
  if (tier >= 3) {
    // Red velvet curtains drawn back at each end, a pelmet over the top.
    for (const side of [-1, 1]) {
      const z = side < 0 ? r.z0 + 0.22 : r.z1 - 0.22;
      b.rounded(face - 0.05, Y + 0.98, z, 0.1, 1.62, 0.38, 0.04, LUX.velvetRed, { shade: 0.85, surface: 'velvet' });
      b.cylinder(face - 0.004, Y + 0.95, z, 0.022, 0.022, 0.4, PALETTE.gold, 8, 'z', { surface: 'brass' });
    }
    b.box(face - 0.06, Y + 1.8, cz, 0.12, 0.16, d - 0.04, LUX.velvetRed, 0, { shade: 0.9, surface: 'velvet' });
    b.box(face + 0.004, Y + 1.73, cz, 0.012, 0.02, d - 0.06, PALETTE.gold, 0, { ...FLAT, surface: 'brass' });
  } else if (tier === 2) {
    for (const side of [-1, 1]) {
      const z = side < 0 ? r.z0 + 0.14 : r.z1 - 0.14;
      b.box(face - 0.04, Y + 0.98, z, 0.08, 1.64, 0.22, theme.deep, 0, { shade: 0.85, surface: 'velvet' });
    }
  }
}

/** Where a film shows on the screen (the image rectangle on its face), shared with CarriageView's glow. */
export function screenArea(prop: PropDef, tier: number): { x: number; y0: number; y1: number; z0: number; z1: number } {
  const r = prop.rect;
  const inset = tier >= 3 ? 0.5 : tier === 2 ? 0.34 : 0.18;
  return { x: r.x1 - 0.1, y0: Y + 0.44, y1: Y + 1.58, z0: r.z0 + inset, z1: r.z1 - inset };
}

/** Where the projector's lens is, for the beam (carriage coordinates). */
export function projectorLens(prop: PropDef, tier: number): { x: number; y: number; z: number } {
  const r = prop.rect;
  return { x: r.x0 + 0.05, y: (tier <= 0 ? Y + 0.8 : Y + 0.9) + 0.14, z: (r.z0 + r.z1) / 2 };
}

/** A seat facing the screen (−x): folding wooden chairs, padded theatre seats, a plush sofa seat, red velvet recliners. */
function buildCinemaSeat(b: GeoBuilder, prop: PropDef, tier: number, seed: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const backX = r.x1 - 0.08;
  if (tier <= 0) {
    // A folding chair: a slatted seat and back on crossed legs.
    const wood = seed % 2 ? '#9C8570' : '#8A7864';
    for (const fz of [r.z0 + 0.12, r.z1 - 0.12]) {
      b.add(new THREE.BoxGeometry(0.03, 0.5, 0.03), wood, cx, Y + 0.22, fz, 0, 0, 0.45, { shade: 0.85 });
      b.add(new THREE.BoxGeometry(0.03, 0.5, 0.03), wood, cx, Y + 0.22, fz, 0, 0, -0.45, { shade: 0.85 });
    }
    b.box(cx - 0.04, Y + 0.45, cz, w * 0.6, 0.04, d - 0.2, wood, 0, { shade: 0.95, surface: 'wood' });
    b.box(backX - 0.06, Y + 0.76, cz, 0.04, 0.34, d - 0.2, wood, 0, { shade: 0.9, surface: 'wood' });
    for (const fz of [r.z0 + 0.12, r.z1 - 0.12]) b.box(backX - 0.06, Y + 0.6, fz, 0.03, 0.3, 0.03, wood, 0, { shade: 0.85 });
    return;
  }
  if (tier === 1) {
    // A padded theatre seat: black sides that are the arms, a fabric seat and back.
    const cover = '#4E6077';
    for (const az of [r.z0 + 0.03, r.z1 - 0.03]) b.box(cx, Y + 0.34, az, w - 0.08, 0.68, 0.05, '#2B2A2E', 0, { shade: 0.85, surface: 'paint' });
    b.rounded(cx - 0.04, Y + 0.42, cz, w - 0.24, 0.1, d - 0.1, 0.04, cover, { shade: 0.95, surface: 'fabric' });
    b.rounded(backX - 0.03, Y + 0.72, cz, 0.12, 0.6, d - 0.1, 0.05, cover, { shade: 0.9, surface: 'fabric' });
    return;
  }
  if (tier === 2) {
    // A plush sofa seat (a pair makes a love seat) with a bright cushion: the owner's home cinema.
    b.box(cx, Y + 0.1, cz, w - 0.06, 0.2, d - 0.02, '#4E3E34', 0, { shade: 0.75 });
    b.rounded(cx - 0.02, Y + 0.31, cz, w - 0.08, 0.22, d - 0.02, 0.07, LUX.beige, { shade: 0.85, surface: 'velvet' });
    b.rounded(backX - 0.02, Y + 0.66, cz, 0.18, 0.5, d - 0.02, 0.07, LUX.beige, { shade: 0.85, surface: 'velvet' });
    const cushion = CUSHIONS[Math.abs(seed) % CUSHIONS.length];
    b.rounded(backX - 0.16, Y + 0.58, cz, 0.08, 0.24, d * 0.55, 0.04, cushion, seed % 3 === 0 ? { shade: 0.95, pattern: PATTERN.diamond, color2: '#F2E2C2', scale: 0.06, surface: 'fabric' } : { shade: 0.95, surface: 'fabric' });
    return;
  }
  // A red velvet recliner: rolled arms with gold edging, a tufted back, a footrest folded under.
  for (const az of [r.z0 + 0.05, r.z1 - 0.05]) {
    b.rounded(cx, Y + 0.3, az, w - 0.06, 0.5, 0.1, 0.04, LUX.velvetRedDeep, { shade: 0.82, surface: 'velvet' });
    b.box(cx, Y + 0.56, az, w - 0.14, 0.015, 0.1, PALETTE.gold, 0, { ...FLAT, surface: 'paint' });
  }
  b.rounded(cx - 0.03, Y + 0.34, cz, w - 0.1, 0.24, d - 0.2, 0.08, LUX.velvetRed, { shade: 0.88, surface: 'velvet' });
  b.rounded(backX - 0.02, Y + 0.7, cz, 0.16, 0.62, d - 0.16, 0.07, LUX.velvetRed, { shade: 0.85, surface: 'velvet' });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) b.sphere(backX - 0.105, Y + 0.6 + i * 0.2, cz - 0.1 + j * 0.2, 0.012, LUX.velvetRedDeep, 0, 1, FLAT);
  b.rounded(r.x0 + 0.08, Y + 0.18, cz, 0.12, 0.2, d - 0.22, 0.04, LUX.velvetRed, { shade: 0.85, surface: 'velvet' });
}

/** The projector at the back: hand-cranked on a crate, on a trolley, on a cabinet with film cans, brass on mahogany. */
function buildProjector(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  if (tier <= 0) {
    b.box(cx, Y + 0.25, cz, w - 0.1, 0.5, d - 0.1, '#9A7F61', 0, CRATE);
    b.box(cx, Y + 0.65, cz, w - 0.3, 0.3, d - 0.4, '#9A7F61', 0, CRATE);
  } else if (tier === 1) {
    for (const fx of [r.x0 + 0.08, r.x1 - 0.08]) for (const fz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(fx, Y + 0.45, fz, 0.03, 0.9, 0.03, '#3A3940', 0, FLAT);
    for (const sy of [0.3, 0.885]) b.box(cx, Y + sy, cz, w - 0.08, 0.03, d - 0.08, '#3A3940', 0, { ...FLAT, surface: 'paint' });
    for (let i = 0; i < 3; i++) b.cylinder(cx, Y + 0.335 + i * 0.04, cz, 0.14, 0.14, 0.035, '#8F969C', 14, 'y', { surface: 'paint' });
  } else {
    const wood = tier >= 3 ? LUX.mahogany : PALETTE.walnutDark;
    b.box(cx, Y + 0.44, cz, w - 0.06, 0.88, d - 0.06, wood, 0, { shade: 0.78, surface: 'varnish' });
    b.box(r.x0 + 0.032, Y + 0.44, cz, 0.012, 0.6, d - 0.3, shadeHex(wood, 10), 0, { shade: 0.9, surface: 'varnish' });
    b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + 0.88, Y + 0.9, tier >= 3 ? PALETTE.gold : PALETTE.walnut, 0, 0, { ...FLAT, surface: tier >= 3 ? 'paint' : 'varnish' });
    for (let i = 0; i < 2; i++) b.cylinder(r.x1 - 0.17, Y + 0.92 + i * 0.04, r.z1 - 0.19, 0.13, 0.13, 0.035, '#8F969C', 14, 'y', { surface: 'paint' });
  }
  // The projector: a body, two reels on arms, the lens toward the screen (−x).
  const body = tier >= 3 ? '#B8892F' : tier === 2 ? '#3E4550' : '#2E2D33';
  const top = tier <= 0 ? Y + 0.8 : Y + 0.9;
  const px = r.x0 + 0.34;
  b.box(px, top + 0.14, cz, 0.4, 0.28, 0.26, body, 0, { shade: 0.85, surface: 'paint' });
  b.cylinder(r.x0 + 0.1, top + 0.14, cz, 0.06, 0.07, 0.1, '#1E1D22', 12, 'x', { surface: 'paint' });
  for (const [dx, rad] of [[-0.09, 0.16], [0.13, 0.14]] as [number, number][]) {
    b.box(px + dx, top + 0.33, cz, 0.03, 0.1, 0.02, body, 0, FLAT);
    b.cylinder(px + dx, top + 0.36 + rad, cz, rad, rad, 0.04, tier >= 3 ? '#D9B060' : '#8F969C', 18, 'z', { shade: 0.95, surface: 'paint' });
  }
  lamps.cylinder(r.x0 + 0.045, top + 0.14, cz, 0.04, 0.04, 0.01, '#FFF6D8', 12, 'x', FLAT);
}

/** The home cinema's corner sofa (Cosy: beige with bright cushions) or (Luxury) red velvet, in the back corner. */
function buildCornerSofa(b: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cover = tier >= 3 ? LUX.velvetRed : LUX.beige;
  const deep = tier >= 3 ? LUX.velvetRedDeep : '#4E3E34';
  const seatD = 0.66;
  // Along the lake wall, then the return along the back.
  const along = rect(r.x0, r.z0, r.x0 + seatD, r.z1);
  const ret = rect(r.x0 + seatD, r.z1 - seatD, r.x1, r.z1);
  for (const part of [along, ret]) {
    const cx = (part.x0 + part.x1) / 2;
    const cz = (part.z0 + part.z1) / 2;
    b.box(cx, Y + 0.09, cz, part.x1 - part.x0 - 0.02, 0.18, part.z1 - part.z0 - 0.02, deep, 0, { shade: 0.75 });
    b.rounded(cx, Y + 0.28, cz, part.x1 - part.x0 - 0.04, 0.2, part.z1 - part.z0 - 0.04, 0.06, cover, { shade: 0.86, surface: 'velvet' });
  }
  b.rounded(r.x0 + 0.09, Y + 0.6, (r.z0 + r.z1 - 0.18) / 2, 0.16, 0.46, r.z1 - r.z0 - 0.2, 0.06, cover, { shade: 0.85, surface: 'velvet' });
  b.rounded((r.x0 + r.x1) / 2, Y + 0.6, r.z1 - 0.09, r.x1 - r.x0 - 0.02, 0.46, 0.16, 0.06, cover, { shade: 0.85, surface: 'velvet' });
  // Low arms at the open ends (the camera sees over them), cushions along the back.
  b.rounded(r.x0 + seatD / 2, Y + 0.44, r.z0 + 0.07, seatD - 0.06, 0.12, 0.12, 0.04, cover, { shade: 0.85, surface: 'velvet' });
  b.rounded(r.x1 - 0.07, Y + 0.44, r.z1 - seatD / 2, 0.12, 0.12, seatD - 0.06, 0.04, cover, { shade: 0.85, surface: 'velvet' });
  for (let i = 0; i < 2; i++) {
    const z = r.z0 + 0.3 + i * 0.34;
    const colour = tier >= 3 ? (i % 2 ? PALETTE.gold : LUX.cream) : CUSHIONS[i % CUSHIONS.length];
    b.rounded(r.x0 + 0.23, Y + 0.54, z, 0.08, 0.24, 0.26, 0.04, colour, i === 1 ? { shade: 0.95, pattern: PATTERN.diamond, color2: '#F2E2C2', scale: 0.06, surface: 'fabric' } : { shade: 0.95, surface: 'fabric' });
  }
  b.rounded((r.x0 + seatD + r.x1) / 2, Y + 0.54, r.z1 - 0.23, 0.26, 0.24, 0.08, 0.04, tier >= 3 ? LUX.cream : CUSHIONS[3], { shade: 0.95, surface: 'fabric' });
}

/** A potted plant: a sad sprig in a bucket, a fern in terracotta, a leafy plant in a glazed pot, a palm in a brass urn. */
function buildPlanter(b: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 - 0.01;
  const low = prop.variant === 'low';
  if (tier <= 0) {
    b.cylinder(cx, Y + 0.13, cz, half * 0.8, half * 0.65, 0.26, '#9AA2AA', 12, 'y', { shade: 0.8, surface: 'paint' });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      b.add(new THREE.CylinderGeometry(0.006, 0.008, 0.3, 4), '#6E6A4A', cx + Math.cos(a) * 0.03, Y + 0.38, cz + Math.sin(a) * 0.03, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4, FLAT);
      b.sphere(cx + Math.cos(a) * 0.1, Y + 0.5, cz + Math.sin(a) * 0.1, 0.035, '#8A8A5A', 0, 0.5, { shade: 0.9, surface: 'foliage' });
    }
    return;
  }
  // Leaves reach 1.45× their radius from the stem: kept to 0.66 of the footprint's half so nothing reaches a wall.
  const leaf = half * 0.66;
  if (tier === 1) {
    const potH = low ? 0.24 : 0.32;
    b.cylinder(cx, Y + potH / 2, cz, half * 0.78, half * 0.6, potH, PALETTE.coral, 12, 'y', { shade: 0.8, surface: 'ceramic' });
    foliage(b, cx, Y + potH + 0.1, cz, leaf, 7, PALETTE.treeGreen);
    if (!low) foliage(b, cx, Y + potH + 0.26, cz, leaf * 0.7, 5, PALETTE.cypress);
    return;
  }
  if (tier === 2 || low) {
    const potH = low ? 0.28 : 0.4;
    const pot = tier >= 3 ? PALETTE.gold : theme.deep;
    b.cylinder(cx, Y + potH / 2, cz, half * 0.8, half * 0.62, potH, pot, 14, 'y', { shade: 0.82, surface: tier >= 3 ? 'paint' : 'ceramic' });
    if (low && tier >= 3) {
      // A bowl of flowers on the near side (kept low so it never hides the floor).
      foliage(b, cx, Y + potH + 0.06, cz, leaf, 6, PALETTE.treeGreen);
      for (let i = 0; i < 5; i++) b.sphere(cx + Math.cos(i * 1.26) * half * 0.4, Y + potH + 0.12, cz + Math.sin(i * 1.26) * half * 0.4, 0.035, i % 2 ? '#E8A0B4' : '#F5E3A0', 0, 0.9, FLAT);
      return;
    }
    foliage(b, cx, Y + potH + 0.12, cz, leaf, 8, PALETTE.treeGreen);
    foliage(b, cx, Y + potH + 0.3, cz, leaf * 0.85, 6, PALETTE.cypress);
    if (!low) foliage(b, cx, Y + potH + 0.46, cz, leaf * 0.6, 5, PALETTE.treeGreen);
    return;
  }
  // A palm in a brass urn: a footed urn, a trunk, fronds arching out.
  b.cylinder(cx, Y + 0.05, cz, half * 0.55, half * 0.6, 0.1, PALETTE.gold, 14, 'y', { surface: 'paint' });
  b.cylinder(cx, Y + 0.3, cz, half * 0.82, half * 0.5, 0.4, PALETTE.gold, 14, 'y', { shade: 0.85, surface: 'paint' });
  b.cylinder(cx, Y + 0.515, cz, half * 0.86, half * 0.86, 0.03, PALETTE.goldDark, 14, 'y', { surface: 'paint' });
  b.cylinder(cx, Y + 0.82, cz, 0.03, 0.04, 0.6, '#7A6248', 6, 'y', { shade: 0.85 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const len = half * 0.95;
    b.add(new THREE.BoxGeometry(len, 0.012, 0.09), i % 2 ? PALETTE.treeGreen : PALETTE.cypress, cx + Math.cos(a) * len * 0.42, Y + 1.12, cz + Math.sin(a) * len * 0.42, 0, -a, -0.45, { shade: 0.9, surface: 'foliage' });
  }
}

/** A sideboard against the wall: what is on it says what it is for (the café's cups, the dining car's plates…). */
function buildSideboard(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, _theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const out = prop.facing === 'right' ? 1 : -1;
  const front = out > 0 ? r.x1 : r.x0;
  const h = 0.8;
  const body = tier >= 3 ? PALETTE.walnutDark : tier === 2 ? PALETTE.walnut : '#A68A6A';
  b.box(cx, Y + 0.04, cz, w - 0.06, 0.08, d - 0.06, shadeHex(body, -18), 0, { shade: 0.7 });
  b.box(cx, Y + h / 2 + 0.02, cz, w - 0.02, h - 0.04, d - 0.02, body, 0, { shade: 0.78, surface: tier >= 2 ? 'varnish' : 'wood' });
  const doors = Math.max(2, Math.round(d / 0.55));
  for (let i = 0; i < doors; i++) {
    const pz = r.z0 + (d / doors) * (i + 0.5);
    b.box(front + out * 0.01, Y + 0.42, pz, 0.016, 0.56, d / doors - 0.08, shadeHex(body, 10), 0, { shade: 0.9, surface: tier >= 2 ? 'varnish' : 'wood' });
    b.box(front + out * 0.022, Y + 0.6, pz + (i % 2 ? -1 : 1) * (d / doors / 2 - 0.1), 0.012, 0.06, 0.016, tier >= 2 ? PALETTE.brass : PALETTE.walnutDark, 0, { ...FLAT, surface: tier >= 2 ? 'brass' : 'wood' });
  }
  const topY = Y + h;
  b.slab(rect(r.x0, r.z0, r.x1, r.z1), topY, topY + 0.03, tier >= 3 ? '#EFE9E0' : shadeHex(body, 8), 0, 0, { ...FLAT, surface: tier >= 3 ? 'marble' : 'varnish' });
  const t = topY + 0.03;
  const at = (f: number): number => r.z0 + d * f;
  switch (prop.variant) {
    case 'cafe': {
      // Cups and saucers stacked, jars of sugar and biscuits, a milk jug and a napkin holder.
      for (let i = 0; i < 3; i++) b.cylinder(cx, t + 0.025 + i * 0.05, at(0.15), 0.045, 0.035, 0.05, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      for (const [f, c] of [[0.32, '#F4EFE6'], [0.45, '#C99B6D']] as [number, string][]) {
        b.cylinder(cx, t + 0.08, at(f), 0.05, 0.05, 0.16, '#DDEBEF', 10, 'y', { shade: 1, surface: 'glass' });
        b.cylinder(cx, t + 0.06, at(f), 0.042, 0.042, 0.11, c, 10, 'y', FLAT);
      }
      b.cylinder(cx, t + 0.06, at(0.6), 0.045, 0.035, 0.12, tier >= 3 ? PALETTE.gold : PALETTE.porcelain, 10, 'y', { surface: tier >= 3 ? 'paint' : 'ceramic' });
      b.box(cx, t + 0.05, at(0.74), 0.12, 0.1, 0.08, tier >= 2 ? PALETTE.brass : '#C9C2B5', 0, { shade: 0.9 });
      if (tier >= 2) foliage(b, cx, t + 0.16, at(0.9), 0.1, 5, PALETTE.treeGreen);
      break;
    }
    case 'dining': {
      // Stacked plates, a tray of cutlery, a bottle of wine and glasses; a lamp from the Cosy refit.
      for (let i = 0; i < 4; i++) b.cylinder(cx, t + 0.008 + i * 0.016, at(0.18), 0.11, 0.11, 0.014, '#FBF8F2', 16, 'y', { surface: 'ceramic' });
      b.box(cx, t + 0.02, at(0.38), 0.22, 0.04, 0.3, PALETTE.walnut, 0, FLAT);
      b.cylinder(cx, t + 0.15, at(0.56), 0.035, 0.04, 0.3, '#3F2228', 10, 'y', { shade: 1, surface: 'glass' });
      for (const f of [0.64, 0.7]) b.cylinder(cx + 0.05, t + 0.06, at(f), 0.024, 0.018, 0.12, '#E8EEF2', 8, 'y', { surface: 'glass' });
      if (tier >= 2) {
        b.cylinder(cx, t + 0.02, at(0.86), 0.06, 0.07, 0.04, PALETTE.brass, 12, 'y', { surface: 'brass' });
        b.cylinder(cx, t + 0.17, at(0.86), 0.012, 0.012, 0.26, PALETTE.brass, 6, 'y', { surface: 'brass' });
        lamps.cylinder(cx, t + 0.37, at(0.86), 0.06, 0.1, 0.12, '#F6D9B5', 12, 'y', { shade: 0.9 });
      }
      break;
    }
    case 'bar': {
      // The bar's service sideboard: an ice bucket with a bottle, a tray of glasses, a decanter.
      b.cylinder(cx, t + 0.09, at(0.2), 0.08, 0.06, 0.18, tier >= 2 ? PALETTE.gold : PALETTE.chrome, 12, 'y', { surface: 'paint' });
      b.cylinder(cx, t + 0.22, at(0.2), 0.028, 0.03, 0.16, '#2F4E3A', 8, 'y', { shade: 1, surface: 'glass' });
      b.box(cx, t + 0.01, at(0.48), 0.26, 0.02, 0.36, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, { ...FLAT, surface: 'paint' });
      for (let i = 0; i < 4; i++) b.cylinder(cx + (i % 2 ? 0.06 : -0.06), t + 0.065, at(0.42) + Math.floor(i / 2) * 0.12, 0.028, 0.02, 0.09, '#E8EEF2', 8, 'y', { surface: 'glass' });
      b.cylinder(cx, t + 0.1, at(0.75), 0.06, 0.05, 0.2, '#C98A4A', 12, 'y', { shade: 1, surface: 'glass' });
      b.sphere(cx, t + 0.23, at(0.75), 0.03, '#E8EEF2', 1, 1, { surface: 'glass' });
      if (tier >= 3) foliage(b, cx, t + 0.16, at(0.92), 0.1, 5, PALETTE.treeGreen);
      break;
    }
    case 'dome': {
      // Guidebooks, a pair of binoculars, a globe on a stand.
      const books = ['#8E3A3A', '#2F4E6E', '#3E6B4A', '#C9902E'];
      books.forEach((c, i) => b.box(cx, t + 0.12, at(0.12) + i * 0.05, 0.18, 0.24, 0.04, c, 0, { shade: 0.95 }));
      for (const dz of [-0.03, 0.03]) b.cylinder(cx, t + 0.022, at(0.5) + dz, 0.022, 0.022, 0.08, '#3F4E66', 8, 'x', FLAT);
      b.cylinder(cx, t + 0.02, at(0.78), 0.05, 0.06, 0.04, tier >= 2 ? PALETTE.brass : PALETTE.walnutDark, 10, 'y', FLAT);
      b.cylinder(cx, t + 0.07, at(0.78), 0.01, 0.01, 0.06, tier >= 2 ? PALETTE.brass : PALETTE.walnutDark, 6, 'y', FLAT);
      b.sphere(cx, t + 0.19, at(0.78), 0.09, '#6FA8C9', 1, 1, { shade: 0.95 });
      break;
    }
    default:
      break;
  }
}

/** On the front wall: the café's menu, the bar's mirror, the dome's route map, the cinema's posters. */
function buildWallBoard(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const w = r.x1 - r.x0;
  const z0 = r.z0;
  const y0 = Y + 0.46;
  const y1 = Y + 1.0;
  const yc = (y0 + y1) / 2;
  const hgt = y1 - y0;
  const frameColour = tier >= 3 ? PALETTE.gold : tier === 2 ? PALETTE.walnut : tier === 1 ? PALETTE.walnutDark : '#8A7864';
  const frame = (x: number, fw: number, fh: number, fy: number): void => {
    b.box(x, fy, z0 + 0.012, fw, fh, 0.024, frameColour, 0, { ...FLAT, surface: tier >= 3 ? 'paint' : 'varnish' });
  };
  switch (prop.variant) {
    case 'cafe': {
      frame(cx, w, hgt, yc);
      const board = tier >= 3 ? '#F2E9D6' : tier === 2 ? '#26252B' : '#2E3A33';
      b.box(cx, yc, z0 + 0.026, w - 0.06, hgt - 0.06, 0.004, board, 0, FLAT);
      const ink = tier >= 3 ? PALETTE.goldDark : '#EDEAE2';
      const rows = 5;
      const lens = tier <= 0 ? [0.8, 0.5, 0.65, 0.4, 0.7] : [0.5, 0.8, 0.7, 0.8, 0.6];
      for (let i = 0; i < rows; i++) {
        const len = (w - 0.2) * lens[i];
        const y = y1 - 0.1 - (i * (hgt - 0.16)) / rows;
        b.box(cx - (w - 0.2 - len) / 2 - 0.02, y, z0 + 0.034, len - 0.06, i === 0 ? 0.03 : 0.016, 0.004, ink, 0, FLAT);
        if (i > 0) b.box(cx + (w - 0.2) / 2 - 0.02, y, z0 + 0.034, 0.05, 0.016, 0.004, ink, 0, FLAT);
      }
      break;
    }
    case 'bar': {
      // A tin sign when run down, then a mirror, then a mirror over a shelf of bottles.
      if (tier <= 0) {
        b.box(cx, yc, z0 + 0.006, w * 0.6, hgt * 0.6, 0.012, '#B23A3A', 0, { shade: 0.95, surface: 'paint' });
        b.box(cx, yc, z0 + 0.014, w * 0.45, 0.04, 0.004, '#EDE2C8', 0, FLAT);
        break;
      }
      frame(cx, w, hgt, yc + 0.02);
      b.box(cx, yc + 0.02, z0 + 0.026, w - 0.08, hgt - 0.08, 0.004, '#C9DCE3', 0, { ...FLAT, surface: 'glass' });
      if (tier >= 2) {
        b.box(cx, y0 - 0.06, z0 + 0.05, w - 0.1, 0.025, 0.1, frameColour, 0, { ...FLAT, surface: 'varnish' });
        const colours = ['#C0485C', '#E5B452', '#6FA8DC', '#4F9591'];
        for (let i = 0; i < 4; i++) b.cylinder(cx - (w - 0.3) / 2 + (w - 0.3) * (i / 3), y0 + 0.0, z0 + 0.05, 0.026, 0.026, 0.1, colours[i], 8, 'y', { shade: 1, surface: 'glass' });
      }
      break;
    }
    case 'dome': {
      // The route map: the lake, a red line along the shore, the stations as dots (a star chart at Luxury).
      frame(cx, w, hgt, yc);
      const paper = tier >= 3 ? '#1E2A44' : '#F0E6CF';
      b.box(cx, yc, z0 + 0.026, w - 0.06, hgt - 0.06, 0.004, paper, 0, FLAT);
      if (tier >= 3) {
        for (let i = 0; i < 9; i++) b.box(cx - w / 2 + 0.1 + (((i * 37) % 90) / 100) * (w - 0.2), y0 + 0.08 + (((i * 53) % 80) / 100) * (hgt - 0.16), z0 + 0.03, 0.02, 0.02, 0.004, '#F5E3A0', 0, FLAT);
      } else {
        b.box(cx - w * 0.15, yc + 0.06, z0 + 0.03, w * 0.4, hgt * 0.4, 0.004, '#9FC4D6', 0, FLAT);
        b.box(cx, yc - 0.12, z0 + 0.03, w - 0.2, 0.014, 0.004, '#C0485C', 0, FLAT);
        for (let i = 0; i < 4; i++) b.cylinder(cx - (w - 0.24) / 2 + (w - 0.24) * (i / 3), yc - 0.12, z0 + 0.034, 0.018, 0.018, 0.004, '#2F2A36', 8, 'z', FLAT);
      }
      break;
    }
    case 'cinema': {
      // Two film posters: pinned when run down, framed, gold-framed, and (Luxury) ringed with marquee bulbs.
      const posters = ['#B03A3E', '#2F4E6E', '#D9783A', '#3E6B4A'];
      const pw = (w - 0.12) / 2;
      const z = z0 + (tier >= 1 ? 0.026 : 0.004);
      for (let i = 0; i < 2; i++) {
        const px = r.x0 + 0.06 + pw * (i + 0.5);
        if (tier >= 1) frame(px, pw - 0.04, hgt, yc);
        const colour = posters[(i + Math.abs(Math.round(r.x0 * 3))) % 4];
        b.box(px, yc, z, pw - 0.12, hgt - 0.1, 0.004, colour, 0, FLAT);
        b.box(px, yc + hgt * 0.22, z + 0.006, pw - 0.22, 0.05, 0.003, '#F2E9D6', 0, FLAT);
        b.cylinder(px, yc - 0.04, z + 0.006, 0.06, 0.06, 0.003, '#F2E9D6', 12, 'z', FLAT);
        if (tier >= 3) {
          for (let j = 0; j < 5; j++) {
            lamps.sphere(px - (pw - 0.12) / 2 + (pw - 0.12) * (j / 4), y1 + 0.035, z0 + 0.03, 0.016, '#FFE2B0', 0, 1, FLAT);
            lamps.sphere(px - (pw - 0.12) / 2 + (pw - 0.12) * (j / 4), y0 - 0.035, z0 + 0.03, 0.016, '#FFE2B0', 0, 1, FLAT);
          }
        }
      }
      break;
    }
    default:
      frame(cx, w, hgt, yc);
  }
}

/** A trolley: the café's cake trolley (glass domes at Luxury), the bar's drinks trolley. */
function buildTrolley(b: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0;
  const metal = tier >= 2 ? PALETTE.brass : PALETTE.chrome;
  const surface = tier >= 2 ? 'brass' : 'steel';
  for (const fx of [r.x0 + 0.05, r.x1 - 0.05]) for (const fz of [r.z0 + 0.06, r.z1 - 0.06]) {
    b.cylinder(fx, Y + 0.45, fz, 0.014, 0.014, 0.8, metal, 6, 'y', { surface });
    b.cylinder(fx, Y + 0.035, fz, 0.035, 0.035, 0.036, '#2B2A2E', 10, 'x', FLAT);
  }
  for (const sy of [0.32, 0.8]) b.slab(rect(r.x0 + 0.03, r.z0 + 0.03, r.x1 - 0.03, r.z1 - 0.03), Y + sy, Y + sy + 0.025, tier >= 3 ? '#EFE9E0' : PALETTE.walnut, 0, 0, { ...FLAT, surface: tier >= 3 ? 'marble' : 'varnish' });
  b.cylinder(r.x1 - 0.05, Y + 0.88, cz, 0.012, 0.012, d - 0.12, metal, 6, 'z', { surface });
  const t = Y + 0.825;
  if (prop.variant === 'bar') {
    const colours = ['#C98A4A', '#2F4E3A', '#8E3A3A', '#E5B452'];
    for (let i = 0; i < 4; i++) b.cylinder(cx + (i % 2 ? 0.07 : -0.07), t + 0.11, r.z0 + 0.22 + (d - 0.44) * Math.floor(i / 2), 0.032, 0.035, 0.22, colours[i], 10, 'y', { shade: 1, surface: 'glass' });
    for (let i = 0; i < 3; i++) b.cylinder(cx, Y + 0.39, r.z0 + 0.2 + (d - 0.4) * (i / 2), 0.028, 0.02, 0.09, '#E8EEF2', 8, 'y', { surface: 'glass' });
    b.cylinder(cx, t + 0.08, cz, 0.04, 0.035, 0.16, PALETTE.chrome, 10, 'y', { surface: 'steel' });
    return;
  }
  // Cakes: a layer cake, a chocolate cake and a tart; under glass domes at Luxury. Macarons below.
  const cakes = [[0.22, '#F2D6C8', 0.12], [0.5, '#7A4A35', 0.09], [0.78, '#E9C46A', 0.06]] as const;
  for (const [f, c, h] of cakes) {
    const z = r.z0 + d * f;
    b.cylinder(cx, t + 0.006, z, 0.11, 0.11, 0.012, PALETTE.porcelain, 16, 'y', { surface: 'ceramic' });
    b.cylinder(cx, t + 0.012 + h / 2, z, 0.085, 0.085, h, c, 14, 'y', { shade: 0.95 });
    if (tier >= 3) b.add(new THREE.SphereGeometry(0.105, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#DDEBEF', cx, t + 0.013, z, 0, 0, 0, { shade: 1, surface: 'glass' });
  }
  for (let i = 0; i < 6; i++) b.sphere(cx + (i % 2 ? 0.05 : -0.05), Y + 0.37, r.z0 + 0.25 + (i * (d - 0.5)) / 5, 0.025, ['#E8A0B4', '#A8D5BA', '#F5E3A0'][i % 3], 0, 0.6, FLAT);
}

/** Where the bar's eight party bulbs sit along its front (z, in carriage coordinates). */
export function barBulbs(r: Rect, _out: number): number[] {
  const out: number[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) out.push(r.z0 + 0.4 + ((r.z1 - r.z0 - 0.8) * i) / (n - 1));
  return out;
}

/** The bulbs themselves, glowing, in order along the bar (so a draw range can light the first few). */
export function buildBarBulbs(lamps: GeoBuilder, prop: PropDef): void {
  const r = prop.rect;
  const out = prop.facing === 'right' ? 1 : -1;
  const front = out > 0 ? r.x1 : r.x0;
  for (const z of barBulbs(r, out)) lamps.sphere(front + out * 0.05, Y + 0.86, z, 0.03, '#FFD27A', 1, 1, FLAT);
}

/** A table after a meal: an empty plate with crumbs, a tipped glass, a crumpled napkin, cutlery askew. */
export function buildTableDirt(b: GeoBuilder, table: PropDef): void {
  const r = table.rect;
  const w = r.x1 - r.x0;
  const cz = (r.z0 + r.z1) / 2;
  const topY = Y + 0.735;
  const px = r.x0 + w * 0.55;
  const pz = cz - 0.2;
  b.cylinder(px, topY + 0.03, pz, 0.075, 0.075, 0.006, '#D9B07A', 14, 'y', FLAT);
  for (const [dx, dz] of [[0.03, 0.02], [-0.04, -0.01], [0.01, -0.04]]) b.sphere(px + dx, topY + 0.035, pz + dz, 0.012, '#B5793F', 0, 0.6, FLAT);
  b.add(new THREE.CylinderGeometry(0.02, 0.016, 0.1, 8), '#E8EEF2', px - 0.16, topY + 0.03, pz + 0.12, 0, 0.6, Math.PI / 2, { surface: 'glass' });
  b.add(new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.5, 0.8), PALETTE.linen, px + 0.12, topY + 0.03, pz + 0.16, 0, 0.4, 0, FLAT);
  b.box(px - 0.1, topY + 0.006, pz - 0.05, 0.14, 0.006, 0.018, PALETTE.chrome, 0.7, { ...FLAT, surface: 'steel' });
}

/** One plate under a cloche on the pass (the chef's, waiting for the waiter). */
export function buildPassPlate(b: GeoBuilder, x: number, z: number, tier: number): void {
  const topY = Y + 0.95;
  b.cylinder(x, topY + 0.008, z, 0.1, 0.1, 0.012, '#FBF8F2', 16, 'y', { surface: 'ceramic' });
  b.add(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), tier >= 2 ? PALETTE.brass : PALETTE.chrome, x, topY + 0.012, z, 0, 0, 0, { shade: 0.95, surface: tier >= 2 ? 'brass' : 'steel' });
  b.sphere(x, topY + 0.105, z, 0.014, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, 1, { shade: 1, surface: 'steel' });
}

/**
 * The observation dome's glass: ribs that rise from the lake-side wall and curve in over the seats, night glass
 * between them (iron ribs when run down, brass from the Cosy refit, and at Luxury gold stars painted on the glass).
 * Only on the lake side (the far side from the camera), so it never hides the room.
 */
export function buildDomeCanopy(b: GeoBuilder, wallX: number, wallTop: number, z0: number, z1: number, tier: number): void {
  const rib = tier >= 2 ? PALETTE.brass : tier <= 0 ? PALETTE.iron : '#E8E4DA';
  const ribSurface = tier >= 2 ? 'brass' : 'paint';
  const glass = tier >= 3 ? '#6E80A8' : '#7E93B8';
  const reach = 1.25;
  const rise = 1.0;
  const segments = 6;
  const inward = wallX < 0 ? 1 : -1;
  const point = (t: number): [number, number] => {
    const a = (t * Math.PI) / 2;
    return [wallX + inward * (1 - Math.cos(a)) * reach, wallTop + Math.sin(a) * rise];
  };
  for (let s = 0; s < segments; s++) {
    const [xa, ya] = point(s / segments);
    const [xb, yb] = point((s + 1) / segments);
    const len = Math.hypot(xb - xa, yb - ya);
    const angle = Math.atan2(yb - ya, xb - xa);
    b.add(new THREE.BoxGeometry(len, 0.012, z1 - z0 - 0.04), glass, (xa + xb) / 2, (ya + yb) / 2, (z0 + z1) / 2, 0, 0, angle, { shade: 1, surface: 'glass' });
    if (tier >= 3) {
      // Gold stars painted on the glass (little diamonds lying on it).
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      for (let i = 0; i < 9; i++) {
        const t = ((i * 37 + s * 11) % 100) / 100;
        const z = z0 + 0.3 + (z1 - z0 - 0.6) * (((i * 61 + s * 23) % 100) / 100);
        b.add(new THREE.BoxGeometry(0.035, 0.004, 0.035), '#F5E3A0', xa + (xb - xa) * t + nx * 0.009, ya + (yb - ya) * t + ny * 0.009, z, 0, Math.PI / 4, angle, FLAT);
      }
    }
  }
  const count = Math.max(2, Math.round((z1 - z0) / 2.2));
  for (let i = 0; i <= count; i++) {
    const z = z0 + 0.03 + ((z1 - z0 - 0.06) * i) / count;
    for (let s = 0; s < segments; s++) {
      const [xa, ya] = point(s / segments);
      const [xb, yb] = point((s + 1) / segments);
      const len = Math.hypot(xb - xa, yb - ya);
      const angle = Math.atan2(yb - ya, xb - xa);
      b.add(new THREE.BoxGeometry(len + 0.02, 0.035, 0.035), rib, (xa + xb) / 2, (ya + yb) / 2 + 0.02, z, 0, 0, angle, { shade: 1, surface: ribSurface });
    }
  }
  const [xe, ye] = point(1);
  b.box(xe, ye + 0.02, (z0 + z1) / 2, 0.08, 0.06, z1 - z0, rib, 0, { shade: 1, surface: ribSurface });
}
