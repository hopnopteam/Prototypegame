// Phase 3, the pacing simulator (a debug tool, never shipped): plays Route 1 with the autopilot, headless and
// accelerated, as a "fast" (efficient) or "average" player (30% more time idle and wandering), and reports the minutes
// of active play at each milestone against the Phase 3 bot targets, every purchase, the dry spells and the stalls.
//
// Usage: node scripts/pacing.mjs [--profile=average|fast|both] [--seeds=1,2,3] [--minutes=260] [--out=dist/pacing]
//        node scripts/pacing.mjs 900          (the old form: the first 900 seconds, fast profile)
// Each run is seeded (the game's random and Math.random), so a seed replays the same game. Runs go in parallel
// (--parallel=6). Writes <out>-<profile>-s<seed>.csv/.log per run and <out>-summary.log (median and slowest by profile).
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
const seeds = (args.seeds ?? '1').split(',').map(Number);
const parallel = Number(args.parallel ?? 6);
const out = args.out ?? 'dist/pacing';
const chunk = Number(args.chunk ?? 5);
const shotDir = args.shots;
if (shotDir) mkdirSync(shotDir, { recursive: true });
mkdirSync(dirname(resolve(out)), { recursive: true });

/** The extra idle time on top of the work, by profile (see Autopilot.idleShare). */
const IDLE = { fast: 0, average: 0.3 };

/**
 * Phase 3's Route 1 targets for the "average" bot (minutes of active play), ±10%. The bot reaches the first carriages
 * in about half a real player's time (calibrated on the legacy build), so these are set so real players land on the
 * prompt's 4 / 14 / 28 / 45 / 65 / 90 / 120 (REAL below).
 */
const TARGETS = {
  'carriage 2': 2.5, 'carriage 3': 8, 'carriage 4': 18, 'carriage 5': 38,
  'carriage 6': 65, 'carriage 7': 90, 'carriage 8': 120,
  // Owner (Phase 3): route complete may run to about 200 minutes (longer content is the goal, the publisher leans grindy).
  'route complete': [150, 200],
};
/** What real players should see (the Phase 3 prompt's targets). */
const REAL = { 'carriage 2': 4, 'carriage 3': 14, 'carriage 4': 28, 'carriage 5': 45, 'carriage 6': 65, 'carriage 7': 90, 'carriage 8': 120 };
const DEAD_LIMIT = 15 * 60;
const NEW_EVERY = [8 * 60, 12 * 60];
/** A stretch with no purchase this long while cash holds or grows is a stall (the minute 150–200 flat cash). */
const FLAT_CASH_LIMIT = 10 * 60;
/** Phase 3: a stop longer than this is flagged (owner: "no stop should run past ~3 minutes for an average player"). */
const LONG_STOP = 3 * 60;
const ORDER = [...Array.from({ length: 8 }, (_, i) => `carriage ${i + 2}`), ...Array.from({ length: 7 }, (_, i) => `level ${i + 2}`), 'all refits', 'route complete', 'everything bought'];

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const jobs = profiles.flatMap((profile) => seeds.map((seed) => ({ profile, seed })));
const reports = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async (_, lane) => {
  // Staggered starts: several pages warming up their shaders at once in the software renderer is slow.
  await new Promise((r) => setTimeout(r, lane * 20000));
  while (next < jobs.length) {
    const job = jobs[next++];
    reports.push(await run(job.profile, job.seed));
  }
}));
await browser.close();

