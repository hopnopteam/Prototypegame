import type * as THREE from 'three';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Haptics } from '../audio/Haptics';
import type { Economy } from '../config/economy';
import type { EventBus } from '../core/EventBus';
import type { Rng } from '../core/Rng';
import type { Background } from '../core/Background';
import type { Tweens } from '../core/Tween';
import type { SaveData } from '../save/SaveData';
import type { SaveSystem } from '../save/SaveSystem';
import type { AdService } from '../services/ads';
import type { AnalyticsService } from '../services/analytics';
import type { IapService } from '../services/iap';
import type { RemoteConfig } from '../services/remoteConfig';
import type { AdPolicy } from '../sim/AdPolicy';
import type { Journey } from '../sim/Journey';
import type { Progression } from '../sim/Progression';
import type { TrainMap } from '../sim/TrainMap';
import type { UnlockChain } from '../sim/UnlockChain';
import type { StationPerks } from '../sim/unlockPlan';
import type { Wallet } from '../sim/Wallet';
import type { CashView } from '../world/CashView';
import type { Particles } from '../world/Particles';
import type { Scenery } from '../world/Scenery';
import type { Livery } from '../world/palette';
import type { Stage } from '../world/Stage';
import type { CashPiles } from './CashPiles';
import type { Demand } from './Demand';
import type { Feedback } from './Feedback';
import type { Flow } from './Flow';
import type { GameEvents } from './events';
import type { DoubleChoice } from './GameUi';
import type { Guests } from './Guests';
import type { Guidance } from './Guidance';
import type { Meta } from './Meta';
import type { Player } from './Player';
import type { Press } from './Press';
import type { StaffManager } from './Staff';
import type { Station } from './Station';
import type { Tiles } from './Tiles';
import type { TrainState } from './TrainState';
import type { UiApi } from './UiApi';
import type { ZoneSystem } from './Zones';

/**
 * The shared game context. Systems receive it in their constructor and reach each other through it at
 * runtime; imports here are type-only, so there are no circular module dependencies.
 */
export interface World {
  readonly econ: Economy;
  readonly events: EventBus<GameEvents>;
  readonly save: SaveSystem;
  readonly data: SaveData;
  readonly rng: Rng;
  readonly tweens: Tweens;
  /** Heavy rebuilds spread over frames (a small budget each frame). */
  readonly background: Background;
  readonly stage: Stage;
  readonly scene: THREE.Scene;
  readonly particles: Particles;
  readonly scenery: Scenery;
  readonly cashView: CashView;
  readonly audio: AudioEngine;
  readonly haptics: Haptics;
  readonly analytics: AnalyticsService;
  readonly ads: AdService;
  readonly iap: IapService;
  readonly remote: RemoteConfig;
  readonly adPolicy: AdPolicy;
  readonly map: TrainMap;
  readonly zones: ZoneSystem;
  readonly wallet: Wallet;
  readonly progression: Progression;
  readonly unlocks: UnlockChain;
  readonly journey: Journey;
  readonly train: TrainState;
  readonly cash: CashPiles;
  readonly tiles: Tiles;
  readonly guests: Guests;
  readonly staff: StaffManager;
  readonly station: Station;
  readonly player: Player;
  readonly guidance: Guidance;
  readonly meta: Meta;
  readonly press: Press;
  readonly demand: Demand;
  readonly feedback: Feedback;
  /** What is in play yet: the opening's one-at-a-time purchases and when each later feature joins. */
  readonly flow: Flow;
  readonly ui: UiApi;
  /** Game seconds since the page loaded (scaled by dev time scale). */
  readonly time: number;
  lifetimeSeconds(): number;
  addStars(amount: number, source: string, at?: { x: number; z: number }): void;
  flag(name: string): boolean;
  setFlag(name: string): void;
  ftue(step: string): void;
  /** Multiplier on fares from conductor upgrades, perks and boosts. */
  fareMultiplier(): number;
  tipMultiplier(): number;
  /** What the station upgrades (exterior and marketing) add: tips, fares, passengers, VIPs, stop bonus. */
  stationPerks(): StationPerks;
  /** Grants a reward once, doubled if the player watched an ad or paid gems for it. */
  collectWithDouble(placement: string, choice: DoubleChoice, gemCost: number, grant: (multiplier: number) => void): void;
  /** The livery the train is wearing now (Paint Shop pick or best earned). */
  currentLivery(): Livery;
  scenerySpanChanged(): void;
  /** Spends Rail Miles on a conductor upgrade; false if it is maxed or unaffordable. */
  buyConductorUpgrade(key: 'speed' | 'capacity' | 'fareBonus'): boolean;
}
