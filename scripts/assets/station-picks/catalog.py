# Station Picks catalogue: every station element, its stylised candidate options, and a render spec for each in the
# game's own night stage (scripts/assets/station-picks-stage.ts). Run from the scratch folder that holds `x/` (the
# unpacked packs) and `www/` (the served folder): python3 -I catalog.py <scratch dir>
import json, os, sys, urllib.parse
S = sys.argv[1]
X = os.path.join(S, 'x')
W = os.path.join(S, 'www')
os.makedirs(f'{W}/specs', exist_ok=True)

L = {
 'KC': ('KayKit City Builder Bits 1.0 (free)', 'https://kaylousberg.itch.io/city-builder-bits', 'CC0', 'kk-city'),
 'KM': ('KayKit Medieval Hexagon Pack 1.0 (free)', 'https://kaylousberg.itch.io/kaykit-medieval-hexagon', 'CC0', 'kaylousberg-kaykit-medieval-hexagon'),
 'KH': ('KayKit Halloween Bits 1.0 (free)', 'https://kaylousberg.itch.io/halloween-bits', 'CC0', 'kaylousberg-halloween-bits'),
 'KX': ('KayKit Holiday Bits 1.0 (free)', 'https://kaylousberg.itch.io/holiday-bits', 'CC0', 'kaylousberg-holiday-bits'),
 'KR': ('KayKit Restaurant Bits 1.0 (free)', 'https://kaylousberg.itch.io/restaurant-bits', 'CC0', 'kaylousberg-restaurant-bits'),
 'KS': ('KayKit Resource Bits 1.0 (free)', 'https://kaylousberg.itch.io/resource-bits', 'CC0', 'kaylousberg-resource-bits'),
 'KF': ('KayKit Forest Nature Pack 1.0 (free)', 'https://kaylousberg.itch.io/kaykit-forest', 'CC0', 'kaylousberg-kaykit-forest'),
 'KB': ('KayKit Furniture Bits 1.0 (free)', 'https://kaylousberg.itch.io/furniture-bits', 'CC0', 'kaylousberg-furniture-bits'),
 'K1': ('KayKit Mixed Bag 1 (free)', 'https://kaylousberg.itch.io/mixed-bag-1', 'CC0', 'kaylousberg-mixed-bag-1'),
 'TP': ('Tiny Treats Pretty Park 1.0 (free)', 'https://tinytreats.itch.io/pretty-park', 'CC0', 'tinytreats-pretty-park'),
 'TH': ('Tiny Treats Homely House 1.0 (free)', 'https://tinytreats.itch.io/homely-house', 'CC0', 'tinytreats-homely-house'),
 'TG': ('Tiny Treats Fun Playground 1.0 (free)', 'https://tinytreats.itch.io/fun-playground', 'CC0', 'tinytreats-fun-playground'),
 'TK': ('Tiny Treats Bakery Interior 1.1 (free)', 'https://tinytreats.itch.io/bakery-interior', 'CC0', 'tinytreats-bakery-interior'),
 'TB': ('Tiny Treats Baked Goods 1.0 (free)', 'https://tinytreats.itch.io/baked-goods', 'CC0', 'tinytreats-baked-goods'),
 'TN': ('Tiny Treats Pleasant Picnic 1.0 (free)', 'https://tinytreats.itch.io/pleasant-picnic', 'CC0', 'tinytreats-pleasant-picnic'),
 'TL': ('Tiny Treats House Plants 1.0 (free)', 'https://tinytreats.itch.io/house-plants', 'CC0', 'tinytreats-house-plants'),
 'QF': ('Quaternius Fantasy Props MegaKit (Standard, free)', 'https://quaternius.itch.io/fantasy-props-megakit', 'CC0', 'quaternius-fantasy-props-megakit'),
 'QV': ('Quaternius Medieval Village MegaKit (Standard, free)', 'https://quaternius.itch.io/medieval-village-megakit', 'CC0', 'quaternius-medieval-village-megakit'),
 'QD': ('Quaternius Downtown City MegaKit (Standard, free)', 'https://quaternius.itch.io/downtown-city-megakit', 'CC0', 'quaternius-downtown-city-megakit'),
 'QA': ('Quaternius Farm Animals', 'https://quaternius.itch.io/lowpoly-animated-animals', 'CC0', 'quaternius-lowpoly-animated-animals'),
 'QB': ('Quaternius Farm Buildings', 'https://quaternius.itch.io/lowpoly-farm-buildings', 'CC0', 'quaternius-lowpoly-farm-buildings'),
 'QS': ('Quaternius Modular Street Pack', 'https://quaternius.itch.io/lowpoly-modular-street', 'CC0', 'quaternius-lowpoly-modular-street'),
 'QH': ('Quaternius Ultimate House Interior (June 2020)', 'https://opengameart.org/content/lowpoly-house-interior-pack', 'CC0', 'quaternius-house-interior'),
 'NF': ('Kenney Fantasy Town Kit 2.0', 'https://opengameart.org/content/fantasy-town-kit', 'CC0', 'kenney-fantasy-town-kit'),
 'NS': ('Kenney Survival Kit', 'https://opengameart.org/content/survival-kit', 'CC0', 'kenney-survival-kit'),
 'NN': ('Kenney Nature Kit 2.1', 'https://opengameart.org/content/nature-kit', 'CC0', 'kenney-nature-kit'),
 'NB': ('Kenney City Kit Suburban 2.0', 'https://opengameart.org/content/city-kit-suburban', 'CC0', 'kenney-city-kit-suburban'),
 'NR': ('Kenney City Kit Roads 2.2', 'https://opengameart.org/content/city-kit-roads', 'CC0', 'kenney-city-kit-roads'),
 'NH': ('Kenney Holiday Kit', 'https://opengameart.org/content/holiday-kit', 'CC0', 'kenney-holiday-kit'),
 'NO': ('Kenney Food Kit', 'https://opengameart.org/content/food-kit', 'CC0', 'kenney-food-kit'),
 'NK': ('Kenney Furniture Kit', 'https://opengameart.org/content/furniture-kit', 'CC0', 'kenney-furniture-kit'),
}
PREF = ['/gltf/', '/glTF/', '/glTF (Godot)/', '/GLB format/', '/OBJ/', '/OBJ format/', '/obj/']
_cache = {}
def path(pack, name):
    """The served path (under www/x) of a pack's model file, preferring glTF/GLB folders."""
    root = os.path.join(X, L[pack][3])
    if root not in _cache:
        _cache[root] = [os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs]
    hits = [p for p in _cache[root] if os.path.basename(p) == name]
    if not hits: raise SystemExit(f'missing {pack} {name}')
    hits.sort(key=lambda p: min([i for i, k in enumerate(PREF) if k in p] or [99]))
    rel = os.path.relpath(hits[0], X)
    return 'x/' + urllib.parse.quote(rel)

