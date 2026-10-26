import type * as THREE from 'three';
import type { IconName } from '../ui/icons';
import { JobMarker, markWorldUi } from '../world/ZoneViews';
import type { Actor } from './Actor';

/**
 * What kind of job a zone is: work (tidy, sell tickets, start the film), pick up (an urn, a shelf, a stand), drop
 * off (a rack, a washroom's shelf, a guest waiting for it). Every job zone reaches past its spot (session 26) and
 * shows its job as a badge over the thing it is about (session 27: nothing is drawn on the floor).
 */
export type ZoneKind = 'work' | 'pickup' | 'drop';

/** How far over the top of the furniture a job's badge hangs (metres). */
const ICON_OVER_FURNITURE = 0.5;
/** The no-wall test toward a job's furniture stops this short of its centre (metres). */
const BADGE_LINE_SHORT = 0.4;

export interface ZoneOptions {
  id: string;
  x: number;
  z: number;
  radius: number;
  icon?: IconName | null;
  player?: boolean;
  staff?: boolean;
  /** Show the job's badge (default). Cash piles and tiles have their own visuals. */
  marker?: boolean;
  /** The kind of job (a job zone reaches past its spot). */
  kind?: ZoneKind;
  /** Whether the zone can do anything right now; an inactive zone shows nothing. */
  active?: () => boolean;
  /**
   * Session 27 (owner: "you clean a room simply by standing close to it… I don't want designated spots"): anywhere in
   * here counts as at the job too (a room to tidy, a guest's room to bring their request to, a washroom to restock).
   */
  area?: (x: number, z: number) => boolean;
  /** Session 38: where the badge hangs, when it is set by hand (the middle of the reception desk) instead of found. */
  badgeAt?: { x: number; z: number; height: number };
  /** Draw attention: the player is needed here right now (a shelf with something someone asked for). */
  highlight?: () => boolean;
  /**
   * When the badge shows (default: whenever the zone is active, or wanted if it has `highlight`). A job that can be
   * waiting in many rooms at once (a room to tidy) shows its badge only where it matters, so the train is never a
   * field of signs.
   */
  showIcon?: () => boolean;
  /** The icon for the job here right now, when it changes. */
  iconFor?: () => IconName;
  /** Called every frame for each actor standing inside. Return true while real work happens. */
  stay: (zone: Zone, actor: Actor, dt: number) => boolean;
  enter?: (zone: Zone, actor: Actor) => void;
  leave?: (zone: Zone, actor: Actor) => void;
  /** Lower wins when zones overlap. */
  priority?: number;
  /**
   * Session 26: whether this zone reaches past its spot (a job zone: on by default for any zone with a `kind`; off
   * for unlock tiles, which must be stood on, since they spend money).
   */
  reach?: boolean;
}

/** Where a job's badge hangs: over the furniture it serves (world x, z and the top's height). */
export type IconAnchor = (x: number, z: number) => { x: number; z: number; height: number } | null;

