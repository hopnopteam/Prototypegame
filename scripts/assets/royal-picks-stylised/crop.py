import json, sys
from PIL import Image, ImageChops
cat = json.load(open('catalog.json'))
def crop(i, out, minw=520, pad=0.22, aspect=4/3, W=800):
    s = json.load(open(f'www/specs/{i}.json')); t = s['carriage']['tier']; c = s['cam']
    im = Image.open(f'shots/{i}.png').convert('RGB'); base = Image.open(f'shots/base_{t}_{c["x"]}_{c["z"]}.png').convert('RGB')
    from PIL import ImageFilter
    diff = ImageChops.difference(im, base).convert('L').filter(ImageFilter.MedianFilter(7)).point(lambda v: 255 if v > 40 else 0)
    m = Image.new('L', diff.size, 0); m.paste(255, (int(diff.width*0.08), int(diff.height*0.04), int(diff.width*0.8), int(diff.height*0.72)))
    diff = ImageChops.multiply(diff, m)
    bb = diff.getbbox()
    if not bb: bb = (0, 0, im.width, im.height)
    x0, y0, x1, y1 = bb; w, h = x1 - x0, y1 - y0
    w, h = max(w * (1 + 2 * pad), minw), max(h * (1 + 2 * pad), minw / aspect)
    if w / h < aspect: w = h * aspect
    else: h = w / aspect
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    if box[0] < 0: box[2] -= box[0]; box[0] = 0
    if box[2] > im.width: box[0] -= box[2] - im.width; box[2] = im.width
    if box[1] < 0: box[3] -= box[1]; box[1] = 0
    if box[3] > im.height: box[1] -= box[3] - im.height; box[3] = im.height
    im.crop([int(v) for v in box]).resize((W, int(W / aspect)), Image.LANCZOS).save(out, quality=88)
for o in cat:
    crop(o['id'], f'crops/{o["id"]}.jpg', minw=700 if o['id'].startswith('G') else 420)
