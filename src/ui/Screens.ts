import { GEM_EXCHANGE, PRODUCTS, STATIONS, STORIES, type ProductDef } from '../config/content';
import { formatDuration, formatNumber } from '../core/math';
import type { DoubleChoice } from '../gameplay/GameUi';
import { conductorCost } from '../sim/meta';
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

  constructor(private readonly ui: Ui) {}

  private get game() {
    return this.ui.game;
  }

  /** True while any sheet is up; centre-screen announcements wait for it to close. */
  get isOpen(): boolean {
    return this.open > 0;
  }

  sheet(title: string, iconName: IconName | null, content: (Node | null | false)[], options: SheetOptions = {}): () => void {
    const closable = options.closable ?? true;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      scrim.remove();
      this.setOpen(-1);
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
    this.ui.root.appendChild(scrim);
    this.setOpen(1);
    return close;
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
    const unlocks: Record<number, string> = {
      2: 'Rail Miles and Conductor upgrades are open.',
      3: 'Daily quests are open.',
      4: 'The daily calendar is open.',
      5: 'Regular passengers start telling their stories.',
    };
    close = this.sheet(`Route level ${level}!`, 'star', [
      h('p.lead', { text: unlocks[level] ?? 'Countryside Local is getting famous.' }),
      h('div.reward', {}, h('span', {}, icon('miles', 30), `+${reward.railMiles}`), h('span', {}, icon('cash', 30), `+${formatNumber(reward.cash)}`)),
      this.doubleButtons(gemCost, finish),
    ], { closable: false, center: true });
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
      h('div.section-title', { text: 'Gems' }),
      gemPacks,
      h('div.section-title', { text: 'Exchange' }),
      exchange,
      h('p', { style: { fontSize: '13px', opacity: '0.7' }, text: 'Prototype store: purchases are simulated and no money is charged.' }),
    ]);
    g.analytics.log('iap_offer_shown', { product: 'store', trigger: 'store_button' });
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
    const rows = ([
      ['speed', 'Brisk stride', 'Walk faster', 'bolt'],
      ['capacity', 'Strong arms', 'Carry one more item', 'box'],
      ['fareBonus', 'Charm', 'Every fare pays more', 'ticket'],
    ] as const).map(([key, name, desc, iconName]) => {
      const track = g.econ.conductor[key];
      const level = g.data.conductor[key];
      const cost = conductorCost(track, level);
      const pips = h('div.pips', {}, ...Array.from({ length: track.maxLevel }, (_, i) => h(`i.pip${i < level ? '.on' : ''}` as 'i')));
      return h('div.upgrade', {},
        icon(iconName, 40),
        h('div.info', {}, h('b', { text: name }), h('p', { text: desc }), pips),
        h('button.btn.primary', {
          style: { height: '44px', fontSize: '16px' },
          disabled: cost === null || g.wallet.get('railMiles') < cost,
          onclick: () => {
            if (cost === null || !g.wallet.trySpend('railMiles', cost, `conductor:${key}`)) return;
            g.data.conductor[key]++;
            g.save.markDirty();
            g.audio.play('unlock');
            g.particles.emit('star', g.player.pos.x, 1.8, g.player.pos.z, 12, 0.4);
            close();
            this.upgrades();
          },
        }, cost === null ? 'Max' : h('span', {}, icon('miles', 20), ` ${cost}`)),
      );
    });
    close = this.sheet('Conductor', 'miles', [
      h('p', { text: 'Rail Miles follow you on every route. Spend them on yourself.' }),
      ...rows,
    ]);
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
        b('+50 stars', () => g.devAddStars(50)), b('Fund next tile', () => g.devCompleteNextTile()), b('Clear floor cash', () => undefined),
      ),
      h('div.section-title', { text: 'Recording' }),
      h('div.grid-3', {},
        b(g.creativeMode ? 'Creative off' : 'Creative on', () => {
          g.creativeMode = !g.creativeMode;
          g.guidance.enabled = !g.creativeMode;
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