# Hue bands (from the Royal picks) and the game's station colours.
B = {'wood': {'hue': [6, 30], 'sat': [0.38, 0.8], 'val': [0.3, 0.9]},
     'blue': {'hue': [180, 232], 'sat': [0.18, 0.9], 'val': [0.12, 1]},
     'yellow': {'hue': [31, 62], 'sat': [0.35, 1], 'val': [0.6, 1]},
     'red': {'hue': [340, 14], 'sat': [0.45, 1], 'val': [0.35, 1]},
     'green': {'hue': [90, 160], 'sat': [0.3, 1], 'val': [0.2, 0.75]},
     'grey': {'hue': [0, 360], 'sat': [0, 0.12], 'val': [0.18, 0.62]},
     'dark': {'hue': [0, 360], 'sat': [0, 0.3], 'val': [0, 0.3]}}
def rc(**m): return [{**B[k], 'to': v} for k, v in m.items()]
NAVY, BRASS, CREAM = '#34507A', '#E2B653', '#F3E9D2'

CX, CZ = 5.6, 27.0  # an open stretch of the real platform behind the train: the candidate bay
def M(pack, name, dx=0, dz=0, fit=None, h=None, rot=0, pal=None, **k):
    d = {'url': path(pack, name), 'x': CX + dx, 'z': CZ + dz, 'rot': rot, **k}
    if fit: d['fit'] = fit
    if h: d['h'] = h
    if pal: d['rc'] = rc(**pal)
    # Quaternius MegaKits paint with detailed trim textures: a per-vertex bake would flatten them, so they keep their own materials.
    if pack in ('QV', 'QD', 'QF'): d['raw'] = True; d.pop('rc', None)
    return d

EL = []  # elements: {key, name, today: {x, z, zoom, crop} | None, note, options: [...]}
OPT = []
n = 0
def el(key, name, today, note=''):
    EL.append({'key': key, 'name': name, 'today': today, 'note': note, 'options': []})
def opt(name, packs, why, models, zoom=0.42, rec=False, files=None):
    global n
    n += 1
    oid = f'S{n}'
    zoom = max(zoom, 0.45)  # closer than this, the game camera's near plane cuts the floor away
    o = {'id': oid, 'el': EL[-1]['key'], 'name': name, 'packs': packs if isinstance(packs, list) else [packs], 'why': why, 'zoom': zoom, 'rec': rec,
         'files': files or sorted({m['url'] for m in models}), 'models': models}
    OPT.append(o); EL[-1]['options'].append(oid)

T = lambda x, z, zoom=0.5: {'x': x, 'z': z, 'zoom': zoom}
PX = 2.75  # PLATFORM_X0

# ---- surfaces ---------------------------------------------------------------------------------------------------
el('deck', 'Platform paving and edge', T(5.6, -6, 0.6), 'A tile texture or tiles laid on the deck; the coping and yellow line stay ours.')
tile = lambda pack, name, size, pal=None: [M(pack, name, dx=(i - 1) * size, dz=(j - 1) * size, fit=[size, size], pal=pal) for i in range(3) for j in range(3)]
opt('Uneven brick paving', 'QV', 'Quaternius\' rounded, slightly uneven setts: a hand-laid country platform. It is painted with a texture, which the game would carry as a detail layer under our colours, the way today\'s paving is done.', tile('QV', 'Floor_UnevenBrick.gltf', 1.0), zoom=0.55, rec=True)
opt('Cobble stones', 'TP', 'Tiny Treats\' big round cobbles: the cosiest look, but busier under people at phone size.', tile('TP', 'cobble_stones_large.gltf', 1.0), zoom=0.55)
opt('Town paving slabs', 'NF', 'Kenney\'s fantasy-town road tile: big flat flags, very calm, closest to today\'s look.', tile('NF', 'road.glb', 1.0), zoom=0.55)
opt('Kerbed pavement', 'QD', 'Quaternius\' 3 m pavement with a kerb: the kerb reads as the platform\'s coping, but the slabs feel urban.', [M('QD', 'Sidewalk_Straight_3m.gltf', fit=[3, 3])], zoom=0.55)

