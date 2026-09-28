import * as THREE from 'three';
import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';
import { Zone } from './Zones';

/** Each bill in a pile stands for this many Fares (visual only). */
const BILL_VALUE = 2;
const PICKUP_RADIUS = 0.75;

export interface CashPile {
  id: string;
  x: number;
  z: number;
  value: number;
  zone: Zone;
}

/**
 * Money you can see and touch (MPH pillar #3): cash stacks where it was earned and the player walks over it
 * to scoop it. Staff never pick cash up, so there is always a reason to walk the train.
 */
export class CashPiles {
  private readonly piles = new Map<string, CashPile>();
  private readonly playerTarget = new THREE.Vector3();

  constructor(private readonly w: World) {}

  create(id: string, x: number, z: number): CashPile {
    const existing = this.piles.get(id);
    if (existing) return existing;
    this.w.cashView.createPile(id, x, FLOOR_Y, z);
    const zone = new Zone({
      id: `cash:${id}`,
      x,
      z,
      radius: PICKUP_RADIUS,
      staff: false,
      ring: false,
      priority: -1,
      active: () => (this.piles.get(id)?.value ?? 0) > 0,
      stay: () => {
        this.collect(id);
        return false;
      },
    });
    this.w.zones.add(zone);
    const pile: CashPile = { id, x, z, value: 0, zone };
    this.piles.set(id, pile);
    return pile;
  }

  move(id: string, x: number, z: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    pile.x = x;
    pile.z = z;
    pile.zone.moveTo(x, z);
    this.w.cashView.movePile(id, x, FLOOR_Y, z);
  }

  remove(id: string): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    this.w.zones.remove(pile.zone);
    this.w.cashView.removePile(id);
    this.piles.delete(id);
  }

  valueOf(id: string): number {
    return this.piles.get(id)?.value ?? 0;
  }

  /** Adds money to a pile. With `from`, bills visibly fly there (a guest paying, a tip being left). */
  add(id: string, amount: number, from?: THREE.Vector3): void {
    const pile = this.piles.get(id);
    if (!pile || amount <= 0) return;
    const before = billsFor(pile.value);
    pile.value += amount;
    const after = billsFor(pile.value);
    const newBills = after - before;
    if (from && newBills > 0) {
      this.w.cashView.flyToPile(id, from, Math.min(newBills, 10), () => this.w.audio.play('coin', { pitch: 1 + Math.random() * 0.3 }));
      // Bills beyond the flying ones just appear once the flight lands.
      if (newBills > 10) this.w.tweens.delay(0.6, () => this.w.cashView.setPileCount(id, billsFor(pile.value)));
    } else {
      this.w.cashView.setPileCount(id, after);
    }
  }

  collect(id: string): void {
    const pile = this.piles.get(id);
    if (!pile || pile.value <= 0) return;
    const amount = Math.floor(pile.value);
    pile.value = 0;
    const player = this.w.player;
    const target = (): THREE.Vector3 => this.playerTarget.set(player.pos.x, FLOOR_Y + 0.9, player.pos.z);
    const bills = this.w.cashView.collectPile(id, target, (i) => {
      this.w.audio.play('cash', { pitch: 1 + Math.min(0.6, i * 0.04) });
    });
    if (bills === 0) this.w.audio.play('cash');
    this.w.wallet.add('cash', amount, `pile:${id.split(':')[0]}`);
    this.w.ui.floatText(`+${amount}`, pile.x, FLOOR_Y + 1.4, pile.z, 'cash');
    this.w.haptics.light();
    player.view.bounce(0.6);
    this.w.events.emit('cash.collected', { amount, x: pile.x, z: pile.z });
  }

  /** Nearest pile with money in it, for the guidance arrow. */
  nearestWithCash(from: Vec2): CashPile | null {
    let best: CashPile | null = null;
    let bestD = Infinity;
    for (const pile of this.piles.values()) {
      if (pile.value <= 0) continue;
      const d = (pile.x - from.x) ** 2 + (pile.z - from.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = pile;
      }
    }
    return best;
  }

  get totalOnFloor(): number {
    let total = 0;
    for (const pile of this.piles.values()) total += pile.value;
    return total;
  }
}

const billsFor = (value: number): number => Math.ceil(value / BILL_VALUE);
