import * as THREE from 'three';
import type { ItemKind, Vec2 } from '../core/types';
import { isDwellNeed } from '../config/classes';
import { sourceAnchorFor } from './Demand';
import { FLOOR_Y } from '../world/CarriageView';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { markWorldUi } from '../world/ZoneViews';
import type { World } from './World';

export type GuidanceReason = 'none' | 'board' | 'luggage' | 'deliver' | 'return' | 'cash' | 'desk' | 'tile' | 'fetch' | 'clean' | 'save';

export interface PointerState {
  x: number;
  y: number;
  angle: number;
  visible: boolean;
}

/** Screen-edge pointer insets in CSS pixels (top clears the HUD bars, right clears the side buttons). */
/** The edge pointer is for spots off the screen (session 23: not for one merely beside the side buttons). */
const POINTER_INSET = { top: 124, right: 26, left: 26, side: 36 };
const IDLE_BEFORE_HINT = 3;
/**
 * Session 20 (owner: "the amount of arrow pointing… is quite insane and very distracting"): after the first-minute
 * walkthrough the arrow shows only for a lesson about its own spot (once per mechanic) or as a nudge after this
 * many idle seconds. It never points at cash on the floor (in plain sight, and it pulls itself in).
 */
const IDLE_NUDGE = 6;
/** Seconds the arrow takes to grow in or shrink away (it never pops). */
const ARROW_FADE = 0.22;
const REACHED = 0.9;
/** The guide arrow: its size on screen (metres at the target), the height it hangs at and its bounce. */
const ARROW_SIZE = 0.62;
const ARROW_HEIGHT = 1.75;
const ARROW_BOB = 0.28;

/**
 * A bouncing arrow over the next useful thing and a screen-edge pointer when it is off-screen (the Coach
 * adds one short line saying what to do there). During the first minutes it always shows; later it appears
 * only after a few idle seconds.
 */
export class Guidance {
  private readonly arrow: THREE.Group;
  private target: Vec2 | null = null;
  /** Whether the arrow is up for the current target (see `shouldShow`), and its eased size. */
  private shown = false;
  private grow = 0;
  private thinkTimer = 0;
  private time = 0;
  readonly pointer: PointerState = { x: 0, y: 0, angle: 0, visible: false };
  /** What the player should do at the last picked target (the coach puts it into words). */
  reason: GuidanceReason = 'none';
  private readonly tmp = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  enabled = true;

  constructor(private readonly w: World) {
    this.arrow = new THREE.Group();
    this.arrow.add(makeSprite(guideArrowTexture(), ARROW_SIZE));
    this.arrow.visible = false;
    markWorldUi(this.arrow);
    w.scene.add(this.arrow);
  }

