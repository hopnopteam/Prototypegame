// The flight HUD (SPEC A5.2): height at the top, armor plates top-left with the callsign under them, the course bar
// on the right, heat and battery dials lower-left, and a small pause button. Everything else shows on the suit.
import { el, img, replay, RollingNumber } from '../common/dom';
import { plateStates, type PlateState } from '../../sim/Damage';
import type { Run } from '../../sim/Run';
import { HEAT } from '../../econ/balance';

const NEEDLE_SWEEP = 120;

export class Hud {
  readonly root = el('div', 'hud');
  readonly pauseButton: HTMLButtonElement;
  private readonly plates = el('div', 'hud-plates');
  private plateEls: HTMLImageElement[] = [];
  private plateCache: PlateState[] = [];
  private readonly height = new RollingNumber(3, 'hud-height-digits');
  private readonly heatDial: HTMLElement;
  private readonly batteryDial: HTMLElement;
  private readonly heatNeedle: HTMLImageElement;
  private readonly batteryNeedle: HTMLImageElement;
  private readonly bar = el('div', 'course-bar');
  private readonly barSuit = el('div', 'course-suit');
  private readonly barBest = el('div', 'course-best');
  private readonly fxLayer = el('div', 'fx-text-layer');
  private courseTop = 1;

  constructor(callsign: string) {
    this.root.dataset.ui = '';
    const left = el('div', 'hud-left');
    left.append(this.plates, el('div', 'hud-callsign stencil', callsign));
    const top = el('div', 'hud-height display');
    top.append(this.height.root, el('span', 'hud-unit', 'm'));
    this.pauseButton = el('button', 'hud-pause');
    this.pauseButton.type = 'button';
    this.pauseButton.dataset.ui = '';
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.append(img('ui.icon.pause'));

    const dials = el('div', 'hud-dials');
    const dial = (id: 'ui.dial.heat' | 'ui.dial.battery') => {
      const d = el('div', 'dial');
      const needle = img('ui.dial.needle', 'needle');
      d.append(img(id, 'face'), needle);
      return { d, needle };
    };
    const heat = dial('ui.dial.heat');
    const battery = dial('ui.dial.battery');
    this.heatDial = heat.d;
    this.heatNeedle = heat.needle;
    this.batteryDial = battery.d;
    this.batteryNeedle = battery.needle;
    this.heatDial.classList.add('heat');
    dials.append(this.heatDial, this.batteryDial);

    const flag = el('div', 'course-best-flag');
    flag.append(img('ui.icon.flag'), el('span', 'stencil', 'BEST'));
    this.barBest.append(flag);
    this.bar.append(el('div', 'course-exit'), this.barBest, this.barSuit);
    // The pause button sits outside the hit-ignore layer so it stays tappable.
    this.root.append(left, top, this.pauseButton, this.bar, dials, this.fxLayer);
  }

  /** A new run: plates, ticks for each chunk, and the best height flag. */
  begin(run: Run, best: number): void {
    const n = run.suit.params.plates;
    this.plates.replaceChildren();
    this.plateEls = [];
    for (let i = 0; i < n; i++) {
      const p = img('ui.icon.plate.full', 'plate');
      this.plateEls.push(p);
      this.plates.append(p);
    }
    this.plateCache = [];
    this.courseTop = run.course.top - run.course.start.y;
    this.bar.querySelectorAll('.course-tick').forEach((t) => t.remove());
    for (const chunk of run.course.chunks.slice(1)) {
      const tick = el('div', 'course-tick');
      tick.style.bottom = `${((chunk.y0 - run.course.start.y) / this.courseTop) * 100}%`;
      this.bar.append(tick);
    }
    this.barBest.hidden = best <= 0;
    this.barBest.style.bottom = `${Math.min(100, (best / this.courseTop) * 100)}%`;
  }

  update(run: Run): void {
    const suit = run.suit;
    this.height.set(run.height());
    const states = plateStates(suit.integrity, suit.params.plates);
    states.forEach((s, i) => {
      if (this.plateCache[i] === s) return;
      this.plateCache[i] = s;
      const e = this.plateEls[i];
      if (!e) return;
      e.src = img(`ui.icon.plate.${s}`).src;
    });
    const heat = suit.heat.heat;
    this.heatNeedle.style.transform = `rotate(${-NEEDLE_SWEEP + heat * 2 * NEEDLE_SWEEP}deg)`;
    this.batteryNeedle.style.transform = `rotate(${-NEEDLE_SWEEP + suit.battery * 2 * NEEDLE_SWEEP}deg)`;
    this.heatDial.classList.toggle('warn', heat > HEAT.warnAt || suit.heat.sputterLeft > 0);
    this.heatDial.classList.toggle('sputter', suit.heat.sputterLeft > 0);
    this.batteryDial.classList.toggle('low', suit.battery < 0.2);
    this.barSuit.style.bottom = `${Math.min(100, (run.height() / this.courseTop) * 100)}%`;
  }

  pulse(what: 'plates' | 'heat' | 'battery'): void {
    replay(what === 'plates' ? this.plates : what === 'heat' ? this.heatDial : this.batteryDial, 'pulse');
  }

  /** A floating word at a screen point (CSS px in the frame). */
  floatText(text: string, x: number, y: number, kind: string): void {
    const t = el('div', `float-text display ${kind}`, text);
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    this.fxLayer.append(t);
    t.addEventListener('animationend', () => t.remove());
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }
}
