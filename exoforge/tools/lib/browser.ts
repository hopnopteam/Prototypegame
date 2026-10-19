// Shared Playwright helpers: the preinstalled Chromium, a phone-sized touch page on the built game, and real
// touch input sent through the DevTools protocol (hold, drag, release), exactly as a thumb would.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, CDPSession, Page } from 'playwright';

const require = createRequire(import.meta.url);

function loadPlaywright(): typeof import('playwright') {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p) as typeof import('playwright');
    } catch {
      // try the next location
    }
  }
  throw new Error('Playwright not found (npm i -D playwright, or use the preinstalled one)');
}

export const ROOT = join(import.meta.dirname, '../..');
export const GAME = join(ROOT, 'dist/index.html');

export interface Phone {
  browser: Browser;
  page: Page;
  cdp: CDPSession;
  errors: string[];
}

export async function openPhone(width = 390, height = 844, scale = 3, query = ''): Promise<Phone> {
  if (!existsSync(GAME)) throw new Error('dist/index.html is missing: run npm run build first');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${GAME}${query}`);
  await page.waitForFunction(() => window.__exo !== undefined, undefined, { timeout: 60_000 });
  const cdp = await context.newCDPSession(page);
  return { browser, page, cdp, errors };
}

export async function state(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__exo!.state());
}

/** A thumb: put it down, slide it, lift it. */
export class Thumb {
  private x = 0;
  private y = 0;
  constructor(private readonly cdp: CDPSession) {}
  async down(x: number, y: number): Promise<void> {
    this.x = x;
    this.y = y;
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  }
  async move(x: number, y = this.y): Promise<void> {
    this.x = x;
    this.y = y;
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  async up(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  /** Quick taps, stamped a set time apart (so a slow frame cannot stretch them). */
  async taps(x: number, y: number, count: number, gapMs = 120): Promise<void> {
    const t0 = Date.now() / 1000;
    for (let i = 0; i < count; i++) {
      const t = t0 + (i * gapMs) / 1000;
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 9 }], timestamp: t });
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.05 });
    }
  }

  /** Slides sideways over a few steps (a real drag, not a jump). */
  async slide(dx: number, steps = 6): Promise<void> {
    const from = this.x;
    for (let i = 1; i <= steps; i++) await this.move(from + (dx * i) / steps);
  }
}

/** Waits in game-time terms: simulated seconds of the current run. */
export async function waitSim(page: Page, seconds: number, timeoutMs = 120_000): Promise<void> {
  const start = (await state(page)).time as number;
  await page.waitForFunction((t) => (window.__exo!.state().time as number) >= t, start + seconds, { timeout: timeoutMs, polling: 50 });
}

export async function tapSelector(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Nothing to tap at ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
