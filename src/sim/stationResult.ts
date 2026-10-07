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
