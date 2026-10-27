// Store screenshots (session 35, rebuilt in session 38c: owner: "desirable… before and after of carriages so I can
// show the progression… professional… not stuck or mid-gameplay, the vibe and feeling of the game").
// Real play on the Ultra tier at 1080×1920. Every carriage is shot twice from exactly the same camera: run-down, then
// refitted, with passengers aboard and the venues busy, between stations (the train calm, nobody mid-walk through a
// wall); the HUD, upgrade tiles and cross faces are hidden in the clean shots. The early game comes from the normal
// build; the whole train from the god build, staged through the game's own purchases.
// Usage: npm run build && GOD_MODE=1 OUT=god.html node scripts/build.mjs && node scripts/store-shots.mjs <outdir> [early|god]
// then: python3 scripts/store-pairs.py <outdir>   (before/after side by side)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, play, settle } from './store-shots-lib.mjs';

const out = resolve(process.argv[2] ?? 'store-shots');
const only = process.argv[3];
mkdirSync(out, { recursive: true });
const browser = await launch();

/** Every carriage's portrait: the whole 18 m in frame, the lake above and the countryside below. */
const CARRIAGE_ZOOM = 1.8;
/** The train's order: lobby, café, sleeper, washrooms, sleeper II, dining, cinema, bar, dome. */
const CARS = [[0, 'lobby'], [1, 'cafe'], [2, 'sleeper'], [3, 'washrooms'], [4, 'sleeper-ii'], [5, 'dining'], [6, 'cinema'], [7, 'bar'], [8, 'dome']];
const VENUE = new Set([1, 5, 6, 7, 8]);

async function shot(page, name, { hud = false, wait = 3000 } = {}) {
  await page.evaluate((h) => {
    const s = window.__s;
    s.clean(!h);
    s.calm(true);
    s.worldUi(true);
    s.hideTiles(!h);
    s.tidyCash();
    s.closeAll();
  }, hud);
  await settle(page, wait);
  // A card that opened while the camera settled (a level-up) is closed before the picture.
  if (await page.evaluate(() => { const open = !!document.querySelector('.scrim, .sheet'); window.__s.closeAll(); return open; })) await settle(page, 1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name, JSON.stringify(await page.evaluate(() => window.__s.state())));
}
/** Across the train per carriage: the dome looks a little toward the lake (its land side is plain dark verge). */
const LOOK_X = { 8: -1.0 };
const look = (page, carriage, zoom = CARRIAGE_ZOOM, dz = 9, x = LOOK_X[carriage] ?? 0) =>
  page.evaluate(([c, zm, d, xx]) => window.__s.look(xx, window.__s.carriageZ(c) + d, zm), [carriage, zoom, dz, x]);
const until = (page, phase, from = 0, to = 1, limit = 400) =>
  page.evaluate(([p, a, b, l]) => window.__s.until(p, a, b, l), [phase, from, to, limit]);

/** Buys everything on show (skipping ids containing any of `skip`) until nothing is left; the autopilot stays off. */
async function stage(page, skip) {
  // Every refit on show at once (play shows two): a skipped refit would otherwise hold a slot for good.
  await page.evaluate(() => { const g = window.nightExpress; g.setAutopilot(false); g.econ.tiles.maxRefits = 20; g.econ.tiles.maxVisible = 40; });
  let quiet = 0;
  // A refit rebuilds its carriage over real frames, and only two refit tiles show at a time: give each round a few frames.
  for (let i = 0; i < 1200 && quiet < 60; i++) {
    const n = await page.evaluate((s) => { const n = window.__s.buyShown(9, s); window.nightExpress.simulate(2); window.__s.closeAll(); return n; }, skip);
    quiet = n ? 0 : quiet + 1;
    await settle(page, 120);
  }
  console.log('staged', JSON.stringify(await page.evaluate(() => window.__s.state())));
}

/** Two full stations with busy platforms, so every open bed has a guest; then the calm early evening of a ride. */
async function populate(page) {
  await page.evaluate(() => { const e = window.nightExpress.econ.guests; e.extraBoarders = [5, 7]; e.maxBoarders = 16; });
  for (let i = 0; i < 2; i++) {
    await until(page, 'stationStop', 0, 1, 400);
    await until(page, 'onTheMove', 0.05, 0.12);
  }
}

/**
 * Every carriage in `cars` from the same camera. The rooms come first, straight after boarding, while the new guests
 * settle in (later they are out at the venues); then each venue in a ride's evening, filled first through the game's
 * own outing logic.
 */
async function portraits(page, prefix, cars) {
  // Early evening: the keys handed and the new guests in their rooms (the autopilot plays the conductor until then).
  await until(page, 'onTheMove', 0.2, 0.3);
  for (const [i, label] of cars.filter(([c]) => !VENUE.has(c))) {
    await look(page, i);
    await shot(page, `${prefix}-${String(i).padStart(2, '0')}-${label}`);
  }
  for (const [i, label] of cars.filter(([c]) => VENUE.has(c))) {
    await until(page, 'onTheMove', 0.14, 0.24);
    await page.evaluate(([c, wait]) => { window.__s.fillVenue(c, 10); window.nightExpress.simulate(wait); window.nightExpress.setAutopilot(false); }, [i, 20 + 10 * Math.abs(i - 3)]);
    await look(page, i);
    await shot(page, `${prefix}-${String(i).padStart(2, '0')}-${label}`);
  }
}

