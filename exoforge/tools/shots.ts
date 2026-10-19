// npm run shots: screenshots of every Milestone 1 screen and key moment at 390×844, 3× pixels, with touch on
// (SPEC B13.1), plus 8-frame motion strips of the moments that matter and the main screens at 360×780 and 430×932.
// Play is driven by the game's scripted clock, so frames are evenly spaced and repeatable.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Page } from 'playwright';
import { openPhone, ROOT, state, tapSelector } from './lib/browser';

const OUT = join(ROOT, 'qa/shots');
const STRIPS = join(OUT, 'strips');
mkdirSync(STRIPS, { recursive: true });

type Input = { hold: boolean; tilt: number };
const HOLD: Input = { hold: true, tilt: 0 };
const IDLE: Input = { hold: false, tilt: 0 };

async function play(page: Page, seconds: number, input: Input): Promise<void> {
  await page.evaluate(([s, i]) => window.__exo!.game.states.flight.scripted(s as number, i as Input), [seconds, input] as const);
}

/** Waits until the entrance animations (fades, panel pops) have played: the page's animation clock only runs as
 *  fast as frames are drawn, which on a software renderer is slow. Endless and decorative ones are skipped. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => {
          const name = (a as CSSAnimation).animationName;
          return name === 'fade-in' || name === 'panel-open' || name === 'pop';
        })
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`), timeout: 240_000 });
  console.log(`  ${name}.png`);
}

/** Starts a fresh flight on the scripted clock. */
async function freshFlight(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__exo!.game;
    g.states.flight.manual = true;
    g.go('flight');
  });
  await play(page, 0.4, IDLE);
}

/** Eight frames across a moment, cropped round the suit, side by side (SPEC B13.1 motion strips). */
async function strip(page: Page, name: string, frames: number, every: number, input: Input | ((i: number) => Input)): Promise<void> {
  const W = 200;
  const H = 300;
  const images: Buffer[] = [];
  for (let i = 0; i < frames; i++) {
    const at = await page.evaluate(() => window.__exo!.game.suitScreen());
    const vw = 390;
    const vh = 844;
    const x = Math.max(0, Math.min(vw - W, at.x - W / 2));
    const y = Math.max(0, Math.min(vh - H, at.y - H * 0.55));
    images.push(await page.screenshot({ clip: { x, y, width: W, height: H }, timeout: 240_000 }));
    await play(page, every, typeof input === 'function' ? input(i) : input);
  }
  const scale = 0.5;
  const fw = Math.round(W * 3 * scale);
  const fh = Math.round(H * 3 * scale);
  const tiles = await Promise.all(images.map((b) => sharp(b).resize(fw, fh).png().toBuffer()));
  await sharp({ create: { width: fw * frames + 4 * (frames - 1), height: fh, channels: 4, background: '#000000' } })
    .composite(tiles.map((input, i) => ({ input, left: i * (fw + 4), top: 0 })))
    .png()
    .toFile(join(STRIPS, `${name}.png`));
  console.log(`  strips/${name}.png`);
}

