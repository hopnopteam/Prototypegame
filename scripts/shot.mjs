// Screenshots dist/index.html in headless Chromium. Usage:
//   node scripts/shot.mjs out.png "?query" [waitMs] [width] [height]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright');
}

const [out = 'shot.png', query = '', wait = '1500', width = '390', height = '844'] = process.argv.slice(2);
const url = `file://${resolve(process.env.PAGE ?? 'dist/index.html')}${query}`;
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
await browser.close();
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
console.log(`saved ${out}`);
