"""The lobby carriage for the game: the photoreal build on the game's own floor plan, baked and exported to glTF.

Run:  TEX=<textures> python experiments/realism/game_lobby.py <layout.json> <outdir> [preview|bake]

Built in the scene's own frame (X along the carriage from the rear, Y across with +Y the lake side, Z up, floor
top at the game's FLOOR_Y), then turned into the game's carriage frame on export: game x = -Y, game z = 18 - X,
game y = Z (glTF's Y-up export does the axis change).
"""
import bpy, bmesh, json, math, os, sys, time
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
LAYOUT = json.load(open(sys.argv[1]))
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/work/game'
STEP = sys.argv[3] if len(sys.argv) > 3 else 'preview'
os.makedirs(OUTDIR, exist_ok=True)

# Reuse the scene's materials, sky and carriage helpers (its module-level build is skipped).
src = open(os.path.join(HERE, 'scene.py')).read()
head = src[:src.index('\nground()\nseaside()')]
helpers = src[src.index('# --------------------------------------------------------------- the carriage'):src.index('\ncarriage()\n')]
sys.argv = [sys.argv[0], 'none']
exec(compile(head, 'scene_head', 'exec'))

import lib
import props
props.LOW = os.environ.get('LOD', 'low') == 'low'

# the game's carriage proportions
L = LAYOUT['CARRIAGE_LENGTH']
HW = LAYOUT['HALF_WIDTH']
WT = LAYOUT['WALL']
FZ = 0.55                    # CarriageView.FLOOR_Y
WH = LAYOUT['EXTERIOR_WALL_HEIGHT']
WZ = FZ + WH
exec(compile(helpers, 'scene_carriage', 'exec'))
SKIRT = FZ - 0.42
WIN_Z0, WIN_Z1 = FZ + LAYOUT['windowBand'][0], FZ + LAYOUT['windowBand'][1]
WIN_W = 0.72

EXPORT = bpy.data.collections.new('export')
bpy.context.scene.collection.children.link(EXPORT)
lib.COL = EXPORT
lc = bpy.context.view_layer.layer_collection.children['export']
bpy.context.view_layer.active_layer_collection = lc


def X(z):            # game z -> scene X
    return L - z


def Y(x):            # game x -> scene Y
    return -x


def grect(r):
    """game rect -> (X0, X1, Y0, Y1) in the scene frame"""
    return X(r['z1']), X(r['z0']), Y(r['x1']), Y(r['x0'])


