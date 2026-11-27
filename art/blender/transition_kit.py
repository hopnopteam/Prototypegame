"""The Grand Departure's set pieces (Stage B of the line transition; CLAUDE.md §8c), crafted in Blender to replace the
Stage A stand-ins in world/TransitionSet.ts at the same places and sizes.

Every piece is shaped for weight: dressed stone laid block by block with bevels that catch the light, voussoirs
radiating round the tunnel mouth, a brick engine shed with quoins, a slate roof and a smoke lantern, a cast-iron lever
frame with its notched quadrant, a ladder-and-hood signal, a panelled coach on its bogies, a roped tarp with folds, a
bamboo arch under thatch, a palm with drooping fronds, a steel pan on its stand, a brass name plate and a gull.

Colours are flat per material role (scripts/assets/bake_models.py `GD` paints them). Parts the game recolours per route
are painted in pure-hue keys: `keyA`/`keyA2` (red band: the portal's stone, the coach's body, the tarp, the hill's
rock), `keyB` (green band: the coach's upper panels, the hill's grass), `keyC` (blue band: dressed stone).

Run (Blender 5.x as the `bpy` module): python3.11 art/blender/transition_kit.py
Writes assets/models/src/transition-kit/<id>.glb. Built z-up with the game's +x as +x and the game's +z (toward the
rear of the train) as Blender -y; the exporter turns them y-up.
"""
import math
import os
import random
import bpy
import bmesh  # after bpy: the module brings bmesh onto the path

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'transition-kit')
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


def bevel(o, width=0.01, segments=2):
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


def box(size, loc, name, rot=(0, 0, 0), bev=0.02, seg=1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    tag(o, name)
    if bev:
        bevel(o, min(bev, min(size) * 0.3), seg)
    return o


def cyl(r, h, loc, name, verts=12, rot=(0, 0, 0), r2=None, bev=0.0, sm=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = tag(active(), name)
    if bev:
        bevel(o, min(bev, r * 0.3))
    if sm:
        smooth(o)
    return o


def sphere(r, loc, name, scale=(1, 1, 1), seg=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = active()
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    tag(o, name)
    return smooth(o)


def mesh_object(name, bm, material, thick=0.0, recalc=False):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.data.materials.append(mat(material))
    if thick:
        o.modifiers.new('thick', 'SOLIDIFY').thickness = thick
    return o


def wedge(a0, a1, r0, r1, y0, y1, cz, name, bev=0.015):
    """One voussoir: an annular sector between angles a0..a1 and radii r0..r1, from y0 to y1, centred at height cz."""
    bm = bmesh.new()
    pts = []
    for y in (y0, y1):
        for a, r in ((a0, r0), (a1, r0), (a1, r1), (a0, r1)):
            pts.append(bm.verts.new((math.cos(a) * r, y, cz + math.sin(a) * r)))
    f = lambda *i: bm.faces.new([pts[k] for k in i])
    f(0, 1, 2, 3); f(7, 6, 5, 4); f(0, 4, 5, 1); f(1, 5, 6, 2); f(2, 6, 7, 3); f(3, 7, 4, 0)
    o = mesh_object('wedge', bm, name, recalc=True)
    if bev:
        bevel(o, bev)
    return o


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)


R = random.Random(1977)

# ── The tunnel portal: dressed stone laid in courses round an arched mouth, voussoirs and a keystone, a cornice and
#    parapet, pilasters, wing walls stepping back into the hill and a sooty brick lining (8.6 m wide, 7.8 m tall).
#    Its face is the plane y = 0 (the game's z = 0), facing -y (the way the track comes in); everything else lies behind.
clear()
SPRING = 3.2          # the arch springs at this height
MOUTH = 2.7           # half the mouth's width (the arch's radius)
HALF = 4.3
TOP = 6.8
course = 0.46
z = 0.0
row = 0
ARCH_C = SPRING + 0.26


def in_opening(x0, x1, z0, z1):
    """Whether a block overlaps the mouth with its pier and voussoir margin."""
    nx_ = min(max(0.0, x0), x1)
    if z0 < ARCH_C and abs(nx_) < MOUTH + 0.74:
        return True
    nz = min(max(ARCH_C, z0), z1)
    return math.hypot(nx_, nz - ARCH_C) < MOUTH + 0.7


while z < TOP - 0.01:
    h = min(course, TOP - z)
    x = -HALF + (0.35 if row % 2 else 0.0)
    if row % 2:
        box((0.33, 0.52, h - 0.04), (-HALF + 0.165, 0.26, z + h / 2), 'keyA2', bev=0.03)
    while x < HALF - 0.05:
        w = min(R.uniform(0.62, 1.05), HALF - x)
        if not in_opening(x, x + w, z, z + h):
            d = R.uniform(-0.025, 0.035)
            box((w - 0.04, 0.52 + d, h - 0.04), (x + w / 2, 0.26 - d / 2, z + h / 2), R.choice(('keyA', 'keyA', 'keyA2')), bev=0.035)
        x += w
    z += h
    row += 1
# Piers either side of the mouth below the springing: big quoin-like blocks, flush with the face.
for side in (-1, 1):
    zz = 0.0
    k = 0
    while zz < SPRING - 0.01:
        hh = min(0.62, SPRING - zz)
        wide = 0.72 if k % 2 else 0.52
        box((wide, 0.56, hh - 0.04), (side * (MOUTH + wide / 2 + 0.02), 0.27, zz + hh / 2), 'keyC', bev=0.035)
        zz += hh
        k += 1
    box((0.86, 0.66, 0.26), (side * (MOUTH + 0.4), 0.28, SPRING + 0.13), 'keyC', bev=0.03)   # the impost
# Voussoirs round the arch, the keystone proud and taller.
N = 15
for i in range(N):
    a0 = i * math.pi / N + 0.012
    a1 = (i + 1) * math.pi / N - 0.012
    key = i == N // 2
    wedge(a0, a1, MOUTH, MOUTH + (0.85 if key else 0.66), -0.06 if key else -0.02, 0.58, SPRING + 0.26, 'keyC', bev=0.025)
# Cornice and parapet with coping.
box((2 * HALF + 0.5, 0.78, 0.22), (0, 0.22, TOP + 0.11), 'keyC', bev=0.04)
box((2 * HALF + 0.3, 0.6, 0.12), (0, 0.24, TOP - 0.04), 'keyC', bev=0.03)
box((2 * HALF + 0.1, 0.5, 0.62), (0, 0.32, TOP + 0.53), 'keyA', bev=0.04)
box((2 * HALF + 0.4, 0.7, 0.16), (0, 0.3, TOP + 0.92), 'keyC', bev=0.04)
# Pilasters at the ends.
for side in (-1, 1):
    box((0.5, 0.7, TOP), (side * (HALF - 0.05), 0.18, TOP / 2), 'keyC', bev=0.04)
    # Wing walls stepping down and back into the hill, each with a coping.
    for j in range(4):
        hh = 5.6 - j * 1.1
        box((0.5, 1.2, hh), (side * (HALF + 0.55 + j * 0.62), 0.85 + j * 1.05, hh / 2), 'keyA', rot=(0, 0, side * -0.5), bev=0.04)
        box((0.62, 1.3, 0.16), (side * (HALF + 0.55 + j * 0.62), 0.85 + j * 1.05, hh + 0.08), 'keyC', rot=(0, 0, side * -0.5), bev=0.03)
# The lining: a sooty brick barrel vault running back from the mouth.
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=MOUTH, depth=4.0, location=(0, 2.0 + 0.4, SPRING), rotation=(math.pi / 2, 0, 0))
vault = active()
bm = bmesh.new()
bm.from_mesh(vault.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.01], context='VERTS')  # keep the upper half (local y is up)
bm.to_mesh(vault.data)
bm.free()
tag(vault, 'soot')
vault.modifiers.new('thick', 'SOLIDIFY').thickness = 0.25
for side in (-1, 1):
    box((0.25, 4.0, SPRING), (side * (MOUTH + 0.12), 2.4, SPRING / 2), 'soot', bev=0)
