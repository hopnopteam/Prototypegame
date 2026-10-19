// The composition root and the state machine: Workshop → Flight (→ crash) → Results → Workshop (SPEC A5).
import { Sprite } from 'pixi.js';
import { buildCourse, type Course } from '../sim/Course';
import type { Run, RunStats } from '../sim/Run';
import { WORLDS } from '../content/worlds';
import { Stage } from '../render/Stage';
import { CameraRig } from '../render/CameraRig';
import { Particles } from '../render/Particles';
import { SuitView, sizedSprite } from '../render/SuitView';
import { DroneView } from '../render/DroneView';
import { Effects } from '../render/Effects';
import { TerrainView } from '../render/TerrainView';
import { Parallax } from '../render/Parallax';
import { DebugDraw } from '../render/DebugDraw';
import { texture } from '../render/assets';
import { Hud } from '../ui/hud/Hud';
import { Results } from '../ui/results/Results';
import { WorkshopUi } from '../ui/workshop/WorkshopUi';
import { PauseSheet } from '../ui/common/PauseSheet';
import { el } from '../ui/common/dom';
import { Save } from '../services/Save';
import { PilotInputSource } from '../services/Input';
import { DebugPanel } from '../services/Debug';
import { WorkshopState } from './states/Workshop';
import { FlightState } from './states/Flight';
import { ResultsState } from './states/Results';

export interface GameState {
  readonly name: string;
  enter(): void;
  exit(): void;
  frame(dt: number): void;
}

/** The callsign until the first-launch flow (Milestone 4) lets the player choose one. */
const DEFAULT_CALLSIGN = 'PILOT';

export class Game {
  readonly world = WORLDS[1];
  readonly course: Course;
  readonly save = new Save();
  readonly camera: CameraRig;
  readonly particles: Particles;
  readonly suitView = new SuitView();
  readonly drone = new DroneView();
  readonly effects: Effects;
  readonly terrain: TerrainView;
  readonly parallax: Parallax;
  readonly debugDraw = new DebugDraw();
  readonly hud = new Hud(DEFAULT_CALLSIGN);
  readonly results = new Results();
  readonly workshopUi: WorkshopUi;
  readonly pause = new PauseSheet();
  readonly input: PilotInputSource;
  readonly debug: DebugPanel;
  readonly workshopBackdrop: Sprite;
  readonly stand: Sprite;
  run: Run | null = null;
  lastStats: RunStats | null = null;
  state: GameState;
  readonly states: { workshop: WorkshopState; flight: FlightState; results: ResultsState };
  /** Frame timing for the debug status and the automated checks. */
  readonly perf = { fps: 60, frameMs: 16.7, simMsPerStep: 0, steps: 0, maxDrawCalls: 0 };
  private last = 0;
  private running = false;

  constructor(readonly frameEl: HTMLElement, readonly stage: Stage) {
    this.course = buildCourse(this.world.index, this.world.chunks);
    const layers = stage.layers;
    this.camera = new CameraRig(stage);
    this.particles = new Particles(layers.fx, layers.fxAdd);
    this.terrain = new TerrainView(this.course, layers.terrain, layers.decor);
    this.workshopBackdrop = new Sprite(texture('workshop.w1.bg'));
    layers.backdrop.addChild(this.workshopBackdrop);
    this.parallax = new Parallax(stage, layers.backdrop);
    this.stand = sizedSprite('workshop.w1.stand');
    layers.workshop.addChild(this.stand);
    layers.actors.addChild(this.suitView.root, this.drone.root);
    layers.debug.addChild(this.debugDraw.guides, this.debugDraw.vectors);
    const toScreen = (x: number, y: number) => layers.world.toGlobal({ x, y: -y });
    this.effects = new Effects(this.particles, this.camera, this.suitView, this.drone, {
      floatText: (text, x, y, kind) => {
        const p = toScreen(x, y);
        this.hud.floatText(text, p.x, p.y, kind);
      },
      hudPulse: (what) => this.hud.pulse(what),
    });
    this.workshopUi = new WorkshopUi(`Chapter ${this.world.index} · ${this.world.name}`);
    this.input = new PilotInputSource(frameEl, () => this.save.data.settings.fullTiltPx);
    const vignette = el('div', 'vignette');
    frameEl.append(vignette, this.hud.root, this.workshopUi.root, this.results.root, this.pause.root);
    this.debug = new DebugPanel(frameEl, this.save, {
      jump: (chunk) => this.states.flight.jump(chunk),
      chunkCount: () => this.course.chunks.length,
      tuned: (params) => {
        if (this.run && this.run.phase === 'flight') this.run.suit.retune(params);
      },
      status: () => `${this.perf.fps.toFixed(0)} fps · ${this.stage.drawCalls} draw calls · sim ${this.perf.simMsPerStep.toFixed(3)} ms/step · ${this.particles.count} particles`,
    });
    this.states = { workshop: new WorkshopState(this), flight: new FlightState(this), results: new ResultsState(this) };
    this.state = this.states.workshop;
    stage.onResize(() => this.layoutScreens());
    this.layoutScreens();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.states.flight.autoPause();
    });
  }

  get best(): number {
    return this.save.data.best[String(this.world.index)] ?? 0;
  }

  start(): void {
    this.state.enter();
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (dt > 0) {
        this.perf.frameMs += (dt * 1000 - this.perf.frameMs) * 0.1;
        this.perf.fps = 1000 / this.perf.frameMs;
      }
      this.state.frame(dt);
      this.stage.render();
      this.perf.maxDrawCalls = Math.max(this.perf.maxDrawCalls, this.stage.drawCalls);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  go(next: keyof Game['states']): void {
    this.state.exit();
    this.state = this.states[next];
    this.state.enter();
  }

  /** Screen-space pieces that depend on the frame size. */
  private layoutScreens(): void {
    const { widthPx, heightPx } = this.stage;
    const tex = this.workshopBackdrop.texture;
    const cover = Math.max(widthPx / tex.width, heightPx / tex.height);
    this.workshopBackdrop.scale.set(cover);
    this.workshopBackdrop.position.set((widthPx - tex.width * cover) / 2, (heightPx - tex.height * cover) / 2);
    this.parallax.resize();
  }

  /** Read-only state for the automated play checks (window.__exo). */
  snapshot(): Record<string, unknown> {
    const run = this.run;
    const suit = run?.suit;
    return {
      screen: this.state.name,
      paused: this.states.flight.paused,
      phase: run?.phase ?? null,
      time: run?.time ?? 0,
      tick: run?.tick ?? 0,
      height: run ? run.height() : 0,
      maxHeight: run?.maxHeight ?? 0,
      heat: suit?.heat.heat ?? 0,
      sputter: (suit?.heat.sputterLeft ?? 0) > 0,
      battery: suit?.battery ?? 1,
      integrity: suit?.integrity ?? 0,
      tilt: suit ? suit.tilt : 0,
      targetTilt: suit?.targetTilt ?? 0,
      throttle: suit?.throttle ?? 0,
      holding: this.input.holding,
      resting: suit?.resting ?? false,
      ragdoll: run?.ragdoll !== null && run?.ragdoll !== undefined,
      tow: run?.tow?.phase ?? null,
      endReason: run?.endReason ?? null,
      best: this.best,
      eventCounts: this.states.flight.eventCounts,
      drawCalls: this.stage.drawCalls,
      maxDrawCalls: this.perf.maxDrawCalls,
      fps: this.perf.fps,
      simMsPerStep: this.perf.simMsPerStep,
      particles: this.particles.count,
      chunksBuilt: this.terrain.builtCount,
    };
  }
}
