# Builds the Station Picks 2 page (page/index.html + page/img) from catalog.json and the crops. python3 -I page.py <scratch dir>
import html, json, os, struct, sys, urllib.parse
S = sys.argv[1]
cat = json.load(open(f'{S}/catalog.json'))
E = html.escape
OPTS = {o['id']: o for o in cat['options']}

def tris_of(rel):
    p = os.path.join(S, 'www', urllib.parse.unquote(rel))
    try:
        if p.endswith('.obj'):
            n = 0
            for line in open(p, errors='ignore'):
                if line.startswith('f '): n += max(1, len(line.split()) - 3)
            return n
        if p.endswith('.glb'):
            b = open(p, 'rb').read()
            ln = struct.unpack('<I', b[12:16])[0]
            g = json.loads(b[20:20 + ln])
        else:
            g = json.load(open(p))
        n = 0
        for m in g.get('meshes', []):
            for pr in m['primitives']:
                acc = g['accessors'][pr['indices']] if 'indices' in pr else g['accessors'][pr['attributes']['POSITION']]
                n += acc['count'] // 3
        return n
    except Exception:
        return 0

def tri(o):
    n = sum(tris_of(f) for f in o['files'])
    return f'{n:,}' if n else 'n/a'

def src(o):
    out = []
    for name, url, lic in o['lic']:
        out.append(f'<a href="{E(url)}" target="_blank" rel="noopener">{E(name)}</a>')
    return ' + '.join(dict.fromkeys(out))

def card(o):
    star = '<span class="pill rec">Recommended</span>' if o['rec'] else ''
    lic = ', '.join(sorted({l[2] for l in o['lic']}))
    return f'''<article class="opt" id="{o['id']}"><img src="img/{o['id']}.jpg" alt="{E(o['name'])}, rendered on the platform at night" loading="lazy" width="800" height="600">
<div class="meta"><h4><span class="oid">{o['id']}</span> {E(o['name'])} {star}</h4><p>{E(o['why'])}</p>
<dl><dt>Source</dt><dd>{src(o)}</dd><dt>Licence</dt><dd>{E(lic)}</dd><dt>Triangles</dt><dd>{tri(o)}</dd></dl></div></article>'''

def today(e):
    if not e['today'] or not os.path.exists(f'{S}/page/img/today_{e["key"]}.jpg'):
        return ''
    return f'''<article class="opt today"><img src="img/today_{e['key']}.jpg" alt="Today's {E(e['name'].lower())} in the game" loading="lazy" width="800" height="600">
<div class="meta"><h4><span class="oid now">Now</span> In the game today</h4><p>Drawn in code today (<code>PlatformView.ts</code>, <code>ExteriorView.ts</code>), shown for comparison.</p></div></article>'''

def element(e, i):
    opts = [OPTS[k] for k in e['options']]
    note = f'<p class="enote">{E(e["note"])}</p>' if e['note'] else ''
    body = today(e) + ''.join(card(o) for o in opts)
    if not opts:
        body += '<article class="opt empty"><div class="meta"><h4>No free stylised candidate</h4><p>See “Not found” at the end of the page.</p></div></article>'
    rec = [o['id'] for o in opts if o['rec']]
    tag = f'<span class="pick">Pick: {", ".join(rec)}</span>' if rec else '<span class="pick none">Keep ours</span>'
    return f'''<section class="el" id="el-{e['key']}" aria-labelledby="h-{e['key']}"><h3 id="h-{e['key']}">{E(e['name'])} {tag}</h3>{note}<div class="grid">{body}</div></section>'''

GROUPS = []
for e in cat['elements']:
    if not GROUPS or GROUPS[-1][0] != e['group']: GROUPS.append((e['group'], []))
    GROUPS[-1][1].append(e['key'])
ELS = {e['key']: e for e in cat['elements']}
covered = {k for _, ks in GROUPS for k in ks}
assert covered == set(ELS), set(ELS) ^ covered

