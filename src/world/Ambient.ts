import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { CharacterView, type CharacterLook } from './CharacterView';
import { GeoBuilder } from './geo';
import { BOAT_LANE } from './Lakeside';
import { MATERIALS } from './materials';

/** People who come out to watch the train go by: farmers, children, a grandmother with a hat. */
const ONLOOKER_LOOKS: { look: CharacterLook; scale: number }[] = [
  { look: { body: '#6F8FB8', accent: '#E9D8A6', skin: '#F1C7A6', hair: '#6B4A32', pants: '#4E6A8E', hat: 'boater', hatColor: '#E8CF8E', bandColor: '#C0485C', arms: true }, scale: 1 },
  { look: { body: '#F2B233', accent: '#FFFFFF', skin: '#C98E66', hair: '#2E2420', pants: '#5A6FA8', hat: 'cap', arms: true }, scale: 0.72 },
  { look: { body: '#B8A3D1', accent: '#FFFFFF', skin: '#F1C7A6', hair: '#D9D4CC', pants: '#8E7AA8', hat: 'bun', arms: true }, scale: 0.95 },
  { look: { body: '#E07A7A', accent: '#FFFFFF', skin: '#8D5A3C', hair: '#1F1A18', pants: '#3E5C4A', hat: 'none', arms: true }, scale: 0.7 },
  { look: { body: '#7FB48A', accent: '#FFFFFF', skin: '#F1C7A6', hair: '#A0522D', pants: '#6B5A4A', hat: 'beanie', hatColor: '#C0485C', arms: true }, scale: 0.78 },
];
/** Onlookers stand on the grass just beyond the verge on the land side, close enough to wave at the windows. */
const ONLOOKER_X: [number, number] = [3.0, 3.4];
/**
 * Lantern boats and swans keep to the open-water lane (beyond every jetty and islet, short of the islands),
 * so nothing on the water ever passes through anything else.
 */
const BOAT_X: [number, number] = [BOAT_LANE[0] - 0.6, BOAT_LANE[1] + 0.6];
const BOAT_DRIFT = 0.25;
const SWAN_DRIFT = 0.12;

interface Onlooker {
  view: CharacterView;
  x: number;
  z: number;
  hop: number;
}

interface Boat {
  group: THREE.Group;
  z: number;
  bob: number;
  drift: number;
}

/**
 * Life around the line: people by the track who wave as the train goes past (and hop if they are small),
 * and little boats with lanterns drifting on the lake. Everything scrolls with the scenery (the train is
 * stationary) and hides where the platform is.
 */
export class Ambient {
  readonly group = new THREE.Group();
  private readonly rng = new Rng(4011);
  private readonly onlookers: Onlooker[] = [];
  private readonly boats: Boat[] = [];
  private readonly span = { zMin: -75, zMax: 60 };

  constructor() {
    ONLOOKER_LOOKS.forEach(({ look, scale }) => {
      const view = new CharacterView(look, scale);
      view.leans = false;
      this.group.add(view.root);
      this.onlookers.push({ view, x: 0, z: 0, hop: this.rng.range(0, 2) });
    });

    for (let i = 0; i < 2; i++) {
      const group = buildBoat();
      this.group.add(group);
      this.boats.push({ group, z: 0, bob: this.rng.range(0, 6), drift: BOAT_DRIFT });
    }
    // A pair of swans gliding along together.
    const swans = new THREE.Group();
    const one = buildSwan();
    const two = buildSwan();
    two.position.set(0.5, 0, 0.9);
    two.scale.setScalar(0.88);
    swans.add(one, two);
    this.group.add(swans);
    this.boats.push({ group: swans, z: 0, bob: this.rng.range(0, 6), drift: SWAN_DRIFT });
    this.setSpan(14);
  }

  setSpan(trainRearZ: number): void {
    this.span.zMax = trainRearZ + 45;
    const length = this.span.zMax - this.span.zMin;
    this.onlookers.forEach((o, i) => this.placeOnlooker(o, this.span.zMin + ((i + this.rng.range(0.2, 0.8)) / this.onlookers.length) * length));
    this.boats.forEach((b, i) => this.placeBoat(b, this.span.zMin + (i + 0.4) * (length / this.boats.length)));
  }

  update(dt: number, speed: number, focus: THREE.Vector3, _night: number, hidden: (x: number, z: number) => boolean): void {
    const dz = speed * dt;
    const length = this.span.zMax - this.span.zMin;
    const moving = speed > 0.5;

    for (const o of this.onlookers) {
      o.z += dz;
      if (o.z > this.span.zMax) this.placeOnlooker(o, o.z - length);
      const hide = hidden(o.x, o.z);
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

    for (const b of this.boats) {
      b.z += dz + b.drift * dt;
      if (b.z > this.span.zMax) this.placeBoat(b, b.z - length);
      b.bob += dt;
      b.group.position.set(b.group.position.x, Math.sin(b.bob * 1.3) * 0.03, b.z);
      b.group.rotation.z = Math.sin(b.bob * 1.1) * 0.05;
    }
  }

  private placeOnlooker(o: Onlooker, z: number): void {
    o.x = this.rng.range(ONLOOKER_X[0], ONLOOKER_X[1]);
    o.z = z;
    // Facing the train, turned a little toward the camera so the wave reads.
    o.view.setFacing(-Math.PI / 2 + 0.5);
    o.view.setPosition(o.x, 0, o.z);
  }

  private placeBoat(b: Boat, z: number): void {
    b.group.position.x = this.rng.range(BOAT_X[0], BOAT_X[1]);
    b.z = z;
    b.group.rotation.y = this.rng.range(-0.6, 0.6);
  }
}

/** A little rowing boat with a lantern on a pole. */
function buildBoat(): THREE.Group {
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.36, 0.3, 1.6, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1), '#8E5642', 0, 0.2, 0, 0, 0, 0, { shade: 0.8, surface: 'wood' });
  b.box(0, 0.18, 0, 0.6, 0.04, 0.16, '#6E5240', 0, { shade: 1 });
  b.cylinder(0, 0.55, 0.62, 0.02, 0.02, 0.8, '#3A3440', 6);
  const glow = new GeoBuilder().box(0, 0.98, 0.62, 0.12, 0.16, 0.12, '#FFD08A', 0, { shade: 1 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), MATERIALS.scenery), new THREE.Mesh(glow.build(), MATERIALS.lamps));
  return group;
}

/** A swan: a soft white body, the neck in an S, an orange beak. */
function buildSwan(): THREE.Group {
  const b = new GeoBuilder();
  const body = new THREE.SphereGeometry(0.22, 12, 8).scale(1, 0.62, 1.55);
  body.computeVertexNormals();
  b.add(body, '#F2F0EA', 0, 0.08, 0, 0, 0, 0, { shade: 0.8, surface: 'fabric' });
  b.add(new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI * 1.1).rotateY(Math.PI / 2), '#F2F0EA', 0, 0.24, -0.26, 0, 0, 0, { shade: 0.9 });
  b.add(new THREE.SphereGeometry(0.05, 8, 6), '#F2F0EA', 0, 0.36, -0.38, 0, 0, 0, { shade: 1 });
  b.add(new THREE.ConeGeometry(0.022, 0.08, 6).rotateX(-Math.PI / 2), '#E07A3A', 0, 0.35, -0.45, 0, 0, 0, { shade: 1 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), MATERIALS.scenery));
  return group;
}
