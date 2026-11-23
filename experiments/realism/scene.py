"""Night Express photoreal experiment: the initial (lobby) carriage at a seaside platform.

Run:  TEX=<textures> python experiments/realism/scene.py [preview|final] [shot]
(Blender as a Python module, `pip install bpy`.)
"""
import bpy, bmesh, math, os, random, sys, time
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(__file__))
import lib
from lib import box, cyl, lathe, pbr, principled, emission, apply, cube_uv, add_bevel, subsurf, mesh_obj, link

random.seed(7)
MODE = sys.argv[1] if len(sys.argv) > 1 else 'preview'
SHOT = sys.argv[2] if len(sys.argv) > 2 else 'hero'
OUT = os.environ.get('OUT', '/tmp/claude-0/work/renders')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene

# --------------------------------------------------------------- dimensions
L = 18.0           # carriage length (x)
HW = 2.5           # half width (y); +y is the sea side, -y the platform
FZ = 1.05          # floor top above rail
WH = 1.2           # wall height above floor
WT = 0.09          # wall thickness
WZ = FZ + WH
PZ = 0.92          # platform top
PEDGE = -2.68      # platform edge (y)
CORR = 0.72        # corridor partition centre (y); corridor between it and the sea wall
LOBBY = 6.6        # lobby length from the rear (x)

# ---------------------------------------------------------------- materials
M = {}
M['paint'] = noise_r = lib.noise_rough(principled('crimson paint', (0.16, 0.011, 0.015), 0.3, Coat_Weight=0.35, Coat_Roughness=0.15), 0.22, 0.38, 3)
M['paint_dark'] = principled('dark crimson', (0.14, 0.012, 0.016), 0.35, Coat_Weight=0.3)
M['cream'] = pbr('cream panel', 'yur__white_plaster_02_diff_1k.jpg', 'yur__white_plaster_02_nor_gl_1k.jpg', rough=0.6, scale=1.6,
                 tint=(1.0, 0.93, 0.80), nstrength=0.25)
M['gold'] = pbr('brass', 'BrushedGold01_packed_2K__BrushedGold01_2K_BaseColor.png', 'BrushedGold01_packed_2K__BrushedGold01_2K_Normal.png',
                rough=0.28, metal=1.0, scale=0.6, tint=(1.0, 0.80, 0.50), nstrength=0.3)
M['gold_polish'] = principled('polished brass', (1.0, 0.72, 0.36), 0.16, 1.0)
M['floor'] = pbr('oak floor', 'WoodFloor051_2K-JPG__WoodFloor051_2K_Color.jpg', 'WoodFloor051_2K-JPG__WoodFloor051_2K_NormalGL.jpg',
                 rough=0.32, scale=3.4, tint=(1.0, 0.74, 0.52), nstrength=0.6, coat=0.25)
M['walnut'] = pbr('walnut', 'wood_table_001_2k.blend__wood_table_001_diff_2k.jpg', 'wood_table_001_2k.blend__wood_table_001_nor_gl_2k.exr',
                  rough=0.3, scale=1.2, tint=(1.15, 0.95, 0.85), coat=0.4)
M['oak'] = pbr('oak', 'american_walnut_1-2K__walnut_basecolor.png', 'american_walnut_1-2K__walnut_normal.png', rough=0.38, scale=1.0,
               tint=(1.0, 0.72, 0.48), coat=0.3, nstrength=0.4)
M['leather_green'] = pbr('green leather', 'fabric_leather_02_2k.blend__fabric_leather_02_diff_2k.jpg', 'fabric_leather_02_2k.blend__fabric_leather_02_nor_gl_2k.exr',
                         rough_map='fabric_leather_02_2k.blend__fabric_leather_02_rough_2k.jpg', scale=0.8, hsv=(0.78, 0.7, 0.55), nstrength=0.6)
M['carpet'] = pbr('red carpet', 'gen__carpet_diff.jpg', 'yur__velour_velvet_nor_gl_1k.jpg', rough=0.9, scale=0.55,
                  sheen=0.5, sheen_tint=(1.0, 0.6, 0.5), nstrength=0.5)
M['velvet'] = pbr('red velvet', 'yur__velour_velvet_diff_1k.jpg', 'yur__velour_velvet_nor_gl_1k.jpg', rough=0.55, scale=0.5,
                  hsv=(0.5, 1.2, 0.55), tint=(0.75, 0.1, 0.11), sheen=0.5, sheen_tint=(1.0, 0.45, 0.45), nstrength=0.4)
