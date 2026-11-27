import type { LineTransitionDef } from '../config/lineTransition';
import type { RouteArchive } from '../save/SaveData';

/** Each carriage's paint on the postcard: its body, the panels above the waist and its roof. */
const CAR_PAINT: Record<string, [string, string]> = {
  lobby: ['#3F6E53', '#E9DFC4'], cafe: ['#B8574A', '#F1E4CC'], sleeper: ['#2C4A6E', '#E6DCC6'], bathroom: ['#5E8C8A', '#EEE6D2'],
  bar: ['#6B3A4A', '#E9D9C0'], dining: ['#7A2E2E', '#EFE0C6'], familySleeper: ['#C98552', '#F3E6CF'], cinema: ['#5A2A3A', '#E8D6BE'],
  pool: ['#3E8FC9', '#F4EEDF'], kids: ['#E0A33A', '#F7EDD6'], spa: ['#7FAF9A', '#F2EDDF'], honeymoon: ['#C9657A', '#F6E8DA'],
  dome: ['#2E4A5E', '#E3DBC8'], stores: ['#6E6250', '#E6DCC6'], luggage: ['#7A6A52', '#E6DCC6'], sleeper2: ['#2C4A6E', '#E6DCC6'],
  beachLounge: ['#2E9AA6', '#F6EEDB'],
};
const W = 300;
const H = 196;
const INSET = 14;
const SCENE = { x: INSET + 4, y: INSET + 4, w: W - (INSET + 4) * 2, h: 118 };
const RAIL_Y = SCENE.y + 96;
const SERIF = '"Playfair Display", Georgia, serif';

/**
 * The finished train's postcard, painted again every time it is shown (nothing is stored; seeded by the line, so it
 * always looks the same): a cream card with perforated edges and a fine frame, a painted dusk over the line's country
 * (a sky with a low sun and stars, layered hills, a lake with its reflection), the train as it was left crossing a
 * viaduct (the engine with its smoke and every carriage the route left with, each in its own paint with lit windows),
 * the line's stamp and caption, the train's numbers and a postmark with cancellation waves. `scale` is the device
 * pixel ratio to draw at.
 */
export function drawLinePostcard(canvas: HTMLCanvasElement, def: LineTransitionDef, archive: RouteArchive | null, routeName: string, scale: number): void {
  canvas.width = W * scale;
  canvas.height = H * scale;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.scale(scale, scale);
  const rand = rng(hash(def.postcard.stamp));
  const coast = /COAST|RIVIERA/i.test(def.postcard.stamp);
  paper(g, rand);
  g.save();
  rounded(g, SCENE.x, SCENE.y, SCENE.w, SCENE.h, 3);
  g.clip();
  scene(g, rand, coast);
  const cars = archive?.route.carriages ?? ['lobby'];
  train(g, cars, coast);
  g.restore();
  g.strokeStyle = def.postcard.frame;
  g.lineWidth = 1.2;
  rounded(g, SCENE.x, SCENE.y, SCENE.w, SCENE.h, 3);
  g.stroke();
  g.lineWidth = 2.4;
  g.strokeRect(INSET - 3, INSET - 3, W - (INSET - 3) * 2, H - (INSET - 3) * 2);
  lettering(g, def, archive, routeName, cars.length);
  postmark(g);
}

/** Cream paper with perforated edges and a little grain. */
function paper(g: CanvasRenderingContext2D, rand: () => number): void {
  const p = g.createLinearGradient(0, 0, W, H);
  p.addColorStop(0, '#FCF6E6');
  p.addColorStop(1, '#F1E6CC');
  g.fillStyle = p;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120, 96, 60, 0.05)' : 'rgba(255, 255, 255, 0.12)';
    g.fillRect(rand() * W, rand() * H, 1, 1);
  }
  g.globalCompositeOperation = 'destination-out';
  for (let x = 6; x < W; x += 11) for (const y of [0, H]) dot(g, x, y, 3.6);
  for (let y = 6; y < H; y += 11) for (const x of [0, W]) dot(g, x, y, 3.6);
  g.globalCompositeOperation = 'source-over';
}

