import * as THREE from 'three';
import type { LineTransitionDef, TunnelStyle } from '../config/lineTransition';
import { GeoBuilder } from './geo';
import { MATERIALS } from './materials';
import { modelEntry, type ModelId, type Recolor } from './models/library';
import { CharacterView, type CharacterLook } from './CharacterView';
import { signTexture } from './sprites';

/**
 * The Grand Departure's set pieces (CLAUDE.md §8c). Stage B: each is a Blender piece from art/blender/transition_kit.py
 * (dressed-stone portals in a hillside, a brick engine shed with plank doors, a cast-iron lever frame, a hooded colour-
 * light signal, a panelled coach under a roped tarp, a bamboo arch under thatch, palms, steel pans, a brass plate,
 * gulls), drawn with the game's own lit scenery material so it sits in the world's light like everything else, and
 * recoloured per route where the template says (the portal's stone, the hill, the new livery, the tarp). The welcome
 * crowd and the steel band are the game's own people, garlanded.
 *
 * Each builder returns a group in world (train) coordinates: x across the train (+x the platform side), z along it (the
 * locomotive toward -z), y up. Everything is made when its beat starts and freed when the sequence ends (`disposeSet`),
 * so none of it costs anything in ordinary play.
 */

const STONE: Record<TunnelStyle, { stone: string; dressed: string; hill: string; rock: string; dark: string }> = {
  stone: { stone: '#8E8678', dressed: '#B8AE9C', hill: '#557A44', rock: '#7D7468', dark: '#0B0A0C' },
  cliff: { stone: '#D4B184', dressed: '#EBD5AA', hill: '#9DAE62', rock: '#C99E6A', dark: '#0D0906' },
  snow: { stone: '#97A3B2', dressed: '#D9E1EA', hill: '#EEF3F8', rock: '#8C98A8', dark: '#07090C' },
};

/** The kit's pure-hue keys (scripts/assets/bake_models.py `GD`), each recoloured per use. */
const BAND = { sat: [0.6, 1] as [number, number], val: [0.2, 1] as [number, number] };
const KEY_A = (to: string): Recolor => ({ hue: [345, 15], ...BAND, ref: '#FF2A2A', to });
const KEY_B = (to: string): Recolor => ({ hue: [105, 135], ...BAND, ref: '#2AFF2A', to });
const KEY_C = (to: string): Recolor => ({ hue: [225, 255], ...BAND, ref: '#2A2AFF', to });

/** The shared materials a set piece draws with: never freed with it. */
const SHARED = new Set<THREE.Material>(Object.values(MATERIALS));

/**
 * Adds a kit model so that its own origin lands at (x, y, z), turned `rotY` about the vertical and scaled `s`
 * (`GeoBuilder.model` centres a model on its footprint; this puts the model's own origin back where it was built).
 */
function modelAt(b: GeoBuilder, id: ModelId, x: number, y: number, z: number, rotY = 0, s = 1, recolor?: Recolor[]): void {
  const e = modelEntry(id);
  const cx = ((e.min[0] + e.max[0]) / 2) * s;
  const cz = ((e.min[2] + e.max[2]) / 2) * s;
  const c = Math.cos(rotY);
  const n = Math.sin(rotY);
  b.model(id, x + cx * c + cz * n, y + e.min[1] * s, z - cx * n + cz * c, rotY, s, s, s, { recolor, shade: 1 });
}

/** One model as a mesh of its own (in the scenery material). */
function modelMesh(id: ModelId, x = 0, y = 0, z = 0, rotY = 0, s = 1, recolor?: Recolor[]): THREE.Mesh {
  const b = new GeoBuilder();
  modelAt(b, id, x, y, z, rotY, s, recolor);
  return sceneryMesh(b);
}

function sceneryMesh(b: GeoBuilder): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), MATERIALS.scenery);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

const basic = (color: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });

