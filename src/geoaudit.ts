/**
 * Geometry audit (dev tool, not part of the game): builds the whole train at every refurbishment tier with
 * every exterior upgrade, the locomotive, the rear deck and a platform, then looks for overlapping faces
 * that share a plane (or sit within a few millimetres of one). Those are what flicker ("z-fight") as the
 * camera moves, worst on phones with low-precision depth buffers.
 *
 * Build: ENTRY=src/geoaudit.ts OUT=geoaudit.html node scripts/build.mjs; run: node scripts/geo-audit.mjs.
 */
import * as THREE from 'three';
import { DEFAULT_TRAIN } from './config/content';
import type { CarriageType } from './core/types';
import { CarriageView } from './world/CarriageView';
import { ExteriorView } from './world/ExteriorView';
import { carriageOriginZ, getLayout, trainRearZ } from './world/layout';
import { LocomotiveView } from './world/LocomotiveView';
import { PlatformView } from './world/PlatformView';
import { buildRearDeck } from './world/RearDeck';

/** Faces closer than this (metres) along their normal count as coplanar. */
const SEPARATION = 0.003;
/** Overlap smaller than this (m²) is an edge touch, not a flicker. */
const MIN_AREA = 2e-4;
/** The camera looks down from +z at 55°: faces turned away from it cannot flicker on screen. */
const TO_CAMERA = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(55)), Math.cos(THREE.MathUtils.degToRad(55)));

interface Tri {
  p: THREE.Vector3[];
  n: THREE.Vector3;
  d: number;
  part: string;
  label: string;
  /** Material and colour: two coplanar faces that render identically cannot visibly flicker. */
  look: string;
}

export interface AuditIssue {
  a: string;
  b: string;
  at: [number, number, number];
  normal: [number, number, number];
  gap: number;
  area: number;
}

function collect(root: THREE.Object3D): Tri[] {
  root.updateMatrixWorld(true);
  const tris: Tri[] = [];
  const m = new THREE.Matrix4();
  const inst = new THREE.Matrix4();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const pos = geometry.getAttribute('position');
    if (!pos) return;
    const index = geometry.getIndex();
    const starts = (geometry.userData.partStarts as number[] | undefined) ?? [0];
    const looks = (geometry.userData.partLooks as string[] | undefined) ?? [];
    const material = Array.isArray(mesh.material) ? 'multi' : (mesh.material.name || mesh.material.type);
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const copies = instanced ? instanced.count : 1;
    const color = geometry.getAttribute('color');
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let c = 0; c < copies; c++) {
      m.copy(mesh.matrixWorld);
      if (instanced) {
        instanced.getMatrixAt(c, inst);
        m.multiply(inst);
      }
      for (let t = 0; t < triCount; t++) {
        const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
        ids.forEach((id, k) => v[k].fromBufferAttribute(pos, id).applyMatrix4(m));
        const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
        const len = n.length();
        if (len < 1e-7) continue;
        n.divideScalar(len);
        if (n.dot(TO_CAMERA) < -0.1) continue;
        let part = 0;
        while (part + 1 < starts.length && starts[part + 1] <= ids[0]) part++;
        const rgb = color ? `#${new THREE.Color(color.getX(ids[0]), color.getY(ids[0]), color.getZ(ids[0])).getHexString()}` : '';
        tris.push({
          p: v.map((x) => x.clone()),
          n,
          d: n.dot(v[0]),
          part: `${mesh.uuid}:${c}:${part}`,
          look: `${Array.isArray(mesh.material) ? 'multi' : mesh.material.uuid}|${looks[part] ?? rgb}`,
          label: `${mesh.name || mesh.parent?.name || 'mesh'}/${material}${instanced ? `#${c}` : ''} part ${part} ${looks[part] ?? rgb}`,
        });
      }
    }
  });
  return tris;
}

/** Area of the overlap of two triangles in their shared plane (Sutherland–Hodgman clipping). */
function overlapArea(a: Tri, b: Tri): [number, THREE.Vector3 | null] {
  const n = a.n;
  const u = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
  const w = new THREE.Vector3().crossVectors(n, u);
  const flat = (t: Tri): [number, number][] => t.p.map((p) => [p.dot(u), p.dot(w)]);
  let poly = flat(a);
  const clip = flat(b);
  // Make the clip triangle counter-clockwise.
  const area2 = (q: [number, number][]): number => q.reduce((s, p, i) => { const r = q[(i + 1) % q.length]; return s + p[0] * r[1] - r[0] * p[1]; }, 0);
  if (area2(clip) < 0) clip.reverse();
  for (let i = 0; i < 3 && poly.length > 0; i++) {
    const [ax, ay] = clip[i];
    const [bx, by] = clip[(i + 1) % 3];
    const inside = (p: [number, number]): boolean => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) >= 0;
    const next: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const cur = poly[k];
      const prev = poly[(k + poly.length - 1) % poly.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci !== pi) {
        const dx = cur[0] - prev[0];
        const dy = cur[1] - prev[1];
        const den = (bx - ax) * dy - (by - ay) * dx;
        const tt = den === 0 ? 0 : ((ax - prev[0]) * (by - ay) - (ay - prev[1]) * (bx - ax)) / -den;
        next.push([prev[0] + dx * tt, prev[1] + dy * tt]);
      }
      if (ci) next.push(cur);
    }
    poly = next;
  }
  if (poly.length < 3) return [0, null];
  const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
  const cy = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
  const point = n.clone().multiplyScalar(a.d).add(u.clone().multiplyScalar(cx)).add(w.clone().multiplyScalar(cy));
  return [Math.abs(area2(poly)) / 2, point];
}

