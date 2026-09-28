import type { UnlockDef } from '../config/content';

export interface UnlockState {
  unlocked: string[];
  partial: Record<string, number>;
}

/**
 * The chain of unlock tiles. A tile appears when everything it requires is complete (and any gameplay flags
 * are set), takes payment in any number of instalments, and completes exactly once.
 */
export class UnlockChain {
  private readonly byId = new Map<string, UnlockDef>();
  private readonly done: Set<string>;
  private list: readonly UnlockDef[] = [];

  constructor(
    defs: readonly UnlockDef[],
    private readonly state: UnlockState,
    private readonly flags: () => Record<string, boolean>,
  ) {
    this.setDefs(defs);
    this.done = new Set(state.unlocked);
  }

  get defs(): readonly UnlockDef[] {
    return this.list;
  }

  /** The chain changes shape when the player picks a carriage: new tiles appear, completed ones stay. */
  setDefs(defs: readonly UnlockDef[]): void {
    this.list = defs;
    this.byId.clear();
    for (const def of defs) this.byId.set(def.id, def);
  }

  get(id: string): UnlockDef | undefined {
    return this.byId.get(id);
  }

  isUnlocked(id: string): boolean {
    return this.done.has(id);
  }

  isAvailable(id: string): boolean {
    const def = this.byId.get(id);
    if (!def || this.done.has(id)) return false;
    if (!def.requires.every((r) => this.done.has(r))) return false;
    const flags = this.flags();
    return (def.flags ?? []).every((f) => flags[f]);
  }

  available(): UnlockDef[] {
    return this.defs.filter((d) => this.isAvailable(d.id));
  }

  paid(id: string): number {
    return this.state.partial[id] ?? 0;
  }

  remaining(id: string): number {
    const def = this.byId.get(id);
    if (!def) return 0;
    return Math.max(0, def.price - this.paid(id));
  }

  /** Applies up to `amount` to the tile. Returns how much was actually taken. */
  pay(id: string, amount: number): number {
    if (!this.isAvailable(id) || amount <= 0) return 0;
    const taken = Math.min(amount, this.remaining(id));
    this.state.partial[id] = this.paid(id) + taken;
    return taken;
  }

  /** Marks a fully paid tile complete. Returns false if it was not ready. */
  complete(id: string): boolean {
    if (!this.isAvailable(id) || this.remaining(id) > 0) return false;
    this.forceComplete(id);
    return true;
  }

  /** Completes regardless of payment (dev tools, story rewards). */
  forceComplete(id: string): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.state.unlocked.push(id);
    delete this.state.partial[id];
  }

  /** Cheapest available tile: the "next goal" the guidance arrow and cash offers point at. */
  cheapestAvailable(): UnlockDef | undefined {
    let best: UnlockDef | undefined;
    for (const def of this.available()) {
      if (!best || this.remaining(def.id) < this.remaining(best.id)) best = def;
    }
    return best;
  }
}
