/**
 * Phase 1, a debug shortcut (owner: "a debug shortcut to jump to any carriage or tier"): `?jump=N:T` in the address
 * opens the game with the route's first N carriages coupled (1–8 on the Countryside Express), every room, washroom and
 * seat open, and every carriage at lifecycle tier T: 0 Broken, 1–3 the refit tiers (the passenger carriages' Repair
 * comes with tier 1). `?jump=N:T:s` also hires every carriage's helpers (Staffed). It plays on its own save, rebuilt on
 * every load, and sends nothing to GameAnalytics; normal progress is never touched.
 */
export interface DebugJump {
  carriages: number;
  tier: number;
  staffed: boolean;
}

function parse(): DebugJump | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('jump');
  if (!raw) return null;
  const [n, t, s] = raw.split(':');
  const carriages = Math.max(1, Math.round(Number(n) || 1));
  const tier = Math.max(0, Math.min(3, Math.round(Number(t) || 0)));
  return { carriages, tier, staffed: s === 's' };
}

export const DEBUG_JUMP: DebugJump | null = parse();
