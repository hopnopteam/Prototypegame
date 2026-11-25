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
import { loadDetailTextures } from './world/detailTextures';
import { CarryStack } from './gameplay/CarryStack';
import { Tweens } from './core/Tween';
import type { ItemKind } from './core/types';
import { createItemMesh } from './world/ItemMeshes';

document.getElementById('loader')?.remove();
// Session 63: the cloth, leather, felt and hair detail layers, as the game loads them (`__ready` waits for them).
const detailReady = loadDetailTextures();
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
  // A family's child (as Guests makes them), and figures with a given hairdo for checking hair (e.g. `vip.ponytail`).
  if (name === 'child') return { look: { body: '#F2C94C', accent: '#E26D8C', skin: '#E3AE87', hair: '#2F2520', hat: 'none', outfit: 'dress', pants: '#E26D8C', hairStyle: 'bob', shoe: '#D64B6A' }, scale: 0.62 };
  if (name.includes('.')) {
    const [base, hair] = name.split('.');
    const r = lookOf(base);
    return { look: { ...r.look, hairStyle: hair as CharacterLook['hairStyle'], hat: 'none' }, scale: r.scale };
  }
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

/**
 * Session 63, carrying: `?carry=tea,latte` (or `luggage`, `luggage,luggage`, `towel,blanket`, `crate`) gives each
 * figure a real CarryStack with those things; `?box=1` the supply box on the shoulder; `?cycle=3` takes the things one
 * by one from a counter in front and hands them back, over and over (each take and hand-over with its own move);
 * `?src=x,y,z` where they are taken from (figure space).
 */
const tweens = new Tweens();
const stacks: CarryStack[] = [];
const carried = (params.get('carry') ?? '').split(',').filter((k) => k && k !== '1') as ItemKind[];
const src = (params.get('src') ?? '0.15,0.75,0.75').split(',').map(Number);
const cycle = Number(params.get('cycle') ?? '0');
if (carried.length > 0 || params.get('box') === '1') {
  views.forEach((v) => {
    const st = new CarryStack(v.stackAnchor, stage.scene, tweens, 8, v.boardAnchor, v);
    stacks.push(st);
    if (params.get('box') === '1') {
      const box = createItemMesh('crate');
      box.scale.setScalar(0.5);
      box.position.set(0.36, 0.815, -0.03);
      box.rotation.set(0, 0, -0.08);
      box.userData.carried = true;
      v.body.add(box);
      v.setCarrying(false, false, true);
    }
    if (!cycle) for (const k of carried) st.add(k);
  });
}
function sourceOf(v: CharacterView): THREE.Vector3 {
  return v.root.localToWorld(new THREE.Vector3(src[0], src[1], src[2]));
}
let cycleClock = 0;
let cycleStep = 0;
function stepCycle(dt: number): void {
  if (!cycle || carried.length === 0) return;
  cycleClock += dt;
  if (cycleClock < cycle / (carried.length * 2)) return;
  cycleClock = 0;
  const n = carried.length;
  const k = cycleStep % (2 * n);
  views.forEach((v, i) => {
    const st = stacks[i];
    if (k < n) st.add(carried[k], sourceOf(v));
    else st.remove(carried[2 * n - 1 - k], () => sourceOf(v));
  });
  cycleStep++;
}

const cam = stage.rig.camera;
const pitch = (Number(params.get('pitch') ?? '40') * Math.PI) / 180;
const fov = Number(params.get('fov') ?? '20');
const yaw = (Number(params.get('yaw') ?? '0') * Math.PI) / 180;
const width = who.length * gap + 0.6;
const zoom = Number(params.get('zoom') ?? '1');
let last = performance.now();
let clock = 0;
const walk = params.get('walk') === '1';
/**
 * `?move=1` (session 62, the moving clothes): each figure really travels, pacing up and down the screen: it sets off,
 * walks 1.3 m, stops, turns round and comes back, so skirts, coat tails and hair show their inertia (walking in place
 * has none).
 */
const move = params.get('move') === '1';
const moveSpeed = Number(params.get('speed') ?? '1.6');
const home = views.map((v) => ({ x: v.root.position.x, z: 0 }));
function pace(v: CharacterView, i: number, t: number, dt: number): number {
  // A cycle: walk out (1.3 m), stop 0.9 s, turn, walk back, stop 0.9 s; each figure a little out of step.
  const walkT = 1.3 / moveSpeed;
  const cycle = 2 * (walkT + 0.9);
  const u = (t + i * 0.37) % cycle;
  let z = 0;
  let speed = 0;
  let facing = Math.PI;
  if (u < walkT) {
    z = -1.3 * (u / walkT);
    speed = moveSpeed;
    facing = Math.PI;
  } else if (u < walkT + 0.9) {
    z = -1.3;
    facing = u < walkT + 0.35 ? Math.PI : 0;
  } else if (u < 2 * walkT + 0.9) {
    z = -1.3 + 1.3 * ((u - walkT - 0.9) / walkT);
    speed = moveSpeed;
    facing = 0;
  } else {
    facing = u < 2 * walkT + 0.9 + 0.35 ? 0 : Math.PI;
  }
  v.setPosition(home[i].x, 0, z + 0.65);
  v.setFacing(facing + face * 0.3);
  void dt;
  return speed;
}
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
      const sp = move ? pace(v, views.indexOf(v), clock, dt) : walk ? Number(params.get('speed') ?? '1.6') : 0;
      v.update(dt, sp);
    }
    stepCycle(dt);
    tweens.update(dt);
    stacks.forEach((st, i) => st.update(dt, walk || move, clock + i));
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
  views.forEach((v, i) => {
    if (turn) v.setFacing(face + clock * 0.9);
    v.update(dt, move ? pace(v, i, clock, dt) : walk ? Number(params.get('speed') ?? '1.6') : 0);
  });
  stepCycle(dt);
  tweens.update(dt);
  stacks.forEach((st, i) => st.update(dt, walk || move, clock + i));
}
void detailReady.then(() => Object.assign(window, { __ready: true }));
Object.assign(window, { __export: exportFigure, __views: views, __step: step, __stacks: stacks });
