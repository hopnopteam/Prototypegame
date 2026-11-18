# Station Picks 2 catalogue: shops, the ticket office, the Train Works, the tray, the train's outside and station life,
# each with stylised candidate options and a render spec for the game's own night stage (scripts/assets/station-picks-stage.ts).
# Run from the scratch folder that holds `x/` (the unpacked packs) and `www/` (the served folder): python3 -I catalog.py <scratch dir>
import json, os, sys, urllib.parse
S = sys.argv[1]
X = os.path.join(S, 'x')
W = os.path.join(S, 'www')
os.makedirs(f'{W}/specs', exist_ok=True)

# pack code: (name, page, licence, folder under x/)
L = {
 'KC': ('KayKit City Builder Bits 1.0 (free)', 'https://kaylousberg.itch.io/city-builder-bits', 'CC0', 'kaylousberg-city-builder-bits'),
 'KX': ('KayKit Holiday Bits 1.0 (free)', 'https://kaylousberg.itch.io/holiday-bits', 'CC0', 'kaylousberg-holiday-bits'),
 'KR': ('KayKit Restaurant Bits 1.0 (free)', 'https://kaylousberg.itch.io/restaurant-bits', 'CC0', 'kaylousberg-restaurant-bits'),
 'KS': ('KayKit Resource Bits 1.0 (free)', 'https://kaylousberg.itch.io/resource-bits', 'CC0', 'kaylousberg-resource-bits'),
 'KB': ('KayKit Furniture Bits 1.0 (free)', 'https://kaylousberg.itch.io/furniture-bits', 'CC0', 'kaylousberg-furniture-bits'),
 'K1': ('KayKit Mixed Bag 1 (free)', 'https://kaylousberg.itch.io/mixed-bag-1', 'CC0', 'kaylousberg-mixed-bag-1'),
 'TP': ('Tiny Treats Pretty Park 1.0 (free)', 'https://tinytreats.itch.io/pretty-park', 'CC0', 'tinytreats-pretty-park'),
 'TH': ('Tiny Treats Homely House 1.0 (free)', 'https://tinytreats.itch.io/homely-house', 'CC0', 'tinytreats-homely-house'),
 'TG': ('Tiny Treats Fun Playground 1.0 (free)', 'https://tinytreats.itch.io/fun-playground', 'CC0', 'tinytreats-fun-playground'),
 'TK': ('Tiny Treats Bakery Interior 1.1 (free)', 'https://tinytreats.itch.io/bakery-interior', 'CC0', 'tinytreats-bakery-interior'),
 'TB': ('Tiny Treats Baked Goods 1.0 (free)', 'https://tinytreats.itch.io/baked-goods', 'CC0', 'tinytreats-baked-goods'),
 'TN': ('Tiny Treats Pleasant Picnic 1.0 (free)', 'https://tinytreats.itch.io/pleasant-picnic', 'CC0', 'tinytreats-pleasant-picnic'),
 'TC': ('Tiny Treats Charming Kitchen 1.1 (free)', 'https://tinytreats.itch.io/charming-kitchen', 'CC0', 'tinytreats-charming-kitchen'),
 'QA': ('Quaternius Farm Animals (animated)', 'https://quaternius.itch.io/lowpoly-animated-animals', 'CC0', 'quaternius-lowpoly-animated-animals'),
 'NC': ('Kenney Coaster Kit', 'https://opengameart.org/content/coaster-kit', 'CC0', 'kenney_coaster-kit'),
 'NM': ('Kenney Mini Shop 2.1', 'https://opengameart.org/content/mini-shop', 'CC0', 'kenney_mini-shop_2.1'),
 'NK': ('Kenney City Kit Commercial 2.1', 'https://opengameart.org/content/city-kit-commercial', 'CC0', 'kenney_city-kit-commercial_2.1'),
 'NP': ('Kenney Cube Pets', 'https://opengameart.org/content/cube-pets', 'CC0', 'kenney_cube-pets_1.0_0'),
 'NH': ('Kenney Holiday Kit', 'https://opengameart.org/content/holiday-kit', 'CC0', 'kenney_holiday-kit'),
 'NO': ('Kenney Food Kit', 'https://opengameart.org/content/food-kit', 'CC0', 'kenney_food-kit'),
 'NS': ('Kenney Survival Kit', 'https://opengameart.org/content/survival-kit', 'CC0', 'kenney_survival-kit'),
 'NB': ('Kenney City Kit Suburban 2.0', 'https://opengameart.org/content/city-kit-suburban', 'CC0', 'kenney_city-kit-suburban_2.0'),
}
PREF = ['/gltf/', '/glTF/', '/GLB format/', '/OBJ/', '/OBJ format/']
_cache = {}
def path(pack, name):
    """The served path (under www/x) of a pack's model file, preferring glTF/GLB folders."""
    root = os.path.join(X, L[pack][3])
    if root not in _cache:
        _cache[root] = [os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs if 'fbx' not in dp.lower()]
    hits = [p for p in _cache[root] if os.path.basename(p) == name]
    if not hits: raise SystemExit(f'missing {pack} {name}')
    hits.sort(key=lambda p: min([i for i, k in enumerate(PREF) if k in p] or [99]))
    return 'x/' + urllib.parse.quote(os.path.relpath(hits[0], X))