# ---- the ticket office -------------------------------------------------------------------------------------------
el('booth', 'Ticket booth / ticket office', T(PX + 2.47, -1.9, 0.5), 'Today: a navy counter with a canopy (the Ticket Booth upgrade).')
opt('Market stall, blue awning', 'NF', 'Kenney\'s stall: a canvas awning over a counter, low and open from above, so it reads as a booth at a glance. Recoloured navy.', [M('NF', 'stall-red.glb', fit=[1.8, 1.4], pal=dict(red=NAVY))], rec=True)
opt('Medieval market, blue', 'KM', 'KayKit\'s market building: a tiled roof over a counter of goods. Charming but taller and fantasy-flavoured.', [M('KM', 'building_market_blue.gltf', fit=[2.2, 2.2])], zoom=0.5)
opt('Empty stall', 'QF', 'Quaternius\' wooden stall with a cloth canopy: a ticket window on legs, a little rustic.', [M('QF', 'Stall_Empty.gltf', fit=[1.8, 1.4], pal=dict(red=NAVY))])

el('counter', 'Ticket counter', T(PX + 2.47, -1.9, 0.4))
opt('Bakery counter with till', 'TK', 'Tiny Treats\' panelled counter with its cash register on top: the till rings for every fare, same family as the café.', [M('TK', 'counter_table.gltf', fit=[1.5, 0.6]), M('TK', 'cash_register.gltf', fit=[0.32, 0.3], on=True)], rec=True)
opt('Countertop with cupboards', 'TK', 'Tiny Treats\' countertop cupboard with shelves: smaller, a counter for the second gate.', [M('TK', 'countertop_closet_A_large.gltf', fit=[1.6, 0.6]), M('TK', 'cash_register.gltf', fit=[0.32, 0.3], on=True)])
opt('Workbench with drawers', 'QF', 'Quaternius\' chunky drawer bench, recoloured navy: plainer, more of a parcels desk.', [M('QF', 'Workbench_Drawers.gltf', fit=[1.5, 0.6], pal=dict(wood=NAVY))])

# ---- seating and light -------------------------------------------------------------------------------------------
el('bench', 'Benches', T(PX + 6.2, -3.5, 0.45))
opt('Park bench', 'TP', 'Tiny Treats\' slatted bench on curly iron ends: already the bench we use in the game, so it stays consistent.', [M('TP', 'bench.gltf', fit=[1.7, 0.6], pal=dict(dark=NAVY))], rec=True)
opt('Garden bench', 'TH', 'The Homely House porch bench: a cushioned seat with painted arms, homely and bright.', [M('TH', 'bench_A.gltf', fit=[1.6, 0.55])])
opt('City bench', 'KC', 'KayKit\'s city bench: chunkier and a touch modern.', [M('KC', 'bench.gltf', fit=[1.6, 0.6])])
opt('Log bench', 'NH', 'Kenney\'s wooden holiday bench: rustic, simple shapes.', [M('NH', 'bench.glb', fit=[1.6, 0.55])])

el('lamp', 'Lamp posts (platform)', T(PX + 3.1, -3.05, 0.5), 'Tall pieces: they must never hide a job badge. Each glows in the game\'s lamp light.')
opt('Street lantern', 'TP', 'Tiny Treats\' lantern on a fluted post: Victorian and soft, already in the game\'s forecourt.', [M('TP', 'street_lantern.gltf', h=2.6, pal=dict(dark=NAVY))], zoom=0.5, rec=True)
opt('Standing lantern', 'KH', 'KayKit\'s standing lantern set on KayKit\'s plain post, recoloured navy (Halloween pieces; the shapes are a plain gas lamp).', [M('KH', 'post.gltf', h=2.0, pal=dict(dark=NAVY, grey=NAVY)), M('KH', 'lantern_standing.gltf', h=0.45, on=True, pal=dict(dark=NAVY, grey=NAVY))], zoom=0.5)
opt('Lantern post', 'NF', 'Kenney\'s town lantern: a square lamp on a slim post, crisp at thumb size.', [M('NF', 'lantern.glb', h=2.6)], zoom=0.5)
opt('Post with hanging lantern', 'KH', 'A post with a lantern hung from an arm: the old country-halt look.', [M('KH', 'post_lantern.gltf', h=2.6, pal=dict(dark=NAVY, grey=NAVY))], zoom=0.5)

el('streetlamp', 'Street lamps (forecourt lane)', T(PX + 8.2, -16, 0.6))
opt('Street lantern (forecourt)', 'TP', 'The same Tiny Treats lantern as the platform: one family of lamps everywhere.', [M('TP', 'street_lantern.gltf', h=3.0)], zoom=0.5, rec=True)
opt('City streetlight', 'KC', 'KayKit\'s streetlight on an arm: reads as a road lamp; more modern.', [M('KC', 'streetlight.gltf', h=3.4)], zoom=0.55)
opt('Single streetlight', 'QS', 'Quaternius\' modular-street lamp: very simple, a little plain.', [M('QS', 'Streetlight_Single.obj', h=3.4)], zoom=0.55)

el('clock', 'Station clock', T(PX + 4.9, 0.9, 0.45), 'No free stylised clock exists in these packs: options are dressings round a clock face we draw ourselves.')

