import { initPhysics, RAPIER } from '../src/sim/physics';
import { buildCourse, type ChunkData } from '../src/sim/Course';
import { Run } from '../src/sim/Run';
import { NO_FLAGS, type SuitFlags } from '../src/sim/SuitSim';
import { BARE_FRAME, SIM_HZ, type SuitParams } from '../src/econ/balance';
import { WORLDS } from '../src/content/worlds';
import type { PilotInput } from '../src/sim/Input';

export { RAPIER };
export const ready = initPhysics();

/** A tall flat-bottomed box: floor at y = 1, walls at x = 1 and 9. */
export function boxChunk(height = 60): ChunkData {
  return {
    id: 'w0_01', world: 1, name: 'Test box', width: 10, height,
    terrain: [{ id: 'box', points: [[0, height], [0, 0], [10, 0], [10, height], [9, height], [9, 1], [1, 1], [1, height]] }],
    ledges: [{ id: 'L0', x1: 2, x2: 8, y: 1 }],
    pickups: [], hazards: [], wind: [], guide: [[5, 1.2], [5, height - 0.5]], decor: [],
  };
}

export function boxRun(params: Partial<SuitParams> = {}, flags: Partial<SuitFlags> = {}, height = 60): Run {
  return new Run(buildCourse(1, [boxChunk(height)]), { ...BARE_FRAME, ...params }, { ...NO_FLAGS, ...flags });
}

export function courseRun(params: Partial<SuitParams> = {}, flags: Partial<SuitFlags> = {}): Run {
  return new Run(buildCourse(1, WORLDS[1].chunks), { ...BARE_FRAME, ...params }, { ...NO_FLAGS, ...flags });
}

/** Steps a run for some seconds with one input (or an input per step). */
export function fly(run: Run, seconds: number, input: PilotInput | ((tick: number) => PilotInput)): void {
  const steps = Math.round(seconds * SIM_HZ);
  for (let i = 0; i < steps && !run.done; i++) run.step(typeof input === 'function' ? input(run.tick) : input);
}

export const HOLD: PilotInput = { hold: true, tilt: 0 };
export const IDLE: PilotInput = { hold: false, tilt: 0 };
