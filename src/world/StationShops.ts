import { FLOOR_Y } from './CarriageView';
import type { GeoBuilder } from './geo';
import { PLATFORM_X0 } from './layout';
import { BAYS } from './platformLayout';
import { PATTERN } from './materials';
import { PALETTE } from './palette';
import { modelEntry, type ModelId, type Recolor } from './models/library';
import type { CharacterLook } from './CharacterView';
import type { Rect } from '../core/types';

/**
 * Session 57 (the owner's Station Picks 2: "it should have some pre-made shops… places… people roaming around"): the
 * booking office, the fruit barrow and the station's own shops (coffee, flowers, ice cream, a bakery, a shoeshine pitch,
 * a parcels office), each in its own bay of the back lane against the railing, its goods toward the walkway and its
 * keeper behind them. All CC0 models (Tiny Treats, KayKit, Kenney; credits in assets/models/CREDITS.md).
 */

const X = PLATFORM_X0;
/** The forecourt grass's top past the railing (PlatformView's `buildForecourt`). */
const FORECOURT_TOP = 0.15;
/** The back lane's middle (it runs 6.2 to 7.6 m out); a shop's goods stand a little toward the walkway. */
const GOODS_X = X + 6.85;
/** Where each keeper stands, between the goods and the railing. */
const KEEPER_X = X + 7.42;
/** A market umbrella's pole on the walkway side of its bay, so its canopy never hides the goods from the camera. */
const UMBRELLA_X = X + 6.3;

/** Tiny Treats' panelled walls: the panelling (warm wood in the model) in the office's paint, the frames left cream. */
function panelPaint(to: string): Recolor[] {
  return [{ hue: [0, 45], sat: [0.18, 1], val: [0.1, 1], ref: '#B8774F', to }];
}
const ROOF_PAINT = (to: string): Recolor[] => [{ hue: [0, 360], sat: [0, 1], val: [0, 1], ref: '#B8774F', to }];

/** Fits a model to a height (uniform scale), standing on y. */
function fit(b: GeoBuilder, id: ModelId, x: number, y: number, z: number, height: number, rotY = 0, recolor: Recolor[] = [], shade = 0.9): void {
  const e = modelEntry(id);
  const s = height / (e.max[1] - e.min[1]);
  b.model(id, x, y, z, rotY, s, s, s, { recolor, surface: 'matte', shade });
}

/** A model's height once fitted (`fit`) to a footprint length along its own x. */
function along(id: ModelId, length: number): number {
  const e = modelEntry(id);
  return length / (e.max[0] - e.min[0]);
}

/**
 * The booking office (Ticket Office upgrade): Tiny Treats' bakery walls round the ticket counter, two big windows on the
 * train side (the ticket window the queue stands at), a small window at each end, open at the back where the clerk
 * stands so the camera sees in, under a plank roof that stops short of the clerk's head. `r` is the counter's rect.
 */
export function buildBookingOffice(b: GeoBuilder, r: Rect, panel: string = PALETTE.navy, roof = '#4E5D7E'): void {
  const y = FLOOR_Y;
  const cz = (r.z0 + r.z1) / 2;
  const s = 0.45; // a 2 m by 4 m panel becomes 0.9 m by 1.8 m
  const wallX = r.x0 - 0.1;
  const depth = 0.9;
  // The end walls stand a hair inside the front walls' outer face (a shared face would flicker).
  const sideX = wallX - 0.06 + depth / 2;
  b.object('platform:bookingOffice');
  for (const dz of [-0.45, 0.45]) b.model('wall_window', wallX, y, cz + dz, Math.PI / 2, s, s, s, { recolor: panelPaint(panel), surface: 'paint', shade: 0.85 });
  for (const ez of [r.z0 - 0.13, r.z1 + 0.13]) b.model('wall_window_small', sideX, y, ez, 0, s, s, s, { recolor: panelPaint(panel), surface: 'paint', shade: 0.85 });
  // The roof: Tiny Treats' plank floor laid flat over the walls, a little overhang all round.
  const len = r.z1 - r.z0 + 0.36;
  b.model('floor_planks', sideX - 0.02, y + 1.8, cz, 0, (depth + 0.16) / 2, 0.22, len / 2, { recolor: ROOF_PAINT(roof), surface: 'paint', shade: 1 });
  b.endObject();
}

/**
 * The Fruit Kiosk (session 57, replacing the red stall that looked like the ticket office): a greengrocer's barrow,
 * Tiny Treats' red wagon with two of Kenney's fruit stands on its bed, a watermelon's worth of colour, and KayKit's
 * green market umbrella on the walkway side.
 */
