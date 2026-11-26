import type { MockAdPresenter } from '../services/ads';
import type { MockStorePresenter } from '../services/iap';
import type { PressUi } from './Press';
import type { UiApi } from './UiApi';

export type DoubleChoice = 'none' | 'ad' | 'gems';

/** Phase 4: what the offer to open the next line shows (what goes along, what stays behind). */
export interface NextLineInfo {
  from: string;
  to: string;
  /** Upgrades on the finished route not bought (they stay behind). */
  unbought: number;
  conductor: { speed: number; capacity: number; fareBonus: number };
  gems: number;
  railMiles: number;
  /** The Grand Departure: the golden ticket's title and button (the route's transition). */
  ticket?: { title: string; button: string };
  /** A Debug-sheet preview (nothing is carried over). */
  preview?: boolean;
}

/** Everything the game needs from the UI layer: world feedback, presenters for mocks, and modals. */
export interface GameUi extends UiApi, MockAdPresenter, MockStorePresenter, PressUi {
  update(dt: number): void;
  showLevelUp(level: number, reward: { railMiles: number; cash: number }, gemCost: number, onCollect: (choice: DoubleChoice) => void): void;
  showOffline(amount: number, seconds: number, gemCost: number, onCollect: (choice: DoubleChoice) => void): void;
  showFirstClassOffer(discounted: boolean, price: string, onBuy: () => void, onClose: () => void): void;
  setHidden(hidden: boolean): void;
  /** A sheet is on screen (the game stays paused under it). */
  readonly sheetOpen: boolean;
  /** Closes the top sheet (Android's back button); false when there was nothing to close. */
  closeTopSheet(): boolean;
  /** Fix list 6.3: whether a point (normalised device coordinates of the canvas) is under a pop-up or label. */
  underPopupAt(ndcX: number, ndcY: number): boolean;
  /** Phase 4: the offer to open the next line (`onBoard` when the player chooses to go). */
  showNextLine(info: NextLineInfo, onBoard: () => void): void;
  /** Phase 4: the way into the tunnel (the screen goes dark), then `onDark`. */
  tunnelIn(routeName: string, onDark: () => void): void;
  /** The canvas the world is drawn in. */
  canvas: HTMLCanvasElement | null;
}
