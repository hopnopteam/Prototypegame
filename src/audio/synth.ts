import { AUDIO } from '../config/audio';
import type { Sfx } from './AudioEngine';

/**
 * The cue recipes, separated from the engine (session 26) so the same synthesis can run in two places: once at
 * start-up into an OfflineAudioContext, which renders every cue (its room tail included) into a buffer the game
 * then simply plays, and live on the game's own context as a fallback where offline rendering is unavailable.
 * Owner: "the reward sound effect still gets cut off in the middle when something is upgraded". Played live, a
 * reward jingle was a dozen oscillators plus a 1.6 s stereo convolution, all computed on the audio thread at the
 * very moment the game rebuilds a carriage; on a busy phone that thread can fall behind and the sound breaks up.
 * A pre-rendered cue costs one buffer source.
 */
export class Synth {
  /** Latest end time scheduled by the cue being built. */
  private cueEnd = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    /** Where the dry sound goes. */
    private readonly dry: AudioNode,
    /** The send into the room tail (celebration and reward cues ring out through it). */
    private readonly wet: AudioNode,
    private readonly noise_: AudioBuffer,
  ) {}

  /** Builds one cue starting at `t` (pitch `p`, volume `v`); returns when its dry sound ends (the room tail rings on). */
  build(name: Sfx, t: number, p = 1, v = 1): number {
    this.cueEnd = t;
    this.recipe(name, t, p, v);
    return this.cueEnd;
  }

  /** The cue recipes (unchanged from the set players liked; tuned by ear against mobile arcade games). */
  private recipe(name: Sfx, t: number, p: number, v: number): void {
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
        this.tone(t, 1760 * p, 1760 * p, 0.9, 'sine', 0.18 * v, 0.002, this.dry, true);
        this.tone(t, 2637 * p, 2637 * p, 0.6, 'sine', 0.08 * v, 0.002, this.dry, true);
        break;
      case 'ding':
        this.tone(t, 1046 * p, 1046 * p, 0.45, 'sine', 0.2 * v, 0.002, this.dry, true);
        break;
      case 'scrub':
        this.noise(t, 0.12, 'bandpass', 1400 * p, 0.14 * v);
        this.noise(t + 0.13, 0.1, 'bandpass', 1100 * p, 0.1 * v);
        break;
      case 'sparkle':
        [2093, 2637, 3136].forEach((f, i) => this.tone(t + i * 0.05, f * p, f * p, 0.3, 'sine', 0.07 * v, 0.002, this.dry, true));
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
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.11, f, f, 0.16, 'triangle', 0.2 * v, 0.004, this.dry, true));
        this.ring(t + 0.33, 1046, 'triangle', 0.13 * v, tail.hold, tail.release);
        [1318, 784].forEach((f, i) => this.ring(t + 0.44, f, 'sine', (i === 1 ? 0.035 : 0.05) * v, tail.hold, tail.release * 1.1));
        break;
      }
      case 'levelup': {
        const tail = AUDIO.tail;
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.07, f, f, 0.14, 'triangle', 0.18 * v, 0.003, this.dry, true));
        this.ring(t + 0.35, 1318, 'triangle', 0.13 * v, tail.hold, tail.release);
        this.ring(t + 0.4, 1568, 'sine', 0.04 * v, tail.hold, tail.release * 1.1);
        this.recipe('sparkle', t, 1, v);
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
      case 'tick':
        // A wooden clock tick: a bright knock that falls away at once.
        this.tone(t, 1900 * p, 1300 * p, 0.04, 'triangle', 0.16 * v, 0.001);
        this.tone(t, 620 * p, 520 * p, 0.05, 'sine', 0.08 * v, 0.001);
        break;
      case 'chime':
        [1318, 1046, 784].forEach((f, i) => (i === 2 ? this.ring(t + i * 0.22, f * p, 'sine', 0.15 * v, 0.05, 0.9) : this.tone(t + i * 0.22, f * p, f * p, 0.6, 'sine', 0.15 * v, 0.002, this.dry, true)));
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
        this.recipe('pop', t, 0.8, v);
        this.recipe('sparkle', t, 1, v);
        [1568, 2093].forEach((f, i) => this.ring(t + 0.16 + i * 0.05, f, 'sine', 0.06 * v, 0.05, 0.85));
        break;
      case 'unlock':
        this.tone(t, 440 * p, 880 * p, 0.12, 'triangle', 0.25 * v, 0.008, this.dry, true);
        this.tone(t + 0.1, 880 * p, 1320 * p, 0.18, 'triangle', 0.2 * v, 0.008, this.dry, true);
        this.ring(t + 0.26, 1320 * p, 'sine', 0.06 * v, 0.04, 0.6);
        this.noise(t + 0.08, 0.2, 'highpass', 4000, 0.06 * v);
        break;
      case 'heart':
        this.tone(t, 784 * p, 988 * p, 0.12, 'sine', 0.14 * v, 0.008, this.dry, true);
        this.tone(t + 0.1, 1175 * p, 1175 * p, 0.2, 'sine', 0.12 * v, 0.008, this.dry, true);
        break;
      case 'flush':
        this.sweep(t, 0.6, 1800, 300, 0.1 * v);
        break;
      case 'miss':
        // A soft "wah-wah": something slipped by, nothing lost for good.
        this.tone(t, 392 * p, 370 * p, 0.16, 'triangle', 0.13 * v);
        this.tone(t + 0.17, 330 * p, 262 * p, 0.3, 'triangle', 0.13 * v);
        break;
      case 'perfect': {
        // "All aboard!": a quick bright run up, a bell chord on top that rings out, and the chest's sparkle.
        const tail = AUDIO.tail;
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(t + i * 0.085, f, f, 0.12, 'triangle', 0.17 * v, 0.003, this.dry, true));
        this.ring(t + 0.34, 1568, 'triangle', 0.1 * v, tail.hold, tail.release);
        this.ring(t + 0.34, 2093, 'sine', 0.06 * v, tail.hold, tail.release * 1.1);
        this.recipe('sparkle', t, 1, v);
        break;
      }
      case 'ceremony': {
        // The Golden Whistle (fix list 4.4): a timpani roll, three brass chords climbing (C, F, G) and a grand C
        // that rings out under a sparkle of bells: about five seconds, the theme ducked beneath it.
        const tail = AUDIO.tail;
        for (let i = 0; i < 6; i++) this.tone(t + i * 0.09, 110, 82, 0.22, 'sine', (0.14 + i * 0.03) * v, 0.004);
        const chords = [[262, 330, 392, 523], [349, 440, 523, 698], [392, 494, 587, 784]];
        chords.forEach((chord, c) => {
          const at = t + 0.6 + c * 0.62;
          this.tone(at, 98 + c * 12, 70, 0.3, 'sine', 0.22 * v, 0.004);
          chord.forEach((f, i) => {
            this.tone(at, f, f, 0.55, 'triangle', (i === 3 ? 0.09 : 0.07) * v, 0.02, this.dry, true);
            this.tone(at, f * 2, f * 2, 0.5, 'sine', 0.025 * v, 0.03, this.dry, true);
          });
        });
        const top = t + 0.6 + 3 * 0.62;
        this.tone(top, 131, 98, 0.6, 'sine', 0.28 * v, 0.004);
        [523, 659, 784, 1046].forEach((f, i) => this.ring(top, f, 'triangle', (i === 3 ? 0.1 : 0.075) * v, tail.hold * 2.2, tail.release * 1.6));
        this.ring(top, 262, 'sine', 0.08 * v, tail.hold * 2.2, tail.release * 1.6);
        [1568, 2093, 2637, 3136, 2637, 3136].forEach((f, i) => this.ring(top + 0.18 + i * 0.12, f, 'sine', 0.035 * v, 0.05, 0.7));
        break;
      }
      case 'aww':
        // A fond, voice-like "aww" that falls away: they will catch the next train.
        this.tone(t, 523 * p, 392 * p, 0.6, 'triangle', 0.1 * v, 0.07);
        this.tone(t, 659 * p, 494 * p, 0.6, 'sine', 0.045 * v, 0.07);
        this.noise(t, 0.45, 'bandpass', 900, 0.025 * v);
        break;
      case 'grumble':
        this.tone(t, 150 * p, 132 * p, 0.14, 'sawtooth', 0.035 * v);
        this.tone(t + 0.12, 140 * p, 118 * p, 0.18, 'sawtooth', 0.03 * v);
        break;
    }
  }

  /** `wet` also sends the note into the room tail, so it rings out instead of stopping dry. */
  private tone(t: number, f0: number, f1: number, duration: number, type: OscillatorType, gain: number, attack = 0.008, out: AudioNode = this.dry, wet = false): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(out);
    if (wet) g.connect(this.wet);
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
    const ctx = this.ctx;
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
    osc.connect(g).connect(this.dry);
    g.connect(this.wet);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(t);
    osc.stop(end + 0.05);
    this.cueEnd = Math.max(this.cueEnd, end);
  }

  private noise(t: number, duration: number, filterType: BiquadFilterType, freq: number, gain: number, out: AudioNode = this.dry): void {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise_;
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
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise_;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(g).connect(this.dry);
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
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * volume, t + 0.08);
    g.gain.setValueAtTime(0.16 * volume, t + duration - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(g).connect(this.dry);
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

  /** One rail joint's knock (the clack plays two of these, a "da-dum"). */
  clack(t: number, volume: number): number {
    this.cueEnd = t;
    this.noise(t, 0.05, 'bandpass', 2200, volume, this.dry);
    this.tone(t, 180, 90, 0.07, 'sine', volume * 1.2, 0.003, this.dry);
    return this.cueEnd;
  }
}

/** A soft, darkened room for the tail: decaying noise, two channels for a little width. */
export function makeRoom(ctx: BaseAudioContext): AudioBuffer {
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

/** Brown-tinted noise for the noise-based cues. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
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