# ---- buildings and shelters ----------------------------------------------------------------------------------------
el('house', 'Station house', T(PX + 9.5, -15, 0.95), 'Seen past the railing, ahead of the train.')
opt('Homely House', 'TH', 'Tiny Treats\' cottage: a pitched roof, a porch and window boxes. With our name board over the door it becomes the booking hall.', [M('TH', 'house.gltf', fit=[5.0, 4.0])], zoom=0.95, rec=True)
opt('Suburban house', 'NB', 'Kenney\'s suburban house: clean shapes, bright, a little American.', [M('NB', 'building-type-a.glb', fit=[5.0, 4.0])], zoom=0.95)
opt('Village home', 'KM', 'KayKit\'s medieval home: storybook, but on a hexagon base we would cut off.', [M('KM', 'building_home_A_blue.gltf', fit=[4.0, 4.0])], zoom=0.9)
opt('Tavern', 'KM', 'KayKit\'s tavern: a bigger two-storey building with a sign, for a grand station house later.', [M('KM', 'building_tavern_blue.gltf', fit=[4.5, 4.5])], zoom=0.95)

el('shelter', 'Low shelter / canopy', T(PX + 2.47, -1.9, 0.5), 'Must stay low and open: the camera looks down at 48°.')
opt('Overhang on wooden pillars', 'NF', 'Kenney\'s roof overhang on two timber posts: a simple open shelter, shallow enough to see under.', [M('NF', 'overhang.glb', fit=[2.0, 1.0], dz=0, y=1.9), M('NF', 'pillar-wood.glb', dx=-0.8, dz=0.4, h=2.1), M('NF', 'pillar-wood.glb', dx=0.8, dz=0.4, h=2.1)], zoom=0.5)
opt('Stall canopy', 'NF', 'Kenney\'s green stall as a shelter: an awning on two posts over a counter, the lightest possible cover (shown in its teal; it takes the navy like S5).', [M('NF', 'stall-green.glb', fit=[2.0, 1.5], pal=dict(green=NAVY))], zoom=0.5, rec=True)
opt('Tent', 'KM', 'KayKit\'s canvas tent: festive, but it hides what is under it.', [M('KM', 'tent.gltf', fit=[2.0, 2.0])], zoom=0.5)

# ---- boundaries ------------------------------------------------------------------------------------------------------
el('railing', 'Railings and fences', T(PX + 6.45, -6, 0.5), 'The back railing runs the whole platform: any piece repeats every metre or two.')
run = lambda pack, name, seg, h=None, pal=None, rot=0: [M(pack, name, dz=(i - 1) * seg, fit=[0.4, seg], rot=rot, pal=pal) for i in range(3)]
opt('Ornamental iron fence', 'QV', 'Quaternius\' iron railing with finials: the Victorian station railing, recoloured navy.', run('QV', 'Prop_MetalFence_Ornament.gltf', 2.0, h=1.0, rot=90, pal=dict(dark=NAVY, grey=NAVY)), zoom=0.5, rec=True)
opt('Simple iron fence', 'QV', 'The plainer Quaternius railing: calmer when repeated along 60 m.', run('QV', 'Prop_MetalFence_Simple.gltf', 2.0, h=1.0, rot=90, pal=dict(dark=NAVY, grey=NAVY)), zoom=0.5)
opt('White picket fence', 'TH', 'Tiny Treats\' picket fence: for the forecourt gardens, too homely for the platform edge.', run('TH', 'fence_straight_long.gltf', 2.0, h=0.8, rot=90), zoom=0.5)
opt('Iron fence with pillars', 'KH', 'KayKit\'s iron fence between stone pillars (a Halloween piece, recoloured navy).', run('KH', 'fence.gltf', 2.0, h=1.0, rot=90, pal=dict(dark=NAVY, grey=NAVY)), zoom=0.5)

el('gate', 'Gates and pillars', T(PX + 6.45, -12.4, 0.5))
opt('Double garden gate', 'TH', 'Tiny Treats\' double gate: the way in from the station house, painted navy.', [M('TH', 'gate_double_left.gltf', dz=-0.55, h=1.0, rot=90), M('TH', 'gate_double_right.gltf', dz=0.55, h=1.0, rot=90)], zoom=0.5)
opt('Stone pillars', 'NF', 'Kenney\'s stone pillars either side of an opening: a solid, grand way in.', [M('NF', 'pillar-stone.glb', dz=-0.9, h=1.4), M('NF', 'pillar-stone.glb', dz=0.9, h=1.4)], zoom=0.5, rec=True)
opt('Iron arch gate', 'KH', 'KayKit\'s arched iron gate: dramatic, reads as a cemetery even recoloured.', [M('KH', 'arch_gate.gltf', h=2.2, rot=90, pal=dict(dark=NAVY, grey=NAVY))], zoom=0.5)

# ---- greenery --------------------------------------------------------------------------------------------------------
el('planter', 'Planters', T(PX + 4.8, 2.25, 0.4))
opt('Wooden planter', 'NB', 'Kenney\'s suburban planter: a timber box with a shrub, calm and readable.', [M('NB', 'planter.glb', fit=[0.9, 0.9])], rec=True)
opt('Stone pot with plant', 'TL', 'Tiny Treats\' large pot with a yucca: one of the house-plant family already in the train.', [M('TL', 'yucca_plant_large_potted.gltf', h=1.2)])
opt('Street planter', 'QD', 'Quaternius\' concrete planter: urban, too hard-edged here.', [M('QD', 'Prop_Planter_Single.gltf', fit=[0.9, 0.9])])

