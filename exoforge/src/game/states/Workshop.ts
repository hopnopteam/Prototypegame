// The Workshop (home screen), Milestone 1 stub: the bare Scrap Rig on its build stand under the work lamp, the
// helper drone hovering beside it, and FLY! (SPEC A5.1; the build tray comes in Milestone 3).
import type { Game, GameState } from '../Game';
import { SUIT_HEIGHT } from '../../sim/rig';
import { WORKSHOP_VIEW } from '../../render/config';

export class WorkshopState implements GameState {
  readonly name = 'workshop';
  private time = 0;

  constructor(private readonly game: Game) {
    game.workshopUi.fly.addEventListener('click', () => {
      if (this.game.state === this) this.game.go('flight');
    });
  }

  enter(): void {
    const g = this.game;
    const layers = g.stage.layers;
    g.input.enabled = false;
    g.input.release();
    g.hud.visible = false;
    g.results.hide();
    g.pause.open = false;
    g.workshopUi.show(g.best);
    g.workshopBackdrop.visible = true;
    g.parallax.visible = false;
    layers.terrain.visible = layers.decor.visible = false;
    layers.workshop.visible = true;
    layers.debug.visible = false;
    g.particles.clear();
    g.drone.reset();
    g.drone.comeToPatch({ x: -2.6, y: 2.4 }, { x: -0.85, y: 2.15 });
    this.time = 0;
  }

  exit(): void {
    this.game.workshopUi.hide();
  }

  frame(dt: number): void {
    const g = this.game;
    this.time += dt;
    // Frame the suit: a set share of the screen tall, its soles at a set height.
    const zoom = (WORKSHOP_VIEW.suitScreenShare * g.stage.heightPx) / SUIT_HEIGHT / g.stage.ppm;
    g.camera.zoom = zoom;
    const camY = (WORKSHOP_VIEW.solesAt - 0.5) * (g.stage.heightPx / (g.stage.ppm * zoom));
    g.camera.snap(0, camY);
    g.camera.apply(dt);
    g.stand.position.set(0, 0.05);
    g.suitView.poseStatic(0, 0, 1, 1, this.time);
    g.drone.follow({ x: -0.85, y: 2.15 + Math.sin(this.time * 0.9) * 0.12 });
    g.drone.update(null, null, dt);
  }
}
