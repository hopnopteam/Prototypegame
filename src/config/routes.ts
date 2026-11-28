import type { CarriageType, ItemKind } from '../core/types';
import type { ClassId } from './classes';
import { ROUTE_PARAM, savedRouteId } from './saveKey';
import { COUNTRYSIDE_TO_RIVIERA, RIVIERA_TO_WINTER, type LineTransitionDef } from './lineTransition';

/**
 * Routes (Phase 1, owner: "a route config object… the train, unlocks and progression read from the active route").
 * Everything that makes a route itself lives here: which carriages it grows, in what order and how many, the
 * stations it calls at (by display name), who travels on it, how it is lit and what it sounds like. Systems read
 * `ACTIVE_ROUTE` instead of hard-coding any of it, so Route 2 is a second entry, not new code.
 */

/** No route may hold more carriages than this (the economy, the camera and the soak budgets assume it). */
export const MAX_TRAIN_CARRIAGES = 10;

/** A station of the route: the art (postcard scene, banner) of an existing station, under the route's own name. */
export interface RouteStation {
  /** The station whose postcard and banner it uses (`STATIONS` in content.ts). */
  art: string;
  /** The name shown on the banner, the postcard and the result card. */
  name: string;
  /** Its line in the postcard album (the art's own when left out). */
  blurb?: string;
}

/**
 * A cosmetic passenger look (Phase 1: "farmers with produce baskets, grandparents, backpackers, a village choir").
 * It dresses some travellers of an archetype; their class, fares, requests and behaviour stay the archetype's.
 */
export interface RouteGuestLook {
  id: string;
  /** The archetype whose travellers it dresses. */
  archetype: string;
  /** Share of that archetype's travellers who wear it (0–1). */
  share: number;
  /** What they wear and carry (any field left out keeps the archetype's own). */
  body?: string;
  accent?: string;
  hair?: string;
  outfit?: 'tee' | 'shirt' | 'jacket' | 'coat' | 'dress' | 'gown';
  pants?: string;
  hairStyle?: 'short' | 'side' | 'quiff' | 'curly' | 'bob' | 'long' | 'bun' | 'bald';
  hat?: 'none' | 'cap' | 'beanie' | 'boater' | 'bowler' | 'bun';
  hatColor?: string;
  accessory?: 'basket' | 'hymnbook' | 'cane' | 'backpack';
  glasses?: boolean;
}

/**
 * How a route is lit: `goldenHourToNight` opens each session at golden hour and fades into the blue night;
 * `sunnyToSunset` (Phase 4, the coast) opens on a sunny afternoon and settles into the sunset.
 */
export type RouteLighting = 'night' | 'goldenHourToNight' | 'sunnyToSunset';

/**
 * Phase 4 (owner: "move hire requirements into the route config as data"): which helpers must be earned by hand on this
 * route, and what each coupling waits for. `work` is keyed `<carriage type>.<tile key>` ('lobby.hire_attendant'): the
 * counts of hand work the hire's tile asks before it can be bought (metrics as `WorkMetric` in config/content.ts). A
 * hire the route does not list needs no hand work. `couplings[n - 1]` is what the n-th coupling requires (tile ids).
 */
export interface RouteHires {
  work: Record<string, Partial<Record<string, number>>>;
  couplings: string[][];
}

/** What passes the window on a route (world/Lakeside.ts deals the pieces; terrain.ts and Water.ts colour them). */
export interface RouteScenery {
  wheat: boolean;
  stoneBridges: boolean;
  /** Phase 4: weights for the water-side and land-side pieces by kind (0 leaves one out; a new kind joins the deck). */
  shore?: Partial<Record<string, number>>;
  land?: Partial<Record<string, number>>;
  /** Phase 4: what a fill kind becomes on this route ('none' leaves it out): the coast's pines are cypresses. */
  fill?: Partial<Record<string, string>>;
  /** Phase 4: the ground's colours (terrain.ts `GROUND` keys) and the water's. */
  ground?: Partial<Record<string, string>>;
  water?: { deep?: string; shallow?: string; bed?: string; foam?: string; haze?: string };
  /** Phase 4: what sails the water lane: lantern boats and swans, or sailing boats. */
  boats?: 'lanterns' | 'sails';
}

