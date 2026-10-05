import { CLASS_BY_ID, type ClassId } from '../config/classes';
import * as THREE from 'three';
import { formatNumber } from '../core/math';
import { drawIcon, INK, type IconName } from '../ui/icons';

const bubbleCache = new Map<string, THREE.CanvasTexture>();

/** Request styles, plus one per carriage class (a ticket held up on the platform in its class's colour). */
export type BubbleStyle = 'request' | 'intent' | 'alert' | 'plain' | ClassId;

const BUBBLE_FILL: Record<BubbleStyle, string> = {
  request: '#FFFDF7',
  intent: '#DDEBF4',
  alert: '#FFE3A1',
  plain: 'rgba(0,0,0,0)',
  basic: CLASS_BY_ID.basic.color,
  comfort: CLASS_BY_ID.comfort.color,
  business: CLASS_BY_ID.business.color,
  first: CLASS_BY_ID.first.color,
  royal: CLASS_BY_ID.royal.color,
};

function canvas(size: number, resolution = 1): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(size * resolution);
  c.height = Math.round(size * resolution);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  // Drawn in `size` units whatever the resolution, so the artwork code never changes.
  if (resolution !== 1) ctx.scale(resolution, resolution);
  return [c, ctx];
}

/**
 * Bubbles and the guide arrow show about 60 CSS pixels across, so 175 device pixels on a 3× phone: drawn at
 * 1.5× their old 128 px so they stay crisp (session 19) without making the cache of ring steps heavy.
 */
const WORLD_UI_RES = 1.5;

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
  const [c, ctx] = canvas(size, WORLD_UI_RES);
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
let guideArrow: THREE.CanvasTexture | null = null;

/**
 * The guide arrow (session 17): a chunky gold arrow pointing down, in the HUD's pop style (a 3 px ink line at
 * HUD size, a highlight down one side), drawn flat to the screen so it always reads as an arrow. It used to be a
 * lit four-sided cone that, seen from above at night, looked like a dull khaki box floating over the train.
 */
