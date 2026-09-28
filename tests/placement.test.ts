import { describe, expect, it } from 'vitest';
import type { CarriageType, Rect } from '../src/core/types';
import { Walkable } from '../src/sim/Walkable';
import { footprints, getLayout, HALF_WIDTH, CARRIAGE_LENGTH, QUEUE_SLOTS, type Footprint } from '../src/world/layout';

const TYPES: CarriageType[] = ['lobby', 'bathroom', 'supply', 'luggage', 'sleeper'];
const PLAYER_RADIUS = 0.3;

/** How far a footprint reaches into a rect (0 when clear). Tiles are squares, the rest circles. */
function intrusion(f: Footprint, r: Rect): number {
  const half = f.kind === 'tile' ? f.r : f.r * 0.8;
  const dx = Math.max(r.x0 - (f.x + half), (f.x - half) - r.x1);
  const dz = Math.max(r.z0 - (f.z + half), (f.z - half) - r.z1);
  return dx < 0 && dz < 0 ? Math.min(-dx, -dz) : 0;
}

function overlap(a: Footprint, b: Footprint): number {
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  return a.r + b.r - d;
}

describe('placement: everything you walk over sits cleanly on the floor', () => {
  for (const type of TYPES) {
    const layout = getLayout(type);
    const walk = new Walkable(PLAYER_RADIUS);
    walk.rebuild([{ layout, originZ: 0 }], { doorsOpen: false, platform: null, rearDeck: null });
    const items = footprints(layout);

    it(`${type}: every zone, tile, pile and home is on walkable floor`, () => {
      for (const f of items) expect(walk.isWalkable(f.x, f.z), `${type}.${f.id} at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`).toBe(true);
    });

    it(`${type}: zones and piles do not reach into furniture`, () => {
      for (const f of items) {
        if (f.kind === 'tile') continue;
        for (const p of layout.props) {
          const into = intrusion(f, p.rect);
          expect(into, `${type}.${f.id} reaches ${into.toFixed(2)} m into the ${p.kind}`).toBeLessThan(0.12);
        }
      }
    });

    it(`${type}: tiles lie flat on open floor (not under furniture)`, () => {
      for (const f of items) {
        if (f.kind !== 'tile') continue;
        for (const p of layout.props) {
          const into = intrusion(f, p.rect);
          expect(into, `${type}.${f.id} lies ${into.toFixed(2)} m under the ${p.kind}`).toBeLessThan(0.05);
        }
      }
    });

    it(`${type}: nothing that can be up at the same time overlaps`, () => {
      const exclusive = items.filter((f) => f.kind !== 'home');
      for (let i = 0; i < exclusive.length; i++) {
        for (let j = i + 1; j < exclusive.length; j++) {
          const a = exclusive[i];
          const b = exclusive[j];
          if (a.group && a.group === b.group) continue;
          // Piles are small and sit beside what earned them; they may touch a zone's edge.
          const allowed = a.kind === 'pile' || b.kind === 'pile' ? 0.25 : 0.02;
          expect(overlap(a, b), `${type}: ${a.id} overlaps ${b.id}`).toBeLessThan(allowed);
        }
      }
    });
  }

  it('the lobby queue places are clear of the desk zone and of each other', () => {
    const layout = getLayout('lobby');
    const desk = footprints(layout).find((f) => f.id === 'desk')!;
    for (const q of QUEUE_SLOTS) expect(Math.hypot(q.x - desk.x, q.z - desk.z)).toBeGreaterThan(desk.r + 0.3);
    for (let i = 1; i < QUEUE_SLOTS.length; i++) {
      const a = QUEUE_SLOTS[i - 1];
      const b = QUEUE_SLOTS[i];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.6);
    }
  });

  // FLOORPLAN_DIR=… npx vitest run tests/placement.test.ts writes an SVG floor plan of every carriage.
  it('draws floor plans on request', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    const dir = env.FLOORPLAN_DIR;
    if (!dir) return;
    const fsModule = 'node:fs';
    const { writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync: (path: string, data: string) => void };
    const S = 60;
    const W = HALF_WIDTH * 2 * S;
    const H = CARRIAGE_LENGTH * S;
    const parts: string[] = [];
    TYPES.forEach((type, i) => {
      const layout = getLayout(type);
      const ox = 20 + i * (W + 40);
      const X = (x: number): number => ox + (x + HALF_WIDTH) * S;
      const Z = (z: number): number => 30 + z * S;
      const rectSvg = (r: Rect, fill: string, extra = ''): string => `<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${(r.x1 - r.x0) * S}" height="${(r.z1 - r.z0) * S}" fill="${fill}" ${extra}/>`;
      parts.push(`<text x="${ox}" y="20" font-size="16" font-family="sans-serif">${type}</text>`);
      for (const r of layout.rooms) parts.push(rectSvg(r, '#F4EFE4'));
      for (const c of layout.connectors) parts.push(rectSvg(c.rect, '#E8F0E0'));
      for (const w of layout.walls) parts.push(rectSvg(w, w.kind === 'exterior' ? '#5B6B78' : '#9C8F7D'));
      const propColors: Record<string, string> = { bed: '#C9B8E0', desk: '#B08A68', urn: '#A0A7B0', linen: '#D9C7A6', rack: '#8E7A68', luggageRack: '#8E7A68', bin: '#7F8A92', toilet: '#E6EEF2', sink: '#DCE8EE', bathtub: '#CDE0EA', shelfTowel: '#E6B0B8', shelfRoll: '#EEEEEE', crateBay: '#C8A878', bench: '#B7A07F', plant: '#8FB47A', lamp: '#EAD9A0' };
      for (const p of layout.props) parts.push(rectSvg(p.rect, propColors[p.kind] ?? '#CCC', 'stroke="#555" stroke-width="1"'));
      for (const q of QUEUE_SLOTS) if (type === 'lobby') parts.push(`<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="${0.22 * S}" fill="none" stroke="#B9707A" stroke-width="2" stroke-dasharray="4 3"/>`);
      for (const n of layout.nodes) parts.push(`<circle cx="${X(n.x)}" cy="${Z(n.z)}" r="2.5" fill="#3A7"/>`);
      for (const f of footprints(layout)) {
        const color = f.kind === 'tile' ? '#E2B653' : f.kind === 'pile' ? '#4E9A6E' : '#3F6FB0';
        if (f.kind === 'tile') parts.push(`<rect x="${X(f.x - f.r)}" y="${Z(f.z - f.r)}" width="${f.r * 2 * S}" height="${f.r * 2 * S}" fill="${color}33" stroke="${color}" stroke-width="2"/>`);
        else parts.push(`<circle cx="${X(f.x)}" cy="${Z(f.z)}" r="${f.r * S}" fill="${color}33" stroke="${color}" stroke-width="2"/>`);
        parts.push(`<text x="${X(f.x)}" y="${Z(f.z) + 3}" font-size="9" text-anchor="middle" font-family="sans-serif" fill="#222">${f.id}</text>`);
      }
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${20 + TYPES.length * (W + 40)}" height="${H + 60}" style="background:#fff">${parts.join('')}</svg>`;
    writeFileSync(`${dir}/floorplans.svg`, svg);
  });
});
