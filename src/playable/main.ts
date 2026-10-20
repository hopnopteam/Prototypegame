// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the cash, the tiles, the lakeside, the sounds) so it looks exactly like the game.
//
// The loop (quick, and every step follows from the one before):
//  1. Three passengers wait at their cabin doors for tea. Pick up a tray at the tea urn and serve them; each pays and
//     goes into their cabin.
//  2. The money on your back buys a Comfort Class refit of their carriage; delighted with their new cabins, each guest
//     pays the dearer Comfort fare at their door. Collect it.
//  3. That buys Business Class; the guests pay the Business fare.
//  4. That buys a Café Car, which rolls in and couples on; two guests stroll through to it and order lattes. Make and
//     serve them.
//  5. That buys a Theatre Car; the guests move through to it. Start the film: every seat pays for a ticket.
//  6. The end card: "CHOOSE NEXT TRAIN UPGRADE" (or after 15 s without a touch).
import * as THREE from 'three';
import { AudioEngine, isAndroid, type Sfx } from '../audio/AudioEngine';
import { ARCHETYPES } from '../config/content';
import { VISUALS } from '../config/visuals';
import { frameWork } from '../core/Background';
import { rect, type CarriageType, type ItemKind, type Vec2 } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon, type IconName } from '../ui/icons';
import { BED_TOP, CarriageView, FLOOR_Y } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { CharacterView, CONDUCTOR_LOOK, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, INNER, type CabinLayout, type CarriageLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { MATERIALS, SHADOW_GEOMETRY, setLivery } from '../world/materials';
import { liveryFor, PALETTE } from '../world/palette';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { Stage } from '../world/Stage';
import { trainLightInput } from '../world/trainLight';
import { JobMarker, TileView } from '../world/ZoneViews';
import { buildEndCard } from './endcard';
import { adReady, onViewable, openStore } from './network';

// ================================================================ tuning: every number of the ad in one place
const TUNE = {
  /** Camera distance factor (the game's framing is 1): a little closer than the game, further than before. */
  zoom: 0.8,
  /** Camera easing: higher follows more tightly (the game uses 5). */
  follow: 7,
  /** Walking speed (m/s), and what each upgrade adds. */
  speed: 5.8,
  speedUp: 1.1,
  /** Guests' walking speed (m/s). */
  guestSpeed: 4.2,
  /** Each bill is worth $10. */
  bill: 10,
  /** Bills paid: a tea, the Comfort and Business fares (each guest), a latte, a theatre ticket (each seat). */
  pay: { tea: 6, comfort: 6, business: 8, latte: 8, ticket: 10 },
  /** Upgrade prices: each is less than what the step before it pays, so it is always earned and never stuck. */
  price: { comfort: 150, business: 180, cafe: 220, theatre: 160 },
  /** Seconds a job takes: picking up at the urn or the machine, starting the film. */
  pickUp: 0.45,
  projector: 0.9,
  /** Reaches (m). */
  pickReach: 1.15,
  serveReach: 1.5,
  scoopReach: 1.3,
  tileReach: 0.9,
  /** A guest waiting this long for their order is cross (😠). */
  patience: 6,
  /** Seconds between bills draining into an upgrade. */
  drain: 0.045,
  /** Seconds without a touch before the hand shows, and before the end card shows anyway. */
  hesitate: 2.2,
  idleEnd: 15,
  /** The train's speed (m/s; slow enough that the sleepers never strobe). */
  ride: 7,
  /** Seconds after the film starts before the end card. */
  endDelay: 3.4,
};
const NIGHT_TIME = 0.82;
const SLEEPER_TIERS = [1, 2, 3] as const;
const CAFE_TIER = 3;
const CINEMA_TIER = 2;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));

// ================================================================ the scene
// Camera: centred on the conductor (no lead ahead, no lean over the lake), a firm, eased follow.
VISUALS.camera.followSharpness = TUNE.follow;
VISUALS.camera.lookAhead = 0;
VISUALS.camera.lakeBias = 0;
// No shadow maps at all: people and things keep their soft blob shadows. A shadow map redrawn when the train changes
// popped in after upgrades and drew dark blocks on some phones; blobs are steady and cost nothing.
for (const tier of Object.values(VISUALS.quality.tiers)) {
  tier.shadows = 'off';
  // Mid-range phones: no bloom, no multisampled off-screen pass, no planar reflections or SSAO.
  tier.bloom = 0;
  tier.msaa = 0;
  tier.reflections = 0;
  tier.ssao = false;
}
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = new Stage(canvas, isAndroid() ? 'low' : 'medium', null);
stage.lighting.setTime(NIGHT_TIME);
const scene = stage.scene;
const batch = new CharacterBatch(SHADOW_GEOMETRY);
CharacterView.batch = batch;
scene.add(batch.group);
const livery = liveryFor(3);
setLivery(livery.body, livery.trim);
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
audio.setVolume(0.7);

// The café's floor: a soft woven carpet wall to wall instead of its marble checker (the ad only; the game is untouched).
getLayout('cafe', CAFE_TIER).venue!.carpets = [{ rect: rect(-INNER + 0.05, 0.05, INNER - 0.05, 16.3), style: 'persian' }];

// Every carriage the ad shows is built now, hidden, so an upgrade is a swap and never a hitch mid-play. The sleeper
// starts repaired (tier 1: the run-down tier's holes in the floor read as black boxes on a small screen).
const SLOT = { sleeper: 0, cafe: 1, cinema: 2 } as const;
const sleeperViews = SLEEPER_TIERS.map((tier) => new CarriageView(getLayout('sleeper', tier), SLOT.sleeper, tier));
const cafeView = new CarriageView(getLayout('cafe', CAFE_TIER), SLOT.cafe, CAFE_TIER);
const cinemaView = new CarriageView(getLayout('cinema', CINEMA_TIER), SLOT.cinema, CINEMA_TIER);
for (const view of [...sleeperViews, cafeView, cinemaView]) {
  view.group.position.z = carriageOriginZ(view.index);
  view.group.visible = view === sleeperViews[0];
  scene.add(view.group);
  const venue = view.layout.venue;
  if (venue) {
    for (const g of venue.groups) view.setVenueGroupOpen(g.index, true);
    view.setVenueExtras(venue.extras.map((e) => e.key));
  }
}
let sleeperLevel = 0;
interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [{ type: 'sleeper', tier: SLEEPER_TIERS[0], view: sleeperViews[0] }];
const map = new TrainMap(0.3);
const trainRear = (): number => carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH;
function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  scenery.setSpan(trainRear());
}
rebuildTrain();

