import sheet from '../../assets/icons/items.png';
import { ICON_CELL, ICON_MODELS } from './iconModels';
import type { IconName } from './icons';

/**
 * Session 51: the item icons rendered from the models (assets/icons/items.png), decoded once at start-up before
 * anything draws an icon. drawIcon uses one when it has it; until then (or if it fails) the drawn icon stands in.
 */
let image: HTMLImageElement | null = null;
const cell = new Map<IconName, number>(ICON_MODELS.map((m, i) => [m.name, i]));

export async function loadIconImages(): Promise<void> {
  try {
    const img = new Image();
    img.src = `data:image/png;base64,${sheet}`;
    await img.decode();
    image = img;
  } catch {
    image = null;
  }
}

/** Draws the rendered icon into the 100 × 100 icon box; false when there is none for this name. */
export function drawIconImage(ctx: CanvasRenderingContext2D, name: IconName): boolean {
  const i = cell.get(name);
  if (i === undefined || !image) return false;
  ctx.drawImage(image, i * ICON_CELL, 0, ICON_CELL, ICON_CELL, -4, -4, 108, 108);
  return true;
}
