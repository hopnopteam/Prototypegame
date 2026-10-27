// Play Store screenshots (session 35, owner: "high quality screenshots… the full carriages and nuances… low levels too…
// good crowd density"). Real play on the Ultra tier at 1080×1920: the opening and the run-down early train from the
// normal build, then the god build (unlimited cash) staged through the game's own purchases: every carriage worn, then
// fully refitted, with passengers aboard, on the platform and in the venues.
// Usage: npm run build && GOD_MODE=1 OUT=god.html node scripts/build.mjs && node scripts/store-shots.mjs <outdir> [early|god]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, play, settle } from './store-shots-lib.mjs';

const out = resolve(process.argv[2] ?? 'store-shots');
const only = process.argv[3];
mkdirSync(out, { recursive: true });
const browser = await launch();

async function shot(page, name, { hud = false, wait = 3000 } = {}) {
  // Clean shots hide the HUD and the upgrade tiles but keep the people's bubbles; gameplay shots show everything.
  await page.evaluate((h) => { window.__s.clean(!h); window.__s.calm(true); window.__s.worldUi(true); window.__s.hideTiles(!h); if (!h) window.__s.tidyCash(); if (h && window.nightExpress.wallet.get('cash') < 1000) window.__s.showCash(18640); window.__s.closeAll(); }, hud);
  await settle(page, wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name, JSON.stringify(await page.evaluate(() => window.__s.state())));
}
const look = (page, carriage, zoom, dz = 9, x = 0) => page.evaluate(([c, zm, d, xx]) => window.__s.look(xx, window.__s.carriageZ(c) + d, zm), [carriage, zoom, dz, x]);
const free = (page) => page.evaluate(() => window.__s.free());
const until = (page, phase, from = 0, to = 1, limit = 400) => page.evaluate(([p, a, b, l]) => window.__s.until(p, a, b, l), [phase, from, to, limit]);

/** Buys everything on show again and again (skipping tiles whose id contains any of `skip`) until nothing is left. */
async function stage(page, maxCarriages, skip) {
  let quiet = 0;
  for (let i = 0; i < 600 && quiet < 25; i++) {
    const bought = await page.evaluate(([m, s]) => { const n = window.__s.buyShown(m, s); window.nightExpress.simulate(2); window.__s.closeAll(); return n; }, [maxCarriages, skip]);
    quiet = bought ? 0 : quiet + 1;
  }
  console.log('staged', JSON.stringify(await page.evaluate(() => window.__s.state())));
}

// ─── The early game: the normal build from a brand-new save ──────────────────────────────────────────────────────
if (!only || only === 'early') {
  const page = await openGame(browser, resolve('dist/index.html'));
  await settle(page, 2500);
  await shot(page, '01-opening-millbrook-platform', { hud: true });
  await play(page, 16);
  await free(page);
  await shot(page, '02-first-tickets', { hud: true });
  await play(page, 12);
  await shot(page, '03-carriage-revealed', { hud: true });
  await play(page, 20);
  await shot(page, '04-first-passengers-check-in', { hud: true });
  await until(page, 'stationStop', 0, 1, 300);
  await play(page, 4);
  await free(page);
  await shot(page, '05-first-station-stop', { hud: true });
  await play(page, 200);
  await until(page, 'onTheMove', 0.25, 0.4);
  await page.evaluate(() => window.nightExpress.setAutopilot(false));
  await look(page, 0, 1.05, 10);
  await shot(page, '06-rundown-lobby-basic');
  await look(page, 0, 1.0, 10);
  await shot(page, '07-rundown-lobby-gameplay', { hud: true });
  await page.close();
}

// ─── The god build: the whole train, worn and then refitted ──────────────────────────────────────────────────────
// A Royal Suite takes one guest, so the grandest train is the quietest: the busy shots keep the sleepers at Comfort
// (the most beds) while the lobby and venues are refitted, and the Royal and First Class carriages get shots of their own.
const SLEEPER_CLASSES = ['refurb_3', 'refurb_4', 'refurb_5'].flatMap((r) => ['c1.', 'c4.'].map((c) => c + r));
const venueShots = async (page, prefix, venues, hudFor = []) => {
  for (const [i, label] of venues) {
    await until(page, 'onTheMove', 0.16, 0.26);
    // Guests walk from the sleepers (carriages 1 and 4): the further the venue, the longer they need to get there.
    await page.evaluate(([c, wait]) => { window.__s.fillVenue(c, 10); window.nightExpress.simulate(wait); window.nightExpress.setAutopilot(false); }, [i, 14 + 4 * Math.abs(i - 3)]);
    await look(page, i, 1.05);
    await shot(page, `${prefix}-${label}`);
    if (hudFor.includes(i)) await shot(page, `${prefix}-${label}-gameplay`, { hud: true });
  }
};
// The bar and the cinema take evening outings only, so they go first in a ride's evening.
const VENUES = [[7, 'bar'], [6, 'cinema'], [3, 'cafe'], [5, 'dining'], [8, 'dome']];

