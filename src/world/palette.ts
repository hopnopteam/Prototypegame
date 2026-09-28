import type { CarriageType } from '../core/types';

/**
 * Night Express palette. Direction: a dollhouse cross-section of a pastel sleeper train, after the
 * storybook symmetry of Wes Anderson's trains and hotels: powder-blue livery with navy and gold, one
 * signature colour per carriage, patterned floors, brass everywhere. Outside is a patchwork of sage,
 * mustard and lavender fields. Colours are chosen to stay distinct at thumb size and under night light.
 */
export const PALETTE = {
  // Sky and ground
  skyDay: '#F2E4C4',
  meadow: '#A9C27F',
  meadowDark: '#9AB672',
  wheat: '#EBC867',
  mustardField: '#E0B04E',
  lavender: '#BFA9DA',
  mintField: '#BCD9A2',
  clover: '#EDB8C2',
  ploughed: '#C9A07A',
  hedge: '#6E9859',
  hedgeDark: '#5C8650',
  verge: '#D9CBA0',

  // Track
  ballast: '#BCB0A2',
  ballastDark: '#A69A8D',
  sleeper: '#7B5B45',
  rail: '#A3AAB4',
  railTop: '#D6DAE0',

  // Livery
  livery: '#8CC4D6',
  liveryDark: '#6BA7BC',
  navy: '#2C4A6E',
  navyDark: '#1F3551',
  gold: '#E3B352',
  goldDark: '#B9862E',
  creamBand: '#F6ECD6',
  undercarriage: '#3A3943',
  wheel: '#2A2A31',
  chrome: '#C3CAD2',

  // Locomotive
  locoBody: '#2C4A6E',
  locoRed: '#D1495B',
  locoBlack: '#24242B',
  smokebox: '#34343C',

  // Interiors (shared)
  walnut: '#8A5A3C',
  walnutDark: '#6B4430',
  oak: '#C08B5C',
  linen: '#FBF6EC',
  porcelain: '#F6F7F5',
  brass: '#E3B352',
  ink: '#2A2433',
  mattress: '#FBF6EC',
  pillow: '#FFFFFF',
  mustard: '#E9B949',
  mustardDark: '#D1953A',
  raspberry: '#C0485C',
  raspberryDark: '#983547',
  pink: '#F4B8C0',
  powder: '#B9D6E8',
  mint: '#BFE5D3',
  teal: '#3F8F8B',
  coral: '#EE8F7A',
  plum: '#8E5D86',
  lampShade: '#F7E3B0',
  lampGlow: '#FFD68A',
  towel: '#F29CA8',
  towelStripe: '#FFFFFF',
  rollPaper: '#FFFFFF',
  suitcase: '#C9764A',
  windowDay: '#88B3C9',
  windowNight: '#FFC766',
  frameCanvas: ['#7FA7C9', '#E7B6A8', '#9CC59B', '#E8C872'] as string[],

  // Station
  platformTile: '#EFE4D0',
  platformTile2: '#E1D2B8',
  platformEdge: '#F2C94C',
  stationPink: '#F2B7B4',
  stationTrim: '#FBF6EC',
  canopy: '#9ED3C0',
  canopyDark: '#6FB29D',
  roofTerracotta: '#C9695B',
  roofSlate: '#5E7A99',

  // Countryside
  trunk: '#8A6445',
  treeGreen: '#7FAE5E',
  treeLight: '#98C26C',
  blossom: '#F2B6C3',
  cypress: '#5E8C58',
  cottageWalls: ['#F4C7C3', '#F6E3A8', '#BFE0D6', '#C9D8EF', '#FBF3E4'] as string[],
  cottageRoofs: ['#C9695B', '#5E7A99', '#8E5D78', '#6E8F5C'] as string[],
  sheep: '#FBF7EF',
  sheepFace: '#3A3230',
  water: '#8CC6DE',
  waterLight: '#BFE3F0',

  // Money and feedback
  cash: '#7CC47F',
  cashEdge: '#3F8A4C',
  cashBand: '#F4EBC8',
  zone: '#FFF6E4',
  zoneActive: '#F2B233',
};

/** One signature look per carriage: wallpaper, wainscot, trim and a patterned floor. */
export interface CarriageTheme {
  wall: string;
  wallStripe: string;
  wainscot: string;
  trim: string;
  floor: string;
  floor2: string;
  /** Pattern id for the main floor (see materials.ts PATTERN). */
  floorPattern: number;
  floorScale: number;
  /** Cabin / room floors. */
  room: string;
  room2: string;
  roomPattern: number;
  roomScale: number;
  runner: string;
  runnerEdge: string;
  curtain: string;
  blanket: string;
  blanket2: string;
}

export const CARRIAGE_THEMES: Record<CarriageType, CarriageTheme> = {
  lobby: {
    wall: '#F4B8C0', wallStripe: '#EFA6B1', wainscot: '#C0485C', trim: '#E3B352',
    floor: '#F7EDDC', floor2: '#E6A2AE', floorPattern: 4, floorScale: 0.42,
    room: '#E9DDC5', room2: '#DCCBAE', roomPattern: 2, roomScale: 0.22,
    runner: '#C0485C', runnerEdge: '#E3B352',
    curtain: '#E3B352', blanket: '#E9B949', blanket2: '#D1953A',
  },
  sleeper: {
    wall: '#B9D6E8', wallStripe: '#A8CADF', wainscot: '#4E7FA6', trim: '#F1D48A',
    floor: '#EFE5D2', floor2: '#DCCDB2', floorPattern: 1, floorScale: 0.34,
    room: '#E4D8BE', room2: '#D6C6A6', roomPattern: 2, roomScale: 0.22,
    runner: '#2C4A6E', runnerEdge: '#E3B352',
    curtain: '#E9B949', blanket: '#C0485C', blanket2: '#983547',
  },
  bathroom: {
    wall: '#BFE5D3', wallStripe: '#ADDCC6', wainscot: '#5FA88C', trim: '#FBF6EC',
    floor: '#F4F1EA', floor2: '#4A5A70', floorPattern: 1, floorScale: 0.3,
    room: '#F7F4EC', room2: '#4A5A70', roomPattern: 1, roomScale: 0.3,
    runner: '#3F8F8B', runnerEdge: '#FBF6EC',
    curtain: '#FBF6EC', blanket: '#F29CA8', blanket2: '#FFFFFF',
  },
  supply: {
    wall: '#F2D48B', wallStripe: '#EBC977', wainscot: '#B88A3E', trim: '#6B4430',
    floor: '#C99762', floor2: '#B5834F', floorPattern: 5, floorScale: 0.7,
    room: '#C99762', room2: '#B5834F', roomPattern: 5, roomScale: 0.7,
    runner: '#6E8F5C', runnerEdge: '#F2D48B',
    curtain: '#6E8F5C', blanket: '#6E8F5C', blanket2: '#F2D48B',
  },
  luggage: {
    wall: '#EDAA8C', wallStripe: '#E59B7C', wainscot: '#A0493B', trim: '#F3E3C3',
    floor: '#BE916A', floor2: '#A97E58', floorPattern: 9, floorScale: 0.32,
    room: '#BE916A', room2: '#A97E58', roomPattern: 9, roomScale: 0.32,
    runner: '#2C4A6E', runnerEdge: '#F3E3C3',
    curtain: '#2C4A6E', blanket: '#2C4A6E', blanket2: '#F3E3C3',
  },
};
