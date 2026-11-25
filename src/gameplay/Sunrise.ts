import { FABLE, FABLE_PLAY } from '../config/fable';
import { CLASS_BY_ID } from '../config/classes';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/**
 * The Fable Experiment, sunrise tips (config/fable.ts): once a ride, as its morning starts and the sun comes up, every
 * sleeper who went to bed content (nothing asked for and never got, not kept waiting on the platform) shows a heart and
 * leaves a little extra, paid to the conductor in one burst. The evening's service pays off in view at dawn, and the
 * quiet night ends on a beat.
 */
export class Sunrise {
  /** Whether this ride's sunrise has been paid. */
  private done = false;
  /** What the last sunrise paid, and for how many sleepers (for scripts and the debug overlay). */
  last = { guests: 0, amount: 0 };

  constructor(private readonly w: World) {}

  update(): void {
    if (!FABLE) return;
    const w = this.w;
    const j = w.journey;
    if (j.phase !== 'onTheMove') {
      this.done = false;
      return;
    }
    if (this.done || j.travelShare < w.econ.trip.morningStart || w.coach?.tutorial) return;
    this.done = true;
    const rule = FABLE_PLAY.sunrise;
    let guests = 0;
    let amount = 0;
    for (const g of w.guests.list) {
      if (!g.aboard || g.dayRider || g.unmet > 0 || g.grumpy || g.trip === 'evening') continue;
      guests++;
      amount += Math.round(rule.perGuest * CLASS_BY_ID[g.cls].tip);
      w.ui.reaction('heart', g.pos.x, FLOOR_Y + 1.6, g.pos.z, 'good');
    }
    this.last = { guests, amount };
    if (guests < rule.minGuests || amount <= 0) return;
    const p = w.player.pos;
    w.cash.payDirect(amount, p.x, p.z, 'sunrise');
    w.particles.emit('sparkle', p.x, FLOOR_Y + 1.4, p.z, 14, 0.5);
    w.audio.play('chime');
    w.ui.toast(`${guests} slept well`, 'star');
  }
}
