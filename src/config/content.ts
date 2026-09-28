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
  lines: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'businessman', label: 'Businessman', weight: 3, fareMultiplier: 1, tipMultiplier: 1, speedMultiplier: 1.08, minCarriages: 1,
    colors: { body: '#56606E', accent: '#E8E3D8', skin: '#F1C7A5', hair: '#3A2E28' }, accessory: 'briefcase',
    lines: ['Tea. Urgently.', 'Is the Wi-Fi steam powered?', 'Wake me at the meeting.'],
  },
  {
    id: 'backpacker', label: 'Backpacker', weight: 3, fareMultiplier: 0.9, tipMultiplier: 0.8, speedMultiplier: 1.12, minCarriages: 1,
    colors: { body: '#5E8C3E', accent: '#E48A3A', skin: '#D9A07A', hair: '#8C5A32' }, accessory: 'backpack',
    lines: ['Best hostel ever!', 'Do you have a spare pillow? Asking for me.', 'I packed light. Mostly snacks.'],
  },
  {
    id: 'grandma', label: 'Grandma', weight: 2, fareMultiplier: 1, tipMultiplier: 1.25, speedMultiplier: 0.82, minCarriages: 1,
    colors: { body: '#9B7FBD', accent: '#F4EEF7', skin: '#F2CFB3', hair: '#EDEDED' }, accessory: 'handbag',
    lines: ['Lovely train, dear.', 'A blanket would be heaven.', 'In my day trains had fewer buttons.'],
  },
  {
    id: 'newlyweds', label: 'Newlyweds', weight: 1.2, fareMultiplier: 1.1, tipMultiplier: 1.35, speedMultiplier: 1, minCarriages: 1,
    colors: { body: '#F3EDE4', accent: '#E26D8C', skin: '#EDBE9A', hair: '#5A3B2A' }, accessory: 'flower',
    lines: ['Just married!', 'Two teas, one straw.', 'Our first trip together!'],
  },
  {
    id: 'family', label: 'Family', weight: 1.5, fareMultiplier: 1.2, tipMultiplier: 1.1, speedMultiplier: 0.95, minCarriages: 2,
    colors: { body: '#3F7FB8', accent: '#F2C94C', skin: '#E3AE87', hair: '#2F2520' }, accessory: 'child',
    lines: ['Are we there yet?', 'She wants the top bunk.', 'Snacks for the small one?'],
  },
  {
    id: 'vip', label: 'VIP', weight: 0.6, fareMultiplier: 1.6, tipMultiplier: 2.4, speedMultiplier: 0.9, minCarriages: 3,
    colors: { body: '#C7A27C', accent: '#D9A441', skin: '#F0C6A2', hair: '#1E1A18' }, accessory: 'furcoat',
    lines: ['Darling, is this first class?', 'I tip in the currency of joy. And cash.', 'The fur is faux. The tips are real.'],
  },
];

/** Carriages in route 1, in coupling order. Index 0 is on the train from the start. */
export interface CarriagePlan {
  type: CarriageType;
  name: string;
}

export const ROUTE1_CARRIAGES: CarriagePlan[] = [
  { type: 'lobby', name: 'Sleeper & Lobby' },
  { type: 'bathroom', name: 'Bathroom Car' },
  { type: 'supply', name: 'Supply Car' },
  { type: 'luggage', name: 'Luggage Car' },
  { type: 'sleeper', name: 'Sleeper Car II' },
];

export type UnlockKind = 'cabin' | 'hire' | 'couple' | 'bathroom' | 'bedding' | 'staffUpgrade';

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
}

/**
 * The unlock chain: each completion reveals the next tiles, so the next goal is always visible and
 * 20–60 seconds away (§9). Prices are tuned to the §14 first-session timeline.
 */
