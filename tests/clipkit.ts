import * as THREE from 'three';
import { ARCHETYPES } from '../src/config/content';
import type { ItemKind } from '../src/core/types';
import { Tweens } from '../src/core/Tween';
import { CarryStack } from '../src/gameplay/CarryStack';
import { guestLook } from '../src/gameplay/guestLook';
import { CharacterView, CONDUCTOR_LOOK, STAFF_LOOKS, type CharacterLook } from '../src/world/CharacterView';
import { torsoDistance, type Build } from '../src/world/CharacterParts';
import { skinnedWorld, type SkinDef } from '../src/world/Skin';

/** A skinned limb's partner bones must be current before its vertices are read where they are drawn. */
function updateSkin(mesh: THREE.Mesh): void {
  const def = mesh.userData.skin as SkinDef | undefined;
  if (def) for (const p of def.partners) p?.object.updateWorldMatrix(true, false);
}

/**
 * Session 63 (owner: "make sure none of the clothing is actually clipping in any place, and I mean truly not in a single
 * place… zero clip ins"): every figure walked, run, turned and stopped, and every carrier taking and handing over every
 * kind of load, sampled through the moves; any part of one piece found inside another is a clip.
 *
 * A piece's volume is read from its own mesh: round its part's axis (y), the furthest its surface reaches in each
 * direction at each height (`Radial`); a point nearer the axis than that is inside it. Carried things are their boxes.
 */

const TOL = 0.008;
/** A held thing may rest on the hand and the wrist that hold it (the soft mitten gives a little). */
const HOLD_TOL = 0.016;

export class Radial {
  static readonly DY = 0.01;
  static readonly AB = 24;
  y0 = 0;
  rows = 0;
  r = new Float32Array(0);
  constructor(geometry: THREE.BufferGeometry) {
    const p = geometry.getAttribute('position');
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      lo = Math.min(lo, p.getY(i));
      hi = Math.max(hi, p.getY(i));
    }
    this.y0 = lo;
    this.rows = Math.max(1, Math.ceil((hi - lo) / Radial.DY) + 1);
    const r = new Float32Array(this.rows * Radial.AB).fill(-1);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const row = Math.floor((p.getY(i) - lo) / Radial.DY);
      const a = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * Radial.AB) % Radial.AB;
      const k = row * Radial.AB + a;
      r[k] = Math.max(r[k], Math.hypot(x, z));
    }
    // A lathe's rings: the rows between two rings of the same direction are its straight run between them.
    for (let a = 0; a < Radial.AB; a++) {
      let last = -1;
      for (let row = 0; row < this.rows; row++) {
        if (r[row * Radial.AB + a] < 0) continue;
        if (last >= 0 && row - last > 1) for (let k = last + 1; k < row; k++) r[k * Radial.AB + a] = r[last * Radial.AB + a] + ((r[row * Radial.AB + a] - r[last * Radial.AB + a]) * (k - last)) / (row - last);
        last = row;
      }
    }
    // Fill the gaps between a lathe's segments and rows from the nearest neighbours (never beyond 4 cm in height).
    const filled = r.slice();
    for (let row = 0; row < this.rows; row++) {
      for (let a = 0; a < Radial.AB; a++) {
        if (r[row * Radial.AB + a] >= 0) continue;
        let best = -1;
        // Only between rows (never round past a piece's edge: an open coat's front or an apron's sides end there).
        for (let d = 1; d <= 3 && best < 0; d++) {
          for (const [dr, da] of [[d, 0], [-d, 0]]) {
            const rr = row + dr;
            if (rr < 0 || rr >= this.rows || Math.abs(dr) > 4) continue;
            const aa = (a + da + Radial.AB) % Radial.AB;
            const v = r[rr * Radial.AB + aa];
            if (v >= 0) best = best < 0 ? v : Math.min(best, v);
          }
        }
        filled[row * Radial.AB + a] = best;
      }
    }
    this.r = filled;
  }
  /** How deep a point (in the part's space) is inside the surface (≤ 0 outside). */
  depth(x: number, y: number, z: number): number {
    const row = Math.floor((y - this.y0) / Radial.DY);
    if (row < 0 || row >= this.rows) return 0;
    const a = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * Radial.AB) % Radial.AB;
    const r = this.r[row * Radial.AB + a];
    if (r < 0) return 0;
    return r - Math.hypot(x, z);
  }
}

