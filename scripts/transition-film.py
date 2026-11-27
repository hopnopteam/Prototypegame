#!/usr/bin/env python3
"""The Grand Departure film's encoder (Stage B): the frames from scripts/transition-film.mjs, the game's own sounds
mixed onto a track at the frames they played, then the whole film and two ad cuts (30 s and 15 s) as H.264 MP4s.

Usage: python3 scripts/transition-film.py <outdir> [--crf=18]

The sound: every cue the game asked for is in film.json with its frame, its volume and pitch; each is mixed from the
game's own pre-rendered buffer (dumped by the recorder) at its step on the volume ladder, behind the game's master
level, with the same cooldown the engine keeps (so a cue the engine would have skipped is skipped here too). The
ad cuts are made of whole beats (from film.json's beat list), each trimmed to its best seconds, with a short end card.
"""
import json
import os
import subprocess
import sys

import numpy as np

out = os.path.abspath(sys.argv[1])
opts = dict(a[2:].split('=') for a in sys.argv[2:] if a.startswith('--'))
CRF = opts.get('crf', '18')
film = json.load(open(os.path.join(out, 'film.json')))
FPS = film['fps']
RATE = 48000
frames = film['frames']
length = frames / FPS


def cue(name):
    meta_path = os.path.join(out, 'cues', name + '.json')
    if not os.path.exists(meta_path):
        return None
    meta = json.load(open(meta_path))
    chans = [np.fromfile(os.path.join(out, 'cues', f'{name}.{i}.f32'), dtype=np.float32) for i in range(meta['channels'])]
    data = np.stack(chans if len(chans) == 2 else [chans[0], chans[0]])
    if meta['rate'] != RATE:
        n = int(data.shape[1] * RATE / meta['rate'])
        xs = np.linspace(0, data.shape[1] - 1, n)
        data = np.stack([np.interp(xs, np.arange(data.shape[1]), c) for c in data])
    return meta, data.astype(np.float32)


def mix_track():
    track = np.zeros((2, int((length + 4) * RATE)), dtype=np.float32)
    last = {}
    cache = {}
    master = film['mix']['master'] * film['mix']['sfx']
    for c in film['cues']:
        name = c['name']
        if name not in cache:
            cache[name] = cue(name)
        got = cache[name]
        if got is None:
            continue
        meta, data = got
        t = c['frame'] / FPS
        if t - last.get(name, -9) < meta['cooldown']:
            continue
        last[name] = t
        if c['pitch'] != 1:
            n = int(data.shape[1] / c['pitch'])
            xs = np.linspace(0, data.shape[1] - 1, n)
            data = np.stack([np.interp(xs, np.arange(data.shape[1]), ch) for ch in data]).astype(np.float32)
        start = int(t * RATE)
        end = min(track.shape[1], start + data.shape[1])
        track[:, start:end] += data[:, : end - start] * meta['level'] * c['volume'] * master
    # Peaks brought to about -1 dBFS (the game's own mix sits low for a phone speaker; a video wants it fuller).
    peak = float(np.abs(track).max() or 1)
    track *= 0.89 / peak
    track = track[:, : int(length * RATE)]
    path = os.path.join(out, 'track.wav')
    pcm = (np.clip(track.T, -1, 1) * 32767).astype('<i2')
    with open(path, 'wb') as f:
        data = pcm.tobytes()
        f.write(b'RIFF' + (36 + len(data)).to_bytes(4, 'little') + b'WAVEfmt ' + (16).to_bytes(4, 'little'))
        f.write((1).to_bytes(2, 'little') + (2).to_bytes(2, 'little') + RATE.to_bytes(4, 'little'))
        f.write((RATE * 4).to_bytes(4, 'little') + (4).to_bytes(2, 'little') + (16).to_bytes(2, 'little'))
        f.write(b'data' + len(data).to_bytes(4, 'little') + data)
    return path