M['linen'] = pbr('white linen', 'yur__terry_cloth_diff_1k.jpg', 'yur__terry_cloth_nor_gl_1k.jpg', rough=0.75, scale=0.25,
                 hsv=(0.5, 0.0, 1.3), tint=(0.95, 0.94, 0.92), sheen=0.4, nstrength=0.25)
M['porcelain'] = principled('porcelain', (0.92, 0.92, 0.9), 0.12, Coat_Weight=0.6, Coat_Roughness=0.05)
M['glass'] = principled('glass', (0.92, 0.96, 1.0), 0.02, Transmission_Weight=1.0, IOR=1.5)
M['iron'] = principled('black iron', (0.03, 0.03, 0.03), 0.45, 0.8)
M['steel'] = principled('rail steel', (0.45, 0.43, 0.42), 0.35, 1.0)
M['rust'] = principled('underframe', (0.07, 0.06, 0.055), 0.7, 0.3)
M['paving'] = pbr('platform paving', 'PavingStones110_2K-JPG__PavingStones110_2K_Color.jpg', 'PavingStones110_2K-JPG__PavingStones110_2K_NormalGL.jpg',
                  rough=0.75, scale=3.2, aspect=0.5, hsv=(0.5, 0.25, 1.75), tint=(1.0, 0.93, 0.80), nstrength=1.0)
M['kerb'] = pbr('kerb stone', 'rock_boulder_dry_2k__rock_boulder_dry_diff_2k.jpg', 'rock_boulder_dry_2k__rock_boulder_dry_nor_gl_2k.exr', rough=0.8,
                scale=1.5, hsv=(0.5, 0.2, 1.25), nstrength=0.5)
M['yellow'] = lib.noise_rough(principled('safety line', (0.85, 0.55, 0.05), 0.5), 0.4, 0.7, 20)
M['ballast'] = pbr('ballast', 'clean_pebbles_2k__clean_pebbles_diff_2k.jpg', 'clean_pebbles_2k__clean_pebbles_nor_gl_2k.exr', rough=0.85,
                   scale=1.2, hsv=(0.5, 0.6, 0.75), nstrength=1.2)
M['sleeper'] = pbr('sleeper wood', 'blue_painted_planks_2k.blend__blue_painted_planks_diff_2k.jpg', None, rough=0.8, scale=2.0, hsv=(0.5, 0.0, 0.5),
                   tint=(0.55, 0.45, 0.35))
M['grass'] = pbr('lawn', 'Grass01_MR_2K__Grass01_2K_BaseColor.png', 'Grass01_MR_2K__Grass01_2K_Normal.png', rough_map='Grass01_MR_2K__Grass01_2K_Roughness.png',
                 scale=2.0, hsv=(0.5, 1.25, 1.15))
M['gold_thread'] = principled('gold thread', (0.55, 0.38, 0.12), 0.6, Sheen_Weight=0.5)
M['rock'] = pbr('boulder', 'rock_boulder_dry_2k__rock_boulder_dry_diff_2k.jpg', 'rock_boulder_dry_2k__rock_boulder_dry_nor_gl_2k.exr',
                rough=0.85, scale=1.4, hsv=(0.5, 0.35, 1.0), nstrength=1.0)


def sand_material():
    m = bpy.data.materials.new('sand')
    m.use_nodes = True
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    b = N['Principled BSDF']
    n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 3; n.inputs['Detail'].default_value = 8
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.62, 0.53, 0.40, 1)
    ramp.color_ramp.elements[1].color = (0.80, 0.72, 0.58, 1)
    Lk.new(n.outputs['Fac'], ramp.inputs['Fac'])
    Lk.new(ramp.outputs['Color'], b.inputs['Base Color'])
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 900; fine.inputs['Detail'].default_value = 2
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35
    Lk.new(fine.outputs['Fac'], bump.inputs['Height'])
    Lk.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.92
    return m


M['sand'] = sand_material()


