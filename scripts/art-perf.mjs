// Visual overhaul (Phase V1): render cost per quality tier and look, in three scenes (the Millbrook platform, a
// Countryside train of three carriages, the Riviera's lobby car at tier 3). Reports draw calls, triangles, textures and
// their GPU memory (estimated from each texture's size and format), geometry memory, JS heap and the median and 95th
// percentile frame time over 120 drawn frames. Frame times come from headless Chromium's software renderer
// (SwiftShader): useful only to compare looks and tiers with each other, not as a phone's frame rate.
// Usage: node scripts/art-perf.mjs [out.json] [PAGE=dist/index.html]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame } from './store-shots-lib.mjs';

const out = process.argv[2] ?? 'docs/art/perf.json';
const page0 = resolve(process.env.PAGE ?? 'dist/index.html');
const SCENES = [
  { name: 'station', query: '', js: 'g.simulate(2)' },
  { name: 'sleeper', query: 'jump=3:2:s', js: "g.simulate(40); const i=g.train.types.indexOf('sleeper'); window.__s.look(0, window.__s.carriageZ(i)+9, 1)" },
  { name: 'riviera', query: 'jump=8:3:s@riviera&route=riviera', js: 'g.simulate(40); window.__s.look(0, window.__s.carriageZ(0)+7, 1)' },
];
const browser = await launch();
const rows = [];
for (const look of ['classic', 'new']) for (const tier of ['low', 'medium', 'high']) for (const s of SCENES) {
  const page = await openGame(browser, page0, `quality=${tier}&look=${look}${s.query ? '&' + s.query : ''}`);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate((js) => { const g = window.nightExpress; window.__s.closeAll(); new Function('g', js)(g); }, s.js);
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    const g = window.nightExpress;
    const times = [];
    let last = performance.now();
    await new Promise((done) => {
      const tick = (now) => { times.push(now - last); last = now; if (times.length < 120) requestAnimationFrame(tick); else done(); };
      requestAnimationFrame(tick);
    });
    times.sort((a, b) => a - b);
    const info = g.stage.renderer.info;
    // Texture memory: every texture the scene's materials and uniforms hold, by its size and format.
    const seen = new Set();
    let texBytes = 0;
    const add = (t) => {
      if (!t || seen.has(t) || !t.isTexture) return;
      seen.add(t);
      const img = t.image;
      const w = img?.width ?? 0, h = img?.height ?? 0, d = img?.depth ?? 1;
      const bpp = t.type === 1016 ? 8 : t.type === 1015 ? 16 : 4; // half float RGBA, float RGBA, else 8-bit RGBA
      texBytes += w * h * d * bpp * (t.generateMipmaps || t.minFilter === 1008 ? 4 / 3 : 1);
    };
    g.stage.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { for (const v of Object.values(m)) add(v); for (const u of Object.values(m.uniforms ?? {})) add(u?.value); }
    });
    const geo = new Set();
    let geoBytes = 0;
    g.stage.scene.traverse((o) => { if (o.geometry && !geo.has(o.geometry)) { geo.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) geoBytes += a.array.byteLength; geoBytes += o.geometry.index?.array.byteLength ?? 0; } });
    return {
      drawCalls: g.stage.drawCalls ?? info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      textureMB: +(texBytes / 1048576).toFixed(1),
      geometryMB: +(geoBytes / 1048576).toFixed(1),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
      frameMedianMs: +times[60].toFixed(1),
      frameP95Ms: +times[114].toFixed(1),
      pixelRatio: g.stage.renderer.getPixelRatio(),
    };
  });
  const row = { look, tier, scene: s.name, ...r };
  console.log(JSON.stringify(row));
  rows.push(row);
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(rows, null, 1));
