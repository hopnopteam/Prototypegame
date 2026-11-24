"""The sand detail layer (the Riviera revamp), baked in Blender from a procedural shader.

A seamless 512 px tile of beach sand, mono, stored around 0.5 like every detail layer (the game multiplies a part's
colour by 2 x texel): wind ripples running across the tile (wavy, of uneven height), a fine grain, a cloudy figure of
damper and drier sand, and the odd fleck of broken shell. It tiles because every noise is 4D noise sampled on a torus:
u turns a circle in (x, y) and v a circle in (z, w), so the left edge meets the right and the top the bottom.

Run (Blender 5.x as the `bpy` module): /path/to/bpy-python -I art/blender/sand_texture.py
Writes assets/textures/src/sand.png (art/textures/build_stylized.py adds it to the detail sheet).
"""
import math
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'textures', 'src', 'sand.png')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
SIZE = 512

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.device = 'CPU'

bpy.ops.mesh.primitive_plane_add(size=2)
plane = bpy.context.object
mat = bpy.data.materials.new('sand')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
plane.data.materials.append(mat)
N = nt.nodes.new
L = nt.links.new


def math_node(op, a, b=None, value=None):
    n = N('ShaderNodeMath')
    n.operation = op
    if isinstance(a, (int, float)):
        n.inputs[0].default_value = a
    else:
        L(a, n.inputs[0])
    if b is not None:
        if isinstance(b, (int, float)):
            n.inputs[1].default_value = b
        else:
            L(b, n.inputs[1])
    return n.outputs[0]


tex = N('ShaderNodeTexCoord')
sep = N('ShaderNodeSeparateXYZ')
L(tex.outputs['UV'], sep.inputs[0])
u, v = sep.outputs[0], sep.outputs[1]
tau = 2 * math.pi


def torus(radius):
    """The UV square wrapped onto a torus in 4D: a vector (x, y, z) and w, each a circle of `radius`."""
    au = math_node('MULTIPLY', u, tau)
    av = math_node('MULTIPLY', v, tau)
    comb = N('ShaderNodeCombineXYZ')
    L(math_node('MULTIPLY', math_node('COSINE', au), radius), comb.inputs[0])
    L(math_node('MULTIPLY', math_node('SINE', au), radius), comb.inputs[1])
    L(math_node('MULTIPLY', math_node('COSINE', av), radius), comb.inputs[2])
    return comb.outputs[0], math_node('MULTIPLY', math_node('SINE', av), radius)


def noise4(radius, detail, rough=0.5):
    vec, w = torus(radius)
    n = N('ShaderNodeTexNoise')
    n.noise_dimensions = '4D'
    n.inputs['Scale'].default_value = 1.0
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    L(vec, n.inputs['Vector'])
    L(w, n.inputs['W'])
    return n.outputs['Fac']


# Ripples: 9 crests across the tile along v, wandering with a low noise (whole periods, so they tile).
wander = math_node('ADD', math_node('MULTIPLY', math_node('SUBTRACT', noise4(0.6, 2), 0.5), 2.2), math_node('MULTIPLY', math_node('SUBTRACT', noise4(2.2, 1), 0.5), 0.5))
phase = math_node('ADD', math_node('MULTIPLY', v, 11.0), wander)
ripple = math_node('SINE', math_node('MULTIPLY', phase, tau))
# A sharper crest on the downwind side: a skewed wave (crest bright, the lee a soft shadow).
crest = math_node('POWER', math_node('MULTIPLY', math_node('ADD', ripple, 1.0), 0.5), 1.6)
height = math_node('MULTIPLY', crest, math_node('POWER', noise4(1.2, 2), 1.5))
# Damp and dry patches, and the grain.
cloud = noise4(1.1, 4, 0.55)
grain = noise4(28.0, 2, 0.8)
fleck = math_node('GREATER_THAN', noise4(40.0, 0), 0.74)

value = math_node('ADD', 0.7, math_node('MULTIPLY', height, 0.42))
value = math_node('ADD', value, math_node('MULTIPLY', math_node('SUBTRACT', cloud, 0.5), 0.3))
value = math_node('ADD', value, math_node('MULTIPLY', math_node('SUBTRACT', grain, 0.5), 0.16))
value = math_node('ADD', value, math_node('MULTIPLY', fleck, 0.12))

emit = N('ShaderNodeEmission')
L(value, emit.inputs['Strength'])
emit.inputs['Color'].default_value = (1, 1, 1, 1)
out = N('ShaderNodeOutputMaterial')
L(emit.outputs[0], out.inputs['Surface'])

img = bpy.data.images.new('sand', SIZE, SIZE, float_buffer=True)
node = N('ShaderNodeTexImage')
node.image = img
nt.nodes.active = node
bpy.context.view_layer.objects.active = plane
plane.select_set(True)
r = bpy.ops.object.bake(type='EMIT', margin=0)
import numpy as _np
_px = _np.empty(SIZE * SIZE * 4, dtype=_np.float32)
img.pixels.foreach_get(_px)
print('bake', r, 'mean', float(_px.reshape(-1, 4)[:, 0].mean()))
# Write the baked values straight to an 8-bit grey PNG (Blender's save of a float bake comes out empty here).
import struct, zlib
px = _px.reshape(SIZE, SIZE, 4)[::-1, :, 0]
rows = b''.join(b'\x00' + bytes(int(max(0, min(1, x)) * 255 + 0.5) for x in row) for row in px)
def chunk(t, data):
    c = struct.pack('>I', len(data)) + t + data
    return c + struct.pack('>I', zlib.crc32(t + data) & 0xFFFFFFFF)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
open(OUT, 'wb').write(png)
print('wrote', OUT)
