#!/usr/bin/env python3
"""Renders the Night Express theme: an original, sunny lo-fi groove.

The score below is the source of the music: a laid-back 80 bpm loop in F major with swung sixteenths,
soft lo-fi piano chords (major ninths stepping down B-flat, A minor, G minor, F), a round electric bass,
a gentle acoustic kit and a clean electric-guitar melody on the major pentatonic. Nothing tense or dark:
only diatonic seventh and ninth chords.

It is played from real recordings (Salamander Grand Piano V3 by Alexander Holm; electric bass and
electric guitar from nbrosowsky/tonejs-instruments, both CC BY 3.0; drums from the Sonic Pi sample set,
CC0; credited in assets/audio/CREDITS.md), mixed with a small room reverb and written as one small mono
MP3 plus a generated TypeScript module holding its loop length.

The file holds one pass of the tune plus the tail of its last bar. The game starts each pass exactly one
loop length after the previous one, so the tail rings into the next pass as in a live performance (a
seamless loop, whatever padding the MP3 decoder adds).

Usage (sample packages from npm, unpacked into <dir>/<short name>/package):
  npm pack @audio-samples/piano-mp3-velocity6 tonejs-instrument-bass-electric-mp3 \
    tonejs-instrument-guitar-electric-mp3 supersonic-scsynth-samples
  # untar each: piano-mp3-velocity6/, bass-electric/, guitar-electric/, supersonic-scsynth-samples/
  python3 scripts/audio/build_music.py <dir> [--preview out.wav] [--stems]
"""
import math
import os
import re
import sys

import lameenc
import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

SR = 44100
OUT_SR = 24000
BITRATE = 48
BPM = 80
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 16
LOOP = BARS * BAR
TAIL = 3.0
SWING = 0.6  # where the off-beat sixteenth falls inside its eighth (0.5 = straight): the lo-fi lilt
RNG = np.random.default_rng(1905)

# ─── Harmony ────────────────────────────────────────────────────────────────
# Piano voicings (close, warm, with the ninth on top or inside) and the bass root for each chord.
CHORDS = {
    'Bbmaj9': dict(root=34, keys=[62, 65, 69, 72]),   # D F A C
    'Am11':   dict(root=33, keys=[62, 64, 67, 72]),   # D E G C
    'Gm9':    dict(root=31, keys=[58, 62, 65, 69]),   # Bb D F A
    'Fmaj9':  dict(root=29, keys=[57, 60, 64, 67]),   # A C E G
    'C9sus':  dict(root=36, keys=[58, 62, 65, 67]),   # Bb D F G
    'C13':    dict(root=36, keys=[58, 62, 64, 69]),   # Bb D E A
}
CYCLE = ['Bbmaj9', 'Am11', 'Gm9', 'Fmaj9', 'Bbmaj9', 'Am11', 'Gm9', 'C9sus']
FORM = CYCLE + CYCLE
# The last beat of the loop lifts into the top: C13 instead of the suspension.
LIFT_BAR, LIFT_BEAT, LIFT_CHORD = 16, 3, 'C13'

# ─── Melody (clean electric guitar): (bar, beat, MIDI, beats) ─────────────────
C5, D5, E5, F5, G5, A5, Bb5, C6, D6, E6 = 72, 74, 76, 77, 79, 81, 82, 84, 86, 88
MELODY = [
    # First time: a small hook and its answers.
    (1, 0.75, C5, 0.25), (1, 1, D5, 0.5), (1, 1.5, F5, 0.5), (1, 2, A5, 1.5),
    (2, 0.5, G5, 0.5), (2, 1, A5, 0.5), (2, 1.5, G5, 0.5), (2, 2, E5, 1.5),
    (3, 0.75, D5, 0.25), (3, 1, F5, 0.5), (3, 1.5, G5, 0.5), (3, 2, A5, 0.75), (3, 2.75, C6, 0.75),
    (4, 0, C6, 0.5), (4, 0.5, A5, 1), (4, 1.5, G5, 0.5), (4, 2, F5, 1.75),
    (5, 0.75, C5, 0.25), (5, 1, D5, 0.5), (5, 1.5, F5, 0.5), (5, 2, A5, 1.5),
    (6, 0.5, C6, 0.5), (6, 1, D6, 0.5), (6, 1.5, C6, 0.5), (6, 2, A5, 1.5),
    (7, 0.5, Bb5, 0.5), (7, 1, A5, 0.5), (7, 1.5, G5, 0.5), (7, 2, F5, 0.5), (7, 2.5, D5, 1),
    (8, 0, G5, 1), (8, 1, F5, 0.5), (8, 1.5, D5, 1.5),
    # Second time: the hook again, then it climbs a little higher and settles.
    (9, 0.75, C5, 0.25), (9, 1, D5, 0.5), (9, 1.5, F5, 0.5), (9, 2, A5, 1), (9, 3, G5, 0.5), (9, 3.5, A5, 0.5),
    (10, 0, C6, 1), (10, 1, A5, 0.5), (10, 1.5, G5, 0.5), (10, 2, E5, 1.5),
    (11, 0.75, D5, 0.25), (11, 1, F5, 0.5), (11, 1.5, G5, 0.5), (11, 2, Bb5, 0.5), (11, 2.5, A5, 0.5), (11, 3, G5, 1),
    (12, 0, A5, 0.5), (12, 0.5, G5, 0.5), (12, 1, F5, 2), (12, 3.5, C6, 0.5),
    (13, 0, D6, 1), (13, 1, C6, 0.5), (13, 1.5, A5, 0.5), (13, 2, C6, 1.5),
    (14, 0.5, D6, 0.5), (14, 1, E6, 0.5), (14, 1.5, D6, 0.5), (14, 2, C6, 1.5),
    (15, 0.5, Bb5, 0.5), (15, 1, A5, 0.5), (15, 1.5, G5, 0.5), (15, 2, A5, 0.5), (15, 2.5, F5, 1),
    (16, 0, G5, 1), (16, 1, F5, 0.5), (16, 1.5, D5, 1), (16, 3, E5, 0.75),
]


