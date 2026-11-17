# Builds the "Royal Suite Picks" page from the catalogue, the renders and the layout specs.
import json, os, html
from PIL import Image
H = '/tmp/claude-0/hunt'
OUT = H + '/page'; IMG = OUT + '/img'
os.makedirs(IMG, exist_ok=True)
exec(open(H + '/gen/catalog.py').read().split("cat = {")[0])
tris = json.load(open(H + '/out/tris.json'))
rugs = json.load(open(H + '/gen/rugs.json'))
lay = json.load(open(H + '/gen/layouts.json'))

def jpg(name, src, crop=(0.06, 0.0, 0.94, 1.0), w=520):
    im = Image.open(src).convert('RGB'); W_, H_ = im.size
    im = im.crop((int(W_ * crop[0]), int(H_ * crop[1]), int(W_ * crop[2]), int(H_ * crop[3])))
    im.thumbnail((w, 2000)); im.save(f'{IMG}/{name}.jpg', quality=80)
    return f'img/{name}.jpg'

def tri_of(url):
    t = tris.get(url)
    return f'{t:,}' if t else '—'

esc = html.escape
cards = {'royal': [], 'first': []}
for grp, items in (('royal', ROYAL), ('first', FIRST)):
    for (i, name, url, fit, rot, src, link, why, style) in items:
        img = jpg(i, f'{H}/out/{i}.png', crop=(0.14, 0.12, 0.86, 0.72), w=420)
        t = tris.get(url, 0)
        heavy = t > 5000
        cards[grp].append(f'''<article class="pick" id="{i}"><img src="{img}" alt="{esc(name)} rendered in the suite" loading="lazy" width="420" height="390">
<div class="pick-body"><div class="pick-head"><span class="code">{i}</span><h4>{esc(name)}</h4></div>
<p>{esc(why)}</p>
<dl><div><dt>Source</dt><dd><a href="{link}" target="_blank" rel="noopener">{esc(src)}</a></dd></div><div><dt>Licence</dt><dd>CC0</dd></div><div><dt>Triangles</dt><dd class="{'warn' if heavy else ''}">{tri_of(url)}{' · over 5k' if heavy else ''}</dd></div><div><dt>Look</dt><dd>{'Realistic PBR scan' if style == 'real' else 'Stylised low-poly'}</dd></div></dl></div></article>''')

rugcards = []
for gid, m in rugs.items():
    img = jpg(gid, f'{H}/out/{gid}.png', crop=(0.1, 0.1, 0.9, 0.85), w=420)
    rugcards.append(f'''<article class="pick" id="{gid}"><img src="{img}" alt="{esc(m['name'])}" loading="lazy" width="420" height="460">
<div class="pick-body"><div class="pick-head"><span class="code">{gid}</span><h4>{esc(m['name'])}</h4></div>
<p>{esc(m['src'])}. Shown in {'the Royal Suite' if m['tier'] == 5 else 'First Class'}.</p>
<dl><div><dt>Source</dt><dd><a href="https://polyhaven.com/textures" target="_blank" rel="noopener">{'Poly Haven' if gid != 'G17' else 'Quaternius, KayKit, Kenney'}</a></dd></div><div><dt>Licence</dt><dd>CC0</dd></div><div><dt>Cost</dt><dd>{'1 detail layer' if gid != 'G17' else 'models, ~100 tris'}</dd></div></dl></div></article>''')

# Top-down plans from the layout specs.
specs = {k: json.load(open(f'{H}/www/specs/{k}.json')) for k in lay}
url2id = {}
for items in (ROYAL, FIRST):
    for it in items: url2id.setdefault(it[2], it[0])
