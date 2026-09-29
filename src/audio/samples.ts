/**
 * Every sound sample, inlined into the build (base64 MP3). Sources and licences: assets/audio/CREDITS.md;
 * the rendered ones are rebuilt with scripts/audio/build_sounds.py.
 */
import kCoin from '../../assets/audio/k_coin.mp3';
import kPlaceA from '../../assets/audio/k_place_a.mp3';
import kPlaceB from '../../assets/audio/k_place_b.mp3';
import kPlaceC from '../../assets/audio/k_place_c.mp3';
import kPlaceD from '../../assets/audio/k_place_d.mp3';
import rBell from '../../assets/audio/r_bell.mp3';
import rBroom0 from '../../assets/audio/r_broom_0.mp3';
import rBroom1 from '../../assets/audio/r_broom_1.mp3';
import rChime from '../../assets/audio/r_chime.mp3';
import rClack0 from '../../assets/audio/r_clack_0.mp3';
import rClack1 from '../../assets/audio/r_clack_1.mp3';
import rClack2 from '../../assets/audio/r_clack_2.mp3';
import rClunk from '../../assets/audio/r_clunk.mp3';
import rCreak0 from '../../assets/audio/r_creak_0.mp3';
import rCreak1 from '../../assets/audio/r_creak_1.mp3';
import rCreak2 from '../../assets/audio/r_creak_2.mp3';
import rDoor from '../../assets/audio/r_door.mp3';
import rFlush from '../../assets/audio/r_flush.mp3';
import rStep0 from '../../assets/audio/r_step_0.mp3';
import rStep1 from '../../assets/audio/r_step_1.mp3';
import rStep2 from '../../assets/audio/r_step_2.mp3';
import rWhistle from '../../assets/audio/r_whistle.mp3';
import rWhistleShort from '../../assets/audio/r_whistle_short.mp3';
import uiAchievement from '../../assets/audio/ui_achievement.mp3';
import uiBlocked from '../../assets/audio/ui_blocked.mp3';
import uiCheck from '../../assets/audio/ui_check.mp3';
import uiDrop from '../../assets/audio/ui_drop.mp3';
import uiError from '../../assets/audio/ui_error.mp3';
import uiLevelup from '../../assets/audio/ui_levelup.mp3';
import uiNotify from '../../assets/audio/ui_notify.mp3';
import uiPress from '../../assets/audio/ui_press.mp3';
import uiPurchase from '../../assets/audio/ui_purchase.mp3';
import uiReaction from '../../assets/audio/ui_reaction.mp3';
import uiReward from '../../assets/audio/ui_reward.mp3';
import uiSnap from '../../assets/audio/ui_snap.mp3';
import uiStreak from '../../assets/audio/ui_streak.mp3';
import uiSuccess from '../../assets/audio/ui_success.mp3';
import uiSwipe from '../../assets/audio/ui_swipe.mp3';
import uiUnlock from '../../assets/audio/ui_unlock.mp3';

export const SAMPLES = {
  k_coin: kCoin,
  k_place_a: kPlaceA,
  k_place_b: kPlaceB,
  k_place_c: kPlaceC,
  k_place_d: kPlaceD,
  r_bell: rBell,
  r_broom_0: rBroom0,
  r_broom_1: rBroom1,
  r_chime: rChime,
  r_clack_0: rClack0,
  r_clack_1: rClack1,
  r_clack_2: rClack2,
  r_clunk: rClunk,
  r_creak_0: rCreak0,
  r_creak_1: rCreak1,
  r_creak_2: rCreak2,
  r_door: rDoor,
  r_flush: rFlush,
  r_step_0: rStep0,
  r_step_1: rStep1,
  r_step_2: rStep2,
  r_whistle: rWhistle,
  r_whistle_short: rWhistleShort,
  ui_achievement: uiAchievement,
  ui_blocked: uiBlocked,
  ui_check: uiCheck,
  ui_drop: uiDrop,
  ui_error: uiError,
  ui_levelup: uiLevelup,
  ui_notify: uiNotify,
  ui_press: uiPress,
  ui_purchase: uiPurchase,
  ui_reaction: uiReaction,
  ui_reward: uiReward,
  ui_snap: uiSnap,
  ui_streak: uiStreak,
  ui_success: uiSuccess,
  ui_swipe: uiSwipe,
  ui_unlock: uiUnlock,
} as const;

export type SampleId = keyof typeof SAMPLES;
