"""Helpers for the photoreal carriage experiment: meshes, materials, placement.

Everything is built in metres, with transforms applied, so a material's
texture scale is in real-world metres (UVs are cube-projected at 1 UV = 1 m).
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

TEX = os.environ.get('TEX', '/tmp/claude-0/tex/img')
COL = None  # active collection


def tex(name):
    return os.path.join(TEX, name)


def link(obj, col=None):
    (col or COL or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, bm, mat=None, smooth=False, col=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    link(ob, col)
    if mat:
        ob.data.materials.append(mat)
    return ob


def box(name, x0, y0, z0, x1, y1, z1, mat=None, bevel=0.0, segs=2, uv=True, col=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    ob = mesh_obj(name, bm, mat, col=col)
    if bevel > 0:
        add_bevel(ob, bevel, segs)
    if uv:
        cube_uv(ob)
    return ob


def add_bevel(ob, width, segs=2):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.harden_normals = False
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(35))
    except Exception:
        pass
    return m


def cube_uv(ob, size=1.0):
    """Cube projection in world metres (1 UV unit = `size` m)."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    mw = ob.matrix_basis
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = mw @ l.vert.co
            if ax == 0:
                u, v = c.y * (1 if n.x > 0 else -1), c.z
            elif ax == 1:
                u, v = c.x * (-1 if n.y > 0 else 1), c.z
            else:
                u, v = c.x, c.y
            l[uvl].uv = (u / size, v / size)
    bm.to_mesh(me)
    bm.free()


def cyl(name, x, y, z0, z1, r, mat=None, verts=32, axis='Z', cap=True, col=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=verts, radius1=r, radius2=r, depth=z1 - z0)
    ob = mesh_obj(name, bm, mat, smooth=True, col=col)
    if axis == 'Z':
        ob.location = (x, y, (z0 + z1) / 2)
    elif axis == 'X':
        ob.rotation_euler = (0, math.pi / 2, 0)
        ob.location = ((z0 + z1) / 2, x, y)
    elif axis == 'Y':
        ob.rotation_euler = (math.pi / 2, 0, 0)
        ob.location = (x, (z0 + z1) / 2, y)
    apply(ob)
    cube_uv(ob)
    return ob


