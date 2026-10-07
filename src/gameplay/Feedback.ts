import { REACTIONS, type ChatterSituation, type Reaction } from '../config/chatter';
import { FLOOR_Y } from '../world/CarriageView';
import type { Guest } from './Guests';
import type { World } from './World';

const SPEECH_HEIGHT = 2.1;
const FLOAT_HEIGHT = 2.35;
const THINK_SECONDS = 0.5;
/** The desk bell rings again at most this often while a guest still waits. */
const BELL_REPEAT_SECONDS = 20;

/**
 * How the train is doing, as the passengers see it. Two jobs:
 *
 * 1. Soft failure cues (from route level 2, once the basics are learnt): a passenger who missed the train, a
 *    request left waiting, an empty washroom or a guest stood at the desk each get noticed with a grey note,
 *    a small sound and a grumble. Nothing is ever lost for good (§5); the point is to show what to improve.
 * 2. Chatter: now and then a passenger says one short line about the carriage they are in, the service
 *    lately, the train's reputation or a review as they leave. A rolling service mood colours what they say.
 */
export class Feedback {
  /** 0 grumpy … 1 delighted: recent service, as passengers have heard it. */
  mood: number;
  private sinceChatter = 99;
  private readonly lastSaid = new Map<ChatterSituation, number>();
  private thinkTimer = 0;
  private deskWait = 0;
  private bellTimer = 0;
  private noWashroomTimer = 0;

  constructor(private readonly w: World) {
    this.mood = w.econ.feedback.mood.start;
  }

  /** Critical cues and lines wait until the player knows the ropes. */
  get cuesOn(): boolean {
    const f = this.w.econ.feedback;
    return this.w.progression.level >= f.cuesFromLevel || this.w.data.route.stopsCompleted >= f.cuesFromStop;
  }

  init(): void {
    const w = this.w;
    w.events.on('station.result', (r) => {
      if (r.clean) this.nudge(w.econ.feedback.mood.perfectStop);
    });
    w.events.on('rush.bonus', () => {
      const guest = this.nearestGuest();
      if (guest) this.maybeSay('rush', guest);
    });
  }

  update(dt: number): void {
    const w = this.w;
    const f = w.econ.feedback;
    this.sinceChatter += dt;
    this.bellTimer -= dt;
    // The mood drifts back to neutral: one bad stop is forgotten, a bad habit is not.
    const drift = (f.mood.driftPerMinute / 60) * dt;
    this.mood += Math.max(-drift, Math.min(drift, f.mood.rest - this.mood));

    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    const step = THINK_SECONDS - this.thinkTimer;
    this.thinkTimer = THINK_SECONDS;
    if (this.cuesOn) {
      this.checkSlowRequests();
      this.checkDesk(step);
    }
    this.checkWashroomCar(step);
  }

  // ─── Hooks from Guests and Station ────────────────────────────────────────

  onCheckIn(guest: Guest): void {
    const w = this.w;
    const cabin = guest.cabin;
    if (!cabin) return;
    // What they notice first: word of mouth if it is strong, else the state of the carriage.
    const options: ChatterSituation[] = [];
    if (w.press.standing.rank === 1) options.push('boardFamous');
    if (this.mood >= 0.8) options.push('boardGoodBuzz');
    if (this.mood <= 0.35 && this.cuesOn) options.push('boardBadBuzz');
    const tier = w.train.tierOf(cabin.carriage);
    options.push(tier <= 0 ? 'boardRundown' : tier === 1 ? 'boardRepaired' : tier === 2 ? 'boardCosy' : 'boardLuxury');
    this.maybeSay(w.rng.pick(options), guest);
  }

  /** A request was answered after `elapsed` seconds. */
  onRequestServed(guest: Guest, elapsed: number, byPlayer: boolean): void {
    const w = this.w;
    const f = w.econ.feedback;
    if (elapsed <= w.econ.service.speedySeconds) {
      this.nudge(f.mood.fast);
      if (byPlayer) this.maybeSay('fastService', guest);
      return;
    }
    if (elapsed >= f.slowRequestSeconds && this.cuesOn) {
      this.nudge(f.mood.slow);
      w.ui.floatIcon('clock', guest.pos.x, FLOOR_Y + FLOAT_HEIGHT, guest.pos.z, 'miss');
      this.maybeSay('slowService', guest, 0.7);
      return;
    }
    if (w.rng.chance(w.econ.feedback.chatterChance)) this.say({ icon: guest.archetype.mood }, guest, false);
  }

  onAlight(guest: Guest): void {
    const good = this.mood >= 0.5 || !this.cuesOn;
    this.maybeSay(good ? 'reviewGood' : 'reviewBad', guest);
  }

  /** A guest found the washroom out of towels or rolls (once per visit). */
  onEmptyWashroom(guest: Guest, missing: 'towel' | 'roll'): void {
    if (!this.cuesOn) return;
    const w = this.w;
    this.nudge(w.econ.feedback.mood.emptyWashroom);
    w.audio.play('grumble');
    w.ui.floatIcon(missing === 'towel' ? 'towel' : 'roll', guest.pos.x, FLOOR_Y + FLOAT_HEIGHT, guest.pos.z, 'miss', true);
    this.maybeSay('emptyWashroom', guest, 0.8);
  }

