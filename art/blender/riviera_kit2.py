"""The Riviera, second pass (owner, 26 Nov, with reference images: "Kids play area is extremely badly designed… make it
exactly like that… make better models, use Blender"; the Smoothie Bar and the Beach Lounge after their own references;
"the spa area is way too empty").

Modelled like the first tropical kits (tropical_kit.py, beach_kit.py, kids_kit.py): real sizes in metres, z-up (the
exporter turns them y-up), bevels on hard edges and subdivision on soft things, flat-coloured by material role (each
role's colour is in scripts/assets/bake_models.py `TROP`). The front of a piece faces −y (the game turns it into place).

Kids' Play: a thatched bamboo climbing tower with a rope net and a slide, a pirate ship with a mast and a flag, a ball
pit in a ring of rocks, a bamboo swing set, a dolphin and a crab on springs, a beach ball, a palm in a pot.
Beach Lounge: a beach umbrella in rainbow panels, a volleyball net, beach rocks, a thatched tiki bar, a rolled towel.
Smoothie Bar: a thatched bar counter, a three-flavour juice dispenser, a fruit bowl, a cup stack, a chalk menu on an
easel, the bar's hanging sign.
Spa: a bamboo screen, a stone water basin, a candle cluster, an orchid, a stack of rolled towels, a zen sand tray.

Run (Blender 5.x as the `bpy` module): python3.11 art/blender/riviera_kit2.py
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


def uvball(r, loc, name, scale=(1, 1, 1), segs=(12, 8)):
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


# ═══════════════════════════════ Kids' Play ═══════════════════════════════════════════════════════════════════════

# ── The climbing tower: a bamboo tower on four posts with a thatched roof, a rope net up one side, a green slide
#    curving down the other, a lookout deck with rails, a little flag (1.0 × 1.5 m, 1.95 m to the roof's tip).
clear()
D = 0.78  # the deck's height
for x in (-0.38, 0.38):
    for y in (-0.38, 0.38):
        cane((x, y, 0), (x, y, 1.55), 0.035)
box((0.86, 0.86, 0.05), (0, 0, D), 'plankLight')
box((0.86, 0.86, 0.04), (0, 0, 0.02), 'toyBlue', bev=0.01)               # a padded mat under it
for side in (-1, 1):                                                       # rails round the deck, open at the slide
    cane((-0.38, side * 0.38, D + 0.32), (0.38, side * 0.38, D + 0.32), 0.016, nodes=False)
    for k in range(5):
        cane((-0.3 + k * 0.15, side * 0.38, D), (-0.3 + k * 0.15, side * 0.38, D + 0.32), 0.011, 'bambooDark', nodes=False)
cane((-0.38, -0.38, D + 0.32), (-0.38, 0.38, D + 0.32), 0.016, nodes=False)
box((0.04, 0.6, 0.22), (-0.38, 0, D + 0.18), 'toyRed', bev=0.006)          # a red panel on the back
thatch(0, 0, 1.5, 0.62, 0.62, 0.42)
rod((0, 0, 1.9), (0, 0, 2.12), 0.008, 'cord')
box((0.003, 0.12, 0.08), (0, 0.06, 2.06), 'toyYellow', bev=0)
# The rope net: a criss-cross of ropes from the floor to the deck on the −y side.
for k in range(5):
    t = k / 4
    rod((-0.32 + t * 0.64, -0.62, 0.02), (-0.32 + t * 0.64, -0.39, D), 0.009, 'rope', 6)
for k in range(4):
    z = 0.15 + k * 0.17
    y = -0.62 + (z / D) * 0.23
    rod((-0.33, y, z), (0.33, y, z), 0.009, 'rope', 6)
# The slide: a curved trough from the deck's +x edge down and out to the floor.
bm = bmesh.new()
cols, rows = 5, 14
for j in range(rows + 1):
    t = j / rows
    x = 0.4 + t * 0.95
    z = D * (1 - t) ** 1.7 + 0.04
    for i in range(cols + 1):
        u = i / cols
        y = -0.2 + 0.4 * u
        bm.verts.new((x, y, z + 0.07 * ((u - 0.5) * 2) ** 2))
bm.verts.ensure_lookup_table()
for j in range(rows):
    for i in range(cols):
        a = j * (cols + 1) + i
        bm.faces.new((bm.verts[a], bm.verts[a + 1], bm.verts[a + cols + 2], bm.verts[a + cols + 1]))
me = bpy.data.meshes.new('slide')
bm.to_mesh(me)
slide = bpy.data.objects.new('slide', me)
bpy.context.collection.objects.link(slide)
slide.modifiers.new('thick', 'SOLIDIFY').thickness = 0.02
slide.data.materials.append(mat('toyGreen'))
smooth(slide)
export('play_tower')

# ── A pirate ship: a little wooden hull, a deck, a mast with a white sail and a skull flag, a steering wheel
#    (1.3 long, 0.75 wide, 1.4 to the flag).
clear()
bm = bmesh.new()
# The hull: a lofted shape, pointed at the bow (−y), square at the stern.
sections = [(-0.65, 0.05, 0.18), (-0.45, 0.25, 0.3), (-0.15, 0.36, 0.36), (0.2, 0.37, 0.38), (0.6, 0.33, 0.42)]
rings = []
for y, half, h in sections:
    ring = []
    for i in range(9):
        a = math.pi * i / 8
        ring.append(bm.verts.new((math.cos(a) * half, y, 0.06 + h - math.sin(a) * h * 0.9 - (h - 0.06) * 0.1)))
    rings.append(ring)
for r in range(len(rings) - 1):
    for i in range(8):
        bm.faces.new((rings[r][i], rings[r][i + 1], rings[r + 1][i + 1], rings[r + 1][i]))
bm.faces.new(list(reversed(rings[-1])))
me = bpy.data.meshes.new('hull')
bm.to_mesh(me)
hull = bpy.data.objects.new('hull', me)
bpy.context.collection.objects.link(hull)
hull.data.materials.append(mat('woodDark'))
hull.modifiers.new('thick', 'SOLIDIFY').thickness = 0.03
smooth(hull)
box((0.66, 1.05, 0.03), (0, 0.05, 0.4), 'plankLight')                      # the deck
box((0.7, 0.04, 0.12), (0, 0.6, 0.48), 'woodDark')                         # the stern rail
for x in (-0.33, 0.33):
    box((0.03, 0.9, 0.05), (x, 0.08, 0.47), 'wood')
cane((0, 0, 0.4), (0, 0, 1.35), 0.03, 'woodDark', nodes=False)             # the mast
cane((-0.32, 0, 1.05), (0.32, 0, 1.05), 0.014, 'woodDark', nodes=False)     # the yard
bm = bmesh.new()
pts = [(-0.3, 1.03), (0.3, 1.03), (0.34, 0.6), (-0.34, 0.6)]
vs = [bm.verts.new((x, 0.02 + 0.04 * (1 - abs(x) / 0.34), z)) for x, z in pts]
bm.faces.new(vs)
me = bpy.data.meshes.new('sail')
bm.to_mesh(me)
sail = bpy.data.objects.new('sail', me)
bpy.context.collection.objects.link(sail)
sail.data.materials.append(mat('canvasA'))
sail.modifiers.new('thick', 'SOLIDIFY').thickness = 0.008
box((0.003, 0.22, 0.14), (0, 0.11, 1.27), 'toyDark', bev=0)                # the flag
ball(0.025, (0.004, 0.09, 1.28), 'paper', sub=1)
cyl(0.09, 0.02, (0, 0.45, 0.62), 'wood', 12, rot=(math.pi / 2, 0, 0))       # the wheel
for k in range(4):
    a = k * math.pi / 4
    rod((math.cos(a) * 0.12, 0.44, 0.62 + math.sin(a) * 0.12), (-math.cos(a) * 0.12, 0.44, 0.62 - math.sin(a) * 0.12), 0.008, 'woodDark', 6)
cyl(0.02, 0.2, (0, 0.47, 0.5), 'woodDark', 8)
for x in (-0.36, 0.36):                                                    # portholes
    cyl(0.04, 0.02, (x * 1.02, 0.1, 0.25), 'toyYellow', 12, rot=(0, math.pi / 2, 0))
export('pirate_ship')

# ── A ball pit: a ring of smooth rocks holding a pit heaped with balls in blues, teals and whites (1.1 across).
clear()
for k in range(11):
    a = k / 11 * math.pi * 2
    r = 0.5
    o = ball(0.12 + 0.03 * (k % 3), (math.cos(a) * r, math.sin(a) * r * 0.85, 0.08), 'rock', scale=(1.25, 1.0, 0.75), sub=2)
    o.rotation_euler = (0, 0, a)
cyl(0.46, 0.06, (0, 0, 0.03), 'rockDark', 24)
cols = ['ballTeal', 'ballBlue', 'paper', 'ballTeal', 'ballMint']
n = 0
for ring_r, count, z in ((0.0, 1, 0.16), (0.14, 7, 0.15), (0.27, 12, 0.13), (0.38, 15, 0.11), (0.08, 5, 0.22), (0.22, 9, 0.2)):
    for k in range(count):
        a = k / count * math.pi * 2 + ring_r * 7
        ball(0.055, (math.cos(a) * ring_r, math.sin(a) * ring_r * 0.85, z), cols[n % len(cols)], sub=1)
        n += 1
export('ball_pit')

# ── A swing set: an A-frame of bamboo, a crossbar wrapped in leaves, two seats on ropes (1.4 long, 1.35 high).
clear()
for x in (-0.65, 0.65):
    cane((x, -0.35, 0), (x, 0, 1.3), 0.03)
    cane((x, 0.35, 0), (x, 0, 1.3), 0.03)
cane((-0.72, 0, 1.3), (0.72, 0, 1.3), 0.03)
for k in range(7):
    ball(0.07, (-0.55 + k * 0.18, 0, 1.36), 'leaf', scale=(1.4, 0.8, 0.35), sub=1)
for x in (-0.3, 0.3):
    rod((x - 0.1, 0, 1.28), (x - 0.1, 0, 0.42), 0.006, 'rope', 6)
    rod((x + 0.1, 0, 1.28), (x + 0.1, 0, 0.42), 0.006, 'rope', 6)
    box((0.26, 0.12, 0.025), (x, 0, 0.41), 'toyRed' if x < 0 else 'toyBlue', bev=0.008)
export('swing_set')

# ── Spring riders: a dolphin and a crab on coiled springs, on a round base.
def spring_base():
    cyl(0.14, 0.03, (0, 0, 0.015), 'paper', 16)
    for k in range(5):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.012, major_segments=12, minor_segments=5, location=(0, 0, 0.06 + k * 0.035))
        tag(active(), 'spring')


clear()
spring_base()
uvball(0.13, (0, 0, 0.36), 'dolphin', scale=(0.75, 1.6, 0.85))
uvball(0.06, (0, -0.24, 0.36), 'dolphin', scale=(0.8, 1.2, 0.7))            # the snout
uvball(0.05, (0, 0.03, 0.48), 'dolphin', scale=(0.4, 1.1, 1.4))             # the dorsal fin
uvball(0.06, (0, 0.24, 0.39), 'dolphin', scale=(1.9, 0.6, 0.35))            # the tail
uvball(0.1, (0, 0.0, 0.3), 'paper', scale=(0.7, 1.3, 0.5))                  # the pale belly
for s in (-1, 1):
    uvball(0.017, (s * 0.085, -0.15, 0.41), 'toyDark')
    rod((s * 0.02, -0.08, 0.44), (s * 0.12, -0.08, 0.48), 0.008, 'toyYellow', 6)   # handles
export('spring_dolphin')

clear()
spring_base()
uvball(0.15, (0, 0, 0.34), 'crab', scale=(1.25, 0.95, 0.6))
for s in (-1, 1):
    rod((s * 0.04, -0.1, 0.4), (s * 0.06, -0.12, 0.5), 0.012, 'crab', 6)    # eye stalks
    uvball(0.024, (s * 0.06, -0.12, 0.51), 'paper')
    uvball(0.012, (s * 0.06, -0.14, 0.515), 'toyDark')
    uvball(0.07, (s * 0.24, -0.08, 0.36), 'crab', scale=(1.0, 0.8, 0.7))      # claws
    for k in range(3):
        rod((s * 0.12, -0.04 + k * 0.06, 0.3), (s * 0.24, -0.02 + k * 0.07, 0.2), 0.012, 'crab', 6)
export('spring_crab')

# ── A beach ball in six panels (kid_ball: the kit already has a beach_ball).
clear()
cols = ['toyRed', 'paper', 'toyYellow', 'paper', 'toyBlue', 'paper']
for k in range(6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.15, location=(0, 0, 0.15))
    o = active()
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    a0, a1 = k / 6 * math.pi * 2, (k + 1) / 6 * math.pi * 2
    kill = [f for f in bm.faces if not (a0 <= (math.atan2(f.calc_center_median().y, f.calc_center_median().x) % (math.pi * 2)) < a1)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me)
    bm.free()
    smooth(tag(o, cols[k]))
export('kid_ball')

# ── A palm in a pot: a woven pot, a curved trunk, a crown of fronds (1.2 tall).
clear()
cyl(0.16, 0.24, (0, 0, 0.12), 'rattan', 14, r2=0.19)
cyl(0.17, 0.02, (0, 0, 0.23), 'woodDark', 14)
pts = [(0, 0, 0.22), (0.02, 0, 0.5), (0.06, 0, 0.8), (0.1, 0, 1.0)]
for k in range(len(pts) - 1):
    rod(pts[k], pts[k + 1], 0.045 - k * 0.008, 'wood', 8)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.045 - k * 0.008, minor_radius=0.008, major_segments=8, minor_segments=4, location=pts[k + 1])
    tag(active(), 'woodDark')
for k in range(7):
    a = k / 7 * math.pi * 2
    tip = (0.1 + math.cos(a) * 0.42, math.sin(a) * 0.42, 0.85)
    mid = (0.1 + math.cos(a) * 0.22, math.sin(a) * 0.22, 1.08)
    for p0, p1 in (((0.1, 0, 1.0), mid), (mid, tip)):
        d = Vector(p1) - Vector(p0)
        o = uvball(0.5, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), 'leaf' if k % 2 else 'leafDark', scale=(d.length, 0.09, 0.012), segs=(8, 5))
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(d.normalized())
export('palm_pot')

# ═══════════════════════════════ Beach Lounge ═════════════════════════════════════════════════════════════════════

# ── A beach umbrella: rainbow panels on a pole (1.6 across, 1.75 tall).
clear()
cols = ['toyRed', 'toyYellow', 'toyGreen', 'ballTeal', 'toyBlue', 'petalPink']
for k in range(12):
    a0 = k / 12 * math.pi * 2
    a1 = (k + 1) / 12 * math.pi * 2
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 1.72))
    p0 = bm.verts.new((math.cos(a0) * 0.8, math.sin(a0) * 0.8, 1.42))
    p1 = bm.verts.new((math.cos(a1) * 0.8, math.sin(a1) * 0.8, 1.42))
    bm.faces.new((c, p0, p1))
    me = bpy.data.meshes.new('panel')
    bm.to_mesh(me)
    o = bpy.data.objects.new('panel', me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat(cols[k % len(cols)]))
    o.modifiers.new('thick', 'SOLIDIFY').thickness = 0.01
cyl(0.018, 1.75, (0, 0, 0.875), 'pole', 8)
uvball(0.03, (0, 0, 1.75), 'paper')
export('rainbow_umbrella')

# ── A volleyball net on two posts (2.0 wide, 1.1 high).
clear()
for x in (-1.0, 1.0):
    cyl(0.03, 1.1, (x, 0, 0.55), 'woodDark', 8)
    uvball(0.04, (x, 0, 1.11), 'woodDark')
box((2.0, 0.01, 0.05), (0, 0, 1.03), 'paper', bev=0)
box((2.0, 0.01, 0.03), (0, 0, 0.72), 'paper', bev=0)
for k in range(21):
    x = -1.0 + k * 0.1
    rod((x, 0, 0.72), (x, 0, 1.03), 0.003, 'net', 4)
for k in range(4):
    z = 0.78 + k * 0.07
    rod((-1.0, 0, z), (1.0, 0, z), 0.003, 'net', 4)
export('volley_net')

# ── Beach rocks: a cluster of three rounded boulders.
clear()
ball(0.3, (0, 0, 0.18), 'rock', scale=(1.3, 1.0, 0.75), sub=2)
ball(0.2, (0.36, 0.12, 0.12), 'rockDark', scale=(1.1, 1.0, 0.7), sub=2)
ball(0.14, (-0.3, 0.18, 0.08), 'rock', scale=(1.0, 1.2, 0.7), sub=2)
export('beach_rocks')

# ── A thatched tiki bar: a bamboo counter on three sides under a thatched roof on four posts, bottles and coconuts
#    on its top, a hanging sign (1.6 × 1.1, 2.1 high).
clear()
for x in (-0.75, 0.75):
    for y in (-0.5, 0.5):
        cane((x, y, 0), (x, y, 1.7), 0.035)
thatch(0, 0, 1.62, 1.05, 0.8, 0.5)
box((1.5, 0.12, 0.08), (0, -0.5, 0.95), 'woodDark')                      # the counter top
for k in range(13):
    cane((-0.7 + k * 0.116, -0.52, 0), (-0.7 + k * 0.116, -0.52, 0.91), 0.024, 'bamboo', nodes=False)
box((0.1, 1.0, 0.08), (0.75, 0, 0.95), 'woodDark')
for k in range(4):
    cyl(0.025, 0.2, (-0.5 + k * 0.32, -0.5, 1.09), ['toyRed', 'toyGreen', 'ballTeal', 'toyYellow'][k], 10)
for k in range(3):
    uvball(0.06, (0.75, -0.3 + k * 0.25, 1.05), 'coconut')
box((0.6, 0.03, 0.18), (0, -0.62, 1.45), 'board', bev=0.01)               # the sign under the eaves
box((0.52, 0.035, 0.05), (0, -0.62, 1.45), 'boardStripe', bev=0)
export('tiki_bar')

# ═══════════════════════════════ Smoothie Bar ═════════════════════════════════════════════════════════════════════

# ── A juice dispenser: three glass jars of juice on a stand, each with a tap (0.5 wide, 0.5 tall).
clear()
box((0.52, 0.2, 0.06), (0, 0, 0.03), 'wood', bev=0.008)
for k, c in enumerate(['juiceOrange', 'juicePink', 'juiceGreen']):
    x = -0.17 + k * 0.17
    cyl(0.07, 0.3, (x, 0, 0.21), 'glass', 14)
    cyl(0.064, 0.24, (x, 0, 0.19), c, 14)
    cyl(0.074, 0.03, (x, 0, 0.375), 'woodDark', 14)
    box((0.03, 0.05, 0.025), (x, -0.08, 0.09), 'pole', bev=0.004)
export('juice_dispenser')

# ── A fruit bowl: a wooden bowl heaped with pineapple, oranges, a melon half, bananas and grapes.
clear()
cyl(0.2, 0.08, (0, 0, 0.04), 'woodLight', 18, r2=0.24)
for k, (x, y, c, r) in enumerate([(-0.1, 0.02, 'juiceOrange', 0.06), (0.06, -0.08, 'juiceOrange', 0.055), (0.1, 0.08, 'toyRed', 0.055), (-0.02, 0.1, 'juiceGreen', 0.05)]):
    uvball(r, (x, y, 0.12), c)
cyl(0.05, 0.16, (0.02, 0.0, 0.2), 'toyYellow', 10)                        # a pineapple
for k in range(6):
    a = k / 6 * math.pi * 2
    uvball(0.05, (0.02 + math.cos(a) * 0.02, math.sin(a) * 0.02, 0.33), 'leaf', scale=(0.3, 0.3, 1.0))
for k in range(3):                                                          # bananas
    o = uvball(0.1, (-0.12, -0.1 + k * 0.03, 0.12 + k * 0.01), 'toyYellow', scale=(1.0, 0.22, 0.22))
    o.rotation_euler = (0, 0.3, 0.5)
export('fruit_bowl')

# ── A cup stack: smoothie cups with lids and straws in a row (takeaway).
clear()
for k, c in enumerate(['smoothie', 'juiceOrange', 'juiceGreen', 'smoothie']):
    x = -0.15 + k * 0.1
    cyl(0.04, 0.14, (x, 0, 0.07), 'glass', 12, r2=0.045)
    cyl(0.037, 0.11, (x, 0, 0.06), c, 12, r2=0.042)
    cyl(0.047, 0.015, (x, 0, 0.145), 'paper', 12)
    rod((x, 0, 0.14), (x + 0.02, 0, 0.24), 0.006, 'strawPink', 6)
export('cup_row')

# ── A chalk menu on an easel (0.55 wide, 1.15 tall).
clear()
for x in (-0.24, 0.24):
    rod((x, 0.0, 0), (x * 0.8, 0.08, 1.1), 0.015, 'woodDark', 6)
rod((0, 0.2, 0), (0, 0.06, 0.9), 0.012, 'woodDark', 6)
box((0.52, 0.03, 0.62), (0, 0.0, 0.72), 'chalk', rot=(-0.08, 0, 0), bev=0.006)
box((0.56, 0.035, 0.66), (0, 0.006, 0.72), 'woodLight', rot=(-0.08, 0, 0), bev=0.006)
for k, c in enumerate(['juicePink', 'juiceOrange', 'juiceGreen']):
    uvball(0.04, (-0.15, -0.025, 0.88 - k * 0.15), c, scale=(1, 0.4, 1))
    box((0.24, 0.006, 0.025), (0.06, -0.022, 0.88 - k * 0.15), 'paper', bev=0)
export('chalk_menu')

# ── The bar's sign: a rounded board in coral with a cream panel, two ropes to hang it (0.9 wide).
clear()
box((0.92, 0.05, 0.34), (0, 0, 0), 'canvasB', bev=0.03)
box((0.8, 0.06, 0.24), (0, 0, 0), 'board', bev=0.02)
for k, c in enumerate(['juicePink', 'juiceOrange', 'juiceGreen', 'ballTeal']):
    box((0.12, 0.065, 0.05), (-0.27 + k * 0.18, 0, 0.03), c, bev=0.01)
box((0.62, 0.065, 0.03), (0, 0, -0.06), 'boardStripe', bev=0.006)
for x in (-0.32, 0.32):
    rod((x, 0, 0.17), (x * 0.6, 0, 0.45), 0.006, 'rope', 6)
uvball(0.05, (0.42, -0.03, 0.12), 'petal')
uvball(0.04, (-0.42, -0.03, 0.12), 'petalYellow')
export('smoothie_sign')

# ═══════════════════════════════ Spa ══════════════════════════════════════════════════════════════════════════════

# ── A bamboo privacy screen: canes in a frame, with a fern at its foot (1.0 wide, 1.25 tall).
clear()
for k in range(11):
    cane((-0.5 + k * 0.1, 0, 0), (-0.5 + k * 0.1, 0, 1.25 - 0.08 * ((k - 5) / 5) ** 2), 0.03)
cane((-0.55, 0.0, 0.3), (0.55, 0.0, 0.3), 0.018, 'bambooDark', nodes=False)
cane((-0.55, 0.0, 1.0), (0.55, 0.0, 1.0), 0.018, 'bambooDark', nodes=False)
export('bamboo_screen')

# ── A stone water basin with pebbles and a floating flower (0.6 across).
clear()
cyl(0.3, 0.3, (0, 0, 0.15), 'stone', 20, r2=0.26)
cyl(0.25, 0.02, (0, 0, 0.29), 'water', 20)
for k in range(8):
    a = k / 8 * math.pi * 2
    uvball(0.05, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.03), 'rock' if k % 2 else 'rockDark', scale=(1.2, 1, 0.6))
uvball(0.05, (0.06, 0.04, 0.3), 'petalPink', scale=(1, 1, 0.3))
uvball(0.04, (-0.08, -0.05, 0.3), 'leaf', scale=(1.4, 1, 0.15))
export('stone_basin')

# ── Candles: a cluster of three pillar candles on a tray of pebbles.
clear()
cyl(0.16, 0.02, (0, 0, 0.01), 'woodDark', 16)
for k, (x, y, h) in enumerate([(-0.06, 0, 0.16), (0.06, 0.03, 0.12), (0.01, -0.07, 0.09)]):
    cyl(0.04, h, (x, y, 0.02 + h / 2), 'paper', 12)
    uvball(0.012, (x, y, 0.035 + h), 'flame', scale=(1, 1, 1.6))
export('candles')

# ── An orchid in a pot: a white pot, arching stems with pink blooms.
clear()
cyl(0.08, 0.14, (0, 0, 0.07), 'paper', 14, r2=0.09)
for k in range(4):
    a = k * 1.6
    uvball(0.06, (math.cos(a) * 0.05, math.sin(a) * 0.05, 0.16), 'leaf', scale=(1.6, 0.6, 0.2))
rod((0, 0, 0.14), (0.04, 0, 0.5), 0.006, 'stem', 6)
for k in range(5):
    uvball(0.03, (0.04 + k * 0.035, 0, 0.5 - k * 0.03), 'petalPink', scale=(1, 0.5, 1))
export('orchid')

# ── Rolled towels stacked in a pyramid on a little teak shelf.
clear()
box((0.42, 0.24, 0.03), (0, 0, 0.015), 'woodDark')
for k, (x, z) in enumerate([(-0.12, 0.08), (0.0, 0.08), (0.12, 0.08), (-0.06, 0.18), (0.06, 0.18), (0, 0.28)]):
    cyl(0.055, 0.22, (x, 0, z), 'paper' if k % 2 == 0 else 'towelStripe', 14, rot=(math.pi / 2, 0, 0))
export('towel_stack')

# ── A zen sand tray: raked sand in a low frame with three stones (0.7 × 0.45).
clear()
box((0.7, 0.45, 0.06), (0, 0, 0.03), 'woodDark')
box((0.64, 0.39, 0.03), (0, 0, 0.05), 'sandWet', bev=0.004)
for k in range(5):
    box((0.6, 0.006, 0.004), (0, -0.16 + k * 0.08, 0.067), 'driftwood', bev=0)
for x, y, r in ((-0.15, 0.05, 0.05), (0.12, -0.06, 0.04), (0.2, 0.1, 0.03)):
    uvball(r, (x, y, 0.07), 'rockDark', scale=(1.2, 1, 0.7))
export('zen_tray')
