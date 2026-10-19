// The debug panel (SPEC A11): press D, or tap the top-left corner three times. Flags, overlays, chunk jumps
// and a live slider for every flight number, with "Copy values" so tuning can be pasted back into balance.ts.
import { BARE_FRAME, CONTROLS, type SuitParams } from '../econ/balance';
import type { Save } from './Save';

interface SliderDef {
  key: keyof SuitParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: readonly { group: string; items: SliderDef[] }[] = [
  {
    group: 'Thrust and body',
    items: [
      { key: 'thrustG', label: 'Thrust (g)', min: 0.9, max: 3, step: 0.01 },
      { key: 'rampUp', label: 'Thrust build-up (s)', min: 0.02, max: 0.6, step: 0.01 },
      { key: 'rampDown', label: 'Thrust fade (s)', min: 0.02, max: 0.6, step: 0.01 },
      { key: 'massKg', label: 'Mass (kg)', min: 60, max: 300, step: 5 },
      { key: 'comHeight', label: 'Centre of mass height (m)', min: 0.4, max: 1.4, step: 0.05 },
      { key: 'gyrationRadius', label: 'Gyration radius (m)', min: 0.3, max: 1, step: 0.02 },
      { key: 'dragLinear', label: 'Drag, linear', min: 0, max: 20, step: 0.5 },
      { key: 'dragQuadratic', label: 'Drag, quadratic', min: 0, max: 6, step: 0.1 },
    ],
  },
  {
    group: 'Gyro and tilt',
    items: [
      { key: 'maxTiltDeg', label: 'Full tilt (°)', min: 10, max: 70, step: 1 },
      { key: 'gyroKp', label: 'Gyro stiffness', min: 100, max: 6000, step: 50 },
      { key: 'gyroKd', label: 'Gyro damping', min: 0, max: 1000, step: 10 },
      { key: 'gyroMaxTorque', label: 'Gyro max torque', min: 50, max: 4000, step: 25 },
      { key: 'uprightStrength', label: 'Upright pull when released', min: 0, max: 1.5, step: 0.05 },
    ],
  },
  {
    group: 'Heat and battery',
    items: [
      { key: 'heatPerSecond', label: 'Heat per second', min: 0.1, max: 1.5, step: 0.01 },
      { key: 'cooling', label: 'Cooling per second', min: 0, max: 0.6, step: 0.01 },
      { key: 'idleCoolingBonus', label: 'Extra cooling when off', min: 0, max: 3, step: 0.05 },
      { key: 'restCoolingMultiplier', label: 'Rest cooling ×', min: 1, max: 6, step: 0.1 },
      { key: 'batterySeconds', label: 'Battery (s of thrust)', min: 5, max: 80, step: 1 },
    ],
  },
  {
    group: 'Armor and contact',
    items: [
      { key: 'plates', label: 'Plates', min: 1, max: 6, step: 1 },
      { key: 'armorThreshold', label: 'Armor threshold (m/s)', min: 1, max: 15, step: 0.25 },
      { key: 'damagePerMs', label: 'Damage per m/s over', min: 0.05, max: 1.5, step: 0.05 },
      { key: 'friction', label: 'Friction', min: 0, max: 1.5, step: 0.05 },
      { key: 'restitution', label: 'Bounce', min: 0, max: 0.8, step: 0.02 },
    ],
  },
];

export interface DebugHooks {
  /** Jump to a chunk (flight only). */
  jump(chunk: number): void;
  chunkCount(): number;
  /** The live flight numbers changed (the current run picks them up). */
  tuned(params: SuitParams): void;
  /** A one-line status (fps, draw calls, sim time). */
  status(): string;
}

export class DebugPanel {
  open = false;
  private readonly el: HTMLElement;
  private readonly statusEl: HTMLElement;
  private taps: number[] = [];
  private statusTimer = 0;

