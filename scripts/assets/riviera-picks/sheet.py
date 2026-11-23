# python3 -I sheet.py <tiles dir> <out png> <title> [cols]: a labelled contact sheet
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
d, out, title = sys.argv[1:4]; cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
info = json.load(open(os.path.join(d, 'info.json'))); names = sorted(info)
T, LH = 300, 46
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12); FT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
except Exception:
    F = f2 = FT = ImageFont.load_default()
rows = (len(names) + cols - 1) // cols
im = Image.new('RGB', (cols * T, 60 + rows * (T + LH)), '#f7f2e8'); dr = ImageDraw.Draw(im)
dr.text((16, 14), title, fill='#2a3440', font=FT)
for k, n in enumerate(names):
    x, y = (k % cols) * T, 60 + (k // cols) * (T + LH)
    im.paste(Image.open(os.path.join(d, n + '.png')).convert('RGB'), (x, y))
    e = info[n]; s = e['size']
    dr.text((x + 8, y + T + 4), n, fill='#1d2630', font=F)
    dr.text((x + 8, y + T + 24), f"{e['tris']} tris · {s[0]:.2f}×{s[1]:.2f}×{s[2]:.2f} m", fill='#5a6470', font=f2)
im.save(out, optimize=True); print(out, im.size)
