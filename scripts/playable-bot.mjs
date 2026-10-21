// Plays the playable ad headless like a person and reports when each upgrade lands. It taps to walk to the next job
// (the ad's own tap-to-walk), and pauses a moment after each one (`PAUSE` game seconds) the way a player looks
// around before moving on. Usage: node scripts/playable-bot.mjs [ts] [maxGameSeconds] [shotDir]
//   ts: game speed in the headless browser (?ts=), PAUSE env: seconds between taps (default 1.1).
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const [ts = '3', maxS = '720', shots = ''] = process.argv.slice(2);
const W = Number(process.env.W ?? 300), H = Number(process.env.H ?? 650);
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${resolve(process.env.PAGE ?? 'playable/night-express-playable.html')}?ts=${ts}`);
await page.waitForFunction(() => document.documentElement.classList.contains('nx-ready'), null, { timeout: 120000 });
// The player, in the page: every PAUSE seconds of game time, a tap (walk to the next job).
await page.evaluate(([w, h, pause]) => {
  let last = -99;
  const loop = () => {
    const s = window.nxAd.state;
    if (s.clock - last >= pause) { last = s.clock; window.nxAd.tap(w / 2, h * 0.7); }
    if (!s.ended) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, [W, H, Number(process.env.PAUSE ?? 1.1)]);
const mm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let last = {};
const log = [];
let shotN = 1;
let boughtAt = 0;
let stallShown = false;
for (;;) {
  await page.waitForTimeout(700);
  const s = await page.evaluate(() => window.nxAd.state);
  const t = s.clockExact ?? s.clock;
  const n0 = log.length;
  if (s.phase !== last.phase) log.push(`${mm(t)}  phase: ${s.phase}`);
  if (s.bought !== last.bought && s.lastBought) log.push(`${mm(t)}  bought #${s.bought} ${s.lastBought}`);
  if (s.helpers !== last.helpers && s.helpers) log.push(`${mm(t)}  helpers ${s.helpers}`);
  if (shots && (s.bought !== last.bought || s.phase !== last.phase)) await page.screenshot({ path: `${shots}/${String(shotN++).padStart(2, '0')}-${Math.round(t)}s-${s.lastBought ?? s.phase}.png` });
  // A long wait with nothing bought: say what the game shows (once per stall).
  if (s.bought !== last.bought) boughtAt = t;
  else if (t - boughtAt > 75 && !stallShown) { stallShown = true; log.push(`${mm(t)}  STALL ${JSON.stringify({ money: s.money, target: s.target?.text, tiles: s.tiles, aboard: s.aboard, carried: s.carried, me: s.me })}`); }
  if (s.bought !== last.bought) stallShown = false;
  for (const line of log.slice(n0)) console.log(line);
  last = s;
  if (s.ended || t > Number(maxS)) { log.push(`${mm(t)}  END ended=${s.ended} money=${s.money}`); break; }
}
await page.waitForTimeout(2500);
if (shots) await page.screenshot({ path: `${shots}/99-end.png` });
console.log(log[log.length - 1]);
if (errors.length) console.log('ERRORS\n' + errors.slice(0, 10).join('\n'));
await browser.close();
