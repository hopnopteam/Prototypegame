// Art iteration page for the characters (session 30): every guest type, its looks, the staff and the conductor on a
// plain floor. Build with ENTRY=src/lineup.ts OUT=lineup.html node scripts/build.mjs.
import * as THREE from 'three';
import { ARCHETYPES } from './config/content';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from './world/CharacterView';
import { GeoBuilder } from './world/geo';
import { MATERIALS } from './world/materials';
import { Stage } from './world/Stage';
import { guestLook } from './gameplay/guestLook';

document.getElementById('loader')?.remove();
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const stage = new Stage(canvas, (params.get('quality') as 'low' | 'medium' | 'high') ?? 'medium', null);
stage.lighting.setTime(Number(params.get('t') ?? '0.25'));
const floor = new THREE.Mesh(new GeoBuilder().box(0, -0.05, 0, 80, 0.1, 80, '#8C8F96', 0, { shade: 1 }).build(), MATERIALS.solid);
floor.receiveShadow = true;
stage.scene.add(floor);
const looks: { look: CharacterLook; scale?: number }[] = [];
const variants = Number(params.get('v') ?? '1');
for (const a of ARCHETYPES) {
  const base: CharacterLook = { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor };
  for (let v = 0; v < variants; v++) looks.push({ look: guestLook(base, a, v) });
}
looks.push({ look: CONDUCTOR_LOOK, scale: 1.1 });
for (const r of Object.keys(STAFF_LOOKS) as (keyof typeof STAFF_LOOKS)[]) looks.push({ look: STAFF_LOOKS[r] });
const from = Number(params.get('from') ?? '0');
const count = Number(params.get('n') ?? '99');
looks.splice(0, from);
looks.splice(count);
const cols = Number(params.get('cols') ?? '4');
const views: CharacterView[] = [];
const walk = params.get('walk') === '1';
looks.forEach((l, i) => {
  const c = new CharacterView(l.look, l.scale ?? 1);
  c.leans = false;
  c.setPosition((i % cols - (cols - 1) / 2) * 1.0, 0, Math.floor(i / cols) * 1.2);
  c.setFacing(Number(params.get('face') ?? '0.35'));
  if (params.get('carry') === '1' && i % 3 === 0) c.setCarrying(true);
  const pose = params.get('pose');
  if (pose === 'sleep' || pose === 'sit') c.setPose(pose);
  if (params.get('act')) c.act(params.get('act') as never, 99);
  stage.scene.add(c.root);
  views.push(c);
});
stage.rig.clampZ = [-40, 400];
const camX = Number(params.get('x') ?? '0');
const camZ = Number(params.get('z') ?? '2');
stage.rig.snapTo(camX, camZ);
stage.rig.setZoom(Number(params.get('zoom') ?? '0.45'));
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const v of views) v.update(dt, walk ? 1.6 : 0);
  stage.rig.update(dt, camX, camZ);
  const rows = Math.ceil(looks.length / cols);
  const cz = ((rows - 1) * 1.2) / 2;
  const cam = stage.rig.camera;
  const d = Number(params.get('d') ?? '1');
  cam.fov = 30; cam.near = 0.3; cam.aspect = canvas.clientWidth / canvas.clientHeight; cam.updateProjectionMatrix();
  const dist = d * (1.5 + rows * 2.2 + cols * 0.6);
  cam.position.set(0.15 * dist, 0.75 * dist, cz + 0.75 * dist);
  cam.lookAt(0, 0.5, cz);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { __ready: boolean }).__ready = true;
