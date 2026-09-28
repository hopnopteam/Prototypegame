// Drives the built game in headless Chromium: taps the title card, then runs a script of actions and
// captures screenshots. Usage: node scripts/play.mjs <outdir> <scenario>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [outDir = 'shots', scenario = 'basic'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
await page.goto(`file://${resolve('dist/index.html')}`);
await page.waitForTimeout(800);
await page.mouse.click(195, 700);
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); };
const evalGame = (fn, arg) => page.evaluate(fn, arg);
const scenarios = {
  async debugInput() {
    await page.waitForTimeout(500);
    const before = await evalGame(() => { const g = window.nightExpress; return { t: g.time, paused: g.paused, enabled: g.input.enabled }; });
    console.log('before', JSON.stringify(before));
    await page.mouse.move(195, 600); await page.mouse.down();
    await page.mouse.move(150, 560, { steps: 5 });
    const mid = await evalGame(() => { const g = window.nightExpress; return { active: g.input.active, x: g.input.x, y: g.input.y, read: g.input.read(), pos: g.player.pos, t: g.time }; });
    console.log('mid', JSON.stringify(mid));
    await page.waitForTimeout(800);
    const mid2 = await evalGame(() => { const g = window.nightExpress; return { pos: g.player.pos, t: g.time, walkable: g.map.walk.isWalkable(g.player.pos.x, g.player.pos.z) }; });
    console.log('mid2', JSON.stringify(mid2));
    await page.mouse.up();
  },
  async basic() {
    await page.waitForTimeout(1500);
    await shot('01-start');
    // Walk to the desk with a drag on the joystick.
    await page.mouse.move(195, 600); await page.mouse.down(); await page.mouse.move(150, 560, { steps: 5 });
    await page.waitForTimeout(700); await page.mouse.up();
    await page.waitForTimeout(1500);
    await shot('02-desk');
  },
};
await scenarios[scenario]();
const state = await evalGame(() => { const g = window.nightExpress; return { cash: g.wallet.get('cash'), phase: g.journey.phase, guests: g.guests.list.map(x => x.state), player: g.player.pos, fps: g.stage.smoothedFps }; });
console.log(JSON.stringify(state));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
