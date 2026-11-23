"""Furniture and dressing for the lobby carriage, all modelled from scratch."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
import lib
from lib import box, cyl, lathe, pbr, principled, emission, apply, cube_uv, add_bevel, subsurf, mesh_obj, join

M = {}
FZ = 1.05


def setup(materials, fz):
    global FZ
    M.update(materials)
    FZ = fz
    M['rug'] = pbr('persian rug', 'gen__rug_diff.jpg', 'gen__rug_nor.jpg', rough=0.9, scale=1.0, sheen=0.5,
                   sheen_tint=(1, 0.8, 0.7), nstrength=0.5)
    M['shade'] = principled('lamp shade', (0.95, 0.86, 0.66), 0.8, Subsurface_Weight=0.0,
                            Transmission_Weight=0.35, Emission_Color=(1.0, 0.62, 0.3), Emission_Strength=0.6)
    M['bulb'] = emission('bulb', (1.0, 0.7, 0.4), 30)
    M['leaf'] = principled('leaf', (0.05, 0.16, 0.03), 0.38, Subsurface_Weight=0.15, Coat_Weight=0.2)
    M['leaf_light'] = principled('leaf light', (0.12, 0.28, 0.05), 0.45)
    M['terracotta'] = lib.noise_rough(principled('terracotta', (0.45, 0.17, 0.08), 0.8), 0.7, 0.9, 12)
    M['soil'] = principled('soil', (0.05, 0.035, 0.025), 0.95)
    M['paper'] = principled('paper', (0.9, 0.86, 0.76), 0.85)
    M['ink'] = principled('book cloth', (0.08, 0.12, 0.08), 0.6)
    M['croissant'] = lib.noise_rough(principled('croissant', (0.55, 0.28, 0.07), 0.4, Coat_Weight=0.5, Subsurface_Weight=0.2), 0.3, 0.55, 30)
    M['china'] = principled('china', (0.95, 0.95, 0.93), 0.1, Coat_Weight=0.8)
    M['coffee'] = principled('coffee', (0.06, 0.025, 0.01), 0.05)
    for n, c in [('teal', (0.12, 0.32, 0.30)), ('tan', (0.48, 0.30, 0.14)), ('cream', (0.68, 0.60, 0.45)),
                 ('grey', (0.35, 0.37, 0.38)), ('ox', (0.30, 0.06, 0.05)), ('olive', (0.25, 0.28, 0.14))]:
        M['case_' + n] = pbr('case ' + n, 'leather_red_02_2k.blend__leather_red_02_coll1_2k.png',
                             'leather_red_02_2k.blend__leather_red_02_nor_gl_2k.exr', rough=0.45, scale=0.6,
                             hsv=(0.5, 0.0, 1.6), tint=tuple(min(1, v * 2.2) for v in c), nstrength=0.5, coat=0.2)
    M['strap'] = principled('strap', (0.10, 0.05, 0.025), 0.5)


# ---------------------------------------------------------------- primitives
def oval_shell(name, rings, mat, segs=64, power=2.6, loc=(0, 0, 0)):
    """rings: list of (rx, ry, z). Superellipse cross-sections joined into a surface."""
    bm = bmesh.new()
    rs = []
    for rx, ry, z in rings:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c, s = math.cos(a), math.sin(a)
            x = rx * math.copysign(abs(c) ** (2 / power), c)
            y = ry * math.copysign(abs(s) ** (2 / power), s)
            ring.append(bm.verts.new((x, y, z)))
        rs.append(ring)
    for a, b in zip(rs, rs[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    ob = mesh_obj(name, bm, mat, smooth=True)
    ob.location = loc
    apply(ob)
    cube_uv(ob)
    return ob


def rbox(name, x0, y0, z0, x1, y1, z1, mat, r=0.01, segs=3):
    return box(name, x0, y0, z0, x1, y1, z1, mat, bevel=r, segs=segs)


def leaf(name, length, width, curl, mat):
    """A single leaf: an outline lofted along a bending midrib, with a fold."""
    bm = bmesh.new()
    n, m = 14, 4
    rows = []
    for i in range(n + 1):
        t = i / n
        w = width * math.sin(math.pi * t) ** 0.8 * (1 - 0.25 * t)
        row = []
        for j in range(-m, m + 1):
            u = j / m
            x = t * length
            y = u * w
            z = -curl * (t ** 2) * length - 0.15 * w * abs(u) ** 1.5
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for a, b in zip(rows, rows[1:]):
        for j in range(2 * m):
            bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    ob = mesh_obj(name, bm, mat, smooth=True)
    s = ob.modifiers.new('solid', 'SOLIDIFY')
    s.thickness = 0.002
    return ob


def plant(name, x, y, z, height=1.0, pot_r=0.18, pot_mat=None, n_leaves=26, seed=1, leafy='broad'):
    rng = random.Random(seed)
    pr = pot_r
    lathe(name + ' pot', [(0, z), (pr * 0.72, z), (pr * 0.78, z + 0.02), (pr * 0.95, z + pr * 1.4), (pr * 1.05, z + pr * 1.5),
                          (pr * 1.05, z + pr * 1.62), (pr * 0.97, z + pr * 1.62), (pr * 0.95, z + pr * 1.5), (0, z + pr * 1.48)],
          pot_mat or M['terracotta'], 40, (x, y, 0))
    top = z + pr * 1.5
    lathe(name + ' soil', [(0, top), (pr * 0.94, top)], M['soil'], 32, (x, y, 0))
    parts = []
    for k in range(n_leaves):
        t = k / n_leaves
        stem_h = height * (0.25 + 0.75 * rng.random() ** 0.7)
        ang = rng.random() * 2 * math.pi
        tilt = math.radians(rng.uniform(25, 70)) * (1.2 - stem_h / height)
        if leafy == 'broad':
            lf = leaf(f'{name} leaf', rng.uniform(0.18, 0.3) * height ** 0.5, rng.uniform(0.07, 0.11) * height ** 0.5, rng.uniform(0.3, 0.8), M['leaf'])
        else:
            lf = leaf(f'{name} leaf', rng.uniform(0.35, 0.55) * height, rng.uniform(0.02, 0.035), rng.uniform(0.6, 1.2), M['leaf_light'])
        lf.rotation_euler = (rng.uniform(-0.3, 0.3), -math.radians(rng.uniform(10, 45)), ang)
        sx = math.sin(tilt) * stem_h * 0.5
        lf.location = (x + math.cos(ang) * sx, y + math.sin(ang) * sx, top + stem_h * math.cos(tilt))
        # stem
        st = cyl(f'{name} stem', 0, 0, 0, stem_h, 0.004, M['leaf'], 6)
        st.rotation_euler = (0, tilt, ang)
        st.location = (x, y, top)
        lib.apply(st)
        parts.append(st)
        bpy.context.view_layer.update()
    return parts


# ---------------------------------------------------------------- the lobby
def reception_desk(x0, x1, y0, y1):
    """Walnut desk with a panelled front, green leather writing top and brass edging."""
    h = 0.98
    z0 = FZ
    rbox('desk body', x0, y0, z0 + 0.08, x1, y1, z0 + h - 0.05, M['walnut'], 0.008)
    rbox('desk plinth', x0 - 0.02, y0 - 0.02, z0, x1 + 0.02, y1 + 0.02, z0 + 0.09, M['walnut'], 0.01)
    rbox('desk top', x0 - 0.05, y0 - 0.05, z0 + h - 0.05, x1 + 0.05, y1 + 0.05, z0 + h, M['walnut'], 0.012)
    rbox('desk leather', x0 + 0.04, y0 + 0.04, z0 + h - 0.002, x1 - 0.04, y1 - 0.04, z0 + h + 0.004, M['leather_green'], 0.003)
    # panelled front (faces -y, toward the platform side and the camera)
    n = 3
    w = (x1 - x0) / n
    for k in range(n):
        a = x0 + k * w + 0.07
        b = x0 + (k + 1) * w - 0.07
        rbox('desk panel', a, y0 - 0.018, z0 + 0.18, b, y0 + 0.01, z0 + h - 0.16, M['walnut'], 0.008)
        for zz in (z0 + 0.17, z0 + h - 0.17):
            box('desk inlay', a - 0.01, y0 - 0.022, zz - 0.006, b + 0.01, y0 - 0.014, zz + 0.006, M['gold'])
    box('desk edge', x0 - 0.055, y0 - 0.058, z0 + h - 0.03, x1 + 0.055, y0 - 0.048, z0 + h - 0.01, M['gold_polish'])
    return z0 + h + 0.004


def desk_dressing(x, y, top):
    # service bell
    lathe('bell base', [(0, top), (0.045, top), (0.045, top + 0.008), (0, top + 0.008)], M['walnut'], 32, (x - 0.35, y, 0))
    lathe('bell', [(0.0, top + 0.07), (0.012, top + 0.069), (0.03, top + 0.058), (0.04, top + 0.035), (0.042, top + 0.009), (0, top + 0.009)],
          M['gold_polish'], 40, (x - 0.35, y, 0))
    lathe('bell knob', [(0, top + 0.09), (0.006, top + 0.088), (0.004, top + 0.07), (0, top + 0.07)], M['gold_polish'], 16, (x - 0.35, y, 0))
    # ledger, open
    for side in (-1, 1):
        b = rbox('ledger cover', x - 0.02 + side * 0.0, y - 0.13, top, x + side * 0.22, y + 0.13, top + 0.006, M['ink'], 0.003)
        p = rbox('ledger pages', x + side * 0.005, y - 0.12, top + 0.006, x + side * 0.21, y + 0.12, top + 0.018 - 0.004 * side, M['paper'], 0.004)
    cyl('pen', y - 0.17, top + 0.02, x - 0.05, x + 0.12, 0.005, M['gold_polish'], 12, axis='X')
    # plate of croissants
    px, py = x + 0.45, y + 0.02
    lathe('plate', [(0, top), (0.08, top), (0.1, top + 0.008), (0.12, top + 0.016), (0.118, top + 0.018), (0.098, top + 0.011), (0, top + 0.009)],
          M['china'], 48, (px, py, 0))
    for k, (dx, dy, rot) in enumerate([(-0.035, -0.02, 0.4), (0.04, 0.025, -0.7), (0.0, 0.045, 1.9)]):
        croissant(f'croissant{k}', px + dx, py + dy, top + 0.012, rot)
    # coffee cup
    cx, cy = x + 0.7, y - 0.05
    lathe('saucer', [(0, top), (0.045, top), (0.06, top + 0.008), (0.058, top + 0.01), (0, top + 0.006)], M['china'], 40, (cx, cy, 0))
    lathe('cup', [(0, top + 0.008), (0.026, top + 0.008), (0.036, top + 0.03), (0.04, top + 0.062), (0.037, top + 0.062), (0.033, top + 0.03), (0.024, top + 0.014), (0, top + 0.014)],
          M['china'], 40, (cx, cy, 0))
    lathe('coffee', [(0, top + 0.052), (0.036, top + 0.052)], M['coffee'], 32, (cx, cy, 0))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.013, minor_radius=0.0035, location=(cx + 0.045, cy, top + 0.04), rotation=(math.pi / 2, 0, 0))
    h = bpy.context.object
    h.data.materials.append(M['china'])
    # brass desk lamp with a green glass shade
    lx, ly = x - 0.7, y + 0.12
    lathe('lamp base', [(0, top), (0.07, top), (0.07, top + 0.012), (0.03, top + 0.03), (0.012, top + 0.04), (0, top + 0.04)], M['gold_polish'], 32, (lx, ly, 0))
    cyl('lamp stem', lx, ly, top + 0.03, top + 0.34, 0.008, M['gold_polish'], 12)
    shade = principled('bankers shade', (0.02, 0.25, 0.08), 0.1, Coat_Weight=1.0, Transmission_Weight=0.2)
    s = lathe('lamp shade', [(0.0, top + 0.36), (0.03, top + 0.36), (0.09, top + 0.31), (0.1, top + 0.3), (0, top + 0.3)], shade, 40, (0, 0, 0))
    s.scale = (1.9, 0.75, 1)
    s.location = (lx, ly, 0)
    lib.apply(s)
    cube_uv(s)
    b = cyl('lamp bulb', lx, ly, top + 0.295, top + 0.31, 0.03, M['bulb'], 16)


def croissant(name, x, y, z, rot):
    """A crescent of lobes along an arc, tapered at the ends."""
    bm = bmesh.new()
    n, segs = 28, 16
    R = 0.045
    rows = []
    for i in range(n + 1):
        t = i / n
        a = math.radians(-70 + 140 * t)
        cx, cy = R * math.sin(a), -R * math.cos(a) + R * 0.6
        r = 0.026 * (math.sin(math.pi * t) ** 0.6) * (1 + 0.18 * math.cos(t * math.pi * 7) ** 2) + 0.004
        ring = []
        for j in range(segs):
            b = 2 * math.pi * j / segs
            dx, dz = math.cos(b) * r, math.sin(b) * r * 0.8
            ring.append(bm.verts.new((cx + dx * math.sin(a), cy - dx * math.cos(a), max(0.0, dz + r * 0.75))))
        rows.append(ring)
    for a_, b_ in zip(rows, rows[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((a_[j], a_[k], b_[k], b_[j]))
    ob = mesh_obj(name, bm, M['croissant'], smooth=True)
    ob.rotation_euler = (0, 0, rot)
    ob.location = (x, y, z)
    lib.apply(ob)
    cube_uv(ob)
    return ob


def rug(x0, x1, y0, y1):
    r = rbox('rug', x0, y0, FZ, x1, y1, FZ + 0.012, M['rug'], 0.004)
    # UVs: the whole rug texture once
    me = r.data
    uvl = me.uv_layers.active
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((v.y - y0) / (y1 - y0), (v.x - x0) / (x1 - x0))
    # fringes on the short ends
    parts = []
    for xe, s in ((x0, -1), (x1, 1)):
        y = y0 + 0.01
        while y < y1 - 0.01:
            f = box('fringe', xe + (0 if s > 0 else -0.05), y, FZ + 0.001, xe + (0.05 if s > 0 else 0), y + 0.004, FZ + 0.004, M['paper'], uv=False)
            parts.append(f)
            y += 0.012
    join('rug fringe', parts)


def suitcase(name, x, y, z, w, d, h, mat, rot=0.0, corners=True):
    parts = [rbox(name, -w / 2, -d / 2, 0, w / 2, d / 2, h, mat, 0.018)]
    # seam band
    parts.append(rbox(name, -w / 2 - 0.003, -d / 2 - 0.003, h * 0.62, w / 2 + 0.003, d / 2 + 0.003, h * 0.66, M['strap'], 0.003))
    # two straps over the top and down the front
    for sx in (-w * 0.28, w * 0.28):
        parts.append(rbox(name, sx - 0.018, -d / 2 - 0.006, 0.02, sx + 0.018, d / 2 + 0.006, h + 0.004, M['strap'], 0.003))
        parts.append(rbox(name, sx - 0.022, -d / 2 - 0.012, h * 0.45, sx + 0.022, -d / 2 - 0.004, h * 0.52, M['gold_polish'], 0.002))
    if corners:
        for cx in (-1, 1):
            for cz in (0, 1):
                parts.append(rbox(name, cx * w / 2 - (0.035 if cx > 0 else -0.035) - 0.004 * cx, -d / 2 - 0.004, cz * h - (0.035 if cz else 0) - 0.003 * (1 if cz else -1),
                                  cx * w / 2 + 0.004 * cx, d / 2 + 0.004, cz * h + (0 if cz else 0.035) + 0.003 * (1 if cz else -1), M['gold_polish'], 0.004))
    # handle on top
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.009, location=(0, 0, h), rotation=(math.pi / 2, 0, 0))
    hd = bpy.context.object
    hd.scale = (1.3, 1, 0.7)
    hd.data.materials.append(M['strap'])
    lib.apply(hd)
    parts.append(hd)
    ob = join(name, parts)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.rotation_euler = (0, 0, rot)
    ob.location = (x, y, z)
    lib.apply(ob)
    return ob


def luggage_rack(x0, x1, y0, y1):
    z = FZ
    h = 0.42
    # oak slatted shelf on brass legs
    for k in range(5):
        yy = y0 + (y1 - y0) * k / 4.0
        rbox('rack slat', x0, yy - 0.025, z + h - 0.03, x1, yy + 0.025, z + h, M['oak'], 0.006)
    for xx in (x0 + 0.05, x1 - 0.05):
        for yy in (y0 + 0.03, y1 - 0.03):
            cyl('rack leg', xx, yy, z, z + h - 0.03, 0.018, M['gold_polish'], 16)
    rbox('rack rail', x0, y0, z + 0.1, x1, y0 + 0.03, z + 0.13, M['oak'], 0.006)
    return z + h


def lobby_luggage(x0, y0, top):
    kinds = ['case_teal', 'case_cream', 'case_tan', 'case_grey', 'case_ox', 'case_olive']
    x = x0 + 0.05
    for k, (w, d, h) in enumerate([(0.55, 0.36, 0.2), (0.48, 0.34, 0.18), (0.6, 0.38, 0.22), (0.5, 0.34, 0.17)]):
        suitcase(f'case{k}', x + w / 2, y0, top, w, d, h, M[kinds[k]], rot=random.uniform(-0.04, 0.04))
        if k % 2 == 0:
            suitcase(f'case{k}b', x + w / 2 + 0.02, y0 + 0.01, top + h, w * 0.86, d * 0.9, h * 0.85, M[kinds[(k + 3) % 6]], rot=random.uniform(-0.08, 0.08))
        x += w + 0.05


def armchair(name, x, y, rot, mat):
    parts = []
    z = FZ
    parts.append(rbox(name, -0.38, -0.36, z + 0.12, 0.38, 0.36, z + 0.42, mat, 0.05, 4))           # seat base
    parts.append(rbox(name, -0.32, -0.3, z + 0.42, 0.32, 0.28, z + 0.5, mat, 0.04, 4))             # cushion
    parts.append(rbox(name, -0.38, 0.22, z + 0.12, 0.38, 0.38, z + 0.88, mat, 0.06, 4))            # back
    for sx in (-1, 1):
        parts.append(rbox(name, sx * 0.38 - (0.12 if sx > 0 else 0), -0.36, z + 0.12, sx * 0.38 + (0 if sx > 0 else 0.12), 0.38, z + 0.64, mat, 0.05, 4))
    for sx in (-0.32, 0.32):
        for sy in (-0.3, 0.3):
            parts.append(cyl(name, sx, sy, z, z + 0.12, 0.022, M['walnut'], 12))
    ob = join(name, parts)
    ob.rotation_euler = (0, 0, rot)
    ob.location = (x, y, 0)
    lib.apply(ob)
    return ob


def lobby(C):
    desk_top = reception_desk(1.5, 3.3, 1.2, 1.75)
    desk_dressing(2.4, 1.47, desk_top)
    rug(2.0, 5.2, -1.55, 0.6)
    top = luggage_rack(0.35, 2.55, -2.38, -1.92)
    lobby_luggage(0.35, -2.15, top)
    armchair('armchair a', 5.6, -1.9, math.radians(200), M['velvet'])
    armchair('armchair b', 4.6, -2.0, math.radians(170), M['velvet'])
    # side table between the chairs
    lathe('side table', [(0, FZ), (0.18, FZ), (0.18, FZ + 0.02), (0.03, FZ + 0.05), (0.025, FZ + 0.5), (0.24, FZ + 0.52), (0.25, FZ + 0.55), (0, FZ + 0.55)],
          M['walnut'], 40, (5.1, -2.15, 0))
    plant('plant lobby', 0.45, 2.0, FZ, 1.1, 0.2, M['gold_polish'], 30, 2)
    plant('plant door', 4.5, -2.15, FZ, 0.9, 0.17, M['terracotta'], 24, 3)
    plant('plant sea', 6.15, 1.95, FZ, 1.2, 0.21, M['gold_polish'], 34, 4)
    # a bench for waiting guests along the sea wall
    sofa('sofa', 4.0, 1.98, 1.6, M['velvet'])


def sofa(name, xc, yc, length, mat):
    parts = []
    z = FZ
    hl = length / 2
    parts.append(rbox(name, -hl, -0.38, z + 0.14, hl, 0.38, z + 0.4, mat, 0.05, 4))
    for k in range(2):
        a = -hl + 0.12 + k * (length - 0.24) / 2
        b = a + (length - 0.24) / 2 - 0.01
        parts.append(rbox(name, a, -0.34, z + 0.4, b, 0.22, z + 0.5, mat, 0.045, 4))
    parts.append(rbox(name, -hl, 0.2, z + 0.14, hl, 0.38, z + 0.84, mat, 0.07, 4))
    for sx in (-1, 1):
        parts.append(rbox(name, sx * hl - (0.14 if sx > 0 else 0), -0.38, z + 0.14, sx * hl + (0 if sx > 0 else 0.14), 0.38, z + 0.66, mat, 0.06, 4))
    for sx in (-hl + 0.08, hl - 0.08):
        for sy in (-0.3, 0.3):
            parts.append(cyl(name, sx, sy, z, z + 0.14, 0.025, M['walnut'], 12))
    ob = join(name, parts)
    ob.location = (xc, yc, 0)
    lib.apply(ob)


# ---------------------------------------------------------------- the suite
def pillow(name, x, y, z, w, d, h, mat, rot=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=6, use_grid_fill=True)
    for v in bm.verts:
        p = v.co
        # pillows bulge in the middle and pinch at the corners
        bulge = (1 - (2 * p.x) ** 2) * (1 - (2 * p.y) ** 2)
        v.co = Vector((p.x * w, p.y * d, p.z * h * (0.25 + 0.95 * bulge)))
    ob = mesh_obj(name, bm, mat, smooth=True)
    subsurf(ob, 2)
    ob.rotation_euler = (0.0, 0.0, rot)
    ob.location = (x, y, z + h * 0.6)
    cube_uv(ob, 0.25)
    return ob


def duvet_cloth(name, x0, x1, y0, y1, ztop, mat, colliders, frames=45, overhang=0.32):
    """A real cloth simulation: a quilt dropped over the mattress and pillows."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=70, y_subdivisions=60, size=1,
                                    location=((x0 + x1) / 2, (y0 + y1) / 2, ztop + 0.06))
    g = bpy.context.object
    g.name = name
    g.scale = ((x1 - x0), (y1 - y0) + 2 * overhang, 1)
    lib.apply(g)
    for c in colliders:
        c.modifiers.new('col', 'COLLISION')
        c.collision.thickness_outer = 0.012
        c.collision.cloth_friction = 8
    cl = g.modifiers.new('cloth', 'CLOTH')
    st = cl.settings
    st.quality = 8
    st.mass = 0.6
    st.tension_stiffness = 25
    st.compression_stiffness = 25
    st.bending_stiffness = 0.6
    st.air_damping = 2
    cl.collision_settings.collision_quality = 4
    cl.collision_settings.distance_min = 0.01
    cl.collision_settings.use_self_collision = False
    S = bpy.context.scene
    S.frame_start, S.frame_end = 1, frames
    cl.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        S.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = g.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    g.modifiers.clear()
    old = g.data
    g.data = me
    bpy.data.meshes.remove(old)
    S.frame_set(1)
    for c in colliders:
        c.modifiers.remove(c.modifiers['col'])
    # soft folds: low-frequency crumple, strongest where the quilt hangs
    tx = bpy.data.textures.new(name + ' folds', 'CLOUDS')
    tx.noise_scale = 0.18
    tx.noise_depth = 2
    dsp = g.modifiers.new('folds', 'DISPLACE')
    dsp.texture = tx
    dsp.strength = 0.03
    dsp.mid_level = 0.5
    sol = g.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.035
    sol.offset = 1
    subsurf(g, 1)
    g.data.materials.append(mat)
    cube_uv(g, 1.0)
    return g


