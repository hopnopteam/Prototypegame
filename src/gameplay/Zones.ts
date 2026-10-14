import type * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { PALETTE } from '../world/palette';
import { markWorldUi, ZoneRing } from '../world/ZoneViews';
import type { Actor } from './Actor';

/**
 * What kind of job a pad is (session 24, My Perfect Hotel's pads): its colour says it, the white icon on it says
 * which job. Work (tidy, sell tickets, start the film), pick up (an urn, a shelf, a stand), drop off (a rack, a
 * washroom's shelf, a guest waiting for it).
 */
export type ZoneKind = 'work' | 'pickup' | 'drop';

/** How far over the top of the furniture a pad's floating icon hangs (metres). */
const ICON_OVER_FURNITURE = 0.5;

const KIND_COLOR: Record<ZoneKind, string> = {
  work: PALETTE.zoneWork,
  pickup: PALETTE.zonePickup,
  drop: PALETTE.zoneDrop,
};

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
  /** The kind of job, which colours the pad (an explicit `color` wins). */
  kind?: ZoneKind;
  color?: string;
  /** Whether the zone can do anything right now; inactive zones dim or hide. */
  active?: () => boolean;
  /** Hide the ring completely while inactive (instead of dimming it). */
  hideWhenInactive?: boolean;
  /** Draw attention: the player is needed here right now (a shelf with something someone asked for). */
  highlight?: () => boolean;
  /**
   * When the floating icon shows (default: whenever the ring does). A job that can be waiting in many rooms at
   * once (a room to tidy) shows its icon only where it matters, so the train is never a field of signs.
   */
  showIcon?: () => boolean;
  /** The icon for the job here right now, when it changes (a room's pad: the broom, then fresh bedding). */
  iconFor?: () => IconName;
  /** Called every frame for each actor standing inside. Return true while real work happens. */
  stay: (zone: Zone, actor: Actor, dt: number) => boolean;
  enter?: (zone: Zone, actor: Actor) => void;
  leave?: (zone: Zone, actor: Actor) => void;
  /** Lower wins when zones overlap. */
  priority?: number;
  /**
   * Session 26: whether this pad reaches further than its ring (a job pad: on by default for any pad with a `kind`;
   * off for unlock tiles, which must be stood on, since they spend money).
   */
  reach?: boolean;
}

/** Where a pad's floating icon hangs: over the furniture it serves (world x, z and the top's height). */
export type IconAnchor = (x: number, z: number) => { x: number; z: number; height: number } | null;

export class Zone {
  readonly id: string;
  x: number;
  z: number;
  readonly radius: number;
  readonly player: boolean;
  readonly staff: boolean;
  readonly ring: ZoneRing | null;
  readonly priority: number;
  /** A job pad that reaches further than its ring (session 26). */
  readonly reaches: boolean;
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
  private iconName: IconName | null;

  constructor(opts: ZoneOptions) {
    this.opts = opts;
    this.id = opts.id;
    this.x = opts.x;
    this.z = opts.z;
    this.radius = opts.radius;
    this.player = opts.player ?? true;
    this.staff = opts.staff ?? true;
    this.priority = opts.priority ?? 0;
    this.reaches = opts.reach ?? !!opts.kind;
    this.iconName = opts.icon ?? null;
    this.ring = opts.ring === false ? null : new ZoneRing(opts.radius, opts.icon ?? null, opts.color ?? (opts.kind ? KIND_COLOR[opts.kind] : undefined));
    this.ring?.setPosition(opts.x, opts.z);
  }

  isActive(): boolean {
    return this.enabled && (this.opts.active ? this.opts.active() : true);
  }

  contains(x: number, z: number, scale = 1): boolean {
    const dx = x - this.x;
    const dz = z - this.z;
    const r = this.radius * scale;
    return dx * dx + dz * dz <= r * r;
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

  private iconWasShown = false;

  updateVisual(dt: number, anchor?: IconAnchor): void {
    if (!this.ring) return;
    const active = this.isActive();
    this.ring.visible = this.enabled && (active || !this.opts.hideWhenInactive);
    this.ring.dimmed = !active;
    const lit = active && !!this.opts.highlight?.();
    this.ring.highlight = lit;
    // Session 24: the icon floats only over a pad that wants you now (lit, or simply active for a pad with no
    // notion of "wanted"); the rest of the time the icon printed on the pad says what it is.
    const iconShown = (this.opts.highlight ? lit : active) && (!this.opts.showIcon || this.opts.showIcon());
    // Each time the icon comes up it finds the furniture it belongs over (a refit may have moved it).
    if (iconShown && !this.iconWasShown && anchor) {
      const a = anchor(this.x, this.z);
      this.ring.setIconAnchor(a ? a.x - this.x : 0, a ? a.z - this.z : 0, a ? a.height + ICON_OVER_FURNITURE : null);
    }
    this.iconWasShown = iconShown;
    this.ring.iconShown = iconShown;
    if (this.opts.iconFor && active) {
      const name = this.opts.iconFor();
      if (name !== this.iconName) {
        this.iconName = name;
        this.ring.setIcon(name);
      }
    }
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
  /**
   * Session 26 (owner: "when you reach that place it does the thing, so the player doesn't have to fiddle around and
   * stand in that specific box… especially with shoe shine"): a job pad counts you this many times its ring's radius
   * away, as long as nothing but low furniture stands between (`reachClear`; walls never). Config: `zones.reach`.
   */
  reach = 1;
  reachClear: (ax: number, az: number, bx: number, bz: number) => boolean = () => true;
  /** Where a pad's floating icon hangs (over the furniture it serves). */
  anchor: IconAnchor | undefined;

  constructor(private readonly scene: THREE.Scene) {}

  add(zone: Zone): Zone {
    this.zones.push(zone);
    if (zone.ring) {
      markWorldUi(zone.ring.group);
      this.scene.add(zone.ring.group);
    }
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
        // On the ring always counts; a job pad also reaches further, never through a wall.
        const onRing = zone.contains(actor.pos.x, actor.pos.z);
        if (!onRing && !(zone.reaches && this.reach > 1 && zone.contains(actor.pos.x, actor.pos.z, this.reach))) continue;
        if (!zone.isActive()) continue;
        if (!onRing && !this.reachClear(actor.pos.x, actor.pos.z, zone.x, zone.z)) continue;
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
      zone.updateVisual(dt, this.anchor);
    }
  }

  zoneOf(actor: Actor): Zone | null {
    return this.current.get(actor) ?? null;
  }
}
