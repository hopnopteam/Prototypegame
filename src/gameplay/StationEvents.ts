import * as THREE from 'three';
import { CLASS_BY_ID, type ClassId } from '../config/classes';
import { ACTIVE_ROUTE, type StationEventDef } from '../config/routes';
import { log } from '../core/log';
import type { Vec2 } from '../core/types';
import { EVENTS } from '../services/analytics';
import { criticScore, criticVerdict, nextGap, pickEvent } from '../sim/stationEvents';
import type { CriticSave } from '../save/SaveData';
import { FLOOR_Y } from '../world/CarriageView';
import { GeoBuilder } from '../world/geo';
import { modelEntry } from '../world/models/library';
import { fillGeometries } from '../world/Lakeside';
import { PLATFORM_X0 } from '../world/layout';
import { MATERIALS } from '../world/materials';
import { PALETTE } from '../world/palette';
import { PLATFORM } from '../world/platformLayout';
import { signTexture } from '../world/sprites';
import type { Guest } from './Guests';
import type { Cabin } from './TrainState';
import type { World } from './World';
import { Zone } from './Zones';

/** The sheep bolt once the conductor comes this close, and run at this pace. */
const SHOO_RADIUS = 1.4;
const SHEEP_RUN = 3.6;
/**
 * Phase 3 (found by the pacing simulator): the sheep graze within this stretch of the platform (platform-local z), the
 * open walkway, and turn back at its ends. One used to wander past the platform's end, out of the conductor's reach, and
 * the bell (which waits for every sheep) was never ready.
 */
const SHEEP_Z: [number, number] = [-6, 24];
/** A safety net: sheep still about this long after the rest of the platform is done trot off by themselves. */
const SHEEP_GIVE_UP_SECONDS = 90;
/** Where the Lost & Found item lies, the Station Market's stall and the sheep's pen (platform-local, out from the edge). */
const LOST_SPOT = { dx: 3.6, z: 5.9 };
/** Session 55: the market stall stands in its own bay of the back lane (platformLayout.ts `BAYS.market`). */
const MARKET_SPOT = { dx: 6.4, z: 25.5 };
/** The critic is looked at this often while aboard (seconds). */
const CRITIC_SAMPLE_SECONDS = 3;
/** The critic rides this many legs. */
const CRITIC_LEGS = 2;
/** The critic's look: a tweed jacket, round spectacles and a notebook. */
const CRITIC_LOOK = { body: '#6B5A45', accent: '#E9E2D2', glasses: true, accessory: 'hymnbook', hat: 'bowler', hatColor: '#3A3030' } as const;
/** Festival Day: bright boaters and a buttonhole flower. */
/** Phase 4: the beach party's sun hats. */
const BEACH_HATS = ['#F7F1E6', '#F49AB4', '#FFE45C', '#7FDBFF'];
const FESTIVAL_HATS = ['#E2506B', '#F2B53A', '#4FA3D9', '#7CC36E', '#B36BD6'];

interface Sheep {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  fled: number;
  wander: number;
}

/**
 * Phase 2, special stops and the critic (owner: "special events about one stop in four or five, never back to back,
 * announced with a banner and the station's name… a critic once per route"). Every event and the critic are data on
 * the route (`station.events`, `station.critic` in config/routes.ts); this runs them:
 *
 * - **Rush Hour**: twice the crowd, every bag on the barrow; everyone aboard pays the stop bonus × `bonus`.
 * - **Festival Day**: bunting, travellers in bright boaters; their tips × `tips` for the ride.
 * - **Lost & Found**: a glowing hatbox on the platform; its owner is aboard, and bringing it to their room pays `reward`.
 * - **VIP Arrival**: a red carpet from the station house and a VIP for the best class; they buy their ticket only once a
 *   room of that class is spotless, and pay `fare` × the fare.
 * - **Delayed Connection**: a second wave of travellers comes out of the station house `waveAt` seconds in.
 * - **Station Market**: a stall sells tips × `boost` for `stops` stops, for cash.
 * - **Harvest Fair** (Route 1, Ashford Market): farmers with produce baskets (all of them with bags), tips × `tips`.
 * - **Sheep on the Tracks** (Route 1): sheep on the platform; shoo every one before the bell is ready.
 * - **The critic** (once per route): the Village Gazette's reviewer boards while the train has 3–6 carriages, judges the
 *   tidy rooms, the speed of service and the mood, and their review prints `reviewAfter` stops later as a front page.
 *
 * Debug: `?event=<id>` brings that event at the next stop; `?critic=board` brings the critic at the next stop;
 * `?critic=great|mixed|poor` prints that review a few seconds after loading (`force`, `forceCritic`, `forceReview`).
 */