# Hue bands for recolouring (as in the first Station Picks) and the station's colours.
B = {'wood': {'hue': [6, 30], 'sat': [0.38, 0.8], 'val': [0.3, 0.9]},
     'orange': {'hue': [12, 40], 'sat': [0.45, 1], 'val': [0.5, 1]},
     'blue': {'hue': [180, 250], 'sat': [0.18, 0.9], 'val': [0.12, 1]},
     'yellow': {'hue': [41, 62], 'sat': [0.35, 1], 'val': [0.6, 1]},
     'red': {'hue': [340, 11], 'sat': [0.45, 1], 'val': [0.35, 1]},
     'green': {'hue': [90, 175], 'sat': [0.25, 1], 'val': [0.2, 0.9]},
     'white': {'hue': [0, 360], 'sat': [0, 0.12], 'val': [0.62, 1]},
     'grey': {'hue': [0, 360], 'sat': [0, 0.12], 'val': [0.18, 0.62]},
     'dark': {'hue': [0, 360], 'sat': [0, 0.3], 'val': [0, 0.3]},
     'brown': {'hue': [0, 40], 'sat': [0.3, 1], 'val': [0.12, 0.56]},
     'salmon': {'hue': [0, 40], 'sat': [0.2, 0.85], 'val': [0.56, 1]},
     'pink': {'hue': [300, 359], 'sat': [0.2, 1], 'val': [0.3, 1]},
     'warm': {'hue': [0, 60], 'sat': [0.2, 1], 'val': [0.2, 1]}}
def rc(**m): return [{**B[k], 'to': v} for k, v in m.items()]
NAVY, BRASS, CREAM, RED, GREEN, TEAL, PLUM = '#34507A', '#E2B653', '#F3E9D2', '#B8434E', '#3F7A5E', '#3E8E86', '#7A4A6E'

CX, CZ = 6.6, 33.5  # an open stretch of the real platform beside the café car: the candidate bay
def M(pack, fname, dx=0, dz=0, fit=None, h=None, rot=0, pal=None, **k):
    d = {'url': path(pack, fname), 'x': CX + dx, 'z': CZ + dz, 'rot': rot, **k}
    if fit: d['fit'] = fit
    if h: d['h'] = h
    if pal: d['rc'] = rc(**pal)
    return d

EL, OPT = [], []
n = 0
def el(key, name, today, note='', group=''):
    EL.append({'key': key, 'name': name, 'today': today, 'note': note, 'options': [], 'group': group})
def opt(name, packs, why, models, zoom=0.6, rec=False, cam=None, extra=None):
    global n
    n += 1
    oid = f'T{n}'
    o = {'id': oid, 'el': EL[-1]['key'], 'name': name, 'packs': packs if isinstance(packs, list) else [packs], 'why': why,
         'zoom': max(zoom, 0.45), 'rec': rec, 'files': sorted({m['url'] for m in models}), 'models': models, 'cam': cam, 'extra': extra or {}}
    OPT.append(o); EL[-1]['options'].append(oid)

T = lambda x, z, y=1.0, zoom=0.8, **k: {'x': x, 'z': z, 'y': y, 'zoom': zoom, **k}

# ---- 1. the ticket office ------------------------------------------------------------------------------------------
el('booth', 'Ticket office', T(5.22, -1.9, 1.1), 'Today the Ticket Office upgrade is Kenney\'s market stall in navy over the counter: the owner finds it odd, not a level-up. Wanted: a little booking office with a window and a roof. Each option faces the camera here; in the game its ticket window would face the queue along the platform edge.', 'Ticket office')
def booking(panel, frame=None, roof=None, till=True):
    """A 1.1 m by 2.2 m booking office from Tiny Treats' bakery walls (2 m by 4 m panels at 0.55): two big windows at the front."""
    p = dict(brown=panel, salmon=panel, wood=panel)
    if frame: p['white'] = frame
    w = 'wall_modular_panelled_bakery_'
    out = [M('TK', f'{w}window_large_A.gltf', dx=0.55, dz=-0.55, scale=0.55, rot=90, pal=p), M('TK', f'{w}window_large_A.gltf', dx=0.55, dz=0.55, scale=0.55, rot=90, pal=p),
           M('TK', f'{w}window_small_A.gltf', dx=0, dz=1.18, scale=0.55, rot=0, pal=p), M('TK', f'{w}doorway.gltf', dx=0, dz=-1.18, scale=0.55, rot=0, pal=p),
           M('TK', f'{w}straight_A.gltf', dx=-0.6, dz=-0.55, scale=0.55, rot=90, pal=p), M('TK', f'{w}straight_A.gltf', dx=-0.6, dz=0.55, scale=0.55, rot=90, pal=p)]
    if roof: out += [M('TK', 'floor_wood.gltf', dx=0, dz=-0.68, fit=[1.65, 1.42], y=2.2, pal=dict(wood=roof, brown=roof, salmon=roof, dark=roof, grey=roof)), M('TK', 'floor_wood.gltf', dx=0, dz=0.68, fit=[1.65, 1.42], y=2.2, pal=dict(wood=roof, brown=roof, salmon=roof, dark=roof, grey=roof))]
    out += [M('TK', 'countertop_straight_A_short.gltf', dx=0.28, dz=0, fit=[0.5, 2.0], rot=90, pal=dict(brown=panel, salmon=panel, wood=panel))]
    if till: out += [M('TK', 'cash_register.gltf', dx=0.32, dz=-0.35, h=0.22, rot=90, on=True), M('TK', 'pricing_card.gltf', dx=0.38, dz=0.4, h=0.18, rot=90, on=True)]
    return out
