// Records what the built game actually plays: boots it in Chromium, lets the autopilot play for a while
// with sound on, taps the audio output and checks the mix. Fails (exit 1) if the theme does not decode,
// the next pass of the loop is not queued exactly one loop length after the last, the output clips, or
// the page logs an error. Writes the recording as a WAV for listening or a spectrogram.
// Usage: npm run build && npm run audit:audio [seconds=52] [out.wav]
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const seconds = Number(process.argv[2] ?? 52);
const out = process.argv[3] ?? 'dist/audio-check.wav';
const file = resolve('dist/index.html');
if (!existsSync(file)) { console.error('dist/index.html missing: run npm run build first.'); process.exit(1); }

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || /Audio/.test(t)) && !t.includes('ScriptProcessorNode is deprecated')) errors.push(t); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const failures = [];
const check = (ok, message) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`); if (!ok) failures.push(message); };

// Tap the output: every AudioContext the game makes gets a pass-through node in front of the speakers.
await page.addInitScript(() => {
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) {
      super(...args);
      const tap = super.createGain();
      tap.connect(super.destination);
      const recorder = super.createScriptProcessor(4096, 1, 1);
      window.__rec = [];
      recorder.onaudioprocess = (e) => {
        if (window.__rec.length === 0) window.__recStart = e.playbackTime;
        window.__rec.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        e.outputBuffer.getChannelData(0).fill(0);
      };
      tap.connect(recorder);
      recorder.connect(super.destination);
      Object.defineProperty(this, 'destination', { get: () => tap });
      window.__ctx = this;
    }
  };
  // When the first touch actually lands (on the audio clock): a busy start-up can hold it back on a slow renderer, and
  // the theme is judged from the touch, not from the page load.
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, () => { if (window.__touchAt === undefined && window.__ctx) window.__touchAt = window.__ctx.currentTime; }, true);
  }
  // Session 26: the music starts as the loading screen gives way to play; note when that happens on the audio clock.
  const watch = setInterval(() => {
    const loader = document.getElementById('loader');
    if (window.__ctx && document.readyState !== 'loading' && (!loader || loader.classList.contains('out'))) {
      window.__loaderOutAt = window.__ctx.currentTime;
      clearInterval(watch);
    }
  }, 20);
});

await page.goto(`file://${file}`);
// Session 26: the loading screen stays up until the shaders are compiled, the cues rendered and the first frames
// drawn; the theme is decoded behind it and starts, with a 2 s fade, as it gives way to play.
await page.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 90000 }).catch(() => undefined);
// Session 28 (owner: "turn off the background music and the train moving sound, keep all the other sounds"): a build
// without music checks that none plays and that the effects carry on alone; the theme's own checks wait for it to return.
const music = await page.evaluate(() => window.nightExpress.audio.hasMusic);
if (music) check(await page.evaluate(() => !!window.nightExpress.audio.theme), 'the theme is decoded behind the loading screen');
else check(await page.evaluate(() => window.nightExpress.audio.theme === null && !window.nightExpress.audio.bank.has('clack')), 'no theme and no rail clack in this build (music and train sound off)');
check(await page.evaluate(() => window.nightExpress.audio.prerendered), 'every cue is pre-rendered (played as a buffer, not synthesised live)');
// The pre-rendered reward jingles are whole: each rings down to silence on its own (nothing cuts it short).
const tails = await page.evaluate(() => {
  const bank = window.nightExpress.audio.bank;
  const out = {};
  for (const name of ['fanfare', 'levelup', 'perfect', 'chest', 'unlock', 'ceremony', 'cash']) {
    const cue = bank.get(name);
    if (!cue) { out[name] = null; continue; }
    const d = cue.buffer.getChannelData(0);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v));
    const n = Math.floor(cue.buffer.sampleRate * 0.05);
    let end = 0;
    for (let i = d.length - n; i < d.length; i++) end = Math.max(end, Math.abs(d[i]));
    out[name] = { seconds: cue.buffer.duration, peak, end };
  }
  return out;
});
for (const [name, t] of Object.entries(tails)) {
  check(!!t && t.end < t.peak * 0.01, `the ${name} cue rings out to silence (${t ? `${t.seconds.toFixed(2)} s, last 50 ms at ${(20 * Math.log10(t.end / t.peak + 1e-9)).toFixed(0)} dB` : 'missing'})`);
}
await page.evaluate(() => window.nightExpress.skipIntro?.());
await page.evaluate(() => { window.nightExpress.setAutopilot(true); window.nightExpress.audio.unlock(); });
if (music) await page.waitForFunction(() => window.nightExpress.audio.theme !== null, null, { timeout: 10000 }).catch(() => undefined);
check(await page.evaluate(() => window.__ctx?.state === 'running'), 'audio context runs after the first touch');
if (music) check(await page.evaluate(() => !!window.nightExpress.audio.theme), 'the theme decodes');

