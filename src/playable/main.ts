// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the platform, the cash, the tiles, the sounds) so it looks exactly like the game, and runs
// its own loop, built up the way the game is: guests board at a station and queue at the desk; you check them in and
// show them to their rooms; they ask for things; you fetch and deliver; every job pays; the money you carry buys the
// next upgrade (a room, a new carriage, the café, the theatre, a class refit), each bringing new work. Nothing earns or
// upgrades by itself. About five minutes; the end card follows the last upgrade's deliveries (or 15 s without a touch).
import * as THREE from 'three';
import { AudioEngine, type Sfx } from '../audio/AudioEngine';
import { ARCHETYPES } from '../config/content';
import { VISUALS } from '../config/visuals';
import { frameWork } from '../core/Background';
import { rect, type CarriageType, type ItemKind, type Vec2 } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon, type IconName } from '../ui/icons';
import { BED_TOP, CarriageView, FLOOR_Y, type RoomDoor } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { CharacterView, CONDUCTOR_LOOK, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, INNER, PLATFORM_X0, type CabinLayout, type CarriageLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { MATERIALS, SHADOW_GEOMETRY, setLivery } from '../world/materials';
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

// ================================================================ tuning: every number of the ad in one place
const TUNE = {
  /** Camera distance factor (the game's framing is 1; a little closer, so people and money read big). */
  zoom: 0.84,
  /** How far the view leans from the conductor toward the next target (0 none, 1 all the way), and its cap (m). */
  lead: 0.32,
  leadMax: 3.2,
  /** Camera easing (the game uses 5; lower is smoother). */
  follow: 3.4,
  /** Walking speed (m/s): it rises with every upgrade, so the pace builds. */
  speed: [5.4, 5.9, 6.4, 6.9, 7.4, 7.9],
  /** Seconds a job takes at the desk, at a pick-up and at the projector; they shorten as the game goes on. */
  checkIn: [0.9, 0.75, 0.6, 0.5, 0.45, 0.4],
  pickUp: 0.45,
  projector: 1.0,
  /** Reaches (m). */
  deskReach: 1.25,
  pickReach: 1.05,
  serveReach: 1.7,
  roomReach: 1.7,
  tileReach: 0.9,
  /** A guest waiting this long for what they asked for is cross (😠). */
  patience: 14,
  /** What each job pays ($), and the size of one bill. */
  bill: 10,
  pay: { checkIn: 20, room: 20, deliver: 30, venue: 40, popcorn: 40, film: 40, suite: 50 },
  /** Upgrade prices (each is a little less than what its stage's jobs pay, so it is earned, never stuck). */
  price: { room: 100, carriage: 160, cafe: 200, theatre: 240, refit: 250 },
  /** Seconds between bills draining into an upgrade. */
  drain: 0.05,
  /** Seconds with no touch before the guide (hand and arrow) shows, and before the end card shows anyway. */
  hesitate: 2.2,
  idleEnd: 15,
  /** The train's speed between stations (m/s; slow enough that the sleepers never strobe). */
  ride: 7,
  /** Seconds for the train to pull away from / draw into a station. */
  depart: 5,
  arriveFrom: 60,
  /** Guests' walking speed (m/s). */
  guestSpeed: 2.7,
  /** Seconds a film runs. */
  film: 7,
  /** Seconds after the final delivery before the end card. */
  endDelay: 2.4,
};
const NIGHT_TIME = 0.82;
const CAFE_TIER = 2;
const CINEMA_TIER = 2;
const REFIT_TIER = 3;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));

// ================================================================ the scene
VISUALS.camera.followSharpness = TUNE.follow;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const stage = new Stage(canvas, 'auto', null);
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
const audio = new AudioEngine();
audio.prepare();

// The café's floor: a soft woven carpet wall to wall instead of its tiles (the ad only; the game is untouched).
{
  const v = getLayout('cafe', CAFE_TIER).venue!;
  v.carpets = [{ rect: rect(-INNER + 0.05, 0.05, INNER - 0.05, 16.3), style: 'persian' }];
}

// Every carriage the ad will show is built now, hidden, so an upgrade is a swap and never a hitch mid-play.
const SLOT = { lobby: 0, sleeper: 1, cafe: 2, cinema: 3 } as const;
const views = {
  lobby: new CarriageView(getLayout('lobby', 0), SLOT.lobby, 0),
  sleeper: new CarriageView(getLayout('sleeper', 0), SLOT.sleeper, 0),
  sleeperRefit: new CarriageView(getLayout('sleeper', REFIT_TIER), SLOT.sleeper, REFIT_TIER),
  cafe: new CarriageView(getLayout('cafe', CAFE_TIER), SLOT.cafe, CAFE_TIER),
  cinema: new CarriageView(getLayout('cinema', CINEMA_TIER), SLOT.cinema, CINEMA_TIER),
};
for (const view of Object.values(views)) {
  view.group.position.z = carriageOriginZ(view.index);
  view.group.visible = view === views.lobby;
  scene.add(view.group);
  const venue = view.layout.venue;
  if (venue) {
    for (const g of venue.groups) view.setVenueGroupOpen(g.index, true);
    view.setVenueExtras(venue.extras.map((e) => e.key));
  }
  if (view.layout.type === 'lobby') {
    view.setRackLevel(1);
    view.setLuggageCount(5);
  }
}
// The lobby's third room is the first thing to buy; the sleeper comes with three of its six beds.
views.lobby.setCabinLocked(2, true);
for (const i of [3, 4, 5]) views.sleeper.setCabinLocked(i, true);

interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [{ type: 'lobby', tier: 0, view: views.lobby }];
const map = new TrainMap(0.3);
const lockedRooms = new Map<number, Set<string>>([[SLOT.lobby, new Set(['cabin:2'])], [SLOT.sleeper, new Set(['cabin:3', 'cabin:4', 'cabin:5'])]]);
map.lockedRooms = (i) => lockedRooms.get(i);
const trainRear = (): number => carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH;

function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  stage.lighting.setTrainSpan(-12, trainRear());
  stage.lighting.invalidateShadows();
}
rebuildTrain();

/** The nearest point the conductor can stand on (tiles and approach points must be on the floor). */
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

// ================================================================ the station (the game opens at a platform)
const platform = new PlatformView();
platform.build(carriageOriginZ(3) + CARRIAGE_LENGTH, null, null);
platform.setStationName('Millbrook');
scene.add(platform.group);
const STATIONS = ['Millbrook', 'Ashby Lake', 'Thistledown'];
type TrainPhase = 'stopped' | 'departing' | 'moving' | 'arriving';
const journey = { phase: 'stopped' as TrainPhase, speed: 0, offset: 0, t: 0, station: 0, onArrive: null as (() => void) | null };
let lampsShown = false;
function updateJourney(dt: number): void {
  const j = journey;
  j.t += dt;
  if (j.phase === 'departing') {
    j.speed = Math.min(TUNE.ride, j.speed + (TUNE.ride / TUNE.depart) * dt);
    j.offset += j.speed * dt;
    if (j.offset > platform.z1 - platform.z0 + 30) {
      j.phase = 'moving';
      j.t = 0;
    }
  } else if (j.phase === 'arriving') {
    // Brake so the platform stops exactly alongside: v = sqrt(2 a d).
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
      const cb = j.onArrive;
      j.onArrive = null;
      cb?.();
    }
  } else if (j.phase === 'moving') {
    j.speed = TUNE.ride;
    if (pendingArrival && j.t > 3) {
      const cb = pendingArrival;
      pendingArrival = null;
      arrive(cb);
    }
  }
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
  // The lobby's door slides open at a stop.
  const want = j.phase === 'stopped' ? 1 : 0;
  doorOpen += (want - doorOpen) * Math.min(1, dt * 4);
  views.lobby.setDoorOpen(Math.round(doorOpen * 50) / 50);
}
let doorOpen = 1;
function depart(): void {
  if (journey.phase !== 'stopped') return;
  journey.phase = 'departing';
  journey.t = 0;
  journey.speed = 0;
  sfx('whistle');
  platform.setFlag(true);
  later(1.4, () => sfx('depart'));
}
/** The next station: if the train is still standing at one, it pulls out first and rides a few seconds. */
let pendingArrival: (() => void) | null = null;
function arrive(then: () => void): void {
  if (journey.phase !== 'moving') {
    pendingArrival = then;
    if (journey.phase === 'stopped') depart();
    return;
  }
  journey.station = (journey.station + 1) % STATIONS.length;
  platform.setStationName(STATIONS[journey.station]);
  platform.setFlag(false);
  journey.phase = 'arriving';
  journey.offset = -TUNE.arriveFrom;
  journey.onArrive = then;
  showBanner(STATIONS[journey.station].toUpperCase(), 'New passengers!');
}

