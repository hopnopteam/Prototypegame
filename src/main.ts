import { Game, SAVE_KEY } from './gameplay/Game';
import { connectNative, restoreSave } from './services/native';
import { h } from './ui/dom';
import { Loader, nextPaint } from './ui/Loader';
import { Ui } from './ui/Ui';

/** Longest the loading screen waits for the first frames to settle (seconds), and at least how long it draws them. */
const SETTLE_MAX_SECONDS = 6;
const SETTLE_MIN_SECONDS = 1.2;
/** Frames drawn unseen before play, whatever the clock says. */
const SETTLE_MIN_FRAMES = 24;
/** Longest to wait for the sounds to render (a phone's slow offline render must not hold the game). */
const AUDIO_WAIT_MS = 4000;

/**
 * Boots the game behind the loading screen (session 26, owner: "right as the game starts it glitches quite a lot in
 * frame rate, then later gets smooth… a 5–6 second loading wouldn't hurt"). Everything that made the first seconds
 * stutter now happens unseen: the shaders compile (warm-up), the sounds render, and the game draws its first frames
 * behind the cover with a big work budget, until the light bake, the scenery and any rebuilds are done and the GPU
 * and the JIT are warm. Then one tap (where the browser needs it for sound) starts the music and the game together.
 */
async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const overlay = document.getElementById('ui');
  if (!canvas || !overlay) throw new Error('Night Express: missing #scene or #ui');
  const loader = new Loader(document.getElementById('loader'));
  loader.progress(0.06);

  // In the app, a save the system cleared from the web view comes back from the app's own storage first.
  await restoreSave(SAVE_KEY);
  loader.progress(0.14);
  await nextPaint();

  const ui = new Ui(overlay);
  // Sheets raised while starting up (offline earnings, offers, the press) wait until the intro is over.
  ui.screens.holdForTitle(true);
  let game: Game;
  try {
    game = new Game(canvas, overlay, ui);
  } catch (error) {
    loader.hide(true);
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
  loader.progress(0.42);
  await nextPaint();

  await game.stage.warmUp();
  loader.progress(0.66);
  if (!game.skippedEarly) await Promise.race([game.audio.ready(), new Promise((done) => setTimeout(done, AUDIO_WAIT_MS))]);
  loader.progress(0.74);

  // The first frames, drawn unseen (the game stays paused: the opening's clock does not run).
  game.paused = true;
  game.loading = true;
  game.start();
  // The app's launch screen gives way to the loading screen once there is a frame behind it.
  requestAnimationFrame(() => requestAnimationFrame(() => app.ready()));
  const started = performance.now();
  let frames = 0;
  while (!game.skippedEarly) {
    await nextPaint();
    frames++;
    const seconds = (performance.now() - started) / 1000;
    loader.progress(0.74 + 0.26 * Math.min(1, seconds / SETTLE_MIN_SECONDS, frames / SETTLE_MIN_FRAMES));
    if ((game.settled && seconds >= SETTLE_MIN_SECONDS && frames >= SETTLE_MIN_FRAMES) || seconds >= SETTLE_MAX_SECONDS) break;
  }
  game.loading = false;
  loader.progress(1);

  // Session 29 (partner: "audio starts quietly after the first touch (browser rule); never show a prompt for it"): no
  // "Tap to play". The apps start the sound at once; in a browser tab it starts, fading in, on the player's first touch.
  if (!game.skippedEarly) await game.audio.tryStart();
  loader.hide(game.skippedEarly);
  game.audio.startMusic();
  game.stage.restartJudging();

  // No title screen. A brand-new player gets the short story first (session 23: three camera shots with a caption
  // each, about seven seconds, skippable); anyone with a save is straight back on their train.
  const begin = (): void => {
    game.paused = false;
    ui.screens.holdForTitle(false);
  };
  if (game.isBrandNew) game.playIntro(begin);
  else begin();
}

void boot();
