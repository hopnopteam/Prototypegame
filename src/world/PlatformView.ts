import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder, mergePlanes } from './geo';
import { carriageOriginZ, DOOR_Z0, DOOR_Z1, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';
import { STATION_UPGRADES } from '../config/content';
import { PLATFORM } from './platformLayout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { key, modelEntry, type Recolor } from './models/library';
import { CharacterView, type CharacterAction, type CharacterLook } from './CharacterView';
import { headlineTexture, posterTexture, signTexture } from './sprites';
import type { Rect } from '../core/types';
import type { LampAnchor } from './Lighting';

/** Marketing bought at the station workshop that shows on every platform. */
export interface MarketingState {
  posters: boolean;
  band: boolean;
}

const POSTER_W = 1.0;
const POSTER_H = 1.25;
/** Posters stand where the camera sees them, past each carriage's own platform business (door, barrow, vendor). */
const POSTER_X = PLATFORM_X0 + 3.15;
const POSTER_Z_IN_CARRIAGE = 11.5;
const POSTER_AHEAD_Z = -6.4;
const BAND_LOOK: CharacterLook = { body: '#C0485C', accent: '#E2B04A', skin: '#F1C7A6', hair: '#4A3428', pants: '#F4EEE2', hat: 'pillbox', hatColor: '#C0485C', bandColor: '#E2B04A', arms: true };
const BAND_SKIN = ['#F1C7A6', '#C98E66', '#8D5A3C'];
/** Where the band stands (by the way in from the station, clear of the queue and the walkway) and what each one plays. */
const BAND: { x: number; z: number; instrument: 'tuba' | 'drum' | 'trumpet' }[] = [
  { x: PLATFORM_X0 + 2.0, z: -8.0, instrument: 'trumpet' },
  { x: PLATFORM_X0 + 3.05, z: -8.9, instrument: 'tuba' },
  { x: PLATFORM_X0 + 4.1, z: -8.0, instrument: 'drum' },
];
const BEAT_SECONDS = 0.5;
/** The station master stands by the front of the train and waves the green flag at departure. */
const MASTER_POS = PLATFORM.master;
const MASTER_LOOK: CharacterLook = { body: '#2F3E5C', accent: '#E2B04A', skin: '#E8B894', hair: '#8A8A8A', pants: '#2A3248', hat: 'conductor', hatColor: '#2F3E5C', bandColor: '#C0485C', arms: true, moustache: true };
/**
 * Pigeons perched on the back railing (session 18: a lived-in station; session 23: the canopy roof they sat on is
 * gone): they shuffle and peck, and take off when the train leaves. Where along the platform they sit (z).
 */
const PIGEON_SPOTS = [-9.6, -9.0, 9.4, 10.1, 11.2, 12.0];
/** Half the width of the way in from the station (an opening in the back railing). */
const GATE_HALF = 0.9;
/** The back railing (Station Picks S29): a panel's length and height (metres). */
const RAIL_PANEL = 1.6;
const RAIL_HEIGHT = 0.95;
/** The gap left between the railing and each gate pillar (metres). */
const RAIL_PILLAR_GAP = 0.2;
/** Lamp posts along the back railing, this far apart. */
const LAMP_STEP = 6;
/** The name board's posts stand this far either side of the way in. */
const SIGN_POST_HALF = 1.25;
/** The kiosk's vendor, behind the counter. */
const VENDOR_LOOK: CharacterLook = { body: '#3F7A5E', accent: '#F4EEE2', skin: '#E8B894', hair: '#5B3A29', pants: '#2F3A33', hat: 'cap', hatColor: '#3F7A5E', arms: true };
/** Phase 2: the station boy who restocks the train (a cap and a russet waistcoat), the second gate's clerk, the kiosk's keeper. */
const HELPER_LOOK: CharacterLook = { body: '#B5562F', accent: '#F4EEE2', skin: '#F0C7A0', hair: '#7A4A2A', pants: '#4A3A30', hat: 'cap', hatColor: '#2F3E5C', arms: true };
const CLERK_LOOK: CharacterLook = { body: '#2F3E5C', accent: '#F4EEE2', skin: '#C98E6A', hair: '#2A2420', pants: '#2A3248', hat: 'cap', hatColor: '#2F3E5C', bandColor: '#E2B04A', arms: true };
const KEEPER_LOOK: CharacterLook = { body: '#F4EEE2', accent: '#C0485C', skin: '#E8B894', hair: '#A0522D', pants: '#5B4A3A', hat: 'none', arms: true };
/** Lobby door's centre (the first ticket stand is laid out against it; the second gate copies it at its own door). */
const LOBBY_DOOR_Z = (DOOR_Z0 + DOOR_Z1) / 2;
const PIGEON_FLY_SECONDS = 3.2;

/**
 * Townsfolk (session 23, owner: "don't make the world feel lifeless"): people who are not travelling. Two have come
 * to see someone off and stand by the railing ahead of the kiosk; two more sit on the first bench behind the train
 * (when the platform is long enough to have one). They look about, read, chat and take calls, and wave the train
 * off when the flag goes up. Out of everyone's way, and purely for show.
 */
interface Townsperson { view: CharacterView; idles: CharacterAction[]; act: CharacterAction; left: number; next: number; seated: boolean }
const TOWNSFOLK: { look: CharacterLook; seated: boolean; idles: CharacterAction[] }[] = [
  { look: { body: '#B5543A', accent: '#F2E3C6', skin: '#C98E68', hair: '#1D1616', pants: '#3A2E2A', hat: 'none', longHair: true }, seated: false, idles: ['look', 'chat', 'watch'] },
  { look: { body: '#4F6E8C', accent: '#E8D29A', skin: '#F1C7A5', hair: '#8C5A32', pants: '#2E3442', hat: 'boater', glasses: true }, seated: false, idles: ['chat', 'look', 'phone'] },
  { look: { body: '#7A6A9A', accent: '#F4EEE2', skin: '#EDBE9A', hair: '#E6E6E6', pants: '#3A3440', hat: 'none', glasses: true }, seated: true, idles: ['read', 'read', 'look'] },
  { look: { body: '#6B8F5E', accent: '#F2C94C', skin: '#A86E4E', hair: '#3A2418', pants: '#33402E', hat: 'cap', hatColor: '#3F5A3A' }, seated: true, idles: ['look', 'phone', 'yawn'] },
];
/** Where the two seeing someone off stand: by the back railing between the kiosk and the way in. */
const SEEING_OFF = [{ x: PLATFORM_X0 + 5.75, z: -9.35, facing: -Math.PI / 2 - 0.5 }, { x: PLATFORM_X0 + 5.3, z: -9.95, facing: -Math.PI / 2 + 0.35 }];
/** Phase 2: half the footprint a lamp post, a planter tub and a standing person take on the deck. */
const LAMP_FOOT = 0.16;
const PLANTER_FOOT = 0.36;
const PERSON_FOOT = 0.22;
/** A seated townsperson's root above the floor (resting on a bench seat). */
const BENCH_SIT_Y = 0.285;

/** A pigeon about 0.3 m long, facing -z: grey body, a darker head with a green-violet neck, a tail. */
function pigeonGeometry(): THREE.BufferGeometry {
  // Station Picks S92: Tiny Treats' little bird, painted pigeon grey with a dark head and a pale beak.
  const b = new GeoBuilder();
  const e = modelEntry('bird');
  const sc = 0.2 / (e.max[1] - e.min[1]);
  b.model('bird', 0, 0, 0, Math.PI, sc, sc, sc, { recolor: [ANY_DARK('#5E6678'), ANY_LIGHT('#9AA2B2'), WARM('#D9B88A')], surface: 'fabric', shade: 0.9 });
  return b.build();
}

/** Recolour rules that catch a model's parts by brightness alone (for packs painted in their own colours). */
function ANY_DARK(to: string): Recolor { return { hue: [0, 360], sat: [0, 1], val: [0, 0.45], ref: '#3A3A3A', to }; }
function ANY_LIGHT(to: string): Recolor { return { hue: [0, 360], sat: [0, 1], val: [0.45, 1], ref: '#B0B0B0', to }; }
function WARM(to: string): Recolor { return { hue: [15, 60], sat: [0.35, 1], val: [0.5, 1], ref: '#F0A040', to }; }

/** The newsstand, against the back railing ahead of the waiting bench: today's Rail Gazette headline on a board. */
const KIOSK_POS = PLATFORM.kiosk;

/**
 * The station platform on the right of the train: a tiled deck, the ticket stand and its queue ahead of the
 * lobby door, the luggage barrow behind it, lamp posts and benches along the back railing, and the station house
 * ahead of the train where travellers come in (layout: platformLayout.ts). Built in local coordinates that equal
 * world coordinates when the train is stopped (z offset 0); the game slides it along z as the train arrives and
 * departs.
 */
export class PlatformView {
  readonly group = new THREE.Group();
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private staticMesh: THREE.Mesh | null = null;
  private houseMesh: THREE.Mesh | null = null;
  private readonly bags: THREE.Mesh;
  private readonly bagEnds: number[];
  private bagCount = -1;
  private readonly vendorView: CharacterView;
  private propsMesh: THREE.Mesh | null = null;
  private deckMesh: THREE.Mesh | null = null;
  private lampMesh: THREE.Mesh | null = null;
  private vendor: THREE.Group | null = null;
  private posters: THREE.Group | null = null;
  private readonly posterMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  private posterKey = '';
  private readonly band: CharacterView[] = [];
  private readonly pigeons = new THREE.InstancedMesh(pigeonGeometry(), MATERIALS.solid, PIGEON_SPOTS.length);
  /** Each pigeon's perch (x, y, z), heading, peck timer and, once flying, how long it has flown. */
  private readonly perches = PIGEON_SPOTS.map((z, i) => ({ x: 0, y: 0, z, yaw: 0, peck: i * 0.7, flown: -1, vx: 0, vz: 0 }));
  private readonly pigeonDummy = new THREE.Object3D();
  private beat = 0;
  private marketing: MarketingState = { posters: false, band: false };
  private readonly master: CharacterView;
  private readonly townsfolk: Townsperson[] = [];
  /** The first bench behind the train (for show), where two townsfolk sit; null when the platform has none. */
  private showBench: Rect | null = null;
  private readonly headlineMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  /** Phase 2: the station upgrades standing on the platform, rebuilt when one is bought; their people. */
  private upgradeMesh: THREE.Mesh | null = null;
  private upgradeLamps: THREE.Mesh | null = null;
  private upgradeKey = '';
  private readonly helperView = new CharacterView(HELPER_LOOK);
  private readonly clerkView = new CharacterView(CLERK_LOOK);
  private readonly keeperView = new CharacterView(KEEPER_LOOK);
  private headline = '';
  length = 0;
  z0 = 0;
  z1 = 0;
  /** The platform's lamps for the lamp pools (local coordinates; the game slides them with the platform). */
  readonly lampAnchors: LampAnchor[] = [];
  /**
   * Phase 2 (owner: "the elements you can walk through… don't do that anymore"): the footprint of everything standing
   * on the deck (lamp posts, tubs, benches, sign posts, the station master and the townsfolk), platform-local, so the
   * walkable floor goes round them. Filled by each rebuild.
   */
  readonly solids: Rect[] = [];
  solidsVersion = 0;

  constructor() {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_POST_HALF * 2 + 0.5, 0.72), this.signMaterial);
    sign.position.set(PLATFORM.sign.x, FLOOR_Y + 2.45, PLATFORM.sign.z + 0.06);
    sign.rotation.x = -0.75;
    sign.name = 'sign';
    this.group.add(sign);

    // The ticket stand's board on its post at the counter's front end, tilted back to face the camera.
    const tickets = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.3), new THREE.MeshLambertMaterial({ color: '#ffffff', map: signTexture('Tickets', PALETTE.navy, PALETTE.creamBand) }));
    tickets.position.set((PLATFORM.counter.x0 + PLATFORM.counter.x1) / 2, FLOOR_Y + 1.86, PLATFORM.counter.z0 - 0.12);
    tickets.rotation.x = -0.55;
    tickets.name = 'ticketSign';
    this.group.add(tickets);

    this.master = new CharacterView(MASTER_LOOK);
    this.master.leans = false;
    this.master.root.userData.object = 'character:master';
    this.master.setPosition(MASTER_POS.x, FLOOR_Y, MASTER_POS.z);
    this.master.setFacing(-Math.PI / 2 + 0.6);
    this.master.holdInRightHand(buildFlag());
    this.group.add(this.master.root);
    const kiosk = buildKiosk(this.headlineMaterial);
    kiosk.userData.object = 'platform:newsstand';
    this.group.add(kiosk);
    // The newsstand's vendor behind the counter, watching the trains come and go.
    this.vendorView = new CharacterView(VENDOR_LOOK);
    this.vendorView.leans = false;
    this.vendorView.root.userData.object = 'character:newsvendor';
    // Behind the counter (the kiosk faces the platform's rear, where the camera is).
    this.vendorView.setPosition(KIOSK_POS.x + 0.1, FLOOR_Y, KIOSK_POS.z - 0.9);
    this.vendorView.setFacing(0.25);
    this.group.add(this.vendorView.root);
    for (const t of TOWNSFOLK) {
      const view = new CharacterView(t.look);
      view.leans = false;
      if (t.seated) view.setPose('sit');
      this.group.add(view.root);
      this.townsfolk.push({ view, idles: t.idles, act: t.idles[0], left: 0, next: 1 + Math.random() * 3, seated: t.seated });
    }
    this.placeTownsfolk();
    for (const [view, name] of [[this.helperView, 'helper'], [this.clerkView, 'clerk'], [this.keeperView, 'keeper']] as const) {
      view.leans = false;
      view.root.userData.object = `character:${name}`;
      view.root.visible = false;
      this.group.add(view.root);
    }
    // The luggage on the barrow: every bag slot built once, the first `count` drawn (session 23).
    const bags = buildBarrowBags();
    this.bags = new THREE.Mesh(bags.geometry, MATERIALS.solid);
    this.bags.castShadow = true;
    this.bags.receiveShadow = true;
    this.bags.userData.object = 'platform:bags';
    this.bagEnds = bags.ends;
    this.group.add(this.bags);
    this.setBarrowBags(0);
    this.group.visible = false;
  }

  /**
   * Phase 2: the station upgrades owned, each standing where its tile was (a bench and planters, the booth's canopy,
   * the cart's awning, the station boy, a luggage trolley, the fruit and bread stall, the station clock, the second
   * ticket gate at the second entrance `gateZ`). Rebuilt only when what is owned (or the gate's place) changes.
   */
  setUpgrades(owned: ReadonlySet<string>, gateZ: number | null): void {
    const key = `${[...owned].sort().join(',')}|${gateZ ?? ''}`;
    if (key === this.upgradeKey) return;
    this.upgradeKey = key;
    const b = new GeoBuilder();
    const lamps = new GeoBuilder();
    const at = (k: string): { x: number; z: number } => {
      const u = STATION_UPGRADES.find((d) => d.key === k);
      return { x: PLATFORM_X0 + (u?.at.dx ?? 0), z: u?.at.z ?? 0 };
    };
    if (owned.has('benches')) {
      const p = at('benches');
      buildBench(b, { x0: p.x - 0.2, z0: p.z - 1.1, x1: p.x + 0.2, z1: p.z + 1.1 });
      for (const dz of [-2.05, 2.05]) {
        b.object('platform:waitingPlanter');
        buildPlanter(b, p.x, p.z + dz);
      }
      b.endObject();
    }
    if (owned.has('booth')) buildBoothCanopy(b, lamps, PLATFORM.counter);
    if (owned.has('cart')) buildCartAwning(b);
    if (owned.has('trolley')) buildTrolley(b, at('trolley'));
    if (owned.has('kiosk')) buildFruitStall(b, at('kiosk'));
    if (owned.has('clock')) buildStationClock(b, lamps, at('clock'));
    const dz = gateZ !== null ? gateZ - LOBBY_DOOR_Z : 0;
    if (owned.has('gate2') && gateZ !== null) {
      const c = PLATFORM.counter;
      const counter = { x0: c.x0, z0: c.z0 + dz, x1: c.x1, z1: c.z1 + dz };
      buildTicketStand(b, lamps, dz);
      buildBoothCanopy(b, lamps, counter);
    }
    for (const mesh of [this.upgradeMesh, this.upgradeLamps]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.upgradeMesh = new THREE.Mesh(b.build(), MATERIALS.solid);
    this.upgradeMesh.castShadow = true;
    this.upgradeMesh.receiveShadow = true;
    this.group.add(this.upgradeMesh);
    this.upgradeLamps = new THREE.Mesh(lamps.build(), MATERIALS.lamps);
    this.group.add(this.upgradeLamps);
    // The people: the station boy by the cart, the clerk behind the second gate's counter, the stall's keeper.
    const helper = owned.has('helper');
    this.helperView.root.visible = helper;
    if (helper) {
      const r = PLATFORM.restock;
      this.helperView.setPosition(r.x1 + 0.55, FLOOR_Y, r.z1 + 0.25);
      this.helperView.setFacing(-Math.PI / 2 - 0.5);
    }
    const clerk = owned.has('gate2') && gateZ !== null;
    this.clerkView.root.visible = clerk;
    if (clerk) {
      this.clerkView.setPosition(PLATFORM.serve.x, FLOOR_Y, PLATFORM.serve.z + dz);
      this.clerkView.setFacing(-Math.PI / 2);
    }
    const keeper = owned.has('kiosk');
    this.keeperView.root.visible = keeper;
    if (keeper) {
      const p = at('kiosk');
      this.keeperView.setPosition(p.x + 0.66, FLOOR_Y, p.z);
      this.keeperView.setFacing(-Math.PI / 2);
    }
  }

  /** Phase 2: the second gate's clerk stamps a ticket. */
  clerkStamp(): void {
    if (this.clerkView.root.visible) this.clerkView.act('stamp', 0.8);
  }

  /** Phase 2: the station boy waves as he tops the train up. */
  helperWave(): void {
    if (this.helperView.root.visible) this.helperView.act('wave', 1.4);
  }

  setStationName(name: string): void {
    this.signMaterial.map?.dispose();
    this.signMaterial.map = signTexture(name, PALETTE.navy, PALETTE.creamBand);
    this.signMaterial.needsUpdate = true;
  }

  /** Rebuilds for the current train length at once; the vendor stall appears once the supply car exists. */
  build(trainRearZ: number, supplyCarIndex: number | null, luggageCarIndex: number | null): void {
    const steps = this.buildSteps(trainRearZ, supplyCarIndex, luggageCarIndex);
    while (!steps.next().done) {
      // keep going
    }
  }

  /**
   * The same rebuild in sections (it yields between them), so the game can spread it over a few frames; the
   * old platform stays until the new one swaps in whole at the end.
   */
  *buildSteps(trainRearZ: number, supplyCarIndex: number | null, _luggageCarIndex: number | null): Generator<void, void> {
    const anchors: LampAnchor[] = [];
    const solids: Rect[] = [];
    const block = (x: number, z: number, hw: number, hd = hw): void => {
      solids.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
    };
    const z0 = -LOCOMOTIVE_LENGTH - 4;
    const z1 = trainRearZ + 8;
    const length = z1 - z0;
    const zc = (z0 + z1) / 2;
    const x0 = PLATFORM_X0;
    const x1 = PLATFORM_X0 + PLATFORM_WIDTH;
    // Separate builders per section, so each section's merge is its own step.
    const b = new GeoBuilder();
    const house = new GeoBuilder();
    const props = new GeoBuilder();
    const deck = new GeoBuilder();
    const lamps = new GeoBuilder();

    // Deck: stone base, a tiled top, the yellow safety line and a coping stone along the edge.
    b.box((x0 + x1) / 2, FLOOR_Y / 2 - 0.02, zc, x1 - x0, FLOOR_Y - 0.04, length, '#D9CCB4', 0, { shade: 0.75 });
    // Session 30: stone flags laid in running bond, in close tones (the big diamond tile read as a loud pattern).
    // Session 51b (owner: "the surface… find a better realistic [one]"): warm sandstone flags, the photo's own joints.
    deck.box((x0 + x1) / 2 + 0.2, FLOOR_Y - 0.01, zc, x1 - x0 - 0.4, 0.02, length, PALETTE.platformTile, 0, { shade: 1, detail: 'paving' });
    deck.box(x0 + 0.2, FLOOR_Y - 0.008, zc, 0.4, 0.024, length, '#D3C9B8', 0, { shade: 1 });
    deck.box(x0 + 0.34, FLOOR_Y + 0.006, zc, 0.12, 0.004, length, PALETTE.platformEdge, 0, { shade: 1 });

    // Back railing: navy with brass caps, open where the way in from the station meets the platform.
    const gate = PLATFORM.entrance.z;
    const railRuns: [number, number][] = [[z0, gate - GATE_HALF], [gate + GATE_HALF, z1]];
    let posts = 0;
    for (const [ra, rb] of railRuns) {
      if (rb <= ra) continue;
      // Station Picks S29: Quaternius' ornamental iron railing with finials, in the station's navy, panel after panel.
      const e = modelEntry('iron_fence');
      const len = e.max[0] - e.min[0];
      // Stop short of the gate pillars so the last panel never runs into one.
      const a = ra > z0 ? ra + RAIL_PILLAR_GAP : ra;
      const c = rb < z1 ? rb - RAIL_PILLAR_GAP : rb;
      const n = Math.max(1, Math.round((c - a) / RAIL_PANEL));
      const step = (c - a) / n;
      const sx = step / len;
      const sy = RAIL_HEIGHT / (e.max[1] - e.min[1]);
      for (let i = 0; i < n; i++) {
        b.object('platform:railing');
        b.model('iron_fence', x1 - 0.05, FLOOR_Y, a + (i + 0.5) * step, Math.PI / 2, sx, sy, Math.min(sx, sy), { recolor: [ANY_DARK(PALETTE.navy), ANY_LIGHT('#4A5C86')], surface: 'iron', shade: 0.9 });
        if (++posts % 12 === 0) yield;
      }
      b.endObject();
    }
    // Gate pillars either side of the way in, brass-capped.
    for (const dz of [-GATE_HALF, GATE_HALF]) {
      b.object('platform:gatePost');
      // Station Picks S34: Kenney's stone pillars either side of the way in, a brass ball on each.
      const e = modelEntry('stone_pillar');
      const ps = 1.25 / (e.max[1] - e.min[1]);
      b.model('stone_pillar', x1 - 0.05, FLOOR_Y, gate + dz, 0, ps, ps, ps, { surface: 'stone', shade: 0.9 });
      b.sphere(x1 - 0.05, FLOOR_Y + 1.25 + 0.08, gate + dz, 0.09, PALETTE.brass, 1, 1, { shade: 1, surface: 'brass' });
    }
    b.endObject();

    // Session 23: the station house stands ahead of the train, behind the railing (it used to stand beside the
    // lobby, where the camera looks over it: its roof covered the platform on a phone). Cream walls, a terracotta
    // roof, lamplit windows and a clock gable over the doors travellers come out of.
    buildStationHouse(house, lamps, x1, gate);
    // Session 30 (owner: "the background in station is quite unpolished… more lived in, not just random textures").
    buildForecourt(deck, house, lamps, x1, z0, z1, gate);

    yield;

    // Session 23: no canopy (its roof hid half the platform from the camera). Victorian lamp posts along the back
    // railing light the deck instead, with flower tubs between them; benches further back for the crowd.
    const blockedZ = (z: number, margin: number): boolean =>
      Math.abs(z - gate) < GATE_HALF + margin
      || (z > PLATFORM.bench.z0 - margin && z < PLATFORM.bench.z1 + margin)
      || Math.abs(z - PLATFORM.kiosk.z) < 0.8 + margin;
    const lampX = x1 - 0.55;
    const lampZs: number[] = [];
    let showBench: Rect | null = null as Rect | null;
    for (let z = z0 + 3; z < z1 - 2; z += LAMP_STEP) {
      if (blockedZ(z, 0.6)) continue;
      lampZs.push(z);
      buildLampPost(props, lamps, lampX, z);
      block(lampX, z, LAMP_FOOT);
      anchors.push({ x: lampX - 0.7, y: FLOOR_Y + 2.1, z, strength: 1 });
      const tubZ = z + LAMP_STEP / 2;
      if (tubZ < z1 - 2 && !blockedZ(tubZ, 0.8)) {
        props.object('platform:tub');
        buildPlanter(props, lampX + 0.05, tubZ);
        block(lampX + 0.05, tubZ, PLANTER_FOOT);
      }
    }
    props.endObject();
    // The ticket stand's own lamp, and one over the luggage barrow, so both read at night.
    const standLamp = { x: PLATFORM.counter.x1 + 0.35, z: PLATFORM.counter.z0 - 0.35 };
    buildLampPost(props, lamps, standLamp.x, standLamp.z);
    block(standLamp.x, standLamp.z, LAMP_FOOT);
    anchors.push({ x: standLamp.x - 0.6, y: FLOOR_Y + 2.1, z: standLamp.z + 0.6, strength: 1 });
    const barrowLamp = { x: PLATFORM.barrow.x1 + 1.35, z: PLATFORM.barrow.z1 + 0.95 };
    buildLampPost(props, lamps, barrowLamp.x, barrowLamp.z);
    block(barrowLamp.x, barrowLamp.z, LAMP_FOOT);
    anchors.push({ x: barrowLamp.x - 0.8, y: FLOOR_Y + 2.1, z: barrowLamp.z - 0.8, strength: 1 });
    props.endObject();

    // Benches along the back railing behind the train (for show), and the one where travellers with no bed wait.
    buildBench(props, PLATFORM.bench);
    // Behind the train, between a lamp post and the flower tub after it, every other post.
    lampZs.filter((z) => z > PLATFORM.barrow.z1 + 2 && z + LAMP_STEP / 2 < z1 - 2).forEach((z, i) => {
      if (i % 2 !== 0) return;
      const bench = { x0: x1 - 0.85, z0: z + 0.4, x1: x1 - 0.45, z1: z + 2.6 };
      buildBench(props, bench);
      solids.push({ x0: bench.x0 - 0.25, z0: bench.z0, x1: bench.x1 + 0.1, z1: bench.z1 });
      if (!showBench) showBench = bench;
    });

    // Sign posts under the name board, either side of the way in.
    for (const dx of [-SIGN_POST_HALF, SIGN_POST_HALF]) block(PLATFORM.sign.x + dx, PLATFORM.sign.z, 0.1);
    // The station master by the front of the train, and the townsfolk seeing someone off.
    block(MASTER_POS.x, MASTER_POS.z, PERSON_FOOT);
    for (const t of SEEING_OFF) block(t.x, t.z, PERSON_FOOT);
    for (const dx of [-SIGN_POST_HALF, SIGN_POST_HALF]) props.object('platform:signPost').box(PLATFORM.sign.x + dx, FLOOR_Y + 1.15, PLATFORM.sign.z, 0.08, 2.3, 0.08, PALETTE.navy, 0, { shade: 0.9 });
    props.endObject();

    yield;

    // The ticket stand and the luggage barrow (session 23).
    buildTicketStand(props, lamps);
    buildBarrow(props);
    buildBellPost(props);
    buildRestockCart(props);

    yield;
    const staticGeo = b.build();
    yield;
    const houseGeo = house.build();
    yield;
    const propsGeo = props.build();
    yield;
    const deckGeo = deck.build();
    const lampGeo = lamps.build();
    yield;

    // Swap the new platform in whole.
    for (const mesh of [this.staticMesh, this.houseMesh, this.propsMesh, this.deckMesh, this.lampMesh]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    if (this.vendor) this.group.remove(this.vendor);
    this.vendor = null;
    this.z0 = z0;
    this.z1 = z1;
    this.length = length;
    this.lampAnchors.length = 0;
    this.lampAnchors.push(...anchors);
    this.solids.length = 0;
    this.solids.push(...solids);
    this.solidsVersion++;
    const solid = (geometry: THREE.BufferGeometry, cast: boolean): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, MATERIALS.solid);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    this.staticMesh = solid(staticGeo, true);
    this.houseMesh = solid(houseGeo, true);
    this.propsMesh = solid(propsGeo, true);
    this.deckMesh = solid(deckGeo, false);
    this.lampMesh = new THREE.Mesh(lampGeo, MATERIALS.lamps);
    this.group.add(this.lampMesh);
    if (supplyCarIndex !== null) {
      this.vendor = buildVendor(carriageOriginZ(supplyCarIndex));
      this.vendor.userData.object = 'platform:vendor';
    }
    if (this.vendor) this.group.add(this.vendor);
    this.buildPosters();
    this.perchPigeons(x1);
    this.showBench = showBench;
    this.placeTownsfolk();
  }

  /** The two seeing someone off by the railing; the two on the bench behind the train (hidden if there is none). */
  private placeTownsfolk(): void {
    let standing = 0;
    let seated = 0;
    for (const t of this.townsfolk) {
      if (!t.seated) {
        const spot = SEEING_OFF[standing++ % SEEING_OFF.length];
        t.view.setPosition(spot.x, FLOOR_Y, spot.z);
        t.view.setFacing(spot.facing);
        continue;
      }
      const bench = this.showBench;
      t.view.root.visible = bench !== null;
      if (!bench) continue;
      const cz = (bench.z0 + bench.z1) / 2;
      t.view.setPosition((bench.x0 + bench.x1) / 2 - 0.03, FLOOR_Y + BENCH_SIT_Y, cz + (seated++ === 0 ? -0.5 : 0.5));
      t.view.setFacing(-Math.PI / 2);
    }
  }

  /** Townsfolk idle (a look about, the paper, a call, a chat) and wave when the flag goes up. */
  private animateTownsfolk(dt: number): void {
    const waving = this.master.waving;
    for (const t of this.townsfolk) {
      if (!t.view.root.visible) continue;
      if (waving) t.view.act('wave', 0.3);
      else if (t.left > 0) {
        t.left -= dt;
        t.view.act(t.act, 0.3);
      } else if ((t.next -= dt) <= 0) {
        t.act = t.idles[Math.floor(Math.random() * t.idles.length)];
        t.left = 2.5 + Math.random() * 2.5;
        t.next = 2 + Math.random() * 4;
      }
      t.view.update(dt, 0);
    }
  }

  /** Every pigeon back on the railing (a new station's platform). */
  private pigeonX1 = PLATFORM_X0 + PLATFORM_WIDTH;

  private perchPigeons(x1: number): void {
    this.pigeonX1 = x1;
    if (!this.pigeons.parent) {
      this.pigeons.frustumCulled = false;
      this.pigeons.castShadow = true;
      this.group.add(this.pigeons);
    }
    this.perches.forEach((p, i) => {
      // Along the top rail of the back railing, facing every which way.
      p.x = x1 - 0.05;
      p.y = FLOOR_Y + 0.575;
      p.yaw = ((i * 2.3) % (Math.PI * 2)) - Math.PI;
      p.flown = -1;
    });
  }

  /** The pigeons take off (the departure whistle): up and away from the train, gone in a few seconds. */
  scatterPigeons(): void {
    this.perches.forEach((p, i) => {
      if (p.flown >= 0) return;
      p.flown = 0;
      p.vx = 1.6 + (i % 3) * 0.5;
      p.vz = -1.2 - (i % 2) * 1.4;
    });
  }

  /** Posters of your train on every platform, and a brass band at the door (marketing upgrades). */
  setMarketing(state: MarketingState, trainName: string, body: string, trim: string): void {
    const key = `${trainName}|${body}|${trim}`;
    if (state.posters && key !== this.posterKey) {
      this.posterMaterial.map?.dispose();
      this.posterMaterial.map = posterTexture(trainName, body, trim);
      this.posterMaterial.needsUpdate = true;
      this.posterKey = key;
    }
    this.marketing = { ...state };
    this.buildPosters();
    if (state.band && this.band.length === 0) {
      BAND.forEach((spot, i) => {
        const view = new CharacterView({ ...BAND_LOOK, skin: BAND_SKIN[i % BAND_SKIN.length] });
        view.leans = false;
        view.setPosition(spot.x, FLOOR_Y, spot.z);
        view.setFacing(-Math.PI / 4);
        view.setCarrying(spot.instrument !== 'tuba');
        view.body.add(buildInstrument(spot.instrument));
        view.root.userData.object = `character:band${i}`;
        this.group.add(view.root);
        this.band.push(view);
      });
    }
    for (const view of this.band) view.root.visible = state.band;
  }

  /** The station master's green flag: up and waving while the train departs (and the pigeons take off). */
  setFlag(up: boolean): void {
    if (up && !this.master.waving) this.scatterPigeons();
    // Out of sight once the train is under way: they are back on the roof for the next station.
    if (!up && this.master.waving) this.perchPigeons(this.pigeonX1);
    this.master.waving = up;
  }

  /** Today's front page on the newsstand (the latest story about your train, or the paper's own). */
  setHeadline(text: string): void {
    if (text === this.headline) return;
    this.headline = text;
    this.headlineMaterial.map?.dispose();
    this.headlineMaterial.map = headlineTexture(text);
    this.headlineMaterial.needsUpdate = true;
  }

  /** The band plays while the platform is on screen: a little hop on every beat. */
  animate(dt: number): void {
    this.master.update(dt, 0);
    for (const view of [this.helperView, this.clerkView, this.keeperView]) if (view.root.visible) view.update(dt, 0);
    this.animatePigeons(dt);
    this.animateTownsfolk(dt);
    if (!this.marketing.band || this.band.length === 0) return;
    this.beat += dt;
    const onBeat = this.beat >= BEAT_SECONDS;
    if (onBeat) this.beat -= BEAT_SECONDS;
    this.band.forEach((view, i) => {
      if (onBeat && (i !== 1 || Math.random() < 0.5)) view.bounce(0.35);
      view.update(dt, 0);
    });
  }

  /** Perched pigeons shuffle and peck; flying ones climb away with quick wingbeats (a body squash) and vanish. */
  private animatePigeons(dt: number): void {
    const d = this.pigeonDummy;
    let shown = 0;
    for (const p of this.perches) {
      if (p.flown >= PIGEON_FLY_SECONDS) continue;
      if (p.flown >= 0) {
        p.flown += dt;
        const t = p.flown;
        d.position.set(p.x + p.vx * t, p.y + 1.4 * t + 0.3 * t * t, p.z + p.vz * t);
        d.rotation.set(-0.3, Math.atan2(-p.vx, -p.vz), 0);
        const flap = 1 + Math.sin(t * 40) * 0.35;
        d.scale.set(flap, 1 / flap, 1);
      } else {
        p.peck -= dt;
        if (p.peck <= 0) p.peck = 1.2 + ((p.z * 7.3) % 1.6);
        const pecking = p.peck < 0.25;
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(pecking ? 0.45 : 0, p.yaw + Math.sin(p.peck * 0.8) * 0.3, 0);
        d.scale.set(1, 1, 1);
      }
      d.updateMatrix();
      this.pigeons.setMatrixAt(shown++, d.matrix);
    }
    this.pigeons.count = shown;
    this.pigeons.instanceMatrix.needsUpdate = true;
  }

  private buildPosters(): void {
    if (this.posters) {
      this.group.remove(this.posters);
      this.posters.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.posters = null;
    }
    if (!this.marketing.posters || this.length === 0) return;
    const rowX = POSTER_X;
    const frame = new GeoBuilder();
    const planes: THREE.BufferGeometry[] = [];
    const spots = [POSTER_AHEAD_Z];
    for (let z = POSTER_Z_IN_CARRIAGE; z < this.z1 - 6; z += carriageOriginZ(1)) spots.push(z);
    for (const z of spots) {
      const y0 = FLOOR_Y + 0.5;
      // A navy A-board with brass caps; the poster leans back a little so it reads from above.
      frame.object('platform:poster');
      for (const dx of [-POSTER_W / 2 - 0.05, POSTER_W / 2 + 0.05]) {
        frame.box(rowX + dx, FLOOR_Y + (POSTER_H + 0.5) / 2, z, 0.06, POSTER_H + 0.5, 0.06, PALETTE.navy, 0, { shade: 0.9 });
        frame.sphere(rowX + dx, FLOOR_Y + POSTER_H + 0.55, z, 0.05, PALETTE.brass, 0);
      }
      frame.box(rowX, y0 + POSTER_H / 2, z - 0.03, POSTER_W + 0.12, POSTER_H + 0.1, 0.03, PALETTE.navy, 0, { shade: 0.85 });
      const plane = new THREE.PlaneGeometry(POSTER_W, POSTER_H);
      plane.rotateX(-0.12);
      plane.translate(rowX, y0 + POSTER_H / 2, z);
      planes.push(plane);
    }
    if (planes.length === 0) return;
    const group = new THREE.Group();
    const frameMesh = new THREE.Mesh(frame.build(), MATERIALS.solid);
    frameMesh.castShadow = true;
    group.add(frameMesh, new THREE.Mesh(mergePlanes(planes), this.posterMaterial));
    for (const p of planes) p.dispose();
    this.posters = group;
    this.group.add(group);
  }

  /**
   * Bags on the luggage barrow (session 23): the bottom row first, trunks under suitcases, hat boxes on top; the
   * last ones loaded come off first.
   */
  setBarrowBags(count: number): void {
    const n = Math.max(0, Math.min(this.bagEnds.length, Math.round(count)));
    if (n === this.bagCount) return;
    this.bagCount = n;
    this.bags.visible = n > 0;
    this.bags.geometry.setDrawRange(0, n > 0 ? this.bagEnds[n - 1] : 0);
  }

  /** How many bags the barrow holds. */
  get barrowCapacity(): number {
    return this.bagEnds.length;
  }

  /** Where a bag sits on the barrow (for the bag flying off it), platform-local. */
  static bagPosition(i: number): { x: number; y: number; z: number } {
    const slot = BAG_SLOTS[Math.min(BAG_SLOTS.length - 1, Math.max(0, i))];
    return { x: slot.x, y: FLOOR_Y + BARROW_TOP + slot.y + 0.15, z: slot.z };
  }

  static vendorPosition(supplyCarIndex: number): { x: number; z: number } {
    return { x: PLATFORM_X0 + 2.2, z: carriageOriginZ(supplyCarIndex) + DOOR_Z0 - 1.2 };
  }

  setOffset(z: number): void {
    this.group.position.z = z;
  }
}

