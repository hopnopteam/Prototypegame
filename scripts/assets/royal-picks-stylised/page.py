import json, html
cat = json.load(open('catalog.json')); lay = json.load(open('layouts.json')); tris = json.load(open('shots/tris.json'))
E = html.escape
def tri(o):
    n = sum(tris.get(f, 0) for f in o['files'])
    return f'{n:,}' if n else 'n/a'
REC_R = ['R1','R2','R4','R5','R6','R8','R9','R11','R12','R13','R14','R15','R17','R18','R20','R21']
REC_F = ['F1','F2','F3','F5','F6','F7','F8','F9','F10']
REC_G = ['G8','G11','G14']
REC = set(REC_R + REC_F + REC_G)
PAL = [
 ('P1', 'Royal', 'Crown Claret', 'Claret over walnut, champagne silk, gold. Recommended for the Royal Suite: regal, warm, nothing like First Class.', ['#5A1424','#3B2214','#E6D3A3','#7A1E32','#D4AF5A','#C9A24A'], 'L1'),
 ('P2', 'Royal', 'Imperial Emerald', 'Emerald velvet, walnut, champagne and brass: an old-money library.', ['#123D30','#3B2214','#E6D3A3','#1F5C45','#C9A24A','#B8913A'], 'L1b'),
 ('P3', 'Royal', 'Rose Palace', 'Dusty rose, cream wood, blush silk and gold: light and romantic, reads well at night.', ['#B76E79','#F2E6D0','#FBF4E6','#C98C95','#E8C4C4','#D4AF37'], 'L1c'),
 ('P5', 'First', 'Sapphire Pullman', 'Ivory over mahogany, sapphire velvet, champagne and brass. Recommended: today\'s First Class, made consistent.', ['#F1EADB','#5C2E21','#EFE6D2','#2A4A92','#E3D3AE','#B8913A'], 'L4'),
 ('P6', 'First', 'Art Deco Teal', 'Teal velvet, black lacquer, cream and champagne gold: a 1930s Pullman.', ['#F0E8D8','#1A1A1A','#EFE6D2','#1F5E66','#E3D3AE','#C8A962'], 'L4b'),
 ('P7', 'First', 'Pullman Green', 'Racing green, tan leather, cream linen, brass. Clubby and calm (swatches only).', ['#E8DFC9','#2E4A33','#A8703F','#F2EBDC','#6E7F55','#B8913A'], None),
]
X = [
 ('X1', 'Tiny Treats Lovely Living Room', '$7.95', 'https://tinytreats.itch.io/lovely-living-room', '90+ pieces by Isa Lousberg in exactly our Tiny Treats style: a grandfather clock, stone fireplaces, a wingback armchair, several couches and armchairs, floor and table lamps, bookcases, picture frames, a radio. It fills every gap the free packs leave (the clock, a grand fireplace, a true wingback). Recommended if one pack is bought.', True),
 ('X2', 'Tiny Treats Playful Bedroom', '$7.95', 'https://tinytreats.itch.io/playful-bedroom', 'Beds, wardrobes, desks and toys for a child\'s room. Wardrobes and bedside pieces would help; most of the pack (toys, kids\' beds) does not fit a Royal Suite. Not recommended for this job; better for the Family Sleeper.', False),
 ('X3', 'Tiny Treats Collection 1 (12 sets)', '$19.95', 'https://tinytreats.itch.io/collection-1', 'All twelve Tiny Treats sets with sources, including X1 and X2. Worth it only if the Family Sleeper and other rooms will also be re-dressed from Tiny Treats.', False),
 ('X4', 'KayKit Furniture Bits EXTRA', '$3.95', 'https://kaylousberg.itch.io/furniture-bits', '20 extra pieces (a gaming setup: desks, monitors, chairs) and 3 alternate textures. Nothing for a suite; skip.', False),
]
def card(o):
    lic = o['lic']; src = f'<a href="{E(lic[1])}" target="_blank" rel="noopener">{E(lic[0])}</a>' if lic[1] else E(lic[0])
    ref = f'<p class="ref">Left: candidate. Right: {E(o["refname"])}.</p>' if o.get('refname') else ''
    star = '<span class="pill rec">Recommended</span>' if o['id'] in REC else ''
    return f'''<article class="opt" id="{o['id']}"><img src="img/{o['id']}.jpg" alt="{E(o['name'])} rendered in the suite" loading="lazy" width="800" height="600">
<div class="meta"><h4><span class="oid">{o['id']}</span> {E(o['name'])} {star}</h4><p>{E(o['why'])}</p>{ref}
<dl><dt>Source</dt><dd>{src}</dd><dt>Licence</dt><dd>{E(lic[2]) if lic[2] != 'ours' else 'Ours (drawn this session)'}</dd><dt>Triangles</dt><dd>{tri(o) if lic[2] != 'ours' else 'a textured quad'}</dd></dl></div></article>'''
def section(prefix):
    return '\n'.join(card(o) for o in cat if o['id'].startswith(prefix))
