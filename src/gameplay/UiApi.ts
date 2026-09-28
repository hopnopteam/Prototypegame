import type { IconName } from '../ui/icons';
import type { StationResult } from './events';

export type FloatKind = 'cash' | 'star' | 'gem' | 'miles' | 'info';

/** What gameplay asks of the UI. Implemented by the DOM layer; gameplay never touches the DOM itself. */
export interface UiApi {
  floatText(text: string, x: number, y: number, z: number, kind: FloatKind): void;
  toast(text: string, icon?: IconName): void;
  stationBanner(title: string, subtitle: string): void;
  showResult(result: StationResult): void;
  speechLine(text: string, x: number, y: number, z: number): void;
  celebrate(title: string, subtitle: string, icon: IconName): void;
  /** The player scooped cash: count it up over their head, then send it to the counter. */
  cashCollected(amount: number): void;
}
