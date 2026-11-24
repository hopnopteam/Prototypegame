"""The Riviera revamp's beach set, crafted in Blender for weight and form (owner, 24 Nov: "stylised realism with depth
and actual weight… make sure all the Blender ability is being utilised… custom 3D models").

Unlike the first kit (tropical_kit.py, primitives), every piece here is shaped with modifiers: bevels on every hard
edge so light catches them, subdivision on everything organic (shells, the sandcastle, driftwood), a curved sling on
the deck chair, a lathe-turned bucket, shells and a starfish from deformed meshes. Low-poly enough for a phone (each
under ~1,500 triangles) and flat-coloured by material role (scripts/assets/bake_models.py `TROP` paints them); the
props' AO is baked afterwards by art/blender/bake_prop_ao.py like every model.

Run (Blender 5.x as the `bpy` module): /path/to/bpy-python -I art/blender/beach_kit.py
Writes assets/models/src/tropical-kit/<id>.glb. Built z-up; the exporter turns them y-up.
"""
import math
import os
import bpy
import bmesh  # after bpy: the module brings bmesh onto the path

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


def bevel(o, width=0.008, segments=2):
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


def box(size, loc, name, rot=(0, 0, 0), bev=0.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    tag(o, name)
    if bev:
        bevel(o, min(bev, min(size) * 0.3))
    return o


def cyl(r, h, loc, name, verts=12, rot=(0, 0, 0), r2=None, bev=0.004):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = tag(active(), name)
    if bev:
        bevel(o, min(bev, r * 0.3))
    smooth(o)
    return o


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)


# ── Deck chair: an A-frame of hardwood, a striped canvas sling that sags between its rails (0.6 x 0.95 x 0.8 m) ──────
clear()
for x in (-0.27, 0.27):
    box((0.035, 0.95, 0.04), (x, 0.0, 0.33), 'wood', rot=(-0.55, 0, 0))      # the long back rails, leaning
    box((0.035, 0.6, 0.035), (x, 0.12, 0.2), 'wood', rot=(0.65, 0, 0))       # the front legs
    box((0.035, 0.36, 0.03), (x, 0.24, 0.36), 'wood', rot=(0.05, 0, 0))      # the arm rails
for y, z in ((-0.36, 0.72), (0.38, 0.06), (0.32, 0.37)):
    cyl(0.016, 0.58, (0, y, z), 'woodDark', 8, rot=(0, math.pi / 2, 0))      # cross bars
# The sling: a strip of cloth hung between the top bar and the seat bar, sagging in the middle.
bm = bmesh.new()
cols, rows = 6, 14
for j in range(rows + 1):
    t = j / rows
    y = -0.36 + t * 0.68
    z = 0.72 + (0.12 - 0.72) * t - 0.16 * math.sin(t * math.pi)
    for i in range(cols + 1):
        bm.verts.new((-0.25 + 0.5 * i / cols, y, z))
bm.verts.ensure_lookup_table()
for j in range(rows):
    for i in range(cols):
        a = j * (cols + 1) + i
        bm.faces.new((bm.verts[a], bm.verts[a + 1], bm.verts[a + cols + 2], bm.verts[a + cols + 1]))
me = bpy.data.meshes.new('sling')
bm.to_mesh(me)
sling = bpy.data.objects.new('sling', me)
bpy.context.collection.objects.link(sling)
bpy.context.view_layer.objects.active = sling
sling.modifiers.new('thick', 'SOLIDIFY').thickness = 0.012
smooth(sling)
# Stripes: every other column of faces in the second colour.
sling.data.materials.append(mat('canvasA'))
sling.data.materials.append(mat('canvasB'))
for p in sling.data.polygons:
    p.material_index = int(((p.center.x + 0.25) / 0.5) * 6) % 2
export('deck_chair')

# ── Sun lounger: a slatted teak bed with a raised back, legs at the corners (1.9 x 0.65 m) ──────────────────────────
clear()
for i in range(12):
    box((0.6, 0.11, 0.025), (0, -0.25 + i * 0.12, 0.33), 'wood', bev=0.006)
for i in range(5):
    box((0.6, 0.11, 0.025), (0, -0.5 - i * 0.09, 0.42 + i * 0.075), 'wood', rot=(-0.7, 0, 0), bev=0.006)
