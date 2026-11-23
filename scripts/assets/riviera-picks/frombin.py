# python3 -I frombin.py <scratch> <repo>: dumps the additions from the baked models.bin into <scratch>/final2/<sheet>/<id>.json,
# and their stats (tris, bytes, size) into <scratch>/tools/stats2.json
import base64, json, os, struct, sys
S, REPO = sys.argv[1], sys.argv[2]
exec(open(os.path.join(S, 'tools/adds.py')).read())
t = open(os.path.join(REPO, 'src/world/models/modelIndex.ts')).read()
idx = json.loads(t.split('export const MODEL_INDEX = ')[1].split(' as const')[0])
tot = t.split('MODEL_TOTALS = ')[1].split(';')[0]
V = int(tot.split('vertices:')[1].split(',')[0]); NI = int(tot.split('indices:')[1].split('}')[0])
raw = open(os.path.join(REPO, 'assets/models/models.bin'), 'rb').read()
P = struct.unpack_from(f'<{V * 3}f', raw, 0); o = V * 12
N = struct.unpack_from(f'<{V * 3}b', raw, o); o += V * 3
C = raw[o:o + V * 3]; o += V * 3; o += o % 2
I = struct.unpack_from(f'<{NI}H', raw, o)
SHEETS = {'extra-1-coast-station': ['1-coast', '2-station'], 'extra-2-kids-spa': ['3-kids', '4-spa'], 'extra-3-pool-food': ['5-pool', '6-food']}
stats = {}
for sheet, cats in SHEETS.items():
    d = os.path.join(S, 'final2', sheet); os.makedirs(d, exist_ok=True)
    for cat in cats:
        for k in ADDS[cat]:
            e = idx[k]; v0, n = e['vertex'], e['vertices']
            ii = I[e['index']:e['index'] + e['indices']]
            stats[k] = {'tris': e['indices'] // 3, 'bytes': n * 18 + e['indices'] * 2, 'cat': cat,
                        'size': [round(h - l, 2) for l, h in zip(e['min'], e['max'])]}
            json.dump({'label': k, 'src': '', 'tris': e['indices'] // 3, 'size': [round(h - l, 3) for l, h in zip(e['min'], e['max'])],
                       'p': base64.b64encode(struct.pack(f'<{n * 3}f', *P[v0 * 3:(v0 + n) * 3])).decode(),
                       'n': base64.b64encode(struct.pack(f'<{n * 3}f', *[x / 127 for x in N[v0 * 3:(v0 + n) * 3]])).decode(),
                       'c': base64.b64encode(bytes(C[v0 * 3:(v0 + n) * 3])).decode(),
                       'i': base64.b64encode(struct.pack(f'<{len(ii)}I', *ii)).decode()}, open(os.path.join(d, k + '.json'), 'w'))
json.dump(stats, open(os.path.join(S, 'tools/stats2.json'), 'w'), indent=0)
print(len(stats), 'models', sum(v['bytes'] for v in stats.values()), 'bytes', sum(v['tris'] for v in stats.values()), 'tris')
