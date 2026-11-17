// Renders picks-stage scenes (session 54): node scripts/assets/picks-shoot.mjs <base url> <specs dir> <out dir> [name…]
// Each <name>.json in the specs dir becomes <out>/<name>.png; triangle counts go to <out>/tris.json.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from '../store-shots-lib.mjs';

const [base, specs, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const trisPath = join(out, 'tris.json');
const tris = existsSync(trisPath) ? JSON.parse(readFileSync(trisPath, 'utf8')) : {};
const names = only.length ? only : readdirSync(specs).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 360, height: 560 }, deviceScaleFactor: Number(process.env.DSF ?? 2) });
page.on('pageerror', (e) => console.log('page error:', e.message));
for (const name of names) {
  await page.goto(`${base}/picks-stage.html?spec=specs/${name}.json`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(2200);
  const info = await page.evaluate(() => window.__info);
  if (info.errors.length) console.log(name, 'errors:', info.errors);
  Object.assign(tris, info.tris);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log('shot', name);
}
writeFileSync(trisPath, JSON.stringify(tris, null, 1));
await browser.close();
