// Classic figures, zero clipping (session 67, owner: "no clipping in their clothing or anything they interact with").
// Every look is posed through its walk and run cycles, standing, seated, every gesture and carrying, and two things are
// measured from the real meshes in the body's own space:
// - legs never come out through a skirt, a gown or a coat's tails above the hem (the knee poking through the cloth);
// - arms and hands never sink into the torso or what hangs below it.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARCHETYPES } from '../src/config/content';
import { guestLook } from '../src/gameplay/guestLook';
import { CharacterView, CONDUCTOR_LOOK, figureOf, STAFF_LOOKS, type CharacterAction, type CharacterLook } from '../src/world/CharacterView';
import { CHEST, HIPS, SHOULDER_X, SHOULDER_Y, SKIRTS, TORSO_DEPTH, profileRadius } from '../src/world/CharacterParts';

const LOOKS: { name: string; look: CharacterLook }[] = [];
for (const a of ARCHETYPES) {
  const base: CharacterLook = { ...a.colors, ...a.figure, accessory: a.accessory === 'child' ? 'none' : a.accessory, hat: a.hat ?? 'none', hatColor: a.hatColor };
  for (let v = 0; v < 4; v++) LOOKS.push({ name: `${a.id}:${v}`, look: guestLook(base, a, v) });
}
LOOKS.push({ name: 'conductor', look: CONDUCTOR_LOOK });
for (const [r, l] of Object.entries(STAFF_LOOKS)) LOOKS.push({ name: `staff:${r}`, look: l });

const GESTURES: CharacterAction[] = ['sweep', 'read', 'sip', 'watch', 'wash', 'stamp', 'hug', 'wave', 'look', 'phone', 'chat', 'yawn', 'waveTicket', 'stomp', 'pickup', 'place', 'cheer', 'work', 'skim'];
/** Slack for the soft faces (a lathe drawn with 18 sides sits a little inside its round profile). */
const SLACK = 0.006;
/**
 * The shoulder joint: the sleeve's top, within this distance of the shoulder pivot, is tucked into the round shoulder
 * by design (a toy's arm meets the body there, as a sleeve meets a seam); the rest of the arm must stand clear.
 */
const SHOULDER_JOINT = 0.12;

type Part = { mesh: THREE.Mesh; kind: 'leg' | 'arm' };
function parts(v: CharacterView): Part[] {
  const any = v as unknown as { thighMeshes: THREE.Mesh[]; shinMeshes: THREE.Mesh[]; upperMeshes: THREE.Mesh[]; foreMeshes: THREE.Mesh[] };
  const legs: Part[] = [...any.thighMeshes, ...any.shinMeshes].map((mesh) => ({ mesh, kind: 'leg' }));
  const arms: Part[] = [...any.upperMeshes, ...any.foreMeshes].map((mesh) => ({ mesh, kind: 'arm' }));
  return [...legs, ...arms];
}

/** The solid the arms must stay out of: the chest, then the skirt or the trousers' seat, at a height. */
function solidRadius(outfit: string, y: number): number {
  const skirt = (SKIRTS as Record<string, [number, number][]>)[outfit];
  let r = profileRadius(CHEST, y);
  if (skirt) r = Math.max(r, profileRadius(skirt, y));
  else r = Math.max(r, profileRadius(HIPS, y));
  return r;
}

function measure(v: CharacterView, outfit: string, seated: boolean, out: string[], tag: string): void {
  v.root.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(v.body.matrixWorld).invert();
  const skirt = (SKIRTS as Record<string, [number, number][]>)[outfit];
  const hem = skirt ? skirt[skirt.length - 1][1] : 0;
  const waist = skirt ? skirt[0][1] : 0;
  const p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let worstLeg = 0;
  let worstArm = 0;
  let legAt = '';
  let armAt = '';
  for (const { mesh, kind } of parts(v)) {
    if (!mesh.visible) continue;
    m.multiplyMatrices(toBody, mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (kind === 'leg' && skirt && !seated && p.y > hem + 0.01 && p.y < waist) {
        const r = profileRadius(skirt, p.y);
        const e = Math.hypot(p.x / r, p.z / (r * TORSO_DEPTH));
        if ((e - 1) * r > worstLeg) { worstLeg = (e - 1) * r; legAt = `${mesh.parent?.parent === v.body ? 'thigh' : 'shin'} ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`; }
      }
      if (kind === 'arm' && p.y > 0.05 && Math.hypot(Math.abs(p.x) - SHOULDER_X, p.y - SHOULDER_Y, p.z) > SHOULDER_JOINT) {
        const r = solidRadius(outfit, p.y);
        if (r <= 0) continue;
        const e = Math.hypot(p.x / r, p.z / (r * TORSO_DEPTH));
        if ((1 - e) * r > worstArm) { worstArm = (1 - e) * r; armAt = `${mesh.parent?.parent === v.body ? 'upper' : 'fore'} ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`; }
      }
    }
  }
  if (worstLeg > SLACK) out.push(`${tag}: leg through ${outfit} by ${(worstLeg * 1000).toFixed(0)} mm${(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CLIP_AT ? ' @' + legAt : ''}`);
  if (worstArm > SLACK) out.push(`${tag}: arm into the body by ${(worstArm * 1000).toFixed(0)} mm${(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CLIP_AT ? ' @' + armAt : ''}`);
}

describe('classic figures never clip', () => {
  for (const { name, look } of LOOKS) {
    it(name, () => {
      const outfit = figureOf(look).outfit;
      const out: string[] = [];
      const v = new CharacterView(look);
      v.leans = false;
      for (const speed of [1.2, 2.2, 3.4, 5]) {
        for (let t = 0; t < 1.6; t += 1 / 30) { v.update(1 / 30, speed); if (t > 0.5) measure(v, outfit, false, out, `walk ${speed}`); }
      }
      for (let t = 0; t < 1; t += 1 / 30) { v.update(1 / 30, 0); measure(v, outfit, false, out, 'stand'); }
      v.setCarrying(true);
      for (let t = 0; t < 1.2; t += 1 / 30) { v.update(1 / 30, t < 0.6 ? 2.2 : 0); measure(v, outfit, false, out, 'carry'); }
      v.setCarrying(false);
      for (const g of GESTURES) {
        v.act(g, 2);
        for (let t = 0; t < 1.2; t += 1 / 30) { v.update(1 / 30, 0); measure(v, outfit, false, out, `act ${g}`); }
      }
      v.setPose('sit');
      for (let t = 0; t < 1; t += 1 / 30) { v.update(1 / 30, 0); measure(v, outfit, true, out, 'sit'); }
      const worst = new Map<string, string>();
      for (const s of out) { const k = s.replace(/ by \d+ mm.*/, ''); const prev = worst.get(k); if (!prev || Number(s.match(/(\d+) mm/)![1]) > Number(prev.match(/(\d+) mm/)![1])) worst.set(k, s); }
      expect([...worst.values()]).toEqual([]);
    });
  }
});
