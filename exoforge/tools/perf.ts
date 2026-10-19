// npm run perf: flies 15 s of hops with the CPU throttled 4× (SPEC A13) and reports the CPU cost of a frame and
// of a simulation step, and the draw calls. The GPU here is a software renderer, so frame rate itself is judged
// on a phone; this checks the CPU side has room for 60 fps (16.7 ms) on a slow phone.
import { openPhone, state, Thumb, waitSim, tapSelector } from './lib/browser';

const { browser, page, cdp, errors } = await openPhone(390, 844, 1);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await tapSelector(page, '.workshop-fly');
await page.waitForFunction(() => window.__exo!.state().screen === 'flight');
await page.evaluate(() => {
  const p = window.__exo!.game.perf;
  p.cpuFrameMaxMs = 0;
  p.maxDrawCalls = 0;
});
const thumb = new Thumb(cdp);
for (let i = 0; i < 6; i++) {
  await thumb.down(195, 520);
  await thumb.slide(i % 2 ? -50 : 50, 3);
  await waitSim(page, 1.4);
  await thumb.up();
  await waitSim(page, 1.0);
}
const s = await state(page);
const spikes = await page.evaluate(() => window.__exo!.game.spikes);
await browser.close();
console.log('slow frames (CPU ms):', JSON.stringify(spikes));
console.log(`CPU ×4 throttled: frame ${s.cpuFrameMs.toFixed(2)} ms average, ${s.cpuFrameMaxMs.toFixed(1)} ms worst; sim ${s.simMsPerStep.toFixed(3)} ms per step (${(s.simMsPerStep * 2).toFixed(2)} ms per frame at 60 fps); draw calls at most ${s.maxDrawCalls}`);
const ok = s.cpuFrameMs < 8 && s.maxDrawCalls < 150 && errors.length === 0;
console.log(ok ? 'perf: PASS (under half a 60 fps frame on the CPU)' : `perf: FAIL ${errors.join(' | ')}`);
process.exit(ok ? 0 : 1);