/** The platform vendor who sells supply crates: a cart under a striped awning. */
function buildVendor(originZ: number): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const x = PLATFORM_X0 + 3.4;
  const z = originZ + DOOR_Z0 - 1.2;
  b.rounded(x, FLOOR_Y + 0.45, z, 1.4, 0.9, 2.0, 0.08, PALETTE.canopy, { shade: 0.8 });
  b.box(x - 0.71, FLOOR_Y + 0.5, z, 0.02, 0.5, 1.7, PALETTE.stationTrim, 0, { shade: 1 });
  for (const dz of [-0.9, 0.9]) b.cylinder(x + 0.55, FLOOR_Y + 1.2, z + dz, 0.035, 0.035, 1.5, PALETTE.navy, 8);
  b.box(x + 0.2, FLOOR_Y + 2.0, z, 1.8, 0.06, 2.1, PALETTE.stationPink, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.stationTrim, scale: 0.26, shade: 1 });
  for (let dz = -0.95; dz <= 0.96; dz += 0.3) b.cylinder(x - 0.7, FLOOR_Y + 1.95, z + dz, 0.15, 0.15, 0.04, PALETTE.stationPink, 10, 'x', { shade: 1 });
  b.box(x - 0.2, FLOOR_Y + 1.05, z - 0.5, 0.6, 0.3, 0.5, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#A87544', scale: 0.1, shade: 0.85 });
  b.box(x - 0.2, FLOOR_Y + 1.05, z + 0.4, 0.5, 0.3, 0.6, '#D2A06C', 0, { pattern: PATTERN.stripesZ, color2: '#B3834F', scale: 0.1, shade: 0.85 });
  for (const dx of [-0.5, 0.5]) b.cylinder(x + dx, FLOOR_Y + 0.12, z + 0.95, 0.12, 0.12, 0.05, PALETTE.ink, 10, 'z');
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

/** Brass for the band: a trumpet held out front, a tuba worn over the shoulder, a drum at the waist. */
function buildInstrument(kind: 'tuba' | 'drum' | 'trumpet'): THREE.Mesh {
  const b = new GeoBuilder();
  if (kind === 'trumpet') {
    b.cylinder(0.12, 0.82, 0.3, 0.02, 0.02, 0.36, PALETTE.brass, 8, 'z', { shade: 1 });
    b.cylinder(0.12, 0.82, 0.52, 0.07, 0.025, 0.1, PALETTE.brass, 10, 'z', { shade: 1 });
  } else if (kind === 'tuba') {
    b.cylinder(0.0, 0.7, 0.2, 0.12, 0.12, 0.3, PALETTE.brass, 12, 'y', { shade: 0.9 });
    b.cylinder(-0.14, 1.12, 0.12, 0.2, 0.08, 0.3, PALETTE.brass, 14, 'y', { shade: 1 });
  } else {
    b.cylinder(0, 0.55, 0.28, 0.2, 0.2, 0.22, PALETTE.stationTrim, 14, 'y', { shade: 0.9 });
    b.cylinder(0, 0.665, 0.28, 0.2, 0.2, 0.012, PALETTE.linen, 14, 'y', { shade: 1 });
    b.cylinder(0, 0.55, 0.28, 0.205, 0.205, 0.03, '#C0485C', 14, 'y', { shade: 1 });
  }
  const mesh = new THREE.Mesh(b.build(), MATERIALS.character);
  mesh.castShadow = true;
  return mesh;
}

/** A green flag on a short stick, held in the station master's hand. */
function buildFlag(): THREE.Mesh {
  const b = new GeoBuilder();
  b.cylinder(0, -0.25, 0, 0.014, 0.014, 0.62, PALETTE.walnut, 6, 'y', { shade: 1 });
  b.box(0, -0.44, 0.2, 0.02, 0.26, 0.36, '#3E9B5A', 0, { shade: 1 });
  const mesh = new THREE.Mesh(b.build(), MATERIALS.character);
  mesh.castShadow = true;
  return mesh;
}

/** A little green newsstand with a striped awning and the day's headline on a board facing the train. */
function buildKiosk(headline: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  const { x, z } = KIOSK_POS;
  // Station Picks S62: Kenney's market stall under a green awning, its counter toward the platform; papers on it.
  b.object('platform:newsstandStall');
  const e = modelEntry('stall_green');
  const sc = 1.1 / (e.max[0] - e.min[0]);
  b.model('stall_green', x - 0.1, FLOOR_Y, z + 0.1, 0, sc, sc, sc, { recolor: [{ hue: [90, 200], sat: [0.25, 1], val: [0.2, 1], ref: '#3FA07A', to: '#3F7A5E' }], surface: 'wood', shade: 0.9 });
  b.endObject();
  b.object('platform:newspapers');
  const top = FLOOR_Y + (e.max[1] - e.min[1]) * sc * STALL_COUNTER;
  for (let i = 0; i < 4; i++) b.box(x - 0.33 + i * 0.22, top + 0.02, z + 0.35, 0.16, 0.03, 0.22, i % 2 ? '#F4EEE2' : '#E8DCC4', 0, { shade: 1 });
  b.endObject();
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), headline);
  // The headline board stands on the stall's roof, leaning back to face the camera.
  board.position.set(x, FLOOR_Y + (e.max[1] - e.min[1]) * sc + 0.28, z + 0.15);
  board.rotation.x = -0.35;
  group.add(board);
  return group;
}

