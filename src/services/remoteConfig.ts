import { log } from '../core/log';

export type RemoteValue = number | boolean | string;

/**
 * Server-side overrides for tuning values, so live balance can change without an update. The in-game
 * value is always the fallback; remote config only overrides it.
 */
export interface RemoteConfig {
  fetch(): Promise<boolean>;
  has(key: string): boolean;
  number(key: string, fallback: number): number;
  bool(key: string, fallback: boolean): boolean;
  string(key: string, fallback: string): string;
  entries(): [string, RemoteValue][];
}

/** Offline stand-in: returns local overrides as if they were fetched from a server. */
export class LocalRemoteConfig implements RemoteConfig {
  private readonly values: Map<string, RemoteValue>;

  constructor(overrides: Record<string, RemoteValue> = {}) {
    this.values = new Map(Object.entries(overrides));
  }

  async fetch(): Promise<boolean> {
    return true;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  number(key: string, fallback: number): number {
    const value = this.values.get(key);
    if (value === undefined) return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) return n;
    log.warn('RemoteConfig', `"${key}" = "${String(value)}" is not a number; using the in-game default.`);
    return fallback;
  }

  bool(key: string, fallback: boolean): boolean {
    const value = this.values.get(key);
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    log.warn('RemoteConfig', `"${key}" = "${String(value)}" is not a boolean; using the in-game default.`);
    return fallback;
  }

  string(key: string, fallback: string): string {
    const value = this.values.get(key);
    return value === undefined ? fallback : String(value);
  }

  entries(): [string, RemoteValue][] {
    return [...this.values.entries()];
  }

  set(key: string, value: RemoteValue): void {
    this.values.set(key, value);
  }
}

/**
 * Applies overrides onto a config object by dotted path ("ads.minIntervalSeconds", "route.couplePrices.2"), only where
 * the key already exists with the same type, so a typo on the server can never inject garbage. Phase 3: array entries
 * are reachable by index, and "__" works as a separator too (for dashboards that do not take dots in keys).
 */
export function applyOverrides(target: Record<string, unknown>, remote: RemoteConfig): string[] {
  const applied: string[] = [];
  for (const [key] of remote.entries()) {
    const path = key.split('__').join('.');
    const parts = path.split('.');
    let node: Record<string, unknown> | unknown[] | undefined = target;
    for (let i = 0; i < parts.length - 1 && node; i++) {
      const next: unknown = (node as Record<string, unknown>)[parts[i]];
      node = next !== null && typeof next === 'object' ? (next as Record<string, unknown> | unknown[]) : undefined;
    }
    const leaf = parts[parts.length - 1];
    if (!node || !(leaf in node)) {
      log.warn('RemoteConfig', `Unknown key "${key}" ignored.`);
      continue;
    }
    const holder = node as Record<string, unknown>;
    const current = holder[leaf];
    if (typeof current === 'number') holder[leaf] = remote.number(key, current);
    else if (typeof current === 'boolean') holder[leaf] = remote.bool(key, current);
    else if (typeof current === 'string') holder[leaf] = remote.string(key, current);
    else {
      log.warn('RemoteConfig', `"${key}" is not a simple value; ignored.`);
      continue;
    }
    applied.push(path);
  }
  return applied;
}

/**
 * Phase 3: the values GameAnalytics Remote Configs sent last time, kept on the device so they apply in full at the next
 * launch (prices are built at start-up). Each key is a dotted path into the economy; a key named "economy" may hold a
 * JSON object of path → value instead.
 */
const REMOTE_CACHE_KEY = 'nightexpress.remoteConfig.v1';

export function flattenRemote(content: Record<string, unknown>): Record<string, RemoteValue> {
  const out: Record<string, RemoteValue> = {};
  for (const [key, value] of Object.entries(content)) {
    if (key === 'economy' && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) if (['number', 'boolean', 'string'].includes(typeof v)) out[k] = v as RemoteValue;
      } catch {
        log.warn('RemoteConfig', '"economy" is not valid JSON; ignored.');
      }
    } else if (['number', 'boolean', 'string'].includes(typeof value)) out[key] = value as RemoteValue;
  }
  return out;
}

export function readRemoteCache(): Record<string, RemoteValue> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(REMOTE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RemoteValue>) : {};
  } catch {
    return {};
  }
}

export function writeRemoteCache(values: Record<string, RemoteValue>): void {
  try {
    localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(values));
  } catch {
    // Private mode or storage off: the values still apply live this session.
  }
}
