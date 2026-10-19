// The save: versioned JSON in localStorage, every call wrapped (private windows and blocked storage just fall
// back to memory). Milestone 1 keeps best heights, controls and the debug tuning.
import { BARE_FRAME, CONTROLS, type SuitParams } from '../econ/balance';
import type { SuitFlags } from '../sim/SuitSim';

export const SAVE_VERSION = 1;
const KEY = 'exoforge.save';

export interface DebugSettings {
  /** Flight numbers changed with the debug sliders (only the changed ones). */
  overrides: Partial<SuitParams>;
  flags: SuitFlags;
  vectors: boolean;
  guides: boolean;
  slowMo: boolean;
}

export interface SaveData {
  v: number;
  /** Best height reached per world, metres. */
  best: Record<string, number>;
  runs: number;
  settings: { fullTiltPx: number };
  debug: DebugSettings;
}

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    best: {},
    runs: 0,
    settings: { fullTiltPx: CONTROLS.fullTiltPx },
    debug: { overrides: {}, flags: { invulnerable: false, infiniteBattery: false, noHeat: false }, vectors: false, guides: false, slowMo: false },
  };
}

/** Fills anything an older save lacks; drops overrides for numbers that no longer exist. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const overrides: Partial<SuitParams> = {};
  for (const [k, v] of Object.entries(r.debug?.overrides ?? {})) {
    if (k in BARE_FRAME && typeof v === 'number' && Number.isFinite(v)) (overrides as Record<string, number>)[k] = v;
  }
  return {
    v: SAVE_VERSION,
    best: { ...base.best, ...(r.best ?? {}) },
    runs: typeof r.runs === 'number' ? r.runs : 0,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    debug: { ...base.debug, ...(r.debug ?? {}), flags: { ...base.debug.flags, ...(r.debug?.flags ?? {}) }, overrides },
  };
}

export class Save {
  data: SaveData;
  private memory: string | null = null;

  constructor() {
    this.data = migrate(this.read());
  }

  write(): void {
    const text = JSON.stringify(this.data);
    this.memory = text;
    try {
      localStorage.setItem(KEY, text);
    } catch {
      // Storage blocked: the memory copy lasts for this session.
    }
  }

  reset(): void {
    this.data = defaultSave();
    this.write();
  }

  private read(): unknown {
    try {
      const text = localStorage.getItem(KEY) ?? this.memory;
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}