toc = ''.join(f'<li><a href="#g{i}">{E(g)}</a></li>' for i, (g, _) in enumerate(GROUPS))
sections = ''.join(f'<section class="grp" id="g{i}" aria-labelledby="gh{i}"><h2 id="gh{i}">{E(g)}</h2>{"".join(element(ELS[k], i) for k in ks)}</section>' for i, (g, ks) in enumerate(GROUPS))
recs = [(ELS[k]['name'], [o for o in ELS[k]['options'] if OPTS[o]['rec']]) for _, ks in GROUPS for k in ks]
rec_rows = ''.join(f'<tr><th scope="row"><a href="#el-{k}">{E(n)}</a></th><td>{", ".join(f"<a class=chip href=#{r}>{r}</a>" for r in rs) or "<span class=dim>keep ours</span>"}</td></tr>' for (n, rs), k in zip(recs, [k for _, ks in GROUPS for k in ks]))

X = [
 ('X1', 'Tiny Treats Bakery Building', '$7.95', 'https://tinytreats.itch.io/bakery-building', 'bakery-building', 2, 'Isa Lousberg\'s modular shop buildings: two-storey shopfronts with big windows and signs, striped awnings in four colours, market umbrellas, a little food cart with an umbrella, crates of bread, chalkboards, a street lamp. The same Tiny Treats style as the café car and the free pieces above. It is the one pack that would give a proper shopfront for the booking office, the bakery and the fruit seller, and a real food cart. Recommended if one pack is bought.', True),
]
xs = ''.join(f'''<article class="x" id="{x[0]}"><div class="xi">{''.join(f'<img src="img/X_{x[4]}_{n}.jpg" alt="{E(x[1])}, store picture {n + 1}" loading="lazy">' for n in range(x[5]) if os.path.exists(f'{S}/page/img/X_{x[4]}_{n}.jpg'))}</div>
<div class="meta"><h4><span class="oid">{x[0]}</span> {E(x[1])} <span class="pill price">{x[2]}</span> {'<span class="pill rec">Recommended buy</span>' if x[7] else ''}</h4><p>{E(x[6])}</p><p class="ref">Store pictures by the author, from <a href="{x[3]}" target="_blank" rel="noopener">{x[3].replace('https://', '')}</a>. Not bought.</p></div></article>''' for x in X)