export('gd_portal')

# ── The hill the tunnel runs into: a lumpy mound, rock on its steep face round the portal, grass over the top
#    (36 x 26 m, 12 m high). Its front is cut flat at y = 0.6, just behind the portal's face.
clear()
bm = bmesh.new()
nx, ny = 36, 26
grid = {}
for j in range(ny + 1):
    for i in range(nx + 1):
        x = -18 + 36 * i / nx
        y = 0.6 + 26 * j / ny
        u = x / 18
        v = (y - 0.6) / 26
        # As high as the portal at its front (so the portal sits in a cutting), rising, then falling away behind.
        dome = max(0.0, 1 - u * u) * (0.68 + 0.32 * math.sin(min(1.0, v * 1.6) * math.pi / 2)) * max(0.0, 1 - max(0.0, v - 0.55) * 2.0)
        lump = 0.55 * math.sin(x * 0.7 + y * 0.31) + 0.35 * math.sin(x * 0.23 - y * 0.9) + 0.2 * math.sin(x * 1.9 + y * 1.3)
        zz = max(0.0, dome * 12.0 + lump * dome * 1.4)
        grid[(i, j)] = bm.verts.new((x, y, zz))
for j in range(ny):
    for i in range(nx):
        bm.faces.new((grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
# The cut face at the front: a skirt down to the ground.
for i in range(nx):
    a, b = grid[(i, 0)], grid[(i + 1, 0)]
    # No skirt behind the tunnel's mouth: the way in stays open.
    if max(abs(a.co.x), abs(b.co.x)) < 3.3:
        continue
    if a.co.z > 0.01 or b.co.z > 0.01:
        a0 = bm.verts.new((a.co.x, a.co.y, 0))
        b0 = bm.verts.new((b.co.x, b.co.y, 0))
        bm.faces.new((a0, b0, b, a))
o = mesh_object('hill', bm, 'keyB')
o.data.materials.append(mat('keyA'))
for p in o.data.polygons:
    # Steep faces show rock; the gentle top is grass.
    p.material_index = 1 if p.normal.z < 0.5 or (p.center.y < 2.2 and p.normal.z < 0.8) else 0
export('gd_hill')

# ── The engine shed: a brick gable front with stone quoins, a segmental-arched doorway 6.6 m wide, a roundel in the
#    gable, a slate roof with bargeboards and a louvred smoke lantern, and 22 m of side walls with arched windows. Its
#    face is the plane y = 0, facing +y (the game's -z, toward the engine); the shed runs back along -y.
clear()
W = 4.8
EAVES = 7.2
APEX = 9.6
DOOR = 3.3
DOOR_H = 5.4
LEN = 22.0
ARC_R = 4.6
ARC_C = DOOR_H - math.sqrt(ARC_R * ARC_R - DOOR * DOOR)
# The face, brick by course band, stopping at the doorway's quoins below and at the arch's voussoirs above.
zz = 0.0
k = 0
while zz < EAVES - 0.01:
    hh = min(0.5, EAVES - zz)
    zc = zz + hh / 2
    if zc < DOOR_H:
        x0 = DOOR + 0.55
    elif zc - ARC_C < ARC_R + 0.6:
        x0 = math.sqrt(max(0.0, (ARC_R + 0.6) ** 2 - (zc - ARC_C) ** 2))
    else:
        x0 = 0.0
    shade = 'brick' if k % 3 else 'brickDark'
    if x0 <= 0.01:
        box((2 * W, 0.4, hh - 0.02), (0, -0.2, zc), shade, bev=0)
    else:
        for side in (-1, 1):
            box((W - x0, 0.4, hh - 0.02), (side * (x0 + W) / 2, -0.2, zc), shade, bev=0)
    zz += hh
    k += 1
# The gable above the eaves: a triangle of brick.
bm = bmesh.new()
pts = [bm.verts.new(p) for p in ((-W, 0, EAVES), (W, 0, EAVES), (0, 0, APEX), (-W, -0.4, EAVES), (W, -0.4, EAVES), (0, -0.4, APEX))]
bm.faces.new((pts[0], pts[1], pts[2])); bm.faces.new((pts[5], pts[4], pts[3]))
bm.faces.new((pts[0], pts[3], pts[4], pts[1])); bm.faces.new((pts[1], pts[4], pts[5], pts[2])); bm.faces.new((pts[2], pts[5], pts[3], pts[0]))
mesh_object('gable', bm, 'brick')
# Quoins at the corners and round the doorway: alternating long and short dressed stones.
for side in (-1, 1):
    zz = 0.0
    k = 0
    while zz < EAVES - 0.01:
        hh = min(0.42, EAVES - zz)
        wide = 0.7 if k % 2 else 0.45
        box((wide, 0.5, hh - 0.03), (side * (W - wide / 2 + 0.04), -0.18, zz + hh / 2), 'stoneDressed', bev=0.025)
        if zz < DOOR_H:
            box((0.55 if k % 2 else 0.4, 0.5, hh - 0.03), (side * (DOOR + 0.27), -0.18, zz + hh / 2), 'stoneDressed', bev=0.025)
        zz += hh
        k += 1
# The segmental arch over the doorway: stone voussoirs.
a_lo = math.atan2(DOOR_H - ARC_C, DOOR)
a_hi = math.pi - a_lo
for i in range(11):
    a0 = a_lo + (a_hi - a_lo) * i / 11 + 0.008
    a1 = a_lo + (a_hi - a_lo) * (i + 1) / 11 - 0.008
    wedge(a0, a1, ARC_R, ARC_R + (0.72 if i == 5 else 0.55), -0.52 if i == 5 else -0.48, 0.04, ARC_C, 'stoneDressed', bev=0.02)
# The tympanum fan over the doors: dark glazing in an iron frame with upright bars.
bm = bmesh.new()
ring = [bm.verts.new((math.cos(a_lo + (a_hi - a_lo) * i / 16) * (ARC_R - 0.02), -0.12, ARC_C + math.sin(a_lo + (a_hi - a_lo) * i / 16) * (ARC_R - 0.02))) for i in range(17)]
bm.faces.new(ring)
mesh_object('fan', bm, 'glassDark', recalc=True)
for xb in (-2.2, -1.1, 0.0, 1.1, 2.2):
    top = ARC_C + math.sqrt(ARC_R * ARC_R - xb * xb)
    box((0.06, 0.06, top - DOOR_H), (xb, -0.14, (top + DOOR_H) / 2), 'iron', bev=0)
box((2 * DOOR, 0.1, 0.12), (0, -0.14, DOOR_H + 0.06), 'iron', bev=0)
# The roundel in the gable.
bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.11, major_segments=24, minor_segments=8, location=(0, 0.02, EAVES + 1.05), rotation=(math.pi / 2, 0, 0))
tag(active(), 'stoneDressed')
cyl(0.56, 0.06, (0, -0.04, EAVES + 1.05), 'glassDark', 20, rot=(math.pi / 2, 0, 0))
box((1.1, 0.05, 0.06), (0, 0.01, EAVES + 1.05), 'iron', bev=0); box((0.06, 0.05, 1.1), (0, 0.01, EAVES + 1.05), 'iron', bev=0)
# A string course at the eaves and the plinth along the foot.
box((2 * W + 0.3, 0.55, 0.2), (0, -0.16, EAVES), 'stoneDressed', bev=0.03)
for side in (-1, 1):
    box((W - DOOR - 0.5, 0.56, 0.5), (side * (DOOR + 0.5 + (W - DOOR - 0.5) / 2), -0.14, 0.25), 'stoneDressed', bev=0.03)
# Side walls running back, with pilasters and arched windows (dark glass).
for side in (-1, 1):
    box((0.4, LEN, EAVES), (side * (W - 0.2), -0.4 - LEN / 2, EAVES / 2), 'brick', bev=0.01)
    for j in range(6):
        y = -0.4 - 1.8 - j * 3.6
        box((0.12, 0.5, EAVES - 0.2), (side * (W + 0.03), y - 1.8, EAVES / 2 - 0.1), 'brickDark', bev=0.02)
        box((0.06, 1.5, 2.6), (side * (W + 0.02), y, 3.6), 'glassDark', bev=0)
        cyl(0.75, 0.08, (side * (W + 0.02), y, 4.9), 'glassDark', 12, rot=(0, math.pi / 2, 0), sm=False)
        box((0.12, 1.7, 0.14), (side * (W + 0.05), y, 2.25), 'stoneDressed', bev=0.02)
# The roof: two slate slopes with an overhang, bargeboards and the smoke lantern on the ridge.
pitch = math.atan2(APEX - EAVES, W)
slope = math.hypot(W + 0.4, APEX - EAVES + 0.3)
for side in (-1, 1):
    box((slope, LEN + 0.9, 0.16), (side * (W + 0.4) / 2, -LEN / 2 + 0.1, (EAVES + APEX) / 2 + 0.08), 'slate', rot=(0, side * pitch, 0), bev=0.02)
    box((slope, 0.12, 0.34), (side * (W + 0.4) / 2, 0.42, (EAVES + APEX) / 2 + 0.02), 'woodDark', rot=(0, side * pitch, 0), bev=0.02)
box((1.4, LEN * 0.8, 0.9), (0, -LEN / 2, APEX + 0.35), 'slateLight', bev=0.03)
for j in range(16):
    box((1.46, 0.08, 0.5), (0, -LEN * 0.1 - j * LEN * 0.8 / 16, APEX + 0.4), 'woodDark', bev=0)
box((1.9, LEN * 0.82, 0.12), (0, -LEN / 2, APEX + 0.86), 'slate', bev=0.02)
# A lamp bracket either side of the doorway.
for side in (-1, 1):
    box((0.08, 0.5, 0.08), (side * (DOOR + 0.7), 0.25, DOOR_H - 0.3), 'iron', bev=0)
    cyl(0.16, 0.36, (side * (DOOR + 0.7), 0.5, DOOR_H - 0.55), 'iron', 8, r2=0.1)
    sphere(0.12, (side * (DOOR + 0.7), 0.5, DOOR_H - 0.72), 'lampGlass')
export('gd_shed')

# ── A shed door leaf: tongue-and-groove planks, ledges and a Z brace, iron strap hinges (3.25 x 5.4 m). Hinged on
#    its +x edge at x = 0, the leaf running to -x; face toward +y.
clear()
for i in range(13):
    box((0.24, 0.1, 5.4), (-0.13 - i * 0.25, 0, 2.7), 'doorGreen' if i % 2 else 'doorGreen2', bev=0.012)
for zc in (0.6, 2.7, 4.8):
    box((3.1, 0.07, 0.24), (-1.62, 0.08, zc), 'doorGreen2', bev=0.015)
for z0, z1 in ((0.6, 2.7), (2.7, 4.8)):
    L = math.hypot(2.9, z1 - z0)
    box((L, 0.06, 0.2), (-1.62, 0.1, (z0 + z1) / 2), 'doorGreen2', rot=(0, math.atan2(z1 - z0, 2.9), 0), bev=0.012)
for zc in (0.8, 4.6):
    box((1.6, 0.04, 0.12), (-0.85, 0.15, zc), 'iron', bev=0.008)
    cyl(0.05, 0.12, (-1.6, 0.16, zc), 'iron', 8, rot=(math.pi / 2, 0, 0))
box((0.1, 0.06, 0.9), (-3.0, 0.15, 2.4), 'iron', bev=0.01)
export('gd_shed_door')

# ── The lever frame: a timber sill on stone, cast-iron cheeks with arched cut-outs, the notched quadrant, a number
#    plate. The handle is its own piece (gd_lever_handle), pivoting at (0, 0, 0.95).
clear()
box((1.2, 1.0, 0.18), (0, 0, 0.09), 'stoneDressed', bev=0.03)
box((0.95, 0.75, 0.2), (0, 0, 0.28), 'woodDark', bev=0.02)
for side in (-1, 1):
    bm = bmesh.new()
    prof = [(-0.34, 0.38), (0.34, 0.38), (0.26, 0.98), (-0.26, 0.98)]
    vs = [bm.verts.new((side * 0.19, x, z)) for x, z in prof] + [bm.verts.new((side * 0.19 + side * 0.06, x, z)) for x, z in prof]
    bm.faces.new(vs[0:4]); bm.faces.new(vs[7:3:-1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vs[i], vs[j], vs[j + 4], vs[i + 4]))
    o = mesh_object('cheek', bm, 'iron')
    bevel(o, 0.012)
    cyl(0.12, 0.08, (side * 0.22, 0, 0.62), 'ironDark', 14, rot=(0, math.pi / 2, 0))   # the cut-out's boss
# The quadrant: an arc of iron across the top, its notches small teeth along its crown.
bpy.ops.mesh.primitive_torus_add(major_radius=0.55, minor_radius=0.035, major_segments=24, minor_segments=6, location=(0, 0, 0.42), rotation=(0, math.pi / 2, 0))
quad = active()
bm = bmesh.new(); bm.from_mesh(quad.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > -0.33], context='VERTS')     # keep the top arc (local -x is up)
bm.to_mesh(quad.data); bm.free()
tag(quad, 'ironDark')
for i in range(7):
    a = -0.5 + i / 6
    box((0.05, 0.03, 0.05), (0, math.sin(a) * 0.58, 0.42 + math.cos(a) * 0.58), 'ironDark', rot=(-a, 0, 0), bev=0.006)