opt('Booking office, navy and cream', 'TK', 'A real little building: Tiny Treats\' bakery walls (cream frames, panelled below two big windows, which become the ticket window) with the panelling in our navy, a counter, the till and a price card inside, under a flat plank roof. The same family as the café car\'s counter. Clearly a step up from the stand.', booking(NAVY, roof='#4E5D7E'), zoom=0.8, rec=True)
opt('Booking office, chocolate and cream', 'TK', 'The same office in the old railway colours: chocolate panelling and a slate roof.', booking('#5A3C30', roof='#6A7385'), zoom=0.8)
opt('Booking office, open top', 'TK', 'The same walls with no roof, like the carriages\' cut-away: the clerk and the till stay in view from the game\'s 48° camera. Reads less as a building.', booking(NAVY), zoom=0.8)
opt('Ticket hut', 'NC', 'Kenney\'s little enclosed booth with a gable roof (the coaster park\'s toilets kiosk, its round sign painted brass): cream walls, a navy roof. Cute and compact, but more toy than railway.', [M('NC', 'stall-toilets.glb', fit=[1.6, 1.7], rot=270, pal=dict(brown=NAVY, salmon=CREAM, green=BRASS, blue=NAVY))], zoom=0.7)
opt('Information booth', 'NC', 'Kenney\'s information booth: a roofed box with a window and a sign on top, in navy and cream. Reads as a booth at once; very theme park.', [M('NC', 'stall-information.glb', fit=[1.5, 1.7], rot=270, pal=dict(blue=NAVY, salmon=CREAM, brown=NAVY))], zoom=0.7)

# ---- 2. the fruit kiosk --------------------------------------------------------------------------------------------
el('kiosk', 'Fruit kiosk', T(9.2, 6.0, 1.0), 'Today: the same Kenney stall as the ticket office and the newsstand, in red. Wanted: something that reads as a greengrocer at a glance and looks like neither. Market umbrellas stand at the back so they never hide the goods from the 48° camera.', 'Fruit kiosk')
def fruit(dx, dz, y, k=1.0, on=None):
    on_ = {'on': on} if on else {}
    return [M('NO', 'apple.glb', dx=dx - 0.15, dz=dz - 0.25, h=0.16 * k, y=y, **on_), M('NO', 'orange.glb', dx=dx + 0.12, dz=dz - 0.12, h=0.16 * k, y=y, **on_),
            M('NO', 'pear.glb', dx=dx - 0.08, dz=dz + 0.1, h=0.2 * k, y=y, **on_), M('NO', 'watermelon.glb', dx=dx + 0.12, dz=dz + 0.3, h=0.22 * k, y=y, **on_)]
UMB = lambda col, dx=-0.85, dz=0: M('K1', f'umbrella_{col}.gltf', dx=dx, dz=dz, fit=[1.25, 1.25])
opt('Greengrocer\'s barrow', ['TG', 'NM', 'NO', 'K1'], 'Tiny Treats\' red wagon as the barrow, two of Kenney\'s fruit baskets on it, a watermelon and pears beside, KayKit\'s green market umbrella at the back. Low and open, nothing like a stall.', [
  M('TG', 'cart.gltf', fit=[1.0, 1.4], name='cart'), M('NM', 'display-fruit.glb', dz=-0.3, fit=[0.55, 0.55], on='cart', y=-0.05), M('NM', 'display-fruit.glb', dz=0.3, fit=[0.55, 0.55], rot=90, on='cart', y=-0.05),
  M('NO', 'watermelon.glb', dx=0.65, dz=0.45, h=0.25), M('NO', 'pear.glb', dx=0.7, dz=0.1, h=0.18), UMB('green')], zoom=0.7, rec=True)
opt('Fruit tables', ['TK', 'TN', 'NO', 'K1'], 'Two of Tiny Treats\' round bakery tables with bowls of grapes and fruit, a basket of apples on the ground, KayKit\'s yellow umbrella behind: a fruit seller\'s pitch.', [
  M('TK', 'table_round_B.gltf', dz=-0.45, fit=[0.7, 0.7], name='t1'), M('TK', 'table_round_B.gltf', dz=0.45, fit=[0.7, 0.7], name='t2'),
  M('TN', 'grapes_bowl.gltf', dz=-0.45, h=0.16, on='t1'), *fruit(0.0, 0.5, 0.0, 0.8, on='t2'), M('TK', 'basket_A.gltf', dx=0.55, dz=0.0, h=0.3), *fruit(0.55, 0.0, 0.2, 0.7), UMB('yellow')], zoom=0.7)
opt('Fruit stands', ['NM', 'NK'], 'Kenney\'s mini-shop fruit stands (baskets heaped with fruit on tiered displays) under Kenney\'s striped parasol: the simplest, in the locomotive\'s pack family.', [
  M('NM', 'display-fruit.glb', dz=-0.45, fit=[0.8, 0.8]), M('NM', 'display-fruit.glb', dz=0.45, fit=[0.8, 0.8], rot=90), M('NK', 'detail-parasol-b.glb', dx=-0.85, fit=[1.2, 1.2])], zoom=0.7)

