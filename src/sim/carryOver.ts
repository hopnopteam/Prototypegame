import { createDefaultSave, type RouteArchive, type SaveData } from '../save/SaveData';

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
export function carryOver(from: SaveData, nextRouteId: string, now: number, unbought = 0): CarryOverResult {
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
  // Phase 4: the finished route is kept as it was (the route map shows its final stats), and marked completed.
  const done = src.route.id;
  const earlier = Object.values(src.routes ?? {}).filter((a) => a.route.id !== done);
  const sum = (pick: (a: RouteArchive) => number): number => earlier.reduce((total, a) => total + pick(a), 0);
  data.routes = {
    ...(src.routes ?? {}),
    [done]: {
      route: src.route,
      staff: src.staff,
      facilities: src.facilities,
      stationOwned: src.station.owned[done] ?? [],
      critic: src.station.critic[done] ?? null,
      leftAt: now,
      cashLeft: src.wallet.cash,
      unbought,
      stats: {
        guests: Math.max(0, src.press.stats.guests - sum((a) => a.stats.guests)),
        perfectStops: Math.max(0, src.press.stats.perfectStops - sum((a) => a.stats.perfectStops)),
        minutes: Math.round((src.route.playSeconds ?? 0) / 60),
      },
    },
  };
  data.completedRoutes = [...new Set([...(src.completedRoutes ?? []), done])];
  // Help is earned again on the new route: the hand work counted toward its hires starts from nothing.
  data.profile.handWork = {};
  data.profile.staffWork = {};
  return { data, kept: { gems: data.wallet.gems, railMiles: data.wallet.railMiles, conductor: { ...data.conductor } }, cashLeft: src.wallet.cash };
}