def water_material():
    m = bpy.data.materials.new('sea')
    m.use_nodes = True
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    b = N['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.02, 0.18, 0.22, 1)
    b.inputs['Roughness'].default_value = 0.03
    b.inputs['Transmission Weight'].default_value = 0.0
    b.inputs['IOR'].default_value = 1.333
    b.inputs['Subsurface Weight'].default_value = 0.0
    # foam from the ocean modifier's foam layer
    attr = N.new('ShaderNodeAttribute'); attr.attribute_name = 'foam'
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.9
    Lk.new(attr.outputs['Fac'], ramp.inputs['Fac'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.03, 0.22, 0.27, 1)
    mix.inputs['B'].default_value = (0.9, 0.93, 0.92, 1)
    Lk.new(ramp.outputs['Color'], mix.inputs['Factor'])
    Lk.new(mix.outputs['Result'], b.inputs['Base Color'])
    rmix = N.new('ShaderNodeMapRange'); rmix.inputs['To Min'].default_value = 0.02; rmix.inputs['To Max'].default_value = 0.6
    Lk.new(ramp.outputs['Color'], rmix.inputs['Value'])
    Lk.new(rmix.outputs['Result'], b.inputs['Roughness'])
    return m


M['water'] = water_material()

# --------------------------------------------------------------- world
def world():
    w = bpy.data.worlds.new('sky')
    S.world = w
    w.use_nodes = True
    nt = w.node_tree
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(48)
    sky.sun_rotation = math.radians(float(os.environ.get('SUN_ROT', 300)))
    sky.sun_size = math.radians(3.0)
    sky.sun_intensity = 1.0
    sky.altitude = 50
    sky.air_density = 1.0
    sky.aerosol_density = 1.6
    bg = nt.nodes['Background']
    bg.inputs['Strength'].default_value = float(os.environ.get('SKY', 0.08))
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])


world()

# --------------------------------------------------------------- the ground
def ground():
    # platform
    box('platform', -30, -12, 0, 50, PEDGE + 0.32, PZ - 0.005, M['paving'], uv=True)
    box('kerb', -30, PEDGE, 0, 50, PEDGE + 0.33, PZ, M['kerb'], bevel=0.02)
    box('safety line', -30, PEDGE + 0.5, PZ - 0.004, 50, PEDGE + 0.62, PZ + 0.0015, M['yellow'], uv=True)
    # track bed
    box('ballast', -30, PEDGE + 0.001, -1.0, 50, 3.6, -0.3, M['ballast'])
    sl = []
    x = -30
    while x < 50:
        sl.append(box('sleeper', x, -1.3, -0.36, x + 0.24, 1.3, -0.24, M['sleeper'], bevel=0.015))
        x += 0.62
    lib.join('sleepers', sl)
    for y in (-0.7175, 0.7175):
        box('rail foot', -30, y - 0.035, -0.24, 50, y + 0.035, -0.21, M['steel'], bevel=0.006)
        box('rail web', -30, y - 0.009, -0.21, 50, y + 0.009, -0.1, M['steel'])
        box('rail head', -30, y - 0.033, -0.1, 50, y + 0.033, -0.06, M['steel'], bevel=0.008)


def seaside():
    # grass bank, rolling up from the ballast toward the beach
    bm = bmesh.new()
    nx, ny = 160, 40
    x0, x1, y0, y1 = -30, 50, 3.3, 9.2
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * j / ny
            t = (y - y0) / (y1 - y0)
            z = 0.05 + 0.55 * math.sin(min(1, t * 1.6) * math.pi / 2) - 0.75 * max(0, t - 0.75) / 0.25
            z += 0.12 * noise.noise(Vector((x * 0.25, y * 0.25, 0)))
            row.append(bm.verts.new((x, y, z)))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    g = mesh_obj('grass bank', bm, M['grass'], smooth=True)
    cube_uv(g)
    if os.environ.get('GRASS', '1') == '1':
        grass_blades(g)
    # beach
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=120, y_segments=40, size=1)
    for v in bm.verts:
        x = -30 + (v.co.x + 1) * 40
        y = 8.4 + (v.co.y + 1) * 4
        t = (y - 8.4) / 8
        v.co = Vector((x, y, -0.05 - 0.55 * t + 0.06 * noise.noise(Vector((x * 0.4, y * 0.4, 1)))))
    s = mesh_obj('beach', bm, M['sand'], smooth=True)
    cube_uv(s)
    # sea
    bpy.ops.mesh.primitive_plane_add(size=1, location=(10, 40, -0.12))
    sea = bpy.context.object
    sea.name = 'sea'
    sea.scale = (90, 62, 1)
    apply(sea)
    sea.data.materials.append(M['water'])
    oc = sea.modifiers.new('ocean', 'OCEAN')
    oc.geometry_mode = 'GENERATE'
    oc.size = 1.2
    oc.spatial_size = 50
    oc.repeat_x = 3
    oc.repeat_y = 3
    oc.resolution = 14
    oc.wave_scale = 0.55
    oc.choppiness = 1.1
    oc.wind_velocity = 7
    oc.use_foam = True
    oc.foam_layer_name = 'foam'
    oc.foam_coverage = 0.15
    oc.wave_alignment = 0.4
    oc.wave_direction = math.radians(-90)
    sea.location = (-60, 9.0, -0.15)
    for p in sea.data.polygons:
        p.use_smooth = True
    # boulders along the waterline
    rng = random.Random(3)
    for k in range(26):
        x = -12 + k * 1.9 + rng.uniform(-0.6, 0.6)
        y = 9.0 + rng.uniform(-0.6, 1.6)
        r = rng.uniform(0.25, 0.7)
        boulder(f'boulder{k}', x, y, r, rng)


