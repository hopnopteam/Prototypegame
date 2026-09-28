import type * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { ZoneRing } from '../world/ZoneViews';
import type { Actor } from './Actor';

export interface ZoneOptions {
  id: string;
  x: number;
  z: number;
  radius: number;
  icon?: IconName | null;
  player?: boolean;
  staff?: boolean;
  /** Draw a floor ring. Cash piles and tiles have their own visuals. */
  ring?: boolean;
  color?: string;
  /** Whether the zone can do anything right now; inactive zones dim or hide. */
  active?: () => boolean;
  /** Hide the ring completely while inactive (instead of dimming it). */
  hideWhenInactive?: boolean;
  /** Draw attention: the player is needed here right now (a shelf with something someone asked for). */
  highlight?: () => boolean;
  /** Called every frame for each actor standing inside. Return true while real work happens. */
  stay: (zone: Zone, actor: Actor, dt: number) => boolean;
  enter?: (zone: Zone, actor: Actor) => void;
  leave?: (zone: Zone, actor: Actor) => void;
  /** Lower wins when zones overlap. */
  priority?: number;
}

export class Zone {
  readonly id: string;
  x: number;
  z: number;
  readonly radius: number;
  readonly player: boolean;
  readonly staff: boolean;
  readonly ring: ZoneRing | null;
  readonly priority: number;
  progress = 0;
  /** Seconds accumulated since an actor settled in (dwell before the first action). */
  timer = 0;
  /** Countdown to the next repeated action (one item per interval). */
  repeat = 0;
  /** Set by the zone system: an actor stood here this frame. */
  occupied = false;
  playerInside = false;
  enabled = true;
  private readonly opts: ZoneOptions;

  constructor(opts: ZoneOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.x = opts.x;
    this.z = opts.z;
    this.radius = opts.radius;
    this.player = opts.player ?? true;
    this.staff = opts.staff ?? true;
    this.priority = opts.priority ?? 0;
    this.ring = opts.ring === false ? null : new ZoneRing(opts.radius, opts.icon ?? null, opts.color);
    this.ring?.setPosition(opts.x, opts.z);
  }

  isActive(): boolean {
    return this.enabled && (this.opts.active ? this.opts.active() : true);
  }

  contains(x: number, z: number): boolean {
    const dx = x - this.x;
    const dz = z - this.z;
    return dx * dx + dz * dz <= this.radius * this.radius;
  }

  moveTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.ring?.setPosition(x, z);
  }

  stay(actor: Actor, dt: number): boolean {
    return this.opts.stay(this, actor, dt);
  }

  enter(actor: Actor): void {
    this.opts.enter?.(this, actor);
  }

  leave(actor: Actor): void {
    this.opts.leave?.(this, actor);
  }

  updateVisual(dt: number): void {
    if (!this.ring) return;
    const active = this.isActive();
    this.ring.visible = this.enabled && (active || !this.opts.hideWhenInactive);
    this.ring.dimmed = !active;
    this.ring.highlight = active && !!this.opts.highlight?.();
    this.ring.progress = this.progress;
    this.ring.pulse = this.playerInside && active ? 1 : 0;
    this.ring.update(dt);
  }
}

/**
 * Walk-over interaction: each actor is in at most one zone (the nearest active one), which gets `stay`
 * calls every frame. Enter/leave callbacks fire on change. Tracks whether the player is mid-task, which
 * the ad policy uses to never interrupt work.
 */
export class ZoneSystem {
  readonly zones: Zone[] = [];
  private readonly current = new Map<Actor, Zone>();
  playerWorking = false;
  playerZone: Zone | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  add(zone: Zone): Zone {
    this.zones.push(zone);
    if (zone.ring) this.scene.add(zone.ring.group);
    return zone;
  }

  remove(zone: Zone | null | undefined): void {
    if (!zone) return;
    const i = this.zones.indexOf(zone);
    if (i >= 0) this.zones.splice(i, 1);
    if (zone.ring) this.scene.remove(zone.ring.group);
    for (const [actor, z] of this.current) {
      if (z === zone) this.current.delete(actor);
    }
  }

  get(id: string): Zone | undefined {
    return this.zones.find((z) => z.id === id);
  }

  update(dt: number, actors: readonly Actor[]): void {
    for (const zone of this.zones) {
      zone.occupied = false;
      zone.playerInside = false;
    }
    this.playerWorking = false;
    this.playerZone = null;

    for (const actor of actors) {
      let best: Zone | null = null;
      let bestScore = Infinity;
      for (const zone of this.zones) {
        if (!zone.enabled) continue;
        if (actor.isPlayer ? !zone.player : !zone.staff) continue;
        if (!zone.contains(actor.pos.x, actor.pos.z)) continue;
        if (!zone.isActive()) continue;
        const d = (zone.x - actor.pos.x) ** 2 + (zone.z - actor.pos.z) ** 2;
        const score = zone.priority * 100 + d;
        if (score < bestScore) {
          bestScore = score;
          best = zone;
        }
      }
      const previous = this.current.get(actor) ?? null;
      if (previous !== best) {
        if (previous) previous.leave(actor);
        if (best) best.enter(actor);
        if (best) this.current.set(actor, best);
        else this.current.delete(actor);
      }
      if (best) {
        best.occupied = true;
        if (actor.isPlayer) {
          best.playerInside = true;
          this.playerZone = best;
        }
        const working = best.stay(actor, dt);
        if (actor.isPlayer && working) this.playerWorking = true;
      }
    }

    for (const zone of this.zones) {
      // Unattended timed zones slowly lose progress instead of snapping back.
      if (!zone.occupied && zone.progress > 0) zone.progress = Math.max(0, zone.progress - dt * 0.8);
      if (!zone.occupied) {
        zone.timer = 0;
        zone.repeat = 0;
      }
      zone.updateVisual(dt);
    }
  }

  zoneOf(actor: Actor): Zone | null {
    return this.current.get(actor) ?? null;
  }
}