export interface RouteDef {
  /** The route's id (saves, the GameAnalytics `route` dimension). */
  id: string;
  /** Its name on cards and in the menu. */
  name: string;
  /** The order carriages join the train: the lobby first, then each coupling brings the next one, as a surprise. */
  carriageOrder: CarriageType[];
  /** How many carriages this route's train holds (≤ MAX_TRAIN_CARRIAGES). */
  maxCarriages: number;
  /** The stations it calls at, in order (a new game opens at the first). */
  stations: RouteStation[];
  /** The passenger classes a passenger carriage climbs through, in order (Basic first). */
  classLadder: ClassId[];
  /** Cosmetic passenger looks for this route. */
  guestLooks: RouteGuestLook[];
  /** The palette and lighting preset. */
  lighting: RouteLighting;
  /** Seconds of play the golden hour takes to fade into night (`goldenHourToNight`). */
  duskSeconds: number;
  /** The countryside's own touches (wheat fields, stone bridges) are dealt among the scenery pieces. */
  scenery: RouteScenery;
  /** The music track (the music is switched off for now, `MUSIC_ENABLED`; the id names the track it would play). */
  music: string;
  /** Phase 2: what this route's platforms offer, its special stops and its critic. */
  station: RouteStationRules;
  /** Phase 3: every pacing number of this route, in one place (applied over ECONOMY at load; remote config on top). */
  economy: RouteEconomy;
  /** Phase 4: the hand work each hire asks and what each coupling waits for (see `RouteHires`). */
  hires: RouteHires;
  /**
   * Phase 4: how this route dresses the carriage types it shares with others (the Riviera's lobby is the Beach Lobby &
   * Cabanas, its café the Smoothie & Ice-Cream Bar). Names, the chooser's lines, the passenger chip's colours.
   */
  dress?: Partial<Record<CarriageType, RouteCarriageDress>>;
  /** Phase 4: what this route serves in place of an item (the Riviera's café makes smoothies where Route 1 brews lattes). */
  menu?: Partial<Record<ItemKind, ItemKind>>;
  /** Phase 4: the floor plans' knobs on this route (see `RouteLayout`). */
  layout?: RouteLayout;
  /** Phase 4: what each class asks for on this route (lists replace the class's own; `turndown` switches it on or off). */
  requests?: Partial<Record<ClassId, RouteRequests>>;
  /**
   * Phase 4: who travels on this route. Archetypes with `routes` set appear only on those routes; this overrides an
   * archetype's weight here (0 keeps them off the route).
   */
  archetypeWeights?: Partial<Record<string, number>>;
  /** Phase 4: what guests on this route leave behind besides their own things (sand, shells: config/content.ts `MessPiece`). */
  mess?: string[];
  /** Phase 4: the stamp's line along the top of every postcard ("COUNTRYSIDE LINE"). */
  postcardLine?: string;
  /** The Grand Departure: how the player leaves this route for the next line (config/lineTransition.ts). */
  transition?: LineTransitionDef;
  /**
   * Phase 4: the liveries the train earns on this route by level (in place of the countryside's grey → green → navy →
   * royal blue), and the engine at its head (Kenney's steam locomotive, or a shrouded streamliner in the livery).
   */
  liveries?: { id: string; minLevel: number; name: string; body: string; trim: string }[];
  locomotive?: 'steam' | 'streamliner';
  /** Phase 4: the colours of the train's bought dressing on this route (window-box flowers, the trim line, the carpet). */
  exterior?: { flowers?: string[]; trim?: string; carpet?: string; carpetEdge?: string };
  /**
   * Visual overhaul, the Riviera revamp (owner, 24 Nov: "a different upgrade line… not luxurious First/Comfort/Royal"):
   * the route's own names for the refits and classes, and the highest refit tier its passenger carriages reach (tiles
   * above it are left out). Left out, the classic names and all five passenger tiers.
   */
  tiers?: RouteTiers;
  /**
   * The Riviera revamp: a carriage's upgrades that wait on a coupling ("@couple_N" in the catalogue) move by this many
   * couplings, because the route brings that carriage earlier or later than the catalogue was written for (clamped to
   * the route's couplings).
   */
  couplingShift?: Partial<Record<CarriageType, number>>;
  /**
   * Session 69: a shared tile's label and line on this route, keyed `<type>.<tile key>` (the Riviera's café sells gelato
   * where Route 1's sells pastries: "Gelato Menu", "Sells gelato"). Left out, the catalogue's own.
   */
  tiles?: Partial<Record<string, { label?: string; effect?: string }>>;
}

/** A route's names for the refit tiers (1, 2, 3 on every carriage) and its classes. */
export interface RouteTiers {
  /** Service cars' and venues' state names by tier (the cards, the train map): [tier 1, tier 2, tier 3], and tier 0's. */
  refit: [string, string, string];
  broken: string;
  /**
   * Session 69 (owner: "better more recognisable upgrade names… these are too abstract and do not indicate upgrades"):
   * the refit tiles' own labels on service cars and venues, [tier 1, tier 2, tier 3], read as things to buy ("Bamboo
   * Makeover"), apart from the state names above ("Bamboo Style").
   */
  refitTiles: [string, string, string];
  /** Passenger carriages: the refit tile's label by tier (1 Repair, 2 Comfort, 3 Business, 4 First Class, 5 Royal Suite). */
  passenger: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
  /** The classes' names and chips on this route. */
  classes: Partial<Record<ClassId, { name: string; chip: string; fare?: number; tip?: number; stars?: number }>>;
  /** The highest passenger tier offered (the Riviera: 4, its Tiki Paradise; Royal Suites are left out). */
  maxPassengerTier: number;
}

/** Phase 4: a carriage type's name and lines on one route. */
export interface RouteCarriageDress {
  name: string;
  pitch?: string;
  inside?: string;
  /** Its colours inside (world/palette.ts `CarriageTheme`; any left out keep the type's own). */
  theme?: Partial<Record<'wall' | 'wallLow' | 'carpet' | 'deep' | 'blanket' | 'curtain', string>>;
  /** A venue's walls at its three refits (world/CarriageView.ts `VENUE_WALLS`), when the route paints its own. */
  walls?: { wall: string; wallLow: string; panel?: string; cap?: string; curtain?: string }[];
}

/**
 * Phase 4: the floor plans' knobs a route may turn (the builders in world/layout.ts read them; tests turn them through
 * `setLayoutOptions`). Left out, a carriage is built as on the Countryside Express.
 */
export interface RouteLayout {
  /** Rooms in the lobby car while it keeps its Basic plan (Route 1: 3; the Riviera's Beach Lobby: 4 cabanas). */
  lobbyRooms?: number;
  /** The washroom car's rooms, front to back (Route 1: two toilets and a shower; the Riviera: three showers). */
  washrooms?: ('toilet' | 'shower')[];
  /** Rows of window tables in the dining car, two a row (Route 1: 4; the Riviera's Seafood Diner: 5). */
  diningRows?: number;
  /** The lobby's rack holds surfboards (each takes two places): the rack is drawn with board slots. */
  surfboards?: boolean;
  /** Passenger carriages keep the Basic plan's rooms at every class (the class changes the furnishing, not the rooms). */
  keepRooms?: boolean;
  /** The dome is a beach: loungers on sand, a lagoon, a volleyball net (the Riviera's Beach Lounge). */
  beachLounge?: boolean;
}

