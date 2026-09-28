import { PRODUCTS, type ProductDef } from '../config/content';
import type { IconName } from '../ui/icons';
import { EVENTS } from '../services/analytics';
import type { InterstitialVerdict } from '../sim/AdPolicy';
import type { World } from './World';

export type OfferId = 'cashStash' | 'holdTheTrain' | 'speedBoost' | 'doubleFares' | 'tempPorter' | 'supplyDelivery';

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
    this.offerCheckTimer -= dt;
    if (this.offerCheckTimer > 0) return;
    this.offerCheckTimer = 0.3;
    const next = this.computeOffers();
    for (const offer of next) {
      if (!this.shown.has(offer.id)) {
        this.shown.add(offer.id);
        this.w.analytics.log(EVENTS.rewardedOfferShown, { placement: offer.id });
      }
    }
    for (const id of [...this.shown]) if (!next.some((o) => o.id === id)) this.shown.delete(id);
    this.offers = next;
  }

  private computeOffers(): OfferView[] {
    const w = this.w;
    const r = w.econ.rewarded;
    const m = w.data.monetization;
    const life = w.lifetimeSeconds();
    if (!w.adPolicy.canOfferRewarded(life) || this.busy) return [];
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
      out.push({ id: 'doubleFares', icon: 'double', label: 'Next stop', detail: 'Double fares', gemCost: r.doubleFares.gemCost });
    }
    if ((j.phase === 'arriving' || (j.phase === 'stationStop' && j.time < 6)) && w.staff.count('porter') === 0 && !w.staff.members.some((s) => s.temporary) && w.flag('firstStationDone')) {
      out.push({ id: 'tempPorter', icon: 'person', label: 'This stop', detail: 'Temporary porter', gemCost: r.tempPorter.gemCost });
    }
    if (w.train.hasSupplyCar() && w.data.facilities.supplyTowel <= 0 && w.data.facilities.supplyRoll <= 0 && w.train.bathrooms.some((b) => b.unlocked && !b.stocked)) {
      out.push({ id: 'supplyDelivery', icon: 'crate', label: 'Refill', detail: 'Supply delivery', gemCost: r.supplyDelivery.gemCost });
    }
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
          w.ui.toast(`Holding the train: +${w.econ.journey.holdTheTrainSeconds}s`, 'hold');
          w.audio.play('whistleShort');
        }
        break;
      case 'speedBoost':
        m.speedBoostUntil = Date.now() + w.econ.rewarded.speedBoost.durationSeconds * 1000;
        m.lastSpeedOfferAt = life;
        w.events.emit('boost.changed', {});
        w.ui.toast('Roller skates on!', 'skate');
        break;
      case 'doubleFares':
        m.doubleFaresStop = w.journey.stopSerial + 1;
        w.ui.toast('Double fares at the next station', 'double');
        break;
      case 'tempPorter':
        w.staff.hireTemporaryPorter();
        w.ui.toast('A porter joins for this stop', 'person');
        break;
      case 'supplyDelivery': {
        const max = w.econ.facilities.supplyShelfMax;
        w.data.facilities.supplyTowel = max;
        w.data.facilities.supplyRoll = max;
        w.ui.toast('Supplies delivered!', 'crate');
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
