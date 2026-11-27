import * as THREE from 'three';
import { ACTIVE_ROUTE } from '../config/routes';
import { TRANSITIONS, type LineTransitionDef, type TransitionBeat } from '../config/lineTransition';
import { CameraPath, type CameraKey } from '../world/CameraPath';
import { FLOOR_Y } from '../world/CarriageView';
import { CARRIAGE_LENGTH, GANGWAY_LENGTH, LOCOMOTIVE_LENGTH, PLATFORM_X0 } from '../world/layout';
import {
  branchX, buildGull, buildPortal, buildShed, buildTarpCarriage, buildWelcome, buildYard, disposeSet, setLever, setPoints, setShedDoors, setSignal,
  type Shed, type Welcome, type Yard,
} from '../world/TransitionSet';
import { canSkip, filePostcard, finishArrival } from '../sim/lineTransition';
import { log } from '../core/log';
import { TransitionUi } from '../ui/TransitionUi';
import type { Game } from './Game';
import type { Sfx } from '../audio/AudioEngine';

/** Where a Debug-sheet preview remembers, across the reload in the tunnel, which transition it is playing. */
export const PREVIEW_KEY = 'nightexpress.transitionPreview';

type Phase = 'idle' | 'hero' | 'lever' | 'depot' | 'tunnel' | 'dark' | 'burst' | 'arrival' | 'chest' | 'postcard';

/**
 * Seconds of each timed beat (the hero shot's and the arrival's come from the route's settings). Stage B tightened them
 * to the brief's 25–35 s for the hero shot and the lever through the arrival (Stage A ran about 40 s).
 */
const LEVER_IN = 1.3;
const LEVER_HOLD = 1.1;
const TUNNEL_DARK = 0.8;
const BURST_LIGHT = 1.0;
const BURST_SLOW = [1.0, 1.7] as const;
const BURST_SLOW_RATE = 0.35;
const APPROACH = 6.0;
/** How fast the engine and its new carriage pull away into the tunnel (metres = rate × seconds²). */
const TUNNEL_PULL = 3.0;
/** How fast the old carriages roll back into the shed (metres = rate × seconds²). */
const ROLL_BACK = 1.6;
/** How long the light takes to ease to the farewell's dusk. */
const DUSK_EASE = 1.4;
/** The welcome band's tempo (beats a second) and how many gulls wheel over the coast. */
const BAND_BEATS = 2.2;
const GULLS = 6;
/** How far behind its stop the train starts, inside the coast's tunnel (metres). */
const EXIT_OFFSET = 58;
const EXIT_MOUTH = 40;
/** The depot's shots: the uncoupling, the shed's doors shutting, the new carriage coupling on. */
const DEPOT_A = 2.0;
const DEPOT_B = 5.3;
const DEPOT_END = 8.0;

const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const smooth = (u: number): number => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };
const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/**
 * The Grand Departure's director (config/lineTransition.ts holds the template, sim/lineTransition.ts the save
 * safety). It plays the beats as one sequence over ordinary play:
 *
 * - on the old route: the hero shot at the grand station (`hero`), then the front page and the golden ticket (the
 *   RouteLine's own); once the player boards, the lever they pull, the depot and the run into the tunnel (`depart`),
 *   ending in the dark where RouteLine writes the save and the page loads again;
 * - on the new route: out of the dark onto the coast, the arrival at the grand station, the chest and the postcard
 *   (`arrive`).
 *
 * It moves the camera itself (`CameraRig.place`), builds its stand-in set pieces when a beat needs them and frees them
 * when the sequence ends, and holds the stick still while it plays. It runs in game time (`update` from `Game.step`),
 * so a fixed-step capture replays it frame for frame. The pacing simulator never meets it (RouteLine's fast path).
 */
export class LineTransition {
  private phase: Phase = 'idle';
  private t = 0;
  /** Seconds since the sequence started (the analytics values and the corner label). */
  private clock = 0;
  private def: LineTransitionDef | null = ACTIVE_ROUTE.transition ?? null;
  /** A Debug-sheet preview: plays everything, touches no progress. */
  private preview = false;
  private onDone: (() => void) | null = null;
  private readonly ui: TransitionUi;
  private path: CameraPath | null = null;
  private pathT = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private fov = 36;
  private beatsLogged = new Set<string>();
  /** Beat timings for the walkthrough's summary card (seconds since the start). */
  readonly timings: { beat: TransitionBeat; at: number }[] = [];

