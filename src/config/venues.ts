import type { ItemKind, StaffRole, VenueKind } from '../core/types';
import { routeItem } from './routes';

/**
 * The venue carriages (session 20, owner: "restaurants, cafes, things that are going to be added over time in
 * the train that actually make sense… their own gameplay features, levels, mechanics"). Each is a little game
 * of its own, fed by the guests already aboard: a guest resting in their cabin now and then takes an outing to a
 * venue with a free seat, is served there, pays there and goes back to bed. More beds bring more visitors;
 * every venue makes each guest worth more.
 *
 * - Café: counter service. Guests queue at the counter; brew at the espresso machine, serve at the counter;
 *   they take their cup to a table. Fast, cheap, the first venue.
 * - Dining Car: table service (MPH's restaurant). Guests sit and order; cook at the range, serve the table;
 *   they eat, pay at the table and leave their plates; clear the table for the next diner.
 * - Bar Lounge: mix a cocktail at the bar for each stool and armchair. Every drink fills the party meter; when
 *   it is full it is Happy Hour: tips and fares on the whole train go up for a while.
 * - Observation Dome: show guests in at the rope, and they sit and watch. Each scenic view on the ride pays
 *   every seated guest's "wow"; a blanket keeps them cosy (and tipping).
 * - Cinema Car (session 21): guests take a seat and wait for the film. Start it at the projector when you like:
 *   every seat watching from the start pays its ticket when it ends, so a fuller house pays more (but nobody minds
 *   a short wait). Popcorn from the counter for anyone who asks.
 *
 * Venue tiles: more tables or seats, menu upgrades (dearer dishes), a second machine or the grand piano,
 * staff (each venue its own), their training, and three refits (Repaired, Cosy, Luxurious) that dress the
 * room and raise its prices. All the numbers below are tunable.
 */

export interface VenueProduct {
  item: ItemKind;
  /** Base price before the menu, the refit and the guest's purse. */
  price: number;
  /** Seconds standing at the station to make one. */
  makeSeconds: number;
  /** The unlock key (in this carriage) that adds it to the menu; none = on the menu from the start. */
  menu?: string;
}

export interface VenueDef {
  kind: VenueKind;
  /** Name on the chooser card and in the news. */
  name: string;
  /** How likely a guest picks this venue for an outing (relative to the other venues aboard). */
  visitWeight: number;
  /** Session 22: when in their night guests go (a coffee in the morning, a cocktail or a film in the evening). */
  when: ('evening' | 'morning')[];
  products: VenueProduct[];
  /** Seconds a guest eats, drinks or watches before paying and leaving. */
  consumeSeconds: number;
  /** The staff who work here: the first is hired first. */
  roles: StaffRole[];
  /** Price multiplier for refit tiers 0 (run-down) … 3 (luxurious). */
  tierPrice: number[];
  /** Phase 4: only families visit (the Kids' Play Car: a parent sits while the child plays). */
  families?: boolean;
}

