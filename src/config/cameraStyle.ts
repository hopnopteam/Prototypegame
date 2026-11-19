/**
 * Session 58, the My Perfect Hotel camera experiment (owner: "I want to COMPLETELY… replicate the full style of camera
 * style and placement, movement and literally everything in terms of camera of My Perfect Hotel. Make a separate build
 * for that."). On in a build made with CAMERA_STYLE=mph (`OUT=mph.html`) or with `?cam=mph` in the address; the normal
 * build is untouched.
 *
 * What My Perfect Hotel's camera does, and what this profile sets:
 * - One fixed angle for the whole game: an isometric-style three-quarter view, the building turned 45° to the screen,
 *   looking down about 50° through a narrow lens, so it reads almost like an orthographic diorama.
 * - One fixed distance: no zoom in while walking, none on entering a room or the platform, no zoom kick on a purchase.
 * - A plain, slightly lagging follow (a smooth-damp on both axes), the hero a little below the middle of the screen so
 *   more of what is ahead shows, no lead in the direction of travel.
 * - Free, analogue walking (no snapping onto the building's axes).
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
  /** Follow easing (higher is snappier). */
  follow: number;
  /** Metres the view sits ahead of the hero along the view, so they stand a little below the middle. */
  lead: number;
}

export const MPH_DEFAULTS: CameraTune = { yaw: 45, pitch: 50, fov: 30, width: 8.4, follow: 5, lead: 0.7 };

const STORE_KEY = 'nightexpress.camtune';

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
