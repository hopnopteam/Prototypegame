import type { ObjectiveDef } from '../config/objectives';
import * as THREE from 'three';
import type { ProductDef } from '../config/content';
import type { CeremonyDef, InterviewDef } from '../config/press';
import { damp, formatClock, formatNumber } from '../core/math';
import type { CarriageType } from '../core/types';
import type { StationResult } from '../gameplay/events';
import type { Game } from '../gameplay/Game';
import type { DoubleChoice, GameUi } from '../gameplay/GameUi';
import type { OfferView } from '../gameplay/Monetization';
import type { CeremonyResult, FrontPageReward, RivalWatch } from '../gameplay/Press';
import type { CarriageChoiceView, FloatKind } from '../gameplay/UiApi';
import type { NewsItem } from '../save/SaveData';
import { h, icon, setText, setVisible } from './dom';
import type { IconName } from './icons';
import { PressScreens } from './PressScreens';
import { levelPerks, Screens } from './Screens';
import { TrainMapUi } from './TrainMapUi';

interface Floating {
  el: HTMLElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
  rise: number;
  /** Speech bubbles are kept whole inside the play area. */
  speech: boolean;
  width: number;
}

/** A note flying from the conductor's head to the cash counter; the counter ticks up as each one lands. */
interface Flyer {
  el: HTMLElement;
  t: number;
  delay: number;
  fromX: number;
  fromY: number;
  amount: number;
  /** Cash notes land on the cash counter, stars in the route-level ring. */
  to: 'cash' | 'level';
}

/** The part of the screen the world owns: between the side columns, below the top bar, above the offer. */
interface PlayRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Floats spawned close together (same place, same moment) stack upward instead of overprinting. */
const FLOAT_STACK_METRES = 0.34;
const FLOAT_NEAR = 0.9;
const FLOAT_LIFE = 1.15;
const EDGE = 6;
const FLYER_SECONDS = 0.5;
/** Stars float a moment where they were earned before flying to the level ring. */
const STAR_FLY_DELAY = 0.45;
/** Share of a level's stars at which the next level's reward is teased. */
const LEVEL_TEASE_AT = 0.75;
/** The Rush chip sits this far below the conductor's feet (px). */
const RUSH_CHIP_OFFSET = 14;
/** The head counter waits this long after the last bill before sending the total to the counter. */
const BURST_HOLD_SECONDS = 0.35;
/** Tile labels show for the nearest tile within this many metres, floating this high above it. */
const TILE_TAG_RANGE = 2.6;
const TILE_TAG_HEIGHT = 1.35;
/** Coach labels float above the guidance arrow. */
const GUIDE_HEIGHT = 2.55;
const TOAST_SECONDS = 2.6;
const MAX_TOASTS = 2;
/** At most one guest line on screen, and a breather between them: personality, not chatter. */
const SPEECH_GAP_SECONDS = 4;
const RESULT_SECONDS = 5.5;
/** Seconds a queued announcement may wait (behind another one or an open sheet) before it is dropped. */
const BANNER_MAX_DELAY = 5;
const CELEBRATE_MAX_DELAY = 60;

/**
 * The DOM layer. Layout contract (styles.css header): a top bar (level, cash, gems; then the journey
 * strip), a left column (train map) and a right column (menu, shop, conductor, boosts) of the same width,
 * the middle column under the top bar for the station ticket, and one bottom slot for an offer with at
 * most two toasts above it. World-anchored text (numbers, speech, tile labels, coach lines) is clamped to
 * the play rect between those, so nothing the world says ever sits on the HUD. HUD pieces appear only
 * once they mean something. Writes to the DOM only when a value changes.
 */
export class Ui implements GameUi {
  readonly root: HTMLElement;
  game!: Game;
  readonly screens: Screens;
  readonly pressScreens: PressScreens;
  private readonly floats: Floating[] = [];
  private readonly floatLayer: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private readonly offerLayer: HTMLElement;
  private readonly boostLayer: HTMLElement;
  private readonly pointerEl: HTMLElement;
  private readonly guide: { el: HTMLElement; icon: HTMLElement; text: HTMLElement; key: string };
  /** The intro's caption card and its Skip button. */
  private readonly caption: { el: HTMLElement; kicker: HTMLElement; text: HTMLElement; skip: HTMLElement };
  private readonly gesture: HTMLElement;
  private readonly tileTag: { el: HTMLElement; name: HTMLElement; effect: HTMLElement; key: string };
  private readonly trainMap: TrainMapUi;
  private readonly hud: {
    top: HTMLElement; cash: HTMLElement; cashVal: HTMLElement; gems: HTMLElement; gemsVal: HTMLElement;
    level: HTMLButtonElement; levelBadge: HTMLElement; levelCount: HTMLElement;
    journey: HTMLElement; journeyKicker: HTMLElement; journeyName: HTMLElement; journeyTrain: HTMLElement; journeyTrack: HTMLElement; journeyClock: HTMLElement;
    side: HTMLElement; menu: HTMLButtonElement; menuDot: HTMLElement; shop: HTMLButtonElement; conductor: HTMLButtonElement; conductorDot: HTMLElement;
  };
  private displayedCash = 0;
  private lastCash = 0;
  private readonly objective: { el: HTMLElement; icon: HTMLElement; text: HTMLElement; fill: HTMLElement; count: HTMLElement; reward: HTMLElement; key: string };
  /** Where the tile label is on screen this frame (other labels keep clear of it). */
  private tileTagBox: { x0: number; x1: number; y0: number; y1: number } | null = null;
  private readonly rushChip: { el: HTMLElement; count: HTMLElement; bar: HTMLElement; streak: number };
  /** Stars already earned but still flying to the level ring. */
  private pendingStars = 0;
  /** Cash already in the wallet but still flying to the counter (shown once it lands). */
  private pendingHud = 0;
  private readonly burst = { el: null as unknown as HTMLElement, value: null as unknown as HTMLElement, total: 0, shown: 0, idle: 0, pop: 0, active: false };
  private readonly flyers: Flyer[] = [];
  private offersKey = '';
  private resultEl: HTMLElement | null = null;
  private resultTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  private readonly rect: PlayRect = { left: 0, right: 0, top: 0, bottom: 0 };
  private rectTimer = 0;
  private sinceSpeech = 99;
  private hidden = false;
  /**
   * Big centre-screen moments play one at a time so they never pile on top of each other. Each has a
   * deadline in game time (which stops while a sheet is open): a station banner is only worth showing
   * while the train is actually at that station.
   */
  private readonly announcements: { play: () => number; expires: number }[] = [];
  private announcementTimer = 0;
  private cardTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screens = new Screens(this);
    this.pressScreens = new PressScreens(this.screens, this);