box((0.08, 0.08, 0.16), (0, 0, 0.88), 'brass', bev=0.01)
box((0.04, 0.26, 0.16), (0.27, 0, 0.62), 'enamel', bev=0.008)
export('gd_lever_frame')

clear()
cyl(0.05, 1.5, (0, 0, 0.75), 'leverRed', 10, r2=0.035)
cyl(0.045, 0.34, (0, 0, 1.68), 'steel', 12)
sphere(0.055, (0, 0, 1.86), 'steel')
box((0.03, 0.03, 0.8), (0, 0.06, 1.15), 'steel', bev=0.006)          # the catch rod
box((0.12, 0.05, 0.05), (0, 0.06, 1.58), 'steel', bev=0.008)         # its handle
export('gd_lever_handle')

# ── A colour-light signal: a tapered iron post with a finial, a ladder up its back, a landing with a rail, and the
#    head (a rounded backboard with two hooded lamps facing +x at heights 3.3 and 3.65).
clear()
cyl(0.11, 3.4, (0, 0, 1.7), 'iron', 10, r2=0.07)
cyl(0.2, 0.3, (0, 0, 0.15), 'stoneDressed', 10)
sphere(0.07, (0, 0, 4.12), 'iron')
cyl(0.025, 0.18, (0, 0, 4.0), 'iron', 6)
for side in (-1, 1):
    box((0.03, 0.03, 2.6), (-0.28, side * 0.17, 1.3), 'iron', bev=0)
