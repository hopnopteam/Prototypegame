// One step's pilot input. Hold fires the boots; tilt is the drag, −1 (full left) to 1 (full right).

export interface PilotInput {
  hold: boolean;
  tilt: number;
}

export const NO_INPUT: Readonly<PilotInput> = Object.freeze({ hold: false, tilt: 0 });

/** Turns a finger's horizontal travel from its touch-down point into a tilt request. */
export function tiltFromDrag(dxPx: number, fullTiltPx: number): number {
  if (fullTiltPx <= 0) return 0;
  return Math.max(-1, Math.min(1, dxPx / fullTiltPx));
}
