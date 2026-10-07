import { Game, SAVE_KEY } from './gameplay/Game';
import { connectNative, restoreSave } from './services/native';
import { h } from './ui/dom';
import { Ui } from './ui/Ui';

/** Boots the game: UI shell first (the mock services present through it), then the game, then the loop. */
async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui');
  if (!canvas || !overlay) throw new Error('Night Express: missing #scene or #ui');

  // In the app, a save the system cleared from the web view comes back from the app's own storage first.
  await restoreSave(SAVE_KEY);

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
  (window as unknown as { nightExpress: Game }).nightExpress = game;
  const app = connectNative({
    pause: () => game.toBackground(),
    resume: () => game.toForeground(),
    back: () => ui.closeTopSheet(),
  });

  // No title screen. A brand-new player gets the short story first (session 23, owner: "the continuation is
  // skipping a bit of story": three camera shots with a caption each, about seven seconds, skippable): the night
  // train at Millbrook, the old carriage under its canvas, the travellers at the ticket stand; then play. Anyone
  // with a save is straight back on their train. Sound starts on the first touch (browsers need one): Input
  // unlocks it. Every shader is compiled first, so play never stalls.
  const begin = (): void => {
    game.paused = false;
    ui.screens.holdForTitle(false);
  };
  await game.stage.warmUp();
  game.start();
  // The app's launch screen stays up until the first frame is drawn.
  requestAnimationFrame(() => requestAnimationFrame(() => app.ready()));
  if (game.isBrandNew) game.playIntro(begin);
  else begin();
}

void boot();
