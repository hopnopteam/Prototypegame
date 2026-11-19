import type { CarriageType } from '../core/types';

/**
 * Everything persisted for the player. Rules that keep old saves loading forever:
 * - Adding a field: give it a default in createDefaultSave(); loading deep-merges defaults, no version bump.
 * - Renaming, removing or changing the meaning of a field: bump SAVE_VERSION and add a migration.
 */
export const SAVE_VERSION = 7;

export interface QuestState {
  kind: string;
  label: string;
  target: number;
  progress: number;
  claimed: boolean;
  reward: { gems?: number; railMiles?: number };
}

export interface StoryState {
  step: number;
  done: boolean;
  aboard: boolean;
}

/** A story in the Rail Gazette, with what the train looked like that day (for its photo). */
export interface NewsItem {
  id: number;
  trigger: string;
  headline: string;
  body: string;
  level: number;
  carriages: number;
  livery: string;
  trim: string;
  /** Each carriage's paint that day (class liveries; older papers have none and use the train's livery). */
  paints?: { body: string; trim: string }[];
  /** Lifetime seconds when it was printed. */
  at: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  lastActiveAt: number;
  profile: {
    installId: string;
    sessionCount: number;
    lifetimePlaySeconds: number;
    /** FTUE beat → lifetime seconds when it happened. */
    ftue: Record<string, number>;
    /** Gameplay milestones that gate unlocks and offers. */
    flags: Record<string, boolean>;
    /**
     * Session 29: work the conductor has done by hand (rooms tidied, requests served, tickets sold, keys handed, bags
     * loaded, bells rung, venue orders served), for the help that must be earned first (`UnlockDef.work`).
     */
    handWork: Record<string, number>;
    /** Phase 3: the same work done by staff (it counts toward the next hire of a job a helper already does). */
    staffWork: Record<string, number>;
    /**
     * Phase 1: analytics milestones already sent (`train:N` carriages, `coupled:<type>`, `tier:<type>:<1-3>`,
     * `level:N`), so none is sent twice (an older train rebuilt by the v5 migration has them seeded).
     */
    gaSent: Record<string, boolean>;
  };
  settings: {
    sound: boolean;
    music: boolean;
    haptics: boolean;
    devTools: boolean;
    /** Graphics quality: a tier, or 'auto' (picked from the device, stepping down if the frame rate is low). */
    quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
    /** The tier auto settled on last time (null until it has had to step down). */
    qualityAuto: 'low' | 'medium' | 'high' | 'ultra' | null;
    /** The render scale dynamic resolution settled on, per tier (the next launch starts there). */
    renderScale: Partial<Record<'low' | 'medium' | 'high' | 'ultra', number>>;
    /**
     * Which quality policy `qualityAuto` and `renderScale` were learnt under (session 18 made the phone tiers
     * cheap per pixel instead of low in resolution, so what an older policy learnt no longer applies).
     */
    qualityPolicy: number;
    /**
     * Session 28: haptics start off on Android (every reward buzzed at the same instant as its sound, the one thing an
     * Android phone does at a reward that a browser test never does); 1 once that default has been applied, so a
     * player who turns Vibration back on keeps it.
     */
    hapticsPolicy: number;
    /** Session 29: the sound effects' volume, 0–1 (Settings' slider; the Sound switch is the mute). */
    sfxVolume: number;
  };
  wallet: {
    cash: number;
    gems: number;
    railMiles: number;
  };
  route: {
    id: string;
    stars: number;
    level: number;
    /** The carriages in the order the player chose them (index 0 is the lobby car). */
    carriages: CarriageType[];
    unlocked: string[];
    /** Money already paid into tiles that are not finished yet. */
    partial: Record<string, number>;
    stationIndex: number;
    legsCompleted: number;
    stopsCompleted: number;
    /** Perfect stops in a row (session 24): each one grows the station bonus; any other stop starts again. */
    perfectStreak: number;
    /** Fix list 4.2: the quality (0..1) of the most recent station stops, newest last (the old Train Rating). */
    recentStops: number[];
    /** Phase 2: the most recent guest reviews (1–5 stars), newest last: the Train Rating is their average. */
    reviews: number[];
    /**
     * Session 44: the cash lying on the floor (tips in rooms, fares at the stand, uncollected piles) as one sum, written
     * with every save, so a relaunch puts it back in the lobby's pile instead of losing it.
     */
    floorCash: number;
    /** Phase 1: cash handed back by the v5 migration (carriages that left the route), shown once on the next start. */
    migrationRefund: number;
  };
  staff: Record<string, { level: number }>;
  conductor: { speed: number; capacity: number; fareBonus: number };
  facilities: {
    supplyTowel: number;
    supplyRoll: number;
    bathrooms: { towel: number; roll: number }[];
  };
  monetization: {
    lastInterstitialAt: number | null;
    lastInterstitialStop: number | null;
    lastRewardedStop: number | null;
    interstitialsShown: number;
    rewardedCompleted: number;
    firstClassOffers: number;
    firstClassIgnored: number;
    lastFirstClassSession: number;
    speedBoostUntil: number;
    /** Session 36: the earned scooter runs until this much lifetime play (seconds); 0 when there is none. */
    scooterUntil: number;
    doubleFaresStop: number | null;
    lastCashStashAt: number | null;
    lastSpeedOfferAt: number | null;
  };
  meta: {
    postcards: string[];
    login: { lastClaimDay: string | null; day: number };
    quests: { day: string | null; items: QuestState[] };
    stories: Record<string, StoryState>;
    perks: { tipBonus: number; fareBonus: number; speedBonus: number };
    /** Session 30: when the Station Master's Chest is full again (ms since epoch; 0 is ready now). */
    chestReadyAt: number;
  };
  /** The objective chain (config/objectives.ts): which goal is current and how far along it is. */
  objectives: { index: number; progress: number };
  /** Paint Shop: the chosen livery (null follows reputation) and premium liveries bought with gems. */
  cosmetics: { livery: string | null; owned: string[]; outfit: string; outfits: string[] };
  /** The world noticing your train: its name, the Rail Gazette, interviews, awards. */
  press: {
    trainName: string | null;
    items: NewsItem[];
    nextId: number;
    unread: number;
    /** Trigger → times it has made the paper. */
    fired: Record<string, number>;
    interviews: number[];
    ceremonies: number[];
    awards: string[];
    /** Fix list 4.4: Golden Whistles won so far and the current run of stops at the next one's rating. */
    whistle: { won: number; streak: number };
    /** Moments waiting for a calm beat to be shown: 'name', 'interview:2', 'ceremony:5'. */
    pending: string[];
    stats: { guests: number; perfectStops: number; requests: number; streak: number; weekGuests: number; lastWeeklyStop: number; lastQueueStop: number };
    reputationSeen: number;
    /**
     * Rival Watch and the race (session 18): taunted (their card has run), humbled (their grumble has run),
     * prized (their spoils have been paid, once each); session 20: boost (reputation each rival gained from the
     * races they won), and your record in races (wins of races).
     */
    rivals: { taunted: number[]; humbled: number[]; prized: number[]; boost: number[]; wins: number; races: number };
    /**
     * Session 24, the rival's dare: the one running (null between editions: its config id, the rival's index, the
     * target, the count so far, the stop it ends with and that station's name) and your record.
     */
    dare: { id: string; rival: number; target: number; progress: number; endsAtStop: number; station: string } | null;
    dares: { won: number; lost: number; issued: number };
  };
  /** Phase 2, stations become gameplay. */
  station: StationSave;
}

