// Results (SPEC A5.4): the height reached with a count-up, NEW BEST! with confetti, the flight in a few lines and
// one CONTINUE button. Scrap and its bonuses join in Milestone 3.
import { el, img, paintedButton, paintedPanel } from '../common/dom';
import type { RunStats } from '../../sim/Run';

const TITLES: Record<string, string> = {
  crash: 'TOWED HOME',
  battery: 'BATTERY FLAT',
  exit: 'TOP OF THE TEST SHAFT!',
  quit: 'FLIGHT ENDED',
};

export class Results {
  readonly root = el('div', 'results');
  onContinue: (() => void) | null = null;

  constructor() {
    this.root.hidden = true;
    this.root.dataset.ui = '';
  }

  show(stats: RunStats, best: number, newBest: boolean): void {
    this.root.replaceChildren();
    const panel = paintedPanel('ui.panel.metal', 'results-panel');
    const title = el('div', 'results-title display', TITLES[stats.reason ?? 'quit'] ?? 'FLIGHT ENDED');
    const height = el('div', 'results-height display');
    const num = el('span', 'results-height-num', '0');
    height.append(num, el('span', 'results-height-unit', 'm'));
    const bestLine = newBest ? el('div', 'results-best new display', 'NEW BEST!') : el('div', 'results-best', `Best ${Math.floor(best)} m`);
    const rows = el('div', 'results-rows');
    const plates = el('div', 'results-row');
    plates.append(el('span', '', 'Armor left'));
    const icons = el('span', 'results-plates');
    for (let i = 0; i < stats.plates; i++) {
      const state = stats.platesLeft >= i + 1 - 1e-9 ? 'full' : stats.platesLeft > i + 1e-9 ? 'cracked' : 'lost';
      icons.append(img(`ui.icon.plate.${state}`));
    }
    plates.append(icons);
    const rests = el('div', 'results-row');
    rests.append(el('span', '', 'Ledges rested on'), el('b', '', String(stats.rests)));
    const time = el('div', 'results-row');
    time.append(el('span', '', 'Flight time'), el('b', '', `${stats.seconds.toFixed(1)} s`));
    rows.append(plates, rests, time);
    const go = paintedButton('ui.button.green', 'CONTINUE', 'results-continue suggested');
    go.addEventListener('click', () => this.onContinue?.());
    panel.append(title, height, bestLine, rows);
    this.root.append(panel, go);
    if (newBest) this.confetti();
    this.root.hidden = false;
    // Count the height up (SPEC B11: 400–900 ms, ease-out).
    const target = Math.floor(stats.maxHeight);
    const start = performance.now();
    const ms = Math.min(900, 400 + target * 8);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      num.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  hide(): void {
    this.root.hidden = true;
  }

  private confetti(): void {
    const layer = el('div', 'confetti');
    const colors = ['#4FD1C5', '#FFB547', '#ff7a5a', '#fff2d6', '#8fe06b'];
    for (let i = 0; i < 46; i++) {
      const c = el('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.4}s`;
      c.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      c.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      c.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
      layer.append(c);
    }
    this.root.append(layer);
  }
}
