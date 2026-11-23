import { DEBUG_JUMP } from './debugJump';
import { GOD, GOD_MODE } from './god';

/**
 * Phase 4, debug: `?route=<id>` plays that route on a save of its own (a fresh one starts as if the route before it had
 * just been completed; `Game` seeds it), so a route can be tested and paced without playing the ones before it.
 */
export const ROUTE_PARAM: string | null = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('route');

/** Where the save lives (localStorage, mirrored into the app's own storage on iOS and Android). */
export const SAVE_KEY = 'nightexpress.save' + (GOD_MODE ? GOD.saveSuffix : '') + (DEBUG_JUMP ? '.jump' : '') + (ROUTE_PARAM ? `.route-${ROUTE_PARAM}` : '');

/**
 * Phase 4: the route the save is on, read before anything else loads (the route decides the carriages, the stations,
 * the prices and the scenery, which the config modules build as they load). Null with no save. The save stays the
 * truth: if this ever disagrees with it (a save restored from the app's own storage after the web view lost it),
 * `Game` writes it and reloads.
 */
export function savedRouteId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const id = (JSON.parse(raw) as { route?: { id?: unknown } }).route?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}
