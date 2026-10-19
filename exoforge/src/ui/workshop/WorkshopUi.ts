// The Workshop screen's overlay. Milestone 1 is a stub: the chapter, the best height and FLY!
// (the build tray, course bar and helper hints arrive in Milestone 3).
import { el, paintedButton } from '../common/dom';

export class WorkshopUi {
  readonly root = el('div', 'workshop-ui');
  readonly fly: HTMLButtonElement;
  private readonly best = el('div', 'workshop-best');

  constructor(chapter: string) {
    this.root.dataset.ui = '';
    this.root.hidden = true;
    const top = el('div', 'workshop-top');
    top.append(el('div', 'workshop-chapter display', chapter));
    this.fly = paintedButton('ui.button.green', 'FLY!', 'workshop-fly suggested');
    const note = el('div', 'workshop-note', 'Flight test · placeholder art');
    this.root.append(top, this.best, this.fly, note);
  }

  show(best: number): void {
    this.best.textContent = best > 0 ? `Best height ${Math.floor(best)} m` : '';
    this.best.hidden = best <= 0;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
