import type { CarriageType } from '../core/types';
import type { ClassId } from './classes';
import { ROUTE_PARAM, savedRouteId } from './saveKey';

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

/** How a route is lit: `goldenHourToNight` opens each session at golden hour and fades into the blue night. */
export type RouteLighting = 'night' | 'goldenHourToNight';

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
  scenery: { wheat: boolean; stoneBridges: boolean };
  /** The music track (the music is switched off for now, `MUSIC_ENABLED`; the id names the track it would play). */
  music: string;
  /** Phase 2: what this route's platforms offer, its special stops and its critic. */
  station: RouteStationRules;
  /** Phase 3: every pacing number of this route, in one place (applied over ECONOMY at load; remote config on top). */
  economy: RouteEconomy;
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
  /** Stops between special events (a new one comes after `[min, max]` ordinary stops, never two in a row). */
  eventEvery: [number, number];
  /** The first stop an event may come at. */
  eventsFrom: number;
  /** The special stops this route can have. */
  events: StationEventDef[];
  /** The critic: once per route, boarding while the train has between `minCarriages` and `maxCarriages`. */
  critic: CriticDef;
}

export type StationEventKind = 'rushHour' | 'festival' | 'lostFound' | 'vip' | 'delayed' | 'market' | 'harvest' | 'sheep';

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
  // Phase 3: Route 1's pacing, tuned with the pacing simulator (scripts/pacing.mjs) to the bot targets.
  economy: {
    priceMultiplier: 1,
    fareMultiplier: 1,
    couplePrices: [60, 320, 380, 660, 1650, 3100, 6200],
    priceScale: { factor: 2.0, keepUnder: 30 },
    priceCurve: { from: 300, to: 4000, max: 1.0 },
    slotPrice: [0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15],
    classRefit: { fromTier: 4, multiplier: 0.7 },
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
  carriageOrder: ['lobby', 'cafe', 'sleeper', 'bathroom', 'dining', 'bar', 'familySleeper', 'cinema'],
  maxCarriages: 8,
  stations: [
    { art: 'millbrook', name: 'Porto Sole', blurb: 'Where the line meets the sea, and the sea meets the lemons.' },
    { art: 'hazelford', name: 'Lemon Cove', blurb: 'Every terrace a lemon grove, every lemon an opinion.' },
    { art: 'barley-cross', name: 'Marina Bay', blurb: 'Sailboats, gelato, and a harbourmaster who naps at noon.' },
    { art: 'wrenfield', name: 'Cliffside', blurb: 'White houses stacked on the rock like sugar cubes.' },
    { art: 'oakhollow', name: 'Coral Beach', blurb: 'The beach is right behind the platform. Mind the sand.' },
    { art: 'pennyridge', name: 'Bellavista', blurb: 'The best view on the line, and everyone knows it.' },
  ],
  classLadder: ['basic', 'comfort', 'first', 'royal'],
  guestLooks: [],
  lighting: 'goldenHourToNight',
  duskSeconds: 240,
  scenery: { wheat: false, stoneBridges: false },
  music: 'riviera_theme',
  economy: {
    ...COUNTRYSIDE_EXPRESS.economy,
    priceMultiplier: 2.5,
    fareMultiplier: 2,
  },
  station: {
    ...COUNTRYSIDE_EXPRESS.station,
    events: COUNTRYSIDE_EXPRESS.station.events.filter((e) => e.kind !== 'harvest' && e.kind !== 'sheep'),
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
