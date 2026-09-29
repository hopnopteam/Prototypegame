"""
Builds every sound effect in assets/audio/ (mono MP3, trimmed, faded, normalised).

Sources (all free to use, credited in assets/audio/CREDITS.md):
  - uisfx (npm, audio CC0-1.0): warm UI and reward cues from its Soft and Glass packs.
  - Kenney starter kits on GitHub (CC0): coin and build-placement thunks.
  - Rendered here for this game: the steam whistle, rail clacks, the coupling clunk, the desk bell, the
    sliding door, broom swishes, the washroom flush and the station arrival chime (modal and filtered-noise
    synthesis with a baked room reverb, so each one has a natural tail and nothing is cut short).

Usage: python3 scripts/audio/build_sounds.py <uisfx package dir> <kenney dir>
Needs: numpy scipy soundfile lameenc (pip install numpy scipy soundfile lameenc).
"""
import os
import sys

import lameenc
import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'audio')
rng = np.random.default_rng(7)


# ─── DSP helpers ──────────────────────────────────────────────────────────────

def seconds(n: float) -> int:
    return int(round(n * SR))


def time_axis(duration: float) -> np.ndarray:
    return np.arange(seconds(duration)) / SR


def noise(duration: float) -> np.ndarray:
    return rng.standard_normal(seconds(duration))


def band(x: np.ndarray, lo: float | None, hi: float | None, order: int = 2) -> np.ndarray:
    if lo and hi:
        sos = signal.butter(order, [lo, hi], btype='bandpass', fs=SR, output='sos')
    elif lo:
        sos = signal.butter(order, lo, btype='highpass', fs=SR, output='sos')
    else:
        sos = signal.butter(order, hi, btype='lowpass', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def decay(duration: float, tau: float, delay: float = 0.0) -> np.ndarray:
    t = time_axis(duration)
    e = np.exp(-np.maximum(0, t - delay) / tau)
    e[t < delay] = 0
    return e


def sweep_filter(x: np.ndarray, f0: float, f1: float, q: float = 1.5, steps: int = 48) -> np.ndarray:
    """A band-pass whose centre glides from f0 to f1 (crossfaded blocks), for swishes and water."""
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, steps + 1).astype(int)
    window = np.hanning(2 * (edges[1] - edges[0]) + 2)
    hop = edges[1] - edges[0]
    for i in range(steps):
        fc = f0 * (f1 / f0) ** (i / max(1, steps - 1))
        lo, hi = fc / (1 + 1 / (2 * q)), fc * (1 + 1 / (2 * q))
        a = max(0, edges[i] - hop)
        b = min(n, edges[i] + 2 * hop)
        seg = band(x[a:b], lo, min(hi, SR / 2 - 100))
        w = np.hanning(b - a)
        out[a:b] += seg * w
    del window
    return out


def modal(freqs, amps, taus, duration: float, detune: float = 0.0) -> np.ndarray:
    """A struck object: decaying partials, each optionally doubled slightly apart so it shimmers."""
    t = time_axis(duration)
    out = np.zeros_like(t)
    for f, a, tau in zip(freqs, amps, taus):
        phase = rng.uniform(0, 2 * np.pi)
        out += a * np.sin(2 * np.pi * f * t + phase) * np.exp(-t / tau)
        if detune:
            out += a * 0.6 * np.sin(2 * np.pi * f * (1 + detune) * t + phase * 1.3) * np.exp(-t / (tau * 0.9))
    return out


def reverb(x: np.ndarray, length: float, wet: float, bright: float = 4000.0) -> np.ndarray:
    """A small synthetic room: exponentially decaying noise, darker as it fades, mixed under the dry sound."""
    t = time_axis(length)
    ir = rng.standard_normal(len(t)) * np.exp(-t * 6.9 / length)
    early = band(ir, None, bright)
    late = band(ir, None, bright * 0.35)
    mix = np.clip(t / length * 1.8, 0, 1)
    ir = early * (1 - mix) + late * mix
    ir[: seconds(0.008)] = 0  # pre-delay
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    # Anything still ringing at the end of the dry buffer fades out rather than stopping dead.
    x = x.copy()
    tail_len = min(len(x) // 4, seconds(0.35))
    x[-tail_len:] *= np.linspace(1, 0, tail_len) ** 2
    dry = np.concatenate([x, np.zeros(len(t))])
    tail = np.zeros_like(dry)
    conv = signal.fftconvolve(x, ir)
    tail[: min(len(dry), len(conv))] = conv[: len(dry)]
    return dry + wet * tail


def fade(x: np.ndarray, fade_in: float = 0.002, fade_out: float = 0.03) -> np.ndarray:
    x = x.copy()
    a, b = seconds(fade_in), seconds(fade_out)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b) ** 2
    return x


