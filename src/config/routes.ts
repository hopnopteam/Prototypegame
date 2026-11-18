import type { CarriageType } from '../core/types';
import type { ClassId } from './classes';

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

/** Every route there is (one for now). */
export const ROUTES: RouteDef[] = [COUNTRYSIDE_EXPRESS];

/** The route being played. */
export const ACTIVE_ROUTE: RouteDef = COUNTRYSIDE_EXPRESS;
