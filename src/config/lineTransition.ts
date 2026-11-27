/**
 * The Grand Departure (the route-change sequence): one template every route fills in with its own settings. A route's
 * `transition` describes how the player leaves it and arrives on the next line: the tease in its scenery, the farewell,
 * the depot, the tunnel at both ends, the arrival station, the new livery, the chest and every word on screen. The
 * director (gameplay/LineTransition.ts) plays the same beats for any route; Route 3 needs only a new block of settings
 * and its art, never new code.
 *
 * Stage A (blockout): every set piece is a stand-in built from boxes, cylinders and cones in these colours; Stage B
 * swaps them for the baked Blender pieces named in `art` without changing a beat.
 */

/** The beats, in order. The tease plays in ordinary play, before the gate; the rest is the sequence. */
export type TransitionBeat = 'hero' | 'frontPage' | 'offer' | 'lever' | 'depot' | 'tunnel' | 'burst' | 'arrival' | 'chest' | 'postcard';

/** The beats that play on the route being left (before the page reloads in the tunnel's dark). */
export const BEFORE_RELOAD: TransitionBeat[] = ['hero', 'frontPage', 'offer', 'lever', 'depot', 'tunnel'];
/** The beats that play on the new route (after the reload). */
export const AFTER_RELOAD: TransitionBeat[] = ['burst', 'arrival', 'chest', 'postcard'];

export type TunnelStyle = 'stone' | 'cliff' | 'snow';

export interface LineTransitionDef {
  /** The route this transition leads to (its id; it may not be playable yet, as with the Winter City placeholder). */
  to: string;
  /** The line's name as it is announced ("Riviera Coast Line"). */
  toName: string;
  /** A short name for posters and the lever's caption ("the Riviera"). */
  toShort: string;

  /** Step 1, the tease: from this route level or this many carriages, whichever comes first. */
  tease: {
    fromLevel: number;
    fromCarriages: number;
    /** The sign on the portal ("Riviera Coast Line →"). */
    sign: string;
    /** The station posters' line ("Coming soon: the Riviera"). */
    poster: string;
    /** The portal's stone and the sign's colours. */
    style: TunnelStyle;
    /** The portal passes once every this many laps of the scenery (it is a surprise, not a fixture). */
    everyLaps: number;
  };

  /** Step 2, the farewell: the hero shot over the finished train, its fireworks and its sting. */
  farewell: {
    /** Seconds of the camera's pull-back and pan along the train. */
    seconds: number;
    /** Firework colours over the lake. */
    fireworks: string[];
    /** The music sting under the hero shot (an audio cue id). */
    sting: string;
    /**
     * Stage B: where in the day cycle the old line is held from the hero shot to the tunnel (a readable dusk the
     * fireworks still show against, rather than the route's deep night). Omitted: the route's own light.
     */
    timeOfDay?: number;
  };

  /** Step 3, the offer: the golden ticket's words. */
  ticket: { title: string; button: string };

  /** Step 4, the lever. */
  lever: {
    /** Seconds before the hand shows how to pull it. */
    hintAfter: number;
    /** The share of the pull that resists before it gives (0–1). */
    resist: number;
  };

  /** Step 5, the depot. */
  depot: {
    /** The shed's name over its doors ("Millbrook Engine Shed"). */
    name: string;
    /** The brass plaque on the closed doors. */
    plaque: string;
    /** The tarp over the next line's first carriage. */
    tarpColor: string;
    seconds: number;
  };

  /** Step 6 and 7, the tunnel's two ends. */
  tunnel: {
    entrance: TunnelStyle;
    exit: TunnelStyle;
    /** The sky the countryside turns to as the train runs for the tunnel (dawn). */
    dawn: string;
    /** The colour of the light at the far end. */
    exitLight: string;
    seconds: number;
  };

  /** Step 8, the arrival station. */
  arrival: {
    station: string;
    /** The arch's words. */
    arch: string;
    /** The arch's and the band's colours (bamboo, thatch, leis). */
    colors: { bamboo: string; thatch: string; flowers: string[]; torch: string };
    /** The locals waiting on the platform. */
    crowd: number;
    /** The new livery swept onto the locomotive (an earned livery's colours). */
    livery: { body: string; trim: string };
    /** The new name plate's words. */
    plate: string;
    /** The band's sting (an audio cue id). */
    sting: string;
    seconds: number;
  };

  /**
   * The line-complete chest, the sequence's one reward, paid once with the save that marks it paid
   * (sim/lineTransition.ts), so a relaunch never pays it twice. Sized to be spent on the new line straight away (owner:
   * "go with what's best for retention"): the gems are the price of a Paint Shop livery (the cheapest is 120), so the
   * new train can be painted the moment it arrives, and the Rail Miles buy a conductor upgrade (3/6/10), so the
   * player starts the new line a step faster than they left the old one.
   */
  chest: { gems: number; railMiles: number };

  /** Step 9, the postcard of the finished train. */
  postcard: { frame: string; ink: string; stamp: string; caption: string };

  /** Every caption the sequence shows, by beat (the walkthrough video's captions read them too). */
  captions: Partial<Record<TransitionBeat, string>>;

  /** Stage B: the baked set pieces that will replace the stand-ins (art/blender/transition/). */
  art: string[];
}

