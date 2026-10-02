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
    axisSnapDeg: 12,
    /** Metres of the world beyond the train's ends the view may show (scenery always covers more). */
    endMargin: 4,
  },

  /**
   * Quality tiers. Every tier has the same look: the same materials, the same baked light (lamps, contact
   * shading, window spill), the same palette and the same graded tone map (installed in the renderer, so a
   * tier without post-processing matches one with it). Higher tiers only add resolution, softer shadows,
   * bloom halos, real lake reflections and (Ultra) screen-space ambient occlusion.
   *
   * Session 15: phones render straight to the screen (Low and Medium have no post-processing at all: no
   * half-float target, no bloom chain, no extra full-screen passes). The screen's own multisampling
   * antialiases them, which is almost free on phone GPUs. Bloom and the rest start at High.
   * `shadowInterval`: the moon's shadow map is redrawn every this many frames (the train stands still and
   * people walk slowly, so every other frame looks the same and halves that pass on phones).
   */
  quality: {
    tiers: {
      /** Older or 2–3 GB phones: a lower resolution, hard shadows, no post-processing. */
      low: { label: 'Low', pixelRatio: 1.1, maxMegapixels: 0.75, shadowMap: 1024, softShadows: false, shadowInterval: 2, bloom: 0, msaa: 0, fxaa: false, reflections: 0, ssao: false },
      /** Every other phone: straight to the screen, multisampled by the screen itself. */
      medium: { label: 'Medium', pixelRatio: 1.5, maxMegapixels: 1.25, shadowMap: 1024, softShadows: false, shadowInterval: 2, bloom: 0, msaa: 0, fxaa: false, reflections: 0, ssao: false },
      /** Laptops (and phones, by choice): bloom halos, soft shadows, real lake reflections. */
      high: { label: 'High', pixelRatio: 2, maxMegapixels: 3.2, shadowMap: 2048, softShadows: true, shadowInterval: 1, bloom: 0.5, msaa: 4, fxaa: false, reflections: 0.4, ssao: false },
      /** Desktops: sharper reflections and screen-space ambient occlusion on top. */
      ultra: { label: 'Ultra', pixelRatio: 2.5, maxMegapixels: 5.5, shadowMap: 2048, softShadows: true, shadowInterval: 1, bloom: 0.75, msaa: 4, fxaa: false, reflections: 0.6, ssao: true },
    },
    /**
     * Frame pacing. High-refresh screens (120/144 Hz) are held to about 60 frames a second: the same smooth
     * motion for half the work and heat (a hot phone slows itself down). A frame that arrives sooner than
     * this share of a 60 fps frame after the last one is skipped (so 90 Hz screens still run at 90).
     */
    maxFps: 60,
    skipShare: 0.6,
    /**
     * Dynamic resolution. A frame slower than `slowFrameMs` counts as slow; when more than `slowShare` of the
     * frames in a `windowSeconds` window are slow, the render scale steps down by `stepDown` (quickly, so a
     * stutter never lasts). After `recoverSeconds` of smooth frames it creeps back up by `stepUp`, but never
     * above a scale that already proved too slow this session (no see-sawing). The scale it settles on is
     * remembered, so the next launch starts there. Phones start a little under full scale (`startScale`).
     */
    dynamicResolution: { slowFrameMs: 20, slowShare: 0.45, windowSeconds: 0.6, minScale: 0.6, stepDown: 0.12, stepUp: 0.05, recoverSeconds: 8, startScale: { touch: 0.88, desktop: 1 } },
    /** Auto: if it is still slow at the lowest render scale for `downgradeSeconds`, drop a tier. */
    downgradeSeconds: 3,
  },

  /**
   * The night look (the hero look): cool moonlight outside, warm lamplight inside, glowing windows. Colours
   * are sRGB hex; intensities are in three.js physical units, then tone-mapped with ACES.
   */
  night: {
    exposure: 1.0,
    /** The moon: the one shadow-casting light, from high over the lake (upper left, a little ahead). */
    moon: { color: '#BCC4FF', intensity: 2.0 },
    /** Sky and ground fill: a soft lavender night (the reference dioramas), never black. */
    hemi: { sky: '#5E64AE', ground: '#33294A', intensity: 1.55 },
    /** Moonlight bouncing back from the camera's side, so liveries and faces toward the camera read. */
    fill: 0.95,
    /** The night sky polished surfaces and the lake reflect (analytic; see nxSky). */
    sky: { zenith: '#161C44', horizon: '#4A4F8E', ground: '#1A1830' },
    /** How much the night sky and the lamps are reflected by metal and polish (brass, varnish, water). */
    environment: 0.35,
    /**
     * The baked light (world/lightBake.ts), painted once into a map of the train whenever it changes:
     * warm fill in every room, a soft pool under each lamp (staying in its own room), the light spilling out
     * of every window onto the platform and the water, and contact shading where floors meet walls, tuck
     * under furniture and meet the hull outside. Linear colours; scaled by the night amount.
     */
    light: {
      texel: 0.1,
      interior: { color: '#FFB978', intensity: 0.78 },
      lamp: { color: '#FFB066', intensity: 1.7, radius: 2.6 },
      /** Bare bulbs in a run-down carriage are a little colder and dimmer; luxury is warmer and brighter. */
      tierLamp: [0.85, 0.93, 1.0, 1.06, 1.14, 1.24],
      spill: { color: '#FFB46E', intensity: 0.42, reach: 2.4 },
      platformLamp: { color: '#FFA98C', intensity: 1.35, radius: 3.4 },
      ao: { wall: 0.34, wallReach: 0.42, prop: 0.4, propReach: 0.38, hull: 0.5, hullReach: 1.1 },
    },
    /** Windows: warm, framed panes (below the bloom threshold so they never smear into strips). */
    window: { glow: 0.62, nightGlass: '#1B2440' },
    /** Lamp shades glow (linear HDR; bloom catches what is above the threshold). */
    lampGlow: 2.6,
    fog: { color: '#2A2C52', density: 0.0085 },
    bloom: { strength: 0.42, radius: 0.5, threshold: 1.0 },
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
