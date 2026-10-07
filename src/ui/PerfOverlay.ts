/**
 * The live performance overlay (session 24): fps and frame time, draw calls and triangles, JS heap, GPU resources
 * and the pools, refreshed twice a second in a small corner box (no layout reads, one text write). Turned on with
 * `?perf=1` or from Developer tools.
 */
export interface PerfReport {
  fps: number;
  avgMs: number;
  worstMs: number;
  hitches: number;
  calls: number;
  triangles: number;
  heapMB: number | null;
  geometries: number;
  textures: number;
  programs: number;
  characters: number;
  parts: number;
  guests: number;
  staff: number;
  bills: number;
  billCapacity: number;
  particles: number;
  particleCapacity: number;
  idleSeconds: number;
  playSeconds: number;
}

export class PerfOverlay {
  private readonly el: HTMLPreElement;
  private timer = 0;
  /** How often the box is rewritten (seconds). */
  static readonly REFRESH = 0.5;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'perf-overlay';
    parent.appendChild(this.el);
  }

  /** Called every frame; `report` is only built when the box is due a refresh. */
  update(dt: number, report: () => PerfReport): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = PerfOverlay.REFRESH;
    const r = report();
    const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
    const idleShare = r.playSeconds > 60 ? Math.round((100 * r.idleSeconds) / (r.playSeconds - 60)) : 0;
    this.el.textContent = [
      `${Math.round(r.fps)} fps  ${r.avgMs.toFixed(1)} ms  worst ${Math.round(r.worstMs)}  hitches ${r.hitches}`,
      `draws ${r.calls}  tris ${k(r.triangles)}`,
      `heap ${r.heapMB === null ? '-' : `${Math.round(r.heapMB)} MB`}  geo ${r.geometries}  tex ${r.textures}  prog ${r.programs}`,
      `people ${r.characters} (${r.parts} parts)  guests ${r.guests}  staff ${r.staff}`,
      `bills ${r.bills}/${r.billCapacity}  particles ${r.particles}/${r.particleCapacity}`,
      `idle ${Math.round(r.idleSeconds)} s (${idleShare}%)`,
    ].join('\n');
  }

  remove(): void {
    this.el.remove();
  }
}
