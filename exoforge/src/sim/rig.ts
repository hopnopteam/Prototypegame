// The suit's body plan in side view, facing right (+x is the front): one source for the flight colliders,
// the crash ragdoll and the sprite rig, so the switch from flight to ragdoll never jumps.
// Coordinates are metres in the suit's own frame, origin at the boot soles, +y up.

export type PieceId =
  | 'torso'
  | 'upperArmFar'
  | 'forearmFar'
  | 'thighFar'
  | 'bootFar'
  | 'thighNear'
  | 'bootNear'
  | 'upperArmNear'
  | 'forearmNear';

export interface PieceDef {
  id: PieceId;
  /** Capsule (torso with helmet) or box. */
  shape: 'capsule' | 'box';
  /** Centre in the suit frame. */
  cx: number;
  cy: number;
  /** Box half extents; for a capsule, hw is the radius and hh the half height of its straight part. */
  hw: number;
  hh: number;
  /** Share of the suit's mass in the ragdoll. */
  massShare: number;
  /** The piece it hangs from, with the joint point in the suit frame and the bend limits (radians, facing right). */
  parent?: PieceId;
  joint?: { x: number; y: number; min: number; max: number };
  /** Draw order: far limbs behind the torso, near limbs in front. */
  layer: number;
}

export const PIECES: readonly PieceDef[] = [
  { id: 'upperArmFar', shape: 'box', cx: -0.02, cy: 1.42, hw: 0.075, hh: 0.19, massShare: 0.035, parent: 'torso', joint: { x: -0.02, y: 1.61, min: -2.6, max: 2.6 }, layer: 0 },
  { id: 'forearmFar', shape: 'box', cx: 0.0, cy: 1.06, hw: 0.07, hh: 0.17, massShare: 0.03, parent: 'upperArmFar', joint: { x: -0.01, y: 1.23, min: 0, max: 2.4 }, layer: 1 },
  { id: 'thighFar', shape: 'box', cx: -0.07, cy: 0.6, hw: 0.11, hh: 0.21, massShare: 0.09, parent: 'torso', joint: { x: -0.07, y: 0.8, min: -0.5, max: 1.8 }, layer: 2 },
  { id: 'bootFar', shape: 'box', cx: -0.06, cy: 0.2, hw: 0.15, hh: 0.2, massShare: 0.12, parent: 'thighFar', joint: { x: -0.07, y: 0.4, min: -2.0, max: 0.1 }, layer: 3 },
  { id: 'torso', shape: 'capsule', cx: 0, cy: 1.36, hw: 0.33, hh: 0.28, massShare: 0.4, layer: 4 },
  { id: 'thighNear', shape: 'box', cx: 0.08, cy: 0.6, hw: 0.11, hh: 0.21, massShare: 0.09, parent: 'torso', joint: { x: 0.08, y: 0.8, min: -0.5, max: 1.8 }, layer: 5 },
  { id: 'bootNear', shape: 'box', cx: 0.09, cy: 0.2, hw: 0.15, hh: 0.2, massShare: 0.12, parent: 'thighNear', joint: { x: 0.08, y: 0.4, min: -2.0, max: 0.1 }, layer: 6 },
  { id: 'upperArmNear', shape: 'box', cx: 0.06, cy: 1.42, hw: 0.075, hh: 0.19, massShare: 0.035, parent: 'torso', joint: { x: 0.06, y: 1.61, min: -2.6, max: 2.6 }, layer: 7 },
  { id: 'forearmNear', shape: 'box', cx: 0.08, cy: 1.06, hw: 0.07, hh: 0.17, massShare: 0.03, parent: 'upperArmNear', joint: { x: 0.07, y: 1.23, min: 0, max: 2.4 }, layer: 8 },
];

export const PIECE_BY_ID: Readonly<Record<PieceId, PieceDef>> = Object.fromEntries(PIECES.map((p) => [p.id, p])) as Record<PieceId, PieceDef>;

/** The flight body's colliders: the torso capsule and one box per leg (thigh and boot together). */
export const FLIGHT_SHAPES = {
  torso: { cx: 0, cy: 1.36, radius: 0.33, halfHeight: 0.28 },
  legs: [
    { cx: -0.065, cy: 0.4, hw: 0.14, hh: 0.4 },
    { cx: 0.085, cy: 0.4, hw: 0.14, hh: 0.4 },
  ],
} as const;

/** Armor plates that break off in a crash, in the suit frame (facing right). */
export const PLATES: readonly { cx: number; cy: number; hw: number; hh: number }[] = [
  { cx: 0.27, cy: 1.42, hw: 0.07, hh: 0.2 },
  { cx: 0.04, cy: 1.72, hw: 0.17, hh: 0.06 },
  { cx: 0.15, cy: 0.66, hw: 0.06, hh: 0.16 },
];

/** Where the thrust leaves each boot (nozzle centre), in the suit frame. */
export const NOZZLES: readonly { x: number; y: number }[] = [
  { x: -0.06, y: 0.0 },
  { x: 0.09, y: 0.0 },
];

/** The suit's height, soles to the top of the helmet, metres. */
export const SUIT_HEIGHT = FLIGHT_SHAPES.torso.cy + FLIGHT_SHAPES.torso.halfHeight + FLIGHT_SHAPES.torso.radius;