EXTRA = {'dl/kk-furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/lamp_table.gltf': 'lamp', 'repo/tinytreats-picnic/wine_bottle.gltf': 'F15', 'repo/tinytreats-picnic/wine_glass.gltf': ''}
def plan(lid):
    s = specs[lid]; X0, X1, Z0, Z1 = -0.6, 2.34, 2.16, 9.21
    sc = 46; pad = 18
    # Drawn with the room's length across the page: z → svg x, x → svg y (window wall at the bottom).
    w = (Z1 - Z0) * sc + 2 * pad; h = (X1 - X0) * sc + 2 * pad + 18
    X = lambda z: pad + (z - Z0) * sc
    Y = lambda x: pad + (x - X0) * sc
    out = [f'<svg viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="Top-down plan of {lid}">',
           f'<rect x="{X(Z0):.1f}" y="{Y(X0):.1f}" width="{(Z1-Z0)*sc:.1f}" height="{(X1-X0)*sc:.1f}" class="room"/>',
           f'<rect x="{X(4.985):.1f}" y="{Y(X0)-5:.1f}" width="{1.4*sc:.1f}" height="10" class="door"/>',
           f'<circle cx="{X(5.685):.1f}" cy="{Y(0.0):.1f}" r="{0.55*sc:.1f}" class="clear"/>',
           f'<text x="{X(5.685):.1f}" y="{Y(0.0)+4:.1f}" class="lbl dim">tidy spot</text>',
           f'<text x="{X(5.685):.1f}" y="{Y(X0)-8:.1f}" class="lbl dim">door · corridor</text>',
           f'<text x="{X((Z0+Z1)/2):.1f}" y="{Y(X1)+15:.1f}" class="lbl dim">window wall (camera side)</text>',
           f'<text x="{X(Z0)+3:.1f}" y="{Y((X0+X1)/2):.1f}" class="lbl dim" transform="rotate(-90 {X(Z0)+9:.1f} {Y((X0+X1)/2):.1f})">front</text>']
    for r in s.get('rugs', []):
        if 'tex' in r and r.get('w', 0) > 0.5:
            out.append(f'<rect x="{X(r["z"]-r["d"]/2):.1f}" y="{Y(r["x"]-r["w"]/2):.1f}" width="{r["d"]*sc:.1f}" height="{r["w"]*sc:.1f}" rx="{12 if r.get("round") else 2}" class="rug"/>')
    for m in s['models']:
        if m.get('on'): continue
        fw, fd = m['fit']
        code = url2id.get(m['url'], EXTRA.get(m['url'], ''))
        out.append(f'<rect x="{X(m["z"]-fd/2):.1f}" y="{Y(m["x"]-fw/2):.1f}" width="{fd*sc:.1f}" height="{fw*sc:.1f}" rx="3" class="piece"/>')
        out.append(f'<text x="{X(m["z"]):.1f}" y="{Y(m["x"])+4:.1f}" class="lbl">{code}</text>')
    out.append('</svg>')
    return '\n'.join(out)

laycards = {'royal': [], 'first': []}
for lid, m in lay.items():
    a = jpg(lid, f'{H}/out/{lid}.png', w=560)
    b = jpg(lid + 'c', f'{H}/out/{lid}c.png', crop=(0.06, 0.0, 0.94, 0.62), w=560)
    used = sorted({url2id[u] for u in m['models'] if u in url2id}, key=lambda c: (c[0], int(c[1:])))
    laycards[m['group']].append(f'''<article class="layout" id="{lid}"><div class="pick-head"><span class="code">{lid}</span><h4>{esc(m['title'])}</h4></div>
<p>{esc(m['desc'])}</p><p class="uses">Uses {', '.join(used)}</p>
<div class="layout-shots"><img src="{a}" alt="{esc(m['title'])}, whole suite" loading="lazy"><img src="{b}" alt="{esc(m['title'])}, closer" loading="lazy"></div>
<figure class="plan">{plan(lid)}<figcaption>Plan, front of the carriage on the left. Grey dashes: the doorway and the tidy spot, kept clear.</figcaption></figure></article>''')