for i in range(9):
    box((0.025, 0.34, 0.025), (-0.28, 0, 0.3 + i * 0.28), 'iron', bev=0)
box((0.55, 0.55, 0.04), (-0.05, 0, 2.62), 'iron', bev=0.006)
box((0.55, 0.02, 0.5), (-0.05, 0.27, 2.87), 'iron', bev=0)
box((0.12, 0.42, 0.95), (0.04, 0, 3.47), 'paintBlack', bev=0.05)
for zc in (3.3, 3.65):
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.14, depth=0.16, location=(0.17, 0, zc + 0.01), rotation=(0, math.pi / 2, 0))
    hood = active()
    bm = bmesh.new(); bm.from_mesh(hood.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > 0.02], context='VERTS')     # half a cylinder: the hood over the lamp (local -x is up)
    bm.to_mesh(hood.data); bm.free()
    hood.modifiers.new('thick', 'SOLIDIFY').thickness = 0.015
    tag(hood, 'paintBlack')
    cyl(0.11, 0.03, (0.105, 0, zc), 'ironDark', 14, rot=(0, math.pi / 2, 0))
export('gd_signal')

# ── The coach (the next line's first carriage, its livery keyed): 18 m long, 5.0 m wide like the game's carriages,
#    panelled sides with a window band, a curved roof, end doors with grab rails, the underframe with truss rods,
#    two bogies and buffers. Runs along -y from y = 0 (its front, toward the engine) to y = -18.
clear()
L = 18.0
HW = 2.5
SILL = 0.55
WAIST = 1.55
TOPB = 2.85
box((2 * HW, L - 0.1, WAIST - SILL), (0, -L / 2, (SILL + WAIST) / 2), 'keyA', bev=0.04)
box((2 * HW - 0.02, L - 0.1, TOPB - WAIST), (0, -L / 2, (WAIST + TOPB) / 2), 'keyB', bev=0.04)
# Windows along both sides, glass set back in a frame, with beading lines between panels.
nwin = 7
for side in (-1, 1):
    for i in range(nwin):
        y = -1.9 - i * (L - 3.8) / (nwin - 1)
        box((0.06, 1.25, 0.95), (side * (HW + 0.005), y, WAIST + 0.62), 'glassWarm', bev=0)
        box((0.08, 1.4, 0.07), (side * (HW + 0.02), y, WAIST + 0.12), 'trimGold', bev=0.01)
        box((0.07, 0.07, 1.1), (side * (HW + 0.02), y - 0.72, WAIST + 0.62), 'keyB', bev=0.01)
        box((0.07, 0.07, 1.1), (side * (HW + 0.02), y + 0.72, WAIST + 0.62), 'keyB', bev=0.01)
    for i in range(nwin + 1):
        y = -1.0 - i * (L - 2.0) / nwin
        box((0.05, 0.06, WAIST - SILL - 0.12), (side * (HW + 0.02), y, (SILL + WAIST) / 2), 'trimGold', bev=0)
    box((0.05, L - 0.3, 0.06), (side * (HW + 0.025), -L / 2, WAIST), 'trimGold', bev=0)
    for yd in (-0.6, -L + 0.6):
        box((0.06, 0.7, 2.0), (side * (HW + 0.01), yd, SILL + 1.1), 'keyA', bev=0.02)
        box((0.06, 0.4, 0.5), (side * (HW + 0.03), yd, SILL + 1.7), 'glassWarm', bev=0)
        cyl(0.02, 1.1, (side * (HW + 0.06), yd + 0.42, SILL + 1.05), 'brass', 8)
