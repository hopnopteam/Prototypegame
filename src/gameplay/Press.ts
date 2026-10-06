import { STORIES } from '../config/content';
import { VENUES } from '../config/venues';
import {
  CEREMONIES,
  DEBUT_INTERVIEW,
  DEFAULT_TRAIN_NAME,
  FRONT_PAGE_REWARDS,
  HEADLINES,
  INTERVIEWS,
  PRESS_ARCHIVE,
  RIVALS,
  TOP_RANK_NEWS,
  TRAIN_NAME_MAX,
  TRAIN_NAME_SUGGESTIONS,
  type AwardDef,
  type CeremonyDef,
  type InterviewDef,
  type PressTrigger,
  type Rival,
  PRESS_PACING,
  RACE_CHALLENGES,
  RIVAL_MOVES,
  RIVAL_RACE,
} from '../config/press';
import type { IconName } from '../ui/icons';
import type { NewsItem } from '../save/SaveData';
import { awardProgress, cleanTrainName, fillTemplate, leagueStanding, raceProgress, rivalsPassed, type LeagueStanding, type RaceProgress } from '../sim/press';
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
  /** Rival Watch: a rival owner's taunt (and the last one you passed, grumbling), with the gap to close. */
  showRivalWatch(watch: RivalWatch, onDone: () => void): void;
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
}

/** A race to the next station against the rival you are chasing (session 20). */
export interface RaceLeg {
  rival: Rival;
  index: number;
  station: string;
  /** Stars to earn before the train arrives, and earned so far this ride. */
  target: number;
  earned: number;
}

export interface RivalWatch {
  rival: Rival;
  /** Their place in the league (1 = top). */
  rank: number;
  /** The rival you passed most recently, if their grumble has not run yet. */
  humbled: Rival | null;
  trainName: string;
  stars: number;
  livery: string;
  trim: string;
  carriages: number;
}

/**
 * The race to the next rival as the HUD shows it (session 18): who, how far, and how they are taking it.
 * `humbled` is the rival just passed, shown scowling for a moment before the next one takes their place.
 */
