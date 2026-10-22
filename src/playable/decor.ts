// The playable's own furniture, built from the game's kit (GeoBuilder, the shared materials): the in-room upgrades
// (a standing lamp, a big bouquet, a minibar: each big enough to see from the gameplay camera), the newsstand, the
// shoe-shine stand and the mess a washroom guest leaves. Every piece is a group pivoting on the floor at its base, so
// it can grow in with a bounce.
import * as THREE from 'three';
import type { Rect } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import { GeoBuilder } from '../world/geo';
import { MATERIALS } from '../world/materials';

const FLAT = { shade: 1 } as const;

function group(solid: GeoBuilder, glow: GeoBuilder | null, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, FLOOR_Y, z);
  if (!solid.isEmpty) {
    const mesh = new THREE.Mesh(solid.build(), MATERIALS.solid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  if (glow && !glow.isEmpty) g.add(new THREE.Mesh(glow.build(), MATERIALS.lamps));
  return g;
}

/** A soft warm pool of light on the floor (added light only: it can never darken anything). */
let poolTexture: THREE.CanvasTexture | null = null;
function lightPool(radius: number): THREE.Mesh {
  if (!poolTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
    grad.addColorStop(1, 'rgba(255, 214, 140, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    poolTexture = new THREE.CanvasTexture(c);
    poolTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  mesh.position.y = 0.012;
  mesh.renderOrder = 2;
  return mesh;
}

/** A tall brass reading lamp with a big pleated shade, glowing, and the warm pool it throws on the floor. */
export function floorLamp(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  const glow = new GeoBuilder();
  b.cylinder(0, 0.02, 0, 0.15, 0.17, 0.04, '#B98B3A', 16, 'y', FLAT);
  b.cylinder(0, 0.62, 0, 0.022, 0.022, 1.16, '#C9A04E', 8, 'y', FLAT);
  b.sphere(0, 0.62, 0, 0.04, '#B98B3A', 1, 1);
  glow.cylinder(0, 1.26, 0, 0.12, 0.22, 0.28, '#FFE2A6', 18, 'y', { shade: 1 });
  b.cylinder(0, 1.41, 0, 0.125, 0.125, 0.02, '#9C6E2E', 18, 'y', FLAT);
  const g = group(b, glow, x, z);
  g.add(lightPool(0.75));
  return g;
}

/** A big bouquet in a tall glazed vase: roses, daisies and greenery, almost waist high. */
export function bouquet(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  b.cylinder(0, 0.2, 0, 0.11, 0.15, 0.4, '#3D6FB6', 14, 'y', { shade: 0.95 });
  b.cylinder(0, 0.41, 0, 0.13, 0.11, 0.04, '#2F5A99', 14, 'y', FLAT);
  // Greenery first, then the blooms over it.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.cone(Math.cos(a) * 0.13, 0.62, Math.sin(a) * 0.13, 0.07, 0.3, '#4F9A4A', 5, { shade: 0.9 });
  }
  const blooms: [number, number, number, number, string][] = [
    [0, 0.84, 0, 0.1, '#F06A8A'], [0.12, 0.76, 0.04, 0.085, '#FFF4F0'], [-0.12, 0.77, 0.03, 0.085, '#FFD24A'],
    [0.05, 0.74, -0.12, 0.08, '#E8455E'], [-0.04, 0.73, 0.13, 0.08, '#F7A7C0'], [0.13, 0.7, -0.08, 0.07, '#FFFFFF'],
    [-0.13, 0.69, -0.09, 0.075, '#F06A8A'], [0.02, 0.92, 0.07, 0.07, '#FFD24A'],
  ];
  for (const [bx, by, bz, r, c] of blooms) {
    b.sphere(bx, by, bz, r, c, 1, 0.85);
    b.sphere(bx, by + r * 0.55, bz, r * 0.35, '#FFE78A', 0, 0.8);
  }
  return group(b, null, x, z);
}

/** A walnut minibar, its glass door lit from inside: bottles, cans, a bowl of fruit on top. */
export function minibar(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  const glow = new GeoBuilder();
  b.box(0, 0.36, 0, 0.5, 0.72, 0.42, '#6B4429', 0, { shade: 0.9 });
  // The glass door faces into the room (+z), lit inside, the drinks behind it.
  glow.box(0, 0.38, 0.212, 0.4, 0.5, 0.008, '#BFE6F2', 0, FLAT);
  const colors = ['#E24B4B', '#3FA34D', '#F2C14E', '#4C7FD1'];
  for (let i = 0; i < 4; i++) b.cylinder(-0.13 + i * 0.087, 0.5, 0.22, 0.026, 0.026, 0.14, colors[i], 8, 'y', FLAT);
  for (let i = 0; i < 3; i++) b.box(-0.1 + i * 0.1, 0.24, 0.22, 0.06, 0.1, 0.012, colors[(i + 2) % 4], 0, FLAT);
  b.box(0.17, 0.4, 0.222, 0.025, 0.16, 0.02, '#D8B45A', 0, FLAT);
  // A bowl of fruit on top.
  b.cylinder(0, 0.76, 0, 0.13, 0.08, 0.06, '#F4EFE6', 14, 'y', FLAT);
  for (const [fx, fz, c] of [[-0.05, 0, '#F0A030'], [0.05, 0.02, '#D9332E'], [0, -0.05, '#9BC53D']] as [number, number, string][]) b.sphere(fx, 0.82, fz, 0.05, c, 1, 1);
  return group(b, glow, x, z);
}

/** A wooden newsstand against the wall: slanted shelves of the morning papers under a little sign. */
export function newsstand(r: Rect): THREE.Group {
  const b = new GeoBuilder();
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  b.box(0, 0.45, 0, w, 0.9, d, '#7A4E2D', 0, { shade: 0.85 });
  for (let i = 0; i < 3; i++) {
    const y = 0.32 + i * 0.24;
    // Shelves step back as they rise, each holding a stack of folded papers facing the room.
    b.box(-w * 0.5 - 0.02, y, 0, 0.06, 0.04, d - 0.06, '#5E3A20', 0, FLAT);
    for (let k = 0; k < 2; k++) {
      const pz = -d * 0.22 + k * d * 0.44;
      b.box(-w * 0.5 - 0.05, y + 0.09, pz, 0.04, 0.16, d * 0.36, '#F3EEDF', 0, FLAT);
      b.box(-w * 0.5 - 0.072, y + 0.13, pz, 0.004, 0.035, d * 0.3, '#2B2230', 0, FLAT);
      b.box(-w * 0.5 - 0.072, y + 0.07, pz, 0.004, 0.06, d * 0.14, '#7A8AA8', 0, FLAT);
    }
  }
  b.box(0, 1.02, 0, w * 0.9, 0.18, 0.05, '#C0485C', 0, FLAT);
  return group(b, null, cx, cz);
}

/** The shoe-shine stand: a raised red seat, a footrest, brushes and tins of polish laid out. */
export function shoeStand(r: Rect): THREE.Group {
  const b = new GeoBuilder();
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  b.box(0, 0.25, 0, w, 0.5, d, '#6B4429', 0, { shade: 0.85 });
  b.box(w * 0.18, 0.62, 0, w * 0.5, 0.22, d * 0.8, '#B8323A', 0, { shade: 0.9 });
  b.box(w * 0.43, 0.85, 0, 0.08, 0.5, d * 0.8, '#6B4429', 0, { shade: 0.85 });
  // The footrests out front, brass.
  for (const sz of [-0.14, 0.14]) b.box(-w * 0.42, 0.56, sz, 0.18, 0.04, 0.12, '#C9A04E', 0, FLAT);
  // Brushes and polish on the step.
  b.box(-w * 0.2, 0.53, -d * 0.3, 0.16, 0.05, 0.07, '#A0522D', 0, FLAT);
  b.box(-w * 0.2, 0.57, -d * 0.3, 0.14, 0.03, 0.05, '#2B2230', 0, FLAT);
  for (const [px, pz, c] of [[-w * 0.15, d * 0.25, '#2B2230'], [-w * 0.3, d * 0.3, '#8B3A2A']] as [number, number, string][]) b.cylinder(px, 0.53, pz, 0.05, 0.05, 0.05, c, 12, 'y', FLAT);
  return group(b, null, cx, cz);
}

/** What a washroom guest leaves: a puddle by the basin, crumpled paper towels, an unrolled loo roll. */
export function washMess(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  b.disc(0, 0.006, 0, 0.32, '#8FC3DB', 20, { shade: 1 });
  for (const [px, pz] of [[0.42, -0.12], [-0.3, 0.28], [0.18, 0.36]] as [number, number][]) b.sphere(px, 0.05, pz, 0.055, '#F4F1EA', 0, 0.8);
  b.box(-0.18, 0.008, -0.28, 0.12, 0.012, 0.5, '#FFFFFF', 0.4, FLAT);
  return group(b, null, x, z);
}
