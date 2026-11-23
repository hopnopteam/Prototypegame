// Shoots each baked model on the riviera sheet stage: node scripts/assets/riviera-sheet/shoot.mjs <out dir> <id,id,...> [t]
// Needs dist/riviera-sheet.html (see stage.ts). Writes <out>/<id>.png and <out>/sizes.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from '../../store-shots-lib.mjs';

const [out, list, t = '0.62', exp = '0.8'] = process.argv.slice(2);
const ids = list.split(',');
mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`file://${resolve('dist/riviera-sheet.html')}?ids=${ids.join(',')}&t=${t}&exp=${exp}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.waitForTimeout(1500);
for (let i = 0; i < ids.length; i++) {
  await page.evaluate((k) => window.__show(k), i);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(out, `${ids[i]}.png`), clip: { x: 20, y: 160, width: 320, height: 320 } });
}
const info = await page.evaluate(() => window.__info);
if (info.errors.length) console.log('errors:', info.errors);
writeFileSync(join(out, 'sizes.json'), JSON.stringify(info.sizes, null, 1));
await browser.close();
console.log('shot', ids.length);
