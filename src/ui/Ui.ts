import * as THREE from 'three';
import type { ProductDef } from '../config/content';
import { damp, formatClock, formatNumber } from '../core/math';
import type { StationResult } from '../gameplay/events';
import type { Game } from '../gameplay/Game';
import type { DoubleChoice, GameUi } from '../gameplay/GameUi';
import type { OfferView } from '../gameplay/Monetization';
import type { CarriageChoiceView, FloatKind } from '../gameplay/UiApi';
import type { CarriageType } from '../core/types';
import { h, icon, setText, setVisible } from './dom';
import type { IconName } from './icons';
import { PressScreens } from './PressScreens';
import { Screens } from './Screens';
import { TrainMapUi } from './TrainMapUi';
import type { CeremonyDef, InterviewDef } from '../config/press';
import type { CeremonyResult } from '../gameplay/Press';
import type { NewsItem } from '../save/SaveData';

interface Floating {
  el: HTMLElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
  rise: number;
  /** Speech bubbles are kept fully on screen and out from under the top bar. */
  speech: boolean;
  width: number;
}

/** Floats spawned close together (same place, same moment) stack upward instead of overprinting. */
const FLOAT_STACK_METRES = 0.34;
const FLOAT_NEAR = 0.9;
const SCREEN_MARGIN = 10;

/** A note flying from the conductor's head to the cash counter; the counter ticks up as each one lands. */
interface Flyer {
  el: HTMLElement;
  t: number;
  delay: number;
  fromX: number;
  fromY: number;
  amount: number;
}

const FLYER_SECONDS = 0.5;
/** The head counter waits this long after the last bill before sending the total to the counter. */
const BURST_HOLD_SECONDS = 0.35;

const FLOAT_LIFE = 1.15;
/** Tile labels show for the nearest tile within this many metres, floating this high above it. */
const TILE_TAG_RANGE = 2.6;
const TILE_TAG_HEIGHT = 1.35;
/** Pixels below the top bar kept clear for the ticket and coach line. */
const TILE_TAG_TOP_CLEARANCE = 150;
const TOAST_SECONDS = 2.8;
const NEWS_SECONDS = 4;
const RESULT_SECONDS = 5.5;
/** Seconds a queued announcement may wait (behind another one or an open sheet) before it is dropped. */
const BANNER_MAX_DELAY = 5;
const CELEBRATE_MAX_DELAY = 60;

