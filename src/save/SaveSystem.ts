import { RENAMED_UNLOCKS } from '../config/content';
import { legacyCarriages, migrateLegacyId } from '../sim/unlockPlan';
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
];

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

  saveNow(): boolean {
    if (!this.data) return false;
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