/** Phase 2: the critic of a route (once per route): where they are, what they have seen, and the verdict. */
export interface CriticSave {
  /** 'aboard' riding and judging, 'reviewing' got off with the review still to print, 'done' printed. */
  status: 'aboard' | 'reviewing' | 'done';
  /** The stop they boarded at and the stop their review prints at (`route.stopsCompleted`). */
  boardStop: number;
  reviewStop: number;
  /** What they saw while aboard, as sums and counts (sampled every few seconds): tidy rooms, request speed, mood. */
  clean: [number, number];
  speed: [number, number];
  mood: [number, number];
  score: number;
  result: 'great' | 'mixed' | 'poor' | null;
}

export interface StationSave {
  /** Station upgrades owned, by route id (their keys); the unlock list carries them too ('st.<key>'). */
  owned: Record<string, string[]>;
  /** Ordinary stops since the last special one, the next one's gap, the last event's id, how many there have been. */
  sinceEvent: number;
  eventGap: number;
  lastEvent: string | null;
  eventsSeen: number;
  /**
   * Timed boosts still running: tips or fares × `mult`, or crowds × `mult`, until the stop `untilStop` (the count of
   * stops completed; -1 for the rest of the route). The Station Market's tips, the critic's verdict.
   */
  boosts: { id: string; kind: 'tips' | 'fares' | 'crowd'; mult: number; untilStop: number }[];
  /** The critic, by route id. */
  critic: Record<string, CriticSave>;
}

