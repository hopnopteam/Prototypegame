// Camera and view numbers (tune here; flight numbers live in econ/balance.ts).

export const VIEW = {
  /** Metres of course visible across the screen (the chunks are 10 m wide, their passages about 7 m). */
  widthM: 8.2,
  /** The canvas never draws above this device pixel ratio (SPEC A3). */
  maxResolution: 3,
  /** Desktop: a centred 9:19.5 frame once the window is wider than this aspect. */
  letterboxAbove: 0.6,
  frameAspect: 9 / 19.5,
};

export const CAMERA = {
  /** Spring stiffness (rad/s) of the critically damped follow, vertical and horizontal. */
  omegaY: 5.5,
  omegaX: 3.5,
  /** The camera looks this far above the suit, so more of the climb is in view. */
  lookUpM: 2.2,
  /** Leads the suit's vertical speed by this many seconds, clamped. */
  leadSeconds: 0.22,
  leadMinM: -2.5,
  leadMaxM: 3,
  /** Share of the suit's sideways position the camera follows (never showing past the course's sides). */
  followX: 0.55,
  /** Lowest the view goes: the course floor sits this far above the bottom edge (clear of the HUD dials). */
  floorMarginM: 3.4,
  /** Shake: offset and roll at full trauma, how fast trauma fades, and its speed. */
  shakeM: 0.35,
  shakeRoll: 0.035,
  traumaDecay: 2.2,
  shakeHz: 18,
};

export const WORKSHOP_VIEW = {
  /** The suit's height on the build stand, as a share of the screen height. */
  suitScreenShare: 0.36,
  /** Where its soles stand, as a share of the screen height from the top. */
  solesAt: 0.7,
};

export const PARTICLES = {
  max: 320,
};