def brass_bed(name, x0, x1, y0, y1, head_at_x1=True):
    """A walnut bed with brass finials, a deep mattress, pillows and a velvet quilt."""
    z = FZ
    w = y1 - y0
    # frame
    rbox(name + ' frame', x0, y0, z + 0.18, x1, y1, z + 0.36, M['walnut'], 0.015)
    hx = x1 if head_at_x1 else x0
    s = -1 if head_at_x1 else 1
    rbox(name + ' headboard', hx + s * 0.07, y0 - 0.02, z + 0.1, hx, y1 + 0.02, z + 1.15, M['walnut'], 0.02)
    # raised panels on the headboard
    for k in range(3):
        a = y0 + 0.08 + k * (w - 0.16) / 3
        b = a + (w - 0.16) / 3 - 0.05
        rbox(name + ' hb panel', hx + s * 0.09, a, z + 0.5, hx + s * 0.06, b, z + 1.0, M['walnut'], 0.01)
    fx = x0 if head_at_x1 else x1
    rbox(name + ' footboard', fx, y0 - 0.02, z + 0.1, fx - s * 0.06, y1 + 0.02, z + 0.62, M['walnut'], 0.02)
    for px, top in ((hx + s * 0.035, z + 1.25), (fx - s * 0.03, z + 0.72)):
        for py in (y0 - 0.02, y1 + 0.02):
            lathe(name + ' post', [(0, z), (0.045, z), (0.045, top - 0.12), (0.038, top - 0.1), (0.05, top - 0.08), (0.038, top - 0.06), (0, top - 0.06)],
                  M['walnut'], 24, (px, py, 0))
            lathe(name + ' finial', [(0, top - 0.07), (0.022, top - 0.065), (0.036, top - 0.035), (0.032, top - 0.015), (0.015, top), (0, top + 0.004)],
                  M['gold_polish'], 24, (px, py, 0))
    # mattress
    mt = rbox(name + ' mattress', x0 + 0.06, y0 + 0.04, z + 0.36, x1 - 0.08, y1 - 0.04, z + 0.6, M['linen'], 0.06, 4)
    pills = []
    px = (x1 - 0.32) if head_at_x1 else (x0 + 0.32)
    for k in range(2):
        py = y0 + w * (0.27 + 0.46 * k)
        pills.append(pillow(name + f' pillow{k}', px, py, z + 0.6, 0.36, w * 0.42, 0.16, M['linen'], 0.0))
    for k in range(2):
        py = y0 + w * (0.27 + 0.46 * k)
        pills.append(pillow(name + f' cushion{k}', px - s * 0.16, py, z + 0.65, 0.22, w * 0.3, 0.12, M['velvet'], 0.1 * (k - 0.5)))
    # quilt over the lower two thirds, simulated
    qx0, qx1 = (x0 + 0.02, x1 - 0.62) if head_at_x1 else (x0 + 0.62, x1 - 0.02)
    duvet_cloth(name + ' quilt', qx0, qx1, y0, y1, z + 0.6, M.setdefault('satin', satin()), [mt] + pills)
    # turned-down white sheet band at the top of the quilt
    sx = qx1 if head_at_x1 else qx0
    rbox(name + ' sheet fold', sx - 0.16, y0 + 0.03, z + 0.6, sx + 0.04, y1 - 0.03, z + 0.645, M['linen'], 0.02, 3)


