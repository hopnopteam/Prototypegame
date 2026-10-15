/**
 * GameAnalytics (session 31, owner: "connect GameAnalytics… track all the things in the game, retention and pretty much
 * everything… it's very crucial it's done right"). Everything the integration needs is here; the mapping from the
 * game's events to GameAnalytics events is `services/gaMapping.ts` (unit-tested), the SDK wrapper
 * `services/gameAnalytics.ts`.
 *
 * Keys: GameAnalytics → your game → Settings (the cog) → Game information → "Game key" (32 characters) and "Secret key"
 * (40). Paste them below, or set GA_GAME_KEY and GA_SECRET_KEY in the environment when building (the GitHub Actions APK
 * build reads them from the repository's secrets). Every shipped game carries its keys in the client: they identify the
 * game, they do not give access to the dashboard. With either key empty nothing is sent and the game runs as before.
 */
declare const __GA_GAME_KEY__: string;
declare const __GA_SECRET_KEY__: string;

/** Paste your keys here (or leave these empty and set GA_GAME_KEY / GA_SECRET_KEY when building). */
const GAME_KEY = '';
const SECRET_KEY = '';

const fromBuild = (value: string): string => (typeof value === 'string' ? value : '');

export const ANALYTICS = {
  /** Master switch: false sends nothing (the dev panel's event list still records). */
  enabled: true,
  gameKey: fromBuild(typeof __GA_GAME_KEY__ === 'undefined' ? '' : __GA_GAME_KEY__) || GAME_KEY,
  secretKey: fromBuild(typeof __GA_SECRET_KEY__ === 'undefined' ? '' : __GA_SECRET_KEY__) || SECRET_KEY,
  /** The build as GameAnalytics shows it (≤ 32 characters): bump with each release so cohorts can be split by build. */
  build: '0.31.0',
  /**
   * Automated browsers (the smoke run, the audits, the autopilot) never send: their sessions would pollute retention.
   * `?ga=1` in the address forces sending (to check events arrive), `?ga=0` stops it.
   */
  skipAutomation: true,
  /** Resource events are summed per source or sink and sent every this many seconds (and when the app goes away). */
  resourceFlushSeconds: 30,
  /** Performance sample (average frames per second over the window) every this many seconds of play. */
  perfSampleSeconds: 300,
  /** At most this many error events per session (a broken frame loop must not flood the dashboard). */
  maxErrorsPerSession: 10,
  /**
   * Resource currencies (letters only). Fares are the soft cash, Gems the hard currency, Rail Miles the permanent one.
   */
  currencies: { cash: 'Fares', gems: 'Gems', railMiles: 'RailMiles' } as Record<string, string>,
  /**
   * Resource item types (GameAnalytics allows 20, each up to 32 characters): where currency comes from and goes to.
   * The game's source and sink names are sorted into these by `services/gaMapping.ts`.
   */
  itemTypes: [
    'Tickets', 'Tips', 'Venues', 'Desk', 'StationBonus', 'Objective', 'LevelUp', 'Daily', 'Press', 'Offline',
    'Rush', 'Refund', 'Exchange', 'Iap', 'Ad', 'Debug', 'Unlock', 'Conductor', 'Cosmetic', 'Penalty',
  ],
  /**
   * Custom dimensions (each up to 20 values): every event carries the player's route level, the train's size and the
   * graphics tier, so any chart can be split by how far along a player is or how well their phone runs it.
   */
  dimensions: {
    level: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'],
    train: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'],
    quality: ['low', 'medium', 'high', 'ultra'],
  },
  /** The route's name in progression events (Route1 → Level02…, Route1Train → Carriage03…). */
  route: 'Route1',
};
