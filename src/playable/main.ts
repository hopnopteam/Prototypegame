// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the cash, the tiles, the makeover wipe, the tarp reveal and the sounds).
//
// One thing at a time. A single flow controller (`flow`) decides what may happen; nothing starts on its own.
//  - The train is a luxury sleeper on its way through the night: it never stops, and nobody leaves. Three passengers
//    come to the reception one at a time (each walks in from the front of the carriage only once the one before is
//    looked after); once checked in they stay in their rooms all night.
//  - Tutorial: guests 1-3, each alone, each its own walkthrough (check in → their room → their one wish → the cash),
//    with less help each time (arrow, ring and words; arrow and ring; a light arrow), and a pause between steps.
//    Then play: their requests come, a few at a time.
//  - Upgrades, one by one, each shown once affordable: the Café Car, Comfort Class, the Attendant, the Theatre, a
//    faster Attendant, Business Class, a 2nd Attendant (serves the café and the theatre) and the Café Makeover. Then
//    the Dining Car is the goal; the end card comes once affordable.
// Messages: ONE on screen at a time (a caption, else the instruction). Labels over the world (bubbles, signs, tile
// markers, floats) are checked every frame and never overlap each other or the HUD.
// Captions go through one channel: one at a time; a small one (praise, a combo) is dropped if anything else shows.
import * as THREE from 'three';
import { AudioEngine, isAndroid, type Sfx } from '../audio/AudioEngine';
import { classOfTier } from '../config/classes';
import { ARCHETYPES } from '../config/content';
import { VISUALS } from '../config/visuals';
import { frameWork } from '../core/Background';
import { rect, type CarriageType, type ItemKind, type Vec2 } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon as drawIconAt, type IconName } from '../ui/icons';
import { Ambient } from '../world/Ambient';
import { BED_TOP, CarriageView, deformTarp, FLOOR_Y, TARP_TIE_Z } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { Fireflies } from '../world/Fireflies';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { CARRIAGE_LENGTH, carriageOriginZ, getLayout, HALF_WIDTH, INNER, REAR_TILE_X, REAR_TILE_Z, type CabinLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { clipSide, MATERIALS, SHADOW_GEOMETRY, setLivery, swapMaterials } from '../world/materials';
import { liveryFor, PALETTE } from '../world/palette';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
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
  /** Camera distance factor; it eases in a little while walking and back out when standing or working. */
  zoom: 0.66,
  zoomWalk: 0.92,
  follow: 7,
  /** Walking speed (m/s), and what each upgrade adds. */
  speed: 5.8,
  speedUp: 1.03,
  guestSpeed: 3.8,
  /** One bill is $10. A room delivery pays by the carriage's class (index = tier); a café order by its look. */
  bill: 10,
  deliver: [3, 3, 4, 5] as number[],
  cafe: [4, 4, 5] as number[],
  /** A theatre seat pays this when the movie ends; popcorn like a café order. */
  ticket: 4,
  /** Serving again within this many seconds builds a combo; from x3 each serve adds a bonus bill. */
  comboWindow: 9,
  /** Upgrades in order (each appears once affordable). */
  price: { cafe: 100, comfort: 160, attendant: 180, theatre: 240, fast: 200, business: 300, second: 260, makeover: 320 },
  /** The next upgrade shown at the end (the end card comes once you can afford it). */
  diningCar: 300,
  /** Seconds a job takes (quick: the conductor barely has to stop). */
  checkIn: 0.35,
  pickUp: 0.2,
  projector: 0.5,
  /** Reaches (m): deliveries go as soon as the guest is in reach (anywhere in their room), cash comes in from a stride away. */
  deskReach: 1.3,
  pickReach: 1.25,
  serveReach: 2.3,
  roomReach: 2.2,
  scoopReach: 1.6,
  tileReach: 0.9,
  /** Seconds an item flies to the guest. */
  handOver: 0.2,
  /** Most things carried at once. */
  carry: 3,
  /** A guest waiting this long for what they asked for is cross (😠). */
  patience: 22,
  /** Requests: a guest's rest (asleep) after being served; the gap between new requests across the train. */
  rest: [5, 8] as [number, number],
  askGap: [2, 4] as [number, number],
  /** Chance a request is a visit to the café or the theatre once open. */
  visit: 0.45,
  /** The movie's length. */
  film: 7,
  /** The Attendant: walking speed, the faster one's, and how long she takes at a cupboard. */
  attendantSpeed: 3.4,
  attendantFast: 1.5,
  attendantPick: 0.6,
  /** The tutorial's pace: a breath after each step, a pause between guests, a moment before a guest asks. */
  pace: { stepPause: 1.0, guestPause: 2.5, requestDelay: 1.4, enterSpeed: 1.9 },
  /** Requests open at once in play: to start, and with an Attendant. */
  openStart: 2,
  /** Captions: an important one; a small one (praise, combo); the class card. */
  caption: 1.8,
  small: 1.1,
  classCard: 2.4,
  /** The train's speed (m/s; slow enough that the sleepers never strobe). */
  ride: 7,
  /** Seconds between bills draining into an upgrade. */
  drain: 0.04,
  /** Seconds without a touch before the hand shows, and before the end card shows anyway. */
  hesitate: 3,
  idleEnd: 15,
};
const NIGHT_TIME = 0.82;
const TIER = { basic: 1, comfort: 2, business: 3 } as const;
const CINEMA_TIER = 2;
/** Test runs only (`?ts=4` plays four times faster in a slow headless browser). */
const TEST_SPEED = Math.min(8, Math.max(1, Number(new URLSearchParams(location.search).get('ts')) || 1));
/** Test recordings only: the longest frame step (`?dtmax=0.25` keeps real time in a slow software renderer). */
const DT_MAX = Math.min(0.3, Math.max(0.05, Number(new URLSearchParams(location.search).get('dtmax')) || 0.05));

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

// No patterned carpets in the venues (plain floors read cleaner on a phone); the game is untouched.
for (const t of [1, 2]) getLayout('cafe', t).venue!.carpets = [];
getLayout('cinema', CINEMA_TIER).venue!.carpets = [];
// A sofa in the reception where the passengers wait to be checked in (the game's own sofa; it blocks like furniture).
const SOFA = rect(0.92, 4.2, 1.57, 6.15);
{
  const l = getLayout('lobby', 1);
  l.props.push({ kind: 'sofa', rect: SOFA, facing: 'left' });
  l.blocked.push(SOFA);
}

// Every carriage the ad will show is built now, hidden, so an upgrade is a swap and never a hitch mid-play. The train
// starts as ONE carriage (the lobby); the others join only when bought. Passenger carriages start repaired (Basic).
const SLOT = { lobby: 0, cafe: 1, cinema: 2 } as const;
/** `planTier`: the floor plan to build (the lobby keeps its three Basic rooms through every class: same guests, new look). */
function buildView(type: CarriageType, slot: number, tier: number, planTier = tier): CarriageView {
  const view = new CarriageView(getLayout(type, planTier), slot, tier);
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
  lobby: [buildView('lobby', SLOT.lobby, TIER.basic), buildView('lobby', SLOT.lobby, TIER.comfort, TIER.basic), buildView('lobby', SLOT.lobby, TIER.business, TIER.basic)],
  cafe: [buildView('cafe', SLOT.cafe, 1), buildView('cafe', SLOT.cafe, 2)],
  cinema: buildView('cinema', SLOT.cinema, CINEMA_TIER),
};
views.lobby[0].group.visible = true;

interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [{ type: 'lobby', tier: TIER.basic, view: views.lobby[0] }];
const map = new TrainMap(0.26);
const trainRear = (): number => carriageOriginZ(train.length - 1) + CARRIAGE_LENGTH;
function rebuildTrain(): void {
  map.rebuild(train.map((c) => c.type), false, false, train.map((c) => c.tier));
  stage.lightMap.setTrain(trainLightInput(train.map((c, i) => ({ layout: c.view.layout, originZ: carriageOriginZ(i), tier: c.tier, lamps: c.view.lampAnchors(carriageOriginZ(i)) }))));
  scenery.setSpan(trainRear());
  ambient.setSpan(trainRear());
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
/**
 * The ad's own reward sounds, made for it: a bright coin "ting" that climbs a pentatonic scale as a pile streams in,
 * a two-note bell for a delivery, a quick rising arpeggio for an upgrade. Short, soft and in tune with each other;
 * played through the game's effects bus so the volume and mute apply.
 */
const engine = audio as unknown as { ctx: AudioContext | null; sfx?: GainNode };
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
function bell(freq: number, at: number, length: number, level: number, shimmer = 2.0): void {
  const ctx = engine.ctx;
  if (!ctx || !soundOk || muted) return;
  const out = engine.sfx ?? ctx.destination;
  const t = ctx.currentTime + at;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  gain.connect(out);
  for (const [mult, amp, type] of [[1, 1, 'sine'], [shimmer, 0.28, 'sine'], [3.01, 0.08, 'triangle']] as [number, number, OscillatorType][]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * mult, t);
    g.gain.value = amp;
    o.connect(g).connect(gain);
    o.start(t);
    o.stop(t + length + 0.02);
  }
}
const note = (base: number, semis: number): number => base * Math.pow(2, semis / 12);
let coinStep = 0;
let coinAt = -9;
function coinSound(): void {
  // A pile's bills climb the scale; a new pile starts at the bottom again.
  if (clock - coinAt > 0.5) coinStep = 0;
  coinAt = clock;
  bell(note(1046.5, PENTA[Math.min(PENTA.length - 1, coinStep++)]), 0, 0.22, 0.09, 2.76);
}
function deliverSound(): void {
  bell(note(784, 0), 0, 0.45, 0.12);
  bell(note(784, 7), 0.08, 0.6, 0.1);
}
function upgradeSound(): void {
  [0, 4, 7, 12, 16].forEach((s, i) => bell(note(523.25, s), i * 0.07, 0.7, 0.1));
}

