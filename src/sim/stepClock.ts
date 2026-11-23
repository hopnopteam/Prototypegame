/**
 * Phase 4c, the fixed simulation step (owner: "a 30 fps phone plays exactly like a 60 fps one"). Pure, so the rules
 * are unit-tested (tests/stepClock.test.ts); `Game.frame` runs `advanceClock` once a frame and steps the game the
 * number of times it returns.
 */

/** The simulation's one step length (seconds). `Game.simulate` uses it too. */
export const SIM_STEP = 1 / 60;
/**
 * At most this many steps a frame (times the dev fast-forward): a phone too slow to keep up plays a little slower
 * for a moment instead of spiralling (each frame owing more steps than the last); the time it could not run is
 * dropped.
 */
export const MAX_CATCH_UP_STEPS = 5;
/** A frame time within this of a whole number of steps counts as exactly that (screens tick at 60 Hz, not 1/60 s). */
export const SNAP_SECONDS = 0.0008;

/** A frame's time, snapped to a whole number of steps when it is within `SNAP_SECONDS` of one. */
export function snapToSteps(dt: number): number {
  const steps = Math.round(dt / SIM_STEP);
  return steps >= 1 && Math.abs(dt - steps * SIM_STEP) < SNAP_SECONDS ? steps * SIM_STEP : dt;
}

export interface ClockAdvance {
  /** Whole steps to run this frame. */
  steps: number;
  /** Time still owed after them (less than one step), carried to the next frame. */
  carry: number;
  /** How far the frame is between the last two steps (0–1), for render interpolation. */
  alpha: number;
  /** Seconds dropped because the frame owed more than the catch-up allows. */
  dropped: number;
}

/** Adds a frame's time to what is owed and splits it into whole steps. */
export function advanceClock(carry: number, frameSeconds: number, timeScale = 1): ClockAdvance {
  let owed = carry + snapToSteps(frameSeconds) * timeScale;
  const most = MAX_CATCH_UP_STEPS * Math.max(1, Math.ceil(timeScale));
  // A tiny tolerance so 1/60 + 1/60 + 1/60 is three steps however the floating point rounds.
  let steps = Math.min(most, Math.floor(owed / SIM_STEP + 1e-9));
  owed -= steps * SIM_STEP;
  if (owed < 0) owed = 0;
  let dropped = 0;
  if (owed >= SIM_STEP) {
    dropped = owed;
    owed = 0;
  }
  if (steps < 0) steps = 0;
  return { steps, carry: owed, alpha: Math.min(1, owed / SIM_STEP), dropped };
}
