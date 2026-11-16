"""Bakes the CC0 models the game uses (assets/models/src/) into one compact binary (assets/models/models.bin) and its
index (src/world/models/modelIndex.ts, generated: do not edit).

Each glTF's palette texture is sampled at every vertex and stored as a vertex colour, so in the game a model is plain
vertex-coloured geometry that merges into the carriage and scenery meshes like every other prop (one draw per
material, no textures). Per model the index records its bounds, the height of its top surface over the middle of its
footprint (`top`: a bed's mattress, a table's top) and which end is taller (`tall`: a bed's headboard, -1 or +1 along z).

Binary layout, in this order: all positions (float32 xyz), all normals (int8 xyz, ×127), all colours (uint8 sRGB rgb),
all indices (uint16, relative to the model's first vertex). Offsets in the index count elements, not bytes.

Run: python3 -I scripts/assets/bake_models.py
"""
import json, os, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'models', 'src')
OUT_BIN = os.path.join(ROOT, 'assets', 'models', 'models.bin')
OUT_TS = os.path.join(ROOT, 'src', 'world', 'models', 'modelIndex.ts')

# id → glTF path under assets/models/src. Keep ids stable: the game names models by them.
MODELS = {
    # KayKit Forest Nature Pack 1.0 (Kay Lousberg, CC0)
    'tree_round': 'kaykit-forest/Tree_1_A_Color1.gltf',
    'tree_cluster': 'kaykit-forest/Tree_2_A_Color1.gltf',
    'bush_round': 'kaykit-forest/Bush_1_A_Color1.gltf',
    'rock_round': 'kaykit-forest/Rock_1_A_Color1.gltf',
    # KayKit Furniture Bits 1.0 (Kay Lousberg, CC0)
    'bed_single': 'kaykit-furniture/bed_single_A.gltf',
    'bed_double': 'kaykit-furniture/bed_double_A.gltf',
    'couch': 'kaykit-furniture/couch_pillows.gltf',
    'armchair': 'kaykit-furniture/armchair_pillows.gltf',
    'table_low': 'kaykit-furniture/table_low.gltf',
    'table_small': 'kaykit-furniture/table_small.gltf',
    'lamp_standing': 'kaykit-furniture/lamp_standing.gltf',
    'cabinet_small': 'kaykit-furniture/cabinet_small.gltf',
    'bar_stool': 'kaykit-furniture/chair_stool.gltf',
    # KayKit Restaurant Bits 1.0 (Kay Lousberg, CC0)
    'chair_slat': 'kaykit-restaurant/chair_A.gltf',
    'chair_solid': 'kaykit-restaurant/chair_B.gltf',
    'cafe_table': 'kaykit-restaurant/table_round_A_small.gltf',
    'stove': 'kaykit-restaurant/stove_multi.gltf',
    'counter': 'kaykit-restaurant/kitchencounter_straight_B.gltf',
}

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_accessor(g, bufs, i):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    fmt, size = COMPONENT[a['componentType']]
    n = SIZE[a['type']]
    stride = v.get('byteStride', size * n)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    data = bufs[v['buffer']]
    out = []
    for k in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, data, start + k * stride))
    if a.get('normalized') and fmt in 'bBhH':
        scale = {'b': 127, 'B': 255, 'h': 32767, 'H': 65535}[fmt]
        out = [tuple(c / scale for c in t) for t in out]
    return out


