import * as THREE from 'three';
import { easeInOutCubic } from '../core/math';
import type { Tweens } from '../core/Tween';
import type { ItemKind } from '../core/types';
import type { StackItem } from '../world/CarryPose';
import type { CarryKind, CarryLoad } from '../world/CharacterView';
import { createItemMesh, createTrayMesh, LUGGAGE_HANDLE_TOP, ON_TRAY, TRAY_TOP } from '../world/ItemMeshes';

const tmp = new THREE.Vector3();
/** A surfboard under the arm is drawn at this size. */
const BOARD_SCALE = 0.72;
/**
 * Session 63: carried things at a toy's size (the figures are 1.2 m clay toys with short arms): every item in front at
 * most this deep and wide, so the hands reach under it while it stands clear of the body; a bag in the hand this size.
 */
const FRONT_DEPTH = 0.22;
const FRONT_WIDTH = 0.3;
const FRONT_MAX_SCALE = 0.8;
const BAG_SCALE = 0.55;
/** How far below the hand's grip point the top of a bag's handle sits (inside the mitten's lower third). */
const BAG_HANDLE_IN = 0.03;
/** How long an item takes to fly into the hands (the take move is timed round it: CharacterView MOTION_SECONDS). */
const FLY_SECONDS = 0.28;
const FLY_ARC = 0.55;

/** What a carrier's figure does for the stack (CharacterView): where things go and the moves that go with them. */
export interface CarryHolder {
  readonly stackAnchor: THREE.Object3D;
  readonly boardAnchor: THREE.Object3D;
  readonly handAnchors: readonly THREE.Object3D[];
  /** Each stacked item's centre z from the stack anchor (bottom first, a tray first). */
  readonly stackZ: readonly number[];
  handFree(i: number): boolean;
  setLoad(load: CarryLoad): void;
  startMotion(kind: ItemKind, place: boolean, hand: number | null): void;
}

/** Where a carried thing is: in the stack in front, hanging from a hand, or under the arm. */
type Place = 'front' | 'hand0' | 'hand1' | 'board';

const bounds = new Map<ItemKind, THREE.Box3>();
function boundsOf(kind: ItemKind): THREE.Box3 {
  let b = bounds.get(kind);
  if (!b) {
    const m = createItemMesh(kind);
    m.geometry.computeBoundingBox();
    b = m.geometry.boundingBox!.clone();
    bounds.set(kind, b);
  }
  return b;
}
let trayBounds: THREE.Box3 | null = null;
function trayBox(): THREE.Box3 {
  if (!trayBounds) {
    const m = createTrayMesh();
    m.geometry.computeBoundingBox();
    trayBounds = m.geometry.boundingBox!.clone();
  }
  return trayBounds;
}

/** The size an item is carried at in front. */
function frontScale(b: THREE.Box3): number {
  const w = b.max.x - b.min.x;
  const d = b.max.z - b.min.z;
  return Math.min(FRONT_MAX_SCALE, FRONT_DEPTH / Math.max(d, 1e-3), FRONT_WIDTH / Math.max(w, 1e-3));
}

/** One carried thing's flight into its place (from where it was taken, in its parent's space). */
interface Flight {
  from: THREE.Vector3;
  t: number;
}

/**
 * The visible pile of items an actor carries (player and staff share it). Items fly into the stack from a
 * source and out of it into a target, so every pickup and delivery is visible.
 */
