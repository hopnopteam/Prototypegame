import { ACTIVE_ROUTE } from '../config/routes';
import { LUSH, NEW_LOOK } from '../config/look';
import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { GeoBuilder, type PartStyle } from './geo';
import { PATTERN } from './materials';
import { packPattern } from './detail';
import { key, modelEntry, type Recolor } from './models/library';
import { groundColor, groundHeight, sceneryToWorldX, shoreX, TRACK_HALF, VERGE_Y, WATER_Y } from './terrain';

/**
 * What passes the window: the lakeside, built one 24 m stretch at a time from continuous functions (see
 * terrain.ts), so stretches join without a seam. Each stretch pairs a lake-side piece (reeds, a beach, a
 * jetty, a boathouse, lily pads, a promenade, a lighthouse islet, a fishing hut, an island) with a land-side
 * piece (forest, meadow, village, farm, orchard, a lane, a windmill, a chapel, a camp), drawn from shuffled
 * decks so nothing comes round again within a minute.
 *
 * Rules that keep it clean:
 * - Nothing enters the track bed (|x| < TRACK_HALF).
 * - Land side (between the camera and the train): nothing near the line is tall enough to hide the train;
 *   heights stay under (x − 2.9) / 0.45 m, so tall things (trees, houses) stand from x ≈ 7.5.
 * - Lake side: static things stay between the bank and x = −9.8; −10.5 to −13.8 is the boats' lane (Ambient);
 *   islands lie beyond −15. Every placed thing claims its footprint, and fill (trees, reeds, flowers)
 *   never lands on a claimed spot.
 */

export const CHUNK = 24;
/** The boats' lane on the lake (Ambient keeps its boats and swans in here). */
export const BOAT_LANE: [number, number] = [-11.0, -14.3];

export type ShoreKind = 'reeds' | 'beach' | 'jetty' | 'boathouse' | 'lilies' | 'promenade' | 'lighthouse' | 'fishing' | 'island' | 'cove' | 'headland' | 'marina';
export type LandKind = 'forest' | 'meadow' | 'village' | 'farm' | 'orchard' | 'lane' | 'windmill' | 'chapel' | 'camp' | 'wheat' | 'bridge' | 'villas' | 'lemons' | 'palms';
/** Every piece there is, whichever route deals it (the tests build them all). */
export const ALL_SHORE_KINDS: ShoreKind[] = ['reeds', 'beach', 'jetty', 'boathouse', 'lilies', 'promenade', 'lighthouse', 'fishing', 'island', 'cove', 'headland', 'marina'];
export const ALL_LAND_KINDS: LandKind[] = ['forest', 'meadow', 'village', 'farm', 'orchard', 'lane', 'windmill', 'chapel', 'camp', 'wheat', 'bridge', 'villas', 'lemons', 'palms'];
export type PieceKind = ShoreKind | LandKind;

export interface DeckEntry<K extends string> {
  kind: K;
  weight: number;
  /** Stretches before this kind may come again. */
  gap: number;
}

const BASE_SHORE_DECK: DeckEntry<ShoreKind>[] = [
  { kind: 'reeds', weight: 2.2, gap: 1 },
  { kind: 'beach', weight: 1.3, gap: 3 },
  { kind: 'lilies', weight: 1.2, gap: 3 },
  { kind: 'jetty', weight: 1.0, gap: 5 },
  { kind: 'promenade', weight: 0.9, gap: 6 },
  { kind: 'fishing', weight: 0.8, gap: 7 },
  { kind: 'boathouse', weight: 0.7, gap: 9 },
  { kind: 'island', weight: 0.7, gap: 8 },
  { kind: 'lighthouse', weight: 0.4, gap: 20 },
];

const BASE_LAND_DECK: DeckEntry<LandKind>[] = [
  { kind: 'forest', weight: 2.0, gap: 1 },
  { kind: 'meadow', weight: 1.4, gap: 2 },
  { kind: 'lane', weight: 1.1, gap: 3 },
  { kind: 'village', weight: 1.0, gap: 5 },
  { kind: 'orchard', weight: 0.8, gap: 6 },
  { kind: 'farm', weight: 0.8, gap: 7 },
  { kind: 'camp', weight: 0.5, gap: 10 },
  { kind: 'chapel', weight: 0.45, gap: 14 },
  { kind: 'windmill', weight: 0.45, gap: 14 },
  // Phase 1, the Countryside Express (the route's `scenery`): golden wheat and old stone bridges over a brook.
  ...(ACTIVE_ROUTE.scenery.wheat ? [{ kind: 'wheat' as const, weight: 1.1, gap: 3 }] : []),
  ...(ACTIVE_ROUTE.scenery.stoneBridges ? [{ kind: 'bridge' as const, weight: 0.6, gap: 9 }] : []),
];

/** Phase 4: how soon the coast's pieces may come round again. */
const NEW_PIECE_GAP: Partial<Record<PieceKind, number>> = { cove: 3, headland: 9, marina: 6, villas: 3, lemons: 4, palms: 2 };

/** A deck with the route's own weights laid over it (`scenery.shore`/`land`: 0 leaves a piece out, a new kind joins). */
function routeDeck<K extends PieceKind>(base: DeckEntry<K>[], weights: Partial<Record<string, number>> | undefined): DeckEntry<K>[] {
  if (!weights) return base;
  const deck = base.map((d) => ({ ...d, weight: weights[d.kind] ?? d.weight }));
  for (const [kind, weight] of Object.entries(weights)) {
    if (weight === undefined || deck.some((d) => d.kind === kind)) continue;
    deck.push({ kind: kind as K, weight, gap: NEW_PIECE_GAP[kind as PieceKind] ?? 4 });
  }
  return deck.filter((d) => d.weight > 0);
}

export const SHORE_DECK: DeckEntry<ShoreKind>[] = routeDeck(BASE_SHORE_DECK, ACTIVE_ROUTE.scenery.shore);
export const LAND_DECK: DeckEntry<LandKind>[] = routeDeck(BASE_LAND_DECK, ACTIVE_ROUTE.scenery.land);

/** Instanced fill: what each slot holds (positions in chunk-local z, world x). */
export type FillKind = 'pine' | 'spruce' | 'broadleaf' | 'bush' | 'reed' | 'rock' | 'lily' | 'flower' | 'sheep' | 'palm' | 'cypress' | 'lemon' | 'tuft';
export const FILL_KINDS: FillKind[] = ['pine', 'spruce', 'broadleaf', 'bush', 'reed', 'rock', 'lily', 'flower', 'sheep', 'palm', 'cypress', 'lemon', 'tuft'];
/** Slots per stretch for each fill kind (a kind with none in a stretch is not drawn). */
export const FILL_SLOTS: Record<FillKind, number> = { pine: 26, spruce: 14, broadleaf: 14, bush: 22, reed: 30, rock: 40, lily: 26, flower: NEW_LOOK ? 40 + LUSH.flowers : 40, sheep: 8, palm: 14, cypress: 30, lemon: 18, tuft: NEW_LOOK ? LUSH.tufts : 0 };
/** Phase 4: the coast's fill trees' heights at scale 1 (metres). */
export const COAST_FILL_HEIGHT = { palm: 3.6, cypress: 3.1, lemon: 1.8 };
/**
 * Phase 4: the route's own fill (`scenery.fill`): what a kind becomes on this route (the coast's pines are cypresses,
 * its reeds limestone, its lilies none at all on the sea).
 */
const FILL_SWAP: Partial<Record<string, string>> = ACTIVE_ROUTE.scenery.fill ?? {};

export interface FillSpot {
  kind: FillKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  /** Land-side fill hides under the station platform. */
  land: boolean;
}

export interface ChunkBuild {
  shore: ShoreKind;
  land: LandKind;
  terrain: THREE.BufferGeometry;
  /** Props on the lake side and on the land side (separately, so the land side can hide at stations). */
  lake: GeoBuilder;
  landProps: GeoBuilder;
  lakeGlow: GeoBuilder;
  landGlow: GeoBuilder;
  /** Soft pools of lamplight on the ground (additive decals), lake and land side. */
  pools: { x: number; z: number; r: number; land: boolean }[];
  fill: FillSpot[];
  /** A lighthouse lamp (chunk-local), for its sweeping beam. */
  beacon: THREE.Vector3 | null;
  /** A windmill's hub (chunk-local), for its turning sails. */
  windmill: THREE.Vector3 | null;
  /** Cottage chimney tops (chunk-local), for their wisps of smoke (session 18). */
  chimneys: THREE.Vector3[];
}

