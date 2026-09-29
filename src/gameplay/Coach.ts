import { COACH_GESTURE_DELAY, COACH_GUIDANCE_LINES, COACH_HINTS, COACH_OPTIONAL_SECONDS, COACH_REST_SECONDS, COACH_STEPS, type CoachLineDef } from '../config/coach';
import type { StaffRole, Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

const THINK_SECONDS = 0.25;
/** Walking this far from the spawn point completes the first step. */
const WALK_METRES = 1.2;
/** Height of the "Nice!" over a finished step. */
const PRAISE_HEIGHT = 1.9;

/** Where a coach line is shown: over a spot in the world, by a HUD element, or as the walk gesture. */
export type CoachAnchor = { world: Vec2 } | { hud: 'map' | 'conductor' } | { gesture: true };

export interface CoachLine extends CoachLineDef {
  anchor: CoachAnchor;
}

/** Lessons that retire once the job is automated (nobody needs teaching a chore the staff now do). */
const AUTOMATED_BY: Record<string, StaffRole> = { dirty: 'attendant', station: 'porter', washroom: 'attendant' };
/** Lessons about conveniences: they retire after a while on screen even if unused. */
const OPTIONAL = new Set(['map', 'miles']);

/**
 * A walkthrough that moves at the player's pace: four steps teach the loop (walk, check in, collect,
 * build), then each mechanic gets a lesson the first time it appears. A step or lesson only completes
 * when the player does it, then gets a "Nice!" and a short rest before the next line. Every line sits
 * where the action is, and the guidance arrow bounces over the same spot.
 */
export class Coach {
  current: CoachLine | null = null;
  private shown = 0;
  private think = 0;
  private rest = 0;
  private readonly spawn: Vec2;
  enabled = true;

  constructor(private readonly w: World) {
    this.spawn = { ...w.player.pos };
    // Doing the thing is what completes a lesson.
    const e = w.events;
    e.on('request.fulfilled', ({ byPlayer }) => byPlayer && this.learn('request'));
    e.on('spot.cleaned', ({ byPlayer }) => byPlayer && this.learn('dirty'));
    e.on('guest.boarded', ({ byPlayer }) => byPlayer && this.learn('station'));
    e.on('bathroom.restocked', ({ byPlayer }) => byPlayer && this.learn('washroom'));
    e.on('staff.hired', () => this.learn('hire'));
    e.on('carriage.coupled', () => this.learn('couple'));
    e.on('carriage.refurbished', () => this.learn('refurb'));
    e.on('conductor.upgraded', () => this.learn('miles'));
    e.on('unlock.completed', ({ id }) => id.startsWith('st.') && this.learn('workshop'));
  }

  private done(id: string): boolean {
    return this.w.flag(`coach_${id}`);
  }

  private finish(id: string): void {
    this.w.setFlag(`coach_${id}`);
  }

  /** The player did it: praise it where it happened, then rest before the next line. */
  learn(id: string): void {
    if (this.done(id)) return;
    this.finish(id);
    const cur = this.current;
    if (!cur || !(cur.id === id || cur.id.startsWith(`${id}_`))) return;
    this.praise(cur);
  }

  private praise(line: CoachLine): void {
    const w = this.w;
    const at = 'world' in line.anchor ? line.anchor.world : w.player.pos;
    w.ui.floatText('Nice!', at.x, FLOOR_Y + PRAISE_HEIGHT, at.z, 'info');
    w.audio.play('ding', { volume: 0.6 });
    this.current = null;
    this.rest = COACH_REST_SECONDS;
  }

  /** The walkthrough is finished once the four loop steps are done. */
  get walkthroughDone(): boolean {
    return COACH_STEPS.every((s) => this.done(s.id));
  }

  update(dt: number): void {
    this.shown += dt;
    this.think -= dt;
    this.rest -= dt;
    // Keep world anchors fresh every frame (targets move: guests, cash piles).
    if (this.current && 'world' in this.current.anchor) {
      const anchor = this.anchorFor(this.current.id);
      if (anchor && 'world' in anchor) this.current.anchor = anchor;
    }
    if (this.think > 0) return;
    this.think = THINK_SECONDS;
    if (!this.enabled || this.w.journey.phase === 'arriving') {
      this.current = null;
      return;
    }
    // A breath after each success.
    if (this.rest > 0) return;

    for (const step of COACH_STEPS) {
      if (this.done(step.id)) continue;
      if (this.stepComplete(step.id)) {
        this.finish(step.id);
        if (this.current?.id === step.id || this.current?.id.startsWith('g_')) {
          this.praise(this.current);
          return;
        }
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
      this.show(step, this.targetFor(step.id));
      return;
    }

    // One lesson at a time, in order, for whichever mechanic is in play right now.
    for (const hint of COACH_HINTS) {
      if (hint.id.includes('_') || this.done(hint.id)) continue;
      const role = AUTOMATED_BY[hint.id];
      if (role && this.w.staff.count(role) > 0) {
        this.finish(hint.id);
        continue;
      }
      if (OPTIONAL.has(hint.id) && this.current?.id === hint.id && this.shown > COACH_OPTIONAL_SECONDS) {
        this.finish(hint.id);
        this.current = null;
        continue;
      }
      if (!this.hintActive(hint.id)) continue;
      const line = hint.id === 'request' ? this.requestStage() : hint;
      const anchor = this.anchorFor(line.id);
      if (!anchor) continue;
      this.show(line, anchor);
      return;
    }
    this.current = null;
  }

  /** Requests are taught in two parts: where to pick the item up, then where to take it. */
  private requestStage(): CoachLineDef {
    const reason = this.w.guidance.reason;
    const find = (id: string): CoachLineDef => COACH_HINTS.find((h) => h.id === id) ?? COACH_HINTS[0];
    if (reason === 'fetch') return find('request_fetch');
    if (reason === 'deliver') return find('request_deliver');
    return find('request');
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

  private anchorFor(id: string): CoachAnchor | null {
    // Guidance lines and the two request stages follow the guidance arrow's target.
    if (id.startsWith('g_') || id === 'request_fetch' || id === 'request_deliver') {
      const target = this.w.guidance.bestTarget();
      return target ? { world: target } : null;
    }
    return this.targetFor(id);
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
