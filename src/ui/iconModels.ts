import type { IconName } from './icons';

/**
 * Session 51: the item icons drawn from the game's own CC0 models (the croissant in a guest's bubble is the croissant
 * on the café's stand), rendered once into assets/icons/items.png by scripts/assets/render-icons.mjs. Each part is a
 * glTF under assets/models/src, scaled to `height` and placed at (x, y, z) in a little scene.
 */
export interface IconPart { src: string; height?: number; x?: number; y?: number; z?: number; rotY?: number }
export const ICON_CELL = 256;
export const ICON_MODELS: readonly { name: IconName; parts: IconPart[] }[] = [
  { name: 'tea', parts: [{ src: 'tinytreats-picnic/teapot.gltf' }] },
  { name: 'coffee', parts: [{ src: 'tinytreats-kitchen/mug_red.gltf' }] },
  { name: 'latte', parts: [{ src: 'tinytreats-bakery/coffee_cup_takeaway.gltf' }] },
  { name: 'pastry', parts: [{ src: 'tinytreats-baked/croissant.gltf', rotY: 0.5 }] },
  { name: 'sandwich', parts: [{ src: 'tinytreats-picnic/sandwich.gltf' }] },
  { name: 'champagne', parts: [{ src: 'tinytreats-picnic/wine_bottle.gltf' }] },
  { name: 'towel', parts: [{ src: 'tinytreats-bathroom/towel_stacked.gltf' }] },
  { name: 'blanket', parts: [{ src: 'tinytreats-picnic/picnic_blanket_red_folded.gltf' }] },
  { name: 'pillow', parts: [{ src: 'tinytreats-picnic/pillow_large_blue.gltf' }] },
  { name: 'meal', parts: [{ src: 'kaykit-restaurant/food_dinner.gltf' }] },
  { name: 'cocktail', parts: [{ src: 'kenney-food/cocktail.glb' }] },
  { name: 'breakfast', parts: [{ src: 'tinytreats-bakery/plate.gltf', height: 0.06 }, { src: 'tinytreats-baked/croissant.gltf', height: 0.22, y: 0.04, x: -0.05 }, { src: 'tinytreats-bakery/mug_B.gltf', height: 0.3, x: 0.42, z: -0.25 }] },
];