/** Phase 4: a class's requests on one route (weights, as in config/classes.ts). */
export interface RouteRequests {
  evening?: Partial<Record<ItemKind | 'turndown', number>>;
  morning?: Partial<Record<ItemKind | 'turndown', number>>;
  extra?: Partial<Record<ItemKind | 'turndown', number>>;
  turndown?: boolean;
}

/**
 * Phase 3, a route's economy: everything that sets its pace. `ECONOMY` (config/economy.ts) takes these values at load
 * (`applyRouteEconomy`), so the rest of the game reads them as before; GameAnalytics Remote Configs can override any
 * leaf by its dotted path ("route.couplePrices.2", "player.moveSpeed"; see `services/remoteConfig.ts`).
 */
export interface RouteEconomy {
  /** Every price on this route × this (Route 1: 1; Route 2: 2.5). Applied after everything below. */
  priceMultiplier: number;
  /** Every fare and tip on this route × this (Route 1: 1; Route 2: 2). */
  fareMultiplier: number;
  /** The couplings in play, the second carriage first (before `priceMultiplier`). */
  couplePrices: number[];
  /** Catalogue prices × `factor` (rounded to 5), except the opening's tiles at or under `keepUnder`. */
  priceScale: { factor: number; keepUnder: number };
  /** Then dearer tiles grow a little more: unchanged up to `from`, up to `max` times by `to`. */
  priceCurve: { from: number; to: number; max: number };
  /** A carriage's own tiles × this, by the slot it took (the lobby is slot 0). */
  slotPrice: number[];
  /** Passenger class refits from `fromTier` up (First Class, the Royal Suite) × `multiplier`. */
  classRefit: { fromTier: number; multiplier: number };
  /** Every hire and staff training tile × this. */
  staffCost: number;
  /** The conductor's walking speed (m/s) at the start. */
  moveSpeed: number;
  /** The lobby's shoes: each pair adds `step` of the starting speed; their prices in play, in order. */
  shoes: { step: number; prices: number[] };
  /** Starting speed × shoes × conductor × perks × boosts × stride never exceeds `speedCap` × the starting speed. */
  speedCap: number;
  /** Quick travel's top speed, as a multiple of walking pace (kept so a trip takes as long as before). */
  maxDashMultiplier: number;
  /** Every helper's walking speed × this. */
  staffSpeed: number;
  /** Stars to reach each route level (index 0 = level 1), and each level's Rail Miles and cash. */
  levels: { thresholds: number[]; railMiles: number[]; cash: number[] };
  /** The fare and tip base values. */
  money: { baseFare: number; alightTip: number; luggageTip: number; requestTip: number; bathroomTip: number; stationBonusCash: number };
  /** Away earnings: the share of automated income paid, its cap (seconds), and the kiosk's rate (per minute). */
  offline: { efficiency: number; capSeconds: number; kioskPerMinute: number };
}

/** Phase 2: a route's station upgrades (one set for all its platforms), special stops and critic. */
export interface RouteStationRules {
  /** The station upgrades on offer, in the order they come (keys from STATION_UPGRADES in config/content.ts). */
  upgrades: string[];
  /** Station upgrade tiles on show at once (never more than two at a stop). */
  tilesAtOnce: number;
  /** Phase 4: how the platform's supply cart looks (a plank barrow, or the coast's ice-cream cart). */
  supplyCart?: 'barrow' | 'icecream';
  /** Phase 4: the route's own names for the shared station upgrades (by key; the effect line optional). */
  dress?: Record<string, { label: string; effect?: string }>;
  /** Stops between special events (a new one comes after `[min, max]` ordinary stops, never two in a row). */
  eventEvery: [number, number];
  /** The first stop an event may come at. */
  eventsFrom: number;
  /** The special stops this route can have. */
  events: StationEventDef[];
  /** The critic: once per route, boarding while the train has between `minCarriages` and `maxCarriages`. */
  critic: CriticDef;
}

export type StationEventKind = 'rushHour' | 'festival' | 'lostFound' | 'vip' | 'delayed' | 'market' | 'harvest' | 'sheep'
  // Phase 4, the Riviera's own: a party on the sand, a surf contest, a heatwave.
  | 'beachParty' | 'surfContest' | 'heatwave';

/** Phase 2: a special stop (config: the route's `station.events`). */
export interface StationEventDef {
  id: string;
  kind: StationEventKind;
  /** Its banner (under the station's name). */
  title: string;
  /** How often it is picked among the route's events (relative). */
  weight: number;
  /** Only at this station (by its index on the route), or anywhere when left out. */
  station?: number;
  /** The train must have at least this many carriages. */
  minCarriages?: number;
  /** Rush Hour: the crowd ×`crowd`; the stop bonus ×`bonus` when everyone is aboard. */
  crowd?: number;
  bonus?: number;
  /** Festival Day and the Harvest Fair: tips × this for the guests boarding here (the fair's farmers, its own). */
  tips?: number;
  /** VIP Arrival: their fare × this. Lost & Found: the owner's tip in fares. */
  fare?: number;
  reward?: number;
  /** Delayed Connection: travellers in the second wave and the stop seconds it arrives at. */
  wave?: number;
  waveAt?: number;
  /** Station Market: what the stall sells (tips × `boost` for `stops` stops) and its price per carriage. */
  boost?: number;
  stops?: number;
  pricePerCarriage?: number;
  /** Sheep on the Tracks: how many to shoo. */
  sheep?: number;
}

/** Phase 4: what a carriage type, an item or a layout knob is on the active route (the route's own, or the shared one). */
export const routeItem = (item: ItemKind): ItemKind => ACTIVE_ROUTE.menu?.[item] ?? item;

