import type { Game } from '../gameplay/Game';
import { h, icon, setVisible } from './dom';
import type { IconName } from './icons';
import type { CarriageType } from '../core/types';

/** Fix list 5.8: each carriage on the map wears its type's emblem (the same icons as the carriage chooser). */
const TYPE_ICON: Record<CarriageType, IconName> = {
  lobby: 'ticket', sleeper: 'bed', bathroom: 'bath', supply: 'towel', luggage: 'luggage',
  cafe: 'latte', dining: 'meal', bar: 'cocktail', dome: 'binoculars', cinema: 'film',
};

const REFRESH_SECONDS = 0.25;
/** The map appears once the train is long enough for walking to matter. */
const MIN_CARRIAGES = 2;

interface Slot {
  button: HTMLButtonElement;
  badge: HTMLElement;
  emblem: HTMLElement;
  key: string;
}

/**
 * The train map on the left edge: the locomotive and every carriage, the one you are in highlighted, and a
 * badge on any carriage that needs you. Tap a carriage to dash there (quick travel), so a long train never
 * turns walking into a chore.
 */
export class TrainMapUi {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly slots: Slot[] = [];
  private timer = 0;

  constructor(private readonly game: () => Game | undefined) {
    this.list = h('div.cars');
    this.el = h('nav.trainmap', { 'aria-label': 'Train map' }, h('div.loco', { 'aria-hidden': 'true' }), this.list);
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
    const travelling = g.player.travel.active;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      setVisible(slot.button, i < count);
      if (i >= count) continue;
      const need = g.needs.forCarriage(i);
      const tier = g.train.tierOf(i);
      const type = g.train.types[i];
      const key = `${need?.icon ?? ''}|${i === here}|${tier}|${travelling}|${type}`;
      if (slot.key === key) continue;
      slot.key = key;
      slot.button.classList.toggle('here', i === here);
      slot.button.dataset.tier = String(tier);
      slot.emblem.replaceChildren(...(type ? [icon(TYPE_ICON[type], 20)] : []));
      slot.badge.replaceChildren();
      setVisible(slot.badge, !!need);
      if (need) slot.badge.appendChild(icon(need.icon as IconName, 18));
      const name = g.train.carriageName(i);
      slot.button.setAttribute('aria-label', need ? `${name}: ${need.label}. Tap to go there.` : `${name}. Tap to go there.`);
    }
  }

  private addSlot(index: number): void {
    const badge = h('span.need', { hidden: true });
    const emblem = h('span.emblem', { 'aria-hidden': 'true' });
    const button = h('button.car', {
      onclick: () => {
        const g = this.game();
        if (!g) return;
        g.audio.play('click');
        g.travelToCarriage(index);
      },
    }, emblem, badge);
    this.list.appendChild(button);
    this.slots.push({ button, badge, emblem, key: '' });
  }
}
