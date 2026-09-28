import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSave, mergeDefaults, SAVE_VERSION } from '../src/save/SaveData';
import { MemorySaveStorage } from '../src/save/SaveStorage';
import { SAVE_MIGRATIONS, SaveSystem, type SaveMigration } from '../src/save/SaveSystem';

const KEY = 'test.save';

describe('SaveSystem', () => {
  let storage: MemorySaveStorage;
  let now: number;
  let ids: number;

  const create = (migrations: SaveMigration[] = []): SaveSystem =>
    new SaveSystem(storage, { key: KEY, now: () => now, newId: () => `id${++ids}`, migrations, minSecondsBetweenWrites: 2, periodicSeconds: 30 });

  beforeEach(() => {
    storage = new MemorySaveStorage();
    now = 1_000_000;
    ids = 0;
  });

  it('creates a new player and writes immediately', () => {
    const save = create();
    save.load();
    expect(save.outcome).toBe('newPlayer');
    expect(save.data.version).toBe(SAVE_VERSION);
    expect(save.data.profile.installId).toBe('id1');
    expect(storage.writes).toBe(1);
  });

  it('round-trips data and reports time away', () => {
    const first = create();
    first.load();
    first.data.wallet.cash = 123;
    first.saveNow();
    now += 3 * 3600 * 1000;
    const second = create();
    second.load();
    expect(second.outcome).toBe('loaded');
    expect(second.data.wallet.cash).toBe(123);
    expect(second.secondsAwayOnLoad).toBeCloseTo(3 * 3600);
  });

  it('never reports negative time away when the clock moved back', () => {
    const first = create();
    first.load();
    now -= 60_000;
    const second = create();
    second.load();
    expect(second.secondsAwayOnLoad).toBe(0);
  });

  it('restores the backup when the main copy is corrupt', () => {
    const first = create();
    first.load();
    first.data.wallet.gems = 9;
    first.saveNow();
    const good = storage.readCandidates(KEY)[0];
    storage.setCandidates(KEY, '{ not json', good);
    const second = create();
    second.load();
    expect(second.outcome).toBe('restoredFromBackup');
    expect(second.data.wallet.gems).toBe(9);
  });

  it('starts fresh and keeps the damaged copy when every copy is corrupt', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storage.setCandidates(KEY, '{ broken', 'also broken');
    const save = create();
    save.load();
    expect(save.outcome).toBe('resetAfterCorruption');
    expect(storage.readCandidates(`${KEY}.corrupt`)[0]).toBe('{ broken');
    spy.mockRestore();
  });

  it('fills fields missing from older saves with defaults', () => {
    storage.setCandidates(KEY, JSON.stringify({ version: 1, wallet: { cash: 50 }, profile: { installId: 'abc' } }));
    const save = create(SAVE_MIGRATIONS);
    save.load();
    expect(save.data.wallet.cash).toBe(50);
    expect(save.data.wallet.gems).toBe(0);
    expect(save.data.settings.sound).toBe(true);
    expect(save.data.profile.installId).toBe('abc');
  });

  it('migrates v1 bedding upgrades to carriage refurbishments', () => {
    storage.setCandidates(KEY, JSON.stringify({ version: 1, route: { unlocked: ['cabin_0_1', 'bedding_0', 'bedding2_0'], partial: { bedding_4: 30 } }, profile: { installId: 'abc' } }));
    const save = create(SAVE_MIGRATIONS);
    save.load();
    expect(save.data.version).toBe(SAVE_VERSION);
    expect(save.data.route.unlocked).toEqual(['c0.cabin_1', 'c0.refurb_1', 'c0.refurb_2']);
    expect(save.data.route.partial).toEqual({ 'c4.refurb_1': 30 });
    expect(save.data.route.carriages).toEqual(['lobby']);
  });

  it('treats a save without a version as unreadable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storage.setCandidates(KEY, JSON.stringify({ wallet: { cash: 5 } }));
    const save = create();
    save.load();
    expect(save.outcome).toBe('resetAfterCorruption');
    spy.mockRestore();
  });

  it('batches dirty writes and writes periodically', () => {
    const save = create();
    save.load();
    const afterLoad = storage.writes;
    save.markDirty();
    save.update(1);
    expect(storage.writes).toBe(afterLoad);
    save.update(1.5);
    expect(storage.writes).toBe(afterLoad + 1);
    save.update(29);
    expect(storage.writes).toBe(afterLoad + 1);
    save.update(1.5);
    expect(storage.writes).toBe(afterLoad + 2);
  });

  it('reset keeps settings but wipes progress', () => {
    const save = create();
    save.load();
    save.data.settings.music = false;
    save.data.wallet.cash = 999;
    save.reset();
    expect(save.data.wallet.cash).toBe(0);
    expect(save.data.settings.music).toBe(false);
  });
});

describe('mergeDefaults', () => {
  it('keeps existing values and arrays, fills the rest', () => {
    const defaults = createDefaultSave(0, 'x');
    const merged = mergeDefaults({ route: { unlocked: ['a'], stars: 4 } }, defaults);
    expect(merged.route.unlocked).toEqual(['a']);
    expect(merged.route.stars).toBe(4);
    expect(merged.route.level).toBe(1);
    expect(merged.meta.login.day).toBe(0);
  });
});
