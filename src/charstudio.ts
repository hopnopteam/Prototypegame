// The character studio (the clay-toy overhaul's proofs, docs/art/CHARACTER_SPEC.md): chosen figures on a white floor
// under the reference sheet's camera (40° down, a long 20° lens), standing, walking in place or turning, in the game's
// own renderer and materials. Build with ENTRY=src/charstudio.ts OUT=charstudio.html node scripts/build.mjs.
//   ?who=conductor,attendant,student,grandma  ?walk=1&speed=1.6  ?turn=1 (turntable)  ?face=-0.6  ?pitch=40&fov=20
//   ?quality=high  ?t=0.25 (time of day)  ?floor=#FFFFFF  ?gap=0.9  ?zoom=1  ?pose=sit|sleep  ?act=wave
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ARCHETYPES } from './config/content';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from './world/CharacterView';
import { GeoBuilder } from './world/geo';
import { MATERIALS, SHADOW_GEOMETRY } from './world/materials';
import { CharacterBatch } from './world/CharacterBatch';
import { Stage } from './world/Stage';
import { guestLook } from './gameplay/guestLook';

document.getElementById('loader')?.remove();
// A full-window canvas (the game page holds it to a phone's width).
const wide = document.createElement('style');
wide.textContent = '* { max-width: none !important; }';
document.head.appendChild(wide);
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const stage = new Stage(canvas, (params.get('quality') as 'low' | 'medium' | 'high') ?? 'high', null);
stage.lighting.setTime(Number(params.get('t') ?? '0.25'));
if (params.get('fog') !== '1') stage.scene.fog = null;
const floor = new THREE.Mesh(new GeoBuilder().box(0, -0.05, 0, 80, 0.1, 80, params.get('floor') ?? '#F4F4F2', 0, { shade: 1 }).build(), MATERIALS.solid);
floor.receiveShadow = true;
stage.scene.add(floor);

// Drawn through the game's own pull batch (as in play), unless ?batch=0.
const batch = params.get('batch') === '0' ? null : new CharacterBatch(SHADOW_GEOMETRY);
if (batch) {
  CharacterView.batch = batch;
  stage.scene.add(batch.group);
}

function lookOf(name: string): { look: CharacterLook; scale: number } {
  if (name === 'conductor') return { look: CONDUCTOR_LOOK, scale: 1.1 };
  if (name in STAFF_LOOKS) return { look: STAFF_LOOKS[name as keyof typeof STAFF_LOOKS], scale: 1 };
  const [id, v] = name.split(':');
  const a = ARCHETYPES.find((x) => x.id === id) ?? ARCHETYPES[0];
  const base: CharacterLook = { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor };
  return { look: guestLook(base, a, Number(v ?? '0')), scale: 1 };
}

const who = (params.get('who') ?? 'conductor,attendant,student,grandma').split(',');
const gap = Number(params.get('gap') ?? '0.9');
const views: CharacterView[] = [];
const face = Number(params.get('face') ?? '-0.6');
who.forEach((name, i) => {
  const { look, scale } = lookOf(name);
  const c = new CharacterView(look, scale);
  c.leans = false;
  c.setPosition((i - (who.length - 1) / 2) * gap, 0, 0);
  c.setFacing(face);
  const pose = params.get('pose');
  if (pose === 'sleep' || pose === 'sit' || pose === 'lounge') c.setPose(pose);
  if (params.get('carry') === '1') c.setCarrying(true);
  if (params.get('act')) c.act(params.get('act') as never, 99);
  stage.scene.add(c.root);
  views.push(c);
});

const cam = stage.rig.camera;
const pitch = (Number(params.get('pitch') ?? '40') * Math.PI) / 180;
const fov = Number(params.get('fov') ?? '20');
const yaw = (Number(params.get('yaw') ?? '0') * Math.PI) / 180;
const width = who.length * gap + 0.6;
const zoom = Number(params.get('zoom') ?? '1');
let last = performance.now();
let clock = 0;
const walk = params.get('walk') === '1';
const turn = params.get('turn') === '1';
const fixed = Number(params.get('dt') ?? '0');
/** Captures step the figures themselves (`__step`), one call per video frame; the page only draws. */
const manual = params.get('manual') === '1';
function frame(now: number): void {
  const dt = fixed || Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manual) {
    clock += dt;
    for (const v of views) {
      if (turn) v.setFacing(face + clock * 0.9);
      v.update(dt, walk ? Number(params.get('speed') ?? '1.6') : 0);
    }
  }
  cam.fov = fov;
  cam.near = 0.5;
  cam.far = 200;
  cam.aspect = canvas.clientWidth / canvas.clientHeight;
  cam.updateProjectionMatrix();
  const span = Math.max(width / cam.aspect, 1.9);
  const dist = (span / (2 * Math.tan((fov * Math.PI) / 360))) / zoom;
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.62 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(0, 0.62, 0);
  batch?.recordPoses();
  batch?.sync(cam, 1);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
/** Exports figure `i` (in its current pose, at the origin, without its blob shadow) as a GLB, base64, for Cycles. */
async function exportFigure(i: number, keepFacing = false): Promise<string> {
  const v = views[i];
  const root = v.root.clone(true);
  root.position.set(0, 0, 0);
  if (!keepFacing) root.rotation.set(0, 0, 0);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry?.getAttribute('color')?.itemSize === 4) m.visible = false;
    else if (m.isMesh) {
      // Only what Blender needs: the game's own attributes (pattern, surface, second colour) confuse its importer.
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color']) {
        const a = m.geometry.getAttribute(name);
        if (a) g.setAttribute(name, a.clone());
      }
      if (m.geometry.index) g.setIndex(m.geometry.index.clone());
      m.geometry = g;
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    }
    o.layers.enableAll();
  });
  root.updateMatrixWorld(true);
  const buf = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })) as ArrayBuffer;
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(bin);
}
/** Steps every figure by `dt` seconds (a fixed-step capture: one call per video frame). */
function step(dt: number): void {
  clock += dt;
  for (const v of views) {
    if (turn) v.setFacing(face + clock * 0.9);
    v.update(dt, walk ? Number(params.get('speed') ?? '1.6') : 0);
  }
}
Object.assign(window, { __ready: true, __export: exportFigure, __views: views, __step: step });
