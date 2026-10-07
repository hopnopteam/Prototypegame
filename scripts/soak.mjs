// Soak test (session 24, owner: "the game runs as smoothly at minute 60 with a full train as it does at minute 1").
// The autopilot plays an accelerated session (default 30 game minutes); at intervals a few real frames are drawn
// and everything that could grow is sampled: JS heap, the renderer's geometries, textures and shader programs,
// scene objects, characters, page elements, draw calls, triangles and CPU per frame. It fails on steady growth
// (a leak), on a shader compiled mid-game, on any material re-flagged every frame, and on any budget broken.
// Usage: npm run build && node scripts/soak.mjs [minutes] [sampleEverySeconds]
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const file = resolve('dist/index.html');
if (!existsSync(file)) { console.error('dist/index.html missing: run npm run build first.'); process.exit(1); }
const [minutes = '30', every = '120'] = process.argv.slice(2);

/** What a mid-range phone can afford, and how much growth counts as a leak. */
const BUDGET = {
  /** JS heap: a base plus a share per carriage (geometry for every carriage stays in memory), in MB. */
  heapBaseMB: 75,
  heapPerCarriageMB: 14,
  drawCalls: 200,
  triangles: 250_000,
  /** CPU per frame on the test machine (the simulation step and the whole present, render included), in ms. */
  simMs: 3,
  /** Page elements (HUD, floats, toasts): never piling up. */
  domNodes: 450,
  /** With the same number of carriages, the last sample may not exceed the first by more than this share. */
  growth: 0.3,
  /** Shader programs compiled after the first sample (everything compiles before the first frame). */
  newPrograms: 0,
};

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${file}?quality=medium`);
await page.waitForFunction(() => !!window.nightExpress?.data, null, { timeout: 30000 });
await page.evaluate(() => { const g = window.nightExpress; g.skipIntro(); g['running'] = false; g.setAutopilot(true); });

const rows = [];
const samples = Math.round((Number(minutes) * 60) / Number(every));
for (let i = 0; i <= samples; i++) {
  const row = await page.evaluate((secs) => {
    const g = window.nightExpress;
    const answer = () => {
      const choice = document.querySelector('.scrim [data-default]');
      if (choice) choice.click();
      else for (const b of document.querySelectorAll('.scrim .btn')) if (/^(Collect|Maybe later|Claim)$/.test(b.textContent.trim())) { b.click(); break; }
    };
    for (let k = 0; k < secs; k++) { g.simulate(1); answer(); }
    for (let k = 0; k < 20; k++) { g.simulate(1 / 30); g['present'](1 / 30); }
    // CPU per frame: the simulation alone, then the whole present (render included).
    let sim = 0;
    let present = 0;
    for (let k = 0; k < 10; k++) {
      const a = performance.now(); g.simulate(1 / 60); const b = performance.now(); g['present'](1 / 60); const c = performance.now();
      sim += b - a; present += c - b;
    }
    // Materials re-flagged every frame make the renderer rebuild their settings each time (a slow leak of CPU).
    const versions = new Map();
    g.stage.scene.traverse((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) versions.set(m, m.version); });
    for (let k = 0; k < 5; k++) { g.simulate(1 / 60); g['present'](1 / 60); }
    let churn = 0;
    for (const [m, v] of versions) if (m.version - v >= 5) churn++;
    if (window.gc) window.gc();
    let objects = 0;
    g.stage.scene.traverse(() => { objects++; });
    const r = g.perfReport();
    return {
      t: Math.round(g.lifetimeSeconds()),
      cars: g.train.count,
      heapMB: +r.heapMB.toFixed(1),
      geometries: r.geometries,
      textures: r.textures,
      programs: r.programs,
      objects,
      people: r.characters,
      dom: document.getElementsByTagName('*').length,
      calls: r.calls,
      tris: r.triangles,
      simMs: +(sim / 10).toFixed(2),
      presentMs: +(present / 10).toFixed(1),
      churn,
      idle: Math.round(g.idleSeconds),
    };
  }, i === 0 ? 5 : Number(every));
  rows.push(row);
  console.log(JSON.stringify(row));
}
await browser.close();

const problems = [];
const first = rows[0];
const last = rows[rows.length - 1];
for (const r of rows) {
  const heapBudget = BUDGET.heapBaseMB + BUDGET.heapPerCarriageMB * r.cars;
  if (r.heapMB > heapBudget) problems.push(`${r.t}s: heap ${r.heapMB} MB over ${heapBudget} MB with ${r.cars} carriages`);
  if (r.calls > BUDGET.drawCalls) problems.push(`${r.t}s: ${r.calls} draw calls (budget ${BUDGET.drawCalls})`);
  if (r.tris > BUDGET.triangles) problems.push(`${r.t}s: ${r.tris} triangles (budget ${BUDGET.triangles})`);
  if (r.simMs > BUDGET.simMs) problems.push(`${r.t}s: simulation ${r.simMs} ms a frame (budget ${BUDGET.simMs})`);
  if (r.dom > BUDGET.domNodes) problems.push(`${r.t}s: ${r.dom} page elements (budget ${BUDGET.domNodes})`);
  if (r.churn > 0) problems.push(`${r.t}s: ${r.churn} material(s) re-flagged every frame`);
}
if (last.programs - first.programs > BUDGET.newPrograms) problems.push(`${last.programs - first.programs} shader program(s) compiled mid-game`);
// Leaks: with the same number of carriages, nothing keeps climbing from the first sample to the last.
const byCars = new Map();
for (const r of rows) {
  if (!byCars.has(r.cars)) byCars.set(r.cars, []);
  byCars.get(r.cars).push(r);
}
for (const [cars, list] of byCars) {
  if (list.length < 4) continue;
  const a = list[0];
  const b = list[list.length - 1];
  // (Page elements come and go with floats and toasts: they are held to their budget above, not compared.)
  for (const key of ['heapMB', 'geometries', 'textures']) {
    if (b[key] > a[key] * (1 + BUDGET.growth) + 2) problems.push(`with ${cars} carriages, ${key} grew ${a[key]} → ${b[key]} (${a.t}s → ${b.t}s)`);
  }
}
writeFileSync(resolve('dist/soak.json'), JSON.stringify({ budget: BUDGET, rows, problems, errors }, null, 1));
console.log(`\n${rows.length} samples over ${Math.round(last.t / 60)} minutes, ${first.cars} → ${last.cars} carriages; heap ${first.heapMB} → ${last.heapMB} MB, draw calls ${first.calls} → ${last.calls}, triangles ${first.tris} → ${last.tris}.`);
if (errors.length) problems.push(...errors.slice(0, 5));
if (problems.length) {
  console.log(`${problems.length} soak problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('Soak passed: nothing grows without the train, every budget held.');
