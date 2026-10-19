// The debug overlay: thrust, velocity, centre of mass and contact normals, plus guide paths, ledges and chunk
// bounds (SPEC A11). Drawn with Graphics: debug only, never final visuals.
import { Graphics } from 'pixi.js';
import type { Run } from '../sim/Run';
import type { Course } from '../sim/Course';
import { toScreenY } from './Stage';

export class DebugDraw {
  readonly vectors = new Graphics();
  readonly guides = new Graphics();
  private guidesFor: Course | null = null;

  drawGuides(course: Course): void {
    if (this.guidesFor === course) return;
    this.guidesFor = course;
    const g = this.guides;
    g.clear();
    for (const chunk of course.chunks) {
      g.rect(chunk.x0, toScreenY(chunk.y0 + chunk.data.height), chunk.data.width, chunk.data.height).stroke({ width: 0.04, color: 0xffffff, alpha: 0.35 });
    }
    course.guide.forEach(([x, y], i) => {
      if (i === 0) g.moveTo(x, toScreenY(y));
      else g.lineTo(x, toScreenY(y));
    });
    g.stroke({ width: 0.06, color: 0x4fd1c5, alpha: 0.8 });
    for (const l of course.ledges) g.moveTo(l.x1, toScreenY(l.y)).lineTo(l.x2, toScreenY(l.y)).stroke({ width: 0.1, color: 0xffb547, alpha: 0.9 });
    g.moveTo(-course.width / 2, toScreenY(course.exitY)).lineTo(course.width / 2, toScreenY(course.exitY)).stroke({ width: 0.08, color: 0x7dff7a });
  }

  drawVectors(run: Run): void {
    const g = this.vectors;
    g.clear();
    if (run.ragdoll) return;
    const v = run.suit.vectors;
    const cx = v.com.x;
    const cy = toScreenY(v.com.y);
    g.moveTo(cx, cy).lineTo(cx + v.thrust.x * 1.2, cy - v.thrust.y * 1.2).stroke({ width: 0.06, color: 0x7dff7a });
    g.moveTo(cx, cy).lineTo(cx + v.velocity.x * 0.25, cy - v.velocity.y * 0.25).stroke({ width: 0.05, color: 0x6cb6f0 });
    g.circle(cx, cy, 0.08).fill(0xffd23a);
    for (const c of v.contacts) {
      const x = c.x;
      const y = toScreenY(c.y);
      g.moveTo(x, y).lineTo(x + c.nx * 0.5, y - c.ny * 0.5).stroke({ width: 0.04, color: 0xff4a6a });
      g.circle(x, y, 0.05).fill(0xff4a6a);
    }
  }
}
