import type { World } from './World';

/**
 * Phase 2, special stops and the critic (config: the route's `events` and `critic` in config/routes.ts). Filled in
 * below; the station asks it how a stop's bonus is scaled.
 */
export class StationEvents {
  constructor(private readonly w: World) {}

  onArrival(): void {}
  onDeparture(): void {}

  update(_dt: number): void {
    // Filled in with the events.
  }

  /** A ticket's fare multiplier for this traveller (the VIP pays many times over). */
  fareScale(_guest: unknown): number {
    return 1;
  }

  /** The stop bonus's multiplier from the stop's event (Rush Hour pays big). */
  bonusScale(): number {
    void this.w;
    return 1;
  }
}
