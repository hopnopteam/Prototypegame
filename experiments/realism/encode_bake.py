"""Turn the float bake into the texture the game draws untouched: Blender's own AgX view transform, as in the renders.

Run:  python encode_bake.py <baked.exr> <out.jpg> [exposure] [look]
"""
import bpy, sys, json, os
src, out = sys.argv[1], sys.argv[2]
exposure = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
look = sys.argv[4] if len(sys.argv) > 4 else 'AgX - Medium High Contrast'
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.view_settings.view_transform = 'AgX'
S.view_settings.look = look
S.view_settings.exposure = exposure
S.render.image_settings.file_format = 'JPEG'
S.render.image_settings.quality = 92
im = bpy.data.images.load(src)
im.save_render(out, scene=S)
json.dump({'scale': 1.0, 'toneMapped': False, 'exposure': exposure, 'look': look}, open(os.path.join(os.path.dirname(out), 'lobby_bake.json'), 'w'))
print('ENCODED', out)
