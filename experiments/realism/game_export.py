"""The photoreal carriage for real-time rendering (v2): real materials, a live sun, baked bounce light and occlusion.

Run:  TEX=<textures> python game_export.py <layout.json> <outdir>

Writes, beside the page in `real/`:
  scene.glb.wasm   carriage, its glass, small dressing and the surroundings; materials are placeholders by name,
                   TEXCOORD_0 in metres (tiling textures), TEXCOORD_1 the carriage's bake UVs
  materials.json   every material's recipe (colour, roughness, metal, coat, sheen, textures and their tiling)
  tex/*.jpg        each material's textures, its colour already graded as in Blender (hue, tint, contrast)
  bounce.jpg       light that is not the sun's direct light: the sky (with occlusion) and every bounce, sun's included
  ao.jpg           ambient occlusion on the carriage
  sky.jpg          the sky (no sun disc) as a panorama, for reflections
  lighting.json    the sun's direction and strength, the bounce map's scale, the sky's scale
"""
import bpy, bmesh, json, math, os, sys, time
from mathutils import Vector, Matrix, noise
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = sys.argv[2]
os.makedirs(os.path.join(DEST, 'tex'), exist_ok=True)
QUICK = os.environ.get('QUICK') == '1'
sys.argv = [sys.argv[0], sys.argv[1], DEST, 'none']
exec(compile(open(os.path.join(HERE, 'game_lobby.py')).read(), 'game_lobby', 'exec'))
for _n in ('bake platform', 'bake ground'):
    if _n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[_n])

SUN_ELEV = math.radians(48)
SUN_ROT = math.radians(float(os.environ.get('SUN_ROT', 300)))
SUN_STRENGTH = float(os.environ.get('SUN_STRENGTH', 4.0))
SKY_STRENGTH = float(os.environ.get('SKY_STRENGTH', 0.08))
# toward the sun, scene frame (measured: the sky's sun sits at (sin r, cos r) round the zenith)
TO_SUN = Vector((math.sin(SUN_ROT) * math.cos(SUN_ELEV), math.cos(SUN_ROT) * math.cos(SUN_ELEV), math.sin(SUN_ELEV)))


# ------------------------------------------------------------------ the world round the carriage
ENV = bpy.data.collections.new('env')
bpy.context.scene.collection.children.link(ENV)


def env_obj(o):
    for c in o.users_collection:
        c.objects.unlink(o)
    ENV.objects.link(o)
    return o


def surroundings():
    lib.COL = ENV
    X0, X1 = -14.0, 34.0
    G = FZ - 0.9             # the ground beside the track (the game's carriage rides low over its rails)
    # track bed: ballast, sleepers, rails (static: the train stands at the platform)
    box('ballast', X0, -HW - 0.2, G - 0.3, X1, HW + 0.9, G + 0.08, M['ballast'])
    sl = []
    x = X0
    while x < X1:
        sl.append(box('sleeper', x, -1.3, G + 0.04, x + 0.24, 1.3, G + 0.16, M['sleeper'], bevel=0.015))
        x += 0.62
    lib.join('sleepers', sl)
    for y in (-0.7175, 0.7175):
        box('rail', X0, y - 0.034, G + 0.16, X1, y + 0.034, G + 0.3, M['steel'], bevel=0.008)
    for bx in (2.7, L - 2.7):
        for dx in (-0.9, 0.9):
            for y in (-0.7175, 0.7175):
                cyl('wheel', bx + dx, G + 0.3 + 0.23, y - 0.06, y + 0.06, 0.23, M['iron'], 40, axis='Y')
    # the platform: stone flags level with the carriage floor, a kerb and the yellow line
    PX = HW + 0.25
    box('platform', X0, -PX - 8.5, G - 0.3, X1, -PX - 0.3, FZ - 0.006, M['paving'])
    box('kerb', X0, -PX - 0.3, G - 0.3, X1, -PX, FZ, M['kerb'], bevel=0.02)
    box('safety line', X0, -PX - 0.82, FZ - 0.004, X1, -PX - 0.7, FZ + 0.0015, M['yellow'])
    # the sea side: a grass bank rising from the ballast, then sand, boulders and the sea
    bm = bmesh.new()
    nx, ny = 120, 36
    y0, y1 = HW + 0.9, HW + 7.5
    rows = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = X0 + (X1 - X0) * i / nx
            y = y0 + (y1 - y0) * j / ny
            t = (y - y0) / (y1 - y0)
            z = G + 0.05 + 0.55 * math.sin(min(1, t * 1.6) * math.pi / 2) - 0.9 * max(0, t - 0.72) / 0.28
            z += 0.1 * noise.noise(Vector((x * 0.25, y * 0.25, 0)))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    g = lib.mesh_obj('grass bank', bm, M['grass'], smooth=True)
    lib.cube_uv(g)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=96, y_segments=24, size=1)
    for v in bm.verts:
        x = X0 + (v.co.x + 1) * (X1 - X0) / 2
        y = HW + 6.4 + (v.co.y + 1) * 4.5
        t = (y - HW - 6.4) / 9
        v.co = Vector((x, y, G - 0.35 - 0.7 * t + 0.05 * noise.noise(Vector((x * 0.4, y * 0.4, 1)))))
    s = lib.mesh_obj('beach', bm, M['sand_tex'], smooth=True)
    lib.cube_uv(s)
    import random as _r
    rng = _r.Random(3)
    for k in range(22):
        x = X0 + 3 + k * 2.1 + rng.uniform(-0.6, 0.6)
        y = HW + 8.2 + rng.uniform(-0.6, 1.4)
        boulder(f'boulder{k}', x, y, rng.uniform(0.25, 0.7), rng)
        o = bpy.data.objects[f'boulder{k}']
        o.data.transform(Matrix.Translation((0, 0, G - 0.2 + 0.1)))
        env_obj(o)
    # a lamp post and a bench on the bank, as in the references
    before = set(bpy.data.objects)
    props.street_lamp(X(4.0), HW + 2.6, G + 0.42)
    props.bench(X(1.0), HW + 3.0, G + 0.44, math.radians(180))
    for o in set(bpy.data.objects) - before:
        env_obj(o)
    lib.COL = EXPORT


