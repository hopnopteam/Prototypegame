/**
 * THE balance sheet. Every number a designer tunes lives here (prices and unlock order live in content.ts).
 * Remote config can override any leaf by its dotted path, e.g. "ads.minIntervalSeconds".
 * Times are seconds, distances metres, money in Fares unless noted.
 */
/** When a feature joins the flow: all the conditions given must hold. */
export interface FlowGate {
  stops?: number;
  carriages?: number;
  seconds?: number;
  /** Route level reached. */
  level?: number;
}

export const ECONOMY = {
  journey: {
    /**
     * First leg is short so the first station lands at ~1:00 (§14), counting the boarding at Millbrook and the
     * departure (session 17: 36 s, was 48, now that the game opens standing at the platform).
     */
    firstLegMoveSeconds: 36,
    /**
     * Session 16 (owner: "the second ride… is either too fast or too slow"): the rides grow instead of jumping from
     * 48 s to 150 s. The second ride (90 s) holds one arc: Repairs early, then saving for the first new carriage,
     * which couples about as the second station comes into view to fill it; the third is a little longer again.
     */
    earlyLegSeconds: [90, 120] as number[],
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

  /**
   * Session 20 (owner: "the movement… a bit more inspired by My Perfect Hotel, not entirely"): MPH moves at one
   * brisk pace the moment you push, turns on the spot and stops dead. Ours now does nearly that: full speed at
   * half a throw, near-instant start and stop, a quick turn; a light stride stays for the long corridors.
   */
  player: {
    moveSpeed: 5.6,
    acceleration: 70,
    /** Stopping and turning back are firmer than starting, so the conductor stops where you let go. */
    braking: 110,
    /**
     * Stick response: full speed at `fullSpeedAt` of the throw (half: a short push is enough), linear below it
     * (`stickCurve` 1), so a nudge still makes a careful step.
     */
    fullSpeedAt: 0.5,
    stickCurve: 1.0,
    /**
     * Walking into a wall within this far of an opening slides you into it (doorways, gangways, props). A push
     * within about 20° of head-on tries this before sliding along the wall (session 15).
     */
    doorAssist: 0.45,
    /**
     * Gliding along a wall keeps pace: a push up to ~50° off the wall slides along it at full speed (more
     * than that slows gradually), so corridors on the diagonal train never feel sticky. 1 = plain sliding.
     */
    wallGlide: 1.6,
    /** Everyone's collision radius (session 15, was 0.3): about the size of a body, so passages feel roomy. */
    radius: 0.26,
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
    stride: { delaySeconds: 0.6, rampSeconds: 0.8, multiplier: 1.3, turnResetDegrees: 55 },
  },

  /**
   * The camera eases in when you step into a cabin or washroom (framing the room), out on the platform
   * and a touch out while you stride down the train, leading the way you are going.
   */
  camera: { roomZoom: 0.9, roomBias: 0.22, platformZoom: 1.1, strideZoom: 0.04, travelZoom: 1.08, lead: 0.8 },

  zones: {
    checkInSeconds: 0.9,
    /** Stand this long at a shelf before the first item comes off it, so walking past never grabs anything. */
    pickupDwellSeconds: 0.3,
    staffPickupDwellSeconds: 0.12,
    /** The bin only takes surplus, and only after a deliberate pause. */
    binDwellSeconds: 0.45,
    pickupIntervalSeconds: 0.2,
    dropIntervalSeconds: 0.16,
    /**
     * Seconds at a room's pad to strip the used bedding and clear the litter (the mess clears away piece by
     * piece; the used set goes on your stack). Session 22: making the bed is a second, shorter step.
     */
    cleanCabinSeconds: 2.6,
    /** Seconds at the pad to put one fresh bedding set on a stripped bed. */
    makeBedSeconds: 0.8,
    boardIntervalSeconds: 0.75,
    /** Staff work a little slower than the player, so doing it yourself always feels best. */
    staffWorkMultiplier: 0.8,
    /** An unlock tile is paid off in about this many seconds, whatever its price. */
    tileFillSeconds: 2.0,
    tileMinDrainPerSecond: 12,
  },

  guests: {
    walkSpeed: 2.5,
    /** Legs a guest rides: weights for 1, 2 and 3 stations. */
    rideLegsWeights: { 1: 0.7, 2: 0.25, 3: 0.05 } as Record<1 | 2 | 3, number>,
    /** Guests waiting on the platform at a stop: free cabins + this many extra (who wait inside). */
    extraBoarders: [1, 2] as [number, number],
    /** Travellers waiting at the first stops at least (once the flow allows a crowd; before that, one per free bed). */
    minBoarders: 3,
    maxBoarders: 7,
    luggageChance: 0.7,
    /** Session 16: one guest at the desk to start (one room, one guest, one upgrade); more walk in as cabins open. */
    /** Guests already inside at the desk when a new game opens (session 19: none, the opening starts outside). */
    initialGuests: 0,
    /** Until this many stops are done every guest rides exactly one leg: the opening is scripted, never luck. */
    earlyStopsOneLeg: 3,
    /** Seconds a new guest sits on the bed edge reading when they first reach their room. */
    settleSeconds: 4,
    /** Seconds a served guest enjoys it (sips the tea, reads the paper) before sitting back down. */
    enjoySeconds: 2.2,
    /** Seconds a new request is announced with a wave. */
    waveSeconds: 1.4,
  },

  /**
   * Carriage classes (config/classes.ts holds the table). Travellers come for the classes the train sells;
   * now and then one of the next class up turns up too and waits on the platform with their ticket (they
   * cannot board yet): visible demand for the next upgrade, never a penalty.
   */
  /**
   * One trip, one sleep (session 22). Every guest's ride is one night, and its parts follow how far through
   * the ride they are (0 when they board, 1 pulling into their stop), never going back:
   * evening (one request, then perhaps an outing) → lights out (once) → morning (one request) → off at their stop.
   * A guest still waiting for something when the evening ends finishes it first and sleeps a little less.
   */
  trip: {
    /** The evening ends this far through the ride (lights out once nothing is pending). */
    eveningEnd: 0.4,
    /** Morning starts this far through the ride (and not before `minSleepSeconds` asleep). */
    morningStart: 0.64,
    /**
     * Each guest's own bedtime and waking are moved by up to this share of the ride, so a carriage full of guests
     * does not all fall asleep (and go quiet) at once.
     */
    jitter: 0.08,
    /** Shortest night, however late the guest turned in. */
    minSleepSeconds: 4,
    /** Seconds after the evening or morning starts (or after settling in) before the request. */
    requestDelay: [2, 4] as [number, number],
    /** After their request, the chance of an outing (a venue with a seat, else the washroom). */
    outingChance: 0.6,
    /** Of those outings, the chance it is the washroom when no venue suits (or there is none). */
    washroomChance: 0.5,
    /** At most this many washroom visits per trip. */
    washroomsPerTrip: 1,
    /** Seconds at the room for a wake-up call (a knock at the door). */
    wakeupSeconds: 0.9,
  },

  /**
   * Opening a covered room (session 22, gameplay/Reveal.ts): the lid lifts away, the lights flicker on, the
   * furniture pops in. The first room of each kind gets the long version.
   */
  reveal: {
    shortSeconds: 0.9,
    longSeconds: 2.2,
    /** Share of the reveal the lid takes to lift off, and how high it rises. */
    lidShare: 0.45,
    lidLift: 0.9,
    /** When the lights start to come on and the furniture pops in (shares of the reveal). */
    lightsAt: 0.3,
    furnitureAt: 0.45,
    /** The lights' blinks as they come on (lamp light, 0 dark to 1 lit); the short reveal keeps the last two. */
    flicker: [0.7, 0.1, 0.9, 0.35, 1] as number[],
    /** How close the camera eases in for a long reveal. */
    zoom: 1.2,
  },

  classes: {
    /** Chance a traveller holds a ticket for the class above the train's best (once that class can be bought). */
    aspirantChance: 0.18,
    /** First and Royal: seconds at the cabin to turn the bed down, and the tip for it (before the class tip). */
    turndownSeconds: 1.1,
    turndownTip: 4,
    /** Royal: requests come in pairs; finishing the butler's list pays this much extra on the last tip. */
    butlerBonus: 1.5,
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
    alightTip: 12,
    luggageTip: 4,
    /** Session 22: a guest asks once in the evening and once in the morning (was every ~20 s), so each request pays more. */
    requestTip: 9,
    bathroomTip: 3,
    stationBonusCash: 18,
    /** The station bonus grows by this fraction for every carriage coupled. */
    stationBonusPerCarriage: 0.3,
    startingCash: 0,
    /**
     * Loose cash on the floor at the very start. Session 16: none (it pulled the first step away from the guest
     * at the desk); the first reward is the first fare, three seconds in.
     */
    startingFloorCash: 0,
    /** Walk this close to a cash pile and it streams into your pockets. */
    magnetRadius: 1.1,
  },

  tiles: {
    /** Unlock tiles on show at once besides the coupling (fewer choices, clearer next goal). */
    maxVisible: 2,
    /** Refit (class) tiles on show at once, each on its own carriage, outside `maxVisible`. */
    maxRefits: 2,
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
    /**
     * Session 17 (owner: "the dirt, unclean room presentation is still a mess… doesn't look thrown together"): a
     * used room is the bed they slept in plus one thing of theirs on the floor beside it, always in the same place.
     */
    minPieces: 1,
    maxPieces: 1,
    /** Chance that one thing is something anyone might leave (a paper ball, a wrapper) instead of their own. */
    commonChance: 0.2,
  },

  /** Comforts (reading lamps, flowers, radios; soaps, towel rails): what each one adds in its carriage. */
  comfort: {
    /** Tips left in that carriage's cabins (alighting and requests). */
    cabinTipBonus: 0.2,
    /** Washroom tips in that carriage. */
    bathTipBonus: 0.25,
  },

  /**
   * One layer at a time (session 15, owner: "the tutorials and challenges in the first minute are way too
   * much… step by step"). The four-step walkthrough has the screen to itself; the goal chain wakes after the
   * first stop (goals the walkthrough already covered are settled quietly); the Rush streak, the class badges
   * and passengers' reaction bubbles each arrive once there is something for them to say.
   */
  /**
   * The flow (session 16, owner: "we need a FLOW… right now it's like someone randomly put the features
   * there"). The opening is one room, one guest, one upgrade: a single guest at the desk, then one purchase at
   * a time in `openingTiles` order, each cabin bringing a passenger in from the observation deck during the
   * first leg. Every later feature joins when the ride reaches it (`features`): after this many stops
   * (`stops`), with this many carriages (`carriages`) and this much lifetime play (`seconds`); all given
   * must hold, and `level` is the route level. Gameplay asks `Flow.allows(feature)`.
   */
  flow: {
    /** The first purchases, one on show at a time, in this order (the next appears when the last is bought). */
    openingTiles: ['c0.open', 'c0.cabin_1', 'c0.cabin_2', 'c0.hire_attendant', 'c0.refurb_1', 'couple_1'] as string[],
    /**
     * Where the first passengers come from (session 17, owner: "where guests are coming from… a whole system where
     * logistically it makes total sense"): a new game opens standing at Millbrook with the doors open. Session 19
     * (owner: "start from collecting tickets from outside and then the game moves inside"): the conductor starts
     * on the platform beside `travellers` waiting passengers. The first collects their ticket at the door (the
     * boarding pad, the walkthrough's first step) and walks in to the desk; the conductor follows them inside.
     * The other has a "no room" sign (one cabin is ready); each cabin built frees a bed and they walk aboard by
     * themselves (`boardDelay` seconds after the purchase). Once everyone with a bed is inside, the last call
     * sounds and the train leaves `lastCallSeconds` later. The clock is held until then: the train never leaves
     * anyone it has a bed for. Every passenger after that boards at a station.
     */
    prologue: {
      travellers: 2,
      boardDelay: 0.6,
      lastCallSeconds: 6,
      /**
       * Session 22, the station start: a new game's first stop lasts this long (the clock runs from the first
       * frame) and happens once. The train stands covered; the first ticket opens the first carriage, its first
       * bed is made up, the guest walks in. If the first guest is not aboard when the clock runs out it waits for
       * them, at most `holdCapSec` more; the conductor is never left behind.
       */
      durationSec: 60,
      holdCapSec: 90,
      /**
       * Who waits on the platform, in order. The first pays a full fare (a backpacker), so their fare always
       * buys the first cabin: a cheaper archetype (a student pays 14 of the 15) left the opening with no way to
       * earn the last coin (session 19).
       */
      archetypes: ['backpacker', 'student'] as string[],
    },
    features: {
      /** The goal chain (it also waits for the walkthrough and the train's name, see Objectives). */
      goals: { stops: 1 },
      /** More than one request at a time (in the opening a guest asks only once the last one is served). */
      manyRequests: { stops: 1 },
      /** Bags to load at stations. */
      luggage: { stops: 1 },
      /** Travellers beyond the free beds, who wait with a "no room" sign for the next train. */
      crowd: { stops: 1 },
      /** Passengers' reaction bubbles (smiles, hearts, stars). */
      reactions: { stops: 1 },
      /** Rush streaks (the bolt under the conductor). */
      rush: { carriages: 2 },
      /** Class badges over the passenger carriages (or as soon as a carriage moves up a class). */
      classChips: { carriages: 2 },
      /** The locked next-carriage plate on the rear deck (before that, the coupling arrives in its turn). */
      couplePreview: { carriages: 2 },
      /** Rewarded offers in the bottom slot. */
      offers: { seconds: 150, carriages: 2 },
      /** The station workshop (exterior and marketing pads on the platform). */
      workshop: { stops: 2, carriages: 2 },
      /** The race up the league: the next rival's portrait on the HUD (session 18; also waits for the train's name). */
      rivals: { stops: 2, carriages: 2 },
      /**
       * Two regular tiles on show instead of one (`tiles.maxVisible`); until then the floor widens a step at a
       * time after the opening: one tile, the coupling and a refit.
       */
      moreTiles: { level: 2 },
    } satisfies Record<string, FlowGate>,
    /**
     * The first time a tile of one of these kinds appears away from the conductor, the camera glides over to
     * show it, then back (MPH: "look, something new"). Seconds held, zoom, and the distance that warrants it.
     */
    reveal: { kinds: ['hire', 'refurb', 'couple', 'exterior', 'marketing'] as string[], seconds: 1.5, zoom: 1.05, minDistance: 3.2 },
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
    /** Session 22: one request per part of the night and a four-step turnaround, so each is worth more. */
    requestFulfilled: 2,
    cabinCleaned: 2,
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
    // Session 20: the venues' staff.
    barista: { speed: 3.0, capacity: 1, homeIdleSeconds: 0.4 },
    chef: { speed: 2.8, capacity: 1, homeIdleSeconds: 0.4 },
    waiter: { speed: 3.2, capacity: 2, homeIdleSeconds: 0.4 },
    bartender: { speed: 3.0, capacity: 1, homeIdleSeconds: 0.4 },
    host: { speed: 3.0, capacity: 1, homeIdleSeconds: 0.4 },
    projectionist: { speed: 3.0, capacity: 1, homeIdleSeconds: 0.4 },
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
};

export type Economy = typeof ECONOMY;
