import * as THREE from 'three';
import { ARCHETYPES, ROUTE1_CARRIAGES } from './config/content';
import { BED_TOP, CarriageView, FLOOR_Y } from './world/CarriageView';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS } from './world/CharacterView';
import { carriageOriginZ, getLayout } from './world/layout';
import { LocomotiveView } from './world/LocomotiveView';
import { Particles } from './world/Particles';
import { PlatformView } from './world/PlatformView';
import { Scenery } from './world/Scenery';
import { Stage } from './world/Stage';
import { TileView, ZoneRing } from './world/ZoneViews';
import { CashView } from './world/CashView';
import { setLivery } from './world/materials';
import { liveryFor } from './world/palette';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = new Stage(canvas);
const params = new URLSearchParams(location.search);
const time = Number(params.get('t') ?? '0.2');
const camZ = Number(params.get('z') ?? '4');
const camX = Number(params.get('x') ?? '0');
const platform = params.get('platform') === '1';
stage.lighting.setTime(time);
const scenery = new Scenery();
stage.scene.add(scenery.group);
const loco = new LocomotiveView();
stage.scene.add(loco.group);
const count = Number(params.get('n') ?? '5');
// ?tier=2 shows every carriage at one tier; ?tiers=0123 sets them one by one. ?level= picks the livery.
const tierParam = params.get('tier');
const tiers = params.get('tiers') ?? '';
const liv = liveryFor(Number(params.get('level') ?? '1'));
setLivery(liv.body, liv.trim);
ROUTE1_CARRIAGES.slice(0, count).forEach((c, i) => {
  const tier = tierParam !== null ? Number(tierParam) : Number(tiers[i] ?? '0');
  const view = new CarriageView(getLayout(c.type), i, tier);
  view.group.position.z = carriageOriginZ(i);
  if (c.type === 'lobby') { view.setCabinLocked(2, true); view.setDirt(1, [true, true, false]); view.setLuggageCount(3); }
  if (c.type === 'bathroom') { view.setBathroomLocked(1, true); view.setBathroomStock(0, 3, 2); }
  if (c.type === 'supply') view.setShelfStock(10, 12);
  if (platform) view.setDoorOpen(1);
  stage.scene.add(view.group);
});
scenery.setSpan(carriageOriginZ(count - 1) + 14);
if (platform) {
  const p = new PlatformView();
  p.build(carriageOriginZ(count - 1) + 14, count > 2 ? 2 : null, count > 3 ? 3 : null);
  p.setStationName('Millbrook');
  p.group.visible = true;
  stage.scene.add(p.group);
}
// A sleeper in the lobby's first cabin.
if (params.get('sleeper') !== '0') {
  const cabin = getLayout('lobby').cabins[0];
  const sleeper = new CharacterView({ ...ARCHETYPES[0].colors, accessory: 'none' });
  sleeper.setPose('sleep', '#7D9CBB');
  sleeper.setPosition((cabin.bed.x0 + cabin.bed.x1) / 2, FLOOR_Y + BED_TOP, cabin.bed.z0 + 0.27 + 1.02);
  sleeper.showBubble('zzz', 'plain', 1.0);
  stage.scene.add(sleeper.root);
}
const player = new CharacterView(CONDUCTOR_LOOK);
player.setPosition(-0.7, FLOOR_Y, 4.4);
player.setCarrying(true);
stage.scene.add(player.root);
ARCHETYPES.forEach((a, i) => {
  const g = new CharacterView({ ...a.colors, accessory: a.accessory, hat: a.id === 'backpacker' ? 'beanie' : a.id === 'grandma' ? 'bun' : 'none' });
  g.setPosition(-0.15 + (i % 3) * 0.7, FLOOR_Y, 2.8 + Math.floor(i / 3) * 0.75);
  g.setFacing(-Math.PI / 2);
  if (i === 0) g.showBubble('tea');
  stage.scene.add(g.root);
});
['attendant', 'porter', 'runner'].forEach((r, i) => {
  const s = new CharacterView(STAFF_LOOKS[r]);
  s.setPosition(-1.4, FLOOR_Y, 7 + i * 1.2);
  stage.scene.add(s.root);
});
const ring = new ZoneRing(0.55, 'person');
ring.setPosition(-1.68, 2.8); ring.progress = 0.6; stage.scene.add(ring.group);
const tile = new TileView();
tile.setPosition(0.2, 11.6); tile.face.draw('bed', 28, 0.3, true, false); stage.scene.add(tile.group);
const cash = new CashView(); stage.scene.add(cash.mesh);
cash.createPile('desk', -1.62, FLOOR_Y, 3.95); cash.setPileCount('desk', 9);
const particles = new Particles(); stage.scene.add(particles.points); stage.attachParticles(particles);
particles.emit('smoke', loco.chimneyTop.x, loco.chimneyTop.y, loco.chimneyTop.z, 6);
stage.rig.snapTo(camX, camZ);
stage.rig.setZoom(Number(params.get('zoom') ?? '1'));
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  scenery.update(dt, platform ? 0 : 14);
  loco.update(dt, 14);
  player.update(dt, 0); particles.update(dt); cash.update(dt); ring.update(dt); tile.update(dt, true, false);
  stage.rig.update(dt, camX, camZ);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { __ready: boolean }).__ready = true;
void THREE;
