import * as THREE from 'three';
import { easeInCubic, easeOutBack, easeOutCubic } from '../core/math';
import type { Rect, Vec2 } from '../core/types';
import { deformTarp, disposeTree, FLOOR_Y, TARP_TIE_Z, type CarriageView } from '../world/CarriageView';
import { CARRIAGE_LENGTH, HALF_WIDTH } from '../world/layout';
import type { World } from './World';

/** What a reveal opens: the lid to lift, the room's light (a dimmer key over a world rectangle), what pops in. */
export interface RevealSpec {
  /** The room's dimmer key (its id). */
  key: string;
  /** The room in world coordinates (its lights). */
  room: Rect;
  center: Vec2;
  /** The lid (with its padlock), already taken off the carriage. */
  lid: THREE.Object3D | null;
  /** What pops into the room (the bed, the washroom's fixtures). */
  furniture: (THREE.Object3D | null | undefined)[];
  /** Which kind of room (cabin, washroom): the first of each kind gets the long reveal. */
  kind: string;
}

/** The opening's covered carriage coming open (session 23). */
export interface CarriageRevealSpec {
  view: CarriageView;
  /** The canvas sheet over it, already taken off the carriage. */
  tarp: THREE.Mesh | null;
  /** The carriage's front (world z). */
  originZ: number;
  /** The beds (and anything else) that pop in as the lights come on. */
  furniture: (THREE.Object3D | null | undefined)[];
  /** The dimmer key that kept the carriage dark. */
  key: string;
  /** The doors open and the travellers may board. */
  done: () => void;
}

/** Light slices along a revealed carriage: they come on one after another, front to back. */
const CARRIAGE_SLICES = 6;

/**
 * Opening a covered room (session 22; session 23, owner: "the reveal of the rooms should be far, far better, more
 * detailed animation"), reusable for any room. The padlock wiggles, springs open and hops off onto the floor; the lid
 * lifts with a wobble, tilts away and dissolves in a puff of dust; the lights flicker on; the furniture drops in
 * piece by piece with a bounce; a ring of sparkle and a chime. The first time a kind of room opens it plays the long
 * version (and the camera eases closer); after that the short one. Tunables: `reveal` in economy.ts.
 *
 * The opening's carriage has its own, bigger show (`carriage`): its canvas sheet billows, the ropes snap, it slides
 * off in a cloud of dust, the lights come on along the carriage, the blinds roll up one by one, the beds pop in and
 * the doors open with a fanfare.
 */
export class Reveal {
  /** Rooms whose lights the reveal is flickering on right now (TrainState leaves their dimmer alone). */
  readonly lighting = new Set<string>();
  /** A reveal is playing (the opening's carriage): nothing else claims the camera meanwhile. */
  busy = false;

  constructor(private readonly w: World) {}