# ---- 3. shops that bring the station to life -----------------------------------------------------------------------
el('bakery', 'Bakery stand', None, 'Shops the station has from the start (no upgrade): set dressing with a vendor, each in its own bay of the back lane.', 'Station shops')
opt('Pastry counter', ['TK', 'TB', 'K1'], 'Tiny Treats\' glass display case with cake stands of croissants and cinnamon rolls on it, a loaf and baguettes, KayKit\'s pink umbrella behind. The same pieces as the café car\'s counter, so the station matches the train.', [
  M('TK', 'display_case_long.gltf', fit=[0.75, 1.5], rot=90, name='case'), M('TK', 'pastry_stand_A_decorated.gltf', dz=-0.4, h=0.35, on='case'), M('TK', 'pastry_stand_B_decorated.gltf', dz=0.35, h=0.32, on='case'),
  M('TB', 'bread.gltf', dx=0.5, dz=0.75, h=0.16), M('TK', 'basket_B.gltf', dx=0.55, dz=-0.75, h=0.28), M('TB', 'baguette.gltf', dx=0.55, dz=-0.75, fit=[0.12, 0.45], y=0.12), UMB('pink')], zoom=0.75, rec=True)
opt('Bread display', ['NM', 'NK'], 'Kenney\'s mini-shop bread display and a small stand under a parasol: plainer shapes.', [
  M('NM', 'display-bread.glb', fit=[0.9, 1.1], rot=270), M('NM', 'display-small.glb', dx=0.2, dz=0.95, fit=[0.55, 0.55]), M('NK', 'detail-parasol-a.glb', dx=-0.85, fit=[1.2, 1.2])], zoom=0.7)

el('flowers', 'Flower seller', None, '', 'Station shops')
FL = lambda f, dx, dz, h=0.2, **k: M('TP', f, dx=dx, dz=dz, fit=[h * 2.2, h * 2.2], **k)
opt('Flower cart', ['TG', 'TP', 'TK'], 'Tiny Treats\' wagon heaped with their park flowers, two baskets of blooms beside it: a flower girl\'s cart.', [
  M('TG', 'cart.gltf', fit=[1.0, 1.4], name='cart'), *[FL(f, dx, dz, on='cart', y=-0.12) for f, dx, dz in [('flower_A.gltf', -0.12, -0.35), ('flower_B.gltf', 0.12, -0.12), ('flower_A.gltf', -0.1, 0.12), ('flower_B.gltf', 0.12, 0.35)]],
  M('TK', 'basket_A.gltf', dx=0.65, dz=-0.3, h=0.28), FL('flower_B.gltf', 0.65, -0.3, y=0.15), M('TK', 'basket_B.gltf', dx=0.65, dz=0.3, h=0.28), FL('flower_A.gltf', 0.65, 0.3, y=0.15)], zoom=0.65, rec=True)
opt('Flower stand', ['NM', 'TK', 'TP'], 'Kenney\'s mini-shop flower stand (pots of flowers on a tiered display) with a Tiny Treats basket of blooms.', [
  M('NM', 'display-flowers.glb', fit=[1.0, 1.0]), M('TK', 'basket_A.gltf', dx=0.65, dz=0.55, h=0.28), FL('flower_B.gltf', 0.65, 0.55, y=0.15)], zoom=0.6)

el('teacart', 'Tea and coffee cart', None, '', 'Station shops')
opt('Coffee counter', ['TK', 'TC', 'K1'], 'Tiny Treats\' little cupboard counter with the café\'s espresso machine, a kettle and stacked takeaway cups, KayKit\'s yellow umbrella behind. Matches the Café Car.', [
  M('TK', 'countertop_closet_B_small.gltf', fit=[0.75, 1.1], rot=90, name='c'), M('TK', 'coffee_machine.gltf', dz=-0.25, h=0.42, rot=90, on='c'),
  M('TK', 'coffee_cup_takeaway_stacked.gltf', dx=0.1, dz=0.2, h=0.25, on='c'), M('TC', 'kettle.gltf', dx=-0.1, dz=0.35, h=0.2, rot=90, on='c'), UMB('yellow')], zoom=0.65, rec=True)
opt('Drinks booth', ['NC', 'TN'], 'Kenney\'s coaster-park drinks booth (a striped awning over a counter, a big cup on the roof) in teal and cream, a teapot on the ground beside it.', [
  M('NC', 'stall-drinks.glb', fit=[1.4, 1.6], rot=270, pal=dict(blue=TEAL, salmon=CREAM, brown=TEAL)), M('TN', 'teapot.gltf', dx=0.75, dz=0.4, h=0.2)], zoom=0.75)

el('sweets', 'Sweet shop and ice-cream cart', None, '', 'Station shops')
opt('Ice-cream cart', ['NM', 'NK', 'NO'], 'Kenney\'s chest freezer with cones, a sundae and lollies on its lid, a striped parasol behind: an ice-cream seller.', [
  M('NM', 'freezer.glb', fit=[0.8, 1.2], rot=90, name='f'), M('NO', 'ice-cream.glb', dz=-0.3, h=0.22, on='f'), M('NO', 'sundae.glb', dz=0.05, h=0.2, on='f'),
  M('NO', 'popsicle.glb', dz=0.35, h=0.2, on='f'), M('NK', 'detail-parasol-b.glb', dx=-0.8, fit=[1.2, 1.2])], zoom=0.65, rec=True)
