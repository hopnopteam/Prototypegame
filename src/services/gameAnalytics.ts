import { gameanalytics } from 'gameanalytics';
import { ANALYTICS } from '../config/analytics';
import { log } from '../core/log';
import type { AnalyticsParams, AnalyticsSink } from './analytics';
import { translate, type GaCall } from './gaMapping';

/**
 * The SDK methods used here. The package's type declarations leave the `GameAnalytics` class out of the exported
 * namespace (it is there at runtime, `gameanalytics.GameAnalytics`), so it is described by hand.
 */
interface GaApi {
  setEnabledInfoLog(flag: boolean): void;
  setEnabledVerboseLog(flag: boolean): void;
  configureBuild(build: string): void;
  configureUserId(id: string): void;
  configureAvailableResourceCurrencies(list: string[]): void;
  configureAvailableResourceItemTypes(list: string[]): void;
  configureAvailableCustomDimensions01(list: string[]): void;
  configureAvailableCustomDimensions02(list: string[]): void;
  configureAvailableCustomDimensions03(list: string[]): void;
  initialize(gameKey: string, secretKey: string): void;
  setCustomDimension01(value: string): void;
  setCustomDimension02(value: string): void;
  setCustomDimension03(value: string): void;
  addDesignEvent(id: string, value?: number): void;
  addProgressionEvent(status: number, p1: string, p2?: string, p3?: string, score?: number): void;
  addResourceEvent(flow: number, currency: string, amount: number, itemType: string, itemId: string): void;
  addBusinessEvent(currency: string, amount: number, itemType: string, itemId: string, cartType: string): void;
  addAdEvent(action: number, type: number, sdk: string, placement: string): void;
  addErrorEvent(severity: number, message: string): void;
  onStop(): void;
  onResume(): void;
}

const GA = (gameanalytics as unknown as { GameAnalytics: GaApi }).GameAnalytics;

/** Whether this page should send to GameAnalytics (keys set, not switched off, not an automated test browser). */
export function gameAnalyticsWanted(search: string, webdriver: boolean): boolean {
  if (!ANALYTICS.enabled || !ANALYTICS.gameKey || !ANALYTICS.secretKey) return false;
  const flag = new URLSearchParams(search).get('ga');
  if (flag === '0') return false;
  if (flag === '1') return true;
  return !(ANALYTICS.skipAutomation && webdriver);
}

export interface GaContext {
  userId: string;
  /** 'web', 'android' or 'ios', so builds and platforms can be told apart. */
  platform: string;
  verbose: boolean;
}

/**
 * GameAnalytics behind the game's analytics interface (session 31). Configured before `initialize` as the SDK
 * requires (build, user id, currencies, item types, dimensions); every logged event goes through `translate`; resource
 * events are summed per source or sink and sent every `resourceFlushSeconds` and whenever the app goes to the
 * background, so collecting a pile of bills is one event, not forty. The SDK opens a session on start, closes it on
 * `pause()` (the app in the background) and opens or resumes one on `resume()`; GameAnalytics derives retention,
 * session length and returning users from those sessions.
 */
export class GameAnalyticsService implements AnalyticsSink {
  private readonly pending = new Map<string, Extract<GaCall, { kind: 'resource' }>>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private errors = 0;
  private readonly errorSeen = new Set<string>();
  private dims = { level: '', train: '', quality: '' };

  constructor(ctx: GaContext) {
    GA.setEnabledInfoLog(ctx.verbose);
    GA.setEnabledVerboseLog(false);
    GA.configureBuild(`${ctx.platform} ${ANALYTICS.build}`.slice(0, 32));
    if (ctx.userId) GA.configureUserId(ctx.userId.slice(0, 64));
    GA.configureAvailableResourceCurrencies(Object.values(ANALYTICS.currencies));
    GA.configureAvailableResourceItemTypes(ANALYTICS.itemTypes);
    GA.configureAvailableCustomDimensions01(ANALYTICS.dimensions.level);
    GA.configureAvailableCustomDimensions02(ANALYTICS.dimensions.train);
    GA.configureAvailableCustomDimensions03(ANALYTICS.dimensions.quality);
    GA.initialize(ANALYTICS.gameKey, ANALYTICS.secretKey);
    this.flushTimer = setInterval(() => this.flush(), ANALYTICS.resourceFlushSeconds * 1000);
    log.info('Analytics', `GameAnalytics started (${ctx.platform} ${ANALYTICS.build})`);
  }

