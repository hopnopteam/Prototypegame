import type { CarriageType, ItemKind, StaffRole } from '../core/types';

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

export type ArchetypeId = 'businessman' | 'backpacker' | 'grandma' | 'newlyweds' | 'family' | 'vip';

export interface ArchetypeDef {
  id: ArchetypeId;
  label: string;
  weight: number;
  fareMultiplier: number;
  tipMultiplier: number;
  speedMultiplier: number;
  /** Carriages coupled before this archetype starts appearing. */
  minCarriages: number;
  colors: { body: string; accent: string; skin: string; hair: string };
  accessory: 'briefcase' | 'backpack' | 'handbag' | 'flower' | 'child' | 'furcoat';
  /** What they tend to ask for: personality you can learn and plan around. */
  requests: Partial<Record<'tea' | 'blanket' | 'pillow', number>>;
  lines: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'businessman', label: 'Businessman', weight: 3, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 1.08, minCarriages: 1,
    colors: { body: '#5B6C85', accent: '#C0485C', skin: '#F1C7A5', hair: '#3A2E28' }, accessory: 'briefcase', requests: { tea: 4, pillow: 1, blanket: 1 },
    lines: ['Tea. Urgently.', 'Is the Wi-Fi steam powered?', 'Wake me at the meeting.'],
  },
  {
    id: 'backpacker', label: 'Backpacker', weight: 3, fareMultiplier: 0.9, tipMultiplier: 0.8, speedMultiplier: 1.12, minCarriages: 1,
    colors: { body: '#6FA36B', accent: '#EE8F4A', skin: '#D9A07A', hair: '#8C5A32' }, accessory: 'backpack', requests: { pillow: 4, tea: 1, blanket: 1 },
    lines: ['Best hostel ever!', 'Do you have a spare pillow? Asking for me.', 'I packed light. Mostly snacks.'],
  },
  {
    id: 'grandma', label: 'Grandma', weight: 2, fareMultiplier: 1, tipMultiplier: 1.25, speedMultiplier: 0.82, minCarriages: 1,
    colors: { body: '#B39BD1', accent: '#FBF6EC', skin: '#F2CFB3', hair: '#EFEFEF' }, accessory: 'handbag', requests: { blanket: 4, tea: 2, pillow: 1 },
    lines: ['Lovely train, dear.', 'A blanket would be heaven.', 'In my day trains had fewer buttons.'],
  },
  {
    id: 'newlyweds', label: 'Newlyweds', weight: 1.2, fareMultiplier: 1.1, tipMultiplier: 1.35, speedMultiplier: 1, minCarriages: 1,
    colors: { body: '#FBF3E4', accent: '#E8849A', skin: '#EDBE9A', hair: '#5A3B2A' }, accessory: 'flower', requests: { tea: 3, pillow: 2, blanket: 1 },
    lines: ['Just married!', 'Two teas, one straw.', 'Our first trip together!'],
  },
  {
    id: 'family', label: 'Family', weight: 1.5, fareMultiplier: 1.2, tipMultiplier: 1.1, speedMultiplier: 0.95, minCarriages: 2,
    colors: { body: '#4F86B8', accent: '#F2C94C', skin: '#E3AE87', hair: '#2F2520' }, accessory: 'child', requests: { blanket: 2, pillow: 2, tea: 1 },
    lines: ['Are we there yet?', 'She wants the top bunk.', 'Snacks for the small one?'],
  },
  {
    id: 'vip', label: 'VIP', weight: 0.6, fareMultiplier: 1.6, tipMultiplier: 2.4, speedMultiplier: 0.9, minCarriages: 3,
    colors: { body: '#C8A27A', accent: '#E3B352', skin: '#F0C6A2', hair: '#1E1A18' }, accessory: 'furcoat', requests: { tea: 2, pillow: 2, blanket: 2 },
    lines: ['Darling, is this first class?', 'I tip in the currency of joy. And cash.', 'The fur is faux. The tips are real.'],
  },
];