def grass_material():
    m = bpy.data.materials.new('grass blades')
    m.use_nodes = True
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    b = N['Principled BSDF']
    hi = N.new('ShaderNodeHairInfo')
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.06, 0.17, 0.02, 1)
    ramp.color_ramp.elements[1].color = (0.24, 0.40, 0.06, 1)
    e = ramp.color_ramp.elements.new(0.6)
    e.color = (0.12, 0.30, 0.035, 1)
    Lk.new(hi.outputs['Random'], ramp.inputs['Fac'])
    # tips lighter and drier
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    Lk.new(hi.outputs['Intercept'], mix.inputs['Factor'])
    Lk.new(ramp.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.42, 0.5, 0.14, 1)
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.4
    Lk.new(hi.outputs['Intercept'], mr.inputs['Value'])
    Lk.new(mr.outputs['Result'], mix.inputs['Factor'])
    Lk.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.4
    b.inputs['Subsurface Weight'].default_value = 0.0
    b.inputs['Specular IOR Level'].default_value = 0.7
    return m


def grass_blades(g):
    # density only where the camera looks
    vg = g.vertex_groups.new(name='dense')
    for v in g.data.vertices:
        x = v.co.x
        w = 1.0 if -8 < x < 26 else 0.0
        vg.add([v.index], w, 'REPLACE')
    g.data.materials.append(grass_material())
    ps = g.modifiers.new('grass', 'PARTICLE_SYSTEM').particle_system
    st = ps.settings
    st.type = 'HAIR'
    st.count = int(os.environ.get('GRASS_N', 90000))
    st.hair_length = 0.075
    st.use_advanced_hair = False
    st.material = 2
    st.normal_factor = 1.0
    st.factor_random = 0.25
    st.brownian_factor = 0.0
    st.child_type = 'INTERPOLATED'
    st.child_percent = 4
    st.rendered_child_count = 4
    st.child_length = 1.0
    st.child_length_threshold = 0.3
    st.kink = 'NO'
    st.roughness_1 = 0.03
    st.roughness_2 = 0.05
    st.roughness_endpoint = 0.02
    st.root_radius = 0.0035
    st.tip_radius = 0.0
    st.radius_scale = 1.0
    st.use_close_tip = True
    st.display_step = 3
    st.render_step = 3
    ps.vertex_group_density = 'dense'
    ps.vertex_group_length = 'dense'
    st.hair_length = 0.075   # last: other settings rescale it
    # wildflowers: tiny daisies and buttercups scattered through it
    for name, col, n in (('daisy', (0.9, 0.9, 0.86), 1800), ('buttercup', (0.9, 0.62, 0.05), 900), ('clover', (0.75, 0.35, 0.6), 600)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.012)
        for v in bm.verts:
            v.co.z *= 0.35
        fl = mesh_obj(name, bm, principled(name, col, 0.5, Subsurface_Weight=0.3), smooth=True)
        fl.location = (0, 0, -20)
        fl.hide_render = False
        ps2 = g.modifiers.new(name, 'PARTICLE_SYSTEM').particle_system
        st2 = ps2.settings
        st2.type = 'HAIR'
        st2.count = n
        st2.hair_length = 0.1
        st2.render_type = 'OBJECT'
        st2.instance_object = fl
        st2.particle_size = 1.0
        st2.size_random = 0.5
        st2.use_rotations = True
        st2.rotation_mode = 'GLOB_Z'
        ps2.vertex_group_density = 'dense'
        st2.hair_length = 0.08
        ps2.seed = hash(name) % 1000
        g.show_instancer_for_render = True


def boulder(name, x, y, r, rng):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1)
    seed = Vector((rng.random() * 50, rng.random() * 50, 0))
    sx, sy, sz = rng.uniform(0.9, 1.4), rng.uniform(0.8, 1.2), rng.uniform(0.5, 0.75)
    for v in bm.verts:
        d = 1 + 0.25 * noise.noise(v.co * 1.3 + seed) + 0.07 * noise.noise(v.co * 4 + seed)
        v.co = Vector((v.co.x * sx * d, v.co.y * sy * d, v.co.z * sz * d))
        if v.co.z < -0.2:
            v.co.z = -0.2 + (v.co.z + 0.2) * 0.3
    ob = mesh_obj(name, bm, M['rock'], smooth=True)
    ob.scale = (r, r, r)
    ob.rotation_euler = (0, 0, rng.random() * 6.28)
    ob.location = (x, y, -0.1)
    apply(ob)
    cube_uv(ob, 1.0)


