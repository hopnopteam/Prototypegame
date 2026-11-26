import * as THREE from 'three';
import type { LineTransitionDef, TunnelStyle } from '../config/lineTransition';
import { signTexture } from './sprites';

/**
 * The Grand Departure's set pieces, Stage A: stand-ins built from boxes, cylinders and cones so every beat can be
 * timed and framed before any art. Each builder returns a group in world (train) coordinates: x across the train
 * (+x the platform side), z along it (the locomotive toward -z), y up. Stage B replaces each with its baked Blender
 * piece (`LineTransitionDef.art`) at the same place and size.
 *
 * Everything here is made when its beat starts and disposed when the sequence ends (`disposeSet`), so none of it costs
 * anything in ordinary play.
 */

const STONE: Record<TunnelStyle, { stone: string; hill: string; dark: string }> = {
  stone: { stone: '#8C8578', hill: '#4E6B3F', dark: '#0B0A0C' },
  cliff: { stone: '#D8B98A', hill: '#C79A62', dark: '#0D0906' },
  snow: { stone: '#B9C4D0', hill: '#EEF3F8', dark: '#07090C' },
};

const lambert = (color: string, emissive?: string, intensity = 1): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? intensity : 0 });

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

function cylinder(r: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** A sign board on two posts, its words drawn on a canvas, facing +x (the camera's side of the track). */
function signBoard(text: string, width: number, height: number, bg: string, fg: string, postHeight: number, material?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const post = material ?? lambert('#5B4632');
  g.add(cylinder(0.06, postHeight, post, 0, 0, -width / 2 + 0.15));
  g.add(cylinder(0.06, postHeight, post, 0, 0, width / 2 - 0.15));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, 512, Math.round((512 * height) / width)) }));
  face.rotation.y = Math.PI / 2;
  face.position.set(0.05, postHeight + height / 2 - 0.1, 0);
  const back = box(0.06, height, width, lambert('#3E3226'), 0, postHeight - 0.1, 0);
  g.add(back, face);
  return g;
}

/** A railway signal on a post: a red and a green lamp, one of them lit (`setSignal`). */
function signal(): THREE.Group {
  const g = new THREE.Group();
  g.add(cylinder(0.08, 3.2, lambert('#2B2B2E')));
  g.add(box(0.36, 0.9, 0.36, lambert('#1A1A1C'), 0, 3.0, 0));
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: '#FF3B2F' }));
  red.position.set(0.19, 3.65, 0);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: '#1E3B22' }));
  green.position.set(0.19, 3.3, 0);
  red.name = 'red';
  green.name = 'green';
  g.add(red, green);
  return g;
}

/** Turns a signal green (or back to red). */
export function setSignal(signalGroup: THREE.Object3D, clear: boolean): void {
  const red = signalGroup.getObjectByName('red') as THREE.Mesh | undefined;
  const green = signalGroup.getObjectByName('green') as THREE.Mesh | undefined;
  if (red) (red.material as THREE.MeshBasicMaterial).color.set(clear ? '#3A1512' : '#FF3B2F');
  if (green) (green.material as THREE.MeshBasicMaterial).color.set(clear ? '#5CFF7A' : '#1E3B22');
}

