// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the platform, the cash, the tiles, the class chips, the makeover wipe, the room mess and
// the sounds) so it looks and plays like the game, only faster.
//
// How it plays (everything follows from what came before):
//  - Tutorial at Millbrook station: a traveller boards and queues at the reception desk. Check them in (they get their
//    key and pay the fare onto the desk), collect the cash, and they walk to their room. They ask for tea: fetch it
//    from the urn and bring it. A second traveller: check in, fetch their bag from the rack. Buy the third room. A
//    third traveller boards, and the train leaves.
//  - Then the game's loop, station after station: travellers board and queue at the desk; guests ask for tea,
//    blankets and their bags; guests whose stop it is get off, leaving a tip and an untidy room to tidy for the next.
//  - The money you carry buys one upgrade at a time: a new sleeper carriage, more rooms, Comfort Class, the Café Car,
//    the Theatre Car, Business Class. Each brings new work and dearer fares. About 5-10 minutes for a person.
//  - The end card after the Business Class guests' first orders (or after 15 s without a touch).
import * as THREE from 'three';
import { AudioEngine, isAndroid, type Sfx } from '../audio/AudioEngine';
import { classOfTier, type ClassDef } from '../config/classes';
import { ARCHETYPES } from '../config/content';
import { VISUALS } from '../config/visuals';
import { frameWork } from '../core/Background';
import { rect, type CarriageType, type ItemKind, type Vec2 } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon as drawIconAt, type IconName } from '../ui/icons';
import { BED_TOP, CarriageView, FLOOR_Y } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { CharacterView, CONDUCTOR_LOOK, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { ClassChips } from '../world/ClassChips';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, HALF_WIDTH, INNER, PLATFORM_X0, type CabinLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { clipSide, MATERIALS, SHADOW_GEOMETRY, setLivery, swapMaterials } from '../world/materials';
import { liveryFor, PALETTE } from '../world/palette';
import { Particles } from '../world/Particles';
import { PLATFORM } from '../world/platformLayout';
import { PlatformView } from '../world/PlatformView';
import { Scenery } from '../world/Scenery';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { Stage } from '../world/Stage';
import { platformLightInput, trainLightInput } from '../world/trainLight';
import { JobMarker, TileView } from '../world/ZoneViews';
import { buildEndCard } from './endcard';
import { adReady, onViewable, openStore } from './network';

/** The game's icons are drawn from their top-left corner; the ad places them by their centre. */
function drawIcon(ctx: CanvasRenderingContext2D, icon: IconName, cx: number, cy: number, size: number): void {
  drawIconAt(ctx, icon, cx - size / 2, cy - size / 2, size);
}

// ================================================================ tuning: every number of the ad in one place
const TUNE = {
  /** Camera distance factor (the game's framing is 1). */
  zoom: 0.8,
  /** Camera easing: higher follows more tightly (the game uses 5). */
  follow: 7,
  /** Walking speed (m/s): it rises a little with each upgrade. */
  speed: 5.6,
  speedUp: 1.05,
  guestSpeed: 3.4,
  /** One bill is $10. */
  bill: 10,
  /** Bills paid, by the room's class (Basic, Comfort, Business): the fare at the desk, each delivery, the tip on leaving. */
  fare: { basic: 3, comfort: 6, business: 10 },
  deliver: { basic: 2, comfort: 3, business: 5 },
  tip: { basic: 1, comfort: 3, business: 5 },
  /** Bills for a café order, a popcorn, and each theatre ticket. */
  cafe: 3,
  popcorn: 2,
  ticket: 2,
  /** Upgrade prices, in order (each one is the next goal as soon as the last is bought). */
  price: { room: 40, carriage: 200, berth3: 120, berth4: 150, comfort: 350, cafe: 420, theatre: 520, business: 700 },
  /** Seconds a job takes. */
  checkIn: 0.75,
  pickUp: 0.4,
  tidy: 1.1,
  projector: 0.9,
  /** Reaches (m). */
  deskReach: 1.2,
  pickReach: 1.15,
  serveReach: 1.6,
  scoopReach: 1.25,
  tileReach: 0.9,
  roomReach: 1.5,
  /** A guest waiting this long for what they asked for is cross (😠). */
  patience: 12,
  /** Seconds before a settled guest asks for something, and between requests. */
  firstAsk: 2.2,
  nextAsk: [12, 20] as [number, number],
  /** Legs (stations) a guest rides before getting off. */
  legs: 2,
  /** The journey: seconds between stations, the train's speed, the stop's minimum length. */
  rideSeconds: 22,
  ride: 7,
  arriveFrom: 50,
  minStop: 6,
  /** How many board at a station at most. */
  boardMax: 5,
  /** Seconds between bills draining into an upgrade. */
  drain: 0.04,
  /** Seconds without a touch before the hand and the hint show, and before the end card shows anyway. */
  hesitate: 2.4,
  idleEnd: 15,
  /** Café and theatre: chance per second that a resting guest goes for a visit, seats used, the film's length. */
  outing: 0.06,
  film: 7,
  /** Deliveries in Business Class that end the ad, and the pause before the end card. */
  finaleDeliveries: 3,
  endDelay: 2.6,
};
const NIGHT_TIME = 0.82;
const CAFE_TIER = 2;
const CINEMA_TIER = 2;
const TIER = { basic: 1, comfort: 2, business: 3 } as const;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));