ground()
seaside()


# --------------------------------------------------------------- the carriage
SKIRT = 0.6        # bottom of the body sides
WIN_Z0, WIN_Z1 = FZ + 0.6, FZ + 1.02
SEA_WINDOWS = [0.9, 2.4, 3.9, 5.4, 7.6, 9.1, 10.6, 12.1, 13.6, 15.1, 16.6]
DOOR = (3.0, 4.15)                     # platform door in the lobby
CAB = [LOBBY, LOBBY + 3.77, LOBBY + 7.54, L - WT]
PLAT_WINDOWS = [0.9, 2.15, 5.3, CAB[0] + 1.2, CAB[0] + 2.6, CAB[1] + 1.2, CAB[1] + 2.6, CAB[2] + 1.2, CAB[2] + 2.6]
CAB_DOORS = [(c + 0.35, c + 1.3) for c in CAB[:3]]   # doorways in the corridor partition
WIN_W = 0.78


def gold_line_x(name, x0, x1, y, z, t=0.018, h=0.022):
    return box(name, x0, y - t / 2, z - h / 2, x1, y + t / 2, z + h / 2, M['gold'], bevel=0.006)


def gold_line_z(name, x, y, z0, z1, t=0.018, w=0.022, along='x'):
    if along == 'x':
        return box(name, x - w / 2, y - t / 2, z0, x + w / 2, y + t / 2, z1, M['gold'], bevel=0.006)
    return box(name, x - t / 2, y - w / 2, z0, x + t / 2, y + w / 2, z1, M['gold'], bevel=0.006)


def frame_x(name, x0, x1, z0, z1, y, out, w=0.02, mat=None, depth=0.014):
    """Rectangular moulding on a wall that runs along x; `out` = +1/-1 side the face points to."""
    yc = y + out * depth / 2
    parts = [
        box(name, x0, yc - depth / 2, z0, x1, yc + depth / 2, z0 + w, mat or M['gold'], bevel=0.005),
        box(name, x0, yc - depth / 2, z1 - w, x1, yc + depth / 2, z1, mat or M['gold'], bevel=0.005),
        box(name, x0, yc - depth / 2, z0, x0 + w, yc + depth / 2, z1, mat or M['gold'], bevel=0.005),
        box(name, x1 - w, yc - depth / 2, z0, x1, yc + depth / 2, z1, mat or M['gold'], bevel=0.005),
    ]
    return lib.join(name, parts)


def frame_y(name, y0, y1, z0, z1, x, out, w=0.02, mat=None, depth=0.014):
    xc = x + out * depth / 2
    parts = [
        box(name, xc - depth / 2, y0, z0, xc + depth / 2, y1, z0 + w, mat or M['gold'], bevel=0.005),
        box(name, xc - depth / 2, y0, z1 - w, xc + depth / 2, y1, z1, mat or M['gold'], bevel=0.005),
        box(name, xc - depth / 2, y0, z0, xc + depth / 2, y0 + w, z1, mat or M['gold'], bevel=0.005),
        box(name, xc - depth / 2, y1 - w, z0, xc + depth / 2, y1, z1, mat or M['gold'], bevel=0.005),
    ]
    return lib.join(name, parts)


def cut(ob, cutters):
    if not cutters:
        return
    c = lib.join(ob.name + ' cutter', cutters)
    c.hide_render = True
    c.hide_viewport = True
    m = ob.modifiers.new('cut', 'BOOLEAN')
    m.object = c
    m.solver = 'EXACT'
    # move the boolean before the bevel so the openings get bevelled edges
    while ob.modifiers.find('cut') > 0:
        with bpy.context.temp_override(object=ob):
            bpy.ops.object.modifier_move_up(modifier='cut')


def cap_x(name, x0, x1, y):
    c = cyl(name, y, WZ + 0.012, x0, x1, 0.034, M['gold'], 24, axis='X')
    return c


def cap_y(name, y0, y1, x):
    return cyl(name, x, WZ + 0.012, y0, y1, 0.034, M['gold'], 24, axis='Y')


