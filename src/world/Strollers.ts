import * as THREE from 'three';
import { CharacterView, type CharacterAction, type CharacterLook } from './CharacterView';
import { FLOOR_Y } from './CarriageView';
import { BAYS, PLATFORM } from './platformLayout';

/**
 * Session 56 (owner: "it should have people roaming around who are essentially not passengers… it should feel like
 * we are part of the station rather than making the station our own"): townsfolk who are not travelling. They come
 * out of the station house, stroll down the platform's clear walkway, stop at the shops along the back lane (the
 * newsstand, the benches, the Train Works, the posters, the market corner, the fruit kiosk once it is there) to browse
 * a while, then wander back and go home, and someone else comes out. Visual only: nothing here is solid, nobody uses
 * game randomness, and they stand still while the conductor is close (`PAUSE_NEAR`), so they never get in the way.
 */

/**
 * The most strollers there can be (Phase 4c: how many walk is the quality tier's `strollers`, for looks only), and
 * the pause before someone new comes out of the station house.
 */
const MAX_COUNT = 8;
const AWAY_SECONDS: [number, number] = [3, 9];
/** Their walking pace (m/s), how long they browse a stop, and how many stops before they go home. */
const WALK_SPEED = 1.0;
const BROWSE_SECONDS: [number, number] = [3.5, 7.5];
const STOPS_PER_VISIT: [number, number] = [2, 4];
/** They stop walking while the conductor is this close to their next step. */
const PAUSE_NEAR = 0.9;
/** The walkway's line they keep to (inside the clear lane, off the travellers' line at X+4.6). */
const LANE_DX = 5.05;

const LOOKS: CharacterLook[] = [
  { body: '#C9774A', accent: '#F4EEE2', skin: '#E8B894', hair: '#6A4428', pants: '#4A3E36', hat: 'none', arms: true, longHair: true },
  { body: '#5C7A9A', accent: '#E8D29A', skin: '#A86E4E', hair: '#1D1616', pants: '#2E3442', hat: 'cap', hatColor: '#2F3E5C', arms: true },
  { body: '#8A9A5B', accent: '#F2E3C6', skin: '#F1C7A5', hair: '#C9A15A', pants: '#4A4A3A', hat: 'boater', arms: true },
  { body: '#B5546A', accent: '#F4EEE2', skin: '#C98E68', hair: '#2A1C16', pants: '#3A2E36', hat: 'none', arms: true, glasses: true },
  { body: '#E0C27A', accent: '#7A5236', skin: '#EDBE9A', hair: '#8A8A8A', pants: '#5B4A3A', hat: 'none', arms: true, glasses: true },
  { body: '#3F6E5A', accent: '#E2B04A', skin: '#8D5A3C', hair: '#1D1616', pants: '#2A3248', hat: 'cap', hatColor: '#6B4A36', arms: true },
];

interface Stop {
  x: number;
  z: number;
  /** What they do there. */
  idles: CharacterAction[];
  /** Only while this returns true (a shop that has to be bought first). */
  open?: () => boolean;
}

interface Stroller {
  view: CharacterView;
  path: { x: number; z: number }[];
  /** 'away' (in the station house), 'walk', 'browse'. */
  state: 'away' | 'walk' | 'browse';
  timer: number;
  stopsLeft: number;
  lastStop: number;
  act: CharacterAction;
  /** A per-person step through a fixed sequence, so their choices need no game randomness. */
  seq: number;
}

export class Strollers {
  private readonly people: Stroller[] = [];
  private readonly stops: Stop[];
  private readonly home: { x: number; z: number };
  private readonly door: { x: number; z: number };
  /** How many of them come out (the quality tier's choice); the rest stay in the station house. */
  private active = 4;

  constructor(
    group: THREE.Group,
    private readonly x0: number,
    kioskOpen: () => boolean,
  ) {
    const mid = (b: readonly [number, number]): number => (b[0] + b[1]) / 2;
    this.stops = [
      { x: x0 + 5.85, z: mid(BAYS.newsstand), idles: ['read', 'look'] },
      { x: x0 + 5.75, z: BAYS.waiting[0] + 1.6, idles: ['phone', 'look', 'watch'] },
      { x: x0 + 5.75, z: mid(BAYS.kiosk), idles: ['look', 'chat'], open: kioskOpen },
      // Session 57: the coffee cart and the flower seller.
      { x: x0 + 5.75, z: mid(BAYS.coffee), idles: ['look', 'phone'] },
      { x: x0 + 5.8, z: mid(BAYS.flowers), idles: ['look', 'chat'] },
      { x: x0 + 6.05, z: BAYS.smarten[0] + 0.85, idles: ['look', 'watch'] },
      { x: x0 + 5.85, z: BAYS.adverts[0] + 1.3, idles: ['look', 'read'] },
      { x: x0 + 5.7, z: mid(BAYS.market), idles: ['look', 'phone', 'yawn'] },
    ];
    this.home = { x: PLATFORM.houseDoor.x, z: PLATFORM.houseDoor.z };
    this.door = { x: PLATFORM.entrance.x, z: PLATFORM.entrance.z };
    for (let i = 0; i < MAX_COUNT; i++) {
      const view = new CharacterView(LOOKS[i % LOOKS.length]);
      view.leans = false;
      view.root.userData.object = `character:stroller${i}`;
      view.root.visible = false;
      group.add(view.root);
      this.people.push({ view, path: [], state: 'away', timer: 1 + i * 2.5, stopsLeft: 0, lastStop: -1, act: 'look', seq: i * 7 + 3 });
    }
  }