el('flowers', 'Flower boxes and flowers', T(PX + 9.0, -20, 0.5))
opt('Park flowers', 'TP', 'Tiny Treats\' flower clumps, already in the forecourt beds: pale petals that glow softly at night.', [M('TP', 'flower_A.gltf', dx=-0.3, fit=[0.4, 0.4]), M('TP', 'flower_B.gltf', dx=0.3, fit=[0.4, 0.4]), M('TP', 'flower_A.gltf', dz=0.4, fit=[0.4, 0.4])], zoom=0.3, rec=True)
opt('Nature-kit flowers', 'NN', 'Kenney\'s red, yellow and purple flowers: brighter, more cartoon.', [M('NN', 'flower_redA.glb', dx=-0.3, h=0.35), M('NN', 'flower_yellowA.glb', dx=0.3, h=0.35), M('NN', 'flower_purpleA.glb', dz=0.4, h=0.35)], zoom=0.3)
opt('Flax flowers', 'K1', 'KayKit\'s tall flax flowers: blue and delicate, good in a long window box.', [M('K1', 'flax_flower_A.gltf', dx=-0.25, h=0.5), M('K1', 'flax_flower_B.gltf', dx=0.25, h=0.5)], zoom=0.3)

el('hedge', 'Hedges', T(PX + 7.4, -20, 0.55))
opt('Park hedge', 'TP', 'Tiny Treats\' clipped hedge: soft and round, already in the forecourt.', [M('TP', 'hedge_straight_long.gltf', fit=[0.8, 3.0], rot=90)], zoom=0.5, rec=True)
opt('Large hedge', 'NF', 'Kenney\'s town hedge: square-clipped and taller, more formal.', [M('NF', 'hedge-large.glb', h=1.1, rot=90), M('NF', 'hedge-large.glb', dz=1.0, h=1.1, rot=90)], zoom=0.5)

el('trees', 'Bushes and trees', T(PX + 9.2, 20, 0.7), 'Behind the railing, never over the platform.')
opt('Round forest tree', 'KF', 'KayKit\'s round tree and bush: already on the lakeside, so the station matches the countryside.', [M('KF', 'Tree_1_A_Color1.gltf', dx=-0.6, h=3.5), M('KF', 'Bush_1_A_Color1.gltf', dx=0.9, dz=0.6, h=0.8)], zoom=0.7, rec=True)
opt('Park tree', 'TP', 'Tiny Treats\' big park tree and bush: rounder canopies, bolder greens.', [M('TP', 'tree_large.gltf', dx=-0.6, h=3.5), M('TP', 'bush_large.gltf', dx=0.9, dz=0.6, h=0.8)], zoom=0.7)
opt('Suburban tree', 'NB', 'Kenney\'s tall street tree: a slimmer shape for a tidy forecourt.', [M('NB', 'tree-large.glb', h=3.5)], zoom=0.7)
opt('Town tree', 'NF', 'Kenney\'s fantasy-town tree, tall and round.', [M('NF', 'tree-high-round.glb', h=3.5)], zoom=0.7)

# ---- luggage and goods -----------------------------------------------------------------------------------------------
el('barrow', 'Luggage barrow', T(PX + 0.99, 3.95, 0.45), 'Bags are stacked on it, taken from its outer side.')
opt('Two-wheeled cart', 'NF', 'Kenney\'s flat cart with big wheels: a porter\'s barrow at a glance; bags stack flat on its bed.', [M('NF', 'cart.glb', fit=[1.8, 0.9], rot=90)], rec=True)
opt('Toy cart', 'TG', 'Tiny Treats\' playground cart: cute and rounded, a little small for luggage.', [M('TG', 'cart.gltf', fit=[1.4, 0.8], rot=90)])
opt('Wagon', 'QV', 'Quaternius\' wooden wagon: four wheels and sides, more of a farm cart.', [M('QV', 'Prop_Wagon.gltf', fit=[1.8, 1.0], rot=90)])
opt('Wheelbarrow', 'KM', 'KayKit\'s wheelbarrow: one wheel, reads as a garden tool.', [M('KM', 'wheelbarrow.gltf', fit=[1.2, 0.6], rot=90)])

el('trolley', 'Sack trolley', T(PX + 3.15, 4.6, 0.4), 'No free stylised sack truck found; today\'s drawn one stays, or a cart above doubles as it.')

el('cases', 'Suitcases and trunks', T(PX + 0.99, 3.95, 0.4), 'No free stylised suitcase found: trunks and parcels below; today\'s drawn cases stay on the barrow.')
opt('Wooden chest', 'QF', 'Quaternius\' iron-banded chest (already the Royal Suite\'s trunk): a steamer trunk on the barrow.', [M('QF', 'Chest_Wood.gltf', fit=[0.8, 0.5])], zoom=0.3, rec=True)
opt('Survival chest', 'NS', 'Kenney\'s chest: simpler, flatter colours.', [M('NS', 'chest.glb', fit=[0.8, 0.5])], zoom=0.3)
opt('Parcel', 'TH', 'Tiny Treats\' parcel with string: for the parcels office and the postbox.', [M('TH', 'package.gltf', fit=[0.45, 0.35])], zoom=0.25)

el('goods', 'Crates, barrels and sacks', T(PX + 1.02, 6.95, 0.45))
opt('KayKit set', 'KM', 'KayKit\'s crate, barrel and sack: chunky and soft, the closest match to our figures.', [M('KM', 'crate_A_big.gltf', dx=-0.6, fit=[0.6, 0.6]), M('KM', 'barrel.gltf', dx=0.2, h=0.8), M('KM', 'sack.gltf', dx=0.8, dz=0.2, h=0.55)], rec=True)
opt('Quaternius set', 'QF', 'Quaternius\' crate, barrel and bag: more detailed planks and hoops.', [M('QF', 'Crate_Wooden.gltf', dx=-0.6, fit=[0.6, 0.6]), M('QF', 'Barrel.gltf', dx=0.2, h=0.8), M('QF', 'Bag.gltf', dx=0.8, dz=0.2, h=0.55)])
opt('Restaurant crates', 'KR', 'KayKit\'s produce crates (carrots, potatoes): good for the market stall.', [M('KR', 'crate_carrots.gltf', dx=-0.4, fit=[0.6, 0.45]), M('KR', 'crate_potatoes.gltf', dx=0.4, fit=[0.6, 0.45])])
opt('Kenney set', 'NS', 'Kenney\'s box and barrel: the plainest, lowest detail.', [M('NS', 'box-large.glb', dx=-0.5, fit=[0.6, 0.6]), M('NS', 'barrel.glb', dx=0.4, h=0.8)])