/** The night palette of the lakeside props (moonlit, so a little brighter than it reads). */
const C = {
  wood: '#8A6B52',
  woodDark: '#5E4838',
  woodLight: '#A88866',
  stone: '#A9A49A',
  stoneDark: '#8A857C',
  white: '#ECEEF0',
  red: '#C0505E',
  slate: '#5B6B80',
  roofRed: '#8E5E52',
  roofGreen: '#4E6E5C',
  wall: '#E0D4BC',
  wall2: '#D3C6AC',
  wall3: '#C9D3D6',
  glow: '#FFC982',
  boat: '#A86048',
  boatBlue: '#4E6A8E',
  hay: '#C2A466',
  // Phase 1: ripe wheat in three close golds over darker furrows, and a brook.
  wheat: '#D9B456',
  wheat2: '#E2C067',
  wheat3: '#CFA84A',
  wheatDark: '#A9873A',
  brook: '#3F5F6E',
  iron: '#353B48',
  canvas: '#D9CCB0',
  canvas2: '#B8C9B0',
  fire: '#FF9A4A',
};
const FLAT: PartStyle = { shade: 1 };

interface Claim {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

class Stretch {
  readonly lake = new GeoBuilder();
  readonly landProps = new GeoBuilder();
  readonly lakeGlow = new GeoBuilder();
  readonly landGlow = new GeoBuilder();
  readonly pools: ChunkBuild['pools'] = [];
  readonly fill: FillSpot[] = [];
  readonly claims: Claim[] = [];
  beacon: THREE.Vector3 | null = null;
  windmill: THREE.Vector3 | null = null;
  readonly chimneys: THREE.Vector3[] = [];

  constructor(readonly s0: number, readonly rng: Rng) {}

  /** The shoreline at chunk-local z. */
  shore(z: number): number {
    return shoreX(this.s0 + z);
  }

  ground(x: number, z: number): number {
    return groundHeight(x, this.s0 + z);
  }

