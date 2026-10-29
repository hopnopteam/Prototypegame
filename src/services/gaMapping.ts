import { ANALYTICS } from '../config/analytics';
import type { AnalyticsParams } from './analytics';

/**
 * How the game's analytics events become GameAnalytics events (session 31). The game logs one named event at every
 * moment that matters (`analytics.log('station_result', {...})`); this module turns each into the right GameAnalytics
 * event type, pure and unit-tested (tests/gameanalytics.test.ts checks every id against the SDK's own rules):
 *
 * - **Progression** (funnels with attempts and time): the route levels (`Route1:Level02` Complete, then the next Start)
 *   and the train's size (`Route1Train:Carriage03`).
 * - **Design** (anything else, up to five `:`-separated parts, with an optional value): the first-session beats in
 *   order (`FTUE:05_first_key`, value the second it happened), unlocks, hires, objectives, each station's result, the
 *   daily chest and calendar, press, awards, perks, performance.
 * - **Resource** (the economy): every source and sink of Fares, Gems and Rail Miles, sorted into the declared item
 *   types (`ANALYTICS.itemTypes`) with the precise origin as the item id; summed by the service before sending.
 * - **Ad** and **Business** events for rewarded ads, interstitials and real purchases (while monetization is on).
 *
 * Sessions, retention (day 1, 7, 30…), session length, new and returning users, devices and countries are counted by
 * GameAnalytics itself from the session the SDK opens and closes; nothing here needs to send them.
 */

export type GaCall =
  | { kind: 'design'; id: string; value?: number }
  | { kind: 'progression'; status: 'start' | 'complete' | 'fail'; p1: string; p2?: string; p3?: string; score?: number }
  | { kind: 'resource'; flow: 'source' | 'sink'; currency: string; amount: number; itemType: string; itemId: string }
  | { kind: 'ad'; action: 'show' | 'clicked' | 'failed' | 'reward'; adType: 'rewarded' | 'interstitial'; placement: string }
  | { kind: 'business'; currency: string; cents: number; itemType: string; itemId: string; cart: string };

/** The first session's beats in the order a player meets them (numbered so GameAnalytics sorts them as a funnel). */
export const FTUE_ORDER = [
  'first_ticket', 'first_cash', 'first_unlock', 'first_checkin', 'first_key', 'first_station', 'first_clean',
  'first_carriage', 'route_level_2', 'session_12min', 'first_hire', 'second_carriage', 'porter_hired',
];

/** Characters GameAnalytics accepts in an event part (and an item id). */
const PART_CHARS = /[^A-Za-z0-9 _.()!?-]/g;

/** One event part: allowed characters only, never empty, at most 64 characters. */
export function part(value: string | number | boolean | undefined): string {
  const text = String(value ?? '').replace(PART_CHARS, '_').slice(0, 64);
  return text.length > 0 ? text : 'none';
}

const pad = (n: number): string => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const minutes = (seconds: unknown): number => Math.round(num(seconds) / 6) / 10;

/**
 * Where a currency came from, as one of the declared item types and a precise id. The game's source names look like
 * `pile:cabin`, `objective:obj_12`, `login`, `unlock:c0.cabin_1`, `conductor:speed`.
 */