/** Kenney's stalls: the counter's height as a share of the whole stall's (awning included). */
const STALL_COUNTER = 0.36;

/** The barrow's slatted bed is this high off the deck. */
const BARROW_TOP = 0.445;

type BagKind = 'trunk' | 'case' | 'hatbox' | 'duffel' | 'small';
/** Every bag slot on the barrow, in loading order: the bottom row of trunks and cases, then smaller things on top. */
const BAG_SLOTS: { x: number; z: number; y: number; kind: BagKind; color: string; trim: string }[] = (() => {
  const b = PLATFORM.barrow;
  const xs = [b.x0 + 0.2, b.x1 - 0.2];
  const zs = [b.z0 + 0.27, b.z0 + 0.69, b.z0 + 1.11, b.z0 + 1.53];
  const bottom: [BagKind, string, string][] = [
    ['trunk', '#7A4E34', PALETTE.brass], ['case', '#B8763E', '#5E3A24'], ['case', '#6A2E3A', PALETTE.brass], ['trunk', '#3E5470', '#C9B07A'],
    ['case', '#4E6B4A', '#E9DDBF'], ['trunk', '#8C5A3A', PALETTE.brass], ['case', '#2F4A6E', '#D9C9A3'], ['case', '#A4423A', '#F1E4CF'],
  ];
  const height = (k: BagKind): number => (k === 'trunk' ? 0.27 : 0.17);
  const slots: { x: number; z: number; y: number; kind: BagKind; color: string; trim: string }[] = [];
  bottom.forEach(([kind, color, trim], i) => slots.push({ x: xs[i % 2], z: zs[Math.floor(i / 2)], y: 0, kind, color, trim }));
  const top: [number, BagKind, string, string][] = [
    [0, 'hatbox', '#E7C9D2', '#B4566C'], [3, 'small', '#C8A15A', '#5E3A24'], [5, 'duffel', '#B9A98A', '#6E5B40'], [6, 'hatbox', '#BFD3C6', '#3F7A5E'],
  ];
  for (const [under, kind, color, trim] of top) {
    const base = slots[under];
    slots.push({ x: base.x, z: base.z, y: height(base.kind) + 0.006, kind, color, trim });
  }
  return slots;
})();