// ================================================================ a tiny scheduler on the ad's own clock (pauses with it)
let clock = 0;
const timers: { at: number; fn: () => void }[] = [];
function later(seconds: number, fn: () => void): void {
  timers.push({ at: clock + seconds, fn });
}
function runTimers(): void {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (timers[i].at <= clock) {
      const t = timers[i];
      timers.splice(i, 1);
      t.fn();
    }
  }
}

// ================================================================ sound
let soundOk = false;
let muted = false;
audio.setVolume(0.7);
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

/** The money counter counts up (and down) smoothly to what is really carried; the text never jumps width. */
let money = 0;
let shownMoney = 0;
let lastShown = -1;
let bumpT = 0;
function updateMoney(dt: number): void {
  const diff = money - shownMoney;
  shownMoney = Math.abs(diff) < 0.5 ? money : shownMoney + diff * Math.min(1, dt * 9);
  const v = Math.round(shownMoney);
  if (v !== lastShown) {
    lastShown = v;
    cashText.textContent = String(v);
  }
  bumpT = Math.max(0, bumpT - dt * 5);
  cashBox.style.setProperty('--bump', (1 + Math.sin(bumpT * Math.PI) * 0.12).toFixed(3));
}
let bannerTimer = 0;
function showBanner(title: string, sub = ''): void {
  banner.innerHTML = `<b>${title}</b>${sub ? `<i>${sub}</i>` : ''}`;
  banner.classList.remove('on');
  void banner.offsetWidth;
  banner.classList.add('on');
  bannerTimer = 2.2;
}
const proj = { x: 0, y: 0 };
const tmpV = new THREE.Vector3();
let floatStack = 0;
let floatAt = -1;
/** A "+$20" floating up from a point in the world; quick ones stack upward instead of on top of each other. */
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

// ================================================================ thought bubbles (emoji), drawn on top of everything
type Mood = 'wait' | 'angry' | 'love' | 'none';
const bubbleTextures = new Map<string, THREE.CanvasTexture>();
const EMOJI: Record<Exclude<Mood, 'none'>, string> = { wait: '🙂', angry: '😠', love: '😍' };
const ITEM_ICON: Partial<Record<ItemKind, IconName>> = {
  tea: 'tea', coffee: 'coffee', champagne: 'champagne', blanket: 'blanket', towel: 'towel', luggage: 'luggage', latte: 'latte', pastry: 'pastry', popcorn: 'popcorn',
};
/**
 * A white thought cloud with a face (and what they want). Power-of-two and premultiplied: an odd-sized canvas with
 * straight alpha drew as a dark box on some phone GPUs and left dark fringes round the cloud on others.
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
    ctx.moveTo(wide ? 76 : 92, 206);
    ctx.arc(wide ? 64 : 80, 206, 13, 0, Math.PI * 2);
    ctx.moveTo(wide ? 50 : 66, 232);
    ctx.arc(wide ? 42 : 58, 232, 8, 0, Math.PI * 2);
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
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
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
    // Drawn after everything else and over it: a bubble never cuts into a wall or a bed.
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  set(mood: Mood, item: ItemKind | null = null): void {
    const key = mood === 'none' ? '' : `${mood}:${item ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.sprite.visible = mood !== 'none';
    if (mood !== 'none') {
      const m = this.sprite.material;
      m.map = bubbleTexture(mood, item);
      m.needsUpdate = true;
    }
    this.pop = 0;
  }
  get mood(): Mood {
    return (this.key.split(':')[0] || 'none') as Mood;
  }
  update(dt: number, x: number, y: number, z: number): void {
    if (!this.sprite.visible) return;
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 4.5);
    const p = this.pop;
    // An elastic pop in, then a gentle bob (and a shake while cross).
    const s = p < 1 ? Math.min(1.25, 1 - Math.cos(p * Math.PI * 2.6) * Math.exp(-p * 4.5)) : 1 + Math.sin(this.t * 3) * 0.025;
    const jitter = this.mood === 'angry' ? Math.sin(this.t * 38) * 0.025 : 0;
    this.sprite.position.set(x + jitter, y + Math.sin(this.t * 2.4) * 0.035, z);
    this.sprite.scale.set(this.size * s, this.size * s, 1);
  }
}

// ================================================================ people
type Pose = 'stand' | 'sleep' | 'sit';
let lookSeq = 0;
function guestLook(): CharacterLook {
  // Every archetype in turn, the ones with a child skipped (the ad keeps people simple).
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[lookSeq++ % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
const PERSON_RADIUS = 0.3;

interface Request { item: ItemKind; since: number; pay: number }
class Person {
  readonly view: CharacterView;
  readonly bubble = new Bubble();
  x: number;
  z: number;
  y = FLOOR_Y;
  facing = 0;
  speed = 0;
  pose: Pose = 'stand';
  path: Vec2[] = [];
  onArrive: (() => void) | null = null;
  walkSpeed = TUNE.guestSpeed;
  blockedFor = 0;
  /** Moved by someone else this frame (an escorted guest walks the conductor's trail). */
  led = false;
  /** What they asked for and when, or null. */
  request: Request | null = null;
  /** Shows 😍 until this time. */
  happyUntil = -1;
  constructor(x: number, z: number, look = guestLook()) {
    this.view = new CharacterView(look, 1.04);
    scene.add(this.view.root);
    this.x = x;
    this.z = z;
    this.view.setPosition(x, FLOOR_Y, z);
  }
  walkTo(points: Vec2[], onArrive: (() => void) | null = null): void {
    this.setPose('stand');
    this.path = points.slice();
    this.onArrive = onArrive;
  }
  get walking(): boolean {
    return this.path.length > 0;
  }
  setPose(pose: Pose, at?: { x: number; y: number; z: number; facing: number }, blanket?: string): void {
    this.pose = pose;
    this.view.setPose(pose, blanket);
    if (at) {
      this.x = at.x;
      this.y = at.y;
      this.z = at.z;
      this.facing = at.facing;
    } else this.y = FLOOR_Y;
  }
  update(dt: number): void {
    if (this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = this.walkSpeed * dt;
      // Never through the conductor: wait a moment for them to pass, then carry on round them.
      const nx = this.x + (dx / (d || 1)) * Math.min(step, d);
      const nz = this.z + (dz / (d || 1)) * Math.min(step, d);
      const near = Math.hypot(nx - me.x, nz - me.z) < PERSON_RADIUS * 2 && Math.hypot(nx - me.x, nz - me.z) < Math.hypot(this.x - me.x, this.z - me.z);
      if (near && this.blockedFor < 0.9) {
        this.blockedFor += dt;
        this.speed = 0;
      } else {
        this.blockedFor = near ? this.blockedFor : 0;
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
    } else if (!this.led) this.speed = 0;
    this.view.setPosition(this.x, this.y, this.z);
    this.view.setFacing(this.facing);
    this.view.update(dt, this.speed);
    const head = this.pose === 'sleep' ? 1.0 : this.pose === 'sit' ? 1.62 : 2.08;
    // Bubbles: 🙂 with what they want, 😠 once they have waited long, 😍 when served.
    if (this.request) {
      const long = clock - this.request.since > TUNE.patience;
      if (long && this.bubble.mood !== 'angry') {
        sfx('grumble');
        this.view.act('stomp', 0.5);
      }
      this.bubble.set(long ? 'angry' : 'wait', this.request.item);
    } else if (clock < this.happyUntil) this.bubble.set('love');
    else this.bubble.set('none');
    this.bubble.update(dt, this.x, this.y + head - (this.pose === 'sleep' ? 0.4 : 0), this.z);
    if (clock < this.happyUntil && Math.random() < dt * 1.5) particles.emit('heart', this.x, this.y + head - 0.2, this.z, 1, 0.15);
  }
}
function turnToward(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}
const people: Person[] = [];

