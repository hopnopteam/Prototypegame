import { rect, rectContains, type Rect, type Vec2 } from '../core/types';
import type { CarriageLayout } from '../world/layout';

export interface PlacedLayout {
  layout: CarriageLayout;
  originZ: number;
}

export interface WalkableOptions {
  doorsOpen: boolean;
  platform: Rect | null;
  rearDeck: Rect | null;
}

const STEP = 0.08;

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

    for (const { layout, originZ } of carriages) {
      for (const room of layout.rooms) {
        areas.push(rect(room.x0 + r, room.z0 + r + originZ, room.x1 - r, room.z1 - r + originZ));
      }
      for (const connector of layout.connectors) {
        if (connector.door && !options.doorsOpen) continue;
        const c = connector.rect;
        areas.push(
          connector.axis === 'x'
            ? rect(c.x0, c.z0 + r + originZ, c.x1, c.z1 - r + originZ)
            : rect(c.x0 + r, c.z0 + originZ, c.x1 - r, c.z1 + originZ),
        );
      }
      for (const b of layout.blocked) {
        blocked.push(rect(b.x0 - r, b.z0 - r + originZ, b.x1 + r, b.z1 + r + originZ));
      }
    }

    for (const extra of [options.platform, options.rearDeck]) {
      if (extra) areas.push(rect(extra.x0 + r, extra.z0 + r, extra.x1 - r, extra.z1 - r));
    }

    this.areas = areas.filter((a) => a.x1 > a.x0 && a.z1 > a.z0);
    this.blocked = blocked;
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
  move(pos: Vec2, dx: number, dz: number, assist = 0): void {
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / STEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      const nx = pos.x + sx;
      const nz = pos.z + sz;
      if (this.isWalkable(nx, nz)) {
        pos.x = nx;
        pos.z = nz;
      } else if (sx !== 0 && this.isWalkable(nx, pos.z)) {
        pos.x = nx;
      } else if (sz !== 0 && this.isWalkable(pos.x, nz)) {
        pos.z = nz;
      } else if (!(assist > 0 && this.funnel(pos, sx, sz, assist))) {
        break;
      }
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

  /** Closest walkable point, used to rescue anything left standing where a door just closed. */
  nearestWalkable(x: number, z: number): Vec2 {
    if (this.isWalkable(x, z)) return { x, z };
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
