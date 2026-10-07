import type { CarriageType } from '../core/types';

/**
 * Night Express palette, v2: calm and legible first.
 *
 * Rules (from the clearest top-down idle games, e.g. My Perfect Hotel, and storybook illustration):
 * - Most of the image is warm neutrals: cream, oak, white. Large surfaces are flat colour, no patterns.
 * - Each carriage has ONE pastel identity for its walls, all pastels at the same lightness, so the train
 *   reads as a family and only the hue says "this is the bathroom car".
 * - Value hierarchy: floor lightest and quietest → walls → furniture → characters (strongest colour) →
 *   interactive things (gold, the only accent).
 * - The countryside is desaturated so the train always sits in front of it.
 */
export const PALETTE = {
  // Countryside (quiet, low contrast)
  skyDay: '#EEE6D2',
  meadow: '#B9CA93',
  meadowDark: '#B0C28A',
  wheat: '#DECB8F',
  mustardField: '#D6C28A',
  lavender: '#C6CFA2',
  mintField: '#C3D29F',
  clover: '#BFCE98',
  ploughed: '#CDB793',
  hedge: '#94AF7A',
  hedgeDark: '#87A26E',
  verge: '#DDD1B2',

  // Track
  ballast: '#BFB6AA',
  ballastDark: '#B5AC9F',
  sleeper: '#8A735F',
  rail: '#A9AFB8',
  railTop: '#DADEE3',

  // Livery defaults (the live livery comes from LIVERIES via materials)
  livery: '#5E8A6A',
  liveryDark: '#4C7358',
  navy: '#34507A',
  navyDark: '#263C5C',
  gold: '#E2B653',
  goldDark: '#B98C33',
  creamBand: '#F3EBDA',
  undercarriage: '#3E3C45',
  wheel: '#2E2D34',
  chrome: '#C7CDD4',

  // Locomotive
  locoBody: '#2F3A4A',
  locoRed: '#C4574D',
  locoBlack: '#26262C',
  smokebox: '#33333A',

  // Neutrals and materials
  walnut: '#8E6A4C',
  walnutDark: '#6E5140',
  oak: '#E6CFA6',
  oakMid: '#D9BE91',
  /** Floorboards (MPH-style): honey planks, each a little darker or lighter, with soft seams. */
  boards: '#E9C895',
  boardsSeam: '#C29A66',
  /** Cosy rooms: the same boards, polished to a deeper glow. */
  boardsPolished: '#DDB57F',
  /** Run-down floorboards: the same boards, weathered grey. */
  plankWorn: '#CFC4B2',
  plankWornSeam: '#A2968A',
  iron: '#7A8591',
  wallWorn: '#D9DAC9',
  wallWornLow: '#B6BCA7',
  linen: '#FBF7EF',
  porcelain: '#F7F7F4',
  brass: '#E2B653',
  ink: '#2F2A36',
  mattress: '#FBF7EF',
  pillow: '#FFFFFF',
  greyWool: '#B4BDC7',
  mustard: '#E5B452',
  mustardDark: '#C99A3E',
  raspberry: '#C0606A',
  raspberryDark: '#9C4A54',
  pink: '#EBC4BE',
  powder: '#C3D8E6',
  mint: '#C9E4D6',
  teal: '#4F9591',
  coral: '#E08A6E',
  plum: '#8E6A8C',
  lampShade: '#F6E6BD',
  lampGlow: '#FFD68A',
  towel: '#EDA3AC',
  towelStripe: '#FFFFFF',
  rollPaper: '#FFFFFF',
  suitcase: '#C98A5E',
  windowDay: '#9FC0D0',
  windowNight: '#FFC766',
  frameCanvas: ['#9DB8CF', '#E6C0B4', '#AFCBA7', '#E6D39A'] as string[],

  // Station
  // Mid-tone paving, so the canopy lamps' warm pools read on it at night (a cream deck glared under the moon).
  platformTile: '#B4A893',
  platformTile2: '#A99C86',
  platformEdge: '#EDC75A',
  stationPink: '#F1E4CF',
  stationTrim: '#FFFDF8',
  canopy: '#A9CFC0',
  canopyDark: '#8BB9A7',
  roofTerracotta: '#C27A67',
  roofSlate: '#6F8499',

  // Countryside props
  trunk: '#8C6F55',
  treeGreen: '#8EB46F',
  treeLight: '#A3C383',
  blossom: '#E9C9C9',
  cypress: '#6F9A68',
  cottageWalls: ['#F4EEE1', '#F0E4CC', '#E6ECE2'] as string[],
  cottageRoofs: ['#C27A67', '#6F8499', '#8C7A6B'] as string[],
  sheep: '#FBF7EF',
  sheepFace: '#3E3634',
  water: '#9CC9DB',
  waterLight: '#C4E1EB',

  // Money and feedback
  cash: '#7CC47F',
  cashEdge: '#3F8A4C',
  cashBand: '#F4EBC8',
  zone: '#FFFFFF',
  zoneActive: '#F2B233',
  /** A zone doing its job (checking in, tidying, handing over): the same green as a tile filling. */
  zoneWorking: '#6FC25A',
  /**
   * Session 24, pads in the style of My Perfect Hotel: a soft colour says what kind of job a pad is, the white
   * icon on it says which. Work (tidy, sell tickets, check in, start the film), pick up (an urn, a shelf, a
   * stand), drop off (restock, a rack, hand it to a guest).
   */
  zoneWork: '#5FA3E0',
  zonePickup: '#6CBF7C',
  zoneDrop: '#EDA94E',
};