/** A tunnel portal in a hillside, its mouth facing +z (the way the track comes in), centred on x = 0. */
export function buildPortal(style: TunnelStyle, sign?: string): THREE.Group {
  const c = STONE[style];
  const g = new THREE.Group();
  const stone = lambert(c.stone);
  // The hill the tunnel goes into, wider than the camera sees.
  const hill = new THREE.Mesh(new THREE.SphereGeometry(18, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert(c.hill));
  hill.scale.set(1.2, 0.75, 1);
  hill.position.set(0, -0.2, -17);
  g.add(hill);
  // The portal's face: two piers, a lintel, an arch ring and the black mouth.
  g.add(box(1.4, 5.2, 1.6, stone, -3.4, 0, 0), box(1.4, 5.2, 1.6, stone, 3.4, 0, 0), box(8.2, 1.6, 1.6, stone, 0, 5.2, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.45, 8, 20, Math.PI), stone);
  ring.position.set(0, 3.4, 0.4);
  g.add(ring);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.2), new THREE.MeshBasicMaterial({ color: c.dark }));
  mouth.position.set(0, 3.1, 0.15);
  g.add(mouth);
  // The way in: dark all the way, so the train vanishes into it.
  const throat = new THREE.Mesh(new THREE.BoxGeometry(5.4, 6.2, 30), new THREE.MeshBasicMaterial({ color: c.dark, side: THREE.BackSide }));
  throat.position.set(0, 3.1, -15);
  g.add(throat);
  if (sign) {
    const s = signBoard(sign, 4.2, 0.9, '#1F3B2C', '#F6E7B8', 0.2, stone);
    s.rotation.y = -Math.PI / 2;
    s.position.set(0, 6.6, 0.85);
    g.add(s);
  }
  return g;
}

/** Rails and sleepers along a polyline of (x, z) points (a short branch line). */
export function buildRails(points: [number, number][], color = '#6E5236'): THREE.Group {
  const g = new THREE.Group();
  const sleeper = lambert(color);
  const rail = lambert('#9AA0A6');
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const seg = new THREE.Group();
    seg.position.set(x0, 0, z0);
    seg.rotation.y = yaw;
    for (let d = 0.35; d < len; d += 0.7) seg.add(box(2.6, 0.12, 0.24, sleeper, 0, 0.02, d));
    seg.add(box(0.08, 0.12, len, rail, -0.72, 0.14, len / 2), box(0.08, 0.12, len, rail, 0.72, 0.14, len / 2));
    g.add(seg);
  }
  return g;
}

/** Where the branch to the tunnel runs: x at z, from the points (z = `pointsZ`) curving off to the platform side. */
export function branchX(z: number, pointsZ: number, shift: number, length: number): number {
  const u = Math.min(1, Math.max(0, (pointsZ - z) / length));
  return shift * u * u * (3 - 2 * u);
}

/** The points lever: a cast frame, a quadrant and the handle on a pivot (`lever` child, 0 up, 1 pulled). */
export function buildLever(): THREE.Group {
  const g = new THREE.Group();
  const iron = lambert('#2F3236');
  const red = lambert('#B8322B');
  g.add(box(0.9, 0.35, 0.7, lambert('#5B4632'), 0, 0, 0));
  g.add(box(0.14, 0.9, 0.6, iron, -0.2, 0.35, 0), box(0.14, 0.9, 0.6, iron, 0.2, 0.35, 0));
  const pivot = new THREE.Group();
  pivot.name = 'lever';
  pivot.position.set(0, 0.95, 0);
  const handle = box(0.12, 1.9, 0.12, red, 0, 0, 0);
  pivot.add(handle);
  const grip = cylinder(0.09, 0.32, lambert('#E9E2D2'), 0, 1.85, 0);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 1.95, 0);
  pivot.add(grip);
  g.add(pivot);
  return g;
}

/** Sets the lever's pull (0 up, 1 thrown): it swings from leaning toward the track to leaning back. */
export function setLever(leverGroup: THREE.Object3D, pull: number): void {
  const pivot = leverGroup.getObjectByName('lever');
  if (pivot) pivot.rotation.z = THREE.MathUtils.lerp(-0.55, 0.65, pull);
}

