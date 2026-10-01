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
// Phones from the smallest in use, plus the Claude desktop app's artifact panel (letterboxed, ~337×600).
const SIZES = [[320, 568], [337, 600], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];

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
    menu: '.hud-row .menu-btn',
    ticket: '.ticket',
    objective: '.objective',
    offer: '.offers .chip',
    toast: '.toasts .toast',
    banner: '.banner .sign, .banner .sub',
    celebrate: '.celebrate .card',
    boost: '.boost .badge',
    trainmap: '.trainmap',
    guide: '.guide',
    tiletag: '.tile-tag',
    gesture: '.gesture',
    rush: '.rush',
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
      // World labels may cross each other; they must never cross the HUD.
      const world = ['guide', 'tiletag', 'gesture', 'rush'];
      if (world.includes(a.group) && world.includes(b.group)) continue;
      const overlap = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > pad && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > pad;
      if (overlap) issues.push(`${a.name} overlaps ${b.name}`);
    }
  }
  // Clipped text: anything whose content is wider than its box.
  const textSelectors = '.livery .buy, .name-chip, .answer .say, .award .info b, .tile-tag b, .masthead .paper-name, .pill .val, .journey .clock, .chip .val, .chip button, .ticket h3, .objective .obj-text, .objective .obj-reward, .objective .obj-count, .ticket .rows span, .banner .sign, .celebrate .big, .celebrate .small, .toast, .btn, .sheet header h2, .product .info b, .product .buy, .gem-card, .gem-card small, .quest .info, .quest button, .upgrade .info b, .postcard .label, .day, .toggle';
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

  // Boot (session 12: no title screen): a brand-new player goes straight into the intro over the train,
  // with no splash and no sheet on top.
  report('boot', await page.evaluate(() => {
    const out = [];
    if (document.querySelector('.splash')) out.push('a title screen is showing');
    if (document.querySelector('.scrim')) out.push('a sheet opened over the intro');
    return out;
  }));
  // The intro: its caption card and Skip button must fit too, then skip it.
  await page.waitForFunction(() => { const c = document.querySelector('.cine-caption'); return c && !c.hidden; }, null, { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  report('intro', await page.evaluate(() => {
    const cap = document.querySelector('.cine-caption')?.getBoundingClientRect();
    const skip = document.querySelector('.cine-skip')?.getBoundingClientRect();
    const out = [];
    if (!cap || cap.width === 0) out.push('intro caption missing');
    for (const [name, r] of [['caption', cap], ['skip', skip]]) if (r && r.width > 0 && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) out.push(`intro ${name} leaves the screen`);
    const text = document.querySelector('.cine-text');
    if (text && text.scrollWidth > text.clientWidth + 1) out.push('intro caption text clipped');
    return out;
  }));
  await page.evaluate(() => window.nightExpress.skipIntro?.());
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
    g.ui.toast('Quest done', 'quest');
    g.ui.stationBanner('Larkspur Halt', 'album');
    // A long train so the train map is up.
    for (const type of ['bathroom', 'supply', 'luggage', 'sleeper']) { g.train.coupleNext(type); g.simulate(3.5); }
  });
  await page.waitForTimeout(700);
  report('busy HUD', await page.evaluate(auditPage));
  // The coach line takes the ticket's slot once the ticket is gone.
  await page.evaluate(() => {
    const g = window.nightExpress;
    for (const el of document.querySelectorAll('.ticket')) el.remove();
    document.getElementById('ui').classList.remove('has-ticket');
    g.coach.enabled = false;
    g.coach.current = { id: 'audit', icon: 'towel', text: 'Restock', anchor: { world: { x: 0, z: 8 } } };
    // A long Rush streak under the conductor.
    g.rush.streak = 25;
    g.rush.timeLeft = 30;
  });
  await page.waitForTimeout(400);
  report('coach', await page.evaluate(auditPage));
  await page.evaluate(() => window.nightExpress.ui.celebrate('Sleeper Car II', null, 'carriage'));
  await page.waitForTimeout(3000);
  report('celebration with the train map', await page.evaluate(auditPage));
  await page.evaluate(() => { for (const el of document.querySelectorAll('.banner')) el.remove(); window.nightExpress.ui.celebrate('Sleeper Car II', null, 'carriage'); });
  await page.waitForTimeout(3000);
  report('celebration', await page.evaluate(auditPage));

  // Every menu.
  const menus = [
    ['shop', "document.querySelector('.side button[aria-label=\"Shop\"]').click()"],
    ['settings', 'window.nightExpress.ui.screens.settings()'],
    ['menu', 'window.nightExpress.ui.screens.menu()'],
    ['front page', "const g = window.nightExpress; g.data.press.trainName = 'The Moonlight Limited'; const item = g.press.print('refurb3', { carriage: 'Sleeper Car II' }); g.ui.showFrontPage(item, { cash: 0, gems: 10, railMiles: 2 }, 10, () => {})"],
    ['chooser', "window.nightExpress.ui.showCarriageChoice([{ type: 'sleeper', name: 'Sleeper Car', pitch: '+4 cabins', inside: '', reason: 'Guests need beds' }, { type: 'luggage', name: 'Luggage Car', pitch: '+16 bag racks', inside: '', reason: null }, { type: 'bathroom', name: 'Washroom Car', pitch: '+3 washrooms', inside: '', reason: null }], () => {})"],
    ['upgrades', 'window.nightExpress.ui.screens.upgrades()'],
    ['daily', 'window.nightExpress.ui.screens.daily()'],
    ['album', 'window.nightExpress.ui.screens.album()'],
    ['first class', "window.nightExpress.ui.showFirstClassOffer(true, '$2.99', () => {}, () => {})"],
    ['level up', "window.nightExpress.ui.showLevelUp(8, { railMiles: 12, cash: 1200 }, 10, () => {})"],
    ['offline', "window.nightExpress.ui.showOffline(123456, 7200, 10, () => {})"],
    ['dev', 'window.nightExpress.ui.screens.devPanel()'],
    ['progress', 'window.nightExpress.ui.screens.progress()'],
    ['naming', "window.nightExpress.ui.showNaming(['The Night Owl', 'Silver Swallow', 'Moonlight Limited', 'The Dandelion', 'Lucky Clover', 'The Starling'], () => {})"],
    ['interview', "window.nightExpress.ui.showInterview({ level: 4, show: 'tv', question: 'The Orient Belle calls you \"a local line with ideas\". Your reply?', answers: [{ text: 'See you at the Golden Whistles.', perk: { kind: 'fareBonus', amount: 0.06, label: 'Fares +6%' } }, { text: 'Our passengers would disagree.', perk: { kind: 'tipBonus', amount: 0.08, label: 'Tips +8%' } }, { text: 'Local, and proud of it.', perk: { kind: 'speedBonus', amount: 0.06, label: 'Walk +6%' } }] }, 'The Moonlight Limited', () => {})"],
    ['rival watch', 'window.nightExpress.press.devShowRival(1)'],
    ['gazette interview', "window.nightExpress.ui.showInterview({ level: 0, show: 'gazette', question: 'A new sleeper on the country line! What makes a good night train?', answers: [{ text: 'Tea, served before you ask.', perk: { kind: 'tipBonus', amount: 0.06, label: 'Tips +6%' } }, { text: 'Fair fares for a fine bed.', perk: { kind: 'fareBonus', amount: 0.05, label: 'Fares +5%' } }, { text: 'A conductor who never stops moving.', perk: { kind: 'speedBonus', amount: 0.05, label: 'Walk +5%' } }] }, 'The Moonlight Limited', () => {})"],
    ['ceremony', "const a = [{ id: 'popular', name: 'People\\'s Favourite', hint: 'Carry 250 guests.', stat: 'guests', target: 250, reward: { gems: 25, railMiles: 5 } }, { id: 'sleeper', name: 'Sleeper Train of the Year', hint: 'Top the Countryside League.', stat: 'rankOne', target: 0, reward: { gems: 40, railMiles: 8 } }, { id: 'spotless', name: 'Spotless Service', hint: 'Make 6 perfect station stops.', stat: 'perfectStops', target: 6, reward: { gems: 15, railMiles: 3 } }]; window.nightExpress.ui.showCeremony({ level: 8, title: 'Golden Whistle: Grand Final', awards: a }, [{ award: a[0], won: true, fresh: true, have: 250, need: 250 }, { award: a[1], won: true, fresh: true, have: 1, need: 1 }, { award: a[2], won: false, fresh: false, have: 4, need: 6 }], 'The Moonlight Limited', () => {})"],
  ];
  for (const [label, script] of menus) {
    await page.evaluate((s) => {
      const g = window.nightExpress;
      g.data.meta.postcards = ['millbrook', 'hazelford', 'larkspur-halt'];
      new Function(s)();
    }, script);
    await page.waitForTimeout(label === 'ceremony' ? 3000 : label === 'front page' || label === 'rival watch' ? 1200 : 350);
    // Let entrance animations settle (a slow frame can leave a sheet mid-slide).
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
      new Promise((r) => setTimeout(r, 2000)),
    ]));
    report(label, await page.evaluate(auditPage));
    await page.evaluate(() => { for (const b of document.querySelectorAll('.sheet .close')) b.click(); for (const s of document.querySelectorAll('.scrim')) s.remove(); });
  }
  for (const e of errors) problems.push(`${width}×${height} page error: ${e}`);
  await page.close();
}

