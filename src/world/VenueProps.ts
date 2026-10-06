import * as THREE from 'three';
import { rect, type Rect } from '../core/types';
import type { GeoBuilder, PartStyle } from './geo';
import type { PropDef } from './layout';
import { PALETTE, shadeHex, type CarriageTheme } from './palette';

/**
 * The venue carriages' furniture (session 20): the café counter and its espresso machine, bistro tables, the
 * dining car's range, pass and window tables, the bar and its stools, the dome's seats, and what menu and
 * station tiles add. Like the rest of the train it is dressed by the refit tier: worn and plain (0), repaired
 * (1), cosy in the carriage's own colours with brass (2), luxurious with gold and marble (3). Every piece stays
 * inside its own footprint, so the clipping audit can check it against its neighbours.
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
    case 'counter': {
      // The café counter: a panelled front toward the room, a top that overhangs it a little, a kick plate.
      const h = 0.92;
      b.box(cx, Y + 0.04, cz, w - 0.06, 0.08, d - 0.04, k.woodDark, 0, { shade: 0.7 });
      b.box(cx, Y + h / 2, cz, w - 0.04, h - 0.04, d - 0.02, k.wood, 0, { shade: 0.75, surface: tier >= 2 ? 'varnish' : 'wood' });
      if (tier >= 1) {
        // Raised panels on the front.
        const panels = Math.max(2, Math.round(d / 0.9));
        for (let i = 0; i < panels; i++) {
          const pz = r.z0 + (d / panels) * (i + 0.5);
          b.box(front + out * 0.012, Y + 0.48, pz, 0.02, 0.5, d / panels - 0.16, tier >= 2 ? theme.wallLow : k.woodDark, 0, { shade: 0.9 });
        }
      }
      b.slab(rect(r.x0, r.z0, r.x1, r.z1), Y + h - 0.02, Y + h + 0.03, k.top, 0, 0, { ...FLAT, surface: k.topSurface });
      if (tier >= 2) b.box(front + out * 0.004, Y + h + 0.005, cz, 0.012, 0.03, d - 0.02, k.metal, 0, { ...FLAT, surface: k.metalSurface });
      // A bell and a little stack of cups by the serving spot.
      b.cylinder(front - out * 0.18, Y + h + 0.06, cz - 0.1, 0.04, 0.032, 0.07, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      b.cylinder(front - out * 0.18, Y + h + 0.13, cz - 0.1, 0.04, 0.032, 0.07, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      return true;
    }
    case 'espresso': {
      // An espresso machine on the counter: a chrome (later brass) body, the group heads, a cup underneath.
      const top = Y + 0.95;
      // Enamel bodies (a big polished metal block reads as black at night): grey, cream, the café green, ivory.
      const body = tier <= 0 ? '#A7ADB2' : tier === 1 ? '#E6E1D6' : tier === 2 ? theme.deep : '#F4EEDF';
      const metal = tier >= 2 ? 'brass' : 'steel';
      b.rounded(cx + out * 0.08, top + 0.21, cz, w * 0.62, 0.42, d - 0.06, 0.06, body, { shade: 0.85, surface: 'paint' });
      b.box(cx + out * 0.08, top + 0.44, cz, w * 0.5, 0.04, d - 0.16, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, { ...FLAT, surface: metal });
      if (tier >= 2) b.sphere(cx + out * 0.08, top + 0.5, cz, 0.06, PALETTE.gold, 1, 0.9, { shade: 1, surface: 'brass' });
      for (const dz of [-0.14, 0.14]) {
        b.cylinder(front - out * 0.06, top + 0.24, cz + dz, 0.035, 0.035, 0.07, '#2E2D33', 10, 'y', { surface: 'steel' });
        b.cylinder(front - out * 0.06, top + 0.04, cz + dz, 0.035, 0.028, 0.06, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      }
      // A little steam wand light.
      lamps.sphere(cx + out * 0.08, top + 0.3, cz + (d / 2 - 0.05), 0.018, '#FFB765', 0, 1, FLAT);
      return true;
    }
    case 'pastryCase': {
      // A tiered cake stand on the counter: a wooden base, brass posts and two round trays (the pastries go on
      // them when the menu tile is bought). Open, so the camera sees what is on it.
      const top = Y + 0.95;
      b.slab(r, top, top + 0.05, k.wood, 0, 0.02, { shade: 0.85 });
      const trays = Math.max(2, Math.floor(d / 0.36));
      for (let i = 0; i < trays; i++) {
        const pz = r.z0 + (d / trays) * (i + 0.5);
        b.cylinder(cx, top + 0.16, pz, 0.012, 0.012, 0.22, k.metal, 6, 'y', { surface: k.metalSurface });
        b.cylinder(cx, top + 0.08, pz, Math.min(w, d / trays) * 0.42, Math.min(w, d / trays) * 0.42, 0.012, PALETTE.porcelain, 16, 'y', { surface: 'ceramic' });
        b.cylinder(cx, top + 0.2, pz, Math.min(w, d / trays) * 0.3, Math.min(w, d / trays) * 0.3, 0.012, PALETTE.porcelain, 16, 'y', { surface: 'ceramic' });
        b.sphere(cx, top + 0.28, pz, 0.018, k.metal, 0, 1, { shade: 1, surface: k.metalSurface });
      }
      return true;
    }
    case 'pastries': {
      // Croissants on the lower trays and little cakes on the upper ones.
      const top = Y + 0.95;
      const trays = Math.max(2, Math.floor(d / 0.36)) ;
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
      // A grinder and jars of beans by the machine: the single-origin menu.
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
      // A round bistro table on a pedestal.
      const radius = Math.min(w, d) / 2 - 0.02;
      b.cylinder(cx, Y + 0.02, cz, 0.18, 0.2, 0.04, k.metal, 14, 'y', { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.37, cz, 0.03, 0.04, 0.68, k.metal, 8, 'y', { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.72, cz, radius, radius, 0.035, tier >= 3 ? '#F1ECE4' : k.top, 20, 'y', { ...FLAT, surface: k.topSurface });
      if (tier >= 2) b.cylinder(cx, Y + 0.705, cz, radius + 0.005, radius + 0.005, 0.012, k.metal, 20, 'y', { ...FLAT, surface: k.metalSurface });
      // A sugar bowl and, from Cosy up, a bud vase.
      b.cylinder(cx + 0.08, Y + 0.765, cz, 0.03, 0.026, 0.05, PALETTE.porcelain, 10, 'y', { surface: 'ceramic' });
      if (tier >= 2) {
        b.cylinder(cx - 0.08, Y + 0.79, cz, 0.012, 0.018, 0.1, '#DDEBEF', 8, 'y', { surface: 'glass' });
        b.sphere(cx - 0.08, Y + 0.86, cz, 0.025, theme.blanket, 1, 0.9, FLAT);
      }
      return true;
    }
    case 'chair': {
      // A dining or bistro chair: four legs, a cushioned seat, a back on the side away from the table.
      const seatY = Y + 0.42;
      const backZ = prop.facing === 'rear' ? r.z0 + 0.05 : r.z1 - 0.05;
      const legs = tier >= 2 ? k.woodDark : k.wood;
      for (const fx of [r.x0 + 0.05, r.x1 - 0.05]) for (const fz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(fx, Y + 0.2, fz, 0.035, 0.4, 0.035, legs, 0, { shade: 0.85 });
      b.rounded(cx, seatY, cz, w - 0.04, 0.05, d - 0.04, 0.04, legs, { shade: 0.9 });
      b.rounded(cx, seatY + 0.04, cz, w - 0.1, 0.05, d - 0.1, 0.04, tier <= 0 ? '#A99A86' : k.cushion, { shade: 0.95, surface: k.cushionSurface });
      b.box(cx, seatY + 0.26, backZ, w - 0.06, 0.4, 0.04, legs, 0, { shade: 0.9 });
      if (tier >= 2) b.box(cx, seatY + 0.28, backZ + (prop.facing === 'rear' ? 0.025 : -0.025), w - 0.16, 0.26, 0.012, k.cushion, 0, { shade: 0.95, surface: k.cushionSurface });
      return true;
    }
    case 'range': {
      // The kitchen range: an iron (then enamel, then brass-trimmed) stove with an oven door toward the room,
      // a hob with pans on it, a rail of tea towels.
      const h = 0.88;
      const body = tier <= 0 ? '#5E6168' : tier === 1 ? '#3E4550' : tier === 2 ? theme.deep : '#22242B';
      b.box(cx, Y + h / 2, cz, w - 0.04, h, d - 0.04, body, 0, { shade: 0.75, surface: tier >= 1 ? 'paint' : 'iron' });
      b.slab(r, Y + h, Y + h + 0.03, '#2E2F35', 0, 0.01, { ...FLAT, surface: 'iron' });
      const doors = Math.max(1, Math.floor(d / 0.8));
      for (let i = 0; i < doors; i++) {
        const pz = r.z0 + (d / doors) * (i + 0.5);
        b.box(front + out * 0.01, Y + 0.42, pz, 0.02, 0.4, d / doors - 0.2, '#2B2C32', 0, { shade: 0.9 });
        b.box(front + out * 0.02, Y + 0.68, pz, 0.025, 0.025, d / doors - 0.3, tier >= 2 ? PALETTE.brass : PALETTE.chrome, 0, { ...FLAT, surface: tier >= 2 ? 'brass' : 'steel' });
      }
      // Hob rings and pans.
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
      // A window table for two: a white cloth from Repaired up, a lamp at the window end, the place set.
      const wallEnd = Math.abs(r.x0) > Math.abs(r.x1) ? r.x0 : r.x1;
      const inward = wallEnd < 0 ? 1 : -1;
      const topY = Y + 0.72;
      for (const fx of [r.x0 + 0.08, r.x1 - 0.08]) for (const fz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(fx, Y + 0.35, fz, 0.04, 0.7, 0.04, k.woodDark, 0, { shade: 0.85 });
      b.slab(r, topY - 0.03, topY, k.wood, 0, 0.01, { shade: 0.9, surface: 'varnish' });
      if (tier >= 1) {
        b.slab(r, topY, topY + 0.008, PALETTE.linen, 0, 0, { ...FLAT, surface: 'fabric' });
        b.box(r.x0 + w / 2, topY - 0.08, r.z0 + 0.005, w - 0.01, 0.16, 0.01, PALETTE.linen, 0, { ...FLAT, surface: 'fabric' });
        b.box(r.x0 + w / 2, topY - 0.08, r.z1 - 0.005, w - 0.01, 0.16, 0.01, PALETTE.linen, 0, { ...FLAT, surface: 'fabric' });
      }
      if (tier >= 2) b.slab(rect(r.x0 + 0.06, cz - 0.08, r.x1 - 0.06, cz + 0.08), topY + 0.008, topY + 0.012, theme.deep, 0, 0, { ...FLAT, surface: 'velvet' });
      // The lamp by the window: an oil lamp when run down, a silk-shaded brass lamp later.
      const lx = wallEnd + inward * 0.14;
      b.cylinder(lx, topY + 0.03, cz, 0.04, 0.05, 0.04, k.metal, 10, 'y', { surface: k.metalSurface });
      b.cylinder(lx, topY + 0.12, cz, 0.01, 0.01, 0.15, k.metal, 6, 'y', { surface: k.metalSurface });
      lamps.cylinder(lx, topY + 0.22, cz, 0.045, 0.07, 0.08, tier >= 2 ? '#F6D9B5' : PALETTE.lampShade, 12, 'y', { shade: 0.9 });
      // The diner's place: a plate, a glass, a folded napkin (the seat is on the front side).
      const px = r.x0 + w * 0.55;
      const pz = cz - 0.2;
      b.cylinder(px, topY + 0.015, pz, 0.1, 0.1, 0.012, '#FBF8F2', 16, 'y', { surface: 'ceramic' });
      if (tier >= 3) b.cylinder(px, topY + 0.022, pz, 0.075, 0.075, 0.004, PALETTE.gold, 16, 'y', { ...FLAT, surface: 'brass' });
      b.cylinder(px + inward * 0.15, topY + 0.06, pz + 0.06, 0.022, 0.016, 0.1, '#E8EEF2', 8, 'y', { surface: 'glass' });
      return true;
    }
    case 'bar': {
      // The bar along the wall: a back-bar cabinet against it with bottles on top, the counter in front with a
      // brass foot rail; eight bulbs along the front light up as the party builds (CarriageView.setVenueSign).
      const h = 1.0;
      // The counter is the 0.45 m nearest the room; the back-bar stands behind it against the wall.
      const cx0 = out > 0 ? front - 0.45 : front;
      const cx1 = out > 0 ? front : front + 0.45;
      b.box((cx0 + cx1) / 2, Y + 0.04, cz, 0.4, 0.08, d - 0.04, k.woodDark, 0, { shade: 0.7 });
      b.box((cx0 + cx1) / 2, Y + h / 2, cz, 0.42, h - 0.04, d - 0.02, k.wood, 0, { shade: 0.72, surface: tier >= 2 ? 'varnish' : 'wood' });
      const panels = Math.max(3, Math.round(d / 0.85));
      for (let i = 0; i < panels; i++) {
        const pz = r.z0 + (d / panels) * (i + 0.5);
        b.box(front + out * 0.011, Y + 0.5, pz, 0.02, 0.6, d / panels - 0.14, tier >= 2 ? theme.deep : k.woodDark, 0, { shade: 0.9, surface: tier >= 2 ? 'leather' : 'wood' });
      }
      b.slab(rect(cx0 - (out < 0 ? 0.04 : 0), r.z0, cx1 + (out > 0 ? 0.04 : 0), r.z1), Y + h - 0.02, Y + h + 0.03, tier >= 3 ? '#1E1C22' : k.top, 0, 0, { ...FLAT, surface: tier >= 3 ? 'marble' : k.topSurface });
      b.cylinder(front + out * 0.07, Y + 0.16, cz, 0.018, 0.018, d - 0.1, k.metal, 8, 'z', { surface: k.metalSurface });
      // The back-bar against the wall, and its bottles.
      const bx0 = out > 0 ? back : cx1 + 0.07;
      const bx1 = out > 0 ? cx0 - 0.07 : back;
      b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y, Y + 0.78, k.woodDark, 0, 0, { shade: 0.75 });
      b.slab(rect(bx0, r.z0 + 0.1, bx1, r.z1 - 0.1), Y + 0.78, Y + 0.81, k.top, 0, 0, { ...FLAT, surface: k.topSurface });
      const bxc = (bx0 + bx1) / 2;
      const base = ['#3E6B4A', '#7A4A2E', '#2F4E6E'];
      for (let i = 0, z = r.z0 + 0.35; z < r.z1 - 0.3; z += 0.5, i++) {
        b.cylinder(bxc, Y + 0.89, z, 0.035, 0.035, 0.16, base[i % base.length], 8, 'y', { shade: 0.95, surface: 'glass' });
        b.cylinder(bxc, Y + 1.0, z, 0.012, 0.02, 0.06, base[i % base.length], 6, 'y', { shade: 1, surface: 'glass' });
      }
      // Glasses on the counter at the mixing end, and a dish of lemons.
      b.cylinder(cx0 + 0.15, Y + h + 0.07, r.z0 + 0.2, 0.03, 0.022, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
      b.cylinder(cx0 + 0.28, Y + h + 0.07, r.z0 + 0.24, 0.03, 0.022, 0.08, '#E8EEF2', 8, 'y', { surface: 'glass' });
      b.cylinder(cx0 + 0.2, Y + h + 0.05, r.z0 + 0.42, 0.07, 0.05, 0.03, PALETTE.porcelain, 12, 'y', { surface: 'ceramic' });
      for (const dz of [-0.025, 0.025]) b.sphere(cx0 + 0.2, Y + h + 0.085, r.z0 + 0.42 + dz, 0.025, '#E9C94A', 0, 0.85, FLAT);
      // The bulbs' sockets (the bulbs themselves glow from CarriageView).
      for (const z of barBulbs(r, out)) b.cylinder(front + out * 0.02, Y + 0.86, z, 0.022, 0.022, 0.03, k.metal, 8, 'x', { surface: k.metalSurface });
      return true;
    }
    case 'bottles': {
      // The cocktail list: a crowd of bright bottles on the back-bar and a silver shaker.
      const bx = (r.x0 + r.x1) / 2;
      const colours = ['#C0485C', '#E5B452', '#6FA8DC', '#8E6A8C', '#4F9591', '#E08A6E'];
      for (let i = 0, z = r.z0 + 0.2; z < r.z1 - 0.15; z += 0.5, i++) {
        const c = colours[i % colours.length];
        b.cylinder(bx, Y + 0.87, z, 0.028, 0.028, 0.12, c, 8, 'y', { shade: 0.95, surface: 'glass' });
        b.cylinder(bx, Y + 0.96, z, 0.01, 0.016, 0.06, c, 6, 'y', { shade: 1, surface: 'glass' });
      }
      b.cylinder(bx, Y + 0.9, r.z1 - 0.12, 0.035, 0.03, 0.17, PALETTE.chrome, 10, 'y', { surface: 'steel' });
      return true;
    }
    case 'stool': {
      // A bar stool: a round seat on a post, a foot ring.
      const radius = Math.min(w, d) / 2 - 0.02;
      b.cylinder(cx, Y + 0.02, cz, radius * 0.8, radius * 0.9, 0.04, k.metal, 12, 'y', { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.3, cz, 0.025, 0.025, 0.56, k.metal, 8, 'y', { surface: k.metalSurface });
      b.add(new THREE.TorusGeometry(radius * 0.7, 0.012, 6, 14), k.metal, cx, Y + 0.24, cz, Math.PI / 2, 0, 0, { surface: k.metalSurface });
      b.cylinder(cx, Y + 0.6, cz, radius, radius * 0.92, 0.06, tier <= 0 ? '#9C8570' : k.cushion, 16, 'y', { shade: 0.95, surface: tier <= 0 ? 'wood' : k.cushionSurface });
      return true;
    }
    case 'domeSeat': {
      // A plush observation seat turned toward the lake windows (−x): low, deep, with a tall back.
      const facing = prop.facing === 'left' ? -1 : 1;
      const backX = facing < 0 ? r.x1 - 0.08 : r.x0 + 0.08;
      const cover = tier <= 0 ? '#8E8577' : tier === 1 ? shadeHex(theme.deep, 1.3) : theme.deep;
      b.box(cx, Y + 0.1, cz, w - 0.08, 0.2, d - 0.08, k.woodDark, 0, { shade: 0.75 });
      b.rounded(cx, Y + 0.28, cz, w - 0.04, 0.16, d - 0.04, 0.06, cover, { shade: 0.85, surface: k.cushionSurface });
      b.rounded(backX, Y + 0.56, cz, 0.14, 0.5, d - 0.06, 0.06, cover, { shade: 0.85, surface: k.cushionSurface });
      for (const az of [r.z0 + 0.06, r.z1 - 0.06]) b.rounded(cx, Y + 0.44, az, w - 0.12, 0.14, 0.1, 0.04, cover, { shade: 0.9, surface: k.cushionSurface });
      // From Cosy up, a cushion resting against the back.
      if (tier >= 2) b.rounded(backX + facing * 0.11, Y + 0.5, cz, 0.08, 0.2, d * 0.5, 0.04, PALETTE.pillow, { shade: 0.95, surface: 'fabric' });
      return true;
    }
    case 'basket': {
      // A wicker basket of folded blankets.
      b.rounded(cx, Y + 0.2, cz, w - 0.04, 0.4, d - 0.04, 0.12, tier <= 0 ? '#A98D6F' : '#C9A77A', { shade: 0.8, pattern: undefined });
      for (let i = 0; i < 3; i++) b.rounded(cx, Y + 0.44 + i * 0.07, cz, w - 0.16, 0.07, d - 0.14, 0.04, i % 2 ? PALETTE.linen : theme.blanket, { shade: 0.92, surface: 'fabric' });
      return true;
    }
    case 'rope': {
      // Brass posts with a velvet rope between them: the dome's "please wait to be seated".
      const posts = Math.max(2, Math.round(w / 0.7) + 1);
      for (let i = 0; i < posts; i++) {
        const px = r.x0 + 0.04 + (w - 0.08) * (i / (posts - 1));
        b.cylinder(px, Y + 0.02, cz, 0.06, 0.07, 0.04, k.metal, 10, 'y', { surface: k.metalSurface });
        b.cylinder(px, Y + 0.46, cz, 0.018, 0.018, 0.88, k.metal, 8, 'y', { surface: k.metalSurface });
        b.sphere(px, Y + 0.92, cz, 0.035, k.metal, 1, 1, { shade: 1, surface: k.metalSurface });
        if (i < posts - 1) {
          const nx = r.x0 + 0.04 + (w - 0.08) * ((i + 1) / (posts - 1));
          const span = nx - px;
          b.add(new THREE.TorusGeometry(span / 2, 0.016, 6, 12, Math.PI), tier <= 0 ? '#7E6A5A' : '#9C2F45', (px + nx) / 2, Y + 0.86, cz, Math.PI, 0, 0, { shade: 1, surface: 'velvet' });
        }
      }
      return true;
    }
    case 'wineRack': {
      // A wine rack against the wall: a frame of pigeonholes, each with a bottle's end showing.
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
      // The lobster tank: a cabinet with a glass tank of water on it, a red lobster on the gravel.
      const cab = 0.48;
      b.box(cx, Y + cab / 2, cz, w - 0.02, cab, d - 0.02, k.woodDark, 0, { shade: 0.75 });
      b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + cab, Y + cab + 0.03, '#C9B98F', 0, 0, FLAT);
      lamps.slab(rect(r.x0 + 0.04, r.z0 + 0.04, r.x1 - 0.04, r.z1 - 0.04), Y + cab + 0.03, Y + cab + 0.36, '#4E9BB8', 0, 0, { shade: 0.8 });
      b.slab(rect(r.x0 + 0.02, r.z0 + 0.02, r.x1 - 0.02, r.z1 - 0.02), Y + cab + 0.37, Y + cab + 0.4, k.metal, 0, 0, { ...FLAT, surface: k.metalSurface });
      const lz = cz;
      b.add(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 0.6, 1.8), '#C8453A', cx, Y + cab + 0.37 + 0.03, lz, 0, 0, 0, FLAT);
      for (const side of [-1, 1]) b.add(new THREE.SphereGeometry(0.03, 6, 4).scale(1, 0.6, 1.6), '#D9583F', cx + side * 0.06, Y + cab + 0.4 + 0.02, lz - 0.1, 0, side * 0.5, 0, FLAT);
      return true;
    }
    case 'telescope': {
      // A brass telescope on a wooden tripod, looking out over the lake.
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
    default:
      return false;
  }
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
 * The observation dome's glass: brass ribs that rise from the lake-side wall and curve in over the seats, with
 * night glass between them. Only on the lake side (the far side from the camera), so it never hides the room.
 */
