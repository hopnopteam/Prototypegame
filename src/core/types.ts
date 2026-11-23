export interface Vec2 {
  x: number;
  z: number;
}

/** Axis-aligned rectangle on the floor plane (x0 < x1, z0 < z1). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

export const rectContains = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export const offsetRect = (r: Rect, dz: number): Rect => ({ x0: r.x0, z0: r.z0 + dz, x1: r.x1, z1: r.z1 + dz });

export const rectCenter = (r: Rect): Vec2 => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

export type ItemKind =
  | 'tea' | 'coffee' | 'champagne' | 'blanket' | 'pillow' | 'towel' | 'roll' | 'luggage' | 'crate'
  // Session 20: what the venue carriages make (café, dining car, bar lounge).
  | 'latte' | 'pastry' | 'meal' | 'cocktail'
  // Session 21: the cinema's popcorn.
  | 'popcorn'
  // Session 22: the morning paper and the breakfast tray.
  | 'newspaper' | 'breakfast'
  // Fix list 4.6: a box of snacks for a room's minibar.
  | 'snack'
  // Session 38: a plate of sandwiches, food a guest can ask for (from the tea counter).
  | 'sandwich'
  // Phase 4, the Riviera: the smoothie bar's smoothies and ice creams, the diner's grilled seafood, the spa's robes, a
  // cold lemonade and a pot of aloe for the sunburnt (from the lobby's counter), and a surfer's board (two rack slots).
  | 'smoothie' | 'icecream' | 'seafood' | 'robe' | 'lemonade' | 'aloe' | 'surfboard';

export type CurrencyKind = 'cash' | 'gems' | 'railMiles';

export type StaffRole = 'attendant' | 'porter' | 'runner' | 'barista' | 'chef' | 'waiter' | 'bartender' | 'host' | 'projectionist'
  // Phase 4, the Riviera's new carriages: the Kids' Play Car, the Spa Car and the Pool Car.
  | 'entertainer' | 'masseur' | 'lifeguard';

export type CarriageType = 'lobby' | 'bathroom' | 'supply' | 'luggage' | 'sleeper' | 'familySleeper' | 'honeymoon' | VenueKind;

/** The venue carriages (session 20): each its own little game inside the train (Phase 4: the Riviera's three). */
export type VenueKind = 'cafe' | 'dining' | 'bar' | 'dome' | 'cinema' | 'kids' | 'spa' | 'pool';

export type JourneyPhase = 'onTheMove' | 'arriving' | 'stationStop' | 'departing';
