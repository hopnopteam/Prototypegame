"""Renders kit parts (or an exported figure) in a clay studio with Cycles, for the proofs and for iterating on shapes.

  python3.11 art/blender/characters/preview.py OUT.png part.glb[@x,y,z] ... [--size 512] [--yaw 35] [--samples 48]
      [--pitch 40] [--fov 20] [--turn DEG] [--colors]

Materials named skin/hair/shoe/sole get the reference's sampled clay colours (CHARACTER_SPEC §7); vertex colours are
used otherwise (an exported figure). The camera looks down `pitch` degrees through a long lens like the reference
sheet's, the key light high behind right, a soft fill, a white floor catching a soft cool shadow.
"""
import math
import os
import sys

import bpy

args = sys.argv[1:]
out = args[0]
opts = {'size': 512, 'yaw': 35.0, 'samples': 48, 'pitch': 40.0, 'fov': 20.0, 'turn': 0.0, 'frame': 1.3, 'frames': 0}
files = []
i = 1
while i < len(args):
    a = args[i]
    if a.startswith('--'):
        opts[a[2:]] = float(args[i + 1])
        i += 2
    else:
        files.append(a)
        i += 1

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = int(opts['samples'])
scene.cycles.use_denoising = True
scene.render.resolution_x = int(opts['size'])
scene.render.resolution_y = int(opts['size'] * 1.0)
scene.view_settings.view_transform = 'Standard'

CLAY = {'skin': (0.87, 0.70, 0.52), 'hair': (0.19, 0.18, 0.17), 'shoe': (0.13, 0.12, 0.11), 'sole': (0.85, 0.83, 0.78)}


def clay(name, rgb, vertex=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Subsurface Weight'].default_value = 0.15
    bsdf.inputs['Subsurface Radius'].default_value = (0.02, 0.01, 0.008)
    if vertex:
        attr = nt.nodes.new('ShaderNodeAttribute')
        attr.attribute_name = 'Color'
        attr.attribute_type = 'GEOMETRY'
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    return m


objs = []
turners = []
for f in files:
    path, _, at = f.partition('@')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    off = [float(v) for v in at.split(',')] if at else [0, 0, 0]
    for o in new:
        o.location.x += off[0]
        o.location.y += off[1]
        o.location.z += off[2]
        for s in o.material_slots:
            n = (s.material.name if s.material else '').split('.')[0]
            s.material = clay(n, CLAY[n]) if n in CLAY else clay(n, (0.8, 0.8, 0.8), vertex=True)
        objs.append(o)
    # Turn the whole figure about the vertical through its root (not each part about its own pivot).
    roots = {o for o in bpy.data.objects if o not in before and o.parent is None}
    for r in roots:
        r.rotation_mode = 'XYZ'
    tops = list(roots)
    turners.extend(tops)
    for r in tops:
        r.rotation_euler.z += math.radians(opts['turn'])

bpy.context.view_layer.update()
lo = [min(min((o.matrix_world @ v.co)[k] for v in o.data.vertices) for o in objs) for k in range(3)]
hi = [max(max((o.matrix_world @ v.co)[k] for v in o.data.vertices) for o in objs) for k in range(3)]
cx, cy, cz = [(a + b) / 2 for a, b in zip(lo, hi)]
height = max(hi[2] - lo[2], hi[0] - lo[0], hi[1] - lo[1])

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, min(0.0, lo[2])))
floor = bpy.context.object
fm = bpy.data.materials.new('floor')
fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
floor.data.materials.append(fm)

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.92, 0.94, 1.0, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55

# Key: high, behind and to the right of the camera's view, big and soft (the reference's long soft shadow down-left).
bpy.ops.object.light_add(type='AREA', location=(cx + 3.0, cy + 3.5, cz + 5.5))
key = bpy.context.object
key.data.energy = 900
key.data.size = 3.5
key.data.color = (1.0, 0.97, 0.92)
key.rotation_euler = (math.radians(-38), math.radians(30), math.radians(140))
dirv = (key.location.x - cx, key.location.y - cy, key.location.z - cz)

cam_data = bpy.data.cameras.new('cam')
cam_data.angle = math.radians(opts['fov'])
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
pitch = math.radians(opts['pitch'])
yaw = math.radians(opts['yaw'])
dist = height * opts['frame'] / (2 * math.tan(cam_data.angle / 2))
# Looking from the front (−y is the figures' forward) turned by `yaw`, down by `pitch`.
cam.location = (cx + dist * math.cos(pitch) * math.sin(yaw), cy - dist * math.cos(pitch) * math.cos(yaw), cz + dist * math.sin(pitch))
look = (cx - cam.location.x, cy - cam.location.y, cz - cam.location.z)
cam.rotation_euler = (math.atan2(math.hypot(look[0], look[1]), -look[2]), 0, math.atan2(look[1], look[0]) - math.pi / 2)
for o in bpy.context.scene.objects:
    if o.type == 'LIGHT':
        tgt = (cx - o.location.x, cy - o.location.y, cz - o.location.z)
        o.rotation_euler = (math.atan2(math.hypot(tgt[0], tgt[1]), -tgt[2]), 0, math.atan2(tgt[1], tgt[0]) - math.pi / 2)
frames = int(opts['frames'])
if frames <= 0:
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('rendered', out)
else:
    # A turntable: every object turned about its own vertical axis, `frames` stills round a full circle.
    base = [o.rotation_euler.z for o in turners]
    for f in range(frames):
        for o, z in zip(turners, base):
            o.rotation_euler.z = z + 2 * math.pi * f / frames
        scene.render.filepath = out.replace('.png', '_%02d.png' % f)
        bpy.ops.render.render(write_still=True)
    print('rendered', frames, 'frames')
