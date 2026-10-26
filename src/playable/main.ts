// Night Express playable ad (a separate build: scripts/build-playable.mjs). It reuses the game's own world code (the
// carriages, the characters, the cash, the tiles, the makeover wipe, the tarp reveal and the sounds).
//
// One thing at a time. A single flow controller (`flow`) decides what may happen; nothing starts on its own.
//  - The train is a luxury sleeper on its way through the night: it never stops, so nobody boards or leaves. Three
//    passengers are aboard from the start, waiting at the reception (one at the desk, two on the sofa); once checked
//    in they stay in their rooms all night and the conductor looks after them.
//  - Tutorial: passenger 1, one step at a time (check them in, get their bag, bring it, grab the cash); passenger 2
//    the same with arrows only. Then play: passenger 3 checks in and the requests come, one per guest at a time.
//  - Upgrades, one by one, each shown once affordable: the Café Car, Comfort Class, the Attendant, the Theatre, a
//    faster Attendant, Business Class, a 2nd Attendant (serves the café and the theatre) and the Café Makeover. Then
//    the Dining Car is the goal; the end card comes once affordable.
// Captions go through one channel: one at a time; a small one (praise, a combo) is dropped if anything else shows.
import * as THREE from 'three';
import { AudioEngine, isAndroid, type Sfx } from '../audio/AudioEngine';
import { classOfTier } from '../config/classes';
import { ARCHETYPES } from '../config/content';
import { VISUALS } from '../config/visuals';
import { frameWork } from '../core/Background';
import { type CarriageType, type ItemKind, type Vec2 } from '../core/types';
import { TrainMap } from '../sim/TrainMap';
import { drawIcon as drawIconAt, type IconName } from '../ui/icons';
import { Ambient } from '../world/Ambient';
import { BED_TOP, CarriageView, deformTarp, disposeTree, FLOOR_Y, TARP_TIE_Z } from '../world/CarriageView';
import { CharacterBatch } from '../world/CharacterBatch';
import { LEG_LENGTH } from '../world/CharacterParts';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../world/CharacterView';
import { CashView } from '../world/CashView';
import { Fireflies } from '../world/Fireflies';
import { GeoBuilder } from '../world/geo';
import { createItemMesh, ITEM_HEIGHT } from '../world/ItemMeshes';
import { shoesGeometry } from '../world/Shoes';
import { CARRIAGE_LENGTH, carriageOriginZ, COMPACT_LOBBY, INTERIOR_WALL_HEIGHT, PARTITION_X0, PARTITION_X1, getLayout, HALF_WIDTH, INNER, useCompactLobby, type CabinLayout, type VenueSeatLayout } from '../world/layout';
import { LocomotiveView } from '../world/LocomotiveView';
import { clipSide, MATERIALS, SHADOW_GEOMETRY, setLivery, swapMaterials } from '../world/materials';
import { liveryFor } from '../world/palette';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { guideArrowTexture, makeSprite } from '../world/sprites';
import { Stage } from '../world/Stage';
import { trainLightInput } from '../world/trainLight';
import { JobMarker, TileView } from '../world/ZoneViews';
import { bouquet, curvedWall, floorLamp, minibar, newsstand, slidingDoor, washMess } from './decor';
import { buildEndCard } from './endcard';
import { adReady, onViewable, openStore } from './network';

// The playable's own lobby plan (a washroom and four rooms behind the reception); before any carriage is built.
useCompactLobby();
/** Guest rooms in the lobby, and guests aboard (one each). */
const ROOMS_TOTAL = 4;

/** The game's icons are drawn from their top-left corner; the ad places them by their centre. */
function drawIcon(ctx: CanvasRenderingContext2D, icon: IconName, cx: number, cy: number, size: number): void {
  drawIconAt(ctx, icon, cx - size / 2, cy - size / 2, size);
}

/**
 * The no-tutorial build (`NO_TUTORIAL=1 node scripts/build-playable.mjs`, or `?notut=1`): play from the first touch,
 * no walkthrough; the arrow and the hint line come only when the player stands still, like the rest of the game.
 */
declare const __NO_TUTORIAL__: boolean;
const NO_TUTORIAL = __NO_TUTORIAL__ || new URLSearchParams(location.search).get('notut') === '1';

// ================================================================ CONFIG: every number of the ad in one place
const TUNE = {
  /** Camera distance factor; it eases in a little while walking and back out when standing or working. */
  zoom: 0.72,
  zoomWalk: 0.95,
  follow: 7,
  /** Walking speed (m/s), and what each carriage added to the train adds. */
  speed: 5.6,
  speedUp: 1.02,
  guestSpeed: 3.6,
  /** What a delivery pays ($) by the lobby's class (index = tier: 1 Basic, 2 Comfort, 4 Luxury). */
  deliver: [0, 10, 14, 14, 24] as number[],
  /** A café order ($); a theatre seat when the movie ends; popcorn. */
  cafe: 16,
  ticket: 20,
  popcorn: 14,
  /** Each small upgrade adds this much to every delivery and café order (earnings rise a little with each one). */
  smallBonus: 2,
  /** Coins in a payment's burst (just the look: the amount is what was paid). */
  coins: 6,
  /** Serving again within this many seconds builds a combo; from x3 each serve pays this bonus. */
  comboWindow: 9,
  comboBonus: 5,
  /**
   * Every purchase in order, and its price ($). The tiles of the small ones show two at a time; a big one (a new
   * class, a new carriage, the Attendant) only once every small one before it is bought.
   */
  price: {
    room2: 20,
    room3: 40, lamps: 50, room4: 60, flowers: 60, rug: 65,
    attendant: 120,
    comfort: 170,
    minibar: 110, skates: 120,
    cafe: 130,
    pastry: 110,
    luxury: 170,
    theatre: 150,
    speakers: 100, premiere: 100,
    dining: 150,
  },
  /** Most small upgrade tiles on show at once. */
  tilesAtOnce: 1,
  /** A bill flying into a tile is worth this much (a tile fills in about a second whatever its price). */
  drainBills: 24,
  drain: 0.045,
  /** Seconds a job takes (quick: the conductor barely has to stop). */
  checkIn: 0.35,
  pickUp: 0.2,
  projector: 0.5,
  /** Reaches (m): deliveries go as soon as the guest is in reach (anywhere in their room). */
  deskReach: 1.3,
  pickReach: 1.25,
  serveReach: 2.3,
  roomReach: 2.2,
  tileReach: 0.9,
  /** Standing on a tile (slower than this, m/s) this long starts paying into it. */
  tileStopSpeed: 1.2,
  tileStand: 0.25,
  /** Seconds an item flies to the guest. */
  handOver: 0.2,
  /** Most things carried at once. */
  carry: 3,
  /** A guest waiting this long for what they asked for is cross. */
  patience: 22,
  /** Requests: a guest's rest (asleep) after being served; the gap between new requests across the train. */
  rest: [6, 9] as [number, number],
  askGap: [2.5, 4.5] as [number, number],
  /** Chance a request is a visit to the café or the theatre once open. */
  visit: 0.45,
  /** The washroom: how long a guest is in it, the tip for tidying it after, the chance a resting guest goes. */
  washSeconds: 2.6,
  washTip: 12,
  washChance: 0.3,
  cleanSeconds: 1.2,
  /** Shoe shine: the chance a request is shoes (from Comfort Class), what it pays, seconds at the stand. */
  shoeChance: 0.3,
  shoePay: 22,
  shineSeconds: 1.3,
  shoeReach: 0.75,
  /** The skates upgrade: how much faster the conductor walks. */
  skates: 1.15,
  /** The movie's length. */
  film: 7,
  /** Viewers seated before the movie can start. */
  filmAudience: 1,
  /** The Attendant: walking speed, the faster one's, and how long she takes at a cupboard. */
  attendantSpeed: 4.4,
  attendantPick: 0.6,
  /** She takes a request only once it has waited this long (the player gets the first go: there is always work). */
  attendantWait: 4,
  /** A job she has not finished in this long is let go (someone else can take it). */
  attendantGiveUp: 25,
  /** An upgrade's moment: the camera's push-in (seconds, zoom) and the shake. */
  pushIn: 1.1,
  pushZoom: 0.7,
  shake: 0.05,
  /** Captions: an important one; a small one (praise, combo); the class card. */
  caption: 1.8,
  small: 1.1,
  classCard: 2.4,
  /** The train's speed (m/s; slow enough that the sleepers never strobe). */
  ride: 7,
  /** The splash: seconds on screen before it fades by itself (a tap skips it). */
  splash: 1.8,
  /** Seconds without a touch before the hand shows, and before the end screen shows anyway. */
  hesitate: 5,
  /** Passenger 2 (the second time through) gets the arrow only after this long without a move. */
  hesitateTutorial: 3,
  /** The dragging hand shows only after this long without a touch. */
  handAfter: 8,
  idleEnd: 20,
  /** After the Dining Car's reveal, seconds before the end screen. */
  endDelay: 1.2,
};
const NIGHT_TIME = 0.82;
const TIER = { basic: 1, comfort: 2, luxury: 4 } as const;
/** What the ad calls each lobby class. */
const CLASS_NAME: Record<number, string> = { 1: 'Basic', 2: 'Comfort', 4: 'Luxury' };
const CINEMA_TIER = 2;
const DINING_TIER = 3;
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

// No patterned carpets in the venues (plain floors read cleaner on a phone); the game is untouched. The café gets a
// plain mat of its own instead (one soft colour, a thin border: `plainMat`).
for (const t of [1, 2]) getLayout('cafe', t).venue!.carpets = [];
getLayout('cinema', CINEMA_TIER).venue!.carpets = [];
/** A plain mat on the floor: one soft colour with a thin border, flat (nothing can clip it). */
function plainMat(x0: number, z0: number, x1: number, z1: number, color: string, border: string): THREE.Mesh {
  const b = new GeoBuilder();
  const w = x1 - x0;
  const d = z1 - z0;
  // Built round its own centre, so it can grow in from the middle.
  b.box(0, 0.006, 0, w, 0.012, d, border, 0, { shade: 1 });
  b.box(0, 0.009, 0, w - 0.12, 0.012, d - 0.12, color, 0, { shade: 1 });
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.position.set((x0 + x1) / 2, FLOOR_Y, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  return mesh;
}
// The waiting sofa stands against the reception's front wall, facing the room (part of the playable's lobby plan);
// whoever has no seat waits on their feet beside it.
const SOFA_SEATS: Vec2[] = [{ x: COMPACT_LOBBY.sofa.x0 + 0.36, z: 0.5 }, { x: COMPACT_LOBBY.sofa.x1 - 0.36, z: 0.5 }];
const SOFA_Y = FLOOR_Y + 0.42 - 0.24;
const WAIT_STAND: Vec2 = { x: 0.62, z: 1.95 };

// Every carriage the ad will show is built now, hidden, so an upgrade is a swap and never a hitch mid-play. The train
// starts as ONE carriage (the lobby); the others join only when bought. Passenger carriages start repaired (Basic).
const SLOT = { lobby: 0, cafe: 1, cinema: 2, dining: 3 } as const;
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
    // The rack runs its full length from the start (it holds the bags waiting to go to their rooms).
    view.setRackLevel(1);
    view.setLuggageCount(0);
  }
  return view;
}
const views = {
  lobby: { [TIER.basic]: buildView('lobby', SLOT.lobby, TIER.basic), [TIER.comfort]: buildView('lobby', SLOT.lobby, TIER.comfort, TIER.basic), [TIER.luxury]: buildView('lobby', SLOT.lobby, TIER.luxury, TIER.basic) } as Record<number, CarriageView>,
  cafe: buildView('cafe', SLOT.cafe, 1),
  cinema: buildView('cinema', SLOT.cinema, CINEMA_TIER),
  dining: buildView('dining', SLOT.dining, DINING_TIER),
};
views.lobby[TIER.basic].group.visible = true;
// The café's plain mat down the middle, where the jute runner was.
views.cafe.group.add(plainMat(-0.55, 8.1, 0.55, 16.3, '#E7D7BC', '#B99B74'));
// Venue extras come one by one as upgrades (the café's pastries, the theatre's speakers and red carpet).
views.cafe.setVenueExtras([]);
views.cinema.setVenueExtras([]);
// The lobby starts with one room open: the others are covered (the game's padlocked lids) until bought.
for (let i = 1; i < ROOMS_TOTAL; i++) views.lobby[TIER.basic].setCabinLocked(i, true);

