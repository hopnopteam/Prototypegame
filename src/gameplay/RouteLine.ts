import { ACTIVE_ROUTE, nextRoute, type RouteDef } from '../config/routes';
import { FLOOR_Y } from '../world/CarriageView';
import { carryOver } from '../sim/carryOver';
import { log } from '../core/log';
import { DEBUG_JUMP, setDebugJumpQuietly } from '../config/debugJump';
import type { Game } from './Game';
import { TRANSITIONS, type LineTransitionDef } from '../config/lineTransition';
import { arrivalOnBoot, markArrival } from '../sim/lineTransition';
import { PREVIEW_KEY } from './LineTransition';
import { buildTease, disposeSet } from '../world/TransitionSet';

/**
 * `?sim=1` (the pacing simulator): the Grand Departure's fast path. The grand station is its old confetti and front page,
 * and boarding goes straight into the dark: the simulator never waits on a cinematic (Route 1 stays byte-identical).
 */
const FAST_PATH = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sim') === '1';
/** `?transition=play` (or `=winter` for Route 3's placeholder): plays the line transition once the game is up, touching no progress. */
const TRANSITION_PARAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('transition') : null;

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
  /** The Grand Departure's tease is up (the portal in the scenery, the posters). */
  private teasing = false;

  constructor(private readonly w: Game) {}

  init(): void {
    const w = this.w;
    w.events.on('level.up', () => { this.check(); this.updateTease(); });
    w.events.on('carriage.coupled', () => { this.check(); this.updateTease(); });
    w.events.on('journey.phase', ({ phase, previous }) => {
      if (phase === 'stationStop' && previous === 'arriving' && this.complete && !this.grandShown && !w.station.prologue) this.grandIn = GRAND_PAGE_DELAY;
    });
    this.check();
    this.updateTease();
  }

  /** This route's way out (config/lineTransition.ts), or null at the end of the line. */
  get transition(): LineTransitionDef | null {
    return ACTIVE_ROUTE.transition ?? null;
  }

  /**
   * Step 1, the tease: from the route's tease level or carriage count (whichever comes first) the next line's tunnel
   * portal sometimes scrolls past in the scenery, and the station posters say it is coming. Visual only.
   */
  private updateTease(): void {
    const w = this.w;
    const def = this.transition;
    if (!def || !this.next || this.teasing) return;
    if (w.progression.level < def.tease.fromLevel && w.train.count < def.tease.fromCarriages) return;
    this.teasing = true;
    w.scenery.setTease(buildTease(def), def.tease.everyLaps);
    w.station.view.setComingSoon(def.tease.poster);
    log.info('Route', `tease up: ${def.tease.sign}`);
  }

  get teaseUp(): boolean {
    return this.teasing;
  }

  update(dt: number): void {
    if (this.grandIn < 0) return;
    // A Debug preview of the line transition may be on screen: the grand station waits for it.
    if (this.w.lineTransition.running) return;
    // Nor does it start under a card (the last level's card can still be up as the train pulls in). Not on the fast
    // path, so the pacing simulator stays byte-identical.
    if (!FAST_PATH && this.w.ui.sheetOpen) return;
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
    // Step 2 (the Grand Departure): the hero shot over the finished train, then the front page.
    if (!FAST_PATH && this.transition) {
      w.lineTransition.hero(() => this.frontPage());
      return;
    }
    const p = w.player.pos;
    w.particles.emit('confetti', p.x, FLOOR_Y + 2.6, p.z, 90, 1.6);
    w.particles.emit('star', p.x, FLOOR_Y + 1.6, p.z, 30, 0.8);
    w.audio.play('ceremony');
    w.haptics.success();
    this.frontPage();
  }

  /** The grand station's front page ("Countryside Express Restored!"), then the offer. */
  private frontPage(): void {
    const w = this.w;
    if (!this.next) return;
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
    const t = this.transition;
    w.ui.showNextLine({ from: ACTIVE_ROUTE.name, to: next.name, unbought: this.unbought(), conductor: { ...w.data.conductor }, gems: w.wallet.get('gems'), railMiles: w.wallet.get('railMiles'), ticket: t ? t.ticket : undefined }, () => this.open());
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
    // The Grand Departure: the save that carries the player over also marks the arrival as waiting, so a relaunch at any
    // moment after it plays (or skips) the arrival and pays the chest once (sim/lineTransition.ts).
    markArrival(result.data, ACTIVE_ROUTE.id, next.id);
    log.info('Route', `opening ${next.name}: kept ${result.kept.gems} gems, ${result.kept.railMiles} Rail Miles; ${unbought} upgrades and ${Math.floor(result.cashLeft)} cash stay behind`);
    const dark = (): void => {
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
    };
    // Steps 4 to 6: the lever, the depot, the run into the tunnel; the save is written in its dark.
    if (!FAST_PATH && this.transition) w.lineTransition.depart(dark);
    else w.ui.tunnelIn(next.name, dark);
  }

  /**
   * At boot: an arrival the save says is waiting (the tunnel's write happened; the app may have been killed since), or
   * a Debug-sheet preview coming out of its tunnel. Returns true when the arrival started.
   */
  arriveOnBoot(): boolean {
    const w = this.w;
    let previewFrom: string | null = null;
    try {
      previewFrom = sessionStorage.getItem(PREVIEW_KEY);
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      previewFrom = null;
    }
    if (previewFrom && TRANSITIONS[previewFrom]) {
      w.lineTransition.arrive(TRANSITIONS[previewFrom], true);
      return true;
    }
    if (arrivalOnBoot(w.data, ACTIVE_ROUTE.id) !== 'arrival') return false;
    const from = w.data.lineArrival?.from ?? '';
    const def = TRANSITIONS[from];
    if (!def || FAST_PATH) {
      w.data.lineArrival = null;
      return false;
    }
    w.lineTransition.arrive(def, false);
    return true;
  }

  /**
   * The Debug sheet's "Play line transition" (and `?transition=play`): the whole sequence on this route, touching no
   * progress: the hero shot, the golden ticket, the lever, the depot, the tunnel, then a reload into the arrival on the
   * same route with nothing paid. `winter` plays the Riviera → Winter City placeholder's settings.
   */
  preview(defId = ACTIVE_ROUTE.id): void {
    const w = this.w;
    const def = TRANSITIONS[defId];
    if (!def || w.lineTransition.running) return;
    w.lineTransition.hero(() => {
      w.ui.showNextLine({ from: ACTIVE_ROUTE.name, to: def.toName, unbought: this.unbought(), conductor: { ...w.data.conductor }, gems: w.wallet.get('gems'), railMiles: w.wallet.get('railMiles'), ticket: def.ticket, preview: true }, () => {
        w.lineTransition.depart(() => {
          try {
            sessionStorage.setItem(PREVIEW_KEY, defId);
            sessionStorage.setItem(TUNNEL_KEY, ACTIVE_ROUTE.id);
          } catch {
            // No session storage: the preview simply ends in the dark.
          }
          w.save.saveNow();
          location.reload();
        }, def, true);
      });
    }, def, true);
  }

  /** `?transition=…` at boot. */
  startFromParam(): void {
    if (!TRANSITION_PARAM) return;
    const id = TRANSITION_PARAM === 'winter' ? 'riviera' : TRANSITION_PARAM === 'play' || TRANSITION_PARAM === '1' ? ACTIVE_ROUTE.id : TRANSITION_PARAM;
    // Strip the switch from the address so the reload in the tunnel does not start it again.
    try {
      const url = new URL(location.href);
      url.searchParams.delete('transition');
      history.replaceState(null, '', url.toString());
    } catch {
      // Without history the reload simply plays the preview's arrival as well.
    }
    this.preview(id);
  }

  /** Takes the tease away (tests and the Debug sheet). */
  clearTease(): void {
    const t = this.w.scenery.teaseShown;
    if (t) {
      this.w.scenery.setTease(null);
      disposeSet(t);
    }
    this.teasing = false;
  }
}
