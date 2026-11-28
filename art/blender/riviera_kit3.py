"""The Riviera, third pass (session 69, the owner: "Spa and Honeymoon Suites in the Blender style", after the spa reference
docs/art/refs/concept_tropical_6.jpg): the spa's furniture modelled like the other coast kits.

A teak massage table (turned legs, a slatted shelf of rolled towels, a padded white top with a face cradle, a teal runner
across it and a folded towel with a frangipani at its foot), a coopered foot-bath tub of water and petals, a woven
planter of hibiscus and fern, and a garland of flowers and leaves to hang along a wall.

Same conventions as riviera_kit2.py: metres, z-up, the front toward -y, flat colour roles painted from `TROP` in
scripts/assets/bake_models.py. Run: python3.11 art/blender/riviera_kit3.py
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'tropical-kit')
os.makedirs(OUT, exist_ok=True)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def tag(o, name):
    o.data.materials.clear()
    o.data.materials.append(mat(name))
    return o


def active():
    return bpy.context.object


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def bevel(o, width=0.006, segments=2):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    return o


def subsurf(o, levels=1):
    m = o.modifiers.new('subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return o


def box(size, loc, name, rot=(0, 0, 0), bev=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    tag(o, name)
    if bev:
        bevel(o, min(bev, min(size) * 0.3))
    return o


def cyl(r, h, loc, name, verts=12, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    return smooth(tag(active(), name))


def ball(r, loc, name, scale=(1, 1, 1), sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = active()
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return smooth(tag(o, name))


def uvball(r, loc, name, scale=(1, 1, 1), segs=(7, 4)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs[0], ring_count=segs[1], radius=r, location=loc)
    o = active()
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return smooth(tag(o, name))


def rod(p0, p1, r, name, verts=8):
    """A straight round rod from p0 to p1."""
    d = Vector(p1) - Vector(p0)
    mid = (Vector(p0) + Vector(p1)) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=mid)
    o = active()
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return smooth(tag(o, name))


def cane(p0, p1, r=0.024, name='bamboo', nodes=True):
    o = rod(p0, p1, r, name)
    if nodes:
        d = Vector(p1) - Vector(p0)
        n = max(1, int(d.length / 0.25))
        for i in range(1, n):
            t = i / n
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.06, minor_radius=r * 0.22, major_segments=8, minor_segments=4,
                                             location=Vector(p0) + d * t)
            ring = active()
            ring.rotation_mode = 'QUATERNION'
            ring.rotation_quaternion = o.rotation_quaternion
            tag(ring, 'bambooNode')
    return o


def thatch(cx, cy, z, rx, ry, h, name='straw', layers=3):
    """A thatched roof: stacked shaggy cones (a pyramid with drooping eaves), each layer a little smaller."""
    for k in range(layers):
        t = k / layers
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1, radius2=0.05, depth=1, location=(cx, cy, 0))
        o = active()
        o.rotation_euler = (0, 0, math.pi / 4)
        o.scale = (rx * (1 - t * 0.35) * 1.42, ry * (1 - t * 0.35) * 1.42, h * (1 - t * 0.3))
        o.location.z = z + h * 0.5 * (1 - t * 0.3) + t * h * 0.28
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        tag(o, name if k % 2 == 0 else 'strawDark')
        bevel(o, 0.02, 1)
    return o


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)



# ── The massage table (0.74 wide, 1.9 long, its top 0.62 high; the head at -y).
clear()
L, W, TOP = 1.9, 0.74, 0.62
for x in (-W / 2 + 0.06, W / 2 - 0.06):
    for y in (-L / 2 + 0.12, L / 2 - 0.12):
        cyl(0.03, TOP - 0.12, (x, y, (TOP - 0.12) / 2), 'woodDark', 10, r2=0.022)
        cyl(0.036, 0.04, (x, y, 0.02), 'woodDark', 10)
for y in (-L / 2 + 0.12, L / 2 - 0.12):
    box((W - 0.12, 0.04, 0.05), (0, y, TOP - 0.16), 'woodDark')
for x in (-W / 2 + 0.06, W / 2 - 0.06):
    box((0.04, L - 0.24, 0.05), (x, 0, TOP - 0.16), 'woodDark')
    box((0.035, L - 0.24, 0.035), (x, 0, 0.2), 'woodDark')
for k in range(7):                                                         # a slatted shelf low down
    box((W - 0.16, 0.08, 0.018), (0, -0.66 + k * 0.22, 0.21), 'wood', bev=0.004)
for k, x in enumerate((-0.2, 0.0, 0.2)):                                   # rolled towels on the shelf
    cyl(0.06, 0.32, (x, 0.35, 0.29), 'paper' if k != 1 else 'towelStripe', 14, rot=(math.pi / 2, 0, 0))
o = box((W, L - 0.14, 0.12), (0, 0.04, TOP - 0.06), 'paper', bev=0.035)   # the padded top
subsurf(o, 1)
bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.04, major_segments=20, minor_segments=8, location=(0, -L / 2 + 0.06, TOP - 0.02))
ring = active()
ring.scale = (1, 0.8, 1)
smooth(tag(ring, 'paper'))
box((W + 0.02, 0.36, 0.125), (0, 0.18, TOP - 0.055), 'cushion', bev=0.02)   # the teal runner across
box((W - 0.2, 0.26, 0.06), (0, L / 2 - 0.34, TOP + 0.03), 'towel', bev=0.02)  # a folded towel at the foot
box((W - 0.2, 0.26, 0.012), (0, L / 2 - 0.34, TOP + 0.066), 'towelStripe', bev=0.004)
for k in range(5):                                                         # a frangipani on it
    a = k / 5 * math.pi * 2
    uvball(0.03, (0.06 + math.cos(a) * 0.035, L / 2 - 0.3 + math.sin(a) * 0.035, TOP + 0.08), 'petalWhite', scale=(1.3, 0.7, 0.25))
uvball(0.015, (0.06, L / 2 - 0.3, TOP + 0.085), 'pistil', scale=(1, 1, 0.6))
uvball(0.04, (-0.08, L / 2 - 0.28, TOP + 0.07), 'leaf', scale=(1.6, 0.7, 0.2))
export('spa_table')

# ── A coopered foot-bath tub of warm water and floating petals (0.52 across, 0.32 tall).
clear()
R, H = 0.26, 0.32
for k in range(16):
    a = k / 16 * math.pi * 2
    o = box((0.1, 0.03, H), (math.cos(a) * (R - 0.015), math.sin(a) * (R - 0.015), H / 2), 'wood' if k % 2 else 'woodLight', bev=0.006)
    o.rotation_euler = (0, 0, a + math.pi / 2)
for z in (0.07, H - 0.07):
    bpy.ops.mesh.primitive_torus_add(major_radius=R + 0.004, minor_radius=0.012, major_segments=24, minor_segments=6, location=(0, 0, z))
    smooth(tag(active(), 'woodDark'))
cyl(R - 0.02, 0.02, (0, 0, 0.01), 'woodDark', 20)
cyl(R - 0.03, 0.02, (0, 0, H - 0.05), 'water', 24)
for k, (x, y, c) in enumerate(((0.08, 0.05, 'petal'), (-0.07, 0.09, 'petalPink'), (0.02, -0.1, 'petal'), (-0.1, -0.04, 'petalPink'), (0.12, -0.06, 'petalWhite'))):
    uvball(0.028, (x, y, H - 0.035), c, scale=(1.2, 0.8, 0.25))
export('foot_bath')

# ── A woven planter of hibiscus and fern (0.42 square box, 0.75 tall to the flowers).
clear()
box((0.42, 0.42, 0.26), (0, 0, 0.13), 'rattan', bev=0.02)
for k in range(5):
    box((0.43, 0.43, 0.012), (0, 0, 0.03 + k * 0.05), 'rattanDark', bev=0)
box((0.38, 0.38, 0.02), (0, 0, 0.255), 'woodDark', bev=0)
for k in range(9):                                                         # fern fronds
    a = k / 9 * math.pi * 2
    uvball(0.09, (math.cos(a) * 0.12, math.sin(a) * 0.12, 0.36), 'leafDark' if k % 2 else 'leaf', scale=(1.8, 0.5, 0.35)).rotation_euler = (0.5, 0, a)
for k in range(6):                                                         # hibiscus shrub leaves
    a = k / 6 * math.pi * 2 + 0.3
    uvball(0.08, (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.5 + (k % 3) * 0.06), 'leaf', scale=(1.5, 1, 0.5))
for k, (x, y, z, c) in enumerate(((0.1, -0.08, 0.66, 'petal'), (-0.12, 0.02, 0.62, 'petalPink'), (0.02, 0.12, 0.7, 'petalYellow'), (-0.04, -0.12, 0.58, 'petal'))):
    for j in range(5):
        a = j / 5 * math.pi * 2
        uvball(0.035, (x + math.cos(a) * 0.035, y + math.sin(a) * 0.035, z), c, scale=(1.4, 0.8, 0.35))
    uvball(0.012, (x, y, z + 0.015), 'pistil')
export('spa_planter')

# ── A garland: a cord swagging between two hooks 1.0 apart, dressed with leaves and flowers in turn.
clear()
N = 14
for k in range(N + 1):
    t = k / N
    x = -0.5 + t
    z = -0.12 * math.sin(t * math.pi)
    if k < N:
        x2 = -0.5 + (k + 1) / N
        z2 = -0.12 * math.sin((k + 1) / N * math.pi)
        rod((x, 0, z), (x2, 0, z2), 0.006, 'cord', 6)
    if k % 2 == 0:
        uvball(0.035, (x, -0.01, z - 0.01), 'leaf', scale=(1.6, 0.6, 0.6))
    else:
        c = ('petal', 'petalPink', 'petalYellow', 'petalWhite')[(k // 2) % 4]
        for j in range(5):
            a = j / 5 * math.pi * 2
            uvball(0.02, (x + math.cos(a) * 0.022, -0.025, z + math.sin(a) * 0.022), c, scale=(1.2, 0.4, 1.2))
        uvball(0.01, (x, -0.035, z), 'pistil')
export('flower_garland')
