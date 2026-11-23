import type { CarriageType } from '../src/core/types';
import { RIVIERA_COAST } from '../src/config/routes';
import { getLayout, layoutKey, setLayoutOptions, type CarriageLayout } from '../src/world/layout';

/** Every carriage type there is (Phase 4: the Riviera's Kids' Play Car, Spa Car, Pool Car and Honeymoon Suites too). */
export const ALL_TYPES: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper', 'familySleeper', 'cafe', 'dining', 'bar', 'dome', 'cinema', 'kids', 'spa', 'pool', 'honeymoon'];

export interface LayoutVariant { type: CarriageType; tier: number; name: string; layout: CarriageLayout }

/**
 * Every floor plan there is: one per class for a passenger carriage, one per refit for a venue, and (Phase 4) the
 * plans a route's layout knobs change (the Riviera's four cabanas, three showers and ten diner tables), built with
 * those knobs turned and named `riviera/<key>`.
 */
export function layoutVariants(): LayoutVariant[] {
  const out: LayoutVariant[] = [];
  const add = (prefix: string, types: CarriageType[]): void => {
    for (const type of types) {
      const seen = new Set<string>();
      for (let tier = 0; tier <= 5; tier++) {
        const key = layoutKey(type, tier);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type, tier, name: prefix + key, layout: getLayout(type, tier) });
      }
    }
  };
  add('', ALL_TYPES);
  setLayoutOptions(RIVIERA_COAST.layout ?? {});
  add('riviera/', ['lobby', 'bathroom', 'dining']);
  setLayoutOptions({});
  return out;
}
