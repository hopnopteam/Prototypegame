// Screenshots of every menu and modal, for visual review. Usage: node scripts/ui-shots.mjs <outdir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const out = process.argv[2] ?? 'ui-shots';
mkdirSync(out, { recursive: true });
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });
await page.goto(`file://${resolve('dist/index.html')}`);
await page.waitForTimeout(700);
await page.mouse.click(195, 700);
const closeAll = () => page.evaluate(() => {
  for (const b of document.querySelectorAll('.sheet .close')) b.click();
  for (const b of document.querySelectorAll('.scrim [data-default]')) b.click();
  for (const b of document.querySelectorAll('.scrim .btn')) if (b.textContent.trim() === 'Collect') b.click();
});
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
await shot('0-start', 1200);
// Progress a bit so there is content.
await page.evaluate(() => { const g = window.nightExpress; g.paused = true; g.setAutopilot(true); g.simulate(300); g.setAutopilot(false); g.paused = false; });
await closeAll();
await shot('a-rear-deck', 900);
await page.evaluate(() => window.nightExpress.devAddStars(200));
await shot('b-levelup');
await closeAll();
await page.evaluate(() => document.querySelector('.side button[aria-label="Shop"]').click());
await shot('c-shop');
await closeAll();
await page.evaluate(() => { const g = window.nightExpress; g.data.settings.devTools = true; document.querySelector('.side button[aria-label="Settings"]').click(); });
await shot('d-settings');
await closeAll();
await page.evaluate(() => window.nightExpress.ui.screens.devPanel());
await shot('e-dev');
await closeAll();
await page.evaluate(() => window.nightExpress.ui.showFirstClassOffer(true, '$2.99', () => {}, () => {}));
await shot('f-firstclass');
await closeAll();
await page.evaluate(() => { const g = window.nightExpress; g.wallet.add('railMiles', 20, 'dev'); g.ui.screens.upgrades(); });
await shot('g-upgrades');
await closeAll();
await page.evaluate(() => window.nightExpress.ui.screens.daily());
await shot('h-daily');
await closeAll();
await page.evaluate(() => window.nightExpress.ui.screens.album());
await shot('i-album');
await closeAll();
await page.evaluate(() => { const g = window.nightExpress; g.setTimeOfDay(0.82); });
await shot('j-night', 900);
await page.evaluate(() => { const g = window.nightExpress; g.setTimeOfDay(0.64); });
await shot('k-dusk', 900);
await page.evaluate(() => { const g = window.nightExpress; g.setTimeOfDay(null); g.ui.showNaming(['The Night Owl', 'Silver Swallow', 'Moonlight Limited', 'The Dandelion', 'Lucky Clover', 'The Starling'], () => {}); });
await shot('l-naming');
await closeAll();
await page.evaluate(() => { const g = window.nightExpress; if (!g.data.press.trainName) g.data.press.trainName = 'The Night Owl'; g.press.print('overtake', { rival: 'Puffing Billy' }); g.press.print('refurb2', { carriage: 'Sleeper & Lobby' }); g.ui.pressScreens.gazette(); });
await shot('m-gazette');
await closeAll();
await page.evaluate(() => window.nightExpress.ui.showInterview({ level: 2, question: 'A new sleeper on the country line! What makes a good night train?', answers: [
  { text: 'Tea, served before you ask.', perk: { kind: 'tipBonus', amount: 0.06, label: 'Tips +6%' } },
  { text: 'Fair fares for a fine bed.', perk: { kind: 'fareBonus', amount: 0.05, label: 'Fares +5%' } },
  { text: 'A conductor who never stops moving.', perk: { kind: 'speedBonus', amount: 0.05, label: 'Walk +5%' } },
] }, 'The Night Owl', () => {}));
await shot('n-interview');
await closeAll();
await page.evaluate(() => {
  const awards = [
    { id: 'newcomer', name: 'Best Newcomer', hint: 'Just keep going.', stat: 'always', target: 0, reward: { gems: 20, railMiles: 4 } },
    { id: 'spotless', name: 'Spotless Service', hint: 'Make 6 perfect station stops.', stat: 'perfectStops', target: 6, reward: { gems: 15, railMiles: 3 } },
  ];
  window.nightExpress.ui.showCeremony({ level: 5, title: 'The Golden Whistle Awards', awards }, [
    { award: awards[0], won: true, fresh: true, have: 1, need: 1 },
    { award: awards[1], won: false, fresh: false, have: 4, need: 6 },
  ], 'The Night Owl', () => {});
});
await shot('o-ceremony', 2600);
await closeAll();
await page.evaluate(() => window.nightExpress.ui.screens.progress());
await shot('p-progress');
await closeAll();
const info = await page.evaluate(() => ({ draws: window.nightExpress.stage.drawCalls, tris: window.nightExpress.stage.renderer.info.render.triangles }));
console.log(JSON.stringify(info));
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
await browser.close();
