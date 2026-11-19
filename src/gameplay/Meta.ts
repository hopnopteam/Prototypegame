import { QUEST_POOL, STATIONS } from '../config/content';
import type { QuestState } from '../save/SaveData';
import { DailyLogin, dayKey, ensureTodayQuests, progressQuests } from '../sim/meta';
import type { World } from './World';

/**
 * The slower goals that aren't just bigger numbers (§11): postcards from every station, daily quests and the login
 * calendar (route level 2). Phase 3: the passengers' stories are gone (publisher: "remove the guest stories").
 */
export class Meta {
  readonly login: DailyLogin;

  constructor(private readonly w: World) {
    this.login = new DailyLogin(w.data.meta.login, w.econ.daily.loginRewards.length);
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
    // Phase 1: only the active route's stations count (an older save may hold cards from stations the route left).
    const ids = new Set(STATIONS.map((s) => s.id));
    return { have: this.w.data.meta.postcards.filter((id) => ids.has(id)).length, total: STATIONS.length };
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
    this.w.analytics.log('quest_claimed', { kind: quest.kind });
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
    for (const _quest of done) this.w.ui.toast('Quest done', 'quest');
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
    this.w.analytics.log('login_claimed', { day: index, doubled: double });
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

  // ─── The Station Master's Chest ──────────────────────────────────────────────

  chestUnlocked(): boolean {
    return this.w.econ.chest.enabled && this.w.progression.isFeatureUnlocked('chest');
  }

  /** Seconds until the chest is full again (0 when it is ready). */
  chestLeft(): number {
    return Math.max(0, (this.w.data.meta.chestReadyAt - Date.now()) / 1000);
  }

  /** Opens a full chest: cash for every carriage and a few gems; it fills again in `chest.hours`. */
  openChest(): { cash: number; gems: number } | null {
    if (!this.chestUnlocked() || this.chestLeft() > 0) return null;
    const c = this.w.econ.chest;
    const cash = c.cashPerCarriage * this.w.train.count;
    this.w.wallet.add('cash', cash, 'chest');
    this.w.wallet.add('gems', c.gems, 'chest');
    this.w.data.meta.chestReadyAt = Date.now() + c.hours * 3600 * 1000;
    this.w.analytics.log('chest_opened', { cash, gems: c.gems });
    this.w.save.markDirty();
    return { cash, gems: c.gems };
  }

}
