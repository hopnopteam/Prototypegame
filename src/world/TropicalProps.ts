import * as THREE from 'three';
import { ACTIVE_ROUTE } from '../config/routes';
import { isPassengerType } from '../config/classes';
import type { GeoBuilder } from './geo';
import { PATTERN } from './materials';
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
        // The Smoothie Bar: a coconut drink and a fruit plate on every table (a hibiscus at Tiki Paradise).
        if (type === 'cafe') {
          place(b, 'coconut_drink', cx + 0.08, Y + 0.75, cz - 0.1, 0.12, 0.16);
          b.cylinder(cx - 0.1, Y + 0.752, cz + 0.08, 0.08, 0.08, 0.008, '#F4F1E8', 14, 'y', { shade: 1, surface: 'ceramic' });
          for (const [dx, dz, c] of [[-0.12, 0.06, '#F7A23A'], [-0.08, 0.11, '#E2483C'], [-0.13, 0.12, '#8BCB4E']] as const) b.sphere(cx + dx, Y + 0.775, cz + dz, 0.025, c, 1, 1, { shade: 1 });
          if (look >= 3) place(b, 'hibiscus', cx + 0.02, Y + 0.752, cz + 0.12, 0.1, 0.03);
        }
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
    case 'lounger': {
      // The Pool Car: a slatted hardwood sun lounger with its back raised at the wall (art/blender/beach_kit.py), a
      // towel laid on it; dark teak at Tiki Paradise. Fitted to the spot (its head where the classic lounger's was).
      const out = prop.facing === 'right' ? 1 : -1;
      const e = modelEntry('sun_lounger');
      const sl = (w - 0.04) / (e.max[2] - e.min[2]);
      const sw = (d - 0.04) / (e.max[0] - e.min[0]);
      b.model('sun_lounger', cx, Y, cz, -out * Math.PI / 2, sw, 0.85, sl, {
        recolor: [{ hue: [15, 45], sat: [0.3, 1], val: [0.2, 0.75], ref: '#A8784C', to: look >= 3 ? C.tiki : look === 2 ? C.bamboo : C.drift }],
        shade: 0.95,
        surface: 'wood',
      });
      return true;
    }
    case 'play': {
      // The Kids' Play car (owner, 26 Nov, with a reference image: "make it exactly like that… make better models"):
      // each corner its own big play piece along the wall (art/blender/riviera_kit2.py), on soft foam or sand. Driftwood
      // keeps the first kit's simple wooden toys; Bamboo brings the big pieces; Tiki Paradise dresses them (lanterns,
      // palms, balls everywhere).
      const out = prop.facing === 'right' ? 1 : -1;
      const back = out > 0 ? r.x0 : r.x1;
      const front = out > 0 ? r.x1 : r.x0;
      const floor = Y + (look >= 2 ? 0.012 : 0);
      if (look === 1) {
        // Driftwood: the old toys, one to a corner, at the rear of it (where the child plays).
        const pz = r.z1 - 0.62;
        switch (prop.variant) {
          case 'tower': place(b, 'play_slide', cx, floor, pz, Math.min(w, 1.2) - 0.08, 1.0); break;
          case 'ballpit': place(b, 'toy_blocks', back + out * 0.35, floor, pz, 0.62, 0.36); break;
          case 'ship': place(b, 'toy_train', back + out * 0.45, floor, pz, Math.min(w, d) - 0.08, 0.16, Math.PI / 2); break;
          case 'sandpit': place(b, 'kids_table', back + out * 0.4, floor, pz, 0.92, 0.55); break;
          case 'swings': place(b, 'toy_shelf', back + out * 0.3, floor, pz, 0.85, 0.9, Math.PI / 2); break;
          case 'riders': place(b, 'pouf_woven', back + out * 0.4, floor, pz, 0.4, 0.34); break;
          default: return false;
        }
        return true;
      }
      const rich = look >= 3;
      switch (prop.variant) {
        case 'tower':
          // The thatched climbing tower against the wall at the rear, its slide running forward to the floor.
          place(b, 'play_tower', cx + out * 0.02, floor, cz, Math.min(d - 0.05, (w - 0.1) * 1.96 / 1.23), 1.85, Math.PI / 2);
          if (rich) place(b, 'kid_ball', front - out * 0.25, floor, r.z0 + 0.25, 0.24, 0.24);
          break;
        case 'ballpit':
          // The ball pit in its ring of rocks at the rear; beach balls and a palm in front of it.
          place(b, 'ball_pit', cx, floor, r.z1 - 0.62, Math.min(w, 1.2) - 0.04, 0.3);
          place(b, 'kid_ball', back + out * 0.35, floor, r.z0 + 0.45, 0.26, 0.26);
          place(b, 'palm_pot', back + out * 0.45, floor, r.z0 + 0.95, 0.78, rich ? 1.1 : 0.9);
          if (rich) place(b, 'kid_ball', front - out * 0.3, floor, r.z0 + 0.25, 0.2, 0.2);
          break;
        case 'ship':
          // The pirate ship along the wall, bow toward the front of the car.
          place(b, 'pirate_ship', back + out * 0.5, floor, cz - 0.15, Math.min(1.62, d - 0.4), 1.7, Math.PI);
          if (rich) place(b, 'palm_pot', back + out * 0.42, floor, r.z1 - 0.5, 0.72, 1.0);
          break;
        case 'sandpit': {
          // A sandpit in a timber frame with a sandcastle, a bucket and spade; a palm and a ball beside it.
          const fr = { x0: r.x0 + 0.06, z0: r.z1 - 1.18, x1: r.x1 - 0.06, z1: r.z1 - 0.06 };
          for (const [x0, z0, x1, z1] of [[fr.x0, fr.z0, fr.x1, fr.z0 + 0.06], [fr.x0, fr.z1 - 0.06, fr.x1, fr.z1], [fr.x0, fr.z0 + 0.06, fr.x0 + 0.06, fr.z1 - 0.06], [fr.x1 - 0.06, fr.z0 + 0.06, fr.x1, fr.z1 - 0.06]]) {
            b.slab({ x0, z0, x1, z1 }, floor, floor + 0.16, rich ? C.tiki : C.bamboo, 0, 0, { shade: 0.9, surface: 'wood' });
          }
          b.slab({ x0: fr.x0 + 0.06, z0: fr.z0 + 0.06, x1: fr.x1 - 0.06, z1: fr.z1 - 0.06 }, floor, floor + 0.11, '#E9D3A2', 0, 0, { shade: 1, detail: 'sand', surface: 'fabric' });
          place(b, 'sandcastle', back + out * 0.35, floor + 0.11, fr.z0 + 0.38, 0.5, 0.36);
          place(b, 'bucket_spade', front - out * 0.32, floor + 0.11, fr.z1 - 0.32, 0.32, 0.18);
          place(b, 'palm_pot', back + out * 0.45, floor, r.z0 + 0.42, 0.78, rich ? 1.1 : 0.9);
          if (rich) place(b, 'kid_ball', front - out * 0.28, floor, r.z0 + 0.7, 0.24, 0.24);
          break;
        }
        case 'swings':
          // Swings in a bamboo frame along the wall, leaves along the crossbar.
          place(b, 'swing_set', back + out * 0.47, floor, cz - 0.1, Math.min(1.75, d - 0.3), 1.6, Math.PI / 2);
          if (rich) place(b, 'palm_pot', back + out * 0.42, floor, r.z1 - 0.4, 0.72, 1.0);
          break;
        case 'riders':
          // A dolphin and a crab on springs, a palm between them.
          place(b, 'spring_dolphin', cx, floor, r.z1 - 0.45, 0.55, 0.6, out > 0 ? -Math.PI / 2 : Math.PI / 2);
          place(b, 'spring_crab', cx, floor, r.z0 + 0.5, 0.62, 0.45, out > 0 ? -Math.PI / 2 : Math.PI / 2);
          place(b, 'palm_pot', back + out * 0.42, floor, cz - 0.05, 0.72, rich ? 1.05 : 0.85);
          if (rich) place(b, 'kid_ball', front - out * 0.2, floor, cz + 0.15, 0.2, 0.2);
          break;
        default:
          return false;
      }
      if (rich && out > 0) {
        // Tiki Paradise: a lantern post at the corner's front on the lake side (on the near side it would stand
        // between the camera and the floor).
        place(b, 'lantern_post', front - out * 0.08, floor, r.z0 + 0.08, 0.6, 1.25, Math.PI);
      }
      return true;
    }
    case 'beachDecor': {
      // The Beach Lounge (owner's reference: a whole beach in a carriage): what stands on the sand round the loungers.
      const floor = Y + 0.02;
      switch (prop.variant) {
        case 'umbrella':
          // A rainbow umbrella over the heads of a pair of loungers, its pole by the wall.
          place(b, 'rainbow_umbrella', cx - 0.32, floor, cz, 0.8, 1.25);
          break;
        case 'lagoon': {
          // Rocks round the lagoon's rim (the water is the view's), shells and a starfish on the sand by it.
          const rim: [number, number, number][] = [[r.x1 - 0.05, r.z0 + 0.2, 0.5], [r.x1 - 0.02, r.z0 + 1.6, 0.38], [r.x1 - 0.06, r.z1 - 1.5, 0.45], [r.x1 - 0.04, r.z1 - 0.22, 0.55], [cx - 0.2, r.z0 + 0.02, 0.42], [cx + 0.1, r.z1 - 0.02, 0.48], [r.x0 + 0.24, cz - 1.1, 0.36]];
          rim.forEach(([x, z, size], i) => place(b, 'beach_rocks', x, Y, z, size, size * 0.42, i * 1.3));
          place(b, 'starfish', r.x1 + 0.12, floor, cz - 0.6, 0.12, 0.02, 0.6);
          place(b, 'shells', r.x1 + 0.1, floor, cz + 0.9, 0.18, 0.04, 1.2);
          if (look >= 3) place(b, 'palm_pot', r.x0 + 0.5, Y, r.z1 - 0.45, 0.8, 1.2);
          break;
        }
        case 'net':
          // A volleyball net down the lake side, a ball on the sand by it.
          place(b, 'volley_net', cx, floor, cz, d - 0.05, 1.05, Math.PI / 2);
          place(b, 'kid_ball', r.x1 - 0.12, floor, r.z0 + 0.3, 0.2, 0.2);
          break;
        case 'surfboards':
          // Two boards stood against the wall by the door.
          place(b, 'surfboard', cx - 0.02, floor, r.z0 + 0.22, 1.2, 1.25, Math.PI / 2);
          place(b, 'surfboard', cx + 0.03, floor, r.z1 - 0.22, 1.2, 1.15, Math.PI / 2 + 0.2);
          break;
        case 'towel':
        case 'towelB': {
          // A beach towel laid out flat: a colour with white stripes across it, a pair of flip-flops by it.
          const base = prop.variant === 'towel' ? '#F28C6B' : '#3FA9D8';
          const t = floor + 0.004;
          b.slab({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }, t, t + 0.006, base, 0, 0, { shade: 1, surface: 'fabric', detail: 'fabric' });
          for (const k of [0.22, 0.5, 0.78]) b.slab({ x0: r.x0 + 0.01, z0: r.z0 + d * k - 0.03, x1: r.x1 - 0.01, z1: r.z0 + d * k + 0.03 }, t + 0.01, t + 0.011, '#FBF7EE', 0, 0, { shade: 1, surface: 'fabric' });
          break;
        }
        case 'lights': {
          // String lights along the window tops: a dark cord and warm bulbs every half metre.
          const x = r.x0 + 0.02;
          b.box(x, Y + 1.08, cz, 0.012, 0.012, d, '#3A2A22', 0, { shade: 1 });
          for (let z = r.z0 + 0.15; z < r.z1; z += 0.5) {
            const sag = 0.05 * Math.sin(((z - r.z0) / 0.5) * Math.PI) ** 2;
            lamps.sphere(x + 0.03, Y + 1.03 - sag, z, 0.028, '#FFE2A8', 0, 1.5);
          }
          break;
        }
        case 'tikibar':
          // A thatched tiki bar at the back of the beach.
          place(b, 'tiki_bar', cx, Y, cz, Math.min(w, d) - 0.02, 1.6, Math.PI / 2);
          break;
        default:
          return false;
      }
      return true;
    }
    case 'pouf':
      place(b, 'pouf_woven', cx, Y, cz, Math.min(w, d) - 0.02, 0.34);
      return true;
    case 'puppetTheatre': {
      // A thatched bamboo puppet hut with striped curtains, its stage facing the room.
      const out = prop.facing === 'right' ? 1 : -1;
      const e = modelEntry('puppet_hut');
      b.model('puppet_hut', cx, Y, cz, out > 0 ? 0 : Math.PI, (w - 0.02) / (e.max[0] - e.min[0]), 1, (d - 0.02) / (e.max[2] - e.min[2]), { shade: 0.95, surface: 'wood' });
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
      if (type === 'cafe') {
        // The Smoothie Bar (owner's reference): its counter top busy with the bar's things between the blenders and the
        // gelato: a juice dispenser by the serving place, fruit bowls, a row of smoothie cups, coconuts at Tiki Paradise,
        // a flower garland along its front.
        const top = Y + h + 0.03;
        const back = out > 0 ? r.x0 : r.x1;
        const mid = (front + back) / 2;
        // Seen from the camera the bar is its top and its back: a pale bamboo top with a teal tile strip along it.
        b.box(cx, Y + h + 0.032, cz, w - 0.06, 0.006, d - 0.04, C.bamboo, 0, { shade: 1, surface: 'wood', detail: 'wood' });
        b.box(back + out * 0.12, Y + h + 0.037, cz, 0.1, 0.006, d - 0.1, C.teal, 0, { shade: 1, surface: 'ceramic' });
        fit(b, 'juice_dispenser', mid, top, r.z0 + d * 0.47, 0.2, 0.52, 0.38, Math.PI / 2);
        place(b, 'fruit_bowl', mid, top, r.z0 + d * 0.6, 0.36, 0.26);
        place(b, 'cup_row', mid, top, r.z0 + d * 0.88, 0.36, 0.22, Math.PI / 2);
        if (look >= 3) {
          place(b, 'coconut_drink', mid - out * 0.12, top, r.z0 + d * 0.36, 0.14, 0.18);
          place(b, 'coconut_drink', mid + out * 0.1, top, r.z0 + d * 0.38, 0.14, 0.18);
          const leis = Math.max(1, Math.floor(d / 1.1));
          for (let i = 0; i < leis; i++) place(b, 'lei', front + out * 0.02, Y + h - 0.26, r.z0 + d * ((i + 0.5) / leis), 1.0, 0.25, Math.PI / 2);
        }
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
    case 'pastryCase': {
      if (type !== 'cafe') return false;
      // The Smoothie Bar's gelato: a glass-topped cabinet on the counter, tubs of colour inside.
      const top = Y + 0.95;
      b.box(cx, top + 0.09, cz, w - 0.12, 0.18, d - 0.06, look >= 3 ? C.tiki : look === 2 ? C.bamboo : C.drift, 0, { shade: 0.9, surface: 'wood' });
      const tubs = Math.max(2, Math.floor((d - 0.1) / 0.2));
      const flavours = ['#F7C8D8', '#F7E3A1', '#C9E8B0', '#F2B28C', '#B8DCEF', '#E9D2F0'];
      for (let i = 0; i < tubs; i++) {
        const pz = r.z0 + 0.05 + (d - 0.1) * ((i + 0.5) / tubs);
        b.box(cx, top + 0.19, pz, (w - 0.2) * 0.8, 0.03, (d - 0.1) / tubs - 0.03, flavours[i % flavours.length], 0, { shade: 1, surface: 'fabric' });
      }
      b.box(cx, top + 0.24, cz, w - 0.14, 0.012, d - 0.08, '#DDEFF2', 0, { shade: 1, surface: 'glass' });
      return true;
    }
    case 'pastries': {
      if (type !== 'cafe') return false;
      // Gelato cones and sundaes stood along the cabinet, ready to hand over.
      const top = Y + 0.95 + 0.25;
      const n = Math.max(2, Math.floor(d / 0.28));
      for (let i = 0; i < n; i++) place(b, i % 2 ? 'sundae' : 'ice_cream', cx, top, r.z0 + d * ((i + 0.5) / n), 0.16, i % 2 ? 0.2 : 0.16);
      return true;
    }
    case 'spaDecor': {
      // The spa's dressing (owner: "way too empty… lighten up the mood"), fuller with each tier.
      const out = prop.facing === 'right' ? 1 : -1;
      switch (prop.variant) {
        case 'zen': {
          // A zen corner beside the fountain: an orchid and candles, then a bamboo screen, a stone basin and a raked
          // tray, a palm and a lantern at Tiki.
          const across = Math.abs(r.x1 - r.x0) / 2;
          const wallX = out > 0 ? r.x0 : r.x1;
          place(b, 'orchid', wallX + out * 0.26, Y, r.z0 + 0.32, 0.5, 0.75);
          place(b, 'candles', cx + out * 0.15, Y, r.z1 - 0.35, 0.46, 0.26);
          if (look >= 2) {
            place(b, 'bamboo_screen', wallX + out * 0.07, Y, cz + 0.1, d - 0.3, 1.55, Math.PI / 2);
            place(b, 'stone_basin', cx + out * 0.14, Y, cz, Math.min(across * 1.7, 0.72), 0.62);
            place(b, 'zen_tray', cx + out * 0.26, Y, r.z0 + 0.34, 0.55, 0.16);
          } else {
            place(b, 'spa_plant', cx, Y, cz, 0.72, 1.0);
          }
          if (look >= 3) {
            place(b, 'palm_pot', wallX + out * 0.28, Y, r.z1 - 0.26, 0.6, 1.6);
            lamps.sphere(cx + out * 0.15, Y + 0.24, r.z1 - 0.35, 0.03, C.flame, 0, 1.4);
          }
          return true;
        }
        case 'shelf': {
          // A bamboo shelf of rolled towels with a fern on top; a monstera beside it from Bamboo, an orchid at Tiki.
          const h = 0.82;
          const sw = Math.min(w - 0.1, 0.5);
          const sx = (out > 0 ? r.x0 : r.x1) + out * (sw / 2 + 0.04);
          for (const sy of [0.2, 0.5, h]) b.box(sx, Y + sy, r.z0 + 0.5, sw, 0.03, 0.8, wood, 0, { shade: 0.95, surface: 'wood' });
          for (const px of [sx - sw / 2 + 0.03, sx + sw / 2 - 0.03]) for (const pz of [r.z0 + 0.13, r.z0 + 0.87]) cane(b, px, Y + h / 2, pz, h, 'y', look === 1 ? C.driftDark : C.bamboo, 0.018);
          place(b, 'towel_stack', sx, Y + 0.215, r.z0 + 0.5, Math.min(sw, 0.7) - 0.04, 0.26);
          place(b, 'towel_stack', sx, Y + 0.515, r.z0 + 0.5, Math.min(sw, 0.7) - 0.04, 0.26);
          place(b, 'spa_plant', sx, Y + h + 0.015, r.z0 + 0.5, 0.3, 0.36);
          if (look >= 2) place(b, 'monstera', cx, Y, r.z1 - 0.4, 0.78, 1.25);
          if (look >= 3) place(b, 'orchid', sx, Y + 0.515, r.z0 + 0.82, 0.18, 0.28);
          return true;
        }
        case 'path': {
          // Pale stepping stones down the aisle, flush with the floor.
          const sy = Y + 0.03;
          for (let z = r.z0 + 0.35, i = 0; z < r.z1 - 0.2; z += 0.62, i++) {
            b.cylinder(cx + (i % 2 ? 0.05 : -0.05), sy + 0.008, z, 0.2, 0.2, 0.012, look >= 3 ? '#FFFFFF' : '#F8F6F0', 14, 'y', { shade: 1.25, surface: 'stone' });
          }
          return true;
        }
        case 'lights':
          // String lights along the window tops, as on the beach.
          b.box(r.x0 + 0.02, Y + 1.08, cz, 0.012, 0.012, d, '#3A2A22', 0, { shade: 1 });
          for (let z = r.z0 + 0.15; z < r.z1; z += 0.5) {
            const sag = 0.05 * Math.sin(((z - r.z0) / 0.5) * Math.PI) ** 2;
            lamps.sphere(r.x0 + 0.05, Y + 1.03 - sag, z, 0.028, look >= 3 ? '#FFD8E4' : '#FFE2A8', 0, 1.5);
          }
          return true;
        default:
          return false;
      }
    }
    case 'barDecor': {
      // The Smoothie Bar's dressing (the owner's reference).
      switch (prop.variant) {
        case 'sign':
          // Its sign on the front wall over the bar's end, turned to the camera a little.
          place(b, 'smoothie_sign', cx, Y + 0.62, cz, Math.min(w, 0.95), 0.62);
          break;
        case 'menu':
          // A chalk menu on an easel, by the lake-side dresser.
          place(b, 'chalk_menu', cx, Y, cz, Math.min(w, d), 1.1, Math.PI / 2);
          break;
        case 'backbar': {
          // A bamboo back bar against the wall behind the counter: two shelves of bottles, coconuts and fruit.
          const h = 1.42;
          for (const pz of [r.z0 + 0.04, r.z1 - 0.04]) cane(b, cx, Y + h / 2, pz, h, 'y', look === 1 ? C.driftDark : C.bamboo, 0.022);
          for (const sy of [1.12, 1.38]) {
            b.box(cx, Y + sy, cz, w, 0.025, d, wood, 0, { shade: 0.95, surface: 'wood' });
            const n = Math.floor((d - 0.1) / 0.14);
            for (let i = 0; i < n; i++) {
              const pz = r.z0 + 0.07 + (d - 0.1) * ((i + 0.5) / n);
              const kind = (i + Math.round(sy * 10)) % 4;
              if (kind === 3) b.sphere(cx, Y + sy + 0.055, pz, 0.05, '#6B4A2E', 1, 1, { shade: 1 });
              else b.cylinder(cx, Y + sy + 0.075, pz, 0.025, 0.025, 0.13, ['#F7A23A', '#F27BA8', '#8BCB4E'][kind], 8, 'y', { shade: 1, surface: 'glass' });
            }
          }
          break;
        }
        case 'stream': {
          // A little stream of clear water down the middle of the floor under glass, pebbles along its banks.
          // Over the rug (laid at the floor's room height), so it shows.
          const sy = Y + 0.03;
          b.slab(r, sy, sy + 0.006, '#7FCFDC', 0, 0, { shade: 1, surface: 'glass' });
          b.slab({ x0: r.x0 + 0.06, z0: r.z0 + 0.04, x1: r.x1 - 0.06, z1: r.z1 - 0.04 }, sy + 0.009, sy + 0.011, '#B8EBF0', 0, 0, { shade: 1, pattern: PATTERN.stripesZ, color2: '#7FCFDC', scale: 0.12, surface: 'glass' });
          const n = Math.floor(d / 0.22);
          for (let i = 0; i < n; i++) for (const ex of [r.x0, r.x1]) b.sphere(ex, sy + 0.012, r.z0 + (i + 0.5) * (d / n), 0.03 + (i % 3) * 0.006, i % 2 ? '#CFC7B8' : '#9F978A', 1, 0.5, { shade: 1 });
          break;
        }
        default:
          return false;
      }
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
        // The owner (26 Nov): "Tiki Paradise rooms have genuinely no upgrade vibe… make them feel more upgraded and
        // class". Muslin drapes gathered at each post with a gold tie, a valance along the canopy, paper lanterns lit
        // at the foot posts, a throw in hibiscus and gold, a towel swan in a ring of petals, with the class's ottoman and champagne at its foot.
        for (const px of [r.x0 + 0.08, r.x1 - 0.08]) for (const pz of [r.z0 + 0.08, r.z1 - 0.08]) {
          b.rounded(px, Y + 0.64, pz, 0.11, 0.64, 0.11, 0.04, C.muslin, { shade: 1, surface: 'fabric' });
          b.cylinder(px, Y + 0.6, pz, 0.068, 0.068, 0.03, '#D9B45A', 10, 'y', { shade: 1, surface: 'brass' });
        }
        for (const pz of [r.z0 + 0.05, r.z1 - 0.05]) b.box(cx, top - 0.085, pz, w - 0.12, 0.11, 0.018, C.muslin, 0, { shade: 1, surface: 'fabric' });
        for (const px of [r.x0 + 0.05, r.x1 - 0.05]) b.box(px, top - 0.075, cz, 0.018, 0.1, d - 0.16, C.muslin, 0, { shade: 1, surface: 'fabric' });
        for (const px of [r.x0 + 0.05, r.x1 - 0.05]) {
          b.cylinder(px, top - 0.2, r.z1 - 0.05, 0.004, 0.004, 0.14, '#3A2A22', 4, 'y', { shade: 1 });
          lamps.sphere(px, top - 0.31, r.z1 - 0.05, 0.06, '#FFD9A0', 0, 1.4);
        }
        b.box(cx, Y + BED_TOP + 0.02, r.z0 + d * 0.66, w - 0.05, 0.006, d * 0.56, C.hibiscus, 0, { shade: 1, pattern: PATTERN.stripesX, color2: '#F4D58A', scale: 0.16, surface: 'fabric' });
        const sz = r.z0 + d * 0.72;
        for (const side of [-1, 1]) {
          b.rounded(cx + side * 0.07, Y + BED_TOP + 0.07, sz, 0.12, 0.08, 0.2, 0.04, '#FFFFFF', { shade: 1, surface: 'fabric' });
          b.add(new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI).rotateY(Math.PI / 2), '#FFFFFF', cx + side * 0.035, Y + BED_TOP + 0.14, sz - 0.06, 0, 0, 0, { shade: 1, surface: 'fabric' });
        }
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          b.sphere(cx + Math.cos(a) * 0.2, Y + BED_TOP + 0.03, sz + Math.sin(a) * 0.24, 0.022, i % 2 ? C.hibiscus : '#F27BAA', 0, 0.35, { shade: 1 });
        }
        for (let i = 0; i < 5; i++) b.sphere(r.x0 + 0.1 + (w - 0.2) * (i / 4), Y + 0.25, r.z1 - 0.02, 0.035, i % 2 ? C.hibiscus : '#F27BAA', 0, 0.8, { shade: 1 });
      }
      return true;
    }
    default:
      return false;
  }
}