def clawfoot_tub(name, xc, yc, rot=0.0):
    L, W, H = 1.5, 0.72, 0.58
    z = FZ + 0.12
    outer = [(L * 0.39, W * 0.36, z), (L * 0.44, W * 0.42, z + 0.08), (L * 0.48, W * 0.47, z + 0.3), (L * 0.5, W * 0.5, z + H - 0.04),
             (L * 0.505, W * 0.505, z + H), (L * 0.49, W * 0.485, z + H + 0.025), (L * 0.47, W * 0.46, z + H + 0.02)]
    inner = [(L * 0.47, W * 0.46, z + H + 0.02), (L * 0.46, W * 0.44, z + H - 0.04), (L * 0.42, W * 0.38, z + 0.2), (L * 0.36, W * 0.3, z + 0.08), (0.001, 0.001, z + 0.07)]
    t = oval_shell(name, outer + inner[1:], M['porcelain'], 72, 2.4)
    # water
    # claw feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            fx, fy = sx * L * 0.33, sy * W * 0.3
            lathe(name + ' foot', [(0, FZ), (0.05, FZ), (0.055, FZ + 0.02), (0.035, FZ + 0.05), (0.03, FZ + 0.1), (0.045, z + 0.06), (0, z + 0.07)],
                  M['gold_polish'], 20, (fx, fy, 0))
    # faucet on the end
    fx = -L * 0.47
    cyl(name + ' tap', fx, 0, z + H, z + H + 0.25, 0.014, M['gold_polish'], 16)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.013, location=(fx + 0.07, 0, z + H + 0.25), rotation=(math.pi / 2, 0, 0))
    sp = bpy.context.object
    sp.data.materials.append(M['gold_polish'])
    for sy in (-0.07, 0.07):
        lathe(name + ' handle', [(0, z + H + 0.13), (0.025, z + H + 0.13), (0.025, z + H + 0.145), (0, z + H + 0.15)], M['china'], 16, (fx, sy, 0))
    # put it in place
    obs = [o for o in bpy.data.objects if o.name.startswith(name)]
    for o in obs:
        o.data.transform(Matrix.Translation((xc, yc, 0)) @ Matrix.Rotation(rot, 4, 'Z') @ o.matrix_basis)
        o.matrix_basis = Matrix.Identity(4)