export function resourceItem(flow: 'source' | 'sink', source: string): { itemType: string; itemId: string } {
  const [head, rest = ''] = source.split(':', 2);
  const tail = source.includes(':') ? source.slice(source.indexOf(':') + 1) : '';
  const id = (fallback: string): string => part(tail || rest || fallback);
  if (head === 'pile') {
    const pile = rest;
    if (pile === 'booth') return { itemType: 'Tickets', itemId: 'stand' };
    if (pile === 'desk') return { itemType: 'Desk', itemId: 'booking' };
    if (pile === 'bonus') return { itemType: 'StationBonus', itemId: 'perfect' };
    if (pile === 'venue') return { itemType: 'Venues', itemId: 'venue' };
    if (pile === 'cabin' || pile === 'bath' || pile === 'floor') return { itemType: 'Tips', itemId: pile };
    return { itemType: 'Tips', itemId: part(pile) };
  }
  switch (head) {
    case 'objective': return { itemType: 'Objective', itemId: id('goal') };
    case 'levelUp': return { itemType: 'LevelUp', itemId: 'level' };
    case 'login': case 'quest': case 'chest': return { itemType: 'Daily', itemId: head };
    case 'press': case 'rival': return { itemType: 'Press', itemId: head };
    // Café and dining pay straight into the wallet as they are handed over (session 38): `venue:cafe`, `venue:dining`.
    case 'venue': return { itemType: 'Venues', itemId: id('venue') };
    // The on-time bonus for ringing the bell early (session 33).
    case 'bell': return { itemType: 'StationBonus', itemId: 'bell' };
    case 'offline': return { itemType: 'Offline', itemId: 'away' };
    case 'rush': return { itemType: 'Rush', itemId: 'streak' };
    case 'refund': return { itemType: 'Refund', itemId: id('refund') };
    case 'exchange': return { itemType: 'Exchange', itemId: 'gems' };
    case 'iap': return { itemType: 'Iap', itemId: id('product') };
    case 'rewarded': return { itemType: 'Ad', itemId: id('rewarded') };
    case 'dev': case 'creative': return { itemType: 'Debug', itemId: head };
    case 'unlock': return { itemType: 'Unlock', itemId: id('tile') };
    case 'conductor': return { itemType: 'Conductor', itemId: id('upgrade') };
    case 'livery': case 'outfit': return { itemType: 'Cosmetic', itemId: part(`${head}_${tail}`) };
    case 'luggageRefund': return { itemType: 'Penalty', itemId: 'lost_bags' };
    default: return { itemType: flow === 'source' ? 'Press' : 'Penalty', itemId: part(head) };
  }
}

/** The GameAnalytics currency for one of the game's currencies, or null for anything unknown. */
export function gaCurrency(kind: unknown): string | null {
  return typeof kind === 'string' ? ANALYTICS.currencies[kind] ?? null : null;
}