  claim(x0: number, z0: number, x1: number, z1: number): void {
    this.claims.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  free(x: number, z: number, r: number): boolean {
    for (const c of this.claims) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return false;
    return true;
  }

  put(asked: FillKind, x: number, z: number, scale: number, land: boolean, y?: number, r = 0.3): boolean {
    const swap = FILL_SWAP[asked];
    if (swap === 'none') return false;
    const kind = (swap as FillKind | undefined) ?? asked;
    if (z < 0.4 || z > CHUNK - 0.4 || Math.abs(x) < TRACK_HALF + 0.15) return false;
    if (!this.free(x, z, r * scale)) return false;
    this.fill.push({ kind, x, y: y ?? this.ground(x, z), z, scale, rot: this.rng.range(0, Math.PI * 2), land });
    this.claim(x - r * scale * 0.7, z - r * scale * 0.7, x + r * scale * 0.7, z + r * scale * 0.7);
    return true;
  }

  /** Scatter `count` of a kind in a band, keeping clear of everything claimed. */
  scatter(kind: FillKind, count: number, x0: number, x1: number, scale: [number, number], land: boolean, r = 0.4, z0 = 0.5, z1 = CHUNK - 0.5): void {
    let placed = 0;
    for (let tries = 0; tries < count * 6 && placed < count; tries++) {
      const x = this.rng.range(x0, x1);
      const z = this.rng.range(z0, z1);
      if (this.put(kind, x, z, this.rng.range(scale[0], scale[1]), land, undefined, r)) placed++;
    }
  }
}

// ─── Props ───────────────────────────────────────────────────────────────

function lampPost(b: GeoBuilder, glow: GeoBuilder, st: Stretch, x: number, z: number, land: boolean): void {
  const y = st.ground(x, z);
  b.object('scenery:lamp');
  b.cylinder(x, y + 1.05, z, 0.045, 0.065, 2.1, C.iron, 8, 'y', { shade: 0.8, surface: 'iron' });
  b.box(x, y + 2.2, z, 0.22, 0.05, 0.22, C.iron, 0, { surface: 'iron' });
  b.endObject();
  glow.box(x, y + 2.05, z, 0.15, 0.22, 0.15, C.glow, 0, FLAT);
  st.pools.push({ x, z, r: 1.7, land });
  st.claim(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
}

function rowingBoat(b: GeoBuilder, x: number, y: number, z: number, ry: number, color = C.boat): void {
  b.object('scenery:boat');
  b.add(new THREE.CylinderGeometry(0.42, 0.34, 1.9, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1), color, x, y + 0.22, z, 0, ry, 0, { shade: 0.8, surface: 'wood' });
  b.box(x, y + 0.2, z, 0.72, 0.05, 0.18, C.woodLight, ry, FLAT);
  b.endObject();
}

function bench(b: GeoBuilder, x: number, y: number, z: number): void {
  b.object('scenery:bench');
  b.box(x, y + 0.42, z, 0.42, 0.05, 1.2, C.wood, 0, { shade: 0.9, surface: 'wood' });
  b.box(x - 0.2, y + 0.66, z, 0.05, 0.36, 1.2, C.wood, 0, { shade: 0.9, surface: 'wood' });
  for (const dz of [-0.5, 0.5]) b.box(x, y + 0.2, z + dz, 0.38, 0.4, 0.06, C.iron, 0, { surface: 'iron' });
  b.endObject();
}

function cottage(b: GeoBuilder, glow: GeoBuilder, st: Stretch, x: number, z: number, w: number, d: number): void {
  const rng = st.rng;
  const y = st.ground(x, z);
  const h = rng.range(1.7, 2.1);
  const wall = rng.pick([C.wall, C.wall2, C.wall3]);
  const roof = rng.pick([C.slate, C.roofRed, C.roofGreen]);
  b.object('scenery:cottage');
  b.rounded(x, y + h / 2, z, w, h, d, 0.06, wall, { shade: 0.8 });
  b.prism(x, y + h, z, w + 0.4, 1.25, d + 0.35, roof, { pattern: PATTERN.stripesZ, color2: '#46525F', scale: 0.25, shade: 1 });
  b.box(x + w * 0.25, y + h + 1.0, z - d * 0.2, 0.34, 0.9, 0.34, C.stoneDark, 0, { shade: 0.85 });
  st.chimneys.push(new THREE.Vector3(x + w * 0.25, y + h + 1.5, z - d * 0.2));
  b.box(x + w / 2 + 0.01, y + 0.55, z + d * 0.28, 0.04, 1.05, 0.6, C.woodDark, 0, FLAT);
  b.endObject();
  // Lit windows on the two sides the camera sees (+x, +z), with sills.
  for (const dz of [-d * 0.22, d * 0.12]) {
    glow.box(x + w / 2 + 0.012, y + h * 0.56, z + dz, 0.024, 0.42, 0.38, C.glow, 0, FLAT);
    b.box(x + w / 2 + 0.04, y + h * 0.56 - 0.24, z + dz, 0.08, 0.04, 0.46, C.white, 0, FLAT);
  }
  glow.box(x - w * 0.15, y + h * 0.56, z + d / 2 + 0.012, 0.38, 0.42, 0.024, C.glow, 0, FLAT);
  st.pools.push({ x: x + w / 2 + 0.6, z, r: 1.4, land: true });
  st.claim(x - w / 2 - 0.35, z - d / 2 - 0.35, x + w / 2 + 0.5, z + d / 2 + 0.35);
}

function fence(b: GeoBuilder, st: Stretch, x: number, z0: number, z1: number, land: boolean): void {
  b.object('scenery:fence');
  for (let z = z0; z <= z1 + 1e-3; z += 1.4) b.box(x, st.ground(x, z) + 0.3, z, 0.07, 0.6, 0.07, C.woodLight, 0, { shade: 0.85, surface: 'wood' });
  const y = st.ground(x, (z0 + z1) / 2);
  for (const h of [0.22, 0.46]) b.box(x, y + h, (z0 + z1) / 2, 0.035, 0.06, z1 - z0, C.woodLight, 0, { shade: 0.95, surface: 'wood' });
  b.endObject();
  st.claim(x - 0.15, z0, x + 0.15, z1);
  void land;
}

function hayBale(b: GeoBuilder, st: Stretch, x: number, z: number): void {
  const y = st.ground(x, z);
  b.object('scenery:hay');
  b.cylinder(x, y + 0.38, z, 0.42, 0.42, 0.62, C.hay, 12, 'x', { shade: 0.85, surface: 'fabric' });
  b.endObject();
  st.claim(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
}

/** Phase 4: a model fitted to a height, standing on y. */
function placeModel(b: GeoBuilder, id: Parameters<typeof modelEntry>[0], x: number, y: number, z: number, height: number, rotY = 0, style: PartStyle = { shade: 0.85 }, recolor: Recolor[] = []): void {
  const e = modelEntry(id);
  const sc = height / (e.max[1] - e.min[1]);
  b.model(id, x, y - e.min[1] * sc, z, rotY, sc, sc, sc, { ...style, recolor });
}

/** Phase 4: pastel walls for the coast's villas (their white walls recoloured through the linen band). */
const VILLA_WALLS = ['#F6EFE2', '#F3D9A4', '#F2C2A8', '#EBC7CF', '#E8D08E', '#F7F2EA'];
const VILLAS = ['villa_a', 'villa_b', 'villa_c', 'villa_d', 'villa_e', 'villa_cube'] as const;

/** A villa from Kenney's suburban kit, scaled to a footprint about `size` metres across, in a pastel. */
function villa(b: GeoBuilder, glow: GeoBuilder, st: Stretch, x: number, z: number, size: number): void {
  const rng = st.rng;
  const id = rng.pick([...VILLAS]);
  const e = modelEntry(id);
  const sc = size / Math.max(e.max[0] - e.min[0], e.max[2] - e.min[2]);
  const y = st.ground(x, z);
  b.object('scenery:villa');
  b.model(id, x, y - e.min[1] * sc, z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), sc, sc, sc, { shade: 0.85, surface: 'paint', recolor: [key('linen', rng.pick(VILLA_WALLS))] });
  b.endObject();
  const h = (e.max[1] - e.min[1]) * sc;
  const half = ((e.max[0] - e.min[0]) * sc) / 2;
  glow.box(x + half + 0.02, y + h * 0.35, z + rng.range(-0.3, 0.3), 0.024, 0.32, 0.3, C.glow, 0, FLAT);
  st.pools.push({ x: x + half + 0.7, z, r: 1.3, land: true });
  st.claim(x - size / 2 - 0.4, z - size / 2 - 0.4, x + size / 2 + 0.4, z + size / 2 + 0.4);
}

/** A terracotta pot with a lemon bush or a flowering shrub. */
function terracottaPot(b: GeoBuilder, st: Stretch, x: number, z: number, land: boolean): void {
  const y = st.ground(x, z);
  b.object('scenery:pot');
  placeModel(b, 'pot_terracotta', x, y, z, 0.42, 0, { shade: 0.85, surface: 'matte' });
  b.sphere(x, y + 0.55, z, 0.28, '#5E8A4A', 0, 0.85, { shade: 0.8, surface: 'foliage' });
  for (let k = 0; k < 4; k++) b.sphere(x + Math.cos(k * 1.7) * 0.18, y + 0.6 + (k % 2) * 0.08, z + Math.sin(k * 1.7) * 0.18, 0.045, k % 2 ? '#E8C53A' : '#D9408A', 0, 1, FLAT);
  b.endObject();
  st.claim(x - 0.32, z - 0.32, x + 0.32, z + 0.32);
  void land;
}

// ─── Lake-side pieces ──────────────────────────────────────────────────────

function waterline(st: Stretch, every: number, rockChance: number, z0 = 0.6, z1 = CHUNK - 0.6): void {
  for (let z = z0; z < z1; z += every * st.rng.range(0.7, 1.3)) {
    const x = st.shore(z) + st.rng.range(-0.25, 0.35);
    if (st.rng.chance(rockChance)) st.put('rock', x, z, st.rng.range(0.5, 1.1), false, st.ground(x, z) - 0.05, 0.35);
    else st.put('reed', x, z, st.rng.range(0.8, 1.25), false, WATER_Y - 0.05, 0.3);
  }
}

function lilyField(st: Stretch, z0: number, z1: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const z = st.rng.range(z0, z1);
    const x = st.shore(z) - st.rng.range(0.6, 3.8);
    if (x < -9.6) continue;
    st.put('lily', x, z, st.rng.range(0.7, 1.3), false, WATER_Y + 0.012, 0.18);
  }
}

function buildShore(st: Stretch, kind: ShoreKind): void {
  const b = st.lake;
  const glow = st.lakeGlow;
  const rng = st.rng;
  /** A spot on the verge: on the bank above the water, never nearer the ballast than 0.6 m. */
  const vergeX = (z: number, back = 0.8): number => Math.max(st.shore(z) + 0.3, Math.min(st.shore(z) + back, -TRACK_HALF - 0.6));
  switch (kind) {
    case 'reeds': {
      waterline(st, 0.9, 0.18);
      lilyField(st, 2, CHUNK - 2, 6);
      st.scatter('flower', 8, -TRACK_HALF - 1.2, -TRACK_HALF - 0.3, [0.8, 1.2], false, 0.15);
      break;
    }
    case 'beach': {
      // Boats pulled up on the sand, lying along the shore (never reaching the ballast).
      const z = rng.range(7, 16);
      const x = Math.min(st.shore(z) + 0.45, -4.05);
      rowingBoat(b, x, st.ground(x, z), z, rng.range(-0.15, 0.15), rng.chance(0.5) ? C.boat : C.boatBlue);
      st.claim(x - 0.6, z - 1.1, x + 0.6, z + 1.1);
      if (rng.chance(0.6)) {
        const z2 = z + rng.pick([-3.2, 3.4]);
        const x2 = Math.min(st.shore(z2) + 0.45, -4.05);
        rowingBoat(b, x2, st.ground(x2, z2), z2, rng.range(-0.15, 0.15), C.boatBlue);
        st.claim(x2 - 0.6, z2 - 1.1, x2 + 0.6, z2 + 1.1);
      }
      lampPost(b, glow, st, vergeX(z + 2.2), z + 2.2, false);
      waterline(st, 2.6, 0.55, 0.6, z - 2);
      waterline(st, 2.6, 0.55, z + 3, CHUNK - 0.6);
      break;
    }
    case 'jetty': {
      const z = rng.range(8, 15);
      const x0 = st.shore(z) + 0.6;
      const x1 = Math.max(-10.3, st.shore(z) - 3.0);
      const w = 1.1;
      b.object('scenery:jetty');
      b.box((x0 + x1) / 2, WATER_Y + 0.32, z, x0 - x1, 0.06, w, C.wood, 0, { pattern: PATTERN.stripesX, color2: C.woodDark, scale: 0.22, shade: 1, surface: 'wood' });
      for (let x = x1 + 0.15; x < x0; x += 1.0) for (const dz of [-w / 2 + 0.06, w / 2 - 0.06]) b.cylinder(x, WATER_Y + 0.05, z + dz, 0.05, 0.05, 0.6, C.woodDark, 6, 'y', { surface: 'wood' });
      b.endObject();
      st.claim(x1 - 0.2, z - w / 2 - 0.1, x0, z + w / 2 + 0.1);
      lampPost(b, glow, st, x1 + 0.25, z + w / 2 - 0.12, false);
      rowingBoat(b, x1 + 0.9, WATER_Y - 0.12, z - 1.0, Math.PI / 2 + 0.1, C.boatBlue);
      st.claim(x1, z - 1.6, x1 + 1.9, z - 0.5);
      waterline(st, 1.3, 0.25, 0.6, z - 2.2);
      waterline(st, 1.3, 0.25, z + 1.6, CHUNK - 0.6);
      break;
    }
    case 'boathouse': {
      const z = rng.range(8, 14);
      const xs = st.shore(z);
      const x = xs - 0.6;
      const y = WATER_Y;
      b.object('scenery:boathouse');
      for (const dx of [-1.3, 1.3]) for (const dz of [-1.5, 1.5]) b.cylinder(x + dx, y + 0.1, z + dz, 0.07, 0.07, 0.8, C.woodDark, 6, 'y', { surface: 'wood' });
      b.box(x, y + 0.5, z, 2.8, 0.08, 3.2, C.wood, 0, { surface: 'wood' });
      b.box(x + 1.38, y + 1.25, z, 0.08, 1.4, 3.2, C.wall2, 0, { shade: 0.85 });
      b.box(x, y + 1.25, z - 1.58, 2.8, 1.4, 0.08, C.wall2, 0, { shade: 0.85 });
      b.box(x, y + 1.25, z + 1.58, 2.8, 1.4, 0.08, C.wall2, 0, { shade: 0.85 });
      b.prism(x, y + 1.95, z, 3.2, 1.0, 3.5, C.roofGreen, { pattern: PATTERN.stripesZ, color2: '#3E5A4C', scale: 0.22, shade: 1 });
      b.endObject();
      glow.box(x + 1.43, y + 1.3, z - 0.6, 0.02, 0.4, 0.5, C.glow, 0, FLAT);
      glow.box(x + 1.43, y + 1.3, z + 0.6, 0.02, 0.4, 0.5, C.glow, 0, FLAT);
      rowingBoat(b, x - 0.5, WATER_Y - 0.12, z, Math.PI / 2, C.boat);
      st.pools.push({ x: x + 2.0, z, r: 1.5, land: false });
      st.claim(x - 1.7, z - 1.9, x + 1.6, z + 1.9);
      waterline(st, 1.2, 0.3, 0.6, z - 2.6);
      waterline(st, 1.2, 0.3, z + 2.6, CHUNK - 0.6);
      break;
    }
    case 'lilies': {
      lilyField(st, 1, CHUNK - 1, 24);
      waterline(st, 1.6, 0.2);
      break;
    }
    case 'promenade': {
      // Benches and lamps along the verge, flower beds between.
      for (let z = 3; z < CHUNK - 2; z += 6) {
        const x = vergeX(z, 0.9);
        bench(b, x, st.ground(x, z), z);
        st.claim(x - 0.3, z - 0.7, x + 0.3, z + 0.7);
        lampPost(b, glow, st, vergeX(z + 2.7), z + 2.7, false);
      }
      st.scatter('flower', 16, -TRACK_HALF - 1.4, -TRACK_HALF - 0.25, [0.9, 1.3], false, 0.14);
      waterline(st, 2.0, 0.6);
      break;
    }
    case 'lighthouse': {
      const z = rng.range(9, 15);
      // Kept short of the boats' lane (BOAT_LANE).
      const x = Math.max(st.shore(z) - 3.0, -8.8);
      // A rocky islet with a little lighthouse, banded white and red, its lamp lit.
      for (let k = 0; k < 7; k++) st.put('rock', x + rng.range(-1.1, 1.1), z + rng.range(-1.1, 1.1), rng.range(1.0, 1.7), false, WATER_Y - 0.2, 0.5);
      b.object('scenery:lighthouse');
      b.cylinder(x, WATER_Y + 0.35, z, 1.1, 1.3, 0.7, C.stoneDark, 12, 'y', { shade: 0.8, surface: 'stone' });
      for (let i = 0; i < 4; i++) b.cylinder(x, WATER_Y + 1.0 + i * 0.75 + 0.375, z, 0.52 - i * 0.05, 0.56 - i * 0.05, 0.75, i % 2 === 0 ? C.white : C.red, 12, 'y', { shade: 0.9 });
      b.cylinder(x, WATER_Y + 4.25, z, 0.42, 0.42, 0.08, C.iron, 12, 'y', { surface: 'iron' });
      b.add(new THREE.ConeGeometry(0.42, 0.45, 12), C.red, x, WATER_Y + 4.95, z, 0, 0, 0, FLAT);
      b.endObject();
      glow.cylinder(x, WATER_Y + 4.5, z, 0.3, 0.3, 0.45, C.glow, 10, 'y', FLAT);
      st.beacon = new THREE.Vector3(x, WATER_Y + 4.5, z);
      st.claim(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
      waterline(st, 1.4, 0.4);
      break;
    }
    case 'fishing': {
      // Where the bank is widest, so the hut stands fully on it.
      let z = 8;
      for (let t = 4; t <= CHUNK - 4; t += 1) if (st.shore(t) < st.shore(z)) z = t;
      const xs = st.shore(z);
      const x = Math.min(xs + 1.0, -TRACK_HALF - 0.9);
      const hutFits = x - 0.8 >= xs + 0.15;
      if (hutFits) {
        const y = st.ground(x, z);
        b.object('scenery:hut');
        b.rounded(x, y + 0.75, z, 1.3, 1.5, 1.7, 0.04, C.woodLight, { shade: 0.8, surface: 'wood' });
        b.prism(x, y + 1.5, z, 1.6, 0.7, 2.0, C.slate, { shade: 1 });
        b.endObject();
        glow.box(x + 0.66, y + 0.85, z + 0.3, 0.02, 0.35, 0.34, C.glow, 0, FLAT);
        st.claim(x - 0.8, z - 1.0, x + 0.8, z + 1.0);
      }
      // A short dock with a lantern.
      b.object('scenery:dock');
      b.box(xs - 0.6, WATER_Y + 0.3, z - 1.6, 2.2, 0.06, 0.8, C.wood, 0, { surface: 'wood' });
      for (const dx of [-1.5, 0.3]) b.cylinder(xs + dx, WATER_Y + 0.05, z - 1.6, 0.05, 0.05, 0.55, C.woodDark, 6, 'y', { surface: 'wood' });
      b.endObject();
      glow.sphere(xs - 1.55, WATER_Y + 0.62, z - 1.6, 0.09, C.glow, 1, 1, FLAT);
      st.pools.push({ x: xs - 1.2, z: z - 1.6, r: 1.2, land: false });
      st.claim(xs - 1.8, z - 2.1, xs + 0.6, z - 1.1);
      waterline(st, 1.3, 0.3);
      break;
    }
    case 'cove': {
      // A little cove: sand to the water, palms leaning out over it, parasols with towels, a sandcastle and a ball.
      for (let z = 2.5; z < CHUNK - 2; z += rng.range(5.5, 8)) {
        const x = Math.min(st.shore(z) + 0.45, -TRACK_HALF - 1.6);
        if (x - 0.3 < st.shore(z)) continue;
        b.object('scenery:palm');
        placeModel(b, rng.chance(0.5) ? 'palm_bend' : 'palm_lush', x, st.ground(x, z), z, rng.range(3.3, 3.9), rng.range(-0.15, 0.15), { shade: 0.78, surface: 'foliage' });
        b.endObject();
        st.claim(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
      }
      const umbrellas = ['umbrella_pink', 'umbrella_yellow', 'umbrella_green'] as const;
      for (let i = 0; i < 3; i++) {
        const z = 3 + i * 7 + rng.range(0, 2.5);
        const x = Math.min(vergeX(z, 1.1), -TRACK_HALF - 0.95);
        if (x - 0.6 < st.shore(z) || !st.free(x, z, 0.7)) continue;
        const y = st.ground(x, z);
        b.object('scenery:parasol');
        placeModel(b, umbrellas[i % 3], x, y, z, 1.6, 0, { shade: 0.9, surface: 'fabric' });
        b.box(x - 0.15, y + 0.02, z + 0.55, 0.55, 0.02, 1.0, rng.pick(['#3E8FC2', '#F2B134', '#E0559A', '#F2F0EA']), 0, { pattern: PATTERN.stripesX, color2: '#FFFFFF', scale: 0.12, shade: 1, surface: 'fabric' });
        b.endObject();
        st.claim(x - 0.6, z - 0.6, x + 0.4, z + 1.1);
      }
      {
        const z = rng.range(9, 15);
        const x = vergeX(z, 0.7);
        if (st.free(x, z, 0.35) && x - 0.2 > st.shore(z)) {
          const y = st.ground(x, z);
          b.object('scenery:sandcastle');
          placeModel(b, 'sandcastle', x, y, z, 0.32, 0, { shade: 0.9, surface: 'matte' });
          b.endObject();
          b.object('scenery:beachball');
          placeModel(b, 'beach_ball', x + 0.1, y, z + 0.75, 0.3, 0.5, { shade: 0.95, surface: 'paint' });
          b.endObject();
          st.claim(x - 0.3, z - 0.3, x + 0.3, z + 1.0);
        }
      }
      waterline(st, 2.2, 0.8);
      break;
    }
    case 'headland': {
      // A rocky headland: the lighthouse on its rock, sea stacks standing off it, limestone along the water.
      const z = rng.range(9, 15);
      const x = Math.max(st.shore(z) - 3.0, -8.6);
      for (let k = 0; k < 7; k++) st.put('rock', x + rng.range(-1.1, 1.1), z + rng.range(-1.1, 1.1), rng.range(1.2, 1.9), false, WATER_Y - 0.2, 0.5);
      b.object('scenery:lighthouse');
      b.cylinder(x, WATER_Y + 0.35, z, 1.1, 1.3, 0.7, '#C9BFA8', 12, 'y', { shade: 0.8, surface: 'stone' });
      const lh = 5.4;
      placeModel(b, 'lighthouse', x, WATER_Y + 0.7, z, lh, 0, { shade: 0.9, surface: 'paint' });
      b.endObject();
      glow.cylinder(x, WATER_Y + 0.7 + lh * 0.86, z, 0.22, 0.22, 0.32, C.glow, 10, 'y', FLAT);
      st.beacon = new THREE.Vector3(x, WATER_Y + 0.7 + lh * 0.86, z);
      st.claim(x - 1.6, z - 1.6, x + 1.6, z + 1.6);
      for (const dz of [-6.5, 6.8]) {
        const sz = z + dz;
        if (sz < 1.5 || sz > CHUNK - 1.5) continue;
        const sx = Math.max(st.shore(sz) - rng.range(2.4, 3.6), -9.2);
        b.object('scenery:seastack');
        placeModel(b, 'sea_stack', sx, WATER_Y - 0.4, sz, rng.range(2.2, 3.2), rng.range(0, 3), { shade: 0.85, surface: 'stone' });
        b.endObject();
        st.claim(sx - 0.8, sz - 0.8, sx + 0.8, sz + 0.8);
      }
      waterline(st, 1.0, 1);
      break;
    }
    case 'marina': {
      // A little marina: a stone quay along the bank, boats moored off it, lamps and bollards.
      b.object('scenery:quay');
      for (let z = 1; z < CHUNK - 1; z += 2) {
        const x = st.shore(z + 1) + 0.25;
        b.box(x, WATER_Y + 0.22, z + 1, 0.8, 0.44, 2.02, '#CFC3A8', 0, { pattern: PATTERN.dots, color2: '#B8AC92', scale: 0.2, shade: 0.85, surface: 'stone' });
      }
      b.endObject();
      for (let z = 1; z < CHUNK - 1; z += 2) st.claim(st.shore(z + 1) - 0.2, z, st.shore(z + 1) + 0.7, z + 2);
      const boats = ['fishing_boat', 'yacht', 'sailboat_b'] as const;
      for (let z = 3.5, i = 0; z < CHUNK - 3; z += rng.range(5.5, 7), i++) {
        const x = Math.max(st.shore(z) - 1.4, -8.8);
        const id = boats[(i + rng.int(0, 2)) % boats.length];
        const e = modelEntry(id);
        const sc = 2.6 / Math.max(e.max[2] - e.min[2], e.max[0] - e.min[0]);
        b.object('scenery:mooredBoat');
        b.model(id, x, WATER_Y - 0.08 - e.min[1] * sc, z, rng.range(-0.08, 0.08), sc, sc, sc, { shade: 0.85, surface: 'paint' });
        b.endObject();
        st.claim(x - 0.8, z - 1.4, x + 0.8, z + 1.4);
        // A bollard on the quay with its rope.
        b.object('scenery:bollard');
        b.cylinder(st.shore(z) + 0.15, WATER_Y + 0.55, z, 0.07, 0.08, 0.2, C.iron, 8, 'y', { surface: 'iron' });
        b.endObject();
      }
      for (let z = 6; z < CHUNK - 2; z += 9) lampPost(b, glow, st, vergeX(z, 1.0), z, false);
      break;
    }
    case 'island': {
      const z = rng.range(8, 16);
      const x = -17.5 - rng.range(0, 1.5);
      // A wooded island out on the lake, with a cottage window lit.
      b.object('scenery:island');
      b.add(new THREE.SphereGeometry(3.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.18, 0.75), '#4C6B54', x, WATER_Y - 0.1, z, 0, 0, 0, { shade: 0.85, surface: 'foliage' });
      b.add(new THREE.SphereGeometry(3.15, 16, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.06, 0.78), '#A39A86', x, WATER_Y - 0.05, z, 0, 0, 0, FLAT);
      b.endObject();
      for (let k = 0; k < 6; k++) st.put(rng.chance(0.6) ? 'pine' : 'spruce', x + rng.range(-2.0, 1.0), z + rng.range(-1.6, 1.6), rng.range(0.8, 1.2), false, WATER_Y + 0.35, 0.5);
      waterline(st, 1.1, 0.25);
      lilyField(st, 2, CHUNK - 2, 5);
      break;
    }
  }
}

// ─── Land-side pieces ──────────────────────────────────────────────────────

/** Fill trees far enough out that they never hide the train. */
function woods(st: Stretch, x0: number, count: number, kinds: FillKind[], scale: [number, number] = [0.8, 1.25]): void {
  for (let i = 0; i < count; i++) {
    const kind = st.rng.pick(kinds);
    st.scatter(kind, 1, x0, x0 + 9, scale, true, 0.75);
  }
}

function buildLand(st: Stretch, kind: LandKind): void {
  const b = st.landProps;
  const glow = st.landGlow;
  const rng = st.rng;
  switch (kind) {
    case 'forest': {
      st.scatter('bush', 10, 3.6, 6.2, [0.7, 1.1], true, 0.5);
      woods(st, 7, 22, ['pine', 'pine', 'spruce', 'broadleaf']);
      st.scatter('flower', 6, 3.0, 5.0, [0.8, 1.2], true, 0.14);
      break;
    }
    case 'meadow': {
      fence(b, st, 4.3, 1, CHUNK - 1, true);
      for (let i = 0; i < 4; i++) {
        const z = rng.range(2, CHUNK - 2);
        const x = rng.range(5.6, 9.5);
        if (st.free(x, z, 0.7)) hayBale(b, st, x, z);
      }
      // A few sheep grazing inside the fence (session 18: a lived-in countryside).
      st.scatter('sheep', rng.int(3, 5), 5.4, 10.5, [0.9, 1.1], true, 0.55);
      st.scatter('flower', 26, 4.7, 10, [0.8, 1.3], true, 0.14);
      st.scatter('flower', 8, 2.9, 4.0, [0.8, 1.1], true, 0.14);
      woods(st, 10, 8, ['broadleaf', 'pine']);
      break;
    }
    case 'village': {
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const z = 3.5 + (i + rng.range(0.1, 0.6)) * ((CHUNK - 6) / count);
        cottage(b, glow, st, rng.range(8.2, 9.4), z, rng.range(2.0, 2.6), rng.range(2.4, 3.0));
      }
      for (let z = 4; z < CHUNK - 2; z += 8) lampPost(b, glow, st, 4.4, z, true);
      // A low stone wall by the lane.
      b.object('scenery:wall');
      b.box(6.9, st.ground(6.9, CHUNK / 2) + 0.25, CHUNK / 2, 0.35, 0.5, CHUNK - 2.5, C.stone, 0, { pattern: PATTERN.dots, color2: C.stoneDark, scale: 0.18, shade: 0.85, surface: 'stone' });
      b.endObject();
      st.claim(6.6, 1.2, 7.2, CHUNK - 1.2);
      st.scatter('bush', 6, 3.4, 4.0, [0.6, 0.85], true, 0.4);
      woods(st, 11, 6, ['broadleaf', 'pine']);
      break;
    }
    case 'farm': {
      const z = rng.range(8, 16);
      const x = 11;
      const y = st.ground(x, z);
      b.object('scenery:barn');
      b.rounded(x, y + 1.3, z, 3.2, 2.6, 4.2, 0.05, '#A24C46', { shade: 0.8 });
      b.prism(x, y + 2.6, z, 3.6, 1.5, 4.5, '#5B5F66', { shade: 1 });
      b.box(x - 1.62, y + 1.0, z, 0.04, 1.9, 1.8, C.white, 0, FLAT);
      b.endObject();
      glow.box(x - 1.65, y + 2.0, z + 1.2, 0.02, 0.35, 0.35, C.glow, 0, FLAT);
      st.claim(x - 1.9, z - 2.4, x + 1.9, z + 2.4);
      fence(b, st, 6.6, 1, CHUNK - 1, true);
      // A scarecrow in the field.
      const sz = z < 12 ? z + 6 : z - 6;
      b.object('scenery:scarecrow');
      b.cylinder(8.2, st.ground(8.2, sz) + 0.8, sz, 0.04, 0.04, 1.6, C.woodDark, 6, 'y', { surface: 'wood' });
      b.box(8.2, st.ground(8.2, sz) + 1.25, sz, 0.08, 0.06, 1.0, C.woodDark, 0, FLAT);
      b.box(8.2, st.ground(8.2, sz) + 1.15, sz, 0.3, 0.42, 0.34, '#7E8C5A', 0, { surface: 'fabric' });
      b.add(new THREE.ConeGeometry(0.28, 0.24, 10), C.hay, 8.2, st.ground(8.2, sz) + 1.62, sz, 0, 0, 0, FLAT);
      b.endObject();
      st.claim(7.9, sz - 0.6, 8.5, sz + 0.6);
      st.scatter('sheep', rng.int(2, 4), 7.2, 9.6, [0.9, 1.1], true, 0.55);
      st.scatter('bush', 6, 3.5, 5.6, [0.6, 0.9], true, 0.45);
      break;
    }
    case 'orchard': {
      for (let z = 2; z < CHUNK - 1; z += 3.1) for (const x of [7.4, 9.8, 12.2]) st.put('broadleaf', x + rng.range(-0.25, 0.25), z + rng.range(-0.3, 0.3), rng.range(0.62, 0.78), true, undefined, 0.75);
      fence(b, st, 6.0, 1, CHUNK - 1, true);
      st.scatter('flower', 14, 3.0, 5.6, [0.8, 1.2], true, 0.14);
      break;
    }
    case 'lane': {
      for (let z = 3; z < CHUNK - 2; z += 7) lampPost(b, glow, st, 4.0, z, true);
      st.scatter('bush', 12, 6.8, 7.6, [0.8, 1.1], true, 0.55);
      cottage(b, glow, st, rng.range(10.5, 11.5), rng.range(7, 16), 2.2, 2.6);
      woods(st, 12, 6, ['pine', 'broadleaf']);
      break;
    }
    case 'windmill': {
      const z = rng.range(9, 15);
      const x = 11.5;
      const y = st.ground(x, z);
      b.object('scenery:windmill');
      b.cylinder(x, y + 2.0, z, 0.95, 1.35, 4.0, C.wall, 12, 'y', { shade: 0.75 });
      b.add(new THREE.ConeGeometry(1.15, 1.2, 12), C.roofRed, x, y + 4.6, z, 0, 0, 0, FLAT);
      b.box(x + 1.33, y + 0.6, z, 0.04, 1.2, 0.7, C.woodDark, 0, FLAT);
      b.endObject();
      glow.box(x + 1.2, y + 2.6, z + 0.25, 0.02, 0.35, 0.3, C.glow, 0, FLAT);
      st.windmill = new THREE.Vector3(x + 1.25, y + 4.2, z);
      st.claim(x - 1.6, z - 1.6, x + 3.4, z + 1.6);
      fence(b, st, 4.3, 1, CHUNK - 1, true);
      st.scatter('flower', 20, 4.8, 9.0, [0.8, 1.2], true, 0.14);
      break;
    }
    case 'chapel': {
      const z = rng.range(9, 15);
      const x = 10.5;
      const y = st.ground(x, z);
      b.object('scenery:chapel');
      b.rounded(x, y + 1.25, z, 2.6, 2.5, 4.4, 0.05, C.wall3, { shade: 0.8 });
      b.prism(x, y + 2.5, z, 3.0, 1.5, 4.7, C.slate, { shade: 1 });
      b.box(x, y + 3.0, z - 2.6, 1.0, 3.6, 1.0, C.wall3, 0, { shade: 0.8 });
      b.add(new THREE.ConeGeometry(0.75, 1.6, 4).rotateY(Math.PI / 4), C.slate, x, y + 5.6, z - 2.6, 0, 0, 0, FLAT);
      b.endObject();
      for (const dz of [-1.0, 0.3, 1.6]) glow.box(x + 1.32, y + 1.35, z + dz, 0.02, 0.7, 0.32, '#FFD9A0', 0, FLAT);
      st.claim(x - 1.6, z - 3.3, x + 1.6, z + 2.6);
      lampPost(b, glow, st, 4.4, z, true);
      st.scatter('bush', 8, 3.5, 6.0, [0.6, 0.9], true, 0.45);
      woods(st, 13, 6, ['spruce', 'pine']);
      break;
    }
    case 'wheat': {
      // A field of ripe wheat behind a hedge-and-fence, in strips that follow the ground, with stooks of cut sheaves
      // along its near edge and a lone oak at its far corner.
      fence(b, st, 4.3, 1, CHUNK - 1, true);
      b.object('scenery:wheat');
      for (let z = 1.6; z < CHUNK - 1.4; z += 1.9) {
        for (let x = 5.2; x < 12.4; x += 1.8) {
          const y = st.ground(x + 0.9, z + 0.95);
          const tone = (Math.round(x * 3 + z * 7) % 3) / 3;
          b.box(x + 0.9, y + 0.2, z + 0.95, 1.76, 0.4, 1.86, tone < 0.34 ? C.wheat : tone < 0.67 ? C.wheat2 : C.wheat3, 0, { pattern: PATTERN.stripesZ, color2: C.wheatDark, scale: 0.16, shade: 0.9 });
        }
      }
      b.endObject();
      st.claim(5.0, 1.4, 12.6, CHUNK - 1.2);
      for (let z = 3; z < CHUNK - 2; z += rng.range(3.5, 5)) {
        const x = rng.range(4.6, 4.9);
        b.object('scenery:stook');
        b.add(new THREE.ConeGeometry(0.28, 0.75, 7), C.hay, x, st.ground(x, z) + 0.37, z, 0, rng.range(0, 3), 0, FLAT);
        b.endObject();
      }
      st.scatter('flower', 10, 3.0, 4.1, [0.8, 1.2], true, 0.14);
      st.put('broadleaf', 13.6, CHUNK - 3, 0.85, true, undefined, 0.8);
      break;
    }
    case 'bridge': {
      // A brook runs down from the hills to the lake (passing under the line), crossed by an old stone humpback bridge
      // carrying a farm track, reeds along its banks.
      const z = rng.range(9, 15);
      const brook = 1.6;
      b.object('scenery:brook');
      for (let x = 3.6; x < 14; x += 1.2) b.box(x + 0.6, st.ground(x + 0.6, z) + 0.02, z, 1.22, 0.04, brook, C.brook, 0, { shade: 1, surface: 'glass' });
      b.endObject();
      const bx = 8.6;
      const by = st.ground(bx, z);
      b.object('scenery:stoneBridge');
      // The arch's deck rises over the brook in three steps, a parapet either side, the arch's dark opening below.
      for (const [dz, rise, len] of [[-1.7, 0.35, 1.2], [0, 0.62, 2.2], [1.7, 0.35, 1.2]] as [number, number, number][]) {
        b.box(bx, by + rise / 2 + 0.05, z + dz, 1.9, rise, len, C.stone, 0, { pattern: PATTERN.dots, color2: C.stoneDark, scale: 0.18, shade: 0.85, surface: 'stone' });
        for (const px of [-0.92, 0.92]) b.box(bx + px, by + rise + 0.22, z + dz, 0.16, 0.34, len, C.stoneDark, 0, { shade: 0.85, surface: 'stone' });
      }
      b.box(bx + 0.96, by + 0.2, z, 0.04, 0.32, 1.2, '#2E3A3C', 0, FLAT);
      b.endObject();
      st.claim(3.6, z - brook / 2 - 0.2, 14, z + brook / 2 + 0.2);
      st.claim(bx - 1.1, z - 2.4, bx + 1.1, z + 2.4);
      st.scatter('reed', 10, 4.0, 13.5, [0.7, 1.0], true, 0.3);
      st.scatter('bush', 8, 3.5, 6.0, [0.6, 0.9], true, 0.45);
      woods(st, 11, 8, ['broadleaf', 'pine']);
      break;
    }
    case 'villas': {
      // Pastel villas up the hillside, a lane in front with lamps, cypresses and pots between.
      for (let z = 4; z < CHUNK - 2; z += 8) lampPost(b, glow, st, 4.4, z, true);
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const z = 3.8 + (i + rng.range(0.1, 0.5)) * ((CHUNK - 7) / count);
        villa(b, glow, st, rng.range(9.6, 11.2), z, rng.range(3.0, 3.8));
      }
      if (rng.chance(0.7)) villa(b, glow, st, rng.range(15, 16.5), rng.range(6, 18), 3.4);
      for (let k = 0; k < 3; k++) {
        const z = rng.range(2, CHUNK - 2);
        if (st.free(7.2, z, 0.4)) terracottaPot(b, st, 7.2, z, true);
      }
      st.scatter('cypress', 6, 8.2, 13.5, [0.85, 1.15], true, 0.45);
      st.scatter('flower', 12, 3.0, 4.2, [0.8, 1.2], true, 0.14);
      break;
    }
    case 'lemons': {
      // A lemon grove in rows behind a dry-stone wall, pots of geraniums by the gate.
      b.object('scenery:wall');
      b.box(6.4, st.ground(6.4, CHUNK / 2) + 0.24, CHUNK / 2, 0.38, 0.48, CHUNK - 2.5, '#CDBFA2', 0, { pattern: PATTERN.dots, color2: '#B3A486', scale: 0.18, shade: 0.85, surface: 'stone' });
      b.endObject();
      st.claim(6.1, 1.2, 6.7, CHUNK - 1.2);
      for (let z = 2; z < CHUNK - 1; z += 3.0) for (const x of [8.0, 10.6, 13.2]) st.put('lemon', x + rng.range(-0.2, 0.2), z + rng.range(-0.3, 0.3), rng.range(0.85, 1.05), true, undefined, 0.85);
      terracottaPot(b, st, 5.6, rng.range(3, 6), true);
      st.scatter('flower', 10, 3.0, 5.4, [0.8, 1.2], true, 0.14);
      woods(st, 15, 4, ['cypress']);
      break;
    }
    case 'palms': {
      // A palm-lined coast road: the lane, lamps, a row of palms, a villa behind and cypresses beyond.
      for (let z = 3; z < CHUNK - 2; z += 7) lampPost(b, glow, st, 4.2, z, true);
      for (let z = 2.5; z < CHUNK - 1.5; z += 4.2) st.put('palm', 7.6 + rng.range(-0.15, 0.15), z, rng.range(0.9, 1.08), true, undefined, 0.6);
      villa(b, glow, st, rng.range(11.5, 12.5), rng.range(7, 16), 3.4);
      st.scatter('bush', 8, 8.8, 10.0, [0.7, 1.0], true, 0.45);
      woods(st, 13, 5, ['cypress', 'broadleaf']);
      break;
    }
    case 'camp': {
      const z = rng.range(8, 15);
      for (const [dx, dz, c] of [[6.8, -1.6, C.canvas], [8.2, 1.4, C.canvas2]] as const) {
        const x = dx;
        const y = st.ground(x, z + dz);
        b.object('scenery:tent');
        b.prism(x, y, z + dz, 1.6, 1.15, 1.9, c, { shade: 0.85, surface: 'fabric' });
        b.endObject();
        st.claim(x - 0.9, z + dz - 1.1, x + 0.9, z + dz + 1.1);
      }
      // The campfire: a ring of stones, glowing embers, a soft pool of firelight.
      const fx = 5.4;
      const fz = z;
      const fy = st.ground(fx, fz);
      b.object('scenery:campfire');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add(new THREE.DodecahedronGeometry(0.09, 0), C.stoneDark, fx + Math.cos(a) * 0.32, fy + 0.05, fz + Math.sin(a) * 0.32, 0, a, 0, FLAT);
      }
      b.endObject();
      glow.add(new THREE.ConeGeometry(0.2, 0.42, 8), C.fire, fx, fy + 0.22, fz, 0, 0, 0, FLAT);
      st.pools.push({ x: fx, z: fz, r: 2.2, land: true });
      st.claim(fx - 0.5, fz - 0.5, fx + 0.5, fz + 0.5);
      woods(st, 10, 12, ['pine', 'spruce']);
      break;
    }
  }
}

// ─── The ground ──────────────────────────────────────────────────────────

/** Column positions across the line: fine near the track and the bank, coarse far out. */
function columns(x0: number, x1: number, fine: [number, number], step: number, coarse: number): number[] {
  const out: number[] = [];
  let x = x0;
  while (x < x1 - 1e-6) {
    out.push(x);
    x += x >= fine[0] && x < fine[1] ? step : coarse;
  }
  out.push(x1);
  return out;
}

const LAKE_COLS = columns(-14.5, -2.5, [-11.5, -2.5], 0.35, 1.5);
const LAND_COLS = columns(2.5, 46, [2.5, 12], 0.5, 2.5);
const ROW_STEP = 0.75;

/** The ground of one stretch as a vertex-coloured grid (two strips: the lake bank and the land). */
function buildTerrain(s0: number, land: LandKind): THREE.BufferGeometry {
  const rows = Math.round(CHUNK / ROW_STEP);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const lane = land === 'lane' || land === 'village' || land === 'palms' || land === 'villas' ? 5.5 : null;
  const field = land === 'farm';
  for (const cols of [LAKE_COLS, LAND_COLS]) {
    const base = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const z = r * ROW_STEP;
      const s = s0 + z;
      for (const x of cols) {
        // Heights and colours in the lakeside's coordinates, laid out in the world's (SCENERY_SPREAD).
        positions.push(sceneryToWorldX(x), groundHeight(x, s), z);
        const c = groundColor(x, s, lane, field);
        colors.push(c[0], c[1], c[2]);
      }
    }
    const n = cols.length;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n - 1; i++) {
        const a = base + r * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  const count = positions.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // The lit materials read these: colour (sRGB → linear), no pattern, a matte natural surface.
  const linear = new Float32Array(colors.length);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2], THREE.SRGBColorSpace);
    linear[i * 3] = tmp.r;
    linear[i * 3 + 1] = tmp.g;
    linear[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(linear, 3));
  g.setAttribute('aColor2', new THREE.BufferAttribute(linear.slice(), 3));
  // Session 49 (owner: "find outside grass texture that actually looks better"): the ground carries the grass photo
  // layer (world/detail.ts) over its painted colours; its 6 m repeat divides the 24 m stretch, so stretches join.
  const pattern = new Float32Array(count * 2);
  const grass = packPattern(0, 'grass');
  for (let i = 0; i < count; i++) {
    pattern[i * 2] = grass;
    pattern[i * 2 + 1] = 1;
  }
  g.setAttribute('aPattern', new THREE.BufferAttribute(pattern, 2));
  const surface = new Float32Array(count * 4);
  // Smoothness 0.12 and full sheen (written in place: no array per vertex).
  for (let i = 0; i < count; i++) {
    surface[i * 4] = 0.12;
    surface[i * 4 + 3] = 1;
  }
  g.setAttribute('aSurface', new THREE.BufferAttribute(surface, 4));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Builds one stretch (scroll-space start `s0`) with its two pieces. */
