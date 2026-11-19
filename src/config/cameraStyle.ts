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
 * - The train straight up the screen (`yaw` 0), the locomotive at the top, the corridor like MPH's hallway, the lake on
 *   the left and the platform on the right; looking down 58° through a 35° lens, 5.8 m of floor across the screen (session 58d, owner: "zoom in a little more"; 6.6 before), so the train fills the width as MPH's hotel does.
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
 */

declare const __CAMERA_STYLE__: string | undefined;

const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;

export const CAMERA_STYLE: 'default' | 'mph' =
  (typeof __CAMERA_STYLE__ !== 'undefined' && __CAMERA_STYLE__ === 'mph') || fromUrl === 'mph' ? 'mph' : 'default';

/** The tunable numbers of the My Perfect Hotel profile (and the panel's sliders). */
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
}

export const MPH_DEFAULTS: CameraTune = { yaw: 0, pitch: 58, fov: 35, width: 5.8, follow: 5, lead: 0, smooth: 0.08 };

// Session 58c: a new key, so numbers tuned on the first (diagonal) version of the build do not carry over.
const STORE_KEY = 'nightexpress.camtune.v3';

/** The profile's numbers: the defaults, or what was last set on the panel in this browser. */
export function mphTune(): CameraTune {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    if (raw) return { ...MPH_DEFAULTS, ...(JSON.parse(raw) as Partial<CameraTune>) };
  } catch {
    /* no storage: the defaults */
  }
  return { ...MPH_DEFAULTS };
}

export function saveTune(t: CameraTune | null): void {
  try {
    if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing to keep it in */
  }
}

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
}

/** The framing part of `ECONOMY.camera` the profile sets: one distance everywhere. */
export interface CameraFraming {
  standZoom: number;
  walkZoom: number;
  platformZoom: number;
  travelZoom: number;
  prologueLean: { x: number; z: number };
}

export function applyFraming(cam: CameraFraming): void {
  cam.standZoom = 1;
  cam.walkZoom = 1;
  cam.platformZoom = 1;
  cam.travelZoom = 1;
  cam.prologueLean = { x: 0, z: 0 };
}