def sand_textured():
    return pbr('sand', 'clean_pebbles_2k__clean_pebbles_diff_2k.jpg', 'clean_pebbles_2k__clean_pebbles_nor_gl_2k.exr', rough=0.9,
               scale=1.6, hsv=(0.52, 0.45, 1.9), tint=(1.0, 0.9, 0.74), nstrength=0.6)


M['sand_tex'] = sand_textured()
M['paving'] = pbr('platform paving', 'PavingStones110_2K-JPG__PavingStones110_2K_Color.jpg', 'PavingStones110_2K-JPG__PavingStones110_2K_NormalGL.jpg',
                  rough=0.8, scale=2.4, aspect=0.5, hsv=(0.52, 0.3, 1.9), tint=(1.0, 0.93, 0.80), nstrength=1.0)
surroundings()

# ------------------------------------------------------------------ light: the sky without its sun, and a sun lamp
nt = S.world.node_tree
sky = next(n for n in nt.nodes if n.type == 'TEX_SKY')
sky.sun_disc = False
nt.nodes['Background'].inputs['Strength'].default_value = SKY_STRENGTH
sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = SUN_STRENGTH
sun_data.angle = math.radians(3.0)
sun_data.color = (1.0, 0.95, 0.88)
sun = bpy.data.objects.new('sun', sun_data)
bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = (-TO_SUN).to_track_quat('-Z', 'Y').to_euler()


# ------------------------------------------------------------------ flatten
def flatten(coll, name, glass_name=None):
    dg = bpy.context.evaluated_depsgraph_get()
    parts, glass = [], []
    for o in list(coll.all_objects):
        if o.type != 'MESH' or o.hide_render:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        n = bpy.data.objects.new(o.name + ' flat', me)
        bpy.context.scene.collection.objects.link(n)
        is_glass = any(m and (m.name.startswith('glass') or m.name.startswith('frosted')) for m in me.materials)
        (glass if is_glass and glass_name else parts).append(n)
    for o in list(coll.all_objects):
        bpy.data.objects.remove(o)
    out = []
    for nm, group in ((name, parts), (glass_name, glass)):
        if not group:
            continue
        with bpy.context.temp_override(active_object=group[0], selected_editable_objects=group, object=group[0]):
            bpy.ops.object.join()
        group[0].name = nm
        out.append(group[0])
    return out


def split_dressing(car):
    """Petals, leaves and the like leave the carriage mesh (they need no bake UVs: lit live)."""
    names = {i for i, m in enumerate(car.data.materials) if m and any(k in m.name for k in ('petal', 'leaf', 'soil', 'stem'))}
    bpy.context.view_layer.objects.active = car
    for o in bpy.context.view_layer.objects:
        o.select_set(o == car)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in car.data.polygons:
        p.select = p.material_index in names
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    d = next(o for o in bpy.context.selected_objects if o != car)
    d.name = 'dressing'
    return d


t0 = time.time()
carriage_parts = flatten(EXPORT, 'carriage', 'glass')
car = carriage_parts[0]
dressing = split_dressing(car)
env_parts = flatten(ENV, 'env')
print('FLAT carriage', len(car.data.polygons), 'dressing', len(dressing.data.polygons), 'env', sum(len(o.data.polygons) for o in env_parts), round(time.time() - t0), 's')