def trim(x: np.ndarray, threshold: float = 10 ** (-52 / 20)) -> np.ndarray:
    """Drops leading silence and the inaudible end of the tail."""
    peak = np.max(np.abs(x)) + 1e-12
    loud = np.where(np.abs(x) > peak * threshold)[0]
    if len(loud) == 0:
        return x
    return x[max(0, loud[0] - 16): loud[-1] + seconds(0.01)]


def normalise(x: np.ndarray, peak_db: float = -1.0) -> np.ndarray:
    return x / (np.max(np.abs(x)) + 1e-12) * 10 ** (peak_db / 20)


def resample(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == SR:
        return x
    g = np.gcd(sr, SR)
    return signal.resample_poly(x, SR // g, sr // g)


def write(name: str, x: np.ndarray, kbps: int = 64) -> None:
    x = normalise(fade(trim(x)))
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm.tobytes()) + enc.flush()
    with open(os.path.join(OUT, f'{name}.mp3'), 'wb') as f:
        f.write(data)
    print(f'{name:18s} {len(x) / SR:5.2f}s {len(data) / 1024:5.1f} KB')


def load(path: str) -> np.ndarray:
    d, sr = sf.read(path)
    if d.ndim > 1:
        d = d.mean(axis=1)
    return resample(d, sr)


# ─── Rendered sounds ──────────────────────────────────────────────────────────

def steam_whistle(duration: float) -> np.ndarray:
    """A three-chime steam whistle in F major: pitches bend up as the steam builds, breathy, then sighs off."""
    t = time_axis(duration)
    n = len(t)
    attack, release = 0.1, min(0.3, duration * 0.35)
    amp = np.clip(t / attack, 0, 1) ** 1.6
    rel = np.clip((duration - t) / release, 0, 1)
    amp *= rel ** 1.3
    amp *= 1 + 0.06 * np.sin(2 * np.pi * 0.9 * t)  # the swell of a pulled cord
    out = np.zeros(n)
    for f0, level in ((349.2, 1.0), (440.0, 0.85), (523.3, 0.8), (698.5, 0.25)):
        bend = 1 - 0.04 * np.exp(-t / 0.07) - 0.025 * (1 - rel)
        wander = 1 + 0.0025 * np.sin(2 * np.pi * 5.3 * t + rng.uniform(0, 6)) + 0.001 * band(noise(duration), None, 6) * 40
        freq = f0 * bend * wander
        phase = 2 * np.pi * np.cumsum(freq) / SR
        pipe = sum((1 / k ** 1.25) * (0.7 if k % 2 == 0 else 1.0) * np.sin(k * phase) for k in range(1, 7))
        breath = band(noise(duration), f0 * 0.9, f0 * 1.12) * 0.9
        out += level * (pipe + breath)
    # A puff of steam as the valve opens, then only a breath of hiss under the chord.
    hiss_env = 0.1 * np.exp(-t / 0.1) + 0.022 + 0.015 * (1 - rel)
    hiss = band(noise(duration), 2200, 7000) * hiss_env
    out = out / 4 * amp + hiss * np.clip(t / 0.02, 0, 1) * np.clip((duration - t) / 0.35, 0, 1) ** 1.5
    out = band(out, 120, None)
    return reverb(out, 1.3, 0.3, 5000)


def rail_clack(variant: int) -> np.ndarray:
    """One wheel over a rail joint: a dull knock with a little metal in it."""
    d = 0.22
    t = time_axis(d)
    shift = [1.0, 0.93, 1.07][variant]
    thump = np.sin(2 * np.pi * (85 * shift) * t * (1 - 0.25 * t / d)) * np.exp(-t / 0.03)
    knock = band(noise(d), 250 * shift, 1300 * shift) * np.exp(-t / 0.012)
    metal = modal([1210 * shift, 2470 * shift, 3830 * shift], [0.18, 0.1, 0.05], [0.04, 0.025, 0.015], d)
    click = band(noise(d), 3000, 8000) * np.exp(-t / 0.002) * 0.3
    return reverb(thump * 0.9 + knock * 0.7 + metal + click, 0.3, 0.12, 3000)


def coupling_clunk() -> np.ndarray:
    """Two carriages meeting: a heavy low thud, a ringing iron clank, a rattle of chains settling."""
    d = 2.6
    t = time_axis(d)
    boom = np.sin(2 * np.pi * np.cumsum(75 - 33 * (1 - np.exp(-t / 0.15))) / SR) * np.exp(-t / 0.2)
    clank = modal([217, 563, 911, 1387, 2231, 3120], [0.5, 0.45, 0.35, 0.28, 0.18, 0.1], [0.8, 0.55, 0.4, 0.28, 0.18, 0.1], d, detune=0.004)
    crack = band(noise(d), 900, 5000) * np.exp(-t / 0.012) * 0.7
    air = band(noise(d), None, 220) * np.exp(-t / 0.09) * 1.2
    rattle = np.zeros_like(t)
    for delay, level in ((0.07, 0.25), (0.13, 0.16), (0.2, 0.1), (0.29, 0.06)):
        i = seconds(delay)
        ping = modal([1810, 2650, 4100], [1, 0.6, 0.3], [0.03, 0.02, 0.012], 0.12)
        rattle[i: i + len(ping)] += ping * level
    return reverb(boom * 1.1 + clank + crack + air + rattle, 1.4, 0.28, 3500)


def desk_bell() -> np.ndarray:
    """A brass service bell: a bright ding that rings on, with a gentle shimmer."""
    d = 2.4
    t = time_axis(d)
    f0 = 2093.0
    ring = modal([f0, f0 * 2.76, f0 * 5.4, f0 * 8.93], [1.0, 0.35, 0.16, 0.07], [0.85, 0.4, 0.2, 0.1], d, detune=0.0022)
    strike = band(noise(d), 2500, 9000) * np.exp(-t / 0.002) * 0.35
    plunger = np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.012) * 0.25
    return reverb(ring + strike + plunger, 0.7, 0.2, 6000)


