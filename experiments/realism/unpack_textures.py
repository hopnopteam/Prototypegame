import bpy, sys, os, glob
root = '/tmp/claude-0/tex'
out = '/tmp/claude-0/tex/img'
os.makedirs(out, exist_ok=True)
for blend in sorted(glob.glob(root + '/*/*.blend')):
    name = os.path.basename(os.path.dirname(blend))
    bpy.ops.wm.open_mainfile(filepath=blend)
    for im in bpy.data.images:
        if im.size[0] == 0 and not im.packed_file: continue
        base = os.path.basename(im.filepath or im.name)
        stem, ext = os.path.splitext(base)
        if not ext: ext = '.png'
        dst = f'{out}/{name}__{stem}{ext}'
        try:
            if im.packed_file:
                with open(dst, 'wb') as f: f.write(im.packed_file.data)
            else:
                continue
            print('OK', dst, im.size[:])
        except Exception as e: print('ERR', base, e)
