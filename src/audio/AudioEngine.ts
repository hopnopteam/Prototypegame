import { AUDIO, type CueName } from '../config/audio';
import { log } from '../core/log';
import { SAMPLES, type SampleId } from './samples';

export type Sfx = CueName;

interface Sample {
  buffer: AudioBuffer;
  /** Where the sound actually starts (MP3 encoders pad the front with a few ms of silence). */
  offset: number;
}

/**
 * Every sound in the game. Effects are real samples (warm UI cues, coins and build thunks, plus a steam
 * whistle, rail clacks, a coupling clunk and more rendered for this game: assets/audio/CREDITS.md), played
 * to the end of their natural tails through a gentle compressor so a busy moment never clips or breaks
 * up. The mix lives in config/audio.ts. Music stays procedural (a soft travel tune) and the station murmur
 * is filtered noise. Silent until the first touch (browsers require a gesture).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private ambience!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private readonly samples = new Map<SampleId, Sample>();
  private readonly voices = new Map<Sfx, number>();
  private soundOn = true;
  private musicOn = true;
  private paused = false;
  private suspendTimer = 0;
  private speed = 0;
  private clackTimer = 0;
  private musicTime = 0;
  private nextBarAt = 0;
  private bar = 0;
  private crowd: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  private night = 0;
  private lastPlay = new Map<Sfx, number>();

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
        const c = AUDIO.compressor;
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = c.threshold;
        compressor.knee.value = c.knee;
        compressor.ratio.value = c.ratio;
        compressor.attack.value = c.attack;
        compressor.release.value = c.release;
        this.master = ctx.createGain();
        this.master.gain.value = AUDIO.mix.master;
        compressor.connect(this.master).connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.sfx.connect(compressor);
        this.musicBus = ctx.createGain();
        this.musicBus.connect(compressor);
        this.ambience = ctx.createGain();
        this.ambience.connect(compressor);
        this.noiseBuffer = this.makeNoise();
        this.applyToggles();
        void this.decodeAll(ctx);
      }
      if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
    } catch (error) {
      log.warn('Audio', 'WebAudio unavailable', error);
    }
  }

  setEnabled(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    this.applyToggles();
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
    const cue = AUDIO.cues[name];
    const now = ctx.currentTime;
    // Never cut a sound that is playing: a cue that just started, or is ringing enough times, waits.
    if (now - (this.lastPlay.get(name) ?? -1) < (cue.gap ?? 0.03)) return;
    if ((this.voices.get(name) ?? 0) >= (cue.voices ?? 4)) return;
    const sample = this.samples.get(cue.samples[Math.floor(Math.random() * cue.samples.length)]);
    if (!sample) return;
    this.lastPlay.set(name, now);
    const bend = 1 + ((options.pitch ?? 1) - 1) * (cue.pitchScale ?? 1);
    const jitter = 1 + (cue.jitter ?? 0) * (Math.random() * 2 - 1);
    const rate = Math.max(0.5, Math.min(2, bend * jitter));
    this.voices.set(name, (this.voices.get(name) ?? 0) + 1);
    this.start(sample, rate, cue.gain * (options.volume ?? 1), this.sfx, () => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1)));
  }

  private start(sample: Sample, rate: number, gain: number, out: AudioNode, onEnded?: () => void): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(out);
    source.onended = () => {
      source.disconnect();
      g.disconnect();
      onEnded?.();
    };
    source.start(ctx.currentTime + 0.002, sample.offset);
  }

  private async decodeAll(ctx: AudioContext): Promise<void> {
    await Promise.all((Object.keys(SAMPLES) as SampleId[]).map(async (id) => {
      try {
        const bytes = Uint8Array.from(atob(SAMPLES[id]), (ch) => ch.charCodeAt(0));
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        const data = buffer.getChannelData(0);
        let first = 0;
        while (first < data.length && Math.abs(data[first]) < 0.001) first++;
        this.samples.set(id, { buffer, offset: Math.max(0, first - 8) / buffer.sampleRate });
      } catch (error) {
        log.warn('Audio', `could not decode ${id}`, error);
      }
    }));
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Rail clack: a "da-dum" pair each rail joint; faster and louder with speed.
    if (this.soundOn && this.speed > 0.05) {
      this.clackTimer -= dt;
      if (this.clackTimer <= 0) {
        const gap = 0.16 / (0.4 + this.speed);
        const volume = 0.35 + this.speed * 0.65;
        this.clack(volume);
        window.setTimeout(() => this.clack(volume * 0.8), gap * 1000);
        this.clackTimer = 0.7 / (0.25 + this.speed * 1.1);
      }
    }
    if (this.musicOn) this.scheduleMusic();
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.soundOn ? AUDIO.mix.sfx : 0;
    this.ambience.gain.value = this.soundOn ? AUDIO.mix.ambience : 0;
    this.musicBus.gain.value = this.musicOn ? AUDIO.mix.music : 0;
  }

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

  private tone(t: number, f0: number, f1: number, duration: number, type: OscillatorType, gain: number, attack = 0.008, out: AudioNode = this.sfx): void {
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
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }



  private clack(volume: number): void {
    const cfg = AUDIO.clack;
    const sample = this.samples.get(cfg.samples[Math.floor(Math.random() * cfg.samples.length)]);
    if (!sample) return;
    this.start(sample, 1 + cfg.jitter * (Math.random() * 2 - 1), cfg.gain * volume, this.ambience);
  }

  /** Four-bar loop, F major: F – Dm – B♭ – C. Pad, bass and a gentle pentatonic pluck. */
  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const beat = 60 / 92;
    const barLength = beat * 4;
    if (this.nextBarAt < ctx.currentTime) this.nextBarAt = ctx.currentTime + 0.1;
    while (this.nextBarAt < ctx.currentTime + 0.6) {
      const t = this.nextBarAt;
      const chords = [
        [174.6, 220.0, 261.6],
        [146.8, 174.6, 220.0],
        [116.5, 146.8, 174.6],
        [130.8, 164.8, 196.0],
      ];
      const chord = chords[this.bar % 4];
      for (const f of chord) this.tone(t, f * 2, f * 2, barLength * 0.95, 'triangle', 0.05, 0.4, this.musicBus);
      this.tone(t, chord[0] / 2, chord[0] / 2, beat * 1.6, 'sine', 0.12, 0.02, this.musicBus);
      this.tone(t + beat * 2, chord[0] / 2, chord[0] / 2, beat * 1.6, 'sine', 0.1, 0.02, this.musicBus);
      if (this.night < 0.6) {
        const scale = [523.3, 587.3, 659.3, 784.0, 880.0];
        let seed = (this.bar * 7919) % 97;
        for (let step = 0; step < 8; step++) {
          seed = (seed * 31 + 7) % 97;
          if (seed % 3 === 0) continue;
          const f = scale[seed % scale.length] * (chord[0] < 130 ? 0.89 : 1);
          this.tone(t + step * (beat / 2), f, f, beat * 0.45, 'sine', 0.045, 0.005, this.musicBus);
        }
      }
      this.nextBarAt += barLength;
      this.bar++;
      this.musicTime += barLength;
    }
  }
}