if (!only || only === 'god') {
  const page = await openGame(browser, resolve('dist/god.html'));
  await play(page, 240);
  // 1. Worn: every carriage joins, nothing refitted (venues get their tables, staff and menus).
  await stage(page, 9, ['refurb', 'comfort_']);
  await play(page, 260, true, false);
  await until(page, 'onTheMove', 0.18, 0.3);
  await page.evaluate(() => window.nightExpress.setAutopilot(false));
  for (const [i, label] of [[0, 'lobby'], [1, 'sleeper'], [2, 'washrooms'], [4, 'sleeper-ii']]) {
    await look(page, i, 1.05);
    await shot(page, `1${i}-worn-${label}`);
  }
  await venueShots(page, '15-worn', VENUES, [3]);

  // 2. Refitted lobby, washrooms and venues; the sleepers at Comfort, full of guests.
  await page.evaluate(() => window.nightExpress.devAddStars(20000));
  await stage(page, 9, SLEEPER_CLASSES);
  await play(page, 300, true, false);
  await until(page, 'onTheMove', 0.18, 0.3);
  await page.evaluate(() => window.nightExpress.setAutopilot(false));
  for (const [i, label] of [[0, 'lobby-luxury'], [1, 'sleeper-comfort'], [2, 'washrooms-luxury'], [4, 'sleeper-ii-comfort']]) {
    await look(page, i, 1.05);
    await shot(page, `2${i}-${label}`);
  }
  await look(page, 0, 1.0);
  await shot(page, '29-lobby-gameplay', { hud: true });
  await venueShots(page, '3-luxury', VENUES, [3, 5, 7]);
  await until(page, 'onTheMove', 0.2, 0.3);
  await page.evaluate(() => { window.__s.fillVenue(3, 6); window.__s.fillVenue(5, 6); window.nightExpress.simulate(14); window.nightExpress.setAutopilot(false); });
  for (const [i, label] of [[1, 'sleepers'], [4, 'cafe-to-dining']]) {
    await look(page, i, 2.3, 18);
    await shot(page, `4${i}-wide-${label}`);
  }
  await look(page, 6, 2.3, 18);
  await shot(page, '47-wide-venues');
  await look(page, 3, 3.4, 9);
  await shot(page, '49-wide-train');
  await until(page, 'onTheMove', 0.5, 0.58);
  await page.evaluate(() => window.nightExpress.setAutopilot(false));
  await look(page, 1, 1.0);
  await shot(page, '50-lights-out');

  // A station stop: a full platform (more travellers than beds wait, as at five stars), the stand, the bags.
  await page.evaluate(() => { const e = window.nightExpress.econ.guests; e.extraBoarders = [5, 7]; e.maxBoarders = 14; });
  await until(page, 'stationStop', 0, 1, 400);
  await page.evaluate(() => { window.nightExpress.simulate(2.5); window.nightExpress.setAutopilot(false); });
  await look(page, 0, 1.3, 1, 4.6);
  await shot(page, '60-station-platform');
  await look(page, 0, 1.15, 2, 4.2);
  await shot(page, '61-station-gameplay', { hud: true });
  await look(page, 0, 2.4, 6, 4.5);
  await shot(page, '62-station-wide');

  // 3. The top classes: the Royal Suite (lobby and sleeper) and First Class (the second sleeper).
  await stage(page, 9, ['c4.refurb_5']);
  await play(page, 300, true, false);
  await until(page, 'onTheMove', 0.18, 0.3);
  await page.evaluate(() => window.nightExpress.setAutopilot(false));
  for (const [i, label] of [[0, 'lobby-royal'], [1, 'sleeper-royal-suite'], [4, 'sleeper-first-class']]) {
    await look(page, i, 1.05);
    await shot(page, `7${i}-${label}`);
  }
  await look(page, 2, 2.4, 18);
  await shot(page, '79-wide-royal-first');
  await page.close();
}
await browser.close();
