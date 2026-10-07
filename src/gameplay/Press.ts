import { STATIONS, STORIES } from '../config/content';
import { VENUES } from '../config/venues';
import type { CarriageType, VenueKind } from '../core/types';
import { isVenueType } from '../world/layout';
import {
  CEREMONIES,
  DARE_REWARD,
  DARE_WON_HEADLINE,
  DEBUT_INTERVIEW,
  DEFAULT_TRAIN_NAME,
  FRONT_PAGE_REWARDS,
  HEADLINES,
  INTERVIEWS,
  PRESS_ARCHIVE,
  RIVAL_DARES,
  RIVALS,
  TOP_RANK_NEWS,
  TRAIN_NAME_MAX,
  TRAIN_NAME_SUGGESTIONS,
  type AwardDef,
  type CeremonyDef,
  type InterviewDef,
  type PressTrigger,
  type DareMetric,
  type Rival,
  type RivalDare,
  PRESS_PACING,
} from '../config/press';
import type { IconName } from '../ui/icons';
import type { NewsItem } from '../save/SaveData';
import { awardProgress, cleanTrainName, dareTarget, fillTemplate, leagueStanding, nextDare, rivalsPassed, type LeagueStanding } from '../sim/press';
import type { DoubleChoice } from './GameUi';
import type { World } from './World';

export interface CeremonyResult {
  award: AwardDef;
  won: boolean;
  /** Won just now (rewards are granted once). */
  fresh: boolean;
  have: number;
  need: number;
}

export interface FrontPageReward {
  cash: number;
  gems: number;
  railMiles: number;
}

/** What the press needs from the UI. Each of these is a sheet, which pauses the game like every other. */
export interface PressUi {
  showNaming(suggestions: string[], onDone: (name: string) => void): void;
  showInterview(def: InterviewDef, trainName: string, onAnswer: (index: number) => void): void;
  showCeremony(def: CeremonyDef, results: CeremonyResult[], trainName: string, onDone: () => void): void;
  /** The celebratory front page: the story, a photo of the train, and a reward to collect (×2 optional). */
  showFrontPage(item: NewsItem, reward: FrontPageReward, gemCost: number, onCollect: (choice: DoubleChoice) => void): void;
  /** The news strip (session 20): a few words that slide in at the foot of the screen and go; never a pause. */
  wire(news: WireNews): void;
  /** A sheet is open; big moments wait. */
  readonly busy: boolean;
  /** The station's result ticket is on screen; press cards wait until it has gone. */
  readonly ticketUp: boolean;
}

/** One item on the news strip: a headline, the Gazette's (or a rival's) face, and what it paid. */
export interface WireNews {
  headline: string;
  icon: IconName;
  /** A rival's news shows their face instead of the paper. */
  rival?: Rival | null;
  reward?: FrontPageReward | null;
  tone: 'news' | 'rival' | 'win';
  /** The little heading over the headline (session 23): the edition, "Rival Watch", "League". */
  kicker?: string;
  /** A line under the headline (what a rival's spoils were). */
  note?: string;
  /** Session 23 (owner: "the list should appear with the news"): the league round your place, shown on the strip. */
  league?: LeagueRow[];
}

/** One line of the league as the news strip shows it. */
export interface LeagueRow {
  rank: number;
  name: string;
  stars: number;
  livery: string;
  trim: string;
  /** Your train. */
  you?: boolean;
  /** You have just moved up past the row below. */
  up?: boolean;
  rival?: Rival;
}

const { calmSeconds: CALM_SECONDS, gapSeconds: PRESS_GAP, afterSheetSeconds: AFTER_SHEET, maxWaitingFrontPages: MAX_WAITING_FRONT_PAGES, newsWeight: NEWS_WEIGHT } = PRESS_PACING;
const GUESTS_NEWS = 100;

/**
 * The world noticing your train (the answer to "what am I working towards?"): you name her, the league
 * table of rival trains shows who to overtake next, Rails Tonight interviews you as you level up (every
 * answer a small perk), the Golden Whistle Awards judge how you played, and the Rail Gazette puts only the
 * big moments on its front page, each one a small celebration that pays. Moments wait for calm: never at a
 * station, never on top of another sheet, never mid-coupling.
 */