/**
 * One identity per carriage. Everything else about how a carriage looks comes from its refurbishment
 * tier (see CarriageView): tier 0 is a tired old carriage in putty and bare planks; each tier repaints,
 * carpets and finally dresses it in wood panelling and brass.
 */
export interface CarriageTheme {
  /** The pastel wall colour (tier 1+). */
  wall: string;
  /** Lower wall band / deeper tone of the same hue. */
  wallLow: string;
  /** Soft floor covering in rooms (tier 2+). */
  carpet: string;
  /** Deeper version for the runner and rich finishes (tier 3). */
  deep: string;
  blanket: string;
  curtain: string;
}

export const CARRIAGE_THEMES: Record<CarriageType, CarriageTheme> = {
  lobby: { wall: '#EBC9C2', wallLow: '#D7AAA2', carpet: '#E9D8CD', deep: '#B9707A', blanket: '#D98E8F', curtain: '#E2B653' },
  sleeper: { wall: '#C6D9E6', wallLow: '#A6C0D4', carpet: '#DCE3E6', deep: '#5E7FA0', blanket: '#7D9CBB', curtain: '#E5B452' },
  bathroom: { wall: '#CCE5D8', wallLow: '#A9CDBB', carpet: '#EEF2EC', deep: '#5F9C86', blanket: '#EDA3AC', curtain: '#FFFDF8' },
  supply: { wall: '#EFDDAE', wallLow: '#D9C38D', carpet: '#E8DDC4', deep: '#C29A48', blanket: '#8FAE78', curtain: '#8FAE78' },
  luggage: { wall: '#EFD0BA', wallLow: '#DDB397', carpet: '#E9DACD', deep: '#A7705A', blanket: '#5E7FA0', curtain: '#5E7FA0' },
  // Session 20: the venues. Café cream and pistachio, the dining car claret and linen, the bar teal and brass,
  // the dome sky blue.
  cafe: { wall: '#E9D9B8', wallLow: '#C7D3A8', carpet: '#EADFC9', deep: '#6E8B4E', blanket: '#C97C5D', curtain: '#E2B653' },
  dining: { wall: '#EAD3CC', wallLow: '#C9A39B', carpet: '#EFE4D6', deep: '#8C2F3F', blanket: '#F4ECDD', curtain: '#E2B653' },
  bar: { wall: '#BFD6D2', wallLow: '#8CB3AD', carpet: '#DCE4E0', deep: '#24585A', blanket: '#C0485C', curtain: '#E2B653' },
  dome: { wall: '#CBDDEB', wallLow: '#A3C1D8', carpet: '#E2E8EC', deep: '#3E6A93', blanket: '#E9B949', curtain: '#E2B653' },
  // Session 21: the cinema, plum and gold (red velvet from the Luxury refit).
  cinema: { wall: '#D9CBD6', wallLow: '#A88DA3', carpet: '#E6DCE2', deep: '#6B2A4A', blanket: '#B03A3E', curtain: '#A3283A' },
};

