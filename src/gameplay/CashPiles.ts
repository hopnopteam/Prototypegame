import * as THREE from 'three';
import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';
import { WORLD_UI_LAYER } from '../world/CameraRig';
import { bubbleTexture, makeSprite } from '../world/sprites';
import { underPopup } from '../world/screenMask';

/** Major pentatonic steps: a stream of bills plays a little rising tune instead of one repeated tick. */
const SCALE = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 3, 3.333];
const GLINT_MIN_VALUE = 10;

export interface CashPile {
  id: string;
  x: number;
  z: number;
  value: number;
  /** Session 64: a room's tips: standing anywhere in it scoops them (the walls hide the floor, not the room). */
  area?: { x0: number; x1: number; z0: number; z1: number };
  /** Session 64: a green cash badge floating over a room's tips, drawn over its walls, while there is money in it. */
  badge?: THREE.Sprite;
  /** Its pop when a tip lands (0…1). */
  pop?: number;
}

/** Session 64 (owner: "because of the walls, I cannot see cash given by customers"): the room's cash badge. */
const TIP_BADGE = { size: 0.62, height: 1.75, bob: 0.06, bobRate: 2.4, popScale: 0.35, popDecay: 3 };

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

  create(id: string, x: number, z: number, area?: CashPile['area']): CashPile {
    const existing = this.piles.get(id);
    if (existing) return existing;
    this.w.cashView.createPile(id, x, FLOOR_Y, z);
    const pile: CashPile = { id, x, z, value: 0, area };
    if (area) {
      const badge = makeSprite(bubbleTexture('cash', 'cash'), TIP_BADGE.size);
      badge.layers.set(WORLD_UI_LAYER);
      badge.visible = false;
      badge.position.set(x, FLOOR_Y + TIP_BADGE.height, z);
      this.w.scene.add(badge);
      pile.badge = badge;
      pile.pop = 0;
    }
    this.piles.set(id, pile);
    return pile;
  }

  move(id: string, x: number, z: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    pile.x = x;
    pile.z = z;
    pile.badge?.position.set(x, FLOOR_Y + TIP_BADGE.height, z);
    this.w.cashView.movePile(id, x, FLOOR_Y, z);
  }

  remove(id: string): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    if (pile.badge) {
      this.w.scene.remove(pile.badge);
      pile.badge.material.dispose();
    }
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
    const bills = this.w.econ.money.bills;
    const before = billsFor(pile.value, bills.value);
    pile.value += amount;
    if (pile.badge) pile.pop = 1;
    const after = billsFor(pile.value, bills.value);
    const newBills = after - before;
    if (from && newBills > 0) {
      this.w.cashView.flyToPile(id, from, Math.min(newBills, bills.flyMax), () => this.w.audio.play('coin', { pitch: 0.9 + Math.random() * 0.2, volume: 0.5 }));
      // Bills beyond the flying ones just appear once the flight lands.
      if (newBills > bills.flyMax) this.w.tweens.delay(0.6 + bills.flyMax * 0.05, () => this.w.cashView.setPileCount(id, billsFor(pile.value, bills.value)));
    } else {
      this.w.cashView.setPileCount(id, after);
    }
  }

  /**
   * Paid straight into the wallet (session 38, owner: "when the food is delivered, the player should receive the money
   * directly"): the amount pops up where it was paid with a burst of bills and the coin, no pile to walk back to.
   */
  payDirect(amount: number, x: number, z: number, source: string): void {
    if (amount <= 0) return;
    const w = this.w;
    w.wallet.add('cash', amount, source);
    w.ui.cashCollected(amount);
    w.ui.floatText(`+${amount}`, x, FLOOR_Y + 2.0, z, 'cash');
    w.particles.emit('cash', x, FLOOR_Y + 1.3, z, 8, 0.25);
    w.audio.play('coin');
    w.haptics.tick();
    w.events.emit('cash.collected', { amount, x, z });
  }

  /** Magnet: any pile within reach of the player streams in. Also makes big piles glint for attention. */
  update(dt: number): void {
    const player = this.w.player.pos;
    const reach = this.w.econ.money.magnetRadius;
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
    this.badgeClock += dt;
    for (const pile of this.piles.values()) {
      if (pile.badge) this.updateBadge(pile, dt);
      if (pile.value < 1) continue;
      const dx = pile.x - player.x;
      const dz = pile.z - player.z;
      const a = pile.area;
      if (dx * dx + dz * dz <= reach * reach || (a && player.x > a.x0 && player.x < a.x1 && player.z > a.z0 && player.z < a.z1)) {
        this.collect(pile.id);
        continue;
      }
      if (pile.value >= GLINT_MIN_VALUE && Math.random() < dt * 0.9) {
        this.w.particles.emit('sparkle', pile.x + (Math.random() - 0.5) * 0.3, FLOOR_Y + 0.15 + Math.min(0.4, pile.value * 0.004), pile.z, 1, 0.1);
      }
    }
  }

  private badgeClock = 0;

  /** A room's cash badge: up while it holds money, bobbing, popping as each tip lands; out of the way of pop-ups. */
  private updateBadge(pile: CashPile, dt: number): void {
    const badge = pile.badge!;
    const y = FLOOR_Y + TIP_BADGE.height;
    badge.visible = pile.value >= 1 && !underPopup(pile.x, y, pile.z);
    if (!badge.visible) return;
    pile.pop = Math.max(0, (pile.pop ?? 0) - dt * TIP_BADGE.popDecay);
    const p = pile.pop;
    const scale = TIP_BADGE.size * (1 + TIP_BADGE.popScale * Math.sin(p * Math.PI) * p);
    badge.scale.set(scale, scale, 1);
    badge.position.y = y + Math.sin(this.badgeClock * TIP_BADGE.bobRate + pile.x * 3 + pile.z) * TIP_BADGE.bob;
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
      if (i % w.econ.money.bills.hapticEvery === 0) w.haptics.tick();
      if (i % 2 === 0) player.view.bounce(0.25);
    }, () => {
      // Session 29: the coins are the sound (one soft rising tick); a big scoop adds a sparkle of particles, not a second cue.
      if (amount >= 40) {
        w.particles.emit('cash', player.pos.x, FLOOR_Y + 1.4, player.pos.z, 14, 0.3);
        w.haptics.success();
      }
    });
    if (bills === 0) w.audio.play('coin');
    w.events.emit('cash.collected', { amount, x: pile.x, z: pile.z });
  }

  /** Nearest pile with money in it, for the guidance arrow. */
  nearestWithCash(from: Vec2, skip?: (pile: CashPile) => boolean): CashPile | null {
    let best: CashPile | null = null;
    let bestD = Infinity;
    for (const pile of this.piles.values()) {
      if (pile.value < 1 || skip?.(pile)) continue;
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

const billsFor = (value: number, billValue: number): number => Math.ceil(value / billValue);
