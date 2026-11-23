/**
 * The loading screen (session 26). Its markup is static in body.html, so it is the first thing painted; this moves its
 * progress rail and fades it away when play begins (session 29: it never asks for a tap; sound starts on the first touch).
 */
export class Loader {
  private shown = 0;

  constructor(private readonly root: HTMLElement | null) {}

  /** Phase 4: the far end of the tunnel to a new line: the loading screen is the tunnel's dark, the line's name on it. */
  tunnel(routeName: string): void {
    const root = this.root;
    if (!root) return;
    root.classList.add('tunnel');
    const word = root.querySelector<HTMLElement>('.loader-word');
    if (word) word.textContent = routeName;
    const kicker = root.querySelector<HTMLElement>('.loader-kicker');
    if (kicker) kicker.textContent = 'Next stop';
  }

  /** Moves the rail forward (never back). */
  progress(fraction: number): void {
    this.shown = Math.max(this.shown, Math.min(1, fraction));
    this.root?.querySelector<HTMLElement>('.loader-rail')?.style.setProperty('--p', this.shown.toFixed(3));
  }

  /** Fades out and leaves the page (so nothing of it is left over the game). */
  hide(immediately = false): void {
    const root = this.root;
    if (!root) return;
    if (immediately) {
      root.remove();
      return;
    }
    root.classList.add('out');
    window.setTimeout(() => root.remove(), 600);
  }
}

/** Resolves after the browser has painted (so the rail moves on screen between the heavy start-up steps). */
export function nextPaint(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
}