/** A painted board facing +x (its words drawn on a canvas), for the portal's sign, the shed's name and the arch. */
function board(text: string, width: number, height: number, bg: string, fg: string): THREE.Mesh {
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, 512, Math.round((512 * height) / width)) }));
  face.rotation.y = Math.PI / 2;
  return face;
}

/** A colour-light signal: the hooded head on its post (`gd_signal`), its two lamps lit by `setSignal`. */
function signal(): THREE.Group {
  const g = new THREE.Group();
  g.add(modelMesh('gd_signal'));
  // The lenses in the hoods (the model's lamp discs sit at x 0.105, heights 3.30 and 3.65).
  const lens = (y: number, name: string, color: string): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), basic(color));
    m.rotation.y = Math.PI / 2;
    m.position.set(0.125, y, 0);
    m.name = name;
    return m;
  };
  g.add(lens(3.65, 'red', '#FF3B2F'), lens(3.3, 'green', '#1E3B22'));
  return g;
}

/** Turns a signal green (or back to red). */
export function setSignal(signalGroup: THREE.Object3D, clear: boolean): void {
  const red = signalGroup.getObjectByName('red') as THREE.Mesh | undefined;
  const green = signalGroup.getObjectByName('green') as THREE.Mesh | undefined;
  if (red) (red.material as THREE.MeshBasicMaterial).color.set(clear ? '#3A1512' : '#FF3B2F');
  if (green) (green.material as THREE.MeshBasicMaterial).color.set(clear ? '#5CFF7A' : '#1E3B22');
}

/** A tunnel portal in its hillside, the mouth facing +z (the way the track comes in), centred on x = 0. */
export function buildPortal(style: TunnelStyle, sign?: string): THREE.Group {
  const c = STONE[style];
  const g = new THREE.Group();
  const b = new GeoBuilder();
  modelAt(b, 'gd_hill', 0, 0, 0, 0, 1, [KEY_B(c.hill), KEY_A(c.rock)]);
  modelAt(b, 'gd_portal', 0, 0, 0, 0, 1, [KEY_A(c.stone), KEY_C(c.dressed)]);
  g.add(sceneryMesh(b));
  // Beyond the sooty lining, the dark goes on (so the train vanishes into it).
  const dark = basic(c.dark);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.2), dark);
  back.position.set(0, 3.1, -4.3);
  const throat = new THREE.Mesh(new THREE.BoxGeometry(5.4, 6.2, 30), new THREE.MeshBasicMaterial({ color: c.dark, side: THREE.BackSide }));
  throat.position.set(0, 3.1, -19.3);
  g.add(back, throat);
  if (sign) {
    // On the parapet, facing the track.
    const s = board(sign, 5.6, 0.62, '#1F3B2C', '#F6E7B8');
    s.rotation.y = 0;
    s.position.set(0, 7.33, 0.12);
    g.add(s);
  }
  return g;
}

/** Rails and sleepers along a polyline of (x, z) points (a short branch line), in the main line's own build. */
export function buildRails(points: [number, number][]): THREE.Group {
  const g = new THREE.Group();
  const b = new GeoBuilder();
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (lx: number, lz: number): [number, number] => [x0 + lx * c + lz * s, z0 - lx * s + lz * c];
    // Ballast under it, sleepers across it, a rail with its foot either side.
    const [bx, bz] = at(0, len / 2);
    b.box(bx, 0.04, bz, 3.4, 0.1, len + 0.3, '#6E665C', yaw);
    for (let d = 0.35; d < len; d += 0.65) {
      const [sx, sz] = at(0, d);
      b.box(sx, 0.11, sz, 2.6, 0.1, 0.24, '#5E4632', yaw);
    }
    for (const side of [-0.72, 0.72]) {
      const [rx, rz] = at(side, len / 2);
      b.box(rx, 0.17, rz, 0.13, 0.03, len, '#4A4D52', yaw);
      b.box(rx, 0.24, rz, 0.07, 0.11, len, '#9AA0A6', yaw);
    }
  }
  g.add(sceneryMesh(b));
  return g;
}