def window(name, xc, y_in, y_out):
    """Gold frame and glass in an opening of the outer wall."""
    x0, x1 = xc - WIN_W / 2, xc + WIN_W / 2
    yi, yo = min(y_in, y_out) - 0.012, max(y_in, y_out) + 0.012
    f = 0.035
    parts = [
        box(name, x0 - f, yi, WIN_Z0 - f, x1 + f, yo, WIN_Z0, M['gold'], bevel=0.008),
        box(name, x0 - f, yi, WIN_Z1, x1 + f, yo, WIN_Z1 + f, M['gold'], bevel=0.008),
        box(name, x0 - f, yi, WIN_Z0, x0, yo, WIN_Z1, M['gold'], bevel=0.008),
        box(name, x1, yi, WIN_Z0, x1 + f, yo, WIN_Z1, M['gold'], bevel=0.008),
        box(name, xc - 0.012, (yi + yo) / 2 - 0.012, WIN_Z0, xc + 0.012, (yi + yo) / 2 + 0.012, WIN_Z1, M['gold'], bevel=0.004),
    ]
    lib.join(name + ' frame', parts)
    ym = (y_in + y_out) / 2
    box(name + ' glass', x0, ym - 0.004, WIN_Z0, x1, ym + 0.004, WIN_Z1, M['glass'], uv=False)


def outer_wall(name, y_in, y_out, windows, gaps=()):
    """A side wall from the skirt to the cap, with windows (and door gaps)."""
    y0, y1 = min(y_in, y_out), max(y_in, y_out)
    out = 1 if y_out > y_in else -1
    segs, x = [], 0.0
    for g0, g1 in sorted(gaps):
        segs.append((x, g0))
        x = g1
    segs.append((x, L))
    walls = []
    for i, (a, b) in enumerate(segs):
        w = box(f'{name} {i}', a, y0, SKIRT, b, y1, WZ, M['paint'], bevel=0.012)
        cutters = [box('c', xc - WIN_W / 2, y0 - 0.1, WIN_Z0, xc + WIN_W / 2, y1 + 0.1, WIN_Z1) for xc in windows if a < xc < b]
        cut(w, cutters)
        walls.append(w)
        cap_x(f'{name} cap {i}', a, b, (y0 + y1) / 2)
    for g0, g1 in gaps:   # the body below a door continues as the step
        box(f'{name} step', g0, y0, SKIRT, g1, y1, FZ - 0.02, M['paint'], bevel=0.012)
        box(f'{name} sill', g0 - 0.02, y0 - 0.03, FZ - 0.03, g1 + 0.02, y1 + 0.03, FZ, M['gold'], bevel=0.006)
        for gx in (g0, g1):   # door posts
            box(f'{name} post', gx - 0.03, y0 - 0.015, FZ, gx + 0.03, y1 + 0.015, WZ, M['gold'], bevel=0.008)
    for xc in windows:
        window(f'{name} win', xc, y_in, y_out)
    # outside lining: a gold line under the windows and one at the floor, dark skirt
    yo = y_out + out * 0.009
    edges = [0.0] + [v for g in gaps for v in g] + [L]
    for a, b in zip(edges[0::2], edges[1::2]):
        gold_line_x(f'{name} line hi', a + 0.08, b - 0.08, yo, WIN_Z0 - 0.08)
        gold_line_x(f'{name} line lo', a + 0.08, b - 0.08, yo, FZ + 0.08)
    box(f'{name} skirt', 0.02, min(yo, y_out) - 0.004, SKIRT, L - 0.02, max(yo, y_out) + 0.004, FZ - 0.04, M['paint_dark'], bevel=0.006)
    # outside panels between the two lines, one per bay
    bays = sorted(set([0.0, L] + [w + WIN_W / 2 + 0.38 for w in windows] + [v for g in gaps for v in g]))
    for a, b in zip(bays, bays[1:]):
        if b - a < 0.4 or any(g0 - 0.01 <= a and b <= g1 + 0.01 for g0, g1 in gaps):
            continue
        frame_x(f'{name} panel', a + 0.12, b - 0.12, FZ + 0.16, WIN_Z0 - 0.16, y_out, out, w=0.016)
    # inside: the wainscot frames under the windows
    for a, b in zip(bays, bays[1:]):
        if b - a < 0.4 or any(g0 - 0.01 <= a and b <= g1 + 0.01 for g0, g1 in gaps):
            continue
        frame_x(f'{name} wainscot', a + 0.14, b - 0.14, FZ + 0.14, WIN_Z0 - 0.14, y_in, -out, w=0.016)
    return walls


