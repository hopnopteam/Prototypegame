/**
 * THE balance sheet. Every number a designer tunes lives here (prices and unlock order live in content.ts).
 * Remote config can override any leaf by its dotted path, e.g. "ads.minIntervalSeconds".
 * Times are seconds, distances metres, money in Fares unless noted.
 */
export const ECONOMY = {
  journey: {
    /** First leg is short so the first station lands at ~1:00 (§14), counting the opening departure. */
    firstLegMoveSeconds: 48,
    moveSeconds: 150,
    arrivingSeconds: 6,
    stationSeconds: 40,
    departingSeconds: 6,
    holdTheTrainSeconds: 15,
    /** Scenery scroll speed while cruising. */
    cruiseSpeed: 14,
    /** How long before the doors close the "last call" chime and hold-the-train offer appear. */
    lastCallSeconds: 12,
    /** Legs per full day→dusk→night→dawn cycle. */
    legsPerDayCycle: 4,
  },

  player: {
    moveSpeed: 5.0,
    acceleration: 38,
    radius: 0.3,
    baseCarryCapacity: 3,
    /** Quick travel (tap a carriage on the train map) walks the route this much faster. */
    dashMultiplier: 1.8,
  },

  zones: {
    checkInSeconds: 0.9,
    /** Stand this long at a shelf before the first item comes off it, so walking past never grabs anything. */
    pickupDwellSeconds: 0.3,
    staffPickupDwellSeconds: 0.12,
    /** The bin only takes surplus, and only after a deliberate pause. */
    binDwellSeconds: 0.45,
    pickupIntervalSeconds: 0.2,
    dropIntervalSeconds: 0.16,
    cleanSpotSeconds: 1.5,
    boardIntervalSeconds: 0.75,
    /** Staff work a little slower than the player, so doing it yourself always feels best. */
    staffWorkMultiplier: 0.8,
    /** An unlock tile is paid off in about this many seconds, whatever its price. */
    tileFillSeconds: 2.0,
    tileMinDrainPerSecond: 12,
  },

  guests: {
    walkSpeed: 2.5,
    /** Seconds after settling before the first request, and between requests. */
    firstRequestDelay: [7, 12] as [number, number],
    requestInterval: [14, 24] as [number, number],
    /** Chance a request is a bathroom visit once a bathroom car exists. */
    bathroomVisitWeight: 0.3,
    /** Legs a guest rides: weights for 1, 2 and 3 stations. */
    rideLegsWeights: { 1: 0.7, 2: 0.25, 3: 0.05 } as Record<1 | 2 | 3, number>,
    /** Guests waiting on the platform at a stop: free cabins + this many extra (who wait inside). */
    extraBoarders: [1, 2] as [number, number],
    minBoarders: 3,
    maxBoarders: 7,
    luggageChance: 0.7,
    initialGuests: 2,
    /** Until this many stops are done every guest rides exactly one leg: the opening is scripted, never luck. */
    earlyStopsOneLeg: 3,
  },

  service: {
    /** Deliver a request this fast for a bigger tip. Slower is never worse than the base tip. */
    speedySeconds: 8,
    quickSeconds: 16,
    speedyTipMultiplier: 1.6,
    quickTipMultiplier: 1.25,
  },

  money: {
    baseFare: 12,
    alightTip: 8,
    luggageTip: 4,
    requestTip: 7,
    bathroomTip: 3,
    stationBonusCash: 18,
    /** The station bonus grows by this fraction for every carriage coupled. */
    stationBonusPerCarriage: 0.3,
    startingCash: 0,
    /** Loose cash on the floor at the very start: the first reward happens within seconds. */
    startingFloorCash: 6,
    /** Walk this close to a cash pile and it streams into your pockets. */
    magnetRadius: 1.1,
  },

  /** Carriage refurbishment (rags to riches): what each tier is worth, by carriage type. */
  refurb: {
    /** Sleeper cabins: fare multiplier per tier (3 tiers: x1.75). */
    fareBonusPerTier: 0.25,
    /** Bathroom car: washroom tip multiplier per tier. */
    bathTipBonusPerTier: 0.5,
    /** Supply and luggage cars: every tip on the train, per tier. */
    trainTipBonusPerTier: 0.05,
  },

  stars: {
    requestFulfilled: 1,
    cabinCleaned: 1,
    cleanStationStop: 3,
    staffHired: 2,
  },

  progression: {
    /** Stars needed to reach each route level (index 0 = level 1). Route 1 maxes at level 8. */
    levelThresholds: [0, 90, 200, 340, 510, 710, 950, 1250],
    levelRailMiles: [0, 3, 4, 5, 6, 8, 10, 12],
    levelCash: [0, 80, 150, 250, 400, 600, 850, 1200],
    /** Feature gates by route level (§9: introduce each layer after the one below is understood). */
    unlockLevels: {
      conductorUpgrades: 2,
      dailyQuests: 3,
      dailyLogin: 4,
      stories: 5,
    },
  },

  conductor: {
    speed: { maxLevel: 5, perLevel: 0.07, costs: [2, 3, 5, 8, 12] },
    capacity: { maxLevel: 5, perLevel: 1, costs: [3, 5, 8, 12, 16] },
    fareBonus: { maxLevel: 5, perLevel: 0.06, costs: [3, 5, 8, 12, 16] },
  },

  staff: {
    attendant: { speed: 3.0, capacity: 2, homeIdleSeconds: 0.4 },
    porter: { speed: 3.3, capacity: 3, homeIdleSeconds: 0.4 },
    runner: { speed: 3.1, capacity: 4, homeIdleSeconds: 0.4 },
    /** Staff upgrade tiles: +speed fraction and +capacity per level. */
    upgradeSpeedPerLevel: 0.2,
    upgradeCapacityPerLevel: 1,
  },

  facilities: {
    lobbyRackCapacity: 4,
    luggageCarCapacity: 16,
    bathroomTowelMax: 4,
    bathroomRollMax: 4,
    supplyShelfMax: 16,
    supplyShelfStart: 16,
    vendorCratesPerStop: 2,
    crateRefill: 8,
    /** Staff restock a bathroom when either supply falls to this. */
    bathroomRestockThreshold: 2,
  },

  ads: {
    /** §12 interstitial rules. All remote-configurable. */
    interstitialsEnabled: true,
    minLifetimeMinutes: 10,
    minIntervalSeconds: 180,
    /** Before this much lifetime play, never show interstitials at two stations in a row. */
    noConsecutiveStationsUntilMinutes: 30,
    /** Rewarded offers never appear before this much lifetime play (§14: first offer ~2:20). */
    rewardedMinLifetimeMinutes: 2,
    mockRewardedSeconds: 3,
    mockInterstitialSeconds: 2.5,
  },

  rewarded: {
    cashStash: { gemCost: 5, fractionOfTarget: 0.6, minAmount: 30, cooldownSeconds: 75, shortWaitSeconds: 1.2 },
    holdTheTrain: { gemCost: 5 },
    speedBoost: { gemCost: 10, multiplier: 1.5, durationSeconds: 180, cooldownSeconds: 300, firstOfferMinutes: 3.5 },
    doubleFares: { gemCost: 10, offerSecondsBeforeArrival: 30, everyNthStation: 3 },
    tempPorter: { gemCost: 8 },
    levelUpDouble: { gemCost: 10 },
    offlineDouble: { gemCost: 10 },
    loginDouble: { gemCost: 5 },
    supplyDelivery: { gemCost: 5 },
  },

  offline: {
    minAwaySeconds: 120,
    capSeconds: 2 * 60 * 60,
    perCabinPerMinute: 1.5,
    perStaffPerMinute: { attendant: 6, porter: 9, runner: 5 } as Record<string, number>,
    /** Only automated income accrues offline, and at a reduced rate, so playing always beats waiting. */
    efficiency: 0.6,
  },

  offers: {
    /** First Class Ticket: first shown after the first carriage couples, and never in the first 5 minutes. */
    firstClassMinLifetimeMinutes: 5,
    firstClassDiscountAfterIgnores: 2,
    firstClassSessionCooldownSeconds: 20,
  },

  daily: {
    loginRewards: [
      { cash: 100 },
      { gems: 10 },
      { railMiles: 2 },
      { cash: 250 },
      { gems: 20 },
      { railMiles: 4 },
      { gems: 50, railMiles: 5 },
    ] as { cash?: number; gems?: number; railMiles?: number }[],
    questsPerDay: 3,
  },

  performance: {
    maxPixelRatio: 2,
    lowPixelRatio: 1.25,
    /** Drop resolution when the smoothed frame rate stays under this. */
    downgradeFps: 48,
  },
};

export type Economy = typeof ECONOMY;
