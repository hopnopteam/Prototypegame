import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { Haptics } from '../audio/Haptics';
import { PRODUCTS, ROUTE1_CARRIAGES, UNLOCKS } from '../config/content';
import { ECONOMY, type Economy } from '../config/economy';
import { EventBus } from '../core/EventBus';
import { log } from '../core/log';
import { Rng } from '../core/Rng';
import { Tweens } from '../core/Tween';
import type { SaveData } from '../save/SaveData';
import { BrowserSaveStorage } from '../save/SaveStorage';
import { SaveSystem } from '../save/SaveSystem';
import { MockAdService } from '../services/ads';
import { EVENTS, MockAnalyticsService } from '../services/analytics';
import { MockIapService } from '../services/iap';
import { applyOverrides, LocalRemoteConfig } from '../services/remoteConfig';
import { AdPolicy } from '../sim/AdPolicy';
import { Autopilot } from './Autopilot';
import { Journey } from '../sim/Journey';
import { offlineEarnings } from '../sim/meta';
import { Progression } from '../sim/Progression';
import { TrainMap } from '../sim/TrainMap';
import { UnlockChain } from '../sim/UnlockChain';
import { Wallet } from '../sim/Wallet';
import { FLOOR_Y } from '../world/CarriageView';
import { carriageOriginZ } from '../world/layout';
import { setLivery } from '../world/materials';
import { liveryFor } from '../world/palette';
import { CashView } from '../world/CashView';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { Stage } from '../world/Stage';
import { CashPiles } from './CashPiles';
import { Crowd } from './Crowd';
import { Demand } from './Demand';
import type { GameEvents } from './events';
import type { DoubleChoice, GameUi } from './GameUi';
import { Guests } from './Guests';
import { Guidance } from './Guidance';
import { Input } from './Input';
import { Meta } from './Meta';
import { Monetization } from './Monetization';
import { Player } from './Player';
import { StaffManager } from './Staff';
import { Station } from './Station';
import { Tiles } from './Tiles';
import { TrainState } from './TrainState';
import type { World } from './World';
import { ZoneSystem } from './Zones';

const SAVE_KEY = 'nightexpress.save';
const MAX_FRAME = 0.05;

/**
 * Composition root and main loop. Builds every system once, owns time (including the dev time scale and
 * pausing while an ad plays), sessions, offline earnings and the day/night cycle.
 */
