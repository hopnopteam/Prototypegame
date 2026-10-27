// A visual QA tour (session 39): every carriage type at every refit tier, from the gameplay camera, one wide shot of
// the whole carriage and close shots along it, with nobody in the way (`people=0`). Contact sheets per carriage make
// a sweep of the whole train quick to read.
// Usage: ENTRY=src/preview.ts OUT=preview.html node scripts/build.mjs && node scripts/carriage-tour.mjs <outdir> [type,type…] [quality]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch } from './store-shots-lib.mjs';

const out = resolve(process.argv[2] ?? 'carriage-tour');
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const quality = process.argv[4] ?? 'high';
mkdirSync(out, { recursive: true });

const PASSENGER = ['lobby', 'sleeper'];
const TYPES = ['lobby', 'sleeper', 'cafe', 'bathroom', 'dining', 'cinema', 'bar', 'dome'];
/** Wide (the whole carriage), then close at the front, middle and back. */
const SHOTS = [
  { name: 'wide', z: 9, x: 0, zoom: 1.75 },
  { name: 'front', z: 4, x: 0.4, zoom: 0.8 },
  { name: 'mid', z: 9, x: 0.4, zoom: 0.8 },
  { name: 'back', z: 14, x: 0.4, zoom: 0.8 },
];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('page error:', e.message));
for (const type of TYPES) {
  if (only && !only.has(type)) continue;
  const tiers = PASSENGER.includes(type) ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
  for (const tier of tiers) {
    for (const s of SHOTS) {
      const url = `file://${resolve('dist/preview.html')}?train=${type}&n=1&tier=${tier}&people=0&sleeper=0&quality=${quality}&z=${s.z}&x=${s.x}&zoom=${s.zoom}&t=0.82&comforts=lamp,flowers,minibar,tv,soap,rail`;
      await page.goto(url);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${out}/${type}-t${tier}-${s.name}.png` });
    }
    console.log('done', type, tier);
  }
}
await browser.close();
