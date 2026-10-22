// The end screen (after the reference): "UPGRADE YOUR TRAIN!" over the game, a purple card showing the next carriage
// you could add, sliding from one to the next (an observation deck, a pool car, a gym car), the rewards it brings
// (+2 stars, x5 money) and one big Play Now button. Each carriage is drawn in isometric SVG here (a few KB, sharp at
// any size). The button (and the whole screen) calls `onPlay`, which is `openStore()` in network.ts: the one place
// the store link lives.

/** The words on the end screen (one line each to change). */
export const END_TITLE = 'UPGRADE YOUR TRAIN!';
export const END_BUTTON = 'PLAY NOW';
/** Seconds each carriage shows before the next slides in. */
export const SLIDE_SECONDS = 1.9;

type P3 = [number, number, number];
const C = 0.866;
const S = 20;
/** The carriage is drawn a little shorter and taller than life, so it reads as a chunky toy in the square card. */
const XS = 0.66;
const ZS = 1.25;
const iso = ([x, y, z]: P3): [number, number] => [(x * XS - y) * C * S, (x * XS + y) * 0.5 * S - z * ZS * S];

let minX = 1e9;
let minY = 1e9;
let maxX = -1e9;
let maxY = -1e9;
const INK = '#2B1E3A';
const OUT = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
const THIN = `stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"`;

function poly(points: P3[], fill: string, extra = OUT): string {
  const pts = points.map(iso);
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}" ${extra}/>`;
}
/** A box: its top, its +y face (lower left on screen) and its +x face (lower right). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, left: string, right: string, stroke = OUT): string {
  return (
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, stroke) +
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left, stroke) +
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right, stroke)
  );
}
const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): string => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
};
/** A box in one colour, its sides a little darker. */
const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string, stroke = THIN): string => box(x0, y0, z0, x1, y1, z1, c, shade(c, 0.82), shade(c, 0.68), stroke);

function wheel(x: number, y: number, z: number, r: number): string {
  const [cx, cy] = iso([x, y, z]);
  return `<g transform="matrix(${C},0.5,0,1,${cx.toFixed(1)},${cy.toFixed(1)})"><circle r="${r * S}" fill="#3A3550" stroke="${INK}" stroke-width="1.5"/><circle r="${r * 9}" fill="#C9A45C" stroke="${INK}" stroke-width="1"/></g>`;
}

const X0 = 0;
const X1 = 12;
const Y1 = 3;
const FLOOR = 1.0;
const BLUE = '#2F4FB8';
const GOLD = '#F2C24E';

/** The carriage around the room: rails, wheels, the floor, the far walls up, the near walls cut down low. */
function shell(floor: string, inside: () => string, roof = ''): string {
  let s = '';
  // Rails and sleepers.
  s += solid(-1.4, 0.2, -0.3, 13.4, Y1 - 0.2, 0, '#B8B2C8', 'stroke="none"');
  for (let x = -1; x < 13.2; x += 0.7) s += solid(x, 0.1, 0, x + 0.3, Y1 - 0.1, 0.1, '#8A5A3A');
  for (const y of [0.45, Y1 - 0.6]) s += solid(-1.4, y, 0.1, 13.4, y + 0.12, 0.22, '#E4E6EE');
  for (const bx of [1.4, 8.6]) {
    s += solid(bx, 0.4, 0.22, bx + 2, Y1 - 0.4, 0.62, '#3A3550');
    s += wheel(bx + 0.45, Y1 - 0.38, 0.45, 0.33) + wheel(bx + 1.55, Y1 - 0.38, 0.45, 0.33);
  }
  // Chassis and floor.
  s += box(X0, 0, 0.62, X1, Y1, FLOOR, floor, '#1E2A63', '#1A245A');
  // The far walls (the inside faces seen over the cut-away): the back wall and the front end.
  s += box(X0, 0, FLOOR, X1, 0.16, 2.7, '#24285A', '#E9DCC4', '#D9CBB2');
  s += box(X0, 0.16, FLOOR, 0.16, Y1, 2.7, '#24285A', '#D9CBB2', '#E9DCC4');
  s += inside();
  // The near walls, low: the livery outside, a gold line.
  s += box(X0, Y1 - 0.16, FLOOR, X1, Y1, 1.55, '#24285A', BLUE, '#26419A');
  s += poly([[X0, Y1 + 0.005, 1.38], [X1, Y1 + 0.005, 1.38], [X1, Y1 + 0.005, 1.46], [X0, Y1 + 0.005, 1.46]], GOLD, 'stroke="none"');
  s += box(X1 - 0.16, 0, FLOOR, X1, Y1 - 0.16, 1.55, '#24285A', '#26419A', '#26419A');
  s += roof;
  return s;
}

