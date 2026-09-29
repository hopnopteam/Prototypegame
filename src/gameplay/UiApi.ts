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

export type FloatKind = 'cash' | 'star' | 'gem' | 'miles' | 'info';

/** What gameplay asks of the UI. Implemented by the DOM layer; gameplay never touches the DOM itself. */
export interface UiApi {
  floatText(text: string, x: number, y: number, z: number, kind: FloatKind): void;
  /** Stars earned at a world position fly up into the route-level ring. */
  flyStars(amount: number, x: number, y: number, z: number): boolean;
  toast(text: string, icon?: IconName): void;
  stationBanner(title: string, subtitle: string): void;
  showResult(result: StationResult): void;
  speechLine(text: string, x: number, y: number, z: number): void;
  celebrate(title: string, subtitle: string, icon: IconName): void;
  /** A coupling is paid for: offer the carriages that may join (recommended first). */
  showCarriageChoice(choices: CarriageChoiceView[], onPick: (type: CarriageType) => void): void;
  /** The player scooped cash: count it up over their head, then send it to the counter. */
  cashCollected(amount: number): void;
}
