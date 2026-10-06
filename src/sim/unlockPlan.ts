import { CARRIAGE_CATALOGUE, CHOOSABLE, COUPLE_SLOTS, LEGACY_TRAIN, MAX_CARRIAGES, SLOT_PRICE_STEP, STATION_UPGRADES, type UnlockDef } from '../config/content';
import { CLASS_BY_ID, isPassengerType, type ClassId } from '../config/classes';
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
        group: t.group,
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

/**
 * Whether a refit tile counts for a goal's filter: a tier ("3", any carriage) or a class ("class:first": a
 * passenger carriage reaching it; service cars have no class).
 */
export function refitMatches(u: UnlockDef, filter: string | undefined, type: CarriageType | undefined): boolean {
  if (u.kind !== 'refurb') return false;
  if (!filter) return true;
  const [what, id] = filter.split(':');
  if (what !== 'class') return String(u.tier) === filter;
  const cls = CLASS_BY_ID[id as ClassId];
  return !!cls && type !== undefined && isPassengerType(type) && u.tier === cls.tier;
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
    return count(t) < entry.max && (entry.needs ?? []).every((n) => carriages.includes(n)) && carriages.length >= (entry.fromSlot ?? 0);
  });
}

/**
 * Up to three cards for the chooser, the best pick first: beds first, then a washroom car, then the venues as
 * they join (a café, the dining car), more beds if guests are still being turned away, racks if bags were left
 * behind, the cinema, the bar and the dome; the stores and luggage cars are always there as alternatives.
 */
export function carriageChoices(carriages: readonly CarriageType[], signals: ChoiceSignals, limit = 3): CarriageChoice[] {
  const allowed = allowedCarriages(carriages);
  const has = (t: CarriageType): boolean => carriages.includes(t);
  const sleepers = carriages.filter((t) => t === 'sleeper').length;
  let best: CarriageType | null = null;
  let reason: string | null = null;
  const pick = (type: CarriageType, why: string): boolean => {
    if (best || !allowed.includes(type)) return false;
    best = type;
    reason = why;
    return true;
  };
  // Beds first (every guest turned away is a fare missed), then the café (session 20: the first venue, early, so
  // the new gameplay arrives with the third carriage), then a washroom; guests left behind on the platform ask for
  // the second sleeper next. Then the other venues as the train grows: the dining car, the cinema, the bar, the dome.
  if (!has('sleeper')) pick('sleeper', signals.leftBehind > 0 ? 'Guests need beds' : 'More beds');
  if (!has('cafe')) pick('cafe', 'Guests want coffee');
  if (!has('bathroom')) pick('bathroom', 'Guests want a loo');
  if (signals.leftBehind > 0 && sleepers < 2) pick('sleeper', 'Guests need beds');
  if (!has('dining')) pick('dining', 'Dinner is served');
  if (sleepers < 2) pick('sleeper', 'More guests');
  if (!has('cinema')) pick('cinema', 'Films by night');
  if (!has('bar')) pick('bar', 'Happy hours');
  if (!has('dome')) pick('dome', 'Scenic views');
  if (signals.luggageLeft > 0) pick('luggage', 'Bags need racks');
  if (has('bathroom') && !has('supply')) pick('supply', 'Keeps towels stocked');
  // The service cars stay on offer when they would help: bags left on the platform, a washroom to keep stocked.
  const alternates: CarriageChoice[] = [];
  if (signals.luggageLeft > 0 && allowed.includes('luggage') && best !== 'luggage') alternates.push({ type: 'luggage', reason: 'Bags need racks' });
  if (has('bathroom') && !has('supply') && allowed.includes('supply') && best !== 'supply') alternates.push({ type: 'supply', reason: 'Keeps towels stocked' });
  const first: CarriageChoice[] = best ? [{ type: best, reason }] : [];
  const taken = new Set<CarriageType>([...first, ...alternates].map((c) => c.type));
  const rest = allowed.filter((t) => !taken.has(t)).map((type) => ({ type, reason: null }));
  return [...first, ...alternates.slice(0, Math.max(0, limit - 2)), ...rest, ...alternates.slice(Math.max(0, limit - 2))].slice(0, limit);
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
