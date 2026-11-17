# Flat, painted rug faces in the game's stylised look (no photo texture): crisp shapes, a few flat colours.
from PIL import Image, ImageDraw
import math, sys
OUT = sys.argv[1]
S = 4  # supersample
def canvas(w, h, bg): im = Image.new('RGB', (w*S, h*S), bg); return im, ImageDraw.Draw(im)
def save(im, name, w, h): im.resize((w, h), Image.LANCZOS).save(f'{OUT}/{name}.png')
def bands(d, w, h, specs):
    inset = 0
    for width, col in specs:
        d.rectangle([inset*S, inset*S, (w-inset)*S-1, (h-inset)*S-1], fill=col); inset += width
    return inset
def diamond(d, cx, cy, rx, ry, col): d.polygon([(cx*S, (cy-ry)*S), ((cx+rx)*S, cy*S), (cx*S, (cy+ry)*S), ((cx-rx)*S, cy*S)], fill=col)
def medallion(name, field, border, gold, dark, light, w=512, h=704):
    im, d = canvas(w, h, border)
    i = bands(d, w, h, [(0, border), (26, gold), (6, border), (34, dark), (6, gold), (8, field)])
    # border motifs: little diamonds along the dark band
    for x in range(40, w-30, 34):
        diamond(d, x, 26+6+17, 9, 9, gold); diamond(d, x, h-(26+6+17), 9, 9, gold)
    for y in range(40, h-30, 34):
        diamond(d, 26+6+17, y, 9, 9, gold); diamond(d, w-(26+6+17), y, 9, 9, gold)
    cx, cy = w/2, h/2
    diamond(d, cx, cy, 150, 205, gold); diamond(d, cx, cy, 138, 192, dark); diamond(d, cx, cy, 104, 146, field)
    d.ellipse([(cx-62)*S, (cy-62)*S, (cx+62)*S, (cy+62)*S], fill=gold)
    d.ellipse([(cx-50)*S, (cy-50)*S, (cx+50)*S, (cy+50)*S], fill=dark)
    for k in range(8):
        a = k*math.pi/4; px, py = cx+30*math.cos(a), cy+30*math.sin(a)
        d.ellipse([(px-11)*S, (py-11)*S, (px+11)*S, (py+11)*S], fill=light)
    d.ellipse([(cx-12)*S, (cy-12)*S, (cx+12)*S, (cy+12)*S], fill=gold)
    # corner spandrels
    m = i
    for sx, sy in [(m, m), (w-m, m), (m, h-m), (w-m, h-m)]:
        dx = 1 if sx < cx else -1; dy = 1 if sy < cy else -1
        d.polygon([(sx*S, sy*S), ((sx+dx*90)*S, sy*S), (sx*S, (sy+dy*90)*S)], fill=gold)
        d.polygon([(sx*S, sy*S), ((sx+dx*72)*S, sy*S), (sx*S, (sy+dy*72)*S)], fill=dark)
    save(im, name, w, h)
def trellis(name, field, line, dot, border, gold, w=512, h=704):
    im, d = canvas(w, h, border)
    bands(d, w, h, [(0, border), (22, gold), (5, border), (10, field)])
    m = 37; step = 48
    for k in range(-20, 30):
        x0 = m + k*step
        d.line([(x0*S, m*S), ((x0+(h-2*m))*S, (h-m)*S)], fill=line, width=4*S)
        d.line([(x0*S, (h-m)*S), ((x0+(h-2*m))*S, m*S)], fill=line, width=4*S)
    d.rectangle([0, 0, w*S, m*S-1], fill=border); d.rectangle([0, (h-m)*S, w*S, h*S], fill=border)
    d.rectangle([0, 0, m*S-1, h*S], fill=border); d.rectangle([(w-m)*S, 0, w*S, h*S], fill=border)
    bands_inner = [(22, gold), (5, border)]
    d.rectangle([22*S, 22*S, (w-22)*S, (h-22)*S], outline=gold, width=5*S)
    for yy in range(m + step//2, h - m, step//2):
        for xx in range(m + (step//2 if (yy - m) // (step//2) % 2 else 0), w - m, step):
            d.ellipse([(xx-5)*S, (yy-5)*S, (xx+5)*S, (yy+5)*S], fill=dot)
    save(im, name, w, h)
def runner(name, field, stripe, edge, w=256, h=896):
    im, d = canvas(w, h, edge)
    bands(d, w, h, [(0, edge), (16, stripe), (6, edge), (6, field)])
    for y in range(60, h-50, 70): diamond(d, w/2, y, 34, 22, stripe); diamond(d, w/2, y, 18, 11, edge)
    for y in range(95, h-50, 70):
        for x in (w*0.25, w*0.75): d.ellipse([(x-5)*S, (y-5)*S, (x+5)*S, (y+5)*S], fill=stripe)
    save(im, name, w, h)
def persian(name, field, border, gold, accent, w=512, h=704):
    im, d = canvas(w, h, border)
    bands(d, w, h, [(0, border), (14, gold), (30, accent), (8, gold), (6, field)])
    for x in range(32, w-20, 26):
        d.ellipse([(x-6)*S, (14+15-6)*S, (x+6)*S, (14+15+6)*S], fill=gold); d.ellipse([(x-6)*S, (h-29-6)*S, (x+6)*S, (h-29+6)*S], fill=gold)
    for y in range(32, h-20, 26):
        d.ellipse([(29-6)*S, (y-6)*S, (29+6)*S, (y+6)*S], fill=gold); d.ellipse([(w-29-6)*S, (y-6)*S, (w-29+6)*S, (y+6)*S], fill=gold)
    for yy in range(110, h-90, 92):
        for xx in range(110, w-90, 98):
            for r, c in [(26, gold), (18, accent), (8, gold)]:
                diamond(d, xx, yy, r, r*1.25, c)
    save(im, name, w, h)
medallion('claret_medallion', '#7A1E32', '#3B1A12', '#D4AF5A', '#4E1220', '#EFE6D2')
medallion('emerald_medallion', '#1F5C45', '#2B1A10', '#D4AF5A', '#123D30', '#E6D3A3')
medallion('rose_medallion', '#E8C4C4', '#F2E6D0', '#C9A24A', '#B76E79', '#FBF4E6')
trellis('sapphire_trellis', '#2A4A92', '#C9A24A', '#EFE6D2', '#14204A', '#C9A24A')
trellis('champagne_trellis', '#E3D3AE', '#C9A24A', '#2A4A92', '#1E2A4A', '#C9A24A')
runner('sapphire_runner', '#2A4A92', '#D4AF5A', '#14204A')
runner('claret_runner', '#7A1E32', '#D4AF5A', '#3B1A12')
persian('navy_persian', '#7A1E32', '#14204A', '#D4AF5A', '#1F3A7A')
