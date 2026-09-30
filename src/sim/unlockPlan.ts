import { CARRIAGE_CATALOGUE, CHOOSABLE, COUPLE_SLOTS, LEGACY_TRAIN, MAX_CARRIAGES, SLOT_PRICE_STEP, STATION_UPGRADES, type UnlockDef } from '../config/content';
import type { CarriageType } from '../core/types';

/** A tile's id: the carriage slot it lives in plus its key in that carriage's catalogue entry. */
export const tileId = (carriage: number, key: string): string => `c${carriage}.${key}`;

/**
 * The whole unlock chain for a train the player has designed: every carriage's own tiles (priced for the
 * slot it took) plus the couplings. Rebuilt whenever a carriage joins.
 */
export function buildUnlocks(carriages: readonly CarriageType[]): UnlockDef[] {
  const defs: UnlockDef[] = [];
  let cabinsBefore = 0;
  carriages.forEach((type, index) => {
    const entry = CARRIAGE_CATALOGUE[type];
    const scale = index <= 1 ? 1 : 1 + SLOT_PRICE_STEP * (index - 1);
    for (const t of entry.unlocks) {
      defs.push({
        id: tileId(index, t.key),
        kind: t.kind,
        label: t.label.replace('{n}', String(cabinsBefore + (t.cabin ?? 0) + 1)),
        price: Math.round(t.price * scale),
        stars: t.stars,
        carriage: index,
        requires: t.requires.map((r) => (r === 'couple' ? `couple_${index}` : r.startsWith('@') ? r.slice(1) : tileId(index, r))),
        flags: t.flags,
        cabin: t.cabin,
        bathroom: t.bathroom,
        role: t.role,
        tier: t.tier,
        comfort: t.comfort,
        effect: t.effect,
      });
    }
    cabinsBefore += entry.cabins;
  });
  for (const u of STATION_UPGRADES) {
    defs.push({ id: `st.${u.key}`, kind: u.kind, label: u.label, price: u.price, stars: u.stars, carriage: -1, requires: u.requires, effect: u.effect });
  }
  COUPLE_SLOTS.forEach((slot, i) => {
    const n = i + 1;
    defs.push({ id: `couple_${n}`, kind: 'couple', label: 'New Carriage', price: slot.price, stars: slot.stars, carriage: n, requires: slot.requires, effect: 'You choose what joins the train' });
  });
  return defs;
}

/** What the train needs, as seen at the last stops: drives which carriage the chooser recommends. */
export interface ChoiceSignals {
  /** Guests left on the platform for want of a bed. */
  leftBehind: number;
  /** Bags left on the platform because the racks were full. */
  luggageLeft: number;
}

export interface CarriageChoice {
  type: CarriageType;
  /** Why this one is recommended right now (only on the first choice, when there is a reason). */
  reason: string | null;
}

/** Carriages the train may take next (within each type's limit, with what they need already aboard). */
export function allowedCarriages(carriages: readonly CarriageType[]): CarriageType[] {
  if (carriages.length >= MAX_CARRIAGES) return [];
  const count = (t: CarriageType): number => carriages.filter((c) => c === t).length;
  return CHOOSABLE.filter((t) => {
    const entry = CARRIAGE_CATALOGUE[t];
    return count(t) < entry.max && (entry.needs ?? []).every((n) => carriages.includes(n));
  });
}

/**
 * Up to three cards for the chooser, the best pick first: beds first, then a washroom car, then racks if bags
 * were left behind, then the stores, then more beds if guests are still being turned away.
 */
export function carriageChoices(carriages: readonly CarriageType[], signals: ChoiceSignals, limit = 3): CarriageChoice[] {
  const allowed = allowedCarriages(carriages);
  const has = (t: CarriageType): boolean => carriages.includes(t);
  let best: CarriageType | null = null;
  let reason: string | null = null;
  if (!has('sleeper') && allowed.includes('sleeper')) {
    // Beds first: every guest you turn away is a fare you missed.
    best = 'sleeper';
    reason = signals.leftBehind > 0 ? 'Guests need beds' : 'More beds';
  } else if (!has('bathroom') && allowed.includes('bathroom')) {
    best = 'bathroom';
    reason = 'Guests want a loo';
  } else if (signals.luggageLeft > 0 && allowed.includes('luggage')) {
    best = 'luggage';
    reason = 'Bags need racks';
  } else if (has('bathroom') && !has('supply') && allowed.includes('supply')) {
    best = 'supply';
    reason = 'Keeps towels stocked';
  } else if (signals.leftBehind > 0 && allowed.includes('sleeper')) {
    best = 'sleeper';
    reason = 'Guests need beds';
  }
  const ordered = best ? [best, ...allowed.filter((t) => t !== best)] : allowed;
  return ordered.slice(0, limit).map((type, i) => ({ type, reason: i === 0 ? reason : null }));
}

/** v2 → v3: ids tied to the old fixed carriage order become slot-relative ids. */
export function migrateLegacyId(id: string): string {
  const room = /^(cabin|bath|refurb)_(\d+)_(\d+)$/.exec(id);
  if (room) return tileId(Number(room[2]), `${room[1]}_${room[3]}`);
  const staff = /^((?:hire|up)_[a-z]+)_(\d+)$/.exec(id);
  if (staff) return tileId(Number(staff[2]), staff[1]);
  return id;
}

/** The carriages an old save had coupled, in the old fixed order. */
export function legacyCarriages(unlocked: readonly string[]): CarriageType[] {
  let coupled = 0;
  for (let n = 1; n < LEGACY_TRAIN.length; n++) if (unlocked.includes(`couple_${n}`)) coupled = n;
  return LEGACY_TRAIN.slice(0, coupled + 1);
}

export interface StationPerks {
  tips: number;
  fares: number;
  passengers: number;
  vip: number;
  stationBonus: number;
}

/** What the station upgrades bought so far add up to (each bonus is additive). */
export function stationPerks(isUnlocked: (id: string) => boolean): StationPerks {
  const perks: StationPerks = { tips: 0, fares: 0, passengers: 0, vip: 0, stationBonus: 0 };
  for (const u of STATION_UPGRADES) {
    if (!isUnlocked(`st.${u.key}`)) continue;
    perks.tips += u.bonus.tips ?? 0;
    perks.fares += u.bonus.fares ?? 0;
    perks.passengers += u.bonus.passengers ?? 0;
    perks.vip += u.bonus.vip ?? 0;
    perks.stationBonus += u.bonus.stationBonus ?? 0;
  }
  return perks;
}
