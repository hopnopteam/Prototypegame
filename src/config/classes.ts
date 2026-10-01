import type { CarriageType, ItemKind } from '../core/types';
import type { IconName } from '../ui/icons';

/**
 * Carriage luxury classes: every passenger carriage (the lobby car and the sleepers) climbs from Basic to
 * Royal Suite, one cash upgrade at a time. The class sets who travels in it, what they pay and tip, what
 * they ask for, how it looks inside and the colour it is painted outside, so the train reads as a mix of
 * liveries. Service cars (washrooms, stores, luggage) keep their own four-step refits and the route livery.
 */
export type ClassId = 'basic' | 'comfort' | 'business' | 'first' | 'royal';

/** What a guest can ask for: an item brought to the cabin, the bed turned down, or (Royal) the butler. */
export type ServiceNeed = ItemKind | 'turndown';

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
  /** Stars per request served and per cabin tidied: famous guests spread the word further. */
  stars: number;
  /** What its guests ask for (weights), on top of the tidy cabin everyone expects. */
  requests: Partial<Record<ServiceNeed, number>>;
  /** First and Royal: the bed is turned down when the guest arrives. */
  turndown: boolean;
  /** Royal: requests come two at a time (the butler's list), paid as one generous tip. */
  butler: boolean;
  /** The service this class adds, for tiles and lessons. */
  adds: ServiceNeed | 'clean' | 'butler';
  icon: IconName;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'basic', name: 'Basic', chip: 'BASIC', tier: 0, level: 1,
    livery: { body: '#4F5D55', trim: '#B9C2B5' }, color: '#6E7D72', ink: '#FFFFFF',
    fare: 1, tip: 1, stars: 1, requests: { pillow: 3, blanket: 2, tea: 1 }, turndown: false, butler: false, adds: 'clean', icon: 'broom',
  },
  {
    id: 'comfort', name: 'Comfort', chip: 'COMFORT', tier: 2, level: 2,
    livery: { body: '#2C7A76', trim: '#EAD9B0' }, color: '#2F8F89', ink: '#FFFFFF',
    fare: 2, tip: 1.6, stars: 1, requests: { towel: 3, tea: 2, blanket: 2, pillow: 1 }, turndown: false, butler: false, adds: 'towel', icon: 'towel',
  },
  {
    id: 'business', name: 'Business', chip: 'BUSINESS', tier: 3, level: 4,
    livery: { body: '#233A5E', trim: '#C9D2DC' }, color: '#2D4C7C', ink: '#FFFFFF',
    fare: 4, tip: 2.6, stars: 2, requests: { coffee: 4, towel: 1, tea: 1 }, turndown: false, butler: false, adds: 'coffee', icon: 'coffee',
  },
  {
    id: 'first', name: 'First Class', chip: 'FIRST CLASS', tier: 4, level: 6,
    livery: { body: '#243F7E', trim: '#E2B653' }, color: '#2B4FA0', ink: '#FFE2A0',
    fare: 8, tip: 4.2, stars: 2, requests: { champagne: 4, coffee: 1, towel: 1 }, turndown: true, butler: false, adds: 'champagne', icon: 'champagne',
  },
  {
    id: 'royal', name: 'Royal Suite', chip: 'ROYAL SUITE', tier: 5, level: 8,
    livery: { body: '#6A1E2E', trim: '#E2B653' }, color: '#8A2A3E', ink: '#FFE2A0',
    fare: 15, tip: 7, stars: 3, requests: { champagne: 3, coffee: 2, tea: 1, towel: 1 }, turndown: true, butler: true, adds: 'butler', icon: 'crown',
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
