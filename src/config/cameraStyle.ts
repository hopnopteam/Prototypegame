/**
 * Session 58, the My Perfect Hotel camera experiment (owner: "I want to COMPLETELY… replicate the full style of camera
 * style and placement, movement and literally everything in terms of camera of My Perfect Hotel. Make a separate build
 * for that."). On in a build made with CAMERA_STYLE=mph (`OUT=mph.html`) or with `?cam=mph` in the address; the normal
 * build is untouched.
 *
 * Session 58c, after the owner's video of My Perfect Hotel (https://www.youtube.com/watch?v=4-otOq45qu8; read from its
 * thumbnail frames, since this server cannot play YouTube): in play the camera faces straight along the building, no
 * diagonal: the hallway runs up the middle of the portrait screen with rooms on both sides and the reception desk across
 * it, seen from high up (about 55–60° down) through a moderate lens, the hero in the middle of the screen at one distance.
 * For the train that is:
 * - The train straight up the screen, the corridor like MPH's hallway. Session 58e (owner: "it should start from
 *   opposite direction… 180 from behind… whatever is behind the train"): `yaw` 180, so the camera stands at the
 *   locomotive's end and looks back along the train: the locomotive at the bottom, the rear (and what lies behind the
 *   train) at the top, the lake on the right and the platform on the left; looking down 58° through a 35° lens, 5.8 m of floor across the screen (session 58d, owner: "zoom in a little more"; 6.6 before), so the train fills the width as MPH's hotel does.
 * - One fixed distance: no zoom in while walking, none on entering a room or the platform, no zoom kick on a purchase.
 * - A spring follow on both axes (session 58d, owner: "much smoother, much more reactive"): a critically damped spring
 *   (Unity's SmoothDamp) with a 0.08 s smoothing time, so the camera eases into and out of a walk instead of jumping to
 *   full speed, and keeps the conductor within about half a metre of the middle while walking; no lead.
 * - Rooms get their own view (session 58d, seen in the video: walking into a room, MPH turns to a diagonal and frames the
 *   room, and turns back on leaving): stepping into a cabin or washroom turns the view 35° to look in from the corridor
 *   side, a little lower (52°), centred on the room and close enough that it fills the screen; stepping out turns back,
 *   each over about a second (`roomView` and the `room…` numbers in `VISUALS.camera`).
 * - Free, analogue walking (no snapping onto the train's axes).
 * - New things are shown by a pan over to them and back at the same distance, with no shake.
 * Every number can be changed live in that build with the camera button (bottom left); the values are kept in this
 * browser and shown on the panel, to copy into the profile below.
 *
 * Session 59, the Showcase camera (owner: "full freedom… the absolute best camera angle… for playing, aesthetics,
 * focus, retention"), built with CAMERA_STYLE=showcase (`OUT=showcase.html`) or `?cam=showcase`. Chosen by shooting
 * every candidate at five moments of play (the opening, a corridor, a cabin, the café, a station stop):
 * - A gentle three-quarter diagonal (`yaw` 160): the train runs up the portrait screen leaning about 25°, so walls,
 *   counters and beds show their faces and the carriages read as a diorama (the straight MPH view reads as a floor
 *   plan), while far more of the train is in view than on the old 37° diagonal.
 * - From the platform side and the locomotive's end: the platform, where the busiest play happens, is the foreground
 *   at the bottom of the screen, the lake the backdrop at the top; the rear of the train, where every new carriage
 *   couples on and the next one waits under its tarp, is up the screen, so the train grows ahead of the player.
 * - Looking down 54° through a 34° lens, 5.6 m across at the conductor: close enough that people and items read at
 *   thumb size, wide enough to see the next job.
 * - The spring follow of the MPH build (0.1 s), no lead, no shake, one steady distance, except: a cabin or washroom
 *   frames itself (centred, closer, never turning, so the stick never changes meaning mid-walk), and the platform
 *   pulls out 12% to take in the queue, the bell and the shops.
 * - The carriages' end walls facing the camera are cut down like the far ones, so no carriage hides its own floor.
 *
 * Session 59b, the Side View (owner, on the Showcase: "this game camera sucks, I told you to come with an innovative
 * perspective"), built with CAMERA_STYLE=side (`OUT=side.html`) or `?cam=side`: the train seen side-on from the
 * platform like a dollhouse with its front taken off (the cut-away train of a film's tracking shot). The platform-side
 * wall is a sill and the corridor's partition waist-high (`CUTAWAY_SIDE`), so every room, guest and face reads from
 * the side; the lake and the far shore fill the top of the portrait screen, the train runs across the middle with the
 * locomotive to the right, the platform or the passing countryside below. Aboard, the view holds one line across the
 * train (`rail`), like a camera on a dolly, and slides along it with the conductor; rooms frame themselves a little
 * closer; the platform pulls back 10%.
 */

declare const __CAMERA_STYLE__: string | undefined;

export type CameraStyle = 'default' | 'mph' | 'showcase' | 'side';

const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;
const built = typeof __CAMERA_STYLE__ !== 'undefined' ? __CAMERA_STYLE__ : '';
const pick = (v: string | null): CameraStyle | null => (v === 'mph' || v === 'showcase' || v === 'side' ? v : null);

export const CAMERA_STYLE: CameraStyle = pick(built) ?? pick(fromUrl) ?? 'default';

