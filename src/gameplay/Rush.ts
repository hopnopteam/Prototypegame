import type { Vec2 } from '../core/types';
import { FLOOR_Y } from '../world/CarriageView';
import type { World } from './World';

/**
 * Rush: every service the conductor does by hand (a check-in, a request, a cleaned cabin, a loaded bag)
 * within a few seconds of the last one adds to a streak, and milestones pay a cash bonus with a flourish.
 * It rewards playing briskly without punishing a pause: a lapsed streak simply starts again.
 */
export class Rush {
  streak = 0;
  /** Seconds left before the streak lapses. */
  timeLeft = 0;
  /** The streak count that last paid a bonus (the chip flashes on it). */
  lastMilestone = 0;

  constructor(private readonly w: World) {}

  init(): void {
    const e = this.w.events;
    e.on('guest.checkedIn', ({ byPlayer, x, z }) => byPlayer && this.service({ x, z }));
    e.on('guest.keyed', ({ byPlayer, x, z }) => byPlayer && this.service({ x, z }));
    e.on('request.fulfilled', ({ byPlayer, x, z }) => byPlayer && this.service({ x, z }));
    e.on('cabin.cleaned', ({ byPlayer, x, z }) => byPlayer && this.service({ x, z }));
    e.on('shoes.shined', ({ byPlayer, x, z }) => byPlayer && this.service({ x, z }));
    e.on('luggage.loaded', ({ byPlayer }) => byPlayer && this.service(this.w.player.pos));
  }

  /** 0…1 of the window left (the chip's draining bar). */
  get fraction(): number {
    return this.streak > 0 ? this.timeLeft / this.w.econ.rush.window : 0;
  }

  update(dt: number): void {
    if (this.streak === 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.streak = 0;
      this.timeLeft = 0;
    }
  }

  private service(_at: Vec2): void {
    const w = this.w;
    // A later layer: streaks start counting once the basics are second nature (config: flow).
    if (!w.flow.allows('rush')) return;
    const rush = w.econ.rush;
    this.streak++;
    this.timeLeft = rush.window;
    if (this.streak < 2) return;
    w.audio.play('coin', { pitch: 1 + Math.min(1.2, this.streak * 0.08), volume: 0.3 });
    if (!rush.milestones.includes(this.streak) && !(this.streak > rush.milestones[rush.milestones.length - 1] && this.streak % 5 === 0)) return;
    const cash = Math.round(rush.cashPerStep * this.streak);
    this.lastMilestone = this.streak;
    const p = w.player.pos;
    // Paid straight into the wallet through the head counter (it rolls up over the conductor's head).
    w.wallet.add('cash', cash, 'rush');
    w.ui.cashCollected(cash);
    w.particles.emit('star', p.x, FLOOR_Y + 1.4, p.z, 10, 0.5);
    w.particles.emit('cash', p.x, FLOOR_Y + 1.4, p.z, 8, 0.3);
    w.audio.play('chest', { volume: 0.5 });
    w.haptics.light();
    w.stage.rig.punch(0.025);
    w.events.emit('rush.bonus', { streak: this.streak, cash });
  }
}
