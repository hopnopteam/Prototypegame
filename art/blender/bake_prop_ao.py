"""Visual overhaul, Phase V1: Cycles-baked ambient occlusion for every model the game uses (props, furniture, scenery).

Why per prop (ART_BIBLE.md, "Lighting approach"): upgrades swap props in and out of rooms, so light baked into a room
would be wrong the moment a table is bought. Each model instead carries its own occlusion (the inside of a cup, under a
bed's frame, where a chair's legs meet its seat, and contact with the floor it stands on), baked once here and stored per
vertex. The carriage shell's own light and contact shading stay in the game's runtime light bake (world/lightBake.ts),
which is recomputed whenever the train changes, so every state is always correct.

Input:  assets/models/models.bin + src/world/models/modelIndex.ts (made by scripts/assets/bake_models.py)
Output: assets/models/models_ao.bin, one byte per vertex (255 = open), in models.bin's vertex order.

Run (Blender as a Python module, CPU Cycles; Python 3.11):
  uv venv -p 3.11 /tmp/bpyenv && VIRTUAL_ENV=/tmp/bpyenv uv pip install bpy==5.0.1 numpy
  /tmp/bpyenv/bin/python art/blender/bake_prop_ao.py [--samples 64] [--only id,id]
About 6–10 minutes for every model on 4 cores. The result is committed, so the game build does not need Blender.
"""
import argparse
import json
import os
import re
import struct
import sys
import time

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BIN = os.path.join(ROOT, 'assets', 'models', 'models.bin')
INDEX = os.path.join(ROOT, 'src', 'world', 'models', 'modelIndex.ts')
OUT = os.path.join(ROOT, 'assets', 'models', 'models_ao.bin')


def read_index():
    src = open(INDEX).read()
    totals = json.loads(re.search(r'MODEL_TOTALS = (\{.*?\});', src).group(1).replace('vertices', '"vertices"').replace('indices', '"indices"'))
    body = src[src.index('export const MODEL_INDEX = ') + len('export const MODEL_INDEX = '):src.rindex(' as const')]
    return totals, json.loads(body)


def read_bin(totals):
    data = open(BIN, 'rb').read()
    v = totals['vertices']
    o = 0
    pos = np.frombuffer(data, dtype='<f4', count=v * 3, offset=o).reshape(-1, 3)
    o += v * 12 + v * 3 + v * 3
    if o % 2:
        o += 1
    idx = np.frombuffer(data, dtype='<u2', count=totals['indices'], offset=o)
    return pos, idx


def setup_scene(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.target = 'VERTEX_COLORS'
    # AO distance: a prop-sized reach (metres); the world is black so only geometry occludes.
    scene.world = bpy.data.worlds.new('w')
    scene.world.light_settings.distance = 0.35
    # The floor every prop stands on (so the bottom gets its contact shade), big enough for the largest model.
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    return scene


def bake_model(entry, pos, idx):
    v0, n = entry['vertex'], entry['vertices']
    i0, ni = entry['index'], entry['indices']
    verts = pos[v0:v0 + n]
    # glTF/our Y-up → Blender Z-up: (x, y, z) → (x, -z, y)
    bverts = [(float(x), float(-z), float(y)) for x, y, z in verts]
    tris = idx[i0:i0 + ni].reshape(-1, 3)
    mesh = bpy.data.meshes.new('m')
    mesh.from_pydata(bverts, [], [tuple(int(t) for t in tri) for tri in tris])
    mesh.update()
    obj = bpy.data.objects.new('m', mesh)
    bpy.context.collection.objects.link(obj)
    # Stand it on the floor (the model's own lowest point at 0).
    obj.location.z = -float(entry['min'][1]) + 0.0005
    attr = mesh.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    mesh.color_attributes.active_color = attr
    mat = bpy.data.materials.new('m')
    mesh.materials.append(mat)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO')
    ao = np.array([c.color[0] for c in attr.data], dtype=np.float32)
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    bpy.data.materials.remove(mat)
    return ao


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--only', default='')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    totals, index = read_index()
    pos, idx = read_bin(totals)
    out = np.full(totals['vertices'], 255, dtype=np.uint8)
    if os.path.exists(OUT) and args.only:
        out[:] = np.frombuffer(open(OUT, 'rb').read(), dtype=np.uint8)
    only = set(filter(None, args.only.split(',')))
    setup_scene(args.samples)
    t0 = time.time()
    for k, (name, entry) in enumerate(index.items()):
        if only and name not in only:
            continue
        ao = bake_model(entry, pos, idx)
        out[entry['vertex']:entry['vertex'] + entry['vertices']] = np.clip(ao * 255, 0, 255).astype(np.uint8)
        print(f'{k + 1}/{len(index)} {name}: {entry["vertices"]} verts, mean AO {ao.mean():.2f} ({time.time() - t0:.0f} s)', flush=True)
    open(OUT, 'wb').write(out.tobytes())
    print('wrote', OUT, out.size, 'bytes')


if __name__ == '__main__':
    main()
