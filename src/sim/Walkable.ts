import { rect, rectContains, type Rect, type Vec2 } from '../core/types';
import type { CarriageLayout } from '../world/layout';

export interface PlacedLayout {
  layout: CarriageLayout;
  originZ: number;
  /** Props not there yet (a venue's tables and extras still to buy, by prop index): they do not block. */
  closed?: ReadonlySet<number>;
  /** Rooms still locked (`cabin:2`, `bath:1`, session 22): their doorways are shut. */
  locked?: ReadonlySet<string>;
}

export interface WalkableOptions {
  doorsOpen: boolean;
  /** Session 22: the opening's covered carriage keeps its platform doors shut (the platform stays walkable). */
  doorsSealed?: boolean;
  platform: Rect | null;
  /** Session 23: what stands on the platform (the ticket stand, the luggage barrow, a bench): nobody walks through. */
  platformBlocked?: readonly Rect[];
  rearDeck: Rect | null;
}

const STEP = 0.08;
/** Sampling step along a reach line (metres): finer than any wall's gap (two character radii and the wall). */
const LINE_STEP = 0.1;
/** Session 40: the rescue's search outward from where someone stands (metres between rings, and how far it looks). */
const RESCUE_STEP = 0.12;
const RESCUE_RADIUS = 2.4;
/** A push whose sideways part is under this share of the step counts as head-on (within about 20°). */
const HEAD_ON = 0.35;

/**
 * Where a character's centre may stand: a union of rectangles already shrunk by the character radius,
 * minus furniture grown by it. Walls fall out of the gaps between rectangles, and doorways are
 * rectangles that overlap both rooms. Cheap, predictable, and easy to unit test.
 */
export class Walkable {
  private areas: Rect[] = [];
  private blocked: Rect[] = [];

  constructor(private readonly radius: number) {}

  rebuild(carriages: PlacedLayout[], options: WalkableOptions): void {
    const r = this.radius;
    const areas: Rect[] = [];
    const blocked: Rect[] = [];

    for (const { layout, originZ, closed, locked } of carriages) {
      const skip = closed && closed.size > 0 ? new Set([...closed].map((i) => layout.props[i]?.rect)) : null;
      for (const room of layout.rooms) {
        areas.push(rect(room.x0 + r, room.z0 + r + originZ, room.x1 - r, room.z1 - r + originZ));
      }
      for (const connector of layout.connectors) {
        if (connector.door && (!options.doorsOpen || options.doorsSealed)) continue;
        // A locked room's doorway is shut (session 22): nobody walks in until it is bought.
        if (connector.room && locked?.has(connector.room)) continue;
        const c = connector.rect;
        areas.push(
          connector.axis === 'x'
            ? rect(c.x0, c.z0 + r + originZ, c.x1, c.z1 - r + originZ)
            : rect(c.x0 + r, c.z0 + originZ, c.x1 - r, c.z1 + originZ),
        );
      }
      for (const b of layout.blocked) {
        if (skip?.has(b)) continue;
        blocked.push(rect(b.x0 - r, b.z0 - r + originZ, b.x1 + r, b.z1 + r + originZ));
      }
    }

    for (const extra of [options.platform, options.rearDeck]) {
      if (extra) areas.push(rect(extra.x0 + r, extra.z0 + r, extra.x1 - r, extra.z1 - r));
    }
    if (options.platform) for (const b of options.platformBlocked ?? []) blocked.push(rect(b.x0 - r, b.z0 - r, b.x1 + r, b.z1 + r));

    this.areas = areas.filter((a) => a.x1 > a.x0 && a.z1 > a.z0);
    this.blocked = blocked;
  }