/**
 * A stretch built in steps (yielding between them), so the scenery can build the next stretch a slice per
 * frame instead of stalling one frame for all of it.
 */
export function* chunkSteps(s0: number, shore: ShoreKind, land: LandKind, seed: number): Generator<void, ChunkBuild> {
  const st = new Stretch(s0, new Rng(seed));
  buildShore(st, shore);
  yield;
  buildLand(st, land);
  yield;
  // Verge flowers and the odd rock everywhere, so no stretch is bare.
  st.scatter('flower', 4, -TRACK_HALF - 1.0, -TRACK_HALF - 0.25, [0.8, 1.1], false, 0.14);
  st.scatter('rock', 2, 2.8, 3.8, [0.35, 0.6], true, 0.3);
  // Visual overhaul (owner, 24 Nov: "lush grass with flowers"): tufts of long grass and more flowers over both verges and
  // the land, placed last with the stretch's own random numbers, so nothing placed before moves.
  if (NEW_LOOK) {
    // Camera side: short tufts on the verge, the tall ones from 3.7 m out, so none hides the train (tests/terrain.test.ts).
    st.scatter('tuft', LUSH.tufts * 0.12, 3.2, 3.7, [0.55, 0.85], true, 0.1);
    st.scatter('tuft', LUSH.tufts * 0.48, 3.7, 11, [1.4, 2.3], true, 0.1);
    st.scatter('tuft', LUSH.tufts * 0.4, -TRACK_HALF - 1.6, -TRACK_HALF - 0.2, [1.2, 2.0], false, 0.1);
    st.scatter('flower', LUSH.flowers * 0.7, 2.9, 10, [0.9, 1.3], true, 0.12);
    st.scatter('flower', LUSH.flowers * 0.3, -TRACK_HALF - 1.4, -TRACK_HALF - 0.2, [0.9, 1.2], false, 0.12);
  }
  yield;
  const terrain = buildTerrain(s0, land);
  return {
    shore,
    land,
    terrain,
    lake: st.lake,
    landProps: st.landProps,
    lakeGlow: st.lakeGlow,
    landGlow: st.landGlow,
    pools: st.pools,
    fill: st.fill,
    beacon: st.beacon,
    windmill: st.windmill,
    chimneys: st.chimneys,
  };
}