  private yard: Yard | null = null;
  private shed: Shed | null = null;
  private tarp: THREE.Group | null = null;
  private runner: THREE.Group | null = null;
  private exitPortal: THREE.Group | null = null;
  private welcome: Welcome | null = null;
  private gulls: THREE.Group | null = null;
  private readonly sets: THREE.Object3D[] = [];
  private pull = 0;
  private thrown = false;
  private thrownAt = 0;
  private leverWait = 0;
  private hintShown = false;
  private fireworkTimer = 0;
  private sweepDone = false;
  private plateLanded = false;
  private bandPlayed = false;
  private approach = 0;
  private locoBase = 0;

  constructor(private readonly w: Game) {
    this.ui = new TransitionUi((beat) => this.skip(beat), (dy) => this.dragLever(dy), () => this.releaseLever());
  }

  /** The sequence is on screen (the stick is held, the HUD hidden). */
  get running(): boolean {
    return this.phase !== 'idle';
  }

  get beatName(): Phase {
    return this.phase;
  }

  /** Seconds into the current beat. */
  get beatSeconds(): number {
    return this.t;
  }

  /** Seconds since the sequence started. */
  get seconds(): number {
    return this.clock;
  }

  private get seenBefore(): boolean {
    return this.w.flag('transition_seen');
  }

  // ─── Before the reload ──────────────────────────────────────────────────────

  /** Step 2: the hero shot over the finished train, its fireworks and its sting; `done` brings the front page. */
  hero(done: () => void, def = this.def, preview = false): void {
    if (!def) {
      done();
      return;
    }
    this.def = def;
    this.preview = preview;
    this.clock = 0;
    this.timings.length = 0;
    this.beatsLogged.clear();
    this.onDone = done;
    this.begin();
    const rig = this.w.stage.rig;
    const rear = this.w.map.rearZ;
    const start: CameraKey = { t: 0, pos: [rig.camera.position.x, rig.camera.position.y, rig.camera.position.z], look: [rig.target.x, 0.6, rig.target.z], fov: rig.camera.fov };
    const s = def.farewell.seconds;
    this.path = new CameraPath([
      start,
      { t: s * 0.3, pos: v(17, 19, rear * 0.72 + 10), look: v(-7, 2, rear * 0.62), fov: 42 },
      { t: s * 0.68, pos: v(19, 17, rear * 0.34 + 6), look: v(-7, 2, rear * 0.24), fov: 42 },
      { t: s, pos: v(13, 10, 4), look: v(-4, 2.4, -8), fov: 40 },
    ]);
    this.duskFrom = this.w.stage.lighting.time;
    this.enter('hero');
    this.sound(def.farewell.sting as Sfx);
    this.w.haptics.success();
    this.fireworkTimer = 0;
  }

  /** Steps 4 to 6: the lever, the depot and the run into the tunnel; `onDark` writes the save and reloads. */
  depart(onDark: () => void, def = this.def, preview = this.preview): void {
    if (!def) {
      onDark();
      return;
    }
    this.def = def;
    this.preview = preview;
    this.onDone = onDark;
    if (this.phase === 'idle') {
      this.clock = 0;
      this.timings.length = 0;
      this.beatsLogged.clear();
    }
    this.begin();
    this.holdDusk(false);
    const locoFront = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH;
    this.yard = buildYard(def, locoFront);
    this.addSet(this.yard.group);
    const y = this.yard;
    const lx = y.lever.position.x;
    const lz = y.lever.position.z;
    const rig = this.w.stage.rig;
    this.path = new CameraPath([
      { t: 0, pos: [rig.camera.position.x, rig.camera.position.y, rig.camera.position.z], look: [rig.target.x, 0.6, rig.target.z], fov: rig.camera.fov },
      // Over the lever's shoulder from the lake side, the points and the signal beyond it.
      { t: LEVER_IN, pos: v(lx - 3.4, 2.7, lz + 5.0), look: v(lx + 1.6, 1.2, lz - 3.4), fov: 42 },
    ]);
    this.pull = 0;
    this.thrown = false;
    this.leverWait = 0;
    this.hintShown = false;
    this.enter('lever');
  }

