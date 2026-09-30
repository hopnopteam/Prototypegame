import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { Backdrop } from './Backdrop';
import { GeoBuilder } from './geo';
import { buildPiece, CHUNK, PIECES, treeGeometries, WATER_EDGE_X, type PieceBuild, type PieceKind, type TreeSpot } from './Lakeside';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { PlanarReflection, REFLECT_LAYER, Water } from './Water';

/** Billboards stand just beyond the ballast on the land side, where the camera always catches them. */
const BILLBOARD_X = 3.75;
const BILLBOARD_W = 2.3;
const BILLBOARD_H = 1.2;
/** The world the pieces tile: from well ahead of the locomotive to well behind the longest train. */
const SPAN_MIN = -96;
const SPAN_MAX = 150;
/** Instanced tree slots per piece, by shape. */
const TREE_SLOTS = [30, 14, 8];
/** No piece variant (with its mirror image) comes back within this many pieces: 60 s at cruising speed. */
const NO_REPEAT = 36;
/** Metres at each end of a cutting over which the moonlight fades out and back. */
const DARK_FADE = 6;
/** The painted horizon's height on screen (0 top, 1 bottom) at the default framing. */
const HORIZON = 0.23;

interface Template {
  kind: PieceKind;
  variant: number;
  base: THREE.BufferGeometry;
  lake: THREE.BufferGeometry | null;
  land: THREE.BufferGeometry | null;
  lakeGlow: THREE.BufferGeometry | null;
  landGlow: THREE.BufferGeometry | null;
  trees: TreeSpot[];
  beacon: THREE.Vector3 | null;
  dark: boolean;
}

interface Chunk {
  group: THREE.Group;
  base: THREE.Mesh;
  lake: THREE.Mesh;
  land: THREE.Mesh;
  lakeGlow: THREE.Mesh;
  landGlow: THREE.Mesh;
  beam: THREE.Mesh;
  /** Scroll-space position of the chunk's start (z); world z = this + scroll offset. */
  z: number;
  template: Template | null;
  mirrored: boolean;
  /** First instance of this chunk in each tree mesh. */
  treeStart: number[];
  landHidden: boolean;
}

const dummy = new THREE.Object3D();
const EMPTY = new THREE.BufferGeometry();

/**
 * The moonlit lakeside that scrolls past the (stationary) train: the lake and its painted distance on the
 * upper left, pine forest and villages on the right, one set piece after another (coves, a pier, a
 * lighthouse point, bridges over inlets, a village, a rock cutting) drawn from a shuffled deck so none comes
 * back within a minute. Everything moves by one speed value, so the platform and the scenery never drift
 * apart. Pieces are built once as templates and reused; trees are instanced; the whole lot moves by one
 * group offset each frame.
 */
