"""People for the photoreal experiment: rigged avatars (glTF), posed, re-dressed in uniforms, with modelled hats."""
import bpy, math, os
from mathutils import Vector, Matrix, Quaternion
import lib
from lib import principled, lathe, cyl, apply

PEOPLE = os.environ.get('PEOPLE', '/tmp/claude-0/assets/people')


def load(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(PEOPLE, path))
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.name.startswith('Icosphere'):
            new.remove(o)
            bpy.data.objects.remove(o)
    arm = next(o for o in new if o.type == 'ARMATURE')
    arm.name = name
    meshes = [o for o in new if o.type == 'MESH']
    return arm, meshes


def bone_world(arm, b):
    pb = arm.pose.bones[b]
    return arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail


def aim(arm, bone, target_dir, child=None):
    """Rotate a pose bone (about its head) so it points along target_dir (armature space)."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(target_dir).normalized())
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def turn(arm, bone, axis, deg):
    """Rotate a pose bone about an armature-space axis through its head."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()


def stand(arm, pose='side', side_sign=1.0):
    """Arms down from the A-pose. The avatar faces -Y; its left is +X."""
    # natural stance: arms hang with a slight bend, hands close to the thighs
    if pose in ('side', 'tray', 'wave', 'behind'):
        aim(arm, 'LeftArm', (0.16, 0.02, -1))
        aim(arm, 'RightArm', (-0.16, 0.02, -1))
        aim(arm, 'LeftForeArm', (0.08, -0.12, -1))
        aim(arm, 'RightForeArm', (-0.08, -0.12, -1))
        for s in ('Left', 'Right'):
            pb = arm.pose.bones[s + 'Hand']
            d = (pb.tail - pb.head)
    if pose == 'tray':
        # right forearm forward and level, palm up, as if carrying a tray
        aim(arm, 'RightArm', (-0.22, -0.25, -1))
        aim(arm, 'RightForeArm', (0.15, -1.0, 0.05))
        aim(arm, 'RightHand', (0.1, -1.0, 0.0))
    if pose == 'wave':
        aim(arm, 'RightArm', (-0.5, -0.3, 0.6))
        aim(arm, 'RightForeArm', (-0.15, -0.2, 1))
    if pose == 'behind':
        aim(arm, 'LeftArm', (0.12, 0.35, -1))
        aim(arm, 'RightArm', (-0.12, 0.35, -1))
        aim(arm, 'LeftForeArm', (-0.6, 0.5, -0.5))
        aim(arm, 'RightForeArm', (0.6, 0.5, -0.5))
    # relax the fingers a little
    for s in ('Left', 'Right'):
        for f in ('Index', 'Middle', 'Ring', 'Pinky'):
            for k in (1, 2, 3):
                b = f'{s}Hand{f}{k}'
                if b in arm.pose.bones:
                    arm.pose.bones[b].rotation_mode = 'XYZ'
                    arm.pose.bones[b].rotation_euler.x += math.radians(14)
    turn(arm, 'Head', Vector((0, 0, 1)), 6 * side_sign)
    turn(arm, 'Spine1', Vector((0, 0, 1)), -4 * side_sign)


def tint_texture(mat, mode, **kw):
    """Re-dress a texture-based outfit: 'ramp' maps brightness to new colours, 'hue' rotates hue."""
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    b = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    link = b.inputs['Base Color'].links
    if not link:
        b.inputs['Base Color'].default_value = (*kw.get('flat', (0.03, 0.04, 0.09)), 1)
        return
    src = link[0].from_socket
    if mode == 'ramp':
        bw = N.new('ShaderNodeRGBToBW')
        L.new(src, bw.inputs['Color'])
        ramp = N.new('ShaderNodeValToRGB')
        cr = ramp.color_ramp
        stops = kw['stops']
        cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
        for p, c in stops[1:-1]:
            e = cr.elements.new(p)
            e.color = (*c, 1)
        L.new(bw.outputs['Val'], ramp.inputs['Fac'])
        L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    elif mode == 'hue':
        h = N.new('ShaderNodeHueSaturation')
        h.inputs['Hue'].default_value = kw.get('hue', 0.5)
        h.inputs['Saturation'].default_value = kw.get('sat', 1.0)
        h.inputs['Value'].default_value = kw.get('val', 1.0)
        L.new(src, h.inputs['Color'])
        L.new(h.outputs['Color'], b.inputs['Base Color'])
    if 'rough' in kw:
        for l_ in list(b.inputs['Roughness'].links):
            L.remove(l_)
        b.inputs['Roughness'].default_value = kw['rough']
    if 'metal' in kw:
        for l_ in list(b.inputs['Metallic'].links):
            L.remove(l_)
        b.inputs['Metallic'].default_value = kw['metal']


