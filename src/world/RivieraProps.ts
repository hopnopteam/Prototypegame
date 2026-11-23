import * as THREE from 'three';
import { rect } from '../core/types';
import type { GeoBuilder, PartStyle } from './geo';
import type { PropDef } from './layout';
import { PATTERN } from './materials';
import { PALETTE, shadeHex, type CarriageTheme } from './palette';

/**
 * Phase 4, the Riviera Coast Line's new carriages: the Kids' Play Car (a puppet theatre, the gelato freezer, six play
 * corners and poufs), the Spa Car (massage tables, the robe rack, a stone fountain) and the Pool Car (a raised pool,
 * loungers, the skimmer's stand, the towel cart, the lifeguard's chair). Built from our own parts in the venues' style
 * (VenueProps.ts), dressed by the refit tier like every venue: makeshift when run down, plain and sound once repaired,
 * the carriage's colours when cosy, and its grand look at Luxury. Every piece stays inside its own footprint, so the
 * clipping audit can check it against its neighbours.
 */

const FLAT: PartStyle = { shade: 1 };
/** The floor's top (CarriageView.FLOOR_Y). */
const Y = 0.55;
/** The water's height over the floor (CarriageView.POOL_WATER_Y: the basin is built to hold it). */
const WATER = 0.36;

/** Bright toy colours (the play car's balls, blocks and poufs). */
const TOYS = ['#F25C54', '#F7B32B', '#4FA8E0', '#7CCB7A', '#B07CE8', '#FF9F6E'];

/** Wood by tier: weathered, honey, walnut, then dark walnut. */
function wood(tier: number): string {
  return tier <= 0 ? '#9C8570' : tier === 1 ? '#B08658' : tier === 2 ? PALETTE.walnut : PALETTE.walnutDark;
}
function trim(tier: number): { colour: string; surface: PartStyle['surface'] } {
  return tier >= 3 ? { colour: PALETTE.gold, surface: 'brass' } : tier === 2 ? { colour: PALETTE.brass, surface: 'brass' } : { colour: PALETTE.chrome, surface: 'steel' };
}

