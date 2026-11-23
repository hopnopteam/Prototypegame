import { ACTIVE_ROUTE, nextRoute, type RouteDef } from '../config/routes';
import { FLOOR_Y } from '../world/CarriageView';
import { carryOver } from '../sim/carryOver';
import { log } from '../core/log';
import { DEBUG_JUMP, setDebugJumpQuietly } from '../config/debugJump';
import type { Game } from './Game';

/** Where the loading screen learns it is the far end of a tunnel (Phase 4: the move to the next route). */
export const TUNNEL_KEY = 'nightexpress.tunnel';
/** Seconds after the doors open at the grand station before its front page (the banner and the cheer first). */
const GRAND_PAGE_DELAY = 3.2;

/**
 * Phase 4, moving along the line. A route is complete once its train has every carriage and the route is at its last
 * level (owner: the lighter trigger, "all 8 carriages plus Level 8"). The next station is then the route's grand
 * station: a cheer, confetti and a front page ("Countryside Express Restored! Next stop: the Riviera"), and the offer to
 * open the next line. Moving on is the player's choice (owner: "players choose when to press it"): the offer can wait,
 * and a button in the right rail brings it back. Before they go, it says how many upgrades are left unbought (they
 * stay behind with the route's train). Opening plays the way into the tunnel, carries the save over to the next route
 * (Phase 3's `carryOver`) and loads again on it; the loading screen and the arrival play the way out.
 */
export class RouteLine {
  /** The next route, or null at the end of the line. */
  readonly next: RouteDef | null = nextRoute(ACTIVE_ROUTE.id);
  private grandIn = -1;
  private leaving = false;

  constructor(private readonly w: Game) {}

  init(): void {
    const w = this.w;
    w.events.on('level.up', () => this.check());
    w.events.on('carriage.coupled', () => this.check());
    w.events.on('journey.phase', ({ phase, previous }) => {
      if (phase === 'stationStop' && previous === 'arriving' && this.complete && !this.grandShown && !w.station.prologue) this.grandIn = GRAND_PAGE_DELAY;
    });
    this.check();
  }

  update(dt: number): void {
    if (this.grandIn < 0) return;
    this.grandIn -= dt;
    if (this.grandIn <= 0) {
      this.grandIn = -1;
      this.grandStation();
    }
  }

  /** Every carriage coupled and the route's last level reached. */
  get complete(): boolean {
    return this.w.train.count >= ACTIVE_ROUTE.maxCarriages && this.w.progression.isMaxLevel;
  }

  /** The grand station's front page has run (from then on the rail's button offers the next line). */
  get grandShown(): boolean {
    return this.w.flag(`grand_${ACTIVE_ROUTE.id}`);
  }

  /** The next line can be opened now. */
  get canOpen(): boolean {
    return this.next !== null && this.complete && this.grandShown && !this.leaving;
  }

  /** Upgrades on this route not bought yet (they stay behind with its train). */
  unbought(): number {
    const u = this.w.unlocks;
    return u.defs.filter((d) => !u.isUnlocked(d.id)).length;
  }

  private check(): void {
    const w = this.w;
    if (!this.complete || w.flag(`route_done_${ACTIVE_ROUTE.id}`)) return;
    w.setFlag(`route_done_${ACTIVE_ROUTE.id}`);
    w.analytics.log('route_complete', { route: ACTIVE_ROUTE.id, time: Math.round(w.data.route.playSeconds), unbought: this.unbought() });
    log.info('Route', `${ACTIVE_ROUTE.name} complete after ${Math.round(w.data.route.playSeconds / 60)} min; ${this.unbought()} upgrades unbought`);
  }

  /** The route's grand station: a cheer, the front page, then the offer to open the next line. */
  private grandStation(): void {
    const w = this.w;
    if (this.grandShown || !this.next) return;
    w.setFlag(`grand_${ACTIVE_ROUTE.id}`);
    const p = w.player.pos;
    w.particles.emit('confetti', p.x, FLOOR_Y + 2.6, p.z, 90, 1.6);
    w.particles.emit('star', p.x, FLOOR_Y + 1.6, p.z, 30, 0.8);
    w.audio.play('ceremony');
    w.haptics.success();
    const item = w.press.edition('routeComplete', {
      route: ACTIVE_ROUTE.name,
      next: this.next.name.replace(/ (Coast )?Line$/, ''),
      nextName: this.next.name,
      station: w.station.currentStation().name,
    });
    w.press.frontPageNow(item, () => this.offer());
  }

  /** The offer to open the next line (the rail's button brings it back while the player stays). */
  offer(): void {
    const w = this.w;
    const next = this.next;
    if (!next || !this.complete) return;
    w.ui.showNextLine({ from: ACTIVE_ROUTE.name, to: next.name, unbought: this.unbought(), conductor: { ...w.data.conductor }, gems: w.wallet.get('gems'), railMiles: w.wallet.get('railMiles') }, () => this.open());
  }

  /** Into the tunnel: the save carries over to the next route, and the game loads again on it. */
  open(): void {
    const w = this.w;
    const next = this.next;
    if (!next || this.leaving) return;
    this.leaving = true;
    const unbought = this.unbought();
    w.analytics.log('route_leave', { route: ACTIVE_ROUTE.id, unbought, time: Math.round(w.data.route.playSeconds) });
    w.analytics.log('route_unlock', { route: next.id, time: Math.round(w.lifetimeSeconds()) });
    const result = carryOver(w.data, next.id, Date.now(), unbought);
    log.info('Route', `opening ${next.name}: kept ${result.kept.gems} gems, ${result.kept.railMiles} Rail Miles; ${unbought} upgrades and ${Math.floor(result.cashLeft)} cash stay behind`);
    w.ui.tunnelIn(next.name, () => {
      try {
        sessionStorage.setItem(TUNNEL_KEY, next.id);
      } catch {
        // No session storage: the far end simply opens with the ordinary loading screen.
      }
      // The old route's floor cash stays behind with it.
      w.save.beforeWrite = null;
      w.save.data = result.data;
      w.save.saveNow();
      // From a Debug-sheet jump, the jump's save now holds the new line: load it as it is (not rebuilt as a jump).
      if (DEBUG_JUMP) setDebugJumpQuietly({ carriages: 0, tier: 0, staffed: false, route: next.id });
      // Closes the GameAnalytics session cleanly (it sends what is waiting) before the page goes.
      w.toBackground();
      location.reload();
    });
  }
}