  constructor(host: HTMLElement, private readonly save: Save, private readonly hooks: DebugHooks) {
    this.el = document.createElement('div');
    this.el.className = 'debug-panel';
    this.el.dataset.ui = '';
    this.el.hidden = true;
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'debug-status';
    host.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyD' && !(e.target as Element | null)?.closest('input, textarea')) this.toggle();
    });
    // Three quick taps in the top-left corner (phones have no D key).
    host.addEventListener('pointerdown', (e) => {
      const rect = host.getBoundingClientRect();
      if (e.clientX - rect.left > 64 || e.clientY - rect.top > 64) return;
      // The event's own time, so a busy frame cannot stretch a quick triple tap.
      const now = e.timeStamp;
      this.taps = [...this.taps.filter((t) => now - t < 900), now];
      if (this.taps.length >= 3) {
        this.taps = [];
        this.toggle();
      }
    });
  }

  /** The flight numbers in effect: the bare frame with the slider overrides on top. */
  params(): SuitParams {
    return { ...BARE_FRAME, ...this.save.data.debug.overrides };
  }

  get settings() {
    return this.save.data.debug;
  }

  toggle(): void {
    this.open = !this.open;
    this.el.hidden = !this.open;
    if (this.open) this.build();
    window.clearInterval(this.statusTimer);
    if (this.open) this.statusTimer = window.setInterval(() => (this.statusEl.textContent = this.hooks.status()), 300);
  }

  private build(): void {
    const d = this.save.data.debug;
    const el = this.el;
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'debug-head';
    head.innerHTML = '<b>Debug</b>';
    const close = button('Close', () => this.toggle());
    head.append(close);
    el.append(head, this.statusEl);

    const flags = section('Run');
    flags.append(
      toggle('Slow motion (¼ speed)', d.slowMo, (v) => this.change(() => (d.slowMo = v))),
      toggle('Invulnerable', d.flags.invulnerable, (v) => this.change(() => (d.flags.invulnerable = v))),
      toggle('Infinite battery', d.flags.infiniteBattery, (v) => this.change(() => (d.flags.infiniteBattery = v))),
      toggle('No heat', d.flags.noHeat, (v) => this.change(() => (d.flags.noHeat = v))),
      toggle('Physics vectors', d.vectors, (v) => this.change(() => (d.vectors = v))),
      toggle('Guide paths and chunk bounds', d.guides, (v) => this.change(() => (d.guides = v))),
    );
    const jumps = document.createElement('div');
    jumps.className = 'debug-row';
    jumps.append(document.createTextNode('Jump to chunk '));
    for (let i = 0; i < this.hooks.chunkCount(); i++) {
      jumps.append(button(String(i + 1), () => {
        this.hooks.jump(i);
        this.toggle();
      }));
    }
    flags.append(jumps);
    el.append(flags);

    const controls = section('Controls');
    controls.append(slider('Finger travel for full tilt (px)', this.save.data.settings.fullTiltPx, 30, 200, 5, CONTROLS.fullTiltPx, (v) => this.change(() => (this.save.data.settings.fullTiltPx = v))));
    el.append(controls);

    for (const group of SLIDERS) {
      const sec = section(group.group);
      for (const s of group.items) {
        const value = this.params()[s.key];
        sec.append(slider(s.label, value, s.min, s.max, s.step, BARE_FRAME[s.key], (v) => this.change(() => {
          if (Math.abs(v - BARE_FRAME[s.key]) < 1e-9) delete d.overrides[s.key];
          else d.overrides[s.key] = v;
          this.hooks.tuned(this.params());
        })));
      }
      el.append(sec);
    }

    const actions = document.createElement('div');
    actions.className = 'debug-row';
    const out = document.createElement('textarea');
    out.className = 'debug-out';
    out.readOnly = true;
    out.hidden = true;
    actions.append(
      button('Copy values', () => {
        const text = JSON.stringify({ params: this.params(), fullTiltPx: this.save.data.settings.fullTiltPx }, null, 2);
        out.value = text;
        out.hidden = false;
        out.select();
        navigator.clipboard?.writeText(text).catch(() => undefined);
      }),
      button('Reset tuning', () => {
        d.overrides = {};
        this.save.data.settings.fullTiltPx = CONTROLS.fullTiltPx;
        this.save.write();
        this.hooks.tuned(this.params());
        this.build();
      }),
      button('Reset best heights', () => {
        this.save.data.best = {};
        this.save.write();
      }),
    );
    el.append(actions, out);
  }

  private change(fn: () => void): void {
    fn();
    this.save.write();
  }
}

function section(title: string): HTMLElement {
  const s = document.createElement('section');
  const h = document.createElement('h4');
  h.textContent = title;
  s.append(h);
  return s;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'debug-toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = value;
  box.addEventListener('change', () => onChange(box.checked));
  row.append(box, document.createTextNode(label));
  return row;
}

function slider(label: string, value: number, min: number, max: number, step: number, base: number, onChange: (v: number) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'debug-slider';
  const name = document.createElement('span');
  name.textContent = label;
  const out = document.createElement('output');
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const show = (v: number) => {
    out.textContent = v.toFixed(decimals);
    row.classList.toggle('changed', Math.abs(v - base) > 1e-9);
  };
  show(value);
  range.addEventListener('input', () => {
    const v = Number(range.value);
    show(v);
    onChange(v);
  });
  row.append(name, out, range);
  return row;
}
