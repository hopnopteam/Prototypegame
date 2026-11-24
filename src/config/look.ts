/**
 * Visual overhaul, Phase V1 (owner: "each slice item replaces the old one in the real game, behind a switch
 * (`?look=new` plus a debug setting)… the default stays the old look until I approve"). This is that switch, and the
 * new look's numbers. Visuals only: nothing here is read by the simulation (economy, timings, layout, guests), so the
 * pacing simulator gives identical results with either look (docs/art/REPORT.md, "Proof").
 *
 * How to turn it on: `?look=new` in the address, or Settings → five taps on the build line → Debug → "New look"
 * (kept in this browser under `nightexpress.look`). `?look=classic` forces the old look.
 *
 * What it changes (docs/art/ART_BIBLE.md is the why):
 * - The route's light: Countryside held at deep blue night, the Riviera held at golden hour (no fade during play).
 * - The night key: a dark blue-violet ambient, so the warm lamps make visible pools and the AO reads.
 * - The baked light: brighter, tighter lamp pools, stronger contact shading, platform lamp pools and a wet sheen.
 * - Bevelled boxes (rounded edges catch the light), bloom from Medium up, a firmer grade.
 * - The HUD and the request bubbles restyled (styles under `body.look-new`).
 */
export type LookId = 'classic' | 'new';

/** Where the Debug sheet keeps the choice. */
export const LOOK_KEY = 'nightexpress.look';

function fromAddress(): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('look');
  } catch {
    return null;
  }
}

function stored(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOOK_KEY);
  } catch {
    return null;
  }
}

/** A build made with LOOK_DEFAULT=new (the visual-overhaul Android build) opens in the new look. */
declare const __LOOK__: string | undefined;
const built = typeof __LOOK__ !== 'undefined' ? __LOOK__ : '';
const raw = fromAddress() ?? stored() ?? (built || null);
export const LOOK: LookId = raw === 'new' ? 'new' : 'classic';
/** True while the overhaul's look is on (read at load: a change reloads the page). */
export const NEW_LOOK = LOOK === 'new';

/** Remembers the look for the next load and reloads (the Debug sheet). */
export function setLook(look: LookId): void {
  try {
    localStorage.setItem(LOOK_KEY, look);
  } catch {
    // Without storage, `?look=new` in the address still works.
  }
  if (typeof location !== 'undefined') {
    const url = new URL(location.href);
    url.searchParams.delete('look');
    location.replace(url.toString());
  }
}

/**
 * The route lighting presets of the new look: the point of the day cycle (Lighting's keys) each route is held at.
 * Countryside: the middle of the night key (refs 1 and 3). Riviera: golden hour, a low warm sun (ref 2).
 */
export const LOOK_ROUTE_TIME: Record<string, number> = { countryside: 0.82, riviera: 0.6 };

/**
 * The new look's overrides of VISUALS (applied over it at load by `config/visuals.ts`). Sampled from the reference
 * images (docs/art/ART_BIBLE.md, "Palette"): the night ambient is the refs' deep blue-violet (#1C2347 to #39406B in
 * the shadows), the lamps their amber (#FFB45C to #FFD9A0 in the pools).
 */
export const NEW_LOOK_NIGHT = {
  exposure: 1.08,
  moon: { color: '#A9AEE6', intensity: 1.45 },
  hemi: { sky: '#5E5478', ground: '#2E2230', intensity: 0.8 },
  fill: 0.34,
  sky: { zenith: '#0E1433', horizon: '#3A4382', ground: '#120F22' },
  environment: 0.55,
  light: {
    interior: { color: '#FFB679', intensity: 0.5 },
    lamp: { color: '#FFAA58', intensity: 3.8, radius: 2.7 },
    spill: { color: '#FFB060', intensity: 0.7, reach: 2.6 },
    platformLamp: { color: '#FFB070', intensity: 3.8, radius: 5.2 },
    ao: { wall: 0.62, wallReach: 0.55, prop: 0.66, propReach: 0.45, hull: 0.62, hullReach: 1.2 },
  },
  window: { glow: 0.9 },
  lampGlow: 4.2,
  fog: { color: '#141A3A', density: 0.0095 },
  bloom: { strength: 0.62, radius: 0.55, threshold: 1.0 },
  grade: { shadows: '#14204A', shadowAmount: 0.06, highlights: '#FFD09A', highlightAmount: 0.1, contrast: 1.16, saturation: 1.22, vignette: 0.36, grain: 0.02 },
};

/**
 * Golden hour (the Riviera, ref 2): a low warm sun from over the sea, a warm sky fill, long soft shadows. Replaces
 * Lighting's golden key while the new look is on.
 */
export const NEW_LOOK_GOLDEN = { sky: '#F2C79A', hemiSky: '#FFD2A8', hemiGround: '#5A3E38', hemi: 0.78, sun: '#FFB36A', sunIntensity: 4.4, night: 0.08, env: 0.75, fog: 0.005 };

/**
 * Where the key light stands per route in the new look (offset from the view's focus, metres): the Riviera's golden-hour
 * sun is low over the sea, so walls and furniture throw long shadows across the floors (ref 2). Countryside keeps the
 * classic high moon.
 */
export const LOOK_SUN_OFFSET: Record<string, [number, number, number]> = { riviera: [-15, 6.2, -5.5] };

/** The quality tiers in the new look: bloom from Medium (lamps and emissives only), the train's static sun shadow from Medium. */
export const NEW_LOOK_TIERS = {
  medium: { bloom: 0.45, shadows: 'static' as const },
  high: { bloom: 0.6, shadows: 'follow' as const },
  ultra: { bloom: 0.6, shadows: 'static' as const },
};

/** Bevels: every box at least this big on all sides gets rounded edges of this radius (share of its smallest side, capped). */
export const BEVEL = { minSide: 0.12, share: 0.16, max: 0.025 };

/** Wet stone (ref 1): the platform's flags are polished, and each platform lamp throws a streak of reflection toward the camera. */
export const WET_STONE = { smoothness: 0.78, streakLength: 2.6, streakWidth: 0.55, streakStrength: 0.95 };

/**
 * The props' baked occlusion (art/blender/bake_prop_ao.py): brightness = floor + (1 − floor) × min(1, ao × gain). The
 * gain lifts the bake (a vertex at the corner of flat-shaded faces sees half its hemisphere blocked by its neighbours).
 */
export const PROP_AO = { floor: 0.38, gain: 1.35 };

/** The figures in the new look: a little more of their own colour as light, and a soft warm rim (materials.ts, NX_FIGURE). */
export const FIGURE_RIM = { lift: 0.2, strength: 0.45, power: 2.6 };
