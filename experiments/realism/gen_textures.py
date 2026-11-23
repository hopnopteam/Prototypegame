"""Textures drawn for the experiment (no photo source exists for them): a Persian rug.

Run with any Python that has Pillow and numpy:  python gen_textures.py <outdir>
"""
import math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1] if len(sys.argv) > 1 else '.'
W, H = 1400, 2000          # rug 1.4 x 2.0 m at 1 px/mm
RED = (122, 18, 24)
DEEP = (70, 10, 16)
NAVY = (22, 32, 66)
CREAM = (222, 200, 160)
GOLD = (196, 150, 70)
TEAL = (40, 86, 84)

im = Image.new('RGB', (W, H), RED)
d = ImageDraw.Draw(im)


def diamond(cx, cy, rx, ry, fill, outline=None, width=1):
    d.polygon([(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)], fill=fill, outline=outline, width=width)


def rosette(cx, cy, r, c1, c2):
    for k in range(8):
        a = k * math.pi / 4
        x, y = cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55
        d.ellipse([x - r * 0.32, y - r * 0.32, x + r * 0.32, y + r * 0.32], fill=c1)
    d.ellipse([cx - r * 0.38, cy - r * 0.38, cx + r * 0.38, cy + r * 0.38], fill=c2)
    d.ellipse([cx - r * 0.14, cy - r * 0.14, cx + r * 0.14, cy + r * 0.14], fill=c1)


# borders: outer navy guard, main cream band with motifs, inner guard
bands = [(0, 30, NAVY), (30, 44, GOLD), (44, 170, NAVY), (170, 184, GOLD), (184, 200, DEEP)]
for a, b, c in bands:
    d.rectangle([a, a, W - 1 - a, H - 1 - a], outline=c, width=b - a)
# motifs on the main border
step = 125
for x in range(44 + step // 2, W - 44, step):
    for y in (107, H - 107):
        rosette(x, y, 46, RED, CREAM)
        diamond(x + step / 2, y, 18, 30, GOLD)
for y in range(44 + step // 2, H - 44, step):
    for x in (107, W - 107):
        rosette(x, y, 46, RED, CREAM)
        diamond(x, y + step / 2, 30, 18, GOLD)
# field: a lattice of small diamonds and flowers
for y in range(250, H - 220, 60):
    for x in range(250, W - 220, 60):
        off = 30 if (y // 60) % 2 else 0
        xx = x + off
        if xx > W - 240:
            continue
        diamond(xx, y, 11, 17, DEEP)
        d.ellipse([xx - 4, y - 4, xx + 4, y + 4], fill=GOLD)
# arabesque vines through the field
for k in range(26):
    x0 = rng0 = None
import random as _r
_rr = _r.Random(4)
for k in range(34):
    x = _rr.uniform(230, W - 230)
    y = _rr.uniform(230, H - 230)
    ang = _rr.uniform(0, 6.28)
    pts = []
    for t in range(40):
        ang += 0.12 * math.sin(t * 0.4 + k)
        x += math.cos(ang) * 9
        y += math.sin(ang) * 9
        pts.append((x, y))
    d.line(pts, fill=(150, 110, 60), width=4)
    for (px, py) in pts[::8]:
        d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=CREAM)
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=NAVY)
# central medallion: a lobed star in layers, with petals and pendants
cx, cy = W // 2, H // 2


def star(cx, cy, r_out, r_in, n, fill, sy=1.35):
    pts = []
    for i in range(2 * n):
        r = r_out if i % 2 == 0 else r_in
        a = math.pi * i / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a) * sy))
    d.polygon(pts, fill=fill)


star(cx, cy, 400, 330, 16, NAVY)
star(cx, cy, 380, 315, 16, GOLD)
star(cx, cy, 360, 300, 16, CREAM)
star(cx, cy, 300, 250, 12, RED)
for i in range(16):
    a = 2 * math.pi * i / 16
    px, py = cx + 270 * math.cos(a), cy + 270 * math.sin(a) * 1.35
    d.ellipse([px - 26, py - 26, px + 26, py + 26], fill=NAVY)
    d.ellipse([px - 12, py - 12, px + 12, py + 12], fill=GOLD)
