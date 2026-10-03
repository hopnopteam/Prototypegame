import { PRODUCTS, type ProductDef } from '../config/content';
import type { IconName } from '../ui/icons';
import { EVENTS } from '../services/analytics';
import type { InterstitialVerdict } from '../sim/AdPolicy';
import type { World } from './World';

export type OfferId = 'cashStash' | 'holdTheTrain' | 'speedBoost' | 'doubleFares' | 'tempPorter' | 'supplyDelivery';

const OFFER_PRIORITY: OfferId[] = ['holdTheTrain', 'cashStash', 'tempPorter', 'supplyDelivery', 'doubleFares', 'speedBoost'];

export interface OfferView {
  id: OfferId;
  icon: IconName;
  label: string;
  detail: string;
  gemCost: number;
}

export interface MonetizationHooks {
  /** Pause gameplay and audio while an ad covers the screen. */
  setAdPlaying(playing: boolean): void;
  showFirstClassOffer(discounted: boolean, price: string, onBuy: () => void, onClose: () => void): void;
}

/** Offers that wait politely (they are not tied to a moment that is about to pass). */
const SOFT_OFFERS: OfferId[] = ['cashStash', 'speedBoost', 'supplyDelivery'];
/** A soft offer stays at least this long once it shows. */
const OFFER_MIN_SECONDS = 10;
/** After the slot empties, this long before a soft offer fills it again. */
const OFFER_REST_SECONDS = 12;

/**
 * Humane hybrid monetization (§12). Rewarded offers appear at the moment of shortage and can always be paid
 * with gems instead. The single forced ad slot is the Departing phase, and AdPolicy decides whether it fires.
 * Purchases grant account-wide.
 */
export class Monetization {
  offers: OfferView[] = [];
  lastVerdict: InterstitialVerdict | 'none' = 'none';
  private readonly shown = new Set<OfferId>();
  private busy = false;
  private offerCheckTimer = 0;
  /** Seconds of play, for the offer slot's pacing (see `steady`). */
  private offerClock = 0;
  private topSince = 0;
  private slotFreedAt = -Infinity;
  private firstClassPending = false;
  private sessionOffered = false;

  constructor(private readonly w: World, private readonly hooks: MonetizationHooks) {
    w.events.on('journey.phase', ({ phase }) => {
      if (phase === 'departing') this.onDeparting();
    });
    w.events.on('station.result', () => {
      // A station result is a natural break: the only moment (besides session start) for the ticket offer.
      if (this.canOfferFirstClass()) w.tweens.delay(4.5, () => this.offerFirstClass('station_break'));
    });
    w.events.on('carriage.coupled', () => w.setFlag('firstCarriageCoupled'));
  }

  get noForcedAds(): boolean {
    return this.w.iap.isOwned('first_class_ticket');
  }

  /** Which stop a rewarded ad "belongs to" for the no-interstitial-after-rewarded rule. */
  private stopContext(): number | null {
    const j = this.w.journey;
    if (j.phase === 'arriving') return j.stopSerial + 1;
    if (j.phase === 'stationStop' || j.phase === 'departing') return j.stopSerial;
    return null;
  }

  update(dt: number): void {
    this.offerClock += dt;
    this.offerCheckTimer -= dt;
    if (this.offerCheckTimer > 0) return;
    this.offerCheckTimer = 0.3;
    const next = this.steady(this.computeOffers());
    // Only the first offer is on screen (one bottom slot), so only it counts as shown.
    for (const offer of next.slice(0, 1)) {
      if (!this.shown.has(offer.id)) {
        this.shown.add(offer.id);
        this.w.analytics.log(EVENTS.rewardedOfferShown, { placement: offer.id });
      }
    }
    for (const id of [...this.shown]) if (next[0]?.id !== id) this.shown.delete(id);
    this.offers = next;
  }

