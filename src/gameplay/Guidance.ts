import * as THREE from 'three';
import type { ItemKind, Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import { GeoBuilder } from '../world/geo';
import { MATERIALS } from '../world/materials';
import type { World } from './World';

export interface PointerState {
  x: number;
  y: number;
  angle: number;
  visible: boolean;
}

/** Until this much lifetime play the arrow always shows; after that only when the player seems stuck. */
const FTUE_SECONDS = 150;
const IDLE_BEFORE_HINT = 3;
const REACHED = 0.9;

/**
 * No tutorial text (§14): a bouncing arrow over the next useful thing and a screen-edge pointer when it is
 * off-screen. During the first minutes it always shows; later it appears only after a few idle seconds.
 */
export class Guidance {
  private readonly arrow: THREE.Group;
  private target: Vec2 | null = null;
  private thinkTimer = 0;
  private time = 0;
  readonly pointer: PointerState = { x: 0, y: 0, angle: 0, visible: false };
  private readonly tmp = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  enabled = true;

  constructor(private readonly w: World) {
    const b = new GeoBuilder();
    b.cone(0, 0, 0, 0.32, 0.55, '#FFD35C', 4);
    this.arrow = new THREE.Group();
    const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    mesh.rotation.x = Math.PI;
    this.arrow.add(mesh);
    this.arrow.visible = false;
    w.scene.add(this.arrow);
  }

  update(dt: number): void {
    const w = this.w;
    this.time += dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.3;
      const show = this.enabled && (w.lifetimeSeconds() < FTUE_SECONDS || w.player.idleSeconds > IDLE_BEFORE_HINT);
      this.target = show ? this.pick() : null;
    }
    const target = this.target;
    const player = w.player.pos;
    const near = target ? Math.hypot(target.x - player.x, target.z - player.z) < REACHED : true;
    this.arrow.visible = !!target && !near;
    if (target && !near) {
      this.arrow.position.set(target.x, FLOOR_Y + 1.8 + Math.abs(Math.sin(this.time * 4)) * 0.35, target.z);
      this.arrow.rotation.y = this.time * 2;
    }
    this.updatePointer(target && !near ? target : null);
  }

  private updatePointer(target: Vec2 | null): void {
    const pointer = this.pointer;
    pointer.visible = false;
    if (!target) return;
    const onScreen = this.w.stage.project(this.tmp.set(target.x, FLOOR_Y + 1, target.z), this.screen);
    const { width, height } = this.w.stage.size;
    const margin = 36;
    if (onScreen && this.screen.x > margin && this.screen.x < width - margin && this.screen.y > margin + 60 && this.screen.y < height - margin) return;
    const cx = width / 2;
    const cy = height / 2;
    let dx = this.screen.x - cx;
    let dy = this.screen.y - cy;
    if (!onScreen) {
      dx = -dx;
      dy = -dy;
    }
    const angle = Math.atan2(dy, dx);
    const sx = (cx - margin) / Math.max(1e-3, Math.abs(Math.cos(angle)));
    const sy = (cy - margin - 40) / Math.max(1e-3, Math.abs(Math.sin(angle)));
    const r = Math.min(sx, sy);
    pointer.x = cx + Math.cos(angle) * r;
    pointer.y = cy + Math.sin(angle) * r;
    pointer.angle = angle;
    pointer.visible = true;
  }

  /** The most useful next thing for the player to do (also drives the autopilot). */
  bestTarget(forBot = false): Vec2 | null {
    const target = this.pick(forBot);
    if (target || !forBot) return target;
    // A bot with nothing to do waits by the cheapest tile, like a player saving up.
    return this.w.tiles.cheapest()?.pos ?? null;
  }

  private pick(forBot = false): Vec2 | null {
    const w = this.w;
    const player = w.player;
    const map = w.map;
    const stack = player.stack;

    if (w.journey.doorsOpen) {
      const boarding = w.guests.platformGuests().length > 0 && w.staff.count('porter') === 0;
      if (boarding && stack.isEmpty) return w.station.boardingPoint();
      if (w.station.luggagePile > 0 && !stack.isFull && w.train.luggageStored < w.train.luggageCapacity && !stack.has('luggage')) return w.station.luggagePoint();
    }

    if (!stack.isEmpty) {
      const need = this.whereNeeded(stack.items);
      if (need) return need;
      if (map.hasAnchor(0, 'bin')) return map.anchor(0, 'bin');
    }

    const pile = w.cash.nearestWithCash(player.pos);
    if (pile && pile.value >= 1) return { x: pile.x, z: pile.z };

    if (w.guests.hasGuestAtDesk() && w.train.freeCabin() && w.staff.count('porter') === 0) return map.anchor(0, 'deskService');

    const cash = w.wallet.get('cash');
    const tile = w.tiles.cheapest();
    if (tile && w.unlocks.remaining(tile.def.id) <= cash) return tile.pos;

    const request = w.guests.openRequests().find((g) => !w.staff.isHandled(g));
    if (request && request.request && request.request !== 'bathroom') {
      const source = this.sourceFor(request.request, request.cabin?.carriage ?? 0);
      if (source) return source;
    }

    const dirty = w.train.cabins.find((c) => c.isDirty && !c.guest && !c.cleaner);
    if (dirty) {
      const i = dirty.dirty.findIndex(Boolean);
      return dirty.spots[i];
    }

    const lowBath = w.train.bathrooms.find((b) => b.unlocked && (b.towels === 0 || b.rolls === 0));
    const supply = w.train.indexOfType('supply');
    if (lowBath && supply !== null && w.staff.count('runner') === 0) {
      return map.anchor(supply, lowBath.towels === 0 ? 'shelf_towel' : 'shelf_roll');
    }

    if (tile && (forBot || w.player.idleSeconds > IDLE_BEFORE_HINT * 2)) return tile.pos;
    return null;
  }

  private whereNeeded(items: ItemKind[]): Vec2 | null {
    const w = this.w;
    for (const guest of w.guests.openRequests()) {
      if (guest.request && guest.request !== 'bathroom' && items.includes(guest.request) && guest.cabin) return guest.cabin.center;
    }
    if (items.includes('luggage')) {
      const luggage = w.train.indexOfType('luggage');
      const lobbyFull = w.train.luggageStored >= w.econ.facilities.lobbyRackCapacity;
      return luggage !== null && lobbyFull ? w.map.anchor(luggage, 'rack') : w.map.anchor(0, 'rack');
    }
    if (items.includes('crate')) {
      const supply = w.train.indexOfType('supply');
      if (supply !== null) return w.map.anchor(supply, 'crateDrop');
    }
    if (items.includes('towel') || items.includes('roll')) {
      const max = w.econ.facilities;
      const bath = w.train.bathrooms.find((b) => b.unlocked && ((items.includes('towel') && b.towels < max.bathroomTowelMax) || (items.includes('roll') && b.rolls < max.bathroomRollMax)));
      if (bath) return bath.restock;
    }
    return null;
  }

  private sourceFor(item: ItemKind, carriage: number): Vec2 | null {
    const map = this.w.map;
    const name = item === 'tea' ? 'urn' : item;
    if (map.hasAnchor(carriage, name)) return map.anchor(carriage, name);
    return map.hasAnchor(0, name) ? map.anchor(0, name) : null;
  }
}
