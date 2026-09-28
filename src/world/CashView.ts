import * as THREE from 'three';
import { easeInQuad, easeOutQuad } from '../core/math';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

const CAPACITY = 900;
const BILLS_PER_LAYER = 6;
const LAYER_HEIGHT = 0.052;
export const MAX_BILLS_PER_PILE = 36;

interface Pile {
  x: number;
  y: number;
  z: number;
  indices: number[];
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
  private readonly free: number[] = [];
  private readonly piles = new Map<string, Pile>();
  private readonly flights: Flight[] = [];

  constructor() {
    const geometry = new GeoBuilder()
      .box(0, 0, 0, 0.36, 0.045, 0.19, PALETTE.cash)
      .box(0, 0.024, 0, 0.1, 0.004, 0.2, PALETTE.cashBand)
      .build();
    this.mesh = new THREE.InstancedMesh(geometry, MATERIALS.solid, CAPACITY);
    this.mesh.frustumCulled = false;
    for (let i = CAPACITY - 1; i >= 0; i--) {
      this.free.push(i);
      this.mesh.setMatrixAt(i, hidden);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  createPile(id: string, x: number, y: number, z: number): void {
    if (!this.piles.has(id)) this.piles.set(id, { x, y, z, indices: [] });
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
    while (pile.indices.length < target && this.free.length > 0) pile.indices.push(this.free.pop()!);
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
        this.setPileCount(id, pile.indices.length + 1);
        onArrive?.();
      }, id);
    }
  }

  /** Every bill in the pile flies to a (moving) target; the pile empties. Returns the number of bills. */
  collectPile(id: string, target: () => THREE.Vector3, onArrive?: (index: number) => void): number {
    const pile = this.piles.get(id);
    if (!pile || pile.indices.length === 0) return 0;
    const count = pile.indices.length;
    for (let n = 0; n < count; n++) {
      const index = pile.indices.pop()!;
      const from = this.slotPosition(pile, pile.indices.length, new THREE.Vector3());
      this.release(index);
      this.launch(from, target, n * 0.025, 0.32, 0.9, onArrive ? () => onArrive(n) : undefined);
    }
    return count;
  }

  /** Bills fly between two moving points (player → tile). */
  stream(from: () => THREE.Vector3, to: () => THREE.Vector3, count: number, spacing: number, onArrive?: () => void): void {
    for (let n = 0; n < count; n++) this.launch(from().clone(), to, n * spacing, 0.35, 0.8, onArrive);
  }

  removePile(id: string): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    for (const index of pile.indices) this.release(index);
    this.piles.delete(id);
  }

  update(dt: number): void {
    let dirty = false;
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

  private launch(from: THREE.Vector3, to: () => THREE.Vector3, delay: number, duration: number, arc: number, onArrive?: () => void, pileId?: string): void {
    const index = this.free.pop();
    if (index === undefined) {
      onArrive?.();
      return;
    }
    if (pileId) this.pendingByPile.set(pileId, this.pendingFor(pileId) + 1);
    const done = pileId
      ? () => {
          this.pendingByPile.set(pileId, Math.max(0, this.pendingFor(pileId) - 1));
          onArrive?.();
        }
      : onArrive;
    this.mesh.setMatrixAt(index, hidden);
    this.flights.push({ index, from, to, t: 0, duration, delay, arc, spin: (Math.random() - 0.5) * 8, onArrive: done });
  }

  private release(index: number): void {
    this.mesh.setMatrixAt(index, hidden);
    this.free.push(index);
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
    for (let slot = 0; slot < pile.indices.length; slot++) {
      this.slotPosition(pile, slot, tmp);
      dummy.position.copy(tmp);
      dummy.rotation.set(0, (slot % 3) * 0.05 - 0.05, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(pile.indices[slot], dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