/** Translates one of the game's events into GameAnalytics calls (none for events GameAnalytics counts itself). */
export function translate(event: string, p: AnalyticsParams = {}): GaCall[] {
  switch (event) {
    // GameAnalytics opens and closes sessions itself (retention, session length, returning users).
    case 'session_start':
    case 'session_end':
    case 'carriage_joined':
      return [];
    case 'ftue_step': {
      const step = String(p.step ?? '');
      const index = FTUE_ORDER.indexOf(step);
      return [{ kind: 'design', id: `FTUE:${index >= 0 ? pad(index + 1) : '99'}_${part(step)}`, value: num(p.elapsed) }];
    }
    case 'unlock_completed':
      return [{ kind: 'design', id: `Unlock:${part(p.kind ?? 'tile')}:${part(p.id)}`, value: minutes(p.time) }];
    case 'staff_hired':
      return [{ kind: 'design', id: `Staff:Hired:${part(p.role)}`, value: minutes(p.time) }];
    case 'work_earned':
      return [{ kind: 'design', id: `Staff:Earned:${part(p.role ?? p.id)}`, value: minutes(p.time) }];
    case 'carriage_coupled': {
      const count = num(p.count, num(p.index) + 1);
      return [
        { kind: 'progression', status: 'complete', p1: `${ANALYTICS.route}Train`, p2: `Carriage${pad(count)}`, score: Math.round(num(p.time) / 60) },
        { kind: 'progression', status: 'start', p1: `${ANALYTICS.route}Train`, p2: `Carriage${pad(count + 1)}` },
        { kind: 'design', id: `Train:Coupled:${pad(count)}_${part(p.type)}`, value: minutes(p.time) },
      ];
    }
    case 'route_level_up': {
      const level = num(p.level, 2);
      return [
        { kind: 'progression', status: 'complete', p1: ANALYTICS.route, p2: `Level${pad(level - 1)}`, score: Math.round(num(p.time) / 60) },
        { kind: 'progression', status: 'start', p1: ANALYTICS.route, p2: `Level${pad(level)}` },
      ];
    }
    case 'station_result': {
      const calls: GaCall[] = [
        { kind: 'design', id: `Station:Result:${part(p.stars ?? 'unrated')}star`, value: num(p.train_rating) },
        { kind: 'design', id: 'Station:Boarded', value: num(p.boarded) },
        { kind: 'design', id: 'Station:Earned', value: num(p.earned) },
        { kind: 'design', id: 'Rating:Train', value: num(p.train_rating) },
      ];
      if (num(p.missed) > 0) calls.push({ kind: 'design', id: 'Station:Missed', value: num(p.missed) });
      if (num(p.no_room) > 0) calls.push({ kind: 'design', id: 'Station:NoRoom', value: num(p.no_room) });
      if (num(p.bags_left) > 0) calls.push({ kind: 'design', id: 'Station:BagsLeft', value: num(p.bags_left) });
      if (p.bonus === true) calls.push({ kind: 'design', id: 'Station:Perfect', value: num(p.streak, 1) });
      return calls;
    }
    case 'objective_completed':
      return [{ kind: 'design', id: `Objective:${pad(num(p.index) + 1)}_${part(p.id)}`, value: minutes(p.time) }];
    case 'currency_earned':
    case 'currency_spent': {
      const currency = gaCurrency(p.currency);
      const amount = Math.round(num(p.amount));
      if (!currency || amount <= 0) return [];
      const flow = event === 'currency_earned' ? 'source' : 'sink';
      const item = resourceItem(flow, String((flow === 'source' ? p.source : p.sink) ?? 'unknown'));
      return [{ kind: 'resource', flow, currency, amount, ...item }];
    }
    case 'chest_opened':
      return [{ kind: 'design', id: 'Daily:Chest', value: num(p.cash) }];
    case 'login_claimed':
      return [{ kind: 'design', id: `Daily:Login:Day${pad(num(p.day) + 1)}` }];
    case 'quest_claimed':
      return [{ kind: 'design', id: `Daily:Quest:${part(p.kind)}` }];
    case 'offline_earnings':
      return [{ kind: 'design', id: 'Session:Offline', value: num(p.amount) }];
    case 'press_printed':
      return [{ kind: 'design', id: `Press:${part(p.trigger)}` }];
    case 'award_won':
      return [{ kind: 'design', id: `Award:${part(p.award)}`, value: num(p.minute) }];
    case 'perk_earned':
    case 'perk_offered':
    case 'perk_used':
      return [{ kind: 'design', id: `Perk:${event.slice(5)}:${part(p.perk ?? p.placement)}` }];
    case 'rival_overtaken':
    case 'rival_taunt':
    case 'rival_dare':
      return [{ kind: 'design', id: `Rival:${event.slice(6)}:${part(p.result ?? p.rival)}` }];
    case 'rewarded_offer_shown':
      return [{ kind: 'ad', action: 'show', adType: 'rewarded', placement: part(p.placement) }];
    case 'rewarded_offer_accepted':
      return [{ kind: 'ad', action: 'clicked', adType: 'rewarded', placement: part(p.placement) }];
    case 'rewarded_offer_completed':
      return p.method === 'gems'
        ? [{ kind: 'design', id: `Rewarded:PaidWithGems:${part(p.placement)}` }]
        : [{ kind: 'ad', action: 'reward', adType: 'rewarded', placement: part(p.placement) }];
    case 'interstitial_shown':
      return [{ kind: 'ad', action: 'show', adType: 'interstitial', placement: part(p.placement) }];
    case 'iap_offer_shown':
      return [{ kind: 'design', id: `Shop:Offer:${part(p.product)}` }];
    case 'iap_offer_purchased': {
      // Real money (a price in cents) is a business event; a gem purchase is a design event (its gems are a resource sink).
      const cents = Math.round(num(p.usd_cents));
      if (cents > 0) return [{ kind: 'business', currency: 'USD', cents, itemType: 'Iap', itemId: part(p.product), cart: 'Shop' }];
      return [{ kind: 'design', id: `Shop:Bought:${part(p.product)}`, value: num(p.amount) }];
    }
    case 'perf_sample':
      return [{ kind: 'design', id: `Perf:FPS:${part(p.quality)}`, value: num(p.fps) }];
    case 'setting_changed':
      return [{ kind: 'design', id: `Settings:${part(p.setting)}:${part(p.value)}` }];
    default:
      // Anything new still reaches the dashboard, as a design event under its own name.
      return [{ kind: 'design', id: `Other:${part(event)}` }];
  }
}