def partition_x(name, y, x0, x1, gaps=()):
    """Cream partition along x with a crimson base, gold-framed panels and a gold cap."""
    t = 0.08
    edges = [x0] + [v for g in gaps for v in g] + [x1]
    for i, (a, b) in enumerate(zip(edges[0::2], edges[1::2])):
        box(f'{name} {i}', a, y - t / 2, FZ, b, y + t / 2, WZ, M['cream'], bevel=0.01)
        box(f'{name} base {i}', a, y - t / 2 - 0.012, FZ, b, y + t / 2 + 0.012, FZ + 0.16, M['paint'], bevel=0.008)
        cap_x(f'{name} cap {i}', a, b, y)
        for side in (-1, 1):
            n = max(1, int((b - a) / 1.1))
            step = (b - a) / n
            for k in range(n):
                frame_x(f'{name} panel', a + k * step + 0.1, a + (k + 1) * step - 0.1, FZ + 0.3, WZ - 0.14, y + side * t / 2, side)
    for g0, g1 in gaps:
        for gx in (g0, g1):
            box(f'{name} jamb', gx - 0.025, y - t / 2 - 0.015, FZ, gx + 0.025, y + t / 2 + 0.015, WZ, M['walnut'], bevel=0.008)


def partition_y(name, x, y0, y1, low=False):
    t = 0.08
    top = FZ + 0.35 if low else WZ
    box(name, x - t / 2, y0, FZ, x + t / 2, y1, top, M['cream'], bevel=0.01)
    box(name + ' base', x - t / 2 - 0.012, y0, FZ, x + t / 2 + 0.012, y1, FZ + 0.16, M['paint'], bevel=0.008)
    cyl(name + ' cap', x, top + 0.012, y0, y1, 0.034, M['gold'], 24, axis='Y')
    if not low:
        for side in (-1, 1):
            n = max(1, int((y1 - y0) / 1.1))
            step = (y1 - y0) / n
            for k in range(n):
                frame_y(name + ' panel', y0 + k * step + 0.1, y0 + (k + 1) * step - 0.1, FZ + 0.3, WZ - 0.14, x + side * t / 2, side)


def carriage():
    # chassis and floor slab
    box('underframe', 0.3, -2.1, 0.62, L - 0.3, 2.1, FZ - 0.1, M['rust'])
    box('floor slab', 0, -HW, FZ - 0.12, L, HW, FZ - 0.015, M['rust'])
    for bx in (2.7, L - 2.7):
        box('bogie', bx - 1.3, -1.0, 0.18, bx + 1.3, 1.0, 0.5, M['rust'], bevel=0.03)
        for dx in (-0.9, 0.9):
            for y in (-0.7175, 0.7175):
                cyl('wheel', bx + dx, 0.3, y - 0.06, y + 0.06, 0.42, M['iron'], 40, axis='Y')
    # floors
    box('lobby floor', WT, -HW + WT, FZ - 0.02, LOBBY, HW - WT, FZ, M['floor'])
    box('cabin floor', LOBBY, -HW + WT, FZ - 0.02, L - WT, CORR, FZ, M['floor'])
    box('corridor carpet', LOBBY, CORR + 0.04, FZ - 0.02, L - WT, HW - WT, FZ + 0.004, M['carpet'])
    for yb in (CORR + 0.1, HW - WT - 0.06):   # gold border lines woven into the runner
        box('carpet border', LOBBY, yb - 0.012, FZ + 0.004, L - WT, yb + 0.012, FZ + 0.0055, M['gold_thread'], uv=False)
    # walls
    outer_wall('sea wall', HW - WT, HW, SEA_WINDOWS)
    outer_wall('platform wall', -HW + WT, -HW, PLAT_WINDOWS, gaps=[DOOR])
    # rear end: a low sill so the camera sees in; front end full height
    box('rear sill', 0, -HW, SKIRT, WT, HW, FZ + 0.32, M['paint'], bevel=0.012)
    cyl('rear cap', 0.045, FZ + 0.332, -HW, HW, 0.034, M['gold'], 24, axis='Y')
    box('front end', L - WT, -HW, SKIRT, L, HW, WZ, M['paint'], bevel=0.012)
    cap_y('front cap', -HW, HW, L - WT / 2)
    # interior partitions
    partition_x('corridor wall', CORR, LOBBY, L - WT, gaps=CAB_DOORS)
    for i, x in enumerate(CAB[:3]):
        partition_y(f'cabin wall {i}', x, -HW + WT, CORR - 0.04)


carriage()

import props
props.setup(M, FZ)
props.lobby(None)
props.suite(CAB[0] + 0.04, CAB[1] - 0.04, -HW + WT, CORR - 0.04)
props.outside_materials()
for xc in PLAT_WINDOWS:
    props.flower_box(f'flowers {xc}', xc - 0.5, xc + 0.5, -HW - 0.01, WIN_Z0 - 0.19, seed=int(xc * 10))