BAKE = 1024 if QUICK else int(os.environ.get('BAKE_SIZE', 2048))
SAMPLES = 8 if QUICK else int(os.environ.get('BAKE_SAMPLES', 96))
lightmap_uv(car, BAKE)
diffuse_only_names = set()


def bake_into(ob, size, samples, kind, passes, name):
    im = bpy.data.images.new(name, size, size, float_buffer=True)
    for i, m in enumerate(ob.data.materials):
        if m is None or not m.node_tree:
            ob.data.materials[i] = principled('plain', (0.5, 0.5, 0.5), 0.6)
    for m in ob.data.materials:
        n = m.node_tree.nodes.get('bake target') or m.node_tree.nodes.new('ShaderNodeTexImage')
        n.name = 'bake target'
        n.image = im
        m.node_tree.nodes.active = n
    S.render.engine = 'CYCLES'
    S.cycles.samples = samples
    S.cycles.use_denoising = False
    S.cycles.max_bounces = 6
    S.cycles.sample_clamp_indirect = 4
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    t = time.time()
    if kind == 'AO':
        S.world.light_settings.distance = 0.8
        bpy.ops.object.bake(type='AO', margin=8, use_clear=True)
    else:
        bpy.ops.object.bake(type='DIFFUSE', pass_filter=passes, margin=8, use_clear=True)
    print('BAKED', name, size, samples, round(time.time() - t), 's')
    return pixels(im)


# Bakes see the diffuse lobe only (metal and glass would read as black); the live materials keep their gloss.
# Work on a copy of the materials so the export keeps the real recipes by name.
saved = {}
for m in car.data.materials:
    b = m and m.node_tree and next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b:
        saved[m.name] = (b.inputs['Metallic'].default_value, b.inputs['Transmission Weight'].default_value)
diffuse_only(car)
# 1. the sky's light (occluded by the carriage itself) and its bounces
sun.hide_render = True
sky_light = bake_into(car, BAKE, SAMPLES, 'DIFFUSE', {'DIRECT', 'INDIRECT'}, 'sky light')
# 2. the sun's bounces only (its direct light is drawn live, with live shadows)
sun.hide_render = False
nt.nodes['Background'].inputs['Strength'].default_value = 0.0
sun_bounce = bake_into(car, BAKE, SAMPLES, 'DIFFUSE', {'INDIRECT'}, 'sun bounce')
nt.nodes['Background'].inputs['Strength'].default_value = SKY_STRENGTH
bounce = denoise_lightmap(sky_light + sun_bounce)
lum = bounce.mean(axis=2)
bounce_scale = float(np.percentile(lum[lum > 0.0005], 99.8)) * 1.1
save_srgb(bounce, os.path.join(DEST, 'bounce.jpg'), bounce_scale, quality=94)
# 3. ambient occlusion (for the sky's reflections)
ao = bake_into(car, BAKE, max(16, SAMPLES // 2), 'AO', None, 'ao')
save_srgb(denoise_lightmap(ao), os.path.join(DEST, 'ao.jpg'), 1.0, quality=92)


# ------------------------------------------------------------------ the sky panorama (no sun), for reflections
def sky_panorama():
    for o in bpy.context.view_layer.objects:
        o.hide_render = o.type != 'CAMERA'
    cam = bpy.data.cameras.new('pano')
    cam.type = 'PANO'
    cam.panorama_type = 'EQUIRECTANGULAR'
    co = bpy.data.objects.new('pano', cam)
    bpy.context.scene.collection.objects.link(co)
    co.rotation_euler = (math.pi / 2, 0, 0)
    S.camera = co
    S.render.engine = 'CYCLES'
    S.render.resolution_x, S.render.resolution_y, S.render.resolution_percentage = 1024, 512, 100
    S.cycles.samples = 16
    S.render.image_settings.file_format = 'OPEN_EXR'
    S.render.filepath = os.path.join(DEST, 'sky.exr')
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(os.path.join(DEST, 'sky.exr'))
    a = pixels(im)
    scale = float(np.percentile(a.mean(axis=2), 99.5)) * 1.2
    save_srgb(a, os.path.join(DEST, 'sky.jpg'), scale, quality=92)
    os.remove(os.path.join(DEST, 'sky.exr'))
    for o in bpy.context.view_layer.objects:
        o.hide_render = False
    return scale


sky_scale = sky_panorama()


# ------------------------------------------------------------------ materials
def load_rgb(name, non_color):
    """An image as float RGB: colour images linearised, data images (normals, roughness) as stored."""
    path = lib.tex(name)
    if path.lower().endswith('.exr'):
        im = bpy.data.images.load(path, check_existing=True)
        w, h = im.size
        a = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(a)
        return a.reshape(h, w, 4)[::-1, :, :3].copy()
    from PIL import Image
    a = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255
    if not non_color:
        a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return a


def rgb_to_hsv(c):
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    i = m & (mx == r)
    h[i] = ((g - b)[i] / d[i]) % 6
    i = m & (mx == g) & ~(mx == r)
    h[i] = (b - r)[i] / d[i] + 2
    i = m & (mx == b) & ~(mx == r) & ~(mx == g)
    h[i] = (r - g)[i] / d[i] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return np.stack([h / 6, s, mx], -1)


def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0] * 6, hsv[..., 1], hsv[..., 2]
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.choose(i[..., None].repeat(3, -1), [np.stack(c, -1) for c in ((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))])
    return out


def write(a, path, srgb, size=1024, quality=90):
    from PIL import Image
    a = np.clip(a, 0, 1)
    if srgb:
        a = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    im = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    if im.width > size:
        im = im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)
    im.save(path, quality=quality)


