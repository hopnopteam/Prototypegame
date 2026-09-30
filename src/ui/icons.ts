/**
 * Hand-drawn vector icons on canvas, shared by the HUD (as data URLs) and in-world sprites (as textures).
 * Drawn in a 100×100 box. No image assets, no emoji: one consistent look on every device.
 */
export type IconName =
  | 'tea' | 'blanket' | 'pillow' | 'towel' | 'roll' | 'luggage' | 'crate' | 'broom' | 'bed' | 'person'
  | 'star' | 'cash' | 'gem' | 'miles' | 'bath' | 'clock' | 'ad' | 'lock' | 'plus' | 'carriage' | 'zzz'
  | 'heart' | 'bolt' | 'bag' | 'gear' | 'album' | 'calendar' | 'quest' | 'ticket' | 'check' | 'camera'
  | 'wrench' | 'skate' | 'hold' | 'chest' | 'noroom' | 'double' | 'box' | 'paint' | 'news' | 'trophy'
  | 'mic' | 'dash' | 'hand' | 'menu' | 'conductor' | 'linen' | 'megaphone' | 'smile' | 'frown';

export const INK = '#2B2230';
const CREAM = '#FFF6E4';

type Draw = (c: CanvasRenderingContext2D) => void;

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

const fillStroke = (c: CanvasRenderingContext2D, fill: string, line = 6): void => {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = line;
  c.strokeStyle = INK;
  c.stroke();
};