export class CarryStack {
  readonly items: ItemKind[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly places: Place[] = [];
  private readonly flights = new Map<THREE.Mesh, Flight>();
  private wobble = 0;
  /** Session 56: the serving tray under the stack whenever food or drink is on it. */
  private tray: THREE.Mesh | null = null;
  private trayOn = false;
  private handsSeen = '';
  private readonly holder: CarryHolder | null;

  constructor(
    private readonly anchor: THREE.Object3D,
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    public capacity: number,
    /** Character pass 2: surfboards ride here (under the arm), not on the stack in front. */
    private readonly boardAnchor: THREE.Object3D | null = null,
    /** Session 63: the figure carrying it (its hands, its stack layout, its moves). */
    holder: CarryHolder | null = null,
  ) {
    this.holder = holder;
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
    this.places.push('front');
    this.arrange();
    const place = this.places[this.places.length - 1];
    if (from) {
      // Starts where it was taken (in its new parent's space) and arcs into its place (`update` moves it).
      const parent = mesh.parent ?? this.anchor;
      parent.updateWorldMatrix(true, false);
      const flight: Flight = { from: parent.worldToLocal(tmp.copy(from)).clone(), t: 0 };
      this.flights.set(mesh, flight);
      this.tweens.run(FLY_SECONDS, (t) => (flight.t = t), { ease: easeInOutCubic, owner: mesh, complete: () => this.flights.delete(mesh) });
    }
    this.holder?.startMotion(kind, false, place === 'hand0' ? 0 : place === 'hand1' ? 1 : null);
    this.wobble = 1;
    this.layout();
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
    const place = this.places[index];
    this.items.splice(index, 1);
    const [mesh] = this.meshes.splice(index, 1);
    this.places.splice(index, 1);
    this.flights.delete(mesh);
    this.tweens.kill(mesh);
    this.holder?.startMotion(kind, true, place === 'hand0' ? 0 : place === 'hand1' ? 1 : null);
    this.arrange();
    if (to) {
      const start = mesh.getWorldPosition(new THREE.Vector3());
      const scale = mesh.getWorldScale(new THREE.Vector3()).x;
      mesh.removeFromParent();
      this.scene.add(mesh);
      mesh.position.copy(start);
      mesh.rotation.set(0, 0, 0);
      this.tweens.run(0.3, (t) => {
        const end = to();
        mesh.position.lerpVectors(start, end, t);
        mesh.position.y += Math.sin(t * Math.PI) * 0.6;
        mesh.scale.setScalar(scale * (1 - t * 0.5));
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
    // A hand freed or taken (the box on the shoulder) can move a bag between the hand and the stack.
    const seen = this.holder ? `${this.holder.handFree(0)}${this.holder.handFree(1)}` : '';
    if (seen !== this.handsSeen) {
      this.handsSeen = seen;
      this.arrange();
    }
    this.layout(moving, time);
  }

  /**
   * Decides where everything goes: bags in the free hands when they are all the figure holds (one or two), everything
   * else (and more bags) in the stack in front, a surfboard under the arm. Moves anything whose place changed, keeping
   * it where it is on screen and letting `layout` bring it in, and tells the figure what it holds.
   */
  private arrange(): void {
    const holder = this.holder;
    const free = holder ? [0, 1].filter((i) => holder.handFree(i)) : [];
    const loose = this.items.filter((k) => !(k === 'surfboard' && this.boardAnchor));
    const bagsInHands = loose.length > 0 && loose.length <= free.length && loose.every((k) => k === 'luggage');
    let hand = 0;
    for (let i = 0; i < this.items.length; i++) {
      const k = this.items[i];
      const place: Place = k === 'surfboard' && this.boardAnchor ? 'board' : bagsInHands ? (free[hand++] === 0 ? 'hand0' : 'hand1') : 'front';
      const mesh = this.meshes[i];
      const parent = this.parentFor(place);
      if (mesh.parent !== parent) {
        if (mesh.parent) {
          // Keep it where it is (and the flight it is on) as it changes hands.
          mesh.updateWorldMatrix(true, false);
          const at = mesh.getWorldPosition(new THREE.Vector3());
          parent.updateWorldMatrix(true, false);
          parent.attach(mesh);
          const f = this.flights.get(mesh) ?? { from: new THREE.Vector3(), t: 0 };
          f.from.copy(parent.worldToLocal(at));
          if (!this.flights.has(mesh)) {
            f.t = 0;
            this.flights.set(mesh, f);
            this.tweens.run(0.18, (t) => (f.t = t), { ease: easeInOutCubic, owner: mesh, complete: () => this.flights.delete(mesh) });
          }
        } else {
          parent.add(mesh);
        }
      }
      this.places[i] = place;
    }
    this.trayOn = this.items.some((k, i) => this.places[i] === 'front' && ON_TRAY.has(k));
    if (this.trayOn && !this.tray) {
      this.tray = createTrayMesh();
      this.anchor.add(this.tray);
    }
    if (this.tray) this.tray.visible = this.trayOn;
    holder?.setLoad(this.load());
  }

  private parentFor(place: Place): THREE.Object3D {
    if (place === 'board') return this.boardAnchor ?? this.anchor;
    if (place === 'front' || !this.holder) return this.anchor;
    return this.holder.handAnchors[place === 'hand0' ? 0 : 1];
  }

  /** What the figure holds, at the sizes it is carried at. */
  private load(): CarryLoad {
    const front: StackItem[] = [];
    let trays = 0;
    let crates = 0;
    let bags = 0;
    let n = 0;
    const tray = this.trayOn ? trayBox() : null;
    const trayScale = tray ? frontScale(tray) : 1;
    if (tray) front.push({ w: (tray.max.x - tray.min.x) * trayScale, d: (tray.max.z - tray.min.z) * trayScale, h: TRAY_TOP * trayScale });
    const hands: (StackItem | null)[] = [null, null];
    for (let i = 0; i < this.items.length; i++) {
      const k = this.items[i];
      const b = boundsOf(k);
      const place = this.places[i];
      if (place === 'front') {
        const s = this.scaleFor(k);
        front.push({ w: (b.max.x - b.min.x) * s, d: (b.max.z - b.min.z) * s, h: (b.max.y - Math.min(0, b.min.y)) * s });
        n++;
        if (ON_TRAY.has(k)) trays++;
        if (k === 'crate') crates++;
        if (k === 'luggage') bags++;
      } else if (place === 'hand0' || place === 'hand1') {
        // Turned so its depth is across the body (`layout`).
        hands[place === 'hand0' ? 0 : 1] = { w: (b.max.z - b.min.z) * BAG_SCALE, d: (b.max.x - b.min.x) * BAG_SCALE, h: (b.max.y - b.min.y) * BAG_SCALE };
      }
    }
    const kind: CarryKind = trays > 0 ? 'tray' : crates > 0 && crates * 2 >= n ? 'crate' : bags > 0 && bags * 2 >= n ? 'luggage' : 'linen';
    return { front, frontKind: kind, hands };
  }

  private scaleFor(kind: ItemKind): number {
    return frontScale(boundsOf(kind));
  }

  /** Puts everything where it belongs this frame: the stack on the figure's layout, bags under the hands. */
  private layout(moving = false, time = 0): void {
    const z = this.holder?.stackZ ?? [];
    const offset = this.trayOn ? 1 : 0;
    if (this.tray && this.trayOn) {
      const s = frontScale(trayBox());
      this.tray.scale.setScalar(s);
      this.tray.position.set(0, 0, z[0] ?? 0);
    }
    let y = this.trayOn ? TRAY_TOP * frontScale(trayBox()) : 0;
    let slot = offset;
    const sway = (moving ? 0.018 : 0.006) + this.wobble * 0.02;
    for (let i = 0; i < this.items.length; i++) {
      const k = this.items[i];
      const mesh = this.meshes[i];
      const place = this.places[i];
      if (place === 'board') {
        let n = 0;
        for (let j = 0; j < i; j++) if (this.items[j] === 'surfboard') n++;
        this.land(mesh, -n * 0.07, 0, 0, BOARD_SCALE);
        mesh.rotation.set(-0.12, 0, Math.PI / 2 + Math.sin(time * 6 + i) * sway * 0.3);
        continue;
      }
      const b = boundsOf(k);
      if (place === 'front') {
        const s = this.scaleFor(k);
        const lift = -Math.min(0, b.min.y) * s;
        this.land(mesh, 0, y + lift, z[slot] ?? 0, s);
        // A gentle sway up the stack (never the bottom one, which the hands hold), small enough to stay on it.
        const above = slot - offset;
        mesh.rotation.set(0, 0, above > 0 ? Math.sin(time * 6 + i * 0.7) * sway * Math.min(1, above / 3) : 0);
        y += (b.max.y - Math.min(0, b.min.y)) * s;
        slot++;
      } else {
        // A bag by its handle: hanging under the hand, turned so it runs along the body, the arch of its handle through
        // the lower part of the mitten (BAG_HANDLE_IN below the grip), the case clear of the hand.
        const top = k === 'luggage' ? LUGGAGE_HANDLE_TOP : b.max.y;
        this.land(mesh, 0, -top * BAG_SCALE - BAG_HANDLE_IN, 0, BAG_SCALE);
        mesh.rotation.set(0, Math.PI / 2, 0);
      }
    }
  }

  /** Sets a mesh in its place (or on its way there, arcing in from where it was taken). */
  private land(mesh: THREE.Mesh, x: number, y: number, z: number, scale: number): void {
    const f = this.flights.get(mesh);
    if (!f) {
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      return;
    }
    const t = f.t;
    mesh.position.set(f.from.x + (x - f.from.x) * t, f.from.y + (y - f.from.y) * t + Math.sin(t * Math.PI) * FLY_ARC * (1 - t * 0.4), f.from.z + (z - f.from.z) * t);
    mesh.scale.setScalar(scale * (0.7 + 0.3 * t));
  }
}