props.luggage_trolley(7.6, -5.2, PZ, math.radians(-8))
props.coffee_cart(1.7, -4.9, PZ, math.radians(4))
props.street_lamp(11.5, -7.4, PZ)
props.street_lamp(-2.5, -7.4, PZ)
props.street_lamp(6.0, 4.4, 0.45)
props.bench(9.0, 4.6, 0.45, math.radians(180))

if os.environ.get('PEOPLE_ON', '1') == '1':
    import people
    people.conductor(4.5, -0.45, -20, 'side', props.M)
    people.attendant(2.9, 0.35, -60, 'tray', props.M)
    people.guest('rpm_black_coat_guy_cp_p.glb', 'guest bowler', 5.25, 0.15, 135, 'side', mats=props.M, hat='bowler', z=FZ)
    people.guest('rpm_business_white_lady_p.glb', 'guest lady', 6.6, -4.4, 160, 'side', mats=props.M)
    people.guest('rpm_pink_smart_lady_p.glb', 'guest pink', 2.6, -4.1, 200, 'side', mats=props.M)
    people.guest('rpm_yellow_dress_lady_p.glb', 'guest corridor', 12.0, 1.55, 95, 'side', mats=props.M, z=FZ,
                 recolor=[('Outfit_Top', 'hue', dict(hue=0.12, sat=0.9, val=0.6)), ('Outfit_Bottom', 'hue', dict(hue=0.5, sat=0.2, val=0.4)),
                          ('Footwear', 'hue', dict(hue=0.5, sat=0.2, val=0.25))])

if os.environ.get('ALL_CABINS', '1') == '1':
    props.cabin_twin(CAB[1] + 0.04, CAB[2] - 0.04, -HW + WT, CORR - 0.04, 2)
    props.cabin_twin(CAB[2] + 0.04, CAB[3] - 0.04, -HW + WT, CORR - 0.04, 3)


# --------------------------------------------------------------- camera and render
SHOTS = {
    # name: (target, yaw from +x toward +y (deg), pitch down (deg), distance, lens mm)
    'hero': ((3.6, -0.5, 1.4), 50, 52, 8.6, 35),
    'suite': ((8.7, -0.7, 1.3), 48, 54, 7.4, 35),
    'platform': ((4.2, -3.6, 1.3), 58, 48, 8.0, 35),
    'overview': ((6.5, -0.8, 1.3), 50, 50, 13.0, 35),
    'cabin': ((9.0, -0.8, 1.2), 50, 52, 8.5, 38),
    'lobby': ((3.3, -0.5, 1.2), 50, 52, 8.5, 38),
    'wide': ((9.0, 1.0, 1.0), 52, 46, 26, 35),
}


def camera(shot):
    tgt, yaw, pitch, dist, lens = SHOTS[shot]
    yaw, pitch = math.radians(yaw), math.radians(pitch)
    d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), -math.sin(pitch)))
    pos = Vector(tgt) - d * dist
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    cam.sensor_width = 36
    ob = bpy.data.objects.new('cam', cam)
    link(ob)
    ob.location = pos
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    S.camera = ob


def render_settings():
    S.render.engine = 'CYCLES'
    S.cycles.device = 'CPU'
    S.view_settings.view_transform = 'AgX'
    S.view_settings.look = 'AgX - Medium High Contrast'
    S.view_settings.exposure = 0.0
    S.cycles.use_denoising = True
    S.cycles.denoiser = 'OPENIMAGEDENOISE'
    S.cycles.max_bounces = 8
    S.cycles.glossy_bounces = 4
    S.cycles.transmission_bounces = 6
    S.cycles.caustics_reflective = False
    S.cycles.caustics_refractive = False
    S.cycles.sample_clamp_indirect = 6
    S.render.image_settings.file_format = 'PNG'
    if MODE == 'final':
        S.render.resolution_x, S.render.resolution_y = 1080, 1920
        S.cycles.samples = int(os.environ.get('SAMPLES', 192))
        S.cycles.adaptive_threshold = 0.015
    else:
        S.render.resolution_x, S.render.resolution_y = 432, 768
        S.cycles.samples = 48
    S.render.resolution_percentage = 100
    S.render.threads_mode = 'AUTO'


if __name__ == '__main__' or True:
    camera(SHOT)
    render_settings()
    if os.environ.get('SAVE_BLEND'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'carriage.blend'))
    S.render.filepath = os.path.join(OUT, f'{SHOT}_{MODE}.png')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print('RENDERED', S.render.filepath, round(time.time() - t, 1), 's')