/** A nav-graph route through the train from one point to another (walls respected), ending exactly at `to`. */
function route(from: Vec2, to: Vec2, toNode?: string): Vec2[] {
  const a = map.nearestNode(from.x, from.z);
  const b = toNode ?? map.nearestNode(to.x, to.z);
  const nodes = a && b ? map.pathBetweenNodes(a, b) : null;
  const pts = nodes ? nodes.map((p) => ({ x: p.x, z: p.z })) : [];
  pts.push({ x: to.x, z: to.z });
  return pts;
}

// ================================================================ rooms
interface Room { carriage: number; cabin: CabinLayout; guest: Guest | null; open: boolean }
function roomsOf(carriage: number, layout: CarriageLayout, openCount: number): Room[] {
  return layout.cabins.map((cabin, i) => ({ carriage, cabin, guest: null, open: i < openCount }));
}
let rooms: Room[] = roomsOf(SLOT.lobby, views.lobby.layout, 2);
const roomZ = (r: Room): number => carriageOriginZ(r.carriage);
/** Where a guest sits on the edge of their bed (facing the door), and where they lie. */
const sitSpot = (r: Room) => ({ x: r.cabin.bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: r.cabin.bedPose.z + roomZ(r), facing: -Math.PI / 2 });
const lieSpot = (r: Room) => ({ x: r.cabin.bedPose.x, y: FLOOR_Y + BED_TOP, z: r.cabin.bedPose.z + roomZ(r), facing: 0 });
/** Where the conductor stands to serve the room (its middle) and to show a guest in (the doorway, corridor side). */
const roomCentre = (r: Room): Vec2 => walkableNear(r.cabin.center.x, r.cabin.center.z + roomZ(r));
const roomDoor = (r: Room): Vec2 => walkableNear(-1.25, (r.cabin.door[0] + r.cabin.door[1]) / 2 + roomZ(r));

// ================================================================ guests
type GuestState = 'boarding' | 'queue' | 'follow' | 'entering' | 'room' | 'toSeat' | 'seated';
interface RequestPlan { item: ItemKind; after: number }
class Guest extends Person {
  state: GuestState = 'boarding';
  room: Room | null = null;
  seat: { venue: 'cafe' | 'cinema'; seat: VenueSeatLayout; z0: number } | null = null;
  plan: RequestPlan[] = [];
  queueSlot = -1;
  /** Seconds before their next request (counting only while settled). */
  askIn = 1.6;
  served = 0;
}
const guests: Guest[] = [];
let stageNo = 0;
let deliveriesThisStage = 0;

/** A traveller steps off the station concourse, walks along the platform and in at the lobby's door, then queues. */
function board(plan: RequestPlan[], delay: number, start: Vec2): void {
  later(delay, () => {
    const g = new Guest(start.x, start.z);
    g.plan = plan;
    g.state = 'boarding';
    g.facing = Math.PI;
    guests.push(g);
    people.push(g);
    const door = map.layoutOf(SLOT.lobby).doors[0];
    const pts: Vec2[] = [];
    g.walkSpeed = TUNE.guestSpeed * 1.2;
    pts.push(PLATFORM.concourse[1], PLATFORM.concourse[0],{ x: door.outside.x - 0.4, z: door.outside.z }, { x: door.inside.x, z: door.inside.z });
    g.walkTo(pts, () => {
      g.walkSpeed = TUNE.guestSpeed;
      joinQueue(g);
    });
  });
}
const queue: Guest[] = [];
function queueSpot(i: number): Vec2 {
  const q = views.lobby.layout.queue;
  return q[Math.min(i, q.length - 1)];
}
function joinQueue(g: Guest): void {
  g.state = 'queue';
  queue.push(g);
  layoutQueue();
}
function layoutQueue(): void {
  queue.forEach((g, i) => {
    const spot = queueSpot(i);
    if (g.queueSlot === i) return;
    g.queueSlot = i;
    g.walkTo([spot], () => {
      g.facing = -Math.PI / 2;
    });
  });
}
const frontReady = (): Guest | null => (queue[0] && !queue[0].walking && queue[0].queueSlot === 0 ? queue[0] : null);

let follower: Guest | null = null;
function checkIn(g: Guest): void {
  queue.shift();
  layoutQueue();
  g.queueSlot = -1;
  const room = rooms.find((r) => r.open && !r.guest)!;
  room.guest = g;
  g.room = room;
  g.state = 'follow';
  g.led = true;
  follower = g;
  trail.length = 0;
  sfx('ding');
  g.view.act('wave', 0.6);
  particles.emit('sparkle', g.x, FLOOR_Y + 1.5, g.z, 12, 0.3);
  pay(TUNE.pay.checkIn, g.x, FLOOR_Y + 1.2, g.z);
  roomMarker.setPosition(roomCentre(room).x, roomCentre(room).z);
}
function showIn(g: Guest): void {
  const room = g.room!;
  follower = null;
  g.led = false;
  g.state = 'entering';
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.carriage, room.cabin.node)), () => {
    g.setPose('sit', sit);
    g.state = 'room';
    g.view.act('read', 1.2);
    pay(TUNE.pay.room, g.x, FLOOR_Y + 1.4, g.z);
    sfx('door');
    g.askIn = 1.4;
  });
}
/** The next thing a settled guest asks for (if its stage has come). */
function maybeAsk(g: Guest, dt: number): void {
  if (g.request || g.state !== 'room' && g.state !== 'seated') return;
  const next = g.plan[0];
  if (!next || stageNo < next.after) return;
  g.askIn -= dt;
  if (g.askIn > 0) return;
  g.plan.shift();
  const pay = g.seat ? (next.item === 'popcorn' ? TUNE.pay.popcorn : TUNE.pay.venue) : g.room && g.room.carriage === SLOT.sleeper && train[SLOT.sleeper]?.tier === REFIT_TIER ? TUNE.pay.suite : next.item === 'pastry' ? TUNE.pay.venue : TUNE.pay.deliver;
  g.request = { item: next.item, since: clock, pay };
  if (g.pose === 'sleep' && g.room) g.setPose('sit', sitSpot(g.room));
  sfx('bloop');
  g.view.act('wave', 0.8);
}

