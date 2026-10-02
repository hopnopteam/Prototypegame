"""
App icon and launch screen for the iOS and Android builds, drawn from code (like everything else in the game):
a lamplit carriage under a crescent moon on the night-navy of the game. Re-run after changing the art:

    python3 scripts/native/assets.py

Writes ios/App/App/Assets.xcassets (AppIcon, Splash) and android/app/src/main/res (mipmaps, splash screens).
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NIGHT_TOP = (42, 49, 112)
NIGHT_BOTTOM = (21, 26, 62)
NIGHT = '#161C44'
SS = 4  # supersampling for smooth edges


def gradient(size, top=NIGHT_TOP, bottom=NIGHT_BOTTOM):
    w, h = size
    img = Image.new('RGB', size, top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def stars(draw, size, seed=7, count=36):
    import random
    rnd = random.Random(seed)
    w, h = size
    for _ in range(count):
        x, y = rnd.random() * w, rnd.random() * h * 0.55
        r = (0.6 + rnd.random() * 1.6) * w / 1024
        a = 90 + int(rnd.random() * 120)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 244, 220, a))


def emblem(size):
    """The moon and the lamplit carriage on a transparent square (art space 1024)."""
    S = size * SS
    k = S / 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    d = ImageDraw.Draw(img)
    # Crescent moon, top right.
    mx, my, mr = 712 * k, 268 * k, 132 * k
    g.ellipse((mx - mr * 1.9, my - mr * 1.9, mx + mr * 1.9, my + mr * 1.9), fill=(255, 226, 160, 60))
    moon = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(moon)
    md.ellipse((mx - mr, my - mr, mx + mr, my + mr), fill=255)
    md.ellipse((mx - mr * 0.55, my - mr * 1.15, mx + mr * 1.35, my + mr * 0.75), fill=0)
    img.paste((247, 233, 196, 255), (0, 0), moon)
    # Rails.
    d.rounded_rectangle((90 * k, 836 * k, 934 * k, 852 * k), radius=8 * k, fill=(140, 143, 168, 255))
    # Carriage body: royal navy with a gold band and a darker roof.
    body = (150 * k, 520 * k, 874 * k, 790 * k)
    d.rounded_rectangle((140 * k, 494 * k, 884 * k, 560 * k), radius=40 * k, fill=(30, 46, 98, 255))
    d.rounded_rectangle(body, radius=36 * k, fill=(43, 74, 143, 255))
    d.rectangle((150 * k, 724 * k, 874 * k, 746 * k), fill=(227, 184, 92, 255))
    # Lamplit windows (their glow spills a little onto the paint).
    for i in range(4):
        x0 = (196 + i * 166) * k
        win = (x0, 584 * k, x0 + 134 * k, 692 * k)
        g.rounded_rectangle((win[0] - 26 * k, win[1] - 26 * k, win[2] + 26 * k, win[3] + 30 * k), radius=40 * k, fill=(255, 190, 100, 70))
        d.rounded_rectangle(win, radius=22 * k, fill=(255, 197, 110, 255))
        d.rounded_rectangle((win[0] + 12 * k, win[1] + 10 * k, win[2] - 12 * k, win[1] + 52 * k), radius=16 * k, fill=(255, 228, 166, 255))
    # Wheels with gold hubs.
    for x in (262, 392, 632, 762):
        cx, cy, r = x * k, 806 * k, 50 * k
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(27, 29, 42, 255))
        d.ellipse((cx - r * 0.36, cy - r * 0.36, cx + r * 0.36, cy + r * 0.36), fill=(227, 184, 92, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(28 * k))
    out = Image.alpha_composite(glow, img)
    return out.resize((size, size), Image.LANCZOS)


def icon(size, rounded=None, circle=False):
    """Full icon: gradient, stars, emblem. `rounded` (share of size) or `circle` bake a shape (legacy Android)."""
    S = 1024
    base = gradient((S, S)).convert('RGBA')
    stars(ImageDraw.Draw(base, 'RGBA'), (S, S))
    base = Image.alpha_composite(base, emblem(S))
    base = base.resize((size, size), Image.LANCZOS)
    if rounded is None and not circle:
        return base.convert('RGB')
    mask = Image.new('L', (size * SS, size * SS), 0)
    md = ImageDraw.Draw(mask)
    if circle:
        md.ellipse((0, 0, size * SS - 1, size * SS - 1), fill=255)
    else:
        md.rounded_rectangle((0, 0, size * SS - 1, size * SS - 1), radius=rounded * size * SS, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def splash(w, h):
    img = gradient((w, h)).convert('RGBA')
    stars(ImageDraw.Draw(img, 'RGBA'), (w, h), seed=11, count=int(60 * w * h / (1024 * 1024)) + 20)
    e = int(min(w, h) * 0.42)
    img.alpha_composite(emblem(e), ((w - e) // 2, (h - e) // 2))
    return img.convert('RGB')


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print('wrote', os.path.relpath(path, ROOT), img.size)


def main():
    # iOS: one 1024 icon (no transparency; the system rounds it) and the launch image.
    save(icon(1024), 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
    s = splash(2732, 2732)
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        save(s, 'ios/App/App/Assets.xcassets/Splash.imageset', name)
    # Android: legacy and round icons, the adaptive icon's foreground (art inside the 66% safe zone).
    res = 'android/app/src/main/res'
    for density, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        save(icon(px, rounded=0.2), res, f'mipmap-{density}', 'ic_launcher.png')
        save(icon(px, circle=True), res, f'mipmap-{density}', 'ic_launcher_round.png')
        fg = int(px * 2.25)
        canvas = Image.new('RGBA', (fg, fg), (0, 0, 0, 0))
        art = emblem(int(fg * 0.62))
        canvas.alpha_composite(art, ((fg - art.width) // 2, (fg - art.height) // 2))
        save(canvas, res, f'mipmap-{density}', 'ic_launcher_foreground.png')
    for folder, (w, h) in {
        'drawable': (480, 320),
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
    }.items():
        save(splash(w, h), res, folder, 'splash.png')
    with open(os.path.join(ROOT, res, 'values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">%s</color>\n</resources>\n' % NIGHT)
    print('wrote', os.path.join(res, 'values', 'ic_launcher_background.xml'))


if __name__ == '__main__':
    main()
