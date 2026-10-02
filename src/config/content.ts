import type { CarriageType, ItemKind, StaffRole } from '../core/types';
import type { IconName } from '../ui/icons';
import type { ClassId } from './classes';

/**
 * Content pack for route 1, Countryside Local. Routes, carriages, guests, stories and offers are data so
 * seasonal lines and collaborations can be added without touching systems (§13).
 */

export interface StationDef {
  id: string;
  name: string;
  /** Postcard art palette: sky top, sky bottom, hills. */
  postcard: [string, string, string];
  blurb: string;
}

export const STATIONS: StationDef[] = [
  { id: 'millbrook', name: 'Millbrook', postcard: ['#F7C873', '#FBE7B5', '#7FA54A'], blurb: 'A mill, a brook, and the best scones on the line.' },
  { id: 'hazelford', name: 'Hazelford', postcard: ['#9CC7E0', '#E4F0E8', '#6E9A45'], blurb: 'Hazel trees and a ford nobody has crossed since 1908.' },
  { id: 'barley-cross', name: 'Barley Cross', postcard: ['#F2B45E', '#F9DFA6', '#C9A445'], blurb: 'Golden fields as far as the tea gets cold.' },
  { id: 'wrenfield', name: 'Wrenfield', postcard: ['#E7A07A', '#F7D8B8', '#5F8E4E'], blurb: 'Famous for wrens. The wrens are unaware.' },
  { id: 'oakhollow', name: 'Oakhollow', postcard: ['#8FB4C9', '#DCE9DA', '#4C7A43'], blurb: 'An oak so old it has its own timetable.' },
  { id: 'thistledown', name: 'Thistledown', postcard: ['#B79BC9', '#EADDEB', '#6E8F57'], blurb: 'Purple hills and one very proud goat.' },
  { id: 'pennyridge', name: 'Pennyridge', postcard: ['#F0C27B', '#FBEBCB', '#8A9E4E'], blurb: 'Where the ridge is lovely and the pennies are lucky.' },
  { id: 'larkspur-halt', name: 'Larkspur Halt', postcard: ['#7F9CC9', '#D7E1F0', '#577E57'], blurb: 'A request stop. Please request it.' },
];

export type ArchetypeId = 'student' | 'backpacker' | 'tourist' | 'grandma' | 'family' | 'businessman' | 'newlyweds' | 'vip' | 'celebrity' | 'royal';

export interface ArchetypeDef {
  id: ArchetypeId;
  label: string;
  /** The class they travel in: they board only a carriage of this class (config/classes.ts). */
  cls: ClassId;
  /** How often they turn up among travellers of their class. */
  weight: number;
  fareMultiplier: number;
  tipMultiplier: number;
  speedMultiplier: number;
  /** Carriages coupled before this archetype starts appearing. */
  minCarriages: number;
  colors: { body: string; accent: string; skin: string; hair: string };
  accessory: 'briefcase' | 'backpack' | 'handbag' | 'flower' | 'child' | 'furcoat' | 'camera' | 'sash';
  hat?: 'beanie' | 'bun' | 'cap' | 'boater' | 'crown' | 'tophat';
  hatColor?: string;
  /** What they like best among their class's requests (weights multiply the class's own). */
  requests: Partial<Record<'tea' | 'coffee' | 'champagne' | 'blanket' | 'pillow' | 'towel', number>>;
  /** Their signature reaction now and then during the ride (an icon in a bubble, never a sentence). */
  mood: IconName;
  /** What they leave behind in the cabin (a few are picked each time; see MESS in economy.ts). */
  mess: MessPiece[];
}

/** Things a guest can leave on the cabin floor (built in world/Mess.ts). */
export type MessPiece =
  | 'newspaper' | 'cup' | 'papers' | 'paperBalls' | 'socks' | 'map' | 'wrappers' | 'bottle' | 'book' | 'yarn'
  | 'petals' | 'champagne' | 'teddy' | 'toyTrain' | 'appleCore' | 'boa' | 'cards';