/** Countryside Express → the Riviera Coast Line. */
export const COUNTRYSIDE_TO_RIVIERA: LineTransitionDef = {
  to: 'riviera',
  toName: 'Riviera Coast Line',
  toShort: 'the Riviera',
  tease: { fromLevel: 7, fromCarriages: 7, sign: 'Riviera Coast Line →', poster: 'Coming soon: the Riviera', style: 'stone', everyLaps: 3 },
  farewell: { seconds: 6, fireworks: ['#FFD27A', '#FF7A8A', '#8FE3FF', '#B9FF9E'], sting: 'farewell', timeOfDay: 0.71 },
  ticket: { title: 'A ticket to the Riviera', button: 'Open the Riviera Coast Line' },
  lever: { hintAfter: 4, resist: 0.62 },
  depot: { name: 'Old Mill Junction Engine Shed', plaque: 'Countryside Express: preserved', tarpColor: '#E8D3A2', seconds: 8 },
  tunnel: { entrance: 'stone', exit: 'cliff', dawn: '#F2B78C', exitLight: '#FFF1C9', seconds: 5 },
  arrival: {
    station: 'Porto Sole',
    arch: 'Welcome to the Riviera',
    colors: { bamboo: '#C9A35E', thatch: '#B8873F', flowers: ['#FF5C8A', '#FFB13B', '#FF7AD9', '#FFE45C'], torch: '#FF9A3C' },
    crowd: 8,
    livery: { body: '#3E8FC9', trim: '#F4EBD6' },
    plate: 'Riviera Coast Line',
    sting: 'steelband',
    seconds: 6,
  },
  chest: { gems: 120, railMiles: 10 },
  postcard: { frame: '#C9A35E', ink: '#2F5F4F', stamp: 'COUNTRYSIDE LINE', caption: 'The Countryside Express, restored' },
  captions: {
    hero: 'Look what you built',
    lever: 'Pull the lever to switch the points',
    depot: 'The Countryside Express is preserved in the shed',
    tunnel: 'Into the tunnel',
    burst: 'The Riviera Coast Line',
    arrival: 'Welcome to the Riviera',
    chest: 'Line complete',
    postcard: 'A postcard for your album',
  },
  art: ['tunnel_portal_stone', 'points_lever', 'engine_shed', 'sea_cliff_vista', 'tunnel_portal_cliff', 'riviera_grand_station', 'welcome_arch'],
};

/**
 * Riviera Coast Line → Winter City Express: a placeholder (Route 3 is not playable yet). It proves the template: the same
 * beats with a snowy night exit and stand-in art, played from the Debug sheet ("Winter City placeholder").
 */
export const RIVIERA_TO_WINTER: LineTransitionDef = {
  to: 'winter',
  toName: 'Winter City Express',
  toShort: 'Winter City',
  tease: { fromLevel: 7, fromCarriages: 8, sign: 'Winter City Express →', poster: 'Coming soon: Winter City', style: 'cliff', everyLaps: 3 },
  farewell: { seconds: 6, fireworks: ['#FFE1A8', '#7FD8FF', '#FF9EC4', '#FFFFFF'], sting: 'farewell', timeOfDay: 0.64 },
  ticket: { title: 'A ticket to Winter City', button: 'Open the Winter City Express' },
  lever: { hintAfter: 4, resist: 0.62 },
  depot: { name: 'Coral Beach Engine Shed', plaque: 'Riviera Coast Line: preserved', tarpColor: '#DDE6EE', seconds: 8 },
  tunnel: { entrance: 'cliff', exit: 'snow', dawn: '#6C7FB8', exitLight: '#DDEBFF', seconds: 5 },
  arrival: {
    station: 'Frostgate',
    arch: 'Welcome to Winter City',
    colors: { bamboo: '#8C6A4A', thatch: '#F3F6FA', flowers: ['#D8312E', '#2E7D4F', '#F2D16B', '#FFFFFF'], torch: '#FFC46B' },
    crowd: 8,
    livery: { body: '#7A1F2B', trim: '#E9D9B5' },
    plate: 'Winter City Express',
    sting: 'steelband',
    seconds: 6,
  },
  chest: { gems: 150, railMiles: 14 },
  postcard: { frame: '#3E8FC9', ink: '#1F4F7A', stamp: 'RIVIERA COAST LINE', caption: 'The Riviera Coast Line, complete' },
  captions: {
    hero: 'Look what you built',
    lever: 'Pull the lever to switch the points',
    depot: 'The Riviera train is preserved in the shed',
    tunnel: 'Into the tunnel',
    burst: 'The Winter City Express',
    arrival: 'Welcome to Winter City',
    chest: 'Line complete',
    postcard: 'A postcard for your album',
  },
  art: ['tunnel_portal_cliff', 'points_lever', 'engine_shed', 'snow_vista', 'tunnel_portal_snow', 'winter_grand_station', 'welcome_arch_winter'],
};

/** Every transition by the id of the route it leaves (the Debug sheet's list). */
export const TRANSITIONS: Record<string, LineTransitionDef> = { countryside: COUNTRYSIDE_TO_RIVIERA, riviera: RIVIERA_TO_WINTER };