def door_slide() -> np.ndarray:
    """A carriage door rolling open on its runner and settling with a soft latch."""
    d = 0.62
    t = time_axis(d)
    env = np.clip(t / 0.08, 0, 1) * np.clip((0.44 - t) / 0.12, 0, 1)
    rumble = band(noise(d), None, 190) * env * 1.6
    air = band(noise(d), 500, 1600) * env * 0.18
    roller = np.sin(2 * np.pi * 138 * t) * (0.8 + 0.2 * np.sin(2 * np.pi * 23 * t)) * env * 0.07
    latch = np.zeros_like(t)
    i = seconds(0.43)
    tick = band(noise(0.06), 2000, 5000) * decay(0.06, 0.003) * 0.3 + np.sin(2 * np.pi * 240 * time_axis(0.06)) * decay(0.06, 0.018) * 0.35
    latch[i: i + len(tick)] += tick
    return reverb(rumble + air + roller + latch, 0.35, 0.12, 3000)


def broom_swish(variant: int) -> np.ndarray:
    """A brisk sweep of bristles over boards."""
    d = 0.34
    t = time_axis(d)
    f0, f1 = (3800, 1700) if variant == 0 else (3200, 1500)
    env = np.clip(t / 0.035, 0, 1) * np.exp(-np.maximum(0, t - 0.05) / 0.08)
    grain = 0.55 + 0.45 * np.abs(band(noise(d), None, 380)) / 0.2
    x = sweep_filter(noise(d), f0, f1, q=1.2) * env * np.clip(grain, 0, 1.5)
    return reverb(x, 0.25, 0.1, 5000)


def flush() -> np.ndarray:
    """A small train loo: a rush of water that swirls away and gurgles."""
    d = 1.3
    t = time_axis(d)
    env = np.clip(t / 0.06, 0, 1) * np.exp(-np.maximum(0, t - 0.25) / 0.35)
    water = sweep_filter(noise(d), 1700, 380, q=1.0) * env
    bubbles = np.zeros_like(t)
    for _ in range(26):
        start = rng.uniform(0.15, 1.05)
        f = rng.uniform(300, 900)
        bd = 0.06
        bt = time_axis(bd)
        blip = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.5 * bt / bd)) / SR) * np.exp(-bt / 0.018)
        i = seconds(start)
        bubbles[i: i + len(blip)] += blip[: len(bubbles) - i] * rng.uniform(0.05, 0.14) * np.exp(-start * 1.5)
    low = band(noise(d), None, 160) * env * 0.8
    return reverb(water + bubbles + low, 0.5, 0.2, 4000)


