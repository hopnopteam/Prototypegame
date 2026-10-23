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
  // Faint: a hint of warmth on the boards, never a spotlight (the night look depends on it).
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true, fog: false }));
  mesh.position.y = 0.012;
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * A brass reading lamp with a fabric shade. The shade is lit only by the room's own light (a solid, warm cream, not a
 * glowing lamp material: an emissive shade blew the whole room out); a faint warm pool sits under it.
 */
export function floorLamp(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  b.cylinder(0, 0.02, 0, 0.13, 0.15, 0.04, '#9C7432', 16, 'y', FLAT);
  b.cylinder(0, 0.56, 0, 0.02, 0.02, 1.04, '#B8903F', 8, 'y', FLAT);
  b.cylinder(0, 1.14, 0, 0.1, 0.17, 0.24, '#E9D2A4', 18, 'y', { shade: 0.95 });
  b.cylinder(0, 1.265, 0, 0.102, 0.102, 0.012, '#8C6A30', 18, 'y', FLAT);
  b.cylinder(0, 1.015, 0, 0.172, 0.172, 0.012, '#8C6A30', 18, 'y', FLAT);
  const g = group(b, null, x, z);
  g.add(lightPool(0.55));
  return g;
}

/**
 * Fresh flowers: a small round side table with a white vase on it and a neat posy of roses and sprigs of green, about
 * hip high (so it reads, without towering over the room).
 */
export function bouquet(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  // The table: a round top on a turned leg and a foot.
  b.cylinder(0, 0.015, 0, 0.12, 0.13, 0.03, '#6B4429', 14, 'y', FLAT);
  b.cylinder(0, 0.22, 0, 0.025, 0.035, 0.4, '#7A4E2D', 10, 'y', FLAT);
  b.cylinder(0, 0.435, 0, 0.17, 0.17, 0.03, '#8A5A33', 18, 'y', { shade: 0.95 });
  // A small white vase, a little narrower at the neck.
  b.cylinder(0, 0.53, 0, 0.055, 0.07, 0.16, '#F4F1EA', 14, 'y', { shade: 0.95 });
  b.cylinder(0, 0.62, 0, 0.045, 0.05, 0.03, '#E8E3DA', 14, 'y', FLAT);
  // Leaves, then roses in a soft dome: two pinks, white and a touch of yellow.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.cone(Math.cos(a) * 0.07, 0.69, Math.sin(a) * 0.07, 0.035, 0.12, '#5E9E4E', 5, { shade: 0.9 });
  }
  const blooms: [number, number, number, string][] = [
    [0, 0.77, 0, '#E86C8A'], [0.06, 0.73, 0.04, '#F7B4C6'], [-0.06, 0.73, 0.03, '#FFFFFF'],
    [0.03, 0.72, -0.06, '#E86C8A'], [-0.04, 0.72, -0.05, '#F7B4C6'], [0.0, 0.71, 0.07, '#FFE07A'],
  ];
  for (const [bx, by, bz, c] of blooms) b.sphere(bx, by, bz, 0.04, c, 1, 0.8);
  return group(b, null, x, z);
}

/** A walnut minibar, its glass door lit from inside: bottles, cans, a bowl of fruit on top. */
export function minibar(x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  b.box(0, 0.36, 0, 0.5, 0.72, 0.42, '#6B4429', 0, { shade: 0.9 });
  // The glass door faces into the room (+z): a cool tint over the drinks (lit by the room, not glowing itself).
  b.box(0, 0.38, 0.212, 0.4, 0.5, 0.008, '#8FB2BF', 0, FLAT);
  const colors = ['#E24B4B', '#3FA34D', '#F2C14E', '#4C7FD1'];
  for (let i = 0; i < 4; i++) b.cylinder(-0.13 + i * 0.087, 0.5, 0.22, 0.026, 0.026, 0.14, colors[i], 8, 'y', FLAT);
  for (let i = 0; i < 3; i++) b.box(-0.1 + i * 0.1, 0.24, 0.22, 0.06, 0.1, 0.012, colors[(i + 2) % 4], 0, FLAT);
  b.box(0.17, 0.4, 0.222, 0.025, 0.16, 0.02, '#D8B45A', 0, FLAT);
  // A bowl of fruit on top.
  b.cylinder(0, 0.76, 0, 0.13, 0.08, 0.06, '#F4EFE6', 14, 'y', FLAT);
  for (const [fx, fz, c] of [[-0.05, 0, '#F0A030'], [0.05, 0.02, '#D9332E'], [0, -0.05, '#9BC53D']] as [number, number, string][]) b.sphere(fx, 0.82, fz, 0.05, c, 1, 1);
  return group(b, null, x, z);
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

/**
 * The washroom's front corner: a curved wall (knee high like every wall inside the cut-away) from the end of the
 * front wall round to the partition, tiled white with a wooden cap.
 */
export function curvedWall(cx: number, cz: number, radius: number, height: number): THREE.Group {
  const b = new GeoBuilder();
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * (Math.PI / 2);
    const a1 = ((i + 1) / n) * (Math.PI / 2);
    const am = (a0 + a1) / 2;
    const x = cx - Math.cos(am) * radius;
    const z = cz - Math.sin(am) * radius;
    const len = radius * (a1 - a0) + 0.012;
    // Each segment lies along the curve's tangent.
    const rot = Math.atan2(Math.sin(am), -Math.cos(am));
    b.box(x, height / 2, z, len, height, 0.12, '#EDE6DA', rot, { shade: 0.9 });
    b.box(x, height + 0.015, z, len, 0.03, 0.15, '#9C6E40', rot, FLAT);
  }
  return group(b, null, 0, 0);
}

