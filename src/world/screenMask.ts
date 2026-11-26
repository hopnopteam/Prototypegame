/**
 * Fix list 6.3 (owner: "UI elements overlap the floor mat when something is upgraded… make sure popups, labels and
 * floor zones never overlap"): the world's floating labels (tile markers, a pad's floating icon, class chips, guest
 * bubbles) step aside where they would crowd the screen.
 *
 * - Under a pop-up or label (the centre card, the station result, the news strip, a toast, the coach line, a tile's
 *   close-up label): the game installs `underPopup`, which projects a world point to the screen and tests it against
 *   the boxes the UI measured.
 * - Beside a tile's marker: a pad's floating icon gives way to a marker standing right next to it (the pad's own
 *   printed icon still says what it is). Markers are noted each frame and read back the next.
 */
let popupTest: ((x: number, y: number, z: number) => boolean) | null = null;
let edgeTest: ((x: number, y: number, z: number, halfWidth: number) => boolean) | null = null;
let markers: number[] = [];
let noted: number[] = [];

/** Installed by the game once the camera and the UI exist. */
export function setPopupTest(test: ((x: number, y: number, z: number) => boolean) | null): void {
  popupTest = test;
}

/** Installed by the game: whether a label this wide (metres either side) at this point would cross the screen's edge. */
export function setEdgeTest(test: ((x: number, y: number, z: number, halfWidth: number) => boolean) | null): void {
  edgeTest = test;
}

/**
 * De-Slop B3 ("nothing cut off at the edge"): true when a floating label centred on this world point, `halfWidth`
 * metres either side, would run past the screen's safe frame. Such a label hides until it is whole on screen.
 */
export function offFrame(x: number, y: number, z: number, halfWidth: number): boolean {
  return edgeTest ? edgeTest(x, y, z, halfWidth) : false;
}

/** True when this world point is under a pop-up or label on screen. */
export function underPopup(x: number, y: number, z: number): boolean {
  return popupTest ? popupTest(x, y, z) : false;
}

/** Called once a frame: the markers noted this frame become the ones pads check against. */
export function beginMaskFrame(): void {
  const swap = markers;
  markers = noted;
  noted = swap;
  noted.length = 0;
}

/** A tile marker showing over this floor spot this frame. */
export function noteMarker(x: number, z: number): void {
  noted.push(x, z);
}

/** Whether a tile marker stood within `reach` metres of this floor spot last frame. */
export function nearMarker(x: number, z: number, reach: number): boolean {
  const r2 = reach * reach;
  for (let i = 0; i < markers.length; i += 2) {
    const dx = markers[i] - x;
    const dz = markers[i + 1] - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}
