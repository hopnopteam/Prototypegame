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

/**
 * Session 58b (owner: "third person camera in the MPH camera… a little zoom out (give camera options)… you now follow the
 * character so we see what character see… how third person camera acts, more responsive"): the build has two modes, the
 * fixed isometric view (`iso`) and a third-person camera (`third`, the default) that sits behind the conductor and swings
 * round to look where they are heading. Each mode keeps its own numbers.
 */
export type CameraMode = 'iso' | 'third';

/** The tunable numbers of a mode (and the panel's sliders). */
export interface CameraTune {
  /** The view's angle to the train (degrees); in third person only where it starts, then it follows the conductor. */
  yaw: number;
  /** How far the camera looks down (degrees below the horizon). */
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Iso: metres of floor across the screen at the hero. */
  width: number;
  /** Third person: metres from the camera to the point it looks at. */
  distance: number;
  /** Follow easing (higher is snappier). */
  follow: number;
  /** Metres the view sits ahead of the hero along the view (they stand a little below the middle). */
  lead: number;
  /** Third person: how quickly the camera swings round behind the conductor as they turn (higher is snappier). */
  turn: number;
  /** Third person: the height (metres) of the point the camera looks at, about the conductor's chest. */
  look: number;
}

export const MPH_DEFAULTS: CameraTune = { yaw: 45, pitch: 50, fov: 30, width: 8.4, distance: 0, follow: 5, lead: 0.7, turn: 0, look: 0 };
export const THIRD_DEFAULTS: CameraTune = { yaw: 45, pitch: 42, fov: 50, width: 8.4, distance: 7.5, follow: 12, lead: 1.4, turn: 4.5, look: 0.9 };
/** The zoom buttons: third-person distances and iso widths. */
export const ZOOM_PRESETS: Record<CameraMode, { label: string; value: number }[]> = {
  third: [{ label: 'Close', value: 5.2 }, { label: 'Mid', value: 7 }, { label: 'Far', value: 9.5 }],
  iso: [{ label: 'Close', value: 6.5 }, { label: 'Mid', value: 8.4 }, { label: 'Far', value: 11 }],
};

const STORE_KEY = 'nightexpress.camtune';

export function defaultsFor(mode: CameraMode): CameraTune {
  return { ...(mode === 'third' ? THIRD_DEFAULTS : MPH_DEFAULTS) };
}

/** The mode last chosen on the panel in this browser (third person by default). */
export function cameraMode(): CameraMode {
  try {
    return localStorage.getItem(`${STORE_KEY}.mode`) === 'iso' ? 'iso' : 'third';
  } catch {
    return 'third';
  }
}

export function saveMode(mode: CameraMode): void {
  try {
    localStorage.setItem(`${STORE_KEY}.mode`, mode);
  } catch {
    /* nothing to keep it in */
  }
}

/** A mode's numbers: its defaults, or what was last set on the panel in this browser. */
export function mphTune(mode: CameraMode = cameraMode()): CameraTune {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`${STORE_KEY}.${mode}`) : null;
    if (raw) return { ...defaultsFor(mode), ...(JSON.parse(raw) as Partial<CameraTune>) };
  } catch {
    /* no storage: the defaults */
  }
  return defaultsFor(mode);
}

export function saveTune(mode: CameraMode, t: CameraTune | null): void {
  try {
    if (t) localStorage.setItem(`${STORE_KEY}.${mode}`, JSON.stringify(t));
    else localStorage.removeItem(`${STORE_KEY}.${mode}`);
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
  thirdPerson: boolean;
  distance: number;
  turnSharpness: number;
  lookHeight: number;
}

/** Puts a mode's numbers into `VISUALS.camera` (at load, and live from the panel). */
export function applyTune(cam: CameraVisuals, t: CameraTune, mode: CameraMode = cameraMode()): void {
  cam.trainYawDeg = t.yaw;
  cam.pitchDeg = t.pitch;
  cam.fovDeg = t.fov;
  cam.minVisibleWidth = t.width;
  cam.followSharpness = t.follow;
  cam.viewLead = t.lead;
  cam.axisSnapDeg = 0;
  cam.fixedZoom = true;
  cam.shake = false;
  cam.thirdPerson = mode === 'third';
  cam.distance = t.distance;
  cam.turnSharpness = t.turn;
  cam.lookHeight = mode === 'third' ? t.look : 0;
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
