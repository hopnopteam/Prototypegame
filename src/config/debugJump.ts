/**
 * Phase 1, a debug shortcut (owner: "a debug shortcut to jump to any carriage or tier"): the game opens with the route's
 * first N carriages coupled (1–8 on the Countryside Express), every room, washroom and seat open, and every carriage at
 * lifecycle tier T: 0 Broken, 1–3 the refit tiers (the passenger carriages' Repair comes with tier 1); optionally every
 * carriage's helpers hired (Staffed). It plays on its own save, rebuilt on every load, and sends nothing to
 * GameAnalytics; normal progress is never touched.
 *
 * How to open it (owner: "how do I operate Debug?"): in the game, Settings, then tap the "Build …" line at the bottom
 * five times; the Debug sheet picks the carriages and the tier and reloads (`setDebugJump`). Or `?jump=N:T[:s]` in the
 * address of a page opened directly (not inside the Claude app, where the game runs in a frame).
 */
export interface DebugJump {
  carriages: number;
  tier: number;
  staffed: boolean;
  /** Phase 4: the route to play it on (left out: the save's own; `?jump=8:3:s@riviera`). */
  route?: string;
  /**
   * Session 70 (owner: "a gameplay segment from where I can start to experience the rail switch"): the end of the
   * line. The whole train as N:T:s, but one level short of the route's last and a handful of stars below it, so a
   * minute of ordinary play brings the last level, the next station is the grand station and the Grand Departure
   * plays as it would for a player who got there (`?jump=end`, `8:3:s:end`).
   */
  end?: boolean;
}

/** Writes a jump the way `parseJump` reads it. */
function jumpSpec(jump: DebugJump): string {
  return `${jump.carriages}:${jump.tier}${jump.staffed || jump.end ? ':s' : ''}${jump.end ? ':end' : ''}${jump.route ? `@${jump.route}` : ''}`;
}

/** Where the Debug sheet keeps the chosen jump between reloads. */
export const DEBUG_JUMP_KEY = 'nightexpress.jump';

function parseJump(raw: string | null): DebugJump | null {
  if (!raw) return null;
  const [spec, route] = raw.split('@');
  // `end` alone is the end of the whole line's first route: every carriage, its top tier, every helper.
  if (spec === 'end') return { carriages: 99, tier: 3, staffed: true, end: true, ...(route ? { route } : {}) };
  const [n, t, s, e] = spec.split(':');
  // Phase 4: 0 carriages plays the jump's save as it is (the far end of opening the next line from a jump).
  const carriages = Number(n) === 0 ? 0 : Math.max(1, Math.round(Number(n) || 1));
  const tier = Math.max(0, Math.min(3, Math.round(Number(t) || 0)));
  return { carriages, tier, staffed: s === 's', ...(e === 'end' ? { end: true } : {}), ...(route ? { route } : {}) };
}

function stored(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(DEBUG_JUMP_KEY);
  } catch {
    return null;
  }
}

function fromAddress(): string | null {
  return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('jump');
}

declare const __START_JUMP__: string;
/**
 * A build that opens at a jump when nothing else asks for one (`START_JUMP=end`: the "Line Switch" play link, which
 * starts at the end of Route 1). The Debug sheet's choice and the address still win; "Back to my game" in such a
 * build returns to its start.
 */
const BUILD_JUMP: string | null = typeof __START_JUMP__ !== 'undefined' && __START_JUMP__ ? __START_JUMP__ : null;

export const DEBUG_JUMP: DebugJump | null = parseJump(fromAddress() ?? stored() ?? BUILD_JUMP);

/** Remembers a jump for the next load without reloading (Phase 4: the caller reloads). */
export function setDebugJumpQuietly(jump: DebugJump): void {
  try {
    localStorage.setItem(DEBUG_JUMP_KEY, jumpSpec(jump));
  } catch {
    // Without storage the jump cannot follow; the reload opens the jump as it was.
  }
}

/** Opens the game at a jump (null: back to the player's own game), by reloading the page. */
export function setDebugJump(jump: DebugJump | null): void {
  try {
    if (jump) localStorage.setItem(DEBUG_JUMP_KEY, jumpSpec(jump));
    else localStorage.removeItem(DEBUG_JUMP_KEY);
  } catch {
    // Without storage the address (`?jump=`) is the only way in.
  }
  location.reload();
}