  /** The player's drag on the lever (pixels down since they touched): heavy at first, then it gives. */
  private dragLever(dy: number): void {
    if (this.phase !== 'lever' || this.thrown || this.t < LEVER_IN * 0.6) return;
    const resist = this.def?.lever.resist ?? 0.6;
    const d = clamp01(dy / (window.innerHeight * 0.3));
    this.pull = d < resist ? (d / resist) * 0.42 : 0.42 + ((d - resist) / (1 - resist)) * 0.3;
    if (d >= Math.min(0.98, resist + 0.16)) this.throwLever();
  }

  private releaseLever(): void {
    if (!this.thrown) this.pull = 0;
  }

  /** Throws the lever (from the drag, or the capture's hook): the points switch and the signal clears. */
  throwLever(): void {
    if (this.phase !== 'lever' || this.thrown) return;
    this.thrown = true;
    this.thrownAt = this.t;
    this.ui.leverHint(false);
    this.ui.lever(false);
    this.sound('clunk');
    this.sound('points');
    this.w.haptics.heavy();
    this.w.stage.rig.shake(0.38, 0.55);
    const seconds = Math.max(0, this.t - LEVER_IN);
    this.w.analytics.log('transition_lever', { seconds: Math.round(seconds * 10) / 10 });
    log.info('Transition', `lever pulled after ${seconds.toFixed(1)} s`);
  }

  // ─── After the reload ───────────────────────────────────────────────────────

  /** Steps 7 to 9 on the new line: out of the dark onto the coast, the arrival, the chest and the postcard. */
  arrive(def: LineTransitionDef, preview: boolean): void {
    this.def = def;
    this.preview = preview;
    this.clock = 0;
    this.timings.length = 0;
    this.beatsLogged.clear();
    this.begin();
    this.ui.dark(true, true);
    const train = this.w.train;
    train.group.position.z = EXIT_OFFSET;
    this.exitPortal = buildPortal(def.tunnel.exit);
    this.exitPortal.rotation.y = Math.PI;
    this.exitPortal.position.set(0, 0, EXIT_MOUTH);
    this.addSet(this.exitPortal);
    this.gulls = new THREE.Group();
    for (let i = 0; i < GULLS; i++) this.gulls.add(buildGull());
    this.addSet(this.gulls);
    this.w.characters.hideEveryone = true;
    this.approach = 0;
    this.enter('burst');
    this.sound('depart');
  }

