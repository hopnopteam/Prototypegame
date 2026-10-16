import { CharacterView, type CharacterLook } from './CharacterView';

/** Characters made at boot for the guests (session 32): a busy train has about 30 people aboard and on the platform. */
export const GUEST_POOL_WARM = 40;

/**
 * Session 32 (owner: "no creating or destroying characters during play, only recycling"): guests' characters are
 * taken from this pool and given back when they leave. Each one is a whole character of its own (its own meshes,
 * its own bubble material); `CharacterView.reset` sets every field again, so a recycled character never shows anyone
 * it was before. Active plus pooled stays constant (it only grows if more than `warm` are ever needed at once).
 */
export class CharacterPool {
  private readonly free: CharacterView[] = [];
  /** Characters out of the pool now, with a running id each (the debug checks look them up by it). */
  readonly active = new Map<CharacterView, number>();
  private nextId = 1;
  /** Characters this pool ever made: active + pooled. */
  made = 0;

  constructor(warm: number) {
    for (let i = 0; i < warm; i++) this.free.push(this.make());
  }

  take(look: CharacterLook, scale: number): CharacterView {
    const view = this.free.pop() ?? this.make();
    view.reset(look, scale);
    this.active.set(view, this.nextId++);
    return view;
  }

  give(view: CharacterView): void {
    if (!this.active.delete(view)) return;
    view.park();
    this.free.push(view);
  }

  get pooled(): number {
    return this.free.length;
  }

  private make(): CharacterView {
    const view = new CharacterView({ body: '#888888', accent: '#888888', skin: '#E0B090', hair: '#333333' });
    view.park();
    this.made++;
    return view;
  }
}