interface Car { type: CarriageType; tier: number; view: CarriageView }
const train: Car[] = [{ type: 'lobby', tier: TIER.basic, view: views.lobby[TIER.basic] }];
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
/**
 * Tap-to-walk's path: a search over the floor itself (cells of `CELL` metres, eight ways), so it always finds a way
 * if there is one, however tight the furniture. The grid is rebuilt when the train changes; paths are cached.
 */
const CELL = 0.2;
const GRID_X0 = -HALF_WIDTH;
const GRID_W = Math.ceil((HALF_WIDTH * 2) / CELL);
let gridH = 0;
let grid = new Uint8Array(0);
let gridKey = '';
function floorGrid(): void {
  const key = `${train.length}:${train.map((c) => c.tier).join()}:${rooms.filter((r) => r.open).length}`;
  if (key === gridKey) return;
  gridKey = key;
  gridH = Math.ceil(trainRear() / CELL);
  grid = new Uint8Array(GRID_W * gridH);
  for (let j = 0; j < gridH; j++) for (let i = 0; i < GRID_W; i++) grid[j * GRID_W + i] = map.walk.isWalkable(GRID_X0 + (i + 0.5) * CELL, (j + 0.5) * CELL) ? 1 : 0;
}
const cellOf = (p: Vec2): number => {
  const i = Math.max(0, Math.min(GRID_W - 1, Math.floor((p.x - GRID_X0) / CELL)));
  const j = Math.max(0, Math.min(gridH - 1, Math.floor(p.z / CELL)));
  return j * GRID_W + i;
};
let cameFrom = new Int32Array(0);
const queue: number[] = [];
function floorPath(from: Vec2, to: Vec2): Vec2[] | null {
  floorGrid();
  if (cameFrom.length !== grid.length) cameFrom = new Int32Array(grid.length);
  cameFrom.fill(-1);
  const goal = cellOf(walkableNear(to.x, to.z));
  const start = cellOf(from);
  queue.length = 0;
  queue.push(start);
  cameFrom[start] = start;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (c === goal) break;
    const ci = c % GRID_W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const i = ci + di;
      const n = c + di + dj * GRID_W;
      if (i < 0 || i >= GRID_W || n < 0 || n >= grid.length || cameFrom[n] >= 0 || !grid[n]) continue;
      // Diagonals only where both sides are open (never through a corner).
      if (di && dj && (!grid[c + di] || !grid[c + dj * GRID_W])) continue;
      cameFrom[n] = c;
      queue.push(n);
    }
  }
  if (cameFrom[goal] < 0) return null;
  const out: Vec2[] = [{ x: to.x, z: to.z }];
  for (let c = cameFrom[goal]; c !== start; c = cameFrom[c]) out.push({ x: GRID_X0 + ((c % GRID_W) + 0.5) * CELL, z: (Math.floor(c / GRID_W) + 0.5) * CELL });
  return out.reverse();
}
let walkPath: Vec2[] = [];
let walkPathAt = -9;
let walkPathTo = '';

/** Cuts a grid path's corners: from each point, on to the furthest of the next few still in plain view. */
function smoothPath(from: Vec2, pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  let cur = from;
  let i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 30);
    while (j > i && !straight(cur, pts[j])) j--;
    out.push(pts[j]);
    cur = pts[j];
    i = j + 1;
  }
  return out;
}
/** The nearest nav node in plain reach of a point (the very nearest can be behind a row of seats); a few tried, nearest first. */
const nodeDist: { id: string; d: number }[] = [];
function reachableNode(p: Vec2): string | null {
  nodeDist.length = 0;
  for (const id of map.nav.ids()) {
    const q = map.nav.position(id);
    nodeDist.push({ id, d: (q.x - p.x) ** 2 + (q.z - p.z) ** 2 });
  }
  nodeDist.sort((x, y) => x.d - y.d);
  for (let i = 0; i < Math.min(6, nodeDist.length); i++) if (straight(p, map.nav.position(nodeDist[i].id))) return nodeDist[i].id;
  return nodeDist[0]?.id ?? null;
}
/** A route through the train (the game's nav graph: doorways, gangways, round furniture), ending exactly at `to`. */
function route(from: Vec2, to: Vec2, toNode?: string): Vec2[] {
  // A path over the floor itself (it always finds a way if there is one), its corners cut where the way is clear.
  const grid = floorPath(from, to);
  if (grid) return smoothPath(from, grid);
  // Start from the nearest node in plain reach (the nearest one can be behind a row of seats).
  const a = reachableNode(from);
  const b = toNode ?? reachableNode(to);
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
  <div class="ad-class"><div class="ad-class-card"><canvas width="160" height="160"></canvas><b></b><canvas class="ad-stars" width="240" height="64"></canvas><i></i></div></div>
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
  <div class="ad-start-title"><span>UPGRADE</span><span>YOUR TRAIN</span></div>
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
  hintBox.classList.remove('on');
  void hintBox.offsetWidth;
  hintBox.classList.add('on');
}

/** A class's stars, drawn (never a font glyph). */
const CLASS_STARS: Record<number, number> = { 1: 1, 2: 2, 4: 3 };
function drawStars(c: HTMLCanvasElement, n: number): void {
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  const size = 56;
  const gap = 8;
  const x0 = (c.width - (n * size + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) drawIcon(ctx, 'star', x0 + i * (size + gap) + size / 2, c.height / 2, size);
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
    const cls = classOfTier(m.card.tier === TIER.luxury ? 3 : m.card.tier);
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
    drawStars(classBox.querySelector('.ad-stars') as HTMLCanvasElement, CLASS_STARS[m.card.tier] ?? 1);
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
  const el = document.createElement('div');
  el.className = style ? `ad-float ${style}` : 'ad-float';
  el.innerHTML = text;
  el.style.left = `${proj.x}px`;
  el.style.top = `${proj.y}px`;
  ui.appendChild(el);
  setTimeout(() => el.remove(), 1300);
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
const ITEM_ICON: Record<string, IconName> = {
  tea: 'tea', coffee: 'coffee', breakfast: 'breakfast', newspaper: 'newspaper', blanket: 'blanket', towel: 'towel', luggage: 'luggage', latte: 'latte', pastry: 'pastry', popcorn: 'popcorn', room: 'bed', film: 'film',
  shoes: 'shoe', shined: 'shoe',
};
/** Plain words for the hint line ("Get tea", "Bring the bag"). */
const ITEM_WORD: Record<string, string> = {
  tea: 'tea', coffee: 'coffee', breakfast: 'breakfast', shoes: 'the shoes', shined: 'the shoes', newspaper: 'the paper', blanket: 'a blanket', towel: 'a towel', luggage: 'the bag', latte: 'a latte', pastry: 'a croissant', popcorn: 'popcorn',
};
/**
 * A face drawn on a canvas (never an emoji: emoji fonts differ on every phone, and some draw a black box): a round
 * face with a dark outline, its eyes and mouth by mood. `wait` a calm smile, `love` heart eyes and a grin, `angry` red
 * with knitted brows.
 */
function drawFace(ctx: CanvasRenderingContext2D, mood: Exclude<Mood, 'none'>, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r / 50, r / 50);
  const grad = ctx.createRadialGradient(-14, -18, 6, 0, 0, 52);
  if (mood === 'angry') {
    grad.addColorStop(0, '#FF9A7A');
    grad.addColorStop(1, '#E2483A');
  } else {
    grad.addColorStop(0, '#FFF27A');
    grad.addColorStop(1, '#FFC21A');
  }
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#5A3A10';
  ctx.stroke();
  ctx.fillStyle = '#3B2210';
  ctx.strokeStyle = '#3B2210';
  ctx.lineCap = 'round';
  if (mood === 'love') {
    for (const ex of [-17, 17]) {
      ctx.save();
      ctx.translate(ex, -8);
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.bezierCurveTo(-16, 0, -12, -15, 0, -7);
      ctx.bezierCurveTo(12, -15, 16, 0, 0, 10);
      ctx.fillStyle = '#F2405A';
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(-20, 12);
    ctx.quadraticCurveTo(0, 38, 20, 12);
    ctx.closePath();
    ctx.fillStyle = '#7A2A20';
    ctx.fill();
  } else if (mood === 'angry') {
    ctx.lineWidth = 6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 28, -22);
      ctx.lineTo(s * 8, -12);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(s * 16, -2, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-16, 26);
    ctx.quadraticCurveTo(0, 12, 16, 26);
    ctx.stroke();
  } else {
    for (const ex of [-16, 16]) {
      ctx.beginPath();
      ctx.ellipse(ex, -8, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-18, 14);
    ctx.quadraticCurveTo(0, 30, 18, 14);
    ctx.stroke();
  }
  ctx.restore();
}
/** A canvas texture for a sprite: premultiplied, so its soft edges never show a dark fringe or box on any GPU. */
function spriteTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = 2;
  return t;
}
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
  if (want) {
    drawFace(ctx, mood, S / 2 - 50, cy, 40);
    drawIcon(ctx, ITEM_ICON[want] ?? 'tea', S / 2 + 50, cy, 86);
  } else drawFace(ctx, mood, S / 2, cy, 44);
  const t = spriteTexture(c);
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
/** A guest room: `open` once bought (the lobby starts with one; the others are upgrades, one by one). */
interface Room { car: number; cabin: number; guest: Guest | null; open: boolean }
let rooms: Room[] = [];
const cabinOf = (r: Room): CabinLayout => train[r.car].view.layout.cabins[r.cabin];
const roomZ = (r: Room): number => carriageOriginZ(r.car);
const sitSpot = (r: Room) => ({ x: cabinOf(r).bed.x0 + 0.12, y: FLOOR_Y + BED_TOP - 0.24, z: cabinOf(r).bedPose.z + roomZ(r), facing: -Math.PI / 2 });
const lieSpot = (r: Room) => ({ x: cabinOf(r).bedPose.x, y: FLOOR_Y + BED_TOP, z: cabinOf(r).bedPose.z + roomZ(r), facing: 0 });
const roomCentre = (r: Room): Vec2 => walkableNear(cabinOf(r).center.x, cabinOf(r).center.z + roomZ(r));
function makeRooms(car: number): Room[] {
  return train[car].view.layout.cabins.map((_c, i) => ({ car, cabin: i, guest: null, open: true }));
}
rooms = makeRooms(SLOT.lobby);
rooms.forEach((r) => (r.open = r.cabin === 0));
/** The first free room that is open. */
const freeRoom = (): Room | null => rooms.find((r) => r.open && !r.guest) ?? null;

// ================================================================ people
type Pose = 'stand' | 'sit' | 'sleep';
type GuestState = 'waiting' | 'toDesk' | 'queue' | 'toRoom' | 'room' | 'toVenue' | 'venue' | 'back' | 'toWash' | 'washing';
type Venue = 'cafe' | 'cinema';
const RADIUS = 0.3;
/** What a guest asked for, since when, and what it pays ($, before the small upgrades' bonus). */
/**
 * What can be asked for or carried: the game's items, and a guest's shoes (collected from their room, shined at the
 * stand at the back of the lobby, brought back: `stage` says which part of that is next).
 */
type Want = ItemKind | 'shoes';
interface Order { item: Want; since: number; pay: number; claimed: boolean }
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
  constructor(look: CharacterLook, x: number, z: number) {
    this.view = new CharacterView(look, 1.04);
    scene.add(this.view.root);
    this.x = x;
    this.z = z;
  }
  get walking(): boolean {
    return this.path.length > 0;
  }
  /** The watchdog's memory: the nearest it has got to the next point, for how long it has not improved, ghost time. */
  private bestD = Infinity;
  private stuckT = 0;
  private ghostT = 0;
  walkTo(points: Vec2[], onArrive: (() => void) | null = null): void {
    this.bestD = Infinity;
    this.stuckT = 0;
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
    // A small hop as they sit down, lie down or get up: the change of pose reads as a move, not a jump cut.
    if (pose !== this.pose) this.view.bounce(0.7);
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
      // Watchdog: not getting any closer to the next point for a second means something is in the way for good;
      // then walk straight through for a moment (never stand still, never circle round someone).
      if (d < this.bestD - 0.05) {
        this.bestD = d;
        this.stuckT = 0;
      } else this.stuckT += dt;
      if (this.stuckT > 1.0) {
        this.ghostT = 1.2;
        this.stuckT = 0;
        this.bestD = d;
      }
      this.ghostT = Math.max(0, this.ghostT - dt);
      const ghost = this.ghostT > 0;
      // Steering: anyone standing or walking just ahead (the conductor included) is passed round on the side away
      // from them, so nobody ever stops dead in front of another; if the floor allows no way round, they slip past.
      let ax = dx / (d || 1);
      let az = dz / (d || 1);
      const px = -az;
      const pz = ax;
      for (const o of ghost ? [] : agents) {
        if (o === this || o.pose !== 'stand') continue;
        const rx = o.x - this.x;
        const rz = o.z - this.z;
        const dist = Math.hypot(rx, rz);
        if (dist < 1e-3 || dist > AVOID_RANGE || dist > d + 0.4) continue;
        const ahead = (rx * ax + rz * az) / dist;
        if (ahead < 0.25) continue;
        const side = rx * px + rz * pz >= 0 ? 1 : -1;
        const w = ((AVOID_RANGE - dist) / AVOID_RANGE) * 1.8 * ahead;
        ax -= px * side * w;
        az -= pz * side * w;
      }
      const l = Math.hypot(ax, az) || 1;
      ax /= l;
      az /= l;
      if (d <= Math.max(step, 0.12)) {
        this.x = next.x;
        this.z = next.z;
        this.path.shift();
        this.bestD = Infinity;
        this.stuckT = 0;
        if (this.path.length === 0) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        const sx = this.x + ax * step;
        const sz = this.z + az * step;
        if (!ghost && map.walk.isWalkable(sx, sz)) {
          this.x = sx;
          this.z = sz;
        } else {
          this.x += (dx / d) * Math.min(step, d);
          this.z += (dz / d) * Math.min(step, d);
        }
      }
      if (d > 1e-3) this.facing = turnToward(this.facing, Math.atan2(ax, az), dt * 12);
      this.speed = this.walkSpeed;
    } else this.speed = 0;
    this.view.setPosition(this.x, this.y, this.z);
    this.view.setFacing(this.facing);
    this.view.update(dt, this.speed);
  }
}
/** How near (m) someone in the way has to be before a walker steers round them. */
const AVOID_RANGE = 0.85;
/** Everyone who can be in the way: filled once the cast exists (the conductor as a stand-in, guests, staff). */
const agents: { x: number; z: number; pose: Pose }[] = [];
let lookSeq = 0;
function guestLook(): CharacterLook {
  const pool = ARCHETYPES.filter((a) => a.accessory !== 'child');
  const a = pool[(lookSeq++ * 5) % pool.length];
  return { ...a.colors, ...a.figure, accessory: a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor } as CharacterLook;
}
class Guest extends Walker {
  state: GuestState = 'waiting';
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
  readonly had = new Set<Want>();
  lastWish: Want | null = null;
  update(dt: number): void {
    this.move(dt);
    if (this.order) {
      const long = clock - this.order.since > TUNE.patience;
      if (long && this.bubble.mood !== 'angry') sfx('grumble');
      this.bubble.set(long ? 'angry' : 'wait', this.order.item);
    } else if (this.state === 'venue' && this.venue === 'cinema' && filmT < 0) this.bubble.set('wait', 'film');
    else this.bubble.set(clock < this.happyUntil ? 'love' : 'none');
    const head = this.pose === 'sit' ? 1.5 : this.pose === 'sleep' ? 0.85 : 1.98;
    this.bubble.update(dt, this.x, this.y + head, this.z);
    if (clock < this.happyUntil && Math.random() < dt * 1.5) particles.emit('heart', this.x, this.y + head, this.z, 1, 0.15);
  }
}
// The passengers: four aboard for the whole night. One waits at the desk, two on the sofa, one on their feet beside it.
const L = views.lobby[TIER.basic].layout.anchors;
const QUEUE_SPOT: Vec2 = { x: views.lobby[TIER.basic].layout.queue[0].x, z: views.lobby[TIER.basic].layout.queue[0].z };
const guests: Guest[] = [];
for (let i = 0; i < ROOMS_TOTAL; i++) {
  const g = new Guest(guestLook(), QUEUE_SPOT.x, QUEUE_SPOT.z);
  if (i === 0) {
    g.state = 'queue';
    g.facing = -Math.PI / 2;
  } else if (i <= SOFA_SEATS.length) g.setPose('sit', { x: SOFA_SEATS[i - 1].x, y: SOFA_Y, z: SOFA_SEATS[i - 1].z, facing: 0 });
  else {
    g.x = WAIT_STAND.x;
    g.z = WAIT_STAND.z;
    g.facing = 0.4;
  }
  guests.push(g);
}
/** The next passenger on the sofa gets up and comes to the desk. */
function callNext(): Guest | null {
  const g = guests.find((x) => x.state === 'waiting');
  if (!g) return null;
  g.state = 'toDesk';
  g.walkTo(route({ x: g.x, z: g.z }, QUEUE_SPOT), () => {
    g.state = 'queue';
    g.facing = -Math.PI / 2;
  });
  return g;
}
/** The passenger at the desk, ready to check in. */
const atDesk = (): Guest | null => guests.find((g) => g.state === 'queue') ?? null;

