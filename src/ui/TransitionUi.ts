import type { LineTransitionDef } from '../config/lineTransition';
import type { RouteArchive } from '../save/SaveData';
import { routeById } from '../config/routes';
import { drawLinePostcard } from './linePostcard';

/** The corner label (beat and seconds) shows only for the walkthrough recordings (`?gdlabel=1`). */
const LABEL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gdlabel') === '1';

const BEAT_NAMES: Record<string, string> = {
  hero: 'Look what you built', lever: 'The lever', depot: 'The depot', tunnel: 'Into the tunnel', dark: 'The reload (dark)',
  burst: 'Out onto the coast', arrival: 'The arrival', chest: 'The chest', postcard: 'The postcard', idle: '',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The Grand Departure's screen layer: the letterbox, the captions, the skip button, the lever's drag and the hand
 * that shows it, the dawn tint, the tunnel's dark and the light at its far end, the flash, the chest card and the
 * postcard. Plain DOM over the game, outside the HUD (which the `gd-cine` class on the body hides meanwhile).
 */
export class TransitionUi {
  private readonly root = el('div', 'gd');
  private readonly top = el('div', 'gd-bar gd-top');
  private readonly bottom = el('div', 'gd-bar gd-bottom');
  private readonly captionEl = el('div', 'gd-caption');
  private readonly skipBtn = el('button', 'gd-skip', 'Skip ›');
  private readonly cornerEl = el('div', 'gd-corner');
  private readonly leverZone = el('div', 'gd-lever');
  private readonly hand = el('div', 'gd-hand');
  private readonly dawnEl = el('div', 'gd-dawn');
  private readonly darkEl = el('div', 'gd-dark');
  private readonly flashEl = el('div', 'gd-flash');
  private dragFrom: number | null = null;

  constructor(onSkip: (beat?: string) => void, onDrag: (dy: number) => void, onRelease: () => void) {
    if (typeof document === 'undefined') return;
    this.darkEl.appendChild(el('div', 'tunnel-lamps'));
    this.leverZone.appendChild(el('div', 'gd-lever-word', 'Drag down'));
    this.leverZone.appendChild(this.hand);
    this.root.append(this.dawnEl, this.darkEl, this.flashEl, this.top, this.bottom, this.captionEl, this.leverZone, this.skipBtn, this.cornerEl);
    document.body.appendChild(this.root);
    this.skipBtn.addEventListener('click', () => onSkip());
    this.cornerEl.hidden = !LABEL;
    this.leverZone.addEventListener('pointerdown', (e) => {
      this.dragFrom = e.clientY;
      this.leverZone.setPointerCapture(e.pointerId);
    });
    this.leverZone.addEventListener('pointermove', (e) => {
      if (this.dragFrom !== null) onDrag(Math.max(0, e.clientY - this.dragFrom));
    });
    const up = (): void => {
      this.dragFrom = null;
      onRelease();
    };
    this.leverZone.addEventListener('pointerup', up);
    this.leverZone.addEventListener('pointercancel', up);
  }

  cinematic(on: boolean): void {
    this.root.classList.toggle('on', on);
    if (!on) this.caption(null);
    // The corner label (recordings only) is about the sequence: it goes with it.
    this.cornerEl.hidden = !LABEL || !on;
  }

  caption(text: string | null): void {
    this.captionEl.textContent = text ?? '';
    this.captionEl.classList.toggle('shown', !!text);
  }

  corner(phase: string, seconds: number): void {
    if (!LABEL) return;
    this.cornerEl.textContent = `${BEAT_NAMES[phase] ?? phase} · ${seconds.toFixed(1)} s`;
  }

  skip(show: boolean): void {
    this.skipBtn.classList.toggle('shown', show);
  }

  lever(show: boolean): void {
    this.leverZone.classList.toggle('shown', show);
  }

  leverHint(show: boolean): void {
    this.hand.classList.toggle('shown', show);
  }

  dawn(amount: number): void {
    this.dawnEl.style.opacity = amount.toFixed(3);
  }

  /** The screen goes black (with the tunnel's lamps rushing past when `lamps`). */
  dark(on: boolean, lamps: boolean): void {
    this.darkEl.classList.toggle('on', on);
    this.darkEl.classList.toggle('lamps', on && lamps);
    if (on) this.darkEl.style.setProperty('--hole', '0%');
  }

  /** The circle of light at the tunnel's far end (0 a pinprick, 1 the whole screen). */
  burstLight(u: number): void {
    this.darkEl.classList.add('lamps');
    this.darkEl.style.setProperty('--hole', `${(u * u * 140).toFixed(1)}%`);
  }

  flash(): void {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  /** The line-complete chest: what it holds and what came along. */
  chest(def: LineTransitionDef, brought: { gems: number; railMiles: number; conductor: string }, preview: boolean, onCollect: () => void): void {
    const card = el('div', 'gd-chest');
    card.append(el('div', 'gd-chest-lid'), el('div', 'gd-chest-title', def.captions.chest ?? 'Line complete'));
    const gains = el('div', 'gd-chest-gains');
    gains.append(el('span', 'gem', `+${def.chest.gems} gems`), el('span', 'miles', `+${def.chest.railMiles} Rail Miles`));
    card.append(gains);
    const list = el('ul', 'gd-brought');
    list.append(el('li', '', `Gems: ${brought.gems}`), el('li', '', `Rail Miles: ${brought.railMiles}`), el('li', '', `Conductor upgrades: ${brought.conductor}`));
    card.append(el('div', 'gd-brought-title', 'What you brought along'), list);
    if (preview) card.append(el('div', 'gd-preview', 'Preview: nothing is paid'));
    const btn = el('button', 'btn primary big gd-collect', 'Collect');
    btn.addEventListener('click', () => {
      card.classList.add('gone');
      window.setTimeout(() => card.remove(), 400);
      onCollect();
    }, { once: true });
    card.append(btn);
    this.root.appendChild(card);
  }

  /** The finished train's postcard slides in, stamped, and goes into the album. */
  postcard(def: LineTransitionDef, archive: RouteArchive | null, onOpen: () => void): void {
    const card = el('div', 'gd-postcard');
    const canvas = document.createElement('canvas');
    drawLinePostcard(canvas, def, archive, routeById(archive?.route.id)?.name ?? 'Your train', 2);
    card.append(canvas, el('div', 'gd-postcard-word', 'Into your album'));
    document.body.appendChild(card);
    onOpen();
    const gone = (): void => {
      card.classList.add('gone');
      window.setTimeout(() => card.remove(), 500);
    };
    card.addEventListener('click', gone, { once: true });
    window.setTimeout(gone, 5200);
  }
}
