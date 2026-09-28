import type { ProductDef } from '../config/content';
import { log } from '../core/log';

export type PurchaseResult = 'success' | 'cancelled' | 'failed' | 'alreadyOwned' | 'unknownProduct';

/**
 * Store access. It only talks to the store; granting gems or turning off ads on success is the caller's
 * job, so the real SDK can replace the mock without touching reward logic.
 */
export interface IapService {
  readonly products: readonly ProductDef[];
  isOwned(productId: string): boolean;
  priceLabel(productId: string, discounted?: boolean): string;
  purchase(productId: string, discounted?: boolean): Promise<PurchaseResult>;
  restore(): Promise<string[]>;
}

/** Confirms the fake purchase. Implemented by the UI (a "mock store" sheet). */
export interface MockStorePresenter {
  confirm(product: ProductDef, priceLabel: string): Promise<boolean>;
}

const OWNED_KEY = 'nightexpress.mockstore.owned';

/**
 * Fake store. Owned non-consumables live outside the save file, like a real store receipt, so a progress
 * reset keeps the First Class Ticket just as a reinstall + restore would.
 */
export class MockIapService implements IapService {
  simulateFailure = false;
  private readonly owned = new Set<string>();

  constructor(
    readonly products: readonly ProductDef[],
    private readonly presenter: MockStorePresenter,
    private readonly persist = true,
  ) {
    this.load();
  }

  isOwned(productId: string): boolean {
    return this.owned.has(productId);
  }

  priceLabel(productId: string, discounted = false): string {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return '';
    return discounted && product.discountPrice ? product.discountPrice : product.price;
  }

  async purchase(productId: string, discounted = false): Promise<PurchaseResult> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      log.error('IAP', `Unknown product "${productId}".`);
      return 'unknownProduct';
    }
    if (product.kind === 'nonConsumable' && this.owned.has(productId)) return 'alreadyOwned';
    const confirmed = await this.presenter.confirm(product, this.priceLabel(productId, discounted));
    if (!confirmed) return 'cancelled';
    if (this.simulateFailure) return 'failed';
    if (product.kind === 'nonConsumable') {
      this.owned.add(productId);
      this.save();
    }
    return 'success';
  }

  async restore(): Promise<string[]> {
    this.load();
    return [...this.owned];
  }

  clearOwned(): void {
    this.owned.clear();
    this.save();
  }

  private load(): void {
    if (!this.persist) return;
    try {
      const stored = window.localStorage.getItem(OWNED_KEY);
      if (stored) for (const id of JSON.parse(stored) as string[]) this.owned.add(id);
    } catch {
      // Storage blocked: ownership lasts for this visit only.
    }
  }

  private save(): void {
    if (!this.persist) return;
    try {
      window.localStorage.setItem(OWNED_KEY, JSON.stringify([...this.owned]));
    } catch {
      // Storage blocked: ownership lasts for this visit only.
    }
  }
}