/** Can the camera see this spot? Rays toward the camera (and from either side of it) that nothing blocks. */
const raycaster = new THREE.Raycaster();
const SIGHTLINES = [TO_CAMERA.clone(), TO_CAMERA.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.35), TO_CAMERA.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.35)];
function visible(targets: THREE.Object3D[], point: THREE.Vector3, n: THREE.Vector3): boolean {
  const origin = point.clone().add(n.clone().multiplyScalar(0.004));
  for (const dir of SIGHTLINES) {
    if (dir.dot(n) <= 0.02) continue;
    raycaster.set(origin, dir);
    raycaster.near = 0.001;
    raycaster.far = 30;
    if (raycaster.intersectObjects(targets, false).length === 0) return true;
  }
  return false;
}

export function audit(root: THREE.Object3D): AuditIssue[] {
  const tris = collect(root);
  const buckets = new Map<string, Tri[]>();
  const key = (t: Tri, dShift: number): string => `${Math.round(t.n.x * 40)},${Math.round(t.n.y * 40)},${Math.round(t.n.z * 40)}|${Math.round(t.d / SEPARATION) + dShift}`;
  for (const t of tris) {
    const k = key(t, 0);
    const list = buckets.get(k) ?? [];
    list.push(t);
    buckets.set(k, list);
  }
  const issues = new Map<string, AuditIssue>();
  // Meshes only (sprites need a camera to be ray-tested, and never flicker against geometry).
  const targets: THREE.Object3D[] = [];
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // A ray from inside a wall must hit the wall's inner faces too, or buried faces would read as visible.
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.side = THREE.DoubleSide;
    targets.push(o);
  });
  const hiddenTries = new Map<string, number>();
  for (const [k, list] of buckets) {
    // Compare within the bucket and with the next bucket along the normal.
    const [nk, dk] = k.split('|');
    const neighbours = buckets.get(`${nk}|${Number(dk) + 1}`) ?? [];
    const pools: [Tri[], Tri[], boolean][] = [[list, list, true], [list, neighbours, false]];
    for (const [A, B, same] of pools) {
      for (let i = 0; i < A.length; i++) {
        const a = A[i];
        for (let j = same ? i + 1 : 0; j < B.length; j++) {
          const b = B[j];
          if (a.part === b.part || a.look === b.look) continue;
          const gap = Math.abs(a.d - b.d);
          if (gap > SEPARATION || a.n.dot(b.n) < 0.999) continue;
          const [area, point] = overlapArea(a, b);
          if (area < MIN_AREA || !point) continue;
          const id = [a.label, b.label].sort().join(' × ');
          const prev = issues.get(id);
          if (prev) {
            prev.area += area;
            continue;
          }
          const tries = hiddenTries.get(id) ?? 0;
          if (tries >= 4) continue;
          if (!visible(targets, point, a.n)) {
            hiddenTries.set(id, tries + 1);
            continue;
          }
          const c = point;
          issues.set(id, { a: a.label, b: b.label, at: [+c.x.toFixed(2), +c.y.toFixed(3), +c.z.toFixed(2)], normal: [+a.n.x.toFixed(2), +a.n.y.toFixed(2), +a.n.z.toFixed(2)], gap: +gap.toFixed(4), area });
        }
      }
    }
  }
  return [...issues.values()].sort((x, y) => y.area - x.area);
}

/** The whole train at one tier, every exterior upgrade, a platform with its marketing. */
function scene(tier: number, locked: boolean): THREE.Group {
  const root = new THREE.Group();
  const types: CarriageType[] = [...DEFAULT_TRAIN];
  types.forEach((type, i) => {
    const view = new CarriageView(getLayout(type), i, tier);
    view.group.name = `${type}@t${tier}`;
    view.group.position.z = carriageOriginZ(i);
    const layout = getLayout(type);
    layout.cabins.forEach((c) => {
      view.setCabinLocked(c.index, locked);
      view.setDirt(c.index, [true, true, true]);
    });
    layout.bathrooms.forEach((b) => view.setBathroomLocked(b.index, locked));
    view.setDoorOpen(1);
    root.add(view.group);
  });
  const loco = new LocomotiveView();
  loco.group.name = 'loco';
  root.add(loco.group);
  const deck = buildRearDeck();
  deck.name = 'deck';
  deck.position.z = trainRearZ(types.length);
  root.add(deck);
  const exterior = new ExteriorView();
  exterior.group.name = 'exterior';
  exterior.build(types, { windowboxes: true, lamps: true, lining: true, nameboards: true, redcarpet: true }, 'The Night Owl');
  exterior.setCarpet(1);
  root.add(exterior.group);
  const platform = new PlatformView();
  platform.group.name = 'platform';
  platform.build(trainRearZ(types.length), 2, 3);
  platform.setMarketing({ posters: true, band: true }, 'The Night Owl', '#5E8A6A', '#EFE6D2');
  platform.group.visible = true;
  root.add(platform.group);
  return root;
}

const results: Record<string, AuditIssue[]> = {};
for (const [tier, locked] of [[0, true], [0, false], [1, false], [2, false], [3, false]] as [number, boolean][]) {
  results[`tier${tier}${locked ? '-locked' : ''}`] = audit(scene(tier, locked));
}
(window as unknown as { geoAudit: typeof results }).geoAudit = results;
document.body.dataset.done = '1';
