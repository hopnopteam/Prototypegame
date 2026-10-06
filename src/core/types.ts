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
  // Session 22: the morning paper and breakfast tray, and the bedding: a fresh set (pillow and linen) and the
  // used set stripped off a bed.
  | 'newspaper' | 'breakfast' | 'bedding' | 'laundry';

export type CurrencyKind = 'cash' | 'gems' | 'railMiles';

export type StaffRole = 'attendant' | 'porter' | 'runner' | 'barista' | 'chef' | 'waiter' | 'bartender' | 'host' | 'projectionist';

export type CarriageType = 'lobby' | 'bathroom' | 'supply' | 'luggage' | 'sleeper' | VenueKind;

/** The venue carriages (session 20): each its own little game inside the train. */
export type VenueKind = 'cafe' | 'dining' | 'bar' | 'dome' | 'cinema';

export type JourneyPhase = 'onTheMove' | 'arriving' | 'stationStop' | 'departing';
