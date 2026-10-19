// The helper drone on screen: zips in to patch a plate on a rest, and hauls the suit off on a tow cable.
// It speaks only through motion and its lens (SPEC B14.1). Placeholder art until Milestone 2.
import { Container, Sprite } from 'pixi.js';
import type { Run } from '../sim/Run';
import { springStep } from './CameraRig';
import { sizedSprite } from './SuitView';
import { texture } from './assets';
import { toScreenY } from './Stage';

type Mode = 'away' | 'patch' | 'leave' | 'tow';

export class DroneView {
  readonly root = new Container();
  private readonly body: Sprite;
  private readonly cable: Sprite;
  private mode: Mode = 'away';
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private time = 0;
  private spin = 0;
  private leaveTo = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };

  constructor() {
    this.cable = new Sprite(texture('drone.cable'));
    this.cable.anchor.set(0, 0.5);
    this.cable.visible = false;
    this.body = sizedSprite('drone.w1.base');
    this.root.addChild(this.cable, this.body);
    this.root.visible = false;
  }

  reset(): void {
    this.mode = 'away';
    this.root.visible = false;
    this.cable.visible = false;
  }

  /** Flies in from the side to hover over the suit while it patches a plate. */
  comeToPatch(from: { x: number; y: number }, at: { x: number; y: number }): void {
    if (this.mode !== 'patch') {
      this.x = from.x;
      this.y = from.y;
      this.vx = this.vy = 0;
    }
    this.mode = 'patch';
    this.target = at;
    this.root.visible = true;
  }

  /** A happy little loop after a patch (SPEC A8 build moment uses the same). */
  celebrate(): void {
    this.spin = Math.PI * 2;
  }

  leave(to: { x: number; y: number }): void {
    if (this.mode === 'away' || this.mode === 'tow') return;
    this.mode = 'leave';
    this.leaveTo = to;
  }

  /** Keeps the patch hover beside the suit as it settles. */
  follow(at: { x: number; y: number }): void {
    if (this.mode === 'patch') this.target = at;
  }

  update(run: Run | null, hook: { x: number; y: number } | null, dt: number): void {
    this.time += dt;
    const tow = run?.tow ?? null;
    if (tow) {
      this.mode = 'tow';
      this.root.visible = true;
      this.x = tow.drone.x;
      this.y = tow.drone.y;
    } else if (this.mode === 'patch' || this.mode === 'leave') {
      const t = this.mode === 'patch' ? this.target : this.leaveTo;
      [this.x, this.vx] = springStep(this.x, this.vx, t.x, 7, dt);
      [this.y, this.vy] = springStep(this.y, this.vy, t.y, 7, dt);
      if (this.mode === 'leave' && Math.hypot(this.x - t.x, this.y - t.y) < 0.4) this.reset();
    }
    if (!this.root.visible) return;
    const bob = Math.sin(this.time * 6) * 0.06;
    this.body.position.set(this.x, toScreenY(this.y + bob));
    if (this.spin > 0) {
      const step = Math.min(this.spin, dt * 14);
      this.spin -= step;
      this.body.rotation += step;
    } else {
      this.body.rotation = Math.sin(this.time * 3) * 0.08 - (this.vx * 0.03);
    }
    const attached = tow?.attached === true && hook !== null;
    this.cable.visible = attached;
    if (attached && hook) {
      const sx = this.x;
      const sy = this.y - 0.2 + bob;
      const dx = hook.x - sx;
      const dy = hook.y - sy;
      this.cable.position.set(sx, toScreenY(sy));
      this.cable.rotation = Math.atan2(-dy, dx);
      this.cable.width = Math.hypot(dx, dy);
      this.cable.height = 0.07;
    }
  }
}