/** An observation deck: deep armchairs facing tall windows, a telescope, a glass dome over it all. */
function deckCar(): string {
  return shell('#B77B4B', () => {
    let s = '';
    // Tall windows along the back wall, showing the night.
    for (let x = 0.6; x < 11.2; x += 2.2) s += poly([[x, 0.17, 1.4], [x + 1.7, 0.17, 1.4], [x + 1.7, 0.17, 2.55], [x, 0.17, 2.55]], '#3B5BA8', `stroke="${GOLD}" stroke-width="1.5"`);
    s += poly([[0.4, 0.4, FLOOR + 0.01], [11.6, 0.4, FLOOR + 0.01], [11.6, 2.6, FLOOR + 0.01], [0.4, 2.6, FLOOR + 0.01]], '#8E2F3E', 'stroke="none"');
    for (let x = 1.2; x < 11; x += 2.4) {
      s += solid(x, 0.9, FLOOR, x + 0.9, 1.7, FLOOR + 0.35, '#C24A4A');
      s += solid(x, 0.75, FLOOR, x + 0.9, 0.95, FLOOR + 0.8, '#A83A3A');
      s += solid(x + 0.1, 1.8, FLOOR, x + 0.6, 2.2, FLOOR + 0.3, '#E8D7B0');
    }
    // A brass telescope on its tripod at the end.
    s += solid(10.6, 1.9, FLOOR, 10.75, 2.05, FLOOR + 0.9, '#C9A04E');
    s += solid(10.4, 1.7, FLOOR + 0.9, 11.2, 1.95, FLOOR + 1.1, '#D9B05A');
    return s;
  }, (() => {
    // The glass dome: ribs over the room, panes of pale blue glass.
    let r = '';
    const bands: [number, number][] = [[0.16, 2.7], [0.9, 3.25], [1.9, 3.3], [2.84, 1.55]];
    for (let i = 0; i < bands.length - 1; i++) {
      const [ya, za] = bands[i];
      const [yb, zb] = bands[i + 1];
      r += poly([[X0, ya, za], [X1, ya, za], [X1, yb, zb], [X0, yb, zb]], 'rgba(180, 220, 255, 0.28)', `stroke="${GOLD}" stroke-width="1.2"`);
    }
    for (let x = 0; x <= X1; x += 2) {
      for (let i = 0; i < bands.length - 1; i++) {
        const [a0, b0] = iso([x, bands[i][0], bands[i][1]]);
        const [a1, b1] = iso([x, bands[i + 1][0], bands[i + 1][1]]);
        r += `<line x1="${a0.toFixed(1)}" y1="${b0.toFixed(1)}" x2="${a1.toFixed(1)}" y2="${b1.toFixed(1)}" stroke="${GOLD}" stroke-width="1.6"/>`;
      }
    }
    return r;
  })());
}

