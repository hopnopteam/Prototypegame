import { applyTune, CAMERA_STYLE, styleTune } from './cameraStyle';
import { NEW_LOOK, NEW_LOOK_NIGHT, NEW_LOOK_TIERS } from './look';
import { ACTIVE_ROUTE } from './routes';
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
    /** Metres of floor that must fit across the screen at the focus point (keeps people readable; session 20: 7.8, was 9, the slimmer train framed closer; session 36: 6.8, owner: "zoomed in a little bit more… everything feels too small"; session 37: 6.0, owner: "it needs to be bit closer"). */
    minVisibleWidth: 7.8,
    /** Metres the view leads along the train toward the locomotive (the way the train is going). */
    lookAhead: 0,
    /** Metres the view leans out over the lake, so more of it is on screen (the player sits a little low). */
    lakeBias: 0,
    /** Follow and framing easing (higher is snappier). */
    followSharpness: 7,
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
    /** Session 58: metres the view sits ahead of the conductor along the view (the My Perfect Hotel build; 0 here). */
    viewLead: 0,
    /** Session 58: one distance everywhere (no context zoom, no zoom kick, pans at the same distance); the MPH build. */
    fixedZoom: false,
    /** Session 58: screen shake on big moments (off in the MPH build). */
    shake: true,
    /** Session 58d: the follow as a critically damped spring with this smoothing time (s); 0 keeps `followSharpness`. */
    smoothTime: 0,
    /**
     * Session 58d, the MPH build (from the owner's video of My Perfect Hotel): stepping into a cabin or washroom turns the
     * view to `roomYawDeg` (negative: looking in from the corridor side), tilts it to `roomPitchDeg` and frames the room
     * (`roomWidthScale` × its longer side, at least `roomMinWidth` m across), centred on it; stepping out turns back.
     * `roomTurnSharpness` eases the turn (about a second), `roomSmoothTime` the slide to and from the room's centre.
     */
    roomView: false,
    roomYawDeg: -35,
    roomPitchDeg: 52,
    roomWidthScale: 1.6,
    roomMinWidth: 4.4,
    /** A suite is framed no wider than this (metres). */
    roomMaxWidth: 7.5,
    roomTurnSharpness: 4,
    roomSmoothTime: 0.28,
    /** Session 59b (camera builds): a line across the train the view holds while the conductor is aboard (NaN: none). */
    railX: NaN,
  },

  /**
   * Quality tiers. Every tier has the same palette, the same baked light (lamps, contact shading, window spill)
   * and the same graded tone map (installed in the renderer, so a tier without post-processing matches one
   * with it).
   *
   * Session 18 (owner: "the performance in mobile is completely trash… insane frame rate drops… the whole game
   * is completely blurred"): phones were drawn at 1.3× their CSS pixels, then dynamic resolution cut that to
   * 0.6 and Auto fell to Low, about 0.66× on a 3× screen, and remembered it for the next launch. Now the phone
   * tiers are cheap per pixel instead of low in resolution:
   * `lite`: light per vertex (exact for the flat-shaded geometry; see materials.ts), not full PBR per pixel.
   * `shadows`: 'off', 'static' (one map round the whole train, redrawn only when the train changes; people
   * keep their blob shadows) or 'follow' (a frustum on the view, redrawn every `shadowInterval` frames).
   * `pixelRatio` is a floor of crispness the dynamic resolution never goes far below (`minScale`).
   */
  quality: {
    tiers: {
      /*
       * Session 38b (owner, with the ad playable: "make sure the game performance is as smooth if not better… character
       * models actually have strong feel"): the playable's settings on every tier: no shadow maps (a soft blob under
       * everyone, steady and never popping in), no MSAA or SSAO; bloom and real lake reflections on High and Ultra only.
       * `strollers` (Phase 4c): how many townsfolk who are not travelling walk the platform, for looks only (they never
       * board, pay or block anyone), so a higher tier's busier station changes nothing in play.
       */
      /**
       * Older or 2–3 GB phones: the same shaders as Medium (lite shading, the static train shadow), drawn at
       * fewer pixels. Session 19: Low used to drop the shadow map, so an automatic Medium → Low step recompiled
       * every shader at once (a freeze of seconds on a phone); now the step only changes resolution.
       */
      low: { label: 'Low', pixelRatio: 2, maxMegapixels: 2.0, lite: true, shadows: 'off' as ShadowMode, shadowMap: 1024, softShadows: false, shadowInterval: 2, bloom: 0, msaa: 0, fxaa: false, reflections: 0, ssao: false , strollers: 4 },
      /** Every other phone: lite shading, the train's static moon shadow, drawn at 2× (session 19: crisp on every phone). */
      medium: { label: 'Medium', pixelRatio: 2.25, maxMegapixels: 2.6, lite: true, shadows: 'off' as ShadowMode, shadowMap: 1024, softShadows: false, shadowInterval: 2, bloom: 0, msaa: 0, fxaa: false, reflections: 0, ssao: false , strollers: 6 },
      /** Laptops (and phones, by choice): full shading, bloom halos, soft shadows, real lake reflections. */
      high: { label: 'High', pixelRatio: 2.5, maxMegapixels: 3.6, lite: false, shadows: 'off' as ShadowMode, shadowMap: 2048, softShadows: true, shadowInterval: 1, bloom: 0.5, msaa: 0, fxaa: false, reflections: 0.4, ssao: false , strollers: 8 },
      /** Desktops: sharper reflections and screen-space ambient occlusion on top. */
      ultra: { label: 'Ultra', pixelRatio: 2.5, maxMegapixels: 5.5, lite: false, shadows: 'off' as ShadowMode, shadowMap: 2048, softShadows: true, shadowInterval: 1, bloom: 0.5, msaa: 0, fxaa: false, reflections: 0.4, ssao: false , strollers: 8 },
    },
    /**
     * Frame pacing. High-refresh screens (120/144 Hz) are held to about 60 frames a second: the same smooth
     * motion for half the work and heat (a hot phone slows itself down). A frame that arrives sooner than
     * this share of a 60 fps frame after the last one is skipped (so 90 Hz screens still run at 90).
     */
    maxFps: 60,
    skipShare: 0.6,
    /**
     * Dynamic resolution, patient and shallow (session 18): a frame slower than `slowFrameMs` counts as slow;
     * when more than `slowShare` of the frames in a `windowSeconds` window are slow, the render scale steps down
     * by `stepDown`, never below `minScale` (a phone stays crisp). Nothing is judged in the first `graceSeconds`
     * of play (shaders and the first bakes) or for `hitchGraceSeconds` after a single long frame (a hitch is not
     * a slow device). After `recoverSeconds` of smooth play it climbs back by `stepUp`. A remembered scale is
     * only a starting point (never below `rememberFloor`): every launch can climb back to full.
     */
    /**
     * Session 24, smooth for the whole session: the static train shadow (Low and Medium) is redrawn at most this
     * often (seconds), however many things on the train change at once (a coupling's roll-in used to redraw the
     * whole train's shadow every frame for 2.3 s, a long hitch on a phone with a long train).
     */
    staticShadowGap: 0.6,
    /**
     * Session 28 (owner: "a smooth android build"): a frame counts as slow from 20 ms (was 24): over that it has missed a
     * 60 Hz refresh, and a phone running 40–50 fps alternates 16 and 33 ms frames, a judder; now it settles at an even 30.
     */
    dynamicResolution: { slowFrameMs: 20, slowShare: 0.5, windowSeconds: 2, minScale: 0.8, stepDown: 0.1, stepUp: 0.05, recoverSeconds: 6, graceSeconds: 6, hitchMs: 120, hitchGraceSeconds: 2, rememberFloor: 0.9, startScale: { touch: 1, desktop: 1 } },
    /**
     * Auto: if it is still slow at the lowest render scale for `downgradeSeconds`, drop a tier (never below
     * Low). On Low, still slow at the floor for as long again, frames are held to `fallbackFps` (an even 30 is
     * smoother than a stuttering 40) until things recover.
     */
    downgradeSeconds: 5,
    fallbackFps: 30,
  },

  /**
   * The night look (the hero look): cool moonlight outside, warm lamplight inside, glowing windows. Colours
   * are sRGB hex; intensities are in three.js physical units, then tone-mapped with ACES.
   */
  night: {
    /**
     * Session 26 raised it to 1.1 (owner: "make the colours pop a bit more"); session 27 (owner: "I don't like how
     * illuminated everything looks") brings the light back to 1.0 and keeps a little of the colour.
     */
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
      interior: { color: '#FFB978', intensity: 0.8 },
      lamp: { color: '#FFB066', intensity: 1.7, radius: 2.6 },
      /** Bare bulbs in a run-down carriage are colder and dimmer (session 51: dimmer still, 0.85 → 0.72); luxury is warmer and brighter. */
      tierLamp: [0.58, 0.93, 1.0, 1.06, 1.14, 1.24],
      spill: { color: '#FFB46E', intensity: 0.42, reach: 2.4 },
      /**
       * Fix list 5.4: a venue's own light from its first refit. The café bright and daytime (a fuller, creamier fill),
       * the dining car low and warm (a dim amber fill, the light pooled on each table from its lamp and candle).
       */
      venues: {
        cafe: { interior: '#FFE6C6', ambient: 1.3, lamp: '#FFE0B4', lampK: 1.1 },
        dining: { interior: '#FF9C5E', ambient: 0.55, lamp: '#FFA552', lampK: 0.75, table: { strength: 0.85, radius: 1.25 } },
      } as Record<string, { interior: string; ambient: number; lamp: string; lampK: number; table?: { strength: number; radius: number } }>,
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
     * Colour grade (every tier): lifted blue shadows, warm highlights, contrast and saturation, a soft vignette and a
     * whisper of grain (hides banding in the dark sky). Session 26 (after My Perfect Hotel, "just a little"): the colours
     * fuller (saturation 1.08 → 1.32) and the vignette lighter; session 27 ("too illuminated"): 1.2, with the light
     * back as it was.
     */
    grade: { shadows: '#16244A', shadowAmount: 0.05, highlights: '#FFD9A8', highlightAmount: 0.07, contrast: 1.1, saturation: 1.2, vignette: 0.28, grain: 0.02 },
  },

  /**
   * Time of day. `night` holds the moonlit hero look; `cycle` runs day → dusk → night → dawn across the journey
   * (the first session always stays at night when `firstSessionNight` is set).
   */
  time: { mode: 'night' as 'night' | 'cycle', firstSessionNight: true },

  /**
   * Phase 1, the Broken state (a carriage before its Repair): its lamp flickers now and then (a quick double dip of the
   * room's light, through the room dimmer: one small texture upload), and dust motes hang in the air round the conductor.
   */
  broken: {
    /**
     * Whether the room's light dips now and then (owner, 25 Nov: "lighting and flickering issues in spa and pool…
     * fix that glitch": a Broken carriage's whole floor dimming read as a rendering fault, not a faulty bulb). Off; the
     * dust motes, peeling paint and cracked panes still tell the story.
     */
    flicker: false,
    /** Seconds between flickers (a random pick in this range per carriage). */
    flickerEvery: [3, 8] as [number, number],
    /** The light's level at the bottom of each dip (1 is full). */
    flickerDip: 0.45,
    /** The dips and the gaps between them, in seconds: dip, light, dip. */
    flickerPattern: [0.07, 0.06, 0.11] as number[],
    /** Dust motes a second while the conductor is in a Broken carriage. */
    motesPerSecond: 3,
  },

  /**
   * Job signs (session 27: nothing on the floor, a badge over the thing the job is about, its ring filling as you work):
   * the badge's size (and how much it grows when the job wants you), and its height where no furniture is beside the
   * job (shoes in the corridor, a room without a bed near its middle).
   */
  pads: { icon: 0.74, iconLit: 0.1, iconHeight: 1.1 },
  /**
   * Session 49 (owner: "floor textures… consistent with the new graphics… outside grass that actually looks better"):
   * photo detail layers (CC0, Poly Haven; built by scripts/assets/build_textures.py into assets/textures/detail.jpg)
   * multiplied over the colours the game already paints. `tile` is the metres one repeat of the photo covers, `strength`
   * how much of its grain shows (0 none, 1 all of it). The order matches DETAIL_LAYERS in world/detail.ts.
   */
  detail: {
    woodWorn: { tile: 2.0, strength: 0.75 },
    wood: { tile: 1.9, strength: 0.6 },
    woodPolished: { tile: 2.4, strength: 0.55 },
    herringbone: { tile: 1.4, strength: 0.95 },
    wool: { tile: 0.9, strength: 0.45 },
    grass: { tile: 6.0, strength: 1.0 },
    ground: { tile: 3.0, strength: 0.7 },
    /** Session 51b: the station platform's stone flags (Poly Haven "patio tiles"), about 0.45 m a flag. */
    paving: { tile: 2.7, strength: 0.85 },
    /** Visual overhaul (art/textures/build_stylized.py): stylized flags with bevelled joints, a painted panel, soft carpet. */
    flagstone: { tile: 1.8, strength: 1.0 },
    panel: { tile: 1.2, strength: 0.8 },
    carpet: { tile: 0.8, strength: 0.7 },
    /** Visual overhaul: drawn wood grain along the boards (new look), worn, and a plush runner. */
    plank: { tile: 2.1, strength: 0.85 },
    plankWorn: { tile: 2.1, strength: 0.95 },
    fabric: { tile: 0.7, strength: 0.8 },
    /** The Riviera revamp: beach sand with wind ripples (baked in Blender, art/blender/sand_texture.py). */
    sand: { tile: 1.6, strength: 0.75 },
    /**
     * Session 63: the people's materials (art/textures/build_stylized.py), at a toy's scale: suiting twill, jersey
     * knit, denim, herringbone tweed, shirting, felt, pebbled leather, plaited straw and hair strands.
     */
    twill: { tile: 0.22, strength: 0.75 },
    knit: { tile: 0.15, strength: 0.8 },
    denim: { tile: 0.2, strength: 0.85 },
    tweed: { tile: 0.3, strength: 0.8 },
    oxford: { tile: 0.1, strength: 0.6 },
    felt: { tile: 0.2, strength: 0.6 },
    leather: { tile: 0.16, strength: 0.75 },
    straw: { tile: 0.2, strength: 0.9 },
    hair: { tile: 0.26, strength: 0.7 },
  },
};

// Session 58: the My Perfect Hotel camera build sets its own view (config/cameraStyle.ts).
if (CAMERA_STYLE !== 'default') applyTune(VISUALS.camera, styleTune());

// Visual overhaul (config/look.ts): the new look's night, light and tiers over the classic ones, before anything reads them.
function deepAssign(target: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(from)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepAssign(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}
if (NEW_LOOK) {
  deepAssign(VISUALS.night as unknown as Record<string, unknown>, NEW_LOOK_NIGHT);
  deepAssign(VISUALS.quality.tiers as unknown as Record<string, unknown>, NEW_LOOK_TIERS);
  // The Riviera stands in golden-hour sun: its platform lamps glow faintly, they cast no warm pools on sunlit stone.
  if (ACTIVE_ROUTE.id === 'riviera') VISUALS.night.light.platformLamp.intensity = 0.8;
}

export type Visuals = typeof VISUALS;
/** How the moon's shadows are drawn on a tier (see `quality`). */
export type ShadowMode = 'off' | 'static' | 'follow';
export type QualityTier = keyof typeof VISUALS.quality.tiers;
export type TierSettings = (typeof VISUALS.quality.tiers)[QualityTier];
export const QUALITY_TIERS: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