/** Where the branch to the tunnel runs: x at z, from the points (z = `pointsZ`) curving off to the lake side. */
export function branchX(z: number, pointsZ: number, shift: number, length: number): number {
  const u = Math.min(1, Math.max(0, (pointsZ - z) / length));
  return shift * u * u * (3 - 2 * u);
}

/** The lever frame (`gd_lever_frame`) and its handle on a pivot (`lever` child, 0 upright and back, 1 pulled). */
export function buildLever(): THREE.Group {
  const g = new THREE.Group();
  g.add(modelMesh('gd_lever_frame'));
  const pivot = new THREE.Group();
  pivot.name = 'lever';
  pivot.position.set(0, 0.42, 0);
  pivot.add(modelMesh('gd_lever_handle'));
  g.add(pivot);
  return g;
}

/** Sets the lever's pull (0 up, 1 thrown): it swings along the track in its quadrant. */
export function setLever(leverGroup: THREE.Object3D, pull: number): void {
  const pivot = leverGroup.getObjectByName('lever');
  if (pivot) pivot.rotation.x = THREE.MathUtils.lerp(-0.42, 0.46, pull);
}

/** The points: the switch blades on a pivot (`blades`, 0 straight on, 1 to the branch), and the point motor. */
export function buildPoints(): THREE.Group {
  const g = new THREE.Group();
  const blades = new THREE.Group();
  blades.name = 'blades';
  const b = new GeoBuilder();
  b.box(-0.62, 0.24, -2.1, 0.07, 0.1, 4.2, '#C9CED3');
  b.box(0.62, 0.24, -2.1, 0.07, 0.1, 4.2, '#C9CED3');
  blades.add(sceneryMesh(b));
  g.add(blades);
  const motor = new GeoBuilder();
  motor.box(1.9, 0.2, 0, 0.7, 0.4, 0.55, '#3A3A3E');
  motor.box(1.25, 0.2, 0, 0.7, 0.05, 0.06, '#6E7378');
  g.add(sceneryMesh(motor));
  return g;
}

export function setPoints(pointsGroup: THREE.Object3D, toBranch: number): void {
  const blades = pointsGroup.getObjectByName('blades');
  if (blades) blades.rotation.y = -0.09 * toBranch;
}

/** The departure yard ahead of the locomotive: the points, the lever, the signal, the branch and the tunnel. */
export interface Yard {
  group: THREE.Group;
  lever: THREE.Group;
  points: THREE.Group;
  signal: THREE.Group;
  portal: THREE.Group;
  /** Where the points are (z) and how the branch runs. */
  pointsZ: number;
  shift: number;
  length: number;
  portalZ: number;
}

export function buildYard(def: LineTransitionDef, locoFrontZ: number): Yard {
  const group = new THREE.Group();
  const pointsZ = locoFrontZ - 8;
  const length = 46;
  // The branch runs off to the lake side (the platform and the station house are on the other).
  const shift = -7;
  const portalZ = pointsZ - length - 10;
  const points = buildPoints();
  points.position.set(0, 0, pointsZ);
  const lever = buildLever();
  // On the lake side, clear of the platform (whose deck would bury it).
  lever.position.set(-2.5, 0, pointsZ + 1.5);
  const sig = signal();
  sig.position.set(2.0, 0, pointsZ - 2.6);
  setSignal(sig, false);
  const path: [number, number][] = [];
  for (let z = pointsZ; z >= portalZ - 6; z -= 3) path.push([branchX(z, pointsZ, shift, length), z]);
  const rails = buildRails(path);
  // The main line runs on past the points (where the scenery's own track ends ahead of the train).
  const main = buildRails([[0, pointsZ], [0, pointsZ - 60]]);
  const portal = buildPortal(def.tunnel.entrance);
  portal.position.set(shift, 0, portalZ);
  group.add(points, lever, sig, rails, main, portal);
  return { group, lever, points, signal: sig, portal, pointsZ, shift, length, portalZ };
}

