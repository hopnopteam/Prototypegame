import type { WorkMetric } from '../config/content';
import type { World } from './World';

/**
 * Counts the work the conductor does by hand (session 29, partner playtest: "automation should feel like a relief…
 * the player does the job by hand long enough to feel the workload"). Each kind of help waits for its own count
 * (`UnlockDef.work`): the attendant for rooms tidied and requests served, the porter for tickets and bags, each
 * venue's staff for orders served there. Staff work never counts.
 */
export class HandWork {
  constructor(private readonly w: World) {}

  init(): void {
    const e = this.w.events;
    e.on('cabin.cleaned', ({ byPlayer }) => byPlayer && this.add('rooms'));
    e.on('request.fulfilled', ({ byPlayer }) => byPlayer && this.add('requests'));
    e.on('guest.checkedIn', ({ byPlayer }) => byPlayer && this.add('tickets'));
    e.on('guest.keyed', ({ byPlayer }) => byPlayer && this.add('keys'));
    e.on('luggage.loaded', ({ byPlayer }) => byPlayer && this.add('bags'));
    e.on('station.bell', ({ byPlayer }) => byPlayer && this.add('bells'));
    e.on('venue.served', ({ kind, byPlayer }) => byPlayer && this.add(kind));
  }

  get(metric: WorkMetric): number {
    return this.w.data.profile.handWork[metric] ?? 0;
  }

  private add(metric: WorkMetric): void {
    const work = this.w.data.profile.handWork;
    work[metric] = (work[metric] ?? 0) + 1;
    this.w.save.markDirty();
  }
}
