import type { ItemKind } from '../core/types';
import type { IconName } from '../ui/icons';
import { log } from '../core/log';

/**
 * Session 32 (owner: "the delivery icon shows coffee even when the passenger needs sheets"): the one table of what
 * each request and carried item looks like. A guest's bubble, the badge over the counter that hands it out and the
 * item in the player's hands all read their icon here, so "this goes to them" is instant. The Record type makes the
 * compiler insist every item has one; `iconFor` logs anything unknown instead of falling back to a coffee cup.
 */
export const ITEM_ICON: Record<ItemKind | 'turndown', IconName> = {
  tea: 'tea',
  coffee: 'coffee',
  champagne: 'champagne',
  blanket: 'blanket',
  pillow: 'pillow',
  towel: 'towel',
  roll: 'roll',
  luggage: 'luggage',
  crate: 'crate',
  latte: 'latte',
  pastry: 'pastry',
  meal: 'meal',
  cocktail: 'cocktail',
  popcorn: 'popcorn',
  newspaper: 'newspaper',
  breakfast: 'breakfast',
  snack: 'snack',
  turndown: 'turndown',
};

const warned = new Set<string>();

/** The icon for a request or item; a missing one is logged once (with dev tools) and shows a plain check. */
export function iconFor(kind: string): IconName {
  const icon = (ITEM_ICON as Record<string, IconName>)[kind];
  if (icon) return icon;
  if (!warned.has(kind)) {
    warned.add(kind);
    log.warn('Icons', `No icon for request "${kind}"`);
  }
  return 'check';
}
