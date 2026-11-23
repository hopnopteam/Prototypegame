# python3 -I prevbake.py <scratch> <repo>: bakes every candidate like the game does, into prev/<cat>/<label>.json
import sys, os, json, base64, struct, importlib.util, glob, traceback
S, REPO = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('bm', os.path.join(REPO, 'scripts/assets/bake_models.py'))
bm = importlib.util.module_from_spec(spec); spec.loader.exec_module(bm)
exec(open(os.path.join(S, 'tools/cands.py')).read())
only = sys.argv[3:] or list(CANDS)
for cat in only:
    out = os.path.join(S, 'prev', cat); os.makedirs(out, exist_ok=True)
    for pack, name, extra in CANDS[cat]:
        hits = [p for p in glob.glob(os.path.join(S, 'dl', pack, '**', name), recursive=True)]
        if not hits: print('MISSING', pack, name); continue
        hits.sort(key=lambda p: ('glb' not in p.lower() and 'gltf' not in p.lower(), len(p)))
        label = extra.get('label') or (pack.split('-', 1)[1][:6] + '_' + os.path.splitext(name)[0])
        sp = {'src': hits[0], **{k: v for k, v in extra.items() if k != 'label'}}
        try:
            P, Nn, C, I = bm.bake(sp)
        except Exception as e:
            print('FAIL', label, e); continue
        lo, hi, top, tall = bm.measure(P)
        d = {'label': label, 'src': os.path.relpath(hits[0], os.path.join(S, 'dl')), 'tris': len(I) // 3, 'verts': len(P),
             'size': [round(h - l, 3) for l, h in zip(lo, hi)],
             'p': base64.b64encode(struct.pack(f'<{len(P)*3}f', *[c for p in P for c in p])).decode(),
             'n': base64.b64encode(struct.pack(f'<{len(Nn)*3}f', *[c for p in Nn for c in p])).decode(),
             'c': base64.b64encode(bytes([c for col in C for c in col])).decode(),
             'i': base64.b64encode(struct.pack(f'<{len(I)}I', *I)).decode()}
        json.dump(d, open(os.path.join(out, label + '.json'), 'w'))
        print(f'{cat:12} {label:34} {len(I)//3:6} tris {d["size"]}')
