import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { CharacterView, type CharacterLook } from './CharacterView';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { PALETTE } from './palette';

/** People who come out to watch the train go by: farmers, children, a grandmother with a hat. */
const ONLOOKER_LOOKS: { look: CharacterLook; scale: number }[] = [
  { look: { body: '#6F8FB8', accent: '#E9D8A6', skin: '#F1C7A6', hair: '#6B4A32', pants: '#4E6A8E', hat: 'boater', hatColor: '#E8CF8E', bandColor: '#C0485C', arms: true }, scale: 1 },
  { look: { body: '#F2B233', accent: '#FFFFFF', skin: '#C98E66', hair: '#2E2420', pants: '#5A6FA8', hat: 'cap', arms: true }, scale: 0.72 },
  { look: { body: '#B8A3D1', accent: '#FFFFFF', skin: '#F1C7A6', hair: '#D9D4CC', pants: '#8E7AA8', hat: 'bun', arms: true }, scale: 0.95 },
  { look: { body: '#E07A7A', accent: '#FFFFFF', skin: '#8D5A3C', hair: '#1F1A18', pants: '#3E5C4A', hat: 'none', arms: true }, scale: 0.7 },
  { look: { body: '#7FB48A', accent: '#FFFFFF', skin: '#F1C7A6', hair: '#A0522D', pants: '#6B5A4A', hat: 'beanie', hatColor: '#C0485C', arms: true }, scale: 0.78 },
];
/** Onlookers stand just beyond the ballast, close enough to wave at the windows. */
const ONLOOKER_X: [number, number] = [2.75, 3.15];
/** Birds cross the view now and then (never at night). */
const FLOCK_SIZE = 7;
const FLOCK_GAP: [number, number] = [14, 26];
const FLOCK_SPEED = 3.2;
const BIRD_Y = 4.2;
/** Windmills stand where the top corners of the view catch them. */
const WINDMILL_X: [number, number] = [4.5, 5.0];
const WINDMILL_SAIL_SPEED = 0.9;

interface Onlooker {
  view: CharacterView;
  x: number;
  z: number;
  hop: number;
}

interface Windmill {
  group: THREE.Group;
  sails: THREE.Object3D;
  z: number;
}

/**
 * Life around the line: people by the track who wave as the train goes past (and hop if they are small),
 * a flock of birds crossing overhead, and windmills turning in the fields.
 * Everything scrolls with the countryside (the train is stationary) and hides where the platform is.
 */
export class Ambient {
  readonly group = new THREE.Group();
  private readonly rng = new Rng(4011);
  private readonly onlookers: Onlooker[] = [];
  private readonly birds: THREE.InstancedMesh;
  private readonly flock: { x: number; z: number; dx: number; dz: number }[] = [];
  private flockActive = false;
  private flockTimer = 6;
  private flockTime = 0;
  private readonly windmills: Windmill[] = [];
  private readonly span = { zMin: -75, zMax: 60 };
  private readonly dummy = new THREE.Object3D();

  constructor() {
    ONLOOKER_LOOKS.forEach(({ look, scale }) => {
      const view = new CharacterView(look, scale);
      view.leans = false;
      this.group.add(view.root);
      this.onlookers.push({ view, x: 0, z: 0, hop: this.rng.range(0, 2) });
    });

    const bird = new GeoBuilder();
    // A swept-back chevron (how a bird reads from above); the wingspan narrows and widens as it flaps.
    for (const side of [-1, 1]) bird.box(side * 0.17, 0, -0.04, 0.34, 0.02, 0.08, '#4A4E69', side * 0.5, { shade: 1 });
    bird.box(0, 0, 0.0, 0.06, 0.05, 0.16, '#4A4E69', 0, { shade: 1 });
    this.birds = new THREE.InstancedMesh(bird.build(), MATERIALS.scenery, FLOCK_SIZE);
    this.birds.frustumCulled = false;
    this.birds.visible = false;
    this.group.add(this.birds);
    for (let i = 0; i < FLOCK_SIZE; i++) this.flock.push({ x: 0, z: 0, dx: 0, dz: 0 });

    for (let i = 0; i < 2; i++) {
      const { group, sails } = buildWindmill();
      this.group.add(group);
      this.windmills.push({ group, sails, z: 0 });
    }
    this.setSpan(14);
  }

  setSpan(trainRearZ: number): void {
    this.span.zMax = trainRearZ + 45;
    const length = this.span.zMax - this.span.zMin;
    this.onlookers.forEach((o, i) => this.placeOnlooker(o, this.span.zMin + ((i + this.rng.range(0.2, 0.8)) / this.onlookers.length) * length));
    this.windmills.forEach((m, i) => this.placeWindmill(m, this.span.zMin + (i + 0.4) * (length / this.windmills.length)));
  }