/** Dusk over the line's country: sky, sun, stars, hills, water and the viaduct the train crosses. */
function scene(g: CanvasRenderingContext2D, rand: () => number, coast: boolean): void {
  const { x, y, w, h } = SCENE;
  const horizon = y + 62;
  const sky = g.createLinearGradient(0, y, 0, horizon);
  sky.addColorStop(0, coast ? '#3A5E9A' : '#2B3A68');
  sky.addColorStop(0.55, coast ? '#E98E7A' : '#B9727A');
  sky.addColorStop(1, coast ? '#FFD39A' : '#F6BE86');
  g.fillStyle = sky;
  g.fillRect(x, y, w, horizon - y + 2);
  for (let i = 0; i < 34; i++) {
    const sx = x + rand() * w;
    const sy = y + rand() * 30;
    g.fillStyle = `rgba(255, 250, 230, ${0.3 + rand() * 0.6})`;
    g.fillRect(sx, sy, rand() < 0.15 ? 1.6 : 0.9, rand() < 0.15 ? 1.6 : 0.9);
  }
  // A low sun with a soft halo.
  const sunX = x + w * 0.42;
  const sunY = horizon - 19;
  const halo = g.createRadialGradient(sunX, sunY, 1, sunX, sunY, 44);
  halo.addColorStop(0, 'rgba(255, 236, 190, 0.9)');
  halo.addColorStop(1, 'rgba(255, 220, 170, 0)');
  g.fillStyle = halo;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#FFE9B8';
  dot(g, sunX, sunY, 8);
  // Streaks of cloud lit from below.
  for (let c = 0; c < 4; c++) {
    const cy = y + 18 + c * 9 + rand() * 4;
    const cx = x + rand() * w;
    const len = 50 + rand() * 60;
    g.fillStyle = `rgba(255, 214, 180, ${0.25 + rand() * 0.2})`;
    g.beginPath();
    g.ellipse(cx, cy, len / 2, 1.6 + rand() * 1.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Layered hills (or headlands on the coast), each a little darker and nearer.
  const layers = coast ? ['#8C7A9E', '#6E8A7A', '#4F7558'] : ['#7E7AA0', '#5E7A78', '#456C4E'];
  layers.forEach((col, i) => ridge(g, rand, horizon - 10 + i * 7, 8 - i * 1.5, 0.03 + i * 0.012, col));
  // Water from the horizon down, the sun's path on it.
  const lake = g.createLinearGradient(0, horizon + 8, 0, y + h);
  lake.addColorStop(0, coast ? '#5FA6C6' : '#7C86A8');
  lake.addColorStop(1, coast ? '#1F5E86' : '#2E3E62');
  g.fillStyle = lake;
  g.fillRect(x, horizon + 12, w, y + h - horizon - 12);
  for (let i = 0; i < 26; i++) {
    const ry = horizon + 14 + i * 1.6;
    const rw = 4 + i * 0.9 + rand() * 4;
    g.fillStyle = `rgba(255, 226, 170, ${0.55 - i * 0.018})`;
    g.fillRect(sunX - rw / 2 + (rand() - 0.5) * 3, ry, rw, 0.8);
  }
  // Near bank and trees (palms on the coast).
  g.fillStyle = coast ? '#C9A46A' : '#3E5E3A';
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, RAIL_Y + 14);
  g.quadraticCurveTo(x + w * 0.3, RAIL_Y + 8, x + w * 0.55, RAIL_Y + 16);
  g.quadraticCurveTo(x + w * 0.8, RAIL_Y + 22, x + w, RAIL_Y + 12);
  g.lineTo(x + w, y + h);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const tx = x + 10 + i * (w / 6) + rand() * 12;
    if (coast) palm(g, tx, RAIL_Y + 18, 14 + rand() * 6);
    else tree(g, rand, tx, RAIL_Y + 18, 7 + rand() * 4);
  }
  // The viaduct: stone arches over the water.
  g.fillStyle = coast ? '#D8C3A0' : '#9C8F80';
  g.fillRect(x, RAIL_Y + 2, w, 4);
  for (let ax = x - 6; ax < x + w; ax += 22) {
    g.beginPath();
    g.moveTo(ax, RAIL_Y + 6);
    g.lineTo(ax + 22, RAIL_Y + 6);
    g.lineTo(ax + 22, y + h);
    g.lineTo(ax + 18, y + h);
    g.lineTo(ax + 18, RAIL_Y + 16);
    g.arc(ax + 11, RAIL_Y + 16, 7, 0, Math.PI, true);
    g.lineTo(ax + 4, y + h);
    g.lineTo(ax, y + h);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.18)';
  g.fillRect(x, RAIL_Y + 6, w, 1.2);
  g.fillStyle = '#3A3430';
  g.fillRect(x, RAIL_Y + 0.8, w, 1.4);
}

