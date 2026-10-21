/**
 * God mode for recording launch videos (owner: "a god mode build where I can have unlimited money so I can progress
 * quickly"). On in a build made with GOD_MODE=1 (the "God mode" APK, `android-god-N` releases) or with `?god=1` in the
 * address. It keeps the wallet full, counts every helper's hand work as done, plays on its own save (normal progress
 * is never touched) and sends nothing to GameAnalytics. Everything else plays as normal, so the footage is real play.
 */
import type { WorkMetric } from './content';

declare const __GOD_MODE__: boolean;

const fromUrl = typeof location !== 'undefined' && new URLSearchParams(location.search).get('god') === '1';

export const GOD_MODE: boolean = (typeof __GOD_MODE__ !== 'undefined' && __GOD_MODE__ === true) || fromUrl;

export const GOD = {
  /** The wallet is filled back up to this once it falls below half of it (rarely, so the counter stays calm on video). */
  cash: 999_999,
  /** Stars count this many times over, so route levels (and the classes they open) come quickly too. */
  starMultiplier: 4,
  /** Gems and Rail Miles kept at least this high (conductor upgrades, liveries). */
  gems: 9_999,
  railMiles: 9_999,
  /** Its own save, so a recording session never overwrites normal play (web; the APK also has its own app id). */
  saveSuffix: '.god',
};

/** Hand work counted as done in god mode: every helper can be hired as soon as their tile shows. */
export const GOD_WORK: Partial<Record<WorkMetric, number>> = {
  rooms: 9_999, requests: 9_999, tickets: 9_999, keys: 9_999, bags: 9_999, bells: 9_999,
  cafe: 9_999, dining: 9_999, bar: 9_999, dome: 9_999, cinema: 9_999,
};
