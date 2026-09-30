import type { ObjectiveDef } from '../config/objectives';
import type { CarriageType } from '../core/types';
import type { IconName } from '../ui/icons';
import type { StationResult } from './events';

export interface CarriageChoiceView {
  type: CarriageType;
  name: string;
  pitch: string;
  inside: string;
  /** Why it is recommended now, on the first card only. */
  reason: string | null;
}

export type FloatKind = 'cash' | 'star' | 'gem' | 'miles' | 'info' | 'miss';

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
  /** The station's name on arrival; an optional icon beside it (a new postcard). */
  stationBanner(title: string, extra?: IconName): void;
  showResult(result: StationResult): void;
  /** A passenger's reaction, as an icon in a speech bubble; 'bad' ones (grumbles) get a sterner bubble. */
  reaction(icon: IconName, x: number, y: number, z: number, tone?: 'good' | 'bad', crossed?: boolean): void;
  /** A cinematic caption (the intro): a small kicker line and one sentence; null hides it. */
  showCaption(caption: { kicker?: string; text: string } | null): void;
  /** A big centred card: a name and an icon (a subtitle only where it says something the icon cannot). */
  celebrate(title: string, subtitle: string | null, icon: IconName): void;
  /** A coupling is paid for: offer the carriages that may join (recommended first). */
  showCarriageChoice(choices: CarriageChoiceView[], onPick: (type: CarriageType) => void): void;
  /** The player scooped cash: count it up over their head, then send it to the counter. */
  cashCollected(amount: number): void;
}