def nightstand(name, x, y, lamp=True):
    z = FZ
    rbox(name, x - 0.22, y - 0.2, z + 0.06, x + 0.22, y + 0.2, z + 0.56, M['walnut'], 0.012)
    rbox(name + ' top', x - 0.24, y - 0.22, z + 0.56, x + 0.24, y + 0.22, z + 0.59, M['walnut'], 0.01)
    rbox(name + ' drawer', x - 0.18, y - 0.215, z + 0.36, x + 0.18, y - 0.2, z + 0.52, M['walnut'], 0.006)
    kb = lathe(name + ' knob', [(0, 0), (0.012, 0), (0.012, 0.01), (0, 0.016)], M['gold_polish'], 12, (0, 0, 0))
    kb.data.transform(Matrix.Translation((x, y - 0.21, z + 0.44)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    for sx in (-0.19, 0.19):
        for sy in (-0.17, 0.17):
            cyl(name + ' leg', x + sx, y + sy, z, z + 0.07, 0.02, M['walnut'], 12)
    if lamp:
        t = z + 0.59
        lathe(name + ' lamp', [(0, t), (0.07, t), (0.07, t + 0.015), (0.025, t + 0.04), (0.05, t + 0.12), (0.045, t + 0.2), (0.012, t + 0.24), (0.01, t + 0.34), (0, t + 0.34)],
              M['gold_polish'], 32, (x, y, 0))
        lathe(name + ' shade', [(0.17, t + 0.28), (0.11, t + 0.48), (0.105, t + 0.48), (0.165, t + 0.28)], M['shade'], 48, (x, y, 0), smooth=True)
        cyl(name + ' bulb', x, y, t + 0.34, t + 0.4, 0.025, M['bulb'], 16)
        bpy.ops.object.light_add(type='POINT', location=(x, y, t + 0.38))
        li = bpy.context.object
        li.data.energy = 12
        li.data.color = (1.0, 0.7, 0.42)
        li.data.shadow_soft_size = 0.05


def suite(x0, x1, y0, y1):
    """Cabin 1: the brass bed against the far wall, the tub by the window, nightstands and lamps."""
    bed_y0, bed_y1 = y0 + 0.55, y0 + 2.05
    brass_bed('suite bed', x1 - 2.1, x1 - 0.06, bed_y0, bed_y1)
    nightstand('suite ns a', x1 - 0.3, bed_y0 - 0.32)
    nightstand('suite ns b', x1 - 0.3, bed_y1 + 0.3)
    clawfoot_tub('tub', x0 + 0.52, y0 + 0.98, math.pi / 2)
    plant('plant suite', x0 + 1.6, y1 - 0.32, FZ, 0.8, 0.15, M['gold_polish'], 20, 9)


def cabin_twin(x0, x1, y0, y1, idx):
    w = 0.95
    brass_bed(f'cabin{idx} bed', x1 - 2.1, x1 - 0.06, y0 + 0.1, y0 + 0.1 + w)
    nightstand(f'cabin{idx} ns', x1 - 0.3, y0 + 0.1 + w + 0.3)
    armchair(f'cabin{idx} chair', x0 + 0.6, y0 + 0.6, math.radians(-30), M['velvet'])
    suitcase(f'cabin{idx} case', x0 + 0.5, y1 - 0.45, FZ, 0.55, 0.36, 0.2, M['case_tan'], 0.3)


# ---------------------------------------------------------------- outside
def satin():
    m = principled('red satin', (0.13, 0.005, 0.01), 0.3, Sheen_Weight=0.35, Sheen_Tint=(1, 0.5, 0.5), Anisotropic=0.6, Coat_Weight=0.0)
    return m


def flower_box(name, x0, x1, y_wall, z, seed=1):
    """A painted window box with geraniums: leaves, then flower heads of tiny petals."""
    rng = random.Random(seed)
    yo = y_wall - 0.2
    rbox(name, x0, yo, z, x1, y_wall - 0.005, z + 0.16, M['cream_paint'], 0.01)
    rbox(name + ' rim', x0 - 0.01, yo - 0.01, z + 0.15, x1 + 0.01, y_wall - 0.005, z + 0.17, M['cream_paint'], 0.006)
    for bx in (x0 + 0.12, x1 - 0.12):
        rbox(name + ' bracket', bx - 0.015, yo + 0.02, z - 0.08, bx + 0.015, y_wall, z, M['gold_polish'], 0.004)
    lib.box(name + ' soil', x0 + 0.01, yo + 0.01, z + 0.12, x1 - 0.01, y_wall - 0.015, z + 0.155, M['soil'])
    parts = []
    n = int((x1 - x0) / 0.035)
    for k in range(n):
        x = x0 + 0.03 + (x1 - x0 - 0.06) * rng.random()
        y = yo + 0.02 + (y_wall - yo - 0.04) * rng.random()
        l = leaf('gl', rng.uniform(0.05, 0.08), rng.uniform(0.035, 0.05), 0.4, M['leaf'])
        l.rotation_euler = (rng.uniform(-0.4, 0.4), -rng.uniform(0.2, 0.9), rng.random() * 6.28)
        l.location = (x, y, z + 0.16 + rng.uniform(0, 0.05))
        lib.apply(l)
        parts.append(l)
    lib.join(name + ' leaves', parts)
    colours = [M['petal_red'], M['petal_pink'], M['petal_white']]
    heads = []
    for k in range(int((x1 - x0) / 0.09)):
        x = x0 + 0.06 + (x1 - x0 - 0.12) * (k + rng.random() * 0.6) / ((x1 - x0) / 0.09)
        y = yo + 0.05 + (y_wall - yo - 0.1) * rng.random()
        zc = z + 0.24 + rng.uniform(-0.02, 0.05)
        mat = colours[rng.randrange(3)]
        for f in range(14):
            a = rng.random() * 6.28
            r = rng.random() ** 0.5 * 0.045
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.011)
            for v in bm.verts:
                v.co.z *= 0.45
            p = mesh_obj('petal', bm, mat, smooth=True)
            p.location = (x + math.cos(a) * r, y + math.sin(a) * r, zc + 0.02 * (1 - r / 0.045) + rng.uniform(-0.005, 0.005))
            p.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0)
            lib.apply(p)
            heads.append(p)
        st = lib.cyl('stalk', x, y, z + 0.15, zc, 0.003, M['leaf'], 6)
        heads.append(st)
    lib.join(name + ' flowers', heads)


