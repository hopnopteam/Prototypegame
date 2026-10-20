// The end card: "CHOOSE NEXT HOTEL", a purple card with the next hotel (a snowy log-cabin lodge drawn in isometric
// SVG, so it costs a few KB and stays sharp at any size), its rewards and a big green Play Now button.

/** The text on the card (one line to change). */
export const END_TITLE = 'CHOOSE NEXT HOTEL';
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

/** A window on the +y face (x0..x1 along, z0..z1 up) or the +x face (y0..y1 along). */
function windowY(y: number, x0: number, x1: number, z0: number, z1: number): string {
  const xm = (x0 + x1) / 2;
  return (
    poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], 'url(#glass)', OUT) +
    poly([[x0 + 0.08, y, z1 - 0.15], [x0 + 0.35, y, z1 - 0.15], [x0 + 0.08, y, z0 + 0.6]], 'rgba(255,255,255,0.55)') +
    `<line x1="${iso([xm, y, z0])[0]}" y1="${iso([xm, y, z0])[1]}" x2="${iso([xm, y, z1])[0]}" y2="${iso([xm, y, z1])[1]}" stroke="#2B1E3A" stroke-width="1.4"/>`
  );
}
function windowX(x: number, y0: number, y1: number, z0: number, z1: number): string {
  const ym = (y0 + y1) / 2;
  return (
    poly([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], 'url(#glass2)', OUT) +
    `<line x1="${iso([x, ym, z0])[0]}" y1="${iso([x, ym, z0])[1]}" x2="${iso([x, ym, z1])[0]}" y2="${iso([x, ym, z1])[1]}" stroke="#2B1E3A" stroke-width="1.4"/>`
  );
}

/** A pine tree standing at a ground point: a trunk and three tiers, lit from the left. */
function tree(x: number, y: number, s: number): string {
  const [sx, sy] = iso([x, y, 0]);
  minX = Math.min(minX, sx - 26 * s);
  maxX = Math.max(maxX, sx + 26 * s);
  minY = Math.min(minY, sy - 80 * s);
  let out = `<rect x="${sx - 3 * s}" y="${sy - 12 * s}" width="${6 * s}" height="${12 * s}" fill="#7A4A2A" stroke="#2B1E3A" stroke-width="1.4"/>`;
  out += `<ellipse cx="${sx}" cy="${sy}" rx="${16 * s}" ry="${6 * s}" fill="rgba(60,110,170,0.25)"/>`;
  for (let i = 0; i < 3; i++) {
    const w = (22 - i * 5) * s;
    const b = sy - (10 + i * 17) * s;
    const t = b - 30 * s;
    out += `<polygon points="${sx - w},${b} ${sx},${t} ${sx + w},${b}" fill="#2FA84F" ${OUT}/>`;
    out += `<polygon points="${sx},${t} ${sx + w},${b} ${sx},${b}" fill="#1F8A3E"/>`;
    out += `<polygon points="${sx - w * 0.55},${b - 9 * s} ${sx},${t + 3 * s} ${sx - w * 0.15},${b - 9 * s}" fill="#5CCB6E"/>`;
  }
  return out;
}