/** A sliding door of frosted glass in a brass frame (knee high, like the walls), its own group to slide. */
export function slidingDoor(length: number, height: number): THREE.Group {
  const b = new GeoBuilder();
  b.box(0, height / 2, 0, 0.05, height, length, '#CFE3EA', 0, { shade: 0.95 });
  b.box(0, height, 0, 0.07, 0.03, length, '#C9A04E', 0, FLAT);
  for (const z of [-length / 2 + 0.02, length / 2 - 0.02]) b.box(0, height / 2, z, 0.07, height, 0.04, '#C9A04E', 0, FLAT);
  b.box(-0.04, height * 0.55, length / 2 - 0.14, 0.02, 0.14, 0.03, '#8C6A30', 0, FLAT);
  const g = group(b, null, 0, 0);
  return g;
}

/** What a washroom guest leaves, piece by piece (so it can arrive and be cleaned up one bit at a time). */
export interface WashMess {
  group: THREE.Group;
  puddle: THREE.Group;
  pieces: THREE.Group[];
}
function piece(build: (b: GeoBuilder) => void, x: number, z: number): THREE.Group {
  const b = new GeoBuilder();
  build(b);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.receiveShadow = true;
  g.add(mesh);
  g.position.set(x, 0, z);
  return g;
}
export function washMess(x: number, z: number): WashMess {
  const group = new THREE.Group();
  group.position.set(x, FLOOR_Y, z);
  const puddle = piece((b) => {
    b.disc(0, 0.005, 0, 0.3, '#86BBD4', 22, { shade: 1 });
    b.disc(0.22, 0.006, 0.12, 0.12, '#86BBD4', 16, { shade: 1 });
    b.disc(0.06, 0.007, -0.04, 0.1, '#B5D9E8', 14, { shade: 1 });
  }, 0, 0);
  // A towel dropped in a heap, paper towels screwed up, the loo roll trailing across the floor.
  const towel = piece((b) => {
    b.rounded(0, 0.04, 0, 0.3, 0.08, 0.22, 0.04, '#F29CA8', { shade: 0.95 });
    b.rounded(0.05, 0.09, 0.02, 0.18, 0.05, 0.14, 0.03, '#F6B7C0', { shade: 0.95 });
  }, 0.45, -0.2);
  const papers = [[-0.32, 0.3], [0.1, 0.38], [-0.12, -0.34]].map(([px, pz]) =>
    piece((b) => {
      b.sphere(0, 0.045, 0, 0.05, '#F4F1EA', 0, 0.8);
      b.sphere(0.02, 0.06, 0.01, 0.03, '#FFFFFF', 0, 0.8);
    }, px, pz));
  const roll = piece((b) => {
    b.cylinder(0, 0.05, 0, 0.05, 0.05, 0.1, '#FFFFFF', 12, 'x', { shade: 0.95 });
    b.box(-0.3, 0.006, 0.02, 0.5, 0.008, 0.1, '#FFFFFF', 0, FLAT);
  }, -0.42, -0.05);
  const pieces = [towel, ...papers, roll];
  group.add(puddle, ...pieces);
  return { group, puddle, pieces };
}
