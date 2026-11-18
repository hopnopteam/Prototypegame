import type { CriticDef, RouteStationRules, StationEventDef } from '../config/routes';

/**
 * Phase 2, special stops: which (if any) comes at a stop, pure so the spacing can be tested. An event comes after
 * `gap` ordinary stops (a gap drawn from the route's `eventEvery` after each one, so never two in a row), from the
 * route's `eventsFrom`th stop, among the events allowed here (its station, enough carriages), never the same one twice
 * running; an event of this very station is three times as likely (Ashford Market's Harvest Fair on market day).
 */
export interface EventPickState {
  /** Stops completed so far (this stop is the next one). */
  stopsCompleted: number;
  /** Ordinary stops since the last event, and the gap the next one waits for. */
  sinceEvent: number;
  eventGap: number;
  lastEvent: string | null;
  carriages: number;
  /** This stop's station (its index on the route). */
  station: number;
}

export function eventChoices(rules: RouteStationRules, s: EventPickState): StationEventDef[] {
  if (s.stopsCompleted + 1 < rules.eventsFrom) return [];
  if (s.sinceEvent < Math.max(1, s.eventGap)) return [];
  return rules.events.filter((e) => (e.station === undefined || e.station === s.station) && (e.minCarriages ?? 0) <= s.carriages && e.id !== s.lastEvent);
}

export function pickEvent(rules: RouteStationRules, s: EventPickState, random: () => number): StationEventDef | null {
  const choices = eventChoices(rules, s);
  if (choices.length === 0) return null;
  const weight = (e: StationEventDef): number => e.weight * (e.station === s.station ? 3 : 1);
  let total = 0;
  for (const e of choices) total += weight(e);
  let r = random() * total;
  for (const e of choices) {
    r -= weight(e);
    if (r <= 0) return e;
  }
  return choices[choices.length - 1];
}

/** The gap before the next event, drawn from the route's `eventEvery` (inclusive). */
export function nextGap(rules: RouteStationRules, random: () => number): number {
  const [lo, hi] = rules.eventEvery;
  return lo + Math.floor(random() * (hi - lo + 1));
}

/**
 * The critic's score, 0–1, from what they saw while aboard: the share of rooms tidy, how quickly requests were met
 * (1 for none waiting, falling to 0 at a late wait) and the passengers' mood. Each counts as an average of samples.
 */
export function criticScore(clean: [number, number], speed: [number, number], mood: [number, number]): number {
  const avg = (a: [number, number], fallback: number): number => (a[1] > 0 ? a[0] / a[1] : fallback);
  const s = 0.4 * avg(clean, 1) + 0.3 * avg(speed, 1) + 0.3 * avg(mood, 1);
  return Math.max(0, Math.min(1, s));
}

/** Great, mixed or poor, by the critic's bands. */
export function criticVerdict(score: number, rules: Pick<CriticDef, 'great' | 'mixed'>): 'great' | 'mixed' | 'poor' {
  if (score >= rules.great) return 'great';
  if (score >= rules.mixed) return 'mixed';
  return 'poor';
}
