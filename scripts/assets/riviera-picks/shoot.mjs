// node shoot.mjs <dir under www> <outdir>: one tile per json, info.json alongside
import { chromium } from 'playwright';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const S = process.env.S;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 300, height: 300 } });
p.on('pageerror', (e) => console.log('err', e.message));
await p.goto('http://localhost:8765/stage.html'); await p.waitForFunction(() => window.ready);
const info = {};
for (const f of readdirSync(`${S}/www/${dir}`).filter((f) => f.endsWith('.json')).sort()) {
  const i = await p.evaluate((u) => window.show(u), `${dir}/${f}`);
  info[i.label] = i; await p.screenshot({ path: `${out}/${i.label}.png` });
}
writeFileSync(`${out}/info.json`, JSON.stringify(info, null, 1)); await b.close(); console.log('shot', Object.keys(info).length);
