# The stylised picks catalogue: every option, its source, and its render spec in the game's own stage.
import json, os
W = '/tmp/claude-0/hunt2/www'
KK = 'dl/furniture-bits/x/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/'
TB = 'dl/bubbly-bathroom/x/Tiny_Treats_Bubbly_Bathroom_1.1_FREE/Assets/gltf/'
TK = 'dl/bakery-interior/x/Tiny_Treats_Bakery_Interior_1.1_FREE/Assets/gltf/'
TP = 'dl/pleasant-picnic/x/Tiny_Treats_Pleasant_Picnic_1.0_FREE/Assets/gltf/'
TC = 'dl/charming-kitchen/x/Tiny_Treats_Charming_Kitchen_1.1_FREE/Assets/gltf/'
TH = 'dl/homely-house/x/Tiny_Treats_Homely_House_1.0_FREE/Assets/gltf/'
QH = 'dl/q-house/x/Ultimate House Interior Pack - June 2020/OBJ/'
KN = 'dl/kenney-furn/x/Models/'
G = 'src/'  # models already in the game
L = {'KK': ('KayKit Furniture Bits 1.0 (free)', 'https://kaylousberg.itch.io/furniture-bits', 'CC0'),
     'TB': ('Tiny Treats Bubbly Bathroom 1.1 (free)', 'https://tinytreats.itch.io/bubbly-bathroom', 'CC0'),
     'TK': ('Tiny Treats Bakery Interior 1.1 (free)', 'https://tinytreats.itch.io/bakery-interior', 'CC0'),
     'TP': ('Tiny Treats Pleasant Picnic 1.0 (free)', 'https://tinytreats.itch.io/pleasant-picnic', 'CC0'),
     'TC': ('Tiny Treats Charming Kitchen 1.1 (free)', 'https://tinytreats.itch.io/charming-kitchen', 'CC0'),
     'TH': ('Tiny Treats Homely House 1.0 (free)', 'https://tinytreats.itch.io/homely-house', 'CC0'),
     'QH': ('Quaternius Ultimate House Interior (June 2020)', 'https://opengameart.org/content/lowpoly-house-interior-pack', 'CC0'),
     'KN': ('Kenney Furniture Kit 1.0', 'https://opengameart.org/content/furniture-kit', 'CC0'),
     'OWN': ('Drawn for Night Express (this session)', '', 'ours')}
# Hue bands of the packs' atlases (KayKit and Tiny Treats share one gradient palette; Quaternius/Kenney MTL colours).
B = {'wood': {'hue': [6, 30], 'sat': [0.38, 0.8], 'val': [0.3, 0.9], 'ref': '#9B5A45'},
     'blue': {'hue': [180, 232], 'sat': [0.18, 0.9], 'val': [0.12, 1], 'ref': '#6FA6D6'},
     'yellow': {'hue': [31, 62], 'sat': [0.35, 1], 'val': [0.6, 1], 'ref': '#FBB856'},
     'red': {'hue': [340, 14], 'sat': [0.45, 1], 'val': [0.35, 1], 'ref': '#D2402A'},
     'teal': {'hue': [160, 185], 'sat': [0.3, 1], 'val': [0.3, 1], 'ref': '#4FA9A8'},
     'pink': {'hue': [315, 345], 'sat': [0.15, 0.8], 'val': [0.6, 1], 'ref': '#F2A7BE'},
     'green': {'hue': [90, 160], 'sat': [0.3, 1], 'val': [0.2, 0.75], 'ref': '#2E7D44'},
     'grey': {'hue': [0, 360], 'sat': [0, 0.12], 'val': [0.18, 0.62], 'ref': '#7A7A7A'},
     'peach': {'hue': [10, 40], 'sat': [0.12, 0.45], 'val': [0.6, 1], 'ref': '#E3B49A'},
     'dkwood': {'hue': [15, 45], 'sat': [0.2, 0.75], 'val': [0.08, 0.38], 'ref': '#3E2B1E'}}
