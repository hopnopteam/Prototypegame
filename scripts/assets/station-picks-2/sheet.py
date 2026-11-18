# Review sheet of Station Picks 2 crops: python3 -I sheet.py <scratch dir> <out.png> <id>…
import sys
from PIL import Image, ImageDraw
S, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
W, H, C = 400, 300, 4
im = Image.new('RGB', (W * C, (H + 18) * ((len(ids) + C - 1) // C)), 'black'); d = ImageDraw.Draw(im)
for i, k in enumerate(ids):
    try: t = Image.open(f'{S}/page/img/{k}.jpg').resize((W, H))
    except FileNotFoundError: continue
    x, y = (i % C) * W, (i // C) * (H + 18); im.paste(t, (x, y + 18)); d.text((x + 4, y + 3), k, fill='white')
im.save(out)