/** A pool car: teak decking, a long blue pool with a white edge, loungers and a striped umbrella. */
function poolCar(): string {
  return shell('#C98A55', () => {
    let s = '';
    s += solid(1.6, 0.55, FLOOR, 9.6, 2.45, FLOOR + 0.06, '#F4F1EA');
    s += poly([[1.8, 0.75, FLOOR + 0.065], [9.4, 0.75, FLOOR + 0.065], [9.4, 2.25, FLOOR + 0.065], [1.8, 2.25, FLOOR + 0.065]], '#3FB7E6', 'stroke="none"');
    for (const [x, y] of [[3, 1.2], [5.4, 1.7], [7.6, 1.1], [4.2, 1.9]] as [number, number][]) {
      const [a, b] = iso([x, y, FLOOR + 0.07]);
      s += `<ellipse cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" rx="9" ry="2.5" fill="rgba(255,255,255,0.7)"/>`;
    }
    // A ladder at the near end.
    s += solid(9.2, 2.3, FLOOR, 9.3, 2.38, FLOOR + 0.5, '#D7DBE3');
    s += solid(9.2, 2.62, FLOOR, 9.3, 2.7, FLOOR + 0.5, '#D7DBE3');
    // Loungers on the deck past the pool, a towel on one.
    for (const y of [0.6, 1.8]) {
      s += solid(10.1, y, FLOOR, 11.6, y + 0.65, FLOOR + 0.22, '#FFFFFF');
      s += solid(10.1, y, FLOOR + 0.22, 10.5, y + 0.65, FLOOR + 0.55, '#FFFFFF');
    }
    s += solid(10.6, 1.85, FLOOR + 0.22, 11.4, 2.4, FLOOR + 0.26, '#F06A8A');
    // A striped umbrella over a little table.
    s += solid(0.8, 1.4, FLOOR, 0.9, 1.5, FLOOR + 1.3, '#E8E2D6');
    const top: P3 = [0.85, 1.45, FLOOR + 1.6];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      s += poly([top, [0.85 + Math.cos(a0) * 0.8, 1.45 + Math.sin(a0) * 0.8, FLOOR + 1.25], [0.85 + Math.cos(a1) * 0.8, 1.45 + Math.sin(a1) * 0.8, FLOOR + 1.25]], i % 2 ? '#FFFFFF' : '#E8455E', THIN);
    }
    return s;
  });
}

