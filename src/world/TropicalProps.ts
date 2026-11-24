import { ACTIVE_ROUTE } from '../config/routes';
import { isPassengerType } from '../config/classes';
import type { GeoBuilder } from './geo';
import type { PropDef } from './layout';
import { modelEntry, type ModelId } from './models/library';
import type { CarriageTheme } from './palette';

/**
 * The Riviera revamp (owner, 24 Nov: "a tropical beach vibe… every carriage… a different upgrade line"; concept art
 * in docs/art/refs/concept_tropical_*.jpg): the furniture of the coast's carriages in three looks, built from the
 * tropical kit (art/blender/tropical_kit.py) and plain parts. Same footprints and heights as the pieces they replace,
 * so gameplay positions, collision and the camera are untouched.
 *
 * Looks by tier: 0 Shipwrecked (the run-down pieces stay as they are), 1 Driftwood (sun-bleached, bare), 2 Bamboo
 * (bamboo and rattan with turquoise cushions), 3 Tiki Paradise (carved dark wood, hibiscus, leis, torches).
 */
export const TROPICAL = ACTIVE_ROUTE.id === 'riviera';

const Y = 0.55;
/** Mattress top over the floor (CarriageView.BED_TOP: sleepers lie here). */
const BED_TOP = 0.4;

const C = {
  drift: '#C9BBA2',
  driftDark: '#A89880',
  bamboo: '#C9A65E',
  bambooDark: '#9C7A3E',
  rattan: '#B9874E',
  tiki: '#6B4426',
  tikiDark: '#4A2E1A',
  teal: '#2EB3B0',
  coral: '#F28C6B',
  linen: '#F6F1E6',
  muslin: '#FBF7EE',
  hibiscus: '#E2304F',
  leaf: '#3E9A4A',
  straw: '#D9B46A',
  flame: '#FFB347',
};

/** The look a carriage's tier gives: passenger carriages climb 1 Repair, 2 Comfort, 4 First (the coast's Tiki Paradise). */
function lookOf(type: string, tier: number): number {
  if (tier <= 0) return 0;
  if (isPassengerType(type as never)) return tier >= 4 ? 3 : tier >= 2 ? 2 : 1;
  return Math.min(3, tier);
}

/** A kit model fitted into a footprint (w along x, d along z, h tall), turned rotY, its feet on `y`. */
function fit(b: GeoBuilder, id: ModelId, cx: number, y: number, cz: number, w: number, d: number, h: number, rotY = 0, shade = 0.95): void {
  const e = modelEntry(id);
  const turned = Math.abs(Math.sin(rotY)) > 0.5;
  const mw = turned ? e.max[2] - e.min[2] : e.max[0] - e.min[0];
  const md = turned ? e.max[0] - e.min[0] : e.max[2] - e.min[2];
  const sx = w / mw;
  const sz = d / md;
  const sy = h / (e.max[1] - e.min[1]);
  b.model(id, cx, y, cz, rotY, turned ? sz : sx, sy, turned ? sx : sz, { shade, surface: 'wood' });
}

/** A uniformly scaled kit model, its largest side no bigger than `size`, at most `h` tall. */
function place(b: GeoBuilder, id: ModelId, cx: number, y: number, cz: number, size: number, h: number, rotY = 0): void {
  const e = modelEntry(id);
  const sc = Math.min(size / Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2]), h / (e.max[1] - e.min[1]));
  b.model(id, cx, y, cz, rotY, sc, sc, sc, { shade: 0.95, surface: 'wood' });
}

/** A cane between two points along one axis (x, y or z): a bamboo pole with the look's wood. */
function cane(b: GeoBuilder, x: number, y: number, z: number, length: number, axis: 'x' | 'y' | 'z', color: string, r = 0.022): void {
  b.cylinder(x, y, z, r, r, length, color, 6, axis, { shade: 0.9, surface: 'wood' });
}

/**
 * The coast's version of a prop, or false to leave it to the classic builders (the run-down tier, and kinds the coast
 * keeps: the urn, the linen cupboard, the rack, the desk, the grill, the spa and play car's own pieces).
 */
