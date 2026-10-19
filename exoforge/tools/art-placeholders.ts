// npm run art:placeholders: one clean flat placeholder per manifest entry, at its size and pivot, in the World 1
// palette, with its id written on it (SPEC B12.6). They make layout and feel testable; they are never judged for style.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

interface Asset {
  id: string;
  category: string;
  targetSizePx: [number, number];
  pivot: [number, number];
  tiles: 'none' | 'horizontal' | 'vertical' | 'both';
}

const root = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'art/ASSET_MANIFEST.json'), 'utf8')) as { assets: Asset[] };
const outDir = join(root, 'art/placeholders');
mkdirSync(outDir, { recursive: true });

const PAL = { skyTop: '#14121F', skyBottom: '#2B2236', rock: '#5A4A42', crystal: '#4FD1C5', lantern: '#FFB547' };

/** A small deterministic random source so placeholders are the same on every run. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 2 ** 32);
}

function label(a: Asset, w: number, h: number, color = '#ffffff'): string {
  const id = a.id;
  if (Math.min(w, h) < 90) return '';
  // Backgrounds and tiling textures get a small, faint corner label so the placeholder stays calm.
  if (a.category === 'background_layer' || a.tiles !== 'none') {
    return `<text x="16" y="34" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="22" fill="${color}" opacity="0.35">${id}</text>`;
  }
  const size = Math.max(10, Math.min(w / (id.length * 0.62), h * 0.12));
  return `<text x="${w / 2}" y="${h / 2}" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${size.toFixed(1)}" fill="${color}" text-anchor="middle" dominant-baseline="middle" stroke="#1a1420" stroke-width="${(size / 7).toFixed(1)}" paint-order="stroke">${id}</text>`;
}

function pivotMark(a: Asset, w: number, h: number): string {
  const x = a.pivot[0] * w;
  const y = a.pivot[1] * h;
  const s = Math.max(4, Math.min(w, h) * 0.05);
  return `<path d="M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}" stroke="#ff3d7f" stroke-width="${Math.max(1.5, s / 3)}"/>`;
}

/** Soft blotches that wrap at the edges, so tiling textures stay seamless. */
function blotches(seed: string, w: number, h: number, count: number, colors: string[], rMin: number, rMax: number, wrapX: boolean, wrapY: boolean): string {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = rMin + r() * (rMax - rMin);
    const fill = colors[Math.floor(r() * colors.length)];
    for (const dx of wrapX ? [-w, 0, w] : [0]) {
      for (const dy of wrapY ? [-h, 0, h] : [0]) {
        out += `<ellipse cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" rx="${rad.toFixed(1)}" ry="${(rad * 0.7).toFixed(1)}" fill="${fill}"/>`;
      }
    }
  }
  return out;
}

const radial = (id: string, inner: string, outer: string, outerOpacity = 0) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}" stop-opacity="${outerOpacity}"/></radialGradient>`;

