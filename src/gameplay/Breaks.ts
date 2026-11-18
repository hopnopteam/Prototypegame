import { log } from '../core/log';
import { EVENTS } from '../services/analytics';
import type { World } from './World';

/**
 * Phase 2, natural breaks for the ad layer (owner: "add hook events for ads… never mid-walk, mid-task or serving"). Nothing
 * here shows an ad: it only says when a break has come, as the event `break` on the bus (and a `break_point` analytics
 * line). A break is held until the conductor is standing still, not working a job and carrying nothing, and dropped if
 * that does not happen within `MAX_WAIT` seconds (the moment has passed).
 */
export type BreakKind = 'departure' | 'arrival' | 'bonusClosed' | 'levelUpClosed' | 'revealEnded';

/** Seconds a break waits for the conductor to be free before it is dropped. */
const MAX_WAIT = 6;
/** The conductor counts as standing still after this long without moving. */
const STILL_SECONDS = 0.35;

export class Breaks {
  private readonly pending: { kind: BreakKind; at: number }[] = [];
  /** Every break raised so far this session, for tests and the debug panel. */
  readonly fired: { kind: BreakKind; at: number }[] = [];

  constructor(private readonly w: World) {}

  request(kind: BreakKind): void {
    if (this.pending.some((p) => p.kind === kind)) return;
    this.pending.push({ kind, at: this.w.time });
  }

  /** The conductor is between things: not walking, not working a job, not carrying a tray. */
  free(): boolean {
    const w = this.w;
    const p = w.player;
    return p.idleSeconds >= STILL_SECONDS && !w.zones.playerWorking && p.stack.isEmpty && !p.travel.active;
  }

  update(): void {
    if (this.pending.length === 0) return;
    const w = this.w;
    const free = this.free();
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      if (free) {
        this.pending.splice(i, 1);
        this.fired.push({ kind: b.kind, at: w.time });
        if (this.fired.length > 50) this.fired.shift();
        log.info('Break', `break:${b.kind}`);
        w.events.emit('break', { kind: b.kind });
        w.analytics.log(EVENTS.breakPoint, { kind: b.kind });
      } else if (w.time - b.at > MAX_WAIT) this.pending.splice(i, 1);
    }
  }
}
