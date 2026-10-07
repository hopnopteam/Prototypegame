import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder, mergePlanes } from './geo';
import { carriageOriginZ, DOOR_Z0, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';
import { PLATFORM } from './platformLayout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { CharacterView, type CharacterLook } from './CharacterView';
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
  { x: PLATFORM_X0 + 2.2, z: -8.0, instrument: 'trumpet' },
  { x: PLATFORM_X0 + 3.05, z: -8.7, instrument: 'tuba' },
  { x: PLATFORM_X0 + 3.9, z: -8.0, instrument: 'drum' },
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
/** Lamp posts along the back railing, this far apart. */
const LAMP_STEP = 6;
/** The name board's posts stand this far either side of the way in. */
const SIGN_POST_HALF = 1.25;
/** The kiosk's vendor, behind the counter. */
const VENDOR_LOOK: CharacterLook = { body: '#3F7A5E', accent: '#F4EEE2', skin: '#E8B894', hair: '#5B3A29', pants: '#2F3A33', hat: 'cap', hatColor: '#3F7A5E', arms: true };
const PIGEON_FLY_SECONDS = 3.2;

let glowMap: THREE.Texture | null = null;

/** A soft round halo for the platform's lamps (drawn once, shared). */
function glowTexture(): THREE.Texture {
  if (glowMap) return glowMap;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowMap = new THREE.CanvasTexture(c);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  return glowMap;
}

/** A pigeon about 0.3 m long, facing -z: grey body, a darker head with a green-violet neck, a tail. */
function pigeonGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.add(new THREE.SphereGeometry(0.08, 8, 6).scale(0.85, 0.8, 1.35), '#8E96A6', 0, 0.075, 0, 0, 0, 0, { shade: 0.85 });
  b.add(new THREE.SphereGeometry(0.06, 7, 5).scale(0.8, 0.6, 1.1), '#A9B0BC', 0, 0.09, 0.02, 0, 0, 0, { shade: 0.95 });
  b.add(new THREE.SphereGeometry(0.045, 7, 5), '#5E6678', 0, 0.15, -0.09, 0, 0, 0, { shade: 0.9 });
  b.add(new THREE.SphereGeometry(0.04, 6, 4).scale(1, 0.7, 0.9), '#5E8A7E', 0, 0.115, -0.07, 0, 0, 0, { shade: 1 });
  b.add(new THREE.ConeGeometry(0.012, 0.035, 4).rotateX(-Math.PI / 2), '#D9B88A', 0, 0.145, -0.14, 0, 0, 0, { shade: 1 });
  b.add(new THREE.BoxGeometry(0.07, 0.015, 0.09), '#6E7686', 0, 0.08, 0.12, 0.25, 0, 0, { shade: 0.9 });
  return b.build();
}

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
  private readonly glows: THREE.Sprite[] = [];
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
  private readonly headlineMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  private headline = '';
  length = 0;
  z0 = 0;
  z1 = 0;
  /** The platform's lamps for the lamp pools (local coordinates; the game slides them with the platform). */
  readonly lampAnchors: LampAnchor[] = [];

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
    this.vendorView.setPosition(KIOSK_POS.x + 0.78, FLOOR_Y, KIOSK_POS.z + 0.15);
    this.vendorView.setFacing(-Math.PI / 2 - 0.35);
    this.group.add(this.vendorView.root);
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
    const glows: THREE.Sprite[] = [];
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
    deck.box((x0 + x1) / 2 + 0.2, FLOOR_Y - 0.01, zc, x1 - x0 - 0.4, 0.02, length, PALETTE.platformTile, 0, { pattern: PATTERN.diamond, color2: PALETTE.platformTile2, scale: 0.7, shade: 1 });
    deck.box(x0 + 0.2, FLOOR_Y - 0.008, zc, 0.4, 0.024, length, '#D3C9B8', 0, { shade: 1 });
    deck.box(x0 + 0.34, FLOOR_Y + 0.006, zc, 0.12, 0.004, length, PALETTE.platformEdge, 0, { shade: 1 });

    // Back railing: navy with brass caps, open where the way in from the station meets the platform.
    const gate = PLATFORM.entrance.z;
    const railRuns: [number, number][] = [[z0, gate - GATE_HALF], [gate + GATE_HALF, z1]];
    let posts = 0;
    for (const [ra, rb] of railRuns) {
      if (rb <= ra) continue;
      b.box(x1 - 0.05, FLOOR_Y + 0.55, (ra + rb) / 2, 0.05, 0.05, rb - ra, PALETTE.navy, 0, { shade: 1 });
      for (let z = ra; z <= rb; z += 1.2) {
        b.box(x1 - 0.05, FLOOR_Y + 0.28, z, 0.04, 0.56, 0.04, PALETTE.navy, 0, { shade: 0.85 });
        if (++posts % 40 === 0) yield;
      }
    }
    // Gate pillars either side of the way in, brass-capped.
    for (const dz of [-GATE_HALF, GATE_HALF]) {
      b.object('platform:gatePost');
      b.box(x1 - 0.05, FLOOR_Y + 0.5, gate + dz, 0.22, 1.0, 0.22, PALETTE.stationTrim, 0, { shade: 0.8 });
      b.sphere(x1 - 0.05, FLOOR_Y + 1.06, gate + dz, 0.09, PALETTE.brass, 1, 1, { shade: 1, surface: 'brass' });
    }
    b.endObject();

    // Session 23: the station house stands ahead of the train, behind the railing (it used to stand beside the
    // lobby, where the camera looks over it: its roof covered the platform on a phone). Cream walls, a terracotta
    // roof, lamplit windows and a clock gable over the doors travellers come out of.
    buildStationHouse(house, lamps, x1, gate);

    yield;

    // Session 23: no canopy (its roof hid half the platform from the camera). Victorian lamp posts along the back
    // railing light the deck instead, with flower tubs between them; benches further back for the crowd.
    const blockedZ = (z: number, margin: number): boolean =>
      Math.abs(z - gate) < GATE_HALF + margin
      || (z > PLATFORM.bench.z0 - margin && z < PLATFORM.bench.z1 + margin)
      || Math.abs(z - PLATFORM.kiosk.z) < 0.8 + margin;
    const lampX = x1 - 0.55;
    for (let z = z0 + 3; z < z1 - 2; z += LAMP_STEP) {
      if (blockedZ(z, 0.6)) continue;
      buildLampPost(props, lamps, lampX, z);
      anchors.push({ x: lampX - 0.7, y: FLOOR_Y + 2.1, z, strength: 1 });
      for (const dz of [-0.24, 0.24]) glows.push(lampGlow(lampX, FLOOR_Y + 2.42, z + dz));
      const tubZ = z + LAMP_STEP / 2;
      if (tubZ < z1 - 2 && !blockedZ(tubZ, 0.8)) {
        props.object('platform:tub');
        props.rounded(lampX + 0.05, FLOOR_Y + 0.2, tubZ, 0.62, 0.4, 0.62, 0.12, PALETTE.canopy, { shade: 0.75 });
        props.sphere(lampX - 0.07, FLOOR_Y + 0.5, tubZ - 0.1, 0.18, PALETTE.blossom, 1);
        props.sphere(lampX + 0.17, FLOOR_Y + 0.48, tubZ + 0.12, 0.16, PALETTE.linen, 1);
        props.sphere(lampX + 0.05, FLOOR_Y + 0.54, tubZ + 0.04, 0.13, PALETTE.hedge, 1);
      }
    }
    props.endObject();
    // The ticket stand's own lamp, and one over the luggage barrow, so both read at night.
    const standLamp = { x: PLATFORM.counter.x1 + 0.35, z: PLATFORM.counter.z0 - 0.35 };
    buildLampPost(props, lamps, standLamp.x, standLamp.z);
    anchors.push({ x: standLamp.x - 0.6, y: FLOOR_Y + 2.1, z: standLamp.z + 0.6, strength: 1 });
    for (const dz of [-0.24, 0.24]) glows.push(lampGlow(standLamp.x, FLOOR_Y + 2.42, standLamp.z + dz));
    const barrowLamp = { x: PLATFORM.barrow.x1 + 1.35, z: PLATFORM.barrow.z1 + 0.95 };
    buildLampPost(props, lamps, barrowLamp.x, barrowLamp.z);
    anchors.push({ x: barrowLamp.x - 0.8, y: FLOOR_Y + 2.1, z: barrowLamp.z - 0.8, strength: 1 });
    for (const dz of [-0.24, 0.24]) glows.push(lampGlow(barrowLamp.x, FLOOR_Y + 2.42, barrowLamp.z + dz));
    props.endObject();

    // Benches along the back railing behind the train (for show), and the one where travellers with no bed wait.
    buildBench(props, PLATFORM.bench);
    for (let z = Math.max(PLATFORM.barrow.z1 + 4, z0 + 6); z < z1 - 3; z += 11) {
      buildBench(props, { x0: x1 - 0.85, z0: z - 1.1, x1: x1 - 0.45, z1: z + 1.1 });
    }

    // Sign posts under the name board, either side of the way in.
    for (const dx of [-SIGN_POST_HALF, SIGN_POST_HALF]) props.object('platform:signPost').box(PLATFORM.sign.x + dx, FLOOR_Y + 1.15, PLATFORM.sign.z, 0.08, 2.3, 0.08, PALETTE.navy, 0, { shade: 0.9 });
    props.endObject();

    yield;

    // The ticket stand and the luggage barrow (session 23).
    buildTicketStand(props, lamps);
    buildBarrow(props);
    buildScale(props);

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
    for (const glow of this.glows) {
      this.group.remove(glow);
      glow.material.dispose();
    }
    this.glows.length = 0;
    if (this.vendor) this.group.remove(this.vendor);
    this.vendor = null;
    this.z0 = z0;
    this.z1 = z1;
    this.length = length;
    this.lampAnchors.length = 0;
    this.lampAnchors.push(...anchors);
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
    for (const glow of glows) {
      this.group.add(glow);
      this.glows.push(glow);
    }
    if (supplyCarIndex !== null) {
      this.vendor = buildVendor(carriageOriginZ(supplyCarIndex));
      this.vendor.userData.object = 'platform:vendor';
    }
    if (this.vendor) this.group.add(this.vendor);
    this.buildPosters();
    this.perchPigeons(x1);
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
    this.animatePigeons(dt);
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

  setNight(amount: number): void {
    for (const glow of this.glows) (glow.material as THREE.SpriteMaterial).opacity = 0.55 * amount;
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
  b.rounded(x, FLOOR_Y + 0.55, z, 1.1, 1.1, 0.9, 0.06, '#3F7A5E', { shade: 0.8 });
  b.box(x, FLOOR_Y + 1.12, z + 0.2, 1.14, 0.05, 0.6, PALETTE.oak, 0, { shade: 1 });
  for (let i = 0; i < 4; i++) b.box(x - 0.36 + i * 0.24, FLOOR_Y + 1.17, z + 0.2, 0.16, 0.03, 0.22, i % 2 ? '#F4EEE2' : '#E8DCC4', 0, { shade: 1 });
  for (const dx of [-0.5, 0.5]) b.cylinder(x + dx, FLOOR_Y + 1.5, z + 0.42, 0.025, 0.025, 0.8, PALETTE.navy, 6);
  b.box(x, FLOOR_Y + 1.92, z + 0.2, 1.3, 0.05, 0.9, '#3F7A5E', 0, { pattern: PATTERN.stripesX, color2: '#F4EEE2', scale: 0.22, shade: 1 });
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), headline);
  board.position.set(x, FLOOR_Y + 2.35, z + 0.45);
  board.rotation.x = -0.35;
  group.add(board);
  return group;
}

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
  for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) b.box(cx + dx, y + 0.38, cz, 0.05, 0.06, d, PALETTE.iron, 0, { shade: 0.85, surface: 'iron' });
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

