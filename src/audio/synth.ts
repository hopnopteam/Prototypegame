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

  /**
   * The cue recipes. Session 29 (partner: "short, sweet, polished mobile-game sound effects… soft, rounded, quick and
   * satisfying… no trumpets, brass fanfares, buzzers, sirens or shrill high tones"): every cue is built from sine
   * mallets (a marimba-like note: a fundamental and a quiet, quickly dying overtone), small bells, round pops, soft
   * noise whooshes and gentle swells. Most last 0.05–0.4 s; only the big moments go longer (the reveal, the level-up,
   * the ceremony). Levels here are the cue's own shape; the volume ladder in config/audio.ts sets how loud it plays.
   */
  private recipe(name: Sfx, t: number, p: number, v: number): void {
    switch (name) {
      // ─── Gameplay: quiet and frequent ───
      case 'step':
        // A soft footfall on boards: a muffled tap and a low knock.
        this.noise(t, 0.035, 'lowpass', 900 * p, 0.12 * v);
        this.tone(t, 150 * p, 105 * p, 0.045, 'sine', 0.14 * v, 0.003);
        break;
      case 'coin':
        // Cash scooped: a round pop with a tiny tick on top (the engine climbs its pitch for each one in a row).
        this.tone(t, 760 * p, 1180 * p, 0.05, 'sine', 0.22 * v, 0.003);
        this.tone(t + 0.008, 2300 * p, 2300 * p, 0.035, 'sine', 0.05 * v, 0.002);
        break;
      case 'fill':
        // Work filling a job's ring: a gentle soft tick.
        this.tone(t, 820 * p, 900 * p, 0.035, 'sine', 0.14 * v, 0.003);
        break;
      case 'done':
        // A job finished (tidied, served, picked up, dropped off): a short soft mallet and a pop.
        this.mallet(t, 660 * p, 0.2 * v, 0.16);
        this.tone(t, 520 * p, 980 * p, 0.06, 'sine', 0.1 * v, 0.003);
        break;
      case 'pickup':
        // Onto the stack: a soft "thup" up.
        this.tone(t, 300 * p, 430 * p, 0.06, 'sine', 0.22 * v, 0.004);
        this.noise(t, 0.03, 'lowpass', 1200, 0.04 * v);
        break;
      case 'drop':
        // Off the stack: a soft "thup" down.
        this.tone(t, 420 * p, 260 * p, 0.07, 'sine', 0.22 * v, 0.004);
        this.noise(t, 0.03, 'lowpass', 900, 0.04 * v);
        break;
      case 'drip':
        // Cash flying into an unlock tile: tiny soft ticks.
        this.tone(t, 1250 * p, 1350 * p, 0.03, 'sine', 0.12 * v, 0.002);
        break;
      case 'pop':
        // Something appears: a round pop.
        this.tone(t, 440 * p, 900 * p, 0.07, 'sine', 0.22 * v, 0.004);
        break;
      case 'tick':
        // The station clock's last seconds: a soft wooden tick.
        this.tone(t, 1300 * p, 1050 * p, 0.03, 'sine', 0.13 * v, 0.002);
        this.tone(t, 480 * p, 430 * p, 0.04, 'sine', 0.06 * v, 0.002);
        break;
      case 'click':
        // A button tap.
        this.tone(t, 1150 * p, 1000 * p, 0.02, 'sine', 0.14 * v, 0.002);
        break;
      case 'whoosh':
        // A panel opens or closes, a bin swallows something: a quiet air movement.
        this.sweep(t, 0.2, 500 * p, 1500 * p, 0.09 * v);
        break;
      case 'tock':
        // Can't do that (no cash for this tile): a very soft low wooden "tock", never a buzzer.
        this.tone(t, 300, 255, 0.08, 'sine', 0.22 * v, 0.003);
        this.tone(t, 600, 520, 0.03, 'sine', 0.04 * v, 0.002);
        break;
      case 'flush':
        // A washroom used: a soft swirl of water.
        this.sweep(t, 0.45, 1100, 320, 0.07 * v);
        break;
      // ─── Guests: soft ───
      case 'door':
        // A guest steps aboard, the doors slide: a quiet swish.
        this.sweep(t, 0.22, 700 * p, 1400 * p, 0.07 * v);
        break;
      case 'bloop':
        // A request bubble appears: a tiny rising bloop.
        this.tone(t, 480 * p, 760 * p, 0.09, 'sine', 0.18 * v, 0.012);
        break;
      case 'clink':
        // A fare or a tip: a tiny coin clink.
        this.bellNote(t, 2093 * p, 0.09 * v, 0.16);
        this.tone(t, 900 * p, 1300 * p, 0.03, 'sine', 0.06 * v, 0.002);
        break;
      case 'ding':
        // A request fulfilled: a small pleasant ding.
        this.bellNote(t, 1046 * p, 0.15 * v, 0.38);
        this.mallet(t, 1568 * p, 0.05 * v, 0.2);
        break;
      case 'heart':
        // A happy guest: two soft rising notes.
        this.mallet(t, 784 * p, 0.12 * v, 0.18);
        this.mallet(t + 0.08, 1175 * p, 0.1 * v, 0.22);
        break;
      case 'grumble':
        // A grumpy "hmm": soft and low.
        this.tone(t, 230 * p, 200 * p, 0.2, 'sine', 0.14 * v, 0.03);
        this.tone(t, 460 * p, 400 * p, 0.16, 'sine', 0.03 * v, 0.03);
        break;
      case 'aww':
        // A guest leaving unhappy: a short, soft, low "aww" that falls away.
        this.tone(t, 392 * p, 294 * p, 0.42, 'sine', 0.13 * v, 0.05);
        this.tone(t, 196 * p, 165 * p, 0.42, 'sine', 0.05 * v, 0.05);
        break;
      // ─── Unlocks and upgrades: medium ───
      case 'unlock':
        // Unlock complete: a bright, short two-note chime.
        this.mallet(t, 784 * p, 0.2 * v, 0.3, true);
        this.mallet(t + 0.09, 1175 * p, 0.18 * v, 0.42, true);
        break;
      case 'sparkle':
        // An upgrade applied: a soft sparkle with a light ding.
        [1568, 1976, 2349].forEach((f, i) => this.bellNote(t + i * 0.045, f * p, 0.045 * v, 0.28));
        this.bellNote(t + 0.14, 1318 * p, 0.08 * v, 0.4);
        break;
      case 'staff':
        // Help hired: a friendly short ascending chime.
        [523, 659, 784].forEach((f, i) => this.mallet(t + i * 0.075, f, 0.15 * v, 0.24, true));
        this.bellNote(t + 0.24, 1046, 0.1 * v, 0.6);
        break;
      case 'ready':
        // The hand work behind a helper is done: two bright notes and a twinkle.
        this.mallet(t, 880, 0.14 * v, 0.24, true);
        this.mallet(t + 0.08, 1318, 0.13 * v, 0.34, true);
        this.bellNote(t + 0.18, 2093, 0.035 * v, 0.3);
        break;
      case 'chest':
        // A reward (the station bonus, a goal, a prize): a sparkle over two warm notes.
        this.mallet(t, 1046, 0.13 * v, 0.3, true);
        this.mallet(t + 0.07, 1318, 0.11 * v, 0.36, true);
        [2093, 2637].forEach((f, i) => this.bellNote(t + 0.12 + i * 0.05, f, 0.035 * v, 0.3));
        break;
      case 'cash':
        // A lump of cash (a reward paid out): a fuller pop-tick with a small bell.
        this.recipe('coin', t, p, v);
        this.mallet(t + 0.04, 1568 * p, 0.08 * v, 0.24);
        break;
      case 'chime':
        // A notice (last call's warning, Happy Hour, held train): two soft falling bell notes.
        this.bellNote(t, 1318 * p, 0.11 * v, 0.55);
        this.bellNote(t + 0.16, 1046 * p, 0.11 * v, 0.7);
        break;
      // ─── Train and journey ───
      case 'whistle':
        // Arriving: a mellow, short whistle (one soft note, not a blast).
        this.softWhistle(t, 740 * p, 0.75, 0.1 * v);
        break;
      case 'depart':
        // Departing: a soft whistle, then a quiet chug building up.
        this.softWhistle(t, 659 * p, 0.55, 0.09 * v);
        [0.45, 0.78, 1.04, 1.25, 1.42, 1.56].forEach((d, i) => this.noise(t + d, 0.09, 'lowpass', 420 + i * 30, (0.03 + i * 0.012) * v));
        break;
      case 'bell':
        // The station bell, and the departure warning (a lower pitch): a gentle "ding-ding".
        this.bellNote(t, 988 * p, 0.15 * v, 0.9);
        this.bellNote(t + 0.2, 988 * p, 0.09 * v, 0.8);
        break;
      case 'clunk':
        // A carriage couples on: a satisfying low clunk, then a soft whoosh of dust.
        this.tone(t, 110, 50, 0.3, 'sine', 0.5 * v, 0.004);
        this.noise(t, 0.1, 'lowpass', 380, 0.32 * v);
        this.sweep(t + 0.06, 0.4, 900, 300, 0.05 * v);
        break;
      // ─── Reveals and rewards: special, but tasteful ───
      case 'reveal': {
        // The cover lifts: a warm, shimmering chime sweep up a pentatonic scale over a soft swell.
        this.pad(t, [523, 784], 0.05 * v, 0.25, 0.35, 0.9);
        [784, 880, 1046, 1175, 1318, 1568, 1760, 2093].forEach((f, i) => this.bellNote(t + 0.05 + i * 0.065, f, (0.07 - i * 0.004) * v, 0.75));
        this.mallet(t + 0.6, 1046, 0.1 * v, 0.6, true);
        break;
      }
      case 'perfect':
        // A perfect stop: three soft rising chimes as the stars pop in, then a light sparkle.
        [1046, 1318, 1568].forEach((f, i) => this.bellNote(t + i * 0.2, f, 0.12 * v, 0.55));
        [2093, 2349, 2637].forEach((f, i) => this.bellNote(t + 0.55 + i * 0.04, f, 0.03 * v, 0.3));
        break;
      case 'miss':
        // Passengers missed the train: one soft, low, gentle note (disappointed, not annoying).
        this.tone(t, 330, 311, 0.5, 'sine', 0.12 * v, 0.04, this.dry, true);
        this.tone(t, 165, 156, 0.5, 'sine', 0.04 * v, 0.04);
        break;
      case 'levelup': {
        // A route level: a short, bright, uplifting chime phrase (about a second).
        [523, 659, 784, 1046].forEach((f, i) => this.mallet(t + i * 0.08, f, 0.15 * v, 0.28, true));
        this.bellNote(t + 0.34, 1318, 0.09 * v, 0.8);
        this.bellNote(t + 0.34, 1568, 0.06 * v, 0.8);
        [2093, 2637, 3136].forEach((f, i) => this.bellNote(t + 0.42 + i * 0.05, f, 0.025 * v, 0.3));
        break;
      }
      case 'ceremony': {
        // The Golden Whistle, the one big moment: a warm swelling chord, a bell arpeggio over it and soft applause.
        this.pad(t, [262, 330, 392, 523], 0.035 * v, 0.9, 0.7, 1.3);
        [523, 659, 784, 1046, 1318, 1046, 1318, 1568].forEach((f, i) => this.bellNote(t + 0.5 + i * 0.16, f, 0.06 * v, 0.9));
        this.applause(t + 0.9, 2.4, 0.035 * v);
        break;
      }
    }
  }

  /** A marimba-like note: a sine fundamental and a quiet, fast-dying overtone. `wet` rings it into the room. */
  private mallet(t: number, f: number, gain: number, decay: number, wet = false): void {
    this.tone(t, f, f, decay, 'sine', gain, 0.004, this.dry, wet);
    this.tone(t, f * 3.93, f * 3.93, decay * 0.22, 'sine', gain * 0.16, 0.002);
  }

  /** A small bell: a sine fundamental and two soft inharmonic partials, ringing into the room. */
  private bellNote(t: number, f: number, gain: number, decay: number): void {
    this.tone(t, f, f, decay, 'sine', gain, 0.003, this.dry, true);
    this.tone(t, f * 2.4, f * 2.4, decay * 0.55, 'sine', gain * 0.22, 0.003);
    this.tone(t, f * 4.1, f * 4.1, decay * 0.28, 'sine', gain * 0.08, 0.002);
  }

  /** A soft swell: notes that fade in over `attack`, hold, then fade over `release` (a warm bed under a reveal). */
  private pad(t: number, notes: number[], gain: number, attack: number, hold: number, release: number): void {
    const ctx = this.ctx;
    for (const f of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      osc.connect(g).connect(this.dry);
      g.connect(this.wet);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
      osc.start(t);
      osc.stop(t + attack + hold + release + 0.05);
    }
    this.cueEnd = Math.max(this.cueEnd, t + attack + hold + release);
  }

  /** A mellow train whistle: one soft sine note with a gentle vibrato and a breath of air. */
  private softWhistle(t: number, f: number, duration: number, gain: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = f * 0.006;
    vibrato.connect(depth).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.12);
    g.gain.setValueAtTime(gain, t + duration - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.dry);
    g.connect(this.wet);
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = f * 2;
    const og = ctx.createGain();
    og.gain.value = 0.12;
    overtone.connect(og).connect(g);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      depth.disconnect();
      og.disconnect();
    };
    for (const o of [osc, vibrato, overtone]) {
      o.start(t);
      o.stop(t + duration + 0.05);
    }
    this.noise(t, duration * 0.8, 'bandpass', 1600, gain * 0.12);
    this.cueEnd = Math.max(this.cueEnd, t + duration);
  }

  /** Soft applause: many tiny filtered claps, swelling in and dying away over `duration`. */
  private applause(t: number, duration: number, gain: number): void {
    // Seeded, so the cue measures and renders the same claps (a random scatter was cut short when it was recorded).
    let seed = 7;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const claps = Math.round(duration * 26);
    for (let i = 0; i < claps; i++) {
      const at = t + duration * Math.min(0.97, (i + rand()) / claps);
      const shape = Math.sin(((at - t) / duration) * Math.PI);
      this.noise(at, 0.03, 'bandpass', 1800 + rand() * 1600, gain * (0.2 + 0.8 * shape));
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

  /** One rail joint's knock (the clack plays two of these, a "da-dum"). */
  clack(t: number, volume: number): number {
    // Session 29: softer and lower than before (a muffled knock under the carriage, not a click).
    this.cueEnd = t;
    this.noise(t, 0.05, 'lowpass', 700, volume, this.dry);
    this.tone(t, 150, 80, 0.07, 'sine', volume * 1.2, 0.003, this.dry);
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
