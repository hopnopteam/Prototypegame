import { Game } from './gameplay/Game';
import { h } from './ui/dom';
import { Ui } from './ui/Ui';

/** Boots the game: UI shell first (the mock services present through it), then the game, then the loop. */
function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui');
  if (!canvas || !overlay) throw new Error('Night Express: missing #scene or #ui');

  const ui = new Ui(overlay);
  // Sheets raised while starting up (offline earnings, offers, the press) wait until play begins.
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

  // Title screen, in three fixed places: the logo card at the top, a clear view of the train waiting at
  // Millbrook in the middle (no pads, bubbles or labels over it), and one panel at the bottom with the
  // save and the button. The tap also turns sound on (browsers need one). New players then get the short
  // intro; anyone with a save goes straight back to their train.
  const brandNew = game.isBrandNew;
  const livery = game.currentLivery();
  const carriages = game.train.count;
  const saveCard = brandNew
    ? null
    : h('div.save-card', {},
      h('span.swatch', { style: { background: livery.body, borderColor: livery.trim } }),
      h('div.save-text', {},
        h('b', { text: game.data.press.trainName ?? 'Your train' }),
        h('span', { text: `Route level ${game.progression.level} · ${carriages} carriage${carriages === 1 ? '' : 's'}` }),
      ));
  const play = h('button.title-play', {}, brandNew ? 'Play' : 'Continue');
  const splash = h('div.splash', { role: 'dialog', 'aria-label': 'Night Express' },
    h('header.title-card', {},
      h('div.kicker', { text: 'The Countryside Local' }),
      h('h1.wordmark', { html: 'Night<br>Express' }),
      h('div.rule'),
      h('p.tag', { text: 'Run a sleeper train that grows carriage by carriage.' }),
    ),
    h('div.title-view'),
    h('footer.title-panel', {},
      saveCard,
      play,
      h('div.foot', { text: 'Hopnop · publisher prototype' }),
    ),
  );
  game.paused = true;
  game.setAttract(true);
  overlay.classList.add('title-screen');
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    game.audio.unlock();
    game.applySettings();
    game.setAttract(false);
    splash.classList.add('out');
    window.setTimeout(() => splash.remove(), 380);
    const begin = (): void => {
      overlay.classList.remove('title-screen');
      game.paused = false;
      ui.screens.holdForTitle(false);
    };
    if (brandNew) game.playIntro(begin);
    else begin();
  };
  // The button is the call to action; a tap anywhere else on the title works too.
  splash.addEventListener('pointerdown', start, { once: true });
  overlay.appendChild(splash);

  (window as unknown as { nightExpress: Game }).nightExpress = game;
}

boot();
