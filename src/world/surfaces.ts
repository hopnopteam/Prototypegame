import { PALETTE } from './palette';

/**
 * What a part is made of, for the physically based tiers: roughness, metalness, glow (self-lit at night)
 * and sheen (the soft rim velvet and wool catch). Merged meshes carry these per vertex, so one draw call can
 * hold brass rails, varnished wood and a velvet sofa. The cheapest tier ignores them.
 */
export interface Surface {
  roughness: number;
  metalness: number;
  glow?: number;
  sheen?: number;
}

const SURFACE_TABLE = {
  /** Plaster, painted wood, most furniture. */
  matte: { roughness: 0.82, metalness: 0 },
  /** Enamel livery and painted steel: a soft sheen, never plastic. */
  paint: { roughness: 0.5, metalness: 0.04 },
  wood: { roughness: 0.66, metalness: 0 },
  varnish: { roughness: 0.34, metalness: 0 },
  fabric: { roughness: 0.94, metalness: 0, sheen: 0.25 },
  velvet: { roughness: 0.86, metalness: 0, sheen: 0.8 },
  leather: { roughness: 0.5, metalness: 0, sheen: 0.1 },
  brass: { roughness: 0.3, metalness: 1 },
  steel: { roughness: 0.28, metalness: 1 },
  iron: { roughness: 0.62, metalness: 0.6 },
  ceramic: { roughness: 0.2, metalness: 0 },
  marble: { roughness: 0.16, metalness: 0 },
  glass: { roughness: 0.06, metalness: 0 },
  crystal: { roughness: 0.04, metalness: 0, glow: 0.6 },
  foliage: { roughness: 0.9, metalness: 0 },
  stone: { roughness: 0.88, metalness: 0 },
} satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof SURFACE_TABLE;
export const SURFACES: Record<SurfaceName, Surface> = SURFACE_TABLE;

/** Floor patterns that are wood: boards, planks, parquet and chevron (ids from materials.ts PATTERN). */
const WOOD_PATTERNS = new Set([5, 9, 10, 11]);

const BY_COLOR: Record<string, Surface> = {};
const tag = (surface: Surface, ...colors: string[]): void => {
  for (const c of colors) BY_COLOR[c.toUpperCase()] = surface;
};
tag(SURFACES.brass, PALETTE.gold, PALETTE.goldDark, PALETTE.brass);
tag(SURFACES.steel, PALETTE.chrome, PALETTE.railTop);
tag(SURFACES.iron, PALETTE.rail, PALETTE.iron, PALETTE.wheel, PALETTE.undercarriage, PALETTE.locoBlack, PALETTE.smokebox);
tag(SURFACES.glass, PALETTE.windowDay);
tag(SURFACES.ceramic, PALETTE.porcelain);
tag(SURFACES.varnish, PALETTE.walnut, PALETTE.walnutDark, PALETTE.boardsPolished);
tag(SURFACES.fabric, PALETTE.linen, PALETTE.mattress, PALETTE.pillow, PALETTE.greyWool, PALETTE.towel);

/**
 * The surface a part gets when its style does not name one: known palette metals and woods by colour,
 * floor patterns as wood, everything else matte.
 */
export function inferSurface(color: string, pattern: number): Surface {
  const known = BY_COLOR[color.toUpperCase()];
  if (known) return known;
  if (WOOD_PATTERNS.has(pattern)) return SURFACES.wood;
  return SURFACES.matte;
}
