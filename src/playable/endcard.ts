// The end card: "CHOOSE NEXT TRAIN UPGRADE", a purple card with the next carriage (a luxury dining car drawn in isometric
// SVG in the game's First Class livery, so it costs a few KB and stays sharp at any size), its rewards (+2 stars, x5 money)
// and a big green Play Now button.

/** The text on the card (one line to change). */
export const END_TITLE = 'CHOOSE NEXT TRAIN UPGRADE';
export const END_BUTTON = 'PLAY NOW';

type P3 = [number, number, number];
const C = 0.866;
const iso = ([x, y, z]: P3): [number, number] => [(x - y) * C * 20, (x + y) * 0.5 * 20 - z * 20];

let minX = 1e9;
let minY = 1e9;
let maxX = -1e9;
let maxY = -1e9;
function poly(points: P3[], fill: string, extra = ''): string {
  const pts = points.map(iso);
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}" ${extra}/>`;
}
const OUT = 'stroke="#2B1E3A" stroke-width="1.6" stroke-linejoin="round"';

/** An axis-aligned box: its top, its +y face (lower left on screen) and its +x face (lower right). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, left: string, right: string, stroke = OUT): string {
  return (
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, stroke) +
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left, stroke) +
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right, stroke)
  );
}

/** A pair of rails on sleepers along x, on a ballast bed. */
function track(x0: number, x1: number, y0: number, y1: number): string {
  let s = box(x0, y0 - 0.5, -0.35, x1, y1 + 0.5, 0, '#B8B2C8', '#8E86A6', '#7A7294');
  for (let x = x0 + 0.35; x < x1; x += 0.7) s += box(x, y0 - 0.25, 0, x + 0.32, y1 + 0.25, 0.1, '#8A5A3A', '#6E452B', '#5E3A24', 'stroke="#2B1E3A" stroke-width="0.8"');
  for (const y of [y0, y1]) s += box(x0, y, 0.1, x1, y + 0.12, 0.24, '#E4E6EE', '#A9ADBC', '#8C90A0', 'stroke="#2B1E3A" stroke-width="0.8"');
  return s;
}

/** A wheel seen from the +y side: an ellipse on the side face. */
function wheel(x: number, y: number, z: number, r: number): string {
  const [cx, cy] = iso([x, y, z]);
  // On the +y face, x runs along (C, 0.5) and z straight up: the circle becomes a slanted ellipse.
  return `<g transform="matrix(${C},0.5,0,1,${cx.toFixed(1)},${cy.toFixed(1)})"><circle r="${r * 20}" fill="#3A3550" stroke="#2B1E3A" stroke-width="1.6"/><circle r="${r * 9}" fill="#C9A45C" stroke="#2B1E3A" stroke-width="1.2"/></g>`;
}

/** Text painted on the +y side of the carriage. */
function sideText(x: number, y: number, z: number, text: string, size: number, fill: string): string {
  const [cx, cy] = iso([x, y, z]);
  return `<text transform="matrix(${C},0.5,0,1,${cx.toFixed(1)},${cy.toFixed(1)})" font-family="Jost, Futura, sans-serif" font-weight="800" font-size="${size}" letter-spacing="2" text-anchor="middle" fill="${fill}" stroke="#2B1E3A" stroke-width="0.6" paint-order="stroke">${text}</text>`;
}

/**
 * The next train upgrade: a luxury dining carriage in the game's First Class livery (royal blue and gold), lamplit
 * tables in its windows, on a short length of track.
 */
