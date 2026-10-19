// The suit on screen: a cutout rig of painted pieces (SPEC B8, B14.2) laid out from sim/rig.ts. In flight the rig
// follows the one physics body with springy secondary motion; in a crash every piece follows its ragdoll body.
import { ColorMatrixFilter, Container, Sprite } from 'pixi.js';
import { NOZZLES, PIECES, PIECE_BY_ID, PLATES, type PieceId } from '../sim/rig';
import { plateStates, type PlateState } from '../sim/Damage';
import type { Run } from '../sim/Run';
import type { RigidBody } from '../sim/physics';
import { entry, texture } from './assets';
import { toScreenY } from './Stage';

const PIECE_ART: Record<PieceId, string> = {
  torso: 'suit.w1.base.torso',
  upperArmFar: 'suit.w1.base.upper_arm',
  forearmFar: 'suit.w1.base.forearm',
  thighFar: 'suit.w1.base.thigh',
  bootFar: 'suit.w1.base.boot',
  thighNear: 'suit.w1.base.thigh',
  bootNear: 'suit.w1.base.boot',
  upperArmNear: 'suit.w1.base.upper_arm',
  forearmNear: 'suit.w1.base.forearm',
};
const PLATE_ART = ['suit.w1.plate.chest', 'suit.w1.plate.shoulder', 'suit.w1.plate.hip'];
/** Plates ride on these pieces. */
const PLATE_HOST: PieceId[] = ['torso', 'torso', 'thighNear'];
/** Far limbs are a little darker and cooler, so the near side reads first. */
const FAR_TINT = 0xb4adc2;
const HELMET_OFFSET = { x: 0.02, y: 0.41 };
/** Where dents land on the torso, relative to its centre (cycled through). */
const DENT_SPOTS: readonly [number, number][] = [[0.12, 0.1], [-0.08, -0.18], [0.2, -0.05], [0.0, 0.22], [-0.16, 0.05], [0.14, -0.28]];
const FLASH_SECONDS = 0.045;

export function sizedSprite(id: string): Sprite {
  const e = entry(id);
  const s = new Sprite(texture(id));
  s.anchor.set(e.pivot[0], e.pivot[1]);
  const [w, h] = e.worldSizeM ?? [1, 1];
  s.width = w;
  s.height = h;
  return s;
}

/** A body's last-step transform, for smooth drawing between 120 Hz steps. */
class Track {
  px = 0;
  py = 0;
  pa = 0;
  constructor(readonly body: RigidBody) {
    this.capture();
  }
  capture(): void {
    const p = this.body.translation();
    this.px = p.x;
    this.py = p.y;
    this.pa = this.body.rotation();
  }
  sample(alpha: number): { x: number; y: number; a: number } {
    const p = this.body.translation();
    const a = this.body.rotation();
    let da = a - this.pa;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return { x: this.px + (p.x - this.px) * alpha, y: this.py + (p.y - this.py) * alpha, a: this.pa + da * alpha };
  }
}

/** A spring-driven angle for secondary motion (limbs that lag and wobble). */
class Swing {
  angle = 0;
  vel = 0;
  step(target: number, dt: number, k = 110, c = 12): void {
    this.vel += (k * (target - this.angle) - c * this.vel) * dt;
    this.angle += this.vel * dt;
  }
}

interface Flame {
  outer: Sprite;
  mid: Sprite;
  core: Sprite;
  glow: Sprite;
}

