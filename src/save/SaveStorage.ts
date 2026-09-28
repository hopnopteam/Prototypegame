import { log } from '../core/log';

/** Where save text lives. Implementations keep the previous write as a backup. */
export interface SaveStorage {
  /** The main copy first, then the backup. Empty when nothing was ever saved. */
  readCandidates(key: string): string[];
  write(key: string, contents: string): boolean;
  remove(key: string): void;
}

const BACKUP_SUFFIX = '.bak';

/**
 * Browser storage. localStorage can be missing or throw (private windows, blocked site data, embedded
 * previews), so every call is guarded and the game falls back to memory rather than breaking.
 */
export class BrowserSaveStorage implements SaveStorage {
  private readonly memory = new MemorySaveStorage();
  private available: boolean;

  constructor() {
    this.available = BrowserSaveStorage.probe();
    if (!this.available) log.warn('Save', 'Browser storage unavailable; progress will last for this visit only.');
  }

  get persistent(): boolean {
    return this.available;
  }

  readCandidates(key: string): string[] {
    if (!this.available) return this.memory.readCandidates(key);
    const out: string[] = [];
    try {
      const main = window.localStorage.getItem(key);
      const backup = window.localStorage.getItem(key + BACKUP_SUFFIX);
      if (main) out.push(main);
      if (backup) out.push(backup);
    } catch (error) {
      log.warn('Save', 'Reading browser storage failed', error);
      return this.memory.readCandidates(key);
    }
    return out;
  }

  write(key: string, contents: string): boolean {
    this.memory.write(key, contents);
    if (!this.available) return true;
    try {
      // Each setItem is atomic, so rotating main → backup first means one good copy always exists.
      const previous = window.localStorage.getItem(key);
      if (previous) window.localStorage.setItem(key + BACKUP_SUFFIX, previous);
      window.localStorage.setItem(key, contents);
      return true;
    } catch (error) {
      log.warn('Save', 'Writing browser storage failed (storage full or blocked)', error);
      return false;
    }
  }

  remove(key: string): void {
    this.memory.remove(key);
    if (!this.available) return;
    try {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(key + BACKUP_SUFFIX);
    } catch {
      // Nothing more we can do; the in-memory copy is already gone.
    }
  }

  private static probe(): boolean {
    try {
      const testKey = '__nx_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

export class MemorySaveStorage implements SaveStorage {
  private readonly copies = new Map<string, string[]>();
  writes = 0;

  readCandidates(key: string): string[] {
    return [...(this.copies.get(key) ?? [])];
  }

  write(key: string, contents: string): boolean {
    const list = this.copies.get(key) ?? [];
    list.unshift(contents);
    if (list.length > 2) list.length = 2;
    this.copies.set(key, list);
    this.writes++;
    return true;
  }

  remove(key: string): void {
    this.copies.delete(key);
  }

  /** Test helper: replace every stored copy (main first). */
  setCandidates(key: string, ...mainFirst: string[]): void {
    this.copies.set(key, [...mainFirst]);
  }
}
