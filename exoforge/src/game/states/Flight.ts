// A flight (SPEC A5.2, A5.3): the run steps at a fixed 120 Hz with render interpolation; a crash plays slowed
// and the drone tows the suit off; then Results.
import type { Game, GameState } from '../Game';
import { Run } from '../../sim/Run';
import { CRASH, MAX_STEPS_PER_FRAME, SIM_DT } from '../../econ/balance';

/** Seconds the last frame of a run holds before Results (longer for the exit). */
const END_HOLD = { crash: 0.35, battery: 0.35, exit: 1.0, quit: 0 } as const;
const SLOW_MOTION = 0.25;

export class FlightState implements GameState {
  readonly name = 'flight';
  paused = false;
  /** How many of each sim event this flight has seen (for the automated checks). */
  eventCounts: Record<string, number> = {};
  private acc = 0;
  private endTimer = 0;

  constructor(private readonly game: Game) {
    game.hud.pauseButton.addEventListener('click', () => this.setPaused(true));
    game.pause.onResume = () => this.setPaused(false);
    game.pause.onEnd = () => {
      this.setPaused(false);
      this.game.run?.quit();
    };
  }

  enter(): void {
    const g = this.game;
    const layers = g.stage.layers;
    g.run?.dispose();
    const run = new Run(g.course, g.debug.params(), g.debug.settings.flags);
    g.run = run;
    this.eventCounts = {};
    this.acc = 0;
    this.endTimer = 0;
    this.paused = false;
    g.workshopBackdrop.visible = false;
    g.parallax.visible = true;
    layers.terrain.visible = layers.decor.visible = true;
    layers.workshop.visible = false;
    g.suitView.attach(run);
    g.effects.begin(run);
    g.camera.zoom = 1;
    g.camera.courseHalfWidth = run.course.width / 2;
    const s = run.suit.soles();
    const [cx, cy] = g.camera.target(s.x, s.y, 0, run.course.start.y);
    g.camera.snap(cx, cy);
    g.terrain.update(cy, g.stage.viewHeightM);
    g.hud.begin(run, g.best);
    g.hud.visible = true;
    g.pause.open = false;
    g.input.release();
    g.input.enabled = true;
  }

  exit(): void {
    this.game.input.enabled = false;
    this.game.pause.open = false;
  }

  setPaused(v: boolean): void {
    if (this.game.state !== this) return;
    this.paused = v;
    this.game.pause.open = v;
    this.game.input.enabled = !v;
    this.game.input.release();
  }

  autoPause(): void {
    if (this.game.state === this && !this.game.run?.done) this.setPaused(true);
  }

  jump(chunk: number): void {
    const run = this.game.run;
    if (this.game.state !== this || !run) return;
    run.jumpToChunk(chunk);
    this.game.suitView.capture();
    const s = run.suit.soles();
    const [cx, cy] = this.game.camera.target(s.x, s.y, 0, run.course.start.y);
    this.game.camera.snap(cx, cy);
  }

  frame(dt: number): void {
    const g = this.game;
    const run = g.run;
    if (!run) return;
    const frozen = this.paused || g.debug.open;
    if (!frozen) {
      let scale = g.debug.settings.slowMo ? SLOW_MOTION : 1;
      if (run.phase === 'ragdoll' || run.phase === 'tow') scale *= CRASH.timeScale;
      this.acc += dt * scale;
      let steps = 0;
      const t0 = performance.now();
      while (this.acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME && !run.done) {
        g.suitView.capture();
        run.step(g.input.sample());
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps > 0) {
        const ms = (performance.now() - t0) / steps;
        g.perf.simMsPerStep += (ms - g.perf.simMsPerStep) * 0.05;
        g.perf.steps += steps;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      if (run.events.length > 0) {
        for (const e of run.events) this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;
        g.effects.handle(run.events);
        run.events.length = 0;
      }
      g.effects.update(dt * scale);
    }
    const alpha = frozen ? 1 : Math.min(1, this.acc / SIM_DT);
    g.suitView.render(alpha, frozen ? 0 : dt);
    const focus = run.ragdoll || run.tow ? g.suitView.torsoPoint() : g.suitView.worldPoint(0, 0, alpha);
    const vy = run.trackedBody().linvel().y;
    if (!frozen) g.camera.follow(focus.x, focus.y, vy, run.course.start.y, dt);
    g.camera.apply(frozen ? 0 : dt);
    g.terrain.update(g.camera.y, g.stage.viewHeightM);
    g.parallax.update(g.camera.y);
    g.hud.update(run);
    const d = g.debug.settings;
    g.stage.layers.debug.visible = d.vectors || d.guides;
    g.debugDraw.guides.visible = d.guides;
    g.debugDraw.vectors.visible = d.vectors;
    if (d.guides) g.debugDraw.drawGuides(run.course);
    if (d.vectors) g.debugDraw.drawVectors(run);

    if (run.done && !frozen) {
      this.endTimer += dt;
      if (this.endTimer >= END_HOLD[run.endReason ?? 'quit']) {
        g.lastStats = run.stats();
        g.go('results');
      }
    }
  }
}