/** How they leave the bed. */
export type BedMess = 'heap' | 'tangle' | 'kicked';
/** Bits anyone might leave, mixed in now and then so no two rooms look alike. */
export const COMMON_MESS: MessPiece[] = ['paperBalls', 'wrappers', 'cup'];

/**
 * Who travels, class by class. Fares and tips come mostly from the class (config/classes.ts); the archetype's
 * own multipliers are a light seasoning on top (a grandma tips a little more, a backpacker a little less).
 */
export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'student', label: 'Student', cls: 'basic', weight: 3, fareMultiplier: 0.95, tipMultiplier: 0.9, speedMultiplier: 1.14, minCarriages: 1,
    colors: { body: '#D9A03F', accent: '#34507A', skin: '#E8B894', hair: '#2E2420' }, accessory: 'backpack', hat: 'cap', requests: { pillow: 2, tea: 1.5 },
    mood: 'smile',
    mess: ['wrappers', 'paperBalls', 'book', 'socks'],
  },
  {
    id: 'backpacker', label: 'Backpacker', cls: 'basic', weight: 3, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 1.12, minCarriages: 1,
    colors: { body: '#6FA36B', accent: '#EE8F4A', skin: '#D9A07A', hair: '#8C5A32' }, accessory: 'backpack', hat: 'beanie', requests: { pillow: 2, blanket: 1 },
    mood: 'camera',
    mess: ['map', 'wrappers', 'socks', 'bottle'],
  },
  {
    id: 'tourist', label: 'Tourist', cls: 'comfort', weight: 3, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 0.98, minCarriages: 1,
    colors: { body: '#E07A5F', accent: '#FBF3E4', skin: '#F1C7A6', hair: '#8C5A32' }, accessory: 'camera', hat: 'boater', requests: { towel: 1.5, tea: 1.2 },
    mood: 'camera',
    mess: ['map', 'bottle', 'wrappers', 'cards'],
  },
  {
    id: 'grandma', label: 'Grandma', cls: 'comfort', weight: 2, fareMultiplier: 1, tipMultiplier: 1.2, speedMultiplier: 0.82, minCarriages: 1,
    colors: { body: '#B39BD1', accent: '#FBF6EC', skin: '#F2CFB3', hair: '#EFEFEF' }, accessory: 'handbag', hat: 'bun', requests: { blanket: 2, tea: 1.5 },
    mood: 'blanket',
    mess: ['yarn', 'book', 'cup', 'newspaper'],
  },
  {
    id: 'family', label: 'Family', cls: 'comfort', weight: 2, fareMultiplier: 1.15, tipMultiplier: 1.05, speedMultiplier: 0.95, minCarriages: 1,
    colors: { body: '#4F86B8', accent: '#F2C94C', skin: '#E3AE87', hair: '#2F2520' }, accessory: 'child', requests: { blanket: 1.5, towel: 1.2 },
    mood: 'smile',
    mess: ['teddy', 'toyTrain', 'appleCore', 'wrappers'],
  },
  {
    id: 'businessman', label: 'Business traveller', cls: 'business', weight: 3, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 1.08, minCarriages: 1,
    colors: { body: '#44556F', accent: '#C0485C', skin: '#F1C7A5', hair: '#3A2E28' }, accessory: 'briefcase', requests: { coffee: 2 },
    mood: 'tea',
    mess: ['newspaper', 'papers', 'cup', 'paperBalls'],
  },
  {
    id: 'newlyweds', label: 'Newlyweds', cls: 'first', weight: 1.5, fareMultiplier: 1.05, tipMultiplier: 1.25, speedMultiplier: 1, minCarriages: 1,
    colors: { body: '#FBF3E4', accent: '#E8849A', skin: '#EDBE9A', hair: '#5A3B2A' }, accessory: 'flower', requests: { champagne: 2 },
    mood: 'heart',
    mess: ['petals', 'champagne', 'cards', 'cup'],
  },
  {
    id: 'vip', label: 'VIP', cls: 'first', weight: 2, fareMultiplier: 1.1, tipMultiplier: 1.2, speedMultiplier: 0.9, minCarriages: 1,
    colors: { body: '#C8A27A', accent: '#E3B352', skin: '#F0C6A2', hair: '#1E1A18' }, accessory: 'furcoat', requests: { champagne: 1.5, coffee: 1.2 },
    mood: 'gem',
    mess: ['boa', 'champagne', 'cards', 'petals'],
  },
  {
    id: 'celebrity', label: 'Celebrity', cls: 'first', weight: 1.2, fareMultiplier: 1.15, tipMultiplier: 1.3, speedMultiplier: 0.95, minCarriages: 1,
    colors: { body: '#23202B', accent: '#E2B653', skin: '#C98E68', hair: '#1D1616' }, accessory: 'flower', hat: 'tophat', requests: { champagne: 2 },
    mood: 'star',
    mess: ['champagne', 'cards', 'boa', 'petals'],
  },
  {
    id: 'royal', label: 'Royalty', cls: 'royal', weight: 1, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 0.85, minCarriages: 1,
    colors: { body: '#6A1E2E', accent: '#E2B653', skin: '#F1C7A6', hair: '#C9A36A' }, accessory: 'sash', hat: 'crown', requests: { champagne: 1.5, tea: 1.2 },
    mood: 'crown',
    mess: ['champagne', 'petals', 'book', 'cards'],
  },
];

