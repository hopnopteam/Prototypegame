// Armor: impacts above the threshold cost plates of integrity (SPEC A5.2).

export type PlateState = 'full' | 'cracked' | 'lost';

/** Plates of damage for one impact. */
export function impactDamage(speed: number, threshold: number, perMs: number): number {
  return Math.max(0, speed - threshold) * perMs;
}

/** How each plate icon reads for a given integrity: whole plates full, a fraction cracked, the rest lost. */
export function plateStates(integrity: number, plates: number): PlateState[] {
  const states: PlateState[] = [];
  for (let i = 0; i < plates; i++) {
    if (integrity >= i + 1 - 1e-9) states.push('full');
    else if (integrity > i + 1e-9) states.push('cracked');
    else states.push('lost');
  }
  return states;
}

/** One plate patched by the drone, never above the suit's plates. */
export function patched(integrity: number, plates: number): number {
  return Math.min(plates, integrity + 1);
}