# ------------------------------------------------------------------ shell
def shell():
    box('underframe', 0.4, -2.0, SKIRT + 0.02, L - 0.4, 2.0, FZ - 0.1, M['rust'])
    box('floor slab', 0, -HW, FZ - 0.12, L, HW, FZ - 0.016, M['rust'])
    lobby_end = 8.6
    # floors: reception and the rear vestibule in oak, the corridor carpeted, cabins in oak
    box('reception floor', X(lobby_end), -HW + WT, FZ - 0.02, X(0.16), HW - WT, FZ, M['floor'])
    box('vestibule floor', X(17.84), -HW + WT, FZ - 0.02, X(16.5), HW - WT, FZ, M['floor'])
    box('cabin floor', X(16.5), -HW + WT, FZ - 0.02, X(lobby_end), Y(-0.6), FZ, M['floor'])
    cx0, cx1 = X(16.5), X(lobby_end)
    box('corridor carpet', cx0, Y(-0.74), FZ - 0.02, cx1, HW - WT, FZ + 0.004, M['carpet'])
    for yb in (Y(-0.74) + 0.07, HW - WT - 0.06):
        box('carpet border', cx0, yb - 0.012, FZ + 0.004, cx1, yb + 0.012, FZ + 0.0055, M['gold_thread'], uv=False)
    # outer walls
    sea_windows = [1.4, 2.9, 4.4, 5.9, 7.4, 8.9, 10.5, 12.0, 15.0, 16.5]
    cab = [c['room'] for c in LAYOUT['cabins']]
    plat_windows = [10.6, 12.5]
    for r in cab:
        a, b = X(r['z1']), X(r['z0'])
        plat_windows += [a + (b - a) * 0.3, a + (b - a) * 0.72]
    door = (X(LAYOUT['DOOR_Z1']), X(LAYOUT['DOOR_Z0']))
    outer_wall('sea wall', HW - WT, HW, sea_windows)
    outer_wall('platform wall', -HW + WT, -HW, plat_windows, gaps=[door])
    # front end: full height, panelled inside; rear end: a sill either side of the gangway
    box('front end', L - WT, -HW, SKIRT, L, HW, WZ, M['paint'], bevel=0.012)
    cap_y('front cap', -HW, HW, L - WT / 2)
    for i, (y0, y1) in enumerate([(-HW + WT, -0.7), (0.7, HW - WT)]):
        frame_y(f'front wainscot {i}', y0 + 0.15, y1 - 0.15, FZ + 0.14, WZ - 0.14, L - WT, -1, w=0.016)
    for y0, y1 in [(-HW, -0.7), (0.7, HW)]:
        box('rear sill', 0, y0, SKIRT, WT, y1, FZ + LAYOUT['CUTAWAY_WALL_HEIGHT'], M['paint'], bevel=0.012)
        cyl('rear cap', WT / 2, FZ + LAYOUT['CUTAWAY_WALL_HEIGHT'] + 0.012, y0, y1, 0.034, M['gold'], 24, axis='Y')
    box('gangway plate', -0.25, -0.7, FZ - 0.03, WT, 0.7, FZ - 0.005, M['iron'], bevel=0.006)
    # interior walls straight from the game's plan
    for i, w in enumerate(LAYOUT['walls']):
        if w['kind'] != 'interior':
            continue
        x0, x1, y0, y1 = grect(w)
        if (x1 - x0) >= (y1 - y0):      # runs along the carriage: the corridor partition
            partition_x(f'corridor wall {i}', (y0 + y1) / 2, x0, x1)
        else:
            partition_y(f'cabin wall {i}', (x0 + x1) / 2, y0, y1)
    # jambs at every cabin doorway
    for c in LAYOUT['cabins']:
        for z in c['door']:
            box('jamb', X(z) - 0.03, Y(-0.6) - 0.02, FZ, X(z) + 0.03, Y(-0.74) + 0.02, WZ, M['walnut'], bevel=0.008)


# ------------------------------------------------------------------ the reception
def sideboard(name, x0, x1, y0, y1, h=0.92):
    rbox = props.rbox
    rbox(name, x0, y0, FZ + 0.06, x1, y1, FZ + h - 0.04, M['walnut'], 0.01)
    rbox(name + ' top', x0 - 0.02, y0 - 0.02, FZ + h - 0.04, x1 + 0.02, y1 + 0.02, FZ + h, M['walnut'], 0.01)
    # doors face -X (into the reception)
    n = max(1, round((y1 - y0) / 0.45))
    for k in range(n):
        a = y0 + (y1 - y0) * k / n + 0.04
        b = y0 + (y1 - y0) * (k + 1) / n - 0.04
        rbox(name + ' door', x0 - 0.015, a, FZ + 0.14, x0 + 0.005, b, FZ + h - 0.12, M['walnut'], 0.006)
        props.lathe(name + ' knob', [(0, 0), (0.012, 0), (0.012, 0.012), (0, 0.016)], M['gold_polish'], 12, (0, 0, 0)).data.transform(
            Matrix.Translation((x0 - 0.016, (a + b) / 2 + (0.12 if k % 2 == 0 else -0.12), FZ + h * 0.55)) @ Matrix.Rotation(-math.pi / 2, 4, 'Y'))
    for yy in (y0 + 0.04, y1 - 0.04):
        for xx in (x0 + 0.04, x1 - 0.04):
            cyl(name + ' foot', xx, yy, FZ, FZ + 0.07, 0.022, M['walnut'], 12)
    return FZ + h


