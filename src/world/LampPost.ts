import { GeoBuilder } from './geo';
import { key, modelEntry } from './models/library';
import { PALETTE } from './palette';

/**
 * Session 69 (the Stage B list: "one lamp-post family in two heights"): every lamp post in the world is the same
 * Victorian street lantern (Tiny Treats' model) in the station's navy iron with its glass lit: tall on the platform and
 * along the village lane, short on the lakeside paths and promenades. They were three different posts (the lantern,
 * a darker copy of it with a glowing cube at the wrong height, and a bare pole topped by a box).
 */
export type LampHeight = 'tall' | 'short';

/** Their heights (metres to the top of the lantern). */
export const LAMP_HEIGHT: Record<LampHeight, number> = { tall: 2.75, short: 2.05 };

/** The lantern model's glass (its own units): centre height, half-width and height. */
export const LANTERN_GLASS_Y = 3.82;
export const LANTERN_GLASS_HALF = 0.29;
export const LANTERN_GLASS_H = 0.26;
/** The iron and its lighter trim. */
const IRON = PALETTE.navy;
const IRON_TRIM = '#3C4A70';
const GLASS = '#FFE2A6';

/** Builds one lamp post standing on `y`: the iron in `b`, the lit glass in `glow`. Returns the glass's height. */
export function buildLampPost(b: GeoBuilder, glow: GeoBuilder, x: number, y: number, z: number, height: LampHeight, label: string): number {
  const e = modelEntry('street_lamp');
  const sc = LAMP_HEIGHT[height] / (e.max[1] - e.min[1]);
  b.object(label);
  b.model('street_lamp', x, y, z, 0, sc, sc, sc, { recolor: [key('ttMid', IRON), key('ttLight', IRON_TRIM)], surface: 'iron' });
  b.endObject();
  // The model's glass is solid grey, so the lit glass is a band just proud of it.
  const glassY = y + LANTERN_GLASS_Y * sc;
  glow.object(`${label}~glow`);
  glow.box(x, glassY, z, LANTERN_GLASS_HALF * sc * 2 + 0.02, LANTERN_GLASS_H * sc, LANTERN_GLASS_HALF * sc * 2 + 0.02, GLASS, 0);
  glow.endObject();
  return glassY;
}
