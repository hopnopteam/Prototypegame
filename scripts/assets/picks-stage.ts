// A candidate-asset stage (session 54, the Royal Suite picks): the game's own night stage, camera and carriage, with
// downloaded models and rug textures placed into a passenger room so the owner can judge them in context.
// Not part of the game. Build: ENTRY=scripts/assets/picks-stage.ts OUT=picks-stage.html node scripts/build.mjs,
// then serve dist/ and the candidate files from one folder and open picks-stage.html?spec=<scene.json>.
// Spec: { carriage: { type, tier, clear: [cabin indices], comforts? }, cam: { x, z, zoom }, lights?: [{ x, y, z, i, c }],
//   rugs?: [{ tex?, color?, x, z, w, d, rot?, repeat?, tint?, border?, borderW?, y? }],
//   models?: [{ url, x, z, y?, rot?, fit?: [w, d], h?, scale?, tint?: { [material]: hex }, all?: hex, linear? }] }
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import type { CarriageType } from '../../src/core/types';
import type { ComfortKey } from '../../src/config/content';
import { CarriageView, FLOOR_Y } from '../../src/world/CarriageView';
import { carriageOriginZ, getLayout } from '../../src/world/layout';
import { Scenery } from '../../src/world/Scenery';
import { Stage } from '../../src/world/Stage';
import { setLivery } from '../../src/world/materials';
import { liveryFor } from '../../src/world/palette';
import { loadDetailTextures } from '../../src/world/detailTextures';

interface ModelSpec { on?: boolean; url: string; x: number; z: number; y?: number; rot?: number; fit?: [number, number]; h?: number; scale?: number; tint?: Record<string, string>; all?: string; linear?: boolean }
interface RugSpec { tex?: string; color?: string; x: number; z: number; w: number; d: number; rot?: number; repeat?: number; tint?: string; border?: string; borderW?: number; y?: number; round?: boolean }
interface Spec {
  carriage: { type: CarriageType; tier: number; clear?: number[]; comforts?: string[] };
  cam: { x: number; z: number; zoom: number };
  lights?: { x: number; y: number; z: number; i?: number; c?: string; d?: number }[];
  rugs?: RugSpec[];
  models?: ModelSpec[];
}

document.getElementById('loader')?.remove();
const params = new URLSearchParams(location.search);
const info: { tris: Record<string, number>; errors: string[] } = { tris: {}, errors: [] };
(window as unknown as { __info: typeof info }).__info = info;

