// The Grand Departure's walkthrough recording (Stage A and Stage B): the real game, frame by frame, from a save near
// the end of Route 1 through the line transition and the first minutes on the Riviera, then a replay skipped at the
// depot. Writes JPEG frames, a timeline (chapters, captions, beat timings, numbers) and an ASS subtitle file; the
// video is assembled by scripts/transition-video.sh.
//
// Usage: node scripts/transition-walkthrough.mjs <outdir> [--fps=15] [--quality=low]
//
// The near-end save is prepared before the recording starts (a Debug jump builds the train, its save is copied to the
// real save and the jump cleared); nothing inside the recording uses the Debug sheet. The page runs in lockstep on a
// fake clock (Playwright's), so the game, its timers and the recording move together.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;
const out = resolve(process.argv[2] ?? 'dist/walkthrough');
const args = Object.fromEntries(process.argv.slice(3).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const FPS = Number(args.fps ?? 10);
const QUALITY = args.quality ?? 'low';
const DT = 1 / FPS;
const PAGE = resolve(process.env.PAGE ?? 'dist/index.html');
mkdirSync(`${out}/frames`, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[(Transition|Route)\]/.test(m.text())) console.log(m.text()); });

const timeline = { fps: FPS, chapters: [], captions: [], marks: [], numbers: {} };
let frame = 0;
const now = () => frame / FPS;
const chapter = (title) => { timeline.chapters.push({ at: now(), title }); console.log(`[${now().toFixed(1)}] chapter: ${title}`); };
const caption = (text, seconds = 5) => { timeline.captions.push({ at: now(), until: now() + seconds, text }); console.log(`[${now().toFixed(1)}] caption: ${text}`); };
const mark = (name, data = {}) => timeline.marks.push({ at: now(), name, ...data });

async function boot(url) {
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.mouse.click(195, 760);
  await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
}

// ─── 1. Prepare the near-end save (not recorded) ───────────────────────────────
await page.goto(`file://${PAGE}`);
await page.evaluate(() => localStorage.clear());
await boot(`file://${PAGE}?jump=7:3:s&quality=${QUALITY}`);
const prepared = await page.evaluate(() => {
  const g = window.nightExpress;
  g.lockstep = true;
  const d = g.data;
  d.route.level = 7;
  d.route.stars = 4570;
  d.wallet.cash = 6400;
  d.wallet.gems = 42;
  d.wallet.railMiles = 18;
  d.conductor = { speed: 2, capacity: 2, fareBonus: 1 };
  d.profile.flags.coach_done = true;
  d.press.trainName = 'The Night Owl';
  g.save.saveNow();
  const raw = localStorage.getItem('nightexpress.save.jump');
  localStorage.setItem('nightexpress.save', raw);
  localStorage.removeItem('nightexpress.jump');
  return { carriages: d.route.carriages.length, level: d.route.level };
});
console.log('prepared', prepared);

// ─── 2. The recording ──────────────────────────────────────────────────────────
await page.clock.install({ time: new Date('2026-11-20T18:00:00Z') });
await boot(`file://${PAGE}?capture=1&gdlabel=1&quality=${QUALITY}`);
const pause = async () => page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
await pause();
const cdp = await context.newCDPSession(page);
await cdp.send('Animation.enable').catch(() => undefined);

