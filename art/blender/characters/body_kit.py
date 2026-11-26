"""Session 66: the people's bodies, sculpted as one surface (owner: "the bodies are still smooth, simple shapes… the
stick nature of character models… make character that actually looks well connected").

Until now a figure was assembled from tubes in the game (a lathe torso, a lathe sleeve per arm, a lathe trouser leg per
leg), so a shoulder was a cap on a can, a wrist a band, and nothing grew out of anything. Here a body is modelled in
Blender as anatomy at the game's own bone positions (CharacterView: the shoulder, elbow, hip and knee pivots), fused
into one surface and retopologised:

  1. masses: the torso (the game's chest and hip profiles, narrowed as session 65 narrowed it), a neck, a trapezius
     sloping from the neck to each shoulder, a deltoid at each shoulder, arms tapering shoulder → biceps → elbow →
     forearm → wrist, a hip at each leg's top, legs tapering thigh → knee → calf → ankle;
  2. one surface: a fine voxel remesh fuses them (no part passes through another), then relaxing rounds every join,
     so the shoulder rolls into the arm, the neck into the trapezius, the hips into the thighs;
  3. clean topology: QuadriFlow lays even quads over it (rings round the limbs, which is what bends well at an
     elbow or a knee), smooth shaded.

The arms hang straight down in the bind pose, clear of the chest (a gap under the armpit, as on a person), and the
legs clear of each other below the crotch, so each limb can swing without dragging the body with it. Clothes are not
modelled: the game paints them on by region per outfit (world/Body.ts: a sleeve, a trouser leg, a neckline, a hem)
and adds what stands proud (collars, lapels, buttons, pockets, belts) plus the swinging cloth (skirts, coat tails).

Output: assets/models/src/char-kit/ch_body_<build>.glb (painted in the skin key, recoloured per region in the game)
and src/world/models/bodyKit.ts (the bone positions and the torso's measured outline, so everything worn sits on the
real surface). Run: python3.11 art/blender/characters/body_kit.py
"""
import json
import math
import os

import bpy
import bmesh  # after bpy: the module registers it
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'char-kit')
TS_OUT = os.path.join(ROOT, 'src', 'world', 'models', 'bodyKit.ts')
os.makedirs(OUT, exist_ok=True)

# ── The game's numbers (world/CharacterParts.ts) ──────────────────────────────────────────────────────────────────────
HIP_Y = 0.42
SHOULDER_Y = 0.75
ELBOW_Y = -0.165
WRIST_Y = -0.1
KNEE_Y = -0.205
TORSO_DEPTH = 0.84
WAIST, SHOULDERS = 0.68, 0.82
TORSO_R = {'slim': 0.172, 'regular': 0.2, 'stout': 0.235}
HIP_X = {'slim': 0.088 * WAIST, 'regular': 0.098 * WAIST, 'stout': 0.11 * WAIST}
# Limb radii by build (metres): the arm at the shoulder, biceps, elbow, forearm, wrist; the leg at the hip, mid thigh,
# knee, calf, ankle. Fuller than the session 65 tubes (owner: "stick"), and shaped: a biceps, a forearm swell, a calf.
ARM = {'slim': (0.041, 0.039, 0.032, 0.035, 0.025), 'regular': (0.045, 0.043, 0.035, 0.038, 0.027), 'stout': (0.051, 0.049, 0.040, 0.043, 0.030)}
LEG = {'slim': (0.050, 0.045, 0.038, 0.041, 0.030), 'regular': (0.056, 0.050, 0.042, 0.045, 0.032), 'stout': (0.063, 0.057, 0.048, 0.051, 0.035)}
# The ankle sits just over the shoe's top (the shoe is its own model, 0.068 high); the leg ends inside the shoe.
ANKLE_Z = 0.08
# The wrist's end sits inside the hand's cuff stub (the hand is its own model).
NECK_R = 0.05
# How far the arm's inner side stands clear of the chest in the bind pose.
ARM_CLEAR = 0.013
# Session 66: the torso's sculpted shape for a regular build, (y, half-width, front, back) in metres, bottom to top: the
# crotch, the seat, the hips, the waist, the ribs, the chest, the shoulders' slope into the neck.
TORSO_SHAPE = [
    (0.292, 0.06, 0.045, 0.05), (0.30, 0.094, 0.07, 0.085), (0.32, 0.11, 0.082, 0.098), (0.35, 0.121, 0.09, 0.108),
    (0.38, 0.126, 0.094, 0.11), (0.41, 0.126, 0.095, 0.104), (0.44, 0.122, 0.095, 0.096), (0.47, 0.118, 0.095, 0.09),
    (0.50, 0.12, 0.097, 0.09), (0.53, 0.126, 0.1, 0.092), (0.56, 0.134, 0.104, 0.095), (0.59, 0.142, 0.108, 0.098),
    (0.62, 0.148, 0.112, 0.1), (0.65, 0.152, 0.114, 0.101), (0.68, 0.154, 0.113, 0.101), (0.71, 0.152, 0.109, 0.1),
    (0.74, 0.146, 0.1, 0.096), (0.765, 0.135, 0.09, 0.09), (0.785, 0.118, 0.078, 0.082), (0.805, 0.095, 0.066, 0.072),
    (0.822, 0.07, 0.055, 0.06), (0.835, 0.045, 0.04, 0.045)]
