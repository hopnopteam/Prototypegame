// The Grand Departure as a film (Stage B): the line transition on a finished Route 1 train, recorded frame by frame
// at a high resolution and a steady frame rate, with the game's own sounds laid on a track at the moments it played
// them. Unlike the walkthrough (scripts/transition-walkthrough.mjs: a review of the whole flow with time-lapsed play),
// this is the sequence alone, for the owner and for ad cuts.
//
// Usage: node scripts/transition-film.mjs <outdir> [--fps=30] [--scale=2] [--quality=high]
// Then:  python3 scripts/transition-film.py <outdir>   (encodes the film, the 30 s and 15 s cuts)
//
// Why it is smooth: the page runs in lockstep (`?capture=1`, the game steps only when told), every page timer runs on
// Playwright's fake clock advanced by exactly one frame, and every CSS animation and transition is paused and moved
// on by exactly one frame too (they run on real time otherwise, which is what made the Stage A recording judder).
// The reload in the tunnel's dark is cut out (nothing is on screen then), so the film runs straight from the dark to
// the burst.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;
const out = resolve(process.argv[2] ?? 'dist/film');
const args = Object.fromEntries(process.argv.slice(3).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const FPS = Number(args.fps ?? 30);
const SCALE = Number(args.scale ?? 2);
const QUALITY = args.quality ?? 'high';
const DT = 1 / FPS;
const PAGE = resolve(process.env.PAGE ?? 'dist/index.html');
mkdirSync(`${out}/frames`, { recursive: true });
mkdirSync(`${out}/cues`, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[(Transition|Route)\]/.test(m.text())) console.log(m.text()); });

let frame = 0;
const cues = [];
const beats = [];

/** After every boot: lockstep, the film's styling (no Skip button, no debug corner), the sound log, the CSS clock. */
async function setUp() {
  await page.evaluate((frameNo) => {
    const g = window.nightExpress;
    g.lockstep = true;
    g.skipIntro?.();
    const style = document.createElement('style');
    style.textContent = '.gd-skip, .gd-corner, .perf-overlay { display: none !important; }';
    document.head.appendChild(style);
    window.__frame = frameNo;
    window.__cues = [];
    const audio = g.audio;
    const play = audio.play.bind(audio);
    audio.play = (name, options = {}) => {
      // What the game would play (while a cinematic hushes the world, only the sequence's own cues).
      if (!audio.hushed || options.through) window.__cues.push({ frame: window.__frame, name, volume: options.volume ?? 1, pitch: options.pitch ?? 1 });
      play(name, options);
    };
    // Every CSS animation and transition is held and moved on by hand, one frame at a time.
    window.__stepCss = (ms) => {
      for (const a of document.getAnimations()) {
        if (a.playState === 'finished') continue;
        if (a.playState !== 'paused') a.pause();
        a.currentTime = (a.currentTime ?? 0) + ms;
      }
    };
  }, frame);
}

/** The bank of pre-rendered cues, written out once as raw float WAVs the encoder mixes from. */
async function dumpCues() {
  const bank = await page.evaluate(async () => {
    const a = window.nightExpress.audio;
    await a.ready?.();
    const cfg = a.config;
    const outBank = {};
    for (const [name, cue] of a.bank) {
      const b = cue.buffer;
      const chans = [];
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        let s = '';
        const bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        chans.push(btoa(s));
      }
      const rule = cfg.cues[name] ?? cfg.defaultCue;
      outBank[name] = { rate: b.sampleRate, chans, level: cfg.ladder[rule.level] ?? 0.55, cooldown: rule.cooldown ?? 0.025 };
    }
    return { bank: outBank, master: cfg.mix.master, sfx: cfg.mix.sfx };
  });
  for (const [name, cue] of Object.entries(bank.bank)) {
    const chans = cue.chans.map((b64) => Buffer.from(b64, 'base64'));
    writeFileSync(`${out}/cues/${name}.json`, JSON.stringify({ rate: cue.rate, level: cue.level, cooldown: cue.cooldown, channels: chans.length }));
    chans.forEach((buf, i) => writeFileSync(`${out}/cues/${name}.${i}.f32`, buf));
  }
  return { master: bank.master, sfx: bank.sfx, count: Object.keys(bank.bank).length };
}

async function boot(url) {
  await page.goto(url);
  await page.waitForTimeout(400);
  await page.mouse.click(195, 760);
  await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
}

