import { QUEST_POOL, STATIONS, STORIES, type StoryDef } from '../config/content';
import type { ItemKind } from '../core/types';
import type { QuestState } from '../save/SaveData';
import { DailyLogin, dayKey, ensureTodayQuests, progressQuests } from '../sim/meta';
import type { World } from './World';

/**
 * The slower goals that aren't just bigger numbers (§11): postcards from every station and story, daily
 * quests (route level 3), the login calendar (level 4) and regular passengers with story chains (level 5).
 */
export class Meta {
  readonly login: DailyLogin;
  private storyAboardThisStop: string | null = null;

  constructor(private readonly w: World) {
    this.login = new DailyLogin(w.data.meta.login, w.econ.daily.loginRewards.length);
    // Guests are not saved, so nobody from a story is aboard when a session starts.
    for (const state of Object.values(w.data.meta.stories)) state.aboard = false;
    w.events.on('guest.checkedIn', () => this.progress('serveGuests'));
    w.events.on('cabin.cleaned', () => this.progress('cleanCabins'));
    w.events.on('request.fulfilled', () => this.progress('fulfilRequests'));
    w.events.on('luggage.loaded', () => this.progress('loadLuggage'));
    w.events.on('station.result', (r) => r.clean && this.progress('cleanStops'));
  }

  get today(): string {
    return dayKey(new Date());
  }

  // ─── Postcards ──────────────────────────────────────────────────────────────

  /** Collects the station's postcard on the first visit. Returns true if it was new (the arrival card says so). */
  onStationVisited(id: string, name: string): boolean {
    const cards = this.w.data.meta.postcards;
    if (cards.includes(id)) return false;
    cards.push(id);
    this.w.save.markDirty();
    this.w.events.emit('postcard.collected', { id, name });
    return true;
  }

  postcardCount(): { have: number; total: number } {
    return { have: this.w.data.meta.postcards.length, total: STATIONS.length + STORIES.length };
  }

  // ─── Daily quests ───────────────────────────────────────────────────────────

  questsUnlocked(): boolean {
    return this.w.progression.isFeatureUnlocked('dailyQuests');
  }

  quests(): QuestState[] {
    const state = this.w.data.meta.quests;
    if (ensureTodayQuests(state, QUEST_POOL, this.today, this.w.econ.daily.questsPerDay)) this.w.save.markDirty();
    return state.items;
  }

  claimQuest(index: number): boolean {
    const quest = this.quests()[index];
    if (!quest || quest.claimed || quest.progress < quest.target) return false;
    quest.claimed = true;
    if (quest.reward.gems) this.w.wallet.add('gems', quest.reward.gems, 'quest');
    if (quest.reward.railMiles) this.w.wallet.add('railMiles', quest.reward.railMiles, 'quest');
    this.w.save.markDirty();
    this.w.audio.play('chest');
    return true;
  }

  claimableQuests(): number {
    if (!this.questsUnlocked()) return 0;
    return this.quests().filter((q) => !q.claimed && q.progress >= q.target).length;
  }

  private progress(kind: string): void {
    if (!this.questsUnlocked()) return;
    const done = progressQuests(this.quests(), kind);
    for (const quest of done) this.w.ui.toast(`Quest complete: ${quest.label}`, 'quest');
    this.w.save.markDirty();
  }

  // ─── Daily login ────────────────────────────────────────────────────────────

  loginUnlocked(): boolean {
    return this.w.progression.isFeatureUnlocked('dailyLogin');
  }

  canClaimLogin(): boolean {
    return this.loginUnlocked() && this.login.canClaim(this.today);
  }