opt('Sweet stall', ['TK', 'TB', 'KX', 'K1'], 'Tiny Treats\' little counter with a cookie jar, cupcakes, donuts and macarons, KayKit\'s candy canes, a blue umbrella behind: a sweet shop.', [
  M('TK', 'countertop_closet_A_small.gltf', fit=[0.75, 1.1], rot=90, name='c'), M('TK', 'cookie_jar.gltf', dz=-0.3, h=0.3, on='c'),
  M('TB', 'cupcake.gltf', dx=0.12, dz=0.0, h=0.2, on='c'), M('TB', 'donut_pink.gltf', dx=-0.1, dz=0.15, h=0.1, on='c'), M('TK', 'macaron_pink.gltf', dx=0.1, dz=0.35, h=0.1, on='c'),
  M('KX', 'candycane_small.gltf', dx=-0.1, dz=0.4, h=0.3, on='c'), UMB('blue')], zoom=0.65)

el('shoeshine', 'Shoeshine stand', None, 'Ties to the night shift\'s shoe polishing.', 'Station shops')
BOOTS = dict(yellow='#5A3C30', salmon='#5A3C30', warm='#5A3C30')
opt('Shoeshine chair', ['KX', 'TH', 'NS', 'TK'], 'KayKit\'s red wing chair raised on a box, a footstool for the shoe, Tiny Treats\' boots waiting (painted brown) and polish tins: the shoeshine boy\'s pitch.', [
  M('NS', 'box-large.glb', fit=[0.75, 0.75], name='box'), M('KX', 'chair_large_red.gltf', fit=[0.75, 0.75], rot=90, on='box'),
  M('KX', 'footstool_brown.gltf', dx=0.65, h=0.3), M('TH', 'boots.gltf', dx=0.7, dz=0.55, h=0.24, pal=BOOTS), M('TK', 'tin_A_brown.gltf', dx=0.75, dz=-0.45, h=0.12), M('TK', 'tin_B_grey.gltf', dx=0.88, dz=-0.28, h=0.1)], zoom=0.6, rec=True)
opt('Shoeshine bench', ['TP', 'TH', 'TK'], 'Our platform bench for the customer, boots and polish tins in front: simpler, no raised seat.', [
  M('TP', 'bench.gltf', fit=[0.6, 1.6], rot=90, pal=dict(dark=NAVY)), M('TH', 'boots.gltf', dx=0.65, dz=-0.2, h=0.24, pal=BOOTS), M('TK', 'tin_A_brown.gltf', dx=0.7, dz=0.3, h=0.12)], zoom=0.6)

el('luggageoffice', 'Luggage office', None, '', 'Station shops')
opt('Parcels office', ['TK', 'TH', 'NM'], 'The booking office\'s walls in chocolate and cream as the parcels and left-luggage office: parcels on the counter, more stacked outside, the sack truck by the door.', booking('#5A3C30', roof='#3E4552', till=False) + [
  M('TK', 'scale.gltf', dx=0.32, dz=-0.4, h=0.22, rot=90, on=True), M('TH', 'package.gltf', dx=0.32, dz=0.35, h=0.2, on=True),
  M('TH', 'package.gltf', dx=0.95, dz=-0.55, h=0.32), M('TH', 'package.gltf', dx=0.95, dz=-0.2, h=0.24, rot=30), M('NM', 'hand-truck.glb', dx=0.95, dz=0.6, h=0.95, rot=90)], zoom=0.85, rec=True)
opt('Parcels counter', ['TK', 'TH', 'NM'], 'Tiny Treats\' panelled counter with a pair of scales and parcels on it, more parcels and the sack truck beside: open, no roof.', [
  M('TK', 'countertop_closet_A_large.gltf', fit=[0.75, 1.6], rot=90, name='c', pal=dict(brown='#5A3C30', salmon='#5A3C30', wood='#5A3C30')), M('TK', 'scale.gltf', dz=-0.45, h=0.25, on='c'), M('TH', 'package.gltf', dz=0.3, h=0.28, on='c'),
  M('TH', 'package.gltf', dx=0.7, dz=0.6, h=0.3), M('NM', 'hand-truck.glb', dx=0.7, dz=-0.6, h=0.95, rot=90)], zoom=0.7)

# ---- 4. Train Works ------------------------------------------------------------------------------------------------
el('works', 'Train Works shop', None, 'Where train upgrades are bought on the platform: tools, paint pots and parts, so it reads as "work on your train". Paint pots are Tiny Treats\' buckets painted red, navy and brass.', 'Train Works')
def pots(dx, dz, k=1.0):
    return [M('TG', 'bucket_A.gltf', dx=dx, dz=dz, h=0.3 * k, pal=dict(blue=RED, red=RED, yellow=RED, green=RED, pink=RED)),
            M('TG', 'bucket_A.gltf', dx=dx + 0.05, dz=dz + 0.35, h=0.3 * k, pal=dict(blue=NAVY, red=NAVY, yellow=NAVY, green=NAVY, pink=NAVY)),
            M('TG', 'bucket_B.gltf', dx=dx + 0.3, dz=dz + 0.15, h=0.28 * k, pal=dict(blue=BRASS, red=BRASS, yellow=BRASS, green=BRASS, pink=BRASS))]
opt('Works office', ['TK', 'NS', 'KS', 'TG'], 'The booking office\'s walls with brass panelling as the Train Works, a workbench with parts outside, paint pots and a big brass cog leaning by the door: a workshop, unmistakably.', booking(BRASS, roof=NAVY, till=False) + [
  M('KS', 'Parts_Cog.gltf', dx=0.32, dz=0.0, h=0.3, rot=90, on=True),
  M('NS', 'workbench.glb', dx=0.95, dz=-0.55, h=0.75, rot=270, name='wb'), M('KS', 'Parts_Pile_Small.gltf', dx=0.95, dz=-0.55, h=0.16, on='wb'), *pots(0.85, 0.15), M('KS', 'Parts_Cog.gltf', dx=1.0, dz=0.95, h=0.42, rot=20)], zoom=0.85, rec=True)
