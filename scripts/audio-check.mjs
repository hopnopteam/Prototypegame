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
});

await page.goto(`file://${file}`);
await page.waitForTimeout(800);
await page.mouse.click(195, 700);
await page.evaluate(() => window.nightExpress.skipIntro?.());
await page.waitForFunction(() => !document.querySelector('.splash'), null, { timeout: 3000 }).catch(() => undefined);
await page.evaluate(() => { window.nightExpress.setAutopilot(true); window.nightExpress.audio.unlock(); });
await page.waitForFunction(() => window.nightExpress.audio.theme !== null, null, { timeout: 10000 }).catch(() => undefined);
check(await page.evaluate(() => window.__ctx?.state === 'running'), 'audio context runs after the first touch');
check(await page.evaluate(() => !!window.nightExpress.audio.theme), 'the theme decodes');

// Watch the queue: record when each pass of the loop starts.
await page.evaluate(() => {
  const audio = window.nightExpress.audio;
  window.__passStarts = [];
  const seen = new Set();
  setInterval(() => {
    for (const p of audio.passes) if (!seen.has(p)) { seen.add(p); window.__passStarts.push(p.at); }
  }, 100);
});
await page.waitForTimeout(seconds * 1000);

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
  return { sr, n, peak, perSecond, pcm: btoa(bin), passes: window.__passStarts, loop: window.nightExpress.audio.passes.length, recStart: window.__recStart ?? 0 };
});
await browser.close();

const loop = 48;
const gaps = result.passes.slice(1).map((t, i) => t - result.passes[i]);
console.log(`      recorded ${(result.n / result.sr).toFixed(1)} s at ${result.sr} Hz; peak ${(20 * Math.log10(result.peak)).toFixed(1)} dBFS`);
console.log(`      loudness per second (dBFS RMS): ${result.perSecond.map((v) => v.toFixed(0)).join(' ')}`);
check(result.peak < 0.99, 'the output never clips');
// From the moment the theme has started and faded in (the decode waits for the main thread, which a software
// renderer keeps busy for seconds here; on a phone it is a fraction of a second).
const FADE_IN = 2.5;
const themeFrom = result.passes.length ? Math.max(0, Math.ceil(result.passes[0] - result.recStart + FADE_IN)) : 0;
check(result.passes.length > 0 && themeFrom < 10, `the theme starts soon after the first touch (${themeFrom} s in, fade included)`);
check(result.perSecond.slice(themeFrom).every((v) => v > -70), 'never silent once the theme is in (it plays under everything)');
if (seconds > loop + 2) check(gaps.length >= 1 && gaps.every((g) => Math.abs(g - loop) < 0.02), `the next pass queues exactly one loop apart (gaps: ${gaps.map((g) => g.toFixed(3)).join(', ') || 'none'})`);
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