/** Builds every bag on the barrow into one geometry and returns where each slot's vertices end (draw ranges). */
function buildBarrowBags(): { geometry: THREE.BufferGeometry; ends: number[] } {
  const b = new GeoBuilder();
  BAG_SLOTS.forEach((slot, i) => {
    b.object(`platform:bag${i}`);
    const y = FLOOR_Y + BARROW_TOP + slot.y;
    const { x, z } = slot;
    switch (slot.kind) {
      case 'trunk':
        // A steamer trunk: a rounded leather box, two straps round it, brass corners, a lid seam.
        b.rounded(x, y + 0.135, z, 0.34, 0.27, 0.38, 0.03, slot.color, { shade: 0.82, surface: 'leather' });
        for (const dz of [-0.1, 0.1]) b.box(x, y + 0.135, z + dz, 0.346, 0.274, 0.03, '#4A3326', 0, { shade: 0.9 });
        b.box(x, y + 0.2, z, 0.346, 0.012, 0.384, shadeOf(slot.color), 0, { shade: 1 });
        for (const dx of [-0.16, 0.16]) for (const dz of [-0.18, 0.18]) b.box(x + dx, y + 0.255, z + dz, 0.035, 0.03, 0.035, slot.trim, 0, { shade: 1, surface: 'brass' });
        break;
      case 'case':
        // A suitcase lying flat: a soft-cornered case, a leather strap, the handle on its side, a luggage label.
        b.rounded(x, y + 0.085, z, 0.33, 0.17, 0.38, 0.035, slot.color, { shade: 0.85, surface: 'leather' });
        b.box(x, y + 0.085, z, 0.035, 0.174, 0.384, slot.trim, 0, { shade: 0.95 });
        b.box(x + 0.172, y + 0.11, z, 0.02, 0.03, 0.12, '#3A2A22', 0, { shade: 1 });
        b.box(x - 0.06, y + 0.172, z + 0.11, 0.09, 0.004, 0.06, '#F4EBD6', 0.3, { shade: 1 });
        break;
      case 'small':
        b.rounded(x, y + 0.07, z, 0.26, 0.14, 0.3, 0.03, slot.color, { shade: 0.85, surface: 'leather' });
        b.box(x, y + 0.142, z, 0.08, 0.012, 0.03, slot.trim, 0, { shade: 1 });
        break;
      case 'hatbox':
        // A round hat box with a striped band and a ribbon on the lid.
        b.cylinder(x, y + 0.08, z, 0.14, 0.14, 0.16, slot.color, 16, 'y', { pattern: PATTERN.stripesX, color2: '#FBF5EA', scale: 0.04, shade: 0.9 });
        b.cylinder(x, y + 0.166, z, 0.145, 0.145, 0.012, slot.trim, 16, 'y', { shade: 1 });
        break;
      case 'duffel':
        // A canvas holdall lying along the barrow, with leather ends.
        b.cylinder(x, y + 0.1, z, 0.1, 0.1, 0.32, slot.color, 12, 'z', { shade: 0.85 });
        for (const dz of [-0.16, 0.16]) b.cylinder(x, y + 0.1, z + dz, 0.102, 0.102, 0.02, slot.trim, 12, 'z', { shade: 0.9 });
        break;
    }
  });
  b.endObject();
  const geometry = b.build();
  const objects = (geometry.userData.objects ?? []) as { label: string; start: number; end: number }[];
  const ends = BAG_SLOTS.map((_, i) => objects.find((o) => o.label === `platform:bag${i}`)?.end ?? 0);
  return { geometry, ends };
}