def luggage_trolley(x, y, z, rot):
    """A station barrow: oak deck on an iron frame, two big wheels, a handle, cases on board."""
    before = set(bpy.data.objects)
    parts = []
    L, W = 1.5, 0.75
    for k in range(6):
        yy = -W / 2 + W * (k + 0.5) / 6
        parts.append(rbox('trolley slat', -L / 2, yy - 0.05, 0.32, L / 2, yy + 0.05, 0.35, M['oak'], 0.006))
    for yy in (-W / 2 + 0.03, W / 2 - 0.03):
        parts.append(rbox('trolley rail', -L / 2, yy - 0.025, 0.27, L / 2, yy + 0.025, 0.32, M['iron'], 0.005))
    deck = lib.join('trolley', parts)
    for yy in (-W / 2 - 0.05, W / 2 + 0.05):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.025, location=(L * 0.2, yy, 0.22), rotation=(math.pi / 2, 0, 0))
        w = bpy.context.object
        w.data.materials.append(M['iron'])
        lib.apply(w)
        cyl('hub', L * 0.2, 0.22, yy - 0.03, yy + 0.03, 0.05, M['iron'], 16, axis='Y')
        for s in range(8):
            sp = lib.box('spoke', L * 0.2 - 0.008, yy - 0.008, 0.04, L * 0.2 + 0.008, yy + 0.008, 0.4, M['iron'])
            sp.rotation_euler = (0, s * math.pi / 8, 0)
            sp.location = (0, 0, 0)
            mw = Matrix.Translation((L * 0.2, 0, 0.22)) @ Matrix.Rotation(s * math.pi / 8, 4, 'Y') @ Matrix.Translation((-L * 0.2, 0, -0.22))
            sp.data.transform(mw)
            sp.rotation_euler = (0, 0, 0)
    for yy in (-W / 2 + 0.05, W / 2 - 0.05):
        cyl('trolley leg', -L / 2 + 0.08, yy, 0.0, 0.3, 0.02, M['iron'], 10)
    # handle
    h = lib.box('trolley handle', -L / 2 - 0.02, -W / 2 + 0.02, 0.32, -L / 2 + 0.02, -W / 2 + 0.05, 1.0, M['iron'])
    h2 = lib.box('trolley handle', -L / 2 - 0.02, W / 2 - 0.05, 0.32, -L / 2 + 0.02, W / 2 - 0.02, 1.0, M['iron'])
    cyl('trolley grip', -L / 2, 1.0, -W / 2, W / 2, 0.022, M['oak'], 12, axis='Y')
    suitcase('tc1', -0.25, 0, 0.35, 0.6, 0.4, 0.22, M['case_tan'], 0.05)
    suitcase('tc2', 0.35, 0.05, 0.35, 0.55, 0.38, 0.2, M['case_teal'], -0.1)
    suitcase('tc3', -0.2, 0.02, 0.57, 0.5, 0.34, 0.18, M['case_ox'], 0.15)
    lathe('hatbox', [(0, 0), (0.17, 0), (0.175, 0.01), (0.175, 0.2), (0.17, 0.21), (0, 0.21)], M['case_cream'], 40, (0.4, 0.0, 0.55))
    move_new(before, x, y, z, rot)


