// Textures by manifest id: final art when it exists in art/final, otherwise the generated placeholder.
import { ImageSource, Texture } from 'pixi.js';
import manifest from '../../art/ASSET_MANIFEST.json';

export interface AssetEntry {
  id: string;
  file: string;
  category: string;
  targetSizePx: number[];
  /** Size in the world, metres (in-world sprites). */
  worldSizeM?: number[];
  /** Size on screen, CSS pixels (backgrounds and UI). */
  cssSizePx?: number[];
  /** Anchor, 0–1 from the top-left. */
  pivot: number[];
  tiles: string;
  /** 9-slice insets in image pixels (left, top, right, bottom), for frames and buttons. */
  nineSlice: number[] | null;
  status: string;
}

const placeholderUrls = import.meta.glob('../../art/placeholders/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const finalUrls = import.meta.glob('../../art/final/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const ENTRIES: ReadonlyMap<string, AssetEntry> = new Map((manifest.assets as unknown as AssetEntry[]).map((a) => [a.id, a]));

const textures = new Map<string, Texture>();
const urls = new Map<string, string>();

/** The image URL for an id (also used by the HTML UI). */
export function assetUrl(id: string): string {
  const url = urls.get(id);
  if (!url) throw new Error(`Unknown asset "${id}" (not in art/ASSET_MANIFEST.json)`);
  return url;
}

export function texture(id: string): Texture {
  const t = textures.get(id);
  if (!t) throw new Error(`Asset "${id}" is not loaded`);
  return t;
}

export function entry(id: string): AssetEntry {
  const e = ENTRIES.get(id);
  if (!e) throw new Error(`Unknown asset "${id}"`);
  return e;
}

/** Every loaded texture (for the boot warm-up). */
export function allTextures(): Texture[] {
  return [...textures.values()];
}

/** Loads every manifest asset. Placeholders fill in anything without final art. */
export async function loadAssets(): Promise<{ final: number; placeholder: number }> {
  let final = 0;
  let placeholder = 0;
  await Promise.all(
    [...ENTRIES.values()].map(async (a) => {
      const finalUrl = finalUrls[`../../${a.file}`];
      const url = finalUrl ?? placeholderUrls[`../../art/placeholders/${a.id}.png`];
      if (!url) throw new Error(`No art or placeholder for "${a.id}": run npm run art:placeholders`);
      if (finalUrl) final++;
      else placeholder++;
      urls.set(a.id, url);
      const img = new Image();
      img.src = url;
      await img.decode();
      // Mipmaps: suit art is painted for the Workshop close-up and drawn much smaller in flight.
      const source = new ImageSource({
        resource: img,
        autoGenerateMipmaps: true,
        scaleMode: 'linear',
        mipmapFilter: 'linear',
        addressMode: a.tiles !== 'none' ? 'repeat' : 'clamp-to-edge',
      });
      textures.set(a.id, new Texture({ source }));
    }),
  );
  return { final, placeholder };
}
