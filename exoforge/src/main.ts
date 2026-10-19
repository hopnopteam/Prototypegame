// Boot: fonts, the physics engine, the art, then the game. A failure shows a plain message instead of a blank page.
import '@fontsource/lilita-one';
import '@fontsource/nunito/800.css';
import './ui/styles.css';
import { initPhysics } from './sim/physics';
import { loadAssets } from './render/assets';
import { Stage } from './render/Stage';
import { VIEW } from './render/config';
import { Game } from './game/Game';

declare global {
  interface Window {
    __exo?: { state: () => Record<string, unknown>; game: Game };
  }
}

function blockPageGestures(frame: HTMLElement): void {
  // No pinch zoom, double-tap zoom, long-press menu or pull-to-refresh (SPEC A3).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault());
  frame.addEventListener('contextmenu', (e) => e.preventDefault());
  frame.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  frame.addEventListener('dblclick', (e) => e.preventDefault());
}

function fitFrame(frame: HTMLElement): void {
  const wide = window.innerWidth / window.innerHeight > VIEW.letterboxAbove;
  frame.classList.toggle('letterbox', wide);
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const frame = document.createElement('div');
  frame.id = 'frame';
  app.append(frame);
  fitFrame(frame);
  window.addEventListener('resize', () => fitFrame(frame));
  blockPageGestures(frame);
  const loading = document.createElement('div');
  loading.className = 'boot';
  loading.textContent = 'EXOFORGE';
  frame.append(loading);
  try {
    await Promise.all([document.fonts.load('48px "Lilita One"'), document.fonts.load('800 16px "Nunito"'), initPhysics(), loadAssets()]);
    const stage = new Stage(frame);
    await stage.init();
    const game = new Game(frame, stage);
    window.__exo = { state: () => game.snapshot(), game };
    loading.remove();
    game.start();
  } catch (error) {
    console.error('EXOFORGE failed to start', error);
    loading.innerHTML = 'EXOFORGE<small></small>';
    loading.querySelector('small')!.textContent = `It could not start here: ${error instanceof Error ? error.message : String(error)}`;
  }
}

void boot();
