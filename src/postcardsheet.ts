/**
 * Postcard sheet (session 43): every station's stamp and the blank one, for art review.
 * Build: ENTRY=src/postcardsheet.ts OUT=postcardsheet.html node scripts/build.mjs, then open dist/postcardsheet.html.
 */
import { STATIONS } from './config/content';
import { drawBlankStamp, drawPostcard, postcardFontsReady } from './ui/postcard';

document.body.innerHTML = '';
document.documentElement.style.cssText = 'overflow:auto;height:auto;background:#6B4F34';
document.body.style.cssText = 'margin:0;background:#6B4F34;overflow:auto;height:auto;position:static';
const grid = document.createElement('div');
grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,240px);gap:18px;padding:18px';
document.body.appendChild(grid);
const times: number[] = [];
void postcardFontsReady().then(() => {
  STATIONS.forEach((s, i) => {
    const c = document.createElement('canvas');
    const t0 = performance.now();
    drawPostcard(c, s.postcard, { name: s.name, kicker: 'Countryside Line', number: i + 1, value: 10 + i * 5 });
    times.push(Math.round(performance.now() - t0));
    c.style.cssText = 'width:240px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.4))';
    grid.appendChild(c);
  });
  const small = document.createElement('canvas');
  const t1 = performance.now();
  drawPostcard(small, STATIONS[0].postcard, { name: STATIONS[0].name, kicker: 'Countryside Line', number: 1, value: 10 }, 0.34);
  times.push(Math.round((performance.now() - t1) * 10) / 10);
  small.style.cssText = 'width:80px';
  grid.appendChild(small);
  const blank = document.createElement('canvas');
  drawBlankStamp(blank);
  blank.style.cssText = 'width:240px';
  grid.appendChild(blank);
  document.body.dataset.times = times.join(',');
  document.body.dataset.ready = '1';
});
