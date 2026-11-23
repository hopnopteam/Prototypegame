import { ACTIVE_ROUTE } from '../config/routes';
import { CARRIAGE_CATALOGUE, CARRIAGE_ORDER, COUPLE_SLOTS, LEGACY_TRAIN, MAX_CARRIAGES, SLOT_PRICE_STEP, STATION_UPGRADES, type UnlockDef, type UnlockTemplate } from '../config/content';
import { CLASS_BY_ID, isPassengerType, type ClassId } from '../config/classes';
import type { CarriageType } from '../core/types';
import { ECONOMY } from '../config/economy';
import { roomsAt } from '../world/layout';

/** The late-game price curve (config: priceCurve): unchanged up to `from`, up to `max` times by `to`. */
export function curvedPrice(price: number, curve = ECONOMY.priceCurve): number {
  const scaled = scaledPrice(price);
  if (scaled <= curve.from) return scaled;
  const t = Math.min(1, Math.log(scaled / curve.from) / Math.log(curve.to / curve.from));
  return Math.round(scaled * (1 + (curve.max - 1) * t));
}

/**
 * Session 30 (owner: "the upgrades are unlocked super fast… each step should feel earned and longer"): every price
 * above `keepUnder` (the opening's first tiles, which the first fares buy exactly) is multiplied by `factor`.
 */
export function scaledPrice(price: number, scale = ECONOMY.priceScale): number {
  return price <= scale.keepUnder ? price : Math.round((price * scale.factor) / 5) * 5;
}

/** Phase 3: the route's price multiplier (Route 2: ×2.5), rounded to 5 above the opening's small tiles. */
export function routePrice(price: number, econ = ECONOMY): number {
  const m = econ.route.priceMultiplier;
  if (m === 1) return price;
  return price <= econ.priceScale.keepUnder ? Math.round(price * m) : Math.round((price * m) / 5) * 5;
}

/** Phase 3: the n-th coupling's price in play (the route's `couplePrices`; the old catalogue price past its end). */
export function couplePrice(n: number, econ = ECONOMY): number {
  const own = econ.route.couplePrices[n - 1];
  return routePrice(own ?? curvedPrice(COUPLE_SLOTS[n - 1]?.price ?? 0), econ);
}

/**
 * Phase 3: a carriage tile's price in play: its catalogue price × the route's price for its slot (and for a hire or
 * staff training, `staffCost`; for First Class and up, `classRefit`), scaled and curved, then × the route multiplier.
 * The lobby's shoes have their own prices (`route.shoePrices`).
 */
export function tilePrice(t: UnlockTemplate, type: CarriageType, index: number, econ = ECONOMY): number {
  const r = econ.route;
  if (t.kind === 'shoes') {
    const n = Number(t.key.split('_')[1]);
    const own = r.shoePrices[n - 1];
    if (own !== undefined) return routePrice(own, econ);
  }
  let scale = r.slotPrice[index] ?? (index <= 1 ? 1 : 1 + SLOT_PRICE_STEP * (index - 1));
  if (t.kind === 'hire' || t.kind === 'staffUpgrade') scale *= r.staffCost;
  if (t.kind === 'refurb' && isPassengerType(type) && (t.tier ?? 0) >= r.classRefit.fromTier) scale *= r.classRefit.multiplier;
  return routePrice(curvedPrice(Math.round(t.price * scale)), econ);
}

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
    // Phase 4: the plan's own number of rooms (the route's layout may give a lobby four; a tile for a room the plan
    // does not have is left out).
    const rooms = isPassengerType(type) ? roomsAt(type, 0) : entry.cabins;
    for (const t of entry.unlocks) {
      if (t.kind === 'cabin' && t.cabin !== undefined && t.cabin >= rooms) continue;
      defs.push({
        id: tileId(index, t.key),
        kind: t.kind,
        label: t.label.replace('{n}', String(cabinsBefore + (t.cabin ?? 0) + 1)),
        price: tilePrice(t, type, index),
        stars: t.stars,
        carriage: index,
        requires: t.requires.map((r) => (r === 'couple' ? `couple_${index}` : r.startsWith('@') ? r.slice(1) : tileId(index, r))),
        flags: t.flags,
        work: t.work,
        cabin: t.cabin,
        bathroom: t.bathroom,
        role: t.role,
        tier: t.tier,
        comfort: t.comfort,
        group: t.group,
        effect: t.effect,
      });
    }
    cabinsBefore += rooms;
  });
  // Phase 2: the route's own station upgrades, in its order (config/routes.ts `station.upgrades`).
  for (const key of ACTIVE_ROUTE.station.upgrades) {
    const u = STATION_UPGRADES.find((d) => d.key === key);
    if (u) defs.push({ id: `st.${u.key}`, kind: u.kind, label: u.label, price: routePrice(curvedPrice(u.price)), stars: u.stars, carriage: -1, requires: u.requires, effect: u.effect, work: u.work });
  }
  COUPLE_SLOTS.forEach((slot, i) => {
    const n = i + 1;
    defs.push({ id: `couple_${n}`, kind: 'couple', label: 'New Carriage', price: couplePrice(n), stars: slot.stars, carriage: n, requires: slot.requires, effect: 'A surprise joins the train' });
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

/**
 * The carriage the next coupling brings (session 29: a surprise in a designed order, `CARRIAGE_ORDER`): the first entry
 * of the order the train does not have yet, counting repeats (a second Sleeper is the second "sleeper" in the order).
 * A train from an older save that chose differently simply gets what it still lacks; null once the train is full.
 */
export function nextCarriage(carriages: readonly CarriageType[], order: readonly CarriageType[] = CARRIAGE_ORDER): CarriageType | null {
  if (carriages.length >= MAX_CARRIAGES) return null;
  const owned = new Map<CarriageType, number>();
  for (const t of carriages) owned.set(t, (owned.get(t) ?? 0) + 1);
  const wanted = new Map<CarriageType, number>();
  for (const t of order) {
    wanted.set(t, (wanted.get(t) ?? 0) + 1);
    if ((wanted.get(t) ?? 0) > (owned.get(t) ?? 0)) return t;
  }
  return null;
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
  /** Phase 2's platform pieces. */
  /** Session 55: tickets sold in half the time (the Ticket Office). */
  fastTickets: boolean;
  /** Session 55: how many times longer travellers wait before turning grumpy (1 without the Waiting Benches). */
  patience: number;
  helper: boolean;
  kiosk: boolean;
  secondDoor: boolean;
}

/** What the station upgrades bought so far add up to (each bonus is additive). */
export function stationPerks(isUnlocked: (id: string) => boolean): StationPerks {
  const perks: StationPerks = { tips: 0, fares: 0, passengers: 0, vip: 0, stationBonus: 0, fastTickets: false, patience: 1, helper: false, kiosk: false, secondDoor: false };
  for (const u of STATION_UPGRADES) {
    if (!isUnlocked(`st.${u.key}`)) continue;
    perks.tips += u.bonus.tips ?? 0;
    perks.fares += u.bonus.fares ?? 0;
    perks.passengers += u.bonus.passengers ?? 0;
    perks.vip += u.bonus.vip ?? 0;
    perks.stationBonus += u.bonus.stationBonus ?? 0;
    perks.fastTickets ||= u.bonus.fastTickets ?? false;
    perks.patience = Math.max(perks.patience, u.bonus.patience ?? 1);
    perks.helper ||= u.bonus.helper ?? false;
    perks.kiosk ||= u.bonus.kiosk ?? false;
    perks.secondDoor ||= u.bonus.secondDoor ?? false;
  }
  return perks;
}
