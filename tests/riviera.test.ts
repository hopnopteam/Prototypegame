import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CARRIAGE_CATALOGUE } from '../src/config/content';
import { ECONOMY } from '../src/config/economy';
import { RIVIERA_COAST } from '../src/config/routes';
import { VENUES, VENUE_MENUS } from '../src/config/venues';
import type { Vec2 } from '../src/core/types';
import { TrainMap } from '../src/sim/TrainMap';
import { closedVenueProps, footprints, roomsAt, setLayoutOptions } from '../src/world/layout';

/**
 * Phase 4, the Riviera Coast Line: its nine carriages (four of them new types) and its layout knobs (four cabanas in
 * the Beach Lobby, three showers, ten diner tables) build a train the player can walk everywhere in, at every refit.
 */
const TRAIN = [...RIVIERA_COAST.carriageOrder];
const GRID = 0.05;

function reachable(map: TrainMap, start: Vec2): (p: Vec2, tolerance?: number) => boolean {
  const key = (ix: number, iz: number): string => `${ix},${iz}`;
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.round(start.x / GRID), Math.round(start.z / GRID)]];
  seen.add(key(queue[0][0], queue[0][1]));
  while (queue.length > 0) {
    const [ix, iz] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const nz = iz + dz;
      const k = key(nx, nz);
      if (seen.has(k) || !map.walk.isWalkable(nx * GRID, nz * GRID)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return (p, tolerance = 0.45) => {
    const r = Math.ceil(tolerance / GRID);
    const cx = Math.round(p.x / GRID);
    const cz = Math.round(p.z / GRID);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r && seen.has(key(cx + dx, cz + dz))) return true;
    return false;
  };
}

describe('the Riviera Coast Line', () => {
  beforeAll(() => setLayoutOptions(RIVIERA_COAST.layout ?? {}));
  afterAll(() => setLayoutOptions({}));

  it('holds nine carriages: four new types among them, each with its tiles', () => {
    expect(TRAIN.length).toBe(9);
    expect(RIVIERA_COAST.maxCarriages).toBe(9);
    for (const type of ['kids', 'spa', 'honeymoon', 'pool'] as const) {
      expect(TRAIN).toContain(type);
      expect(CARRIAGE_CATALOGUE[type].unlocks.some((u) => u.kind === 'refurb' && u.tier === 3), type).toBe(true);
      expect(CARRIAGE_CATALOGUE[type].unlocks.some((u) => u.kind === 'hire'), type).toBe(true);
    }
    expect(RIVIERA_COAST.economy.couplePrices.length).toBe(TRAIN.length - 1);
  });

  it('gives the Beach Lobby four cabanas and the Honeymoon Suites four rooms', () => {
    expect(roomsAt('lobby', 0)).toBe(4);
    expect(roomsAt('honeymoon', 0)).toBe(4);
  });

  it('prices every new menu (each multiplier names what it applies to)', () => {
    for (const key of ['menu_sundaes', 'menu_puppets', 'menu_stones', 'menu_cabanas']) expect(VENUE_MENUS[key], key).toBeDefined();
    expect(VENUES.kids.families).toBe(true);
  });

  for (let tier = 0; tier <= 3; tier++) {
    it(`at refit ${tier}: every anchor, cabin, washroom, venue pad and seat is in reach`, () => {
      const map = new TrainMap(ECONOMY.player.radius);
      map.closedProps = (i) => {
        const layout = map.layoutOf(i);
        return closedVenueProps(layout, layout.venue?.groups.map(() => true) ?? [], new Set());
      };
      map.rebuild(TRAIN, false, false, TRAIN.map(() => tier));
      const reach = reachable(map, map.anchor(0, 'playerSpawn'));
      for (const c of map.carriages) {
        for (const name of Object.keys(c.layout.anchors)) expect(reach(map.anchor(c.index, name)), `${c.layout.type}@${tier} anchor ${name}`).toBe(true);
        for (const cabin of c.layout.cabins) expect(reach(map.toWorld(c.index, cabin.center)), `${c.layout.type}@${tier} cabin ${cabin.index}`).toBe(true);
        for (const bath of c.layout.bathrooms) expect(reach(map.toWorld(c.index, bath.restock)), `${c.layout.type}@${tier} washroom ${bath.index}`).toBe(true);
        if (!c.layout.venue) continue;
        for (const f of footprints(c.layout)) {
          if (f.replaces?.length) continue;
          expect(reach(map.toWorld(c.index, f)), `${c.layout.type}@${tier} ${f.id}`).toBe(true);
        }
        for (const seat of c.layout.venue.seats) expect(map.nav.findPath(map.doors()[0].insideNode, map.nodeId(c.index, seat.node)), `${c.layout.type}@${tier} seat ${seat.index}`).not.toBeNull();
      }
    }, 60_000);
  }
});

describe('every request can be fetched', () => {
  // Phase 4: the coast's lemonade and aloe were asked for but no counter handed them out, so they were never served.
  it('has a counter or cupboard for everything any class asks for on any route', async () => {
    const { ROUTES } = await import('../src/config/routes');
    const { CLASSES } = await import('../src/config/classes');
    const { FAMILY_REQUESTS, HONEYMOON_REQUESTS } = await import('../src/config/content');
    const { LINEN_ITEMS, SERVICE_ITEMS, sourceAnchorFor } = await import('../src/gameplay/Demand');
    const lists: Record<string, number | undefined>[] = [];
    for (const c of CLASSES) lists.push(c.evening, c.morning, c.extra ?? {});
    for (const r of ROUTES) for (const req of Object.values(r.requests ?? {})) if (req) lists.push(req.evening ?? {}, req.morning ?? {}, req.extra ?? {});
    for (const p of [FAMILY_REQUESTS, HONEYMOON_REQUESTS]) lists.push(p.evening, p.morning, p.extra);
    const dwell = new Set(['turndown', 'butler']);
    for (const list of lists) {
      for (const item of Object.keys(list)) {
        if (dwell.has(item)) continue;
        const anchor = sourceAnchorFor(item as never);
        if (anchor === 'urn') expect(SERVICE_ITEMS, item).toContain(item);
        else if (anchor === 'linen') expect(LINEN_ITEMS, item).toContain(item);
        else throw new Error(`${item} has no counter or cupboard (anchor ${anchor})`);
      }
    }
  });
});