export function buildDomeCanopy(b: GeoBuilder, wallX: number, wallTop: number, z0: number, z1: number, tier: number): void {
  const rib = tier >= 2 ? PALETTE.brass : tier <= 0 ? PALETTE.iron : '#E8E4DA';
  const ribSurface = tier >= 2 ? 'brass' : 'paint';
  // A light night-sky glass (a dark one read as a solid roof over the lake windows).
  const glass = '#7E93B8';
  // The arc: from the wall top, up and in by `reach`, to `rise` above it.
  const reach = 1.25;
  const rise = 1.0;
  const segments = 6;
  // A quarter ellipse: straight up off the wall top, curving in to level at the top.
  const inward = wallX < 0 ? 1 : -1;
  const point = (t: number): [number, number] => {
    const a = (t * Math.PI) / 2;
    return [wallX + inward * (1 - Math.cos(a)) * reach, wallTop + Math.sin(a) * rise];
  };
  // Glass panels as thin slanted slabs between the ribs, one strip per arc segment.
  for (let s = 0; s < segments; s++) {
    const [xa, ya] = point(s / segments);
    const [xb, yb] = point((s + 1) / segments);
    const len = Math.hypot(xb - xa, yb - ya);
    const angle = Math.atan2(yb - ya, xb - xa);
    b.add(new THREE.BoxGeometry(len, 0.012, z1 - z0 - 0.04), glass, (xa + xb) / 2, (ya + yb) / 2, (z0 + z1) / 2, 0, 0, angle, { shade: 1, surface: 'glass' });
  }
  // Ribs every 1.5 m along the carriage, and one along the top edge.
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
