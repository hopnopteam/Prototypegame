// Headless end-to-end check: boots the built game, lets the autopilot play the first session at
// accelerated speed, and fails (exit 1) if a §14 beat lands too late, an ad rule is broken, the save
// does not survive a reload, or the page logs an error. Usage: npm run build && npm run smoke [seconds=780]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const total = Number(process.argv[2] ?? 780);
const file = resolve('dist/index.html');
if (!existsSync(file)) { console.error('dist/index.html missing: run npm run build first.'); process.exit(1); }

// Latest acceptable lifetime second for each beat. Looser than the §14 targets so autopilot variance
// does not flake the check; scripts/pacing.mjs is the tool for tuning toward the targets themselves.
const DEADLINES = { first_checkin: 15, first_cash: 20, first_unlock: 45, first_station: 80, first_hire: 150, first_carriage: 360, second_carriage: 720, route_level_2: 780 };

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const failures = [];
const check = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); if (!ok) failures.push(message); };

await page.goto(`file://${file}`);
await page.waitForTimeout(800);
await page.mouse.click(195, 700);
// Tests drive the game themselves: skip the intro so it cannot unpause the game halfway through.
await page.evaluate(() => window.nightExpress.skipIntro?.());
await page.waitForTimeout(400);
check(await page.evaluate(() => !!window.nightExpress && !document.querySelector('.splash')), 'boots and the title card starts the game');

// Record the journey phase and lifetime at every interstitial, so the §12 rules can be verified after.
await page.evaluate(() => {
  const g = window.nightExpress;
  window.__interstitials = [];
  // Smart carrying: every item the player picks up must be something the train needs.
  window.__picks = { total: 0, unneeded: 0, returned: 0 };
  g.events.on('item.picked', ({ item, byPlayer }) => {
    if (!byPlayer) return;
    window.__picks.total++;
    if (g.player.stack.countOf(item) > g.demand.playerNeed(item)) window.__picks.unneeded++;
  });
  g.events.on('item.returned', ({ byPlayer }) => { if (byPlayer) window.__picks.returned++; });
  const log = g.analytics.log.bind(g.analytics);
  g.analytics.log = (event, params) => {
    if (event === 'interstitial_shown') window.__interstitials.push({ phase: g.journey.phase, life: g.lifetimeSeconds(), stop: g.journey.stopSerial });
    log(event, params);
  };
  g.paused = true;
  g.setAutopilot(true);
});

let snap;
for (let t = 0; t < total; t += 5) {
  snap = await page.evaluate(() => {
    const g = window.nightExpress;
    g.simulate(5);
    // Sheets that need an answer (naming, interviews, awards) mark their default choice.
    const choice = document.querySelector('.scrim [data-default]');
    if (choice) choice.click();
    else for (const b of document.querySelectorAll('.scrim .btn')) {
      if (/^(Collect|Maybe later|Claim)$/.test(b.textContent.trim())) { b.click(); break; }
    }
    const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.z);
    return {
      life: g.lifetimeSeconds(),
      cash: g.wallet.get('cash'),
      level: g.progression.level,
      carriages: g.train.count,
      staff: g.staff.members.length,
      unlocked: g.data.route.unlocked.length,
      ftue: g.data.profile.ftue,
      named: g.data.press.trainName,
      stories: g.data.press.items.length,
      coachDone: ['walk', 'checkin', 'cash', 'tile'].every((id) => g.flag(`coach_${id}`)),
      tiers: g.train.tiers.slice(),
      station: g.data.route.unlocked.filter((id) => id.startsWith('st.')),
      objective: g.data.objectives.index,
      comforts: g.data.route.unlocked.filter((id) => id.includes('.comfort_')).length,
      openCabins: g.train.openCabinCount(),
      positionsFinite: finite(g.player.pos) && g.guests.list.every((x) => finite(x.pos)) && g.staff.members.every((x) => finite(x.pos)),
    };
  });
  if (!snap.positionsFinite || !Number.isFinite(snap.cash)) break;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