function shadeOf(hex: string): string {
  const c = new THREE.Color(hex).multiplyScalar(0.72);
  return `#${c.getHexString()}`;
}

/**
 * A railway porter's luggage barrow (session 23, owner: "the baggage area… far more realistic"): a slatted oak
 * bed on an iron frame, two big spoked wheels under its middle, legs at the ends, low brass-capped end rails and a
 * long handle at the back.
 */
function buildBarrow(b: GeoBuilder): void {
  const r = PLATFORM.barrow;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  b.object('platform:barrow');
  // The iron frame: two rails along the bed and cross members.
  for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) b.box(cx + dx, y + 0.38, cz, 0.05, 0.06, d, PALETTE.iron, 0, { shade: 0.85, surface: 'iron' });
  for (const dz of [-d / 2 + 0.06, 0, d / 2 - 0.06]) b.box(cx, y + 0.38, cz + dz, w - 0.08, 0.05, 0.05, PALETTE.iron, 0, { shade: 0.85, surface: 'iron' });
  // Five oak slats with gaps.
  const slats = 5;
  const sw = (w - 0.04) / slats;
  for (let i = 0; i < slats; i++) b.box(r.x0 + 0.02 + sw * (i + 0.5), y + BARROW_TOP - 0.02, cz, sw - 0.025, 0.04, d - 0.02, i % 2 ? PALETTE.oak : '#D9BC8E', 0, { shade: 0.95 });
  // The wheels: big iron-rimmed wheels with a hub, one each side under the middle.
  for (const sx of [-1, 1]) {
    const wx = cx + sx * (w / 2 + 0.035);
    b.cylinder(wx, y + 0.21, cz + 0.12, 0.21, 0.21, 0.045, '#2E2A30', 18, 'x', { shade: 0.9, surface: 'iron' });
    b.cylinder(wx + sx * 0.004, y + 0.21, cz + 0.12, 0.17, 0.17, 0.05, '#9C5B3B', 18, 'x', { shade: 0.95 });
    b.cylinder(wx + sx * 0.01, y + 0.21, cz + 0.12, 0.05, 0.05, 0.06, PALETTE.brass, 10, 'x', { shade: 1, surface: 'brass' });
  }
  // Legs at the front and the back.
  for (const dz of [-d / 2 + 0.1, d / 2 - 0.1]) for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) b.box(cx + dx, y + 0.18, cz + dz, 0.045, 0.36, 0.045, PALETTE.iron, 0, { shade: 0.8, surface: 'iron' });
  // Low end rails, brass-capped.
  for (const ez of [r.z0 + 0.02, r.z1 - 0.02]) {
    for (const dx of [-w / 2 + 0.04, w / 2 - 0.04]) {
      b.box(cx + dx, y + BARROW_TOP + 0.16, ez, 0.035, 0.32, 0.035, PALETTE.iron, 0, { shade: 0.85, surface: 'iron' });
      b.sphere(cx + dx, y + BARROW_TOP + 0.335, ez, 0.028, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
    }
    b.box(cx, y + BARROW_TOP + 0.29, ez, w - 0.08, 0.03, 0.03, PALETTE.iron, 0, { shade: 0.9, surface: 'iron' });
  }
  // The handle: two shafts from the back rising to a wooden bar.
  for (const dx of [-0.22, 0.22]) b.add(new THREE.BoxGeometry(0.035, 0.035, 0.62), PALETTE.iron, cx + dx, y + 0.62, r.z1 + 0.25, -0.62, 0, 0, { shade: 0.9, surface: 'iron' });
  b.cylinder(cx, y + 0.8, r.z1 + 0.5, 0.025, 0.025, 0.52, PALETTE.walnut, 8, 'x', { shade: 1 });
  b.endObject();
  // A little enamel "luggage" plate on a post at the barrow's front corner.
  b.object('platform:luggageSign');
  b.cylinder(r.x1 + 0.12, y + 0.62, r.z0 - 0.12, 0.022, 0.026, 1.24, PALETTE.navy, 8, 'y', { shade: 0.9 });
  b.rounded(r.x1 + 0.12, y + 1.3, r.z0 - 0.12, 0.05, 0.22, 0.34, 0.03, PALETTE.navy, { shade: 1 });
  b.box(r.x1 + 0.149, y + 1.3, r.z0 - 0.12, 0.008, 0.08, 0.2, PALETTE.creamBand, 0, { shade: 1 });
  b.box(r.x1 + 0.149, y + 1.36, r.z0 - 0.12, 0.008, 0.02, 0.12, PALETTE.brass, 0, { shade: 1 });
  b.endObject();
}

/**
 * Phase 2, the Ticket Booth: a slim canopy on two iron posts over the ticket counter, a scalloped navy and cream
 * valance and a lamp under it. Only as wide as the counter and high enough that the queue at the window stays in view.
 */
function buildBoothCanopy(b: GeoBuilder, lamps: GeoBuilder, r: Rect): void {
  const y = FLOOR_Y;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0;
  const x0 = r.x0 - 0.05;
  const x1 = r.x1 + 0.04;
  const cx = (x0 + x1) / 2;
  const top = y + 2.15;
  for (const pz of [r.z0 + 0.06, r.z1 - 0.06]) {
    b.object('platform:boothPost');
    b.cylinder(r.x1 - 0.06, y + 1.58, pz, 0.028, 0.034, 1.04, PALETTE.iron, 8, 'y', { shade: 0.85, surface: 'iron' });
  }
  b.object('platform:boothCanopy');
  b.box(cx, top, cz, x1 - x0, 0.05, d, PALETTE.navy, 0, { shade: 0.9 });
  b.box(cx, top + 0.06, cz, x1 - x0 - 0.06, 0.07, d - 0.06, '#5B6E8C', 0, { shade: 0.85 });
  // The scalloped valance round its edge, navy and cream in turn.
  const n = Math.max(3, Math.round(d / 0.22));
  for (let i = 0; i < n; i++) {
    const z = r.z0 + (i + 0.5) * (d / n);
    b.box(x1, top - 0.08, z, 0.015, 0.12, d / n - 0.01, i % 2 ? PALETTE.creamBand : PALETTE.navy, 0, { shade: 1 });
    b.box(x0, top - 0.08, z, 0.015, 0.12, d / n - 0.01, i % 2 ? PALETTE.creamBand : PALETTE.navy, 0, { shade: 1 });
  }
  b.box(cx, top + 0.14, cz, 0.06, 0.12, 0.5, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
  b.endObject();
  void lamps;
}

/** Phase 2, the Restock Cart upgrade: a striped grocer's awning over the cart on four posts, and a fuller load. */
function buildCartAwning(b: GeoBuilder): void {
  const r = PLATFORM.restock;
  const y = FLOOR_Y;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0 - 0.2;
  b.object('platform:cartAwning');
  for (const px of [r.x0 + 0.05, r.x1 - 0.05]) for (const pz of [cz - d / 2 + 0.05, cz + d / 2 - 0.05]) b.cylinder(px, y + 1.0, pz, 0.02, 0.02, 0.98, PALETTE.oak, 6, 'y', { shade: 0.9 });
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const z = cz - d / 2 + (i + 0.5) * (d / stripes);
    b.add(new THREE.BoxGeometry(r.x1 - r.x0 + 0.24, 0.03, d / stripes), i % 2 ? '#F4EEE2' : '#3F6B4F', (r.x0 + r.x1) / 2, y + 1.5, z, 0, 0, -0.18, { shade: 1 });
  }
  b.endObject();
  b.object('platform:cartLoad');
  for (const [dx, dz, c] of [[-0.18, 0.62, '#D9483B'], [0.0, 0.64, '#F2B53A'], [0.18, 0.62, '#4C8DC9']] as const) b.box((r.x0 + r.x1) / 2 + dx, y + 0.82, cz + dz - 0.62 + 0.62, 0.13, 0.11, 0.14, c, 0, { shade: 1 });
  b.endObject();
}

/** Phase 2, the Luggage Trolley: a two-wheeled sack truck standing up, two cases strapped to it. */
function buildTrolley(b: GeoBuilder, p: { x: number; z: number }): void {
  const y = FLOOR_Y;
  b.object('platform:trolley');
  for (const dz of [-0.2, 0.2]) b.add(new THREE.BoxGeometry(0.035, 1.25, 0.035), PALETTE.iron, p.x + 0.08, y + 0.64, p.z + dz, 0, 0, 0.16, { shade: 0.85, surface: 'iron' });
  for (const h of [0.35, 0.75, 1.1]) b.box(p.x + 0.08 - h * 0.16, y + h, p.z, 0.03, 0.03, 0.42, PALETTE.iron, 0, { shade: 0.85, surface: 'iron' });
  b.box(p.x + 0.2, y + 0.03, p.z, 0.22, 0.03, 0.42, PALETTE.iron, 0, { shade: 0.8, surface: 'iron' });
  for (const dz of [-0.25, 0.25]) {
    b.cylinder(p.x + 0.12, y + 0.13, p.z + dz, 0.13, 0.13, 0.05, '#2E2A30', 14, 'z', { shade: 0.9 });
    b.cylinder(p.x + 0.12, y + 0.13, p.z + dz, 0.045, 0.045, 0.06, PALETTE.brass, 8, 'z', { shade: 1, surface: 'brass' });
  }
  b.endObject();
  b.object('platform:trolleyCases');
  b.rounded(p.x + 0.17, y + 0.26, p.z, 0.18, 0.4, 0.4, 0.03, '#8C3B2E', { shade: 0.85, surface: 'leather' });
  b.rounded(p.x + 0.12, y + 0.63, p.z, 0.16, 0.32, 0.34, 0.03, '#3F6B4F', { shade: 0.85, surface: 'leather' });
  b.box(p.x + 0.26, y + 0.26, p.z, 0.01, 0.4, 0.04, '#E2B04A', 0, { shade: 1 });
  b.endObject();
}

/** Phase 2, the Platform Kiosk: a fruit and bread stall, crates of apples and oranges, loaves, a striped awning. */
function buildFruitStall(b: GeoBuilder, p: { x: number; z: number }): void {
  const y = FLOOR_Y;
  // Station Picks S64: Kenney's stall under a red awning, turned so its counter faces the platform.
  b.object('platform:fruitStall');
  const e = modelEntry('stall_red');
  const sc = 1.35 / (e.max[0] - e.min[0]);
  b.model('stall_red', p.x, y, p.z, Math.PI / 2, sc, sc, sc, { recolor: [{ hue: [330, 20], sat: [0.4, 1], val: [0.3, 1], ref: '#C8443A', to: '#A63A32' }], surface: 'wood', shade: 0.9 });
  b.endObject();
  // S57: KayKit's produce crates on the counter and stacked in front of it, a couple of loaves beside them.
  b.object('platform:fruitStallGoods');
  const top = y + (e.max[1] - e.min[1]) * sc * STALL_COUNTER;
  const crate = (id: 'crate_carrots' | 'crate_tomatoes' | 'crate_lettuce' | 'crate_potatoes', cx: number, cy: number, cz: number, rot: number): void => {
    const c = modelEntry(id);
    const cs = 0.42 / (c.max[0] - c.min[0]);
    b.model(id, cx, cy, cz, rot, cs, cs, cs, { surface: 'wood', shade: 0.9 });
  };
  crate('crate_tomatoes', p.x - 0.05, top, p.z - 0.3, Math.PI / 2);
  crate('crate_lettuce', p.x - 0.05, top, p.z + 0.15, Math.PI / 2);
  const bread = modelEntry('bread');
  const bs = 0.2 / (bread.max[0] - bread.min[0]);
  b.model('bread', p.x - 0.02, top, p.z + 0.48, 0.4, bs, bs, bs, { surface: 'matte', shade: 0.95 });
  crate('crate_carrots', p.x - 0.62, y, p.z - 0.25, Math.PI / 2 + 0.1);
  crate('crate_potatoes', p.x - 0.62, y, p.z + 0.22, Math.PI / 2 - 0.08);
  b.endObject();
}

