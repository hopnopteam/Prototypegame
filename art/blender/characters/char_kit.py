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
        # Session 62: up to under the crown all round (the soft hats sit higher than the old cylinders, and skin showed
        # between the hair and the brim at the back).
        return smoothstep(line - 0.04, line + 0.04, uy) * (1 - smoothstep(0.72, 0.86, uy))
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
    target = 900 if style == 'curly' else 980 if style in ('bob', 'long') else target
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
    if style == 'long' and False:
        # Session 62: the slab is its own piece now (`ch_hair_long`, it swings from the head).
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
    """A mitten (CHARACTER_SPEC §2): a soft rounded paddle, a plump thumb on its inner front, a short wrist. Session 63
    (owner: "low res"): the three shapes are fused into one surface (a voxel remesh, then relaxed), so the thumb grows
    out of the palm in a smooth curve instead of two spheres cutting through each other, then reduced for a crowd."""
    clear()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=1, location=(0, -0.004, -0.052))
    palm = active()
    palm.scale = (0.03, 0.035, 0.047)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=(-0.025 * side, -0.019, -0.042))
    thumb = active()
    thumb.scale = (0.0135, 0.0165, 0.025)
    thumb.rotation_euler = (math.radians(20), math.radians(-30 * side), 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.021, depth=0.03, location=(0, 0, -0.012))
    wrist = active()
    o = join([palm, thumb, wrist])
    rm = o.modifiers.new('remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = 0.0018
    sm = o.modifiers.new('relax', 'SMOOTH')
    sm.factor = 0.6
    sm.iterations = 6
    apply_all(o)
    # The wrist's top stays open and flat where the sleeve or the forearm covers it.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    top = [v for v in bm.verts if v.co.z > -0.004]
    bmesh.ops.delete(bm, geom=top, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    d = o.modifiers.new('dec', 'DECIMATE')
    d.ratio = min(1.0, 520 / max(1, tris))
    apply_all(o)
    tag(o, 'skin')
    smooth(o)
    export(o, 'ch_hand_' + ('r' if side > 0 else 'l'))


# ── Hats (session 62, "flat hat crowns": soft felt instead of hard cylinders) ─────────────────────────────────────────
# Each hat is built about the head's centre (its origin, like the heads), resting on the hair helmet pressed flat under
# it (`ch_head_hat`, the crown at about z 0.2). Keys: crown felt green (`shoe`), band blue (`sole`), peak or brim
# yellow (`hair`), badge or pompom magenta (`trim`). Every shape is bevelled and subdivided once, so its edges are
# rolled like felt, never cut.

def soft(o, width=0.012, segments=2, sub=1, target=None):
    bev = o.modifiers.new('bev', 'BEVEL')
    bev.width = width
    bev.segments = segments
    bev.limit_method = 'ANGLE'
    if sub:
        s = o.modifiers.new('sub', 'SUBSURF')
        s.levels = sub
    apply_all(o)
    if target:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris > target:
            d = o.modifiers.new('dec', 'DECIMATE')
            d.ratio = target / tris
            apply_all(o)
    return smooth(o)


def cyl(r0, r1, depth, z, verts=20, y=0.0, name='shoe'):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=depth, location=(0, y, z))
    return tag(active(), name)


def ball(r, z, sx=1.0, sy=1.0, sz=1.0, y=0.0, segs=16, rings=10, name='shoe'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=(0, y, z))
    o = active()
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return smooth(tag(o, name))


def ring(r, tube, z, sy=1.0, y=0.0, name='sole', major=20, minor=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=tube, major_segments=major, minor_segments=minor, location=(0, y, z))
    o = active()
    o.scale = (1, sy, 1)
    bpy.ops.object.transform_apply(scale=True)
    return smooth(tag(o, name))


def peak(r, z, y, tilt, depth=0.02, name='hair', sx=1.0):
    """A cap's peak: a half disc out in front, its edge rolled, dipping over the brow."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=depth, location=(0, 0, 0))
    o = active()
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.001], context='VERTS')
    bmesh.ops.holes_fill(bm, edges=bm.edges)
    bm.to_mesh(o.data)
    bm.free()
    o.scale = (sx, 0.78, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.rotation_euler = (math.radians(tilt), 0, 0)
    o.location = (0, y, z)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    return soft(tag(o, name), width=0.008, segments=2, sub=1, target=180)


def hat_conductor():
    crown = cyl(0.205, 0.232, 0.13, 0.235, y=0.012)
    # The crown's top bows up a touch and its rim rolls: a soft stiffened cap, not a tin.
    for v in crown.data.vertices:
        if v.co.z > 0.26:
            v.co.z += 0.012 * (1 - (v.co.x ** 2 + (v.co.y - 0.012) ** 2) / 0.054)
    crown = soft(crown, width=0.03, segments=3, sub=1, target=420)
    band = soft(cyl(0.214, 0.214, 0.05, 0.188, y=0.012, name='sole'), width=0.01, segments=2, sub=0)
    visor = peak(0.17, 0.158, -0.13, -14, name='hair')
    badge = ball(0.03, 0.218, sy=0.45, y=-0.212, name='trim', segs=10, rings=6)
    export(join([crown, band, visor, badge]), 'ch_hat_conductor')


def hat_bowler():
    crown = ball(0.212, 0.2, sz=0.84, y=0.01, segs=20, rings=12)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.17], context='VERTS')
    bm.to_mesh(crown.data)
    bm.free()
    band = soft(cyl(0.214, 0.21, 0.045, 0.192, y=0.01, name='sole'), width=0.008, segments=2, sub=0)
    brim = ring(0.24, 0.028, 0.172, y=0.01, name='hair', major=24, minor=8)
    # The brim curls up at the sides.
    for v in brim.data.vertices:
        v.co.z += 0.03 * (v.co.x / 0.27) ** 2
    disc = cyl(0.25, 0.25, 0.012, 0.17, verts=24, y=0.01, name='hair')
    for v in disc.data.vertices:
        v.co.z += 0.03 * (v.co.x / 0.27) ** 2
    export(join([crown, band, brim, soft(disc, width=0.004, segments=1, sub=0)]), 'ch_hat_bowler')


def hat_boater():
    crown = soft(cyl(0.2, 0.19, 0.12, 0.25, y=0.01), width=0.018, segments=2, sub=1, target=300)
    band = soft(cyl(0.204, 0.198, 0.05, 0.22, y=0.01, name='sole'), width=0.008, segments=2, sub=0)
    brim = soft(cyl(0.34, 0.34, 0.018, 0.192, verts=28, y=0.01, name='hair'), width=0.008, segments=2, sub=1, target=260)
    export(join([crown, band, brim]), 'ch_hat_boater')


def hat_pillbox():
    box = soft(cyl(0.14, 0.135, 0.11, 0.245, y=0.0), width=0.022, segments=3, sub=1, target=300)
    band = soft(cyl(0.143, 0.143, 0.026, 0.198, y=0.0, name='trim'), width=0.006, segments=2, sub=0)
    export(join([box, band]), 'ch_hat_pillbox')


def hat_beanie():
    crown = ball(0.236, 0.205, sz=0.86, y=0.01, segs=20, rings=12)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.15], context='VERTS')
    bm.to_mesh(crown.data)
    bm.free()
    # Knit ribs: shallow vertical grooves round the crown.
    for v in crown.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.018 * math.cos(a * 16)
        v.co.x *= k
        v.co.y *= k
    cuff = ring(0.236, 0.036, 0.165, y=0.01, name='sole', major=24, minor=8)
    pom = ball(0.058, 0.43, y=0.02, name='trim', segs=12, rings=8)
    export(join([crown, cuff, pom]), 'ch_hat_beanie')


def hat_tophat():
    tube_ = soft(cyl(0.17, 0.185, 0.29, 0.35, y=0.01), width=0.016, segments=2, sub=1, target=320)
    band = soft(cyl(0.186, 0.181, 0.05, 0.235, y=0.01, name='sole'), width=0.008, segments=2, sub=0)
    brim = cyl(0.27, 0.27, 0.018, 0.2, verts=26, y=0.01, name='hair')
    for v in brim.data.vertices:
        v.co.z += 0.032 * (v.co.x / 0.27) ** 2
    export(join([tube_, band, soft(brim, width=0.006, segments=2, sub=0)]), 'ch_hat_tophat')


def hat_toque():
    band = cyl(0.2, 0.205, 0.1, 0.215, verts=24, y=0.01)
    for v in band.data.vertices:
        a = math.atan2(v.co.y - 0.01, v.co.x)
        k = 1 + 0.03 * math.cos(a * 12)
        v.co.x *= k
        v.co.y = 0.01 + (v.co.y - 0.01) * k
    band = soft(band, width=0.01, segments=2, sub=1, target=320)
    puff = ball(0.235, 0.35, sz=0.7, y=0.01, segs=20, rings=12)
    for v in puff.data.vertices:
        a = math.atan2(v.co.y - 0.01, v.co.x)
        v.co.x *= 1 + 0.06 * math.cos(a * 6)
        v.co.y = 0.01 + (v.co.y - 0.01) * (1 + 0.06 * math.cos(a * 6))
    export(join([band, puff]), 'ch_hat_toque')


def hat_cap():
    # A baseball cap: six soft panels (shallow seams), a button on top, the peak forward over the brow.
    crown = ball(0.226, 0.2, sz=0.74, y=0.02, segs=24, rings=12)
    bm = bmesh.new()
    bm.from_mesh(crown.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.16], context='VERTS')
    bm.to_mesh(crown.data)
    bm.free()
    for v in crown.data.vertices:
        a = math.atan2(v.co.y - 0.02, v.co.x)
        k = 1 - 0.012 * max(0.0, math.cos(a * 6)) ** 8
        v.co.x *= k
        v.co.y = 0.02 + (v.co.y - 0.02) * k
    button = ball(0.02, 0.37, y=0.02, segs=10, rings=6, name='trim')
    visor = peak(0.15, 0.175, -0.17, -6, name='hair', sx=1.05)
    export(join([crown, button, visor]), 'ch_hat_cap')


def hair_long():
    """Long hair down the back as its own piece (it swings from the head): a slab rounded all round, tapering to a soft
    curved tip, a little wave across it. Its origin is the head's centre, like the heads."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.15, -0.2))
    o = active()
    o.scale = (0.4, 0.13, 0.42)
    bpy.ops.object.transform_apply(scale=True)
    sub = o.modifiers.new('sub', 'SUBSURF')
    sub.levels = 3
    apply_all(o)
    for v in o.data.vertices:
        t = max(0.0, min(1.0, (-0.0 - v.co.z) / 0.42))
        # Narrower and thinner toward the tip, curving out from the back at the ends, a soft wave across.
        v.co.x *= 1 - 0.18 * t
        v.co.y = 0.15 + (v.co.y - 0.15) * (1 - 0.35 * t) + 0.04 * t * t
        v.co.z += 0.012 * math.sin(v.co.x * 28)
    smooth(tag(o, 'hair'))
    d = o.modifiers.new('dec', 'DECIMATE')
    d.ratio = 320 / max(1, sum(len(p.vertices) - 2 for p in o.data.polygons))
    apply_all(o)
    export(smooth(o), 'ch_hair_long')


def ponytail():
    """A ponytail for the bun's younger cousin: a soft tapered lock from a tie at the back of the crown."""
    tie = ring(0.04, 0.016, 0.0, name='trim', major=12, minor=5)
    tie.rotation_euler = (math.radians(70), 0, 0)
    tie.location = (0, 0.2, 0.07)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    lock = ball(0.06, 0.0, sx=0.9, sy=0.8, sz=2.2, segs=12, rings=10, name='hair')
    for v in lock.data.vertices:
        t = (0.13 - v.co.z) / 0.26
        k = 1 - 0.5 * max(0.0, min(1.0, t))
        v.co.x *= k
        v.co.y *= k
        v.co.y += 0.05 * max(0.0, t) ** 2
    lock.location = (0, 0.25, -0.06)
    bpy.ops.object.transform_apply(location=True)
    export(join([tie, lock]), 'ch_hair_tail')


# ONLY=ch_hat_cap,ch_hair_long builds just those (the rest stay as they are).
ONLY = [n for n in os.environ.get('ONLY', '').split(',') if n]
JOBS = [('ch_hand_r', lambda: hand(1)), ('ch_hand_l', lambda: hand(-1))]
JOBS += [('ch_head_' + s, (lambda s=s: head(s))) for s in ('short', 'side', 'quiff', 'curly', 'bob', 'long', 'bun', 'bald', 'hat')]
JOBS += [('ch_shoe', shoe)]
JOBS += [('ch_' + fn.__name__, fn) for fn in (hat_conductor, hat_bowler, hat_boater, hat_pillbox, hat_beanie, hat_tophat, hat_toque, hat_cap)]
JOBS += [('ch_hair_long', hair_long), ('ch_hair_tail', ponytail)]
for name, fn in JOBS:
    if ONLY and name not in ONLY:
        continue
    clear()
    fn()