// Live play: the autopilot plays a few minutes in real time while world text (numbers, speech, labels,
// the head counter) is sampled against every visible HUD box. Catches overlaps no staged screen shows.
const liveCheck = () => {
  const vis = (el) => {
    if (!el.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const hud = [...document.querySelectorAll('.hud-top .pill, .hud-top .level, .hud-top .journey, .hud-row .menu-btn, .side button, .boost .badge, .trainmap, .ticket, .objective, .offers .chip, .toasts .toast')].filter(vis);
  const world = [...document.querySelectorAll('.float, .speech, .guide, .tile-tag, .burst, .rush')].filter(vis);
  const out = [];
  for (const w of world) {
    // Fading in or out at the edge is fine: only count clearly visible text.
    if (Number(getComputedStyle(w).opacity) < 0.5) continue;
    const a = w.getBoundingClientRect();
    for (const hEl of hud) {
      const b = hEl.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) out.push(`${w.className.split(' ')[0]} "${w.textContent.trim().slice(0, 24)}" over ${hEl.className.split(' ')[0]}`);
    }
  }
  return out;
};
// Text budget (session 11: show, don't tell): words of two or more letters visible during play, cards
// excluded (a card is a deliberate pause). Numbers and icons are free.
const TEXT_BUDGET = { average: 3, max: 8 };
const wordsOnScreen = () => {
  if (document.querySelector('.scrim, .splash')) return null;
  const vis = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  let words = 0;
  const texts = [];
  const walker = document.createTreeWalker(document.getElementById('ui'), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent.trim();
    const el = walker.currentNode.parentElement;
    if (!t || !el || !vis(el)) continue;
    const n = (t.match(/[A-Za-z][A-Za-z'’]+/g) ?? []).length;
    if (n) texts.push(t);
    words += n;
  }
  return { words, texts };
};
const budget = { samples: 0, total: 0, max: 0, worst: [] };
for (const [width, height] of [[337, 600], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`file://${file}`);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.nightExpress.skipIntro?.());
  await page.evaluate(() => { const g = window.nightExpress; g.setAutopilot(true); g.timeScale = 3; });
  const seen = new Set();
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const choice = document.querySelector('.scrim [data-default]');
      if (choice) choice.click();
      else for (const b of document.querySelectorAll('.scrim .btn')) if (/^(Collect|Maybe later|Claim)$/.test(b.textContent.trim())) { b.click(); break; }
    });
    for (const issue of await page.evaluate(liveCheck)) seen.add(issue);
    const sample = await page.evaluate(wordsOnScreen);
    if (sample) {
      budget.samples++;
      budget.total += sample.words;
      if (sample.words > budget.max) {
        budget.max = sample.words;
        budget.worst = sample.texts;
      }
    }
  }
  for (const issue of seen) problems.push(`${width}×${height} live play: ${issue}`);
  await page.close();
}

await browser.close();
const average = budget.total / Math.max(1, budget.samples);
console.log(`Words on screen in play: ${average.toFixed(1)} on average, ${budget.max} at most (budget ${TEXT_BUDGET.average} / ${TEXT_BUDGET.max}; ${budget.samples} samples).`);
if (average > TEXT_BUDGET.average) problems.push(`too much text in play: ${average.toFixed(1)} words on average (budget ${TEXT_BUDGET.average})`);
if (budget.max > TEXT_BUDGET.max) problems.push(`too much text at once: ${budget.max} words (${budget.worst.join(' | ')})`);
if (problems.length) {
  console.log(`${problems.length} layout problem(s):\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`UI audit passed at ${SIZES.map((s) => s.join('×')).join(', ')}.`);