def tea_counter(r):
    x0, x1, y0, y1 = r
    top = sideboard('tea counter', x0 + 0.02, x1 - 0.02, y0 + 0.03, y1 - 0.02)
    cx = (x0 + x1) / 2
    # brass tea urn with a tap
    props.lathe('tea urn', [(0, top), (0.09, top), (0.09, top + 0.03), (0.06, top + 0.05), (0.11, top + 0.1), (0.12, top + 0.3), (0.1, top + 0.36),
                            (0.05, top + 0.39), (0.06, top + 0.42), (0.02, top + 0.45), (0, top + 0.46)], M['gold_polish'], 40, (cx, y1 - 0.25, 0))
    cyl('urn tap', y1 - 0.25, top + 0.13, cx - 0.2, cx - 0.1, 0.012, M['gold_polish'], 12, axis='X')
    # china cups on saucers, a sugar bowl and the morning papers
    for k in range(4):
        y = y0 + 0.15 + k * 0.13
        props.lathe('saucer', [(0, top), (0.045, top), (0.06, top + 0.008), (0, top + 0.006)], M['china'], 32, (cx - 0.05, y, 0))
        props.lathe('cup', [(0, top + 0.008), (0.026, top + 0.008), (0.036, top + 0.03), (0.04, top + 0.06), (0.036, top + 0.06), (0.032, top + 0.03), (0, top + 0.014)],
                    M['china'], 32, (cx - 0.05, y, 0))
    for k in range(5):
        props.rbox('newspaper', cx - 0.2, y1 - 0.7 + k * 0.004, top + k * 0.006, cx + 0.1, y1 - 0.38 + k * 0.006, top + (k + 1) * 0.006, M['paper'], 0.002)


def linen_cupboard(r):
    x0, x1, y0, y1 = r
    h = 1.02
    props.rbox('linen cupboard', x0 + 0.02, y0 + 0.02, FZ, x1 - 0.01, y1 - 0.02, FZ + h, M['walnut'], 0.012)
    # open shelves facing -X with folded towels and sheets
    props.rbox('cupboard recess', x0 + 0.005, y0 + 0.08, FZ + 0.08, x0 + 0.05, y1 - 0.08, FZ + h - 0.08, M['paint_dark'], 0.004)
    towel_cols = [M['linen'], M['towel_rose'], M['linen'], M['towel_sage']]
    for s, zs in enumerate((FZ + 0.1, FZ + 0.42, FZ + 0.72)):
        props.rbox('shelf', x0 - 0.0, y0 + 0.08, zs - 0.02, x0 + 0.06, y1 - 0.08, zs, M['walnut'], 0.004)
        y = y0 + 0.12
        k = 0
        while y < y1 - 0.4:
            for j in range(4):
                props.rbox('folded towel', x0 - 0.02, y, zs + j * 0.055, x0 + 0.26, y + 0.3, zs + (j + 1) * 0.055 - 0.004, towel_cols[(k + j + s) % 4], 0.02, 3)
            y += 0.36
            k += 1


def bureau(r):
    x0, x1, y0, y1 = r
    top = sideboard('bureau', x0, x1, y0, y1, 0.8)
    props.lathe('vase', [(0, top), (0.04, top), (0.06, top + 0.08), (0.03, top + 0.2), (0.035, top + 0.22), (0, top + 0.22)], M['china'], 32, ((x0 + x1) / 2, (y0 + y1) / 2 - 0.1, 0))
    for k in range(9):
        props.leaf('vase leaf', 0.12, 0.04, 0.6, M['leaf']).matrix_basis = (
            Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2 - 0.1, top + 0.2)) @ Matrix.Rotation(k * 0.7, 4, 'Z') @ Matrix.Rotation(-0.7, 4, 'Y'))
    for k, c in enumerate((M['petal_red'], M['petal_pink'], M['petal_white'])):
        b = bmesh.new()
        bmesh.ops.create_icosphere(b, subdivisions=2, radius=0.035)
        o = lib.mesh_obj('bloom', b, c, smooth=True)
        o.location = ((x0 + x1) / 2 + (k - 1) * 0.04, (y0 + y1) / 2 - 0.1 + (k % 2) * 0.04, top + 0.27 + k * 0.02)
        lib.apply(o)