def laycard(k, big=False):
    l = lay[k]
    return f'''<figure class="lay{' big' if big else ''}" id="{k}"><img src="img/{k}.jpg" alt="Mock-up: {E(l['name'])}" loading="lazy" width="600" height="825"><figcaption><h4><span class="oid">{k}</span> {E(l['name'])}</h4><p>{E(l['text'])}</p></figcaption></figure>'''
def chips(ids): return ' '.join(f'<a class="chip" href="#{i}">{i}</a>' for i in ids)
pal = '\n'.join(f'''<article class="pal" id="{p[0]}"><div class="sw">{''.join(f'<span style="background:{c}"></span>' for c in p[4])}</div><h4><span class="oid">{p[0]}</span> {E(p[2])} <small>{p[1]}</small></h4><p>{E(p[3])}</p>{f'<p class="ref">Shown in <a href="#{p[5]}">{p[5]}</a>.</p>' if p[5] else ''}</article>''' for p in PAL)
xs = '\n'.join(f'''<article class="x" id="{x[0]}"><div class="xi">{''.join(f'<img src="img/{x[0]}_{n}.jpg" alt="{E(x[1])} store picture {n+1}" loading="lazy" width="900" height="506">' for n in range(3 if x[0] != 'X4' else 2))}</div>
<div class="meta"><h4><span class="oid">{x[0]}</span> {E(x[1])} <span class="pill price">{x[2]}</span> {'<span class="pill rec">Recommended buy</span>' if x[5] else ''}</h4><p>{E(x[4])}</p><p class="ref">Store pictures by the author, from <a href="{x[3]}" target="_blank" rel="noopener">{x[3].replace('https://','')}</a>. Not bought. Paid packs carry the author's own commercial-use licence.</p></div></article>''' for x in X)
page = f'''<title>Royal Suite Picks — Stylised</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: a night-train catalogue. Recommended set first, then mock-up rooms, then every option as a card grid. Single deliberate dark look (the game's night). */
:root {{
  --night: #121629; --carriage: #1B2140; --panel: #232A4F; --line: #343D6B;
  --ink: #EEE7D8; --dim: #AEB0C8; --gold: #D9B45E; --claret: #8E2A40; --sapphire: #3B5BB0;
  --display: 'Fraunces', Georgia, 'Times New Roman', serif; --body: 'Nunito Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color-scheme: dark;
}}
body {{ background: var(--night); color: var(--ink); font: 15px/1.55 var(--body); }}
.wrap {{ max-width: 1180px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 64px; display: grid; gap: 44px; }}
h1, h2, h3, h4 {{ font-family: var(--display); text-wrap: balance; margin: 0; }}
h1 {{ font-size: clamp(30px, 5vw, 46px); font-weight: 700; color: var(--gold); line-height: 1.1; }}
h2 {{ font-size: 26px; font-weight: 700; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }}
h2 small {{ font: 600 12px var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }}
h3 {{ font-size: 19px; color: var(--gold); }}
h4 {{ font-size: 17px; font-weight: 600; line-height: 1.3; }}
p {{ margin: 0; max-width: 68ch; }}
a {{ color: var(--gold); }}
a:focus-visible {{ outline: 2px solid var(--gold); outline-offset: 2px; }}
header {{ display: grid; gap: 14px; }}
.lede {{ color: var(--dim); font-size: 16px; }}
section {{ display: grid; gap: 18px; }}
.oid {{ font: 700 12px var(--body); letter-spacing: .08em; color: var(--night); background: var(--gold); border-radius: 4px; padding: 2px 6px; vertical-align: 2px; }}
.pill {{ font: 700 11px var(--body); letter-spacing: .08em; text-transform: uppercase; border-radius: 99px; padding: 2px 8px; vertical-align: 2px; white-space: nowrap; }}
.pill.rec {{ background: #2F5D45; color: #DDF3E5; }}
.pill.price {{ background: var(--claret); color: #FBEDEF; }}
.rec-box {{ background: var(--carriage); border: 1px solid var(--line); border-radius: 14px; padding: 22px; display: grid; gap: 16px; }}
.rec-cols {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }}
.rec-cols > div {{ display: grid; gap: 8px; align-content: start; min-width: 0; }}
.rec-cols ul {{ margin: 0; padding-left: 18px; display: grid; gap: 3px; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 6px; }}
.chip {{ font: 700 12px var(--body); text-decoration: none; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }}
.lays {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }}
.lays.two {{ grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }}
.lay {{ margin: 0; background: var(--carriage); border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; }}
.lay img {{ width: 100%; height: auto; display: block; }}
.lay figcaption {{ padding: 14px 16px 18px; display: grid; gap: 8px; }}
.lay p {{ color: var(--dim); font-size: 14px; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }}
.opt, .pal, .x {{ background: var(--carriage); border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: auto 1fr; min-width: 0; }}
.opt img {{ width: 100%; height: auto; display: block; aspect-ratio: 4 / 3; object-fit: cover; }}
.meta {{ padding: 14px 16px 18px; display: grid; gap: 8px; align-content: start; min-width: 0; }}
.meta p {{ color: var(--dim); font-size: 14px; }}
.ref {{ font-size: 13px; color: var(--dim); font-style: italic; }}
dl {{ margin: 4px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 13px; }}
dt {{ color: var(--dim); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; padding-top: 2px; }}
dd {{ margin: 0; font-variant-numeric: tabular-nums; min-width: 0; overflow-wrap: anywhere; }}
.pal {{ padding-bottom: 6px; }}
.pal .sw {{ display: grid; grid-template-columns: repeat(6, 1fr); height: 64px; }}
.pal h4, .pal p {{ padding: 0 16px; }} .pal h4 {{ padding-top: 14px; padding-bottom: 6px; }} .pal p {{ color: var(--dim); font-size: 14px; padding-bottom: 8px; }}
.pal small {{ font: 600 11px var(--body); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }}
.x {{ grid-template-rows: auto auto; }}
.xi {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2px; background: var(--night); }}
.xi img {{ width: 100%; height: auto; display: block; }}
.note {{ background: var(--panel); border-radius: 12px; padding: 16px 18px; display: grid; gap: 8px; color: var(--dim); font-size: 14px; }}
.note strong {{ color: var(--ink); }}
.rugs {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }}
@media (prefers-reduced-motion: no-preference) {{ .chip:hover, .opt:hover {{ filter: brightness(1.08); }} }}
</style>
<div class="wrap">
<header>
  <h1>Royal Suite Picks — Stylised</h1>
  <p class="lede">The second hunt, after the scanned Poly Haven pieces were rejected. Every option here comes from the same toy box as what is already in Night Express: KayKit and Tiny Treats (both by Kay and Isa Lousberg, the authors of the café and bath pieces), Quaternius (the beds, chairs and fireplace) and Kenney. No photo textures, no scans. Every picture is the game's own night stage and camera, with the candidate baked to vertex colours and recoloured by hue band exactly as the game does it.</p>
  <p class="lede">Most cards show the candidate on the left and the closest model already in the game on the right, in the same palette, so the style match can be judged directly. Pick by number (R…, F…, G…, P…, L…, X…).</p>
</header>

<section class="rec-box" aria-labelledby="rec">
  <h2 id="rec">Recommended set</h2>
  <div class="rec-cols">
    <div><h3>Royal Suite · P1 Crown Claret · layout L1</h3>
      <ul><li>Bed with tall head- and footboard (R1), claret velvet on walnut; the game's four-poster canopy can stay round it</li><li>A pair of wingback armchairs (R2) and a cushioned sofa in champagne silk (R4) round the fire (fireplace and steamer trunk already in the game)</li><li>Dresser (R5) and vanity with a mirror (R6); low coffee table (R8) and side tables (R9)</li><li>Standing and table lamps (R11, R12), candles in pots (R13)</li><li>Afternoon tea: the macaron stand (R14) and champagne on a tray (R15)</li><li>Details: books and a photo (R17), cushions (R18), a wireless set (R20), a palm (R21)</li><li>Painted medallion rug in claret and gold (G8)</li></ul>
      <div class="chips">{chips(REC_R + ['G8','P1','L1'])}</div></div>
    <div><h3>First Class · P5 Sapphire Pullman · layout L4</h3>
      <ul><li>Low double bed (F1) in sapphire and mahogany</li><li>Club sofa (F2) and a pair of club chairs (F3) round a round mahogany table (F7) with champagne</li><li>Writing corner: low bookcase with a photo (F6) and an ivory writing chair (F5)</li><li>Deco table lamps (F8), a standing lamp (F10), the morning tea tray (F9)</li><li>Painted sapphire trellis rug (G11) and a sapphire runner from the door (G14)</li></ul>
      <div class="chips">{chips(REC_F + ['G11','G14','P5','L4'])}</div></div>
    <div><h3>One purchase, if any</h3>
      <p>Tiny Treats <a href="#X1">Lovely Living Room</a> ($7.95) is the only pack in our exact style with a grandfather clock, a grand stone fireplace and a true wingback chair. Everything else above is free (CC0). Total triangles for the Royal set: about 10k, in line with today's suite.</p>
      <div class="chips">{chips(['X1'])}</div></div>
  </div>
</section>

<section aria-labelledby="mock">
  <h2 id="mock">Mock-up rooms <small>the recommended sets in the suite</small></h2>
  <div class="lays two">{laycard('L1', True)}{laycard('L4', True)}</div>
  <div class="note"><p><strong>How to read these.</strong> The room is the Royal Suite (tier 5) or First Class suite (tier 4) as the game draws it today, emptied, with the candidates placed by this page's own stage. The walls and floor are the game's current ones; palettes change the furniture and rugs only. Tall pieces stay off the window wall, which faces the camera.</p></div>
</section>

<section aria-labelledby="lay">
  <h2 id="lay">Layouts and palettes <small>other orientations, other colours</small></h2>
  <div class="lays">{laycard('L2')}{laycard('L5')}{laycard('L1b')}{laycard('L1c')}{laycard('L4b')}</div>
  <div class="grid">{pal}</div>
</section>

<section aria-labelledby="royal">
  <h2 id="royal">Royal Suite pieces <small>R1–R21 · shown in P1 Crown Claret</small></h2>
  <div class="grid">{section('R')}</div>
</section>

<section aria-labelledby="first">
  <h2 id="first">First Class pieces <small>F1–F10 · shown in P5 Sapphire Pullman</small></h2>
  <div class="grid">{section('F')}</div>
</section>

<section aria-labelledby="rugs">
  <h2 id="rugs">Rugs <small>G2–G15 · pack rug models, and flat painted rugs drawn for the game</small></h2>
  <p class="lede">G2–G7 are rug models from the packs (thin, rounded, recoloured). G8–G15 are drawn here in the game's flat style: a few crisp colours, no photo, one texture each; the motifs and colours can be changed freely.</p>
  <div class="grid">{section('G')}</div>
</section>

<section aria-labelledby="paid">
  <h2 id="paid">Paid packs <small>X1–X4 · not bought</small></h2>
  <div class="grid">{xs}</div>
</section>

<section aria-labelledby="left">
  <h2 id="left">What was looked at and left out</h2>
  <div class="note">
    <p><strong>Screened:</strong> about 180 pieces from KayKit Furniture Bits (all 52), Tiny Treats Bubbly Bathroom, Bakery Interior, Charming Kitchen, Pleasant Picnic and Homely House (all free, CC0), Quaternius Ultimate House Interior (all 130) and Fantasy Props MegaKit, and Kenney Furniture Kit (all 140).</p>
    <p><strong>Left out:</strong> Quaternius Fantasy Props' textured beds, bookcases and the iron candelabra (wood-grain textures and medieval iron read as a different game); Quaternius Medieval Village (buildings only); most Kenney pieces (flat and boxy beside KayKit; only the Deco chair, the square lamp and a round rug earn a place); slippers and the fruit bowl (unreadable at the game's camera distance); the plain KayKit rugs (one flat colour).</p>
    <p><strong>Not found free in this style:</strong> a four-poster or canopy bed, a chaise longue, a folding screen and a wardrobe. The game's own four-poster canopy stays; the clock and a grander fireplace come with X1.</p>
    <p><strong>Not reachable from this session:</strong> other itch.io creators' pages (only the listed creators are allowed by the environment), kenney.nl, Poly Pizza and Sketchfab's search. Generic itch packs from the search (low-poly living rooms and bedrooms) were not checked for that reason.</p>
  </div>
</section>
</div>
'''
open('page/index.html', 'w').write(page)
print(len(page))