/** The engine shed over the line behind the train: its mouth faces -z, two doors (`doorL`, `doorR`) and a plaque. */
export interface Shed {
  group: THREE.Group;
  doorL: THREE.Group;
  doorR: THREE.Group;
  plaque: THREE.Mesh;
  mouthZ: number;
}

/** How far the shed's own model runs back from its face; plain walls carry on beyond it. */
const SHED_MODEL_LENGTH = 23;
const SHED_LENGTH = 190;
const SHED_DOOR_HALF = 3.3;

export function buildShed(def: LineTransitionDef, mouthZ: number): Shed {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  // The model's face is at its origin facing -z (the way the train backs in from), its body running on to +z.
  modelAt(b, 'gd_shed', 0, 0, mouthZ);
  // The rest of the shed's length, plain brick under slate (the train rolls back into it, out of sight).
  const restZ0 = mouthZ + SHED_MODEL_LENGTH;
  const restLen = SHED_LENGTH - SHED_MODEL_LENGTH;
  for (const side of [-1, 1]) b.box(side * 4.6, 3.6, restZ0 + restLen / 2, 0.4, 7.2, restLen, '#8E4B37');
  b.box(0, 7.5, restZ0 + restLen / 2, 9.4, 0.3, restLen, '#3E434B');
  group.add(sceneryMesh(b));
  // Inside: dark, so what rolls in is swallowed by it.
  const inside = new THREE.Mesh(new THREE.BoxGeometry(6.4, 6.9, SHED_LENGTH - 1), new THREE.MeshBasicMaterial({ color: '#120D0A', side: THREE.BackSide }));
  inside.position.set(0, 3.45, mouthZ + SHED_LENGTH / 2 + 0.5);
  group.add(inside);
  // The lamps either side of the doorway (the model's brackets), lit.
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), basic('#FFC977'));
    lamp.position.set(side * (SHED_DOOR_HALF + 0.7), 4.68, mouthZ - 0.5);
    group.add(lamp);
  }
  // The shed's name, painted on a board across the fanlight over the doors.
  const name = board(def.depot.name, 4.6, 0.62, '#2B2420', '#F2D9A0');
  name.rotation.y = Math.PI;
  name.position.set(0, 6.05, mouthZ - 0.2);
  group.add(name);
  const door = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * SHED_DOOR_HALF, 0, mouthZ - 0.22);
    // The leaf is built hinged on its +x edge running to -x, its ledges toward -z: the right door as it is, the left
    // one mirrored (so its ledges still face out).
    const leaf = modelMesh('gd_shed_door');
    if (side < 0) leaf.scale.x = -1;
    pivot.add(leaf);
    pivot.rotation.y = side * -Math.PI * 0.55;
    return pivot;
  };
  const doorL = door(-1);
  const doorR = door(1);
  group.add(doorL, doorR);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.86), new THREE.MeshBasicMaterial({ map: signTexture(def.depot.plaque, '#B8893A', '#2A1E0E', 512, 122), transparent: true, opacity: 0 }));
  plaque.rotation.y = Math.PI;
  plaque.position.set(0, 2.7, mouthZ - 0.42);
  group.add(plaque);
  return { group, doorL, doorR, plaque, mouthZ };
}

/** Swings the shed's doors (0 open, 1 shut). */
export function setShedDoors(shed: Shed, shut: number): void {
  shed.doorL.rotation.y = THREE.MathUtils.lerp(Math.PI * 0.55, 0, shut);
  shed.doorR.rotation.y = THREE.MathUtils.lerp(-Math.PI * 0.55, 0, shut);
}

/** The next line's first carriage (`body`, the coach in the new livery) under its roped tarp (`tarp`, which blows off). */
export function buildTarpCarriage(def: LineTransitionDef, length: number): THREE.Group {
  const g = new THREE.Group();
  const s = length / 18;
  const body = new THREE.Group();
  body.name = 'body';
  body.add(modelMesh('gd_coach', 0, 0, 0, 0, s, [KEY_A(def.arrival.livery.body), KEY_B(def.arrival.livery.trim)]));
  g.add(body);
  const tarp = new THREE.Group();
  tarp.name = 'tarp';
  tarp.add(modelMesh('gd_tarp', 0, 0, 0, 0, s, [KEY_A(def.depot.tarpColor)]));
  g.add(tarp);
  return g;
}

