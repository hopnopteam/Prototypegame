import { CLASS_BY_ID, type ClassId } from '../config/classes';
import * as THREE from 'three';
import { formatNumber } from '../core/math';
import { drawIcon, INK, type IconName } from '../ui/icons';
import { shadeHex } from './palette';

const bubbleCache = new Map<string, THREE.CanvasTexture>();

/** Request styles, plus one per carriage class (a ticket held up on the platform in its class's colour). */
export type BubbleStyle = 'request' | 'intent' | 'alert' | 'plain' | 'job' | 'cash' | 'sleep' | ClassId;


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
 * 1.5× their old 128 px so they stay crisp (session 19); session 35 (owner: "the quality of logos…"): 2×, so the
 * icon inside reads sharp on a 3× phone (a bubble is a 256 px texture, 256 KB of GPU memory each).
 */
const WORLD_UI_RES = 2;

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

/** A tile's price is repainted at most this often while it counts down. */
const PRICE_REPAINT_MS = 33;

/**
 * Speech-bubble texture with an icon, cached per icon + style + ring step. The ring is the generous-tip
 * window on a request: a gold arc that shrinks as it runs out.
 */
const floorIcons = new Map<IconName, THREE.CanvasTexture>();
/**
 * A pad's icon as a white glyph printed on the floor (session 24, My Perfect Hotel's pads): the icon drawn once,
 * then every pixel it covers painted white, so it reads as a clean sign on any colour of pad.
 */
export function floorIconTexture(icon: IconName): THREE.CanvasTexture {
  const cached = floorIcons.get(icon);
  if (cached) return cached;
  const [c, ctx] = canvas(128);
  drawIcon(ctx, icon, 16, 16, 96);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'source-over';
  const t = finishTexture(c);
  floorIcons.set(icon, t);
  return t;
}

/**
 * Visual overhaul: the request pins read as soft enamel buttons (ART_BIBLE.md, "UI"): a lit top, a shaded bottom and a
 * gloss highlight, drawn over the pin's own fill so its colour (grey-green waiting, gold active, blue job) is unchanged.
 */
