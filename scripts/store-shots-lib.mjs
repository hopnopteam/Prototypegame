// Shared helpers for the store screenshots (session 35): boot a build at phone size, aim the camera, hide the HUD,
// stage the train by buying its tiles through the game's own purchase path. Used by scripts/store-shots.mjs.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

/** Page-side helpers, installed before the game boots. */
const HELPERS = () => {
  const g = () => window.nightExpress;
  window.__s = {
    closeAll() {
      for (const b of document.querySelectorAll('.sheet .close')) b.click();
      for (const b of document.querySelectorAll('.scrim [data-default]')) b.click();
      for (const b of document.querySelectorAll('.scrim .btn')) if (/Collect|Continue|OK|Nice|Great/i.test(b.textContent)) b.click();
    },
    clean(on) {
      const game = g();
      game.ui.setHidden(on);
      game.guidance.enabled = !on;
      game.coach.enabled = !on;
    },
    /** Hold the camera on a point of the train (x across, z along) at a zoom (1 = play framing, bigger = wider). */
    look(x, z, zoom) {
      const rig = g().stage.rig;
      const t = rig.target.clone();
      t.set(x, 0, z);
      rig.focusOn(t, 1e6, zoom, 60);
    },
    free() {
      const rig = g().stage.rig;
      rig.overrideTime = 0;
      rig.overrideTarget = null;
    },
    /** Where carriage i starts along the train (its rooms run 18 m from there). */
    carriageZ(i) {
      const v = g().train.views[i];
      return v ? v.group.position.z : 0;
    },
    /** Buys every tile on show (the coupling only while the train is shorter than `maxCarriages`). */
    buyShown(maxCarriages, skip) {
      const game = g();
      let bought = 0;
      for (const [id, entry] of [...game.tiles.entries]) {
        if (id.startsWith('couple_') && game.train.count >= maxCarriages) continue;
        if (skip && skip.some((s) => id.includes(s))) continue;
        if (!game.unlocks.isAvailable(id) || game.train.growing) continue;
        game.unlocks.pay(id, game.unlocks.remaining(id));
        game.tiles.complete(entry);
        bought++;
      }
      return bought;
    },
    /**
     * Sends up to `max` guests resting in their rooms on an outing to the venue in `carriage`, through the game's own
     * outing logic (only the venue's random pick is steered), so the venue is busy for its picture.
     */
    fillVenue(carriage, max) {
      const game = g();
      const pick = game.rng.weighted;
      game.rng.weighted = () => String(carriage);
      let sent = 0;
      try {
        for (const guest of game.guests.list) {
          if (sent >= max) break;
          if (!['resting', 'requesting', 'settling', 'toCabin'].includes(guest.state) || guest.outing || !guest.cabin || guest.trip === 'night') continue;
          if (game.venues.tryOuting(guest, 'evening') || game.venues.tryOuting(guest, 'morning')) sent++;
        }
      } finally {
        game.rng.weighted = pick;
      }
      return sent;
    },
    /** Uncollected tips are collected (a clean shot; in play the conductor scoops them as they walk past). */
    tidyCash() {
      const game = g();
      for (const pile of game.cash.piles.values()) {
        pile.value = 0;
        game.cashView.setPileCount(pile.id, 0);
      }
    },
    /** The god build's endless wallet is switched off for the shoot: the autopilot plays the train but buys nothing. */
    emptyWallet() {
      const game = g();
      game.topUpGod = () => undefined;
      const cash = game.wallet.get('cash');
      if (cash > 0) game.wallet.take('cash', cash, 'staging');
    },
    /** A believable balance on the HUD for a gameplay shot. */
    showCash(amount) {
      const game = g();
      window.__s.emptyWallet();
      game.wallet.add('cash', amount, 'staging');
    },
    worldUi(on) {
      g().stage.rig.showWorldUi(on);
    },
    /** Hides the upgrade tiles and their markers every frame while `on` (a clean shot keeps people's bubbles). */
    hideTiles(on) {
      window.__hideTiles = on;
      if (!on || window.__tilesLoop) return;
      window.__tilesLoop = true;
      const hide = () => {
        if (window.__hideTiles) {
          const tiles = g().tiles;
          for (const e of tiles.entries.values()) e.view.group.visible = false;
          if (tiles.preview) tiles.preview.view.group.visible = false;
        }
        requestAnimationFrame(hide);
      };
      requestAnimationFrame(hide);
    },
    /** Runs the sim (autopilot off) until the train is in that phase (on the move: this far through the ride, or a limit. */
    until(phase, from, to, limit) {
      const game = g();
      // The autopilot keeps the train running (tickets, keys, requests) with an empty wallet, so it buys nothing:
      // the staging decides what is bought.
      game.setAutopilot(true);
      for (let i = 0; i < limit * 4; i++) {
        const j = game.journey;
        if (j.phase === phase && (phase !== 'onTheMove' || (j.travelShare >= from && j.travelShare <= to))) break;
        window.__s.emptyWallet();
        game.simulate(0.25);
      }
      game.setAutopilot(false);
      window.__s.closeAll();
      return { phase: game.journey.phase, share: game.journey.travelShare };
    },
    state() {
      const game = g();
      return { t: Math.round(game.data.profile.lifetimePlaySeconds), n: game.train.count, tiers: game.train.tiers.join(''), types: game.train.types.join(','), lvl: game.progression.level, guests: game.guests.list.length, staff: game.staff.members.length, phase: game.journey.phase };
    },
  };
};

export async function launch() {
  return playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** A phone-shaped page (360×640 CSS at 3×: 1080×1920 pixels) on the given build. */
export async function openGame(browser, file, query = 'quality=ultra') {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.addInitScript(HELPERS);
  await page.goto(`file://${file}?${query}`);
  await page.waitForFunction(() => window.nightExpress && !window.nightExpress.loading, null, { timeout: 180000 });
  await page.evaluate(() => window.nightExpress.skipIntro?.());
  return page;
}

/** Runs the sim headless for `seconds` (the autopilot playing if `auto`; with `spend` false it buys nothing), closing any card that opens. */
export async function play(page, seconds, auto = true, spend = true) {
  for (let left = seconds; left > 0; left -= 30) {
    await page.evaluate(([s, a, sp]) => {
      const g = window.nightExpress;
      g.setAutopilot(a);
      for (let t = 0; t < s; t += 0.5) {
        if (!sp) window.__s.emptyWallet();
        g.simulate(0.5);
      }
      window.__s.closeAll();
    }, [Math.min(30, left), auto, spend]);
  }
}

/** Lets real frames render (camera settles, animations move) for about `ms` of wall time. */
export const settle = (page, ms = 2500) => page.waitForTimeout(ms);