export function buildRivieraProp(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): boolean {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const out = prop.facing === 'right' ? 1 : -1;
  const front = out > 0 ? r.x1 : r.x0;
  const back = out > 0 ? r.x0 : r.x1;
  const t = trim(tier);
  switch (prop.kind) {
    case 'puppetTheatre': {
      // A booth facing the room: a striped skirt, a stage window with curtains, a pediment on top. Run down, a sheet
      // over a clothes rail.
      const depth = Math.min(w - 0.04, 0.6);
      const bx = back + out * (depth / 2 + 0.02);
      if (tier <= 0) {
        for (const z of [r.z0 + 0.05, r.z1 - 0.05]) b.cylinder(bx, Y + 0.75, z, 0.02, 0.02, 1.5, PALETTE.iron, 6, 'y', { surface: 'iron' });
        b.box(bx, Y + 1.49, cz, 0.04, 0.04, d - 0.1, PALETTE.iron, 0, { surface: 'iron' });
        b.box(bx + out * 0.02, Y + 0.78, cz, 0.02, 1.36, d - 0.16, '#E8E0CE', 0, { shade: 0.9, surface: 'fabric' });
        b.box(bx + out * 0.035, Y + 1.12, cz, 0.006, 0.36, d * 0.5, '#3B3540', 0, FLAT);
        return true;
      }
      const stripe = tier >= 2 ? theme.deep : '#C9473F';
      b.box(bx, Y + 0.44, cz, depth, 0.88, d - 0.04, stripe, 0, { pattern: PATTERN.stripesZ, color2: '#FFF6E4', scale: 0.12, shade: 0.9, surface: 'fabric' });
      // The frame round the stage window, the dark stage behind it.
      for (const z of [r.z0 + 0.06, r.z1 - 0.06]) b.box(bx, Y + 1.14, z, depth, 0.56, 0.1, wood(tier), 0, { shade: 0.85, surface: 'varnish' });
      b.box(back + out * 0.06, Y + 1.14, cz, 0.06, 0.56, d - 0.2, '#2E2A3E', 0, FLAT);
      // Curtains drawn back at each side of the window.
      const curtain = tier >= 3 ? '#B0283A' : tier === 2 ? '#F7B32B' : '#C9473F';
      for (const s of [-1, 1]) b.box(bx + out * 0.1, Y + 1.14, cz + s * (d / 2 - 0.26), 0.06, 0.52, 0.22, curtain, 0, { shade: 0.85, surface: tier >= 3 ? 'velvet' : 'fabric' });
      // The pediment: an arch of the theatre's colour with a trim.
      b.box(bx, Y + 1.5, cz, depth, 0.16, d - 0.02, tier >= 2 ? '#F7B32B' : wood(tier), 0, { shade: 0.9, surface: 'paint' });
      b.box(front - out * 0.01, Y + 1.43, cz, 0.012, 0.02, d - 0.08, t.colour, 0, { ...FLAT, surface: t.surface });
      if (tier >= 2) for (let i = 0; i < 5; i++) lamps.sphere(front - out * 0.02, Y + 1.56, r.z0 + 0.2 + (d - 0.4) * (i / 4), 0.025, '#FFE2B0', 0, 1, FLAT);
      return true;
    }
    case 'freezer': {
      // The gelato freezer: a white cabinet, a slanted glass top over tubs of colourful gelato, a menu on a stand.
      const h = 0.82;
      const body = tier <= 0 ? '#D9D2C2' : tier >= 3 ? '#F4EFE4' : '#F7F4EE';
      b.rounded(cx, Y + h / 2, cz, w - 0.04, h, d - 0.04, 0.04, body, { shade: 0.9, surface: 'paint' });
      if (tier >= 2) b.box(front - out * 0.004, Y + 0.3, cz, 0.008, 0.18, d - 0.12, theme.deep, 0, FLAT);
      const tubs = Math.max(3, Math.round((d - 0.2) / 0.22));
      const colours = ['#F49AB4', '#A8D98A', '#F7E3A1', '#8B5A3C', '#FFB26B', '#B9D8F2'];
      for (let i = 0; i < tubs; i++) {
        const z = r.z0 + 0.12 + (d - 0.24) * ((i + 0.5) / tubs);
        for (const dx of [-0.13, 0.13]) b.sphere(cx + dx, Y + h + 0.015, z, 0.075, colours[(i * 2 + (dx > 0 ? 1 : 0)) % colours.length], 0, 0.45, { shade: 0.95 });
      }
      b.box(cx, Y + h + 0.1, cz, w - 0.1, 0.012, d - 0.1, '#D9EEF4', 0, { ...FLAT, surface: 'glass' });
      if (tier >= 1) b.box(back + out * 0.05, Y + h + 0.28, cz, 0.03, 0.36, Math.min(0.6, d - 0.2), tier >= 3 ? PALETTE.gold : '#2E3A33', 0, { shade: 0.9 });
      return true;
    }
    case 'play':
      buildPlay(b, prop, tier);
      return true;
    case 'pouf': {
      // A round pouf for a parent to sit on, in the play car's colours.
      const rad = Math.min(w, d) / 2 - 0.01;
      const colour = TOYS[Math.abs(Math.round(cz * 3)) % TOYS.length];
      b.cylinder(cx, Y + 0.17, cz, rad, rad * 0.95, 0.34, tier <= 0 ? '#A6987F' : colour, 16, 'y', { shade: 0.85, surface: 'fabric' });
      b.sphere(cx, Y + 0.34, cz, rad * 0.98, tier <= 0 ? '#B3A58C' : shadeHex(colour, 12), 0, 0.25, { shade: 0.9, surface: 'fabric' });
      return true;
    }
    case 'massageTable': {
      // A padded table lengthwise along the wall: a face cradle at its head (the front), a folded towel at its foot.
      const top = 0.62;
      const legs = tier <= 0 ? PALETTE.iron : wood(tier);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(cx + dx * (w / 2 - 0.1), Y + (top - 0.08) / 2, cz + dz * (d / 2 - 0.18), 0.05, top - 0.08, 0.05, legs, 0, { surface: tier <= 0 ? 'iron' : 'varnish' });
      b.box(cx, Y + 0.18, cz, w - 0.24, 0.025, d - 0.5, legs, 0, { surface: tier <= 0 ? 'iron' : 'varnish' });
      const pad = tier <= 0 ? '#BDB4A2' : tier >= 3 ? '#F4EFE4' : shadeHex(theme.deep, 40);
      b.rounded(cx, Y + top - 0.04, cz + 0.08, w - 0.06, 0.1, d - 0.26, 0.04, pad, { shade: 0.9, surface: tier >= 2 ? 'leather' : 'fabric' });
      // The face cradle at the head.
      b.add(new THREE.TorusGeometry(0.11, 0.035, 8, 16, Math.PI * 2).scale(1, 1, 0.8), pad, cx, Y + top - 0.04, r.z0 + 0.14, Math.PI / 2, 0, 0, { shade: 0.9, surface: 'fabric' });
      // A folded towel and (from the Makeover) a little stack of stones and a candle on a shelf below.
      b.rounded(cx, Y + top + 0.03, r.z1 - 0.28, w - 0.24, 0.05, 0.22, 0.02, '#F8F4EC', { shade: 0.95, surface: 'fabric' });
      if (tier >= 2) {
        for (let i = 0; i < 3; i++) b.sphere(cx - 0.1 + i * 0.1, Y + 0.215, cz + 0.1, 0.04 - i * 0.006, '#3A3940', 0, 0.55, { shade: 0.95, surface: 'stone' });
        lamps.cylinder(cx + 0.1, Y + 0.235, cz - 0.2, 0.025, 0.025, 0.04, '#FFE6B0', 10, 'y', FLAT);
      }
      return true;
    }
    case 'robeRack': {
      // A rail of white robes on hangers over a shelf of folded towels and a pair of slippers.
      const rail = Y + 1.32;
      const postX = back + out * 0.2;
      for (const z of [r.z0 + 0.05, r.z1 - 0.05]) b.cylinder(postX, Y + 0.66, z, 0.02, 0.02, 1.32, tier <= 0 ? PALETTE.iron : t.colour, 8, 'y', { surface: tier <= 0 ? 'iron' : t.surface });
      b.cylinder(postX, rail, cz, 0.018, 0.018, d - 0.1, tier <= 0 ? PALETTE.iron : t.colour, 8, 'z', { surface: tier <= 0 ? 'iron' : t.surface });
      const robes = Math.max(2, Math.round((d - 0.3) / 0.36));
      for (let i = 0; i < robes; i++) {
        const z = r.z0 + 0.2 + (d - 0.4) * ((i + 0.5) / robes);
        b.rounded(postX, rail - 0.36, z, 0.16, 0.66, 0.3, 0.06, i % 3 === 2 ? '#DCEEF2' : '#F8F4EC', { shade: 0.9, surface: 'fabric' });
        b.box(postX + out * 0.085, rail - 0.32, z, 0.006, 0.04, 0.26, '#7FC1D9', 0, FLAT);
      }
      b.box(cx, Y + 0.32, cz, w - 0.06, 0.03, d - 0.08, wood(tier), 0, { surface: 'varnish' });
      for (let i = 0; i < 3; i++) b.rounded(cx, Y + 0.38 + i * 0.05, r.z0 + 0.3 + i * 0.02, w - 0.24, 0.045, 0.3, 0.02, i % 2 ? '#F8F4EC' : '#E5F0EC', { shade: 0.95, surface: 'fabric' });
      for (const dz of [-0.07, 0.07]) b.rounded(front - out * 0.12, Y + 0.02, r.z1 - 0.25 + dz, 0.22, 0.04, 0.09, 0.02, '#F8F4EC', { shade: 0.95, surface: 'fabric' });
      return true;
    }
    case 'fountain': {
      // A little stone fountain: a basin of water, a bowl on a pillar dripping into it, plants round it.
      const stone = tier <= 0 ? '#A8A296' : '#D9D2C2';
      const rad = Math.min(w, d) / 2 - 0.04;
      b.cylinder(cx, Y + 0.16, cz, rad, rad, 0.32, stone, 18, 'y', { shade: 0.85, surface: 'stone' });
      b.cylinder(cx, Y + 0.3, cz, rad - 0.05, rad - 0.05, 0.02, '#7FC6D6', 18, 'y', { shade: 1, surface: 'glass' });
      b.cylinder(cx, Y + 0.5, cz, 0.05, 0.06, 0.4, stone, 10, 'y', { shade: 0.85, surface: 'stone' });
      b.sphere(cx, Y + 0.72, cz, 0.16, stone, 0, 0.45, { shade: 0.85, surface: 'stone' });
      lamps.cylinder(cx, Y + 0.31, cz, 0.06, 0.06, 0.012, '#BFEAF2', 10, 'y', FLAT);
      if (tier >= 1) for (const s of [-1, 1]) b.sphere(cx + out * 0.05, Y + 0.38, cz + s * (d / 2 - 0.14), 0.12, '#6E8C5A', 1, 0.8, { shade: 0.85, surface: 'foliage' });
      return true;
    }
    case 'pool':
      buildPool(b, lamps, prop, theme, tier);
      return true;
    case 'lounger': {
      // A sun lounger crosswise, its head raised at the wall: a frame, slats or a cushion, a rolled towel from Cosy.
      const frame = tier <= 0 ? '#8A7864' : tier === 1 ? '#F2EEE6' : wood(tier);
      const headX = out > 0 ? r.x0 + 0.04 : r.x1 - 0.04;
      for (const z of [r.z0 + 0.06, r.z1 - 0.06]) {
        b.box(cx, Y + 0.24, z, w - 0.12, 0.04, 0.04, frame, 0, { surface: 'varnish' });
        for (const x of [r.x0 + 0.1, r.x1 - 0.1]) b.box(x, Y + 0.11, z, 0.04, 0.22, 0.04, frame, 0, { surface: 'varnish' });
      }
      const cushion = tier <= 0 ? '#BDB4A2' : tier >= 2 ? theme.blanket : '#F7F4EE';
      b.box(cx + out * 0.18, Y + 0.29, cz, w - 0.5, 0.06, d - 0.1, cushion, 0, { pattern: tier >= 2 ? PATTERN.stripesZ : PATTERN.none, color2: '#FFFFFF', scale: 0.1, shade: 0.9, surface: 'fabric' });
      b.box(headX - out * 0.16, Y + 0.44, cz, 0.08, 0.34, d - 0.1, cushion, 0, { shade: 0.9, surface: 'fabric' });
      if (tier >= 2) b.cylinder(cx + out * 0.32, Y + 0.36, cz, 0.05, 0.05, d - 0.2, '#FFFFFF', 10, 'z', { pattern: PATTERN.stripesX, color2: theme.deep, scale: 0.06, shade: 0.95 });
      return true;
    }
    case 'skimmer': {
      // A stand with the skimmer's long net leaning on it, and a bucket for the leaves.
      const pole = tier <= 0 ? '#9C8570' : t.colour;
      b.box(back + out * 0.06, Y + 0.6, cz, 0.06, 1.2, 0.06, wood(tier), 0, { surface: 'varnish' });
      b.add(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 6), pole, cx, Y + 0.78, cz - 0.04, 0.32, 0, 0, { surface: tier <= 0 ? 'wood' : t.surface });
      b.add(new THREE.TorusGeometry(0.12, 0.014, 6, 14), pole, cx, Y + 1.48, cz - 0.28, 0.32 - Math.PI / 2, 0, 0, { surface: t.surface });
      b.cylinder(cx + out * 0.08, Y + 0.13, cz + 0.16, 0.1, 0.08, 0.26, tier <= 0 ? '#8A8F96' : '#4FA8E0', 12, 'y', { shade: 0.9, surface: 'paint' });
      return true;
    }
    case 'towelCart': {
      // A cart of rolled striped towels.
      const frame = tier <= 0 ? PALETTE.iron : t.colour;
      for (const y of [0.22, 0.62]) b.box(cx, Y + y, cz, w - 0.06, 0.03, d - 0.06, wood(tier), 0, { surface: 'varnish' });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.cylinder(cx + dx * (w / 2 - 0.05), Y + 0.44, cz + dz * (d / 2 - 0.05), 0.015, 0.015, 0.88, frame, 6, 'y', { surface: tier <= 0 ? 'iron' : t.surface });
      const rows = Math.max(2, Math.round((d - 0.1) / 0.17));
      for (const y of [0.3, 0.7]) for (let i = 0; i < rows; i++) {
        const z = r.z0 + 0.08 + (d - 0.16) * ((i + 0.5) / rows);
        b.cylinder(cx, Y + y + 0.06, z, 0.07, 0.07, w - 0.16, i % 2 ? '#FFFFFF' : theme.blanket, 12, 'x', { pattern: PATTERN.stripesX, color2: '#FFFFFF', scale: 0.08, shade: 0.95, surface: 'fabric' });
      }
      return true;
    }
    case 'lifeguardChair': {
      // A tall white chair on splayed legs with a ladder, a red-and-white lifebuoy hung on its side.
      const white = tier <= 0 ? '#C9C2B4' : '#F7F4EE';
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(cx + dx * (w / 2 - 0.05), Y + 0.5, cz + dz * (d / 2 - 0.05), 0.04, 1.0, 0.04, white, 0, { surface: 'paint' });
      for (let i = 1; i < 4; i++) b.box(cx, Y + i * 0.25, cz + d / 2 - 0.05, w - 0.1, 0.025, 0.03, white, 0, { surface: 'paint' });
      b.box(cx, Y + 1.0, cz, w - 0.04, 0.05, d - 0.04, white, 0, { surface: 'paint' });
      b.box(back + out * 0.04, Y + 1.25, cz, 0.04, 0.46, d - 0.08, white, 0, { surface: 'paint' });
      b.add(new THREE.TorusGeometry(0.13, 0.04, 8, 16), '#E8525E', front - out * 0.03, Y + 0.68, cz, 0, Math.PI / 2, 0, { pattern: PATTERN.stripesZ, color2: '#FFFFFF', scale: 0.08, shade: 0.95, surface: 'paint' });
      return true;
    }
    default:
      return false;
  }
}

