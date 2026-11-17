import { ALL_COUPLE_SLOTS, CARRIAGE_CATALOGUE, CARRIAGE_ORDER, COUPLE_SLOTS } from '../config/content';
import type { CarriageType } from '../core/types';
import { buildUnlocks, curvedPrice } from './unlockPlan';
import { refitStep } from './refitSteps';

/**
 * Phase 1, the Countryside Express (save v4 → v5): an older train is rebuilt into the route's lineup.
 * - A second Sleeper becomes the Family Sleeper (the tiles both kinds share carry over; the rest are refunded).
 * - The Observation Dome, the Stores Car and the Luggage Car leave the train; everything paid into their tiles
 *   (part-payments too) and into the couplings that no longer exist comes back as cash.
 * - What stays is re-sorted into the route's order, and every tile id, part-payment and hired helper follows its
 *   carriage to its new place. The couplings are set to the carriages kept.
 * - Nothing else is touched: gems, Rail Miles, level, stars, station upgrades, flags. New seat tiles simply appear.
 * Pure: it takes the old route and staff and returns the new ones.
 */
export interface RouteSave {
  carriages: string[];
  unlocked: string[];
  partial: Record<string, number>;
}

export interface RouteMigration {
  carriages: CarriageType[];
  unlocked: string[];
  partial: Record<string, number>;
  staff: Record<string, { level: number }>;
  /** Cash handed back for what left the train. */
  refund: number;
  /** Analytics milestones the old train had already reached (so none fires a second time). */
  gaSent: Record<string, boolean>;
}

const TILE = /^c(\d+)\.(.+)$/;
const COUPLE = /^couple_(\d+)$/;

export function migrateRoute(route: RouteSave, staff: Record<string, { level: number }>, level: number): RouteMigration {
  const old = route.carriages.filter((t): t is CarriageType => t in CARRIAGE_CATALOGUE);
  const oldDefs = new Map(buildUnlocks(old).map((d) => [d.id, d]));
  const priceOf = (id: string): number => {
    const def = oldDefs.get(id);
    if (def) return def.price;
    // A coupling beyond this route's last one (a nine-carriage train's eighth).
    const couple = COUPLE.exec(id);
    const slot = couple ? ALL_COUPLE_SLOTS[Number(couple[1]) - 1] : undefined;
    return slot ? curvedPrice(slot.price) : 0;
  };

  // Each old carriage's type on the new route (a second Sleeper is the Family Sleeper), or null if it leaves.
  const allowed = new Map<CarriageType, number>();
  for (const t of CARRIAGE_ORDER) allowed.set(t, (allowed.get(t) ?? 0) + 1);
  const used = new Map<CarriageType, number>();
  const mapped: (CarriageType | null)[] = old.map((type, i) => {
    let t: CarriageType = type;
    if (i > 0 && type === 'sleeper' && (used.get('sleeper') ?? 0) >= (allowed.get('sleeper') ?? 0)) t = 'familySleeper';
    if (i === 0) t = 'lobby';
    const n = used.get(t) ?? 0;
    if (n >= (allowed.get(t) ?? 0)) return null;
    used.set(t, n + 1);
    return t;
  });

  // Re-sort what stays into the route's order (the n-th of a type takes the n-th place of that type).
  const rank = (type: CarriageType, nth: number): number => {
    let seen = 0;
    for (let i = 0; i < CARRIAGE_ORDER.length; i++) if (CARRIAGE_ORDER[i] === type && seen++ === nth) return i;
    return CARRIAGE_ORDER.length;
  };
  const nth = new Map<CarriageType, number>();
  const kept = mapped
    .map((type, from) => {
      if (!type) return null;
      const k = nth.get(type) ?? 0;
      nth.set(type, k + 1);
      return { from, type, rank: rank(type, k) };
    })
    .filter((k): k is { from: number; type: CarriageType; rank: number } => k !== null)
    .sort((a, b) => a.rank - b.rank);
  const slotOf = new Map<number, number>();
  kept.forEach((k, to) => slotOf.set(k.from, to));
  const carriages = kept.map((k) => k.type);
  const couplings = Math.min(carriages.length - 1, COUPLE_SLOTS.length);

  let refund = 0;
  const unlocked: string[] = [];
  const keep = (id: string): string | null => {
    const tile = TILE.exec(id);
    if (tile) {
      const from = Number(tile[1]);
      const key = tile[2];
      const to = slotOf.get(from);
      if (to === undefined) return null;
      const type = carriages[to];
      const known = CARRIAGE_CATALOGUE[type].unlocks.some((u) => u.key === key);
      // A tile the carriage's own kind no longer has stays (an older class refit counts for the carriage's tier) unless
      // the carriage changed kind (a Sleeper turned Family Sleeper keeps only what a Family Sleeper has).
      if (!known && type !== old[from]) return null;
      return `c${to}.${key}`;
    }
    const couple = COUPLE.exec(id);
    if (couple) return Number(couple[1]) <= couplings ? id : null;
    return id;
  };
  for (const id of route.unlocked) {
    const next = keep(id);
    if (next === null) refund += priceOf(id);
    else if (!unlocked.includes(next)) unlocked.push(next);
  }
  // The couplings follow the carriages kept (a train that lost one was paid back for its coupling above).
  for (let n = 1; n <= couplings; n++) if (!unlocked.includes(`couple_${n}`)) unlocked.push(`couple_${n}`);

  const partial: Record<string, number> = {};
  for (const [id, paid] of Object.entries(route.partial ?? {})) {
    const next = keep(id);
    if (next === null || unlocked.includes(next)) refund += paid;
    else partial[next] = paid;
  }

  const movedStaff: Record<string, { level: number }> = {};
  for (const [key, value] of Object.entries(staff)) {
    const [role, carriage] = key.split('_');
    const to = slotOf.get(Number(carriage));
    if (to !== undefined) movedStaff[`${role}_${to}`] = value;
  }

  // What the old train had already reached, so the new analytics events never fire twice for it.
  const gaSent: Record<string, boolean> = {};
  for (let n = 1; n <= old.length; n++) gaSent[`train:${n}`] = true;
  for (const type of carriages) gaSent[`coupled:${type}`] = true;
  carriages.forEach((type, i) => {
    let tier = 0;
    for (const id of unlocked) {
      const m = /^c(\d+)\.refurb_(\d)$/.exec(id);
      if (m && Number(m[1]) === i) tier = Math.max(tier, Number(m[2]));
    }
    for (let t = 1; t <= tier; t++) {
      const step = refitStep(type, t);
      if (step > 0) gaSent[`tier:${type}:${step}`] = true;
    }
  });
  for (let l = 1; l <= level; l++) gaSent[`level:${l}`] = true;

  return { carriages, unlocked, partial, staff: movedStaff, refund: Math.round(refund), gaSent };
}