export function buildFruitBarrow(b: GeoBuilder, p: { x: number; z: number }): void {
  const y = FLOOR_Y;
  b.object('platform:fruitBarrow');
  const ws = along('wagon', 0.62);
  b.model('wagon', p.x, y, p.z, 0, ws, ws, ws, { surface: 'paint', shade: 0.9 });
  const bed = y + (modelEntry('wagon').top ?? 0.7) * ws - 0.03;
  b.endObject();
  b.object('platform:fruitBarrowGoods');
  for (const dz of [-0.28, 0.28]) fit(b, 'fruit_stand', p.x, bed, p.z + dz, 0.42, dz > 0 ? Math.PI / 2 : 0);
  b.endObject();
  b.object('platform:fruitUmbrella');
  fit(b, 'umbrella_green', UMBRELLA_X, y, p.z, 1.95);
  b.endObject();
}

export interface Shop {
  /** Its bay along the back lane (z range, platform-local). */
  z0: number;
  z1: number;
  /** Its keeper, if anyone tends it, and where they stand. */
  /** Its name in the geometry audit (`platform:<id>`; its keeper is `character:keeper-<id>`). */
  id: string;
  keeper?: { look: CharacterLook; x: number; z: number; idles: readonly ('look' | 'watch' | 'phone' | 'read' | 'stamp' | 'wave')[] };
}

const BAKER: CharacterLook = { body: '#F6F1E6', accent: '#D9A3A3', skin: '#E8B894', hair: '#6B4226', pants: '#5B4A3A', hat: 'none', arms: true };
const BARISTA: CharacterLook = { body: '#3F5E4A', accent: '#E8D9B8', skin: '#C98E66', hair: '#2E211A', pants: '#2F2A28', hat: 'none', arms: true };
const ICE_CREAM: CharacterLook = { body: '#F4EEE2', accent: '#7FB6D9', skin: '#F1C7A6', hair: '#C9A06A', pants: '#3F5878', hat: 'cap', hatColor: '#7FB6D9', arms: true };
const FLOWER_GIRL: CharacterLook = { body: '#B9D7A6', accent: '#E8A3B8', skin: '#F1C7A6', hair: '#8A4B2A', pants: '#6E5A8A', hat: 'none', arms: true };
const SHOESHINE: CharacterLook = { body: '#6B4A3A', accent: '#D9B25A', skin: '#8D5A3C', hair: '#1E1612', pants: '#3A3430', hat: 'cap', hatColor: '#3A3430', arms: true };
const PARCELS: CharacterLook = { body: '#5A3C30', accent: '#E2B653', skin: '#E8B894', hair: '#9C9C9C', pants: '#3A3430', hat: 'cap', hatColor: '#2F3E5C', arms: true };

/**
 * The station's own shops, built with the platform (they are there from the first stop; no upgrade). Each is built only
 * when its bay lies on the platform (`zMax`: a short train's platform is short). Their footprints go to `block`.
 */
