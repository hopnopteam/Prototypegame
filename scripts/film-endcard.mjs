// The ad cuts' end card (owner: "go with what's best"): the game's name and a call to play over a soft blur of the
// cut's last frame, drawn in the game's own type (Playfair Display for the name, Jost for the words) at the film's
// size. Called by scripts/transition-film.py; no store badges (the store pages add their own).
//
// Usage: node scripts/film-endcard.mjs <background.jpg> <out.png> <width> <height>
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const [bg, out, w = '780', h = '1688'] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const font = (p) => readFileSync(resolve('node_modules', p)).toString('base64');
const serif = font('@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2');
const sans = font('@fontsource-variable/jost/files/jost-latin-wght-normal.woff2');
const image = readFileSync(resolve(bg)).toString('base64');
// Sizes in CSS pixels of a 390-wide phone, scaled to the film.
const k = W / 390;
const html = `<!doctype html><html><head><style>
@font-face { font-family: Serif; src: url(data:font/woff2;base64,${serif}) format('woff2'); font-weight: 700; }
@font-face { font-family: Jost; src: url(data:font/woff2;base64,${sans}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #0E1626; }
.bg { position: absolute; inset: -${40 * k}px; background: url(data:image/jpeg;base64,${image}) center/cover; filter: blur(${10 * k}px) brightness(0.55) saturate(1.1); }
.shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(14,22,38,0.1), rgba(14,22,38,0.75)); }
.card { position: absolute; left: 0; right: 0; top: 36%; text-align: center; color: #FBF3E2; font-family: Jost; }
.kicker { font-weight: 600; font-size: ${13 * k}px; letter-spacing: 0.32em; text-transform: uppercase; color: #E8C77A; }
.rule { width: ${120 * k}px; height: ${1.5 * k}px; margin: ${12 * k}px auto; background: linear-gradient(90deg, transparent, #E8C77A, transparent); }
.name { font-family: Serif; font-weight: 700; font-size: ${50 * k}px; line-height: 1; letter-spacing: 0.01em; text-shadow: 0 ${3 * k}px ${14 * k}px rgba(0,0,0,0.45); }
.line { margin-top: ${14 * k}px; font-weight: 500; font-size: ${17 * k}px; color: #EADFC8; }
.play { display: inline-block; margin-top: ${34 * k}px; padding: ${13 * k}px ${40 * k}px; border-radius: ${30 * k}px;
  background: linear-gradient(#F6D27A, #E0A93B); color: #3A2410; font-weight: 700; font-size: ${21 * k}px;
  box-shadow: 0 ${4 * k}px 0 #A06A1C, 0 ${10 * k}px ${24 * k}px rgba(0,0,0,0.4); }
</style></head><body><div class="bg"></div><div class="shade"></div>
<div class="card"><div class="kicker">The sleeper train game</div><div class="rule"></div><div class="name">Night Express</div>
<div class="line">Build the most famous train in the world</div><div class="play">Play free</div></div></body></html>`;

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