export const VENUES: Record<VenueKind, VenueDef> = {
  cafe: {
    kind: 'cafe', name: 'Café Car', visitWeight: 1.3, when: ['evening', 'morning'],
    products: [
      // Phase 4: the route's own menu (the Riviera blends smoothies and scoops gelato here: `routeItem`).
      { item: routeItem('latte'), price: 5, makeSeconds: 1.4 },
      { item: routeItem('pastry'), price: 8, makeSeconds: 0.6, menu: 'menu_pastry' },
    ],
    // Session 36, the routine: guests linger over a coffee, a dinner, a cocktail (7, 8 and 7 s before), so the
    // venues look lived in and more tables pay.
    consumeSeconds: 14,
    roles: ['barista'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  dining: {
    kind: 'dining', name: 'Dining Car', visitWeight: 1.0, when: ['evening', 'morning'],
    products: [{ item: routeItem('meal'), price: 14, makeSeconds: 2.2 }],
    consumeSeconds: 16,
    roles: ['chef', 'waiter'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  bar: {
    // Session 53 (owner: "I don't see anybody using the bar lounge at all"): measured on a full train, it drew 18 visits
    // in ten minutes against the café's 46 (evening only, the lowest pull). It now opens mornings too (a morning drink in
    // the lounge) and pulls like the café.
    kind: 'bar', name: 'Bar Lounge', visitWeight: 1.3, when: ['evening', 'morning'],
    products: [{ item: 'cocktail', price: 11, makeSeconds: 1.8 }],
    consumeSeconds: 14,
    roles: ['bartender'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  dome: {
    kind: 'dome', name: 'Observation Dome', visitWeight: 0.9, when: ['evening', 'morning'],
    products: [],
    consumeSeconds: 0,
    roles: ['host'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  cinema: {
    kind: 'cinema', name: 'Cinema Car', visitWeight: 1.0, when: ['evening'],
    products: [{ item: 'popcorn', price: 6, makeSeconds: 1.0 }],
    consumeSeconds: 0,
    roles: ['projectionist'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  // Phase 4, the Riviera's own three. The Kids' Play Car: families only; the child plays while the parent sits, the
  // puppet show quietens the room and pays a ticket a child; gelato for anyone who asks.
  kids: {
    kind: 'kids', name: "Kids' Play Car", visitWeight: 1.6, when: ['evening', 'morning'],
    products: [{ item: 'icecream', price: 5, makeSeconds: 0.8 }],
    consumeSeconds: 0,
    roles: ['entertainer'],
    tierPrice: [1, 1.25, 1.6, 2.1],
    families: true,
  },
  // The Spa Car: a robe, a massage at the table (paid as it ends), a moment's rest; fresh towels before the next.
  spa: {
    kind: 'spa', name: 'Spa Car', visitWeight: 1.1, when: ['evening', 'morning'],
    products: [],
    consumeSeconds: 7,
    roles: ['masseur'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  // The Pool Car: a swim, out onto a lounger, a towel (paid as it is handed over).
  pool: {
    kind: 'pool', name: 'Pool Car', visitWeight: 1.4, when: ['morning', 'evening'],
    products: [],
    consumeSeconds: 12,
    roles: ['lifeguard'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
};

export const VENUE_KINDS: VenueKind[] = ['cafe', 'dining', 'bar', 'dome', 'cinema', 'kids', 'spa', 'pool'];

/**
 * What a venue charges for: an item it makes, a scenic view (dome), a film ticket (cinema), and (Phase 4) a puppet
 * show (the Kids' Play Car), a massage (the spa) and a swim (the pool, paid with the towel).
 */
export type VenueCharge = ItemKind | 'scenic' | 'ticket' | 'show' | 'massage' | 'swim';

/** Price multipliers from menu and station tiles (by unlock key), and what each applies to. */
export const VENUE_MENUS: Record<string, { price: number; items: VenueCharge[] }> = {
  menu_lobster: { price: 1.5, items: [routeItem('meal')] },
  // Phase 4: the Riviera's menus (sundaes in the play car, hot stones in the spa, cabanas by the pool).
  menu_sundaes: { price: 1.5, items: ['icecream'] },
  menu_puppets: { price: 1.4, items: ['show'] },
  menu_stones: { price: 1.5, items: ['massage'] },
  menu_cabanas: { price: 1.5, items: ['swim'] },
  menu_cocktails: { price: 1.5, items: ['cocktail'] },
  // Session 21, the cinema: premieres (a red carpet and spotlights), the candy cart, the speakers by the screen.
  menu_premiere: { price: 1.6, items: ['ticket'] },
  menu_snacks: { price: 1.5, items: ['popcorn'] },
  station_sound: { price: 1.3, items: ['ticket'] },
};

export const VENUE_TUNING = {
  /** How much a guest's purse adds to a venue price: (class tip multiplier − 1) × this, plus one. */
  classSpend: 0.4,
  /**
   * Session 27: a guest kept waiting this long at a venue (in its queue, at a table for their order, in the cinema
   * for a film) gives up and goes back to their room with a frown; it counts as a service they never got (a smaller
   * tip when they get off, `guests.unmetTipCut`). Nobody is ever held at a venue past their stop.
   */
  patience: 60,
  /** Café: most guests in the queue at once (the rest choose another venue or wait in bed). */
  cafeQueueMax: 4,
  /** A second espresso machine makes brewing this much quicker (multiplier on makeSeconds). */
  secondMachine: 0.55,
  /** Dining: seconds to clear a table of its plates. */
  clearSeconds: 0.9,
  /** Dining: plates the chef keeps waiting on the pass at most. */
  passMax: 3,
  /** Bar: drinks that fill the party meter, and Happy Hour's length and boost to tips and fares. */
  party: { goal: 6, seconds: 30, boost: 1.4, piano: 1.5, jukebox: 1.5 },
  /** Dome: seconds at the rope to show a guest in. */
  usherSeconds: 0.8,
  /**
   * Dome: scenic views come round this often while the train is moving; each pays every seated guest
   * `scenicTip` (×refit), and a guest stays for this many views before going back to bed.
   */
  scenicEverySeconds: 26,
  scenicTip: 6,
  viewsPerVisit: 2,
  /** Dome: chance a seated guest asks for a blanket after a view, and the tip for one. */
  blanketChance: 0.35,
  blanketTip: 5,
  /** Stars for each venue service (flat: class stars are for the rooms). */
  stars: 1,
  /**
   * Cinema: seconds standing at the projector to start a film, the film's length, each ticket (×menus, ×refit,
   * ×purse), the chance a watching guest asks for popcorn, and when the projectionist starts one by themselves (this
   * share of the open seats taken, or the first guest has waited this long).
   */
  cinema: { startSeconds: 1.2, filmSeconds: 22, ticket: 10, popcornChance: 0.5, autoShare: 0.6, autoWait: 14 },
  /**
   * Phase 4, the Kids' Play Car: seconds at the theatre to start a puppet show, its length, each child's ticket, the
   * chance a child wants gelato once it starts, and when the entertainer starts one by themselves. Noise: every child
   * waiting for a show adds `noisePerChild` a second (0–1); a show takes it down `quietPerSecond`. From `loud`, the
   * guests in the cabins next door hear it (a frown, and their tip × `nearbyTip`); it counts as calm again under `calm`.
   */
  kids: {
    startSeconds: 1.2, showSeconds: 18, ticket: 6, icecreamChance: 0.55, autoShare: 0.5, autoWait: 12,
    noisePerChild: 0.022, quietPerSecond: 0.2, loud: 0.7, calm: 0.35, nearbyTip: 0.85,
    /** How much more a family picks the play car over any other venue for an outing (the children ask for it). */
    familyPull: 3,
  },
  /** Phase 4, the Spa Car: seconds of massage at the table, its price, the robe's tip, and seconds to lay fresh towels. */
  spa: { massageSeconds: 3, massage: 14, robeTip: 3, towelSeconds: 0.9 },
  /**
   * Phase 4, the Pool Car: what a swim costs (paid with the towel), the leaves on the water (a share 0–1: `leafRate` a
   * second while the train is moving, `leafPerSwimmer` more for each swimmer), from `closedAt` nobody new swims,
   * from `warnAt` the skimmer's badge shows; seconds at the skimmer to clear it.
   */
  pool: { swim: 9, leafRate: 0.004, leafPerSwimmer: 0.0025, warnAt: 0.45, closedAt: 0.75, skimSeconds: 1.5 },
};
