import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('pure modules', () => {
  it('sim, econ and content import no rendering or browser code', () => {
    const root = join(__dirname, '../src');
    const bad: string[] = [];
    for (const dir of ['sim', 'econ', 'content']) {
      for (const file of files(join(root, dir))) {
        const text = readFileSync(file, 'utf8');
        if (/from ['"](pixi|\.\.\/render|\.\.\/ui|\.\.\/game|\.\.\/services)/.test(text) || /\b(document|window|localStorage)\./.test(text)) bad.push(file);
      }
    }
    expect(bad).toEqual([]);
  });
});