/** Phase 2: the Village Gazette's critic. */
export interface CriticDef {
  minCarriages: number;
  maxCarriages: number;
  /** Chance each eligible stop is the one (the critic always comes before the train outgrows `maxCarriages`). */
  chance: number;
  /** The review prints this many stops after they board. */
  reviewAfter: number;
  /** Score bands (0–1): great from `great`, mixed from `mixed`, poor below. */
  great: number;
  mixed: number;
  /** Great: fares × `fareBoost` for the rest of the route. Mixed: `mixedCash` per carriage. Poor: crowds × `poorCrowd` for `poorStops` stops. */
  fareBoost: number;
  mixedCash: number;
  poorCrowd: number;
  poorStops: number;
  /** Phase 4: who the critic is on this route (a word for the cards), how they dress, and their verdicts' front pages. */
  who?: string;
  look?: { body?: string; accent?: string; hat?: 'none' | 'cap' | 'beanie' | 'boater' | 'bowler'; hatColor?: string; accessory?: 'camera' | 'hymnbook' | 'handbag'; glasses?: boolean };
  pages?: Partial<Record<'great' | 'mixed' | 'poor', { headline: string; body: string }>>;
}

/**
 * Route 1, the Countryside Express (Phase 1). Eight carriages: the lobby and its rooms, the café, a sleeper, the
 * washrooms, the bar (moved up), the dining car, the family sleeper and the cinema to finish. The Observation Dome,
 * the stores and luggage cars and the second Sleeper are not on this route.
 */
export const COUNTRYSIDE_EXPRESS: RouteDef = {
  id: 'countryside',
  name: 'Countryside Express',
  carriageOrder: ['lobby', 'cafe', 'sleeper', 'bathroom', 'bar', 'dining', 'familySleeper', 'cinema'],
  maxCarriages: 8,
  stations: [
    { art: 'millbrook', name: 'Millbrook' },
    { art: 'hazelford', name: 'Hollow Creek', blurb: 'A creek in a hollow, and a ford nobody has crossed since 1908.' },
    { art: 'barley-cross', name: 'Ashford Market', blurb: 'Market day, every day. The cheeses have opinions.' },
    { art: 'wrenfield', name: 'Lakeside', blurb: 'The lake, the swans, and a wren who runs the place.' },
    { art: 'pennyridge', name: 'Old Mill Junction', blurb: 'The old mill still turns, and every line meets here.' },
  ],
  // Phase 1: three class refits after the Repair (Business is folded into First Class).
  classLadder: ['basic', 'comfort', 'first', 'royal'],
  guestLooks: [
    // Farmers with produce baskets: tourists from the villages along the line.
    { id: 'farmer', archetype: 'tourist', share: 0.55, body: '#7C8F4E', accent: '#E8D9B0', outfit: 'shirt', pants: '#5B6E8C', hat: 'boater', hatColor: '#D9C27A', hairStyle: 'short', accessory: 'basket' },
    // Grandparents: grandmas, and their husbands in a tweed jacket with a cane.
    { id: 'grandpa', archetype: 'grandma', share: 0.45, body: '#8C7258', accent: '#E9E2D2', outfit: 'jacket', pants: '#5E5A52', hair: '#E6E6E6', hairStyle: 'bald', hat: 'none', glasses: true, accessory: 'cane' },
    // Backpackers keep their own look (the archetype is already on the route), a few in walking gear.
    { id: 'rambler', archetype: 'backpacker', share: 0.3, body: '#C2643A', accent: '#F2E3C4', outfit: 'jacket', pants: '#6B6A4E', hat: 'beanie', hatColor: '#3E6A5A', accessory: 'backpack' },
    // The village choir: students in burgundy robes with a hymn book.
    { id: 'choir', archetype: 'student', share: 0.35, body: '#7A2638', accent: '#F4EEE2', outfit: 'gown', pants: '#5C1C2A', hat: 'none', hairStyle: 'side', accessory: 'hymnbook' },
  ],
  lighting: 'goldenHourToNight',
  duskSeconds: 150,
  scenery: { wheat: true, stoneBridges: true },
  music: 'countryside_theme',
  transition: COUNTRYSIDE_TO_RIVIERA,
  // Phase 3: Route 1's pacing, tuned with the pacing simulator (scripts/pacing.mjs) to the bot targets.
  economy: {
    priceMultiplier: 1,
    fareMultiplier: 1,
    couplePrices: [60, 320, 380, 660, 1650, 3100, 6200],
    priceScale: { factor: 2.0, keepUnder: 30 },
    priceCurve: { from: 300, to: 4000, max: 1.0 },
    slotPrice: [0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15],
    // First Class and the Royal Suite: 0.7 in Phase 3, +10% after the fixed step (Phase 4c) brought route complete to
    // 144.5 minutes; they are the last tiles of the route (all bought after the eighth carriage).
    classRefit: { fromTier: 4, multiplier: 0.77 },
    staffCost: 1,
    moveSpeed: 3.15,
    shoes: { step: 0.11, prices: [60, 700, 3000] },
    speedCap: 2.2,
    maxDashMultiplier: 5.3,
    staffSpeed: 0.9,
    levels: {
      thresholds: [0, 40, 120, 290, 580, 1300, 2500, 4600],
      railMiles: [0, 3, 4, 5, 6, 8, 10, 12],
      cash: [0, 80, 150, 300, 550, 900, 1400, 2200],
    },
    money: { baseFare: 15, alightTip: 12, luggageTip: 4, requestTip: 9, bathroomTip: 3, stationBonusCash: 18 },
    offline: { efficiency: 0.25, capSeconds: 3 * 60 * 60, kioskPerMinute: 1.5 },
  },
  // Phase 4: Route 1's hire requirements, exactly as they were in the catalogue (sessions 29, 37, Phase 3): the first
  // coupling follows the Repair, the third waits for the attendant.
  hires: {
    work: {
      'lobby.hire_attendant': { rooms: 4, requests: 10 },
      'lobby.hire_porter': { tickets: 24, bags: 10 },
      'cafe.hire_barista': { cafe: 6 },
      'dining.hire_waiter': { dining: 3 },
      'dining.hire_chef': { dining: 4 },
      'bar.hire_bartender': { bar: 4 },
      'dome.hire_host': { dome: 8 },
      'cinema.hire_projectionist': { cinema: 3 },
      'familySleeper.hire_attendant': { rooms: 6 },
      'familySleeper.hire_porter': { keys: 12 },
    },
    couplings: [['c0.refurb_1'], ['couple_1'], ['couple_2', 'c0.hire_attendant'], ['couple_3'], ['couple_4'], ['couple_5'], ['couple_6']],
  },
  station: {
    upgrades: ['posters', 'booth', 'benches', 'windowboxes', 'kiosk', 'billboard', 'helper', 'lamps', 'lining', 'band', 'nameboards', 'gate2', 'redcarpet'],
    tilesAtOnce: 2,
    eventEvery: [3, 4],
    eventsFrom: 3,
    events: [
      { id: 'rush_hour', kind: 'rushHour', title: 'Rush Hour!', weight: 3, minCarriages: 2, crowd: 2, bonus: 2.5 },
      { id: 'festival', kind: 'festival', title: 'Festival Day', weight: 2, tips: 2 },
      { id: 'lost_found', kind: 'lostFound', title: 'Lost & Found', weight: 2, minCarriages: 2, reward: 30 },
      { id: 'vip', kind: 'vip', title: 'VIP Arrival', weight: 2, minCarriages: 2, fare: 5 },
      { id: 'delayed', kind: 'delayed', title: 'Delayed Connection', weight: 2, wave: 3, waveAt: 14 },
      { id: 'market', kind: 'market', title: 'Station Market', weight: 2, minCarriages: 3, boost: 2, stops: 3, pricePerCarriage: 40 },
      // Route 1's own: market day at Ashford Market, and sheep wandering onto the line.
      { id: 'harvest_fair', kind: 'harvest', title: 'Harvest Fair', weight: 4, station: 2, tips: 1.5 },
      { id: 'sheep', kind: 'sheep', title: 'Sheep on the Tracks', weight: 2, sheep: 4 },
    ],
    critic: { minCarriages: 3, maxCarriages: 6, chance: 0.35, reviewAfter: 3, great: 0.8, mixed: 0.55, fareBoost: 0.2, mixedCash: 40, poorCrowd: 0.7, poorStops: 3 },
  },
};