def run(cmd):
    print(' '.join(cmd[:6]), '...')
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


track = mix_track()
frames_in = ['-framerate', str(FPS), '-i', os.path.join(out, 'frames', 'f%05d.jpg')]
video = ['-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
# The cuts and the film's parts for the web page: the same quality, capped so each file stays under 15 MB.
web = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '3.6M', '-bufsize', '7M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
audio = ['-c:a', 'aac', '-b:a', '160k']
run(['ffmpeg', '-y', *frames_in, '-i', track, *video, *audio, '-shortest', os.path.join(out, 'film.mp4')])


def beat_spans():
    """Each beat's first and last second in the film."""
    spans = {}
    marks = film['beats'] + [{'frame': frames, 'beat': 'end'}]
    for a, b in zip(marks, marks[1:]):
        name = a['beat']
        s, e = a['frame'] / FPS, b['frame'] / FPS
        if name in spans:
            spans[name] = (spans[name][0], e)
        else:
            spans[name] = (s, e)
    return spans


spans = beat_spans()
print('beats', {k: (round(a, 1), round(b, 1)) for k, (a, b) in spans.items()})


def cut(name, pieces):
    """A cut from (beat, from, to) pieces: `from` and `to` are seconds into that beat (negative counts from its end)."""
    parts = []
    for beat, a, b in pieces:
        if beat not in spans:
            continue
        s, e = spans[beat]
        start = s + a if a >= 0 else e + a
        stop = s + b if b > 0 else e + b
        stop = min(stop, e)
        if stop - start > 0.2:
            parts.append((start, stop))
    filt = []
    for i, (a, b) in enumerate(parts):
        filt.append(f'[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.04,afade=t=out:st={max(0, b - a - 0.06):.3f}:d=0.06[a{i}]')
    concat = ''.join(f'[v{i}][a{i}]' for i in range(len(parts)))
    filt.append(f'{concat}concat=n={len(parts)}:v=1:a=1[v][a]')
    path = os.path.join(out, name)
    run(['ffmpeg', '-y', '-i', os.path.join(out, 'film.mp4'), '-filter_complex', ';'.join(filt), '-map', '[v]', '-map', '[a]', *web, *audio, path])
    total = sum(b - a for a, b in parts)
    print(name, f'{total:.1f} s', [(round(a, 2), round(b, 2)) for a, b in parts])


# The 30 s cut: the farewell, the lever, the coupling and the tarp, the tunnel, out onto the coast, the welcome, the chest.
cut('cut-30s.mp4', [
    ('hero', 0.0, 4.5),
    ('lever', -2.2, 0),
    ('depot', 0.6, 2.2),
    ('depot', 4.2, 8.0),
    ('tunnel', 1.0, 0),
    ('dark', 0, 0.4),
    ('burst', 0, 0),
    ('arrival', 0, 5.8),
    ('chest', 0, 2.6),
])
# The 15 s cut: the hero shot, the throw, the tarp off, into the tunnel and out onto the coast.
cut('cut-15s.mp4', [
    ('hero', 0.6, 3.1),
    ('lever', -1.0, 0),
    ('depot', 6.0, 8.0),
    ('tunnel', -1.6, 0),
    ('burst', 0.7, 4.7),
    ('arrival', 1.0, 4.9),
])


def chapters():
    """The film in four parts (each under the page host's 15 MB a file): the farewell and the offer, the lever and the
    depot, the tunnel and the burst, the arrival to the postcard."""
    marks = [0, spans['lever'][0], spans['tunnel'][0], spans['arrival'][0], length]
    for n, (a, b) in enumerate(zip(marks, marks[1:]), 1):
        run(['ffmpeg', '-y', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', os.path.join(out, 'film.mp4'), *web, *audio, os.path.join(out, f'film-part{n}.mp4')])
        print(f'film-part{n}.mp4', round(a, 2), round(b, 2))


chapters()
