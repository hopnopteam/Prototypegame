/**
 * The sound mix. Session 29 (partner: "the sound effects are annoying right now: too loud, unpleasant, and some (like
 * the trumpet fanfares) feel out of place… short, sweet, polished mobile-game sound effects where every sound has a
 * clear job. There is NO background music"): every effect is a soft, short, rounded cue (pops, clicks, marimba and bell
 * notes, light whooshes; nothing brass, buzzing or shrill), synthesised in `audio/synth.ts` and pre-rendered at
 * start-up. Each cue sits on one step of a volume ladder, has its own cooldown and voice limit, and repeated cues vary a
 * little in pitch and level. Tune freely: no code changes needed.
 */

/**
 * Background music (session 29: off). The theme, its fades and its queue are kept behind this one switch; true brings
 * the theme back (and its Music toggle in Settings). Nothing in the game ducks under rewards any more.
 */
export const MUSIC_ENABLED = false;

/** The four steps of the volume ladder, quietest first (partner: "a clear volume ladder"). */
export type CueLevel = 'constant' | 'normal' | 'important' | 'rare';

/**
 * One cue's rules: its step on the ladder; at least `cooldown` seconds between two starts (anything sooner is skipped,
 * so a burst never stacks into noise); at most `voices` copies ringing at once (one more is skipped, never cutting
 * another); `vary: false` for cues that must sound exactly the same each time (the jingles).
 */
export interface CueRule {
  level: CueLevel;
  cooldown?: number;
  voices?: number;
  vary?: boolean;
}