/** A whole stretch at once (tests, tools, the first stretches at start-up). */
export function buildChunk(s0: number, shore: ShoreKind, land: LandKind, seed: number): ChunkBuild {
  return runSteps(chunkSteps(s0, shore, land, seed));
}

/** Runs a stepped build to the end. */
export function runSteps<T>(steps: Generator<void, T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Smooth-shaded geometry (soft, diorama-like) from an indexed primitive. */
function soft(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  return g;
}

/** The instanced fill shapes (unit scale), in FILL_KINDS order. */
export function fillGeometries(): Record<FillKind, THREE.BufferGeometry> {
  const leaf = { shade: 0.62, surface: 'foliage' } as PartStyle;
  const pine = new GeoBuilder();
  pine.cylinder(0, 0.4, 0, 0.1, 0.14, 0.8, '#6B5240', 6, 'y', { surface: 'wood' });
  const tiers: [number, number, number, string][] = [[1.25, 1.6, 1.08, '#3D6B55'], [2.05, 1.35, 0.86, '#467761'], [2.8, 1.1, 0.62, '#55876C']];
  for (const [y, h, r, color] of tiers) pine.add(soft(new THREE.ConeGeometry(r, h, 9)), color, 0, y, 0, 0, 0, 0, leaf);
  const spruce = new GeoBuilder();
  spruce.cylinder(0, 0.35, 0, 0.08, 0.12, 0.7, '#6B5240', 6, 'y', { surface: 'wood' });
  const tiers2: [number, number, number, string][] = [[1.3, 1.9, 0.8, '#355F4D'], [2.35, 1.6, 0.62, '#3E6A56'], [3.25, 1.3, 0.44, '#4B7963']];
  for (const [y, h, r, color] of tiers2) spruce.add(soft(new THREE.ConeGeometry(r, h, 8)), color, 0, y, 0, 0, 0, 0, leaf);
  // Session 49: the round trees, bushes and rocks are KayKit Forest models (CC0), recoloured toward the lakeside's
  // greens and bark (the pines stay ours: the free pack has none).
  const leaves = { hue: [60, 170] as [number, number], ref: '#5aa83c', to: '#5A8C4E' };
  const bark = { hue: [5, 40] as [number, number], ref: '#c36532', to: '#7A5A44' };
  const broad = new GeoBuilder();
  const tree = modelEntry('tree_round');
  const treeScale = 2.9 / (tree.max[1] - tree.min[1]);
  broad.model('tree_round', 0, 0, 0, 0, treeScale, treeScale, treeScale, { recolor: [leaves, bark], shade: 0.7, surface: 'foliage' });
  const bush = new GeoBuilder();
  const shrub = modelEntry('bush_round');
  const bushScale = 0.78 / (shrub.max[0] - shrub.min[0]);
  bush.model('bush_round', 0, 0, 0, 0, bushScale, bushScale, bushScale, { recolor: [{ ...leaves, ref: '#368c3a', to: '#4F7D52' }], shade: 0.72, surface: 'foliage' });
  const reed = new GeoBuilder();
  const rr = new Rng(7);
  for (let i = 0; i < 6; i++) {
    const h = rr.range(0.55, 0.95);
    const dx = rr.range(-0.22, 0.22);
    const dz = rr.range(-0.22, 0.22);
    reed.add(new THREE.CylinderGeometry(0.012, 0.022, h, 4), '#86965C', dx, h / 2, dz, rr.range(-0.15, 0.15), 0, rr.range(-0.15, 0.15), { shade: 0.7, surface: 'foliage' });
    if (i % 2 === 0) reed.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), '#A0845A', dx, h + 0.02, dz, 0, 0, 0, FLAT);
  }
  const rock = new GeoBuilder();
  const stone = modelEntry('rock_round');
  const rockScale = 0.62 / (stone.max[0] - stone.min[0]);
  rock.model('rock_round', 0, -0.04, 0, 0, rockScale, rockScale * 0.7, rockScale, { recolor: [{ hue: [0, 360], sat: [0, 1], ref: '#6b7378', to: '#9097A3' }], shade: 0.75, surface: 'stone' });
  const lily = new GeoBuilder();
  lily.add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 10, 1, false, 0.4, Math.PI * 1.8), '#4E7E58', 0, 0, 0, 0, 0, 0, FLAT);
  lily.add(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 9, 1, false, 1.0, Math.PI * 1.8), '#5A8C62', 0.22, 0, 0.12, 0, 0, 0, FLAT);
  lily.add(soft(new THREE.ConeGeometry(0.06, 0.07, 7)), '#F2D6E2', 0.05, 0.04, -0.03, 0, 0, 0, { shade: 1, surface: { roughness: 0.6, metalness: 0, glow: 0.12 } });
  const flower = new GeoBuilder();
  const fr = new Rng(11);
  const petals = ['#E8D46A', '#E9A6C0', '#F2EEE6', '#B9A6E6'];
  for (let i = 0; i < 4; i++) {
    const dx = fr.range(-0.12, 0.12);
    const dz = fr.range(-0.12, 0.12);
    const h = fr.range(0.12, 0.24);
    flower.add(new THREE.CylinderGeometry(0.006, 0.006, h, 3), '#5E8A5A', dx, h / 2, dz, 0, 0, 0, FLAT);
    flower.add(new THREE.OctahedronGeometry(0.032, 0), petals[i % petals.length], dx, h, dz, 0, 0, 0, { shade: 1, surface: { roughness: 0.7, metalness: 0, glow: 0.05 } });
  }
  // A tuft of long grass (new look): a few slim blades in two greens, leaning out.
  const tuft = new GeoBuilder();
  const tr = new Rng(19);
  for (let i = 0; i < 7; i++) {
    const h = tr.range(0.16, 0.32);
    const a = (i / 7) * Math.PI * 2;
    tuft.add(new THREE.ConeGeometry(0.018, h, 3), i % 2 ? '#5E9A3E' : '#7DB451', Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35, { shade: 0.85, surface: 'foliage' });
  }
  // A sheep: a woolly cream body, a dark face looking down to graze, four dark legs (about 0.75 m tall).
  const sheep = new GeoBuilder();
  sheep.add(soft(new THREE.IcosahedronGeometry(0.34, 1)).scale(1.3, 0.92, 0.9), '#EEE8DA', 0, 0.5, 0, 0, 0, 0, { shade: 0.8, surface: 'fabric' });
  sheep.add(soft(new THREE.IcosahedronGeometry(0.2, 1)), '#F3EEE2', 0.16, 0.66, 0.05, 0, 0, 0, { shade: 0.9, surface: 'fabric' });
  sheep.add(soft(new THREE.IcosahedronGeometry(0.13, 1)).scale(1.25, 0.9, 0.85), '#3A3436', 0.5, 0.38, 0, 0, 0, -0.5, { shade: 0.85 });
  for (const [lx, lz] of [[0.24, 0.14], [0.24, -0.14], [-0.24, 0.14], [-0.24, -0.14]]) sheep.cylinder(lx, 0.14, lz, 0.035, 0.035, 0.28, '#3A3436', 5);
  // Phase 4, the coast: Kenney's palm and cypress and Quaternius' lemon tree (CC0), each fitted to its height.
  const fitted = (id: Parameters<typeof modelEntry>[0], height: number, shade: number, surface: PartStyle['surface']): THREE.BufferGeometry => {
    const g = new GeoBuilder();
    const e = modelEntry(id);
    const sc = height / (e.max[1] - e.min[1]);
    g.model(id, 0, -e.min[1] * sc, 0, 0, sc, sc, sc, { shade, surface });
    return g.build();
  };
  return {
    palm: fitted('palm_straight', COAST_FILL_HEIGHT.palm, 0.75, 'foliage'),
    cypress: fitted('cypress', COAST_FILL_HEIGHT.cypress, 0.7, 'foliage'),
    lemon: fitted('lemon_tree', COAST_FILL_HEIGHT.lemon, 0.75, 'foliage'),
    sheep: sheep.build(),
    pine: pine.build(),
    spruce: spruce.build(),
    broadleaf: broad.build(),
    bush: bush.build(),
    reed: reed.build(),
    rock: rock.build(),
    lily: lily.build(),
    flower: flower.build(),
    tuft: tuft.build(),
  };
}

/** Exposed for tests: the verge stays flat beside the track, so nothing of the ground rises into the bed. */
export const VERGE_HEIGHT = VERGE_Y;
