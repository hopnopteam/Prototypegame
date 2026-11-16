import type { IconName } from './icons';

/**
 * Session 51: the item icons drawn from the game's own CC0 models (the croissant in a guest's bubble is the croissant
 * on the café's stand), rendered once into assets/icons/items.png by scripts/assets/render-icons.mjs. Each part is a
 * glTF under assets/models/src, scaled to `height` and placed at (x, y, z) in a little scene; a `build` icon is made by
 * its builder in src/iconBuilders.ts instead. Any icon added later goes here too, so the whole set stays one style.
 */
export interface IconPart { src: string; height?: number; x?: number; y?: number; z?: number; rotY?: number }
export const ICON_CELL = 256;
export const ICON_MODELS: readonly { name: IconName; parts: IconPart[]; build?: true }[] = [
  { name: 'tea', parts: [{ src: 'tinytreats-picnic/teapot.gltf' }] },
  { name: 'pastry', parts: [{ src: 'tinytreats-baked/croissant.gltf', rotY: 0.5 }] },
  { name: 'sandwich', parts: [{ src: 'tinytreats-picnic/sandwich.gltf' }] },
  { name: 'champagne', parts: [{ src: 'tinytreats-picnic/wine_bottle.gltf' }] },
  { name: 'towel', parts: [{ src: 'tinytreats-bathroom/towel_stacked.gltf' }] },
  { name: 'blanket', parts: [{ src: 'tinytreats-picnic/picnic_blanket_red_folded.gltf' }] },
  { name: 'pillow', parts: [{ src: 'tinytreats-picnic/pillow_large_blue.gltf' }] },
  { name: 'meal', parts: [{ src: 'kaykit-restaurant/food_dinner.gltf' }] },
  { name: 'cocktail', parts: [{ src: 'kenney-food/cocktail.glb' }] },
  { name: 'breakfast', parts: [{ src: 'tinytreats-bakery/plate.gltf', height: 0.06 }, { src: 'tinytreats-baked/croissant.gltf', height: 0.22, y: 0.04, x: -0.05 }, { src: 'tinytreats-bakery/mug_B.gltf', height: 0.3, x: 0.42, z: -0.25 }] },
  // Session 51b: the rest of the world's icons, built in three.js in the same rounded style (src/iconBuilders.ts).
  { name: 'coffee', parts: [], build: true },
  { name: 'latte', parts: [], build: true },
  { name: 'broom', parts: [], build: true },
  { name: 'key', parts: [], build: true },
  { name: 'ticket', parts: [], build: true },
  { name: 'shoe', parts: [], build: true },
  { name: 'film', parts: [], build: true },
  { name: 'wipe', parts: [], build: true },
  { name: 'bell', parts: [], build: true },
  { name: 'luggage', parts: [], build: true },
  { name: 'crate', parts: [], build: true },
  { name: 'roll', parts: [], build: true },
  { name: 'popcorn', parts: [], build: true },
  { name: 'newspaper', parts: [], build: true },
  { name: 'news', parts: [], build: true },
  { name: 'snack', parts: [], build: true },
  { name: 'turndown', parts: [], build: true },
  { name: 'bin', parts: [], build: true },
  { name: 'binoculars', parts: [], build: true },
  { name: 'cash', parts: [], build: true },
  { name: 'trophy', parts: [], build: true },
  { name: 'bed', parts: [], build: true },
  { name: 'box', parts: [], build: true },
  { name: 'linen', parts: [], build: true },
  { name: 'bath', parts: [], build: true },
  { name: 'chest', parts: [], build: true },
  { name: 'gem', parts: [], build: true },
];
