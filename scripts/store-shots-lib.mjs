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
        // Still room: guests on their way to, queuing at or waiting in another venue (not yet served) come here instead.
        const target = game.venues.byCarriage(carriage);
        for (const guest of game.guests.list) {
          if (sent >= max) break;
          if (!['toVenue', 'venueQueue', 'seated'].includes(guest.state) || !guest.outing || guest.outing.venue === target || guest.trip === 'night') continue;
          game.venues.abandon(guest);
          guest.state = 'resting';
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
    /** While `on`, a guest's cross face is never shown (a store shot shows the train at its best; play is unchanged). */
    calm(on) {
      window.__calm = on;
      if (!on || window.__calmLoop) return;
      window.__calmLoop = true;
      const tick = () => {
        if (window.__calm) for (const guest of g().guests.list) if (guest.view.bubbleMood === 'angry') guest.view.showMood(null);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    // ─── Hero shots (session 38d): the conductor in the picture, at work ──────────────────────────────────────────
    /** Puts the conductor on a spot, facing a point (the guest they serve). */
    place(x, z, faceX, faceZ) {
      const game = g();
      const p = game.player;
      p.travel?.stop?.();
      // The nearest open floor to the spot asked for that nobody else stands on (never inside a chair or a guest).
      const walk = game.map.walk;
      const clear = (px, pz) => walk.isWalkable(px, pz) && game.guests.list.every((o) => Math.hypot(o.pos.x - px, o.pos.z - pz) > 0.6);
      let best = null;
      for (let r = 0; r <= 2 && !best; r += 0.2) {
        for (let a = 0; a < 16 && !best; a++) {
          const px = x + r * Math.cos((a / 16) * Math.PI * 2);
          const pz = z + r * Math.sin((a / 16) * Math.PI * 2);
          if (clear(px, pz)) best = { x: px, z: pz };
          if (r === 0) break;
        }
      }
      best = best ?? walk.nearestWalkable(x, z);
      p.pos.x = best.x;
      p.pos.z = best.z;
      x = best.x;
      z = best.z;
      if (faceX !== undefined) p.facing = Math.atan2(faceX - x, faceZ - z);
    },
    /** What the conductor carries (the tray shows it). */
    carry(kinds) {
      const p = g().player;
      p.stack.clear();
      for (const k of kinds) p.stack.add(k);
    },
    /** A zone's spot by id (the desk's service spot, a cabin's pad…). */
    zoneSpot(id) {
      const z = g().zones.zones.find((zone) => zone.id === id);
      return z ? { x: z.x, z: z.z } : null;
    },
    /** A venue's places in world coordinates: its counter pad, first station, projector, sign and the middle of its seats. */
    venueSpots(carriage) {
      const v = g().venues.byCarriage(carriage);
      if (!v) return null;
      const L = v.layout;
      const seats = v.seats.map((s) => s.sit);
      const mid = seats.length ? { x: seats.reduce((a, s) => a + s.x, 0) / seats.length, z: seats.reduce((a, s) => a + s.z, 0) / seats.length } : null;
      const busy = v.seats.filter((s) => s.guest).map((s) => s.sit);
      return {
        counter: L.counter ? v.world(L.counter.pad) : null,
        queueHead: L.counter && L.counter.queue[0] ? v.world(L.counter.queue[0]) : null,
        station: L.stations[0] ? { ...v.world(L.stations[0].pad), item: L.stations[0].item } : null,
        projector: L.projector ? v.world(L.projector) : null,
        sign: L.sign ? v.world(L.sign) : null,
        seats: mid,
        busy: busy.length ? busy : null,
      };
    },
    /**
     * A venue full at once: guests from their rooms (or other venues) booked through the game's own outing logic, set
     * down in their seats and sat down by the venue itself; then most are served (eating, sipping, watching) and a
     * few still waiting with their order bubble, a couple of them delighted (the heart-eyed face and its hearts).
     */
    seatVenue(carriage, max) {
      const game = g();
      const venues = game.venues;
      const venue = venues.byCarriage(carriage);
      if (!venue) return 0;
      const pick = game.rng.weighted;
      game.rng.weighted = () => String(carriage);
      const seated = [];
      try {
        for (const guest of game.guests.list) {
          if (seated.length >= max || !venue.freeSeat()) break;
          if (guest.trip === 'night' || !guest.cabin) continue;
          if (guest.outing) {
            if (guest.outing.venue === venue) continue;
            venues.abandon(guest);
            guest.state = 'resting';
          } else if (!['resting', 'requesting', 'settling', 'toCabin'].includes(guest.state)) continue;
          if (!venues.tryOuting(guest, 'evening') && !venues.tryOuting(guest, 'morning')) continue;
          const at = venue.queue.indexOf(guest);
          if (at >= 0) venue.queue.splice(at, 1);
          venue.arrived.delete(guest);
          guest.mover.stop?.();
          const seat = guest.outing.seat;
          guest.pos.x = seat.sit.x;
          guest.pos.z = seat.sit.z;
          venues.sitDown(guest);
          seated.push(guest);
        }
      } finally {
        game.rng.weighted = pick;
      }
      window.__love = window.__love ?? new Set();
      seated.forEach((guest, i) => {
        const seat = guest.outing.seat;
        if (venue.kind === 'dining' || venue.kind === 'bar') {
          // Two in three already served (eating or drinking), the rest waving their order.
          if (i % 3 !== 2) {
            seat.order = null;
            seat.state = 'consuming';
            seat.timer = 0;
            game.guests.setOutingState(guest, 'consuming');
            guest.view.showBubble(null);
            guest.view.act('sip', 30);
          }
        } else if (venue.kind === 'cafe') {
          seat.timer = 0;
          guest.view.act('sip', 30);
        }
        if (i % 4 === 1) window.__love.add(guest);
      });
      if (!window.__loveLoop) {
        window.__loveLoop = true;
        let last = performance.now();
        const tick = (now) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          for (const guest of window.__love) {
            if (!guest.outing) { window.__love.delete(guest); continue; }
            if (guest.outing.seat.order) continue;
            guest.view.showMood('love');
            if (Math.random() < dt * 1.5) g().particles.emit('heart', guest.pos.x, 2.4, guest.pos.z, 1, 0.15);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      return seated.length;
    },
    /** Happy Hour on the bar (the bulbs lit, the badge up). */
    happyHour() {
      g().venues.happyLeft = 40;
    },
    /** Starts a film in the cinema for whoever is seated. */
    film(carriage) {
      const v = g().venues.byCarriage(carriage);
      return v ? g().venues.startFilm(v, g().player) : false;
    },
    /** The first cabin in a carriage waiting to be tidied (its pad), if any. */
    dirtyCabin(carriage) {
      const c = g().train.cabins.find((cab) => cab.carriage === carriage && cab.unlocked && cab.dirty.some(Boolean));
      return c ? { x: c.spots[0].x, z: c.spots[0].z, id: c.id } : null;
    },
    /** Hides the blue job badges every frame while `on` (the guests' own bubbles stay). */
    hideJobs(on) {
      // The game shows and hides each badge in its own frame, after any page loop: the badge's update is swapped out.
      for (const zone of g().zones.zones) {
        const m = zone.marker;
        if (!m) continue;
        if (on && !m.__update) {
          m.__update = m.update;
          m.update = function () {
            if (this.badge) this.badge.visible = false;
            if (this.fill) this.fill.visible = false;
          };
        } else if (!on && m.__update) {
          m.update = m.__update;
          delete m.__update;
        }
      }
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
  // A store shot shows the train at its best: nobody is kept waiting long enough to get cross (play is unchanged).
  await page.evaluate(() => {
    window.nightExpress.skipIntro?.();
    Object.assign(window.nightExpress.econ.service, { impatientSeconds: 1e6, lateSeconds: 1e6, noTipSeconds: 1e6 });
  });
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