n_opts = len(cat['options'])
page = f'''<title>Station Picks 2</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: the night-train catalogue of the earlier picks pages. Summary table, then every element as a row of option cards. One deliberate dark look (the game's night). */
:root {{
  --night: #121629; --carriage: #1B2140; --panel: #232A4F; --line: #343D6B;
  --ink: #EEE7D8; --dim: #AEB0C8; --gold: #D9B45E; --green: #2F5D45; --mint: #DDF3E5; --claret: #8E2A40;
  --display: 'Fraunces', Georgia, 'Times New Roman', serif; --body: 'Nunito Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color-scheme: dark;
}}
body {{ background: var(--night); color: var(--ink); font: 15px/1.55 var(--body); }}
.wrap {{ max-width: 1180px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 64px; display: grid; gap: 44px; }}
h1, h2, h3, h4 {{ font-family: var(--display); text-wrap: balance; margin: 0; }}
h1 {{ font-size: clamp(32px, 5vw, 48px); font-weight: 700; color: var(--gold); line-height: 1.1; }}
h2 {{ font-size: 27px; font-weight: 700; }}
h3 {{ font-size: 20px; color: var(--gold); display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }}
h4 {{ font-size: 17px; font-weight: 600; line-height: 1.3; }}
p {{ margin: 0; max-width: 70ch; }}
a {{ color: var(--gold); }}
a:focus-visible, .chip:focus-visible {{ outline: 2px solid var(--gold); outline-offset: 2px; }}
code {{ font-size: 13px; color: var(--ink); }}
header {{ display: grid; gap: 14px; }}
.lede {{ color: var(--dim); font-size: 16px; }}
nav ul {{ list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }}
.chip, nav a {{ font: 700 12px var(--body); text-decoration: none; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; display: inline-block; }}
section {{ display: grid; gap: 18px; }}
.grp {{ gap: 34px; }}
.grp > h2 {{ border-bottom: 1px solid var(--line); padding-bottom: 8px; }}
.el {{ gap: 12px; }}
.enote {{ color: var(--dim); font-size: 14px; }}
.pick {{ font: 700 11px var(--body); letter-spacing: .08em; text-transform: uppercase; background: var(--green); color: var(--mint); border-radius: 99px; padding: 3px 9px; }}
.pick.none {{ background: var(--panel); color: var(--dim); }}
.oid {{ font: 700 12px var(--body); letter-spacing: .08em; color: var(--night); background: var(--gold); border-radius: 4px; padding: 2px 6px; vertical-align: 2px; }}
.oid.now {{ background: var(--dim); }}
.pill {{ font: 700 11px var(--body); letter-spacing: .08em; text-transform: uppercase; border-radius: 99px; padding: 2px 8px; vertical-align: 2px; white-space: nowrap; }}
.pill.rec {{ background: var(--green); color: var(--mint); }}
.pill.price {{ background: var(--claret); color: #FBEDEF; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
.opt, .x {{ background: var(--carriage); border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; min-width: 0; }}
.opt.today {{ background: transparent; border: 1px dashed var(--line); }}
.opt.empty {{ grid-template-rows: 1fr; border: 1px dashed var(--line); background: transparent; }}
.opt img {{ width: 100%; height: auto; display: block; aspect-ratio: 4 / 3; object-fit: cover; }}
.meta {{ padding: 14px 16px 18px; display: grid; gap: 8px; align-content: start; min-width: 0; }}
.meta p {{ color: var(--dim); font-size: 14px; }}
.ref {{ font-size: 13px; color: var(--dim); font-style: italic; }}
dl {{ margin: 4px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 13px; }}
dt {{ color: var(--dim); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; padding-top: 2px; }}
dd {{ margin: 0; font-variant-numeric: tabular-nums; min-width: 0; overflow-wrap: anywhere; }}
.box {{ background: var(--carriage); border: 1px solid var(--line); border-radius: 14px; padding: 22px; display: grid; gap: 16px; }}
.tablewrap {{ overflow-x: auto; }}
.rect tbody {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); column-gap: 28px; }}
.rect tr {{ display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); }}
.rect th, .rect td {{ border: 0; white-space: normal; }} .rect td {{ text-align: right; flex: none; }}
table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
th, td {{ text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }}
th {{ font-weight: 600; white-space: nowrap; }} th a {{ color: var(--ink); text-decoration: none; }}
td .chip {{ margin: 0 4px 4px 0; }}
.dim {{ color: var(--dim); }}
.cols {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px; }}
.cols > div {{ display: grid; gap: 8px; align-content: start; min-width: 0; }}
.cols ul {{ margin: 0; padding-left: 18px; display: grid; gap: 4px; color: var(--dim); font-size: 14px; }}
.cols li strong {{ color: var(--ink); }}
.plan {{ overflow-x: auto; background: var(--carriage); border-radius: 12px; padding: 12px; }}
.plan svg {{ display: block; min-width: 900px; width: 100%; height: auto; }}
.xi {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 2px; background: var(--night); }}
.xi img {{ width: 100%; height: auto; display: block; }}
.note {{ background: var(--panel); border-radius: 12px; padding: 16px 18px; display: grid; gap: 8px; color: var(--dim); font-size: 14px; }}
.note strong {{ color: var(--ink); }}
@media (prefers-reduced-motion: no-preference) {{ .chip:hover, nav a:hover {{ filter: brightness(1.15); }} }}
</style>
<div class="wrap">
<header>
  <h1>Station Picks 2</h1>
  <p class="lede">The second round for the station, after the owner's notes on the first: a ticket office that is clearly a level-up, a fruit kiosk that looks like nothing else, shops that make the platform lived-in, a Train Works for buying train upgrades, the conductor's serving tray, the train's outside dressing and a little life for the townsfolk. {n_opts} candidates, all free and CC0, from the families already in Night Express: Tiny Treats and KayKit (Isa and Kay Lousberg), Kenney and Quaternius. Nothing medieval: no stone pillars, spiked railings, barrels, fantasy carts or produce crates.</p>
  <p class="lede">Each picture is the game's own night stage and camera on the real platform (the session 55 station), beside the café car; every piece is baked to vertex colours and recoloured the way the game does it. A dashed “Now” card shows how the game draws the piece today, where it exists. Pick by code (T1, T2…). Nothing has been changed in the game.</p>
  <nav aria-label="Sections"><ul><li><a href="#rec">Recommended set</a></li>{toc}<li><a href="#paid">Paid packs</a></li><li><a href="#notes">Not found</a></li></ul></nav>
</header>

<section class="box" id="rec" aria-labelledby="rech">
  <h2 id="rech">Recommended set</h2>
  <p class="dim">One look: Tiny Treats for everything built and served (the booking office from its bakery walls, the counters, the trays, the baskets and flowers), Kenney for the shop fittings (fruit and flower stands, the freezer, the sack truck, the workbench) and KayKit for the market umbrellas, lanterns and the shoeshine chair. Navy, cream and brass stay the station's colours; the umbrellas stand at the back of each pitch so the goods stay in view from the 48° camera.</p>
  <div class="tablewrap"><table class="rect"><tbody>{rec_rows}</tbody></table></div>
</section>

{sections}

<section id="paid" aria-labelledby="paidh">
  <h2 id="paidh">Paid packs <span class="dim" style="font: 600 14px var(--body)">shown, not bought</span></h2>
  <div class="grid">{xs}</div>
</section>

<section id="notes" aria-labelledby="notesh">
  <h2 id="notesh">Not found, and what was left out</h2>
  <div class="note">
    <p><strong>Not in any free stylised pack:</strong> a pram, a bicycle, a cat in our style, a station name board (the shop signs are blank boards or modern lettering), a booking office or shopfront as one piece (only in the paid X1). The booking offices here are built from Tiny Treats' bakery wall panels, a counter and floor tiles laid as a flat roof.</p>
    <p><strong>Screened:</strong> 29 packs. KayKit City Builder, Holiday, Restaurant, Resource, Furniture and Mixed Bags 1 and 2; Tiny Treats Pretty Park, Homely House, Fun Playground, Bakery Interior, Baked Goods, Pleasant Picnic and Charming Kitchen (Playful Bedroom and Bakery Building are paid); Quaternius Downtown City (Standard) and Farm Animals; Kenney Coaster, Mini Shop, City Kit Commercial and Suburban, Cube Pets, Holiday, Fantasy Town, Car, Retro Urban, Train, Food, Furniture and Survival kits. Every licence file was read: CC0 throughout (Quaternius' Farm Animals has no licence file; its itch page states CC0).</p>
    <p><strong>Left out:</strong> the owner's medieval list (Kenney Fantasy Town's wooden carts, stalls and stone pieces, barrels, chests, KayKit's produce crates); the Kenney coaster-park food and donut booths (a giant hot dog or donut on the roof); Kenney's log-cabin pieces (alpine, and its roof slopes would not join cleanly); the shopping trolley and Downtown City's brick facades (urban, painted textures); Kenney's cube cat (blocky).</p>
    <p><strong>Rendering:</strong> the candidates stand in an open stretch of the walkway beside the café car; the train's outside pieces are hung on the café car's platform-side wall. Patterned textures (the picnic blanket's plaid) keep their own material.</p>
  </div>
</section>
</div>
'''
open(f'{S}/page/index.html', 'w').write(page)
print(len(page), 'bytes')