/**
 * Route 2, the Riviera Coast Line (Phase 4): a bright Amalfi-style coast, a blue-and-white streamliner that starts
 * sun-faded and salt-stained, nine carriages, six stations. Prices ×2.5 and fares ×2 over Route 1 (its economy block).
 */
export const RIVIERA_COAST: RouteDef = {
  id: 'riviera',
  name: 'Riviera Coast Line',
  // Phase 4: nine carriages. The lobby, café, sleeper, washrooms and diner are Route 1's types dressed for the coast
  // (`dress`, `menu`, `layout`); the Kids' Play Car, the Spa Car, the Honeymoon Suites and the Pool Car are new types.
  // The revamp (owner, 24 Nov: "exciting carriages first"; the Washroom Car becomes the Beach Lounge, the Observation
  // Dome's mechanic in beach dress): the Pool Car third, the lounge fourth, then the sleeper and the rest.
  carriageOrder: ['lobby', 'cafe', 'pool', 'dome', 'sleeper', 'dining', 'spa', 'kids', 'honeymoon'],
  maxCarriages: 9,
  // Their upgrades wait on couplings counted from where the catalogue's order had them (docs/art/RIVIERA_REVAMP.md).
  couplingShift: { pool: -6, dome: -2, sleeper: 2, dining: 1, kids: 2, honeymoon: 1 },
  // Session 69: the shared tiles in the coast's words (what the bar blends and scoops, what the diner grills, the
  // lounge's loungers, the couples' suites).
  tiles: {
    'cafe.menu_pastry': { label: 'Gelato Menu', effect: 'Sells gelato' },
    'cafe.station_machine': { label: 'Second Blender', effect: 'Blends faster' },
    'dining.station_range': { label: 'Second Grill', effect: 'Grills faster' },
    'dome.row_1': { label: 'Sun Loungers', effect: '+2 loungers' },
    'dome.row_2': { label: 'Sun Loungers', effect: '+2 loungers' },
    'dome.row_3': { label: 'Sun Loungers', effect: '+2 loungers' },
    'dome.row_4': { label: 'Sun Loungers', effect: '+2 loungers' },
    'dome.row_5': { label: 'Sun Loungers', effect: '+2 loungers' },
    'honeymoon.refurb_2': { label: 'Sea View Suites' },
  },
  // Owner, 24 Nov: driftwood → bamboo → tiki on every carriage. Session 69 (owner: "too abstract… do not indicate
  // upgrades"): the tiles say what is bought ("Repair", "Bamboo Makeover", "Tiki Luxury"; "Sea View Rooms", "Tiki
  // Suites") and the classes say what is sold (a Beach Hut, a Sea View room, a Tiki Suite).
  tiers: {
    broken: 'Shipwrecked',
    refit: ['Repaired', 'Bamboo Style', 'Tiki Luxury'],
    refitTiles: ['Repair', 'Bamboo Makeover', 'Tiki Luxury'],
    passenger: { 1: 'Repair', 2: 'Sea View Rooms', 3: 'Ocean Suites', 4: 'Tiki Suites' },
    // The Tiki Suites keep every room (`layout.keepRooms`), so they are paid per room: about First Class's two suites'
    // takings spread over a sleeper's six rooms (a Sea View sleeper takes 10.8 fares a ride, the Tiki Suites 25).
    // Business is reached only by the Honeymoon Suites' third refit (its Ocean Suites).
    classes: {
      basic: { name: 'Beach Hut', chip: 'BEACH HUT' },
      comfort: { name: 'Sea View', chip: 'SEA VIEW' },
      business: { name: 'Ocean Suite', chip: 'OCEAN SUITE' },
      first: { name: 'Tiki Suite', chip: 'TIKI SUITE', fare: 4.2, tip: 3, stars: 3 },
    },
    maxPassengerTier: 4,
  },
  stations: [
    { art: 'porto-sole', name: 'Porto Sole' },
    { art: 'lemon-cove', name: 'Lemon Cove' },
    { art: 'marina-bay', name: 'Marina Bay' },
    { art: 'cliffside', name: 'Cliffside' },
    { art: 'coral-beach', name: 'Coral Beach' },
    { art: 'bellavista', name: 'Bellavista' },
  ],
  classLadder: ['basic', 'comfort', 'first'],
  guestLooks: [
    // Sunburnt tourists: pink in the face, a straw hat, a camera (they ask for aloe and cold drinks: `sunbather`).
    { id: 'daytripper', archetype: 'tourist', share: 0.5, body: '#F4F0E4', accent: '#3E8FC2', outfit: 'shirt', pants: '#E9D7AE', hat: 'boater', hatColor: '#E9CF8C', hairStyle: 'side' },
    // Grandparents in linen.
    { id: 'linen', archetype: 'grandma', share: 0.5, body: '#E9E1CF', accent: '#7FA9C9', outfit: 'gown', pants: '#C9B9A0', hat: 'boater', hatColor: '#F1E3B8', glasses: true },
  ],
  lighting: 'sunnyToSunset',
  duskSeconds: 240,
  // The Amalfi coast: a turquoise sea with sailing boats, coves of sand under leaning palms, a headland with its
  // lighthouse and sea stacks, a little marina; pastel villas, lemon groves and palm-lined lanes on the land side,
  // cypresses where the countryside had pines, drier olive greens and warm sand.
  scenery: {
    wheat: false,
    stoneBridges: false,
    shore: { reeds: 0, lilies: 0, boathouse: 0, lighthouse: 0, fishing: 0.4, island: 0.5, beach: 1.0, jetty: 0.6, promenade: 1.0, cove: 1.8, headland: 0.55, marina: 0.8 },
    land: { meadow: 0, village: 0, farm: 0, orchard: 0, windmill: 0, chapel: 0, camp: 0, forest: 0.7, lane: 0.6, villas: 1.6, lemons: 1.2, palms: 1.1 },
    fill: { pine: 'cypress', spruce: 'cypress', reed: 'rock', lily: 'none', sheep: 'none' },
    ground: { grass: '#7E9150', grassLight: '#A1AE62', grassDark: '#5F7444', sand: '#E3CFA2', bank: '#C2B8A4', bed: '#6F9A9A', lane: '#B89F82', path: '#CDBB9C' },
    water: { deep: '#0F3D78', shallow: '#249AAE', bed: '#86B4A8', foam: '#E4F0F2', haze: '#4D6E9E' },
    boats: 'sails',
  },
  music: 'riviera_theme',
  transition: RIVIERA_TO_WINTER,
  postcardLine: 'RIVIERA COAST LINE',
  dress: {
    lobby: { name: 'Beach Lobby & Cabanas', pitch: 'Desk, 4 cabanas', inside: 'A beach desk, welcome drinks, 4 cabanas, a surfboard rack',
      theme: { wall: '#F4E4C4', wallLow: '#7FC6D6', carpet: '#F3E7D0', deep: '#2E8FA8', blanket: '#F28C6B', curtain: '#F7F4EE' } },
    cafe: { name: 'Smoothie & Ice-Cream Bar', pitch: 'Smoothies & gelato', inside: 'A juice bar, a gelato case, tables for two',
      theme: { wall: '#FBE3D4', wallLow: '#F2A6A0', carpet: '#F6ECE0', deep: '#E8604C', blanket: '#F7B32B', curtain: '#F7F4EE' },
      walls: [
        { wall: '#FBF4E8', wallLow: '#E9D4C2' },
        { wall: '#FBE3D4', wallLow: '#F2A6A0', curtain: '#F7F4EE' },
        { wall: '#FFF6EC', wallLow: '#E8604C', panel: '#5FB4E6', cap: '#E2B653', curtain: '#FBE3D4' },
      ] },
    sleeper: { name: 'Sea-View Sleeper', pitch: '+6 sea-view berths', inside: '6 berths facing the sea',
      theme: { wall: '#D6EAF0', wallLow: '#8CC3D6', carpet: '#EEF2EE', deep: '#2E6F9A', blanket: '#5FA8D3', curtain: '#F7F4EE' } },
    bathroom: { name: 'Washroom & Showers', pitch: '5 showers', inside: 'Five showers and a linen closet',
      theme: { wall: '#DDF0EE', wallLow: '#9ED6DC', carpet: '#F2F4F0', deep: '#3E9AA8', blanket: '#F2A6A0', curtain: '#FFFDF8' } },
    dining: { name: 'Seafood Diner', pitch: 'Grilled seafood', inside: 'A grill, the pass, 10 window tables',
      theme: { wall: '#E6EEF2', wallLow: '#6E9AB8', carpet: '#F1EDE4', deep: '#1E4E79', blanket: '#F7F4EE', curtain: '#E2B653' },
      walls: [
        { wall: '#EDF1F0', wallLow: '#B9C6C9' },
        { wall: '#E6EEF2', wallLow: '#2E6F9A', curtain: '#F7F4EE' },
        { wall: '#F4F2EA', wallLow: '#1E3A5C', panel: '#1E3A5C', cap: '#E2B653', curtain: '#F7F4EE' },
      ] },
    // The revamp: the Observation Dome's mechanic as a chill car of loungers facing the sea (show guests in, every sunset
    // view pays everyone lounging, a beach towel for anyone who asks).
    dome: { name: 'Beach Lounge', pitch: 'Sunset views', inside: 'Loungers facing the sea, big windows, beach towels',
      theme: { wall: '#F6E7C8', wallLow: '#E9C98E', carpet: '#EFD9AE', deep: '#2E9AA8', blanket: '#F28C6B', curtain: '#F7F4EE' } },
  },
  menu: { latte: 'smoothie', pastry: 'icecream', meal: 'seafood' },
  layout: { lobbyRooms: 4, washrooms: ['shower', 'shower', 'shower', 'shower', 'shower'], diningRows: 5, surfboards: true, keepRooms: true, beachLounge: true },
  // Cold drinks and aloe on the coast: a welcome lemonade in the evening, aloe for the sunburnt in the morning; the
  // Sea-View Sleeper's guests have their beds turned down from Comfort up.
  requests: {
    basic: { evening: { lemonade: 2, blanket: 1 }, morning: { tea: 1, aloe: 1 }, extra: { pillow: 2, lemonade: 2, aloe: 1, sandwich: 1 } },
    comfort: { evening: { lemonade: 1, sandwich: 1 }, morning: { towel: 1, aloe: 1 }, extra: { lemonade: 2, pillow: 1, towel: 1, aloe: 1 }, turndown: true },
    business: { evening: { newspaper: 1, lemonade: 1 }, morning: { coffee: 1 }, extra: { lemonade: 1, towel: 1, coffee: 1, aloe: 1 } },
  },
  // Who travels on the coast: surfers and beach families in Basic, sunbathers and families in Comfort, honeymooners.
  archetypeWeights: { student: 1, backpacker: 2, surfer: 3, beachFamily: 2, tourist: 2, sunbather: 3, grandma: 1, family: 2 },
  mess: ['sand', 'shell', 'flipflops'],
  // A blue-and-white streamliner that starts out sun-faded and gets its colour back as the route grows.
  locomotive: 'streamliner',
  liveries: [
    { id: 'sunfaded', minLevel: 1, name: 'Sun-faded Blue', body: '#9FB6C2', trim: '#E9E2D0' },
    { id: 'harbour', minLevel: 2, name: 'Harbour Blue', body: '#5F8DB6', trim: '#F4EFE4' },
    { id: 'riviera', minLevel: 4, name: 'Riviera Blue & White', body: '#2F6FB5', trim: '#FFFFFF' },
    { id: 'azure', minLevel: 6, name: 'Azure & Ivory', body: '#1E5AA8', trim: '#F8F5EC' },
  ],
  // Bougainvillea in the window boxes, a sea-blue line along the cornice and a blue carpet at the door.
  exterior: { flowers: ['#C8327A', '#E0559A', '#F2F0EA', '#B02A6B'], trim: '#2F7FC1', carpet: '#2E6FB0', carpetEdge: '#F2F0EA' },
  // Phase 4, tuned on the pacing simulator (ROUTE=riviera node scripts/pacing.mjs) to the Phase 4 bot targets. Prices ×2.5
  // and fares ×2 as the prompt sets them; under them, the route's own base prices: the catalogue a little cheaper than
  // Route 1's (×2.5 prices against ×2 fares compounded through every early cabin: the first pass had the third carriage
  // at 56 minutes), the first couplings at Route 1's pace, the later ones dearer for the longer route, and the level and
  // station bonuses (which take no fare multiplier) scaled with the prices.
  economy: {
    ...COUNTRYSIDE_EXPRESS.economy,
    priceMultiplier: 2.5,
    fareMultiplier: 2,
    // The seventh coupling 6,000 → 5,100 (15,000 → 12,750 in play): two seeds saved 10–12 minutes for it (Phase 4c).
    // The second coupling 360 → 290 (900 → 725 in play, Phase 4d): at 900 the third carriage came at 9 or 17–22 minutes by seed.
    // Session 69, re-measured after the revamp (the coast's own carriage order and Tiki Suites that keep every room):
    // five average seeds took 246–266 minutes to the ninth carriage and only one finished the route (266), each
    // waiting 10 minutes for the last coupling and each Tiki Suites refit. The last two couplings 5,100 → 4,400 and
    // 12,500 → 8,800 (12,750 → 11,000 and 31,250 → 22,000 in play), the Tiki Suites at ×1.0 (was ×1.2); see below.
    couplePrices: [60, 290, 220, 800, 2100, 3500, 4400, 8000],
    // Session 69: the bot buys something every one to three minutes to the end, so the route's length is everything's
    // price over the income: with the revamp's carriages it finished at 265 minutes (target 210–240). The dearest
    // tiles no longer grow faster than the rest (the curve's top ×1.25 → ×1.0), the last carriages' surcharge is
    // flattened (×1.1–1.2 → ×1.05) and the Tiki Suites cost ×0.85: 249 minutes (242–269), so the dearest tiles a little
    // under the rest (the curve's top ×0.88): 245.6 (241–250), the last 15 minutes the two Tiki Suites and the last
    // coupling, so those at ×0.7 and 8,000 (20,000 in play).
    priceCurve: { from: 600, to: 6000, max: 0.88 },
    classRefit: { fromTier: 4, multiplier: 0.7 },
    slotPrice: [0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.05, 1.05, 1.05],
    // Its own level thresholds: with Route 1's, level 8 came at about 130 minutes of a 216-minute route; stretched so the
    // last levels keep coming until near the end.
    levels: { ...COUNTRYSIDE_EXPRESS.economy.levels, thresholds: [0, 40, 120, 290, 580, 1300, 2800, 6500], cash: COUNTRYSIDE_EXPRESS.economy.levels.cash.map((c) => c * 2.5) },
    money: { ...COUNTRYSIDE_EXPRESS.economy.money, stationBonusCash: 36 },
  },
  // Phase 4 (owner: "lighter Attendant requirements, since players arrive already knowing the cleaning job"): the
  // lobby's attendant asks half Route 1's hand work; the rest as on Route 1, plus the coast's own helpers.
  hires: {
    work: {
      'lobby.hire_attendant': { rooms: 2, requests: 5 },
      'lobby.hire_porter': { tickets: 24, bags: 10 },
      'cafe.hire_barista': { cafe: 6 },
      'dining.hire_waiter': { dining: 3 },
      'dining.hire_chef': { dining: 4 },
      'kids.hire_entertainer': { kids: 4 },
      'spa.hire_masseur': { spa: 4 },
      'honeymoon.hire_attendant': { rooms: 6 },
      'pool.hire_lifeguard': { pool: 5 },
      'dome.hire_host': { dome: 6 },
    },
    couplings: [['c0.refurb_1'], ['couple_1'], ['couple_2', 'c0.hire_attendant'], ['couple_3'], ['couple_4'], ['couple_5'], ['couple_6'], ['couple_7']],
  },
  station: {
    ...COUNTRYSIDE_EXPRESS.station,
    // The same seven upgrades in coast dress (config/content.ts `STATION_DRESS`), and the Surfboard Rack.
    // No Second Door: the coast's train has one entrance (the Family Sleeper's second desk is Route 1's).
    upgrades: ['posters', 'booth', 'benches', 'windowboxes', 'kiosk', 'billboard', 'helper', 'surfrack', 'lamps', 'lining', 'band', 'nameboards', 'redcarpet'],
    supplyCart: 'icecream',
    dress: {
      posters: { label: 'Beach Posters' },
      booth: { label: 'Ticket Kiosk' },
      benches: { label: 'Waiting Chairs' },
      windowboxes: { label: 'Flower Boxes' },
      kiosk: { label: 'Lemonade Stall' },
      billboard: { label: 'Billboards' },
      helper: { label: 'Supply Porter' },
      lamps: { label: 'Carriage Lamps' },
      lining: { label: 'Blue Paintwork' },
      band: { label: 'Mandolin Band' },
      nameboards: { label: 'Name Signs' },
      redcarpet: { label: 'Welcome Carpet' },
    },
    events: [
      ...COUNTRYSIDE_EXPRESS.station.events.filter((e) => e.kind !== 'harvest' && e.kind !== 'sheep'),
      // The coast's own: a party on the sand at Coral Beach, a surf contest (surfers with boards), a heatwave.
      { id: 'beach_party', kind: 'beachParty', title: 'Beach Party', weight: 4, station: 4, tips: 1.6 },
      { id: 'surf_contest', kind: 'surfContest', title: 'Surf Contest', weight: 2, minCarriages: 2, crowd: 1.5, bonus: 2 },
      { id: 'heatwave', kind: 'heatwave', title: 'Heatwave', weight: 2, minCarriages: 3, reward: 6 },
    ],
    // The critic on the coast: a travel-magazine writer in linen with a camera.
    critic: {
      ...COUNTRYSIDE_EXPRESS.station.critic, minCarriages: 4, maxCarriages: 7,
      who: 'Riviera Traveller',
      look: { body: '#F2EAD8', accent: '#3E8FC2', hat: 'boater', hatColor: '#E9CF8C', accessory: 'camera', glasses: true },
      pages: {
        great: { headline: 'The Most Glamorous Train on the Coast!', body: 'Riviera Traveller’s writer rode {train} from cove to cove: gelato on the hour, sea views from every berth. Fares are up.' },
        mixed: { headline: 'Sunny, If a Little Sandy', body: 'Our travel writer found {train} “delightful, once the towels arrived”. Worth the ticket.' },
        poor: { headline: 'Sand in the Sheets, Slow at the Pool', body: 'Riviera Traveller’s writer left {train} unimpressed. Travellers may wait a stop or three, but every train deserves a second look.' },
      },
    },
  },
};

