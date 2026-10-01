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
// The audit runs while the page loads (several minutes under SwiftShader), so don't wait for 'load' here.
await page.goto(`file://${resolve('dist/geoaudit.html')}`, { waitUntil: 'commit' });
await page.waitForFunction(() => document.body.dataset.done === '1' || window.__failed, null, { timeout: 900000 }).catch(() => undefined);
const results = await page.evaluate(() => window.geoAudit);
const clips = await page.evaluate(() => window.clipAudit);
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

// Object clipping: two objects (or an object and a wall) passing through each other.
const clipSeen = new Map();
for (const [scene, issues] of Object.entries(clips ?? {})) {
  for (const i of issues) {
    const key = `${i.carriage.split('@')[0]} ${i.a.replace(/#\d+/, '#n')} × ${i.b.replace(/#\d+/, '#n')}`;
    if (!clipSeen.has(key)) clipSeen.set(key, { ...i, scenes: new Set([scene]) });
    else clipSeen.get(key).scenes.add(scene);
  }
}
let clipShown = 0;
for (const [key, i] of clipSeen) {
  if (!verbose && clipShown++ >= 80) break;
  console.log(`CLIP ${key}  at (${i.at})  overlap (${i.overlap})  [${[...i.scenes].join(',')}]`);
}
console.log(clips ? `${clipSeen.size} object clipping(s).` : 'clip audit did not finish');
process.exit(results && seen.size === 0 && clips && clipSeen.size === 0 ? 0 : 1);