# The roof: a shallow curve.
bm = bmesh.new()
segs = 12
ring_pts = []
for j in (0, 1):
    y = 0.15 - j * (L + 0.3)
    row = []
    for i in range(segs + 1):
        a = math.pi * (0.12 + 0.76 * i / segs)
        row.append(bm.verts.new((math.cos(a) * (HW + 0.1), y, TOPB - 0.25 + math.sin(a) * 0.75)))
    ring_pts.append(row)
for i in range(segs):
    bm.faces.new((ring_pts[0][i], ring_pts[0][i + 1], ring_pts[1][i + 1], ring_pts[1][i]))
o = mesh_object('roof', bm, 'roofGrey', thick=0.08)
smooth(o)
for i in range(4):
    cyl(0.1, 0.18, (0.6 - i * 0.4 + (i % 2) * 0.8, -3 - i * 4, TOPB + 0.55), 'roofGrey', 8)
# Underframe, truss rods and bogies.
box((2 * HW - 0.6, L - 0.4, 0.22), (0, -L / 2, SILL - 0.11), 'underframe', bev=0.02)
for side in (-1, 1):
    for yb in (-3.0, -L + 3.0):
        box((0.12, 2.6, 0.3), (side * 1.15, yb, 0.42), 'underframe', bev=0.02)
        for dy in (-0.9, 0.9):
            cyl(0.42, 0.12, (side * 1.18, yb + dy, 0.42), 'wheel', 16, rot=(0, math.pi / 2, 0))
            cyl(0.14, 0.14, (side * 1.2, yb + dy, 0.42), 'steel', 10, rot=(0, math.pi / 2, 0))
        cyl(0.07, 0.5, (side * 1.3, yb, 0.62), 'steel', 8)            # the spring
    box((0.06, L - 7.0, 0.06), (side * 1.4, -L / 2, 0.2), 'underframe', bev=0)