// ================================================================ HUD
const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <div class="ad-cash"><canvas width="96" height="96"></canvas><span class="ad-cash-n">0</span></div>
  <div class="ad-goal"><canvas width="96" height="96"></canvas><div class="ad-goal-txt"><span></span><div class="ad-goal-bar"><i></i></div></div></div>
  <div class="ad-hint"><canvas width="112" height="112"></canvas><span></span></div>
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
const goalFill = goalBox.querySelector('.ad-goal-bar i') as HTMLElement;
const banner = ui.querySelector('.ad-banner') as HTMLElement;
const classBox = ui.querySelector('.ad-class') as HTMLElement;
const hand = ui.querySelector('.ad-hand') as HTMLElement;
const muteBtn = ui.querySelector('.ad-mute') as HTMLButtonElement;
// The start screen (after the reference): the title over the game, "Drag to move" with a hand showing how, the app
// icon and an Install button that stay for the whole ad. The first touch clears the titles and starts play.
declare const __ICON__: string;
const startScreen = document.createElement('div');
startScreen.className = 'ad-start';
startScreen.innerHTML = `
  <div class="ad-start-title">UPGRADE<br>YOUR TRAIN!</div>
  <div class="ad-start-drag"><div class="ad-start-pad"><i></i></div><svg class="ad-start-hand" viewBox="0 0 100 120" width="64" height="77"><path d="M38 10c0-6 10-6 10 0v40l3-1V40c0-6 10-6 10 0v12l3 0V46c0-6 10-6 10 0v10l3 1v-4c0-6 10-6 10 0v28c0 18-12 32-30 32H52c-10 0-16-4-22-12L10 74c-4-6 3-12 9-8l13 10h6z" fill="#FFF6E4" stroke="#2B2230" stroke-width="6" stroke-linejoin="round"/></svg><b>DRAG TO MOVE</b></div>`;
document.body.appendChild(startScreen);
const corner = document.createElement('div');
corner.className = 'ad-corner';
corner.innerHTML = `<img class="ad-icon" alt="" src="${__ICON__}"><button class="ad-install" type="button">INSTALL</button>`;
document.body.appendChild(corner);
const install = corner.querySelector('.ad-install') as HTMLButtonElement;
install.addEventListener('pointerdown', (e) => e.stopPropagation());
install.addEventListener('click', (e) => {
  e.stopPropagation();
  openStore();
});
const splash = document.createElement('div');
splash.className = 'ad-splash';
splash.innerHTML = `<img alt="" src="${__ICON__}"><span><i></i><i></i><i></i></span>`;
document.body.appendChild(splash);
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
  cashBox.style.setProperty('--bump', (1 + Math.sin(bumpT * Math.PI) * 0.12).toFixed(3));
}
/** The goal line under the money: one instruction (tutorial) or the next upgrade with a progress bar (play). */
let goalKey = '';
function setGoal(icon: IconName | null, text: string, progress = -1): void {
  const key = `${icon}|${text}|${progress >= 0}`;
  goalBox.classList.toggle('bar', progress >= 0);
  goalBox.classList.toggle('full', progress >= 1);
  if (progress >= 0) goalFill.style.transform = `scaleX(${Math.min(1, progress).toFixed(3)})`;
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

// The instruction pill: what to do now, in two or three big words with its icon, just under the top bar.
const hintBox = ui.querySelector('.ad-hint') as HTMLElement;
const hintIcon = (hintBox.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
const hintText = hintBox.querySelector('span') as HTMLElement;
let hintKey = '';
function setHint(t: { icon: IconName; text: string } | null): void {
  // One message at a time: while a caption shows (or fades), the instruction waits.
  if (showing || messageTime > 0 || messages.length > 0) t = null;
  const key = t ? `${t.icon}|${t.text}` : '';
  if (key === hintKey) return;
  hintKey = key;
  if (!t) {
    hintBox.classList.remove('on');
    return;
  }
  hintIcon.clearRect(0, 0, 112, 112);
  drawIcon(hintIcon, t.icon, 56, 56, 84);
  hintText.textContent = t.text;
  hintBox.classList.toggle('icon-only', !t.text);
  hintBox.classList.remove('on');
  void hintBox.offsetWidth;
  hintBox.classList.add('on');
}

// ================================================================ captions: ONE channel, one message at a time
/**
 * Every caption goes through here. An important one (an upgrade, a class, the end of the tutorial) waits its turn;
 * a small one (praise, a combo) is shown only if nothing else is showing or waiting, otherwise dropped. Each shows,
 * fades out, and only then the next comes in. The same message twice is dropped.
 */
interface Message { title: string; sub: string; small: boolean; card?: { tier: number } }
const messages: Message[] = [];
let messageTime = 0;
let showing: Message | null = null;
function say(title: string, sub = '', card?: { tier: number }): void {
  if (showing?.title === title || messages.some((m) => m.title === title)) return;
  // A small message waiting gives way to an important one.
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].small) messages.splice(i, 1);
  if (messages.length >= 2) messages.shift();
  messages.push({ title, sub, small: false, card });
}
function sayLittle(title: string): void {
  if (showing || messages.length > 0 || messageTime > 0) return;
  messages.push({ title, sub: '', small: true });
}
function updateMessages(dt: number): void {
  if (showing) {
    messageTime -= dt;
    if (messageTime > 0) return;
    banner.classList.remove('on');
    classBox.classList.remove('on');
    showing = null;
    // A breath between messages: each fades out before the next comes in.
    messageTime = 0.35;
    return;
  }
  if (messageTime > 0) {
    messageTime -= dt;
    return;
  }
  const m = messages.shift();
  if (!m) return;
  showing = m;
  if (m.card) {
    const cls = classOfTier(m.card.tier);
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
    (classBox.querySelector('b') as HTMLElement).textContent = m.title;
    (classBox.querySelector('.ad-stars') as HTMLElement).textContent = '★'.repeat(m.card.tier);
    (classBox.querySelector('i') as HTMLElement).textContent = m.sub;
    (classBox.querySelector('.ad-class-card') as HTMLElement).style.setProperty('--cls', cls.color);
    classBox.classList.remove('on');
    void classBox.offsetWidth;
    classBox.classList.add('on');
    messageTime = TUNE.classCard;
  } else {
    banner.innerHTML = `<b>${m.title}</b>${m.sub ? `<i>${m.sub}</i>` : ''}`;
    banner.classList.toggle('small', m.small);
    banner.classList.remove('on');
    void banner.offsetWidth;
    banner.classList.add('on');
    messageTime = m.small ? TUNE.small : TUNE.caption;
  }
  banner.style.setProperty('--life', `${messageTime}s`);
}