export class Zone {
  readonly id: string;
  x: number;
  z: number;
  readonly radius: number;
  readonly player: boolean;
  readonly staff: boolean;
  readonly marker: JobMarker | null;
  readonly priority: number;
  /** A job zone that reaches past its spot (session 26). */
  readonly reaches: boolean;
  /**
   * The floor under the job's badge (the furniture it serves, found by the zone system's anchor): standing near it
   * counts as at the job (session 27). The zone's own spot until the badge has been placed.
   */
  ax = 0;
  az = 0;
  private anchored = false;
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
    this.ax = opts.x;
    this.az = opts.z;
    this.marker = opts.marker === false || !opts.icon ? null : new JobMarker(opts.icon);
    this.marker?.setPosition(opts.x, opts.z);
  }

  /** Anywhere in the zone's area (a room) counts as at the job. */
  inArea(x: number, z: number): boolean {
    return !!this.opts.area && this.opts.area(x, z);
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
    this.anchored = false;
    this.ax = x;
    this.az = z;
    this.marker?.setPosition(x, z);
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
    const active = this.isActive();
    const lit = active && !!this.opts.highlight?.();
    // The badge shows only while the job wants you now (lit, or simply active for a job with no notion of "wanted").
    const iconShown = this.enabled && (this.opts.highlight ? lit : active) && (!this.opts.showIcon || this.opts.showIcon());
    // Each time the badge comes up it finds the furniture it belongs over (a refit may have moved it); the floor
    // under it is where standing counts as at the job.
    if ((anchor || this.opts.badgeAt) && (!this.anchored || (iconShown && !this.iconWasShown))) {
      this.anchored = true;
      const a = this.opts.badgeAt ?? anchor?.(this.x, this.z) ?? null;
      this.ax = a ? a.x : this.x;
      this.az = a ? a.z : this.z;
      this.marker?.setIconAnchor(this.ax - this.x, this.az - this.z, a ? a.height + ICON_OVER_FURNITURE : null);
    }
    this.iconWasShown = iconShown;
    const marker = this.marker;
    if (!marker) return;
    marker.visible = this.enabled;
    marker.highlight = lit;
    marker.iconShown = iconShown;
    if (this.opts.iconFor && active) {
      const name = this.opts.iconFor();
      if (name !== this.iconName) {
        this.iconName = name;
        marker.setIcon(name);
      }
    }
    marker.progress = this.progress;
    marker.working = this.playerInside && active;
    marker.update(dt);
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
   * stand in that specific box… especially with shoe shine"): a job zone counts you this many times its radius from
   * its spot, as long as nothing but low furniture stands between (`reachClear`; walls never). Config: `zones.reach`.
   */
  reach = 1;
  /**
   * Session 27 (owner: "players should be able to stand on or near the hover indicator"): within this many metres of
   * the floor under a job's badge counts too, on the same terms. Config: `zones.badgeReach`.
   */
  badgeReach = 0;
  reachClear: (ax: number, az: number, bx: number, bz: number) => boolean = () => true;
  /** Where a job's badge hangs (over the furniture it serves). */
  anchor: IconAnchor | undefined;
  /**
   * Session 29: the conductor's work on a job zone moved its ring from `before` to `after` (the game plays a gentle
   * soft tick each quarter, so every job sounds the same way as it fills).
   */
  onPlayerWork: ((zone: Zone, before: number, after: number) => void) | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  add(zone: Zone): Zone {
    this.zones.push(zone);
    if (zone.marker) {
      markWorldUi(zone.marker.group);
      this.scene.add(zone.marker.group);
    }
    return zone;
  }

  remove(zone: Zone | null | undefined): void {
    if (!zone) return;
    const i = this.zones.indexOf(zone);
    if (i >= 0) this.zones.splice(i, 1);
    if (zone.marker) this.scene.remove(zone.marker.group);
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
      const x = actor.pos.x;
      const z = actor.pos.z;
      for (const zone of this.zones) {
        if (!zone.enabled) continue;
        if (actor.isPlayer ? !zone.player : !zone.staff) continue;
        const dSpot = (zone.x - x) ** 2 + (zone.z - z) ** 2;
        const dBadge = (zone.ax - x) ** 2 + (zone.az - z) ** 2;
        // On the spot always counts. A job zone also counts you near its spot or near the floor under its badge (never
        // through a wall), or anywhere in its room.
        const onSpot = dSpot <= zone.radius * zone.radius;
        const nearSpot = zone.reaches && dSpot <= (zone.radius * this.reach) ** 2;
        const nearBadge = zone.reaches && dBadge <= this.badgeReach * this.badgeReach;
        const inArea = zone.reaches && zone.inArea(x, z);
        if (!onSpot && !nearSpot && !nearBadge && !inArea) continue;
        if (!zone.isActive()) continue;
        if (!onSpot && !inArea && !(nearSpot && this.reachClear(x, z, zone.x, zone.z)) && !(nearBadge && this.badgeClear(x, z, zone, dBadge))) continue;
        const d = Math.min(dSpot, dBadge);
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
        const before = best.progress;
        const working = best.stay(actor, dt);
        if (actor.isPlayer && working) {
          this.playerWorking = true;
          if (best.reaches) this.onPlayerWork?.(best, before, best.progress);
        }
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

  /**
   * No wall between the actor and the thing a job's badge floats over. The line stops short of the thing itself: its
   * centre stands in the furniture, often against a wall and outside the floor the line is tested on.
   */
  private badgeClear(x: number, z: number, zone: Zone, d2: number): boolean {
    const d = Math.sqrt(d2);
    if (d <= BADGE_LINE_SHORT) return true;
    const t = BADGE_LINE_SHORT / d;
    return this.reachClear(x, z, zone.ax + (x - zone.ax) * t, zone.az + (z - zone.az) * t);
  }

  zoneOf(actor: Actor): Zone | null {
    return this.current.get(actor) ?? null;
  }
}
