import type { ClassId, ServiceNeed } from '../config/classes';
import type { CurrencyKind, ItemKind, JourneyPhase, StaffRole, VenueKind } from '../core/types';

/** Every gameplay event. UI, audio, analytics, quests and FTUE all listen here instead of reaching in. */
export interface GameEvents {
  'currency.changed': { kind: CurrencyKind; amount: number; delta: number; source: string };
  'cash.collected': { amount: number; x: number; z: number };
  'guest.checkedIn': { fare: number; x: number; z: number; byPlayer: boolean };
  /** Session 24: a ticketed guest was handed their cabin key at the desk (and perhaps booked a table). */
  'guest.keyed': { x: number; z: number; byPlayer: boolean; booked: boolean };
  'guest.boarded': { byPlayer: boolean };
  'guest.alighted': { tip: number };
  'request.fulfilled': { item: ServiceNeed; tip: number; x: number; z: number; byPlayer: boolean; speedy: boolean };
  'cabin.cleaned': { byPlayer: boolean; x: number; z: number };
  'spot.cleaned': { x: number; z: number; byPlayer: boolean };
  /** Session 22: the opening's covered carriage opened. */
  'carriage.opened': Record<string, never>;
  'item.picked': { item: ItemKind; byPlayer: boolean };
  'item.dropped': { item: ItemKind; byPlayer: boolean };
  'item.returned': { item: ItemKind; byPlayer: boolean };
  'luggage.loaded': { byPlayer: boolean };
  'unlock.completed': { id: string; price: number; x: number; z: number };
  'tile.draining': { x: number; z: number };
  'carriage.coupled': { index: number; type: string };
  'carriage.refurbished': { index: number; type: string; tier: number };
  'carriage.classUp': { index: number; cls: ClassId };
  'staff.hired': { role: StaffRole; carriage: number };
  'stars.added': { amount: number; source: string; x?: number; z?: number };
  'level.up': { level: number };
  'livery.changed': { name: string; level: number };
  'journey.phase': { phase: JourneyPhase; previous: JourneyPhase; station: number };
  'journey.lastCall': Record<string, never>;
  'station.result': StationResult;
  'rush.bonus': { streak: number; cash: number };
  'conductor.upgraded': { key: string; level: number };
  'bathroom.used': { tipped: boolean };
  /** Session 20, the venue carriages: something served at a venue (and what it paid). */
  'venue.served': { kind: VenueKind; item: ItemKind | 'usher' | 'film'; amount: number; x: number; z: number; byPlayer: boolean };
  'venue.cleared': { kind: VenueKind; byPlayer: boolean };
  'venue.happyHour': { seconds: number };
  'venue.scenic': { guests: number; amount: number };
  /** A film ended at the cinema: everyone who watched paid their ticket. */
  'venue.film': { guests: number; amount: number };
  'venue.opened': { kind: VenueKind; carriage: number };
  'bathroom.restocked': { byPlayer: boolean };
  'crate.delivered': Record<string, never>;
  'ftue.step': { step: string };
  'postcard.collected': { id: string; name: string };
  'story.step': { id: string; step: number; done: boolean };
  'boost.changed': Record<string, never>;
  'toast': { text: string; icon?: string };
  'train.named': { name: string };
  'awards.presented': { level: number; won: number };
  'rival.taunted': { rival: string };
  /** You passed a rival in the league (session 18): their spoils are paid and their pennant goes up. */
  'rival.overtaken': { index: number; rank: number };
}

export interface StationResult {
  stationName: string;
  boarded: number;
  waiting: number;
  /** Guests who wanted to travel but found no free bed (a sign the train needs cabins). */
  leftBehind: number;
  alighted: number;
  tips: number;
  luggageLoaded: number;
  luggageTotal: number;
  stars: number;
  clean: boolean;
  bonusCash: number;
  /** Session 24, the result card: 1–3 stars (everyone with a bed aboard, the bags loaded; both is a perfect 3). */
  rating: number;
  /** Fares sold at this stop plus the tips left by those who got off. */
  earned: number;
  /** Perfect stops in a row, this one included (0 after any other stop). */
  streak: number;
  /** The share of `bonusCash` the streak added. */
  streakBonus: number;
  /** What the travellers who missed the train would have paid (shown, never taken). */
  missedFare: number;
  /** The misses are shown (the soft cues are on): the red line, the "aww", the glance at the platform. */
  showMissed: boolean;
}