/** The tunable numbers of a camera profile (and the panel's sliders). */
export interface CameraTune {
  /** The building's angle to the screen (degrees). */
  yaw: number;
  /** How far the camera looks down (degrees below the horizon). */
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Metres of floor across the screen at the hero. */
  width: number;
  /** Follow easing for pans to new things (higher is snappier). */
  follow: number;
  /** Session 58d: seconds the camera's spring takes to catch the hero (smaller is more reactive, never jerky). */
  smooth: number;
  /** Metres the view sits ahead of the hero along the view, so they stand a little below the middle. */
  lead: number;
  /** Session 59: how far a room's view turns from the corridor's (degrees, toward the corridor side; 0 keeps it). */
  roomTurn: number;
  /** Session 59: the platform's framing (1 the same distance as inside; above 1 pulls out). */
  platform: number;
  /**
   * Session 59b (the side view): inside the train the view holds this line across the carriage (metres, train x) like a
   * camera on a dolly beside the train, so the train stays put on screen and only the conductor moves in it; NaN
   * follows the conductor across too.
   */
  rail: number;
}

export const MPH_DEFAULTS: CameraTune = { yaw: 180, pitch: 58, fov: 35, width: 5.8, follow: 5, lead: 0, smooth: 0.08, roomTurn: 35, platform: 1, rail: NaN };
export const SHOWCASE_DEFAULTS: CameraTune = { yaw: 160, pitch: 54, fov: 34, width: 5.6, follow: 5, lead: 0, smooth: 0.1, roomTurn: 0, platform: 1.12, rail: NaN };
export const SIDE_DEFAULTS: CameraTune = { yaw: 90, pitch: 36, fov: 30, width: 6.2, follow: 5, lead: 3, smooth: 0.12, roomTurn: 0, platform: 1.1, rail: 0.2 };

/** The defaults of the style this build runs. */
export const STYLE_DEFAULTS: CameraTune = CAMERA_STYLE === 'showcase' ? SHOWCASE_DEFAULTS : CAMERA_STYLE === 'side' ? SIDE_DEFAULTS : MPH_DEFAULTS;

// A new key whenever the defaults move (58c the straight view, 58e turned round), so old panel numbers do not carry over.
const STORE_KEY = CAMERA_STYLE === 'mph' ? 'nightexpress.camtune.v4' : `nightexpress.camtune.${CAMERA_STYLE}.v1`;

/** The profile's numbers: the defaults, or what was last set on the panel in this browser. */
export function styleTune(): CameraTune {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    if (raw) {
      const t = { ...STYLE_DEFAULTS, ...(JSON.parse(raw) as Partial<CameraTune>) };
      // JSON has no NaN (it comes back as null): no rail.
      if (typeof t.rail !== 'number') t.rail = NaN;
      return t;
    }
  } catch {
    /* no storage: the defaults */
  }
  return { ...STYLE_DEFAULTS };
}

export function saveTune(t: CameraTune | null): void {
  try {
    if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to keep it in */
  }
}

/**
 * Session 59: the camera looks from the locomotive's end (its yaw past 90°), so the carriages' front end walls face it
 * and are cut down like the rear ones (read by the floor plans once, at load).
 */
export const CUTAWAY_FRONT = CAMERA_STYLE !== 'default' && Math.cos((styleTune().yaw * Math.PI) / 180) < -0.2;

/**
 * Session 59b, the side view: the camera looks across the train from the platform side like a dollhouse with its front
 * taken off, so the platform-side wall is cut down to a sill and the corridor's partition to waist height (read by the
 * floor plans once, at load).
 */
export const CUTAWAY_SIDE = CAMERA_STYLE === 'side';

/** The view part of `VISUALS.camera` the profile sets. */
export interface CameraVisuals {
  trainYawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  minVisibleWidth: number;
  followSharpness: number;
  axisSnapDeg: number;
  viewLead: number;
  fixedZoom: boolean;
  shake: boolean;
  smoothTime: number;
  roomView: boolean;
  roomYawDeg: number;
  roomPitchDeg: number;
  railX: number;
}

/** Puts a tune into `VISUALS.camera` (at load, and live from the panel). */
export function applyTune(cam: CameraVisuals, t: CameraTune): void {
  cam.trainYawDeg = t.yaw;
  cam.pitchDeg = t.pitch;
  cam.fovDeg = t.fov;
  cam.minVisibleWidth = t.width;
  cam.followSharpness = t.follow;
  cam.viewLead = t.lead;
  cam.axisSnapDeg = 0;
  cam.fixedZoom = true;
  cam.shake = false;
  cam.smoothTime = t.smooth;
  cam.roomView = true;
  // The room view turns toward the corridor side (−x) whichever end the camera stands at: −turn from yaw 0, +turn
  // from 180. With no turn it keeps the corridor's angle and tilt and only frames the room.
  cam.roomYawDeg = t.yaw + (Math.cos((t.yaw * Math.PI) / 180) >= 0 ? -t.roomTurn : t.roomTurn);
  cam.roomPitchDeg = t.roomTurn === 0 ? t.pitch : 52;
  cam.railX = t.rail;
}

/** The framing part of `ECONOMY.camera` the profile sets: one distance everywhere (the platform aside). */
export interface CameraFraming {
  standZoom: number;
  walkZoom: number;
  platformZoom: number;
  travelZoom: number;
  prologueLean: { x: number; z: number };
}

export function applyFraming(cam: CameraFraming, t: CameraTune = styleTune()): void {
  cam.standZoom = 1;
  cam.walkZoom = 1;
  cam.platformZoom = t.platform;
  cam.travelZoom = 1;
  cam.prologueLean = { x: 0, z: 0 };
}