/** One frame: the page's timers, the game and its CSS all move by DT; then the screenshot. */
async function shot() {
  await page.clock.runFor(Math.round(DT * 1000));
  const st = await page.evaluate((dt) => {
    const g = window.nightExpress;
    window.__frame += 1;
    g.captureFrame(dt);
    window.__stepCss(dt * 1000);
    const lt = g.lineTransition;
    return { beat: lt.beatName, s: lt.seconds, bt: lt.beatSeconds, sheet: !!document.querySelector('.scrim'), cues: window.__cues.splice(0) };
  }, DT);
  cues.push(...st.cues);
  await page.screenshot({ path: `${out}/frames/f${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
  frame++;
  if (beats.length === 0 || beats[beats.length - 1].beat !== st.beat) beats.push({ frame, beat: st.beat });
  return st;
}
async function play(seconds, until) {
  let st;
  for (let i = 0; i < Math.round(seconds * FPS); i++) {
    st = await shot();
    if (until && (await until(st))) break;
  }
  return st;
}
const click = (selector, re) => page.evaluate(({ selector, re }) => {
  const r = re ? new RegExp(re) : null;
  const el = [...document.querySelectorAll(selector)].find((b) => !r || r.test(b.textContent ?? ''));
  if (el) el.click();
  return !!el;
}, { selector, re: re?.source ?? null });

// ─── Prepare the finished train (not recorded) ────────────────────────────────
// A Debug jump builds the full Route 1 train (every carriage at its top tier, every helper hired); its save becomes
// the real save at the route's last level, so the real flow runs: the grand station, the front page, the offer, the
// lever, the tunnel, the reload onto the Riviera, the arrival, the chest and the postcard.
await page.goto(`file://${PAGE}`);
await page.evaluate(() => localStorage.clear());
await boot(`file://${PAGE}?jump=8:3:s&quality=low`);
await page.evaluate(() => {
  const g = window.nightExpress;
  g.lockstep = true;
  const d = g.data;
  d.route.level = 8;
  d.route.stars = 4700;
  d.wallet.gems = 42;
  d.wallet.railMiles = 18;
  d.profile.flags.coach_done = true;
  d.press.trainName = 'The Night Owl';
  g.save.saveNow();
  localStorage.setItem('nightexpress.save', localStorage.getItem('nightexpress.save.jump'));
  localStorage.removeItem('nightexpress.jump');
});
await page.clock.install({ time: new Date('2026-11-20T19:00:00Z') });
await boot(`file://${PAGE}?capture=1&quality=${QUALITY}`);
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
await setUp();
const mix = await dumpCues();
console.log('cues', mix, await page.evaluate(() => ({ complete: window.nightExpress.routeLine.complete, carriages: window.nightExpress.train.count })));
// A few seconds of the train settling (people find their places, the light bake finishes), not recorded.
await page.evaluate(() => { const g = window.nightExpress; for (let i = 0; i < 240; i++) g.captureFrame(1 / 60); });
await page.evaluate(() => { window.__cues.length = 0; window.nightExpress.routeLine.grandStation(); });

// ─── The film ────────────────────────────────────────────────────────────────
await play(20, (st) => st.sheet);                // the hero shot, up to the front page
await play(2.2);                                  // read it
await click('.scrim .btn', /Collect|Continue|Read/);
await click('.scrim [data-default]');
await play(4, async () => page.evaluate(() => !!document.querySelector('.nextline-sheet')));
await play(2.6);                                  // the golden ticket
await click('.nextline-sheet .btn.primary');
await play(12, (st) => st.beat === 'lever' && st.bt > 1.6);
// The drag, at the speed a thumb pulls a heavy lever (heavy, then it gives).
const box = await page.evaluate(() => {
  const el = document.querySelector('.gd-lever');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height * 0.3, h: r.height } : { x: 200, y: 430, h: 240 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
const pull = Math.round(0.7 * FPS);
for (let i = 1; i <= pull; i++) {
  const k = i / pull;
  await page.mouse.move(box.x, box.y + box.h * 0.75 * (k < 0.62 ? k * 0.7 : 0.434 + (k - 0.62) * 1.49));
  await shot();
}
await page.mouse.up();
let reloaded = false;
try {
  await play(40, (st) => st.beat === 'dark' && st.bt > 0.6);
  await play(6);
} catch {
  reloaded = true;
}
// The page reloads in the tunnel's dark; the film carries on from the dark on the other side.
if (!reloaded) console.log('no reload seen');
const cut = frame;
await page.clock.resume();
await page.waitForFunction(() => window.nightExpress?.booted, null, { timeout: 300000 });
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
await setUp();
await play(40, (st) => st.beat === 'chest' && st.bt > 2.4);
await click('.gd-collect');
await play(4.5);
await play(3);

writeFileSync(`${out}/film.json`, JSON.stringify({ fps: FPS, scale: SCALE, quality: QUALITY, frames: frame, reloadCut: cut, beats, cues, mix, errors }, null, 2));
console.log('frames', frame, 'cues', cues.length, 'errors', errors.length, errors.slice(0, 5));
await browser.close();
