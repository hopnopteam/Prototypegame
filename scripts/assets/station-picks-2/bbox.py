# Prints each model's bounding box (metres, as authored): python3 -I bbox.py <file>…  (glTF/GLB, node transforms ignored)
import json, struct, sys
for p in sys.argv[1:]:
    if p.endswith('.glb'):
        b = open(p, 'rb').read(); ln = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + ln])
    else:
        g = json.load(open(p))
    lo, hi = [9e9] * 3, [-9e9] * 3
    for m in g.get('meshes', []):
        for pr in m['primitives']:
            a = g['accessors'][pr['attributes']['POSITION']]
            lo = [min(x, y) for x, y in zip(lo, a['min'])]; hi = [max(x, y) for x, y in zip(hi, a['max'])]
    print(p.split('/')[-1], 'size', [round(h - l, 2) for l, h in zip(lo, hi)], 'min', [round(v, 2) for v in lo])
