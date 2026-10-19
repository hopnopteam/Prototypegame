// The pause sheet: Resume or End run.
import { el, paintedButton, paintedPanel } from './dom';

export class PauseSheet {
  readonly root = el('div', 'pause-sheet');
  onResume: (() => void) | null = null;
  onEnd: (() => void) | null = null;

  constructor() {
    this.root.dataset.ui = '';
    this.root.hidden = true;
    const panel = paintedPanel('ui.panel.metal', 'pause-panel');
    panel.append(el('div', 'pause-title display', 'PAUSED'));
    const resume = paintedButton('ui.button.green', 'RESUME', 'suggested');
    const end = paintedButton('ui.button.blue', 'END RUN');
    resume.addEventListener('click', () => this.onResume?.());
    end.addEventListener('click', () => this.onEnd?.());
    panel.append(resume, end);
    this.root.append(panel);
  }

  set open(v: boolean) {
    this.root.hidden = !v;
  }

  get open(): boolean {
    return !this.root.hidden;
  }
}
