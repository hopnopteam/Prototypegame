# Rug and floor candidates (G#) rendered in the emptied Royal Suite / First Class suite.
import json
W = '/tmp/claude-0/hunt/www'
LIGHTS = [{'x': 0.9, 'y': 2.0, 'z': 6.2, 'i': 7, 'd': 5}, {'x': 1.6, 'y': 1.4, 'z': 7.8, 'i': 3, 'd': 4}]
def rug(tex, x, z, w, d, border=None, line=None, bw=0.16, rep=1.2, round_=False, rot=0):
    out = []
    if border: out.append({'color': border, 'x': x, 'z': z, 'w': w, 'd': d, 'y': 0.020, 'round': round_, 'rot': rot})
    if line: out.append({'color': line, 'x': x, 'z': z, 'w': w - 2 * bw + 0.06, 'd': d - 2 * bw + 0.06, 'y': 0.022, 'round': round_, 'rot': rot})
    inset = bw if border else 0
    out.append({'tex': tex, 'x': x, 'z': z, 'w': w - 2 * inset, 'd': d - 2 * inset, 'y': 0.024, 'repeat': rep, 'round': round_, 'rot': rot})
    return out
ROOM = {'x': 0.87, 'z': 5.685, 'w': 2.9, 'd': 7.0}
G = {
 'G1': ('Gold damask on claret', 'Poly Haven floral_jacquard, recoloured; claret border, gold line', rug('rugtex/gold_damask.jpg', 0.87, 6.3, 2.0, 2.8, '#5A1424', '#D4AF5A', rep=1.6), 5),
 'G2': ('Sapphire damask on navy', 'Poly Haven floral_jacquard, recoloured; navy border, gold line', rug('rugtex/sapphire_damask.jpg', 0.87, 6.3, 2.0, 2.8, '#0C1A3A', '#D4AF5A', rep=1.6), 4),
 'G3': ('Crimson weave, Persian frame', 'Poly Haven quatrefoil_jacquard_fabric; navy border, gold line', rug('rugtex/crimson_quatrefoil.jpg', 0.87, 6.3, 2.0, 2.8, '#14204A', '#D4AF5A', bw=0.22, rep=1.4), 5),
 'G4': ('Sapphire velvet, gold border', 'Poly Haven velour_velvet, recoloured', rug('rugtex/sapphire_velvet.jpg', 0.87, 6.3, 2.0, 2.8, '#C9A24A', None, bw=0.08, rep=0.8), 4),
 'G5': ('Claret velvet, gold border', 'Poly Haven velour_velvet, recoloured', rug('rugtex/claret_velvet.jpg', 0.87, 6.3, 2.0, 2.8, '#C9A24A', None, bw=0.08, rep=0.8), 5),
 'G6': ('Camel suede, chocolate border', 'Poly Haven scuba_suede (today\'s Royal floor, with real texture)', rug('rugtex/camel_suede.jpg', 0.87, 6.3, 2.0, 2.8, '#3B2214', '#C9A24A', rep=0.8), 5),
 'G7': ('Champagne herringbone wool', 'Poly Haven poly_wool_herringbone, recoloured', rug('rugtex/champagne_herringbone.jpg', 0.87, 6.3, 2.0, 2.8, '#2A2F45', None, bw=0.12, rep=2.4), 4),
 'G8': ('Emerald and gold weave', 'Poly Haven quatrefoil_jacquard_fabric, recoloured', rug('rugtex/emerald_quatrefoil.jpg', 0.87, 6.3, 2.0, 2.8, '#2B1A10', '#D4AF5A', rep=1.4), 5),
 'G9': ('Round plush rug', 'Poly Haven faux_fur_geometric, recoloured', rug('rugtex/mauve_plush.jpg', 0.87, 6.3, 1.7, 1.7, round_=True, rep=1.4), 5),
 'G10': ('Ivory fleece by the bed', 'Poly Haven curly_teddy_natural', rug('rugtex/ivory_fleece.jpg', 0.87, 6.3, 1.4, 1.0, rep=1.0), 4),
 'G11': ('Herringbone parquet floor', 'Poly Haven herringbone_parquet, wall to wall', [{'tex': 'phtex/herringbone_parquet_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.7}] + rug('rugtex/gold_damask.jpg', 0.87, 6.6, 1.8, 2.4, '#5A1424', '#D4AF5A', rep=1.6), 5),
 'G12': ('Diagonal parquet floor', 'Poly Haven diagonal_parquet, wall to wall', [{'tex': 'phtex/diagonal_parquet_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.5}], 5),
 'G13': ('Cream marble floor', 'Poly Haven marble_01, wall to wall', [{'tex': 'phtex/marble_01_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.45}] + rug('rugtex/crimson_quatrefoil.jpg', 0.87, 6.6, 1.8, 2.4, '#14204A', '#D4AF5A', bw=0.2, rep=1.4), 5),
 'G14': ('Marble mosaic floor', 'Poly Haven marble_mosaic_tiles, wall to wall', [{'tex': 'phtex/marble_mosaic_tiles_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.5}], 5),
 'G15': ('Strip parquet floor', 'Poly Haven rectangular_parquet, wall to wall', [{'tex': 'phtex/rectangular_parquet_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.6}] + rug('rugtex/sapphire_velvet.jpg', 0.87, 6.6, 1.8, 2.4, '#C9A24A', None, bw=0.08, rep=0.8), 4),
 'G16': ('Rosewood floor', 'Poly Haven rosewood_veneer1, wall to wall', [{'tex': 'phtex/rosewood_veneer1_diff_1k.jpg', **ROOM, 'y': 0.016, 'repeat': 0.6}], 5),
}
meta = {}
for gid, (name, src, rugs, tier) in G.items():
    json.dump({'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': 0.75, 'z': 6.2, 'zoom': 0.5}, 'lights': LIGHTS, 'rugs': rugs}, open(f'{W}/specs/{gid}.json', 'w'))
    meta[gid] = {'name': name, 'src': src, 'tier': tier}
# Rug models (stylised, from packs): one shot with the best three.
KK = 'dl/kk-furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/'
QH = 'dl/q-house/pack/OBJ/'
KN = 'dl/kenney-furn/Models/'
json.dump({'carriage': {'type': 'sleeper', 'tier': 5, 'clear': [0]}, 'cam': {'x': 0.75, 'z': 6.2, 'zoom': 0.5}, 'lights': LIGHTS, 'models': [
  {'url': QH + 'Carpet_1.obj', 'x': 0.3, 'z': 4.6, 'fit': [1.2, 1.6]}, {'url': QH + 'Carpet_Round.obj', 'x': 1.5, 'z': 5.3, 'fit': [1.1, 1.1]},
  {'url': KK + 'rug_oval_A.gltf', 'x': 0.4, 'z': 7.0, 'fit': [1.0, 1.5]}, {'url': KK + 'rug_rectangle_stripes_A.gltf', 'x': 1.6, 'z': 7.4, 'fit': [1.0, 1.4]},
  {'url': KN + 'rugRound.obj', 'x': 1.0, 'z': 8.6, 'fit': [0.9, 0.9]}]}, open(f'{W}/specs/G17.json', 'w'))
meta['G17'] = {'name': 'Rug models from the packs', 'src': 'Quaternius House Interior Carpet_1 and Carpet_Round, KayKit rug_oval_A and rug_rectangle_stripes_A, Kenney rugRound', 'tier': 5}
json.dump(meta, open('/tmp/claude-0/hunt/gen/rugs.json', 'w'))
print(len(meta))