  /** A fixed-sequence pick in [0, 1) for this person (no game randomness). */
  private next(p: Stroller): number {
    p.seq = (p.seq * 16807 + 11) % 2147483647;
    return (p.seq % 1000) / 1000;
  }

  private range(p: Stroller, r: [number, number]): number {
    return r[0] + this.next(p) * (r[1] - r[0]);
  }

  /** How many walk (the quality tier's `strollers`); anyone beyond that goes home at once. */
  setCount(n: number): void {
    this.active = Math.max(0, Math.min(MAX_COUNT, Math.round(n)));
    this.people.forEach((p, i) => {
      if (i < this.active) return;
      p.state = 'away';
      p.timer = 1 + i * 2.5;
      p.view.root.visible = false;
    });
  }

  /** Back to the station house: everyone goes home (a new platform). */
  reset(): void {
    this.people.forEach((p, i) => {
      p.state = 'away';
      p.timer = 1 + i * 2.5;
      p.view.root.visible = false;
    });
  }

  private routeTo(p: Stroller, x: number, z: number): void {
    const at = p.view.root.position;
    const lane = this.x0 + LANE_DX;
    p.path = [{ x: lane, z: at.z }, { x: lane, z }, { x, z }];
  }

  private pickStop(p: Stroller): number {
    const open = this.stops.map((_, i) => i).filter((i) => i !== p.lastStop && (this.stops[i].open?.() ?? true));
    return open[Math.floor(this.next(p) * open.length)] ?? 0;
  }

  /**
   * `playerX`/`playerZ` are the conductor's platform-local position; `waving` while the flag is up (everyone waves
   * the train off).
   */
  update(dt: number, playerX: number, playerZ: number, waving: boolean): void {
    for (let i = 0; i < this.active; i++) {
      const p = this.people[i];
      const v = p.view;
      if (p.state === 'away') {
        if ((p.timer -= dt) > 0) continue;
        v.root.visible = true;
        v.setPosition(this.door.x, FLOOR_Y, this.door.z);
        p.stopsLeft = Math.round(this.range(p, STOPS_PER_VISIT));
        p.lastStop = -1;
        this.goToStop(p);
        continue;
      }
      if (p.state === 'browse') {
        if (waving) v.act('wave', 0.3);
        else v.act(p.act, 0.3);
        if ((p.timer -= dt) <= 0) {
          if (--p.stopsLeft > 0) this.goToStop(p);
          else {
            this.routeTo(p, this.door.x, this.door.z);
            p.path.push({ ...this.home });
            p.state = 'walk';
            p.lastStop = -2;
          }
        }
        v.update(dt, 0);
        continue;
      }
      // Walking the path.
      const target = p.path[0];
      if (!target) {
        if (p.lastStop === -2) {
          p.state = 'away';
          p.timer = this.range(p, AWAY_SECONDS);
          v.root.visible = false;
        } else {
          p.state = 'browse';
          p.timer = this.range(p, BROWSE_SECONDS);
          const stop = this.stops[p.lastStop];
          p.act = stop.idles[Math.floor(this.next(p) * stop.idles.length)] ?? 'look';
          // Face the shop (the back railing).
          v.setFacing(Math.PI / 2);
        }
        v.update(dt, 0);
        continue;
      }
      const pos = v.root.position;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, WALK_SPEED * dt);
      const nx = pos.x + (dx / (dist || 1)) * step;
      const nz = pos.z + (dz / (dist || 1)) * step;
      const near = Math.hypot(nx - playerX, nz - playerZ) < PAUSE_NEAR;
      if (near || waving) {
        if (waving) v.act('wave', 0.3);
        v.update(dt, 0);
        continue;
      }
      if (dist < 0.02) p.path.shift();
      else {
        v.setPosition(nx, FLOOR_Y, nz);
        v.setFacing(Math.atan2(dx, dz));
      }
      v.update(dt, WALK_SPEED);
    }
  }

  private goToStop(p: Stroller): void {
    const i = this.pickStop(p);
    p.lastStop = i;
    const s = this.stops[i];
    // A little apart if someone is already there.
    const taken = this.people.some((o) => o !== p && o.state !== 'away' && o.lastStop === i);
    this.routeTo(p, s.x, s.z + (taken ? 0.7 : 0));
    p.state = 'walk';
  }
}
