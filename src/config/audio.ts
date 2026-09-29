import type { SampleId } from '../audio/samples';

/**
 * The sound mix: which sample(s) each game cue plays and how. Every cue plays to the end of its natural
 * tail (nothing is ever stopped early); a cue that is already ringing `voices` times, or was started less
 * than `gap` seconds ago, simply does not start again. Tune freely: no code changes needed.
 */
export interface CueDef {
  /** One is picked at random each time, so repeats vary. */
  samples: SampleId[];
  /** Linear gain before the sfx bus (samples are normalised to −1 dBFS). */
  gain: number;
  /** ± random pitch spread (fraction), so a burst never sounds machine-gunned. */
  jitter?: number;
  /** Seconds before this cue may start again. */
  gap?: number;
  /** At most this many copies ring at once. */
  voices?: number;
  /** How strongly a caller's pitch request bends the sample (1 = exactly, 0 = ignored). */
  pitchScale?: number;
}

export type CueName =
  | 'pop' | 'pickup' | 'drop' | 'cash' | 'coin' | 'bell' | 'ding' | 'scrub' | 'sparkle' | 'clunk'
  | 'whistle' | 'whistleShort' | 'fanfare' | 'levelup' | 'punch' | 'whoosh' | 'click' | 'chime' | 'star'
  | 'soft' | 'door' | 'chest' | 'unlock' | 'heart' | 'flush' | 'miss' | 'grumble' | 'streak' | 'step' | 'creak';

export const AUDIO = {
  /** Bus levels. Everything passes a gentle compressor so stacked sounds never clip. */
  mix: { master: 0.9, sfx: 1, music: 0.2, ambience: 0.6 },
  compressor: { threshold: -16, knee: 10, ratio: 4, attack: 0.004, release: 0.25 },
  /** Fade when the game pauses for an ad or the tab hides (seconds), instead of cutting off mid-sound. */
  pauseFade: 0.15,
  cues: {
    pop: { samples: ['k_place_a', 'k_place_b', 'k_place_c', 'k_place_d'], gain: 0.5, jitter: 0.06, gap: 0.04, voices: 4 },
    pickup: { samples: ['ui_snap'], gain: 0.35, jitter: 0.04, gap: 0.05, voices: 3, pitchScale: 0.5 },
    drop: { samples: ['ui_drop'], gain: 0.35, jitter: 0.05, gap: 0.05, voices: 3, pitchScale: 0.6 },
    cash: { samples: ['ui_purchase'], gain: 0.5, gap: 0.12, voices: 2, pitchScale: 0.5 },
    coin: { samples: ['k_coin'], gain: 0.42, jitter: 0.02, gap: 0.035, voices: 6, pitchScale: 0.35 },
    bell: { samples: ['r_bell'], gain: 0.4, gap: 0.3, voices: 2, pitchScale: 0.5 },
    ding: { samples: ['ui_success'], gain: 0.45, gap: 0.2, voices: 2 },
    scrub: { samples: ['r_broom_0', 'r_broom_1'], gain: 0.5, jitter: 0.08, gap: 0.12, voices: 2, pitchScale: 0.4 },
    sparkle: { samples: ['ui_check'], gain: 0.4, jitter: 0.03, gap: 0.08, voices: 3, pitchScale: 0.4 },
    clunk: { samples: ['r_clunk'], gain: 0.8, gap: 0.3, voices: 2 },
    whistle: { samples: ['r_whistle'], gain: 0.55, gap: 1, voices: 1 },
    whistleShort: { samples: ['r_whistle_short'], gain: 0.5, gap: 0.5, voices: 1 },
    fanfare: { samples: ['ui_achievement'], gain: 0.55, gap: 0.5, voices: 1 },
    levelup: { samples: ['ui_levelup'], gain: 0.6, gap: 0.5, voices: 1 },
    punch: { samples: ['k_place_a', 'k_place_c'], gain: 0.45, jitter: 0.05, gap: 0.05, voices: 3 },
    whoosh: { samples: ['ui_swipe'], gain: 0.45, gap: 0.15, voices: 2 },
    click: { samples: ['ui_press'], gain: 0.4, gap: 0.04, voices: 2 },
    chime: { samples: ['r_chime'], gain: 0.45, gap: 2, voices: 1 },
    star: { samples: ['ui_check'], gain: 0.2, jitter: 0.03, gap: 0.06, voices: 3, pitchScale: 0.5 },
    soft: { samples: ['ui_notify'], gain: 0.35, gap: 0.3, voices: 2 },
    door: { samples: ['r_door'], gain: 0.45, jitter: 0.05, gap: 0.15, voices: 3, pitchScale: 0.3 },
    chest: { samples: ['ui_reward'], gain: 0.55, gap: 0.3, voices: 1 },
    unlock: { samples: ['ui_unlock'], gain: 0.55, gap: 0.15, voices: 2 },
    heart: { samples: ['ui_reaction'], gain: 0.45, gap: 0.15, voices: 2 },
    flush: { samples: ['r_flush'], gain: 0.35, gap: 0.5, voices: 2 },
    miss: { samples: ['ui_error'], gain: 0.35, gap: 0.5, voices: 1 },
    grumble: { samples: ['ui_blocked'], gain: 0.3, gap: 0.5, voices: 1 },
    streak: { samples: ['ui_streak'], gain: 0.45, gap: 0.3, voices: 1 },
    // The conductor's footsteps (quiet: felt more than heard), and an old board creaking now and then.
    step: { samples: ['r_step_0', 'r_step_1', 'r_step_2'], gain: 0.16, jitter: 0.06, gap: 0.12, voices: 2 },
    creak: { samples: ['r_creak_0', 'r_creak_1', 'r_creak_2'], gain: 0.22, jitter: 0.05, gap: 1.5, voices: 1 },
  } as Record<CueName, CueDef>,
  /** Rail joints: a pair of knocks per joint, closer together and louder as the train speeds up. */
  clack: { samples: ['r_clack_0', 'r_clack_1', 'r_clack_2'] as SampleId[], gain: 0.55, jitter: 0.04 },
};