  update(dt: number, speed: number, focus: THREE.Vector3, night: number, hidden: (x: number, z: number) => boolean): void {
    const dz = speed * dt;
    const length = this.span.zMax - this.span.zMin;
    const moving = speed > 0.5;

    for (const o of this.onlookers) {
      o.z += dz;
      if (o.z > this.span.zMax) this.placeOnlooker(o, o.z - length);
      const hide = hidden(o.x, o.z) || night > 0.85;
      o.view.root.visible = !hide;
      if (hide) continue;
      // Wave while the train rolls by (the small ones hop too); stand and watch at a stop.
      o.view.waving = moving || Math.abs(o.z - focus.z) < 8;
      o.hop -= dt;
      if (o.hop <= 0) {
        o.hop = this.rng.range(0.7, 1.6);
        if (o.view.root.scale.x < 0.9 && o.view.waving) o.view.bounce(0.8);
      }
      o.view.setPosition(o.x, 0, o.z);
      o.view.update(dt, 0);
    }

    for (const m of this.windmills) {
      m.z += dz;
      if (m.z > this.span.zMax) this.placeWindmill(m, m.z - length);
      m.group.position.z = m.z;
      m.group.visible = !hidden(m.group.position.x, m.z);
      m.sails.rotation.z += dt * WINDMILL_SAIL_SPEED;
    }

    this.updateFlock(dt, focus, night);
  }

  private updateFlock(dt: number, focus: THREE.Vector3, night: number): void {
    this.flockTime += dt;
    if (!this.flockActive) {
      this.flockTimer -= dt;
      if (this.flockTimer > 0 || night > 0.5) return;
      // A loose V from one side of the view to the other, drifting slightly up the screen.
      this.flockActive = true;
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const x0 = focus.x - dir * 9;
      const z0 = focus.z + this.rng.range(-4, 1);
      this.flock.forEach((b, i) => {
        const rank = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
        b.x = x0 - dir * Math.abs(rank) * 0.55;
        b.z = z0 + rank * 0.5;
        b.dx = dir * FLOCK_SPEED * this.rng.range(0.95, 1.05);
        b.dz = -0.6;
      });
      this.birds.visible = true;
    }
    let anyOnScreen = false;
    this.flock.forEach((b, i) => {
      b.x += b.dx * dt;
      b.z += b.dz * dt;
      if (Math.abs(b.x - focus.x) < 12) anyOnScreen = true;
      const flap = 0.7 + Math.abs(Math.sin(this.flockTime * 7 + i)) * 0.35;
      this.dummy.position.set(b.x, BIRD_Y + Math.sin(this.flockTime * 2 + i) * 0.1, b.z);
      this.dummy.rotation.set(0, b.dx > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      this.dummy.scale.set(flap, 1, 1);
      this.dummy.updateMatrix();
      this.birds.setMatrixAt(i, this.dummy.matrix);
    });
    this.birds.instanceMatrix.needsUpdate = true;
    if (!anyOnScreen) {
      this.flockActive = false;
      this.birds.visible = false;
      this.flockTimer = this.rng.range(FLOCK_GAP[0], FLOCK_GAP[1]);
    }
  }

  private placeOnlooker(o: Onlooker, z: number): void {
    const side = this.rng.chance(0.55) ? -1 : 1;
    o.x = side * this.rng.range(ONLOOKER_X[0], ONLOOKER_X[1]);
    o.z = z;
    // Facing the train, turned a little toward the camera so the wave reads.
    o.view.setFacing(side < 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5);
    o.view.setPosition(o.x, 0, o.z);
  }

  private placeWindmill(m: Windmill, z: number): void {
    const side = this.rng.chance(0.5) ? -1 : 1;
    m.group.position.x = side * this.rng.range(WINDMILL_X[0], WINDMILL_X[1]);
    m.z = z;
    m.group.position.z = z;
  }
}

function buildWindmill(): { group: THREE.Group; sails: THREE.Object3D } {
  const b = new GeoBuilder();
  b.cylinder(0, 1.6, 0, 0.55, 0.85, 3.2, PALETTE.linen, 12, 'y', { shade: 0.85 });
  b.cone(0, 3.55, 0, 0.72, 0.9, PALETTE.roofTerracotta, 12);
  b.box(0, 0.45, 0.8, 0.4, 0.7, 0.06, PALETTE.walnut, 0, { shade: 1 });
  b.box(0, 2.2, 0.76, 0.3, 0.3, 0.06, PALETTE.windowDay, 0, { shade: 1 });
  const group = new THREE.Group();
  const tower = new THREE.Mesh(b.build(), MATERIALS.scenery);
  group.add(tower);
  const s = new GeoBuilder();
  s.cylinder(0, 0, 0, 0.1, 0.1, 0.2, PALETTE.walnut, 8, 'z');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const cx = Math.cos(a) * 0.95;
    const cy = Math.sin(a) * 0.95;
    s.add(new THREE.BoxGeometry(1.7, 0.34, 0.04), PALETTE.stationTrim, cx, cy, 0.05, 0, 0, a, { shade: 1 });
  }
  const sails = new THREE.Mesh(s.build(), MATERIALS.scenery);
  sails.position.set(0, 3.1, 0.95);
  group.add(sails);
  group.scale.setScalar(0.9);
  return { group, sails };
}