/**
 * A play corner (its `variant`): a ball pit, a slide, a rocking horse, a table of building blocks, a play kitchen, a
 * toy railway; each on a soft mat. Run down, the toys are old and the mat is a blanket.
 */
function buildPlay(b: GeoBuilder, prop: PropDef, tier: number): void {
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const out = prop.facing === 'right' ? 1 : -1;
  const back = out > 0 ? r.x0 : r.x1;
  const dull = (c: string): string => (tier <= 0 ? shadeHex(c, -30) : c);
  // The mat (thin, inset so the toys stand on it).
  b.slab(rect(r.x0 + 0.04, r.z0 + 0.04, r.x1 - 0.04, r.z1 - 0.04), Y, Y + 0.025, tier <= 0 ? '#A89C86' : '#7FC6D6', 0, 0, { pattern: tier >= 1 ? PATTERN.checker : PATTERN.none, color2: '#F7E3A1', scale: 0.3, shade: 0.95, surface: 'fabric' });
  const y = Y + 0.025;
  switch (prop.variant) {
    case 'ballpit': {
      const rad = Math.min(w, d) / 2 - 0.08;
      b.add(new THREE.TorusGeometry(rad - 0.08, 0.09, 8, 20), dull('#4FA8E0'), cx, y + 0.1, cz, Math.PI / 2, 0, 0, { shade: 0.9, surface: 'paint' });
      let k = 3;
      for (let i = 0; i < 22; i++) {
        k = (k * 9301 + 49297) % 233280;
        const a = (k % 360) * (Math.PI / 180);
        const rr = ((k % 97) / 97) * (rad - 0.2);
        b.sphere(cx + Math.cos(a) * rr, y + 0.05 + (i % 3) * 0.04, cz + Math.sin(a) * rr, 0.045, dull(TOYS[i % TOYS.length]), 0, 1, { shade: 0.95, surface: 'paint' });
      }
      break;
    }
    case 'slide': {
      // A ladder at the wall, the platform, and the chute running down toward the room.
      const lx = back + out * 0.18;
      for (const s of [-1, 1]) b.box(lx, y + 0.45, r.z0 + 0.3 + s * 0.16, 0.04, 0.9, 0.04, dull('#F7B32B'), 0, { surface: 'paint' });
      for (let i = 1; i < 5; i++) b.box(lx, y + i * 0.18, r.z0 + 0.3, 0.03, 0.025, 0.32, dull('#F7B32B'), 0, { surface: 'paint' });
      b.box(lx + out * 0.1, y + 0.9, r.z0 + 0.3, 0.3, 0.05, 0.4, dull('#F25C54'), 0, { surface: 'paint' });
      const len = Math.min(d - 0.5, 0.95);
      b.add(new THREE.BoxGeometry(0.34, 0.04, len), dull('#4FA8E0'), lx + out * 0.12, y + 0.48, r.z0 + 0.5 + len / 2, -0.78, 0, 0, { shade: 0.9, surface: 'paint' });
      break;
    }
    case 'horse': {
      // A rocking horse on curved runners.
      const body = dull('#F2EEE6');
      for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.42, 0.018, 6, 18, Math.PI * 0.5), dull('#C9473F'), cx + s * 0.12, y + 0.46, cz, 0, Math.PI / 2, Math.PI * 0.75, { surface: 'paint' });
      b.rounded(cx, y + 0.42, cz, 0.18, 0.2, 0.48, 0.08, body, { shade: 0.9, surface: 'paint' });
      b.rounded(cx, y + 0.6, cz - 0.24, 0.12, 0.26, 0.14, 0.05, body, { shade: 0.9, surface: 'paint' });
      b.box(cx, y + 0.66, cz - 0.17, 0.04, 0.2, 0.06, dull('#8B5A3C'), 0, FLAT);
      for (const s of [-1, 1]) b.box(cx + s * 0.05, y + 0.27, cz - 0.15, 0.04, 0.16, 0.04, body, 0, FLAT);
      for (const s of [-1, 1]) b.box(cx + s * 0.05, y + 0.27, cz + 0.17, 0.04, 0.16, 0.04, body, 0, FLAT);
      b.box(cx, y + 0.54, cz + 0.02, 0.2, 0.03, 0.16, dull('#C9473F'), 0, FLAT);
      break;
    }
    case 'blocks': {
      // A low table with towers of building blocks, two little chairs.
      b.box(cx, y + 0.3, cz, w - 0.3, 0.04, d - 0.4, dull('#F7F4EE'), 0, { surface: 'paint' });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box(cx + dx * (w / 2 - 0.2), y + 0.14, cz + dz * (d / 2 - 0.25), 0.04, 0.28, 0.04, dull('#7CCB7A'), 0, FLAT);
      for (let i = 0; i < 9; i++) {
        const tx = cx - 0.18 + (i % 3) * 0.18;
        const tz = cz - 0.14 + Math.floor(i / 3) * 0.14;
        const n = 1 + (i % 3);
        for (let j = 0; j < n; j++) b.box(tx, y + 0.35 + j * 0.06, tz, 0.06, 0.06, 0.06, dull(TOYS[(i + j) % TOYS.length]), j * 0.3, FLAT);
      }
      break;
    }
    case 'kitchen': {
      // A play kitchen against the wall: a little stove, a sink, a cupboard, pans.
      const kx = back + out * 0.2;
      b.box(kx, y + 0.3, cz, 0.36, 0.6, d - 0.2, dull('#F7E3A1'), 0, { shade: 0.9, surface: 'paint' });
      for (const s of [-1, 1]) b.cylinder(kx, y + 0.605, cz + s * 0.2, 0.07, 0.07, 0.01, '#3A3940', 12, 'y', FLAT);
      b.box(kx, y + 0.75, cz, 0.04, 0.3, d - 0.3, dull('#4FA8E0'), 0, { surface: 'paint' });
      b.cylinder(kx + out * 0.05, y + 0.66, cz + 0.2, 0.07, 0.06, 0.08, dull('#F25C54'), 12, 'y', { surface: 'paint' });
      break;
    }
    default: {
      // A toy railway: an oval of track, a little engine and two wagons.
      const rx = w / 2 - 0.16;
      const rz = d / 2 - 0.16;
      b.add(new THREE.TorusGeometry(1, 0.03, 6, 28).scale(rx, rz, 1), dull('#8B5A3C'), cx, y + 0.02, cz, Math.PI / 2, 0, 0, { surface: 'varnish' });
      b.rounded(cx + rx, y + 0.08, cz, 0.09, 0.1, 0.16, 0.03, dull('#F25C54'), { surface: 'paint' });
      b.cylinder(cx + rx, y + 0.17, cz - 0.04, 0.02, 0.02, 0.06, '#3A3940', 8, 'y', FLAT);
      b.rounded(cx + rx * 0.7, y + 0.07, cz + rz * 0.7, 0.09, 0.08, 0.14, 0.03, dull('#4FA8E0'), { surface: 'paint' });
      b.rounded(cx + rx * 0.7, y + 0.07, cz - rz * 0.7, 0.09, 0.08, 0.14, 0.03, dull('#7CCB7A'), { surface: 'paint' });
      break;
    }
  }
}