for yd, s in ((0.15, 1), (-L - 0.15, -1)):
    box((2 * HW - 1.0, 0.18, 0.32), (0, yd, 0.7), 'bufferRed', bev=0.03)
    for side in (-1, 1):
        cyl(0.09, 0.4, (side * 0.9, yd + s * 0.25, 0.7), 'steel', 10, rot=(math.pi / 2, 0, 0))
        cyl(0.16, 0.05, (side * 0.9, yd + s * 0.46, 0.7), 'steel', 14, rot=(math.pi / 2, 0, 0))
export('gd_coach')

# ── The coach's tarp: a heavy canvas over a rounded frame, sagging between the ropes that tie it down, its hem
#    flared and folded (5.4 x 3.6 x 18.4 m). Same extent and axes as gd_coach.
clear()
bm = bmesh.new()
L2 = 18.4
nu, nv = 28, 72
verts = {}
for j in range(nv + 1):
    y = 0.2 - L2 * j / nv
    sag = 0.09 * math.sin(math.pi * ((-y + 0.2) % 4.6) / 4.6)
    for i in range(nu + 1):
        t = i / nu                                     # 0 at one hem, 1 at the other, over the top
        a = math.pi * t
        side = -math.cos(a)
        top = math.sin(a)
        x = side * (2.7 + 0.12 * (1 - top))
        zc = 0.2 + top * 3.35 + (1 - top) ** 3 * -0.1
        fold = 0.07 * math.sin(y * 2.7 + i * 0.9) * (1 - top) ** 2
        flare = 0.16 * (1 - top) ** 6
        x += fold + math.copysign(flare, x)
        zc -= sag * top
        verts[(i, j)] = bm.verts.new((x, y, zc))
for j in range(nv):
    for i in range(nu):
        bm.faces.new((verts[(i, j)], verts[(i + 1, j)], verts[(i + 1, j + 1)], verts[(i, j + 1)]))
# Close the two ends with a gathered skirt.
for j, s in ((0, 1), (nv, -1)):
    c = bm.verts.new((0, 0.2 - L2 * j / nv + s * 0.08, 2.0))
    for i in range(nu):
        f = (verts[(i, j)], verts[(i + 1, j)], c)
        bm.faces.new(f if s < 0 else f[::-1])
o = mesh_object('tarp', bm, 'keyA', thick=0.03, recalc=True)
smooth(o)
for k in range(5):
    y = 0.2 - 0.9 - k * 4.1
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.035, major_segments=32, minor_segments=6, location=(0, y, 1.9), rotation=(math.pi / 2, 0, 0))
    rope = active()
    rope.scale = (2.78, 1, 1.72)
    bpy.ops.object.transform_apply(scale=True)
    tag(rope, 'rope')
export('gd_tarp')

