import { COACH_HINT_MIN_SECONDS, COACH_HINT_SECONDS, COACH_HINTS, COACH_STEPS, type CoachLineDef } from '../config/coach';
import type { Vec2 } from '../core/types';
import type { World } from './World';

const THINK_SECONDS = 0.4;
/** Walking this far from the spawn point completes the first step. */
const WALK_METRES = 1.2;

/**
 * A very small walkthrough: four steps teach the loop (walk, check in, scoop cash, build), then each new
 * mechanic gets one line the first time it appears. Lines sit in one slot under the top bar and never
 * block anything; the guidance arrow shows where.
 */
export class Coach {
  current: CoachLineDef | null = null;
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
    const w = this.w;
    this.shown += dt;
    this.think -= dt;
    if (this.think > 0) return;
    this.think = THINK_SECONDS;
    if (!this.enabled) {
      this.current = null;
      return;
    }

    // Walkthrough: the first unfinished step, skipping any the player already did.
    for (const step of COACH_STEPS) {
      if (this.done(step.id)) continue;
      if (this.stepComplete(step.id)) {
        this.finish(step.id);
        continue;
      }
      this.show(step);
      return;
    }

    // One-time hints.
    const cur = this.current;
    if (cur && !COACH_STEPS.some((s) => s.id === cur.id)) {
      const resolved = !this.hintActive(cur.id);
      if (this.shown < COACH_HINT_SECONDS && !(resolved && this.shown > COACH_HINT_MIN_SECONDS)) return;
      this.finish(cur.id);
      this.current = null;
    } else if (cur) {
      this.current = null;
    }
    if (w.journey.phase === 'arriving') return;
    for (const hint of COACH_HINTS) {
      if (this.done(hint.id) || !this.hintActive(hint.id)) continue;
      this.show(hint);
      return;
    }
  }

  private show(line: CoachLineDef): void {
    if (this.current?.id === line.id) return;
    this.current = line;
    this.shown = 0;
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

  private hintActive(id: string): boolean {
    const w = this.w;
    switch (id) {
      case 'request':
        return w.guests.openRequests().some((g) => g.request && g.request !== 'bathroom' && !w.staff.isHandled(g));
      case 'dirty':
        return w.train.cabins.some((c) => c.isDirty && !c.guest && !c.cleaner);
      case 'station':
        return w.journey.phase === 'stationStop';
      case 'hire':
        return w.tiles.list.some((t) => t.def.kind === 'hire');
      case 'couple':
        return w.tiles.list.some((t) => t.def.kind === 'couple');
      case 'refurb':
        return w.tiles.list.some((t) => t.def.kind === 'refurb');
      case 'washroom':
        return w.train.hasSupplyCar() && w.train.bathrooms.some((b) => b.unlocked && !b.stocked);
      case 'map':
        return w.train.count >= 3;
      case 'gazette':
        return w.data.press.unread > 0;
      case 'miles':
        return w.progression.isFeatureUnlocked('conductorUpgrades') && w.wallet.get('railMiles') > 0;
      default:
        return false;
    }
  }
}
