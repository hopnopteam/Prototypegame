// Carried things never clip into the carrier (owner, 27 Nov: "picking up bags… when he picks up more like stack, they
// clip into his face, make sure there are no clippings"). Every figure who carries (the conductor and every staff role)
// is loaded with stacks of every kind and bags in the hands, walks and stands, and the real meshes are measured each
// frame: no vertex of the head, the body, the arms or the legs may be inside a carried item's box, except that a hand
// may close on what it holds by a few centimetres (a mitten round a handle, against a side).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Tweens } from '../src/core/Tween';
import type { ItemKind } from '../src/core/types';
import { CarryStack } from '../src/gameplay/CarryStack';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../src/world/CharacterView';

const CARRIERS: [string, CharacterLook, number][] = [['conductor', CONDUCTOR_LOOK, 1.1], ...Object.entries(STAFF_LOOKS).map(([r, l]) => [`staff:${r}`, l, 1] as [string, CharacterLook, number])];
const LOADS: ItemKind[][] = [
  ['luggage'], ['luggage', 'luggage'], ['luggage', 'luggage', 'luggage'], ['luggage', 'luggage', 'luggage', 'luggage'],
  ['luggage', 'luggage', 'luggage', 'luggage', 'luggage'], Array(8).fill('luggage'),
  Array(6).fill('towel'), ['towel', 'roll', 'linen', 'blanket', 'pillow', 'towel'], ['tea', 'coffee', 'sandwich', 'tea', 'champagne'],
  Array(6).fill('crate'), Array(6).fill('meal'), ['newspaper', 'snack', 'snack', 'popcorn', 'cocktail', 'latte'],
];
/** Slack (m): soft faces drawn a little inside their boxes. */
const SLACK = 0.004;
/** How far a hand may close on what it holds (m): the mitten round a handle or against a side. */
const GRIP_DEPTH = 0.03;

function measure(view: CharacterView, items: THREE.Mesh[], out: Set<string>, tag: string): void {
  view.root.updateMatrixWorld(true);
  const any = view as unknown as { headMesh: THREE.Mesh; bodyMesh: THREE.Mesh; upperMeshes: THREE.Mesh[]; foreMeshes: THREE.Mesh[]; thighMeshes: THREE.Mesh[]; shinMeshes: THREE.Mesh[] };
  const parts: [string, THREE.Mesh][] = [['head', any.headMesh], ['body', any.bodyMesh], ...any.upperMeshes.map((m) => ['upper arm', m] as [string, THREE.Mesh]), ...any.foreMeshes.map((m) => ['forearm', m] as [string, THREE.Mesh]), ...any.thighMeshes.map((m) => ['thigh', m] as [string, THREE.Mesh]), ...any.shinMeshes.map((m) => ['shin', m] as [string, THREE.Mesh])];
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (const item of items) {
    const g = item.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!.clone().expandByScalar(-SLACK);
    inv.copy(item.matrixWorld).invert();
    for (const [name, mesh] of parts) {
      if (!mesh.visible) continue;
      m.multiplyMatrices(inv, mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute('position');
      let depth = 0;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (!box.containsPoint(p)) continue;
        // How deep, in the item's own units scaled to metres.
        const d = Math.min(p.x - box.min.x, box.max.x - p.x, p.y - box.min.y, box.max.y - p.y, p.z - box.min.z, box.max.z - p.z) * item.matrixWorld.getMaxScaleOnAxis();
        depth = Math.max(depth, d);
      }
      // A hand takes hold of what it carries: its mitten may close on the item a little, no more.
      if (depth > (name === 'forearm' ? GRIP_DEPTH : 0.003)) out.add(`${tag}: ${name} into the ${item.userData.kind ?? 'item'} by ${(depth * 1000).toFixed(0)} mm`);
    }
  }
}

describe('carried things never clip into the carrier', () => {
  for (const [name, look, scale] of CARRIERS) {
    it(name, () => {
      const out = new Set<string>();
      for (const load of LOADS) {
        const scene = new THREE.Scene();
        const tweens = new Tweens();
        const view = new CharacterView(look, scale);
        view.leans = false;
        scene.add(view.root);
        const stack = new CarryStack(view.stackAnchor, scene, tweens, 12, view.boardAnchor, view);
        for (const k of load) stack.add(k);
        const meshes = (stack as unknown as { meshes: THREE.Mesh[] }).meshes;
        meshes.forEach((mm, i) => (mm.userData.kind = stack.items[i]));
        for (let t = 0; t < 2.4; t += 1 / 30) {
          tweens.update(1 / 30);
          view.setCarrying(stack.stacked > 0, stack.board);
          if (stack.stacked > 0) view.setGrip(stack.gripHalf);
          view.stackCount = stack.stacked;
          view.setHandBags(stack.handBags(0), stack.handBags(1));
          view.stackReach = stack.reach;
          const speed = t < 1.4 ? 3.2 : 0;
          view.update(1 / 30, speed);
          stack.update(1 / 30, speed > 0, t);
          if (t > 0.4) measure(view, meshes, out, `${load.join('+')} ${speed ? 'walking' : 'standing'}`);
        }
      }
      // The worst of each kind of clip.
      const worst = new Map<string, string>();
      for (const s of out) { const k = s.replace(/ by \d+ mm/, ''); const prev = worst.get(k); if (!prev || +s.match(/(\d+) mm/)![1] > +prev.match(/(\d+) mm/)![1]) worst.set(k, s); }
      expect([...worst.values()]).toEqual([]);
    });
  }
});