export type UnlockKind = 'cabin' | 'hire' | 'couple' | 'bathroom' | 'refurb' | 'staffUpgrade' | 'comfort' | 'exterior' | 'marketing';

/** Small comforts bought per carriage: each shows up in every room and lifts that carriage's tips. */
export type ComfortKey = 'lamp' | 'flowers' | 'radio' | 'soap' | 'rail';

export interface UnlockDef {
  id: string;
  kind: UnlockKind;
  label: string;
  price: number;
  stars: number;
  carriage: number;
  /** All of these unlocks must be complete before this tile appears. */
  requires: string[];
  /** Gameplay milestones that must have happened too (e.g. the player cleaned a cabin by hand first). */
  flags?: string[];
  cabin?: number;
  bathroom?: number;
  role?: StaffRole;
  /**
   * Refit tier this tile brings the carriage to: service cars 1 Repaired … 3 Luxurious; passenger carriages
   * 1 Repaired (Basic), 2 Comfort, 3 Business, 4 First Class, 5 Royal Suite (config/classes.ts).
   */
  tier?: number;
  comfort?: ComfortKey;
  /** What it does, in a few words, shown on the tile label so no purchase is a mystery. */
  effect: string;
}

/**
 * A tile inside a carriage, before it knows which slot the carriage took. `requires` lists keys of this
 * carriage's other tiles, 'couple' (the coupling that brought this carriage), or '@<id>' for any tile on
 * the train. '{n}' in a label becomes the train-wide cabin number.
 */
export interface UnlockTemplate {
  key: string;
  kind: Exclude<UnlockKind, 'couple' | 'exterior' | 'marketing'>;
  label: string;
  price: number;
  stars: number;
  requires: string[];
  flags?: string[];
  cabin?: number;
  bathroom?: number;
  role?: StaffRole;
  tier?: number;
  comfort?: ComfortKey;
  effect: string;
}

/**
 * The carriage catalogue: what can join the train, and the tiles that come with each. When a coupling is
 * paid for, the player picks the next carriage from what is allowed (the growing train is theirs to
 * design).
 */
export interface CarriageDef {
  type: CarriageType;
  name: string;
  /** What it gives, for the chooser card (three words or fewer). */
  pitch: string;
  /** How many a route-1 train may have. */
  max: number;
  /** Offered only once the train has one of these. */
  needs?: CarriageType[];
  /** Cabins in its floor plan (for train-wide cabin numbers on tiles). */
  cabins: number;
  /** What is inside, for the chooser card. */
  inside: string;
  unlocks: UnlockTemplate[];
}