def rc(**m): return [{**B[k], 'to': v} for k, v in m.items()]
# Palettes as recolour sets: P1 Crown Claret (Royal), P5 Sapphire Pullman (First).
ROY = dict(wood='#4A2A1A', blue='#7A1E32', yellow='#C9A24A', red='#7A1E32', teal='#C9A24A', dkwood='#3B2214')
ROY_SILK = dict(ROY, blue='#E6D3A3', yellow='#7A1E32')
FST = dict(wood='#5C2E21', blue='#2A4A92', yellow='#C9A24A', red='#2A4A92', teal='#C9A24A', dkwood='#5C2E21')
FST_IVORY = dict(FST, blue='#EFE6D2', yellow='#2A4A92')
LIGHT = lambda x=0.95, z=5.6, i=6: [{'x': x, 'y': 1.9, 'z': z, 'i': i, 'd': 5}]
def M(url, x, z, fit, rot=0, pal=None, **k):
    d = {'url': url, 'x': x, 'z': z, 'fit': fit, 'rot': rot, **k}
    if pal is not None: d['rc'] = rc(**pal)
    return d
# Each option: (id, name, pack, files, why, candidate models, game reference models or None, zoom)
OPT = []
def opt(i, name, pack, why, cand, ref=None, refname='', zoom=0.26, tier=None, rugs=None, files=None):
    OPT.append({'id': i, 'name': name, 'pack': pack, 'why': why, 'cand': cand, 'ref': ref, 'refname': refname, 'zoom': zoom, 'tier': tier, 'rugs': rugs or [], 'files': files or [c['url'] for c in cand]})