export const AUDIO = {
  /**
   * Bus levels (linear). Session 29: the master 0.85 → 0.6 (about 3 dB down), and the steps of the ladder below take
   * every cue lower again: nothing is ever startling. `sfx` is scaled by the player's SFX volume in Settings.
   */
  mix: { master: 0.6, sfx: 1, music: 0.15, ambience: 0.6 },
  /**
   * The volume ladder (partner: "1 constant sounds… very quiet; 2 normal actions; 3 important moments; 4 rare big
   * moments, still tasteful"). Each cue's own level is multiplied by its step's.
   */
  ladder: { constant: 0.3, normal: 0.55, important: 0.8, rare: 1 } as Record<CueLevel, number>,
  /** Every cue's step, cooldown and voices (the sound map). Missing rules fall back to `defaultCue`. */
  cues: {
    // Gameplay: quiet and frequent.
    step: { level: 'constant', cooldown: 0.12, voices: 2 },
    coin: { level: 'constant', cooldown: 0.05, voices: 3 },
    fill: { level: 'constant', cooldown: 0.12, voices: 1 },
    done: { level: 'constant', cooldown: 0.08, voices: 2 },
    pickup: { level: 'constant', cooldown: 0.06, voices: 2 },
    drop: { level: 'constant', cooldown: 0.06, voices: 2 },
    drip: { level: 'constant', cooldown: 0.06, voices: 2 },
    tick: { level: 'constant', cooldown: 0.3, voices: 1 },
    click: { level: 'constant', cooldown: 0.05, voices: 2 },
    whoosh: { level: 'constant', cooldown: 0.15, voices: 1 },
    tock: { level: 'constant', cooldown: 0.6, voices: 1 },
    flush: { level: 'constant', cooldown: 0.8, voices: 1 },
    pop: { level: 'constant', cooldown: 0.06, voices: 2 },
    // Guests: soft.
    door: { level: 'constant', cooldown: 0.25, voices: 1 },
    bloop: { level: 'constant', cooldown: 0.25, voices: 2 },
    clink: { level: 'normal', cooldown: 0.08, voices: 2 },
    ding: { level: 'normal', cooldown: 0.12, voices: 2 },
    heart: { level: 'constant', cooldown: 0.3, voices: 1 },
    grumble: { level: 'constant', cooldown: 1, voices: 1 },
    aww: { level: 'normal', cooldown: 1, voices: 1 },
    // Unlocks and upgrades: medium.
    unlock: { level: 'normal', voices: 1, vary: false },
    sparkle: { level: 'normal', cooldown: 0.2, voices: 1 },
    staff: { level: 'normal', voices: 1, vary: false },
    ready: { level: 'normal', voices: 1, vary: false },
    chest: { level: 'normal', voices: 1, vary: false },
    cash: { level: 'normal', cooldown: 0.25, voices: 1 },
    chime: { level: 'normal', cooldown: 0.5, voices: 1, vary: false },
    // Train and journey: atmosphere.
    whistle: { level: 'normal', cooldown: 2, voices: 1, vary: false },
    depart: { level: 'normal', cooldown: 2, voices: 1, vary: false },
    bell: { level: 'normal', cooldown: 0.6, voices: 1, vary: false },
    clunk: { level: 'important', voices: 1, vary: false },
    // Reveals and rewards: special, but tasteful.
    reveal: { level: 'important', voices: 1, vary: false },
    perfect: { level: 'important', voices: 1, vary: false },
    miss: { level: 'normal', voices: 1, vary: false },
    levelup: { level: 'important', voices: 1, vary: false },
    ceremony: { level: 'rare', voices: 1, vary: false },
  } as Record<string, CueRule>,
  defaultCue: { level: 'normal', cooldown: 0.05, voices: 2 } as CueRule,
  /** Repeated cues vary by up to this share in pitch and level, so they never sound robotic (partner: 3–5%). */
  variation: { pitch: 0.04, volume: 0.04 },
  /**
   * Cash scooped in a row (partner: "rapid events… must NOT stack into noise… one soft rising tick"): each coin within
   * `gap` seconds of the last climbs `step` in pitch, up to `max` above the first; the cooldown above skips the rest.
   */
  streak: { cue: 'coin', gap: 0.35, step: 0.035, max: 0.6 },
  /**
   * A safety limiter on the output: it only touches peaks above the threshold (several cues landing at once), so the
   * normal mix is never squashed or pumped (partner: "a limiter… so nothing ever clips or spikes").
   */
  limiter: { threshold: -6, knee: 0, ratio: 20, attack: 0.002, release: 0.1 },
  /** Seconds the sound fades in when it first starts (on the first touch: never a jump), and out when paused. */
  startFade: 1.2,
  pauseFade: 0.15,
  /**
   * Reward cues ring out through a soft room tail (a short generated reverb, `wet` of the dry level) instead of
   * stopping dead; `hold` and `release` shape the last note of the longer ones.
   */
  tail: { seconds: 1.4, damping: 0.3, wet: 0.22, hold: 0.22, release: 0.9 },
  /**
   * Big rewards never overlap (partner: "never let two big reward sounds overlap: queue it or skip it"): while one of
   * `cues` rings, another waits its turn (if that comes within `queueWithin` seconds; otherwise it is skipped); the
   * same one again is skipped; a small reward (`rewards`) landing under a big one plays softly (× `duck`), as do the
   * small cues in `quiet` for `holdOff` seconds after a big one starts.
   */
  celebration: {
    cues: ['reveal', 'levelup', 'perfect', 'ceremony'],
    rewards: ['unlock', 'chest', 'staff', 'ready'],
    holdOff: 1.2,
    duck: 0.4,
    quiet: ['ding', 'chest', 'heart', 'unlock', 'chime', 'coin', 'pop', 'sparkle', 'bell', 'staff', 'ready', 'clink'],
    queueWithin: 2.5,
  },
  music: {
    enabled: MUSIC_ENABLED,
    /** Seconds to fade the theme in at the start and out when switched off. */
    fadeIn: 2,
    fadeOut: 0.8,
    /** Low-pass on the music: open by day, warmer and softer at night. */
    dayCutoff: 16000,
    nightCutoff: 3800,
    /** Seconds of look-ahead when queueing the next pass of the loop (longer than the loop: never a gap). */
    lookahead: 52,
  },
  /**
   * The train's atmosphere, kept very low (partner: "keep only ambient train atmosphere (rail clack, soft wind) as part
   * of the SFX mix"): a soft, low "da-dum" per rail joint, faster with speed, and a soft wind that rises with speed.
   */
  clack: { enabled: true, base: 0.022, perSpeed: 0.035 },
  wind: { enabled: true, level: 0.035, cutoff: 420 },
  /**
   * Footsteps (partner: "very soft, only on hard floors, rate follows speed"): one every `stride` metres walked, on the
   * platform and the bare floors of the cheaper refits (carriages refitted to `carpetFromTier` and up are carpeted).
   */
  footsteps: { enabled: true, stride: 0.75, carpetFromTier: 2 },
  /**
   * Session 28: an Android WebView renders web audio in small buffers that run dry when a busy frame holds the processor,
   * and the sound breaks up right then. On Android the context asks for `playback` latency: larger buffers, a little more
   * delay (well under a tenth of a second), no break-ups. Elsewhere `balanced`.
   */
  latency: { android: 'playback', other: 'balanced' } as { android: AudioContextLatencyCategory; other: AudioContextLatencyCategory },
};
