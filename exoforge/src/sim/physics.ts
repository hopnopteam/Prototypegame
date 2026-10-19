// The physics engine: Rapier 2D, deterministic build (the same inputs give the same run on every device).
import RAPIER from '@dimforge/rapier2d-deterministic-compat';

export { RAPIER };
export type { World, RigidBody, Collider, ImpulseJoint } from '@dimforge/rapier2d-deterministic-compat';

let ready: Promise<void> | null = null;

/** Loads the engine once; every other sim call waits for this. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

/** Collision layers: who touches whom. */
export const LAYER = {
  terrain: 0x0001,
  suit: 0x0002,
  ragdoll: 0x0004,
  plate: 0x0008,
} as const;

/** Rapier's packed interaction groups: membership in the high 16 bits, filter in the low 16. */
export function groups(member: number, filter: number): number {
  return (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

export const NO_COLLISION = groups(0, 0);
