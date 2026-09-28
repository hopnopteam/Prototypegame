/** Short vibrations on key moments (Android browsers; iOS Safari has no vibration API). Toggleable. */
export class Haptics {
  enabled = true;

  private buzz(pattern: number | number[]): void {
    if (!this.enabled) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Some embedded views throw; haptics are a nicety, never a requirement.
    }
  }

  /** The faintest tap, for rhythmic feedback (bills streaming in). */
  tick(): void {
    this.buzz(4);
  }

  light(): void {
    this.buzz(8);
  }

  medium(): void {
    this.buzz(18);
  }

  heavy(): void {
    this.buzz([30, 40, 50]);
  }

  success(): void {
    this.buzz([12, 30, 12]);
  }
}