export const UNLOCKS: UnlockDef[] = [
  { id: 'cabin_0_1', kind: 'cabin', label: 'Cabin 2', price: 20, stars: 2, carriage: 0, cabin: 1, requires: [] },
  { id: 'cabin_0_2', kind: 'cabin', label: 'Cabin 3', price: 35, stars: 2, carriage: 0, cabin: 2, requires: ['cabin_0_1'] },
  { id: 'hire_attendant_0', kind: 'hire', label: 'Attendant', price: 45, stars: 3, carriage: 0, role: 'attendant', requires: ['cabin_0_2'], flags: ['firstCabinCleaned'] },
  { id: 'couple_1', kind: 'couple', label: 'Bathroom Car', price: 90, stars: 6, carriage: 1, requires: ['hire_attendant_0'] },
  { id: 'bedding_0', kind: 'bedding', label: 'Plush Bedding', price: 40, stars: 2, carriage: 0, requires: ['hire_attendant_0'] },
  { id: 'bath_1_1', kind: 'bathroom', label: 'Bathroom 2', price: 50, stars: 2, carriage: 1, bathroom: 1, requires: ['couple_2'] },
  { id: 'couple_2', kind: 'couple', label: 'Supply Car', price: 105, stars: 6, carriage: 2, requires: ['couple_1'] },
  { id: 'hire_runner_2', kind: 'hire', label: 'Supply Runner', price: 80, stars: 3, carriage: 2, role: 'runner', requires: ['couple_2'] },
  { id: 'bedding2_0', kind: 'bedding', label: 'Silk Pillows', price: 75, stars: 2, carriage: 0, requires: ['couple_2', 'bedding_0'] },
  { id: 'hire_porter_0', kind: 'hire', label: 'Porter', price: 130, stars: 3, carriage: 0, role: 'porter', requires: ['hire_runner_2'] },
  { id: 'up_attendant_0', kind: 'staffUpgrade', label: 'Attendant Training', price: 110, stars: 2, carriage: 0, role: 'attendant', requires: ['hire_porter_0'] },
  { id: 'couple_3', kind: 'couple', label: 'Luggage Car', price: 260, stars: 8, carriage: 3, requires: ['hire_porter_0'] },
  { id: 'hire_porter_3', kind: 'hire', label: 'Luggage Porter', price: 200, stars: 3, carriage: 3, role: 'porter', requires: ['couple_3'] },
  { id: 'couple_4', kind: 'couple', label: 'Sleeper Car II', price: 400, stars: 8, carriage: 4, requires: ['couple_3'] },
  { id: 'cabin_4_0', kind: 'cabin', label: 'Cabin 4', price: 60, stars: 2, carriage: 4, cabin: 0, requires: ['couple_4'] },
  { id: 'cabin_4_1', kind: 'cabin', label: 'Cabin 5', price: 90, stars: 2, carriage: 4, cabin: 1, requires: ['cabin_4_0'] },
  { id: 'hire_attendant_4', kind: 'hire', label: 'Attendant', price: 240, stars: 3, carriage: 4, role: 'attendant', requires: ['cabin_4_1'] },
  { id: 'cabin_4_2', kind: 'cabin', label: 'Cabin 6', price: 130, stars: 2, carriage: 4, cabin: 2, requires: ['cabin_4_1'] },
  { id: 'cabin_4_3', kind: 'cabin', label: 'Cabin 7', price: 180, stars: 2, carriage: 4, cabin: 3, requires: ['cabin_4_2'] },
  { id: 'cabin_4_4', kind: 'cabin', label: 'Cabin 8', price: 240, stars: 2, carriage: 4, cabin: 4, requires: ['cabin_4_3'] },
  { id: 'bedding_4', kind: 'bedding', label: 'Plush Bedding', price: 260, stars: 2, carriage: 4, requires: ['cabin_4_2'] },
  { id: 'up_porter_0', kind: 'staffUpgrade', label: 'Porter Training', price: 300, stars: 2, carriage: 0, role: 'porter', requires: ['couple_4'] },
  { id: 'up_runner_2', kind: 'staffUpgrade', label: 'Runner Training', price: 260, stars: 2, carriage: 2, role: 'runner', requires: ['couple_4'] },
  { id: 'up_attendant_4', kind: 'staffUpgrade', label: 'Attendant Training', price: 380, stars: 2, carriage: 4, role: 'attendant', requires: ['hire_attendant_4'] },
];

/** Fare bonus per bedding upgrade on a carriage. */
export const BEDDING_FARE_BONUS = 6;

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
