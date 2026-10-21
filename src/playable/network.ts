// The ad network glue. Which network, and the store links, are set in one block at the very top of the built HTML
// file (window.NX_AD); this module only reads them.
interface AdConfig {
  /** 'unity' | 'applovin' | 'meta' | 'google' */
  network: string;
  iosUrl: string;
  androidUrl: string;
}
interface Mraid {
  getState(): string;
  isViewable(): boolean;
  open(url: string): void;
  addEventListener(event: string, fn: (...args: unknown[]) => void): void;
}
type AdWindow = Window & {
  NX_AD?: Partial<AdConfig>;
  mraid?: Mraid;
  FbPlayableAd?: { onCTAClick(): void };
  ExitApi?: { exit(): void };
};
const w = window as AdWindow;

const config = (): AdConfig => ({
  network: (w.NX_AD?.network ?? 'unity').toLowerCase(),
  iosUrl: w.NX_AD?.iosUrl ?? '',
  androidUrl: w.NX_AD?.androidUrl ?? '',
});

const isIOS = (): boolean => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** The store link for this device. */
function storeUrl(): string {
  const c = config();
  return (isIOS() ? c.iosUrl : c.androidUrl) || c.androidUrl || c.iosUrl;
}

/** The Play Now button: each network's own call (falls back to opening the link when tested outside the network). */
export function openStore(): void {
  const c = config();
  const url = storeUrl();
  try {
    switch (c.network) {
      case 'unity':
      case 'applovin':
        // Unity Ads and AppLovin both run playables in an MRAID container: mraid.open(storeUrl).
        if (w.mraid) {
          w.mraid.open(url);
          return;
        }
        break;
      case 'meta':
        // Meta (Facebook / Instagram / Audience Network): the store is set in the campaign; the ad only signals the click.
        if (w.FbPlayableAd) {
          w.FbPlayableAd.onCTAClick();
          return;
        }
        break;
      case 'google':
        // Google Ads (HTML5 / App campaigns): the exit is set in the campaign; exitapi.js provides ExitApi.
        if (w.ExitApi) {
          w.ExitApi.exit();
          return;
        }
        break;
    }
  } catch {
    // Fall through to the plain link.
  }
  window.open(url, '_blank');
}

/** Resolves when the ad may start: at once outside MRAID; inside it, once MRAID is ready and the ad is on screen. */
export function adReady(): Promise<void> {
  const mraid = w.mraid;
  if (!mraid) return Promise.resolve();
  return new Promise((resolve) => {
    const whenViewable = (): void => {
      if (mraid.isViewable()) resolve();
      else mraid.addEventListener('viewableChange', (viewable) => viewable && resolve());
    };
    if (mraid.getState() === 'loading') mraid.addEventListener('ready', whenViewable);
    else whenViewable();
  });
}

/** Pauses the ad (and its sound) while the container or the page is hidden. */
export function onViewable(fn: (visible: boolean) => void): void {
  w.mraid?.addEventListener('viewableChange', (viewable) => fn(!!viewable));
  document.addEventListener('visibilitychange', () => fn(!document.hidden));
}
