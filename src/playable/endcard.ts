// The end screen: the game itself is the background (the camera glides into the new Dining Car: white cloths, lamps,
// polished wood, velvet chairs, glasses and plates, diners at every table), with the title over it and one big Play
// Now button. The button (and the whole screen) calls `onPlay`, which is `openStore()` in network.ts: the one place
// the store link lives.

/** The words on the end screen (one line each to change). */
export const END_TITLE = 'UPGRADE YOUR TRAIN!';
export const END_BUTTON = 'PLAY NOW';

export function buildEndCard(onPlay: () => void): { el: HTMLElement; show(): void } {
  const el = document.createElement('div');
  el.className = 'ad-end';
  el.innerHTML = `
    <div class="ad-end-title">${END_TITLE}</div>
    <button class="ad-end-btn" type="button">${END_BUTTON}</button>`;
  // The whole end screen leads to the store (the button pulses as the obvious target).
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay();
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  return {
    el,
    show() {
      el.classList.add('on');
    },
  };
}
