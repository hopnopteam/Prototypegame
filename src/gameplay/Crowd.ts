import type { Vec2 } from '../core/types';
import type { GuestState } from './Guests';
import type { World } from './World';

interface Body {
  pos: Vec2;
  /** 0 = holds its ground (staff at a job); higher steps aside more readily. */
  give: number;
  /** Standing guests step aside when bumped, then drift back to where they were waiting. */
  standing: boolean;
}

/** Guest states where the guest is standing somewhere on the train floor (not in bed, not on the platform). */
const FLOOR_STATES: ReadonlySet<GuestState> = new Set<GuestState>(['boarding', 'queue', 'toCabin', 'settling', 'requesting', 'toBathroom', 'waitingBathroom', 'returning', 'alighting', 'toVenue', 'venueQueue']);
const PLATFORM_STATES: ReadonlySet<GuestState> = new Set<GuestState>(['platform', 'leaving']);
const WALKING_STATES: ReadonlySet<GuestState> = new Set<GuestState>(['boarding', 'toCabin', 'toBathroom', 'returning', 'alighting', 'toVenue']);

const MIN_GAP = 0.5;
const STANDING_GIVE = 0.5;
const RETURN_SPEED = 1.2;
/** Rotates each push a little so two people meeting head-on in a corridor both keep right. */
const KEEP_RIGHT = 0.5;
/**
 * Session 23 (owner: "NPCs push the player and it breaks the flow"): the conductor is never pushed by anyone on
 * the move; walkers step round them. Only against someone holding their ground (staff at a job) do both give a
 * little, so nobody ends up inside anyone.
 */
const PLAYER_GIVE = 0;
const PLAYER_GIVE_AGAINST_STILL = 0.35;

/**
 * Personal space: after everyone has moved, people closer than a shoulder-width are eased apart, so guests,
 * staff and the conductor never walk through each other. Whoever is busy holds their spot; walkers step
 * aside. Pushes go through the walkable map, so nobody is ever pushed into a wall.
 */
export class Crowd {
  private readonly bodies: Body[] = [];
  /** Where each standing guest was waiting before anyone nudged them (keyed by their position object). */
  private readonly anchors = new Map<Vec2, Vec2>();
  private readonly seen = new Set<Vec2>();

  constructor(private readonly w: World) {}

  update(dt: number): void {
    if (dt <= 0) return;
    const w = this.w;
    const bodies = this.bodies;
    bodies.length = 0;
    bodies.push({ pos: w.player.pos, give: PLAYER_GIVE, standing: false });
    // Staff at work hold their spot; staff waiting between jobs step aside like anyone standing about.
    for (const m of w.staff.members) bodies.push({ pos: m.pos, give: m.mover.isMoving ? 1 : m.isIdle ? STANDING_GIVE : 0, standing: false });
    const walk = w.map.walk;
    this.seen.clear();
    // On the platform too while the train is in (its coordinates are the world's then): the ticket queue, the
    // bench, those walking to the door or off to the station house.
    const platformIn = w.journey.phase === 'stationStop';
    for (const g of w.guests.list) {
      if (g.onPlatform ? !platformIn || !PLATFORM_STATES.has(g.state) : !FLOOR_STATES.has(g.state)) continue;
      const walking = (WALKING_STATES.has(g.state) || g.onPlatform) && g.mover.isMoving;
      const standing = !walking && !g.mover.isMoving;
      bodies.push({ pos: g.pos, give: walking ? 1 : STANDING_GIVE, standing });
      if (!standing) continue;
      this.seen.add(g.pos);
      const anchor = this.anchors.get(g.pos);
      if (!anchor) {
        this.anchors.set(g.pos, { x: g.pos.x, z: g.pos.z });
      } else {
        const dx = anchor.x - g.pos.x;
        const dz = anchor.z - g.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          const step = Math.min(d, RETURN_SPEED * dt);
          walk.move(g.pos, (dx / d) * step, (dz / d) * step);
        }
      }
    }
    for (const key of this.anchors.keys()) if (!this.seen.has(key)) this.anchors.delete(key);

    const maxStep = 2.5 * dt;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        let ga = a.give;
        let gb = b.give;
        if (i === 0 && gb === 0) ga = PLAYER_GIVE_AGAINST_STILL;
        const total = ga + gb;
        if (total <= 0) continue;
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= MIN_GAP * MIN_GAP) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Exactly on top of each other: pick a stable direction.
          dx = 1;
          dz = 0;
          d = 1;
        }
        const overlap = Math.min(MIN_GAP - Math.min(d, MIN_GAP), maxStep);
        const nx = dx / d;
        const nz = dz / d;
        const px = nx - nz * KEEP_RIGHT;
        const pz = nz + nx * KEEP_RIGHT;
        const pl = Math.hypot(px, pz);
        const ux = (px / pl) * overlap;
        const uz = (pz / pl) * overlap;
        if (ga > 0) walk.move(a.pos, -ux * (ga / total), -uz * (ga / total));
        if (gb > 0) walk.move(b.pos, ux * (gb / total), uz * (gb / total));
      }
    }
  }
}
