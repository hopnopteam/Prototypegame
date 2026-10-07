import type { CarriageType, ItemKind } from '../core/types';
import type { IconName } from '../ui/icons';

/**
 * Carriage luxury classes: every passenger carriage (the lobby car and the sleepers) climbs from Basic to
 * Royal Suite, one cash upgrade at a time. The class sets the floor plan (fewer, bigger, grander rooms: a
 * sleeper goes 6 berths → 4 cabins → 3 → 2 suites → one grand suite; see `layout.ts`), who travels in it,
 * what they pay and tip, what they ask for, how it looks inside and the colour it is painted outside, so the
 * train reads as a mix of liveries. Fares rise faster than the rooms fall, so every class earns clearly more
 * per carriage (a full sleeper: 6, 10, 15, 28, 40 fares). Service cars keep their own four-step refits.
 */
export type ClassId = 'basic' | 'comfort' | 'business' | 'first' | 'royal';

/**
 * What a guest asks for in their cabin: an item brought to them, the bed turned down, or a wake-up call (a knock
 * at the door). The venue carriages' dishes are ordered in the venue.
 */
export type ServiceNeed = Exclude<ItemKind, 'latte' | 'pastry' | 'meal' | 'cocktail' | 'popcorn'> | 'turndown' | 'wakeup';

/** Asked for by standing at the room a moment (no item to carry). */
export const isDwellNeed = (need: ServiceNeed | 'bathroom' | null): need is 'turndown' | 'wakeup' => need === 'turndown' || need === 'wakeup';

export interface ClassDef {
  id: ClassId;
  /** Full name (cards, the chooser, headlines). */
  name: string;
  /** Short label on the carriage chip (one or two words). */
  chip: string;
  /** The carriage's refit tier where this class begins (passenger carriages run 0–5). */
  tier: number;
  /** Route level at which the upgrade to this class is offered (Royal: the route's top level). */
  level: number;
  /** Outside paint: body and trim. */
  livery: { body: string; trim: string };
  /** Chip and ticket colours. */
  color: string;
  ink: string;
  /** Multipliers on fares and on every tip left in this class. */
  fare: number;
  tip: number;
  /**
   * Stars per request served and per cabin tidied: famous guests spread the word further (and there are fewer
   * of them per carriage as the rooms grow, so a classier carriage still climbs the league faster).
   */
  stars: number;
  /**
   * Session 22, one trip and one sleep: what its guests ask for in the evening and in the morning (weights;
   * one request each, never the same thing twice), on top of a made bed and a tidy room.
   */
  evening: Partial<Record<ServiceNeed, number>>;
  morning: Partial<Record<ServiceNeed, number>>;
  /** First and Royal: the bed is turned down when the guest arrives. */
  turndown: boolean;
  /** Royal: the morning comes as the butler's list (everything on `morning`, one after another), paid as one generous tip. */
  butler: boolean;
  /** The service this class adds, for tiles and lessons. */
  adds: ServiceNeed | 'clean' | 'butler';
  icon: IconName;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'basic', name: 'Basic', chip: 'BASIC', tier: 0, level: 1,
    livery: { body: '#4F5D55', trim: '#B9C2B5' }, color: '#6E7D72', ink: '#FFFFFF',
    fare: 1, tip: 1, stars: 1, evening: { blanket: 1 }, morning: { wakeup: 1 }, turndown: false, butler: false, adds: 'clean', icon: 'broom',
  },
  {
    id: 'comfort', name: 'Comfort', chip: 'COMFORT', tier: 2, level: 2,
    livery: { body: '#2C7A76', trim: '#EAD9B0' }, color: '#2F8F89', ink: '#FFFFFF',
    fare: 2.5, tip: 2, stars: 2, evening: { tea: 1 }, morning: { towel: 1 }, turndown: false, butler: false, adds: 'towel', icon: 'towel',
  },
  {
    id: 'business', name: 'Business', chip: 'BUSINESS', tier: 3, level: 4,
    livery: { body: '#233A5E', trim: '#C9D2DC' }, color: '#2D4C7C', ink: '#FFFFFF',
    fare: 5, tip: 3.5, stars: 3, evening: { newspaper: 1 }, morning: { coffee: 1 }, turndown: false, butler: false, adds: 'coffee', icon: 'coffee',
  },
  {
    id: 'first', name: 'First Class', chip: 'FIRST CLASS', tier: 4, level: 6,
    livery: { body: '#243F7E', trim: '#E2B653' }, color: '#2B4FA0', ink: '#FFE2A0',
    fare: 14, tip: 7, stars: 5, evening: { champagne: 1 }, morning: { breakfast: 1 }, turndown: true, butler: false, adds: 'champagne', icon: 'champagne',
  },
  {
    id: 'royal', name: 'Royal Suite', chip: 'ROYAL SUITE', tier: 5, level: 8,
    livery: { body: '#6A1E2E', trim: '#E2B653' }, color: '#8A2A3E', ink: '#FFE2A0',
    fare: 40, tip: 18, stars: 10, evening: { champagne: 1 }, morning: { breakfast: 1, coffee: 1 }, turndown: true, butler: true, adds: 'butler', icon: 'crown',
  },
];

export const CLASS_BY_ID: Record<ClassId, ClassDef> = Object.fromEntries(CLASSES.map((c) => [c.id, c])) as Record<ClassId, ClassDef>;

/** Carriages that carry passengers (and so have a class). */
export const PASSENGER_TYPES: readonly CarriageType[] = ['lobby', 'sleeper'];

export function isPassengerType(type: CarriageType): boolean {
  return PASSENGER_TYPES.includes(type);
}

/** The top refit tier of a carriage type: passenger carriages climb to Royal (5), service cars to 3. */
export function maxTier(type: CarriageType): number {
  return isPassengerType(type) ? 5 : 3;
}

/** A passenger carriage's class at a refit tier (tier 1 is Basic, repaired: still Basic). */
export function classOfTier(tier: number): ClassDef {
  let best = CLASSES[0];
  for (const c of CLASSES) if (tier >= c.tier) best = c;
  return best;
}

/** The class a tier upgrade brings a passenger carriage to, if that tier starts a new class. */
export function classStartingAt(tier: number): ClassDef | null {
  return CLASSES.find((c) => c.tier === tier) ?? null;
}

/** Repairs within Basic (tier 1) earn a little more than the run-down carriage it was. */
export const BASIC_REPAIRED_FARE = 1.25;

/** Fare multiplier of a passenger carriage at a refit tier. */
export function classFare(tier: number): number {
  const c = classOfTier(tier);
  return c.id === 'basic' && tier >= 1 ? BASIC_REPAIRED_FARE : c.fare;
}