def when(bar, beat):
    """Seconds from the top for a bar (1-based) and beat (quarters from 0), with swung sixteenths."""
    eighth = math.floor(beat * 2 + 1e-9) / 2
    within = beat - eighth
    if abs(within - 0.25) < 1e-6:
        within = 0.5 * SWING
    return ((bar - 1) * 4 + eighth + within) * BEAT


def chord_at(bar, beat):
    if bar == LIFT_BAR and beat >= LIFT_BEAT:
        return CHORDS[LIFT_CHORD]
    return CHORDS[FORM[bar - 1]]


# ─── Samples ────────────────────────────────────────────────────────────────
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def load(path):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    mono = data.mean(axis=1)
    if sr != SR:
        mono = resample_poly(mono, SR, sr).astype(np.float32)
    # Trim the silent lead-in so every note speaks on time.
    first = int(np.argmax(np.abs(mono) > 0.002))
    return mono[max(0, first - 16):]


class Instrument:
    def __init__(self, folder, pattern, lo=0, hi=127):
        self.samples = {}
        for name in os.listdir(folder):
            m = re.fullmatch(pattern, name)
            if not m:
                continue
            letter, sharp, octave = m.group(1), m.group(2), int(m.group(3))
            midi = 12 * (octave + 1) + NOTE[letter] + (1 if sharp else 0)
            if lo <= midi <= hi:
                self.samples[midi] = load(os.path.join(folder, name))
        if not self.samples:
            sys.exit(f'no samples found in {folder}')
        self.keys = np.array(sorted(self.samples))

    def nearest(self, midi):
        k = int(self.keys[np.argmin(np.abs(self.keys - midi))])
        return k, self.samples[k]


def repitch(src, ratio, n):
    """Plays `src` `ratio` times faster for `n` output samples (Catmull-Rom interpolation)."""
    pos = np.arange(n, dtype=np.float64) * ratio
    i = pos.astype(np.int64)
    f = (pos - i).astype(np.float32)
    padded = np.concatenate([[0.0], src, np.zeros(4)]).astype(np.float32)
    i = np.minimum(i, len(src))
    y0, y1, y2, y3 = padded[i], padded[i + 1], padded[i + 2], padded[i + 3]
    return y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)))


def place(out, inst, midi, start, end, vel, release, curve=1.6):
    """Adds one note: sounds from `start` to `end` (seconds), then damps over `release`."""
    key, src = inst.nearest(midi)
    ratio = 2 ** ((midi - key) / 12)
    start = max(0.0, start)
    held = max(0.02, end - start)
    s0 = int(start * SR)
    n = min(int((held + release) * SR), len(out) - s0)
    if n <= 0:
        return
    wave = repitch(src, ratio, n)
    env = np.ones(n, dtype=np.float32)
    h = min(n, int(held * SR))
    if n > h:
        env[h:] *= np.exp(-6.9 * np.arange(n - h) / max(1, int(release * SR))).astype(np.float32)
    out[s0:s0 + n] += wave * env * (vel ** curve)


