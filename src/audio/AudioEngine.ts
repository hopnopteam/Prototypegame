import { log } from '../core/log';

export type Sfx =
  | 'pop' | 'pickup' | 'drop' | 'cash' | 'coin' | 'bell' | 'ding' | 'scrub' | 'sparkle' | 'clunk'
  | 'whistle' | 'whistleShort' | 'fanfare' | 'levelup' | 'punch' | 'whoosh' | 'click' | 'chime'
  | 'soft' | 'door' | 'chest' | 'unlock' | 'heart' | 'flush';

/**
 * Every sound in the game, synthesised with WebAudio: no audio files, tiny download, works offline.
 * Starts silent until the first touch (browsers require a gesture), then plays sfx, the rail clack that
 * follows train speed, station ambience and a soft procedural travel tune.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private ambience!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private soundOn = true;
  private musicOn = true;
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
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.22;
        this.musicBus.connect(this.master);
        this.ambience = this.ctx.createGain();
        this.ambience.gain.value = 0.5;
        this.ambience.connect(this.master);
        this.noiseBuffer = this.makeNoise();
        this.applyToggles();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (error) {
      log.warn('Audio', 'WebAudio unavailable', error);
    }
  }

  setEnabled(sound: boolean, music: boolean): void {
    this.soundOn = sound;
    this.musicOn = music;
    this.applyToggles();
  }

  /** Suspends everything while an ad plays or the tab is hidden. */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
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
    if (!ctx || !this.soundOn || ctx.state !== 'running') return;
    // Rate-limit identical sounds so a burst of pickups never becomes noise.
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.025) return;
    this.lastPlay.set(name, now);
    const p = options.pitch ?? 1;
    const v = options.volume ?? 1;
    const t = now + 0.005;
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
        this.tone(t, 1320 * p, 1320 * p, 0.06, 'triangle', 0.16 * v);
        this.tone(t + 0.045, 1760 * p, 1760 * p, 0.12, 'triangle', 0.14 * v);
        this.noise(t, 0.03, 'highpass', 6000, 0.08 * v);
        break;
      case 'coin':
        this.tone(t, 1500 * p, 1650 * p, 0.035, 'square', 0.05 * v);
        break;
      case 'bell':
        this.tone(t, 1760 * p, 1760 * p, 0.9, 'sine', 0.18 * v, 0.002);
        this.tone(t, 2637 * p, 2637 * p, 0.6, 'sine', 0.08 * v, 0.002);
        break;
      case 'ding':
        this.tone(t, 1046 * p, 1046 * p, 0.45, 'sine', 0.2 * v, 0.002);
        break;
      case 'scrub':
        this.noise(t, 0.12, 'bandpass', 1400 * p, 0.14 * v);
        this.noise(t + 0.13, 0.1, 'bandpass', 1100 * p, 0.1 * v);
        break;
      case 'sparkle':
        [2093, 2637, 3136].forEach((f, i) => this.tone(t + i * 0.05, f * p, f * p, 0.18, 'sine', 0.07 * v, 0.002));
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
      case 'fanfare':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.11, f, f, i === 3 ? 0.7 : 0.16, 'triangle', 0.2 * v, 0.004));
        [1046, 1318].forEach((f) => this.tone(t + 0.44, f, f, 0.8, 'sine', 0.08 * v, 0.004));
        break;
      case 'levelup':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.07, f, f, i === 5 ? 0.9 : 0.14, 'triangle', 0.18 * v, 0.003));
        this.play('sparkle', { volume: v });
        break;
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
        [1318, 1046, 784].forEach((f, i) => this.tone(t + i * 0.22, f, f, 0.6, 'sine', 0.15 * v, 0.002));
        break;
      case 'soft':
        this.tone(t, 330, 280, 0.12, 'triangle', 0.12 * v);
        break;
      case 'door':
        this.noise(t, 0.3, 'lowpass', 700, 0.12 * v);
        this.tone(t, 160, 120, 0.25, 'sine', 0.12 * v);
        break;
      case 'chest':
        this.play('pop', { pitch: 0.8, volume: v });
        this.play('sparkle', { volume: v });
        break;
      case 'unlock':
        this.tone(t, 440 * p, 880 * p, 0.12, 'triangle', 0.25 * v);
        this.tone(t + 0.1, 880 * p, 1320 * p, 0.18, 'triangle', 0.2 * v);
        this.noise(t + 0.08, 0.2, 'highpass', 4000, 0.06 * v);
        break;
      case 'heart':
        this.tone(t, 784 * p, 988 * p, 0.12, 'sine', 0.14 * v);
        this.tone(t + 0.1, 1175 * p, 1175 * p, 0.2, 'sine', 0.12 * v);
        break;
      case 'flush':
        this.sweep(t, 0.6, 1800, 300, 0.1 * v);
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
        const volume = 0.05 + this.speed * 0.09;
        const t = ctx.currentTime + 0.01;
        this.clack(t, volume);
        this.clack(t + gap, volume * 0.8);
        this.clackTimer = 0.7 / (0.25 + this.speed * 1.1);
      }
    }
    if (this.musicOn) this.scheduleMusic();
  }

  private applyToggles(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = this.soundOn ? 1 : 0;
    this.ambience.gain.value = this.soundOn ? 0.5 : 0;
    this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
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
    source.start(t, Math.random());
    source.stop(t + duration + 0.02);
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
    source.start(t, Math.random());
    source.stop(t + duration + 0.02);
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
    vibrato.start(t);
    vibrato.stop(t + duration + 0.05);
    this.noise(t, duration, 'highpass', 3000, 0.05 * volume);
  }

  private clack(t: number, volume: number): void {
    this.noise(t, 0.05, 'bandpass', 2200, volume, this.ambience);
    this.tone(t, 180, 90, 0.07, 'sine', volume * 1.2, 0.003, this.ambience);
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