// ================================================================ the scene
VISUALS.camera.followSharpness = TUNE.follow;
VISUALS.camera.lookAhead = 0;
VISUALS.camera.lakeBias = 0;
// No shadow maps: everyone keeps their soft blob shadow. A shadow map redrawn as the train changed popped in after
// upgrades and drew dark blocks on some phones; blobs are steady and cost nothing.
for (const tier of Object.values(VISUALS.quality.tiers)) {
  tier.shadows = 'off';
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
const particles = new Particles(600);
scene.add(particles.points);
stage.attachParticles(particles);
const cash = new CashView();
scene.add(cash.mesh);
const chips = new ClassChips();
// The game hangs class chips out over the lake; with the camera on the conductor that is off-screen, so the ad brings
// them in over the middle of the carriage (still above its walls).
chips.group.position.x = HALF_WIDTH + 1.2;
scene.add(chips.group);
const audio = new AudioEngine();
audio.prepare();
audio.setVolume(0.7);

// The café's floor: a soft woven carpet wall to wall instead of its tiles (the ad only; the game is untouched).
getLayout('cafe', CAFE_TIER).venue!.carpets = [{ rect: rect(-INNER + 0.05, 0.05, INNER - 0.05, 16.3), style: 'persian' }];

// Every carriage the ad will show is built now, hidden, so an upgrade is a swap and never a hitch mid-play. Passenger
// carriages start repaired (Basic, tier 1): the run-down tier's holes in the floor read as black boxes on a phone.
const SLOT = { lobby: 0, sleeper: 1, cafe: 2, cinema: 3 } as const;
function buildView(type: CarriageType, slot: number, tier: number): CarriageView {
  const view = new CarriageView(getLayout(type, tier), slot, tier);
  view.group.position.z = carriageOriginZ(slot);
  view.group.visible = false;
  scene.add(view.group);
  const venue = view.layout.venue;
  if (venue) {
    for (const g of venue.groups) view.setVenueGroupOpen(g.index, true);
    view.setVenueExtras(venue.extras.map((e) => e.key));
  }
  if (type === 'lobby') {
    view.setRackLevel(1);
    view.setLuggageCount(6);
  }
  return view;
}
const views = {
  lobby: buildView('lobby', SLOT.lobby, TIER.basic),
  sleeper: buildView('sleeper', SLOT.sleeper, TIER.basic),
  sleeperComfort: buildView('sleeper', SLOT.sleeper, TIER.comfort),
  sleeperBusiness: buildView('sleeper', SLOT.sleeper, TIER.business),
  cafe: buildView('cafe', SLOT.cafe, CAFE_TIER),
  cinema: buildView('cinema', SLOT.cinema, CINEMA_TIER),
};
views.lobby.group.visible = true;

interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [{ type: 'lobby', tier: TIER.basic, view: views.lobby }];
const map = new TrainMap(0.3);
/** Rooms not bought yet, per carriage: shut and covered, their doorways walled off. */
const locked = new Map<number, Set<number>>([[SLOT.lobby, new Set([2])], [SLOT.sleeper, new Set([2, 3, 4, 5])]]);
map.lockedRooms = (i) => new Set([...(locked.get(i) ?? [])].map((c) => `cabin:${c}`));
const trainRear = (): number => carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH;
function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  scenery.setSpan(trainRear());
}
views.lobby.setCabinLocked(2, true);
for (const c of [2, 3, 4, 5]) views.sleeper.setCabinLocked(c, true);
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
/** A route through the train (the game's nav graph: doorways, gangways, round furniture), ending exactly at `to`. */
function route(from: Vec2, to: Vec2, toNode?: string): Vec2[] {
  const a = map.nearestNode(from.x, from.z);
  const b = toNode ?? map.nearestNode(to.x, to.z);
  const nodes = a && b ? map.pathBetweenNodes(a, b) : null;
  // No route (should not happen): never a straight line through walls; stay put unless the way is plainly clear.
  if (!nodes) return straight(from, to) ? [{ x: to.x, z: to.z }] : [];
  const pts = nodes.map((p) => ({ x: p.x, z: p.z }));
  pts.push({ x: to.x, z: to.z });
  return pts;
}
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
  <div class="ad-goal"><canvas width="96" height="96"></canvas><span></span></div>
  <button class="ad-mute" type="button" aria-label="Sound"><svg viewBox="0 0 32 32"><path d="M5 12h5l7-6v20l-7-6H5z" fill="#2B2230"/><path class="w" d="M21 11c2 2.5 2 7.5 0 10M24.5 8c4 4.5 4 11.5 0 16" fill="none" stroke="#2B2230" stroke-width="2.6" stroke-linecap="round"/><path class="x" d="M21 12l7 8M28 12l-7 8" stroke="#C0485C" stroke-width="3" stroke-linecap="round"/></svg></button>
  <div class="ad-banner"></div>
  <div class="ad-class"><div class="ad-class-card"><canvas width="160" height="160"></canvas><b></b><span class="ad-stars"></span><i></i></div></div>
  <div class="ad-hand"><svg viewBox="0 0 100 120" width="70" height="84"><path d="M38 10c0-6 10-6 10 0v40l3-1V40c0-6 10-6 10 0v12l3 0V46c0-6 10-6 10 0v10l3 1v-4c0-6 10-6 10 0v28c0 18-12 32-30 32H52c-10 0-16-4-22-12L10 74c-4-6 3-12 9-8l13 10h6z" fill="#FFF6E4" stroke="#2B2230" stroke-width="6" stroke-linejoin="round"/></svg></div>`;
const cashBox = ui.querySelector('.ad-cash') as HTMLElement;
const cashText = ui.querySelector('.ad-cash-n') as HTMLElement;
drawIcon((ui.querySelector('.ad-cash canvas') as HTMLCanvasElement).getContext('2d')!, 'cash', 48, 48, 92);
const goalBox = ui.querySelector('.ad-goal') as HTMLElement;
const goalIcon = (goalBox.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
const goalText = goalBox.querySelector('span') as HTMLElement;
const banner = ui.querySelector('.ad-banner') as HTMLElement;
const classBox = ui.querySelector('.ad-class') as HTMLElement;
const hand = ui.querySelector('.ad-hand') as HTMLElement;
const muteBtn = ui.querySelector('.ad-mute') as HTMLButtonElement;
muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  muted = !muted;
  muteBtn.classList.toggle('off', muted);
  audio.setEnabled(!muted, false);
});
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
/** The goal line under the money: one short instruction with its icon (the tutorial, then hints when you hesitate). */
let goalKey = '';
function setGoal(icon: IconName | null, text: string): void {
  const key = `${icon}|${text}`;
  if (key === goalKey) return;
  goalKey = key;
  if (!icon) {
    goalBox.classList.remove('on');
    return;
  }
  goalIcon.clearRect(0, 0, 96, 96);
  drawIcon(goalIcon, icon, 48, 48, 88);
  goalText.textContent = text;
  goalBox.classList.remove('on');
  void goalBox.offsetWidth;
  goalBox.classList.add('on');
}
let bannerTimer = 0;
function showBanner(title: string, sub = ''): void {
  banner.innerHTML = `<b>${title}</b>${sub ? `<i>${sub}</i>` : ''}`;
  banner.classList.remove('on');
  void banner.offsetWidth;
  banner.classList.add('on');
  bannerTimer = 2.2;
}
/** A class upgrade's card, like the game's: the class emblem on its colour, its stars, and what it is worth. */
let classTimer = 0;
function showClassCard(cls: ClassDef, stars: number): void {
  const c = classBox.querySelector('canvas') as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 160, 160);
  ctx.beginPath();
  ctx.arc(80, 80, 70, 0, Math.PI * 2);
  ctx.fillStyle = cls.color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#F2C24E';
  ctx.stroke();
  drawIcon(ctx, 'bed', 80, 82, 96);
  (classBox.querySelector('b') as HTMLElement).textContent = `${cls.name.toUpperCase()} CLASS`;
  (classBox.querySelector('.ad-stars') as HTMLElement).textContent = '★'.repeat(stars);
  (classBox.querySelector('i') as HTMLElement).textContent = `Fares ×${cls.fare}`;
  (classBox.querySelector('.ad-class-card') as HTMLElement).style.setProperty('--cls', cls.color);
  classBox.classList.remove('on');
  void classBox.offsetWidth;
  classBox.classList.add('on');
  classTimer = 2.6;
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

// ================================================================ thought bubbles: a face and what they want, centred over the head
type Mood = 'wait' | 'angry' | 'love' | 'none';
const EMOJI: Record<Exclude<Mood, 'none'>, string> = { wait: '🙂', angry: '😠', love: '😍' };
const ITEM_ICON: Record<string, IconName> = {
  tea: 'tea', coffee: 'coffee', champagne: 'champagne', blanket: 'blanket', towel: 'towel', luggage: 'luggage', latte: 'latte', pastry: 'pastry', popcorn: 'popcorn', room: 'bed',
};
const ITEM_WORD: Record<string, string> = {
  tea: 'tea', coffee: 'coffee', champagne: 'champagne', blanket: 'a blanket', towel: 'a towel', luggage: 'their bag', latte: 'a latte', pastry: 'a croissant', popcorn: 'popcorn',
};
const bubbleTextures = new Map<string, THREE.CanvasTexture>();
/**
 * A rounded bubble with a little tail at the bottom middle, its contents centred: the face, and what they want beside
 * it. The sprite's bottom middle (the tail's tip) sits just over the head, so the bubble is centred on the person.
 * Square power-of-two canvas, premultiplied: no dark box on any GPU.
 */
function bubbleTexture(mood: Exclude<Mood, 'none'>, want: string | null): THREE.CanvasTexture {
  const key = `${mood}:${want ?? ''}`;
  const cached = bubbleTextures.get(key);
  if (cached) return cached;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const w = want ? 220 : 136;
  const h = 128;
  const x0 = (S - w) / 2;
  const y0 = S - h - 34;
  const r = 52;
  const shape = (): void => {
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    ctx.arcTo(x0 + w, y0 + h, S / 2 + 16, y0 + h, r);
    ctx.lineTo(S / 2 + 16, y0 + h);
    ctx.lineTo(S / 2, y0 + h + 26);
    ctx.lineTo(S / 2 - 16, y0 + h);
    ctx.arcTo(x0, y0 + h, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w, y0, r);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  shape();
  ctx.lineWidth = 12;
  ctx.strokeStyle = mood === 'angry' ? '#B3243B' : '#2B2230';
  ctx.stroke();
  ctx.fillStyle = mood === 'angry' ? '#FFE6E2' : '#FFFFFF';
  ctx.fill();
  const cy = y0 + h / 2 + 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '78px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  if (want) {
    ctx.fillText(EMOJI[mood], S / 2 - 50, cy);
    drawIcon(ctx, ITEM_ICON[want] ?? 'tea', S / 2 + 50, cy, 86);
  } else ctx.fillText(EMOJI[mood], S / 2, cy);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = 2;
  bubbleTextures.set(key, t);
  return t;
}
/** Height of the tail's tip on the bubble's canvas (from the bottom), as a share of the sprite. */
const BUBBLE_TIP = 34 / 256 - 26 / 256;
class Bubble {
  readonly sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  private key = '';
  private pop = 1;
  private t = Math.random() * 6;
  constructor(private readonly size = 0.95) {
    // Drawn last and over everything: a bubble never cuts into a wall or a bed. Anchored at the tail's tip.
    this.sprite.renderOrder = 20;
    this.sprite.center.set(0.5, BUBBLE_TIP);
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  get mood(): Mood {
    return (this.key.split(':')[0] || 'none') as Mood;
  }
  set(mood: Mood, want: string | null = null): void {
    const key = mood === 'none' ? '' : `${mood}:${want ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.sprite.visible = mood !== 'none';
    if (mood !== 'none') {
      this.sprite.material.map = bubbleTexture(mood, want);
      this.sprite.material.needsUpdate = true;
    }
    this.pop = 0;
  }
  remove(): void {
    scene.remove(this.sprite);
  }
  update(dt: number, x: number, y: number, z: number): void {
    if (!this.sprite.visible) return;
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4.5);
    const p = this.pop;
    const s = p < 1 ? Math.min(1.25, 1 - Math.cos(p * Math.PI * 2.6) * Math.exp(-p * 4.5)) : 1 + Math.sin(this.t * 3) * 0.02;
    const jitter = this.mood === 'angry' ? Math.sin(this.t * 38) * 0.015 : 0;
    this.sprite.position.set(x + jitter, y + Math.sin(this.t * 2.4) * 0.025, z);
    this.sprite.scale.set(this.size * s, this.size * s, 1);
  }
}