export function guideArrowTexture(): THREE.CanvasTexture {
  if (guideArrow) return guideArrow;
  const size = 128;
  const [c, ctx] = canvas(size, WORLD_UI_RES);
  const shaft = { x0: 44, x1: 84, y0: 10, y1: 62 };
  const head = { x0: 14, x1: 114, y0: 58, tip: 118 };
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(shaft.x0, shaft.y0 + 8);
    ctx.quadraticCurveTo(shaft.x0, shaft.y0, shaft.x0 + 8, shaft.y0);
    ctx.lineTo(shaft.x1 - 8, shaft.y0);
    ctx.quadraticCurveTo(shaft.x1, shaft.y0, shaft.x1, shaft.y0 + 8);
    ctx.lineTo(shaft.x1, head.y0);
    ctx.lineTo(head.x1 - 6, head.y0);
    ctx.quadraticCurveTo(head.x1 + 2, head.y0, head.x1 - 4, head.y0 + 7);
    ctx.lineTo(70, head.tip - 3);
    ctx.quadraticCurveTo(64, head.tip + 3, 58, head.tip - 3);
    ctx.lineTo(head.x0 + 4, head.y0 + 7);
    ctx.quadraticCurveTo(head.x0 - 2, head.y0, head.x0 + 6, head.y0);
    ctx.lineTo(shaft.x0, head.y0);
    ctx.closePath();
  };
  const fill = ctx.createLinearGradient(0, shaft.y0, 0, head.tip);
  fill.addColorStop(0, '#FFE58A');
  fill.addColorStop(1, '#F2B338');
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // A highlight down the left of the shaft: the HUD's bevel.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(shaft.x0 + 7, shaft.y0 + 9, 7, head.y0 - shaft.y0 - 12);
  guideArrow = finishTexture(c);
  return guideArrow;
}

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
    // A cream enamel face whose rim says the state (green: you can afford it, gold: paying, sand: saving
    // up). While you pay, a green fill rises from the bottom: the money going in, clearly visible.
    const face = locked ? ['#E4DCCD', '#CFC5B4'] : ['#FFFBF1', '#F1E3C6'];
    const rim = locked ? 'rgba(90, 80, 70, 0.5)' : highlight ? '#E0A020' : affordable ? '#3E9A56' : '#B98D5C';
    path(10);
    const gradient = ctx.createLinearGradient(0, 10, 0, 246);
    gradient.addColorStop(0, face[0]);
    gradient.addColorStop(1, face[1]);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = locked ? 0.7 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (affordable && !highlight && progress <= 0 && !locked) {
      // Ready to buy: a soft green wash so it reads from across the carriage.
      path(10);
      ctx.fillStyle = 'rgba(111, 194, 90, 0.28)';
      ctx.fill();
    }
    if (progress > 0) {
      ctx.save();
      path(10);
      ctx.clip();
      const h = 236 * Math.min(1, progress);
      const fill = ctx.createLinearGradient(0, 246 - h, 0, 246);
      fill.addColorStop(0, '#8FD57E');
      fill.addColorStop(1, '#4FAE5F');
      ctx.fillStyle = fill;
      ctx.fillRect(10, 246 - h, 236, h);
      // The rising edge: a bright line so the level reads at a glance.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(10, 246 - h - 3, 236, 6);
      ctx.restore();
    }
    // A light top edge inside the rim: the enamel catches the light.
    path(22, 22);
    ctx.lineWidth = 5;
    ctx.strokeStyle = locked ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    path(10);
    ctx.lineWidth = 14;
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.globalAlpha = locked ? 0.5 : 1;
    drawIcon(ctx, icon, 72, 30, 112);
    const price = formatNumber(Math.ceil(remaining));
    ctx.font = `800 60px ${TILE_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = INK;
    ctx.strokeText(price, 148, 192);
    ctx.fillStyle = '#FFFDF7';
    ctx.fillText(price, 148, 192);
    drawIcon(ctx, 'cash', 26, 166, 48);
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

/**
 * A tile's floating marker: what it unlocks (icon and a short name) and its price, on a little pill with a
 * pointer down to the plate. Drawn over walls and furniture, so a tile in a narrow room is never hidden and
 * never a mystery (session 14, owner: "the upgrade boxes are hidden and I have no idea what they are").
 */
export class TileMarker {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private last = '';

  constructor() {
    const c = document.createElement('canvas');
    c.width = 320 * MARKER_RES;
    c.height = 128 * MARKER_RES;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = finishTexture(c);
    // UI in the world: true colours (no night grade or fog), drawn over walls.
    // A constant size on screen (like a HUD label pinned to the world), so it reads at any zoom.
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, sizeAttenuation: false }));
    this.sprite.scale.set(TILE_MARKER_WIDTH, TILE_MARKER_WIDTH * TILE_MARKER_ASPECT, 1);
    this.sprite.renderOrder = 9;
  }

  draw(icon: IconName, name: string, price: number, affordable: boolean, locked = false): void {
    const key = `${icon}|${name}|${Math.ceil(price)}|${affordable}|${locked}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.setTransform(MARKER_RES, 0, 0, MARKER_RES, 0, 0);
    ctx.clearRect(0, 0, 320, 128);
    ctx.lineJoin = 'round';
    // The pointer, then the pill over it (one outline).
    const pill = (): void => {
      ctx.beginPath();
      ctx.moveTo(48, 8);
      ctx.arcTo(312, 8, 312, 96, 40);
      ctx.arcTo(312, 96, 8, 96, 40);
      ctx.lineTo(176, 96);
      ctx.lineTo(160, 120);
      ctx.lineTo(144, 96);
      ctx.arcTo(8, 96, 8, 8, 40);
      ctx.arcTo(8, 8, 312, 8, 40);
      ctx.closePath();
    };
    pill();
    const fill = ctx.createLinearGradient(0, 8, 0, 96);
    if (locked) {
      fill.addColorStop(0, '#E9E2D6');
      fill.addColorStop(1, '#D4CBBB');
    } else if (affordable) {
      fill.addColorStop(0, '#F1FBEA');
      fill.addColorStop(1, '#CFEBC2');
    } else {
      fill.addColorStop(0, '#FFFBF1');
      fill.addColorStop(1, '#F1E3C6');
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // The icon on a white disc.
    ctx.beginPath();
    ctx.arc(54, 52, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = affordable && !locked ? '#3E9A56' : '#B98D5C';
    ctx.stroke();
    drawIcon(ctx, locked ? 'lock' : icon, 26, 24, 56);
    // The name (short caps) over the price.
    ctx.fillStyle = '#6B5B4B';
    ctx.textBaseline = 'alphabetic';
    // The name shrinks to fit before it would ever be cut short.
    let label = name.toUpperCase();
    let size = 25;
    ctx.font = `700 ${size}px ${TILE_FONT}`;
    while (size > 17 && ctx.measureText(label).width > 196) ctx.font = `700 ${--size}px ${TILE_FONT}`;
    while (label.length > 3 && ctx.measureText(`${label}…`).width > 196 && ctx.measureText(label).width > 196) label = label.slice(0, -1);
    if (label !== name.toUpperCase()) label = `${label.trimEnd()}…`;
    ctx.fillText(label, 100, 44);
    drawIcon(ctx, 'cash', 98, 52, 34);
    ctx.fillStyle = INK;
    ctx.font = `800 38px ${TILE_FONT}`;
    ctx.fillText(formatNumber(Math.ceil(price)), 138, 84);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.sprite.material as THREE.Material).dispose();
  }
}

/**
 * The marker's width on screen, as a fraction of the view's height at unit distance (three.js sprites without
 * size attenuation): about a third of a phone's width.
 */
export const TILE_MARKER_WIDTH = 0.095;
/** The marker's height (as a share of its width) and where its pointer's tip sits below its centre (share of height). */
export const TILE_MARKER_ASPECT = 0.4;
export const TILE_MARKER_TIP = 120 / 128 - 0.5;
/** Canvas pixels per marker design unit (crisp on high-density screens). */
const MARKER_RES = 1.6;