  update(dt: number): void {
    const w = this.w;
    this.time += dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.3;
      this.target = this.enabled ? this.pick() : null;
      this.shown = this.shouldShow();
    }
    const target = this.shown ? this.target : null;
    const player = w.player.pos;
    const near = target ? Math.hypot(target.x - player.x, target.z - player.z) < REACHED : true;
    this.grow = Math.max(0, Math.min(1, this.grow + (target && !near ? dt : -dt) / ARROW_FADE));
    this.arrow.visible = this.grow > 0.01;
    if (target) {
      // A soft bounce, its tip just above head height over the spot.
      this.arrow.position.set(target.x, FLOOR_Y + ARROW_HEIGHT + Math.abs(Math.sin(this.time * 4)) * ARROW_BOB, target.z);
    }
    const g = this.grow * this.grow * (3 - 2 * this.grow);
    this.arrow.scale.setScalar(Math.max(0.001, g));
    this.updatePointer(target && !near ? target : null);
  }

  /** The walkthrough, a first-time lesson about this very spot, or a nudge after a few idle seconds. */
  private shouldShow(): boolean {
    const w = this.w;
    if (!this.target) return false;
    const coach = w.coach;
    if (!coach || !coach.walkthroughDone) return true;
    if (this.reason === 'cash') return false;
    if (coach.teaching(this.target)) return true;
    return w.player.idleSeconds > IDLE_NUDGE;
  }

  private updatePointer(target: Vec2 | null): void {
    const pointer = this.pointer;
    pointer.visible = false;
    if (!target) return;
    const onScreen = this.w.stage.project(this.tmp.set(target.x, FLOOR_Y + 1, target.z), this.screen);
    const { width, height } = this.w.stage.size;
    // The pointer lives inside the play area: below the HUD bars, left of the side buttons.
    const left = POINTER_INSET.left;
    const right = width - POINTER_INSET.right;
    const top = POINTER_INSET.top;
    const bottom = height - POINTER_INSET.side;
    if (onScreen && this.screen.x > left && this.screen.x < right && this.screen.y > top && this.screen.y < bottom) return;
    const cx = width / 2;
    const cy = (top + bottom) / 2;
    let dx = this.screen.x - cx;
    let dy = this.screen.y - cy;
    if (!onScreen) {
      dx = -dx;
      dy = -dy;
    }
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = cos > 0 ? (right - cx) / cos : cos < 0 ? (left - cx) / cos : Infinity;
    const ry = sin > 0 ? (bottom - cy) / sin : sin < 0 ? (top - cy) / sin : Infinity;
    const r = Math.min(rx, ry);
    pointer.x = cx + cos * r;
    pointer.y = cy + sin * r;
    pointer.angle = angle;
    pointer.visible = true;
  }

  /** Where the guide is pointing now (null when it is not showing): the one focus on screen. */
  get focus(): Vec2 | null {
    return this.shown ? this.target : null;
  }

  /** The most useful next thing for the player to do (also drives the autopilot). */
  bestTarget(forBot = false): Vec2 | null {
    const target = this.pick(forBot);
    if (target || !forBot) return target;
    // A bot with nothing to do waits by the cheapest tile, like a player saving up.
    return this.w.tiles.cheapest()?.pos ?? null;
  }

  private pick(forBot = false): Vec2 | null {
    const target = this.choose(forBot);
    return target;
  }

  private because(reason: GuidanceReason, target: Vec2 | null): Vec2 | null {
    this.reason = target ? reason : 'none';
    return target;
  }

  private choose(forBot: boolean): Vec2 | null {
    const w = this.w;
    const player = w.player;
    const map = w.map;
    const stack = player.stack;

    if (w.journey.doorsOpen) {
      const boarding = w.guests.canBoard() && w.staff.count('porter') === 0;
      if (boarding && stack.isEmpty) return this.because('board', w.station.boardingPoint());
      if (!stack.isFull && w.demand.playerWants('luggage') > 0 && !stack.has('luggage')) return this.because('luggage', w.station.luggagePoint());
    }

    if (!stack.isEmpty) {
      const need = this.whereNeeded(stack.items);
      if (need) return this.because('deliver', need);
      // Only surplus in hand: point at the shelf it goes back to.
      const surplus = w.demand.firstSurplus(player);
      if (surplus) {
        const back = this.returnPoint(surplus);
        if (back) return this.because('return', back);
      }
    }

    const cash = w.wallet.get('cash');
    // A station upgrade you can afford is now or never (it leaves with the platform), while the desk queue and
    // the cash on the floor wait for the train to pull out: that one first.
    const now = w.tiles.stationBuy(cash);
    if (now) return this.because('tile', now.pos);

    const pile = w.cash.nearestWithCash(player.pos);
    if (pile && pile.value >= 1) return this.because('cash', { x: pile.x, z: pile.z });

    if (w.guests.deskReady() && w.staff.count('porter') === 0) return this.because('desk', map.anchor(0, 'deskService'));

    const tile = w.tiles.cheapest();
    if (tile && w.unlocks.remaining(tile.def.id) <= cash) return this.because('tile', tile.pos);

    const request = w.guests.openRequests().find((g) => !w.staff.isHandled(g));
    // A turndown or a wake-up call: straight to the room, nothing to fetch.
    if (request && isDwellNeed(request.request) && request.cabin) return this.because('deliver', request.cabin.center);
    if (request && request.request && request.request !== 'bathroom' && !isDwellNeed(request.request)) {
      const source = this.sourceFor(request.request, request.cabin?.carriage ?? 0);
      if (source) return this.because('fetch', source);
    }

    // The venues' guests waiting for their order, the café queue, the dome's rope, a dining table to clear.
    const job = w.venues.playerJob(player.pos);
    if (job) return this.because(job.reason, job.target);

    // A used room to tidy: its pad.
    const dirty = w.train.cabins.find((c) => c.unlocked && c.isDirty && !c.guest && !c.cleaner);
    if (dirty) return this.because('clean', dirty.spots[0] ?? dirty.center);

    if (!stack.isFull) {
      for (const kind of ['towel', 'roll'] as const) {
        const source = w.demand.playerWants(kind) > 0 ? w.train.supplySource(kind, w.player.pos) : null;
        if (source) return this.because('fetch', source);
      }
    }

    if (tile && (forBot || w.player.idleSeconds > IDLE_BEFORE_HINT * 2)) return this.because('save', tile.pos);
    return this.because('none', null);
  }

  private whereNeeded(items: ItemKind[]): Vec2 | null {
    const w = this.w;
    for (const guest of w.guests.openRequests()) {
      if (guest.request && guest.request !== 'bathroom' && !isDwellNeed(guest.request) && items.includes(guest.request) && guest.cabin) return guest.cabin.center;
    }
    const venue = w.venues.deliverPoint(items, w.player.pos);
    if (venue) return venue;
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

  private returnPoint(item: ItemKind): Vec2 | null {
    const w = this.w;
    const map = w.map;
    if (item === 'towel' || item === 'roll') return w.train.supplySource(item, w.player.pos);
    const name = sourceAnchorFor(item);
    if (name === 'urn' || name === 'linen') return this.nearestAnchor(name);
    const supply = w.train.indexOfType('supply');
    if (item === 'crate' && supply !== null) return map.anchor(supply, 'crateDrop');
    return map.hasAnchor(0, 'bin') ? map.anchor(0, 'bin') : null;
  }

  /** The nearest anchor of this name in any carriage (a linen cupboard, a service counter). */
  private nearestAnchor(name: string): Vec2 | null {
    const w = this.w;
    const map = w.map;
    let best: Vec2 | null = null;
    for (let i = 0; i < map.count; i++) {
      if (!map.hasAnchor(i, name)) continue;
      const a = map.anchor(i, name);
      if (!best || Math.abs(a.z - w.player.pos.z) < Math.abs(best.z - w.player.pos.z)) best = a;
    }
    return best;
  }

  private sourceFor(item: ItemKind, carriage: number): Vec2 | null {
    const map = this.w.map;
    const name = sourceAnchorFor(item);
    if (map.hasAnchor(carriage, name)) return map.anchor(carriage, name);
    return map.hasAnchor(0, name) ? map.anchor(0, name) : null;
  }
}
