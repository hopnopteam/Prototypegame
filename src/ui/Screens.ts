import { GEM_EXCHANGE, PRODUCTS, STATIONS, STORIES, type ProductDef } from '../config/content';
import { formatDuration, formatNumber } from '../core/math';
import type { DoubleChoice } from '../gameplay/GameUi';
import { CEREMONIES, INTERVIEWS, NOMINATION_LEVEL, RIVALS } from '../config/press';
import { conductorCost } from '../sim/meta';
import { CARRIAGE_THEMES, LIVERIES, liveryFor } from '../world/palette';
import { OUTFITS, type OutfitDef } from '../config/wardrobe';
import type { CarriageChoiceView } from '../gameplay/UiApi';
import type { CarriageType } from '../core/types';
import { h, icon } from './dom';
import type { IconName } from './icons';
import type { Ui } from './Ui';

interface SheetOptions {
  closable?: boolean;
  center?: boolean;
  onClose?: () => void;
  className?: string;
}

/** Every modal sheet. Opening one pauses the simulation; closing the last one resumes it. */
export class Screens {
  private open = 0;
  /** While the title screen or the intro is up, sheets wait here and open once play begins. */
  private titleHold = false;
  private readonly deferred: HTMLElement[] = [];

  constructor(private readonly ui: Ui) {}

  private get game() {
    return this.ui.game;
  }

  /** True while any sheet is up (or the title holds them); centre-screen announcements wait for it. */
  get isOpen(): boolean {
    return this.open > 0 || this.titleHold;
  }

  /** The title screen and the intro keep sheets back (offline earnings, offers, the press) until play. */
  holdForTitle(on: boolean): void {
    this.titleHold = on;
    if (on) return;
    for (const scrim of this.deferred.splice(0)) this.present(scrim);
  }

  private present(scrim: HTMLElement): void {
    if (this.titleHold) {
      this.deferred.push(scrim);
      return;
    }
    this.ui.root.appendChild(scrim);
    this.setOpen(1);
  }