export const CARRIAGE_CATALOGUE: Record<CarriageType, CarriageDef> = {
  lobby: {
    type: 'lobby', name: 'Sleeper & Lobby', pitch: 'Desk, 3 berths', max: 1, cabins: 3, inside: 'Reception desk, 3 berths',
    unlocks: [
      { key: 'cabin_1', kind: 'cabin', label: 'Cabin {n}', price: 30, stars: 2, cabin: 1, requires: [], effect: '+1 guest' },
      { key: 'hire_attendant', kind: 'hire', label: 'Attendant', price: 45, stars: 3, role: 'attendant', requires: ['cabin_1'], flags: ['firstCabinCleaned'], effect: 'Cleans cabins' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 60, stars: 3, tier: 1, requires: ['hire_attendant'], effect: 'Fares +25%' },
      { key: 'cabin_2', kind: 'cabin', label: 'Cabin {n}', price: 55, stars: 2, cabin: 2, requires: ['hire_attendant'], effect: '+1 guest' },
      { key: 'refurb_2', kind: 'refurb', label: 'Comfort Class', price: 150, stars: 4, tier: 2, requires: ['refurb_1', '@couple_1'], flags: ['level_2'], effect: '2 cabins · Fares ×2.5' },
      { key: 'comfort_lamp', kind: 'comfort', label: 'Reading Lamps', price: 85, stars: 2, comfort: 'lamp', requires: ['refurb_1', '@couple_1'], effect: 'Tips +20%' },
      { key: 'hire_porter', kind: 'hire', label: 'Porter', price: 160, stars: 3, role: 'porter', requires: ['@couple_2'], effect: 'Check-in & bags' },
      { key: 'comfort_flowers', kind: 'comfort', label: 'Fresh Flowers', price: 150, stars: 2, comfort: 'flowers', requires: ['comfort_lamp', '@couple_2'], effect: 'Tips +20%' },
      { key: 'up_attendant', kind: 'staffUpgrade', label: 'Attendant Training', price: 240, stars: 2, role: 'attendant', requires: ['hire_porter', '@couple_3'], effect: 'Faster, +1 carry' },
      { key: 'comfort_radio', kind: 'comfort', label: 'Wireless Radios', price: 320, stars: 2, comfort: 'radio', requires: ['comfort_flowers', '@couple_3'], effect: 'Tips +20%' },
      { key: 'up_porter', kind: 'staffUpgrade', label: 'Porter Training', price: 420, stars: 2, role: 'porter', requires: ['hire_porter', '@couple_3'], effect: 'Faster, +1 carry' },
      { key: 'refurb_3', kind: 'refurb', label: 'Business Class', price: 880, stars: 5, tier: 3, requires: ['refurb_2'], flags: ['level_4'], effect: 'Fares ×5' },
      { key: 'refurb_4', kind: 'refurb', label: 'First Class', price: 1700, stars: 6, tier: 4, requires: ['refurb_3'], flags: ['level_6'], effect: 'Fares ×14' },
      { key: 'up2_attendant', kind: 'staffUpgrade', label: 'Attendant Mastery', price: 1100, stars: 3, role: 'attendant', requires: ['up_attendant'], flags: ['level_6'], effect: 'Faster, +1 carry' },
      { key: 'up2_porter', kind: 'staffUpgrade', label: 'Porter Mastery', price: 1300, stars: 3, role: 'porter', requires: ['up_porter'], flags: ['level_7'], effect: 'Faster, +1 carry' },
      { key: 'refurb_5', kind: 'refurb', label: 'Royal Suite', price: 3300, stars: 8, tier: 5, requires: ['refurb_4'], flags: ['level_8'], effect: 'One suite · Fares ×40' },
    ],
  },
  bathroom: {
    type: 'bathroom', name: 'Washroom Car', pitch: '+3 washrooms', max: 1, cabins: 0, inside: '3 washrooms, a linen closet, the laundry',
    unlocks: [
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs & Tiles', price: 70, stars: 3, tier: 1, requires: ['couple', '@couple_2'], effect: 'Tips +50%' },
      { key: 'bath_1', kind: 'bathroom', label: 'Washroom 2', price: 90, stars: 2, bathroom: 1, requires: ['couple', '@couple_2'], effect: '+1 washroom' },
      { key: 'comfort_soap', kind: 'comfort', label: 'Scented Soaps', price: 110, stars: 2, comfort: 'soap', requires: ['refurb_1'], effect: 'Tips +25%' },
      { key: 'bath_2', kind: 'bathroom', label: 'Bath Suite', price: 200, stars: 3, bathroom: 2, requires: ['bath_1', '@couple_3'], effect: '+1 washroom' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Washrooms', price: 260, stars: 4, tier: 2, requires: ['refurb_1', '@couple_3'], effect: 'Tips +50%' },
      { key: 'comfort_rail', kind: 'comfort', label: 'Warm Towel Rails', price: 240, stars: 2, comfort: 'rail', requires: ['comfort_soap', '@couple_3'], effect: 'Tips +25%' },
      { key: 'refurb_3', kind: 'refurb', label: 'Marble & Brass', price: 520, stars: 5, tier: 3, requires: ['refurb_2', '@couple_4'], effect: 'Tips +50%' },
    ],
  },
  supply: {
    type: 'supply', name: 'Stores Car', pitch: 'Runner, stores', max: 1, needs: ['bathroom'], cabins: 0, inside: 'Stores, crate bay, a staff room, a runner',
    unlocks: [
      { key: 'hire_runner', kind: 'hire', label: 'Supply Runner', price: 100, stars: 3, role: 'runner', requires: ['couple'], effect: 'Restocks towels' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 80, stars: 3, tier: 1, requires: ['hire_runner'], effect: 'All tips +5%' },
      { key: 'up_runner', kind: 'staffUpgrade', label: 'Runner Training', price: 300, stars: 2, role: 'runner', requires: ['hire_runner', '@couple_4'], effect: 'Faster, +1 carry' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 280, stars: 4, tier: 2, requires: ['refurb_1', '@couple_3'], effect: 'All tips +5%' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 520, stars: 5, tier: 3, requires: ['refurb_2', '@c0.refurb_3'], effect: 'All tips +5%' },
      { key: 'up2_runner', kind: 'staffUpgrade', label: 'Runner Mastery', price: 1000, stars: 3, role: 'runner', requires: ['up_runner'], flags: ['level_6'], effect: 'Faster, +1 carry' },
    ],
  },
  luggage: {
    type: 'luggage', name: 'Luggage Car', pitch: '+16 bag racks', max: 1, cabins: 0, inside: 'Racks for 16 bags, a porter',
    unlocks: [
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 100, stars: 3, tier: 1, requires: ['couple'], effect: 'All tips +5%' },
      { key: 'hire_porter', kind: 'hire', label: 'Luggage Porter', price: 220, stars: 3, role: 'porter', requires: ['couple'], effect: 'Carries bags' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 300, stars: 4, tier: 2, requires: ['refurb_1', '@couple_4'], effect: 'All tips +5%' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 520, stars: 5, tier: 3, requires: ['refurb_2', '@c0.refurb_3'], effect: 'All tips +5%' },
      { key: 'up_porter', kind: 'staffUpgrade', label: 'Porter Mastery', price: 1050, stars: 3, role: 'porter', requires: ['hire_porter'], flags: ['level_7'], effect: 'Faster, +1 carry' },
    ],
  },
  sleeper: {
    type: 'sleeper', name: 'Sleeper Car', pitch: '+6 berths', max: 2, cabins: 6, inside: '6 berths and a tea and linen nook',
    unlocks: [
      { key: 'cabin_0', kind: 'cabin', label: 'Cabin {n}', price: 60, stars: 2, cabin: 0, requires: ['couple'], effect: '+1 guest' },
      { key: 'cabin_1', kind: 'cabin', label: 'Cabin {n}', price: 90, stars: 2, cabin: 1, requires: ['cabin_0'], effect: '+1 guest' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 120, stars: 3, tier: 1, requires: ['cabin_0'], effect: 'Fares +25%' },
      { key: 'comfort_lamp', kind: 'comfort', label: 'Reading Lamps', price: 130, stars: 2, comfort: 'lamp', requires: ['refurb_1'], effect: 'Tips +20%' },
      { key: 'cabin_2', kind: 'cabin', label: 'Cabin {n}', price: 150, stars: 2, cabin: 2, requires: ['cabin_1'], effect: '+1 guest' },
      { key: 'refurb_2', kind: 'refurb', label: 'Comfort Class', price: 300, stars: 4, tier: 2, requires: ['cabin_1', 'refurb_1'], flags: ['level_2'], effect: '4 cabins · Fares ×2.5' },
      { key: 'cabin_3', kind: 'cabin', label: 'Cabin {n}', price: 200, stars: 2, cabin: 3, requires: ['cabin_2', '@couple_2'], effect: '+1 guest' },
      { key: 'cabin_4', kind: 'cabin', label: 'Cabin {n}', price: 240, stars: 2, cabin: 4, requires: ['cabin_3'], effect: '+1 guest' },
      { key: 'cabin_5', kind: 'cabin', label: 'Cabin {n}', price: 280, stars: 2, cabin: 5, requires: ['cabin_4'], effect: '+1 guest' },
      { key: 'hire_attendant', kind: 'hire', label: 'Attendant', price: 240, stars: 3, role: 'attendant', requires: ['cabin_1', '@couple_2'], effect: 'Cleans cabins' },
      { key: 'comfort_flowers', kind: 'comfort', label: 'Fresh Flowers', price: 240, stars: 2, comfort: 'flowers', requires: ['comfort_lamp', '@couple_3'], effect: 'Tips +20%' },
      { key: 'up_attendant', kind: 'staffUpgrade', label: 'Attendant Training', price: 380, stars: 2, role: 'attendant', requires: ['hire_attendant', '@couple_3'], effect: 'Faster, +1 carry' },
      { key: 'comfort_radio', kind: 'comfort', label: 'Wireless Radios', price: 420, stars: 2, comfort: 'radio', requires: ['comfort_flowers', '@couple_3'], effect: 'Tips +20%' },
      { key: 'refurb_3', kind: 'refurb', label: 'Business Class', price: 1350, stars: 5, tier: 3, requires: ['refurb_2'], flags: ['level_4'], effect: '3 cabins · Fares ×5' },
      { key: 'refurb_4', kind: 'refurb', label: 'First Class', price: 2200, stars: 6, tier: 4, requires: ['refurb_3'], flags: ['level_6'], effect: '2 suites · Fares ×14' },
      { key: 'up2_attendant', kind: 'staffUpgrade', label: 'Attendant Mastery', price: 1250, stars: 3, role: 'attendant', requires: ['up_attendant'], flags: ['level_6'], effect: 'Faster, +1 carry' },
      { key: 'refurb_5', kind: 'refurb', label: 'Royal Suite', price: 4100, stars: 8, tier: 5, requires: ['refurb_4'], flags: ['level_8'], effect: 'One grand suite · Fares ×40' },
    ],
  },
};