/** Phase 2, the Station Clock: a cast-iron post with a two-faced clock on top, lit at night. */
function buildStationClock(b: GeoBuilder, lamps: GeoBuilder, p: { x: number; z: number }): void {
  const y = FLOOR_Y;
  b.object('platform:stationClock');
  b.cylinder(p.x, y + 0.08, p.z, 0.18, 0.2, 0.16, PALETTE.iron, 12, 'y', { shade: 0.85, surface: 'iron' });
  b.cylinder(p.x, y + 1.25, p.z, 0.05, 0.07, 2.3, PALETTE.navy, 10, 'y', { shade: 0.9 });
  b.cylinder(p.x, y + 2.62, p.z, 0.32, 0.32, 0.14, PALETTE.navy, 24, 'x', { shade: 0.95 });
  b.sphere(p.x, y + 2.98, p.z, 0.06, PALETTE.brass, 1, 1, { shade: 1, surface: 'brass' });
  // The hands on both faces (ten past ten, the clockmaker's smile).
  for (const sx of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.012, 0.2, 0.025), '#1F2433', p.x + sx * 0.09, y + 2.68, p.z - 0.04, 0.9, 0, 0, { shade: 1 });
    b.add(new THREE.BoxGeometry(0.012, 0.15, 0.025), '#1F2433', p.x + sx * 0.09, y + 2.66, p.z + 0.04, -1.0, 0, 0, { shade: 1 });
  }
  b.endObject();
  lamps.object('platform:clockFace~glow');
  lamps.cylinder(p.x, y + 2.62, p.z, 0.27, 0.27, 0.16, '#FFF4D6', 24, 'x');
  lamps.endObject();
}

/**
 * Phase 2, the restock cart: a wooden handcart along the platform edge loaded with what the train runs on: folded
 * towels in stacks, toilet rolls in a wicker basket and snack boxes, its handle toward the rear.
 */
function buildRestockCart(b: GeoBuilder): void {
  const r = PLATFORM.restock;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0 - 0.3;
  const y = FLOOR_Y;
  const bed = y + 0.5;
  b.object('platform:restockCart');
  // The bed and its low plank sides, painted the station's green with oak tops.
  b.box(cx, bed - 0.03, cz, w, 0.06, d, PALETTE.oak, 0, { shade: 0.9, detail: 'wood' });
  for (const dx of [-w / 2 + 0.025, w / 2 - 0.025]) b.box(cx + dx, bed + 0.09, cz, 0.05, 0.18, d, '#3F6B4F', 0, { shade: 0.85 });
  for (const ez of [cz - d / 2 + 0.025, cz + d / 2 - 0.025]) b.box(cx, bed + 0.09, ez, w, 0.18, 0.05, '#3F6B4F', 0, { shade: 0.85 });
  for (const dx of [-w / 2 + 0.025, w / 2 - 0.025]) b.box(cx + dx, bed + 0.185, cz, 0.06, 0.02, d + 0.02, '#D9BC8E', 0, { shade: 1 });
  // Two big spoked wheels under the middle and a pair of legs at the front.
  for (const sx of [-1, 1]) {
    const wx = cx + sx * (w / 2 + 0.04);
    b.cylinder(wx, y + 0.27, cz + 0.1, 0.27, 0.27, 0.05, '#2E2A30', 18, 'x', { shade: 0.9, surface: 'iron' });
    b.cylinder(wx + sx * 0.004, y + 0.27, cz + 0.1, 0.22, 0.22, 0.055, '#9C5B3B', 18, 'x', { shade: 0.95 });
    b.cylinder(wx + sx * 0.012, y + 0.27, cz + 0.1, 0.06, 0.06, 0.065, PALETTE.brass, 10, 'x', { shade: 1, surface: 'brass' });
  }
  for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) b.box(cx + dx, y + 0.24, cz - d / 2 + 0.1, 0.05, 0.48, 0.05, PALETTE.iron, 0, { shade: 0.8, surface: 'iron' });
  // The handle: two shafts out of the back to a wooden bar.
  for (const dx of [-0.22, 0.22]) b.add(new THREE.BoxGeometry(0.04, 0.04, 0.6), PALETTE.iron, cx + dx, y + 0.66, cz + d / 2 + 0.24, -0.5, 0, 0, { shade: 0.9, surface: 'iron' });
  b.cylinder(cx, y + 0.8, cz + d / 2 + 0.5, 0.026, 0.026, 0.52, PALETTE.walnut, 8, 'x', { shade: 1 });
  b.endObject();
  // The load: two stacks of folded towels (white and striped), a basket of rolls, a crate of snack boxes.
  b.object('platform:restockGoods');
  const top = bed;
  for (const [i, dz] of [-0.45, -0.15].entries()) {
    for (let k = 0; k < 4; k++) b.rounded(cx - 0.12, top + 0.045 + k * 0.075, cz + dz, 0.3, 0.07, 0.24, 0.025, i === 0 ? '#FBF7EF' : k % 2 ? '#6FB3B0' : '#FBF7EF', { shade: 0.95, detail: 'wool' });
  }
  b.cylinder(cx + 0.14, top + 0.12, cz - 0.3, 0.14, 0.12, 0.22, '#B8874E', 14, 'y', { shade: 0.9, detail: 'wood' });
  for (const [dx, dz] of [[0.09, -0.36], [0.19, -0.33], [0.13, -0.24], [0.18, -0.2]] as const) b.cylinder(cx + dx, top + 0.27, cz + dz, 0.05, 0.05, 0.1, '#FFFFFF', 12, 'y', { shade: 1 });
  b.box(cx, top + 0.1, cz + 0.35, w - 0.16, 0.2, 0.42, '#C79A5E', 0, { shade: 0.88, detail: 'wood' });
  for (const [dx, dz, c] of [[-0.15, 0.25, '#D9483B'], [0.0, 0.27, '#F2B53A'], [0.15, 0.25, '#D9483B'], [-0.08, 0.45, '#F2B53A'], [0.09, 0.45, '#4C8DC9']] as const) b.box(cx + dx, top + 0.25, cz + dz, 0.12, 0.1, 0.13, c, 0, { shade: 1 });
  b.endObject();
}

/** A platform weighing machine beside the barrow: a brass plate, a column and a round dial facing the platform. */
/** A bench's length on the platform (metres); its height and depth follow the model's own proportions. */
const BENCH_LENGTH = 1.4;

/** Fits a model to a height, standing on y (uniform scale). */
function fitModel(b: GeoBuilder, id: Parameters<typeof modelEntry>[0], x: number, y: number, z: number, height: number, rotY = 0, recolor: ReturnType<typeof key>[] = [], surface: 'foliage' | 'wood' | 'paint' | 'matte' = 'foliage'): void {
  const e = modelEntry(id);
  const sc = height / (e.max[1] - e.min[1]);
  b.model(id, x, y, z, rotY, sc, sc, sc, { recolor, surface, shade: 0.85 });
}

/** A wooden planter by the railing (session 51b): a Tiny Treats bush in it, flowers round its edge. */
function buildPlanter(b: GeoBuilder, x: number, z: number): void {
  const y = FLOOR_Y;
  b.rounded(x, y + 0.17, z, 0.66, 0.34, 0.66, 0.05, '#7A5236', { shade: 0.85, surface: 'wood' });
  b.box(x, y + 0.335, z, 0.6, 0.02, 0.6, '#4A3628', 0, { shade: 0.9 });
  fitModel(b, 'park_bush', x, y + 0.34, z, 0.38);
  fitModel(b, 'flower_white', x - 0.2, y + 0.34, z + 0.2, 0.08, 0.4);
  fitModel(b, 'flower_blue', x + 0.2, y + 0.34, z - 0.19, 0.08, 1.1);
}

/**
 * The ticket stand (session 23): a low panelled counter with an oak top and a brass rail on the travellers'
 * side, a ticket rack, a cash tin, a brass bell and a green-shaded lamp, and a "Tickets" board on a post at its
 * front end. Low, so the traveller at the window is never hidden from the camera.
 */
function buildTicketStand(b: GeoBuilder, lamps: GeoBuilder, dz = 0): void {
  const c = PLATFORM.counter;
  const r = { x0: c.x0, z0: c.z0 + dz, x1: c.x1, z1: c.z1 + dz };
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  b.object('platform:ticketStand');
  b.box(cx, y + 0.04, cz, w - 0.02, 0.08, d - 0.02, '#2A3248', 0, { shade: 0.8 });
  b.box(cx, y + 0.53, cz, w - 0.06, 0.9, d - 0.06, PALETTE.navy, 0, { shade: 0.82, surface: 'varnish' });
  // Raised panels on both long faces, in oak frames.
  for (const side of [-1, 1]) {
    const fx = cx + side * (w / 2 - 0.025);
    for (const pz of [-d / 3, 0, d / 3]) {
      b.box(fx, y + 0.55, cz + pz, 0.012, 0.62, d / 3 - 0.1, PALETTE.oak, 0, { shade: 0.95 });
      b.box(fx + side * 0.005, y + 0.55, cz + pz, 0.012, 0.52, d / 3 - 0.2, '#2C4366', 0, { shade: 0.9 });
    }
  }
  // The oak top, overhanging a little, and the brass rail on the travellers' side.
  b.box(cx, y + 1.01, cz, w + 0.06, 0.05, d + 0.06, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: '#D9BC8E', scale: 0.08, shade: 1, surface: 'varnish' });
  b.cylinder(r.x0 - 0.01, y + 1.1, cz, 0.016, 0.016, d - 0.1, PALETTE.brass, 8, 'z', { shade: 1, surface: 'brass' });
  for (const dz of [-d / 2 + 0.08, 0, d / 2 - 0.08]) b.box(r.x0 - 0.01, y + 1.06, cz + dz, 0.02, 0.08, 0.02, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
  b.endObject();
  // On the counter: the ticket rack at the front end, the cash tin and bell in the middle, the lamp at the back.
  const top = y + 1.035;
  b.object('platform:ticketRack');
  b.box(cx + 0.06, top + 0.09, r.z0 + 0.22, 0.26, 0.18, 0.3, PALETTE.walnut, 0, { shade: 0.85 });
  const colors = ['#F4EBD6', '#F2B8B0', '#BFD8B5', '#F4EBD6', '#C9D6EA', '#F2D58C'];
  colors.forEach((c, i) => b.box(cx + 0.06 - 0.06 + (i % 2) * 0.12, top + 0.2, r.z0 + 0.12 + Math.floor(i / 2) * 0.1, 0.1, 0.04, 0.07, c, 0, { shade: 1 }));
  b.object('platform:cashTin');
  {
    // Station Picks S8: Tiny Treats' cash register on our counter (the counter itself stays: it reads as a booking
    // office), its keys toward the conductor on the outer side.
    const t = modelEntry('till');
    const ts = 0.26 / (t.max[0] - t.min[0]);
    b.model('till', cx + 0.02, top, cz + 0.12, Math.PI / 2, ts, ts, ts, { recolor: [key('ttMid', '#3F7A5E'), key('ttLight', PALETTE.brass)], surface: 'paint', shade: 0.95 });
  }
  b.object('platform:bell');
  b.cylinder(cx - 0.12, top + 0.008, cz - 0.2, 0.06, 0.06, 0.016, PALETTE.walnut, 12, 'y', { shade: 1 });
  b.sphere(cx - 0.12, top + 0.02, cz - 0.2, 0.05, PALETTE.brass, 1, 0.8, { shade: 1, surface: 'brass' });
  b.object('platform:standLamp');
  b.cylinder(cx + 0.05, top + 0.012, r.z1 - 0.2, 0.07, 0.08, 0.024, PALETTE.brass, 12, 'y', { shade: 1, surface: 'brass' });
  b.cylinder(cx + 0.05, top + 0.2, r.z1 - 0.2, 0.012, 0.012, 0.36, PALETTE.brass, 6, 'y', { shade: 1, surface: 'brass' });
  b.endObject();
  lamps.object('platform:standLamp~glow');
  lamps.cylinder(cx + 0.05, top + 0.42, r.z1 - 0.2, 0.06, 0.12, 0.1, '#5E9C74', 12, 'y');
  lamps.endObject();
  // The "Tickets" board's post (the board itself is a painted plane, see PlatformView).
  b.object('platform:ticketSignPost');
  b.cylinder(cx, y + 1.0, r.z0 - 0.16, 0.026, 0.03, 2.0, PALETTE.navy, 8, 'y', { shade: 0.9 });
  b.box(cx, y + 2.02, r.z0 - 0.16, 0.06, 0.04, 0.06, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
  b.endObject();
}

/** A bench by the back railing: oak slats along the platform, iron ends, its back to the railing. */
function buildBench(b: GeoBuilder, r: Rect): void {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const d = r.z1 - r.z0;
  const y = FLOOR_Y;
  b.object('platform:bench');
  {
    // Session 51: Tiny Treats' park bench (slatted wood on iron ends), its back to the railing.
    // Session 51b (owner: "the benches… don't feel like they belong"): at its own proportions (it was squashed to the
    // rect, flat and thin), its back to the railing, the seat reaching out onto the platform.
    // Station Picks S14 (the owner's pick): Kenney's slatted wooden bench, its legs in the station's navy.
    const e = modelEntry('bench_log');
    const sc = Math.min(d * 0.8, BENCH_LENGTH) / (e.max[0] - e.min[0]);
    const deep = (e.max[2] - e.min[2]) * sc;
    b.model('bench_log', r.x1 - deep / 2, y, cz, -Math.PI / 2, sc, sc, sc, {
      recolor: [{ hue: [180, 260], sat: [0.15, 1], val: [0.2, 1], ref: '#6080C0', to: PALETTE.navy }, WARM(PALETTE.oak)],
      surface: 'wood',
    });
    b.endObject();
    return;
  }
  for (let i = 0; i < 3; i++) b.box(r.x0 + 0.07 + i * 0.1, y + 0.42, cz, 0.08, 0.035, d - 0.08, PALETTE.oak, 0, { shade: 1 });
  for (let i = 0; i < 2; i++) b.box(r.x1 - 0.06, y + 0.6 + i * 0.13, cz, 0.035, 0.08, d - 0.08, PALETTE.oak, 0, { shade: 1 });
  for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) {
    b.box(cx, y + 0.2, r.z0 + d / 2 + dz, r.x1 - r.x0 - 0.04, 0.4, 0.05, PALETTE.navy, 0, { shade: 0.85, surface: 'iron' });
    b.box(r.x1 - 0.06, y + 0.62, r.z0 + d / 2 + dz, 0.05, 0.44, 0.05, PALETTE.navy, 0, { shade: 0.85, surface: 'iron' });
  }
  b.endObject();
}