opt('Works yard', ['NS', 'KS', 'TG', 'NK'], 'An open yard: Kenney\'s workbench and grinder, KayKit\'s planks, parts and a jerrycan, paint pots, a striped awning on the wall behind.', [
  M('NS', 'workbench.glb', dz=-0.5, h=0.75, rot=270, name='wb'), M('KS', 'Parts_Pile_Small.gltf', dz=-0.5, h=0.16, on='wb'), M('NS', 'workbench-grind.glb', dz=0.5, h=0.7, rot=270),
  M('KS', 'Wood_Planks_Stack_Small.gltf', dx=-0.2, dz=1.1, fit=[0.5, 0.9]), M('KS', 'Fuel_C_Jerrycan.gltf', dx=0.6, dz=-0.95, h=0.32), *pots(0.6, -0.35), M('KS', 'Parts_Cog.gltf', dx=0.65, dz=0.6, h=0.4, rot=20)], zoom=0.75)
opt('Works counter', ['TK', 'KS', 'NS', 'TG'], 'Tiny Treats\' panelled counter with a cog, parts and a hammer on it and paint pots in front: the smallest, a counter rather than a shop.', [
  M('TK', 'countertop_closet_A_large.gltf', fit=[0.75, 1.6], rot=90, name='c', pal=dict(brown=NAVY, salmon=NAVY, wood=NAVY)), M('KS', 'Parts_Cog.gltf', dz=-0.4, h=0.3, rot=90, on='c'), M('KS', 'Parts_Pile_Small.gltf', dz=0.1, h=0.14, on='c'), M('NS', 'tool-hammer.glb', dz=0.45, h=0.06, on='c'), *pots(0.65, -0.35)], zoom=0.7)

# ---- 5. the tray ---------------------------------------------------------------------------------------------------
el('tray', 'Serving tray', None, 'For the conductor to carry food and drinks on. Shown on a small table at carrying height, each with a plate of food and a cup. Today the game draws a plain silver tray under the stack.', 'The tray')
tbl = lambda: M('TK', 'table_round_A.gltf', fit=[0.75, 0.75], name='tbl')
opt('Bakery tray: sandwich and tea', ['TK', 'TN'], 'Tiny Treats\' bakery serving tray (wood with handles and a checked cloth) with a sandwich on a plate and a mug: warm, the café counter\'s family.', [
  tbl(), M('TK', 'serving_tray.gltf', fit=[0.55, 0.4], on='tbl', name='tray'), M('TN', 'plate_A.gltf', dz=-0.09, h=0.025, on='tray', y=-0.03, name='plate'), M('TN', 'sandwich.gltf', dz=-0.09, h=0.08, on='plate'), M('TK', 'mug_A_blue.gltf', dz=0.15, h=0.1, on='tray', y=-0.03)], zoom=0.45, rec=True)
opt('Round tray: croissant and coffee', ['TN', 'TB', 'TK'], 'Tiny Treats\' round picnic tray with a croissant on a plate and a cup of coffee.', [
  tbl(), M('TN', 'serving_tray_round.gltf', fit=[0.48, 0.48], on='tbl', name='tray'), M('TK', 'plate.gltf', dz=-0.08, h=0.025, on='tray', y=-0.02, name='plate'), M('TB', 'croissant.gltf', dz=-0.08, h=0.07, on='plate'), M('TK', 'mug_B.gltf', dx=0.05, dz=0.13, h=0.1, on='tray', y=-0.02)], zoom=0.45)
opt('Square tray: burger and coffee', ['TN', 'NO'], 'Tiny Treats\' square tray with Kenney\'s burger on a plate and a cup of coffee: the owner\'s burger.', [
  tbl(), M('TN', 'serving_tray_square_A.gltf', fit=[0.55, 0.4], on='tbl', name='tray'), M('NO', 'plate.glb', dz=-0.09, h=0.025, on='tray', y=-0.02, name='plate'), M('NO', 'burger.glb', dz=-0.09, h=0.1, on='plate'), M('NO', 'cup-coffee.glb', dz=0.15, h=0.1, on='tray', y=-0.02)], zoom=0.45)
opt('Square tray B: tea and cake', ['TN', 'TB'], 'The other Tiny Treats square tray with a teapot, a mug and a slice of strawberry cake.', [
  tbl(), M('TN', 'serving_tray_square_B.gltf', fit=[0.55, 0.4], on='tbl', name='tray'), M('TN', 'teapot.gltf', dx=0.03, dz=0.14, h=0.14, on='tray', y=-0.02), M('TB', 'cake_strawberry_slice.gltf', dz=-0.12, h=0.09, on='tray', y=-0.02), M('TN', 'mug.gltf', dx=-0.08, dz=0.02, h=0.09, on='tray', y=-0.02)], zoom=0.45)

