/**
 * The sound mix. Effects are the warm synthesised set built in AudioEngine (short, round mobile-game cues:
 * no files). Music is the Night Express theme, a sunny lo-fi groove (piano, bass, soft drums, clean guitar)
 * rendered from real instrument recordings by scripts/audio/build_music.py (assets/audio/music_theme.mp3, credits in
 * assets/audio/CREDITS.md). Tune freely: no code changes needed.
 */
export const AUDIO = {
  /** Bus levels (linear). The theme sits at about −37 dBFS RMS: a bed under the cues, never over them. */
  mix: { master: 0.66, sfx: 1, music: 0.12, ambience: 0.5 },
  /**
   * A safety limiter on the output: it only touches peaks above the threshold (several cues landing at
   * once), so the normal mix is never squashed or pumped. Its automatic make-up gain (about +1.7 dB) is
   * why `mix.master` sits a little lower than the old 0.8.
   */
  limiter: { threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.08 },
  /** Seconds to fade everything out when an ad plays or the tab is hidden (never a hard cut). */
  pauseFade: 0.15,
  /** Identical cues closer together than this (seconds) are skipped, so a burst never turns into noise. */
  repeatGap: 0.025,
  /** At most this many copies of one cue ring at once; one more is skipped rather than cutting another. */
  voices: 4,
  voicesByCue: { coin: 6, pop: 5, pickup: 5 } as Partial<Record<string, number>>,
  /**
   * Celebration and reward cues ring out instead of stopping dead: their last chord holds, then fades over
   * `release` seconds, through a soft room tail (a short generated reverb, `wet` of the dry level).
   */
  tail: { seconds: 1.6, damping: 0.3, wet: 0.3, hold: 0.28, release: 1.15 },
  /**
   * A celebration owns the moment: for `holdOff` seconds after one of `cues` starts, the small cues in
   * `quiet` play softer (× `duck`) so nothing steps on the fanfare. Session 16: softer, never skipped; skipping
   * them meant coins scooped or a tile bought just after an upgrade made no sound at all, which read as the
   * audio cutting out.
   */
  celebration: { cues: ['fanfare', 'levelup'], holdOff: 1.4, duck: 0.35, quiet: ['ding', 'chest', 'heart', 'unlock', 'chime', 'coin', 'pop', 'sparkle', 'bell'] },
  music: {
    /** Seconds to fade the theme in at the start (and after it is switched back on) and out when switched off. */
    fadeIn: 2.5,
    fadeOut: 0.8,
    /** Low-pass on the music: open by day, warmer and softer at night. */
    dayCutoff: 16000,
    nightCutoff: 3800,
    /** Seconds of look-ahead when queueing the next pass of the loop. */
    lookahead: 1,
  },
  /** Rail clack: a "da-dum" pair per rail joint, faster and louder with speed (the session 8 sound). */
  clack: { base: 0.05, perSpeed: 0.09 },
};