def waste_basket(r):
    x0, x1, y0, y1 = r
    props.lathe('waste basket', [(0, FZ), (0.13, FZ), (0.16, FZ + 0.32), (0.155, FZ + 0.32), (0.125, FZ + 0.01), (0, FZ + 0.01)],
                M['gold'], 40, ((x0 + x1) / 2, (y0 + y1) / 2, 0))


def reception():
    P = {p['kind']: p for p in LAYOUT['props']}
    x0, x1, y0, y1 = grect(P['desk']['rect'])
    top = props.reception_desk(x0, x1, y0, y1)
    props.desk_dressing((x0 + x1) / 2, (y0 + y1) / 2, top)
    tea_counter(grect(P['urn']['rect']))
    linen_cupboard(grect(P['linen']['rect']))
    bureau(grect(P['bureau']['rect']))
    waste_basket(grect(P['bin']['rect']))
    pr = grect(P['plant']['rect'])
    props.plant('plant front', (pr[0] + pr[1]) / 2, (pr[2] + pr[3]) / 2, FZ, 1.0, 0.17, M['gold_polish'], 28, 2)
    rx0, rx1, ry0, ry1 = grect(P['rack']['rect'])
    rtop = props.luggage_rack(rx0, rx1, ry0, ry1)
    props.lobby_luggage(rx0, (ry0 + ry1) / 2, rtop)
    # the waiting rug in front of the desk, where the queue stands
    props.rug(X(5.55), X(2.35), Y(0.85), Y(-0.55))


def cabins():
    for c in LAYOUT['cabins']:
        bx0, bx1, by0, by1 = grect(c['bed'])
        props.brass_bed(f"berth {c['index']}", bx0, bx1, by0 + 0.02, by1 - 0.02, head_at_x1=True)
        props.nightstand(f"berth {c['index']} ns", bx1 - 0.24, by1 + 0.26)
        rx0, rx1, ry0, ry1 = grect(c['room'])
        props.rbox(f"berth {c['index']} rug", rx0 + 0.35, by1 + 0.55, FZ, bx1 - 0.3, ry1 - 0.35, FZ + 0.01, M['rug'], 0.003)
        props.suitcase(f"berth {c['index']} case", rx0 + 0.45, by1 + 0.3, FZ, 0.5, 0.34, 0.19, M[['case_tan', 'case_teal', 'case_ox'][c['index'] % 3]], 0.2)


def outside():
    for xc in [10.6, 12.5] + [X(c['room']['z1']) + (X(c['room']['z0']) - X(c['room']['z1'])) * f for c in LAYOUT['cabins'] for f in (0.3, 0.72)]:
        props.flower_box(f'flowers {xc:.1f}', xc - 0.42, xc + 0.42, -HW - 0.01, WIN_Z0 - 0.19, seed=int(xc * 10))


# ------------------------------------------------------------------ build
props.setup(M, FZ)
props.outside_materials()
M.update(props.M)
M['towel_rose'] = principled('rose towel', (0.75, 0.42, 0.42), 0.85, Sheen_Weight=0.5)
M['towel_sage'] = principled('sage towel', (0.45, 0.55, 0.42), 0.85, Sheen_Weight=0.5)
shell()
reception()
cabins()
outside()

# surroundings for the bake only (light and occlusion, not exported)
lib.COL = bpy.context.scene.collection
bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
box('bake platform', -30, -12, -0.4, 50, -HW - 0.2, FZ - 0.13, M['paving'])
box('bake ground', -30, -HW - 0.2, -0.6, 50, 14, -0.05, M['grass'])
print('BUILT', len(EXPORT.objects), 'objects')