export class Press {
  private calm = 0;
  private sinceShown = PRESS_GAP;
  private quiet = AFTER_SHEET;
  /** The league as it stands: each rival's reputation (plus what the races of session 20 added, in old saves). */
  private leagueCache: Rival[] = RIVALS;
  private leagueKey = '';

  constructor(private readonly w: World, private readonly ui: PressUi) {
    const p = this.state;
    if (p.reputationSeen === 0) p.reputationSeen = w.data.route.stars;
    // Saves from before the debut interview (it used to come at level 2): treat it as done.
    if (p.trainName && !p.interviews.includes(DEBUT_INTERVIEW) && !p.pending.includes(`interview:${DEBUT_INTERVIEW}`)) p.interviews.push(DEBUT_INTERVIEW);
    if (!p.trainName && w.data.route.stopsCompleted > 0) this.queue('name');
    // Saves from before the race paid spoils: rivals already passed hand theirs over now (the perk only).
    RIVALS.forEach((rival, index) => {
      if (rival.reputation > w.data.route.stars || p.rivals.prized.includes(index)) return;
      p.rivals.prized.push(index);
      w.data.meta.perks[rival.spoils.perk.kind] += rival.spoils.perk.amount;
    });
    const e = w.events;
    e.on('guest.checkedIn', () => {
      p.stats.guests++;
      if (p.stats.guests === GUESTS_NEWS) this.print('guests100');
    });
    e.on('request.fulfilled', () => {
      p.stats.requests++;
      this.countDare('requests');
    });
    e.on('station.result', (r) => {
      if (w.data.route.stopsCompleted >= 1) this.queue('name');
      if (r.clean) p.stats.perfectStops++;
      if (r.clean) this.countDare('perfect');
      w.save.markDirty();
    });
    // What the rival's dare counts (session 24): the train's work, the staff's included.
    e.on('guest.boarded', () => this.countDare('board'));
    e.on('cabin.cleaned', () => this.countDare('tidy'));
    e.on('shoes.shined', () => this.countDare('shoes'));
    e.on('guest.keyed', () => this.countDare('keys'));
    e.on('carriage.coupled', ({ index, type }) => {
      // A venue joining is its own news: it opens (session 20).
      if (isVenueType(type as CarriageType)) this.print('venue', { venue: VENUES[type as VenueKind].name });
      else this.print('coupling', { carriage: w.train.carriageName(index), n: index + 1 });
    });
    e.on('carriage.refurbished', ({ index, tier }) => {
      // Passenger carriages make the paper as they reach First Class and the Royal Suite (Business is the
      // walnut-and-brass refit); service cars when they go luxurious.
      const trigger: PressTrigger | null = tier >= 5 ? 'royal' : tier === 4 ? 'firstClass' : tier === 3 ? 'refurb3' : null;
      if (trigger) this.print(trigger, { carriage: w.train.carriageName(index) });
    });
    e.on('livery.changed', ({ name }) => this.print('livery', { livery: name }));
    e.on('stars.added', () => {
      this.checkLeague();
      this.checkRivalTarget();
    });
    e.on('level.up', ({ level }) => {
      if (INTERVIEWS.some((i) => i.level === level) && !p.interviews.includes(level)) this.queue(`interview:${level}`);
      if (CEREMONIES.some((c) => c.level === level) && !p.ceremonies.includes(level)) this.queue(`ceremony:${level}`);
    });
    e.on('story.step', ({ id, done }) => {
      if (!done) return;
      const story = STORIES.find((s) => s.id === id);
      if (story) this.print('story', { story: `${story.name}'s Journey Ends Happily` });
    });
    e.on('journey.phase', ({ phase, previous }) => {
      if (phase === 'onTheMove' && previous === 'departing') {
        this.calm = CALM_SECONDS;
        // The rival's dare is settled or dared in this calm (once the station ticket has gone); a rival who has
        // not had their say yet says it with their dare, so their taunt waits for that.
        this.dareBreak = true;
        if (this.tauntDue !== null && !this.daresOpen()) this.rivalNews(this.tauntDue);
      }
      if (phase === 'arriving' || phase === 'stationStop') this.calm = 0;
    });
    e.on('venue.happyHour', () => {
      if (!p.fired.happyHour) this.print('happyHour');
    });
  }

