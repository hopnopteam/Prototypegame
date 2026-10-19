// Every tunable number for flight, heat, damage, rest, crash and controls. Starting values: tune with the owner
// (the debug panel's sliders override them live and can copy the result back here).

/** Standard gravity: thrust is expressed in g against this, whatever the world's own gravity. */
export const G0 = 9.81;

/** The simulation runs at a fixed 120 steps a second (SPEC A3). */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
/** At most this many steps in one frame; a longer stall is dropped instead of spiralling. */
export const MAX_STEPS_PER_FRAME = 12;

export interface WorldPhysics {
  /** Multiplies standard gravity (World 7 is about 0.08). */
  gravityScale: number;
  /** Multiplies air drag (World 6 thin, World 7 none). */
  airDensity: number;
}

export const WORLD_PHYSICS: Record<number, WorldPhysics> = {
  1: { gravityScale: 1, airDensity: 1 },
};

/** Everything that decides how one suit flies. Parts (Milestone 3) will add to the bare frame's values. */
export interface SuitParams {
  /** Frame plus pilot, before parts. */
  massKg: number;
  /** Centre of mass above the boot soles, metres (low, near the hips). */
  comHeight: number;
  /** Radius of gyration about the centre of mass, metres: inertia = mass × r². */
  gyrationRadius: number;
  /** Full thrust as a multiple of standard gravity × mass (1.1 barely climbs, 2.5 rockets). */
  thrustG: number;
  /** Seconds for thrust to build from nothing to full on hold. */
  rampUp: number;
  /** Seconds for thrust to fade from full to nothing on release. */
  rampDown: number;
  /** Heat added per second at full throttle (1 = overheated). */
  heatPerSecond: number;
  /** Heat removed per second while thrusting. */
  cooling: number;
  /** Extra cooling while not thrusting: cooling × (1 + this × (1 − throttle)). */
  idleCoolingBonus: number;
  /** Cooling multiplier while resting on a ledge. */
  restCoolingMultiplier: number;
  /** Seconds of full thrust one battery holds. */
  batterySeconds: number;
  /** Gyro stiffness, newton-metres per radian of tilt error. */
  gyroKp: number;
  /** Gyro damping, newton-metres per radian per second. */
  gyroKd: number;
  /** The most torque the gyro can give, newton-metres (heavy suits turn slowly). */
  gyroMaxTorque: number;
  /** How hard the gyro pulls back upright when not holding, as a share of its full strength. */
  uprightStrength: number;
  /** Largest tilt a full drag asks for, degrees from upright. */
  maxTiltDeg: number;
  /** Linear air drag, newtons per (m/s). */
  dragLinear: number;
  /** Quadratic air drag, newtons per (m/s)². */
  dragQuadratic: number;
  /** Impact speed along the contact normal that the armor shrugs off, m/s. */
  armorThreshold: number;
  /** Plates of damage per m/s above the threshold. */
  damagePerMs: number;
  /** Armor plates (integrity). */
  plates: number;
  friction: number;
  restitution: number;
}

/** The bare World 1 Scrap Rig frame: heavy, wobbly, barely able to climb (SPEC A6 feel targets). */
export const BARE_FRAME: SuitParams = {
  massKg: 120,
  comHeight: 0.85,
  gyrationRadius: 0.58,
  thrustG: 1.18,
  rampUp: 0.15,
  rampDown: 0.1,
  heatPerSecond: 0.5,
  cooling: 0.1,
  idleCoolingBonus: 0.6,
  restCoolingMultiplier: 3,
  batterySeconds: 25,
  gyroKp: 1000,
  gyroKd: 240,
  gyroMaxTorque: 650,
  uprightStrength: 0.45,
  maxTiltDeg: 40,
  dragLinear: 4,
  dragQuadratic: 1.6,
  armorThreshold: 6,
  damagePerMs: 0.35,
  plates: 3,
  friction: 0.6,
  restitution: 0.12,
};