/** The points: the switch blades on a pivot (`blades`, 0 straight on, 1 to the branch). */
export function buildPoints(): THREE.Group {
  const g = new THREE.Group();
  const blades = new THREE.Group();
  blades.name = 'blades';
  const steel = lambert('#C9CED3');
  blades.add(box(0.07, 0.1, 4.2, steel, -0.62, 0.2, -2.1), box(0.07, 0.1, 4.2, steel, 0.62, 0.2, -2.1));
  g.add(blades);
  g.add(box(1.8, 0.25, 0.5, lambert('#3A3A3E'), 1.7, 0, 0));
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

export function buildShed(def: LineTransitionDef, mouthZ: number): Shed {
  const group = new THREE.Group();
  const brick = lambert('#7A4A3A');
  const roof = lambert('#3D3F46');
  const length = 190;
  group.add(box(0.8, 7, length, brick, -3.6, 0, mouthZ + length / 2), box(0.8, 7, length, brick, 3.6, 0, mouthZ + length / 2));
  group.add(box(8.0, 0.6, length, roof, 0, 7, mouthZ + length / 2));
  group.add(box(8.0, 2.0, 0.8, brick, 0, 5.6, mouthZ));
  // Inside: dark, with a warm lamp glow at the mouth.
  const inside = new THREE.Mesh(new THREE.BoxGeometry(6.4, 7, length - 1), new THREE.MeshBasicMaterial({ color: '#120D0A', side: THREE.BackSide }));
  inside.position.set(0, 3.5, mouthZ + length / 2 + 0.5);
  group.add(inside);
  const lamp = (x: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#FFC977' }));
    m.position.set(x, 5.2, mouthZ - 0.5);
    return m;
  };
  group.add(lamp(-2.6), lamp(2.6));
  const name = signBoard(def.depot.name, 6.4, 0.8, '#2B2420', '#F2D9A0', 0);
  name.rotation.y = -Math.PI / 2;
  name.position.set(0, 6.25, mouthZ - 0.45);
  group.add(name);
  const door = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.2, 0, mouthZ - 0.5);
    const leaf = box(3.2, 5.6, 0.15, lambert('#4A5A3A'), -side * 1.6, 0, 0);
    pivot.add(leaf);
    pivot.rotation.y = side * -Math.PI * 0.55;
    return pivot;
  };
  const doorL = door(-1);
  const doorR = door(1);
  group.add(doorL, doorR);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), new THREE.MeshBasicMaterial({ map: signTexture(def.depot.plaque, '#B8893A', '#2A1E0E', 512, 122), transparent: true, opacity: 0 }));
  plaque.rotation.y = Math.PI;
  plaque.position.set(0, 2.4, mouthZ - 0.62);
  group.add(plaque);
  return { group, doorL, doorR, plaque, mouthZ };
}

/** Swings the shed's doors (0 open, 1 shut). */
export function setShedDoors(shed: Shed, shut: number): void {
  shed.doorL.rotation.y = THREE.MathUtils.lerp(Math.PI * 0.55, 0, shut);
  shed.doorR.rotation.y = THREE.MathUtils.lerp(-Math.PI * 0.55, 0, shut);
}

/** The next line's first carriage under its tarp (`tarp` child lifts off; `body` beneath in the new livery). */
export function buildTarpCarriage(def: LineTransitionDef, length: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.add(box(4.9, 2.6, length, lambert(def.arrival.livery.body), 0, 0.55, length / 2));
  body.add(box(4.95, 0.45, length - 0.2, lambert(def.arrival.livery.trim), 0, 2.0, length / 2));
  for (let z = 1.5; z < length - 1; z += 2.4) body.add(box(5.0, 0.7, 1.3, new THREE.MeshBasicMaterial({ color: '#FFE3A8' }), 0, 1.3, z));
  body.add(box(4.4, 0.5, length - 1, lambert('#222226'), 0, 0.05, length / 2));
  g.add(body);
  const tarp = box(5.3, 3.4, length + 0.4, lambert(def.depot.tarpColor), 0, 0.3, length / 2);
  tarp.name = 'tarp';
  g.add(tarp);
  return g;
}

/** The arrival station's welcome: the arch over the walkway, palms, tiki torches, the band and the locals. */
export interface Welcome {
  group: THREE.Group;
  torches: THREE.Mesh[];
  locals: THREE.Group[];
  plate: THREE.Mesh;
}