PAL = [
 ('P1', 'royal', 'Crown Claret', 'Claret walls over walnut panelling, ivory upholstery, a claret velvet bed, gold damask, antique gold metal. Warm and regal, and nothing like First Class\'s blue.', [('Walls', '#5A1424'), ('Panelling', '#3B2214'), ('Upholstery', '#EFE6D2'), ('Bed', '#7A1E32'), ('Rug', '#D4AF5A'), ('Metal', '#C9A24A')]),
 ('P2', 'royal', 'Imperial Emerald', 'Deep emerald with walnut and champagne silk, brass fittings. Old-money library rather than palace.', [('Walls', '#123D30'), ('Panelling', '#3B2214'), ('Upholstery', '#E6D3A3'), ('Bed', '#1F5C45'), ('Rug', '#C9A24A'), ('Metal', '#B8913A')]),
 ('P3', 'royal', 'Rose Palace', 'Dusty rose over cream panelling, blush silk, ivory fleece and gold. Light and romantic; reads well at night.', [('Walls', '#B76E79'), ('Panelling', '#F2E6D0'), ('Upholstery', '#E8C4C4'), ('Bed', '#C98C95'), ('Rug', '#FBF4E6'), ('Metal', '#D4AF37')]),
 ('P4', 'royal', 'Black Lacquer and Gold', 'Ebony lacquer, red silk, ivory and bright gold, after the lacquered screen (R10). The most dramatic.', [('Walls', '#1A1414'), ('Panelling', '#2B1E1A'), ('Upholstery', '#EFE6D2'), ('Bed', '#8E1B1B'), ('Rug', '#5A1424'), ('Metal', '#D4AF37')]),
 ('P5', 'first', 'Sapphire Pullman', 'Ivory over polished mahogany, sapphire velvet, a champagne carpet and brass: today\'s First Class, made consistent.', [('Walls', '#F1EADB'), ('Panelling', '#5C2E21'), ('Upholstery', '#1F3A7A'), ('Bed', '#2A4A92'), ('Rug', '#E3D3AE'), ('Metal', '#B8913A')]),
 ('P6', 'first', 'Art Deco Teal', 'Cream walls, teal velvet, black lacquer and champagne gold: a 1930s Pullman.', [('Walls', '#F0E8D8'), ('Panelling', '#1A1A1A'), ('Upholstery', '#1F5E66'), ('Bed', '#2B7480'), ('Rug', '#E3D3AE'), ('Metal', '#C8A962')]),
 ('P7', 'first', 'Pullman Green', 'Racing green panels, tan leather, cream linen and brass. Clubby and calm.', [('Walls', '#E8DFC9'), ('Panelling', '#2E4A33'), ('Upholstery', '#A8703F'), ('Bed', '#F2EBDC'), ('Rug', '#6E7F55'), ('Metal', '#B8913A')]),
 ('P8', 'first', 'Champagne and Dove', 'Dove grey, champagne and navy piping with silver: the quietest, most modern option.', [('Walls', '#D9D4CB'), ('Panelling', '#8C857A'), ('Upholstery', '#E3D3AE'), ('Bed', '#1E2A4A'), ('Rug', '#EDE6D8'), ('Metal', '#B9BCC2')]),
]
palcards = {'royal': [], 'first': []}
for pid, grp, name, desc, sw in PAL:
    chips = ''.join(f'<li><span class="chip" style="--c:{c}"></span><span class="sw-n">{n}</span><span class="sw-h">{c}</span></li>' for n, c in sw)
    room = f'''<div class="mini" style="--wall:{sw[0][1]};--panel:{sw[1][1]};--up:{sw[2][1]};--bed:{sw[3][1]};--rug:{sw[4][1]};--metal:{sw[5][1]}"><div class="m-wall"></div><div class="m-panel"></div><div class="m-floor"><div class="m-rug"></div><div class="m-bed"><div class="m-pillow"></div></div><div class="m-chair"></div></div></div>'''
    palcards[grp].append(f'<article class="pal" id="{pid}"><div class="pick-head"><span class="code">{pid}</span><h4>{esc(name)}</h4></div>{room}<p>{esc(desc)}</p><ul class="swatches">{chips}</ul></article>')

cur = [jpg('cur-royal', f'{H}/shots/cur-royal.png', w=520), jpg('cur-first', f'{H}/shots/cur-first.png', w=520), jpg('cur-royal-wide', f'{H}/shots/cur-royal-wide.png', w=520)]
paid = [jpg('paid-llr', f'{H}/paid/llr3.png', crop=(0, 0, 1, 1), w=620), jpg('paid-llr2', f'{H}/paid/llr1.png', crop=(0, 0, 1, 1), w=620)]
json.dump({'cards': cards, 'rugcards': rugcards, 'laycards': laycards, 'palcards': palcards, 'cur': cur, 'paid': paid}, open(H + '/gen/parts.json', 'w'))
print('parts ok')