  /**
   * A calm offer slot (session 15): a soft offer (a cash stash, roller skates) stays at least
   * OFFER_MIN_SECONDS once shown, and the slot rests OFFER_REST_SECONDS after one goes before another comes
   * (it used to pop in and out every few seconds as cash rose and fell). Time-bound offers (hold the train,
   * a porter for this stop) come and go with their moment.
   */
  private steady(next: OfferView[]): OfferView[] {
    const top = this.offers[0] ?? null;
    const soft = (o: OfferView | null): boolean => !!o && SOFT_OFFERS.includes(o.id);
    if (top && soft(top) && next[0]?.id !== top.id && this.offerClock - this.topSince < OFFER_MIN_SECONDS) {
      return [top, ...next.filter((o) => o.id !== top.id)];
    }
    if (!top && next[0] && soft(next[0]) && this.offerClock - this.slotFreedAt < OFFER_REST_SECONDS) return [];
    if (next[0]?.id !== top?.id) {
      if (next[0]) this.topSince = this.offerClock;
      else this.slotFreedAt = this.offerClock;
    }
    return next;
  }

  private computeOffers(): OfferView[] {
    const w = this.w;
    const r = w.econ.rewarded;
    const m = w.data.monetization;
    const life = w.lifetimeSeconds();
    if (!w.adPolicy.canOfferRewarded(life) || this.busy) return [];
    // The opening is for learning the loop (config: flow): no offer chip until the first carriage is on.
    if (!w.flow.allows('offers')) return [];
    const out: OfferView[] = [];
    const j = w.journey;

    if (w.tiles.shortOfCash > r.cashStash.shortWaitSeconds && (m.lastCashStashAt === null || life - m.lastCashStashAt > r.cashStash.cooldownSeconds)) {
      out.push({ id: 'cashStash', icon: 'cash', label: `+${this.cashStashAmount()}`, detail: 'Cash stash', gemCost: r.cashStash.gemCost });
    }
    if (j.phase === 'stationStop' && !j.holdUsed && j.timeLeft <= w.econ.journey.lastCallSeconds && (w.guests.platformGuests().length > 0 || w.station.luggagePile > 0)) {
      out.push({ id: 'holdTheTrain', icon: 'hold', label: `+${w.econ.journey.holdTheTrainSeconds}s`, detail: 'Hold the train', gemCost: r.holdTheTrain.gemCost });
    }
    if (life > r.speedBoost.firstOfferMinutes * 60 && Date.now() > m.speedBoostUntil && (m.lastSpeedOfferAt === null || life - m.lastSpeedOfferAt > r.speedBoost.cooldownSeconds) && j.phase === 'onTheMove') {
      out.push({ id: 'speedBoost', icon: 'skate', label: '3:00', detail: 'Roller skates', gemCost: r.speedBoost.gemCost });
    }
    const toStop = j.distanceToStop;
    const nextStop = j.stopSerial + 1;
    if (j.phase === 'onTheMove' && toStop !== null && toStop < r.doubleFares.offerSecondsBeforeArrival * w.econ.journey.cruiseSpeed && nextStop % r.doubleFares.everyNthStation === 0 && m.doubleFaresStop !== nextStop && w.flag('firstStationDone')) {
      out.push({ id: 'doubleFares', icon: 'double', label: '', detail: 'Double fares at the next stop', gemCost: r.doubleFares.gemCost });
    }
    if ((j.phase === 'arriving' || (j.phase === 'stationStop' && j.time < 6)) && w.staff.count('porter') === 0 && !w.staff.members.some((s) => s.temporary) && w.flag('firstStationDone')) {
      out.push({ id: 'tempPorter', icon: 'person', label: '+1', detail: 'A porter for this stop', gemCost: r.tempPorter.gemCost });
    }
    if (w.train.hasSupplyCar() && w.data.facilities.supplyTowel <= 0 && w.data.facilities.supplyRoll <= 0 && w.train.bathrooms.some((b) => b.unlocked && !b.stocked)) {
      out.push({ id: 'supplyDelivery', icon: 'crate', label: '+', detail: 'Supply delivery', gemCost: r.supplyDelivery.gemCost });
    }
    // One bottom slot: the most time-critical, most relevant offer first.
    out.sort((a, b) => OFFER_PRIORITY.indexOf(a.id) - OFFER_PRIORITY.indexOf(b.id));
    return out;
  }

