import type { QuestDef } from '../config/content';
import { Rng } from '../core/Rng';
import type { QuestState } from '../save/SaveData';

/** Local calendar day key, e.g. "2026-09-28". Daily features roll over at the player's midnight. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface OfflineConfig {
  minAwaySeconds: number;
  capSeconds: number;
  perCabinPerMinute: number;
  perStaffPerMinute: Record<string, number>;
  efficiency: number;
}

export interface Automation {
  openCabins: number;
  staff: Record<string, number>;
}

/**
 * Offline earnings: only automated income accrues, at reduced efficiency and capped, so returning feels
 * rewarding while playing always beats waiting.
 */
export function offlineEarnings(awaySeconds: number, automation: Automation, config: OfflineConfig): { seconds: number; amount: number } {
  if (awaySeconds < config.minAwaySeconds) return { seconds: 0, amount: 0 };
  const staffCount = Object.values(automation.staff).reduce((a, b) => a + b, 0);
  if (staffCount === 0) return { seconds: 0, amount: 0 };
  const seconds = Math.min(awaySeconds, config.capSeconds);
  let perMinute = automation.openCabins * config.perCabinPerMinute;
  for (const [role, count] of Object.entries(automation.staff)) perMinute += (config.perStaffPerMinute[role] ?? 0) * count;
  const amount = Math.floor((perMinute * seconds * config.efficiency) / 60);
  return { seconds, amount };
}

export interface LoginState {
  lastClaimDay: string | null;
  day: number;
}

/**
 * Daily login calendar. Claiming advances one day; a missed day never resets the streak, because nothing in
 * this game punishes the player.
 */
export class DailyLogin {
  constructor(private readonly state: LoginState, private readonly rewardCount: number) {}

  canClaim(today: string): boolean {
    return this.state.lastClaimDay !== today;
  }

  /** Index of the reward that claiming today would give. */
  get nextIndex(): number {
    return this.state.day % this.rewardCount;
  }

  claim(today: string): number | null {
    if (!this.canClaim(today)) return null;
    const index = this.nextIndex;
    this.state.day++;
    this.state.lastClaimDay = today;
    return index;
  }
}

/** Three quests a day, picked deterministically from the day so reloads never reshuffle them. */
export function rollQuests(pool: readonly QuestDef[], today: string, count: number): QuestState[] {
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  const rng = new Rng(seed);
  const remaining = [...pool];
  const chosen: QuestState[] = [];
  while (chosen.length < count && remaining.length > 0) {
    const def = remaining.splice(Math.floor(rng.next() * remaining.length), 1)[0];
    chosen.push({ kind: def.kind, label: def.label, target: def.target, progress: 0, claimed: false, reward: { ...def.reward } });
  }
  return chosen;
}

export function ensureTodayQuests(state: { day: string | null; items: QuestState[] }, pool: readonly QuestDef[], today: string, count: number): boolean {
  if (state.day === today && state.items.length > 0) return false;
  state.day = today;
  state.items = rollQuests(pool, today, count);
  return true;
}

export function progressQuests(items: QuestState[], kind: string, amount = 1): QuestState[] {
  const completedNow: QuestState[] = [];
  for (const quest of items) {
    if (quest.kind !== kind || quest.claimed || quest.progress >= quest.target) continue;
    quest.progress = Math.min(quest.target, quest.progress + amount);
    if (quest.progress >= quest.target) completedNow.push(quest);
  }
  return completedNow;
}

export interface ConductorTrack {
  maxLevel: number;
  perLevel: number;
  costs: number[];
}

export function conductorCost(track: ConductorTrack, level: number): number | null {
  return level >= track.maxLevel ? null : track.costs[level];
}
