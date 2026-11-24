"""The Riviera's Kids' Play car, modelled in Blender (owner, 24 Nov, with a reference image: "make the kids play area
like this… make the models"): a bamboo climbing frame with a slide, toy blocks and stacking rings, a wooden toy train
on its track, a children's table with stools, books and crayons, a toy shelf, woven poufs, paper lanterns on a bamboo
post, a bamboo fence section hung with a flower garland, and a thatched puppet hut with striped curtains.

Shaped with modifiers like the beach set (beach_kit.py): bevels on hard edges, subdivision on soft things (poufs,
lanterns, toys), bamboo canes with nodes. Real sizes in metres, z-up (the exporter turns them y-up), flat-coloured by
material role (scripts/assets/bake_models.py `TROP`).

Run (Blender 5.x as the `bpy` module): /path/to/bpy-python -I art/blender/kids_kit.py
"""
import math
import os
import bpy
import bmesh  # noqa: F401  (after bpy, as in beach_kit.py)

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


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True
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


def cyl(r, h, loc, name, verts=10, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = tag(active(), name)
    smooth(o)
    return o


def ball(r, loc, name, scale=(1, 1, 1), sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = active()
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    tag(o, name)
    smooth(o)
    return o


def cane(p0, p1, r=0.022, name='bamboo', nodes=True):
    """A bamboo cane from p0 to p1, with a node ring every 25 cm."""
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
    rot = (math.atan2(math.hypot(dx, dy), dz) if True else 0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=length, location=mid)
    o = active()
    o.rotation_mode = 'QUATERNION'
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
    tag(o, name)
    smooth(o)
    if nodes:
        n = max(1, int(length / 0.25))
        for i in range(1, n):
            t = i / n
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.05, minor_radius=r * 0.22, major_segments=8, minor_segments=4,
                                             location=(p0[0] + dx * t, p0[1] + dy * t, p0[2] + dz * t))
            ring = active()
            ring.rotation_mode = 'QUATERNION'
            ring.rotation_quaternion = o.rotation_quaternion
            tag(ring, 'bambooNode')
    return o


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)


# ── Climbing frame and slide: a bamboo deck on four posts with a ladder at the back and a slide down the front ─────
# (1.0 wide along x, 1.2 long along y, the deck 0.55 up; a child plays round it).
clear()
H = 0.55
for x in (-0.4, 0.4):
    for y in (-0.55, -0.1):
        cane((x, y, 0), (x, y, H + 0.4), 0.028)
box((0.86, 0.5, 0.04), (0, -0.32, H), 'plankLight')
for x in (-0.4, 0.4):
    cane((x, -0.55, H + 0.35), (x, -0.1, H + 0.35), 0.018, nodes=False)
cane((-0.4, -0.55, H + 0.35), (0.4, -0.55, H + 0.35), 0.018, nodes=False)
for k in range(4):                                                  # the ladder's rungs at the back
    cane((-0.25, -0.62, 0.12 + k * 0.13), (0.25, -0.62, 0.12 + k * 0.13), 0.014, nodes=False)
for x in (-0.25, 0.25):
    cane((x, -0.62, 0), (x, -0.62, H), 0.016, nodes=False)
# The slide: a curved chute from the deck's front edge down to the floor, with rails.
bm = bmesh.new()
cols, rows = 4, 10
for j in range(rows + 1):
    t = j / rows
    y = -0.08 + t * 0.66
    z = H * (1 - t) ** 1.6 + 0.04
    for i in range(cols + 1):
        x = -0.17 + 0.34 * i / cols
        bm.verts.new((x, y, z + 0.03 * ((i / cols - 0.5) * 2) ** 2))
bm.verts.ensure_lookup_table()
for j in range(rows):
    for i in range(cols):
        a = j * (cols + 1) + i
        bm.faces.new((bm.verts[a], bm.verts[a + 1], bm.verts[a + cols + 2], bm.verts[a + cols + 1]))
me = bpy.data.meshes.new('chute')
bm.to_mesh(me)
chute = bpy.data.objects.new('chute', me)
bpy.context.collection.objects.link(chute)
chute.modifiers.new('thick', 'SOLIDIFY').thickness = 0.015
chute.data.materials.append(mat('toyYellow'))
smooth(chute)
for x in (-0.19, 0.19):
    cane((x, -0.08, H + 0.1), (x, 0.58, 0.1), 0.012, name='bambooDark', nodes=False)
box((0.9, 0.03, 0.2), (0, -0.56, H + 0.18), 'toyRed', bev=0.004)        # a red rail panel at the back
export('play_slide')

