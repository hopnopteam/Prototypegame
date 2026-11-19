import { VISUALS } from '../config/visuals';
import { applyTune, MPH_DEFAULTS, mphTune, saveTune, type CameraTune } from '../config/cameraStyle';
import type { CameraRig } from '../world/CameraRig';

/**
 * Session 58, the My Perfect Hotel camera build: a small camera button (bottom left) opens sliders for the view's angle,
 * tilt, lens, width, follow and lead, applied live as the game plays, kept in this browser, with the numbers shown so
 * they can be sent back and written into the profile (`MPH_DEFAULTS` in config/cameraStyle.ts).
 */
const SLIDERS: { key: keyof CameraTune; label: string; min: number; max: number; step: number }[] = [
  { key: 'yaw', label: 'Angle', min: 0, max: 360, step: 1 },
  { key: 'pitch', label: 'Tilt', min: 30, max: 80, step: 1 },
  { key: 'fov', label: 'Lens', min: 15, max: 60, step: 1 },
  { key: 'width', label: 'Width', min: 5, max: 16, step: 0.1 },
  { key: 'smooth', label: 'Smooth', min: 0.02, max: 0.5, step: 0.01 },
  { key: 'lead', label: 'Hero low', min: -1, max: 3, step: 0.1 },
];

export class CameraTuner {
  private tune = mphTune();
  private readonly panel: HTMLDivElement;
  private readonly values = new Map<keyof CameraTune, { input: HTMLInputElement; out: HTMLSpanElement }>();
  private readonly code: HTMLDivElement;

  constructor(
    host: HTMLElement,
    private readonly rig: CameraRig,
  ) {
    const button = document.createElement('button');
    button.textContent = 'CAM';
    button.style.cssText =
      'position:fixed;left:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);z-index:60;width:46px;height:46px;border-radius:12px;' +
      'border:3px solid #1d2430;background:linear-gradient(#fff,#cfe6ff);font:800 12px Jost,system-ui;color:#1d2430;box-shadow:0 4px 0 #1d2430;';
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 140px);z-index:60;display:none;padding:10px 12px;' +
      'border-radius:14px;border:3px solid #1d2430;background:rgba(255,255,255,0.93);font:600 13px Jost,system-ui;color:#1d2430;';
    for (const s of SLIDERS) {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:70px 1fr 44px;align-items:center;gap:8px;margin:3px 0;';
      const name = document.createElement('span');
      name.textContent = s.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(this.tune[s.key]);
      const out = document.createElement('span');
      out.style.textAlign = 'right';
      input.addEventListener('input', () => {
        this.tune = { ...this.tune, [s.key]: Number(input.value) };
        this.apply();
      });
      row.append(name, input, out);
      this.panel.append(row);
      this.values.set(s.key, { input, out });
    }
    this.code = document.createElement('div');
    this.code.style.cssText = 'margin-top:6px;font:500 11px ui-monospace,monospace;user-select:all;-webkit-user-select:all;word-break:break-all;';
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.style.cssText = 'margin-top:6px;padding:4px 14px;border-radius:9px;border:2px solid #1d2430;background:#ffd65a;font:700 13px Jost,system-ui;';
    reset.addEventListener('click', () => {
      this.tune = { ...MPH_DEFAULTS };
      saveTune(null);
      this.apply(false);
    });
    this.panel.append(this.code, reset);
    // The panel's touches never reach the walking stick under it.
    for (const el of [button, this.panel]) {
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart'] as const) el.addEventListener(type, (e) => e.stopPropagation());
    }
    button.addEventListener('click', () => {
      this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
    });
    host.append(button, this.panel);
    this.apply(false);
  }

  private apply(save = true): void {
    applyTune(VISUALS.camera, this.tune);
    this.rig.retune();
    if (save) saveTune(this.tune);
    for (const s of SLIDERS) {
      const v = this.values.get(s.key);
      if (!v) continue;
      v.input.value = String(this.tune[s.key]);
      v.out.textContent = String(this.tune[s.key]);
    }
    this.code.textContent = JSON.stringify(this.tune);
  }
}
