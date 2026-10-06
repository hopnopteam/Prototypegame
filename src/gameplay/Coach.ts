import { COACH_GESTURE_DELAY, COACH_GUIDANCE_LINES, COACH_HINTS, COACH_OPTIONAL_SECONDS, COACH_REST_SECONDS, COACH_LESSON_GAP_SECONDS, COACH_STEPS, type CoachLineDef } from '../config/coach';
import { classStartingAt, isPassengerType } from '../config/classes';
import type { StaffRole, Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

const THINK_SECONDS = 0.25;
/** Walking this far from the spawn point completes the first step. */
const WALK_METRES = 1.2;
/** Height of the tick over a finished step. */
const PRAISE_HEIGHT = 1.9;
/** A lesson's spot and the guide arrow's target count as the same place within this distance (metres). */
const AGREE_METRES = 1.2;

/** Where a coach line is shown: over a spot in the world, by a HUD element, or as the walk gesture. */
export type CoachAnchor = { world: Vec2 } | { hud: 'map' | 'conductor' } | { gesture: true };

export interface CoachLine extends CoachLineDef {
  anchor: CoachAnchor;
}

/** Lessons that retire once the job is automated (nobody needs teaching a chore the staff now do). */
const AUTOMATED_BY: Record<string, StaffRole> = {
  dirty: 'attendant', station: 'porter', washroom: 'attendant',
  cafe: 'barista', dining: 'waiter', clear: 'waiter', bar: 'bartender', dome: 'host',
};
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
    e.on('cabin.cleaned', ({ byPlayer }) => byPlayer && this.learn('dirty'));
    e.on('guest.boarded', ({ byPlayer }) => byPlayer && this.learn('station'));
    e.on('bathroom.restocked', ({ byPlayer }) => byPlayer && this.learn('washroom'));
    e.on('staff.hired', () => this.learn('hire'));
    e.on('carriage.coupled', () => this.learn('couple'));
    e.on('carriage.refurbished', () => this.learn('refurb'));
    e.on('carriage.classUp', () => this.learn('class'));
    e.on('request.fulfilled', ({ item, byPlayer }) => byPlayer && item === 'turndown' && this.learn('turndown'));
    e.on('conductor.upgraded', () => this.learn('miles'));
    e.on('unlock.completed', ({ id }) => id.startsWith('st.') && this.learn('workshop'));
    e.on('venue.served', ({ kind, byPlayer }) => byPlayer && this.learn(kind));
    e.on('venue.cleared', ({ byPlayer }) => byPlayer && this.learn('clear'));
  }

  private done(id: string): boolean {
    return this.w.flag(`coach_${id}`);
  }

  private finish(id: string): void {
    this.w.setFlag(`coach_${id}`);
  }

  /** The player did it: a tick where it happened, then a rest before the next line. */
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
    w.ui.floatIcon('check', at.x, FLOOR_Y + PRAISE_HEIGHT, at.z, 'info');
    w.audio.play('ding', { volume: 0.6 });
    this.current = null;
    this.rest = this.walkthroughDone ? COACH_LESSON_GAP_SECONDS : COACH_REST_SECONDS;
  }

  /**
   * A first-time lesson is up about this spot (session 20: after the walkthrough the guide arrow shows only to
   * teach something the first time, or as a nudge when the player stands idle).
   */
  teaching(spot: { x: number; z: number }): boolean {
    const cur = this.current;
    if (!cur || !('world' in cur.anchor)) return false;
    return Math.hypot(cur.anchor.world.x - spot.x, cur.anchor.world.z - spot.z) < AGREE_METRES;
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
      const line = hint.id === 'request' ? this.requestStage() : hint.id === 'dirty' ? this.turnaroundStage() : hint;
      const anchor = this.anchorFor(line.id);
      if (!anchor || !this.agrees(anchor)) continue;
      this.show(line, anchor);
      return;
    }
    this.current = null;
  }

  /**
   * One pointer at a time (session 16, owner: "so many pointers and things being pointed at once"): a lesson
   * about a spot shows only while the guide arrow points there too (or the arrow is resting), so the label and
   * the arrow are always one instruction. A lesson whose spot is not the next thing to do waits its turn.
   */
  private agrees(anchor: CoachAnchor): boolean {
    if (!('world' in anchor)) return true;
    const focus = this.w.guidance.focus;
    return !focus || Math.hypot(focus.x - anchor.world.x, focus.z - anchor.world.z) < AGREE_METRES;
  }

  /** Requests are taught in two parts: where to pick the item up, then where to take it. */
  private requestStage(): CoachLineDef {
    const reason = this.w.guidance.reason;
    const find = (id: string): CoachLineDef => COACH_HINTS.find((h) => h.id === id) ?? COACH_HINTS[0];
    if (reason === 'fetch') return find('request_fetch');
    if (reason === 'deliver') return find('request_deliver');
    return find('request');
  }

  /** Turning a room around is taught step by step: strip it, laundry to the cupboard, a fresh set, make the bed. */
  private turnaroundStage(): CoachLineDef {
    const w = this.w;
    const find = (id: string): CoachLineDef => COACH_HINTS.find((h) => h.id === id) ?? COACH_HINTS[0];
    const stack = w.player.stack;
    if (stack.has('laundry')) return find('dirty_laundry');
    if (w.guidance.reason === 'fetch') return find('dirty_linen');
    if (stack.has('bedding') && (w.guidance.reason === 'clean' || w.guidance.reason === 'deliver')) return find('dirty_make');
    return find('dirty');
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
      case 'tickets':
        return w.station.prologueTicketsDone || !w.station.prologue || ftue.first_checkin !== undefined;
      case 'bed':
        // The first bed made up (the opening's bare bed), or a returning game with nothing bare to make.
        return ftue.first_clean !== undefined || !w.train.cabins.some((c) => c.unlocked && !c.made && !c.guest);
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
    if (id.startsWith('g_') || id === 'request_fetch' || id === 'request_deliver' || id.startsWith('dirty_')) {
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
      case 'tickets':
        return world(w.station.boardingPoint());
      case 'bed':
        return world(w.guidance.bestTarget());
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
        const cabin = w.train.cabins.find((c) => c.unlocked && c.isDirty && !c.guest && !c.cleaner);
        return world(cabin ? (cabin.spots[0] ?? cabin.center) : null);
      }
      case 'station':
        return world(w.station.boardingPoint());
      case 'hire':
        return world(w.tiles.list.find((t) => t.def.kind === 'hire')?.pos);
      case 'couple':
        return world(w.tiles.list.find((t) => t.def.kind === 'couple')?.pos);
      case 'refurb':
        return world(w.tiles.list.find((t) => t.def.kind === 'refurb')?.pos);
      case 'class':
        return world(this.classTile()?.pos);
      case 'turndown': {
        const guest = w.guests.openRequests().find((g) => g.request === 'turndown' && !w.staff.isHandled(g));
        return world(guest?.cabin?.center);
      }
      case 'workshop':
        return world(w.tiles.list.find((t) => (t.def.kind === 'exterior' || t.def.kind === 'marketing') && t.view.group.visible)?.pos);
      case 'washroom':
        return world(w.train.supplySource('towel', w.player.pos));
      case 'map':
        return { hud: 'map' };
      case 'miles':
        return { hud: 'conductor' };
      case 'cafe':
      case 'dining':
      case 'clear':
      case 'bar':
      case 'dome':
      case 'cinema':
        return world(w.venues.lessonTarget(`venue_${id}`));
      default:
        return null;
    }
  }

  /** A visible tile that moves a passenger carriage up a class (Comfort and above). */
  private classTile(): { pos: Vec2 } | null {
    const w = this.w;
    return w.tiles.list.find((t) => {
      const type = w.train.types[t.def.carriage];
      return t.def.kind === 'refurb' && type !== undefined && isPassengerType(type) && classStartingAt(t.def.tier ?? 0) !== null && (t.def.tier ?? 0) >= 2;
    }) ?? null;
  }

  private hintActive(id: string): boolean {
    const w = this.w;
    switch (id) {
      case 'request':
        return w.guests.openRequests().some((g) => g.request && g.request !== 'bathroom' && !w.staff.isHandled(g));
      case 'dirty':
        return w.player.stack.has('laundry') || w.train.cabins.some((c) => c.unlocked && c.isDirty && !c.guest && !c.cleaner);
      case 'station':
        return w.journey.phase === 'stationStop' && w.guests.canBoard();
      case 'hire':
        return w.tiles.list.some((t) => t.def.kind === 'hire');
      case 'couple':
        return w.tiles.list.some((t) => t.def.kind === 'couple');
      case 'refurb':
        return w.tiles.list.some((t) => t.def.kind === 'refurb');
      case 'class':
        return this.classTile() !== null;
      case 'turndown':
        return w.guests.openRequests().some((g) => g.request === 'turndown' && !w.staff.isHandled(g));
      case 'workshop':
        return w.journey.phase === 'stationStop' && !w.guests.canBoard() && w.tiles.list.some((t) => (t.def.kind === 'exterior' || t.def.kind === 'marketing') && t.view.group.visible);
      case 'washroom':
        return w.train.hasSupply('towel') && w.train.bathrooms.some((b) => b.unlocked && !b.stocked);
      case 'map':
        return w.train.count >= 3;
      case 'miles':
        return w.progression.isFeatureUnlocked('conductorUpgrades') && w.wallet.get('railMiles') > 0;
      case 'cafe':
      case 'dining':
      case 'clear':
      case 'bar':
      case 'dome':
      case 'cinema':
        return w.venues.lessonTarget(`venue_${id}`) !== null;
      default:
        return false;
    }
  }
}
