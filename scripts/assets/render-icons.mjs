// Renders the item icons from the models into assets/icons/items.png (session 51). Needs the page built first:
// ENTRY=src/iconrender.ts OUT=iconrender.html node scripts/build.mjs && node scripts/assets/render-icons.mjs
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { launch } from '../store-shots-lib.mjs';

const root = resolve('.');
const types = { '.html': 'text/html', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? join(root, 'dist/iconrender.html') : url.startsWith('/models/') ? join(root, 'assets/models/src', url.slice(8)) : null;
  if (!file || !file.startsWith(root)) { res.writeHead(404); res.end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__iconSheet || window.__iconError, null, { timeout: 120000 });
const [sheet, error] = await page.evaluate(() => [window.__iconSheet, window.__iconError]);
await browser.close();
server.close();
if (error) throw new Error(error);
await writeFile('assets/icons/items.png', Buffer.from(sheet.split(',')[1], 'base64'));
console.log('wrote assets/icons/items.png');
