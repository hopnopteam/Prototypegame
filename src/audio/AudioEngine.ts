import { AUDIO } from '../config/audio';
import { log } from '../core/log';
import { MUSIC } from './music';
import { makeNoise, makeRoom, Synth } from './synth';

/**
 * Every cue (session 29: the sound map; the brass fanfare, the shrill whistle, the ticket punch, the scrub and the
 * plain "soft" are gone; see `AUDIO.cues` for each one's step on the volume ladder).
 */
export type Sfx =
  // Gameplay: quiet and frequent.
  | 'step' | 'coin' | 'fill' | 'done' | 'pickup' | 'drop' | 'drip' | 'pop' | 'tick' | 'click' | 'whoosh' | 'tock' | 'flush'
  // Guests.
  | 'door' | 'bloop' | 'clink' | 'ding' | 'heart' | 'grumble' | 'aww'
  // Unlocks, upgrades and rewards.
  | 'unlock' | 'sparkle' | 'staff' | 'ready' | 'chest' | 'cash' | 'chime'
  // The train and the journey.
  | 'whistle' | 'depart' | 'bell' | 'clunk'
  // Reveals and the big moments.
  | 'reveal' | 'perfect' | 'miss' | 'levelup' | 'ceremony';

/** Every cue, so the bank renders them all (a Record, so a new cue cannot be forgotten). */
const CUES: Record<Sfx, true> = {
  step: true, coin: true, fill: true, done: true, pickup: true, drop: true, drip: true, pop: true, tick: true, click: true, whoosh: true, tock: true, flush: true,
  door: true, bloop: true, clink: true, ding: true, heart: true, grumble: true, aww: true,
  unlock: true, sparkle: true, staff: true, ready: true, chest: true, cash: true, chime: true,
  whistle: true, depart: true, bell: true, clunk: true,
  reveal: true, perfect: true, miss: true, levelup: true, ceremony: true,
};
const BANK_CUES: (Sfx | 'clack')[] = [...(Object.keys(CUES) as Sfx[]), ...(AUDIO.clack.enabled ? ['clack' as const] : [])];

/** An Android phone, in the app or a browser (its web audio wants larger buffers, see `AUDIO.latency`). */
export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Cuts a rendered cue where its tail has died away (below −80 dB), so a buffer is no longer than its sound. */
function trimSilence(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  let last = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i]) > 1e-4) {
        last = i;
        break;
      }
    }
  }
  const length = Math.min(buffer.length, last + 64);
  if (length >= buffer.length) return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(0, length), c);
  return out;
}