def mesh_named(meshes, key):
    for o in meshes:
        for m in o.data.materials:
            if m and key in m.name:
                return o, m
    return None, None


def hat_to_head(arm, ob):
    """Parent a hat to the Head bone, keeping where it was placed."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = 'BONE'
    ob.parent_bone = 'Head'
    bpy.context.view_layer.update()
    ob.matrix_world = mw


def head_top(arm):
    bpy.context.view_layer.update()
    pb = arm.pose.bones['Head']
    top = arm.pose.bones['HeadTop_End'].head if 'HeadTop_End' in arm.pose.bones else pb.tail
    return arm.matrix_world @ pb.head, arm.matrix_world @ top


NAVY_STOPS = [(0.0, (0.004, 0.006, 0.02)), (0.25, (0.012, 0.02, 0.06)), (0.55, (0.03, 0.05, 0.13)), (0.66, (0.6, 0.62, 0.65)), (0.8, (0.86, 0.87, 0.88))]


def conductor(x, y, rot_deg, pose='side', mats=None):
    arm, meshes = load('readyplayer.me.glb', 'conductor')
    for key in ('Outfit_Top',):
        o, m = mesh_named(meshes, key)
        tint_texture(m, 'ramp', stops=NAVY_STOPS, rough=0.7)
    o, m = mesh_named(meshes, 'Outfit_Bottom')
    tint_texture(m, 'ramp', stops=[(0.0, (0.004, 0.006, 0.02)), (1.0, (0.035, 0.05, 0.13))], rough=0.7)
    o, m = mesh_named(meshes, 'Outfit_Footwear')
    tint_texture(m, 'ramp', stops=[(0.0, (0.005, 0.005, 0.005)), (1.0, (0.06, 0.05, 0.05))], rough=0.25)
    o, m = mesh_named(meshes, 'Headwear')
    if o:
        o.hide_render = True
        o.hide_viewport = True
    place(arm, x, y, rot_deg)
    stand(arm, pose)
    cap(arm, mats)
    return arm


def place(arm, x, y, rot_deg, z=1.05):
    arm.scale = (0.93, 0.93, 0.93)
    arm.location = (x, y, z)
    arm.rotation_euler = (0, 0, math.radians(rot_deg))
    bpy.context.view_layer.update()


def cap(arm, mats):
    hb, ht = head_top(arm)
    up = (ht - hb).normalized()
    z0 = hb.z + (ht.z - hb.z) * 0.72
    navy = principled('cap navy', (0.012, 0.018, 0.05), 0.55, Sheen_Weight=0.3)
    black = principled('cap peak', (0.004, 0.004, 0.005), 0.12, Coat_Weight=1.0)
    gold = mats['gold_polish']
    parts = []
    c = lathe('cap crown', [(0, 0), (0.095, 0), (0.1, 0.05), (0.118, 0.085), (0.12, 0.095), (0.11, 0.1), (0, 0.105)], navy, 40, (0, 0, 0))
    c.scale = (1.0, 1.1, 1.0)
    apply(c)
    parts.append(c)
    parts.append(lathe('cap band', [(0.098, 0.004), (0.1, 0.004), (0.104, 0.04), (0.102, 0.04)], gold, 40, (0, 0, 0)))
    # peak: a curved half disc at the front (-Y)
    import bmesh
    bm = bmesh.new()
    rows = []
    for i in range(13):
        a = math.pi + math.pi * i / 12
        row = []
        for r in (0.095, 0.16):
            px, py = r * math.cos(a), r * math.sin(a) * 1.05
            row.append(bm.verts.new((px, py if py < 0 else -abs(py), 0.004 - 0.25 * (r - 0.095) - 0.06 * (r - 0.095) * abs(math.cos(a)))))
        rows.append(row)
    for a_, b_ in zip(rows, rows[1:]):
        bm.faces.new((a_[0], a_[1], b_[1], b_[0]))
    pk = lib.mesh_obj('cap peak', bm, black, smooth=True)
    sol = pk.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.006
    for p in pk.data.polygons:
        p.use_smooth = True
    parts.append(pk)
    b = lathe('cap badge', [(0, 0), (0.018, 0), (0.018, 0.004), (0, 0.006)], gold, 20, (0, 0, 0))
    b.data.transform(Matrix.Translation((0, -0.112, 0.06)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    parts.append(b)
    hat = lib.join('conductor cap', parts)
    # place on the head, facing where the avatar faces
    yaw = arm.rotation_euler.z
    hat.matrix_world = Matrix.Translation((hb.x + (ht.x - hb.x) * 0.7, hb.y + (ht.y - hb.y) * 0.7, z0)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(math.radians(-6), 4, 'X')
    hat_to_head(arm, hat)


def attendant(x, y, rot_deg, pose='tray', mats=None):
    arm, meshes = load('rpm_office_lady_p.glb', 'attendant')
    for key in ('Outfit_Top', 'Outfit_Bottom'):
        o, m = mesh_named(meshes, key)
        if m:
            # navy suit -> aubergine uniform; the shirt and tie keep their light tones
            tint_texture(m, 'hue', hue=0.63, sat=1.6, val=1.35, rough=0.6, metal=0.0)
    place(arm, x, y, rot_deg)
    stand(arm, pose, -1)
    # pillbox hat
    hb, ht = head_top(arm)
    purple = principled('pillbox', (0.16, 0.04, 0.22), 0.5, Sheen_Weight=0.4)
    hat = lathe('pillbox hat', [(0, 0), (0.075, 0), (0.078, 0.06), (0.074, 0.065), (0, 0.066)], purple, 40, (0, 0, 0))
    band = lathe('pillbox band', [(0.0765, 0.006), (0.079, 0.006), (0.0795, 0.018), (0.077, 0.018)], principled('hat band', (0.9, 0.88, 0.85), 0.6), 40, (0, 0, 0))
    hat = lib.join('pillbox', [hat, band])
    yaw = arm.rotation_euler.z
    hat.matrix_world = Matrix.Translation((ht.x, ht.y, ht.z - 0.035)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(math.radians(14), 4, 'Y') @ Matrix.Translation((0.03, 0.0, 0))
    hat_to_head(arm, hat)
    if pose == 'tray':
        tray(arm, mats)
    return arm


def tray(arm, mats):
    """A silver tray balanced on the right hand with a bottle and a glass."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones['RightHand']
    h = arm.matrix_world @ ((pb.head + pb.tail) / 2)
    silver = principled('silver', (0.9, 0.9, 0.9), 0.15, 1.0)
    t = lathe('tray', [(0, 0), (0.16, 0), (0.17, 0.012), (0.165, 0.014), (0.155, 0.004), (0, 0.004)], silver, 48, (h.x, h.y, h.z + 0.035))
    glass_m = principled('bottle glass', (0.1, 0.4, 0.15), 0.05, Transmission_Weight=0.9, IOR=1.5)
    lathe('bottle', [(0, 0), (0.035, 0), (0.037, 0.005), (0.037, 0.17), (0.03, 0.2), (0.014, 0.24), (0.013, 0.3), (0.016, 0.305), (0, 0.306)],
          glass_m, 32, (h.x + 0.04, h.y, h.z + 0.04))
    lathe('wine glass', [(0, 0), (0.03, 0), (0.03, 0.004), (0.004, 0.01), (0.004, 0.08), (0.03, 0.1), (0.035, 0.15), (0.033, 0.15), (0.028, 0.1), (0, 0.088)],
          principled('crystal', (0.95, 0.95, 0.95), 0.02, Transmission_Weight=1.0, IOR=1.5), 32, (h.x - 0.06, h.y + 0.03, h.z + 0.04))


def guest(path, name, x, y, rot_deg, pose='side', recolor=None, mats=None, hat=None, hide=(), z=0.92):
    arm, meshes = load(path, name)
    if recolor:
        for key, mode, kw in recolor:
            o, m = mesh_named(meshes, key)
            if m:
                tint_texture(m, mode, **kw)
    for key in hide:
        o, m = mesh_named(meshes, key)
        if o:
            o.hide_render = True
    place(arm, x, y, rot_deg, z=z)
    stand(arm, pose)
    if hat == 'bowler':
        hb, ht = head_top(arm)
        felt = principled('bowler felt', (0.012, 0.01, 0.01), 0.45, Sheen_Weight=0.5)
        b = lathe('bowler', [(0, 0), (0.17, 0), (0.172, 0.006), (0.15, 0.012), (0.1, 0.016), (0.102, 0.05), (0.098, 0.1), (0.07, 0.13), (0, 0.14)], felt, 48, (0, 0, 0))
        b.scale = (1, 1.12, 1)
        apply(b)
        yaw = arm.rotation_euler.z
        b.matrix_world = Matrix.Translation((ht.x, ht.y, ht.z - 0.055)) @ Matrix.Rotation(yaw, 4, 'Z')
        hat_to_head(arm, b)
    return arm