el('cart', 'Supply handcart (restock cart)', T(PX + 1.02, 6.95, 0.45), 'Stacked with towels, rolls and snack boxes.')
opt('Stall cart', 'QF', 'Quaternius\' handcart with a canopy: a vendor\'s barrow, the awning upgrade built in.', [M('QF', 'Stall_Cart_Empty.gltf', fit=[1.6, 0.9], rot=90)], rec=True)
opt('High cart', 'NF', 'Kenney\'s tall-sided cart: holds a stack of supplies, plain.', [M('NF', 'cart-high.glb', fit=[1.6, 0.9], rot=90)])
opt('Toy cart (loaded)', 'TG', 'The Tiny Treats cart with a KayKit textiles stack on it: soft and cosy.', [M('TG', 'cart.gltf', fit=[1.4, 0.8], rot=90), M('KS', 'Textiles_Stack_Small.gltf', fit=[0.5, 0.4], on=True)])

el('kiosk', 'Newsstand', T(PX + 3.1, -7.2, 0.45))
opt('Green stall', 'NF', 'Kenney\'s stall with a teal awning: a newsstand, with papers laid on the counter.', [M('NF', 'stall-green.glb', fit=[1.6, 1.2])], rec=True)
opt('Market, green', 'KM', 'KayKit\'s market building in green: a proper kiosk with a roof, taller.', [M('KM', 'building_market_green.gltf', fit=[2.0, 2.0])], zoom=0.5)

el('stall', 'Fruit and bread market stall (with awning)', T(PX + 4.1, 7.6, 0.45))
opt('Red stall with produce', ['NF', 'QF', 'TB'], 'Kenney\'s red-awning stall, Quaternius apple and carrot crates in front and a Tiny Treats loaf.', [M('NF', 'stall-red.glb', fit=[1.8, 1.3]), M('QF', 'FarmCrate_Apple.gltf', dx=-0.5, dz=0.9, fit=[0.5, 0.4]), M('QF', 'FarmCrate_Carrot.gltf', dx=0.1, dz=0.9, fit=[0.5, 0.4]), M('TB', 'bread.gltf', dx=0.65, dz=0.95, fit=[0.3, 0.2])], zoom=0.5, rec=True)
opt('Market, red', ['KM', 'KR'], 'KayKit\'s market building with KayKit produce crates: one family, but taller.', [M('KM', 'building_market_red.gltf', fit=[2.0, 2.0]), M('KR', 'crate_tomatoes.gltf', dx=-0.4, dz=1.2, fit=[0.5, 0.4]), M('KR', 'crate_lettuce.gltf', dx=0.3, dz=1.2, fit=[0.5, 0.4])], zoom=0.55)
opt('Cart stall', ['QF', 'TB'], 'Quaternius\' stall cart with an apple barrel and baguettes: small and mobile.', [M('QF', 'Stall_Cart_Empty.gltf', fit=[1.6, 0.9]), M('QF', 'Barrel_Apples.gltf', dx=0.95, dz=0.4, h=0.7), M('TB', 'baguette.gltf', dz=0.1, fit=[0.5, 0.12], on=False, y=0.9)], zoom=0.5)

# ---- street furniture ------------------------------------------------------------------------------------------------
el('bin', 'Bins', T(PX + 6.0, 9, 0.35))
opt('Park bin', 'TP', 'Tiny Treats\' round bin with a lid: already used in the game\'s forecourt.', [M('TP', 'trashcan.gltf', h=0.85)], zoom=0.28, rec=True)
opt('Round bin', 'QH', 'Quaternius\' round metal bin: plain, a little municipal. (KayKit\'s city "trash" pieces are rubbish bags, not bins.)', [M('QH', 'Trashcan_Cylindric.obj', h=0.85)], zoom=0.28)
opt('Green bin', 'QH', 'Quaternius\' green bin: simpler and squarer.', [M('QH', 'Trashcan_Green.obj', h=0.85)], zoom=0.28)

el('signs', 'Signposts and the station name board', T(PX + 4.6, -11, 0.5), 'The name itself stays ours (painted lettering); these are what it hangs on.')
opt('Wooden signpost', 'NS', 'Kenney\'s signpost with arrows: "To the village" on the forecourt lane.', [M('NS', 'signpost.glb', h=1.8)], zoom=0.35, rec=True)
opt('Nature sign', 'NN', 'Kenney\'s board on two legs: a name board shape, very simple.', [M('NN', 'sign.glb', fit=[1.0, 0.3])], zoom=0.35)
opt('Hanging road sign', 'NR', 'Kenney\'s sign hung from an arm: a station name board on a post.', [M('NR', 'road-sign-empty-hanging.glb', h=2.4)], zoom=0.4)

