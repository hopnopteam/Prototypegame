// The Grand Departure's performance, per quality tier: frame rate during the sequence (real frames), how long the
// reload through the tunnel takes (from the dark to the game up again), and the JS heap before, during and after.
// Runs the Debug preview on a full Route 1 train. In this environment the renderer is SwiftShader (software), so the
// frame rates are far below a phone's; the reload time and the memory are what carry over.
// Usage: node scripts/transition-perf.mjs [tiers=low,medium,high]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const tiers = (process.argv[2] ?? 'low,medium,high').split(',');
const PAGE = resolve(process.env.PAGE ?? 'dist/index.html');
const browser = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const rows = [];
for (const tier of tiers) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`file://${PAGE}?jump=8:3:s&quality=${tier}`);
  await page.waitForTimeout(400);
  await page.mouse.click(195, 760);
  await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  const heap = () => page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));
  const before = await heap();
  await page.evaluate(() => { window.nightExpress.setAutopilot(false); window.nightExpress.routeLine.preview(); });
  const fps = {};
  let during = 0;
  let darkAt = 0;
  for (let i = 0; i < 2400; i++) {
    await page.waitForTimeout(250);
    let st;
    try {
      st = await page.evaluate(() => {
        const g = window.nightExpress;
        const b = [...document.querySelectorAll('.scrim .btn.primary')].find((x) => /Open the/.test(x.textContent));
        if (b) b.click();
        const lt = g.lineTransition;
        if (lt.beatName === 'lever' && lt.beatSeconds > 2) lt.throwLever();
        return { beat: lt.beatName, fps: g.perfReport().fps, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576) };
      });
    } catch {
      break;
    }
    if (st.beat !== 'idle') (fps[st.beat] ??= []).push(st.fps);
    if (st.beat === 'depot') during = Math.max(during, st.heap);
    if (st.beat === 'dark' && !darkAt) darkAt = Date.now();
  }
  // The reload: from the dark to the game booted again.
  await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
  const reload = darkAt ? (Date.now() - darkAt) / 1000 : NaN;
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => {
      const g = window.nightExpress;
      const lt = g.lineTransition;
      const c = document.querySelector('.gd-collect');
      if (c && lt.beatName === 'chest') c.click();
      return { beat: lt.beatName, fps: g.perfReport().fps };
    });
    if (st.beat !== 'idle') (fps[st.beat] ??= []).push(st.fps);
    if (st.beat === 'postcard' || (st.beat === 'idle' && i > 8)) break;
  }
  await page.waitForTimeout(4000);
  const after = await heap();
  const avg = (a) => (a && a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
  rows.push({ tier, before, during, after, reload: reload.toFixed(1), fps: Object.fromEntries(Object.entries(fps).map(([k, v]) => [k, avg(v)])) });
  console.log(JSON.stringify(rows[rows.length - 1]));
  await context.close();
}
await browser.close();