def station_chime() -> np.ndarray:
    """The platform announcement chime: three warm vibraphone notes rising (C, E, G)."""
    d = 3.0
    t = time_axis(d)
    out = np.zeros_like(t)
    for k, f in enumerate((523.25, 659.26, 783.99)):
        start = k * 0.3
        nt = time_axis(d - start)
        note = (np.sin(2 * np.pi * f * nt) * np.exp(-nt / 0.8)
                + 0.22 * np.sin(2 * np.pi * f * 4 * nt) * np.exp(-nt / 0.25)
                + 0.06 * np.sin(2 * np.pi * f * 10 * nt) * np.exp(-nt / 0.05))
        note *= 1 + 0.12 * np.sin(2 * np.pi * 5.2 * nt)
        note *= np.clip(nt / 0.004, 0, 1)
        i = seconds(start)
        out[i: i + len(note)] += note * (1.0 if k < 2 else 1.1)
    return reverb(out, 1.8, 0.35, 5000)


def footstep(variant: int) -> np.ndarray:
    """A soft shoe on floorboards: a low hollow knock with a touch of scuff."""
    d = 0.16
    t = time_axis(d)
    shift = [1.0, 0.9, 1.12][variant]
    knock = np.sin(2 * np.pi * 115 * shift * t * (1 - 0.3 * t / d)) * np.exp(-t / 0.022)
    body = band(noise(d), 180 * shift, 900 * shift) * np.exp(-t / 0.014) * 0.8
    scuff = band(noise(d), 1500, 5000) * np.exp(-np.maximum(0, t - 0.01) / 0.02) * 0.18
    return reverb(knock + body + scuff, 0.18, 0.1, 3000)


def creak(variant: int) -> np.ndarray:
    """An old floorboard giving under a foot: a short rubbing squeak that bends in pitch."""
    d = 0.42
    t = time_axis(d)
    f0, f1 = ((420, 360), (300, 345), (520, 450))[variant]
    freq = f0 + (f1 - f0) * (t / d)
    # Stick-slip friction: the tone is chopped into fast little grabs.
    grab = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(38 + 12 * np.sin(2 * np.pi * 3 * t)) / SR))
    tone = sum(np.sin(2 * np.pi * np.cumsum(freq * k) / SR) / k for k in (1, 2, 3))
    env = np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.12, 0, 1)
    wood = band(noise(d), 250, 1200) * 0.35
    x = band(tone * (0.35 + 0.65 * grab) + wood, 180, 2600) * env
    return reverb(x, 0.3, 0.15, 3000)


def main() -> None:
    uisfx, kenney = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    picks = {
        'ui_press': 'soft/press', 'ui_snap': 'soft/snap', 'ui_drop': 'soft/drop', 'ui_notify': 'soft/notification',
        'ui_reaction': 'soft/reaction', 'ui_error': 'soft/invalid-drop', 'ui_blocked': 'soft/blocked',
        'ui_swipe': 'soft/swipe', 'ui_success': 'soft/success', 'ui_check': 'glass/check', 'ui_reward': 'glass/reward',
        'ui_unlock': 'glass/unlock', 'ui_levelup': 'glass/level-up', 'ui_achievement': 'glass/achievement',
        'ui_purchase': 'glass/purchase', 'ui_streak': 'glass/streak',
    }
    for name, path in picks.items():
        write(name, load(os.path.join(uisfx, 'sounds', path + '.ogg')), 56)
    write('k_coin', load(os.path.join(kenney, 'Starter-Kit-3D-Platformer/sounds/coin.ogg')), 56)
    for v in 'abcd':
        write(f'k_place_{v}', load(os.path.join(kenney, f'Starter-Kit-City-Builder/sounds/placement-{v}.ogg')), 56)
    write('r_whistle', steam_whistle(1.6), 56)
    write('r_whistle_short', steam_whistle(0.62), 56)
    for v in range(3):
        write(f'r_clack_{v}', rail_clack(v), 48)
    write('r_clunk', coupling_clunk(), 56)
    write('r_bell', desk_bell(), 48)
    write('r_door', door_slide(), 48)
    for v in range(2):
        write(f'r_broom_{v}', broom_swish(v), 48)
    write('r_flush', flush(), 48)
    write('r_chime', station_chime(), 48)
    for v in range(3):
        write(f'r_step_{v}', footstep(v), 40)
        write(f'r_creak_{v}', creak(v), 40)


if __name__ == '__main__':
    main()
