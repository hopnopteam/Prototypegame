"""The people's heads, hair and shoes for the "soft clay toys" overhaul (docs/art/CHARACTER_SPEC.md).

Built headless in Blender and exported as GLB into assets/models/src/char-kit/, then baked into models.bin by
scripts/assets/bake_models.py (paint `CH`) and given Cycles AO by art/blender/bake_prop_ao.py --only.

- ch_head_<style>: the skull with its ears and the hair helmet for one hairdo (short, side, quiff, curly, bob, long,
  bun, bald, and `hat`: hair pressed flat under a hat). The skull is a softly squared ball fullest at the cheeks
  (CHARACTER_SPEC §2); the hair is one shell standing off it with a rounded rim you can see the thickness of (§4),
  solidified and subdivided, never strands. The skull's faces under the hair are dropped (nobody sees them).
- ch_shoe: the chunky clay shoe (§2): a domed upper over a paler, thicker sole, the heel as tall as the toe.

Units are metres, z up, the face toward −y (the exporter turns it y-up, face toward +z, the game's forward). A head's
origin is its centre, which the game places at HEAD_Y; a shoe stands on z = 0 with the ankle over the origin.

Painted in role keys the game recolours per look: skin (pure red), hair (pure yellow), shoe (pure green), sole (pure
blue). Run: python3.11 art/blender/characters/char_kit.py
"""
import math
import os

import bpy
import bmesh  # after bpy: the module registers it

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'assets', 'models', 'src', 'char-kit')
os.makedirs(OUT, exist_ok=True)

# The skull's half-sizes (width, depth, height) and squareness, matching HEAD in world/CharacterParts.ts.
HEAD_A, HEAD_C, HEAD_B, HEAD_N = 0.21, 0.198, 0.2, 2.5


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


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def skull_radius(ux, uy, uz):
    """Distance to the skull along a unit direction (game axes: y up, z forward). Fuller at the cheeks and jaw."""
    a = HEAD_A * (1 + 0.05 * smoothstep(0.3, -0.5, uy))
    k = abs(ux / a) ** HEAD_N + abs(uy / HEAD_B) ** HEAD_N + abs(uz / HEAD_C) ** HEAD_N
    return k ** (-1 / HEAD_N) if k > 0 else 0


def hair_cover(style, ux, uy, uz):
    """How much hair covers the skull in a direction (game axes), 0 bare to 1 covered."""
    side = abs(ux)
    if style == 'bald':
        band = smoothstep(-0.55, -0.4, uy) * (1 - smoothstep(0.1, 0.28, uy))
        return band * (1 - smoothstep(0.05, 0.32, uz))
    if style in ('bob', 'long'):
        face = smoothstep(0.3, 0.62, uz) * (1 - smoothstep(0.62, 0.86, side))
        line = -0.66 + (0.42 + 0.66) * face
        return smoothstep(line - 0.04, line + 0.04, uy)
    # Short hair: to the nape at the back, up and over the ears at the sides (the line rises from the nape to just
    # above the ear's top), down to the fringe over the forehead.
    side_line = 0.24
    line = -0.58 + (side_line + 0.58) * smoothstep(-0.62, -0.18, uz)
    fringe = {'side': 0.46 - 0.22 * smoothstep(-0.3, 0.6, ux), 'bun': 0.36, 'curly': 0.38, 'quiff': 0.42, 'hat': 0.4}.get(style, 0.44 - 0.06 * side)
    line += (fringe - line) * smoothstep(0.18, 0.62, uz)
    if style == 'hat':
        # Under a hat only the sides and back show below the brim: the crown is the hat's.
        return smoothstep(line - 0.04, line + 0.04, uy) * (1 - smoothstep(0.35, 0.5, uy))
    return smoothstep(line - 0.04, line + 0.04, uy)


def hair_lift(style, ux, uy, uz):
    """How far the helmet stands off the skull (a share of its radius): thicker on top, a swept quiff, lumpy curls."""
    top = max(0.0, uy)
    if style == 'bald':
        return 0.11
    if style == 'hat':
        return 0.07
    if style == 'curly':
        return 0.14 + top * 0.1 + 0.05 * math.sin(ux * 11) * math.sin(uy * 9 + 1) * math.sin(uz * 10 + 2)
    if style == 'quiff':
        return 0.09 + top * 0.1 + 0.16 * smoothstep(0.1, 0.7, uz) * smoothstep(0.35, 0.8, uy)
    if style in ('bob', 'long'):
        return 0.1 + top * 0.1 + 0.06 * smoothstep(0.0, -0.6, uy)
    if style == 'side':
        return 0.09 + top * 0.11 + 0.04 * smoothstep(-0.2, 0.6, ux) * smoothstep(0.2, 0.7, uy)
    return 0.08 + top * 0.12


def game_dir(co):
    """Blender (x, y, z) → game unit direction (ux, uy, uz): up is z, forward is −y."""
    x, y, z = co.x, -co.y, co.z
    l = math.sqrt(x * x + y * y + z * z) or 1
    return x / l, z / l, y / l


def deformed_sphere(name, mat_name, segs, rings, radius_fn):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1)
    o = active()
    o.name = name
    for v in o.data.vertices:
        ux, uy, uz = game_dir(v.co)
        r = radius_fn(ux, uy, uz)
        v.co = v.co.normalized() * r
    return smooth(tag(o, mat_name))


