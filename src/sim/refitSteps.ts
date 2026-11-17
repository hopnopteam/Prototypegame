import { CARRIAGE_CATALOGUE } from '../config/content';
import type { CarriageType } from '../core/types';

/**
 * Phase 1, the carriage lifecycle: Broken → Repaired → tiers 1, 2, 3 → Staffed. Every carriage has three refit tiers;
 * a carriage with a fourth refit (the passenger carriages: Repair, then Comfort, First Class and the Royal Suite) counts
 * its first one, the Repair, as "Repaired", not a tier. Returns 1–3 for a refit tier's step, 0 for the Repair of such a
 * carriage (or a tier it does not sell).
 */
export function refitStep(type: CarriageType, tier: number): number {
  const tiers = CARRIAGE_CATALOGUE[type].unlocks
    .filter((u) => u.kind === 'refurb')
    .map((u) => u.tier ?? 1)
    .sort((a, b) => a - b);
  const steps = tiers.length > 3 ? tiers.slice(tiers.length - 3) : tiers;
  const i = steps.indexOf(tier);
  if (i >= 0) return i + 1;
  // An older refit this kind no longer sells (Business, folded into First Class): the step it sits under.
  let step = 0;
  steps.forEach((t, k) => {
    if (t < tier) step = k + 1;
  });
  return tiers.length > 3 && tier <= tiers[0] ? 0 : step;
}