/** A gym car: treadmills along the windows, a bike, a rack of dumbbells, bright mats and a mirror. */
function gymCar(): string {
  return shell('#4A4E5A', () => {
    let s = '';
    // A long mirror on the back wall.
    s += poly([[1, 0.17, 1.3], [11, 0.17, 1.3], [11, 0.17, 2.5], [1, 0.17, 2.5]], '#BFE3F0', `stroke="${GOLD}" stroke-width="1.5"`);
    // Three treadmills facing the mirror.
    for (const x of [1.2, 3.4, 5.6]) {
      s += solid(x, 0.5, FLOOR, x + 1.4, 1.3, FLOOR + 0.18, '#2B2F3A');
      s += solid(x + 0.15, 0.55, FLOOR + 0.18, x + 1.25, 1.25, FLOOR + 0.2, '#16191F');
      s += solid(x + 0.1, 0.45, FLOOR + 0.18, x + 0.2, 0.6, FLOOR + 1.0, '#9AA3B5');
      s += solid(x + 0.1, 0.35, FLOOR + 0.95, x + 0.6, 0.65, FLOOR + 1.15, '#3FA34D');
    }
    // An exercise bike.
    s += solid(8.2, 0.7, FLOOR, 9.2, 1.0, FLOOR + 0.2, '#E8455E');
    s += solid(8.3, 0.75, FLOOR + 0.2, 8.45, 0.95, FLOOR + 0.8, '#E8455E');
    s += solid(8.1, 0.7, FLOOR + 0.8, 8.6, 1.0, FLOOR + 0.88, '#2B2F3A');
    // A rack of dumbbells.
    s += solid(9.8, 0.4, FLOOR, 11.4, 0.85, FLOOR + 0.6, '#5E6472');
    for (let x = 10; x < 11.3; x += 0.45) s += solid(x, 0.5, FLOOR + 0.6, x + 0.3, 0.75, FLOOR + 0.72, '#2B2F3A');
    // Mats, bright.
    for (const [x, c] of [[1.3, '#F2C24E'], [3.6, '#3FB7E6'], [5.9, '#9BC53D'], [8.2, '#F06A8A']] as [number, string][]) s += poly([[x, 1.8, FLOOR + 0.01], [x + 1.6, 1.8, FLOOR + 0.01], [x + 1.6, 2.6, FLOOR + 0.01], [x, 2.6, FLOOR + 0.01]], c, THIN);
    // A gym ball.
    const [bx, by] = iso([10.7, 2.2, FLOOR + 0.35]);
    s += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="8" fill="#7A5CD1" stroke="${INK}" stroke-width="1.2"/>`;
    return s;
  });
}

function svg(draw: () => string, label: string): string {
  minX = minY = 1e9;
  maxX = maxY = -1e9;
  const body = draw();
  const pad = 8;
  const vb = `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}`;
  return `<svg class="ad-art" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-label="${label}">${body}</svg>`;
}

const STAR = `<svg viewBox="0 0 64 64"><path d="M32 4l8.6 18.2 19.9 2.4-14.7 13.7 3.9 19.7L32 48.3 14.3 58l3.9-19.7L3.5 24.6l19.9-2.4z" fill="#FFC21A" stroke="#C26A00" stroke-width="4" stroke-linejoin="round"/><path d="M32 12l6 12.6 13.8 1.7L32 44z" fill="#FFE07A"/></svg>`;
const MONEY = `<svg viewBox="0 0 72 56">${[0, 1, 2]
  .map((i) => `<g transform="translate(${i * 2},${34 - i * 11}) skewX(-14)"><rect x="6" y="0" width="58" height="16" rx="3" fill="#2E9E3E" stroke="#145A22" stroke-width="3"/><rect x="10" y="3" width="50" height="10" rx="2" fill="#5ED168"/><ellipse cx="35" cy="8" rx="7" ry="5" fill="#2E9E3E"/></g>`)
  .join('')}</svg>`;

const SLIDES: { name: string; art: () => string }[] = [
  { name: 'OBSERVATION DECK', art: () => svg(deckCar, 'An observation deck carriage') },
  { name: 'POOL CAR', art: () => svg(poolCar, 'A pool carriage') },
  { name: 'GYM CAR', art: () => svg(gymCar, 'A gym carriage') },
];

export function buildEndCard(onPlay: () => void): { el: HTMLElement; show(): void } {
  const el = document.createElement('div');
  el.className = 'ad-end';
  el.innerHTML = `
    <div class="ad-end-title">${END_TITLE}</div>
    <div class="ad-end-card">
      <div class="ad-end-art"><div class="ad-end-glow"></div>${SLIDES.map((s, i) => `<div class="ad-slide${i === 0 ? ' on' : ''}">${s.art()}<b>${s.name}</b></div>`).join('')}</div>
      <div class="ad-end-row"><span class="ad-end-ico">${STAR}</span><b>+2</b></div>
      <div class="ad-end-row"><span class="ad-end-ico">${MONEY}</span><b>x5</b></div>
    </div>
    <button class="ad-end-btn" type="button">${END_BUTTON}</button>`;
  // The whole end screen leads to the store (the button pulses as the obvious target).
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onPlay();
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const slides = [...el.querySelectorAll('.ad-slide')] as HTMLElement[];
  let index = 0;
  let timer = 0;
  return {
    el,
    show() {
      el.classList.add('on');
      if (timer) return;
      // The carriages slide by one after another: the current one out to the left, the next in from the right.
      timer = window.setInterval(() => {
        const out = slides[index];
        index = (index + 1) % slides.length;
        const next = slides[index];
        out.classList.remove('on');
        out.classList.add('out');
        next.classList.remove('out');
        next.classList.add('on');
        window.setTimeout(() => out.classList.remove('out'), 600);
      }, SLIDE_SECONDS * 1000);
    },
  };
}