export class SuitView {
  /** In the actors layer: the flight rig, or the loose pieces in a crash. */
  readonly root = new Container();
  readonly rig = new Container();
  private readonly nodes = {} as Record<PieceId, Container>;
  private readonly plates: Sprite[] = [];
  private readonly loosePlates: Sprite[] = [];
  private readonly dents = new Container();
  private readonly flames: Flame[] = [];
  private readonly backGlow: Sprite;
  private readonly flash = new ColorMatrixFilter();
  private flashLeft = 0;
  private dentCount = 0;
  private plateState: PlateState[] = ['full', 'full', 'full'];
  private run: Run | null = null;
  private track: Track | null = null;
  private pieceTracks: Track[] = [];
  private plateTracks: Track[] = [];
  private ragdollShown = false;
  private facing = 1;
  private flip = 1;
  private readonly swings = {
    armFar: new Swing(), foreFar: new Swing(), armNear: new Swing(), foreNear: new Swing(),
    thighFar: new Swing(), bootFar: new Swing(), thighNear: new Swing(), bootNear: new Swing(),
  };
  private lastAngVel = 0;
  private time = 0;
  /** Called when a plate breaks off in flight (the effects drop a falling plate). */
  onPlateLost: ((index: number, x: number, y: number) => void) | null = null;

  constructor() {
    // White silhouette for the 40 ms impact flash (SPEC B11).
    this.flash.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    for (const def of PIECES) {
      const node = new Container();
      const sprite = sizedSprite(PIECE_ART[def.id]);
      if (def.id.endsWith('Far')) sprite.tint = FAR_TINT;
      node.addChild(sprite);
      this.nodes[def.id] = node;
    }
    for (const def of [...PIECES].sort((a, b) => a.layer - b.layer)) this.rig.addChild(this.nodes[def.id]);

    const torso = this.nodes.torso;
    this.backGlow = sizedSprite('vfx.glow');
    this.backGlow.blendMode = 'add';
    this.backGlow.tint = 0xffb547;
    this.backGlow.position.set(-0.42, 0);
    this.backGlow.width = this.backGlow.height = 0.5;
    torso.addChildAt(this.backGlow, 0);
    const helmet = sizedSprite('suit.w1.base.helmet');
    helmet.position.set(HELMET_OFFSET.x, -HELMET_OFFSET.y);
    torso.addChild(helmet, this.dents);

    PLATES.forEach((plate, i) => {
      const host = PIECE_BY_ID[PLATE_HOST[i]];
      const s = sizedSprite(PLATE_ART[i]);
      s.position.set(plate.cx - host.cx, -(plate.cy - host.cy));
      this.nodes[PLATE_HOST[i]].addChild(s);
      this.plates.push(s);
      const loose = sizedSprite(PLATE_ART[i]);
      loose.visible = false;
      this.loosePlates.push(loose);
    });

    // Flames hang from each boot's nozzle, behind the boot.
    (['bootFar', 'bootNear'] as const).forEach((bootId, i) => {
      const boot = PIECE_BY_ID[bootId];
      const node = this.nodes[bootId];
      const at = { x: NOZZLES[i].x - boot.cx, y: -(NOZZLES[i].y - boot.cy) };
      const glow = sizedSprite('vfx.glow');
      glow.blendMode = 'add';
      glow.tint = 0xff9a3a;
      const outer = sizedSprite('vfx.flame.outer');
      const mid = sizedSprite('vfx.flame.mid');
      const core = sizedSprite('vfx.flame.core');
      outer.blendMode = mid.blendMode = core.blendMode = 'add';
      for (const s of [glow, outer, mid, core]) s.position.set(at.x, at.y);
      glow.position.y += 0.15;
      node.addChildAt(glow, 0);
      node.addChildAt(outer, 1);
      node.addChildAt(mid, 2);
      node.addChildAt(core, 3);
      this.flames.push({ outer, mid, core, glow });
    });

    this.root.addChild(this.rig, ...this.loosePlates);
  }

  /** A new run: back to one whole suit. */
  attach(run: Run): void {
    this.run = run;
    this.track = new Track(run.suit.body);
    this.pieceTracks = [];
    this.plateTracks = [];
    this.ragdollShown = false;
    this.dents.removeChildren();
    this.dentCount = 0;
    this.plateState = ['full', 'full', 'full'];
    this.plates.forEach((p) => {
      p.visible = true;
      p.tint = 0xffffff;
      p.rotation = 0;
    });
    for (const loose of this.loosePlates) loose.visible = false;
    for (const def of PIECES) {
      const node = this.nodes[def.id];
      node.scale.set(1);
      this.rig.addChild(node);
    }
    for (const def of [...PIECES].sort((a, b) => a.layer - b.layer)) this.rig.addChild(this.nodes[def.id]);
    this.rig.visible = true;
    this.rig.filters = null;
    this.flashLeft = 0;
    this.facing = this.flip = run.suit.facing;
    for (const s of Object.values(this.swings)) {
      s.angle = 0;
      s.vel = 0;
    }
  }

