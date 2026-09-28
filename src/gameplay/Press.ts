import { ROUTE1_CARRIAGES, STORIES } from '../config/content';
import {
  CEREMONIES,
  DEFAULT_TRAIN_NAME,
  HEADLINES,
  INTERVIEWS,
  LONG_QUEUE_MIN,
  NOMINATION_LEVEL,
  PRESS_ARCHIVE,
  RIVALS,
  TRAIN_NAME_MAX,
  TRAIN_NAME_SUGGESTIONS,
  WEEKLY_EVERY_STOPS,
  type AwardDef,
  type CeremonyDef,
  type InterviewDef,
  type PressTrigger,
} from '../config/press';
import type { NewsItem } from '../save/SaveData';
import { awardProgress, cleanTrainName, fillTemplate, leagueStanding, rivalsPassed, type LeagueStanding } from '../sim/press';
import { TIER_NAMES } from '../world/palette';
import type { World } from './World';

export interface CeremonyResult {
  award: AwardDef;
  won: boolean;
  /** Won just now (rewards are granted once). */
  fresh: boolean;
  have: number;
  need: number;
}

/** What the press needs from the UI. Opening any of these pauses the game like every other sheet. */
export interface PressUi {
  showNaming(suggestions: string[], onDone: (name: string) => void): void;
  showInterview(def: InterviewDef, trainName: string, onAnswer: (index: number) => void): void;
  showCeremony(def: CeremonyDef, results: CeremonyResult[], trainName: string, onDone: () => void): void;
  newsFlash(item: NewsItem): void;
  /** A sheet is open; big moments wait. */
  readonly busy: boolean;
}

/** After a departure, the next this-many seconds are a calm beat for a naming card, interview or ceremony. */
const CALM_SECONDS = 25;
/** Passenger milestones that make the paper. */
const GUEST_MILESTONES: [number, PressTrigger][] = [[25, 'guests25'], [100, 'guests100'], [250, 'guests250']];

/**
 * The world noticing your train (the answer to "what am I working towards?"): you name her, the Rail
 * Gazette reports what you actually do, a league table of rival trains shows who to overtake next, Rails
 * Tonight interviews you as you level up (every answer a small perk), and the Golden Whistle Awards judge
 * how you played. Big moments wait for the calm right after a departure; nothing interrupts a task.
 */
export class Press {
  private calm = 0;

