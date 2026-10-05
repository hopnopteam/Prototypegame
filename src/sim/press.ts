import type { AwardDef, Rival } from '../config/press';

/** Fills {tokens} in a headline template; unknown tokens are left out rather than shown raw. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : ''));
}

export interface LeagueStanding {
  /** 1 = top of the league. */
  rank: number;
  total: number;
  /** The next rival to overtake, or null at number one. */
  next: Rival | null;
}

/** Where a train with this reputation sits among the rivals (you pass a rival by matching their score). */
export function leagueStanding(reputation: number, rivals: Rival[]): LeagueStanding {
  const ahead = rivals.filter((r) => r.reputation > reputation);
  const next = ahead.length > 0 ? ahead.reduce((a, b) => (b.reputation < a.reputation ? b : a)) : null;
  return { rank: ahead.length + 1, total: rivals.length + 1, next };
}

export interface RaceProgress {
  /** The rival you are chasing, or null at number one. */
  next: Rival | null;
  /** Reputation where this leg of the race began (the rival below, or 0) and where it ends (the rival's). */
  from: number;
  to: number;
  /** Share of this leg covered, 0–1 (1 at number one). */
  fraction: number;
  rank: number;
}

/** How far along the race to the next rival you are: the ring on the HUD's rival chip. */
export function raceProgress(reputation: number, rivals: Rival[]): RaceProgress {
  const standing = leagueStanding(reputation, rivals);
  const next = standing.next;
  if (!next) return { next: null, from: reputation, to: reputation, fraction: 1, rank: standing.rank };
  const below = rivals.filter((r) => r.reputation <= reputation).reduce((a, r) => Math.max(a, r.reputation), 0);
  const span = Math.max(1, next.reputation - below);
  return { next, from: below, to: next.reputation, fraction: Math.max(0, Math.min(1, (reputation - below) / span)), rank: standing.rank };
}

/** Rivals passed while reputation went from `before` to `after`, in the order they were passed. */
export function rivalsPassed(before: number, after: number, rivals: Rival[]): Rival[] {
  return rivals.filter((r) => r.reputation > before && r.reputation <= after).sort((a, b) => a.reputation - b.reputation);
}

export interface PressStats {
  guests: number;
  perfectStops: number;
  requests: number;
}

/** How far along an award is: `have` of `need` (need 0 means it is judged on something else). */
export function awardProgress(award: AwardDef, stats: PressStats, rank: number): { have: number; need: number; won: boolean } {
  switch (award.stat) {
    case 'always':
      return { have: 1, need: 1, won: true };
    case 'rankOne':
      return { have: rank === 1 ? 1 : 0, need: 1, won: rank === 1 };
    case 'perfectStops':
      return { have: stats.perfectStops, need: award.target, won: stats.perfectStops >= award.target };
    case 'requests':
      return { have: stats.requests, need: award.target, won: stats.requests >= award.target };
    case 'guests':
      return { have: stats.guests, need: award.target, won: stats.guests >= award.target };
  }
}

/** Trims a typed train name to something that fits on a nameplate; empty falls back to the default. */
export function cleanTrainName(raw: string, max: number, fallback: string): string {
  const name = raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return name.length > 0 ? name : fallback;
}