  private get state(): World['data']['press'] {
    return this.w.data.press;
  }

  get trainName(): string {
    return this.state.trainName ?? DEFAULT_TRAIN_NAME;
  }

  get named(): boolean {
    return this.state.trainName !== null;
  }

  /** Seconds the screen has been free of cards and the station ticket (other systems wait for a calm too). */
  get calmSeconds(): number {
    return this.ui.ticketUp ? 0 : this.quiet;
  }

  get standing(): LeagueStanding {
    return leagueStanding(this.w.data.route.stars, this.league);
  }

  /**
   * The rivals with their reputation as it stands now: what they started with, plus what the races they won from
   * you added (session 20). The same objects until a race changes it, so the HUD can compare them cheaply.
   */
  get league(): Rival[] {
    const boost = this.state.rivals.boost;
    const key = boost.join(',');
    if (key !== this.leagueKey) {
      this.leagueKey = key;
      this.leagueCache = RIVALS.map((r, i) => (boost[i] ? { ...r, reputation: r.reputation + boost[i] } : r));
    }
    return this.leagueCache;
  }

  /** A rival's place in the config list (stable whatever their reputation does). */
  rivalIndex(rival: Rival): number {
    return RIVALS.findIndex((r) => r.name === rival.name);
  }

  /**
   * The league round your place, for the news strip (session 23): the train ahead of you, yours and the one
   * behind (the top three once you lead). `up` marks your row when you have just passed the one below.
   */
  leagueRows(up = false): LeagueRow[] {
    const w = this.w;
    const stars = w.data.route.stars;
    const livery = w.currentLivery();
    const rows: LeagueRow[] = this.league.map((r) => ({ rank: 0, name: r.name, stars: r.reputation, livery: r.livery, trim: r.trim, rival: r }));
    rows.push({ rank: 0, name: this.trainName, stars, livery: livery.body, trim: livery.trim, you: true, up });
    // A rival you have equalled is passed (as the league counts it): you go above them.
    rows.sort((a, b) => b.stars - a.stars || (a.you ? -1 : b.you ? 1 : 0));
    rows.forEach((r, i) => (r.rank = i + 1));
    const me = rows.findIndex((r) => r.you);
    const start = Math.max(0, Math.min(rows.length - 3, me - 1));
    return rows.slice(start, start + 3);
  }

  update(dt: number): void {
    this.sinceShown += dt;
    if (this.calm > 0) this.calm -= dt;
    this.quiet = this.ui.busy ? 0 : this.quiet + dt;
    // The paper's dare comes in the calm after a departure, once the station's card has gone (session 24).
    if (this.dareBreak && this.calm > 0 && !this.ui.ticketUp && !this.ui.busy) {
      this.dareBreak = false;
      this.dareEdition();
    }
    const p = this.state;
    if (p.pending.length === 0 || this.ui.busy || this.w.train.coupling) return;
    // One card per breather after a departure, once the ticket has gone and the screen has been quiet a
    // moment, and a leg of the journey since the last card: the press is a steady thread, never a pile.
    if (this.calm <= 0 || this.ui.ticketUp || this.quiet < AFTER_SHEET || this.sinceShown < PRESS_GAP) return;
    let best = -1;
    for (let i = 0; i < p.pending.length; i++) if (best < 0 || this.weight(p.pending[i]) > this.weight(p.pending[best])) best = i;
    if (best >= 0) this.showNext(best);
  }