/** The engine and the carriages, side-on on the viaduct, the engine to the right with its smoke trailing back. */
function train(g: CanvasRenderingContext2D, cars: readonly string[], coast: boolean): void {
  const engineW = 30;
  const avail = SCENE.w - engineW - 14;
  const carW = Math.max(12, Math.min(28, avail / Math.max(1, cars.length)));
  const totalW = engineW + carW * cars.length;
  let right = SCENE.x + SCENE.w / 2 + totalW / 2;
  const base = RAIL_Y;
  // Smoke first, behind everything: puffs drifting back over the carriages.
  for (let i = 0; i < 9; i++) {
    const px = right - 8 - i * 11;
    const py = base - 30 - i * 1.4 - Math.sin(i * 1.3) * 2;
    g.fillStyle = `rgba(240, 234, 228, ${0.75 - i * 0.07})`;
    dot(g, px, py, 4 + i * 0.9);
  }
  engine(g, right - engineW, base, engineW, coast);
  right -= engineW + 1;
  for (const type of cars) {
    carriage(g, right - carW + 1, base, carW - 1, CAR_PAINT[type] ?? ['#5A6470', '#E6DCC6']);
    right -= carW;
  }
}

function engine(g: CanvasRenderingContext2D, x: number, base: number, w: number, coast: boolean): void {
  const body = coast ? '#2E7FB8' : '#2E5A3E';
  // Tender at the back, then the boiler, cab and chimney.
  g.fillStyle = body;
  g.fillRect(x, base - 11, 8, 9);
  g.fillStyle = '#1E1E22';
  g.fillRect(x + 1, base - 13, 6, 2);
  g.fillStyle = body;
  g.fillRect(x + 9, base - 17, 8, 15);
  g.fillStyle = '#FFD98A';
  g.fillRect(x + 11, base - 15, 4, 4);
  g.fillStyle = '#1E2A22';
  g.fillRect(x + 8, base - 19, 10, 2);
  g.fillStyle = body;
  rounded(g, x + 17, base - 13, w - 18, 10, 3);
  g.fill();
  g.fillStyle = '#C9A35E';
  g.fillRect(x + 17, base - 9, w - 18, 1);
  g.fillStyle = '#1E1E22';
  g.fillRect(x + w - 8, base - 19, 3.4, 6);
  g.fillRect(x + w - 9, base - 20, 5.4, 1.4);
  g.fillStyle = '#FFF2C0';
  dot(g, x + w - 0.6, base - 8, 1.4);
  wheels(g, x + 2, base, [3, 13, 20, 26], 2.6);
}

function carriage(g: CanvasRenderingContext2D, x: number, base: number, w: number, [body, panel]: [string, string]): void {
  g.fillStyle = '#2A2A2E';
  rounded(g, x, base - 15, w, 2.6, 1.2);
  g.fill();
  g.fillStyle = body;
  g.fillRect(x, base - 13, w, 11);
  g.fillStyle = panel;
  g.fillRect(x + 0.8, base - 12.2, w - 1.6, 4.6);
  g.fillStyle = '#C9A35E';
  g.fillRect(x, base - 7.2, w, 0.7);
  g.fillStyle = '#FFD98A';
  const n = Math.max(1, Math.floor((w - 2) / 4.6));
  const step = (w - 2) / n;
  for (let i = 0; i < n; i++) g.fillRect(x + 1.6 + i * step, base - 11.4, step - 1.8, 3);
  wheels(g, x, base, [2.6, w - 2.6], 1.8);
}

function wheels(g: CanvasRenderingContext2D, x: number, base: number, at: number[], r: number): void {
  g.fillStyle = '#16161A';
  for (const a of at) dot(g, x + a, base - r + 0.4, r);
}