export type UnlockKind = 'cabin' | 'hire' | 'couple' | 'bathroom' | 'refurb' | 'staffUpgrade' | 'exterior' | 'marketing';

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
  /** Refurbishment tier this tile brings the carriage to (1 Freshly painted … 3 Luxurious). */
  tier?: number;
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
  /** One line for the chooser card: why you would want it. */
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
    type: 'lobby', name: 'Sleeper & Lobby', pitch: 'Where it all began.', max: 1, cabins: 2, inside: 'Reception desk, 2 cabins',
    unlocks: [
      { key: 'cabin_1', kind: 'cabin', label: 'Cabin {n}', price: 30, stars: 2, cabin: 1, requires: [], effect: 'Room for one more guest' },
      { key: 'hire_attendant', kind: 'hire', label: 'Attendant', price: 45, stars: 3, role: 'attendant', requires: ['cabin_1'], flags: ['firstCabinCleaned'], effect: 'Cleans cabins for you' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 40, stars: 3, tier: 1, requires: ['hire_attendant'], effect: 'Fares +25% in this carriage' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 110, stars: 4, tier: 2, requires: ['refurb_1', '@couple_2'], effect: 'Fares +25% more in this carriage' },
      { key: 'hire_porter', kind: 'hire', label: 'Porter', price: 110, stars: 3, role: 'porter', requires: ['@couple_2'], effect: 'Checks guests in and loads luggage' },
      { key: 'up_attendant', kind: 'staffUpgrade', label: 'Attendant Training', price: 110, stars: 2, role: 'attendant', requires: ['hire_porter'], effect: 'Attendant +20% speed, +1 carry' },
      { key: 'up_porter', kind: 'staffUpgrade', label: 'Porter Training', price: 300, stars: 2, role: 'porter', requires: ['@couple_4'], effect: 'Porter +20% speed, +1 carry' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 380, stars: 5, tier: 3, requires: ['refurb_2', '@couple_4'], effect: 'Fares +25% more, and it shows' },
    ],
  },
  bathroom: {
    type: 'bathroom', name: 'Washroom Car', pitch: 'Guests tip for a fresh washroom. Its own closet keeps it stocked.', max: 1, cabins: 0, inside: '3 washrooms, a linen closet, the laundry',
    unlocks: [
      { key: 'bath_1', kind: 'bathroom', label: 'Washroom 2', price: 50, stars: 2, bathroom: 1, requires: ['couple', '@couple_2'], effect: 'Shorter washroom queues' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs & Tiles', price: 60, stars: 3, tier: 1, requires: ['couple', '@couple_2'], effect: 'Washroom tips +50%' },
      { key: 'bath_2', kind: 'bathroom', label: 'Bath Suite', price: 120, stars: 3, bathroom: 2, requires: ['bath_1', '@couple_3'], effect: 'A third washroom, with a tub' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Washrooms', price: 180, stars: 4, tier: 2, requires: ['refurb_1', '@couple_3'], effect: 'Washroom tips +50% more' },
      { key: 'refurb_3', kind: 'refurb', label: 'Marble & Brass', price: 340, stars: 5, tier: 3, requires: ['refurb_2', '@couple_4'], effect: 'Washroom tips +50% more' },
    ],
  },
  supply: {
    type: 'supply', name: 'Stores Car', pitch: 'A runner keeps every washroom stocked for you.', max: 1, needs: ['bathroom'], cabins: 0, inside: 'Stores, crate bay, a staff room, a runner',
    unlocks: [
      { key: 'hire_runner', kind: 'hire', label: 'Supply Runner', price: 80, stars: 3, role: 'runner', requires: ['couple'], effect: 'Restocks washrooms for you' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 55, stars: 3, tier: 1, requires: ['hire_runner'], effect: 'Every tip on the train +5%' },
      { key: 'up_runner', kind: 'staffUpgrade', label: 'Runner Training', price: 260, stars: 2, role: 'runner', requires: ['hire_runner', '@couple_4'], effect: 'Runner +20% speed, +1 carry' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 220, stars: 4, tier: 2, requires: ['refurb_1', '@couple_4'], effect: 'Every tip on the train +5% more' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 420, stars: 5, tier: 3, requires: ['refurb_2', '@c0.refurb_3'], effect: 'Every tip on the train +5% more' },
    ],
  },
  luggage: {
    type: 'luggage', name: 'Luggage Car', pitch: 'Room for 16 more suitcases: every bag tips.', max: 1, cabins: 0, inside: 'Racks for 16 bags, a porter',
    unlocks: [
      { key: 'hire_porter', kind: 'hire', label: 'Luggage Porter', price: 200, stars: 3, role: 'porter', requires: ['couple'], effect: 'Carries luggage to the back' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 90, stars: 3, tier: 1, requires: ['couple'], effect: 'Every tip on the train +5%' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 240, stars: 4, tier: 2, requires: ['refurb_1', '@couple_4'], effect: 'Every tip on the train +5% more' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 440, stars: 5, tier: 3, requires: ['refurb_2', '@c0.refurb_3'], effect: 'Every tip on the train +5% more' },
    ],
  },
  sleeper: {
    type: 'sleeper', name: 'Sleeper Car', pitch: 'Four more cabins: more guests, more fares.', max: 2, cabins: 4, inside: '4 cabins and a tea and linen nook',
    unlocks: [
      { key: 'cabin_0', kind: 'cabin', label: 'Cabin {n}', price: 60, stars: 2, cabin: 0, requires: ['couple'], effect: 'Room for one more guest' },
      { key: 'cabin_1', kind: 'cabin', label: 'Cabin {n}', price: 90, stars: 2, cabin: 1, requires: ['cabin_0'], effect: 'Room for one more guest' },
      { key: 'refurb_1', kind: 'refurb', label: 'Repairs', price: 120, stars: 3, tier: 1, requires: ['cabin_0'], effect: 'Fares +25% in this carriage' },
      { key: 'hire_attendant', kind: 'hire', label: 'Attendant', price: 240, stars: 3, role: 'attendant', requires: ['cabin_1'], effect: "Cleans this car's cabins" },
      { key: 'cabin_2', kind: 'cabin', label: 'Cabin {n}', price: 130, stars: 2, cabin: 2, requires: ['cabin_1'], effect: 'Room for one more guest' },
      { key: 'cabin_3', kind: 'cabin', label: 'Cabin {n}', price: 180, stars: 2, cabin: 3, requires: ['cabin_2'], effect: 'Room for one more guest' },
      { key: 'refurb_2', kind: 'refurb', label: 'Cosy Makeover', price: 260, stars: 4, tier: 2, requires: ['cabin_2', 'refurb_1'], effect: 'Fares +25% more in this carriage' },
      { key: 'up_attendant', kind: 'staffUpgrade', label: 'Attendant Training', price: 380, stars: 2, role: 'attendant', requires: ['hire_attendant'], effect: 'Attendant +20% speed, +1 carry' },
      { key: 'refurb_3', kind: 'refurb', label: 'Luxury Refit', price: 480, stars: 5, tier: 3, requires: ['cabin_3', 'refurb_2'], effect: 'Fares +25% more, and it shows' },
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
  { price: 140, stars: 6, requires: ['c0.hire_attendant'] },
  { price: 95, stars: 6, requires: ['couple_1'] },
  { price: 170, stars: 8, requires: ['couple_2'] },
  { price: 400, stars: 8, requires: ['couple_3'] },
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
  { key: 'posters', kind: 'marketing', label: 'Station Posters', price: 60, stars: 3, requires: ['couple_1'], effect: '+1 traveller at every stop', bonus: { passengers: 1 } },
  { key: 'windowboxes', kind: 'exterior', label: 'Window Boxes', price: 80, stars: 3, requires: ['couple_1'], effect: 'Tips +5% (and flowers!)', bonus: { tips: 0.05 } },
  { key: 'lamps', kind: 'exterior', label: 'Brass Lamps', price: 120, stars: 3, requires: ['st.windowboxes', 'couple_2'], effect: 'Tips +5% more', bonus: { tips: 0.05 } },
  { key: 'billboard', kind: 'marketing', label: 'Billboards', price: 140, stars: 3, requires: ['st.posters', 'couple_2'], effect: '+1 traveller, more VIPs', bonus: { passengers: 1, vip: 0.6 } },
  { key: 'lining', kind: 'exterior', label: 'Gold Lining', price: 180, stars: 4, requires: ['st.lamps', 'couple_3'], effect: 'Fares +5% on the whole train', bonus: { fares: 0.05 } },
  { key: 'band', kind: 'marketing', label: 'Brass Band', price: 320, stars: 4, requires: ['st.billboard', 'couple_3'], effect: '+1 traveller, station bonus +50%', bonus: { passengers: 1, stationBonus: 0.5 } },
  { key: 'nameboards', kind: 'exterior', label: 'Name Boards', price: 300, stars: 4, requires: ['st.lining', 'couple_4'], effect: 'Fares +5% more', bonus: { fares: 0.05 } },
  { key: 'redcarpet', kind: 'exterior', label: 'Red Carpet', price: 420, stars: 5, requires: ['st.nameboards'], effect: 'Station bonus +50% more', bonus: { stationBonus: 0.5 } },
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