let lastReal = Date.now();
/** One recorded frame: the clock and the game move by DT, the page is drawn, a screenshot is kept. */
async function shot(state = {}, speed = 1) {
  // CSS animations follow the recording (they run on real time otherwise).
  const real = Math.max(0.05, (Date.now() - lastReal) / 1000);
  lastReal = Date.now();
  await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, DT / real) }).catch(() => undefined);
  await page.clock.runFor(Math.round(DT * speed * 1000));
  const st = await page.evaluate(({ dt, speed }) => {
    const g = window.nightExpress;
    // A time-lapse (long stretches of ordinary play): the steps in between are simulated, only the last one drawn.
    if (speed > 1) g.simulate(dt * (speed - 1));
    g.captureFrame(dt);
    const lt = g.lineTransition;
    return { beat: lt.beatName, s: lt.seconds, bt: lt.beatSeconds, level: g.progression.level, carriages: g.train.count, phase: g.journey.phase, sheet: !!document.querySelector('.scrim'), route: g.data.route.id };
  }, { dt: DT, speed });
  await page.screenshot({ path: `${out}/frames/f${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 84 });
  frame++;
  Object.assign(state, st);
  return st;
}
/** Plays `seconds` of game time (at `speed`×, a time-lapse), one recorded frame per 1/FPS of video. */
async function play(seconds, each, speed = 1) {
  let st;
  for (let i = 0; i < Math.round((seconds * FPS) / speed); i++) {
    st = await shot({}, speed);
    if (each && (await each(st, i))) break;
  }
  return st;
}
const click = async (selector, textRe) => page.evaluate(({ selector, re }) => {
  const r = re ? new RegExp(re) : null;
  const el = [...document.querySelectorAll(selector)].find((b) => !r || r.test(b.textContent ?? ''));
  if (el) el.click();
  return !!el;
}, { selector, re: textRe?.source ?? null });
const autopilot = (on) => page.evaluate((on) => window.nightExpress.setAutopilot(on), on);
/** Cards the autopilot meets along the way (level up, front pages): read for a moment, then answered. */
async function answerCards(st, holdFrames = 45) {
  if (!st.sheet) return false;
  if (await page.evaluate(() => !!document.querySelector('.nextline-sheet'))) return false;
  await play(holdFrames / FPS);
  await click('.scrim .btn', /^(Collect|Continue|Claim|OK|Nice!|Great!|Hooray!)/);
  await click('.scrim [data-default]');
  return true;
}

// Chapter 1: ordinary play near the end of the route.
chapter('Gameplay before the gate (×3 time-lapse)');
caption('Near the end of Route 1: 7 of 8 carriages, Level 7. Ordinary play: serving, a station stop, upgrades.', 6);
await autopilot(true);
await play(4);
caption('The tease: a tunnel portal to the Riviera Coast Line passes by the lake, its signal at red.', 6);
await play(24, (st) => answerCards(st), 3);
caption('The route map: the Riviera glows, with what opens it and how far along you are.', 5);
await page.evaluate(() => window.nightExpress.ui.screens.routeMap());
await play(5);
await click('.scrim header .close');
caption('Station posters: "Coming soon: the Riviera".', 4);
await play(45, (st) => answerCards(st), 3);

// Chapter 2: the gate.
chapter('Reaching the gate (×3 time-lapse)');
caption('The last coupling and Level 8: the route is complete (all 8 carriages and Level 8).', 6);
let completeAt = null;
await play(240, async (st) => {
  await answerCards(st);
  if (completeAt === null && st.carriages >= 8 && st.level >= 8) {
    completeAt = now();
    mark('routeComplete');
    caption('Route complete. The next station is the grand station.', 5);
  }
  return st.beat === 'hero';
}, 3);
chapter('The hero shot');
caption('Look what you built: the camera pulls back along the whole train, fireworks over the lake.', 6);
await play(8, (st) => st.sheet);
caption('Then the front page: "Countryside Express Restored!"', 5);
await play(5);
await click('.scrim .btn', /Collect|Continue/);
await click('.scrim [data-default]');

// Chapter 3: the offer.
chapter('The offer');
await play(1.5);
caption('The golden ticket. Comes along: gems, Rail Miles, conductor upgrades. Stays behind: fares, the train, its staff and upgrades.', 8);
await play(8);
caption('"Not yet": the player stays on the route and keeps playing.', 4);
await click('.nextline-sheet [data-default]');
await play(5);
caption('The rail button brings the offer back.', 4);
await click('.side .nextline');
await play(3);
mark('board');
await click('.nextline-sheet .btn.primary');

// Chapter 4: the sequence.
chapter('The line transition');
const seq0 = now();
timeline.numbers.sequenceStart = seq0;
await play(20, (st) => st.beat === 'lever');
caption('Pull the lever. If the player waits, a hand shows how.', 6);
await play(6.2);
// The drag: heavy at first, then it gives.
await page.mouse.move(200, 430);
await page.mouse.down();
for (let i = 1; i <= 16; i++) {
  await page.mouse.move(200, 430 + i * 15);
  await shot();
}
await page.mouse.up();
mark('leverPulled');
caption('Clunk: the points switch onto the branch line and the signal turns green.', 4);
await play(2.5);
caption('The depot: the Countryside carriages roll into the engine shed, the doors close, a plaque reads "preserved".', 7);
await play(30, (st) => st.beat === 'depot' && st.bt > 6.9);
caption('The Riviera\'s first carriage rolls up under a sandy tarp, couples on, and the tarp blows off.', 5);
let reloaded = false;
await play(30, (st) => st.beat === 'tunnel');
caption('Into the tunnel: the train pulls away through the points, the sky turns to dawn.', 6);
try {
  await play(30);
} catch (e) {
  reloaded = true;
}
// The page reloads in the tunnel's dark (the save was written just before).
caption('The page reloads here, hidden in the tunnel. The save was written just before it.', 5);
timeline.numbers.reloadAt = now();
const reloadStart = Date.now();
await page.clock.resume();
await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 }).catch(async () => {
  await page.waitForTimeout(2000);
});
timeline.numbers.reloadSeconds = (Date.now() - reloadStart) / 1000;
for (let i = 0; i < Math.round(1.2 * FPS); i++) {
  await page.screenshot({ path: `${out}/frames/f${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 84 });
  frame++;
}
await pause();
lastReal = Date.now();
caption('Out of the dark: a circle of light, a flash, and the coast.', 5);
await play(20, (st) => st.beat === 'arrival');
caption('Arrival at Porto Sole: the welcome arch, torches, the band and the locals; the livery sweep and the new name plate.', 7);
await play(20, (st) => st.beat === 'chest');
const before = await page.evaluate(() => ({ gems: window.nightExpress.wallet.get('gems'), railMiles: window.nightExpress.wallet.get('railMiles') }));
caption('The line-complete chest (from the route config), and what you brought along.', 6);
await play(4);
await click('.gd-collect');
const after = await page.evaluate(() => {
  const g = window.nightExpress;
  return { gems: g.wallet.get('gems'), railMiles: g.wallet.get('railMiles'), route: g.data.route.id, conductor: g.data.conductor, cash: g.wallet.get('cash'), postcards: g.data.meta.postcards, arrival: g.data.lineArrival, timings: g.lineTransition.timings, seconds: g.lineTransition.seconds };
});
timeline.numbers.chest = { before, after };
caption('A postcard of the finished Countryside train goes into the album.', 5);
await play(5);
timeline.numbers.beats = after.timings;
timeline.numbers.sequenceSeconds = after.seconds;