  cashStashAmount(): number {
    const r = this.w.econ.rewarded.cashStash;
    const target = this.w.tiles.shortTileRemaining || this.w.tiles.cheapest()?.def.price || 0;
    return Math.max(r.minAmount, Math.round(target * r.fractionOfTarget));
  }

  /** Accept an offer by watching a rewarded ad, or by paying gems. */
  async accept(id: OfferId, payWithGems: boolean): Promise<boolean> {
    const offer = this.offers.find((o) => o.id === id);
    if (!offer) return false;
    return this.runRewarded(id, payWithGems, offer.gemCost, () => this.grant(id));
  }

  /** Shared path for every rewarded placement (offers, level-up ×2, offline ×2, login ×2). */
  async runRewarded(placement: string, payWithGems: boolean, gemCost: number, grant: () => void): Promise<boolean> {
    const w = this.w;
    if (this.busy) return false;
    w.analytics.log(EVENTS.rewardedOfferAccepted, { placement, method: payWithGems ? 'gems' : 'ad' });
    if (payWithGems) {
      if (!w.wallet.trySpend('gems', gemCost, `rewarded:${placement}`)) {
        w.ui.toast('Not enough gems', 'gem');
        return false;
      }
      grant();
      w.analytics.log(EVENTS.rewardedOfferCompleted, { placement, method: 'gems' });
      return true;
    }
    this.busy = true;
    this.hooks.setAdPlaying(true);
    const result = await w.ads.showRewarded(placement);
    this.hooks.setAdPlaying(false);
    this.busy = false;
    if (result === 'completed') {
      const stop = this.stopContext();
      if (stop !== null) {
        w.adPolicy.recordRewarded(stop);
        w.data.monetization.lastRewardedStop = stop;
      }
      w.data.monetization.rewardedCompleted++;
      w.save.markDirty();
      grant();
      w.analytics.log(EVENTS.rewardedOfferCompleted, { placement, method: 'ad' });
      return true;
    }
    if (result === 'notAvailable') w.ui.toast('No video right now. Try gems instead.', 'ad');
    return false;
  }

  private grant(id: OfferId): void {
    const w = this.w;
    const m = w.data.monetization;
    const life = w.lifetimeSeconds();
    switch (id) {
      case 'cashStash': {
        const amount = this.cashStashAmount();
        w.wallet.add('cash', amount, 'rewarded:cashStash');
        w.ui.floatText(`+${amount}`, w.player.pos.x, 2.4, w.player.pos.z, 'cash');
        w.particles.emit('cash', w.player.pos.x, 1.8, w.player.pos.z, 24, 0.4);
        w.audio.play('cash');
        m.lastCashStashAt = life;
        break;
      }
      case 'holdTheTrain':
        if (w.journey.holdTrain()) {
          w.ui.toast(`+${w.econ.journey.holdTheTrainSeconds}s`, 'hold');
          w.audio.play('whistleShort');
        }
        break;
      case 'speedBoost':
        m.speedBoostUntil = Date.now() + w.econ.rewarded.speedBoost.durationSeconds * 1000;
        m.lastSpeedOfferAt = life;
        w.events.emit('boost.changed', {});
        break;
      case 'doubleFares':
        m.doubleFaresStop = w.journey.stopSerial + 1;
        w.ui.toast('×2', 'double');
        break;
      case 'tempPorter':
        w.staff.hireTemporaryPorter();
        w.ui.toast('+1', 'person');
        break;
      case 'supplyDelivery': {
        const max = w.econ.facilities.supplyShelfMax;
        w.data.facilities.supplyTowel = max;
        w.data.facilities.supplyRoll = max;
        w.ui.toast('+', 'crate');
        break;
      }
    }
    w.save.markDirty();
  }

  // ─── The one forced ad slot ─────────────────────────────────────────────────

