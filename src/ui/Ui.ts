import * as THREE from 'three';
import type { ProductDef } from '../config/content';
import { damp, formatClock, formatNumber } from '../core/math';
import type { StationResult } from '../gameplay/events';
import type { Game } from '../gameplay/Game';
import type { DoubleChoice, GameUi } from '../gameplay/GameUi';
import type { OfferView } from '../gameplay/Monetization';
import type { FloatKind } from '../gameplay/UiApi';
import { h, icon, setText, setVisible } from './dom';
import type { IconName } from './icons';
import { Screens } from './Screens';

interface Floating {
  el: HTMLElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
  rise: number;
}

const FLOAT_LIFE = 1.15;
const TOAST_SECONDS = 2.8;
const RESULT_SECONDS = 5.5;

/**
 * The DOM layer: HUD, world-anchored feedback (floating numbers, speech), toasts, banners, the station
 * ticket, and every modal. Writes to the DOM only when a value changes.
 */
export class Ui implements GameUi {
  readonly root: HTMLElement;
  game!: Game;
  readonly screens: Screens;
  private readonly floats: Floating[] = [];
  private readonly floatLayer: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private readonly offerLayer: HTMLElement;
  private readonly boostLayer: HTMLElement;
  private readonly pointerEl: HTMLElement;
  private readonly hud: {
    cash: HTMLElement; cashVal: HTMLElement; gems: HTMLElement; gemsVal: HTMLElement; miles: HTMLElement; milesVal: HTMLElement;
    levelBadge: HTMLElement; levelFill: HTMLElement; levelCount: HTMLElement;
    journey: HTMLElement; journeyName: HTMLElement; journeyTrain: HTMLElement; journeyTrack: HTMLElement; journeyClock: HTMLElement;
    upgrades: HTMLButtonElement; upgradesDot: HTMLElement; album: HTMLButtonElement; daily: HTMLButtonElement; dailyDot: HTMLElement;
  };
  private displayedCash = 0;
  private lastCash = 0;
  private offersKey = '';
  private resultEl: HTMLElement | null = null;
  private resultTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0 };
  private hidden = false;
  /** Big centre-screen moments play one at a time so they never pile on top of each other. */
  private readonly announcements: (() => number)[] = [];
  private announcementTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screens = new Screens(this);

    const cashVal = h('span.val', { text: '0' });
    const gemsVal = h('span.val', { text: '0' });
    const milesVal = h('span.val', { text: '0' });
    const cash = h('div.pill.cash', { 'aria-label': 'Fares' }, icon('cash', 28), cashVal);
    const gems = h('div.pill.gems', { 'aria-label': 'Gems' }, icon('gem', 24), gemsVal);
    const miles = h('div.pill.miles', { 'aria-label': 'Rail Miles' }, icon('miles', 24), milesVal);
    const levelBadge = h('div.badge', { text: '1' });
    const levelFill = h('div.fill');
    const levelCount = h('span.count', { text: '0/55' });
    const level = h('div.level', { title: 'Route level' }, levelBadge, h('div.bar', {}, levelFill), icon('star', 18), levelCount);
    const journeyName = h('span.name', { text: 'Millbrook' });
    const journeyTrain = h('div.train');
    const journeyTrack = h('div.track', {}, journeyTrain);
    const journeyClock = h('span.clock');
    const journey = h('div.journey', {}, journeyName, journeyTrack, journeyClock);

    const top = h('div.hud-top', {},
      h('div.hud-row', {}, cash, gems, miles),
      h('div.hud-row', {}, level, journey),
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
    const side = h('div.side', {},
      button('bag', 'Shop', () => this.screens.store()),
      upgrades,
      daily,
      album,
      button('gear', 'Settings', () => this.screens.settings()),
    );

    this.floatLayer = h('div.floats');
    this.toastLayer = h('div.toasts');
    this.offerLayer = h('div.offers');
    this.boostLayer = h('div.boost');
    this.pointerEl = h('div.pointer', { hidden: true });
    root.append(this.floatLayer, top, side, this.boostLayer, this.offerLayer, this.toastLayer, this.pointerEl);

    this.hud = { cash, cashVal, gems, gemsVal, miles, milesVal, levelBadge, levelFill, levelCount, journey, journeyName, journeyTrain, journeyTrack, journeyClock, upgrades, upgradesDot, album, daily, dailyDot };
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
    this.updatePointer();
    if (this.resultEl) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.dismissResult();
    }
    this.announcementTimer -= dt;
    if (this.announcementTimer <= 0 && this.announcements.length > 0) this.announcementTimer = this.announcements.shift()!();
  }

  private updateHud(dt: number): void {
    const g = this.game;
    const hud = this.hud;
    const cash = g.wallet.get('cash');
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
    const width = `${Math.round(lp.fraction * 100)}%`;
    if (hud.levelFill.style.width !== width) hud.levelFill.style.width = width;
    setText(hud.levelCount, p.isMaxLevel ? 'MAX' : `${lp.current}/${lp.needed}`);

    const j = g.journey;
    const station = g.station.currentStation();
    const stopped = j.phase === 'stationStop';
    hud.journey.classList.toggle('stop', stopped);
    hud.journey.classList.toggle('urgent', stopped && j.timeLeft <= g.econ.journey.lastCallSeconds);
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

    // Boost timers.
    const boostLeft = (g.data.monetization.speedBoostUntil - Date.now()) / 1000;
    const doubled = g.data.monetization.doubleFaresStop !== null && g.data.monetization.doubleFaresStop >= g.journey.stopSerial && g.data.monetization.doubleFaresStop <= g.journey.stopSerial + 1;
    const boostKey = `${boostLeft > 0 ? Math.ceil(boostLeft) : 0}|${doubled}`;
    if (this.boostLayer.dataset.key !== boostKey) {
      this.boostLayer.dataset.key = boostKey;
      this.boostLayer.replaceChildren();
      if (boostLeft > 0) this.boostLayer.append(h('div.pill', {}, icon('skate', 22), formatClock(boostLeft)));
      if (doubled) this.boostLayer.append(h('div.pill', {}, icon('double', 22), 'Fares'));
    }
  }

  private updateOffers(offers: OfferView[]): void {
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
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : t < 0.25 ? 1.1 - ((t - 0.15) / 0.1) * 0.1 : 1;
      f.el.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
      f.el.style.transform = `translate(${this.screen.x}px, ${this.screen.y}px) translate(-50%, -50%) scale(${scale})`;
    }
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
    this.floats.push({ el, pos: new THREE.Vector3(x, y, z), age: 0, life: FLOAT_LIFE, rise: 1.1 });
  }

  speechLine(text: string, x: number, y: number, z: number): void {
    const el = h('div.speech', { text });
    this.floatLayer.appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(x, y, z), age: 0, life: 2.4, rise: 0.3 });
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
    this.announcements.push(() => {
      const el = h('div.banner', {}, h('div.sign', { text: title }), h('div.sub', { text: subtitle }));
      this.root.appendChild(el);
      window.setTimeout(() => el.remove(), 2700);
      return 2.2;
    });
  }

  celebrate(title: string, subtitle: string, iconName: IconName): void {
    this.announcements.push(() => {
      const el = h('div.celebrate', {}, icon(iconName, 64), h('div.big', { text: title }), h('div.small', { text: subtitle }));
      this.root.appendChild(el);
      window.setTimeout(() => el.remove(), 2900);
      return 2.4;
    });
  }

  showResult(result: StationResult): void {
    this.dismissResult();
    const rows = h('div.rows', {},
      h('span', {}, icon('person', 18), `Boarded ${result.boarded}`),
      h('span', {}, icon('heart', 18), `Alighted ${result.alighted}`),
      h('span', {}, icon('cash', 18), `Tips ${formatNumber(result.tips)}`),
      h('span', {}, icon('star', 18), `Stars +${result.stars}`),
      result.luggageTotal > 0 ? h('span', {}, icon('luggage', 18), `Luggage ${result.luggageLoaded}/${result.luggageTotal}`) : null,
    );
    const body = h('div.body', {},
      h('h3', { text: result.clean ? 'Perfect stop!' : 'Next stop soon' }),
      rows,
      result.clean ? h('div.clean', {}, icon('chest', 20), `Station bonus +${result.bonusCash}`) : null,
      !result.clean && result.waiting > 0 ? h('div.note', { text: `${result.waiting} waiting for the next train.` }) : null,
    );
    const el = h('div.ticket', { role: 'status', onclick: () => this.dismissResult() },
      h('div.stub', {}, h('small', { text: 'Departed' }), h('b', { text: result.stationName })),
      body,
    );
    this.root.appendChild(el);
    this.resultEl = el;
    this.resultTimer = RESULT_SECONDS;
  }

  private dismissResult(): void {
    const el = this.resultEl;
    if (!el) return;
    this.resultEl = null;
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

  // ─── Mock presenters ────────────────────────────────────────────────────────

  present(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<'completed' | 'skipped'> {
    return this.screens.mockAd(kind, placement, seconds);
  }

  confirm(product: ProductDef, priceLabel: string): Promise<boolean> {
    return this.screens.mockStore(product, priceLabel);
  }
}