export class Scenery {
  readonly group = new THREE.Group();
  readonly water: Water;
  readonly backdrop = new Backdrop();
  private readonly scrollRoot = new THREE.Group();
  private scroll = 0;
  private readonly sleepers: THREE.InstancedMesh;
  private sleeperOffset = 0;
  private readonly rng = new Rng(20260930);
  private readonly templates: Template[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly trees: THREE.InstancedMesh[] = [];
  /** Recent picks (template index * 2 + mirror) and the last piece index of each kind. */
  private readonly recent: number[] = [];
  private readonly lastOfKind = new Map<PieceKind, number>();
  private placed = 0;
  private hideRegion: { x0: number; x1: number; z0: number; z1: number } | null = null;
  private hideKey = '';
  private reflection: PlanarReflection | null = null;
  /** Roadside billboards for the player's train (a marketing upgrade), scrolling with the countryside. */
  private readonly billboards: THREE.Group[] = [];
  private readonly billboardMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  private beamTime = 0;
  private dz = 0;

  constructor() {
    this.water = new Water(WATER_EDGE_X, 40, SPAN_MIN - 40, SPAN_MAX + 40);
    this.water.mesh.position.y = 0;
    this.group.add(this.backdrop.mesh, this.water.mesh, this.scrollRoot);

    // Track bed and rails. Rails are uniform along z, so they stay put while the sleepers scroll.
    const bed = new GeoBuilder();
    bed.box(0, 0.05, (SPAN_MIN + SPAN_MAX) / 2, 3.96, 0.1, SPAN_MAX - SPAN_MIN + 60, '#7E7B76', 0, { pattern: PATTERN.dots, color2: '#6E6B66', scale: 0.12, shade: 1, surface: 'stone' });
    for (const x of [-0.72, 0.72]) {
      bed.box(x, 0.22, (SPAN_MIN + SPAN_MAX) / 2, 0.1, 0.12, SPAN_MAX - SPAN_MIN + 60, PALETTE.rail, 0, { shade: 0.8 });
      bed.box(x, 0.285, (SPAN_MIN + SPAN_MAX) / 2, 0.07, 0.012, SPAN_MAX - SPAN_MIN + 60, PALETTE.railTop, 0, { shade: 1 });
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

    PIECES.forEach((def) => {
      for (let v = 0; v < def.variants; v++) this.templates.push(this.makeTemplate(buildPiece(def.kind, v + 1), v));
    });

    const count = Math.ceil((SPAN_MAX - SPAN_MIN) / CHUNK) + 1;
    treeGeometries().forEach((geometry, k) => {
      const mesh = new THREE.InstancedMesh(geometry, MATERIALS.scenery, TREE_SLOTS[k] * count);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.layers.enable(REFLECT_LAYER);
      this.trees.push(mesh);
      this.scrollRoot.add(mesh);
    });
    for (let i = 0; i < count; i++) {
      const chunk = this.makeChunk(i);
      chunk.z = SPAN_MIN + i * CHUNK;
      this.chunks.push(chunk);
      this.assign(chunk);
    }
    this.writeSleepers();
  }

  /** Called when the train grows. The pieces already cover the longest train, so only the billboards move. */
  setSpan(_trainRearZ: number): void {
    this.writeSleepers();
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
    this.dz += dz;
    this.scroll += dz;
    this.scrollRoot.position.z = this.scroll;
    // Pieces that have passed behind the train go round to the front with a new look.
    for (const chunk of this.chunks) {
      if (chunk.z + this.scroll > SPAN_MAX) {
        chunk.z -= this.chunks.length * CHUNK;
        this.assign(chunk);
      }
    }
    this.updateHidden();
    if (dz !== 0) {
      this.sleeperOffset = (this.sleeperOffset + dz) % 0.7;
      this.writeSleepers();
    }
    const span = SPAN_MAX - SPAN_MIN;
    for (const board of this.billboards) {
      board.position.z += dz;
      if (board.position.z > SPAN_MAX) board.position.z -= span;
      board.visible = !this.isHidden(board.position.x, board.position.z) && !this.isHidden(board.position.x, board.position.z - 1.5);
    }
    // Lighthouse beams sweep round.
    this.beamTime += dt;
    for (const chunk of this.chunks) if (chunk.beam.visible) chunk.beam.rotation.y = this.beamTime * 0.9 * (chunk.mirrored ? -1 : 1);
  }

  /** Per-frame look: the painted distance follows the camera, the water ripples and catches the moon. */
  present(dt: number, focus: THREE.Vector3, night: number, resolution: { width: number; height: number }, zoom: number): void {
    this.water.update(dt, this.scroll, night, resolution);
    // The painted horizon sits where the far water's mist is on screen: lower as the view zooms out.
    this.backdrop.update(dt, this.dz, focus, night, resolution, HORIZON * Math.min(1.3, Math.max(0.7, zoom)));
    this.dz = 0;
  }

  /**
   * How dark it is at the camera (0 open sky, 1 deep in a rock cutting), so the moonlight can dim there and
   * the train's lamps take over.
   */
  darknessAt(z: number): number {
    let dark = 0;
    for (const chunk of this.chunks) {
      if (!chunk.template?.dark) continue;
      const z0 = chunk.z + this.scroll;
      const z1 = z0 + CHUNK;
      const inside = Math.min(z - z0, z1 - z) / DARK_FADE;
      dark = Math.max(dark, Math.min(1, Math.max(0, inside + 0.5)));
    }
    return dark;
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

  /** True where the platform (or a cutting's cliffs) is: ambient life stays out of those places too. */
  readonly isHiddenAt = (x: number, z: number): boolean => this.isHidden(x, z) || (x > 0 && this.darknessAt(z) > 0.3);

  private isHidden(x: number, z: number): boolean {
    const r = this.hideRegion;
    return !!r && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  }

  private makeTemplate(p: PieceBuild, variant: number): Template {
    const geo = (b: GeoBuilder): THREE.BufferGeometry | null => (b.isEmpty ? null : b.build());
    return {
      kind: p.kind,
      variant,
      base: p.base.build(),
      lake: geo(p.lake),
      land: geo(p.land),
      lakeGlow: geo(p.lakeGlow),
      landGlow: geo(p.landGlow),
      trees: p.trees,
      beacon: p.beacon,
      dark: p.dark,
    };
  }

  private makeChunk(index: number): Chunk {
    const group = new THREE.Group();
    const mesh = (material: THREE.Material, cast: boolean, reflect: boolean): THREE.Mesh => {
      const m = new THREE.Mesh(EMPTY, material);
      m.castShadow = cast;
      m.receiveShadow = true;
      if (reflect) m.layers.enable(REFLECT_LAYER);
      group.add(m);
      return m;
    };
    const beam = new THREE.Mesh(BEAM_GEOMETRY, BEAM_MATERIAL);
    beam.visible = false;
    beam.layers.enable(REFLECT_LAYER);
    group.add(beam);
    this.scrollRoot.add(group);
    return {
      group,
      base: mesh(MATERIALS.scenery, false, false),
      lake: mesh(MATERIALS.scenery, false, true),
      land: mesh(MATERIALS.scenery, false, true),
      lakeGlow: mesh(MATERIALS.lamps, false, true),
      landGlow: mesh(MATERIALS.lamps, false, true),
      beam,
      z: 0,
      template: null,
      mirrored: false,
      treeStart: TREE_SLOTS.map((slots) => index * slots),
      landHidden: false,
    };
  }

  /** The next piece from the deck: weighted by kind, never a kind too soon, never a look seen in the last minute. */
  private pick(): { template: number; mirrored: boolean } {
    const n = this.placed++;
    const options: { template: number; mirrored: boolean; weight: number }[] = [];
    this.templates.forEach((t, i) => {
      const def = PIECES.find((p) => p.kind === t.kind);
      if (!def) return;
      const last = this.lastOfKind.get(t.kind);
      if (last !== undefined && n - last <= def.gap) return;
      for (const mirrored of [false, true]) {
        if (this.recent.includes(i * 2 + (mirrored ? 1 : 0))) continue;
        options.push({ template: i, mirrored, weight: def.weight / def.variants / 2 });
      }
    });
    let choice: { template: number; mirrored: boolean };
    if (options.length === 0) {
      // Everything is on cooldown: the plainest piece, least recently seen.
      const shore = this.templates.findIndex((t) => t.kind === 'shore');
      choice = { template: shore, mirrored: n % 2 === 1 };
    } else {
      let total = 0;
      for (const o of options) total += o.weight;
      let roll = this.rng.next() * total;
      choice = options[options.length - 1];
      for (const o of options) {
        roll -= o.weight;
        if (roll <= 0) {
          choice = o;
          break;
        }
      }
    }
    this.lastOfKind.set(this.templates[choice.template].kind, n);
    this.recent.push(choice.template * 2 + (choice.mirrored ? 1 : 0));
    if (this.recent.length > NO_REPEAT) this.recent.shift();
    return choice;
  }

  private assign(chunk: Chunk): void {
    const { template: index, mirrored } = this.pick();
    const t = this.templates[index];
    chunk.template = t;
    chunk.mirrored = mirrored;
    chunk.group.position.z = chunk.z + (mirrored ? CHUNK : 0);
    chunk.group.scale.z = mirrored ? -1 : 1;
    const set = (mesh: THREE.Mesh, geometry: THREE.BufferGeometry | null): void => {
      mesh.geometry = geometry ?? EMPTY;
      mesh.visible = geometry !== null;
    };
    set(chunk.base, t.base);
    set(chunk.lake, t.lake);
    set(chunk.land, t.land);
    set(chunk.lakeGlow, t.lakeGlow);
    set(chunk.landGlow, t.landGlow);
    chunk.beam.visible = t.beacon !== null;
    if (t.beacon) chunk.beam.position.copy(t.beacon);
    chunk.landHidden = false;
    this.writeTrees(chunk);
  }

  /** Writes a chunk's trees into the instanced meshes (hidden ones, and unused slots, at zero scale). */
  private writeTrees(chunk: Chunk): void {
    const t = chunk.template;
    const used = [0, 0, 0];
    const worldOffset = this.scroll;
    if (t) {
      for (const spot of t.trees) {
        const k = spot.kind;
        if (used[k] >= TREE_SLOTS[k]) continue;
        const z = chunk.z + (chunk.mirrored ? CHUNK - spot.z : spot.z);
        const hidden = spot.land && this.isHidden(spot.x, z + worldOffset);
        const s = hidden ? 0 : spot.scale;
        dummy.position.set(spot.x, 0, z);
        dummy.rotation.set(0, spot.rot, 0);
        dummy.scale.set(s, s * (k === 1 ? 1.1 : 1), s);
        dummy.updateMatrix();
        this.trees[k].setMatrixAt(chunk.treeStart[k] + used[k], dummy.matrix);
        used[k]++;
      }
    }
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let k = 0; k < this.trees.length; k++) {
      for (let i = used[k]; i < TREE_SLOTS[k]; i++) this.trees[k].setMatrixAt(chunk.treeStart[k] + i, dummy.matrix);
      this.trees[k].instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * The platform's region moves with the scenery, so which pieces it covers only changes when it is first
   * set (far ahead, off screen) or cleared: re-check then, and when a piece comes round.
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
      chunk.land.visible = !hide && chunk.template?.land !== null;
      chunk.landGlow.visible = !hide && chunk.template?.landGlow !== null;
      this.writeTrees(chunk);
    }
  }

  private writeSleepers(): void {
    const count = this.sleepers.count;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, SPAN_MIN - 20 + i * 0.7 + this.sleeperOffset);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.sleepers.setMatrixAt(i, dummy.matrix);
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }
}

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