# ── Blocks and stacking rings on the floor ──────────────────────────────────────────────────────────────────────
clear()
colours = ['toyRed', 'toyBlue', 'toyYellow', 'toyGreen']
for i, (x, y, z, s) in enumerate([(0, 0, 0.04, 0.08), (0.09, 0.02, 0.04, 0.08), (0.045, 0.01, 0.12, 0.08), (-0.12, 0.08, 0.035, 0.07), (0.16, -0.12, 0.035, 0.07)]):
    box((s, s, s), (x, y, z), colours[i % 4], rot=(0, 0, i * 0.4), bev=0.008)
cyl(0.012, 0.26, (-0.2, -0.08, 0.13), 'woodLight', 8)
cyl(0.06, 0.02, (-0.2, -0.08, 0.01), 'woodLight', 12)
for k, (r, c) in enumerate([(0.07, 'toyRed'), (0.06, 'toyYellow'), (0.05, 'toyGreen'), (0.04, 'toyBlue')]):
    bpy.ops.mesh.primitive_torus_add(major_radius=r - 0.015, minor_radius=0.017, major_segments=14, minor_segments=6, location=(-0.2, -0.08, 0.035 + k * 0.035))
    tag(active(), c)
    smooth(active())
export('toy_blocks')

# ── Toy train on an oval track ─────────────────────────────────────────────────────────────────────────────────
clear()
bpy.ops.mesh.primitive_torus_add(major_radius=0.3, minor_radius=0.03, major_segments=28, minor_segments=4, location=(0, 0, 0.012))
track = active()
track.scale = (1.0, 0.62, 0.35)
bpy.ops.object.transform_apply(scale=True)
tag(track, 'woodLight')
for i, c in enumerate(['toyRed', 'toyBlue', 'toyGreen']):
    a = -0.6 + i * 0.32
    x, y = math.cos(a) * 0.3, math.sin(a) * 0.186
    box((0.1, 0.06, 0.06), (x, y, 0.05), c, rot=(0, 0, a + math.pi / 2), bev=0.01)
    for s in (-1, 1):
        cyl(0.018, 0.012, (x + s * 0.03 * math.cos(a), y + s * 0.03 * math.sin(a), 0.025), 'toyDark', 10, rot=(math.pi / 2, 0, a))
cyl(0.015, 0.05, (math.cos(-0.6) * 0.3, math.sin(-0.6) * 0.186, 0.1), 'toyDark', 8)   # the engine's chimney
export('toy_train')

# ── A children's table with two stools, a drawing book and a cup of crayons ────────────────────────────────────
clear()
box((0.62, 0.42, 0.03), (0, 0, 0.44), 'woodLight')
for x in (-0.27, 0.27):
    for y in (-0.17, 0.17):
        cane((x, y, 0), (x, y, 0.43), 0.016, nodes=False)
for y in (-0.36, 0.36):
    cyl(0.12, 0.03, (0, y, 0.26), 'cushion', 14)
    for a in (0.5, 2.6, 4.7):
        cane((math.cos(a) * 0.08, y + math.sin(a) * 0.08, 0), (math.cos(a) * 0.08, y + math.sin(a) * 0.08, 0.25), 0.012, nodes=False)
box((0.22, 0.16, 0.012), (-0.1, 0.02, 0.462), 'paper', rot=(0, 0, 0.2), bev=0.002)
box((0.2, 0.15, 0.01), (-0.1, 0.02, 0.47), 'toyGreen', rot=(0, 0, 0.2), bev=0.002)
cyl(0.03, 0.06, (0.18, -0.05, 0.485), 'toyBlue', 10)
for i, c in enumerate(['toyRed', 'toyYellow', 'toyGreen']):
    cyl(0.005, 0.08, (0.17 + i * 0.012, -0.05, 0.53), c, 6, rot=(0.15 * (i - 1), 0.1, 0))
export('kids_table')

# ── A toy shelf: bamboo frame, three shelves of toys (a teddy, balls, books, a boat) ───────────────────────────
clear()
for x in (-0.38, 0.38):
    for y in (-0.12, 0.12):
        cane((x, y, 0), (x, y, 0.9), 0.02)
for z in (0.08, 0.42, 0.76):
    box((0.8, 0.26, 0.025), (0, 0, z), 'plankLight')