check(snap.positionsFinite && Number.isFinite(snap.cash) && snap.cash >= 0, 'no NaN positions or negative cash');
for (const [beat, deadline] of Object.entries(DEADLINES)) {
  const at = snap.ftue[beat];
  check(at !== undefined && at <= deadline, `${beat} at ${at === undefined ? 'never' : fmt(at)} (deadline ${fmt(deadline)})`);
}
check(snap.carriages >= 3, `${snap.carriages} carriages after ${fmt(snap.life)} (want 3+)`);
check(snap.staff >= 2, `${snap.staff} staff after ${fmt(snap.life)} (want 2+)`);
check(snap.coachDone, 'the four-step walkthrough completed');
check(!!snap.named && snap.stories >= 3, `the train was named ("${snap.named}") and made the paper ${snap.stories} times`);
check(snap.tiers.some((t) => t >= 1), `at least one carriage refurbished (tiers ${snap.tiers.join(',')})`);
check(snap.station.length >= 1, `station upgrades bought at stops (${snap.station.join(', ') || 'none'})`);
check(snap.objective >= 12, `the objective chain kept moving (${snap.objective} goals done)`);
check(snap.comforts >= 1, `comforts bought (${snap.comforts})`);

const picks = await page.evaluate(() => window.__picks);
check(picks.total > 10 && picks.unneeded === 0, `every pickup was needed (${picks.total} picked, ${picks.unneeded} unneeded, ${picks.returned} returned)`);

const ads = await page.evaluate(() => window.__interstitials);
const minLife = 600;
check(ads.every((a) => a.phase === 'departing'), `every interstitial in the Departing phase (${ads.length} shown)`);
check(ads.every((a) => a.life >= minLife), 'no interstitial before minute 10 of lifetime play');
check(ads.every((a, i) => i === 0 || a.life - ads[i - 1].life >= 180), 'interstitials at least 3 minutes apart');

// Standing in a doorway as the doors shut must never trap the conductor inside the wall.
const door = await page.evaluate(() => {
  const g = window.nightExpress;
  g.paused = true;
  g.setAutopilot(false);
  for (let i = 0; i < 800 && g.journey.phase !== 'stationStop'; i++) g.simulate(0.5);
  const d = g.map.doors()[0];
  for (let i = 0; i < 400 && g.journey.phase === 'stationStop'; i++) { g.player.pos.x = 2.15; g.player.pos.z = d.inside.z; g.simulate(0.25); }
  g.simulate(1);
  const before = { x: g.player.pos.x, z: g.player.pos.z };
  g.input.override = { x: -1, y: 0 };
  g.simulate(1);
  g.input.override = null;
  return { walkable: g.map.walk.isWalkable(g.player.pos.x, g.player.pos.z), moved: Math.hypot(g.player.pos.x - before.x, g.player.pos.z - before.z) };
});
check(door.walkable && door.moved > 0.5, `a doorway shutting never traps the conductor (walked ${door.moved.toFixed(2)} m after)`);

// The save must survive a reload with progress intact.
const before = snap.unlocked;
await page.evaluate(() => { const g = window.nightExpress; g.setAutopilot(false); g.save.saveNow(); });
await page.reload();
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({ unlocked: window.nightExpress.data.route.unlocked.length, cabins: window.nightExpress.train.openCabinCount() }));
check(after.unlocked === before, `save survives a reload (${after.unlocked}/${before} unlocks)`);
check(after.cabins === snap.openCabins, `cabins bought are still open after a reload (${after.cabins}/${snap.openCabins})`);

const perf = await page.evaluate(() => ({ draws: window.nightExpress.stage.drawCalls }));
check(perf.draws < 200, `${perf.draws} draw calls (budget 200)`);
check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + [...new Set(errors)].slice(0, 8).join('\n  ') : ''}`);

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll smoke checks passed.');
process.exit(failures.length ? 1 : 0);
