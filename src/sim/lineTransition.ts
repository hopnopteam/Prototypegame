import type { LineTransitionDef, TransitionBeat } from '../config/lineTransition';
import type { SaveData } from '../save/SaveData';

/**
 * The Grand Departure's save safety, pure and unit-tested. The sequence has one save write, in the tunnel's dark:
 *
 * - Before it, the player is on the old route with nothing changed. Killing the app there relaunches on the old route,
 *   the line still open (the rail's button brings the offer back), and the sequence plays again from the offer.
 * - The write carries the player over (`carryOver`) and marks the arrival as waiting (`markArrival`). From then on a
 *   relaunch, whenever it comes, lands on the new line and plays (or skips) the arrival.
 * - The chest is paid with the save that marks it paid (`payChest`), and the postcard filed the same way
 *   (`filePostcard`): neither can happen twice, however often the arrival is replayed.
 * - The arrival ends with `finishArrival`, after which a relaunch is ordinary play.
 */

/** The id the finished train's postcard has in the album (`meta.postcards`). */
export const linePostcardId = (routeId: string): string => `line:${routeId}`;

/** Marks the arrival as waiting on `data` (the carried-over save, about to be written). Returns `data`. */
export function markArrival(data: SaveData, from: string, to: string): SaveData {
  data.lineArrival = { from, to, chestPaid: false, postcardFiled: false };
  return data;
}

/** What the boot should do with this save: an arrival to play on the line it was written for, or nothing. */
export function arrivalOnBoot(data: SaveData, activeRouteId: string): 'arrival' | 'none' {
  const a = data.lineArrival;
  if (!a) return 'none';
  return a.to === activeRouteId && data.route.id === activeRouteId ? 'arrival' : 'none';
}

/**
 * Pays the line-complete chest into the wallet once (true when it was paid now, false when it already had been). The
 * caller writes the save straight after, so the payment and the mark go to storage together.
 */
export function payChest(data: SaveData, chest: LineTransitionDef['chest']): boolean {
  const a = data.lineArrival;
  if (!a || a.chestPaid) return false;
  a.chestPaid = true;
  data.wallet.gems += Math.max(0, Math.floor(chest.gems));
  data.wallet.railMiles += Math.max(0, Math.floor(chest.railMiles));
  return true;
}

/** Files the finished train's postcard in the album once (true when filed now). */
export function filePostcard(data: SaveData): boolean {
  const a = data.lineArrival;
  if (!a || a.postcardFiled) return false;
  a.postcardFiled = true;
  const id = linePostcardId(a.from);
  if (!data.meta.postcards.includes(id)) data.meta.postcards.push(id);
  return true;
}

/**
 * Ends the arrival. Pays and files anything not yet done first (a skip lands in the same state as watching), then clears
 * the mark, so the next launch is ordinary play.
 */
export function finishArrival(data: SaveData, chest: LineTransitionDef['chest']): void {
  if (!data.lineArrival) return;
  payChest(data, chest);
  filePostcard(data);
  data.lineArrival = null;
}

/**
 * May the player skip at this beat? The first time, the hero shot, the offer and the lever always play (the hero shot is
 * the reward, the lever the choice); from the depot on, and anywhere on a replay or once it has been seen, they may.
 */
export function canSkip(beat: TransitionBeat, seenBefore: boolean, replay: boolean): boolean {
  if (seenBefore || replay) return beat !== 'offer';
  return beat !== 'hero' && beat !== 'frontPage' && beat !== 'offer' && beat !== 'lever';
}