# ---- 6. the train's outside ----------------------------------------------------------------------------------------
WX = 2.62  # the carriage's platform-side wall
el('windowbox', 'Window flower boxes', T(3.6, 14.0, 0.8, zoom=0.8, exterior={'windowboxes': True}), 'Hung under each window on the platform side. Today: a drawn box of round blooms.', 'The train\'s outside')
ztrain = [-2.6, 0, 2.6]
WB = lambda dz: dict(dx=WX - CX + 0.12, dz=dz)
opt('Planter boxes', 'NB', 'Kenney\'s suburban planter (a timber box of clipped shrubs) stretched into a window box, in navy.', [M('NB', 'planter.glb', **WB(z), scale=0.45, stretch=[0.8, 0.7, 2.4], y=0.42, pal=dict(brown=NAVY, wood=NAVY, salmon=NAVY)) for z in ztrain], zoom=0.65, cam={'x': 4.2, 'z': CZ})
opt('Planters of flowers', ['NB', 'TP'], 'The same stretched planter with Tiny Treats\' park flowers growing over the shrubs: cottage-garden colour. The planter reads small from the 48° camera.', [x for z in ztrain for x in (M('NB', 'planter.glb', **WB(z), scale=0.45, stretch=[0.8, 0.7, 2.4], y=0.42, pal=dict(brown='#5A3C30', wood='#5A3C30', salmon='#5A3C30')), FL('flower_A.gltf', WX - CX + 0.14, z - 0.25, h=0.22, y=0.62), FL('flower_B.gltf', WX - CX + 0.14, z + 0.22, h=0.22, y=0.62))], zoom=0.65, cam={'x': 4.2, 'z': CZ})
opt('Hanging baskets', ['TK', 'TP'], 'Tiny Treats\' wicker baskets of flowers between the windows: the old station hanging basket, and the clearest of the three from the game\'s camera.', [x for z in ztrain for x in (M('TK', 'basket_A.gltf', **WB(z + 1.3), h=0.22, y=0.72), FL('flower_A.gltf', WX - CX + 0.14, z + 1.3, h=0.12, y=0.82))], zoom=0.65, cam={'x': 4.2, 'z': CZ}, rec=True)

el('lamps', 'Carriage lamps', T(3.6, 14.0, 1.0, zoom=0.8, exterior={'lamps': True}), 'Between the windows on the platform side. Today: drawn brass lamps.', 'The train\'s outside')
opt('Mini lanterns', 'KX', 'KayKit\'s little holiday lantern, brass and glass, on the wall between windows.', [M('KX', 'lantern_mini.gltf', **WB(z + 1.3), h=0.6, y=0.65) for z in ztrain], zoom=0.6, cam={'x': 4.2, 'z': CZ})
opt('Hanging lanterns', 'NH', 'Kenney\'s hanging holiday lantern on its bracket: the clearest from the game\'s camera, a proper carriage lamp.', [M('NH', 'lantern-hanging.glb', **WB(z + 1.3), h=0.65, y=0.55) for z in ztrain], zoom=0.6, cam={'x': 4.2, 'z': CZ}, rec=True)
opt('Lanterns', 'KX', 'KayKit\'s larger lantern (the one on the platform\'s lamp posts).', [M('KX', 'lantern.gltf', **WB(z + 1.3), h=0.6, y=0.6) for z in ztrain], zoom=0.6, cam={'x': 4.2, 'z': CZ})

el('carpet', 'Red carpet', T(3.8, 1.6, 0.2, zoom=0.75, exterior={'redcarpet': True}), 'Rolled out of the lobby door at stops. Today: a drawn red carpet with a gold edge.', 'The train\'s outside')
RUG = dict(dx=WX - CX + 1.05, fit=[2.0, 1.1], rot=90)
opt('Red and gold stripes', 'TK', 'Tiny Treats\' bakery rug, its stripes in red and gold: festive, unmistakably a welcome.', [M('TK', 'rug.gltf', **RUG, pal=dict(blue=RED, white=BRASS, pink=RED, red=RED))], zoom=0.6, cam={'x': 4.0, 'z': CZ}, rec=True)
opt('Bordered rug', 'KB', 'KayKit\'s rug with an inner border, in red: a carpet with a stitched edge.', [M('KB', 'rug_rectangle_stripes_A.gltf', **RUG, pal=dict(warm=RED, yellow=RED))], zoom=0.6, cam={'x': 4.0, 'z': CZ})
opt('Plain rug', 'KB', 'KayKit\'s plain rug in a deep wine red: the calmest.', [M('KB', 'rug_rectangle_A.gltf', **RUG, pal=dict(pink='#7E2A3A', red='#7E2A3A', warm='#7E2A3A'))], zoom=0.6, cam={'x': 4.0, 'z': CZ})

el('nameboards', 'Name boards', T(3.6, 14.0, 1.2, zoom=0.8, exterior={'nameboards': True}), 'No free stylised name board exists in these packs (the shop signs are blank boards on brackets or modern lettering): today\'s sign-written letterboard stays.', 'The train\'s outside')

# ---- 7. station life -----------------------------------------------------------------------------------------------
el('dog', 'A dog', None, 'At a traveller\'s heel or asleep by a bench. No free stylised cat in our style.', 'Station life')
opt('Pug', 'QA', 'Quaternius\' pug (animated: walk, idle, sit), flat-coloured like our people.', [M('QA', 'Pug.obj', h=0.35, rot=60)], zoom=0.45, rec=True)
opt('Cube dog', 'NP', 'Kenney\'s cube pet dog: cute, but blocky beside our rounded figures.', [M('NP', 'animal-dog.glb', h=0.35, rot=60)], zoom=0.45)

