import type { JourneyPhase } from '../core/types';

export interface AdRules {
  interstitialsEnabled: boolean;
  minLifetimeMinutes: number;
  minIntervalSeconds: number;
  noConsecutiveStationsUntilMinutes: number;
  rewardedMinLifetimeMinutes: number;
}

export interface AdContext {
  phase: JourneyPhase;
  lifetimeSeconds: number;
  /** Serial of the current (or just finished) station stop. */
  stopSerial: number;
  /** Player is mid-interaction (filling a zone, paying a tile, carrying items). */
  midTask: boolean;
  /** First Class Ticket owned: forced ads are off account-wide. */
  noForcedAds: boolean;
}

export interface AdHistory {
  lastInterstitialAt: number | null;
  lastInterstitialStop: number | null;
  lastRewardedStop: number | null;
}

export type InterstitialVerdict =
  | 'ok'
  | 'disabled'
  | 'purchasedNoAds'
  | 'wrongPhase'
  | 'tooEarlyInLifetime'
  | 'tooSoonSinceLast'
  | 'consecutiveStation'
  | 'midTask'
  | 'rewardedThisStop';

/**
 * Enforces every §12 interstitial rule in one place. The game asks; this answers with a reason, which also
 * goes to the dev panel so a designer can see exactly why an ad did or did not show.
 */
export class AdPolicy {
  constructor(private readonly rules: () => AdRules, readonly history: AdHistory) {}

  checkInterstitial(ctx: AdContext): InterstitialVerdict {
    const r = this.rules();
    if (!r.interstitialsEnabled) return 'disabled';
    if (ctx.noForcedAds) return 'purchasedNoAds';
    // The only place a forced ad may ever appear.
    if (ctx.phase !== 'departing') return 'wrongPhase';
    if (ctx.lifetimeSeconds < r.minLifetimeMinutes * 60) return 'tooEarlyInLifetime';
    const h = this.history;
    if (h.lastInterstitialAt !== null && ctx.lifetimeSeconds - h.lastInterstitialAt < r.minIntervalSeconds) return 'tooSoonSinceLast';
    if (
      ctx.lifetimeSeconds < r.noConsecutiveStationsUntilMinutes * 60 &&
      h.lastInterstitialStop !== null &&
      ctx.stopSerial - h.lastInterstitialStop <= 1
    ) {
      return 'consecutiveStation';
    }
    if (ctx.midTask) return 'midTask';
    if (h.lastRewardedStop === ctx.stopSerial) return 'rewardedThisStop';
    return 'ok';
  }

  recordInterstitial(lifetimeSeconds: number, stopSerial: number): void {
    this.history.lastInterstitialAt = lifetimeSeconds;
    this.history.lastInterstitialStop = stopSerial;
  }

  /** A rewarded ad watched at any point of a stop blocks that stop's interstitial. */
  recordRewarded(stopSerial: number): void {
    this.history.lastRewardedStop = stopSerial;
  }

  canOfferRewarded(lifetimeSeconds: number): boolean {
    return lifetimeSeconds >= this.rules().rewardedMinLifetimeMinutes * 60;
  }
}