export function buildShops(b: GeoBuilder, zMax: number, block: (r: Rect) => void): Shop[] {
  const shops: Shop[] = [];
  const y = FLOOR_Y;
  const mid = (bay: readonly [number, number]): number => (bay[0] + bay[1]) / 2;
  const fits = (bay: readonly [number, number]): boolean => bay[1] < zMax - 0.5;
  const solid = (z0: number, z1: number, x0 = X + 6.25, x1 = X + 7.5): void => block({ x0, z0, x1, z1 });

  // The coffee cart: Tiny Treats' little cupboard counter with the café's espresso machine, takeaway cups and a kettle.
  if (fits(BAYS.coffee)) {
    const z = mid(BAYS.coffee);
    b.object('platform:coffeeCart');
    const cs = along('cupboard_small', 0.7);
    b.model('cupboard_small', GOODS_X, y, z, -Math.PI / 2, cs, cs * 0.95, cs, { surface: 'paint', shade: 0.85 });
    const top = y + 1.5 * cs * 0.95;
    fit(b, 'espresso', GOODS_X + 0.05, top, z - 0.18, 0.36, -Math.PI / 2);
    fit(b, 'takeaway_stack', GOODS_X - 0.1, top, z + 0.2, 0.22);
    fit(b, 'kettle', GOODS_X + 0.12, top, z + 0.26, 0.17, -Math.PI / 2);
    fit(b, 'umbrella_yellow', UMBRELLA_X, y, z - 0.35, 1.95);
    b.endObject();
    solid(z - 0.55, z + 0.55);
    shops.push({ id: 'coffee', z0: BAYS.coffee[0], z1: BAYS.coffee[1], keeper: { look: BARISTA, x: KEEPER_X, z: z + 0.15, idles: ['look', 'watch'] } });
  }

  // The flower seller: a wagon heaped with flowers and two wicker baskets of blooms beside it.
  if (fits(BAYS.flowers)) {
    const z = mid(BAYS.flowers);
    b.object('platform:flowerCart');
    const ws = along('wagon', 0.56);
    b.model('wagon', GOODS_X, y, z - 0.15, 0, ws, ws, ws, { recolor: [{ hue: [340, 20], sat: [0.4, 1], ref: '#D2402A', to: '#3F7A5E' }], surface: 'paint', shade: 0.9 });
    const bed = y + (modelEntry('wagon').top ?? 0.7) * ws - 0.02;
    for (let i = 0; i < 6; i++) fit(b, i % 2 ? 'flower_blue' : 'flower_white', GOODS_X - 0.12 + (i % 2) * 0.24, bed, z - 0.55 + Math.floor(i / 2) * 0.3, 0.13, i);
    for (const [dz, id] of [[0.55, 'basket_round'], [0.75, 'basket_long']] as const) {
      const bx = GOODS_X + (id === 'basket_round' ? -0.25 : 0.2);
      fit(b, id, bx, y, z + dz, 0.12);
      fit(b, dz > 0.6 ? 'flower_blue' : 'flower_white', bx, y + 0.06, z + dz, 0.12, dz);
    }
    b.endObject();
    solid(z - 0.85, z + 0.95, X + 6.4);
    shops.push({ id: 'flowers', z0: BAYS.flowers[0], z1: BAYS.flowers[1], keeper: { look: FLOWER_GIRL, x: KEEPER_X, z: z + 0.1, idles: ['look', 'wave'] } });
  }

  // The ice-cream cart: Kenney's chest freezer, cones, a sundae and a lolly on its lid, a striped parasol.
  if (fits(BAYS.icecream)) {
    const z = mid(BAYS.icecream);
    b.object('platform:iceCream');
    b.model('freezer', GOODS_X, y, z, Math.PI / 2, 1.5, 2.1, 1.3, { surface: 'paint', shade: 0.85 });
    const top = y + 0.34 * 2.1;
    fit(b, 'ice_cream', GOODS_X - 0.12, top, z - 0.32, 0.2);
    fit(b, 'sundae', GOODS_X - 0.1, top, z + 0.02, 0.18);
    fit(b, 'lolly', GOODS_X - 0.12, top, z + 0.3, 0.16, 0.6);
    fit(b, 'parasol', UMBRELLA_X, y, z - 0.2, 1.9);
    b.endObject();
    solid(z - 0.65, z + 0.65);
    shops.push({ id: 'icecream', z0: BAYS.icecream[0], z1: BAYS.icecream[1], keeper: { look: ICE_CREAM, x: KEEPER_X, z: z + 0.1, idles: ['look', 'wave'] } });
  }

  // The bakery: Tiny Treats' long glass case with two cake stands on it, loaves and a basket of baguettes in front.
  if (fits(BAYS.bakery)) {
    const z = mid(BAYS.bakery);
    b.object('platform:bakery');
    const ds = along('display_case_long', 1.4);
    b.model('display_case_long', GOODS_X + 0.05, y, z, Math.PI / 2, ds, ds * 0.72, ds, { surface: 'varnish', shade: 0.85 });
    const top = y + 1.55 * ds * 0.72;
    fit(b, 'cake_stand', GOODS_X + 0.05, top, z - 0.35, 0.22);
    fit(b, 'cake_stand_b', GOODS_X + 0.05, top, z + 0.35, 0.3);
    fit(b, 'basket_long', GOODS_X - 0.55, y, z - 0.45, 0.11, Math.PI / 2);
    for (const dz of [-0.53, -0.37]) {
      const e = modelEntry('baguette');
      const s = 0.36 / (e.max[2] - e.min[2]);
      b.model('baguette', GOODS_X - 0.55, y + 0.08, z + dz, 0.2, s, s, s, { surface: 'matte', shade: 0.95 });
    }
    fit(b, 'bread', GOODS_X - 0.55, y, z + 0.45, 0.14, 0.4);
    fit(b, 'umbrella_pink', UMBRELLA_X - 0.15, y, z + 0.1, 1.95);
    b.endObject();
    solid(z - 0.75, z + 0.75, X + 6.05);
    shops.push({ id: 'bakery', z0: BAYS.bakery[0], z1: BAYS.bakery[1], keeper: { look: BAKER, x: KEEPER_X, z: z - 0.1, idles: ['look', 'watch'] } });
  }

  // The shoeshine pitch: KayKit's red wing chair up on a box, a footstool for the shoe, boots waiting, polish tins.
  if (fits(BAYS.shoeshine)) {
    const z = mid(BAYS.shoeshine);
    b.object('platform:shoeshine');
    b.model('box_large', GOODS_X + 0.25, y, z, 0, 2.0, 1.8, 1.7, { surface: 'wood', shade: 0.85 });
    fit(b, 'wing_chair', GOODS_X + 0.25, y + 0.45, z, 0.82, -Math.PI / 2);
    fit(b, 'footstool', GOODS_X - 0.4, y, z, 0.22);
    fit(b, 'boots', GOODS_X - 0.45, y, z + 0.55, 0.16, -0.4, [{ hue: [30, 70], sat: [0.3, 1], ref: '#E8C34A', to: '#5A3C30' }]);
    fit(b, 'tin_brown', GOODS_X - 0.35, y, z - 0.5, 0.09);
    fit(b, 'tin_grey', GOODS_X - 0.22, y, z - 0.62, 0.07);
    b.endObject();
    solid(z - 0.6, z + 0.6, X + 6.15);
    shops.push({ id: 'shoeshine', z0: BAYS.shoeshine[0], z1: BAYS.shoeshine[1], keeper: { look: SHOESHINE, x: GOODS_X - 0.6, z: z - 1.0, idles: ['look', 'wave'] } });
  }

  // The parcels office: the booking office's walls in chocolate and cream, its window to the walkway, a pair of scales
  // and parcels on the counter, more parcels and the sack truck outside.
  if (fits(BAYS.parcels)) {
    const z = mid(BAYS.parcels);
    const r = { x0: X + 6.65, z0: z - 0.8, x1: X + 7.2, z1: z + 0.8 };
    buildBookingOffice(b, r, '#5A3C30', '#6A7385');
    b.object('platform:parcelsCounter');
    b.model('counter', (r.x0 + r.x1) / 2, y, z, Math.PI / 2, 0.8, 0.98, (r.x1 - r.x0) / 1.5, { surface: 'varnish', shade: 0.85 });
    fit(b, 'scales', (r.x0 + r.x1) / 2, y + 0.98, z - 0.35, 0.24, -Math.PI / 2);
    fit(b, 'parcel', (r.x0 + r.x1) / 2, y + 0.98, z + 0.3, 0.2, 0.2);
    b.endObject();
    b.object('platform:parcelsOutside');
    fit(b, 'parcel', X + 5.95, y, z - 1.15, 0.3, 0.1);
    fit(b, 'parcel', X + 5.95, y + 0.3 * 0.85, z - 1.15, 0.22, 0.6);
    fit(b, 'sack_truck', X + 5.95, y, z + 1.15, 0.95, -Math.PI / 2);
    b.endObject();
    solid(z - 1.4, z + 1.45, X + 5.7);
    shops.push({ id: 'parcels', z0: BAYS.parcels[0], z1: BAYS.parcels[1], keeper: { look: PARCELS, x: X + 7.42, z: z, idles: ['stamp', 'look'] } });
  }
  return shops;
}

