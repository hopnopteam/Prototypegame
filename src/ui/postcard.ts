import type { PostcardArt } from '../config/content';

/**
 * Postcards as vintage stamps (session 43, owner, with references of painted travel stamps: "aesthetically pleasing
 * and beautiful"): a cream stamp with perforated edges and a fine frame, the station's name in a big Didone serif, a
 * line of small capitals over it, the stamp's value, a painted scene of the station (sky, hills, its landmark and the
 * Night Express crossing), a sprig in one corner, wavy cancellation lines and a footer with the number and a motto.
 * Everything is drawn on a canvas from the station's data, seeded so a card always looks the same.
 */

export const POSTCARD_W = 480;
export const POSTCARD_H = 600;

const W = POSTCARD_W;
const H = POSTCARD_H;
const PAPER_DEEP = '#E6D7B8';
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
/** Perforation holes: radius and spacing along each edge. */
const HOLE_R = 11;
const HOLE_GAP = 28;
/** The fine frame inset from the stamp's edge. */
const FRAME = 34;
/** The picture's top (it fades into the paper behind the name) and bottom (the footer's rule). */
const SCENE_TOP = 96;
const SCENE_BOTTOM = H - 76;
const SKY_FADE_TO = 236;

/** Fonts are embedded; a card drawn before they load is drawn again once they have. */
export function postcardFontsReady(): Promise<void> {
  if (!('fonts' in document)) return Promise.resolve();
  return Promise.all([document.fonts.load(`700 60px ${SERIF}`), document.fonts.load(`400 16px ${SERIF}`)]).then(() => undefined, () => undefined);
}

export interface PostcardText {
  name: string;
  /** Small capitals over the name. */
  kicker: string;
  /** The stamp's number, "No. 0003". */
  number: number;
  /** The stamp's value in the top corner. */
  value: number;
}

/** How much fine texture (grain, brush dabs) a card gets: a small stamp needs only a little. */
let detail = 1;

/** Cards already drawn this session, by name: drawing one is a few thousand canvas calls, copying it is one. */
const drawn = new Map<string, HTMLCanvasElement>();

function fontsReady(): boolean {
  return !('fonts' in document) || (document.fonts.check(`700 60px ${SERIF}`) && document.fonts.check(`400 16px ${SERIF}`));
}

/**
 * Puts a postcard on a canvas: copied from the cache when it has been drawn before, drawn and kept once the serif is
 * ready, or drawn now and again (and kept) when the serif arrives.
 */
export function paintPostcard(canvas: HTMLCanvasElement, art: PostcardArt, text: PostcardText): void {
  const key = `${text.name}|${text.number}`;
  const copy = (from: HTMLCanvasElement): void => {
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d')?.drawImage(from, 0, 0);
  };
  const cached = drawn.get(key);
  if (cached) return copy(cached);
  const keep = (): void => {
    const c = document.createElement('canvas');
    drawPostcard(c, art, text);
    drawn.set(key, c);
    copy(c);
  };
  if (fontsReady()) return keep();
  drawPostcard(canvas, art, text);
  void postcardFontsReady().then(() => { if (!drawn.has(key)) keep(); else copy(drawn.get(key) as HTMLCanvasElement); });
}

/** Draws a collected postcard. */
export function drawPostcard(canvas: HTMLCanvasElement, art: PostcardArt, text: PostcardText, scale = 1): void {
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  detail = Math.min(1, scale * 1.4);
  const rand = rng(hash(text.name));
  ctx.clearRect(0, 0, W, H);
  stampPaper(ctx, rand);
  ctx.save();
  ctx.beginPath();
  ctx.rect(FRAME + 1, FRAME + 1, W - 2 * FRAME - 2, SCENE_BOTTOM - FRAME - 1);
  ctx.clip();
  paintScene(ctx, art, rng(hash(art.scene + text.name)));
  // A warm printed tint ties the painted colours together, like the references' aged ink.
  ctx.fillStyle = 'rgba(236, 214, 170, 0.14)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  grain(ctx, rand, 2600, 0.05);
  const mailY = frameAndLettering(ctx, art, text);
  postmark(ctx, art.ink, mailY - 24);
}

