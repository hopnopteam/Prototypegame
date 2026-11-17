# Download Poly Haven models as glTF with 1k textures into out/<id>/.
import json, sys, os, urllib.request
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'NightExpressAssetHunt/1.0')]; urllib.request.install_opener(op)
out = sys.argv[1]
for aid in sys.argv[2:]:
    d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{aid}'))
    g = d['gltf']['1k']['gltf']
    base = os.path.join(out, aid); os.makedirs(base, exist_ok=True)
    urllib.request.urlretrieve(g['url'], os.path.join(base, os.path.basename(g['url'])))
    for rel, f in g['include'].items():
        p = os.path.join(base, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        urllib.request.urlretrieve(f['url'], p)
    print(aid, sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(base) for x in fs))