  /** Which waiting card goes first: the debut in order, then the biggest news, ceremonies, interviews, taunts. */
  private weight(key: string): number {
    if (key === 'name') return 100;
    if (key === `interview:${DEBUT_INTERVIEW}`) return 90;
    if (key.startsWith('front:')) {
      const trigger = this.itemFor(key)?.trigger as PressTrigger | undefined;
      return trigger === 'named' ? 85 : 40 + (trigger ? NEWS_WEIGHT[trigger] ?? 0 : 0);
    }
    if (key.startsWith('ceremony:')) return 45;
    if (key.startsWith('interview:')) return 44;
    return 20;
  }

  private itemFor(key: string): NewsItem | undefined {
    const id = Number(key.split(':')[1]);
    return this.state.items.find((i) => i.id === id);
  }

  /**
   * At most a couple of front pages wait for their breather: beyond that, the least important one is paid
   * now with a small toast (nothing is lost; there is simply no card for it).
   */
  private foldFrontPages(): void {
    const p = this.state;
    for (;;) {
      const fronts = p.pending.filter((k) => k.startsWith('front:') && this.itemFor(k)?.trigger !== 'named');
      if (fronts.length <= MAX_WAITING_FRONT_PAGES) return;
      let least = fronts[0];
      for (const k of fronts) if (this.weight(k) < this.weight(least)) least = k;
      p.pending.splice(p.pending.indexOf(least), 1);
      const item = this.itemFor(least);
      if (!item) continue;
      const reward = this.rewardFor(item);
      const w = this.w;
      if (reward.cash > 0) w.wallet.add('cash', reward.cash, 'press');
      if (reward.gems > 0) w.wallet.add('gems', reward.gems, 'press');
      if (reward.railMiles > 0) w.wallet.add('railMiles', reward.railMiles, 'press');
      if (reward.cash > 0) w.ui.toast(`+${reward.cash}`, 'news');
    }
  }

  /** Dev: show whatever is pending now. */
  flushPending(): void {
    if (this.state.pending.length > 0 && !this.ui.busy) this.showNext(0);
  }

  // ─── Front pages ────────────────────────────────────────────────────────────

  /** Prints a story and queues its front page. Returns null before the train has a name. */
  print(trigger: PressTrigger, vars: Record<string, string | number> = {}, extra?: { cash?: number; rival?: Rival; league?: LeagueRow[] }): NewsItem | null {
    const w = this.w;
    const p = this.state;
    if (!p.trainName && trigger !== 'named') return null;
    const variants = HEADLINES[trigger];
    const count = p.fired[trigger] ?? 0;
    const def = variants[count % variants.length];
    p.fired[trigger] = count + 1;
    const all = { train: this.trainName, rank: this.standing.rank, n: w.train.count, ...vars };
    // A story without a quote drops the empty quotation marks.
    const fill = (text: string): string => fillTemplate(text, all).replace(/\s*“”/g, '');
    const livery = w.currentLivery();
    const item: NewsItem = {
      id: p.nextId++,
      trigger,
      headline: fill(def.headline),
      body: fill(def.body),
      level: w.progression.level,
      carriages: w.train.count,
      livery: livery.body,
      trim: livery.trim,
      paints: w.train.paints(),
      at: Math.round(w.lifetimeSeconds()),
    };
    p.items.unshift(item);
    if (p.items.length > PRESS_ARCHIVE) p.items.length = PRESS_ARCHIVE;
    if (trigger === 'named') {
      // The debut is the one front page that still comes as a card (it opens the story).
      this.queue(`front:${item.id}`);
      this.foldFrontPages();
    } else {
      // Session 20 (owner: "news in the game without disrupting the gameplay flow"): every other story is a few
      // words on the news strip, and what it is worth is paid on the spot.
      const reward = this.rewardFor(item);
      if (extra?.cash) reward.cash += extra.cash;
      this.pay(reward);
      this.ui.wire({ headline: item.headline, icon: 'news', rival: extra?.rival ?? null, reward, tone: extra?.league ? 'win' : 'news', kicker: extra?.league ? 'League' : 'Late edition', league: extra?.league });
    }
    w.analytics.log('press_printed', { trigger, level: item.level });
    return item;
  }

