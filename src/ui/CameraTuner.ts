import { VISUALS } from '../config/visuals';
import { applyTune, cameraMode, defaultsFor, mphTune, saveMode, saveTune, ZOOM_PRESETS, type CameraMode, type CameraTune } from '../config/cameraStyle';
import type { CameraRig } from '../world/CameraRig';

/**
 * Sessions 58 and 58b, the My Perfect Hotel camera build: a small camera button (bottom left) opens the camera's options,
 * applied live as the game plays and kept in this browser: the mode (third person, the default, or the fixed isometric
 * view), Close / Mid / Far zoom, and sliders for the rest, with the numbers shown so they can be sent back and written
 * into the defaults (`THIRD_DEFAULTS`, `MPH_DEFAULTS` in config/cameraStyle.ts).
 */
interface Slider {
  key: keyof CameraTune;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: Record<CameraMode, Slider[]> = {
  third: [
    { key: 'distance', label: 'Distance', min: 3, max: 14, step: 0.1 },
    { key: 'pitch', label: 'Height', min: 15, max: 75, step: 1 },
    { key: 'fov', label: 'Lens', min: 25, max: 75, step: 1 },
    { key: 'turn', label: 'Turn', min: 1, max: 15, step: 0.5 },
    { key: 'follow', label: 'Follow', min: 2, max: 25, step: 0.5 },
    { key: 'lead', label: 'Look ahead', min: 0, max: 4, step: 0.1 },
    { key: 'look', label: 'Aim height', min: 0, max: 2, step: 0.05 },
  ],
  iso: [
    { key: 'yaw', label: 'Angle', min: 0, max: 90, step: 1 },
    { key: 'pitch', label: 'Tilt', min: 30, max: 80, step: 1 },
    { key: 'fov', label: 'Lens', min: 15, max: 60, step: 1 },
    { key: 'width', label: 'Width', min: 5, max: 16, step: 0.1 },
    { key: 'follow', label: 'Follow', min: 1, max: 15, step: 0.5 },
    { key: 'lead', label: 'Hero low', min: -1, max: 3, step: 0.1 },
  ],
};

const BUTTON_CSS = 'padding:5px 10px;border-radius:9px;border:2px solid #1d2430;font:700 13px Jost,system-ui;color:#1d2430;';

export class CameraTuner {
  private mode: CameraMode = cameraMode();
  private tune = mphTune(this.mode);
  private readonly panel: HTMLDivElement;
  private readonly rows: HTMLDivElement;
  private readonly modes: HTMLDivElement;
  private readonly zooms: HTMLDivElement;
  private readonly code: HTMLDivElement;
  private readonly values = new Map<keyof CameraTune, { input: HTMLInputElement; out: HTMLSpanElement }>();

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
    this.modes = document.createElement('div');
    this.zooms = document.createElement('div');
    for (const bar of [this.modes, this.zooms]) bar.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;';
    this.rows = document.createElement('div');
    this.code = document.createElement('div');
    this.code.style.cssText = 'margin-top:6px;font:500 11px ui-monospace,monospace;user-select:all;-webkit-user-select:all;word-break:break-all;';
    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.style.cssText = `${BUTTON_CSS}margin-top:6px;background:#ffd65a;`;
    reset.addEventListener('click', () => {
      this.tune = defaultsFor(this.mode);
      saveTune(this.mode, null);
      this.apply(false);
    });
    this.panel.append(this.modes, this.zooms, this.rows, this.code, reset);
    // The panel's touches never reach the walking stick under it.
    for (const el of [button, this.panel]) {
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart'] as const) el.addEventListener(type, (e) => e.stopPropagation());
    }
    button.addEventListener('click', () => {
      this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
    });
    host.append(button, this.panel);
    this.build();
    this.apply(false);
  }

  /** The mode buttons, the zoom buttons and the sliders for the current mode. */
  private build(): void {
    this.modes.replaceChildren();
    for (const [mode, label] of [['third', 'Third person'], ['iso', 'MPH fixed']] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `${BUTTON_CSS}background:${mode === this.mode ? '#7fd36b' : '#fff'};`;
      b.addEventListener('click', () => {
        if (mode === this.mode) return;
        this.mode = mode;
        saveMode(mode);
        this.tune = mphTune(mode);
        this.build();
        this.apply(false);
      });
      this.modes.append(b);
    }
    this.zooms.replaceChildren();
    const zoomKey: keyof CameraTune = this.mode === 'third' ? 'distance' : 'width';
    for (const preset of ZOOM_PRESETS[this.mode]) {
      const b = document.createElement('button');
      b.textContent = preset.label;
      b.style.cssText = `${BUTTON_CSS}background:#cfe6ff;`;
      b.addEventListener('click', () => {
        this.tune = { ...this.tune, [zoomKey]: preset.value };
        this.apply();
      });
      this.zooms.append(b);
    }
    this.rows.replaceChildren();
    this.values.clear();
    for (const s of SLIDERS[this.mode]) {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:82px 1fr 44px;align-items:center;gap:8px;margin:3px 0;';
      const name = document.createElement('span');
      name.textContent = s.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      const out = document.createElement('span');
      out.style.textAlign = 'right';
      input.addEventListener('input', () => {
        this.tune = { ...this.tune, [s.key]: Number(input.value) };
        this.apply();
      });
      row.append(name, input, out);
      this.rows.append(row);
      this.values.set(s.key, { input, out });
    }
  }

  private apply(save = true): void {
    applyTune(VISUALS.camera, this.tune, this.mode);
    this.rig.retune();
    if (save) saveTune(this.mode, this.tune);
    for (const [key, v] of this.values) {
      v.input.value = String(this.tune[key]);
      v.out.textContent = String(this.tune[key]);
    }
    this.code.textContent = `${this.mode} ${JSON.stringify(this.tune)}`;
  }
}