export interface RaceView extends RaceProgress {
  visible: boolean;
  mood: 'smug' | 'nervous' | 'humbled';
  humbled: Rival | null;
  /** A flinch at one of your big moments (a coupling, a refit), shown as an icon beside their face. */
  reaction: 'frown' | 'bolt' | null;
  /** A race to the next station is on (session 20): the chip shows your stars against their target. */
  leg: RaceLeg | null;
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
  /** The rival just passed (scowling on the HUD for a moment) and for how much longer. */
  private humbledShown: Rival | null = null;
  private humbledLeft = 0;
  /** A flinch on the rival chip and for how much longer; the gap since the last one. */
  private reaction: RaceView['reaction'] = null;
  private reactionLeft = 0;
  private sinceReaction = RIVAL_RACE.reactGap;
  private raceStars = -1;
  private readonly raceView: RaceView = { visible: false, next: null, from: 0, to: 0, fraction: 0, rank: 0, mood: 'smug', humbled: null, reaction: null, leg: null };
  /** The league as it stands: each rival's reputation plus what the races they won added (session 20). */
  private leagueCache: Rival[] = RIVALS;
  private leagueKey = '';
  /** The race to the next station, if one is on; rides since the last one; stars at the last departure. */
  private leg: RaceLeg | null = null;
  private ridesSinceRace = 0;
  private starsAtDeparture = -1;
  private lastRideStars = 0;
  /** Seconds into a ride before a rival pulls alongside with a challenge (-1: not this ride). */
  private challengeIn = -1;

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
    });
    e.on('station.result', (r) => {
      if (w.data.route.stopsCompleted >= 1) this.queue('name');
      if (r.clean) p.stats.perfectStops++;
      w.save.markDirty();
    });
    e.on('carriage.coupled', ({ index, type }) => {
      // A venue joining is its own news: it opens (session 20).
      if (type === 'cafe' || type === 'dining' || type === 'bar' || type === 'dome') this.print('venue', { venue: VENUES[type].name });
      else this.print('coupling', { carriage: w.train.carriageName(index), n: index + 1 });
      this.react('frown');
    });
    e.on('carriage.refurbished', ({ index, tier }) => {
      if (tier >= 2) this.react('frown');
      // Passenger carriages make the paper as they reach First Class and the Royal Suite (Business is the
      // walnut-and-brass refit); service cars when they go luxurious.
      const trigger: PressTrigger | null = tier >= 5 ? 'royal' : tier === 4 ? 'firstClass' : tier === 3 ? 'refurb3' : null;
      if (trigger) this.print(trigger, { carriage: w.train.carriageName(index) });
    });
    e.on('livery.changed', ({ name }) => this.print('livery', { livery: name }));
    e.on('stars.added', ({ amount }) => {
      if (this.leg) this.leg.earned += amount;
      this.checkLeague();
      this.checkRivalTarget();
      this.checkRace();
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
        // A ride begins: what the last one earned (departure to arrival) sets the pace of any race on this one.
        this.starsAtDeparture = w.data.route.stars;
        this.ridesSinceRace++;
        this.challengeIn = RIVAL_RACE.showdown.challengeDelay;
      }
      if (phase === 'arriving') {
        this.challengeIn = -1;
        if (this.starsAtDeparture >= 0) this.lastRideStars = w.data.route.stars - this.starsAtDeparture;
        if (this.leg) this.loseRace(this.leg);
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
      this.raceStars = -1;
    }
    return this.leagueCache;
  }

  /** A rival's place in the config list (stable whatever their reputation does). */
  rivalIndex(rival: Rival): number {
    return RIVALS.findIndex((r) => r.name === rival.name);
  }

  /** The race as the HUD's rival chip shows it (one object, refreshed in place). */
  get race(): RaceView {
    const w = this.w;
    const v = this.raceView;
    // The standing only changes when stars do (the HUD asks every frame).
    const league = this.league;
    if (w.data.route.stars !== this.raceStars) {
      this.raceStars = w.data.route.stars;
      Object.assign(v, raceProgress(this.raceStars, league));
    }
    v.leg = this.leg;
    v.visible = this.named && w.flow.allows('rivals');
    v.humbled = this.humbledLeft > 0 ? this.humbledShown : null;
    v.reaction = this.reactionLeft > 0 ? this.reaction : null;
    const legClose = !!this.leg && this.leg.earned >= this.leg.target * RIVAL_RACE.nearShare;
    v.mood = v.humbled ? 'humbled' : v.next && (v.fraction >= RIVAL_RACE.nearShare || v.reaction || legClose) ? 'nervous' : 'smug';
    return v;
  }

  /** The rival you are chasing flinches at one of your big moments (rate-limited; only while the race shows). */
  private react(kind: NonNullable<RaceView['reaction']>): void {
    if (this.sinceReaction < RIVAL_RACE.reactGap || !this.named || !this.w.flow.allows('rivals') || !this.standing.next) return;
    this.reaction = kind;
    this.reactionLeft = RIVAL_RACE.reactSeconds;
    this.sinceReaction = 0;
  }

  update(dt: number): void {
    if (this.challengeIn > 0) {
      this.challengeIn -= dt;
      if (this.challengeIn <= 0) this.maybeChallenge();
    }
    this.sinceShown += dt;
    this.sinceReaction += dt;
    if (this.reactionLeft > 0) this.reactionLeft -= dt;
    if (this.humbledLeft > 0) this.humbledLeft -= dt;
    if (this.calm > 0) this.calm -= dt;
    this.quiet = this.ui.busy ? 0 : this.quiet + dt;
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
    // The first rival's taunt comes right after the debut: someone to beat is the hook.
    if (key.startsWith('rival:') && this.state.rivals.taunted.length === 0) return 60;
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
  print(trigger: PressTrigger, vars: Record<string, string | number> = {}, extra?: { cash?: number; rival?: Rival }): NewsItem | null {
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
      this.ui.wire({ headline: item.headline, icon: trigger === 'raceWon' ? 'flag' : 'news', rival: extra?.rival ?? null, reward, tone: trigger === 'raceWon' ? 'win' : 'news' });
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

  // ─── The race to the next station (session 20) ─────────────────────────────

  /**
   * A few seconds into a ride, the rival you are chasing may challenge you to a race to the next station: earn
   * their target in stars before you arrive. Every other ride at most, once you have closed some of the gap.
   */
  private maybeChallenge(): void {
    const w = this.w;
    const cfg = RIVAL_RACE.showdown;
    if (this.leg || !this.named || !w.flow.allows('rivals') || this.ridesSinceRace < cfg.everyLegs) return;
    if (w.journey.phase !== 'onTheMove') return;
    const race = this.race;
    const next = race.next;
    if (!next || race.fraction < cfg.minShare) return;
    const index = this.rivalIndex(next);
    const target = Math.max(cfg.minStars, Math.round(this.lastRideStars * cfg.pace));
    const station = w.station.currentStation().name;
    this.leg = { rival: next, index, station, target, earned: 0 };
    this.ridesSinceRace = 0;
    this.state.rivals.races++;
    const challenge = RACE_CHALLENGES[this.state.rivals.races % RACE_CHALLENGES.length];
    this.ui.wire({ headline: fillTemplate(challenge, { station }), icon: 'flag', rival: next, reward: null, tone: 'rival' });
    w.audio.play('whistleShort');
    w.events.emit('rival.race', { rival: next.name, target, station });
    w.analytics.log('rival_race', { rival: next.name, target });
  }

  /** Stars landed: a race won the moment you reach their target. */
  private checkRace(): void {
    const leg = this.leg;
    if (!leg || leg.earned < leg.target) return;
    this.leg = null;
    const w = this.w;
    const cfg = RIVAL_RACE.showdown;
    const p = this.state;
    p.rivals.wins++;
    // They lose a step they had gained; with none to lose, you gain a little ground on them.
    const boost = p.rivals.boost;
    const step = Math.round(RIVALS[leg.index].reputation * cfg.moveShare);
    let bonus = 0;
    if ((boost[leg.index] ?? 0) > 0) boost[leg.index] = Math.max(0, (boost[leg.index] ?? 0) - step);
    else bonus = Math.max(1, Math.round((this.race.to - this.race.from) * cfg.bonusShare));
    this.print('raceWon', { station: leg.station, rival: leg.rival.name }, { cash: cfg.purse * w.train.count, rival: leg.rival });
    this.react('frown');
    w.audio.play('fanfare');
    w.particles.emit('confetti', w.player.pos.x, 2.6, w.player.pos.z, 30, 1.1);
    w.save.markDirty();
    w.events.emit('rival.raceResult', { rival: leg.rival.name, won: true });
    if (bonus > 0) w.addStars(bonus, 'race', w.player.pos);
  }

  /** The train arrives with the target not reached: the rival got there first, and makes a move with it. */
  private loseRace(leg: RaceLeg): void {
    this.leg = null;
    const w = this.w;
    const cfg = RIVAL_RACE.showdown;
    const boost = this.state.rivals.boost;
    const step = Math.round(RIVALS[leg.index].reputation * cfg.moveShare);
    const moves = Math.round((boost[leg.index] ?? 0) / Math.max(1, step));
    let headline = `${leg.rival.name} got there first`;
    if (moves < cfg.maxMoves && step > 0) {
      while (boost.length <= leg.index) boost.push(0);
      boost[leg.index] += step;
      headline = `${leg.rival.name} ${RIVAL_MOVES[(leg.index + moves) % RIVAL_MOVES.length]}`;
    }
    this.ui.wire({ headline, icon: 'frown', rival: leg.rival, reward: null, tone: 'rival' });
    w.save.markDirty();
    w.events.emit('rival.raceResult', { rival: leg.rival.name, won: false });
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
    for (const rival of passed) this.overtake(rival, standing.rank);
    // The big overtakes are front-page news, with the loser's grumble as the quote.
    if (standing.rank === 1) {
      if (!p.fired.champion) {
        this.print('champion', { quote: last.owner.humbled });
        this.markHumbled(last);
      }
    } else if (standing.rank <= TOP_RANK_NEWS && !p.fired.topThree) {
      this.print('topThree', { rival: last.name, quote: last.owner.humbled });
      this.markHumbled(last);
    }
  }

  /**
   * Passing a rival (session 18): their spoils change hands on the spot (a permanent perk, a purse, gems),
   * their face scowls on the HUD for a moment, and their pennant goes up on your locomotive. No card.
   */
  private overtake(rival: Rival, rank: number): void {
    const w = this.w;
    const p = this.state;
    const index = this.rivalIndex(rival);
    if (index < 0) return;
    // Passed mid-race: the overtake is the win (its own celebration), the race simply ends.
    if (this.leg && this.leg.index === index) this.leg = null;
    // Before the race is on screen (the opening), the spoils change hands quietly: one layer at a time.
    const shown = this.named && w.flow.allows('rivals');
    if (!shown) {
      if (!p.rivals.prized.includes(index)) {
        p.rivals.prized.push(index);
        w.data.meta.perks[rival.spoils.perk.kind] += rival.spoils.perk.amount;
        w.wallet.add('cash', rival.spoils.cashPerCarriage * w.train.count, 'rival');
        if (rival.spoils.gems) w.wallet.add('gems', rival.spoils.gems, 'rival');
      }
      w.events.emit('rival.overtaken', { index, rank });
      return;
    }
    this.humbledShown = rival;
    this.humbledLeft = RIVAL_RACE.humbledSeconds;
    this.reactionLeft = 0;
    if (!p.rivals.prized.includes(index)) {
      p.rivals.prized.push(index);
      const spoils = rival.spoils;
      w.data.meta.perks[spoils.perk.kind] += spoils.perk.amount;
      const cash = spoils.cashPerCarriage * w.train.count;
      if (cash > 0) w.wallet.add('cash', cash, 'rival');
      if (spoils.gems) w.wallet.add('gems', spoils.gems, 'rival');
      w.ui.toast(spoils.perk.label, 'trophy');
    }
    w.audio.play('sparkle', { pitch: 1.2 });
    w.audio.play('chest');
    w.haptics.success();
    w.particles.emit('confetti', w.player.pos.x, 2.6, w.player.pos.z, 36, 1.2);
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

  /** The next rival up the table taunts you (once each), after the debut and in a breather. */
  private checkRivalTarget(): void {
    const p = this.state;
    if (!p.trainName || !p.interviews.includes(DEBUT_INTERVIEW)) return;
    const next = this.standing.next;
    if (!next) return;
    const index = this.rivalIndex(next);
    if (index < 0 || p.rivals.taunted.includes(index)) return;
    this.queue(`rival:${index}`);
  }

  private markHumbled(rival: Rival): void {
    const index = this.rivalIndex(rival);
    const humbled = this.state.rivals.humbled;
    if (index >= 0 && !humbled.includes(index)) humbled.push(index);
  }

  private watchFor(rival: Rival, humbled: Rival | null): RivalWatch {
    const w = this.w;
    const livery = w.currentLivery();
    return {
      rival,
      rank: this.league.filter((r) => r.reputation > rival.reputation).length + 1,
      humbled,
      trainName: this.trainName,
      stars: w.data.route.stars,
      livery: livery.body,
      trim: livery.trim,
      carriages: w.train.count,
    };
  }

  /** Dev and audits: show a rival's taunt now (the one below them grumbling), without changing progress. */
  devShowRival(index: number): void {
    const rival = RIVALS[Math.max(0, Math.min(RIVALS.length - 1, index))];
    this.ui.showRivalWatch(this.watchFor(rival, RIVALS[RIVALS.indexOf(rival) - 1] ?? null), () => undefined);
  }

  private showRival(index: number): void {
    const w = this.w;
    const p = this.state;
    const rival = this.league[index];
    if (!rival || p.rivals.taunted.includes(index)) return;
    p.rivals.taunted.push(index);
    const stars = w.data.route.stars;
    // Passed them before they got a word in: their grumble goes in the next taunt instead.
    if (stars >= rival.reputation) {
      this.checkRivalTarget();
      return;
    }
    // The last rival you passed whose grumble has not run yet.
    const passed = this.league.map((r, i) => ({ r, i })).filter(({ r, i }) => r.reputation <= stars && !p.rivals.humbled.includes(i));
    const humbled = passed.length > 0 ? passed[passed.length - 1] : null;
    for (const { i } of passed) p.rivals.humbled.push(i);
    w.save.markDirty();
    w.audio.play('whoosh');
    this.ui.showRivalWatch(this.watchFor(rival, humbled ? humbled.r : null), () => {
      w.audio.play('whistleShort');
      w.events.emit('rival.taunted', { rival: rival.name });
      w.analytics.log('rival_taunt', { rival: rival.name, stars });
    });
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
    else if (key.startsWith('rival:')) this.showRival(Number(key.split(':')[1]));
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
