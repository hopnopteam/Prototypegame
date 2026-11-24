"""Visual overhaul: before | after | reference triptychs of the vertical slice (docs/art/compare/).

Usage: python3 -I scripts/art-compare.py <before dir> <after dir> [out dir]
Pairs every slice-*.png present in both dirs; the reference is picked by the shot's name (station → ref 1, sleeper →
ref 3, riviera/honeymoon → ref 2). Each image is scaled to the same height and labelled.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFS = os.path.join(ROOT, 'docs', 'art', 'refs')
before, after = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, 'docs', 'art', 'compare')
os.makedirs(out, exist_ok=True)
H = 1100


def ref_for(name):
    if 'station' in name:
        return 'ref_station_night.png'
    if 'sleeper' in name:
        return 'ref_sleeper_night.png'
    return 'ref_riviera_golden.png'


def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('DejaVuSans-Bold.ttf', 34)
    except OSError:
        font = ImageFont.load_default()
    d.rectangle((0, 0, im.width, 52), fill=(15, 20, 40))
    d.text((16, 8), text, fill=(255, 225, 150), font=font)
    return im


for name in sorted(os.listdir(after)):
    if not (name.startswith('slice-') and name.endswith('.png')) or not os.path.exists(os.path.join(before, name)):
        continue
    panels = []
    for path, text in [(os.path.join(before, name), 'BEFORE (classic)'), (os.path.join(after, name), 'AFTER (?look=new)'), (os.path.join(REFS, ref_for(name)), 'REFERENCE')]:
        im = Image.open(path).convert('RGB')
        im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
        panels.append(label(im, text))
    sheet = Image.new('RGB', (sum(p.width for p in panels) + 16 * 2, H), (15, 20, 40))
    x = 0
    for p in panels:
        sheet.paste(p, (x, 0))
        x += p.width + 16
    dst = os.path.join(out, name.replace('.png', '.jpg'))
    sheet.save(dst, quality=84)
    print('wrote', dst)