CX, RX, Z = 0.25, 1.6, 5.6
QBED = M(G + 'quaternius-house/Bed_King.obj', RX, Z, [1.3, 1.7], 0, ROY)
# ---------------- Royal ----------------
opt('R1', 'Double bed with tall head- and footboard', 'KK', 'KayKit\'s grandest bed: carved-looking panels front and back, plump pillows. In claret velvet and walnut it is the suite\'s centrepiece; the game\'s four-poster canopy can stand round it.', [M(KK + 'bed_double_B.gltf', CX + 0.15, Z, [1.3, 1.7], 0, ROY)], [QBED], 'Bed_King (Quaternius, in the game)')
opt('R2', 'Wingback armchair', 'KK', 'Chunky rounded arms and a tall back: reads as a wingback at thumb size. A pair by the fire in claret velvet.', [M(KK + 'armchair.gltf', CX, Z, [0.72, 0.72], 30, ROY)], [M(G + 'quaternius-house/Couch_Small1.obj', RX, Z, [0.72, 0.72], 30, ROY)], 'Couch_Small1 (Quaternius, in the game)')
opt('R3', 'Armchair with cushions', 'KK', 'The same chair dressed with a scatter cushion: champagne silk with a claret cushion, the salon\'s second pair.', [M(KK + 'armchair_pillows.gltf', CX, Z, [0.72, 0.72], 30, ROY_SILK)], [M(G + 'quaternius-house/Couch_Small1.obj', RX, Z, [0.72, 0.72], 30, ROY_SILK)], 'Couch_Small1 (Quaternius, in the game)')
opt('R4', 'Sofa with scatter cushions', 'KK', 'Soft, toy-like sofa with two cushions: champagne silk against the windows, facing the fire.', [M(KK + 'couch_pillows.gltf', CX + 0.1, Z, [1.3, 0.7], 30, ROY_SILK)], [M(G + 'quaternius-house/Couch_Medium1.obj', RX + 0.1, Z, [1.3, 0.7], 30, ROY_SILK)], 'Couch_Medium1 (Quaternius, in the game)')
opt('R5', 'Dresser with frame and plant', 'KK', 'A low chest of drawers already dressed with a standing photo frame and a potted plant: knee-high, so it never hides the room.', [M(KK + 'cabinet_medium_decorated.gltf', CX, Z, [0.95, 0.5], 30, ROY)], [M(G + 'quaternius-house/Drawer_1.obj', RX, Z, [0.95, 0.45], 30, ROY)], 'Drawer_1 (Quaternius, in the game)')
opt('R6', 'Vanity with a standing mirror', 'KK', 'A small cabinet with a tilted frame and a box on top: the dressing table, the frame read as a mirror once its face is silvered.', [M(KK + 'cabinet_small_decorated.gltf', CX, Z, [0.5, 0.5], 30, ROY)], [M(G + 'quaternius-house/NightStand_1.obj', RX, Z, [0.5, 0.5], 30, ROY)], 'NightStand_1 (Quaternius, in the game)')
opt('R7', 'Round mirror (on the vanity)', 'TB', 'Tiny Treats\' round bathroom mirror, stood on the vanity: the white rim painted gold.', [M(KK + 'cabinet_small.gltf', CX, Z, [0.5, 0.5], 0, ROY), M(TB + 'mirror.gltf', CX, Z - 0.1, [0.42, 0.06], 0, dict(ROY), on=True)], [M(G + 'tinytreats-bathroom/mirror.gltf', RX, Z, [0.42, 0.06], 0)], 'mirror (Tiny Treats, in the washrooms)', files=[TB + 'mirror.gltf'])
opt('R8', 'Low coffee table', 'KK', 'A chunky low table with rounded legs for the salon: the champagne and the cake stand stand on it.', [M(KK + 'table_low.gltf', CX, Z, [0.85, 0.55], 30, ROY)], [M(G + 'quaternius-house/Table_RoundSmall.obj', RX, Z, [0.6, 0.6], 0, ROY)], 'Table_RoundSmall (Quaternius, in the game)')
opt('R9', 'Side table', 'KK', 'A square side table for either side of the bed or the sofa: a lamp and books on it.', [M(KK + 'table_small.gltf', CX, Z, [0.45, 0.45], 30, ROY)], [M(G + 'quaternius-house/NightStand_1.obj', RX, Z, [0.45, 0.45], 30, ROY)], 'NightStand_1 (Quaternius, in the game)')
opt('R10', 'Claw-foot pedestal table', 'QH', 'A round table on a carved pedestal: afternoon tea for two. Same pack as the game\'s chairs and beds.', [M(QH + 'Table_RoundSmall2.obj', CX, Z, [0.6, 0.6], 0, ROY)], [M(G + 'quaternius-house/Table_RoundSmall.obj', RX, Z, [0.6, 0.6], 0, ROY)], 'Table_RoundSmall (Quaternius, in the game)')
opt('R11', 'Standing lamp', 'KK', 'A fabric shade on a slim stem: warm light standing on the floor in the corners (nothing hangs from the cut-away roof).', [M(KK + 'lamp_standing.gltf', CX, Z, [0.32, 0.32], 0, ROY)], [M(G + 'quaternius-house/Light_Stand1.obj', RX, Z, [0.32, 0.32], 0, ROY)], 'Light_Stand1 (Quaternius, in the game)', zoom=0.3)
opt('R12', 'Table lamp', 'KK', 'A soft pleated shade for the nightstands and the vanity.', [M(KK + 'table_small.gltf', CX, Z, [0.45, 0.45], 0, ROY), M(KK + 'lamp_table.gltf', CX, Z, [0.24, 0.24], 0, ROY, on=True)], [M(KK + 'table_small.gltf', RX, Z, [0.45, 0.45], 0, ROY), M(G + 'kenney-furniture/lampRoundTable.obj', RX, Z, [0.22, 0.22], 0, ROY, on=True)], 'lampRoundTable (Kenney, in the game)', zoom=0.22, files=[KK + 'lamp_table.gltf'])
opt('R13', 'Candle in a pot', 'TB', 'A chunky candle in a ceramic pot: candlelight on the mantel and the tea table, in the same toy style as the cups.', [M(KK + 'table_small.gltf', CX, Z, [0.45, 0.45], 0, ROY), M(TB + 'candle.gltf', CX, Z, [0.12, 0.12], 0, dict(yellow='#F2D27A'), on=True)], [M(KK + 'table_small.gltf', RX, Z, [0.45, 0.45], 0, ROY), M(G + 'quaternius-props/CandleStick.gltf', RX, Z, [0.16, 0.1], 0, on=True)], 'CandleStick (Quaternius, in the game)', zoom=0.16, files=[TB + 'candle.gltf'])
opt('R14', 'Macaron tea stand', 'TK', 'A tiered stand of macarons: afternoon tea in the suite, sweeter and grander than the café\'s cake stand.', [M(KK + 'table_low.gltf', CX, Z, [0.7, 0.45], 0, ROY), M(TK + 'pastry_stand_B_decorated.gltf', CX, Z, [0.24, 0.24], 0, on=True)], [M(KK + 'table_low.gltf', RX, Z, [0.7, 0.45], 0, ROY), M(G + 'tinytreats-bakery/pastry_stand_A_decorated.gltf', RX, Z, [0.24, 0.24], 0, on=True)], 'pastry_stand_A_decorated (Tiny Treats, in the café)', zoom=0.16, files=[TK + 'pastry_stand_B_decorated.gltf'])
opt('R15', 'Champagne on a tray', 'TP', 'A round tray, a bottle and two glasses: the bottle painted champagne green with a gold foil, the welcome drink.', [M(KK + 'table_low.gltf', CX, Z, [0.7, 0.45], 0, ROY), M(TP + 'serving_tray_round.gltf', CX, Z, [0.36, 0.36], 0, dict(wood='#C9A24A'), on=True), M(TP + 'wine_bottle.gltf', CX - 0.05, Z, [0.07, 0.07], 0, dict(green='#1E3A28', yellow='#D4AF5A', red='#D4AF5A'), on=True)], [M(KK + 'table_low.gltf', RX, Z, [0.7, 0.45], 0, ROY), M(G + 'tinytreats-picnic/wine_bottle.gltf', RX, Z, [0.07, 0.07], 0, on=True)], 'wine_bottle (Tiny Treats, in the game)', zoom=0.16, files=[TP + 'serving_tray_round.gltf', TP + 'wine_glass.gltf'])
opt('R17', 'Books and a standing photo', 'KK', 'A row of books and a standing frame for the bedside and the dresser: the suite looks lived in.', [M(KK + 'table_small.gltf', CX, Z, [0.45, 0.45], 0, ROY), M(KK + 'book_set.gltf', CX, Z, [0.2, 0.13], 0, dict(blue='#1F5C45', yellow='#C9A24A', red='#7A1E32', wood='#3B2214'), on=True)], [M(KK + 'table_small.gltf', RX, Z, [0.45, 0.45], 0, ROY), M(KK + 'pictureframe_standing_A.gltf', RX, Z, [0.16, 0.12], 0, dict(wood='#C9A24A'), on=True)], 'pictureframe_standing_A (KayKit, same pack)', zoom=0.16, files=[KK + 'book_set.gltf', KK + 'pictureframe_standing_A.gltf'])
opt('R18', 'Scatter cushions', 'KK', 'Two plump cushions to throw on the bed and the sofa, in claret and gold.', [M(KK + 'pillow_A.gltf', CX, Z, [0.4, 0.3], 20, dict(yellow='#C9A24A')), M(KK + 'pillow_B.gltf', CX + 0.5, Z, [0.4, 0.3], -20, dict(blue='#7A1E32'))], None, '', zoom=0.18, files=[KK + 'pillow_A.gltf', KK + 'pillow_B.gltf'])
opt('R20', 'Wireless set', 'TP', 'A vintage radio for the salon: old-money comfort, painted walnut and brass.', [M(KK + 'table_small.gltf', CX, Z, [0.45, 0.45], 0, ROY), M(TP + 'radio.gltf', CX, Z, [0.28, 0.2], 0, dict(teal='#4A2A1A', grey='#C9A24A', yellow='#C9A24A', red='#C9A24A'), on=True)], [M(KK + 'table_small.gltf', RX, Z, [0.45, 0.45], 0, ROY), M(G + 'kenney-furniture/televisionVintage.obj', RX, Z, [0.3, 0.22], 0, on=True)], 'televisionVintage (Kenney, in the game)', zoom=0.18, files=[TP + 'radio.gltf'])
opt('R21', 'Potted palm', 'QH', 'A tall palm in a pot for the far corner, from the same pack as the game\'s beds.', [M(QH + 'Houseplant_6.obj', CX, Z, [0.5, 0.5], 0)], [M(G + 'tinytreats-plants/monstera_plant_medium_potted.gltf', RX, Z, [0.5, 0.5], 0)], 'monstera (Tiny Treats, in the game)', zoom=0.24)
# ---------------- First Class ----------------
FB = lambda u, x, fit, rot=30, pal=FST, **k: M(u, x, Z, fit, rot, pal, **k)
opt('F1', 'Low double bed', 'KK', 'KayKit\'s simpler double: a slim headboard and a low foot, sleek rather than grand. Sapphire velvet over mahogany.', [FB(KK + 'bed_double_A.gltf', CX + 0.15, [1.3, 1.7], 0)], [M(G + 'quaternius-house/Bed_King.obj', RX, Z, [1.3, 1.7], 0, FST)], 'Bed_King (Quaternius, in the game)', tier=4)
opt('F2', 'Club sofa', 'KK', 'The KayKit sofa without cushions: a clean Pullman settee in sapphire against the end wall.', [FB(KK + 'couch.gltf', CX + 0.1, [1.3, 0.7])], [FB(G + 'quaternius-house/Couch_Medium1.obj', RX + 0.1, [1.3, 0.7])], 'Couch_Medium1 (Quaternius, in the game)', tier=4)
opt('F3', 'Club chair', 'KK', 'The rounded armchair in sapphire velvet: a pair either side of the champagne table.', [FB(KK + 'armchair.gltf', CX, [0.7, 0.7])], [FB(G + 'quaternius-house/Couch_Small1.obj', RX, [0.7, 0.7])], 'Couch_Small1 (Quaternius, in the game)', tier=4)
opt('F4', 'Deco lounge chair', 'KN', 'Kenney\'s boxy lounge chair: square-cut like 1930s Art Deco. Flatter than KayKit, so it reads more modern; a second direction for First.', [FB(KN + 'loungeChair.obj', CX, [0.7, 0.7], 30, dict(wood='#2A4A92', yellow='#2A4A92', red='#2A4A92', peach='#2A4A92'))], [FB(G + 'quaternius-house/Couch_Small1.obj', RX, [0.7, 0.7])], 'Couch_Small1 (Quaternius, in the game)', tier=4)
opt('F5', 'Upholstered writing chair', 'KK', 'A soft side chair for the writing desk: ivory with a mahogany frame.', [FB(KK + 'chair_C.gltf', CX, [0.45, 0.45], 30, FST_IVORY)], [FB(G + 'quaternius-house/Chair_2.obj', RX, [0.45, 0.45], 30, FST_IVORY)], 'Chair_2 (Quaternius, in the game)', tier=4, zoom=0.22)
opt('F6', 'Low bookcase with frame', 'KK', 'A knee-high shelf of books with a standing photo: the writing corner, never hiding the room.', [FB(KK + 'shelf_B_large_decorated.gltf', CX, [0.95, 0.4], 30, dict(FST, blue='#2A4A92', yellow='#C9A24A', red='#7A1E32'))], [FB(G + 'quaternius-house/Drawer_1.obj', RX, [0.95, 0.4])], 'Drawer_1 (Quaternius, in the game)', tier=4)
opt('F7', 'Round café table', 'TK', 'Tiny Treats\' round pedestal table, polished mahogany: the champagne table for two.', [FB(TK + 'table_round_A.gltf', CX, [0.6, 0.6], 0)], [FB(G + 'quaternius-house/Table_RoundSmall.obj', RX, [0.6, 0.6], 0)], 'Table_RoundSmall (Quaternius, in the game)', tier=4)
opt('F8', 'Deco table lamp', 'KN', 'A square shade on a square base: the Art Deco lamp for the bedside and the desk.', [FB(KK + 'table_small.gltf', CX, [0.45, 0.45], 0), M(KN + 'lampSquareTable.obj', CX, Z, [0.2, 0.2], 0, dict(grey='#C9A24A'), on=True)], [FB(KK + 'table_small.gltf', RX, [0.45, 0.45], 0), M(G + 'kenney-furniture/lampRoundTable.obj', RX, Z, [0.2, 0.2], 0, on=True)], 'lampRoundTable (Kenney, in the game)', tier=4, zoom=0.2, files=[KN + 'lampSquareTable.obj'])
opt('F9', 'Teapot on a tray', 'TP', 'The morning tea service: Tiny Treats\' teapot on a square tray, in ivory and sapphire.', [FB(KK + 'table_low.gltf', CX, [0.7, 0.45], 0), M(TP + 'serving_tray_square_A.gltf', CX, Z, [0.34, 0.26], 0, dict(wood='#C9A24A'), on=True), M(TP + 'teapot.gltf', CX, Z, [0.14, 0.12], 0, dict(teal='#EFE6D2', blue='#2A4A92'), on=True)], [FB(KK + 'table_low.gltf', RX, [0.7, 0.45], 0), M(G + 'tinytreats-picnic/teapot.gltf', RX, Z, [0.14, 0.12], 0, on=True)], 'teapot (Tiny Treats, in the game)', tier=4, zoom=0.16, files=[TP + 'serving_tray_square_A.gltf'])
opt('F10', 'Standing lamp', 'KK', 'The KayKit floor lamp, ivory shade on brass, for the lounge corner.', [FB(KK + 'lamp_standing.gltf', CX, [0.32, 0.32], 0, dict(FST, grey='#B8913A'))], [FB(G + 'quaternius-house/Light_Stand1.obj', RX, [0.32, 0.32], 0)], 'Light_Stand1 (Quaternius, in the game)', tier=4, zoom=0.3)
# ---------------- Rugs ----------------
RUGZ = 6.0
def rugopt(i, name, pack, why, cand, tier=5, rugs=None, files=None):
    for m in cand: m['y'] = 0.012
    opt(i, name, pack, why, cand, None, '', 0.34, tier, rugs, files)
