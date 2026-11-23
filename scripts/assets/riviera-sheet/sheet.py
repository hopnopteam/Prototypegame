# Lays shots out as labelled contact sheets (Riviera assets): python3 -I sheet.py <shots dir> <bake log> <out dir>
# Groups follow the Route 2 brief; each cell shows the model id, triangles and its size in metres (x, y, z).
import os, re, sys
from PIL import Image, ImageDraw, ImageFont
shots, log, out = sys.argv[1:4]
GROUPS = {
    '1-coast': ('Coast scenery', 'palm_straight palm_bend palm_lush palm_slim cypress lemon_tree villa_a villa_b villa_c villa_d villa_e villa_cube lighthouse sea_stack coast_rock boulder sailboat sailboat_b fishing_boat rowboat yacht'),
    '2-station': ('Station', 'awning string_lights lantern_hang fountain pot_terracotta pot_white pots_stack column crab sandcastle beach_bucket cool_box radio beach_ball menu_board'),
    '3-kids': ("Kids' Play Car", 'slide spring_horse seesaw toy_block toy_block_stripe play_rug rug_stripes kids_table kids_chair floor_cushion plushie'),
    '4-spa-pool': ('Spa Car and Pool Car', 'candle slippers towel_folded spa_bottle spa_plant spa_cabinet rubber_duck pool_shower'),
    '5-food': ('Seafood Diner, smoothie and ice-cream bar', 'fish mussel skewer lemon lemon_half orange pineapple coconut_half banana strawberry cherries ice_cone ice_cup ice_scoop smoothie soda_glass cake chocolate'),
    '6-honeymoon': ('Honeymoon suite', 'heart petal rose present'),
}
info = {}
for line in open(log):
    m = re.match(r'(\S+)\s+(\d+) verts\s+(\d+) tris\s+size \[([^\]]*)\]', line)
    if m: info[m.group(1)] = (m.group(3), m.group(4))
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
cell, cols = 240, 6
for key, (name, ids) in GROUPS.items():
    ids = ids.split()
    rows = (len(ids) + cols - 1) // cols
    w = cols * cell
    sheet = Image.new('RGB', (w, 44 + rows * (cell + 38)), '#FBF7EF')
    d = ImageDraw.Draw(sheet)
    d.text((12, 10), f'Riviera Coast Line · {name}', fill='#2A2320', font=title)
    for k, i in enumerate(ids):
        x, y = (k % cols) * cell, 44 + (k // cols) * (cell + 38)
        sheet.paste(Image.open(os.path.join(shots, i + '.png')).convert('RGB').resize((cell, cell), Image.LANCZOS), (x, y))
        d.text((x + 8, y + cell + 2), i, fill='#2A2320', font=font)
        if i in info: d.text((x + 8, y + cell + 20), f'{info[i][0]} tris · {info[i][1]} m', fill='#6A5F58', font=small)
    sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(os.path.join(out, f'{key}.png'), optimize=True)
    print(key, len(ids))
