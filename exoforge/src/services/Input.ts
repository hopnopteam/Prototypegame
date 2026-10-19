// One-thumb flight controls (SPEC A5.2): hold anywhere to fire the boots; while holding, drag sideways to tilt.
// The tilt is the finger's travel from where it touched down; past a full tilt the anchor follows the finger,
// so easing back starts straightening at once. Keyboard for desktop: Space or Up to fire, Left/Right to tilt.
import { tiltFromDrag, type PilotInput } from '../sim/Input';

export class PilotInputSource {
  enabled = false;
  private pointerId: number | null = null;
  private anchorX = 0;
  private dx = 0;
  private keyHold = false;
  private keyLeft = false;
  private keyRight = false;
  private readonly sampleOut: PilotInput = { hold: false, tilt: 0 };
  /** Fires on the first touch of a flight (the hint hand hides). */
  onTouch: (() => void) | null = null;

  constructor(private readonly surface: HTMLElement, private readonly fullTiltPx: () => number) {
    surface.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.key(true));
    window.addEventListener('keyup', this.key(false));
    window.addEventListener('blur', () => this.release());
  }

  /** The input for this step. */
  sample(): PilotInput {
    const out = this.sampleOut;
    if (!this.enabled) {
      out.hold = false;
      out.tilt = 0;
      return out;
    }
    const touching = this.pointerId !== null;
    out.hold = touching || this.keyHold;
    const keyTilt = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    out.tilt = touching ? tiltFromDrag(this.dx, this.fullTiltPx()) : keyTilt;
    return out;
  }

  get holding(): boolean {
    return this.pointerId !== null || this.keyHold;
  }

  release(): void {
    this.pointerId = null;
    this.dx = 0;
    this.keyHold = this.keyLeft = this.keyRight = false;
  }

  private readonly down = (e: PointerEvent) => {
    if (!this.enabled || this.pointerId !== null) return;
    if ((e.target as Element | null)?.closest('[data-ui]')) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.anchorX = e.clientX;
    this.dx = 0;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot always be captured; window listeners still track them.
    }
    this.onTouch?.();
  };

  private readonly move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const full = this.fullTiltPx();
    let dx = e.clientX - this.anchorX;
    if (Math.abs(dx) > full) {
      this.anchorX = e.clientX - Math.sign(dx) * full;
      dx = Math.sign(dx) * full;
    }
    this.dx = dx;
  };

  private readonly up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.dx = 0;
  };

  private key(down: boolean) {
    return (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest('input, textarea')) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        this.keyHold = down;
        if (down) this.onTouch?.();
        e.preventDefault();
      } else if (e.code === 'ArrowLeft') this.keyLeft = down;
      else if (e.code === 'ArrowRight') this.keyRight = down;
    };
  }
}