// ================================================================ rooms
type ClassId = 'basic' | 'comfort' | 'business';
interface Room { car: number; cabin: number; guest: Guest | null; dirty: boolean; tidy: number; pile: string | null; marker: JobMarker }
let rooms: Room[] = [];
const roomCls = (r: Room): ClassId => {
  const tier = train[r.car].tier;
  return tier >= TIER.business ? 'business' : tier >= TIER.comfort ? 'comfort' : 'basic';
};
const cabinOf = (r: Room): CabinLayout => train[r.car].view.layout.cabins[r.cabin];
const roomZ = (r: Room): number => carriageOriginZ(r.car);
const sitSpot = (r: Room) => ({ x: cabinOf(r).bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: cabinOf(r).bedPose.z + roomZ(r), facing: -Math.PI / 2 });
const lieSpot = (r: Room) => ({ x: cabinOf(r).bedPose.x, y: FLOOR_Y + BED_TOP, z: cabinOf(r).bedPose.z + roomZ(r), facing: 0 });
const roomCentre = (r: Room): Vec2 => walkableNear(cabinOf(r).center.x, cabinOf(r).center.z + roomZ(r));
function makeRooms(car: number): Room[] {
  const view = train[car].view;
  return view.layout.cabins.map((c, i) => {
    const marker = new JobMarker('broom');
    marker.visible = false;
    scene.add(marker.group);
    const room: Room = { car, cabin: i, guest: null, dirty: false, tidy: 0, pile: null, marker };
    const p = walkableNear(c.center.x, c.center.z + carriageOriginZ(car));
    marker.setPosition(p.x, p.z);
    marker.setIconAnchor(c.bedPose.x - p.x, c.bedPose.z + carriageOriginZ(car) - p.z, 1.3);
    return room;
  });
}
rooms = makeRooms(SLOT.lobby);
const roomOpen = (r: Room): boolean => !locked.get(r.car)?.has(r.cabin);
/** A clean, open room nobody has, in a carriage not about to be rebuilt with fewer rooms. */
function freeRoom(): Room | null {
  return rooms.find((r) => roomOpen(r) && !r.guest && !r.dirty && !(refitPending && r.car === SLOT.sleeper && r.cabin >= 3)) ?? null;
}