interface Volume {
  name: string;
  object: THREE.Object3D;
  /** The torso itself (its lathe, exactly), by build. */
  torso?: Build;
  radial?: Radial;
  box?: THREE.Box3;
  /** Points of the tested part nearer than this to the volume's origin are left out (a joint, by design). */
  skipNear?: number;
  tol: number;
}

interface Part {
  name: string;
  mesh: THREE.Mesh;
  /** Only the points below this (model units): a bag's case, not the handle the hand closes round. */
  maxY?: number;
}

const radials = new Map<THREE.BufferGeometry, Radial>();
export function radialOf(g: THREE.BufferGeometry): Radial {
  let r = radials.get(g);
  if (!r) {
    r = new Radial(g);
    radials.set(g, r);
  }
  return r;
}

const inv = new THREE.Matrix4();
const v = new THREE.Vector3();
const w = new THREE.Vector3();

/** The worst clip of `part` into `vol` this frame (metres, 0 if none) and where. */
function clipOf(part: Part, vol: Volume): number {
  part.mesh.updateWorldMatrix(true, false);
  vol.object.updateWorldMatrix(true, false);
  inv.copy(vol.object.matrixWorld).invert();
  updateSkin(part.mesh);
  const p = part.mesh.geometry.getAttribute('position');
  const sk = part.mesh.geometry.getAttribute('aSkin');
  let worst = 0;
  for (let i = 0; i < p.count; i++) {
    if (part.maxY !== undefined && p.getY(i) > part.maxY) continue;
    // Session 66: a vertex following the body (the trapezius and armpit surface a sculpted arm's piece carries so its
    // seam stays closed) is the body's own surface, where the neck meets the head by design.
    if (sk && sk.getX(i) === 1 && sk.getY(i) >= 0.97) continue;
    skinnedWorld(part.mesh, i, v).applyMatrix4(inv);
    if (vol.skipNear && v.length() < vol.skipNear) continue;
    let d = 0;
    if (vol.torso) d = torsoDistance(vol.torso, v.x, v.y, v.z);
    else if (vol.radial) d = vol.radial.depth(v.x, v.y, v.z);
    else if (vol.box) {
      const b = vol.box;
      d = Math.min(v.x - b.min.x, b.max.x - v.x, v.y - b.min.y, b.max.y - v.y, v.z - b.min.z, b.max.z - v.z);
    }
    if (d * scaleOf(vol.object) - vol.tol > worst) worst = d * scaleOf(vol.object) - vol.tol;
  }
  return worst;
}

const sv = new THREE.Vector3();
function scaleOf(o: THREE.Object3D): number {
  return o.getWorldScale(sv).x;
}

/** The figure's pieces (meshes reached through its private fields). */
export function piecesOf(view: CharacterView) {
  const f = view as unknown as {
    bodyMesh: THREE.Mesh;
    headMesh: THREE.Mesh;
    upperMeshes: THREE.Mesh[];
    foreMeshes: THREE.Mesh[];
    thighMeshes: THREE.Mesh[];
    shinMeshes: THREE.Mesh[];
    arms: THREE.Object3D[];
    cloth: { spec: { kind: string }; mesh: THREE.Mesh }[];
  };
  return f;
}

export function lookFor(name: string): { look: CharacterLook; scale: number } {
  if (name === 'conductor') return { look: CONDUCTOR_LOOK, scale: 1.1 };
  if (name in STAFF_LOOKS) return { look: STAFF_LOOKS[name as keyof typeof STAFF_LOOKS], scale: 1 };
  const [id, k] = name.split(':');
  const a = ARCHETYPES.find((x) => x.id === id)!;
  const base: CharacterLook = { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor };
  return { look: guestLook(base, a, Number(k ?? '0')), scale: 1 };
}

export interface Clip {
  who: string;
  scene: string;
  t: number;
  what: string;
  depth: number;
}

