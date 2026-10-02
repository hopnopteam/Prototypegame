import { nativeHaptic, type HapticKind } from '../services/native';

/**
 * Short haptics on key moments. In the app (iOS and Android) they are the phone's own taps; in a browser,
 * vibrations where the browser has them (Android; iOS Safari has none). Toggleable.
 */
export class Haptics {
  enabled = true;

  private buzz(kind: HapticKind, pattern: number | number[]): void {
    if (!this.enabled) return;
    if (nativeHaptic(kind)) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Some embedded views throw; haptics are a nicety, never a requirement.
    }
  }

  /** The faintest tap, for rhythmic feedback (bills streaming in). */
  tick(): void {
    this.buzz('tick', 4);
  }

  light(): void {
    this.buzz('light', 8);
  }

  medium(): void {
    this.buzz('medium', 18);
  }

  heavy(): void {
    this.buzz('heavy', [30, 40, 50]);
  }

  success(): void {
    this.buzz('success', [12, 30, 12]);
  }
}