  private async onDeparting(): Promise<void> {
    const w = this.w;
    const verdict = w.adPolicy.checkInterstitial({
      phase: w.journey.phase,
      lifetimeSeconds: w.lifetimeSeconds(),
      stopSerial: w.journey.stopSerial,
      midTask: w.zones.playerWorking || !w.player.stack.isEmpty,
      noForcedAds: this.noForcedAds,
    });
    this.lastVerdict = verdict;
    if (verdict !== 'ok' || !w.ads.isInterstitialReady('departing')) return;
    w.adPolicy.recordInterstitial(w.lifetimeSeconds(), w.journey.stopSerial);
    const m = w.data.monetization;
    m.lastInterstitialAt = w.adPolicy.history.lastInterstitialAt;
    m.lastInterstitialStop = w.adPolicy.history.lastInterstitialStop;
    m.interstitialsShown++;
    w.save.markDirty();
    w.analytics.log(EVENTS.interstitialShown, { placement: 'departing', session_minute: Math.floor(w.time / 60) });
    this.hooks.setAdPlaying(true);
    await w.ads.showInterstitial('departing');
    this.hooks.setAdPlaying(false);
  }

  // ─── Purchases ──────────────────────────────────────────────────────────────

  canOfferFirstClass(): boolean {
    const w = this.w;
    return !this.noForcedAds && !this.firstClassPending && w.flag('firstCarriageCoupled') && w.lifetimeSeconds() >= w.econ.offers.firstClassMinLifetimeMinutes * 60;
  }

  /** Session start is the other natural moment for the ticket offer (after the first milestone). */
  offerAtSessionStart(): void {
    if (this.sessionOffered || !this.canOfferFirstClass()) return;
    const m = this.w.data.monetization;
    if (m.lastFirstClassSession === this.w.data.profile.sessionCount) return;
    this.w.tweens.delay(this.w.econ.offers.firstClassSessionCooldownSeconds, () => this.offerFirstClass('session_start'));
  }

  private offerFirstClass(trigger: string): void {
    const w = this.w;
    // Never interrupt a task with an offer.
    if (!this.canOfferFirstClass() || w.zones.playerWorking || !w.player.stack.isEmpty || w.journey.phase === 'stationStop') return;
    const m = w.data.monetization;
    if (m.lastFirstClassSession === w.data.profile.sessionCount && trigger === 'station_break' && m.firstClassOffers > 0) return;
    this.firstClassPending = true;
    this.sessionOffered = true;
    m.firstClassOffers++;
    m.lastFirstClassSession = w.data.profile.sessionCount;
    const discounted = m.firstClassIgnored >= w.econ.offers.firstClassDiscountAfterIgnores;
    const price = w.iap.priceLabel('first_class_ticket', discounted);
    w.analytics.log(EVENTS.iapOfferShown, { product: 'first_class_ticket', trigger, discounted });
    w.save.markDirty();
    this.hooks.showFirstClassOffer(discounted, price, () => {
      this.firstClassPending = false;
      void this.purchase('first_class_ticket', discounted);
    }, () => {
      this.firstClassPending = false;
      m.firstClassIgnored++;
      w.save.markDirty();
    });
  }

  async purchase(productId: string, discounted = false): Promise<boolean> {
    const w = this.w;
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return false;
    this.hooks.setAdPlaying(true);
    const result = await w.iap.purchase(productId, discounted);
    this.hooks.setAdPlaying(false);
    if (result !== 'success') {
      if (result === 'alreadyOwned') w.ui.toast('Already yours', 'check');
      else if (result === 'failed') w.ui.toast('Purchase failed. You were not charged.', 'bag');
      return false;
    }
    this.grantProduct(product);
    w.analytics.log(EVENTS.iapOfferPurchased, { product: productId, price: w.iap.priceLabel(productId, discounted) });
    return true;
  }

  private grantProduct(product: ProductDef): void {
    const w = this.w;
    if (product.grants.gems) w.wallet.add('gems', product.grants.gems, `iap:${product.id}`);
    if (product.grants.railMiles) w.wallet.add('railMiles', product.grants.railMiles, `iap:${product.id}`);
    w.audio.play('fanfare');
    w.particles.emit('confetti', w.player.pos.x, 2.5, w.player.pos.z, 50, 1);
    w.ui.celebrate(product.name, product.kind === 'nonConsumable' ? 'Yours on every route, forever.' : product.description, product.grants.noForcedAds ? 'ticket' : product.grants.scooter ? 'skate' : 'gem');
    w.save.markDirty();
  }
}