export class StationEvents {
  /** This stop's event (chosen as the platform comes into view), or null. */
  active: StationEventDef | null = null;
  private activeStop = -1;
  private started = false;
  private forced: string | null = null;
  private criticNext = false;
  private reviewForced: 'great' | 'mixed' | 'poor' | null = null;
  private readonly group = new THREE.Group();
  private propsMesh: THREE.Mesh | null = null;
  private readonly sheep: Sheep[] = [];
  private sheepWait = 0;
  private sheepGeometry: THREE.BufferGeometry | null = null;
  private lostMesh: THREE.Mesh | null = null;
  private lostState: 'none' | 'lying' | 'carried' | 'done' = 'none';
  private lostOwner: Guest | null = null;
  private marketSign: THREE.Mesh | null = null;
  private marketBought = false;
  private waveDue = false;
  private vipGuest: Guest | null = null;
  private criticGuest: Guest | null = null;
  private criticSampleIn = CRITIC_SAMPLE_SECONDS;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly w: World) {
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    this.forced = params?.get('event') ?? null;
    const critic = params?.get('critic');
    if (critic === 'board') this.criticNext = true;
    if (critic === 'great' || critic === 'mixed' || critic === 'poor') this.reviewForced = critic;
  }

  init(): void {
    const w = this.w;
    w.station.view.group.add(this.group);
    this.createZones();
    if (this.reviewForced) {
      const result = this.reviewForced;
      w.tweens.delay(4, () => this.forceReview(result));
    }
  }

  private get rules() {
    return ACTIVE_ROUTE.station;
  }

  private get save() {
    return this.w.data.station;
  }

  // ─── Debug ─────────────────────────────────────────────────────────────────

  /** The next stop brings this event (by id), whatever the spacing. */
  force(id: string): void {
    this.forced = id;
  }

  /** The critic boards at the next stop. */
  forceCritic(): void {
    delete this.save.critic[ACTIVE_ROUTE.id];
    this.criticNext = true;
  }

  /** Prints the critic's review now with this verdict (and applies it). */
  forceReview(result: 'great' | 'mixed' | 'poor'): void {
    const c = this.criticSave() ?? this.newCritic();
    c.status = 'reviewing';
    this.save.critic[ACTIVE_ROUTE.id] = c;
    this.review(c, result);
  }

  // ─── The stop ──────────────────────────────────────────────────────────────

  /** As the platform comes into view: is this a special stop? Returns the crowd's multiplier. */
  prepare(stopSerial: number): number {
    const w = this.w;
    this.clear();
    this.activeStop = stopSerial;
    const s = this.save;
    const stationIndex = w.journey.stationIndex;
    let def: StationEventDef | null = null;
    if (this.forced) {
      def = this.rules.events.find((e) => e.id === this.forced) ?? null;
      this.forced = null;
    } else if (!w.station.prologue && w.flow.allows('crowd')) {
      if (s.eventGap <= 0) s.eventGap = nextGap(this.rules, () => w.rng.next());
      def = pickEvent(this.rules, { stopsCompleted: w.data.route.stopsCompleted, sinceEvent: s.sinceEvent, eventGap: s.eventGap, lastEvent: s.lastEvent, carriages: w.train.count, station: stationIndex }, () => w.rng.next());
    }
    this.active = def;
    let crowd = this.crowdBoost();
    if (def?.kind === 'rushHour' || def?.kind === 'surfContest') crowd *= def.crowd ?? 2;
    return crowd;
  }

  /** Dresses the travellers the station spawned for this stop, and brings any special traveller. */
  dress(guests: Guest[]): void {
    const w = this.w;
    const def = this.active;
    if (def?.kind === 'festival') {
      guests.forEach((g, i) => {
        g.view.setLook({ ...g.view.look, hat: 'boater', hatColor: FESTIVAL_HATS[i % FESTIVAL_HATS.length], accessory: g.view.look.accessory === 'none' || !g.view.look.accessory ? 'flower' : g.view.look.accessory });
        g.tipBoost = def.tips ?? 2;
      });
    }
    if (def?.kind === 'harvest') {
      const farmer = ACTIVE_ROUTE.guestLooks.find((l) => l.id === 'farmer');
      for (const g of guests) {
        if (farmer) g.view.setLook({ ...g.view.look, body: farmer.body ?? g.view.look.body, accent: farmer.accent ?? g.view.look.accent, hat: farmer.hat ?? 'boater', hatColor: farmer.hatColor, accessory: 'basket' });
        g.hasLuggage = w.flow.allows('luggage');
        g.tipBoost = def.tips ?? 1.5;
      }
    }
    if (def?.kind === 'rushHour') for (const g of guests) g.hasLuggage = w.flow.allows('luggage');
    // Phase 4, the Riviera. A beach party at Coral Beach: sun hats and garlands, and they tip like a festival.
    if (def?.kind === 'beachParty') {
      guests.forEach((g, i) => {
        g.view.setLook({ ...g.view.look, hat: 'boater', hatColor: BEACH_HATS[i % BEACH_HATS.length], accessory: g.view.look.accessory === 'none' || !g.view.look.accessory ? 'flower' : g.view.look.accessory });
        g.tipBoost = def.tips ?? 1.6;
      });
    }
    // A surf contest: everyone travels with their board (two places on the rack each), the stop bonus × `bonus`.
    if (def?.kind === 'surfContest') {
      for (const g of guests) {
        g.hasLuggage = w.flow.allows('luggage');
        g.boardBag = g.hasLuggage;
        if (g.view.look.accessory === 'none' || !g.view.look.accessory || g.view.look.accessory === 'camera') g.view.setLook({ ...g.view.look, accessory: 'surfboard' });
      }
    }
    // A heatwave: everyone boarding is parched; their first request is a cold lemonade.
    if (def?.kind === 'heatwave') for (const g of guests) g.thirsty = true;
    this.heatGuests = def?.kind === 'heatwave' ? guests.slice() : [];
    if (def?.kind === 'vip') this.vipGuest = this.spawnSpecial('vip', this.bestBookableClass(true));
    if (this.criticDue()) {
      const cls = this.bestBookableClass(false);
      if (cls) {
        this.criticGuest = this.spawnSpecial('businessman', cls);
        if (this.criticGuest) {
          this.criticGuest.critic = true;
          this.criticGuest.view.setLook({ ...this.criticGuest.view.look, ...CRITIC_LOOK, ...(this.rules.critic.look ?? {}) });
        }
      }
    }
    if (this.vipGuest) this.vipGuest.vip = true;
    else if (def?.kind === 'vip') this.active = null;
  }

  /** The best class with a bed free this stop (the VIP wants the train's best; the critic any). */
  private bestBookableClass(best: boolean): ClassId | null {
    const w = this.w;
    const serial = w.journey.stopSerial + 1;
    const classes = [...w.train.classCapacity().keys()].sort((a, b) => CLASS_BY_ID[b].tier - CLASS_BY_ID[a].tier);
    if (best) return classes.length && w.guests.bedsFree(serial, classes[0]) > 0 ? classes[0] : null;
    return classes.find((c) => w.guests.bedsFree(serial, c) > 0) ?? null;
  }

  /** A special traveller, first in the queue (they arrive along the red carpet, or simply first in line). */
  private spawnSpecial(archetype: string, cls: ClassId | null): Guest | null {
    if (!cls) return null;
    const [guest] = this.w.guests.spawnPlatformGuests([PLATFORM.window], [cls], [archetype]);
    if (guest) guest.order = -1;
    this.w.guests.arrangePlatform(true);
    return guest ?? null;
  }

  /** The doors are open: the banner, the event's props on the platform, and analytics. */
  onArrival(): void {
    const w = this.w;
    const def = this.active;
    this.started = false;
    if (def && this.activeStop === w.journey.stopSerial) {
      this.started = true;
      w.ui.stationBanner(def.title);
      w.audio.play('chime');
      w.analytics.log(EVENTS.stationEventStart, { event: def.id, stop: w.data.route.stopsCompleted + 1 });
      log.info('Event', `${def.id} at ${w.station.currentStation().name}`);
      this.buildProps(def);
      if (def.kind === 'sheep') this.spawnSheep(def.sheep ?? 4);
      if (def.kind === 'lostFound') this.lostState = 'lying';
      if (def.kind === 'delayed') this.waveDue = true;
    }
    if (this.criticGuest && this.criticGuest.state !== 'gone') w.ui.stationBanner('A critic is on board!');
    w.station.blocker = () => this.ready();
  }

  /**
   * Phase 3, the stop watchdog (`Station.updateWatchdog`): whatever the event still holds the bell for is settled
   * (the sheep trot off, the delayed connection counts as arrived). Returns what was settled, or null.
   */
  forceReady(): string | null {
    let what: string | null = null;
    for (const s of this.sheep) if (s.fled === 0) {
      s.fled = 0.001;
      s.heading = Math.atan2(PLATFORM_X0 + 7 - s.x, 0.5);
      what = 'sheep';
    }
    if (this.waveDue) {
      this.waveDue = false;
      what = what ?? 'delayed';
    }
    return what;
  }

  /** Whatever the event asks before the bell: every sheep shooed, the connection's travellers arrived. */
  private ready(): boolean {
    if (this.sheep.some((s) => s.fled === 0)) return false;
    if (this.waveDue) return false;
    return true;
  }

  /** The doors have closed (after the stop's card): settle the event, count the stops, and maybe print the review. */
  onDeparture(): void {
    const w = this.w;
    const s = this.save;
    const def = this.started ? this.active : null;
    if (def) {
      s.sinceEvent = 0;
      s.eventGap = nextGap(this.rules, () => w.rng.next());
      s.lastEvent = def.id;
      s.eventsSeen++;
      const done = this.completed(def);
      if (done) w.analytics.log(EVENTS.stationEventComplete, { event: def.id, reward: this.lastReward });
      log.info('Event', `${def.id} ${done ? 'completed' : 'not completed'}`);
    } else if (!w.station.prologue) {
      s.sinceEvent++;
    }
    // Lost & Found can still be delivered on the move; everything else leaves with the platform.
    const keepLost = this.lostState === 'carried';
    this.clear(keepLost);
    this.active = keepLost ? this.active : null;
    this.started = false;
    this.vipGuest = null;
    w.station.blocker = null;
    // Timed boosts run out.
    const stops = w.data.route.stopsCompleted;
    s.boosts = s.boosts.filter((b) => b.untilStop < 0 || b.untilStop > stops);
    // The critic: on the train, off it, and the review three stops after they boarded.
    const c = this.criticSave();
    if (c && c.status !== 'done' && stops >= c.reviewStop) this.review(c, null);
    w.save.markDirty();
  }

  private lastReward = 0;

  /** Phase 4, the Heatwave: this stop's thirsty travellers. */
  private heatGuests: Guest[] = [];
  /** Phase 4, the Heatwave: every lemonade this stop's travellers asked for has been brought (or none is open now). */
  private heatwaveServed(): boolean {
    return this.heatGuests.every((g) => g.state === 'gone' || (g.request !== 'lemonade' && !g.thirsty));
  }

  /** Whether the stop did what its event asked. */
  private completed(def: StationEventDef): boolean {
    const w = this.w;
    switch (def.kind) {
      case 'rushHour':
      case 'delayed':
      case 'festival':
      case 'harvest':
      case 'beachParty':
      case 'surfContest':
        return w.guests.waitingCount() === 0;
      case 'heatwave':
        return w.guests.waitingCount() === 0 && this.heatwaveServed();
      case 'vip':
        return this.vipGuest?.paid ?? false;
      case 'market':
        return this.marketBought;
      case 'sheep':
        return this.sheep.every((s) => s.fled > 0);
      case 'lostFound':
        return this.lostState === 'done';
    }
  }

  // ─── Multipliers the rest of the game reads ────────────────────────────────

  /** The stop bonus's multiplier: Rush Hour pays big once everyone is aboard. */
  bonusScale(): number {
    const def = this.started ? this.active : null;
    if ((def?.kind === 'rushHour' || def?.kind === 'surfContest') && this.w.guests.waitingCount() === 0) {
      this.lastReward = def.bonus ?? 2;
      return def.bonus ?? 2;
    }
    return 1;
  }

  /** A ticket's fare multiplier for this traveller: the VIP pays many times over. */
  fareScale(guest: Guest): number {
    if (guest.vip) return this.rules.events.find((e) => e.kind === 'vip')?.fare ?? 5;
    return 1;
  }

  /** Fares × this from running boosts (the critic's great review). */
  fareBoost(): number {
    return this.boost('fares');
  }

  /** Tips × this from running boosts (the Station Market). */
  tipBoost(): number {
    return this.boost('tips');
  }

  /** The crowd × this (a poor review keeps travellers away for a few stops). */
  crowdBoost(): number {
    return this.boost('crowd');
  }

  private boost(kind: 'tips' | 'fares' | 'crowd'): number {
    let k = 1;
    for (const b of this.save.boosts) if (b.kind === kind) k *= b.mult;
    return k;
  }

  // ─── Every frame ───────────────────────────────────────────────────────────

  update(dt: number): void {
    const w = this.w;
    this.updateSheep(dt);
    this.updateLost();
    if (this.waveDue && this.active?.kind === 'delayed' && w.journey.phase === 'stationStop' && w.journey.stopTime >= (this.active.waveAt ?? 14)) {
      this.waveDue = false;
      const n = this.active.wave ?? 3;
      w.ui.toast('Connection arriving!', 'clock');
      w.audio.play('whistle', { volume: 0.5, pitch: 1.2 });
      w.station.spawnWave(n);
    }
    this.updateCritic(dt);
  }

  // ─── Sheep on the Tracks ───────────────────────────────────────────────────

  private spawnSheep(n: number): void {
    const w = this.w;
    if (!this.sheepGeometry) {
      const all = fillGeometries();
      this.sheepGeometry = all.sheep;
      for (const [k, g] of Object.entries(all)) if (k !== 'sheep') g.dispose();
    }
    const spots: Vec2[] = [{ x: 3.0, z: -4.6 }, { x: 4.2, z: 0.4 }, { x: 3.4, z: 5.4 }, { x: 4.9, z: -6.4 }, { x: 2.7, z: 9.0 }, { x: 4.0, z: -8.6 }];
    for (let i = 0; i < n; i++) {
      const p = spots[i % spots.length];
      const mesh = new THREE.Mesh(this.sheepGeometry, MATERIALS.solid);
      mesh.castShadow = true;
      mesh.userData.object = 'platform:sheep';
      const sheep: Sheep = { mesh, x: PLATFORM_X0 + p.x + w.rng.range(-0.3, 0.3), z: p.z + w.rng.range(-0.4, 0.4), heading: w.rng.range(0, Math.PI * 2), fled: 0, wander: w.rng.range(1, 3) };
      mesh.position.set(sheep.x, FLOOR_Y, sheep.z);
      this.group.add(mesh);
      this.sheep.push(sheep);
    }
  }

  private updateSheep(dt: number): void {
    if (this.sheep.length === 0) return;
    const w = this.w;
    const p = w.player.pos;
    // How long the sheep alone have held the stop (everyone aboard, the bell otherwise ready).
    this.sheepWait = w.journey.doorsOpen && w.guests.waitingCount() === 0 && this.sheep.some((o) => o.fled === 0) ? this.sheepWait + dt : 0;
    for (const s of this.sheep) {
      if (s.fled === 0) {
        // Grazing about; the conductor comes close and off it bolts with a baa.
        s.wander -= dt;
        if (s.wander <= 0) {
          s.wander = w.rng.range(1.5, 3.5);
          s.heading += w.rng.range(-1.2, 1.2);
        }
        if (Math.hypot(p.x - s.x, p.z - w.station.platformOffset - s.z) < SHOO_RADIUS && w.journey.doorsOpen) {
          s.fled = 0.001;
          s.heading = Math.atan2(PLATFORM_X0 + 7 - s.x, (s.z > p.z ? 6 : -6));
          w.audio.play('bloop', { pitch: 0.55, volume: 0.8 });
          w.particles.emit('dust', s.x, FLOOR_Y + 0.2, s.z + w.station.platformOffset, 6, 0.25);
          w.haptics.light();
          if (this.sheep.every((o) => o.fled > 0)) {
            w.ui.floatText('Shoo!', p.x, FLOOR_Y + 2.4, p.z, 'praise');
            w.events.emit('station.sheepShooed', {});
          }
        } else if (this.sheepWait > SHEEP_GIVE_UP_SECONDS) {
          // Nobody came for it: off it goes over the back railing, as if shooed.
          s.fled = 0.001;
          s.heading = Math.atan2(PLATFORM_X0 + 7 - s.x, 0.5);
        } else {
          s.x = Math.max(PLATFORM_X0 + 1.9, Math.min(PLATFORM_X0 + 5.6, s.x + Math.sin(s.heading) * 0.18 * dt));
          s.z += Math.cos(s.heading) * 0.18 * dt;
          if (s.z < SHEEP_Z[0] || s.z > SHEEP_Z[1]) {
            s.z = Math.max(SHEEP_Z[0], Math.min(SHEEP_Z[1], s.z));
            s.heading = Math.PI - s.heading;
          }
        }
      } else {
        // Running off over the back railing.
        s.fled += dt;
        s.x += Math.sin(s.heading) * SHEEP_RUN * dt;
        s.z += Math.cos(s.heading) * SHEEP_RUN * dt;
        const hop = Math.abs(Math.sin(s.fled * 14)) * 0.12;
        s.mesh.position.y = FLOOR_Y + hop;
        if (s.fled > 1.6) s.mesh.visible = false;
      }
      s.mesh.position.x = s.x;
      s.mesh.position.z = s.z;
      s.mesh.rotation.y = s.heading - Math.PI / 2;
    }
  }

  /** The nearest sheep still to shoo (for the guide arrow), or null. */
  nearestSheep(from: Vec2): Vec2 | null {
    let best: Sheep | null = null;
    for (const s of this.sheep) if (s.fled === 0 && (!best || Math.hypot(s.x - from.x, s.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z))) best = s;
    return best ? { x: best.x, z: best.z } : null;
  }

  // ─── Lost & Found ──────────────────────────────────────────────────────────

  private updateLost(): void {
    const w = this.w;
    if (this.lostState !== 'carried') return;
    // The owner must still be aboard with a room; if they are gone, someone else claims it.
    const owner = this.lostOwner;
    if (!owner || owner.state === 'gone' || owner.state === 'alighting' || owner.state === 'leaving' || !owner.cabin) {
      this.lostOwner = this.pickOwner();
      if (this.lostOwner) this.lostOwner.view.showMood('wait', 'bag');
    }
    if (this.lostMesh) {
      const a = w.player.view.stackAnchor;
      a.getWorldPosition(this.tmp);
      this.lostMesh.position.set(this.tmp.x, this.tmp.y + 0.05 + w.player.stack.count * 0.18, this.tmp.z);
      this.lostMesh.rotation.y = w.player.view.root.rotation.y;
    }
  }

  private pickOwner(): Guest | null {
    const w = this.w;
    const aboard = w.guests.list.filter((g) => g.cabin && g.aboard && !g.dayRider && g.destinationStop > w.journey.stopSerial && g.state !== 'alighting');
    return aboard.length ? w.rng.pick(aboard) : null;
  }

  private deliverLost(cabin: Cabin): void {
    const w = this.w;
    const owner = this.lostOwner;
    if (!owner) return;
    const reward = Math.round((this.active?.reward ?? 30) * CLASS_BY_ID[owner.cls].tip * w.tipMultiplier());
    w.cash.payDirect(reward, cabin.center.x, cabin.center.z, 'pile:cabin');
    owner.view.showMood('love', 'bag');
    owner.view.act('hug', 1.2);
    w.feedback.praise(['My hatbox!', 'You found it!', 'Oh, thank you!'], owner.pos.x, owner.pos.z);
    w.particles.emit('sparkle', cabin.center.x, FLOOR_Y + 1.2, cabin.center.z, 14, 0.4);
    w.audio.play('chime');
    this.lastReward = reward;
    this.lostState = 'done';
    this.lostOwner = null;
    if (this.lostMesh) {
      this.lostMesh.parent?.remove(this.lostMesh);
      this.lostMesh = null;
    }
    if (this.active?.kind === 'lostFound' && !this.started) {
      w.analytics.log(EVENTS.stationEventComplete, { event: this.active.id, reward });
      this.active = null;
    }
  }

  private createZones(): void {
    const w = this.w;
    // Lost & Found: the glowing hatbox on the platform; picked up in a moment, carried to its owner's room.
    w.zones.add(new Zone({
      id: 'lostFound',
      kind: 'pickup',
      x: PLATFORM_X0 + LOST_SPOT.dx,
      z: LOST_SPOT.z,
      radius: 0.6,
      icon: 'bag',
      staff: false,
      active: () => this.lostState === 'lying' && w.journey.doorsOpen,
      stay: (zone, actor, dt) => {
        if (!actor.isPlayer || this.lostState !== 'lying') return false;
        zone.progress += dt / 0.6;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        this.lostState = 'carried';
        this.lostOwner = this.pickOwner();
        if (this.lostOwner) this.lostOwner.view.showMood('wait', 'bag');
        if (this.lostMesh) {
          this.lostMesh.parent?.remove(this.lostMesh);
          w.scene.add(this.lostMesh);
        }
        w.audio.play('pickup', { pitch: 1.2 });
        w.ui.toast('Find the owner', 'bag');
        return true;
      },
    }));
    // The owner's room: anywhere in it hands the hatbox over.
    const deliver = new Zone({
      id: 'lostOwner',
      kind: 'drop',
      x: 0,
      z: 0,
      radius: 0.6,
      icon: 'bag',
      staff: false,
      area: (x, z) => {
        const c = this.lostOwner?.cabin;
        return !!c && x >= c.room.x0 && x <= c.room.x1 && z >= c.room.z0 && z <= c.room.z1;
      },
      active: () => this.lostState === 'carried' && !!this.lostOwner?.cabin,
      stay: (zone, actor, dt) => {
        const c = this.lostOwner?.cabin;
        if (!actor.isPlayer || this.lostState !== 'carried' || !c) return false;
        zone.progress += dt / 0.5;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        this.deliverLost(c);
        return true;
      },
    });
    w.zones.add(deliver);
    // The Station Market's stall: stand by it to buy its boost (when there is the cash).
    w.zones.add(new Zone({
      id: 'market',
      kind: 'work',
      x: PLATFORM_X0 + MARKET_SPOT.dx - 0.9,
      z: MARKET_SPOT.z,
      radius: 0.6,
      icon: 'cash',
      staff: false,
      active: () => this.started && this.active?.kind === 'market' && !this.marketBought && w.journey.doorsOpen,
      stay: (zone, actor, dt) => {
        if (!actor.isPlayer || this.marketBought) return false;
        zone.progress += dt / 1.0;
        if (zone.progress < 1) return true;
        zone.progress = 0;
        this.buyMarket();
        return true;
      },
    }));
  }

  /** Where the Lost & Found item is going (its owner's room), for the guide arrow; or where it lies. */
  lostTarget(): Vec2 | null {
    if (this.lostState === 'lying' && this.w.journey.doorsOpen) return { x: PLATFORM_X0 + LOST_SPOT.dx, z: LOST_SPOT.z };
    if (this.lostState === 'carried') return this.lostOwner?.cabin?.center ?? null;
    return null;
  }

  /** The Station Market's price: so much a carriage. */
  marketPrice(): number {
    return Math.round((this.active?.pricePerCarriage ?? 40) * this.w.train.count);
  }

  private buyMarket(): void {
    const w = this.w;
    const def = this.active;
    if (!def) return;
    const price = this.marketPrice();
    if (w.wallet.get('cash') < price) {
      w.audio.play('tock');
      w.ui.floatText(`${price}`, PLATFORM_X0 + MARKET_SPOT.dx, FLOOR_Y + 2.2, MARKET_SPOT.z, 'miss');
      return;
    }
    w.wallet.take('cash', price, 'market');
    this.save.boosts.push({ id: def.id, kind: 'tips', mult: def.boost ?? 2, untilStop: w.data.route.stopsCompleted + (def.stops ?? 3) });
    this.marketBought = true;
    this.lastReward = price;
    w.audio.play('unlock');
    w.particles.emit('confetti', PLATFORM_X0 + MARKET_SPOT.dx, FLOOR_Y + 2, MARKET_SPOT.z, 30, 0.6);
    w.ui.toast(`Tips ×${def.boost ?? 2} · ${def.stops ?? 3} stops`, 'cash');
    w.save.markDirty();
  }

  /** The market's boost is running (for the HUD's boost badges). */
  marketStopsLeft(): number {
    const b = this.save.boosts.find((x) => x.kind === 'tips');
    return b ? Math.max(0, b.untilStop - this.w.data.route.stopsCompleted) : 0;
  }

  // ─── Props ─────────────────────────────────────────────────────────────────

  /** The event's dressing on the platform (bunting, a red carpet, the market stall, the fair's produce, the hatbox). */
  private buildProps(def: StationEventDef): void {
    const b = new GeoBuilder();
    const y = FLOOR_Y;
    const X = PLATFORM_X0;
    if (def.kind === 'festival' || def.kind === 'harvest' || def.kind === 'beachParty') {
      // Bunting strung along the platform between tall poles, triangles in turn.
      const colors = def.kind === 'festival' ? ['#E2506B', '#F2B53A', '#4FA3D9', '#7CC36E'] : def.kind === 'beachParty' ? ['#FF7F6E', '#FFFFFF', '#4FC3F7', '#F7B32B'] : ['#C8352B', '#F2B53A', '#7C8F4E', '#E9D9A8'];
      b.object('event:bunting');
      // Session 55: along the back railing, the poles clear of the bays.
      const poles = [-7.9, 0.4, 8.4, 12.9];
      for (const z of poles) b.cylinder(X + 7.35, y + 1.4, z, 0.03, 0.03, 2.8, PALETTE.oak, 6, 'y', { shade: 0.9 });
      for (let z = poles[0]; z < poles[poles.length - 1]; z += 0.5) {
        const c = colors[Math.round((z - poles[0]) / 0.5) % colors.length];
        b.add(new THREE.ConeGeometry(0.13, 0.26, 3), c, X + 7.35, y + 2.55 - 0.08 * Math.sin(((z - poles[0]) % 8) / 8 * Math.PI), z, Math.PI, 0, 0, { shade: 1 });
      }
      b.endObject();
    }
    if (def.kind === 'beachParty' || def.kind === 'surfContest' || def.kind === 'heatwave') {
      // Phase 4, the coast's own stops, in the market bay: beach balls and a sandcastle for the party, boards stood
      // in a rack for the contest, a cool box and a stack of lemons for the heatwave.
      b.object(`event:${def.kind}`);
      const at = (id: Parameters<typeof modelEntry>[0], dx: number, z: number, h: number, yaw = 0): void => {
        const e = modelEntry(id);
        const sc = h / (e.max[1] - e.min[1]);
        b.model(id, X + dx, y, z, yaw, sc, sc, sc, { surface: 'matte', shade: 1 });
      };
      if (def.kind === 'beachParty') {
        at('sandcastle', 6.7, 24.6, 0.4);
        at('beach_ball', 6.4, 25.8, 0.34);
        at('beach_ball', 6.95, 26.6, 0.3, 1);
        at('beach_bucket', 6.9, 23.8, 0.3);
      } else if (def.kind === 'surfContest') {
        for (let i = 0; i < 4; i++) {
          b.add(new THREE.SphereGeometry(0.5, 14, 8).scale(0.26, 0.9, 0.05), ['#4FA8E0', '#F28C2E', '#7CCB7A', '#E8525E'][i], X + 7.1, y + 0.45, 24.2 + i * 0.55, 0.12, 0, 0, { shade: 0.95, surface: 'varnish' });
        }
      } else {
        at('cool_box', 6.8, 24.6, 0.36);
        at('radio', 6.9, 25.6, 0.22);
        for (let i = 0; i < 5; i++) at('lemon', 6.55 + (i % 3) * 0.12, 26.2 + Math.floor(i / 3) * 0.12, 0.08);
      }
      b.endObject();
    }
    if (def.kind === 'harvest') {
      b.object('event:harvest');
      // Session 55: the fair's produce in the market bay: straw bales and KayKit's pumpkins.
      for (const [dx, z] of [[6.85, 24.4], [6.85, 26.4]]) {
        b.box(X + dx, y + 0.28, z, 0.6, 0.56, 1.1, '#D9B45A', 0, { shade: 0.85, detail: 'wood' });
        for (const [id, px, pz, h] of [['pumpkin', -0.6, 0.25, 0.34], ['pumpkin_small', -0.62, -0.2, 0.24], ['pumpkin_yellow', -0.1, 0.0, 0.22]] as const) {
          const e = modelEntry(id);
          const sc = h / (e.max[1] - e.min[1]);
          b.model(id, X + dx + px, y + (px > -0.3 ? 0.56 : 0), z + pz, z, sc, sc, sc, { surface: 'matte', shade: 1 });
        }
      }
      b.endObject();
    }
    if (def.kind === 'vip') {
      // The red carpet from the station house's way in, along the walkway to the ticket window.
      b.object('event:redCarpet');
      // Session 55: flat on the walkway (no rope posts to walk through), then across to the door.
      b.box(X + 4.6, y + 0.012, -6.3, 0.9, 0.012, 11.2, '#B0243A', 0, { shade: 1 });
      b.box(X + 3.0, y + 0.012, -0.45, 4.1, 0.012, 0.9, '#B0243A', 0, { shade: 1 });
      b.endObject();
    }
    if (def.kind === 'market') {
      const p = { x: X + MARKET_SPOT.dx, z: MARKET_SPOT.z };
      b.object('event:market');
      b.box(p.x, y + 0.42, p.z, 0.8, 0.84, 1.4, '#E9E2D2', 0, { shade: 0.9 });
      b.box(p.x, y + 0.86, p.z, 0.9, 0.04, 1.5, PALETTE.oak, 0, { shade: 1 });
      b.cylinder(p.x, y + 1.4, p.z, 0.03, 0.03, 1.1, PALETTE.oak, 6, 'y', { shade: 0.9 });
      b.add(new THREE.ConeGeometry(1.0, 0.4, 10), '#2F8580', p.x, y + 2.05, p.z, 0, 0, 0, { shade: 1 });
      for (const [dz, c] of [[-0.45, '#D9483B'], [0, '#F2B53A'], [0.45, '#4C8DC9']] as const) b.cylinder(p.x - 0.15, y + 0.97, p.z + dz, 0.08, 0.08, 0.18, c, 10, 'y', { shade: 1 });
      b.endObject();
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: signTexture(`Tips ×${def.boost ?? 2} · ${this.marketPrice()}`, PALETTE.navy, PALETTE.creamBand), transparent: true }));
      sign.position.set(p.x - 0.5, y + 1.35, p.z);
      sign.rotation.set(-0.75, 0.5, 0, 'YXZ');
      this.group.add(sign);
      this.marketSign = sign;
    }
    if (def.kind === 'lostFound') {
      const lost = new GeoBuilder();
      lost.object('event:hatbox');
      lost.cylinder(0, 0.11, 0, 0.17, 0.17, 0.22, '#E2506B', 18, 'y', { shade: 0.95 });
      lost.cylinder(0, 0.23, 0, 0.18, 0.18, 0.03, '#F4EEE2', 18, 'y', { shade: 1 });
      lost.box(0, 0.26, 0, 0.36, 0.02, 0.05, '#F2B53A', 0, { shade: 1 });
      lost.endObject();
      this.lostMesh = new THREE.Mesh(lost.build(), MATERIALS.solid);
      this.lostMesh.position.set(X + LOST_SPOT.dx, y, LOST_SPOT.z);
      this.group.add(this.lostMesh);
    }
    const geometry = b.build();
    if (geometry.getAttribute('position')?.count) {
      this.propsMesh = new THREE.Mesh(geometry, MATERIALS.solid);
      this.propsMesh.castShadow = true;
      this.propsMesh.receiveShadow = true;
      this.group.add(this.propsMesh);
    } else geometry.dispose();
  }

  /** Takes the event's props off the platform (the carried hatbox stays with the conductor when `keepLost`). */
  private clear(keepLost = false): void {
    for (const s of this.sheep) this.group.remove(s.mesh);
    this.sheep.length = 0;
    if (this.propsMesh) {
      this.group.remove(this.propsMesh);
      this.propsMesh.geometry.dispose();
      this.propsMesh = null;
    }
    if (this.marketSign) {
      this.group.remove(this.marketSign);
      (this.marketSign.material as THREE.MeshBasicMaterial).map?.dispose();
      this.marketSign = null;
    }
    if (!keepLost) {
      if (this.lostMesh) {
        this.lostMesh.parent?.remove(this.lostMesh);
        this.lostMesh.geometry.dispose();
        this.lostMesh = null;
      }
      if (this.lostState === 'carried' && this.lostOwner) this.lostOwner.view.showMood(null);
      this.lostState = 'none';
      this.lostOwner = null;
    } else if (this.lostState === 'lying') this.lostState = 'none';
    this.marketBought = false;
    this.waveDue = false;
  }

  // ─── The critic ────────────────────────────────────────────────────────────

  private criticSave(): CriticSave | null {
    return this.save.critic[ACTIVE_ROUTE.id] ?? null;
  }

  private newCritic(): CriticSave {
    const stops = this.w.data.route.stopsCompleted;
    return { status: 'aboard', boardStop: stops, reviewStop: stops + ACTIVE_ROUTE.station.critic.reviewAfter, clean: [0, 0], speed: [0, 0], mood: [0, 0], score: 0, result: null };
  }

  /** The critic boards this stop: once per route, while the train has 3–6 carriages (always by the sixth). */
  private criticDue(): boolean {
    const w = this.w;
    if (this.criticSave()) return false;
    if (this.criticNext) {
      this.criticNext = false;
      return true;
    }
    const c = ACTIVE_ROUTE.station.critic;
    if (w.station.prologue || w.coach?.tutorial || w.train.count < c.minCarriages || w.train.count > c.maxCarriages) return false;
    return w.train.count >= c.maxCarriages || w.rng.chance(c.chance);
  }

  private updateCritic(dt: number): void {
    const w = this.w;
    const guest = this.criticGuest;
    let c = this.criticSave();
    // On the train: the judging starts once they have a ticket.
    if (guest && !c && guest.paid && guest.state !== 'platform') {
      c = this.newCritic();
      this.save.critic[ACTIVE_ROUTE.id] = c;
      w.analytics.log(EVENTS.criticBoard, { carriages: w.train.count, stop: c.boardStop });
      log.info('Critic', `boarded at stop ${c.boardStop}, review at ${c.reviewStop}`);
      w.save.markDirty();
    }
    if (guest && guest.cabin && !guest.criticTrip) {
      guest.criticTrip = true;
      guest.destinationStop = w.journey.stopSerial + CRITIC_LEGS;
    }
    if (!c || c.status !== 'aboard') return;
    if (guest && (guest.state === 'alighting' || guest.state === 'leaving' || guest.state === 'gone')) {
      c.status = 'reviewing';
      this.criticGuest = null;
      return;
    }
    this.criticSampleIn -= dt;
    if (this.criticSampleIn > 0) return;
    this.criticSampleIn = CRITIC_SAMPLE_SECONDS;
    // Tidy rooms: the share of open rooms not waiting for a tidy.
    let open = 0;
    let tidy = 0;
    for (const cabin of w.train.cabins) {
      if (!cabin.unlocked) continue;
      open++;
      if (!cabin.isDirty) tidy++;
    }
    if (open > 0) {
      c.clean[0] += tidy / open;
      c.clean[1]++;
    }
    // Service: how long the open requests have been waiting (1 for none, 0 by a late wait).
    const late = w.econ.service.lateSeconds;
    const waiting = w.guests.openRequests();
    let speed = 1;
    if (waiting.length) {
      let sum = 0;
      for (const g of waiting) sum += Math.max(0, 1 - (w.time - g.requestAt) / late);
      speed = sum / waiting.length;
    }
    c.speed[0] += speed;
    c.speed[1]++;
    c.mood[0] += Math.max(0, Math.min(1, w.feedback.mood));
    c.mood[1]++;
  }

  /** The review prints: a front page, and its effect on the rest of the route (never permanent when poor). */
  private review(c: CriticSave, forced: 'great' | 'mixed' | 'poor' | null): void {
    const w = this.w;
    const rules = ACTIVE_ROUTE.station.critic;
    c.score = criticScore(c.clean, c.speed, c.mood);
    const result = forced ?? criticVerdict(c.score, rules);
    c.result = result;
    c.status = 'done';
    const stops = w.data.route.stopsCompleted;
    if (result === 'great') this.save.boosts.push({ id: 'critic', kind: 'fares', mult: 1 + rules.fareBoost, untilStop: -1 });
    if (result === 'poor') this.save.boosts.push({ id: 'critic', kind: 'crowd', mult: rules.poorCrowd, untilStop: stops + rules.poorStops });
    w.press.print(result === 'great' ? 'criticGreat' : result === 'mixed' ? 'criticMixed' : 'criticPoor');
    w.analytics.log(EVENTS.criticReview, { result, score: Math.round(c.score * 100) / 100 });
    log.info('Critic', `review: ${result} (${c.score.toFixed(2)})`);
    w.save.markDirty();
  }

  /** The critic's state, for the debug sheet and tests. */
  criticStatus(): string {
    const c = this.criticSave();
    return c ? `${c.status}${c.result ? ` (${c.result})` : ''}` : 'not yet';
  }

  /** Helps the guide arrow: the sheep to shoo, or where the Lost & Found hatbox goes. */
  guideTarget(): Vec2 | null {
    const w = this.w;
    if (w.journey.doorsOpen && this.sheep.some((s) => s.fled === 0)) return this.nearestSheep(w.player.pos);
    return this.lostTarget();
  }

  /** Disposes the platform-only dressing (geometry shared with the countryside's sheep is kept). */
  get root(): THREE.Object3D {
    return this.group;
  }
}

export type { StationEventDef };
void FLOOR_Y;
void PALETTE;