RP = dict(yellow='#7A1E32', blue='#D4AF5A', wood='#3B2214', red='#7A1E32')
rugopt('G2', 'Oval rug', 'KK', 'A soft oval under the bed or the tea table, gold on claret.', [M(KK + 'rug_oval_A.gltf', 0.87, RUGZ, [1.6, 2.4], 90, dict(yellow='#C9A24A'))])
rugopt('G3', 'Rug with an inner border', 'KK', 'The plain KayKit rug with a framed edge, recoloured sapphire for First Class.', [M(KK + 'rug_rectangle_B.gltf', 0.87, RUGZ, [2.0, 2.8], 90, dict(blue='#2A4A92', yellow='#2A4A92'))], tier=4)
rugopt('G4', 'Bordered carpet', 'QH', 'Quaternius\' carpet with a fine contrasting border: claret with a gold line.', [M(QH + 'Carpet_1.obj', 0.87, RUGZ, [2.0, 2.8], 0, dict(red='#7A1E32', dkwood='#5A1424', yellow='#D4AF5A', wood='#5A1424'))])
rugopt('G5', 'Round bordered carpet', 'QH', 'The round version, for the salon round the tea table.', [M(QH + 'Carpet_Round.obj', 0.87, RUGZ, [1.8, 1.8], 0, dict(red='#1F3A7A', dkwood='#1F3A7A', yellow='#D4AF5A', wood='#1F3A7A'))], tier=4)
rugopt('G6', 'Round rug with an inner ring', 'KN', 'Kenney\'s round rug: one inner ring, very clean; ivory and gold.', [M(KN + 'rugRound.obj', 0.87, RUGZ, [1.7, 1.7], 0, dict(wood='#EFE6D2', yellow='#EFE6D2'))], tier=4)
rugopt('G7', 'Striped runner', 'TK', 'Tiny Treats\' striped rug as a runner down the suite, in claret and cream.', [M(TK + 'rug.gltf', 0.87, RUGZ, [1.0, 2.8], 90, dict(blue='#7A1E32'))])
def tex(name, x, z, w, d, rot=0): return [{'tex': f'rugtex2/{name}.png', 'x': x, 'z': z, 'w': w, 'd': d, 'y': 0.024, 'repeat': 1.0 / 1.0, 'rot': rot, 'fullimg': True}]
rugopt('G8', 'Painted medallion rug, claret', 'OWN', 'A flat painted rug in the game\'s own style: claret field, a gold diamond medallion, corner spandrels and a border of gold lozenges. No photo, a few flat colours.', [], rugs=tex('claret_medallion', 0.87, RUGZ, 2.0, 2.75))
rugopt('G9', 'Painted medallion rug, emerald', 'OWN', 'The same rug in emerald and gold (palette P2).', [], rugs=tex('emerald_medallion', 0.87, RUGZ, 2.0, 2.75))
rugopt('G10', 'Painted medallion rug, rose', 'OWN', 'Blush and dusty rose with gold (palette P3): light and romantic.', [], rugs=tex('rose_medallion', 0.87, RUGZ, 2.0, 2.75))
rugopt('G11', 'Painted trellis rug, sapphire', 'OWN', 'First Class: a gold trellis with ivory dots on sapphire, a navy border.', [], tier=4, rugs=tex('sapphire_trellis', 0.87, RUGZ, 2.0, 2.75))
rugopt('G12', 'Painted trellis rug, champagne', 'OWN', 'The lighter First Class version: champagne with a gold trellis and sapphire dots.', [], tier=4, rugs=tex('champagne_trellis', 0.87, RUGZ, 2.0, 2.75))
rugopt('G13', 'Painted lozenge carpet', 'OWN', 'Claret field with gold-and-sapphire lozenges in a navy border: a Pullman Persian, flat colours.', [], tier=4, rugs=tex('navy_persian', 0.87, RUGZ, 2.0, 2.75))
rugopt('G14', 'Painted runner, sapphire', 'OWN', 'A corridor runner with gold lozenges, for First Class.', [], tier=4, rugs=tex('sapphire_runner', 0.87, RUGZ, 0.8, 2.8))
rugopt('G15', 'Painted runner, claret', 'OWN', 'The Royal runner, claret and gold.', [], rugs=tex('claret_runner', 0.87, RUGZ, 0.8, 2.8))
for o in OPT:
    tier = o['tier'] or (4 if o['id'].startswith('F') else 5)
    zoom = o['zoom']
    cx = 0.9 if o['ref'] else (o['cand'][0]['x'] if o['cand'] and not o['id'].startswith('G') else 0.87)
    cz = Z if not o['id'].startswith('G') else RUGZ
    models = o['cand'] + (o['ref'] or [])
    json.dump({'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': cx, 'z': cz, 'zoom': 0.42}, 'lights': LIGHT(cx, cz), 'rugs': o['rugs'], 'models': models}, open(f'{W}/specs/{o["id"]}.json', 'w'))
json.dump([{k: v for k, v in o.items() if k not in ('cand', 'ref', 'rugs')} | {'lic': L[o['pack']]} for o in OPT], open('/tmp/claude-0/hunt2/catalog.json', 'w'), indent=1)
print(len(OPT))