/**
 * Inside a passenger carriage the class sets the palette (outside, its livery: config/classes.ts). Basic
 * keeps the carriage's own run-down and repaired neutrals.
 */
export const CLASS_THEMES: Record<'comfort' | 'business' | 'first' | 'royal', CarriageTheme> = {
  comfort: { wall: '#B4DBD1', wallLow: '#86BFB2', carpet: '#DCE7E2', deep: '#2F7F7A', blanket: '#5FA39B', curtain: '#E5B452' },
  business: { wall: '#BFCADB', wallLow: '#93A5BE', carpet: '#D6DCE4', deep: '#2A4468', blanket: '#3F5E8C', curtain: '#C9D2DC' },
  first: { wall: '#C5CFEC', wallLow: '#9FAEDB', carpet: '#E4D8C0', deep: '#2B4B92', blanket: '#9E2F45', curtain: '#E2B653' },
  royal: { wall: '#E7C3C1', wallLow: '#C99592', carpet: '#EADBD2', deep: '#6A1E2E', blanket: '#7E2436', curtain: '#E2B653' },
};

/** Tier names, shown on refurbishment tiles and in headlines. */
/** Rags to riches: run-down → repaired (clean and plain) → cosy (its colours) → luxurious. */
export const TIER_NAMES = ['Run-down', 'Repaired', 'Cosy', 'Luxury'];

/**
 * The train's paint job. Earned liveries follow its reputation (it looks as famous as it is); premium ones
 * are bought with gems in the Paint Shop (cosmetic only, never power).
 */
export interface Livery {
  id: string;
  name: string;
  body: string;
  trim: string;
  /** Earned at this route level. */
  minLevel?: number;
  /** Or bought for this many gems. */
  gems?: number;
}

export const LIVERIES: Livery[] = [
  { id: 'primer', minLevel: 1, name: 'Workshop Grey', body: '#7F8E9B', trim: '#EDE6D6' },
  { id: 'meadow', minLevel: 2, name: 'Meadow Green', body: '#5E8A6A', trim: '#EFE6D2' },
  { id: 'navy', minLevel: 4, name: 'Midnight Navy', body: '#34507A', trim: '#F1E6CC' },
  { id: 'royal', minLevel: 6, name: 'Royal Blue & Gold', body: '#2F4C82', trim: '#E2B653' },
  { id: 'pillarbox', gems: 120, name: 'Pillar-box Red', body: '#B5433F', trim: '#F3E7CF' },
  { id: 'seafoam', gems: 120, name: 'Seafoam & Cream', body: '#6FA59C', trim: '#FBF3E4' },
  { id: 'mustard', gems: 150, name: 'Mustard Express', body: '#D3A043', trim: '#34405A' },
  { id: 'plum', gems: 180, name: 'Plum & Gold', body: '#5E3D63', trim: '#E2B653' },
];

/** The best livery earned by this route level. */
/** A colour lifted (positive) or darkened (negative) by `amount` on every channel (0–255). */
export function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

export function liveryFor(level: number): Livery {
  let best = LIVERIES[0];
  for (const l of LIVERIES) if (l.minLevel !== undefined && level >= l.minLevel) best = l;
  return best;
}