// Watch the queue: record when each pass of the loop starts.
await page.evaluate(() => {
  const audio = window.nightExpress.audio;
  window.__passStarts = [];
  const seen = new Set();
  setInterval(() => {
    for (const p of audio.passes) if (!seen.has(p)) { seen.add(p); window.__passStarts.push(p.at); }
  }, 100);
});
// Session 19: a stalled main thread (a slow frame on a weak phone, or the page's frames halted while the
// audio runs on) must never leave the music without its next pass. Freeze the page for 3 s mid-recording.
await page.waitForTimeout(Math.min(20, seconds / 2) * 1000);
const queuedAhead = await page.evaluate(() => {
  const a = window.nightExpress.audio;
  return a.passes.some((p) => p.at > window.__ctx.currentTime);
});
if (music) check(queuedAhead, 'the next pass of the theme is always queued ahead on the audio clock');
else check(await page.evaluate(() => window.nightExpress.audio.passes.length === 0), 'no music is queued in play');
await page.evaluate(() => { const end = performance.now() + 3000; while (performance.now() < end) { /* stall */ } });
await page.waitForTimeout(Math.max(0, seconds - Math.min(20, seconds / 2) - 3) * 1000);

const result = await page.evaluate(() => {
  const sr = window.__ctx.sampleRate;
  const chunks = window.__rec;
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  let peak = 0;
  for (const v of all) peak = Math.max(peak, Math.abs(v));
  // Loudness per second (RMS, dBFS).
  const perSecond = [];
  for (let s = 0; s + sr <= n; s += sr) {
    let sum = 0;
    for (let i = s; i < s + sr; i++) sum += all[i] * all[i];
    perSecond.push(10 * Math.log10(sum / sr + 1e-12));
  }
  // 16-bit PCM for the WAV.
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(all[i] * 32767)));
  let bin = '';
  const bytes = new Uint8Array(pcm.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { sr, n, peak, perSecond, pcm: btoa(bin), passes: window.__passStarts, loop: window.nightExpress.audio.passes.length, recStart: window.__recStart ?? 0, startAt: window.__loaderOutAt ?? window.__recStart ?? 0 };
});
// Away and back: the music fades out, the context suspends, and it all comes back on return.
{
  await page.evaluate(() => window.nightExpress.toBackground());
  await page.waitForTimeout(800);
  const away = await page.evaluate(() => ({ state: window.__ctx.state, level: window.nightExpress.audio.masterLevel }));
  await page.evaluate(() => window.nightExpress.toForeground());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ state: window.__ctx.state, level: window.nightExpress.audio.masterLevel }));
  check(away.level < 0.01 && back.state === 'running' && back.level > 0.5, `sound fades away in the background and back on return (away ${away.level.toFixed(2)}, back ${back.level.toFixed(2)} ${back.state})`);
  // A resume the browser refuses (iOS after an interruption, no gesture yet): the next tap must bring it all back.
  await page.evaluate(() => window.nightExpress.toBackground());
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const ctx = window.__ctx;
    const real = ctx.resume.bind(ctx);
    let refused = false;
    ctx.resume = () => (refused ? real() : ((refused = true), Promise.reject(new Error('not allowed'))));
    window.nightExpress.toForeground();
  });
  await page.waitForTimeout(500);
  await page.mouse.click(195, 700);
  await page.waitForTimeout(800);
  const revived = await page.evaluate(() => ({ state: window.__ctx.state, level: window.nightExpress.audio.masterLevel }));
  check(revived.state === 'running' && revived.level > 0.5, `a refused resume is revived by the next tap (${revived.state}, level ${revived.level.toFixed(2)})`);
}
// Fix list 7.1: a reward jingle is the only music while it plays: the theme ducks under it and comes back smoothly
// after, and a second jingle waits for the first to finish rather than playing on top.
{
  const first = await page.evaluate(() => {
    const a = window.nightExpress.audio;
    const ctx = window.__ctx;
    a.play('fanfare');
    const fanfareEnd = a.rewardUntil;
    a.play('levelup');
    return { now: ctx.currentTime, fanfareEnd, levelupEnd: a.rewardUntil };
  });
  check(first.levelupEnd > first.fanfareEnd + 0.5, `a second jingle waits for the first (fanfare rings out at +${(first.fanfareEnd - first.now).toFixed(2)} s, the level-up after it to +${(first.levelupEnd - first.now).toFixed(2)} s)`);
  await page.waitForTimeout(500);
  const ducked = await page.evaluate(() => window.nightExpress.audio.musicDuck.gain.value);
  if (music) check(ducked < 0.4, `the theme ducks under the jingle (${ducked.toFixed(2)})`);
  const wait = Math.ceil((first.levelupEnd - first.now) * 1000) + 2600;
  await page.waitForTimeout(wait);
  const back = await page.evaluate(() => window.nightExpress.audio.musicDuck.gain.value);
  if (music) check(back > 0.95, `the theme comes back after it (${back.toFixed(2)})`);
}
// Session 27: a reward never plays over another. Buying a room played its chime and the room's reveal a second chime
// half a second in (it read as the first one cut off); a refit's fanfare landed on its purchase chime.
{
  const r = await page.evaluate(async () => {
    const a = window.nightExpress.audio;
    const ctx = window.__ctx;
    let plays = 0;
    const pb = a.playBuffer.bind(a);
    // Only the chimes count (the autopilot plays on meanwhile: its coins and pops go through here too).
    a.playBuffer = (...args) => { if (args[0] === 'unlock') plays++; return pb(...args); };
    const t0 = ctx.currentTime;
    a.play('unlock');
    const unlockEnd = a.rewardUntil;
    await new Promise((done) => setTimeout(done, 400));
    a.play('unlock', { volume: 0.55 });
    const twice = plays;
    a.play('fanfare');
    const fanfareStart = a.rewardUntil - (a.bank.get('fanfare').dry);
    a.playBuffer = pb;
    return { twice, unlockEnd: unlockEnd - t0, fanfareStart: fanfareStart - t0 };
  });
  check(r.twice === 1, `a second purchase chime while the first rings is dropped (${r.twice} played)`);
  check(r.fanfareStart >= r.unlockEnd, `a fanfare waits for the purchase chime to ring out (chime to +${r.unlockEnd.toFixed(2)} s, fanfare from +${r.fanfareStart.toFixed(2)} s)`);
  await page.waitForTimeout(4500);
}
// A phone in a browser tab (no autoplay): the loading screen ends on "Tap to play", and that tap starts the theme.
{
  const strict = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
  const phone = await strict.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tapPage = await phone.newPage();
  // Headless Chromium lets audio start without a gesture whatever the flags say: make it as strict as a phone's
  // browser, where resume() is refused until the page has had a real user activation.
  await tapPage.addInitScript(() => {
    const Real = window.AudioContext;
    // Playwright's own evaluate() calls count as user activation, so a real (trusted) touch or click is tracked instead.
    let touched = false;
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, (e) => { if (e.isTrusted) touched = true; }, true);
    const allowed = () => touched;
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        if (!allowed()) void Real.prototype.suspend.call(this);
      }
      resume() {
        return allowed() ? Real.prototype.resume.call(this) : Promise.reject(new Error('not allowed'));
      }
    };
  });
  await tapPage.goto(`file://${file}`);
  await tapPage.waitForFunction(() => document.getElementById('loader')?.classList.contains('ready') || !document.getElementById('loader'), null, { timeout: 90000 }).catch(() => undefined);
  const asked = await tapPage.evaluate(() => !!document.getElementById('loader')?.classList.contains('ready'));
  check(asked, 'without autoplay the loading screen ends on "Tap to play"');
  if (music) check(await tapPage.evaluate(() => (window.nightExpress.audio.passes ?? []).length === 0), 'the music waits for that tap (it starts with play, not before)');
  await tapPage.touchscreen.tap(195, 700);
  await tapPage.waitForFunction((m) => window.nightExpress.audio.unlocked && (!m || window.nightExpress.audio.passes.length > 0), music, { timeout: 3000 }).catch(() => undefined);
  if (music) check(await tapPage.evaluate(() => window.nightExpress.audio.unlocked && window.nightExpress.audio.passes.length > 0), 'the tap starts the sound and the theme at once');
  else check(await tapPage.evaluate(() => window.nightExpress.audio.unlocked), 'the tap starts the sound');
  await tapPage.waitForFunction(() => !document.getElementById('loader'), null, { timeout: 3000 }).catch(() => undefined);
  check(await tapPage.evaluate(() => !document.getElementById('loader')), 'and the game is on screen');
  await strict.close();
}
await browser.close();