// ─── Summary: the median and the slowest seed of each profile at every milestone ───
const summary = [];
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const fmtMin = (v) => (v == null ? '-' : (v / 60).toFixed(1));
for (const profile of profiles) {
  const rs = reports.filter((r) => r.profile === profile).sort((a, b) => a.seed - b.seed);
  summary.push(`\n=== ${profile}: ${rs.length} seed(s) (${rs.map((r) => r.seed).join(', ')}) ===`);
  summary.push(`${'milestone'.padEnd(16)}${'median'.padStart(8)}${'slowest'.padStart(9)}   target   real   verdict   per seed`);
  let misses = 0;
  for (const k of ORDER) {
    const vals = rs.map((r) => r.milestones[k]);
    const done = vals.filter((v) => v != null);
    const med = done.length === vals.length && vals.length ? median(done) : null;
    const slow = done.length === vals.length && vals.length ? Math.max(...done) : null;
    const t = TARGETS[k];
    let verdict = '';
    if (t != null && profile === 'average') {
      const [lo, hi] = Array.isArray(t) ? t : [t * 0.9, t * 1.1];
      const ok = med != null && med / 60 >= lo && med / 60 <= hi;
      if (!ok) misses++;
      verdict = ok ? 'ok' : med == null ? 'NOT REACHED' : med / 60 < lo ? 'EARLY' : 'LATE';
    }
    summary.push(`${k.padEnd(16)}${fmtMin(med).padStart(8)}${fmtMin(slow).padStart(9)}   ${String(t == null ? '' : Array.isArray(t) ? t.join('–') : t).padStart(6)}   ${String(REAL[k] ?? '').padStart(4)}   ${verdict.padEnd(9)} ${vals.map(fmtMin).join(' / ')}`);
  }
  for (const r of rs) {
    const notes = [`stops median ${r.stopStats.median} s, p90 ${r.stopStats.p90} s, max ${r.stopStats.max} s${r.longStops ? ` (${r.longStops} over 3 min)` : ''}`, `${r.hires} hired${r.unhired.length ? `, not hired: ${r.unhired.join(' ')}` : ''}`, r.watchdog.length ? `watchdog ${r.watchdog.length}× (${r.watchdog.map((w) => w.reason).join(', ')})` : '', r.dead ? `${r.dead} dead stretch(es)` : '', r.flat ? `${r.flat} flat-cash stall(s)` : '', r.locks ? `${r.locks} soft-lock(s)` : '', r.longNew ? `${r.longNew} gap(s) >12 min without something new` : ''].filter(Boolean);
    summary.push(`  seed ${r.seed}: ${notes.length ? notes.join(', ') : 'clean'}`);
  }
  if (profile === 'average') summary.push(`Targets missed (median): ${misses}`);
}
console.log(summary.join('\n'));
writeFileSync(`${out}-summary.log`, summary.join('\n') + '\n');

