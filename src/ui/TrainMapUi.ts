import type { Game } from '../gameplay/Game';
import { h, icon, setText, setVisible } from './dom';
import { CARRIAGE_ICON } from '../config/content';
import type { IconName } from './icons';

/** Fix list 5.8: each carriage wears its type's emblem (only the carriages the train has: session 29). */
const TYPE_ICON = CARRIAGE_ICON;

const REFRESH_SECONDS = 0.25;
/** Quick travel appears once the train is long enough for walking to matter. */
const MIN_CARRIAGES = 2;

interface Row {
  button: HTMLButtonElement;
  emblem: HTMLElement;
  name: HTMLElement;
  need: HTMLElement;
  here: HTMLElement;
  key: string;
}

/**
 * Quick travel on the conductor's phone (session 40, owner: "the sideways train map takes too much space… move it into
 * the in-game phone interface… compact, as few clicks as possible, shows where the player is"). One small phone button
 * on the left edge, with a dot counting the carriages that need you; tap it and the phone opens over the corner with
 * every carriage in order (its emblem, its name, what it needs, "here" on the one you are in). Tap a carriage: the
 * phone closes and the conductor dashes there. The game never pauses for it.
 */
export class TrainMapUi {
  readonly el: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly dot: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly rows: Row[] = [];
  private timer = 0;
  private open = false;

  constructor(private readonly game: () => Game | undefined) {
    this.dot = h('span.dot', { hidden: true });
    this.toggle = h('button.phone-btn', { 'aria-label': 'Quick travel', 'aria-expanded': 'false', onclick: () => this.setOpen(!this.open) }, icon('phone', 26), this.dot);
    this.list = h('div.rows');
    this.panel = h('div.phone', { hidden: true, role: 'menu', 'aria-label': 'Quick travel' },
      h('div.notch', { 'aria-hidden': 'true' }),
      h('div.title', {}, icon('dash', 14), h('span', { text: 'Quick travel' })),
      this.list,
    );
    this.el = h('nav.trainmap', { 'aria-label': 'Quick travel' }, this.toggle, this.panel);
    // A tap anywhere else puts the phone away.
    window.addEventListener('pointerdown', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) this.setOpen(false);
    }, true);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.game()?.audio.play('whoosh', { volume: 0.5 });
    setVisible(this.panel, open);
    this.toggle.classList.toggle('on', open);
    this.toggle.setAttribute('aria-expanded', String(open));
    this.timer = 0;
  }

  update(dt: number): void {
    const g = this.game();
    if (!g) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_SECONDS;
    const count = g.train.count;
    setVisible(this.el, count >= MIN_CARRIAGES);
    if (count < MIN_CARRIAGES) {
      if (this.open) this.setOpen(false);
      return;
    }
    let needs = 0;
    for (let i = 0; i < count; i++) if (g.needs.forCarriage(i)) needs++;
    setVisible(this.dot, needs > 0);
    setText(this.dot, String(needs));
    if (!this.open) return;
    while (this.rows.length < count) this.addRow(this.rows.length);
    const here = g.needs.carriageAt(g.player.pos.z);
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      setVisible(row.button, i < count);
      if (i >= count) continue;
      const need = g.needs.forCarriage(i);
      const type = g.train.types[i];
      const tier = g.train.tierOf(i);
      const name = g.train.carriageName(i);
      const key = `${need?.icon ?? ''}|${i === here}|${tier}|${type}|${name}`;
      if (row.key === key) continue;
      row.key = key;
      row.button.classList.toggle('here', i === here);
      row.button.dataset.tier = String(tier);
      row.emblem.replaceChildren(...(type ? [icon(TYPE_ICON[type], 20)] : []));
      setText(row.name, name);
      row.need.replaceChildren();
      setVisible(row.need, !!need);
      if (need) row.need.appendChild(icon(need.icon as IconName, 16));
      setVisible(row.here, i === here);
      row.button.setAttribute('aria-label', need ? `${name}: ${need.label}. Tap to go there.` : `${name}. Tap to go there.`);
    }
  }

  private addRow(index: number): void {
    const emblem = h('span.emblem', { 'aria-hidden': 'true' });
    const name = h('span.name');
    const need = h('span.need', { hidden: true });
    const here = h('span.here-pill', { text: 'Here', hidden: true });
    const button = h('button.car', {
      role: 'menuitem',
      onclick: () => {
        const g = this.game();
        if (!g) return;
        g.audio.play('click');
        this.setOpen(false);
        g.travelToCarriage(index);
      },
    }, emblem, name, here, need);
    this.list.appendChild(button);
    this.rows.push({ button, emblem, name, need, here, key: '' });
  }
}
