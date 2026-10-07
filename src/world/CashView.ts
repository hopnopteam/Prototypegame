import * as THREE from 'three';
import { easeInQuad, easeOutQuad } from '../core/math';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

const CAPACITY = 900;
const BILLS_PER_LAYER = 6;
const LAYER_HEIGHT = 0.052;
export const MAX_BILLS_PER_PILE = 48;
/** A drain empties any pile in about this long, however tall it is. */
const DRAIN_SECONDS = 0.55;
const DRAIN_MAX_INTERVAL = 0.05;

interface Pile {
  x: number;
  y: number;
  z: number;
  indices: number[];
  /** 1 → 0 after a bill lands: the stack squashes and springs back. */
  bounce: number;
}

interface Drain {
  pile: Pile;
  target: () => THREE.Vector3;
  timer: number;
  interval: number;
  /** Called as each bill reaches the collector; the drain is finished when every bill has arrived. */
  arrive: () => void;
}

interface Flight {
  index: number;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  duration: number;
  delay: number;
  arc: number;
  spin: number;
  /** Sideways swing, so a stream of bills spirals instead of flying in a straight line. */
  swirl: number;
  /** Pile this bill is landing on (counted as pending there until it lands). */
  pileId?: string;
  onArrive?: () => void;
}

const dummy = new THREE.Object3D();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const tmp = new THREE.Vector3();

/**
 * Physical cash: bills stacked in piles where money was earned, and bills flying in arcs to the player or into
 * a tile. All bills are one InstancedMesh. Bills are purely visual: the wallet changes immediately and the
 * HUD counter rolls up, so a dropped frame can never lose money.
 */
export class CashView {
  readonly mesh: THREE.InstancedMesh;
  /** Which instance slots hold a bill. Slots are handed out lowest-first so `mesh.count` stays small. */
  private readonly used = new Uint8Array(CAPACITY);
  private high = 0;
  private readonly piles = new Map<string, Pile>();
  private readonly flights: Flight[] = [];
  private readonly drains: Drain[] = [];

  /** Bills on show and the instance pool's size (the live performance overlay). */
  stats(): { bills: number; capacity: number } {
    let bills = 0;
    for (let i = 0; i < this.high; i++) bills += this.used[i];
    return { bills, capacity: CAPACITY };
  }

  constructor() {
    // A banded bundle of notes: darker edge, paper band, a round emblem that reads at thumb size.
    const geometry = new GeoBuilder()
      .box(0, 0, 0, 0.36, 0.045, 0.19, PALETTE.cashEdge, 0, { shade: 1 })
      .box(0, 0.003, 0, 0.34, 0.045, 0.17, PALETTE.cash, 0, { shade: 1 })
      .box(0, 0.024, 0, 0.09, 0.006, 0.195, PALETTE.cashBand, 0, { shade: 1 })
      .build();
    this.mesh = new THREE.InstancedMesh(geometry, MATERIALS.solid, CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, hidden);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  createPile(id: string, x: number, y: number, z: number): void {
    if (!this.piles.has(id)) this.piles.set(id, { x, y, z, indices: [], bounce: 0 });
  }

  movePile(id: string, x: number, y: number, z: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    pile.x = x;
    pile.y = y;
    pile.z = z;
    this.layoutPile(pile);
  }

  pileCount(id: string): number {
    return this.piles.get(id)?.indices.length ?? 0;
  }

  /** Sets how many bills a pile shows (capped). Extra bills appear instantly. */
  setPileCount(id: string, count: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    const target = Math.min(MAX_BILLS_PER_PILE, Math.max(0, Math.floor(count)));
    while (pile.indices.length < target) {
      const index = this.allocate();
      if (index < 0) break;
      pile.indices.push(index);
    }
    while (pile.indices.length > target) this.release(pile.indices.pop()!);
    this.layoutPile(pile);
  }

  /** Bills fly from a point and land on the pile, growing it. */
  flyToPile(id: string, from: THREE.Vector3, count: number, onArrive?: () => void): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    for (let n = 0; n < count; n++) {
      const slot = pile.indices.length + this.pendingFor(id);
      if (slot >= MAX_BILLS_PER_PILE) break;
      const landing = this.slotPosition(pile, slot, new THREE.Vector3());
      this.launch(from.clone(), () => landing, n * 0.05, 0.4, 1.2, () => {
        pile.bounce = 1;
        this.setPileCount(id, pile.indices.length + 1);
        onArrive?.();
      }, id);
    }
  }

  /**
   * The pile streams into a (moving) target one bill at a time, from the top of the stack, spiralling in.
   * `onBill` fires as each bill arrives, `onDone` after the last. Returns the number of bills.
   */
  vacuum(id: string, target: () => THREE.Vector3, onBill?: (index: number, total: number) => void, onDone?: () => void): number {
    const pile = this.piles.get(id);
    if (!pile) {
      onDone?.();
      return 0;
    }
    const inFlight = this.flights.filter((f) => f.pileId === id);
    const total = pile.indices.length + inFlight.length;
    if (total === 0) {
      onDone?.();
      return 0;
    }
    let arrived = 0;
    const arrive = (): void => {
      onBill?.(arrived, total);
      arrived++;
      if (arrived === total) onDone?.();
    };
    // Bills still on their way to this pile change course to the collector.
    for (const f of inFlight) {
      this.pendingByPile.set(id, Math.max(0, this.pendingFor(id) - 1));
      f.pileId = undefined;
      f.to = target;
      f.onArrive = arrive;
    }
    if (pile.indices.length > 0) {
      this.drains.push({ pile, target, timer: 0, interval: Math.min(DRAIN_MAX_INTERVAL, DRAIN_SECONDS / pile.indices.length), arrive });
    }
    return total;
  }

