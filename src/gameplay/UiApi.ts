import type { ObjectiveDef } from '../config/objectives';
import type { IconName } from '../ui/icons';
import type { StationResult } from './events';

export type FloatKind = 'cash' | 'star' | 'gem' | 'miles' | 'info' | 'miss' | 'praise';

/** What gameplay asks of the UI. Implemented by the DOM layer; gameplay never touches the DOM itself. */
export interface UiApi {
  /** A number (or a word, rarely) rising from a spot in the world. */
  floatText(text: string, x: number, y: number, z: number, kind: FloatKind): void;
  /** An icon rising from a spot in the world (a check, a bolt, a crossed-out towel): feedback without words. */
  floatIcon(icon: IconName, x: number, y: number, z: number, kind: FloatKind, crossed?: boolean): void;
  /** Stars earned at a world position fly up into the route-level ring. */
  flyStars(amount: number, x: number, y: number, z: number): boolean;
  /** An objective was just completed: the banner celebrates and its reward flies to the counters. */
  objectiveDone(def: ObjectiveDef): void;
  toast(text: string, icon?: IconName): void;
  /** The station's name on arrival, in that station's own colours (session 43: name only). */
  stationBanner(title: string, stationId?: string): void;
  /** A station's postcard was collected: its stamp slides in beside the toasts (tap for the album). */
  postcardToast(stationId: string): void;
  showResult(result: StationResult): void;
  /** A passenger's reaction, as an icon in a speech bubble; 'bad' ones (grumbles) get a sterner bubble. */
  reaction(icon: IconName, x: number, y: number, z: number, tone?: 'good' | 'bad', crossed?: boolean): void;
  /** A cinematic caption (the intro): a small kicker line and one sentence; null hides it. */
  showCaption(caption: { kicker?: string; text: string } | null): void;
  /** A big centred card: a name and an icon (a subtitle only where it says something the icon cannot). */
  celebrate(title: string, subtitle: string | null, icon: IconName): void;
  /** A coupling is paid for: offer the carriages that may join (recommended first). */
  /** The player scooped cash: count it up over their head, then send it to the counter. */
  cashCollected(amount: number): void;
}