# By build: the torso's width and depth, and a belly (a swell at the waist, stout only).
TORSO_W = {'slim': 0.88, 'regular': 1.0, 'stout': 1.16}
TORSO_D = {'slim': 0.9, 'regular': 1.0, 'stout': 1.12}
BELLY = {'slim': 0.0, 'regular': 0.0, 'stout': 0.12}


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def body_width(y):
    return WAIST + (SHOULDERS - WAIST) * smoothstep(0.5, 0.72, y)


def interp(profile, y):
    for (r0, a), (r1, c) in zip(profile, profile[1:]):
        if min(a, c) <= y <= max(a, c):
            return r1 if c == a else r0 + (y - a) / (c - a) * (r1 - r0)
    return 0.0


def shoulder_x(build):
    """The shoulder pivot: the arm hangs straight down clear of the chest at its widest."""
    chest = max(hw for y, hw, fr, bk in TORSO_SHAPE if 0.5 < y < 0.76) * TORSO_W[build]
    return round(chest + ARM[build][0] + ARM_CLEAR, 4)


# ── Blender helpers (Blender axes: x right, −y forward, z up) ────────────────────────────────────────────────────────

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def mat(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def new_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def lathe(name, rings, x0=0.0, y0=0.0, sides=40, depth=1.0):
    """A closed surface of revolution about a vertical axis at (x0, y0): `rings` are (radius, z) bottom to top, the
    first and last radius 0 (closed ends). The section is an ellipse `depth` deep front to back."""
    bm = bmesh.new()
    loops = []
    for r, z in rings:
        if r <= 1e-6:
            loops.append(bm.verts.new((x0, y0, z)))
            continue
        loops.append([bm.verts.new((x0 + r * math.cos(2 * math.pi * k / sides), y0 + r * depth * math.sin(2 * math.pi * k / sides), z)) for k in range(sides)])
    for i in range(len(rings) - 1):
        a, b = loops[i], loops[i + 1]
        if not isinstance(a, list) and not isinstance(b, list):
            continue
        if not isinstance(a, list):
            for k in range(sides):
                bm.faces.new((a, b[k], b[(k + 1) % sides]))
        elif not isinstance(b, list):
            for k in range(sides):
                bm.faces.new((a[(k + 1) % sides], a[k], b))
        else:
            for k in range(sides):
                bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.verts.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm)