// ================================================================ guests
type Pose = 'stand' | 'sit' | 'sleep';
type GuestState = 'boarding' | 'queue' | 'toRoom' | 'room' | 'toVenue' | 'venue' | 'back' | 'leaving';
const RADIUS = 0.3;
let lookSeq = 0;
function guestLook(): CharacterLook {
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[(lookSeq++ * 5) % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
interface Order { item: ItemKind; since: number; bills: number }
class Guest {
  readonly view: CharacterView;
  readonly bubble = new Bubble();
  x: number;
  z: number;
  y = FLOOR_Y;
  facing = Math.PI;
  speed = 0;
  pose: Pose = 'stand';
  path: Vec2[] = [];
  onArrive: (() => void) | null = null;
  blockedFor = 0;
  sidestepped = false;
  state: GuestState = 'boarding';
  room: Room | null = null;
  seat: { venue: 'cafe' | 'cinema'; seat: VenueSeatLayout } | null = null;
  order: Order | null = null;
  /** What they say they need while queueing for a room. */
  waitingFor: string | null = null;
  happyUntil = -1;
  askIn = TUNE.firstAsk;
  legsLeft = TUNE.legs;
  queueSlot = -1;
  firstAsk: ItemKind | null = null;
  constructor(x: number, z: number) {
    this.view = new CharacterView(guestLook(), 1.04);
    scene.add(this.view.root);
    this.x = x;
    this.z = z;
  }
  get walking(): boolean {
    return this.path.length > 0;
  }
  walkTo(points: Vec2[], onArrive: (() => void) | null = null): void {
    if (this.pose !== 'stand') this.setPose('stand', { x: this.x, y: FLOOR_Y, z: this.z, facing: this.facing });
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
  remove(): void {
    scene.remove(this.view.root);
    this.bubble.remove();
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
      const dNext = Math.hypot(nx - me.x, nz - me.z);
      const blocked = dNext < RADIUS * 2 && dNext < Math.hypot(this.x - me.x, this.z - me.z);
      // Never through the conductor: a moment's wait, then a step round them (or, if there is no room, a little longer).
      if (blocked && this.blockedFor > 0.35 && !this.sidestepped) {
        const px = -(dz / (d || 1));
        const pz = dx / (d || 1);
        for (const side of [1, -1]) {
          const sx = me.x + px * side * 0.7;
          const sz = me.z + pz * side * 0.7;
          if (map.walk.isWalkable(sx, sz) && straight({ x: this.x, z: this.z }, { x: sx, z: sz })) {
            this.path.unshift({ x: sx, z: sz });
            this.sidestepped = true;
            break;
          }
        }
      }
      if (blocked && this.blockedFor < 1.6) {
        this.blockedFor += dt;
        this.speed = 0;
      } else {
        if (!blocked) this.sidestepped = false;
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
    if (this.order) {
      const long = clock - this.order.since > TUNE.patience;
      if (long && this.bubble.mood !== 'angry') sfx('grumble');
      this.bubble.set(long ? 'angry' : 'wait', this.order.item);
    } else if (this.waitingFor) this.bubble.set('wait', this.waitingFor);
    else this.bubble.set(clock < this.happyUntil ? 'love' : 'none');
    const head = this.pose === 'sit' ? 1.5 : this.pose === 'sleep' ? 0.85 : 1.98;
    this.bubble.update(dt, this.x, this.y + head, this.z);
    if (clock < this.happyUntil && Math.random() < dt * 1.5) particles.emit('heart', this.x, this.y + head, this.z, 1, 0.15);
  }
}
function turnToward(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
const guests: Guest[] = [];
const queue: Guest[] = [];
const QUEUE = views.lobby.layout.queue;
const DOOR = views.lobby.layout.doors[0];

/** A traveller walks along the platform, in at the lobby's door and joins the queue at the desk. */
function board(delay: number, i: number, firstAsk: ItemKind | null = null): void {
  later(delay, () => {
    const start = { x: PLATFORM.concourse[1].x + 0.4 - (i % 2) * 0.4, z: PLATFORM.concourse[1].z - 2.2 - i * 1.1 };
    const g = new Guest(start.x, start.z);
    g.firstAsk = firstAsk;
    guests.push(g);
    g.walkTo([PLATFORM.concourse[1], PLATFORM.concourse[0], { x: DOOR.outside.x - 0.4, z: DOOR.outside.z }, { x: DOOR.inside.x, z: DOOR.inside.z }], () => {
      g.state = 'queue';
      queue.push(g);
      layoutQueue();
    });
  });
}
function layoutQueue(): void {
  queue.forEach((g, i) => {
    if (g.queueSlot === i) return;
    g.queueSlot = i;
    const spot = QUEUE[Math.min(i, QUEUE.length - 1)];
    g.walkTo([spot], () => (g.facing = -Math.PI / 2));
  });
}
const frontReady = (): Guest | null => (queue[0] && !queue[0].walking && queue[0].queueSlot === 0 ? queue[0] : null);

/** Check-in: the key, the fare paid onto the desk, and off to their room. */
function checkIn(g: Guest, room: Room): void {
  queue.shift();
  g.queueSlot = -1;
  layoutQueue();
  g.waitingFor = null;
  room.guest = g;
  g.room = room;
  g.state = 'toRoom';
  sfx('ding');
  keyPop(g);
  const bills = TUNE.fare[roomCls(room)];
  cash.flyToPile('desk', new THREE.Vector3(g.x, FLOOR_Y + 1.1, g.z), bills);
  later(0.25, () => sfx('cash'));
  done('checkin');
  later(0.5, () => {
    const sit = sitSpot(room);
    g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => settle(g));
  });
}
/** A key pops over a guest's head as it is handed over. */
const keyTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  drawIcon(c.getContext('2d')!, 'key', 64, 64, 110);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function keyPop(g: Guest): void {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: keyTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  s.renderOrder = 22;
  scene.add(s);
  const t0 = clock;
  const tick = (): void => {
    const k = (clock - t0) / 0.9;
    if (k >= 1) {
      scene.remove(s);
      s.material.dispose();
      return;
    }
    const sc = 0.55 * (k < 0.25 ? k / 0.25 * 1.2 : 1);
    s.scale.set(sc, sc, 1);
    s.position.set(g.x, FLOOR_Y + 2.2 + k * 0.5, g.z);
    s.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    requestAnimationFrame(tick);
  };
  tick();
}
function settle(g: Guest): void {
  const room = g.room!;
  g.setPose('sit', sitSpot(room));
  g.state = 'room';
  g.askIn = g.firstAsk ? 0.9 : TUNE.firstAsk;
  sfx('door');
}

/** What guests of each class ask for (in their room), from what the train has. */
function wishes(g: Guest): ItemKind[] {
  const cls = g.room ? roomCls(g.room) : 'basic';
  const list: ItemKind[] = cls === 'business' ? ['champagne', 'coffee', 'towel'] : cls === 'comfort' ? ['tea', 'towel', 'luggage'] : ['tea', 'blanket', 'luggage'];
  if (train.length > SLOT.cafe && cls !== 'business') list.push('pastry');
  return list;
}
function ask(g: Guest, item: ItemKind, bills: number): void {
  g.order = { item, since: clock, bills };
  if (g.pose === 'sleep' && g.room) g.setPose('sit', sitSpot(g.room));
  g.view.act('wave', 0.8);
  sfx('bloop');
}
function think(g: Guest, dt: number): void {
  if (g.order || g.walking) return;
  if (g.state === 'room' && g.room) {
    // Now and then a resting guest goes for a coffee or to the theatre (once those cars are on the train).
    if (journey.phase === 'moving' && Math.random() < dt * TUNE.outing && g.askIn > 3 && tryOuting(g)) return;
    g.askIn -= dt;
    if (g.askIn > 0) return;
    const item = g.firstAsk ?? wishes(g)[Math.floor(Math.random() * wishes(g).length)];
    g.firstAsk = null;
    const cls = roomCls(g.room);
    ask(g, item, item === 'pastry' ? TUNE.cafe : TUNE.deliver[cls]);
  }
}

// ================================================================ venue outings: the café and the theatre
function tryOuting(g: Guest): boolean {
  const venues: ('cafe' | 'cinema')[] = [];
  if (train.length > SLOT.cafe) venues.push('cafe');
  if (train.length > SLOT.cinema && filmT < 0) venues.push('cinema');
  if (venues.length === 0) return false;
  const venue = venues[Math.floor(Math.random() * venues.length)];
  const view = venue === 'cafe' ? views.cafe : views.cinema;
  const z0 = carriageOriginZ(venue === 'cafe' ? SLOT.cafe : SLOT.cinema);
  const taken = new Set(guests.filter((x) => x.seat?.venue === venue).map((x) => x.seat!.seat));
  const seats = view.layout.venue!.seats.filter((s, i) => !taken.has(s) && (venue === 'cinema' || i % 2 === 0));
  if (seats.length === 0) return false;
  const seat = seats[0];
  g.seat = { venue, seat };
  g.state = 'toVenue';
  const sitAt = { x: seat.sit.x, y: FLOOR_Y + seat.top - 0.24, z: seat.sit.z + z0, facing: seat.facing };
  const near = walkableNear(seat.serve ? seat.serve.x : seat.sit.x, seat.sit.z + z0);
  g.walkTo(route({ x: g.x, z: g.z }, near, map.nodeId(venue === 'cafe' ? SLOT.cafe : SLOT.cinema, seat.node)), () => {
    g.setPose('sit', sitAt);
    g.state = 'venue';
    if (venue === 'cafe') ask(g, Math.random() < 0.6 ? 'latte' : 'pastry', TUNE.cafe);
    else if (Math.random() < 0.5) later(1.2, () => g.state === 'venue' && !g.order && filmT < 0 && ask(g, 'popcorn', TUNE.popcorn));
  });
  return true;
}
/** Back to their room after a visit. */
function goBack(g: Guest): void {
  if (!g.room) return;
  g.seat = null;
  g.state = 'back';
  const room = g.room;
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sit);
    g.state = 'room';
    g.askIn = 3 + Math.random() * 4;
  });
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
const SPAWN = walkableNear(-0.6, 5.8);
const me = { x: SPAWN.x, z: SPAWN.z, facing: Math.PI, speed: 0, vx: 0, vz: 0 };
let speedNow = TUNE.speed;
const MAX_CARRY = 3;
const carried: { item: ItemKind; mesh: THREE.Mesh }[] = [];
const flying: { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
const popping: { obj: THREE.Object3D; t: number; base: number }[] = [];
const tmpTo = new THREE.Vector3();
function pickUp(item: ItemKind): void {
  const mesh = createItemMesh(item);
  mesh.scale.setScalar(0.01);
  scene.add(mesh);
  carried.push({ item, mesh });
  popping.push({ obj: mesh, t: 0, base: 1.15 });
  player.setCarrying(true);
  sfx('pickup', 1 + carried.length * 0.06);
  done(`fetch`);
}
function serve(g: Guest): void {
  const order = g.order!;
  const i = carried.findIndex((c) => c.item === order.item);
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  g.order = null;
  flying.push({
    mesh, from: mesh.position.clone(), to: () => tmpTo.set(g.x, g.y + (g.pose === 'stand' ? 1.05 : 0.9), g.z), t: 0, dur: 0.28,
    done: () => {
      scene.remove(mesh);
      g.happyUntil = clock + 2.4;
      g.view.act(['tea', 'coffee', 'latte', 'champagne'].includes(order.item) ? 'sip' : 'hug', 2);
      g.view.bounce(1);
      sfx('heart');
      particles.emit('heart', g.x, g.y + 1.6, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 10, 0.3);
      pay(order.bills, g.x, g.y + 1.1, g.z);
      done('serve');
      served++;
      if (finaleCount >= 0 && g.room?.car === SLOT.sleeper && g.state === 'room') finaleCount++;
      // During the tutorial one thing at a time: nobody asks again until it is over.
      g.askIn = (tutorialDone ? 0 : 30) + TUNE.nextAsk[0] + Math.random() * (TUNE.nextAsk[1] - TUNE.nextAsk[0]);
      // Content: a rest in bed, or back from the café to their room.
      if (g.state === 'room' && g.room) later(2.2, () => !g.order && g.state === 'room' && g.room && g.setPose('sleep', lieSpot(g.room), train[g.room.car].view.blanketColor));
      else if (g.state === 'venue' && g.seat?.venue === 'cafe') later(3.5, () => g.state === 'venue' && goBack(g));
    },
  });
  sfx('drop');
}

// ================================================================ cash: the desk's pile, the rooms' tips, the bills on the back
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
const L = views.lobby.layout.anchors;
cash.createPile('desk', L.deskCash.x, FLOOR_Y + 0.62, L.deskCash.z);
const deskPile = walkableNear(L.deskCash.x - 0.2, L.deskCash.z + 0.3);
interface PileRef { id: string; x: number; z: number }
const piles: PileRef[] = [{ id: 'desk', x: deskPile.x, z: deskPile.z }];
const taking = new Set<string>();

const BACK_MAX = 44;
const BILL_STEP = 0.05;
const billGeometry = new GeoBuilder()
  .box(0, 0, 0, 0.36, 0.044, 0.21, PALETTE.cashEdge, 0, { shade: 1 })
  .box(0, 0.004, 0, 0.34, 0.044, 0.19, PALETTE.cash, 0, { shade: 1 })
  .box(0, 0.024, 0, 0.09, 0.006, 0.215, PALETTE.cashBand, 0, { shade: 1 })
  .build();
const back = new THREE.InstancedMesh(billGeometry, MATERIALS.solid, BACK_MAX);
back.frustumCulled = false;
back.count = 0;
scene.add(back);
let backCount = 0;
let backBounce = 0;
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

// ================================================================ stations: the desk, the urn, the linen cupboard, the rack, the café, the projector
interface Station { kind: 'desk' | 'source' | 'film'; items: ItemKind[]; car: number; x: number; z: number; marker: JobMarker; progress: number }
const stations: Station[] = [];
function addStation(kind: Station['kind'], items: ItemKind[], car: number, local: Vec2, icon: IconName, badgeOver?: Vec2): Station {
  const z0 = carriageOriginZ(car);
  const p = walkableNear(local.x, local.z + z0);
  const marker = new JobMarker(icon);
  marker.setPosition(p.x, p.z);
  if (badgeOver) marker.setIconAnchor(badgeOver.x - p.x, badgeOver.z + z0 - p.z, 1.6);
  else {
    const anchor = map.serviceAnchor(p.x, p.z, 1.3);
    if (anchor) marker.setIconAnchor(anchor.x - p.x, anchor.z - p.z, anchor.height + 0.6);
  }
  marker.visible = false;
  scene.add(marker.group);
  const s: Station = { kind, items, car, x: p.x, z: p.z, marker, progress: 0 };
  stations.push(s);
  return s;
}
const URN: ItemKind[] = ['tea', 'coffee', 'champagne'];
const LINEN: ItemKind[] = ['blanket', 'towel'];
const desk = addStation('desk', [], SLOT.lobby, L.deskService, 'key', { x: -1.17, z: 3.4 });
addStation('source', URN, SLOT.lobby, L.urn, 'tea');
addStation('source', LINEN, SLOT.lobby, L.linen, 'blanket');
addStation('source', ['luggage'], SLOT.lobby, L.rack, 'luggage');
let projector: Station | null = null;
let filmT = -1;

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
  // Only cash really carried goes in: never free, and a part-paid upgrade keeps its fill.
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

// ================================================================ the journey: stations come and go; travellers board, guests get off
const platform = new PlatformView();
platform.build(carriageOriginZ(3) + CARRIAGE_LENGTH, null, null);
platform.setStationName('Millbrook');
scene.add(platform.group);
const STATIONS = ['Millbrook', 'Ashby Lake', 'Thistledown', 'Harrowgate', 'Elmsworth', 'Kingsbridge'];
type TrainPhase = 'stopped' | 'departing' | 'moving' | 'arriving';
const journey = { phase: 'stopped' as TrainPhase, speed: 0, offset: 0, t: 0, station: 0, ridden: 0 };
let lampsShown = false;
let doorOpen = 1;
function updateJourney(dt: number): void {
  const j = journey;
  j.t += dt;
  if (j.phase === 'departing') {
    j.speed = Math.min(TUNE.ride, j.speed + (TUNE.ride / 4) * dt);
    j.offset += j.speed * dt;
    if (j.offset > platform.z1 - platform.z0 + 30) {
      j.phase = 'moving';
      j.t = 0;
    }
  } else if (j.phase === 'moving') {
    j.speed = TUNE.ride;
    if (j.t > TUNE.rideSeconds && tutorialDone) arrive();
  } else if (j.phase === 'arriving') {
    const d = -j.offset;
    const decel = (TUNE.ride * TUNE.ride) / (2 * TUNE.arriveFrom);
    j.speed = Math.max(0.6, Math.min(TUNE.ride, Math.sqrt(2 * decel * Math.max(0, d))));
    j.offset = Math.min(0, j.offset + j.speed * dt);
    if (j.offset >= 0) {
      j.offset = 0;
      j.speed = 0;
      j.phase = 'stopped';
      j.t = 0;
      sfx('bell');
      atStation();
    }
  } else if (j.phase === 'stopped' && tutorialDone && j.t > TUNE.minStop && !guests.some((g) => g.state === 'boarding' || (g.state === 'leaving' && g.walking))) depart();
  const visible = j.phase !== 'moving';
  platform.group.visible = visible;
  platform.setOffset(j.offset);
  if (visible) platform.animate(dt);
  if (visible !== lampsShown) {
    lampsShown = visible;
    stage.lightMap.setPlatform(visible ? platformLightInput(platform.lampAnchors, platform.z0, platform.z1) : null);
  }
  if (visible) stage.lightMap.setPlatformOffset(j.offset);
  scenery.setHiddenRegion(visible ? { x0: PLATFORM_X0 - 0.2, x1: PLATFORM_X0 + 16, z0: platform.z0 + j.offset - 2, z1: platform.z1 + j.offset + 2 } : null);
  doorOpen += ((j.phase === 'stopped' ? 1 : 0) - doorOpen) * Math.min(1, dt * 4);
  views.lobby.setDoorOpen(Math.round(doorOpen * 50) / 50);
}
function depart(): void {
  if (journey.phase !== 'stopped') return;
  journey.phase = 'departing';
  journey.t = 0;
  journey.speed = 0;
  platform.setFlag(true);
  sfx('whistle');
  later(1.2, () => sfx('depart'));
}
function arrive(): void {
  journey.station = (journey.station + 1) % STATIONS.length;
  platform.setStationName(STATIONS[journey.station]);
  platform.setFlag(false);
  journey.phase = 'arriving';
  journey.t = 0;
  journey.offset = -TUNE.arriveFrom;
  showBanner(STATIONS[journey.station].toUpperCase(), 'Guests on and off');
}
/** At a station: those whose stop it is get off (a tip and an untidy room behind them); new travellers board. */
function atStation(): void {
  for (const g of guests) {
    if (g.state === 'boarding' || g.state === 'queue' || g.state === 'leaving') continue;
    g.legsLeft--;
    if (g.legsLeft <= 0) leave(g);
  }
  const free = rooms.filter((r) => roomOpen(r) && !r.guest).length - queue.length;
  const n = Math.max(0, Math.min(TUNE.boardMax, free));
  for (let i = 0; i < n; i++) board(0.6 + i * 0.9, i);
}
function leave(g: Guest): void {
  g.order = null;
  g.seat = null;
  g.state = 'leaving';
  const room = g.room;
  if (room) {
    room.guest = null;
    room.dirty = true;
    const view = train[room.car].view;
    view.setDirt(room.cabin, [true]);
    view.playMessArrival(room.cabin);
    // Their tip, left on the room's floor.
    const c = cabinOf(room);
    const id = `tip${tipSeq++}`;
    const p = walkableNear(c.tipPile.x, c.tipPile.z + roomZ(room));
    cash.createPile(id, c.tipPile.x, FLOOR_Y, c.tipPile.z + roomZ(room));
    cash.setPileCount(id, TUNE.tip[roomCls(room)]);
    piles.push({ id, x: p.x, z: p.z });
    room.pile = id;
  }
  g.room = null;
  g.view.act('wave', 0.8);
  const exit = route({ x: g.x, z: g.z }, { x: DOOR.inside.x, z: DOOR.inside.z });
  g.walkTo([...exit, { x: DOOR.outside.x - 0.4, z: DOOR.outside.z }, PLATFORM.concourse[0], PLATFORM.concourse[1], { x: PLATFORM.concourse[1].x + 0.5, z: PLATFORM.concourse[1].z - 6 }], () => {
    g.remove();
    guests.splice(guests.indexOf(g), 1);
  });
}
let tipSeq = 0;

// ================================================================ the tutorial and the upgrades
let tutorialDone = false;
let stepNo = 0;
let served = 0;
/** Steps the tutorial waits for, in order; `done(kind)` moves it on when the player does that thing. */
const TUTORIAL: { kind: string; icon: IconName; text: string }[] = [
  { kind: 'checkin', icon: 'key', text: 'Check in the guest' },
  { kind: 'collect', icon: 'cash', text: 'Collect the cash' },
  { kind: 'fetch', icon: 'tea', text: 'Get tea from the urn' },
  { kind: 'serve', icon: 'tea', text: 'Bring the tea to the guest' },
  { kind: 'checkin', icon: 'key', text: 'Check in the next guest' },
  { kind: 'collect', icon: 'cash', text: 'Collect the cash' },
  { kind: 'fetch', icon: 'luggage', text: 'Get their bag from the rack' },
  { kind: 'serve', icon: 'luggage', text: 'Bring the bag to the guest' },
  { kind: 'buy', icon: 'bed', text: 'Buy a new room' },
];
function done(kind: string): void {
  if (tutorialDone || stepNo >= TUTORIAL.length) return;
  if (TUTORIAL[stepNo].kind !== kind) return;
  stepNo++;
  if (stepNo === 4) board(0.4, 0, 'luggage');
  if (stepNo === TUTORIAL.length - 1) showTile(walkableNear(-1.3, 15.1), 'bed', 'New Room', TUNE.price.room, buyRoom);
}
let refitPending = false;
let finaleCount = -1;
interface Upgrade { at: Vec2; icon: IconName; name: string; price: number; buy: () => void; when?: () => boolean }
const PLAN: Upgrade[] = [];
let waiting: Upgrade | null = null;
function nextUpgrade(): void {
  const next = PLAN.shift();
  if (next) later(1.2, () => (waiting = next));
}
/** The next upgrade shows as soon as it makes sense (Business Class waits until its three cabins can hold the sleeper's guests). */
function updatePlan(): void {
  const w = waiting;
  if (!w || tile || (w.when && !w.when())) return;
  waiting = null;
  showTile(w.at, w.icon, w.name, w.price, w.buy);
}

function buyRoom(): void {
  done('buy');
  tutorialDone = true;
  openRoom(SLOT.lobby, 2);
  showBanner('NEW ROOM!', 'More guests, more fares');
  // A third traveller hurries aboard for the new room, then the train leaves.
  board(0.8, 0);
  const sz = carriageOriginZ(SLOT.sleeper);
  PLAN.push(
    { at: { x: -0.2, z: 17.2 }, icon: 'carriage', name: 'New Carriage', price: TUNE.price.carriage, buy: buySleeper },
    { at: { x: -1.3, z: sz + 8.1 }, icon: 'bed', name: 'New Room', price: TUNE.price.berth3, buy: () => (openRoom(SLOT.sleeper, 2), showBanner('NEW ROOM!', 'Room for one more'), nextUpgrade()) },
    { at: { x: -1.3, z: sz + 10.5 }, icon: 'bed', name: 'New Room', price: TUNE.price.berth4, buy: () => (openRoom(SLOT.sleeper, 3), showBanner('NEW ROOM!', 'Room for one more'), nextUpgrade()) },
    { at: { x: -1.5, z: sz + 13.2 }, icon: 'star', name: 'Comfort Class', price: TUNE.price.comfort, buy: () => refit('comfort') },
    { at: { x: -0.2, z: sz + 17.2 }, icon: 'latte', name: 'Café Car', price: TUNE.price.cafe, buy: buyCafe },
    { at: { x: 0, z: carriageOriginZ(SLOT.cafe) + 16.2 }, icon: 'film', name: 'Theatre Car', price: TUNE.price.theatre, buy: buyTheatre },
    { at: { x: -1.5, z: sz + 13.2 }, icon: 'star', name: 'Business Class', price: TUNE.price.business, buy: () => refit('business'), when: () => !rooms.some((r) => r.car === SLOT.sleeper && r.cabin >= 3 && r.guest) },
  );
  nextUpgrade();
}
function openRoom(car: number, cabin: number): void {
  locked.get(car)?.delete(cabin);
  train[car].view.setCabinLocked(cabin, false);
  rebuildTrain();
  const c = train[car].view.layout.cabins[cabin];
  particles.emit('sparkle', (c.room.x0 + c.room.x1) / 2, FLOOR_Y + 0.6, (c.room.z0 + c.room.z1) / 2 + carriageOriginZ(car), 30, 0.8);
  sfx('reveal');
  speedNow *= TUNE.speedUp;
}

/** A sleeper carriage rolls in and couples on, two rooms ready. */
function buySleeper(): void {
  couple(views.sleeper, 'sleeper', TIER.basic, 'NEW CARRIAGE!', 'The Sleeper · more rooms');
  rooms = rooms.concat(makeRooms(SLOT.sleeper));
  const S = views.sleeper.layout.anchors;
  addStation('source', URN, SLOT.sleeper, S.urn, 'tea');
  addStation('source', LINEN, SLOT.sleeper, S.linen, 'blanket');
  nextUpgrade();
}

/** A class refit of the sleeper: the game's makeover wipe sweeps down it; its guests move into the new cabins. */
function refit(to: 'comfort' | 'business'): void {
  refitPending = false;
  const old = train[SLOT.sleeper].view;
  const next = to === 'comfort' ? views.sleeperComfort : views.sleeperBusiness;
  const tier = TIER[to];
  train[SLOT.sleeper] = { type: 'sleeper', tier, view: next };
  locked.set(SLOT.sleeper, new Set());
  // The guests and the rooms move over: same guests, new (fewer, bigger) cabins; any mess is gone with the refit.
  const oldRooms = rooms.filter((r) => r.car === SLOT.sleeper);
  // (A tip still on a floor stays where it is, to be collected.)
  for (const r of oldRooms) scene.remove(r.marker.group);
  rooms = rooms.filter((r) => r.car !== SLOT.sleeper);
  const fresh = makeRooms(SLOT.sleeper);
  rooms = rooms.concat(fresh);
  const residents = guests.filter((g) => g.room && oldRooms.includes(g.room));
  residents.forEach((g, i) => {
    const r = fresh[i];
    if (!r) return;
    r.guest = g;
    g.room = r;
    if (g.state === 'room') {
      g.path = [];
      g.setPose('sit', sitSpot(r));
      g.happyUntil = clock + 2.5;
    }
  });
  rebuildTrain();
  makeover(old, next);
  const cls = classOfTier(tier);
  showClassCard(cls, to === 'comfort' ? 2 : 3);
  speedNow *= TUNE.speedUp;
  if (to === 'business') {
    finaleCount = 0;
    for (const g of residents) g.askIn = 1.5 + Math.random() * 2;
  } else nextUpgrade();
}
/** The game's makeover: a band of warm light sweeps from front to back, the new finish appearing behind it. */
const BAND = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2 + 0.3, 1.5, 0.12), new THREE.MeshBasicMaterial({ color: '#FFF1C4', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
const wipes: { t: number; z0: number; front: THREE.Plane; back: THREE.Plane; old: CarriageView; next: CarriageView; newMap: Map<THREE.Material, THREE.Material>; oldMap: Map<THREE.Material, THREE.Material> }[] = [];
function makeover(old: CarriageView, next: CarriageView): void {
  const z0 = old.group.position.z;
  const newSide = clipSide('front', [next.liveryBody, next.liveryTrim], 0);
  const oldSide = clipSide('back', [old.liveryBody, old.liveryTrim], 0);
  newSide.plane.constant = z0;
  oldSide.plane.constant = -z0;
  next.group.visible = true;
  swapMaterials(next.group, newSide.map);
  swapMaterials(old.group, oldSide.map);
  scene.add(BAND);
  BAND.position.set(0, FLOOR_Y + 0.7, z0);
  wipes.push({ t: 0, z0, front: newSide.plane, back: oldSide.plane, old, next, newMap: newSide.map, oldMap: oldSide.map });
  sfx('reveal');
  later(0.6, () => sfx('levelup'));
}
function updateWipes(dt: number): void {
  for (let i = wipes.length - 1; i >= 0; i--) {
    const w = wipes[i];
    w.t += dt / 1.6;
    const k = Math.min(1, w.t);
    const cut = w.z0 - 0.6 + (CARRIAGE_LENGTH + 1.2) * k;
    w.front.constant = cut;
    w.back.constant = -cut;
    BAND.position.z = cut;
    if (Math.random() < 0.6) particles.emit('sparkle', -1.4 + Math.random() * 2.8, FLOOR_Y + 0.4 + Math.random() * 0.8, cut, 2, 0.4);
    if (k >= 1) {
      swapMaterials(w.next.group, w.newMap, true);
      swapMaterials(w.old.group, w.oldMap, true);
      w.old.group.visible = false;
      scene.remove(BAND);
      burstAlong(w.z0, w.z0 + CARRIAGE_LENGTH, 'confetti', 40);
      wipes.splice(i, 1);
    }
  }
}

/** The café rolls in: guests drop by for a latte or a croissant (and ask for croissants in their rooms). */
function buyCafe(): void {
  couple(views.cafe, 'cafe', CAFE_TIER, 'CAFÉ CAR!', 'Lattes & croissants');
  const v = views.cafe.layout.venue!;
  addStation('source', ['latte'], SLOT.cafe, v.stations[0].pad, 'latte');
  addStation('source', ['pastry'], SLOT.cafe, v.stations[1].pad, 'pastry');
  nextUpgrade();
}
/** The theatre rolls in: guests come for the film; start it at the projector, and every seat pays. */
function buyTheatre(): void {
  couple(views.cinema, 'cinema', CINEMA_TIER, 'THEATRE CAR!', 'Start the film');
  const v = views.cinema.layout.venue!;
  addStation('source', ['popcorn'], SLOT.cinema, v.stations[0].pad, 'popcorn');
  projector = addStation('film', [], SLOT.cinema, v.projector!, 'film');
  nextUpgrade();
  // From here, the next class refit waits for the sleeper to have at most three guests (its new plan has three cabins).
  refitPending = true;
}
function startFilm(): void {
  filmT = 0;
  views.cinema.setVenueFilm(0);
  sfx('chime');
  showBanner('NOW SHOWING', '🍿 Every seat pays');
}
function endFilm(): void {
  filmT = -1;
  views.cinema.setVenueFilm(-1);
  const audience = guests.filter((g) => g.seat?.venue === 'cinema' && g.state === 'venue');
  audience.forEach((g, i) => later(i * 0.2, () => {
    g.order = null;
    g.happyUntil = clock + 2.5;
    pay(TUNE.ticket, g.x, g.y + 1.2, g.z);
    later(1.5, () => g.state === 'venue' && goBack(g));
  }));
  sfx('perfect');
}

// ================================================================ new carriages roll in and couple on (the game's signature)
const rolling: { group: THREE.Object3D; t: number; z: number; done: () => void }[] = [];
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
  for (const s of stations) {
    if (s.car >= train.length) continue;
    let wants = false;
    let item: ItemKind | null = null;
    const front = frontReady();
    if (s.kind === 'desk') wants = !!front && !!freeRoom();
    else if (s.kind === 'film') wants = filmT < 0 && guests.filter((g) => g.seat?.venue === 'cinema' && g.state === 'venue').length >= 2;
    else {
      item = s.items.find((it) => guests.filter((g) => g.order?.item === it).length > carried.filter((c) => c.item === it).length) ?? null;
      wants = !!item && carried.length < MAX_CARRY && !(item !== 'luggage' && item !== 'latte' && item !== 'pastry' && item !== 'popcorn' && nearerSource(s, item));
      if (item) s.marker.setIcon(ITEM_ICON[item]);
    }
    s.marker.visible = wants || s.progress > 0;
    s.marker.iconShown = wants;
    s.marker.highlight = wants;
    const near = Math.hypot(me.x - s.x, me.z - s.z) < (s.kind === 'desk' ? TUNE.deskReach : TUNE.pickReach);
    if (wants && near) {
      const time = s.kind === 'desk' ? TUNE.checkIn : s.kind === 'film' ? TUNE.projector : TUNE.pickUp;
      s.progress = Math.min(1, s.progress + dt / time);
      if (s.progress >= 1) {
        s.progress = 0;
        if (s.kind === 'desk' && front) checkIn(front, freeRoom()!);
        else if (s.kind === 'film') startFilm();
        else if (item) pickUp(item);
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }
  // Who is waiting at the desk for a room says so (a bed in their bubble) while every room is taken or untidy.
  const front = frontReady();
  for (const g of queue) g.waitingFor = g === front && !freeRoom() ? 'room' : null;
  // Deliveries: within reach and in plain sight (or anywhere in their room), never through a wall.
  for (const g of guests) {
    if (!g.order || g.walking || !carried.some((c) => c.item === g.order!.item)) continue;
    const a = approach(g);
    const inRoom = g.room && g.state === 'room' && Math.hypot(me.x - a.x, me.z - a.z) < TUNE.roomReach;
    if (inRoom || (Math.hypot(me.x - g.x, me.z - g.z) < TUNE.serveReach && map.walk.lineClear(me.x, me.z, a.x, a.z))) serve(g);
  }
  // Tidying: anywhere in the untidy room (the game's mess clears away as the ring fills).
  for (const r of rooms) {
    const wants = r.dirty;
    r.marker.visible = wants;
    r.marker.iconShown = wants;
    r.marker.highlight = wants;
    if (!wants) continue;
    const c = roomCentre(r);
    if (Math.hypot(me.x - c.x, me.z - c.z) < TUNE.roomReach) {
      r.tidy = Math.min(1, r.tidy + dt / TUNE.tidy);
      player.act('sweep', 0.2);
      train[r.car].view.setDirtFade(r.cabin, 0, r.tidy, (x, y, z) => particles.emit('dust', x, y, z, 3, 0.1));
      if (r.tidy >= 1) {
        r.dirty = false;
        r.tidy = 0;
        train[r.car].view.setDirt(r.cabin, [false]);
        particles.emit('sparkle', c.x, FLOOR_Y + 0.8, c.z, 20, 0.6);
        sfx('done');
        floatText('✨', c.x, FLOOR_Y + 1.2, c.z);
      }
    }
    r.marker.working = r.tidy > 0;
    r.marker.progress = r.tidy;
    r.marker.update(dt);
  }
  // Cash on the desk and the rooms' tips: scooped as the conductor walks by.
  for (let i = piles.length - 1; i >= 0; i--) {
    const p = piles[i];
    if (taking.has(p.id) || cash.pileCount(p.id) === 0) continue;
    if (Math.hypot(p.x - me.x, p.z - me.z) < TUNE.scoopReach) {
      taking.add(p.id);
      floatText(`+$${cash.pileCount(p.id) * TUNE.bill}`, p.x, FLOOR_Y + 1.5, p.z);
      cash.vacuum(p.id, backTopPos, landBill, () => {
        taking.delete(p.id);
        if (p.id !== 'desk') {
          cash.removePile(p.id);
          piles.splice(piles.indexOf(p), 1);
        }
        done('collect');
      });
    }
  }
  if (filmT >= 0) {
    filmT += dt;
    if (filmT >= TUNE.film) endFilm();
  }
  // The finale: Business Class guests served.
  if (finaleCount >= TUNE.finaleDeliveries && endAt < 0) {
    endAt = clock + TUNE.endDelay;
    showBanner('5-STAR TRAIN!', 'Every guest delighted 😍');
    sfx('perfect');
    burstAlong(0, trainRear(), 'confetti', 80);
  }
  if (endAt > 0 && clock >= endAt) endGame();
}
let endAt = -1;
/** The urn and linen of the guest's own carriage serve them (each sleeper has its own); the lobby's serve the lobby. */
function nearerSource(s: Station, item: ItemKind): boolean {
  const g = guests.find((x) => x.order?.item === item && !carried.some((c) => c.item === item));
  if (!g) return false;
  return stations.some((o) => o !== s && o.kind === 'source' && o.car < train.length && o.items.includes(item) && Math.abs(o.z - g.z) < Math.abs(s.z - g.z) - 4);
}
function approach(g: Guest): Vec2 {
  if (g.room && g.state === 'room') return roomCentre(g.room);
  return walkableNear(g.x + (g.x > -0.6 ? -0.8 : 0.8), g.z);
}
function nearestStation(item: ItemKind): Station | null {
  let best: Station | null = null;
  let bestD = 1e9;
  for (const s of stations) {
    if (s.kind !== 'source' || s.car >= train.length || !s.items.includes(item)) continue;
    const g = guests.find((x) => x.order?.item === item);
    const d = Math.hypot(s.x - me.x, s.z - me.z) + (g ? Math.abs(s.z - g.z) : 0);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** The next thing to do: the guide points at it, the hint line names it, a tap walks there. */
interface Target extends Vec2 { lift: number; icon: IconName; text: string }
function target(): Target | null {
  for (const c of carried) {
    const g = guests.find((x) => x.order?.item === c.item && !x.walking);
    if (g) return { ...approach(g), lift: 2.4, icon: ITEM_ICON[c.item], text: `Bring ${ITEM_WORD[c.item]} to the guest` };
  }
  // An upgrade you can afford: the best thing to do next.
  if (tile && money >= tile.price - tile.paid) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: `Buy: ${tile.name}` };
  if (frontReady() && freeRoom()) return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: 'Check in the guest' };
  const pile = piles.filter((p) => !taking.has(p.id) && cash.pileCount(p.id) > 0).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
  if (pile && (pile.id === 'desk' || Math.hypot(pile.x - me.x, pile.z - me.z) < 8)) return { x: pile.x, z: pile.z, lift: 1.4, icon: 'cash', text: 'Collect the cash' };
  const open = guests.filter((g) => g.order && !carried.some((c) => c.item === g.order!.item)).sort((a, b) => a.order!.since - b.order!.since);
  if (open[0] && carried.length < MAX_CARRY) {
    const item = open[0].order!.item;
    const s = nearestStation(item);
    if (s) return { x: s.x, z: s.z, lift: 2.0, icon: ITEM_ICON[item], text: `Get ${ITEM_WORD[item]}` };
  }
  const dirty = rooms.filter((r) => r.dirty).sort((a, b) => Math.hypot(roomCentre(a).x - me.x, roomCentre(a).z - me.z) - Math.hypot(roomCentre(b).x - me.x, roomCentre(b).z - me.z))[0];
  if (dirty) return { ...roomCentre(dirty), lift: 1.8, icon: 'broom', text: 'Tidy the room' };
  if (projector && filmT < 0 && projector.marker.visible) return { x: projector.x, z: projector.z, lift: 2.0, icon: 'film', text: 'Start the film' };
  if (pile) return { x: pile.x, z: pile.z, lift: 1.4, icon: 'cash', text: 'Collect the cash' };
  if (tile) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: money >= tile.price - tile.paid ? `Buy: ${tile.name}` : 'Serve guests to earn more' };
  return null;
}

// ================================================================ input: drag anywhere (an invisible floating stick), or tap to walk to the next job
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
  started = true;
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

/**
 * Stuck-proofing: when the conductor is pushing but has barely moved for a moment (a doorway, a guest, a corner),
 * people stop blocking for a while and the move takes the nav route toward where the stick points.
 */
let stuckFor = 0;
let ghostUntil = -1;
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
    const want = me.speed * dt;
    map.walk.move(pos, me.vx * want, me.vz * want, 0.6, 1.3);
    if (clock > ghostUntil) {
      for (const g of guests) {
        if (g.pose !== 'stand') continue;
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
    }
    pos.z = Math.max(0.45, Math.min(trainRear() - 0.5, pos.z));
    const moved = Math.hypot(pos.x - me.x, pos.z - me.z);
    stuckFor = mag > 0.5 && moved < want * 0.15 ? stuckFor + dt : 0;
    if (stuckFor > 0.25) {
      // Unstick: walk through people for a moment, and step along the nav route in the pushed direction.
      ghostUntil = clock + 0.8;
      const ahead = { x: me.x + me.vx * 1.5, z: me.z + me.vz * 1.5 };
      const pts = route({ x: me.x, z: me.z }, walkableNear(ahead.x, ahead.z));
      const next = pts.find((p) => Math.hypot(p.x - me.x, p.z - me.z) > 0.2);
      if (next) {
        const l = Math.hypot(next.x - me.x, next.z - me.z) || 1;
        map.walk.move(pos, ((next.x - me.x) / l) * want, ((next.z - me.z) / l) * want, 0.6, 1.3);
      }
      stuckFor = 0;
    }
    me.x = pos.x;
    me.z = pos.z;
  }
  player.setPosition(me.x, FLOOR_Y, me.z);
  player.setFacing(me.facing);
  player.update(dt, me.speed);
}

/** Cabin doors swing open for anyone at them (the game's hinged leaves), and shut behind. */
function updateDoors(dt: number): void {
  for (const car of train) {
    const z0 = car.view.group.position.z;
    for (const door of car.view.roomDoors) {
      if (door.locked) continue;
      const dz = door.z + z0;
      let want = Math.abs(me.z - dz) < 1.25 && Math.abs(me.x - door.x) < 1.1 ? 1 : 0;
      for (const g of guests) if (g.walking && Math.abs(g.z - dz) < 1.3 && Math.abs(g.x - door.x) < 1.2) want = 1;
      if (door.open === want) continue;
      car.view.setRoomDoor(door, want > door.open ? Math.min(1, door.open + dt * 5) : Math.max(0, door.open - dt * 2.5));
    }
  }
}

// ================================================================ the guide: the gold arrow, the hand and the hint line
const arrow = makeSprite(guideArrowTexture(), 0.6);
arrow.material.toneMapped = false;
arrow.renderOrder = 21;
scene.add(arrow);
let arrowShown = 0;
function updateGuide(dt: number): void {
  const t = target();
  const hesitating = !started || (clock - lastInput > TUNE.hesitate && !autoWalk && pointerId < 0);
  // The tutorial always points the way; afterwards the guide comes when the player hesitates.
  const show = !!t && !ended && (!tutorialDone || hesitating);
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  arrow.visible = arrowShown > 0.02 && !!t;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    arrow.scale.set(0.6 * arrowShown, 0.6 * arrowShown, 1);
  }
  // The hint line: the tutorial's step, then whatever the arrow points at when the player hesitates.
  if (ended) setGoal(null, '');
  else if (!tutorialDone && stepNo < TUTORIAL.length) {
    const s = TUTORIAL[stepNo];
    setGoal(t?.icon && s.kind !== 'buy' && s.kind !== 'collect' ? t.icon : s.icon, s.kind === 'fetch' && t ? `${t.text}` : s.text);
  } else if (t && hesitating) setGoal(t.icon, t.text);
  else setGoal(null, '');
  const showHand = show && hesitating;
  hand.classList.toggle('on', showHand);
  if (!showHand || !t) return;
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  tmpV.set(me.x, FLOOR_Y + 0.6, me.z);
  if (!stage.project(tmpV, a)) return;
  tmpV.set(t.x, FLOOR_Y + 0.2, t.z);
  if (!stage.project(tmpV, b)) return;
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
  setGoal(null, '');
  endCard.classList.add('on');
  sfx('levelup');
}

// ================================================================ the camera: centred on the conductor, eased, clamped to the train
function resize(): void {
  stage.resize();
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const aspect = w / Math.max(1, h);
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
  updateJourney(dt);
  if (started && !ended) {
    updatePlayer(dt);
    updateJobs(dt);
    updateTile(dt);
    updatePlan();
  } else {
    updatePlayer(0);
    desk.marker.visible = !!frontReady();
    desk.marker.iconShown = true;
    desk.marker.update(dt);
  }
  for (const g of guests) {
    think(g, dt);
    g.update(dt);
  }
  updateDoors(dt);
  updateWipes(dt);
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
  for (const c of train) c.view.animate(dt);
  chips.sync(train.map((c) => (c.type === 'lobby' || c.type === 'sleeper' ? classOfTier(c.tier) : null)), (i) => carriageOriginZ(i), dt, 1);
  scenery.update(dt, journey.speed);
  loco.update(dt, journey.speed);
  smokeT -= dt;
  if (smokeT <= 0) {
    smokeT = journey.speed > 0.5 ? 0.28 : 0.7;
    particles.emit('smoke', loco.chimneyTop.x, loco.chimneyTop.y, loco.chimneyTop.z, journey.speed > 0.5 ? 2 : 1);
  }
  particles.update(dt);
  cash.update(dt);
  updateGuide(dt);
  updateMoney(dt);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) banner.classList.remove('on');
  }
  if (classTimer > 0) {
    classTimer -= dt;
    if (classTimer <= 0) classBox.classList.remove('on');
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
  updateJourney(0);
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
  // The first traveller is already walking along the platform to the door.
  board(0, 0, 'tea');
  last = performance.now();
  requestAnimationFrame(frame);
}
void boot();

// Test hooks (harmless in an ad).
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return {
      clock: Math.round(clock), money, back: backCount, tutorial: tutorialDone ? 'done' : stepNo, tile: tile ? `${tile.name} ${tile.paid}/${tile.price}` : null, plan: PLAN.length,
      guests: guests.length, queue: queue.length, orders: guests.filter((g) => g.order).map((g) => g.order!.item), dirty: rooms.filter((r) => r.dirty).length,
      carried: carried.map((c) => c.item), journey: journey.phase, ended, finale: finaleCount, me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) },
      offFloor: guests.filter((g) => g.x < -INNER - 0.05 || (g.x > INNER + 0.05 && journey.phase === 'moving')).map((g) => `${g.state}@${g.x.toFixed(1)},${g.z.toFixed(1)}`),
    };
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