// Chapter 5: the Riviera.
chapter('Gameplay after arriving (×3 time-lapse)');
caption('The first minutes on the Riviera: a new train under its tarp, the first guests, the first purchase.', 6);
await autopilot(true);
await play(75, (st) => answerCards(st), 3);
caption('The route map: the Countryside Express complete, the Riviera now travelling.', 5);
await page.evaluate(() => window.nightExpress.ui.screens.routeMap());
await play(4);
caption('The postcard album: the finished train, and a silhouetted slot for the next one.', 5);
await click('.routemap-sheet .btn', /Postcard album/);
await play(5);
await click('.scrim header .close');
await play(1);

// Chapter 6: a replay, skipped at the depot (the Debug sheet's replay plays the same sequence touching no progress).
chapter('A replay skipped at the depot (the Winter City placeholder)');
caption('A replay from the Debug sheet, with the Riviera → Winter City placeholder settings (stand-in art), skipped at the depot. A preview touches no progress.', 7);
const replayBefore = await page.evaluate(() => ({ gems: window.nightExpress.wallet.get('gems'), railMiles: window.nightExpress.wallet.get('railMiles'), route: window.nightExpress.data.route.id }));
await autopilot(false);
await page.evaluate(() => window.nightExpress.routeLine.preview('riviera'));
await play(9, (st) => st.sheet);
await click('.scrim .btn.primary', /Open the/);
await play(10, (st) => st.beat === 'lever');
await play(1.5);
await page.evaluate(() => window.nightExpress.lineTransition.throwLever());
await play(4, (st) => st.beat === 'depot');
await play(1);
caption('Skip ›', 2);
await click('.gd-skip');
try {
  await play(6);
} catch {
  // The reload.
}
await page.clock.resume();
await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
await pause();
lastReal = Date.now();
await play(2);
await click('.gd-skip');
await play(3, (st) => st.beat === 'chest');
await play(2);
await click('.gd-collect');
await play(4);
const replayAfter = await page.evaluate(() => ({ gems: window.nightExpress.wallet.get('gems'), railMiles: window.nightExpress.wallet.get('railMiles'), route: window.nightExpress.data.route.id }));
timeline.numbers.replay = { before: replayBefore, after: replayAfter };
chapter('End');

timeline.numbers.frames = frame;
timeline.numbers.errors = errors;
writeFileSync(`${out}/timeline.json`, JSON.stringify(timeline, null, 2));
console.log('frames', frame, 'errors', errors.length, errors.slice(0, 5));
await browser.close();