def hit(out, sample, start, vel):
    """A drum hit: the one-shot recording, as recorded."""
    s0 = int(max(0.0, start) * SR)
    n = min(len(sample), len(out) - s0)
    if n > 0:
        out[s0:s0 + n] += sample[:n] * vel ** 1.4


def humanise(t, spread):
    return t + float(RNG.normal(0, spread))


# ─── Reverb ─────────────────────────────────────────────────────────────────
def room(seconds=1.5, rt60_low=1.1, rt60_high=0.55, predelay=0.012):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n).astype(np.float32)
    low = sosfilt(butter(2, 900, 'low', fs=SR, output='sos'), noise)
    high = noise - low
    ir = low * np.exp(-6.9 * t / rt60_low) + 0.5 * high * np.exp(-6.9 * t / rt60_high)
    ir[: int(0.005 * SR)] *= np.linspace(0, 1, int(0.005 * SR))  # no hard edge
    for delay, gain in [(0.007, 0.5), (0.013, 0.4), (0.021, 0.3), (0.031, 0.2)]:
        ir[int(delay * SR)] += gain * 3
    ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
    return (ir / np.sqrt(np.sum(ir ** 2))).astype(np.float32)


# ─── Performance ────────────────────────────────────────────────────────────
def perform(piano, bass, guitar, kit):
    n = int((LOOP + TAIL) * SR)
    stems = {k: np.zeros(n, dtype=np.float32) for k in ('keys', 'bass', 'lead', 'kick', 'snare', 'hats')}

    for bar in range(1, BARS + 1):
        second_time = bar > 8
        # Keys: a lush chord on one, a softer one on the "and" of three, each gently rolled, a touch late.
        hits = [(0, 2.45, 0.5), (2.5, 3.97, 0.38)]
        if bar == LIFT_BAR:
            hits = [(0, 2.45, 0.5), (2.5, 2.97, 0.38), (3, 3.97, 0.42)]
        for b0, b1, level_ in hits:
            chord = chord_at(bar, b0)
            t = humanise(when(bar, b0), 0.006) + 0.01
            for k, midi in enumerate(chord['keys']):
                place(stems['keys'], piano, midi, t + k * 0.012, when(bar, b1), level_ * float(RNG.uniform(0.93, 1.05)), 0.35)

        # Bass: root on one, again on the "and" of two, the fifth on the "and" of three, then a
        # chromatic step up into the next chord.
        r = CHORDS[FORM[bar - 1]]['root']
        nxt = CHORDS[FORM[bar % BARS]]['root']
        for beat, midi, beats, vel in ((0, r, 1.3, 0.85), (1.5, r, 0.45, 0.55), (2.5, r + 7, 0.8, 0.7), (3.5, nxt - 1, 0.45, 0.6)):
            place(stems['bass'], bass, midi, humanise(when(bar, beat), 0.004), when(bar, beat + beats), vel * float(RNG.uniform(0.95, 1.04)), 0.12)

        # Drums: kick on one and the "and" of three, snare on two and four (laid back), soft eighth hats.
        kicks = [(0, 0.9), (2.5, 0.72)] + ([(1.75, 0.42)] if bar % 2 == 0 else [])
        for beat, vel in kicks:
            hit(stems['kick'], kit['kick'], humanise(when(bar, beat), 0.003), vel)
        for beat, vel in ((1, 0.78), (3, 0.84)):
            hit(stems['snare'], kit['snare'], humanise(when(bar, beat), 0.004) + 0.014, vel)
        if bar % 2 == 1:
            hit(stems['snare'], kit['snare'], humanise(when(bar, 2.75), 0.004) + 0.01, 0.2)  # ghost note
        for i in range(8):
            vel = (0.55 if i % 2 == 0 else 0.34) * float(RNG.uniform(0.9, 1.08))
            hit(stems['hats'], kit['hat'], humanise(when(bar, i * 0.5), 0.005), vel)
        if second_time:
            for beat in (1.75, 3.25):  # a little more motion the second time round
                hit(stems['hats'], kit['hat'], humanise(when(bar, beat), 0.005), 0.22)
        if bar in (8, 16):
            hit(stems['hats'], kit['pedal'], when(bar, 3.5), 0.5)

    for bar, beat, midi, beats in MELODY:
        start = humanise(when(bar, beat), 0.005) + 0.006
        vel = (0.66 if beats >= 1 else 0.6) + (0.03 if bar in (13, 14) else 0)
        place(stems['lead'], guitar, midi, start, when(bar, beat + beats) + 0.05, vel * float(RNG.uniform(0.94, 1.05)), 0.3)

    return stems


# Balance, in dB against the melody: the tune leads, the groove sits right under it.
BALANCE = {'keys': -2.0, 'bass': -3.0, 'kick': -5.0, 'snare': -8.0, 'hats': -17.0, 'reverb': -13.0}