  /** Before each sim step: remember where every body was. */
  capture(): void {
    this.track?.capture();
    for (const t of this.pieceTracks) t.capture();
    for (const t of this.plateTracks) t.capture();
  }

  hitFlash(): void {
    this.flashLeft = FLASH_SECONDS;
    this.rig.filters = [this.flash];
  }

  addDent(): void {
    const spot = DENT_SPOTS[this.dentCount % DENT_SPOTS.length];
    this.dentCount++;
    const dent = sizedSprite('vfx.dent');
    dent.position.set(spot[0], -spot[1]);
    dent.rotation = this.dentCount * 1.7;
    this.dents.addChild(dent);
  }

  /** Where a point on the suit (suit frame, facing right) is in the world right now. */
  worldPoint(lx: number, ly: number, alpha = 1): { x: number; y: number } {
    if (!this.track) return { x: 0, y: 0 };
    const { x, y, a } = this.track.sample(alpha);
    const fx = lx * this.facing;
    return { x: x + Math.cos(a) * fx - Math.sin(a) * ly, y: y + Math.sin(a) * fx + Math.cos(a) * ly };
  }

  /** The torso's position (ragdoll or flight), for the camera and the tow cable. */
  torsoPoint(): { x: number; y: number } {
    const node = this.nodes.torso;
    if (this.ragdollShown) return { x: node.x, y: -node.y };
    return this.worldPoint(PIECE_BY_ID.torso.cx, PIECE_BY_ID.torso.cy);
  }

