// npm run play: plays the built game on a 390×844 touch phone with real touch input (hold, drag, release) and
// checks each Milestone 1 behaviour and that the console stays clean. Exit code 1 on any failure.
import { openPhone, state, Thumb, waitSim, tapSelector } from './lib/browser';

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const { browser, page, cdp, errors } = await openPhone(390, 844, 2);
const thumb = new Thumb(cdp);
try {
  await page.waitForTimeout(600);
  let s = await state(page);
  check('boots into the Workshop', s.screen === 'workshop', String(s.screen));
  check('FLY! is on screen', await page.locator('.workshop-fly').isVisible());

  await tapSelector(page, '.workshop-fly');
  await page.waitForFunction(() => window.__exo!.state().screen === 'flight');
  check('FLY! starts a flight', true);
  // A short look first: the suit stands on the launch ledge.
  await waitSim(page, 0.5);
  s = await state(page);
  check('the suit stands on the launch ledge', s.height < 0.2 && s.throttle === 0, `height ${s.height.toFixed(2)}`);

  // Hold anywhere: the boots fire and the Scrap Rig climbs slowly.
  await thumb.down(195, 520);
  await waitSim(page, 1.0);
  s = await state(page);
  check('holding fires the boots', s.holding && s.throttle > 0.95, `throttle ${s.throttle.toFixed(2)}`);
  check('the suit lifts off, slowly', s.height > 0.4 && s.height < 4, `height ${s.height.toFixed(2)} m after 1 s`);
  await waitSim(page, 0.3);

  // Drag right while holding: it tilts right (before it overheats or reaches a wall).
  await thumb.slide(80, 2);
  await waitSim(page, 0.3);
  s = await state(page);
  check('dragging right tilts right', s.targetTilt > 0.5 && s.tilt > 0.12, `target ${(s.targetTilt * 57.3).toFixed(0)}°, tilt ${(s.tilt * 57.3).toFixed(0)}°`);
  await thumb.slide(-160, 3);
  await waitSim(page, 0.5);
  s = await state(page);
  check('dragging left tilts left', s.targetTilt < -0.5 && s.tilt < -0.1, `target ${(s.targetTilt * 57.3).toFixed(0)}°, tilt ${(s.tilt * 57.3).toFixed(0)}°`);

  // Release: thrust stops, the suit falls with momentum and the gyro pulls it upright.
  await thumb.up();
  await waitSim(page, 0.4);
  s = await state(page);
  check('releasing stops the boots', !s.holding && s.throttle === 0);
  await waitSim(page, 2.5);

  // Hold long enough to overheat: the thrusters sputter.
  await thumb.down(195, 520);
  await waitSim(page, 3.4);
  s = await state(page);
  check('a long burst overheats and sputters', (s.eventCounts.sputter ?? 0) >= 1, `sputters ${s.eventCounts.sputter ?? 0}, heat ${s.heat.toFixed(2)}`);
  await thumb.up();
  await waitSim(page, 3.5);
  s = await state(page);
  check('it lands and rests on a ledge', (s.eventCounts.rest ?? 0) >= 1, `rests ${s.eventCounts.rest ?? 0}`);

  // Pause and resume.
  await tapSelector(page, '.hud-pause');
  s = await state(page);
  check('pause stops the flight', s.paused === true && (await page.locator('.pause-sheet').isVisible()));
  const t0 = s.time;
  await page.waitForTimeout(500);
  s = await state(page);
  check('nothing moves while paused', s.time === t0);
  await tapSelector(page, '.pause-panel .painted-btn.suggested');
  s = await state(page);
  check('resume goes back to flying', s.paused === false);

  // Debug panel: three taps in the top-left corner.
  await thumb.taps(20, 20, 3);
  await page.waitForTimeout(300);
  check('three taps top-left open the debug panel', await page.locator('.debug-panel').isVisible());
  await page.locator('.debug-head button').click();
  check('the debug panel closes', !(await page.locator('.debug-panel').isVisible()));

  s = await state(page);
  check('draw calls stay under 150', s.maxDrawCalls < 150, `at most ${s.maxDrawCalls} per frame`);

  // A crash: armor nearly gone, a drop down the shaft. Ragdoll, then the drone tows it off to Results.
  await page.evaluate(() => {
    const run = window.__exo!.game.run!;
    run.suit.integrity = 0.05;
    run.suit.teleport(0, 16);
  });
  await page.waitForFunction(() => window.__exo!.state().ragdoll === true, undefined, { timeout: 60_000 });
  check('a hard hit with no armor left crashes into a ragdoll', true);
  await page.waitForFunction(() => window.__exo!.state().tow !== null, undefined, { timeout: 60_000 });
  check('the drone comes to tow the suit', true);
  await page.waitForFunction(() => window.__exo!.state().screen === 'results', undefined, { timeout: 90_000 });
  const title = await page.locator('.results-title').textContent();
  check('Results follow the tow', title === 'TOWED HOME', String(title));
  // The height counts up on screen; wait for it to land.
  s = await state(page);
  const target = String(Math.floor(s.maxHeight));
  await page.waitForFunction((t) => document.querySelector('.results-height-num')?.textContent === t, target, { timeout: 20_000 }).catch(() => undefined);
  const shown = await page.locator('.results-height-num').textContent();
  check('Results show the height reached', shown === target, `${shown} m (max ${s.maxHeight.toFixed(1)})`);
  await tapSelector(page, '.results-continue');
  await page.waitForFunction(() => window.__exo!.state().screen === 'workshop');
  s = await state(page);
  check('CONTINUE returns to the Workshop with the best height saved', s.best > 0, `best ${s.best.toFixed(1)} m`);
} catch (error) {
  check('the script ran to the end', false, error instanceof Error ? error.message.split('\n')[0] : String(error));
} finally {
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
