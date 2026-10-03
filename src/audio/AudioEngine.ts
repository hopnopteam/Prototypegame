import { AUDIO } from '../config/audio';
import { log } from '../core/log';
import { MUSIC } from './music';

export type Sfx =
  | 'pop' | 'pickup' | 'drop' | 'cash' | 'coin' | 'bell' | 'ding' | 'scrub' | 'sparkle' | 'clunk'
  | 'whistle' | 'whistleShort' | 'fanfare' | 'levelup' | 'punch' | 'whoosh' | 'click' | 'chime'
  | 'soft' | 'door' | 'chest' | 'unlock' | 'heart' | 'flush' | 'miss' | 'grumble';

/**
 * Every sound in the game. Effects are synthesised with WebAudio (short, warm cues: no files, work
 * offline), each one allowed to ring to its end: a cue already ringing its maximum number of copies is
 * skipped rather than cutting one short, and a transparent limiter only catches peaks when several land at
 * once. Music is the Night Express theme, queued pass after pass so its tail rings into the next pass (a
 * seamless loop whatever the decoder). Silent until the first touch (browsers require a gesture).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private ambience!: GainNode;
  /** Send into the room tail that celebration and reward cues ring out through. */
  private tail!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private soundOn = true;
  private musicOn = true;
  private paused = false;
  private suspendTimer = 0;
  private speed = 0;
  private clackTimer = 0;
  private crowd: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private night = 0;
  private nightApplied = -1;
  private lastPlay = new Map<Sfx, number>();
  /** End times of the copies of each cue still ringing. */
  private readonly ringing = new Map<Sfx, number[]>();
  /** Latest end time scheduled by the cue being built. */
  private cueEnd = 0;
  /** Nesting of play() calls (a cue that plays another, like the level-up's sparkle). */
  private depth = 0;
  /** Until this audio time a celebration owns the moment (small cues stay quiet). */
  private celebrationUntil = 0;
  private theme: AudioBuffer | null = null;
  private nextPassAt = 0;
  private readonly passes: { source: AudioBufferSourceNode; gain: GainNode; at: number }[] = [];

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        const l = AUDIO.limiter;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = l.threshold;
        limiter.knee.value = l.knee;
        limiter.ratio.value = l.ratio;
        limiter.attack.value = l.attack;
        limiter.release.value = l.release;
        this.master = ctx.createGain();
        this.master.gain.value = AUDIO.mix.master;
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
        const room = ctx.createConvolver();
        room.buffer = this.makeRoom();
        this.tail = ctx.createGain();
        this.tail.gain.value = AUDIO.tail.wet;
        this.tail.connect(room).connect(this.sfx);
        this.noiseBuffer = this.makeNoise();
        this.applyToggles();
        void this.decodeTheme(ctx);
      }
      if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
    } catch (error) {
      log.warn('Audio', 'WebAudio unavailable', error);
    }
  }

  setEnabled(sound: boolean, music: boolean): void {
    const musicWasOn = this.musicOn;
    this.soundOn = sound;
    this.musicOn = music;
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
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    if (paused) {
      this.master.gain.linearRampToValueAtTime(0, t + fade);
      this.suspendTimer = window.setTimeout(() => void ctx.suspend(), fade * 1000 + 40);
    } else {
      void ctx.resume().then(() => {
        const now = ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(0, now);
        this.master.gain.linearRampToValueAtTime(AUDIO.mix.master, now + fade);
      });
    }
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

  play(name: Sfx, options: { pitch?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.soundOn || ctx.state !== 'running' || this.paused) return;
    // Rate-limit identical sounds so a burst of pickups never becomes noise.
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < AUDIO.repeatGap) return;
    // Never cut a sound short: if this cue is already ringing enough copies, skip the new one.
    let ends = this.ringing.get(name);
    if (!ends) this.ringing.set(name, (ends = []));
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= now) ends.splice(i, 1);
    if (ends.length >= (AUDIO.voicesByCue[name] ?? AUDIO.voices)) return;
    let volume = options.volume ?? 1;
    if (this.depth === 0) {
      const c = AUDIO.celebration;
      if (c.cues.includes(name)) this.celebrationUntil = now + c.holdOff;
      else if (now < this.celebrationUntil && c.quiet.includes(name)) volume *= c.duck;
    }
    this.lastPlay.set(name, now);
    const outerEnd = this.cueEnd;
    this.cueEnd = now;
    this.depth++;
    try {
      this.build(name, now + 0.005, options.pitch ?? 1, volume);
    } finally {
      this.depth--;
    }
    ends.push(this.cueEnd);
    this.cueEnd = Math.max(outerEnd, this.cueEnd);
  }

  /** The cue recipes (unchanged from the set players liked; tuned by ear against mobile arcade games). */
  private build(name: Sfx, t: number, p: number, v: number): void {
    switch (name) {
      case 'pop':
        this.tone(t, 520 * p, 1250 * p, 0.09, 'sine', 0.35 * v);
        break;
      case 'pickup':
        this.tone(t, 660 * p, 920 * p, 0.07, 'triangle', 0.22 * v);
        break;
      case 'drop':
        this.tone(t, 540 * p, 360 * p, 0.09, 'triangle', 0.22 * v);
        break;
      case 'cash':
        // Register "ka-ching": a drawer thunk, a bright noise flick, then two bells that ring out.
        this.tone(t, 180, 120, 0.06, 'triangle', 0.12 * v);
        this.noise(t, 0.04, 'highpass', 5000, 0.1 * v);
        this.ring(t + 0.05, 2093 * p, 'sine', 0.13 * v, 0.04, 0.8);
        this.tone(t + 0.05, 5776 * p, 5776 * p, 0.12, 'sine', 0.03 * v, 0.002);
        this.ring(t + 0.1, 2637 * p, 'sine', 0.11 * v, 0.06, 0.9);
        break;
      case 'coin':
        // A small bell "ting": fundamental plus an inharmonic partial, like a struck coin.
        this.tone(t, 1568 * p, 1568 * p, 0.16, 'sine', 0.1 * v, 0.002);
        this.tone(t, 4327 * p, 4327 * p, 0.07, 'sine', 0.035 * v, 0.002);
        break;
      case 'bell':
        this.tone(t, 1760 * p, 1760 * p, 0.9, 'sine', 0.18 * v, 0.002, this.sfx, true);
        this.tone(t, 2637 * p, 2637 * p, 0.6, 'sine', 0.08 * v, 0.002, this.sfx, true);
        break;
      case 'ding':
        this.tone(t, 1046 * p, 1046 * p, 0.45, 'sine', 0.2 * v, 0.002, this.sfx, true);
        break;
      case 'scrub':
        this.noise(t, 0.12, 'bandpass', 1400 * p, 0.14 * v);
        this.noise(t + 0.13, 0.1, 'bandpass', 1100 * p, 0.1 * v);
        break;
      case 'sparkle':
        [2093, 2637, 3136].forEach((f, i) => this.tone(t + i * 0.05, f * p, f * p, 0.3, 'sine', 0.07 * v, 0.002, this.sfx, true));
        break;
      case 'clunk':
        this.tone(t, 110, 48, 0.35, 'sine', 0.6 * v);
        this.noise(t, 0.12, 'lowpass', 380, 0.5 * v);
        this.tone(t + 0.02, 420, 380, 0.08, 'square', 0.08 * v);
        break;
      case 'whistle':
        this.whistle(t, 1.3, v);
        break;
      case 'whistleShort':
        this.whistle(t, 0.5, v * 0.8);
        break;
      case 'fanfare': {
        // Three quick steps up, then the top chord holds and rings out (never a clipped "ta").
        const tail = AUDIO.tail;
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.11, f, f, 0.16, 'triangle', 0.2 * v, 0.004, this.sfx, true));
        this.ring(t + 0.33, 1046, 'triangle', 0.13 * v, tail.hold, tail.release);
        [1318, 784].forEach((f, i) => this.ring(t + 0.44, f, 'sine', (i === 1 ? 0.035 : 0.05) * v, tail.hold, tail.release * 1.1));
        break;
      }
      case 'levelup': {
        const tail = AUDIO.tail;
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.07, f, f, 0.14, 'triangle', 0.18 * v, 0.003, this.sfx, true));
        this.ring(t + 0.35, 1318, 'triangle', 0.13 * v, tail.hold, tail.release);
        this.ring(t + 0.4, 1568, 'sine', 0.04 * v, tail.hold, tail.release * 1.1);
        this.play('sparkle', { volume: v });
        break;
      }
      case 'punch':
        this.noise(t, 0.025, 'highpass', 3000, 0.2 * v);
        this.tone(t, 1200 * p, 900 * p, 0.04, 'square', 0.06 * v);
        break;
      case 'whoosh':
        this.sweep(t, 0.25, 500, 2400, 0.12 * v);
        break;
      case 'click':
        this.tone(t, 900, 900, 0.025, 'sine', 0.12 * v);
        break;
      case 'chime':
        [1318, 1046, 784].forEach((f, i) => (i === 2 ? this.ring(t + i * 0.22, f * p, 'sine', 0.15 * v, 0.05, 0.9) : this.tone(t + i * 0.22, f * p, f * p, 0.6, 'sine', 0.15 * v, 0.002, this.sfx, true)));
        break;
      case 'soft':
        this.tone(t, 330, 280, 0.12, 'triangle', 0.12 * v);
        break;
      case 'door':
        this.noise(t, 0.3, 'lowpass', 700, 0.12 * v);
        this.tone(t, 160, 120, 0.25, 'sine', 0.12 * v);
        break;
      case 'chest':
        // A reward: the pop and sparkle, then a small bell chord that rings out.
        this.play('pop', { pitch: 0.8, volume: v });
        this.play('sparkle', { volume: v });
        [1568, 2093].forEach((f, i) => this.ring(t + 0.16 + i * 0.05, f, 'sine', 0.06 * v, 0.05, 0.85));
        break;
      case 'unlock':
        this.tone(t, 440 * p, 880 * p, 0.12, 'triangle', 0.25 * v, 0.008, this.sfx, true);
        this.tone(t + 0.1, 880 * p, 1320 * p, 0.18, 'triangle', 0.2 * v, 0.008, this.sfx, true);
        this.ring(t + 0.26, 1320 * p, 'sine', 0.06 * v, 0.04, 0.6);
        this.noise(t + 0.08, 0.2, 'highpass', 4000, 0.06 * v);
        break;
      case 'heart':
        this.tone(t, 784 * p, 988 * p, 0.12, 'sine', 0.14 * v, 0.008, this.sfx, true);
        this.tone(t + 0.1, 1175 * p, 1175 * p, 0.2, 'sine', 0.12 * v, 0.008, this.sfx, true);
        break;
      case 'flush':
        this.sweep(t, 0.6, 1800, 300, 0.1 * v);
        break;
      case 'miss':
        // A soft "wah-wah": something slipped by, nothing lost for good.
        this.tone(t, 392 * p, 370 * p, 0.16, 'triangle', 0.13 * v);
        this.tone(t + 0.17, 330 * p, 262 * p, 0.3, 'triangle', 0.13 * v);
        break;
      case 'grumble':
        this.tone(t, 150 * p, 132 * p, 0.14, 'sawtooth', 0.035 * v);
        this.tone(t + 0.12, 140 * p, 118 * p, 0.18, 'sawtooth', 0.03 * v);
        break;
    }
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Rail clack: a "da-dum" pair each rail joint; faster and louder with speed.
    if (this.soundOn && this.speed > 0.05) {
      this.clackTimer -= dt;
      if (this.clackTimer <= 0) {
        const gap = 0.16 / (0.4 + this.speed);
        const volume = AUDIO.clack.base + this.speed * AUDIO.clack.perSpeed;
        const t = ctx.currentTime + 0.01;
        this.clack(t, volume);
        this.clack(t + gap, volume * 0.8);
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
    if (this.musicOn) this.queueTheme(ctx);
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.soundOn ? AUDIO.mix.sfx : 0;
    this.ambience.gain.value = this.soundOn ? AUDIO.mix.ambience : 0;
    this.musicBus.gain.value = this.musicOn ? AUDIO.mix.music : 0;
  }

  // ─── Music ──────────────────────────────────────────────────────────────────

  private async decodeTheme(ctx: AudioContext): Promise<void> {
    try {
      const bytes = Uint8Array.from(atob(MUSIC.data), (ch) => ch.charCodeAt(0));
      this.theme = await ctx.decodeAudioData(bytes.buffer);
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
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(1, at + AUDIO.music.fadeIn);
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

  // ─── Synthesis ──────────────────────────────────────────────────────────────

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = white * 0.6 + brown * 2.5;
    }
    return buffer;
  }

  /** `wet` also sends the note into the room tail, so it rings out instead of stopping dry. */
  private tone(t: number, f0: number, f1: number, duration: number, type: OscillatorType, gain: number, attack = 0.008, out: AudioNode = this.sfx, wet = false): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(out);
    if (wet) g.connect(this.tail);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(t);
    osc.stop(t + duration + 0.02);
    this.cueEnd = Math.max(this.cueEnd, t + duration);
  }

  /** A held note that rings out: it sustains for `hold`, then fades over `release`, through the room tail. */
  private ring(t: number, f: number, type: OscillatorType, gain: number, hold: number, release: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const g = ctx.createGain();
    const attack = 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(gain * 0.7, t + attack, hold);
    const end = t + attack + hold + release;
    g.gain.setTargetAtTime(0.0001, t + attack + hold, release / 6);
    osc.connect(g).connect(this.sfx);
    g.connect(this.tail);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(t);
    osc.stop(end + 0.05);
    this.cueEnd = Math.max(this.cueEnd, end);
  }

  /** A soft, darkened room for the tail: decaying noise, two channels for a little width. */
  private makeRoom(): AudioBuffer {
    const ctx = this.ctx!;
    const cfg = AUDIO.tail;
    const n = Math.floor(ctx.sampleRate * cfg.seconds);
    const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let low = 0;
      for (let i = 0; i < n; i++) {
        low += (Math.random() * 2 - 1 - low) * cfg.damping;
        data[i] = low * Math.exp((-6.9 * i) / n) * Math.min(1, i / (0.004 * ctx.sampleRate));
      }
    }
    return buffer;
  }

  private noise(t: number, duration: number, filterType: BiquadFilterType, freq: number, gain: number, out: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(g).connect(out);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    source.start(t, Math.random());
    source.stop(t + duration + 0.02);
    this.cueEnd = Math.max(this.cueEnd, t + duration);
  }

  private sweep(t: number, duration: number, f0: number, f1: number, gain: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(g).connect(this.sfx);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    source.start(t, Math.random());
    source.stop(t + duration + 0.02);
    this.cueEnd = Math.max(this.cueEnd, t + duration);
  }

  private whistle(t: number, duration: number, volume: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.08);
    g.gain.setValueAtTime(0.16 * volume, t + duration - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(g).connect(this.sfx);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 6;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 7;
    vibrato.connect(vibratoGain);
    for (const f of [587, 740, 880]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      vibratoGain.connect(osc.frequency);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
    vibrato.onended = () => {
      vibratoGain.disconnect();
      filter.disconnect();
      g.disconnect();
    };
    vibrato.start(t);
    vibrato.stop(t + duration + 0.05);
    this.noise(t, duration, 'highpass', 3000, 0.05 * volume);
    this.cueEnd = Math.max(this.cueEnd, t + duration);
  }

  private clack(t: number, volume: number): void {
    this.noise(t, 0.05, 'bandpass', 2200, volume, this.ambience);
    this.tone(t, 180, 90, 0.07, 'sine', volume * 1.2, 0.003, this.ambience);
  }
}
