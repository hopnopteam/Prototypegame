import { RENAMED_UNLOCKS } from '../config/content';
import { legacyCarriages, migrateLegacyId } from '../sim/unlockPlan';
import { migrateRoute } from '../sim/routeMigration';
import { capConductor } from '../sim/meta';
import { log } from '../core/log';
import { createDefaultSave, mergeDefaults, SAVE_VERSION, type SaveData } from './SaveData';
import type { SaveStorage } from './SaveStorage';

export type LoadOutcome = 'notLoaded' | 'newPlayer' | 'loaded' | 'restoredFromBackup' | 'resetAfterCorruption';

/** Upgrades a parsed save by exactly one version: from `from` to `from + 1`. */
export interface SaveMigration {
  from: number;
  apply(raw: Record<string, unknown>): void;
}

/** Register one step per SAVE_VERSION bump. Never delete old steps: players can skip many updates. */
export const SAVE_MIGRATIONS: SaveMigration[] = [
  {
    // v1 → v2: bedding upgrades became carriage refurbishments.
    from: 1,
    apply(raw) {
      const route = raw.route as { unlocked?: string[]; partial?: Record<string, number> } | undefined;
      if (!route) return;
      if (Array.isArray(route.unlocked)) route.unlocked = route.unlocked.map((id) => RENAMED_UNLOCKS[id] ?? id);
      if (route.partial) {
        for (const [from, to] of Object.entries(RENAMED_UNLOCKS)) {
          if (from in route.partial) {
            route.partial[to] = route.partial[from];
            delete route.partial[from];
          }
        }
      }
    },
  },
  {
    // v2 → v3: the player now chooses each carriage, so tile ids are relative to carriage slots and the
    // save records the chosen order (old saves grew in the old fixed order).
    from: 2,
    apply(raw) {
      const route = raw.route as { unlocked?: string[]; partial?: Record<string, number>; carriages?: string[] } | undefined;
      if (!route) return;
      const unlocked = Array.isArray(route.unlocked) ? route.unlocked.map(migrateLegacyId) : [];
      route.unlocked = unlocked;
      if (route.partial) {
        const partial: Record<string, number> = {};
        for (const [id, paid] of Object.entries(route.partial)) partial[migrateLegacyId(id)] = paid;
        route.partial = partial;
      }
      route.carriages = legacyCarriages(unlocked);
    },
  },
  {
    // v3 → v4 (session 22, the station start): a new game opens on the Millbrook platform beside a covered
    // train. Everyone who already plays has seen their opening: their first carriage is open (the new Open
    // carriage tile counts as bought) and the opening never plays again. Rooms they bought stay open and
    // uncovered; rooms still locked come covered (both follow from the unlocked list). Guests are not saved,
    // so there is no trip to move on: the train reloads empty, every bed made up.
    from: 3,
    apply(raw) {
      const route = raw.route as { unlocked?: string[] } | undefined;
      if (route) {
        const unlocked = Array.isArray(route.unlocked) ? route.unlocked : [];
        if (!unlocked.includes(OPENED_CARRIAGE)) unlocked.unshift(OPENED_CARRIAGE);
        route.unlocked = unlocked;
      }
      const profile = raw.profile as { flags?: Record<string, boolean> } | undefined;
      if (profile) profile.flags = { ...(profile.flags ?? {}), openingSeen: true };
    },
  },
  {
    // v4 → v5 (Phase 1, the Countryside Express): the train is rebuilt into the route's lineup (sim/routeMigration.ts):
    // a second Sleeper becomes the Family Sleeper, the Dome, Stores and Luggage cars leave (their cash refunded), the
    // rest is re-sorted with its tiles, part-payments and helpers. Gems, Rail Miles, level and stars are untouched.
    from: 4,
    apply(raw) {
      const route = raw.route as { carriages?: string[]; unlocked?: string[]; partial?: Record<string, number>; level?: number; migrationRefund?: number } | undefined;
      if (!route) return;
      const staff = (raw.staff as Record<string, { level: number }> | undefined) ?? {};
      const result = migrateRoute(
        { carriages: Array.isArray(route.carriages) && route.carriages.length ? route.carriages : ['lobby'], unlocked: Array.isArray(route.unlocked) ? route.unlocked : [], partial: route.partial ?? {} },
        staff,
        typeof route.level === 'number' ? route.level : 1,
      );
      route.carriages = result.carriages;
      route.unlocked = result.unlocked;
      route.partial = result.partial;
      raw.staff = result.staff;
      const wallet = (raw.wallet ?? (raw.wallet = {})) as { cash?: number };
      if (result.refund > 0) wallet.cash = (wallet.cash ?? 0) + result.refund;
      route.migrationRefund = result.refund;
      const profile = (raw.profile ?? (raw.profile = {})) as { gaSent?: Record<string, boolean> };
      profile.gaSent = { ...(profile.gaSent ?? {}), ...result.gaSent };
    },
  },
  {
    // v5 → v6 (Phase 2, stations become gameplay): the station upgrades already bought are kept as this route's platform
    // upgrades (they stand on every platform of the route now), and the Train Rating carries over from the recent stops
    // (each stop's quality becomes a review of 1 + 4 × quality stars) until real guest reviews replace it.
    from: 5,
    apply(raw) {
      const route = raw.route as { id?: string; unlocked?: string[]; recentStops?: number[]; reviews?: number[] } | undefined;
      const routeId = route?.id ?? 'countryside';
      const owned = (route?.unlocked ?? []).filter((id) => id.startsWith('st.')).map((id) => id.slice(3));
      const station = (raw.station ?? (raw.station = {})) as { owned?: Record<string, string[]> };
      station.owned = { ...(station.owned ?? {}), [routeId]: owned };
      if (route && !Array.isArray(route.reviews)) {
        route.reviews = (route.recentStops ?? []).map((q) => Math.round((1 + 4 * Math.max(0, Math.min(1, q))) * 2) / 2);
      }
    },
  },
  {
    // v6 → v7 (Phase 3, pacing and economy): conductor upgrades are three levels each now; anything bought above level 3
    // is refunded in Rail Miles at what it cost. Stories are gone: their stored progress is dropped.
    from: 6,
    apply(raw) {
      const conductor = raw.conductor as Record<string, number> | undefined;
      if (conductor) {
        const { levels, refund } = capConductor(conductor, OLD_CONDUCTOR_COSTS, 3);
        Object.assign(conductor, levels);
        const wallet = (raw.wallet ?? (raw.wallet = {})) as { railMiles?: number };
        wallet.railMiles = (wallet.railMiles ?? 0) + refund;
      }
      const meta = raw.meta as { stories?: unknown } | undefined;
      if (meta) delete meta.stories;
    },
  },
  {
    // v7 → v8 (Phase 4, more than one route): the route's own play time starts from the whole game's (every save so far
    // played only the Countryside Express); the archive of finished routes and the completed list start empty.
    from: 7,
    apply(raw) {
      const route = raw.route as { playSeconds?: number } | undefined;
      const profile = raw.profile as { lifetimePlaySeconds?: number } | undefined;
      if (route && typeof route.playSeconds !== 'number') route.playSeconds = profile?.lifetimePlaySeconds ?? 0;
      raw.routes ??= {};
      raw.completedRoutes ??= [];
    },
  },
];