star(cx, cy, 200, 160, 8, NAVY)
star(cx, cy, 170, 130, 8, TEAL)
rosette(cx, cy, 110, CREAM, RED)
rosette(cx, cy, 50, GOLD, NAVY)
for sy in (-1, 1):
    star(cx, cy + sy * 620, 95, 70, 8, NAVY, 1.2)
    star(cx, cy + sy * 620, 75, 55, 8, CREAM, 1.2)
    rosette(cx, cy + sy * 620, 34, RED, GOLD)
# corner spandrels
for sx in (0, 1):
    for sy in (0, 1):
        x = 200 if sx == 0 else W - 200
        y = 200 if sy == 0 else H - 200
        d.polygon([(x, y), (x + (230 if sx == 0 else -230), y), (x, y + (230 if sy == 0 else -230))], fill=NAVY)
        rosette(x + (70 if sx == 0 else -70), y + (70 if sy == 0 else -70), 36, CREAM, RED)

# wool: knot grain, abrash (slow colour drift in the dye) and wear
a = np.asarray(im).astype(np.float32) / 255
rng = np.random.default_rng(5)
knots = rng.normal(0, 0.05, (H // 2, W // 2)).repeat(2, 0).repeat(2, 1)
abrash = np.cumsum(rng.normal(0, 0.004, H))[:, None] * np.ones((1, W))
fine = rng.normal(0, 0.03, (H, W))
v = 1 + knots + abrash + fine
a = a * v[..., None]
# soft wear in the middle where people walk
yy, xx = np.mgrid[0:H, 0:W]
wear = np.exp(-(((xx - W / 2) / 420) ** 2 + ((yy - H / 2) / 700) ** 2))
a = a * (1 - 0.12 * wear[..., None]) + 0.05 * wear[..., None]
a = np.clip(a, 0, 1)
img = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
img.save(os.path.join(out, 'gen__rug_diff.jpg'), quality=92)

# pile normal: fine noise height turned into a normal map
h = rng.normal(0, 1, (H // 2, W // 2))
h = np.asarray(Image.fromarray(((h - h.min()) / (h.max() - h.min()) * 255).astype(np.uint8)).resize((W, H)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
gy, gx = np.gradient(h)
s = 6.0
n = np.dstack([-gx * s, -gy * s, np.ones_like(h)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(out, 'gen__rug_nor.jpg'), quality=92)
print('rug done')

# corridor carpet: deep red with a small gold-and-rose medallion repeat, 0.5 m tile
T = 1024
im = Image.new('RGB', (T, T), (92, 10, 18))
d = ImageDraw.Draw(im)
GOLDC = (176, 128, 56)
ROSE = (140, 30, 40)
for (cx, cy) in [(0, 0), (T, 0), (0, T), (T, T), (T // 2, T // 2)]:
    for r, c in [(150, ROSE), (120, (92, 10, 18)), (100, GOLDC), (82, (110, 14, 24)), (40, GOLDC), (22, (92, 10, 18))]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    for k in range(8):
        a = k * math.pi / 4
        x, y = cx + math.cos(a) * 128, cy + math.sin(a) * 128
        d.ellipse([x - 14, y - 14, x + 14, y + 14], fill=GOLDC)
for (cx, cy) in [(T // 2, 0), (0, T // 2), (T, T // 2), (T // 2, T)]:
    d.polygon([(cx, cy - 46), (cx + 30, cy), (cx, cy + 46), (cx - 30, cy)], fill=GOLDC)
    d.polygon([(cx, cy - 26), (cx + 16, cy), (cx, cy + 26), (cx - 16, cy)], fill=(92, 10, 18))
a = np.asarray(im).astype(np.float32) / 255
rng = np.random.default_rng(9)
a = a * (1 + rng.normal(0, 0.06, (T, T))[..., None])
img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
img.save(os.path.join(out, 'gen__carpet_diff.jpg'), quality=92)
print('carpet done')
