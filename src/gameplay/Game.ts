import { PLATFORM } from '../world/platformLayout';
import { INTRO_BEATS } from '../config/coach';
import * as THREE from 'three';
import { AudioEngine, isAndroid } from '../audio/AudioEngine';
import { AUDIO } from '../config/audio';
import { Haptics } from '../audio/Haptics';
import { CARRIAGE_CATALOGUE, PRODUCTS } from '../config/content';
import { OUTFITS } from '../config/wardrobe';
import { ECONOMY, type Economy } from '../config/economy';
import { EventBus } from '../core/EventBus';
import { log } from '../core/log';
import { Rng } from '../core/Rng';
import { Background, frameWork } from '../core/Background';
import { Tweens } from '../core/Tween';
import type { SaveData } from '../save/SaveData';
import { BrowserSaveStorage } from '../save/SaveStorage';
import { forgetSave, mirrorSave, platform as nativePlatform } from '../services/native';
import { ANALYTICS } from '../config/analytics';
import { GameAnalyticsService, gameAnalyticsWanted } from '../services/gameAnalytics';
import { GOD, GOD_MODE, GOD_WORK } from '../config/god';
import { SaveSystem } from '../save/SaveSystem';
import { MockAdService } from '../services/ads';
import { EVENTS, MockAnalyticsService } from '../services/analytics';
import { MockIapService } from '../services/iap';
import { applyOverrides, LocalRemoteConfig } from '../services/remoteConfig';
import { AdPolicy } from '../sim/AdPolicy';
import { Autopilot } from './Autopilot';
import { Journey } from '../sim/Journey';
import { offlineEarnings, conductorCost } from '../sim/meta';
import { Progression } from '../sim/Progression';
import { ratingEffect, trainRating } from '../sim/stationResult';
import { TrainMap } from '../sim/TrainMap';
import { UnlockChain } from '../sim/UnlockChain';
import { buildUnlocks, stationPerks, type StationPerks } from '../sim/unlockPlan';
import { Wallet } from '../sim/Wallet';
import { FLOOR_Y } from '../world/CarriageView';
import { CharacterView } from '../world/CharacterView';
import { beginMaskFrame, setPopupTest } from '../world/screenMask';
import { CharacterBatch } from '../world/CharacterBatch';
import { CARRIAGE_PITCH, carriageOriginZ, GANGWAY_LENGTH, HALF_WIDTH, INNER, LOCOMOTIVE_LENGTH, PLATFORM_WIDTH, PLATFORM_X0, REAR_DECK_LENGTH } from '../world/layout';
import { VISUALS, type QualityTier, type TierSettings } from '../config/visuals';
import { setLivery, SHADOW_GEOMETRY } from '../world/materials';
import { LIVERIES, liveryFor, type Livery } from '../world/palette';
import { CashView } from '../world/CashView';
import { Particles } from '../world/Particles';
import { Scenery } from '../world/Scenery';
import { Ambient } from '../world/Ambient';
import { Fireflies } from '../world/Fireflies';
import { Stage } from '../world/Stage';
import { isTier } from '../world/Quality';
import { CashPiles } from './CashPiles';
import { Coach } from './Coach';
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
import { Press } from './Press';
import { Rush } from './Rush';
import { HandWork } from './HandWork';
import { Objectives } from './Objectives';
import { Feedback } from './Feedback';
import { Flow } from './Flow';
import { StaffManager } from './Staff';
import { Venues } from './Venues';
import { Station } from './Station';
import { Tiles } from './Tiles';
import { Reveal } from './Reveal';
import { TrainNeeds } from './TrainNeeds';
import { TrainState } from './TrainState';
import type { World } from './World';
import { ZoneSystem } from './Zones';
import { PerfStats } from '../core/PerfStats';
import { CharacterDebug } from './CharacterDebug';
import { PerfOverlay, type PerfReport } from '../ui/PerfOverlay';

/** Milliseconds of each frame given to rebuilds spread over frames (see core/Background). */
const BACKGROUND_BUDGET_MS = 2;
/**
 * Milliseconds of each frame shared by all spread-out work together (the next scenery stretch first, then
 * rebuilds, then the light bake): a phone keeps its 60 fps even while a coupling rebuilds everything.
 */
/** The first minute is the walkthrough: idle seconds are counted after it (session 24). */
const IDLE_GRACE_SECONDS = 60;
const FRAME_WORK_MS = 2.5;
/** Behind the loading screen nobody sees a slow frame: queued work (bakes, scenery, rebuilds) gets this much a frame. */
const LOADING_WORK_MS = 40;
/** Where the save lives (localStorage, mirrored into the app's own storage on iOS and Android). */
export const SAVE_KEY = 'nightexpress.save' + (GOD_MODE ? GOD.saveSuffix : '');
const MAX_FRAME = 0.05;
/** Where in the day cycle the held night sits (the middle of the night key). */
const NIGHT_TIME = 0.82;

/**
 * Composition root and main loop. Builds every system once, owns time (including the dev time scale and
 * pausing while an ad plays), sessions, offline earnings and the day/night cycle.
 */