el('notice', 'Notice board and posters', T(PX + 7.0, -9, 0.4))
opt('Bakery wall sign', 'TK', 'Tiny Treats\' framed board: the timetable, with our own poster painted on.', [M('TK', 'wall_sign_large.gltf', h=1.0, y=0.5)], zoom=0.3, rec=True)
opt('Large picture frame', 'KB', 'KayKit\'s large frame: a poster frame for the train\'s posters.', [M('KB', 'pictureframe_large_A.gltf', h=1.0, y=0.6)], zoom=0.3)

el('bell', 'Hand bell on a post', T(PX + 3.35, 2.45, 0.35))
opt('Holiday bell on a post', ['KX', 'KH'], 'KayKit\'s brass bell on KayKit\'s post (the Halloween post, plain).', [M('KH', 'post.gltf', h=1.5, pal=dict(dark=NAVY, grey=NAVY)), M('KX', 'bell.gltf', h=0.3, on=True)], zoom=0.3, rec=True)
opt('Bell on a stone pillar', ['KX', 'NF'], 'The same KayKit bell on Kenney\'s stone pillar: sturdier, matches the gate pillars (S34).', [M('NF', 'pillar-stone.glb', h=1.2), M('KX', 'bell.gltf', h=0.3, on=True, dz=0.0)], zoom=0.3)

el('postbox', 'Postbox', T(PX + 8.5, -15, 0.35))
opt('Mailbox with parcel', 'TH', 'Tiny Treats\' mailbox on a post (already in the forecourt) with a parcel beside it. No free pillar box found.', [M('TH', 'mailbox.gltf', h=1.2), M('TH', 'package.gltf', dx=0.5, fit=[0.35, 0.3])], zoom=0.3, rec=True)

el('bicycles', 'Bicycles', None, 'Not in any free stylised pack (KayKit has only a bicycle helmet). Today\'s drawn bicycles stay.')

el('bunting', 'Bunting and flags', T(PX + 3, 0, 0.5))
opt('Pennant flags', 'KM', 'KayKit\'s flags on poles in four colours: a row along the railing for fair days.', [M('KM', 'flag_red.gltf', dx=-0.6, h=1.6), M('KM', 'flag_blue.gltf', h=1.6), M('KM', 'flag_yellow.gltf', dx=0.6, h=1.6)], zoom=0.4, rec=True)
opt('Cloth banner', 'QF', 'Quaternius\' cloth banner on a pole: one big banner for the station house.', [M('QF', 'Banner_1_Cloth.gltf', h=2.0)], zoom=0.4)
opt('String lights', 'NH', 'Kenney\'s coloured string lights: a festoon over the walkway (no free cloth bunting exists).', [M('NH', 'lights-colored.glb', fit=[2.2, 0.4], y=1.0)], zoom=0.4)

el('carpet', 'Red carpet with rope posts', T(PX + 1.6, 1.5, 0.4), 'No free stylised rope stanchions found: carpet options only, posts stay ours.')
opt('Bordered carpet', 'QH', 'Quaternius\' rug with a border, recoloured red and gold: rolled out of the lobby door.', [M('QH', 'Carpet_1.obj', fit=[1.2, 2.4], pal=dict(red='#9E2A2B', wood='#9E2A2B', yellow=BRASS))], zoom=0.35, rec=True)
opt('Rectangle rug', 'NK', 'Kenney\'s plain rug recoloured red: flatter, simpler.', [M('NK', 'rugRectangle.obj', fit=[1.2, 2.4], all='#9E2A2B')], zoom=0.35)

el('harvest', 'Hay bales and pumpkins (harvest fair)', T(PX + 5, 12, 0.4), 'No free stylised hay bale found; pumpkins below.')
opt('KayKit pumpkins', 'KH', 'KayKit\'s orange and yellow pumpkins (not the carved ones): plump and soft.', [M('KH', 'pumpkin_orange.gltf', dx=-0.3, h=0.45), M('KH', 'pumpkin_yellow_small.gltf', dx=0.3, h=0.3), M('KH', 'pumpkin_orange_small.gltf', dz=0.4, h=0.3)], zoom=0.3, rec=True)
opt('Crop pumpkins', 'NN', 'Kenney\'s pumpkins with leaves: field-grown, more angular.', [M('NN', 'crop_pumpkin.glb', dx=-0.3, h=0.45), M('NN', 'crop_pumpkin.glb', dx=0.35, dz=0.2, h=0.35)], zoom=0.3)
opt('Log stack', 'KS', 'KayKit\'s log pile: the harvest-fair alternative to hay bales.', [M('KS', 'Wood_Log_Stack.gltf', fit=[1.2, 0.8])], zoom=0.35)

el('sheep', 'Sheep', T(PX + 12, 30, 0.5), 'Today: sheep are an instanced fill in the meadows.')
opt('Farm sheep', 'QA', 'Quaternius\' low-poly sheep: chunky and round, the only free stylised sheep in these families.', [M('QA', 'Sheep.obj', fit=[1.0, 0.5], dx=-0.4), M('QA', 'Sheep.obj', fit=[1.0, 0.5], dx=0.6, dz=0.6, rot=40)], zoom=0.35, rec=True)

el('water', 'Water pump, well or water tower', T(PX + 10, 30, 0.7))
opt('Farm water tower', 'QB', 'Quaternius\' wooden water tower on legs: the classic railway water tower.', [M('QB', 'WaterTower.obj', h=4.0)], zoom=0.75, rec=True)
opt('City water tower', 'KC', 'KayKit\'s rooftop water tank: softer, made for a city roof.', [M('KC', 'watertower.gltf', h=3.0)], zoom=0.7)
opt('Farm well', 'QB', 'Quaternius\' stone well with a roof: a village pump stand.', [M('QB', 'Well.obj', h=1.8)], zoom=0.45)
opt('KayKit well', 'KM', 'KayKit\'s well (on its hexagon base, which we would trim).', [M('KM', 'building_well_blue.gltf', fit=[1.8, 1.8])], zoom=0.5)

