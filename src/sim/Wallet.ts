import type { CurrencyKind } from '../core/types';

export interface WalletState {
  cash: number;
  gems: number;
  railMiles: number;
}

export type WalletListener = (kind: CurrencyKind, amount: number, delta: number, source: string) => void;

/** Fares (per route), gems and Rail Miles. Never goes negative; every change names its source. */
export class Wallet {
  constructor(private readonly state: WalletState, private readonly listener: WalletListener = () => undefined) {}

  get(kind: CurrencyKind): number {
    return this.state[kind];
  }

  add(kind: CurrencyKind, amount: number, source: string): void {
    if (!(amount > 0)) return;
    this.state[kind] += amount;
    this.listener(kind, this.state[kind], amount, source);
  }

  canAfford(kind: CurrencyKind, amount: number): boolean {
    return this.state[kind] >= amount;
  }

  trySpend(kind: CurrencyKind, amount: number, sink: string): boolean {
    if (amount < 0 || this.state[kind] < amount) return false;
    if (amount === 0) return true;
    this.state[kind] -= amount;
    this.listener(kind, this.state[kind], -amount, sink);
    return true;
  }

  /** Takes up to `amount`, returning how much was taken (for tiles that drain cash gradually). */
  take(kind: CurrencyKind, amount: number, sink: string): number {
    const taken = Math.min(this.state[kind], Math.max(0, amount));
    if (taken > 0) {
      this.state[kind] -= taken;
      this.listener(kind, this.state[kind], -taken, sink);
    }
    return taken;
  }
}
