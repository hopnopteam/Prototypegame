/**
 * Visual overhaul, Phase V1 (owner: "each slice item replaces the old one in the real game, behind a switch
 * (`?look=new` plus a debug setting)… the default stays the old look until I approve"). This is that switch, and the
 * new look's numbers. Visuals only: nothing here is read by the simulation (economy, timings, layout, guests), so the
 * pacing simulator gives identical results with either look (docs/art/REPORT.md, "Proof").
 *
 * How to turn it on: `?look=new` in the address, or Settings → five taps on the build line → Debug → "New look"
 * (kept in this browser under `nightexpress.look`). `?look=classic` forces the old look. Default: the new look.
 *
 * What it changes (docs/art/ART_BIBLE.md is the why):
 * - The route's light: the Riviera held at golden hour; Countryside follows its route preset (golden hour into a
 *   moonlit night over the first minutes, session 62).
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
// The owner approved the new look for the main game (25 Nov: "craft a final build… merge in the main game"): it is the
// default; `?look=classic` (or the Debug sheet) brings the old look back.
export const LOOK: LookId = raw === 'classic' ? 'classic' : 'new';
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
 * The route lighting presets of the new look: the point of the day cycle (Lighting's keys) a route is held at.
 * Riviera: golden hour, a low warm sun (ref 2). Countryside is not held (session 62, owner: "why is it so dark and messed
 * up?"): it opens at golden hour and fades into the moonlit night like its route preset (`goldenHourToNight`).
 */
export const LOOK_ROUTE_TIME: Record<string, number> = { riviera: 0.6 };

/**
 * The new look's overrides of VISUALS (applied over it at load by `config/visuals.ts`). Sampled from the reference
 * images (docs/art/ART_BIBLE.md, "Palette"): the night ambient is the refs' deep blue-violet (#1C2347 to #39406B in
 * the shadows), the lamps their amber (#FFB45C to #FFD9A0 in the pools).
 */
export const NEW_LOOK_NIGHT = {
  // Session 62 (owner: "why is it so dark and messed up?"): the night was a deep blue with the moon, sky and fill at about
  // 40% of the classic night's and the lamps at nearly 3× (so the scene was black between blown-out pools). It is a
  // moonlit night that reads again, still blue-violet, with warm lamps that add a glow rather than carry the scene.
  exposure: 1.08,
  // Session 66 (de-slop T12: "the whole palette drops to desaturated lilac… night reads as a colour filter"): the moon
  // and the sky's fill a moonlit blue rather than violet, the ground's bounce a neutral dark, same strengths.
  moon: { color: '#B2C0E4', intensity: 1.7 },
  hemi: { sky: '#4C5E8E', ground: '#2A2B33', intensity: 1.3 },
  fill: 0.8,
  sky: { zenith: '#121A3E', horizon: '#45508E', ground: '#16132A' },
  environment: 0.5,
  light: {
    interior: { color: '#FFB679', intensity: 0.7 },
    lamp: { color: '#FFAA58', intensity: 2.3, radius: 2.7 },
    spill: { color: '#FFB060', intensity: 0.55, reach: 2.5 },
    platformLamp: { color: '#FFAE62', intensity: 4.6, radius: 4 },
    ao: { wall: 0.55, wallReach: 0.5, prop: 0.58, propReach: 0.42, hull: 0.58, hullReach: 1.15 },
  },
  window: { glow: 0.8 },
  lampGlow: 3.6,
  fog: { color: '#1A2146', density: 0.0085 },
  bloom: { strength: 0.55, radius: 0.55, threshold: 1.0 },
  grade: { shadows: '#1A1E3E', shadowAmount: 0.05, highlights: '#FFD09A', highlightAmount: 0.08, contrast: 1.12, saturation: 1.1, vignette: 0.3, grain: 0.02 },
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
  // Owner (24 Nov, the Look APK, twice: "the player glitching… popping in and out", then a screenshot with only the
  // conductor's shoe drawn). The shoe draws itself; the body goes through the shared character batch, whose shader on
  // the phone tiers differs from the classic look's (which plays fine there) in one way: the static shadow map. Session
  // 38b had turned shadow maps off on every tier for the same reason (people read murky and see-through under it). The
  // phone tiers go back to exactly the classic look's render path: no shadow maps, no post-processing.
  low: { shadows: 'off' as const },
  medium: { shadows: 'off' as const },
  high: { bloom: 0.5, shadows: 'off' as const },
  ultra: { bloom: 0.5, shadows: 'off' as const },
};

/** Bevels: every box at least this big on all sides gets rounded edges of this radius (share of its smallest side, capped). */
export const BEVEL = { minSide: 0.12, share: 0.16, max: 0.025 };

/**
 * The platform's flags: dressed stone with a slight polish. Session 62 (owner: "the lamp is quite messed up"): the fake
 * wet-stone streaks and the additive pool discs are gone (on dry flags they read as beams of light fanning out from
 * every lamp, stacked over the baked pools); each lamp's pool is the baked light alone, which fades with the night.
 */
export const WET_STONE = {
  smoothness: 0.5,
};

/**
 * The props' baked occlusion (art/blender/bake_prop_ao.py): brightness = floor + (1 − floor) × min(1, ao × gain). The
 * gain lifts the bake (a vertex at the corner of flat-shaded faces sees half its hemisphere blocked by its neighbours).
 */
export const PROP_AO = { floor: 0.38, gain: 1.35 };

/** The figures in the new look: a little more of their own colour as light, and a soft warm rim (materials.ts, NX_FIGURE). */
export const FIGURE_RIM = { lift: 0.18, strength: 0.2, power: 3.2 };

/**
 * Floors (owner, 24 Nov: "real wood planks with grain and per-plank tone variation, like ref 2… carpet runners with a
 * soft fabric feel"): the new look swaps the photo grain for drawn layers (art/textures/build_stylized.py) and spreads
 * each board's tone wider (world/Floors.ts).
 */
export const LOOK_DETAIL_SWAP = { wood: 'plank', woodWorn: 'plankWorn', woodPolished: 'plank', wool: 'fabric' } as const;
/** Board tones in the new look: five per tier, a wider spread than the classic three (darker and lighter boards side by side). */
export const LOOK_BOARD_TONES = {
  old: ['#7E7464', '#8F8574', '#857A69', '#968B79', '#7A705F'],
  repaired: ['#B88E5E', '#C9A274', '#A97F52', '#D1AE80', '#BF955F'],
};

/** The Riviera's sun through the windows (CarriageView.buildSunPatches): colour, brightness, height over the floor. */
/**
 * The Riviera's sun through the windows (CarriageView.buildSunPatches). Off (owner, 24 Nov: "what are these weird lights
 * all over the train? fix them"): flat patches on the floor read as floating blobs of light, not sunlight.
 */
export const SUN_PATCH = { enabled: false, color: '#FFC27A', strength: 0.5, lift: 0.045 };

/** The countryside in the new look (owner, 24 Nov: "lush grass with flowers"): extra grass tufts and flowers a stretch, greener grass. */
export const LUSH = { tufts: 360, flowers: 70, grass: '#4C8A38', grassLight: '#6FAA45', grassDark: '#356A2C' };

/** How much a route's sea sparkles in the sun (new look; Water.ts): the Riviera's turquoise glitters, the lake at night does not. */
export const LOOK_SEA_SPARKLE: Record<string, number> = { riviera: 0.9 };