function pinGloss(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const shade = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  shade.addColorStop(0, 'rgba(255,255,255,0.28)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(20,16,40,0.26)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.18, cy - r * 0.62, r * 0.55, r * 0.2, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * De-Slop Stage B (B1): one sign over the world. Every badge and bubble is the same pin: an ink-outlined disc on a
 * pointer, a coloured rim, a white face, the icon on the face and the enamel gloss. The rim's colour says what kind of
 * sign it is, and means one thing only: blue a job for you, white (no rim) a guest asking, gold money, the class colour a
 * passenger's ticket or key, slate a helper's intent. Tile markers (green, an upgrade) and the guide arrow share the
 * outline weight and pointer.
 */
const PIN = { cx: 64, cy: 56, r: 44, rim: 9, tipY: 120, tipHalf: 13, ink: 6, icon: 62 };
const PIN_RIM: Record<BubbleStyle, string | null> = {
  request: null,
  intent: '#8FA4B6',
  alert: '#E9A23B',
  plain: null,
  job: '#3E9BE0',
  cash: '#E7B23A',
  // De-Slop B7: a sleeper's Zzz in the same pin, a dusk-blue rim (it floated bare, in a style of its own).
  sleep: '#7B86B8',
  basic: CLASS_BY_ID.basic.color,
  comfort: CLASS_BY_ID.comfort.color,
  business: CLASS_BY_ID.business.color,
  first: CLASS_BY_ID.first.color,
  royal: CLASS_BY_ID.royal.color,
};

/** The pin's outline: the disc and its pointer as one shape. */
function pinPath(ctx: CanvasRenderingContext2D, r: number): void {
  const { cx, cy, tipY, tipHalf } = PIN;
  const a = Math.asin(tipHalf / r);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2);
  ctx.lineTo(cx + tipHalf * 0.35, tipY - 3);
  ctx.quadraticCurveTo(cx, tipY + 2, cx - tipHalf * 0.35, tipY - 3);
  ctx.closePath();
}

function drawPin(ctx: CanvasRenderingContext2D, rim: string | null, icon: IconName): void {
  const { cx, cy, r } = PIN;
  ctx.lineJoin = 'round';
  pinPath(ctx, r);
  ctx.fillStyle = rim ?? '#FFFDF7';
  ctx.fill();
  ctx.lineWidth = PIN.ink;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const face = rim ? r - PIN.rim : r - 1;
  ctx.fillStyle = '#FFFDF7';
  ctx.beginPath();
  ctx.arc(cx, cy, face, 0, Math.PI * 2);
  ctx.fill();
  if (rim) {
    // A fine dark line where the rim meets the face, so a pale rim still reads as a ring.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(43, 34, 48, 0.35)';
    ctx.stroke();
  }
  pinGloss(ctx, cx, cy, r - 2);
  const size = rim ? PIN.icon : PIN.icon + 6;
  drawIcon(ctx, icon, cx - size / 2, cy - size / 2 - 1, size);
}

export function bubbleTexture(icon: IconName, style: BubbleStyle = 'request', ring = -1): THREE.CanvasTexture {
  const key = `${icon}:${style}:${ring}`;
  const cached = bubbleCache.get(key);
  if (cached) return cached;
  const size = 128;
  const [c, ctx] = canvas(size, WORLD_UI_RES);
  if (style === 'plain') {
    drawIcon(ctx, icon, 8, 8, 112);
  } else {
    drawPin(ctx, PIN_RIM[style], icon);
    if (ring >= 0) {
      const fraction = Math.min(1, ring / RING_STEPS);
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(43, 34, 48, 0.25)';
      ctx.beginPath();
      ctx.arc(PIN.cx, PIN.cy, PIN.r + 8, 0, Math.PI * 2);
      ctx.stroke();
      if (fraction > 0) {
        ctx.strokeStyle = fraction > 0.5 ? '#F2B233' : '#F6D27A';
        ctx.beginPath();
        ctx.arc(PIN.cx, PIN.cy, PIN.r + 8, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  const texture = finishTexture(c);
  bubbleCache.set(key, texture);
  return texture;
}

/**
 * Session 38b (owner, with the ad playable: "the character reaction and emoji thing… completely implement it"): how a
 * passenger feels, shown as a drawn face in their bubble beside what they want. `wait` a calm smile, `angry` red with
 * knitted brows (they have waited too long, or leave unhappy), `love` heart eyes and a grin (just served).
 */
export type Mood = 'wait' | 'angry' | 'love';

/** A round face drawn on a canvas (never an emoji: emoji fonts differ on every phone, some draw a black box). */
export function drawFace(ctx: CanvasRenderingContext2D, mood: Mood, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r / 50, r / 50);
  const grad = ctx.createRadialGradient(-14, -18, 6, 0, 0, 52);
  if (mood === 'angry') {
    grad.addColorStop(0, '#FF9A7A');
    grad.addColorStop(1, '#E2483A');
  } else {
    grad.addColorStop(0, '#FFF27A');
    grad.addColorStop(1, '#FFC21A');
  }
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#5A3A10';
  ctx.stroke();
  ctx.fillStyle = '#3B2210';
  ctx.strokeStyle = '#3B2210';
  ctx.lineCap = 'round';
  if (mood === 'love') {
    for (const ex of [-17, 17]) {
      ctx.save();
      ctx.translate(ex, -8);
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.bezierCurveTo(-16, 0, -12, -15, 0, -7);
      ctx.bezierCurveTo(12, -15, 16, 0, 0, 10);
      ctx.fillStyle = '#F2405A';
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-20, 12);
    ctx.quadraticCurveTo(0, 38, 20, 12);
    ctx.closePath();
    ctx.fillStyle = '#7A2A20';
    ctx.fill();
  } else if (mood === 'angry') {
    ctx.lineWidth = 6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 28, -22);
      ctx.lineTo(side * 8, -12);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(side * 16, -2, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-16, 26);
    ctx.quadraticCurveTo(0, 12, 16, 26);
    ctx.stroke();
  } else {
    for (const ex of [-16, 16]) {
      ctx.beginPath();
      ctx.ellipse(ex, -8, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-18, 14);
    ctx.quadraticCurveTo(0, 30, 18, 14);
    ctx.stroke();
  }
  ctx.restore();
}

/** The mood bubble's canvas (square) and where its tail's tip sits, as a share of its height from the bottom. */
export const MOOD_BUBBLE_PX = 256;
const moodCache = new Map<string, THREE.CanvasTexture>();

/**
 * A passenger's bubble (after the ad playable): a rounded bubble with a tail at the bottom middle, the face and, beside
 * it, what they want. Red-edged and pink when they are cross. Cached per mood and icon.
 */
export function moodBubbleTexture(mood: Mood, icon: IconName | null): THREE.CanvasTexture {
  const key = `${mood}:${icon ?? ''}`;
  const cached = moodCache.get(key);
  if (cached) return cached;
  const S = MOOD_BUBBLE_PX;
  const [c, ctx] = canvas(S, WORLD_UI_RES);
  const w = icon ? 220 : 136;
  const h = 128;
  const x0 = (S - w) / 2;
  const y0 = 46;
  const r = 52;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
  ctx.arcTo(x0 + w, y0 + h, S / 2 + 16, y0 + h, r);
  ctx.lineTo(S / 2 + 16, y0 + h);
  ctx.lineTo(S / 2, y0 + h + 26);
  ctx.lineTo(S / 2 - 16, y0 + h);
  ctx.arcTo(x0, y0 + h, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + w, y0, r);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = mood === 'angry' ? '#B3243B' : INK;
  ctx.stroke();
  ctx.fillStyle = mood === 'angry' ? '#FFE6E2' : '#FFFFFF';
  ctx.fill();
  const cy = y0 + h / 2 + 3;
  if (icon) {
    drawFace(ctx, mood, S / 2 - 50, cy, 40);
    drawIcon(ctx, icon, S / 2 + 50 - 43, cy - 43, 86);
  } else drawFace(ctx, mood, S / 2, cy, 44);
  const texture = finishTexture(c);
  moodCache.set(key, texture);
  return texture;
}

/** Where the job badge's disc sits on its 128-pixel canvas (its pointer hangs below it). */
const JOB_BADGE_CX = PIN.cx;
const JOB_BADGE_CY = PIN.cy;

/**
 * The ring round a job's badge that fills as the job is done (session 27): a white annulus just outside the badge's
 * blue rim, on the badge's own canvas size, so the two sprites line up. The fill material colours it and sweeps it.
 */
let jobFill: THREE.CanvasTexture | null = null;
export function jobFillTexture(): THREE.CanvasTexture {
  if (jobFill) return jobFill;
  const [c, ctx] = canvas(128, WORLD_UI_RES);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(JOB_BADGE_CX, JOB_BADGE_CY, PIN.r + 9, 0, Math.PI * 2);
  ctx.stroke();
  jobFill = finishTexture(c);
  return jobFill;
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
  // De-Slop B1: a bevel like the pins' enamel: inside the outline, the edge lit at the top left and shaded at the
  // bottom right (the outline drawn shifted, clipped to the arrow), so it reads as a raised piece, not a flat shape.
  ctx.save();
  path();
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.translate(3.5, 3.5);
  path();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.stroke();
  ctx.translate(-7, -7);
  path();
  ctx.strokeStyle = 'rgba(176, 104, 18, 0.55)';
  ctx.stroke();
  ctx.restore();
  path();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
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
/** The rounded card every tile face is cut to (inset 10 of 256, corner 30), as a canvas path. */
function tilePath(ctx: CanvasRenderingContext2D, inset: number, r = 30): void {
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
}

let fillMask: THREE.CanvasTexture | null = null;
let edgeMask: THREE.CanvasTexture | null = null;

/**
 * The paying fill and its bright rising edge (owner: "money load animation butter smooth"): drawn once, cut to the
 * card's shape, and shown cropped to the level by each tile's own texture transform (a clone shares the image, so it
 * uploads once). The level then moves every frame with no redraw at all; it used to be repainted in 1/24 steps.
 */
export function tileFillTextures(): [THREE.CanvasTexture, THREE.CanvasTexture] {
  if (!fillMask || !edgeMask) {
    const [f, fx] = canvas(256);
    tilePath(fx, 10);
    const g = fx.createLinearGradient(0, 10, 0, 246);
    g.addColorStop(0, '#9ADB86');
    g.addColorStop(1, '#4FAE5F');
    fx.fillStyle = g;
    fx.fill();
    fillMask = finishTexture(f);
    const [e, ex] = canvas(256);
    tilePath(ex, 10);
    ex.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ex.fill();
    edgeMask = finishTexture(e);
  }
  return [fillMask, edgeMask];
}

export class TileFace {
  /** The card under the fill: its enamel and the "you can afford it" wash. */
  readonly base: THREE.CanvasTexture;
  /** Over the fill: the rim, the icon and the price. */
  readonly texture: THREE.CanvasTexture;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly ctx: CanvasRenderingContext2D;
  private lastBase = '';
  private last = '';
  private lastShape = '';
  private lastPriceAt = 0;

  constructor() {
    const [b, bctx] = canvas(256);
    this.baseCtx = bctx;
    this.base = finishTexture(b);
    const [c, ctx] = canvas(256);
    this.ctx = ctx;
    this.texture = finishTexture(c);
  }

  /**
   * `locked`: a preview of something not yet available (greyed, with a padlock). The face is a little
   * title card: cream card, a double border in the state colour, the icon, and the price in bold caps.
   * The fill itself is the TileView's (`progress` only decides the wash here).
   */
  draw(icon: IconName, remaining: number, progress: number, affordable: boolean, highlight: boolean, locked = false): void {
    const wash = affordable && !highlight && progress <= 0 && !locked;
    const baseKey = `${wash}|${locked}`;
    if (baseKey !== this.lastBase) {
      this.lastBase = baseKey;
      const ctx = this.baseCtx;
      ctx.clearRect(0, 0, 256, 256);
      const face = locked ? ['#E4DCCD', '#CFC5B4'] : ['#FFFBF1', '#F1E3C6'];
      tilePath(ctx, 10);
      const gradient = ctx.createLinearGradient(0, 10, 0, 246);
      gradient.addColorStop(0, face[0]);
      gradient.addColorStop(1, face[1]);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = locked ? 0.7 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (wash) {
        // Ready to buy: a soft green wash so it reads from across the carriage.
        tilePath(ctx, 10);
        ctx.fillStyle = 'rgba(111, 194, 90, 0.28)';
        ctx.fill();
      }
      this.base.needsUpdate = true;
    }
    const shape = `${icon}|${affordable}|${highlight}|${locked}`;
    const key = `${shape}|${Math.ceil(remaining)}`;
    if (key === this.last) return;
    // While paying the price counts down every frame: repaint it at most 30 times a second (each repaint is a
    // texture upload), but at once when anything else about the face changes.
    const now = performance.now();
    if (shape === this.lastShape && now - this.lastPriceAt < PRICE_REPAINT_MS) return;
    this.last = key;
    this.lastShape = shape;
    this.lastPriceAt = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 256);
    const rim = locked ? 'rgba(90, 80, 70, 0.5)' : highlight ? '#E0A020' : affordable ? '#3E9A56' : '#B98D5C';
    // A light top edge inside the rim: the enamel catches the light.
    tilePath(ctx, 22, 22);
    ctx.lineWidth = 5;
    ctx.strokeStyle = locked ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
    tilePath(ctx, 10);
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
    this.lastShape = '';
    this.lastBase = '';
  }

  dispose(): void {
    this.base.dispose();
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
  // De-Slop B7: bigger lettering (it read small on the station's name board), as wide as the frame allows.
  let size = Math.floor(height * 0.5);
  const spacing = (): number => size * 0.16;
  ctx.font = `700 ${size}px ${TILE_FONT}`;
  const measure = (): number => [...label].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing() * (label.length - 1);
  while (measure() > width - 56 && size > 18) {
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

/** The cinema's film (fix list 5.6): a sprite sheet of frames, columns by rows, played at FILM_FPS. */
export const FILM_COLS = 4;
export const FILM_ROWS = 4;
export const FILM_FRAMES = FILM_COLS * FILM_ROWS;
export const FILM_FPS = 8;
let filmSheet: THREE.CanvasTexture | null = null;

/**
 * The cinema's film (fix list 5.6, owner: "the screen should show a simple moving picture, a looping animated film"):
 * a little cartoon, drawn once into a sheet of frames: a night train chugging along under the moon, hills and
 * telegraph poles sliding past at their own speeds, smoke puffing from the chimney. Every motion goes round exactly
 * once per loop, so the last frame runs into the first. The screen steps through the frames by moving the texture's
 * offset (nothing is redrawn or uploaded while it plays).
 */
export function filmTexture(): THREE.CanvasTexture {
  if (filmSheet) return filmSheet;
  const fw = 256;
  const fh = 56;
  const c = document.createElement('canvas');
  c.width = fw * FILM_COLS;
  c.height = fh * FILM_ROWS;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  for (let f = 0; f < FILM_FRAMES; f++) {
    ctx.save();
    ctx.translate((f % FILM_COLS) * fw, Math.floor(f / FILM_COLS) * fh);
    ctx.beginPath();
    ctx.rect(0, 0, fw, fh);
    ctx.clip();
    drawFilmFrame(ctx, fw, fh, f / FILM_FRAMES);
    ctx.restore();
  }
  const texture = finishTexture(c);
  // No mipmaps: a smaller mip would bleed one frame into the next.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(1 / FILM_COLS, 1 / FILM_ROWS);
  filmSheet = texture;
  return texture;
}

let poolSheet: THREE.CanvasTexture | null = null;
/**
 * Phase 4, the Pool Car's water: a seamless tile of aqua with bright caustic lines (where the light through the ripples
 * gathers on the pool floor), part see-through so the tiles show under it. Two planes of it slide over each other at
 * different speeds (CarriageView), so the water shimmers with no shader of its own: the material is the film's (the
 * same program the warm-up compiles).
 */
export function poolTexture(): THREE.CanvasTexture {
  if (poolSheet) return poolSheet;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const image = ctx.createImageData(n, n);
  // A wrapped Voronoi: the caustic lines run where the two nearest points are about as near (cell edges).
  let seed = 7;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const points: [number, number][] = [];
  for (let i = 0; i < 26; i++) points.push([rand() * n, rand() * n]);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, py] of points) {
        let dx = Math.abs(x - px);
        let dy = Math.abs(y - py);
        if (dx > n / 2) dx = n - dx;
        if (dy > n / 2) dy = n - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      // Visual overhaul (owner: "stylised realism"): softer caustics, a thin bright core in a wider glow, over clear
      // water tinted aqua (the tiled floor of the basin shows through).
      const gap = d2 - d1;
      const core = Math.max(0, 1 - gap / 1.6);
      const glow = Math.max(0, 1 - gap / 6);
      const line = Math.min(1, core * core * 0.9 + glow * glow * 0.35);
      const i = (y * n + x) * 4;
      image.data[i] = Math.round(70 + 185 * line);
      image.data[i + 1] = Math.round(190 + 65 * line);
      image.data[i + 2] = Math.round(214 + 41 * line);
      image.data[i + 3] = Math.round(70 + 150 * line);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = finishTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  poolSheet = texture;
  return texture;
}

/** One frame of the cartoon at loop time t (0..1). */
function drawFilmFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const TAU = Math.PI * 2;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1E2D63');
  sky.addColorStop(1, '#55609A');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Stars that twinkle, and the moon.
  for (let i = 0; i < 26; i++) {
    const sx = (i * 97.3) % w;
    const sy = ((i * 37.1) % (h * 0.5)) + 2;
    const tw = 0.55 + 0.45 * Math.sin(TAU * (t * 2 + i * 0.37));
    ctx.fillStyle = `rgba(255, 247, 220, ${tw.toFixed(2)})`;
    ctx.fillRect(sx, sy, 1.4, 1.4);
  }
  ctx.fillStyle = '#F7EDC9';
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.27, h * 0.16, 0, TAU);
  ctx.fill();
  // Hills: each band repeats every frame width and slides a whole number of widths per loop.
  const hills = (base: number, amp: number, waves: number, speed: number, colour: string): void => {
    const shift = t * speed * w;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, base + amp * Math.sin((TAU * waves * (x + shift)) / w) + amp * 0.4 * Math.sin((TAU * waves * 2 * (x + shift)) / w + 1.3));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  hills(h * 0.6, h * 0.1, 2, 1, '#34467A');
  hills(h * 0.74, h * 0.07, 3, 2, '#2A3966');
  // The track bed.
  const rail = h * 0.83;
  ctx.fillStyle = '#1C2647';
  ctx.fillRect(0, rail, w, h - rail);
  ctx.fillStyle = '#8D93B5';
  ctx.fillRect(0, rail, w, 1.2);
  // The train, a little bounce in its step.
  const bob = Math.round(Math.sin(TAU * t * 8) * 0.7);
  const tx = w * 0.3;
  const ty = rail - 2 + bob;
  const carriage = (x: number, colour: string): void => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, ty - 12, 30, 10);
    ctx.fillStyle = '#FFE59A';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + k * 7, ty - 10, 4, 4);
    ctx.fillStyle = '#16182A';
    for (const wx of [x + 6, x + 24]) {
      ctx.beginPath();
      ctx.arc(wx, ty - 1, 2.4, 0, TAU);
      ctx.fill();
    }
  };
  carriage(tx, '#3F79C2');
  carriage(tx + 33, '#E2A93E');
  // The locomotive at the front, chimney up.
  const lx = tx + 66;
  ctx.fillStyle = '#C9443C';
  ctx.fillRect(lx, ty - 10, 26, 8);
  ctx.fillRect(lx, ty - 16, 9, 7);
  ctx.fillStyle = '#2B2D3E';
  ctx.fillRect(lx + 18, ty - 16, 4, 6);
  ctx.fillStyle = '#FFE59A';
  ctx.fillRect(lx + 2, ty - 14, 4, 3);
  ctx.fillStyle = '#16182A';
  for (const wx of [lx + 5, lx + 13, lx + 21]) {
    ctx.beginPath();
    ctx.arc(wx, ty - 1, 2.8, 0, TAU);
    ctx.fill();
  }
  // Smoke drifting back from the chimney, three puffs a loop.
  for (let i = 0; i < 3; i++) {
    const p = (t * 3 + i / 3) % 1;
    ctx.fillStyle = `rgba(232, 236, 248, ${(0.85 * (1 - p)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(lx + 20 - p * 46, ty - 18 - p * 14, 2.5 + p * 5, 0, TAU);
    ctx.fill();
  }
  // Telegraph poles flick past in front.
  ctx.fillStyle = '#121933';
  for (let i = 0; i < 3; i++) {
    const px = ((((i * w) / 3 - t * 4 * w) % w) + w) % w;
    ctx.fillRect(px, h * 0.48, 2, h * 0.52);
    ctx.fillRect(px - 4, h * 0.52, 10, 1.5);
  }
}

/** The face the train's name is sign-written in on the carriage sides: a classic serif in capitals. */
const LETTERING_FONT = '"Georgia", "Times New Roman", "Noto Serif", serif';
/** Lettering canvas height in pixels (the plane's height maps to it). */
const LETTERING_PX = 96;

/**
 * Fix list 5.7: the train's name sign-written on a letterboard in the carriage's own paint, in place of the old
 * cream board in a gold frame. Widely spaced serif capitals in gold leaf (lighter at the top, a darker gold below),
 * a thin dark keyline and a soft shade to the lower right, the way a coach painter lines out a name, inside a fine
 * gold line round the board. Returns the texture and its width over its height, so the plane fits it.
 */
export function letteringTexture(name: string, paint: string): { texture: THREE.CanvasTexture; aspect: number } {
  const label = name.toUpperCase();
  const size = Math.round(LETTERING_PX * 0.66);
  const spacing = size * 0.22;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('2D canvas unavailable');
  probe.font = `700 ${size}px ${LETTERING_FONT}`;
  const widths = [...label].map((ch) => probe.measureText(ch).width);
  const textWidth = widths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, label.length - 1);
  const pad = size * 0.9;
  const c = document.createElement('canvas');
  c.width = Math.min(4096, Math.ceil(textWidth + pad * 2));
  c.height = LETTERING_PX;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  // The board in the carriage's paint (a touch deeper at the foot, as the light falls off), lined in gold.
  const board = ctx.createLinearGradient(0, 0, 0, c.height);
  board.addColorStop(0, shadeHex(paint, 6));
  board.addColorStop(1, shadeHex(paint, -10));
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#C9A04A';
  ctx.lineWidth = 3;
  ctx.strokeRect(9, 9, c.width - 18, c.height - 18);
  ctx.font = `700 ${size}px ${LETTERING_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const y = LETTERING_PX / 2 + size * 0.04;
  const draw = (paint: (ch: string, x: number) => void): void => {
    let x = (c.width - textWidth) / 2;
    [...label].forEach((ch, i) => {
      paint(ch, x);
      x += widths[i] + spacing;
    });
  };
  // The shade, down and to the right.
  ctx.fillStyle = 'rgba(18, 14, 10, 0.55)';
  draw((ch, x) => ctx.fillText(ch, x + size * 0.05, y + size * 0.06));
  // The keyline.
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = 'rgba(40, 26, 12, 0.9)';
  draw((ch, x) => ctx.strokeText(ch, x, y));
  // Gold leaf.
  const leaf = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  leaf.addColorStop(0, '#F6DE92');
  leaf.addColorStop(0.5, '#D9B055');
  leaf.addColorStop(1, '#A87D2E');
  ctx.fillStyle = leaf;
  draw((ch, x) => ctx.fillText(ch, x, y));
  const texture = finishTexture(c);
  texture.anisotropy = 8;
  return { texture, aspect: c.width / c.height };
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
/** The green of an upgrade's sign (B1), and the softer green of one not yet affordable. */
const UPGRADE_GREEN = '#4FAE5F';
const UPGRADE_GREEN_SOFT = '#9FCB9A';

/** A tile marker's icon face: the pin's rim and white face at the marker's scale. */
function markerFace(ctx: CanvasRenderingContext2D, rim: string): void {
  ctx.beginPath();
  ctx.arc(54, 52, 36, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(54, 52, 29, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFDF7';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(43, 34, 48, 0.35)';
  ctx.stroke();
}

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
    // B1: the icon sits on the same white face with a coloured rim as every pin; green means an upgrade (paler while
    // it is out of reach, grey while locked).
    markerFace(ctx, locked ? '#A79E90' : affordable ? UPGRADE_GREEN : UPGRADE_GREEN_SOFT);
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

  /**
   * A tile still being earned by hand (session 29): the same pill with what it is, and under the name a bar filling with
   * the work done ("Tidy 7/12") where the price would be.
   */
  drawEarning(icon: IconName, name: string, verb: string, done: number, need: number): void {
    const key = `earn|${icon}|${name}|${verb}|${done}|${need}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.setTransform(MARKER_RES, 0, 0, MARKER_RES, 0, 0);
    ctx.clearRect(0, 0, 320, 128);
    ctx.lineJoin = 'round';
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
    const fill = ctx.createLinearGradient(0, 8, 0, 96);
    fill.addColorStop(0, '#FFFBF1');
    fill.addColorStop(1, '#F1E3C6');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    markerFace(ctx, UPGRADE_GREEN_SOFT);
    drawIcon(ctx, icon, 26, 24, 56);
    ctx.fillStyle = '#6B5B4B';
    ctx.textBaseline = 'alphabetic';
    let size = 25;
    const label = name.toUpperCase();
    ctx.font = `700 ${size}px ${TILE_FONT}`;
    while (size > 17 && ctx.measureText(label).width > 196) ctx.font = `700 ${--size}px ${TILE_FONT}`;
    ctx.fillText(label, 100, 44);
    // The bar: a dark track, a green fill for the work done, the count on top.
    const x0 = 100;
    const x1 = 298;
    const y0 = 54;
    const y1 = 86;
    const bar = (x: number): void => {
      ctx.beginPath();
      ctx.moveTo(x0 + 16, y0);
      ctx.arcTo(x, y0, x, y1, 16);
      ctx.arcTo(x, y1, x0, y1, 16);
      ctx.arcTo(x0, y1, x0, y0, 16);
      ctx.arcTo(x0, y0, x, y0, 16);
      ctx.closePath();
    };
    bar(x1);
    ctx.fillStyle = 'rgba(60, 45, 35, 0.18)';
    ctx.fill();
    const share = need > 0 ? Math.min(1, done / need) : 1;
    if (share > 0) {
      bar(Math.max(x0 + 32, x0 + (x1 - x0) * share));
      ctx.fillStyle = '#5DB86A';
      ctx.fill();
    }
    bar(x1);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    // Phase 3: the count reads as a phrase ("TIDY ROOMS 3/4"), shrunk to fit the bar.
    const count = `${verb} ${done}/${need}`.toUpperCase();
    let countSize = 22;
    ctx.font = `800 ${countSize}px ${TILE_FONT}`;
    while (countSize > 14 && ctx.measureText(count).width > x1 - x0 - 18) ctx.font = `800 ${--countSize}px ${TILE_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(count, (x0 + x1) / 2, 78);
    ctx.textAlign = 'left';
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