def level(x, a=0.0, b=LOOP):
    seg = x[int(a * SR):int(b * SR)]
    return 20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-12)


def db(v):
    return 10 ** (v / 20)


def lowpass(x, hz, order=1):
    return sosfilt(butter(order, hz, 'low', fs=SR, output='sos'), x)


def mixdown(stems):
    s = dict(stems)
    # The lo-fi colour: warm, rounded keys and guitar; dusty drums with no fizz.
    s['keys'] = lowpass(s['keys'], 3600, 2)
    s['lead'] = lowpass(s['lead'], 5200)
    s['snare'] = lowpass(s['snare'], 6500)
    s['hats'] = lowpass(s['hats'], 7500)
    s['kick'] = lowpass(s['kick'], 2500)
    s['bass'] = lowpass(s['bass'], 1800)
    ref = level(s['lead'])
    for name in ('keys', 'bass', 'kick', 'snare', 'hats'):
        s[name] = s[name] * db(ref + BALANCE[name] - level(s[name]))
    dry = sum(s.values())
    wet = fftconvolve(s['keys'] + s['lead'] + 0.5 * s['snare'] + 0.2 * s['hats'], room())[: len(dry)]
    wet *= db(level(dry) + BALANCE['reverb'] - level(wet))
    mix = dry + wet
    mix = sosfilt(butter(2, 35, 'high', fs=SR, output='sos'), mix)
    # Gentle glue: a soft saturation that rounds the peaks.
    mix = mix / np.max(np.abs(mix))
    mix = np.tanh(1.3 * mix) / np.tanh(1.3)
    mix = mix / np.max(np.abs(mix)) * db(-1.0)
    return mix.astype(np.float32), s


def encode_mp3(mix, path):
    audio = resample_poly(mix, OUT_SR // 300, SR // 300).astype(np.float32)
    audio = np.clip(audio, -1, 1)
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(OUT_SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode((audio * 32767).astype(np.int16).tobytes()) + enc.flush()
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    base = sys.argv[1]
    pkg = lambda name: os.path.join(base, name, 'package')
    tone_pattern = r'([A-G])(s?)(\d)\.mp3'
    piano = Instrument(os.path.join(pkg('piano-mp3-velocity6'), 'audio'), r'([A-G])(#?)(\d)v6\.mp3', 48, 84)
    bass = Instrument(pkg('bass-electric'), tone_pattern, 24, 60)
    guitar = Instrument(pkg('guitar-electric'), tone_pattern, 60, 96)
    drums = os.path.join(pkg('supersonic-scsynth-samples'), 'samples')
    kit = {k: load(os.path.join(drums, f)) for k, f in (
        ('kick', 'drum_bass_soft.flac'), ('snare', 'drum_snare_soft.flac'),
        ('hat', 'drum_cymbal_closed.flac'), ('pedal', 'drum_cymbal_pedal.flac'))}

    stems = perform(piano, bass, guitar, kit)
    mix, balanced = mixdown(stems)
    if '--stems' in sys.argv:
        for name, stem in balanced.items():
            print(f'  {name:6s} RMS {level(stem):6.1f} dB')

    root = os.path.join(os.path.dirname(__file__), '..', '..')
    size = encode_mp3(mix, os.path.join(root, 'assets', 'audio', 'music_theme.mp3'))
    with open(os.path.join(root, 'src', 'audio', 'music.ts'), 'w') as f:
        f.write('// Generated by scripts/audio/build_music.py: do not edit.\n')
        f.write("import theme from '../../assets/audio/music_theme.mp3';\n\n")
        f.write('/** The Night Express theme: one pass plus the tail of its last bar; passes start `loopSeconds` apart. */\n')
        f.write(f'export const MUSIC = {{ data: theme, loopSeconds: {LOOP:g} }};\n')
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        sf.write(out, mix, SR)
        # Two passes as the game plays them, to check the seam.
        twice = np.zeros(int((2 * LOOP + TAIL) * SR), dtype=np.float32)
        twice[: len(mix)] += mix
        twice[int(LOOP * SR): int(LOOP * SR) + len(mix)] += mix
        sf.write(out.replace('.wav', '_twice.wav'), twice, SR)
    rms = 20 * math.log10(float(np.sqrt(np.mean(mix[: int(LOOP * SR)] ** 2))))
    print(f'theme: {LOOP:g} s loop + {TAIL:g} s tail, {size / 1024:.0f} KB, RMS {rms:.1f} dBFS')


if __name__ == '__main__':
    main()
