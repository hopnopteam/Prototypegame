import * as THREE from 'three';
import { frameWork } from '../core/Background';
import { Rng } from '../core/Rng';
import { GeoBuilder } from './geo';
import { CHUNK, chunkSteps, FILL_KINDS, FILL_SLOTS, fillGeometries, LAND_DECK, runSteps, SHORE_DECK, type ChunkBuild, type DeckEntry, type FillKind, type LandKind, type PieceKind, type ShoreKind } from './Lakeside';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { groundHeight, SCENERY_SPREAD, WORLD_TRACK_HALF } from './terrain';
import { PlanarReflection, REFLECT_LAYER, Water } from './Water';

/** Billboards stand just beyond the ballast on the land side, where the camera always catches them. */
const BILLBOARD_X = 4.25 + SCENERY_SPREAD;
const BILLBOARD_W = 2.3;
const BILLBOARD_H = 1.2;
/** The world the stretches tile: from well ahead of the locomotive to well behind the longest train. */
const SPAN_MIN = -96;
const SPAN_MAX = 150;
/** No stretch of the same kind comes back within this many (about a minute at cruising speed). */
const NO_REPEAT = 4;
/**
 * Milliseconds per frame spent building the next stretch ahead of time. A whole stretch costs several
 * milliseconds (many more on a phone): built in slices it never shows as a hitch.
 */
const BUILD_BUDGET_MS = 1.5;
/** Seconds between wisps from each chimney, and the stretch around the view (world z, from the focus) that smokes. */
const CHIMNEY_PUFF_SECONDS = 0.45;
const CHIMNEY_VIEW: [number, number] = [-50, 18];

interface Chunk {
  group: THREE.Group;
  terrain: THREE.Mesh;
  lake: THREE.Mesh;
  land: THREE.Mesh;
  lakeGlow: THREE.Mesh;
  landGlow: THREE.Mesh;
  lakePools: THREE.Mesh;
  landPools: THREE.Mesh;
  beam: THREE.Mesh;
  sails: THREE.Mesh;
  /** Scroll-space position of the stretch's start (z); world z = this + scroll. */
  z: number;
  build: ChunkBuild | null;
  /** This stretch's instanced fill (one mesh per kind, culled with the stretch). */
  fill: Record<FillKind, THREE.InstancedMesh>;
  landHidden: boolean;
}

/** A stretch's finished geometry, ready to swap in. */
interface Prepared {
  build: ChunkBuild;
  lake: THREE.BufferGeometry | null;
  land: THREE.BufferGeometry | null;
  lakeGlow: THREE.BufferGeometry | null;
  landGlow: THREE.BufferGeometry | null;
  lakePools: THREE.BufferGeometry | null;
  landPools: THREE.BufferGeometry | null;
}

/** The next stretch to come round, being built ahead of time. */
interface Pending {
  chunk: Chunk;
  z: number;
  steps: Generator<void, Prepared>;
  ready: Prepared | null;
}

const dummy = new THREE.Object3D();
const EMPTY = new THREE.BufferGeometry();
const built = (b: GeoBuilder): THREE.BufferGeometry | null => (b.isEmpty ? null : b.build());