  /** Claims today's reward (doubled after a rewarded ad or gems). Returns what was granted. */
  claimLogin(double: boolean): { cash?: number; gems?: number; railMiles?: number } | null {
    const index = this.login.claim(this.today);
    if (index === null) return null;
    const base = this.w.econ.daily.loginRewards[index];
    const k = double ? 2 : 1;
    const levelScale = 1 + (this.w.progression.level - 1) * 0.25;
    const granted = {
      cash: base.cash ? Math.round(base.cash * levelScale * k) : undefined,
      gems: base.gems ? base.gems * k : undefined,
      railMiles: base.railMiles ? base.railMiles * k : undefined,
    };
    if (granted.cash) this.w.wallet.add('cash', granted.cash, 'login');
    if (granted.gems) this.w.wallet.add('gems', granted.gems, 'login');
    if (granted.railMiles) this.w.wallet.add('railMiles', granted.railMiles, 'login');
    this.w.save.markDirty();
    return granted;
  }

  // ─── Stories ────────────────────────────────────────────────────────────────

  storiesUnlocked(): boolean {
    return this.w.progression.isFeatureUnlocked('stories');
  }

  private storyState(story: StoryDef): { step: number; done: boolean; aboard: boolean } {
    const all = this.w.data.meta.stories;
    if (!all[story.id]) all[story.id] = { step: 0, done: false, aboard: false };
    return all[story.id];
  }

  activeStory(): StoryDef | null {
    if (!this.storiesUnlocked()) return null;
    return STORIES.find((s) => !this.storyState(s).done) ?? null;
  }

  /** A story passenger boards at this stop if their chain is active and they are not already aboard. */
  storyGuestForStop(): StoryDef | null {
    const story = this.activeStory();
    if (!story) return null;
    const state = this.storyState(story);
    if (state.aboard) return null;
    state.aboard = true;
    this.storyAboardThisStop = story.id;
    return story;
  }

  /** The story passenger missed the train (or was removed): they will be on the next platform. */
  onStoryGuestLost(story: StoryDef): void {
    const state = this.storyState(story);
    if (!state.done) state.aboard = false;
  }

  onStoryGuestCheckedIn(story: StoryDef): void {
    this.w.save.markDirty();
    this.w.ui.celebrate(story.name, story.intro, 'heart');
  }

  storyRequest(story: StoryDef): ItemKind | null {
    const state = this.storyState(story);
    const step = story.steps[state.step];
    return step?.kind === 'request' && step.item ? step.item : null;
  }

  onStoryRequestDone(story: StoryDef, item: ItemKind): void {
    const state = this.storyState(story);
    const step = story.steps[state.step];
    if (step?.kind === 'request' && step.item === item) this.advance(story);
  }

  onCleanStop(): void {
    for (const story of STORIES) {
      const state = this.storyState(story);
      if (!state.aboard || state.done) continue;
      if (story.steps[state.step]?.kind === 'cleanStop') this.advance(story);
    }
  }

  onStoryGuestAlighted(story: StoryDef): void {
    const state = this.storyState(story);
    state.aboard = false;
    if (story.steps[state.step]?.kind === 'ride') this.advance(story);
    this.w.save.markDirty();
  }

  private advance(story: StoryDef): void {
    const w = this.w;
    const state = this.storyState(story);
    state.step++;
    const next = story.steps[state.step];
    if (next) {
      w.ui.toast(`${story.name}: "${next.line}"`, 'heart');
    } else {
      state.done = true;
      state.aboard = false;
      const perks = w.data.meta.perks;
      if (story.perk.kind === 'tipBonus') perks.tipBonus += story.perk.amount;
      else perks.fareBonus += story.perk.amount;
      if (!w.data.meta.postcards.includes(`story:${story.id}`)) w.data.meta.postcards.push(`story:${story.id}`);
      w.ui.celebrate(`${story.name}'s story`, story.perk.label, 'album');
      w.audio.play('fanfare');
    }
    w.events.emit('story.step', { id: story.id, step: state.step, done: state.done });
    w.save.markDirty();
  }

  storyProgress(story: StoryDef): { step: number; done: boolean } {
    const state = this.storyState(story);
    return { step: state.step, done: state.done };
  }

  get boardedStoryThisStop(): string | null {
    return this.storyAboardThisStop;
  }
}
