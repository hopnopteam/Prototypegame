// A screenshot studio (session 38d): stages the finished train once (the god build, as store-hero.mjs does), then
// keeps the page open and runs commands dropped into <dir>/cmd.mjs, so a shot can be framed and retaken in seconds
// instead of re-staging for every attempt. A command file exports `default async (ctx) => result`, where ctx holds
// { page, evaluate, look, until, shot, settle }; its result (or error) is written to <dir>/out.txt.
// Usage: node scripts/store-studio.mjs <dir>   then write <dir>/cmd.mjs and wait for <dir>/out.txt.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openGame, play, settle } from './store-shots-lib.mjs';

const dir = resolve(process.argv[2] ?? 'store-studio');
mkdirSync(dir, { recursive: true });
const browser = await launch();
const page = await openGame(browser, resolve('dist/god.html'));
const evaluate = (fn, arg) => page.evaluate(fn, arg);
const look = (x, z, zoom) => page.evaluate(([a, b, c]) => window.__s.look(a, b, c), [x, z, zoom]);
const until = (phase, from = 0, to = 1, limit = 400) => page.evaluate(([p, a, b, l]) => window.__s.until(p, a, b, l), [phase, from, to, limit]);

/** Clears whatever the UI is holding up (cards, the station ticket, toasts) and takes the picture. */
async function shot(name, { hud = false, wait = 2600 } = {}) {
  await page.evaluate((h) => {
    const s = window.__s;
    const g = window.nightExpress;
    s.clean(!h);
    s.calm(true);
    s.worldUi(true);
    s.hideTiles(true);
    s.hideJobs(true);
    s.tidyCash();
    s.closeAll();
    g.train.chips.group.visible = h;
    for (const el of document.querySelectorAll('.ticket, .toast, .wire')) el.remove();
    if (h) g.wallet.add('cash', 24860 - g.wallet.get('cash'), 'staging');
  }, hud);
  await settle(page, wait);
  await page.evaluate(() => { window.__s.closeAll(); for (const el of document.querySelectorAll('.ticket, .toast, .wire')) el.remove(); });
  await settle(page, 300);
  await page.screenshot({ path: `${dir}/${name}.png` });
  return name;
}

async function stage(skip) {
  await evaluate(() => { const g = window.nightExpress; g.setAutopilot(false); g.econ.tiles.maxRefits = 20; g.econ.tiles.maxVisible = 40; });
  let quiet = 0;
  for (let i = 0; i < 1200 && quiet < 60; i++) {
    const n = await evaluate((s) => { const n = window.__s.buyShown(9, s); window.nightExpress.simulate(2); window.__s.closeAll(); return n; }, skip);
    quiet = n ? 0 : quiet + 1;
    await settle(page, 120);
  }
}

await play(page, 50);
await evaluate(() => window.nightExpress.devAddStars(30000));
await stage(['c2.refurb_3', 'c2.refurb_4', 'c2.refurb_5', 'c4.refurb_3', 'c4.refurb_4', 'c4.refurb_5', 'c0.refurb_5']);
await evaluate(() => { const e = window.nightExpress.econ.guests; e.extraBoarders = [5, 7]; e.maxBoarders = 16; });
for (let i = 0; i < 2; i++) {
  await until('stationStop', 0, 1, 400);
  await until('onTheMove', 0.05, 0.12);
}
writeFileSync(`${dir}/ready.txt`, JSON.stringify(await evaluate(() => window.__s.state())));
console.log('ready');

const ctx = { page, evaluate, look, until, shot, settle: (ms) => settle(page, ms), stage };
let n = 0;
for (;;) {
  const cmd = `${dir}/cmd.mjs`;
  if (existsSync(cmd)) {
    const file = `${dir}/run-${++n}.mjs`;
    renameSync(cmd, file);
    let out;
    try {
      const mod = await import(pathToFileURL(file).href);
      out = JSON.stringify(await mod.default(ctx), null, 1);
    } catch (e) {
      out = `ERROR ${e?.stack ?? e}`;
    }
    writeFileSync(`${dir}/out.txt`, `${n}\n${out}\n`);
    console.log('done', n);
    if (readFileSync(file, 'utf8').includes('// quit')) break;
  }
  await new Promise((r) => setTimeout(r, 400));
}
await browser.close();