  // ─── The clock ──────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;
    this.clock += dt;
    this.ui.corner(this.phase, this.clock);
    switch (this.phase) {
      case 'hero': this.updateHero(dt); break;
      case 'lever': this.updateLever(dt); break;
      case 'depot': this.updateDepot(); break;
      case 'tunnel': this.updateTunnel(); break;
      case 'dark': this.updateDark(); break;
      case 'burst': this.updateBurst(dt); break;
      case 'arrival': this.updateArrival(dt); break;
      default: break;
    }
    if (this.path) {
      this.pathT += dt;
      this.fov = this.path.sample(this.pathT, this.camPos, this.camLook);
      this.w.stage.rig.place(this.camPos, this.camLook, this.fov);
    }
  }

  /** Where the light was when the farewell began (it eases from there to the farewell's dusk). */
  private duskFrom = 0;

  /** Holds the old line at the farewell's dusk (eased in over `DUSK_EASE` when `ease`). */
  private holdDusk(ease: boolean): void {
    const target = this.def?.farewell.timeOfDay;
    if (target === undefined) return;
    const k = ease ? smooth(this.t / DUSK_EASE) : 1;
    this.w.setTimeOfDay(this.duskFrom + (target - this.duskFrom) * k);
  }

  private updateHero(dt: number): void {
    const def = this.def!;
    this.holdDusk(true);
    this.fireworkTimer -= dt;
    if (this.fireworkTimer <= 0 && this.t > 0.6) {
      this.fireworkTimer = 0.42;
      const n = Math.floor(this.clock * 7);
      const x = -22 - (n % 3) * 6;
      const z = this.camLook.z - 6 + ((n * 37) % 30) - 15;
      this.w.particles.emit('firework', x, 11 + (n % 4) * 2.4, z, 56, 0.4);
      this.w.particles.emit('spark', x, 11 + (n % 4) * 2.4, z, 16, 0.2);
    }
    if (Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3)) this.w.particles.emit('steam', 0, 4.6, -8.4, 3, 0.2);
    if (this.t >= def.farewell.seconds + 0.4) {
      // The front page follows (the RouteLine's own card); the camera goes back to the conductor under it.
      this.end(false);
      const done = this.onDone;
      this.onDone = null;
      done?.();
    }
  }

  private updateLever(dt: number): void {
    const def = this.def!;
    const y = this.yard!;
    if (this.t >= LEVER_IN && !this.thrown) {
      this.ui.lever(true);
      this.leverWait += dt;
      if (this.leverWait >= def.lever.hintAfter && !this.hintShown) {
        this.hintShown = true;
        this.ui.leverHint(true);
      }
      // The capture and the tests have no finger: a hook throws it (the drag still works when there is one).
    }
    let shown = this.pull;
    if (this.thrown) {
      const k = clamp01((this.t - this.thrownAt) / 0.22);
      shown = this.pull + (1 - this.pull) * k;
      setPoints(y.points, smooth((this.t - this.thrownAt) / 0.5));
      if (this.t - this.thrownAt > 0.55) setSignal(y.signal, true);
      if (this.t - this.thrownAt > LEVER_HOLD) this.startDepot();
    }
    setLever(y.lever, shown);
  }

  private startDepot(): void {
    const def = this.def!;
    const rear = this.w.map.rearZ;
    this.shed = buildShed(def, rear + 10);
    this.addSet(this.shed.group);
    this.tarp = buildTarpCarriage(def, CARRIAGE_LENGTH);
    this.tarp.position.set(0, FLOOR_Y - 0.55, 40);
    this.tarp.visible = false;
    this.addSet(this.tarp);
    this.locoBase = this.w.train.loco.group.position.z;
    this.w.characters.hideEveryone = true;
    this.enter('depot');
    // A cut, not a glide (a glide from the lever passed through the engine): side on at the coupling, the tender on one
    // side, the first carriage on the other, the gap opening between them.
    this.path = new CameraPath([
      { t: 0, pos: v(12.6, 4.1, -1.4), look: v(0, 1.3, -0.6), fov: 38 },
      { t: DEPOT_A, pos: v(13.5, 4.4, 0.6), look: v(0, 1.3, 0.8), fov: 38 },
    ]);
  }

  private updateDepot(): void {
    const t = this.t;
    const train = this.w.train;
    const shed = this.shed!;
    // The carriages uncouple and roll back into the shed; the engine stays where it is.
    if (t > 0.7 && this.once('uncouple')) {
      this.sound('clunk');
      this.w.stage.rig.shake(0.12, 0.3);
    }
    const offset = t < 0.8 ? 0 : ROLL_BACK * (t - 0.8) * (t - 0.8);
    if (t < DEPOT_B) {
      train.group.position.z = offset;
      train.loco.group.position.z = this.locoBase - offset;
    }
    if (t >= DEPOT_A && this.pathAt('depotB')) {
      const m = shed.mouthZ;
      this.path = new CameraPath([
        // The whole front of the shed, the train backing in, then holding as the doors close and the plaque shows.
        { t: 0, pos: v(10.5, 3.6, m - 20), look: v(0, 2.4, m + 1), fov: 40 },
        { t: DEPOT_B - DEPOT_A, pos: v(9.0, 3.0, m - 16.5), look: v(0, 2.8, m), fov: 38 },
      ], false);
    }
    if (t >= 4.0 && this.once('dust')) for (let i = 0; i < 5; i++) this.w.particles.emit('dust', -2 + i, 1.2, shed.mouthZ - 1, 18, 0.8);
    setShedDoors(shed, smooth((t - 4.1) / 0.9));
    if (t >= 4.5 && this.once('hideOld')) this.hideOldTrain();
    if (t >= 5.0 && this.once('shut')) {
      this.sound('clunk');
      this.w.stage.rig.shake(0.1, 0.25);
    }
    (shed.plaque.material as THREE.MeshBasicMaterial).opacity = clamp01((t - 5.0) / 0.4);
    // The next line's first carriage rolls up behind the engine, couples, and its tarp blows off.
    if (t >= DEPOT_B && this.pathAt('depotC')) {
      train.group.position.z = 0;
      train.loco.group.position.z = this.locoBase;
      this.tarp!.visible = true;
      this.path = new CameraPath([
        // Three-quarter from behind: the covered carriage rolls up the line to the engine.
        { t: 0, pos: v(9, 5, 30), look: v(0, 1.4, 4), fov: 40 },
        { t: DEPOT_END - DEPOT_B, pos: v(8, 4.6, 22), look: v(0, 1.6, 2), fov: 40 },
      ], false);
    }
    if (t >= DEPOT_B) {
      const u = clamp01((t - DEPOT_B) / 1.4);
      this.tarp!.position.z = 40 * (1 - (1 - (1 - u) * (1 - u)));
      if (u >= 1 && this.once('coupled')) {
        this.sound('clunk');
        this.w.haptics.medium();
        this.w.stage.rig.shake(0.22, 0.35);
        this.w.particles.emit('dust', 0, 0.6, 0, 26, 1.2);
      }
      // The tarp lifts off the coach, billows and is carried away over the lake side.
      const cover = this.tarp!.getObjectByName('tarp')!;
      const k = clamp01((t - DEPOT_B - 1.5) / 1.1);
      const e = k * k;
      cover.position.y = e * 5.5 + Math.sin(k * Math.PI) * 0.6;
      cover.position.x = -e * 9;
      cover.rotation.z = e * 0.85;
      cover.rotation.x = Math.sin(k * Math.PI * 2) * 0.08;
      cover.scale.set(1 + Math.sin(k * Math.PI) * 0.06, 1 - Math.sin(k * Math.PI) * 0.1, 1);
      cover.visible = k < 1;
      if (k > 0 && this.once('tarpOff')) {
        this.sound('whoosh');
        this.w.particles.emit('dust', 0, 2.5, CARRIAGE_LENGTH / 2, 40, 3);
      }
    }
    if (t >= DEPOT_END) this.startTunnel();
  }

  private hideOldTrain(): void {
    const train = this.w.train;
    for (const view of train.views) view.group.visible = false;
    for (const child of train.group.children) if (child !== train.loco.group) child.visible = false;
  }

  private startTunnel(): void {
    const train = this.w.train;
    // The engine and its new carriage become one runner, pivoting about its middle as it takes the branch.
    const runner = new THREE.Group();
    const locoMid = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH / 2;
    runner.position.set(0, 0, locoMid);
    this.w.stage.scene.add(runner);
    train.group.remove(train.loco.group);
    runner.add(train.loco.group);
    train.loco.group.position.set(0, 0, -locoMid);
    this.tarp!.position.z -= locoMid;
    this.tarp!.parent?.remove(this.tarp!);
    runner.add(this.tarp!);
    this.runner = runner;
    this.sets.push(runner);
    this.sound('whistle');
    this.tunnelCue = false;
    this.ui.dawn(0);
    this.enter('tunnel');
    this.path = null;
  }

  private updateTunnel(): void {
    const y = this.yard!;
    const r = this.runner!;
    const t = this.t;
    const s = TUNNEL_PULL * t * t;
    const locoMid = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH / 2;
    const z = locoMid - s;
    r.position.z = z;
    r.position.x = branchX(z, y.pointsZ, y.shift, y.length);
    const ahead = branchX(z - 2, y.pointsZ, y.shift, y.length);
    r.rotation.y = Math.atan2(r.position.x - ahead, 2);
    if (Math.floor(t * 4) !== Math.floor((t - 1 / 60) * 4)) this.w.particles.emit('steam', r.position.x, 4.6, z - 2.4, 4, 0.2);
    if (t > 2.6) this.w.particles.emit('spark', r.position.x + 0.7, 0.3, z + 2, 2, 0.2);
    this.ui.dawn(clamp01(t / 5) * 0.55);
    // The camera rides alongside, then lets the train go on into the hill.
    const camZ = Math.max(y.portalZ + 24, z + 10);
    const camX = branchX(camZ, y.pointsZ, y.shift, y.length) + 11;
    this.camPos.set(camX, 5.2, camZ);
    this.camLook.set(r.position.x, 1.6, Math.max(y.portalZ - 2, z - 7));
    this.w.stage.rig.place(this.camPos, this.camLook, 42);
    if (!this.tunnelCue && z - LOCOMOTIVE_LENGTH / 2 <= y.portalZ + 22) {
      this.tunnelCue = true;
      this.sound('tunnel');
    }
    if (z - LOCOMOTIVE_LENGTH / 2 <= y.portalZ + 0.5) {
      this.ui.dark(true, false);
      this.sound('depart');
      this.enter('dark');
    }
  }

  private tunnelCue = false;

  private updateDark(): void {
    if (this.t < TUNNEL_DARK) return;
    this.phase = 'idle';
    const done = this.onDone;
    this.onDone = null;
    log.info('Transition', `into the dark after ${this.clock.toFixed(1)} s`);
    done?.();
  }

  private updateBurst(dt: number): void {
    const t = this.t;
    const train = this.w.train;
    // A short slow motion just after the light floods in.
    const rate = t > BURST_SLOW[0] && t < BURST_SLOW[1] ? BURST_SLOW_RATE : 1;
    this.approach += dt * rate;
    const p = clamp01(this.approach / APPROACH);
    const eased = 1 - (1 - p) * (1 - p) * (1 - p);
    train.group.position.z = EXIT_OFFSET * (1 - eased);
    const front = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH + train.group.position.z;
    this.ui.burstLight(clamp01(t / BURST_LIGHT));
    if (t >= BURST_LIGHT && this.once('flash')) {
      this.ui.dark(false, false);
      this.ui.flash();
      this.sound('sparkle');
      this.sound('surf');
      this.w.haptics.medium();
      this.w.characters.hideEveryone = false;
    }
    // Inside the tunnel looking out, then swinging round to follow the train down the coast.
    const swing = smooth((t - BURST_LIGHT + 0.2) / 3.0);
    const inside = new THREE.Vector3(2.0, 3.0, EXIT_MOUTH + 3);
    const angle = 0.2 + swing * 1.1;
    const radius = 8 + swing * 9;
    const follow = new THREE.Vector3(Math.sin(angle) * radius + 1, 4 + swing * 5, front + 2 + Math.cos(angle) * radius);
    this.camPos.copy(inside).lerp(follow, smooth((t - 0.3) / 1.4));
    this.camLook.set(0, 2, front - 2 - (1 - swing) * 10);
    this.w.stage.rig.place(this.camPos, this.camLook, 40 + swing * 2);
    animateGulls(this.gulls, this.clock, front);
    if (p >= 0.82) this.startArrival();
  }

  private startArrival(): void {
    const def = this.def!;
    const plateAt = new THREE.Vector3(1.62, 2.1, -6);
    this.welcome = buildWelcome(def, PLATFORM_X0, plateAt.clone().add(new THREE.Vector3(0, 3, 0)));
    this.addSet(this.welcome.group);
    this.enter('arrival');
    this.sweepDone = false;
    this.plateLanded = false;
    this.bandPlayed = false;
    this.path = new CameraPath([
      { t: 0, pos: [this.camPos.x, this.camPos.y, this.camPos.z], look: [this.camLook.x, this.camLook.y, this.camLook.z], fov: this.fov },
      // Along the platform behind the welcome as the engine pulls in beside it, toward the arch, then up and wider.
      { t: 2.2, pos: v(PLATFORM_X0 + 6.0, 4.6, 6), look: v(PLATFORM_X0 + 0.2, 1.6, -10), fov: 42 },
      { t: def.arrival.seconds, pos: v(PLATFORM_X0 + 5.6, 7.8, 11), look: v(PLATFORM_X0 - 0.2, 1.3, -9.5), fov: 44 },
    ]);
  }

  private updateArrival(dt: number): void {
    const def = this.def!;
    const t = this.t;
    const train = this.w.train;
    // The last of the approach: the train eases to its stop.
    this.approach += dt;
    const p = clamp01(this.approach / APPROACH);
    train.group.position.z = EXIT_OFFSET * (1 - (1 - (1 - p) * (1 - p) * (1 - p)));
    const wel = this.welcome!;
    this.animateWelcome(dt);
    for (let i = 0; i < wel.torches.length; i++) wel.torches[i].scale.setScalar(0.85 + 0.2 * Math.abs(Math.sin(this.clock * 9 + i * 2.1)));
    animateGulls(this.gulls, this.clock, train.group.position.z - GANGWAY_LENGTH - LOCOMOTIVE_LENGTH);
    if (t > 0.7 && !this.bandPlayed) {
      this.bandPlayed = true;
      this.sound(def.arrival.sting as Sfx);
      this.w.particles.emit('confetti', PLATFORM_X0 + 2.5, 3.5, -2, 80, 1.4);
    }
    // The livery sweep: sparkles run down the engine as its new colours go on.
    const sweep = clamp01((t - 1.2) / 1.4);
    if (sweep > 0 && sweep < 1) this.w.particles.emit('sparkle', 1.4, 1.2 + ((this.clock * 13.7) % 1) * 2.4, -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH + sweep * (LOCOMOTIVE_LENGTH + CARRIAGE_LENGTH), 3, 0.3);
    if (sweep >= 1 && !this.sweepDone) {
      this.sweepDone = true;
      this.sound('chime');
    }
    // The new name plate drops onto the cab side.
    const drop = clamp01((t - 2.9) / 0.45);
    wel.plate.position.y = 5.1 - 3 * drop * drop;
    if (drop >= 1 && !this.plateLanded) {
      this.plateLanded = true;
      this.sound('clunk');
      this.w.stage.rig.shake(0.08, 0.2);
    }
    if (t >= def.arrival.seconds + 0.3) this.startChest();
  }

  /** The steel band plays on its pans and the locals wave the train in, then cheer as it stops. */
  private animateWelcome(dt: number): void {
    const wel = this.welcome;
    if (!wel) return;
    const beat = this.t * BAND_BEATS;
    wel.people.forEach((view, i) => {
      view.update(dt, 0);
      if (i < 3) {
        view.playInstrument('drum', beat + i * 0.13);
        return;
      }
      // Each local waves in turn, every couple of seconds, and all of them cheer as the plate goes on.
      if (this.t > 2.9 && this.t < 3.0) view.act('cheer', 1.2);
      else if (Math.floor((this.t + i * 0.37) / 1.6) !== Math.floor((this.t + i * 0.37 - dt) / 1.6)) view.act('wave', 1.1);
    });
  }

  private startChest(): void {
    const def = this.def!;
    const w = this.w;
    this.w.train.group.position.z = 0;
    this.enter('chest');
    this.path = null;
    this.sound('chest');
    const c = w.data.conductor;
    this.ui.chest(def, { gems: w.wallet.get('gems'), railMiles: w.wallet.get('railMiles'), conductor: `speed ${c.speed}, carry ${c.capacity}, fares ${c.fareBonus}` }, this.preview, () => this.collectChest());
  }

  private collectChest(): void {
    const def = this.def!;
    const w = this.w;
    const a = w.data.lineArrival;
    if (!this.preview && a && !a.chestPaid) {
      // What `payChest` does, through the wallet (its counters and the analytics hear it); the payment and its mark are
      // written together, so a relaunch never pays it twice.
      a.chestPaid = true;
      w.wallet.add('gems', def.chest.gems, 'lineChest');
      w.wallet.add('railMiles', def.chest.railMiles, 'lineChest');
      w.save.saveNow();
      log.info('Transition', `line-complete chest paid: ${def.chest.gems} gems, ${def.chest.railMiles} Rail Miles`);
    }
    this.startPostcard();
  }

  private startPostcard(): void {
    const def = this.def!;
    this.enter('postcard');
    // Play begins under the postcard: the letterbox lifts, the HUD comes back.
    this.end(true);
    const w = this.w;
    if (!this.preview) {
      filePostcard(w.data);
      finishArrival(w.data, def.chest);
      w.save.saveNow();
    }
    if (!this.preview) w.setFlag('transition_seen');
    w.analytics.log('transition_complete', { seconds: Math.round(this.clock * 10) / 10 });
    this.logTimings();
    this.ui.postcard(def, w.data.routes[archiveId(w, def)] ?? null, () => w.analytics.log('postcard_opened', {}));
  }

  // ─── Skipping ───────────────────────────────────────────────────────────────

  /** Whether the Skip button shows now. */
  private skippable(): boolean {
    const beat = this.phase as TransitionBeat;
    return this.phase !== 'idle' && this.phase !== 'chest' && this.phase !== 'postcard' && this.phase !== 'dark' && canSkip(beat, this.seenBefore, this.preview);
  }

  /** Jumps to the arrival: before the reload, straight into the dark; after it, straight to the chest. */
  skip(beat?: string): void {
    if (!this.skippable()) return;
    this.w.analytics.log('transition_skipped', { beat: beat ?? this.phase, seconds: Math.round(this.clock * 10) / 10 });
    this.w.analytics.log('route_transition_skipped', { route: ACTIVE_ROUTE.id, seconds: Math.round(this.clock * 10) / 10 });
    if (this.phase === 'hero') {
      this.t = this.def!.farewell.seconds + 1;
      return;
    }
    if (this.phase === 'lever' || this.phase === 'depot' || this.phase === 'tunnel') {
      this.ui.dark(true, false);
      this.enter('dark');
      this.t = TUNNEL_DARK;
      return;
    }
    if (this.phase === 'burst' || this.phase === 'arrival') {
      this.ui.dark(false, false);
      this.w.characters.hideEveryone = false;
      if (!this.welcome) this.startArrival();
      this.startChest();
    }
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  private autopilotWas = false;

  /** One of the sequence's own sounds (heard while the world's are hushed). */
  private sound(name: Sfx): void {
    this.w.audio.play(name, { through: true });
  }

  private begin(): void {
    const w = this.w;
    w.audio.hushed = true;
    // The autopilot (tests, the pacing tools) steers through the stick: it waits until the sequence lets go.
    if (w.autopilot.enabled) {
      this.autopilotWas = true;
      w.autopilot.enabled = false;
    }
    w.input.override = { x: 0, y: 0 };
    this.ui.cinematic(true);
    document.body.classList.add('gd-cine');
  }

  /** Lets go of the screen (`final`: the sequence is over; the set pieces go and play resumes everywhere). */
  private end(final: boolean): void {
    const w = this.w;
    this.path = null;
    w.stage.rig.release();
    w.input.override = null;
    if (this.autopilotWas) {
      this.autopilotWas = false;
      w.autopilot.enabled = true;
    }
    w.characters.hideEveryone = false;
    w.audio.hushed = false;
    w.setTimeOfDay(null);
    this.ui.cinematic(false);
    this.ui.lever(false);
    this.ui.leverHint(false);
    this.ui.dawn(0);
    document.body.classList.remove('gd-cine');
    if (!final) {
      this.phase = 'idle';
      return;
    }
    w.train.group.position.z = 0;
    for (const set of this.sets) disposeSet(set);
    this.sets.length = 0;
    this.yard = this.shed = this.welcome = null;
    this.tarp = this.runner = this.exitPortal = this.gulls = null;
    this.phase = 'idle';
    // Back to the conductor, and play.
    w.stage.rig.snapTo(w.player.pos.x, w.player.pos.z);
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
    this.pathT = 0;
    this.ui.skip(this.skippable());
    const caption = this.def?.captions[phase as TransitionBeat];
    this.ui.caption(caption ?? null);
    if (!this.beatsLogged.has(phase)) {
      this.beatsLogged.add(phase);
      this.timings.push({ beat: phase as TransitionBeat, at: Math.round(this.clock * 10) / 10 });
      this.w.analytics.log('transition_beat', { beat: phase, seconds: Math.round(this.clock * 10) / 10 });
    }
  }

  private readonly onceDone = new Set<string>();
  private once(key: string): boolean {
    const k = `${this.phase}:${key}`;
    if (this.onceDone.has(k)) return false;
    this.onceDone.add(k);
    return true;
  }

  /** True the first time a named shot starts in this beat (each shot builds its path once). */
  private pathAt(key: string): boolean {
    if (!this.once(`path:${key}`)) return false;
    this.pathT = 0;
    return true;
  }

  private addSet(object: THREE.Object3D): void {
    this.w.stage.scene.add(object);
    this.sets.push(object);
  }

  private logTimings(): void {
    log.info('Transition', `beats: ${this.timings.map((b) => `${b.beat} ${b.at}s`).join(', ')}; total ${this.clock.toFixed(1)} s`);
  }

  /** The beat the transition for the route being left uses (the Debug sheet's choice). */
  static forRoute(routeId: string): LineTransitionDef | null {
    return TRANSITIONS[routeId] ?? null;
  }
}

/** The archived route the finished train's postcard is drawn from (the route this transition leaves). */
function archiveId(w: Game, def: LineTransitionDef): string {
  const from = Object.entries(TRANSITIONS).find(([, d]) => d === def)?.[0];
  return from ?? w.data.completedRoutes[w.data.completedRoutes.length - 1] ?? '';
}

/** The gulls wheeling over the coast as the train comes out (each a body and two wings that flap). */
function animateGulls(g: THREE.Group | null, time: number, aroundZ: number): void {
  if (!g) return;
  g.children.forEach((bird, i) => {
    const a = time * (0.45 + i * 0.06) + i * 1.7;
    bird.position.set(-6 + Math.cos(a) * (6 + i), 7 + i * 0.7 + Math.sin(a * 2) * 0.6, aroundZ - 6 + Math.sin(a) * (8 + i * 1.6));
    // Heading along their circle (their beaks point -z at rest), banking into the turn.
    bird.rotation.set(0, -a, 0.35);
    const flap = Math.sin(time * 7 + i * 1.3) * 0.55;
    const l = bird.getObjectByName('l');
    const r = bird.getObjectByName('r');
    if (l) l.rotation.z = -flap;
    if (r) r.rotation.z = flap;
  });
}