async function run(profile, seed) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
  // Seeded: the game's own random (`?seed=`) and Math.random (visual touches, ids), so a seed replays the same game.
  await page.addInitScript((s0) => {
    let st = s0 >>> 0;
    Math.random = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = st;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed * 7919 + 13);
  await page.goto(`file://${resolve(process.env.PAGE ?? 'dist/index.html')}?seed=${seed}`);
  await page.waitForTimeout(600);
  await page.mouse.click(195, 700);
  await page.waitForFunction(() => !!window.nightExpress, null, { timeout: 600000 });
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
  const holds = []; // what held each long stop, every 30 s past 150 s

  // The flat-cash alarm: no purchase for FLAT_CASH_LIMIT while cash holds or grows (and something is left to buy).
  let lastBuyAt = 0, cashAtLastBuy = 0;
  const flatStalls = [];
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
        // Phase 3: what holds a stop that runs long (owner: "no stop should run past ~3 minutes").
        hold: g.journey.phase === 'stationStop' && g.journey.stopTime > 150 ? (() => {
          const st = g.station;
          const who = g.guests.list.filter((x) => x.state === 'platform' || x.state === 'boarding' || (x.dayRider && x.outside));
          const n = (f) => who.filter(f).length;
          return `${Math.round(g.journey.stopTime)}s bell ${st.bellReady() ? 'ready' : st.bellRung ? 'rung' : 'not ready'}, waiting ${g.guests.waitingCount()} (to buy ${n((x) => x.state === 'platform' && !x.paid && x.ready)}, room ${n((x) => x.state === 'platform' && !x.paid && x.eligible && !x.ready)}, paid ${n((x) => x.state === 'platform' && x.paid)}, walking ${n((x) => x.state === 'boarding')}, riders ${n((x) => x.dayRider)}), blocker ${st.blocker ? st.blocker() : '-'}, event ${g.stationEvents?.active?.id ?? '-'}, guide ${g.guidance.reason}, player x ${g.player.pos.x.toFixed(1)} z ${g.player.pos.z.toFixed(1)}`;
        })() : null,
      };
    }, chunk);
    const now = snap.t;
    const defs = Object.fromEntries(snap.defs.map((d) => [d.id, d]));
    for (const id of snap.unlocked) if (!seen.has(id)) {
      seen.add(id);
      const d = defs[id] ?? { kind: id.startsWith('couple') ? 'couple' : '?', price: 0, label: id };
      bought.push({ t: now, id, kind: d.kind, price: d.price, label: d.label });
      lastBuyAt = now;
      cashAtLastBuy = snap.cash;
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
    if (snap.hold && holds.filter((h) => h.stop === snap.stop).length < 6 && (holds.length === 0 || now - holds[holds.length - 1].t >= 30 || holds[holds.length - 1].stop !== snap.stop)) holds.push({ t: now, stop: snap.stop, what: snap.hold });
    if (snap.stop !== lastStop) { lastStop = snap.stop; lastStopAt = now; }
    else if (now - lastStopAt > 8 * 60 && !softLocks.some((l) => l.from === lastStopAt)) softLocks.push({ from: lastStopAt, stop: snap.stop });
    if (snap.open > 0 && now - lastBuyAt > FLAT_CASH_LIMIT && snap.cash >= cashAtLastBuy * 0.9 && !flatStalls.some((f) => f.from === lastBuyAt)) flatStalls.push({ from: lastBuyAt, cash: snap.cash });
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
    // Route complete (the Phase 3 prompt: "Level 8 / route complete (all tier-3 upgrades)"): the whole train, every refit
    // and level 8. Everything bought (every tile) is reported too.
    if (snap.carriages >= snap.maxCarriages && refitsDone && snap.level >= 8 && milestones['route complete'] == null) milestones['route complete'] = now;
    if (snap.carriages >= snap.maxCarriages && snap.open === 0 && milestones['everything bought'] == null) milestones['everything bought'] = now;
    if (process.env.EVERY && Math.round(t) % Number(process.env.EVERY) === 0) process.stderr.write(`[${profile} s${seed}] ${fmt(now)} cash ${snap.cash} lvl ${snap.level} cars ${snap.carriages} open ${snap.open}\n`);
    const shotAt = (process.env.SHOTS ?? '').split(',').filter(Boolean).map(Number);
    if (shotDir && shotAt.some((s) => s >= t && s < t + chunk)) {
      await page.evaluate(() => { window.nightExpress.paused = false; });
      await page.waitForTimeout(700);
      await page.evaluate(() => { window.nightExpress.paused = true; });
      await page.screenshot({ path: `${shotDir}/${profile}-t${String(Math.round(t + chunk)).padStart(5, '0')}.png` });
    }
    if (milestones['route complete'] != null && (milestones['everything bought'] != null || now > (milestones['route complete'] + 30 * 60))) break;
  }
  if (stuckSince != null) {
    const s = snap.t - stuckSince;
    if (s >= 180) stuckSpells.push({ from: stuckSince, s });
    if (s > longestStuck.s) longestStuck = { s, at: stuckSince };
  }
  // Phase 3: every time the stop watchdog settled a stuck stop, and why.
  const watchdog = await page.evaluate(() => window.nightExpress.station.watchdogLog?.slice() ?? []);
  // Phase 3: every stop's length (owner: "stops should average 45–90 s, and no stop should run past ~3 minutes").
  const stops = await page.evaluate(() => window.nightExpress.station.stopLog?.slice() ?? []);
  const stopStats = statsOf(stops.map((s) => s.seconds));
  const longStops = stops.filter((s) => s.seconds > LONG_STOP);
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
  log(`=== Pacing: ${profile} player (idle +${Math.round((IDLE[profile] ?? 0) * 100)}%), seed ${seed}, ${fmt(snap.t)} played ===`);
  log(`End: level ${snap.level} (${snap.stars}★), ${snap.carriages} carriages, ${snap.open} tiles left, cash ${snap.cash}`);
  log('\nMilestones (minutes of active play):');
  const order = ORDER;
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
    log(`  ${k.padEnd(16)} ${v != null ? (v / 60).toFixed(1).padStart(6) : '     -'}${target != null ? `   target ${Array.isArray(target) ? target.join('–') : target}` : ''}${REAL[k] != null ? `   real ${REAL[k]}` : ''}  ${verdict}`);
    csv.push(`milestone,${k},${v != null ? (v / 60).toFixed(2) : ''},${target != null ? (Array.isArray(target) ? target.join('-') : target) : ''},${verdict},,`);
  }
  log(softLocks.length ? `SOFT-LOCK: no stop for 8+ min from ${softLocks.map((l) => `${fmt(l.from)} (stop ${l.stop})`).join(', ')}` : 'No soft-lock (a stop at least every 8 min).');
  const hires = bought.filter((b) => b.kind === 'hire');
  const unhired = leftover.filter((l) => l.includes('(hire,'));
  log(`Hired: ${hires.map((h) => `${h.label} ${fmt(h.t)}`).join(', ') || 'nobody'}${unhired.length ? `; not hired: ${unhired.map((l) => l.split(' (')[0]).join(', ')}` : ''}`);
  log(watchdog.length ? `WATCHDOG fired ${watchdog.length}×: ${watchdog.map((w) => `stop ${w.stop} ${w.reason} (${w.seconds} s)`).join('; ')}` : 'Watchdog never fired.');
  log(`Stops: ${stops.length}, median ${stopStats.median} s, mean ${stopStats.mean} s, 90th percentile ${stopStats.p90} s, max ${stopStats.max} s`);
  log(longStops.length ? `LONG STOPS over ${LONG_STOP / 60} min: ${longStops.map((s) => `stop ${s.stop} ${s.seconds} s (${s.carriages} cars, ${s.alighted} off, ${s.boarded} on)`).join('; ')}` : `No stop over ${LONG_STOP / 60} min.`);
  if (holds.length) log('What held the long stops:\n' + holds.map((h) => `  ${fmt(h.t)} stop ${h.stop}: ${h.what}`).join('\n'));
  log(flatStalls.length ? `FLAT-CASH STALL: no purchase for 10+ min with cash holding from ${flatStalls.map((f) => `${fmt(f.from)} (cash ${f.cash})`).join(', ')}` : 'No flat-cash stall.');
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
  if (process.env.VERBOSE) console.log(text);
  else console.log(`[${profile} s${seed}] done: ${fmt(snap.t)} played, ${snap.carriages} carriages, level ${snap.level}, ${snap.open} tiles left${softLocks.length ? `, ${softLocks.length} soft-lock(s)` : ''}${flatStalls.length ? `, ${flatStalls.length} flat-cash stall(s)` : ''}${errors.length ? `, ${errors.length} error(s)` : ''}`);
  writeFileSync(`${out}-${profile}-s${seed}.csv`, csv.join('\n') + '\n');
  writeFileSync(`${out}-${profile}-s${seed}.log`, text + '\n');
  return { profile, seed, stopStats, longStops: longStops.length, milestones, misses, dead: dead.length, flat: flatStalls.length, locks: softLocks.length, longNew: longNew.length, watchdog, hires: hires.length, unhired: unhired.map((l) => l.split(' (')[0]) };
}

/** Median, mean, 90th percentile and max of a list of seconds. */
function statsOf(values) {
  if (!values.length) return { median: 0, mean: 0, p90: 0, max: 0 };
  const v = [...values].sort((a, b) => a - b);
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { median: at(0.5), mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length), p90: at(0.9), max: v[v.length - 1] };
}

function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
