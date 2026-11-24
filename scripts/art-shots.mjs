// Visual overhaul (Phase V1): the before/after screenshot harness. Built on the store-shot helpers
// (store-shots-lib.mjs: openGame, look, until, clean) and the carriage tour's idea (every carriage at every tier), it
// captures fixed-camera phone-portrait shots of the REAL game (not the preview page), so the same shots can be retaken
// after every visual change and compared one to one.
//
// Usage: node scripts/art-shots.mjs <outdir> [groups] [--look=new] [--quality=high] [--size=1080x2340] [--routes=countryside,riviera]
//   groups (comma list, default all): carriages, stations, loco, ui, slice
//   --look=new  adds ?look=new (the overhaul's switch); the default is the classic look.
//   slice: the vertical-slice shots, framed like the reference images (docs/art/refs), at the refs' own size (768×1376).
//
// The camera is the game's own (its yaw, pitch, lens); only its target and zoom are set, the way the store shots do.
// Shots are taken after the page has drawn for a moment; simulation time is advanced with the game's own fixed step
// (Game.simulate), so a shot is the same game state every run.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, settle } from './store-shots-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const out = resolve(pos[0] ?? 'docs/art/before');
const groups = new Set((pos[1] ?? 'carriages,stations,loco,ui,slice').split(','));
const look = args.look ? `&look=${args.look}` : '';
const quality = args.quality ?? 'high';
const [W, H] = (args.size ?? '1080x2340').split('x').map(Number);
const routes = (args.routes ?? 'countryside,riviera').split(',');
const page0 = resolve(process.env.PAGE ?? 'dist/index.html');
mkdirSync(out, { recursive: true });

