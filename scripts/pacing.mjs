// Phase 3, the pacing simulator (a debug tool, never shipped): plays Route 1 with the autopilot, headless and
// accelerated, as a "fast" (efficient) or "average" player (30% more time idle and wandering), and reports the minutes
// of active play at each milestone against the Phase 3 targets, every purchase and the dry spells.
//
// Usage: node scripts/pacing.mjs [--profile=average|fast|both] [--minutes=260] [--out=dist/pacing] [--chunk=5]
//        node scripts/pacing.mjs 900          (the old form: the first 900 seconds, average profile off = fast)
// Writes <out>-<profile>.csv (one row per milestone and purchase) and <out>-<profile>.log (the full report).
// PAGE=dist/god.html etc. picks another build; SHOTS=60,120 with --shots=dir takes screenshots.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? 'true'];
}));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const maxSeconds = positional[0] ? Number(positional[0]) : Number(args.minutes ?? 260) * 60;
const profiles = (args.profile ?? (positional[0] ? 'fast' : 'both')) === 'both' ? ['average', 'fast'] : [args.profile ?? 'fast'];
const out = args.out ?? 'dist/pacing';
const chunk = Number(args.chunk ?? 5);
const shotDir = args.shots;
if (shotDir) mkdirSync(shotDir, { recursive: true });
mkdirSync(dirname(resolve(out)), { recursive: true });

/** The extra idle time on top of the work, by profile (see Autopilot.idleShare). */
const IDLE = { fast: 0, average: 0.3 };

/** Phase 3's Route 1 targets for the average player (minutes of active play), ±10%. */
const TARGETS = {
  'carriage 2': 4, 'carriage 3': 14, 'carriage 4': 28, 'carriage 5': 45,
  'carriage 6': 65, 'carriage 7': 90, 'carriage 8': 120, 'route complete': [150, 170],
};
/** The old build's real players, for reference. */
const REAL_OLD = { 'carriage 2': 6, 'carriage 3': 19, 'carriage 4': 40, 'carriage 5': 58, 'carriage 6': 82, 'carriage 7': 103 };
const DEAD_LIMIT = 15 * 60;
const NEW_EVERY = [8 * 60, 12 * 60];

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const reports = [];
for (const profile of profiles) reports.push(await run(profile));
await browser.close();
if (reports.length > 1) {
  console.log('\n=== Side by side (minutes of active play) ===');
  const keys = [...new Set(reports.flatMap((r) => Object.keys(r.milestones)))];
  console.log(`${'milestone'.padEnd(16)}${reports.map((r) => r.profile.padStart(10)).join('')}    target   old build`);
  for (const k of keys) {
    const t = TARGETS[k];
    console.log(`${k.padEnd(16)}${reports.map((r) => (r.milestones[k] != null ? (r.milestones[k] / 60).toFixed(1) : '-').padStart(10)).join('')}    ${String(Array.isArray(t) ? t.join('–') : (t ?? '')).padStart(6)}   ${REAL_OLD[k] ?? ''}`);
  }
}

