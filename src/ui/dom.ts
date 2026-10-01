import { iconCanvas, type IconName } from './icons';

type Child = Node | string | null | undefined | false;

/** Tiny element builder: h('div.card', { onclick }, child, child). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tagAndClass: K | `${K}.${string}`,
  attrs: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = tagAndClass.split('.');
  const el = document.createElement(tag as K);
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'text') {
      el.textContent = String(value);
    } else if (key === 'html') {
      el.innerHTML = String(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Icons are drawn at twice their CSS size, for sharp edges on high-density screens. */
const ICON_RESOLUTION = 2;

/**
 * An icon as a small canvas: each name and size is drawn once, then copied (a cheap blit). Never an encoded
 * image: PNG-encoding icons on first use (`toDataURL`) stalled the main thread for whole seconds when a card
 * or a new goal brought several new ones at once.
 */
export function icon(name: IconName, size = 28, className = 'ico'): HTMLCanvasElement {
  const px = Math.round(size * ICON_RESOLUTION);
  const el = document.createElement('canvas');
  el.width = px;
  el.height = px;
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  // The CSS size comes through a variable, so stylesheet rules (a bigger cash icon) still win.
  el.style.setProperty('--ico', `${size}px`);
  el.getContext('2d')?.drawImage(iconCanvas(name, px), 0, 0);
  return el;
}

/** Sets text only when it changed, so per-frame HUD updates never thrash layout. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setVisible(el: HTMLElement, visible: boolean): void {
  if (el.hidden === visible) el.hidden = !visible;
}

const sizes = new WeakMap<Element, { w: number; h: number }>();
let sizeObserver: ResizeObserver | null = null;

/**
 * An element's layout size (its border box), kept current by a ResizeObserver, so per-frame code never forces
 * a synchronous layout by reading offsetWidth after writing styles. Reads 0×0 until the first report (the
 * same frame, after layout), and while hidden.
 */
export function sizeOf(el: Element): { w: number; h: number } {
  let box = sizes.get(el);
  if (box) return box;
  box = { w: 0, h: 0 };
  sizes.set(el, box);
  if (typeof ResizeObserver === 'undefined') {
    box.w = (el as HTMLElement).offsetWidth;
    box.h = (el as HTMLElement).offsetHeight;
    return box;
  }
  sizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const b = sizes.get(entry.target);
      if (!b) continue;
      const border = entry.borderBoxSize?.[0];
      b.w = border ? border.inlineSize : (entry.target as HTMLElement).offsetWidth;
      b.h = border ? border.blockSize : (entry.target as HTMLElement).offsetHeight;
    }
  });
  sizeObserver.observe(el);
  return box;
}

/** Stops tracking an element's size (call when it is removed for good). */
export function forgetSize(el: Element): void {
  sizeObserver?.unobserve(el);
  sizes.delete(el);
}

/**
 * Replays a CSS animation by taking its class off and putting it back a frame later (instead of forcing a
 * layout in between with offsetWidth). `remove` lists classes to clear first (default: the ones added).
 */
export function replayClass(el: Element, add: string[], remove: string[] = add): void {
  el.classList.remove(...remove);
  requestAnimationFrame(() => el.classList.add(...add));
}

