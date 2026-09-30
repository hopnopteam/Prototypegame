/**
 * How the game looks: the camera's view of the train, the quality tiers and the night staging. Tune freely:
 * no code changes needed.
 */
export const VISUALS = {
  camera: {
    /**
     * The train runs diagonally across the portrait screen: this is the angle (degrees, on the ground) between
     * the train and the camera's line of sight. 0 is the classic vertical train; 30 puts the locomotive toward
     * the top right and the rear toward the bottom left, with the lake on the upper-left side. On screen the
     * train looks a few degrees steeper than this (the view is tilted), about 37° at 30.
     */
    trainYawDeg: 30,
    /** How far the camera looks down (degrees below the horizon): a three-quarter dollhouse view. */
    pitchDeg: 48,
    /** Vertical field of view (degrees): narrow, so the train reads like a model on a table. */
    fovDeg: 33,
    /** Metres of floor that must fit across the screen at the focus point (keeps people readable). */
    minVisibleWidth: 8.4,
    /** Metres the view leads along the train toward the locomotive (the way the train is going). */
    lookAhead: 1.0,
    /** Metres the view leans out over the lake, so more of it is on screen (the player sits a little low). */
    lakeBias: 0.8,
    /** Follow and framing easing (higher is snappier). */
    followSharpness: 5,
    contextSharpness: 2.2,
    /**
     * A deep near plane buys depth precision (phones with 16-bit depth buffers otherwise flicker on surfaces a
     * few millimetres apart); the camera always hangs well above the train.
     */
    near: 8,
    far: 260,
    /**
     * Walking: the stick is read on screen (push up, walk up the screen). Directions within this many degrees
     * of the train's length or width snap onto it, so corridors and doorways are easy to walk straight along.
     */
    axisSnapDeg: 9,
    /** Metres of the world beyond the train's ends the view may show (scenery always covers more). */
    endMargin: 4,
  },

  /**
   * Quality tiers. `auto` picks one from the device (see world/Quality.ts) and steps down on its own if the
   * frame rate stays low; players can pick one in Settings. Every tier keeps the same look: higher tiers
   * add depth (real reflections, ambient occlusion, more lamp light, softer shadows), never gameplay.
   */
  quality: {
    tiers: {
      /** Old or weak phones: cheaper shading, no post-processing, fake water, fewer lamp pools. */
      low: { label: 'Low', pixelRatio: 1.25, pbr: false, lamps: 6, shadowMap: 1024, softShadows: false, bloom: 0, msaa: 0, reflections: 0, ssao: false },
      /** The 3 GB mid-range target: physically based materials, bloom at a reduced size, fake water. */
      medium: { label: 'Medium', pixelRatio: 1.5, pbr: true, lamps: 10, shadowMap: 1024, softShadows: false, bloom: 0.5, msaa: 2, reflections: 0, ssao: false },
      /** Recent phones: soft shadows, real lake reflections, more lamp pools. */
      high: { label: 'High', pixelRatio: 2, pbr: true, lamps: 16, shadowMap: 2048, softShadows: true, bloom: 0.5, msaa: 4, reflections: 0.4, ssao: false },
      /** Desktops and flagships: sharper reflections and screen-space ambient occlusion on top. */
      ultra: { label: 'Ultra', pixelRatio: 2.5, pbr: true, lamps: 24, shadowMap: 2048, softShadows: true, bloom: 0.75, msaa: 4, reflections: 0.6, ssao: true },
    },
    /** Auto: if the smoothed frame rate stays under this for `downgradeSeconds`, drop one tier. */
    downgradeFps: 45,
    downgradeSeconds: 4,
  },

  /**
   * The night look (the hero look): cool moonlight outside, warm lamplight inside, glowing windows. Colours
   * are sRGB hex; intensities are in three.js physical units, then tone-mapped with ACES.
   */
  night: {
    exposure: 1.0,
    /** The moon: the one shadow-casting light, from high over the lake (upper left, a little ahead). */
    moon: { color: '#A9BEFF', intensity: 1.35 },
    /** Sky and ground fill. */
    hemi: { sky: '#3D5590', ground: '#1A1F30', intensity: 1.1 },
    /** How much the night sky and the lamps are reflected by metal and polish (brass, varnish, water). */
    environment: 0.35,
    /** Warm ambient inside the carriages (what the ceiling lights would give), so no room is ever dark. */
    interior: { color: '#FFB978', intensity: 0.85 },
    /** Warm pools of light from the lamps nearest the camera (see quality `lamps` for how many). */
    lamp: { color: '#FFAE5C', intensity: 2.4, radius: 2.4 },
    /** Windows and lamp shades glow (linear HDR; bloom catches anything above the threshold). */
    windowGlow: 2.6,
    lampGlow: 3.2,
    fog: { color: '#1E2A4A', density: 0.0085 },
    bloom: { strength: 0.62, radius: 0.55, threshold: 0.92 },
    /**
     * Colour grade (MEDIUM and up): lifted blue shadows, warm highlights, a touch of contrast and saturation,
     * a soft vignette and a whisper of grain (hides banding in the dark sky).
     */
    grade: { shadows: '#16244A', shadowAmount: 0.05, highlights: '#FFD9A8', highlightAmount: 0.07, contrast: 1.1, saturation: 1.08, vignette: 0.34, grain: 0.02 },
  },

  /**
   * Time of day. `night` holds the moonlit hero look; `cycle` runs day → dusk → night → dawn across the journey
   * (the first session always stays at night when `firstSessionNight` is set).
   */
  time: { mode: 'night' as 'night' | 'cycle', firstSessionNight: true },
};

export type Visuals = typeof VISUALS;
export type QualityTier = keyof typeof VISUALS.quality.tiers;
export type TierSettings = (typeof VISUALS.quality.tiers)[QualityTier];
export const QUALITY_TIERS: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
