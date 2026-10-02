import type { MockAdPresenter } from '../services/ads';
import type { MockStorePresenter } from '../services/iap';
import type { PressUi } from './Press';
import type { UiApi } from './UiApi';

export type DoubleChoice = 'none' | 'ad' | 'gems';

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
}
