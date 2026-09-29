import { COACH_GESTURE_DELAY, COACH_GUIDANCE_LINES, COACH_HINT_MIN_SECONDS, COACH_HINT_SECONDS, COACH_HINTS, COACH_STEPS, type CoachLineDef } from '../config/coach';
import type { Vec2 } from '../core/types';
import type { World } from './World';

const THINK_SECONDS = 0.3;
/** Walking this far from the spawn point completes the first step. */
const WALK_METRES = 1.2;

/** Where a coach line is shown: over a spot in the world, by a HUD element, or as the walk gesture. */
export type CoachAnchor = { world: Vec2 } | { hud: 'map' | 'conductor' } | { gesture: true };

export interface CoachLine extends CoachLineDef {
  anchor: CoachAnchor;
}

/**
 * A very small walkthrough: four steps teach the loop (walk, check in, collect, build), then each new
 * mechanic gets one line the first time it appears. Every line sits where the action is, never across the
 * screen, and the guidance arrow bounces over the same spot.
 */
export class Coach {
  current: CoachLine | null = null;
  private shown = 0;
  private think = 0;
  private readonly spawn: Vec2;
  enabled = true;

  constructor(private readonly w: World) {
    this.spawn = { ...w.player.pos };
  }

  private done(id: string): boolean {
    return this.w.flag(`coach_${id}`);
  }

  private finish(id: string): void {
    this.w.setFlag(`coach_${id}`);
  }

  update(dt: number): void {
    this.shown += dt;
    this.think -= dt;
    // Keep world anchors fresh every frame (targets move: guests, cash piles).
    if (this.current && 'world' in this.current.anchor) {
      const target = this.current.id.startsWith('g_') ? this.w.guidance.bestTarget() : null;
      const anchor = target ? { world: target } : this.targetFor(this.current.id);
      if (anchor && 'world' in anchor) this.current.anchor = anchor;
    }
    if (this.think > 0) return;
    this.think = THINK_SECONDS;
    if (!this.enabled || this.w.journey.phase === 'arriving') {
      this.current = null;
      return;
    }

    for (const step of COACH_STEPS) {
      if (this.done(step.id)) continue;
      if (this.stepComplete(step.id)) {
        this.finish(step.id);
        continue;
      }
      // Building needs cash: until there is enough, say what the arrow points at instead.
      if (step.id === 'tile' && !this.canAffordTile()) {
        const line = COACH_GUIDANCE_LINES[this.w.guidance.reason];
        const target = this.w.guidance.bestTarget();
        if (line && target) {
          this.show(line, { world: target });
          return;
        }
      }
      const anchor = this.targetFor(step.id);
      this.show(step, anchor);
      return;
    }

    const cur = this.current;
    if (cur && !COACH_STEPS.some((s) => s.id === cur.id)) {
      const resolved = !this.hintActive(cur.id);
      if (this.shown < COACH_HINT_SECONDS && !(resolved && this.shown > COACH_HINT_MIN_SECONDS)) return;
      this.finish(cur.id);
      this.current = null;
    } else if (cur) {
      this.current = null;
    }
    for (const hint of COACH_HINTS) {
      if (this.done(hint.id) || !this.hintActive(hint.id)) continue;
      const anchor = this.targetFor(hint.id);
      if (!anchor) continue;
      this.show(hint, anchor);
      return;
    }
  }

  private canAffordTile(): boolean {
    const tile = this.w.tiles.cheapest();
    return !!tile && this.w.unlocks.remaining(tile.def.id) <= this.w.wallet.get('cash');
  }

  private show(line: CoachLineDef, anchor: CoachAnchor | null): void {
    if (!anchor) {
      this.current = null;
      return;
    }
    if (this.current?.id !== line.id) this.shown = 0;
    this.current = { ...line, anchor };
  }

  private stepComplete(id: string): boolean {
    const w = this.w;
    const ftue = w.data.profile.ftue;
    switch (id) {
      case 'walk':
        return Math.hypot(w.player.pos.x - this.spawn.x, w.player.pos.z - this.spawn.z) > WALK_METRES || ftue.first_checkin !== undefined;
      case 'checkin':
        return ftue.first_checkin !== undefined;
      case 'cash':
        return ftue.first_cash !== undefined;
      case 'tile':
        return ftue.first_unlock !== undefined;
      default:
        return true;
    }
  }

  /** Where each line points. Null hides it for now (nothing to point at yet). */
  private targetFor(id: string): CoachAnchor | null {
    const w = this.w;
    const world = (p: Vec2 | null | undefined): CoachAnchor | null => (p ? { world: p } : null);
    switch (id) {
      case 'walk':
        return w.player.idleSeconds > COACH_GESTURE_DELAY ? { gesture: true } : null;
      case 'checkin':
        return world(w.map.anchor(0, 'deskService'));
      case 'cash': {
        const pile = w.cash.nearestWithCash(w.player.pos);
        return pile && pile.value >= 1 ? world({ x: pile.x, z: pile.z }) : null;
      }
      case 'tile':
        return world(w.tiles.cheapest()?.pos);
      case 'request': {
        const guest = w.guests.openRequests().find((g) => !w.staff.isHandled(g));
        return world(guest?.cabin?.center);
      }
      case 'dirty': {
        const cabin = w.train.cabins.find((c) => c.isDirty && !c.guest && !c.cleaner);
        return world(cabin ? cabin.spots[cabin.dirty.findIndex(Boolean)] : null);
      }
      case 'station':
        return world(w.station.boardingPoint());
      case 'hire':
        return world(w.tiles.list.find((t) => t.def.kind === 'hire')?.pos);
      case 'couple':
        return world(w.tiles.list.find((t) => t.def.kind === 'couple')?.pos);
      case 'refurb':
        return world(w.tiles.list.find((t) => t.def.kind === 'refurb')?.pos);
      case 'workshop':
        return world(w.tiles.list.find((t) => (t.def.kind === 'exterior' || t.def.kind === 'marketing') && t.view.group.visible)?.pos);
      case 'washroom':
        return world(w.train.supplySource('towel', w.player.pos));
      case 'map':
        return { hud: 'map' };
      case 'miles':
        return { hud: 'conductor' };
      default:
        return null;
    }
  }

  private hintActive(id: string): boolean {
    const w = this.w;
    switch (id) {
      case 'request':
        return w.guests.openRequests().some((g) => g.request && g.request !== 'bathroom' && !w.staff.isHandled(g));
      case 'dirty':
        return w.train.cabins.some((c) => c.isDirty && !c.guest && !c.cleaner);
      case 'station':
        return w.journey.phase === 'stationStop' && w.guests.canBoard();
      case 'hire':
        return w.tiles.list.some((t) => t.def.kind === 'hire');
      case 'couple':
        return w.tiles.list.some((t) => t.def.kind === 'couple');
      case 'refurb':
        return w.tiles.list.some((t) => t.def.kind === 'refurb');
      case 'workshop':
        return w.journey.phase === 'stationStop' && !w.guests.canBoard() && w.tiles.list.some((t) => (t.def.kind === 'exterior' || t.def.kind === 'marketing') && t.view.group.visible);
      case 'washroom':
        return w.train.hasSupply('towel') && w.train.bathrooms.some((b) => b.unlocked && !b.stocked);
      case 'map':
        return w.train.count >= 3;
      case 'miles':
        return w.progression.isFeatureUnlocked('conductorUpgrades') && w.wallet.get('railMiles') > 0;
      default:
        return false;
    }
  }
}
