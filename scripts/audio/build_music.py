#!/usr/bin/env python3
"""Renders the Night Express theme: an original jazz waltz for piano and strings.

The score below is the source of the music. It is played from real instrument recordings (Salamander
Grand Piano V3 by Alexander Holm; contrabass, cello, violin and harp from nbrosowsky/tonejs-instruments;
all CC BY 3.0, credited in assets/audio/CREDITS.md), mixed with a concert-hall reverb and written as one
small mono MP3 plus a generated TypeScript module holding its loop length.

The file holds one pass of the tune plus the tail of its last bar. The game starts each pass exactly one
loop length after the previous one, so the tail rings into the next pass as in a live performance (a
seamless loop, whatever padding the MP3 decoder adds).

Usage (sample packages from npm, unpacked):
  npm pack @audio-samples/piano-mp3-velocity6 @audio-samples/piano-mp3-velocity8 \
    tonejs-instrument-contrabass-mp3 tonejs-instrument-cello-mp3 tonejs-instrument-violin-mp3 \
    tonejs-instrument-harp-mp3   # then untar each into <dir>/<name>/
  python3 scripts/audio/build_music.py <dir> [--preview out.wav]
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
BPM = 120
BEAT = 60 / BPM
BAR = 3 * BEAT
BARS = 32
LOOP = BARS * BAR
TAIL = 3.5
SWING = 0.58  # where the off-beat eighth falls (0.5 = straight)
RNG = np.random.default_rng(1905)

# ─── Harmony ────────────────────────────────────────────────────────────────
# Each chord: bass root (MIDI, low register), the waltz arpeggio (6 eighths) and a rootless voicing
# for the second half's comping. Voicings are written out by hand for smooth voice leading.
CHORDS = {
    'Fmaj7':  dict(root=41, arp=[41, 48, 57, 64, 57, 48], voicing=[57, 60, 64, 67], tones=[5, 9, 0, 4, 7]),
    'A+7':    dict(root=45, arp=[45, 53, 61, 67, 61, 53], voicing=[55, 61, 65, 67], tones=[9, 1, 5, 7]),
    'Bbmaj7': dict(root=34, arp=[34, 41, 50, 57, 50, 41], voicing=[57, 60, 62, 65], tones=[10, 2, 5, 9, 0]),
    'D7b9':   dict(root=38, arp=[38, 45, 54, 60, 54, 45], voicing=[54, 57, 60, 63], tones=[2, 6, 9, 0, 3]),
    'Gm7':    dict(root=43, arp=[43, 50, 58, 65, 58, 50], voicing=[53, 57, 58, 62], tones=[7, 10, 2, 5, 9]),
    'C7':     dict(root=36, arp=[36, 43, 52, 58, 52, 43], voicing=[52, 57, 58, 62], tones=[0, 4, 7, 10, 2, 9]),
    'Am7':    dict(root=45, arp=[45, 52, 60, 67, 60, 52], voicing=[55, 59, 60, 64], tones=[9, 0, 4, 7, 11]),
    'Abdim7': dict(root=44, arp=[44, 50, 59, 65, 59, 50], voicing=[56, 59, 62, 65], tones=[8, 11, 2, 5]),
    'Bbm6':   dict(root=34, arp=[34, 41, 49, 55, 49, 41], voicing=[55, 58, 61, 65], tones=[10, 1, 5, 7]),
    'Cm7':    dict(root=36, arp=[36, 43, 51, 58, 51, 43], voicing=[51, 55, 58, 62], tones=[0, 3, 7, 10, 2]),
    'F7':     dict(root=41, arp=[41, 48, 57, 63, 57, 48], voicing=[51, 55, 57, 62], tones=[5, 9, 0, 3, 7, 2]),
    'Eb9':    dict(root=39, arp=[39, 46, 55, 61, 55, 46], voicing=[55, 58, 61, 65], tones=[3, 7, 10, 1, 5]),
    'C9sus':  dict(root=36, arp=[36, 43, 53, 58, 62, 43], voicing=[55, 58, 62, 65], tones=[0, 5, 7, 10, 2]),
    'C7b9':   dict(root=36, arp=[36, 43, 52, 58, 52, 43], voicing=[52, 55, 58, 61], tones=[0, 4, 7, 10, 1]),
}

# One entry per bar; a tuple splits the bar (first chord two beats, second one beat).
FORM = [
    # A: the theme over flowing arpeggios (solo piano)
    'Fmaj7', 'A+7', 'Bbmaj7', 'D7b9', 'Gm7', 'D7b9', 'Gm7', ('C9sus', 'C7'),
    'Am7', 'Abdim7', 'Gm7', 'C7', 'Am7', 'D7b9', 'Gm7', 'C7',
    # B: the strings come in, the piano comps a waltz
    'Bbmaj7', 'Bbm6', 'Am7', 'Abdim7', 'Gm7', 'C7', 'Fmaj7', ('Cm7', 'F7'),
    'Bbmaj7', 'Eb9', 'Am7', 'D7b9', 'Gm7', 'C7', 'C9sus', 'C7b9',
]

# ─── Melody: (bar, beat, MIDI, beats) ────────────────────────────────────────
C5, Cs5, D5, Eb5, E5, F5, Fs5, G5, Ab5, A5, Bb5, B5 = range(72, 84)
C6, Cs6, D6, Eb6, E6, F6, Fs6, G6, Ab6, A6 = range(84, 94)
MELODY = [
    (1, 0, A5, 1), (1, 1, C6, 1), (1, 2, E6, 1),
    (2, 0, F6, 3),
    (3, 0, D6, 2), (3, 2, C6, 1),
    (4, 0, Eb6, 1.5), (4, 1.5, D6, 0.5), (4, 2, C6, 1),
    (5, 0, Bb5, 2), (5, 2, A5, 1),
    (6, 0, Fs5, 2), (6, 2, A5, 1),
    (7, 0, G5, 1), (7, 1, Bb5, 1), (7, 2, D6, 1),
    (8, 0, F6, 2), (8, 2, E6, 1),
    (9, 0, C6, 2), (9, 2, A5, 1),
    (10, 0, B5, 1), (10, 1, D6, 1), (10, 2, F6, 1),
    (11, 0, F6, 1.5), (11, 1.5, D6, 0.5), (11, 2, Bb5, 1),
    (12, 0, A5, 2), (12, 2, G5, 1),
    (13, 0, C6, 1), (13, 1, E6, 1), (13, 2, G6, 1),
    (14, 0, Fs6, 1.5), (14, 1.5, E6, 0.5), (14, 2, D6, 1),
    (15, 0, C6, 1.5), (15, 1.5, Bb5, 0.5), (15, 2, A5, 1),
    (16, 0, E5, 1), (16, 1, G5, 1), (16, 2, Bb5, 1),
    (17, 0, A5, 3),
    (18, 0, Cs6, 1.5), (18, 1.5, C6, 0.5), (18, 2, Bb5, 1),
    (19, 0, C6, 3),
    (20, 0, B5, 1), (20, 1, D6, 1), (20, 2, F6, 1),
    (21, 0, F6, 2), (21, 2, D6, 1),
    (22, 0, E6, 1.5), (22, 1.5, D6, 0.5), (22, 2, C6, 1),
    (23, 0, C6, 1), (23, 1, E6, 1), (23, 2, A6, 1),
    (24, 0, G6, 2), (24, 2, Eb6, 1),
    (25, 0, D6, 2), (25, 2, F6, 1),
    (26, 0, G6, 2), (26, 2, F6, 1),
    (27, 0, E6, 3),
    (28, 0, Eb6, 1), (28, 1, C6, 1), (28, 2, A5, 1),
    (29, 0, Bb5, 2), (29, 2, A5, 1),
    (30, 0, G5, 3),
    (31, 0, F5, 2), (31, 2, G5, 1),
    (32, 0, Cs6, 1), (32, 1, Bb5, 1), (32, 2, G5, 1),
]

# Strings (second half): (bar, beat, beats, [contrabass, cello, violin 2, violin 1]), voice-led by hand.
STRINGS = [
    (17, 0, 3, [34, 53, 62, 69]), (18, 0, 3, [34, 53, 61, 67]), (19, 0, 3, [33, 52, 60, 67]),
    (20, 0, 3, [32, 50, 59, 65]), (21, 0, 3, [31, 50, 58, 65]), (22, 0, 3, [36, 52, 58, 64]),
    (23, 0, 3, [41, 53, 57, 64]), (24, 0, 2, [36, 51, 58, 62]), (24, 2, 1, [41, 51, 57, 63]),
    (25, 0, 3, [34, 50, 57, 62]), (26, 0, 3, [39, 55, 58, 61]), (27, 0, 3, [45, 52, 55, 60]),
    (28, 0, 3, [38, 54, 57, 60]), (29, 0, 3, [43, 50, 53, 58]), (30, 0, 3, [36, 52, 55, 58]),
    (31, 0, 3, [36, 53, 55, 58]), (32, 0, 3, [36, 52, 55, 61]),
]
# Level of the string section through the second half: in softly, a swell at the peak, gone by the loop.
STRING_LEVEL = {17: 0.45, 18: 0.6, 19: 0.66, 20: 0.7, 21: 0.72, 22: 0.74, 23: 0.8, 24: 0.86,
                25: 0.92, 26: 0.9, 27: 0.84, 28: 0.76, 29: 0.66, 30: 0.54, 31: 0.4, 32: 0.26}

# A harp run up a B-flat major 7th on the last beat of bar 16: the lift into the second half.
HARP_RUN = [(16, 2 + i / 8, n, 1.2) for i, n in enumerate([58, 62, 65, 69, 70, 74, 77, 81])]


def when(bar, beat):
    """Seconds from the top for a bar (1-based) and beat (quarters from 0), with swung eighths."""
    whole = math.floor(beat + 1e-9)
    frac = beat - whole
    if abs(frac - 0.5) < 1e-6:
        frac = SWING
    return ((bar - 1) * 3 + whole + frac) * BEAT


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


def place(out, inst, midi, start, end, vel, release, attack=0.0, curve=1.6):
    """Adds one note: sounds from `start` to `end` (seconds), then damps over `release`."""
    key, src = inst.nearest(midi)
    ratio = 2 ** ((midi - key) / 12)
    start = max(0.0, start)
    held = max(0.02, end - start)
    n = int((held + release) * SR)
    s0 = int(start * SR)
    n = min(n, len(out) - s0)
    if n <= 0:
        return
    wave = repitch(src, ratio, n)
    env = np.ones(n, dtype=np.float32)
    if attack > 0:
        a = min(n, int(attack * SR))
        env[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    h = min(n, int(held * SR))
    tail = n - h
    if tail > 0:
        env[h:] *= np.exp(-6.9 * np.arange(tail) / max(1, int(release * SR))).astype(np.float32)
    out[s0:s0 + n] += wave * env * (vel ** curve)


def humanise(t, spread):
    return t + float(RNG.normal(0, spread))


# ─── Reverb ─────────────────────────────────────────────────────────────────
def hall(seconds=2.4, rt60_low=2.3, rt60_high=1.1, predelay=0.02):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n).astype(np.float32)
    low = sosfilt(butter(2, 900, 'low', fs=SR, output='sos'), noise)
    high = noise - low
    ir = low * np.exp(-6.9 * t / rt60_low) + 0.6 * high * np.exp(-6.9 * t / rt60_high)
    ir[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))  # no hard edge
    for delay, gain in [(0.011, 0.5), (0.019, 0.38), (0.027, 0.3), (0.041, 0.22)]:
        ir[int(delay * SR)] += gain * 3
    ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
    return (ir / np.sqrt(np.sum(ir ** 2))).astype(np.float32)


# ─── Performance ────────────────────────────────────────────────────────────
def chord_at(bar, beat):
    c = FORM[bar - 1]
    if isinstance(c, tuple):
        return CHORDS[c[0] if beat < 2 else c[1]]
    return CHORDS[c]


def harmony_below(bar, beat, midi):
    """A sweet third or sixth under a long melody note, taken from the chord."""
    tones = chord_at(bar, beat)['tones']
    for gap in (3, 4, 8, 9):
        if (midi - gap) % 12 in tones:
            return midi - gap
    return None


def phrase_shape(bar):
    """A gentle rise and fall over each four-bar phrase, and a lift towards the peak of each half."""
    pos = ((bar - 1) % 4) / 4
    arc = 0.06 * math.sin(math.pi * (pos + 0.12))
    half = (bar - 1) % 16
    lift = 0.05 * math.sin(math.pi * min(1, half / 13))
    return arc + lift


def perform(piano_soft, piano, bass, cello, violin, harp):
    n = int((LOOP + TAIL) * SR)
    left = np.zeros(n, dtype=np.float32)
    tune = np.zeros(n, dtype=np.float32)
    strings = np.zeros(n, dtype=np.float32)
    harps = np.zeros(n, dtype=np.float32)

    for bar in range(1, BARS + 1):
        bar_start = when(bar, 0)
        pedal_up = when(bar + 1, 0) + 0.04
        section_a = bar <= 16
        # Left hand. A: flowing waltz arpeggios under the pedal. B: bass on one, chords on two and three.
        split = isinstance(FORM[bar - 1], tuple)
        if section_a:
            for i in range(6):
                beat = i * 0.5
                c = chord_at(bar, beat)
                midi = c['arp'][i]
                vel = (0.46 if i == 0 else 0.36 - 0.02 * (i % 2)) + phrase_shape(bar) * 0.5
                # The pedal changes with the chord (mid-bar when the bar holds two).
                end = when(bar, 2) + 0.03 if split and beat < 2 else pedal_up
                place(left, piano_soft, midi, humanise(when(bar, beat), 0.007), end, vel * float(RNG.uniform(0.94, 1.04)), 0.18)
        else:
            for beat in (0, 2) if split else (0,):
                c = chord_at(bar, beat)
                end = pedal_up if beat == 2 or not split else when(bar, 2) + 0.03
                place(left, piano_soft, c['root'], humanise(when(bar, beat), 0.006), end, 0.5, 0.2)
            for beat, level, length in ((1, 0.36, 0.95), (2, 0.27, 0.7)):
                c = chord_at(bar, beat)
                t = humanise(when(bar, beat), 0.008)
                for k, midi in enumerate(c['voicing']):
                    place(left, piano_soft, midi, t + k * 0.006, t + length * BEAT, level * float(RNG.uniform(0.94, 1.05)), 0.16)

    # Right hand: the melody, sung a little louder, with thirds and sixths under long notes in B.
    for bar, beat, midi, beats in MELODY:
        start = humanise(when(bar, beat), 0.006) - 0.004
        end = when(bar, beat + beats) + 0.04
        vel = 0.6 + phrase_shape(bar) + (0.03 if bar > 16 else 0) - (0.08 if bar >= 30 else 0)
        vel += 0.04 if beats >= 2 else 0
        vel *= float(RNG.uniform(0.95, 1.04))
        place(tune, piano, midi, start, end, vel, 0.28)
        if bar > 16 and beats >= 2:
            under = harmony_below(bar, beat, midi)
            if under:
                place(tune, piano, under, start + 0.01, end, vel * 0.72, 0.28)

    # Strings: slow bows, overlapping from chord to chord.
    for bar, beat, beats, notes in STRINGS:
        start = when(bar, beat) - 0.05
        end = when(bar, beat + beats) + 0.12
        level = STRING_LEVEL[bar]
        for inst, midi, gain in zip((bass, cello, violin, violin), notes, (0.34, 0.5, 0.38, 0.44)):
            place(strings, inst, midi, start, end, level * gain, 0.5, attack=0.35, curve=1.0)

    for bar, beat, midi, beats in HARP_RUN:
        place(harps, harp, midi, when(bar, beat), when(bar, beat) + beats * BEAT, 0.34, 0.8, curve=1.0)

    return left, tune, strings, harps


# Balance, in dB against the melody: the tune always leads, the strings are a bed under it.
BALANCE = {'left': -5.0, 'strings': -9.0, 'harp': -9.0, 'reverb': -10.0}


def level(x, a=0.0, b=LOOP):
    seg = x[int(a * SR):int(b * SR)]
    return 20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-12)


def db(v):
    return 10 ** (v / 20)


def mixdown(left, tune, strings, harps):
    b_start = 16 * BAR
    # Strings sit back: no rumble, no edge.
    strings = sosfilt(butter(2, 70, 'high', fs=SR, output='sos'), strings)
    strings = sosfilt(butter(1, 4800, 'low', fs=SR, output='sos'), strings)
    run = (when(16, 2) - 0.05, when(17, 0) + 0.6)
    # The recordings are mellow; a small lift above 2 kHz keeps the tune clear on a phone speaker.
    tune = tune + 0.4 * sosfilt(butter(1, 2000, 'high', fs=SR, output='sos'), tune)
    left = left * db(level(tune) + BALANCE['left'] - level(left))
    strings = strings * db(level(tune, b_start) + BALANCE['strings'] - level(strings, b_start))
    harps = harps * db(level(tune, *run) + BALANCE['harp'] - level(harps, *run))
    dry = left + tune + strings + harps
    wet = fftconvolve(left + tune + 1.4 * strings + harps, hall())[: len(dry)]
    wet *= db(level(dry) + BALANCE['reverb'] - level(wet))
    mix = dry + wet
    # Phone speakers turn low end into mud: a gentle low shelf and a rumble filter keep it clear.
    mix = sosfilt(butter(2, 45, 'high', fs=SR, output='sos'), mix)
    mix = mix - 0.3 * sosfilt(butter(1, 170, 'low', fs=SR, output='sos'), mix)
    # A touch of warmth: tame the brittle top.
    mix = mix - 0.15 * sosfilt(butter(1, 7000, 'high', fs=SR, output='sos'), mix)
    mix = mix / np.max(np.abs(mix)) * db(-1.0)
    return mix.astype(np.float32)


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
    piano_pattern = lambda v: r'([A-G])(#?)(\d)v' + v + r'\.mp3'
    tone_pattern = r'([A-G])(s?)(\d)\.mp3'
    piano_soft = Instrument(os.path.join(pkg('piano-mp3-velocity6'), 'audio'), piano_pattern('6'), 28, 100)
    piano = Instrument(os.path.join(pkg('piano-mp3-velocity8'), 'audio'), piano_pattern('8'), 60, 100)
    bass = Instrument(pkg('contrabass'), tone_pattern, 28, 50)  # the top three files are labelled an octave high
    cello = Instrument(pkg('cello'), tone_pattern)
    violin = Instrument(pkg('violin'), tone_pattern)
    harp = Instrument(pkg('harp'), tone_pattern)

    stems = perform(piano_soft, piano, bass, cello, violin, harp)
    mix = mixdown(*stems)
    if '--stems' in sys.argv:
        for name, stem in zip(('left', 'tune', 'strings', 'harp'), stems):
            for label, a, b in (('A', 0, 16 * BAR), ('B', 16 * BAR, LOOP)):
                seg = stem[int(a * SR):int(b * SR)]
                print(f'  {name:8s} {label}: RMS {20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9):6.1f} dB')

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