  private pay(reward: FrontPageReward): void {
    const w = this.w;
    if (reward.cash > 0) w.wallet.add('cash', reward.cash, 'press');
    if (reward.gems > 0) w.wallet.add('gems', reward.gems, 'press');
    if (reward.railMiles > 0) w.wallet.add('railMiles', reward.railMiles, 'press');
    if (reward.cash > 0 || reward.gems > 0 || reward.railMiles > 0) w.audio.play('coin', { volume: 0.7 });
  }

  private rewardFor(item: NewsItem): FrontPageReward {
    const r = FRONT_PAGE_REWARDS[item.trigger as PressTrigger] ?? {};
    return { cash: (r.cashPerCarriage ?? 0) * item.carriages, gems: r.gems ?? 0, railMiles: r.railMiles ?? 0 };
  }

  private showFrontPage(id: number): void {
    const w = this.w;
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return;
    const reward = this.rewardFor(item);
    const gemCost = w.econ.rewarded.levelUpDouble.gemCost;
    w.audio.play('fanfare');
    w.haptics.success();
    this.ui.showFrontPage(item, reward, gemCost, (choice) => w.collectWithDouble('frontPageDouble', choice, gemCost, (k) => {
      if (reward.cash > 0) w.wallet.add('cash', reward.cash * k, 'press');
      if (reward.gems > 0) w.wallet.add('gems', reward.gems * k, 'press');
      if (reward.railMiles > 0) w.wallet.add('railMiles', reward.railMiles * k, 'press');
      w.audio.play('chest');
      w.particles.emit('confetti', w.player.pos.x, 2.6, w.player.pos.z, 50, 1.4);
    }));
  }

  private checkLeague(): void {
    const p = this.state;
    const now = this.w.data.route.stars;
    if (now <= p.reputationSeen) return;
    const passed = rivalsPassed(p.reputationSeen, now, this.league);
    p.reputationSeen = now;
    if (passed.length === 0) return;
    const standing = this.standing;
    const last = passed[passed.length - 1];
    // The big overtakes (into the top three, to number one) are the paper's lead story, with the loser's grumble
    // as the quote and the league beside it: one strip, not two.
    const milestone: PressTrigger | null = standing.rank === 1 && !p.fired.champion ? 'champion' : standing.rank <= TOP_RANK_NEWS && standing.rank > 1 && !p.fired.topThree ? 'topThree' : null;
    passed.forEach((rival) => this.overtake(rival, standing.rank, milestone === null && rival === last));
    if (milestone) this.print(milestone, { rival: last.name, quote: last.owner.humbled }, { rival: last, league: this.leagueRows(true) });
  }

  /**
   * Passing a rival (session 18; session 23: the news strip, no chip): their spoils change hands on the spot (a
   * permanent perk, a purse, gems), the Gazette's strip says so with the league round your new place, and their
   * pennant goes up on your locomotive. Never a card, never a pause.
   */
  private overtake(rival: Rival, rank: number, announce: boolean): void {
    const w = this.w;
    const p = this.state;
    const index = this.rivalIndex(rival);
    if (index < 0) return;
    let cash = 0;
    let gems = 0;
    if (!p.rivals.prized.includes(index)) {
      p.rivals.prized.push(index);
      const spoils = rival.spoils;
      w.data.meta.perks[spoils.perk.kind] += spoils.perk.amount;
      cash = spoils.cashPerCarriage * w.train.count;
      gems = spoils.gems ?? 0;
      if (cash > 0) w.wallet.add('cash', cash, 'rival');
      if (gems > 0) w.wallet.add('gems', gems, 'rival');
    }
    // Before the rivals are part of the ride (the opening), the spoils change hands quietly: one layer at a time.
    if (announce && this.named && w.flow.allows('rivals')) {
      this.ui.wire({
        headline: `${this.trainName} passes ${rival.name}!`,
        icon: 'trophy',
        rival,
        reward: cash > 0 || gems > 0 ? { cash, gems, railMiles: 0 } : null,
        tone: 'win',
        kicker: `League · now #${rank}`,
        note: `${rival.spoils.what}: ${rival.spoils.perk.label}`,
        league: this.leagueRows(true),
      });
      w.audio.play('chest', { volume: 0.7 });
      w.haptics.success();
    }
    w.save.markDirty();
    w.events.emit('rival.overtaken', { index, rank });
    w.analytics.log('rival_overtaken', { rival: rival.name, rank, seconds: Math.round(w.lifetimeSeconds()) });
  }

