import { STORIES } from '../config/content';
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
} from '../config/press';
import type { NewsItem } from '../save/SaveData';
import { awardProgress, cleanTrainName, fillTemplate, leagueStanding, rivalsPassed, type LeagueStanding } from '../sim/press';
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
  /** A sheet is open; big moments wait. */
  readonly busy: boolean;
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

/** After a departure, this many seconds are a calm beat for interviews and ceremonies. */
const CALM_SECONDS = 25;
/** A front page waits this long after its moment (so the coupling card and camera finish first). */
const FRONT_PAGE_DELAY = 3.2;
const GUESTS_NEWS = 100;
/** Seconds between press cards (the debut chain aside), so news never arrives in a pile. */
const PRESS_GAP = 15;

/**
 * The world noticing your train (the answer to "what am I working towards?"): you name her, the league
 * table of rival trains shows who to overtake next, Rails Tonight interviews you as you level up (every
 * answer a small perk), the Golden Whistle Awards judge how you played, and the Rail Gazette puts only the
 * big moments on its front page, each one a small celebration that pays. Moments wait for calm: never at a
 * station, never on top of another sheet, never mid-coupling.
 */
export class Press {
  private calm = 0;
  private sinceMoment = 99;
  private sinceShown = 99;

  constructor(private readonly w: World, private readonly ui: PressUi) {
    const p = this.state;
    if (p.reputationSeen === 0) p.reputationSeen = w.data.route.stars;
    // Saves from before the debut interview (it used to come at level 2): treat it as done.
    if (p.trainName && !p.interviews.includes(DEBUT_INTERVIEW) && !p.pending.includes(`interview:${DEBUT_INTERVIEW}`)) p.interviews.push(DEBUT_INTERVIEW);
    if (!p.trainName && w.data.route.stopsCompleted > 0) this.queue('name');
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
    e.on('carriage.coupled', ({ index }) => this.print('coupling', { carriage: w.train.carriageName(index), n: index + 1 }));
    e.on('carriage.refurbished', ({ index, tier }) => {
      if (tier >= 3) this.print('refurb3', { carriage: w.train.carriageName(index) });
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
      if (phase === 'onTheMove' && previous === 'departing') this.calm = CALM_SECONDS;
      if (phase === 'arriving' || phase === 'stationStop') this.calm = 0;
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

  get standing(): LeagueStanding {
    return leagueStanding(this.w.data.route.stars, RIVALS);
  }

  update(dt: number): void {
    this.sinceMoment += dt;
    this.sinceShown += dt;
    if (this.calm > 0) this.calm -= dt;
    const p = this.state;
    if (p.pending.length === 0 || this.ui.busy || this.w.train.coupling) return;
    const phase = this.w.journey.phase;
    if (phase === 'arriving' || phase === 'stationStop') return;
    // The first moment that is ready goes next, so a taunt waiting for its breather never holds up news.
    const index = p.pending.findIndex((key) => this.ready(key));
    if (index >= 0) this.showNext(index);
  }

  /**
   * Interviews, ceremonies and rival taunts are for the breather after a station (one per breather); the
   * rest just need a quiet moment. Cards keep a gap between them, except the debut (name, interview, front
   * page), which is one moment: meet the new train.
   */
  private ready(key: string): boolean {
    if (this.isDebut(key)) return this.sinceMoment >= FRONT_PAGE_DELAY;
    if (this.sinceShown < PRESS_GAP) return false;
    const needsBreather = key.startsWith('interview:') || key.startsWith('ceremony:') || key.startsWith('rival:');
    return needsBreather ? this.calm > 0 : this.sinceMoment >= FRONT_PAGE_DELAY;
  }

  private isDebut(key: string): boolean {
    if (key === 'name' || key === `interview:${DEBUT_INTERVIEW}`) return true;
    if (!key.startsWith('front:')) return false;
    const id = Number(key.split(':')[1]);
    return this.state.items.find((i) => i.id === id)?.trigger === 'named';
  }

  /** Dev: show whatever is pending now. */
  flushPending(): void {
    if (this.state.pending.length > 0 && !this.ui.busy) this.showNext(0);
  }

  // ─── Front pages ────────────────────────────────────────────────────────────

  /** Prints a story and queues its front page. Returns null before the train has a name. */
  print(trigger: PressTrigger, vars: Record<string, string | number> = {}): NewsItem | null {
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
      at: Math.round(w.lifetimeSeconds()),
    };
    p.items.unshift(item);
    if (p.items.length > PRESS_ARCHIVE) p.items.length = PRESS_ARCHIVE;
    this.sinceMoment = 0;
    this.queue(`front:${item.id}`);
    w.analytics.log('press_printed', { trigger, level: item.level });
    return item;
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
    const passed = rivalsPassed(p.reputationSeen, now, RIVALS);
    p.reputationSeen = now;
    if (passed.length === 0) return;
    const standing = this.standing;
    const last = passed[passed.length - 1];
    this.w.audio.play('sparkle', { pitch: 1.2 });
    this.w.ui.toast(`#${standing.rank}`, 'trophy');
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

  // ─── Rival Watch ───────────────────────────────────────────────────────────

  /** The next rival up the table taunts you (once each), after the debut and in a breather. */
  private checkRivalTarget(): void {
    const p = this.state;
    if (!p.trainName || !p.interviews.includes(DEBUT_INTERVIEW)) return;
    const next = this.standing.next;
    if (!next) return;
    const index = RIVALS.indexOf(next);
    if (index < 0 || p.rivals.taunted.includes(index)) return;
    this.queue(`rival:${index}`);
  }

  private markHumbled(rival: Rival): void {
    const index = RIVALS.indexOf(rival);
    const humbled = this.state.rivals.humbled;
    if (index >= 0 && !humbled.includes(index)) humbled.push(index);
  }

  private watchFor(rival: Rival, humbled: Rival | null): RivalWatch {
    const w = this.w;
    const livery = w.currentLivery();
    return {
      rival,
      rank: RIVALS.filter((r) => r.reputation > rival.reputation).length + 1,
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
    const rival = RIVALS[index];
    if (!rival || p.rivals.taunted.includes(index)) return;
    p.rivals.taunted.push(index);
    const stars = w.data.route.stars;
    // Passed them before they got a word in: their grumble goes in the next taunt instead.
    if (stars >= rival.reputation) {
      this.checkRivalTarget();
      return;
    }
    // The last rival you passed whose grumble has not run yet.
    const passed = RIVALS.map((r, i) => ({ r, i })).filter(({ r, i }) => r.reputation <= stars && !p.rivals.humbled.includes(i));
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
    // One big moment per breather; front pages do not use it up.
    if (!key.startsWith('front:')) this.calm = 0;
    this.sinceMoment = 0;
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
