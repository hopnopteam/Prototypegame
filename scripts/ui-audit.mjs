// Layout audit: stages the busiest moments the HUD can have (maxed currencies, the longest station name,
// the result ticket, a title card, a toast, an offer, a boost) and every menu, at several phone sizes,
// then fails if any two HUD elements overlap, any text is clipped, or anything leaves the screen.
// Usage: npm run build && node scripts/ui-audit.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const file = resolve('dist/index.html');
if (!existsSync(file)) { console.error('dist/index.html missing: run npm run build first.'); process.exit(1); }
const SIZES = [[360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

// Runs inside the page: checks the currently visible HUD for overlaps, clipping and escapes.
const auditPage = () => {
  const root = document.getElementById('ui');
  const rootRect = root.getBoundingClientRect();
  const visible = (el) => {
    if (!el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const groups = {
    currency: '.hud-top .pill',
    level: '.hud-top .level',
    journey: '.hud-top .journey',
    rail: '.side button',
    ticket: '.ticket',
    offer: '.offers .chip',
    toast: '.toasts .toast',
    banner: '.banner .sign, .banner .sub',
    celebrate: '.celebrate .card',
    boost: '.boost .badge',
    coach: '.coach',
    trainmap: '.trainmap',
  };
  const boxes = [];
  for (const [group, selector] of Object.entries(groups)) {
    document.querySelectorAll(selector).forEach((el, i) => {
      if (!visible(el)) return;
      // Ignore elements mid-animation out (tickets and toasts sliding away).
      if (el.classList.contains('out')) return;
      boxes.push({ group, name: `${group}#${i}`, r: el.getBoundingClientRect(), el });
    });
  }
  const issues = [];
  const pad = 1;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.r.left < rootRect.left - pad || a.r.right > rootRect.right + pad || a.r.top < rootRect.top - pad || a.r.bottom > rootRect.bottom + pad) {
      issues.push(`${a.name} leaves the screen (${Math.round(a.r.left)},${Math.round(a.r.top)} ${Math.round(a.r.width)}×${Math.round(a.r.height)})`);
    }
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (a.group === 'banner' && b.group === 'banner') continue;
      const overlap = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > pad && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > pad;
      if (overlap) issues.push(`${a.name} overlaps ${b.name}`);
    }
  }
  // Clipped text: anything whose content is wider than its box.
  const textSelectors = '.livery .buy, .name-chip, .answer .say, .award .info b, .tile-tag b, .masthead .paper-name, .pill .val, .journey .name, .journey .clock, .chip .txt b, .chip .txt span, .chip button, .ticket h3, .ticket .where, .ticket .rows span, .banner .sign, .banner .sub, .celebrate .big, .celebrate .small, .toast, .btn, .sheet header h2, .product .info b, .product .buy, .gem-card, .gem-card small, .quest .info, .quest button, .upgrade .info b, .postcard .label, .day, .toggle';
  document.querySelectorAll(textSelectors).forEach((el) => {
    if (!visible(el)) return;
    if (el.scrollWidth > el.clientWidth + 1) issues.push(`clipped text in ${el.className || el.tagName}: "${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
  });
  document.querySelectorAll('.sheet').forEach((sheet) => {
    if (!visible(sheet)) return;
    const r = sheet.getBoundingClientRect();
    if (r.left < rootRect.left - pad || r.right > rootRect.right + pad || r.top < rootRect.top - pad || r.bottom > rootRect.bottom + pad) issues.push('sheet leaves the screen');
    sheet.querySelectorAll('.content > *').forEach((child) => {
      if (!visible(child)) return;
      const c = child.getBoundingClientRect();
      if (c.right > r.right + pad || c.left < r.left - pad) issues.push(`sheet content wider than the sheet: ${child.className}`);
    });
  });
  return issues;
};

for (const [width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${file}`);
  await page.waitForTimeout(700);
  const report = (label, issues) => { for (const issue of issues) problems.push(`${width}×${height} ${label}: ${issue}`); };

  // Title screen.
  report('title', await page.evaluate(() => {
    const plate = document.querySelector('.splash .plate')?.getBoundingClientRect();
    const tap = document.querySelector('.splash .tap')?.getBoundingClientRect();
    const out = [];
    if (plate && tap && plate.bottom > tap.top) out.push('title plate overlaps the tap button');
    if (plate && (plate.left < 0 || plate.right > innerWidth)) out.push('title plate leaves the screen');
    return out;
  }));
  await page.mouse.click(width / 2, height - 60);
  await page.waitForTimeout(300);

  // Busiest HUD: maxed numbers, longest station name, everything that can share the screen at once.
  await page.evaluate(() => {
    const g = window.nightExpress;
    g.paused = true;
    g.wallet.add('cash', 9_999_999, 'audit');
    g.wallet.add('gems', 99_999, 'audit');
    g.wallet.add('railMiles', 9_999, 'audit');
    g.devAddStars(120);
    for (const b of document.querySelectorAll('.scrim .btn')) if (b.textContent.trim() === 'Collect') b.click();
    g.journey.stationIndex = 7;
    g.data.monetization.speedBoostUntil = Date.now() + 120000;
    g.data.monetization.doubleFaresStop = g.journey.stopSerial + 1;
    g.monetization.offers = [{ id: 'holdTheTrain', icon: 'hold', label: '+15s', detail: 'Hold the train', gemCost: 5 }];
    g.ui.showResult({ stationName: 'Larkspur Halt', boarded: 7, waiting: 0, alighted: 6, tips: 1234, luggageLoaded: 12, luggageTotal: 12, stars: 99, clean: true, bonusCash: 999 });
    g.ui.toast('Quest complete: Perfect station stops', 'quest');
    g.ui.newsFlash({ id: 99, trigger: 'refurb3', headline: 'Velvet and Brass: The Moonlight Limited Goes Luxury', body: '', level: 6, carriages: 5, livery: '#2F4C82', trim: '#E2B653', at: 0 });
    g.ui.stationBanner('Larkspur Halt', 'All aboard · New postcard');
    // A long train so the train map is up.
    for (let i = 0; i < 4; i++) { g.train.coupleNext(); g.simulate(3.5); }
  });
  await page.waitForTimeout(700);
  report('busy HUD', await page.evaluate(auditPage));
  // The coach line takes the ticket's slot once the ticket is gone.
  await page.evaluate(() => {
    const g = window.nightExpress;
    for (const el of document.querySelectorAll('.ticket')) el.remove();
    document.getElementById('ui').classList.remove('has-ticket');
    g.coach.enabled = false;
    g.coach.current = { id: 'audit', icon: 'towel', text: 'Washrooms need towels and rolls from the Supply Car' };
  });
  await page.waitForTimeout(400);
  report('coach', await page.evaluate(auditPage));
  await page.evaluate(() => window.nightExpress.ui.celebrate('Sleeper Car II', 'Coupled!', 'carriage'));
  await page.waitForTimeout(3000);
  report('celebration with the train map', await page.evaluate(auditPage));
  await page.evaluate(() => { for (const el of document.querySelectorAll('.banner')) el.remove(); window.nightExpress.ui.celebrate('Sleeper Car II', 'Coupled!', 'carriage'); });
  await page.waitForTimeout(3000);
  report('celebration', await page.evaluate(auditPage));

  // Every menu.
  const menus = [
    ['shop', "document.querySelector('.side button[aria-label=\"Shop\"]').click()"],
    ['settings', "document.querySelector('.side button[aria-label=\"Settings\"]').click()"],
    ['upgrades', 'window.nightExpress.ui.screens.upgrades()'],
    ['daily', 'window.nightExpress.ui.screens.daily()'],
    ['album', 'window.nightExpress.ui.screens.album()'],
    ['first class', "window.nightExpress.ui.showFirstClassOffer(true, '$2.99', () => {}, () => {})"],
    ['level up', "window.nightExpress.ui.showLevelUp(8, { railMiles: 12, cash: 1200 }, 10, () => {})"],
    ['offline', "window.nightExpress.ui.showOffline(123456, 7200, 10, () => {})"],
    ['dev', 'window.nightExpress.ui.screens.devPanel()'],
    ['progress', 'window.nightExpress.ui.screens.progress()'],
    ['gazette', "const g = window.nightExpress; g.data.press.trainName = 'The Moonlight Limited'; g.press.print('refurb3', { carriage: 'Sleeper Car II' }); g.press.print('overtake', { rival: 'Duchess of Dover' }); g.ui.pressScreens.gazette()"],
    ['naming', "window.nightExpress.ui.showNaming(['The Night Owl', 'Silver Swallow', 'Moonlight Limited', 'The Dandelion', 'Lucky Clover', 'The Starling'], () => {})"],
    ['interview', "window.nightExpress.ui.showInterview({ level: 4, question: 'The Orient Belle calls you \"a local line with ideas\". Your reply?', answers: [{ text: 'See you at the Golden Whistles.', perk: { kind: 'fareBonus', amount: 0.06, label: 'Fares +6%' } }, { text: 'Our passengers would disagree.', perk: { kind: 'tipBonus', amount: 0.08, label: 'Tips +8%' } }, { text: 'Local, and proud of it.', perk: { kind: 'speedBonus', amount: 0.06, label: 'Walk +6%' } }] }, 'The Moonlight Limited', () => {})"],
    ['ceremony', "const a = [{ id: 'popular', name: 'People\\'s Favourite', hint: 'Carry 250 guests.', stat: 'guests', target: 250, reward: { gems: 25, railMiles: 5 } }, { id: 'sleeper', name: 'Sleeper Train of the Year', hint: 'Top the Countryside League.', stat: 'rankOne', target: 0, reward: { gems: 40, railMiles: 8 } }, { id: 'spotless', name: 'Spotless Service', hint: 'Make 6 perfect station stops.', stat: 'perfectStops', target: 6, reward: { gems: 15, railMiles: 3 } }]; window.nightExpress.ui.showCeremony({ level: 8, title: 'Golden Whistle: Grand Final', awards: a }, [{ award: a[0], won: true, fresh: true, have: 250, need: 250 }, { award: a[1], won: true, fresh: true, have: 1, need: 1 }, { award: a[2], won: false, fresh: false, have: 4, need: 6 }], 'The Moonlight Limited', () => {})"],
  ];
  for (const [label, script] of menus) {
    await page.evaluate((s) => {
      const g = window.nightExpress;
      g.data.meta.postcards = ['millbrook', 'hazelford', 'larkspur-halt'];
      new Function(s)();
    }, script);
    await page.waitForTimeout(label === 'ceremony' ? 3000 : 350);
    report(label, await page.evaluate(auditPage));
    await page.evaluate(() => { for (const b of document.querySelectorAll('.sheet .close')) b.click(); for (const s of document.querySelectorAll('.scrim')) s.remove(); });
  }
  for (const e of errors) problems.push(`${width}×${height} page error: ${e}`);
  await page.close();
}

await browser.close();
if (problems.length) {
  console.log(`${problems.length} layout problem(s):\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`UI audit passed at ${SIZES.map((s) => s.join('×')).join(', ')}.`);