/**
 * Every sound in the game. Effects are synthesised with WebAudio (short, warm cues: no files, work
 * offline), each one allowed to ring to its end: a cue already ringing its maximum number of copies is
 * skipped rather than cutting one short, and a transparent limiter only catches peaks when several land at
 * once. Music is the Night Express theme, queued pass after pass so its tail rings into the next pass (a
 * seamless loop whatever the decoder). Silent until the first touch (browsers require a gesture).
 *
 * Session 18 (owner: "the game music doesn't kick in until a few minutes in"): the context used to be created
 * and resumed once, on the first `pointerdown`. A touch's pointerdown is not a gesture that may start audio
 * (only pointerup / touchend / click / keydown are), so on phones the context stayed suspended until some later
 * button tap happened to resume it. Now `prepare()` builds the graph and decodes the theme at boot (a suspended
 * context may decode), and `unlock()` is called on every qualifying gesture until the context is running, so
 * the theme fades in on the very first tap.
 *
 * Session 19 (owner: "music getting cut off is non-negotiable"): three ways the music could drop out, all fixed
 * at the root. (1) The next pass was queued only a second ahead, so any stall longer than that at a loop
 * boundary (a slow frame on a phone, or Android halting the page's frames while the notification shade is
 * down, with the audio still running) found the queue empty and restarted the theme from the top with a fade:
 * now the next whole pass is always queued (`music.lookahead` is longer than the loop). (2) Coming back from the
 * background, a resume the browser refused (iOS wants a gesture after an interruption) left the master fade
 * at zero for good: now any gesture and any return to `running` restore it (`statechange`). (3) The mix sat
 * about 20 dB under a phone game's, so on a phone speaker the quiet bars vanished under the clack: the music
 * and master levels were raised (`AUDIO.mix`). The context also asks for `balanced` latency (larger audio
 * buffers), so a busy main thread on a weak phone cannot starve the audio thread into crackles.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private ambience!: GainNode;
  /** The soft wind that rises with the train's speed (session 29), and the player's SFX volume (0–1, Settings). */
  private wind: GainNode | null = null;
  private volume = 1;
  /** The cash streak (session 29): when the last coin of a run sounded, and how many have so far. */
  private streakAt = -1;
  private streakCount = 0;
  /** Send into the room tail that celebration and reward cues ring out through. */
  private tail!: GainNode;
  private noiseBuffer!: AudioBuffer;
  /** Live synthesis on the game's context: only used for cues the bank could not render. */
  private live!: Synth;
  private roomWired = false;
  /** Every cue pre-rendered at start-up (session 26): the buffer, tail included, and when its dry part ends. */
  private readonly bank = new Map<Sfx | 'clack', { buffer: AudioBuffer; dry: number }>();
  private banked = false;
  private bankReady: Promise<void> = Promise.resolve();
  private soundOn = true;
  private musicOn = AUDIO.music.enabled;
  /**
   * The theme waits for the game to begin (session 26, owner: "the background music doesn't kick in at the start…
   * start with fading in for like 2 seconds, then gameplay and sound properly synced"): the loading screen ends with
   * `startMusic()`, on the same tap that starts play, so the music and the game begin together.
   */
  private musicHeld = true;
  private paused = false;
  private suspendTimer = 0;
  /**
   * The master is faded out and must be faded back in once the context runs: after a pause, and at the very start
   * (session 29: the sound starts quietly on the first touch, over `AUDIO.startFade`, never with a jump).
   */
  private faded = true;
  private firstStart = true;
  private speed = 0;
  private clackTimer = 0;
  private crowd: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private night = 0;
  private nightApplied = -1;
  private lastPlay = new Map<Sfx, number>();
  /** End times of the copies of each cue still ringing. */
  private readonly ringing = new Map<Sfx, number[]>();
  /** Until this audio time a celebration owns the moment (small cues stay quiet). */
  private celebrationUntil = 0;
  /**
   * When the reward ringing (or queued: a jingle, or a purchase or prize cue) has rung out its main part, and whether
   * it is a jingle (fix list 7.1, session 27: rewards never overlap).
   */
  private rewardUntil = 0;
  private rewardIsJingle = false;
  private theme: AudioBuffer | null = null;
  private nextPassAt = 0;
  private readonly passes: { source: AudioBufferSourceNode; gain: GainNode; at: number }[] = [];

  /** Resolves once the theme is decoded and every cue is rendered (the loading screen waits for it). */
  ready(): Promise<void> {
    return this.bankReady;
  }

  /** For audits: whether the cues play from the pre-rendered bank (false means the live-synth fallback). */
  get prerendered(): boolean {
    return this.banked;
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** For audits: the mix (the ladder, each cue's rules). */
  get config(): typeof AUDIO {
    return AUDIO;
  }

  /** For audits: whether this build has a theme at all (session 28: the music is switched off in config). */
  get hasMusic(): boolean {
    return AUDIO.music.enabled;
  }

  /**
   * Builds the audio graph and starts decoding the theme before any gesture (the context waits suspended), so
   * the music is ready the moment audio is allowed. Safe to call more than once.
   */
  prepare(): void {
    try {
      this.ensureContext();
    } catch (error) {
      log.warn('Audio', 'WebAudio unavailable', error);
    }
  }

  /**
   * Call from a user gesture (pointerup, touchend, click, keydown): resumes the context. Safe to call repeatedly;
   * returns true once audio is running.
   */
  unlock(): boolean {
    try {
      this.ensureContext();
      const ctx = this.ctx;
      if (!ctx) return false;
      if (this.paused) return false;
      if (ctx.state !== 'running') {
        // The theme starts the moment the context runs, not on the game's next frame (a busy start-up can hold
        // that frame back for seconds on a slow phone).
        void ctx.resume().then(() => {
          this.restoreMaster();
          if (this.musicOn && !this.musicHeld) this.queueTheme(ctx);
        }, () => undefined);
        // Older iOS also wants a sound started inside the gesture: one silent sample.
        const kick = ctx.createBufferSource();
        kick.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        kick.connect(ctx.destination);
        kick.start(0);
      } else {
        this.restoreMaster();
        if (this.musicOn && !this.musicHeld) this.queueTheme(ctx);
      }
      return ctx.state === 'running';
    } catch (error) {
      log.warn('Audio', 'WebAudio unavailable', error);
      return false;
    }
  }

  /** The context and its graph, built once (suspended until a gesture resumes it). */
  private ensureContext(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // Balanced latency: a little larger audio buffer, so a busy main thread never starves the audio thread; on
      // Android `playback`, larger still (session 28: its small buffers broke up the reward cues on busy frames).
      const ctx = new Ctor({ latencyHint: isAndroid() ? AUDIO.latency.android : AUDIO.latency.other });
      this.ctx = ctx;
      // Back to running from anywhere (a gesture, the browser's own resume after an interruption): fade the
      // master back in if a pause left it down. Interrupted or suspended while we did not ask for it (a phone
      // call, a notification sound, a Bluetooth switch): ask to resume; a gesture retries if that is refused.
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') this.restoreMaster();
        else if (!this.paused && ctx.state !== 'closed' && !document.hidden) void ctx.resume().catch(() => undefined);
      });
      const l = AUDIO.limiter;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = l.threshold;
      limiter.knee.value = l.knee;
      limiter.ratio.value = l.ratio;
      limiter.attack.value = l.attack;
      limiter.release.value = l.release;
      this.master = ctx.createGain();
      // Silent until the first touch, then a short fade in (`restoreMaster`).
      this.master.gain.value = 0;
      this.master.connect(limiter).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = AUDIO.music.dayCutoff;
      this.musicFilter.Q.value = 0.5;
      this.musicBus = ctx.createGain();
      this.musicFilter.connect(this.musicBus).connect(this.master);
      this.ambience = ctx.createGain();
      this.ambience.connect(this.master);
      // The live synth's room is wired only if a cue ever has to be synthesised live (session 28): every cue is
      // pre-rendered with its room baked in, and an idle convolver in the graph is still work for a phone's audio thread.
      this.tail = ctx.createGain();
      this.tail.gain.value = AUDIO.tail.wet;
      this.noiseBuffer = makeNoise(ctx);
      this.live = new Synth(ctx, this.sfx, this.tail, this.noiseBuffer);
      this.applyToggles();
      // The theme is decoded only when there is music to play (session 28: switched off by `music.enabled`).
      this.bankReady = Promise.all([AUDIO.music.enabled ? this.decodeTheme(ctx) : Promise.resolve(), this.renderBank(ctx.sampleRate)]).then(() => undefined);
    }
  }

  setEnabled(sound: boolean, music: boolean): void {
    const musicWasOn = this.musicOn;
    this.soundOn = sound;
    this.musicOn = music && AUDIO.music.enabled;
    this.applyToggles();
    if (musicWasOn && !music) this.stopTheme();
  }

  /** Fades everything out (not a hard cut) while an ad plays or the tab is hidden, and back in after. */
  setPaused(paused: boolean): void {
    const ctx = this.ctx;
    if (!ctx || paused === this.paused) return;
    this.paused = paused;
    const t = ctx.currentTime;
    const fade = AUDIO.pauseFade;
    window.clearTimeout(this.suspendTimer);
    if (paused) {
      this.faded = true;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + fade);
      this.suspendTimer = window.setTimeout(() => {
        if (this.paused) void ctx.suspend();
      }, fade * 1000 + 40);
    } else if (ctx.state === 'running') {
      this.restoreMaster();
    } else {
      // If the browser refuses (no gesture yet after an interruption), the next tap resumes and restores.
      void ctx.resume().then(() => this.restoreMaster(), () => undefined);
    }
  }

  /** Fades the master back up after a pause, once (whatever path brought the context back to running). */
  private restoreMaster(): void {
    const ctx = this.ctx;
    if (!ctx || this.paused || !this.faded || ctx.state !== 'running') return;
    this.faded = false;
    const now = ctx.currentTime;
    const fade = this.firstStart ? AUDIO.startFade : AUDIO.pauseFade;
    this.firstStart = false;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(AUDIO.mix.master, now + fade);
  }

  /** The player's SFX volume (session 29: Settings' slider, 0–1, saved). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyToggles();
  }

  /** For tools and audits: the master's level right now. */
  get masterLevel(): number {
    return this.master ? this.master.gain.value : 0;
  }

  setTrainSpeed(fraction: number): void {
    this.speed = Math.max(0, Math.min(1, fraction));
  }

  setNight(amount: number): void {
    this.night = amount;
  }

  setStationAmbience(on: boolean): void {
    if (!this.ctx) return;
    if (on && !this.crowd) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 1.2);
      source.connect(filter).connect(gain).connect(this.ambience);
      source.start();
      this.crowd = source;
      this.crowdGain = gain;
    } else if (!on && this.crowd && this.crowdGain) {
      const t = this.ctx.currentTime;
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
      this.crowdGain.gain.linearRampToValueAtTime(0, t + 1.0);
      this.crowd.stop(t + 1.1);
      this.crowd = null;
      this.crowdGain = null;
    }
  }

  /**
   * Plays a cue. Session 29: at its step on the volume ladder, at most one start per its cooldown and its voices at
   * once (anything more is skipped, never cutting a sound), a little random pitch and level on repeated cues, and cash
   * in a row climbing as one soft rising tick. Big rewards never overlap (they queue or are skipped).
   */
  play(name: Sfx, options: { pitch?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.soundOn || ctx.state !== 'running' || this.paused) return;
    const rule = AUDIO.cues[name] ?? AUDIO.defaultCue;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < (rule.cooldown ?? 0.025)) return;
    // Never cut a sound short: if this cue is already ringing enough copies, skip the new one.
    let ends = this.ringing.get(name);
    if (!ends) this.ringing.set(name, (ends = []));
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
    if (ends.length >= (rule.voices ?? 2)) return;
    let volume = (options.volume ?? 1) * AUDIO.ladder[rule.level];
    let pitch = options.pitch ?? 1;
    const streak = AUDIO.streak;
    if (name === streak.cue) {
      this.streakCount = now - this.streakAt < streak.gap ? this.streakCount + 1 : 0;
      this.streakAt = now;
      pitch *= 1 + Math.min(streak.max, this.streakCount * streak.step);
    }
    if (rule.vary !== false) {
      // Audio only (never the game's seeded randomness): the simulation is unchanged.
      pitch *= 1 + (Math.random() * 2 - 1) * AUDIO.variation.pitch;
      volume *= 1 + (Math.random() * 2 - 1) * AUDIO.variation.volume;
    }
    let start = now + 0.005;
    const c = AUDIO.celebration;
    const isJingle = c.cues.includes(name);
    const isReward = isJingle || c.rewards.includes(name);
    // Never one reward over another (session 27): the same one again while it still rings (or waits its turn) is
    // dropped; a big one waits for the reward ringing to finish; a small reward under a big one plays softly below.
    let leads = isReward;
    if (isReward && ends.length > 0) return;
    if (isReward && now < this.rewardUntil) {
      if (isJingle || !this.rewardIsJingle) {
        if (this.rewardUntil - now > c.queueWithin) return;
        start = this.rewardUntil + 0.08;
      } else leads = false;
    }
    if (isJingle) this.celebrationUntil = Math.max(this.celebrationUntil, start + c.holdOff);
    else if (now < this.celebrationUntil && c.quiet.includes(name)) volume *= c.duck;
    this.lastPlay.set(name, now);
    const end = this.bank.has(name) ? this.playBuffer(name, start, pitch, volume, this.sfx) : this.playLive(name, start, pitch, volume);
    ends.push(end);
    if (leads) {
      this.rewardUntil = end;
      this.rewardIsJingle = isJingle;
    }
  }

  /** A footstep (session 29): very soft, at the given pitch (the caller paces them by distance walked). */
  step(pitch = 1): void {
    if (AUDIO.footsteps.enabled) this.play('step', { pitch });
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.updateWind(ctx);
    // Rail clack: a "da-dum" pair each rail joint; faster and louder with speed.
    if (this.soundOn && AUDIO.clack.enabled && this.speed > 0.05) {
      this.clackTimer -= dt;
      if (this.clackTimer <= 0) {
        const gap = 0.16 / (0.4 + this.speed);
        const volume = AUDIO.clack.base + this.speed * AUDIO.clack.perSpeed;
        const t = ctx.currentTime + 0.01;
        this.knock(t, volume);
        this.knock(t + gap, volume * 0.8);
        this.clackTimer = 0.7 / (0.25 + this.speed * 1.1);
      }
    }
    if (Math.abs(this.night - this.nightApplied) > 0.02) {
      this.nightApplied = this.night;
      const m = AUDIO.music;
      // Log-space blend so the change sounds even.
      const cutoff = m.dayCutoff * Math.pow(m.nightCutoff / m.dayCutoff, Math.min(1, Math.max(0, this.night)));
      this.musicFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 1.5);
    }
    if (this.musicOn && !this.musicHeld) this.queueTheme(ctx);
  }

  /** The soft wind of the moving train (session 29): a low, filtered rush that rises and falls with the speed. */
  private updateWind(ctx: AudioContext): void {
    const cfg = AUDIO.wind;
    if (!cfg.enabled) return;
    if (!this.wind) {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cfg.cutoff;
      this.wind = ctx.createGain();
      this.wind.gain.value = 0;
      source.connect(filter).connect(this.wind).connect(this.ambience);
      source.start();
    }
    this.wind.gain.setTargetAtTime(cfg.level * this.speed, ctx.currentTime, 0.8);
  }

  /** The game has begun: the theme fades in from the top (now, or the moment audio is allowed to run). */
  startMusic(): void {
    this.musicHeld = false;
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running' && this.musicOn) this.queueTheme(ctx);
  }

  /**
   * Tries to start audio without a gesture (the app's web view allows it; a browser tab usually does not). Resolves
   * true if the context is running within `waitMs`.
   */
  async tryStart(waitMs = 300): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    const resumed = ctx.resume().then(() => true, () => false);
    const late = new Promise<boolean>((done) => setTimeout(() => done(false), waitMs));
    return (await Promise.race([resumed, late])) && (ctx.state as AudioContextState) === 'running';
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.soundOn ? AUDIO.mix.sfx * this.volume : 0;
    this.ambience.gain.value = this.soundOn ? AUDIO.mix.ambience * this.volume : 0;
    this.musicBus.gain.value = this.musicOn ? AUDIO.mix.music : 0;
  }

  // ─── Music ──────────────────────────────────────────────────────────────────

  private async decodeTheme(ctx: AudioContext): Promise<void> {
    try {
      const text = atob(MUSIC.data);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      // The callback form too: older Safari never resolves the promise form.
      this.theme = await new Promise<AudioBuffer>((done, fail) => {
        const pending = ctx.decodeAudioData(bytes.buffer, done, fail) as Promise<AudioBuffer> | undefined;
        pending?.then(done, fail);
      });
    } catch (error) {
      log.warn('Audio', 'could not decode the music', error);
    }
  }

  /**
   * Each pass starts exactly one loop length after the last and plays on past it, so its last notes and
   * reverb ring into the next pass, just as they would in a continuous performance.
   */
  private queueTheme(ctx: AudioContext): void {
    const theme = this.theme;
    if (!theme) return;
    const now = ctx.currentTime;
    // Starting fresh (first touch, or switched back on): begin at the top with a fade-in.
    let fadeIn = this.nextPassAt < now;
    if (fadeIn) this.nextPassAt = now + 0.05;
    while (this.nextPassAt < now + AUDIO.music.lookahead) {
      const at = this.nextPassAt;
      const source = ctx.createBufferSource();
      source.buffer = theme;
      const gain = ctx.createGain();
      if (fadeIn) {
        // A linear ramp is audible within a few hundred milliseconds (an exponential one from silence stays
        // inaudible for most of its length, so the theme seemed not to start).
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(1, at + AUDIO.music.fadeIn);
        fadeIn = false;
      }
      source.connect(gain).connect(this.musicFilter);
      const pass = { source, gain, at };
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        const i = this.passes.indexOf(pass);
        if (i >= 0) this.passes.splice(i, 1);
      };
      source.start(at);
      this.passes.push(pass);
      this.nextPassAt = at + MUSIC.loopSeconds;
    }
  }

  private stopTheme(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const { source, gain } of this.passes) {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + AUDIO.music.fadeOut);
      source.stop(t + AUDIO.music.fadeOut + 0.05);
    }
    this.nextPassAt = 0;
  }

  /** One rail-joint knock into the ambience bus (pre-rendered when the bank is ready). */
  private knock(t: number, volume: number): void {
    if (this.bank.has('clack')) this.playBuffer('clack', t, 1, volume, this.ambience);
    else new Synth(this.ctx!, this.ambience, this.ambience, this.noiseBuffer).clack(t, volume);
  }

  // ─── The cue bank ───────────────────────────────────────────────────────────

  /**
   * Renders every cue once, offline, into a buffer (its room tail baked in), so playing a cue is one buffer source
   * on the audio thread instead of a live synth (session 26). Runs at start-up, behind the loading screen.
   */
  private async renderBank(sampleRate: number): Promise<void> {
    const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Offline) return;
    try {
      const measure = new Offline(1, 1, sampleRate);
      const noise = makeNoise(measure);
      const room = makeRoom(measure);
      const dummy = measure.createGain();
      const sizing = new Synth(measure, dummy, dummy, noise);
      const jobs = BANK_CUES.map(async (name) => {
        // How long the dry cue runs (measured by building it on a silent context), then render it with its tail.
        const dryEnd = name === 'clack' ? sizing.clack(0, 1) : sizing.build(name, 0);
        const seconds = dryEnd + AUDIO.tail.seconds + 0.06;
        const ctx = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
        const reverb = ctx.createConvolver();
        reverb.buffer = room;
        const send = ctx.createGain();
        send.gain.value = AUDIO.tail.wet;
        send.connect(reverb).connect(ctx.destination);
        const synth = new Synth(ctx, ctx.destination, send, noise);
        if (name === 'clack') synth.clack(0.005, 1);
        else synth.build(name, 0.005);
        try {
          const rendered = await ctx.startRendering();
          this.bank.set(name, { buffer: trimSilence(ctx, rendered), dry: dryEnd + 0.005 });
        } catch (error) {
          // One cue that will not render is synthesised live; the rest still play from the bank (session 28).
          log.warn('Audio', `could not pre-render ${name}; synthesising it live`, error);
        }
      });
      await Promise.all(jobs);
      this.banked = this.bank.size > 0;
    } catch (error) {
      // Any failure leaves the live synth in charge, exactly as before.
      this.bank.clear();
      log.warn('Audio', 'could not pre-render the cues; synthesising live', error);
    }
  }

  /** The fallback for a cue the bank does not hold: synthesised live through the room, wired on first use. */
  private playLive(name: Sfx, start: number, pitch: number, volume: number): number {
    if (!this.roomWired && this.ctx) {
      const room = this.ctx.createConvolver();
      room.buffer = makeRoom(this.ctx);
      this.tail.connect(room).connect(this.sfx);
      this.roomWired = true;
    }
    return this.live.build(name, start, pitch, volume);
  }

  /** One pre-rendered cue on the audio clock; returns when its dry part ends (the tail rings on past it). */
  private playBuffer(name: Sfx | 'clack', start: number, pitch: number, volume: number, out: AudioNode): number {
    const ctx = this.ctx!;
    const cue = this.bank.get(name)!;
    const source = ctx.createBufferSource();
    source.buffer = cue.buffer;
    if (pitch !== 1) source.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(out);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(start);
    return start + cue.dry / pitch;
  }
}
