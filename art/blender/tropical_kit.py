"""The Riviera revamp's tropical kit (docs/art/RIVIERA_REVAMP.md), modelled in Blender from primitives.

Every piece is low-poly and flat-coloured: each material is named for its role ("bamboo", "straw", "cushion"…) and
scripts/assets/bake_models.py paints it from the `paint` table of its MODELS entry, so colours stay in one place.
Sizes are real (metres), feet on the ground, facing +z.

Run (Blender 5.x as the `bpy` module): /path/to/bpy-python -I art/blender/tropical_kit.py
Writes assets/models/src/tropical-kit/<id>.glb.
"""
import math
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'tropical-kit')
os.makedirs(OUT, exist_ok=True)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m


def tag(obj, name):
    obj.data.materials.clear()
    obj.data.materials.append(mat(name))
    return obj


def cyl(r, h, loc, name, verts=8, r2=None, rot=(0, 0, 0)):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    return tag(bpy.context.object, name)


def box(size, loc, name, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return tag(o, name)


def ball(r, loc, name, sub=1, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return tag(o, name)


def keep(o, drop):
    """Deletes the vertices of `o` for which drop(co) is true (object mode in and out, a clean selection first)."""
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in o.data.vertices:
        v.select = drop(v.co)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')


def export(name):
    # Blender is z-up; glTF export converts to y-up (the game's), so models are built z-up here.
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)


def bamboo(h, loc, name='bamboo', r=0.03, nodes=True, rot=(0, 0, 0)):
    """A bamboo cane: a slim tube with a node ring every 30 cm (vertical unless rotated)."""
    cyl(r, h, loc, name, 8, rot=rot)
    if not nodes or rot != (0, 0, 0):
        return
    n = max(1, int(h / 0.3))
    for i in range(1, n):
        z = loc[2] - h / 2 + i * h / n
        cyl(r * 1.25, 0.018, (loc[0], loc[1], z), 'node', 8)


# ── Bamboo pole: a 1 m cane on its own, for railings, frames and posts ───────────────────────────────────────────────
clear()
bamboo(1.0, (0, 0, 0.5))
export('bamboo_pole')

# ── Thatch strip: a 1 m fringe of straw hanging from a bamboo rod (bar canopies, cornices) ─────────────────────────
clear()
bamboo(1.0, (0, 0, 0.24), rot=(0, math.pi / 2, 0), r=0.025)
for i in range(14):
    x = -0.48 + i * (0.96 / 13)
    box((0.085, 0.03, 0.26), (x, 0.01 * (i % 2), 0.12), 'straw' if i % 3 else 'strawDark', rot=(0.12 * (1 if i % 2 else -1), 0, 0.04 * ((i * 7) % 5 - 2)))
export('thatch_strip')

# ── Tiki torch: a bamboo staff, a woven cup and a flame ───────────────────────────────────────────────────────────────
clear()
bamboo(1.3, (0, 0, 0.65), r=0.022)
cyl(0.06, 0.14, (0, 0, 1.36), 'rattan', 8, r2=0.075)
ball(0.05, (0, 0, 1.47), 'flame', 1, (1, 1, 1.6))
export('tiki_torch')

# ── Woven pendant lamp: a rattan dome with its bulb (hangs from a beam; the cord is short) ─────────────────────────
clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.22, location=(0, 0, 0.3))
o = bpy.context.object
keep(o, lambda co: co.z < -0.02)
tag(o, 'rattan')
ball(0.07, (0, 0, 0.28), 'bulb', 1)
cyl(0.008, 0.25, (0, 0, 0.63), 'cord', 6)
export('pendant_woven')

# ── Rattan chair: a round woven tub on a low base, a turquoise cushion ────────────────────────────────────────────────
clear()
cyl(0.27, 0.12, (0, 0, 0.36), 'rattan', 12)                     # seat ring
cyl(0.22, 0.08, (0, 0, 0.44), 'cushion', 12)                     # cushion
bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.3, depth=0.42, location=(0, -0.02, 0.62))
back = bpy.context.object
# keep only the back half (a curved back that wraps the sides), open at top and bottom
keep(back, lambda co: co.y > 0.08)
bpy.context.view_layer.objects.active = back
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for p in back.data.polygons:
    p.select = abs(p.normal.z) > 0.9
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.modifier_add(type='SOLIDIFY')
back.modifiers[-1].thickness = 0.04
tag(back, 'rattan')
for a in (0.4, 2.0, 3.6, 5.2):
    cyl(0.018, 0.32, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.16), 'rattanDark', 6)
export('rattan_chair')

# ── Bamboo table: a round slatted top on a bamboo pedestal ────────────────────────────────────────────────────────────
clear()
cyl(0.36, 0.04, (0, 0, 0.72), 'wood', 16)
cyl(0.37, 0.02, (0, 0, 0.7), 'bamboo', 16)
for a in (0, 2.1, 4.2):
    bamboo(0.68, (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.35), r=0.022, nodes=False)
cyl(0.2, 0.03, (0, 0, 0.02), 'bamboo', 10)
export('bamboo_table')

# ── Lounger: a slatted sun lounger with a towel, its back raised (the Beach Lounge, the pool) ──────────────────────
clear()
box((0.62, 1.2, 0.05), (0, 0.15, 0.32), 'wood')
box((0.62, 0.7, 0.05), (0, -0.72, 0.52), 'wood', rot=(-0.55, 0, 0))
box((0.5, 1.15, 0.03), (0, 0.15, 0.36), 'towel')
box((0.5, 0.6, 0.03), (0, -0.7, 0.56), 'towelStripe', rot=(-0.55, 0, 0))
for x in (-0.27, 0.27):
    for y in (-0.35, 0.65):
        box((0.05, 0.05, 0.3), (x, y, 0.15), 'wood')
