// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the cash, the tiles, the lakeside, the sounds) so it looks exactly like the game, and
// runs its own tiny, scripted loop: 3 deliveries, 2 carriage upgrades, the café, the theatre, the end card.
import * as THREE from 'three';
import { AudioEngine, type Sfx } from '../audio/AudioEngine';
import { ARCHETYPES } from '../config/content';
import type { CarriageType } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon, type IconName } from '../ui/icons';
import { BED_TOP, CarriageView, FLOOR_Y } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { CharacterView, CONDUCTOR_LOOK } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { GeoBuilder } from '../world/geo';
import { createItemMesh } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, type CarriageLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { MATERIALS, SHADOW_GEOMETRY, setLivery } from '../world/materials';
import { liveryFor, PALETTE } from '../world/palette';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { Stage } from '../world/Stage';
import { trainLightInput } from '../world/trainLight';
import { TileView } from '../world/ZoneViews';
import { buildEndCard } from './endcard';
import { adReady, openStore, onViewable } from './network';

// ---------------------------------------------------------------- tuning (all the ad's numbers in one place)
const TUNE = {
  /** Camera distance factor (below 1 is closer than the game). */
  zoom: 0.68,
  /** Walking speed (m/s) and what each carriage upgrade adds. */
  speed: 6.2,
  speedUp: 1.18,
  /** Each $ bill is worth this much. */
  bill: 10,
  /** Bills a delivery pays. */
  payBills: 6,
  /** Seconds a waiting customer stays calm before getting cross. */
  patience: 4.5,
  /** Within this distance a customer sees you coming (🙂) and is served. */
  noticeAt: 2.8,
  serveAt: 1.45,
  /** Cash piles are scooped within this distance; tiles are paid within this distance. */
  scoopAt: 1.35,
  tileAt: 0.95,
  /** Seconds between bills draining into a tile. */
  drain: 0.045,
  /** Seconds without a touch before the Play Now button shows anyway. */
  idleCta: 10,
  /** Seconds after the theatre opens before the end card. */
  endDelay: 3.2,
  /** Ride speed of the scenery (the train is on the move). */
  ride: 12,
};
const CAFE_TIER = 3;
const CINEMA_TIER = 2;
const NIGHT_TIME = 0.82;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));

// ---------------------------------------------------------------- stage
document.documentElement.classList.add('nx-ad');
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = new Stage(canvas, 'auto', null);
stage.lighting.setTime(NIGHT_TIME);
const scene = stage.scene;
const batch = new CharacterBatch(SHADOW_GEOMETRY);
CharacterView.batch = batch;
scene.add(batch.group);
const liv = liveryFor(3);
setLivery(liv.body, liv.trim);

const scenery = new Scenery();
scene.add(scenery.group);
const loco = new LocomotiveView();
loco.setName('The Night Owl');
scene.add(loco.group);
const particles = new Particles(500);
scene.add(particles.points);
stage.attachParticles(particles);
const cash = new CashView();
scene.add(cash.mesh);
const audio = new AudioEngine();
audio.prepare();

// The carriages: every future look is built now (hidden), so an upgrade is a swap and never a hitch.
const views = {
  sleeper0: new CarriageView(getLayout('sleeper', 0), 0, 0),
  sleeper2: new CarriageView(getLayout('sleeper', 2), 0, 2),
  sleeper4: new CarriageView(getLayout('sleeper', 4), 0, 4),
  cafe: new CarriageView(getLayout('cafe', CAFE_TIER), 1, CAFE_TIER),
  cinema: new CarriageView(getLayout('cinema', CINEMA_TIER), 2, CINEMA_TIER),
};
for (const [key, view] of Object.entries(views)) {
  view.group.position.z = carriageOriginZ(view.index);
  view.group.visible = key === 'sleeper0';
  scene.add(view.group);
  const venue = view.layout.venue;
  if (venue) {
    for (const g of venue.groups) view.setVenueGroupOpen(g.index, true);
    view.setVenueExtras(venue.extras.map((e) => e.key));
  }
}
views.cinema.setVenueFilm(0.3);
let sleeper = views.sleeper0;
const train: { type: CarriageType; tier: number; view: CarriageView }[] = [{ type: 'sleeper', tier: 0, view: sleeper }];
const map = new TrainMap(0.26);

function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  stage.lighting.setTrainSpan(-12, carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH);
  stage.lighting.invalidateShadows();
  scenery.setSpan(carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH);
}
rebuildTrain();

