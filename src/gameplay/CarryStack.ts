import * as THREE from 'three';
import { easeInOutCubic } from '../core/math';
import type { Tweens } from '../core/Tween';
import type { ItemKind } from '../core/types';
import { createItemMesh, createTrayMesh, ITEM_HEIGHT, ON_TRAY, TRAY_TOP } from '../world/ItemMeshes';

const tmp = new THREE.Vector3();
/** A surfboard under the arm is drawn at this size. */
const BOARD_SCALE = 0.72;
/** A picked-up item's curve into the stack (metres, in the stack's frame): out to the side, up, and ahead of the chest. */
const FLY_AROUND = 0.5;
const FLY_LIFT = 0.45;
const FLY_AHEAD = 0.25;

/**
 * The visible pile of items an actor carries (player and staff share it). Items fly into the stack from a
 * source and out of it into a target, so every pickup and delivery is visible.
 */
export class CarryStack {
  readonly items: ItemKind[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private wobble = 0;
  /** Session 56: the serving tray under the stack whenever food or drink is on it. */
  private tray: THREE.Mesh | null = null;
  private trayBase = 0;

  constructor(
    private readonly anchor: THREE.Object3D,
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    public capacity: number,
    /** Character pass 2: surfboards ride here (under the arm), not on the stack in front. */
    private readonly boardAnchor: THREE.Object3D | null = null,
  ) {}

  /** The anchor an item of this kind rides on. */
  private anchorFor(kind: ItemKind): THREE.Object3D {
    return kind === 'surfboard' && this.boardAnchor ? this.boardAnchor : this.anchor;
  }

  /** Carrying a surfboard under the arm. */
  get board(): boolean {
    return !!this.boardAnchor && this.items.includes('surfboard');
  }

  /** How many things are on the stack in front (boards under the arm left out). */
  get stacked(): number {
    let n = 0;
    for (const k of this.items) if (k !== 'surfboard' || !this.boardAnchor) n++;
    return n;
  }

  /**
   * Half the width of the widest thing carried in front, the tray included (metres, in the stack's own frame): the
   * carrier's hands take the load by its sides there (CharacterView.setGrip).
   */
  get gripHalf(): number {
    let half = 0;
    const measure = (mesh: THREE.Mesh): void => {
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      half = Math.max(half, Math.max(-b.min.x, b.max.x) * mesh.scale.x);
    };
    for (let i = 0; i < this.meshes.length; i++) if (this.items[i] !== 'surfboard' || !this.boardAnchor) measure(this.meshes[i]);
    if (this.tray && this.tray.visible) measure(this.tray);
    return half;
  }

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
    const base = this.trayBase;
    this.updateTray();
    if (base !== this.trayBase) this.relayout();
    const mesh = createItemMesh(kind);
    this.meshes.push(mesh);
    const anchor = this.anchorFor(kind);
    anchor.add(mesh);
    const slot = this.slotHeight(this.meshes.length - 1);
    mesh.position.set(0, slot, 0);
    this.placeBoard(mesh, this.meshes.length - 1);
    if (from) {
      // Start at the source in anchor space, then arc into the slot.
      const start = anchor.worldToLocal(tmp.copy(from));
      const sx = start.x;
      const sy = start.y;
      const sz = start.z;
      mesh.position.set(sx, sy, sz);
      mesh.scale.setScalar(0.6);
      const boardX = this.boardX(this.meshes.indexOf(mesh));
      // Owner ("picks up things in a glitched manner… zero clipping"): the item comes round the carrier, never through
      // them: a curve through a point out to the side it comes from, in front of the chest and over the stack.
      const side = sx >= 0 ? 1 : -1;
      this.tweens.run(0.28, (t) => {
        const target = this.slotHeight(this.meshes.indexOf(mesh));
        const cx = sz < 0 ? side * FLY_AROUND : (sx + boardX) / 2;
        const cy = Math.max(sy, target) + FLY_LIFT;
        const cz = Math.max(sz, 0) + FLY_AHEAD;
        const u = 1 - t;
        mesh.position.set(u * u * sx + 2 * u * t * cx + t * t * boardX, u * u * sy + 2 * u * t * cy + t * t * target, u * u * sz + 2 * u * t * cz);
        mesh.scale.setScalar((0.6 + 0.4 * t) * (boardX !== 0 || (kind === 'surfboard' && this.boardAnchor) ? BOARD_SCALE : 1));
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
    this.updateTray();
    this.tweens.kill(mesh);
    this.relayout();
    if (to) {
      const start = mesh.getWorldPosition(new THREE.Vector3());
      mesh.removeFromParent();
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
      mesh.removeFromParent();
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
      const board = this.items[i] === 'surfboard' && this.boardAnchor;
      mesh.rotation.z = (board ? Math.PI / 2 : 0) + Math.sin(time * 6 + i * 0.7) * sway * (board ? 0.3 : i / Math.max(1, this.meshes.length));
    }
  }

  /** Shows the tray while anything on the stack is food or drink, and lifts the stack onto it. */
  private updateTray(): void {
    const wanted = this.items.some((k) => ON_TRAY.has(k));
    if (wanted && !this.tray) {
      this.tray = createTrayMesh();
      this.anchor.add(this.tray);
    }
    if (this.tray) {
      this.tray.visible = wanted;
      this.tray.position.set(0, -0.01, 0);
    }
    this.trayBase = wanted ? TRAY_TOP - 0.01 : 0;
  }

  private slotHeight(index: number): number {
    if (this.items[index] === 'surfboard' && this.boardAnchor) return 0;
    let y = this.trayBase;
    for (let i = 0; i < index; i++) if (this.items[i] !== 'surfboard' || !this.boardAnchor) y += ITEM_HEIGHT[this.items[i]] ?? 0.2;
    return y;
  }

  /** A board under the arm stands on its edge, each further one a little further out. */
  private boardX(index: number): number {
    if (this.items[index] !== 'surfboard' || !this.boardAnchor) return 0;
    let n = 0;
    for (let i = 0; i < index; i++) if (this.items[i] === 'surfboard') n++;
    return -n * 0.07;
  }

  private placeBoard(mesh: THREE.Mesh, index: number): void {
    if (this.items[index] !== 'surfboard' || !this.boardAnchor) return;
    // At a toy figure's scale (a full-size board stood taller than the conductor), its nose lifted a touch.
    mesh.rotation.set(-0.12, 0, Math.PI / 2);
    mesh.scale.setScalar(BOARD_SCALE);
    mesh.position.x = this.boardX(index);
  }

  private relayout(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const target = this.slotHeight(i);
      const from = mesh.position.y;
      this.tweens.run(0.15, (t) => (mesh.position.y = from + (target - from) * t), { owner: mesh });
      mesh.position.x = this.boardX(i);
      mesh.position.z = 0;
    }
  }
}