  /**
   * The doors close: passengers who had a bed but were never boarded missed the train (a cue), those with
   * no bed were turned away (demand, never the player's fault, so only a line now and then).
   */
  onDeparture(missed: Guest[], noBed: Guest[]): void {
    const w = this.w;
    if (missed.length > 0 && this.cuesOn) {
      w.audio.play('aww');
      this.nudge(w.econ.feedback.mood.missed * Math.min(3, missed.length));
      for (const guest of missed) {
        guest.view.showBubble('clock', 'alert');
        w.ui.floatIcon('person', guest.pos.x, FLOOR_Y + FLOAT_HEIGHT, guest.pos.z, 'miss', true);
      }
      this.maybeSay('missedTrain', missed[0], 1);
    } else if (noBed.length > 0) {
      this.maybeSay('noBed', noBed[0], 0.5);
    }
  }

  // ─── Checks ──────────────────────────────────────────────────────────────

  /** A request waiting too long turns its bubble red and the guest grumbles, once per request. */
  private checkSlowRequests(): void {
    const w = this.w;
    const limit = w.econ.feedback.slowRequestSeconds;
    for (const guest of w.guests.openRequests()) {
      if (guest.slow || guest.request === 'bathroom' || w.time - guest.requestAt < limit) continue;
      guest.slow = true;
      w.audio.play('grumble');
      guest.view.bounce(0.6);
      this.maybeSay('waitingLong', guest, 0.6);
    }
  }

  /** A guest stood at the desk with a room ready and nobody coming rings the bell. */
  private checkDesk(step: number): void {
    const w = this.w;
    const waiting = w.guests.deskReady() && w.staff.count('porter') === 0;
    this.deskWait = waiting ? this.deskWait + step : 0;
    if (this.deskWait < w.econ.feedback.deskWaitSeconds || this.bellTimer > 0) return;
    this.bellTimer = BELL_REPEAT_SECONDS;
    w.audio.play('bell', { pitch: 0.9 });
    const guest = w.guests.deskGuest();
    if (guest) {
      guest.view.bounce(0.6);
      this.maybeSay('deskWaiting', guest, 0.8);
    }
  }

  /** Once guests expect it, a train with no washroom car gets asked about one now and then. */
  private checkWashroomCar(step: number): void {
    const w = this.w;
    if (w.train.count < 2 || w.train.indexOfType('bathroom') !== null) return;
    this.noWashroomTimer += step;
    if (this.noWashroomTimer < w.econ.feedback.noWashroomSeconds) return;
    const guest = w.guests.list.find((g) => g.inCabin && !g.request);
    if (guest && this.maybeSay('noWashroom', guest, 1)) this.noWashroomTimer = 0;
  }

  // ─── Speaking ────────────────────────────────────────────────────────────

  private nudge(amount: number): void {
    this.mood = Math.max(0, Math.min(1, this.mood + amount));
  }

  /** Says a line for the situation if nobody spoke just now and this remark has not been made lately. */
  private maybeSay(situation: ChatterSituation, guest: Guest, chance = this.w.econ.feedback.chatterChance): boolean {
    const w = this.w;
    const f = w.econ.feedback;
    if (this.sinceChatter < f.chatterGapSeconds) return false;
    const last = this.lastSaid.get(situation);
    if (last !== undefined && w.time - last < f.sameLineSeconds) return false;
    if (!w.rng.chance(chance)) return false;
    this.lastSaid.set(situation, w.time);
    return this.say(REACTIONS[situation], guest, isCritical(situation));
  }

  private say(reaction: Reaction, guest: Guest, critical: boolean): boolean {
    if (!guest.view.root.visible) return false;
    // Reactions are a later layer: the first leg belongs to the walkthrough (config: flow).
    if (!this.w.flow.allows('reactions')) return false;
    this.sinceChatter = 0;
    this.w.ui.reaction(reaction.icon, guest.pos.x, FLOOR_Y + SPEECH_HEIGHT, guest.pos.z, critical ? 'bad' : 'good', reaction.crossed);
    return true;
  }

  private nearestGuest(): Guest | null {
    const p = this.w.player.pos;
    let best: Guest | null = null;
    let bestDistance = 6;
    for (const g of this.w.guests.list) {
      if (!g.aboard) continue;
      const d = Math.hypot(g.pos.x - p.x, g.pos.z - p.z);
      if (d < bestDistance) {
        best = g;
        bestDistance = d;
      }
    }
    return best;
  }
}

const CRITICAL: ChatterSituation[] = ['boardBadBuzz', 'slowService', 'waitingLong', 'deskWaiting', 'reviewBad', 'missedTrain', 'emptyWashroom', 'noWashroom', 'boardRundown'];
const isCritical = (s: ChatterSituation): boolean => CRITICAL.includes(s);