  /** Bills fly between two moving points (player → tile). */
  stream(from: () => THREE.Vector3, to: () => THREE.Vector3, count: number, spacing: number, onArrive?: () => void): void {
    for (let n = 0; n < count; n++) this.launch(from().clone(), to, n * spacing, 0.35, 0.8, onArrive, undefined, 0.15);
  }

  removePile(id: string): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    for (const index of pile.indices) this.release(index);
    this.piles.delete(id);
  }

  update(dt: number): void {
    let dirty = false;
    for (let i = this.drains.length - 1; i >= 0; i--) {
      const d = this.drains[i];
      d.timer -= dt;
      while (d.timer <= 0 && d.pile.indices.length > 0) {
        d.timer += d.interval;
        const index = d.pile.indices.pop()!;
        const from = this.slotPosition(d.pile, d.pile.indices.length, new THREE.Vector3());
        this.release(index);
        const side = d.pile.indices.length % 2 ? 1 : -1;
        this.launch(from, d.target, 0, 0.3, 0.75, d.arrive, undefined, side * (0.25 + Math.random() * 0.25));
      }
      if (d.pile.indices.length === 0) this.drains.splice(i, 1);
    }
    for (const pile of this.piles.values()) {
      if (pile.bounce <= 0) continue;
      pile.bounce = Math.max(0, pile.bounce - dt * 5);
      this.layoutPile(pile);
      dirty = true;
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt / f.duration;
      const to = f.to();
      const t = Math.min(1, f.t);
      const k = t < 0.5 ? easeOutQuad(t * 2) * 0.5 : 0.5 + easeInQuad((t - 0.5) * 2) * 0.5;
      tmp.lerpVectors(f.from, to, k);
      tmp.y += Math.sin(t * Math.PI) * f.arc;
      tmp.x += Math.sin(t * Math.PI) * f.swirl;
      dummy.position.copy(tmp);
      dummy.rotation.set(t * f.spin, t * f.spin * 1.7, 0);
      const s = t > 0.85 ? 1 - (t - 0.85) / 0.15 * 0.6 : 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(f.index, dummy.matrix);
      dirty = true;
      if (t >= 1) {
        this.flights.splice(i, 1);
        this.release(f.index);
        if (f.pileId) this.pendingByPile.set(f.pileId, Math.max(0, this.pendingFor(f.pileId) - 1));
        f.onArrive?.();
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get flying(): number {
    return this.flights.length;
  }

  private pendingByPile = new Map<string, number>();

  private pendingFor(id: string): number {
    return this.pendingByPile.get(id) ?? 0;
  }

  private launch(from: THREE.Vector3, to: () => THREE.Vector3, delay: number, duration: number, arc: number, onArrive?: () => void, pileId?: string, swirl = 0): void {
    const index = this.allocate();
    if (index < 0) {
      onArrive?.();
      return;
    }
    if (pileId) this.pendingByPile.set(pileId, this.pendingFor(pileId) + 1);
    this.mesh.setMatrixAt(index, hidden);
    this.flights.push({ index, from, to, t: 0, duration, delay, arc, spin: (Math.random() - 0.5) * 8, swirl, pileId, onArrive });
  }

  /** Lowest free slot, or -1 when every bill is in use. Only slots below `high` are drawn. */
  private allocate(): number {
    for (let i = 0; i < CAPACITY; i++) {
      if (this.used[i]) continue;
      this.used[i] = 1;
      if (i + 1 > this.high) {
        this.high = i + 1;
        this.mesh.count = this.high;
      }
      return i;
    }
    return -1;
  }

  private release(index: number): void {
    this.mesh.setMatrixAt(index, hidden);
    this.used[index] = 0;
    while (this.high > 0 && !this.used[this.high - 1]) this.high--;
    this.mesh.count = this.high;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private slotPosition(pile: Pile, slot: number, out: THREE.Vector3): THREE.Vector3 {
    const layer = Math.floor(slot / BILLS_PER_LAYER);
    const inLayer = slot % BILLS_PER_LAYER;
    const col = inLayer % 2;
    const row = Math.floor(inLayer / 2);
    return out.set(pile.x + (col - 0.5) * 0.38, pile.y + 0.025 + layer * LAYER_HEIGHT, pile.z + (row - 1) * 0.21);
  }

  private layoutPile(pile: Pile): void {
    // Squash and stretch: the stack dips as a bill lands on it, then springs up.
    const b = pile.bounce;
    const squash = b > 0 ? 1 - Math.sin(b * Math.PI) * 0.22 : 1;
    for (let slot = 0; slot < pile.indices.length; slot++) {
      this.slotPosition(pile, slot, tmp);
      tmp.y = pile.y + (tmp.y - pile.y) * squash;
      dummy.position.copy(tmp);
      dummy.rotation.set(0, (slot % 3) * 0.05 - 0.05, 0);
      const spread = 1 + (1 - squash) * 0.5;
      dummy.scale.set(spread, squash, spread);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(pile.indices[slot], dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
