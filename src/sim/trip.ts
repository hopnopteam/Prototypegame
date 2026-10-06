/**
 * One trip, one sleep (session 22). A guest's ride is one night: evening, lights out, morning, then off at
 * their stop. Which part of the night it is follows how far through the ride they are, never going back.
 * Pure, so the rules are unit-tested (tests/trip.test.ts); Guests applies them.
 */
export type TripPhase = 'evening' | 'night' | 'morning';

export interface TripRules {
  /** The evening ends this far through the ride. */
  eveningEnd: number;
  /** Morning starts this far through the ride. */
  morningStart: number;
  /** Shortest night, however late the guest turned in. */
  minSleepSeconds: number;
}

/**
 * How far through their ride a guest is: 0 when they board, 1 pulling into their stop. Legs count whole,
 * the current leg by how far the train has travelled along it (`travelShare`: 0 at a station, 1 arriving).
 */
export function rideProgress(boardStop: number, destinationStop: number, stopSerial: number, travelShare: number): number {
  const legs = Math.max(1, destinationStop - boardStop);
  const done = (stopSerial - boardStop + travelShare) / legs;
  return done <= 0 ? 0 : done >= 1 ? 1 : done;
}

/**
 * The part of the night a guest moves on to. The evening ends only once nothing is pending (`busy`: a request
 * not yet served, an outing, the washroom); the night lasts until the morning share and the shortest night have
 * both passed. A phase never goes back, and the night comes once.
 */
export function nextTripPhase(phase: TripPhase, progress: number, busy: boolean, sleptSeconds: number, rules: TripRules): TripPhase {
  if (phase === 'evening') return !busy && progress >= rules.eveningEnd ? 'night' : 'evening';
  if (phase === 'night') return progress >= rules.morningStart && sleptSeconds >= rules.minSleepSeconds ? 'morning' : 'night';
  return 'morning';
}

/** Picks from weighted wishes, leaving out what this guest has already asked for (never the same thing twice). */
export function freshWish<T extends string>(weights: Partial<Record<T, number>>, asked: ReadonlySet<T>, roll: number): T | null {
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [T, number][]) if (!asked.has(key) && weight > 0) total += weight;
  if (total <= 0) return null;
  let r = roll * total;
  for (const [key, weight] of Object.entries(weights) as [T, number][]) {
    if (asked.has(key) || weight <= 0) continue;
    r -= weight;
    if (r < 0) return key;
  }
  return null;
}