/** A stamp not yet collected: blank paper, a dashed frame and a question mark. */
export function drawBlankStamp(canvas: HTMLCanvasElement): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  detail = 1;
  stampPaper(ctx, rng(7));
  ctx.strokeStyle = 'rgba(110, 90, 60, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(110, 90, 60, 0.4)';
  ctx.font = `700 170px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', W / 2, H / 2 + 6);
}

// ─── The stamp ─────────────────────────────────────────────────────────────────

function stampPaper(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const paper = ctx.createRadialGradient(W * 0.5, H * 0.45, 60, W * 0.5, H * 0.5, W * 0.85);
  paper.addColorStop(0, '#F8F0DD');
  paper.addColorStop(1, PAPER_DEEP);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, rand, 3200, 0.06);
  // The perforations: half-holes punched out round every edge, a full hole's width in from each corner.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  // Opaque, or destination-out only thins the paper by the fill's alpha.
  ctx.fillStyle = '#000';
  ctx.beginPath();
  const along = (length: number, place: (t: number) => void): void => {
    const n = Math.round(length / HOLE_GAP);
    const step = length / n;
    for (let i = 0; i <= n; i++) place(i * step);
  };
  along(W, (x) => { ctx.moveTo(x + HOLE_R, 0); ctx.arc(x, 0, HOLE_R, 0, Math.PI * 2); ctx.moveTo(x + HOLE_R, H); ctx.arc(x, H, HOLE_R, 0, Math.PI * 2); });
  along(H, (y) => { ctx.moveTo(HOLE_R, y); ctx.arc(0, y, HOLE_R, 0, Math.PI * 2); ctx.moveTo(W + HOLE_R, y); ctx.arc(W, y, HOLE_R, 0, Math.PI * 2); });
  ctx.fill();
  ctx.restore();
}

function frameAndLettering(ctx: CanvasRenderingContext2D, art: PostcardArt, text: PostcardText): number {
  const ink = art.ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
  // The footer: a rule over it, the number, the motto between two rules, a globe and a barcode.
  ctx.beginPath();
  ctx.moveTo(FRAME, SCENE_BOTTOM);
  ctx.lineTo(W - FRAME, SCENE_BOTTOM);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const footY = (SCENE_BOTTOM + H - FRAME) / 2 + 1;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.font = `400 15px ${SERIF}`;
  spaced(ctx, `No. ${String(text.number).padStart(4, '0')}`, FRAME + 16, footY, 1.6, 'left');
  ctx.font = `400 13px ${SERIF}`;
  const motto = art.motto.toUpperCase();
  fitSpaced(ctx, motto, W / 2 + 4, footY, 1.8, 196, 13);
  const mottoW = Math.min(196, spacedWidth(ctx, motto, 1.8));
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FRAME + 104, footY);
  ctx.lineTo(W / 2 + 4 - mottoW / 2 - 10, footY);
  ctx.moveTo(W / 2 + 4 + mottoW / 2 + 10, footY);
  ctx.lineTo(W - FRAME - 92, footY);
  ctx.stroke();
  globe(ctx, W - FRAME - 76, footY, 9, ink);
  for (let i = 0; i < 9; i++) ctx.fillRect(W - FRAME - 58 + i * 4.6, footY - 7, 1.8, 14);

  // The kicker over the name, with a rule running on from it.
  ctx.font = `400 15px ${SERIF}`;
  ctx.textBaseline = 'alphabetic';
  const kw = spaced(ctx, text.kicker.toUpperCase(), FRAME + 18, FRAME + 30, 3, 'left');
  ctx.beginPath();
  ctx.moveTo(FRAME + 18 + kw + 12, FRAME + 25);
  ctx.lineTo(FRAME + 18 + kw + 92, FRAME + 25);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // The value, top right.
  ctx.textAlign = 'right';
  ctx.font = `700 34px ${SERIF}`;
  ctx.fillText(String(text.value), W - FRAME - 16, FRAME + 40);
  ctx.font = `400 11px ${SERIF}`;
  spaced(ctx, 'FARES', W - FRAME - 16, FRAME + 56, 2, 'right');

  // The name: as big as it fits on one line, or two lines for a long two-word name.
  ctx.textAlign = 'center';
  const name = text.name.toUpperCase();
  const maxW = W - 2 * FRAME - 34;
  const words = name.split(' ');
  ctx.font = `700 100px ${SERIF}`;
  const oneLine = Math.min(104, (100 * maxW) / ctx.measureText(name).width);
  ctx.save();
  ctx.shadowColor = 'rgba(243, 233, 211, 0.85)';
  ctx.shadowBlur = 10;
  let nameBottom: number;
  if (oneLine >= 66 || words.length < 2) {
    ctx.font = `700 ${Math.floor(oneLine)}px ${SERIF}`;
    ctx.fillText(name, W / 2, FRAME + 64 + oneLine * 0.72);
    nameBottom = FRAME + 64 + oneLine * 0.72;
  } else {
    const longest = words.reduce((a, b) => (ctx.measureText(a).width > ctx.measureText(b).width ? a : b));
    const size = Math.floor(Math.min(92, (100 * maxW) / ctx.measureText(longest).width));
    ctx.font = `700 ${size}px ${SERIF}`;
    ctx.fillText(words[0], W / 2, FRAME + 58 + size * 0.72);
    ctx.fillText(words.slice(1).join(' '), W / 2, FRAME + 58 + size * 1.62);
    nameBottom = FRAME + 58 + size * 1.62;
  }
  ctx.restore();
  ctx.textAlign = 'left';
  // "Night mail" and the stop under the name, on the sky, like the references' "Air mail".
  ctx.font = `400 14px ${SERIF}`;
  const mailY = Math.max(SKY_FADE_TO - 6, nameBottom + 34);
  spaced(ctx, 'NIGHT MAIL', FRAME + 18, mailY, 2.6, 'left');
  ctx.font = `400 12px ${SERIF}`;
  spaced(ctx, `STOP ${text.number}`, FRAME + 18, mailY + 20, 2.2, 'left');
  return mailY;
}

/** Wavy cancellation lines over the picture's top right corner. */
function postmark(ctx: CanvasRenderingContext2D, ink: string, top: number): void {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.6;
  const x0 = W - FRAME - 118;
  for (let i = 0; i < 4; i++) {
    const y = top + i * 9;
    ctx.beginPath();
    for (let x = 0; x <= 100; x += 4) {
      const yy = y + Math.sin(x / 9) * 3 - x * 0.08;
      if (x === 0) ctx.moveTo(x0 + x, yy);
      else ctx.lineTo(x0 + x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function globe(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string): void {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.ellipse(x, y, r * 0.45, r, 0, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

// ─── The picture ───────────────────────────────────────────────────────────────

type Rand = () => number;

function paintScene(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const horizon = 380;
  sky(ctx, art, rand, horizon);
  switch (art.scene) {
    case 'mill': return mill(ctx, art, rand);
    case 'ford': return ford(ctx, art, rand);
    case 'fields': return fields(ctx, art, rand);
    case 'wren': return wren(ctx, art, rand);
    case 'oak': return oak(ctx, art, rand);
    case 'thistle': return thistle(ctx, art, rand);
    case 'ridge': return ridge(ctx, art, rand);
    case 'halt': return halt(ctx, art, rand);
  }
}

/** The sky fades in from the paper behind the name down to the horizon, with streaky painted clouds. */
function sky(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand, horizon: number): void {
  const g = ctx.createLinearGradient(0, SCENE_TOP, 0, horizon);
  g.addColorStop(0, rgba(art.sky[0], 0));
  g.addColorStop((SKY_FADE_TO - SCENE_TOP) / (horizon - SCENE_TOP) * 0.55, rgba(art.sky[0], 0.85));
  g.addColorStop(0.7, art.sky[0]);
  g.addColorStop(1, art.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, SCENE_TOP, W, SCENE_BOTTOM - SCENE_TOP);
  // Clouds: long soft bands of overlapping dabs, brightest on top, a little shadow under each.
  for (let c = 0; c < 6; c++) {
    const cy = 170 + rand() * 170;
    const cx = rand() * W;
    const len = 120 + rand() * 180;
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = cx - len / 2 + t * len + (rand() - 0.5) * 20;
      const y = cy + Math.sin(t * Math.PI) * -8 + (rand() - 0.5) * 8;
      const r = (8 + rand() * 12) * Math.sin(0.25 + t * 2.6);
      if (r <= 1) continue;
      ctx.fillStyle = 'rgba(120, 140, 170, 0.08)';
      ctx.beginPath();
      ctx.ellipse(x + 3, y + 5, r * 2.2, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 252, 244, ${0.35 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A hill line from x 0 to W: smooth noise round `y`, filled to the bottom, with a painted texture. */
function hills(ctx: CanvasRenderingContext2D, rand: Rand, y: number, amp: number, freq: number, color: string, texture = 0.12): Path2D {
  const n = noise(rand);
  const path = new Path2D();
  path.moveTo(0, SCENE_BOTTOM + 2);
  for (let x = 0; x <= W; x += 6) path.lineTo(x, y - n(x * freq) * amp - n(x * freq * 3.1 + 9) * amp * 0.25);
  path.lineTo(W, SCENE_BOTTOM + 2);
  path.closePath();
  ctx.fillStyle = color;
  ctx.fill(path);
  dabs(ctx, rand, path, color, y - amp, SCENE_BOTTOM, texture);
  return path;
}

/** Painted texture inside a shape: small lighter and darker dabs. */
function dabs(ctx: CanvasRenderingContext2D, rand: Rand, path: Path2D, color: string, top: number, bottom: number, strength: number, count = 260): void {
  if (strength <= 0) return;
  ctx.save();
  ctx.clip(path);
  for (let i = 0, n = Math.round(count * detail); i < n; i++) {
    const x = rand() * W;
    const y = top + rand() * (bottom - top);
    ctx.fillStyle = rgba(shade(color, rand() < 0.5 ? 22 : -24), strength);
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rand() * 7, 1.5 + rand() * 2.5, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Haze over everything behind a line (distance). */
function haze(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillRect(0, SCENE_TOP, W, SCENE_BOTTOM - SCENE_TOP);
}

function roundTree(ctx: CanvasRenderingContext2D, rand: Rand, x: number, ground: number, size: number, color: string): void {
  ctx.fillStyle = '#5A4430';
  ctx.fillRect(x - size * 0.07, ground - size * 0.55, size * 0.14, size * 0.55);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = size * (0.32 + rand() * 0.12);
    const cx = x + Math.cos(a) * size * 0.26;
    const cy = ground - size * 0.85 + Math.sin(a) * size * 0.22;
    ctx.fillStyle = shade(color, -14 + Math.sin(a + 2.4) * 16);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(shade(color, 30), 0.55);
  ctx.beginPath();
  ctx.arc(x - size * 0.12, ground - size * 1.0, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function poplar(ctx: CanvasRenderingContext2D, x: number, ground: number, height: number, color: string): void {
  ctx.fillStyle = shade(color, -18);
  ctx.beginPath();
  ctx.ellipse(x, ground - height * 0.5, height * 0.16, height * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(shade(color, 24), 0.6);
  ctx.beginPath();
  ctx.ellipse(x - height * 0.05, ground - height * 0.58, height * 0.07, height * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cottage(ctx: CanvasRenderingContext2D, x: number, ground: number, w: number, wall: string, roof: string): void {
  const h = w * 0.62;
  ctx.fillStyle = wall;
  ctx.fillRect(x, ground - h, w, h);
  ctx.fillStyle = shade(wall, -26);
  ctx.fillRect(x + w * 0.7, ground - h, w * 0.3, h);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, ground - h);
  ctx.lineTo(x + w * 0.5, ground - h - w * 0.42);
  ctx.lineTo(x + w * 1.08, ground - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F6D58A';
  ctx.fillRect(x + w * 0.18, ground - h * 0.62, w * 0.16, w * 0.14);
  ctx.fillRect(x + w * 0.46, ground - h * 0.62, w * 0.16, w * 0.14);
  ctx.fillStyle = shade(roof, -30);
  ctx.fillRect(x + w * 0.66, ground - h - w * 0.36, w * 0.1, w * 0.2);
}

/** The Night Express: a navy engine with a red valance and a gold line, cream-windowed blue carriages, steam. */
function train(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, cars: number, facing: 1 | -1 = 1): void {
  const carW = 46 * scale;
  const carH = 15 * scale;
  const gap = 3 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const colors = ['#5D8FB8', '#7E5AA8', '#3F7A60', '#A85A4A'];
  for (let i = 0; i < cars; i++) {
    const cx = -(i + 1) * (carW + gap);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(cx, -carH, carW, carH);
    ctx.fillStyle = '#E9C46A';
    ctx.fillRect(cx, -carH * 0.28, carW, 1.4 * scale);
    ctx.fillStyle = '#FFE3A0';
    for (let k = 0; k < 4; k++) ctx.fillRect(cx + 4 * scale + k * 10.5 * scale, -carH * 0.8, 6 * scale, 4.5 * scale);
    ctx.fillStyle = '#2A2A34';
    ctx.fillRect(cx - 0.5, -carH - 2 * scale, carW + 1, 2 * scale);
  }
  // The engine: boiler, cab, chimney, red valance.
  ctx.fillStyle = '#23365A';
  ctx.fillRect(0, -carH * 0.9, 34 * scale, carH * 0.9);
  ctx.fillRect(0, -carH * 1.25, 12 * scale, carH * 1.25);
  ctx.fillRect(25 * scale, -carH * 1.35, 5 * scale, carH * 0.5);
  ctx.fillStyle = '#C8413B';
  ctx.fillRect(0, -2.6 * scale, 36 * scale, 2.6 * scale);
  ctx.fillStyle = '#E9C46A';
  ctx.fillRect(12 * scale, -carH * 0.55, 22 * scale, 1.2 * scale);
  ctx.fillStyle = '#FFF2B0';
  ctx.beginPath();
  ctx.arc(34.5 * scale, -carH * 0.55, 1.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Steam drifting back.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.62 - i * 0.08})`;
    ctx.beginPath();
    ctx.arc(26 * scale - i * 13 * scale, -carH * 1.6 - i * 3.2 * scale, (5 + i * 2.4) * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function viaduct(ctx: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x0, top, x1 - x0, 7);
  const span = 38;
  ctx.beginPath();
  for (let x = x0; x < x1; x += span) {
    ctx.rect(x, top, span, bottom - top);
  }
  ctx.fill();
  ctx.fillStyle = shade(color, -45);
  for (let x = x0 + 6; x + span - 12 <= x1; x += span) {
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top + 22);
    ctx.arc(x + (span - 12) / 2, top + 22, (span - 12) / 2, Math.PI, 0);
    ctx.lineTo(x + span - 12, bottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shade(color, 18);
  ctx.fillRect(x0, top, x1 - x0, 2.5);
}

function water(ctx: CanvasRenderingContext2D, rand: Rand, path: Path2D, top: number, bottom: number, sky: string): void {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, mix(sky, '#FFFFFF', 0.25));
  g.addColorStop(1, mix(sky, '#2C5A78', 0.45));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.18 + rand() * 0.3})`;
    ctx.fillRect(rand() * W, top + rand() * (bottom - top), 8 + rand() * 26, 1.6);
  }
  ctx.restore();
}

// Foreground sprigs, painted over a corner of the picture.

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, width: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -width, len, 0);
  ctx.quadraticCurveTo(len * 0.5, width, 0, 0);
  ctx.fill();
  ctx.strokeStyle = rgba(shade(color, 34), 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

/** A leafy branch from (x, y) heading `angle`, leaves in pairs. */
function sprig(ctx: CanvasRenderingContext2D, rand: Rand, x: number, y: number, angle: number, length: number, leafLen: number, leafW: number, colors: [string, string], bend = 0.4): void {
  ctx.strokeStyle = '#5B4A30';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = 14;
  const pts: [number, number, number][] = [];
  let a = angle;
  let px = x;
  let py = y;
  for (let i = 1; i <= steps; i++) {
    a += bend / steps;
    px += Math.cos(a) * (length / steps);
    py += Math.sin(a) * (length / steps);
    ctx.lineTo(px, py);
    pts.push([px, py, a]);
  }
  ctx.stroke();
  for (let i = 1; i < pts.length; i++) {
    const [lx, ly, la] = pts[i];
    const s = 0.65 + (1 - i / pts.length) * 0.5;
    leaf(ctx, lx, ly, leafLen * s, leafW * s, la - 0.9 - rand() * 0.3, colors[i % 2]);
    leaf(ctx, lx, ly, leafLen * s, leafW * s, la + 0.9 + rand() * 0.3, colors[(i + 1) % 2]);
  }
  leaf(ctx, px, py, leafLen * 0.8, leafW * 0.8, a, colors[0]);
}

// ─── The scenes ────────────────────────────────────────────────────────────────

/** Millbrook: a stone watermill and its wheel on the brook, a willow, the train on a viaduct beyond. */
function mill(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 352, 40, 0.006, far, 0.08);
  viaduct(ctx, -10, W + 10, 334, 380, '#B8A88A');
  train(ctx, 300, 334, 1, 4);
  haze(ctx, art.sky[1], 0.12);
  hills(ctx, rand, 400, 26, 0.009, mid);
  for (let i = 0; i < 5; i++) poplar(ctx, 60 + i * 26 + rand() * 8, 392 - i * 2, 54 + rand() * 18, mid);
  // The brook, widening toward us.
  const brook = new Path2D();
  brook.moveTo(250, 404);
  brook.bezierCurveTo(300, 430, 180, 470, 120, SCENE_BOTTOM);
  brook.lineTo(330, SCENE_BOTTOM);
  brook.bezierCurveTo(300, 470, 360, 430, 280, 404);
  brook.closePath();
  const bank = new Path2D();
  bank.rect(0, 410, W, SCENE_BOTTOM - 410);
  ctx.fillStyle = near;
  ctx.fill(bank);
  dabs(ctx, rand, bank, near, 410, SCENE_BOTTOM, 0.14);
  water(ctx, rand, brook, 404, SCENE_BOTTOM, art.sky[0]);
  // The mill: stone walls, a dark roof, a lit window, and the wheel turning in the brook.
  const mx = 300;
  const ground = 452;
  ctx.fillStyle = '#D8C7A4';
  ctx.fillRect(mx, ground - 74, 92, 74);
  ctx.fillStyle = '#BCA984';
  ctx.fillRect(mx + 64, ground - 74, 28, 74);
  ctx.fillStyle = art.accent;
  ctx.beginPath();
  ctx.moveTo(mx - 10, ground - 74);
  ctx.lineTo(mx + 46, ground - 118);
  ctx.lineTo(mx + 102, ground - 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F6D58A';
  ctx.fillRect(mx + 18, ground - 52, 14, 16);
  ctx.fillRect(mx + 42, ground - 52, 14, 16);
  ctx.fillStyle = '#5A4430';
  ctx.fillRect(mx + 26, ground - 24, 18, 24);
  const wx = mx - 6;
  const wy = ground - 30;
  ctx.strokeStyle = '#6B4A2E';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(wx, wy, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + Math.cos(a) * 34, wy + Math.sin(a) * 34);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  for (let i = 0; i < 8; i++) ctx.fillRect(wx - 30 + i * 8, wy + 32 + (i % 2) * 3, 6, 2);
  // A willow on the left bank.
  ctx.fillStyle = '#5A4430';
  ctx.fillRect(86, 400, 10, 70);
  for (let i = 0; i < 30; i++) {
    const a = -Math.PI * 0.9 + (i / 30) * Math.PI * 0.8;
    ctx.strokeStyle = shade(mid, -10 + (i % 3) * 14);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(91 + Math.cos(a) * 30, 392 + Math.sin(a) * 26);
    ctx.quadraticCurveTo(91 + Math.cos(a) * 52, 380 + Math.sin(a) * 30, 91 + Math.cos(a) * 56, 452 + rand() * 18);
    ctx.stroke();
  }
  // Reeds and a willow sprig framing the bottom left.
  for (let i = 0; i < 26; i++) {
    const x = 34 + i * 6 + rand() * 4;
    ctx.strokeStyle = shade(near, -20 + rand() * 30);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, SCENE_BOTTOM);
    ctx.quadraticCurveTo(x + 6, SCENE_BOTTOM - 40, x + 4 + rand() * 10, SCENE_BOTTOM - 54 - rand() * 30);
    ctx.stroke();
  }
  sprig(ctx, rand, W + 8, 262, Math.PI * 0.86, 150, 34, 6, [shade(near, -8), shade(mid, 4)], 0.6);
}

/** Hazelford: hazel trees on both banks of a wide ford with stepping stones, a church spire, the train beyond. */
function ford(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 346, 46, 0.005, far, 0.08);
  // A village and its spire on the far hill.
  for (let i = 0; i < 4; i++) cottage(ctx, 70 + i * 34, 352 - i * 3, 24, '#E8D9BC', '#8C5A40');
  ctx.fillStyle = '#E2D3B4';
  ctx.fillRect(212, 300, 16, 46);
  ctx.beginPath();
  ctx.moveTo(208, 300);
  ctx.lineTo(220, 262);
  ctx.lineTo(232, 300);
  ctx.closePath();
  ctx.fill();
  haze(ctx, art.sky[1], 0.14);
  hills(ctx, rand, 378, 18, 0.01, mid);
  train(ctx, 420, 372, 0.9, 4);
  const river = new Path2D();
  river.moveTo(0, 404);
  river.bezierCurveTo(160, 396, 320, 412, W, 400);
  river.lineTo(W, 452);
  river.bezierCurveTo(320, 466, 160, 446, 0, 458);
  river.closePath();
  const bank = new Path2D();
  bank.rect(0, 388, W, SCENE_BOTTOM - 388);
  ctx.fillStyle = near;
  ctx.fill(bank);
  dabs(ctx, rand, bank, near, 388, SCENE_BOTTOM, 0.14);
  water(ctx, rand, river, 396, 466, art.sky[0]);
  // Stepping stones across the ford.
  for (let i = 0; i < 8; i++) {
    const x = 120 + i * 32;
    const y = 412 + i * 5 + Math.sin(i) * 3;
    ctx.fillStyle = '#A59A88';
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#C9C0AE';
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 2, 7, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  roundTree(ctx, rand, 70, 420, 96, shade(mid, -6));
  roundTree(ctx, rand, 400, 410, 78, mid);
  roundTree(ctx, rand, 440, 470, 104, shade(near, 6));
  // Hazel leaves and a cluster of nuts in the bottom right corner.
  sprig(ctx, rand, W + 6, SCENE_BOTTOM - 20, Math.PI * 1.1, 150, 30, 15, [shade(near, -6), shade(mid, -2)], -0.5);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = art.accent;
    ctx.beginPath();
    ctx.arc(392 + i * 13, SCENE_BOTTOM - 64 + (i % 2) * 8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7FA047';
    ctx.beginPath();
    ctx.arc(392 + i * 13, SCENE_BOTTOM - 70 + (i % 2) * 8, 6, Math.PI, 0);
    ctx.fill();
  }
}

/** Barley Cross: striped golden fields, a fingerpost at the crossroads, haystacks, poplars, the train on the horizon. */
function fields(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 350, 24, 0.005, far, 0.06);
  for (let i = 0; i < 7; i++) poplar(ctx, 250 + i * 24, 352, 40 + rand() * 10, '#7E9150');
  train(ctx, 210, 356, 0.85, 4);
  haze(ctx, art.sky[1], 0.1);
  // Field bands, each with furrows running toward a point on the horizon.
  const bands: [number, string][] = [[362, mid], [392, shade(near, 12)], [430, near], [480, shade(mid, -8)]];
  for (const [y, color] of bands) {
    const band = new Path2D();
    band.moveTo(0, y);
    band.bezierCurveTo(W * 0.3, y - 8, W * 0.7, y + 6, W, y - 4);
    band.lineTo(W, SCENE_BOTTOM + 2);
    band.lineTo(0, SCENE_BOTTOM + 2);
    band.closePath();
    ctx.fillStyle = color;
    ctx.fill(band);
    ctx.save();
    ctx.clip(band);
    ctx.strokeStyle = rgba(shade(color, -26), 0.35);
    ctx.lineWidth = 1.4;
    for (let k = -14; k <= 14; k++) {
      ctx.beginPath();
      ctx.moveTo(W * 0.62 + k * 6, 340);
      ctx.lineTo(W * 0.62 + k * 70, SCENE_BOTTOM);
      ctx.stroke();
    }
    ctx.restore();
    dabs(ctx, rand, band, color, y, SCENE_BOTTOM, 0.1, 120);
  }
  // Haystacks.
  for (const [x, y, s] of [[90, 404, 22], [140, 410, 16], [360, 420, 26]] as const) {
    ctx.fillStyle = '#E8C46A';
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 100, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.3, y, s * 0.7, s * 0.7, 0, Math.PI * 1.5, 0);
    ctx.fill();
  }
  // The fingerpost at the crossroads.
  ctx.fillStyle = '#F3EBD8';
  ctx.fillRect(318, 392, 6, 96);
  for (const [y, dir] of [[400, 1], [418, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(321, y);
    ctx.lineTo(321 + dir * 52, y);
    ctx.lineTo(321 + dir * 60, y + 6);
    ctx.lineTo(321 + dir * 52, y + 12);
    ctx.lineTo(321, y + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = art.ink;
  for (const [y, dir] of [[400, 1], [418, -1]] as const) for (let i = 0; i < 4; i++) ctx.fillRect(321 + dir * (10 + i * 9) - (dir < 0 ? 5 : 0), y + 5, 5, 2);
  // Barley ears along the bottom left.
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 15 + rand() * 6;
    const top = SCENE_BOTTOM - 90 - rand() * 50;
    ctx.strokeStyle = '#C9A040';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, SCENE_BOTTOM);
    ctx.quadraticCurveTo(x + 4, (top + SCENE_BOTTOM) / 2, x + 10, top);
    ctx.stroke();
    for (let k = 0; k < 7; k++) {
      leaf(ctx, x + 10 + k * 0.9, top + k * 6, 9, 3.2, -1.1, art.accent);
      leaf(ctx, x + 10 + k * 0.9, top + k * 6, 9, 3.2, -2.0, shade(art.accent, -14));
    }
  }
}

/** Wrenfield: hedgerowed fields and cottages, the train along the valley, a wren on a hawthorn twig in front. */
function wren(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 340, 40, 0.006, far, 0.08);
  haze(ctx, art.sky[1], 0.1);
  const midPath = hills(ctx, rand, 382, 30, 0.008, mid);
  // Hedgerows across the middle fields.
  ctx.save();
  ctx.clip(midPath);
  for (let r = 0; r < 4; r++) {
    const y = 372 + r * 26;
    for (let x = -10; x < W + 10; x += 9) {
      ctx.fillStyle = shade(mid, -30 + (x % 3) * 6);
      ctx.beginPath();
      ctx.arc(x, y + Math.sin(x / 50 + r) * 6, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  cottage(ctx, 60, 386, 40, '#EFE2C8', '#9A5440');
  cottage(ctx, 112, 392, 32, '#E6D4B4', '#7E4A3A');
  train(ctx, 330, 420, 0.95, 4);
  hills(ctx, rand, 446, 12, 0.012, near);
  // The hawthorn twig with blossom, and the wren perched on it, tail cocked.
  ctx.strokeStyle = '#4E3B28';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W + 4, 452);
  ctx.quadraticCurveTo(380, 430, 300, 470);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(350, 446);
  ctx.lineTo(330, 418);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const x = 300 + t * 180;
    const y = 470 - t * 22 + Math.sin(t * 9) * 5;
    leaf(ctx, x, y, 18, 7, -1.4 + rand() * 0.8, i % 2 ? shade(near, -10) : mid);
    if (i % 3 === 0) {
      ctx.fillStyle = '#FFF4F2';
      for (let p = 0; p < 5; p++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(p * 1.26) * 4, y - 8 + Math.sin(p * 1.26) * 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#E7A1A6';
      ctx.beginPath();
      ctx.arc(x, y - 8, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const bx = 392;
  const by = 422;
  ctx.save();
  ctx.translate(bx, by + 24);
  ctx.scale(1.55, 1.55);
  ctx.translate(-bx, -(by + 24));
  ctx.fillStyle = art.accent;
  ctx.beginPath();
  ctx.ellipse(bx, by, 22, 16, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(bx + 14, by - 6);
  ctx.lineTo(bx + 30, by - 30);
  ctx.lineTo(bx + 22, by - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx - 16, by - 10, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#EAD7B6';
  ctx.beginPath();
  ctx.ellipse(bx - 6, by + 6, 13, 7, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(shade(art.accent, -40), 0.7);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + 2 + i * 4, by - 10);
    ctx.lineTo(bx + 8 + i * 4, by - 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#F3E6CC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx - 24, by - 14);
  ctx.lineTo(bx - 8, by - 16);
  ctx.stroke();
  ctx.fillStyle = '#1E1A16';
  ctx.beginPath();
  ctx.arc(bx - 19, by - 12, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3A2E22';
  ctx.beginPath();
  ctx.moveTo(bx - 26, by - 10);
  ctx.lineTo(bx - 36, by - 8);
  ctx.lineTo(bx - 26, by - 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4E3B28';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bx - 4, by + 14);
  ctx.lineTo(bx - 6, by + 24);
  ctx.moveTo(bx + 4, by + 14);
  ctx.lineTo(bx + 4, by + 22);
  ctx.stroke();
  ctx.restore();
}

/** Oakhollow: a great old oak in a hollow, a little station under it and the train passing below. */
function oak(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 336, 50, 0.007, far, 0.08);
  haze(ctx, art.sky[1], 0.12);
  hills(ctx, rand, 380, 40, 0.004, mid);
  // The track along the hollow, and the station.
  ctx.fillStyle = '#8A7A62';
  ctx.fillRect(0, 436, W, 5);
  cottage(ctx, 64, 432, 50, '#EADBC0', '#7A3E34');
  train(ctx, 460, 436, 1, 4);
  const front = new Path2D();
  front.moveTo(0, 446);
  front.bezierCurveTo(140, 440, 330, 452, W, 444);
  front.lineTo(W, SCENE_BOTTOM + 2);
  front.lineTo(0, SCENE_BOTTOM + 2);
  front.closePath();
  ctx.fillStyle = near;
  ctx.fill(front);
  dabs(ctx, rand, front, near, 440, SCENE_BOTTOM, 0.14);
  // The oak: a thick gnarled trunk, spreading boughs, a huge layered crown.
  const ox = 268;
  const ground = 430;
  ctx.fillStyle = '#5E4630';
  ctx.beginPath();
  ctx.moveTo(ox - 26, ground);
  ctx.bezierCurveTo(ox - 14, ground - 50, ox - 22, ground - 80, ox - 70, ground - 112);
  ctx.lineTo(ox - 60, ground - 120);
  ctx.bezierCurveTo(ox - 10, ground - 96, ox, ground - 100, ox + 8, ground - 140);
  ctx.lineTo(ox + 18, ground - 138);
  ctx.bezierCurveTo(ox + 20, ground - 96, ox + 30, ground - 96, ox + 78, ground - 116);
  ctx.lineTo(ox + 82, ground - 106);
  ctx.bezierCurveTo(ox + 30, ground - 76, ox + 22, ground - 50, ox + 30, ground);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI;
    const r = 70 + rand() * 60;
    const cx = ox + Math.cos(a + Math.PI) * r * 1.25;
    const cy = ground - 150 - Math.sin(a) * r * 0.55 + rand() * 20;
    const col = shade(art.accent, -22 + rand() * 36 + (cy < ground - 190 ? 10 : 0));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 + rand() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 245, 200, 0.18)';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(ox - 60 + rand() * 90, ground - 210 + rand() * 50, 10 + rand() * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Oak leaves and acorns, bottom right.
  sprig(ctx, rand, W + 6, SCENE_BOTTOM - 10, Math.PI * 1.14, 140, 28, 12, [shade(near, -4), shade(art.accent, 10)], -0.4);
  for (let i = 0; i < 2; i++) {
    const x = 410 + i * 18;
    const y = SCENE_BOTTOM - 54 + i * 6;
    ctx.fillStyle = '#B8823E';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6E5030';
    ctx.beginPath();
    ctx.ellipse(x, y - 6, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Thistledown: layered purple hills, a viaduct over the glen, a proud goat on a crag, thistles in front. */
function thistle(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 318, 70, 0.006, far, 0.08);
  haze(ctx, art.sky[1], 0.12);
  hills(ctx, rand, 360, 56, 0.007, mid, 0.14);
  viaduct(ctx, 40, 360, 372, 440, '#C8B79A');
  train(ctx, 280, 372, 0.95, 4);
  hills(ctx, rand, 446, 20, 0.01, near);
  // The crag and its goat, chin up.
  ctx.fillStyle = '#8D8478';
  ctx.beginPath();
  ctx.moveTo(340, SCENE_BOTTOM);
  ctx.lineTo(372, 410);
  ctx.lineTo(420, 396);
  ctx.lineTo(452, 420);
  ctx.lineTo(W, 430);
  ctx.lineTo(W, SCENE_BOTTOM);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ABA294';
  ctx.beginPath();
  ctx.moveTo(372, 410);
  ctx.lineTo(420, 396);
  ctx.lineTo(408, 430);
  ctx.closePath();
  ctx.fill();
  const gx = 412;
  const gy = 396;
  ctx.fillStyle = '#F4EEE2';
  ctx.beginPath();
  ctx.ellipse(gx, gy - 16, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(gx - 16, gy - 10, 4, 12);
  ctx.fillRect(gx - 6, gy - 10, 4, 12);
  ctx.fillRect(gx + 6, gy - 10, 4, 12);
  ctx.fillRect(gx + 14, gy - 10, 4, 12);
  ctx.beginPath();
  ctx.moveTo(gx - 14, gy - 22);
  ctx.lineTo(gx - 26, gy - 42);
  ctx.lineTo(gx - 16, gy - 46);
  ctx.lineTo(gx - 6, gy - 24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(gx - 22, gy - 46, 7, 5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6E5A40';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(gx - 20, gy - 50);
  ctx.quadraticCurveTo(gx - 10, gy - 62, gx - 6, gy - 52);
  ctx.stroke();
  ctx.fillStyle = '#E6DCCB';
  ctx.beginPath();
  ctx.moveTo(gx - 28, gy - 42);
  ctx.lineTo(gx - 26, gy - 34);
  ctx.lineTo(gx - 23, gy - 41);
  ctx.closePath();
  ctx.fill();
  // Thistles across the bottom left: spiky leaves, a green bulb, a purple tuft, drawn large in front.
  ctx.save();
  ctx.translate(0, SCENE_BOTTOM);
  ctx.scale(1.5, 1.5);
  ctx.translate(0, -SCENE_BOTTOM);
  for (let i = 0; i < 4; i++) {
    const x = 30 + i * 40 + rand() * 10;
    const top = SCENE_BOTTOM - 60 - rand() * 40;
    ctx.strokeStyle = '#5E7A46';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, SCENE_BOTTOM);
    ctx.lineTo(x + 2, top);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const y = SCENE_BOTTOM - 20 - k * 22;
      if (y < top + 10) break;
      leaf(ctx, x, y, 26, 6, -0.5, '#6B8A50');
      leaf(ctx, x, y, 26, 6, Math.PI + 0.5, '#5E7A46');
    }
    ctx.fillStyle = '#7C9A58';
    ctx.beginPath();
    ctx.ellipse(x + 2, top, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = art.accent;
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 11; k++) {
      const a = -Math.PI * 0.85 + (k / 10) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.moveTo(x + 2, top - 6);
      ctx.lineTo(x + 2 + Math.cos(a) * 14, top - 6 + Math.sin(a) * 14);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Pennyridge: a long ridge at sunset with a windmill on top, the train crossing a viaduct below, bramble in front. */
function ridge(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  // A low sun behind the ridge.
  const sun = ctx.createRadialGradient(150, 320, 6, 150, 320, 120);
  sun.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
  sun.addColorStop(0.25, 'rgba(255, 214, 150, 0.6)');
  sun.addColorStop(1, 'rgba(255, 190, 130, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, SCENE_TOP, W, 320);
  hills(ctx, rand, 350, 34, 0.004, far, 0.06);
  const ridgeLine = new Path2D();
  ridgeLine.moveTo(0, 392);
  ridgeLine.bezierCurveTo(120, 380, 220, 300, 330, 296);
  ridgeLine.bezierCurveTo(400, 294, 440, 330, W, 342);
  ridgeLine.lineTo(W, SCENE_BOTTOM + 2);
  ridgeLine.lineTo(0, SCENE_BOTTOM + 2);
  ridgeLine.closePath();
  ctx.fillStyle = mid;
  ctx.fill(ridgeLine);
  dabs(ctx, rand, ridgeLine, mid, 296, SCENE_BOTTOM, 0.12);
  // The windmill on the ridge, its sails crossed.
  const wx = 330;
  const wy = 296;
  ctx.fillStyle = '#E9D8BC';
  ctx.beginPath();
  ctx.moveTo(wx - 13, wy);
  ctx.lineTo(wx - 8, wy - 44);
  ctx.lineTo(wx + 8, wy - 44);
  ctx.lineTo(wx + 13, wy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = art.accent;
  ctx.beginPath();
  ctx.moveTo(wx - 10, wy - 44);
  ctx.lineTo(wx, wy - 56);
  ctx.lineTo(wx + 10, wy - 44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5A4430';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(wx, wy - 46);
    ctx.lineTo(wx + Math.cos(a) * 40, wy - 46 + Math.sin(a) * 40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 235, 215, 0.85)';
    ctx.save();
    ctx.translate(wx, wy - 46);
    ctx.rotate(a);
    ctx.fillRect(12, -1, 27, 7);
    ctx.restore();
  }
  viaduct(ctx, -10, W + 10, 418, 470, '#B39176');
  train(ctx, 380, 418, 1, 5);
  hills(ctx, rand, 476, 10, 0.012, near);
  // Warm light over it all.
  ctx.fillStyle = 'rgba(255, 170, 110, 0.08)';
  ctx.fillRect(0, SCENE_TOP, W, SCENE_BOTTOM - SCENE_TOP);
  // Bramble leaves and berries, bottom left.
  sprig(ctx, rand, -6, SCENE_BOTTOM - 6, -0.35, 150, 26, 12, ['#5E6E3A', '#4E5E30'], -0.5);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#3A1E3A' : '#6A2A44';
    ctx.beginPath();
    ctx.arc(70 + i * 9, SCENE_BOTTOM - 54 - (i % 3) * 6, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Larkspur Halt: a little halt with a shelter and a lamp, the train standing, a meadow of larkspur, a lark above. */
function halt(ctx: CanvasRenderingContext2D, art: PostcardArt, rand: Rand): void {
  const [far, mid, near] = art.land;
  hills(ctx, rand, 342, 44, 0.005, far, 0.08);
  haze(ctx, art.sky[1], 0.12);
  hills(ctx, rand, 386, 22, 0.009, mid);
  // The platform, the shelter and its lamp, and the train standing at it.
  ctx.fillStyle = '#CFC3AC';
  ctx.fillRect(0, 418, W, 14);
  ctx.fillStyle = '#B2A68E';
  ctx.fillRect(0, 430, W, 4);
  ctx.fillStyle = '#E6DAC2';
  ctx.fillRect(250, 376, 72, 42);
  ctx.fillStyle = art.ink;
  ctx.beginPath();
  ctx.moveTo(242, 378);
  ctx.lineTo(286, 356);
  ctx.lineTo(330, 378);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F6D58A';
  ctx.fillRect(264, 388, 14, 14);
  ctx.fillRect(292, 388, 14, 14);
  ctx.fillStyle = '#2A2A34';
  ctx.fillRect(352, 368, 3, 50);
  ctx.fillStyle = '#FFE7A0';
  ctx.beginPath();
  ctx.arc(353.5, 366, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = art.ink;
  ctx.fillRect(196, 386, 44, 12);
  ctx.fillStyle = '#F3E9D3';
  ctx.font = `700 7px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('LARKSPUR', 218, 395);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#2A2A34';
  ctx.fillRect(208, 398, 2, 20);
  ctx.fillRect(226, 398, 2, 20);
  train(ctx, 196, 410, 0.95, 3);
  // The meadow of larkspur in front: tall blue spikes among the grass.
  const meadow = new Path2D();
  meadow.rect(0, 434, W, SCENE_BOTTOM - 434);
  ctx.fillStyle = near;
  ctx.fill(meadow);
  dabs(ctx, rand, meadow, near, 434, SCENE_BOTTOM, 0.14);
  for (let i = 0; i < 26; i++) {
    const x = 20 + rand() * (W - 40);
    const base = 450 + rand() * (SCENE_BOTTOM - 450);
    const tall = 26 + (base - 440) * 0.5;
    ctx.strokeStyle = '#4E7448';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, base - tall);
    ctx.stroke();
    const tone = rand() < 0.3 ? '#C7A2E6' : rand() < 0.5 ? shade(art.accent, 20) : art.accent;
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(x + (k % 2 ? 2 : -2), base - tall + k * (tall * 0.08) + 2, 2.6 + k * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A lark singing high over the halt.
  ctx.strokeStyle = '#3A3226';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(360, 280);
  ctx.quadraticCurveTo(372, 270, 380, 282);
  ctx.quadraticCurveTo(388, 270, 400, 280);
  ctx.stroke();
  // Larkspur spikes framing the bottom right.
  for (let i = 0; i < 4; i++) {
    const x = W - 60 + i * 12;
    const top = SCENE_BOTTOM - 140 + i * 18;
    ctx.strokeStyle = '#4E7448';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, SCENE_BOTTOM);
    ctx.lineTo(x - 4, top);
    ctx.stroke();
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = k % 2 ? art.accent : shade(art.accent, 22);
      ctx.beginPath();
      ctx.arc(x - 4 + (k % 2 ? 4 : -4), top + k * 9, 4 + k * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Draws text with extra spacing between letters (canvas letterSpacing is not everywhere yet). Returns its width. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'right' | 'center'): number {
  const width = spacedWidth(ctx, text, spacing);
  const saved = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.textAlign = saved;
  return width;
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing;
  return Math.max(0, width - spacing);
}

/** Centred spaced text, shrunk until it fits `maxWidth`. */
function fitSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, maxWidth: number, size: number): void {
  let s = size;
  ctx.font = `400 ${s}px ${SERIF}`;
  while (s > 8 && spacedWidth(ctx, text, spacing) > maxWidth) {
    s -= 0.5;
    ctx.font = `400 ${s}px ${SERIF}`;
  }
  spaced(ctx, text, x, y, spacing, 'center');
}

function grain(ctx: CanvasRenderingContext2D, rand: Rand, count: number, alpha: number): void {
  for (let i = 0, n = Math.round(count * detail); i < n; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(90, 70, 40, ${alpha})` : `rgba(255, 255, 255, ${alpha * 1.2})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
}

function noise(rand: Rand): (x: number) => number {
  const pts = Array.from({ length: 64 }, () => rand());
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = pts[((i % 64) + 64) % 64];
    const b = pts[(((i + 1) % 64) + 64) % 64];
    return a + (b - a) * ((1 - Math.cos(f * Math.PI)) / 2);
  };
}

function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0')}`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return `#${((c(r1, r2) << 16) | (c(g1, g2) << 8) | c(b1, b2)).toString(16).padStart(6, '0')}`;
}