/**
 * The station bell (session 29): an iron post with a scrolled bracket, a brass hand bell hanging from it. The
 * conductor rings it at a stop and the latecomers hurry out of the station house.
 */
function buildBellPost(b: GeoBuilder): void {
  const y = FLOOR_Y;
  const { x, z } = PLATFORM.bell;
  // Station Picks S75: KayKit's post in the station's navy, KayKit's brass hand bell on its top.
  b.object('platform:bellPost');
  const post = modelEntry('iron_post');
  const ps = 1.35 / (post.max[1] - post.min[1]);
  b.model('iron_post', x, y, z, Math.PI / 2, ps, ps, ps, { recolor: [ANY_DARK(PALETTE.navy), ANY_LIGHT('#4A5C86')], surface: 'iron', shade: 0.9 });
  const bell = modelEntry('hand_bell');
  const bs = 0.24 / (bell.max[1] - bell.min[1]);
  b.model('hand_bell', x, y + (post.max[1] - post.min[1]) * ps, z, 0, bs, bs, bs, { recolor: [WARM(PALETTE.brass)], surface: 'brass', shade: 1 });
  b.endObject();
}

/** The lamp post's lighter iron (its cap and trims). */
const shadeNavy = '#3C4A70';

/** A Victorian lamp post: a fluted base, a slim column and two lanterns on a crossbar along the platform. */
function buildLampPost(b: GeoBuilder, lamps: GeoBuilder, x: number, z: number): void {
  const y = FLOOR_Y;
  b.object('platform:lampPost');
  {
    // Session 51: Tiny Treats' street lantern in the station's navy iron, its glass lit.
    const e = modelEntry('street_lamp');
    const sc = 2.75 / (e.max[1] - e.min[1]);
    b.model('street_lamp', x, y, z, 0, sc, sc, sc, { recolor: [key('ttMid', PALETTE.navy), key('ttLight', shadeNavy)], surface: 'iron' });
    b.endObject();
    lamps.object('platform:lampPost~glow');
    lamps.box(x, y + 2.52, z, 0.2, 0.22, 0.2, PALETTE.lampShade, 0);
    lamps.endObject();
    return;
  }
  b.cylinder(x, y + 0.1, z, 0.13, 0.17, 0.2, PALETTE.navy, 12, 'y', { shade: 0.8, surface: 'iron' });
  b.cylinder(x, y + 0.26, z, 0.08, 0.11, 0.14, PALETTE.navy, 12, 'y', { shade: 0.85, surface: 'iron' });
  b.cylinder(x, y + 1.35, z, 0.04, 0.055, 2.05, PALETTE.navy, 10, 'y', { shade: 0.88, surface: 'iron' });
  b.box(x, y + 2.3, z, 0.05, 0.05, 0.62, PALETTE.navy, 0, { shade: 1, surface: 'iron' });
  b.sphere(x, y + 2.45, z, 0.045, PALETTE.brass, 0, 1, { shade: 1, surface: 'brass' });
  for (const dz of [-0.26, 0.26]) {
    b.box(x, y + 2.31, z + dz, 0.16, 0.025, 0.16, PALETTE.navy, 0, { shade: 1, surface: 'iron' });
    b.cone(x, y + 2.6, z + dz, 0.12, 0.1, PALETTE.navy, 4, { shade: 1, surface: 'iron' });
  }
  b.endObject();
  for (const dz of [-0.26, 0.26]) {
    lamps.object('platform:lampPost~glow');
    lamps.box(x, y + 2.43, z + dz, 0.13, 0.2, 0.13, PALETTE.lampShade, 0);
  }
  lamps.endObject();
}

/**
 * The station house, ahead of the train behind the railing (session 23). The camera sees its roof and its end
 * facing the train's rear, so that is its front: lamplit windows, a clock in the gable and the doors travellers
 * come out of, beside the way onto the platform.
 */
function buildStationHouse(b: GeoBuilder, lamps: GeoBuilder, x1: number, gate: number): void {
  const x0 = x1 + 0.45;
  const xe = x1 + 6.05;
  const zf = gate - GATE_HALF - 0.15;
  const zb = zf - 8.6;
  const cx = (x0 + xe) / 2;
  const cz = (zb + zf) / 2;
  const w = xe - x0;
  const d = zf - zb;
  b.object('platform:stationHouse');
  b.box(cx, 0.32, cz, w + 0.1, 0.64, d + 0.1, '#C9B79A', 0, { shade: 0.85 });
  b.box(cx, 1.9, cz, w, 3.2, d, PALETTE.stationPink, 0, { shade: 0.8 });
  b.box(cx, 3.56, cz, w + 0.3, 0.16, d + 0.3, PALETTE.stationTrim, 0, { shade: 1 });
  b.prism(cx, 3.64, cz, w + 0.6, 1.9, d + 0.5, PALETTE.roofTerracotta, { pattern: PATTERN.stripesZ, color2: '#B85A4D', scale: 0.25, shade: 1 });
  b.box(cx + 1.3, 4.9, zb + 2.4, 0.5, 1.1, 0.5, '#B9A48A', 0, { shade: 0.85 });
  // The front (facing the train's rear): an arched doorway by the platform, lamplit windows, a clock in the gable.
  const face = zf + 0.005;
  const doorX = x0 + 1.0;
  b.box(doorX, 1.3, face + 0.02, 1.3, 2.4, 0.06, PALETTE.stationTrim, 0, { shade: 1 });
  b.box(doorX, 1.22, face + 0.05, 1.04, 2.1, 0.02, '#3B2F2A', 0, { shade: 1 });
  b.cylinder(doorX, 2.32, face + 0.05, 0.52, 0.52, 0.02, '#3B2F2A', 16, 'z', { shade: 1 });
  for (const wx of [cx + 0.55, cx + 1.85]) {
    b.box(wx, 2.0, face + 0.02, 0.86, 1.5, 0.06, PALETTE.stationTrim, 0, { shade: 1 });
    lamps.object('platform:houseWindow~glow');
    lamps.box(wx, 2.0, face + 0.055, 0.66, 1.28, 0.012, '#F3CF8E', 0);
  }
  lamps.endObject();
  for (const dx of [-0.82, 0.82]) {
    b.box(doorX + dx, 2.1, face + 0.1, 0.06, 0.06, 0.14, PALETTE.navy, 0, { shade: 1 });
    lamps.object('platform:doorLantern~glow');
    lamps.box(doorX + dx, 2.0, face + 0.2, 0.14, 0.22, 0.14, PALETTE.lampShade, 0);
  }
  lamps.endObject();
  b.cylinder(cx, 4.35, face + 0.04, 0.46, 0.46, 0.06, PALETTE.gold, 24, 'z', { shade: 1, surface: 'brass' });
  b.cylinder(cx, 4.35, face + 0.075, 0.39, 0.39, 0.02, PALETTE.linen, 24, 'z', { shade: 1 });
  b.box(cx, 4.47, face + 0.09, 0.03, 0.24, 0.01, PALETTE.ink, 0, { shade: 1 });
  b.box(cx + 0.08, 4.35, face + 0.09, 0.18, 0.03, 0.01, PALETTE.ink, 0, { shade: 1 });
  b.endObject();
  // Station Picks S73: Tiny Treats' framed board between the door and the windows, the timetable pinned on it.
  b.object('platform:noticeBoard');
  {
    const e = modelEntry('notice_board');
    const sc = 0.95 / (e.max[0] - e.min[0]);
    b.model('notice_board', x1 + 2.75, 1.25, face + 0.07 - e.min[2] * sc, 0, sc, sc, sc, { surface: 'wood', shade: 0.95 });
  }
  b.endObject();
}

/**
 * The station's forecourt beyond the back railing (session 30, owner: "the background in station is quite unpolished,
 * make the environment better and more lived in"): a grass verge with clipped hedges and flower beds along the railing,
 * a cobbled lane with kerbs and street lamps, and across it the front gardens of the village behind picket fences
 * (shrubs, flower beds, a water butt, a bench), with bicycles, a handcart of crates, a postbox and a flower barrow by
 * the way in. Everything is low: the camera looks over it at the platform (nothing here stands higher than the lamps).
 */