export('lounger')

# ── Parasol: a striped canopy on a pole, eight panels in two colours ──────────────────────────────────────────────────
clear()
cyl(0.025, 2.1, (0, 0, 1.05), 'pole', 8)
for i in range(8):
    a = i * math.pi / 4
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.95, radius2=0, depth=0.32, location=(0, 0, 2.05), rotation=(0, 0, a))
    tag(bpy.context.object, 'canvasA' if i % 2 else 'canvasB')
cyl(0.03, 0.08, (0, 0, 2.24), 'pole', 8)
export('parasol')

# ── Hibiscus: a cluster of five-petal flowers on a few leaves (garlands, tables, the counter) ────────────────────────
clear()
for i, (x, y, s) in enumerate([(0, 0, 1), (0.09, 0.05, 0.8), (-0.08, 0.06, 0.75)]):
    for k in range(5):
        a = k * 2 * math.pi / 5
        box((0.05 * s, 0.03 * s, 0.008), (x + math.cos(a) * 0.035 * s, y + math.sin(a) * 0.035 * s, 0.05 + 0.01 * i), 'petal' if i != 1 else 'petalPink', rot=(0.3, 0, a))
    ball(0.012 * s, (x, y, 0.06 + 0.01 * i), 'pistil', 0)
for a in (0.5, 2.4, 4.3):
    box((0.07, 0.14, 0.008), (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.03), 'leaf', rot=(0.2, 0, a))
export('hibiscus')

# ── Lei: a flower garland hung in a curve (railings, the lobby desk, guests' necks) ─────────────────────────────────
clear()
for i in range(16):
    t = i / 15
    x = -0.5 + t
    z = -0.18 * math.sin(t * math.pi)
    ball(0.035, (x, 0, z), ['petal', 'petalPink', 'petalYellow', 'petalWhite'][i % 4], 1)
    if i % 2 == 0:
        box((0.06, 0.02, 0.04), (x, -0.025, z - 0.02), 'leaf')
export('lei')

# ── Blender (the smoothie bar): a jug on a motor base, a fruit-coloured smoothie inside ─────────────────────────────
clear()
box((0.16, 0.16, 0.12), (0, 0, 0.06), 'appliance')
cyl(0.065, 0.2, (0, 0, 0.22), 'glass', 10, r2=0.08)
cyl(0.06, 0.12, (0, 0, 0.18), 'smoothie', 10, r2=0.07)
cyl(0.085, 0.03, (0, 0, 0.335), 'appliance', 10)
export('blender')

# ── Coconut drink: half a coconut, a straw and a paper umbrella ───────────────────────────────────────────────────────
clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.06, location=(0, 0, 0.05))
o = bpy.context.object
keep(o, lambda co: co.z > 0.01)
tag(o, 'coconut')
cyl(0.058, 0.01, (0, 0, 0.055), 'coconutFlesh', 10)
cyl(0.004, 0.14, (0.02, 0, 0.11), 'strawPink', 6, rot=(0, 0.25, 0))
cyl(0.003, 0.1, (-0.02, 0, 0.1), 'pole', 4, rot=(0, -0.3, 0))
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.05, radius2=0, depth=0.02, location=(-0.035, 0, 0.15))
tag(bpy.context.object, 'petalPink')
export('coconut_drink')

# ── Monstera: big split leaves on stems from a woven pot ──────────────────────────────────────────────────────────────
clear()
cyl(0.16, 0.28, (0, 0, 0.14), 'rattan', 10, r2=0.19)
for i in range(7):
    a = i * 2 * math.pi / 7
    h = 0.55 + 0.12 * (i % 3)
    cyl(0.008, h, (math.cos(a) * 0.05, math.sin(a) * 0.05, 0.28 + h / 2), 'stem', 4)
    box((0.26, 0.2, 0.01), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.28 + h), 'leaf' if i % 2 else 'leafDark', rot=(0.55 * math.cos(a + math.pi / 2), 0.55 * math.sin(a + math.pi / 2), a))
export('monstera')

# ── Hammock: a woven net slung between two bamboo posts ───────────────────────────────────────────────────────────────
clear()
for y in (-1.0, 1.0):
    bamboo(1.2, (0, y, 0.6), r=0.04)
for i in range(10):
    t = i / 9
    y = -0.85 + t * 1.7
    z = 0.75 - 0.32 * math.sin(t * math.pi)
    box((0.62, 0.2, 0.025), (0, y, z), 'canvasA' if i % 2 else 'canvasB', rot=(0.35 * math.cos(t * math.pi), 0, 0))
export('hammock')

# ── Surf sign: a carved surfboard-shaped sign board (its words are painted on by the game) ──────────────────────────
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=0.04, location=(0, 0, 0))
o = bpy.context.object
o.scale = (1.1, 0.28, 1)
bpy.ops.object.transform_apply(scale=True)
o.rotation_euler = (math.pi / 2, 0, 0)
bpy.ops.object.transform_apply(rotation=True)
tag(o, 'board')
box((1.0, 0.03, 0.03), (0, -0.022, 0.12), 'boardStripe')
box((1.0, 0.03, 0.03), (0, -0.022, -0.12), 'boardStripe')
export('surf_sign')