/** The nearest point the conductor can stand on. */
function walkableNear(x: number, z: number): Vec2 {
  if (map.walk.isWalkable(x, z)) return { x, z };
  for (let r = 0.08; r < 2.5; r += 0.08) {
    for (let a = 0; a < 20; a++) {
      const px = x + Math.cos((a / 20) * Math.PI * 2) * r;
      const pz = z + Math.sin((a / 20) * Math.PI * 2) * r;
      if (map.walk.isWalkable(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}
/** A route through the train (the game's nav graph: through doorways, round furniture), ending exactly at `to`. */
function route(from: Vec2, to: Vec2, toNode?: string): Vec2[] {
  const a = map.nearestNode(from.x, from.z);
  const b = toNode ?? map.nearestNode(to.x, to.z);
  const nodes = a && b ? map.pathBetweenNodes(a, b) : null;
  const pts = nodes ? nodes.map((p) => ({ x: p.x, z: p.z })) : [];
  pts.push({ x: to.x, z: to.z });
  return pts;
}
/** Whether one can walk a straight line from a to b (sampled every 12 cm). */
function straight(a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 1; i <= n; i++) if (!map.walk.isWalkable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
  return true;
}

// ================================================================ a scheduler on the ad's own clock (it pauses with the ad)
let clock = 0;
const timers: { at: number; fn: () => void }[] = [];
function later(seconds: number, fn: () => void): void {
  timers.push({ at: clock + seconds, fn });
}
function runTimers(): void {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].at > clock) continue;
    const t = timers[i];
    timers.splice(i, 1);
    t.fn();
  }
}

// ================================================================ sound
let soundOk = false;
let muted = false;
function sfx(name: Sfx, pitch = 1): void {
  if (soundOk && !muted) audio.play(name, { pitch });
}

// ================================================================ HUD
const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <div class="ad-cash"><canvas width="96" height="96"></canvas><span class="ad-cash-n">0</span></div>
  <button class="ad-mute" type="button" aria-label="Sound"><svg viewBox="0 0 32 32"><path d="M5 12h5l7-6v20l-7-6H5z" fill="#2B2230"/><path class="w" d="M21 11c2 2.5 2 7.5 0 10M24.5 8c4 4.5 4 11.5 0 16" fill="none" stroke="#2B2230" stroke-width="2.6" stroke-linecap="round"/><path class="x" d="M21 12l7 8M28 12l-7 8" stroke="#C0485C" stroke-width="3" stroke-linecap="round"/></svg></button>
  <div class="ad-banner"></div>
  <div class="ad-hand"><svg viewBox="0 0 100 120" width="70" height="84"><path d="M38 10c0-6 10-6 10 0v40l3-1V40c0-6 10-6 10 0v12l3 0V46c0-6 10-6 10 0v10l3 1v-4c0-6 10-6 10 0v28c0 18-12 32-30 32H52c-10 0-16-4-22-12L10 74c-4-6 3-12 9-8l13 10h6z" fill="#FFF6E4" stroke="#2B2230" stroke-width="6" stroke-linejoin="round"/></svg></div>`;
const cashBox = ui.querySelector('.ad-cash') as HTMLElement;
const cashText = ui.querySelector('.ad-cash-n') as HTMLElement;
drawIcon((ui.querySelector('.ad-cash canvas') as HTMLCanvasElement).getContext('2d')!, 'cash', 48, 48, 92);
const banner = ui.querySelector('.ad-banner') as HTMLElement;
const hand = ui.querySelector('.ad-hand') as HTMLElement;
const muteBtn = ui.querySelector('.ad-mute') as HTMLButtonElement;
muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  muted = !muted;
  muteBtn.classList.toggle('off', muted);
  audio.setEnabled(!muted, false);
});
/** The counter shows exactly the cash on the conductor's back, counting smoothly; fixed-width digits never jump. */
let money = 0;
let shownMoney = 0;
let lastShown = -1;
let bumpT = 0;
function updateMoney(dt: number): void {
  const diff = money - shownMoney;
  shownMoney = Math.abs(diff) < 0.5 ? money : shownMoney + diff * Math.min(1, dt * 10);
  const v = Math.round(shownMoney);
  if (v !== lastShown) {
    lastShown = v;
    cashText.textContent = String(v);
  }
  bumpT = Math.max(0, bumpT - dt * 5);
  cashBox.style.setProperty('--bump', (1 + Math.sin(bumpT * Math.PI) * 0.1).toFixed(3));
}
let bannerTimer = 0;
function showBanner(title: string, sub = ''): void {
  banner.innerHTML = `<b>${title}</b>${sub ? `<i>${sub}</i>` : ''}`;
  banner.classList.remove('on');
  void banner.offsetWidth;
  banner.classList.add('on');
  bannerTimer = 2.1;
}
const proj = { x: 0, y: 0 };
const tmpV = new THREE.Vector3();
let floatStack = 0;
let floatAt = -1;
function floatText(text: string, x: number, y: number, z: number): void {
  tmpV.set(x, y, z);
  if (!stage.project(tmpV, proj)) return;
  floatStack = clock - floatAt < 0.5 ? floatStack + 1 : 0;
  floatAt = clock;
  const el = document.createElement('div');
  el.className = 'ad-float';
  el.textContent = text;
  el.style.left = `${proj.x}px`;
  el.style.top = `${proj.y - floatStack * 34}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ================================================================ thought bubbles (emoji)
type Mood = 'wait' | 'angry' | 'love' | 'none';
const EMOJI: Record<Exclude<Mood, 'none'>, string> = { wait: '🙂', angry: '😠', love: '😍' };
const ITEM_ICON: Partial<Record<ItemKind, IconName>> = { tea: 'tea', latte: 'latte' };
const bubbleTextures = new Map<string, THREE.CanvasTexture>();
/**
 * A white thought cloud with a face (and what they want). Square power-of-two canvas with premultiplied alpha: the
 * odd-sized straight-alpha canvas of the first version drew as a dark box on some phone GPUs.
 */
function bubbleTexture(mood: Exclude<Mood, 'none'>, item: ItemKind | null): THREE.CanvasTexture {
  const key = `${mood}:${item ?? ''}`;
  const cached = bubbleTextures.get(key);
  if (cached) return cached;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const wide = !!item;
  const blobs: [number, number, number][] = wide
    ? [[70, 104, 52], [128, 84, 60], [186, 104, 52], [98, 136, 46], [158, 136, 46]]
    : [[92, 108, 50], [128, 88, 56], [164, 108, 50], [128, 136, 48]];
  const cloud = (): void => {
    ctx.beginPath();
    for (const [x, y, r] of blobs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    const tx = wide ? 64 : 80;
    ctx.moveTo(tx + 13, 206);
    ctx.arc(tx, 206, 13, 0, Math.PI * 2);
    ctx.moveTo(tx - 14, 232);
    ctx.arc(tx - 22, 232, 8, 0, Math.PI * 2);
  };
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = mood === 'angry' ? '#B3243B' : '#2B2230';
  cloud();
  ctx.stroke();
  ctx.fillStyle = mood === 'angry' ? '#FFE6E2' : '#FFFFFF';
  cloud();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px: number): string => `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
  if (wide && item) {
    ctx.font = font(76);
    ctx.fillText(EMOJI[mood], 84, 116);
    drawIcon(ctx, ITEM_ICON[item] ?? 'tea', 172, 114, 80);
  } else {
    ctx.font = font(96);
    ctx.fillText(EMOJI[mood], 128, 114);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = 2;
  bubbleTextures.set(key, t);
  return t;
}
class Bubble {
  readonly sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  private key = '';
  private pop = 1;
  private t = Math.random() * 6;
  constructor(private readonly size = 0.78) {
    // Drawn last and over everything: a bubble never cuts into a wall or a bed.
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  get mood(): Mood {
    return (this.key.split(':')[0] || 'none') as Mood;
  }
  set(mood: Mood, item: ItemKind | null = null): void {
    const key = mood === 'none' ? '' : `${mood}:${item ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.sprite.visible = mood !== 'none';
    if (mood !== 'none') {
      this.sprite.material.map = bubbleTexture(mood, item);
      this.sprite.material.needsUpdate = true;
    }
    this.pop = 0;
  }
  update(dt: number, x: number, y: number, z: number): void {
    if (!this.sprite.visible) return;
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4.5);
    const p = this.pop;
    const s = p < 1 ? Math.min(1.25, 1 - Math.cos(p * Math.PI * 2.6) * Math.exp(-p * 4.5)) : 1 + Math.sin(this.t * 3) * 0.025;
    const jitter = this.mood === 'angry' ? Math.sin(this.t * 38) * 0.02 : 0;
    this.sprite.position.set(x + jitter, y + Math.sin(this.t * 2.4) * 0.03, z);
    this.sprite.scale.set(this.size * s, this.size * s, 1);
  }
}

