import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { GeoBuilder } from './geo';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';

const TEXTURE_METRES = 40;
const TRACK_CLEAR_X = 3.4;
/** An avenue of identical trees either side of the line: the storybook symmetry. */
const AVENUE_X = 7.6;
/** Billboards stand just beyond the ballast, alternating sides, where the camera always catches them. */
const BILLBOARD_X = 3.75;
const BILLBOARD_W = 2.3;
const BILLBOARD_H = 1.2;
const CAST_SCENERY_SHADOWS = false;

interface PropKind {
  mesh: THREE.InstancedMesh;
  x: Float32Array;
  z: Float32Array;
  rot: Float32Array;
  scale: Float32Array;
  hidden: Uint8Array;
  /** Places instance i. Recycled props keep their z; placement only re-rolls the rest. */
  place: (kind: PropKind, i: number, rng: Rng, span: { zMin: number; zMax: number }) => void;
}

type Placer = PropKind['place'];

const dummy = new THREE.Object3D();

/** Random position on either side of the track. */
const scatter = (minX: number, maxX: number, scaleVariance = 0.3): Placer => (kind, i, rng, span) => {
  const side = rng.chance(0.5) ? -1 : 1;
  kind.x[i] = side * Math.max(TRACK_CLEAR_X, rng.range(minX, maxX));
  kind.z[i] = rng.range(span.zMin, span.zMax);
  kind.rot[i] = rng.range(0, Math.PI * 2);
  kind.scale[i] = 1 + rng.range(-scaleVariance, scaleVariance);
};

/** Evenly spaced along one or more lines (poles, fence posts, avenues). */
const lines = (xs: number[], spacing: number, rotation = 0): Placer => (kind, i, _rng, span) => {
  const k = Math.floor(i / xs.length);
  kind.x[i] = xs[i % xs.length];
  kind.z[i] = span.zMin + k * spacing;
  kind.rot[i] = rotation;
  kind.scale[i] = 1;
};

/**
 * Countryside that scrolls past the (stationary) train: a patchwork of fields with hedgerows, an avenue of
 * lollipop trees either side of the line, pastel cottages, bales and sheep, all instanced and wrapped
 * around as they leave the view. Everything moves by one speed value, so the platform and the scenery can
 * never drift apart.
 */
