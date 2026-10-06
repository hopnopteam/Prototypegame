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
  /**
   * The train waits at the platform with no clock running (the opening at Millbrook: it leaves once its first
   * passengers are aboard). `release` starts the last few seconds.
   */
  held = false;
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
    /**
     * Where a session opens: on the move, or (a brand-new game, session 17) standing at the first station with
     * the doors open and the clock held, so the first passengers are seen boarding from the platform.
     */
    startPhase: 'onTheMove' | 'departing' | 'stationStop' = 'onTheMove',
  ) {
    this.stationIndex = stationIndex;
    this.legsCompleted = legsCompleted;
    this.stopSerial = stopSerial;
    this.phase = startPhase;
    this.held = startPhase === 'stationStop';
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

  /** How far along the current leg the train is: 0 at a station (and leaving it), 1 pulling in (guests' trips). */
  get travelShare(): number {
    if (this.phase === 'onTheMove') return Math.min(1, this.time / this.moveDuration);
    return this.phase === 'arriving' ? 1 : 0;
  }

  get doorsOpen(): boolean {
    return this.phase === 'stationStop';
  }

  /** Rewarded "Hold the train": adds time to the current stop, once per stop. */
  holdTrain(): boolean {
    if (this.phase !== 'stationStop' || this.holdUsed || this.held) return false;
    this.holdUsed = true;
    this.stationDuration += this.config.holdTheTrainSeconds;
    this.lastCallSent = false;
    return true;
  }

  /** Seconds before departure the last call sounds. */
  get lastCallSeconds(): number {
    return this.config.lastCallSeconds;
  }

  /** The current stop lasts this much longer (the opening waits for its first guest, session 22). */
  extend(seconds: number): void {
    if (this.phase === 'stationStop') this.stationDuration += seconds;
  }

  /** A held stop gets going: the doors close in `seconds` (the last call sounds at once if that is short). */
  release(seconds: number): void {
    if (!this.held) return;
    this.held = false;
    this.time = 0;
    this.stationDuration = seconds;
    this.lastCallSent = false;
  }

  update(dt: number): void {
    if (this.held) return;
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
