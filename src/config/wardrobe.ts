/**
 * The conductor's wardrobe: outfits earned by route level or bought with gems (cosmetic only, never
 * power). Colours drive the in-game model and the wardrobe card portrait.
 */
export interface OutfitDef {
  id: string;
  name: string;
  body: string;
  accent: string;
  pants: string;
  hat: 'conductor' | 'boater';
  hatColor: string;
  bandColor: string;
  /** Earned at this route level. */
  minLevel?: number;
  /** Or bought for this many gems. */
  gems?: number;
}

export const OUTFITS: OutfitDef[] = [
  { id: 'classic', name: 'Classic Navy', body: '#2C4A6E', accent: '#E2B653', pants: '#1F3551', hat: 'conductor', hatColor: '#2C4A6E', bandColor: '#C4574D', minLevel: 1 },
  { id: 'linen', name: 'Summer Linen', body: '#EFE6D2', accent: '#C0485C', pants: '#8A7A62', hat: 'boater', hatColor: '#E8D29A', bandColor: '#C0485C', minLevel: 3 },
  { id: 'scarlet', name: 'Royal Scarlet', body: '#B8383E', accent: '#E2B653', pants: '#2A2433', hat: 'conductor', hatColor: '#B8383E', bandColor: '#E2B653', minLevel: 5 },
  { id: 'forest', name: 'Forest Green', body: '#3F6E5A', accent: '#E2B653', pants: '#27463A', hat: 'conductor', hatColor: '#3F6E5A', bandColor: '#E8D9B0', gems: 120 },
  { id: 'plum', name: 'Midnight Plum', body: '#5E3D63', accent: '#E2B653', pants: '#35223A', hat: 'conductor', hatColor: '#5E3D63', bandColor: '#E2B653', gems: 150 },
  { id: 'jubilee', name: 'Golden Jubilee', body: '#E2B653', accent: '#2C4A6E', pants: '#2C4A6E', hat: 'conductor', hatColor: '#2C4A6E', bandColor: '#E2B653', gems: 250 },
];

/** Shoe colours by speed-upgrade level: plain, then sporty, then gold-trimmed. */
export const SHOES_BY_SPEED = ['#2A2433', '#F4F1EA', '#F4F1EA', '#E2B653', '#E2B653', '#E2B653'];
