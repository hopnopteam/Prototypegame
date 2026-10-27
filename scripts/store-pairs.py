"""Before/after pairs for the store (session 38c): each carriage's run-down shot (b-NN-name.png) beside its refitted
shot (c-NN-name.png), from the same camera, with a BEFORE and an AFTER ribbon, into <dir>/pairs/.
Usage: python3 scripts/store-pairs.py <dir>"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
INK = (43, 34, 48)
BEFORE = (122, 112, 128)
AFTER = (232, 168, 44)


def ribbon(img, text, colour):
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 64)
    w = draw.textlength(text, font=font)
    pad, h = 44, 104
    x0, y0 = (img.width - w) / 2 - pad, 70
    draw.rounded_rectangle((x0, y0 + 8, x0 + w + 2 * pad, y0 + h + 8), 52, fill=INK)
    draw.rounded_rectangle((x0, y0, x0 + w + 2 * pad, y0 + h), 52, fill=colour, outline=INK, width=6)
    draw.text((img.width / 2, y0 + h / 2), text, font=font, fill='white', anchor='mm', stroke_width=5, stroke_fill=INK)


def main(folder):
    out = os.path.join(folder, 'pairs')
    os.makedirs(out, exist_ok=True)
    for before in sorted(glob.glob(os.path.join(folder, 'b-*.png'))):
        name = os.path.basename(before)[2:]
        after = os.path.join(folder, 'c-' + name)
        if not os.path.exists(after):
            continue
        a, b = Image.open(before).convert('RGB'), Image.open(after).convert('RGB')
        ribbon(a, 'BEFORE', BEFORE)
        ribbon(b, 'AFTER', AFTER)
        gap = 24
        pair = Image.new('RGB', (a.width + b.width + gap, a.height), INK)
        pair.paste(a, (0, 0))
        pair.paste(b, (a.width + gap, 0))
        pair.save(os.path.join(out, name))
        print('pair', name)


if __name__ == '__main__':
    main(sys.argv[1])