// ─── The early game: the normal build from a brand-new save ──────────────────────────────────────────────────────
if (!only || only === 'early') {
  const page = await openGame(browser, resolve('dist/index.html'));
  await settle(page, 2500);
  // Millbrook at night: the old carriage under its tarp beside the ticket stand, the first traveller waiting.
  await page.evaluate(() => { const p = window.nightExpress.player.pos; window.__s.look(p.x - 2.0, p.z + 1.0, 1.5); });
  await shot(page, 'a-01-millbrook-platform', { hud: true });
  // The run-down lobby with its first guests: the "before" of the lobby pair, then the same as the player sees it.
  await play(page, 45);
  await until(page, 'onTheMove', 0.22, 0.34);
  await look(page, 0);
  await shot(page, 'b-00-lobby');
  await look(page, 0, 1.2, 7);
  await shot(page, 'a-02-first-guests-gameplay', { hud: true });
  await page.close();
}

// ─── The god build: the whole train run-down, then refitted ──────────────────────────────────────────────────────
if (!only || only === 'god') {
  const page = await openGame(browser, resolve('dist/god.html'));
  await play(page, 50);
  // 1. Run-down: every carriage, its rooms, tables, staff and menus, but no refit (the lobby keeps the Repair every
  //    coupling needs; its run-down picture comes from the early game) and no station dressing yet.
  const REFITS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `c${i}.refurb`);
  await stage(page, ['c0.refurb_2', 'c0.refurb_3', 'c0.refurb_4', 'c0.refurb_5', ...REFITS, 'comfort_', 'st.']);
  await populate(page);
  await portraits(page, 'b', CARS.slice(1));
  await until(page, 'onTheMove', 0.2, 0.3);
  await look(page, 3, 3.4, 9);
  await shot(page, 'w-01-train-before');

  // 2. Refitted: venues and washrooms in Luxury, the lobby in First Class, the sleepers in Comfort (the same rooms,
  //    so the pair compares like with like), comforts and the station dressing bought.
  await page.evaluate(() => window.nightExpress.devAddStars(30000));
  const SLEEPER_TOP = ['c2.refurb_3', 'c2.refurb_4', 'c2.refurb_5', 'c4.refurb_3', 'c4.refurb_4', 'c4.refurb_5'];
  await stage(page, [...SLEEPER_TOP, 'c0.refurb_5']);
  await populate(page);
  await portraits(page, 'c', CARS);
  await until(page, 'onTheMove', 0.2, 0.3);
  await look(page, 3, 3.4, 9);
  await shot(page, 'w-02-train-after');
  // A little play with the HUD: the lobby and the café as the player sees them.
  await until(page, 'onTheMove', 0.16, 0.24);
  await page.evaluate(() => { window.__s.fillVenue(1, 8); window.nightExpress.simulate(12); window.nightExpress.setAutopilot(false); window.__s.showCash(24860); });
  await look(page, 1, 1.15, 9);
  await shot(page, 'd-01-cafe-gameplay', { hud: true });
  await look(page, 0, 1.15, 10);
  await shot(page, 'd-02-lobby-gameplay', { hud: true });

  // A station stop: a full platform, the stand, the bags, the train in its station dressing.
  await until(page, 'stationStop', 0, 1, 400);
  await page.evaluate(() => { window.nightExpress.simulate(3); window.nightExpress.setAutopilot(false); });
  await look(page, 0, 1.6, 2, 4.4);
  await shot(page, 'e-01-station');
  await look(page, 0, 1.25, 2, 4.0);
  await shot(page, 'e-02-station-gameplay', { hud: true });

  // 3. The top classes: the Royal Suite in the first sleeper, First Class in the second, the lobby Royal; then lights out.
  await stage(page, ['c4.refurb_5']);
  await populate(page);
  for (const [i, label] of [[0, 'lobby-royal'], [2, 'sleeper-royal-suite'], [4, 'sleeper-first-class']]) {
    await until(page, 'onTheMove', 0.22, 0.34);
    await look(page, i);
    await shot(page, `f-${String(i).padStart(2, '0')}-${label}`);
  }
  await until(page, 'onTheMove', 0.52, 0.58);
  await look(page, 2);
  await shot(page, 'f-09-lights-out');
  await page.close();
}
// ─── Retakes: run-down and refitted shots of chosen carriages only (`retake 5,8`) ────────────────────────────────
if (only === 'retake') {
  const pick = new Set((process.argv[4] ?? '').split(',').map(Number));
  const cars = CARS.filter(([i]) => pick.has(i));
  const page = await openGame(browser, resolve('dist/god.html'));
  await play(page, 50);
  const REFITS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `c${i}.refurb`);
  await stage(page, ['c0.refurb_2', 'c0.refurb_3', 'c0.refurb_4', 'c0.refurb_5', ...REFITS, 'comfort_', 'st.']);
  await populate(page);
  await portraits(page, 'b', cars.filter(([i]) => i !== 0));
  await page.evaluate(() => window.nightExpress.devAddStars(30000));
  await stage(page, ['c2.refurb_3', 'c2.refurb_4', 'c2.refurb_5', 'c4.refurb_3', 'c4.refurb_4', 'c4.refurb_5', 'c0.refurb_5']);
  await populate(page);
  await portraits(page, 'c', cars);
  await page.close();
}
await browser.close();
