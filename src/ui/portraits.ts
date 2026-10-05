import type { OwnerLook, Rival } from '../config/press';

const INK = '#2A2433';
const PAPER = '#F4ECDB';

/**
 * A rival owner's caricature for the Gazette: head and shoulders in their train's colours, arched eyebrows
 * and a smug little smile, and one signature piece each (a top hat, a lorgnette, a great red beard…).
 * Drawn on a canvas in newsprint tones so it sits on the page like the train photos.
 */
/**
 * How the owner looks at you (session 18): smug while you are far behind, nervous (worried brows, a gasp, a
 * bead of sweat) once you are closing in, humbled (a scowl) when you have just passed them.
 */
export type OwnerMood = 'smug' | 'nervous' | 'humbled';

export function drawOwnerPortrait(canvas: HTMLCanvasElement, look: OwnerLook, coat: string, trim: string, mood: OwnerMood = 'smug'): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = canvas.width / 160;
  ctx.save();
  ctx.scale(s, s);
  ctx.clearRect(0, 0, 160, 160);
  // Medallion frame.
  ctx.fillStyle = PAPER;
  circle(ctx, 80, 80, 78);
  ctx.save();
  ctx.beginPath();
  ctx.arc(80, 80, 74, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#E3D6BC';
  ctx.fillRect(0, 0, 160, 160);
  // Shoulders in the train's livery, a trim collar.
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(80, 168, 62, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.moveTo(62, 124);
  ctx.lineTo(80, 146);
  ctx.lineTo(98, 124);
  ctx.lineTo(90, 122);
  ctx.lineTo(80, 134);
  ctx.lineTo(70, 122);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.fillRect(72, 108, 16, 18);

  // Hair behind the head.
  ctx.fillStyle = look.hair;
  if (look.hat === 'bun' || look.hat === 'tiara' || look.hat === 'feather') {
    ctx.beginPath();
    ctx.ellipse(80, 82, 36, 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head.
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.ellipse(80, 84, 29, 33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(look.skin, -18);
  circle(ctx, 51, 88, 6);
  circle(ctx, 109, 88, 6);
  // Hair on top.
  ctx.fillStyle = look.hair;
  if (look.hat === 'bun' || look.hat === 'tiara') {
    ctx.beginPath();
    ctx.ellipse(80, 60, 30, 14, 0, Math.PI, 0);
    ctx.fill();
  }
  if (look.hat === 'bun') circle(ctx, 80, 44, 13);
  if (look.hat === 'bowler' || look.hat === 'goggles' || look.hat === 'tophat') {
    ctx.fillRect(51, 70, 7, 18);
    ctx.fillRect(102, 70, 7, 18);
  }
  if (look.hat === 'feather') {
    ctx.beginPath();
    ctx.ellipse(80, 62, 31, 15, 0, Math.PI, 0);
    ctx.fill();
  }

  // Face: villainous arched brows, narrowed eyes, a smug smile (or worried, or scowling: see OwnerMood).
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.2;
  if (mood === 'nervous') {
    // Worried: the inner ends of the brows shoot up.
    line(ctx, 62, 79, 74, 69);
    line(ctx, 98, 79, 86, 69);
  } else if (mood === 'humbled') {
    line(ctx, 63, 74, 75, 79);
    line(ctx, 97, 74, 85, 79);
  } else {
    line(ctx, 64, 76, 74, 72);
    line(ctx, 96, 76, 86, 72);
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  const eyeH = mood === 'nervous' ? 3.6 : 2.4;
  ctx.ellipse(70, 83, 3.6, eyeH, 0, 0, Math.PI * 2);
  ctx.ellipse(90, 83, 3.6, eyeH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (mood === 'nervous') ctx.ellipse(80, 103, 4, 5, 0, 0, Math.PI * 2);
  else if (mood === 'humbled') ctx.arc(80, 110, 9, Math.PI + 0.6, -0.6);
  else ctx.arc(84, 99, 9, 0.25, Math.PI - 0.9);
  ctx.stroke();
  ctx.fillStyle = shade(look.skin, -30);
  ctx.beginPath();
  ctx.ellipse(80, 92, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Signature pieces.
  switch (look.face) {
    case 'moustache':
      ctx.fillStyle = look.hair;
      ctx.beginPath();
      ctx.moveTo(80, 95);
      ctx.bezierCurveTo(70, 90, 58, 94, 56, 88);
      ctx.bezierCurveTo(56, 98, 70, 101, 80, 98);
      ctx.bezierCurveTo(90, 101, 104, 98, 104, 88);
      ctx.bezierCurveTo(102, 94, 90, 90, 80, 95);
      ctx.fill();
      break;
    case 'beard':
      ctx.fillStyle = look.hair;
      ctx.beginPath();
      ctx.moveTo(52, 88);
      ctx.bezierCurveTo(52, 128, 70, 138, 80, 140);
      ctx.bezierCurveTo(90, 138, 108, 128, 108, 88);
      ctx.bezierCurveTo(100, 104, 92, 96, 80, 97);
      ctx.bezierCurveTo(68, 96, 60, 104, 52, 88);
      ctx.fill();
      break;
    case 'lorgnette':
      ctx.strokeStyle = '#B08A3C';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(70, 83, 8, 0, Math.PI * 2);
      ctx.moveTo(98, 83);
      ctx.arc(90, 83, 8, 0, Math.PI * 2);
      ctx.moveTo(78, 83);
      ctx.lineTo(82, 83);
      ctx.moveTo(98, 86);
      ctx.lineTo(112, 116);
      ctx.stroke();
      break;
    case 'monocle':
      ctx.strokeStyle = '#B08A3C';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(90, 83, 8, 0, Math.PI * 2);
      ctx.moveTo(96, 89);
      ctx.quadraticCurveTo(104, 112, 96, 124);
      ctx.stroke();
      ctx.fillStyle = look.hair;
      ctx.fillRect(68, 96, 24, 4);
      break;
    case 'pearls':
      ctx.fillStyle = '#FBF7EF';
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.18 + i * 0.08);
        circle(ctx, 80 + Math.cos(a) * 22, 110 + Math.sin(a) * 12, 3.4);
      }
      break;
    case 'scarf':
      ctx.fillStyle = '#FBF7EF';
      ctx.beginPath();
      ctx.moveTo(58, 116);
      ctx.quadraticCurveTo(80, 128, 102, 116);
      ctx.lineTo(104, 126);
      ctx.quadraticCurveTo(122, 132, 138, 122);
      ctx.lineTo(132, 136);
      ctx.quadraticCurveTo(110, 142, 96, 134);
      ctx.quadraticCurveTo(78, 138, 60, 128);
      ctx.closePath();
      ctx.fill();
      break;
    case 'lashes':
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      for (const x of [70, 90]) for (const d of [-4, 0, 4]) line(ctx, x + d, 80, x + d * 1.4, 76);
      ctx.fillStyle = '#B8303F';
      ctx.beginPath();
      ctx.ellipse(82, 101, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      circle(ctx, 97, 96, 1.6);
      break;
  }

  // Hats.
  switch (look.hat) {
    case 'tophat':
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(80, 60, 38, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(58, 16, 44, 44);
      ctx.fillStyle = trim === INK ? '#8C2F39' : trim;
      ctx.fillRect(58, 48, 44, 7);
      break;
    case 'bowler':
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(80, 62, 36, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(80, 60, 26, 22, 0, Math.PI, 0);
      ctx.fill();
      break;
    case 'tam':
      ctx.fillStyle = '#B8483E';
      ctx.beginPath();
      ctx.ellipse(76, 56, 38, 14, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2E4A3A';
      ctx.lineWidth = 2;
      for (let x = 46; x < 110; x += 10) line(ctx, x, 46, x + 6, 66);
      ctx.fillStyle = '#2E4A3A';
      ctx.fillRect(46, 62, 64, 5);
      ctx.fillStyle = '#E2B653';
      circle(ctx, 74, 42, 7);
      break;
    case 'tiara':
      ctx.fillStyle = '#E2B653';
      ctx.beginPath();
      ctx.moveTo(60, 58);
      for (const [x, y] of [[66, 44], [72, 54], [80, 38], [88, 54], [94, 44], [100, 58]] as const) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7FA7C9';
      circle(ctx, 80, 48, 3.4);
      break;
    case 'goggles':
      ctx.fillStyle = '#7A5A3C';
      ctx.beginPath();
      ctx.ellipse(80, 62, 32, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(48, 60, 8, 22);
      ctx.fillRect(104, 60, 8, 22);
      ctx.fillStyle = INK;
      ctx.fillRect(52, 56, 56, 6);
      for (const x of [68, 92]) {
        ctx.fillStyle = '#B08A3C';
        circle(ctx, x, 58, 10);
        ctx.fillStyle = '#9FC4D6';
        circle(ctx, x, 58, 7);
      }
      break;
    case 'feather':
      ctx.fillStyle = '#E2B653';
      ctx.fillRect(52, 60, 56, 6);
      ctx.fillStyle = '#F2A7B5';
      ctx.beginPath();
      ctx.moveTo(98, 62);
      ctx.bezierCurveTo(110, 40, 108, 20, 96, 8);
      ctx.bezierCurveTo(100, 26, 92, 44, 98, 62);
      ctx.fill();
      ctx.fillStyle = '#7FA7C9';
      circle(ctx, 98, 63, 4);
      break;
    case 'bun':
      break;
  }
  if (mood === 'nervous') {
    // A bead of sweat at the temple.
    ctx.fillStyle = '#8FC6EA';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(112, 64);
    ctx.bezierCurveTo(105, 76, 106, 84, 112, 84);
    ctx.bezierCurveTo(118, 84, 119, 76, 112, 64);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  // Ring and newsprint wash.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(80, 80, 75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120, 96, 64, 0.1)';
  circle(ctx, 80, 80, 74);
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

/** A rival owner's portrait as a canvas element `size` CSS pixels across (drawn at twice that for sharpness). */
export function ownerPortrait(rival: Rival, size: number, mood: OwnerMood = 'smug'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'portrait';
  canvas.width = size * 2;
  canvas.height = size * 2;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  drawOwnerPortrait(canvas, rival.owner.look, rival.livery, rival.trim, mood);
  return canvas;
}