/** Checks one figure through a scene: `drive(t)` moves it (speed and facing) and may take or hand over things. */
/** Each figure's walk starts at a random phase: seeded here, so a run is repeatable (and several seeds are tried). */
let seed = 1;
export function reseed(n: number): void {
  seed = n;
}
function seeded(): () => number {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function run(who: string, scene: string, seconds: number, drive: (view: CharacterView, stack: CarryStack | null, t: number) => number, carries: boolean): Clip[] {
  const { look, scale } = lookFor(who);
  const random = Math.random;
  Math.random = seeded();
  const view = new CharacterView(look, scale);
  Math.random = random;
  view.leans = false;
  const scn = new THREE.Scene();
  scn.add(view.root);
  const tweens = new Tweens();
  const stack = carries ? new CarryStack(view.stackAnchor, scn, tweens, 8, view.boardAnchor, view) : null;
  const P = piecesOf(view);
  const build: Build = look.build ?? 'regular';
  const clips: Clip[] = [];
  const dt = 1 / 60;
  let x = 0;
  let z = 0;
  for (let step = 0, t = 0; t < seconds; step++, t += dt) {
    const speed = drive(view, stack, t);
    const yaw = (view as unknown as { yawTarget: number }).yawTarget;
    x += Math.sin(yaw) * speed * dt;
    z += Math.cos(yaw) * speed * dt;
    view.setPosition(x, 0, z);
    view.update(dt, speed);
    tweens.update(dt);
    stack?.update(dt, speed > 0.2, t);
    if (step % 3 !== 0 || t < 0.3) continue;
    view.root.updateMatrixWorld(true);
    const vols: Volume[] = [
      { name: 'body', object: P.bodyMesh, torso: build, tol: TOL },
      { name: 'head', object: P.headMesh, radial: radialOf(P.headMesh.geometry), tol: TOL },
      ...P.thighMeshes.map((m, i) => ({ name: `thigh${i}`, object: m, radial: radialOf(m.geometry), tol: TOL })),
      ...P.shinMeshes.map((m, i) => ({ name: `shin${i}`, object: m, radial: radialOf(m.geometry), tol: TOL })),
    ];
    const arms: Part[] = [];
    P.upperMeshes.forEach((m, i) => arms.push({ name: `upper${i}`, mesh: m }));
    P.foreMeshes.forEach((m, i) => arms.push({ name: `fore${i}`, mesh: m }));
    const report = (what: string, d: number): void => {
      if (d > 0) clips.push({ who, scene, t: Math.round(t * 100) / 100, what, depth: Math.round(d * 1000) / 1000 });
    };
    // Arms and hands: never into the body (but where the shoulder ball meets it), the head, the legs, the other arm.
    for (const part of arms) {
      for (const vol of vols) {
        const shoulder = vol.name === 'body' && part.name.startsWith('upper');
        const vv = shoulder ? { ...vol, skipNear: 0, object: vol.object } : vol;
        if (shoulder) {
          // Measured from the arm's own pivot: its top (the shoulder ball, 12 cm) meets the body by design.
          const d = clipNearPivot(part, vol, 0.12);
          report(`${part.name}→body`, d);
          continue;
        }
        report(`${part.name}→${vv.name}`, clipOf(part, vv));
      }
      // Into the swinging skirt or coat (a hand through the cloth).
      for (const c of P.cloth) if (c.spec.kind !== 'hair') report(`${part.name}→${c.spec.kind}`, clipOf(part, { name: c.spec.kind, object: c.mesh, radial: radialOf(c.mesh.geometry), tol: TOL }));
    }
    // Legs out through a skirt or a coat (a knee or a shoe through the cloth).
    for (const c of P.cloth) {
      if (c.spec.kind === 'hair') {
        report('hair→body', clipOf({ name: 'hair', mesh: c.mesh }, vols[0]));
        continue;
      }
      for (const [i, leg] of [...P.thighMeshes, ...P.shinMeshes].entries()) report(`leg${i}↔${c.spec.kind}`, legThroughCloth(leg, c.mesh));
    }
    if (stack) {
      // Carried things: never into the body, the head, the legs, the arms (resting on the holding hands is fine), the cloth.
      const held = heldMeshes(view, stack);
      for (const m of held) {
        const part: Part = { name: `item:${m.userData.kind ?? 'item'}`, mesh: m, maxY: m.userData.solidTop };
        for (const vol of vols) report(`${part.name}→${vol.name}`, clipOf(part, vol));
        for (const a of arms) report(`${part.name}→${a.name}`, clipOf(part, { name: a.name, object: a.mesh, radial: radialOf(a.mesh.geometry), tol: HOLD_TOL }));
        for (const c of P.cloth) if (c.spec.kind !== 'hair') report(`${part.name}→${c.spec.kind}`, clipOf(part, { name: c.spec.kind, object: c.mesh, radial: radialOf(c.mesh.geometry), tol: TOL }));
        // Hands into what they hold (the mitten closes round a handle, rests under a tray: a little, never through).
        m.geometry.computeBoundingBox();
        const box = m.geometry.boundingBox!.clone();
        if (m.userData.solidTop !== undefined) box.max.y = Math.min(box.max.y, m.userData.solidTop);
        box.expandByScalar(-0.004);
        for (const a of arms) if (a.name.startsWith('fore')) report(`${a.name}→${part.name}`, clipOf(a, { name: part.name, object: m, box, tol: HOLD_TOL }));
      }
    }
  }
  return clips;
}

/** An upper arm into the body, leaving out its top `near` metres (the shoulder ball). */
function clipNearPivot(part: Part, vol: Volume, near: number): number {
  part.mesh.updateWorldMatrix(true, false);
  vol.object.updateWorldMatrix(true, false);
  inv.copy(vol.object.matrixWorld).invert();
  updateSkin(part.mesh);
  const p = part.mesh.geometry.getAttribute('position');
  let worst = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y > -near) continue;
    skinnedWorld(part.mesh, i, w).applyMatrix4(inv);
    const d = (vol.torso ? torsoDistance(vol.torso, w.x, w.y, w.z) : vol.radial!.depth(w.x, w.y, w.z)) - vol.tol;
    if (d > worst) worst = d;
  }
  return worst;
}

