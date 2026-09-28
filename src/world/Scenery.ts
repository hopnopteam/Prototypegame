import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

const TEXTURE_METRES = 40;
const TRACK_CLEAR_X = 3.4;

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
const scatter = (minX: number, maxX: number, scaleVariance = 0.35): Placer => (kind, i, rng, span) => {
  const side = rng.chance(0.5) ? -1 : 1;
  kind.x[i] = side * Math.max(TRACK_CLEAR_X, rng.range(minX, maxX));
  kind.z[i] = rng.range(span.zMin, span.zMax);
  kind.rot[i] = rng.range(0, Math.PI * 2);
  kind.scale[i] = 1 + rng.range(-scaleVariance, scaleVariance);
};

/** Evenly spaced along one or more lines (poles, fence posts). */
const lines = (xs: number[], spacing: number): Placer => (kind, i, _rng, span) => {
  const k = Math.floor(i / xs.length);
  kind.x[i] = xs[i % xs.length];
  kind.z[i] = span.zMin + k * spacing;
  kind.rot[i] = 0;
  kind.scale[i] = 1;
};

/**
 * Countryside that scrolls past the (stationary) train: ground texture, sleepers, and instanced props that
 * wrap around when they leave the view. Everything moves by one speed value, so the platform and the
 * scenery can never drift apart.
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

  constructor() {
    this.groundTexture = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 260).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: this.groundTexture }),
    );
    ground.position.set(0, -0.01, 0);
    this.groundTexture.repeat.set(120 / TEXTURE_METRES, 260 / TEXTURE_METRES);
    this.group.add(ground);

    // Track bed and rails. Rails are uniform along z, so they can stay put while the sleepers scroll.
    const bed = new GeoBuilder();
    bed.box(0, 0.04, 0, 3.8, 0.08, 260, PALETTE.ballast);
    for (const x of [-0.72, 0.72]) bed.box(x, 0.22, 0, 0.1, 0.12, 260, PALETTE.rail);
    // Telegraph wires along the left, also uniform.
    for (const y of [4.1, 4.35]) bed.box(-5.2, y, 0, 0.02, 0.02, 260, '#3A3A3A');
    // Fence rails on both sides.
    for (const x of [-7.5, 15]) for (const y of [0.35, 0.65]) bed.box(x, y, 0, 0.05, 0.06, 260, '#E8DCC6');
    this.group.add(new THREE.Mesh(bed.build(), MATERIALS.solid));

    const sleeperGeo = new GeoBuilder().box(0, 0.12, 0, 2.2, 0.08, 0.26, PALETTE.sleeper).build();
    this.sleepers = new THREE.InstancedMesh(sleeperGeo, MATERIALS.solid, 380);
    this.sleepers.frustumCulled = false;
    this.group.add(this.sleepers);

    this.addKind(treeGeometry(), 90, scatter(6, 40));
    this.addKind(roundTreeGeometry(), 70, scatter(6, 40));
    this.addKind(bushGeometry(), 90, scatter(4.2, 22));
    this.addKind(poleGeometry(), 11, lines([-5.2], 26));
    this.addKind(fencePostGeometry(), 124, lines([-7.5, 15], 3.8));
    this.addKind(cottageGeometry(), 8, scatter(16, 34, 0.1));
    this.addKind(haystackGeometry(), 26, scatter(9, 30));
    this.addKind(sheepGeometry(), 22, scatter(8, 16));
    this.addKind(flowerGeometry(), 80, scatter(3.6, 12, 0.3));

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

    this.riverZ += dz;
    if (this.riverZ > this.span.zMax + 10) this.riverZ = this.span.zMin - 250 - this.rng.range(0, 350);
    this.river.position.z = this.riverZ;
    this.river.visible = this.riverZ > this.span.zMin - 20 && this.riverZ < this.span.zMax + 10;
  }

  private isHidden(x: number, z: number): boolean {
    const r = this.hideRegion;
    if (r && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return Math.abs(z - this.riverZ) < 5.5 && Math.abs(x) < 60;
  }

  private addKind(geometry: THREE.BufferGeometry, count: number, place: Placer): void {
    const mesh = new THREE.InstancedMesh(geometry, MATERIALS.solid, count);
    mesh.frustumCulled = false;
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

function makeGroundTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, size, size);
  // Mowing stripes.
  ctx.fillStyle = PALETTE.grassDark;
  for (let y = 0; y < size; y += 64) ctx.fillRect(0, y, size, 32);
  // Field patches.
  const rng = new Rng(7);
  const colors = [PALETTE.wheat, PALETTE.fieldGreen, '#C9B25A', '#9DBD5C'];
  for (let i = 0; i < 7; i++) {
    const w = rng.range(90, 200);
    const h = rng.range(80, 190);
    const x = rng.pick([rng.range(0, 150), rng.range(330, 470)]);
    const y = rng.range(0, size - h);
    ctx.fillStyle = rng.pick(colors);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 3;
    for (let k = 10; k < w; k += 14) {
      ctx.beginPath();
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k, y + h);
      ctx.stroke();
    }
  }
  // Soft verge beside the track, in the middle of the texture across x.
  ctx.fillStyle = 'rgba(214, 196, 150, 0.55)';
  ctx.fillRect(size / 2 - 38, 0, 76, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function treeGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 0.5, 0, 0.14, 0.18, 1.0, PALETTE.wood, 6)
    .cone(0, 1.6, 0, 1.0, 1.6, '#4E7F3A', 7)
    .cone(0, 2.5, 0, 0.72, 1.3, '#5E9243', 7)
    .build();
}

function roundTreeGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 0.6, 0, 0.14, 0.2, 1.2, PALETTE.wood, 6)
    .sphere(0, 1.9, 0, 1.05, '#6FA24A', 0)
    .sphere(0.45, 2.3, 0.2, 0.6, '#7DB050', 0)
    .build();
}

function bushGeometry(): THREE.BufferGeometry {
  return new GeoBuilder().sphere(0, 0.35, 0, 0.5, '#5E9243', 0).sphere(0.35, 0.3, 0.1, 0.35, '#6FA24A', 0).build();
}

function poleGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .cylinder(0, 2.2, 0, 0.09, 0.12, 4.4, '#6B4E36', 6)
    .box(0, 4.2, 0, 0.9, 0.08, 0.1, '#6B4E36')
    .build();
}

function fencePostGeometry(): THREE.BufferGeometry {
  return new GeoBuilder().box(0, 0.4, 0, 0.1, 0.8, 0.1, '#E8DCC6').build();
}

function cottageGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .box(0, 1.1, 0, 3.4, 2.2, 4.2, PALETTE.cream)
    .prism(0, 2.2, 0, 3.8, 1.6, 4.6, PALETTE.roofSlate)
    .box(1.71, 1.2, -0.8, 0.04, 0.8, 0.7, '#6A7D8C')
    .box(1.71, 1.2, 0.9, 0.04, 0.8, 0.7, '#6A7D8C')
    .box(1.0, 3.3, 1.2, 0.4, 0.9, 0.4, PALETTE.brick)
    .build();
}

function haystackGeometry(): THREE.BufferGeometry {
  return new GeoBuilder().cylinder(0, 0.5, 0, 0.6, 0.6, 1.0, PALETTE.wheat, 10, 'x').build();
}

function sheepGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .sphere(0, 0.45, 0, 0.38, '#F4F1EA', 0)
    .sphere(0, 0.5, 0.38, 0.17, '#3A3230', 0)
    .box(-0.15, 0.15, 0.12, 0.08, 0.3, 0.08, '#3A3230')
    .box(0.15, 0.15, -0.12, 0.08, 0.3, 0.08, '#3A3230')
    .build();
}

function flowerGeometry(): THREE.BufferGeometry {
  return new GeoBuilder()
    .box(0, 0.12, 0, 0.04, 0.24, 0.04, '#4E7F3A')
    .sphere(0, 0.27, 0, 0.09, '#F2C94C', 0)
    .sphere(0.25, 0.2, 0.15, 0.08, '#E26D8C', 0)
    .sphere(-0.2, 0.22, -0.1, 0.08, '#FFFFFF', 0)
    .build();
}

function buildRiver(): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.box(0, 0.005, 0, 120, 0.02, 8, '#6FB4D8');
  b.box(0, 0.012, -2.2, 120, 0.02, 0.6, '#9ED1EA');
  b.box(0, 0.012, 1.6, 120, 0.02, 0.4, '#9ED1EA');
  // Bridge girders either side of the track.
  for (const x of [-2.1, 2.1]) {
    b.box(x, 0.6, 0, 0.2, 0.2, 10, '#5A5560');
    for (let k = -4; k <= 4; k += 2) b.box(x, 0.35, k, 0.16, 0.7, 0.16, '#5A5560');
  }
  b.box(0, 0.08, 0, 3.8, 0.12, 10, PALETTE.ballast);
  group.add(new THREE.Mesh(b.build(), MATERIALS.solid));
  return group;
}
