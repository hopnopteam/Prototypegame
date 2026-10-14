/**
 * The loading screen (session 26). Its markup is static in body.html, so it is the first thing painted; this moves its
 * progress rail, asks for the tap that lets the browser play sound, and fades it away when play begins.
 */
export class Loader {
  private shown = 0;

  constructor(private readonly root: HTMLElement | null) {}

  /** Moves the rail forward (never back). */
  progress(fraction: number): void {
    this.shown = Math.max(this.shown, Math.min(1, fraction));
    this.root?.querySelector<HTMLElement>('.loader-rail')?.style.setProperty('--p', this.shown.toFixed(3));
  }

  /**
   * Everything is ready but the browser will not play sound without a gesture: "Tap to play". Resolves on the tap (the
   * game's own gesture listener has resumed the sound by then, in the same gesture).
   */
  waitForTap(): Promise<void> {
    const root = this.root;
    if (!root) return Promise.resolve();
    root.classList.add('ready');
    return new Promise((done) => {
      const go = (): void => {
        for (const name of ['pointerup', 'touchend', 'click', 'keydown']) window.removeEventListener(name, go);
        done();
      };
      // Listened for on the window after the game's own listener (registered at boot), so the sound is unlocked first.
      for (const name of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(name, go, { passive: true });
    });
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
