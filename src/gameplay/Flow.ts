import type { Economy, FlowGate } from '../config/economy';
import type { World } from './World';

export type FeatureId = keyof Economy['flow']['features'];

/**
 * The flow (session 16, owner: "we need a FLOW, a flow that is there to introduce and actually makes sense
 * gameplay wise"): one place that says what is in play yet. The opening sells one thing at a time in a set
 * order (a second cabin, a third, the attendant once you have tidied a room yourself, the repairs, then the
 * new carriage); every later feature joins when the ride reaches it (config: economy `flow`).
 */
export class Flow {
  constructor(private readonly w: World) {}

  /** True while the opening runs: until its last purchase (the first coupling) is made. */
  get opening(): boolean {
    return this.openingTile() !== null;
  }

  /** The opening's next purchase (the only regular tile on show meanwhile), or null once it is over. */
  openingTile(): string | null {
    for (const id of this.w.econ.flow.openingTiles) if (!this.w.unlocks.isUnlocked(id)) return id;
    return null;
  }

  /** Has the ride reached this feature yet? */
  allows(feature: FeatureId): boolean {
    return this.passes(this.w.econ.flow.features[feature]);
  }

  private passes(gate: FlowGate): boolean {
    const w = this.w;
    if (gate.stops !== undefined && w.data.route.stopsCompleted < gate.stops) return false;
    if (gate.carriages !== undefined && w.train.count < gate.carriages) return false;
    if (gate.seconds !== undefined && w.lifetimeSeconds() < gate.seconds) return false;
    if (gate.level !== undefined && w.progression.level < gate.level) return false;
    return true;
  }
}
