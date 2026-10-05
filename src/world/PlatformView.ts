import * as THREE from 'three';
import { FLOOR_Y } from './CarriageView';
import { GeoBuilder, mergePlanes } from './geo';
import { carriageOriginZ, DOOR_Z0, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0 } from './layout';
import { MATERIALS, PATTERN } from './materials';
import { PALETTE } from './palette';
import { CharacterView, type CharacterLook } from './CharacterView';
import { headlineTexture, posterTexture, signTexture } from './sprites';
import type { LampAnchor } from './Lighting';

/** Marketing bought at the station workshop that shows on every platform. */
export interface MarketingState {
  posters: boolean;
  band: boolean;
}

const POSTER_W = 1.0;
const POSTER_H = 1.25;
/** Posters stand where the camera sees them, past each carriage's own platform business (door, pile, vendor). */
const POSTER_X = PLATFORM_X0 + 3.15;
const POSTER_Z_IN_CARRIAGE = 11.5;
const POSTER_AHEAD_Z = -6;
const BAND_LOOK: CharacterLook = { body: '#C0485C', accent: '#E2B04A', skin: '#F1C7A6', hair: '#4A3428', pants: '#F4EEE2', hat: 'pillbox', hatColor: '#C0485C', bandColor: '#E2B04A', arms: true };
const BAND_SKIN = ['#F1C7A6', '#C98E66', '#8D5A3C'];
/** Where the band stands (between the waiting guests and the workshop pads) and what each one plays. */
const BAND: { x: number; z: number; instrument: 'tuba' | 'drum' | 'trumpet' }[] = [
  { x: PLATFORM_X0 + 2.3, z: 4.95, instrument: 'trumpet' },
  { x: PLATFORM_X0 + 3.3, z: 4.2, instrument: 'tuba' },
  { x: PLATFORM_X0 + 4.3, z: 4.95, instrument: 'drum' },
];
const BEAT_SECONDS = 0.5;
/** The station master stands by the front of the train and waves the green flag at departure. */
const MASTER_POS = { x: PLATFORM_X0 + 0.95, z: -1.0 };
const MASTER_LOOK: CharacterLook = { body: '#2F3E5C', accent: '#E2B04A', skin: '#E8B894', hair: '#8A8A8A', pants: '#2A3248', hat: 'conductor', hatColor: '#2F3E5C', bandColor: '#C0485C', arms: true, moustache: true };
/**
 * Pigeons perched on the canopy roof (session 18: a lived-in station): they shuffle and peck, and take off
 * when the train leaves. Where along the platform they sit (z), and how many.
 */
const PIGEON_SPOTS = [1.6, 2.3, 3.4, 13.2, 14.1, 15.5];
const PIGEON_FLY_SECONDS = 3.2;

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

/** The newsstand ahead of the lobby: today's Rail Gazette headline on a board. */
const KIOSK_POS = { x: PLATFORM_X0 + 2.0, z: -4.2 };

/**
 * The station platform on the right of the train: a tiled deck, a pink station house with a clock, a mint
 * canopy with a scalloped valance, lamps, planters and benches. Built in local coordinates that equal world
 * coordinates when the train is stopped (z offset 0); the game slides it along z as the train arrives and
 * departs.
 */
