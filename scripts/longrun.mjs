// Long-session diagnostics (session 40, owner: "as the game progresses… attendants stop performing their tasks,
// passengers stop checking in, characters become stuck"). Plays the game on the autopilot for a long stretch and
// watches for anything that stops making progress: a staff member stuck in one step of a task, a helper idle while
// work waits in their carriage, a guest standing still in a state that should move, a desk queue that never moves.
// It also counts how busy the train is: guests per state, washroom visits, venue seats in use.
// Usage: node scripts/longrun.mjs [minutes=60] [page=dist/god.html]
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { launch } from './store-shots-lib.mjs';

const minutes = Number(process.argv[2] ?? 60);
const file = resolve(process.argv[3] ?? 'dist/god.html');
/** `full`: buy the whole train first (god build), then watch it run. */
const staged = process.argv[4] === 'full';
/** `hands-off`: the conductor stands still (the staff alone run the train), as when the player is busy elsewhere. */
const handsOff = process.argv[5] === 'off';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
page.setDefaultTimeout(0);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${file}?quality=low`);
await page.waitForFunction(() => window.nightExpress && !window.nightExpress.loading, null, { timeout: 180000 });

await page.evaluate(() => {
  const g = window.nightExpress;
  g.skipIntro?.();
  g.setAutopilot(true);
  const MOVING = new Set(['boarding', 'toCabin', 'toBathroom', 'returning', 'alighting', 'leaving', 'toVenue', 'strolling']);
  const d = {
    t: 0,
    staff: new Map(), guests: new Map(),
    issues: [], issueKeys: new Set(),
    idleWithWork: 0, idleSamples: 0,
    deskStuck: 0, headNotArrived: 0,
    states: {}, samples: 0, bathTrips: 0, venueBusy: 0, venueSeats: 0, perCarriage: {},
    timeline: [],
  };
  window.__diag = d;
  const issue = (key, text) => { if (d.issueKeys.has(key)) return; d.issueKeys.add(key); d.issues.push(`${Math.round(d.t)}s ${text}`); };
  g.events.on?.('guest.bathroom', () => d.bathTrips++);
  d.sample = (dt) => {
    d.t += dt;
    d.samples++;
    // Staff: stuck in one step, or idle while their carriage has work.
    for (const m of g.staff.members) {
      const key = `${m.role}_${m.carriage}`;
      const sig = m.task ? `${m.task.label}:${m.stepIndex ?? m['stepIndex']}` : 'idle';
      const prev = d.staff.get(key) ?? { sig, x: m.pos.x, z: m.pos.z, since: d.t };
      const moved = Math.hypot(m.pos.x - prev.x, m.pos.z - prev.z) > 0.05;
      if (sig !== prev.sig || moved) { prev.sig = sig; prev.since = d.t; prev.x = m.pos.x; prev.z = m.pos.z; }
      d.staff.set(key, prev);
      if (sig !== 'idle' && d.t - prev.since > 25) issue(`staff-stuck-${key}-${sig}-${Math.floor(prev.since / 60)}`, `${key} stuck ${Math.round(d.t - prev.since)}s in ${sig} at ${m.pos.x.toFixed(1)},${m.pos.z.toFixed(1)}`);
      if (m.role === 'attendant' && !m.task) {
        const dirty = g.train.cabins.filter((c) => c.carriage === m.carriage && c.unlocked && c.isDirty && !c.guest && !c.cleaner).length;
        d.idleSamples++;
        if (dirty > 0) { d.idleWithWork++; prev.idleWork = (prev.idleWork ?? 0) + dt; if (prev.idleWork > 20) issue(`att-idle-${key}-${Math.floor(d.t / 120)}`, `${key} idle ${Math.round(prev.idleWork)}s with ${dirty} dirty rooms`); }
        else prev.idleWork = 0;
      }
    }
    // Guests: standing still in a moving state, or any state for very long.
    const seen = new Set();
    for (const guest of g.guests.list) {
      seen.add(guest.id);
      d.states[guest.state] = (d.states[guest.state] ?? 0) + 1;
      const car = Math.max(0, Math.floor(guest.pos.z / 18.6));
      d.perCarriage[car] = (d.perCarriage[car] ?? 0) + 1;
      const prev = d.guests.get(guest.id) ?? { state: guest.state, x: guest.pos.x, z: guest.pos.z, since: d.t };
      const moved = Math.hypot(guest.pos.x - prev.x, guest.pos.z - prev.z) > 0.05;
      if (guest.state !== prev.state || moved) { prev.state = guest.state; prev.since = d.t; prev.x = guest.pos.x; prev.z = guest.pos.z; }
      d.guests.set(guest.id, prev);
      const still = d.t - prev.since;
      if (MOVING.has(guest.state) && still > 20) issue(`guest-stuck-${guest.id}-${guest.state}`, `guest ${guest.id} (${guest.archetype.id}) still ${Math.round(still)}s in ${guest.state} at ${guest.pos.x.toFixed(1)},${guest.pos.z.toFixed(1)} moving=${guest.mover.isMoving}`);
      if (guest.state === 'queue' && still > 120) issue(`guest-queue-${guest.id}`, `guest ${guest.id} in the desk queue ${Math.round(still)}s (slot ${guest.queueSlot}, arrived ${guest.arrivedInQueue}, cls ${guest.cls}, room ${!!g.train.roomFor(guest.cls)})`);
    }
    for (const id of [...d.guests.keys()]) if (!seen.has(id)) d.guests.delete(id);
    // The desk: someone could be checked in but nobody is.
    const q = g.guests.queue;
    if (q.length && !q[0].arrivedInQueue && q[0].state === 'queue') { d.headNotArrived += dt; if (d.headNotArrived > 20) issue(`head-${q[0].id}`, `desk head ${q[0].id} never arrived (state ${q[0].state}, moving ${q[0].mover.isMoving})`); } else d.headNotArrived = 0;
    for (const v of g.venues.list ?? []) { d.venueSeats += v.seats.filter((s) => s.state !== 'locked').length; d.venueBusy += v.seats.filter((s) => s.guest).length; }
  };
  d.snapshot = () => ({
    t: Math.round(d.t), cars: g.train.count, types: g.train.types.join(','), tiers: g.train.tiers.join(''), lvl: g.progression.level,
    guests: g.guests.list.length, day: g.guests.dayRiders(), queue: g.guests.queue.length, staff: g.staff.members.map((m) => `${m.role[0]}${m.carriage}:${m.task?.label ?? '-'}`).join(' '),
    states: Object.fromEntries(Object.entries(g.guests.list.reduce((a, x) => (a[x.state] = (a[x.state] ?? 0) + 1, a), {}))),
    dirty: g.train.cabins.filter((c) => c.unlocked && c.isDirty && !c.guest).length,
    rooms: `${g.train.cabins.filter((c) => c.unlocked && c.guest).length}/${g.train.cabins.filter((c) => c.unlocked).length}`,
  });
});

if (staged) {
  await page.evaluate(() => {
    const g = window.nightExpress;
    g.devAddStars(40000);
    g.econ.tiles.maxRefits = 20;
    g.econ.tiles.maxVisible = 40;
    for (let i = 0; i < 1500; i++) {
      for (const [id, entry] of [...g.tiles.entries]) {
        if (!g.unlocks.isAvailable(id) || g.train.growing) continue;
        g.unlocks.pay(id, g.unlocks.remaining(id));
        g.tiles.complete(entry);
      }
      g.simulate(2);
      for (const b of document.querySelectorAll('.sheet .close')) b.click();
      for (const b of document.querySelectorAll('.scrim .btn')) if (/Collect|Continue|OK|Nice|Great|Claim/i.test(b.textContent)) b.click();
      if (g.train.count >= 9 && g.tiles.entries.size === 0) break;
    }
    window.__diag.t = 0;
    window.__diag.issues.length = 0;
  });
  if (handsOff) await page.evaluate(() => window.nightExpress.setAutopilot(false));
  console.log('staged', JSON.stringify(await page.evaluate(() => window.__diag.snapshot())));
}
const total = minutes * 60;
for (let done = 0; done < total; done += 60) {
  const snap = await page.evaluate(() => {
    const g = window.nightExpress;
    const d = window.__diag;
    for (let i = 0; i < 30; i++) { g.simulate(2); d.sample(2); }
    for (const b of document.querySelectorAll('.sheet .close')) b.click();
    for (const b of document.querySelectorAll('.scrim .btn')) if (/Collect|Continue|OK|Nice|Great|Claim/i.test(b.textContent)) b.click();
    return d.snapshot();
  });
  console.log(JSON.stringify(snap));
}
const report = await page.evaluate(() => {
  const d = window.__diag;
  const share = Object.fromEntries(Object.entries(d.states).map(([k, v]) => [k, +(v / d.samples).toFixed(1)]));
  return { issues: d.issues, avgGuestsByState: share, perCarriage: Object.fromEntries(Object.entries(d.perCarriage).map(([k, v]) => [k, +(v / d.samples).toFixed(1)])), idleWithWorkShare: +(d.idleWithWork / Math.max(1, d.idleSamples)).toFixed(2), venueOccupancy: +(d.venueBusy / Math.max(1, d.venueSeats)).toFixed(2), audit: window.nightExpress.guests.audit };
});
console.log('\nISSUES (' + report.issues.length + '):');
for (const i of report.issues) console.log('  ' + i);
console.log('\nAverage guests by state:', JSON.stringify(report.avgGuestsByState));
console.log('Average guests per carriage:', JSON.stringify(report.perCarriage));
console.log('Attendants idle with work waiting:', report.idleWithWorkShare, ' venue occupancy:', report.venueOccupancy);
console.log('Guest audit:', JSON.stringify(report.audit));
console.log('Page errors:', errors.length ? errors.slice(0, 5) : 'none');
writeFileSync(resolve('dist/longrun.json'), JSON.stringify(report, null, 1));
await browser.close();