function buildForecourt(flat: GeoBuilder, b: GeoBuilder, lamps: GeoBuilder, x1: number, z0: number, z1: number, gate: number): void {
  const G = 0.12;
  const top = G + 0.03;
  const width = 9.4;
  const zc = (z0 + z1) / 2;
  const length = z1 - z0;
  const laneX0 = x1 + 2.05;
  const laneX1 = x1 + 5.0;
  // Where the station house stands, and the path from the way in down to the lane.
  const houseZ1 = gate - GATE_HALF - 0.15;
  const houseZ0 = houseZ1 - 8.6;
  const inHouse = (z: number, margin: number): boolean => z > houseZ0 - margin && z < houseZ1 + margin;
  const atGate = (z: number, margin: number): boolean => Math.abs(z - gate) < GATE_HALF + margin;

  // The ground: grass, the lane and its kerbs, the path from the gate, the garden path.
  flat.object('forecourt:grass');
  flat.box(x1 + width / 2, G - 0.12, zc, width, 0.3, length, '#6E9A5C', 0, { shade: 1, detail: 'grass' });
  // The paving lies flush on the grass: flat dressing, not an object of its own.
  flat.endObject();
  for (const [a, c] of [[z0, houseZ0 - 0.3], [houseZ1 + 0.1, z1]] as [number, number][]) {
    if (c <= a) continue;
    const mid = (a + c) / 2;
    flat.box((laneX0 + laneX1) / 2, top + 0.012, mid, laneX1 - laneX0, 0.024, c - a, '#8E8A86', 0, { shade: 1, detail: 'paving' });
    for (const kx of [laneX0 - 0.08, laneX1 + 0.08]) flat.box(kx, top + 0.04, mid, 0.16, 0.08, c - a, '#C9C1B2', 0, { shade: 1 });
    flat.box(laneX1 + 0.5, top + 0.008, mid, 0.7, 0.016, c - a, '#B9AE97', 0, { shade: 1 });
  }
  flat.box((x1 + laneX0) / 2, top + 0.01, gate, laneX0 - x1, 0.02, GATE_HALF * 2, '#B4A893', 0, { shade: 1, detail: 'paving' });
  flat.endObject();

  let k = 7;
  const rnd = (): number => {
    k = (k * 9301 + 49297) % 233280;
    return k / 233280;
  };
  const flowers = ['#E58A9E', '#F2D16B', '#F4F1EA', '#B78BD6', '#E7814F'];
  const hedgeGreen = '#5E8A55';
  void hedgeGreen;

  // Along the railing: clipped hedges, a flower bed between every two.
  for (let z = z0 + 1; z < z1 - 2; z += 4.2) {
    if (atGate(z, 2.4) || inHouse(z, 1)) continue;
    b.object('forecourt:hedge');
    {
      // Session 51: Tiny Treats' clipped hedge, along the railing.
      const e = modelEntry('hedge');
      b.model('hedge', x1 + 0.75, top, z + 1.2, Math.PI / 2, 2.4 / (e.max[0] - e.min[0]), 0.9 / (e.max[1] - e.min[1]), 0.8 / (e.max[2] - e.min[2]), { surface: 'foliage', shade: 0.8 });
    }
    b.object('forecourt:bed');
    b.rounded(x1 + 0.75, top + 0.07, z + 3.2, 0.9, 0.14, 1.3, 0.1, '#6B4C38', { shade: 0.9 });
    for (let i = 0; i < 6; i++) fitModel(b, i % 2 ? 'flower_blue' : 'flower_white', x1 + 0.52 + (i % 2) * 0.44, top + 0.14, z + 2.75 + Math.floor(i / 2) * 0.45, 0.1, i * 0.9);
    fitModel(b, 'grass_tuft', x1 + 0.75, top + 0.14, z + 3.2, 0.22);
  }
  b.endObject();

  // Street lamps on the far kerb, their heads lit.
  for (let z = z0 + 3; z < z1 - 2; z += 9) {
    if (inHouse(z, 1)) continue;
    const lx = laneX1 + 0.32;
    b.object('forecourt:lamp');
    const e = modelEntry('street_lamp');
    const sc = 2.75 / (e.max[1] - e.min[1]);
    b.model('street_lamp', lx, top, z, 0, sc, sc, sc, { recolor: [key('ttMid', '#2B3046'), key('ttLight', '#3A4060')], surface: 'iron' });
    lamps.object('forecourt:lamp~glow');
    lamps.box(lx, top + 2.52, z, 0.2, 0.22, 0.2, PALETTE.lampShade, 0);
  }
  b.endObject();
  lamps.endObject();

  // Across the lane: the village's front gardens behind a white picket fence, a gate in it every garden.
  const fenceX = laneX1 + 1.0;
  for (let z = z0 + 0.5; z < z1 - 1; z += 6) {
    if (inHouse(z, 1.5)) continue;
    b.object('forecourt:fence');
    b.box(fenceX, top + 0.3, z + 2.5, 0.04, 0.05, 4.8, '#EDE6D8', 0, { shade: 1 });
    b.box(fenceX, top + 0.15, z + 2.5, 0.04, 0.05, 4.8, '#EDE6D8', 0, { shade: 1 });
    for (let pz = z + 0.15; pz < z + 4.9; pz += 0.3) b.box(fenceX, top + 0.24, pz, 0.05, 0.48, 0.07, '#F4EEE2', 0, { shade: 0.9 });
    const garden = Math.floor((z - z0) / 6);
    const kind = garden % 4;
    const gx = fenceX + 1.6;
    const gz = z + 2.5;
    b.object('forecourt:garden');
    // Every garden: a path to the cottage, round shrubs and a bed of flowers.
    b.box(gx, top + 0.006, gz + 2.65, 3.0, 0.012, 0.7, '#B9AE97', 0, { shade: 1 });
    fitModel(b, 'park_bush', fenceX + 0.6, top, z + 0.7, 0.55, garden);
    fitModel(b, 'park_bush_large', fenceX + 2.6, top, z + 1.0, 0.75, garden * 2);
    b.rounded(gx, top + 0.06, gz + 0.4, 1.8, 0.12, 0.7, 0.08, '#6B4C38', { shade: 0.9 });
    for (let i = 0; i < 7; i++) fitModel(b, (i + garden) % 2 ? 'flower_blue' : 'flower_white', gx - 0.75 + i * 0.25, top + 0.12, gz + 0.4 + (i % 2 ? 0.14 : -0.14), 0.09, i);
    if (kind === 0) {
      // A garden bench and a water butt.
      b.box(gx + 0.5, top + 0.24, gz - 1.4, 0.4, 0.05, 1.2, '#8A6A4E', 0, { shade: 0.9, surface: 'wood' });
      b.box(gx + 0.68, top + 0.45, gz - 1.4, 0.05, 0.38, 1.2, '#8A6A4E', 0, { shade: 0.9, surface: 'wood' });
      for (const dz of [-0.52, 0.52]) b.box(gx + 0.5, top + 0.11, gz - 1.4 + dz, 0.36, 0.22, 0.05, '#3A3A40', 0, { shade: 0.9 });
      b.cylinder(fenceX + 3.4, top + 0.35, gz + 1.5, 0.26, 0.24, 0.7, '#4D6E8A', 14, 'y', { shade: 0.85 });
    } else if (kind === 1) {
      // A vegetable patch in rows and an upturned wheelbarrow.
      for (let r = 0; r < 3; r++) {
        b.box(gx - 0.2 + r * 0.42, top + 0.05, gz - 1.3, 0.3, 0.1, 1.6, '#5A4030', 0, { shade: 0.9 });
        for (let i = 0; i < 4; i++) b.sphere(gx - 0.2 + r * 0.42, top + 0.16, gz - 1.9 + i * 0.4, 0.1, '#7FA65A', 0, 0.8, { shade: 0.9, surface: 'foliage' });
      }
      b.rounded(fenceX + 3.3, top + 0.22, gz + 1.4, 0.55, 0.3, 0.8, 0.1, '#7D8C99', { shade: 0.85 });
    } else if (kind === 2) {
      // A washing line between two posts with a few things pegged out.
      for (const dz of [-1.5, 0.9]) b.box(gx + 0.6, top + 0.75, gz + dz, 0.05, 1.5, 0.05, '#8A6A4E', 0, { shade: 0.9 });
      b.box(gx + 0.6, top + 1.42, gz - 0.3, 0.01, 0.01, 2.4, '#DDD6C8', 0, { shade: 1 });
      ['#F4F1EA', '#9DB8CF', '#E8A0A8', '#F4F1EA'].forEach((c, i) => b.box(gx + 0.6, top + 1.22, gz - 1.2 + i * 0.55, 0.02, 0.36, 0.34, c, 0, { shade: 0.95, surface: 'fabric' }));
    } else {
      // A little apple tree and a bird table.
      fitModel(b, 'park_tree', gx + 0.4, top, gz - 1.2, 2.2, garden);
      b.cylinder(fenceX + 3.2, top + 0.5, gz + 1.4, 0.03, 0.03, 1.0, '#8A6A4E', 6, 'y', { shade: 0.9 });
      b.box(fenceX + 3.2, top + 1.02, gz + 1.4, 0.36, 0.04, 0.36, '#8A6A4E', 0, { shade: 0.9, surface: 'wood' });
    }
  }
  b.endObject();

  // Things in the lane and by the way in: bicycles against the hedge, a handcart of crates, a postbox, a flower barrow.
  const bikeZ = gate + GATE_HALF + 1.4;
  for (const dz of [0, 1.2]) {
    b.object('forecourt:bicycle');
    const bx = x1 + 1.55;
    for (const wz of [-0.32, 0.32]) b.add(new THREE.TorusGeometry(0.2, 0.022, 6, 16), '#2B2733', bx, top + 0.22, bikeZ + dz + wz, 0, Math.PI / 2, 0, { shade: 1 });
    b.box(bx, top + 0.36, bikeZ + dz, 0.03, 0.03, 0.6, dz < 0.5 ? '#C0485C' : '#3D7CC9', 0, { shade: 1 });
    b.box(bx, top + 0.5, bikeZ + dz - 0.12, 0.08, 0.025, 0.14, '#3A3330', 0, { shade: 1 });
    b.box(bx, top + 0.55, bikeZ + dz + 0.3, 0.32, 0.02, 0.02, '#2B2733', 0, { shade: 1 });
  }
  b.object('forecourt:handcart');
  const cz = gate + GATE_HALF + 4.2;
  const cx = laneX0 + 0.75;
  b.box(cx, top + 0.38, cz, 0.8, 0.06, 1.2, '#8A6A4E', 0, { shade: 0.9, surface: 'wood' });
  for (const wz of [-0.4, 0.4]) b.cylinder(cx - 0.42, top + 0.22, cz + wz, 0.22, 0.22, 0.05, '#4A3A30', 14, 'x', { shade: 1 });
  b.box(cx + 0.55, top + 0.42, cz, 0.5, 0.03, 0.03, '#8A6A4E', 0, { shade: 1 });
  [['#C9A46A', -0.28], ['#B5835A', 0.25], ['#D9BC8E', 0]].forEach(([c, dz], i) => b.box(cx - 0.05, top + 0.56 + (i === 2 ? 0.26 : 0), cz + (dz as number), 0.5, 0.26, 0.45, c as string, 0, { shade: 0.85, surface: 'wood' }));
  b.object('forecourt:postbox');
  const px = x1 + 1.75;
  const pz = gate - GATE_HALF - 0.55;
  if (!inHouse(pz, -0.1) || true) {
    // Session 51: Tiny Treats' letterbox on its post, painted pillar-box red.
    const e = modelEntry('postbox');
    const sc = 1.15 / (e.max[1] - e.min[1]);
    b.model('postbox', px, top, gate + GATE_HALF + 0.5, -Math.PI / 2, sc, sc, sc, { recolor: [key('cover', '#C8343A'), key('ttWood', '#5A3A2A')], surface: 'paint' });
  }
  void pz;
  // Station Picks S70: a wooden fingerpost by the way in, pointing travellers to the village.
  b.object('forecourt:signpost');
  {
    const e = modelEntry('signpost');
    const sc = 1.7 / (e.max[1] - e.min[1]);
    b.model('signpost', x1 + 1.0, top, gate + GATE_HALF + 1.5, -Math.PI / 2 + 0.3, sc, sc, sc, { surface: 'wood', shade: 0.9 });
  }
  // Station Picks S87: the water tower the engines fill from, a timber tank on legs beside the station house.
  b.object('forecourt:waterTower');
  {
    const e = modelEntry('water_tower');
    const sc = 4.6 / (e.max[1] - e.min[1]);
    b.model('water_tower', x1 + 7.7, top, houseZ0 + 3.0, 0.2, sc, sc, sc, { surface: 'wood', shade: 0.9 });
  }
  b.endObject();
  b.object('forecourt:flowerBarrow');
  const fz = gate + GATE_HALF + 6.8;
  const fx = laneX0 + 0.85;
  b.box(fx, top + 0.5, fz, 0.9, 0.14, 1.5, '#3F7A5E', 0, { shade: 0.9, surface: 'paint' });
  for (const wz of [-0.55, 0.55]) b.cylinder(fx - 0.48, top + 0.28, fz + wz, 0.28, 0.28, 0.05, '#4A3A30', 14, 'x', { shade: 1 });
  for (let i = 0; i < 8; i++) {
    const bxp = fx - 0.25 + (i % 2) * 0.5;
    const bzp = fz - 0.55 + Math.floor(i / 2) * 0.37;
    b.cylinder(bxp, top + 0.66, bzp, 0.13, 0.11, 0.18, '#C9B79A', 10, 'y', { shade: 0.9 });
    b.sphere(bxp, top + 0.82, bzp, 0.13, flowers[i % flowers.length], 1, 0.8, { shade: 0.9, surface: 'foliage' });
  }
  b.endObject();
  void rnd;
}
