import { log } from '../core/log';

export type AdResult = 'completed' | 'skipped' | 'notAvailable' | 'failed';

/**
 * Raw ad playback. It only shows ads; it never decides when. Every "when" rule (Departing only, not before
 * minute 10, spacing, never mid-task) lives in AdPolicy, and gameplay must go through AdPolicy.
 */
export interface AdService {
  readonly isShowing: boolean;
  isRewardedReady(placement: string): boolean;
  isInterstitialReady(placement: string): boolean;
  showRewarded(placement: string): Promise<AdResult>;
  showInterstitial(placement: string): Promise<AdResult>;
}

/** Draws the fake ad. Implemented by the UI so the service stays free of DOM code. */
export interface MockAdPresenter {
  present(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<'completed' | 'skipped'>;
}

export class MockAdService implements AdService {
  simulateNoFill = false;
  private showing = false;

  constructor(
    private readonly presenter: MockAdPresenter,
    private readonly rewardedSeconds: number,
    private readonly interstitialSeconds: number,
  ) {}

  get isShowing(): boolean {
    return this.showing;
  }

  isRewardedReady(): boolean {
    return !this.showing && !this.simulateNoFill;
  }

  isInterstitialReady(): boolean {
    return !this.showing && !this.simulateNoFill;
  }

  showRewarded(placement: string): Promise<AdResult> {
    return this.show('rewarded', placement, this.rewardedSeconds);
  }

  showInterstitial(placement: string): Promise<AdResult> {
    return this.show('interstitial', placement, this.interstitialSeconds);
  }

  private async show(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<AdResult> {
    if (this.showing) {
      log.warn('Ads', `"${placement}" requested while another ad is showing.`);
      return 'failed';
    }
    if (this.simulateNoFill) return 'notAvailable';
    this.showing = true;
    try {
      const outcome = await this.presenter.present(kind, placement, seconds);
      return outcome;
    } catch (error) {
      log.error('Ads', `Mock ad "${placement}" failed`, error);
      return 'failed';
    } finally {
      this.showing = false;
    }
  }
}