export function buildWelcome(def: LineTransitionDef, platformX0: number, plateAt: THREE.Vector3): Welcome {
  const group = new THREE.Group();
  const c = def.arrival.colors;
  const bamboo = lambert(c.bamboo);
  const thatch = lambert(c.thatch);
  const archX = platformX0 + 2.6;
  const archZ = -4;
  group.add(cylinder(0.14, 3.6, bamboo, archX, 0, archZ - 2.2), cylinder(0.14, 3.6, bamboo, archX, 0, archZ + 2.2));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.2, 4), thatch);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(0.5, 1, 1.25);
  roof.position.set(archX, 4.3, archZ);
  group.add(roof);
  const sign = signBoard(def.arrival.arch, 4.0, 0.7, '#F4E6C2', '#1E5E7A', 0);
  sign.position.set(archX + 0.2, 3.25, archZ);
  group.add(sign);
  const torches: THREE.Mesh[] = [];
  const flame = new THREE.MeshBasicMaterial({ color: c.torch });
  for (const z of [-12, -8, 0, 4, 8]) {
    group.add(cylinder(0.06, 1.8, bamboo, platformX0 + 0.8, 0, z));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), flame);
    f.position.set(platformX0 + 0.8, 2.0, z);
    torches.push(f);
    group.add(f);
  }
  for (const [x, z] of [[platformX0 + 6.6, -10], [platformX0 + 6.8, 2], [platformX0 + 6.4, 9]] as [number, number][]) {
    group.add(cylinder(0.18, 4.6, lambert('#8A6A44'), x, 0, z, 8));
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 5), lambert('#3E8A4A'));
      leaf.position.set(x + Math.cos((i / 5) * Math.PI * 2) * 0.9, 4.5, z + Math.sin((i / 5) * Math.PI * 2) * 0.9);
      leaf.rotation.set(Math.sin((i / 5) * Math.PI * 2) * 1.2, 0, -Math.cos((i / 5) * Math.PI * 2) * 1.2);
      group.add(leaf);
    }
  }
  // The steel-drum band and the locals with leis (capsules: stand-ins for the real crowd).
  const locals: THREE.Group[] = [];
  const shirts = ['#FF7A59', '#3EB8C9', '#FFD15C', '#8E6CC9', '#5CC97A', '#FF8FB8'];
  const n = def.arrival.crowd + 3;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Group();
    const band = i < 3;
    const x = band ? platformX0 + 4.9 : platformX0 + 1.8 + (i % 3) * 0.9;
    const z = band ? -9 + i * 1.1 : -1 + Math.floor((i - 3) / 3) * 1.3 + (i % 2) * 0.4;
    p.position.set(x, 0, z);
    p.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 4, 8), lambert(shirts[i % shirts.length])));
    p.children[0].position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lambert('#C98E6A'));
    head.position.y = 1.25;
    const lei = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 14), lambert(c.flowers[i % c.flowers.length]));
    lei.rotation.x = Math.PI / 2;
    lei.position.y = 0.98;
    p.add(head, lei);
    if (band) p.add(cylinder(0.3, 0.12, lambert('#C9CED3'), -0.45, 0.85, 0, 16));
    locals.push(p);
    group.add(p);
  }
  // The new name plate, dropped onto the engine.
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.42), new THREE.MeshBasicMaterial({ map: signTexture(def.arrival.plate, '#C9A35E', '#1E2A3A', 512, 120) }));
  plate.rotation.y = Math.PI / 2;
  plate.position.copy(plateAt);
  group.add(plate);
  return { group, torches, locals, plate };
}

/** The tease in ordinary play: a portal on the land side with its sign, a short spur and a closed signal. */
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

/** Frees every geometry, material and texture under `root`. */
export function disposeSet(root: THREE.Object3D): void {
  root.parent?.remove(root);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
