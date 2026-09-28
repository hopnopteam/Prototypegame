import { iconUrl, type IconName } from './icons';

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

export function icon(name: IconName, size = 28, className = 'ico'): HTMLImageElement {
  return h('img', { src: iconUrl(name, size * 2), width: size, height: size, alt: '', class: className, draggable: 'false' });
}

/** Sets text only when it changed, so per-frame HUD updates never thrash layout. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setVisible(el: HTMLElement, visible: boolean): void {
  if (el.hidden === visible) el.hidden = !visible;
}
