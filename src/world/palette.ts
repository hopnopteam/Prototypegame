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
  oak: '#D9B98E',
  oakMid: '#C7A279',
  plankWorn: '#B79C7C',
  plankWornSeam: '#AE9373',
  iron: '#6C6A70',
  wallWorn: '#D8CFC0',
  wallWornLow: '#BDB19E',
  linen: '#FBF7EF',
  porcelain: '#F7F7F4',
  brass: '#E2B653',
  ink: '#2F2A36',
  mattress: '#FBF7EF',
  pillow: '#FFFFFF',
  greyWool: '#9C9A9E',
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
  platformTile: '#EEE7DA',
  platformTile2: '#E7DFD1',
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
  zone: '#FFFDF8',
  zoneActive: '#F2B233',
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
};

/** Tier names, shown on refurbishment tiles and in headlines. */
export const TIER_NAMES = ['Rusty', 'Freshly painted', 'Cosy', 'Luxurious'];

/** The train's paint job follows its reputation: it looks as famous as it is. */
export interface Livery {
  minLevel: number;
  name: string;
  body: string;
  trim: string;
}

export const LIVERIES: Livery[] = [
  { minLevel: 1, name: 'Rust & Soot', body: '#9A7462', trim: '#7A6D66' },
  { minLevel: 2, name: 'Meadow Green', body: '#5E8A6A', trim: '#EFE6D2' },
  { minLevel: 4, name: 'Midnight Navy', body: '#34507A', trim: '#F1E6CC' },
  { minLevel: 6, name: 'Royal Blue & Gold', body: '#2F4C82', trim: '#E2B653' },
];

export function liveryFor(level: number): Livery {
  let best = LIVERIES[0];
  for (const l of LIVERIES) if (level >= l.minLevel) best = l;
  return best;
}