export function createDefaultSave(now: number, installId: string): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastActiveAt: now,
    profile: { installId, sessionCount: 0, lifetimePlaySeconds: 0, ftue: {}, flags: {}, handWork: {}, staffWork: {}, gaSent: {} },
    settings: { sound: true, music: true, haptics: true, devTools: false, quality: 'auto', qualityAuto: null, renderScale: {}, qualityPolicy: 0, hapticsPolicy: 0, sfxVolume: 0.8 },
    wallet: { cash: 0, gems: 0, railMiles: 0 },
    station: { owned: {}, sinceEvent: 0, eventGap: 0, lastEvent: null, eventsSeen: 0, boosts: [], critic: {} },
    route: { id: 'countryside', stars: 0, level: 1, carriages: ['lobby'], unlocked: [], partial: {}, stationIndex: 0, legsCompleted: 0, stopsCompleted: 0, perfectStreak: 0, recentStops: [], reviews: [], floorCash: 0, migrationRefund: 0 },
    staff: {},
    conductor: { speed: 0, capacity: 0, fareBonus: 0 },
    facilities: { supplyTowel: -1, supplyRoll: -1, bathrooms: [] },
    monetization: {
      lastInterstitialAt: null,
      lastInterstitialStop: null,
      lastRewardedStop: null,
      interstitialsShown: 0,
      rewardedCompleted: 0,
      firstClassOffers: 0,
      firstClassIgnored: 0,
      lastFirstClassSession: 0,
      speedBoostUntil: 0,
      scooterUntil: 0,
      doubleFaresStop: null,
      lastCashStashAt: null,
      lastSpeedOfferAt: null,
    },
    meta: {
      postcards: [],
      login: { lastClaimDay: null, day: 0 },
      quests: { day: null, items: [] },
      stories: {},
      perks: { tipBonus: 0, fareBonus: 0, speedBonus: 0 },
      chestReadyAt: 0,
    },
    objectives: { index: 0, progress: 0 },
    cosmetics: { livery: null, owned: [], outfit: 'classic', outfits: [] },
    press: {
      trainName: null,
      items: [],
      nextId: 1,
      unread: 0,
      fired: {},
      interviews: [],
      ceremonies: [],
      awards: [],
      whistle: { won: 0, streak: 0 },
      pending: [],
      stats: { guests: 0, perfectStops: 0, requests: 0, streak: 0, weekGuests: 0, lastWeeklyStop: 0, lastQueueStop: -99 },
      reputationSeen: 0,
      // boost: reputation each rival has gained from races they won (session 20); wins and races: your record.
      rivals: { taunted: [], humbled: [], prized: [], boost: [], wins: 0, races: 0 },
      dare: null,
      dares: { won: 0, lost: 0, issued: 0 },
    },
  };
}

/** Fills anything missing in `target` from `defaults`, recursively. Arrays and existing values win. */
export function mergeDefaults<T>(target: unknown, defaults: T): T {
  if (defaults === null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return (target === undefined ? defaults : target) as T;
  }
  const source = target !== null && typeof target === 'object' && !Array.isArray(target) ? (target as Record<string, unknown>) : {};
  const result: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
    result[key] = key in source ? mergeDefaults(source[key], value) : value;
  }
  return result as T;
}