  sheet(title: string, iconName: IconName | null, content: (Node | null | false)[], options: SheetOptions = {}): () => void {
    const closable = options.closable ?? true;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      const waiting = this.deferred.indexOf(scrim);
      if (waiting >= 0) this.deferred.splice(waiting, 1);
      else {
        scrim.remove();
        this.setOpen(-1);
      }
      options.onClose?.();
    };
    const header = h('header', {},
      iconName ? icon(iconName, 34) : null,
      h('h2', { text: title }),
      closable ? h('button.close', { 'aria-label': 'Close', onclick: () => { this.game.audio.play('click'); close(); } }, '×') : null,
    );
    const body = h('div.content');
    for (const node of content) if (node) body.appendChild(node);
    const sheet = h(`div.sheet${options.className ? `.${options.className}` : ''}` as 'div', { role: 'dialog', 'aria-label': title }, header, body);
    const scrim = h(`div.scrim${options.center ? '.center' : ''}` as 'div', {
      onclick: (e: Event) => {
        if (closable && e.target === scrim) close();
      },
    }, sheet);
    this.present(scrim);
    return close;
  }

  /** A custom full-screen moment (the front page) counts as an open sheet while it is up. */
  hold(): void {
    this.setOpen(1);
  }

  release(): void {
    this.setOpen(-1);
  }

  private setOpen(delta: number): void {
    this.open = Math.max(0, this.open + delta);
    if (this.game) {
      this.game.paused = this.open > 0 || document.hidden;
      this.game.input.release();
      this.game.input.enabled = this.open === 0;
    }
  }

  // ─── Rewards ────────────────────────────────────────────────────────────────

  private doubleButtons(gemCost: number, finish: (choice: DoubleChoice) => void): HTMLElement {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div.btn-row', {},
        h('button.btn.primary', { onclick: () => finish('ad') }, icon('ad', 24), '×2 Free'),
        h('button.btn.gem', { onclick: () => finish('gems'), disabled: this.game.wallet.get('gems') < gemCost }, icon('gem', 22), `×2 for ${gemCost}`),
      ),
      h('button.btn', { onclick: () => finish('none') }, 'Collect'),
    );
  }

  levelUp(level: number, reward: { railMiles: number; cash: number }, gemCost: number, onCollect: (choice: DoubleChoice) => void): void {
    let close: () => void = () => undefined;
    const finish = (choice: DoubleChoice): void => {
      close();
      onCollect(choice);
    };
    const perks = levelPerks(level);
    close = this.sheet(`Route level ${level}!`, 'star', [
      h('p.lead', { text: `${this.game.press.trainName} is getting famous.` }),
      perks.length > 0 ? h('ul.perks', {}, ...perks.map((p) => h('li', { text: p }))) : null,
      h('div.reward', {}, h('span', {}, icon('miles', 30), `+${reward.railMiles}`), h('span', {}, icon('cash', 30), `+${formatNumber(reward.cash)}`)),
      this.doubleButtons(gemCost, finish),
    ], { closable: false, center: true });
  }

  /**
   * The coupling moment: which carriage joins the train? Cards for what the train may take next, the
   * recommended one first with the reason it would help right now.
   */
  carriageChoice(choices: CarriageChoiceView[], onPick: (type: CarriageType) => void): void {
    let close: () => void = () => undefined;
    const icons: Record<CarriageType, IconName> = { lobby: 'ticket', bathroom: 'bath', supply: 'towel', luggage: 'luggage', sleeper: 'bed' };
    const cards = choices.map((c, i) => {
      const theme = CARRIAGE_THEMES[c.type];
      return h(`button.carriage-card${i === 0 && c.reason ? '.recommended' : ''}` as 'button', {
        'data-default': i === 0 ? '' : undefined,
        onclick: () => {
          close();
          onPick(c.type);
        },
      },
        h('div.art', { style: { background: theme.wall } }, h('span.disc', { style: { background: theme.deep } }, icon(icons[c.type], 40))),
        h('div.info', {},
          h('b', { text: c.name }),
          h('span.pitch', { text: c.pitch }),
          i === 0 && c.reason ? h('span.ribbon', {}, icon('star', 14), c.reason) : null,
        ),
      );
    });
    close = this.sheet('Next carriage', 'carriage', [
      h('div.carriage-cards', {}, ...cards),
    ], { closable: false, center: true, className: 'chooser' });
  }

  /** The league table: the rivals, and you among them. */
  private league(): HTMLElement {
    const g = this.game;
    const reputation = g.data.route.stars;
    const rows = [...RIVALS.map((r) => ({ name: r.name, owner: r.owner.name, rep: r.reputation, you: false, livery: r.livery })),
      { name: g.press.trainName, owner: 'You', rep: reputation, you: true, livery: g.currentLivery().body }]
      .sort((a, b) => b.rep - a.rep || (a.you ? -1 : 1));
    return h('ol.league', {}, ...rows.map((row, i) => h(`li${row.you ? '.you' : ''}` as 'li', {},
      h('span.rank', { text: String(i + 1) }),
      h('span.swatch', { style: { background: row.livery } }),
      h('span.name', {}, h('b', { text: row.name }), h('small', { text: row.owner })),
      h('span.rep', {}, icon('star', 14), formatNumber(row.rep)),
    )));
  }

  /** The menu: everything that is not play, one tap away and out of the way. */
  menu(): void {
    const g = this.game;
    let close: () => void = () => undefined;
    const go = (fn: () => void) => () => {
      g.audio.play('click');
      close();
      fn();
    };
    const dailyCount = g.meta.claimableQuests() + (g.meta.canClaimLogin() ? 1 : 0);
    const row = (iconName: IconName, label: string, detail: string, onclick: () => void, badge = 0): HTMLElement =>
      h('button.menu-row', { onclick },
        icon(iconName, 34),
        h('span.text', {}, h('b', { text: label }), h('small', { text: detail })),
        badge > 0 ? h('span.count', { text: String(badge) }) : h('span.chev', { text: '›' }),
      );
    const standing = g.press.standing;
    close = this.sheet('Menu', 'menu', [
      row('trophy', 'League & level', `#${standing.rank} of ${standing.total} · route level ${g.progression.level}`, go(() => this.progress())),
      g.meta.questsUnlocked() || g.meta.loginUnlocked() ? row('calendar', 'Daily', 'Calendar and quests', go(() => this.daily()), dailyCount) : null,
      g.data.meta.postcards.length > 0 ? row('album', 'Postcards', `${g.data.meta.postcards.length} collected`, go(() => this.album())) : null,
      row('gear', 'Settings', 'Sound, vibration, more', go(() => this.settings())),
    ], { className: 'menu-sheet' });
  }

  /** Tap the level ring: where you are, what the next level brings, and who to overtake. */
  progress(): void {
    const g = this.game;
    const p = g.progression;
    const lp = p.levelProgress();
    const standing = g.press.standing;
    const next = p.level + 1;
    const perks = p.isMaxLevel ? [] : levelPerks(next);
    const reward = p.isMaxLevel ? null : p.rewardFor(next);
    const pct = Math.round(lp.fraction * 100);
    this.sheet(`Route level ${p.level}`, 'star', [
      h('p.lead', { text: `${g.press.trainName} · ${g.currentLivery().name} livery` }),
      p.isMaxLevel
        ? h('p', { text: 'Countryside Local is at its top level. Every star still counts in the league.' })
        : h('div.quest', {}, icon('star', 30), h('div.info', {}, `${lp.current} / ${lp.needed} stars to level ${next}`, h('div.bar', {}, h('i', { style: { width: `${pct}%` } })))),
      reward ? h('div.section-title', { text: `Level ${next} brings` }) : null,
      reward ? h('ul.perks', {}, ...[`+${reward.railMiles} Rail Miles and +${formatNumber(reward.cash)} Fares`, ...perks].map((t) => h('li', { text: t }))) : null,
      h('div.section-title', { text: 'Countryside League' }),
      h('p', { text: standing.next ? `Overtake ${standing.next.owner.name}'s ${standing.next.name} in ${formatNumber(standing.next.reputation - g.data.route.stars)} stars.` : 'Number one: the best sleeper on the line.' }),
      this.league(),
      h('p.small', { text: 'Stars come from building, cleaning cabins, bringing requests and perfect station stops.' }),
    ]);
  }

  offline(amount: number, seconds: number, gemCost: number, onCollect: (choice: DoubleChoice) => void): void {
    let close: () => void = () => undefined;
    const finish = (choice: DoubleChoice): void => {
      close();
      onCollect(choice);
    };
    close = this.sheet('While you were away', 'clock', [
      h('p.lead', { text: `Your staff kept the train running for ${formatDuration(seconds)}.` }),
      h('div.reward', {}, h('span', {}, icon('cash', 30), `+${formatNumber(amount)}`)),
      this.doubleButtons(gemCost, finish),
    ], { closable: false, center: true });
  }

  firstClass(discounted: boolean, price: string, onBuy: () => void, onClose: () => void): void {
    const product = PRODUCTS.find((p) => p.id === 'first_class_ticket')!;
    let bought = false;
    const close = this.sheet('First Class Ticket', 'ticket', [
      h('p.lead', { text: 'Ride in style, on every route, forever.' }),
      h('div.product.hero', {},
        icon('ticket', 56),
        h('div.info', {},
          h('b', { text: 'No forced ads, ever' }),
          h('span', { text: 'Plus 300 gems and 10 Rail Miles. Rewarded bonuses stay available whenever you want them.' }),
        ),
      ),
      h('button.btn.green', {
        onclick: () => {
          bought = true;
          close();
          onBuy();
        },
      }, discounted ? h('s', { style: { opacity: '0.6', marginRight: '6px' }, text: product.price }) : null, `Buy ${price}`),
      h('button.btn', { onclick: () => close() }, 'Maybe later'),
    ], { center: true, onClose: () => { if (!bought) onClose(); } });
  }

  // ─── Store ──────────────────────────────────────────────────────────────────

  store(): void {
    const g = this.game;
    let close: () => void = () => undefined;
    const buy = async (id: string): Promise<void> => {
      close();
      await g.monetization.purchase(id, id === 'first_class_ticket' && g.data.monetization.firstClassIgnored >= g.econ.offers.firstClassDiscountAfterIgnores);
    };
    const productRow = (id: string, hero: boolean): HTMLElement => {
      const p = PRODUCTS.find((x) => x.id === id)!;
      const owned = g.iap.isOwned(id);
      return h(`div.product${hero ? '.hero' : ''}` as 'div', {},
        icon(id === 'first_class_ticket' ? 'ticket' : 'skate', 48),
        h('div.info', {}, h('b', { text: p.name }), h('span', { text: p.description })),
        h('button.buy', { disabled: owned, onclick: () => void buy(id) }, owned ? 'Owned' : g.iap.priceLabel(id, id === 'first_class_ticket' && g.data.monetization.firstClassIgnored >= g.econ.offers.firstClassDiscountAfterIgnores)),
      );
    };
    const gemPacks = h('div.grid-2', {}, ...PRODUCTS.filter((p) => p.id.startsWith('gems_')).map((p) =>
      h('button.gem-card', { onclick: () => void buy(p.id) }, icon('gem', 36), formatNumber(p.grants.gems ?? 0), h('small', { text: p.name }), h('span.price', { text: p.price })),
    ));
    const exchange = (() => {
      const next = g.tiles.cheapest();
      const amount = Math.max(GEM_EXCHANGE.minCash, Math.round((next ? g.unlocks.remaining(next.def.id) : 0) * GEM_EXCHANGE.fractionOfNextTile));
      return h('div.product', {},
        icon('cash', 44),
        h('div.info', {}, h('b', { text: `${formatNumber(amount)} Fares` }), h('span', { text: 'Enough for your next unlock.' })),
        h('button.buy', {
          disabled: g.wallet.get('gems') < GEM_EXCHANGE.gems,
          onclick: () => {
            if (g.wallet.trySpend('gems', GEM_EXCHANGE.gems, 'exchange')) {
              g.wallet.add('cash', amount, 'exchange');
              g.audio.play('cash');
              close();
            }
          },
        }, icon('gem', 18), ` ${GEM_EXCHANGE.gems}`),
      );
    })();
    close = this.sheet('Shop', 'bag', [
      productRow('first_class_ticket', true),
      productRow('conductor_scooter', false),
      h('div.section-title', { text: 'Paint shop' }),
      this.paintShop(() => { close(); this.store(); }),
      h('div.section-title', { text: 'Gems' }),
      gemPacks,
      h('div.section-title', { text: 'Exchange' }),
      exchange,
      h('p', { style: { fontSize: '13px', opacity: '0.7' }, text: 'Prototype store: purchases are simulated and no money is charged.' }),
    ]);
    g.analytics.log('iap_offer_shown', { product: 'store', trigger: 'store_button' });
  }

  /** Liveries: earned ones by reputation, premium ones for gems. Cosmetic only. */
  private paintShop(refresh: () => void): HTMLElement {
    const g = this.game;
    const current = g.currentLivery();
    const following = g.data.cosmetics.livery === null;
    const card = (id: string | null, name: string, body: string, trim: string, action: HTMLElement): HTMLElement =>
      h(`div.livery${(id === null ? following : !following && current.id === id) ? '.on' : ''}` as 'div', {},
        h('div.mini', { style: { background: body } }, h('i', { style: { background: trim } })),
        h('b', { text: name }),
        action,
      );
    const earned = liveryFor(g.data.route.level);
    const cards = [card(null, 'Latest earned', earned.body, earned.trim,
      h('button.buy', { disabled: following, onclick: () => { g.chooseLivery(null); refresh(); } }, following ? 'Painted' : 'Paint'))];
    for (const l of LIVERIES) {
      const available = g.liveryAvailable(l);
      const painted = !following && current.id === l.id;
      let action: HTMLElement;
      if (available) action = h('button.buy', { disabled: painted, onclick: () => { g.chooseLivery(l.id); refresh(); } }, painted ? 'Painted' : 'Paint');
      else if (l.minLevel !== undefined) action = h('button.buy', { disabled: true }, `Level ${l.minLevel}`);
      else {
        const cost = l.gems ?? 0;
        action = h('button.buy.gem', {
          disabled: g.wallet.get('gems') < cost,
          onclick: () => {
            if (!g.wallet.trySpend('gems', cost, `livery:${l.id}`)) return;
            g.data.cosmetics.owned.push(l.id);
            g.analytics.log('iap_offer_purchased', { product: `livery:${l.id}`, currency: 'gems', amount: cost });
            g.chooseLivery(l.id);
            refresh();
          },
        }, icon('gem', 16), String(cost));
      }
      cards.push(card(l.id, l.name, l.body, l.trim, action));
    }
    return h('div.liveries', {}, ...cards);
  }

  mockStore(product: ProductDef, priceLabel: string): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const close = this.sheet('Mock store', 'bag', [
        h('p.lead', { text: `${product.name}: ${product.description}` }),
        h('p', { text: `Price ${priceLabel}. This is a prototype: nothing is charged.` }),
        h('div.btn-row', {},
          h('button.btn', { onclick: () => { answered = true; close(); resolve(false); } }, 'Cancel'),
          h('button.btn.green', { onclick: () => { answered = true; close(); resolve(true); } }, 'Buy (mock)'),
        ),
      ], { center: true, onClose: () => { if (!answered) resolve(false); } });
    });
  }

  mockAd(kind: 'rewarded' | 'interstitial', placement: string, seconds: number): Promise<'completed' | 'skipped'> {
    return new Promise((resolve) => {
      let left = seconds;
      const count = h('div.count', { text: String(Math.ceil(left)) });
      const done = (result: 'completed' | 'skipped'): void => {
        window.clearInterval(timer);
        overlay.remove();
        resolve(result);
      };
      const overlay = h('div.mock-ad', { role: 'dialog', 'aria-label': 'Mock advertisement' },
        h('span.tag', { text: kind === 'rewarded' ? 'MOCK REWARDED AD' : 'MOCK AD' }),
        h('h2', { text: 'Your ad here' }),
        h('p', { text: `Placement: ${placement}` }),
        count,
        kind === 'rewarded' ? h('button.skip', { onclick: () => done('skipped') }, 'Skip (no reward)') : null,
      );
      this.ui.root.appendChild(overlay);
      const timer = window.setInterval(() => {
        left -= 0.1;
        count.textContent = String(Math.max(0, Math.ceil(left)));
        if (left <= 0) done('completed');
      }, 100);
    });
  }

  // ─── Conductor upgrades (Rail Miles) ───────────────────────────────────────

  affordableUpgrades(): number {
    const g = this.game;
    const miles = g.wallet.get('railMiles');
    let n = 0;
    for (const key of ['speed', 'capacity', 'fareBonus'] as const) {
      const cost = conductorCost(g.econ.conductor[key], g.data.conductor[key]);
      if (cost !== null && cost <= miles) n++;
    }
    return n;
  }

  upgrades(): void {
    const g = this.game;
    let close: () => void = () => undefined;
    const base = g.econ.player;
    const describe = (key: 'speed' | 'capacity' | 'fareBonus', level: number): string => {
      const track = g.econ.conductor[key];
      if (key === 'capacity') return `${base.baseCarryCapacity + level * track.perLevel} items`;
      if (key === 'speed') return `${(base.moveSpeed * (1 + level * track.perLevel)).toFixed(1)} m/s`;
      return `+${Math.round(level * track.perLevel * 100)}%`;
    };
    const rows = ([
      ['speed', 'Brisk stride', 'Walking speed', 'bolt'],
      ['capacity', 'Strong arms', 'Carry at once', 'box'],
      ['fareBonus', 'Charm', 'Every fare', 'ticket'],
    ] as const).map(([key, name, desc, iconName]) => {
      const track = g.econ.conductor[key];
      const level = g.data.conductor[key];
      const cost = conductorCost(track, level);
      const pips = h('div.pips', {}, ...Array.from({ length: track.maxLevel }, (_, i) => h(`i.pip${i < level ? '.on' : ''}` as 'i')));
      const change = cost === null
        ? h('p.change', {}, `${desc}: `, h('b', { text: describe(key, level) }))
        : h('p.change', {}, `${desc}: ${describe(key, level)} → `, h('b', { text: describe(key, level + 1) }));
      return h('div.upgrade', {},
        icon(iconName, 40),
        h('div.info', {}, h('b', { text: name }), change, pips),
        h('button.btn.primary', {
          style: { height: '44px', fontSize: '16px' },
          disabled: cost === null || g.wallet.get('railMiles') < cost,
          onclick: () => {
            if (!g.buyConductorUpgrade(key)) return;
            close();
            this.upgrades();
          },
        }, cost === null ? 'Max' : h('span', {}, icon('miles', 20), ` ${cost}`)),
      );
    });
    close = this.sheet('Conductor', 'conductor', [
      h('div.miles-line', {}, icon('miles', 22), h('b', { text: formatNumber(g.wallet.get('railMiles')) }), h('span', { text: 'Rail Miles follow you on every route. You can see every upgrade on the conductor.' })),
      ...rows,
      h('div.section-title', { text: 'Wardrobe' }),
      this.wardrobe(() => { close(); this.upgrades(); }),
    ]);
  }

  /** Outfits: earned by route level or bought with gems. Cosmetic only. */
  private wardrobe(refresh: () => void): HTMLElement {
    const g = this.game;
    const worn = g.player.outfit();
    const cards = OUTFITS.map((o) => {
      const earned = o.minLevel !== undefined ? g.progression.level >= o.minLevel : g.data.cosmetics.outfits.includes(o.id);
      const portrait = h('canvas', { width: 120, height: 120 });
      drawConductorPortrait(portrait, o);
      let action: HTMLElement;
      if (worn.id === o.id) action = h('button.buy', { disabled: true }, 'Wearing');
      else if (earned) action = h('button.buy', { onclick: () => { g.data.cosmetics.outfit = o.id; g.save.markDirty(); g.audio.play('sparkle'); g.player.view.bounce(1); refresh(); } }, 'Wear');
      else if (o.minLevel !== undefined) action = h('button.buy', { disabled: true }, `Level ${o.minLevel}`);
      else {
        const cost = o.gems ?? 0;
        action = h('button.buy.gem', {
          disabled: g.wallet.get('gems') < cost,
          onclick: () => {
            if (!g.wallet.trySpend('gems', cost, `outfit:${o.id}`)) return;
            g.data.cosmetics.outfits.push(o.id);
            g.data.cosmetics.outfit = o.id;
            g.save.markDirty();
            g.audio.play('unlock');
            g.analytics.log('iap_offer_purchased', { product: `outfit:${o.id}`, currency: 'gems', amount: cost });
            g.player.view.bounce(1);
            refresh();
          },
        }, icon('gem', 16), String(cost));
      }
      return h(`div.livery${worn.id === o.id ? '.on' : ''}` as 'div', {}, portrait, h('b', { text: o.name }), action);
    });
    return h('div.liveries.outfits', {}, ...cards);
  }

  // ─── Album ──────────────────────────────────────────────────────────────────

  album(): void {
    const g = this.game;
    const have = new Set(g.data.meta.postcards);
    const cards = [
      ...STATIONS.map((s) => ({ id: s.id, name: s.name, colors: s.postcard })),
      ...STORIES.map((s) => ({ id: `story:${s.id}`, name: `${s.name}'s story`, colors: s.postcard })),
    ];
    const grid = h('div.postcards', {}, ...cards.map((card) => {
      if (!have.has(card.id)) return h('div.postcard.locked', {}, h('span', { text: '?' }));
      const canvas = h('canvas', { width: 300, height: 200 });
      drawPostcard(canvas, card.colors);
      return h('div.postcard', {}, canvas, h('div.label', { text: card.name }));
    }));
    this.sheet('Postcards', 'album', [
      h('p', { text: `${have.size} of ${cards.length} collected. Every station and every story has one.` }),
      grid,
    ]);
  }

  // ─── Daily: calendar, quests, stories ──────────────────────────────────────

  daily(): void {
    const g = this.game;
    const meta = g.meta;
    let close: () => void = () => undefined;
    const reopen = (): void => {
      close();
      this.daily();
    };
    const parts: (Node | null)[] = [];
    if (meta.loginUnlocked()) {
      const rewards = g.econ.daily.loginRewards;
      const next = meta.login.nextIndex;
      const canClaim = meta.canClaimLogin();
      parts.push(h('div.section-title', { text: 'Daily calendar' }));
      parts.push(h('div.calendar', {}, ...rewards.map((r, i) => {
        const done = i < next && !(!canClaim && i === next);
        const cls = i === next && canClaim ? '.today' : done || (!canClaim && i < next) ? '.done' : '';
        const iconName: IconName = r.gems ? 'gem' : r.railMiles ? 'miles' : 'cash';
        return h(`div.day${cls}` as 'div', {}, `Day ${i + 1}`, icon(iconName, 26), String(r.gems ?? r.railMiles ?? r.cash ?? ''));
      })));
      if (canClaim) {
        const gemCost = g.econ.rewarded.loginDouble.gemCost;
        parts.push(h('div.btn-row', {},
          h('button.btn.green', { onclick: () => { meta.claimLogin(false); g.audio.play('chest'); reopen(); } }, 'Claim'),
          h('button.btn.primary', {
            onclick: () => {
              close();
              void g.monetization.runRewarded('loginDouble', false, gemCost, () => { meta.claimLogin(true); g.audio.play('chest'); }).then((ok) => { if (!ok) meta.claimLogin(false); });
            },
          }, icon('ad', 22), '×2 Free'),
        ));
      }
    }
    if (meta.questsUnlocked()) {
      parts.push(h('div.section-title', { text: 'Today’s quests' }));
      meta.quests().forEach((q, i) => {
        const pct = Math.round((q.progress / q.target) * 100);
        parts.push(h('div.quest', {},
          icon(q.reward.gems ? 'gem' : 'miles', 30),
          h('div.info', {}, `${q.label} ${q.progress}/${q.target}`, h('div.bar', {}, h('i', { style: { width: `${pct}%` } }))),
          h('button', { disabled: q.claimed || q.progress < q.target, onclick: () => { meta.claimQuest(i); reopen(); } }, q.claimed ? 'Done' : `+${q.reward.gems ?? q.reward.railMiles}`),
        ));
      });
    }
    if (meta.storiesUnlocked()) {
      parts.push(h('div.section-title', { text: 'Regular passengers' }));
      for (const story of STORIES) {
        const progress = meta.storyProgress(story);
        const step = story.steps[progress.step];
        parts.push(h('div.story', {},
          h('b', { text: `${story.name}, ${story.title}` }),
          h('p', { text: progress.done ? `Story complete: ${story.perk.label}` : step ? `Step ${progress.step + 1}/${story.steps.length}: "${step.line}"` : story.intro }),
        ));
      }
    }
    close = this.sheet('Daily', 'calendar', parts);
  }

  // ─── Settings and developer tools ──────────────────────────────────────────

  settings(): void {
    const g = this.game;
    const s = g.data.settings;
    let close: () => void = () => undefined;
    const toggle = (label: string, value: boolean, set: (v: boolean) => void): HTMLElement => {
      const sw = h(`button.switch${value ? '.on' : ''}` as 'button', { role: 'switch', 'aria-checked': String(value), 'aria-label': label });
      sw.addEventListener('click', () => {
        const next = !sw.classList.contains('on');
        sw.classList.toggle('on', next);
        sw.setAttribute('aria-checked', String(next));
        set(next);
        g.applySettings();
        g.save.markDirty();
      });
      return h('div.toggle', {}, label, sw);
    };
    const confirmReset = h('div.btn-row', { hidden: true },
      h('button.btn', { onclick: () => { confirmReset.hidden = true; resetButton.hidden = false; } }, 'Keep playing'),
      h('button.btn.danger', { onclick: () => g.resetProgress() }, 'Erase progress'),
    );
    const resetButton = h('button.btn', { onclick: () => { resetButton.hidden = true; confirmReset.hidden = false; } }, 'Start over');
    close = this.sheet('Settings', 'gear', [
      toggle('Sound', s.sound, (v) => (s.sound = v)),
      toggle('Music', s.music, (v) => (s.music = v)),
      toggle('Vibration', s.haptics, (v) => (s.haptics = v)),
      toggle('Developer tools', s.devTools, (v) => (s.devTools = v)),
      s.devTools ? h('button.btn.primary', { onclick: () => { close(); this.devPanel(); } }, icon('wrench', 24), 'Open developer tools') : null,
      h('button.btn', {
        onclick: async () => {
          const owned = await g.iap.restore();
          g.ui.toast(owned.length ? `Restored: ${owned.length} purchase${owned.length > 1 ? 's' : ''}` : 'Nothing to restore', 'check');
        },
      }, 'Restore purchases'),
      resetButton,
      confirmReset,
      h('p', { style: { fontSize: '13px', opacity: '0.7' }, text: `Night Express prototype · Session ${g.data.profile.sessionCount} · ${formatDuration(g.lifetimeSeconds())} played` }),
    ]);
  }

  devPanel(): void {
    const g = this.game;
    let close: () => void = () => undefined;
    const stats = h('div.stat');
    const logEl = h('div.log');
    const refresh = (): void => {
      const j = g.journey;
      stats.textContent = [
        `${Math.round(g.stage.smoothedFps)} fps · ${g.stage.drawCalls} draw calls · ${g.stage.isLowQuality ? 'low' : 'full'} res`,
        `Lifetime ${formatDuration(g.lifetimeSeconds())} · session ${g.data.profile.sessionCount}`,
        `Phase ${j.phase} (${Math.ceil(j.timeLeft)}s left) · stop #${j.stopSerial} · legs ${j.legsCompleted}`,
        `Last interstitial check: ${g.monetization.lastVerdict}`,
        `Guests ${g.guests.list.length} · queue ${g.guests.queue.length} · staff ${g.staff.members.length} · save ${g.save.outcome}`,
      ].join('\n');
      stats.style.whiteSpace = 'pre-line';
      const events = (g.analytics as unknown as { history: { event: string; params: Record<string, unknown> }[] }).history.slice(-18).reverse();
      logEl.textContent = events.map((e) => `${e.event} ${JSON.stringify(e.params)}`).join('\n');
    };
    refresh();
    const timer = window.setInterval(refresh, 500);
    const b = (label: string, fn: () => void, cls = ''): HTMLButtonElement => h(`button.btn${cls}` as 'button', { onclick: () => { fn(); refresh(); } }, label);
    const timeSlider = h('input', { type: 'range', min: '0', max: '100', value: '-1', 'aria-label': 'Time of day' }) as HTMLInputElement;
    timeSlider.addEventListener('input', () => g.setTimeOfDay(Number(timeSlider.value) / 100));
    close = this.sheet('Developer tools', 'wrench', [
      stats,
      h('div.section-title', { text: 'Time' }),
      h('div.grid-3', {},
        b('×1', () => (g.timeScale = 1)), b('×3', () => (g.timeScale = 3)), b('×8', () => (g.timeScale = 8)),
        b('Next station', () => g.devSkipToStation()), b('Day cycle', () => g.setTimeOfDay(null)), b('Night', () => g.setTimeOfDay(0.8)),
      ),
      h('label', { style: { fontSize: '13px', fontWeight: '700' } }, 'Time of day', timeSlider),
      h('div.section-title', { text: 'Economy' }),
      h('div.grid-3', {},
        b('+500 fares', () => g.wallet.add('cash', 500, 'dev')), b('+100 gems', () => g.wallet.add('gems', 100, 'dev')), b('+10 miles', () => g.wallet.add('railMiles', 10, 'dev')),
        b('+50 stars', () => g.devAddStars(50)), b('Fund next tile', () => g.devCompleteNextTile()), b('Press moment now', () => { close(); g.press.flushPending(); }),
      ),
      h('div.section-title', { text: 'Recording' }),
      h('div.grid-3', {},
        b(g.creativeMode ? 'Creative off' : 'Creative on', () => {
          g.creativeMode = !g.creativeMode;
          g.guidance.enabled = !g.creativeMode;
          g.coach.enabled = !g.creativeMode;
          g.ui.setHidden(g.creativeMode);
          if (g.creativeMode) {
            close();
            this.creativeExit();
          }
        }, '.primary'),
        b('Zoom out', () => g.stage.rig.setZoom(1.35)), b('Zoom in', () => g.stage.rig.setZoom(0.85)),
      ),
      h('div.section-title', { text: 'Mock services' }),
      h('div.grid-3', {},
        b(g.ads.simulateNoFill ? 'Ads: no fill' : 'Ads: fill', () => (g.ads.simulateNoFill = !g.ads.simulateNoFill)),
        b(g.iap.simulateFailure ? 'IAP: fail' : 'IAP: ok', () => (g.iap.simulateFailure = !g.iap.simulateFailure)),
        b('Clear purchases', () => g.iap.clearOwned()),
      ),
      h('div.section-title', { text: 'Analytics (latest first)' }),
      logEl,
    ], { onClose: () => window.clearInterval(timer), className: 'dev' });
  }

  private creativeExit(): void {
    const g = this.game;
    const btn = h('button.btn.creative-exit', {
      onclick: () => {
        g.creativeMode = false;
        g.guidance.enabled = true;
        g.coach.enabled = true;
        g.ui.setHidden(false);
        btn.remove();
      },
    }, 'Exit creative');
    this.ui.root.appendChild(btn);
  }
}

