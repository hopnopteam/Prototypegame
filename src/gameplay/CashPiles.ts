import * as THREE from 'three';
import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/** Each bill in a pile stands for this many Fares (visual only). */
const BILL_VALUE = 2;
/** Major pentatonic steps: a stream of bills plays a little rising tune instead of one repeated tick. */
const SCALE = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 3, 3.333];
const GLINT_MIN_VALUE = 10;

export interface CashPile {
  id: string;
  x: number;
  z: number;
  value: number;
}

/**
 * Money you can see and touch (MPH pillar #3): cash stacks where it was earned, and walking near a pile
 * pulls it into your pockets bill by bill, each one a note higher, before the total flies up to the
 * counter. Staff never pick cash up, so there is always a reason to walk the train.
 */
export class CashPiles {
  private readonly piles = new Map<string, CashPile>();
  private readonly playerTarget = new THREE.Vector3();
  private streak = 0;
  private streakTimer = 0;

  constructor(private readonly w: World) {}

  create(id: string, x: number, z: number): CashPile {
    const existing = this.piles.get(id);
    if (existing) return existing;
    this.w.cashView.createPile(id, x, FLOOR_Y, z);
    const pile: CashPile = { id, x, z, value: 0 };
    this.piles.set(id, pile);
    return pile;
  }

  move(id: string, x: number, z: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    pile.x = x;
    pile.z = z;
    this.w.cashView.movePile(id, x, FLOOR_Y, z);
  }

  remove(id: string): void {
    if (!this.piles.has(id)) return;
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
      this.w.cashView.flyToPile(id, from, Math.min(newBills, 10), () => this.w.audio.play('coin', { pitch: 0.9 + Math.random() * 0.2, volume: 0.5 }));
      // Bills beyond the flying ones just appear once the flight lands.
      if (newBills > 10) this.w.tweens.delay(0.6, () => this.w.cashView.setPileCount(id, billsFor(pile.value)));
    } else {
      this.w.cashView.setPileCount(id, after);
    }
  }

  /** Magnet: any pile within reach of the player streams in. Also makes big piles glint for attention. */
  update(dt: number): void {
    const player = this.w.player.pos;
    const reach = this.w.econ.money.magnetRadius;
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
    for (const pile of this.piles.values()) {
      if (pile.value < 1) continue;
      const dx = pile.x - player.x;
      const dz = pile.z - player.z;
      if (dx * dx + dz * dz <= reach * reach) {
        this.collect(pile.id);
        continue;
      }
      if (pile.value >= GLINT_MIN_VALUE && Math.random() < dt * 0.9) {
        this.w.particles.emit('sparkle', pile.x + (Math.random() - 0.5) * 0.3, FLOOR_Y + 0.15 + Math.min(0.4, pile.value * 0.004), pile.z, 1, 0.1);
      }
    }
  }

  collect(id: string): void {
    const pile = this.piles.get(id);
    if (!pile || pile.value < 1) return;
    const w = this.w;
    const amount = Math.floor(pile.value);
    pile.value -= amount;
    const player = w.player;
    const target = (): THREE.Vector3 => this.playerTarget.set(player.pos.x, FLOOR_Y + 0.95, player.pos.z);
    // The wallet changes at once (a dropped frame can never lose money); the bills are the show.
    w.wallet.add('cash', amount, `pile:${id.split(':')[0]}`);
    w.ui.cashCollected(amount);
    const bills = w.cashView.vacuum(id, target, (i) => {
      const note = SCALE[Math.min(SCALE.length - 1, this.streak)];
      this.streak++;
      this.streakTimer = 0.5;
      w.audio.play('coin', { pitch: note });
      if (i % 3 === 0) w.haptics.tick();
      if (i % 2 === 0) player.view.bounce(0.25);
    }, () => {
      w.audio.play('cash', { pitch: amount >= 40 ? 1.12 : 1 });
      if (amount >= 40) {
        w.particles.emit('cash', player.pos.x, FLOOR_Y + 1.4, player.pos.z, 14, 0.3);
        w.haptics.success();
      }
    });
    if (bills === 0) w.audio.play('cash');
    w.events.emit('cash.collected', { amount, x: pile.x, z: pile.z });
  }

  /** Nearest pile with money in it, for the guidance arrow. */
  nearestWithCash(from: Vec2): CashPile | null {
    let best: CashPile | null = null;
    let bestD = Infinity;
    for (const pile of this.piles.values()) {
      if (pile.value < 1) continue;
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
