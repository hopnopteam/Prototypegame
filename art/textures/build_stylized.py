"""Visual overhaul (Phase V1): stylized, hand-made detail layers for the new look, appended to the detail sheet.

The photo layers (scripts/assets/build_textures.py) give grain; these are drawn, not photographed, so they read clean
and stylized (ART_BIBLE.md, "Materials": "textures look clean and stylized, never noisy"). Same format as the photo
layers: a 512 px seamless tile, stored around 0.5 (the shader multiplies the part's colour by 2 × texel), mono.

  flagstone  big stone flags in running bond, each its own tone, bevelled edges (lit top-left, shaded bottom-right)
             and dark mortar gaps: the station platform of ref 1.
  panel      a painted wall panel: a raised frame, a soft inner shade, a faint brush direction (cabin walls, ref 3).
  carpet     a soft woven fabric: fine twill and a gentle mottle (runners and bedding, refs 2 and 3).
  plank      drawn wood grain along the boards with knots and a cloudy figure (the floors of refs 2 and 3).
  plankWorn  the same, coarser, with grime and scuffs (the run-down tier).
  sand       beach sand with wind ripples, baked in Blender (art/blender/sand_texture.py).
  fabric     a plush runner: pile, twill and mottle (refs 2 and 3's runners).

Run: python3 -I art/textures/build_stylized.py   (rewrites assets/textures/detail.jpg: the photo layers stay first, in
order, then these; src/world/detail.ts lists every layer in the same order).
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'textures', 'detail.jpg')
SIZE = 512
PHOTO_LAYERS = 8
rng = np.random.default_rng(7)


def smooth_noise(scale, octaves=3):
    """Seamless value noise in 0..1 (tiled by wrapping a small random grid)."""
    acc = np.zeros((SIZE, SIZE))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = max(2, scale * 2 ** o)
        grid = rng.random((n, n))
        img = Image.fromarray((grid * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.BICUBIC)
        # wrap-safe: blur a 3x3 tiled copy and crop the middle
        big = Image.new('L', (SIZE * 3, SIZE * 3))
        for i in range(3):
            for j in range(3):
                big.paste(img, (i * SIZE, j * SIZE))
        big = big.filter(ImageFilter.GaussianBlur(SIZE / n / 2.5))
        acc += amp * np.asarray(big.crop((SIZE, SIZE, 2 * SIZE, 2 * SIZE)), dtype=float) / 255.0
        total += amp
        amp *= 0.5
    return acc / total


def flagstone():
    # 2.7 m a tile (VISUALS.detail.paving.tile): 4 rows of 0.675 m, flags 0.9 m long in running bond.
    rows, cols = 4, 3
    img = np.zeros((SIZE, SIZE))
    gap = 5          # mortar, px (~2.6 cm)
    bevel = 7        # bevel width, px
    y = np.arange(SIZE)[:, None]
    x = np.arange(SIZE)[None, :]
    rh = SIZE / rows
    cw = SIZE / cols
    row = (y // rh).astype(int)
    shift = (row % 2) * (cw / 2)
    xs = (x + shift) % SIZE
    col = (xs // cw).astype(int)
    fy = y - row * rh               # position in the flag
    fx = xs - col * cw
    tone = rng.uniform(0.76, 1.18, (rows, cols + 1))
    flag_tone = tone[row, col % (cols + 1)]
    d_left, d_top = fx, fy
    d_right, d_bottom = cw - fx, rh - fy
    edge = np.minimum(np.minimum(d_left, d_right), np.minimum(d_top, d_bottom))
    base = flag_tone * (0.96 + 0.08 * smooth_noise(6))
    # bevels: light from the top left (toward the camera's key), shade bottom right
    lit = np.clip(1 - np.minimum(d_left, d_top) / bevel, 0, 1)
    shade = np.clip(1 - np.minimum(d_right, d_bottom) / bevel, 0, 1)
    v = base * (1 + 0.16 * lit - 0.22 * shade)
    v = np.where(edge < gap / 2, 0.42, v)
    # stone: a fine speckle and a cloudy figure inside each flag
    speck = rng.random((SIZE, SIZE))
    v *= 0.93 + 0.1 * speck * (edge >= gap / 2)
    v *= 0.9 + 0.2 * smooth_noise(10, 3)
    # wet patches (ref 1): dark, soft-edged puddles where the rain lies
    wet = smooth_noise(3, 2)
    v *= 1 - 0.3 * np.clip((wet - 0.56) / 0.08, 0, 1)
    return v


def panel():
    v = np.full((SIZE, SIZE), 1.0)
    y = np.arange(SIZE)[:, None].astype(float)
    x = np.arange(SIZE)[None, :].astype(float)
    # one panel per tile: a raised frame 40 px in, rounded shade inside
    m = 44
    inner = np.minimum(np.minimum(x - m, SIZE - m - x), np.minimum(y - m, SIZE - m - y))
    frame = (inner < 0)
    edge = np.clip(1 - np.abs(inner) / 8, 0, 1)
    v = np.where(frame, 1.04, 0.97 + 0.03 * np.clip(inner / 120, 0, 1))
    v -= 0.1 * edge * (inner > 0)            # the shadow line inside the frame
    v += 0.06 * edge * (inner <= 0)          # the lit lip of the frame
    v *= 0.985 + 0.03 * smooth_noise(24, 2)  # brush
    return v


def carpet():
    y = np.arange(SIZE)[:, None]
    x = np.arange(SIZE)[None, :]
    twill = 0.5 + 0.5 * np.sin((x + y) * (2 * np.pi / 8))
    v = 0.94 + 0.06 * twill
    v *= 0.92 + 0.16 * smooth_noise(5, 3)
    return v


def streaks(nx, ny):
    """Seamless noise stretched along y: nx cells across, ny along (bicubic over a 3x3 tiled grid, middle cropped)."""
    grid = rng.random((ny, nx))
    big = np.tile(grid, (3, 3))
    img = Image.fromarray((big * 255).astype(np.uint8)).resize((SIZE * 3, SIZE * 3), Image.BICUBIC)
    return np.asarray(img.crop((SIZE, SIZE, 2 * SIZE, 2 * SIZE)), dtype=float) / 255.0


def grain_noise(lines, warp, seed_scale):
    """Wood grain along the image's y (the boards' length): irregular streaks of varying width, warped slowly."""
    w = (smooth_noise(seed_scale, 2) - 0.5) * warp
    shift = np.round(w).astype(int)
    fine = streaks(lines * 3, 6)
    mid = streaks(lines, 4)
    rows = np.arange(SIZE)[:, None]
    cols = (np.arange(SIZE)[None, :] + shift) % SIZE
    fine = fine[rows, cols]
    mid = mid[rows, cols]
    # growth rings: bands where the mid noise crosses levels, thin and dark
    rings = np.abs(np.sin(mid * np.pi * 5))
    v = 0.55 + 0.3 * fine + 0.25 * rings
    return np.clip(v, 0, 1.2)


def knots(v, count, dark):
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(float)
    for _ in range(count):
        cx, cy = rng.uniform(0, SIZE, 2)
        r = rng.uniform(5, 11)
        dx = (xx - cx + SIZE / 2) % SIZE - SIZE / 2
        dy = ((yy - cy + SIZE / 2) % SIZE - SIZE / 2) / 2.6   # stretched along the board
        d = np.sqrt(dx * dx + dy * dy)
        v = v * (1 - dark * np.clip(1 - d / r, 0, 1) ** 1.5)
        # the grain bends round the knot: a light halo
        v = v * (1 + 0.08 * np.clip(1 - np.abs(d - r * 1.6) / (r * 0.6), 0, 1))
    return v


def plank():
    # 2.1 m a tile (VISUALS.detail.plank.tile): seven 0.3 m boards across; the grain runs the length of the board.
    g = grain_noise(28, 40, 3)
    v = 0.8 + 0.34 * g
    v *= 0.9 + 0.2 * smooth_noise(4, 3)          # soft cloudy figure
    v = knots(v, 5, 0.55)
    return v


def plank_worn():
    g = grain_noise(22, 60, 4)
    v = 0.72 + 0.46 * g
    v *= 0.84 + 0.3 * smooth_noise(5, 3)          # grime and wear
    v = knots(v, 7, 0.65)
    # scuffs across the boards
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(float)
    for _ in range(12):
        cx, cy, ang = rng.uniform(0, SIZE), rng.uniform(0, SIZE), rng.uniform(0, np.pi)
        L = rng.uniform(18, 60)
        dx = (xx - cx + SIZE / 2) % SIZE - SIZE / 2
        dy = (yy - cy + SIZE / 2) % SIZE - SIZE / 2
        along = dx * np.cos(ang) + dy * np.sin(ang)
        across = -dx * np.sin(ang) + dy * np.cos(ang)
        m = (np.abs(along) < L) & (np.abs(across) < 0.9)
        v = np.where(m, v * 0.92, v)
    return v


def fabric():
    # A soft woven runner: fine pile, a twill, a gentle mottle and a slight sheen band (ref 2's red runner, ref 3's carpet).
    y = np.arange(SIZE)[:, None]
    x = np.arange(SIZE)[None, :]
    twill = 0.5 + 0.5 * np.sin((x + y) * (2 * np.pi / 6))
    weft = 0.5 + 0.5 * np.sin(y * (2 * np.pi / 4))
    pile = rng.random((SIZE, SIZE))
    pile = np.asarray(Image.fromarray((pile * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=float) / 255
    v = 0.9 + 0.07 * twill + 0.04 * weft + 0.1 * (pile - 0.5)
    v *= 0.9 + 0.2 * smooth_noise(4, 3)
    return v


# ── Session 63: cloth, leather, felt, straw and hair for the people (owner: "plasticky… no realism to their clothes") ──
# Drawn at toy scale (the figures are 1.2 m clay toys): a weave a few millimetres across, so a close look shows the
# thread and a game-camera look shows a soft, living surface instead of a flat plastic fill. The shader samples them in
# each part's own space, blended on three axes (materials.ts, NX_FIGURE), so they never swim as the figure moves.

def stretch_noise(nx, ny, blur=None):
    """Seamless noise from an nx × ny random grid (threads: many columns, few rows, so it streaks along y)."""
    grid = rng.random((ny, nx))
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.BICUBIC)
    big = Image.new('L', (SIZE * 3, SIZE * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * SIZE, j * SIZE))
    if blur:
        big = big.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(big.crop((SIZE, SIZE, 2 * SIZE, 2 * SIZE)), dtype=float) / 255.0


def fibre(blur=0.7):
    f = rng.random((SIZE, SIZE))
    big = np.tile(f, (3, 3))
    img = Image.fromarray((big * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, dtype=float)[SIZE:2 * SIZE, SIZE:2 * SIZE] / 255.0


Y = np.arange(SIZE)[:, None].astype(float)
X = np.arange(SIZE)[None, :].astype(float)


def rib(phase):
    """A rounded thread: bright on its crown, dark in the groove (phase in turns)."""
    s = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    return s ** 0.8


def twill():
    # Suiting: a 45° twill rib (16 px, ~7 mm at 0.22 m a tile), fine weft lines, slubs along the threads and a heather.
    r = rib((X + Y) / 16)
    weft = rib(Y / 4)
    slub = stretch_noise(128, 6, 1.0)
    v = 0.8 + 0.16 * r + 0.04 * weft + 0.07 * (slub - 0.5) + 0.08 * (fibre() - 0.5)
    v *= 0.9 + 0.2 * smooth_noise(5, 3)
    return v


def knit():
    # Jersey (tees, jumpers, socks, beanies): columns of V stitches, each leg a rounded loop, rows interlocking.
    W, H = 16.0, 12.0
    u = (X % W) / W
    best = np.zeros((SIZE, SIZE))
    for dv in (-1, 0, 1):
        v = (Y % H) / H - dv
        for cx, tilt in ((0.3, 0.45), (0.7, -0.45)):
            du = u - cx - tilt * (v - 0.5) * 0.5
            d = (du / 0.2) ** 2 + ((v - 0.5) / 0.62) ** 2
            best = np.maximum(best, np.clip(1 - d, 0, 1))
    v = 0.72 + 0.32 * best ** 0.7 + 0.06 * (fibre(0.6) - 0.5)
    v *= 0.92 + 0.16 * smooth_noise(6, 3)
    return v


def denim():
    # A steep 3/1 twill (warp dark, weft pale), vertical slubs and a soft fade.
    r = rib((X + 2 * Y) / 16)
    speck = (fibre(0.5) > 0.72).astype(float)
    speck = np.asarray(Image.fromarray((speck * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), dtype=float) / 255
    slub = stretch_noise(96, 5, 1.2)
    v = 0.74 + 0.2 * r + 0.1 * speck + 0.14 * (slub - 0.5)
    v *= 0.86 + 0.28 * smooth_noise(4, 3)
    return v


def tweed():
    # A herringbone tweed: the twill turns every 32 px band (~1.9 cm), with coloured flecks (light and dark) and a mottle.
    band = (X // 32) % 2
    d = np.where(band == 0, X + Y, -X + Y)
    r = rib(d / 12)
    edge = 1 - 0.12 * np.exp(-(((X % 32) - 0) ** 2) / 6)
    fl = fibre(0.0)
    flecks = np.where(fl > 0.985, 0.35, 0) - np.where(fl < 0.015, 0.3, 0)
    flecks = np.asarray(Image.fromarray(((flecks + 0.5) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=float) / 255 - 0.5
    v = (0.78 + 0.18 * r) * edge + 0.5 * flecks + 0.06 * (fibre() - 0.5)
    v *= 0.88 + 0.24 * smooth_noise(5, 3)
    return v


def oxford():
    # Shirting and canvas: a 2 × 2 basket weave of 4 px threads, quiet.
    a = rib(X / 8)
    b = rib(Y / 8)
    cell = ((X // 8 + Y // 8) % 2)
    v = 0.84 + 0.12 * np.where(cell == 0, a, b) + 0.05 * (fibre() - 0.5)
    v *= 0.94 + 0.12 * smooth_noise(6, 2)
    return v


def felt():
    # Pressed felt: no thread, a fine fuzz and a cloudy density.
    v = 0.86 + 0.14 * (fibre(1.1) - 0.5) * 2 + 0.16 * (smooth_noise(12, 4) - 0.5)
    return v


def leather():
    # Pebble grain: soft cells with dark creases between, and a gentle polish mottle.
    n = 360
    px = rng.random(n) * SIZE
    py = rng.random(n) * SIZE
    d1 = np.full((SIZE, SIZE), 1e9)
    d2 = np.full((SIZE, SIZE), 1e9)
    for ox in (-SIZE, 0, SIZE):
        for oy in (-SIZE, 0, SIZE):
            for k in range(n):
                dx = X - (px[k] + ox)
                dy = Y - (py[k] + oy)
                if abs(px[k] + ox - SIZE / 2) > SIZE * 0.8 or abs(py[k] + oy - SIZE / 2) > SIZE * 0.8:
                    continue
                d = np.sqrt(dx * dx + dy * dy)
                closer = d < d1
                d2 = np.where(closer, d1, np.minimum(d2, d))
                d1 = np.where(closer, d, d1)
    edge = np.clip((d2 - d1) / 7, 0, 1)
    dome = np.clip(d1 / 14, 0, 1)
    edge = edge * (1.04 - 0.08 * dome)
    v = 0.72 + 0.22 * np.clip(edge * 2.2, 0, 1) ** 0.5 + 0.05 * (fibre(0.8) - 0.5)
    v *= 0.9 + 0.2 * smooth_noise(4, 3)
    return v


def straw():
    # A plaited straw braid: rows of chevrons (24 px) with fibres along them.
    row = (Y // 24) % 2
    yy = (Y % 24) / 24
    chev = np.abs(((X / 12 + np.where(row == 0, yy, -yy) * 1.0) % 1) - 0.5) * 2
    r = 1 - chev ** 2
    groove = 1 - 0.45 * np.exp(-((Y % 24) ** 2) / 3)
    streak = stretch_noise(4, 256, 0.6).T if False else stretch_noise(6, 200, 0.7)
    v = (0.74 + 0.24 * r) * groove + 0.1 * (streak - 0.5)
    v *= 0.94 + 0.12 * smooth_noise(5, 2)
    return v


def hair():
    # Strands along the tile's v (down the sides of the head, front to back over the top): fine streaks and clumps.
    fine = stretch_noise(220, 3, 0.4)
    clump = stretch_noise(40, 2, 1.5)
    v = 0.8 + 0.22 * (fine - 0.5) * 2 + 0.16 * (clump - 0.5) * 2
    return v


def baked(name, index):
    """A layer baked in Blender (art/blender/<name>_texture.py → assets/textures/src/<name>.png). The bake's output
    is not kept in the repository: without it, the layer already in the sheet (at `index`) is kept as it is."""
    src = os.path.join(ROOT, 'assets', 'textures', 'src', name + '.png')
    if os.path.exists(src):
        im = Image.open(src).convert('L').resize((SIZE, SIZE))
    else:
        im = Image.open(OUT).convert('L').crop((0, SIZE * index, SIZE, SIZE * (index + 1)))
    v = np.asarray(im, dtype=float) / 255.0
    return v


def to_layer(v):
    v = v / v.mean() * 0.5
    return Image.fromarray(np.clip(v * 255, 0, 255).astype(np.uint8)).convert('RGB')


def main():
    sheet = Image.open(OUT).convert('RGB')
    photos = sheet.crop((0, 0, SIZE, SIZE * PHOTO_LAYERS))
    layers = [flagstone(), panel(), carpet(), plank(), plank_worn(), fabric(), baked('sand', PHOTO_LAYERS + 6),
              twill(), knit(), denim(), tweed(), oxford(), felt(), leather(), straw(), hair()]
    out = Image.new('RGB', (SIZE, SIZE * (PHOTO_LAYERS + len(layers))))
    out.paste(photos, (0, 0))
    for i, v in enumerate(layers):
        out.paste(to_layer(v), (0, SIZE * (PHOTO_LAYERS + i)))
    out.save(OUT, quality=88)
    print('wrote', OUT, out.size, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