  /** Pennants of every rival passed, in the order they were beaten (hoisted on the locomotive). */
  get pennants(): Rival[] {
    const stars = this.w.data.route.stars;
    return this.league.filter((r) => r.reputation <= stars);
  }

  // ─── Rival Watch ───────────────────────────────────────────────────────────

  /** A rival whose taunt waits for the calm after the next departure (never at a station). */
  private tauntDue: number | null = null;

  /**
   * The next rival up the table has their say on the news strip (once each, after the debut): their face, their
   * jibe, and the league round your place. At a station it waits for the calm after the departure.
   */
  private checkRivalTarget(): void {
    const w = this.w;
    const p = this.state;
    if (!p.trainName || !p.interviews.includes(DEBUT_INTERVIEW) || !w.flow.allows('rivals')) return;
    const next = this.standing.next;
    if (!next) return;
    const index = this.rivalIndex(next);
    if (index < 0 || p.rivals.taunted.includes(index)) return;
    // With no dare running, the rival's first word comes with their dare in the next departure's calm.
    if (w.journey.phase === 'onTheMove' && this.calm > 0 && p.dare !== null) this.rivalNews(index);
    else this.tauntDue = index;
  }

  private rivalNews(index: number): void {
    const w = this.w;
    const p = this.state;
    this.tauntDue = null;
    const rival = this.league[index];
    if (!rival || p.rivals.taunted.includes(index) || w.data.route.stars >= rival.reputation) return;
    p.rivals.taunted.push(index);
    w.save.markDirty();
    this.ui.wire({
      headline: `${rival.owner.name}: ${fillTemplate(rival.owner.taunt.headline, { train: this.trainName })}`,
      icon: 'trophy',
      rival,
      reward: null,
      tone: 'rival',
      kicker: 'Rival Watch',
      note: `Pass ${rival.name}: ${rival.spoils.perk.label}`,
      league: this.leagueRows(),
    });
    w.events.emit('rival.taunted', { rival: rival.name });
    w.analytics.log('rival_taunt', { rival: rival.name, stars: w.data.route.stars });
  }

  /** Dev and audits: a rival's taunt on the strip now, without changing progress. */
  devShowRival(index: number): void {
    const rival = RIVALS[Math.max(0, Math.min(RIVALS.length - 1, index))];
    this.ui.wire({
      headline: `${rival.owner.name}: ${fillTemplate(rival.owner.taunt.headline, { train: this.trainName })}`,
      icon: 'trophy', rival, reward: null, tone: 'rival', kicker: 'Rival Watch', note: `Pass ${rival.name}: ${rival.spoils.perk.label}`, league: this.leagueRows(),
    });
  }

  // ─── The rival's dare (session 24) ─────────────────────────────────────────

  /** A departure's calm is due to settle or issue a dare. */
  private dareBreak = false;

  /** Dares start with the rivals' news: once the train is named, interviewed, and the rivals' feature is open. */
  daresOpen(): boolean {
    const p = this.state;
    return !!p.trainName && p.interviews.includes(DEBUT_INTERVIEW) && this.w.flow.allows('rivals');
  }

  /** The dare running now, for the HUD: its rival, icon, count and target (null between editions). */
  get dare(): { rival: Rival; icon: IconName; progress: number; target: number } | null {
    const d = this.state.dare;
    if (!d) return null;
    const def = RIVAL_DARES.find((x) => x.id === d.id);
    const rival = this.league[d.rival];
    if (!def || !rival) return null;
    return { rival, icon: def.icon, progress: d.progress, target: d.target };
  }