/** A platform weighing machine beside the barrow: a brass plate, a column and a round dial facing the platform. */
function buildScale(b: GeoBuilder): void {
  const x = PLATFORM.barrow.x1 + 0.6;
  const z = PLATFORM.barrow.z1 + 0.55;
  const y = FLOOR_Y;
  b.object('platform:scale');
  b.box(x, y + 0.05, z, 0.46, 0.1, 0.46, '#4A4F5C', 0, { shade: 0.85, surface: 'iron' });
  b.box(x, y + 0.104, z, 0.38, 0.008, 0.38, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
  b.box(x + 0.19, y + 0.6, z - 0.12, 0.08, 1.0, 0.08, '#B23A3A', 0, { shade: 0.85 });
  b.cylinder(x + 0.19, y + 1.15, z - 0.12 + 0.04, 0.15, 0.15, 0.05, PALETTE.brass, 18, 'z', { shade: 1, surface: 'brass' });
  b.cylinder(x + 0.19, y + 1.15, z - 0.12 + 0.07, 0.125, 0.125, 0.012, PALETTE.porcelain, 18, 'z', { shade: 1 });
  b.box(x + 0.19, y + 1.18, z - 0.12 + 0.078, 0.012, 0.08, 0.004, PALETTE.ink, 0, { shade: 1 });
  b.endObject();
}

/**
 * The ticket stand (session 23): a low panelled counter with an oak top and a brass rail on the travellers'
 * side, a ticket rack, a cash tin, a brass bell and a green-shaded lamp, and a "Tickets" board on a post at its
 * front end. Low, so the traveller at the window is never hidden from the camera.
 */
function buildTicketStand(b: GeoBuilder, lamps: GeoBuilder): void {
  const r = PLATFORM.counter;
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
  b.box(cx + 0.02, top + 0.05, cz + 0.12, 0.2, 0.1, 0.26, '#3F7A5E', 0, { shade: 0.9 });
  b.box(cx + 0.02, top + 0.102, cz + 0.12, 0.17, 0.006, 0.22, PALETTE.brass, 0, { shade: 1, surface: 'brass' });
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
  for (let i = 0; i < 3; i++) b.box(r.x0 + 0.07 + i * 0.1, y + 0.42, cz, 0.08, 0.035, d - 0.08, PALETTE.oak, 0, { shade: 1 });
  for (let i = 0; i < 2; i++) b.box(r.x1 - 0.06, y + 0.6 + i * 0.13, cz, 0.035, 0.08, d - 0.08, PALETTE.oak, 0, { shade: 1 });
  for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) {
    b.box(cx, y + 0.2, r.z0 + d / 2 + dz, r.x1 - r.x0 - 0.04, 0.4, 0.05, PALETTE.navy, 0, { shade: 0.85, surface: 'iron' });
    b.box(r.x1 - 0.06, y + 0.62, r.z0 + d / 2 + dz, 0.05, 0.44, 0.05, PALETTE.navy, 0, { shade: 0.85, surface: 'iron' });
  }
  b.endObject();
}

/** A Victorian lamp post: a fluted base, a slim column and two lanterns on a crossbar along the platform. */
function buildLampPost(b: GeoBuilder, lamps: GeoBuilder, x: number, z: number): void {
  const y = FLOOR_Y;
  b.object('platform:lampPost');
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

/** A soft halo round a platform lamp at night. */
function lampGlow(x: number, y: number, z: number): THREE.Sprite {
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: PALETTE.lampGlow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.3, 1.3, 1);
  glow.position.set(x, y, z);
  return glow;
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
}
