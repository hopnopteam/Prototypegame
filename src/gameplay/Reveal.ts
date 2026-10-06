import * as THREE from 'three';
import { easeInCubic } from '../core/math';
import type { Rect, Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/** What a reveal opens: the lid to lift, the room's light (a dimmer key over a world rectangle), what pops in. */
export interface RevealSpec {
  /** The room's dimmer key (its id). */
  key: string;
  /** The room in world coordinates (its lights). */
  room: Rect;
  center: Vec2;
  lid: THREE.Mesh | null;
  /** What pops into the room (the bed, the washroom's fixtures). */
  furniture: (THREE.Object3D | null | undefined)[];
  /** Which kind of room (cabin, washroom, carriage): the first of each kind gets the long reveal. */
  kind: string;
}

/**
 * Opening a covered room (session 22), reusable for any room: the lid lifts and dissolves away, the lights
 * flicker on one by one, the furniture pops in, a sparkle and a chime. The first time a kind of room opens it
 * plays the long version (and the camera eases closer); after that the short one. Tunables: `reveal` in economy.ts.
 */
export class Reveal {
  /** Rooms whose lights the reveal is flickering on right now (TrainState leaves their dimmer alone). */
  readonly lighting = new Set<string>();

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
    const { room } = spec;

    // The lid lifts off and shrinks away into a puff of sparkle.
    const lid = spec.lid;
    if (lid) {
      const lift = seconds * rules.lidShare;
      w.tweens.run(lift, (t) => {
        lid.position.y = rules.lidLift * t;
        lid.scale.setScalar(Math.max(0.01, 1 - t * t));
      }, {
        ease: easeInCubic,
        complete: () => {
          lid.parent?.remove(lid);
          lid.geometry.dispose();
          w.particles.emit('sparkle', spec.center.x, FLOOR_Y + 0.9, spec.center.z, long ? 26 : 14, 0.8);
          w.particles.emit('dust', spec.center.x, FLOOR_Y + 0.6, spec.center.z, 10, 0.6);
        },
      });
    }
    w.audio.play('whoosh', { volume: 0.6 });

    // The lights flicker on, one blink after another, then stay on.
    this.lighting.add(spec.key);
    const dimmer = w.stage?.dimmer;
    dimmer?.set(spec.key, room.x0, room.z0, room.x1, room.z1, 0);
    const steps = long ? rules.flicker : rules.flicker.slice(-2);
    const start = seconds * rules.lightsAt;
    const each = (seconds * (1 - rules.lightsAt)) / steps.length;
    steps.forEach((level, i) => w.tweens.delay(start + each * i, () => dimmer?.set(spec.key, room.x0, room.z0, room.x1, room.z1, level)));
    w.tweens.delay(start + each * steps.length, () => {
      this.lighting.delete(spec.key);
      dimmer?.set(spec.key, room.x0, room.z0, room.x1, room.z1, 1);
    });

    // The furniture pops in, with a chime.
    w.tweens.delay(seconds * rules.furnitureAt, () => {
      for (const object of spec.furniture) if (object) w.train.popIn(object);
      w.particles.emit('sparkle', spec.center.x, FLOOR_Y + 0.6, spec.center.z, 18, 0.6);
      w.audio.play('chime');
      w.audio.play('sparkle', { volume: 0.7 });
    });

    // The first of its kind: the camera eases in to watch.
    if (long) w.stage.rig.focusOn(this.focus(spec.center), seconds + 0.6, rules.zoom);
  }

  private focus(p: Vec2): THREE.Vector3 {
    this.target.set(p.x, 0, p.z);
    return this.target;
  }

  private readonly target = new THREE.Vector3();
}