export class Scenery {
  readonly group = new THREE.Group();
  private readonly groundTexture: THREE.CanvasTexture;
  private readonly kinds: PropKind[] = [];
  private readonly sleepers: THREE.InstancedMesh;
  private sleeperOffset = 0;
  private readonly span = { zMin: -75, zMax: 60 };
  private readonly rng = new Rng(20260928);
  private hideRegion: { x0: number; x1: number; z0: number; z1: number } | null = null;
  private readonly river: THREE.Group;
  private riverZ = -400;
  /** Roadside billboards for the player's train (a marketing upgrade), scrolling with the countryside. */
  private readonly billboards: THREE.Group[] = [];
  private readonly billboardMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });

  constructor() {
    this.groundTexture = makeGroundTexture();
    MATERIALS.ground.map = this.groundTexture;
    MATERIALS.ground.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 260).rotateX(-Math.PI / 2), MATERIALS.ground);
    ground.position.set(0, -0.01, 0);
    ground.receiveShadow = true;
    this.groundTexture.repeat.set(120 / TEXTURE_METRES, 260 / TEXTURE_METRES);
    this.group.add(ground);

    // Track bed and rails. Rails are uniform along z, so they can stay put while the sleepers scroll.
    const bed = new GeoBuilder();
    bed.box(0, 0.05, 0, 3.9, 0.1, 260, PALETTE.ballast, 0, { pattern: PATTERN.dots, color2: PALETTE.ballastDark, scale: 0.12, shade: 1 });
    for (const x of [-0.72, 0.72]) {
      bed.box(x, 0.22, 0, 0.1, 0.12, 260, PALETTE.rail, 0, { shade: 0.8 });
      bed.box(x, 0.285, 0, 0.07, 0.012, 260, PALETTE.railTop, 0, { shade: 1 });
    }
    // Telegraph wires along the left, also uniform.
    for (const y of [4.1, 4.35]) bed.box(-5.2, y, 0, 0.02, 0.02, 260, '#4A4452', 0, { shade: 1 });
    // White fence rails either side.
    for (const x of [-6.3, 6.3]) for (const y of [0.35, 0.62]) bed.box(x, y, 0, 0.05, 0.05, 260, PALETTE.stationTrim, 0, { shade: 1 });
    const bedMesh = new THREE.Mesh(bed.build(), MATERIALS.scenery);
    bedMesh.receiveShadow = true;
    this.group.add(bedMesh);

    const sleeperGeo = new GeoBuilder().box(0, 0.12, 0, 2.2, 0.08, 0.26, PALETTE.sleeper, 0, { shade: 0.8 }).build();
    this.sleepers = new THREE.InstancedMesh(sleeperGeo, MATERIALS.scenery, 380);
    this.sleepers.frustumCulled = false;
    this.sleepers.receiveShadow = true;
    this.group.add(this.sleepers);

    this.addKind(lollipopGeometry(PALETTE.treeGreen, PALETTE.treeLight), 52, lines([-AVENUE_X, AVENUE_X], 5.5), true);
    this.addKind(lollipopGeometry(PALETTE.blossom, '#F7CAD3'), 40, scatter(11, 40), true);
    this.addKind(lollipopGeometry(PALETTE.treeGreen, PALETTE.treeLight), 60, scatter(11, 40), true);
    this.addKind(cypressGeometry(), 50, scatter(10, 38, 0.25), true);
    this.addKind(hedgeBushGeometry(), 70, scatter(4.4, 5.8, 0.3));
    this.addKind(poleGeometry(), 11, lines([-5.2], 26));
    this.addKind(fencePostGeometry(), 150, lines([-6.3, 6.3], 2.0));
    PALETTE.cottageWalls.slice(0, 3).forEach((wall, i) => this.addKind(cottageGeometry(wall, PALETTE.cottageRoofs[i]), 3, scatter(15, 32, 0.08), true));
    this.addKind(baleGeometry(), 26, scatter(9, 30, 0.15), true);
    this.addKind(sheepGeometry(), 22, scatter(8.5, 18, 0.15), true);
    this.addKind(flowerGeometry(), 60, scatter(3.8, 12, 0.3));

    this.river = buildRiver();
    this.group.add(this.river);
    this.setSpan(14);
  }

  /** Called when the train grows, so props cover its whole length. */
  setSpan(trainRearZ: number): void {
    this.span.zMin = -75;
    this.span.zMax = trainRearZ + 45;
    for (const kind of this.kinds) {
      for (let i = 0; i < kind.x.length; i++) kind.place(kind, i, this.rng, this.span);
      this.writeKind(kind);
    }
    this.writeSleepers();
  }

  /** Props inside this region are hidden (the station platform and building occupy it). */
  setHiddenRegion(region: { x0: number; x1: number; z0: number; z1: number } | null): void {
    this.hideRegion = region;
  }

  update(dt: number, speed: number): void {
    const dz = speed * dt;
    this.groundTexture.offset.y += dz / TEXTURE_METRES;
    const length = this.span.zMax - this.span.zMin;
    for (const kind of this.kinds) {
      let dirty = dz !== 0;
      for (let i = 0; i < kind.z.length; i++) {
        kind.z[i] += dz;
        if (kind.z[i] > this.span.zMax) {
          const wrappedZ = kind.z[i] - length;
          kind.place(kind, i, this.rng, this.span);
          kind.z[i] = wrappedZ;
        }
        const hide = this.isHidden(kind.x[i], kind.z[i]) ? 1 : 0;
        if (hide !== kind.hidden[i]) {
          kind.hidden[i] = hide;
          dirty = true;
        }
      }
      if (dirty) this.writeKind(kind);
    }
    if (dz !== 0) {
      this.sleeperOffset = (this.sleeperOffset + dz) % 0.7;
      this.writeSleepers();
    }

    const span = this.span.zMax - this.span.zMin;
    for (const board of this.billboards) {
      board.position.z += dz;
      if (board.position.z > this.span.zMax) board.position.z -= span;
      board.visible = !this.isHidden(board.position.x, board.position.z) && !this.isHidden(board.position.x, board.position.z - 1.5);
    }

    this.riverZ += dz;
    if (this.riverZ > this.span.zMax + 10) this.riverZ = this.span.zMin - 250 - this.rng.range(0, 350);
    this.river.position.z = this.riverZ;
    this.river.visible = this.riverZ > this.span.zMin - 20 && this.riverZ < this.span.zMax + 10;
  }

  /** Shows `count` billboards with this poster (null removes them). They sit on the far side of the line. */
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
      board.position.set(i % 2 === 0 ? -BILLBOARD_X : BILLBOARD_X, 0, this.span.zMin + ((i + 0.5) / wanted) * (this.span.zMax - this.span.zMin));
      this.group.add(board);
      this.billboards.push(board);
    }
    while (this.billboards.length > wanted) {
      const board = this.billboards.pop();
      if (board) this.group.remove(board);
    }
  }

  /** True where the platform (or the river) is: ambient life stays out of those places too. */
  readonly isHiddenAt = (x: number, z: number): boolean => this.isHidden(x, z);

  private isHidden(x: number, z: number): boolean {
    const r = this.hideRegion;
    if (r && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return Math.abs(z - this.riverZ) < 5.5 && Math.abs(x) < 60;
  }

  private addKind(geometry: THREE.BufferGeometry, count: number, place: Placer, castShadow = false): void {
    const mesh = new THREE.InstancedMesh(geometry, MATERIALS.scenery, count);
    mesh.frustumCulled = false;
    // Instanced scenery is never culled, so casting would redraw every tree into the shadow map.
    mesh.castShadow = castShadow && CAST_SCENERY_SHADOWS;
    this.kinds.push({
      mesh,
      x: new Float32Array(count),
      z: new Float32Array(count),
      rot: new Float32Array(count),
      scale: new Float32Array(count),
      hidden: new Uint8Array(count),
      place,
    });
    this.group.add(mesh);
  }

  private writeKind(kind: PropKind): void {
    for (let i = 0; i < kind.x.length; i++) {
      const s = kind.hidden[i] ? 0 : kind.scale[i];
      dummy.position.set(kind.x[i], 0, kind.z[i]);
      dummy.rotation.set(0, kind.rot[i], 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      kind.mesh.setMatrixAt(i, dummy.matrix);
    }
    kind.mesh.instanceMatrix.needsUpdate = true;
  }

  private writeSleepers(): void {
    const count = this.sleepers.count;
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, this.span.zMin - 20 + i * 0.7 + this.sleeperOffset);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.sleepers.setMatrixAt(i, dummy.matrix);
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }
}