/** Check-in: the key, and off to their room. Their bag stays at the rack: their first wish, as they go. */
function checkIn(g: Guest, room: Room): void {
  room.guest = g;
  g.room = room;
  g.state = 'toRoom';
  sfx('ding');
  keyPop(g);
  // The first passenger's bag pays exactly what Room 2 costs: their fare buys the room for the next guest.
  ask(g, 'luggage', flow.phase === 'tutorial' && flow.passenger === 0 ? TUNE.price.room2 : roomPay(g));
  const sit = sitSpot(room);
  later(0.3, () => g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }, map.nodeId(room.car, cabinOf(room).node)), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
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
function nextWish(g: Guest): Want {
  const tier = g.room ? train[g.room.car].tier : 1;
  if (!g.had.has('blanket')) return 'blanket';
  if (tier >= TIER.comfort && !g.had.has('towel')) return 'towel';
  // Then round again, never the same thing twice running: a hot drink (coffee in Luxury) or breakfast from the urn's
  // counter, the paper from the newsstand, or their shoes shined at the stand at the back.
  const drink: Want = tier >= TIER.luxury && Math.random() < 0.5 ? 'coffee' : 'tea';
  const pool: Want[] = [drink, 'breakfast', 'newspaper'];
  if (g.had.has('tea') || g.had.has('breakfast')) for (let i = 0; i < Math.round(TUNE.shoeChance * 6); i++) pool.push('shoes');
  const fresh = pool.filter((w) => w !== g.lastWish && !(w === 'coffee' && g.lastWish === 'tea') && !(w === 'tea' && g.lastWish === 'coffee'));
  return fresh[Math.floor(Math.random() * fresh.length)] ?? drink;
}
function ask(g: Guest, item: Want, amount: number): void {
  g.order = { item, since: clock, pay: item === 'shoes' ? TUNE.shoePay : amount, claimed: false };
  if (item === 'shoes') leaveShoes(g);
  g.had.add(item);
  g.lastWish = item;
  if (g.pose === 'sleep' && g.room) g.setPose('sit', sitSpot(g.room));
  g.view.act('wave', 0.8);
  sfx('bloop');
}
const roomPay = (g: Guest): number => TUNE.deliver[g.room ? train[g.room.car].tier : 1];
/** In their room, nothing asked, nothing on its way, rested. */
const ready = (g: Guest): boolean => g.state === 'room' && !g.order && !g.receiving && !g.walking && clock > g.restUntil;

// ================================================================ the café and the theatre: guests visit, then go back to bed
let cafeTier = 0;
/** The café's pastry stand is bought: orders can be a croissant too. */
let pastries = false;
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
      g.order = { item: pastries && Math.random() < 0.45 ? 'pastry' : 'latte', since: clock, pay: TUNE.cafe, claimed: false };
      g.view.act('wave', 0.8);
      sfx('bloop');
    } else if (Math.random() < 0.4 && filmT < 0) later(1, () => g.state === 'venue' && !g.order && filmT < 0 && ask(g, 'popcorn', TUNE.popcorn));
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
    pay(g, TUNE.ticket);
    later(1.4, () => g.state === 'venue' && goBack(g));
  }));
  sfx('perfect');
  if (teach === 'cinema') teach = null;
}