if STEP == 'preview':
    exec(compile(src[src.index('SHOTS = {'):src.index("\nif __name__ == '__main__' or True:")], 'scene_cam', 'exec'))
    SHOTS['game_lobby'] = ((13.5, -0.6, 0.9), 40, 50, 9.5, 35)
    SHOTS['game_cabins'] = ((6.0, -0.5, 0.9), 40, 50, 9.5, 35)
    for shot in os.environ.get('SHOTS', 'game_lobby').split(','):
        camera(shot)
        render_settings()
        S.render.filepath = os.path.join(OUTDIR, f'{shot}.png')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('RENDERED', S.render.filepath, round(time.time() - t, 1))

# ------------------------------------------------------------------ bake and export
DRESSING = ('petal', 'leaf', 'soil', 'underframe', 'black iron', 'rail steel')


def flatten_export():
    """Every export object becomes one mesh with modifiers applied; glass stays apart (it is not baked)."""
    dg = bpy.context.evaluated_depsgraph_get()
    solid, glass, dressing = [], [], []
    for o in list(EXPORT.all_objects):
        if o.type != 'MESH' or o.hide_render:
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        n = bpy.data.objects.new(o.name + ' flat', me)
        bpy.context.scene.collection.objects.link(n)
        if any(m and m.name.startswith('glass') for m in me.materials):
            glass.append(n)
        elif any(m and any(k in m.name for k in DRESSING) for m in me.materials) or any(k in o.name for k in ('flowers', 'leaves', 'leaf', 'bloom', 'stem', 'stalk', 'petal')):
            dressing.append(n)
        else:
            solid.append(n)
    stats = {}
    for n in solid + glass + dressing:
        k = n.name.split(' flat')[0].rstrip('.0123456789').strip()
        stats[k] = stats.get(k, 0) + len(n.data.polygons)
    print('TOP', sorted(stats.items(), key=lambda kv: -kv[1])[:25])
    for o in list(EXPORT.all_objects):
        bpy.data.objects.remove(o)
    out = []
    for name, group in (('carriage', solid), ('carriage glass', glass), ('carriage dressing', dressing)):
        if not group:
            continue
        with bpy.context.temp_override(active_object=group[0], selected_editable_objects=group, object=group[0]):
            bpy.ops.object.join()
        group[0].name = name
        out.append(group[0])
    return out


def lightmap_uv(ob, size):
    me = ob.data
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[1])
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    lm = me.uv_layers.new(name='Bake')
    me.uv_layers.active = lm
    me.uv_layers['UVMap'].active_render = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=3.0 / size)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_pass(ob, size, samples, passes, name):
    """One bake into a new float image through each material's (active) image node, on the Bake UVs."""
    im = bpy.data.images.new(name, size, size, float_buffer=True)
    for i, m in enumerate(ob.data.materials):
        if m is None or not m.node_tree:
            ob.data.materials[i] = principled('plain', (0.5, 0.5, 0.5), 0.6)
    for m in ob.data.materials:
        if not m or not m.node_tree:
            continue
        n = m.node_tree.nodes.get('bake target') or m.node_tree.nodes.new('ShaderNodeTexImage')
        n.name = 'bake target'
        n.image = im
        m.node_tree.nodes.active = n
        n.select = True
    S.render.engine = 'CYCLES'
    S.cycles.samples = samples
    S.cycles.use_denoising = False
    S.cycles.max_bounces = 6
    S.cycles.sample_clamp_indirect = 4
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=passes, margin=8, use_clear=True)
    print('BAKED', name, size, samples, round(time.time() - t), 's')
    return im