// ================================================================ guests
type Pose = 'stand' | 'sit' | 'sleep';
const RADIUS = 0.3;
let lookSeq = 0;
function guestLook(): CharacterLook {
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[(lookSeq++ * 3) % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
interface Order { item: ItemKind; since: number; pay: number }
class Guest {
  readonly view: CharacterView;
  readonly bubble = new Bubble();
  x: number;
  z: number;
  y = FLOOR_Y;
  facing: number;
  speed = 0;
  pose: Pose = 'stand';
  path: Vec2[] = [];
  onArrive: (() => void) | null = null;
  blockedFor = 0;
  order: Order | null = null;
  happyUntil = -1;
  cabin = -1;
  seat: { seat: VenueSeatLayout; z0: number; venue: 'cafe' | 'cinema' } | null = null;
  constructor(x: number, z: number, facing: number) {
    this.view = new CharacterView(guestLook(), 1.04);
    scene.add(this.view.root);
    this.x = x;
    this.z = z;
    this.facing = facing;
  }
  get walking(): boolean {
    return this.path.length > 0;
  }
  walkTo(points: Vec2[], onArrive: (() => void) | null = null): void {
    this.setPose('stand', { x: this.x, y: FLOOR_Y, z: this.z, facing: this.facing });
    this.path = points.slice();
    this.onArrive = onArrive;
  }
  setPose(pose: Pose, at: { x: number; y: number; z: number; facing: number }, blanket?: string): void {
    this.pose = pose;
    this.view.setPose(pose, blanket);
    this.x = at.x;
    this.y = at.y;
    this.z = at.z;
    this.facing = at.facing;
  }
  update(dt: number): void {
    if (this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = TUNE.guestSpeed * dt;
      const nx = this.x + (dx / (d || 1)) * Math.min(step, d);
      const nz = this.z + (dz / (d || 1)) * Math.min(step, d);
      // Never through the conductor: a moment's wait for them to pass.
      const dNext = Math.hypot(nx - me.x, nz - me.z);
      const blocked = dNext < RADIUS * 2 && dNext < Math.hypot(this.x - me.x, this.z - me.z);
      if (blocked && this.blockedFor < 0.8) {
        this.blockedFor += dt;
        this.speed = 0;
      } else {
        // Waited once: carry on past (the wait resets only once the way is clear again).
        if (!blocked) this.blockedFor = 0;
        if (d <= step) {
          this.x = next.x;
          this.z = next.z;
          this.path.shift();
          if (this.path.length === 0) {
            const cb = this.onArrive;
            this.onArrive = null;
            cb?.();
          }
        } else {
          this.x = nx;
          this.z = nz;
        }
        if (d > 1e-3) this.facing = turnToward(this.facing, Math.atan2(dx, dz), dt * 12);
        this.speed = TUNE.guestSpeed;
      }
    } else this.speed = 0;
    this.view.setPosition(this.x, this.y, this.z);
    this.view.setFacing(this.facing);
    this.view.update(dt, this.speed);
    // 🙂 waiting with what they want, 😠 once they have waited long, 😍 when served.
    if (this.order) {
      const long = started && clock - this.order.since > TUNE.patience;
      if (long && this.bubble.mood !== 'angry') sfx('grumble');
      this.bubble.set(long ? 'angry' : 'wait', this.order.item);
    } else this.bubble.set(clock < this.happyUntil ? 'love' : 'none');
    const head = this.pose === 'sit' ? 1.62 : this.pose === 'sleep' ? 0.9 : 2.08;
    this.bubble.update(dt, this.x, this.y + head, this.z);
    if (clock < this.happyUntil && Math.random() < dt * 1.5) particles.emit('heart', this.x, this.y + head - 0.3, this.z, 1, 0.15);
  }
}
function turnToward(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
const guests: Guest[] = [];
const sleeperLayout = (): CarriageLayout => train[SLOT.sleeper].view.layout;
const cabinOf = (i: number): CabinLayout => sleeperLayout().cabins[i];
const doorZ = (c: CabinLayout): number => (c.door[0] + c.door[1]) / 2;
/** Where a guest sits on the edge of their bed, facing the door. */
const sitSpot = (c: CabinLayout) => ({ x: c.bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: c.bedPose.z, facing: -Math.PI / 2 });

// The three passengers wait in the corridor at their own cabin doors (beside the doorway, never in it).
for (let i = 0; i < 3; i++) {
  const c = cabinOf(i);
  const g = new Guest(-1.12, doorZ(c), -Math.PI / 2);
  g.cabin = i;
  g.order = { item: 'tea', since: 0, pay: TUNE.pay.tea };
  guests.push(g);
}
/** A served guest goes into their own cabin and sits on the bed. */
function goToCabin(g: Guest): void {
  const c = cabinOf(g.cabin);
  const sit = sitSpot(c);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(SLOT.sleeper, c.node)), () => g.setPose('sit', sit));
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
const me = { x: -1.55, z: 1.9, facing: Math.PI, speed: 0, vx: 0, vz: 0 };
let speedNow = TUNE.speed;

// What the conductor carries, on the tray in front.
const carried: { item: ItemKind; mesh: THREE.Mesh }[] = [];
const flying: { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
const popping: { obj: THREE.Object3D; t: number; base: number }[] = [];
function pickUp(item: ItemKind, count: number): void {
  for (let i = 0; i < count; i++) {
    const mesh = createItemMesh(item);
    mesh.scale.setScalar(0.01);
    scene.add(mesh);
    carried.push({ item, mesh });
    popping.push({ obj: mesh, t: -i * 0.12, base: 1.15 });
  }
  player.setCarrying(true);
  sfx('pickup');
}
const tmpTo = new THREE.Vector3();
function serve(g: Guest): void {
  const order = g.order!;
  const i = carried.findIndex((c) => c.item === order.item);
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  g.order = null;
  flying.push({
    mesh, from: mesh.position.clone(), to: () => tmpTo.set(g.x, g.y + (g.pose === 'sit' ? 0.9 : 1.05), g.z), t: 0, dur: 0.28,
    done: () => {
      scene.remove(mesh);
      g.happyUntil = clock + 2.6;
      g.view.act('sip', 2.2);
      g.view.bounce(1);
      sfx('heart');
      particles.emit('heart', g.x, g.y + 1.7, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 10, 0.3);
      pay(order.pay, g.x, g.y + 1.1, g.z);
      onServed(g);
    },
  });
  sfx('drop');
}

// ================================================================ cash: earned, carried on the back, spent on upgrades
function pay(bills: number, x: number, y: number, z: number): void {
  floatText(`+$${bills * TUNE.bill}`, x, y + 0.9, z);
  const from = new THREE.Vector3(x, y, z);
  cash.stream(() => from, backTopPos, bills, 0.06, landBill);
}
function landBill(): void {
  backCount++;
  money += TUNE.bill;
  backBounce = 1;
  bumpT = 1;
  sfx('coin');
}
interface Pile { id: string; x: number; z: number; taking: boolean; empty: boolean }
let piles: Pile[] = [];
let pileSeq = 0;
/** A guest pays their fare at their door: the bills fly from them onto a pile on the corridor floor. */
function payAtDoor(g: Guest, bills: number, delay: number): void {
  const c = cabinOf(g.cabin);
  const spot = walkableNear(-1.35, doorZ(c));
  const id = `p${pileSeq++}`;
  cash.createPile(id, spot.x, FLOOR_Y, spot.z);
  piles.push({ id, x: spot.x, z: spot.z, taking: false, empty: false });
  later(delay, () => {
    g.view.act('wave', 0.8);
    g.happyUntil = clock + 2.2;
    cash.flyToPile(id, new THREE.Vector3(g.x, g.y + 1.0, g.z), bills);
    sfx('cash');
  });
}

const BACK_MAX = 40;
const BILL_STEP = 0.052;
const billGeometry = new GeoBuilder()
  .box(0, 0, 0, 0.36, 0.046, 0.21, PALETTE.cashEdge, 0, { shade: 1 })
  .box(0, 0.004, 0, 0.34, 0.046, 0.19, PALETTE.cash, 0, { shade: 1 })
  .box(0, 0.025, 0, 0.09, 0.006, 0.215, PALETTE.cashBand, 0, { shade: 1 })
  .build();
const back = new THREE.InstancedMesh(billGeometry, MATERIALS.solid, BACK_MAX);
back.frustumCulled = false;
back.count = 0;
scene.add(back);
let backCount = 0;
let backBounce = 0;
/** The stack's lean: a damped spring driven by the conductor's running (no noise, no jitter). */
const lean = { x: 0, z: 0, vx: 0, vz: 0 };
const dummy = new THREE.Object3D();
const backBase = new THREE.Vector3();
const anchorPos = new THREE.Vector3();
let lastVx = 0;
let lastVz = 0;
const STACK_WALL = INNER - 0.2;
const clampX = (x: number): number => Math.max(-STACK_WALL, Math.min(STACK_WALL, x));
function updateBack(dt: number): void {
  backBounce = Math.max(0, backBounce - dt * 5);
  // Pinned to the conductor's body (the carry anchor bobs with the walk), just behind the shoulders.
  const fx = Math.sin(me.facing);
  const fz = Math.cos(me.facing);
  backBase.set(anchorPos.x - fx * 0.55, anchorPos.y - 0.1, anchorPos.z - fz * 0.55);
  if (dt > 0) {
    const vx = me.vx * me.speed;
    const vz = me.vz * me.speed;
    const ax = (vx - lastVx) / dt;
    const az = (vz - lastVz) / dt;
    lastVx = vx;
    lastVz = vz;
    lean.vx += (-ax * 0.004 - vx * 0.012 - lean.x) * 60 * dt - lean.vx * 13 * dt;
    lean.vz += (-az * 0.004 - vz * 0.012 - lean.z) * 60 * dt - lean.vz * 13 * dt;
    lean.x += lean.vx * dt;
    lean.z += lean.vz * dt;
    const l = Math.hypot(lean.x, lean.z);
    if (l > 0.18) {
      lean.x *= 0.18 / l;
      lean.z *= 0.18 / l;
    }
  }
  const n = Math.min(backCount, BACK_MAX);
  back.count = n;
  const squash = 1 - 0.14 * backBounce;
  for (let i = 0; i < n; i++) {
    const h = i * BILL_STEP * squash;
    const bend = (h / 1.2) * (h / 1.2);
    dummy.position.set(clampX(backBase.x + lean.x * bend), backBase.y + h, backBase.z + lean.z * bend);
    dummy.rotation.set(0, me.facing + Math.PI / 2, 0);
    const s = i === n - 1 ? 1 + backBounce * 0.25 : 1;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    back.setMatrixAt(i, dummy.matrix);
  }
  back.instanceMatrix.needsUpdate = true;
}
const backTop = new THREE.Vector3();
function backTopPos(): THREE.Vector3 {
  const h = Math.min(backCount, BACK_MAX) * BILL_STEP;
  const bend = (h / 1.2) * (h / 1.2);
  return backTop.set(clampX(backBase.x + lean.x * bend), backBase.y + h + 0.04, backBase.z + lean.z * bend);
}

// ================================================================ jobs at the furniture (the game's own job badges)
interface Station { item: ItemKind | 'film'; x: number; z: number; marker: JobMarker; progress: number; active: boolean }
function makeStation(item: Station['item'], at: Vec2, icon: IconName): Station {
  const p = walkableNear(at.x, at.z);
  const marker = new JobMarker(icon);
  marker.setPosition(p.x, p.z);
  const anchor = map.serviceAnchor(p.x, p.z, 1.3);
  if (anchor) marker.setIconAnchor(anchor.x - p.x, anchor.z - p.z, anchor.height + 0.55);
  marker.visible = false;
  scene.add(marker.group);
  return { item, x: p.x, z: p.z, marker, progress: 0, active: false };
}
const urn = makeStation('tea', sleeperViews[0].layout.anchors.urn, 'tea');
urn.active = true;
let machine: Station | null = null;
let projector: Station | null = null;

// ================================================================ upgrade tiles (the game's own tiles; they fill as the bills fly in)
interface Tile { view: TileView; x: number; z: number; icon: IconName; name: string; price: number; paid: number; sent: number; timer: number; done: boolean; onDone: () => void }
let tile: Tile | null = null;
function showTile(at: Vec2, icon: IconName, name: string, price: number, onDone: () => void): void {
  const p = walkableNear(at.x, at.z);
  const view = new TileView(1.4);
  view.setPosition(p.x, p.z);
  scene.add(view.group);
  tile = { view, x: p.x, z: p.z, icon, name, price, paid: 0, sent: 0, timer: 0, done: false, onDone };
  drawTile(tile);
  particles.emit('sparkle', p.x, FLOOR_Y + 0.3, p.z, 20, 0.5);
  sfx('ready');
}
function drawTile(t: Tile): void {
  const left = t.price - t.paid;
  t.view.face.draw(t.icon, left, t.paid / t.price, money >= left, t.sent > 0);
  t.view.marker.draw(t.icon, t.name, left, money >= left);
}
function updateTile(dt: number): void {
  const t = tile;
  if (!t) return;
  const on = Math.hypot(t.x - me.x, t.z - me.z) < TUNE.tileReach;
  t.view.update(dt, money >= t.price - t.paid, on, true, false);
  if (!on || t.done) return;
  t.timer -= dt;
  // Only cash really carried goes in: an upgrade is never free, and a part-paid one keeps its fill.
  while (t.timer <= 0 && t.sent < t.price / TUNE.bill && backCount > 0) {
    t.timer += TUNE.drain;
    t.sent++;
    const from = backTopPos().clone();
    backCount--;
    money -= TUNE.bill;
    cash.stream(() => from, () => tmpTo.set(t.x, FLOOR_Y + 0.12, t.z), 1, 0, () => {
      t.paid += TUNE.bill;
      drawTile(t);
      sfx('tick', 0.9 + (t.paid / t.price) * 0.7);
      if (t.paid >= t.price && !t.done) {
        t.done = true;
        particles.emit('sparkle', t.x, FLOOR_Y + 0.4, t.z, 34, 0.6);
        particles.emit('star', t.x, FLOOR_Y + 0.6, t.z, 12, 0.4);
        sfx('unlock');
        shrinking.push({ obj: t.view.group, t: 0 });
        tile = null;
        t.onDone();
      }
    });
  }
}
const shrinking: { obj: THREE.Object3D; t: number }[] = [];

// ================================================================ the steps
type StepName = 'tea' | 'comfort' | 'business' | 'cafe' | 'theatre' | 'end';
let stepName: StepName = 'tea';
let served = 0;

function onServed(g: Guest): void {
  served++;
  if (stepName === 'tea') {
    // Tea in hand, they go into their cabin.
    later(0.5, () => goToCabin(g));
    if (served === 3) later(0.6, () => showTile({ x: -1.55, z: 9.9 }, 'wrench', 'Comfort Class', TUNE.price.comfort, () => refit(1)));
  } else if (stepName === 'cafe' && served === 2) {
    later(0.5, () => showTile({ x: 0, z: carriageOriginZ(SLOT.cafe) + 15.8 }, 'film', 'Theatre', TUNE.price.theatre, buyTheatre));
  }
}

/** A class refit of the sleeper: rebuilt in place round its guests, who then pay the dearer fare at their doors. */
function refit(level: 1 | 2): void {
  const old = train[SLOT.sleeper].view;
  const next = sleeperViews[level];
  old.group.visible = false;
  next.group.visible = true;
  sleeperLevel = level;
  train[SLOT.sleeper] = { type: 'sleeper', tier: SLEEPER_TIERS[level], view: next };
  rebuildTrain();
  pops.push({ group: next.group, t: 0 });
  burstAlong(0.5, 17.5, 'sparkle', 34);
  burstAlong(0.5, 17.5, 'confetti', 44);
  sfx('reveal');
  later(0.35, () => sfx('levelup'));
  speedNow *= TUNE.speedUp;
  stepName = level === 1 ? 'comfort' : 'business';
  showBanner(level === 1 ? 'COMFORT CLASS!' : 'BUSINESS CLASS!', level === 1 ? 'Bigger cabins · dearer fares' : 'Grand cabins · the best fares');
  // The guests were in their cabins all along: they are in the new ones now, delighted, and pay the new fare.
  piles = [];
  guests.forEach((g, i) => {
    const c = cabinOf(g.cabin);
    g.path = [];
    g.setPose('sit', sitSpot(c));
    payAtDoor(g, level === 1 ? TUNE.pay.comfort : TUNE.pay.business, 0.8 + i * 0.3);
  });
  later(1.0, () => (scooping = true));
}
let scooping = false;
function afterScoop(): void {
  scooping = false;
  if (stepName === 'comfort') showTile({ x: -1.55, z: 14.6 }, 'wrench', 'Business Class', TUNE.price.business, () => refit(2));
  else if (stepName === 'business') showTile({ x: -0.15, z: 17.3 }, 'latte', 'Café Car', TUNE.price.cafe, buyCafe);
}

/** The café rolls in and couples on; two guests stroll through to it and order lattes. */
function buyCafe(): void {
  couple(cafeView, 'cafe', CAFE_TIER, 'CAFÉ CAR!', 'Lattes for the guests');
  stepName = 'cafe';
  served = 0;
  const v = cafeView.layout.venue!;
  const z0 = carriageOriginZ(SLOT.cafe);
  machine = makeStation('latte', { x: v.stations[0].pad.x, z: v.stations[0].pad.z + z0 }, 'latte');
  // They order as they set off (the conductor can make the lattes while they walk through) and sit at the tables
  // nearest the sleeper.
  machine.active = true;
  [guests[0], guests[1]].forEach((g, i) => later(0.3 + i * 0.4, () => {
    g.order = { item: 'latte', since: clock + 4, pay: TUNE.pay.latte };
    sfx('bloop');
    toSeat(g, 'cafe', v.seats[i === 0 ? 0 : 2], z0, () => undefined);
  }));
}

/** The theatre rolls in; the guests go through and take their seats. */
let filmT = -1;
function buyTheatre(): void {
  couple(cinemaView, 'cinema', CINEMA_TIER, 'THEATRE CAR!', 'Start the film');
  stepName = 'theatre';
  const v = cinemaView.layout.venue!;
  const z0 = carriageOriginZ(SLOT.cinema);
  projector = makeStation('film', { x: v.projector!.x, z: v.projector!.z + z0 }, 'film');
  // The café's two guests go straight through (the film starts once they are in); the third follows from their cabin.
  guests.forEach((g, i) => later(0.3 + i * 0.4, () => toSeat(g, 'cinema', v.seats[[0, 6, 1][i]], z0, () => {
    if (guests.filter((x) => x.seat?.venue === 'cinema' && x.pose === 'sit').length >= 2) projector!.active = true;
  })));
}

/** A guest walks through the train (doorways, gangways, round furniture) to a venue seat and sits. */
function toSeat(g: Guest, venue: 'cafe' | 'cinema', seat: VenueSeatLayout, z0: number, then: () => void): void {
  g.seat = { seat, z0, venue };
  const slot = venue === 'cafe' ? SLOT.cafe : SLOT.cinema;
  const sitAt = { x: seat.sit.x, y: FLOOR_Y + seat.top - 0.24, z: seat.sit.z + z0, facing: seat.facing };
  const near = walkableNear(seat.serve ? seat.serve.x : seat.sit.x, seat.sit.z + z0);
  g.walkTo(route({ x: g.x, z: g.z }, near, map.nodeId(slot, seat.node)), () => {
    g.setPose('sit', sitAt);
    then();
  });
}

// ================================================================ new carriages roll in and couple on (the game's signature)
const rolling: { group: THREE.Object3D; t: number; z: number; done: () => void }[] = [];
const pops: { group: THREE.Object3D; t: number }[] = [];
function couple(view: CarriageView, type: CarriageType, tier: number, title: string, sub: string): void {
  train.push({ type, tier, view });
  rebuildTrain();
  const z = carriageOriginZ(view.index);
  view.group.visible = true;
  view.group.position.z = z + 24;
  sfx('whoosh');
  showBanner(title, sub);
  speedNow *= TUNE.speedUp;
  rolling.push({
    group: view.group, t: 0, z,
    done: () => {
      sfx('clunk');
      stage.rig.shake(0.08, 0.25);
      burstAlong(z - 0.6, z + 1.2, 'dust', 22);
      burstAlong(z, z + CARRIAGE_LENGTH, 'confetti', 44);
      later(0.3, () => sfx('reveal'));
    },
  });
}
function burstAlong(z0: number, z1: number, kind: 'confetti' | 'dust' | 'sparkle' | 'star', count: number): void {
  for (let i = 0; i < count; i++) particles.emit(kind, (Math.random() - 0.5) * 4, FLOOR_Y + 0.5 + Math.random() * 0.9, z0 + ((i + 0.5) / count) * (z1 - z0), 1, 0.25);
}

// ================================================================ jobs each frame
function updateJobs(dt: number): void {
  // Pick-ups: the urn hands over a tray for everyone waiting; the café's machine a latte for each order.
  for (const s of [urn, machine, projector]) {
    if (!s) continue;
    let wants = false;
    if (s.item === 'film') wants = s.active && filmT < 0;
    else {
      const needed = guests.filter((g) => g.order?.item === s.item).length - carried.filter((c) => c.item === s.item).length;
      wants = s.active && needed > 0;
    }
    s.marker.visible = wants || s.progress > 0;
    s.marker.iconShown = wants;
    s.marker.highlight = wants;
    const near = Math.hypot(me.x - s.x, me.z - s.z) < TUNE.pickReach;
    if (wants && near) {
      s.progress = Math.min(1, s.progress + dt / (s.item === 'film' ? TUNE.projector : TUNE.pickUp));
      if (s.progress >= 1) {
        s.progress = 0;
        if (s.item === 'film') startFilm();
        else pickUp(s.item, guests.filter((g) => g.order?.item === s.item).length - carried.filter((c) => c.item === s.item).length);
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }
  // Deliveries: within reach and in plain sight, never through a wall.
  for (const g of guests) {
    if (!g.order || g.walking || !carried.some((c) => c.item === g.order!.item)) continue;
    const a = approach(g);
    if (Math.hypot(me.x - g.x, me.z - g.z) < TUNE.serveReach && map.walk.lineClear(me.x, me.z, a.x, a.z)) serve(g);
  }
  // Fares on the floor: scooped onto the back as the conductor walks over them.
  if (scooping) {
    for (const p of piles) {
      if (p.taking || cash.pileCount(p.id) === 0) continue;
      if (Math.hypot(p.x - me.x, p.z - me.z) < TUNE.scoopReach) {
        p.taking = true;
        floatText(`+$${cash.pileCount(p.id) * TUNE.bill}`, p.x, FLOOR_Y + 1.5, p.z);
        cash.vacuum(p.id, backTopPos, landBill, () => {
          p.empty = true;
          cash.removePile(p.id);
        });
      }
    }
    if (piles.length > 0 && piles.every((p) => p.empty)) {
      piles = [];
      afterScoop();
    }
  }
  if (filmT >= 0) {
    filmT += dt;
    if (filmT > TUNE.endDelay && stepName !== 'end') {
      stepName = 'end';
      endGame();
    }
  }
}
function startFilm(): void {
  filmT = 0;
  cinemaView.setVenueFilm(0);
  sfx('chime');
  showBanner('NOW SHOWING', '🍿 Every seat pays');
  guests.forEach((g, i) => later(0.6 + i * 0.25, () => {
    if (g.seat?.venue !== 'cinema') return;
    g.happyUntil = clock + 3;
    pay(TUNE.pay.ticket, g.x, g.y + 1.2, g.z);
  }));
}
/** Where the conductor stands to serve a guest. */
function approach(g: Guest): Vec2 {
  return walkableNear(g.x + (g.x > -0.6 ? -0.8 : 0.8), g.z);
}

/** The next thing to do (the guide points at it, a tap walks there). */
function target(): (Vec2 & { lift: number }) | null {
  for (const c of carried) {
    const g = guests.find((x) => x.order?.item === c.item && !x.walking);
    if (g) return { ...approach(g), lift: 2.4 };
  }
  for (const s of [urn, machine, projector]) {
    if (!s || !s.marker.visible) continue;
    return { x: s.x, z: s.z, lift: 1.9 };
  }
  // The theatre's audience is on its way: be at the projector, ready to start the film.
  if (projector && filmT < 0) return { x: projector.x, z: projector.z, lift: 1.9 };
  if (scooping) {
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
    if (best) return { x: best.x, z: best.z, lift: 1.3 };
  }
  if (tile) return { x: tile.x, z: tile.z, lift: 1.4 };
  return null;
}

// ================================================================ input: drag anywhere (an invisible floating stick), or tap to go to the next job
let pointerId = -1;
let originX = 0;
let originY = 0;
let stickX = 0;
let stickY = 0;
let downAt = 0;
let lastInput = 0;
let autoWalk = false;
let started = false;
let ended = false;
const ground = { x: 0, y: 0 };
const STICK_PX = 44;
function touched(): void {
  soundOk = audio.unlock() || soundOk;
  if (!started) {
    started = true;
    for (const g of guests) if (g.order) g.order.since = clock;
  }
}
window.addEventListener('pointerdown', (e) => {
  if (ended) return;
  touched();
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
  touched();
  const quick = performance.now() - downAt < 280 && Math.hypot(stickX, stickY) < 0.3;
  pointerId = -1;
  stickX = 0;
  stickY = 0;
  if (quick) autoWalk = true;
  lastInput = clock;
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('touchend', () => touched(), { passive: true });

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
    if (t && Math.hypot(t.x - me.x, t.z - me.z) > 0.3) {
      // The nav route, cutting straight to the furthest point in plain view.
      const pts = route({ x: me.x, z: me.z }, t);
      let next = pts[0];
      for (let k = pts.length - 1; k >= 0; k--) {
        if (straight(me, pts[k])) {
          next = pts[k];
          break;
        }
      }
      const l = Math.hypot(next.x - me.x, next.z - me.z) || 1;
      mx = (next.x - me.x) / l;
      mz = (next.z - me.z) / l;
      mag = 1;
    } else {
      autoWalk = false;
      mag = 0;
    }
  } else mag = 0;
  const want = mag * speedNow;
  me.speed += (want - me.speed) * Math.min(1, dt * (want > me.speed ? 12 : 20));
  if (mag > 0) {
    me.vx = mx;
    me.vz = mz;
    me.facing = turnToward(me.facing, Math.atan2(mx, mz), dt * 16);
  }
  if (me.speed > 0.01 && dt > 0) {
    const pos = { x: me.x, z: me.z };
    map.walk.move(pos, me.vx * me.speed * dt, me.vz * me.speed * dt, 0.5, 1.3);
    // Nobody walks through anybody: the conductor slides round people.
    for (const g of guests) {
      if (g.pose === 'sleep') continue;
      const dx = pos.x - g.x;
      const dz = pos.z - g.z;
      const d = Math.hypot(dx, dz);
      const min = RADIUS * 2 - 0.04;
      if (d < min && d > 1e-4) {
        const px = g.x + (dx / d) * min;
        const pz = g.z + (dz / d) * min;
        if (map.walk.isWalkable(px, pz)) {
          pos.x = px;
          pos.z = pz;
        }
      }
    }
    pos.z = Math.max(0.45, Math.min(trainRear() - 0.5, pos.z));
    me.x = pos.x;
    me.z = pos.z;
  }
  player.setPosition(me.x, FLOOR_Y, me.z);
  player.setFacing(me.facing);
  player.update(dt, me.speed);
}

/** Cabin doors swing open for anyone walking through them (the game's hinged leaves), and shut behind. */
function updateDoors(dt: number): void {
  for (const car of train) {
    const z0 = car.view.group.position.z;
    for (const door of car.view.roomDoors) {
      const dz = door.z + z0;
      let want = Math.abs(me.z - dz) < 1.2 && Math.abs(me.x - door.x) < 1.0 ? 1 : 0;
      for (const g of guests) if (g.walking && Math.abs(g.z - dz) < 1.3 && Math.abs(g.x - door.x) < 1.2) want = 1;
      if (door.open === want) continue;
      car.view.setRoomDoor(door, want > door.open ? Math.min(1, door.open + dt * 4) : Math.max(0, door.open - dt * 2.5));
    }
  }
}

// ================================================================ the guide: the game's gold arrow and a hand, when the player hesitates
const arrow = makeSprite(guideArrowTexture(), 0.6);
arrow.material.toneMapped = false;
arrow.renderOrder = 21;
scene.add(arrow);
let arrowShown = 0;
function updateGuide(dt: number): void {
  const t = target();
  const hesitating = !started || (clock - lastInput > TUNE.hesitate && !autoWalk && pointerId < 0);
  const show = !!t && !ended && hesitating;
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  arrow.visible = arrowShown > 0.02 && !!t;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    arrow.scale.set(0.6 * arrowShown, 0.6 * arrowShown, 1);
  }
  hand.classList.toggle('on', show);
  if (!show || !t) return;
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  tmpV.set(me.x, FLOOR_Y + 0.6, me.z);
  if (!stage.project(tmpV, a)) return;
  tmpV.set(t.x, FLOOR_Y + 0.2, t.z);
  if (!stage.project(tmpV, b)) return;
  // A thumb-sized drag from the conductor toward the goal, then a lift.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const reach = Math.min(l, 84);
  const cyc = (clock % 1.4) / 1.4;
  const k = cyc < 0.18 ? 0 : cyc > 0.8 ? 1 : (cyc - 0.18) / 0.62;
  const e = k * k * (3 - 2 * k);
  hand.style.transform = `translate(${(a.x + 26 + (dx / l) * reach * e).toFixed(1)}px, ${(a.y + 54 + (dy / l) * reach * e).toFixed(1)}px) scale(${(cyc < 0.18 ? 0.86 + cyc * 0.5 : 0.9).toFixed(3)})`;
  hand.style.opacity = cyc > 0.9 ? (1 - (cyc - 0.9) * 10).toFixed(2) : '1';
}

// ================================================================ the end card
const endCard = buildEndCard(() => openStore());
document.body.appendChild(endCard);
function endGame(): void {
  if (ended) return;
  ended = true;
  hand.classList.remove('on');
  endCard.classList.add('on');
  sfx('levelup');
}

// ================================================================ the camera: centred on the conductor, eased, clamped to the train
function resize(): void {
  stage.resize();
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const aspect = w / Math.max(1, h);
  // The rig frames a width of floor; on a wide screen that comes in far too close, so keep the floor's height instead.
  stage.rig.setZoom(aspect > 0.9 ? Math.max(TUNE.zoom, 1.35 * aspect) : TUNE.zoom);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
function clampCamera(): void {
  stage.rig.clampX = [-INNER + 0.6, INNER - 0.6];
  stage.rig.clampZ = [0.5, trainRear() - 0.5];
}

// ================================================================ frame
let smokeT = 0;
let last = performance.now();
let paused = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * TEST_SPEED;
  last = now;
  if (!paused) step(dt);
  requestAnimationFrame(frame);
}
function step(dt: number): void {
  frameWork.begin(3);
  clock += dt;
  runTimers();
  if (started && !ended) {
    updatePlayer(dt);
    updateJobs(dt);
    updateTile(dt);
  } else updatePlayer(0);
  for (const g of guests) g.update(dt);
  updateDoors(dt);
  // The tray: what is carried rides on it, stacked, bobbing with the walk.
  player.root.updateMatrixWorld(true);
  player.stackAnchor.getWorldPosition(anchorPos);
  let h = 0;
  for (const c of carried) {
    c.mesh.position.set(anchorPos.x, anchorPos.y + h, anchorPos.z);
    c.mesh.rotation.y = me.facing;
    h += (ITEM_HEIGHT[c.item] ?? 0.2) * 1.15;
  }
  updateBack(dt);
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt / f.dur;
    const k = Math.min(1, f.t);
    f.mesh.position.lerpVectors(f.from, f.to(), k);
    f.mesh.position.y += Math.sin(k * Math.PI) * 0.4;
    if (k >= 1) {
      flying.splice(i, 1);
      f.done();
    }
  }
  for (let i = popping.length - 1; i >= 0; i--) {
    const p = popping[i];
    p.t += dt * 4;
    const s = p.t <= 0 ? 0.01 : p.t >= 1 ? 1 : 1 + Math.sin(p.t * Math.PI) * 0.4;
    p.obj.scale.setScalar(p.base * s);
    if (p.t >= 1) popping.splice(i, 1);
  }
  for (let i = shrinking.length - 1; i >= 0; i--) {
    const s = shrinking[i];
    s.t += dt * 4;
    s.obj.scale.setScalar(Math.max(0.001, 1 + Math.sin(Math.min(1, s.t) * Math.PI) * 0.3 - s.t));
    if (s.t >= 1) {
      scene.remove(s.obj);
      shrinking.splice(i, 1);
    }
  }
  for (let i = rolling.length - 1; i >= 0; i--) {
    const r = rolling[i];
    r.t += dt / 2.0;
    const k = Math.min(1, r.t);
    r.group.position.z = r.z + 24 * Math.pow(1 - k, 3);
    if (k >= 1) {
      r.group.position.z = r.z;
      rolling.splice(i, 1);
      r.done();
    }
  }
  // A refit: the carriage swells a touch and settles (uniformly, so no surface ever folds into another).
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt / 0.6;
    const k = Math.min(1, p.t);
    p.group.scale.setScalar(k >= 1 ? 1 : 1 + Math.sin(k * Math.PI) * 0.03);
    if (k >= 1) pops.splice(i, 1);
  }
  for (const c of train) c.view.animate(dt);
  scenery.update(dt, TUNE.ride);
  loco.update(dt, TUNE.ride);
  smokeT -= dt;
  if (smokeT <= 0) {
    smokeT = 0.28;
    particles.emit('smoke', loco.chimneyTop.x, loco.chimneyTop.y, loco.chimneyTop.z, 2);
  }
  particles.update(dt);
  cash.update(dt);
  updateGuide(dt);
  updateMoney(dt);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) banner.classList.remove('on');
  }
  if (!ended && clock - lastInput > TUNE.idleEnd) endGame();
  clampCamera();
  stage.rig.update(dt, me.x, me.z);
  batch.sync(stage.rig.camera);
  audio.update(dt);
  stage.render(dt);
}

async function boot(): Promise<void> {
  resize();
  clampCamera();
  stage.rig.snapTo(me.x, me.z);
  player.setPosition(me.x, FLOOR_Y, me.z);
  player.setFacing(me.facing);
  for (const g of guests) g.update(0);
  batch.sync(stage.rig.camera);
  // A frame straight away (no loading screen), then every shader compiles before play.
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

// Test hooks (harmless in an ad).
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return { step: stepName, sleeper: sleeperLevel, money, backCount, carried: carried.map((c) => c.item), tile: tile ? `${tile.name} ${tile.paid}/${tile.price}` : null, piles: piles.length, ended, clock: Math.round(clock * 10) / 10, me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) }, orders: guests.filter((g) => g.order).map((g) => g.order!.item), film: filmT };
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