def torso_lathe(rings, sides=48):
    """The torso: rings (y, half-width, front depth, back depth) bottom to top, closed at both ends; each section an
    ellipse whose front half (−y) and back half (+y) have their own depth."""
    bm = bmesh.new()
    prev = None
    bottom = bm.verts.new((0, 0, rings[0][0] - 0.012))
    top = bm.verts.new((0, 0, rings[-1][0] + 0.006))
    for y, hw, fr, bk in rings:
        loop = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            c, s = math.cos(a), math.sin(a)
            loop.append(bm.verts.new((hw * c, (-fr if s < 0 else bk) * abs(s), y)))
        if prev is None:
            for k in range(sides):
                bm.faces.new((bottom, loop[(k + 1) % sides], loop[k]))
        else:
            for k in range(sides):
                bm.faces.new((prev[k], prev[(k + 1) % sides], loop[(k + 1) % sides], loop[k]))
        prev = loop
    for k in range(sides):
        bm.faces.new((prev[k], prev[(k + 1) % sides], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object('torso', bm)


def ellipsoid(name, c, r, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=1, location=c, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = r
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return o


def capsule(name, a, b, r, depth=1.0):
    """A rounded bar from a to b (Blender points) of radius r, its section `depth` deep (y)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    rings = [(0, -r)] + [(r * math.sin(math.radians(t)), -r * math.cos(math.radians(t))) for t in range(15, 90, 15)]
    rings += [(r, 0), (r, length)] + [(r * math.cos(math.radians(t)), length + r * math.sin(math.radians(t))) for t in range(15, 90, 15)] + [(0, length + r)]
    o = lathe(name, [(rr, z) for rr, z in rings], sides=28, depth=depth)
    # Point the lathe's z axis along a → b.
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = a
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    o.select_set(False)
    return o


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return bpy.context.object


# ── The body ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def limb_rings(stations, cap_bottom):
    """A limb's lathe rings from its stations [(z, r)] top to bottom: eased between stations, a ring every 6 mm, a
    rounded bottom end."""
    out = []
    zs = [z for z, _ in stations]
    top, bottom = zs[0], zs[-1]
    n = max(2, int((top - bottom) / 0.006))

    def r_at(z):
        for (z0, r0), (z1, r1) in zip(stations, stations[1:]):
            if z1 <= z <= z0:
                t = (z0 - z) / max(1e-6, z0 - z1)
                return r0 + (r1 - r0) * (t * t * (3 - 2 * t))
        return stations[0][1]

    rb = stations[-1][1]
    if cap_bottom:
        for t in range(0, 90, 15):
            a = math.radians(t)
            out.append((rb * math.sin(a), bottom - rb * 0.8 * math.cos(a)))
    for i in range(n + 1):
        z = bottom + (top - bottom) * i / n
        out.append((r_at(z), z))
    return out


def build_body(build):
    clear()
    sx = shoulder_x(build)
    hx = HIP_X[build]
    a0, a1, a2, a3, a4 = ARM[build]
    l0, l1, l2, l3, l4 = LEG[build]
    parts = []

    # The torso, sculpted (session 66): a seat and hips, a waist, the ribs widening to the chest, the chest falling
    # to the shoulders' slope; deeper in front at the chest, behind at the seat. Rings of (y, half-width, front, back).
    w = TORSO_W[build]
    dz = TORSO_D[build]
    rings = []
    for y, hw, fr, bk in TORSO_SHAPE:
        belly = 1 + BELLY[build] * math.exp(-((y - 0.5) / 0.07) ** 2)
        rings.append((y, hw * w * belly, fr * dz * belly, bk * dz))
    parts.append(torso_lathe(rings))

    # The neck, rising into the head (whose chin sits at 0.806).
    parts.append(lathe('neck', [(0, 0.76), (NECK_R, 0.765), (NECK_R, 0.80), (NECK_R * 0.97, 0.86), (0, 0.87)], depth=0.92, sides=32))

    for s in (-1, 1):
        # The trapezius: from the side of the neck down and out to the top of the shoulder.
        parts.append(capsule('trap', (s * 0.035, 0.004, 0.818), (s * (sx - 0.02), 0.004, SHOULDER_Y + 0.012), 0.034, depth=0.8))
        # The deltoid: the round of the shoulder over the arm's top.
        parts.append(ellipsoid('delt', (s * sx, 0.0, SHOULDER_Y - 0.008), (a0 * 1.12, a0 * 1.08, a0 * 1.2)))
        # The arm, straight down from the shoulder pivot: biceps, elbow, forearm swell, wrist (into the hand's cuff).
        z0 = SHOULDER_Y
        stations = [(z0, a0), (z0 - 0.06, a1), (z0 + ELBOW_Y + 0.025, a2 * 1.04), (z0 + ELBOW_Y, a2), (z0 + ELBOW_Y - 0.035, a3),
                    (z0 + ELBOW_Y + WRIST_Y + 0.012, a4), (z0 + ELBOW_Y + WRIST_Y - 0.004, a4 * 0.98)]
        parts.append(lathe('arm', limb_rings(stations, True) + [(0, z0 + 0.004)], x0=s * sx, sides=28, depth=1.02))
        # The hip's round over the leg's top, then the leg straight down: thigh, knee, calf, ankle (into the shoe).
        parts.append(ellipsoid('hip', (s * hx, 0.0, HIP_Y - 0.02), (l0 * 1.05, l0 * 1.05, l0 * 1.25)))
        k = HIP_Y + KNEE_Y
        legs = [(HIP_Y, l0), (HIP_Y - 0.1, l1), (k + 0.02, l2 * 1.03), (k, l2), (k - 0.05, l3), (ANKLE_Z + 0.02, l4), (ANKLE_Z - 0.025, l4 * 0.98)]
        parts.append(lathe('leg', limb_rings(legs, True) + [(0, HIP_Y + 0.004)], x0=s * hx, sides=28, depth=1.04))
        # The seat: a soft round behind each hip.
        parts.append(ellipsoid('seat', (s * 0.048 * TORSO_W[build], 0.045 * TORSO_D[build], 0.36), (0.068 * TORSO_W[build], 0.06 * TORSO_D[build], 0.07)))

    o = join(parts)
    o.name = 'ch_body_' + build
    # One surface: fuse, then relax every join round.
    rm = o.modifiers.new('fuse', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.003
    apply_all(o)
    sm = o.modifiers.new('relax', 'CORRECTIVE_SMOOTH')
    sm.factor = 0.5
    sm.iterations = 12
    sm.use_only_smooth = True
    sm.smooth_type = 'LENGTH_WEIGHTED'
    apply_all(o)
    sm = o.modifiers.new('round', 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = 4
    apply_all(o)
    # Even quads that follow the form (rings round the limbs), mirrored left to right.
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    o.data.use_mirror_x = True
    target = {'slim': 2300, 'regular': 2400, 'stout': 2500}[build]
    bpy.ops.object.quadriflow_remesh(target_faces=target, use_mesh_symmetry=False, use_preserve_sharp=False, use_preserve_boundary=False, seed=3)
    # Exactly symmetric and welded on x = 0: keep the right half, mirror it.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=0.0005, plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
    for v in bm.verts:
        if abs(v.co.x) < 0.0008:
            v.co.x = 0
    bm.to_mesh(o.data)
    bm.free()
    mi = o.modifiers.new('mirror', 'MIRROR')
    mi.use_clip = True
    mi.use_mirror_merge = True
    mi.merge_threshold = 0.001
    apply_all(o)
    tri = o.modifiers.new('tri', 'TRIANGULATE')
    apply_all(o)
    o.data.materials.clear()
    o.data.materials.append(mat('skin'))
    for p in o.data.polygons:
        p.use_smooth = True
    return o, sx, hx


def measure(o, build):
    """The torso's outline as built (it relaxed a little): its half-width at the side and its front and back, every
    centimetre, so what is worn on it (collars, buttons, straps) sits on the real surface."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    tree = BVHTree.FromBMesh(bm)
    rows = []
    for i in range(0, 56):
        z = 0.30 + i * 0.01
        o0 = Vector((0, 0, z))
        side = tree.ray_cast(o0, Vector((1, 0, 0)))
        front = tree.ray_cast(o0, Vector((0, -1, 0)))
        back = tree.ray_cast(o0, Vector((0, 1, 0)))
        rows.append([round(side[0].x, 4) if side[0] else 0, round(-front[0].y, 4) if front[0] else 0, round(back[0].y, 4) if back[0] else 0])
    bm.free()
    return rows


def export(o, name):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True, use_selection=True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('wrote', path, tris, 'tris')


def main():
    data = {}
    for build in ('slim', 'regular', 'stout'):
        o, sx, hx = build_body(build)
        data[build] = {'shoulderX': sx, 'hipX': round(hx, 4), 'arm': ARM[build], 'leg': LEG[build], 'outline': measure(o, build)}
        export(o, 'ch_body_' + build)
    with open(TS_OUT, 'w') as f:
        f.write('// Generated by art/blender/characters/body_kit.py: do not edit. The sculpted bodies\' bone positions and\n')
        f.write('// the torso\'s measured outline (every centimetre from y 0.30: half-width, front, back), per build.\n')
        f.write('export const BODY_KIT = ' + json.dumps(data, separators=(',', ':')) + ' as const;\n')
    print('wrote', TS_OUT)


main()
