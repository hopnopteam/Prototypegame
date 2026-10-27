// Store hero shots (session 38d, owner: "zoomed in… it's not giving end finish consumer vibes, I want people to
// experience the vibe of the game… stage them much better, zoomed, more active but good to look at").
// Close-ups of the finished train at its busiest, each with the conductor in the picture at work: the café counter
// with its queue, dinner service, Happy Hour at the bar, a film playing, the dome, the check-in desk, a room being
// tidied, a sleeper settling in, a crowded platform, the Royal Suite and First Class, lights out. Real play on the
// Ultra tier at 1080×1920, staged through the game's own purchases and outings (the god build).
// Usage: npm run build && GOD_MODE=1 OUT=god.html node scripts/build.mjs && node scripts/store-hero.mjs <outdir>
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, play, settle } from './store-shots-lib.mjs';

const out = resolve(process.argv[2] ?? 'store-hero');
mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await openGame(browser, resolve('dist/god.html'));

/** Close framing: about a third of a carriage across (play is 1). */
const CLOSE = 0.78;
const MEDIUM = 0.95;

async function shot(name, { hud = false, wait = 2600 } = {}) {
  await page.evaluate((h) => {
    const s = window.__s;
    s.clean(!h);
    s.calm(true);
    s.worldUi(true);
    s.hideTiles(true);
    s.hideJobs(true);
    s.tidyCash();
    s.closeAll();
    // The class chips float over the lake side of each carriage: a close shot catches half of one at its edge.
    window.nightExpress.train.chips.group.visible = h;
    if (h) window.nightExpress.wallet.add('cash', 24860 - window.nightExpress.wallet.get('cash'), 'staging');
  }, hud);
  await settle(page, wait);
  if (await page.evaluate(() => { const open = !!document.querySelector('.scrim, .sheet'); window.__s.closeAll(); return open; })) await settle(page, 1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
const look = (x, z, zoom) => page.evaluate(([a, b, c]) => window.__s.look(a, b, c), [x, z, zoom]);
const until = (phase, from = 0, to = 1, limit = 400) => page.evaluate(([p, a, b, l]) => window.__s.until(p, a, b, l), [phase, from, to, limit]);
const evaluate = (fn, arg) => page.evaluate(fn, arg);

async function stage(skip) {
  await evaluate(() => { const g = window.nightExpress; g.setAutopilot(false); g.econ.tiles.maxRefits = 20; g.econ.tiles.maxVisible = 40; });
  let quiet = 0;
  for (let i = 0; i < 1200 && quiet < 60; i++) {
    const n = await evaluate((s) => { const n = window.__s.buyShown(9, s); window.nightExpress.simulate(2); window.__s.closeAll(); return n; }, skip);
    quiet = n ? 0 : quiet + 1;
    await settle(page, 120);
  }
  console.log('staged', JSON.stringify(await evaluate(() => window.__s.state())));
}
async function populate() {
  await evaluate(() => { const e = window.nightExpress.econ.guests; e.extraBoarders = [5, 7]; e.maxBoarders = 16; });
  for (let i = 0; i < 2; i++) {
    await until('stationStop', 0, 1, 400);
    await until('onTheMove', 0.05, 0.12);
  }
}

/**
 * A venue at its busiest: guests sent there through the game's outing logic, then a while with the staff and the
 * conductor serving (the autopilot plays, buying nothing), so some are being served, some eating, some waiting.
 */
async function busyVenue(carriage) {
  await until('onTheMove', 0.1, 0.24);
  const n = await evaluate((c) => {
    window.__s.emptyWallet();
    const n = window.__s.seatVenue(c, 14);
    window.nightExpress.simulate(1.2);
    window.__s.closeAll();
    return n;
  }, carriage);
  console.log('seated', carriage, n);
  return evaluate((c) => window.__s.venueSpots(c), carriage);
}

/** The conductor beside `spot`, a step toward the camera, facing `face`, carrying `items`. */
const conductor = (spot, face, items = [], dx = 0.35, dz = 0.35) =>
  evaluate(([s, f, it, ox, oz]) => { window.__s.place(s.x + ox, s.z + oz, f?.x ?? s.x, f?.z ?? s.z - 1); window.__s.carry(it); }, [spot, face, items, dx, dz]);

await play(page, 50);
// The finished train: every venue and the washrooms in Luxury, the lobby in First Class, the sleepers in Comfort (six
// rooms each, the busiest), comforts and the station dressing bought.
await evaluate(() => window.nightExpress.devAddStars(30000));
await stage(['c2.refurb_3', 'c2.refurb_4', 'c2.refurb_5', 'c4.refurb_3', 'c4.refurb_4', 'c4.refurb_5', 'c0.refurb_5']);
await populate();

// ─── The rooms, as the evening starts ─────────────────────────────────────────────────────────────────────────
await until('onTheMove', 0.2, 0.3);
{
  const spot = await evaluate(() => window.__s.zoneSpot('desk'));
  if (spot) {
    await conductor(spot, { x: spot.x - 1, z: spot.z }, [], 0, 0);
    await look(spot.x - 0.4, spot.z + 0.3, CLOSE);
    await shot('h-01-lobby-desk');
  }
  const z2 = await evaluate(() => window.__s.carriageZ(2));
  await conductor({ x: -1.0, z: z2 + 7.5 }, { x: 0.6, z: z2 + 7.5 }, ['tea', 'blanket'], 0, 0);
  await look(-0.2, z2 + 7, MEDIUM);
  await shot('h-02-sleeper-evening');
  await look(-0.2, z2 + 7, MEDIUM);
  await shot('h-03-sleeper-gameplay', { hud: true });
}

// ─── The venues at their busiest ──────────────────────────────────────────────────────────────────────────────
/** The middle of the venue's occupied seats (the busy part of the room), or of all its seats. */
const busyMid = (v) => {
  const b = v?.busy;
  if (!b?.length) return v?.seats;
  return { x: b.reduce((a, s) => a + s.x, 0) / b.length, z: b.reduce((a, s) => a + s.z, 0) / b.length };
};
{
  const v = await busyVenue(1);
  const mid = busyMid(v);
  if (mid) {
    // Serving the tables: the conductor in the aisle with two lattes, the café full round them.
    await conductor(mid, v.busy?.[0] ?? mid, ['latte', 'latte'], 0.9, 0.5);
    await look(mid.x + 0.4, mid.z, CLOSE);
    await shot('h-04-cafe-service');
    await look(mid.x + 0.4, mid.z, CLOSE);
    await shot('h-05-cafe-gameplay', { hud: true });
    await look(mid.x, mid.z, MEDIUM);
    await shot('h-06-cafe-tables');
  }
}
{
  const v = await busyVenue(5);
  const mid = busyMid(v);
  if (mid) {
    await conductor(v.busy?.[1] ?? mid, v.busy?.[1] ?? mid, ['meal'], 0.8, 0.3);
    await look(mid.x + 0.3, mid.z, CLOSE);
    await shot('h-07-dining-service');
  }
}
{
  await evaluate(() => window.__s.happyHour());
  const v = await busyVenue(7);
  await evaluate(() => window.__s.happyHour());
  const mid = busyMid(v);
  if (mid) {
    await conductor(v.busy?.[0] ?? mid, v.busy?.[0] ?? mid, ['cocktail', 'cocktail'], 0.9, 0.4);
    await look(mid.x + 0.3, mid.z, CLOSE);
    await shot('h-08-bar-happy-hour');
  }
}
{
  const v = await busyVenue(6);
  // The film on, everyone watching from the start (their waiting reel put away).
  await evaluate(() => {
    window.__s.film(6);
    window.nightExpress.simulate(2);
    const venue = window.nightExpress.venues.byCarriage(6);
    for (const seat of venue.seats) if (seat.guest) { seat.views = 1; seat.guest.view.showMood(null); }
  });
  const mid = busyMid(v);
  if (mid) {
    await conductor(mid, mid, ['popcorn', 'popcorn'], 1.2, 0.8);
    await look(mid.x, mid.z, MEDIUM);
    await shot('h-09-cinema-film');
  }
}
{
  const v = await busyVenue(8);
  const mid = busyMid(v);
  if (mid) {
    await conductor(mid, mid, ['blanket'], 1.0, 0.6);
    await look(mid.x - 0.4, mid.z, MEDIUM);
    await shot('h-10-dome-view');
  }
}

// ─── A station stop: the queue at the ticket stand, the conductor selling ─────────────────────────────────────
await until('stationStop', 0, 1, 400);
await evaluate(() => { window.nightExpress.simulate(2.5); window.__s.closeAll(); });
{
  // Platform coordinates (the platform starts 2.75 m out from the train's centre line): the server's spot behind
  // the stand, the queue along the edge ahead of it.
  const serve = { x: 6.15, z: -1.9 };
  await evaluate((s) => { window.__s.carry([]); window.__s.place(s.x, s.z, s.x - 2, s.z); }, serve);
  await look(5.0, -2.6, CLOSE);
  await shot('h-11-station-tickets');
  await look(5.0, -1.0, MEDIUM);
  await shot('h-11b-station-gameplay', { hud: true });
}
// The doors close and the new passengers line up at the desk for their keys.
await until('departing', 0, 1, 200);
await evaluate(() => { window.nightExpress.setAutopilot(false); window.nightExpress.simulate(5); window.__s.closeAll(); });
{
  const spot = await evaluate(() => window.__s.zoneSpot('desk'));
  if (spot) {
    await conductor(spot, { x: spot.x - 1, z: spot.z }, [], 0, 0);
    await look(spot.x - 0.4, spot.z - 0.6, CLOSE);
    await shot('h-01b-desk-keys');
  }
}
await until('stationStop', 0, 1, 400);
await evaluate(() => { window.nightExpress.simulate(6); window.__s.closeAll(); });
{
  const cab = await evaluate(() => window.__s.dirtyCabin(2) ?? window.__s.dirtyCabin(4) ?? window.__s.dirtyCabin(0));
  if (cab) {
    await evaluate((c) => { window.__s.carry([]); window.__s.place(c.x, c.z, c.x + 1, c.z); window.nightExpress.simulate(1.1); }, cab);
    await look(cab.x, cab.z, CLOSE);
    await shot('h-12-tidying', { wait: 900 });
  }
}

// ─── The top classes ──────────────────────────────────────────────────────────────────────────────────────────
await stage(['c4.refurb_5']);
await populate();
await until('onTheMove', 0.2, 0.3);
{
  const z2 = await evaluate(() => window.__s.carriageZ(2));
  await conductor({ x: -0.9, z: z2 + 9 }, { x: 1, z: z2 + 9 }, ['champagne'], 0, 0);
  await look(0.2, z2 + 9.5, MEDIUM);
  await shot('h-13-royal-suite');
  const z4 = await evaluate(() => window.__s.carriageZ(4));
  await conductor({ x: -0.9, z: z4 + 6 }, { x: 1, z: z4 + 6 }, ['champagne'], 0, 0);
  await look(0.2, z4 + 6.5, MEDIUM);
  await shot('h-14-first-class');
  await until('onTheMove', 0.52, 0.58);
  await evaluate(() => window.__s.carry([]));
  await look(0.2, z4 + 6.5, MEDIUM);
  await shot('h-15-lights-out');
}
await browser.close();