  play(spec: RevealSpec): void {
    const w = this.w;
    const rules = w.econ.reveal;
    const flag = `revealed_${spec.kind}`;
    const long = !w.flag(flag);
    if (long) {
      w.data.profile.flags[flag] = true;
      w.save.markDirty();
    }
    const seconds = long ? rules.longSeconds : rules.shortSeconds;
    const at = (share: number): number => seconds * share;
    const { room } = spec;
    const lid = spec.lid;

    // 1. The padlock: a wiggle, the shackle springs up, and it hops off the lid onto the floor and fades.
    const lock = lid?.getObjectByName('padlock') ?? null;
    const shackle = lid?.getObjectByName('shackle') ?? null;
    if (lid && lock) {
      w.audio.play('click', { volume: 0.7 });
      w.tweens.run(at(rules.lockShare), (t) => {
        lock.rotation.z = Math.sin(t * Math.PI * 6) * 0.22 * (1 - t);
      });
      w.tweens.delay(at(rules.lockShare), () => {
        w.audio.play('unlock', { volume: 0.55 });
        if (shackle) w.tweens.run(0.18, (t) => {
          shackle.position.y = 0.25 + 0.07 * t;
          shackle.rotation.y = 1.3 * t;
        }, { ease: easeOutBack });
        // Off it hops (no longer riding on the lid): up, over the edge, down to the floor with a bounce, then gone.
        const holder = lid.parent;
        holder?.attach(lock);
        const from = lock.position.clone();
        const drop = FLOOR_Y + 0.02 - from.y;
        const side = (room.x1 - room.x0) / 2 + 0.25;
        w.tweens.run(at(rules.lockShare * 1.4), (t) => {
          const hop = t < 0.75 ? t / 0.75 : 1;
          const bounce = t < 0.75 ? 0 : Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.08;
          lock.position.set(from.x - side * hop, from.y + Math.sin(hop * Math.PI) * 0.45 + drop * hop * hop + bounce, from.z + 0.2 * hop);
          lock.rotation.x = hop * 2.4;
        }, {
          complete: () => {
            const p = lock.getWorldPosition(new THREE.Vector3());
            w.audio.play('pop', { volume: 0.5, pitch: 1.4 });
            w.particles.emit('sparkle', p.x, p.y + 0.1, p.z, 6, 0.2);
            lock.parent?.remove(lock);
            disposeTree(lock);
          },
        });
      });
    }

    // 2. The lid lifts, wobbles and tilts away, then dissolves into dust along the room's walls.
    if (lid) {
      const lift = at(rules.lidShare);
      const start = lid.position.y;
      w.tweens.delay(at(rules.lidAt), () => {
        w.audio.play('whoosh', { volume: 0.6 });
        w.tweens.run(lift, (t) => {
          lid.position.y = start + rules.lidLift * easeOutCubic(t);
          lid.rotation.x = Math.sin(t * Math.PI * 3) * 0.05 * (1 - t) + t * 0.18;
          lid.rotation.z = -t * 0.12;
          const fade = Math.max(0, (t - 0.55) / 0.45);
          lid.scale.setScalar(Math.max(0.01, 1 - easeInCubic(fade)));
        }, {
          complete: () => {
            lid.parent?.remove(lid);
            disposeTree(lid);
            this.dustRing(room, long ? 3 : 2);
            w.particles.emit('sparkle', spec.center.x, FLOOR_Y + 0.9, spec.center.z, long ? 26 : 14, 0.8);
          },
        });
      });
    }

    // 3. The lights flicker on, one blink after another, then stay on.
    this.flickerOn(spec.key, room, at(rules.lightsAt), seconds * (1 - rules.lightsAt), long);

    // 4. The furniture drops in, piece by piece, with a bounce and a sparkle each; then a ring of sparkle and a chime.
    spec.furniture.forEach((object, i) => {
      if (!object) return;
      object.visible = false;
      w.tweens.delay(at(rules.furnitureAt) + i * 0.14, () => {
        object.visible = true;
        this.dropIn(object);
        const p = object.getWorldPosition(new THREE.Vector3());
        w.particles.emit('sparkle', p.x, FLOOR_Y + 0.5, p.z, 10, 0.4);
        w.audio.play('pop', { volume: 0.5, pitch: 1 + i * 0.12 });
      });
    });
    w.tweens.delay(at(rules.furnitureAt) + 0.35, () => {
      this.sparkleRing(room);
      w.audio.play('chime');
      w.audio.play('sparkle', { volume: 0.7 });
    });

    // The first of its kind: the camera eases in to watch.
    if (long) w.stage.rig.focusOn(this.focus(spec.center), seconds + 0.6, rules.zoom);
  }

  /**
   * The opening's carriage (session 23): the canvas billows and its ropes snap, it slides off toward the lake in a
   * cloud of dust, the lights come on along the carriage, the blinds roll up one after another, the beds pop in, and
   * the doors open with a fanfare. About four seconds; the camera pulls back to watch the whole carriage.
   */
  carriage(spec: CarriageRevealSpec): void {
    const w = this.w;
    const rules = w.econ.reveal.carriage;
    const { view, tarp, originZ } = spec;
    const room: Rect = { x0: -HALF_WIDTH, z0: originZ, x1: HALF_WIDTH, z1: originZ + CARRIAGE_LENGTH };
    const center = { x: 0.6, z: originZ + CARRIAGE_LENGTH * 0.42 };
    this.busy = true;
    w.stage.rig.focusOn(this.focus(center), rules.seconds + 0.8, rules.zoom, 1.6);
    w.audio.play('whoosh', { volume: 0.7, pitch: 0.8 });

    // The canvas: billow, ropes snap front to back (a puff and a pop each), then it slides off and drops away.
    if (tarp) {
      let gone = 0;
      w.tweens.run(rules.tarpSeconds, (t) => {
        const ropes = Math.min(TARP_TIE_Z.length, Math.max(0, Math.floor((t - rules.ropesFrom) / rules.ropeEvery)));
        while (gone < ropes) {
          const z = originZ + TARP_TIE_Z[gone];
          w.particles.emit('dust', 0, FLOOR_Y + 2.3, z, 8, 0.4);
          w.audio.play('pop', { volume: 0.55, pitch: 0.8 + gone * 0.08 });
          gone++;
        }
        deformTarp(tarp, t, gone);
      }, {
        complete: () => {
          tarp.parent?.remove(tarp);
          tarp.geometry.dispose();
        },
      });
      // The cloud of dust as it slides off.
      w.tweens.delay(rules.tarpSeconds * 0.4, () => {
        w.audio.play('whoosh', { volume: 0.8 });
        w.stage.rig.shake(0.08, 0.25);
        for (let i = 0; i <= 6; i++) w.particles.emit('dust', -HALF_WIDTH - 0.3, FLOOR_Y + 1.8, originZ + (CARRIAGE_LENGTH * i) / 6, 9, 0.7);
      });
    }

    // The lights, slice by slice along the carriage, each with a flicker.
    w.stage.dimmer.set(spec.key, room.x0, room.z0, room.x1, room.z1, 1);
    this.lighting.add(spec.key);
    const slice = CARRIAGE_LENGTH / CARRIAGE_SLICES;
    for (let i = 0; i < CARRIAGE_SLICES; i++) {
      const r: Rect = { x0: room.x0, z0: originZ + slice * i, x1: room.x1, z1: originZ + slice * (i + 1) };
      this.flickerOn(`${spec.key}:${i}`, r, rules.lightsAt + i * rules.lightEvery, 0.55, true);
    }
    w.tweens.delay(rules.lightsAt + CARRIAGE_SLICES * rules.lightEvery + 0.6, () => this.lighting.delete(spec.key));

    // The blinds roll up one after another.
    w.tweens.delay(rules.blindsAt, () => {
      w.tweens.run(rules.blindSeconds, (t) => view.setBlindSweep(t), {
        complete: () => {
          view.setAllBlinds(0);
          view.setBlindSweep(null);
        },
      });
    });

    // The beds drop in as their lights come on.
    spec.furniture.forEach((object, i) => {
      if (!object) return;
      object.visible = false;
      w.tweens.delay(rules.furnitureAt + i * 0.22, () => {
        object.visible = true;
        this.dropIn(object);
        const p = object.getWorldPosition(new THREE.Vector3());
        w.particles.emit('sparkle', p.x, FLOOR_Y + 0.6, p.z, 14, 0.5);
        w.audio.play('pop', { volume: 0.6, pitch: 1.1 + i * 0.1 });
      });
    });

    // The doors slide open with a fanfare: all aboard.
    w.tweens.delay(rules.seconds, () => {
      this.busy = false;
      spec.done();
      w.audio.play('fanfare');
      w.haptics.success();
      w.stage.rig.shake(0.12, 0.3);
      this.sparkleRing(room);
      w.particles.emit('confetti', 3.2, FLOOR_Y + 2.6, originZ + 1.5, 60, 1.2);
      w.particles.emit('star', 2.8, FLOOR_Y + 1.6, originZ + 1.5, 14, 0.6);
    });
  }