function carriageSvg(): string {
  minX = minY = 1e9;
  maxX = maxY = -1e9;
  const X0 = 0;
  const X1 = 12;
  const Y0 = 0.2;
  const Y1 = 2.8;
  let s = track(-1.6, 13.6, Y0 + 0.25, Y1 - 0.37);
  // Bogies and wheels.
  for (const bx of [1.4, 8.6]) {
    s += box(bx, Y0 + 0.3, 0.24, bx + 2.0, Y1 - 0.3, 0.72, '#3A3550', '#2E2A42', '#26223A');
    s += wheel(bx + 0.45, Y1 - 0.29, 0.5, 0.36) + wheel(bx + 1.55, Y1 - 0.29, 0.5, 0.36);
  }
  // The body: navy underframe, royal blue sides, a gold line top and bottom.
  const Z0 = 0.72;
  const Z1 = 3.3;
  s += box(X0, Y0, Z0, X1, Y1, Z1, '#2E4AA8', '#2F4FB8', '#26419A');
  s += poly([[X0, Y1 + 0.005, Z0], [X1, Y1 + 0.005, Z0], [X1, Y1 + 0.005, Z0 + 0.5], [X0, Y1 + 0.005, Z0 + 0.5]], '#1E2A63');
  for (const z of [Z0 + 0.5, Z1 - 0.32]) s += poly([[X0, Y1 + 0.01, z], [X1, Y1 + 0.01, z], [X1, Y1 + 0.01, z + 0.09], [X0, Y1 + 0.01, z + 0.09]], '#F2C24E');
  for (const z of [Z0 + 0.5, Z1 - 0.32]) s += poly([[X1 + 0.01, Y0, z], [X1 + 0.01, Y1, z], [X1 + 0.01, Y1, z + 0.09], [X1 + 0.01, Y0, z + 0.09]], '#D9A73A');
  // Lamplit windows: a warm glow, a table lamp and a diner's silhouette in each.
  for (let i = 0; i < 6; i++) {
    const a = 0.7 + i * 1.82;
    const b = a + 1.2;
    const w0 = 1.62;
    const w1 = 2.78;
    s += poly([[a, Y1 + 0.012, w0], [b, Y1 + 0.012, w0], [b, Y1 + 0.012, w1], [a, Y1 + 0.012, w1]], 'url(#warm)', 'stroke="#F2C24E" stroke-width="1.8" stroke-linejoin="round"');
    const m = (a + b) / 2;
    s += poly([[m - 0.42, Y1 + 0.014, w0], [m + 0.42, Y1 + 0.014, w0], [m + 0.42, Y1 + 0.014, w0 + 0.22], [m - 0.42, Y1 + 0.014, w0 + 0.22]], '#FFF6E4');
    s += poly([[m - 0.14, Y1 + 0.016, w0 + 0.42], [m + 0.14, Y1 + 0.016, w0 + 0.42], [m + 0.08, Y1 + 0.016, w0 + 0.62], [m - 0.08, Y1 + 0.016, w0 + 0.62]], '#E8573C');
    if (i % 2 === 0) s += poly([[a + 0.12, Y1 + 0.015, w0], [a + 0.38, Y1 + 0.015, w0], [a + 0.38, Y1 + 0.015, w0 + 0.62], [a + 0.25, Y1 + 0.015, w0 + 0.78], [a + 0.12, Y1 + 0.015, w0 + 0.62]], 'rgba(60,30,40,0.55)');
    s += poly([[a + 0.06, Y1 + 0.016, w1 - 0.1], [a + 0.3, Y1 + 0.016, w1 - 0.1], [a + 0.06, Y1 + 0.016, w0 + 0.55]], 'rgba(255,255,255,0.45)');
  }
  s += sideText(6, Y1 + 0.02, Z0 + 0.12, 'DINING CAR', 9, '#F2C24E');
  // The end: a door with a lit window, the gangway bellows, a brass lamp.
  s += poly([[X1 + 0.012, 1.0, Z0 + 0.1], [X1 + 0.012, 2.0, Z0 + 0.1], [X1 + 0.012, 2.0, Z1 - 0.45], [X1 + 0.012, 1.0, Z1 - 0.45]], '#22306E', 'stroke="#F2C24E" stroke-width="1.4"');
  s += poly([[X1 + 0.014, 1.2, 2.0], [X1 + 0.014, 1.8, 2.0], [X1 + 0.014, 1.8, 2.7], [X1 + 0.014, 1.2, 2.7]], 'url(#warm)', OUT);
  s += box(X1, 0.95, Z0 + 0.3, X1 + 0.35, 2.05, Z1 - 0.2, '#3A3550', '#2E2A42', '#4A4466');
  for (const y of [0.45, 2.55]) {
    const [lx, ly] = iso([X1 + 0.02, y, 2.4]);
    s += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="6" fill="#FFE07A" stroke="#2B1E3A" stroke-width="1.4"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="13" fill="url(#glow)"/>`;
  }
  // The roof: a curved top in three bands, lamps and vents along it.
  const R = Z1 + 0.32;
  s += poly([[X0 - 0.1, Y1 + 0.1, Z1], [X1 + 0.1, Y1 + 0.1, Z1], [X1 + 0.1, Y1 - 0.5, R], [X0 - 0.1, Y1 - 0.5, R]], '#24285A', OUT);
  s += poly([[X1 + 0.1, Y0 - 0.1, Z1], [X1 + 0.1, Y1 + 0.1, Z1], [X1 + 0.1, Y1 - 0.5, R], [X1 + 0.1, Y0 + 0.5, R]], '#1C2050', OUT);
  s += poly([[X0 - 0.1, Y0 + 0.5, R], [X1 + 0.1, Y0 + 0.5, R], [X1 + 0.1, Y1 - 0.5, R], [X0 - 0.1, Y1 - 0.5, R]], '#3A3F7E', OUT);
  for (const x of [2.2, 6, 9.8]) s += box(x, 1.2, R, x + 0.6, 1.8, R + 0.22, '#C9A45C', '#A88644', '#8E7038', 'stroke="#2B1E3A" stroke-width="1"');
  // A gold star over the roof: the upgrade.
  const [stx, sty] = iso([6, 1.5, R + 1.3]);
  s += `<g transform="translate(${stx.toFixed(1)},${sty.toFixed(1)})"><path class="twinkle" d="M0-16l4.6 9.6 10.6 1.3-7.8 7.3 2 10.5L0 7.6l-9.4 5.1 2-10.5-7.8-7.3 10.6-1.3z" fill="#FFD23A" stroke="#C26A00" stroke-width="2.4" stroke-linejoin="round"/></g>`;
  minY = Math.min(minY, sty - 24);
  const pad = 10;
  const vb = `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}`;
  return `<svg class="ad-art" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-label="The next upgrade: a luxury dining carriage">
<defs>
<linearGradient id="warm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#F2A43A"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#FFE07A" stop-opacity="0.75"/><stop offset="1" stop-color="#FFE07A" stop-opacity="0"/></radialGradient>
</defs>${s}</svg>`;
}

const STAR = `<svg viewBox="0 0 64 64"><path d="M32 4l8.6 18.2 19.9 2.4-14.7 13.7 3.9 19.7L32 48.3 14.3 58l3.9-19.7L3.5 24.6l19.9-2.4z" fill="#FFC21A" stroke="#C26A00" stroke-width="4" stroke-linejoin="round"/><path d="M32 12l6 12.6 13.8 1.7L32 44z" fill="#FFE07A"/></svg>`;
const MONEY = `<svg viewBox="0 0 72 56">${[0, 1, 2]
  .map((i) => {
    const y = 34 - i * 11;
    return `<g transform="translate(${i * 2},${y}) skewX(-14)"><rect x="6" y="0" width="58" height="16" rx="3" fill="#2E9E3E" stroke="#145A22" stroke-width="3"/><rect x="10" y="3" width="50" height="10" rx="2" fill="#5ED168"/><ellipse cx="35" cy="8" rx="7" ry="5" fill="#2E9E3E"/></g>`;
  })
  .join('')}</svg>`;

export function buildEndCard(onPlay: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ad-end';
  el.innerHTML = `
    <div class="ad-end-title">${END_TITLE}</div>
    <div class="ad-end-card">
      <div class="ad-end-art"><div class="ad-end-glow"></div>${carriageSvg()}</div>
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
  return el;
}