function lettering(g: CanvasRenderingContext2D, def: LineTransitionDef, archive: RouteArchive | null, routeName: string, cars: number): void {
  const top = SCENE.y + SCENE.h;
  g.fillStyle = def.postcard.ink;
  g.textAlign = 'left';
  g.font = '700 7.5px Jost, sans-serif';
  spaced(g, def.postcard.stamp, SCENE.x + 2, top + 13, 1.6);
  // The caption at the largest size up to 15 px that fits the card.
  let size = 15;
  g.font = `700 ${size}px ${SERIF}`;
  while (size > 9 && g.measureText(def.postcard.caption).width > SCENE.w - 4) g.font = `700 ${--size}px ${SERIF}`;
  g.fillText(def.postcard.caption, SCENE.x + 2, top + 31);
  g.font = '500 8.5px Jost, sans-serif';
  g.fillStyle = 'rgba(40, 40, 40, 0.72)';
  const stats = archive ? `${cars} carriages · Level ${archive.route.level} · ${archive.stats.guests.toLocaleString()} guests` : routeName;
  g.fillText(stats, SCENE.x + 2, top + 45);
}

/** A round postmark struck over the picture's top corner, with three wavy cancellation lines across the sky. */
function postmark(g: CanvasRenderingContext2D): void {
  const cx = SCENE.x + SCENE.w - 22;
  const cy = SCENE.y + 22;
  g.save();
  g.globalAlpha = 0.85;
  g.strokeStyle = 'rgba(255, 248, 230, 0.9)';
  g.fillStyle = 'rgba(255, 248, 230, 0.9)';
  stamp(g, cx, cy);
  g.restore();
}

function stamp(g: CanvasRenderingContext2D, cx: number, cy: number): void {
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(cx, cy, 17, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 0.7;
  g.beginPath();
  g.arc(cx, cy, 13.5, 0, Math.PI * 2);
  g.stroke();
  g.font = '700 4.6px Jost, sans-serif';
  g.textAlign = 'center';
  g.fillText('PRESERVED', cx, cy);
  g.font = '500 3.8px Jost, sans-serif';
  g.fillText('NIGHT MAIL', cx, cy + 5.5);
  g.lineWidth = 0.9;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const px = cx - 86 + i * 1.6;
      const py = cy - 6 + k * 6 + Math.sin(i * 0.55) * 1.6;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
}

function ridge(g: CanvasRenderingContext2D, rand: () => number, y: number, amp: number, freq: number, color: string): void {
  const phase = rand() * 100;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(SCENE.x, SCENE.y + SCENE.h);
  for (let px = SCENE.x; px <= SCENE.x + SCENE.w + 4; px += 4) {
    const v = Math.sin(px * freq + phase) * 0.6 + Math.sin(px * freq * 2.7 + phase * 2) * 0.4;
    g.lineTo(px, y - (v * 0.5 + 0.5) * amp);
  }
  g.lineTo(SCENE.x + SCENE.w, SCENE.y + SCENE.h);
  g.fill();
}

function tree(g: CanvasRenderingContext2D, rand: () => number, x: number, ground: number, r: number): void {
  g.fillStyle = '#4A3A2A';
  g.fillRect(x - 0.8, ground - r * 0.8, 1.6, r * 0.8);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i < 3 ? '#2F5232' : '#3F6A3E';
    dot(g, x + (rand() - 0.5) * r * 0.9, ground - r * 1.1 - rand() * r * 0.6, r * (0.45 + rand() * 0.2));
  }
}

function palm(g: CanvasRenderingContext2D, x: number, ground: number, h: number): void {
  g.strokeStyle = '#6A4E32';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(x, ground);
  g.quadraticCurveTo(x + 3, ground - h * 0.6, x + 5, ground - h);
  g.stroke();
  g.strokeStyle = '#2F6A44';
  g.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    g.beginPath();
    g.moveTo(x + 5, ground - h);
    g.quadraticCurveTo(x + 5 + Math.cos(a) * 6, ground - h + Math.sin(a) * 4, x + 5 + Math.cos(a) * 9, ground - h + 3);
    g.stroke();
  }
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  let px = x;
  for (const ch of text) {
    g.fillText(ch, px, y);
    px += g.measureText(ch).width + spacing;
  }
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded generator (the card is drawn from the line's name, so it never changes between showings). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