/**
 * The DOM layer: HUD, world-anchored feedback (floating numbers, speech), toasts, banners, the station
 * ticket, and every modal. Writes to the DOM only when a value changes.
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
  private readonly coachEl: HTMLElement;
  private readonly coachText: HTMLElement;
  private readonly coachIcon: HTMLElement;
  private coachKey = '';
  private readonly tileTag: HTMLElement;
  private readonly tileTagName: HTMLElement;
  private readonly tileTagEffect: HTMLElement;
  private tileTagKey = '';
  private readonly trainMap: TrainMapUi;
  private readonly hud: {
    cash: HTMLElement; cashVal: HTMLElement; gems: HTMLElement; gemsVal: HTMLElement; miles: HTMLElement; milesVal: HTMLElement;
    levelBadge: HTMLElement;
    journey: HTMLElement; journeyKicker: HTMLElement; journeyName: HTMLElement; journeyTrain: HTMLElement; journeyTrack: HTMLElement; journeyClock: HTMLElement;
    upgrades: HTMLButtonElement; upgradesDot: HTMLElement; album: HTMLButtonElement; daily: HTMLButtonElement; dailyDot: HTMLElement;
    gazette: HTMLButtonElement; gazetteDot: HTMLElement;
  };
  private displayedCash = 0;
  private lastCash = 0;
  /** Cash already in the wallet but still flying to the counter (shown once it lands). */
  private pendingHud = 0;
  private readonly burst = { el: null as unknown as HTMLElement, value: null as unknown as HTMLElement, total: 0, shown: 0, idle: 0, pop: 0, active: false };
  private readonly flyers: Flyer[] = [];
  private offersKey = '';
  private resultEl: HTMLElement | null = null;
  private resultTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  private hidden = false;
  /**
   * Big centre-screen moments play one at a time so they never pile on top of each other. Each has a
   * deadline in game time (which stops while a sheet is open): a station banner is only worth showing
   * while the train is actually at that station.
   */
  private readonly announcements: { play: () => number; expires: number }[] = [];
  private announcementTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screens = new Screens(this);
    this.pressScreens = new PressScreens(this.screens, this);

    const cashVal = h('span.val', { text: '0' });
    const gemsVal = h('span.val', { text: '0' });
    const milesVal = h('span.val', { text: '0' });
    const cash = h('div.pill.cash', { 'aria-label': 'Fares' }, icon('cash', 24), cashVal);
    const gems = h('div.pill.gems', { 'aria-label': 'Gems' }, icon('gem', 20), gemsVal);
    const miles = h('div.pill.miles', { 'aria-label': 'Rail Miles' }, icon('miles', 20), milesVal);
    const levelBadge = h('div.badge', { text: '1' });
    const level = h('button.level', { title: 'Route level', 'aria-label': 'Route level', onclick: () => { this.game.audio.play('click'); this.screens.progress(); } }, levelBadge, icon('star', 20, 'ico star'));
    const journeyKicker = h('span.kicker', { text: 'Next' });
    const journeyName = h('span.name', { text: 'Millbrook' });
    const journeyTrain = h('div.train');
    const journeyTrack = h('div.track', {}, journeyTrain);
    const journeyClock = h('span.clock');
    const journey = h('div.journey', {}, journeyKicker, journeyName, journeyTrack, journeyClock);

    const top = h('div.hud-top', {},
      h('div.hud-row', {}, cash, gems, miles, h('div.spacer'), level),
      journey,
    );

    const button = (name: IconName, label: string, onclick: () => void): HTMLButtonElement =>
      h('button', { 'aria-label': label, title: label, onclick: () => { this.game.audio.play('click'); onclick(); } }, icon(name, 30));
    const upgradesDot = h('span.dot', { hidden: true });
    const dailyDot = h('span.dot', { hidden: true });
    const upgrades = button('miles', 'Conductor upgrades', () => this.screens.upgrades());
    upgrades.appendChild(upgradesDot);
    const album = button('album', 'Postcard album', () => this.screens.album());
    const daily = button('calendar', 'Daily rewards and quests', () => this.screens.daily());
    daily.appendChild(dailyDot);
    const gazetteDot = h('span.dot', { hidden: true });
    const gazette = button('news', 'The Rail Gazette', () => this.pressScreens.gazette());
    gazette.appendChild(gazetteDot);
    const side = h('div.side', {},
      button('bag', 'Shop', () => this.screens.store()),
      gazette,
      upgrades,
      daily,
      album,
      button('gear', 'Settings', () => this.screens.settings()),
    );

    this.floatLayer = h('div.floats');
    this.burst.value = h('span', { text: '+0' });
    this.burst.el = h('div.burst', { hidden: true }, icon('cash', 26), this.burst.value);
    this.floatLayer.appendChild(this.burst.el);
    this.toastLayer = h('div.toasts');
    this.offerLayer = h('div.offers');
    this.boostLayer = h('div.boost');
    this.pointerEl = h('div.pointer', { hidden: true });
    this.coachIcon = h('span.coach-icon');
    this.coachText = h('span.coach-text');
    this.coachEl = h('div.coach', { role: 'status', hidden: true }, this.coachIcon, this.coachText);
    this.tileTagName = h('b');
    this.tileTagEffect = h('span');
    this.tileTag = h('div.tile-tag', { hidden: true }, this.tileTagName, this.tileTagEffect);
    this.trainMap = new TrainMapUi(() => this.game);
    // Active boosts live at the foot of the rail, so the left of the screen stays clear for the ticket.
    side.appendChild(this.boostLayer);
    root.append(this.floatLayer, this.tileTag, top, side, this.trainMap.el, this.coachEl, this.offerLayer, this.toastLayer, this.pointerEl);

    this.hud = { cash, cashVal, gems, gemsVal, miles, milesVal, levelBadge, journey, journeyKicker, journeyName, journeyTrain, journeyTrack, journeyClock, upgrades, upgradesDot, album, daily, dailyDot, gazette, gazetteDot };
  }

  bind(game: Game): void {
    this.game = game;
    this.displayedCash = game.wallet.get('cash');
    this.lastCash = this.displayedCash;
    game.events.on('currency.changed', ({ kind, delta }) => {
      if (delta <= 0) return;
      const el = kind === 'cash' ? this.hud.cash : kind === 'gems' ? this.hud.gems : this.hud.miles;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    });
  }

  // ─── Per-frame ──────────────────────────────────────────────────────────────

  update(dt: number): void {
    const g = this.game;
    if (!g) return;
    this.updateHud(dt);
    this.updateOffers(g.monetization.offers);
    this.updateFloats(dt);
    this.updateBurst(dt);
    this.updatePointer();
    this.updateCoach();
    this.updateTileTag();
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
    setText(hud.milesVal, formatNumber(g.wallet.get('railMiles')));
    setVisible(hud.miles, g.progression.isFeatureUnlocked('conductorUpgrades') || g.wallet.get('railMiles') > 0);

    const p = g.progression;
    const lp = p.levelProgress();
    setText(hud.levelBadge, String(p.level));
    const ring = (Math.round(lp.fraction * 100) / 100).toFixed(2);
    const level = hud.levelBadge.parentElement!;
    if (level.style.getPropertyValue('--p') !== ring) level.style.setProperty('--p', ring);
    level.classList.toggle('max', p.isMaxLevel);
    const label = p.isMaxLevel ? `Route level ${p.level}, max` : `Route level ${p.level}: ${lp.current} of ${lp.needed} stars`;
    if (level.title !== label) {
      level.title = label;
      level.setAttribute('aria-label', label);
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
    setText(hud.journeyClock, stopped ? formatClock(j.timeLeft) : j.phase === 'departing' ? '' : j.phase === 'arriving' ? 'Arriving' : '');

    const upgradesOpen = g.progression.isFeatureUnlocked('conductorUpgrades');
    setVisible(hud.upgrades, upgradesOpen);
    setVisible(hud.upgradesDot, upgradesOpen && this.screens.affordableUpgrades() > 0);
    hud.upgrades.classList.toggle('glow', upgradesOpen && this.screens.affordableUpgrades() > 0);
    const dailyOpen = g.meta.questsUnlocked() || g.meta.loginUnlocked();
    setVisible(hud.daily, dailyOpen);
    const dailyCount = g.meta.claimableQuests() + (g.meta.canClaimLogin() ? 1 : 0);
    setVisible(hud.dailyDot, dailyCount > 0);
    setText(hud.dailyDot, String(dailyCount));
    hud.daily.classList.toggle('glow', dailyCount > 0);
    setVisible(hud.album, g.data.meta.postcards.length > 0);
    const unread = g.press.unread;
    setVisible(hud.gazette, g.data.press.items.length > 0);
    setVisible(hud.gazetteDot, unread > 0);
    setText(hud.gazetteDot, String(unread));
    hud.gazette.classList.toggle('glow', unread > 0);

    // Boost timers.
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

  /** One offer at a time, in the one bottom slot: the most relevant one comes first from Monetization. */
  private updateOffers(all: OfferView[]): void {
    const offers = all.slice(0, 1);
    const key = offers.map((o) => `${o.id}:${o.label}`).join('|');
    if (key === this.offersKey) return;
    this.offersKey = key;
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
      let x = this.screen.x;
      const y = this.screen.y;
      let opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (f.speech) {
        if (f.width === 0) f.width = f.el.offsetWidth;
        const half = f.width / 2 + SCREEN_MARGIN;
        x = Math.min(Math.max(x, half), stage.size.width - half);
        // Never under the top bar: a line said up there simply is not shown.
        if (y < this.topBarBottom()) opacity = 0;
      }
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
        b.el.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -50%) scale(${scale})`;
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
      this.flyers.push({ el, t: 0, delay: i * 0.045, fromX: fromX + (Math.random() - 0.5) * 24, fromY: fromY + (Math.random() - 0.5) * 12, amount });
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
    const target = this.hud.cash.getBoundingClientRect();
    const tx = target.left + 22 - rootRect.left;
    const ty = target.top + target.height / 2 - rootRect.top;
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
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
        this.pendingHud = Math.max(0, this.pendingHud - f.amount);
        const pill = this.hud.cash;
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
        this.game.audio.play('coin', { pitch: 2.4, volume: 0.35 });
      }
    }
  }

  /** One short coach line under the top bar (the walkthrough, then first-time hints). */
  private updateCoach(): void {
    const line = this.hidden ? null : this.game.coach.current;
    const key = line?.id ?? '';
    if (key === this.coachKey) return;
    this.coachKey = key;
    setVisible(this.coachEl, !!line);
    if (!line) return;
    this.coachIcon.replaceChildren(icon(line.icon, 24));
    this.coachText.textContent = line.text;
    this.coachEl.classList.remove('in');
    void this.coachEl.offsetWidth;
    this.coachEl.classList.add('in');
  }

  /** Names the nearest tile and says what it does, so nothing is bought blind. */
  private updateTileTag(): void {
    const g = this.game;
    const tag = this.hidden ? null : g.tiles.nearTag(g.player.pos, TILE_TAG_RANGE);
    const key = tag ? `${tag.label}|${tag.effect}` : '';
    if (key !== this.tileTagKey) {
      this.tileTagKey = key;
      setVisible(this.tileTag, !!tag);
      if (tag) {
        this.tileTagName.textContent = tag.label;
        this.tileTagEffect.textContent = tag.effect;
        this.tileTag.classList.toggle('locked', tag.locked);
      }
    }
    if (!tag) return;
    this.tmp.set(tag.x, TILE_TAG_HEIGHT, tag.z);
    if (!g.stage.project(this.tmp, this.screen)) {
      this.tileTag.style.opacity = '0';
      return;
    }
    // Never over the top bar or the ticket/coach slot under it: a tile up there simply is not labelled.
    if (this.screen.y < this.topBarBottom() + TILE_TAG_TOP_CLEARANCE) {
      this.tileTag.style.opacity = '0';
      return;
    }
    const width = this.tileTag.offsetWidth;
    const half = width / 2 + SCREEN_MARGIN;
    const x = Math.min(Math.max(this.screen.x, half), g.stage.size.width - half - 44);
    const y = this.screen.y;
    this.tileTag.style.opacity = '1';
    this.tileTag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  private updatePointer(): void {
    const p = this.game.guidance.pointer;
    setVisible(this.pointerEl, p.visible && !this.hidden);
    if (p.visible) this.pointerEl.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.angle}rad)`;
  }

  // ─── UiApi ──────────────────────────────────────────────────────────────────

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

  private topBarCache = 0;

  private topBarBottom(): number {
    if (this.topBarCache === 0) {
      const top = this.root.querySelector('.hud-top') as HTMLElement | null;
      this.topBarCache = top ? top.offsetTop + top.offsetHeight + 4 : 100;
    }
    return this.topBarCache;
  }

  speechLine(text: string, x: number, y: number, z: number): void {
    const el = h('div.speech', { text });
    this.floatLayer.appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(x, y + this.stackOffset(x, z), z), age: 0, life: 2.4, rise: 0.3, speech: true, width: 0 });
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
    const el = h('div.toast', {}, iconName ? icon(iconName, 22) : null, text);
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstElementChild?.remove();
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 320);
    }, TOAST_SECONDS * 1000);
  }

  stationBanner(title: string, subtitle: string): void {
    this.announce(BANNER_MAX_DELAY, () => {
      const el = h('div.banner', { role: 'status' }, h('div.sign', { text: title }), h('div.sub', { text: subtitle }));
      this.root.appendChild(el);
      this.holdCard(2700);
      window.setTimeout(() => el.remove(), 2700);
      return 2.2;
    });
  }

  celebrate(title: string, subtitle: string, iconName: IconName): void {
    this.announce(CELEBRATE_MAX_DELAY, () => {
      const el = h('div.celebrate', { role: 'status' }, h('div.card', {}, icon(iconName, 56), h('div.big', { text: title }), h('div.small', { text: subtitle })));
      this.root.appendChild(el);
      this.holdCard(2900);
      window.setTimeout(() => el.remove(), 2900);
      return 2.4;
    });
  }

  /** While a centre card is up the train map steps aside (the card is wider than the play area's middle). */
  private cardTimer = 0;
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
    const body = h('div.body', {},
      h('div.head', {}, h('h3', { text: result.clean ? 'Perfect stop!' : 'All aboard' })),
      rows,
      !result.clean && result.waiting > 0 ? h('div.note', { text: `${result.waiting} waiting for the next train` }) : null,
    );
    const el = h('div.ticket', { role: 'status', 'aria-label': `${result.stationName}: ${result.boarded} boarded, ${result.tips} in tips, ${result.stars} stars`, onclick: () => this.dismissResult() },
      h('div.stub', {}, icon('ticket', 30)),
      body,
    );
    this.root.appendChild(el);
    this.root.classList.add('has-ticket');
    this.resultEl = el;
    this.resultTimer = RESULT_SECONDS;
  }

  private dismissResult(): void {
    const el = this.resultEl;
    if (!el) return;
    this.resultEl = null;
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

  /** A new story in the paper: a newsprint strip with the headline; the Gazette button glows until read. */
  newsFlash(item: NewsItem): void {
    const el = h('div.toast.news', {}, icon('news', 22), h('span.kicker', { text: 'Gazette' }), h('span.headline', { text: item.headline }));
    this.toastLayer.appendChild(el);
    while (this.toastLayer.children.length > 3) this.toastLayer.firstElementChild?.remove();
    this.game?.audio.play('pop', { pitch: 1.3, volume: 0.5 });
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 320);
    }, NEWS_SECONDS * 1000);
  }

  // ─── Mock presenters ────────────────────────────────────────────────────────

  present(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<'completed' | 'skipped'> {
    return this.screens.mockAd(kind, placement, seconds);
  }

  confirm(product: ProductDef, priceLabel: string): Promise<boolean> {
    return this.screens.mockStore(product, priceLabel);
  }
}