el('scale', 'Weighing scale', None, 'Removed from the game in session 51b; a parcels-office scale if it comes back.')
opt('Bakery scale on a crate', ['TK', 'KM'], 'Tiny Treats\' kitchen scale on a KayKit crate: the parcels scale.', [M('KM', 'crate_A_big.gltf', fit=[0.6, 0.6]), M('TK', 'scale.gltf', fit=[0.35, 0.3], on=True)], zoom=0.28, rec=True)

el('pigeons', 'Pigeons', None, 'Today: pigeons peck on the platform and fly off at the whistle.')
opt('Park bird', 'TP', 'Tiny Treats\' little bird, recoloured pigeon grey.', [M('TP', 'bird.gltf', dx=-0.15, h=0.22, pal=dict(blue='#8C93A3', yellow='#8C93A3', red='#8C93A3')), M('TP', 'bird.gltf', dx=0.2, dz=0.2, h=0.22, rot=120, pal=dict(blue='#8C93A3', yellow='#8C93A3', red='#8C93A3'))], zoom=0.2, rec=True)

# ---- extras ------------------------------------------------------------------------------------------------------------
el('picnic', 'Extra: picnic table by the café end', None, 'A place for day riders to wait with a cup of tea.')
opt('Picnic table', 'TG', 'Tiny Treats\' picnic table with benches.', [M('TG', 'picnic_table.gltf', fit=[1.6, 1.4])], zoom=0.4, rec=True)
el('fountain', 'Extra: forecourt fountain', None, 'A centrepiece for the forecourt lane.')
opt('Park fountain', 'TP', 'Tiny Treats\' round fountain.', [M('TP', 'fountain.gltf', fit=[1.8, 1.8])], zoom=0.45)
opt('Town fountain', 'NF', 'Kenney\'s round stone fountain.', [M('NF', 'fountain-round.glb', fit=[1.8, 1.8])], zoom=0.45)

# Today's pieces, where the game draws them (platform-local metres; y is the height to frame).
TODAY = {
 'deck': (6.0, -5.0, 0.0), 'booth': (5.22, -1.9, 1.2), 'counter': (5.22, -1.9, 0.8), 'shelter': (5.22, -1.9, 1.6),
 'bench': (8.95, -3.5, 0.5), 'lamp': (5.85, -3.05, 1.4), 'streetlamp': (14.57, -6.0, 1.8, 0.9), 'clock': (7.65, 0.9, 1.6),
 'house': (11.5, -16.0, 1.5, 0.95), 'railing': (9.2, -6.0, 0.5), 'gate': (9.2, -12.4, 0.6), 'signs': (7.35, -11.0, 2.2),
 'postbox': (11.0, -10.6, 0.6), 'planter': (7.55, 2.25, 0.4), 'flowers': (10.0, 6.0, 0.2), 'hedge': (10.0, 2.0, 0.5),
 'trees': (16.5, 0.0, 1.5, 0.9), 'barrow': (3.74, 3.95, 0.6), 'trolley': (5.9, 4.6, 0.6), 'cases': (3.74, 3.95, 0.8),
 'goods': (3.77, 6.95, 0.8), 'cart': (3.77, 6.95, 0.8), 'kiosk': (8.6, -7.2, 1.2), 'stall': (6.85, 7.6, 1.2),
}
for e in EL:
    e['today'] = {'x': TODAY[e['key']][0], 'z': TODAY[e['key']][1], 'y': TODAY[e['key']][2], 'zoom': 1.4 if e['key'] == 'house' else 0.7, 'crop': (TODAY[e['key']] + (0.55,))[3]} if e['key'] in TODAY else None
ZK = 1.0  # every option a little closer than its nominal zoom
LIGHT = lambda: [{'x': CX - 0.4, 'y': 2.4, 'z': CZ + 0.8, 'i': 5, 'd': 7}]
for o in OPT:
    json.dump({'upgrades': [], 'cam': {'x': CX, 'z': CZ, 'zoom': round(o['zoom'] * ZK, 3)}, 'lights': LIGHT(), 'models': o['models']}, open(f'{W}/specs/{o["id"]}.json', 'w'))
UP = ['benches', 'booth', 'cart', 'trolley', 'kiosk', 'clock', 'helper']
for e in EL:
    if e['today']:
        t = e['today']
        json.dump({'upgrades': UP, 'cam': {'x': t['x'], 'z': t['z'], 'zoom': max(0.7, t['zoom'])}, 'mark': {'x': t['x'], 'z': t['z'], 'y': t.get('y', 0.6)}}, open(f'{W}/specs/today_{e["key"]}.json', 'w'))
zooms = sorted({o['zoom'] for o in OPT})
for z in zooms:
    json.dump({'upgrades': [], 'cam': {'x': CX, 'z': CZ, 'zoom': round(z * ZK, 3)}, 'lights': LIGHT(), 'models': []}, open(f'{W}/specs/base_{z}.json', 'w'))
json.dump({'elements': EL, 'options': [{k: v for k, v in o.items() if k != 'models'} | {'lic': [list(L[p][:3]) for p in o['packs']]} for o in OPT], 'packs': {k: list(v) for k, v in L.items()}}, open(f'{S}/catalog.json', 'w'), indent=1)
print(len(EL), 'elements', len(OPT), 'options', 'zooms', zooms)
