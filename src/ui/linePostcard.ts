import type { LineTransitionDef } from '../config/lineTransition';
import type { RouteArchive } from '../save/SaveData';

/** Each carriage's paint on the postcard (Stage A: flat colours; Stage B renders the archived train on a postcard stage). */
const CAR_PAINT: Record<string, string> = {
  lobby: '#3F6E53', cafe: '#B8574A', sleeper: '#2C4A6E', bathroom: '#5E8C8A', bar: '#6B3A4A', dining: '#7A2E2E', familySleeper: '#C98552', cinema: '#5A2A3A',
  pool: '#3E8FC9', kids: '#E0A33A', spa: '#7FAF9A', honeymoon: '#C9657A', dome: '#2E4A5E', stores: '#6E6250', luggage: '#7A6A52', sleeper2: '#2C4A6E',
};

/**
 * The finished train's postcard, drawn again every time it is shown (nothing is stored): a cream card with a
 * perforated stamp edge, the line's name and the train as it was left (the archive's carriages, in their paint), with
 * a postmark. `scale` is the device pixel ratio to draw at.
 */
export function drawLinePostcard(canvas: HTMLCanvasElement, def: LineTransitionDef, archive: RouteArchive | null, routeName: string, scale: number): void {
  const W = 300;
  const H = 196;
  canvas.width = W * scale;
  canvas.height = H * scale;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.scale(scale, scale);
  // Perforations: a cream card with scalloped edges.
  g.fillStyle = '#FBF4E2';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#00000000';
  g.globalCompositeOperation = 'destination-out';
  for (let x = 6; x < W; x += 12) for (const y of [0, H]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  for (let y = 6; y < H; y += 12) for (const x of [0, W]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = def.postcard.frame;
  g.lineWidth = 3;
  g.strokeRect(12, 12, W - 24, H - 24);
  // A dusk sky over green land, the line's own country.
  const sky = g.createLinearGradient(0, 18, 0, 120);
  sky.addColorStop(0, '#2C3F6E');
  sky.addColorStop(1, '#F2B78C');
  g.fillStyle = sky;
  g.fillRect(18, 18, W - 36, 104);
  g.fillStyle = '#4E7A44';
  g.fillRect(18, 112, W - 36, 30);
  // The train: the engine and every carriage the route left with.
  const cars = archive?.route.carriages ?? ['lobby'];
  const avail = W - 36 - 30;
  const w = Math.min(30, (avail - 6) / Math.max(1, cars.length));
  let x = 22;
  g.fillStyle = '#1E2A22';
  g.fillRect(x, 96, 28, 18);
  g.fillRect(x + 4, 86, 6, 10);
  x += 30;
  for (const c of cars) {
    g.fillStyle = CAR_PAINT[c] ?? '#5A6470';
    g.fillRect(x, 98, w - 2, 16);
    g.fillStyle = '#FFE3A8';
    g.fillRect(x + 2, 102, w - 6, 4);
    x += w;
  }
  g.fillStyle = '#2A2A2E';
  g.fillRect(18, 114, W - 36, 3);
  g.fillStyle = def.postcard.ink;
  g.font = '700 10px Jost, sans-serif';
  g.textAlign = 'left';
  g.fillText(def.postcard.stamp, 22, 34);
  g.font = '700 17px "Playfair Display", Georgia, serif';
  g.fillText(def.postcard.caption, 22, 160);
  g.font = '500 10px Jost, sans-serif';
  const stats = archive ? `${cars.length} carriages · Level ${archive.route.level} · ${archive.stats.guests} guests` : routeName;
  g.fillText(stats, 22, 176);
  // The postmark.
  g.strokeStyle = '#7A2E2E';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(W - 52, 44, 22, 0, Math.PI * 2);
  g.stroke();
  g.font = '700 8px Jost, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#7A2E2E';
  g.fillText('PRESERVED', W - 52, 47);
}