export function buildTropicalProp(b: GeoBuilder, lamps: GeoBuilder, prop: PropDef, theme: CarriageTheme, tier: number, type: string): boolean {
  const look = lookOf(type, tier);
  if (look <= 0) return false;
  const r = prop.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const wood = look >= 3 ? C.tiki : look === 2 ? C.bamboo : C.drift;
  const woodDark = look >= 3 ? C.tikiDark : look === 2 ? C.bambooDark : C.driftDark;
  const cushion = look >= 3 ? C.coral : look === 2 ? C.teal : '#E9E1D0';
  switch (prop.kind) {
    case 'cafeTable': {
      // A round table: driftwood planks on a post, then the bamboo table, then dark carved wood with a woven mat.
      if (look >= 2) {
        fit(b, 'bamboo_table', cx, Y, cz, w - 0.04, d - 0.04, 0.74);
        if (look >= 3) b.cylinder(cx, Y + 0.745, cz, Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 0.006, C.straw, 14, 'y', { shade: 1, surface: 'fabric' });
      } else {
        b.cylinder(cx, Y + 0.72, cz, Math.min(w, d) / 2 - 0.03, Math.min(w, d) / 2 - 0.03, 0.04, wood, 14, 'y', { shade: 0.95, surface: 'wood' });
        b.cylinder(cx, Y + 0.35, cz, 0.05, 0.07, 0.7, woodDark, 8, 'y', { shade: 0.85, surface: 'wood' });
      }
      return true;
    }
    case 'diningTable': {
      // A plank table on bamboo legs; Tiki Paradise lays a woven runner down it.
      b.box(cx, Y + 0.73, cz, w - 0.04, 0.04, d - 0.04, wood, 0, { shade: 0.95, surface: 'wood' });
      for (const px of [r.x0 + 0.08, r.x1 - 0.08]) for (const pz of [r.z0 + 0.08, r.z1 - 0.08]) cane(b, px, Y + 0.355, pz, 0.71, 'y', look === 1 ? C.driftDark : C.bamboo, 0.025);
      if (look >= 2) b.box(cx, Y + 0.68, cz, w - 0.2, 0.025, 0.03, C.bambooDark, 0, { shade: 0.9, surface: 'wood' });
      if (look >= 3) b.box(cx, Y + 0.753, cz, w * 0.36, 0.006, d - 0.12, C.straw, 0, { shade: 1, surface: 'fabric' });
      return true;
    }
    case 'chair': {
      // Its back on the side away from the table (as CarriageView's chairs): a stick chair of driftwood, then rattan.
      const rear = prop.facing === 'rear';
      if (look >= 2) {
        const e = modelEntry('rattan_chair');
        const rotY = rear === (e.tall < 0) ? 0 : Math.PI;
        place(b, 'rattan_chair', cx, Y, cz, Math.min(w, d) - 0.02, 0.86, rotY);
        if (look >= 3) b.sphere(cx, Y + 0.51, cz, 0.05, C.hibiscus, 0, 0.4, { shade: 1, surface: 'fabric' });
        return true;
      }
      const backZ = rear ? r.z0 + 0.04 : r.z1 - 0.04;
      b.box(cx, Y + 0.44, cz, w - 0.06, 0.035, d - 0.06, C.drift, 0, { shade: 0.95, surface: 'wood' });
      for (const px of [r.x0 + 0.06, r.x1 - 0.06]) for (const pz of [r.z0 + 0.06, r.z1 - 0.06]) b.box(px, Y + 0.21, pz, 0.035, 0.42, 0.035, C.driftDark, 0, { shade: 0.85 });
      for (const px of [r.x0 + 0.06, r.x1 - 0.06]) b.box(px, Y + 0.66, backZ, 0.035, 0.44, 0.035, C.driftDark, 0, { shade: 0.85 });
      for (const dy of [0.56, 0.72]) b.box(cx, Y + dy, backZ, w - 0.15, 0.05, 0.025, C.drift, 0, { shade: 0.95 });
      return true;
    }
    case 'stool': {
      b.cylinder(cx, Y + 0.72, cz, Math.min(w, d) / 2 - 0.04, Math.min(w, d) / 2 - 0.04, 0.05, look >= 2 ? cushion : wood, 12, 'y', { shade: 0.95, surface: 'fabric' });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cane(b, cx + dx * (w / 2 - 0.08), Y + 0.35, cz + dz * (d / 2 - 0.08), 0.7, 'y', look === 1 ? C.driftDark : C.bamboo, 0.02);
      return true;
    }
    case 'domeSeat': {
      // The Beach Lounge: a hardwood deck chair with a striped canvas sling (art/blender/beach_kit.py), facing the sea
      // windows, at its true size (it leans a little past its spot front and back, as a deck chair does).
      const facing = prop.facing === 'left' ? -1 : 1;
      const e = modelEntry('deck_chair');
      const sc = Math.min(1.05, (d - 0.02) / (e.max[0] - e.min[0]));
      b.model('deck_chair', cx, Y + 0.006, cz, -facing * Math.PI / 2, sc, sc, sc, {
        recolor: [{ hue: [0, 18], sat: [0.55, 1], val: [0.7, 1], ref: '#E8604C', to: look >= 3 ? C.coral : look === 2 ? C.teal : '#D9C9A4' }],
        shade: 0.95,
        surface: 'fabric',
      });
      if (look >= 3) b.sphere(cx, Y + 0.42, cz + d * 0.18, 0.035, C.hibiscus, 0, 0.5, { shade: 1 });
      return true;
    }
    case 'plant':
    case 'planter': {
      // A monstera in a woven pot (a palm-leaf plant at Driftwood: the same model, smaller).
      const size = Math.min(w, d);
      place(b, 'monstera', cx, Y, cz, size, look === 1 ? 0.7 : 0.95);
      return true;
    }
    case 'coatStand': {
      // A tiki torch by the door (lit), where the countryside's cars keep a coat stand.
      place(b, 'tiki_torch', cx, Y, cz, Math.min(w, d), 1.5);
      const e = modelEntry('tiki_torch');
      const sc = 1.5 / (e.max[1] - e.min[1]);
      lamps.sphere(cx, Y + 1.5 - 0.06 * sc, cz, 0.045 * sc, C.flame, 0, 1.6);
      return true;
    }
    case 'wallBoard': {
      // A carved surfboard sign hung on the wall (the venue's name is the carriage's own; the board itself is the sign).
      const along = w >= d;
      const span = (along ? w : d) - 0.04;
      const e = modelEntry('surf_sign');
      const sc = span / (e.max[0] - e.min[0]);
      b.model('surf_sign', cx, Y + 0.62, cz, along ? 0 : Math.PI / 2, sc, sc, Math.min(1, (along ? d : w) / (e.max[2] - e.min[2])), { shade: 1, surface: 'paint' });
      return true;
    }
    case 'sideboard':
    case 'trolley': {
      // A low bamboo shelf: two plank shelves on canes, coconuts and a fruit bowl on top.
      const h = prop.kind === 'trolley' ? 0.78 : 0.86;
      for (const sy of [0.18, h]) b.box(cx, Y + sy, cz, w - 0.04, 0.03, d - 0.04, wood, 0, { shade: 0.95, surface: 'wood' });
      for (const px of [r.x0 + 0.04, r.x1 - 0.04]) for (const pz of [r.z0 + 0.04, r.z1 - 0.04]) cane(b, px, Y + h / 2, pz, h, 'y', look === 1 ? C.driftDark : C.bamboo, 0.018);
      const n = Math.max(1, Math.floor((d - 0.1) / 0.32));
      for (let i = 0; i < n; i++) {
        const pz = r.z0 + 0.05 + (d - 0.1) * ((i + 0.5) / n);
        if (i % 2 === 0) place(b, 'coconut_drink', cx, Y + h + 0.015, pz, Math.min(w, 0.22) - 0.02, 0.2);
        else b.sphere(cx, Y + h + 0.06, pz, 0.06, i % 4 === 1 ? '#F7C443' : '#E8604C', 1, 0.8, { shade: 1 });
      }
      // Fresh fruit on the lower shelf.
      for (let i = 0; i < n; i++) b.sphere(cx, Y + 0.24, r.z0 + 0.05 + (d - 0.1) * ((i + 0.5) / n), 0.05, i % 2 ? '#7DB451' : '#F7C443', 1, 0.8, { shade: 1 });
      return true;
    }
    case 'espresso': {
      // The smoothie bar: a row of blenders on a little stand, each a different fruit.
      const n = Math.max(1, Math.min(3, Math.floor(d / 0.22)));
      for (let i = 0; i < n; i++) place(b, 'blender', cx, Y + 0.92, r.z0 + d * ((i + 0.5) / n), Math.min(w, d / n) - 0.03, 0.34);
      b.box(cx, Y + 0.46, cz, w - 0.06, 0.92, d - 0.04, wood, 0, { shade: 0.85, surface: 'wood' });
      return true;
    }
    case 'counter': {
      // A bar counter: a wooden top on a front of upright bamboo canes; thatch along its front from Bamboo; leis at
      // Tiki Paradise. The top stays at the classic counter's height (0.95), where things are served.
      const out = prop.facing === 'right' ? 1 : -1;
      const front = out > 0 ? r.x1 : r.x0;
      const h = 0.92;
      b.box(cx, Y + h / 2, cz, w - 0.08, h, d - 0.04, woodDark, 0, { shade: 0.8, surface: 'wood' });
      b.box(cx, Y + h + 0.015, cz, w - 0.02, 0.03, d, wood, 0, { shade: 0.95, surface: 'wood' });
      const canes = Math.floor((d - 0.06) / 0.075);
      for (let i = 0; i < canes; i++) cane(b, front - out * 0.03, Y + (h - 0.04) / 2, r.z0 + 0.04 + i * 0.075, h - 0.04, 'y', look === 1 ? C.drift : i % 2 ? C.bamboo : C.bambooDark, 0.03);
      if (look >= 2) {
        const segs = Math.max(1, Math.round(d / 0.95));
        const e = modelEntry('thatch_strip');
        const th = e.max[1] - e.min[1];
        for (let i = 0; i < segs; i++) b.model('thatch_strip', front + out * 0.01, Y + h - th * 0.8, r.z0 + d * ((i + 0.5) / segs), Math.PI / 2, d / segs / 0.96 - 0.01, 0.8, 1, { shade: 0.95, surface: 'fabric' });
      }
      return true;
    }
    case 'sideTable':
    case 'table': {
      // A little bamboo side table with a coconut drink (the lounge's armrest table, a suite's lounge table).
      // A suite's lounge table stands on its rug (a few centimetres up), so its base never lies in the rug's face.
      const base = prop.kind === 'table' ? Y + 0.045 : Y;
      const h = prop.kind === 'table' ? 0.56 : 0.52;
      fit(b, 'bamboo_table', cx, base, cz, w - 0.04, d - 0.04, h);
      place(b, 'coconut_drink', cx, base + h, cz, Math.min(w, d) * 0.4, 0.18);
      return true;
    }
    case 'sofa': {
      // A rattan sofa with turquoise (Bamboo) or coral (Tiki Paradise) cushions, its back to the wall.
      const out = prop.facing === 'left' ? -1 : 1;
      const backX = out > 0 ? r.x0 + 0.08 : r.x1 - 0.08;
      b.box(cx, Y + 0.2, cz, w - 0.09, 0.32, d - 0.06, C.rattan, 0, { shade: 0.85, surface: 'fabric' });
      b.box(cx + out * 0.04, Y + 0.41, cz, w - 0.16, 0.1, d - 0.16, cushion, 0, { shade: 0.95, surface: 'fabric' });
      b.box(backX, Y + 0.56, cz, 0.1, 0.42, d - 0.06, C.rattan, 0, { shade: 0.85, surface: 'fabric' });
      for (const az of [r.z0 + 0.06, r.z1 - 0.06]) b.box(cx, Y + 0.48, az, w - 0.09, 0.24, 0.1, C.rattan, 0, { shade: 0.85, surface: 'fabric' });
      b.box(backX + out * 0.1, Y + 0.56, cz - d * 0.2, 0.08, 0.22, 0.26, C.linen, 0, { shade: 1, surface: 'fabric' });
      return true;
    }
    case 'bed': {
      if (prop.variant === 'bunk') return false;
      // A low island bed: a frame of driftwood or bamboo, white linen to the mattress line, a throw in the room's
      // colour; a woven headboard from Bamboo; at Tiki Paradise four bamboo posts with a muslin canopy and a hibiscus
      // lei along the foot. The head is at z0, as every bed (sleepers lie at BED_TOP).
      const frame = look >= 3 ? C.tiki : look === 2 ? C.bamboo : C.drift;
      b.box(cx, Y + 0.12, cz, w - 0.04, 0.2, d - 0.04, frame, 0, { shade: 0.85, surface: 'wood' });
      b.box(cx, Y + 0.31, cz + 0.02, w - 0.1, BED_TOP - 0.22, d - 0.12, C.linen, 0, { shade: 0.95, surface: 'fabric' });
      const pillows = w > 1.2 ? [-1, 1] : [0];
      for (const side of pillows) b.box(cx + side * (w / 4 - 0.04), Y + BED_TOP + 0.03, r.z0 + 0.24, w > 1.2 ? w / 2 - 0.16 : w - 0.3, 0.07, 0.24, C.muslin, 0, { shade: 0.95, surface: 'fabric' });
      b.box(cx, Y + BED_TOP - 0.005, r.z0 + d * 0.66, w - 0.06, 0.04, d * 0.6, theme.deep, 0, { shade: 0.9, surface: 'fabric' });
      b.box(cx, Y + BED_TOP + 0.016, r.z0 + d * 0.66, w - 0.06, 0.004, 0.05, '#FFFFFF', 0, { shade: 1, surface: 'fabric' });
      const hb = look >= 2 ? 0.62 : 0.36;
      b.box(cx, Y + 0.2 + hb / 2, r.z0 + 0.04, w - 0.08, hb, 0.06, look >= 2 ? C.rattan : frame, 0, { shade: 0.85, surface: 'fabric' });
      if (look >= 2) for (let i = 0; i < 6; i++) cane(b, r.x0 + 0.08 + (w - 0.16) * (i / 5), Y + 0.2 + hb / 2, r.z0 + 0.075, hb, 'y', C.bambooDark, 0.015);
      if (look >= 3) {
        const top = Y + 1.02;
        for (const px of [r.x0 + 0.05, r.x1 - 0.05]) for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) cane(b, px, (Y + top) / 2, pz, top - Y, 'y', C.bamboo, 0.025);
        for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) cane(b, cx, top, pz, w - 0.1, 'x', C.bamboo, 0.022);
        for (const px of [r.x0 + 0.05, r.x1 - 0.05]) cane(b, px, top, cz, d - 0.1, 'z', C.bamboo, 0.022);
        // Muslin gathered at each post.
        for (const px of [r.x0 + 0.08, r.x1 - 0.08]) for (const pz of [r.z0 + 0.08, r.z1 - 0.08]) b.box(px, Y + 0.7, pz, 0.05, 0.62, 0.05, C.muslin, 0, { shade: 1, surface: 'fabric' });
        for (let i = 0; i < 5; i++) b.sphere(r.x0 + 0.1 + (w - 0.2) * (i / 4), Y + 0.25, r.z1 - 0.02, 0.035, i % 2 ? C.hibiscus : '#F27BAA', 0, 0.8, { shade: 1 });
      }
      return true;
    }
    default:
      return false;
  }
}
