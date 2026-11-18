# Copies every candidate model the Station Picks 2 page shows (with its .bin, textures, .mtl) and each pack's licence into
# assets/models/candidates-station-2/<pack>/. python3 -I collect.py <scratch dir> <repo dir>
import json, os, re, shutil, struct, sys, urllib.parse
S, R = sys.argv[1], sys.argv[2]
cat = json.load(open(f'{S}/catalog.json'))
X = os.path.join(S, 'x')
OUT = os.path.join(R, 'assets/models/candidates-station-2')
done = set()
def copy(p):
    if p in done or not os.path.exists(p): return
    done.add(p)
    rel = os.path.relpath(os.path.realpath(p), os.path.realpath(X))
    d = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copy2(p, d)
    if d.lower().endswith(('.png', '.jpg', '.jpeg')):
        # Textures shrunk to 512 px (the base colour is all the stage reads; the models' UVs are unchanged).
        from PIL import Image
        im = Image.open(d)
        if max(im.size) > 512:
            im.thumbnail((512, 512), Image.LANCZOS)
            im.save(d)
def deps(p):
    base = os.path.dirname(p)
    uris = []
    if p.endswith('.gltf'):
        g = json.load(open(p))
        uris = [b.get('uri') for b in g.get('buffers', [])] + [i.get('uri') for i in g.get('images', [])]
    elif p.endswith('.glb'):
        b = open(p, 'rb').read(); ln = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + ln])
        uris = [i.get('uri') for i in g.get('images', [])]
    elif p.endswith('.obj'):
        m = p[:-4] + '.mtl'
        if os.path.exists(m):
            copy(m)
            uris = re.findall(r'map_\w+\s+(.+)', open(m, errors='ignore').read())
    for u in uris:
        if u and not u.startswith('data:'): copy(os.path.normpath(os.path.join(base, urllib.parse.unquote(u.strip()))))
for o in cat['options']:
    for f in o['files']:
        p = os.path.join(S, 'www', urllib.parse.unquote(f))
        copy(p); deps(p)
packs = {o for opt in cat['options'] for o in opt['packs']}
for k in packs:
    root = os.path.join(X, cat['packs'][k][3])
    for dp, _, fs in os.walk(root):
        for f in fs:
            if re.match(r'licen[sc]e', f, re.I): copy(os.path.join(dp, f))
print(len(done), 'files')
