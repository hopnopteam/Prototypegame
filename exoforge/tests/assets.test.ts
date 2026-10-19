import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'art/ASSET_MANIFEST.json'), 'utf8')) as {
  assets: { id: string; category: string; targetSizePx: number[]; worldSizeM?: number[]; cssSizePx?: number[]; pivot: number[]; status: string }[];
};

describe('asset manifest', () => {
  it('ids are unique', () => {
    const ids = manifest.assets.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every asset has a placeholder until real art arrives', () => {
    const missing = manifest.assets.filter((a) => !existsSync(join(root, 'art/placeholders', `${a.id}.png`))).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it('every asset says how big it is on screen and where its pivot is', () => {
    for (const a of manifest.assets) {
      expect(a.worldSizeM ?? a.cssSizePx, a.id).toBeDefined();
      expect(a.pivot.every((v) => v >= 0 && v <= 1), a.id).toBe(true);
      expect(a.targetSizePx.every((v) => v > 0), a.id).toBe(true);
    }
  });
});