  log(event: string, params: AnalyticsParams): void {
    for (const call of translate(event, params)) this.send(call);
  }

  /** The player's route level (1–8), the train's carriages (1–9) and the graphics tier, carried by every event. */
  setDimensions(level: number, carriages: number, quality: string): void {
    const d = ANALYTICS.dimensions;
    const lv = d.level[Math.max(0, Math.min(d.level.length - 1, level - 1))];
    const tr = d.train[Math.max(0, Math.min(d.train.length - 1, carriages - 1))];
    const q = d.quality.includes(quality) ? quality : d.quality[0];
    if (lv !== this.dims.level) GA.setCustomDimension01(lv);
    if (tr !== this.dims.train) GA.setCustomDimension02(tr);
    if (q !== this.dims.quality) GA.setCustomDimension03(q);
    this.dims = { level: lv, train: tr, quality: q };
  }

  /** An uncaught error: sent once per message, at most `maxErrorsPerSession` a session. */
  error(message: string, critical: boolean): void {
    const text = message.slice(0, 8000);
    if (this.errors >= ANALYTICS.maxErrorsPerSession || this.errorSeen.has(text)) return;
    this.errors++;
    this.errorSeen.add(text);
    GA.addErrorEvent(critical ? gameanalytics.EGAErrorSeverity.Critical : gameanalytics.EGAErrorSeverity.Error, text);
  }

  /** The app went to the background: send what is waiting and close the session. */
  pause(): void {
    this.flush();
    GA.onStop();
  }

  /** Back in front: GameAnalytics resumes the session, or starts a new one after a long absence. */
  resume(): void {
    this.errors = 0;
    GA.onResume();
  }

  private send(call: GaCall): void {
    switch (call.kind) {
      case 'design':
        if (call.value === undefined) GA.addDesignEvent(call.id);
        else GA.addDesignEvent(call.id, call.value);
        return;
      case 'progression': {
        const status = call.status === 'start' ? gameanalytics.EGAProgressionStatus.Start : call.status === 'complete' ? gameanalytics.EGAProgressionStatus.Complete : gameanalytics.EGAProgressionStatus.Fail;
        if (call.score === undefined) GA.addProgressionEvent(status, call.p1, call.p2, call.p3);
        else GA.addProgressionEvent(status, call.p1, call.p2, call.p3, call.score);
        return;
      }
      case 'resource': {
        const key = `${call.flow}|${call.currency}|${call.itemType}|${call.itemId}`;
        const prev = this.pending.get(key);
        if (prev) prev.amount += call.amount;
        else this.pending.set(key, { ...call });
        return;
      }
      case 'ad': {
        const action = { show: gameanalytics.EGAAdAction.Show, clicked: gameanalytics.EGAAdAction.Clicked, failed: gameanalytics.EGAAdAction.FailedShow, reward: gameanalytics.EGAAdAction.RewardReceived }[call.action];
        const type = call.adType === 'rewarded' ? gameanalytics.EGAAdType.RewardedVideo : gameanalytics.EGAAdType.Interstitial;
        GA.addAdEvent(action, type, 'mock', call.placement);
        return;
      }
      case 'business':
        GA.addBusinessEvent(call.currency, call.cents, call.itemType, call.itemId, call.cart);
        return;
    }
  }

  /** Sends the summed resource events. */
  flush(): void {
    for (const r of this.pending.values()) {
      const flow = r.flow === 'source' ? gameanalytics.EGAResourceFlowType.Source : gameanalytics.EGAResourceFlowType.Sink;
      GA.addResourceEvent(flow, r.currency, Math.round(r.amount), r.itemType, r.itemId);
    }
    this.pending.clear();
  }

  dispose(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}