const proj = { x: 0, y: 0 };
const tmpV = new THREE.Vector3();
/** A small float over the world (+$, a guest's reaction, a combo): local to where it happened, never at the top. */
function floatText(text: string, x: number, y: number, z: number, style = ''): void {
  tmpV.set(x, y, z);
  if (!stage.project(tmpV, proj)) return;
  // A float never lands on another float or on the HUD: it steps up until it is clear, or is dropped.
  const w = 110;
  const h = 40;
  let top = proj.y;
  let r = { x0: proj.x - w / 2, y0: top - h, x1: proj.x + w / 2, y1: top };
  for (let tries = 0; tries < 4 && (floats.some((f) => f.until > clock && overlaps(f.rect, r)) || hudRects().some((b) => overlaps(b, r))); tries++) {
    top -= h + 6;
    r = { x0: proj.x - w / 2, y0: top - h, x1: proj.x + w / 2, y1: top };
  }
  if (floats.some((f) => f.until > clock && overlaps(f.rect, r)) || hudRects().some((b) => overlaps(b, r))) return;
  floats.push({ rect: r, until: clock + 1.1 });
  if (floats.length > 12) floats.shift();
  const el = document.createElement('div');
  el.className = style ? `ad-float ${style}` : 'ad-float';
  el.innerHTML = text;
  el.style.left = `${proj.x}px`;
  el.style.top = `${top}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
interface ScreenRect { x0: number; y0: number; x1: number; y1: number }
const floats: { rect: ScreenRect; until: number }[] = [];
const overlaps = (a: ScreenRect, b: ScreenRect, pad = 6): boolean => a.x0 - pad < b.x1 && b.x0 - pad < a.x1 && a.y0 - pad < b.y1 && b.y0 - pad < a.y1;
/** The HUD's boxes on screen right now (the money, the goal bar, the instruction, a caption, the corner buttons). */
const HUD_SELECTOR = '.ad-cash, .ad-goal.on, .ad-hint.on, .ad-banner.on, .ad-class.on .ad-class-card, .ad-mute, .ad-install, .ad-icon';
let hudCache: ScreenRect[] = [];
let hudAt = -1;
function hudRects(): ScreenRect[] {
  if (hudAt === clock) return hudCache;
  hudAt = clock;
  hudCache = [];
  for (const el of document.querySelectorAll(HUD_SELECTOR)) {
    const b = (el as HTMLElement).getBoundingClientRect();
    if (b.width > 0 && b.height > 0) hudCache.push({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });
  }
  return hudCache;
}
/** A step done: a word of praise (through the caption channel), stars and sparkles over the conductor. */
const PRAISE = ['NICE!', 'GREAT!', 'AWESOME!', 'PERFECT!'];
let praiseN = 0;
function praise(): void {
  sayLittle(PRAISE[praiseN++ % PRAISE.length]);
  particles.emit('star', me.x, FLOOR_Y + 1.6, me.z, 10, 0.35);
  particles.emit('sparkle', me.x, FLOOR_Y + 1.2, me.z, 14, 0.4);
}

// ================================================================ thought bubbles: a face and what they want, centred over the head
type Mood = 'wait' | 'angry' | 'love' | 'none';
const EMOJI: Record<Exclude<Mood, 'none'>, string> = { wait: '🙂', angry: '😠', love: '😍' };
const ITEM_ICON: Record<string, IconName> = {
  tea: 'tea', coffee: 'coffee', blanket: 'blanket', towel: 'towel', luggage: 'luggage', latte: 'latte', pastry: 'pastry', popcorn: 'popcorn', room: 'bed',
};
/** Plain words for the hint line ("Get tea", "Bring the bag"). */
const ITEM_WORD: Record<string, string> = {
  tea: 'tea', coffee: 'coffee', blanket: 'a blanket', towel: 'a towel', luggage: 'the bag', latte: 'a latte', pastry: 'a croissant', popcorn: 'popcorn',
};
const REACTION: Partial<Record<ItemKind, string>> = { tea: '😊', coffee: '😊', blanket: '🥰', towel: '😌', luggage: '🤩', latte: '😋', pastry: '😋', popcorn: '🍿' };
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
  ctx.lineJoin = 'round';
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
  /** Hidden this frame by the label pass (it would overlap something more important). */
  suppressed = false;
  constructor(readonly size = 0.95) {
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
  get shown(): boolean {
    return this.key !== '';
  }
  update(dt: number, x: number, y: number, z: number): void {
    this.sprite.visible = this.key !== '' && !this.suppressed;
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
const cabinOf = (r: Room): CabinLayout => train[r.car].view.layout.cabins[r.cabin];
const roomZ = (r: Room): number => carriageOriginZ(r.car);
const sitSpot = (r: Room) => ({ x: cabinOf(r).bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: cabinOf(r).bedPose.z + roomZ(r), facing: -Math.PI / 2 });
const lieSpot = (r: Room) => ({ x: cabinOf(r).bedPose.x, y: FLOOR_Y + BED_TOP, z: cabinOf(r).bedPose.z + roomZ(r), facing: 0 });
const roomCentre = (r: Room): Vec2 => walkableNear(cabinOf(r).center.x, cabinOf(r).center.z + roomZ(r));
function makeRooms(car: number): Room[] {
  return train[car].view.layout.cabins.map((_c, i) => ({ car, cabin: i, guest: null }));
}
rooms = makeRooms(SLOT.lobby);
/** The first free room. */
const freeRoom = (): Room | null => rooms.find((r) => !r.guest) ?? null;

// ================================================================ people
type Pose = 'stand' | 'sit' | 'sleep';
type GuestState = 'away' | 'toDesk' | 'queue' | 'toRoom' | 'room' | 'toVenue' | 'venue' | 'back';
type Venue = 'cafe' | 'cinema';
const RADIUS = 0.3;
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
function turnToward(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
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
let lookSeq = 0;
function guestLook(): CharacterLook {
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[(lookSeq++ * 5) % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
class Guest extends Walker {
  state: GuestState = 'away';
  look: CharacterLook = guestLook();
  room: Room | null = null;
  seat: VenueSeatLayout | null = null;
  venue: Venue | null = null;
  order: Order | null = null;
  /** Something is on its way to them right now (the item in the air): nothing new is asked until it lands. */
  receiving = false;
  happyUntil = -1;
  /** Not before this time will they want anything again. */
  restUntil = 0;
  /** What they have asked for already (each thing once; drinks and visits come round again). */
  readonly had = new Set<ItemKind>();
  update(dt: number): void {
    if (this.state === 'away') return;
    this.move(dt);
    if (this.order) {
      const long = clock - this.order.since > TUNE.patience;
      if (long && this.bubble.mood !== 'angry') sfx('grumble');
      this.bubble.set(long ? 'angry' : 'wait', this.order.item);
    } else this.bubble.set(clock < this.happyUntil ? 'love' : 'none');
    const head = this.pose === 'sit' ? 1.5 : this.pose === 'sleep' ? 0.85 : 1.98;
    this.bubble.update(dt, this.x, this.y + head, this.z);
    if (clock < this.happyUntil && Math.random() < dt * 1.5) particles.emit('heart', this.x, this.y + head, this.z, 1, 0.15);
  }
}
// The passengers: three, aboard for the whole night. Each walks into the reception from the front of the carriage
// (from the seated coaches up front) when it is their turn, slowly and in view, and goes to the desk.
const L = views.lobby[0].layout.anchors;
const QUEUE_SPOT: Vec2 = { x: views.lobby[0].layout.queue[0].x, z: views.lobby[0].layout.queue[0].z };
const ENTRANCE: Vec2 = walkableNear(0.25, 1.0);
const guests: Guest[] = [];
for (let i = 0; i < 3; i++) {
  const g = new Guest(guestLook(), ENTRANCE.x, ENTRANCE.z);
  g.view.park();
  guests.push(g);
}
/** The next passenger comes in and walks to the desk. */
function callNext(): Guest | null {
  const g = guests.find((x) => x.state === 'away');
  if (!g) return null;
  g.view.reset(g.look, 1.04);
  scene.add(g.view.root);
  g.state = 'toDesk';
  g.walkSpeed = TUNE.pace.enterSpeed;
  g.setPose('stand', { x: ENTRANCE.x, y: FLOOR_Y, z: ENTRANCE.z, facing: 0 });
  g.walkTo(route(ENTRANCE, QUEUE_SPOT), () => {
    g.state = 'queue';
    g.facing = -Math.PI / 2;
    g.walkSpeed = TUNE.guestSpeed;
  });
  sfx('door');
  return g;
}
/** The passenger at the desk, ready to check in. */
const atDesk = (): Guest | null => guests.find((g) => g.state === 'queue') ?? null;

/** Check-in: the ticket is checked, the key handed over, and off they go to their room. */
function checkIn(g: Guest, room: Room): void {
  room.guest = g;
  g.room = room;
  g.state = 'toRoom';
  sfx('ding');
  keyPop(g);
  const sit = sitSpot(room);
  later(0.3, () => g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
    g.restUntil = clock + TUNE.pace.requestDelay;
    sfx('door');
  }));
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

/**
 * What a guest in their room asks for next, through the night: a blanket once, a towel once in Comfort, then a hot
 * drink (tea, or coffee in Business) when they wake. Their bag was asked for at check-in.
 */
function nextWish(g: Guest): ItemKind {
  const tier = g.room ? train[g.room.car].tier : 1;
  if (!g.had.has('luggage')) return 'luggage';
  if (!g.had.has('blanket')) return 'blanket';
  if (tier >= TIER.comfort && !g.had.has('towel')) return 'towel';
  return tier >= TIER.business && Math.random() < 0.5 ? 'coffee' : 'tea';
}
function ask(g: Guest, item: ItemKind, bills: number): void {
  g.order = { item, since: clock, bills, claimed: false };
  g.had.add(item);
  if (g.pose === 'sleep' && g.room) g.setPose('sit', sitSpot(g.room));
  g.view.act('wave', 0.8);
  sfx('bloop');
}
const roomBills = (g: Guest): number => TUNE.deliver[g.room ? train[g.room.car].tier : 1];
/** In their room, nothing asked, nothing on its way, rested. */
const ready = (g: Guest): boolean => g.state === 'room' && !g.order && !g.receiving && !g.walking && clock > g.restUntil;

// ================================================================ the café and the theatre: guests visit, then go back to bed
let cafeTier = 0;
let theatreOpen = false;
let filmT = -1;
const venueSlot = (v: Venue): number => (v === 'cafe' ? SLOT.cafe : SLOT.cinema);
function tryOuting(g: Guest, venue: Venue): boolean {
  if (venue === 'cafe' ? !cafeTier : !theatreOpen || filmT >= 0) return false;
  const view = train[venueSlot(venue)].view;
  const z0 = carriageOriginZ(venueSlot(venue));
  const taken = new Set(guests.map((x) => x.seat));
  const seat = view.layout.venue!.seats.filter((s, i) => !taken.has(s) && (venue === 'cinema' || i % 2 === 0))[0];
  if (!seat) return false;
  g.seat = seat;
  g.venue = venue;
  g.state = 'toVenue';
  const sitAt = { x: seat.sit.x, y: FLOOR_Y + seat.top - 0.24, z: seat.sit.z + z0, facing: seat.facing };
  const near = walkableNear(seat.serve ? seat.serve.x : seat.sit.x, seat.sit.z + z0);
  g.walkTo(route({ x: g.x, z: g.z }, near, map.nodeId(venueSlot(venue), seat.node)), () => {
    g.setPose('sit', sitAt);
    g.state = 'venue';
    if (venue === 'cafe') {
      g.order = { item: Math.random() < 0.6 ? 'latte' : 'pastry', since: clock, bills: TUNE.cafe[cafeTier], claimed: false };
      g.view.act('wave', 0.8);
      sfx('bloop');
    } else if (Math.random() < 0.4 && filmT < 0) later(1, () => g.state === 'venue' && !g.order && filmT < 0 && ask(g, 'popcorn', TUNE.cafe[1]));
  });
  return true;
}
function goBack(g: Guest): void {
  g.seat = null;
  g.venue = null;
  const room = g.room!;
  g.state = 'back';
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
    g.restUntil = clock + TUNE.rest[0];
  });
}
const audience = (): Guest[] => guests.filter((g) => g.venue === 'cinema' && g.state === 'venue');
function startFilm(): void {
  filmT = 0;
  views.cinema.setVenueFilm(0);
  for (const g of audience()) g.order = null;
  sfx('chime');
  say('NOW SHOWING!', 'Every seat pays');
}
function endFilm(): void {
  filmT = -1;
  views.cinema.setVenueFilm(-1);
  audience().forEach((g, i) => later(i * 0.25, () => {
    g.happyUntil = clock + 2.5;
    payPile(g, TUNE.ticket, '🍿');
    later(1.4, () => g.state === 'venue' && goBack(g));
  }));
  sfx('perfect');
  if (teach === 'cinema') teach = null;
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
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
  flow.done('pick');
}
let served = 0;
let combo = 0;
let lastServe = -99;
/**
 * Hands an order over (the conductor's or an Attendant's). The order is closed at once and the guest marked as
 * receiving, so nothing can ask for or bring it again while the item is in the air; the guest pays when it lands.
 */
function handOver(g: Guest, order: Order, mesh: THREE.Object3D, byPlayer: boolean): void {
  if (g.order !== order) {
    scene.remove(mesh);
    return;
  }
  g.order = null;
  g.receiving = true;
  flying.push({
    mesh, from: mesh.position.clone(), to: () => tmpTo.set(g.x, g.y + (g.pose === 'stand' ? 1.05 : 0.9), g.z), t: 0, dur: TUNE.handOver,
    done: () => {
      scene.remove(mesh);
      g.receiving = false;
      g.happyUntil = clock + 2.4;
      g.view.act(['tea', 'latte'].includes(order.item) ? 'sip' : 'hug', 2);
      g.view.bounce(1);
      deliverSound();
      particles.emit('heart', g.x, g.y + 1.6, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 10, 0.3);
      let bills = order.bills;
      if (byPlayer && flow.phase === 'play') {
        // Serving one after another builds a combo; from x3 each serve pays a bonus bill.
        combo = clock - lastServe < TUNE.comboWindow ? combo + 1 : 1;
        lastServe = clock;
        if (combo >= 3) bills++;
        if (combo >= 2) sayLittle(`COMBO x${combo}!`);
      }
      // Their reaction and what they pay, in one float over them; the cash lands in a little pile beside them.
      payPile(g, bills, REACTION[order.item] ?? '😍');
      served++;
      g.restUntil = clock + TUNE.rest[0] + Math.random() * (TUNE.rest[1] - TUNE.rest[0]);
      flow.done('deliver');
      if (teach === 'cafe' && (order.item === 'latte' || order.item === 'pastry')) teach = null;
      if (g.state === 'room' && g.room) {
        const r = g.room;
        later(2.2, () => !g.order && g.state === 'room' && g.room === r && g.setPose('sleep', lieSpot(r), train[r.car].view.blanketColor));
      } else if (g.state === 'venue' && g.venue === 'cafe') later(2.2, () => g.state === 'venue' && goBack(g));
    },
  });
}
function serve(g: Guest): void {
  const order = g.order!;
  const i = carried.findIndex((c) => c.item === order.item);
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  handOver(g, order, mesh, true);
}

// ================================================================ cash: piles where guests pay, the bills on the back
const piles = new Map<string, Vec2>();
/** Piles being scooped right now, and until when (each streams onto the back once; a scoop never blocks for long). */
const scooping = new Map<string, number>();
const isScooping = (id: string): boolean => (scooping.get(id) ?? -1) > clock;
function pileFor(g: Guest): { id: string; at: Vec2 } {
  if (g.state === 'venue' && g.seat && g.venue) {
    const z0 = carriageOriginZ(venueSlot(g.venue));
    return { id: `seat:${g.venue}:${g.seat.sit.x.toFixed(2)}:${g.seat.sit.z.toFixed(2)}`, at: walkableNear(g.seat.serve ? g.seat.serve.x : g.seat.sit.x, g.seat.sit.z + z0) };
  }
  const r = g.room!;
  return { id: `room:${r.car}:${train[r.car].tier}:${r.cabin}`, at: roomCentre(r) };
}
function payPile(g: Guest, bills: number, reaction = ''): void {
  const { id, at } = pileFor(g);
  if (!piles.has(id)) {
    piles.set(id, at);
    cash.createPile(id, at.x, FLOOR_Y + 0.02, at.z);
  }
  floatText(`${reaction ? `<i>${reaction}</i>` : ''}<b>+$${bills * TUNE.bill}</b>`, g.x, g.y + (g.pose === 'stand' ? 2.2 : 1.8), g.z, 'pay');
  cash.flyToPile(id, new THREE.Vector3(g.x, g.y + 1.0, g.z), bills);
}
function landBill(): void {
  backCount++;
  money += TUNE.bill;
  backBounce = 1;
  bumpT = 1;
  coinSound();
}
/** Walk over a pile and it streams onto the conductor's back. */
function updatePiles(): void {
  for (const [id, at] of piles) {
    const n = cash.pileCount(id);
    if (n <= 0 || isScooping(id) || Math.hypot(at.x - me.x, at.z - me.z) > TUNE.scoopReach) continue;
    scooping.set(id, clock + 3);
    particles.emit('sparkle', at.x, FLOOR_Y + 0.4, at.z, 10, 0.4);
    const finish = (): void => {
      scooping.delete(id);
      flow.done('cash');
    };
    cash.vacuum(id, backTopPos, landBill, finish);
  }
}
/** The nearest pile with cash in it. */
function nearestPile(): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = 1e9;
  for (const [id, at] of piles) {
    if (cash.pileCount(id) <= 0 || isScooping(id)) continue;
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

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

// ================================================================ stations: the desk, the tea, the linen, the bags, the café
interface Station { kind: 'desk' | 'source' | 'film'; items: ItemKind[]; car: number; x: number; z: number; marker: JobMarker; progress: number; icon: IconName; sign: THREE.Vector3; wanted: boolean }
const stations: Station[] = [];
function addStation(kind: Station['kind'], items: ItemKind[], car: number, local: Vec2, icon: IconName, badgeOver?: Vec2): Station {
  const z0 = carriageOriginZ(car);
  const p = walkableNear(local.x, local.z + z0);
  const marker = new JobMarker(icon);
  marker.setPosition(p.x, p.z);
  const sign = new THREE.Vector3(p.x, FLOOR_Y + marker.height, p.z);
  if (badgeOver) {
    marker.setIconAnchor(badgeOver.x - p.x, badgeOver.z + z0 - p.z, 1.6);
    sign.set(badgeOver.x, FLOOR_Y + 1.6, badgeOver.z + z0);
  } else {
    const anchor = map.serviceAnchor(p.x, p.z, 1.3);
    if (anchor) {
      marker.setIconAnchor(anchor.x - p.x, anchor.z - p.z, anchor.height + 0.6);
      sign.set(anchor.x, FLOOR_Y + anchor.height + 0.6, anchor.z);
    }
  }
  marker.visible = false;
  scene.add(marker.group);
  const s: Station = { kind, items, car, x: p.x, z: p.z, marker, progress: 0, icon, sign, wanted: false };
  stations.push(s);
  return s;
}
const desk = addStation('desk', [], SLOT.lobby, L.deskService, 'key', { x: -1.17, z: 3.4 });
addStation('source', ['tea', 'coffee'], SLOT.lobby, L.urn, 'tea');
addStation('source', ['blanket', 'towel'], SLOT.lobby, L.linen, 'blanket');
addStation('source', ['luggage'], SLOT.lobby, L.rack, 'luggage');

/** How many of an item are asked for and not yet in hand (or on an Attendant's way). */
function needed(item: ItemKind): number {
  return guests.filter((g) => g.order?.item === item && !g.order.claimed).length - carried.filter((c) => c.item === item).length;
}
function approach(g: Guest): Vec2 {
  if (g.room && g.state === 'room') return roomCentre(g.room);
  return walkableNear(g.x + (g.x > -0.6 ? -0.8 : 0.8), g.z);
}
/** Where an item comes from for a guest: the cupboard of their own carriage (or the nearest one). */
function sourceFor(item: ItemKind, near?: Vec2): Station | null {
  let best: Station | null = null;
  let bestD = 1e9;
  for (const s of stations) {
    if (s.kind !== 'source' || !s.items.includes(item)) continue;
    const d = near ? Math.abs(s.z - near.z) : Math.hypot(s.x - me.x, s.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

// ================================================================ the Attendants: they take the room deliveries over
const ATTENDANT_HOME = (): Vec2 => walkableNear(L.home_attendant.x, L.home_attendant.z);
const CAFE_HOME = (): Vec2 => walkableNear(-1.0, carriageOriginZ(SLOT.cafe) + 16.2);
interface Helper { w: Walker; items: ItemKind[]; task: Guest | null; order: Order | null; carrying: THREE.Mesh | null; phase: 'idle' | 'toSource' | 'pick' | 'toGuest'; t: number }
const helpers: Helper[] = [];
let helperSpeed = TUNE.attendantSpeed;
const ROOM_ITEMS: ItemKind[] = ['tea', 'coffee', 'blanket', 'towel', 'luggage'];
const VENUE_ITEMS: ItemKind[] = ['latte', 'pastry', 'popcorn'];
function hireAttendant(items: ItemKind[], home: Vec2): void {
  const w = new Walker(STAFF_LOOKS.attendant, home.x, home.z);
  w.walkSpeed = helperSpeed;
  helpers.push({ w, items, task: null, order: null, carrying: null, phase: 'idle', t: 0 });
  particles.emit('confetti', w.x, FLOOR_Y + 1.5, w.z, 40, 0.6);
  sfx('staff');
}
function updateHelpers(dt: number): void {
  for (const h of helpers) {
    h.w.walkSpeed = helperSpeed;
    h.w.move(dt);
    if (h.phase === 'idle') {
      // The oldest request of her kind nobody is bringing.
      const g = guests.filter((x) => x.order && h.items.includes(x.order.item) && !x.order.claimed && (x.state === 'room' || x.state === 'venue') && needed(x.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since)[0];
      if (!g) {
        if (!h.w.walking) {
          const home = h.items === VENUE_ITEMS ? CAFE_HOME() : ATTENDANT_HOME();
          if (Math.hypot(h.w.x - home.x, h.w.z - home.z) > 1.2) h.w.walkTo(route(h.w, home));
        }
        continue;
      }
      const src = sourceFor(g.order!.item, g);
      if (!src) continue;
      g.order!.claimed = true;
      h.task = g;
      h.order = g.order;
      h.phase = 'toSource';
      h.w.walkTo(route(h.w, src), () => {
        h.phase = 'pick';
        h.t = TUNE.attendantPick;
      });
    } else if (h.phase === 'pick') {
      h.t -= dt;
      h.w.view.setCarrying(true);
      if (h.t > 0) continue;
      const g = h.task!;
      const order = h.order!;
      if (g.order !== order) {
        h.phase = 'idle';
        h.w.view.setCarrying(false);
        continue;
      }
      const mesh = createItemMesh(order.item);
      scene.add(mesh);
      h.carrying = mesh;
      h.phase = 'toGuest';
      h.w.walkTo(route(h.w, approach(g)), () => {
        if (h.carrying) handOver(g, order, h.carrying, false);
        h.carrying = null;
        h.task = null;
        h.order = null;
        h.phase = 'idle';
        h.w.view.setCarrying(false);
      });
    }
    if (h.carrying) h.carrying.position.set(h.w.x + Math.sin(h.w.facing) * 0.35, FLOOR_Y + 0.85, h.w.z + Math.cos(h.w.facing) * 0.35);
  }
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
  particles.emit('sparkle', p.x, FLOOR_Y + 0.3, p.z, 24, 0.5);
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
        particles.emit('sparkle', t.x, FLOOR_Y + 0.4, t.z, 40, 0.7);
        particles.emit('star', t.x, FLOOR_Y + 0.6, t.z, 16, 0.5);
        particles.emit('confetti', t.x, FLOOR_Y + 1.2, t.z, 30, 0.6);
        stage.rig.punch(0.06);
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
interface Upgrade { at: () => Vec2; icon: IconName; name: string; price: number; buy: () => void }
const cz = (): number => carriageOriginZ(SLOT.cafe);
const PLAN: Upgrade[] = [
  { at: () => ({ x: REAR_TILE_X, z: REAR_TILE_Z }), icon: 'latte', name: 'Café Car', price: TUNE.price.cafe, buy: buyCafe },
  { at: () => ({ x: 0.1, z: 7.2 }), icon: 'star', name: 'Comfort Class', price: TUNE.price.comfort, buy: () => classUp(TIER.comfort) },
  { at: () => ({ x: 0.1, z: 7.2 }), icon: 'person', name: 'Attendant', price: TUNE.price.attendant, buy: () => {
    hireAttendant(ROOM_ITEMS, ATTENDANT_HOME());
    say('ATTENDANT HIRED!', 'She brings the guests what they ask for');
  } },
  { at: () => ({ x: REAR_TILE_X, z: cz() + REAR_TILE_Z }), icon: 'film', name: 'Theatre Car', price: TUNE.price.theatre, buy: buyTheatre },
  { at: () => ({ x: 0.1, z: 7.2 }), icon: 'person', name: 'Faster Attendant', price: TUNE.price.fast, buy: () => {
    helperSpeed = TUNE.attendantSpeed * TUNE.attendantFast;
    for (const h of helpers) particles.emit('confetti', h.w.x, FLOOR_Y + 1.5, h.w.z, 30, 0.6);
    sfx('staff');
    say('FASTER ATTENDANT!', 'Deliveries in half the time');
  } },
  { at: () => ({ x: 0.1, z: 7.2 }), icon: 'star', name: 'Business Class', price: TUNE.price.business, buy: () => classUp(TIER.business) },
  { at: () => ({ x: 0, z: cz() + 10.4 }), icon: 'person', name: '2nd Attendant', price: TUNE.price.second, buy: () => {
    hireAttendant(VENUE_ITEMS, CAFE_HOME());
    say('2ND ATTENDANT!', 'She serves the café and the theatre');
  } },
  { at: () => ({ x: 0, z: cz() + 10.4 }), icon: 'latte', name: 'Café Makeover', price: TUNE.price.makeover, buy: cafeMakeover },
];
let planIndex = 0;
let finalGoal = false;
const nextPlan = (): Upgrade | null => PLAN[planIndex] ?? null;
/** The next upgrade's tile comes out once it is affordable (cash carried plus cash waiting in piles) and the flow allows. */
function revealUpgrade(): void {
  const next = nextPlan();
  if (!next || tile || !flow.allows('upgrade')) return;
  let waiting = 0;
  for (const id of piles.keys()) waiting += cash.pileCount(id);
  if (money + waiting * TUNE.bill < next.price) return;
  planIndex++;
  const at = next.at();
  showTile(at, next.icon, next.name, next.price, () => {
    upgradeSound();
    next.buy();
    if (!nextPlan()) later(1.5, () => (finalGoal = true));
  });
  say('NEW UPGRADE!', next.name);
}

/** A new carriage: it rolls in from behind under a tarp, couples with a clunk, the tarp comes off, the blinds go up. */
const rolling: { group: THREE.Object3D; t: number; z: number; done: () => void }[] = [];
const tarps: { view: CarriageView; mesh: THREE.Mesh; t: number; ropes: number; z: number }[] = [];
let growing = 0;
function couple(view: CarriageView, type: CarriageType, tier: number, onRevealed: () => void): void {
  growing++;
  train.push({ type, tier, view });
  rebuildTrain();
  const z = carriageOriginZ(view.index);
  view.group.visible = true;
  view.setCarriageCovered(true);
  view.setAllBlinds(1);
  view.group.position.z = z + 26;
  sfx('whoosh');
  speedNow *= TUNE.speedUp;
  rolling.push({
    group: view.group, t: 0, z,
    done: () => {
      sfx('clunk');
      if (flow.allows('camera')) stage.rig.shake(0.08, 0.25);
      burstAlong(z - 0.6, z + 1.2, 'dust', 22);
      later(0.5, () => {
        const tarp = view.takeCarriageCover();
        if (tarp) tarps.push({ view, mesh: tarp, t: 0, ropes: 0, z });
        sfx('whoosh');
        later(2.2, () => {
          sfx('reveal');
          burstAlong(z, z + CARRIAGE_LENGTH, 'confetti', 50);
          growing--;
          onRevealed();
        });
      });
    },
  });
}
function updateTarps(dt: number): void {
  for (let i = tarps.length - 1; i >= 0; i--) {
    const tp = tarps[i];
    tp.t += dt / 2.5;
    const k = Math.min(1, tp.t);
    const ropes = Math.min(TARP_TIE_Z.length, Math.max(0, Math.floor((k - 0.04) / 0.045)));
    while (tp.ropes < ropes) {
      particles.emit('dust', 0, FLOOR_Y + 2.3, tp.z + TARP_TIE_Z[tp.ropes], 8, 0.4);
      sfx('pop', 0.8 + tp.ropes * 0.08);
      tp.ropes++;
    }
    deformTarp(tp.mesh, k, tp.ropes);
    tp.view.setBlindSweep(Math.max(0, Math.min(1, (k - 0.55) / 0.45)));
    if (k >= 1) {
      tp.mesh.parent?.remove(tp.mesh);
      tp.mesh.geometry.dispose();
      tp.view.setAllBlinds(0);
      tp.view.setBlindSweep(null);
      tarps.splice(i, 1);
    }
  }
}
function burstAlong(z0: number, z1: number, kind: 'confetti' | 'dust' | 'sparkle' | 'star', count: number): void {
  for (let i = 0; i < count; i++) particles.emit(kind, (Math.random() - 0.5) * 4, FLOOR_Y + 0.5 + Math.random() * 0.9, z0 + ((i + 0.5) / count) * (z1 - z0), 1, 0.25);
}
function buyCafe(): void {
  couple(views.cafe[0], 'cafe', 1, () => {
    cafeTier = 1;
    const v = views.cafe[0].layout.venue!;
    addStation('source', ['latte'], SLOT.cafe, v.stations[0].pad, 'latte');
    addStation('source', ['pastry'], SLOT.cafe, v.stations[1].pad, 'pastry');
    say('CAFÉ CAR!', 'Guests come for coffee & croissants');
    teach = 'cafe';
  });
}
let projector: Station | null = null;
function buyTheatre(): void {
  couple(views.cinema, 'cinema', CINEMA_TIER, () => {
    theatreOpen = true;
    const v = views.cinema.layout.venue!;
    addStation('source', ['popcorn'], SLOT.cinema, v.stations[0].pad, 'popcorn');
    projector = addStation('film', [], SLOT.cinema, v.projector!, 'film');
    say('THEATRE CAR!', 'Start the movie · every seat pays');
    teach = 'cinema';
  });
}

// ================================================================ class refits and the café's makeover (the game's makeover wipe)
/** A class refit: the makeover sweeps down the lobby; the guests stay in their rooms, now dressed for the new class. */
function classUp(tier: number): void {
  growing++;
  refitCar(SLOT.lobby, views.lobby[tier - 1], tier);
  later(1.8, () => {
    growing--;
    say(`${classOfTier(tier).name.toUpperCase()} CLASS`, `Every request pays $${TUNE.deliver[tier] * TUNE.bill}`, { tier });
  });
  speedNow *= TUNE.speedUp;
}
function refitCar(slot: number, next: CarriageView, tier: number): void {
  const old = train[slot].view;
  train[slot] = { type: train[slot].type, tier, view: next };
  const oldRooms = rooms.filter((r) => r.car === slot);
  const fresh = makeRooms(slot);
  rooms = rooms.filter((r) => r.car !== slot).concat(fresh);
  rebuildTrain();
  for (const g of guests) {
    if (!g.room || !oldRooms.includes(g.room)) continue;
    const r = fresh[g.room.cabin] ?? rooms.find((x) => !x.guest);
    if (!r) continue;
    r.guest = g;
    g.room = r;
    if (g.state === 'room') {
      g.path = [];
      g.setPose(g.pose === 'sleep' ? 'sleep' : 'sit', g.pose === 'sleep' ? lieSpot(r) : sitSpot(r), next.blanketColor);
      g.happyUntil = clock + 2.5;
    }
  }
  // Cash left in the old rooms' piles comes straight to the conductor.
  for (const [id] of piles) if (id.startsWith(`room:${slot}:`) && cash.pileCount(id) > 0) cash.vacuum(id, backTopPos, landBill);
  makeover(old, next);
}
function cafeMakeover(): void {
  growing++;
  cafeTier = 2;
  const old = train[SLOT.cafe].view;
  const next = views.cafe[1];
  train[SLOT.cafe] = { type: 'cafe', tier: 2, view: next };
  rebuildTrain();
  makeover(old, next);
  later(1.8, () => {
    growing--;
    say('CAFÉ MAKEOVER!', `Every order pays $${TUNE.cafe[2] * TUNE.bill}`);
  });
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

// ================================================================ THE FLOW: one controller decides what may happen
/**
 * Every system asks `flow.allows(...)` before it shows or starts anything. The tutorial is a fixed script of steps;
 * each step waits for its own event (`flow.done(...)`) and only then the next one shows. Play begins only after it.
 */
type Phase = 'tutorial' | 'play' | 'end';
type FlowEvent = 'checkin' | 'room' | 'pick' | 'deliver' | 'cash';
/**
 * Each tutorial guest, alone: they walk in → check them in → they go to their room (and ask, a moment later) → get
 * what they asked for → bring it → collect the cash. The next guest walks in only after a short "Done!" pause.
 */
const TUTORIAL: { id: string; wait: FlowEvent | null }[] = [
  { id: 'come', wait: null },
  { id: 'checkin', wait: 'checkin' },
  { id: 'room', wait: 'room' },
  { id: 'get', wait: 'pick' },
  { id: 'bring', wait: 'deliver' },
  { id: 'cash', wait: 'cash' },
];
/** Each tutorial guest's one wish: three wishes, three supply spots learnt. */
const TUTORIAL_WISH: ItemKind[] = ['luggage', 'blanket', 'tea'];
let teach: 'cafe' | 'cinema' | null = null;
const flow = {
  phase: 'tutorial' as Phase,
  /** Tutorial: which guest (0, 1, 2) and which step. Guest 1 gets the most help, guest 3 the least. */
  passenger: 0,
  step: 0,
  /** Nothing new is shown before this time (the breath after a step, the pause between guests). */
  readyAt: 0,
  /** Is this allowed right now? */
  allows(what: 'request' | 'upgrade' | 'camera'): boolean {
    if (this.phase !== 'play') return false;
    // A carriage rolling in, a makeover sweeping: nothing new starts until it is over.
    if (what === 'upgrade' && (growing > 0 || wipes.length > 0)) return false;
    return true;
  },
  get stepId(): string {
    return TUTORIAL[this.step]?.id ?? '';
  },
  get guest(): Guest {
    return guests[this.passenger];
  },
  get resting(): boolean {
    return clock < this.readyAt;
  },
  /** Something happened; the tutorial moves on only when it is what the current step waits for. */
  done(event: FlowEvent): void {
    if (this.phase !== 'tutorial' || TUTORIAL[this.step]?.wait !== event) return;
    this.step++;
    this.readyAt = clock + TUNE.pace.stepPause;
    if (event !== 'room') praise();
    if (this.step < TUTORIAL.length) return;
    // This guest is looked after: a little "Done!", a pause, then the next one walks in.
    later(0.5, () => say('DONE!'));
    particles.emit('confetti', me.x, FLOOR_Y + 1.6, me.z, 30, 0.5);
    this.readyAt = clock + TUNE.pace.guestPause;
    if (this.passenger < 2) {
      this.passenger++;
      this.step = 0;
      later(TUNE.pace.guestPause, () => callNext());
    } else {
      this.phase = 'play';
      later(TUNE.pace.guestPause, () => say('GREAT JOB!', 'Now earn your first upgrade'));
    }
  },
  update(): void {
    if (this.phase !== 'tutorial') return;
    const g = this.guest;
    if (this.stepId === 'come' && g.state === 'queue') this.step = 1;
    // In their room, a moment later, they ask for their one thing.
    if (this.stepId === 'room' && g.state === 'room' && !g.order && clock > g.restUntil) {
      ask(g, TUTORIAL_WISH[this.passenger], roomBills(g));
      this.done('room');
    }
  },
};
let askAt = 0;
/** Play: a steady, capped flow of requests, decided here and nowhere else. One per guest at a time. */
function maxOpen(): number {
  return TUNE.openStart + Math.min(1, helpers.length);
}
function director(): void {
  flow.update();
  if (!flow.allows('request') || clock < askAt) return;
  const open = guests.filter((g) => g.order || g.state === 'toVenue' || (g.venue === 'cinema' && filmT < 0)).length;
  if (open >= maxOpen()) return;
  const g = guests.filter(ready).sort((a, b) => a.restUntil - b.restUntil)[0];
  if (!g) return;
  askAt = clock + TUNE.askGap[0] + Math.random() * (TUNE.askGap[1] - TUNE.askGap[0]);
  // A new venue is shown at once (its first visitors go straight there); after that, now and then.
  if (teach === 'cafe' && tryOuting(g, 'cafe')) return;
  if (teach === 'cinema' && tryOuting(g, 'cinema')) return;
  const venues: Venue[] = [];
  if (cafeTier) venues.push('cafe');
  if (theatreOpen && filmT < 0) venues.push('cinema');
  if (venues.length && g.had.has('blanket') && Math.random() < TUNE.visit && tryOuting(g, venues[Math.floor(Math.random() * venues.length)])) return;
  ask(g, nextWish(g), roomBills(g));
}

// ================================================================ jobs each frame
function updateJobs(dt: number): void {
  const front = atDesk();
  const tutorialItem = flow.phase === 'tutorial' ? flow.guest.order?.item ?? null : null;
  const audienceReady = audience().length >= (teach === 'cinema' ? 2 : 2) && filmT < 0 && !guests.some((g) => g.venue === 'cinema' && g.state === 'toVenue');
  for (const s of stations) {
    let wants = false;
    let item: ItemKind | null = null;
    if (s.kind === 'desk') wants = !!front && !!freeRoom() && (flow.phase !== 'tutorial' || flow.stepId === 'checkin');
    else if (s.kind === 'film') wants = flow.phase === 'play' && audienceReady;
    else {
      item = s.items.find((it) => guests.some((g) => g.order?.item === it && !g.order.claimed && sourceFor(it, g) === s && needed(it) > 0)) ?? null;
      if (flow.phase === 'tutorial' && (item !== tutorialItem || flow.stepId !== 'get')) item = null;
      wants = !!item && carried.length < TUNE.carry;
      // A supply spot always wears its sign (what you get here); it lights up when it is needed.
      s.marker.setIcon(item ? ITEM_ICON[item] : s.icon);
    }
    s.wanted = wants;
    s.marker.visible = wants || s.progress > 0 || s.kind === 'source';
    s.marker.iconShown = wants || s.kind === 'source';
    s.marker.highlight = wants;
    const near = Math.hypot(me.x - s.x, me.z - s.z) < (s.kind === 'desk' ? TUNE.deskReach : TUNE.pickReach);
    if (wants && near) {
      s.progress = Math.min(1, s.progress + dt / (s.kind === 'desk' ? TUNE.checkIn : s.kind === 'film' ? TUNE.projector : TUNE.pickUp));
      if (s.progress >= 1) {
        s.progress = 0;
        if (s.kind === 'desk' && front) {
          checkIn(front, freeRoom()!);
          flow.done('checkin');
        } else if (s.kind === 'film') startFilm();
        else if (item) pickUp(item, Math.min(needed(item), TUNE.carry - carried.length));
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }
  // Deliveries go the moment the guest is in reach (anywhere in their room), never through a wall.
  for (const g of guests) {
    if (!g.order || g.receiving || g.walking || g.state === 'toRoom' || !carried.some((c) => c.item === g.order!.item)) continue;
    const a = approach(g);
    const inRoom = g.room && g.state === 'room' && Math.hypot(me.x - a.x, me.z - a.z) < TUNE.roomReach && map.walk.lineClear(me.x, me.z, a.x, a.z);
    if (inRoom || (Math.hypot(me.x - g.x, me.z - g.z) < TUNE.serveReach && map.walk.lineClear(me.x, me.z, a.x, a.z))) serve(g);
  }
  if (filmT >= 0) {
    filmT += dt;
    if (filmT >= TUNE.film) endFilm();
  }
  updatePiles();
  director();
  revealUpgrade();
  // The end: the next upgrade (the Dining Car) is in reach.
  if (finalGoal && money >= TUNE.diningCar && !ended) endGame();
}

/** The next thing to do: the guide points at it, the hint line names it, a tap walks there. */
interface Target extends Vec2 { lift: number; icon: IconName; text: string }
function target(): Target | null {
  if (flow.phase === 'tutorial') return tutorialTarget();
  for (const c of carried) {
    const g = guests.filter((x) => x.order?.item === c.item && !x.order.claimed && !x.walking).sort((a, b) => Math.hypot(approach(a).x - me.x, approach(a).z - me.z) - Math.hypot(approach(b).x - me.x, approach(b).z - me.z))[0];
    if (g) return { ...approach(g), lift: 2.4, icon: ITEM_ICON[c.item], text: `Bring ${ITEM_WORD[c.item]}` };
  }
  if (tile && money >= tile.price - tile.paid) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: `Buy ${tile.name}` };
  if (atDesk() && freeRoom()) return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: 'Check in the guest' };
  const pile = nearestPile();
  if (pile) return { ...pile, lift: 1.3, icon: 'cash', text: 'Grab the cash' };
  if (projector && stations.includes(projector) && projector.marker.visible) return { x: projector.x, z: projector.z, lift: 2.0, icon: 'film', text: 'Start the movie' };
  const open = guests.filter((g) => g.order && !g.order.claimed && needed(g.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since);
  if (open[0] && carried.length < TUNE.carry) {
    const item = open[0].order!.item;
    const s = sourceFor(item, open[0]);
    if (s) return { x: s.x, z: s.z, lift: 2.0, icon: ITEM_ICON[item], text: `Get ${ITEM_WORD[item]}` };
  }
  if (tile) return { x: tile.x, z: tile.z, lift: 1.5, icon: tile.icon, text: `Buy ${tile.name}` };
  return null;
}
/** The tutorial's one target, and its words: full for guest 1, one word for guest 2, none for guest 3. */
function tutorialTarget(): Target | null {
  if (flow.resting) return null;
  const g = flow.guest;
  const words = (full: string, short: string): string => (flow.passenger === 0 ? full : flow.passenger === 1 ? short : '');
  const item = g.order?.item ?? TUTORIAL_WISH[flow.passenger];
  switch (flow.stepId) {
    case 'checkin':
      return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: words('Go to the desk', 'Desk') };
    case 'room':
      return g.room ? { ...roomCentre(g.room), lift: 2.4, icon: 'bed', text: words('Go to their room', 'Room') } : null;
    case 'get': {
      const s = sourceFor(item, g);
      return s ? { x: s.x, z: s.z, lift: 2.0, icon: ITEM_ICON[item], text: words(`Grab ${ITEM_WORD[item]}`, ITEM_SHORT[item] ?? '') } : null;
    }
    case 'bring':
      return g.room ? { ...roomCentre(g.room), lift: 2.4, icon: ITEM_ICON[item], text: words('Bring to the guest', 'Guest') } : null;
    case 'cash': {
      const p = nearestPile();
      return p ? { ...p, lift: 1.3, icon: 'cash', text: words('Collect the cash', 'Cash') } : null;
    }
  }
  return null;
}
const ITEM_SHORT: Record<string, string> = { luggage: 'Bag', blanket: 'Blanket', tea: 'Tea' };

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
  if (!document.documentElement.classList.contains('nx-ready')) return;
  if (!started) {
    startScreen.classList.add('gone');
    document.documentElement.classList.add('nx-started');
  }
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
      const solid: Walker[] = [...guests, ...helpers.map((h) => h.w)];
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
      for (const h of helpers) if (Math.abs(h.w.z - dz) < 1.3 && Math.abs(h.w.x - door.x) < 1.2) want = 1;
      if (door.open === want) continue;
      car.view.setRoomDoor(door, want > door.open ? Math.min(1, door.open + dt * 5) : Math.max(0, door.open - dt * 2.5));
    }
  }
}

// ================================================================ the guide: the gold arrow over the goal, an arrow at the feet, the hand
const arrow = makeSprite(guideArrowTexture(), 0.62);
arrow.material.toneMapped = false;
arrow.renderOrder = 21;
scene.add(arrow);
let arrowShown = 0;
// The way to go: a big gold arrow on the floor in front of the conductor, turning toward the next step of the route.
const footTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 8);
  ctx.lineTo(118, 66);
  ctx.lineTo(84, 66);
  ctx.lineTo(84, 120);
  ctx.lineTo(44, 120);
  ctx.lineTo(44, 66);
  ctx.lineTo(10, 66);
  ctx.closePath();
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#5A3A00';
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 8, 0, 120);
  grad.addColorStop(0, '#FFF27A');
  grad.addColorStop(1, '#FFB81F');
  ctx.fillStyle = grad;
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const footGeometry = new THREE.PlaneGeometry(0.85, 0.85);
footGeometry.rotateX(-Math.PI / 2);
const foot = new THREE.Mesh(footGeometry, new THREE.MeshBasicMaterial({ map: footTexture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
foot.renderOrder = 6;
foot.visible = false;
scene.add(foot);
let footShown = 0;
let footAngle = 0;
let footAt = -1;
let footKey = '';
const footDir = { x: 0, z: 1 };
const onScreen = { x: 0, y: 0 };
/** Is a floor point comfortably inside the view? */
function inView(p: Vec2): boolean {
  tmpV.set(p.x, FLOOR_Y + 0.5, p.z);
  if (!stage.project(tmpV, onScreen)) return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return onScreen.x > w * 0.08 && onScreen.x < w * 0.92 && onScreen.y > h * 0.18 && onScreen.y < h * 0.88;
}
function updateFoot(dt: number, t: Target | null): void {
  // Only when the goal is out of sight: then it says which way to go; otherwise the arrow over the goal is enough.
  const far = !!t && Math.hypot(t.x - me.x, t.z - me.z) > 1.2 && !inView(t);
  footShown += ((far ? 1 : 0) - footShown) * Math.min(1, dt * 7);
  foot.visible = footShown > 0.03;
  if (!foot.visible || !t) return;
  const key = `${t.x.toFixed(1)},${t.z.toFixed(1)}`;
  if (key !== footKey || clock - footAt > 0.2) {
    footKey = key;
    footAt = clock;
    const pts = route({ x: me.x, z: me.z }, t);
    const p = pts.find((q) => Math.hypot(q.x - me.x, q.z - me.z) > 0.5) ?? t;
    const l = Math.hypot(p.x - me.x, p.z - me.z) || 1;
    footDir.x = (p.x - me.x) / l;
    footDir.z = (p.z - me.z) / l;
  }
  footAngle = turnToward(footAngle, Math.atan2(-footDir.x, -footDir.z), dt * 10);
  const push = 0.95 + Math.sin(clock * 7) * 0.08;
  foot.position.set(me.x - Math.sin(footAngle) * push, FLOOR_Y + 0.05, me.z - Math.cos(footAngle) * push);
  foot.rotation.y = footAngle;
  foot.scale.setScalar(footShown);
}
// The glowing ring on the floor where to go (the tutorial's first two guests): additive, so it only adds light.
const ringTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,220,90,0)');
  g.addColorStop(0.55, 'rgba(255,220,90,0.95)');
  g.addColorStop(0.7, 'rgba(255,240,170,1)');
  g.addColorStop(1, 'rgba(255,200,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ringGeometry = new THREE.PlaneGeometry(1.5, 1.5);
ringGeometry.rotateX(-Math.PI / 2);
const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
ring.renderOrder = 5;
ring.visible = false;
scene.add(ring);
let ringShown = 0;
function updateGuide(dt: number): void {
  const t = target();
  const hesitating = !started || (clock - lastInput > TUNE.hesitate && !autoWalk && pointerId < 0);
  // The guide always shows the way until the Attendant is hired (and while the café is new); then when you stop.
  const guided = flow.phase === 'tutorial' || helpers.length === 0 || teach !== null;
  const show = !!t && !ended && (guided || hesitating);
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  // One target, one arrow: over the goal when it is in view, else the arrow at the conductor's feet points the way.
  const offScreen = !!t && !inView(t);
  arrow.visible = arrowShown > 0.02 && !!t && !offScreen;
  // Guest 3 gets only a light arrow.
  const light = flow.phase === 'tutorial' && flow.passenger === 2;
  arrow.material.opacity = light ? 0.6 : 1;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    const size = (light ? 0.45 : 0.62) * arrowShown;
    arrow.scale.set(size, size, 1);
  }
  updateFoot(dt, show ? t : null);
  const ringOn = show && !!t && flow.phase === 'tutorial' && flow.passenger < 2;
  ringShown += ((ringOn ? 1 : 0) - ringShown) * Math.min(1, dt * 6);
  ring.visible = ringShown > 0.03 && !!t;
  if (t) {
    ring.position.set(t.x, FLOOR_Y + 0.04, t.z);
    ring.scale.setScalar(ringShown * (1 + Math.sin(clock * 5) * 0.08));
    (ring.material as THREE.MeshBasicMaterial).opacity = ringShown * (0.75 + Math.sin(clock * 5) * 0.25);
  }
  // The instruction pill: the tutorial's one step (passenger 2 gets the arrows only), and the next job while guided.
  const instruction = ended || !t ? null : flow.phase === 'tutorial' ? (flow.passenger < 2 ? t : null) : guided || hesitating ? t : null;
  setHint(instruction);
  hintBox.classList.toggle('low', goalBox.classList.contains('on'));
  // The goal bar: the next upgrade's progress (from the end of the tutorial).
  if (ended || flow.phase === 'tutorial') setGoal(null, '');
  else if (finalGoal) setGoal('star', `Dining Car: $${Math.min(Math.round(shownMoney), TUNE.diningCar)}/${TUNE.diningCar}`, shownMoney / TUNE.diningCar);
  else if (tile) setGoal(tile.icon, `Buy ${tile.name}!`, 1);
  else {
    const next = nextPlan();
    if (next) setGoal(next.icon, `${next.name}: $${Math.min(Math.round(shownMoney), next.price)}/${next.price}`, shownMoney / next.price);
    else setGoal(null, '');
  }
  // The hand: whenever the player stops (it drags from the conductor toward the goal).
  const showHand = show && hesitating && started && flow.phase === 'play';
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

// ================================================================ labels over the world: never two on top of each other
/**
 * Every frame, each label over the world (the target arrow, guests' bubbles, the job and supply signs, the upgrade
 * tile's marker) gets its box on screen. The most important go first; a label whose box would touch one already
 * placed, or the HUD (money, goal, instruction, a caption, the corner buttons), is hidden for that frame.
 */
interface WorldLabel { rect: ScreenRect; priority: number; hide: () => void }
const labelProj = { x: 0, y: 0 };
const camUp = new THREE.Vector3();
const labelTmp = new THREE.Vector3();
/** The on-screen box of a sprite of `size` metres at `at` (its anchor `ax`, `ay` within the box, 0..1). */
function spriteRect(at: THREE.Vector3, size: number, ax: number, ay: number, w = 1, h = 1): ScreenRect | null {
  if (!stage.project(labelTmp.copy(at), labelProj)) return null;
  const cx = labelProj.x;
  const cy = labelProj.y;
  camUp.set(0, 1, 0).applyQuaternion(stage.rig.camera.quaternion).multiplyScalar(size);
  if (!stage.project(labelTmp.copy(at).add(camUp), labelProj)) return null;
  const px = Math.abs(cy - labelProj.y);
  return { x0: cx - px * w * ax, x1: cx + px * w * (1 - ax), y0: cy - px * h * (1 - ay), y1: cy + px * h * ay };
}
const bubbleAt = new THREE.Vector3();
function placeLabels(): void {
  const labels: WorldLabel[] = [];
  const targetNow = target();
  if (arrow.visible) {
    const r = spriteRect(arrow.position, arrow.scale.y, 0.5, 0.55, 1.0, 1.3);
    if (r) labels.push({ rect: r, priority: 10, hide: () => (arrow.visible = false) });
  }
  for (const g of guests) {
    if (g.state === 'away' || !g.bubble.shown) continue;
    g.bubble.suppressed = false;
    bubbleAt.copy(g.bubble.sprite.position);
    // The bubble's box: 220×128 of its 256² canvas, its tail tip at the anchor.
    const r = spriteRect(bubbleAt, g.bubble.size, 0.5, 0.0, 0.86, 0.62);
    if (!r) continue;
    const isTarget = !!targetNow && g.room !== null && Math.hypot(roomCentre(g.room).x - targetNow.x, roomCentre(g.room).z - targetNow.z) < 0.5;
    labels.push({ rect: r, priority: isTarget ? 9 : g.order ? 6 : 3, hide: () => {
      g.bubble.suppressed = true;
      g.bubble.sprite.visible = false;
    } });
  }
  for (const s of stations) {
    if (!s.marker.visible) continue;
    const r = spriteRect(s.sign, VISUALS.pads.icon * 0.5, 0.5, 0.5);
    if (r) labels.push({ rect: r, priority: s.wanted ? 8 : 2, hide: () => (s.marker.visible = false) });
  }
  if (tile && tile.view.marker.sprite.visible) {
    tmpV.set(tile.x, FLOOR_Y + 1.4, tile.z);
    if (stage.project(tmpV, labelProj)) labels.push({ rect: { x0: labelProj.x - 72, x1: labelProj.x + 72, y0: labelProj.y - 30, y1: labelProj.y + 26 }, priority: 7, hide: () => (tile!.view.marker.sprite.visible = false) });
  }
  labels.sort((a, b) => b.priority - a.priority);
  const hud = hudRects();
  const placed: ScreenRect[] = hud.slice();
  shownLabels = [];
  for (const l of labels) {
    if (placed.some((p) => overlaps(p, l.rect))) l.hide();
    else {
      placed.push(l.rect);
      shownLabels.push(l.rect);
    }
  }
}
/** What the label pass let through this frame (for the overlap test). */
let shownLabels: ScreenRect[] = [];

// ================================================================ the end card: the next upgrade, which the player can now afford
const endCard = buildEndCard(() => openStore(), TUNE.diningCar);
document.body.appendChild(endCard.el);
let endMoney = -1;
let endIdle = false;
function endGame(): void {
  if (ended) return;
  ended = true;
  flow.phase = 'end';
  hand.classList.remove('on');
  setGoal(null, '');
  endIdle = !(finalGoal && money >= TUNE.diningCar);
  endCard.show(money, endIdle);
  sfx('levelup');
}

// ================================================================ the camera: centred on the conductor, eased, clamped to the train
let baseZoom = TUNE.zoom;
let zoomNow = TUNE.zoom;
function resize(): void {
  stage.resize();
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  const aspect = w / Math.max(1, h);
  baseZoom = aspect > 0.9 ? Math.max(TUNE.zoom, 1.27 * aspect) : TUNE.zoom;
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
/** In a little while walking, back out a little when standing or working; slow enough never to feel like a pump. */
function updateZoom(dt: number): void {
  const want = baseZoom * (me.speed > 1 ? TUNE.zoomWalk : 1);
  zoomNow += (want - zoomNow) * Math.min(1, dt * (want < zoomNow ? 1.1 : 0.8));
  stage.rig.setZoom(zoomNow);
}
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
  const dt = Math.min(DT_MAX, (now - last) / 1000) * TEST_SPEED;
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
    updateHelpers(dt);
  } else {
    updatePlayer(0);
    desk.marker.visible = true;
    desk.marker.iconShown = true;
    desk.marker.highlight = true;
    desk.marker.update(dt);
  }
  for (const g of guests) g.update(dt);
  updateKeys(dt);
  updateDoors(dt);
  updateWipes(dt);
  updateTarps(dt);
  updateMessages(dt);
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
    r.t += dt / 2.2;
    const k = Math.min(1, r.t);
    r.group.position.z = r.z + 26 * Math.pow(1 - k, 3);
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
  placeLabels();
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
  // Guest 1 is at the desk when the ad opens; the others come one at a time.
  const first = callNext();
  if (first) {
    first.path = [];
    first.onArrive = null;
    first.setPose('stand', { x: QUEUE_SPOT.x, y: FLOOR_Y, z: QUEUE_SPOT.z, facing: -Math.PI / 2 });
    first.state = 'queue';
    first.walkSpeed = TUNE.guestSpeed;
    flow.step = 1;
  }
  for (const g of guests) g.update(0);
  batch.sync(stage.rig.camera);
  // Every shader compiles behind the splash (the canvas stays hidden until real frames are on it).
  await stage.warmUp(2500).catch(() => undefined);
  await adReady();
  onViewable((visible) => {
    paused = !visible;
    audio.setPaused(!visible);
    last = performance.now();
  });
  last = performance.now();
  requestAnimationFrame(frame);
  // Show the scene only after a few settled frames, so the first thing seen is the reception, never a half-built view.
  let frames = 0;
  const reveal = (): void => {
    if (++frames < 4) {
      requestAnimationFrame(reveal);
      return;
    }
    document.documentElement.classList.add('nx-ready');
    lastInput = clock;
  };
  requestAnimationFrame(reveal);
}
void boot();

// Test hooks (harmless in an ad).
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return {
      clock: Math.round(clock), phase: flow.phase, passenger: flow.passenger, step: flow.stepId, money, target: target(), back: backCount,
      tile: tile ? `${tile.name} ${tile.paid}/${tile.price}` : null, plan: planIndex, cars: train.length, helpers: helpers.length, film: filmT,
      aboard: guests.map((g) => `${g.state}${g.order ? ':' + g.order.item : ''}`), carried: carried.map((c) => c.item), ended, finalGoal, served,
      caption: showing?.title ?? null, me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) },
      offFloor: [...guests, ...helpers.map((h) => h.w)].filter((g) => Math.abs(g.x) > INNER + 0.05).map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`),
    };
  },
  /** Every visible label and HUD box now, and any pair that overlaps (should always be none). */
  overlaps: () => {
    const boxes = [...shownLabels.map((r) => ({ r, kind: 'label' })), ...hudRects().map((r) => ({ r, kind: 'hud' }))];
    const bad: string[] = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].kind === 'hud' && boxes[j].kind === 'hud') continue;
      if (overlaps(boxes[i].r, boxes[j].r, 0)) bad.push(`${boxes[i].kind}/${boxes[j].kind}`);
    }
    const msgs = document.querySelectorAll('.ad-banner.on, .ad-hint.on, .ad-class.on').length;
    return { labels: shownLabels.length, bad, messages: msgs };
  },
  give: (bills: number) => {
    for (let i = 0; i < bills; i++) landBill();
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
