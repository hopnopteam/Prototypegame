import * as THREE from 'three';
import { easeInOutCubic } from '../core/math';
import type { Tweens } from '../core/Tween';
import type { ItemKind } from '../core/types';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';

const tmp = new THREE.Vector3();

/**
 * The visible pile of items an actor carries (player and staff share it). Items fly into the stack from a
 * source and out of it into a target, so every pickup and delivery is visible.
 */
export class CarryStack {
  readonly items: ItemKind[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private wobble = 0;

  constructor(
    private readonly anchor: THREE.Object3D,
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    public capacity: number,
  ) {}

  get count(): number {
    return this.items.length;
  }

  get isFull(): boolean {
    return this.items.length >= this.capacity;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  has(kind: ItemKind): boolean {
    return this.items.includes(kind);
  }

  countOf(kind: ItemKind): number {
    let n = 0;
    for (const item of this.items) if (item === kind) n++;
    return n;
  }

  /** Adds an item; if `from` is given, it flies there from that world position. */
  add(kind: ItemKind, from?: THREE.Vector3): boolean {
    if (this.isFull) return false;
    this.items.push(kind);
    const mesh = createItemMesh(kind);
    this.meshes.push(mesh);
    this.anchor.add(mesh);
    const slot = this.slotHeight(this.meshes.length - 1);
    mesh.position.set(0, slot, 0);
    if (from) {
      // Start at the source in anchor space, then arc into the slot.
      const start = this.anchor.worldToLocal(tmp.copy(from));
      const sx = start.x;
      const sy = start.y;
      const sz = start.z;
      mesh.position.set(sx, sy, sz);
      mesh.scale.setScalar(0.6);
      this.tweens.run(0.28, (t) => {
        const target = this.slotHeight(this.meshes.indexOf(mesh));
        mesh.position.set(sx * (1 - t), sy + (target - sy) * t + Math.sin(t * Math.PI) * 0.5, sz * (1 - t));
        mesh.scale.setScalar(0.6 + 0.4 * t);
      }, { ease: easeInOutCubic, owner: mesh });
    }
    this.wobble = 1;
    return true;
  }

  /** Removes one item of this kind; if `to` is given, it flies there. Returns false if none carried. */
  remove(kind: ItemKind, to?: () => THREE.Vector3, onArrive?: () => void): boolean {
    let index = -1;
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i] === kind) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    this.items.splice(index, 1);
    const [mesh] = this.meshes.splice(index, 1);
    this.tweens.kill(mesh);
    this.relayout();
    if (to) {
      const start = mesh.getWorldPosition(new THREE.Vector3());
      this.anchor.remove(mesh);
      this.scene.add(mesh);
      mesh.position.copy(start);
      this.tweens.run(0.3, (t) => {
        const end = to();
        mesh.position.lerpVectors(start, end, t);
        mesh.position.y += Math.sin(t * Math.PI) * 0.6;
        mesh.scale.setScalar(1 - t * 0.5);
      }, {
        ease: easeInOutCubic,
        complete: () => {
          this.scene.remove(mesh);
          onArrive?.();
        },
      });
    } else {
      this.anchor.remove(mesh);
      onArrive?.();
    }
    this.wobble = 0.6;
    return true;
  }

  /** Throws everything away (bin). */
  clear(to?: THREE.Vector3): number {
    const n = this.items.length;
    while (this.items.length > 0) {
      const kind = this.items[this.items.length - 1];
      this.remove(kind, to ? () => to : undefined);
    }
    return n;
  }

  update(dt: number, moving: boolean, time: number): void {
    this.wobble = Math.max(0, this.wobble - dt * 3);
    const sway = (moving ? 0.05 : 0.015) + this.wobble * 0.06;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.rotation.z = Math.sin(time * 6 + i * 0.7) * sway * (i / Math.max(1, this.meshes.length));
    }
  }

  private slotHeight(index: number): number {
    let y = 0;
    for (let i = 0; i < index; i++) y += ITEM_HEIGHT[this.items[i]] ?? 0.2;
    return y;
  }

  private relayout(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const target = this.slotHeight(i);
      const from = mesh.position.y;
      this.tweens.run(0.15, (t) => (mesh.position.y = from + (target - from) * t), { owner: mesh });
      mesh.position.x = 0;
      mesh.position.z = 0;
    }
  }
}