def street_lamp(x, y, z):
    """Victorian lamp post: fluted iron column, lantern with glass and a finial."""
    lathe('lamp post', [(0, 0), (0.16, 0), (0.16, 0.06), (0.12, 0.1), (0.1, 0.3), (0.07, 0.36), (0.055, 0.5), (0.045, 2.6), (0.06, 2.65), (0.06, 2.7), (0.03, 2.72), (0, 2.72)],
          M['iron'], 32, (x, y, z))
    lathe('lantern', [(0, 2.7), (0.07, 2.7), (0.14, 2.78), (0.15, 2.8), (0.15, 3.12), (0.19, 3.16), (0.18, 3.2), (0.08, 3.32), (0.03, 3.36), (0.04, 3.42), (0, 3.46)],
          M['iron'], 8, (x, y, z), smooth=False)
    lathe('lantern glass', [(0, 2.82), (0.135, 2.82), (0.135, 3.12), (0, 3.12)], M['glass_frost'], 8, (x, y, z), smooth=False)
    cyl('lantern bulb', x, y, z + 2.9, z + 3.0, 0.03, M['bulb'], 12)


def bench(x, y, z, rot):
    parts = []
    for k in range(4):
        parts.append(rbox('bench slat', -0.75, -0.22 + k * 0.11, 0.42, 0.75, -0.14 + k * 0.11, 0.45, M['oak'], 0.008))
    for k in range(3):
        parts.append(rbox('bench back', -0.75, 0.25, 0.55 + k * 0.12, 0.75, 0.28, 0.62 + k * 0.12, M['oak'], 0.008))
    for sx in (-0.65, 0.65):
        parts.append(rbox('bench end', sx - 0.03, -0.25, 0.0, sx + 0.03, 0.3, 0.45, M['iron'], 0.01))
        parts.append(rbox('bench arm', sx - 0.03, -0.2, 0.62, sx + 0.03, 0.3, 0.66, M['iron'], 0.01))
        parts.append(rbox('bench backpost', sx - 0.03, 0.26, 0.45, sx + 0.03, 0.3, 0.92, M['iron'], 0.01))
    b = lib.join('bench', parts)
    b.rotation_euler = (0, 0, rot)
    b.location = (x, y, z)
    lib.apply(b)


