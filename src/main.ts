import { Game, RouteReload, SAVE_KEY } from './gameplay/Game';
import { ACTIVE_ROUTE } from './config/routes';
import { TUNNEL_KEY } from './gameplay/RouteLine';
import { CAMERA_STYLE } from './config/cameraStyle';
import { CameraTuner } from './ui/CameraTuner';
import { connectNative, restoreSave } from './services/native';
import { h } from './ui/dom';
import { Loader, nextPaint } from './ui/Loader';
import { loadIconImages } from './ui/iconImages';
import { Ui } from './ui/Ui';
import { loadDetailTextures } from './world/detailTextures';

/** Longest the loading screen waits for the first frames to settle (seconds), and at least how long it draws them. */
const SETTLE_MAX_SECONDS = 6;
const SETTLE_MIN_SECONDS = 1.2;
/** Frames drawn unseen before play, whatever the clock says. */
const SETTLE_MIN_FRAMES = 24;
/** Longest to wait for the sounds to render (a phone's slow offline render must not hold the game). */
const AUDIO_WAIT_MS = 4000;
/**
 * `?sim=1`: the pacing simulator drives this page (scripts/pacing.mjs). Once loaded the game stays paused and runs in
 * lockstep (`Game.lockstep`): it moves only when the simulator calls `simulate`, so a seed replays the same game.
 */
const SIM_DRIVEN = new URLSearchParams(location.search).get('sim') === '1';

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
  // Phase 4: the far end of the tunnel to a new line: the loading screen is the dark of the tunnel.
  const tunnel = takeTunnel();
  if (tunnel) loader.tunnel(ACTIVE_ROUTE.name);
  loader.progress(0.06);

  // In the app, a save the system cleared from the web view comes back from the app's own storage first.
  await restoreSave(SAVE_KEY);
  // Session 51: the item icons rendered from the models, decoded before anything draws an icon.
  await loadIconImages();
  loader.progress(0.14);
  await nextPaint();

  const ui = new Ui(overlay);
  // Sheets raised while starting up (offline earnings, offers, the press) wait until the intro is over.
  ui.screens.holdForTitle(true);
  let game: Game;
  try {
    game = new Game(canvas, overlay, ui);
  } catch (error) {
    // Phase 4: the save is on another route than the page loaded with; load again on it.
    if (error instanceof RouteReload) {
      location.reload();
      return;
    }
    loader.hide(true);
    overlay.appendChild(h('div.splash', {}, h('div.title', { text: 'Night Express' }), h('div.tag', { text: 'This phone could not start 3D graphics. Updating Chrome and Android System WebView usually fixes it.' })));
    throw error;
  }
  ui.bind(game);
  // Session 58: the My Perfect Hotel camera build's tuning panel.
  if (CAMERA_STYLE !== 'default') new CameraTuner(document.body, game.stage.rig, game.econ.camera);
  (window as unknown as { nightExpress: Game }).nightExpress = game;
  const app = connectNative({
    pause: () => game.toBackground(),
    resume: () => game.toForeground(),
    back: () => ui.closeTopSheet(),
  });
  loader.progress(0.42);
  await nextPaint();

  await loadDetailTextures();
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

  // No title screen and no story intro (session 32, owner: "loading and then gameplay"): everyone starts playing the
  // moment the loading screen goes. `Game.playIntro` stays for a future trailer but is not called.
  game.paused = SIM_DRIVEN;
  game.lockstep = SIM_DRIVEN;
  ui.screens.holdForTitle(false);
  if (tunnel) ui.tunnelOut(ACTIVE_ROUTE.name, (seconds) => game.analytics.log('route_transition_skipped', { route: ACTIVE_ROUTE.id, seconds: Math.round(seconds * 10) / 10 }));
  game.booted = true;
}

/** Phase 4: true once, on the load that follows opening a new line (RouteLine leaves the note on its way out). */
function takeTunnel(): boolean {
  try {
    const id = sessionStorage.getItem(TUNNEL_KEY);
    sessionStorage.removeItem(TUNNEL_KEY);
    return id === ACTIVE_ROUTE.id;
  } catch {
    return false;
  }
}

void boot();