/** Procedural postcard: sky gradient, sun, rolling hills, a little train on a viaduct. */
function drawPostcard(canvas: HTMLCanvasElement, [skyTop, skyBottom, hills]: [string, string, string]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const hgt = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, hgt);
  sky.addColorStop(0, skyTop);
  sky.addColorStop(1, skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hgt);
  ctx.fillStyle = '#FFF3C4';
  ctx.beginPath();
  ctx.arc(w * 0.72, hgt * 0.3, 22, 0, Math.PI * 2);
  ctx.fill();
  const layers: [number, string][] = [[0.62, shade(hills, 18)], [0.72, hills], [0.84, shade(hills, -18)]];
  for (const [y, color] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    for (let x = 0; x <= w; x += 10) ctx.lineTo(x, hgt * y + Math.sin(x / 40 + y * 10) * 10);
    ctx.lineTo(w, hgt);
    ctx.fill();
  }
  // The Night Express crossing a viaduct: powder-blue carriages, a navy engine with a red valance.
  ctx.fillStyle = '#8CC4D6';
  for (let i = 0; i < 4; i++) ctx.fillRect(40 + i * 34, hgt * 0.64, 30, 14);
  ctx.fillStyle = '#2C4A6E';
  for (let i = 0; i < 4; i++) ctx.fillRect(40 + i * 34, hgt * 0.64 + 10, 30, 4);
  ctx.fillRect(176, hgt * 0.62, 34, 18);
  ctx.fillStyle = '#D1495B';
  ctx.fillRect(174, hgt * 0.62 + 16, 38, 3);
  ctx.fillStyle = '#FFFFFFAA';
  ctx.beginPath();
  ctx.arc(196, hgt * 0.55, 8, 0, Math.PI * 2);
  ctx.arc(208, hgt * 0.5, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFF6E4';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, hgt - 8);
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, v + amount));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

