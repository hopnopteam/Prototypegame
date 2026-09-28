/**
 * Floating joystick: touch anywhere on the game view, drag to walk. The stick appears where the finger lands
 * and follows it if dragged beyond the rim, so one thumb can play anywhere on screen. Arrow keys and WASD
 * work on desktop.
 */
export class Input {
  x = 0;
  y = 0;
  active = false;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly keys = new Set<string>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly radius = 56;
  private readonly deadZone = 0.12;
  onFirstInteraction: (() => void) | null = null;
  enabled = true;
  /** Set by the autopilot; wins over touch and keys while present. */
  override: { x: number; y: number } | null = null;

  constructor(private readonly surface: HTMLElement, overlay: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    overlay.appendChild(this.base);

    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.firstInteraction();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });
  }

  /** Stick direction with keyboard fallback, in screen space (x right, y down), length ≤ 1. */
  read(): { x: number; y: number } {
    if (this.override) return this.override;
    if (!this.enabled) return { x: 0, y: 0 };
    let kx = 0;
    let ky = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) kx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) kx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) ky -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    return { x: this.x, y: this.y };
  }

  release(): void {
    this.pointerId = null;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.base.classList.remove('visible');
  }

  private firstInteraction(): void {
    if (this.onFirstInteraction) {
      const fn = this.onFirstInteraction;
      this.onFirstInteraction = null;
      fn();
    }
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.firstInteraction();
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    const rect = this.surface.getBoundingClientRect();
    this.originX = e.clientX - rect.left;
    this.originY = e.clientY - rect.top;
    this.active = true;
    this.x = 0;
    this.y = 0;
    this.base.style.transform = `translate(${this.originX - this.radius}px, ${this.originY - this.radius}px)`;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.base.classList.add('visible');
    e.preventDefault();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const rect = this.surface.getBoundingClientRect();
    let dx = e.clientX - rect.left - this.originX;
    let dy = e.clientY - rect.top - this.originY;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      // Drag the stick along so the thumb never runs out of room.
      const excess = d - this.radius;
      this.originX += (dx / d) * excess;
      this.originY += (dy / d) * excess;
      dx = e.clientX - rect.left - this.originX;
      dy = e.clientY - rect.top - this.originY;
      this.base.style.transform = `translate(${this.originX - this.radius}px, ${this.originY - this.radius}px)`;
    }
    const nx = dx / this.radius;
    const ny = dy / this.radius;
    const magnitude = Math.min(1, Math.hypot(nx, ny));
    if (magnitude < this.deadZone) {
      this.x = 0;
      this.y = 0;
    } else {
      const scaled = (magnitude - this.deadZone) / (1 - this.deadZone);
      this.x = (nx / magnitude) * scaled;
      this.y = (ny / magnitude) * scaled;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    e.preventDefault();
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };
}