const star = (c: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void => {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
};

const ICONS: Record<IconName, Draw> = {
  tea: (c) => {
    c.beginPath();
    c.ellipse(50, 80, 38, 9, 0, 0, Math.PI * 2);
    fillStroke(c, '#E8DCC6');
    c.beginPath();
    c.moveTo(22, 40);
    c.lineTo(78, 40);
    c.quadraticCurveTo(76, 76, 50, 76);
    c.quadraticCurveTo(24, 76, 22, 40);
    fillStroke(c, '#FFFFFF');
    c.beginPath();
    c.arc(80, 52, 9, -Math.PI / 2, Math.PI / 2);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = '#B8733D';
    c.fillRect(27, 43, 46, 7);
    c.strokeStyle = '#9A8F86';
    c.lineWidth = 5;
    c.lineCap = 'round';
    for (const x of [38, 52, 64]) {
      c.beginPath();
      c.moveTo(x, 32);
      c.quadraticCurveTo(x - 6, 22, x, 12);
      c.stroke();
    }
  },
  blanket: (c) => {
    rr(c, 14, 28, 72, 50, 10);
    fillStroke(c, '#E9B949');
    c.fillStyle = '#C0485C';
    for (const x of [26, 42, 58, 74]) c.fillRect(x - 3, 30, 6, 46);
    rr(c, 14, 28, 72, 50, 10);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
  },
  pillow: (c) => {
    c.beginPath();
    c.moveTo(16, 32);
    c.quadraticCurveTo(50, 22, 84, 32);
    c.quadraticCurveTo(92, 50, 84, 70);
    c.quadraticCurveTo(50, 80, 16, 70);
    c.quadraticCurveTo(8, 50, 16, 32);
    fillStroke(c, '#FFFFFF');
    c.strokeStyle = '#C9BFD6';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(32, 50);
    c.quadraticCurveTo(50, 44, 68, 50);
    c.stroke();
  },
  towel: (c) => {
    rr(c, 18, 26, 64, 50, 8);
    fillStroke(c, '#F29CA8');
    c.fillStyle = '#FFFFFF';
    c.fillRect(22, 58, 56, 7);
    rr(c, 18, 26, 64, 50, 8);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
  },
  roll: (c) => {
    rr(c, 20, 30, 50, 46, 6);
    fillStroke(c, '#FFFFFF');
    c.beginPath();
    c.ellipse(70, 53, 12, 23, 0, 0, Math.PI * 2);
    fillStroke(c, '#F4EFE6');
    c.beginPath();
    c.ellipse(70, 53, 4, 8, 0, 0, Math.PI * 2);
    fillStroke(c, '#BDB3A6', 4);
  },
  luggage: (c) => {
    rr(c, 36, 14, 28, 16, 6);
    c.lineWidth = 7;
    c.strokeStyle = INK;
    c.stroke();
    rr(c, 16, 26, 68, 58, 10);
    fillStroke(c, '#C9764A');
    c.fillStyle = '#F6ECD6';
    c.fillRect(32, 28, 8, 54);
    c.fillRect(60, 28, 8, 54);
    rr(c, 16, 26, 68, 58, 10);
    c.lineWidth = 6;
    c.stroke();
  },
  crate: (c) => {
    rr(c, 16, 22, 68, 62, 6);
    fillStroke(c, '#C99A5B');
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(16, 42);
    c.lineTo(84, 42);
    c.moveTo(16, 64);
    c.lineTo(84, 64);
    c.moveTo(22, 26);
    c.lineTo(78, 80);
    c.stroke();
  },
  broom: (c) => {
    c.strokeStyle = '#8B5A3C';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(70, 12);
    c.lineTo(46, 58);
    c.stroke();
    c.beginPath();
    c.moveTo(34, 52);
    c.lineTo(60, 64);
    c.lineTo(46, 90);
    c.lineTo(16, 78);
    c.closePath();
    fillStroke(c, '#E8B04B');
  },
  bed: (c) => {
    rr(c, 10, 46, 80, 26, 6);
    fillStroke(c, '#F7F2E8');
    rr(c, 14, 38, 26, 14, 6);
    fillStroke(c, '#FFFFFF', 5);
    rr(c, 42, 44, 48, 28, 6);
    fillStroke(c, '#9C3346', 5);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(12, 72);
    c.lineTo(12, 84);
    c.moveTo(88, 72);
    c.lineTo(88, 84);
    c.stroke();
  },
  person: (c) => {
    c.beginPath();
    c.arc(50, 34, 16, 0, Math.PI * 2);
    fillStroke(c, '#F1C7A5');
    c.beginPath();
    c.moveTo(22, 88);
    c.quadraticCurveTo(22, 54, 50, 54);
    c.quadraticCurveTo(78, 54, 78, 88);
    c.closePath();
    fillStroke(c, '#2E4A7A');
    rr(c, 32, 14, 36, 10, 4);
    fillStroke(c, '#2E4A7A', 5);
  },
  star: (c) => {
    star(c, 50, 54, 40, 18);
    fillStroke(c, '#FFD35C');
  },
  cash: (c) => {
    rr(c, 10, 26, 80, 48, 8);
    fillStroke(c, '#7BC26B');
    c.beginPath();
    c.arc(50, 50, 13, 0, Math.PI * 2);
    fillStroke(c, '#CDEBC0', 5);
    c.fillStyle = INK;
    c.font = 'bold 20px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('F', 50, 51);
  },
  gem: (c) => {
    c.beginPath();
    c.moveTo(28, 26);
    c.lineTo(72, 26);
    c.lineTo(88, 44);
    c.lineTo(50, 88);
    c.lineTo(12, 44);
    c.closePath();
    fillStroke(c, '#58C4E8');
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(12, 44);
    c.lineTo(88, 44);
    c.moveTo(38, 26);
    c.lineTo(50, 88);
    c.lineTo(62, 26);
    c.stroke();
  },
  miles: (c) => {
    rr(c, 10, 22, 80, 56, 8);
    fillStroke(c, '#F2C94C');
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.setLineDash([6, 5]);
    c.beginPath();
    c.moveTo(66, 24);
    c.lineTo(66, 76);
    c.stroke();
    c.setLineDash([]);
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(22, 64);
    c.lineTo(36, 36);
    c.moveTo(44, 64);
    c.lineTo(30, 36);
    c.moveTo(25, 55);
    c.lineTo(42, 55);
    c.moveTo(27, 45);
    c.lineTo(39, 45);
    c.stroke();
  },
  bath: (c) => {
    c.beginPath();
    c.moveTo(50, 12);
    c.quadraticCurveTo(80, 50, 80, 62);
    c.arc(50, 62, 30, 0, Math.PI);
    c.quadraticCurveTo(20, 50, 50, 12);
    fillStroke(c, '#7FC8E8');
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.ellipse(40, 60, 6, 10, -0.4, 0, Math.PI * 2);
    c.fill();
  },
  clock: (c) => {
    c.beginPath();
    c.arc(50, 52, 36, 0, Math.PI * 2);
    fillStroke(c, CREAM);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(50, 52);
    c.lineTo(50, 30);
    c.moveTo(50, 52);
    c.lineTo(66, 60);
    c.stroke();
  },
  ad: (c) => {
    rr(c, 10, 22, 80, 56, 12);
    fillStroke(c, '#FFD35C');
    c.beginPath();
    c.moveTo(40, 36);
    c.lineTo(66, 50);
    c.lineTo(40, 64);
    c.closePath();
    c.fillStyle = INK;
    c.fill();
  },
  lock: (c) => {
    c.strokeStyle = INK;
    c.lineWidth = 9;
    c.beginPath();
    c.arc(50, 40, 16, Math.PI, 0);
    c.stroke();
    rr(c, 24, 40, 52, 44, 8);
    fillStroke(c, '#D9A441');
  },
  plus: (c) => {
    c.beginPath();
    c.arc(50, 50, 38, 0, Math.PI * 2);
    fillStroke(c, '#7BC26B');
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(50, 32);
    c.lineTo(50, 68);
    c.moveTo(32, 50);
    c.lineTo(68, 50);
    c.stroke();
  },
  carriage: (c) => {
    rr(c, 8, 26, 84, 44, 8);
    fillStroke(c, '#7A2233');
    c.fillStyle = '#FFE1A0';
    for (const x of [18, 40, 62]) {
      rr(c, x, 34, 18, 16, 3);
      c.fill();
    }
    c.fillStyle = '#D9A441';
    c.fillRect(10, 56, 80, 5);
    for (const x of [26, 74]) {
      c.beginPath();
      c.arc(x, 76, 9, 0, Math.PI * 2);
      fillStroke(c, '#2B2626', 5);
    }
  },
  zzz: (c) => {
    c.fillStyle = '#8FA8D8';
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.font = 'bold 44px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeText('Z', 36, 60);
    c.fillText('Z', 36, 60);
    c.font = 'bold 30px sans-serif';
    c.strokeText('z', 66, 34);
    c.fillText('z', 66, 34);
  },
  smile: (c) => {
    c.beginPath();
    c.arc(50, 50, 38, 0, Math.PI * 2);
    fillStroke(c, '#FFD35C');
    c.fillStyle = INK;
    c.beginPath();
    c.arc(37, 42, 5.5, 0, Math.PI * 2);
    c.arc(63, 42, 5.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(50, 52, 18, 0.18 * Math.PI, 0.82 * Math.PI);
    c.stroke();
    c.fillStyle = '#F29BA8';
    c.beginPath();
    c.arc(28, 58, 6, 0, Math.PI * 2);
    c.arc(72, 58, 6, 0, Math.PI * 2);
    c.fill();
  },
  frown: (c) => {
    c.beginPath();
    c.arc(50, 50, 38, 0, Math.PI * 2);
    fillStroke(c, '#C9D3E0');
    c.fillStyle = INK;
    c.beginPath();
    c.arc(37, 44, 5.5, 0, Math.PI * 2);
    c.arc(63, 44, 5.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(50, 78, 16, 1.2 * Math.PI, 1.8 * Math.PI);
    c.stroke();
  },
  heart: (c) => {
    c.beginPath();
    c.moveTo(50, 84);
    c.bezierCurveTo(8, 56, 14, 18, 50, 34);
    c.bezierCurveTo(86, 18, 92, 56, 50, 84);
    fillStroke(c, '#E8577A');
  },
  bolt: (c) => {
    c.beginPath();
    c.moveTo(58, 8);
    c.lineTo(22, 56);
    c.lineTo(46, 56);
    c.lineTo(40, 92);
    c.lineTo(78, 42);
    c.lineTo(54, 42);
    c.closePath();
    fillStroke(c, '#FFD35C');
  },
  bag: (c) => {
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.beginPath();
    c.arc(50, 36, 14, Math.PI, 0);
    c.stroke();
    rr(c, 18, 34, 64, 52, 10);
    fillStroke(c, '#E26D8C');
  },
  gear: (c) => {
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 40 : 30;
      const a = (i * Math.PI) / 8;
      c.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r);
    }
    c.closePath();
    fillStroke(c, '#C9BFB0');
    c.beginPath();
    c.arc(50, 50, 12, 0, Math.PI * 2);
    fillStroke(c, CREAM, 5);
  },
  album: (c) => {
    rr(c, 14, 20, 72, 60, 6);
    fillStroke(c, '#FBEBCB');
    c.fillStyle = '#7FA54A';
    c.beginPath();
    c.moveTo(18, 70);
    c.quadraticCurveTo(40, 44, 58, 60);
    c.quadraticCurveTo(70, 50, 82, 62);
    c.lineTo(82, 76);
    c.lineTo(18, 76);
    c.fill();
    c.beginPath();
    c.arc(66, 38, 8, 0, Math.PI * 2);
    c.fillStyle = '#F2B45E';
    c.fill();
    rr(c, 14, 20, 72, 60, 6);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
  },
  calendar: (c) => {
    rr(c, 14, 20, 72, 66, 8);
    fillStroke(c, CREAM);
    c.fillStyle = '#9C3346';
    c.fillRect(17, 23, 66, 16);
    c.fillStyle = INK;
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) c.fillRect(24 + k * 15, 48 + r * 16, 8, 8);
    rr(c, 14, 20, 72, 66, 8);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
  },
  quest: (c) => {
    rr(c, 18, 14, 64, 76, 8);
    fillStroke(c, CREAM);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineCap = 'round';
    for (const y of [36, 54, 72]) {
      c.beginPath();
      c.moveTo(30, y);
      c.lineTo(36, y + 5);
      c.lineTo(44, y - 5);
      c.moveTo(52, y);
      c.lineTo(70, y);
      c.stroke();
    }
  },
  ticket: (c) => {
    c.beginPath();
    c.moveTo(12, 28);
    c.lineTo(88, 28);
    c.lineTo(88, 42);
    c.arc(88, 50, 8, -Math.PI / 2, Math.PI / 2, true);
    c.lineTo(88, 72);
    c.lineTo(12, 72);
    c.lineTo(12, 58);
    c.arc(12, 50, 8, Math.PI / 2, -Math.PI / 2, true);
    c.closePath();
    fillStroke(c, '#FFD35C');
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(66, 30);
    c.lineTo(66, 70);
    c.stroke();
    c.setLineDash([]);
  },
  check: (c) => {
    c.beginPath();
    c.arc(50, 50, 38, 0, Math.PI * 2);
    fillStroke(c, '#7BC26B');
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(32, 52);
    c.lineTo(45, 64);
    c.lineTo(68, 38);
    c.stroke();
  },
  camera: (c) => {
    rr(c, 12, 30, 76, 52, 10);
    fillStroke(c, '#5A6273');
    rr(c, 34, 20, 30, 14, 4);
    fillStroke(c, '#5A6273', 5);
    c.beginPath();
    c.arc(50, 56, 15, 0, Math.PI * 2);
    fillStroke(c, '#9FD3F0', 5);
  },
  paint: (c) => {
    // A paint roller: the refurbishment tile.
    c.beginPath();
    c.moveTo(78, 30);
    c.lineTo(86, 30);
    c.lineTo(86, 52);
    c.lineTo(52, 58);
    c.lineTo(52, 66);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.stroke();
    rr(c, 44, 64, 16, 28, 6);
    fillStroke(c, '#8E6A4C');
    rr(c, 12, 16, 68, 28, 12);
    fillStroke(c, '#E9A1A8');
    c.beginPath();
    c.moveTo(22, 24);
    c.lineTo(56, 24);
    c.lineWidth = 5;
    c.strokeStyle = '#FFFFFF';
    c.stroke();
  },
  news: (c) => {
    // A folded newspaper: the Rail Gazette.
    rr(c, 14, 20, 72, 62, 8);
    fillStroke(c, CREAM);
    c.fillStyle = INK;
    c.fillRect(24, 30, 52, 9);
    rr(c, 24, 46, 22, 24, 3);
    fillStroke(c, '#9DB8CF', 4);
    c.fillStyle = INK;
    for (const y of [48, 56, 64]) c.fillRect(52, y, 24, 4);
    c.fillRect(24, 74, 52, 3);
  },
  trophy: (c) => {
    // The Golden Whistle award.
    c.beginPath();
    c.moveTo(28, 16);
    c.lineTo(72, 16);
    c.quadraticCurveTo(72, 56, 50, 60);
    c.quadraticCurveTo(28, 56, 28, 16);
    c.closePath();
    fillStroke(c, '#FFD35C');
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(50 + side * 26, 30, 10, side < 0 ? 0.5 * Math.PI : -0.5 * Math.PI, side < 0 ? 1.5 * Math.PI : 0.5 * Math.PI, side > 0);
      c.lineWidth = 6;
      c.strokeStyle = INK;
      c.stroke();
    }
    rr(c, 44, 58, 12, 14, 2);
    fillStroke(c, '#E2B653', 5);
    rr(c, 30, 72, 40, 12, 4);
    fillStroke(c, '#8E6A4C', 5);
  },
  mic: (c) => {
    // An interviewer's microphone.
    rr(c, 36, 12, 28, 44, 14);
    fillStroke(c, '#C9BFB0');
    c.beginPath();
    c.arc(50, 44, 24, 0, Math.PI);
    c.moveTo(50, 68);
    c.lineTo(50, 84);
    c.moveTo(36, 86);
    c.lineTo(64, 86);
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.stroke();
  },
  dash: (c) => {
    // Quick travel: a running arrow with speed lines.
    c.beginPath();
    c.moveTo(34, 30);
    c.lineTo(62, 30);
    c.lineTo(62, 18);
    c.lineTo(86, 50);
    c.lineTo(62, 82);
    c.lineTo(62, 70);
    c.lineTo(34, 70);
    c.closePath();
    fillStroke(c, '#FFD35C');
    c.beginPath();
    for (const y of [38, 50, 62]) {
      c.moveTo(12, y);
      c.lineTo(26, y);
    }
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.stroke();
  },
  megaphone: (c) => {
    // Marketing: a brass megaphone with sound waves.
    c.beginPath();
    c.moveTo(18, 42);
    c.lineTo(34, 42);
    c.lineTo(66, 22);
    c.lineTo(66, 78);
    c.lineTo(34, 58);
    c.lineTo(18, 58);
    c.closePath();
    fillStroke(c, '#F2B233');
    rr(c, 26, 58, 12, 20, 4);
    fillStroke(c, '#C0485C', 5);
    c.beginPath();
    c.arc(70, 50, 12, -0.9, 0.9);
    c.moveTo(80, 36);
    c.arc(70, 50, 22, -0.9, 0.9);
    c.lineWidth = 5;
    c.strokeStyle = INK;
    c.stroke();
  },
  linen: (c) => {
    // The linen cupboard: a folded blanket with a pillow on top.
    rr(c, 14, 50, 72, 34, 10);
    fillStroke(c, '#7D9CBB');
    c.beginPath();
    c.moveTo(22, 64);
    c.lineTo(78, 64);
    c.lineWidth = 4;
    c.strokeStyle = '#FFFFFF';
    c.stroke();
    rr(c, 24, 18, 52, 30, 14);
    fillStroke(c, '#FFFFFF');
  },
  hand: (c) => {
    // A pointing hand for the drag gesture.
    c.beginPath();
    c.moveTo(40, 58);
    c.lineTo(40, 18);
    c.quadraticCurveTo(40, 10, 47, 10);
    c.quadraticCurveTo(54, 10, 54, 18);
    c.lineTo(54, 44);
    c.lineTo(62, 42);
    c.quadraticCurveTo(70, 42, 70, 49);
    c.lineTo(76, 48);
    c.quadraticCurveTo(84, 49, 84, 57);
    c.lineTo(84, 70);
    c.quadraticCurveTo(84, 90, 62, 90);
    c.lineTo(52, 90);
    c.quadraticCurveTo(38, 90, 30, 78);
    c.lineTo(20, 62);
    c.quadraticCurveTo(16, 54, 24, 52);
    c.quadraticCurveTo(32, 50, 40, 58);
    c.closePath();
    fillStroke(c, '#FBEAD8', 5);
  },
  menu: (c) => {
    for (const y of [28, 50, 72]) {
      rr(c, 18, y - 6, 64, 12, 6);
      fillStroke(c, '#FBF3E4', 4);
    }
  },
  conductor: (c) => {
    // The conductor's cap: navy crown, red band, gold badge.
    c.beginPath();
    c.moveTo(16, 56);
    c.quadraticCurveTo(16, 22, 50, 20);
    c.quadraticCurveTo(84, 22, 84, 56);
    c.closePath();
    fillStroke(c, '#2C4A6E');
    rr(c, 14, 52, 72, 14, 5);
    fillStroke(c, '#C0485C', 5);
    c.beginPath();
    c.moveTo(18, 66);
    c.quadraticCurveTo(50, 90, 82, 66);
    c.closePath();
    fillStroke(c, '#1F3551', 5);
    c.beginPath();
    c.arc(50, 40, 8, 0, Math.PI * 2);
    fillStroke(c, '#F2B233', 4);
  },
  wrench: (c) => {
    c.save();
    c.translate(50, 50);
    c.rotate(-Math.PI / 4);
    rr(c, -8, -8, 16, 50, 6);
    fillStroke(c, '#C9BFB0');
    c.beginPath();
    c.arc(0, -24, 20, 0.35 * Math.PI, 2.65 * Math.PI);
    c.lineTo(-6, -30);
    c.lineTo(6, -30);
    c.closePath();
    fillStroke(c, '#C9BFB0');
    c.restore();
  },
  skate: (c) => {
    c.beginPath();
    c.moveTo(24, 20);
    c.lineTo(48, 20);
    c.lineTo(52, 50);
    c.lineTo(80, 56);
    c.quadraticCurveTo(86, 62, 80, 68);
    c.lineTo(22, 68);
    c.closePath();
    fillStroke(c, '#E26D8C');
    for (const x of [30, 70]) {
      c.beginPath();
      c.arc(x, 80, 9, 0, Math.PI * 2);
      fillStroke(c, '#FFD35C', 5);
    }
  },
  hold: (c) => {
    c.beginPath();
    c.arc(50, 52, 36, 0, Math.PI * 2);
    fillStroke(c, CREAM);
    c.fillStyle = '#9C3346';
    c.fillRect(36, 34, 10, 36);
    c.fillRect(54, 34, 10, 36);
  },
  chest: (c) => {
    rr(c, 14, 44, 72, 40, 6);
    fillStroke(c, '#B5673A');
    c.beginPath();
    c.moveTo(14, 46);
    c.quadraticCurveTo(50, 12, 86, 46);
    c.closePath();
    fillStroke(c, '#C9804A');
    rr(c, 42, 46, 16, 18, 3);
    fillStroke(c, '#FFD35C', 4);
  },
  noroom: (c) => {
    ICONS.bed(c);
    c.strokeStyle = '#D6453D';
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(22, 22);
    c.lineTo(78, 88);
    c.stroke();
  },
  double: (c) => {
    c.fillStyle = '#FFD35C';
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.font = 'bold 50px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeText('×2', 50, 54);
    c.fillText('×2', 50, 54);
  },
  box: (c) => {
    rr(c, 16, 22, 68, 62, 8);
    fillStroke(c, '#D9A441');
  },
};

const urlCache = new Map<string, string>();

export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ICONS[name](ctx);
  ctx.restore();
}

/** Icon as a data URL for <img> tags. Cached per name and size. */
export function iconUrl(name: IconName, size = 64): string {
  const key = `${name}@${size}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawIcon(ctx, name, 0, 0, size);
  const url = canvas.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

export const ITEM_ICON: Record<string, IconName> = {
  tea: 'tea',
  blanket: 'blanket',
  pillow: 'pillow',
  towel: 'towel',
  roll: 'roll',
  luggage: 'luggage',
  crate: 'crate',
};
