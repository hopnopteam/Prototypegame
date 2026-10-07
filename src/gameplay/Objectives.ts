import { MAX_CARRIAGES, type UnlockDef } from '../config/content';
import { OBJECTIVES, type ObjectiveDef, type ObjectiveEvent } from '../config/objectives';
import { refitMatches } from '../sim/unlockPlan';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/** How long a finished objective stays up (celebrating) before the next one slides in. */
const NEXT_DELAY_SECONDS = 1.8;
/** The chain wakes only after the screen has been free of cards this long. */
const GOALS_CALM_SECONDS = 4;

/**
 * The objective chain (config/objectives.ts): one goal at a time, counted from gameplay events, each
 * paying a small reward. It is the game's quiet teacher: it walks the player through every mechanic in
 * turn and always says what to do next, without a word of tutorial text in the world.
 */
export class Objectives {
  /** Seconds left on the "done" celebration before advancing. */
  private doneTimer = 0;
  /**
   * What the player did while an earlier goal was up: the next goal counts it, so "pick up your cash"
   * never asks again for something you already did a moment ago.
   */
  private recent: Partial<Record<ObjectiveEvent, number>> = {};

  /**
   * The chain sleeps through the walkthrough and the first stop (config: flow): the coach teaches the
   * first verbs alone, one at a time. While asleep everything is remembered, and on waking the goals the
   * player has already done are settled quietly (no reward pops) before the first new one shows.
   */
  private awake = false;

  constructor(private readonly w: World) {}

  get current(): ObjectiveDef | null {
    return OBJECTIVES[this.state.index] ?? null;
  }

  /** The goal on show in the banner (none while the chain sleeps). */
  get visible(): ObjectiveDef | null {
    return this.awake ? this.current : null;
  }

  private get shouldWake(): boolean {
    const w = this.w;
    const walkthrough = w.coach?.walkthroughDone ?? true;
    // After the first stop's ticket and the naming card, once the screen has been calm a moment.
    const stops = w.econ.flow.features.goals.stops;
    return walkthrough && w.flow.allows('goals') && (w.press.named || w.data.route.stopsCompleted > stops) && w.press.calmSeconds >= GOALS_CALM_SECONDS;
  }

  /**
   * Settles every goal the player already met while the chain slept (their rewards arrive together, in one
   * burst, so the economy is as tuned); then the next goal shows.
   */
  private wake(): void {
    this.awake = true;
    const owed = { cash: 0, gems: 0, railMiles: 0, stars: 0 };
    for (let def = this.current; def; def = this.current) {
      const met = def.event === 'level'
        ? this.w.progression.level >= def.target
        : isTotal(def)
          ? this.owned(def).owned >= def.target
          : !def.filter && def.event !== 'rush' && def.event !== 'perfectStop' && (this.recent[def.event] ?? 0) >= def.target;
      if (!met) break;
      owed.cash += def.reward.cash ?? 0;
      owed.gems += def.reward.gems ?? 0;
      owed.railMiles += def.reward.railMiles ?? 0;
      owed.stars += def.stars ?? 0;
      this.state.index++;
      this.state.progress = 0;
    }
    const w = this.w;
    if (owed.cash > 0) w.wallet.add('cash', owed.cash, 'objective:catchup');
    if (owed.gems > 0) w.wallet.add('gems', owed.gems, 'objective:catchup');
    if (owed.railMiles > 0) w.wallet.add('railMiles', owed.railMiles, 'objective:catchup');
    if (owed.stars > 0) w.addStars(owed.stars, 'objective', w.player.pos);
    if (owed.cash + owed.gems + owed.railMiles > 0) {
      const p = w.player.pos;
      w.particles.emit('sparkle', p.x, FLOOR_Y + 1.6, p.z, 14, 0.6);
      w.audio.play('cash', { volume: 0.7 });
    }
    w.save.markDirty();
    this.activate();
  }

  get progress(): number {
    return this.state.progress;
  }

  /** What the banner counts: a coupling goal reads 0/1 (the next carriage), not carriages so far. */
  get shown(): { progress: number; target: number } {
    const def = this.current;
    if (!def) return { progress: 0, target: 1 };
    if (def.event === 'coupling') return { progress: this.state.progress >= def.target ? 1 : 0, target: 1 };
    return { progress: this.state.progress, target: def.target };
  }

  /** The current objective is finished and celebrating. */
  get done(): boolean {
    return this.doneTimer > 0;
  }

  private get state(): { index: number; progress: number } {
    return this.w.data.objectives;
  }

  init(): void {
    const e = this.w.events;
    const w = this.w;
    // Session 24: checking in is handing over the key at the desk (the ticket stand's sales count as boarding).
    e.on('guest.keyed', () => this.count('checkIn'));
    e.on('cash.collected', () => this.count('collect'));
    e.on('unlock.completed', ({ id }) => {
      const u = w.unlocks.get(id);
      if (!u) return;
      this.syncTotal();
    });
    e.on('cabin.cleaned', () => this.count('clean'));
    e.on('request.fulfilled', ({ byPlayer, speedy }) => {
      this.count('request');
      if (byPlayer && speedy) this.count('speedy');
    });
    e.on('guest.boarded', () => this.count('board'));
    e.on('luggage.loaded', () => this.count('luggage'));
    e.on('station.result', (r) => r.clean && this.count('perfectStop'));
    e.on('bathroom.restocked', () => this.count('restock'));
    e.on('venue.served', () => this.count('venue'));
    e.on('carriage.refurbished', () => this.syncTotal());
    e.on('carriage.coupled', () => this.syncTotal());
    e.on('level.up', () => this.syncLevel());
    e.on('conductor.upgraded', () => this.syncTotal());
    e.on('rush.bonus', ({ streak }) => {
      const def = this.current;
      if (def?.event === 'rush' && streak >= (def.streak ?? 0)) this.count('rush');
    });
    this.activate();
  }