export class Game implements World {
  readonly econ: Economy;
  readonly events = new EventBus<GameEvents>();
  readonly save: SaveSystem;
  readonly rng = new Rng();
  readonly tweens = new Tweens();
  readonly stage: Stage;
  readonly scene: THREE.Scene;
  readonly particles = new Particles();
  readonly cashView = new CashView();
  readonly audio = new AudioEngine();
  readonly haptics = new Haptics();
  readonly analytics: MockAnalyticsService;
  readonly ads: MockAdService;
  readonly iap: MockIapService;
  readonly remote: LocalRemoteConfig;
  readonly adPolicy: AdPolicy;
  readonly map: TrainMap;
  readonly zones: ZoneSystem;
  readonly wallet: Wallet;
  readonly progression: Progression;
  readonly unlocks: UnlockChain;
  readonly journey: Journey;
  readonly scenery = new Scenery();
  readonly train: TrainState;
  readonly cash: CashPiles;
  readonly tiles: Tiles;
  readonly guests: Guests;
  readonly staff: StaffManager;
  readonly station: Station;
  readonly player: Player;
  readonly guidance: Guidance;
  readonly meta: Meta;
  readonly demand: Demand;
  readonly monetization: Monetization;
  readonly input: Input;
  readonly autopilot: Autopilot;
  private readonly crowd: Crowd;
  time = 0;
  timeScale = 1;
  paused = false;
  creativeMode = false;
  private adPlaying = false;
  private hiddenAt = 0;
  private lastFrame = 0;
  private sessionSeconds = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, readonly ui: GameUi) {
    // Remote config overrides a copy of the balance sheet, so tuning can change without an update.
    this.econ = structuredClone(ECONOMY);
    this.remote = new LocalRemoteConfig();
    applyOverrides(this.econ as unknown as Record<string, unknown>, this.remote);

    this.save = new SaveSystem(new BrowserSaveStorage(), {
      key: SAVE_KEY,
      now: () => Date.now(),
      newId: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
    });
    this.save.load();
    log.setVerbose(this.data.settings.devTools);

    this.stage = new Stage(canvas);
    this.scene = this.stage.scene;
    this.scene.add(this.scenery.group, this.particles.points, this.cashView.mesh);
    this.stage.attachParticles(this.particles);

    this.analytics = new MockAnalyticsService(80);
    this.analytics.setUser(this.data.profile.installId);
    this.ads = new MockAdService(ui, this.econ.ads.mockRewardedSeconds, this.econ.ads.mockInterstitialSeconds);
    this.iap = new MockIapService(PRODUCTS, ui);
    this.adPolicy = new AdPolicy(() => this.econ.ads, this.data.monetization);

    this.wallet = new Wallet(this.data.wallet, (kind, amount, delta, source) => {
      this.events.emit('currency.changed', { kind, amount, delta, source });
      if (delta > 0) this.analytics.log(EVENTS.currencyEarned, { currency: kind, amount: Math.round(delta), source });
      else if (!source.startsWith('unlock:')) this.analytics.log(EVENTS.currencySpent, { currency: kind, amount: Math.round(-delta), sink: source });
      this.save.markDirty();
    });
    this.progression = new Progression(this.econ.progression, this.data.route);
    this.unlocks = new UnlockChain(UNLOCKS, this.data.route, () => this.data.profile.flags);
    const route = this.data.route;
    this.journey = new Journey(this.econ.journey, {
      onPhase: (phase, previous) => {
        this.station.onPhase(phase, previous);
        this.events.emit('journey.phase', { phase, previous, station: this.journey.stationIndex });
      },
      onLastCall: () => {
        this.station.onLastCall();
        this.events.emit('journey.lastCall', {});
      },
    }, route.stationIndex, route.legsCompleted, route.stopsCompleted, route.stopsCompleted > 0 ? 70 : undefined,
    // A brand-new game opens pulling out of Millbrook: the journey is on screen from the first second.
    route.stopsCompleted === 0 && route.legsCompleted === 0 ? 'departing' : 'onTheMove');

    this.map = new TrainMap(this.econ.player.radius);
    this.demand = new Demand(this);
    this.zones = new ZoneSystem(this.scene);
    this.cash = new CashPiles(this);
    this.train = new TrainState(this);
    this.scene.add(this.train.group);
    this.guests = new Guests(this);
    this.staff = new StaffManager(this);
    this.station = new Station(this);
    this.tiles = new Tiles(this);
    this.meta = new Meta(this);
    this.input = new Input(canvas.parentElement ?? canvas, overlay);
    this.input.onFirstInteraction = () => this.audio.unlock();

    this.train.init();
    this.applyLivery();
    const spawn = this.map.anchor(0, 'playerSpawn');
    this.player = new Player(this, this.input, spawn);
    this.guidance = new Guidance(this);
    this.monetization = new Monetization(this, {
      setAdPlaying: (playing) => this.setAdPlaying(playing),
      showFirstClassOffer: (discounted, price, onBuy, onClose) => ui.showFirstClassOffer(discounted, price, onBuy, onClose),
    });

    this.autopilot = new Autopilot(this, (x, y) => (this.input.override = { x, y }));
    this.crowd = new Crowd(this);
    this.staff.init();
    this.station.init();
    const door = this.map.doors()[0];
    this.cash.create('bonus', door.inside.x - 0.55, door.inside.z + 0.5);
    this.cash.create('floor', this.map.anchor(0, 'startCash').x, this.map.anchor(0, 'startCash').z);
    this.tiles.refresh();
    this.guests.spawnStartingQueue(this.econ.guests.initialGuests);
    if (this.save.outcome === 'newPlayer' || this.data.profile.lifetimePlaySeconds < 1) {
      this.cash.add('floor', this.econ.money.startingFloorCash);
    }
    this.scenerySpanChanged();
    this.stage.rig.snapTo(spawn.x, spawn.z);

    this.wireEvents();
    this.applySettings();
    this.startSession(this.save.secondsAwayOnLoad, true);
    // One zero-length step places everything before the first frame (the title card starts paused).
    this.step(0);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save.saveNow());
    window.addEventListener('resize', () => this.stage.resize());
  }

  get data(): SaveData {
    return this.save.data;
  }

  // ─── World helpers ──────────────────────────────────────────────────────────

  lifetimeSeconds(): number {
    return this.data.profile.lifetimePlaySeconds;
  }

  flag(name: string): boolean {
    return !!this.data.profile.flags[name];
  }

  setFlag(name: string): void {
    if (this.data.profile.flags[name]) return;
    this.data.profile.flags[name] = true;
    this.save.markDirty();
    this.tiles?.refresh();
  }

  ftue(step: string): void {
    const ftue = this.data.profile.ftue;
    if (ftue[step] !== undefined) return;
    ftue[step] = Math.round(this.lifetimeSeconds());
    this.analytics.log(EVENTS.ftueStep, { step, elapsed: ftue[step] });
    this.events.emit('ftue.step', { step });
    this.save.markDirty();
  }

  fareMultiplier(): number {
    return (1 + this.data.conductor.fareBonus * this.econ.conductor.fareBonus.perLevel) * (1 + this.data.meta.perks.fareBonus);
  }

  tipMultiplier(): number {
    return 1 + this.data.meta.perks.tipBonus + this.train.trainTipBonus();
  }

  addStars(amount: number, source: string, at?: { x: number; z: number }): void {
    if (amount <= 0) return;
    const levels = this.progression.addStars(amount);
    this.save.markDirty();
    this.events.emit('stars.added', { amount, source, x: at?.x, z: at?.z });
    if (at) this.ui.floatText(`+${amount}`, at.x, FLOOR_Y + 1.6, at.z, 'star');
    for (const level of levels) this.onLevelUp(level);
  }

  scenerySpanChanged(): void {
    this.scenery.setSpan(this.map.rearZ);
  }

  // ─── Main loop ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const real = Math.min(0.25, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.frame(real);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(realDt: number): void {
    if (!this.paused && !this.adPlaying) {
      // Fast-forward (dev) runs several normal-sized steps so nothing tunnels through a zone.
      let remaining = Math.min(realDt, MAX_FRAME * 4) * this.timeScale;
      while (remaining > 1e-6) {
        const dt = Math.min(MAX_FRAME, remaining);
        this.step(dt);
        remaining -= dt;
      }
      this.data.profile.lifetimePlaySeconds += realDt * this.timeScale;
      this.sessionSeconds += realDt;
    }
    this.present(realDt);
  }

  /** One simulation step. */
  step(dt: number): void {
    this.time += dt;
    this.autopilot.update(dt);
    this.journey.update(dt);
    this.station.update(dt);
    this.scenery.update(dt, this.journey.speed);
    this.player.update(dt);
    this.zones.update(dt, [this.player, ...this.staff.members]);
    this.guests.update(dt);
    this.staff.update(dt);
    this.crowd.update(dt);
    this.train.update(dt);
    this.tiles.update(dt);
    this.cash.update(dt);
    this.cashView.update(dt);
    this.particles.update(dt);
    this.tweens.update(dt);
    this.guidance.update(dt);
    this.monetization.update(dt);
    this.save.update(dt);
    if (this.creativeMode && this.wallet.get('cash') < 5000) this.wallet.add('cash', 5000, 'creative');
    if (this.lifetimeSeconds() > 720) this.ftue('session_12min');
  }

  private present(realDt: number): void {
    const night = this.updateDayCycle();
    this.audio.setTrainSpeed(this.journey.speed / this.econ.journey.cruiseSpeed);
    this.audio.setNight(night);
    this.audio.update(realDt);
    const rig = this.stage.rig;
    rig.clampX = this.journey.doorsOpen ? [-1.5, 6.5] : [-1.2, 1.6];
    rig.update(realDt, this.player.pos.x, this.player.pos.z);
    this.ui.update(realDt);
    this.stage.render(realDt);
  }

  private dayCycleOverride: number | null = null;

  setTimeOfDay(t: number | null): void {
    this.dayCycleOverride = t;
  }

  private updateDayCycle(): number {
    const j = this.journey;
    const legs = this.econ.journey.legsPerDayCycle;
    let fraction = 0;
    if (j.phase === 'onTheMove') fraction = (j.time / Math.max(1, j.duration)) * 0.78;
    else if (j.phase === 'arriving') fraction = 0.78 + 0.04 * (j.time / j.duration);
    else if (j.phase === 'stationStop') fraction = 0.82 + 0.14 * (j.time / j.duration);
    else fraction = 0.96 + 0.04 * (j.time / j.duration);
    const t = this.dayCycleOverride ?? ((j.legsCompleted + fraction) / legs + 0.08) % 1;
    this.stage.lighting.setTime(t);
    return this.stage.lighting.night;
  }

  private setAdPlaying(playing: boolean): void {
    this.adPlaying = playing;
    this.audio.setPaused(playing);
    this.input.release();
  }

  // ─── Sessions, offline earnings, visibility ────────────────────────────────

  private startSession(secondsAway: number, coldStart: boolean): void {
    const profile = this.data.profile;
    profile.sessionCount++;
    this.sessionSeconds = 0;
    this.analytics.log(EVENTS.sessionStart, {
      session_number: profile.sessionCount,
      lifetime_minutes: Math.floor(profile.lifetimePlaySeconds / 60),
      cold_start: coldStart,
    });
    this.save.markDirty();
    this.offerOfflineEarnings(secondsAway);
    this.monetization.offerAtSessionStart();
  }

  private offerOfflineEarnings(secondsAway: number): void {
    const staff = this.staff.countsByRole();
    const earned = offlineEarnings(secondsAway, { openCabins: this.train.openCabinCount(), staff }, this.econ.offline);
    if (earned.amount <= 0) return;
    const gemCost = this.econ.rewarded.offlineDouble.gemCost;
    this.ui.showOffline(earned.amount, earned.seconds, gemCost, (choice) => this.collectWithDouble('offlineDouble', choice, gemCost, (k) => {
      this.wallet.add('cash', earned.amount * k, 'offline');
      this.audio.play('cash');
    }));
  }

  /** Grants a reward once, doubled if the player watched an ad or paid gems for it. */
  collectWithDouble(placement: string, choice: DoubleChoice, gemCost: number, grant: (multiplier: number) => void): void {
    if (choice === 'none') {
      grant(1);
      return;
    }
    void this.monetization.runRewarded(placement, choice === 'gems', gemCost, () => grant(2)).then((ok) => {
      if (!ok) grant(1);
    });
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.analytics.log(EVENTS.sessionEnd, { session_number: this.data.profile.sessionCount, session_seconds: Math.round(this.sessionSeconds) });
      this.save.saveNow();
      this.audio.setPaused(true);
      this.paused = true;
    } else {
      const away = (Date.now() - this.hiddenAt) / 1000;
      this.paused = false;
      this.audio.setPaused(false);
      this.lastFrame = performance.now();
      if (away >= 60) this.startSession(away, false);
    }
  }

  /** The paint job follows the route level: the train looks as famous as it is. */
  private applyLivery(): string {
    const livery = liveryFor(this.data.route.level);
    setLivery(livery.body, livery.trim);
    return livery.name;
  }

  private onLevelUp(level: number): void {
    const before = liveryFor(level - 1).name;
    if (this.applyLivery() !== before) {
      this.events.emit('livery.changed', { name: liveryFor(level).name, level });
      for (let i = 0; i < this.train.count; i++) this.particles.emit('sparkle', 0, FLOOR_Y + 1.2, carriageOriginZ(i) + 7, 14, 2.2);
    }
    const reward = this.progression.rewardFor(level);
    this.analytics.log(EVENTS.routeLevelUp, { level, time: Math.round(this.lifetimeSeconds()) });
    this.events.emit('level.up', { level });
    this.audio.play('levelup');
    this.haptics.success();
    this.particles.emit('confetti', this.player.pos.x, FLOOR_Y + 2.5, this.player.pos.z, 70, 1.2);
    if (level === 2) this.ftue('route_level_2');
    const gemCost = this.econ.rewarded.levelUpDouble.gemCost;
    this.ui.showLevelUp(level, reward, gemCost, (choice) => this.collectWithDouble('levelUpDouble', choice, gemCost, (k) => {
      this.wallet.add('railMiles', reward.railMiles * k, 'levelUp');
      this.wallet.add('cash', reward.cash * k, 'levelUp');
    }));
  }

  private wireEvents(): void {
    const e = this.events;
    e.on('guest.checkedIn', () => this.ftue('first_checkin'));
    e.on('cash.collected', () => this.ftue('first_cash'));
    e.on('unlock.completed', () => this.ftue('first_unlock'));
    e.on('cabin.cleaned', () => this.ftue('first_clean'));
    e.on('staff.hired', ({ role }) => {
      this.ftue('first_hire');
      if (role === 'porter') this.ftue('porter_hired');
    });
    e.on('carriage.coupled', ({ index, type }) => {
      this.ftue('first_carriage');
      if (type === 'supply') this.ftue('supply_car');
      this.analytics.log(EVENTS.carriageCoupled, { index, type, time: Math.round(this.lifetimeSeconds()) });
      this.scenerySpanChanged();
      this.tiles.refresh();
      this.save.saveNow();
    });
    e.on('currency.changed', () => undefined);
  }

  applySettings(): void {
    const s = this.data.settings;
    this.audio.setEnabled(s.sound, s.music);
    this.haptics.enabled = s.haptics;
    log.setVerbose(s.devTools);
  }

  /**
   * First tap on a brand-new game: the camera starts wide on the train pulling out of Millbrook, whistle
   * blowing, then glides down to the conductor. This is also the first second of every ad creative.
   */
  playOpening(): void {
    const brandNew = this.data.route.stopsCompleted === 0 && this.lifetimeSeconds() < 2;
    if (!brandNew) return;
    this.stage.rig.focusOn(new THREE.Vector3(1.6, 0, 3.5), 1.6, 1.75);
    this.audio.play('whistle');
  }

  // ─── Dev tools ──────────────────────────────────────────────────────────────

  setAutopilot(on: boolean): void {
    this.autopilot.enabled = on;
    if (!on) this.input.override = null;
  }

  /**
   * Runs the simulation without rendering (pacing tests). Rewarded offers and modals are auto-dismissed by
   * the caller. Returns the simulated seconds actually run.
   */
  simulate(seconds: number, dt = 1 / 30): number {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      this.step(dt);
      this.data.profile.lifetimePlaySeconds += dt;
    }
    return steps * dt;
  }

  devSkipToStation(): void {
    this.journey.skipToArrival();
  }

  devCompleteNextTile(): void {
    const next = this.tiles.cheapest();
    if (!next) return;
    this.wallet.add('cash', this.unlocks.remaining(next.def.id), 'dev');
  }

  devAddStars(amount: number): void {
    this.addStars(amount, 'dev');
  }

  resetProgress(): void {
    this.save.reset();
    location.reload();
  }

  get carriagePlan(): typeof ROUTE1_CARRIAGES {
    return ROUTE1_CARRIAGES;
  }
}
