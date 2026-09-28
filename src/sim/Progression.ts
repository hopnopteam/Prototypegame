export interface ProgressionConfig {
  levelThresholds: number[];
  levelRailMiles: number[];
  levelCash: number[];
  unlockLevels: Record<string, number>;
}

export interface ProgressionState {
  stars: number;
  level: number;
}

/**
 * Route level star bar (§9, the "session" clock). Every unlock, request and clean stop adds stars; a full
 * bar levels the route. Stars keep counting at max level so nothing a player does is ever wasted.
 */
export class Progression {
  constructor(private readonly config: ProgressionConfig, private readonly state: ProgressionState) {}

  get stars(): number {
    return this.state.stars;
  }

  get level(): number {
    return this.state.level;
  }

  get maxLevel(): number {
    return this.config.levelThresholds.length;
  }

  get isMaxLevel(): boolean {
    return this.state.level >= this.maxLevel;
  }

  /** Adds stars and returns every level newly reached (usually zero or one). */
  addStars(amount: number): number[] {
    if (!(amount > 0)) return [];
    this.state.stars += amount;
    const reached: number[] = [];
    while (!this.isMaxLevel && this.state.stars >= this.config.levelThresholds[this.state.level]) {
      this.state.level++;
      reached.push(this.state.level);
    }
    return reached;
  }

  /** Progress within the current level, for the star bar. */
  levelProgress(): { current: number; needed: number; fraction: number } {
    if (this.isMaxLevel) return { current: 1, needed: 1, fraction: 1 };
    const floor = this.config.levelThresholds[this.state.level - 1];
    const ceiling = this.config.levelThresholds[this.state.level];
    const current = this.state.stars - floor;
    const needed = ceiling - floor;
    return { current, needed, fraction: Math.min(1, current / needed) };
  }

  rewardFor(level: number): { railMiles: number; cash: number } {
    const i = Math.min(level - 1, this.config.levelRailMiles.length - 1);
    return { railMiles: this.config.levelRailMiles[i] ?? 0, cash: this.config.levelCash[i] ?? 0 };
  }

  isFeatureUnlocked(feature: string): boolean {
    const needed = this.config.unlockLevels[feature];
    return needed === undefined || this.state.level >= needed;
  }
}
