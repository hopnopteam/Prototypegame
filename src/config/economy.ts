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
    /** Stopping and turning back are firmer than starting, so the conductor stops where you let go. */
    braking: 70,
    /**
     * Stick response: full speed a little before the rim (`fullSpeedAt` of the throw), and a gentle curve
     * (`stickCurve` > 1) so small movements of the thumb give slow, precise steps.
     */
    fullSpeedAt: 0.85,
    stickCurve: 1.3,
    /** Walking into a wall within this far of an opening slides you into it (doorways, gangways, props). */
    doorAssist: 0.38,
    radius: 0.3,
    baseCarryCapacity: 3,
    /** Quick travel (tap a carriage on the train map) walks the route this much faster… */
    dashMultiplier: 1.8,
    /** …and never takes longer than this (it speeds up on a long train), up to maxDashMultiplier. */
    dashMaxSeconds: 1.6,
    maxDashMultiplier: 4,
    /**
     * Stride: keep walking the same way (a corridor, the aisle) and the conductor picks up pace, so a long
     * train is never a slog. Resets on a sharp turn or a stop.
     */
    stride: { delaySeconds: 0.45, rampSeconds: 0.7, multiplier: 1.55, turnResetDegrees: 55 },
  },

  /**
   * The camera eases in when you step into a cabin or washroom (framing the room), out on the platform
   * and a touch out while you stride down the train, leading the way you are going.
   */
  camera: { roomZoom: 0.82, roomBias: 0.4, platformZoom: 1.12, strideZoom: 0.08, travelZoom: 1.1, lead: 1.3 },

  zones: {
    checkInSeconds: 0.9,
    /** Stand this long at a shelf before the first item comes off it, so walking past never grabs anything. */
    pickupDwellSeconds: 0.3,
    staffPickupDwellSeconds: 0.12,
    /** The bin only takes surplus, and only after a deliberate pause. */
    binDwellSeconds: 0.45,
    pickupIntervalSeconds: 0.2,
    dropIntervalSeconds: 0.16,
    /** Seconds to tidy a cabin, standing on its one spot (the mess clears away piece by piece). */
    cleanCabinSeconds: 2.6,
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
    /** Seconds a new guest sits on the bed edge reading before lying down (it counts toward their first request). */
    settleSeconds: 4,
    /** Seconds a served guest enjoys it (sips the tea, hugs the pillow) before going back to bed. */
    enjoySeconds: 2.2,
    /** Seconds a new request is announced with a wave. */
    waveSeconds: 1.4,
  },

  service: {
    /** Deliver a request this fast for a bigger tip. Slower is never worse than the base tip. */
    speedySeconds: 8,
    quickSeconds: 16,
    speedyTipMultiplier: 1.6,
    quickTipMultiplier: 1.25,
  },

  money: {
    baseFare: 15,
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

  tiles: {
    /** Unlock tiles on show at once besides the coupling (fewer choices, clearer next goal). */
    maxVisible: 2,
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

  /**
   * Soft failure cues and passenger chatter. Nothing is ever lost for good (§5); a missed passenger, a slow
   * request or an empty washroom just gets noticed (a grey note, a sound, a grumble) so the player sees what
   * to improve. They switch on only once the basics are learnt.
   */
  feedback: {
    /** Cues start at this route level... */
    cuesFromLevel: 2,
    /** ...or after this many station stops, whichever comes first. */
    cuesFromStop: 5,
    /** A request unanswered this long turns its bubble red, with a grumble. */
    slowRequestSeconds: 30,
    /** A guest left at the desk this long (with a room ready) rings the bell. */
    deskWaitSeconds: 18,
    /** Passengers speak at most this often... */
    chatterGapSeconds: 8,
    /** ...each kind of remark at most this often... */
    sameLineSeconds: 45,
    /** ...and only this often when something happens. */
    chatterChance: 0.35,
    /** No washroom car yet: someone asks where the loo is about this often (seconds). */
    noWashroomSeconds: 110,
    /** Service mood (0 grumpy … 1 delighted): colours what new passengers have heard and their reviews. */
    mood: { start: 0.6, rest: 0.6, driftPerMinute: 0.06, fast: 0.05, slow: -0.08, missed: -0.08, perfectStop: 0.06, emptyWashroom: -0.05 },
  },

  /** What a departing guest leaves behind: pieces from their archetype's pool, sometimes a common one. */
  /** Everyone aboard leans with the train: back as it pulls away, forward as it brakes (radians). */
  lean: {
    /** Radians of lean per unit of acceleration (world units per second²). */
    perAccel: 0.035,
    max: 0.12,
    /** How quickly the lean follows the train (per second). */
    sharpness: 3,
  },
  mess: {
    minPieces: 2,
    maxPieces: 3,
    /** Chance one piece is swapped for something anyone might leave (a paper ball, a wrapper). */
    commonChance: 0.3,
  },

  /** Comforts (reading lamps, flowers, radios; soaps, towel rails): what each one adds in its carriage. */
  comfort: {
    /** Tips left in that carriage's cabins (alighting and requests). */
    cabinTipBonus: 0.2,
    /** Washroom tips in that carriage. */
    bathTipBonus: 0.25,
  },

  /**
   * Rush: services the conductor does back to back (check-in, requests, cleaning, luggage) build a streak;
   * milestones pay a cash bonus. Letting it lapse costs nothing (§5: no failure, only bonuses).
   */
  rush: {
    /** Seconds allowed between services before the streak lapses. */
    window: 8,
    /** Streak counts that pay a bonus. */
    milestones: [3, 5, 8, 12, 16, 20, 25, 30],
    /** Bonus cash per streak step at a milestone (a 5-streak pays 5 × this). */
    cashPerStep: 2,
  },

  stars: {
    requestFulfilled: 1,
    cabinCleaned: 1,
    cleanStationStop: 3,
    staffHired: 2,
  },

  progression: {
    /** Stars needed to reach each route level (index 0 = level 1). Route 1 maxes at level 8. */
    levelThresholds: [0, 75, 170, 290, 420, 560, 710, 880],
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
