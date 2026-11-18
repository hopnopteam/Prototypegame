/**
 * The station result's arithmetic (session 24), pure so it can be tested: the stop's stars and the perfect
 * streak's bonus. Nothing here ever takes anything away: a stop that is not perfect only starts the streak again.
 */

/** Stars for a stop (session 38: earned, not given): by its quality, three only when nobody was missed and the bags were loaded. */
export function stopRating(quality: number, missed: number, bagsDone: boolean, bands: { three: number; two: number; one: number }): number {
  if (missed === 0 && bagsDone && quality >= bands.three) return 3;
  if (quality >= bands.two) return 2;
  if (quality >= bands.one) return 1;
  return 0;
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

/**
 * Phase 2, the stop's stars (owner: "rewards only… no grades, no negative wording"): one for everyone aboard, one
 * for the train restocked (every washroom shelf and minibar full as the bell rings), one for every guest happy (nobody
 * kept waiting into a grump, no bag left behind, nobody off the train unhappy here). Three is a perfect stop.
 */
export function stopStars(allAboard: boolean, restocked: boolean, happy: boolean): number {
  if (!allAboard) return 0;
  return 1 + (restocked ? 1 : 0) + (happy ? 1 : 0);
}

/** The stop bonus for its stars: a share of the full bonus (`shares[stars]`, three stars the whole of it). */
export function starBonus(full: number, stars: number, shares: readonly number[]): number {
  return Math.round(full * (shares[Math.max(0, Math.min(shares.length - 1, stars))] ?? 0));
}

/**
 * Phase 2, the Train Rating from guest reviews (owner: "figure out a better way"): every guest who gets off leaves
 * 1–5 stars. Five, less `perUnmet` for each thing they asked for and never got (at most three), `grumpy` if they
 * were kept waiting on the platform, `perLate` for each late delivery.
 */
export function guestReview(unmet: number, grumpy: boolean, late: number, rules: { perUnmet: number; grumpy: number; perLate: number }): number {
  const stars = 5 - Math.min(3, unmet) * rules.perUnmet - (grumpy ? rules.grumpy : 0) - late * rules.perLate;
  return Math.max(1, Math.min(5, Math.round(stars * 2) / 2));
}

/**
 * The Train Rating: the average of the most recent reviews, eased toward `prior` while there are fewer than
 * `priorWeight` of them (so the first guest cannot swing it to 1 or 5). Always recoverable: old reviews roll off.
 */
export function reviewRating(reviews: readonly number[], prior: number, priorWeight: number): number {
  const k = Math.max(0, priorWeight - reviews.length);
  let sum = prior * k;
  for (const r of reviews) sum += r;
  const n = reviews.length + k;
  return n > 0 ? sum / n : prior;
}