def lathe(name, profile, mat=None, segs=48, loc=(0, 0, 0), col=None, smooth=True):
    """profile: list of (radius, z). Spun round Z."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            try:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, mat, smooth=smooth, col=col)
    ob.location = loc
    apply(ob)
    cube_uv(ob)
    return ob


def apply(ob):
    # matrix_basis is computed from location/rotation/scale at once; matrix_world
    # only after a depsgraph update, so it can be stale here.
    me = ob.data
    me.transform(ob.matrix_basis)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)


def join(name, obs):
    if not obs:
        return None
    base = obs[0]
    with bpy.context.temp_override(active_object=base, selected_editable_objects=obs, object=base):
        bpy.ops.object.join()
    base.name = name
    return base


def subsurf(ob, levels=2):
    m = ob.modifiers.new('sub', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    for p in ob.data.polygons:
        p.use_smooth = True
    return m


# ---------------------------------------------------------------- materials

_imgs = {}


def img(path, non_color=False):
    key = (path, non_color)
    if key in _imgs:
        return _imgs[key]
    im = bpy.data.images.load(tex(path), check_existing=True)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    _imgs[key] = im
    return im


# Every material's recipe, by the material's final name, so the game can rebuild it with the same textures (game_export.py).
SPECS = {}


def principled(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name)
    SPECS[m.name] = dict(kind='flat', color=list(color), rough=rough, metal=metal, **{k: (list(v) if isinstance(v, tuple) else v) for k, v in kw.items()})
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k, v in kw.items():
        name_ = k.replace('_', ' ')
        inp = b.inputs[name_]
        if isinstance(v, tuple) and len(v) == 3:
            v = (*v, 1)
        inp.default_value = v
    return m


def pbr(name, diff=None, nor=None, rough=0.5, rough_map=None, scale=1.0, tint=None,
        hsv=None, nstrength=1.0, metal=0.0, coat=0.0, sheen=0.0, sheen_tint=None,
        color=None, rough_range=None, aspect=1.0, bright=None, contrast=None, ao=None):
    """Texture-based material. `scale` = metres one texture tile covers."""
    m = bpy.data.materials.new(name)
    SPECS[m.name] = dict(kind='pbr', diff=diff, nor=nor, rough=rough, rough_map=rough_map, scale=scale, aspect=aspect, tint=tint and list(tint),
                         hsv=hsv and list(hsv), nstrength=nstrength, metal=metal, coat=coat, sheen=sheen, sheen_tint=sheen_tint and list(sheen_tint),
                         color=color and list(color), rough_range=rough_range and list(rough_range), bright=bright, contrast=contrast, ao=ao)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    mp = N.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale, 1 / (scale * aspect), 1)
    L.new(tc.outputs['UV'], mp.inputs['Vector'])
    out_col = None
    if diff:
        t = N.new('ShaderNodeTexImage')
        t.image = img(diff)
        L.new(mp.outputs['Vector'], t.inputs['Vector'])
        out_col = t.outputs['Color']
        if hsv:
            h = N.new('ShaderNodeHueSaturation')
            h.inputs['Hue'].default_value, h.inputs['Saturation'].default_value, h.inputs['Value'].default_value = hsv
            L.new(out_col, h.inputs['Color'])
            out_col = h.outputs['Color']
        if bright is not None or contrast is not None:
            bc = N.new('ShaderNodeBrightContrast')
            bc.inputs['Bright'].default_value = bright or 0
            bc.inputs['Contrast'].default_value = contrast or 0
            L.new(out_col, bc.inputs['Color'])
            out_col = bc.outputs['Color']
        if tint:
            mx = N.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1
            L.new(out_col, mx.inputs['A'])
            mx.inputs['B'].default_value = (*tint, 1)
            out_col = mx.outputs['Result']
        if ao:
            ta = N.new('ShaderNodeTexImage')
            ta.image = img(ao, True)
            L.new(mp.outputs['Vector'], ta.inputs['Vector'])
            mx = N.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1
            L.new(out_col, mx.inputs['A'])
            L.new(ta.outputs['Color'], mx.inputs['B'])
            out_col = mx.outputs['Result']
        L.new(out_col, b.inputs['Base Color'])
    elif color:
        b.inputs['Base Color'].default_value = (*color, 1)
    if nor:
        t = N.new('ShaderNodeTexImage')
        t.image = img(nor, True)
        L.new(mp.outputs['Vector'], t.inputs['Vector'])
        nm = N.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nstrength
        L.new(t.outputs['Color'], nm.inputs['Color'])
        L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if rough_map:
        t = N.new('ShaderNodeTexImage')
        t.image = img(rough_map, True)
        L.new(mp.outputs['Vector'], t.inputs['Vector'])
        if rough_range:
            mr = N.new('ShaderNodeMapRange')
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = rough_range
            L.new(t.outputs['Color'], mr.inputs['Value'])
            L.new(mr.outputs['Result'], b.inputs['Roughness'])
        else:
            L.new(t.outputs['Color'], b.inputs['Roughness'])
    else:
        b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Sheen Weight'].default_value = sheen
    if sheen_tint:
        b.inputs['Sheen Tint'].default_value = (*sheen_tint, 1)
    return m


def noise_rough(m, lo, hi, scale=8.0):
    """Gentle roughness variation so large surfaces are never perfectly uniform."""
    if m.name in SPECS:
        SPECS[m.name]['rough'] = (lo + hi) / 2
        SPECS[m.name]['rough_noise'] = [lo, hi, scale]
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N['Principled BSDF']
    n = N.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 6
    mr = N.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.3
    mr.inputs['From Max'].default_value = 0.7
    mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = lo, hi
    L.new(n.outputs['Fac'], mr.inputs['Value'])
    L.new(mr.outputs['Result'], b.inputs['Roughness'])
    return m


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    SPECS[m.name] = dict(kind='emit', color=list(color), strength=strength)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m