async function main(): Promise<void> {
  const { browser, page, errors } = await openPhone(390, 844, 3);
  console.log('390×844 @3x');
  await page.waitForTimeout(800);
  await shot(page, 'workshop');

  // Flight moments.
  await freshFlight(page);
  await shot(page, 'flight-launch');
  await strip(page, 'liftoff', 8, 0.2, HOLD);
  await play(page, 0.3, HOLD);
  await shot(page, 'flight-climb');
  await play(page, 0.35, { hold: true, tilt: 1 });
  await shot(page, 'flight-tilt');
  // Overheat: keep holding until it sputters.
  for (let i = 0; i < 40 && !(await state(page)).sputter; i++) await play(page, 0.05, { hold: true, tilt: 0.2 });
  await shot(page, 'flight-overheat-sputter');
  await strip(page, 'sputter', 8, 0.18, HOLD);
  await play(page, 2.5, IDLE);

  // A hard landing: sparks, a dent, a lost plate, shake.
  await freshFlight(page);
  await page.evaluate(() => window.__exo!.game.run!.suit.teleport(0, 9));
  await play(page, 1.12, IDLE);
  await strip(page, 'impact', 8, 0.04, IDLE);
  await freshFlight(page);
  await page.evaluate(() => window.__exo!.game.run!.suit.teleport(0, 9));
  for (let i = 0; i < 120 && ((await state(page)).eventCounts.hit ?? 0) < 1; i++) await play(page, 1 / 60, IDLE);
  await play(page, 1 / 30, IDLE);
  await shot(page, 'flight-impact');

  // Rest on a ledge and the drone's patch (the hit cost a plate, so the drone comes).
  await play(page, 0.5, IDLE);
  await shot(page, 'flight-rest');
  await strip(page, 'rest-patch', 8, 0.16, IDLE);

  // The crash: ragdoll, then the tow.
  await freshFlight(page);
  await page.evaluate(() => {
    const run = window.__exo!.game.run!;
    run.suit.integrity = 0.05;
    run.suit.teleport(0, 12);
  });
  for (let i = 0; i < 200 && !(await state(page)).ragdoll; i++) await play(page, 1 / 30, IDLE);
  await play(page, 0.15, IDLE);
  await shot(page, 'crash-ragdoll');
  await strip(page, 'ragdoll-tow', 8, 0.5, IDLE);
  for (let i = 0; i < 80 && !(await state(page)).tow; i++) await play(page, 0.05, IDLE);
  await play(page, 0.6, IDLE);
  await shot(page, 'crash-tow');
  for (let i = 0; i < 100 && (await state(page)).screen !== 'results'; i++) await play(page, 0.1, IDLE);
  await page.evaluate(() => (window.__exo!.game.states.flight.manual = false));
  await page.waitForTimeout(1300);
  await settle(page);
  await shot(page, 'results');

  // Pause and the debug panel with the physics overlay.
  await tapSelector(page, '.results-continue');
  await page.waitForTimeout(300);
  await freshFlight(page);
  await play(page, 1.4, { hold: true, tilt: 0.5 });
  await page.evaluate(() => {
    const g = window.__exo!.game;
    g.save.data.debug.vectors = true;
    g.save.data.debug.guides = true;
    g.states.flight.setPaused(true);
  });
  await play(page, 0.02, HOLD);
  await settle(page);
  await shot(page, 'pause');
  await page.evaluate(() => {
    const g = window.__exo!.game;
    g.states.flight.setPaused(false);
  });
  await play(page, 0.02, { hold: true, tilt: 0.5 });
  await shot(page, 'flight-debug-overlay');
  await page.evaluate(() => window.__exo!.game.debug.toggle());
  await page.waitForTimeout(400);
  await shot(page, 'debug-panel');
  await page.evaluate(() => {
    const g = window.__exo!.game;
    g.debug.toggle();
    g.save.data.debug.vectors = false;
    g.save.data.debug.guides = false;
  });
  await browser.close();
  if (errors.length) throw new Error(`Console errors: ${errors.join(' | ')}`);

  // Other phone sizes: the Workshop, a climb and Results.
  for (const [w, h] of [[360, 780], [430, 932]] as const) {
    console.log(`${w}×${h} @3x`);
    const phone = await openPhone(w, h, 3);
    await phone.page.waitForTimeout(800);
    await phone.page.screenshot({ path: join(OUT, `workshop-${w}x${h}.png`), timeout: 240_000 });
    await freshFlight(phone.page);
    await play(phone.page, 1.8, HOLD);
    await phone.page.screenshot({ path: join(OUT, `flight-${w}x${h}.png`), timeout: 240_000 });
    await phone.page.evaluate(() => window.__exo!.game.run!.quit());
    for (let i = 0; i < 20 && (await state(phone.page)).screen !== 'results'; i++) await play(phone.page, 0.1, IDLE);
    await phone.page.evaluate(() => (window.__exo!.game.states.flight.manual = false));
    await phone.page.waitForTimeout(1300);
    await settle(phone.page);
    await phone.page.screenshot({ path: join(OUT, `results-${w}x${h}.png`), timeout: 240_000 });
    console.log(`  workshop, flight, results`);
    await phone.browser.close();
    if (phone.errors.length) throw new Error(`Console errors at ${w}×${h}: ${phone.errors.join(' | ')}`);
  }
  console.log(`shots: written to qa/shots/`);
}

await main();