/**
 * Station life (session 57): a pug asleep… awake, by a bench; a letter left on a bench; a picnic on the verge past the
 * railing (a checked blanket of our own, a basket, a teapot). `bench` is a show bench by the railing, if there is one.
 */
export function buildStationLife(b: GeoBuilder, bench: Rect | null, x1: number, picnicZ: number, block: (r: Rect) => void): void {
  const y = FLOOR_Y;
  if (bench) {
    const bz = (bench.z0 + bench.z1) / 2;
    b.object('platform:pug');
    fit(b, 'pug', bench.x0 - 0.72, y, bench.z1 - 0.35, 0.3, Math.PI * 0.85);
    b.endObject();
    block({ x0: bench.x0 - 0.92, z0: bench.z1 - 0.7, x1: bench.x0 - 0.52, z1: bench.z1 });
    b.object('platform:letter');
    const e = modelEntry('letter');
    const s = 0.22 / (e.max[0] - e.min[0]);
    // On the seat (the bench's own seat height), lying flat.
    b.model('letter', bench.x0 + 0.22, y + 0.46, bz, 0.3, s, s, s, { surface: 'matte', shade: 1 });
    b.endObject();
  }
  // The picnic on the forecourt grass, beyond the railing.
  b.object('forecourt:picnic');
  const px = x1 + 1.63;
  const g = FORECOURT_TOP;
  b.box(px, g + 0.01, picnicZ, 0.72, 0.02, 1.2, '#C8434E', 0, { pattern: PATTERN.checker, color2: '#F2E6D6', scale: 0.12, shade: 1 });
  fit(b, 'basket_round', px - 0.1, g + 0.02, picnicZ - 0.32, 0.14);
  fit(b, 'teapot', px + 0.1, g + 0.02, picnicZ + 0.3, 0.16, 0.5);
  fit(b, 'mug', px + 0.18, g + 0.02, picnicZ - 0.02, 0.08);
  b.endObject();
}