/** Types the player may choose at a coupling, in default order. */
export const CHOOSABLE: CarriageType[] = ['bathroom', 'supply', 'sleeper', 'luggage'];

/** The train a new player grows by following the recommended picks (previews and tests use it too). */
export const DEFAULT_TRAIN: CarriageType[] = ['lobby', 'sleeper', 'bathroom', 'supply', 'luggage'];

/** Couplings: each adds one carriage of the player's choice. */
export interface CoupleSlot {
  price: number;
  stars: number;
  requires: string[];
}

export const COUPLE_SLOTS: CoupleSlot[] = [
  // Session 15: 120 (was 150). The Rush streak, whose bonuses used to fund the first carriage, now starts after
  // this coupling (one layer at a time), so the first coupling still lands at about four minutes.
  { price: 120, stars: 6, requires: ['c0.hire_attendant'] },
  { price: 240, stars: 6, requires: ['couple_1'] },
  { price: 380, stars: 8, requires: ['couple_2'] },
  { price: 600, stars: 8, requires: ['couple_3'] },
];
/** Route 1 holds this many carriages: fewer than the catalogue offers, so every pick is a real choice. */
export const MAX_CARRIAGES = COUPLE_SLOTS.length + 1;

/** Each later slot makes a carriage's own tiles this much dearer (a second sleeper is a bigger step). */
export const SLOT_PRICE_STEP = 0.15;

