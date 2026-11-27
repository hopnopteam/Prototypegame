import * as THREE from 'three';
import { easeInOutCubic } from '../core/math';
import type { Tweens } from '../core/Tween';
import type { ItemKind } from '../core/types';
import { createItemMesh, createTrayMesh, ITEM_HEIGHT, ON_TRAY, TRAY_TOP } from '../world/ItemMeshes';
import { BAG_DEPTH, BAG_HANDLE_IN, BAG_SCALE } from '../world/CharacterView';

const tmp = new THREE.Vector3();
/** A surfboard under the arm is drawn at this size. */
const BOARD_SCALE = 0.72;
/** A picked-up item's curve into the stack (metres, in the stack's frame): out to the side, up, and ahead of the chest. */
const FLY_AROUND = 0.5;
const FLY_LIFT = 0.45;
const FLY_AHEAD = 0.25;
/** The suitcase model's handle top, above its base (ItemMeshes 'luggage'). */
const BAG_HANDLE_TOP = 0.32;
/** Bags held in the hands, at most: two in each (owner: "I liked before how he had two bags in each hand"). */
const BAGS_IN_HANDS = 4;
/** What a tall stack keeps between itself and the face (m). */
const FACE_GAP = 0.035;

/**
 * The figure carrying the stack (CharacterView): its hands (bags hang from them) and where its face is (a tall stack
 * in front is kept clear of it).
 */
export interface CarryHolder {
  readonly handAnchors: readonly THREE.Object3D[];
  readonly stackAnchor: THREE.Object3D;
  readonly faceFront: number;
  readonly faceLow: number;
}