def quat_matrix(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def node_transform(node):
    """(3×3 linear, translation) of a node's own TRS (the models used have no node hierarchy beyond one mesh node)."""
    if 'matrix' in node:
        m = node['matrix']
        return [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], [m[12], m[13], m[14]]
    r = quat_matrix(node.get('rotation', [0, 0, 0, 1]))
    s = node.get('scale', [1, 1, 1])
    lin = [[r[i][j] * s[j] for j in range(3)] for i in range(3)]
    return lin, node.get('translation', [0, 0, 0])


def bake(path):
    g = json.load(open(path))
    d = os.path.dirname(path)
    bufs = [open(os.path.join(d, b['uri']), 'rb').read() for b in g['buffers']]
    tex = None
    if g.get('images'):
        tex = Image.open(os.path.join(d, g['images'][0]['uri'])).convert('RGB')
    px = tex.load() if tex else None
    pos, nor, col, idx = [], [], [], []
    for node in g['nodes']:
        if 'mesh' not in node:
            continue
        lin, tr = node_transform(node)
        for prim in g['meshes'][node['mesh']]['primitives']:
            base = len(pos)
            p = read_accessor(g, bufs, prim['attributes']['POSITION'])
            n = read_accessor(g, bufs, prim['attributes']['NORMAL'])
            uv = read_accessor(g, bufs, prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else None
            mat = g['materials'][prim['material']] if 'material' in prim else {}
            factor = mat.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
            for k in range(len(p)):
                x, y, z = p[k]
                pos.append(tuple(lin[i][0] * x + lin[i][1] * y + lin[i][2] * z + tr[i] for i in range(3)))
                nx, ny, nz = n[k]
                v = [lin[i][0] * nx + lin[i][1] * ny + lin[i][2] * nz for i in range(3)]
                l = max(1e-9, sum(c * c for c in v) ** 0.5)
                nor.append(tuple(c / l for c in v))
                if uv and px:
                    u, w = uv[k]
                    c = px[int((u % 1) * tex.width) % tex.width, int((w % 1) * tex.height) % tex.height]
                else:
                    c = (255, 255, 255)
                col.append(tuple(min(255, round(c[i] * factor[i])) for i in range(3)))
            ind = read_accessor(g, bufs, prim['indices']) if 'indices' in prim else [(i,) for i in range(len(p))]
            idx.extend(base + t[0] for t in ind)
    return pos, nor, col, idx


def measure(pos):
    xs, ys, zs = zip(*pos)
    lo = [min(xs), min(ys), min(zs)]
    hi = [max(xs), max(ys), max(zs)]
    w, d = hi[0] - lo[0], hi[2] - lo[2]
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    # The top over the middle of the footprint (a mattress, a table top), not the headboard or a lamp shade.
    mid = [y for x, y, z in pos if abs(x - cx) < w * 0.25 and abs(z - cz) < d * 0.2]
    top = max(mid) if mid else hi[1]
    # Which end along z stands taller (a bed's headboard): -1 at min z, +1 at max z.
    near = max([y for x, y, z in pos if z < lo[2] + d * 0.15] or [0])
    far = max([y for x, y, z in pos if z > hi[2] - d * 0.15] or [0])
    tall = -1 if near > far + 1e-3 else 1 if far > near + 1e-3 else 0
    return lo, hi, top, tall


def main():
    positions, normals, colors, indices = [], [], [], []
    index = {}
    for mid, rel in MODELS.items():
        pos, nor, col, idx = bake(os.path.join(SRC, rel))
        if len(pos) > 65535:
            raise SystemExit(f'{mid}: too many vertices for uint16 indices')
        lo, hi, top, tall = measure(pos)
        index[mid] = {
            'vertex': len(positions), 'vertices': len(pos), 'index': len(indices), 'indices': len(idx),
            'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi], 'top': round(top, 4), 'tall': tall,
        }
        positions += pos
        normals += nor
        colors += col
        indices += idx
        print(f'{mid:14} {len(pos):5} verts {len(idx) // 3:5} tris  size {[round(h - l, 2) for l, h in zip(lo, hi)]} top {top:.2f} tall {tall}')
    with open(OUT_BIN, 'wb') as f:
        f.write(struct.pack(f'<{len(positions) * 3}f', *[c for p in positions for c in p]))
        f.write(struct.pack(f'<{len(normals) * 3}b', *[max(-127, min(127, round(c * 127))) for n in normals for c in n]))
        f.write(struct.pack(f'<{len(colors) * 3}B', *[c for col in colors for c in col]))
        if (len(colors) * 3 + len(normals) * 3) % 2:
            f.write(b'\0')
        f.write(struct.pack(f'<{len(indices)}H', *indices))
    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, 'w') as f:
        f.write('// Generated by scripts/assets/bake_models.py: do not edit.\n')
        f.write('import type { ModelEntry } from \'./types\';\n\n')
        f.write(f'export const MODEL_TOTALS = {{ vertices: {len(positions)}, indices: {len(indices)} }};\n\n')
        f.write('export const MODEL_INDEX = ' + json.dumps(index, indent=2) + ' as const satisfies Record<string, ModelEntry>;\n')
    print('wrote', OUT_BIN, os.path.getsize(OUT_BIN), 'bytes;', len(positions), 'vertices', len(indices) // 3, 'triangles')


if __name__ == '__main__':
    sys.exit(main())