/** The arrival station's welcome: the arch over the walkway, palms, tiki torches, the steel band and the locals. */
export interface Welcome {
  group: THREE.Group;
  torches: THREE.Mesh[];
  /** The steel band (the first three) and the locals waving the train in. */
  people: CharacterView[];
  plate: THREE.Group;
}

/** The welcome crowd's looks: islanders in bright shirts, garlanded (the band in matching shirts and white trousers). */
const BAND_LOOK: CharacterLook = { body: '#F2F0E8', accent: '#E2304F', skin: '#9A6440', hair: '#2A1E16', pants: '#F2F0E8', outfit: 'shirt', hairStyle: 'curly', accessory: 'lei', arms: true };
const LOCAL_LOOKS: CharacterLook[] = [
  { body: '#FF7A59', accent: '#F7C443', skin: '#C98E6A', hair: '#3A2418', pants: '#F4EDE0', outfit: 'shirt', hairStyle: 'side', accessory: 'lei', arms: true },
  { body: '#3EB8C9', accent: '#E2304F', skin: '#8E5A3C', hair: '#1E1410', outfit: 'dress', hairStyle: 'long', accessory: 'lei', arms: true },
  { body: '#FFD15C', accent: '#F27BAA', skin: '#E0B090', hair: '#7A4A2A', pants: '#2E6F9A', outfit: 'tee', hairStyle: 'short', hat: 'boater', accessory: 'lei', arms: true },
  { body: '#8E6CC9', accent: '#F7C443', skin: '#B0764E', hair: '#2A1E16', outfit: 'dress', hairStyle: 'bun', accessory: 'lei', arms: true },
  { body: '#5CC97A', accent: '#E2304F', skin: '#D4A076', hair: '#4A2E1A', pants: '#F2F0E8', outfit: 'shirt', hairStyle: 'quiff', accessory: 'lei', arms: true },
  { body: '#FF8FB8', accent: '#FBF5EE', skin: '#9A6440', hair: '#1E1410', outfit: 'dress', hairStyle: 'bob', accessory: 'lei', arms: true },
];