/**
 * Station upgrades: bought on the platform, only while the train is in. The workshop does up the outside
 * of the whole train (you see it from the platform); marketing brings more travellers and better ones to
 * every stop (so more cabins pay off). Ids become 'st.<key>'.
 */
export interface StationUpgradeDef {
  key: string;
  kind: 'exterior' | 'marketing';
  label: string;
  price: number;
  stars: number;
  requires: string[];
  effect: string;
  bonus: { tips?: number; fares?: number; passengers?: number; vip?: number; stationBonus?: number };
}

export const STATION_UPGRADES: StationUpgradeDef[] = [
  { key: 'posters', kind: 'marketing', label: 'Station Posters', price: 80, stars: 3, requires: ['couple_1'], effect: '+1 traveller', bonus: { passengers: 1 } },
  { key: 'windowboxes', kind: 'exterior', label: 'Window Boxes', price: 110, stars: 3, requires: ['couple_1'], effect: 'Tips +5%', bonus: { tips: 0.05 } },
  { key: 'lamps', kind: 'exterior', label: 'Brass Lamps', price: 200, stars: 3, requires: ['st.windowboxes', 'couple_2'], effect: 'Tips +5%', bonus: { tips: 0.05 } },
  { key: 'billboard', kind: 'marketing', label: 'Billboards', price: 240, stars: 3, requires: ['st.posters', 'couple_2'], effect: '+1 traveller, VIPs', bonus: { passengers: 1, vip: 0.6 } },
  { key: 'lining', kind: 'exterior', label: 'Gold Lining', price: 340, stars: 4, requires: ['st.lamps', 'couple_3'], effect: 'Fares +5%', bonus: { fares: 0.05 } },
  { key: 'band', kind: 'marketing', label: 'Brass Band', price: 460, stars: 4, requires: ['st.billboard', 'couple_3'], effect: '+1 traveller', bonus: { passengers: 1, stationBonus: 0.5 } },
  { key: 'nameboards', kind: 'exterior', label: 'Name Boards', price: 520, stars: 4, requires: ['st.lining', 'couple_4'], effect: 'Fares +5%', bonus: { fares: 0.05 } },
  { key: 'redcarpet', kind: 'exterior', label: 'Red Carpet', price: 700, stars: 5, requires: ['st.nameboards'], effect: 'Stop bonus +50%', bonus: { stationBonus: 0.5 } },
];

