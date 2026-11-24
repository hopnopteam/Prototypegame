import * as THREE from 'three';
import type { Rect } from '../core/types';
import { FLOOR_Y } from './CarriageView';
import { sandPatch } from './Floors';
import type { CarriageLayout } from './layout';
import { sandHeight } from './Sand';

/**
 * Footprints in the sand (the Riviera revamp; owner: "proper sand… that behaves well too"). Everyone walking on a sand
 * floor leaves prints, left and right in turn, turned the way they walk; each stays a while and fades as the sand
 * settles. One instanced draw from a fixed pool (the oldest print is reused), multiplied over the sand: the print's
 * texture is white outside the foot, so it can only ever darken the sand under it (never a square on any device).
 *
 * Visual only: it reads positions after each simulation step and uses no game randomness.
 */
export const PRINTS = {
  /** How many prints can lie in the sand at once. */
  pool: 260,
  /** Distance walked between two prints (m), and how far apart the feet are (m). */
  stride: 0.38,
  gauge: 0.09,
  /** A print's size (m), how dark it is (×sand), how long it lies, and how long its last fade takes (s). */
  length: 0.26,
  width: 0.12,
  depth: 0.62,
  life: 16,
  fade: 6,
};

interface Walker {
  x: number;
  z: number;
  walked: number;
  left: boolean;
}

interface Patch {
  originZ: number;
  area: Rect;
  holes: Rect[];
  walls: Rect[];
  seed: number;
}

function footTexture(): THREE.CanvasTexture {
  // A bare foot from above, heel at the bottom: white is untouched sand, darker is pressed in (the toes a little less).
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 32, 64);
  ctx.filter = 'blur(1.2px)';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(16, 46, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(17, 27, 8.5, 12, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#444';
  for (const [x, y, r] of [[12, 10, 3.4], [17, 9, 2.8], [21, 10, 2.5], [24.5, 12.5, 2.1], [26.5, 16, 1.8]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class SandPrints {
  readonly mesh: THREE.InstancedMesh;
  private readonly born: Float32Array;
  private readonly fade: THREE.InstancedBufferAttribute;
  private next = 0;
  private lastPress = -1e9;
  private clock = 0;
  private patches: Patch[] = [];
  private readonly walkers = new Map<object, Walker>();
  private readonly dummy = new THREE.Object3D();

  constructor() {
    const g = new THREE.PlaneGeometry(PRINTS.width, PRINTS.length);
    g.rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS.pool), 1);
    g.setAttribute('aFade', this.fade);
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: footTexture() }, uDepth: { value: PRINTS.depth } },
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = aFade;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uDepth;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float press = (1.0 - texture2D(uMap, vUv).r) * vFade;
          // Pressed sand is a little darker and warmer (in shadow, damp underneath); multiplied over the sand.
          gl_FragColor = vec4(mix(vec3(1.0), vec3(uDepth, uDepth * 0.95, uDepth * 0.88), press), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      blendEquation: THREE.AddEquation,
      toneMapped: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(g, material, PRINTS.pool);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.born = new Float32Array(PRINTS.pool).fill(-1e9);
    // Every instance starts parked far below the world.
    this.dummy.position.set(0, -100, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < PRINTS.pool; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  /** The sand floors of the train as it stands (call when the train changes). */
  setTrain(carriages: readonly { layout: CarriageLayout; tier: number; originZ: number; index: number }[]): void {
    this.patches = [];
    for (const c of carriages) {
      // Same floor tier and seed as CarriageView's floor.
      const sand = sandPatch(c.layout, c.tier, c.index * 7 + c.layout.type.length);
      if (sand) this.patches.push({ originZ: c.originZ, area: sand.area, holes: sand.holes, walls: c.layout.walls.map((w) => ({ x0: w.x0, z0: w.z0, x1: w.x1, z1: w.z1 })), seed: sand.seed });
    }
  }

  /** Whether the train has any sand floor (callers skip `track` without one). */
  get active(): boolean {
    return this.patches.length > 0;
  }

  /** Where a walker stands after a step: prints are pressed along the way it went. */
  track(key: object, x: number, z: number): boolean {
    return this.walk(key, x, z);
  }

  /** Ages the prints (once a step). */
  update(dt: number): void {
    this.clock += dt;
    // Nothing to age once the last print has gone (and on a train with no sand, nothing ever is).
    if (this.clock - this.lastPress > PRINTS.life + 1) return;
    for (let i = 0; i < PRINTS.pool; i++) {
      const age = this.clock - this.born[i];
      this.fade.setX(i, age > PRINTS.life ? 0 : Math.min(1, (PRINTS.life - age) / PRINTS.fade));
    }
    this.fade.needsUpdate = true;
  }

  /** True when a print was pressed. */
  private walk(key: object, x: number, z: number): boolean {
    if (!this.patches.length) return false;
    let w = this.walkers.get(key);
    if (!w) {
      w = { x, z, walked: 0, left: false };
      this.walkers.set(key, w);
      return false;
    }
    const dx = x - w.x;
    const dz = z - w.z;
    const step = Math.hypot(dx, dz);
    w.x = x;
    w.z = z;
    // A jump (a teleport, a respawn) leaves no trail.
    if (step > 0.6 || step < 1e-4) return false;
    w.walked += step;
    if (w.walked < PRINTS.stride) return false;
    w.walked -= PRINTS.stride;
    w.left = !w.left;
    const heading = Math.atan2(dx, dz);
    const side = (w.left ? 1 : -1) * PRINTS.gauge;
    const px = x + Math.cos(heading) * side;
    const pz = z - Math.sin(heading) * side;
    return this.press(px, pz, heading);
  }

  private press(x: number, z: number, heading: number): boolean {
    const p = this.patches.find((q) => {
      const lz = z - q.originZ;
      return x > q.area.x0 + 0.05 && x < q.area.x1 - 0.05 && lz > q.area.z0 + 0.05 && lz < q.area.z1 - 0.05 && !q.holes.some((h) => x > h.x0 && x < h.x1 && lz > h.z0 && lz < h.z1);
    });
    if (!p) return false;
    const lz = z - p.originZ;
    const y = FLOOR_Y + sandHeight(p.walls, x, lz, p.seed) + 0.004;
    const i = this.next;
    this.next = (this.next + 1) % PRINTS.pool;
    this.dummy.position.set(x, y, z);
    // The toes point the way they walk (the texture's toes are at the plane's −z).
    this.dummy.rotation.set(0, heading + Math.PI, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born[i] = this.clock;
    this.lastPress = this.clock;
    return true;
  }
}
