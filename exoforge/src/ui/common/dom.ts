// Small DOM helpers for the HTML overlay (crisp text over the canvas, SPEC A3).
import { assetUrl, entry } from '../../render/assets';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function img(id: string, cls = ''): HTMLImageElement {
  const i = el('img', cls);
  i.src = assetUrl(id);
  i.alt = '';
  i.draggable = false;
  return i;
}

/** A painted 9-slice button (CSS border-image from the manifest's slices; the art is 3× CSS size). */
export function paintedButton(id: string, label: string, cls = ''): HTMLButtonElement {
  const b = el('button', `painted-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.dataset.ui = '';
  const slice = entry(id).nineSlice ?? [48, 48, 48, 48];
  b.style.borderImageSource = `url("${assetUrl(id)}")`;
  b.style.borderImageSlice = `${slice.join(' ')} fill`;
  b.style.borderImageWidth = slice.map((s) => `${s / 3}px`).join(' ');
  return b;
}

/** A painted 9-slice panel. */
export function paintedPanel(id: string, cls = ''): HTMLElement {
  const p = el('div', `painted-panel ${cls}`.trim());
  const slice = entry(id).nineSlice ?? [72, 72, 72, 72];
  p.style.borderImageSource = `url("${assetUrl(id)}")`;
  p.style.borderImageSlice = `${slice.join(' ')} fill`;
  p.style.borderImageWidth = slice.map((s) => `${s / 3}px`).join(' ');
  return p;
}

/** Restarts a CSS animation class on the next frame (no forced reflow). */
export function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  requestAnimationFrame(() => e.classList.add(cls));
}

/** Big digits that roll into place (the height readout). */
export class RollingNumber {
  readonly root: HTMLElement;
  private readonly columns: HTMLElement[] = [];
  private value = -1;

  constructor(digits: number, cls = '') {
    this.root = el('span', `rolling ${cls}`.trim());
    for (let i = 0; i < digits; i++) {
      const col = el('span', 'roll-col');
      const strip = el('span', 'roll-strip');
      for (let d = 0; d <= 9; d++) strip.append(el('span', 'roll-digit', String(d)));
      col.append(strip);
      this.columns.push(strip);
      this.root.append(col);
    }
  }

  set(n: number): void {
    const v = Math.max(0, Math.floor(n));
    if (v === this.value) return;
    this.value = v;
    const text = String(v).padStart(this.columns.length, ' ');
    this.columns.forEach((strip, i) => {
      const ch = text[text.length - this.columns.length + i];
      const col = strip.parentElement!;
      col.classList.toggle('blank', ch === ' ');
      strip.style.transform = `translateY(${-(ch === ' ' ? 0 : Number(ch)) * 1.6}em)`;
    });
  }
}