/** A leg out through a skirt or coat: a point of the leg further out than the cloth is where the cloth hangs. */
function legThroughCloth(leg: THREE.Mesh, cloth: THREE.Mesh): number {
  const r = radialOf(cloth.geometry);
  leg.updateWorldMatrix(true, false);
  cloth.updateWorldMatrix(true, false);
  inv.copy(cloth.matrixWorld).invert();
  updateSkin(leg);
  const p = leg.geometry.getAttribute('position');
  const sk = leg.geometry.getAttribute('aSkin');
  let worst = 0;
  for (let i = 0; i < p.count; i++) {
    // Session 66: a corner that follows the body (code 1, weight from 0.97) is the torso's own surface (the seat, the
    // hip), carried in the leg's piece only so the seam stays closed: the cloth hangs on the body by design.
    if (sk && sk.getX(i) === 1 && sk.getY(i) >= 0.97) continue;
    skinnedWorld(leg, i, v).applyMatrix4(inv);
    const d = r.depth(v.x, v.y, v.z);
    // Inside the cloth's reach is fine; up to 3 cm beyond it (above its hem) means the leg pokes through it.
    if (d < -TOL && d > -0.03) {
      const row = Math.floor((v.y - r.y0) / Radial.DY);
      if (row >= 2 && row < r.rows - 2) worst = Math.max(worst, -d - TOL);
    }
  }
  return worst;
}

/** Every carried mesh still held (not on its way out) under the figure's anchors. */
function heldMeshes(view: CharacterView, stack: CarryStack): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const roots = [view.stackAnchor, ...view.handAnchors, view.boardAnchor];
  for (const r of roots) r.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible && !(stack as unknown as { flights: Map<THREE.Mesh, unknown> }).flights.has(m)) out.push(m);
  });
  for (const c of view.body.children) if (c.userData.carried) out.push(c as THREE.Mesh);
  return out;
}

