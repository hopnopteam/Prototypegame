# Poly Haven textures: 1k diffuse (and normal) jpg into out/<id>_diff.jpg.
import json, sys, os, urllib.request
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'NightExpressAssetHunt/1.0')]; urllib.request.install_opener(op)
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
for aid in sys.argv[2:]:
    d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{aid}'))
    for k, tag in [('Diffuse', 'diff'), ('nor_gl', 'nor')]:
        if k in d:
            urllib.request.urlretrieve(d[k]['1k']['jpg']['url'], os.path.join(out, f'{aid}_{tag}_1k.jpg'))
    print(aid)