def ear(side):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.047, location=(side * HEAD_A * 0.98, 0.012, -0.012))
    o = active()
    o.scale = (0.6, 0.85, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    # The ear's inside: a soft dimple facing forward and out.
    return smooth(tag(o, 'skin'))


def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs):
    for o in objs:
        apply_all(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return active()


def export(o, name):
    o.name = name
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True, use_selection=True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('wrote', path, tris, 'tris')


def hair_shell(style, target=620):
    target = 900 if style == 'curly' else target
    """The helmet: a shell over the covered skull, cut on a fine mesh along the hairline and the cut relaxed (a clean
    curve, never a sawtooth), solidified inward so its rim is a rounded roll, subdivided, then reduced to `target`
    triangles."""
    lift = lambda ux, uy, uz: skull_radius(ux, uy, uz) * (1 + hair_lift(style, ux, uy, uz))
    o = deformed_sphere('hair', 'hair', 96, 64, lift)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    drop = [f for f in bm.faces if hair_cover(style, *game_dir(f.calc_center_median())) < 0.5]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    # Relax the cut: slide each boundary vertex toward its boundary neighbours' middle, then back onto the shell.
    for _ in range(12):
        edge = [v for v in bm.verts if v.is_boundary]
        moved = {}
        for v in edge:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                moved[v] = (nb[0].co + nb[1].co) * 0.5 * 0.6 + v.co * 0.4
        for v, co in moved.items():
            ux, uy, uz = game_dir(co)
            v.co = co.normalized() * lift(ux, uy, uz)
    # Drop slivers the relaxing folded over.
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bm.to_mesh(o.data)
    bm.free()
    dec = o.modifiers.new('dec0', 'DECIMATE')
    dec.ratio = 0.12
    apply_all(o)
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.026
    sol.offset = -1
    sol.use_rim = True
    sol.use_even_offset = True
    sub = o.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    apply_all(o)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    dec = o.modifiers.new('dec', 'DECIMATE')
    dec.ratio = min(1.0, target / max(1, tris))
    apply_all(o)
    return smooth(o)


def extra_hair(style):
    parts = []
    if style == 'bun':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.085, location=(0, 0.15, 0.16))
        parts.append(smooth(tag(active(), 'hair')))
    if style == 'long':
        # One slab down the back to between the shoulder blades, rounded all round (CHARACTER_SPEC §4).
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.13, -0.2))
        o = active()
        o.scale = (0.4, 0.13, 0.3)
        bpy.ops.object.transform_apply(scale=True)
        bev = o.modifiers.new('bev', 'BEVEL')
        bev.width = 0.05
        bev.segments = 2
        apply_all(o)
        parts.append(smooth(tag(o, 'hair')))
    return parts


def head(style):
    clear()
    skull = deformed_sphere('skull', 'skin', 24, 16, skull_radius)
    hair = hair_shell(style)
    # Drop the skull's faces the hair hides completely (well inside the cover, so no gap opens at the hairline).
    bm = bmesh.new()
    bm.from_mesh(skull.data)
    hidden = []
    for f in bm.faces:
        ux, uy, uz = game_dir(f.calc_center_median())
        if hair_cover(style, ux, uy, uz) > 0.97 and style != 'bald':
            hidden.append(f)
    bmesh.ops.delete(bm, geom=hidden, context='FACES')
    bm.to_mesh(skull.data)
    bm.free()
    parts = [skull, hair] + extra_hair(style)
    if style not in ('bob', 'long'):
        parts += [ear(-1), ear(1)]
    o = join(parts)
    export(o, 'ch_head_' + style)


def shoe():
    clear()
    # The sole: a rounded pill the shape of the shoe's footprint, a little proud of the upper all round, its tread flat.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=6, radius=1, location=(0, -0.02, 0.02))
    sole = active()
    sole.scale = (0.061, 0.122, 0.024)
    bpy.ops.object.transform_apply(scale=True)
    for v in sole.data.vertices:
        if v.co.z < 0.006:
            v.co.z = 0.0
    tag(sole, 'sole')
    smooth(sole)
    # The upper: one domed bean over the sole, a touch fuller at the toe, with a soft collar round the ankle.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=1, location=(0, -0.022, 0.044))
    up = active()
    up.scale = (0.056, 0.114, 0.042)
    bpy.ops.object.transform_apply(scale=True)
    for v in up.data.vertices:
        # Fuller toe, lower toe tip, a flat underside sitting into the sole.
        if v.co.y < -0.04:
            v.co.x *= 1.04
        if v.co.z < 0.03:
            v.co.z = 0.03 - (0.03 - v.co.z) * 0.4
    tag(up, 'shoe')
    smooth(up)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=1, location=(0, 0.034, 0.07))
    collar = active()
    collar.scale = (0.046, 0.044, 0.028)
    bpy.ops.object.transform_apply(scale=True)
    tag(collar, 'shoe')
    smooth(collar)
    o = join([sole, up, collar])
    export(o, 'ch_shoe')


def hand(side):
    """A mitten (CHARACTER_SPEC §2): a soft rounded paddle, a plump thumb on its inner front, a short wrist; light
    enough for a crowd (the figure kit's hand was 688 triangles)."""
    clear()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(0, -0.004, -0.052))
    palm = active()
    palm.scale = (0.03, 0.036, 0.047)
    bpy.ops.object.transform_apply(scale=True)
    tag(palm, 'skin')
    smooth(palm)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=1, location=(-0.026 * side, -0.02, -0.04))
    thumb = active()
    thumb.scale = (0.013, 0.016, 0.024)
    thumb.rotation_euler = (math.radians(20), math.radians(-30 * side), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    tag(thumb, 'skin')
    smooth(thumb)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.021, depth=0.03, location=(0, 0, -0.012))
    wrist = active()
    tag(wrist, 'skin')
    smooth(wrist)
    o = join([palm, thumb, wrist])
    export(o, 'ch_hand_' + ('r' if side > 0 else 'l'))


hand(1)
hand(-1)
for s in ('short', 'side', 'quiff', 'curly', 'bob', 'long', 'bun', 'bald', 'hat'):
    head(s)
shoe()
