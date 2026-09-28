import type { CurrencyKind, ItemKind, JourneyPhase, StaffRole } from '../core/types';

/** Every gameplay event. UI, audio, analytics, quests and FTUE all listen here instead of reaching in. */
export interface GameEvents {
  'currency.changed': { kind: CurrencyKind; amount: number; delta: number; source: string };
  'cash.collected': { amount: number; x: number; z: number };
  'guest.checkedIn': { fare: number; x: number; z: number };
  'guest.boarded': Record<string, never>;
  'guest.alighted': { tip: number };
  'request.fulfilled': { item: ItemKind; tip: number; x: number; z: number; byPlayer: boolean };
  'cabin.cleaned': { byPlayer: boolean; x: number; z: number };
  'spot.cleaned': { x: number; z: number; byPlayer: boolean };
  'item.picked': { item: ItemKind; byPlayer: boolean };
  'item.dropped': { item: ItemKind; byPlayer: boolean };
  'item.returned': { item: ItemKind; byPlayer: boolean };
  'luggage.loaded': { byPlayer: boolean };
  'unlock.completed': { id: string; price: number; x: number; z: number };
  'tile.draining': { x: number; z: number };
  'carriage.coupled': { index: number; type: string };
  'staff.hired': { role: StaffRole; carriage: number };
  'stars.added': { amount: number; source: string; x?: number; z?: number };
  'level.up': { level: number };
  'journey.phase': { phase: JourneyPhase; previous: JourneyPhase; station: number };
  'journey.lastCall': Record<string, never>;
  'station.result': StationResult;
  'bathroom.used': { tipped: boolean };
  'bathroom.restocked': Record<string, never>;
  'crate.delivered': Record<string, never>;
  'ftue.step': { step: string };
  'postcard.collected': { id: string; name: string };
  'story.step': { id: string; step: number; done: boolean };
  'boost.changed': Record<string, never>;
  'toast': { text: string; icon?: string };
}

export interface StationResult {
  stationName: string;
  boarded: number;
  waiting: number;
  alighted: number;
  tips: number;
  luggageLoaded: number;
  luggageTotal: number;
  stars: number;
  clean: boolean;
  bonusCash: number;
}
