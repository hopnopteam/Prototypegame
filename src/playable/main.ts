// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the cash, the tiles, the makeover wipe and the sounds) so it looks and plays like the game.
//
// How it plays (the train never stops; each mechanic is taught on its own, then the next one joins):
//  - Check in: four travellers queue at the reception desk; stand at the desk and each takes a key, pays the fare onto
//    the desk and goes to their room (three more wait in the lobby for rooms not built yet). Collect the cash.
//  - Then one guest at a time asks for tea (the urn), a blanket (the linen cupboard) and their bag (the luggage rack, once
//    per guest). A gold trail on the floor and an arrow lead every step; each lesson ends with praise.
//  - The first upgrade appears once it is affordable (each one does): three new rooms (a waiting traveller checks in to
//    each), Comfort Class (the makeover; dearer requests), the Attendant (serves tea by herself; her takings wait on the
//    desk), the Café Car, the Attendant's linen upgrade (blankets and towels too), the Theatre Car.
//  - Requests are capped: one at a time at first, one more with each step of growth or automation.
//  - Then the next upgrade, the Dining Car, is shown as the goal; the end card comes once you can afford it.
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
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, HALF_WIDTH, INNER, type CabinLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { clipSide, MATERIALS, SHADOW_GEOMETRY, setLivery, swapMaterials } from '../world/materials';
import { liveryFor, PALETTE } from '../world/palette';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { Ambient } from '../world/Ambient';
import { Fireflies } from '../world/Fireflies';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { Stage } from '../world/Stage';
import { trainLightInput } from '../world/trainLight';
import { JobMarker, TileView } from '../world/ZoneViews';
import { buildEndCard } from './endcard';
import { adReady, onViewable, openStore } from './network';

/** The game's icons are drawn from their top-left corner; the ad places them by their centre. */
function drawIcon(ctx: CanvasRenderingContext2D, icon: IconName, cx: number, cy: number, size: number): void {
  drawIconAt(ctx, icon, cx - size / 2, cy - size / 2, size);
}

// ================================================================ tuning: every number of the ad in one place
const TUNE = {
  /** Camera (as in the approved build): distance factor and easing. */
  zoom: 0.74,
  /** The camera eases in a little while walking and back out when standing or working (like My Perfect Hotel). */
  zoomWalk: 0.9,
  follow: 7,
  /** Walking speed (m/s), and what each upgrade adds. */
  speed: 5.6,
  speedUp: 1.03,
  guestSpeed: 3.2,
  /** One bill is $10. */
  bill: 10,
  /** Travellers queueing at the desk at the start (more than the rooms: the rest wait for rooms you buy). */
  travellers: 7,
  /** Bills paid: the fare at check-in; a delivery to a Basic and to a Comfort room; a café order; a theatre ticket. */
  fare: 1,
  deliver: { basic: 2, comfort: 3 },
  cafe: 3,
  ticket: 2,
  /** Serving again within this many seconds builds a combo; from x3 each serve adds a bonus bill. */
  comboWindow: 9,
  /** What the Attendant's deliveries leave on the desk (she earns the same as you; you collect it). */
  attendantPays: true,
  /** Upgrade prices, in order. Each is a few rounds of deliveries away, never a long grind. */
  price: { room1: 60, room2: 100, room3: 140, comfort: 260, attendant: 200, cafe: 300, linen: 280, theatre: 380 },
  /** The next upgrade shown at the end (the end card comes once you can afford it). */
  diningCar: 300,
  /** Seconds a job takes. */
  checkIn: 0.45,
  pickUp: 0.4,
  projector: 0.9,
  /** Reaches (m). */
  deskReach: 1.25,
  pickReach: 1.15,
  serveReach: 1.6,
  scoopReach: 1.25,
  tileReach: 0.9,
  roomReach: 1.5,
  /** Most things carried at once. */
  carry: 4,
  /** A guest waiting this long for what they asked for is cross (😠). */
  patience: 18,
  /** Seconds between new requests (when fewer than the cap are open), and a guest's rest after being served. */
  askGap: [3, 6] as [number, number],
  rest: 10,
  /** Chance a request is a visit to the café or the theatre once they are open. */
  visit: 0.35,
  /** The train's speed (m/s; slow enough that the sleepers never strobe). */
  ride: 7,
  /** Seconds between bills draining into an upgrade. */
  drain: 0.04,
  /** Seconds without a touch before the hand shows, and before the end card shows anyway. */
  hesitate: 2.2,
  idleEnd: 15,
  /** The film's length. */
  film: 7,
  /** The Attendant: walking speed and how long she takes at the urn. */
  attendantSpeed: 2.6,
  attendantPick: 1.2,
};
const NIGHT_TIME = 0.82;
const CAFE_TIER = 2;
const CINEMA_TIER = 2;
const TIER = { basic: 1, comfort: 2 } as const;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));

// ================================================================ the scene
VISUALS.camera.followSharpness = TUNE.follow;
VISUALS.camera.lookAhead = 0;
VISUALS.camera.lakeBias = 0;
// No shadow maps (soft blob shadows under everyone instead: steady, never popping in). Phones keep the game's lite
// shading; tablets and desktops get its full shading, bloom on the lamps and the lake's real reflections.
const desktop = !isAndroid() && !/iPhone|iPod/i.test(navigator.userAgent) && Math.min(screen.width, screen.height) >= 700;
for (const [name, tier] of Object.entries(VISUALS.quality.tiers)) {
  tier.shadows = 'off';
  tier.msaa = 0;
  tier.ssao = false;
  if (name !== 'high') {
    tier.bloom = 0;
    tier.reflections = 0;
  }
}
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = new Stage(canvas, desktop ? 'high' : 'medium', null);
stage.lighting.setTime(NIGHT_TIME);
const scene = stage.scene;
const batch = new CharacterBatch(SHADOW_GEOMETRY);
CharacterView.batch = batch;
scene.add(batch.group);
const livery = liveryFor(3);
setLivery(livery.body, livery.trim);
const scenery = new Scenery();
scene.add(scenery.group);
const reflections = scenery.setReflections(stage.settings.reflections);
stage.setPreRender(reflections);
// The lakeside's life (from the game): lantern boats and swans on the water, fireflies over the reeds.
const ambient = new Ambient();
scene.add(ambient.group);
const fireflies = new Fireflies();
scene.add(fireflies.points);
const loco = new LocomotiveView();
loco.setName('The Night Owl');
scene.add(loco.group);
const particles = new Particles(600);
scene.add(particles.points);
stage.attachParticles(particles);
const cash = new CashView();
scene.add(cash.mesh);
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
  cafe: buildView('cafe', SLOT.cafe, CAFE_TIER),
  cinema: buildView('cinema', SLOT.cinema, CINEMA_TIER),
};
views.lobby.group.visible = true;
views.sleeper.group.visible = true;

interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [
  { type: 'lobby', tier: TIER.basic, view: views.lobby },
  { type: 'sleeper', tier: TIER.basic, view: views.sleeper },
];
const map = new TrainMap(0.26);
/** Rooms not bought yet, per carriage: shut and covered, their doorways walled off. */
const locked = new Map<number, Set<number>>([
  [SLOT.lobby, new Set([2])],
  [SLOT.sleeper, new Set([2, 3, 4, 5])],
]);
map.lockedRooms = (i) => new Set([...(locked.get(i) ?? [])].map((c) => `cabin:${c}`));
const trainRear = (): number => carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH;
function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  scenery.setSpan(trainRear());
  ambient.setSpan(trainRear());
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
function straight(a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 1; i <= n; i++) if (!map.walk.isWalkable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
  return true;
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
  // Cut the corner: start from the furthest point of the route already in plain view.
  for (let k = pts.length - 1; k > 0; k--) if (straight(from, pts[k])) return pts.slice(k);
  return pts;
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
drawIcon((ui.querySelector('.ad-cash canvas') as HTMLCanvasElement).getContext('2d')!, 'cash', 48, 48, 88);
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
/** The goal line under the money: one short instruction with its icon. */
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
  drawIcon(goalIcon, icon, 48, 48, 72);
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
/** A class upgrade's card, like the game's: the class colour, its stars, and what it is worth. */
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
  drawIcon(ctx, 'bed', 80, 82, 92);
  (classBox.querySelector('b') as HTMLElement).textContent = `${cls.name.toUpperCase()} CLASS`;
  (classBox.querySelector('.ad-stars') as HTMLElement).textContent = '★'.repeat(stars);
  (classBox.querySelector('i') as HTMLElement).textContent = 'Bigger cabins · tips ×2';
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
function floatText(text: string, x: number, y: number, z: number, style = ''): void {
  tmpV.set(x, y, z);
  if (!stage.project(tmpV, proj)) return;
  floatStack = clock - floatAt < 0.5 ? floatStack + 1 : 0;
  floatAt = clock;
  const el = document.createElement('div');
  el.className = style ? `ad-float ${style}` : 'ad-float';
  el.textContent = text;
  el.style.left = `${proj.x}px`;
  el.style.top = `${proj.y - floatStack * 34}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), style === 'praise' ? 1500 : 1200);
}

// ================================================================ thought bubbles: a face and what they want, centred over the head
type Mood = 'wait' | 'angry' | 'love' | 'none';
const EMOJI: Record<Exclude<Mood, 'none'>, string> = { wait: '🙂', angry: '😠', love: '😍' };
const ITEM_ICON: Record<string, IconName> = {
  tea: 'tea', blanket: 'blanket', towel: 'towel', luggage: 'luggage', latte: 'latte', pastry: 'pastry', popcorn: 'popcorn', room: 'bed',
};
const ITEM_WORD: Record<string, string> = {
  tea: 'tea', blanket: 'a blanket', towel: 'a towel', luggage: 'their bag', latte: 'a latte', pastry: 'a croissant', popcorn: 'popcorn',
};
const SOURCE_WORD: Record<string, string> = {
  tea: 'from the tea urn', blanket: 'from the linen cupboard', towel: 'from the linen cupboard', luggage: 'from the luggage rack', latte: 'at the coffee machine', pastry: 'at the cake stand', popcorn: 'at the popcorn stand',
};
const bubbleTextures = new Map<string, THREE.CanvasTexture>();
/**
 * A rounded bubble with a little tail at the bottom middle, its contents centred: the face, and what they want beside
 * it. The sprite's tail tip sits just over the head. Square power-of-two canvas, premultiplied: no dark box on any GPU.
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
const BUBBLE_TIP = 34 / 256 - 26 / 256;
class Bubble {
  readonly sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
  private key = '';
  private pop = 1;
  private t = Math.random() * 6;
  constructor(private readonly size = 0.95) {
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
interface Room { car: number; cabin: number; guest: Guest | null }
let rooms: Room[] = [];
const isComfort = (r: Room): boolean => train[r.car].tier >= TIER.comfort;
const cabinOf = (r: Room): CabinLayout => train[r.car].view.layout.cabins[r.cabin];
const roomZ = (r: Room): number => carriageOriginZ(r.car);
const sitSpot = (r: Room) => ({ x: cabinOf(r).bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: cabinOf(r).bedPose.z + roomZ(r), facing: -Math.PI / 2 });
const lieSpot = (r: Room) => ({ x: cabinOf(r).bedPose.x, y: FLOOR_Y + BED_TOP, z: cabinOf(r).bedPose.z + roomZ(r), facing: 0 });
const roomCentre = (r: Room): Vec2 => walkableNear(cabinOf(r).center.x, cabinOf(r).center.z + roomZ(r));
function makeRooms(car: number): Room[] {
  return train[car].view.layout.cabins.map((_c, i) => ({ car, cabin: i, guest: null }));
}
rooms = [...makeRooms(SLOT.lobby), ...makeRooms(SLOT.sleeper)];
const roomOpen = (r: Room): boolean => !locked.get(r.car)?.has(r.cabin);
/** The nearest open room nobody has (lobby first, then the sleepers in order). */
const freeRoom = (): Room | null => rooms.find((r) => roomOpen(r) && !r.guest) ?? null;

// ================================================================ guests
type Pose = 'stand' | 'sit' | 'sleep';
type GuestState = 'queue' | 'toRoom' | 'room' | 'toVenue' | 'venue' | 'back';
const RADIUS = 0.3;
let lookSeq = 0;
function guestLook(): CharacterLook {
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[(lookSeq++ * 5) % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
interface Order { item: ItemKind; since: number; bills: number; claimed: boolean }
/** An idle conductor in a walking guest's way steps aside (sideways to the guest's path, onto open floor). */
function yieldTo(g: { x: number; z: number }, dirX: number, dirZ: number, dt: number): void {
  if (me.speed > 0.4 || pointerId >= 0 || autoWalk) return;
  const px = -dirZ;
  const pz = dirX;
  const side = (me.x - g.x) * px + (me.z - g.z) * pz >= 0 ? 1 : -1;
  const step = 1.6 * dt;
  for (const s of [side, -side]) {
    const nx = me.x + px * s * step;
    const nz = me.z + pz * s * step;
    if (map.walk.isWalkable(nx, nz)) {
      me.x = nx;
      me.z = nz;
      return;
    }
  }
}
class Walker {
  readonly view: CharacterView;
  readonly bubble = new Bubble();
  x: number;
  z: number;
  y = FLOOR_Y;
  facing = -Math.PI / 2;
  speed = 0;
  walkSpeed = TUNE.guestSpeed;
  pose: Pose = 'stand';
  path: Vec2[] = [];
  onArrive: (() => void) | null = null;
  blockedFor = 0;
  constructor(look: CharacterLook, x: number, z: number) {
    this.view = new CharacterView(look, 1.04);
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
    if (this.path.length === 0) {
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
    }
  }
  setPose(pose: Pose, at: { x: number; y: number; z: number; facing: number }, blanket?: string): void {
    this.pose = pose;
    this.view.setPose(pose, blanket);
    this.x = at.x;
    this.y = at.y;
    this.z = at.z;
    this.facing = at.facing;
  }
  move(dt: number): void {
    if (this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = this.walkSpeed * dt;
      const nx = this.x + (dx / (d || 1)) * Math.min(step, d);
      const nz = this.z + (dz / (d || 1)) * Math.min(step, d);
      const dNext = Math.hypot(nx - me.x, nz - me.z);
      const blocked = dNext < RADIUS * 2 && dNext < Math.hypot(this.x - me.x, this.z - me.z);
      // Never through the conductor: they wait (an idle conductor is eased aside); only in a dead end do they slip past.
      if (blocked) yieldTo(this, dx / (d || 1), dz / (d || 1), dt);
      if (blocked && this.blockedFor < 2.5) {
        this.blockedFor += dt;
        this.speed = 0;
      } else {
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
        this.speed = this.walkSpeed;
      }
    } else this.speed = 0;
    this.view.setPosition(this.x, this.y, this.z);
    this.view.setFacing(this.facing);
    this.view.update(dt, this.speed);
  }
}
class Guest extends Walker {
  state: GuestState = 'queue';
  room: Room | null = null;
  seat: { venue: 'cafe' | 'cinema'; seat: VenueSeatLayout } | null = null;
  order: Order | null = null;
  waitingFor: string | null = null;
  happyUntil = -1;
  restSince = -99;
  asked = 0;
  /** Their bag is asked for once only. */
  bagged = false;
  queueSlot = -1;
  update(dt: number): void {
    this.move(dt);
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
/** Where travellers stand: the desk's queue first, then the open lobby floor (a tidy group, everyone facing the desk). */
const WAITING: Vec2[] = (() => {
  const spots: Vec2[] = QUEUE.map((q) => ({ x: q.x, z: q.z }));
  for (let z = 4.7; z <= 7.4 && spots.length < TUNE.travellers + 2; z += 0.75) {
    for (let x = -0.3; x <= 1.2 && spots.length < TUNE.travellers + 2; x += 0.72) {
      if (map.walk.isWalkable(x, z) && spots.every((s) => Math.hypot(s.x - x, s.z - z) > 0.6)) spots.push({ x, z });
    }
  }
  return spots;
})();
for (let i = 0; i < TUNE.travellers; i++) {
  const spot = WAITING[Math.min(i, WAITING.length - 1)];
  const g = new Guest(guestLook(), spot.x, spot.z);
  g.queueSlot = i;
  guests.push(g);
  queue.push(g);
}
function layoutQueue(): void {
  queue.forEach((g, i) => {
    if (g.queueSlot === i) return;
    g.queueSlot = i;
    const spot = WAITING[Math.min(i, WAITING.length - 1)];
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
  cash.flyToPile('desk', new THREE.Vector3(g.x, FLOOR_Y + 1.1, g.z), TUNE.fare);
  later(0.25, () => sfx('cash'));
  later(0.3, () => goToRoom(g));
}
function goToRoom(g: Guest): void {
  const room = g.room!;
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
    sfx('door');
  });
}
const keyTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  drawIcon(c.getContext('2d')!, 'key', 64, 64, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const keys: { s: THREE.Sprite; g: Guest; t: number }[] = [];
function keyPop(g: Guest): void {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: keyTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  s.renderOrder = 22;
  scene.add(s);
  keys.push({ s, g, t: 0 });
}
function updateKeys(dt: number): void {
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    k.t += dt / 0.9;
    if (k.t >= 1) {
      scene.remove(k.s);
      k.s.material.dispose();
      keys.splice(i, 1);
      continue;
    }
    const sc = 0.55 * (k.t < 0.25 ? (k.t / 0.25) * 1.2 : 1);
    k.s.scale.set(sc, sc, 1);
    k.s.position.set(k.g.x, FLOOR_Y + 2.2 + k.t * 0.5, k.g.z);
    k.s.material.opacity = k.t > 0.7 ? (1 - k.t) / 0.3 : 1;
  }
}

/** What a resting guest asks for: their bag once, then tea or something warm (a towel in Comfort). */
function nextWish(g: Guest): ItemKind {
  if (!g.bagged && Math.random() < 0.4) return 'luggage';
  const comfort = g.room ? isComfort(g.room) : false;
  return Math.random() < 0.5 ? 'tea' : comfort ? 'towel' : 'blanket';
}
function ask(g: Guest, item: ItemKind, bills: number): void {
  g.order = { item, since: clock, bills, claimed: false };
  g.asked++;
  if (item === 'luggage') g.bagged = true;
  if (g.pose === 'sleep' && g.room) g.setPose('sit', sitSpot(g.room));
  g.view.act('wave', 0.8);
  sfx('bloop');
}
const roomBills = (g: Guest): number => TUNE.deliver[g.room && isComfort(g.room) ? 'comfort' : 'basic'];
const resting = (g: Guest): boolean => g.state === 'room' && !g.order && !g.walking;

// ================================================================ the director: one mechanic at a time, then a steady, capped flow of requests
/** 0 check in · 1 collect the fares · 2 tea · 3 blanket · 4 bag · 5 the first upgrade · 6 play. */
let lesson = 0;
let askTimer = 2;
/** A mechanic being taught right now (the guide stays on until it is done). */
let teaching: 'cafe' | 'film' | null = null;
let roomsBought = 0;
let comfortBought = false;
const helperItems: ItemKind[] = [];
function maxOrders(): number {
  if (lesson < 6) return 1;
  return 1 + (roomsBought >= 2 ? 1 : 0) + (comfortBought ? 1 : 0) + (helperItems.length > 0 ? 1 : 0);
}
function openOrders(): number {
  const waitingFilm = guests.some((g) => g.seat?.venue === 'cinema') && filmT < 0 ? 1 : 0;
  return guests.filter((g) => g.order || g.state === 'toVenue').length + waitingFilm;
}
/** The guest a lesson asks: the nearest to the desk, resting in their room. */
function lessonGuest(): Guest | null {
  return guests.filter(resting).sort((a, b) => a.z - b.z)[0] ?? null;
}
function director(dt: number): void {
  if (lesson === 0 && !freeRoom() && guests.every((g) => g.state !== 'toRoom')) next();
  else if (lesson === 1 && cash.pileCount('desk') === 0 && !deskTaking && money > 0) next();
  else if (lesson >= 2 && lesson <= 4 && openOrders() === 0) {
    const g = lessonGuest();
    if (g) ask(g, (['tea', 'blanket', 'luggage'] as ItemKind[])[lesson - 2], roomBills(g));
  }
  if (lesson < 6) return;
  // A new venue is taught at once: its first visitor (or audience) goes straight there.
  if (teaching === 'cafe' && !guests.some((g) => g.seat?.venue === 'cafe')) {
    const g = guests.filter(resting)[0];
    if (g) tryOuting(g, 'cafe');
    return;
  }
  if (teaching === 'film' && guests.filter((g) => g.seat?.venue === 'cinema').length < 3) {
    const g = guests.filter(resting)[0];
    if (g) tryOuting(g, 'cinema');
    return;
  }
  askTimer -= dt;
  if (askTimer > 0 || openOrders() >= maxOrders()) return;
  const pool = guests.filter((g) => resting(g) && clock - g.restSince > TUNE.rest);
  if (pool.length === 0) return;
  const g = pool.sort((a, b) => a.restSince - b.restSince)[Math.floor(Math.random() * Math.min(2, pool.length))];
  askTimer = TUNE.askGap[0] + Math.random() * (TUNE.askGap[1] - TUNE.askGap[0]);
  const venues: ('cafe' | 'cinema')[] = [];
  if (train.length > SLOT.cafe) venues.push('cafe');
  if (train.length > SLOT.cinema && filmT < 0) venues.push('cinema');
  if (venues.length && Math.random() < TUNE.visit && tryOuting(g, venues[Math.floor(Math.random() * venues.length)])) return;
  const item = nextWish(g);
  ask(g, item, roomBills(g));
}
/** A lesson done: praise, then the next one after a breath. */
function next(): void {
  lesson++;
  if (lesson > 1) praise();
  if (lesson === 5) later(0.6, () => nextUpgrade());
}
/** Called when a guest is served (by anyone): advances the lessons. */
function onServed(item: ItemKind): void {
  if (lesson >= 2 && lesson <= 4 && item === (['tea', 'blanket', 'luggage'] as ItemKind[])[lesson - 2]) next();
  if (teaching === 'cafe' && (item === 'latte' || item === 'pastry')) {
    teaching = null;
    praise();
  }
}

// ================================================================ the café and the theatre: guests visit
let filmT = -1;
function tryOuting(g: Guest, venue: 'cafe' | 'cinema'): boolean {
  if (venue === 'cinema' && filmT >= 0) return false;
  const view = venue === 'cafe' ? views.cafe : views.cinema;
  const slot = venue === 'cafe' ? SLOT.cafe : SLOT.cinema;
  const z0 = carriageOriginZ(slot);
  const taken = new Set(guests.filter((x) => x.seat?.venue === venue).map((x) => x.seat!.seat));
  const seats = view.layout.venue!.seats.filter((s, i) => !taken.has(s) && (venue === 'cinema' || i % 2 === 0));
  if (seats.length === 0) return false;
  const seat = seats[0];
  g.seat = { venue, seat };
  g.state = 'toVenue';
  const sitAt = { x: seat.sit.x, y: FLOOR_Y + seat.top - 0.24, z: seat.sit.z + z0, facing: seat.facing };
  const near = walkableNear(seat.serve ? seat.serve.x : seat.sit.x, seat.sit.z + z0);
  g.walkTo(route({ x: g.x, z: g.z }, near, map.nodeId(slot, seat.node)), () => {
    g.setPose('sit', sitAt);
    g.state = 'venue';
    if (venue === 'cafe') ask(g, Math.random() < 0.6 ? 'latte' : 'pastry', TUNE.cafe);
    else if (teaching !== 'film' && Math.random() < 0.4) later(1.2, () => g.state === 'venue' && !g.order && filmT < 0 && ask(g, 'popcorn', TUNE.cafe));
  });
  return true;
}
function goBack(g: Guest): void {
  if (!g.room) return;
  g.seat = null;
  g.state = 'back';
  const room = g.room;
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
    g.restSince = clock;
  });
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
const L = views.lobby.layout.anchors;
const SPAWN = walkableNear(L.deskService.x + 0.2, L.deskService.z + 0.9);
const me = { x: SPAWN.x, z: SPAWN.z, facing: Math.PI, speed: 0, vx: 0, vz: 0 };
let speedNow = TUNE.speed;
const carried: { item: ItemKind; mesh: THREE.Mesh }[] = [];
const flying: { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
const popping: { obj: THREE.Object3D; t: number; base: number }[] = [];
const tmpTo = new THREE.Vector3();
function pickUp(item: ItemKind, count: number): void {
  for (let i = 0; i < count; i++) {
    const mesh = createItemMesh(item);
    mesh.scale.setScalar(0.01);
    scene.add(mesh);
    carried.push({ item, mesh });
    popping.push({ obj: mesh, t: -i * 0.1, base: 1.15 });
  }
  player.setCarrying(true);
  sfx('pickup');
}
/** Hands what a guest asked for over (the conductor's or the Attendant's), and the guest pays. */
function handOver(g: Guest, mesh: THREE.Object3D, toDesk: boolean): void {
  const order = g.order!;
  g.order = null;
  flying.push({
    mesh, from: mesh.position.clone(), to: () => tmpTo.set(g.x, g.y + (g.pose === 'stand' ? 1.05 : 0.9), g.z), t: 0, dur: 0.28,
    done: () => {
      scene.remove(mesh);
      g.happyUntil = clock + 2.4;
      g.view.act(['tea', 'latte'].includes(order.item) ? 'sip' : 'hug', 2);
      g.view.bounce(1);
      sfx('heart');
      particles.emit('heart', g.x, g.y + 1.6, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 10, 0.3);
      floatText(REACTION[order.item] ?? '😍', g.x, g.y + (g.pose === 'stand' ? 2.3 : 1.9), g.z, 'emo');
      if (toDesk) {
        // The Attendant's earnings wait on the desk for the conductor to collect.
        floatText(`+$${order.bills * TUNE.bill}`, g.x, g.y + 2, g.z);
        cash.flyToPile('desk', new THREE.Vector3(g.x, g.y + 1.1, g.z), order.bills);
      } else {
        // Serving one after another builds a combo; from x3 each serve pays a bonus bill.
        combo = clock - lastServe < TUNE.comboWindow ? combo + 1 : 1;
        lastServe = clock;
        const bonus = combo >= 3 ? 1 : 0;
        pay(order.bills + bonus, g.x, g.y + 1.1, g.z);
        if (combo >= 2) {
          later(0.25, () => floatText(`COMBO x${combo}!`, me.x, FLOOR_Y + 2.6, me.z, 'combo'));
          sfx('chime', 1 + Math.min(6, combo) * 0.06);
        }
      }
      served++;
      g.restSince = clock;
      onServed(order.item);
      if (g.state === 'room' && g.room) later(2.2, () => !g.order && g.state === 'room' && g.room && g.setPose('sleep', lieSpot(g.room), train[g.room.car].view.blanketColor));
      else if (g.state === 'venue' && g.seat?.venue === 'cafe') later(3.5, () => g.state === 'venue' && goBack(g));
    },
  });
}
function serve(g: Guest): void {
  const i = carried.findIndex((c) => c.item === g.order!.item);
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  handOver(g, mesh, false);
  sfx('drop');
}
let served = 0;
let combo = 0;
let lastServe = -99;
const REACTION: Partial<Record<ItemKind, string>> = { tea: '😊', blanket: '🥰', towel: '😌', luggage: '🤩', latte: '😋', pastry: '😋', popcorn: '🍿' };
const PRAISE = ['NICE!', 'GREAT!', 'AWESOME!', 'PERFECT!'];
let praiseN = 0;
/** A lesson done: a word of praise over the conductor, a sparkle and a chime. */
function praise(): void {
  floatText(PRAISE[praiseN++ % PRAISE.length], me.x, FLOOR_Y + 2.7, me.z, 'praise');
  particles.emit('star', me.x, FLOOR_Y + 1.6, me.z, 10, 0.35);
  particles.emit('sparkle', me.x, FLOOR_Y + 1.2, me.z, 14, 0.4);
  sfx('sparkle');
}

// ================================================================ cash: the desk's pile, the bills on the back
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
cash.createPile('desk', L.deskCash.x, FLOOR_Y + 0.62, L.deskCash.z);
const DESK_PILE = walkableNear(L.deskCash.x - 0.2, L.deskCash.z + 0.3);
let deskTaking = false;

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
  // Tall stacks are drawn up to a neat cap (the counter shows the real amount).
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

// ================================================================ stations: the desk, the urns, the linen cupboards, the rack, the café, the projector
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
const URN: ItemKind[] = ['tea'];
const LINEN: ItemKind[] = ['blanket', 'towel'];
const desk = addStation('desk', [], SLOT.lobby, L.deskService, 'key', { x: -1.17, z: 3.4 });
addStation('source', URN, SLOT.lobby, L.urn, 'tea');
addStation('source', LINEN, SLOT.lobby, L.linen, 'blanket');
addStation('source', ['luggage'], SLOT.lobby, L.rack, 'luggage');
const S1 = views.sleeper.layout.anchors;
addStation('source', URN, SLOT.sleeper, S1.urn, 'tea');
addStation('source', LINEN, SLOT.sleeper, S1.linen, 'blanket');
let projector: Station | null = null;

// ================================================================ the Attendant: hired, she serves tea by herself
const ATTENDANT_HOME = (): Vec2 => walkableNear(S1.urn.x + 0.6, S1.urn.z + carriageOriginZ(SLOT.sleeper) + 1.2);
interface Helper { w: Walker; task: Guest | null; item: ItemKind; carrying: THREE.Mesh | null; phase: 'idle' | 'toUrn' | 'pick' | 'toGuest'; t: number }
let helper: Helper | null = null;
function hireAttendant(): void {
  const home = ATTENDANT_HOME();
  const w = new Walker(STAFF_LOOKS.attendant, home.x, home.z);
  w.walkSpeed = TUNE.attendantSpeed;
  helper = { w, task: null, item: 'tea', carrying: null, phase: 'idle', t: 0 };
  helperItems.push('tea');
  particles.emit('confetti', home.x, FLOOR_Y + 1.5, home.z, 30, 0.6);
  showBanner('ATTENDANT HIRED!', 'She serves tea · collect her cash at the desk');
  sfx('staff');
}
function trainAttendant(): void {
  helperItems.push('blanket', 'towel');
  if (helper) particles.emit('confetti', helper.w.x, FLOOR_Y + 1.5, helper.w.z, 30, 0.6);
  showBanner('ATTENDANT UPGRADED!', 'Blankets & towels too');
  sfx('staff');
}
function updateHelper(dt: number): void {
  const h = helper;
  if (!h) return;
  h.w.move(dt);
  if (h.phase === 'idle') {
    // The oldest of her kind of request that nobody is bringing.
    const g = guests.filter((x) => x.order && helperItems.includes(x.order.item) && !x.order.claimed && !x.walking && x.state === 'room' && needed(x.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since)[0];
    if (!g) {
      if (!h.w.walking) {
        const home = ATTENDANT_HOME();
        if (Math.hypot(h.w.x - home.x, h.w.z - home.z) > 0.5) h.w.walkTo(route(h.w, home));
      }
      return;
    }
    g.order!.claimed = true;
    h.task = g;
    const item = g.order!.item;
    h.item = item;
    const urn = nearestStation(item, g);
    if (!urn) return;
    h.phase = 'toUrn';
    h.w.walkTo(route(h.w, urn), () => {
      h.phase = 'pick';
      h.t = TUNE.attendantPick;
    });
  } else if (h.phase === 'pick') {
    h.t -= dt;
    h.w.view.setCarrying(true);
    if (h.t <= 0) {
      const g = h.task;
      if (!g || !g.order || g.order.item !== h.item) {
        h.phase = 'idle';
        h.w.view.setCarrying(false);
        return;
      }
      const mesh = createItemMesh(h.item);
      scene.add(mesh);
      h.carrying = mesh;
      h.phase = 'toGuest';
      h.w.walkTo(route(h.w, approach(g)), () => {
        if (g.order && g.order.item === h.item && h.carrying) handOver(g, h.carrying, true);
        else if (h.carrying) scene.remove(h.carrying);
        h.carrying = null;
        h.task = null;
        h.phase = 'idle';
        h.w.view.setCarrying(false);
      });
    }
  }
  if (h.carrying) h.carrying.position.set(h.w.x + Math.sin(h.w.facing) * 0.35, FLOOR_Y + 0.85, h.w.z + Math.cos(h.w.facing) * 0.35);
}

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

// ================================================================ the upgrades, one at a time
let guided = true;
const sz = carriageOriginZ(SLOT.sleeper);
interface Upgrade { at: Vec2; icon: IconName; name: string; price: number; buy: () => void }
const PLAN: Upgrade[] = [
  { at: { x: -1.3, z: 15.1 }, icon: 'bed', name: 'New Room', price: TUNE.price.room1, buy: () => openRoom(SLOT.lobby, 2) },
  { at: { x: -1.3, z: sz + 8.1 }, icon: 'bed', name: 'New Room', price: TUNE.price.room2, buy: () => openRoom(SLOT.sleeper, 2) },
  { at: { x: -1.3, z: sz + 10.5 }, icon: 'bed', name: 'New Room', price: TUNE.price.room3, buy: () => openRoom(SLOT.sleeper, 3) },
  { at: { x: -1.5, z: sz + 13.4 }, icon: 'star', name: 'Comfort Class', price: TUNE.price.comfort, buy: refitComfort },
  { at: { x: -1.5, z: sz + 2.4 }, icon: 'person', name: 'Attendant', price: TUNE.price.attendant, buy: hireAttendant },
  { at: { x: -0.2, z: sz + 17.2 }, icon: 'latte', name: 'Café Car', price: TUNE.price.cafe, buy: buyCafe },
  { at: { x: -1.5, z: sz + 4.2 }, icon: 'blanket', name: 'Attendant+', price: TUNE.price.linen, buy: trainAttendant },
  { at: { x: 0, z: carriageOriginZ(SLOT.cafe) + 16.4 }, icon: 'film', name: 'Theatre Car', price: TUNE.price.theatre, buy: buyTheatre },
];
let planIndex = 0;
/** The next upgrade waits, unseen, until the player has the money for it (carried or on the desk). */
let pending: Upgrade | null = null;
function nextUpgrade(): void {
  const next = PLAN[planIndex++];
  if (next) pending = next;
  else later(1.0, () => (finalGoal = true));
}
function revealUpgrade(): void {
  const next = pending;
  if (!next || tile || rolling.length || wipes.length) return;
  if (money + cash.pileCount('desk') * TUNE.bill < next.price) return;
  pending = null;
  showTile(next.at, next.icon, next.name, next.price, () => {
    if (lesson < 6) lesson = 6;
    next.buy();
    later(1.2, () => nextUpgrade());
  });
  floatText('NEW UPGRADE!', next.at.x, FLOOR_Y + 2.4, next.at.z, 'praise');
}
let finalGoal = false;
function openRoom(car: number, cabin: number): void {
  locked.get(car)?.delete(cabin);
  train[car].view.setCabinLocked(cabin, false);
  rebuildTrain();
  const c = train[car].view.layout.cabins[cabin];
  particles.emit('sparkle', (c.room.x0 + c.room.x1) / 2, FLOOR_Y + 0.6, (c.room.z0 + c.room.z1) / 2 + carriageOriginZ(car), 30, 0.8);
  sfx('reveal');
  showBanner('NEW ROOM!', 'Check in a waiting guest');
  speedNow *= TUNE.speedUp;
  roomsBought++;
  if (lesson === 5) lesson = 6;
}
/** Comfort Class: the game's makeover wipe sweeps down the sleeper; its guests move into the new cabins. */
function refitComfort(): void {
  guided = false;
  comfortBought = true;
  const old = views.sleeper;
  const next = views.sleeperComfort;
  train[SLOT.sleeper] = { type: 'sleeper', tier: TIER.comfort, view: next };
  locked.set(SLOT.sleeper, new Set());
  const oldRooms = rooms.filter((r) => r.car === SLOT.sleeper);
  const fresh = makeRooms(SLOT.sleeper);
  rooms = rooms.filter((r) => r.car !== SLOT.sleeper).concat(fresh);
  for (const g of guests) {
    if (!g.room || !oldRooms.includes(g.room)) continue;
    const r = fresh[g.room.cabin];
    if (!r) continue;
    r.guest = g;
    g.room = r;
    if (g.state === 'room') {
      g.path = [];
      g.setPose('sit', sitSpot(r));
      g.happyUntil = clock + 2.5;
    }
  }
  rebuildTrain();
  makeover(old, next);
  showClassCard(classOfTier(TIER.comfort), 2);
  speedNow *= TUNE.speedUp;
}
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
function buyCafe(): void {
  couple(views.cafe, 'cafe', CAFE_TIER, 'CAFÉ CAR!', 'Guests come for lattes & croissants');
  const v = views.cafe.layout.venue!;
  addStation('source', ['latte'], SLOT.cafe, v.stations[0].pad, 'latte');
  addStation('source', ['pastry'], SLOT.cafe, v.stations[1].pad, 'pastry');
  later(2.4, () => (teaching = 'cafe'));
}
function buyTheatre(): void {
  couple(views.cinema, 'cinema', CINEMA_TIER, 'THEATRE CAR!', 'Start the film: every seat pays');
  const v = views.cinema.layout.venue!;
  addStation('source', ['popcorn'], SLOT.cinema, v.stations[0].pad, 'popcorn');
  projector = addStation('film', [], SLOT.cinema, v.projector!, 'film');
  later(2.4, () => (teaching = 'film'));
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
  if (teaching === 'film') {
    teaching = null;
    later(1, praise);
  }
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
  const front = frontReady();
  for (const s of stations) {
    if (s.car >= train.length) continue;
    let wants = false;
    let item: ItemKind | null = null;
    if (s.kind === 'desk') wants = !!front && !!freeRoom();
    else if (s.kind === 'film') wants = filmT < 0 && guests.filter((g) => g.seat?.venue === 'cinema' && g.state === 'venue').length >= 2;
    else {
      item = s.items.find((it) => guests.some((g) => g.order?.item === it && !g.order.claimed && nearestStation(it, g) === s && needed(it) > 0)) ?? null;
      wants = !!item && carried.length < TUNE.carry;
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
        // A tray for everyone waiting for it here (up to what can be carried).
        else if (item) pickUp(item, Math.min(needed(item), TUNE.carry - carried.length));
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }
  // The front of the queue says why they wait (a bed: no room yet).
  for (const g of queue) g.waitingFor = g === queue[0] && !g.walking && !freeRoom() ? 'room' : null;
  // Deliveries: within reach and in plain sight (or anywhere in their room), never through a wall.
  for (const g of guests) {
    if (!g.order || g.walking || !carried.some((c) => c.item === g.order!.item)) continue;
    const a = approach(g);
    const inRoom = g.room && g.state === 'room' && Math.hypot(me.x - a.x, me.z - a.z) < TUNE.roomReach;
    if (inRoom || (Math.hypot(me.x - g.x, me.z - g.z) < TUNE.serveReach && map.walk.lineClear(me.x, me.z, a.x, a.z))) serve(g);
  }
  // The cash on the desk: scooped as the conductor comes by.
  if (!deskTaking && cash.pileCount('desk') > 0 && Math.hypot(DESK_PILE.x - me.x, DESK_PILE.z - me.z) < TUNE.scoopReach) {
    deskTaking = true;
    floatText(`+$${cash.pileCount('desk') * TUNE.bill}`, DESK_PILE.x, FLOOR_Y + 1.5, DESK_PILE.z);
    cash.vacuum('desk', backTopPos, landBill, () => (deskTaking = false));
  }
  if (filmT >= 0) {
    filmT += dt;
    if (filmT >= TUNE.film) endFilm();
  }
  director(dt);
  revealUpgrade();
  // The end: the next upgrade (the Dining Car) is in reach.
  if (finalGoal && !teaching && money >= TUNE.diningCar && !ended) endGame();
}
/** How many of an item are asked for and not yet in hand (or on the Attendant's way). */
function needed(item: ItemKind): number {
  return guests.filter((g) => g.order?.item === item && !g.order.claimed).length - carried.filter((c) => c.item === item).length;
}
function approach(g: Guest): Vec2 {
  if (g.room && g.state === 'room') return roomCentre(g.room);
  return walkableNear(g.x + (g.x > -0.6 ? -0.8 : 0.8), g.z);
}
/** The station serving a guest: the urn or cupboard of their own carriage (or the nearest one). */
function nearestStation(item: ItemKind, g?: Vec2): Station | null {
  let best: Station | null = null;
  let bestD = 1e9;
  for (const s of stations) {
    if (s.kind !== 'source' || s.car >= train.length || !s.items.includes(item)) continue;
    const d = g ? Math.abs(s.z - g.z) : Math.hypot(s.x - me.x, s.z - me.z);
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
    const g = guests.filter((x) => x.order?.item === c.item && !x.order.claimed && !x.walking).sort((a, b) => Math.hypot(approach(a).x - me.x, approach(a).z - me.z) - Math.hypot(approach(b).x - me.x, approach(b).z - me.z))[0];
    if (g) return { ...approach(g), lift: 2.4, icon: ITEM_ICON[c.item], text: `Bring ${ITEM_WORD[c.item]} to the guest` };
  }
  if (tile && money >= tile.price - tile.paid) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: `Buy the ${tile.name}` };
  if (frontReady() && freeRoom()) return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: queue.length > 1 ? 'Check in the guests' : 'Check in the guest' };
  if (cash.pileCount('desk') > 0 && !deskTaking) return { x: DESK_PILE.x, z: DESK_PILE.z, lift: 1.4, icon: 'cash', text: 'Collect the cash' };
  if (teaching === 'film' && projector && filmT < 0 && projector.marker.visible) return { x: projector.x, z: projector.z, lift: 2.0, icon: 'film', text: 'Start the film' };
  const open = guests.filter((g) => g.order && !g.order.claimed && needed(g.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since);
  if (open[0] && carried.length < TUNE.carry) {
    const item = open[0].order!.item;
    const s = nearestStation(item, open[0]);
    if (s) return { x: s.x, z: s.z, lift: 2.0, icon: ITEM_ICON[item], text: `Get ${ITEM_WORD[item]} ${SOURCE_WORD[item]}` };
  }
  if (projector && filmT < 0 && projector.marker.visible) return { x: projector.x, z: projector.z, lift: 2.0, icon: 'film', text: 'Start the film' };
  if (tile) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: `Serve guests to earn $${tile.price - tile.paid - money}` };
  if (finalGoal) return null;
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

/** Stuck-proofing: pushing but barely moving for a moment, people stop blocking and the move follows the nav route. */
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
      let next = pts[0] ?? t;
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
    const step = me.speed * dt;
    map.walk.move(pos, me.vx * step, me.vz * step, 0.6, 1.3);
    if (clock > ghostUntil) {
      const solid: Walker[] = [...guests, ...(helper ? [helper.w] : [])];
      for (const g of solid) {
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
    stuckFor = mag > 0.5 && moved < step * 0.15 ? stuckFor + dt : 0;
    if (stuckFor > 0.25) {
      ghostUntil = clock + 0.8;
      const ahead = walkableNear(me.x + me.vx * 1.5, me.z + me.vz * 1.5);
      const next = route({ x: me.x, z: me.z }, ahead).find((p) => Math.hypot(p.x - me.x, p.z - me.z) > 0.2);
      if (next) {
        const l = Math.hypot(next.x - me.x, next.z - me.z) || 1;
        map.walk.move(pos, ((next.x - me.x) / l) * step, ((next.z - me.z) / l) * step, 0.6, 1.3);
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
      if (helper && Math.abs(helper.w.z - dz) < 1.3 && Math.abs(helper.w.x - door.x) < 1.2) want = 1;
      if (door.open === want) continue;
      car.view.setRoomDoor(door, want > door.open ? Math.min(1, door.open + dt * 5) : Math.max(0, door.open - dt * 2.5));
    }
  }
}

// ================================================================ the guide: the gold arrow, the hand and the hint line
const arrow = makeSprite(guideArrowTexture(), 0.62);
arrow.material.toneMapped = false;
arrow.renderOrder = 21;
scene.add(arrow);
let arrowShown = 0;
// The trail: gold chevrons on the floor flowing from the conductor along the walking route to the next job.
const TRAIL_MAX = 40;
const TRAIL_STEP = 0.7;
const trailTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 14);
  ctx.lineTo(112, 70);
  ctx.lineTo(86, 70);
  ctx.lineTo(64, 46);
  ctx.lineTo(42, 70);
  ctx.lineTo(16, 70);
  ctx.closePath();
  ctx.moveTo(64, 56);
  ctx.lineTo(112, 112);
  ctx.lineTo(86, 112);
  ctx.lineTo(64, 88);
  ctx.lineTo(42, 112);
  ctx.lineTo(16, 112);
  ctx.closePath();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#5A3A00';
  ctx.stroke();
  ctx.fillStyle = '#FFD23A';
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const trailGeometry = new THREE.PlaneGeometry(0.62, 0.62);
trailGeometry.rotateX(-Math.PI / 2);
const trail = new THREE.InstancedMesh(trailGeometry, new THREE.MeshBasicMaterial({ map: trailTexture, transparent: true, depthWrite: false, toneMapped: false, fog: false }), TRAIL_MAX);
trail.frustumCulled = false;
trail.renderOrder = 6;
trail.count = 0;
scene.add(trail);
let trailPath: Vec2[] = [];
let trailAt = -1;
let trailShown = 0;
let trailKey = '';
function updateTrail(dt: number, t: Target | null): void {
  const far = !!t && Math.hypot(t.x - me.x, t.z - me.z) > 1.3;
  trailShown += ((far ? 1 : 0) - trailShown) * Math.min(1, dt * 6);
  if (trailShown < 0.02 || !t) {
    trail.count = 0;
    return;
  }
  const key = `${t.x.toFixed(1)},${t.z.toFixed(1)}`;
  if (key !== trailKey || clock - trailAt > 0.25) {
    trailKey = key;
    trailAt = clock;
    trailPath = [{ x: me.x, z: me.z }, ...route({ x: me.x, z: me.z }, t)];
  } else trailPath[0] = { x: me.x, z: me.z };
  let total = 0;
  for (let i = 1; i < trailPath.length; i++) total += Math.hypot(trailPath[i].x - trailPath[i - 1].x, trailPath[i].z - trailPath[i - 1].z);
  const start = 0.55;
  const end = total - 0.7;
  let n = 0;
  let seg = 1;
  let segStart = 0;
  for (let d = start + ((clock * 1.3) % TRAIL_STEP); d < end && n < TRAIL_MAX; d += TRAIL_STEP) {
    while (seg < trailPath.length - 1 && segStart + Math.hypot(trailPath[seg].x - trailPath[seg - 1].x, trailPath[seg].z - trailPath[seg - 1].z) < d) {
      segStart += Math.hypot(trailPath[seg].x - trailPath[seg - 1].x, trailPath[seg].z - trailPath[seg - 1].z);
      seg++;
    }
    const a = trailPath[seg - 1];
    const b = trailPath[seg];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const k = Math.min(1, (d - segStart) / len);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const fade = Math.min(1, (d - start) / 0.5, (end - d) / 0.6) * trailShown;
    dummy.position.set(a.x + (b.x - a.x) * k, FLOOR_Y + 0.05, a.z + (b.z - a.z) * k);
    dummy.rotation.set(0, Math.atan2(-dx, -dz), 0);
    dummy.scale.setScalar(Math.max(0.01, fade));
    dummy.updateMatrix();
    trail.setMatrixAt(n++, dummy.matrix);
  }
  trail.count = n;
  trail.instanceMatrix.needsUpdate = true;
}

function updateGuide(dt: number): void {
  const t = target();
  const hesitating = !started || (clock - lastInput > TUNE.hesitate && !autoWalk && pointerId < 0);
  // Until Comfort Class the guide always shows the way; afterwards it comes when the player hesitates.
  const show = !!t && !ended && (guided || !!teaching || hesitating);
  updateTrail(dt, show ? t : null);
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  arrow.visible = arrowShown > 0.02 && !!t;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    arrow.scale.set(0.62 * arrowShown, 0.62 * arrowShown, 1);
  }
  if (ended) setGoal(null, '');
  else if (finalGoal) setGoal('star', `Dining Car: $${Math.min(Math.round(shownMoney), TUNE.diningCar)}/${TUNE.diningCar}`);
  else if (t && (guided || teaching || hesitating)) setGoal(t.icon, t.text);
  else if (pending && !tile) setGoal(pending.icon, `${pending.name}: $${Math.min(Math.round(shownMoney), pending.price)}/${pending.price}`);
  else setGoal(null, '');
  // The hand: at the start, then whenever the player stops (it drags from the conductor toward the goal).
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

// ================================================================ the end card: the next upgrade, which the player can now afford
const endCard = buildEndCard(() => openStore(), TUNE.diningCar);
document.body.appendChild(endCard.el);
let endMoney = -1;
let endIdle = false;
function endGame(): void {
  if (ended) return;
  ended = true;
  hand.classList.remove('on');
  setGoal(null, '');
  endIdle = !(finalGoal && money >= TUNE.diningCar);
  endCard.show(money, endIdle);
  sfx('levelup');
}

// ================================================================ the camera (as in the approved build): centred on the conductor, eased, clamped to the train
function resize(): void {
  stage.resize();
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const aspect = w / Math.max(1, h);
  baseZoom = aspect > 0.9 ? Math.max(TUNE.zoom, 1.27 * aspect) : TUNE.zoom;
}
let baseZoom = TUNE.zoom;
let zoomNow = TUNE.zoom;
/** In a little while walking, back out a little when standing or working; slow enough never to feel like a pump. */
function updateZoom(dt: number): void {
  const want = baseZoom * (me.speed > 1 ? TUNE.zoomWalk : 1);
  zoomNow += (want - zoomNow) * Math.min(1, dt * (want < zoomNow ? 1.1 : 0.8));
  stage.rig.setZoom(zoomNow);
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
let stepFailed = false;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * TEST_SPEED;
  last = now;
  requestAnimationFrame(frame);
  if (paused) return;
  try {
    step(dt);
  } catch (e) {
    // Never freeze the ad on an unexpected error: report it once and keep the frame loop alive.
    if (!stepFailed) console.error('step failed', e);
    stepFailed = true;
  }
}
function step(dt: number): void {
  frameWork.begin(3);
  clock += dt;
  runTimers();
  if (started && !ended) {
    updatePlayer(dt);
    updateJobs(dt);
    updateTile(dt);
    updateHelper(dt);
  } else {
    updatePlayer(0);
    desk.marker.visible = true;
    desk.marker.iconShown = true;
    desk.marker.highlight = true;
    desk.marker.update(dt);
  }
  for (const g of guests) {
    g.update(dt);
  }
  updateKeys(dt);
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
  scenery.update(dt, TUNE.ride);
  ambient.update(dt, TUNE.ride, stage.rig.target, stage.lighting.night, scenery.isHiddenAt);
  fireflies.update(dt, TUNE.ride, stage.lighting.night, stage.renderer.getPixelRatio(), null);
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
  if (classTimer > 0) {
    classTimer -= dt;
    if (classTimer <= 0) classBox.classList.remove('on');
  }
  if (!ended && clock - lastInput > TUNE.idleEnd) endGame();
  if (ended && money !== endMoney) {
    endMoney = money;
    endCard.show(money, endIdle);
  }
  clampCamera();
  updateZoom(dt);
  stage.rig.update(dt, me.x, me.z);
  batch.sync(stage.rig.camera);
  audio.update(dt);
  stage.render(dt);
}

async function boot(): Promise<void> {
  resize();
  zoomNow = baseZoom;
  stage.rig.setZoom(zoomNow);
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
    return {
      clock: Math.round(clock), lesson, teaching, money, target: target(), back: backCount, guided, tile: tile ? `${tile.name} ${tile.paid}/${tile.price}` : null, plan: planIndex,
      guests: guests.length, queue: queue.length, roomed: guests.filter((g) => g.room).length, orders: guests.filter((g) => g.order).map((g) => g.order!.item),
      seats: guests.filter((g) => g.seat).map((g) => `${g.seat!.venue}:${g.state}:${g.walking ? 'w' : ''}`), filmT: +filmT.toFixed(1),
      carried: carried.map((c) => c.item), ended, finalGoal, served, me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) },
      offFloor: [...guests, ...(helper ? [helper.w] : [])].filter((g) => Math.abs(g.x) > INNER + 0.05).map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`),
    };
  },
  route: (ax: number, az: number, bx: number, bz: number) => route({ x: ax, z: az }, { x: bx, z: bz }),
  walkable: (x: number, z: number) => map.walk.isWalkable(x, z),
  move: (x: number, z: number, dx: number, dz: number, a: number) => { const p = { x, z }; map.walk.move(p, dx, dz, a, 1.3); return p; },
  debug: () => ({ clock, started, ended, finalGoal, money, me: { ...me }, autoWalk, pointerId, stuckFor, near: [...guests, ...(helper ? [helper.w] : [])].filter((g) => Math.hypot(g.x - me.x, g.z - me.z) < 1.5).map((g) => [g.x.toFixed(2), g.z.toFixed(2), g.pose, g.walking, g.blockedFor.toFixed(1)]) }),
  node: (x: number, z: number) => map.nearestNode(x, z),
  give: (bills: number) => {
    for (let i = 0; i < bills; i++) landBill();
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