for x in (-0.3, 0.3):
    box((0.04, 1.95, 0.06), (x, 0.2, 0.3), 'woodDark')
    for y in (-0.6, 1.1):
        box((0.05, 0.05, 0.3), (x, y, 0.15), 'woodDark')
box((0.56, 0.9, 0.035), (0, 0.5, 0.36), 'towel', bev=0.01)
export('sun_lounger')

# ── Beach parasol: a pole, eight ribs and a scalloped canvas in alternate panels (2.0 m across, 2.2 m tall) ──────
clear()
cyl(0.02, 2.2, (0, 0, 1.1), 'pole', 10)
R, top = 1.0, 2.15
for i in range(8):
    a0 = i * math.pi / 4
    a1 = a0 + math.pi / 4
    bm = bmesh.new()
    c = bm.verts.new((0, 0, top))
    pts = []
    for k in range(5):
        a = a0 + (a1 - a0) * k / 4
        sag = 0.04 * math.sin(k / 4 * math.pi)                  # each panel sags a little between its ribs
        pts.append(bm.verts.new((math.cos(a) * R * (1 - sag), math.sin(a) * R * (1 - sag), top - 0.42 + sag)))
    for k in range(4):
        bm.faces.new((c, pts[k], pts[k + 1]))
    me = bpy.data.meshes.new('panel')
    bm.to_mesh(me)
    o = bpy.data.objects.new('panel', me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat('canvasA' if i % 2 else 'canvasB'))
    o.modifiers.new('thick', 'SOLIDIFY').thickness = 0.01
    smooth(o)
    cyl(0.008, 1.08, (math.cos(a0) * 0.5, math.sin(a0) * 0.5, top - 0.21), 'pole', 6, rot=(0, math.atan2(0.42, 1.0) + math.pi / 2, a0))
cyl(0.03, 0.08, (0, 0, top + 0.03), 'pole', 10)
export('beach_parasol')

# ── Sandcastle: a tapered keep and four corner towers with crenels, piled from a sculpted mound ─────────────────────
clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.2, location=(0, 0, 0))
mound = active()
mound.scale = (1.3, 1.3, 0.35)
bpy.ops.object.transform_apply(scale=True)
tag(mound, 'sandWet')
smooth(subsurf(mound))
cyl(0.09, 0.2, (0, 0, 0.14), 'sandWet', 10, r2=0.07)
for i in range(6):
    a = i * math.pi / 3
    box((0.03, 0.03, 0.035), (math.cos(a) * 0.065, math.sin(a) * 0.065, 0.255), 'sandWet', bev=0.006)
for i, (x, y) in enumerate(((-0.15, -0.15), (0.15, -0.15), (-0.15, 0.15), (0.15, 0.15))):
    cyl(0.05, 0.12, (x, y, 0.08), 'sandWet', 10, r2=0.04)
    box((0.02, 0.02, 0.025), (x + 0.02, y, 0.15), 'sandWet', bev=0.004)
box((0.004, 0.06, 0.04), (0.0, 0.0, 0.31), 'pole', bev=0)                 # a flag on a stick
box((0.05, 0.004, 0.03), (0.026, 0.0, 0.32), 'petal', bev=0)
export('sandcastle')

# ── Bucket and spade: a lathe-turned pail with a rim and handle, a spade beside it ─────────────────────────────────
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.075, depth=0.13, location=(0, 0, 0.065))
pail = active()
bm = bmesh.new()
bm.from_mesh(pail.data)
for v in bm.verts:
    if v.co.z > 0:
        v.co.x *= 1.25
        v.co.y *= 1.25