const loop = 48;
const gaps = result.passes.slice(1).map((t, i) => t - result.passes[i]);
console.log(`      recorded ${(result.n / result.sr).toFixed(1)} s at ${result.sr} Hz; peak ${(20 * Math.log10(result.peak)).toFixed(1)} dBFS`);
console.log(`      loudness per second (dBFS RMS): ${result.perSecond.map((v) => v.toFixed(0)).join(' ')}`);
check(result.peak < 0.99, 'the output never clips');
// From the moment the theme has started and faded in (the decode waits for the main thread, which a software
// renderer keeps busy for seconds here; on a phone it is a fraction of a second).
const FADE_IN = 2.5;
if (music) {
  const themeFrom = result.passes.length ? Math.max(0, Math.ceil(result.passes[0] - result.recStart + FADE_IN)) : 0;
  const afterStart = result.passes.length ? result.passes[0] - result.startAt : Infinity;
  check(result.passes.length > 0 && afterStart < 0.5, `the theme starts as play begins (${afterStart.toFixed(2)} s after the loading screen gives way; ${themeFrom} s into the recording)`);
  check(result.perSecond.slice(themeFrom).every((v) => v > -70), 'never silent once the theme is in (it plays under everything), even through a 3 s main-thread stall');
  const inPlay = result.perSecond.slice(themeFrom);
  const quietest = inPlay.length ? Math.min(...inPlay) : -99;
  check(quietest > -45, `the music stays audible on a phone speaker (quietest second ${quietest.toFixed(0)} dBFS RMS)`);
} else {
  // The effects alone: play goes on making its sounds (coins, pops, chimes) with nothing under them.
  const loudest = result.perSecond.length ? Math.max(...result.perSecond) : -99;
  check(result.passes.length === 0 && loudest > -45, `the effects play on their own (loudest second ${loudest.toFixed(0)} dBFS RMS, no music passes)`);
}
if (music && seconds > loop + 2) check(gaps.length >= 1 && gaps.every((g) => Math.abs(g - loop) < 0.02), `the next pass queues exactly one loop apart (gaps: ${gaps.map((g) => g.toFixed(3)).join(', ') || 'none'})`);
check(errors.length === 0, `no audio errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);

const pcm = Buffer.from(result.pcm, 'base64');
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(result.sr, 24);
header.writeUInt32LE(result.sr * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`      wrote ${out}`);
if (failures.length) { console.error(`\n${failures.length} audio check(s) failed.`); process.exit(1); }
console.log('\nAudio checks passed.');
