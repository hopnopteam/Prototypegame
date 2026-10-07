/**
 * Frame timing for the live performance overlay and the soak test (session 24, owner: "the frame rate drops more
 * and more… show fps, frame time, draw calls, triangles, JS heap and pool counts live"). A fixed ring of the last
 * frames' real durations: no allocation per frame, read twice a second.
 */
export class PerfStats {
  private readonly frames: Float32Array;
  private cursor = 0;
  private filled = 0;
  /** Frames slower than this (ms) count as hitches (a 30 fps frame or worse). */
  static readonly HITCH_MS = 34;
  hitches = 0;

  constructor(size = 120) {
    this.frames = new Float32Array(size);
  }

  /** One real frame's duration in milliseconds. */
  sample(ms: number): void {
    this.frames[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % this.frames.length;
    if (this.filled < this.frames.length) this.filled++;
    if (ms > PerfStats.HITCH_MS) this.hitches++;
  }

  /** Average and worst frame time over the ring, and the frame rate the average means. */
  summary(): { fps: number; avgMs: number; worstMs: number } {
    if (this.filled === 0) return { fps: 0, avgMs: 0, worstMs: 0 };
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < this.filled; i++) {
      sum += this.frames[i];
      if (this.frames[i] > worst) worst = this.frames[i];
    }
    const avg = sum / this.filled;
    return { fps: avg > 0 ? 1000 / avg : 0, avgMs: avg, worstMs: worst };
  }
}