def bake_vertex_colors(ob, samples):
    """Small dressing (flowers, leaves): its lit colour baked per vertex, no texture space needed."""
    me = ob.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new('baked', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    S.cycles.samples = samples
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'}, target='VERTEX_COLORS', use_clear=True)
    print('BAKED dressing vertices', len(me.vertices))


def diffuse_only(ob):
    """Bakes read the diffuse lobe: metals bake as their colour, glossy coats are left to the game's reflections."""
    for m in ob.data.materials:
        b = m and m.node_tree and next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b:
            continue
        for l in list(b.inputs['Metallic'].links):
            m.node_tree.links.remove(l)
        b.inputs['Metallic'].default_value = 0.0
        b.inputs['Transmission Weight'].default_value = 0.0


def pixels(im):
    import numpy as np
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1, :, :3].copy()


def save_srgb(a, path, scale=1.0, quality=92):
    import numpy as np
    from PIL import Image
    v = np.clip(a / scale, 0, 1)
    srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    Image.fromarray((srgb * 255 + np.random.uniform(-0.5, 0.5, srgb.shape)).clip(0, 255).astype(np.uint8)).save(path, quality=quality)


def denoise_lightmap(a):
    import numpy as np, pyoidn
    d = pyoidn.Device()
    d.commit()
    f = pyoidn.Filter(d, 'RTLightmap')
    h, w, _ = a.shape
    src = np.ascontiguousarray(a, np.float32)
    out = np.zeros_like(src)
    f.set_image(pyoidn.OIDN_IMAGE_COLOR, src, pyoidn.OIDN_FORMAT_FLOAT3, w, h)
    f.set_image(pyoidn.OIDN_IMAGE_OUTPUT, out, pyoidn.OIDN_FORMAT_FLOAT3, w, h)
    f.commit()
    f.execute()
    return out


def export(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    # into the game's carriage frame: game x = -Y, game z = 18 - X, up stays up
    for o in objs:
        o.data.transform(Matrix.Translation((0, -L, 0)) @ Matrix.Rotation(math.radians(90), 4, 'Z'))
        o.data.transform(Matrix.Scale(1, 4))
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='NONE', export_yup=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False)


if STEP == 'bake':
    import numpy as np
    ALB = int(os.environ.get('ALBEDO_SIZE', 4096))
    LM = int(os.environ.get('LIGHT_SIZE', 2048))
    SAMPLES = int(os.environ.get('BAKE_SAMPLES', 96))
    objs = flatten_export()
    car = objs[0]
    print('FACES', len(car.data.polygons), 'MATS', len(car.data.materials))
    lightmap_uv(car, ALB)
    diffuse_only(car)
    # 1. the surfaces' own colour, sharp: no light transport, one sample
    alb = bake_pass(car, ALB, 1, {'COLOR'}, 'albedo')
    save_srgb(pixels(alb), os.path.join(OUTDIR, 'lobby_albedo.jpg'), quality=90)
    # 2. the light falling on them (sun, sky, bounces, lamp glow), soft, denoised
    # light only (no colour): the game multiplies it by the albedo
    lit = bake_pass(car, LM, SAMPLES, {'DIRECT', 'INDIRECT'}, 'light')
    a = pixels(lit)
    a = denoise_lightmap(a)
    lum = a.mean(axis=2)
    scale = float(np.percentile(lum[lum > 0.002], 99.8)) * 1.1
    save_srgb(a, os.path.join(OUTDIR, 'lobby_light.jpg'), scale, quality=94)
    dress = next((o for o in objs if o.name == 'carriage dressing'), None)
    if dress:
        diffuse_only(dress)
        bake_vertex_colors(dress, max(16, SAMPLES // 2))
        for l in list(dress.data.uv_layers):
            dress.data.uv_layers.remove(l)
    me = car.data
    me.uv_layers.remove(me.uv_layers['UVMap'])
    export(objs, os.path.join(OUTDIR, 'lobby.glb'))
    json.dump({'lightScale': scale, 'albedo': ALB, 'light': LM, 'samples': SAMPLES}, open(os.path.join(OUTDIR, 'lobby_bake.json'), 'w'))
    print('EXPORTED lightScale', scale)