/** Where a carried thing rides: the stack in front, a hand (0 left, 1 right, slot 0 inner, 1 outer), under the arm. */
type Place = { at: 'front' | 'board' } | { at: 'hand'; hand: number; slot: number; of: number };

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
  /** Where each item is (parallel to `items`). */
  private places: Place[] = [];
  /** The right hand holding something else (the supply box on the shoulder): bags only in the left then. */
  private rightBusy = false;
  /** How far the stack in front is moved out to clear the face (m). */
  private frontDz = 0;

  constructor(
    private readonly anchor: THREE.Object3D,
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    public capacity: number,
    /** Character pass 2: surfboards ride here (under the arm), not on the stack in front. */
    private readonly boardAnchor: THREE.Object3D | null = null,
    /** The figure carrying it, for bags in the hands and a face to keep a tall stack clear of. */
    private readonly holder: CarryHolder | null = null,
  ) {}

  /** The right hand is busy (the box on the shoulder): bags move out of it, or into it once it is free again. */
  setRightBusy(busy: boolean): void {
    if (busy === this.rightBusy) return;
    this.rightBusy = busy;
    this.relayout();
  }

  /** Bags in the left and the right hand. */
  handBags(hand: number): number {
    let n = 0;
    for (const p of this.places) if (p.at === 'hand' && p.hand === hand) n++;
    return n;
  }

  /** How far a tall stack sits out in front to clear the face (the arms reach for it). */
  get reach(): number {
    return this.frontDz;
  }

  /**
   * Where everything goes: suitcases in the hands while they are all that is carried (one in each hand, then a second
   * in each, the second hanging outside the first), anything else (and a fifth bag) on the stack in front, a surfboard
   * under the arm.
   */
  private plan(): Place[] {
    const loose = this.items.filter((k) => !(k === 'surfboard' && this.boardAnchor));
    const hands = this.holder ? (this.rightBusy ? 1 : 2) : 0;
    const inHands = loose.length > 0 && loose.length <= hands * 2 && loose.length <= BAGS_IN_HANDS && loose.every((k) => k === 'luggage');
    const perHand = [0, 0];
    if (inHands) for (let n = 0; n < loose.length; n++) perHand[hands === 1 ? 0 : n % 2]++;
    const used = [0, 0];
    return this.items.map((k) => {
      if (k === 'surfboard' && this.boardAnchor) return { at: 'board' } as Place;
      if (!inHands) return { at: 'front' } as Place;
      // Left, right, left, right (one hand only while the right holds the box).
      const hand = hands === 1 ? 0 : used[0] <= used[1] ? 0 : 1;
      const slot = used[hand]++;
      return { at: 'hand', hand, slot, of: perHand[hand] } as Place;
    });
  }

  private anchorOf(place: Place): THREE.Object3D {
    if (place.at === 'hand' && this.holder) return this.holder.handAnchors[place.hand];
    if (place.at === 'board' && this.boardAnchor) return this.boardAnchor;
    return this.anchor;
  }

  /** The item's resting spot on its anchor (position, the turn about the vertical, its size). */
  private restOf(index: number): { x: number; y: number; z: number; rotY: number; scale: number } {
    const place = this.places[index];
    if (place.at === 'hand') {
      // Hanging by the handle under the mitten, turned to run along the body; a second bag in the hand beside the
      // first on the outside, the hand between the two handles.
      const side = place.hand === 0 ? -1 : 1;
      const x = place.of === 2 ? side * (place.slot === 0 ? -BAG_DEPTH / 2 : BAG_DEPTH / 2) : 0;
      return { x, y: -BAG_HANDLE_TOP * BAG_SCALE - BAG_HANDLE_IN, z: 0, rotY: Math.PI / 2, scale: BAG_SCALE };
    }
    if (place.at === 'board') return { x: this.boardX(index), y: 0, z: 0, rotY: 0, scale: BOARD_SCALE };
    return { x: 0, y: this.slotHeight(index), z: this.frontDz, rotY: 0, scale: 1 };
  }


  /** Carrying a surfboard under the arm. */
  get board(): boolean {
    return !!this.boardAnchor && this.items.includes('surfboard');
  }

  /** How many things are on the stack in front (boards under the arm and bags in the hands left out). */
  get stacked(): number {
    let n = 0;
    for (const p of this.places) if (p.at === 'front') n++;
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
    for (let i = 0; i < this.meshes.length; i++) if (this.places[i]?.at === 'front') measure(this.meshes[i]);
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
    const mesh = createItemMesh(kind);
    this.meshes.push(mesh);
    this.places.push({ at: 'front' });
    this.updateTray();
    // Where everything goes now (a fifth bag moves the four in the hands onto the stack); the others move there.
    this.relayout(mesh);
    const index = this.meshes.length - 1;
    const anchor = this.anchorOf(this.places[index]);
    anchor.add(mesh);
    const rest = this.restOf(index);
    mesh.position.set(rest.x, rest.y, rest.z);
    mesh.rotation.set(0, rest.rotY, 0);
    mesh.scale.setScalar(rest.scale);
    this.placeBoard(mesh, index);
    if (from && this.places[index].at === 'hand') {
      // Into the hand: up from where it was taken and down onto the hand from above, never through the body.
      const start = anchor.worldToLocal(tmp.copy(from));
      const sx = start.x;
      const sy = start.y;
      const sz = start.z;
      mesh.position.set(sx, sy, sz);
      this.tweens.run(0.3, (t) => {
        const r = this.restOf(this.meshes.indexOf(mesh));
        const u = 1 - t;
        const cy = Math.max(sy, r.y) + 0.35;
        mesh.position.set(u * u * sx + 2 * u * t * r.x + t * t * r.x, u * u * sy + 2 * u * t * cy + t * t * r.y, u * u * sz + 2 * u * t * r.z + t * t * r.z);
        mesh.scale.setScalar(r.scale * (0.7 + 0.3 * t));
      }, { ease: easeInOutCubic, owner: mesh });
    } else if (from) {
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
        const r = this.restOf(this.meshes.indexOf(mesh));
        const target = r.y;
        const cx = sz < 0 ? side * FLY_AROUND : (sx + boardX) / 2;
        const cy = Math.max(sy, target) + FLY_LIFT;
        const cz = Math.max(sz, r.z) + FLY_AHEAD;
        const u = 1 - t;
        mesh.position.set(u * u * sx + 2 * u * t * cx + t * t * boardX, u * u * sy + 2 * u * t * cy + t * t * target, u * u * sz + 2 * u * t * cz + t * t * r.z);
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
    this.places.splice(index, 1);
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
      const place = this.places[i];
      if (place.at === 'hand') {
        // A bag swings a little on its handle as the carrier walks.
        mesh.rotation.x = Math.sin(time * 5.5 + place.hand * 2.1 + place.slot) * (moving ? 0.06 : 0.015) + this.wobble * 0.05;
        continue;
      }
      const board = place.at === 'board';
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
    if (this.places[index]?.at !== 'front') return 0;
    let y = this.trayBase;
    for (let i = 0; i < index; i++) if (this.places[i]?.at === 'front') y += ITEM_HEIGHT[this.items[i]] ?? 0.2;
    return y;
  }

  /**
   * Owner ("when he picks up more like stack, they clip into his face"): how far the stack must sit out in front for
   * everything in it at the face's height to stand clear of the face (and a cap's peak), measured from the meshes.
   */
  private faceClearance(): number {
    if (!this.holder) return 0;
    const low = this.holder.faceLow - this.anchor.position.y;
    const front = this.holder.faceFront + FACE_GAP - this.anchor.position.z;
    let dz = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      if (this.places[i].at !== 'front') continue;
      const mesh = this.meshes[i];
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      const y0 = this.slotHeight(i);
      if (y0 + b.max.y < low) continue;
      // Its back edge (and a little for the sway).
      dz = Math.max(dz, front + -b.min.z + 0.01);
    }
    return dz;
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

  /** Puts everything where the plan wants it, moving anything whose place changed (it keeps where it is on screen). */
  private relayout(fresh?: THREE.Mesh): void {
    this.places = this.plan();
    this.frontDz = this.faceClearance();
    if (this.tray) this.tray.position.z = this.frontDz;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      if (mesh === fresh) continue;
      const anchor = this.anchorOf(this.places[i]);
      if (mesh.parent !== anchor) {
        this.tweens.kill(mesh);
        if (mesh.parent) anchor.attach(mesh); else anchor.add(mesh);
      }
      const r = this.restOf(i);
      const p0 = mesh.position.clone();
      const s0 = mesh.scale.x;
      const q0 = mesh.quaternion.clone();
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rotY, this.places[i].at === 'board' ? Math.PI / 2 : 0));
      if (this.places[i].at === 'board') q1.setFromEuler(new THREE.Euler(-0.12, 0, Math.PI / 2));
      this.tweens.run(0.18, (t) => {
        mesh.position.set(p0.x + (r.x - p0.x) * t, p0.y + (r.y - p0.y) * t, p0.z + (r.z - p0.z) * t);
        mesh.scale.setScalar(s0 + (r.scale - s0) * t);
        mesh.quaternion.slerpQuaternions(q0, q1, t);
      }, { owner: mesh, ease: easeInOutCubic });
    }
  }
}