/** Pre-v3 saves grew in this fixed order; the migration maps their ids onto carriage slots. */
export const LEGACY_TRAIN: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper'];

/** Old unlock ids and what they became, for save migration (bedding upgrades became refurbishments). */
export const RENAMED_UNLOCKS: Record<string, string> = {
  bedding_0: 'refurb_0_1',
  bedding2_0: 'refurb_0_2',
  bedding_4: 'refurb_4_1',
};

export const REQUEST_ITEMS: ItemKind[] = ['tea', 'blanket', 'pillow'];

export interface StoryStepDef {
  kind: 'request' | 'ride' | 'cleanStop';
  item?: ItemKind;
  line: string;
}

export interface StoryDef {
  id: string;
  name: string;
  title: string;
  colors: { body: string; accent: string; skin: string; hair: string };
  intro: string;
  steps: StoryStepDef[];
  perk: { kind: 'tipBonus' | 'fareBonus'; amount: number; label: string };
  postcard: [string, string, string];
}

export const STORIES: StoryDef[] = [
  {
    id: 'walter', name: 'Walter', title: 'Retired conductor',
    colors: { body: '#2E3F5C', accent: '#D9A441', skin: '#EFC9A8', hair: '#E6E6E6' },
    intro: 'Forty years on the footplate. Now he wants to ride it properly.',
    steps: [
      { kind: 'request', item: 'tea', line: 'Strong enough to stand a spoon in, please.' },
      { kind: 'request', item: 'blanket', line: 'The draught in carriage one never changes.' },
      { kind: 'ride', line: 'One more stop. I proposed on that platform.' },
    ],
    perk: { kind: 'tipBonus', amount: 0.1, label: '+10% tips, for good' },
    postcard: ['#2E3F5C', '#E7B98A', '#5F7F4E'],
  },
  {
    id: 'priya', name: 'Priya', title: 'Travel vlogger',
    colors: { body: '#E0567A', accent: '#FFD35C', skin: '#C98E68', hair: '#1D1616' },
    intro: '1.2 million followers and not one decent train pillow.',
    steps: [
      { kind: 'request', item: 'pillow', line: 'Pillow review in three, two, one…' },
      { kind: 'request', item: 'tea', line: 'Tea for the golden-hour shot!' },
      { kind: 'cleanStop', line: 'Film me a perfect station stop!' },
    ],
    perk: { kind: 'fareBonus', amount: 0.08, label: '+8% fares, for good' },
    postcard: ['#E0567A', '#FFD9A0', '#6E9A55'],
  },
];