def export_material(m, big):
    spec = dict(lib.SPECS.get(m.name, {'kind': 'flat', 'color': [0.5, 0.5, 0.5], 'rough': 0.6}))
    if m.name in saved:
        pass
    safe = ''.join(ch if ch.isalnum() else '_' for ch in m.name)
    size = 2048 if big else 1024
    if spec.get('kind') == 'pbr':
        if spec.get('diff'):
            c = load_rgb(spec['diff'], False)
            if spec.get('hsv'):
                hsv = rgb_to_hsv(c)
                hh, ss, vv = spec['hsv']
                hsv[..., 0] = (hsv[..., 0] + hh - 0.5) % 1.0
                hsv[..., 1] = np.clip(hsv[..., 1] * ss, 0, 1)
                hsv[..., 2] = hsv[..., 2] * vv
                c = hsv_to_rgb(hsv)
            if spec.get('bright') is not None or spec.get('contrast') is not None:
                a_, b_ = 1 + (spec.get('contrast') or 0), (spec.get('bright') or 0) - (spec.get('contrast') or 0) * 0.5
                c = c * a_ + b_
            if spec.get('tint'):
                c = c * np.array(spec['tint'], np.float32)
            if spec.get('ao'):
                c = c * load_rgb(spec['ao'], True)
            write(c, os.path.join(DEST, 'tex', f'{safe}_c.jpg'), True, size)
            spec['map'] = f'tex/{safe}_c.jpg'
        if spec.get('nor'):
            n = load_rgb(spec['nor'], True)
            write(n, os.path.join(DEST, 'tex', f'{safe}_n.jpg'), False, size, 95)
            spec['normalMap'] = f'tex/{safe}_n.jpg'
        if spec.get('rough_map'):
            r = load_rgb(spec['rough_map'], True)
            if spec.get('rough_range'):
                lo, hi = spec['rough_range']
                r = lo + r * (hi - lo)
            write(r, os.path.join(DEST, 'tex', f'{safe}_r.jpg'), False, size)
            spec['roughnessMap'] = f'tex/{safe}_r.jpg'
    return spec


BIG = ('oak floor', 'crimson paint', 'cream panel', 'red carpet', 'platform paving', 'lawn', 'persian rug')
mats = {}
for ob in [car, dressing] + carriage_parts[1:] + env_parts:
    for m in ob.data.materials:
        if m and m.name not in mats:
            mats[m.name] = export_material(m, any(m.name.startswith(b) for b in BIG))
json.dump(mats, open(os.path.join(DEST, 'materials.json'), 'w'), indent=1)
print('MATERIALS', len(mats))


# ------------------------------------------------------------------ export, in the game's carriage frame
car.data.uv_layers['UVMap'].active_render = True
objs = [car, dressing] + carriage_parts[1:] + env_parts
for o in bpy.context.view_layer.objects:
    o.select_set(o in objs)
for o in objs:
    o.data.transform(Matrix.Translation((0, -L, 0)) @ Matrix.Rotation(math.radians(90), 4, 'Z'))
bpy.ops.export_scene.gltf(filepath=os.path.join(DEST, 'scene.glb'), use_selection=True, export_format='GLB', export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='NONE', export_yup=True,
                          export_vertex_color='NONE')
os.replace(os.path.join(DEST, 'scene.glb'), os.path.join(DEST, 'scene.glb.wasm'))
# game frame: x = -Y, y = Z, z = L - X
to_sun_game = [-TO_SUN.y, TO_SUN.z, -TO_SUN.x]
json.dump({'sun': {'direction': to_sun_game, 'strength': SUN_STRENGTH, 'color': list(sun_data.color)},
           'bounceScale': bounce_scale, 'skyScale': sky_scale, 'bake': BAKE, 'samples': SAMPLES},
          open(os.path.join(DEST, 'lighting.json'), 'w'), indent=1)
print('EXPORTED', round(time.time() - t0), 's')
