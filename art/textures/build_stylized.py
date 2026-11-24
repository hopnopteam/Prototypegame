"""Visual overhaul (Phase V1): stylized, hand-made detail layers for the new look, appended to the detail sheet.

The photo layers (scripts/assets/build_textures.py) give grain; these are drawn, not photographed, so they read clean
and stylized (ART_BIBLE.md, "Materials": "textures look clean and stylized, never noisy"). Same format as the photo
layers: a 512 px seamless tile, stored around 0.5 (the shader multiplies the part's colour by 2 × texel), mono.

  flagstone  big stone flags in running bond, each its own tone, bevelled edges (lit top-left, shaded bottom-right)
             and dark mortar gaps: the station platform of ref 1.
  panel      a painted wall panel: a raised frame, a soft inner shade, a faint brush direction (cabin walls, ref 3).
  carpet     a soft woven fabric: fine twill and a gentle mottle (runners and bedding, refs 2 and 3).

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
    tone = rng.uniform(0.86, 1.1, (rows, cols + 1))
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
    # a few soft worn spots
    v *= 0.94 + 0.12 * smooth_noise(3, 2)
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


def to_layer(v):
    v = v / v.mean() * 0.5
    return Image.fromarray(np.clip(v * 255, 0, 255).astype(np.uint8)).convert('RGB')


def main():
    sheet = Image.open(OUT).convert('RGB')
    photos = sheet.crop((0, 0, SIZE, SIZE * PHOTO_LAYERS))
    layers = [flagstone(), panel(), carpet()]
    out = Image.new('RGB', (SIZE, SIZE * (PHOTO_LAYERS + len(layers))))
    out.paste(photos, (0, 0))
    for i, v in enumerate(layers):
        out.paste(to_layer(v), (0, SIZE * (PHOTO_LAYERS + i)))
    out.save(OUT, quality=88)
    print('wrote', OUT, out.size, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