  update(dt: number): void {
    if (!this.awake) {
      if (this.shouldWake) this.wake();
      return;
    }
    if (this.doneTimer <= 0) return;
    this.doneTimer -= dt;
    if (this.doneTimer > 0) return;
    this.state.index++;
    this.state.progress = 0;
    this.w.save.markDirty();
    this.activate();
  }

  private count(event: ObjectiveEvent, amount = 1, unlock?: UnlockDef): void {
    if (!this.awake) {
      this.recent[event] = (this.recent[event] ?? 0) + amount;
      return;
    }
    const def = this.current;
    const counts = !!def && !this.done && def.event === event && !isTotal(def) && (!def.filter || (!!unlock && matches(unlock, def.filter)));
    if (!def || !counts) {
      // Not this goal's business: remember it for the next one.
      if (!unlock) this.recent[event] = (this.recent[event] ?? 0) + amount;
      return;
    }
    this.state.progress = Math.min(def.target, this.state.progress + amount);
    this.w.save.markDirty();
    if (this.state.progress >= def.target) this.complete(def);
  }


  /** A newly current objective may already be met (a level reached, an old save): settle it at once. */
  private activate(): void {
    const def = this.current;
    if (!def) return;
    const earlier = this.recent[def.event] ?? 0;
    this.recent = {};
    if (def.event === 'level') this.syncLevel();
    else if (isTotal(def)) this.syncTotal();
    else if (earlier > 0 && !def.filter && def.event !== 'rush' && def.event !== 'perfectStop') {
      // Already done while the last goal was up: counts now.
      this.state.progress = Math.min(def.target, this.state.progress + earlier);
      if (this.state.progress >= def.target) this.complete(def);
    }
  }

  /**
   * Goals about what you own (tiles of a kind, refits, carriages, station upgrades) count everything bought
   * so far, whenever it was bought: a goal reached early is simply met, and none can ask for more than the
   * train holds (once the train is full and nothing of the kind is left, it settles with what there is).
   */
  private syncTotal(): void {
    const def = this.current;
    if (!this.awake || !def || !isTotal(def) || this.done) return;
    const { owned, exhausted } = this.owned(def);
    this.settle(def, owned, exhausted);
  }

  /** How many of what a goal is about the train owns, and whether there is no more of it to be had. */
  private owned(def: ObjectiveDef): { owned: number; exhausted: boolean } {
    const u = this.w.unlocks;
    if (def.event === 'conductor') {
      const c = this.w.data.conductor;
      return { owned: c.speed + c.capacity + c.fareBonus, exhausted: false };
    }
    const relevant = u.defs.filter((d) => {
      switch (def.event) {
        case 'refurb': return d.kind === 'refurb' && refitMatches(d, def.filter, this.w.train.types[d.carriage]);
        case 'coupling': return d.kind === 'couple';
        case 'station': return d.kind === 'exterior' || d.kind === 'marketing';
        default: return !def.filter || matches(d, def.filter);
      }
    });
    const owned = relevant.filter((d) => u.isUnlocked(d.id)).length;
    return { owned, exhausted: this.w.train.count >= MAX_CARRIAGES && relevant.every((d) => u.isUnlocked(d.id)) };
  }

  private settle(def: ObjectiveDef, owned: number, exhausted: boolean): void {
    if (Math.min(def.target, owned) !== this.state.progress) {
      this.state.progress = Math.min(def.target, owned);
      this.w.save.markDirty();
    }
    if (owned >= def.target || (exhausted && owned > 0)) this.complete(def);
  }

  private syncLevel(): void {
    const def = this.current;
    if (!this.awake || !def || def.event !== 'level' || this.done) return;
    this.state.progress = Math.min(def.target, this.w.progression.level);
    if (this.state.progress >= def.target) this.complete(def);
  }

  private complete(def: ObjectiveDef): void {
    const w = this.w;
    this.doneTimer = NEXT_DELAY_SECONDS;
    const r = def.reward;
    if (r.cash) w.wallet.add('cash', r.cash, `objective:${def.id}`);
    if (r.gems) w.wallet.add('gems', r.gems, `objective:${def.id}`);
    if (r.railMiles) w.wallet.add('railMiles', r.railMiles, `objective:${def.id}`);
    const p = w.player.pos;
    if (def.stars) w.addStars(def.stars, 'objective', p);
    w.particles.emit('confetti', p.x, FLOOR_Y + 2.2, p.z - 0.5, 26, 0.7);
    w.audio.play('chest', { volume: 0.7 });
    w.haptics.success();
    w.ui.objectiveDone(def);
    w.analytics.log('objective_completed', { id: def.id, index: this.state.index, time: Math.round(w.lifetimeSeconds()) });
  }
}

const TOTAL_EVENTS: ObjectiveEvent[] = ['unlock', 'refurb', 'coupling', 'station', 'conductor'];
const isTotal = (def: ObjectiveDef): boolean => TOTAL_EVENTS.includes(def.event);

/** A filter names a tile kind ("comfort") or a kind and its role ("hire:porter"). */
function matches(u: UnlockDef, filter: string): boolean {
  const [kind, detail] = filter.split(':');
  if (u.kind !== kind) return false;
  return !detail || u.role === detail || u.comfort === detail;
}