/** What each conductor level cost before Phase 3 (5 levels a track), for the v6 → v7 refund. */
const OLD_CONDUCTOR_COSTS: Record<string, readonly number[]> = {
  speed: [2, 3, 5, 8, 12],
  capacity: [3, 5, 8, 12, 16],
  fareBonus: [3, 5, 8, 12, 16],
};

/** The opening's Open carriage tile (session 22): bought for every save from before the station start. */
const OPENED_CARRIAGE = 'c0.open';

export interface SaveSystemOptions {
  key: string;
  now: () => number;
  newId: () => string;
  migrations?: SaveMigration[];
  /** Batch writes: after markDirty(), wait at least this long before writing. */
  minSecondsBetweenWrites?: number;
  /** Safety write even when nothing was flagged, so play time survives a crash. */
  periodicSeconds?: number;
}

const CORRUPT_SUFFIX = '.corrupt';

/**
 * Loads, migrates and writes SaveData. Writes are batched after important changes, periodic as a safety
 * net, and immediate when the page is hidden (the last reliable moment on mobile).
 */
export class SaveSystem {
  data!: SaveData;
  outcome: LoadOutcome = 'notLoaded';
  /** Seconds between the previous visit's last save and this load. 0 for a new player. */
  secondsAwayOnLoad = 0;

