// Results over the last frame of the flight (SPEC A5.4), then back to the Workshop.
import type { Game, GameState } from '../Game';

export class ResultsState implements GameState {
  readonly name = 'results';

  constructor(private readonly game: Game) {
    game.results.onContinue = () => {
      if (this.game.state === this) this.game.go('workshop');
    };
  }

  enter(): void {
    const g = this.game;
    g.input.enabled = false;
    g.hud.visible = false;
    const stats = g.lastStats;
    if (!stats) {
      g.go('workshop');
      return;
    }
    const key = String(g.world.index);
    const before = g.save.data.best[key] ?? 0;
    const newBest = stats.maxHeight > before + 0.05 && stats.maxHeight >= 1;
    if (newBest) g.save.data.best[key] = stats.maxHeight;
    g.save.data.runs++;
    g.save.write();
    g.results.show(stats, Math.max(before, stats.maxHeight), newBest);
  }

  exit(): void {
    this.game.results.hide();
  }

  frame(dt: number): void {
    // The flight's last moment stays on screen behind the card; particles settle.
    this.game.particles.update(dt);
    this.game.camera.apply(dt);
  }
}