/** A mid-level gyro, for the "full tilt in about 0.35 s with a slight overshoot" feel target (SPEC A6). */
export const MID_GYRO: Pick<SuitParams, 'gyroKp' | 'gyroKd' | 'gyroMaxTorque'> = {
  gyroKp: 3000,
  gyroKd: 440,
  gyroMaxTorque: 1900,
};

export const HEAT = {
  /** Above this the gauge flashes and steam vents. */
  warnAt: 0.8,
  /** Seconds the thrusters sputter once heat reaches 100%. */
  sputterSeconds: 1.5,
  /** Thrust while sputtering, as a share of full. */
  sputterThrust: 0.15,
  /** Heat falls to this by the end of a sputter. */
  sputterCoolTo: 0.6,
};

export const IMPACT = {
  /** Below this approach speed a contact is just a touch (no sparks). */
  bumpMinSpeed: 1.2,
  /** Seconds after a hit during which weaker hits are ignored (one impact, one hit). */
  hitCooldown: 0.12,
  /** Contact force events fire above this many newtons per kilogram of suit. */
  forceEventPerKg: 40,
};

export const REST = {
  /** Steepest ground that still counts as a ledge, degrees. */
  maxSlopeDeg: 25,
  /** Slower than this (m/s) to count as landed. */
  landingSpeed: 1.6,
  /** Slower than this (rad/s) spin to count as landed. */
  maxAngularSpeed: 1.5,
  /** Tilted less than this (degrees) to count as landed. */
  maxTiltDeg: 30,
  /** Seconds standing still before the rest begins. */
  settleSeconds: 0.2,
  /** A contact this close (m) to a ledge's line counts as on it. */
  ledgeTolerance: 0.3,
  /** Seconds from the rest beginning to the drone's patch landing. */
  patchDelay: 0.8,
};

export const CRASH = {
  /** Simulated seconds of ragdoll tumble before the drone comes (at most 2 s on screen, SPEC A5.3). */
  ragdollSeconds: 1.3,
  /** The crash plays slowed by this. */
  timeScale: 0.65,
  /** The tumble ends early once the torso is slower than this (m/s) for `settleSeconds`. */
  settleSpeed: 0.4,
  settleSeconds: 0.35,
  /** Speed at which loose plates fly off, m/s. */
  plateSpeed: 3.5,
  /** Armor plates mass, kg. */
  plateMassKg: 3,
};

export const TOW = {
  /** Seconds for the drone to fly in to the suit. */
  approachSeconds: 0.55,
  /** Seconds of the drone dragging the suit off. */
  liftSeconds: 1.6,
  /** Where the drone starts, relative to the suit, metres. */
  startOffset: { x: 3, y: 9 },
  /** How far the drone climbs while towing, metres. */
  liftDistance: 14,
  /** Tow cable stiffness per kilogram towed (spring), and damping. */
  stiffnessPerKg: 45,
  dampingPerKg: 9,
  /** Cable length while towing, metres. */
  cableLength: 1.4,
};

/** A suit lying on the ground pushes itself back up (otherwise a toppled suit could never stand again). */
export const GET_UP = {
  /** Tilted more than this (degrees) while touching the ground counts as fallen over. */
  angleDeg: 55,
  /** Seconds lying there before it starts to push up. */
  delay: 0.25,
  /** Righting torque per kilogram of suit, newton-metres (about mass × g × 1.2 m: enough to stand). */
  torquePerKg: 12,
  /** Seconds for the push to build to full. */
  rampSeconds: 0.35,
};

export const BATTERY_END = {
  /** The run ends once a suit with a flat battery is slower than this (m/s)… */
  restSpeed: 0.25,
  /** …for this long (s), */
  settleSeconds: 0.8,
  /** …or at the latest this long after the battery died. */
  maxWaitSeconds: 6,
};

export const CONTROLS = {
  /** Finger travel (CSS px) from the touch-down point for a full tilt. */
  fullTiltPx: 80,
};
