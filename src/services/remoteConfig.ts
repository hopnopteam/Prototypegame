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
 * Applies overrides onto a config object by dotted path ("ads.minIntervalSeconds"), only where the key
 * already exists with the same type, so a typo on the server can never inject garbage.
 */
export function applyOverrides(target: Record<string, unknown>, remote: RemoteConfig): string[] {
  const applied: string[] = [];
  for (const [path] of remote.entries()) {
    const parts = path.split('.');
    let node: Record<string, unknown> | undefined = target;
    for (let i = 0; i < parts.length - 1 && node; i++) {
      const next: unknown = node[parts[i]];
      node = next !== null && typeof next === 'object' && !Array.isArray(next) ? (next as Record<string, unknown>) : undefined;
    }
    const leaf = parts[parts.length - 1];
    if (!node || !(leaf in node)) {
      log.warn('RemoteConfig', `Unknown key "${path}" ignored.`);
      continue;
    }
    const current = node[leaf];
    if (typeof current === 'number') node[leaf] = remote.number(path, current);
    else if (typeof current === 'boolean') node[leaf] = remote.bool(path, current);
    else if (typeof current === 'string') node[leaf] = remote.string(path, current);
    else {
      log.warn('RemoteConfig', `"${path}" is not a simple value; ignored.`);
      continue;
    }
    applied.push(path);
  }
  return applied;
}