  private countDare(metric: DareMetric): void {
    const d = this.state.dare;
    if (!d || d.progress >= d.target) return;
    const def = RIVAL_DARES.find((x) => x.id === d.id);
    if (def?.metric !== metric) return;
    d.progress++;
    this.w.save.markDirty();
    if (d.progress === d.target) {
      // Done before the deadline: a little cheer now, the front page in the next calm.
      this.w.audio.play('chime', { volume: 0.6 });
      this.w.events.emit('rival.dareMet', { rival: this.league[d.rival]?.name ?? '' });
    }
  }

  /**
   * One edition of the rival's dare, in the calm after a departure: a dare whose last station is behind is
   * settled (met: a front page and the prize; missed: the rival's gloat, and the next dare at once), and with
   * none running the rival you are chasing makes a new one. Never a penalty.
   */
  private dareEdition(): void {
    const w = this.w;
    const p = this.state;
    if (!this.daresOpen()) return;
    const d = p.dare;
    if (d && w.data.route.stopsCompleted < d.endsAtStop) return;
    if (d) {
      const rival = this.league[d.rival] ?? RIVALS[0];
      p.dare = null;
      if (d.progress >= d.target) {
        p.dares.won++;
        const cash = DARE_REWARD.cashPerCarriage * w.train.count;
        w.addStars(DARE_REWARD.stars, 'dare');
        this.pay({ cash, gems: 0, railMiles: 0 });
        this.ui.wire({
          headline: fillTemplate(DARE_WON_HEADLINE, { train: this.trainName, rival: rival.owner.name }),
          icon: 'news', rival, reward: { cash, gems: 0, railMiles: 0 }, tone: 'win', kicker: 'Front page',
        });
        w.audio.play('fanfare', { volume: 0.7 });
        w.analytics.log('rival_dare', { result: 'won', rival: rival.name });
        w.save.markDirty();
        return;
      }
      p.dares.lost++;
      w.analytics.log('rival_dare', { result: 'lost', rival: rival.name });
      // The gloat and the next dare on one strip: nothing is taken, there is just another go.
      this.issueDare(fillTemplate(rival.owner.gloat, { train: this.trainName }));
      return;
    }
    this.issueDare(null);
  }

  private issueDare(gloat: string | null): void {
    const w = this.w;
    const p = this.state;
    // The rival you are chasing; at the top of the league, the champion you dethroned wants a rematch.
    const rival = this.standing.next ?? this.league.reduce((a, b) => (b.reputation > a.reputation ? b : a));
    const index = this.rivalIndex(rival);
    const def = nextDare(RIVAL_DARES, p.dares.issued, (x: RivalDare) => this.dareUsable(x));
    if (!def || index < 0) return;
    const target = dareTarget(def.base, def.perCarriage, w.train.count);
    const station = STATIONS[(w.journey.stationIndex + def.stops - 1) % STATIONS.length].name;
    p.dare = { id: def.id, rival: index, target, progress: 0, endsAtStop: w.data.route.stopsCompleted + def.stops, station };
    p.dares.issued++;
    const dareText = fillTemplate(def.dare, { n: target, station });
    // A rival's first word comes with their dare: their taunt, the dare under it, and the league round you.
    const first = !p.rivals.taunted.includes(index);
    if (first) p.rivals.taunted.push(index);
    if (this.tauntDue === index) this.tauntDue = null;
    const cash = DARE_REWARD.cashPerCarriage * w.train.count;
    this.ui.wire({
      headline: `${rival.owner.name}: “${gloat ?? (first ? fillTemplate(rival.owner.taunt.headline, { train: this.trainName }).replace(/[“”]/g, '') : dareText)}”`,
      icon: def.icon,
      rival,
      reward: null,
      tone: 'rival',
      kicker: gloat ? 'Rival watch · missed' : 'Rival’s dare',
      note: gloat || first ? `${dareText} Prize ${cash}` : `Prize ${cash}`,
      league: first ? this.leagueRows() : undefined,
    });
    w.events.emit('rival.taunted', { rival: rival.name });
    w.analytics.log('rival_dare', { result: 'issued', dare: def.id, target, rival: rival.name });
    w.save.markDirty();
  }