export function summarise(clips: Clip[]): string {
  const by = new Map<string, Clip>();
  for (const c of clips) {
    const k = `${c.who} ${c.scene} ${c.what}`;
    const was = by.get(k);
    if (!was || c.depth > was.depth) by.set(k, c);
  }
  return [...by.values()].sort((a, b) => b.depth - a.depth).slice(0, 60).map((c) => `${c.who.padEnd(12)} ${c.scene.padEnd(22)} ${c.what.padEnd(26)} ${(c.depth * 1000).toFixed(0)} mm at ${c.t}s`).join('\n');
}

/** Walks, runs, stops and turns: the figure's own swing (and its cloth's) with no load. */
export function wander(view: CharacterView, _s: CarryStack | null, t: number): number {
  const u = t % 4;
  view.setFacing(Math.floor(t / 4) * 2.3 + (u > 3 ? 1.6 : 0));
  return u < 1.2 ? 1.6 : u < 2.4 ? 3.6 : u < 3 ? 0 : 1.2;
}

export const GUESTS = ['student', 'backpacker', 'tourist', 'grandma', 'family', 'businessman', 'newlyweds', 'vip', 'celebrity', 'royal', 'surfer', 'beachFamily', 'sunbather', 'honeymooners'].flatMap((id) => [`${id}:0`, `${id}:2`]).filter((n) => ARCHETYPES.some((a) => a.id === n.split(':')[0]));
export const CARRIERS = ['conductor', ...Object.keys(STAFF_LOOKS)];
export const LOADS: ItemKind[][] = [
  ['tea', 'latte', 'sandwich'],
  ['champagne'],
  ['meal', 'cocktail'],
  ['towel', 'blanket', 'pillow'],
  ['roll', 'robe'],
  ['luggage'],
  ['luggage', 'luggage'],
  ['luggage', 'luggage', 'luggage'],
  ['crate'],
  ['luggage', 'towel'],
  ['popcorn', 'popcorn', 'popcorn', 'popcorn'],
];

/** Takes the load from in front (then from each side), walks with it, and hands it back, piece by piece. */
export function chores(load: ItemKind[]) {
  return (view: CharacterView, stack: CarryStack | null, t: number): number => {
    const st = stack!;
    const n = load.length;
    const per = 0.7;
    const k = Math.floor(t / per);
    const phase = k % (2 * n + 3);
    const sources = [new THREE.Vector3(0.1, 0.8, 0.7), new THREE.Vector3(0.7, 0.4, 0.2), new THREE.Vector3(-0.6, 0.9, 0.1)];
    const src = (): THREE.Vector3 => view.root.localToWorld(sources[k % 3].clone());
    if ((st as unknown as { last?: number }).last !== k) {
      (st as unknown as { last?: number }).last = k;
      if (phase < n) st.add(load[phase], src());
      else if (phase >= n + 3 && phase - n - 3 < n) st.remove(load[n - 1 - (phase - n - 3)], src);
    }
    view.setFacing(Math.floor(t / 5) * 1.9);
    return phase === n ? 1.6 : phase === n + 1 ? 3.4 : phase === n + 2 ? 0.8 : 0;
  };
}


/** Every gesture in turn, standing (then, for those that sit, seated): each held long enough to play through. */
export const GESTURES = ['read', 'sip', 'watch', 'wash', 'stamp', 'hug', 'wave', 'look', 'phone', 'chat', 'yawn', 'waveTicket', 'stomp', 'cheer', 'work', 'sweep', 'skim'] as const;
export function gestures(view: CharacterView, _s: CarryStack | null, t: number): number {
  const k = Math.floor(t / 1.6);
  const g = GESTURES[k % GESTURES.length];
  view.act(g as never, 0.1);
  view.setFacing(k * 0.4);
  return 0;
}
export function seated(view: CharacterView, _s: CarryStack | null, t: number): number {
  if (t < 0.02) view.setPose('sit');
  const k = Math.floor(t / 1.6);
  view.act((['read', 'sip', 'phone', 'chat', 'look', 'yawn'] as const)[k % 6] as never, 0.1);
  return 0;
}