  render(alpha: number, dt: number): void {
    const run = this.run;
    if (!run) return;
    this.time += dt;
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) this.rig.filters = null;
    }
    if (run.ragdoll && !this.ragdollShown) this.showRagdoll();
    if (this.ragdollShown) {
      this.renderRagdoll(alpha);
      return;
    }
    if (!this.track) return;
    const suit = run.suit;
    const { x, y, a } = this.track.sample(alpha);

    // Facing flips with a quick squash.
    if (suit.facing !== this.facing) this.facing = suit.facing;
    this.flip += (this.facing - this.flip) * Math.min(1, dt * 18);
    const squash = 1 - 0.12 * (1 - Math.abs(this.flip));
    this.rig.scale.set(Math.abs(this.flip) < 0.05 ? 0.05 * Math.sign(this.flip || 1) : this.flip, squash);
    this.rig.position.set(x, toScreenY(y));
    this.rig.rotation = -a;

    // Sputter shakes the whole suit.
    if (suit.heat.sputterLeft > 0) {
      this.rig.position.x += (Math.random() - 0.5) * 0.05;
      this.rig.position.y += (Math.random() - 0.5) * 0.05;
    }

    // Secondary motion: arms trail the thrust and the turn; legs dangle in the air and bend on landing.
    const v = suit.body.linvel();
    const w = suit.body.angvel();
    const angAcc = (w - this.lastAngVel) / Math.max(dt, 1e-3);
    this.lastAngVel = w;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const forward = (v.x * cos + v.y * sin) * this.facing;
    const upward = -v.x * sin + v.y * cos;
    const thrust = suit.thrust;
    const airborne = suit.grounded ? 0 : 1;
    const wob = Math.sin(this.time * 7.3) * 0.04 * thrust;
    const s = this.swings;
    s.armFar.step(-0.3 * thrust - 0.03 * upward - 0.04 * forward - 0.004 * angAcc * this.facing + wob, dt);
    s.armNear.step(-0.22 * thrust - 0.03 * upward - 0.04 * forward - 0.004 * angAcc * this.facing - wob, dt);
    s.foreFar.step(0.35 + 0.35 * thrust, dt);
    s.foreNear.step(0.45 + 0.3 * thrust, dt);
    s.thighFar.step(0.12 * airborne - 0.02 * forward, dt, 140, 14);
    s.thighNear.step(-0.06 * airborne - 0.02 * forward, dt, 140, 14);
    s.bootFar.step(-0.18 * airborne, dt, 140, 14);
    s.bootNear.step(-0.1 * airborne, dt, 140, 14);
    this.placeChain('upperArmFar', 'forearmFar', s.armFar.angle, s.foreFar.angle);
    this.placeChain('upperArmNear', 'forearmNear', s.armNear.angle, s.foreNear.angle);
    this.placeChain('thighFar', 'bootFar', s.thighFar.angle, s.bootFar.angle);
    this.placeChain('thighNear', 'bootNear', s.thighNear.angle, s.bootNear.angle);
    const torso = this.nodes.torso;
    torso.position.set(PIECE_BY_ID.torso.cx, -PIECE_BY_ID.torso.cy);
    torso.rotation = 0;

    this.renderFlames(thrust, suit.heat.sputterLeft > 0, suit.heat.heat);
    this.updatePlates(suit.integrity, suit.params.plates);
  }

  private placeChain(upperId: PieceId, lowerId: PieceId, a1: number, a2: number): void {
    const up = PIECE_BY_ID[upperId];
    const low = PIECE_BY_ID[lowerId];
    const j1 = up.joint!;
    const j2 = low.joint!;
    const rot = (px: number, py: number, ang: number) => [px * Math.cos(ang) - py * Math.sin(ang), px * Math.sin(ang) + py * Math.cos(ang)];
    const [ux, uy] = rot(up.cx - j1.x, up.cy - j1.y, a1);
    this.setNode(upperId, j1.x + ux, j1.y + uy, a1);
    const [ex, ey] = rot(j2.x - j1.x, j2.y - j1.y, a1);
    const elbow = { x: j1.x + ex, y: j1.y + ey };
    const [lx, ly] = rot(low.cx - j2.x, low.cy - j2.y, a1 + a2);
    this.setNode(lowerId, elbow.x + lx, elbow.y + ly, a1 + a2);
  }

  private setNode(id: PieceId, x: number, y: number, angle: number): void {
    const node = this.nodes[id];
    node.position.set(x, -y);
    node.rotation = -angle;
  }

  private renderFlames(thrust: number, sputter: boolean, heat: number): void {
    for (const f of this.flames) {
      const flicker = 0.85 + Math.random() * 0.3;
      let power = thrust;
      if (sputter) power *= Math.random() < 0.45 ? 0 : 1.6;
      const len = power > 0.02 ? (0.35 + 0.75 * power) * flicker : 0;
      const visible = len > 0;
      for (const s of [f.outer, f.mid, f.core]) s.visible = visible;
      f.glow.visible = visible;
      if (!visible) continue;
      const e = (id: string) => entry(id).worldSizeM ?? [1, 1];
      const [ow, oh] = e('vfx.flame.outer');
      const [mw, mh] = e('vfx.flame.mid');
      const [cw, ch] = e('vfx.flame.core');
      f.outer.width = ow * (0.8 + 0.3 * power);
      f.outer.height = oh * len;
      f.mid.width = mw * (0.8 + 0.25 * power);
      f.mid.height = mh * len * (0.9 + Math.random() * 0.2);
      f.core.width = cw;
      f.core.height = ch * len * (0.85 + Math.random() * 0.3);
      f.glow.width = f.glow.height = 0.7 + 0.5 * power;
      f.glow.alpha = 0.35 + 0.35 * power;
    }
    this.backGlow.alpha = 0.25 + 0.75 * Math.max(0, (heat - 0.5) / 0.5) * (0.8 + 0.2 * Math.sin(this.time * 20));
  }

  private updatePlates(integrity: number, plates: number): void {
    const states = plateStates(integrity, plates);
    for (let i = 0; i < this.plates.length; i++) {
      const state = states[i] ?? 'lost';
      if (state === this.plateState[i]) continue;
      const sprite = this.plates[i];
      if (state === 'lost' && sprite.visible && this.onPlateLost) {
        const plate = PLATES[i];
        const at = this.worldPoint(plate.cx, plate.cy);
        this.onPlateLost(i, at.x, at.y);
      }
      sprite.visible = state !== 'lost';
      sprite.tint = state === 'cracked' ? 0x9a8f9a : 0xffffff;
      sprite.rotation = state === 'cracked' ? 0.18 : 0;
      this.plateState[i] = state;
    }
  }

  private showRagdoll(): void {
    const run = this.run!;
    const ragdoll = run.ragdoll!;
    this.ragdollShown = true;
    this.rig.filters = null;
    for (const f of this.flames) for (const s of [f.outer, f.mid, f.core, f.glow]) s.visible = false;
    // The pieces leave the rig and each follows its own body, layered as before.
    const order = [...ragdoll.pieces].sort((p, q) => p.def.layer - q.def.layer);
    for (const piece of order) {
      const node = this.nodes[piece.id];
      node.rotation = 0;
      node.scale.set(ragdoll.facing, 1);
      this.root.addChild(node);
    }
    this.rig.visible = false;
    this.pieceTracks = order.map((p) => new Track(p.body));
    this.pieceOrder = order.map((p) => p.id);
    for (const p of this.plates) p.visible = false;
    this.plateTracks = ragdoll.plates.map((p) => new Track(p.body));
    ragdoll.plates.forEach((p, i) => {
      const s = this.loosePlates[p.index];
      s.visible = true;
      s.scale.x = Math.abs(s.scale.x) * ragdoll.facing;
      this.root.addChild(s);
      void i;
    });
  }

  private pieceOrder: PieceId[] = [];

  private renderRagdoll(alpha: number): void {
    const ragdoll = this.run!.ragdoll!;
    this.pieceTracks.forEach((t, i) => {
      const { x, y, a } = t.sample(alpha);
      const node = this.nodes[this.pieceOrder[i]];
      node.position.set(x, toScreenY(y));
      node.rotation = -a;
    });
    this.plateTracks.forEach((t, i) => {
      const { x, y, a } = t.sample(alpha);
      const s = this.loosePlates[ragdoll.plates[i].index];
      s.position.set(x, toScreenY(y));
      s.rotation = -a;
    });
  }

  /** The Workshop: the suit standing still on its stand (no physics). */
  poseStatic(x: number, y: number, scale: number, facing = 1, time = 0): void {
    this.rig.visible = true;
    this.rig.filters = null;
    this.rig.position.set(x, y);
    // Breathing idle: 1–2% (SPEC B8).
    const breath = 1 + Math.sin(time * 2.2) * 0.012;
    this.rig.scale.set(scale * facing, scale * breath);
    this.rig.rotation = 0;
    const s = this.swings;
    this.placeChain('upperArmFar', 'forearmFar', -0.08 + Math.sin(time * 1.3) * 0.02, 0.3);
    this.placeChain('upperArmNear', 'forearmNear', 0.06 + Math.sin(time * 1.1 + 1) * 0.02, 0.4);
    this.placeChain('thighFar', 'bootFar', 0.02, -0.02);
    this.placeChain('thighNear', 'bootNear', -0.02, 0.0);
    void s;
    const torso = this.nodes.torso;
    torso.position.set(PIECE_BY_ID.torso.cx, -PIECE_BY_ID.torso.cy);
    for (const f of this.flames) for (const sp of [f.outer, f.mid, f.core, f.glow]) sp.visible = false;
    this.backGlow.alpha = 0.35 + 0.15 * Math.sin(time * 3);
  }
}