ball(0.07, (-0.2, 0, 0.17), 'toyRed')
ball(0.06, (0.0, 0, 0.16), 'toyBlue')
ball(0.08, (0.22, 0, 0.5), 'teddy', scale=(1, 0.8, 1.1))
ball(0.05, (0.22, 0, 0.62), 'teddy')
for i, c in enumerate(['toyGreen', 'toyYellow', 'toyRed', 'toyBlue']):
    box((0.03, 0.16, 0.18), (-0.28 + i * 0.035, 0, 0.52), c, bev=0.003)
box((0.2, 0.1, 0.06), (-0.12, 0, 0.82), 'toyBlue', bev=0.01)           # a toy boat
cyl(0.006, 0.14, (-0.12, 0, 0.92), 'woodLight', 6)
box((0.004, 0.08, 0.08), (-0.1, 0, 0.92), 'paper', bev=0)
export('toy_shelf')

# ── Woven pouf: a soft drum of rattan, a coloured top ──────────────────────────────────────────────────────────
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.19, depth=0.32, location=(0, 0, 0.16))
p = active()
subsurf(p)
smooth(p)
tag(p, 'rattan')
for k in range(4):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.192, minor_radius=0.01, major_segments=20, minor_segments=4, location=(0, 0, 0.06 + k * 0.07))
    tag(active(), 'rattanDark')
cyl(0.16, 0.02, (0, 0, 0.322), 'cushion', 16)
export('pouf_woven')

# ── Paper lanterns on a bamboo post ────────────────────────────────────────────────────────────────────────────
clear()
cane((0, 0, 0), (0, 0, 1.25), 0.022)
cane((0, 0, 1.2), (0.32, 0, 1.25), 0.012, name='bambooDark', nodes=False)
cane((0, 0, 1.05), (-0.28, 0, 1.1), 0.012, name='bambooDark', nodes=False)
for x, z, c in ((0.3, 1.07, 'lanternPink'), (-0.26, 0.93, 'lanternGreen')):
    ball(0.1, (x, 0, z), c, scale=(1, 1, 0.9), sub=2)
    for dz in (-0.09, 0.09):
        cyl(0.04, 0.015, (x, 0, z + dz), 'bambooDark', 10)
export('lantern_post')

# ── A bamboo fence section (1 m), knee high, with a flower garland along its rail ──────────────────────────────
clear()
for i in range(9):
    x = -0.48 + i * 0.12
    cane((x, 0, 0), (x, 0, 0.42 + 0.03 * (i % 2)), 0.02, nodes=False)
for z in (0.12, 0.34):
    cane((-0.5, 0.025, z), (0.5, 0.025, z), 0.014, name='bambooDark', nodes=False)
for i in range(13):
    t = i / 12
    x = -0.48 + t * 0.96
    z = 0.4 - 0.08 * math.sin(t * math.pi)
    ball(0.025, (x, 0.04, z), ['petal', 'petalPink', 'petalYellow', 'petalWhite'][i % 4], sub=1)
    if i % 2 == 0:
        box((0.04, 0.012, 0.03), (x, 0.045, z - 0.025), 'leaf', bev=0)
export('bamboo_fence')

# ── Puppet hut: a bamboo booth with a thatched roof, a stage window and striped curtains (0.84 x 2.2 m) ───────────
clear()
for x in (-0.38, 0.38):
    for y in (-1.05, 1.05):
        cane((x, y, 0), (x, y, 1.15), 0.03)
box((0.06, 2.1, 0.55), (0.36, 0, 0.3), 'stripeA', bev=0.004)            # the skirt facing the room
for k in range(7):
    box((0.062, 0.14, 0.55), (0.36, -0.9 + k * 0.3, 0.3), 'stripeB', bev=0)
box((0.06, 2.1, 0.18), (0.36, 0, 1.05), 'stripeA', bev=0.004)            # the pelmet over the stage
for y in (-0.7, 0.7):
    box((0.04, 0.42, 0.42), (0.37, y, 0.78), 'curtain', bev=0.006)
# The thatched roof: two sloping thatch panels meeting at a ridge along the booth, a fringe of straw along each eave.
for side in (-1, 1):
    box((0.56, 2.36, 0.07), (side * 0.24, 0, 1.3), 'straw', rot=(0, side * 0.62, 0), bev=0.01)
    for k in range(-11, 12):
        box((0.06, 0.1, 0.12), (side * 0.47, k * 0.103, 1.11), 'strawDark' if k % 2 else 'straw', rot=(0, side * 0.3, 0.1 * (k % 3 - 1)), bev=0)
cane((0, -1.2, 1.47), (0, 1.2, 1.47), 0.03, name='bambooDark', nodes=False)
export('puppet_hut')