// ================================================================ what the conductor carries
const MAX_CARRY = 3;
const carried: { item: ItemKind; mesh: THREE.Mesh }[] = [];
const flying: { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
function pickUp(item: ItemKind): void {
  const mesh = createItemMesh(item);
  mesh.scale.setScalar(1.15);
  scene.add(mesh);
  carried.push({ item, mesh });
  player.setCarrying(true);
  sfx('pickup', 1 + carried.length * 0.08);
  popScale(mesh, 1.15);
}
const popping: { obj: THREE.Object3D; t: number; base: number }[] = [];
function popScale(obj: THREE.Object3D, base = 1): void {
  popping.push({ obj, t: 0, base });
}

function deliver(g: Guest): void {
  const req = g.request!;
  const i = carried.findIndex((c) => c.item === req.item);
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  g.request = null;
  const quick = clock - req.since < TUNE.patience;
  flying.push({
    mesh, from: mesh.position.clone(), to: () => tmpTo.set(g.x, g.y + (g.pose === 'sit' ? 0.9 : 1.0), g.z), t: 0, dur: 0.3,
    done: () => {
      scene.remove(mesh);
      g.happyUntil = clock + 3.2;
      g.served++;
      deliveriesThisStage++;
      g.view.act(req.item === 'tea' || req.item === 'coffee' || req.item === 'latte' || req.item === 'champagne' ? 'sip' : 'hug', 2.2);
      g.view.bounce(1);
      sfx('heart');
      particles.emit('heart', g.x, g.y + 1.6, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 12, 0.35);
      pay(req.pay + (quick ? 0 : -10), g.x, g.y + 1.1, g.z);
      g.askIn = 4 + Math.random() * 2;
      // Content, a guest in their room lies down for a rest until they want something else.
      if (g.room && g.state === 'room') later(2.4, () => {
        if (!g.request && g.state === 'room' && g.room) g.setPose('sleep', lieSpot(g.room), train[g.room.carriage].view.blanketColor);
      });
      checkStage();
    },
  });
  sfx('drop');
}
const tmpTo = new THREE.Vector3();

// ================================================================ cash: earned by jobs, carried on the back, spent on upgrades
/** Bills fly from where the job was done onto the conductor's back; the counter follows each one as it lands. */
function pay(amount: number, x: number, y: number, z: number): void {
  const bills = Math.max(1, Math.round(amount / TUNE.bill));
  floatText(`+$${bills * TUNE.bill}`, x, y + 0.9, z);
  const from = new THREE.Vector3(x, y, z);
  cash.stream(() => from, backTopPos, bills, 0.06, () => {
    backCount++;
    money += TUNE.bill;
    backBounce = 1;
    bumpT = 1;
    sfx('coin');
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
back.castShadow = true;
back.count = 0;
scene.add(back);
let backCount = 0;
let backBounce = 0;
/** The stack's lean: a damped spring driven by the conductor's acceleration (no wobble noise, no jitter). */
const lean = { x: 0, z: 0, vx: 0, vz: 0 };
const dummy = new THREE.Object3D();
const backBase = new THREE.Vector3();
const anchorPos = new THREE.Vector3();
let lastVx = 0;
let lastVz = 0;
function updateBack(dt: number): void {
  backBounce = Math.max(0, backBounce - dt * 5);
  // Pinned to the conductor's body (the carry anchor bobs with the walk), just behind the shoulders.
  player.root.updateMatrixWorld(true);
  player.stackAnchor.getWorldPosition(anchorPos);
  const fx = Math.sin(me.facing);
  const fz = Math.cos(me.facing);
  backBase.set(anchorPos.x - fx * 0.62, anchorPos.y - 0.1, anchorPos.z - fz * 0.62);
  if (dt > 0) {
    const ax = (me.vx * me.speed - lastVx) / dt;
    const az = (me.vz * me.speed - lastVz) / dt;
    lastVx = me.vx * me.speed;
    lastVz = me.vz * me.speed;
    // Spring toward leaning back against the run (and forward when braking), well damped.
    const k = 60;
    const c = 13;
    lean.vx += (-ax * 0.004 - me.vx * me.speed * 0.012 - lean.x) * k * dt - lean.vx * c * dt;
    lean.vz += (-az * 0.004 - me.vz * me.speed * 0.012 - lean.z) * k * dt - lean.vz * c * dt;
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
    dummy.position.set(backBase.x + lean.x * bend, backBase.y + h, backBase.z + lean.z * bend);
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
  const n = Math.min(backCount, BACK_MAX);
  const h = n * BILL_STEP;
  const bend = (h / 1.2) * (h / 1.2);
  return backTop.set(backBase.x + lean.x * bend, backBase.y + h + 0.04, backBase.z + lean.z * bend);
}

// ================================================================ jobs at the furniture (the game's own job badges)
interface Source { items: ItemKind[]; carriage: number; x: number; z: number; marker: JobMarker; progress: number }
const sources: Source[] = [];
function addSource(items: ItemKind[], carriage: number, local: Vec2): Source {
  const icon = ITEM_ICON[items[0]] ?? 'tea';
  const z0 = carriageOriginZ(carriage);
  const p = walkableNear(local.x, local.z + z0);
  const marker = new JobMarker(icon);
  marker.setPosition(p.x, p.z);
  const anchor = map.serviceAnchor(p.x, p.z, 1.3);
  if (anchor) marker.setIconAnchor(anchor.x - p.x, anchor.z - p.z, anchor.height + 0.55);
  marker.visible = false;
  scene.add(marker.group);
  const s: Source = { items, carriage, x: p.x, z: p.z, marker, progress: 0 };
  sources.push(s);
  return s;
}
const L = views.lobby.layout.anchors;
const URN_ITEMS: ItemKind[] = ['tea', 'coffee', 'champagne'];
const LINEN_ITEMS: ItemKind[] = ['blanket', 'towel'];
addSource(URN_ITEMS, SLOT.lobby, L.urn);
addSource(LINEN_ITEMS, SLOT.lobby, L.linen);
addSource(['luggage'], SLOT.lobby, L.rack);
// The desk's open end, where the game's conductor serves from (easy to reach from anywhere in the lobby).
const deskPad = walkableNear(L.deskService.x, L.deskService.z);
const desk = { x: deskPad.x, z: deskPad.z, marker: new JobMarker('key'), progress: 0 };
desk.marker.setPosition(desk.x, desk.z);
desk.marker.setIconAnchor(-1.17 - desk.x, 3.4 - desk.z, 1.55);
scene.add(desk.marker.group);
const roomMarker = new JobMarker('bed');
roomMarker.visible = false;
scene.add(roomMarker.group);
let projector: { x: number; z: number; marker: JobMarker; progress: number; filmT: number; ready: boolean } | null = null;

// ================================================================ upgrade tiles (the game's own tiles; they fill as cash flies in)
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
  t.view.face.draw(t.icon, left, t.paid / t.price, money >= left, t.sent > t.paid / TUNE.bill);
  t.view.marker.draw(t.icon, t.name, left, money >= left);
}
function updateTile(dt: number): void {
  const t = tile;
  if (!t) return;
  const on = Math.hypot(t.x - me.x, t.z - me.z) < TUNE.tileReach;
  t.view.update(dt, money >= t.price - t.paid, on, true, false);
  if (!on || t.done) return;
  t.timer -= dt;
  const bills = t.price / TUNE.bill;
  // Only what is really carried goes in: an upgrade is never free, and a part-paid one keeps its fill.
  while (t.timer <= 0 && t.sent < bills && backCount > 0) {
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
        finishTile(t);
      }
    });
  }
}
function finishTile(t: Tile): void {
  particles.emit('sparkle', t.x, FLOOR_Y + 0.4, t.z, 34, 0.6);
  particles.emit('star', t.x, FLOOR_Y + 0.6, t.z, 12, 0.4);
  sfx('unlock');
  const g = t.view.group;
  shrinkAway(g);
  tile = null;
  t.onDone();
}
const shrinking: { obj: THREE.Object3D; t: number }[] = [];
function shrinkAway(obj: THREE.Object3D): void {
  shrinking.push({ obj, t: 0 });
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
const spawn = walkableNear(-0.6, 5.6);
const me = { x: spawn.x, z: spawn.z, facing: Math.PI, speed: 0, vx: 0, vz: 0 };
/** Where the conductor has been: an escorted guest walks along it, so they never cut through a wall. */
const trail: Vec2[] = [];

// ================================================================ the stages (the flow of the ad)
let finale = false;
let departed = false;
let endAt = -1;
function speedNow(): number {
  return TUNE.speed[Math.min(stageNo, TUNE.speed.length - 1)];
}
function checkTime(): number {
  return TUNE.checkIn[Math.min(stageNo, TUNE.checkIn.length - 1)];
}
const boardStart = (i: number): Vec2 => ({ x: PLATFORM.concourse[1].x + 0.4 - (i % 2) * 0.3, z: PLATFORM.concourse[1].z - 2.4 - i * 1.2 });

/** Stage 0, at Millbrook: two travellers board. */
function startGame(): void {
  board([{ item: 'tea', after: 0 }, { item: 'blanket', after: 1 }], 0, boardStart(0));
  board([{ item: 'luggage', after: 0 }, { item: 'tea', after: 1 }], 1.4, boardStart(1));
}

/** What each stage waits for before its upgrade appears. */
function checkStage(): void {
  safetyNet();
  // At a later stop, the train leaves once everyone who boarded is checked in and shown to a room.
  if (stageNo > 0 && journey.phase === 'stopped' && !pendingArrival && !guests.some((g) => g.state === 'boarding' || g.state === 'queue' || g.state === 'follow')) {
    if (journey.t > 3.2) depart();
  }
  if (tile || finale) return;
  const settled = (g: Guest) => g.state === 'room' || g.state === 'seated';
  if (stageNo === 0) {
    if (!departed && guests.length === 2 && guests.every(settled)) {
      departed = true;
      later(0.8, depart);
    }
    if (deliveriesThisStage >= 2) showTile(walkableNear(-1.3, 15.1), 'bed', 'New Room', TUNE.price.room, buyRoom);
  } else if (stageNo === 1) {
    if (guests.length >= 3 && guests.every(settled) && deliveriesThisStage >= 3) showTile(walkableNear(-0.2, 17.2), 'carriage', 'New Carriage', TUNE.price.carriage, buyCarriage);
  } else if (stageNo === 2) {
    if (guests.length >= 6 && guests.every(settled) && deliveriesThisStage >= 3) showTile(walkableNear(-0.2, carriageOriginZ(SLOT.sleeper) + 17.2), 'latte', 'Café', TUNE.price.cafe, buyCafe);
  } else if (stageNo === 3) {
    if (deliveriesThisStage >= 5) showTile(walkableNear(0, carriageOriginZ(SLOT.cafe) + 17.2), 'film', 'Theatre', TUNE.price.theatre, buyTheatre);
  } else if (stageNo === 4) {
    if (projector && projector.filmT < 0 && filmShown && deliveriesThisStage >= 2) showTile(walkableNear(-1.4, carriageOriginZ(SLOT.sleeper) + 15.8), 'wrench', 'Upgrade', TUNE.price.refit, buyRefit);
  } else if (stageNo === 5) {
    if (deliveriesThisStage >= 3 && !finale) {
      finale = true;
      showBanner('5-STAR TRAIN!', 'Every guest delighted 😍');
      sfx('perfect');
      burstAlong(0, trainRear(), 'confetti', 80);
      endAt = clock + TUNE.endDelay;
    }
  }
}
/**
 * Never stuck: if an upgrade is on show, the conductor cannot afford it, and nobody has anything left to ask for, a
 * settled guest asks for one more cup of tea (more work, never a free upgrade).
 */
function safetyNet(): void {
  if (!tile || money + tile.paid >= tile.price) return;
  const pending = guests.some((g) => g.request || g.plan.some((p) => p.after <= stageNo)) || follower || queue.length > 0 || guests.some((g) => g.state === 'boarding' || g.state === 'entering' || g.state === 'toSeat');
  if (pending || cash.flying > 0) return;
  const g = guests.find((x) => x.state === 'room');
  if (g) g.plan.unshift({ item: 'tea', after: 0 });
}
function nextStage(): void {
  stageNo++;
  deliveriesThisStage = 0;
  speedPop();
}
function speedPop(): void {
  later(0.9, () => floatText('⚡ FASTER!', me.x, FLOOR_Y + 2.6, me.z));
}

/** Stage 1: a third room, and the next station brings its guest. */
function buyRoom(): void {
  lockedRooms.get(SLOT.lobby)!.delete('cabin:2');
  rooms[2].open = true;
  views.lobby.setCabinLocked(2, false);
  rebuildTrain();
  const c = rooms[2].cabin;
  burstAt((c.room.x0 + c.room.x1) / 2, (c.room.z0 + c.room.z1) / 2, 'sparkle', 30);
  sfx('reveal');
  showBanner('NEW ROOM!', 'More guests, more cash');
  nextStage();
  later(1.2, () => arrive(() => board([{ item: 'blanket', after: 1 }, { item: 'luggage', after: 2 }], 0.3, boardStart(0))));
}

/** Stage 2: a sleeper carriage rolls in and couples on; the next station fills it. */
function buyCarriage(): void {
  couple(views.sleeper, 'sleeper', 0);
  // The sleeper's own tea urn and linen cupboard, at its front.
  const S = views.sleeper.layout.anchors;
  addSource(URN_ITEMS, SLOT.sleeper, S.urn);
  addSource(LINEN_ITEMS, SLOT.sleeper, S.linen);
  rooms = rooms.concat(roomsOf(SLOT.sleeper, views.sleeper.layout, 3));
  showBanner('NEW CARRIAGE!', 'The Sleeper · 3 more rooms');
  nextStage();
  later(2.6, () =>
    arrive(() => {
      board([{ item: 'tea', after: 2 }, { item: 'pastry', after: 3 }], 0.2, boardStart(0));
      board([{ item: 'blanket', after: 2 }, { item: 'pastry', after: 3 }, { item: 'champagne', after: 5 }], 1.2, boardStart(1));
      board([{ item: 'luggage', after: 2 }, { item: 'coffee', after: 5 }], 2.2, boardStart(2));
    }),
  );
}

/** Stage 3: the café; three passengers come through from the sleeper for a latte or a croissant. */
function buyCafe(): void {
  couple(views.cafe, 'cafe', CAFE_TIER);
  showBanner('CAFÉ OPEN!', 'Lattes & croissants');
  nextStage();
  const z0 = carriageOriginZ(SLOT.cafe);
  addSource(['latte'], SLOT.cafe, views.cafe.layout.venue!.stations[0].pad);
  addSource(['pastry'], SLOT.cafe, views.cafe.layout.venue!.stations[1].pad);
  const seats = views.cafe.layout.venue!.seats;
  ([[0, 'latte'], [3, 'pastry'], [6, 'latte']] as const).forEach(([s, item], i) => later(2.6 + i * 0.7, () => visitor('cafe', seats[s], z0, [{ item, after: 3 }])));
}

/** Stage 4: the theatre; an audience comes in; start the film and hand round popcorn. */
let filmShown = false;
function buyTheatre(): void {
  couple(views.cinema, 'cinema', CINEMA_TIER);
  showBanner('THEATRE OPEN!', 'Movie night on the train');
  nextStage();
  const v = views.cinema.layout.venue!;
  const z0 = carriageOriginZ(SLOT.cinema);
  addSource(['popcorn'], SLOT.cinema, v.stations[0].pad);
  const pad = walkableNear(v.projector!.x, v.projector!.z + z0);
  const marker = new JobMarker('film');
  marker.setPosition(pad.x, pad.z);
  const anchor = map.serviceAnchor(pad.x, pad.z, 1.3);
  if (anchor) marker.setIconAnchor(anchor.x - pad.x, anchor.z - pad.z, anchor.height + 0.55);
  marker.visible = false;
  scene.add(marker.group);
  projector = { x: pad.x, z: pad.z, marker, progress: 0, filmT: -1, ready: false };
  [0, 6, 1, 7, 2].forEach((s, i) => later(2.4 + i * 0.5, () => visitor('cinema', v.seats[s], z0, i === 1 || i === 3 ? [{ item: 'popcorn', after: 4 }] : [])));
}

/** Stage 5: the sleeper's class refit: three grand cabins, and its guests want champagne and coffee. */
function buyRefit(): void {
  const old = views.sleeper;
  const next = views.sleeperRefit;
  old.group.visible = false;
  next.group.visible = true;
  train[SLOT.sleeper] = { type: 'sleeper', tier: REFIT_TIER, view: next };
  lockedRooms.delete(SLOT.sleeper);
  rebuildTrain();
  popCarriage(next.group);
  const z0 = carriageOriginZ(SLOT.sleeper);
  burstAlong(z0, z0 + CARRIAGE_LENGTH, 'sparkle', 40);
  burstAlong(z0, z0 + CARRIAGE_LENGTH, 'confetti', 50);
  stage.rig.shake(0.16, 0.35);
  stage.rig.punch(0.07);
  sfx('reveal');
  later(0.4, () => sfx('levelup'));
  showBanner('BUSINESS CLASS!', 'Grand cabins · bigger tips');
  // The sleeper's three guests move into the new cabins (it was their carriage that changed round them).
  const newRooms = roomsOf(SLOT.sleeper, next.layout, 3);
  const residents = guests.filter((g) => g.room && g.room.carriage === SLOT.sleeper);
  rooms = rooms.filter((r) => r.carriage !== SLOT.sleeper).concat(newRooms);
  residents.forEach((g, i) => {
    const r = newRooms[i];
    r.guest = g;
    g.room = r;
    g.request = null;
    g.setPose('sleep', lieSpot(r), next.blanketColor);
    g.happyUntil = clock + 2.5;
    g.askIn = 2 + i * 1.2;
    if (g.plan.length === 0 || g.plan[0].after < 5) g.plan = [{ item: (['champagne', 'coffee', 'towel'] as const)[i % 3], after: 5 }];
  });
  // The urn and the linen of the old plan stay where they were (the refit keeps the front room).
  nextStage();
}

/** A passenger from further up the train comes through the gangway to a venue seat. */
function visitor(venue: 'cafe' | 'cinema', seat: VenueSeatLayout, z0: number, plan: RequestPlan[]): void {
  const g = new Guest(0, z0 - 0.4);
  g.plan = plan;
  g.state = 'toSeat';
  g.seat = { venue, seat, z0 };
  g.facing = 0;
  guests.push(g);
  people.push(g);
  const sitAt = { x: seat.sit.x, y: FLOOR_Y + seat.top - 0.24, z: seat.sit.z + z0, facing: seat.facing };
  const approach = walkableNear(seat.sit.x + (seat.serve ? seat.serve.x - seat.sit.x : 0), seat.sit.z + z0);
  g.walkTo([{ x: 0, z: z0 + 1.1 }, ...route({ x: 0, z: z0 + 1.1 }, approach, map.nodeId(venue === 'cafe' ? SLOT.cafe : SLOT.cinema, seat.node))], () => {
    g.setPose('sit', sitAt);
    g.state = 'seated';
    g.askIn = 0.8;
    if (venue === 'cinema' && projector) projector.ready = guests.filter((x) => x.seat?.venue === 'cinema' && x.state === 'seated').length >= 3;
  });
}

// ================================================================ new carriages roll in and couple on (the game's signature moment)
const rolling: { group: THREE.Object3D; t: number; z: number; done: () => void }[] = [];
function couple(view: CarriageView, type: CarriageType, tier: number): void {
  train.push({ type, tier, view });
  rebuildTrain();
  const z = carriageOriginZ(view.index);
  view.group.visible = true;
  view.group.position.z = z + 26;
  sfx('whoosh');
  rolling.push({
    group: view.group, t: 0, z,
    done: () => {
      sfx('clunk');
      stage.rig.shake(0.24, 0.4);
      stage.rig.punch(0.09);
      burstAlong(z - 0.6, z + 1.2, 'dust', 24);
      burstAlong(z, z + CARRIAGE_LENGTH, 'confetti', 50);
      burstAlong(z, z + CARRIAGE_LENGTH, 'star', 14);
      later(0.3, () => sfx('reveal'));
      stage.lighting.invalidateShadows();
    },
  });
}
/** A refit: the carriage swells a touch and settles (a uniform scale, so no surface ever folds into another). */
const pops: { group: THREE.Object3D; t: number }[] = [];
function popCarriage(group: THREE.Object3D): void {
  pops.push({ group, t: 0 });
}
function burstAlong(z0: number, z1: number, kind: 'confetti' | 'dust' | 'sparkle' | 'star', count: number): void {
  for (let i = 0; i < count; i++) {
    const z = z0 + ((i + 0.5) / count) * (z1 - z0);
    particles.emit(kind, (Math.random() - 0.5) * 4, FLOOR_Y + 0.5 + Math.random() * 0.9, z, 1, 0.25);
  }
}
function burstAt(x: number, z: number, kind: 'confetti' | 'sparkle' | 'star', count: number): void {
  particles.emit(kind, x, FLOOR_Y + 0.7, z, count, 0.7);
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

/** The next thing to do, and where to stand for it (the guide, and where a tap walks you). */
function target(): (Vec2 & { lift: number }) | null {
  // Something carried that someone is waiting for: take it to them.
  for (const c of carried) {
    const g = guests.find((x) => x.request?.item === c.item);
    if (g) return { ...approachOf(g), lift: 2.3 };
  }
  if (follower?.room) return { ...roomCentre(follower.room), lift: 1.6 };
  if (tile && money >= tile.price - tile.paid) return { x: tile.x, z: tile.z, lift: 1.4 };
  if (!follower && (frontReady() || (queue.length === 0 && guests.some((g) => g.state === 'boarding')))) return { x: desk.x, z: desk.z, lift: 1.9 };
  // An open request: fetch what it needs (nearest source).
  const open = guests.filter((g) => g.request && !carried.some((c) => c.item === g.request!.item)).sort((a, b) => a.request!.since - b.request!.since);
  if (open[0]) {
    const s = nearestSource(open[0].request!.item);
    if (s) return { x: s.x, z: s.z, lift: 1.9 };
  }
  if (projector && projector.ready && projector.filmT < 0 && !filmShown) return { x: projector.x, z: projector.z, lift: 1.8 };
  if (tile) return { x: tile.x, z: tile.z, lift: 1.4 };
  if (queue.length > 0 && !follower) return { x: desk.x, z: desk.z, lift: 1.9 };
  return null;
}
function approachOf(g: Guest): Vec2 {
  if (g.room) return roomCentre(g.room);
  return walkableNear(g.x + (g.x > 0 ? -0.9 : 0.9), g.z);
}
function nearestSource(item: ItemKind): Source | null {
  let best: Source | null = null;
  let bestD = 1e9;
  for (const s of sources) {
    if (!s.items.includes(item) || s.carriage >= train.length) continue;
    const d = Math.hypot(s.x - me.x, s.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Whether the conductor can walk in a straight line from a to b (sampled every 12 cm). */
function straight(a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!map.walk.isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

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
      // Walk the nav route there, cutting straight to the furthest point in plain view (never into a wall or furniture).
      const pts = route({ x: me.x, z: me.z }, t);
      let next = pts[0];
      for (let k = pts.length - 1; k >= 0; k--) {
        if (straight(me, pts[k])) {
          next = pts[k];
          break;
        }
      }
      const dx = next.x - me.x;
      const dz = next.z - me.z;
      const d = Math.hypot(t.x - me.x, t.z - me.z);
      if (d > 0.3) {
        const l = Math.hypot(dx, dz) || 1;
        mx = dx / l;
        mz = dz / l;
        mag = 1;
      } else autoWalk = false;
    } else mag = 0;
  } else mag = 0;
  const want = mag * speedNow();
  me.speed += (want - me.speed) * Math.min(1, dt * (want > me.speed ? 12 : 20));
  if (mag > 0) {
    me.vx = mx;
    me.vz = mz;
    me.facing = turnToward(me.facing, Math.atan2(mx, mz), dt * 16);
  }
  if (me.speed > 0.01) {
    const pos = { x: me.x, z: me.z };
    map.walk.move(pos, me.vx * me.speed * dt, me.vz * me.speed * dt, 0.5, 1.3);
    // Nobody walks through anybody: the conductor slides round people instead.
    for (const p of people) {
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = PERSON_RADIUS * 2 - 0.04;
      if (d < min && d > 1e-4 && p.pose !== 'sleep') {
        const px = p.x + (dx / d) * min;
        const pz = p.z + (dz / d) * min;
        if (map.walk.isWalkable(px, pz)) {
          pos.x = px;
          pos.z = pz;
        }
      }
    }
    pos.z = Math.max(0.45, Math.min(trainRear() - 0.5, pos.z));
    me.x = pos.x;
    me.z = pos.z;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - me.x, last.z - me.z) > 0.1) {
      trail.push({ x: me.x, z: me.z });
      if (trail.length > 300) trail.shift();
    }
  }
  player.setPosition(me.x, FLOOR_Y, me.z);
  player.setFacing(me.facing);
  player.update(dt, me.speed);
}

/** The escorted guest walks along the conductor's trail, about a metre behind. */
function updateFollower(dt: number): void {
  const g = follower;
  if (!g) return;
  let goal: Vec2 | null = null;
  let acc = 0;
  for (let i = trail.length - 1; i > 0; i--) {
    acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z);
    if (acc >= 1.05) {
      goal = trail[i - 1];
      // Drop what lies behind the guest already.
      if (i > 2) trail.splice(0, i - 2);
      break;
    }
  }
  if (!goal) {
    g.speed = 0;
    return;
  }
  const dx = goal.x - g.x;
  const dz = goal.z - g.z;
  const d = Math.hypot(dx, dz);
  const toMe = Math.hypot(me.x - g.x, me.z - g.z);
  if (d > 0.04 && toMe > 0.75) {
    const step = Math.min(d, Math.max(TUNE.guestSpeed, me.speed * 1.05) * dt);
    g.x += (dx / d) * step;
    g.z += (dz / d) * step;
    g.facing = turnToward(g.facing, Math.atan2(dx, dz), dt * 12);
    g.speed = step / Math.max(dt, 1e-4);
  } else g.speed = 0;
}

/** Desk, pick-ups, deliveries, showing guests in, the projector. */
function updateJobs(dt: number): void {
  // The desk: check in the guest at the front.
  const front = frontReady();
  const atDesk = Math.hypot(me.x - desk.x, me.z - desk.z) < TUNE.deskReach;
  const deskWants = !!front && !follower;
  desk.marker.visible = deskWants || desk.progress > 0;
  desk.marker.iconShown = deskWants;
  desk.marker.highlight = deskWants && hesitating();
  if (deskWants && atDesk) {
    desk.progress = Math.min(1, desk.progress + dt / checkTime());
    if (desk.progress >= 1) {
      desk.progress = 0;
      checkIn(front);
    }
  } else desk.progress = Math.max(0, desk.progress - dt * 2);
  desk.marker.working = desk.progress > 0;
  desk.marker.progress = desk.progress;
  desk.marker.update(dt);

  // Showing the guest in: reach their room's door or step inside.
  roomMarker.visible = !!follower;
  if (follower?.room) {
    const r = follower.room;
    const c = roomCentre(r);
    roomMarker.setPosition(c.x, c.z);
    roomMarker.setIconAnchor(r.cabin.bedPose.x - c.x, r.cabin.bedPose.z + roomZ(r) - c.z, 1.35);
    roomMarker.highlight = true;
    const door = roomDoor(r);
    if (Math.hypot(me.x - c.x, me.z - c.z) < TUNE.roomReach || Math.hypot(me.x - door.x, me.z - door.z) < 0.9) showIn(follower);
  }
  roomMarker.update(dt);

  // Pick-ups: only what someone is waiting for (and not already in hand).
  for (const s of sources) {
    if (s.carriage >= train.length) continue;
    // The first of its things someone is waiting for (and the conductor is not already carrying).
    const item = s.items.find((it) => guests.filter((g) => g.request?.item === it).length > carried.filter((c) => c.item === it).length) ?? null;
    const wants = !!item && carried.length < MAX_CARRY;
    if (item) s.marker.setIcon(ITEM_ICON[item] ?? 'tea');
    s.marker.visible = wants || s.progress > 0;
    s.marker.iconShown = wants;
    s.marker.highlight = wants;
    const near = Math.hypot(me.x - s.x, me.z - s.z) < TUNE.pickReach;
    if (wants && near) {
      s.progress = Math.min(1, s.progress + dt / TUNE.pickUp);
      if (s.progress >= 1 && item) {
        s.progress = 0;
        pickUp(item);
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }

  // Deliveries: within reach and in plain sight (never through a wall).
  for (const g of guests) {
    if (!g.request || !carried.some((c) => c.item === g.request!.item)) continue;
    const d = Math.hypot(me.x - g.x, me.z - g.z);
    const inRoom = g.room && Math.hypot(me.x - roomCentre(g.room).x, me.z - roomCentre(g.room).z) < 1.2;
    if ((d < TUNE.serveReach && map.walk.lineClear(me.x, me.z, approachOf(g).x, approachOf(g).z) && Math.hypot(approachOf(g).x - me.x, approachOf(g).z - me.z) < 1.4) || inRoom) deliver(g);
  }

  // The projector: start the film once the audience is in.
  const p = projector;
  if (p) {
    const wants = p.ready && p.filmT < 0 && !filmShown;
    p.marker.visible = wants || p.progress > 0;
    p.marker.iconShown = wants;
    p.marker.highlight = wants;
    if (wants && Math.hypot(me.x - p.x, me.z - p.z) < TUNE.pickReach + 0.2) {
      p.progress = Math.min(1, p.progress + dt / TUNE.projector);
      if (p.progress >= 1) {
        p.progress = 0;
        p.filmT = 0;
        views.cinema.setVenueFilm(0);
        sfx('chime');
        showBanner('NOW SHOWING', '🍿 The Night Train');
      }
    } else p.progress = Math.max(0, p.progress - dt * 2);
    p.marker.working = p.progress > 0;
    p.marker.progress = p.progress;
    p.marker.update(dt);
    if (p.filmT >= 0) {
      p.filmT += dt;
      if (p.filmT >= TUNE.film) {
        p.filmT = -1;
        filmShown = true;
        views.cinema.setVenueFilm(-1);
        // Every seat that watched pays for its ticket: the conductor started the show.
        const audience = guests.filter((g) => g.seat?.venue === 'cinema' && g.state === 'seated');
        audience.forEach((g, i) => later(i * 0.18, () => {
          g.happyUntil = clock + 3;
          g.view.act('wave', 0.8);
          pay(TUNE.pay.film, g.x, g.y + 1.2, g.z);
        }));
        sfx('perfect');
        later(audience.length * 0.18 + 0.6, checkStage);
      }
    }
  }
}

/** Room doors swing open for anyone at them (the game's hinged leaves), and close behind them. */
function updateDoors(dt: number): void {
  for (const car of train) {
    const z0 = car.view.group.position.z;
    for (const door of car.view.roomDoors as RoomDoor[]) {
      const dz = door.z + z0;
      let want = 0;
      if (!door.locked) {
        if (Math.abs(me.z - dz) < 1.3 && Math.abs(me.x - door.x) < 1.1) want = 1;
        for (const p of people) if (p.walking || p === follower) if (Math.abs(p.z - dz) < 1.4 && Math.abs(p.x - door.x) < 1.3) want = 1;
      }
      if (door.open === want) continue;
      const next = want > door.open ? Math.min(1, door.open + dt * 4) : Math.max(0, door.open - dt * 2.5);
      car.view.setRoomDoor(door, next);
    }
  }
}

// ================================================================ the guide: the game's gold arrow and a hand, only when the player hesitates
const arrow = makeSprite(guideArrowTexture(), 0.6);
arrow.material.toneMapped = false;
arrow.renderOrder = 21;
scene.add(arrow);
let arrowShown = 0;
function hesitating(): boolean {
  return !started || (clock - lastInput > TUNE.hesitate && !autoWalk && pointerId < 0);
}
function updateGuide(dt: number): void {
  const t = target();
  const show = !!t && !ended && hesitating();
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  arrow.visible = arrowShown > 0.02 && !!t;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    const s = 0.6 * arrowShown;
    arrow.scale.set(s, s, 1);
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
  const x = a.x + 26 + (dx / l) * reach * e;
  const y = a.y + 54 + (dy / l) * reach * e;
  const press = cyc < 0.18 ? 0.86 + cyc * 0.5 : 0.9;
  hand.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${press.toFixed(3)})`;
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

// ================================================================ the camera: eased follow, leaning toward the next job so both are in view
const camFocus = { x: me.x, z: me.z };
function updateCamera(dt: number): void {
  let fx = me.x;
  let fz = me.z;
  const t = target();
  if (t) {
    const dx = t.x - me.x;
    const dz = t.z - me.z;
    const d = Math.hypot(dx, dz);
    const k = Math.min(TUNE.leadMax, d * TUNE.lead) / (d || 1);
    fx += dx * k;
    fz += dz * k;
  }
  // The first travellers walking along the platform: the view leans out to them.
  const boarding = guests.find((g) => g.state === 'boarding' && journey.phase === 'stopped');
  if (boarding && !follower) {
    fx = me.x + (Math.min(boarding.x, 2.6) - me.x) * 0.3;
    fz = me.z + (boarding.z - me.z) * 0.3;
  }
  // A new carriage rolling in: the camera eases over to it.
  const r = rolling[0];
  if (r) {
    fx = 0;
    fz = r.z + 6;
  }
  const e = Math.min(1, dt * 2.6);
  camFocus.x += (fx - camFocus.x) * e;
  camFocus.z += (fz - camFocus.z) * e;
  stage.rig.update(dt, camFocus.x, camFocus.z);
}
function resize(): void {
  stage.resize();
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  // The rig frames a width of floor; on a wide screen that comes in far too close, so keep the floor's height instead.
  stage.rig.setZoom(aspect > 0.9 ? Math.max(TUNE.zoom, 1.02 * aspect) : TUNE.zoom);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
stage.rig.clampX = [-2.2, 2.6];
stage.rig.clampZ = [-2, carriageOriginZ(3) + CARRIAGE_LENGTH];

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
    updateFollower(dt);
    updateJobs(dt);
    updateTile(dt);
    for (const g of guests) maybeAsk(g, dt);
    checkStage();
  } else {
    updatePlayer(0);
    desk.marker.update(dt);
    tile?.view.update(dt, false, false);
  }
  for (const p of people) p.update(dt);
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
    f.mesh.position.y += Math.sin(k * Math.PI) * 0.45;
    if (k >= 1) {
      flying.splice(i, 1);
      f.done();
    }
  }
  for (let i = popping.length - 1; i >= 0; i--) {
    const p = popping[i];
    p.t += dt * 4;
    const s = p.t >= 1 ? 1 : 1 + Math.sin(p.t * Math.PI) * 0.4;
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
    r.t += dt / 2.2;
    const k = Math.min(1, r.t);
    const e = 1 - Math.pow(1 - k, 3);
    r.group.position.z = r.z + 26 * (1 - e);
    if (k >= 1) {
      r.group.position.z = r.z;
      rolling.splice(i, 1);
      r.done();
    }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt / 0.6;
    const k = Math.min(1, p.t);
    const s = 1 + Math.sin(k * Math.PI) * 0.035;
    p.group.scale.setScalar(s);
    if (k >= 1) {
      p.group.scale.setScalar(1);
      pops.splice(i, 1);
      stage.lighting.invalidateShadows();
    }
  }
  for (const c of train) c.view.animate(dt);
  scenery.update(dt, journey.speed);
  loco.update(dt, journey.speed);
  smokeT -= dt;
  if (smokeT <= 0) {
    smokeT = journey.speed > 0.5 ? 0.25 : 0.7;
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
  if (!ended && (clock - lastInput > TUNE.idleEnd || (endAt > 0 && clock >= endAt))) endGame();
  updateCamera(dt);
  batch.sync(stage.rig.camera);
  audio.update(dt);
  stage.render(dt);
}

async function boot(): Promise<void> {
  resize();
  stage.rig.snapTo(me.x, me.z);
  updateBack(0);
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
  // The opening scene is alive before the first touch: the first two travellers walk along the platform to the door.
  startGame();
  last = performance.now();
  requestAnimationFrame(frame);
}
void boot();

// Test hooks (harmless in an ad).
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return { stage: stageNo, money, backCount, guests: guests.length, queue: queue.length, carried: carried.map((c) => c.item), tile: tile ? `${tile.name} ${tile.paid}/${tile.price}` : null, ended, clock: Math.round(clock), me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) }, journey: journey.phase, requests: guests.filter((g) => g.request).map((g) => g.request!.item), deliveries: deliveriesThisStage, finale };
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
