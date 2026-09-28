import * as THREE from 'three';
import { formatNumber } from '../core/math';
import { drawIcon, INK, type IconName } from '../ui/icons';

const bubbleCache = new Map<string, THREE.CanvasTexture>();

export type BubbleStyle = 'request' | 'intent' | 'alert' | 'plain';

const BUBBLE_FILL: Record<BubbleStyle, string> = {
  request: '#FFFFFF',
  intent: '#E8F1F7',
  alert: '#FFE9A8',
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

/** Speech-bubble texture with an icon, cached per icon + style. */
export function bubbleTexture(icon: IconName, style: BubbleStyle = 'request'): THREE.CanvasTexture {
  const key = `${icon}:${style}`;
  const cached = bubbleCache.get(key);
  if (cached) return cached;
  const size = 128;
  const [c, ctx] = canvas(size);
  if (style !== 'plain') {
    ctx.fillStyle = BUBBLE_FILL[style];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 56, 46, 0, Math.PI * 2);
    ctx.moveTo(52, 98);
    ctx.lineTo(64, 122);
    ctx.lineTo(76, 98);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BUBBLE_FILL[style];
    ctx.beginPath();
    ctx.arc(64, 56, 42, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, icon, 30, 22, 68);
  } else {
    drawIcon(ctx, icon, 8, 8, 112);
  }
  const texture = finishTexture(c);
  bubbleCache.set(key, texture);
  return texture;
}

export function makeSprite(texture: THREE.Texture, size: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
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

  draw(icon: IconName, remaining: number, progress: number, affordable: boolean, highlight: boolean): void {
    const key = `${icon}|${Math.ceil(remaining)}|${progress.toFixed(2)}|${affordable}|${highlight}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 256, 256);
    const path = (inset: number): void => {
      const r = 34;
      const x = inset;
      const y = inset;
      const s = 256 - inset * 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + s, y, x + s, y + s, r);
      ctx.arcTo(x + s, y + s, x, y + s, r);
      ctx.arcTo(x, y + s, x, y, r);
      ctx.arcTo(x, y, x + s, y, r);
      ctx.closePath();
    };
    path(10);
    ctx.fillStyle = 'rgba(255, 246, 228, 0.92)';
    ctx.fill();
    if (progress > 0) {
      ctx.save();
      path(10);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 211, 92, 0.85)';
      const h = 236 * progress;
      ctx.fillRect(10, 246 - h, 236, h);
      ctx.restore();
    }
    path(10);
    ctx.lineWidth = 10;
    ctx.setLineDash([22, 14]);
    ctx.strokeStyle = highlight ? '#E0901E' : affordable ? '#3E8E4A' : '#B3895A';
    ctx.stroke();
    ctx.setLineDash([]);
    drawIcon(ctx, icon, 70, 26, 116);
    ctx.fillStyle = INK;
    ctx.font = 'bold 58px "Baloo 2", "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatNumber(Math.ceil(remaining)), 142, 196);
    drawIcon(ctx, 'cash', 22, 170, 50);
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

/** A simple text board (station name signs). */
export function signTexture(text: string, background: string, foreground: string, width = 512, height = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = foreground;
  ctx.font = `bold ${Math.floor(height * 0.5)}px "Alfa Slab One", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), width / 2, height / 2 + 4, width - 40);
  return finishTexture(c);
}

/** Soft irregular stain for dirty cabin spots. */
let dirtTexture: THREE.CanvasTexture | null = null;
export function getDirtTexture(): THREE.CanvasTexture {
  if (dirtTexture) return dirtTexture;
  const [c, ctx] = canvas(128);
  ctx.fillStyle = 'rgba(120, 88, 52, 0.9)';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18, 22 + (i % 3) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(90, 62, 34, 0.7)';
  ctx.beginPath();
  ctx.arc(58, 60, 16, 0, Math.PI * 2);
  ctx.fill();
  dirtTexture = finishTexture(c);
  return dirtTexture;
}