    const cashVal = h('span.val', { text: '0' });
    const gemsVal = h('span.val', { text: '0' });
    const cash = h('div.pill.cash', { 'aria-label': 'Fares' }, icon('cash', 24), cashVal);
    const gems = h('div.pill.gems', { 'aria-label': 'Gems' }, icon('gem', 20), gemsVal);
    // MPH-style level: a gold star with the number, and a star bar with the count beside it.
    const levelBadge = h('div.badge', { text: '1' });
    const levelCount = h('span.lv-count', { text: '0/0' });
    const level = h('button.level', { title: 'Route level', 'aria-label': 'Route level', onclick: () => this.tap(() => this.screens.progress()) }, h('div.lv-star', {}, levelBadge), h('div.lv-bar', {}, h('i'), levelCount));
    const journeyKicker = h('span.kicker', { text: 'Next' });
    const journeyName = h('span.name', { text: 'Millbrook' });
    const journeyTrain = h('div.train');
    const journeyTrack = h('div.track', {}, journeyTrain);
    const journeyClock = h('span.clock');
    const journey = h('div.journey', {}, journeyKicker, journeyName, journeyTrack, journeyClock);
    const top = h('div.hud-top', {}, h('div.hud-row', {}, level, cash, gems), journey);

    const button = (name: IconName, label: string, onclick: () => void): HTMLButtonElement =>
      h('button', { 'aria-label': label, title: label, onclick: () => this.tap(onclick) }, icon(name, 28));
    const menuDot = h('span.dot', { hidden: true });
    const menu = button('menu', 'Menu', () => this.screens.menu());
    menu.appendChild(menuDot);
    const shop = button('bag', 'Shop', () => this.screens.store());
    const conductorDot = h('span.dot', { hidden: true });
    const conductor = button('conductor', 'Conductor: upgrades and outfits', () => this.screens.upgrades());
    conductor.appendChild(conductorDot);
    this.boostLayer = h('div.boost');
    const side = h('div.side', {}, menu, shop, conductor, this.boostLayer);

    this.floatLayer = h('div.floats');
    this.burst.value = h('span', { text: '+0' });
    this.burst.el = h('div.burst', { hidden: true }, icon('cash', 26), this.burst.value);
    this.floatLayer.appendChild(this.burst.el);
    this.toastLayer = h('div.toasts');
    this.offerLayer = h('div.offers');
    this.pointerEl = h('div.pointer', { hidden: true });
    const guideIcon = h('span.guide-icon');
    const guideText = h('span.guide-text');
    this.guide = { el: h('div.guide', { role: 'status', hidden: true }, guideIcon, guideText), icon: guideIcon, text: guideText, key: '' };
    this.gesture = h('div.gesture', { hidden: true, 'aria-hidden': 'true' }, h('div.track'), icon('hand', 44, 'ico hand'), h('div.label', { text: 'Drag anywhere to walk' }));
    const tagName = h('b');
    const tagEffect = h('span');
    this.tileTag = { el: h('div.tile-tag', { hidden: true }, tagName, tagEffect), name: tagName, effect: tagEffect, key: '' };
    this.trainMap = new TrainMapUi(() => this.game);
    const rushCount = h('b', { text: '' });
    const rushBar = h('i');
    this.rushChip = { el: h('div.rush', { hidden: true, 'aria-hidden': 'true' }, h('span', { text: 'Rush' }), rushCount, h('div.bar', {}, rushBar)), count: rushCount, bar: rushBar, streak: 0 };
    const objIcon = h('span.obj-icon');
    const objText = h('span.obj-text');
    const objFill = h('i');
    const objCount = h('span.obj-count');
    const objReward = h('span.obj-reward');
    this.objective = {
      el: h('div.objective', { role: 'status', hidden: true, onclick: () => this.objectiveTapped() }, objIcon, h('div.obj-body', {}, objText, h('div.obj-bar', {}, h('div.obj-track', {}, objFill), objCount)), objReward),
      icon: objIcon, text: objText, fill: objFill, count: objCount, reward: objReward, key: '',
    };
    const captionKicker = h('div.cine-kicker');
    const captionText = h('div.cine-text');
    const skip = h('button.cine-skip', { hidden: true, onclick: () => this.game?.skipIntro() }, 'Skip ›');
    this.caption = { el: h('div.cine-caption', { hidden: true, role: 'status' }, captionKicker, captionText), kicker: captionKicker, text: captionText, skip };
    root.append(this.caption.el, skip);
    root.append(this.floatLayer, this.tileTag.el, this.rushChip.el, this.guide.el, top, this.objective.el, side, this.trainMap.el, this.offerLayer, this.toastLayer, this.gesture, this.pointerEl);

