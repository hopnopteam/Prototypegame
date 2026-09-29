import * as THREE from 'three';
import { formatNumber } from '../core/math';
import { drawIcon, INK, type IconName } from '../ui/icons';

const bubbleCache = new Map<string, THREE.CanvasTexture>();

export type BubbleStyle = 'request' | 'intent' | 'alert' | 'plain';

const BUBBLE_FILL: Record<BubbleStyle, string> = {
  request: '#FFFDF7',
  intent: '#DDEBF4',
  alert: '#FFE3A1',
  plain: 'rgba(0,0,0,0)',
};

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function finishTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Display face for numbers painted into the world (tiles). Falls back cleanly before the web font loads. */
export const TILE_FONT = '"Jost", "Futura", "Century Gothic", "Trebuchet MS", sans-serif';

/** Steps the tip ring is drawn in (must match the gameplay side). */
const RING_STEPS = 12;

/**
 * Speech-bubble texture with an icon, cached per icon + style + ring step. The ring is the generous-tip
 * window on a request: a gold arc that shrinks as it runs out.
 */
export function bubbleTexture(icon: IconName, style: BubbleStyle = 'request', ring = -1): THREE.CanvasTexture {
  const key = `${icon}:${style}:${ring}`;
  const cached = bubbleCache.get(key);
  if (cached) return cached;
  const size = 128;
  const [c, ctx] = canvas(size);
  if (style !== 'plain') {
    const cx = 64;
    const cy = 58;
    ctx.fillStyle = BUBBLE_FILL[style];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.moveTo(53, 97);
    ctx.lineTo(64, 120);
    ctx.lineTo(75, 97);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BUBBLE_FILL[style];
    ctx.beginPath();
    ctx.arc(cx, cy, 39, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, icon, cx - 31, cy - 33, 62);
    if (ring >= 0) {
      const fraction = Math.min(1, ring / RING_STEPS);
      ctx.lineCap = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(43, 34, 48, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, 51, 0, Math.PI * 2);
      ctx.stroke();
      if (fraction > 0) {
        ctx.strokeStyle = fraction > 0.5 ? '#F2B233' : '#F6D27A';
        ctx.beginPath();
        ctx.arc(cx, cy, 51, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        ctx.stroke();
      }
    }
  } else {
    drawIcon(ctx, icon, 8, 8, 112);
  }
  const texture = finishTexture(c);
  bubbleCache.set(key, texture);
  return texture;
}

/** Bubbles and icons are UI in the world: drawn over walls and furniture so a wall never cuts one in half. */
export function makeSprite(texture: THREE.Texture, size: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Unlock tile face: icon, price and fill progress painted on one canvas lying on the floor. Redrawn only
 * when the numbers change, so tiles cost nothing while idle.
 */
export class TileFace {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private last = '';

  constructor() {
    const [c, ctx] = canvas(256);
    this.ctx = ctx;
    this.texture = finishTexture(c);
  }

  /**
   * `locked`: a preview of something not yet available (greyed, with a padlock). The face is a little
   * title card: cream card, a double border in the state colour, the icon, and the price in bold caps.
   */
  draw(icon: IconName, remaining: number, progress: number, affordable: boolean, highlight: boolean, locked = false): void {
    const key = `${icon}|${Math.ceil(remaining)}|${progress.toFixed(2)}|${affordable}|${highlight}|${locked}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 256);
    const path = (inset: number, r = 30): void => {
      const x = inset;
      const y = inset;
      const size = 256 - inset * 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + size, y, x + size, y + size, r);
      ctx.arcTo(x + size, y + size, x, y + size, r);
      ctx.arcTo(x, y + size, x, y, r);
      ctx.arcTo(x, y, x + size, y, r);
      ctx.closePath();
    };
    const state = locked ? 'rgba(90, 80, 70, 0.45)' : highlight ? '#F2B233' : affordable ? '#4E9A6E' : '#C39A6B';
    path(8);
    ctx.fillStyle = locked ? 'rgba(236, 228, 214, 0.6)' : 'rgba(251, 243, 228, 0.95)';
    ctx.fill();
    if (progress > 0) {
      ctx.save();
      path(8);
      ctx.clip();
      ctx.fillStyle = 'rgba(242, 178, 51, 0.8)';
      const h = 240 * progress;
      ctx.fillRect(8, 248 - h, 240, h);
      ctx.restore();
    }
    path(8);
    ctx.lineWidth = 12;
    ctx.strokeStyle = state;
    ctx.stroke();
    path(26, 18);
    ctx.lineWidth = 3;
    ctx.strokeStyle = locked ? 'rgba(90, 80, 70, 0.3)' : state;
    ctx.stroke();
    ctx.globalAlpha = locked ? 0.45 : 1;
    drawIcon(ctx, icon, 76, 36, 104);
    ctx.fillStyle = INK;
    ctx.font = `700 56px ${TILE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatNumber(Math.ceil(remaining)), 146, 190);
    drawIcon(ctx, 'cash', 30, 166, 46);
    ctx.globalAlpha = 1;
    if (locked) drawIcon(ctx, 'lock', 156, 18, 78);
    this.texture.needsUpdate = true;
  }

  /** Forces a redraw (e.g. once web fonts have loaded). */
  invalidate(): void {
    this.last = '';
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Station name board: a navy enamel sign with a double cream border and widely spaced capitals. */
export function signTexture(text: string, background: string, foreground: string, width = 512, height = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.fillStyle = foreground;
  const label = text.toUpperCase();
  let size = Math.floor(height * 0.4);
  const spacing = (): number => size * 0.16;
  ctx.font = `700 ${size}px ${TILE_FONT}`;
  const measure = (): number => [...label].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing() * (label.length - 1);
  while (measure() > width - 70 && size > 18) {
    size -= 2;
    ctx.font = `700 ${size}px ${TILE_FONT}`;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = (width - measure()) / 2;
  for (const ch of label) {
    ctx.fillText(ch, x, height / 2 + 3);
    x += ctx.measureText(ch).width + spacing();
  }
  return finishTexture(c);
}

/** What a guest leaves behind: a tea ring and a scatter of crumbs. */
let dirtTexture: THREE.CanvasTexture | null = null;
export function getDirtTexture(): THREE.CanvasTexture {
  if (dirtTexture) return dirtTexture;
  const [c, ctx] = canvas(128);
  ctx.strokeStyle = 'rgba(122, 84, 48, 0.75)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(60, 62, 30, 0.3, Math.PI * 1.85);
  ctx.stroke();
  ctx.fillStyle = 'rgba(140, 98, 58, 0.35)';
  ctx.beginPath();
  ctx.arc(60, 62, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(110, 74, 40, 0.85)';
  const crumbs = [[98, 30, 5], [104, 48, 4], [92, 96, 6], [26, 100, 4], [20, 40, 5], [36, 18, 3], [108, 84, 3], [70, 112, 4]];
  for (const [x, y, r] of crumbs) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  dirtTexture = finishTexture(c);
  return dirtTexture;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, maxWidth: number, min = 14): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${TILE_FONT}`;
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${TILE_FONT}`;
  }
  return size;
}

/** A little side-on train in the player's livery, for posters and billboards. */
function drawTrainSide(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, body: string, trim: string): void {
  const h = width * 0.14;
  const loco = width * 0.26;
  const car = (width - loco) / 2 - 4;
  const wheel = h * 0.18;
  ctx.fillStyle = '#3B3A48';
  ctx.fillRect(x, y + h, width, 3);
  // Locomotive: boiler, cab and chimney.
  ctx.fillStyle = body;
  ctx.fillRect(x + loco * 0.35, y, loco * 0.65, h);
  ctx.beginPath();
  ctx.roundRect(x, y + h * 0.3, loco * 0.7, h * 0.7, h * 0.3);
  ctx.fill();
  ctx.fillRect(x + loco * 0.14, y - h * 0.3, loco * 0.12, h * 0.5);
  ctx.fillStyle = trim;
  ctx.fillRect(x, y + h * 0.62, width, h * 0.08);
  for (let i = 0; i < 2; i++) {
    const cx = x + loco + 4 + i * (car + 4);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(cx, y, car, h, 3);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(cx, y + h * 0.62, car, h * 0.08);
    ctx.fillStyle = '#FFE7A8';
    const windows = 4;
    const ww = car / (windows * 1.6);
    for (let k = 0; k < windows; k++) ctx.fillRect(cx + ww * 0.5 + k * ww * 1.6, y + h * 0.18, ww, h * 0.34);
  }
  ctx.fillStyle = '#2E2C38';
  for (let wx = x + wheel * 1.6; wx < x + width - wheel; wx += wheel * 3.2) {
    ctx.beginPath();
    ctx.arc(wx, y + h + 1, wheel, 0, Math.PI * 2);
    ctx.fill();
  }
  // A puff of steam.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [dx, dy, r] of [[0.2, -0.55, 0.28], [0.05, -0.85, 0.36], [-0.15, -1.2, 0.3]]) {
    ctx.beginPath();
    ctx.arc(x + loco * dx + loco * 0.2, y + h * dy, h * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The carriage nameboard: the train's name in navy on cream, framed in gold (Pullman style). */
export function nameboardTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#C9A04A';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 64, 14);
  ctx.fill();
  ctx.fillStyle = '#FBF4E2';
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 52, 10);
  ctx.fill();
  const label = name.toUpperCase();
  fitFont(ctx, label, 700, 36, 440);
  ctx.fillStyle = '#26324F';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 34);
  return finishTexture(c);
}

/** A station poster: "Ride {name}", the train in its livery, the line underneath. */
export function posterTexture(name: string, body: string, trim: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#FBF4E2';
  ctx.fillRect(0, 0, 256, 320);
  const sky = ctx.createLinearGradient(0, 70, 0, 230);
  sky.addColorStop(0, '#F9D9B8');
  sky.addColorStop(1, '#F6E9C9');
  ctx.fillStyle = sky;
  ctx.fillRect(14, 70, 228, 160);
  ctx.fillStyle = '#E9A86B';
  ctx.beginPath();
  ctx.arc(190, 120, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9CC08E';
  ctx.beginPath();
  ctx.moveTo(14, 200);
  ctx.quadraticCurveTo(90, 160, 150, 196);
  ctx.quadraticCurveTo(200, 176, 242, 190);
  ctx.lineTo(242, 230);
  ctx.lineTo(14, 230);
  ctx.fill();
  drawTrainSide(ctx, 26, 186, 204, body, trim);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 256, 62);
  ctx.fillStyle = '#FBF4E2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 20px ${TILE_FONT}`;
  ctx.fillText('RIDE THE NIGHT SLEEPER', 128, 32);
  const label = name.toUpperCase();
  fitFont(ctx, label, 800, 34, 228);
  ctx.fillStyle = '#26324F';
  ctx.fillText(label, 128, 262);
  ctx.font = `500 16px ${TILE_FONT}`;
  ctx.fillStyle = '#6B6272';
  ctx.fillText('Countryside Line · Nightly', 128, 296);
  ctx.strokeStyle = '#C9A04A';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 312);
  return finishTexture(c);
}

/** A roadside billboard: the train big, its name, and what everyone is saying. */
export function billboardTexture(name: string, body: string, trim: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#BFD8EE');
  sky.addColorStop(1, '#F7E6C8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#A8CB94';
  ctx.beginPath();
  ctx.moveTo(0, 200);
  ctx.quadraticCurveTo(180, 170, 300, 196);
  ctx.quadraticCurveTo(420, 180, 512, 192);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.fill();
  drawTrainSide(ctx, 40, 150, 290, body, trim);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#26324F';
  const label = name.toUpperCase();
  fitFont(ctx, label, 800, 46, 470);
  ctx.fillText(label, 22, 62);
  ctx.font = `600 22px ${TILE_FONT}`;
  ctx.fillStyle = '#5A5064';
  ctx.fillText('The sleeper everyone is talking about', 24, 96);
  ctx.fillStyle = '#E2A93B';
  ctx.font = `700 34px ${TILE_FONT}`;
  ctx.fillText('★★★★★', 350, 190);
  ctx.strokeStyle = '#FBF4E2';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 246);
  return finishTexture(c);
}

/** The newsstand board: the Rail Gazette masthead over today's headline. */
export function headlineTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#FBF4E2';
  ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = '#26324F';
  ctx.fillRect(0, 0, 320, 48);
  ctx.fillStyle = '#FBF4E2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 26px ${TILE_FONT}`;
  ctx.fillText('RAIL GAZETTE', 160, 26);
  ctx.fillStyle = '#26324F';
  // Wrap the headline onto up to three lines, as big as fits.
  const words = text.toUpperCase().split(/\s+/);
  let size = 34;
  let lines: string[] = [];
  for (; size >= 16; size -= 2) {
    ctx.font = `800 ${size}px ${TILE_FONT}`;
    lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > 290 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= 290)) break;
  }
  const lineHeight = size * 1.1;
  const top = 124 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 160, top + i * lineHeight));
  ctx.strokeStyle = '#26324F';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 314, 194);
  return finishTexture(c);
}
