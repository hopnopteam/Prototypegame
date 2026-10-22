/**
 * Icon sheet (session 35): every icon at HUD size and inside the world's bubbles and job badges, for art review.
 * Build: ENTRY=src/iconsheet.ts OUT=iconsheet.html node scripts/build.mjs, then open dist/iconsheet.html.
 */
import { ICON_NAMES, drawIcon, type IconName } from './ui/icons';
import { bubbleTexture } from './world/sprites';

document.body.innerHTML = '';
document.documentElement.style.cssText = 'overflow:auto;height:auto;background:#3a4258';
const names = (new URLSearchParams(location.search).get('only') ?? '').split(',').filter(Boolean) as IconName[];
const all = names.length ? names : ICON_NAMES;
document.body.style.cssText = 'margin:0;background:#3a4258;font:12px sans-serif;color:#fff;overflow:auto;height:auto;position:static';
const grid = document.createElement('div');
grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px';
document.body.appendChild(grid);
for (const name of all) {
  const cell = document.createElement('div');
  cell.style.cssText = 'width:300px;display:flex;align-items:center;gap:4px;background:#556;padding:4px;border-radius:6px';
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  drawIcon(c.getContext('2d') as CanvasRenderingContext2D, name, 0, 0, 96);
  cell.appendChild(c);
  for (const style of ['request', 'job'] as const) {
    const img = bubbleTexture(name, style).image as HTMLCanvasElement;
    img.style.cssText = 'width:96px;height:96px';
    cell.appendChild(img);
  }
  const label = document.createElement('div');
  label.textContent = name;
  cell.appendChild(label);
  grid.appendChild(cell);
}
