// Heat and the overheat sputter (SPEC A5.2, A6). Pure: no engine, no rendering.
import { HEAT } from '../econ/balance';

export interface HeatParams {
  heatPerSecond: number;
  cooling: number;
  idleCoolingBonus: number;
  restCoolingMultiplier: number;
}

export interface HeatState {
  /** 0 cold, 1 overheated. */
  heat: number;
  /** Seconds of sputter left; 0 when the thrusters are fine. */
  sputterLeft: number;
  /** True while above the warning line (so the warning fires once per crossing). */
  warning: boolean;
}

export type HeatEvent = 'overheatWarn' | 'sputter' | 'sputterEnd';

export function newHeat(): HeatState {
  return { heat: 0, sputterLeft: 0, warning: false };
}

/** Thrust available right now, as a share of full: reduced while sputtering. */
export function thrustFactor(state: HeatState): number {
  return state.sputterLeft > 0 ? HEAT.sputterThrust : 1;
}

/** Cooling per second for a throttle and resting state. */
export function coolingRate(p: HeatParams, throttle: number, resting: boolean): number {
  return p.cooling * (1 + p.idleCoolingBonus * (1 - throttle)) * (resting ? p.restCoolingMultiplier : 1);
}

/**
 * Advances heat by one step. While sputtering, heat falls steadily to `sputterCoolTo` over the sputter;
 * otherwise thrust heats and cooling cools. Returns the event this step caused, if any.
 */
export function stepHeat(state: HeatState, p: HeatParams, throttle: number, resting: boolean, dt: number): HeatEvent | null {
  let event: HeatEvent | null = null;
  if (state.sputterLeft > 0) {
    state.heat = Math.max(HEAT.sputterCoolTo, state.heat - ((1 - HEAT.sputterCoolTo) / HEAT.sputterSeconds) * dt);
    state.sputterLeft -= dt;
    if (state.sputterLeft <= 1e-9) {
      state.sputterLeft = 0;
      state.heat = Math.min(state.heat, HEAT.sputterCoolTo);
      event = 'sputterEnd';
    }
  } else {
    state.heat += (p.heatPerSecond * throttle - coolingRate(p, throttle, resting)) * dt;
    state.heat = Math.max(0, Math.min(1, state.heat));
    if (state.heat >= 1) {
      state.sputterLeft = HEAT.sputterSeconds;
      event = 'sputter';
    }
  }
  const warning = state.heat > HEAT.warnAt;
  if (warning && !state.warning && event === null) event = 'overheatWarn';
  state.warning = warning;
  return event;
}