function body(a: Asset, w: number, h: number): string {
  const id = a.id;
  const rr = Math.min(w, h) * 0.22;
  const box = (fill: string, extra = '') => `<rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}" rx="${rr}" fill="${fill}" stroke="#2a2026" stroke-width="${Math.min(w, h) * 0.04}"/>${extra}`;
  if (id.endsWith('.torso')) {
    return `<rect x="${w * 0.02}" y="${h * 0.12}" width="${w * 0.36}" height="${h * 0.62}" rx="${w * 0.06}" fill="#4a5a58" stroke="#2a2026" stroke-width="${w * 0.02}"/>
      <rect x="${w * 0.08}" y="${h * 0.3}" width="${w * 0.06}" height="${h * 0.26}" rx="${w * 0.02}" fill="${PAL.lantern}"/>
      <rect x="${w * 0.24}" y="${h * 0.02}" width="${w * 0.72}" height="${h * 0.96}" rx="${w * 0.3}" fill="#8a6f5b" stroke="#2a2026" stroke-width="${w * 0.025}"/>`;
  }
  if (id.endsWith('.helmet')) {
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.46}" ry="${h * 0.46}" fill="#7d8583" stroke="#2a2026" stroke-width="${w * 0.03}"/>
      <rect x="${w * 0.5}" y="${h * 0.28}" width="${w * 0.42}" height="${h * 0.32}" rx="${h * 0.14}" fill="${PAL.lantern}" stroke="#2a2026" stroke-width="${w * 0.02}"/>`;
  }
  if (id.endsWith('.boot')) return box('#5f5049', `<rect x="${w * 0.18}" y="${h * 0.8}" width="${w * 0.64}" height="${h * 0.16}" rx="${h * 0.05}" fill="#2a2026"/>`);
  if (id.startsWith('suit.') && id.includes('.plate.')) return box('#4f8f89');
  if (id.endsWith('.upper_arm') || id.endsWith('.thigh')) return box('#7c6555');
  if (id.endsWith('.forearm')) return box('#6e5b4e', `<circle cx="${w / 2}" cy="${h * 0.8}" r="${w * 0.42}" fill="#594a40" stroke="#2a2026" stroke-width="${w * 0.04}"/>`);
  if (id.startsWith('drone.w1')) {
    return `<ellipse cx="${w / 2}" cy="${h * 0.56}" rx="${w * 0.42}" ry="${h * 0.38}" fill="#b8733c" stroke="#2a2026" stroke-width="${w * 0.03}"/>
      <circle cx="${w * 0.62}" cy="${h * 0.56}" r="${h * 0.15}" fill="${PAL.crystal}" stroke="#2a2026" stroke-width="${w * 0.02}"/>
      <rect x="${w * 0.2}" y="${h * 0.04}" width="${w * 0.6}" height="${h * 0.08}" rx="${h * 0.04}" fill="#c9c2b8"/>
      <rect x="${w * 0.47}" y="${h * 0.08}" width="${w * 0.06}" height="${h * 0.12}" fill="#c9c2b8"/>`;
  }
  if (id === 'drone.cable') return `<rect x="0" y="${h * 0.2}" width="${w}" height="${h * 0.6}" fill="#6b5040"/><rect x="0" y="${h * 0.2}" width="${w}" height="${h * 0.15}" fill="#8f735c"/>`;
  if (id.startsWith('vfx.flame')) {
    const c = id.endsWith('outer') ? '#ff7a2a' : id.endsWith('mid') ? '#ffd23a' : '#fff6dc';
    return `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      <path d="M${w * 0.1} 0 Q${w * 0.5} ${h * 0.05} ${w * 0.9} 0 Q${w * 0.95} ${h * 0.5} ${w * 0.5} ${h} Q${w * 0.05} ${h * 0.5} ${w * 0.1} 0Z" fill="url(#f)"/>`;
  }
  const soft = (inner: string, outer: string, o = 0) => `<defs>${radial('g', inner, outer, o)}</defs><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" fill="url(#g)"/>`;
  if (id === 'vfx.glow') return soft('#ffffff', '#ffffff');
  if (id === 'vfx.smoke') return soft('#a59aa6', '#6d6470');
  if (id === 'vfx.steam') return soft('#f2f4f8', '#dfe6ee');
  if (id === 'vfx.dust') return soft('#a28d78', '#7d6a58');
  if (id === 'vfx.dent') return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.42}" ry="${h * 0.34}" fill="#2a2026" opacity="0.75"/><ellipse cx="${w * 0.42}" cy="${h * 0.42}" rx="${w * 0.15}" ry="${h * 0.1}" fill="#e8d8c0" opacity="0.6"/>`;
  if (id === 'vfx.spark') return `<defs><linearGradient id="s"><stop offset="0" stop-color="#fff8e0"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></linearGradient></defs><rect x="0" y="${h * 0.25}" width="${w}" height="${h * 0.5}" rx="${h * 0.25}" fill="url(#s)"/>`;
  if (id === 'vfx.sparkle') return `<path d="M${w / 2} 0 L${w * 0.58} ${h * 0.42} L${w} ${h / 2} L${w * 0.58} ${h * 0.58} L${w / 2} ${h} L${w * 0.42} ${h * 0.58} L0 ${h / 2} L${w * 0.42} ${h * 0.42}Z" fill="#ffffff"/>`;
  if (id === 'vfx.ring') return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.45}" ry="${h * 0.38}" fill="none" stroke="#c9b49c" stroke-width="${h * 0.14}" opacity="0.8"/>`;
  if (id === 'terrain.w1.rock.fill') {
    let grid = '';
    for (let i = 0; i < 4; i++) grid += `<path d="M${(i * w) / 4} 0V${h}M0 ${(i * h) / 4}H${w}" stroke="#4d3f38" stroke-width="2"/>`;
    return `<rect width="${w}" height="${h}" fill="${PAL.rock}"/>${blotches(id, w, h, 26, ['#625046', '#514139', '#6a574b'], w * 0.04, w * 0.12, true, true)}${grid}`;
  }
  if (id === 'terrain.w1.rock.edge') {
    return `<defs><linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b2967f"/><stop offset="0.25" stop-color="#7d6758"/><stop offset="1" stop-color="#4a3c35" stop-opacity="0.0"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#e)"/>${blotches(id, w, h * 0.45, 10, ['#8e7666', '#6c584b'], h * 0.06, h * 0.14, true, false)}`;
  }
  if (id === 'bg.w1.far') return `<rect width="${w}" height="${h}" fill="#1c1727"/>${blotches(id, w, h, 40, ['#211b2e', '#251f33', '#1a1524'], w * 0.05, w * 0.18, true, true)}`;
  if (id === 'bg.w1.mid') {
    const r = rng(id);
    let rocks = '';
    for (let i = 0; i < 9; i++) {
      const y = (i / 9) * h + r() * 80;
      const left = r() < 0.5;
      const reach = w * (0.12 + r() * 0.16);
      const x = left ? 0 : w - reach;
      for (const dy of [-h, 0, h]) rocks += `<rect x="${x}" y="${y + dy}" width="${reach}" height="${120 + r() * 220}" rx="60" fill="#2c2336" opacity="0.85"/>`;
    }
    return rocks;
  }
  if (id === 'workshop.w1.bg') {
    return `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.skyTop}"/><stop offset="0.7" stop-color="#3a2a26"/><stop offset="1" stop-color="#2a1d18"/></linearGradient>${radial('l', '#ffb547', '#ffb547')}</defs>
      <rect width="${w}" height="${h}" fill="url(#b)"/><circle cx="${w * 0.22}" cy="${h * 0.28}" r="${w * 0.5}" fill="url(#l)" opacity="0.35"/>
      ${blotches(id, w, h * 0.25, 18, ['#4a3a32', '#5d4a3c', '#3e2f28'], w * 0.04, w * 0.12, false, false).replace(/cy="([\d.]+)"/g, (_m, y) => `cy="${(Number(y) + h * 0.66).toFixed(1)}"`)}
      <rect x="0" y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="#6b4a32"/><rect x="0" y="${h * 0.9}" width="${w}" height="${h * 0.012}" fill="#a37450"/>`;
  }
  if (id === 'workshop.w1.stand') {
    return `<rect x="${w * 0.1}" y="${h * 0.9}" width="${w * 0.8}" height="${h * 0.08}" rx="12" fill="#4d4038"/>
      <rect x="${w * 0.14}" y="${h * 0.08}" width="${w * 0.06}" height="${h * 0.84}" fill="#5c4d43"/><rect x="${w * 0.8}" y="${h * 0.08}" width="${w * 0.06}" height="${h * 0.84}" fill="#5c4d43"/>
      <rect x="${w * 0.12}" y="${h * 0.05}" width="${w * 0.76}" height="${h * 0.05}" rx="8" fill="#6d5c50"/>`;
  }
  if (id === 'ui.dial.heat' || id === 'ui.dial.battery') {
    const arc = id.endsWith('heat') ? ['#4fd17a', '#ffd23a', '#ff5a3a'] : ['#2b5b6b', '#3fa5b0', PAL.crystal];
    return `<defs><linearGradient id="a"><stop offset="0" stop-color="${arc[0]}"/><stop offset="0.6" stop-color="${arc[1]}"/><stop offset="1" stop-color="${arc[2]}"/></linearGradient></defs>
      <circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.46}" fill="#2e2834" stroke="#c9b9a0" stroke-width="${w * 0.05}"/>
      <path d="M${w * 0.2} ${h * 0.7} A${w * 0.32} ${w * 0.32} 0 1 1 ${w * 0.8} ${h * 0.7}" fill="none" stroke="url(#a)" stroke-width="${w * 0.08}" stroke-linecap="round"/>
      <text x="${w / 2}" y="${h * 0.82}" font-family="DejaVu Sans" font-weight="bold" font-size="${w * 0.12}" fill="#e8dcc8" text-anchor="middle">${id.endsWith('heat') ? 'HEAT' : 'BATT'}</text>`;
  }
  if (id === 'ui.dial.needle') return `<path d="M${w * 0.47} ${h * 0.5} L${w * 0.5} ${h * 0.16} L${w * 0.53} ${h * 0.5}Z" fill="#ff5a3a"/><circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.06}" fill="#e8dcc8"/>`;
  if (id.startsWith('ui.icon.plate')) {
    const shield = `M${w * 0.5} ${h * 0.06} L${w * 0.9} ${h * 0.2} L${w * 0.84} ${h * 0.62} Q${w * 0.5} ${h * 0.98} ${w * 0.16} ${h * 0.62} L${w * 0.1} ${h * 0.2}Z`;
    if (id.endsWith('full')) return `<path d="${shield}" fill="${PAL.crystal}" stroke="#16323a" stroke-width="${w * 0.08}"/>`;
    if (id.endsWith('cracked')) return `<path d="${shield}" fill="#2f8a83" stroke="#16323a" stroke-width="${w * 0.08}"/><path d="M${w * 0.45} ${h * 0.12} L${w * 0.58} ${h * 0.42} L${w * 0.42} ${h * 0.58} L${w * 0.56} ${h * 0.86}" fill="none" stroke="#16323a" stroke-width="${w * 0.07}"/>`;
    return `<path d="${shield}" fill="#2a2430" stroke="#4b4452" stroke-width="${w * 0.08}" opacity="0.8"/>`;
  }
  if (id === 'ui.icon.pause') return `<circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.46}" fill="#3a3342" stroke="#c9b9a0" stroke-width="${w * 0.06}"/><rect x="${w * 0.34}" y="${h * 0.3}" width="${w * 0.1}" height="${h * 0.4}" rx="4" fill="#f2e6d0"/><rect x="${w * 0.56}" y="${h * 0.3}" width="${w * 0.1}" height="${h * 0.4}" rx="4" fill="#f2e6d0"/>`;
  if (id === 'ui.icon.flag') return `<rect x="${w * 0.2}" y="${h * 0.08}" width="${w * 0.08}" height="${h * 0.86}" fill="#e8dcc8"/><path d="M${w * 0.28} ${h * 0.1} L${w * 0.9} ${h * 0.28} L${w * 0.28} ${h * 0.48}Z" fill="${PAL.lantern}"/>`;
  if (id === 'ui.button.green' || id === 'ui.button.blue') {
    const [top, bottom, edge] = id.endsWith('green') ? ['#8fe06b', '#3f9a3a', '#24601f'] : ['#7cc4f5', '#2f6fb5', '#1c4675'];
    return `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
      <rect x="6" y="14" width="${w - 12}" height="${h - 20}" rx="44" fill="${edge}"/>
      <rect x="6" y="6" width="${w - 12}" height="${h - 30}" rx="44" fill="url(#b)" stroke="${edge}" stroke-width="6"/>
      <rect x="40" y="18" width="${w - 80}" height="${(h - 30) * 0.28}" rx="20" fill="#ffffff" opacity="0.28"/>`;
  }
  if (id === 'ui.panel.metal') return `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="56" fill="#3b3442" stroke="#c49a4a" stroke-width="12"/><rect x="24" y="24" width="${w - 48}" height="${h - 48}" rx="40" fill="#2d2734"/>`;
  if (id.startsWith('decor.w1')) {
    const color = id.endsWith('crystal') ? PAL.crystal : id.endsWith('lantern') ? PAL.lantern : id.endsWith('beam') ? '#7a5a3c' : id.endsWith('rails') ? '#6f6a66' : '#5d4c42';
    return box(color);
  }
  return box('#777777');
}

let count = 0;
for (const a of manifest.assets) {
  const [w, h] = a.targetSizePx;
  const showLabel = !a.id.startsWith('vfx.') && !a.id.startsWith('ui.') && a.id !== 'drone.cable';
  const showPivot = a.category === 'character_piece' || a.category === 'part' || a.category === 'vehicle';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body(a, w, h)}${showLabel ? label(a, w, h) : ''}${showPivot ? pivotMark(a, w, h) : ''}</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, `${a.id}.png`));
  count++;
}
console.log(`art:placeholders: wrote ${count} placeholders to art/placeholders/`);
