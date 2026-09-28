import { Game } from './gameplay/Game';
import { h } from './ui/dom';
import { Ui } from './ui/Ui';

/** Boots the game: UI shell first (the mock services present through it), then the game, then the loop. */
function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui');
  if (!canvas || !overlay) throw new Error('Night Express: missing #scene or #ui');

  const ui = new Ui(overlay);
  let game: Game;
  try {
    game = new Game(canvas, overlay, ui);
  } catch (error) {
    overlay.appendChild(h('div.splash', {}, h('div.title', { text: 'Night Express' }), h('div.tag', { text: 'This device could not start 3D graphics. Try another browser.' })));
    throw error;
  }
  ui.bind(game);
  game.start();

  // Title card on a fresh page: sets the mood and turns sound on with the first tap.
  const splash = h('div.splash', { role: 'button', 'aria-label': 'Tap to play' },
    h('div.title', { html: 'Night<br>Express' }),
    h('div.tag', { text: 'Run a sleeper train that grows carriage by carriage.' }),
    h('div.tap', { text: 'Tap to play' }),
  );
  game.paused = true;
  const start = (): void => {
    game.audio.unlock();
    game.applySettings();
    splash.remove();
    game.paused = false;
  };
  splash.addEventListener('pointerdown', start, { once: true });
  overlay.appendChild(splash);

  (window as unknown as { nightExpress: Game }).nightExpress = game;
}

boot();