function hotelSvg(): string {
  minX = minY = 1e9;
  maxX = maxY = -1e9;
  let s = '';
  // The snowy ground: a thick slab, ice-blue sides, ski tracks across the top.
  s += box(-0.6, -0.5, -0.7, 9.2, 8.6, 0, '#EEF8FF', '#A7D6F2', '#86C1E6');
  const track = (pts: P3[]) => `<polyline points="${pts.map((p) => iso(p).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#C9E6F8" stroke-width="3" stroke-linecap="round"/>`;
  s += track([[8.8, 1.0, 0], [7.9, 5.8, 0], [6.6, 7.4, 0], [3.4, 8.4, 0]]);
  s += track([[9.1, 2.2, 0], [8.5, 6.2, 0], [7.3, 7.9, 0], [4.8, 8.6, 0]]);
  // Trees behind the lodge.
  s += tree(0.0, 0.1, 1.0) + tree(1.6, -0.2, 0.85) + tree(-0.2, 3.4, 0.9);
  // The lodge: three storeys of logs.
  const X0 = 1.1;
  const X1 = 7.3;
  const Y0 = 0.9;
  const Y1 = 5.3;
  const H = 4.4;
  s += box(X0, Y0, 0, X1, Y1, H, '#C2651F', '#E0823A', '#B9581A');
  // The logs: lines along both faces.
  for (let z = 0.4; z < H; z += 0.4) {
    const a = iso([X0, Y1, z]);
    const b = iso([X1, Y1, z]);
    const c = iso([X1, Y0, z]);
    s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#9E4A14" stroke-width="1.3"/>`;
    s += `<line x1="${b[0]}" y1="${b[1]}" x2="${c[0]}" y2="${c[1]}" stroke="#8A3F10" stroke-width="1.3"/>`;
  }
  // Big windows on the long face, ground floor and upper floor, and the door.
  for (const [a, b] of [[1.5, 2.6], [3.0, 4.1], [6.0, 7.0]]) s += windowY(Y1 + 0.01, a, b, 0.5, 1.8);
  s += poly([[4.6, Y1 + 0.01, 0], [5.6, Y1 + 0.01, 0], [5.6, Y1 + 0.01, 1.7], [4.6, Y1 + 0.01, 1.7]], '#7B3E14', OUT);
  for (const [a, b] of [[1.5, 2.9], [3.5, 4.9], [5.6, 7.0]]) s += windowY(Y1 + 0.01, a, b, 2.6, 3.9);
  // The gable end: glass from the floor to the ridge, the A-frame look.
  const RZ = H + 2.0;
  const ym = (Y0 + Y1) / 2;
  s += poly([[X1, Y0, H], [X1, Y1, H], [X1, ym, RZ]], '#B9581A', OUT);
  s += windowX(X1 + 0.01, Y0 + 0.4, ym - 0.15, 0.5, 3.9) + windowX(X1 + 0.01, ym + 0.15, Y1 - 0.4, 0.5, 3.9);
  s += poly([[X1 + 0.01, Y0 + 0.7, H + 0.1], [X1 + 0.01, Y1 - 0.7, H + 0.1], [X1 + 0.01, ym, RZ - 0.6]], 'url(#glass2)', OUT);
  // The balcony along the long face.
  s += box(X0 - 0.2, Y1, 2.05, X1 + 0.2, Y1 + 0.75, 2.2, '#A65A22', '#8C4A1A', '#7A3F15');
  s += box(X0 - 0.2, Y1 + 0.65, 2.2, X1 + 0.2, Y1 + 0.75, 2.8, '#D98B4A', '#C07034', '#A65A22');
  for (let x = X0; x <= X1 + 0.1; x += 0.45) {
    const a = iso([x, Y1 + 0.75, 2.2]);
    const b = iso([x, Y1 + 0.75, 2.8]);
    s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#7A3F15" stroke-width="1.6"/>`;
  }
  // The roof: a dark gable, ridge along the lodge, deep eaves; the far slope's edge shows at the gable end.
  const o = 0.5;
  const eave = H - 0.3;
  s += poly([[X1 + o, ym, RZ], [X1 + o, Y0 - o, eave], [X1 + o + 0.05, Y0 - o, eave - 0.25], [X1 + o + 0.05, ym, RZ - 0.25]], '#1E1D33', OUT);
  s += poly([[X0 - o, ym, RZ], [X1 + o, ym, RZ], [X1 + o, Y1 + o, eave], [X0 - o, Y1 + o, eave]], '#3A3858', OUT);
  s += poly([[X0 - o, Y1 + o, eave], [X1 + o, Y1 + o, eave], [X1 + o, Y1 + o, eave - 0.25], [X0 - o, Y1 + o, eave - 0.25]], '#232238', OUT);
  s += poly([[X1 + o, ym, RZ], [X1 + o, Y1 + o, eave], [X1 + o, Y1 + o, eave - 0.25], [X1 + o, ym, RZ - 0.25]], '#232238', OUT);
  // Snow along the ridge, and two chimneys with smoke, standing on the near slope.
  s += poly([[X0 - o, ym, RZ + 0.02], [X1 + o, ym, RZ + 0.02], [X1 + o, ym + 0.5, RZ - 0.4], [X0 - o, ym + 0.5, RZ - 0.4]], '#F4FBFF', 'stroke="#2B1E3A" stroke-width="1.2"');
  const roofAt = (y: number) => RZ - ((y - ym) / (Y1 + o - ym)) * (RZ - eave);
  for (const cx of [2.2, 5.4]) {
    const cy = ym + 0.7;
    s += box(cx, cy, roofAt(cy + 0.7), cx + 0.7, cy + 0.7, RZ + 0.7, '#3E4B63', '#6E85A8', '#55698B');
    s += box(cx - 0.1, cy - 0.1, RZ + 0.7, cx + 0.8, cy + 0.8, RZ + 0.9, '#F4FBFF', '#C9E6F8', '#B2D8F0');
    const [sx, sy] = iso([cx + 0.35, cy + 0.35, RZ + 1.1]);
    s += `<g fill="#FFFFFF" stroke="#2B1E3A" stroke-width="1.4"><circle class="puff p1" cx="${sx}" cy="${sy - 6}" r="7"/><circle class="puff p2" cx="${sx + 6}" cy="${sy - 20}" r="9"/><circle class="puff p3" cx="${sx + 2}" cy="${sy - 36}" r="11"/></g>`;
    minY = Math.min(minY, sy - 50);
  }
  // A path to the door, and trees in front.
  s += poly([[4.6, Y1 + 0.8, 0.01], [5.6, Y1 + 0.8, 0.01], [6.0, 8.6, 0.01], [4.4, 8.6, 0.01]], '#D6ECFA');
  s += tree(8.6, 4.2, 0.95) + tree(8.0, 7.6, 1.1) + tree(1.6, 7.8, 0.85) + tree(-0.1, 6.4, 0.95);
  const pad = 8;
  const vb = `${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}`;
  return `<svg class="ad-hotel" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-label="The next hotel: a snowy log-cabin lodge">
<defs>
<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD3FF"/><stop offset="1" stop-color="#2F6FD0"/></linearGradient>
<linearGradient id="glass2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7EC1FF"/><stop offset="1" stop-color="#2557B8"/></linearGradient>
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
      <div class="ad-end-art"><div class="ad-end-glow"></div>${hotelSvg()}</div>
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
