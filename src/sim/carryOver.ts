import { createDefaultSave, type SaveData } from '../save/SaveData';

/** What a completed route hands to the next one, and what it leaves behind (Phase 3; the flow comes in Phase 4). */
export interface CarryOverResult {
  data: SaveData;
  /** What was kept, for the debug panel and tests. */
  kept: { gems: number; railMiles: number; conductor: SaveData['conductor'] };
  /** Cash that stays behind on the finished route. */
  cashLeft: number;
}

/**
 * Phase 3: starts the next route from a finished one. Carries over the gems, the Rail Miles and the conductor's
 * upgrades (and everything that belongs to the player rather than the train: the profile, settings, postcards, login
 * calendar, quests, permanent perks, cosmetics, the press's name for the train and the ad history). Resets the cash, the
 * carriages and their unlocks (the shoes among them), the staff, the station upgrades of the new route, the route level
 * and stars, the facilities and the goals. Pure: returns a new save and never touches the one passed in.
 */
export function carryOver(from: SaveData, nextRouteId: string, now: number): CarryOverResult {
  const src = structuredClone(from);
  const data = createDefaultSave(now, src.profile.installId);
  data.createdAt = src.createdAt;
  data.profile = src.profile;
  data.settings = src.settings;
  data.monetization = src.monetization;
  data.meta = src.meta;
  data.cosmetics = src.cosmetics;
  data.press = src.press;
  data.conductor = { ...src.conductor };
  data.wallet = { cash: 0, gems: src.wallet.gems, railMiles: src.wallet.railMiles };
  // Station upgrades are per route: the finished route keeps its own (for coming back); the new one starts bare.
  data.station.owned = { ...src.station.owned, [nextRouteId]: [] };
  data.station.critic = { ...src.station.critic };
  data.route.id = nextRouteId;
  return { data, kept: { gems: data.wallet.gems, railMiles: data.wallet.railMiles, conductor: { ...data.conductor } }, cashLeft: src.wallet.cash };
}
