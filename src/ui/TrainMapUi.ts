import type { Game } from '../gameplay/Game';
import { h, icon, setText, setVisible } from './dom';
import { CARRIAGE_ICON } from '../config/content';
import type { IconName } from './icons';

/** Fix list 5.8: each carriage wears its type's emblem (only the carriages the train has: session 29). */
const TYPE_ICON = CARRIAGE_ICON;

const REFRESH_SECONDS = 0.25;
/** Quick travel appears once the train is long enough for walking to matter. */
const MIN_CARRIAGES = 2;
/** After the player scrolls the strip by hand, it leaves the view where they put it for this long. */
const HAND_SCROLL_HOLD_MS = 2500;

interface Slot {
  button: HTMLButtonElement;
  emblem: HTMLElement;
  name: HTMLElement;
  need: HTMLElement;
  key: string;
}

/**
 * Quick travel along the bottom of the screen (session 40, owner: "fast travel in the bottom… scrolling horizontally…
 * doesn't take much space… easy to navigate… fills as the train goes… scrolled easily"): one slim strip, the
 * locomotive at its left and a tile per carriage after it in train order (emblem, name, a badge when it needs you),
 * a new tile sliding in with each coupling. The tile you are in is lit and kept in view; swipe the strip to see the
 * rest of a long train, tap a tile and the conductor dashes there. The game never pauses for it.
 */
export class TrainMapUi {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly slots: Slot[] = [];
  private timer = 0;
  private here = -1;
  private handScrollUntil = 0;

  constructor(private readonly game: () => Game | undefined) {
    this.list = h('div.cars', { role: 'list' });
    this.el = h('nav.trainmap', { 'aria-label': 'Quick travel' }, h('div.loco', { 'aria-hidden': 'true' }), this.list);
    // A swipe of the strip is the player looking along the train: it is not pulled back to the current carriage
    // until they let it be.
    const hold = (): void => { this.handScrollUntil = performance.now() + HAND_SCROLL_HOLD_MS; };
    this.el.addEventListener('pointerdown', hold, { passive: true });
    this.el.addEventListener('wheel', hold, { passive: true });
    this.el.addEventListener('scroll', () => { if (performance.now() < this.handScrollUntil) hold(); }, { passive: true });
  }

  update(dt: number): void {
    const g = this.game();
    if (!g) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_SECONDS;
    const count = g.train.count;
    setVisible(this.el, count >= MIN_CARRIAGES);
    if (count < MIN_CARRIAGES) return;
    while (this.slots.length < count) this.addSlot(this.slots.length);
    const here = g.needs.carriageAt(g.player.pos.z);
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      setVisible(slot.button, i < count);
      if (i >= count) continue;
      const need = g.needs.forCarriage(i);
      const type = g.train.types[i];
      const tier = g.train.tierOf(i);
      const name = g.train.carriageName(i);
      const key = `${need?.icon ?? ''}|${i === here}|${tier}|${type}|${name}`;
      if (slot.key === key) continue;
      slot.key = key;
      slot.button.classList.toggle('here', i === here);
      slot.button.dataset.tier = String(tier);
      slot.emblem.replaceChildren(...(type ? [icon(TYPE_ICON[type], 20)] : []));
      setText(slot.name, shortName(name));
      slot.need.replaceChildren();
      setVisible(slot.need, !!need);
      if (need) slot.need.appendChild(icon(need.icon as IconName, 14));
      slot.button.setAttribute('aria-label', need ? `${name}: ${need.label}. Tap to go there.` : `${name}. Tap to go there.`);
    }
    if (here !== this.here) {
      this.here = here;
      this.keepInView(here, false);
    }
  }

  /** Scrolls the strip so a carriage's tile sits in view (never while the player is swiping it). */
  private keepInView(index: number, smooth: boolean): void {
    const slot = this.slots[index];
    if (!slot || performance.now() < this.handScrollUntil) return;
    const strip = this.list;
    const left = slot.button.offsetLeft - (strip.clientWidth - slot.button.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }

  private addSlot(index: number): void {
    const emblem = h('span.emblem', { 'aria-hidden': 'true' });
    const name = h('span.name');
    const need = h('span.need', { hidden: true });
    const button = h('button.car', {
      role: 'listitem',
      onclick: () => {
        const g = this.game();
        if (!g) return;
        g.audio.play('click');
        g.travelToCarriage(index);
      },
    }, emblem, name, need);
    this.list.appendChild(button);
    this.slots.push({ button, emblem, name, need, key: '' });
    // A carriage just coupled on: its tile slides into view at the end of the strip.
    if (index > 0) {
      button.classList.add('new');
      window.setTimeout(() => button.classList.remove('new'), 700);
      this.keepInView(index, true);
    }
  }
}

/** The strip's label: the carriage's name without "Car" ("Café", "Sleeper II", "Dining"). */
function shortName(name: string): string {
  return name.replace(/\s+Car\b/i, '').replace(/^Sleeper & Lobby$/i, 'Lobby');
}