/** The haptics policy (see `settings.hapticsPolicy`): 1 = off by default on Android. */
const HAPTICS_POLICY = 1;
/** The quality policy (see `settings.qualityPolicy`): 18 = lite phone tiers, crisp resolution; 28 = Android starts at Low. */
const QUALITY_POLICY = 28;
/** Particle size scale at one device pixel per CSS pixel (Particles' default, tuned at that density). */
const PARTICLE_SCALE = 400;

export class Game implements World {
  readonly econ: Economy;
  readonly events = new EventBus<GameEvents>();
  readonly save: SaveSystem;
  readonly rng = new Rng();
  readonly tweens = new Tweens();
  readonly background = new Background();
  readonly stage: Stage;
  readonly scene: THREE.Scene;
  readonly particles = new Particles();
  readonly cashView = new CashView();
  readonly characters = new CharacterBatch(SHADOW_GEOMETRY);
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
  readonly ambient = new Ambient();
  /** Fireflies over the verges and the reeds at night (session 18). */
  readonly fireflies = new Fireflies();
  readonly train: TrainState;
  readonly cash: CashPiles;
  readonly tiles: Tiles;
  readonly reveal: Reveal;
  readonly guests: Guests;
  readonly staff: StaffManager;
  /** The venue carriages (session 20): café, dining car, bar lounge, observation dome. */
  readonly venues: Venues;
  readonly station: Station;
  readonly player: Player;
  readonly guidance: Guidance;
  readonly meta: Meta;
  readonly press: Press;
  readonly rush: Rush;
  readonly handWork: HandWork;
  readonly objectives: Objectives;
  readonly feedback: Feedback;
  readonly flow: Flow;
  readonly demand: Demand;
  readonly monetization: Monetization;
  readonly input: Input;
  readonly autopilot: Autopilot;
  readonly needs: TrainNeeds;
  readonly coach: Coach;
  private readonly crowd: Crowd;
  time = 0;
  timeScale = 1;
  paused = false;
  creativeMode = false;
  private adPlaying = false;
  private hiddenAt = 0;
  private lastFrame = 0;
  private sessionSeconds = 0;
  private lastTrainSpeed = 0;
  private running = false;
  private overlayRoot!: HTMLElement;
  /** Real frame times for the performance overlay and the soak test (session 24). */
  readonly perfStats = new PerfStats();
  private characterDebug: CharacterDebug | null = null;
  private perfOverlay: PerfOverlay | null = null;
  /** Seconds of play (after the first minute) with no task to do: see `Guidance.idle` (session 24). */
  idleSeconds = 0;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, readonly ui: GameUi) {
    // Remote config overrides a copy of the balance sheet, so tuning can change without an update.
    this.econ = structuredClone(ECONOMY);
    this.remote = new LocalRemoteConfig();
    applyOverrides(this.econ as unknown as Record<string, unknown>, this.remote);

    const storage = new BrowserSaveStorage();
    storage.onWrite = (key, contents) => mirrorSave(key, contents);
    storage.onRemove = (key) => forgetSave(key);
    this.save = new SaveSystem(storage, {
      key: SAVE_KEY,
      now: () => Date.now(),
      newId: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
    });
    this.save.load();
    // Session 30 (owner: "remove developer tools"): no switch for them in Settings any more; `?dev=1` turns them on
    // for a build being tested (the test scripts set the flag themselves).
    if (typeof location !== 'undefined') this.data.settings.devTools = new URLSearchParams(location.search).get('dev') === '1';
    log.setVerbose(this.data.settings.devTools);

    const settings = this.data.settings;
    // A remembered tier drop or render scale from an older quality policy starts afresh under this one.
    if (settings.qualityPolicy !== QUALITY_POLICY) {
      settings.qualityAuto = null;
      settings.renderScale = {};
      settings.qualityPolicy = QUALITY_POLICY;
      this.save.markDirty();
    }
    // Session 28: Android starts with haptics off, once (Settings can turn Vibration back on and it stays on).
    if (settings.hapticsPolicy !== HAPTICS_POLICY) {
      if (isAndroid()) settings.haptics = false;
      settings.hapticsPolicy = HAPTICS_POLICY;
      this.save.markDirty();
    }
    // A ?quality= link forces a tier for this visit only (screenshots, comparisons); it is not saved.
    const forced = new URLSearchParams(location.search).get('quality');
    const quality = isTier(forced) ? forced : isTier(settings.quality) ? settings.quality : 'auto';
    // Each tier opens at the render scale it settled on last time (phones a little under full the first time).
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const startScale = (tier: QualityTier): number => {
      if (isTier(forced)) return 1;
      const remembered = settings.renderScale?.[tier];
      const start = VISUALS.quality.dynamicResolution.startScale;
      return typeof remembered === 'number' && remembered > 0 ? remembered : touch ? start.touch : start.desktop;
    };
    this.stage = new Stage(canvas, quality, isTier(settings.qualityAuto) ? settings.qualityAuto : null, startScale);
    this.stage.dynamicResolution = !isTier(forced);
    // Fix list 6.3: floating world labels step aside under the UI's pop-ups and labels.
    this.ui.canvas = canvas;
    const probe = new THREE.Vector3();
    setPopupTest((x, y, z) => {
      probe.set(x, y, z).project(this.stage.rig.camera);
      return probe.z < 1 && this.ui.underPopupAt(probe.x, probe.y);
    });
    this.stage.checkShaderErrors = settings.devTools;
    this.stage.onAutoTier = (tier) => {
      this.data.settings.qualityAuto = tier;
      this.save.markDirty();
    };
    this.stage.onRenderScale = (tier, scale) => {
      (this.data.settings.renderScale ??= {})[tier] = Math.round(scale * 100) / 100;
      this.save.markDirty();
    };
    this.scene = this.stage.scene;
    // Every character from here on draws through one batch (one draw call for the whole crowd).
    CharacterView.batch = this.characters;
    this.scene.add(this.characters.group);
    this.scene.add(this.scenery.group, this.ambient.group, this.fireflies.points, this.particles.points, this.cashView.mesh);
    this.stage.attachParticles(this.particles);

    this.analytics = new MockAnalyticsService(80);
    this.analytics.setUser(this.data.profile.installId);
    this.connectGameAnalytics();
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
    // Class upgrades wait for their route level: a flag per level reached (older saves get theirs here).
    for (let level = 1; level <= this.progression.level; level++) this.data.profile.flags[`level_${level}`] = true;
    this.unlocks = new UnlockChain(buildUnlocks(this.data.route.carriages), this.data.route, () => this.data.profile.flags, () => (GOD_MODE ? GOD_WORK : this.data.profile.handWork));
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
    // A brand-new game opens standing at Millbrook, its first passengers boarding (Station.startPrologue).
    route.stopsCompleted === 0 && route.legsCompleted === 0 ? 'stationStop' : 'onTheMove');

    this.flow = new Flow(this);
    this.map = new TrainMap(this.econ.player.radius);
    this.demand = new Demand(this);
    this.zones = new ZoneSystem(this.scene);
    // Job pads reach further than their rings, never through a wall, and float their icons over what they serve.
    this.zones.reach = this.econ.zones.reach;
    // Session 29: every job sounds the same way as its ring fills, a gentle soft tick each quarter, a little higher each time.
    this.zones.onPlayerWork = (_zone, before, after) => {
      if (Math.floor(after * 4) > Math.floor(before * 4) && after < 1) this.audio.play('fill', { pitch: 0.95 + after * 0.3 });
    };
    this.zones.badgeReach = this.econ.zones.badgeReach;
    this.zones.reachClear = (ax, az, bx, bz) => this.map.walk.lineClear(ax, az, bx, bz);
    this.zones.anchor = (x, z) => this.map.serviceAnchor(x, z);
    this.cash = new CashPiles(this);
    this.train = new TrainState(this);
    this.scene.add(this.train.group);
    this.guests = new Guests(this);
    this.staff = new StaffManager(this);
    this.venues = new Venues(this);
    this.map.closedProps = (index) => this.venues.closedProps(index);
    this.map.lockedRooms = (index) => this.train.lockedRooms(index);
    this.station = new Station(this);
    this.tiles = new Tiles(this);
    this.reveal = new Reveal(this);
    this.meta = new Meta(this);
    this.press = new Press(this, ui);
    this.rush = new Rush(this);
    this.handWork = new HandWork(this);
    this.objectives = new Objectives(this);
    this.feedback = new Feedback(this);
    this.input = new Input(canvas.parentElement ?? canvas, overlay);
    this.overlayRoot = overlay;
    if (new URLSearchParams(location.search).get('perf') === '1') this.setPerfOverlay(true);
    // Session 32: the character safety net (`?debug=1`).
    if (new URLSearchParams(location.search).get('debug') === '1') this.characterDebug = new CharacterDebug(this, this.overlayRoot);
    this.input.onFirstInteraction = () => this.audio.unlock();
    this.listenForAudioGesture();

    this.train.init();
    this.applyLivery();
    // A new game opens outside on the Millbrook platform, collecting tickets (session 19); otherwise in the lobby.
    const opening = this.journey.phase === 'stationStop' && this.journey.held;
    const spawn = opening ? Station.prologueSpawn(this.map.doors()[0]) : this.map.anchor(0, 'playerSpawn');
    this.player = new Player(this, this.input, spawn);
    this.guidance = new Guidance(this);
    this.needs = new TrainNeeds(this);
    this.coach = new Coach(this);
    this.monetization = new Monetization(this, {
      setAdPlaying: (playing) => this.setAdPlaying(playing),
      showFirstClassOffer: (discounted, price, onBuy, onClose) => ui.showFirstClassOffer(discounted, price, onBuy, onClose),
    });

    this.autopilot = new Autopilot(this, (x, y) => (this.input.override = { x, y }));
    this.crowd = new Crowd(this);
    this.staff.init();
    this.station.init();
    this.rush.init();
    this.handWork.init();
    this.objectives.init();
    this.feedback.init();
    const door = this.map.doors()[0];
    this.cash.create('bonus', door.inside.x - 0.55, door.inside.z + 0.5);
    this.cash.create('floor', this.map.anchor(0, 'startCash').x, this.map.anchor(0, 'startCash').z);
    this.tiles.refresh();
    this.guests.spawnStartingQueue(this.econ.guests.initialGuests);
    this.station.startPrologue();
    if (this.save.outcome === 'newPlayer' || this.data.profile.lifetimePlaySeconds < 1) {
      this.cash.add('floor', this.econ.money.startingFloorCash);
    }
    this.scenerySpanChanged();
    this.stage.rig.snapTo(spawn.x, spawn.z);
    // Everything built before the quality tier was applied moves onto the tier's materials.
    this.stage.syncMaterials();
    // Real lake reflections on the tiers that afford them.
    const reflections = (tier: TierSettings): void => this.stage.setPreRender(this.scenery.setReflections(tier.reflections));
    this.stage.tierListeners.push(reflections);
    reflections(this.stage.settings);

    this.wireEvents();
    this.applySettings();
    this.startSession(this.save.secondsAwayOnLoad, true);
    // One zero-length step places everything before the first frame (the title card starts paused).
    this.step(0);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save.saveNow());
    window.addEventListener('resize', () => this.stage.resize());
  }

  /**
   * Audio may only start inside a gesture that counts as user activation: a tap's pointerup or touchend, a
   * click, a key (a touch's pointerdown does not). Every such gesture resumes the sound if it is not running
   * (the first tap, normally, and again after the phone suspended it, e.g. for a call); the graph is built and
   * the theme decoded at boot, so the music is ready for the first tap.
   */
  private listenForAudioGesture(): void {
    this.audio.prepare();
    // Every gesture: cheap when audio is already running, and it revives the context (and the master fade)
    // after an interruption the browser would not resume by itself.
    const tryUnlock = (): void => {
      this.audio.unlock();
    };
    for (const name of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(name, tryUnlock, { capture: true, passive: true });
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

  /**
   * Session 31: GameAnalytics, when its keys are set (`config/analytics.ts`) and this is not an automated test browser.
   * Uncaught errors are reported too, and a performance sample is taken every few minutes of play (`trackAnalytics`).
   */
  /** What the Settings footer shows, so a tester can see whether this build reports to GameAnalytics. */
  analyticsStatus = 'off';

  private connectGameAnalytics(): void {
    if (typeof window === 'undefined') return;
    if (!ANALYTICS.gameKey || !ANALYTICS.secretKey) { this.analyticsStatus = 'no keys'; return; }
    if (GOD_MODE) { this.analyticsStatus = 'off (god mode)'; return; }
    if (!gameAnalyticsWanted(location.search, navigator.webdriver === true)) return;
    try {
      const ga = new GameAnalyticsService({ userId: this.data.profile.installId, platform: nativePlatform, verbose: this.data.settings.devTools });
      this.analytics.sinks.push(ga);
      this.analyticsStatus = 'on';
      // Every event carries the player's level, train size and graphics tier, the first ones included.
      this.analytics.beforeSend = () => {
        if (this.progression && this.train) this.analytics.setDimensions(this.progression.level, this.train.count, this.stage.tier);
      };
      window.addEventListener('error', (e) => this.analytics.error(`${e.message} @ ${e.filename ?? ''}:${e.lineno ?? 0}`, false));
      window.addEventListener('unhandledrejection', (e) => this.analytics.error(`Unhandled: ${String((e as PromiseRejectionEvent).reason)}`, false));
    } catch (e) {
      this.analyticsStatus = 'failed';
      log.error('Analytics', 'GameAnalytics could not start', e);
    }
  }

  private perfSampleIn = 0;

  /** Keeps every event's dimensions current and takes the performance sample. */
  private trackAnalytics(dt: number): void {
    this.perfSampleIn += dt;
    if (this.perfSampleIn >= ANALYTICS.perfSampleSeconds) {
      this.perfSampleIn = 0;
      const fps = Math.round(this.perfStats.summary().fps);
      if (fps > 0) this.analytics.log('perf_sample', { fps, quality: this.stage.tier });
    }
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
    return (1 + this.data.conductor.fareBonus * this.econ.conductor.fareBonus.perLevel) * (1 + this.data.meta.perks.fareBonus + this.stationPerks().fares) * this.venues.boost();
  }

  /** Every tip on the train: perks, smart service cars, station upgrades, and the bar's Happy Hour. */
  tipMultiplier(): number {
    const r = this.econ.rating.tips;
    return (1 + this.data.meta.perks.tipBonus + this.train.trainTipBonus() + this.stationPerks().tips) * this.venues.boost() * ratingEffect(this.trainRating(), r.low, r.high);
  }

  /** The Train Rating, 1..5 stars, from the recent station stops (fix list 4.2; config: rating). */
  trainRating(): number {
    return trainRating(this.data.route.recentStops ?? [], this.econ.rating.start);
  }

  /** Station upgrades bought so far (exterior and marketing); cached until the next unlock. */
  stationPerks(): StationPerks {
    if (!this.perksCache || this.perksCacheAt !== this.data.route.unlocked.length) {
      this.perksCache = stationPerks((id) => this.unlocks.isUnlocked(id));
      this.perksCacheAt = this.data.route.unlocked.length;
    }
    return this.perksCache;
  }
  private perksCache: StationPerks | null = null;
  private perksCacheAt = -1;

  addStars(amount: number, source: string, at?: { x: number; z: number }): void {
    if (amount <= 0) return;
    if (GOD_MODE) amount *= GOD.starMultiplier;
    const levels = this.progression.addStars(amount);
    this.save.markDirty();
    this.events.emit('stars.added', { amount, source, x: at?.x, z: at?.z });
    // Stars fly into the level ring once it is on screen; before that a small float says what was earned.
    if (at && !this.ui.flyStars(amount, at.x, FLOOR_Y + 1.6, at.z)) this.ui.floatText(`+${amount}`, at.x, FLOOR_Y + 1.6, at.z, 'star');
    for (const level of levels) this.onLevelUp(level);
  }

  scenerySpanChanged(): void {
    this.scenery.setSpan(this.map.rearZ);
    this.ambient.setSpan(this.map.rearZ);
  }

  // ─── Main loop ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    // High-refresh screens are held to about 60 fps (config: quality.maxFps): the same smooth motion for half
    // the work and heat. A frame that comes too soon after the last one is skipped (and a device that cannot
    // keep up is held to an even 30: Stage.minFrameMs).
    const frame = (now: number): void => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      if (now - this.lastFrame < this.stage.minFrameMs) return;
      this.perfStats.sample(now - this.lastFrame);
      const real = Math.min(0.25, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.frame(real);
    };
    requestAnimationFrame(frame);
  }

  /**
   * Behind the loading screen (session 26): the game draws its first frames unseen, with a big work budget, so the
   * light bake, the next stretch of scenery and any rebuilds are done (and the JIT and the GPU warmed) before play.
   */
  loading = false;

  /** Nothing is still being built or baked a slice at a time (the loading screen waits for this). */
  get settled(): boolean {
    return !this.background.busy && !this.stage.lightMap.busy && this.scenery.prepared;
  }

  private frame(realDt: number): void {
    frameWork.begin(this.loading ? LOADING_WORK_MS : FRAME_WORK_MS);
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

  private readonly emitChimneySmoke = (x: number, y: number, z: number): void => this.particles.emit('chimney', x, y, z, 1, 0.05);

  /** One simulation step. */
  step(dt: number): void {
    this.time += dt;
    beginMaskFrame();
    this.autopilot.update(dt);
    this.journey.update(dt);
    this.station.update(dt);
    this.scenery.update(dt, this.journey.speed);
    this.updateLean(dt);
    this.ambient.update(dt, this.journey.speed, this.stage.rig.target, this.stage.lighting.night, this.scenery.isHiddenAt);
    this.fireflies.update(dt, this.journey.speed, this.stage.lighting.night, this.stage.renderer.getPixelRatio(), this.scenery.hiddenRegion);
    this.player.update(dt);
    this.footsteps();
    this.zones.update(dt, [this.player, ...this.staff.members]);
    this.guests.update(dt);
    this.venues.update(dt);
    this.staff.update(dt);
    this.crowd.update(dt);
    this.train.update(dt);
    this.tiles.update(dt);
    this.cash.update(dt);
    this.cashView.update(dt);
    this.scenery.smokeChimneys(dt, this.stage.rig.target.z, this.emitChimneySmoke);
    this.particles.update(dt, this.journey.speed);
    this.tweens.update(dt);
    this.guidance.update(dt);
    if (this.guidance.idle && this.data.profile.lifetimePlaySeconds > IDLE_GRACE_SECONDS) this.idleSeconds += dt;
    this.coach.update(dt);
    this.monetization.update(dt);
    this.press.update(dt);
    this.rush.update(dt);
    this.objectives.update(dt);
    this.feedback.update(dt);
    this.save.update(dt);
    if (this.creativeMode && this.wallet.get('cash') < 5000) this.wallet.add('cash', 5000, 'creative');
    if (GOD_MODE) this.topUpGod();
    if (this.lifetimeSeconds() > 720) this.ftue('session_12min');
  }

  /** God mode (config/god.ts): the wallet never runs dry. */
  private topUpGod(): void {
    const w = this.wallet;
    if (w.get('cash') < GOD.cash / 2) w.add('cash', GOD.cash - w.get('cash'), 'dev');
    if (w.get('gems') < GOD.gems / 2) w.add('gems', GOD.gems - w.get('gems'), 'dev');
    if (w.get('railMiles') < GOD.railMiles / 2) w.add('railMiles', GOD.railMiles - w.get('railMiles'), 'dev');
  }

  /** Passengers and crew sway with the train's pull and braking (the rear of the train is +z). */
  private updateLean(dt: number): void {
    if (dt <= 0) return;
    const rules = this.econ.lean;
    const accel = (this.journey.speed - this.lastTrainSpeed) / dt;
    this.lastTrainSpeed = this.journey.speed;
    const target = Math.max(-rules.max, Math.min(rules.max, accel * rules.perAccel));
    CharacterView.lean += (target - CharacterView.lean) * Math.min(1, dt * rules.sharpness);
  }

  private present(realDt: number): void {
    const night = this.updateDayCycle();
    this.audio.setTrainSpeed(this.journey.speed / this.econ.journey.cruiseSpeed);
    this.audio.setNight(night);
    this.audio.update(realDt);
    const rig = this.stage.rig;
    // A clamp only keeps the view on the world (the train, and the platform while the doors are open).
    // Session 38b (after the ad playable): inside the train the view stays over its floor (never drifting over the lake).
    rig.clampX = this.journey.doorsOpen ? [-HALF_WIDTH, PLATFORM_X0 + PLATFORM_WIDTH - 1] : [-INNER + this.econ.camera.clampInset, INNER - this.econ.camera.clampInset];
    rig.clampZ[0] = -GANGWAY_LENGTH - LOCOMOTIVE_LENGTH + VISUALS.camera.endMargin;
    rig.clampZ[1] = this.map.rearZ + REAR_DECK_LENGTH - VISUALS.camera.endMargin * 0.5;
    this.frameCamera(realDt);
    this.updateCinematic(realDt);
    rig.update(realDt, this.player.pos.x, this.player.pos.z);
    this.scenery.present(realDt, rig.focusPoint, night, this.stage.size, rig.zoomNow);
    this.particles.setNight(night);
    // Particle sizes are tuned at one device pixel per CSS pixel: keep them the same size on sharp screens.
    this.particles.setScale(PARTICLE_SCALE * this.stage.renderer.getPixelRatio());
    this.ui.update(realDt);
    // Rebuilds in progress get a slice of every frame, never a whole frame.
    this.background.run(this.loading ? LOADING_WORK_MS : BACKGROUND_BUDGET_MS);
    this.characters.sync(this.stage.rig.camera);
    this.stage.render(realDt);
    this.perfOverlay?.update(realDt, () => this.perfReport());
    this.characterDebug?.update(realDt);
    if (!this.paused && !this.loading) this.trackAnalytics(realDt);
  }

  /** The live performance overlay (`?perf=1` or Developer tools). */
  setPerfOverlay(on: boolean): void {
    if (on && !this.perfOverlay) this.perfOverlay = new PerfOverlay(this.overlayRoot);
    if (!on && this.perfOverlay) {
      this.perfOverlay.remove();
      this.perfOverlay = null;
    }
  }

  get perfOverlayOn(): boolean {
    return this.perfOverlay !== null;
  }

  /** Everything the overlay and the soak test watch: frame time, the renderer's resources, the pools. */
  perfReport(): PerfReport {
    const frame = this.perfStats.summary();
    const info = this.stage.renderer.info;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const people = this.characters.stats();
    const bills = this.cashView.stats();
    const particles = this.particles.stats();
    return {
      fps: frame.fps,
      avgMs: frame.avgMs,
      worstMs: frame.worstMs,
      hitches: this.perfStats.hitches,
      calls: this.stage.drawCalls,
      triangles: this.stage.triangles,
      heapMB: memory ? memory.usedJSHeapSize / 1048576 : null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      characters: people.characters,
      parts: people.parts,
      guests: this.guests.list.length,
      staff: this.staff.members.length,
      bills: bills.bills,
      billCapacity: bills.capacity,
      particles: particles.active,
      particleCapacity: particles.capacity,
      idleSeconds: this.idleSeconds,
      playSeconds: this.lifetimeSeconds(),
    };
  }

  /**
   * Context framing: ease in on the room the conductor is in (a better look at the bed, the mess, the
   * guest), out on the platform, and out a touch with a lead while striding or quick-travelling.
   */
  private frameCamera(dt: number): void {
    // Session 38b (owner, with the ad playable: "camera placement and movement, make it exactly how it is in the ad
    // playable"): centred on the conductor (no lead, no lean over the lake), easing in a little while walking and back
    // out when standing or working, the platform a touch wider. On a wide screen it never comes closer than fits.
    const cam = this.econ.camera;
    const p = this.player;
    const v = p.velocity;
    const speed = Math.hypot(v.x, v.z);
    const aspect = this.stage.rig.camera.aspect;
    const base = aspect > cam.wideAspect ? Math.max(cam.standZoom, cam.wideZoomPerAspect * aspect) : cam.standZoom;
    const want = base * (speed > cam.walkSpeed ? cam.walkZoom : 1);
    this.camZoom += (want - this.camZoom) * Math.min(1, dt * (want < this.camZoom ? cam.zoomInRate : cam.zoomOutRate));
    this.stage.rig.setZoom(this.camZoom);
    let zoom = 1;
    if (p.pos.x > HALF_WIDTH + 0.3) zoom = cam.platformZoom;
    else if (p.travel.active && speed > 0.5) zoom = cam.travelZoom;
    let ox = 0;
    let oz = 0;
    // At Millbrook the old carriage is the star: the view leans toward it from the ticket stand.
    if (p.pos.x > HALF_WIDTH + 0.3 && this.station.prologue && this.train.covered) {
      ox -= cam.prologueLean.x;
      oz += cam.prologueLean.z;
    }
    this.stage.rig.setContext(zoom, ox, oz);
  }
  /** The camera's eased distance factor (session 38b). */
  private camZoom = ECONOMY.camera.standZoom;

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
    // Night is the hero look: held unless the cycle is switched on (and even then, the first session stays night).
    const time = VISUALS.time;
    const holdNight = time.mode === 'night' || (time.firstSessionNight && this.data.profile.sessionCount <= 1);
    const t = this.dayCycleOverride ?? (holdNight ? NIGHT_TIME : ((j.legsCompleted + fraction) / legs + 0.08) % 1);
    // In a rock cutting the moon is hidden and the train's lamps take over.
    this.stage.lighting.darkness = this.scenery.darknessAt(this.stage.rig.focusPoint.z);
    this.stage.lighting.setTime(t);
    return this.stage.lighting.night;
  }

  /** Distance walked since the last footstep, and where the conductor was last frame. */
  /**
   * Session 30 (owner: "fix the footsteps sync"): a soft footfall each time one of the conductor's feet lands in the
   * walk animation, so the sound and the steps you see are the same beat. On the platform and the bare boards of the
   * cheaper refits only (a carriage refitted to `carpetFromTier` or beyond is carpeted, and quiet).
   */
  private footsteps(): void {
    if (!this.player.view.takeFootfall()) return;
    const p = this.player.pos;
    const onPlatform = p.x > PLATFORM_X0 - 0.1;
    const index = Math.max(0, Math.min(this.train.count - 1, Math.floor(p.z / CARRIAGE_PITCH)));
    if (!onPlatform && (this.train.tiers[index] ?? 0) >= AUDIO.footsteps.carpetFromTier) return;
    this.audio.step(onPlatform ? 0.92 : 1);
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
    this.analytics.log('offline_earnings', { amount: earned.amount, minutes: Math.round(earned.seconds / 60) });
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
    if (document.hidden) this.toBackground();
    else this.toForeground();
  }

  private inBackground = false;

  /** The app (or tab) went away: save now, end the session, pause and quiet everything. */
  toBackground(): void {
    if (this.inBackground) return;
    this.inBackground = true;
    this.hiddenAt = Date.now();
    this.analytics.log(EVENTS.sessionEnd, { session_number: this.data.profile.sessionCount, session_seconds: Math.round(this.sessionSeconds) });
    this.analytics.pause();
    this.save.saveNow();
    this.audio.setPaused(true);
    this.paused = true;
  }

  /** Back again: resume (a long time away starts a new session, with offline earnings). */
  toForeground(): void {
    if (!this.inBackground) return;
    this.inBackground = false;
    this.analytics.resume();
    const away = (Date.now() - this.hiddenAt) / 1000;
    this.paused = this.ui.sheetOpen;
    this.audio.setPaused(false);
    this.lastFrame = performance.now();
    if (away >= 60) this.startSession(away, false);
  }

  /** The livery on the train: the player's Paint Shop pick, or the best one earned by reputation. */
  currentLivery(): Livery {
    const chosen = LIVERIES.find((l) => l.id === this.data.cosmetics.livery);
    if (chosen && this.liveryAvailable(chosen)) return chosen;
    return liveryFor(this.data.route.level);
  }

  liveryAvailable(livery: Livery): boolean {
    if (livery.minLevel !== undefined) return this.data.route.level >= livery.minLevel;
    return this.data.cosmetics.owned.includes(livery.id);
  }

  applyLivery(): string {
    const livery = this.currentLivery();
    setLivery(livery.body, livery.trim);
    // The service cars' letterboards wear the train's paint (fix list 5.7).
    if (this.unlocks.isUnlocked('st.nameboards')) this.train.rebuildExterior(true);
    return livery.name;
  }

  /** Paint Shop: pick a livery (null goes back to following reputation). */
  chooseLivery(id: string | null): void {
    this.data.cosmetics.livery = id;
    const name = this.applyLivery();
    this.save.markDirty();
    this.audio.play('sparkle');
    for (let i = 0; i < this.train.count; i++) this.particles.emit('sparkle', 0, FLOOR_Y + 1.2, carriageOriginZ(i) + 7, 10, 2.2);
    this.events.emit('livery.changed', { name, level: this.data.route.level });
  }

  private onLevelUp(level: number): void {
    this.setFlag(`level_${level}`);
    const earned = liveryFor(level);
    if (earned.id !== liveryFor(level - 1).id) {
      // Following reputation: repaint now. Wearing a Paint Shop pick: keep it and mention the new one.
      if (this.data.cosmetics.livery === null) {
        this.applyLivery();
        this.events.emit('livery.changed', { name: earned.name, level });
        for (let i = 0; i < this.train.count; i++) this.particles.emit('sparkle', 0, FLOOR_Y + 1.2, carriageOriginZ(i) + 7, 14, 2.2);
      } else {
        this.ui.toast('New livery', 'paint');
      }
    }
    const outfit = OUTFITS.find((o) => o.minLevel === level);
    // A newly earned outfit goes straight on (fix list 3.3: an unlock should show on the conductor at once; the
    // wardrobe can change it back).
    if (outfit && level > 1) {
      this.data.cosmetics.outfit = outfit.id;
      this.ui.toast('New outfit', 'conductor');
      this.particles.emit('sparkle', this.player.pos.x, FLOOR_Y + 1.2, this.player.pos.z, 18, 0.5);
    }
    if (!this.monetization.enabled && level === this.econ.perks.scooterLevel) {
      this.monetization.grantScooter();
      this.ui.toast('Scooter!', 'scooter');
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
      if (this.train.count >= 3) this.ftue('second_carriage');
      this.analytics.log(EVENTS.carriageCoupled, { index, type, count: this.train.count, time: Math.round(this.lifetimeSeconds()) });
      this.scenerySpanChanged();
      this.tiles.refresh();
      this.save.saveNow();
    });
    e.on('currency.changed', () => undefined);
    // The flow moves on with the ride (the first fare collected, a stop behind the train): what is on show follows.
    e.on('ftue.step', ({ step }) => step === 'first_cash' && this.tiles.refresh());
    e.on('journey.phase', () => this.tiles.refresh());
    // Session 33: the Open carriage tile appears once the last Millbrook ticket is sold.
    e.on('guest.boarded', () => this.station.prologue && this.tiles.refresh());
  }

  applySettings(): void {
    const s = this.data.settings;
    this.audio.setEnabled(s.sound, s.music);
    this.audio.setVolume(s.sfxVolume);
    this.haptics.enabled = s.haptics;
    log.setVerbose(s.devTools);
    this.stage.checkShaderErrors = s.devTools;
  }

  /** A brand-new player gets the intro; anyone returning goes straight back to their train. */
  get isBrandNew(): boolean {
    return this.data.route.stopsCompleted === 0 && this.lifetimeSeconds() < 2;
  }

  private cinematic: { index: number; t: number; done: () => void } | null = null;

  /**
   * The intro (config/coach.ts INTRO_BEATS): the camera opens on the locomotive at Millbrook, glides into
   * the lobby, settles on the desk, one caption per beat. The game stays paused until it ends (or is
   * skipped), so the first minute of play is untouched.
   */
  playIntro(done: () => void): void {
    // Skipped before it could start (tools and tests skip it while the shaders are still compiling).
    if (this.introSkipped) {
      done();
      return;
    }
    this.paused = true;
    this.cinematic = { index: -1, t: 0, done };
    this.stage.rig.showWorldUi(false);
    this.audio.play('whistle');
  }

  skipIntro(): void {
    if (!this.cinematic) {
      this.introSkipped = true;
      return;
    }
    this.finishIntro();
  }

  private introSkipped = false;

  /** Tools and tests skip the intro before the game has even started: the loading screen then gets out of their way. */
  get skippedEarly(): boolean {
    return this.introSkipped;
  }

  get inIntro(): boolean {
    return this.cinematic !== null;
  }

  private finishIntro(): void {
    const c = this.cinematic;
    if (!c) return;
    this.cinematic = null;
    this.stage.rig.showWorldUi(true);
    this.ui.showCaption(null);
    // Back to the conductor with a short glide, then play.
    this.stage.rig.focusOn(new THREE.Vector3(this.player.pos.x, 0, this.player.pos.z), 0.01, 1);
    this.paused = false;
    c.done();
  }

  private updateCinematic(realDt: number): void {
    const c = this.cinematic;
    if (!c) return;
    c.t += realDt;
    const beat = INTRO_BEATS[c.index];
    if (beat && c.t < beat.seconds) return;
    c.index++;
    c.t = 0;
    const next = INTRO_BEATS[c.index];
    if (!next) {
      this.finishIntro();
      return;
    }
    // Session 23: the engine at Millbrook, then the old carriage under its canvas, then the ticket stand and its queue.
    const target = next.focus === 'locomotive'
      ? new THREE.Vector3(1.6, 0, -4.2)
      : next.focus === 'lobby'
        ? new THREE.Vector3(0.6, 0, 8.0)
        : new THREE.Vector3(PLATFORM.window.x + 0.9, 0, PLATFORM.window.z + 0.4);
    this.stage.rig.focusOn(target, next.seconds + 0.6, next.zoom, 1.5);
    this.ui.showCaption({ kicker: next.kicker, text: next.text });
  }

  /** Train map tap: dash to what that carriage needs, or to its middle. */
  travelToCarriage(index: number): void {
    this.coach.learn('map');
    if (index < 0 || index >= this.train.count) return;
    this.player.travelTo(this.needs.destination(index));
    this.setFlag('coach_map');
  }

  // ─── Dev tools ──────────────────────────────────────────────────────────────

  /** Spends Rail Miles on the next level of a conductor upgrade (the Conductor sheet and the autopilot). */
  buyConductorUpgrade(key: 'speed' | 'capacity' | 'fareBonus'): boolean {
    const cost = conductorCost(this.econ.conductor[key], this.data.conductor[key]);
    if (cost === null || !this.wallet.trySpend('railMiles', cost, `conductor:${key}`)) return false;
    this.data.conductor[key]++;
    this.save.markDirty();
    this.events.emit('conductor.upgraded', { key, level: this.data.conductor[key] });
    this.audio.play('unlock');
    this.particles.emit('star', this.player.pos.x, 1.8, this.player.pos.z, 12, 0.4);
    return true;
  }

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
      frameWork.begin(FRAME_WORK_MS);
      this.step(dt);
      this.background.run(BACKGROUND_BUDGET_MS);
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

  get catalogue(): typeof CARRIAGE_CATALOGUE {
    return CARRIAGE_CATALOGUE;
  }
}