/**
 * The patchwork: fields of sage, mustard, lavender and clover in neat plots with crop rows and dark
 * hedgerows between them, a sandy verge beside the line. Tiles seamlessly in both directions.
 */
function makeGroundTexture(): THREE.CanvasTexture {
  const size = 1024;
  const perMetre = size / TEXTURE_METRES;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE.meadow;
  ctx.fillRect(0, 0, size, size);
  const rng = new Rng(7);
  const fields = [PALETTE.meadow, PALETTE.wheat, PALETTE.mintField, PALETTE.lavender, PALETTE.mustardField, PALETTE.clover, PALETTE.meadowDark, PALETTE.ploughed];
  const track = size / 2;
  const clear = TRACK_CLEAR_X * perMetre;
  // Two columns of plots on each side of the line; each column is a stack of plots that sums to the tile.
  const columns: [number, number][] = [[0, track - clear - 150], [track - clear - 150, track - clear], [track + clear, track + clear + 150], [track + clear + 150, size]];
  for (const [x0, x1] of columns) {
    let y = 0;
    while (y < size) {
      const h = Math.min(size - y, size - y < 260 ? size - y : rng.range(150, 330));
      const color = rng.pick(fields);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y, x1 - x0, h);
      // Crop rows, alternating direction plot by plot.
      ctx.strokeStyle = 'rgba(60, 50, 30, 0.1)';
      ctx.lineWidth = 3;
      const vertical = rng.chance(0.5);
      for (let k = 10; k < (vertical ? x1 - x0 : h); k += 13) {
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(x0 + k, y + 4);
          ctx.lineTo(x0 + k, y + h - 4);
        } else {
          ctx.moveTo(x0 + 4, y + k);
          ctx.lineTo(x1 - 4, y + k);
        }
        ctx.stroke();
      }
      // Hedgerow along the plot's top edge.
      ctx.fillStyle = PALETTE.hedge;
      ctx.fillRect(x0, y, x1 - x0, 7);
      ctx.fillStyle = PALETTE.hedgeDark;
      ctx.fillRect(x0, y + 5, x1 - x0, 2);
      y += h;
    }
    ctx.fillStyle = PALETTE.hedge;
    ctx.fillRect(x1 - 4, 0, 7, size);
  }
  // The verge beside the track: sandy, with a mown grass edge.
  ctx.fillStyle = PALETTE.verge;
  ctx.fillRect(track - clear, 0, clear * 2, size);
  ctx.fillStyle = PALETTE.meadowDark;
  ctx.fillRect(track - clear, 0, 16, size);
  ctx.fillRect(track + clear - 16, 0, 16, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function lollipopGeometry(crown: string, highlight: string): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 0.75, 0, 0.11, 0.15, 1.5, PALETTE.trunk, 8)
    .sphere(0, 2.15, 0, 1.0, crown, 1, 0.95, { shade: 0.72 })
    .sphere(-0.3, 2.45, 0.35, 0.42, highlight, 1, 1, { shade: 1 })
    .build();
}

function cypressGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 0.3, 0, 0.1, 0.12, 0.6, PALETTE.trunk, 6)
    .sphere(0, 2.0, 0, 0.62, PALETTE.cypress, 1, 2.6, { shade: 0.7 })
    .build();
}

function hedgeBushGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .sphere(0, 0.36, 0, 0.5, PALETTE.hedge, 0, 0.85, { shade: 0.75 })
    .sphere(0.38, 0.3, 0.12, 0.34, PALETTE.treeGreen, 0, 0.9, { shade: 0.8 })
    .build();
}

function poleGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 2.2, 0, 0.08, 0.11, 4.4, '#6B4E36', 8)
    .box(0, 4.2, 0, 0.9, 0.07, 0.09, '#6B4E36', 0, { shade: 1 })
    .build();
}

function fencePostGeometry(): THREE.BufferGeometry {
  return new GeoBuilder().box(0, 0.38, 0, 0.08, 0.76, 0.08, PALETTE.stationTrim, 0, { shade: 0.85 }).cone(0, 0.8, 0, 0.06, 0.1, PALETTE.stationTrim, 4).build();
}

function cottageGeometry(walls: string, roof: string): THREE.BufferGeometry {
  return new GeoBuilder()
    .box(0, 1.1, 0, 3.4, 2.2, 4.2, walls, 0, { shade: 0.8 })
    .prism(0, 2.2, 0, 3.9, 1.7, 4.7, roof, { pattern: PATTERN.stripesZ, color2: shadeHex(roof, -20), scale: 0.3, shade: 1 })
    .box(1.71, 1.2, -0.9, 0.04, 0.8, 0.7, PALETTE.stationTrim, 0, { shade: 1 })
    .box(1.73, 1.2, -0.9, 0.03, 0.66, 0.56, PALETTE.windowDay, 0, { shade: 1 })
    .box(1.71, 1.2, 0.9, 0.04, 0.8, 0.7, PALETTE.stationTrim, 0, { shade: 1 })
    .box(1.73, 1.2, 0.9, 0.03, 0.66, 0.56, PALETTE.windowDay, 0, { shade: 1 })
    .box(1.72, 0.6, 0, 0.04, 1.2, 0.8, shadeHex(roof, -10), 0, { shade: 1 })
    .box(1.0, 3.4, 1.2, 0.4, 0.9, 0.4, PALETTE.stationTrim, 0, { shade: 0.85 })
    .build();
}

function baleGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 0.5, 0, 0.55, 0.55, 1.0, PALETTE.wheat, 16, 'x', { shade: 0.8 })
    .cylinder(0.505, 0.5, 0, 0.46, 0.46, 0.02, '#D9B454', 16, 'x', { shade: 1 })
    .build();
}

function sheepGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.sphere(0, 0.46, 0, 0.36, PALETTE.sheep, 0, 0.85, { shade: 0.8 });
  for (const [x, z] of [[0.2, 0.15], [-0.2, 0.12], [0.15, -0.2], [-0.18, -0.18]]) b.sphere(x, 0.58, z, 0.18, PALETTE.sheep, 0, 1, { shade: 0.9 });
  b.sphere(0, 0.5, 0.36, 0.15, PALETTE.sheepFace, 0, 1.1);
  for (const [x, z] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.14], [0.14, -0.14]]) b.box(x, 0.13, z, 0.07, 0.26, 0.07, PALETTE.sheepFace, 0, { shade: 0.9 });
  return b.build();
}

function flowerGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .sphere(0, 0.16, 0, 0.2, PALETTE.hedge, 0, 0.7, { shade: 0.8 })
    .sphere(0, 0.3, 0, 0.07, PALETTE.mustard, 0)
    .sphere(0.16, 0.26, 0.1, 0.06, PALETTE.blossom, 0)
    .sphere(-0.14, 0.27, -0.08, 0.06, PALETTE.linen, 0)
    .sphere(0.05, 0.28, -0.15, 0.06, PALETTE.lavender, 0)
    .build();
}

function buildRiver(): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.box(0, 0.005, 0, 120, 0.02, 8, PALETTE.water, 0, { pattern: PATTERN.stripesZ, color2: '#9DCFE3', scale: 0.8, shade: 1 });
  b.box(0, 0.012, -3.9, 120, 0.02, 0.5, PALETTE.waterLight, 0, { shade: 1 });
  b.box(0, 0.012, 3.9, 120, 0.02, 0.5, PALETTE.waterLight, 0, { shade: 1 });
  // A little iron bridge painted navy, with a brass rail.
  for (const x of [-2.1, 2.1]) {
    b.box(x, 0.62, 0, 0.18, 0.18, 10, PALETTE.navy, 0, { shade: 1 });
    b.box(x, 0.73, 0, 0.2, 0.03, 10, PALETTE.gold, 0, { shade: 1 });
    for (let k = -4; k <= 4; k += 1) b.box(x, 0.35, k, 0.12, 0.7, 0.12, PALETTE.navy, 0, { shade: 0.85 });
  }
  b.box(0, 0.08, 0, 3.9, 0.12, 10, PALETTE.ballast, 0, { shade: 1 });
  const mesh = new THREE.Mesh(b.build(), MATERIALS.scenery);
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** A billboard on two posts, leaning back toward the camera; the poster face shares one material. */
function buildBillboard(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const y0 = 0.95;
  for (const dx of [-BILLBOARD_W * 0.35, BILLBOARD_W * 0.35]) b.box(dx, (y0 + BILLBOARD_H) / 2, -0.08, 0.1, y0 + BILLBOARD_H, 0.1, '#6B5A4A', 0, { shade: 0.85 });
  b.box(0, y0 + BILLBOARD_H / 2, -0.06, BILLBOARD_W + 0.16, BILLBOARD_H + 0.16, 0.05, '#F4EEE2', 0, { shade: 0.9 });
  b.box(0, y0 - 0.05, 0.1, BILLBOARD_W + 0.1, 0.05, 0.3, '#6B5A4A', 0, { shade: 1 });
  const frame = new THREE.Mesh(b.build(), MATERIALS.scenery);
  frame.castShadow = CAST_SCENERY_SHADOWS;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BILLBOARD_W, BILLBOARD_H), material);
  face.position.set(0, y0 + BILLBOARD_H / 2, -0.03);
  group.add(frame, face);
  group.rotation.x = -0.28;
  return group;
}
