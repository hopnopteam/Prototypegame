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

  // Title screen: the train waits at Millbrook under a slow camera drift; one clear button to start. It
  // also turns sound on (browsers need a tap first). New players then get the short intro; anyone with a
  // save goes straight back to their train.
  const brandNew = game.isBrandNew;
  const saveLine = brandNew
    ? null
    : `${game.data.press.trainName ?? 'Your train'} · Level ${game.progression.level} · ${game.train.count} carriage${game.train.count === 1 ? '' : 's'}`;
  const play = h('button.title-play', {}, brandNew ? 'Play' : 'Continue');
  const splash = h('div.splash', { role: 'dialog', 'aria-label': 'Night Express' },
    h('div.logo', {},
      h('div.kicker', { text: 'The Countryside Local' }),
      h('div.wordmark', { html: 'Night<br>Express' }),
      h('div.tag', { text: 'Run a sleeper train that grows carriage by carriage.' }),
    ),
    h('div.actions', {}, play, saveLine ? h('div.save-line', { text: saveLine }) : null),
    h('div.foot', { text: 'Hopnop · publisher prototype' }),
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
