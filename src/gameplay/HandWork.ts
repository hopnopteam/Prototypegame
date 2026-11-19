import type { WorkMetric } from '../config/content';
import type { World } from './World';

/**
 * Counts the work done toward each hire (session 29, partner playtest: "automation should feel like a relief… the
 * player does the job by hand long enough to feel the workload"). Each kind of help waits for its own count
 * (`UnlockDef.work`): the attendant for rooms tidied and requests served, the porter for tickets and bags, each
 * venue's staff for orders served there.
 *
 * Phase 3 (found by the pacing simulator): staff work counts too, kept apart (`profile.staffWork`). Staff only do a
 * job once a helper has been hired for it, so the first helper of every job is still earned by hand; the next one no
 * longer waits on work the conductor no longer does (the Chef's dinners once the Waiter cooks, the Family Sleeper's
 * Porter's keys once the lobby's Porter hands them, its Attendant's rooms), which left the route unfinishable.
 */
export class HandWork {
  /** Hand work and staff work together, the counts every hire waits for. */
  readonly counts: Record<string, number> = {};

  constructor(private readonly w: World) {}

  init(): void {
    const p = this.w.data.profile;
    for (const k of Object.keys(this.counts)) delete this.counts[k];
    for (const src of [p.handWork, p.staffWork]) for (const [k, v] of Object.entries(src)) this.counts[k] = (this.counts[k] ?? 0) + v;
    const e = this.w.events;
    e.on('cabin.cleaned', ({ byPlayer }) => this.add('rooms', byPlayer));
    e.on('request.fulfilled', ({ byPlayer }) => this.add('requests', byPlayer));
    e.on('guest.checkedIn', ({ byPlayer }) => this.add('tickets', byPlayer));
    e.on('guest.keyed', ({ byPlayer }) => this.add('keys', byPlayer));
    e.on('luggage.loaded', ({ byPlayer }) => this.add('bags', byPlayer));
    e.on('station.bell', ({ byPlayer }) => this.add('bells', byPlayer));
    e.on('venue.served', ({ kind, byPlayer }) => this.add(kind, byPlayer));
    // Phase 2: trips to the platform's restock cart (the station boy's own restocks count once he is hired).
    e.on('station.restocked', ({ helper }) => this.add('restock', !helper));
  }

  /** Done by hand only (the Rush, goals and analytics read the events themselves). */
  get(metric: WorkMetric): number {
    return this.w.data.profile.handWork[metric] ?? 0;
  }

  private add(metric: WorkMetric, byPlayer: boolean): void {
    const work = byPlayer ? this.w.data.profile.handWork : this.w.data.profile.staffWork;
    work[metric] = (work[metric] ?? 0) + 1;
    this.counts[metric] = (this.counts[metric] ?? 0) + 1;
    this.w.save.markDirty();
  }
}