async function run(profile) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
  await page.goto(`file://${resolve(process.env.PAGE ?? 'dist/index.html')}`);
  await page.waitForTimeout(600);
  await page.mouse.click(195, 700);
  await page.waitForFunction(() => !!window.nightExpress, null, { timeout: 90000 });
  await page.evaluate((idle) => {
    const g = window.nightExpress;
    g.skipIntro?.();
    g.paused = true;
    g.setAutopilot(true);
    g.autopilot.idleShare = idle;
  }, IDLE[profile] ?? 0);

  const lines = [];
  const log = (s) => { lines.push(s); };
  const milestones = {};
  const bought = [];
  const news = []; // every "something new": a coupling, a level, a refit, a hire, a station upgrade, an event
  const seen = new Set();
  let lastCarriages = 1, lastLevel = 1, lastEvent = null;
  let stuckSince = null, longestStuck = { s: 0, at: 0 };
  const stuckSpells = [];
  // A soft-lock alarm: no station stop completed for this long means the bot (or the game) is stuck somewhere.
  let lastStop = -1, lastStopAt = 0;
  const softLocks = [];
  let snap;
  for (let t = 0; t < maxSeconds; t += chunk) {
    snap = await page.evaluate((c) => {
      const g = window.nightExpress;
      g.simulate(c);
      const choice = document.querySelector('.scrim [data-default]');
      if (choice) choice.click();
      else for (const b of document.querySelectorAll('.scrim .btn')) {
        if (/^(Collect|Maybe later|Claim|Continue|Nice!|OK)$/.test(b.textContent.trim())) { b.click(); break; }
      }
      const cash = g.wallet.get('cash');
      const u = g.unlocks;
      const open = u.defs.filter((d) => !u.isUnlocked(d.id));
      const affordable = open.some((d) => u.isAvailable(d.id) && u.remaining(d.id) <= cash);
      return {
        t: g.lifetimeSeconds(),
        cash: Math.floor(cash),
        level: g.progression.level,
        stars: g.progression.stars,
        carriages: g.train.count,
        maxCarriages: g.route?.maxCarriages ?? 8,
        staff: g.staff.members.length,
        unlocked: g.data.route.unlocked.slice(),
        defs: u.defs.map((d) => ({ id: d.id, kind: d.kind, price: d.price, label: d.label })),
        open: open.length,
        affordable,
        event: g.stationEvents?.active?.id ?? null,
        stop: g.journey.stopSerial,
      };
    }, chunk);
    const now = snap.t;
    const defs = Object.fromEntries(snap.defs.map((d) => [d.id, d]));
    for (const id of snap.unlocked) if (!seen.has(id)) {
      seen.add(id);
      const d = defs[id] ?? { kind: id.startsWith('couple') ? 'couple' : '?', price: 0, label: id };
      bought.push({ t: now, id, kind: d.kind, price: d.price, label: d.label });
      if (['couple', 'refurb', 'hire', 'staffUpgrade', 'exterior', 'marketing', 'comfort', 'menu', 'station'].includes(d.kind) || id.startsWith('st.')) news.push({ t: now, what: `${d.kind} ${d.label}` });
    }
    if (snap.carriages > lastCarriages) {
      for (let n = lastCarriages + 1; n <= snap.carriages; n++) milestones[`carriage ${n}`] = now;
      lastCarriages = snap.carriages;
    }
    if (snap.level > lastLevel) {
      for (let n = lastLevel + 1; n <= snap.level; n++) { milestones[`level ${n}`] = now; news.push({ t: now, what: `level ${n}` }); }
      lastLevel = snap.level;
    }
    if (snap.stop !== lastStop) { lastStop = snap.stop; lastStopAt = now; }
    else if (now - lastStopAt > 8 * 60 && !softLocks.some((l) => l.from === lastStopAt)) softLocks.push({ from: lastStopAt, stop: snap.stop });
    if (snap.event && snap.event !== lastEvent) news.push({ t: now, what: `event ${snap.event}` });
    lastEvent = snap.event;
    // A dry spell: nothing new affordable (and something left to buy).
    if (!snap.affordable && snap.open > 0) { if (stuckSince == null) stuckSince = now; }
    else if (stuckSince != null) {
      const s = now - stuckSince;
      if (s >= 180) stuckSpells.push({ from: stuckSince, s });
      if (s > longestStuck.s) longestStuck = { s, at: stuckSince };
      stuckSince = null;
    }
    const refitsDone = snap.defs.filter((d) => d.kind === 'refurb').every((d) => snap.unlocked.includes(d.id));
    if (snap.carriages >= snap.maxCarriages && refitsDone && milestones['all refits'] == null) milestones['all refits'] = now;
    if (snap.carriages >= snap.maxCarriages && snap.open === 0 && milestones['route complete'] == null) milestones['route complete'] = now;
    if (process.env.EVERY && Math.round(t) % Number(process.env.EVERY) === 0) process.stderr.write(`[${profile}] ${fmt(now)} cash ${snap.cash} lvl ${snap.level} cars ${snap.carriages} open ${snap.open}\n`);
    const shotAt = (process.env.SHOTS ?? '').split(',').filter(Boolean).map(Number);
    if (shotDir && shotAt.some((s) => s >= t && s < t + chunk)) {
      await page.evaluate(() => { window.nightExpress.paused = false; });
      await page.waitForTimeout(700);
      await page.evaluate(() => { window.nightExpress.paused = true; });
      await page.screenshot({ path: `${shotDir}/${profile}-t${String(Math.round(t + chunk)).padStart(5, '0')}.png` });
    }
    if (milestones['route complete'] != null) break;
  }
  if (stuckSince != null) {
    const s = snap.t - stuckSince;
    if (s >= 180) stuckSpells.push({ from: stuckSince, s });
    if (s > longestStuck.s) longestStuck = { s, at: stuckSince };
  }
  // Why each tile left is still unbought: a missing requirement, a level gate, hand work, or simply not bought.
  const leftover = await page.evaluate(() => {
    const g = window.nightExpress;
    const u = g.unlocks;
    return u.defs.filter((d) => !u.isUnlocked(d.id)).map((d) => {
      const missing = d.requires.filter((r) => !u.isUnlocked(r));
      const short = u.workShort(d);
      const why = missing.length ? `needs ${missing.join(', ')}` : !u.isListed(d.id) ? `gated ${(d.flags ?? []).join(',')}` : short ? `hand work ${short.metric} ${short.done}/${short.need}` : `buyable, ${Math.round(u.remaining(d.id))} left${g.tiles.entries?.has?.(d.id) ? ' (on show)' : ' (not on show)'}`;
      return `${d.id} (${d.kind}, ${d.price}): ${why}`;
    });
  });
  await page.close();

  // ─── Report ───
  log(`=== Pacing: ${profile} player (idle +${Math.round((IDLE[profile] ?? 0) * 100)}%), ${fmt(snap.t)} played ===`);
  log(`End: level ${snap.level} (${snap.stars}★), ${snap.carriages} carriages, ${snap.open} tiles left, cash ${snap.cash}`);
  log('\nMilestones (minutes of active play):');
  const order = [...Array.from({ length: 8 }, (_, i) => `carriage ${i + 2}`), ...Array.from({ length: 7 }, (_, i) => `level ${i + 2}`), 'all refits', 'route complete'];
  const csv = ['type,name,minutes,target,within,kind,price'];
  let misses = 0;
  for (const k of order) {
    const v = milestones[k];
    const target = TARGETS[k];
    let verdict = '';
    if (target != null && profile === 'average') {
      const [lo, hi] = Array.isArray(target) ? target : [target * 0.9, target * 1.1];
      const ok = v != null && v / 60 >= lo && v / 60 <= hi;
      if (!ok) misses++;
      verdict = ok ? 'ok' : v == null ? 'NOT REACHED' : v / 60 < lo ? 'EARLY' : 'LATE';
    }
    log(`  ${k.padEnd(16)} ${v != null ? (v / 60).toFixed(1).padStart(6) : '     -'}${target != null ? `   target ${Array.isArray(target) ? target.join('–') : target}` : ''}${REAL_OLD[k] != null ? `   old ${REAL_OLD[k]}` : ''}  ${verdict}`);
    csv.push(`milestone,${k},${v != null ? (v / 60).toFixed(2) : ''},${target != null ? (Array.isArray(target) ? target.join('-') : target) : ''},${verdict},,`);
  }
  log(softLocks.length ? `SOFT-LOCK: no stop for 8+ min from ${softLocks.map((l) => `${fmt(l.from)} (stop ${l.stop})`).join(', ')}` : 'No soft-lock (a stop at least every 8 min).');
  log(`\nDry spells (nothing new affordable for 3+ min): ${stuckSpells.length ? stuckSpells.map((s) => `${(s.s / 60).toFixed(1)} min from ${fmt(s.from)}`).join('; ') : 'none'}`);
  const dead = stuckSpells.filter((s) => s.s > DEAD_LIMIT);
  log(dead.length ? `DEAD STRETCHES over 15 min: ${dead.map((s) => `${(s.s / 60).toFixed(1)} min from ${fmt(s.from)}`).join('; ')}` : 'No dead stretch over 15 min.');
  // Something new every 8–12 minutes.
  news.sort((a, b) => a.t - b.t);
  let prevNew = 0;
  const newGaps = [];
  for (const n of news) { newGaps.push({ gap: n.t - prevNew, at: n.t, what: n.what }); prevNew = n.t; }
  const longNew = newGaps.filter((g) => g.gap > NEW_EVERY[1]).sort((a, b) => b.gap - a.gap);
  log(`Something new: ${news.length} times; ${longNew.length ? `gaps over 12 min: ${longNew.slice(0, 8).map((g) => `${(g.gap / 60).toFixed(1)} min before ${g.what} at ${fmt(g.at)}`).join('; ')}` : 'never more than 12 min apart'}`);
  log('\nPurchases (time, gap, id, kind, price):');
  let prev = 0;
  const gaps = [];
  for (const b of bought) {
    gaps.push({ gap: b.t - prev, at: b.t, id: b.id });
    log(`  ${fmt(b.t)}  +${String(Math.round(b.t - prev)).padStart(4)}s  ${b.id.padEnd(22)} ${b.kind.padEnd(12)} ${b.price}`);
    csv.push(`purchase,${b.id},${(b.t / 60).toFixed(2)},,,${b.kind},${b.price}`);
    prev = b.t;
  }
  gaps.sort((a, b) => b.gap - a.gap);
  log('Longest gaps between purchases: ' + gaps.slice(0, 6).map((g) => `${Math.round(g.gap)}s before ${g.id} at ${fmt(g.at)}`).join('; '));
  if (leftover.length) log(`\nTiles left (${leftover.length}):\n  ` + leftover.join('\n  '));
  if (profile === 'average') log(`\nTargets missed: ${misses}`);
  if (errors.length) log('\nERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
  const text = lines.join('\n');
  console.log(text);
  writeFileSync(`${out}-${profile}.csv`, csv.join('\n') + '\n');
  writeFileSync(`${out}-${profile}.log`, text + '\n');
  return { profile, milestones, misses, deadStretches: dead.length };
}

function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