  constructor(private readonly w: World, private readonly ui: PressUi) {
    const p = this.state;
    if (p.reputationSeen === 0) p.reputationSeen = w.data.route.stars;
    if (!p.trainName && w.data.route.stopsCompleted > 0) this.queue('name');
    const e = w.events;
    e.on('guest.checkedIn', () => this.onGuest());
    e.on('request.fulfilled', () => {
      p.stats.requests++;
    });
    e.on('station.result', (r) => {
      if (w.data.route.stopsCompleted >= 1) this.queue('name');
      if (r.clean) {
        p.stats.perfectStops++;
        p.stats.streak++;
        if (p.stats.streak % 3 === 0) this.print('perfectStreak', { station: r.stationName });
      } else {
        p.stats.streak = 0;
        const stop = w.data.route.stopsCompleted;
        if (r.waiting >= LONG_QUEUE_MIN && stop - p.stats.lastQueueStop >= 6) {
          p.stats.lastQueueStop = stop;
          this.print('longQueue', { station: r.stationName, n: r.waiting });
        }
      }
      const stop = w.data.route.stopsCompleted;
      if (stop - p.stats.lastWeeklyStop >= WEEKLY_EVERY_STOPS && p.trainName) {
        p.stats.lastWeeklyStop = stop;
        this.print('weekly', { n: p.stats.weekGuests });
        p.stats.weekGuests = 0;
      }
      w.save.markDirty();
    });
    e.on('carriage.coupled', ({ index }) => {
      const carriage = ROUTE1_CARRIAGES[index]?.name ?? 'carriage';
      this.print(index === 1 ? 'firstCoupling' : 'coupling', { carriage, n: index + 1 });
    });
    e.on('staff.hired', () => this.once('firstHire'));
    e.on('carriage.refurbished', ({ index, tier }) => {
      const trigger = `refurb${Math.min(3, tier)}` as PressTrigger;
      this.once(trigger, { carriage: ROUTE1_CARRIAGES[index]?.name ?? 'carriage', tier: TIER_NAMES[tier] ?? '' });
    });
    e.on('livery.changed', ({ name }) => this.print('livery', { livery: name }));
    e.on('stars.added', () => this.checkLeague());
    e.on('level.up', ({ level }) => {
      if (level === NOMINATION_LEVEL) this.once('nominated');
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

  get unread(): number {
    return this.state.unread;
  }

  markRead(): void {
    if (this.state.unread === 0) return;
    this.state.unread = 0;
    this.w.save.markDirty();
  }

  update(dt: number): void {
    if (this.calm <= 0) return;
    this.calm -= dt;
    if (this.state.pending.length > 0 && !this.ui.busy) this.showNext();
  }

  /** Dev: show whatever is pending now. */
  flushPending(): void {
    if (this.state.pending.length > 0 && !this.ui.busy) this.showNext();
  }

  // ─── Printing ───────────────────────────────────────────────────────────────

  private once(trigger: PressTrigger, vars: Record<string, string | number> = {}): void {
    if (this.state.fired[trigger]) return;
    this.print(trigger, vars);
  }

  print(trigger: PressTrigger, vars: Record<string, string | number> = {}): NewsItem | null {
    const w = this.w;
    const p = this.state;
    // Nobody writes about a train without a name: early news waits for the naming card.
    if (!p.trainName && trigger !== 'named') return null;
    const variants = HEADLINES[trigger];
    const count = p.fired[trigger] ?? 0;
    const def = variants[count % variants.length];
    p.fired[trigger] = count + 1;
    const standing = this.standing;
    const all = { train: this.trainName, rank: standing.rank, n: w.train.count, ...vars };
    const livery = w.currentLivery();
    const item: NewsItem = {
      id: p.nextId++,
      trigger,
      headline: fillTemplate(def.headline, all),
      body: fillTemplate(def.body, all),
      level: w.progression.level,
      carriages: w.train.count,
      livery: livery.body,
      trim: livery.trim,
      at: Math.round(w.lifetimeSeconds()),
    };
    p.items.unshift(item);
    if (p.items.length > PRESS_ARCHIVE) p.items.length = PRESS_ARCHIVE;
    p.unread++;
    w.save.markDirty();
    this.ui.newsFlash(item);
    w.analytics.log('press_printed', { trigger, level: item.level });
    return item;
  }

  private onGuest(): void {
    const p = this.state;
    p.stats.guests++;
    p.stats.weekGuests++;
    for (const [n, trigger] of GUEST_MILESTONES) if (p.stats.guests === n) this.print(trigger, { n });
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
    this.w.ui.toast(`Overtook ${last.name}! Now #${standing.rank} in the league`, 'trophy');
    this.w.audio.play('sparkle', { pitch: 1.2 });
    if (standing.rank === 1) this.once('champion');
    else this.print('overtake', { rival: last.name });
  }

  // ─── Big moments ───────────────────────────────────────────────────────────

  private queue(key: string): void {
    const p = this.state;
    if (p.pending.includes(key)) return;
    if (key === 'name' && p.trainName) return;
    p.pending.push(key);
    this.w.save.markDirty();
  }

  private showNext(): void {
    const p = this.state;
    const key = p.pending.shift();
    this.w.save.markDirty();
    if (!key) return;
    this.calm = 0;
    if (key === 'name') this.showNaming();
    else if (key.startsWith('interview:')) this.showInterview(Number(key.split(':')[1]));
    else if (key.startsWith('ceremony:')) this.showCeremony(Number(key.split(':')[1]));
  }

  private showNaming(): void {
    const w = this.w;
    if (this.state.trainName) return;
    this.ui.showNaming(TRAIN_NAME_SUGGESTIONS, (raw) => {
      this.state.trainName = cleanTrainName(raw, TRAIN_NAME_MAX, DEFAULT_TRAIN_NAME);
      w.save.markDirty();
      w.events.emit('train.named', { name: this.state.trainName });
      w.audio.play('whistleShort');
      this.print('named');
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
      w.ui.toast(`Rails Tonight: ${answer.perk.label}, for good`, 'mic');
      this.print('interview', { quote: answer.text });
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
      const won = results.filter((r) => r.fresh);
      if (won.length > 0) this.print('award', { award: won.map((r) => r.award.name).join(' and ') });
      w.events.emit('awards.presented', { level, won: won.length });
    });
  }
}
