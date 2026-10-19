// A fixed pool of particle sprites (SPEC A3: pool spawned objects). Coordinates are world metres, y up.
import { Container, Sprite } from 'pixi.js';
import { texture, entry } from './assets';
import { PARTICLES } from './config';
import { toScreenY } from './Stage';

export interface ParticleSpec {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life: number;
  size?: number;
  sizeEnd?: number;
  alpha?: number;
  alphaEnd?: number;
  /** Metres per second² downward. */
  gravity?: number;
  /** Fraction of speed kept per second. */
  drag?: number;
  rotation?: number;
  spin?: number;
  /** Turn to face the direction of travel (sparks). */
  align?: boolean;
  tint?: number;
  additive?: boolean;
}

interface Live extends Required<Omit<ParticleSpec, 'id' | 'tint' | 'additive'>> {
  sprite: Sprite;
  age: number;
  baseW: number;
  baseH: number;
}

export class Particles {
  private readonly free: Sprite[] = [];
  private readonly live: Live[] = [];

  constructor(private readonly normal: Container, private readonly additive: Container) {
    for (let i = 0; i < PARTICLES.max; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.free.push(s);
    }
  }

  get count(): number {
    return this.live.length;
  }

  emit(spec: ParticleSpec): void {
    const sprite = this.free.pop() ?? this.recycle();
    if (!sprite) return;
    const e = entry(spec.id);
    const [w, h] = e.worldSizeM ?? [0.5, 0.5];
    sprite.texture = texture(spec.id);
    sprite.anchor.set(e.pivot[0], e.pivot[1]);
    sprite.tint = spec.tint ?? 0xffffff;
    sprite.visible = true;
    (spec.additive ? this.additive : this.normal).addChild(sprite);
    this.live.push({
      sprite,
      x: spec.x,
      y: spec.y,
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      life: spec.life,
      size: spec.size ?? 1,
      sizeEnd: spec.sizeEnd ?? spec.size ?? 1,
      alpha: spec.alpha ?? 1,
      alphaEnd: spec.alphaEnd ?? 0,
      gravity: spec.gravity ?? 0,
      drag: spec.drag ?? 1,
      rotation: spec.rotation ?? 0,
      spin: spec.spin ?? 0,
      align: spec.align ?? false,
      age: 0,
      baseW: w,
      baseH: h,
    });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.release(i);
        continue;
      }
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy = p.vy * keep - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      const t = p.age / p.life;
      const size = p.size + (p.sizeEnd - p.size) * t;
      const s = p.sprite;
      s.position.set(p.x, toScreenY(p.y));
      s.width = p.baseW * size;
      s.height = p.baseH * size;
      s.alpha = p.alpha + (p.alphaEnd - p.alpha) * t;
      s.rotation = p.align ? Math.atan2(-p.vy, p.vx) : p.rotation;
    }
  }

  clear(): void {
    while (this.live.length) this.release(this.live.length - 1);
  }

  private release(i: number): void {
    const p = this.live[i];
    p.sprite.visible = false;
    p.sprite.removeFromParent();
    this.free.push(p.sprite);
    this.live[i] = this.live[this.live.length - 1];
    this.live.pop();
  }

  /** When the pool is full, the oldest particle makes room. */
  private recycle(): Sprite | null {
    if (this.live.length === 0) return null;
    let oldest = 0;
    for (let i = 1; i < this.live.length; i++) if (this.live[i].age / this.live[i].life > this.live[oldest].age / this.live[oldest].life) oldest = i;
    this.release(oldest);
    return this.free.pop() ?? null;
  }
}