export class PlatformView {
  readonly group = new THREE.Group();
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  private readonly glows: THREE.Sprite[] = [];
  private staticMesh: THREE.Mesh | null = null;
  private houseMesh: THREE.Mesh | null = null;
  private canopyMesh: THREE.Mesh | null = null;
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
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), this.signMaterial);
    sign.position.set(PLATFORM_X0 + 4.2, FLOOR_Y + 2.1, -1.2);
    sign.rotation.x = -0.9;
    sign.name = 'sign';
    this.group.add(sign);

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
  *buildSteps(trainRearZ: number, supplyCarIndex: number | null, luggageCarIndex: number | null): Generator<void, void> {
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
    const canopy = new GeoBuilder();
    const house = new GeoBuilder();
    const props = new GeoBuilder();
    const deck = new GeoBuilder();
    const lamps = new GeoBuilder();

    // Deck: stone base, a tiled top, the yellow safety line and a coping stone along the edge.
    b.box((x0 + x1) / 2, FLOOR_Y / 2 - 0.02, zc, x1 - x0, FLOOR_Y - 0.04, length, '#D9CCB4', 0, { shade: 0.75 });
    deck.box((x0 + x1) / 2 + 0.2, FLOOR_Y - 0.01, zc, x1 - x0 - 0.4, 0.02, length, PALETTE.platformTile, 0, { pattern: PATTERN.diamond, color2: PALETTE.platformTile2, scale: 0.7, shade: 1 });
    deck.box(x0 + 0.2, FLOOR_Y - 0.008, zc, 0.4, 0.024, length, '#D3C9B8', 0, { shade: 1 });
    deck.box(x0 + 0.34, FLOOR_Y + 0.006, zc, 0.12, 0.004, length, PALETTE.platformEdge, 0, { shade: 1 });

    // Back railing: navy with brass caps.
    b.box(x1 - 0.05, FLOOR_Y + 0.55, zc, 0.05, 0.05, length, PALETTE.navy, 0, { shade: 1 });
    let posts = 0;
    for (let z = z0; z <= z1; z += 1.2) {
      b.box(x1 - 0.05, FLOOR_Y + 0.28, z, 0.04, 0.56, 0.04, PALETTE.navy, 0, { shade: 0.85 });
      if (++posts % 40 === 0) yield;
    }

    // Station house behind the railing, near the lobby door: pink with cream trim, terracotta roof.
    const bz0 = -9;
    const bz1 = 9;
    const bx = x1 + 3.2;
    house.box(bx, 1.8, (bz0 + bz1) / 2, 5.6, 3.6, bz1 - bz0, PALETTE.stationPink, 0, { shade: 0.8 });
    house.box(bx, 0.35, (bz0 + bz1) / 2, 5.7, 0.7, bz1 - bz0 + 0.1, '#D98E8C', 0, { shade: 0.85 });
    house.box(bx, 3.65, (bz0 + bz1) / 2, 6.0, 0.2, bz1 - bz0 + 0.4, PALETTE.stationTrim, 0, { shade: 1 });
    house.prism(bx, 3.75, (bz0 + bz1) / 2, 6.4, 2.0, bz1 - bz0 + 0.8, PALETTE.roofTerracotta, { pattern: PATTERN.stripesZ, color2: '#B85A4D', scale: 0.25, shade: 1 });
    house.box(bx, 5.3, bz0 + 3, 0.8, 1.2, 0.8, PALETTE.stationTrim, 0, { shade: 0.85 });
    // Facade toward the train: tall cream-framed windows and doors, and the big clock.
    const face = x1 + 0.39;
    for (let z = bz0 + 1.2; z < bz1 - 0.8; z += 2.2) {
      const door = Math.abs(z) < 1.2;
      house.box(face - 0.02, door ? 1.4 : 1.8, z, 0.06, door ? 2.2 : 1.4, 1.1, PALETTE.stationTrim, 0, { shade: 1 });
      house.box(face - 0.05, door ? 1.35 : 1.8, z, 0.03, door ? 2.0 : 1.2, 0.9, door ? PALETTE.canopyDark : PALETTE.windowDay, 0, { shade: 1 });
    }
    house.cylinder(face - 0.05, 3.1, 0, 0.55, 0.55, 0.08, PALETTE.gold, 24, 'x', { shade: 1 });
    house.cylinder(face - 0.1, 3.1, 0, 0.48, 0.48, 0.04, PALETTE.linen, 24, 'x', { shade: 1 });
    house.box(face - 0.13, 3.25, 0, 0.02, 0.3, 0.035, PALETTE.ink, 0, { shade: 1 });
    house.box(face - 0.13, 3.1, 0.1, 0.02, 0.035, 0.22, PALETTE.ink, 0, { shade: 1 });

    yield;

    // Canopy over the back half of the platform, clear of the walking area, with a scalloped valance.
    const canopyX = x1 - 1.0;
    canopy.box(canopyX + 0.4, FLOOR_Y + 3.02, zc, 2.4, 0.1, length - 2, PALETTE.canopy, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.stationTrim, scale: 0.5, shade: 1 });
    let scallops = 0;
    for (let z = z0 + 1.2; z < z1 - 1; z += 0.5) {
      canopy.cylinder(canopyX - 0.8, FLOOR_Y + 2.93, z, 0.24, 0.24, 0.04, PALETTE.canopyDark, 10, 'x', { shade: 1 });
      if (++scallops % 40 === 0) yield;
    }
    for (let z = z0 + 3; z < z1 - 2; z += 6) {
      b.object('platform:canopyPost');
      b.cylinder(x1 - 0.5, FLOOR_Y + 1.5, z, 0.07, 0.09, 3.0, PALETTE.navy, 10, 'y', { shade: 0.85 });
      b.box(x1 - 0.5, FLOOR_Y + 2.95, z, 0.2, 0.1, 0.2, PALETTE.gold, 0, { shade: 1 });
      b.object('platform:canopyLamp');
      lamps.sphere(x1 - 0.9, FLOOR_Y + 2.55, z, 0.16, PALETTE.lampShade, 1);
      anchors.push({ x: x1 - 1.1, y: FLOOR_Y + 2.3, z, strength: 1 });
      b.box(x1 - 0.72, FLOOR_Y + 2.72, z, 0.36, 0.03, 0.03, PALETTE.navy, 0, { shade: 1 });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: PALETTE.lampGlow, transparent: true, opacity: 0, depthWrite: false }));
      glow.scale.set(1.8, 1.8, 1);
      glow.position.set(x1 - 0.9, FLOOR_Y + 2.55, z);
      glows.push(glow);
      b.endObject();
    }

    yield;

    // Benches and flower planters.
    for (let z = z0 + 6; z < z1 - 3; z += 11) {
      props.object('platform:bench');
      props.box(x1 - 1.1, FLOOR_Y + 0.36, z, 0.5, 0.07, 1.6, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.walnut, scale: 0.1, shade: 1 });
      props.box(x1 - 0.88, FLOOR_Y + 0.6, z, 0.06, 0.4, 1.6, PALETTE.oak, 0, { pattern: PATTERN.stripesZ, color2: PALETTE.walnut, scale: 0.1, shade: 1 });
      for (const dz of [-0.7, 0.7]) props.box(x1 - 1.1, FLOOR_Y + 0.17, z + dz, 0.42, 0.34, 0.06, PALETTE.navy, 0, { shade: 0.85 });
      props.object('platform:planter');
      props.box(x1 - 1.0, FLOOR_Y + 0.25, z + 2.4, 0.6, 0.5, 0.6, PALETTE.stationTrim, 0, { shade: 0.8 });
      props.sphere(x1 - 1.08, FLOOR_Y + 0.62, z + 2.3, 0.2, PALETTE.blossom, 1);
      props.sphere(x1 - 0.92, FLOOR_Y + 0.6, z + 2.52, 0.18, PALETTE.mustard, 1);
      props.sphere(x1 - 1.0, FLOOR_Y + 0.66, z + 2.46, 0.15, PALETTE.hedge, 1);
      props.endObject();
    }

    // A row of lamp posts with flower tubs between them, behind where guests wait.
    const rowX = x1 - 2.05;
    // The row makes way for the stores vendor's stall.
    const vendorZ = supplyCarIndex !== null ? PlatformView.vendorPosition(supplyCarIndex).z : null;
    const clear = (z: number): boolean => vendorZ === null || Math.abs(z - vendorZ) > 1.7;
    deck.box(rowX, FLOOR_Y + 0.003, zc, 1.1, 0.01, length - 1, '#C99B92', 0, { pattern: PATTERN.stripesZ, color2: '#B9827C', scale: 0.45, shade: 1 });
    for (let z = z0 + 5; z < z1 - 3; z += 8) {
      if (clear(z)) {
        props.object('platform:lampPost');
        props.cylinder(rowX, FLOOR_Y + 0.08, z, 0.14, 0.18, 0.16, PALETTE.navy, 12, 'y', { shade: 0.8 });
        props.cylinder(rowX, FLOOR_Y + 1.2, z, 0.04, 0.06, 2.2, PALETTE.navy, 10, 'y', { shade: 0.85 });
        props.box(rowX, FLOOR_Y + 2.2, z, 0.5, 0.04, 0.04, PALETTE.navy, 0, { shade: 1 });
        for (const dz of [-0.25, 0.25]) lamps.sphere(rowX, FLOOR_Y + 2.12, z + dz, 0.11, PALETTE.lampShade, 1);
        anchors.push({ x: rowX - 0.6, y: FLOOR_Y + 2.0, z, strength: 1 });
      }
      const tubZ = z + 4;
      if (!clear(tubZ)) continue;
      props.object('platform:tub');
      props.rounded(rowX, FLOOR_Y + 0.2, tubZ, 0.7, 0.4, 0.7, 0.12, PALETTE.canopy, { shade: 0.75 });
      props.sphere(rowX - 0.12, FLOOR_Y + 0.52, tubZ - 0.1, 0.2, PALETTE.blossom, 1);
      props.sphere(rowX + 0.14, FLOOR_Y + 0.5, tubZ + 0.12, 0.18, PALETTE.linen, 1);
      props.sphere(rowX, FLOOR_Y + 0.56, tubZ + 0.05, 0.14, PALETTE.hedge, 1);
    }
    props.endObject();

    // Sign posts under the name board.
    for (const dz of [-1.5, 1.5]) props.object('platform:signPost').box(x0 + 4.2 + dz * 0.7, FLOOR_Y + 1.0, -1.2, 0.07, 2.0, 0.07, PALETTE.navy, 0, { shade: 0.9 });
    props.endObject();

    // Luggage trolley near where suitcases wait.
    const luggageZ = luggageCarIndex !== null ? carriageOriginZ(luggageCarIndex) + DOOR_Z0 + 3.2 : DOOR_Z0 + 3.2;
    props.object('platform:trolley');
    props.box(x0 + 1.6, FLOOR_Y + 0.2, luggageZ, 1.3, 0.06, 1.8, PALETTE.oak, 0, { pattern: PATTERN.stripesX, color2: PALETTE.walnut, scale: 0.12, shade: 1 });
    props.box(x0 + 1.6, FLOOR_Y + 0.5, luggageZ - 0.88, 1.26, 0.6, 0.05, PALETTE.navy, 0, { shade: 0.9 });
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.7, 0.7]) props.cylinder(x0 + 1.6 + dx, FLOOR_Y + 0.1, luggageZ + dz, 0.1, 0.1, 0.06, PALETTE.ink, 10, 'x');
    props.endObject();

    yield;
    const staticGeo = b.build();
    yield;
    const canopyGeo = canopy.build();
    yield;
    const houseGeo = house.build();
    yield;
    const propsGeo = props.build();
    yield;
    const deckGeo = deck.build();
    const lampGeo = lamps.build();
    yield;

    // Swap the new platform in whole.
    for (const mesh of [this.staticMesh, this.canopyMesh, this.houseMesh, this.propsMesh, this.deckMesh, this.lampMesh]) {
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
    this.canopyMesh = solid(canopyGeo, true);
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

  /** Every pigeon back on the canopy roof (a new station's platform). */
  private pigeonX1 = PLATFORM_X0 + PLATFORM_WIDTH;

  private perchPigeons(x1: number): void {
    this.pigeonX1 = x1;
    if (!this.pigeons.parent) {
      this.pigeons.frustumCulled = false;
      this.pigeons.castShadow = true;
      this.group.add(this.pigeons);
    }
    this.perches.forEach((p, i) => {
      // On the canopy's top, nearer its outer (camera) edge so they read against the roof.
      p.x = x1 - 1.45 + ((i * 0.37) % 1.3);
      p.y = FLOOR_Y + 3.07;
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

  /** Where the suitcases for boarding guests are piled (local = world when stopped). */
  static luggagePilePosition(luggageCarIndex: number | null): { x: number; z: number } {
    const z = luggageCarIndex !== null ? carriageOriginZ(luggageCarIndex) + DOOR_Z0 + 3.0 : DOOR_Z0 + 3.2;
    return { x: PLATFORM_X0 + 1.6, z };
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
