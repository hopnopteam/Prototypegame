# Crops every Station Picks render to its subject: options by their difference from the bare bay (base_<zoom>),
# today's pieces round the centre of the frame (the camera looks at them). python3 -I crop.py <scratch dir>
import json, os, sys
from PIL import Image, ImageChops, ImageFilter
S = sys.argv[1]
cat = json.load(open(f'{S}/catalog.json'))
os.makedirs(f'{S}/page/img', exist_ok=True)
ASPECT, OUTW = 4 / 3, 800

def box_around(cx, cy, w, h, im):
    w, h = max(w, h * ASPECT), max(h, w / ASPECT)
    b = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    if b[0] < 0: b[2] -= b[0]; b[0] = 0
    if b[2] > im.width: b[0] -= b[2] - im.width; b[2] = im.width
    if b[1] < 0: b[3] -= b[1]; b[1] = 0
    if b[3] > im.height: b[1] -= b[3] - im.height; b[3] = im.height
    return [int(max(0, v)) for v in b]

def save(im, b, out):
    im.crop(b).resize((OUTW, int(OUTW / ASPECT)), Image.LANCZOS).save(out, quality=86)

for o in cat['options']:
    spec = json.load(open(f'{S}/www/specs/{o["id"]}.json'))
    shot = f'{S}/shots/{o["id"]}.png'
    if not os.path.exists(shot): print('missing', o['id']); continue
    im = Image.open(shot).convert('RGB')
    base = Image.open(f'{S}/shots/base_{o["zoom"]}.png').convert('RGB')
    d = ImageChops.difference(im, base).convert('L').filter(ImageFilter.MedianFilter(5)).point(lambda v: 255 if v > 28 else 0)
    bb = d.getbbox() or (0, 0, im.width, im.height)
    x0, y0, x1, y1 = bb
    pad = 0.28
    w, h = (x1 - x0) * (1 + 2 * pad), (y1 - y0) * (1 + 2 * pad)
    w, h = max(w, im.width * 0.3), max(h, im.width * 0.3 / ASPECT)
    save(im, box_around((x0 + x1) / 2, (y0 + y1) / 2, w, h, im), f'{S}/page/img/{o["id"]}.jpg')

for e in cat['elements']:
    shot = f'{S}/shots/today_{e["key"]}.png'
    if not e['today'] or not os.path.exists(shot): continue
    im = Image.open(shot).convert('RGB')
    mark = json.load(open(f'{S}/shots/today_{e["key"]}.mark.json'))
    w = im.width * e['today'].get('crop', 0.55)
    save(im, box_around(mark['u'] * im.width, mark['v'] * im.height, w, w / ASPECT, im), f'{S}/page/img/today_{e["key"]}.jpg')
print('cropped')