/**
 * The Pool Car's pool: a raised basin (walls up to just above the water), tiled inside in the car's blues, a coping on
 * top (concrete run down, then white stone, then teak at Cosy and marble with a gold line at Luxury), steps and a
 * chrome ladder on the deck side, and lights in the walls under the water. The water is CarriageView's.
 */
function buildPool(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number): void {
  const r = prop.rect;
  const wall = 0.14;
  const top = WATER + 0.06;
  const tile = tier <= 0 ? '#9DB7BC' : tier >= 3 ? '#2E7FA8' : theme.wallLow;
  const tileStyle: PartStyle = { pattern: PATTERN.checker, color2: shadeHex(tile, 14), scale: 0.18, shade: 0.9, surface: 'ceramic' };
  // The floor of the basin, and its four walls.
  b.slab(rect(r.x0 + wall, r.z0 + wall, r.x1 - wall, r.z1 - wall), Y, Y + 0.03, tile, 0, 0, tileStyle);
  const outer = tier <= 0 ? '#B9B4A8' : '#F4F1EA';
  const outerStyle: PartStyle = { shade: 0.85, surface: tier >= 3 ? 'marble' : 'stone' };
  b.box((r.x0 + r.x1) / 2, Y + top / 2, r.z0 + wall / 2, r.x1 - r.x0, top, wall, outer, 0, outerStyle);
  b.box((r.x0 + r.x1) / 2, Y + top / 2, r.z1 - wall / 2, r.x1 - r.x0, top, wall, outer, 0, outerStyle);
  b.box(r.x0 + wall / 2, Y + top / 2, (r.z0 + r.z1) / 2, wall, top, r.z1 - r.z0 - wall * 2 - 0.002, outer, 0, outerStyle);
  b.box(r.x1 - wall / 2, Y + top / 2, (r.z0 + r.z1) / 2, wall, top, r.z1 - r.z0 - wall * 2 - 0.002, outer, 0, outerStyle);
  // The coping round the top.
  const coping = tier <= 0 ? '#C9C2B4' : tier === 2 ? PALETTE.walnut : tier >= 3 ? '#F1ECE4' : '#FBF8F2';
  const copeStyle: PartStyle = { shade: 0.9, surface: tier === 2 ? 'varnish' : tier >= 3 ? 'marble' : 'stone' };
  b.slab(rect(r.x0, r.z0, r.x1, r.z0 + wall + 0.04), Y + top, Y + top + 0.04, coping, 0, 0, copeStyle);
  b.slab(rect(r.x0, r.z1 - wall - 0.04, r.x1, r.z1), Y + top, Y + top + 0.04, coping, 0, 0, copeStyle);
  b.slab(rect(r.x0, r.z0 + wall + 0.04, r.x0 + wall + 0.04, r.z1 - wall - 0.04), Y + top, Y + top + 0.04, coping, 0, 0, copeStyle);
  b.slab(rect(r.x1 - wall - 0.04, r.z0 + wall + 0.04, r.x1, r.z1 - wall - 0.04), Y + top, Y + top + 0.04, coping, 0, 0, copeStyle);
  if (tier >= 3) b.slab(rect(r.x1 - 0.012, r.z0 + 0.2, r.x1, r.z1 - 0.2), Y + top + 0.04, Y + top + 0.046, PALETTE.gold, 0, 0, { ...FLAT, surface: 'brass' });
  // A chrome ladder over the deck-side wall, and lights under the water along the far wall.
  const lz = (r.z0 + r.z1) / 2;
  const rail = tier <= 0 ? '#8A8F96' : PALETTE.chrome;
  for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.12, 0.016, 6, 10, Math.PI), rail, r.x1 - 0.06, Y + top + 0.04, lz + s * 0.2, 0, Math.PI / 2, 0, { surface: 'steel' });
  for (const s of [-1, 1]) b.cylinder(r.x1 - wall - 0.08, Y + 0.2, lz + s * 0.2, 0.016, 0.016, 0.4, rail, 6, 'y', { surface: 'steel' });
  if (tier >= 1) for (let i = 0; i < 4; i++) lamps.box(r.x0 + wall + 0.006, Y + 0.16, r.z0 + 0.8 + (r.z1 - r.z0 - 1.6) * (i / 3), 0.01, 0.06, 0.16, '#DFF6FF', 0, FLAT);
}