const browser = await launch();
/** Opens the game at a CSS size of W/3 × H/3 at 3× (a phone), with a query. */
async function open(query, w = W, h = H) {
  const page = await openGame(browser, page0, `quality=${quality}${look}&${query}`);
  await page.setViewportSize({ width: Math.round(w / 3), height: Math.round(h / 3) });
  await page.evaluate(() => { window.__s.closeAll(); });
  return page;
}
async function shot(page, name, wait = 2200) {
  await settle(page, wait);
  await page.evaluate(() => window.__s.closeAll());
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
/** Plays `seconds` of game time with the autopilot, buying nothing (the staging decides what is bought). */
const advance = (page, seconds) => page.evaluate((s) => {
  const g = window.nightExpress;
  g.setAutopilot(true);
  for (let t = 0; t < s; t += 0.5) { window.__s.emptyWallet(); g.simulate(0.5); }
  g.setAutopilot(false);
  window.__s.closeAll();
}, seconds);
const ROUTE_CARS = { countryside: 8, riviera: 9 };

try {
  // ── Every carriage of both routes at every lifecycle tier (debug jump: N carriages at tier T) ───────────────────────
  if (groups.has('carriages')) for (const route of routes) for (const tier of [0, 1, 2, 3]) {
    const n = ROUTE_CARS[route];
    const page = await open(`jump=${n}:${tier}@${route}&route=${route}`);
    await advance(page, 40);
    const types = await page.evaluate(() => window.nightExpress.train.types.slice());
    await page.evaluate(() => { window.__s.clean(true); window.__s.calm(true); });
    for (let i = 0; i < types.length; i++) {
      for (const [tag, dz, zoom] of [['wide', 9, 1.75], ['close', 5, 0.85]]) {
        await page.evaluate(([i, dz, zoom]) => window.__s.look(0, window.__s.carriageZ(i) + dz, zoom), [i, dz, zoom]);
        await shot(page, `carriage-${route}-${String(i).padStart(2, '0')}-${types[i]}-t${tier}-${tag}`, 1600);
      }
    }
    await page.close();
  }

  // ── The locomotive and the train from outside ────────────────────────────────────────────────────────────────────────
  if (groups.has('loco')) for (const route of routes) {
    const page = await open(`jump=3:3@${route}&route=${route}`);
    await page.evaluate(() => { window.__s.clean(true); window.__s.look(0, -8, 1.4); });
    await shot(page, `loco-${route}`);
    await page.evaluate(() => window.__s.look(2.5, -2, 2.2));
    await shot(page, `loco-${route}-wide`);
    await page.close();
  }

  // ── Every station of both routes, with travellers ───────────────────────────────────────────────────────────────────
  if (groups.has('stations')) for (const route of routes) {
    const page = await open(`jump=4:2@${route}&route=${route}`);
    const stops = await page.evaluate(() => window.nightExpress.station ? 0 : 0);
    void stops;
    const names = new Set();
    for (let k = 0; k < 8; k++) {
      const r = await page.evaluate(() => window.__s.until('stationStop', 0, 1, 400));
      if (r.phase !== 'stationStop') break;
      await page.evaluate(() => { const g = window.nightExpress; g.setAutopilot(false); g.simulate(4); });
      const name = await page.evaluate(() => window.nightExpress.station.currentStation().name);
      if (names.has(name)) { await page.evaluate(() => window.__s.until('onTheMove', 0, 1, 200)); continue; }
      names.add(name);
      await page.evaluate(() => { window.__s.clean(true); window.__s.look(2.6, 2, 1.15); });
      await shot(page, `station-${route}-${name.replace(/\W+/g, '_')}`);
      await page.evaluate(() => window.__s.clean(false));
      await page.evaluate(() => window.__s.until('onTheMove', 0, 1, 200));
    }
    await page.close();
  }

  // ── The HUD and every popup and panel ───────────────────────────────────────────────────────────────────────────────
  if (groups.has('ui')) {
    const page = await open('jump=4:2');
    await advance(page, 30);
    const ui = [
      ['hud', null],
      ['levelup', 'g.ui.screens.levelUp(5, { railMiles: 4, cash: 300 }, 10, () => {})'],
      ['offline', 'g.ui.screens.offline(840, 5400, 10, () => {})'],
      ['shop', 'g.ui.screens.store ? g.ui.screens.paintSheet() : null'],
      ['settings', 'g.ui.screens.settings()'],
      ['menu', 'g.ui.screens.menu()'],
      ['routemap', 'g.ui.screens.routeMap()'],
      ['nextline', "g.ui.screens.nextLine({ from: 'Countryside Express', to: 'Riviera Coast Line', gems: 120, railMiles: 30, conductor: { speed: 2, capacity: 1, fareBonus: 3 }, unbought: 3 }, () => {})"],
      ['upgrades', 'g.ui.screens.upgrades()'],
      ['daily', 'g.ui.screens.daily()'],
      ['album', 'g.ui.screens.album()'],
      ['progress', 'g.ui.screens.progress()'],
      ['goal', 'g.ui.screens.goal()'],
    ];
    for (const [name, js] of ui) {
      if (js) await page.evaluate((js) => { const g = window.nightExpress; try { new Function('g', js)(g); } catch (e) { console.log(e); } }, js);
      await settle(page, 1200);
      await page.screenshot({ path: `${out}/ui-${name}.png` });
      console.log('shot', `ui-${name}`);
      await page.evaluate(() => window.__s.closeAll());
    }
    // A station stop with its result card.
    await page.evaluate(() => window.__s.until('stationStop', 0, 1, 400));
    await shot(page, 'ui-station-stop', 1200);
    await page.close();
  }

  // ── The vertical slice, framed like the references (docs/art/refs), at the references' size ────────────────────────
  if (groups.has('slice')) {
    const RW = 768, RH = 1376;
    // Ref 1: the Millbrook platform at night, the ticket stand with its queue, the conductor serving (a new game).
    {
      const page = await open('', RW, RH);
      await page.evaluate(() => { const g = window.nightExpress; g.simulate(2); });
      await shot(page, 'slice-station', 2400);
      await page.evaluate(() => { window.__s.clean(true); });
      await shot(page, 'slice-station-clean', 1200);
      await page.close();
    }
    // Ref 3: the Sleeper at night, its cabins and corridor, every tier.
    for (const tier of [0, 1, 2, 3]) {
      const page = await open(`jump=3:${tier}:s`, RW, RH);
      await advance(page, 60);
      await page.evaluate(() => { const g = window.nightExpress; const i = g.train.types.indexOf('sleeper'); window.__s.clean(true); window.__s.calm(true); window.__s.look(0, window.__s.carriageZ(i) + 9, 0.95); });
      await shot(page, `slice-sleeper-t${tier}`, 2000);
      await page.close();
    }
    // Ref 2: the Riviera's Honeymoon Suites at tier 3, golden hour, the sea outside.
    {
      const page = await open('jump=8:3:s@riviera&route=riviera', RW, RH);
      await advance(page, 60);
      await page.evaluate(() => { const g = window.nightExpress; const i = g.train.types.indexOf('honeymoon'); window.__s.clean(true); window.__s.calm(true); window.__s.look(0, window.__s.carriageZ(Math.max(0, i)) + 7, 0.95); });
      await shot(page, 'slice-honeymoon-t3', 2000);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