  /** A room's lights come on: dark, then a few blinks (the long way) or one, then full. */
  private flickerOn(key: string, room: Rect, start: number, span: number, long: boolean): void {
    const w = this.w;
    const rules = w.econ.reveal;
    this.lighting.add(key);
    const dimmer = w.stage?.dimmer;
    dimmer?.set(key, room.x0, room.z0, room.x1, room.z1, 0);
    const steps = long ? rules.flicker : rules.flicker.slice(-2);
    const each = span / steps.length;
    steps.forEach((level, i) => w.tweens.delay(start + each * i, () => {
      dimmer?.set(key, room.x0, room.z0, room.x1, room.z1, level);
      if (level > 0.5 && i === 0) w.audio.play('click', { volume: 0.25, pitch: 1.3 });
    }));
    w.tweens.delay(start + each * steps.length, () => {
      this.lighting.delete(key);
      dimmer?.set(key, room.x0, room.z0, room.x1, room.z1, 1);
    });
  }

  /** Drops something in from a little above with a squash on landing (furniture arriving). */
  private dropIn(object: THREE.Object3D): void {
    const y = object.position.y;
    object.position.y = y + 0.6;
    object.scale.set(0.6, 1.25, 0.6);
    this.w.tweens.run(0.42, (t) => {
      const fall = Math.min(1, t / 0.55);
      object.position.y = y + 0.6 * (1 - fall * fall);
      if (t < 0.55) object.scale.set(0.6 + 0.4 * fall, 1.25 - 0.25 * fall, 0.6 + 0.4 * fall);
      else {
        const s = Math.sin(((t - 0.55) / 0.45) * Math.PI) * 0.14;
        object.scale.set(1 + s, 1 - s, 1 + s);
      }
    }, { complete: () => {
      object.position.y = y;
      object.scale.set(1, 1, 1);
    } });
  }

  /** Dust along a room's walls as its lid goes. */
  private dustRing(room: Rect, per: number): void {
    const w = this.w;
    const y = FLOOR_Y + 0.7;
    for (let i = 0; i <= per; i++) {
      const u = i / per;
      w.particles.emit('dust', room.x0 + (room.x1 - room.x0) * u, y, room.z0, 3, 0.25);
      w.particles.emit('dust', room.x0 + (room.x1 - room.x0) * u, y, room.z1, 3, 0.25);
      w.particles.emit('dust', room.x0, y, room.z0 + (room.z1 - room.z0) * u, 3, 0.25);
      w.particles.emit('dust', room.x1, y, room.z0 + (room.z1 - room.z0) * u, 3, 0.25);
    }
  }

  /** A ring of sparkle round a room: it is ready. */
  private sparkleRing(room: Rect): void {
    const w = this.w;
    const cx = (room.x0 + room.x1) / 2;
    const cz = (room.z0 + room.z1) / 2;
    const rx = (room.x1 - room.x0) / 2;
    const rz = (room.z1 - room.z0) / 2;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      w.particles.emit('sparkle', cx + Math.cos(a) * rx * 0.85, FLOOR_Y + 0.6, cz + Math.sin(a) * rz * 0.85, 2, 0.25);
    }
  }

  private focus(p: Vec2): THREE.Vector3 {
    this.target.set(p.x, 0, p.z);
    return this.target;
  }

  private readonly target = new THREE.Vector3();
}