    this.hud = { top, cash, cashVal, gems, gemsVal, level, levelBadge, levelCount, journey, journeyKicker, journeyName, journeyTrain, journeyTrack, journeyClock, side, menu, menuDot, shop, conductor, conductorDot };
    window.addEventListener('resize', () => (this.rectTimer = 0));
  }

  private tap(action: () => void): void {
    this.game.audio.play('click');
    action();
  }

  bind(game: Game): void {
    this.game = game;
    this.displayedCash = game.wallet.get('cash');
    this.lastCash = this.displayedCash;
    game.events.on('currency.changed', ({ kind, delta }) => {
      if (delta <= 0 || kind === 'railMiles') return;
      const el = kind === 'cash' ? this.hud.cash : this.hud.gems;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  }

  // ─── Per-frame ──────────────────────────────────────────────────────────────

  update(dt: number): void {
    const g = this.game;
    if (!g) return;
    this.sinceSpeech += dt;
    this.rectTimer -= dt;
    if (this.rectTimer <= 0) this.measure();
    this.updateHud(dt);
    this.updateOffers(g.monetization.offers);
    this.updateFloats(dt);
    this.updateBurst(dt);
    this.updatePointer();
    this.updateGuide();
    this.updateTileTag();
    this.updateRush();
    this.updateObjective();
    this.trainMap.update(dt);
    if (this.resultEl) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.dismissResult();
    }
    this.announcementTimer -= dt;
    // Never play a banner over a sheet: it would hide the sheet's buttons and the player would miss it.
    while (this.announcements.length > 0 && this.announcements[0].expires < g.time) this.announcements.shift();
    if (this.announcementTimer <= 0 && this.announcements.length > 0 && !this.screens.isOpen) this.announcementTimer = this.announcements.shift()!.play();
  }

  /** Recomputes the play rect from the HUD's real boxes (cheap; twice a second and on resize). */
  private measure(): void {
    this.rectTimer = 0.5;
    const rootRect = this.root.getBoundingClientRect();
    const top = this.hud.journey.getBoundingClientRect();
    const side = this.hud.side.getBoundingClientRect();
    const map = this.trainMap.el.getBoundingClientRect();
    const offer = this.offerLayer.getBoundingClientRect();
    const r = this.rect;
    r.top = (top.bottom > 0 ? top.bottom : 90) - rootRect.top + EDGE;
    r.left = (map.width > 0 ? map.right - rootRect.left : 0) + EDGE;
    r.right = (side.width > 0 ? side.left - rootRect.left : rootRect.width) - EDGE;
    r.bottom = (offer.height > 0 ? offer.top - rootRect.top : rootRect.height - 80) - EDGE;
    // The station ticket takes the top of the middle column while it is up.
    // Its layout box, not its animated one: measured mid-slide it would read too short for half a second.
    if (this.resultEl) r.top = Math.max(r.top, this.resultEl.offsetTop + this.resultEl.offsetHeight + EDGE);
    // The objective banner takes the same slot when the ticket is not up.
    const banner = this.objective.el;
    if (!banner.hidden) r.top = Math.max(r.top, banner.offsetTop + banner.offsetHeight + EDGE);
    // Toasts sit above the offer slot: world text stays above them.
    const toast = this.toastLayer.lastElementChild?.getBoundingClientRect();
    if (toast && toast.height > 0) r.bottom = Math.min(r.bottom, toast.top - rootRect.top - EDGE);
  }

  private updateHud(dt: number): void {
    const g = this.game;
    const hud = this.hud;
    const cash = Math.max(0, g.wallet.get('cash') - this.pendingHud);
    // Roll the counter toward the real value so earnings feel like a flow, not a jump.
    this.displayedCash = Math.abs(cash - this.displayedCash) < 1 ? cash : damp(this.displayedCash, cash, 12, dt);
    if (cash < this.lastCash) this.displayedCash = Math.min(this.displayedCash, cash + (this.displayedCash - cash) * 0.5);
    this.lastCash = cash;
    setText(hud.cashVal, formatNumber(this.displayedCash));
    setText(hud.gemsVal, formatNumber(g.wallet.get('gems')));

    // Progressive reveal: each piece of the HUD arrives when it starts to matter.
    const ftue = g.data.profile.ftue;
    const flags = g.data.profile.flags;
    this.reveal(hud.level, ftue.first_unlock !== undefined || g.progression.level > 1);
    this.reveal(hud.journey, ftue.first_unlock !== undefined || g.journey.phase === 'arriving' || g.journey.phase === 'stationStop' || g.data.route.stopsCompleted > 0);
    this.reveal(hud.gems, g.wallet.get('gems') > 0 || !!flags.firstStationDone);
    this.reveal(hud.shop, !!flags.firstStationDone);
    const upgradesOpen = g.progression.isFeatureUnlocked('conductorUpgrades');
    this.reveal(hud.conductor, upgradesOpen);

    const p = g.progression;
    const lp = p.levelProgress();
    setText(hud.levelBadge, String(p.level));
    const shownStars = Math.max(0, Math.round(lp.current - this.pendingStars));
    setText(hud.levelCount, p.isMaxLevel ? 'Max' : `${Math.min(shownStars, lp.needed)}/${lp.needed}`);
    // The ring fills as the stars land in it (a level-up shows at once, so its card is never ahead of the ring).
    const shown = lp.needed > 0 ? Math.max(0, lp.current - this.pendingStars) / lp.needed : lp.fraction;
    const ring = (Math.round(Math.min(lp.fraction, shown) * 100) / 100).toFixed(2);
    if (hud.level.style.getPropertyValue('--p') !== ring) hud.level.style.setProperty('--p', ring);
    hud.level.classList.toggle('max', p.isMaxLevel);
    // Nearly there: say once what the next level brings, so the last few stars have a goal.
    if (!p.isMaxLevel && lp.fraction >= LEVEL_TEASE_AT && !g.flag(`tease_${p.level + 1}`)) {
      g.setFlag(`tease_${p.level + 1}`);
      const perk = levelPerks(p.level + 1)[0];
      if (perk) this.toast(`Almost level ${p.level + 1}: ${perk}`, 'star');
    }
    const label = p.isMaxLevel ? `Route level ${p.level}, max` : `Route level ${p.level}: ${lp.current} of ${lp.needed} stars`;
    if (hud.level.title !== label) {
      hud.level.title = label;
      hud.level.setAttribute('aria-label', label);
    }

    const j = g.journey;
    const station = g.station.currentStation();
    const stopped = j.phase === 'stationStop';
    hud.journey.classList.toggle('stop', stopped);
    hud.journey.classList.toggle('urgent', stopped && j.timeLeft <= g.econ.journey.lastCallSeconds);
    setText(hud.journeyKicker, stopped ? 'Now' : 'Next');
    setText(hud.journeyName, station.name);
    setVisible(hud.journeyTrack, !stopped);
    const left = `${Math.round(j.legProgress * 100)}%`;
    if (hud.journeyTrain.style.left !== left) hud.journeyTrain.style.left = left;
    setText(hud.journeyClock, stopped ? formatClock(j.timeLeft) : j.phase === 'arriving' ? 'Arriving' : '');

    const affordable = upgradesOpen && this.screens.affordableUpgrades() > 0;
    setVisible(hud.conductorDot, affordable);
    hud.conductor.classList.toggle('glow', affordable);
    const dailyCount = g.meta.claimableQuests() + (g.meta.canClaimLogin() ? 1 : 0);
    setVisible(hud.menuDot, dailyCount > 0);
    setText(hud.menuDot, String(dailyCount));

    // Boost timers, at the foot of the rail.
    const boostLeft = (g.data.monetization.speedBoostUntil - Date.now()) / 1000;
    const doubled = g.data.monetization.doubleFaresStop !== null && g.data.monetization.doubleFaresStop >= g.journey.stopSerial && g.data.monetization.doubleFaresStop <= g.journey.stopSerial + 1;
    const boostKey = `${boostLeft > 0 ? Math.ceil(boostLeft) : 0}|${doubled}`;
    if (this.boostLayer.dataset.key !== boostKey) {
      this.boostLayer.dataset.key = boostKey;
      this.boostLayer.replaceChildren();
      if (boostLeft > 0) this.boostLayer.append(h('div.badge', { title: 'Roller skates' }, icon('skate', 24), h('span', { text: formatClock(boostLeft) })));
      if (doubled) this.boostLayer.append(h('div.badge', { title: 'Double fares at the next stop' }, icon('double', 24), h('span', { text: '×2' })));
    }
  }

  /** Shows an element with a little pop the first time it appears; keeps its layout slot while hidden. */
  private reveal(el: HTMLElement, show: boolean): void {
    const shown = !el.classList.contains('unrevealed');
    if (show === shown) return;
    el.classList.toggle('unrevealed', !show);
    if (show) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
      this.rectTimer = 0;
    }
  }

  /** One offer at a time, in the one bottom slot: the most relevant one comes first from Monetization. */
  private updateOffers(all: OfferView[]): void {
    const offers = all.slice(0, 1);
    const key = offers.map((o) => `${o.id}:${o.label}`).join('|');
    if (key === this.offersKey) return;
    this.offersKey = key;
    this.rectTimer = 0;
    this.offerLayer.replaceChildren(
      ...offers.map((offer) =>
        h('div.chip', {},
          icon(offer.icon, 32),
          h('div.txt', {}, h('b', { text: offer.label }), h('span', { text: offer.detail })),
          h('button.watch', { 'aria-label': `Watch an ad: ${offer.detail}`, onclick: () => void this.game.monetization.accept(offer.id, false) }, icon('ad', 22), 'Free'),
          h('button.gems', { 'aria-label': `Pay ${offer.gemCost} gems: ${offer.detail}`, onclick: () => void this.game.monetization.accept(offer.id, true) }, icon('gem', 20), String(offer.gemCost)),
        ),
      ),
    );
  }

  private updateFloats(dt: number): void {
    const stage = this.game.stage;
    const r = this.rect;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      this.tmp.copy(f.pos);
      this.tmp.y += t * f.rise;
      if (!stage.project(this.tmp, this.screen)) {
        f.el.style.opacity = '0';
        continue;
      }
      if (f.width === 0) f.width = f.el.offsetWidth;
      const half = f.width / 2 + EDGE;
      // Kept whole inside the play rect; anything that would drift under the HUD fades out instead.
      const x = Math.min(Math.max(this.screen.x, r.left + half), r.right - half);
      const y = this.screen.y;
      let opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (y < r.top + 14 || y > r.bottom - 10) opacity = 0;
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.25 ? 1.1 - ((t - 0.15) / 0.1) * 0.1 : 1;
      f.el.style.opacity = String(opacity);
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    }
  }

  /** Head counter: rolls up while bills stream in, then splits into notes that fly to the counter. */
  private updateBurst(dt: number): void {
    const b = this.burst;
    if (b.active) {
      const before = Math.floor(b.shown);
      b.shown = Math.min(b.total, b.shown + Math.max(1, b.total - b.shown) * dt * 7);
      if (Math.floor(b.shown) !== before) b.pop = 1;
      if (b.shown >= b.total) b.idle += dt;
      const player = this.game.player.pos;
      this.tmp.set(player.x, 2.55, player.z);
      if (this.game.stage.project(this.tmp, this.screen)) {
        b.pop = Math.max(0, b.pop - dt * 6);
        const scale = 1 + b.pop * 0.18;
        const r = this.rect;
        const y = Math.max(this.screen.y, r.top + 20);
        b.el.style.transform = `translate(${this.screen.x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
      }
      setText(b.value, `+${formatNumber(b.shown)}`);
      if (b.idle > BURST_HOLD_SECONDS) this.sendBurstToCounter();
    }
    this.updateFlyers(dt);
  }

  private sendBurstToCounter(): void {
    const b = this.burst;
    const total = b.total;
    const count = Math.max(3, Math.min(8, Math.round(total / 5)));
    const rootRect = this.root.getBoundingClientRect();
    const start = b.el.getBoundingClientRect();
    const fromX = start.left + start.width / 2 - rootRect.left;
    const fromY = start.top + start.height / 2 - rootRect.top;
    let assigned = 0;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? total - assigned : Math.floor(total / count);
      assigned += amount;
      const el = icon('cash', 28, 'ico flyer');
      this.floatLayer.appendChild(el);
      this.flyers.push({ el, t: 0, delay: i * 0.045, fromX: fromX + (Math.random() - 0.5) * 24, fromY: fromY + (Math.random() - 0.5) * 12, amount, to: 'cash' });
    }
    b.active = false;
    b.total = 0;
    b.shown = 0;
    b.idle = 0;
    b.el.classList.add('out');
    window.setTimeout(() => {
      if (!b.active) b.el.hidden = true;
      b.el.classList.remove('out');
    }, 220);
  }

  private updateFlyers(dt: number): void {
    if (this.flyers.length === 0) return;
    const rootRect = this.root.getBoundingClientRect();
    const cashRect = this.hud.cash.getBoundingClientRect();
    const levelRect = this.hud.level.getBoundingClientRect();
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      const target = f.to === 'cash' ? cashRect : levelRect;
      const tx = (f.to === 'cash' ? target.left + 22 : target.left + target.width / 2) - rootRect.left;
      const ty = target.top + target.height / 2 - rootRect.top;
      if (f.delay > 0) {
        f.delay -= dt;
        f.el.style.opacity = '0';
        continue;
      }
      f.t += dt / FLYER_SECONDS;
      const t = Math.min(1, f.t);
      // Ease in: the notes linger a moment, then snap into the counter.
      const k = t * t * (3 - 2 * t) * 0.35 + t * t * 0.65;
      const x = f.fromX + (tx - f.fromX) * k + Math.sin(t * Math.PI) * 40 * (i % 2 ? 1 : -1);
      const y = f.fromY + (ty - f.fromY) * k - Math.sin(t * Math.PI) * 30;
      const scale = 1 - t * 0.35;
      f.el.style.opacity = '1';
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${t * 220}deg) scale(${scale})`;
      if (t >= 1) {
        f.el.remove();
        this.flyers.splice(i, 1);
        const pill = f.to === 'cash' ? this.hud.cash : this.hud.level;
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
        if (f.to === 'cash') {
          this.pendingHud = Math.max(0, this.pendingHud - f.amount);
          this.game.audio.play('coin', { pitch: 2.4, volume: 0.35 });
        } else {
          this.pendingStars = Math.max(0, this.pendingStars - f.amount);
          this.game.audio.play('star', { pitch: 1 + Math.random() * 0.2 });
        }
      }
    }
  }

  /**
   * The coach line, right where the action is: over the spot in the world (at the play rect's edge with
   * an arrow when the spot is off screen), beside the HUD button it is about, or as the walk gesture.
   */
  private updateGuide(): void {
    const g = this.game;
    const line = this.hidden || this.screens.isOpen ? null : g.coach.current;
    // The walk gesture gives way to a centre card or a toast (it would sit on top of them).
    const busyCentre = this.root.classList.contains('has-card') || this.toastLayer.childElementCount > 0;
    const gestureOn = !!line && 'gesture' in line.anchor && !busyCentre;
    setVisible(this.gesture, gestureOn);
    const labelled = line && !gestureOn ? line : null;
    const key = labelled ? `${labelled.id}` : '';
    if (key !== this.guide.key) {
      this.guide.key = key;
      setVisible(this.guide.el, !!labelled);
      if (labelled) {
        this.guide.icon.replaceChildren(icon(labelled.icon, 22));
        this.guide.text.textContent = labelled.text;
        this.guide.el.classList.remove('in');
        void this.guide.el.offsetWidth;
        this.guide.el.classList.add('in');
      }
    }
    if (!labelled) return;
    const el = this.guide.el;
    const r = this.rect;
    const rootRect = this.root.getBoundingClientRect();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let x = 0;
    let y = 0;
    let tail = 'down';
    const anchor = labelled.anchor;
    if ('hud' in anchor) {
      // Beside the button: the train map on the left, the conductor button on the right.
      const target = (anchor.hud === 'map' ? this.trainMap.el : this.hud.conductor).getBoundingClientRect();
      // The station ticket reaches down beside the rail; the line waits until it has gone.
      if (target.width === 0 || this.resultEl) {
        el.style.opacity = '0';
        return;
      }
      if (anchor.hud === 'map') {
        x = target.right - rootRect.left + 10 + width / 2;
        tail = 'left';
      } else {
        x = target.left - rootRect.left - 10 - width / 2;
        tail = 'right';
      }
      y = target.top - rootRect.top + target.height / 2;
      // Only beside a button that is really there and below the top bar (never over the counters, even for
      // the frame a button is still revealing).
      const style = getComputedStyle(anchor.hud === 'map' ? this.trainMap.el : this.hud.conductor);
      // Slide down below the banner if need be, as long as it still sits beside the button.
      y = Math.max(y, r.top + height / 2);
      const beside = y - height / 2 < target.bottom - rootRect.top - 6;
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.5 || !beside || y + height / 2 > r.bottom) {
        el.style.opacity = '0';
        return;
      }
    } else if ('world' in anchor) {
      this.tmp.set(anchor.world.x, GUIDE_HEIGHT, anchor.world.z);
      const onScreen = g.stage.project(this.tmp, this.screen);
      x = this.screen.x;
      y = this.screen.y - height / 2;
      if (!onScreen || y < r.top + height / 2 || y > r.bottom - height / 2) {
        // Off screen: park at the edge in its direction, pointing the way.
        tail = !onScreen || this.screen.y > r.bottom ? 'down' : 'up';
        y = tail === 'down' ? r.bottom - height / 2 - 8 : r.top + height / 2 + 8;
      }
    }
    x = Math.min(Math.max(x, r.left + width / 2), r.right - width / 2);
    el.dataset.tail = tail;
    el.style.opacity = '1';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  /** Names the nearest tile and says what it does, so nothing is bought blind. */
  private updateTileTag(): void {
    const g = this.game;
    const guideOn = !this.guide.el.hidden;
    const tag = this.hidden || guideOn ? null : g.tiles.nearTag(g.player.pos, TILE_TAG_RANGE);
    const t = this.tileTag;
    const key = tag ? `${tag.label}|${tag.effect}` : '';
    if (key !== t.key) {
      t.key = key;
      setVisible(t.el, !!tag);
      if (tag) {
        t.name.textContent = tag.label;
        t.effect.textContent = tag.effect;
        t.el.classList.toggle('locked', tag.locked);
      }
    }
    this.tileTagBox = null;
    if (!tag) return;
    this.tmp.set(tag.x, TILE_TAG_HEIGHT, tag.z);
    const r = this.rect;
    if (!g.stage.project(this.tmp, this.screen) || this.screen.y - t.el.offsetHeight < r.top || this.screen.y > r.bottom) {
      t.el.style.opacity = '0';
      return;
    }
    const half = t.el.offsetWidth / 2;
    const x = Math.min(Math.max(this.screen.x, r.left + half), r.right - half);
    this.tileTagBox = { x0: x - half, x1: x + half, y0: this.screen.y - t.el.offsetHeight, y1: this.screen.y + 6 };
    t.el.style.opacity = '1';
    t.el.style.transform = `translate(${x}px, ${this.screen.y}px) translate(-50%, -100%)`;
  }

  /**
   * The objective banner (MPH-style task): the current goal, a progress bar and its reward. It shares the
   * middle column with the station ticket and steps aside while the ticket is up.
   */
  private updateObjective(): void {
    const g = this.game;
    const o = this.objective;
    const def = g.objectives.current;
    const show = !!def && !this.hidden && !this.resultEl && g.data.profile.ftue.first_checkin !== undefined;
    setVisible(o.el, show);
    if (!show || !def) return;
    const done = g.objectives.done;
    const { progress, target } = g.objectives.shown;
    const key = `${def.id}|${progress}|${done}`;
    if (key === o.key) return;
    const fresh = !o.key.startsWith(`${def.id}|`);
    o.key = key;
    o.el.classList.toggle('done', done);
    o.el.classList.toggle('interactive', def.event === 'conductor' && !done);
    o.icon.replaceChildren(icon(done ? 'check' : def.icon, 26));
    setText(o.text, done ? 'Done!' : def.text);
    o.fill.style.transform = `scaleX(${Math.min(1, progress / target).toFixed(3)})`;
    setText(o.count, `${Math.min(progress, target)}/${target}`);
    const r = def.reward;
    o.reward.replaceChildren(...(r.cash ? [icon('cash', 18), document.createTextNode(String(r.cash))] : r.gems ? [icon('gem', 16), document.createTextNode(String(r.gems))] : r.railMiles ? [icon('miles', 16), document.createTextNode(String(r.railMiles))] : []));
    if (fresh) {
      o.el.classList.remove('pop');
      void o.el.offsetWidth;
      o.el.classList.add('pop');
      this.rectTimer = 0;
    }
  }

  /** Goals that live in a menu open it when the banner is tapped (the rest just point the way in the world). */
  private objectiveTapped(): void {
    const def = this.game.objectives.current;
    if (!def || this.game.objectives.done) return;
    if (def.event === 'conductor') this.tap(() => this.screens.upgrades());
  }

  objectiveDone(def: ObjectiveDef): void {
    const cash = def.reward.cash ?? 0;
    const o = this.objective.el;
    o.classList.remove('flash');
    void o.offsetWidth;
    o.classList.add('flash');
    if (cash <= 0 || o.hidden) return;
    // The reward flies from the banner's chip into the cash counter (shown as it lands).
    const rootRect = this.root.getBoundingClientRect();
    const chip = this.objective.reward.getBoundingClientRect();
    const count = Math.max(2, Math.min(6, Math.round(cash / 5)));
    let assigned = 0;
    for (let i = 0; i < count; i++) {
      const amount = i === count - 1 ? cash - assigned : Math.floor(cash / count);
      assigned += amount;
      const el = icon('cash', 26, 'ico flyer');
      this.floatLayer.appendChild(el);
      this.flyers.push({ el, t: 0, delay: 0.25 + i * 0.06, fromX: chip.left + chip.width / 2 - rootRect.left, fromY: chip.top + chip.height / 2 - rootRect.top, amount, to: 'cash' });
    }
    this.pendingHud += cash;
  }

  /** The Rush chip under the conductor: the streak count and a bar draining toward the lapse. */
  private updateRush(): void {
    const g = this.game;
    const rush = g.rush;
    const chip = this.rushChip;
    const on = !this.hidden && !this.screens.isOpen && rush.streak >= 2;
    if (on && chip.el.hidden) chip.el.style.opacity = '0';
    setVisible(chip.el, on);
    if (!on) {
      chip.streak = 0;
      return;
    }
    if (chip.streak !== rush.streak) {
      chip.streak = rush.streak;
      setText(chip.count, `×${rush.streak}`);
      // Not '.pop': that class is the HUD reveal animation, which animates transform.
      chip.el.classList.remove('tick', 'milestone');
      void chip.el.offsetWidth;
      chip.el.classList.add(rush.lastMilestone === rush.streak ? 'milestone' : 'tick');
    }
    chip.bar.style.transform = `scaleX(${rush.fraction.toFixed(3)})`;
    const p = g.player.pos;
    this.tmp.set(p.x, 0, p.z);
    const r = this.rect;
    // Only under the conductor, inside the play area: never parked at a corner or over the HUD.
    if (!g.stage.project(this.tmp, this.screen) || this.screen.y < r.top || this.screen.y > r.bottom) {
      chip.el.style.opacity = '0';
      return;
    }
    const half = chip.el.offsetWidth / 2;
    const x = Math.min(Math.max(this.screen.x, r.left + half), r.right - half);
    const y = Math.min(this.screen.y + RUSH_CHIP_OFFSET, r.bottom - chip.el.offsetHeight);
    // The tile label wins if they would touch (it is what the player is deciding about).
    const tag = this.tileTagBox;
    const clash = !!tag && x + half > tag.x0 && x - half < tag.x1 && y + chip.el.offsetHeight > tag.y0 && y < tag.y1;
    chip.el.style.opacity = clash ? '0' : '1';
    chip.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
  }

  private updatePointer(): void {
    const p = this.game.guidance.pointer;
    // The coach label already points the way when it is up.
    const show = p.visible && !this.hidden && this.guide.el.hidden;
    setVisible(this.pointerEl, show);
    if (show) this.pointerEl.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}rad)`;
  }

  // ─── UiApi ──────────────────────────────────────────────────────────────────

  /** Stars earned in the world fly up into the route-level ring, which fills as they land. */
  flyStars(amount: number, x: number, y: number, z: number): boolean {
    if (this.hidden || this.hud.level.classList.contains('unrevealed')) return false;
    this.tmp.set(x, y, z);
    if (!this.game.stage.project(this.tmp, this.screen)) return false;
    const count = Math.max(1, Math.min(5, amount));
    let assigned = 0;
    for (let i = 0; i < count; i++) {
      const share = i === count - 1 ? amount - assigned : Math.floor(amount / count);
      assigned += share;
      const el = icon('star', 24, 'ico flyer');
      this.floatLayer.appendChild(el);
      this.flyers.push({ el, t: 0, delay: STAR_FLY_DELAY + i * 0.07, fromX: this.screen.x + (Math.random() - 0.5) * 20, fromY: this.screen.y - 20, amount: share, to: 'level' });
    }
    this.pendingStars += amount;
    return true;
  }

  floatText(text: string, x: number, y: number, z: number, kind: FloatKind): void {
    if (this.floats.length > 24) return;
    const el = h(`div.float.${kind}` as 'div', {}, kind === 'star' ? icon('star', 20) : null, text);
    this.floatLayer.appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(x, y + this.stackOffset(x, z), z), age: 0, life: FLOAT_LIFE, rise: 1.1, speech: false, width: 0 });
  }

  /** How far up a new float must start so it does not overprint recent ones at the same spot. */
  private stackOffset(x: number, z: number): number {
    let n = 0;
    for (const f of this.floats) {
      if (f.age < f.life * 0.45 && Math.abs(f.pos.x - x) < FLOAT_NEAR && Math.abs(f.pos.z - z) < FLOAT_NEAR) n++;
    }
    return n * FLOAT_STACK_METRES;
  }

  showCaption(caption: { kicker?: string; text: string } | null): void {
    const c = this.caption;
    setVisible(c.el, !!caption);
    setVisible(c.skip, !!caption);
    if (!caption) return;
    setVisible(c.kicker, !!caption.kicker);
    c.kicker.textContent = caption.kicker ?? '';
    c.text.textContent = caption.text;
    c.el.classList.remove('in');
    void c.el.offsetWidth;
    c.el.classList.add('in');
  }

  speechLine(text: string, x: number, y: number, z: number, tone: 'good' | 'bad' = 'good'): void {
    if (this.sinceSpeech < SPEECH_GAP_SECONDS || this.floats.some((f) => f.speech)) return;
    this.sinceSpeech = 0;
    const el = h(tone === 'bad' ? 'div.speech.bad' : 'div.speech', { text });
    this.floatLayer.appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(x, y, z), age: 0, life: 2.4, rise: 0.3, speech: true, width: 0 });
  }

  cashCollected(amount: number): void {
    if (amount <= 0) return;
    this.pendingHud += amount;
    const b = this.burst;
    b.total += amount;
    b.idle = 0;
    b.pop = 1;
    if (!b.active) {
      b.active = true;
      b.shown = 0;
      b.el.hidden = false;
      b.el.classList.remove('out');
    }
  }

  toast(text: string, iconName?: IconName): void {
    const el = h('div.toast', {}, iconName ? icon(iconName, 22) : null, h('span', { text }));
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > MAX_TOASTS) this.toastLayer.firstElementChild?.remove();
    this.rectTimer = 0;
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 320);
    }, TOAST_SECONDS * 1000);
  }

  stationBanner(title: string, subtitle: string): void {
    this.announce(BANNER_MAX_DELAY, () => {
      const el = h('div.banner', { role: 'status' }, h('div.sign', { text: title }), h('div.sub', { text: subtitle }));
      this.clearCards();
      this.root.appendChild(el);
      this.holdCard(2700);
      window.setTimeout(() => el.remove(), 2700);
      return 2.2;
    });
  }

  celebrate(title: string, subtitle: string, iconName: IconName): void {
    this.announce(CELEBRATE_MAX_DELAY, () => {
      const el = h('div.celebrate', { role: 'status' }, h('div.card', {}, icon(iconName, 56), h('div.big', { text: title }), h('div.small', { text: subtitle })));
      this.clearCards();
      this.root.appendChild(el);
      this.holdCard(2900);
      window.setTimeout(() => el.remove(), 2900);
      return 2.4;
    });
  }

  /** A new centre card replaces the one fading out, so two never share the middle of the screen. */
  private clearCards(): void {
    for (const old of this.root.querySelectorAll('.celebrate, .banner')) old.remove();
  }

  /** While a centre card is up, world labels and the train map step aside so the card reads alone. */
  private holdCard(ms: number): void {
    this.root.classList.add('has-card');
    window.clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.root.classList.remove('has-card'), ms);
  }

  private announce(maxDelay: number, play: () => number): void {
    this.announcements.push({ play, expires: (this.game?.time ?? 0) + maxDelay });
  }

  showResult(result: StationResult): void {
    this.dismissResult();
    const chip = (name: IconName, text: string, cls = ''): HTMLElement => h(`span${cls}` as 'span', {}, icon(name, 16), text);
    const rows = h('div.rows', {},
      chip('person', String(result.boarded)),
      chip('cash', formatNumber(result.tips)),
      chip('star', `+${result.stars}`),
      result.luggageTotal > 0 ? chip('luggage', `${result.luggageLoaded}/${result.luggageTotal}`) : null,
      result.clean ? chip('chest', `+${formatNumber(result.bonusCash)}`, '.bonus') : null,
    );
    // A missed passenger is named plainly once the soft cues are on (a nudge, never a penalty).
    const missedCue = !result.clean && result.waiting > 0 && this.game.feedback.cuesOn;
    const note = missedCue
      ? `${result.waiting} missed the train`
      : result.leftBehind > 0
        ? `${result.leftBehind} left behind: no free beds`
        : !result.clean && result.waiting > 0 ? `${result.waiting} waiting for the next train` : null;
    const body = h('div.body', {},
      h('div.head', {}, h('h3', { text: result.clean ? 'Perfect stop!' : 'All aboard' })),
      rows,
      note ? h(missedCue ? 'div.note.bad' : 'div.note', { text: note }) : null,
    );
    const el = h('div.ticket', { role: 'status', 'aria-label': `${result.stationName}: ${result.boarded} boarded, ${result.tips} in tips, ${result.stars} stars`, onclick: () => this.dismissResult() },
      h('div.stub', {}, icon('ticket', 30)),
      body,
    );
    // The ticket replaces this stop's arrival banner if it is somehow still up (they share the middle column).
    this.root.querySelectorAll('.banner').forEach((b) => b.remove());
    this.root.appendChild(el);
    this.root.classList.add('has-ticket');
    this.resultEl = el;
    this.resultTimer = RESULT_SECONDS;
    this.rectTimer = 0;
  }

  private dismissResult(): void {
    const el = this.resultEl;
    if (!el) return;
    this.resultEl = null;
    this.rectTimer = 0;
    this.root.classList.remove('has-ticket');
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 400);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.root.classList.toggle('hud-hidden', hidden);
  }

  // ─── Modals the game asks for ───────────────────────────────────────────────

  showLevelUp(level: number, reward: { railMiles: number; cash: number }, gemCost: number, onCollect: (choice: DoubleChoice) => void): void {
    this.screens.levelUp(level, reward, gemCost, onCollect);
  }

  showOffline(amount: number, seconds: number, gemCost: number, onCollect: (choice: DoubleChoice) => void): void {
    this.screens.offline(amount, seconds, gemCost, onCollect);
  }

  showFirstClassOffer(discounted: boolean, price: string, onBuy: () => void, onClose: () => void): void {
    this.screens.firstClass(discounted, price, onBuy, onClose);
  }

  showCarriageChoice(choices: CarriageChoiceView[], onPick: (type: CarriageType) => void): void {
    this.screens.carriageChoice(choices, onPick);
  }

  // ─── Press ──────────────────────────────────────────────────────────────────

  get busy(): boolean {
    return this.screens.isOpen;
  }

  showNaming(suggestions: string[], onDone: (name: string) => void): void {
    this.pressScreens.naming(suggestions, onDone);
  }

  showInterview(def: InterviewDef, trainName: string, onAnswer: (index: number) => void): void {
    this.pressScreens.interview(def, trainName, onAnswer);
  }

  showCeremony(def: CeremonyDef, results: CeremonyResult[], trainName: string, onDone: () => void): void {
    this.pressScreens.ceremony(def, results, trainName, onDone);
  }

  showFrontPage(item: NewsItem, reward: FrontPageReward, gemCost: number, onCollect: (choice: DoubleChoice) => void): void {
    this.pressScreens.frontPage(item, reward, gemCost, onCollect);
  }

  showRivalWatch(watch: RivalWatch, onDone: () => void): void {
    this.pressScreens.rivalWatch(watch, onDone);
  }

  // ─── Mock presenters ────────────────────────────────────────────────────────

  present(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<'completed' | 'skipped'> {
    return this.screens.mockAd(kind, placement, seconds);
  }

  confirm(product: ProductDef, priceLabel: string): Promise<boolean> {
    return this.screens.mockStore(product, priceLabel);
  }
}
