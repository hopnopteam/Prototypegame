/**
 * The station result's arithmetic (session 24), pure so it can be tested: the stop's stars and the perfect
 * streak's bonus. Nothing here ever takes anything away: a stop that is not perfect only starts the streak again.
 */

/** Stars for a stop: one for showing up, one when everyone with a bed boarded, one when the bags were loaded. */
export function stopRating(missed: number, bagsDone: boolean): number {
  return 1 + (missed === 0 ? 1 : 0) + (bagsDone ? 1 : 0);
}

/** The perfect streak after a stop: one more when it was perfect, back to 0 otherwise. */
export function nextStreak(streak: number, perfect: boolean): number {
  return perfect ? streak + 1 : 0;
}

/**
 * The station bonus with the streak: the first perfect stop pays the base, each one in a row after it adds
 * `step` of the base, for up to `max` steps. Returns the whole bonus and the part the streak added.
 */
export function streakBonus(base: number, streak: number, step: number, max: number): { total: number; extra: number } {
  const steps = Math.max(0, Math.min(streak - 1, max));
  const total = Math.round(base * (1 + step * steps));
  return { total, extra: total - Math.round(base) };
}

/**
 * Fix list 4.2, the Train Rating (replaces the old "no consequences" rule): how well a stop went, 0..1. The share
 * of travellers with a bed who were boarded, the share of bags loaded (or the racks full) and the service mood
 * (quick requests, stocked washrooms), weighted.
 */
export function stopQuality(
  boarded: number, missed: number, bagsLoaded: number, bagsTotal: number, bagsDone: boolean, mood: number,
  weights: { boarded: number; bags: number; service: number },
): number {
  const people = boarded + missed > 0 ? boarded / (boarded + missed) : 1;
  const bags = bagsDone || bagsTotal <= 0 ? 1 : Math.min(1, bagsLoaded / bagsTotal);
  const service = Math.max(0, Math.min(1, mood));
  const total = weights.boarded + weights.bags + weights.service;
  return (people * weights.boarded + bags * weights.bags + service * weights.service) / Math.max(1e-6, total);
}

/** The Train Rating, 1..5 stars: 1 + 4 × the average quality of the recent stops (`start` before any). */
export function trainRating(recent: readonly number[], start: number): number {
  if (recent.length === 0) return start;
  let sum = 0;
  for (const q of recent) sum += q;
  return 1 + 4 * Math.max(0, Math.min(1, sum / recent.length));
}

/** A rating's effect: `low` at 1 star, ×1 at 3, `high` at 5, straight lines between. */
export function ratingEffect(rating: number, low: number, high: number): number {
  const r = Math.max(1, Math.min(5, rating));
  return r <= 3 ? low + (1 - low) * ((r - 1) / 2) : 1 + (high - 1) * ((r - 3) / 2);
}