/** The nearest walkable point (tiles and piles must sit on the floor the player can reach). */
function walkableNear(x: number, z: number): { x: number; z: number } {
  if (map.walk.isWalkable(x, z)) return { x, z };
  for (let r = 0.1; r < 2; r += 0.1) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r;
      const pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (map.walk.isWalkable(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

// ---------------------------------------------------------------- people
const lookOf = (i: number) => {
  const a = ARCHETYPES[i % ARCHETYPES.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as ConstructorParameters<typeof CharacterView>[0];
};

const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
const me = { x: -1.55, z: 1.15, facing: 0, speed: 0, vx: 0, vz: 0 };

type Mood = 'wait' | 'angry' | 'smile' | 'love' | 'heart' | 'popcorn' | 'coffee' | 'none';

/** The thought bubble: white cloud, a face (and what they want). Drawn once per mood. */
const bubbleTextures = new Map<Mood, THREE.CanvasTexture>();
function bubbleTexture(mood: Mood): THREE.CanvasTexture {
  const cached = bubbleTextures.get(mood);
  if (cached) return cached;
  const W = 256;
  const H = 232;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const ink = '#2B2230';
  const red = mood === 'angry';
  ctx.lineWidth = 9;
  ctx.strokeStyle = ink;
  ctx.fillStyle = red ? '#FFE3DE' : '#FFFFFF';
  const blobs: [number, number, number][] = [[78, 92, 58], [128, 70, 64], [180, 92, 58], [100, 128, 52], [158, 128, 52]];
  const cloud = (pass: 'stroke' | 'fill'): void => {
    for (const [x, y, r] of blobs) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (pass === 'stroke') ctx.stroke();
      else ctx.fill();
    }
  };
  cloud('stroke');
  cloud('fill');
  for (const [x, y, r] of [[70, 186, 15], [46, 214, 9]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  const emoji: Record<Mood, string> = { wait: '😐', angry: '😠', smile: '🙂', love: '😍', heart: '💖', popcorn: '🍿', coffee: '☕', none: '' };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px: number) => `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
  if (mood === 'wait' || mood === 'angry' || mood === 'smile') {
    // What they feel, and what they want (the game's own tea icon).
    ctx.font = font(84);
    ctx.fillText(emoji[mood], 92, 104);
    drawIcon(ctx, 'tea', 170, 104, 78);
  } else {
    ctx.font = font(112);
    ctx.fillText(emoji[mood], 129, 104);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  bubbleTextures.set(mood, t);
  return t;
}

class Bubble {
  readonly sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  mood: Mood = 'none';
  private pop = 1;
  private t = Math.random() * 6;
  private shake = 0;
  constructor(private readonly size = 0.86) {
    this.sprite.renderOrder = 12;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  set(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.sprite.visible = mood !== 'none';
    if (mood !== 'none') (this.sprite.material as THREE.SpriteMaterial).map = bubbleTexture(mood);
    (this.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
    this.pop = 0;
    if (mood === 'angry') this.shake = 0.6;
  }
  update(dt: number, x: number, y: number, z: number): void {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4);
    this.shake = Math.max(0, this.shake - dt);
    // An elastic pop in, then a gentle bob.
    const p = this.pop;
    const s = p < 1 ? 1 + Math.sin(p * Math.PI * 2.5) * (1 - p) * 0.45 - (1 - p) * 0.5 : 1 + Math.sin(this.t * 3) * 0.03;
    const jitter = this.mood === 'angry' ? Math.sin(this.t * 40) * 0.03 * (0.4 + this.shake) : 0;
    this.sprite.position.set(x + jitter, y + Math.sin(this.t * 2.4) * 0.04, z);
    this.sprite.scale.set(this.size * s, this.size * (232 / 256) * s, 1);
  }
}

interface Guest {
  view: CharacterView;
  bubble: Bubble;
  x: number;
  y: number;
  z: number;
  pose: 'stand' | 'sleep' | 'sit';
  /** Delivery customers: waiting since, served, paid. */
  waiting: number;
  served: boolean;
  /** After being served the bubble alternates 😍 / 💖. */
  happyT: number;
  headY: number;
}
const guests: Guest[] = [];
function addGuest(look: number, x: number, z: number, pose: Guest['pose'], facing: number, y = FLOOR_Y): Guest {
  const view = new CharacterView(lookOf(look), 1.05);
  scene.add(view.root);
  const g: Guest = { view, bubble: new Bubble(), x, y, z, pose, waiting: 0, served: false, happyT: -1, headY: 2.05 };
  place(g, x, y, z, pose, facing);
  guests.push(g);
  return g;
}
function place(g: Guest, x: number, y: number, z: number, pose: Guest['pose'], facing: number, blanket?: string): void {
  g.x = x;
  g.y = y;
  g.z = z;
  g.pose = pose;
  g.view.setPose(pose, blanket);
  g.view.setPosition(x, y, z);
  g.view.setFacing(facing);
  g.headY = pose === 'sleep' ? 1.15 : pose === 'sit' ? 1.65 : 2.1;
}

// The three customers wait at their cabin doors in the corridor, each wanting a cup of tea.
const doorZ = (layout: CarriageLayout, i: number) => (layout.cabins[i].door[0] + layout.cabins[i].door[1]) / 2;
const customers = [0, 1, 2].map((i) => addGuest([3, 6, 0][i], -0.98, doorZ(views.sleeper0.layout, i), 'stand', -Math.PI / 2));
for (const c of customers) c.bubble.set('wait');

// The tray of teas the conductor carries.
const teas: THREE.Mesh[] = [0, 1, 2].map(() => {
  const m = createItemMesh('tea');
  m.scale.setScalar(1.25);
  scene.add(m);
  return m;
});
player.setCarrying(true);
interface Flying { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }
const flying: Flying[] = [];

// ---------------------------------------------------------------- cash on the conductor's back
const BACK_MAX = 48;
const BILL_STEP = 0.056;
const billGeometry = new GeoBuilder()
  .box(0, 0, 0, 0.42, 0.05, 0.24, PALETTE.cashEdge, 0, { shade: 1 })
  .box(0, 0.004, 0, 0.4, 0.05, 0.22, PALETTE.cash, 0, { shade: 1 })
  .box(0, 0.027, 0, 0.1, 0.007, 0.245, PALETTE.cashBand, 0, { shade: 1 })
  .build();
const back = new THREE.InstancedMesh(billGeometry, MATERIALS.solid, BACK_MAX);
back.frustumCulled = false;
back.count = 0;
scene.add(back);
let backCount = 0;
let backBounce = 0;
let lean = 0;
const dummy = new THREE.Object3D();
const backBase = new THREE.Vector3();
function updateBack(dt: number): void {
  backBounce = Math.max(0, backBounce - dt * 4);
  // The stack leans back as the conductor runs, and springs upright when they stop.
  lean += (Math.min(1, me.speed / TUNE.speed) - lean) * Math.min(1, dt * 6);
  const fx = Math.sin(me.facing);
  const fz = Math.cos(me.facing);
  const s = 1.12;
  backBase.set(me.x - fx * 0.3 * s, FLOOR_Y + 0.62 * s, me.z - fz * 0.3 * s);
  const n = Math.min(backCount, BACK_MAX);
  back.count = n;
  for (let i = 0; i < n; i++) {
    const h = i * BILL_STEP * (1 - 0.18 * backBounce * Math.sin((i / Math.max(1, n)) * Math.PI));
    const bend = (lean * 0.32 + Math.sin(clock * 9) * 0.02 * lean) * Math.pow(h / 1.6, 1.6);
    dummy.position.set(backBase.x - fx * bend, backBase.y + h, backBase.z - fz * bend);
    dummy.rotation.set(0, me.facing + Math.PI / 2 + (i % 3 === 1 ? 0.07 : i % 3 === 2 ? -0.05 : 0), 0);
    const pop = i === n - 1 ? 1 + backBounce * 0.4 : 1;
    dummy.scale.set(pop, pop, pop);
    dummy.updateMatrix();
    back.setMatrixAt(i, dummy.matrix);
  }
  back.instanceMatrix.needsUpdate = true;
}
const backTop = new THREE.Vector3();
function backTopPos(): THREE.Vector3 {
  return backTop.set(backBase.x, backBase.y + Math.min(backCount, BACK_MAX) * BILL_STEP + 0.05, backBase.z);
}
let money = 0;
function addBill(): void {
  backCount++;
  backBounce = 1;
  money += TUNE.bill;
  hudMoney(money);
  sfx('coin');
}

// ---------------------------------------------------------------- HUD (DOM)
const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <div class="ad-cash"><canvas width="96" height="96"></canvas><span>$0</span></div>
  <div class="ad-banner"></div>
  <div class="ad-hand"><svg viewBox="0 0 100 120" width="74" height="88"><path d="M38 10c0-6 10-6 10 0v40l3-1V40c0-6 10-6 10 0v12l3 0V46c0-6 10-6 10 0v10l3 1v-4c0-6 10-6 10 0v28c0 18-12 32-30 32H52c-10 0-16-4-22-12L10 74c-4-6 3-12 9-8l13 10h6z" fill="#FFF6E4" stroke="#2B2230" stroke-width="6" stroke-linejoin="round"/></svg></div>
  <button class="ad-cta" type="button">PLAY NOW</button>`;
const cashEl = ui.querySelector('.ad-cash span') as HTMLElement;
const cashBox = ui.querySelector('.ad-cash') as HTMLElement;
{
  const c = ui.querySelector('.ad-cash canvas') as HTMLCanvasElement;
  drawIcon(c.getContext('2d')!, 'cash', 48, 48, 92);
}
const banner = ui.querySelector('.ad-banner') as HTMLElement;
const hand = ui.querySelector('.ad-hand') as HTMLElement;
const cta = ui.querySelector('.ad-cta') as HTMLButtonElement;
cta.addEventListener('click', (e) => {
  e.stopPropagation();
  openStore();
});
function hudMoney(v: number): void {
  cashEl.textContent = `$${v}`;
  cashBox.classList.remove('bump');
  void cashBox.offsetWidth;
  cashBox.classList.add('bump');
}
let bannerTimer = 0;
function showBanner(title: string, sub = ''): void {
  banner.innerHTML = `<b>${title}</b>${sub ? `<i>${sub}</i>` : ''}`;
  banner.classList.remove('on');
  void banner.offsetWidth;
  banner.classList.add('on');
  bannerTimer = 1.9;
}
const proj = { x: 0, y: 0 };
const tmpV = new THREE.Vector3();
/** A number or word floating up from a point in the world. */
function floatText(text: string, x: number, y: number, z: number, cls = ''): void {
  tmpV.set(x, y, z);
  if (!stage.project(tmpV, proj)) return;
  const el = document.createElement('div');
  el.className = `ad-float ${cls}`;
  el.textContent = text;
  el.style.left = `${proj.x}px`;
  el.style.top = `${proj.y}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------------------------------------------------------------- sound
let soundOk = false;
function sfx(name: Sfx, pitch = 1): void {
  if (soundOk) audio.play(name, { pitch });
}

// ---------------------------------------------------------------- the script
type Step = { kind: 'deliver' } | { kind: 'tile'; tile: Tile } | { kind: 'scoop'; then: () => void } | { kind: 'end' };
interface Tile {
  view: TileView;
  x: number;
  z: number;
  icon: IconName;
  name: string;
  price: number;
  paid: number;
  sent: number;
  timer: number;
  done: boolean;
  onDone: () => void;
}
function makeTile(at: { x: number; z: number }, icon: IconName, name: string, price: number, onDone: () => void): Tile {
  const p = walkableNear(at.x, at.z);
  const view = new TileView(1.45);
  view.setPosition(p.x, p.z);
  scene.add(view.group);
  const tile: Tile = { view, x: p.x, z: p.z, icon, name, price, paid: 0, sent: 0, timer: 0, done: false, onDone };
  drawTile(tile);
  particles.emit('sparkle', p.x, FLOOR_Y + 0.3, p.z, 18, 0.5);
  sfx('pop');
  return tile;
}
function drawTile(t: Tile): void {
  const left = t.price - t.paid;
  t.view.face.draw(t.icon, left, t.paid / t.price, true, t.sent > 0);
  t.view.marker.draw(t.icon, t.name, left, true);
}

interface Pile { id: string; x: number; z: number; taking: boolean; empty: boolean }
let piles: Pile[] = [];
let pileSeq = 0;
/** A guest's tip: bills fly from them onto a pile on the floor, to be scooped. */
function dropPile(from: THREE.Vector3, at: { x: number; z: number }, bills: number, delay = 0): void {
  const p = walkableNear(at.x, at.z);
  const id = `p${pileSeq++}`;
  cash.createPile(id, p.x, FLOOR_Y, p.z);
  const pile: Pile = { id, x: p.x, z: p.z, taking: false, empty: false };
  piles.push(pile);
  setTimeout(() => {
    cash.flyToPile(id, from, bills);
    sfx('cash');
  }, delay * 1000);
}

let step: Step = { kind: 'deliver' };
let served = 0;
let stage2 = 0;
let started = false;
let ended = false;
let speedNow = TUNE.speed;
let clock = 0;
let endAt = -1;
let finale: { x: number; z: number } | null = null;

function target(): { x: number; z: number } | null {
  if (step.kind === 'deliver') {
    const c = customers.find((g) => !g.served);
    return c ? { x: c.x - 0.45, z: c.z } : null;
  }
  if (step.kind === 'scoop') {
    let best: Pile | null = null;
    let bestD = 1e9;
    for (const p of piles) {
      if (p.taking) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
  if (step.kind === 'tile') return step.tile;
  return null;
}

function updateCustomers(dt: number): void {
  for (const g of guests) {
    g.view.update(dt, 0);
    if (g.happyT >= 0) {
      g.happyT += dt;
      g.bubble.set(Math.floor(g.happyT / 0.9) % 2 === 0 ? 'love' : 'heart');
      if (Math.random() < dt * 1.4) particles.emit('heart', g.x, g.y + g.headY - 0.3, g.z, 1, 0.2);
    }
    g.bubble.update(dt, g.x, g.y + g.headY, g.z);
  }
  if (step.kind !== 'deliver' || !started) return;
  for (const g of customers) {
    if (g.served) continue;
    g.waiting += dt;
    const d = Math.hypot(g.x - me.x, g.z - me.z);
    if (d < TUNE.noticeAt) g.bubble.set('smile');
    else if (g.waiting > TUNE.patience) {
      if (g.bubble.mood !== 'angry') {
        sfx('grumble');
        g.view.act('stomp', 0.6);
      }
      g.bubble.set('angry');
    } else g.bubble.set('wait');
    g.view.setFacing(Math.atan2(me.x - g.x, me.z - g.z));
    if (d < TUNE.serveAt && teas.length > 0) serve(g);
  }
}

function serve(g: Guest): void {
  g.served = true;
  const cup = teas.pop()!;
  const from = cup.position.clone();
  flying.push({
    mesh: cup, from, to: () => tmpTo.set(g.x, FLOOR_Y + 1.1, g.z), t: 0, dur: 0.28,
    done: () => {
      scene.remove(cup);
      g.view.act('sip', 2.4);
      g.happyT = 0;
      g.bubble.set('love');
      sfx('ding');
      particles.emit('heart', g.x, FLOOR_Y + 1.9, g.z, 6, 0.3);
      particles.emit('sparkle', g.x, FLOOR_Y + 1.2, g.z, 10, 0.3);
      floatText(`+$${TUNE.payBills * TUNE.bill}`, g.x, FLOOR_Y + 2.4, g.z, 'money');
      cash.stream(() => tmpFrom.set(g.x, FLOOR_Y + 1.1, g.z), backTopPos, TUNE.payBills, 0.07, addBill);
      served++;
      if (served === 3) setTimeout(() => startTile1(), 450);
    },
  });
  if (teas.length === 0) player.setCarrying(false);
  sfx('drop');
}
const tmpTo = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();

function startTile1(): void {
  const z = (views.sleeper0.layout.cabins[2].door[1] + views.sleeper0.layout.cabins[3].door[0]) / 2 + 0.4;
  step = { kind: 'tile', tile: makeTile({ x: -1.55, z }, 'wrench', 'Upgrade', 150, () => upgradeSleeper(2)) };
}

/** Makeover: the old carriage drops away and the new one springs up, bigger rooms, a class up. */
const pops: { group: THREE.Object3D; t: number; dur: number }[] = [];
function popIn(group: THREE.Object3D, dur = 0.7): void {
  group.visible = true;
  group.scale.set(1, 0.02, 1);
  pops.push({ group, t: 0, dur });
}
function burstAlong(z0: number, z1: number, kind: 'confetti' | 'dust' | 'sparkle' | 'star', count: number): void {
  for (let i = 0; i < count; i++) {
    const z = z0 + ((i + 0.5) / count) * (z1 - z0);
    particles.emit(kind, -0.2 + (Math.random() - 0.5) * 3.6, FLOOR_Y + 0.4 + Math.random() * 0.8, z, 1, 0.3);
  }
}

function upgradeSleeper(tier: 2 | 4): void {
  const next = tier === 2 ? views.sleeper2 : views.sleeper4;
  sleeper.group.visible = false;
  sleeper = next;
  train[0] = { type: 'sleeper', tier, view: next };
  popIn(next.group);
  rebuildTrain();
  me.x = walkableNear(me.x, me.z).x;
  burstAlong(0.5, 17.5, 'dust', 26);
  burstAlong(0.5, 17.5, 'confetti', 40);
  burstAlong(0.5, 17.5, 'sparkle', 30);
  stage.rig.shake(0.18, 0.35);
  stage.rig.punch(0.08);
  stage.rig.focusOn(new THREE.Vector3(0.2, 0, 8.6), 1.3, 1.25);
  sfx('reveal');
  setTimeout(() => sfx('levelup'), 350);
  speedNow *= TUNE.speedUp;
  showBanner(tier === 2 ? 'COMFORT CLASS!' : 'FIRST CLASS!', tier === 2 ? 'Bigger cabins · x2 💵 · ⚡ faster' : 'Grand suites · x5 💵 · ⚡ faster');
  stage2++;
  // The customers move into the new rooms, tucked up and delighted, and leave tips at their doors.
  const layout = next.layout;
  const sleepers = guests.filter((g) => g.pose !== 'sit');
  const rooms = layout.cabins;
  sleepers.forEach((g, i) => {
    const cabin = rooms[i % rooms.length];
    if (i >= rooms.length) {
      g.view.root.visible = false;
      g.bubble.set('none');
      g.happyT = -1;
      return;
    }
    place(g, cabin.bedPose.x, FLOOR_Y + BED_TOP, cabin.bedPose.z, 'sleep', 0, next.blanketColor);
    g.happyT = 0.45 * i;
    g.bubble.set('love');
  });
  if (tier === 2 && sleepers.length < rooms.length) {
    const cabin = rooms[3];
    const extra = addGuest(9, cabin.bedPose.x, cabin.bedPose.z, 'sleep', 0, FLOOR_Y + BED_TOP);
    place(extra, cabin.bedPose.x, FLOOR_Y + BED_TOP, cabin.bedPose.z, 'sleep', 0, next.blanketColor);
    extra.happyT = 1.2;
  }
  // Tips: two piles on the way to the next upgrade.
  piles = [];
  const ahead = tier === 2 ? [{ x: -1.45, z: me.z + 1.7 }, { x: -1.6, z: me.z + 3.3 }] : [{ x: -1.5, z: me.z + 1.5 }, { x: 1.2, z: 17.15 }];
  ahead.forEach((p, i) => {
    const g = sleepers[i % Math.max(1, Math.min(sleepers.length, rooms.length))];
    dropPile(new THREE.Vector3(g.x, FLOOR_Y + 1.2, g.z), p, tier === 2 ? 9 : 10, 0.9 + i * 0.25);
  });
  setTimeout(() => {
    step = {
      kind: 'scoop',
      then: () => {
        if (tier === 2) step = { kind: 'tile', tile: makeTile({ x: -1.55, z: me.z + 1.4 }, 'wrench', 'Upgrade', 180, () => upgradeSleeper(4)) };
        else step = { kind: 'tile', tile: makeTile({ x: -0.15, z: 17.3 }, 'latte', 'Café', 200, openCafe) };
      },
    };
  }, 1000);
}

function openVenue(view: CarriageView, type: CarriageType, tier: number, title: string, sub: string): void {
  train.push({ type, tier, view });
  view.group.position.z = carriageOriginZ(view.index);
  popIn(view.group, 0.8);
  rebuildTrain();
  const z0 = carriageOriginZ(view.index);
  burstAlong(z0, z0 + 18, 'dust', 30);
  burstAlong(z0, z0 + 18, 'confetti', 50);
  burstAlong(z0, z0 + 18, 'star', 16);
  stage.rig.shake(0.25, 0.4);
  stage.rig.punch(0.1);
  // The theatre is the finale: the camera glides onto its seats and stays there until the end card.
  if (type === 'cinema') finale = { x: -0.2, z: z0 + 10.2 };
  else stage.rig.focusOn(new THREE.Vector3(0.2, 0, z0 + 9), 1.6, 1.3);
  sfx('clunk');
  setTimeout(() => sfx('reveal'), 250);
  setTimeout(() => sfx('perfect'), 700);
  showBanner(title, sub);
}

function openCafe(): void {
  const view = views.cafe;
  openVenue(view, 'cafe', CAFE_TIER, 'CAFÉ OPEN!', 'Lattes & croissants · x3 💵');
  const z0 = carriageOriginZ(1);
  const seats = view.layout.venue!.seats;
  const sat: Guest[] = [];
  [0, 3, 4, 7].forEach((s, i) => {
    const seat = seats[s];
    const g = addGuest([1, 4, 7, 10][i], seat.sit.x, z0 + seat.sit.z, 'sit', seat.facing, FLOOR_Y + seat.top - 0.24);
    g.happyT = 0;
    g.bubble.set('coffee');
    sat.push(g);
    setTimeout(() => {
      g.view.act('sip', 3);
      g.happyT = 0.3 * i;
      g.bubble.set('love');
      sfx('heart');
    }, 900 + i * 260);
  });
  piles = [];
  dropPile(new THREE.Vector3(sat[0].x, FLOOR_Y + 1.2, sat[0].z), { x: -0.5, z: z0 + 5.4 }, 12, 1.2);
  dropPile(new THREE.Vector3(sat[2].x, FLOOR_Y + 1.2, sat[2].z), { x: 0, z: z0 + 11.6 }, 13, 1.5);
  setTimeout(() => {
    step = { kind: 'scoop', then: () => (step = { kind: 'tile', tile: makeTile({ x: 0, z: z0 + 15.6 }, 'film', 'Theatre', 250, openCinema) }) };
  }, 1300);
}

function openCinema(): void {
  const view = views.cinema;
  openVenue(view, 'cinema', CINEMA_TIER, 'THEATRE OPEN!', 'Movie night · 🍿 · x10 💵');
  const z0 = carriageOriginZ(2);
  const seats = view.layout.venue!.seats;
  [0, 1, 2, 3, 6, 7, 8, 9, 10].forEach((s, i) => {
    const seat = seats[s];
    if (!seat) return;
    const g = addGuest(i + 2, seat.sit.x, z0 + seat.sit.z, 'sit', seat.facing, FLOOR_Y + seat.top - 0.24);
    g.bubble.set(i % 3 === 0 ? 'popcorn' : 'love');
    g.happyT = i % 3 === 0 ? -1 : 0.2 * i;
    setTimeout(() => {
      g.happyT = 0.2 * i;
      cash.stream(() => tmpFrom.set(g.x, FLOOR_Y + 1.2, g.z), backTopPos, 3, 0.08, addBill);
    }, 900 + i * 140);
  });
  step = { kind: 'end' };
  endAt = clock + TUNE.endDelay;
}

function updateStep(dt: number): void {
  if (step.kind === 'scoop') {
    for (const p of piles) {
      if (p.taking) continue;
      if (Math.hypot(p.x - me.x, p.z - me.z) < TUNE.scoopAt && cash.pileCount(p.id) > 0) {
        p.taking = true;
        cash.vacuum(p.id, backTopPos, () => addBill(), () => {
          p.empty = true;
          cash.removePile(p.id);
        });
        floatText(`+$${cash.pileCount(p.id) * TUNE.bill}`, p.x, FLOOR_Y + 1.6, p.z, 'money');
      }
    }
    if (piles.length > 0 && piles.every((p) => p.empty)) {
      const then = step.then;
      piles = [];
      then();
    }
  } else if (step.kind === 'tile') {
    const t = step.tile;
    const on = Math.hypot(t.x - me.x, t.z - me.z) < TUNE.tileAt;
    t.view.update(dt, true, on || t.sent > 0, true, false);
    if (on || t.sent > 0) {
      t.timer -= dt;
      const bills = t.price / TUNE.bill;
      while (t.timer <= 0 && t.sent < bills && backCount > 0) {
        t.timer += TUNE.drain;
        t.sent++;
        const from = backTopPos().clone();
        backCount--;
        cash.stream(() => from, () => tmpTo.set(t.x, FLOOR_Y + 0.15, t.z), 1, 0, () => {
          t.paid += TUNE.bill;
          money -= TUNE.bill;
          cashEl.textContent = `$${Math.max(0, money)}`;
          drawTile(t);
          sfx('tick', 0.9 + (t.paid / t.price) * 0.6);
          if (t.paid >= t.price && !t.done) {
            t.done = true;
            finishTile(t);
          }
        });
      }
      // Never stuck: if the back runs dry (it should not), the tile completes anyway.
      if (backCount === 0 && t.sent < bills && t.sent > 0 && !t.done) {
        t.sent = bills;
        t.paid = t.price;
        t.done = true;
        finishTile(t);
      }
    }
  } else if (step.kind === 'end' && endAt > 0 && clock >= endAt && !ended) {
    endGame();
  }
}

function finishTile(t: Tile): void {
  particles.emit('sparkle', t.x, FLOOR_Y + 0.4, t.z, 30, 0.6);
  particles.emit('star', t.x, FLOOR_Y + 0.6, t.z, 10, 0.4);
  sfx('unlock');
  const g = t.view.group;
  const t0 = clock;
  const shrink = (): void => {
    const k = (clock - t0) / 0.25;
    if (k >= 1) {
      scene.remove(g);
      return;
    }
    g.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.3 - k);
    requestAnimationFrame(shrink);
  };
  shrink();
  step = { kind: 'end' };
  t.onDone();
}

// ---------------------------------------------------------------- input: drag anywhere (an invisible floating stick), or tap to go
let pointerId = -1;
let originX = 0;
let originY = 0;
let stickX = 0;
let stickY = 0;
let downAt = 0;
let lastInput = 0;
let autoWalk = false;
const ground = { x: 0, y: 0 };
const STICK_PX = 46;
function onFirstTouch(): void {
  soundOk = audio.unlock() || soundOk;
  if (!started) {
    started = true;
    document.documentElement.classList.add('nx-started');
  }
}
window.addEventListener('pointerdown', (e) => {
  if (ended) return;
  onFirstTouch();
  pointerId = e.pointerId;
  originX = e.clientX;
  originY = e.clientY;
  stickX = 0;
  stickY = 0;
  downAt = performance.now();
  lastInput = clock;
  autoWalk = false;
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId) return;
  let dx = e.clientX - originX;
  let dy = e.clientY - originY;
  const len = Math.hypot(dx, dy);
  // The stick's origin follows the finger past the rim, so a long drag never feels stuck.
  if (len > STICK_PX) {
    originX = e.clientX - (dx / len) * STICK_PX;
    originY = e.clientY - (dy / len) * STICK_PX;
    dx = (dx / len) * STICK_PX;
    dy = (dy / len) * STICK_PX;
  }
  stickX = dx / STICK_PX;
  stickY = dy / STICK_PX;
  lastInput = clock;
});
const release = (e: PointerEvent): void => {
  if (e.pointerId !== pointerId) return;
  onFirstTouch();
  const quick = performance.now() - downAt < 280 && Math.hypot(stickX, stickY) < 0.3;
  pointerId = -1;
  stickX = 0;
  stickY = 0;
  // A tap walks the conductor to whatever comes next: nobody can get lost.
  if (quick) autoWalk = true;
  lastInput = clock;
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('touchend', () => onFirstTouch(), { passive: true });

function updatePlayer(dt: number): void {
  let mx = 0;
  let mz = 0;
  let mag = Math.min(1, Math.hypot(stickX, stickY));
  if (mag > 0.12) {
    stage.rig.screenToGround(stickX, stickY, ground);
    const l = Math.hypot(ground.x, ground.y) || 1;
    mx = ground.x / l;
    mz = ground.y / l;
    mag = Math.min(1, (mag - 0.12) / 0.5);
  } else if (autoWalk) {
    const t = target();
    if (t) {
      const dx = t.x - me.x;
      const dz = t.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        mx = dx / d;
        mz = dz / d;
        mag = 1;
      } else autoWalk = false;
    } else mag = 0;
  } else mag = 0;
  const want = mag * speedNow;
  me.speed += (want - me.speed) * Math.min(1, dt * (want > me.speed ? 14 : 22));
  if (mag > 0) {
    me.vx = mx;
    me.vz = mz;
    const goal = Math.atan2(mx, mz);
    let d = goal - me.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    me.facing += d * Math.min(1, dt * 16);
  }
  if (me.speed > 0.01) {
    const pos = { x: me.x, z: me.z };
    map.walk.move(pos, me.vx * me.speed * dt, me.vz * me.speed * dt, 0.5, 1.3);
    // Never past the last carriage's end (its gangway leads nowhere yet), nor into the locomotive.
    const rear = carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH - 0.45;
    pos.z = Math.max(0.45, Math.min(rear, pos.z));
    me.x = pos.x;
    me.z = pos.z;
  }
  player.setPosition(me.x, FLOOR_Y, me.z);
  player.setFacing(me.facing);
  player.update(dt, me.speed);
  // The teas ride on the tray in front of the conductor.
  const fx = Math.sin(me.facing);
  const fz = Math.cos(me.facing);
  teas.forEach((m, i) => {
    m.position.set(me.x + fx * 0.42, FLOOR_Y + 0.86 + i * 0.2 + Math.sin(clock * 10 + i) * 0.01 * (me.speed / speedNow), me.z + fz * 0.42);
    m.rotation.y = me.facing;
  });
}

// ---------------------------------------------------------------- guide: the game's gold arrow, and a pulsing hand when idle
const arrow = makeSprite(guideArrowTexture(), 0.62);
arrow.material.toneMapped = false;
scene.add(arrow);
function updateGuide(): void {
  const t = target();
  const busy = step.kind === 'tile' && step.tile.sent > 0;
  arrow.visible = !!t && !busy && !ended;
  if (t) arrow.position.set(t.x, FLOOR_Y + 1.35 + Math.abs(Math.sin(clock * 4)) * 0.25, t.z);
  // The hand: in the first seconds and whenever the player pauses, it drags from the conductor toward the goal.
  const idle = clock - lastInput;
  const show = !!t && !ended && !busy && (!started || idle > 2.2) && pointerId < 0 && !autoWalk;
  hand.classList.toggle('on', show);
  if (!show || !t) return;
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  tmpV.set(me.x, FLOOR_Y + 0.6, me.z);
  if (!stage.project(tmpV, a)) return;
  tmpV.set(t.x, FLOOR_Y + 0.2, t.z);
  if (!stage.project(tmpV, b)) return;
  // Keep the gesture short: a thumb-sized drag in the goal's direction.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const reach = Math.min(l, 90);
  const cyc = (clock % 1.3) / 1.3;
  const k = cyc < 0.15 ? 0 : cyc > 0.8 ? 1 : (cyc - 0.15) / 0.65;
  const e = k * k * (3 - 2 * k);
  const x = a.x + 30 + (dx / l) * reach * e;
  const y = a.y + 60 + (dy / l) * reach * e;
  const press = cyc < 0.15 ? 0.88 + cyc : cyc > 0.85 ? 1 : 0.9;
  hand.style.transform = `translate(${x}px, ${y}px) scale(${press})`;
  hand.style.opacity = cyc > 0.9 ? String(1 - (cyc - 0.9) * 10) : '1';
}

// ---------------------------------------------------------------- end card
const endCard = buildEndCard(() => openStore());
document.body.appendChild(endCard);
function endGame(): void {
  ended = true;
  hand.classList.remove('on');
  cta.classList.remove('on');
  endCard.classList.add('on');
  sfx('levelup');
}

// ---------------------------------------------------------------- frame
function resize(): void {
  stage.resize();
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  // Portrait: the game's framing, closer. Landscape: the rig frames a width of floor, so a wide screen would come in
  // far too close; keep about 7 m of floor top to bottom instead.
  stage.rig.setZoom(aspect > 0.9 ? Math.max(TUNE.zoom, 0.9 * aspect) : TUNE.zoom);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

stage.rig.clampX = [-2.2, 2.2];
stage.rig.clampZ = [-3, 60];
let smokeT = 0;
let last = performance.now();
let paused = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * TEST_SPEED;
  last = now;
  if (!paused) {
    clock += dt;
    if (started && !ended) {
      updatePlayer(dt);
      updateStep(dt);
    } else {
      player.setPosition(me.x, FLOOR_Y, me.z);
      player.setFacing(me.facing);
      player.update(dt, 0);
      updatePlayer(0);
      if (step.kind === 'tile') step.tile.view.update(dt, true, false);
    }
    updateCustomers(dt);
    updateBack(dt);
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt / f.dur;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to(), k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      if (k >= 1) {
        flying.splice(i, 1);
        f.done();
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt / p.dur;
      const k = Math.min(1, p.t);
      // Spring up past full height and settle (an elastic ease-out).
      const y = k >= 1 ? 1 : 1 - Math.cos(k * Math.PI * 3.2) * Math.exp(-k * 5.5);
      p.group.scale.set(1 + (1 - y) * 0.06, Math.max(0.02, y), 1 + (1 - y) * 0.06);
      if (k >= 1) {
        p.group.scale.set(1, 1, 1);
        pops.splice(i, 1);
        stage.lighting.invalidateShadows();
      }
    }
    for (const c of train) c.view.animate(dt);
    for (const v of Object.values(views)) if (v.group.visible && !train.some((c) => c.view === v)) v.animate(dt);
    scenery.update(dt, TUNE.ride);
    loco.update(dt, TUNE.ride);
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.3;
      particles.emit('smoke', loco.chimneyTop.x, loco.chimneyTop.y, loco.chimneyTop.z, 2);
    }
    particles.update(dt);
    cash.update(dt);
    updateGuide();
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) banner.classList.remove('on');
    }
    // Ten seconds without a touch: the install button shows anyway (and stays).
    if (!ended && clock - lastInput > TUNE.idleCta) cta.classList.add('on');
    stage.rig.update(dt, finale ? finale.x : me.x, finale ? finale.z : me.z);
    batch.sync(stage.rig.camera);
    audio.update(dt);
    stage.render(dt);
  }
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  resize();
  me.facing = 0;
  stage.rig.snapTo(me.x, me.z);
  updateBack(0);
  // A frame straight away (no loading screen), then the shaders compile before play.
  batch.sync(stage.rig.camera);
  stage.render(0.016);
  await stage.warmUp(2500).catch(() => undefined);
  await adReady();
  onViewable((visible) => {
    paused = !visible;
    audio.setPaused(!visible);
    last = performance.now();
  });
  document.documentElement.classList.add('nx-ready');
  last = performance.now();
  requestAnimationFrame(frame);
}
void boot();
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return { step: step.kind, served, money, backCount, me, ended, clock, stage2, piles: piles.length };
  },
  views,
  noEnd: () => (endAt = 1e9),
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
