import { rect, type Rect, type Vec2 } from '../core/types';
import { DOOR_Z0, DOOR_Z1, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';

/**
 * Where everything stands on a station platform (session 23, owner: "when you collect tickets NPCs push the
 * player… the baggage area should be far more realistic"). Platform-local coordinates, which equal world
 * coordinates while the train is stopped. The lobby's door is at z 0.8–2.2; the camera looks from the platform
 * side and the rear (+x, +z), so what stands further out and further back is nearer the camera.
 *
 * The platform runs in lanes out from the train: the edge lane (the queue, the door, the luggage barrow), the
 * ticket counter, the server's lane, a walkway to the station entrance, and the benches by the back railing.
 * Ahead of the door (−z) is the ticket stand: whoever sells tickets serves from its outer side (nearest the
 * camera, never hidden), travellers queue on its train side in a line running forward along the edge, and a paid
 * traveller walks straight back along the edge to the door. Behind the door (+z) is the luggage barrow, its pad
 * on the outer side, where no traveller walks. Nobody's path crosses the server's spot or the barrow's pad.
 */
const X = PLATFORM_X0;
const DOOR_Z = (DOOR_Z0 + DOOR_Z1) / 2;

export const PLATFORM = {
  /** The ticket stand's counter: a low desk running along the platform. */
  counter: rect(X + 2.2, -2.7, X + 2.75, -1.1),
  /** Where whoever sells tickets stands: behind the counter, on its outer side. */
  serve: { x: X + 3.4, z: -1.9 } as Vec2,
  /** The front of the queue: at the counter's window, on its train side. */
  window: { x: X + 1.55, z: -1.9 } as Vec2,
  /** Where the fares paid at the stand stack up (a step from the server, toward the door). */
  till: { x: X + 3.6, z: -0.25 } as Vec2,
  /** Paid travellers walk back to the door along the platform edge through this point. */
  toDoor: { x: X + 1.2, z: -0.25 } as Vec2,
  /** Where paid travellers wait while the opening's carriage is still covered (by the door). */
  doorWait: [{ x: X + 1.35, z: 0.15 }, { x: X + 1.95, z: -0.3 }, { x: X + 2.0, z: 0.45 }] as Vec2[],
  /** The luggage barrow: a railway porter's trolley alongside the train, behind the door. */
  barrow: rect(X + 0.6, 3.05, X + 1.38, 4.85),
  /** Where bags are taken from the barrow (its outer side). */
  luggagePad: { x: X + 2.05, z: 3.95 } as Vec2,
  /** The walkway between the door area and the station entrance, outside the server's lane. */
  concourse: [{ x: X + 2.6, z: 0.95 }, { x: X + 4.45, z: -0.4 }, { x: X + 4.55, z: -9.5 }] as Vec2[],
  /** The way onto the platform from the station: an opening in the back railing. */
  entrance: { x: X + 6.2, z: -12.4 } as Vec2,
  /** The station house's doors, just beyond it: latecomers come out of them and those getting off go in. */
  houseDoor: { x: X + 7.95, z: -13.2 } as Vec2,
  /** A bench by the back railing where travellers with no bed this time sit and wait. */
  bench: rect(X + 6.0, -4.6, X + 6.4, -2.4),
  /** The newsstand, against the back railing ahead of the bench. */
  kiosk: { x: X + 5.85, z: -7.2 } as Vec2,
  /** The station master by the front of the train, flag in hand. */
  master: { x: X + 0.95, z: -8.6 } as Vec2,
  /** The station's name board, over the way in from the station. */
  sign: { x: X + 4.6, z: -11.0 } as Vec2,
  /** The opening's Open carriage tile: on the platform beside the covered carriage's door, clear of everyone. */
  openTile: { x: X + 2.55, z: 1.75 } as Vec2,
} as const;

/** Spots in the ticket queue: the window first, then forward along the platform edge, then back beside it. */
export function queueSpot(i: number): Vec2 {
  const w = PLATFORM.window;
  if (i < 5) return { x: w.x, z: w.z - i * 0.78 };
  const k = Math.min(i - 5, 2);
  // A second row turns back beside the first, toward the stand (ending ahead of the counter's front end).
  return { x: w.x + 0.72, z: w.z - 4 * 0.78 + k * 0.62 };
}

/** How many travellers the queue holds; any more wait by the bench. */
export const QUEUE_SPOTS = 8;

/** Spots for travellers with no bed this time: in front of and beside the bench by the back railing. */
export function waitingSpot(i: number): Vec2 {
  const b = PLATFORM.bench;
  const spots: Vec2[] = [
    { x: b.x0 - 0.45, z: -2.75 },
    { x: b.x0 - 0.5, z: -3.55 },
    { x: b.x0 - 0.42, z: -4.3 },
    { x: b.x0 - 1.05, z: -3.1 },
    { x: b.x0 - 1.0, z: -3.95 },
    { x: b.x0 - 0.4, z: -5.05 },
  ];
  return spots[i % spots.length];
}

/** What the conductor cannot walk through on the platform (the stand, the barrow, the bench, the newsstand). */
export function platformObstacles(): Rect[] {
  const k = PLATFORM.kiosk;
  return [
    PLATFORM.counter,
    PLATFORM.barrow,
    PLATFORM.bench,
    rect(k.x - 0.55, k.z - 0.6, k.x + 0.55, k.z + 0.6),
  ];
}

/** The platform's far edge (the back railing). */
export const PLATFORM_X1 = X + PLATFORM_WIDTH;
export { DOOR_Z };
