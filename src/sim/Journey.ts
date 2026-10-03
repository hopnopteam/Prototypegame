import type { JourneyPhase } from '../core/types';

export interface JourneyConfig {
  firstLegMoveSeconds: number;
  /** The legs after the first stops, in order, before `moveSeconds` takes over (rides grow, never jump). */
  earlyLegSeconds?: readonly number[];
  moveSeconds: number;
  arrivingSeconds: number;
  stationSeconds: number;
  departingSeconds: number;
  holdTheTrainSeconds: number;
  cruiseSpeed: number;
  lastCallSeconds: number;
}

export interface JourneyListener {
  onPhase(phase: JourneyPhase, previous: JourneyPhase): void;
  onLastCall(): void;
}

/**
 * The journey rhythm (§5): On the move → Arriving → Station stop → Departing, looping. The train never moves
 * in world space; this class reports the speed the scenery should scroll at and how far away the platform is,
 * so the platform glides in and stops exactly at the doors.
 */
export class Journey {
  phase: JourneyPhase = 'onTheMove';
  /** Seconds elapsed in the current phase. */
  time = 0;
  /** Index into the station list of the next station (or the current one while stopped). */
  stationIndex: number;
  legsCompleted: number;
  /** Increments every stop; ad rules use it to tell stops apart. */
  stopSerial: number;
  holdUsed = false;
  private moveDuration: number;
  private stationDuration: number;
  private lastCallSent = false;

  constructor(
    private readonly config: JourneyConfig,
    private readonly listener: JourneyListener,
    stationIndex = 0,
    legsCompleted = 0,
    stopSerial = 0,
    moveSecondsOverride?: number,
    /** A brand-new game opens pulling out of the first station, so the journey is on screen from second one. */
    startPhase: 'onTheMove' | 'departing' = 'onTheMove',
  ) {
    this.stationIndex = stationIndex;
    this.legsCompleted = legsCompleted;
    this.stopSerial = stopSerial;
    this.phase = startPhase;
    this.moveDuration = moveSecondsOverride ?? this.legSeconds(stopSerial);
    this.stationDuration = config.stationSeconds;
  }

  /** How long the train runs after this many stops: a short first leg, a few growing ones, then the cruise. */
  legSeconds(stopsDone: number): number {
    if (stopsDone === 0) return this.config.firstLegMoveSeconds;
    return this.config.earlyLegSeconds?.[stopsDone - 1] ?? this.config.moveSeconds;
  }

  get duration(): number {
    switch (this.phase) {
      case 'onTheMove':
        return this.moveDuration;
      case 'arriving':
        return this.config.arrivingSeconds;
      case 'stationStop':
        return this.stationDuration;
      case 'departing':
        return this.config.departingSeconds;
    }
  }

  get timeLeft(): number {
    return Math.max(0, this.duration - this.time);
  }

  /** Scenery scroll speed in metres per second. */
  get speed(): number {
    const v = this.config.cruiseSpeed;
    switch (this.phase) {
      case 'onTheMove':
        return v;
      case 'arriving':
        return v * (1 - this.time / this.config.arrivingSeconds);
      case 'stationStop':
        return 0;
      case 'departing':
        return v * (this.time / this.config.departingSeconds);
    }
  }

  /** Metres until the train stops alongside the platform, or null once stopped or departed. */
  get distanceToStop(): number | null {
    const v = this.config.cruiseSpeed;
    const tA = this.config.arrivingSeconds;
    if (this.phase === 'onTheMove') return this.timeLeft * v + (v * tA) / 2;
    if (this.phase === 'arriving') {
      const remaining = tA - this.time;
      return (v * remaining * remaining) / (2 * tA);
    }
    return null;
  }

  /** Metres travelled since the train started pulling out, or null before departure. */
  get distanceSinceDeparture(): number | null {
    const v = this.config.cruiseSpeed;
    const tD = this.config.departingSeconds;
    if (this.phase === 'departing') return (v * this.time * this.time) / (2 * tD);
    if (this.phase === 'onTheMove' && (this.legsCompleted > 0 || this.stopSerial > 0)) return (v * tD) / 2 + v * this.time;
    return null;
  }

  /** 0 → 1 progress toward the next station while moving; used by the HUD. */
  get legProgress(): number {
    if (this.phase === 'onTheMove') return Math.min(1, this.time / this.moveDuration) * 0.9;
    if (this.phase === 'arriving') return 0.9 + 0.1 * (this.time / this.config.arrivingSeconds);
    return 1;
  }

  get doorsOpen(): boolean {
    return this.phase === 'stationStop';
  }

  /** Rewarded "Hold the train": adds time to the current stop, once per stop. */
  holdTrain(): boolean {
    if (this.phase !== 'stationStop' || this.holdUsed) return false;
    this.holdUsed = true;
    this.stationDuration += this.config.holdTheTrainSeconds;
    this.lastCallSent = false;
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.phase === 'stationStop' && !this.lastCallSent && this.timeLeft <= this.config.lastCallSeconds) {
      this.lastCallSent = true;
      this.listener.onLastCall();
    }
    // A long frame (e.g. a background tab) may cross more than one phase; carry the overflow.
    let guard = 0;
    while (this.time >= this.duration && guard++ < 8) {
      this.time -= this.duration;
      this.advance();
    }
  }

  /** Developer shortcut: jump to just before arrival. */
  skipToArrival(): void {
    if (this.phase === 'onTheMove') this.time = Math.max(this.time, this.moveDuration - 3);
  }

  private advance(): void {
    const previous = this.phase;
    switch (this.phase) {
      case 'onTheMove':
        this.phase = 'arriving';
        break;
      case 'arriving':
        this.phase = 'stationStop';
        this.stopSerial++;
        this.stationDuration = this.config.stationSeconds;
        this.holdUsed = false;
        this.lastCallSent = false;
        break;
      case 'stationStop':
        this.phase = 'departing';
        break;
      case 'departing':
        this.phase = 'onTheMove';
        this.legsCompleted++;
        this.moveDuration = this.legSeconds(this.stopSerial);
        break;
    }
    this.listener.onPhase(this.phase, previous);
  }
}
