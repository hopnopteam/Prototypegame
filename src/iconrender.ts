/**
 * Icon render page (session 51): draws the item icons from the same CC0 models the game shows, with their own
 * textures, into one transparent sheet (assets/icons/items.png, ICON_CELL px a cell, in ICON_MODELS order).
 * Build: ENTRY=src/iconrender.ts OUT=iconrender.html node scripts/build.mjs; run: node scripts/assets/render-icons.mjs.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ICON_CELL, ICON_MODELS } from './ui/iconModels';
import { ICON_BUILDERS } from './iconBuilders';

/** Outline width in pixels at ICON_CELL. */
const OUTLINE = 7;

declare global { interface Window { __iconSheet?: string; __iconError?: string } }

async function main(): Promise<void> {
  document.getElementById('loader')?.remove();
  const n = ICON_MODELS.length;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ICON_CELL, ICON_CELL);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const sheet = document.createElement('canvas');
  sheet.width = ICON_CELL * n;
  sheet.height = ICON_CELL;
  const ctx = sheet.getContext('2d')!;
  const loader = new GLTFLoader();
  for (let i = 0; i < n; i++) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#FFF6E8', '#6A5A70', 1.6));
    const sun = new THREE.DirectionalLight('#FFFFFF', 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#BFD8FF', 0.8);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
    const group = new THREE.Group();
    if (ICON_MODELS[i].build) group.add(ICON_BUILDERS[ICON_MODELS[i].name]());
    for (const part of ICON_MODELS[i].parts) {
      const g = await loader.loadAsync(`models/${part.src}`);
      const obj = g.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const s = (part.height ?? 1) / size.y;
      obj.scale.setScalar(s);
      obj.rotation.y = part.rotY ?? 0;
      const b2 = new THREE.Box3().setFromObject(obj);
      const c = b2.getCenter(new THREE.Vector3());
      obj.position.set((part.x ?? 0) - c.x, (part.y ?? 0) - b2.min.y, (part.z ?? 0) - c.z);
      group.add(obj);
    }
    scene.add(group);
    // Frame: a three-quarter view from above, the whole thing fitting the cell with a little margin.
    const box = new THREE.Box3().setFromObject(group);
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
    const dir = new THREE.Vector3(0.55, 0.62, 1).normalize();
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(13)) * 0.94;
    cam.position.copy(centre).addScaledVector(dir, dist);
    cam.lookAt(centre);
    renderer.render(scene, cam);
    // The icon set's ink outline: the silhouette in ink, spread a few pixels round, under the render.
    const ink = document.createElement('canvas');
    ink.width = ink.height = ICON_CELL;
    const ic = ink.getContext('2d')!;
    for (let a = 0; a < 16; a++) ic.drawImage(renderer.domElement, Math.cos((a / 16) * Math.PI * 2) * OUTLINE, Math.sin((a / 16) * Math.PI * 2) * OUTLINE);
    ic.globalCompositeOperation = 'source-in';
    ic.fillStyle = '#2B2230';
    ic.fillRect(0, 0, ICON_CELL, ICON_CELL);
    ctx.drawImage(ink, i * ICON_CELL, 0);
    ctx.drawImage(renderer.domElement, i * ICON_CELL, 0);
  }
  window.__iconSheet = sheet.toDataURL('image/png');
}
main().catch((e) => { window.__iconError = String(e); });