el('handcart', 'Handcarts and trolleys', None, 'Things a porter or a traveller pushes along. No free stylised pram or bicycle exists in these packs.', 'Station life')
opt('Sack truck with parcels', ['NM', 'TH'], 'Kenney\'s two-wheeled sack truck with Tiny Treats\' parcels on it: the porter\'s trolley.', [M('NM', 'hand-truck.glb', h=0.95, rot=90), M('TH', 'package.gltf', dx=0.12, h=0.25, y=0.1), M('TH', 'package.gltf', dx=0.12, h=0.2, y=0.36, rot=25)], zoom=0.5, rec=True)
opt('Child\'s wagon', ['TG', 'TP'], 'Tiny Treats\' little red wagon with a teddy-sized load of flowers, pulled along by a child.', [M('TG', 'cart.gltf', fit=[0.6, 0.85], name='cart'), FL('flower_B.gltf', 0, 0, h=0.14, on='cart', y=-0.08)], zoom=0.45)

el('newsbench', 'A bench with a newspaper', None, '', 'Station life')
opt('Park bench, a letter left behind', ['TP', 'TH'], 'Our platform bench (Tiny Treats) with a letter on the seat and a letter dropped beside it.', [M('TP', 'bench.gltf', fit=[0.6, 1.6], rot=90, pal=dict(dark=NAVY)), M('TH', 'letter.gltf', dz=-0.3, fit=[0.3, 0.3], y=0.43), M('TH', 'letter.gltf', dx=0.45, dz=0.3, h=0.03)], zoom=0.5, rec=True)
opt('Garden bench and a parcel', ['TH', 'K1'], 'Tiny Treats\' homely garden bench with a pile of papers and a parcel.', [M('TH', 'bench_A.gltf', fit=[0.6, 1.5], rot=90, pal=dict(blue=NAVY)), M('K1', 'comicbooks_stacked.gltf', dz=0.3, fit=[0.25, 0.25], y=0.43), M('TH', 'package.gltf', dx=0.5, dz=-0.4, h=0.25)], zoom=0.5)

el('picnic', 'Picnic on the verge', None, 'Townsfolk waiting on the forecourt grass past the railing.', 'Station life')
opt('Picnic blanket and basket', 'TN', 'Tiny Treats\' red plaid blanket with a basket, a teapot, a bowl of grapes and a thermos.', [M('TN', 'picnic_blanket_red.gltf', fit=[1.4, 1.4], raw=True), M('TN', 'picnic_basket_round.gltf', dx=-0.3, dz=-0.3, h=0.3), M('TN', 'teapot.gltf', dx=0.25, dz=0.2, h=0.18), M('TN', 'grapes_bowl.gltf', dx=0.3, dz=-0.25, h=0.12), M('TN', 'thermos.gltf', dx=-0.3, dz=0.35, h=0.25)], zoom=0.55, rec=True)

el('pigeons', 'Pigeons', None, 'Already in the game: Tiny Treats\' bird in pigeon grey on the platform. Shown here round a bread roll, a feeding spot by a bench.', 'Station life')
opt('Pigeons and bread', ['TP', 'TB'], 'Three Tiny Treats birds in pigeon grey round a bread roll.', [M('TP', 'bird.gltf', dx=dx, dz=dz, h=0.16, rot=r, pal=dict(blue='#8C93A6', yellow='#8C93A6', white='#B9BECB', red='#8C93A6')) for dx, dz, r in [(-0.2, -0.2, 30), (0.2, 0.0, 200), (-0.05, 0.3, 120)]] + [M('TB', 'bread_roll.gltf', dz=0.05, h=0.08)], zoom=0.45, rec=True)

# Today's pieces (world x, z, height to frame), with the upgrades that put them there.
for e in EL:
    t = e['today']
    if t: t.setdefault('crop', 0.55)
ZK = 1.0
LIGHT = lambda: [{'x': CX - 0.6, 'y': 3.0, 'z': CZ + 1.0, 'i': 3, 'd': 8}]
for o in OPT:
    cam = o['cam'] or {'x': CX, 'z': CZ}
    json.dump({'upgrades': [], 'cam': {'x': cam['x'], 'z': cam['z'], 'zoom': round(o['zoom'] * ZK, 3)}, 'lights': LIGHT(), 'models': o['models']}, open(f'{W}/specs/{o["id"]}.json', 'w'))
UP = ['booth', 'kiosk', 'benches', 'helper', 'posters']
for e in EL:
    t = e['today']
    if t:
        json.dump({'upgrades': UP, 'exterior': t.get('exterior'), 'cam': {'x': t['x'], 'z': t['z'], 'zoom': t['zoom']}, 'mark': {'x': t['x'], 'z': t['z'], 'y': t['y']}}, open(f'{W}/specs/today_{e["key"]}.json', 'w'))
bases = sorted({(o['zoom'], (o['cam'] or {'x': CX})['x']) for o in OPT})
for z, x in bases:
    json.dump({'upgrades': [], 'cam': {'x': x, 'z': CZ, 'zoom': round(z * ZK, 3)}, 'lights': LIGHT(), 'models': []}, open(f'{W}/specs/base_{z}_{x}.json', 'w'))
json.dump({'elements': EL, 'options': [{k: v for k, v in o.items() if k != 'models'} | {'lic': [list(L[p][:3]) for p in o['packs']]} for o in OPT], 'packs': {k: list(v) for k, v in L.items()}}, open(f'{S}/catalog.json', 'w'), indent=1)
print(len(EL), 'elements', len(OPT), 'options', 'bases', len(bases))