export type QuestKind = 'serveGuests' | 'cleanCabins' | 'fulfilRequests' | 'loadLuggage' | 'cleanStops';

export interface QuestDef {
  kind: QuestKind;
  label: string;
  target: number;
  reward: { gems?: number; railMiles?: number };
}

export const QUEST_POOL: QuestDef[] = [
  { kind: 'serveGuests', label: 'Check in guests', target: 12, reward: { railMiles: 2 } },
  { kind: 'cleanCabins', label: 'Clean cabins', target: 8, reward: { gems: 10 } },
  { kind: 'fulfilRequests', label: 'Fulfil requests', target: 10, reward: { railMiles: 2 } },
  { kind: 'loadLuggage', label: 'Load luggage', target: 10, reward: { gems: 10 } },
  { kind: 'cleanStops', label: 'Perfect station stops', target: 2, reward: { railMiles: 3 } },
];

export interface ProductDef {
  id: string;
  name: string;
  kind: 'consumable' | 'nonConsumable';
  price: string;
  discountPrice?: string;
  description: string;
  grants: { gems?: number; railMiles?: number; noForcedAds?: boolean; scooter?: boolean };
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'first_class_ticket', name: 'First Class Ticket', kind: 'nonConsumable', price: '$4.99', discountPrice: '$2.99',
    description: 'No forced ads, ever, on every route. Plus 300 gems and 10 Rail Miles.',
    grants: { noForcedAds: true, gems: 300, railMiles: 10 },
  },
  {
    id: 'conductor_scooter', name: "Conductor's Scooter", kind: 'nonConsumable', price: '$6.99',
    description: 'A shiny rail scooter: +25% speed, forever, plus a brass-trimmed look.',
    grants: { scooter: true },
  },
  { id: 'gems_tier_1', name: 'Pocket of Gems', kind: 'consumable', price: '$0.99', description: '80 gems', grants: { gems: 80 } },
  { id: 'gems_tier_2', name: 'Pouch of Gems', kind: 'consumable', price: '$4.99', description: '500 gems', grants: { gems: 500 } },
  { id: 'gems_tier_3', name: 'Satchel of Gems', kind: 'consumable', price: '$9.99', description: '1,100 gems', grants: { gems: 1100 } },
  { id: 'gems_tier_4', name: 'Trunk of Gems', kind: 'consumable', price: '$19.99', description: '2,400 gems', grants: { gems: 2400 } },
  { id: 'gems_tier_5', name: 'Vault of Gems', kind: 'consumable', price: '$49.99', description: '6,500 gems', grants: { gems: 6500 } },
  { id: 'gems_tier_6', name: 'Station of Gems', kind: 'consumable', price: '$99.99', description: '14,000 gems', grants: { gems: 14000 } },
];

export const SCOOTER_SPEED_BONUS = 0.25;

/** Gems → Fares exchange in the store, scaled to the next tile so it always feels useful. */
export const GEM_EXCHANGE = { gems: 20, fractionOfNextTile: 1.0, minCash: 60 };
