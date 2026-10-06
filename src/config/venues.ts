import type { ItemKind, StaffRole, VenueKind } from '../core/types';

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
  /** How likely a resting guest picks this venue for an outing (relative to the other venues aboard). */
  visitWeight: number;
  products: VenueProduct[];
  /** Seconds a guest eats, drinks or watches before paying and leaving. */
  consumeSeconds: number;
  /** The staff who work here: the first is hired first. */
  roles: StaffRole[];
  /** Price multiplier for refit tiers 0 (run-down) … 3 (luxurious). */
  tierPrice: number[];
}

export const VENUES: Record<VenueKind, VenueDef> = {
  cafe: {
    kind: 'cafe', name: 'Café Car', visitWeight: 1.3,
    products: [
      { item: 'latte', price: 5, makeSeconds: 1.4 },
      { item: 'pastry', price: 8, makeSeconds: 0.6, menu: 'menu_pastry' },
    ],
    consumeSeconds: 7,
    roles: ['barista'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  dining: {
    kind: 'dining', name: 'Dining Car', visitWeight: 1.0,
    products: [{ item: 'meal', price: 14, makeSeconds: 2.2 }],
    consumeSeconds: 8,
    roles: ['chef', 'waiter'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  bar: {
    kind: 'bar', name: 'Bar Lounge', visitWeight: 0.9,
    products: [{ item: 'cocktail', price: 11, makeSeconds: 1.8 }],
    consumeSeconds: 7,
    roles: ['bartender'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
  dome: {
    kind: 'dome', name: 'Observation Dome', visitWeight: 0.9,
    products: [],
    consumeSeconds: 0,
    roles: ['host'],
    tierPrice: [1, 1.25, 1.6, 2.1],
  },
};

export const VENUE_KINDS: VenueKind[] = ['cafe', 'dining', 'bar', 'dome'];

/** Price multipliers from menu tiles (by unlock key), and what else a tile changes. */
export const VENUE_MENUS: Record<string, { price?: number }> = {
  menu_beans: { price: 1.5 },
  menu_roast: { price: 1.6 },
  menu_lobster: { price: 1.5 },
  menu_cocktails: { price: 1.5 },
  menu_telescopes: { price: 1.6 },
};

export const VENUE_TUNING = {
  /**
   * Chance a resting guest's next wish is an outing to a venue (when one has room), instead of a request
   * in their cabin or a washroom visit.
   */
  outingChance: 0.42,
  /** How much a guest's purse adds to a venue price: (class tip multiplier − 1) × this, plus one. */
  classSpend: 0.4,
  /** Café: most guests in the queue at once (the rest choose another venue or wait in bed). */
  cafeQueueMax: 4,
  /** A second espresso machine makes brewing this much quicker (multiplier on makeSeconds). */
  secondMachine: 0.55,
  /** Dining: seconds to clear a table of its plates. */
  clearSeconds: 0.9,
  /** Dining: plates the chef keeps waiting on the pass at most. */
  passMax: 3,
  /** Bar: drinks that fill the party meter, and Happy Hour's length and boost to tips and fares. */
  party: { goal: 6, seconds: 30, boost: 1.4, piano: 1.5 },
  /** Dome: seconds at the rope to show a guest in. */
  usherSeconds: 0.8,
  /**
   * Dome: scenic views come round this often while the train is moving; each pays every seated guest
   * `scenicTip` (×telescopes, ×refit), and a guest stays for this many views before going back to bed.
   */
  scenicEverySeconds: 26,
  scenicTip: 6,
  viewsPerVisit: 2,
  /** Dome: chance a seated guest asks for a blanket after a view, and the tip for one. */
  blanketChance: 0.35,
  blanketTip: 5,
  /** Stars for each venue service (flat: class stars are for the rooms). */
  stars: 1,
};
