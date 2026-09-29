import { MAX_CARRIAGES, type UnlockDef } from '../config/content';
import { OBJECTIVES, type ObjectiveDef, type ObjectiveEvent } from '../config/objectives';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/** How long a finished objective stays up (celebrating) before the next one slides in. */
const NEXT_DELAY_SECONDS = 1.8;

/**
 * The objective chain (config/objectives.ts): one goal at a time, counted from gameplay events, each
 * paying a small reward. It is the game's quiet teacher: it walks the player through every mechanic in
 * turn and always says what to do next, without a word of tutorial text in the world.
 */
export class Objectives {
  /** Seconds left on the "done" celebration before advancing. */
  private doneTimer = 0;

  constructor(private readonly w: World) {}

  get current(): ObjectiveDef | null {
    return OBJECTIVES[this.state.index] ?? null;
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
    e.on('guest.checkedIn', () => this.count('checkIn'));
    e.on('cash.collected', () => this.count('collect'));
    e.on('unlock.completed', ({ id }) => {
      const u = w.unlocks.get(id);
      if (!u) return;
      this.syncTotal();
    });
    e.on('cabin.cleaned', () => this.count('clean'));
    e.on('request.fulfilled', () => this.count('request'));
    e.on('guest.boarded', () => this.count('board'));
    e.on('luggage.loaded', () => this.count('luggage'));
    e.on('station.result', (r) => r.clean && this.count('perfectStop'));
    e.on('bathroom.restocked', () => this.count('restock'));
    e.on('carriage.refurbished', () => this.syncTotal());
    e.on('carriage.coupled', () => this.syncTotal());
    e.on('level.up', () => this.syncLevel());
    e.on('conductor.upgraded', () => this.count('conductor'));
    e.on('rush.bonus', ({ streak }) => {
      const def = this.current;
      if (def?.event === 'rush' && streak >= (def.streak ?? 0)) this.count('rush');
    });
    this.activate();
  }

  update(dt: number): void {
    if (this.doneTimer <= 0) return;
    this.doneTimer -= dt;
    if (this.doneTimer > 0) return;
    this.state.index++;
    this.state.progress = 0;
    this.w.save.markDirty();
    this.activate();
  }

  private count(event: ObjectiveEvent, amount = 1, unlock?: UnlockDef): void {
    const def = this.current;
    if (!def || this.done || def.event !== event || isTotal(def)) return;
    if (def.filter && (!unlock || !matches(unlock, def.filter))) return;
    this.state.progress = Math.min(def.target, this.state.progress + amount);
    this.w.save.markDirty();
    if (this.state.progress >= def.target) this.complete(def);
  }

  /** A newly current objective may already be met (a level reached, an old save): settle it at once. */
  private activate(): void {
    const def = this.current;
    if (!def) return;
    if (def.event === 'level') this.syncLevel();
    else if (isTotal(def)) this.syncTotal();
  }

  /**
   * Goals about what you own (tiles of a kind, refits, carriages, station upgrades) count everything bought
   * so far, whenever it was bought: a goal reached early is simply met, and none can ask for more than the
   * train holds (once the train is full and nothing of the kind is left, it settles with what there is).
   */
  private syncTotal(): void {
    const def = this.current;
    if (!def || !isTotal(def) || this.done) return;
    const u = this.w.unlocks;
    const relevant = u.defs.filter((d) => {
      switch (def.event) {
        case 'refurb': return d.kind === 'refurb' && (!def.filter || String(d.tier) === def.filter);
        case 'coupling': return d.kind === 'couple';
        case 'station': return d.kind === 'exterior' || d.kind === 'marketing';
        default: return !def.filter || matches(d, def.filter);
      }
    });
    const owned = relevant.filter((d) => u.isUnlocked(d.id)).length;
    if (owned !== this.state.progress) {
      this.state.progress = Math.min(def.target, owned);
      this.w.save.markDirty();
    }
    const exhausted = this.w.train.count >= MAX_CARRIAGES && relevant.every((d) => u.isUnlocked(d.id));
    if (owned >= def.target || (exhausted && owned > 0)) this.complete(def);
  }

  private syncLevel(): void {
    const def = this.current;
    if (!def || def.event !== 'level' || this.done) return;
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

const TOTAL_EVENTS: ObjectiveEvent[] = ['unlock', 'refurb', 'coupling', 'station'];
const isTotal = (def: ObjectiveDef): boolean => TOTAL_EVENTS.includes(def.event);

/** A filter names a tile kind ("comfort") or a kind and its role ("hire:porter"). */
function matches(u: UnlockDef, filter: string): boolean {
  const [kind, detail] = filter.split(':');
  if (u.kind !== kind) return false;
  return !detail || u.role === detail || u.comfort === detail;
}