# ── The welcome arch over the walkway (spanning y = -2.2..2.2, facing +x): clusters of bamboo with nodes, a lashed
#    lintel, a thatched gable with a ragged fringe, hibiscus along the lintel and a woven board where the sign goes.
clear()
for ys in (-2.2, 2.2):
    for dx, dy, r in ((0, 0, 0.11), (0.14, 0.12, 0.08), (-0.12, 0.13, 0.08)):
        cyl(r, 3.9, (dx, ys + dy, 1.95), 'bamboo', 8)
        for k in range(5):
            cyl(r + 0.015, 0.05, (dx, ys + dy, 0.5 + k * 0.75), 'bambooNode', 8)
    for k in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.22, minor_radius=0.025, major_segments=16, minor_segments=4, location=(0.02, ys + 0.06, 3.1 + k * 0.12))
        tag(active(), 'rope')
for zc in (3.72, 3.98):
    cyl(0.1, 5.2, (0, 0, zc), 'bamboo', 10, rot=(math.pi / 2, 0, 0))
# The thatch: five overlapping layers down each slope from the ridge to the eaves, each lower layer lying over the
# one above like shingles, their hems ragged.
RIDGE = (0.0, 5.1)
EAVE = (1.5, 3.82)
for side in (-1, 1):
    for k in range(5):
        t0, t1 = k * 0.19, min(1.0, k * 0.19 + 0.32)
        lift = 0.03 + k * 0.025
        bm = bmesh.new()
        n = 26
        top, bot = [], []
        for i in range(n + 1):
            y = -2.95 + 5.9 * i / n
            rag = 0.07 * math.sin(i * 2.3 + k) + 0.05 * math.sin(i * 5.1 + k * 2)
            x0 = side * (RIDGE[0] + (EAVE[0] - RIDGE[0]) * t0)
            z0 = RIDGE[1] + (EAVE[1] - RIDGE[1]) * t0 + lift
            x1 = side * (RIDGE[0] + (EAVE[0] - RIDGE[0]) * t1 + (0.06 if k == 4 else 0))
            z1 = RIDGE[1] + (EAVE[1] - RIDGE[1]) * t1 + lift + rag
            top.append(bm.verts.new((x0, y, z0)))
            bot.append(bm.verts.new((x1, y, z1)))
        for i in range(n):
            bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
        mesh_object('thatch', bm, 'straw' if k % 2 else 'strawDark', thick=0.07, recalc=True)
cyl(0.08, 6.1, (0, 0, 5.2), 'bambooNode', 8, rot=(math.pi / 2, 0, 0))
box((0.08, 3.6, 0.82), (0.0, 0, 3.25), 'weave', bev=0.03)
for i in range(13):
    y = -2.0 + 4.0 * i / 12
    zc = 3.6 - 0.18 * math.sin(math.pi * i / 12)
    sphere(0.09, (0.14, y, zc), ('petal', 'petalPink', 'petalYellow', 'petalWhite')[i % 4], scale=(0.6, 1, 1), seg=7, rings=4)
    sphere(0.03, (0.19, y, zc), 'pistil', seg=5, rings=3)
for i in range(8):
    y = -1.9 + 3.8 * i / 7
    box((0.04, 0.16, 0.08), (0.12, y, 3.58 - 0.16 * math.sin(math.pi * i / 7)), 'leaf', rot=(0.6 * (1 if i % 2 else -1), 0, 0), bev=0)
export('gd_arch')

# ── A coconut palm (7 m): a curved, ringed trunk, nine drooping fronds with leaflets, a cluster of coconuts.
clear()
segs = 10
pos = []
for i in range(segs + 1):
    t = i / segs
    pos.append((0.9 * t * t, 0.15 * math.sin(t * 2), 6.6 * t))
for i in range(segs):
    (x0, y0, z0), (x1, y1, z1) = pos[i], pos[i + 1]
    r0 = 0.24 - 0.09 * i / segs
    r1 = 0.24 - 0.09 * (i + 1) / segs
    dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl(r0, L, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), 'trunk' if i % 2 else 'trunkDark', 9, r2=r1, sm=True)
    o.rotation_euler = (-math.atan2(dy, dz), math.atan2(dx, math.hypot(dy, dz)), 0)
    cyl(r0 + 0.03, 0.06, (x0, y0, z0 + 0.03), 'trunkDark', 9)
cx, cy, cz = pos[-1]
for k in range(9):
    a = k / 9 * math.pi * 2 + 0.2
    bm = bmesh.new()
    n = 10
    spine = []
    for i in range(n + 1):
        t = i / n
        d = 2.9 * t
        droop = 1.7 * t * t - 0.5 * t
        spine.append((cx + math.cos(a) * d, cy + math.sin(a) * d, cz + 0.2 - droop))
    for i in range(n):
        t = (i + 0.5) / n
        p0, p1 = spine[i], spine[i + 1]
        w = 0.55 * math.sin(math.pi * min(1, t * 1.15))
        nxv, nyv = -math.sin(a), math.cos(a)
        for s in (-1, 1):
            v0 = bm.verts.new(p0)
            v1 = bm.verts.new(p1)
            v2 = bm.verts.new((p1[0] + nxv * w * s * 0.9, p1[1] + nyv * w * s * 0.9, p1[2] - 0.22 * w))
            v3 = bm.verts.new((p0[0] + nxv * w * s, p0[1] + nyv * w * s, p0[2] - 0.25 * w))
            bm.faces.new((v0, v1, v2, v3) if s > 0 else (v3, v2, v1, v0))
    mesh_object('frond', bm, 'frond' if k % 2 else 'frondDark', thick=0.02, recalc=True)
