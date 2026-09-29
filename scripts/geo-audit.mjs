// Geometry audit: builds dist/geoaudit.html and reports faces that share a plane and overlap (the cause of
// flicker). Exits non-zero on any finding. Usage: node scripts/geo-audit.mjs [--verbose]
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const playwright = require('/opt/node22/lib/node_modules/playwright');
execSync('node scripts/build.mjs', { env: { ...process.env, ENTRY: 'src/geoaudit.ts', OUT: 'geoaudit.html' }, stdio: 'inherit' });
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${resolve('dist/geoaudit.html')}`);
await page.waitForFunction(() => document.body.dataset.done === '1' || window.__failed, null, { timeout: 900000 }).catch(() => undefined);
const results = await page.evaluate(() => window.geoAudit);
if (process.env.AUDIT_JSON) (await import('node:fs')).writeFileSync(process.env.AUDIT_JSON, JSON.stringify(results));
await browser.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
let total = 0;
const seen = new Map();
for (const [scene, issues] of Object.entries(results ?? {})) {
  for (const i of issues) {
    total++;
    const key = `${i.a} × ${i.b}`;
    if (!seen.has(key)) seen.set(key, { ...i, scenes: [scene] });
    else seen.get(key).scenes.push(scene);
  }
}
const verbose = process.argv.includes('--verbose');
const filter = process.argv.find((a) => a.startsWith('--normal='))?.slice(9);
let shown = 0;
for (const i of seen.values()) {
  if (filter && i.normal.join(',') !== filter) continue;
  if (!verbose && shown++ >= 60) break;
  console.log(`${(i.area * 1e4).toFixed(0).padStart(6)} cm²  gap ${i.gap}  n(${i.normal})  at (${i.at})  [${i.scenes.join(',')}]\n    ${i.a}\n    ${i.b}`);
}
const byNormal = {};
for (const i of seen.values()) byNormal[i.normal.join(',')] = (byNormal[i.normal.join(',')] ?? 0) + 1;
console.log('by normal:', JSON.stringify(byNormal));
console.log(results ? `${seen.size} coplanar overlap(s) (${total} across scenes).` : 'audit did not finish');
process.exit(results && seen.size === 0 ? 0 : 1);
