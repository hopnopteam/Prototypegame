# The candidate catalogue for the Royal Suite picks: every option with its source, licence and render spec.
import json, os
W = '/tmp/claude-0/hunt/www'
PH = lambda n: f'ph/{n}/{n}_1k.gltf'
PHL = lambda n: f'https://polyhaven.com/a/{n}'
Q = 'dl/q-props/Exports/glTF/'
QH = 'dl/q-house/pack/OBJ/'
KK = 'dl/kk-furniture/KayKit_Furniture_Bits_1.0_FREE/Assets/gltf/'
KN = 'dl/kenney-furn/Models/'
TT = 'repo/'
QP_LINK = 'https://quaternius.itch.io/fantasy-props-megakit'
QH_LINK = 'https://opengameart.org/content/lowpoly-house-interior-pack'
KK_LINK = 'https://kaylousberg.itch.io/furniture-bits'
KN_LINK = 'https://opengameart.org/content/furniture-kit'
CC0 = 'CC0'
ROYAL = [
 # id, name, url, fit [w,d], rot, source, link, why, style
 ('R1', 'Gothic four-poster bed', PH('GothicBed_01'), [1.75, 2.15], 0, 'Poly Haven', PHL('GothicBed_01'), 'The only free four-poster worth the name: carved posts and a crown rail, red bedding. Heavy (18.7k tris): bake a simplified copy.', 'real'),
 ('R2', 'Vintage daybed (chaise)', PH('vintage_day_bed'), [1.05, 1.6], 90, 'Poly Haven', PHL('vintage_day_bed'), 'A carved daybed with a floral cushion: the chaise at the bed\'s foot or by the window.', 'real'),
 ('R3', 'Bergère armchair', PH('ArmChair_01'), [0.72, 0.72], 20, 'Poly Haven', PHL('ArmChair_01'), 'Carved black frame, pale upholstery: a pair by the fire reads instantly as a royal sitting room.', 'real'),
 ('R4', 'Camelback sofa', PH('sofa_03'), [1.35, 0.7], 20, 'Poly Haven', PHL('sofa_03'), 'A tufted, carved camelback settee: the centrepiece of the parlour corner.', 'real'),
 ('R5', 'Black lacquer sofa', PH('Sofa_01'), [1.35, 0.7], 20, 'Poly Haven', PHL('Sofa_01'), 'A curvy black leather sofa; strong silhouette against suede.', 'real'),
 ('R6', 'Leather ottoman trunk', PH('Ottoman_01'), [0.6, 0.45], 20, 'Poly Haven', PHL('Ottoman_01'), 'A buttoned ottoman for the foot of the bed.', 'real'),
 ('R7', 'Carved console (vanity)', PH('ClassicConsole_01'), [1.0, 0.45], 20, 'Poly Haven', PHL('ClassicConsole_01'), 'Cabriole legs and carving: a vanity or writing console under the window line.', 'real'),
 ('R8', 'Gothic commode', PH('GothicCommode_01'), [0.95, 0.5], 20, 'Poly Haven', PHL('GothicCommode_01'), 'A dark chest of drawers, low enough for the cut-away walls.', 'real'),
 ('R9', 'Gothic armoire', PH('GothicCabinet_01'), [0.95, 0.5], 20, 'Poly Haven', PHL('GothicCabinet_01'), 'A tall carved wardrobe. 12k tris, and tall: only against the far (lake-side) wall.', 'real'),
 ('R10', 'Lacquered folding screen', PH('chinese_screen_panels'), [1.1, 0.4], 20, 'Poly Haven', PHL('chinese_screen_panels'), 'Painted lacquer panels: a dressing corner in 784 triangles.', 'real'),
 ('R11', 'Grandfather clock', PH('vintage_grandfather_clock_01'), [0.45, 0.3], 20, 'Poly Haven', PHL('vintage_grandfather_clock_01'), 'A tall case clock in a corner: old money in one object (keep it at the back).', 'real'),
 ('R12', 'Gothic coffee table', PH('gothic_coffee_table'), [0.9, 0.55], 20, 'Poly Haven', PHL('gothic_coffee_table'), 'Heavily carved low table. 23.8k tris: too heavy as is; a baked low-poly copy would be needed.', 'real'),
 ('R13', 'Tall side table', PH('side_table_tall_01'), [0.4, 0.4], 0, 'Poly Haven', PHL('side_table_tall_01'), 'A round pedestal table for a lamp or flowers beside the armchairs.', 'real'),
 ('R14', 'Round coffee table', PH('coffee_table_round_01'), [0.75, 0.75], 0, 'Poly Haven', PHL('coffee_table_round_01'), 'Marble-topped round table for the sitting area.', 'real'),
 ('R15', 'Stone fireplace', QH + 'Fireplace.obj', [1.0, 0.45], 0, 'Quaternius House Interior', QH_LINK, 'A stylised fireplace (our house style). Nothing else free has one; a stove-fireplace is the suite\'s "centrepiece".', 'toy'),
 ('R16', 'Standing candelabra', Q + 'CandleStick_Stand.gltf', [0.35, 0.35], 0, 'Quaternius Fantasy Props', QP_LINK, 'A floor candelabra: light that stands on the floor (no chandeliers: the roof is cut away).', 'toy'),
 ('R17', 'Triple candlestick', Q + 'CandleStick_Triple.gltf', [0.3, 0.2], 0, 'Quaternius Fantasy Props', QP_LINK, 'A three-arm candlestick for the dinner table or the mantel.', 'toy'),
 ('R18', 'Carved candlestick', PH('wooden_candlestick'), [0.12, 0.12], 0, 'Poly Haven', PHL('wooden_candlestick'), 'A single tall candlestick, paired on the console.', 'real'),
 ('R19', 'Brass oil lamp', PH('vintage_oil_lamp'), [0.2, 0.2], 0, 'Poly Haven', PHL('vintage_oil_lamp'), 'A glass-chimney oil lamp for the bedside.', 'real'),
 ('R20', 'Antique vase', PH('antique_ceramic_vase_01'), [0.28, 0.28], 0, 'Poly Haven', PHL('antique_ceramic_vase_01'), 'A painted urn on a stand or the console.', 'real'),
 ('R21', 'Brass goblets (champagne service)', PH('brass_goblets'), [0.3, 0.2], 0, 'Poly Haven', PHL('brass_goblets'), 'Two brass goblets: the champagne service on the dinner table.', 'real'),
 ('R22', 'Marble bust', PH('marble_bust_01'), [0.25, 0.25], 0, 'Poly Haven', PHL('marble_bust_01'), 'A classical bust on the console: instant stately home.', 'real'),
 ('R23', 'Travel trunk', Q + 'Chest_Wood.gltf', [0.75, 0.45], 20, 'Quaternius Fantasy Props', QP_LINK, 'An iron-banded travel trunk at the bed\'s foot (stylised).', 'toy'),
 ('R24', 'Vintage suitcase', PH('vintage_suitcase'), [0.6, 0.35], 20, 'Poly Haven', PHL('vintage_suitcase'), 'A leather case with straps by the wardrobe.', 'real'),
 ('R25', 'Throw pillows', PH('throw_pillows_01'), [0.6, 0.35], 0, 'Poly Haven', PHL('throw_pillows_01'), 'Tasselled cushions to dress the sofa and bed.', 'real'),
 ('R26', 'Potted palm', PH('potted_plant_04'), [0.35, 0.35], 0, 'Poly Haven', PHL('potted_plant_04'), 'A potted plant for the corner by the window.', 'real'),
 ('R27', 'Floor lamp, fringed', QH + 'Light_Floor3.obj', [0.35, 0.35], 0, 'Quaternius House Interior', QH_LINK, 'A standing lamp beside the armchairs (stylised).', 'toy'),
 ('R28', 'Lectern bookstand', Q + 'BookStand.gltf', [0.45, 0.35], 20, 'Quaternius Fantasy Props', QP_LINK, 'An open book on a stand: the suite\'s library corner.', 'toy'),
]
FIRST = [
 ('F1', 'Soft double bed', KK + 'bed_double_A.gltf', [1.45, 1.95], 0, 'KayKit Furniture Bits', KK_LINK, 'KayKit\'s chunky double bed: our toy style, recoloured sapphire.', 'toy'),
 ('F2', 'Mid-century lounge chair', PH('mid_century_lounge_chair'), [0.75, 0.8], 20, 'Poly Haven', PHL('mid_century_lounge_chair'), 'A lounge chair and footstool: First Class reads as modern Pullman luxury, not palace.', 'real'),
 ('F3', 'Club armchair', PH('GreenChair_01'), [0.7, 0.7], 20, 'Poly Haven', PHL('GreenChair_01'), 'A green velvet club chair: Art Deco Pullman.', 'real'),
 ('F4', 'Modern armchair', PH('modern_arm_chair_01'), [0.72, 0.72], 20, 'Poly Haven', PHL('modern_arm_chair_01'), 'Leather and walnut lounge chair.', 'real'),
 ('F5', 'Rolled-arm sofa', QH + 'Couch_Large2.obj', [1.4, 0.7], 0, 'Quaternius House Interior', QH_LINK, 'A plump sofa in our toy style; recolour sapphire.', 'toy'),
 ('F6', 'Cushioned couch', KK + 'couch_pillows.gltf', [1.35, 0.7], 180, 'KayKit Furniture Bits', KK_LINK, 'KayKit couch with cushions.', 'toy'),
 ('F7', 'Cushioned armchair', KK + 'armchair_pillows.gltf', [0.7, 0.7], 200, 'KayKit Furniture Bits', KK_LINK, 'Matching KayKit armchair.', 'toy'),
 ('F8', 'Low sofa', PH('sofa_02'), [1.35, 0.7], 20, 'Poly Haven', PHL('sofa_02'), 'A grey modern sofa (2.7k tris).', 'real'),
 ('F9', 'Writing bureau', PH('vintage_wooden_drawer_01'), [0.9, 0.45], 20, 'Poly Haven', PHL('vintage_wooden_drawer_01'), 'A walnut chest that works as the writing desk.', 'real'),
 ('F10', 'Round pedestal table', PH('round_wooden_table_02'), [0.7, 0.7], 0, 'Poly Haven', PHL('round_wooden_table_02'), 'A dark round table for the lounge.', 'real'),
 ('F11', 'Side table', PH('side_table_01'), [0.45, 0.45], 0, 'Poly Haven', PHL('side_table_01'), 'A small round side table.', 'real'),
 ('F12', 'Nightstand', PH('ClassicNightstand_01'), [0.45, 0.4], 20, 'Poly Haven', PHL('ClassicNightstand_01'), 'A classic bedside table.', 'real'),
 ('F13', 'Standing lamp', KK + 'lamp_standing.gltf', [0.35, 0.35], 0, 'KayKit Furniture Bits', KK_LINK, 'KayKit floor lamp with a fabric shade.', 'toy'),
 ('F14', 'Globe floor lamp', KN + 'lampRoundFloor.obj', [0.3, 0.3], 0, 'Kenney Furniture Kit', KN_LINK, 'Kenney floor lamp, simple and clean.', 'toy'),
 ('F15', 'Champagne for two', TT + 'tinytreats-picnic/wine_bottle.gltf', [0.12, 0.12], 0, 'Tiny Treats Pleasant Picnic (in the game)', 'https://tinytreats.itch.io/pleasant-picnic', 'The bottle and glass already in the game, set on a side table.', 'toy'),
 ('F16', 'Chinese armchair', PH('chinese_armchair'), [0.65, 0.6], 20, 'Poly Haven', PHL('chinese_armchair'), 'A lacquered armchair; elegant, light frame (2.7k tris).', 'real'),
]
cat = {'royal': ROYAL, 'first': FIRST}
json.dump(cat, open('/tmp/claude-0/hunt/gen/catalog.json', 'w'))
LIGHTS = [{'x': 0.9, 'y': 2.0, 'z': 5.9, 'i': 7, 'd': 5}, {'x': 1.6, 'y': 1.4, 'z': 7.5, 'i': 3, 'd': 4}]
for group, tier in [('royal', 5), ('first', 4)]:
    for (i, name, url, fit, rot, *_r) in cat[group]:
        models = [{'url': url, 'x': 0.85, 'z': 5.9, 'fit': fit, 'rot': rot}]
        if i == 'F15':
            models = [{'url': PH('side_table_01'), 'x': 0.85, 'z': 5.9, 'fit': [0.45, 0.45]},
                      {'url': url, 'x': 0.8, 'z': 5.88, 'on': True, 'fit': fit},
                      {'url': TT + 'tinytreats-picnic/wine_glass.gltf', 'x': 0.95, 'z': 5.95, 'on': True, 'fit': [0.07, 0.07]}]
        if i in ('R21', 'R17', 'R18', 'R19', 'R20', 'R22'):
            models = [{'url': PH('side_table_tall_01'), 'x': 0.85, 'z': 5.9, 'fit': [0.42, 0.42]}, {**models[0], 'on': True}]
        spec = {'carriage': {'type': 'sleeper', 'tier': tier, 'clear': [0]}, 'cam': {'x': 0.8, 'z': 5.9, 'zoom': 0.42}, 'lights': LIGHTS, 'models': models}
        json.dump(spec, open(f'{W}/specs/{i}.json', 'w'))
print('ok')