// ================================================================ the conductor
const player = new CharacterView(CONDUCTOR_LOOK, 1.12);
scene.add(player.root);
batch.highlight(player.root, true);
// A couple of steps from the desk: the very first move (walking to it) is the player's own.
const SPAWN = walkableNear(L.deskService.x + 0.5, L.deskService.z + 2.4);
const me = { x: SPAWN.x, z: SPAWN.z, facing: Math.PI, speed: 0, vx: 0, vz: 0 };
let speedNow = TUNE.speed;
agents.push({ get x() { return me.x; }, get z() { return me.z; }, pose: 'stand' as Pose });
agents.push(...guests);
/** What the conductor carries; a pair of shoes knows whose they are. */
const carried: { item: Want; mesh: THREE.Mesh }[] = [];
const flying: { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
const popping: { obj: THREE.Object3D; t: number; base: number }[] = [];
const tmpTo = new THREE.Vector3();
/** A carried thing: the game's item, or a pair of shoes (scuffed, or gleaming once shined). */
function itemMesh(item: Want): THREE.Mesh {
  if (item === 'shoes') {
    const mesh = new THREE.Mesh(shoesGeometry(false), MATERIALS.solid);
    mesh.scale.setScalar(1.6);
    return mesh;
  }
  return createItemMesh(item);
}
function pickUp(item: Want, count: number): void {
  for (let i = 0; i < count; i++) {
    const mesh = itemMesh(item);
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
      // What they do with it: sip a drink, open the paper, hug the rest.
      g.view.act(['tea', 'coffee', 'latte'].includes(order.item) ? 'sip' : order.item === 'newspaper' ? 'read' : 'hug', 2.4);
      g.view.bounce(1);
      deliverSound();
      particles.emit('heart', g.x, g.y + 1.6, g.z, 7, 0.3);
      particles.emit('sparkle', g.x, g.y + 1.1, g.z, 10, 0.3);
      let amount = order.pay + bonus;
      if (byPlayer && flow.phase === 'play') {
        // Serving one after another builds a combo; from x3 each serve pays a bonus.
        combo = clock - lastServe < TUNE.comboWindow ? combo + 1 : 1;
        lastServe = clock;
        if (combo >= 3) amount += TUNE.comboBonus;
        if (combo >= 2) sayLittle(`COMBO x${combo}!`);
      }
      // What they pay floats over them and bursts into coins that fly to the money counter.
      pay(g, amount);
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
/** Does this carried thing answer the guest's order (their own shoes, shined, for a shoe order)? */
function fits(c: { item: Want }, g: Guest): boolean {
  return !!g.order && g.order.item !== 'shoes' && c.item === g.order.item;
}
function serve(g: Guest): void {
  const order = g.order!;
  const i = carried.findIndex((c) => fits(c, g));
  const { mesh } = carried.splice(i, 1)[0];
  if (carried.length === 0) player.setCarrying(false);
  handOver(g, order, mesh, true);
}

// ================================================================ cash: a burst of coins flies from whoever paid to the money counter
/** Small upgrades bought so far add this to every delivery and café order. */
let bonus = 0;
/** Money still in the air (counted as soon as it lands). */
let incoming = 0;
const anchorPos = new THREE.Vector3();
const coinUrl = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  drawIcon(c.getContext('2d')!, 'cash', 32, 32, 60);
  return c.toDataURL();
})();
interface Coin { el: HTMLElement; t: number; dur: number; x0: number; y0: number; mx: number; my: number; value: number; live: boolean }
const coins: Coin[] = [];
for (let i = 0; i < 36; i++) {
  const el = document.createElement('div');
  el.className = 'ad-coin';
  el.style.backgroundImage = `url(${coinUrl})`;
  ui.appendChild(el);
  coins.push({ el, t: 0, dur: 0, x0: 0, y0: 0, mx: 0, my: 0, value: 0, live: false });
}
const counterAt = { x: 0, y: 0 };
/** A guest pays: "+$15" over them, and the amount bursts into coins that fly to the counter. */
function pay(g: { x: number; y: number; z: number; pose?: Pose }, amount: number): void {
  floatText(`<b>+$${amount}</b>`, g.x, g.y + (g.pose === 'stand' ? 2.2 : 1.8), g.z, 'pay');
  coinBurst(g.x, g.y + 1.2, g.z, amount);
}
function coinBurst(x: number, y: number, z: number, amount: number): void {
  tmpV.set(x, y, z);
  const ok = stage.project(tmpV, proj);
  const free = coins.filter((c) => !c.live);
  const n = Math.min(free.length, TUNE.coins);
  if (!ok || n === 0) {
    money += amount;
    bumpT = 1;
    coinSound();
    return;
  }
  incoming += amount;
  for (let i = 0; i < n; i++) {
    const c = free[i];
    const share = Math.floor(amount / n) + (i < amount % n ? 1 : 0);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    c.live = true;
    c.t = -i * 0.045;
    c.dur = 0.62 + Math.random() * 0.12;
    c.x0 = proj.x;
    c.y0 = proj.y;
    // Each coin bursts out a little first, then curves up to the counter.
    c.mx = proj.x + Math.cos(a) * 46;
    c.my = proj.y + Math.sin(a) * 34 - 20;
    c.value = share;
  }
}
function updateCoins(dt: number): void {
  const r = cashBox.getBoundingClientRect();
  counterAt.x = r.left + 30;
  counterAt.y = r.top + r.height / 2;
  for (const c of coins) {
    if (!c.live) continue;
    c.t += dt / c.dur;
    if (c.t < 0) {
      c.el.style.opacity = '0';
      continue;
    }
    const k = Math.min(1, c.t);
    // A quick burst out (the first quarter), then an eased flight to the counter.
    const out = Math.min(1, k / 0.25);
    const fly = Math.max(0, (k - 0.25) / 0.75);
    const e = fly * fly * (3 - 2 * fly);
    const bx = c.x0 + (c.mx - c.x0) * (1 - (1 - out) * (1 - out));
    const by = c.y0 + (c.my - c.y0) * (1 - (1 - out) * (1 - out));
    const x = bx + (counterAt.x - bx) * e;
    const y = by + (counterAt.y - by) * e - Math.sin(e * Math.PI) * 40;
    const s = 0.8 + Math.sin(out * Math.PI) * 0.35 - e * 0.25;
    c.el.style.opacity = '1';
    c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(2)})`;
    if (k >= 1) {
      c.live = false;
      c.el.style.opacity = '0';
      incoming -= c.value;
      money += c.value;
      bumpT = 1;
      coinSound();
    }
  }
}

/** The rack holds exactly the bags waiting to be taken to their rooms (a guest's bag appears as they check in). */
let rackBags = -1;
let rackView: CarriageView | null = null;
function updateRackBags(): void {
  const n = guests.filter((g) => g.order?.item === 'luggage' && !g.order.claimed).length - carried.filter((c) => c.item === 'luggage').length
    + helpers.filter((h) => h.phase === 'toSource' && h.order?.item === 'luggage').length;
  const view = train[SLOT.lobby].view;
  if (n === rackBags && view === rackView) return;
  rackBags = n;
  rackView = view;
  view.setLuggageCount(Math.max(0, n));
}

// ================================================================ stations: the desk, the tea, the linen, the bags, the café
interface Station { kind: 'desk' | 'source' | 'film' | 'shine' | 'clean'; items: Want[]; car: number; x: number; z: number; marker: JobMarker; progress: number; wants: boolean }
const stations: Station[] = [];
function addStation(kind: Station['kind'], items: Want[], car: number, local: Vec2, icon: IconName, badgeOver?: Vec2): Station {
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
  const s: Station = { kind, items, car, x: p.x, z: p.z, marker, progress: 0, wants: false };
  stations.push(s);
  return s;
}
const desk = addStation('desk', [], SLOT.lobby, L.deskService, 'key', { x: -1.17, z: 3.4 });
addStation('source', ['tea', 'coffee', 'breakfast'], SLOT.lobby, L.urn, 'tea');
addStation('source', ['blanket', 'towel'], SLOT.lobby, L.linen, 'blanket');
addStation('source', ['luggage'], SLOT.lobby, L.rack, 'luggage');
// The papers have their own stand on the far side of the reception, and shoes go to the stand at the back of the
// carriage: different jobs, different walks.
scene.add(newsstand(COMPACT_LOBBY.newsstand));
addStation('source', ['newspaper'], SLOT.lobby, L.news, 'newspaper', { x: (COMPACT_LOBBY.newsstand.x0 + COMPACT_LOBBY.newsstand.x1) / 2, z: (COMPACT_LOBBY.newsstand.z0 + COMPACT_LOBBY.newsstand.z1) / 2 });

// ================================================================ the washroom: a guest uses it, the conductor tidies it (a tip)
const BATH = views.lobby[TIER.basic].layout.bathrooms[0];
type WashState = 'free' | 'busy' | 'dirty';
let washState: WashState = 'free';
/** Test counts (shown in the test hook's state). */
const stats = { cleaned: 0, shined: 0, washed: 0, attendant: 0, dropped: 0 };
const MESS_AT = { x: BATH.room.x0 + 1.3, z: BATH.room.z0 + 1.15 };
const WALL_HEIGHT = INTERIOR_WALL_HEIGHT;
const washDoor = slidingDoor(BATH.door[1] - BATH.door[0], WALL_HEIGHT + 0.02);
const mess = washMess(MESS_AT.x, MESS_AT.z);
mess.group.visible = false;
scene.add(mess.group);
const washStation = addStation('clean', [], SLOT.lobby, BATH.restock, 'broom', MESS_AT);
// The washroom's entry: the curved front corner and a wide sliding door of frosted glass on the corridor side.
{
  const R = COMPACT_LOBBY.washCurve;
  scene.add(curvedWall(PARTITION_X1 + R, BATH.room.z0 - 0.06 + R, R, WALL_HEIGHT));
  const [d0, d1] = BATH.door;
  washDoor.position.set(PARTITION_X0 - 0.05, FLOOR_Y, (d0 + d1) / 2);
  washDoor.userData.closedZ = (d0 + d1) / 2;
  washDoor.userData.travel = d1 - d0 - 0.1;
  scene.add(washDoor);
}
/** The door slides open for anyone coming in or out, and closes behind them. */
let washDoorOpen = 0;
function updateWashDoor(dt: number): void {
  const cz = washDoor.userData.closedZ as number;
  const near = (x: number, z: number): boolean => Math.hypot(x - PARTITION_X0, z - cz) < 1.4 || inWashroom(x, z);
  const want = near(me.x, me.z) || guests.some((g) => near(g.x, g.z) && (g.walking || g.state === 'washing')) ? 1 : 0;
  washDoorOpen += (want - washDoorOpen) * Math.min(1, dt * (want ? 9 : 4));
  washDoor.position.z = cz - washDoorOpen * (washDoor.userData.travel as number);
}
/**
 * The mess, animated: on arrival a splash, the puddle spreads and each piece drops in with a bounce, then a little
 * cloud of flies; while it is tidied, the pieces vanish one by one in order with the ring's fill, the puddle dries
 * away, and it ends in a ring of sparkle and "Spotless!".
 */
let messT = -1;
const flies = new THREE.Group();
{
  const geo = new THREE.SphereGeometry(0.018, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: '#2B2230' });
  for (let i = 0; i < 4; i++) flies.add(new THREE.Mesh(geo, mat));
  flies.visible = false;
  flies.position.set(MESS_AT.x, FLOOR_Y + 0.55, MESS_AT.z);
  scene.add(flies);
}
function messArrives(): void {
  mess.group.visible = true;
  messT = 0;
  mess.puddle.scale.setScalar(0.001);
  for (const p of mess.pieces) p.visible = false;
  particles.emit('sparkle', MESS_AT.x, FLOOR_Y + 0.3, MESS_AT.z, 14, 0.4);
}
function updateMess(dt: number): void {
  if (!mess.group.visible) {
    flies.visible = false;
    return;
  }
  if (messT >= 0) messT += dt;
  const clean = washState === 'dirty' ? washStation.progress : 0;
  // The puddle spreads in, then dries away with the cleaning.
  const spread = messT < 0 ? 1 : Math.min(1, messT / 0.6);
  mess.puddle.scale.set(spread * (1 - clean * 0.95), 1, spread * (1 - clean * 0.95));
  mess.pieces.forEach((p, i) => {
    const at = 0.25 + i * 0.12;
    const k = messT < 0 ? 1 : Math.max(0, Math.min(1, (messT - at) / 0.35));
    // Dropping in with a bounce; gone once the cleaning has got past its share.
    const gone = clean > (i + 1) / (mess.pieces.length + 1);
    if (gone && p.visible && p.userData.gone !== true) {
      p.userData.gone = true;
      particles.emit('dust', MESS_AT.x + p.position.x, FLOOR_Y + 0.1, MESS_AT.z + p.position.z, 5, 0.2);
      sfx('pop', 1 + i * 0.08);
    }
    p.visible = k > 0 && !gone;
    if (!gone) p.userData.gone = false;
    p.position.y = k < 1 ? (1 - k) * 0.45 + Math.abs(Math.sin(k * Math.PI * 2)) * 0.05 * (1 - k) : 0;
  });
  // A little cloud of flies over it while it waits.
  flies.visible = washState === 'dirty' && clean < 0.5 && (messT < 0 || messT > 1.0);
  if (flies.visible) {
    flies.children.forEach((f, i) => {
      const t = clock * (2.2 + i * 0.4) + i * 1.7;
      f.position.set(Math.cos(t) * 0.18, Math.sin(t * 1.7) * 0.08, Math.sin(t * 1.3) * 0.18);
    });
  }
}
const inWashroom = (x: number, z: number): boolean => x > BATH.room.x0 && x < BATH.room.x1 && z > BATH.room.z0 && z < BATH.room.z1;
/** A guest goes to the washroom (between requests); it is left in need of a tidy. */
function visitWashroom(g: Guest): boolean {
  if (washState !== 'free' || g.state !== 'room') return false;
  washState = 'busy';
  g.state = 'toWash';
  g.walkTo(route({ x: g.x, z: g.z }, BATH.useSpot), () => {
    g.state = 'washing';
    stats.washed++;
    g.facing = Math.PI / 2;
    g.view.act('wash', TUNE.washSeconds);
    later(TUNE.washSeconds, () => {
      washState = 'dirty';
      messArrives();
      sfx('drip');
      backToRoom(g);
    });
  });
  return true;
}
function backToRoom(g: Guest): void {
  const room = g.room!;
  g.state = 'back';
  const sit = sitSpot(room);
  g.walkTo(route({ x: g.x, z: g.z }, { x: sit.x - 0.35, z: sit.z }), () => {
    g.setPose('sit', sitSpot(room));
    g.state = 'room';
    g.restUntil = clock + TUNE.rest[0];
  });
}
/** Tidied: the mess sweeps away with a sparkle, and the washroom's tip bursts out. */
function cleanWashroom(): void {
  washState = 'free';
  stats.cleaned++;
  mess.group.visible = false;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    particles.emit('sparkle', MESS_AT.x + Math.cos(a) * 0.5, FLOOR_Y + 0.3, MESS_AT.z + Math.sin(a) * 0.5, 2, 0.2);
  }
  floatText('<b>Spotless!</b>', MESS_AT.x, FLOOR_Y + 1.6, MESS_AT.z, 'praise');
  deliverSound();
  pay({ x: BATH.room.x0 + 1.3, y: FLOOR_Y, z: BATH.room.z0 + 1.0, pose: 'stand' }, TUNE.washTip + bonus);
}

// ================================================================ shoe shine: the shoes wait outside the door; stand there and they shine
/**
 * A guest who wants their shoes shined leaves them in the corridor beside their door. The conductor stands on them a
 * moment (the ring fills, a brisk polish, sparkles) and they gleam; the guest pays. No stand, no carrying.
 */
interface ShoeJob { g: Guest; mesh: THREE.Mesh; marker: JobMarker; x: number; z: number; progress: number; done: boolean; t: number }
const shoeJobs: ShoeJob[] = [];
function leaveShoes(g: Guest): void {
  const c = cabinOf(g.room!);
  const x = PARTITION_SHOE_X;
  const z = lz(c.door[0] - 0.25);
  const mesh = itemMesh('shoes');
  mesh.position.set(x, FLOOR_Y + 0.01, z);
  mesh.rotation.y = Math.PI / 2;
  mesh.scale.setScalar(0.001);
  scene.add(mesh);
  popping.push({ obj: mesh, t: 0, base: 1.5 });
  const marker = new JobMarker('shoe');
  marker.setPosition(x, z);
  marker.setIconAnchor(0, 0, 0.9);
  scene.add(marker.group);
  shoeJobs.push({ g, mesh, marker, x, z, progress: 0, done: false, t: 0 });
}
function updateShoes(dt: number): void {
  for (let i = shoeJobs.length - 1; i >= 0; i--) {
    const j = shoeJobs[i];
    if (j.done) {
      j.t += dt;
      // Taken back in after a moment to gleam.
      if (j.t > 1.4) {
        shrinking.push({ obj: j.mesh, t: 0 });
        scene.remove(j.marker.group);
        shoeJobs.splice(i, 1);
      }
      j.marker.iconShown = false;
      j.marker.update(dt);
      continue;
    }
    const on = Math.hypot(me.x - j.x, me.z - j.z) < TUNE.shoeReach && flow.phase === 'play';
    j.progress = on ? Math.min(1, j.progress + dt / TUNE.shineSeconds) : Math.max(0, j.progress - dt * 2);
    if (on) {
      if (Math.random() < dt * 10) particles.emit('sparkle', j.x, FLOOR_Y + 0.25, j.z, 1, 0.2);
      player.act('wash', 0.3);
    }
    j.marker.iconShown = true;
    j.marker.working = j.progress > 0;
    j.marker.progress = j.progress;
    j.marker.update(dt);
    if (j.progress >= 1) {
      j.done = true;
      j.mesh.geometry = shoesGeometry(true);
      popping.push({ obj: j.mesh, t: 0, base: 1.5 });
      particles.emit('sparkle', j.x, FLOOR_Y + 0.4, j.z, 26, 0.4);
      particles.emit('star', j.x, FLOOR_Y + 0.6, j.z, 8, 0.3);
      sfx('sparkle');
      stats.shined++;
      const g = j.g;
      if (g.order?.item === 'shoes') {
        const amount = g.order.pay + bonus;
        g.order = null;
        g.happyUntil = clock + 2.4;
        g.restUntil = clock + TUNE.rest[0] + Math.random() * (TUNE.rest[1] - TUNE.rest[0]);
        deliverSound();
        pay(g, amount);
        flow.done('deliver');
      }
    }
  }
}
/** Shoes stand in the corridor just outside the room, against its wall. */
const PARTITION_SHOE_X = -0.98;

// ================================================================ the rooms' own upgrades: big enough to see
/** Each room's lamp, flowers and minibar, along its front wall (a strip kept clear for them in the plan). */
const decorBought = new Set<'lamp' | 'flowers' | 'minibar'>();
const decorShown = new Map<string, THREE.Group>();
function syncDecor(pop: boolean): void {
  for (const r of rooms) {
    if (!r.open || r.car !== SLOT.lobby) continue;
    const c = cabinOf(r);
    // Along the front wall, clear of the door leaves' swing: the minibar, then the lamp by the head of the bed; the
    // flowers on their little table by the back wall (each spot is kept clear in the plan).
    const front = lz(c.room.z0 + 0.27);
    const pos = {
      minibar: { x: COMPACT_LOBBY.decorX0 + 0.3, z: front },
      lamp: { x: c.bed.x0 - 0.24, z: front },
      flowers: { x: 0.7, z: lz(c.room.z1 - 0.28) },
    };
    for (const key of decorBought) {
      const id = `${r.cabin}:${key}`;
      if (decorShown.has(id)) continue;
      const p = pos[key];
      const g = key === 'lamp' ? floorLamp(p.x, p.z) : key === 'flowers' ? bouquet(p.x, p.z) : minibar(p.x, p.z);
      scene.add(g);
      decorShown.set(id, g);
      if (pop) {
        g.scale.setScalar(0.001);
        popping.push({ obj: g, t: Math.random() * -0.3, base: 1 });
      }
    }
  }
}
function addDecor(key: 'lamp' | 'flowers' | 'minibar'): void {
  decorBought.add(key);
  syncDecor(true);
}

/** How many of an item are asked for and not yet in hand (or on an Attendant's way). */
function needed(item: Want): number {
  // Shoes come from their owner, never from a cupboard.
  if (item === 'shoes') return 0;
  return guests.filter((g) => g.order?.item === item && !g.order.claimed).length - carried.filter((c) => c.item === item).length;
}
function approach(g: Guest): Vec2 {
  if (g.room && g.state === 'room') return roomCentre(g.room);
  return walkableNear(g.x + (g.x > -0.6 ? -0.8 : 0.8), g.z);
}
/** Where an item comes from for a guest: the cupboard of their own carriage (or the nearest one). */
function sourceFor(item: Want, near?: Vec2): Station | null {
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
interface Helper { w: Walker; items: Want[]; task: Guest | null; order: Order | null; carrying: THREE.Mesh | null; phase: 'idle' | 'toSource' | 'pick' | 'toGuest'; t: number; since: number }
const helpers: Helper[] = [];
let helperSpeed = TUNE.attendantSpeed;
const ROOM_ITEMS: Want[] = ['tea', 'coffee', 'breakfast', 'newspaper', 'blanket', 'towel', 'luggage'];
const VENUE_ITEMS: Want[] = ['latte', 'pastry', 'popcorn'];
function hireAttendant(items: Want[], home: Vec2): void {
  const w = new Walker(STAFF_LOOKS.attendant, home.x, home.z);
  w.walkSpeed = helperSpeed;
  helpers.push({ w, items, task: null, order: null, carrying: null, phase: 'idle', t: 0, since: 0 });
  agents.push(w);
  // She grows in with a bounce (never pops in).
  popping.push({ obj: w.view.root, t: 0, base: w.view.root.scale.x });
  w.view.root.scale.setScalar(0.001);
  particles.emit('confetti', w.x, FLOOR_Y + 1.5, w.z, 40, 0.6);
  sfx('staff');
}
/** Lets go of a job she cannot finish (the guest left, or it ran too long): the request is free again for anyone. */
function dropTask(h: Helper): void {
  stats.dropped++;
  if (h.order && h.task?.order === h.order) h.order.claimed = false;
  if (h.carrying) shrinking.push({ obj: h.carrying, t: 0 });
  h.carrying = null;
  h.task = null;
  h.order = null;
  h.phase = 'idle';
  h.w.path = [];
  h.w.onArrive = null;
  h.w.view.setCarrying(false);
}
function updateHelpers(dt: number): void {
  for (const h of helpers) {
    h.w.walkSpeed = helperSpeed;
    h.w.move(dt);
    // Never stuck on a job: if the guest's request changed or went, or it is taking far too long, she lets it go.
    if (h.phase !== 'idle') {
      const gone = !h.task || h.task.order !== h.order || (h.task.state !== 'room' && h.task.state !== 'venue');
      if (gone || clock - h.since > TUNE.attendantGiveUp) {
        dropTask(h);
        continue;
      }
    }
    if (h.phase === 'idle') {
      // The oldest request of her kind nobody is bringing.
      const g = guests.filter((x) => x.order && h.items.includes(x.order.item) && !x.order.claimed && clock - x.order.since > TUNE.attendantWait && (x.state === 'room' || x.state === 'venue') && needed(x.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since)[0];
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
      h.since = clock;
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
      const mesh = itemMesh(order.item);
      scene.add(mesh);
      h.carrying = mesh;
      h.phase = 'toGuest';
      h.w.walkTo(route(h.w, approach(g)), () => {
        if (h.carrying) {
          handOver(g, order, h.carrying, false);
          stats.attendant++;
        }
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
interface Tile { step: Step; view: TileView; x: number; z: number; paid: number; sent: number; timer: number; done: boolean; age: number; stood: number }
const tiles: Tile[] = [];
function showTile(step: Step): void {
  const at = step.tile();
  const p = walkableNear(at.x, at.z);
  const view = new TileView(1.4);
  view.setPosition(p.x, p.z);
  // Grows in (never pops in): `updateTiles` eases its scale up from nothing.
  view.group.scale.setScalar(0.001);
  scene.add(view.group);
  const t: Tile = { step, view, x: p.x, z: p.z, paid: 0, sent: 0, timer: 0, done: false, age: 0, stood: 0 };
  tiles.push(t);
  drawTile(t);
  particles.emit('sparkle', p.x, FLOOR_Y + 0.3, p.z, 18, 0.5);
  sfx('ready');
}
function drawTile(t: Tile): void {
  const left = Math.max(0, Math.round(t.step.price - t.paid));
  const can = money >= t.step.price - t.sent;
  t.view.face.draw(t.step.icon, left, t.paid / t.step.price, can, t.sent > 0);
  t.view.marker.draw(t.step.icon, t.step.name, left, can);
}
const shrinking: { obj: THREE.Object3D; t: number }[] = [];
function updateTiles(dt: number): void {
  for (const t of tiles.slice()) {
    t.age += dt;
    const grow = Math.min(1, t.age / 0.35);
    if (grow < 1) t.view.group.scale.setScalar(Math.max(0.001, 1 - Math.cos(grow * Math.PI * 2.2) * Math.exp(-grow * 4) * (1 - grow)));
    else t.view.group.scale.setScalar(1);
    const on = Math.hypot(t.x - me.x, t.z - me.z) < TUNE.tileReach;
    const left = t.step.price - t.sent;
    t.view.update(dt, money >= left, on, true, false);
    // Money goes in only once the conductor stops on the tile (walking across one on the way somewhere never pays).
    t.stood = on && me.speed < TUNE.tileStopSpeed ? t.stood + dt : on && t.sent > 0 ? t.stood : 0;
    if (!on || t.done || t.stood < TUNE.tileStand) continue;
    t.timer -= dt;
    // Only money really held goes in: never free, and a part-paid upgrade keeps its fill.
    const chunk = Math.max(1, Math.ceil(t.step.price / TUNE.drainBills));
    while (t.timer <= 0 && t.sent < t.step.price && money > 0) {
      t.timer += TUNE.drain;
      const part = Math.min(chunk, t.step.price - t.sent, money);
      t.sent += part;
      money -= part;
      shownMoney = Math.min(shownMoney, money + 0.49);
      const from = anchorPos.clone();
      // The bills are the look; the fill itself eases smoothly toward what has been paid (below).
      cash.stream(() => from, () => tmpTo.set(t.x, FLOOR_Y + 0.12, t.z), 1, 0, () => sfx('tick', 0.9 + (t.paid / t.step.price) * 0.7));
    }
  }
  // The fill: a smooth, steady rise toward what has been paid (a moment behind the bills, so they seem to fill it),
  // redrawn in small steps; the purchase lands once it is full.
  for (const t of tiles.slice()) {
    if (t.paid === t.sent) continue;
    const before = t.paid;
    t.paid = Math.min(t.sent, t.paid + Math.max(t.step.price * dt * 0.9, (t.sent - t.paid) * dt * 6));
    if (t.sent - t.paid < 0.01) t.paid = t.sent;
    if (Math.floor((t.paid / t.step.price) * 64) !== Math.floor((before / t.step.price) * 64) || t.paid === t.sent) drawTile(t);
    if (t.paid >= t.step.price && !t.done) complete(t);
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
}
/** A purchase lands: a burst on the tile, the camera pushes in on what it buys, the swap, a sound and a small shake. */
function complete(t: Tile): void {
  t.done = true;
  tiles.splice(tiles.indexOf(t), 1);
  shrinking.push({ obj: t.view.group, t: 0 });
  bought.add(t.step.id);
  particles.emit('sparkle', t.x, FLOOR_Y + 0.4, t.z, 30, 0.6);
  particles.emit('star', t.x, FLOOR_Y + 0.6, t.z, 12, 0.5);
  sfx('unlock');
  upgradeSound();
  stage.rig.shake(TUNE.shake, 0.25);
  if (!t.step.big) {
    // The camera pushes in on the object for a moment; the object swaps with a sparkle and a burst.
    const f = t.step.focus();
    pushIn(f.x, f.z);
    later(0.35, () => {
      t.step.buy();
      particles.emit('sparkle', f.x, FLOOR_Y + 0.9, f.z, 34, 0.7);
      particles.emit('star', f.x, FLOOR_Y + 1.1, f.z, 14, 0.5);
      particles.emit('confetti', f.x, FLOOR_Y + 1.4, f.z, 22, 0.5);
      stage.rig.punch(0.05);
      if (t.step.bonus) bonus += t.step.bonus;
      say(`${t.step.name.toUpperCase()}!`, t.step.bonus ? `Every request pays +$${t.step.bonus}` : t.step.note ?? '');
    });
  } else t.step.buy();
  flow.done('buy');
}
function pushIn(x: number, z: number, seconds = TUNE.pushIn, zoom = TUNE.pushZoom): void {
  stage.rig.focusOn(new THREE.Vector3(x, 0, z), seconds, zoom, 4);
}

// ================================================================ the upgrades: small ones in place, then the big ones
/**
 * One purchase. A small one changes something you can see in place (a room opens, lamps and flowers appear in every
 * room, a rug, a bigger luggage rack) and adds a little to every delivery; a big one (the Attendant, a new class, a
 * new carriage) is a moment of its own and only comes once every small one before it is bought.
 */
interface Step {
  id: keyof typeof TUNE.price;
  name: string;
  icon: IconName;
  big?: true;
  /** Added to every delivery once bought. */
  bonus?: number;
  /** A line under the caption (when there is no bonus to show). */
  note?: string;
  /** Where its tile stands (world). */
  tile: () => Vec2;
  /** What the camera pushes in on (world). */
  focus: () => Vec2;
  buy: () => void;
  readonly price: number;
}
const lz = (z: number): number => carriageOriginZ(SLOT.lobby) + z;
const cz = (z: number): number => carriageOriginZ(SLOT.cafe) + z;
const tz = (z: number): number => carriageOriginZ(SLOT.cinema) + z;
const lobbyCabin = (i: number): CabinLayout => views.lobby[TIER.basic].layout.cabins[i];
const roomFocus = (i: number) => (): Vec2 => ({ x: lobbyCabin(i).center.x, z: lz(lobbyCabin(i).center.z) });
const corridorBy = (i: number) => (): Vec2 => ({ x: -1.4, z: lz(lobbyCabin(i).center.z) });
const RUG = { x0: -0.45, z0: 1.55, x1: 1.5, z1: 4.45 };
const upgrade = (s: Omit<Step, 'price'>): Step => ({ ...s, get price() { return TUNE.price[s.id]; } });
const STEPS: Step[] = [
  upgrade({ id: 'room2', name: 'Room 2', icon: 'bed', note: 'A new guest can check in', tile: corridorBy(1), focus: roomFocus(1), buy: () => openRoom(1) }),
  upgrade({ id: 'room3', name: 'Room 3', icon: 'bed', note: 'A new guest can check in', tile: corridorBy(2), focus: roomFocus(2), buy: () => openRoom(2) }),
  upgrade({ id: 'lamps', name: 'Reading Lamps', icon: 'star', bonus: TUNE.smallBonus, tile: corridorBy(0), focus: roomFocus(0), buy: () => addDecor('lamp') }),
  upgrade({ id: 'room4', name: 'Room 4', icon: 'bed', note: 'A new guest can check in', tile: corridorBy(3), focus: roomFocus(3), buy: () => openRoom(3) }),
  upgrade({ id: 'flowers', name: 'Fresh Flowers', icon: 'heart', bonus: TUNE.smallBonus, tile: corridorBy(1), focus: roomFocus(1), buy: () => addDecor('flowers') }),
  upgrade({ id: 'rug', name: 'Lobby Rug', icon: 'star', bonus: TUNE.smallBonus, tile: () => ({ x: 0.5, z: lz(3.75) }), focus: () => ({ x: 0.5, z: lz(3.0) }), buy: () => setRug(true) }),
  upgrade({ id: 'attendant', name: 'Attendant', icon: 'person', big: true, tile: () => ({ x: -1.5, z: lz(6.35) }), focus: () => ({ x: L.home_attendant.x, z: lz(L.home_attendant.z) }), buy: hireFirstAttendant }),
  upgrade({ id: 'comfort', name: 'Comfort Class', icon: 'star', big: true, tile: () => ({ x: -1.5, z: lz(6.35) }), focus: () => ({ x: 0, z: lz(10) }), buy: () => classUp(TIER.comfort) }),
  upgrade({ id: 'minibar', name: 'Minibars', icon: 'snack', bonus: TUNE.smallBonus, tile: corridorBy(0), focus: roomFocus(0), buy: () => addDecor('minibar') }),
  upgrade({ id: 'skates', name: 'Skates', icon: 'skate', note: 'You move a little faster', tile: () => ({ x: 0.5, z: lz(3.75) }), focus: () => ({ x: me.x, z: me.z }), buy: buySkates }),
  upgrade({ id: 'cafe', name: 'Café Car', icon: 'latte', big: true, tile: () => ({ x: -1.0, z: lz(17.05) }), focus: () => ({ x: 0, z: cz(9) }), buy: buyCafe }),
  upgrade({ id: 'pastry', name: 'Pastry Stand', icon: 'pastry', bonus: TUNE.smallBonus, tile: () => ({ x: -1.15, z: cz(6.35) }), focus: () => ({ x: 1.0, z: cz(6.35) }), buy: buyPastries }),
  upgrade({ id: 'luxury', name: 'Luxury Class', icon: 'crown', big: true, tile: () => ({ x: -1.5, z: lz(6.35) }), focus: () => ({ x: 0, z: lz(10) }), buy: () => classUp(TIER.luxury) }),
  upgrade({ id: 'theatre', name: 'Theatre Car', icon: 'film', big: true, tile: () => ({ x: 0, z: cz(17.1) }), focus: () => ({ x: 0, z: tz(9) }), buy: buyTheatre }),
  upgrade({ id: 'speakers', name: 'Big Speakers', icon: 'bolt', bonus: TUNE.smallBonus, tile: () => ({ x: -1.3, z: tz(14.2) }), focus: () => ({ x: -1.6, z: tz(9.5) }), buy: () => addExtra('station_sound') }),
  upgrade({ id: 'premiere', name: 'Red Carpet', icon: 'star', bonus: TUNE.smallBonus, tile: () => ({ x: -1.3, z: tz(2.9) }), focus: () => ({ x: 0, z: tz(3) }), buy: () => addExtra('menu_premiere') }),
  upgrade({ id: 'dining', name: 'Dining Car', icon: 'meal', big: true, tile: () => ({ x: -0.3, z: tz(14.4) }), focus: () => ({ x: 0, z: carriageOriginZ(SLOT.dining) + 9 }), buy: buyDining }),
];
const bought = new Set<Step['id']>();
/** The steps still to buy, in order. */
const pending = (): Step[] => STEPS.filter((s) => !bought.has(s.id));
/** The next big goal (for the bar at the top) and how far along the way to it the player is (0..1). */
function nextBig(): { step: Step; progress: number } | null {
  const left = pending();
  const big = left.find((s) => s.big);
  if (!big) return null;
  const i = STEPS.indexOf(big);
  let from = i - 1;
  while (from >= 0 && !STEPS[from].big) from--;
  const span = STEPS.slice(from + 1, i + 1);
  const done = span.filter((s) => bought.has(s.id)).length;
  const onBig = done === span.length - 1 ? Math.min(1, (money + incoming) / big.price) : 0;
  return { step: big, progress: Math.min(1, (done + onBig) / span.length) };
}
/** Shows the tiles of what can be bought now: the next small ones (two at a time), or the next big one alone. */
function revealUpgrades(): void {
  if (!flow.allows('upgrade') || ended) return;
  const left = pending();
  const want: Step[] = [];
  if (flow.phase === 'tutorial') {
    if (flow.stepId === 'buy' && left[0]?.id === 'room2') want.push(left[0]);
  } else {
    for (const s of left) {
      if (s.big) {
        if (want.length === 0) want.push(s);
        break;
      }
      if (want.length < TUNE.tilesAtOnce) want.push(s);
    }
  }
  for (const s of want) if (!tiles.some((t) => t.step === s)) showTile(s);
}

// ================================================================ what the small upgrades change
/** A room opens: its lid lifts and dissolves in a puff of dust, the lights come on, the bed drops in. */
function openRoom(cabin: number): void {
  const view = train[SLOT.lobby].view;
  const lid = view.takeCover(`cabin:${cabin}`);
  const c = lobbyCabin(cabin);
  const at = { x: c.center.x, z: lz(c.center.z) };
  if (lid) lifting.push({ obj: lid, t: 0 });
  sfx('pop');
  later(0.45, () => {
    view.setCabinLocked(cabin, false);
    const bed = view.cabinBeds[cabin];
    if (bed) popping.push({ obj: bed, t: 0, base: 1 });
    particles.emit('dust', at.x, FLOOR_Y + 0.4, at.z, 20, 0.6);
    const r = rooms.find((x) => x.car === SLOT.lobby && x.cabin === cabin);
    if (r) r.open = true;
    syncDecor(true);
    rebuildTrain();
    sfx('reveal');
  });
}
const lifting: { obj: THREE.Object3D; t: number }[] = [];
function updateLifting(dt: number): void {
  for (let i = lifting.length - 1; i >= 0; i--) {
    const l = lifting[i];
    l.t += dt / 0.7;
    const k = Math.min(1, l.t);
    l.obj.position.y = Math.sin(k * Math.PI * 0.5) * 0.9;
    l.obj.scale.setScalar(Math.max(0.001, 1 - k * k));
    if (k >= 1) {
      l.obj.parent?.remove(l.obj);
      disposeTree(l.obj);
      lifting.splice(i, 1);
    }
  }
}
/** The lobby's welcome rug over the waiting area (a plain rug with a border; the classes bring their own floors). */
const rug = plainMat(RUG.x0, RUG.z0, RUG.x1, RUG.z1, '#B5473F', '#E9C46A');
rug.visible = false;
scene.add(rug);
function setRug(on: boolean): void {
  rug.visible = on && train[SLOT.lobby].tier === TIER.basic;
  if (on) popping.push({ obj: rug, t: 0, base: 1 });
}
function addExtra(key: string): void {
  const view = views.cinema;
  extras.push(key);
  view.setVenueExtras(extras);
}
const extras: string[] = [];
function buyPastries(): void {
  pastries = true;
  views.cafe.setVenueExtras(['menu_pastry']);
  addStation('source', ['pastry'], SLOT.cafe, views.cafe.layout.venue!.stations[1].pad, 'pastry', { x: 1.91, z: 6.35 });
}
function hireFirstAttendant(): void {
  const home = ATTENDANT_HOME();
  pushIn(home.x, home.z, 2.2, 0.75);
  hireAttendant(ROOM_ITEMS, home);
  later(0.3, () => say('ATTENDANT HIRED!', 'She brings the guests what they ask for'));
}
/** Roller skates: the conductor glides a little faster (never so fast it feels slippery). */
let skates = false;
/** How far the wheels reach below the shoe soles (m). */
const SKATE_LIFT = 0.05;
/** The skates themselves, on the conductor's feet (the game's own model: a boot over the shoe, two wheels). */
const skateMeshes: THREE.Mesh[] = [];
{
  const skate = new GeoBuilder()
    .rounded(0, -LEG_LENGTH + 0.06, 0.03, 0.13, 0.08, 0.24, 0.03, '#E26D8C', { shade: 0.95 })
    .box(0, -LEG_LENGTH + 0.01, 0.03, 0.1, 0.02, 0.22, '#2B2230', 0, { shade: 1 });
  for (const z of [-0.06, 0.12]) skate.cylinder(0, -LEG_LENGTH - 0.015, z, 0.035, 0.035, 0.1, '#FFD35C', 10, 'x', { shade: 1 });
  const geometry = skate.build();
  for (const pivot of player.legPivots) {
    const mesh = new THREE.Mesh(geometry, MATERIALS.character);
    mesh.visible = false;
    pivot.add(mesh);
    skateMeshes.push(mesh);
  }
}
function buySkates(): void {
  skates = true;
  for (const m of skateMeshes) {
    m.visible = true;
    m.scale.setScalar(0.001);
    popping.push({ obj: m, t: 0, base: 1 });
  }

  speedNow *= TUNE.skates;
  particles.emit('confetti', me.x, FLOOR_Y + 1.4, me.z, 30, 0.6);
  sfx('staff');
}

/** A new carriage's moment: seconds rolling in, seconds for the tarp to come off. */
const ROLL_SECONDS = 1.6;
const TARP_SECONDS = 1.9;
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
  // The big moment: the camera stays on the new carriage while it rolls in and its tarp comes off.
  pushIn(0, z + CARRIAGE_LENGTH * 0.5, ROLL_SECONDS + 0.4 + TARP_SECONDS, 1.05);
  rolling.push({
    group: view.group, t: 0, z,
    done: () => {
      sfx('clunk');
      if (flow.allows('camera')) stage.rig.shake(0.08, 0.25);
      burstAlong(z - 0.6, z + 1.2, 'dust', 22);
      later(0.4, () => {
        const tarp = view.takeCarriageCover();
        if (tarp) tarps.push({ view, mesh: tarp, t: 0, ropes: 0, z });
        sfx('whoosh');
        later(TARP_SECONDS * 0.85, () => {
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
    tp.t += dt / TARP_SECONDS;
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
  couple(views.cafe, 'cafe', 1, () => {
    cafeTier = 1;
    const v = views.cafe.layout.venue!;
    addStation('source', ['latte'], SLOT.cafe, v.stations[0].pad, 'latte', { x: 1.93, z: 3.07 });
    say('CAFÉ CAR!', 'Guests come for coffee');
    teach = 'cafe';
  });
}
let projector: Station | null = null;
function buyTheatre(): void {
  couple(views.cinema, 'cinema', CINEMA_TIER, () => {
    theatreOpen = true;
    const v = views.cinema.layout.venue!;
    addStation('source', ['popcorn'], SLOT.cinema, v.stations[0].pad, 'popcorn', { x: 1.93, z: 2.9 });
    projector = addStation('film', [], SLOT.cinema, v.projector!, 'film');
    say('THEATRE CAR!', 'Start the movie · every seat pays');
    teach = 'cinema';
  });
}

function buyDining(): void {
  couple(views.dining, 'dining', DINING_TIER, () => {
    say('DINING CAR!', 'The finest train on the line');
    later(TUNE.endDelay, () => endGame());
  });
}

// ================================================================ class refits (the game's makeover wipe)
/** A class refit: the makeover sweeps down the lobby; the guests stay in their rooms, now dressed for the new class. */
function classUp(tier: number): void {
  growing++;
  const next = views.lobby[tier];
  // What was bought for the lobby comes along, dressed for the new class.
  next.setRackLevel(1);
  rackBags = -1;
  rug.visible = false;
  pushIn(0, lz(9.5), 2.6, 1.0);
  refitCar(SLOT.lobby, next, tier);
  later(1.8, () => {
    growing--;
    say(`${CLASS_NAME[tier].toUpperCase()} CLASS`, `Every request pays $${TUNE.deliver[tier] + bonus}`, { tier });
  });
  speedNow *= TUNE.speedUp;
}
function refitCar(slot: number, next: CarriageView, tier: number): void {
  const old = train[slot].view;
  train[slot] = { type: train[slot].type, tier, view: next };
  const oldRooms = rooms.filter((r) => r.car === slot);
  const fresh = makeRooms(slot);
  for (const r of fresh) r.open = oldRooms.find((o) => o.cabin === r.cabin)?.open ?? true;
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
  makeover(old, next);
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
type FlowEvent = 'checkin' | 'pick' | 'deliver' | 'buy';
/**
 * Each tutorial passenger: check them in → get their bag → bring it (they pay: coins fly to the counter). The first
 * passenger's fare then buys Room 2 for the second one.
 */
const TUTORIAL: { id: string; wait: FlowEvent | null }[][] = [
  [
    { id: 'come', wait: null },
    { id: 'checkin', wait: 'checkin' },
    { id: 'get', wait: 'pick' },
    { id: 'bring', wait: 'deliver' },
    { id: 'buy', wait: 'buy' },
  ],
  [
    { id: 'come', wait: null },
    { id: 'checkin', wait: 'checkin' },
    { id: 'get', wait: 'pick' },
    { id: 'bring', wait: 'deliver' },
  ],
];
let teach: 'cafe' | 'cinema' | null = null;
const flow = {
  phase: (NO_TUTORIAL ? 'play' : 'tutorial') as Phase,
  /** Tutorial: which passenger (0, 1) and which step. */
  passenger: 0,
  step: 1,
  /** Is this allowed right now? */
  allows(what: 'request' | 'upgrade' | 'camera'): boolean {
    // The tutorial's one purchase (Room 2) is the only thing allowed before play.
    if (this.phase === 'tutorial') return what === 'upgrade' && this.stepId === 'buy';
    if (this.phase !== 'play') return false;
    // A carriage rolling in, a makeover sweeping: nothing new starts until it is over.
    if (what === 'upgrade' && (growing > 0 || wipes.length > 0)) return false;
    return true;
  },
  get stepId(): string {
    return TUTORIAL[this.passenger]?.[this.step]?.id ?? '';
  },
  get guest(): Guest {
    return guests[this.passenger];
  },
  /** Something happened; the tutorial moves on only when it is what the current step waits for. */
  done(event: FlowEvent): void {
    if (this.phase !== 'tutorial' || TUTORIAL[this.passenger]?.[this.step]?.wait !== event) return;
    this.step++;
    if (event !== 'buy') praise();
    if (this.step < TUTORIAL[this.passenger].length) return;
    if (this.passenger === 0) {
      // Passenger 2: the same steps, with less help.
      this.passenger = 1;
      this.step = 0;
      later(1.0, () => callNext());
    } else {
      this.phase = 'play';
      later(0.4, () => say('GREAT JOB!', 'Now upgrade your train'));
      later(2.5, () => callNext());
    }
  },
  update(): void {
    if (this.phase === 'tutorial' && this.stepId === 'come' && this.guest.state === 'queue') this.step = 1;
  },
};
let askAt = 0;
/** Play: a steady, capped flow of requests, decided here and nowhere else. One per guest at a time. */
/** One request open at a time while the conductor works alone (one bubble, one job); two once the Attendant helps. */
function maxOpen(): number {
  return helpers.length > 0 ? 2 : 1;
}
function director(): void {
  flow.update();
  // Whenever a room is free and nobody is at (or on the way to) the desk, the next waiting guest comes over.
  if (flow.phase === 'play' && freeRoom() && !guests.some((g) => g.state === 'queue' || g.state === 'toDesk')) callNext();
  if (!flow.allows('request') || clock < askAt) return;
  const open = guests.filter((g) => g.order || g.state === 'toVenue' || g.state === 'toWash' || g.state === 'washing' || (g.venue === 'cinema' && filmT < 0)).length + (washState === 'dirty' ? 1 : 0);
  if (open >= maxOpen()) return;
  const g = guests.filter(ready).sort((a, b) => a.restUntil - b.restUntil)[0];
  if (!g) return;
  askAt = clock + TUNE.askGap[0] + Math.random() * (TUNE.askGap[1] - TUNE.askGap[0]);
  // A new venue is shown at once (its first visitors go straight there); after that, now and then.
  if (teach === 'cafe' && tryOuting(g, 'cafe')) return;
  if (teach === 'cinema' && tryOuting(g, 'cinema')) return;
  if (g.had.has('blanket') && Math.random() < TUNE.washChance && visitWashroom(g)) return;
  const venues: Venue[] = [];
  if (cafeTier) venues.push('cafe');
  if (theatreOpen && filmT < 0) venues.push('cinema');
  if (venues.length && g.had.has('blanket') && Math.random() < TUNE.visit && tryOuting(g, venues[Math.floor(Math.random() * venues.length)])) return;
  ask(g, nextWish(g), roomPay(g));
}

// ================================================================ jobs each frame
function updateJobs(dt: number): void {
  const front = atDesk();
  const tutorialItem = flow.phase === 'tutorial' ? flow.guest.order?.item ?? null : null;
  const audienceReady = audience().length >= TUNE.filmAudience && filmT < 0 && !guests.some((g) => g.venue === 'cinema' && g.state === 'toVenue');
  for (const s of stations) {
    let wants = false;
    let item: Want | null = null;
    if (s.kind === 'desk') wants = !!front && !!freeRoom() && (flow.phase !== 'tutorial' || flow.stepId === 'checkin');
    else if (s.kind === 'film') wants = flow.phase === 'play' && audienceReady;
    else if (s.kind === 'clean') wants = washState === 'dirty';
    else {
      item = s.items.find((it) => guests.some((g) => g.order?.item === it && !g.order.claimed && sourceFor(it, g) === s && needed(it) > 0)) ?? null;
      if (flow.phase === 'tutorial' && (item !== tutorialItem || flow.stepId !== 'get')) item = null;
      // A bag is carried one at a time (it's a suitcase, not a towel).
      wants = !!item && carried.length < TUNE.carry && !(item === 'luggage' && carried.some((c) => c.item === 'luggage'));
      if (item) s.marker.setIcon(ITEM_ICON[item]);
    }
    // Always in the scene: the badge fades in when its job wants you and out when done (never pops).
    s.marker.visible = true;
    s.wants = wants;
    // The washroom's broom is a request of its own (it says the washroom needs a tidy), so it shows whenever it does.
    // A station's badge floats over it only while it is needed (what a guest is waiting for comes from here), and
    // fades away when it is not.
    const lesson = wants;
    s.marker.iconShown = lesson;
    s.marker.highlight = lesson;
    // The washroom is tidied from anywhere inside it.
    const near = s.kind === 'clean' ? inWashroom(me.x, me.z) : Math.hypot(me.x - s.x, me.z - s.z) < (s.kind === 'desk' ? TUNE.deskReach : TUNE.pickReach);
    if (wants && near) {
      const seconds = s.kind === 'desk' ? TUNE.checkIn : s.kind === 'film' ? TUNE.projector : s.kind === 'shine' ? TUNE.shineSeconds : s.kind === 'clean' ? TUNE.cleanSeconds : TUNE.pickUp;
      s.progress = Math.min(1, s.progress + dt / seconds);
      if (s.kind === 'shine' || s.kind === 'clean') {
        if (Math.random() < dt * 8) particles.emit('sparkle', me.x, FLOOR_Y + 0.6, me.z, 2, 0.3);
        player.act(s.kind === 'clean' ? 'sweep' : 'wash', 0.3);
      }
      if (s.progress >= 1) {
        s.progress = 0;
        if (s.kind === 'desk' && front) {
          checkIn(front, freeRoom()!);
          flow.done('checkin');
        } else if (s.kind === 'film') startFilm();
        else if (s.kind === 'clean') cleanWashroom();
        else if (item) pickUp(item, Math.min(item === 'luggage' ? 1 : needed(item), TUNE.carry - carried.length));
      }
    } else s.progress = Math.max(0, s.progress - dt * 2);
    s.marker.working = s.progress > 0;
    s.marker.progress = s.progress;
    s.marker.update(dt);
  }
  // Deliveries go the moment the guest is in reach (anywhere in their room), never through a wall.
  for (const g of guests) {
    if (!g.order || g.receiving || g.walking || g.state === 'toRoom') continue;
    const a = approach(g);
    const inRoom = g.room && g.state === 'room' && Math.hypot(me.x - a.x, me.z - a.z) < TUNE.roomReach && map.walk.lineClear(me.x, me.z, a.x, a.z);
    const reached = inRoom || (Math.hypot(me.x - g.x, me.z - g.z) < TUNE.serveReach && map.walk.lineClear(me.x, me.z, a.x, a.z));
    if (!reached) continue;
    if (carried.some((c) => fits(c, g))) serve(g);
  }
  if (filmT >= 0) {
    filmT += dt;
    if (filmT >= TUNE.film) endFilm();
  }
  director();
  revealUpgrades();
}

/** The next thing to do: the guide points at it, the hint line names it, a tap walks there. */
interface Target extends Vec2 { lift: number; icon: IconName; text: string }
function target(): Target | null {
  if (flow.phase === 'tutorial') return tutorialTarget();
  for (const c of carried) {
    const g = guests.filter((x) => x.order?.item === c.item && !x.order.claimed && !x.walking).sort((a, b) => Math.hypot(approach(a).x - me.x, approach(a).z - me.z) - Math.hypot(approach(b).x - me.x, approach(b).z - me.z))[0];
    if (g) return { ...approach(g), lift: 2.4, icon: ITEM_ICON[c.item], text: `Bring ${ITEM_WORD[c.item]}` };
  }
  const buy = affordableTile();
  if (buy) return { x: buy.x, z: buy.z, lift: 1.5, icon: buy.step.icon, text: `Buy ${buy.step.name}` };
  if (atDesk() && freeRoom()) return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: 'Check in the guest' };
  if (washState === 'dirty') return { x: BATH.restock.x, z: lz(BATH.restock.z), lift: 2.0, icon: 'broom', text: 'Tidy the washroom' };
  const shoes = shoeJobs.find((j) => !j.done);
  if (shoes) return { x: shoes.x, z: shoes.z, lift: 1.4, icon: 'shoe', text: 'Shine the shoes' };
  if (projector && stations.includes(projector) && projector.wants) return { x: projector.x, z: projector.z, lift: 2.0, icon: 'film', text: 'Start the movie' };
  const open = guests.filter((g) => g.order && !g.order.claimed && needed(g.order.item) > 0).sort((a, b) => a.order!.since - b.order!.since);
  if (open[0] && carried.length < TUNE.carry) {
    const item = open[0].order!.item;
    const s = sourceFor(item, open[0]);
    if (s) return { x: s.x, z: s.z, lift: 2.0, icon: ITEM_ICON[item], text: `Get ${ITEM_WORD[item]}` };
  }
  return null;
}
/** The cheapest tile on show that the money in hand pays for. */
function affordableTile(): Tile | null {
  return tiles.filter((t) => !t.done && money >= t.step.price - t.sent && t.sent < t.step.price).sort((a, b) => a.step.price - a.sent - (b.step.price - b.sent))[0] ?? null;
}
function tutorialTarget(): Target | null {
  const g = flow.guest;
  switch (flow.stepId) {
    case 'come':
    case 'checkin':
      return { x: desk.x, z: desk.z, lift: 2.0, icon: 'key', text: 'Check in the guest' };
    case 'get': {
      const s = sourceFor('luggage');
      return s ? { x: s.x, z: s.z, lift: 2.0, icon: 'luggage', text: 'Get their bag' } : null;
    }
    case 'bring':
      return g.room ? { ...roomCentre(g.room), lift: 2.4, icon: 'luggage', text: 'Bring it to their room' } : null;
    case 'buy': {
      const t = tiles[0];
      return t ? { x: t.x, z: t.z, lift: 1.5, icon: t.step.icon, text: `Buy ${t.step.name}` } : null;
    }
  }
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
  if (!document.documentElement.classList.contains('nx-ready')) return;
  startPlay();
}
/** The splash fades into the game: on the first touch, or by itself after `TUNE.splash` seconds. */
function startPlay(): void {
  if (started) return;
  startScreen.classList.add('gone');
  document.documentElement.classList.add('nx-started');
  started = true;
  lastInput = clock;
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
  goTo = null;
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
/**
 * The carriage map: a chip per carriage down the left edge (once the train has two). Tapping one sends the conductor
 * walking there by the shortest way (a drag takes over again at any time).
 */
let goTo: Vec2 | null = null;
const carMap = document.createElement('div');
carMap.className = 'ad-cars';
document.body.appendChild(carMap);
const CAR_ICON: Partial<Record<CarriageType, IconName>> = { lobby: 'bed', cafe: 'latte', cinema: 'film', dining: 'meal' };
let carMapKey = '';
function updateCarMap(): void {
  const key = ended ? '' : train.length > 1 ? train.map((c) => c.type).join() : '';
  if (key === carMapKey) return;
  carMapKey = key;
  carMap.innerHTML = '';
  carMap.classList.toggle('on', key !== '');
  if (!key) return;
  // The front of the train at the top, as the camera sees it.
  train.forEach((car, index) => {
    const b = document.createElement('button');
    b.type = 'button';
    const c = document.createElement('canvas');
    c.width = c.height = 72;
    drawIcon(c.getContext('2d')!, CAR_ICON[car.type] ?? 'carriage', 36, 36, 56);
    b.appendChild(c);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      touched();
      const z0 = carriageOriginZ(index);
      goTo = walkableNear(-1.5, z0 + (index === 0 ? 4.6 : 9));
      autoWalk = true;
      lastInput = clock;
      b.classList.remove('tap');
      void b.offsetWidth;
      b.classList.add('tap');
      sfx('click');
    });
    carMap.appendChild(b);
  });
}
const release = (e: PointerEvent): void => {
  if (e.pointerId !== pointerId) return;
  touched();
  const quick = performance.now() - downAt < 280 && Math.hypot(stickX, stickY) < 0.3;
  pointerId = -1;
  stickX = 0;
  stickY = 0;
  if (quick) {
    autoWalk = true;
    goTo = null;
  }
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
    const t = goTo ?? target();
    if (t && Math.hypot(t.x - me.x, t.z - me.z) > 0.3) {
      // A path over the floor (refreshed a few times a second); head for its furthest point in plain view.
      const key = `${t.x.toFixed(2)},${t.z.toFixed(2)}`;
      if (key !== walkPathTo || clock - walkPathAt > 0.3) {
        walkPathTo = key;
        walkPathAt = clock;
        walkPath = floorPath(me, t) ?? route({ x: me.x, z: me.z }, t);
      }
      const pts = walkPath;
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
      // Ease in on arrival (never overshoot the spot).
      mag = Math.max(0.25, Math.min(1, Math.hypot(t.x - me.x, t.z - me.z) / 1.2));
    } else {
      autoWalk = false;
      goTo = null;
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
        // Only someone standing still is solid to the conductor; a walker steers round the conductor instead.
        if (g.pose !== 'stand' || g.walking) continue;
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
  // On skates the conductor rides the wheels' height, so they never sink into the floor.
  player.setPosition(me.x, FLOOR_Y + (skates ? SKATE_LIFT : 0), me.z);
  player.setFacing(me.facing);
  player.update(dt, me.speed);
  // On skates, a little puff behind the heels as they glide.
  if (skates && me.speed > 2 && Math.random() < dt * 7) particles.emit('dust', me.x - me.vx * 0.3, FLOOR_Y + 0.08, me.z - me.vz * 0.3, 1, 0.12);
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
  const far = !!t && Math.hypot(t.x - me.x, t.z - me.z) > 1.8 && !inView(t);
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
function updateGuide(dt: number): void {
  const t = target();
  // Light guidance: the first passenger is walked through; after that the arrow comes only when the player stops
  // and seems unsure (sooner for the second passenger), so figuring the train out is the player's own doing.
  const idle = clock - lastInput;
  const still = !autoWalk && pointerId < 0;
  const firstLesson = flow.phase === 'tutorial' && flow.passenger === 0;
  // Before the very first delivery (the tutorial, or the no-tutorial build's opening) the hint comes a little sooner.
  const hesitating = still && idle > (flow.phase === 'tutorial' || served === 0 ? TUNE.hesitateTutorial : TUNE.hesitate);
  const guided = firstLesson || flow.stepId === 'buy';
  const show = !!t && !ended && started && (guided || hesitating);
  arrowShown += ((show ? 1 : 0) - arrowShown) * Math.min(1, dt * 8);
  arrow.visible = arrowShown > 0.02 && !!t;
  if (t) {
    arrow.position.set(t.x, FLOOR_Y + t.lift + Math.abs(Math.sin(clock * 4)) * 0.22, t.z);
    arrow.scale.set(0.62 * arrowShown, 0.62 * arrowShown, 1);
  }
  updateFoot(dt, show ? t : null);
  // The instruction pill: the tutorial's one step (passenger 2 gets the arrows only), and the next job while guided.
  const instruction = ended || !t ? null : guided || (hesitating && flow.phase === 'play') ? t : null;
  // A caption over the middle of the screen has it to itself (the pill steps aside, never overlaps it).
  setHint(showing && !showing.small ? null : instruction);
  hintBox.classList.toggle('low', goalBox.classList.contains('on'));
  // The goal bar: the next upgrade's progress (from the end of the tutorial).
  // The goal bar: the next big goal and how far along the way to it (from the end of the tutorial).
  const big = ended || flow.phase === 'tutorial' ? null : nextBig();
  if (big) setGoal(big.step.icon, `Next: ${big.step.name}`, big.progress);
  else setGoal(null, '');
  // The hand: whenever the player stops (it drags from the conductor toward the goal).
  const showHand = show && still && idle > TUNE.handAfter && started && flow.phase === 'play';
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

// ================================================================ the end screen: the Dining Car's interior, the title and Play Now
const endScreen = buildEndCard(() => openStore());
document.body.appendChild(endScreen.el);
function endGame(): void {
  if (ended) return;
  ended = true;
  flow.phase = 'end';
  hand.classList.remove('on');
  setGoal(null, '');
  setHint(null);
  for (const t of tiles) shrinking.push({ obj: t.view.group, t: 0 });
  tiles.length = 0;
  // Ended by waiting before the Dining Car was bought: it joins the train at once, so the end screen always shows it.
  if (!train.some((c) => c.type === 'dining')) {
    while (train.length < SLOT.dining) {
      const v = train.length === SLOT.cafe ? views.cafe : views.cinema;
      train.push({ type: train.length === SLOT.cafe ? 'cafe' : 'cinema', tier: train.length === SLOT.cafe ? 1 : CINEMA_TIER, view: v });
      v.group.visible = true;
    }
    train.push({ type: 'dining', tier: DINING_TIER, view: views.dining });
    views.dining.group.visible = true;
    rebuildTrain();
  }
  // The camera glides into the Dining Car and stays there, drifting slowly along the tables.
  endCamAt = clock;
  document.documentElement.classList.add('nx-ended');
  later(0.6, () => endScreen.show());
  sfx('levelup');
}
let endCamAt = -1;
const endFocus = new THREE.Vector3();
function updateEndCamera(): void {
  if (endCamAt < 0) return;
  const t = clock - endCamAt;
  const z0 = carriageOriginZ(SLOT.dining);
  endFocus.set(-0.2, 0, z0 + 7.2 + Math.sin(t * 0.25) * 2.2);
  stage.rig.focusOn(endFocus, 1, 0.82, 2.2);
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
  updateTiles(dt);
  updateLifting(dt);
  updateMess(dt);
  updateWashDoor(dt);
  updateMessages(dt);
  player.root.updateMatrixWorld(true);
  player.stackAnchor.getWorldPosition(anchorPos);
  let h = 0;
  for (const c of carried) {
    c.mesh.position.set(anchorPos.x, anchorPos.y + h, anchorPos.z);
    c.mesh.rotation.y = me.facing;
    h += ((ITEM_HEIGHT as Record<string, number>)[c.item] ?? 0.12) * 1.15;
  }
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
    p.t += dt * 3;
    // Grows in from nothing with a small overshoot (an ease-out-back): nothing ever just appears.
    const k = Math.min(1, p.t);
    const s = p.t <= 0 ? 0.001 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    p.obj.scale.setScalar(p.base * s);
    if (p.t >= 1) popping.splice(i, 1);
  }
  for (let i = rolling.length - 1; i >= 0; i--) {
    const r = rolling[i];
    r.t += dt / ROLL_SECONDS;
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
  updateCoins(dt);
  updateShoes(dt);
  updateCarMap();
  updateRackBags();
  if (!ended && started && clock - lastInput > TUNE.idleEnd) endGame();
  updateEndCamera();
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
    later(TUNE.splash, startPlay);
  };
  requestAnimationFrame(reveal);
}
void boot();

// Test hooks (harmless in an ad).
(window as unknown as { nxAd: unknown }).nxAd = {
  get state() {
    return {
      clock: Math.round(clock), clockExact: clock, phase: flow.phase, passenger: flow.passenger, step: flow.stepId, money, target: target(),
      tiles: tiles.map((t) => `${t.step.name} ${t.paid}/${t.step.price}`), bought: bought.size, lastBought: [...bought].pop() ?? null, cars: train.length, helpers: helpers.length, film: filmT,
      aboard: guests.map((g) => `${g.state}${g.order ? ':' + g.order.item : ''}`), carried: carried.map((c) => c.item), ended, served,
      caption: showing?.title ?? null, stats, wash: washState, me: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) },
      offFloor: [...guests, ...helpers.map((h) => h.w)].filter((g) => Math.abs(g.x) > INNER + 0.05).map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`),
    };
  },
  give: (amount: number) => {
    money += amount;
  },
  /** Test only: buys the next n upgrades at once (for screenshots). */
  buy: (n = 1) => {
    for (let i = 0; i < n; i++) {
      const s = pending()[0];
      if (!s) return;
      if (flow.phase === 'tutorial') {
        flow.phase = 'play';
      }
      bought.add(s.id);
      if (s.bonus) bonus += s.bonus;
      s.buy();
    }
  },
  end: () => endGame(),
  /** Test only: the washroom left messy now. */
  dirty: () => {
    washState = 'dirty';
    messArrives();
  },
  /** Test only: put the conductor somewhere, and the route from there to the current target. */
  place: (x: number, z: number) => {
    me.x = x;
    me.z = z;
  },
  grid: (x0: number, z0: number, x1: number, z1: number, step = 0.25) => {
    const rows: string[] = [];
    for (let z = z0; z <= z1; z += step) {
      let r = `${z.toFixed(2)} `;
      for (let x = x0; x <= x1; x += step) r += map.walk.isWalkable(x, z) ? '.' : '#';
      rows.push(r);
    }
    return rows.join('\n');
  },
  routeInfo: () => {
    const t = target();
    return { t, from: reachableNode(me), to: t && reachableNode(t), pts: t && route(me, t), walk: map.walk.isWalkable(me.x, me.z) };
  },
  /** Test only: every guest still waiting goes straight to a free room (to test the mid-game quickly). */
  settle: () => {
    for (const g of guests) {
      const r = g.room ? null : freeRoom();
      if (!r) continue;
      r.guest = g;
      g.room = r;
      g.had.add('luggage');
      g.order = null;
      g.path = [];
      g.setPose('sit', sitSpot(r));
      g.state = 'room';
    }
  },
  tap: (x: number, y: number) => {
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 }));
  },
};