/** Every route there is, in the order they open (a route is completed to open the next). */
export const ROUTES: RouteDef[] = [COUNTRYSIDE_EXPRESS, RIVIERA_COAST];

/** Phase 4: routes still to come, shown on the route map as a silhouette ("Coming soon"). */
export const UPCOMING_ROUTES: { id: string; name: string }[] = [{ id: 'winter', name: 'Winter City Express' }];

export function routeById(id: string | null | undefined): RouteDef | null {
  return ROUTES.find((r) => r.id === id) ?? null;
}

/** The route that opens once this one is completed (null after the last). */
export function nextRoute(id: string): RouteDef | null {
  const i = ROUTES.findIndex((r) => r.id === id);
  return i >= 0 ? ROUTES[i + 1] ?? null : null;
}

/**
 * The route being played (Phase 4: the save's route, read as the game loads; `?route=<id>` forces one for testing).
 * Fixed for the whole session: moving to the next route saves and reloads behind the tunnel.
 */
export const ACTIVE_ROUTE: RouteDef = routeById(ROUTE_PARAM) ?? routeById(savedRouteId()) ?? COUNTRYSIDE_EXPRESS;

/** Its number on the line (1 for the Countryside Express), for the GameAnalytics progression names (`Route2:Level03`). */
export const ROUTE_NUMBER = ROUTES.indexOf(ACTIVE_ROUTE) + 1;