/** What reaching a route level brings besides the reward: features, a new livery, the press. */
export function levelPerks(level: number): string[] {
  const perks: string[] = [];
  const features: Record<number, string> = {
    2: 'Conductor upgrades with Rail Miles',
    3: 'Daily quests',
    4: 'The daily calendar',
    5: 'Regular passengers with stories',
  };
  if (features[level]) perks.push(features[level]);
  const livery = LIVERIES.find((l) => l.minLevel === level);
  if (livery && level > 1) perks.push(`New livery: ${livery.name}`);
  const outfit = OUTFITS.find((o) => o.minLevel === level);
  if (outfit && level > 1) perks.push(`New outfit: ${outfit.name}`);
  if (INTERVIEWS.some((i) => i.level === level)) perks.push('A Rails Tonight interview');
  if (level === NOMINATION_LEVEL) perks.push('A Golden Whistle nomination');
  const ceremony = CEREMONIES.find((c) => c.level === level);
  if (ceremony) perks.push(ceremony.title);
  return perks;
}

/** The wardrobe card: a head-and-shoulders portrait of the conductor in the outfit. */
function drawConductorPortrait(canvas: HTMLCanvasElement, o: OutfitDef): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  ctx.fillStyle = '#F4ECDB';
  ctx.fillRect(0, 0, w, w);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2A2433';
  // Coat.
  ctx.fillStyle = o.body;
  ctx.beginPath();
  ctx.moveTo(18, 120);
  ctx.quadraticCurveTo(22, 78, 60, 76);
  ctx.quadraticCurveTo(98, 78, 102, 120);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = o.accent;
  for (const y of [92, 106]) {
    ctx.beginPath();
    ctx.arc(60, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head, moustache.
  ctx.fillStyle = '#F1C7A5';
  ctx.beginPath();
  ctx.arc(60, 56, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2A2433';
  for (const x of [52, 68]) {
    ctx.beginPath();
    ctx.arc(x, 55, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#4A3426';
  ctx.beginPath();
  ctx.ellipse(55, 65, 6, 2.6, 0.2, 0, Math.PI * 2);
  ctx.ellipse(65, 65, 6, 2.6, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Hat.
  if (o.hat === 'boater') {
    ctx.fillStyle = o.hatColor;
    ctx.beginPath();
    ctx.ellipse(60, 38, 34, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(42, 22, 36, 16);
    ctx.strokeRect(42, 22, 36, 16);
    ctx.fillStyle = o.bandColor;
    ctx.fillRect(42, 31, 36, 6);
  } else {
    ctx.fillStyle = o.hatColor;
    ctx.beginPath();
    ctx.moveTo(34, 40);
    ctx.quadraticCurveTo(36, 18, 60, 17);
    ctx.quadraticCurveTo(84, 18, 86, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = o.bandColor;
    ctx.fillRect(34, 36, 52, 7);
    ctx.fillStyle = '#E2B653';
    ctx.beginPath();
    ctx.arc(60, 28, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
