"""The people's hands and shoes, modelled in Blender (owner, 26 Nov: "far better character models with better limbs…
I like the design language of our character models but I need better models, use Blender").

The figures keep their soft toy-like design (world/CharacterParts.ts: the rounded head, the lathe torso, the limbs), but
the two places a toy figure reads as cheap at phone size, the hands and the feet, are sculpted here: a mitten hand with
a thumb and a soft palm (right and left), a chunky sneaker (a padded upper over a thick sole, a toe cap, laces and a
heel tab) and a smart shoe (a rounded loafer on a low heel) for the uniforms.

Painted in key colours by role, so the game recolours each part to the look's own colours (CharacterParts `FIG_KEYS`):
skin (pure red), shoe (pure green), sole (pure blue), lace (pure yellow). Real sizes in metres, z-up (the exporter turns
them y-up), the toe toward −y (the figure's forward, +z in the game). A hand hangs from its wrist at the origin, a shoe
stands on z = 0 with the ankle over the origin.

Run (Blender 5.x as the `bpy` module): python3.11 -I art/blender/figure_kit.py
"""
import math
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'figure-kit')
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


def subsurf(o, levels=2):
    m = o.modifiers.new('subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return o


def bevel(o, width=0.004, segments=2):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    return o


def cube(size, loc, name, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.scale = size
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return tag(o, name)


def ball(r, loc, name, scale=(1, 1, 1), segs=(14, 10)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs[0], ring_count=segs[1], radius=r, location=loc)
    o = active()
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return smooth(tag(o, name))


def capsule(r, length, loc, name, rot=(0, 0, 0), segs=12):
    """A rounded rod: a cylinder with ball ends (joined)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=length, location=(0, 0, 0))
    a = active()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=8, radius=r, location=(0, 0, length / 2))
    b = active()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=8, radius=r, location=(0, 0, -length / 2))
    c = active()
    for o in (b, c):
        o.select_set(True)
    a.select_set(True)
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.join()
    a.location = loc
    a.rotation_euler = rot
    bpy.ops.object.transform_apply(location=True, rotation=True)
    return smooth(tag(a, name))


def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return active()


def export(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True)
    print('wrote', path)


# ── A mitten hand (right: its thumb toward −x, the body's middle, and forward) ───────────────────────────────────────
def hand(side):
    clear()
    # A soft mitten: one smooth ellipsoid for the palm and fingers (deeper front to back than it is wide, the fingers'
    # end the roundest part), a plump thumb against its inner front, and a short wrist that tucks into the sleeve.
    palm = ball(0.036, (0, -0.004, -0.052), 'skin', scale=(0.82, 1.0, 1.3), segs=(14, 10))
    thumb = ball(0.016, (-0.026 * side, -0.02, -0.04), 'skin', scale=(0.8, 1.0, 1.55), segs=(10, 7))
    thumb.rotation_euler = (math.radians(20), math.radians(-30 * side), 0)
    bpy.ops.object.select_all(action='DESELECT')
    thumb.select_set(True)
    bpy.context.view_layer.objects.active = thumb
    bpy.ops.object.transform_apply(rotation=True)
    wrist = capsule(0.021, 0.014, (0, 0, -0.006), 'skin', segs=10)
    o = join([palm, thumb, wrist])
    o.name = 'fig_hand_' + ('r' if side > 0 else 'l')
    export(o.name)


hand(1)
hand(-1)


# ── A chunky sneaker ─────────────────────────────────────────────────────────────────────────────────────────────────
def sneaker():
    clear()
    # The sole: a thick rounded slab (smooth all round), its toe springing up a touch.
    sole = cube((0.104, 0.2, 0.032), (0, -0.012, 0.016), 'sole')
    subsurf(sole, 2)
    # The upper: one plump ellipsoid over the sole, rounder at the toe, with a padded collar round the ankle.
    upper = ball(0.05, (0, -0.012, 0.052), 'shoe', scale=(0.98, 1.85, 0.82), segs=(16, 10))
    toe = ball(0.046, (0, -0.07, 0.04), 'sole', scale=(1.05, 0.85, 0.58), segs=(14, 8))
    collar = ball(0.042, (0, 0.035, 0.086), 'shoe', scale=(1.05, 1.0, 0.45), segs=(14, 7))
    tab = ball(0.016, (0, 0.078, 0.1), 'lace', scale=(1.0, 0.5, 1.4), segs=(10, 6))
    # Laces: three soft bars across the tongue.
    laces = [ball(0.024, (0, -0.032 + i * 0.022, 0.093 - i * 0.004), 'lace', scale=(1.0, 0.28, 0.22), segs=(10, 6)) for i in range(3)]
    o = join([sole, upper, toe, collar, tab] + laces)
    o.name = 'fig_sneaker'
    export(o.name)


sneaker()


# ── A smart shoe (uniforms, coats, gowns): a rounded, polished shoe on a low heel ─────────────────────────────────────
def smart():
    clear()
    sole = cube((0.09, 0.19, 0.016), (0, -0.01, 0.008), 'sole')
    subsurf(sole, 2)
    heel = cube((0.072, 0.045, 0.024), (0, 0.066, 0.012), 'sole')
    subsurf(heel, 1)
    upper = ball(0.046, (0, -0.014, 0.042), 'shoe', scale=(0.96, 1.9, 0.72), segs=(16, 10))
    collar = ball(0.038, (0, 0.032, 0.066), 'shoe', scale=(1.0, 1.0, 0.45), segs=(14, 7))
    # A lace-up front: a slim darker panel.
    strap = ball(0.022, (0, -0.03, 0.074), 'lace', scale=(1.0, 1.1, 0.25), segs=(10, 6))
    o = join([sole, heel, upper, collar, strap])
    o.name = 'fig_smart'
    export(o.name)


smart()
