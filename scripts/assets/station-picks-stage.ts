// A candidate-asset stage for the station platform (Station Picks; derived from the session 54 Royal Suite picks stage): the game's own night stage, camera and carriage, with
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
import { CarriageView, FLOOR_Y } from '../../src/world/CarriageView';
import { carriageOriginZ, getLayout } from '../../src/world/layout';
import { PlatformView } from '../../src/world/PlatformView';
import { platformLightInput, trainLightInput } from '../../src/world/trainLight';
import { Scenery } from '../../src/world/Scenery';
import { Stage } from '../../src/world/Stage';
import { setLivery } from '../../src/world/materials';
import { liveryFor } from '../../src/world/palette';
import { loadDetailTextures } from '../../src/world/detailTextures';
import { KEY, recolor, type Recolor } from '../../src/world/models/library';

// Second hunt (stylised picks): every candidate is baked to vertex colours the way scripts/assets/bake_models.py does
// (the material colour times the atlas texel under each vertex's UV) and recoloured by hue band with the game's own
// `recolor`, so it reads exactly as it would in the game.
type RcSpec = { key?: keyof typeof KEY; to: string } & Partial<Recolor>;
const texCache = new Map<unknown, { w: number; h: number; d: Uint8ClampedArray }>();
function pixels(img: CanvasImageSource & { width: number; height: number }) {
  let p = texCache.get(img);
  if (!p) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    p = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
    texCache.set(img, p);
  }
  return p;
}
function bakeVertexColours(mesh: THREE.Mesh, rules: Recolor[]): void {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const mats = ([] as THREE.Material[]).concat(mesh.material) as THREE.MeshStandardMaterial[];
  const n = src.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const uv = src.attributes.uv as THREE.BufferAttribute | undefined;
  const groups = src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }];
  const tc = new THREE.Color();
  for (const g of groups) {
    const m = mats[g.materialIndex ?? 0] ?? mats[0];
    const px = m.map?.image ? pixels(m.map.image as never) : null;
    for (let i = g.start; i < Math.min(n, g.start + g.count); i++) {
      tc.copy(m.color ?? new THREE.Color('#fff'));
      if (px && uv) {
        let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
        const fy = m.map!.flipY ? 1 - v : v;
        const ix = Math.min(px.w - 1, Math.floor(u * px.w)), iy = Math.min(px.h - 1, Math.floor(fy * px.h));
        const o = (iy * px.w + ix) * 4;
        const t = new THREE.Color().setRGB(px.d[o] / 255, px.d[o + 1] / 255, px.d[o + 2] / 255, THREE.SRGBColorSpace);
        tc.multiply(t);
      }
      cols[i * 3] = tc.r; cols[i * 3 + 1] = tc.g; cols[i * 3 + 2] = tc.b;
    }
  }
  recolor(cols, rules);
  src.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  src.clearGroups();
  src.computeVertexNormals();
  mesh.geometry = src;
  mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, flatShading: false });
}

interface ModelSpec { rc?: RcSpec[]; raw?: boolean; on?: boolean; url: string; x: number; z: number; y?: number; rot?: number; fit?: [number, number]; h?: number; scale?: number; tint?: Record<string, string>; all?: string; linear?: boolean }
interface RugSpec { fullimg?: boolean; tex?: string; color?: string; x: number; z: number; w: number; d: number; rot?: number; repeat?: number; tint?: string; border?: string; borderW?: number; y?: number; round?: boolean }
interface Spec {
  tier?: number; upgrades?: string[]; bags?: number;
  /** World points (x, z, height above the deck) whose place on screen is reported, for cropping. */
  mark?: { x: number; z: number; y?: number };
  cam: { x: number; z: number; zoom: number };
  lights?: { x: number; y: number; z: number; i?: number; c?: string; d?: number }[];
  rugs?: RugSpec[];
  models?: ModelSpec[];
}

document.getElementById('loader')?.remove();
const params = new URLSearchParams(location.search);
const info: { tris: Record<string, number>; errors: string[]; mark?: { u: number; v: number } } = { tris: {}, errors: [] };
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

  // The train beside the platform (lobby and a sleeper), and the real platform with the upgrades named in the spec.
  const tier = spec.tier ?? 2;
  const types: CarriageType[] = ['lobby', 'cafe', 'sleeper'];
  const views: CarriageView[] = [];
  types.forEach((t, i) => {
    const v = new CarriageView(getLayout(t, tier), i, tier);
    v.group.position.z = carriageOriginZ(i);
    stage.scene.add(v.group);
    views.push(v);
  });
  scenery.setSpan(carriageOriginZ(types.length - 1) + 14);
  const platform = new PlatformView();
  platform.build(carriageOriginZ(types.length - 1) + 14, null, null);
  platform.setStationName('Millbrook');
  platform.setUpgrades(new Set(spec.upgrades ?? []), null);
  platform.setBarrowBags(spec.bags ?? 3);
  platform.group.visible = true;
  scenery.setHiddenRegion({ x0: 2.75, x1: 40, z0: platform.z0, z1: platform.z1 });
  stage.scene.add(platform.group);
  stage.lightMap.setTrain(trainLightInput(views.map((v, i) => ({ layout: v.layout, originZ: carriageOriginZ(i), tier: v.tier, lamps: v.lampAnchors(carriageOriginZ(i)) }))));
  stage.lightMap.setPlatform(platformLightInput(platform.lampAnchors, platform.z0, platform.z1));
  for (const l of spec.lights ?? []) {
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
      if (r.fullimg) t.repeat.set(1, 1); else t.repeat.set(rep * (r.w - 2 * bw), rep * (r.d - 2 * bw));
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
      if (!m.raw) {
        const rules = (m.rc ?? []).map((r) => (r.key ? { ...(KEY[r.key] as Recolor), ...r, to: r.to } : (r as Recolor)));
        obj.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) bakeVertexColours(mesh, rules); });
      }
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

  stage.rig.clampZ = [-60, 400];
  (stage.rig as unknown as { clampX?: [number, number] }).clampX = [-20, 30];
  stage.rig.snapTo(spec.cam.x, spec.cam.z);
  stage.rig.setZoom(spec.cam.zoom);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    scenery.update(dt, 0);
    for (const v of views) v.animate(dt);
    platform.animate(dt);
    stage.rig.update(dt, spec.cam.x, spec.cam.z);
    stage.render(dt);
    if (spec.mark) {
      const p = new THREE.Vector3(spec.mark.x, FLOOR_Y + (spec.mark.y ?? 0.6), spec.mark.z).project(stage.rig.camera);
      info.mark = { u: (p.x + 1) / 2, v: (1 - p.y) / 2 };
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __stage: Stage }).__stage = stage;
  (window as unknown as { __ready: boolean }).__ready = true;
}
main().catch((e) => { info.errors.push(String(e)); (window as unknown as { __ready: boolean }).__ready = true; });