export function buildWelcome(def: LineTransitionDef, platformX0: number, plateAt: THREE.Vector3): Welcome {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  // The arch stands across the platform just beyond the engine's nose, its opening facing back down the platform
  // (the camera looks along the platform at it, past the crowd, with the engine pulling in beside it), palms behind it
  // and one at the back railing, all clear of the camera's way along the platform.
  const archX = platformX0 + 3.8;
  const archZ = -16.5;
  modelAt(b, 'gd_arch', archX, 0, archZ, -Math.PI / 2, 0.9);
  for (const [x, z, rot, s] of [[platformX0 + 6.8, -19.5, Math.PI - 0.3, 1.0], [platformX0 + 1.4, -20.5, Math.PI + 0.5, 0.92], [platformX0 + 7.4, -25, Math.PI - 0.15, 0.95]] as [number, number, number, number][]) {
    modelAt(b, 'gd_palm', x, 0, z, rot, s);
  }
  // Tiki torches along the platform edge.
  const torchAt: [number, number][] = [-12, -8, 0, 4, 8].map((z) => [platformX0 + 0.8, z]);
  const torchScale = 1.9 / modelEntry('tiki_torch').max[1];
  for (const [x, z] of torchAt) modelAt(b, 'tiki_torch', x, 0, z, 0, torchScale);
  // The band's steel pans, in front of where they stand.
  for (let i = 0; i < 3; i++) modelAt(b, 'gd_steel_drum', platformX0 + 4.65, 0, -11 + i * 1.25, 0, 1);
  group.add(sceneryMesh(b));
  const sign = board(def.arrival.arch, 3.4, 0.66, '#F4E6C2', '#1E5E7A');
  // On the lintel, facing back down the platform.
  sign.scale.setScalar(0.9);
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(archX, 3.25 * 0.9, archZ + 0.07 * 0.9);
  group.add(sign);
  // The flames on the torches (unlit, flickering).
  const torches: THREE.Mesh[] = [];
  const flame = basic(def.arrival.colors.torch);
  for (const [x, z] of torchAt) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 8), flame);
    f.position.set(x, 1.9 + 0.12, z);
    torches.push(f);
    group.add(f);
  }
  // The band and the locals: the game's own people.
  const people: CharacterView[] = [];
  const n = def.arrival.crowd + 3;
  for (let i = 0; i < n; i++) {
    const band = i < 3;
    const look = band ? BAND_LOOK : LOCAL_LOOKS[(i - 3) % LOCAL_LOOKS.length];
    const view = new CharacterView(look, band ? 1 : 0.94 + ((i * 7) % 5) * 0.03);
    view.leans = false;
    const x = band ? platformX0 + 5.25 : platformX0 + 1.7 + (i % 3) * 0.85;
    const z = band ? -11 + i * 1.25 : -8 + Math.floor((i - 3) / 3) * 1.4 + (i % 2) * 0.45;
    view.root.position.set(x, 0, z);
    // Facing the train (toward -x), the band facing their pans.
    view.setFacing(-Math.PI / 2);
    people.push(view);
    group.add(view.root);
  }
  // The new name plate, dropped onto the engine: the brass plate with its words on its face.
  const plate = new THREE.Group();
  plate.add(modelMesh('gd_plate', 0, -0.25, 0));
  const words = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.36), new THREE.MeshBasicMaterial({ map: signTexture(def.arrival.plate, '#C9A35E', '#1E2A3A', 512, 112) }));
  words.rotation.y = Math.PI / 2;
  words.position.set(0.04, 0, 0);
  plate.add(words);
  plate.position.copy(plateAt);
  group.add(plate);
  group.userData.people = people;
  return { group, torches, people, plate };
}

/** The tease in ordinary play: a portal on the lake side with its sign, a short spur and a closed signal. */
export function buildTease(def: LineTransitionDef): THREE.Group {
  const g = new THREE.Group();
  // Beyond the track on the lake side, where the camera looks over the train at it (the land side must stay low).
  const portal = buildPortal(def.tease.style, def.tease.sign);
  portal.rotation.y = Math.PI / 2;
  portal.scale.setScalar(0.8);
  portal.position.set(-11, 0, 0);
  g.add(portal);
  g.add(buildRails([[-3.2, 7], [-7, 3], [-10.4, 0]]));
  const sig = signal();
  sig.position.set(-6.4, 0, 5.2);
  setSignal(sig, false);
  g.add(sig);
  return g;
}

/** A gull: its body and two wings that flap (`l`, `r`). */
export function buildGull(): THREE.Group {
  const bird = new THREE.Group();
  bird.add(modelMesh('gd_gull'));
  for (const side of [-1, 1]) {
    const wing = modelMesh('gd_gull_wing');
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.06, 0.2, 0);
    // The wing is built reaching to +x: the left one is its mirror.
    wing.scale.x = side;
    wing.position.x = side * 0.48;
    pivot.add(wing);
    pivot.name = side < 0 ? 'l' : 'r';
    bird.add(pivot);
  }
  return bird;
}

/** Frees every geometry, material and texture under `root`, and every person in it (the shared materials stay). */
export function disposeSet(root: THREE.Object3D): void {
  root.parent?.remove(root);
  const views = (root.userData.people as CharacterView[] | undefined) ?? [];
  // People's parts are the character batch's cached geometry: they go with their views, never freed here.
  const skip = new Set<THREE.Object3D>(views.map((v) => v.root));
  for (const v of views) v.dispose();
  const walk = (o: THREE.Object3D): void => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (SHARED.has(mat)) continue;
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    }
    for (const child of o.children) walk(child);
  };
  walk(root);
}