  private dirty = false;
  private sinceWrite = 0;
  private readonly minBetween: number;
  private readonly periodic: number;
  private readonly migrations: SaveMigration[];

  constructor(private readonly storage: SaveStorage, private readonly options: SaveSystemOptions) {
    this.minBetween = options.minSecondsBetweenWrites ?? 1.5;
    this.periodic = options.periodicSeconds ?? 15;
    this.migrations = options.migrations ?? SAVE_MIGRATIONS;
  }

  load(): SaveData {
    const now = this.options.now();
    const candidates = this.storage.readCandidates(this.options.key);
    let loaded: SaveData | null = null;
    let index = -1;

    for (let i = 0; i < candidates.length; i++) {
      loaded = this.parse(candidates[i]);
      if (loaded) {
        index = i;
        break;
      }
    }

    if (loaded) {
      this.outcome = index === 0 ? 'loaded' : 'restoredFromBackup';
      if (index > 0) log.warn('Save', 'Main save unreadable; restored the backup copy.');
      this.secondsAwayOnLoad = Math.max(0, (now - loaded.lastActiveAt) / 1000);
      this.data = loaded;
    } else {
      if (candidates.length > 0) {
        // Keep the damaged text so a support request can still recover it.
        this.storage.write(this.options.key + CORRUPT_SUFFIX, candidates[0]);
        log.error('Save', 'Every save copy was unreadable. Starting fresh; the damaged copy was kept.');
        this.outcome = 'resetAfterCorruption';
      } else {
        this.outcome = 'newPlayer';
      }
      this.secondsAwayOnLoad = 0;
      this.data = createDefaultSave(now, this.options.newId());
    }

    this.saveNow();
    return this.data;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Called just before every write, for state kept outside the save data (the cash on the floor). */
  beforeWrite: (() => void) | null = null;

  saveNow(): boolean {
    if (!this.data) return false;
    this.beforeWrite?.();
    this.data.lastActiveAt = this.options.now();
    const ok = this.storage.write(this.options.key, JSON.stringify(this.data));
    if (ok) {
      this.dirty = false;
      this.sinceWrite = 0;
    }
    return ok;
  }

  update(dt: number): void {
    if (!this.data) return;
    this.sinceWrite += dt;
    if ((this.dirty && this.sinceWrite >= this.minBetween) || this.sinceWrite >= this.periodic) {
      this.saveNow();
    }
  }

  /** Wipes progress and starts over as a brand-new player (keeps settings). */
  reset(): void {
    const settings = this.data?.settings;
    this.data = createDefaultSave(this.options.now(), this.options.newId());
    if (settings) this.data.settings = { ...settings };
    this.outcome = 'newPlayer';
    this.secondsAwayOnLoad = 0;
    this.saveNow();
  }

  private parse(text: string): SaveData | null {
    if (!text || !text.trim()) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const version = typeof record.version === 'number' ? record.version : 0;
    if (version < 1) return null;

    if (version < SAVE_VERSION) {
      for (let v = version; v < SAVE_VERSION; v++) {
        const step = this.migrations.find((m) => m.from === v);
        if (!step) {
          log.error('Save', `Missing migration v${v} -> v${v + 1}; new fields keep their defaults.`);
          continue;
        }
        step.apply(record);
      }
      record.version = SAVE_VERSION;
    } else if (version > SAVE_VERSION) {
      log.warn('Save', `Save is from a newer build (v${version}); loading what this build understands.`);
    }

    const defaults = createDefaultSave(this.options.now(), this.options.newId());
    const merged = mergeDefaults(record, defaults);
    if (typeof merged.profile.installId !== 'string' || merged.profile.installId.length === 0) {
      merged.profile.installId = this.options.newId();
    }
    return merged;
  }
}