top = [f for f in bm.faces if f.normal.z > 0.9]
bmesh.ops.delete(bm, geom=top, context='FACES')
bm.to_mesh(pail.data)
bm.free()
pail.modifiers.new('thick', 'SOLIDIFY').thickness = 0.006
tag(pail, 'bucket')
smooth(pail)
bpy.ops.mesh.primitive_torus_add(major_radius=0.094, minor_radius=0.006, location=(0, 0, 0.13))
tag(active(), 'bucket')
bpy.ops.mesh.primitive_torus_add(major_radius=0.09, minor_radius=0.004, location=(0, 0, 0.13), rotation=(math.pi / 2, 0, 0))
handle = active()
tag(handle, 'pole')
cyl(0.075, 0.03, (0, 0, 0.1), 'sandWet', 16)                              # sand inside
box((0.05, 0.08, 0.006), (0.17, 0.0, 0.02), 'spade', rot=(0, 0.25, 0), bev=0.002)
cyl(0.008, 0.2, (0.2, 0.0, 0.11), 'woodDark', 6, rot=(0, -0.35, 0))
export('bucket_spade')

# ── Shells: a scallop (fanned ridges) and a conch (a twisted cone), and a starfish ──────────────────────────────────
clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=6, radius=0.04, location=(0, 0, 0))
sc = active()
sc.scale = (1.0, 0.85, 0.3)
bpy.ops.object.transform_apply(scale=True)
for v in sc.data.vertices:
    a = math.atan2(v.co.y, v.co.x)
    v.co.z += 0.004 * math.cos(a * 7) * (1 if v.co.z > 0 else 0)
    if v.co.z < 0:
        v.co.z *= 0.2
tag(sc, 'shell')
smooth(subsurf(sc))
bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.03, radius2=0.002, depth=0.09, location=(0.11, 0.03, 0.02), rotation=(0, math.pi / 2, 0))
conch = active()
tw = conch.modifiers.new('twist', 'SIMPLE_DEFORM')
tw.deform_method = 'TWIST'
tw.angle = 2.4
tw.deform_axis = 'X'
tag(conch, 'shellPink')
smooth(subsurf(conch))
export('shells')

clear()
bm = bmesh.new()
centre = bm.verts.new((0, 0, 0.018))
ring = []
for k in range(10):
    a = k * math.pi / 5
    r = 0.09 if k % 2 == 0 else 0.03
    ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.004 if k % 2 == 0 else 0.012)))
for k in range(10):
    bm.faces.new((centre, ring[k], ring[(k + 1) % 10]))
bottom = bm.verts.new((0, 0, 0.0))
for k in range(10):
    bm.faces.new((bottom, ring[(k + 1) % 10], ring[k]))
me = bpy.data.meshes.new('star')
bm.to_mesh(me)
star = bpy.data.objects.new('starfish', me)
bpy.context.collection.objects.link(star)
star.data.materials.append(mat('starfish'))
smooth(subsurf(star))
export('starfish')

# ── Driftwood: a weathered branch, bent and knotted (sculpted from a subdivided, displaced cylinder) ───────────────
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.045, depth=0.9, location=(0, 0, 0.04), rotation=(0, math.pi / 2, 0))
log = active()
bm = bmesh.new()
bm.from_mesh(log.data)
bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.5], cuts=8)
for v in bm.verts:
    t = v.co.z / 0.45                                            # along the branch (before the rotation)
    v.co.x += 0.04 * math.sin(t * 2.6)
    v.co.y += 0.03 * math.cos(t * 1.7)
    shrink = 1 - 0.45 * max(0, t) ** 2
    v.co.x *= shrink if abs(v.co.x) < 0.2 else 1
    v.co.y *= shrink
bm.to_mesh(log.data)
bm.free()
tag(log, 'driftwood')
smooth(subsurf(log))
cyl(0.02, 0.25, (0.15, 0.08, 0.06), 'driftwood', 6, rot=(0, math.pi / 2, 0.7))
export('driftwood')

# ── Surfboard: a rounded board with a stripe and a fin, standing on its tail ────────────────────────────────────────
clear()
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=(0, 0, 0))
board = active()
board.scale = (0.25, 0.035, 0.95)
bpy.ops.object.transform_apply(scale=True)
for v in board.data.vertices:
    if v.co.z < 0:
        v.co.x *= 1 - 0.25 * (-v.co.z / 0.95)
tag(board, 'board')
smooth(subsurf(board))
board.location = (0, 0, 0.95)
box((0.04, 0.074, 1.6), (0, 0, 0.95), 'boardStripe', bev=0.01)
box((0.008, 0.08, 0.1), (0, 0.06, 0.2), 'woodDark', bev=0.003)
export('surfboard')
