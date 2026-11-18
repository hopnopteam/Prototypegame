# Builds the Station Picks page (page/index.html + page/img) from catalog.json and the crops. python3 -I page.py <scratch dir>
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
<div class="meta"><h4><span class="oid now">Now</span> In the game today</h4><p>Drawn in code (<code>PlatformView.ts</code>), shown for comparison.</p></div></article>'''

def element(e, i):
    opts = [OPTS[k] for k in e['options']]
    note = f'<p class="enote">{E(e["note"])}</p>' if e['note'] else ''
    body = today(e) + ''.join(card(o) for o in opts)
    if not opts:
        body += '<article class="opt empty"><div class="meta"><h4>No free stylised candidate</h4><p>See “Not found” at the end of the page.</p></div></article>'
    rec = [o['id'] for o in opts if o['rec']]
    tag = f'<span class="pick">Pick: {", ".join(rec)}</span>' if rec else '<span class="pick none">Keep ours</span>'
    return f'''<section class="el" id="el-{e['key']}" aria-labelledby="h-{e['key']}"><h3 id="h-{e['key']}">{E(e['name'])} {tag}</h3>{note}<div class="grid">{body}</div></section>'''

GROUPS = [
 ('Surface', ['deck']),
 ('Ticket office', ['booth', 'counter', 'shelter']),
 ('Seats, lamps and the clock', ['bench', 'lamp', 'streetlamp', 'clock']),
 ('Station house and boundaries', ['house', 'railing', 'gate', 'signs', 'notice', 'postbox']),
 ('Greenery', ['planter', 'flowers', 'hedge', 'trees']),
 ('Luggage and supplies', ['barrow', 'trolley', 'cases', 'goods', 'cart', 'scale']),
 ('Kiosk and market', ['kiosk', 'stall', 'bin']),
 ('The bell and the fair', ['bell', 'bunting', 'carpet', 'harvest']),
 ('Country life', ['sheep', 'water', 'pigeons', 'bicycles']),
 ('Extras', ['picnic', 'fountain']),
]
ELS = {e['key']: e for e in cat['elements']}
covered = {k for _, ks in GROUPS for k in ks}
assert covered == set(ELS), set(ELS) ^ covered

toc = ''.join(f'<li><a href="#g{i}">{E(g)}</a></li>' for i, (g, _) in enumerate(GROUPS))
sections = ''.join(f'<section class="grp" id="g{i}" aria-labelledby="gh{i}"><h2 id="gh{i}">{E(g)}</h2>{"".join(element(ELS[k], i) for k in ks)}</section>' for i, (g, ks) in enumerate(GROUPS))
recs = [(ELS[k]['name'], [o for o in ELS[k]['options'] if OPTS[o]['rec']]) for _, ks in GROUPS for k in ks]
rec_rows = ''.join(f'<tr><th scope="row"><a href="#el-{k}">{E(n)}</a></th><td>{", ".join(f"<a class=chip href=#{r}>{r}</a>" for r in rs) or "<span class=dim>keep ours</span>"}</td></tr>' for (n, rs), k in zip(recs, [k for _, ks in GROUPS for k in ks]))

X = [
 ('X1', 'Tiny Treats Bakery Building', '$7.95', 'https://tinytreats.itch.io/bakery-building', 'tinytreats_bakery-building', 2, 'A modular shopfront by Isa Lousberg: walls, big windows, a striped awning, doors, roof pieces and signs in exactly the Tiny Treats style we use in the café. It is the best way to a real booking office and a station house that match the train. Recommended if one pack is bought.', True),
 ('X2', 'Tiny Treats Lovely Living Room', '$7.95', 'https://tinytreats.itch.io/lovely-living-room', 'tinytreats_lovely-living-room', 3, 'Has the only grandfather clock in our style (no free stylised clock exists), plus armchairs and lamps. Worth it for the clock, and it also serves the Royal Suite (it was X1 on the Royal picks page).', False),
 ('X3', 'Quaternius Medieval Village MegaKit (Pro)', '$9.99', 'https://quaternius.itch.io/medieval-village-megakit', 'quaternius_medieval-village-megakit', 3, 'The full kit adds props the free Standard edition leaves out (more fences, crates, lanterns and building parts). Its painted textures sit a little apart from the flat-coloured KayKit and Tiny Treats pieces.', False),
 ('X4', 'KayKit City Builder Bits (Extra)', '$3.95', 'https://kaylousberg.itch.io/city-builder-bits', 'kaylousberg_city-builder-bits', 3, 'More street furniture and buildings for the free City Builder Bits. Urban in feel; only useful if the forecourt grows into a town street.', False),
]
xs = ''.join(f'''<article class="x" id="{x[0]}"><div class="xi">{''.join(f'<img src="img/X_{x[4]}_{n}.jpg" alt="{E(x[1])}, store picture {n + 1}" loading="lazy">' for n in range(x[5]) if os.path.exists(f'{S}/page/img/X_{x[4]}_{n}.jpg'))}</div>
<div class="meta"><h4><span class="oid">{x[0]}</span> {E(x[1])} <span class="pill price">{x[2]}</span> {'<span class="pill rec">Recommended buy</span>' if x[7] else ''}</h4><p>{E(x[6])}</p><p class="ref">Store pictures by the author, from <a href="{x[3]}" target="_blank" rel="noopener">{x[3].replace('https://', '')}</a>. Not bought.</p></div></article>''' for x in X)

svg = open(f'{S}/layout.svg').read()
n_opts = len(cat['options'])
page = f'''<title>Station Picks</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: the night-train catalogue of the earlier picks pages. Summary table, the proposed station plan, then every element as a row of option cards. One deliberate dark look (the game's night). */
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
  <h1>Station Picks</h1>
  <p class="lede">Every piece of the station platform, with {n_opts} stylised candidates from the families already in Night Express: KayKit and Tiny Treats (Kay and Isa Lousberg, the café, bath and park pieces), Quaternius (the beds, chairs and fireplace) and Kenney (the locomotive). All are free and CC0. Each picture is the game's own night stage and camera, on the real platform behind the train; flat-coloured pieces are baked to vertex colours and recoloured exactly as the game does it. Where the game draws the piece today, a dashed “Now” card shows it first.</p>
  <p class="lede">Pick by code (S1, S2…). Nothing has been changed in the game.</p>
  <nav aria-label="Sections"><ul><li><a href="#rec">Recommended set</a></li><li><a href="#plan">A bigger, organised station</a></li>{toc}<li><a href="#paid">Paid packs</a></li><li><a href="#notes">Not found</a></li></ul></nav>
</header>

<section class="box" id="rec" aria-labelledby="rech">
  <h2 id="rech">Recommended set</h2>
  <p class="dim">One look: Tiny Treats for everything people touch and sit on (bench, lamps, counter, bins, mailbox, flowers), KayKit for goods and the countryside (crates, barrels, trees, flags, pumpkins), Kenney Fantasy Town for the stalls, carts and stone pillars, and Quaternius for the iron railing, the water tower and the sheep. Navy and brass stay the station's colours.</p>
  <div class="tablewrap"><table class="rect"><tbody>{rec_rows}</tbody></table></div>
</section>

<section id="plan" aria-labelledby="planh">
  <h2 id="planh">A bigger, organised station</h2>
  <p class="lede">A proposed plan, top down, not to be built until the pieces are chosen. The platform grows from 6.5 m to 9 m across and is laid out in four lanes running the length of the train. Everything sits in a fixed bay with a clear footprint, so nothing is walked through and nobody's path crosses another's.</p>
  <div class="plan">{svg}</div>
  <div class="cols">
    <div><h4>The lanes, from the train out</h4><ul>
      <li><strong>Edge lane, 1.6 m.</strong> The yellow line and the queues: travellers wait along the edge at each door, walk back along it to board.</li>
      <li><strong>Service lane, 2.2 m.</strong> The conductor's work: the ticket office ahead of each door, the bell just behind it, the luggage bay (barrow, sack trolley, cases), the restock cart.</li>
      <li><strong>Walkway, 2.4 m.</strong> Always clear: latecomers and day riders walk it from the station house to the doors.</li>
      <li><strong>Back lane, 2.0 m.</strong> Against the railing: a repeating module of bench, lamp and planter every 6 m, with the newsstand, the market stall and the clock in their own bays.</li></ul></div>
    <div><h4>Why this shape</h4><ul>
      <li>The camera looks from the platform side at 48°, so tall things (lamps, the clock, the stall's awning) stand in the back lane, beyond the work, never between the camera and a job.</li>
      <li>The low shelter covers only the ticket office, and stops at counter height plus a canopy the camera sees under.</li>
      <li>Each bay repeats at the second entrance (the Family Sleeper's door): a second office and queue there, nothing new to learn.</li>
      <li>The station house stays ahead of the train behind the railing, with its gate on the walkway's line.</li></ul></div>
  </div>
</section>

{sections}

<section id="paid" aria-labelledby="paidh">
  <h2 id="paidh">Paid packs <span class="dim" style="font: 600 14px var(--body)">shown, not bought</span></h2>
  <div class="grid">{xs}</div>
</section>

<section id="notes" aria-labelledby="notesh">
  <h2 id="notesh">Not found, and what was left out</h2>
  <div class="note">
    <p><strong>Not in any free stylised pack:</strong> a station clock (only a grandfather clock, in the paid X2), a sack trolley, suitcases, bicycles, hay bales, cloth bunting and rope stanchions for the red carpet. For these today's drawn pieces stay, restyled to sit with the chosen ones, or come from X1/X2.</p>
    <p><strong>Screened:</strong> 29 packs: KayKit City Builder, Medieval Hexagon, Halloween, Holiday, Restaurant, Resource, Forest, Furniture, Prototype and Mixed Bags 1 and 2; Tiny Treats Pretty Park, Homely House, Fun Playground, Bakery Interior, Baked Goods, Pleasant Picnic and House Plants; Quaternius Fantasy Props, Medieval Village and Downtown City (free Standard editions), Farm Animals, Farm Buildings, Modular Street and Ultimate House Interior; Kenney Train, Fantasy Town, Survival, Nature, City Kit Suburban, City Kit Roads, Holiday, Food and Furniture kits. Every licence was read: CC0 throughout (the older Quaternius packs state CC0 on their pages).</p>
    <p><strong>Left out:</strong> the Halloween pieces that read as a graveyard (gravestones, crypts, carved pumpkins); KayKit City's cars, traffic lights and office blocks (urban); Quaternius Downtown's brick facades (painted textures, too detailed beside our flat colours); Kenney's road and highway signs (modern).</p>
    <p><strong>Rendering:</strong> the candidates stand in an open stretch of the real platform behind the train (the game's PlatformView, Phase 2 build, with all its station upgrades on in the “Now” pictures). Quaternius MegaKit pieces keep their own textures, so they show as they would only if we added texture support for them.</p>
  </div>
</section>
</div>
'''
open(f'{S}/page/index.html', 'w').write(page)
print(len(page), 'bytes')
