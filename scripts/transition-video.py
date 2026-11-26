#!/usr/bin/env python3
"""Assembles the Grand Departure walkthrough from scripts/transition-walkthrough.mjs's frames and timeline.

Usage: python3 scripts/transition-video.py <outdir> [--voice]

Writes <outdir>/walkthrough.mp4: a chapter card (with timestamps), the recording with burned-in captions and a corner
label, and a summary card (beat timings, the chest, what carried over). With --voice, also walkthrough-voice.mp4 with
the captions read by espeak-ng (offline).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.abspath(sys.argv[1])
VOICE = '--voice' in sys.argv
FRAMES = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--frames=')), 'frames')
W, H = 540, 1168
INTRO = 9.0
SUMMARY = 12.0
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

t = json.load(open(os.path.join(OUT, 'timeline.json')))
fps = t['fps']
frames = t['numbers']['frames']
length = frames / fps


def mmss(seconds):
    return f'{int(seconds // 60)}:{int(seconds % 60):02d}'


def wrap(draw, text, font, width):
    words, lines, line = text.split(), [], ''
    for w in words:
        test = (line + ' ' + w).strip()
        if draw.textlength(test, font=font) > width and line:
            lines.append(line)
            line = w
        else:
            line = test
    if line:
        lines.append(line)
    return lines


def card(path, title, rows):
    img = Image.new('RGB', (W, H), '#14181F')
    d = ImageDraw.Draw(img)
    ft = ImageFont.truetype(BOLD, 34)
    fr = ImageFont.truetype(FONT, 22)
    fb = ImageFont.truetype(BOLD, 22)
    y = 90
    for line in wrap(d, title, ft, W - 80):
        d.text((40, y), line, font=ft, fill='#FFE7B0')
        y += 44
    y += 20
    for left, right in rows:
        if left is None:
            y += 16
            continue
        for i, line in enumerate(wrap(d, left, fb if right is None else fr, W - 170 if right else W - 80)):
            d.text((40, y), line, font=fb if right is None else fr, fill='#F2E6C9' if right is None else '#D8D2C4')
            if i == 0 and right:
                d.text((W - 40 - d.textlength(right, font=fr), y), right, font=fr, fill='#FFD27A')
            y += 30
    img.save(path)


chapters = [c for c in t['chapters'] if c['title'] != 'End']
card(os.path.join(OUT, 'intro.png'), 'Night Express: the Grand Departure (Stage A blockout walkthrough)', [
    ('Chapters', None),
    *[(c['title'], mmss(c['at'] + INTRO)) for c in chapters],
    (None, None),
    ('Stand-in shapes for every set piece; the real camera paths, timing, lever, reload and save.', ''),
])

n = t['numbers']
beats = n.get('beats') or []
chest = n.get('chest', {})
b, a = chest.get('before', {}), chest.get('after', {})
rows = [('Beat timings (seconds since the sequence started)', None)]
rows += [(x['beat'], f"{x['at']:.1f} s") for x in beats]
rows += [('Hero shot + boarding to the chest (incl. the lever wait and the reload)', f"{n.get('sequenceSeconds', 0):.1f} s")]
rows += [(None, None), ('The line-complete chest (route config)', None)]
if b and a:
    rows += [('Gems', f"{b.get('gems')} → {a.get('gems')} (+{a.get('gems', 0) - b.get('gems', 0)})"),
             ('Rail Miles', f"{b.get('railMiles')} → {a.get('railMiles')} (+{a.get('railMiles', 0) - b.get('railMiles', 0)})")]
    c = a.get('conductor', {})
    rows += [(None, None), ('Carried over (this run)', None),
             ('Conductor upgrades', f"speed {c.get('speed')}, carry {c.get('capacity')}, fares {c.get('fareBonus')}"),
             ('Fares on the new line', str(int(a.get('cash', 0)))),
             ('Route', a.get('route', ''))]
    if n.get('reloadSeconds'):
        rows += [('Reload through the tunnel', f"{n['reloadSeconds']:.1f} s real time")]
rep = n.get('replay')
if rep:
    rows += [(None, None), ('Replay (skipped at the depot)', None),
             ('Gems before / after', f"{rep['before']['gems']} / {rep['after']['gems']}")]
card(os.path.join(OUT, 'summary.png'), 'Summary', rows)

# Subtitles: captions at the bottom, the chapter in the top corner.
def ts(seconds):
    seconds = max(0, seconds)
    return f'{int(seconds // 3600)}:{int(seconds % 3600 // 60):02d}:{seconds % 60:05.2f}'


ass = ['[Script Info]', 'ScriptType: v4.00+', f'PlayResX: {W}', f'PlayResY: {H}', '',
       '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       'Style: Cap,DejaVu Sans,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,3,10,0,2,28,28,250,1',
       'Style: Corner,DejaVu Sans,17,&H00B0E7FF,&H00FFFFFF,&H001F1814,&H001F1814,1,0,0,0,100,100,0,0,3,5,0,7,12,12,90,1',
       '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
caps = t['captions']
for i, c in enumerate(caps):
    end = min(c['until'], caps[i + 1]['at']) if i + 1 < len(caps) else c['until']
    ass.append(f"Dialogue: 0,{ts(c['at'])},{ts(max(end, c['at'] + 1.5))},Cap,,0,0,0,,{c['text']}")
for i, c in enumerate(t['chapters']):
    end = t['chapters'][i + 1]['at'] if i + 1 < len(t['chapters']) else length
    ass.append(f"Dialogue: 0,{ts(c['at'])},{ts(end)},Corner,,0,0,0,,{c['title']}")
open(os.path.join(OUT, 'captions.ass'), 'w').write('\n'.join(ass) + '\n')


def run(cmd):
    print(' '.join(cmd[:6]), '…')
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


main = os.path.join(OUT, 'main.mp4')
run(['ffmpeg', '-y', '-framerate', str(fps), '-i', os.path.join(OUT, FRAMES, 'f%05d.jpg'),
     '-vf', f"scale={W}:{H}:flags=lanczos,ass={os.path.join(OUT, 'captions.ass')}",
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '30', main])
for name, seconds in (('intro', INTRO), ('summary', SUMMARY)):
    run(['ffmpeg', '-y', '-loop', '1', '-t', str(seconds), '-i', os.path.join(OUT, f'{name}.png'),
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30', os.path.join(OUT, f'{name}.mp4')])
lst = os.path.join(OUT, 'list.txt')
open(lst, 'w').write(''.join(f"file '{os.path.join(OUT, n)}.mp4'\n" for n in ('intro', 'main', 'summary')))
final = os.path.join(OUT, 'walkthrough.mp4')
run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', final])
print('wrote', final, f'{os.path.getsize(final) / 1e6:.1f} MB')

if VOICE:
    inputs, filters = [], []
    for i, c in enumerate(caps):
        wav = os.path.join(OUT, f'v{i:03d}.wav')
        subprocess.run(['espeak-ng', '-v', 'en-gb', '-s', '165', '-w', wav, c['text'].replace('›', '')], check=True)
        inputs += ['-i', wav]
        ms = int((c['at'] + INTRO) * 1000)
        filters.append(f'[{i + 1}:a]adelay={ms}|{ms}[a{i}]')
    mix = ''.join(f'[a{i}]' for i in range(len(caps)))
    filters.append(f'{mix}amix=inputs={len(caps)}:normalize=0,apad[aout]')
    voiced = os.path.join(OUT, 'walkthrough-voice.mp4')
    run(['ffmpeg', '-y', '-i', final, *inputs, '-filter_complex', ';'.join(filters), '-map', '0:v', '-map', '[aout]',
         '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', voiced])
    print('wrote', voiced)
# A phone-friendly copy small enough to host (about 12 MB): 432 px wide, 15 fps.
for name in ('walkthrough', 'walkthrough-voice'):
    src = os.path.join(OUT, f'{name}.mp4')
    if not os.path.exists(src):
        continue
    run(['ffmpeg', '-y', '-i', src, '-vf', 'fps=15,scale=432:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '31',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '48k', os.path.join(OUT, f'{name}-small.mp4')])
    print('wrote', voiced)