for k in range(5):
    a = k * 1.25
    sphere(0.16, (cx + math.cos(a) * 0.2, cy + math.sin(a) * 0.2, cz - 0.15 - (k % 2) * 0.1), 'coconut')
export('gd_palm')

# ── A steel pan on its stand: a chrome dish with a hammered pattern of note circles, a painted skirt, a tubular
#    stand on three legs (0.95 m tall, 0.6 m across).
clear()
TOPZ = 1.0
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=10, radius=0.3, location=(0, 0, TOPZ))
pan = active()
bm = bmesh.new(); bm.from_mesh(pan.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.001], context='VERTS')
for v in bm.verts:
    v.co.z *= 0.42
bm.to_mesh(pan.data); bm.free()
pan.modifiers.new('thick', 'SOLIDIFY').thickness = 0.012
tag(pan, 'chrome')
smooth(pan)
# The skirt: an open drum below the playing surface.
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.305, depth=0.2, location=(0, 0, TOPZ - 0.1))
skirt = active()
bm = bmesh.new(); bm.from_mesh(skirt.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context='FACES')
bm.to_mesh(skirt.data); bm.free()
skirt.modifiers.new('thick', 'SOLIDIFY').thickness = 0.01
tag(skirt, 'panRed')
smooth(skirt)
bpy.ops.mesh.primitive_torus_add(major_radius=0.305, minor_radius=0.014, major_segments=24, minor_segments=6, location=(0, 0, TOPZ))
tag(active(), 'chrome')
# The note circles hammered into the bowl.
for i in range(7):
    a = i / 7 * math.pi * 2
    rr = 0.19
    cyl(0.062, 0.006, (math.cos(a) * rr, math.sin(a) * rr, TOPZ - 0.42 * math.sqrt(0.09 - rr * rr) + 0.006), 'chromeDark', 12)
cyl(0.075, 0.006, (0, 0, TOPZ - 0.126 + 0.006), 'chromeDark', 12)
for i in range(3):
    a = i / 3 * math.pi * 2
    o = cyl(0.015, 0.92, (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.45), 'chromeDark', 8)
    o.rotation_euler = (math.sin(a) * -0.22, math.cos(a) * 0.22, 0)
export('gd_steel_drum')

# ── The name plate: a brass plate with a raised rim and four bolts on two brackets (1.9 x 0.5 m, facing +x).
clear()
box((0.05, 1.9, 0.5), (0, 0, 0.25), 'brass', bev=0.02)
box((0.06, 1.8, 0.04), (0.01, 0, 0.47), 'brassDark', bev=0.01)
box((0.06, 1.8, 0.04), (0.01, 0, 0.03), 'brassDark', bev=0.01)
for ys in (-0.88, 0.88):
    box((0.06, 0.04, 0.44), (0.01, ys, 0.25), 'brassDark', bev=0.01)
    for zc in (0.08, 0.42):
        sphere(0.025, (0.035, ys * 0.96, zc), 'brassDark', seg=8, rings=5)
    box((0.3, 0.06, 0.06), (-0.17, ys * 0.7, 0.05), 'iron', bev=0.01)
export('gd_plate')

# ── A gull: a plump body with a grey back, a yellow beak and a black-tipped tail; and one wing (the game mirrors it).
clear()
sphere(0.16, (0, 0, 0.16), 'gullWhite', scale=(0.75, 2.0, 0.8), seg=14, rings=10)
sphere(0.1, (0, 0.27, 0.24), 'gullWhite', seg=12, rings=8)
cyl(0.03, 0.12, (0, 0.38, 0.23), 'beak', 8, r2=0.005, rot=(-math.pi / 2, 0, 0))
sphere(0.012, (0.06, 0.32, 0.27), 'eye', seg=6, rings=4)
sphere(0.012, (-0.06, 0.32, 0.27), 'eye', seg=6, rings=4)
box((0.16, 0.18, 0.03), (0, -0.33, 0.16), 'gullGrey', bev=0.01)
box((0.12, 0.06, 0.025), (0, -0.43, 0.16), 'gullBlack', bev=0.008)
export('gd_gull')

clear()
bm = bmesh.new()
outline = [(0.0, 0.12), (0.35, 0.14), (0.7, 0.08), (0.95, -0.02), (0.8, -0.08), (0.45, -0.1), (0.0, -0.1)]
vs = [bm.verts.new((x, y, 0.06 * math.sin(x * 2.4))) for x, y in outline]
bm.faces.new(vs)
o = mesh_object('wing', bm, 'gullGrey', thick=0.025)
smooth(o)
bm = bmesh.new()
tip = [(0.7, 0.08), (0.95, -0.02), (0.8, -0.08)]
vs = [bm.verts.new((x, y, 0.06 * math.sin(x * 2.4) + 0.014)) for x, y in tip]
bm.faces.new(vs)
mesh_object('tip', bm, 'gullBlack', thick=0.02)
export('gd_gull_wing')