  /** A dare that can be met with the train as it is (shoes need beds, a perfect stop needs stops ahead). */
  private dareUsable(def: RivalDare): boolean {
    const w = this.w;
    if (def.metric === 'shoes' || def.metric === 'tidy' || def.metric === 'requests') return w.train.cabins.some((c) => c.unlocked);
    return true;
  }

  // ─── Big moments ───────────────────────────────────────────────────────────

  private queue(key: string): void {
    const p = this.state;
    if (p.pending.includes(key)) return;
    if (key === 'name' && p.trainName) return;
    // The naming card always comes before any story about the train.
    if (key === 'name') p.pending.unshift(key);
    else p.pending.push(key);
    this.w.save.markDirty();
  }

  private showNext(index: number): void {
    const p = this.state;
    const [key] = p.pending.splice(index, 1);
    this.w.save.markDirty();
    if (!key) return;
    // One card per breather, then a leg of the journey before the next.
    this.calm = 0;
    this.sinceShown = 0;
    if (key === 'name') this.showNaming();
    else if (key.startsWith('front:')) this.showFrontPage(Number(key.split(':')[1]));
    else if (key.startsWith('interview:')) this.showInterview(Number(key.split(':')[1]));
    else if (key.startsWith('ceremony:')) this.showCeremony(Number(key.split(':')[1]));
  }

  private showNaming(): void {
    const w = this.w;
    if (this.state.trainName) return;
    this.ui.showNaming(TRAIN_NAME_SUGGESTIONS, (raw) => {
      const p = this.state;
      p.trainName = cleanTrainName(raw, TRAIN_NAME_MAX, DEFAULT_TRAIN_NAME);
      w.save.markDirty();
      w.events.emit('train.named', { name: p.trainName });
      w.audio.play('whistleShort');
      // The Gazette's reporter has a question first; the front page quotes the answer.
      if (p.interviews.includes(DEBUT_INTERVIEW)) this.print('named');
      else if (!p.pending.includes(`interview:${DEBUT_INTERVIEW}`)) p.pending.unshift(`interview:${DEBUT_INTERVIEW}`);
    });
  }

  private showInterview(level: number): void {
    const w = this.w;
    const def = INTERVIEWS.find((i) => i.level === level);
    if (!def || this.state.interviews.includes(level)) return;
    this.ui.showInterview(def, this.trainName, (index) => {
      const answer = def.answers[index] ?? def.answers[0];
      this.state.interviews.push(level);
      w.data.meta.perks[answer.perk.kind] += answer.perk.amount;
      w.save.markDirty();
      w.audio.play('unlock');
      w.ui.toast(answer.perk.label, 'mic');
      if (level === DEBUT_INTERVIEW) {
        this.print('named', { quote: answer.text });
        this.checkRivalTarget();
      }
    });
  }

  private showCeremony(level: number): void {
    const w = this.w;
    const p = this.state;
    const def = CEREMONIES.find((c) => c.level === level);
    if (!def || p.ceremonies.includes(level)) return;
    const rank = this.standing.rank;
    // Anything missed at an earlier ceremony gets a second chance: nothing is lost for good.
    const encore = CEREMONIES.filter((c) => c.level < level).flatMap((c) => c.awards).filter((a) => !p.awards.includes(a.id));
    const awards = [...def.awards, ...encore];
    const results: CeremonyResult[] = awards.map((award) => {
      const progress = awardProgress(award, p.stats, rank);
      const fresh = progress.won && !p.awards.includes(award.id);
      return { award, won: progress.won, fresh, have: progress.have, need: progress.need };
    });
    p.ceremonies.push(level);
    for (const r of results) {
      if (!r.fresh) continue;
      p.awards.push(r.award.id);
      w.wallet.add('gems', r.award.reward.gems, `award:${r.award.id}`);
      w.wallet.add('railMiles', r.award.reward.railMiles, `award:${r.award.id}`);
    }
    w.save.markDirty();
    this.ui.showCeremony({ ...def, awards }, results, this.trainName, () => {
      w.events.emit('awards.presented', { level, won: results.filter((r) => r.fresh).length });
    });
  }
}