def coffee_cart(x, y, z, rot):
    """A painted coffee cart with a striped awning, urns and cups."""
    objs_before = set(bpy.data.objects)
    rbox('cart body', -0.6, -0.35, 0.3, 0.6, 0.35, 1.0, M['cart_blue'], 0.02)
    rbox('cart top', -0.64, -0.39, 1.0, 0.64, 0.39, 1.04, M['oak'], 0.01)
    for k in range(3):
        rbox('cart panel', -0.52 + k * 0.36, -0.362, 0.42, -0.2 + k * 0.36, -0.35, 0.9, M['cream_paint'], 0.006)
    for sx in (-0.45, 0.45):
        for yy in (-0.38, 0.38):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.018, location=(sx, yy, 0.16), rotation=(math.pi / 2, 0, 0))
            bpy.context.object.data.materials.append(M['iron'])
    for sx in (-0.58, 0.58):
        for yy in (-0.36, 0.36):
            cyl('cart pole', sx, yy, 1.04, 1.9, 0.012, M['gold_polish'], 10)
    # striped awning: alternating panels
    for k in range(12):
        a = -0.68 + k * 1.36 / 12
        rbox('awning', a, -0.45, 1.88, a + 1.36 / 12, 0.45, 1.93, M['stripe_white' if k % 2 else 'stripe_blue'], 0.004, 2)
        rbox('awning valance', a, -0.47, 1.78, a + 1.36 / 12, -0.45, 1.9, M['stripe_white' if k % 2 else 'stripe_blue'], 0.003, 2)
    for k, xx in enumerate((-0.4, -0.1)):
        lathe('urn', [(0, 1.04), (0.08, 1.04), (0.09, 1.1), (0.09, 1.3), (0.06, 1.34), (0.02, 1.38), (0, 1.4)], M['gold_polish'], 32, (xx, 0.1, 0))
    for k in range(5):
        lathe('cup', [(0, 1.04), (0.03, 1.04), (0.035, 1.13), (0.032, 1.13), (0, 1.05)], M['china'], 20, (0.2 + (k % 3) * 0.08, -0.15 + (k // 3) * 0.08, 0))
    new = [o for o in bpy.data.objects if o not in objs_before]
    mw = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')
    for o in new:
        o.data.transform(mw @ o.matrix_basis)
        o.matrix_basis = Matrix.Identity(4)


def move_new(before, x, y, z, rot):
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    mw = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')
    for o in new:
        o.data.transform(mw @ o.matrix_basis)
        o.matrix_basis = Matrix.Identity(4)


def outside_materials():
    M['cream_paint'] = lib.noise_rough(principled('cream paint', (0.78, 0.72, 0.6), 0.45, Coat_Weight=0.2), 0.35, 0.55, 6)
    M['petal_red'] = principled('petal red', (0.6, 0.01, 0.02), 0.5, Subsurface_Weight=0.3)
    M['petal_pink'] = principled('petal pink', (0.85, 0.2, 0.35), 0.5, Subsurface_Weight=0.3)
    M['petal_white'] = principled('petal white', (0.85, 0.84, 0.8), 0.5, Subsurface_Weight=0.3)
    M['glass_frost'] = principled('frosted glass', (1.0, 0.93, 0.8), 0.3, Transmission_Weight=0.8, Emission_Color=(1, 0.8, 0.5), Emission_Strength=0.3)
    M['cart_blue'] = lib.noise_rough(principled('cart blue', (0.05, 0.12, 0.25), 0.35, Coat_Weight=0.3), 0.3, 0.45, 5)
    M['stripe_blue'] = principled('stripe blue', (0.04, 0.1, 0.3), 0.75, Sheen_Weight=0.3)
    M['stripe_white'] = principled('stripe white', (0.85, 0.83, 0.78), 0.75, Sheen_Weight=0.3)