async function main(): Promise<void> {
  const spec = (await (await fetch(params.get('spec') ?? 'spec.json')).json()) as Spec;
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const stage = new Stage(canvas, 'high', null);
  stage.lighting.setTime(Number(params.get('t') ?? '0.82'));
  await loadDetailTextures();
  const scenery = new Scenery();
  stage.scene.add(scenery.group);
  const liv = liveryFor(8);
  setLivery(liv.body, liv.trim);

  const c = spec.carriage;
  const layout = getLayout(c.type, c.tier);
  const clear = new Set(c.clear ?? []);
  // An emptied room keeps its walls and floor; its furniture (props inside it) and class dressing are left out.
  const rooms = layout.cabins.filter((cab) => clear.has(cab.index)).map((cab) => cab.room);
  const inside = (r: { x0: number; z0: number; x1: number; z1: number }) => rooms.some((m) => r.x0 >= m.x0 - 0.01 && r.x1 <= m.x1 + 0.01 && r.z0 >= m.z0 - 0.01 && r.z1 <= m.z1 + 0.01);
  // Beds come from the cabin, not the props: an emptied room's bed is moved out of sight (zero size, far away).
  const cabins = layout.cabins.map((cab) => (clear.has(cab.index) ? { ...cab, bed: { x0: 0, z0: -60, x1: 0.001, z1: -59.999 } } : cab));
  const trimmed = { ...layout, cabins, props: layout.props.filter((p) => !inside(p.rect)) };
  const view = new CarriageView(trimmed, 0, c.tier);
  view.group.position.z = carriageOriginZ(0);
  const priv = view as unknown as { cabinLocked: boolean[]; rebuildDressing(): void };
  for (const i of clear) priv.cabinLocked[i] = true;
  priv.rebuildDressing();
  if (c.comforts) view.setComforts(c.comforts as ComfortKey[]);
  stage.scene.add(view.group);
  scenery.setSpan(30);

  // Lamplight stand-ins: the bake covers the game's own lamps; candidates get warm point lights.
  for (const l of spec.lights ?? [{ x: 0.9, y: 2.2, z: c.type === 'lobby' ? 12.5 : 5.7, i: 4 }]) {
    const p = new THREE.PointLight(l.c ?? '#FFD9A0', l.i ?? 4, l.d ?? 6, 1.6);
    p.position.set(l.x, FLOOR_Y + l.y, l.z);
    p.updateMatrixWorld(true);
    stage.scene.add(p);
  }

  const tex = new THREE.TextureLoader();
  for (const r of spec.rugs ?? []) {
    const g = new THREE.Group();
    const y = FLOOR_Y + (r.y ?? 0.012);
    const bw = r.borderW ?? 0;
    if (r.border && bw > 0) {
      const geo = r.round ? new THREE.CircleGeometry(0.5, 48) : new THREE.PlaneGeometry(1, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: r.border, roughness: 0.95 }));
      m.scale.set(r.w, r.d, 1);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y - 0.002;
      g.add(m);
    }
    const mat = new THREE.MeshStandardMaterial({ color: r.tint ?? r.color ?? '#ffffff', roughness: 0.95 });
    if (r.tex) {
      const t = await tex.loadAsync(r.tex);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const rep = r.repeat ?? 1;
      t.repeat.set(rep * (r.w - 2 * bw), rep * (r.d - 2 * bw));
      t.anisotropy = 8;
      mat.map = t;
    }
    const geo = r.round ? new THREE.CircleGeometry(0.5, 48) : new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(r.w - 2 * bw, r.d - 2 * bw, 1);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    g.add(m);
    g.position.set(r.x, 0, r.z);
    g.rotation.y = THREE.MathUtils.degToRad(r.rot ?? 0);
    g.updateMatrixWorld(true);
    stage.scene.add(g);
  }

  const gltf = new GLTFLoader();
  // `on: true` stands a model on the top of the one placed before it (a lamp on a table).
  let lastTop = FLOOR_Y;
  for (const m of spec.models ?? []) {
    try {
      let obj: THREE.Object3D;
      if (m.url.endsWith('.obj')) {
        const base = m.url.slice(0, m.url.lastIndexOf('/') + 1);
        const mtlUrl = m.url.replace(/\.obj$/, '.mtl');
        const loader = new OBJLoader();
        try {
          const mtl = await new MTLLoader().setPath(base).loadAsync(mtlUrl.slice(base.length));
          mtl.preload();
          loader.setMaterials(mtl);
        } catch { /* no mtl */ }
        obj = await loader.loadAsync(m.url);
        // Quaternius and Kenney OBJ colours are linear values; the MTL loader read them as sRGB.
        if (m.linear !== false) obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const mat of ([] as THREE.Material[]).concat(mesh.material)) (mat as THREE.MeshStandardMaterial).color?.convertLinearToSRGB();
        });
      } else {
        obj = (await gltf.loadAsync(m.url)).scene;
      }
      // Phong materials from OBJ read flat under the moon: swap to standard so every candidate shades alike.
      let tris = 0;
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        const mats = ([] as THREE.Material[]).concat(mesh.material).map((mat) => {
          const src = mat as THREE.MeshPhongMaterial & THREE.MeshStandardMaterial;
          const std = src.type === 'MeshStandardMaterial' || src.type === 'MeshPhysicalMaterial' ? src.clone() : new THREE.MeshStandardMaterial({ color: src.color, map: src.map, roughness: 0.75 });
          std.name = src.name;
          const hex = m.tint?.[src.name] ?? m.all;
          if (hex) { std.color = new THREE.Color(hex); if (m.all) std.map = null; }
          return std;
        });
        // An array of one material draws nothing on a geometry without groups.
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
      });
      info.tris[m.url] = Math.round(tris);
      const holder = new THREE.Group();
      holder.add(obj);
      holder.rotation.y = THREE.MathUtils.degToRad(m.rot ?? 0);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      let s = m.scale ?? 1;
      if (m.fit) s = Math.min(m.fit[0] / size.x, m.fit[1] / size.z);
      else if (m.h) s = m.h / size.y;
      holder.scale.setScalar(s);
      holder.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(holder);
      holder.position.set(m.x - (b2.min.x + b2.max.x) / 2, (m.on ? lastTop : FLOOR_Y) + (m.y ?? 0) - b2.min.y, m.z - (b2.min.z + b2.max.z) / 2);
      if (!m.on) lastTop = holder.position.y + b2.max.y;
      holder.updateMatrixWorld(true);
      stage.scene.add(holder);
    } catch (e) {
      info.errors.push(`${m.url}: ${(e as Error).message}`);
    }
  }

  stage.rig.clampZ = [-40, 400];
  stage.rig.snapTo(spec.cam.x, spec.cam.z);
  stage.rig.setZoom(spec.cam.zoom);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    scenery.update(dt, 14);
    view.animate(dt);
    stage.rig.update(dt, spec.cam.x, spec.cam.z);
    stage.render(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __stage: Stage }).__stage = stage;
  (window as unknown as { __ready: boolean }).__ready = true;
}
main().catch((e) => { info.errors.push(String(e)); (window as unknown as { __ready: boolean }).__ready = true; });