  /**
   * Whether a straight line stays on the floor of the train's rooms and doorways (furniture ignored, walls not): a pad
   * reaches you only if nothing but low furniture stands between you (session 26; a wall never lets one through).
   */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / LINE_STEP));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      let inside = false;
      for (let k = 0; k < this.areas.length; k++) {
        if (rectContains(this.areas[k], x, z)) {
          inside = true;
          break;
        }
      }
      if (!inside) return false;
    }
    return true;
  }

  isWalkable(x: number, z: number): boolean {
    let inside = false;
    for (let i = 0; i < this.areas.length; i++) {
      if (rectContains(this.areas[i], x, z)) {
        inside = true;
        break;
      }
    }
    if (!inside) return false;
    for (let i = 0; i < this.blocked.length; i++) {
      if (rectContains(this.blocked[i], x, z)) return false;
    }
    return true;
  }

  /**
   * Moves `pos` by (dx, dz), sliding along walls. Sub-steps so fast movers never skip a thin wall. With
   * `assist` (metres), walking into a wall close beside an opening slides you into the opening.
   */
  /**
   * Moves by (dx, dz), sliding along walls. `assist` funnels a head-on push into a nearby opening; `glide`
   * (> 1) keeps pace while sliding: the slid component is scaled up by it, never past the full step.
   */
  move(pos: Vec2, dx: number, dz: number, assist = 0, glide = 1): void {
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / STEP));
    const sx = dx / steps;
    const sz = dz / steps;
    const step = length / steps;
    // A push that is mostly head-on into a wall (its sideways part under HEAD_ON of the step) tries the
    // doorway funnel first. Before session 15 a push straight at the wall beside a doorway "slid" by a
    // floating-point crumb (cos 90° is 6e-17, not 0) and the funnel never got its turn: you stayed pinned.
    const headOn = assist > 0 && Math.min(Math.abs(sx), Math.abs(sz)) < HEAD_ON * step;
    for (let i = 0; i < steps; i++) {
      const nx = pos.x + sx;
      const nz = pos.z + sz;
      if (this.isWalkable(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
        continue;
      }
      if (headOn && this.funnel(pos, sx, sz, assist)) continue;
      const gx = pos.x + Math.sign(sx) * Math.min(step, Math.abs(sx) * glide);
      const gz = pos.z + Math.sign(sz) * Math.min(step, Math.abs(sz) * glide);
      // Slide along whichever wall lets the push through, the larger component first.
      const xFirst = Math.abs(sx) >= Math.abs(sz);
      if (xFirst && sx !== 0 && this.isWalkable(gx, pos.z)) pos.x = gx;
      else if (sz !== 0 && this.isWalkable(pos.x, gz)) pos.z = gz;
      else if (!xFirst && sx !== 0 && this.isWalkable(gx, pos.z)) pos.x = gx;
      else if (sx !== 0 && this.isWalkable(nx, pos.z)) pos.x = nx;
      else if (sz !== 0 && this.isWalkable(pos.x, nz)) pos.z = nz;
      else if (headOn || !(assist > 0 && this.funnel(pos, sx, sz, assist))) break;
    }
  }

  /**
   * Blocked head-on: look sideways (up to `reach`) for a spot from which the same step would go through,
   * and slide one step toward the nearer one. This is what makes a doorway easy to hit with a thumb.
   */
  private funnel(pos: Vec2, sx: number, sz: number, reach: number): boolean {
    const step = Math.hypot(sx, sz);
    if (step < 1e-5) return false;
    // Perpendicular to the direction of travel.
    const px = -sz / step;
    const pz = sx / step;
    for (let o = STEP * 0.75; o <= reach + 1e-6; o += STEP * 0.75) {
      for (const side of [1, -1]) {
        const ox = pos.x + px * o * side;
        const oz = pos.z + pz * o * side;
        if (!this.isWalkable(ox, oz) || !this.isWalkable(ox + sx * 2, oz + sz * 2)) continue;
        const slide = Math.min(step, o);
        const nx = pos.x + px * slide * side;
        const nz = pos.z + pz * slide * side;
        if (!this.isWalkable(nx, nz)) continue;
        pos.x = nx;
        pos.z = nz;
        return true;
      }
    }
    return false;
  }

  /**
   * Closest walkable point, used to rescue anything left standing where a door just closed or something bought just
   * appeared (a table under the conductor's feet). Session 40 (owner: "placing a table… teleports the player to an
   * already placed upgrade"): it searches outward from where they stand first, never through a wall, so they step
   * aside next to the new thing; only if nothing is near does it fall back to the nearest floor anywhere.
   */
  nearestWalkable(x: number, z: number): Vec2 {
    if (this.isWalkable(x, z)) return { x, z };
    for (let r = RESCUE_STEP; r <= RESCUE_RADIUS; r += RESCUE_STEP) {
      const n = Math.max(8, Math.ceil((Math.PI * 2 * r) / RESCUE_STEP));
      let found: Vec2 | null = null;
      let foundD = Infinity;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (!this.isWalkable(cx, cz) || !this.lineClear(x, z, cx, cz)) continue;
        // On a ring every point is as near: prefer the one toward the room's open middle (the corridor side, x 0).
        const d = Math.abs(cx);
        if (d < foundD) {
          foundD = d;
          found = { x: cx, z: cz };
        }
      }
      if (found) return found;
    }
    let best: Vec2 = { x, z };
    let bestD = Infinity;
    const inset = 0.01;
    for (const a of this.areas) {
      const cx = Math.min(Math.max(x, a.x0 + inset), a.x1 - inset);
      const cz = Math.min(Math.max(z, a.z0 + inset), a.z1 - inset);
      if (!this.isWalkable(cx, cz)) continue;
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: cx, z: cz };
      }
    }
    return best;
  }

  get areaCount(): number {
    return this.areas.length;
  }
}
