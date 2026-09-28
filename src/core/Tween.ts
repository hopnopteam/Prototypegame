import { type Ease, easeOutCubic } from './math';

interface TweenEntry {
  elapsed: number;
  delay: number;
  duration: number;
  ease: Ease;
  update: (t: number) => void;
  complete?: () => void;
  owner?: object;
  active: boolean;
}

export interface TweenOptions {
  ease?: Ease;
  delay?: number;
  complete?: () => void;
  owner?: object;
}

/**
 * Minimal tween engine: juice (pops, arcs, bounces) is mandatory, and this keeps it dependency-free.
 * Tweens are created by events, not every frame, so the small per-tween allocation is fine.
 */
export class Tweens {
  private items: TweenEntry[] = [];

  /** Runs `update(easedT)` from 0 to 1 over `duration` seconds of game time. */
  run(duration: number, update: (t: number) => void, options: TweenOptions = {}): void {
    this.items.push({
      elapsed: 0,
      delay: options.delay ?? 0,
      duration: Math.max(0.0001, duration),
      ease: options.ease ?? easeOutCubic,
      update,
      complete: options.complete,
      owner: options.owner,
      active: true,
    });
  }

  /** Calls `fn` after `delay` seconds of game time. */
  delay(delay: number, fn: () => void, owner?: object): void {
    this.run(0.0001, noop, { delay, complete: fn, owner });
  }

  /** Cancels every tween started with this owner (e.g. an object that got recycled). */
  kill(owner: object): void {
    for (const item of this.items) {
      if (item.owner === owner) item.active = false;
    }
  }

  update(dt: number): void {
    const items = this.items;
    const count = items.length;
    let write = 0;
    for (let i = 0; i < count; i++) {
      const item = items[i];
      if (!item.active) continue;
      if (item.delay > 0) {
        item.delay -= dt;
        items[write++] = item;
        continue;
      }
      item.elapsed += dt;
      const t = Math.min(1, item.elapsed / item.duration);
      item.update(item.ease(t));
      if (t < 1) {
        items[write++] = item;
        continue;
      }
      item.active = false;
      item.complete?.();
    }
    // Tweens started by callbacks during this update were appended after `count`; keep them.
    for (let i = count; i < items.length; i++) items[write++] = items[i];
    items.length = write;
  }

  get count(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

const noop = (): void => undefined;
