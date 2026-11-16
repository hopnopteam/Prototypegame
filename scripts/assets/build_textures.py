"""Builds the floor and ground detail textures (assets/textures/detail.jpg) from CC0 Poly Haven photos.

Each layer is a 512 px tile of a seamless photo texture divided by its own average colour (stored at half scale),
so in the game it adds grain and natural variation on top of the colours the game already paints (the shader
multiplies by 2 * texel). Layers are stacked top to bottom in LAYERS order; src/world/detailTextures.ts reads
them in the same order. Sources are fetched from Poly Haven's public API into assets/textures/src/ when missing.

Run: python3 -I scripts/assets/build_textures.py
"""
import json, os, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'textures', 'src')
OUT = os.path.join(ROOT, 'assets', 'textures', 'detail.jpg')
SIZE = 512

# (layer name, Poly Haven asset id, rotate degrees, contrast): rotation lines the wood grain up along the train (+z, the
# image's vertical); contrast scales the photo's deviation from its average before it is stored. The wood layers are
# plain grain (veneer and table tops, no plank edges of their own): the game's boards are real geometry or its own
# pattern, and a second set of seams would fight them.
# `mono` keeps only the brightness (the colour stays the game's own); grass and ground keep their hue variation.
LAYERS = [
    ('woodWorn', 'wood_table_worn', 90, 0.7, True),
    ('wood', 'oak_veneer_01', 0, 1.3, True),
    ('woodPolished', 'wood_table_001', 0, 0.55, True),
    ('herringbone', 'herringbone_parquet', 0, 1.0, True),
    ('wool', 'rough_linen', 0, 2.2, True),
    ('grass', 'leafy_grass', 0, 1.0, False),
    ('ground', 'forrest_ground_01', 0, 1.0, False),
]


def fetch(asset):
    path = os.path.join(SRC, asset + '.jpg')
    if os.path.exists(path):
        return path
    os.makedirs(SRC, exist_ok=True)
    meta = json.loads(subprocess.run(['curl', '-s', '-m', '60', f'https://api.polyhaven.com/files/{asset}'], capture_output=True, check=True).stdout)
    key = 'Diffuse' if 'Diffuse' in meta else 'diffuse'
    url = meta[key]['1k']['jpg']['url']
    subprocess.run(['curl', '-s', '-m', '120', '-o', path, url], check=True)
    return path


def main():
    sheet = Image.new('RGB', (SIZE, SIZE * len(LAYERS)))
    for i, (name, asset, rot, contrast, mono) in enumerate(LAYERS):
        im = Image.open(fetch(asset)).convert('RGB')
        if rot:
            im = im.rotate(rot, expand=True)
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
        if mono:
            im = im.convert('L').convert('RGB')
        px = im.load()
        n = SIZE * SIZE
        mean = [sum(px[x, y][c] for x in range(SIZE) for y in range(SIZE)) / n for c in range(3)]
        out = Image.new('RGB', (SIZE, SIZE))
        po = out.load()
        for y in range(SIZE):
            for x in range(SIZE):
                p = px[x, y]
                po[x, y] = tuple(max(0, min(255, round(127.5 * (1 + contrast * (p[c] / mean[c] - 1))))) for c in range(3))
        sheet.paste(out, (0, i * SIZE))
        print(f'{name:13} {asset:22} mean {[round(m) for m in mean]}')
    sheet.save(OUT, quality=86, optimize=True)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    sys.exit(main())
