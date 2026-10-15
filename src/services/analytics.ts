import { log } from '../core/log';

export type AnalyticsParams = Record<string, string | number | boolean>;

/**
 * Every event the publisher will ask for to judge retention and the first-session funnel.
 * snake_case, 40 characters max (the strictest SDK limit).
 */
export const EVENTS = {
  sessionStart: 'session_start',
  sessionEnd: 'session_end',
  ftueStep: 'ftue_step',
  unlockCompleted: 'unlock_completed',
  staffHired: 'staff_hired',
  carriageCoupled: 'carriage_coupled',
  stationResult: 'station_result',
  routeLevelUp: 'route_level_up',
  rewardedOfferShown: 'rewarded_offer_shown',
  rewardedOfferAccepted: 'rewarded_offer_accepted',
  rewardedOfferCompleted: 'rewarded_offer_completed',
  interstitialShown: 'interstitial_shown',
  iapOfferShown: 'iap_offer_shown',
  iapOfferPurchased: 'iap_offer_purchased',
  currencyEarned: 'currency_earned',
  currencySpent: 'currency_spent',
} as const;

export interface AnalyticsService {
  setUser(userId: string): void;
  log(event: string, params?: AnalyticsParams): void;
}

/**
 * Somewhere events go besides the dev panel's list (session 31: GameAnalytics, `services/gameAnalytics.ts`). The game
 * talks only to `MockAnalyticsService`, which validates each event and forwards it to every sink.
 */
export interface AnalyticsSink {
  log(event: string, params: AnalyticsParams): void;
  setDimensions(level: number, carriages: number, quality: string): void;
  error(message: string, critical: boolean): void;
  pause(): void;
  resume(): void;
}

export interface LoggedEvent {
  at: number;
  event: string;
  params: AnalyticsParams;
}

const VALID_NAME = /^[a-z0-9_]{1,40}$/;

/** Stand-in analytics: keeps recent events for the dev panel and rejects names real SDKs would refuse. */
export class MockAnalyticsService implements AnalyticsService {
  readonly history: LoggedEvent[] = [];
  total = 0;
  userId = '';
  /** Where valid events are forwarded (GameAnalytics when its keys are set). */
  readonly sinks: AnalyticsSink[] = [];
  /** Called before each event reaches the sinks (the game brings the dimensions up to date there). */
  beforeSend: (() => void) | null = null;

  constructor(private readonly historySize = 60, private readonly clock: () => number = () => Date.now()) {}

  setUser(userId: string): void {
    this.userId = userId;
  }

  log(event: string, params: AnalyticsParams = {}): void {
    if (!VALID_NAME.test(event)) {
      log.error('Analytics', `Invalid event name "${event}". Use snake_case, max 40 characters.`);
      return;
    }
    this.history.push({ at: this.clock(), event, params });
    if (this.history.length > this.historySize) this.history.shift();
    this.total++;
    log.info('Analytics', event, params);
    if (this.sinks.length > 0) this.beforeSend?.();
    for (const sink of this.sinks) {
      try {
        sink.log(event, params);
      } catch (e) {
        log.error('Analytics', `Sink failed on "${event}"`, e);
      }
    }
  }

  setDimensions(level: number, carriages: number, quality: string): void {
    for (const sink of this.sinks) sink.setDimensions(level, carriages, quality);
  }

  error(message: string, critical = false): void {
    for (const sink of this.sinks) sink.error(message, critical);
  }

  pause(): void {
    for (const sink of this.sinks) sink.pause();
  }

  resume(): void {
    for (const sink of this.sinks) sink.resume();
  }

  count(event: string): number {
    return this.history.filter((e) => e.event === event).length;
  }
}