/** A soft round pool of lamplight on the ground (additive decal), drawn once. */
function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,190,120,0.55)');
  g.addColorStop(0.45, 'rgba(255,170,105,0.22)');
  g.addColorStop(1, 'rgba(255,160,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const POOL_MATERIAL = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

function poolGeometry(pools: ChunkBuild['pools'], land: boolean, s0: number): THREE.BufferGeometry | null {
  const list = pools.filter((p) => p.land === land);
  if (list.length === 0) return null;
  const pos: number[] = [];
  const uv: number[] = [];
  for (const p of list) {
    const y = groundHeight(p.x, s0 + p.z) + 0.025;
    const r = p.r;
    const quad = [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, -r, 0, 0], [r, r, 1, 1], [-r, r, 0, 1]];
    for (const [dx, dz, u, v] of quad) {
      pos.push(p.x + dx, y, p.z + dz);
      uv.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

/** Windmill sails: four lattice blades round a hub, facing the line. */
const SAILS_GEOMETRY = (() => {
  const b = new GeoBuilder();
  b.cylinder(0, 0, 0, 0.12, 0.12, 0.25, '#4E4038', 8, 'x');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.04, 2.4, 0.42);
    g.translate(0, 1.35, 0.12);
    g.rotateX(a);
    b.add(g, '#E8DFCC', 0.08, 0, 0, 0, 0, 0, { pattern: PATTERN.stripesZ, color2: '#8A7A66', scale: 0.12, shade: 1 });
  }
  return b.build();
})();

/**
 * The moonlit lakeside that scrolls past the (stationary) train. Built from continuous functions (terrain.ts)
 * one stretch at a time, so the bank, the lake and the fields never break at a seam; the lake runs on far past
 * anything the camera can see. Each stretch pairs a lake-side and a land-side piece from shuffled decks, so
 * nothing repeats within a minute. Trees, reeds, rocks, lilies and flowers are instanced; everything moves by
 * one group offset each frame.
 */
export class Scenery {
  readonly group = new THREE.Group();
  readonly water: Water;
  private readonly scrollRoot = new THREE.Group();
  private scroll = 0;
  private readonly sleepers: THREE.InstancedMesh;
  private sleeperOffset = 0;
  private readonly rng = new Rng(20261001);
  private readonly chunks: Chunk[] = [];
  private readonly shapes = fillGeometries();
  private readonly recentShore: ShoreKind[] = [];
  private readonly recentLand: LandKind[] = [];
  private readonly lastShore = new Map<ShoreKind, number>();
  private readonly lastLand = new Map<LandKind, number>();
  private placed = 0;
  private forced: { shore?: ShoreKind; land?: LandKind } | null = null;
  private hideRegion: { x0: number; x1: number; z0: number; z1: number } | null = null;
  private hideKey = '';
  private reflection: PlanarReflection | null = null;
  /** Roadside billboards for the player's train (a marketing upgrade), scrolling with the countryside. */
  private readonly billboards: THREE.Group[] = [];
  private readonly billboardMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  private time = 0;
  private smokeTimer = 0;
  private pending: Pending | null = null;

  constructor() {
    // The lake covers everything on the lake side, far beyond the view; the ground lies over it where it rises.
    this.water = new Water(-260, -2.4, SPAN_MIN - 90, SPAN_MAX + 90);
    this.group.add(this.water.mesh, this.scrollRoot);

    // Track bed and rails. Rails are uniform along z, so they stay put while the sleepers scroll.
    const bed = new GeoBuilder();
    bed.box(0, 0.05, (SPAN_MIN + SPAN_MAX) / 2, (WORLD_TRACK_HALF - 0.52) * 2, 0.1, SPAN_MAX - SPAN_MIN + 60, '#7E7B76', 0, { pattern: PATTERN.dots, color2: '#6E6B66', scale: 0.12, shade: 1, surface: 'stone' });
    for (const x of [-0.72, 0.72]) {
      bed.box(x, 0.22, (SPAN_MIN + SPAN_MAX) / 2, 0.1, 0.12, SPAN_MAX - SPAN_MIN + 60, PALETTE.rail, 0, { shade: 0.8, surface: 'iron' });
      bed.box(x, 0.285, (SPAN_MIN + SPAN_MAX) / 2, 0.07, 0.012, SPAN_MAX - SPAN_MIN + 60, PALETTE.railTop, 0, { shade: 1, surface: { roughness: 0.55, metalness: 0.4 } });
    }
    const bedMesh = new THREE.Mesh(bed.build(), MATERIALS.scenery);
    bedMesh.receiveShadow = true;
    bedMesh.userData.object = 'scenery:track';
    this.group.add(bedMesh);

    const sleeperGeo = new GeoBuilder().box(0, 0.12, 0, 2.2, 0.08, 0.26, '#4E3E33', 0, { shade: 0.8, surface: 'wood' }).build();
    this.sleepers = new THREE.InstancedMesh(sleeperGeo, MATERIALS.scenery, 380);
    this.sleepers.frustumCulled = false;
    this.sleepers.receiveShadow = true;
    this.group.add(this.sleepers);

    const count = Math.ceil((SPAN_MAX - SPAN_MIN) / CHUNK) + 1;
    for (let i = 0; i < count; i++) {
      const chunk = this.makeChunk(i);
      chunk.z = SPAN_MIN + i * CHUNK;
      this.chunks.push(chunk);
      this.assign(chunk);
    }
    this.writeSleepers();
  }

  /** Called when the train grows. The stretches already cover the longest train. */
  setSpan(_trainRearZ: number): void {
    this.writeSleepers();
  }

  /** The region hidden for the platform (world coordinates), or null between stations. */
  get hiddenRegion(): { x0: number; x1: number; z0: number; z1: number } | null {
    return this.hideRegion;
  }

  /** Land-side scenery inside this region is hidden (the station platform and building occupy it). */
  setHiddenRegion(region: { x0: number; x1: number; z0: number; z1: number } | null): void {
    this.hideRegion = region;
  }

  /** Real reflections on the lake (HIGH and ULTRA): a mirror pass at `scale` of the screen, or off (0). */
  setReflections(scale: number): PlanarReflection | null {
    if (scale <= 0) {
      this.reflection?.dispose();
      this.reflection = null;
      return null;
    }
    if (this.reflection) this.reflection.setScale(scale);
    else this.reflection = new PlanarReflection(this.water, scale);
    return this.reflection;
  }

  update(dt: number, speed: number): void {
    const dz = speed * dt;
    this.scroll += dz;
    this.scrollRoot.position.z = this.scroll;
    // Stretches that have passed behind the train go round to the front with new pieces (built ahead of time).
    for (const chunk of this.chunks) if (chunk.z + this.scroll > SPAN_MAX) this.recycle(chunk);
    this.prebuild();
    this.updateHidden();
    if (dz !== 0) {
      // The sleepers move as one row (their spacing repeats every 0.7 m): no per-sleeper writes.
      this.sleeperOffset = (this.sleeperOffset + dz) % 0.7;
      this.sleepers.position.z = this.sleeperOffset;
    }
    const span = SPAN_MAX - SPAN_MIN;
    for (const board of this.billboards) {
      board.position.z += dz;
      if (board.position.z > SPAN_MAX) board.position.z -= span;
      board.visible = !this.isHidden(board.position.x, board.position.z) && !this.isHidden(board.position.x, board.position.z - 1.5);
    }
    // Lighthouse beams sweep round; windmill sails turn.
    this.time += dt;
    for (const chunk of this.chunks) {
      if (chunk.beam.visible) chunk.beam.rotation.y = this.time * 0.9;
      if (chunk.sails.visible) chunk.sails.rotation.x = this.time * 0.6;
    }
  }

  /**
   * Cottage chimneys smoking gently (session 18): a wisp from each chimney near the view now and then, carried
   * along with the countryside. `focusZ` is where the camera looks; only chimneys around it puff.
   */
  smokeChimneys(dt: number, focusZ: number, emit: (x: number, y: number, z: number) => void): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = CHIMNEY_PUFF_SECONDS;
    for (const chunk of this.chunks) {
      const build = chunk.build;
      if (!build || build.chimneys.length === 0 || chunk.landHidden) continue;
      const z0 = chunk.z + this.scroll;
      if (z0 > focusZ + CHIMNEY_VIEW[1] || z0 + CHUNK < focusZ + CHIMNEY_VIEW[0]) continue;
      for (const c of build.chimneys) {
        const z = z0 + c.z;
        const x = c.x < 0 ? c.x - SCENERY_SPREAD : c.x + SCENERY_SPREAD;
        if (z < focusZ + CHIMNEY_VIEW[0] || z > focusZ + CHIMNEY_VIEW[1] || this.isHidden(x, z)) continue;
        emit(x, c.y, z);
      }
    }
  }

  /** Per-frame look: the water ripples, catches the moon and the train's windows. */
  present(dt: number, _focus: THREE.Vector3, night: number, _resolution: { width: number; height: number }, _zoom: number): void {
    this.water.update(dt, this.scroll, night);
  }

  /** No more rock cuttings (they hid the train): the moon always shines. Kept for the lighting hook. */
  darknessAt(_z: number): number {
    return 0;
  }

  /** Shows `count` billboards with this poster (null removes them), on the land side. */
  setBillboards(texture: THREE.Texture | null, count: number): void {
    if (this.billboardMaterial.map !== texture) {
      this.billboardMaterial.map?.dispose();
      this.billboardMaterial.map = texture;
      this.billboardMaterial.needsUpdate = true;
    }
    const wanted = texture ? count : 0;
    while (this.billboards.length < wanted) {
      const board = buildBillboard(this.billboardMaterial);
      const i = this.billboards.length;
      board.position.set(BILLBOARD_X, 0, SPAN_MIN + ((i + 0.5) / wanted) * (SPAN_MAX - SPAN_MIN));
      this.group.add(board);
      this.billboards.push(board);
    }
    while (this.billboards.length > wanted) {
      const board = this.billboards.pop();
      if (board) this.group.remove(board);
    }
  }

  /** True where the platform is: ambient life stays out of it too. */
  readonly isHiddenAt = (x: number, z: number): boolean => this.isHidden(x, z);

  private isHidden(x: number, z: number): boolean {
    const r = this.hideRegion;
    return !!r && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  }

  private makeChunk(index: number): Chunk {
    const group = new THREE.Group();
    const mesh = (material: THREE.Material, cast: boolean, reflect: boolean, receive = true): THREE.Mesh => {
      const m = new THREE.Mesh(EMPTY, material);
      m.castShadow = cast;
      m.receiveShadow = receive;
      if (reflect) m.layers.enable(REFLECT_LAYER);
      group.add(m);
      return m;
    };
    const beam = new THREE.Mesh(BEAM_GEOMETRY, BEAM_MATERIAL);
    beam.visible = false;
    beam.layers.enable(REFLECT_LAYER);
    group.add(beam);
    const sails = new THREE.Mesh(SAILS_GEOMETRY, MATERIALS.scenery);
    sails.visible = false;
    sails.castShadow = true;
    group.add(sails);
    this.scrollRoot.add(group);
    void index;
    const fill = {} as Record<FillKind, THREE.InstancedMesh>;
    for (const kind of FILL_KINDS) {
      const m = new THREE.InstancedMesh(this.shapes[kind], MATERIALS.scenery, FILL_SLOTS[kind]);
      m.count = 0;
      m.castShadow = kind === 'pine' || kind === 'spruce' || kind === 'broadleaf';
      m.receiveShadow = true;
      m.layers.enable(REFLECT_LAYER);
      group.add(m);
      fill[kind] = m;
    }
    const pools = (): THREE.Mesh => {
      const m = new THREE.Mesh(EMPTY, POOL_MATERIAL);
      m.renderOrder = 2;
      group.add(m);
      return m;
    };
    const lakeSide = (m: THREE.Mesh): THREE.Mesh => ((m.position.x = -SCENERY_SPREAD), m);
    const landSide = (m: THREE.Mesh): THREE.Mesh => ((m.position.x = SCENERY_SPREAD), m);
    const chunk: Chunk = {
      group,
      terrain: mesh(MATERIALS.scenery, false, false),
      // Lakeside pieces are built in their own coordinates and moved out to the world (SCENERY_SPREAD).
      lake: lakeSide(mesh(MATERIALS.scenery, true, true)),
      land: landSide(mesh(MATERIALS.scenery, true, false)),
      lakeGlow: lakeSide(mesh(MATERIALS.lamps, false, true, false)),
      landGlow: landSide(mesh(MATERIALS.lamps, false, false, false)),
      lakePools: lakeSide(pools()),
      landPools: landSide(pools()),
      beam,
      sails,
      z: 0,
      build: null,
      fill,
      landHidden: false,
    };
    // A stretch's pieces never move inside it (only the stretch itself, when it comes round, and the beam
    // and sails, which turn): their matrices are composed once, not every frame (two hundred objects).
    for (const child of group.children) {
      if (child === beam || child === sails) continue;
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }
    group.matrixAutoUpdate = false;
    return chunk;
  }

  /** The next card from a deck: weighted, never a kind within its gap, never one of the last few. */
  private draw<K extends string>(deck: DeckEntry<K>[], recent: K[], last: Map<K, number>): K {
    const n = this.placed;
    const options = deck.filter((d) => !recent.includes(d.kind) && (last.get(d.kind) === undefined || n - (last.get(d.kind) as number) > d.gap));
    const pool = options.length > 0 ? options : deck.slice(0, 1);
    let total = 0;
    for (const o of pool) total += o.weight;
    let roll = this.rng.next() * total;
    let kind = pool[pool.length - 1].kind;
    for (const o of pool) {
      roll -= o.weight;
      if (roll <= 0) {
        kind = o.kind;
        break;
      }
    }
    last.set(kind, n);
    recent.push(kind);
    if (recent.length > NO_REPEAT) recent.shift();
    return kind;
  }

  /** Dev and Creative Mode: puts a piece of this kind beside the camera (for screenshots and QA). */
  devShowPiece(kind: PieceKind, focusZ: number): void {
    const shore = SHORE_DECK.some((d) => d.kind === kind) ? (kind as ShoreKind) : undefined;
    const land = LAND_DECK.some((d) => d.kind === kind) ? (kind as LandKind) : undefined;
    for (const chunk of this.chunks) {
      const z0 = chunk.z + this.scroll;
      if (focusZ >= z0 - CHUNK * 0.5 && focusZ < z0 + CHUNK * 1.2) {
        this.forced = { shore, land };
        this.assign(chunk);
      }
    }
    this.forced = null;
  }

  /** Builds a stretch now, in one go (start-up and the dev tools). */
  private assign(chunk: Chunk): void {
    this.install(chunk, chunk.z, runSteps(this.prepare(chunk.z)));
  }

  /** Sends a stretch that has passed behind the train round to the front, with the stretch built for it. */
  private recycle(chunk: Chunk): void {
    const z = chunk.z - this.chunks.length * CHUNK;
    const pending = this.pending && this.pending.chunk === chunk && this.pending.z === z ? this.pending : null;
    this.pending = null;
    this.install(chunk, z, pending ? pending.ready ?? runSteps(pending.steps) : runSteps(this.prepare(z)));
  }

  /** Builds the next stretch to come round a slice at a time, within the frame's budget. */
  private prebuild(): void {
    if (!this.pending) {
      let next: Chunk | null = null;
      for (const chunk of this.chunks) if (!next || chunk.z > next.z) next = chunk;
      if (!next) return;
      const z = next.z - this.chunks.length * CHUNK;
      this.pending = { chunk: next, z, steps: this.prepare(z), ready: null };
    }
    const p = this.pending;
    if (p.ready) return;
    // First claim on the frame's shared work budget: the stretch must be ready before it comes round.
    const end = Math.min(performance.now() + BUILD_BUDGET_MS, frameWork.until);
    do {
      const r = p.steps.next();
      if (r.done) {
        p.ready = r.value;
        return;
      }
    } while (performance.now() < end);
  }

  /** A stretch's pieces and geometry, step by step (the deck cards are drawn when it starts). */
  private *prepare(z: number): Generator<void, Prepared> {
    const shore = this.forced?.shore ?? this.draw(SHORE_DECK, this.recentShore, this.lastShore);
    const land = this.forced?.land ?? this.draw(LAND_DECK, this.recentLand, this.lastLand);
    this.placed++;
    // Seeded by where the stretch is, so the same stretch always looks the same.
    const build = yield* chunkSteps(z, shore, land, Math.abs(Math.round(z * 7.31)) + 17);
    yield;
    const lake = built(build.lake);
    yield;
    const landProps = built(build.landProps);
    yield;
    const lakeGlow = built(build.lakeGlow);
    const landGlow = built(build.landGlow);
    const lakePools = poolGeometry(build.pools, false, z);
    const landPools = poolGeometry(build.pools, true, z);
    return { build, lake, land: landProps, lakeGlow, landGlow, lakePools, landPools };
  }

  private install(chunk: Chunk, z: number, prepared: Prepared): void {
    const build = prepared.build;
    chunk.z = z;
    chunk.build = build;
    chunk.group.position.z = z;
    chunk.group.updateMatrix();
    const set = (mesh: THREE.Mesh, geometry: THREE.BufferGeometry | null): void => {
      if (mesh.geometry !== EMPTY && mesh.geometry !== SAILS_GEOMETRY) mesh.geometry.dispose();
      mesh.geometry = geometry ?? EMPTY;
      mesh.visible = geometry !== null;
    };
    set(chunk.terrain, build.terrain);
    set(chunk.lake, prepared.lake);
    set(chunk.land, prepared.land);
    set(chunk.lakeGlow, prepared.lakeGlow);
    set(chunk.landGlow, prepared.landGlow);
    set(chunk.lakePools, prepared.lakePools);
    set(chunk.landPools, prepared.landPools);
    chunk.beam.visible = build.beacon !== null;
    if (build.beacon) chunk.beam.position.copy(build.beacon).setX(build.beacon.x - SCENERY_SPREAD);
    chunk.sails.visible = build.windmill !== null;
    if (build.windmill) chunk.sails.position.copy(build.windmill).setX(build.windmill.x + SCENERY_SPREAD);
    chunk.landHidden = false;
    this.writeFill(chunk);
  }

  /** Writes a stretch's fill into its instanced meshes (only what shows: hidden land-side fill is left out). */
  private writeFill(chunk: Chunk): void {
    const used: Record<string, number> = {};
    const build = chunk.build;
    if (build) {
      for (const spot of build.fill) {
        const slot = used[spot.kind] ?? 0;
        if (slot >= FILL_SLOTS[spot.kind]) continue;
        const x = spot.land ? spot.x + SCENERY_SPREAD : spot.x - SCENERY_SPREAD;
        if (spot.land && this.isHidden(x, chunk.z + spot.z + this.scroll)) continue;
        dummy.position.set(x, spot.y, spot.z);
        dummy.rotation.set(0, spot.rot, 0);
        dummy.scale.set(spot.scale, spot.scale, spot.scale);
        dummy.updateMatrix();
        chunk.fill[spot.kind].setMatrixAt(slot, dummy.matrix);
        used[spot.kind] = slot + 1;
      }
    }
    for (const kind of FILL_KINDS) {
      const mesh = chunk.fill[kind];
      mesh.count = used[kind] ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count > 0) mesh.computeBoundingSphere();
    }
  }

  /**
   * The platform's region moves with the scenery, so which stretches it covers only changes when it is first
   * set (far ahead, off screen) or cleared: re-check then, and when a stretch comes round.
   */
  private updateHidden(): void {
    const r = this.hideRegion;
    const key = r ? `${Math.round(r.z0 - this.scroll)}|${Math.round(r.z1 - this.scroll)}` : '';
    const changed = key !== this.hideKey;
    this.hideKey = key;
    for (const chunk of this.chunks) {
      const z0 = chunk.z + this.scroll;
      const hide = !!r && z0 < r.z1 && z0 + CHUNK > r.z0;
      if (hide === chunk.landHidden && !changed) continue;
      chunk.landHidden = hide;
      const has = (m: THREE.Mesh): boolean => m.geometry !== EMPTY;
      chunk.land.visible = !hide && has(chunk.land);
      chunk.landGlow.visible = !hide && has(chunk.landGlow);
      chunk.landPools.visible = !hide && has(chunk.landPools);
      chunk.sails.visible = !hide && chunk.build?.windmill !== null && chunk.build !== null;
      this.writeFill(chunk);
    }
  }

  private writeSleepers(): void {
    const count = this.sleepers.count;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, SPAN_MIN - 20 + i * 0.7);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.sleepers.setMatrixAt(i, dummy.matrix);
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }
}

