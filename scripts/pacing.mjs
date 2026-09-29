// Plays the first session with the autopilot, headless and accelerated, and prints when each §14 beat lands.
// Usage: node scripts/pacing.mjs [seconds=900] [screenshotDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const total = Number(process.argv[2] ?? 900);
const shotDir = process.argv[3];
if (shotDir) mkdirSync(shotDir, { recursive: true });
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
await page.goto(`file://${resolve('dist/index.html')}`);
await page.waitForTimeout(600);
await page.mouse.click(195, 700);
// Tests drive the game themselves: skip the intro so it cannot unpause the game halfway through.
await page.evaluate(() => window.nightExpress.skipIntro?.());
await page.evaluate(() => {
  const g = window.nightExpress;
  g.paused = true;
  g.setAutopilot(true);
});

const chunk = 5;
const timeline = [];
let lastLevel = 1;
let lastCarriages = 1;
let lastStaff = 0;
// When each tile was bought, to find dry spells (the next unlock should always be 20–60 s away).
const bought = [];
const seen = new Set();
for (let t = 0; t < total; t += chunk) {
  const snap = await page.evaluate((c) => {
    const g = window.nightExpress;
    g.simulate(c);
    // Dismiss popups like a player would: collect rewards, decline offers.
    // Sheets that need an answer (naming, interviews, awards) mark their default choice.
    const choice = document.querySelector('.scrim [data-default]');
    if (choice) choice.click();
    else for (const b of document.querySelectorAll('.scrim .btn')) {
      if (/^(Collect|Maybe later|Claim)$/.test(b.textContent.trim())) { b.click(); break; }
    }
    return {
      t: Math.round(g.lifetimeSeconds()),
      cash: Math.floor(g.wallet.get('cash')),
      level: g.progression.level,
      stars: g.progression.stars,
      carriages: g.train.count,
      staff: g.staff.members.length,
      unlocked: g.data.route.unlocked.length,
      phase: g.journey.phase,
      stop: g.journey.stopSerial,
      guests: g.guests.list.length,
      queue: g.guests.queue.length,
      floorCash: Math.floor(g.cash.totalOnFloor),
      ftue: g.data.profile.ftue,
      unlockedIds: g.data.route.unlocked,
      pos: g.player.pos,
      target: g.guidance.bestTarget(true),
      objective: g.data.objectives.index,
      prices: Object.fromEntries(g.unlocks.defs.map((d) => [d.id, d.price])),
    };
  }, chunk);
  for (const id of snap.unlockedIds) if (!seen.has(id)) { seen.add(id); bought.push({ t: snap.t, id, price: snap.prices[id] ?? 0 }); }
  if (snap.level !== lastLevel || snap.carriages !== lastCarriages || snap.staff !== lastStaff || Math.round(t + chunk) % (process.env.EVERY ? Number(process.env.EVERY) : 60) === 0) {
    timeline.push(`${fmt(snap.t)}  obj ${snap.objective}  pos ${snap.pos.x.toFixed(1)},${snap.pos.z.toFixed(1)} → ${snap.target ? snap.target.x.toFixed(1) + ',' + snap.target.z.toFixed(1) : '-'}  cash ${snap.cash}  lvl ${snap.level} (${snap.stars}★)  cars ${snap.carriages}  staff ${snap.staff}  unlocks ${snap.unlocked}  stop #${snap.stop} ${snap.phase}  guests ${snap.guests} q${snap.queue} floor$${snap.floorCash}`);
    lastLevel = snap.level; lastCarriages = snap.carriages; lastStaff = snap.staff;
  }
  const shotAt = (process.env.SHOTS ?? '').split(',').filter(Boolean).map(Number);
  if (shotDir && shotAt.some((s) => s >= t && s < t + chunk)) {
    await page.evaluate(() => { window.nightExpress.paused = false; });
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.nightExpress.paused = true; });
    await page.screenshot({ path: `${shotDir}/t${String(Math.round(t + chunk)).padStart(4, '0')}.png` });
  }
  if (t + chunk >= total) {
    console.log(timeline.join('\n'));
    console.log('\nFTUE beats (lifetime seconds):');
    for (const [step, sec] of Object.entries(snap.ftue).sort((a, b) => a[1] - b[1])) console.log(`  ${fmt(sec)}  ${step}`);
    console.log('\nUnlocks (time, gap since the previous, id, price):');
    let prev = 0;
    const gaps = [];
    for (const b of bought) {
      gaps.push({ gap: b.t - prev, at: b.t, id: b.id });
      console.log(`  ${fmt(b.t)}  +${String(b.t - prev).padStart(3)}s  ${b.id} (${b.price})`);
      prev = b.t;
    }
    gaps.sort((a, b) => b.gap - a.gap);
    console.log('Longest gaps:', gaps.slice(0, 6).map((g) => `${g.gap}s before ${g.id} at ${fmt(g.at)}`).join('; '));
  }
}
if (errors.length) console.log('\nERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();

function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
