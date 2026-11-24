import { VISUALS } from '../config/visuals';

/**
 * Session 49: the photo detail layers (floor grain, carpet wool, grass), in the order they are stacked in
 * assets/textures/detail.jpg. A part names one in its style (`PartStyle.detail`); GeoBuilder packs the layer into the
 * pattern attribute (`DETAIL_STRIDE` × (layer + 1) added to the pattern id) and the lit shader multiplies the part's own
 * colour by the layer's texel (see materials.ts).
 */
export const DETAIL_LAYERS = ['woodWorn', 'wood', 'woodPolished', 'herringbone', 'wool', 'grass', 'ground', 'paving', 'flagstone', 'panel', 'carpet'] as const;
export type DetailName = (typeof DETAIL_LAYERS)[number];

/** Pattern ids stay below this; the detail layer rides above it in the same float. */
export const DETAIL_STRIDE = 32;

export function detailIndex(name: DetailName): number {
  return DETAIL_LAYERS.indexOf(name);
}

/** The pattern attribute's first value for a pattern id and an optional detail layer. */
export function packPattern(type: number, detail?: DetailName): number {
  return detail ? type + DETAIL_STRIDE * (detailIndex(detail) + 1) : type;
}

/** Each layer's (metres per repeat, strength), for the shader's uniform. */
export function detailTuning(): { x: number; y: number }[] {
  return DETAIL_LAYERS.map((name) => ({ x: VISUALS.detail[name].tile, y: VISUALS.detail[name].strength }));
}
