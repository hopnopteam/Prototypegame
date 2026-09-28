import { log } from './log';

type Handler<P> = (payload: P) => void;

/**
 * Typed publish/subscribe hub so systems react to each other without direct references.
 * Handler lists are copy-on-write: emitting iterates a snapshot, so handlers may subscribe or
 * unsubscribe (even themselves) mid-emit, and emitting never allocates.
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Handler<never>[]>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const list = (this.handlers.get(type) ?? []) as Handler<E[K]>[];
    // Ignoring duplicates keeps an accidental double-subscribe from double-paying the player.
    if (!list.includes(handler)) {
      this.handlers.set(type, [...list, handler] as Handler<never>[]);
    }
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    const list = this.handlers.get(type) as Handler<E[K]>[] | undefined;
    if (!list) return;
    const next = list.filter((h) => h !== handler);
    if (next.length === 0) this.handlers.delete(type);
    else this.handlers.set(type, next as Handler<never>[]);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers.get(type) as Handler<E[K]>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (error) {
        // One broken listener must not silence every other system listening to this event.
        log.error('EventBus', `Handler for "${String(type)}" threw`, error);
      }
    }
  }

  count<K extends keyof E>(type: K): number {
    return this.handlers.get(type)?.length ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
