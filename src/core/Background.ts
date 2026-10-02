/**
 * One budget per frame shared by every piece of spread-out work (the next scenery stretch, the light bake,
 * rebuilds after a coupling): each takes its slice in turn from what is left, so all of them together never
 * cost a frame more than this, however many happen to be running. `begin` opens a frame's budget; each user
 * still does at least one small step per frame, so nothing starves.
 */
export const frameWork = {
  until: Number.POSITIVE_INFINITY,
  begin(ms: number): void {
    this.until = performance.now() + ms;
  },
  /** Milliseconds of this frame's budget left (may be negative). */
  left(): number {
    return this.until - performance.now();
  },
};

/**
 * Work spread over frames: heavy rebuilds (the platform after a coupling, the train's outside dressing) run as
 * generators that yield between small slices, and `run` advances them in order within a per-frame budget, so
 * no single frame pays for a whole rebuild. Steps are kept small, since a step always runs to its next yield.
 */
export class Background {
  private readonly jobs: { key: string; steps: Generator<void, unknown> }[] = [];

  /** Queues a job, replacing any queued under the same key (a newer rebuild supersedes an older one). */
  add(key: string, steps: Generator<void, unknown>): void {
    this.cancel(key);
    this.jobs.push({ key, steps });
  }

  cancel(key: string): void {
    const i = this.jobs.findIndex((j) => j.key === key);
    if (i >= 0) this.jobs.splice(i, 1);
  }

  has(key: string): boolean {
    return this.jobs.some((j) => j.key === key);
  }

  /** Runs one job to the end now (when its result must show this frame). */
  finish(key: string): void {
    const i = this.jobs.findIndex((j) => j.key === key);
    if (i < 0) return;
    const [job] = this.jobs.splice(i, 1);
    while (!job.steps.next().done) {
      // keep going
    }
  }

  /** Advances the queued jobs, oldest first, for up to `budgetMs` (and what is left of the frame's work budget). */
  run(budgetMs: number): void {
    if (this.jobs.length === 0) return;
    const end = Math.min(performance.now() + budgetMs, frameWork.until);
    do {
      const job = this.jobs[0];
      if (job.steps.next().done) this.jobs.shift();
    } while (this.jobs.length > 0 && performance.now() < end);
  }
}
