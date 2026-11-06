import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { log } from '../core/log';
import type { AdResult, AdService } from './ads';

/**
 * AppLovin MAX through the app's own native plugin (android/…/MaxAdsPlugin.java, session 46). Interstitials only:
 * rewarded ads are off (owner's choice), so they are never ready. Readiness arrives as an event from the plugin,
 * because the game asks it synchronously (AdPolicy has already decided that now is an allowed moment).
 * Ad revenue goes to Adjust on the native side, the moment MAX reports it.
 */
interface MaxAdsNative {
  status(): Promise<{ configured: boolean; initialized: boolean; ready: boolean }>;
  showInterstitial(options: { placement: string }): Promise<{ result: 'completed' | 'failed' | 'notAvailable' }>;
  addListener(event: 'interstitialReady', handler: (data: { ready: boolean }) => void): Promise<PluginListenerHandle>;
}

const MaxAds = registerPlugin<MaxAdsNative>('MaxAds');

/** True in the Android app, where the plugin is built in; the web build and iOS keep the mock. */
export function maxAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MaxAds');
}

export class MaxAdService implements AdService {
  /** Real ads: the forced-ad switch may show them (see Monetization.forcedAds). */
  readonly real = true;
  private ready = false;
  private showing = false;

  constructor() {
    void MaxAds.addListener('interstitialReady', ({ ready }) => {
      this.ready = ready;
    });
    void MaxAds.status()
      .then((s) => {
        this.ready = this.ready || s.ready;
        log.info('Ads', `MAX ${s.configured ? (s.initialized ? 'initialised' : 'starting') : 'not configured (no ad unit)'}`);
      })
      .catch((error: unknown) => log.warn('Ads', 'MAX status failed', error));
  }

  get isShowing(): boolean {
    return this.showing;
  }

  isRewardedReady(): boolean {
    return false;
  }

  isInterstitialReady(): boolean {
    return this.ready && !this.showing;
  }

  showRewarded(): Promise<AdResult> {
    return Promise.resolve('notAvailable');
  }

  async showInterstitial(placement: string): Promise<AdResult> {
    if (this.showing) return 'failed';
    this.showing = true;
    this.ready = false;
    try {
      const { result } = await MaxAds.showInterstitial({ placement });
      return result;
    } catch (error) {
      log.warn('Ads', `MAX interstitial "${placement}" failed`, error);
      return 'failed';
    } finally {
      this.showing = false;
    }
  }
}
