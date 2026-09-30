import { Game } from './gameplay/Game';
import { h } from './ui/dom';
import { Ui } from './ui/Ui';

/** Boots the game: UI shell first (the mock services present through it), then the game, then the loop. */
function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui');
  if (!canvas || !overlay) throw new Error('Night Express: missing #scene or #ui');

  const ui = new Ui(overlay);
  // Sheets raised while starting up (offline earnings, offers, the press) wait until the intro is over.
  ui.screens.holdForTitle(true);
  let game: Game;
  try {
    game = new Game(canvas, overlay, ui);
  } catch (error) {
    overlay.appendChild(h('div.splash', {}, h('div.title', { text: 'Night Express' }), h('div.tag', { text: 'This device could not start 3D graphics. Try another browser.' })));
    throw error;
  }
  ui.bind(game);
  game.start();

  // No title screen: the game opens on the train. A brand-new player gets the short intro (skippable, the
  // game paused under it); anyone with a save is straight back on their train. Sound starts on the first
  // touch (browsers need one): Input unlocks it.
  const begin = (): void => {
    game.paused = false;
    ui.screens.holdForTitle(false);
  };
  if (game.isBrandNew) game.playIntro(begin);
  else begin();

  (window as unknown as { nightExpress: Game }).nightExpress = game;
}

boot();