/** Kept clear of everything: the track bed (scenery never enters it). */
export const SCENERY_TRACK_HALF = WORLD_TRACK_HALF;

/** The lighthouse's sweeping beam: a long, faint cone of light, brightest at the lamp. */
const BEAM_GEOMETRY = (() => {
  const g = new THREE.ConeGeometry(1.1, 11, 16, 1, true);
  g.rotateZ(Math.PI / 2);
  g.translate(5.5, 0, 0);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = 1 - Math.min(1, pos.getX(i) / 11);
    colors.set([t, t * 0.92, t * 0.75], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
})();
const BEAM_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

/** A billboard on two posts, turned toward the camera; the poster face shares one material. */
function buildBillboard(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const y0 = 0.95;
  for (const dx of [-BILLBOARD_W * 0.35, BILLBOARD_W * 0.35]) b.box(dx, (y0 + BILLBOARD_H) / 2, -0.08, 0.1, y0 + BILLBOARD_H, 0.1, '#6B5A4A', 0, { shade: 0.85 });
  b.box(0, y0 + BILLBOARD_H / 2, -0.06, BILLBOARD_W + 0.16, BILLBOARD_H + 0.16, 0.05, '#F4EEE2', 0, { shade: 0.9 });
  b.box(0, y0 - 0.05, 0.1, BILLBOARD_W + 0.1, 0.05, 0.3, '#6B5A4A', 0, { shade: 1 });
  const frame = new THREE.Mesh(b.build(), MATERIALS.scenery);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BILLBOARD_W, BILLBOARD_H), material);
  face.position.set(0, y0 + BILLBOARD_H / 2, -0.03);
  group.add(frame, face);
  // Face the camera (which looks from the land side and from behind the train).
  group.rotation.set(-0.28, 0.9, 0, 'YXZ');
  return group;
}
