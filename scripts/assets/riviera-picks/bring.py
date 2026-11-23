# python3 -I bring.py <scratch> <repo>: copies the additions' sources (and what they reference, and their pack's
# licence) from the local branch riviera-mine into the working tree; reports clashes, then appends MODELS entries.
import json, os, re, struct, subprocess, sys
S, REPO = sys.argv[1], sys.argv[2]
exec(open(os.path.join(S, 'tools/adds.py')).read())
os.chdir(REPO)
SRC = 'assets/models/src/'


def mine(path):
    return subprocess.run(['git', 'show', f'riviera-mine:{path}'], capture_output=True, check=True).stdout


def deps(path, data):
    if path.endswith('.glb'):
        ln = struct.unpack_from('<I', data, 12)[0]
        g = json.loads(data[20:20 + ln])
    elif path.endswith('.gltf'):
        g = json.loads(data)
    else:
        return [l.split(None, 1)[1].strip() for l in data.decode(errors='replace').splitlines() if l.startswith('mtllib')]
    return [b['uri'] for b in g.get('buffers', []) if 'uri' in b and not b['uri'].startswith('data:')] + \
           [i['uri'] for i in g.get('images', []) if 'uri' in i]


index = open('src/world/models/modelIndex.ts').read()
clash = [k for c in ADDS.values() for k in c if re.search(r'"%s"\s*:' % k, index)]
if clash:
    raise SystemExit(f'name clash: {clash}')
todo, copied, differ = [], [], []
for cat in ADDS.values():
    for k, (src, extra) in cat.items():
        todo.append(SRC + src)
        if extra and 'maps' in extra:
            todo += [os.path.join(SRC, os.path.dirname(src), v) for v in extra['maps'].values()]
seen = set()
while todo:
    p = os.path.normpath(todo.pop())
    if p in seen:
        continue
    seen.add(p)
    try:
        data = mine(p)
    except subprocess.CalledProcessError:
        if p.endswith('License.txt') and os.path.exists(p):
            continue
        raise
    if p.endswith(('.gltf', '.glb', '.obj')):
        todo += [os.path.join(os.path.dirname(p), d) for d in deps(p, data)]
    lic = SRC + p[len(SRC):].split('/')[0] + '/License.txt'
    if lic not in seen:
        todo.append(lic)
    if os.path.exists(p):
        if open(p, 'rb').read() != data:
            differ.append(p)
        continue
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'wb').write(data)
    copied.append(p)
print('copied', len(copied), 'files; already present but different:', differ)

TITLES = {'1-coast': 'Coast scenery', '2-station': 'Station', '3-kids': "Kids' Play Car", '4-spa': 'Spa Car', '5-pool': 'Pool Car',
          '6-food': 'Ice-cream bar'}
lines = ['    # Route 2, second pass (docs/riviera-assets/README.md, "Second pass"): what the first pass had no model for.',
         '    # d1mee Free Low Poly Summer Pack (free licence, see its License.txt); loafbrr_1 Inflatables and plaggy Pool Ladder',
         '    # (CC0, OpenGameArt; the inflatables ship as one file, so each piece names its node and its atlas); Tiny Treats',
         '    # Bubbly Bathroom 1.1 in its own folder (its atlas differs from 1.0); the rest from kits already in use (CC0).']
for cat, models in ADDS.items():
    lines.append(f'    # {TITLES[cat]}')
    for k, (src, extra) in models.items():
        lines.append(f"    '{k}': " + (repr({'src': src, **extra}) if extra else repr(src)) + ',')
p = 'scripts/assets/bake_models.py'
s = open(p).read()
anchor = "    'present': \"kaykit-holiday/present_A_red.gltf\",\n"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + '\n'.join(lines) + '\n')
open(p, 'w').write(s)
print('added', sum(len(c) for c in ADDS.values()), 'entries')
