"""Bakes the CC0 models the game uses (assets/models/src/) into one compact binary (assets/models/models.bin) and its
index (src/world/models/modelIndex.ts, generated: do not edit).

Each glTF's palette texture is sampled at every vertex and stored as a vertex colour, so in the game a model is plain
vertex-coloured geometry that merges into the carriage and scenery meshes like every other prop (one draw per
material, no textures). Per model the index records its bounds, the height of its top surface over the middle of its
footprint (`top`: a bed's mattress, a table's top) and which end is taller (`tall`: a bed's headboard, -1 or +1 along z).

Binary layout, in this order: all positions (float32 xyz), all normals (int8 xyz, ×127), all colours (uint8 sRGB rgb),
all indices (uint16, relative to the model's first vertex). Offsets in the index count elements, not bytes.

Run: python3 -I scripts/assets/bake_models.py
"""
import base64, io, json, os, struct, sys, urllib.parse
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'models', 'src')
OUT_BIN = os.path.join(ROOT, 'assets', 'models', 'models.bin')
OUT_TS = os.path.join(ROOT, 'src', 'world', 'models', 'modelIndex.ts')

# id → source under assets/models/src: a path, or {src, paint (material name → sRGB hex), linear (OBJ Kd is linear),
# flip, hue: bake-time repaint of hue bands, see `repaint`}. Keep ids stable: the game names models by them. Flat-coloured models are painted in the KEY colours below, so
# the game recolours each part by its hue band (world/models/library.ts `KEY`, `paint`).
WOOD, COVER, CUSHION, METAL, LINEN, BLANKET, DARK = '#8A4A37', '#FBB856', '#68A8D4', '#7A7A7A', '#F2F2F2', '#4E8DBA', '#3A2A22'
QH = 'quaternius-house/'
# The tropical kit's colours by material role (sRGB).
TROP = {
    'bamboo': '#C9A65E', 'node': '#9C7A3E', 'straw': '#D9B46A', 'strawDark': '#B8904A', 'rattan': '#B9874E',
    'rattanDark': '#7E5A34', 'flame': '#FFB347', 'bulb': '#FFE2A8', 'cord': '#3A2A22', 'cushion': '#2EB3B0',
    'wood': '#A8784C', 'towel': '#F4F1E8', 'towelStripe': '#2FA7C0', 'pole': '#EDE6D6', 'canvasA': '#F7F1E3',
    'canvasB': '#E8604C', 'petal': '#E2304F', 'petalPink': '#F27BAA', 'petalYellow': '#F7C443', 'petalWhite': '#FBF5EE',
    'pistil': '#F7D24A', 'leaf': '#3E9A4A', 'leafDark': '#2C7A3A', 'appliance': '#F4F0E6', 'glass': '#CFE9EE',
    'smoothie': '#F48FA0', 'coconut': '#6B4A2E', 'coconutFlesh': '#F5EFE2', 'strawPink': '#F27BAA', 'stem': '#4E8A3E',
    'board': '#F7E3B5', 'boardStripe': '#2FA7C0',
    'woodDark': '#6E4A2E', 'sandWet': '#D2B888', 'bucket': '#2EA7D8', 'spade': '#F7C443', 'shell': '#F4E3D0',
    'shellPink': '#F2B6A8', 'starfish': '#E8743C', 'driftwood': '#BFB39F',
}
MODELS = {
    # KayKit Forest Nature Pack 1.0 (Kay Lousberg, CC0)
    'tree_round': 'kaykit-forest/Tree_1_A_Color1.gltf',
    'tree_cluster': 'kaykit-forest/Tree_2_A_Color1.gltf',
    'bush_round': 'kaykit-forest/Bush_1_A_Color1.gltf',
    'rock_round': 'kaykit-forest/Rock_1_A_Color1.gltf',
    # Quaternius Ultimate House Interior (CC0): the furniture, real proportions and thin legs (session 51)
    'chair_slat': {'src': QH + 'Chair_4.obj', 'paint': {'Wood': WOOD}},
    'chair_solid': {'src': QH + 'Chair_2.obj', 'paint': {'Wood_Dark': WOOD, 'Cushin': CUSHION}},
    'cafe_table': {'src': QH + 'Table_RoundSmall.obj', 'paint': {'Wood': WOOD}},
    'bar_stool': {'src': QH + 'Stool.obj', 'paint': {'Wood': METAL, 'Cushin': CUSHION}},
    'armchair': {'src': QH + 'Couch_Small1.obj', 'paint': {'Couch_Blue': COVER, 'Black': WOOD}},
    'couch': {'src': QH + 'Couch_Medium1.obj', 'paint': {'Couch_Blue': COVER, 'Black': WOOD}},
    'couch_long': {'src': QH + 'Couch_Large1.obj', 'paint': {'Red': COVER, 'DarkRed': '#D99A45'}},
    'bed_single': {'src': QH + 'Bed_Single.obj', 'paint': {'Wood': WOOD, 'White': LINEN, 'Grey': '#DADADA', 'Red': CUSHION, 'DarkRed': BLANKET}},
    'bed_double': {'src': QH + 'Bed_King.obj', 'paint': {'Wood': WOOD, 'White': LINEN, 'Grey': '#DADADA', 'Red': CUSHION, 'DarkRed': BLANKET}},
    'lamp_desk': {'src': QH + 'Light_Desk.obj', 'paint': {'Black': METAL, 'LightMetal': '#9A9A9A', 'White': '#FFF2D0'}},
    'lamp_floor': {'src': QH + 'Light_Stand1.obj', 'paint': {'LightMetal': METAL, 'White': COVER}},
    'toilet': {'src': QH + 'Bathroom_Toilet.obj', 'paint': {'White': LINEN}},
    'nightstand': {'src': QH + 'NightStand_1.obj', 'paint': {'Wood': WOOD, 'Metal': '#C8A050'}},
    'dresser': {'src': QH + 'Drawer_1.obj', 'paint': {'Wood': WOOD, 'Wood_Dark': '#6E3A2B', 'Wood_Light': '#A35E46'}},
    # Kenney Furniture Kit (CC0)
    'lamp_table': {'src': 'kenney-furniture/lampRoundTable.obj', 'paint': {'metal': METAL, 'lamp': COVER}},
    'tv': {'src': 'kenney-furniture/televisionVintage.obj', 'paint': {'wood': WOOD}},
    'coat_rack': {'src': 'kenney-furniture/coatRackStanding.obj', 'paint': {'wood': WOOD}},
    # samusaa Household (CC0)
    'dining_table': {'src': 'samusaa-household/dine_table_01.glb'},
    # Tiny Treats (Isa Lousberg, CC0): the café gear, food, washroom and park pieces
    'counter': 'tinytreats-bakery/counter_table.gltf',
    'espresso': 'tinytreats-bakery/coffee_machine.gltf',
    'till': 'tinytreats-bakery/cash_register.gltf',
    'display_case': 'tinytreats-bakery/display_case_short.gltf',
    'cake_stand': 'tinytreats-bakery/pastry_stand_A_decorated.gltf',
    'mug': 'tinytreats-bakery/mug_B.gltf',
    'takeaway': 'tinytreats-bakery/coffee_cup_takeaway.gltf',
    'plate': 'tinytreats-bakery/plate.gltf',
    'tray': 'tinytreats-bakery/serving_tray.gltf',
    'croissant': 'tinytreats-baked/croissant.gltf',
    'cinnamon_roll': 'tinytreats-baked/cinnamon_roll.gltf',
    'muffin': 'tinytreats-baked/muffin.gltf',
    'cake_slice': 'tinytreats-baked/cake_strawberry_slice.gltf',
    'stove': 'tinytreats-kitchen/stove.gltf',
    'kettle': 'tinytreats-kitchen/kettle.gltf',
    'teapot': 'tinytreats-picnic/teapot.gltf',
    'wine_glass': 'tinytreats-picnic/wine_glass.gltf',
    'wine_bottle': 'tinytreats-picnic/wine_bottle.gltf',
    'sandwich': 'tinytreats-picnic/sandwich.gltf',
    'plant_monstera': 'tinytreats-plants/monstera_plant_medium_potted.gltf',
    'plant_pothos': 'tinytreats-plants/pothos_plant_medium_potted.gltf',
    'plant_snake': 'tinytreats-plants/sansevieria_plant_medium_potted.gltf',
    'bath': 'tinytreats-bathroom/bath.gltf',
    'vanity': 'tinytreats-bathroom/cabinet_bathroom.gltf',
    'towels': 'tinytreats-bathroom/towel_stacked.gltf',
    'mirror': 'tinytreats-bathroom/mirror.gltf',
    'bathmat': 'tinytreats-bathroom/mat.gltf',
    'bench': 'tinytreats-park/bench.gltf',
    'street_lamp': 'tinytreats-park/street_lantern.gltf',
    'bin': 'tinytreats-park/trashcan.gltf',
    'hedge': 'tinytreats-park/hedge_straight.gltf',
    'postbox': 'tinytreats-house/mailbox.gltf',
    # Session 51b: the lobby counter's things, the station's planting and furniture
    'mug_stack': 'tinytreats-bakery/mug_B_stacked.gltf',
    'plate_stack': 'tinytreats-bakery/plate_stacked.gltf',
    'cookie_jar': 'tinytreats-bakery/cookie_jar.gltf',
    'milk': 'tinytreats-bakery/milk.gltf',
    'bowl': 'tinytreats-picnic/bowl.gltf',
    'thermos': 'tinytreats-picnic/thermos.gltf',
    'book': 'kaykit-furniture/book_single.gltf',
    'park_bush': 'tinytreats-park/bush.gltf',
    'park_bush_large': 'tinytreats-park/bush_large.gltf',
    'park_tree': 'tinytreats-park/tree.gltf',
    'park_tree_large': 'tinytreats-park/tree_large.gltf',
    'flower_white': 'tinytreats-park/flower_A.gltf',
    'flower_blue': 'tinytreats-park/flower_B.gltf',
    'grass_tuft': 'tinytreats-park/grass_A.gltf',
    'cobbles': 'tinytreats-park/cobble_stones.gltf',
    'fence': 'tinytreats-house/fence_straight_long.gltf',
    'fence_post': 'tinytreats-house/fence_post.gltf',
    'bench_back': 'tinytreats-house/bench_A.gltf',
    'foliage': 'tinytreats-house/foliage_A.gltf',
    # Kenney Train Kit (CC0): the locomotive
    'locomotive': 'kenney-train/train-locomotive-c.glb',
    'tender': 'kenney-train/train-carriage-coal.glb',
    # KayKit Restaurant Bits (CC0) and Kenney Food Kit (CC0): plated food
    'dinner': 'kaykit-restaurant/food_dinner.gltf',
    'stew': 'kaykit-restaurant/food_stew.gltf',
    'soup': 'kenney-food/bowl-soup.glb',
    'cocktail': 'kenney-food/cocktail.glb',
    # Session 55: the station, the owner's picks from the Station Picks page (all CC0)
    'stall_red': 'kenney-town/stall-red.glb',            # Kenney Fantasy Town Kit 2.0
    'stall_green': 'kenney-town/stall-green.glb',
    'signpost': 'kenney-survival/signpost.glb',          # Kenney Survival Kit
    'planter_box': 'kenney-suburban/planter.glb',        # Kenney City Kit Suburban 2.0
    'station_house': 'tinytreats-house/house.gltf',      # Tiny Treats Homely House 1.0
    'parcel': 'tinytreats-house/package.gltf',
    'notice_board': 'tinytreats-bakery/wall_sign_large.gltf',
    'bread': 'tinytreats-baked/bread.gltf',
    'bird': 'tinytreats-park/bird.gltf',
    'hedge_long': 'tinytreats-park/hedge_straight_long.gltf',
    'picnic_table': 'tinytreats-playground/picnic_table.gltf',  # Tiny Treats Fun Playground 1.0
    'pumpkin': 'kaykit-halloween/pumpkin_orange.gltf',
    'pumpkin_small': 'kaykit-halloween/pumpkin_orange_small.gltf',
    'pumpkin_yellow': 'kaykit-halloween/pumpkin_yellow_small.gltf',
    'hand_bell': 'kaykit-holiday/bell.gltf',             # KayKit Holiday Bits 1.0
    'carpet_rug': {'src': QH + 'Carpet_1.obj', 'linear': True},
    'sheep': {'src': 'quaternius-animals/Sheep.obj', 'linear': True},   # Quaternius Farm Animals
    'water_tower': {'src': 'quaternius-farm/WaterTower.obj', 'linear': True},  # Quaternius Farm Buildings
    # Session 57: the owner's Station Picks 2 (all CC0): the booking office, the fruit barrow, the station's shops, its life
    'wall_window': 'tinytreats-bakery/wall_modular_panelled_bakery_window_large_A.gltf',   # Tiny Treats Bakery Interior 1.1
    'wall_window_small': 'tinytreats-bakery/wall_modular_panelled_bakery_window_small_A.gltf',
    'floor_planks': 'tinytreats-bakery/floor_wood.gltf',
    'price_card': 'tinytreats-bakery/pricing_card.gltf',
    'display_case_long': 'tinytreats-bakery/display_case_long.gltf',
    'cake_stand_b': 'tinytreats-bakery/pastry_stand_B_decorated.gltf',
    'basket_round': 'tinytreats-bakery/basket_A.gltf',
    'basket_long': 'tinytreats-bakery/basket_B.gltf',
    'cupboard_small': 'tinytreats-bakery/countertop_closet_B_small.gltf',
    'takeaway_stack': 'tinytreats-bakery/coffee_cup_takeaway_stacked.gltf',
    'tin_brown': 'tinytreats-bakery/tin_A_brown.gltf',
    'tin_grey': 'tinytreats-bakery/tin_B_grey.gltf',
    'scales': 'tinytreats-bakery/scale.gltf',
    'baguette': 'tinytreats-baked/baguette.gltf',                 # Tiny Treats Baked Goods 1.0
    'wagon': 'tinytreats-playground/cart.gltf',                   # Tiny Treats Fun Playground 1.0
    'boots': 'tinytreats-house/boots.gltf',                       # Tiny Treats Homely House 1.0
    'letter': 'tinytreats-house/letter.gltf',
    'umbrella_green': 'kaykit-mixed/umbrella_green.gltf',         # KayKit Mixed Bag 1
    'umbrella_pink': 'kaykit-mixed/umbrella_pink.gltf',
    'umbrella_yellow': 'kaykit-mixed/umbrella_yellow.gltf',
    'wing_chair': 'kaykit-holiday/chair_large_red.gltf',          # KayKit Holiday Bits 1.0
    'footstool': 'kaykit-holiday/footstool_brown.gltf',
    'fruit_stand': 'kenney-minishop/display-fruit.glb',           # Kenney Mini Shop 2.1
    'freezer': 'kenney-minishop/freezer.glb',
    'sack_truck': 'kenney-minishop/hand-truck.glb',
    'parasol': 'kenney-commercial/detail-parasol-b.glb',          # Kenney City Kit Commercial 2.1
    'ice_cream': 'kenney-food/ice-cream.glb',                     # Kenney Food Kit
    'sundae': 'kenney-food/sundae.glb',
    'lolly': 'kenney-food/popsicle.glb',
    'box_large': 'kenney-survival/box-large.glb',                 # Kenney Survival Kit
    'pug': {'src': 'quaternius-animals/Pug.obj', 'linear': True},  # Quaternius Farm Animals
    # Route 2, the Riviera Coast Line (docs/riviera-assets/README.md: sources, licences, uses; all CC0). Kenney Pirate,
    # Nature, City Suburban/Commercial, Watercraft, Holiday and Food kits; Tiny Treats; KayKit; Quaternius. 'hue' repaints at bake time.
    # Coast scenery
    'palm_straight': "kenney-pirate/palm-straight.glb",
    'palm_bend': "kenney-pirate/palm-bend.glb",
    'palm_lush': "kenney-pirate/palm-detailed-bend.glb",
    'palm_slim': {"src": "kenney-nature/tree_palmTall.glb", "paint": {"leafsGreen": "#3F9A4A", "woodBark": "#B07A50"}},
    'cypress': {"src": "kenney-nature/tree_tall.glb", "paint": {"leafsGreen": "#3F7246", "woodBark": "#6E4A32"}},
    'lemon_tree': {"src": "quaternius-platformer/Bush_Fruit.gltf", "hue": [{"h": [330, 50], "s": [0.4, 1], "to": "#F2D23C"}]},
    'villa_a': {"src": "kenney-suburban/building-type-f.glb", "hue": [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]},
    'villa_b': {"src": "kenney-suburban/building-type-k.glb", "hue": [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]},
    'villa_c': {"src": "kenney-suburban/building-type-m.glb", "hue": [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]},
    'villa_d': {"src": "kenney-suburban/building-type-r.glb", "hue": [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]},
    'villa_e': {"src": "kenney-suburban/building-type-c.glb", "hue": [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]},
    'villa_cube': {"src": "kenney-suburban/building-type-p.glb", "hue": [{"h": [0, 360], "s": [0, 0.35], "v": [0, 0.5], "to": "#E8DFD0"}]},
    'lighthouse': {"src": "kenney-pirate/tower-complete-large.glb", "hue": [{"h": [190, 260], "s": [0.3, 1], "to": "#C8463A"}, {"h": [0, 360], "s": [0, 0.3], "v": [0.3, 1], "to": "#F4EFE6"}]},
    'sea_stack': {"src": "kenney-nature/rock_tallA.glb", "paint": {"dirt": "#C9C0AE", "grass": "#7FA45A"}},
    'coast_rock': {"src": "kenney-nature/stone_tallA.glb", "paint": {"stone": "#C9C0AE"}},
    'boulder': {"src": "quaternius-nature/Rock_4.obj", "linear": True},
    'sailboat': "kenney-watercraft/boat-sail-a.glb",
    'sailboat_b': "kenney-watercraft/boat-sail-b.glb",
    'fishing_boat': "kenney-watercraft/boat-fishing-small.glb",
    'rowboat': "kenney-watercraft/boat-row-small.glb",
    'yacht': "kenney-watercraft/boat-speed-e.glb",
    # Station (Amalfi)
    'awning': "kenney-commercial/detail-awning-wide.glb",
    'string_lights': "kenney-holiday/lights-colored.glb",
    'lantern_hang': "kenney-holiday/lantern-hanging.glb",
    'fountain': "tinytreats-park/fountain.gltf",
    'pot_terracotta': "tinytreats-plants/pot_A_large.gltf",
    'pot_white': "tinytreats-plants/Pot_D_large.gltf",
    'pots_stack': "tinytreats-plants/pots_stacked.gltf",
    'column': {"src": "kenney-nature/statue_column.glb", "paint": {"stone": "#EDE6D8", "stoneDark": "#C9C0AE"}},
    'crab': "quaternius-platformer/Crab.gltf",
    'sandcastle': "tinytreats-playground/sandcastle_A.gltf",
    'beach_bucket': "tinytreats-playground/bucket_A.gltf",
    'cool_box': "tinytreats-picnic/cooler.gltf",
    'radio': "tinytreats-picnic/radio.gltf",
    'beach_ball': "kaykit-platformer/ball.gltf",
    'menu_board': "kaykit-restaurant/menu.gltf",
    # Kids' Play Car
    'slide': "tinytreats-playground/slide_A.gltf",
    'spring_horse': "tinytreats-playground/spring_horse_A.gltf",
    'seesaw': "tinytreats-playground/seesaw_small.gltf",
    'toy_block': "kaykit-blocks/colored_block_red.gltf",
    'toy_block_stripe': "kaykit-blocks/striped_block_blue.gltf",
    'play_rug': "kaykit-furniture/rug_oval_A.gltf",
    'rug_stripes': "kaykit-furniture/rug_rectangle_stripes_A.gltf",
    'kids_table': "kaykit-furniture/table_small.gltf",
    'kids_chair': "kaykit-furniture/chair_C.gltf",
    'floor_cushion': "kaykit-furniture/pillow_A.gltf",
    'plushie': "kaykit-mixed/chicken_plushie_A.gltf",
    # Spa Car
    'candle': "tinytreats-bathroom/candle.gltf",
    'slippers': "tinytreats-bathroom/slippers.gltf",
    'towel_folded': "tinytreats-bathroom/towel_pink.gltf",
    'spa_bottle': "tinytreats-bathroom/container_bathroom_C_pink.gltf",
    'spa_plant': "tinytreats-bathroom/plant.gltf",
    'spa_cabinet': "kaykit-furniture/cabinet_small_decorated.gltf",
    # Pool Car
    'rubber_duck': "tinytreats-bathroom/ducky.gltf",
    'pool_shower': "tinytreats-bathroom/shower.gltf",
    # Seafood Diner, smoothie and ice-cream bar
    'fish': "kenney-food/fish.glb",
    'mussel': "kenney-food/mussel-open.glb",
    'skewer': "kenney-food/skewer.glb",
    'lemon': "kenney-food/lemon.glb",
    'lemon_half': "kenney-food/lemon-half.glb",
    'orange': "kenney-food/orange.glb",
    'pineapple': "kenney-food/pineapple.glb",
    'coconut_half': "kenney-food/coconut-half.glb",
    'banana': "kenney-food/banana.glb",
    'strawberry': "kenney-food/strawberry.glb",
    'cherries': "kenney-food/cherries.glb",
    'ice_cone': "kenney-food/ice-cream-cne.glb",
    'ice_cup': "kenney-food/ice-cream-cup.glb",
    'ice_scoop': "kenney-food/ice-cream-scoop-mint.glb",
    'smoothie': "kenney-food/frappe.glb",
    'soda_glass': "kenney-food/soda-glass.glb",
    'cake': "kenney-food/cake-birthday.glb",
    'chocolate': "kenney-food/chocolate.glb",
    # Honeymoon suite
    'heart': "kaykit-platformer/heart_red.gltf",
    'petal': {"src": "quaternius-stylized/Petal_1.gltf", "hue": [{"h": [0, 360], "s": [0.2, 1], "to": "#C8243A"}]},
    'rose': {"src": "kenney-nature/flower_redA.glb", "paint": {"grass": "#4E8A3A", "colorRed": "#C8243A"}},
    'present': "kaykit-holiday/present_A_red.gltf",
    # The Riviera revamp's tropical kit (art/blender/tropical_kit.py, our own, CC0): bamboo, thatch, rattan and flowers.
    **{k: {'src': 'tropical-kit/' + k + '.glb', 'paint': TROP} for k in (
        'bamboo_pole', 'thatch_strip', 'tiki_torch', 'pendant_woven', 'rattan_chair', 'bamboo_table', 'lounger', 'parasol',
        'hibiscus', 'lei', 'blender', 'coconut_drink', 'monstera', 'hammock', 'surf_sign')},
    # The beach set (art/blender/beach_kit.py): bevelled and subdivided pieces for the sand.
    **{k: {'src': 'tropical-kit/' + k + '.glb', 'paint': TROP} for k in (
        'deck_chair', 'sun_lounger', 'beach_parasol', 'sandcastle', 'bucket_spade', 'shells', 'starfish', 'driftwood', 'surfboard')},
}

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def lin_to_srgb(c):
    return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)


def srgb_to_lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def read_accessor(g, bufs, i):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    fmt, size = COMPONENT[a['componentType']]
    n = SIZE[a['type']]
    stride = v.get('byteStride', size * n)
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    data = bufs[v['buffer']]
    out = []
    for k in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, data, start + k * stride))
    if a.get('normalized') and fmt in 'bBhH':
        scale = {'b': 127, 'B': 255, 'h': 32767, 'H': 65535}[fmt]
        out = [tuple(c / scale for c in t) for t in out]
    return out


def quat_matrix(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def node_transform(node):
    """(3×3 linear, translation) of a node's own TRS."""
    if 'matrix' in node:
        m = node['matrix']
        return [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]], [m[12], m[13], m[14]]
    r = quat_matrix(node.get('rotation', [0, 0, 0, 1]))
    s = node.get('scale', [1, 1, 1])
    lin = [[r[i][j] * s[j] for j in range(3)] for i in range(3)]
    return lin, node.get('translation', [0, 0, 0])


def compose(a, b):
    """Parent (lin, t) applied after child (lin, t)."""
    la, ta = a
    lb, tb = b
    lin = [[sum(la[i][k] * lb[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    t = [sum(la[i][k] * tb[k] for k in range(3)) + ta[i] for i in range(3)]
    return lin, t


def read_uri(d, uri):
    """A glTF buffer or image: a file beside the .gltf, or embedded as a base64 data URI (Quaternius' packs)."""
    if uri.startswith('data:'):
        return base64.b64decode(uri.split(',', 1)[1])
    return open(os.path.join(d, urllib.parse.unquote(uri)), 'rb').read()


def load_gltf(path):
    """(json, buffers, image loader) for a .gltf or a .glb."""
    d = os.path.dirname(path)
    if path.lower().endswith('.glb'):
        raw = open(path, 'rb').read()
        off, chunks = 12, []
        while off < len(raw):
            ln, kind = struct.unpack_from('<II', raw, off)
            chunks.append((kind, raw[off + 8: off + 8 + ln]))
            off += 8 + ln
        g = json.loads(chunks[0][1])
        bufs = [chunks[1][1]] if len(chunks) > 1 else []
    else:
        g = json.load(open(path))
        bufs = [read_uri(d, b['uri']) for b in g.get('buffers', [])]

    def image(i):
        im = g['images'][i]
        if 'uri' in im:
            return Image.open(io.BytesIO(read_uri(d, im['uri']))).convert('RGB')
        v = g['bufferViews'][im['bufferView']]
        o = v.get('byteOffset', 0)
        return Image.open(io.BytesIO(bufs[v['buffer']][o:o + v['byteLength']])).convert('RGB')
    return g, bufs, image


def bake_gltf(path, paint):
    g, bufs, image = load_gltf(path)
    textures = {}
    pos, nor, col, idx = [], [], [], []

    def material_color(mat_i):
        mat = g['materials'][mat_i] if mat_i is not None else {}
        name = mat.get('name', '')
        if name in paint:
            return ('srgb', hex_rgb(paint[name])), None
        pbr = mat.get('pbrMetallicRoughness', {})
        factor = pbr.get('baseColorFactor', [1, 1, 1, 1])
        tex = None
        if 'baseColorTexture' in pbr:
            src = g['textures'][pbr['baseColorTexture']['index']]['source']
            if src not in textures:
                textures[src] = image(src)
            tex = textures[src]
        return factor, tex

    def visit(ni, parent):
        node = g['nodes'][ni]
        xf = compose(parent, node_transform(node))
        lin, tr = xf
        if 'mesh' in node:
            for prim in g['meshes'][node['mesh']]['primitives']:
                if prim.get('mode', 4) != 4:
                    continue
                base = len(pos)
                p = read_accessor(g, bufs, prim['attributes']['POSITION'])
                n = read_accessor(g, bufs, prim['attributes']['NORMAL']) if 'NORMAL' in prim['attributes'] else None
                uv = read_accessor(g, bufs, prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else None
                factor, tex = material_color(prim.get('material'))
                flat = None
                if tex is None:
                    # an override is sRGB already; a glTF factor is linear
                    flat = factor[1] if factor[0] == 'srgb' else tuple(round(lin_to_srgb(float(c))) for c in factor[:3])
                px = tex.load() if tex else None
                for k in range(len(p)):
                    x, y, z = p[k]
                    pos.append(tuple(lin[i][0] * x + lin[i][1] * y + lin[i][2] * z + tr[i] for i in range(3)))
                    if n:
                        nx, ny, nz = n[k]
                        v = [lin[i][0] * nx + lin[i][1] * ny + lin[i][2] * nz for i in range(3)]
                        l = max(1e-9, sum(c * c for c in v) ** 0.5)
                        nor.append(tuple(c / l for c in v))
                    else:
                        nor.append(None)
                    if flat is not None:
                        col.append(flat)
                    elif uv:
                        u, w = uv[k]
                        c = px[int((u % 1) * tex.width) % tex.width, int((w % 1) * tex.height) % tex.height]
                        col.append(tuple(min(255, round(lin_to_srgb(srgb_to_lin(c[i]) * factor[i]))) for i in range(3)))
                    else:
                        col.append((255, 255, 255))
                ind = read_accessor(g, bufs, prim['indices']) if 'indices' in prim else [(i,) for i in range(len(p))]
                idx.extend(base + t[0] for t in ind)
        for c in node.get('children', []):
            visit(c, xf)

    ident = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0])
    scene = g['scenes'][g.get('scene', 0)] if g.get('scenes') else {'nodes': [i for i in range(len(g['nodes']))]}
    for ni in scene['nodes']:
        visit(ni, ident)
    fill_normals(pos, nor, idx)
    return pos, nor, col, idx


def fill_normals(pos, nor, idx):
    """Face normals for vertices that came without one."""
    if all(n is not None for n in nor):
        return
    acc = [[0.0, 0.0, 0.0] for _ in pos]
    for t in range(0, len(idx), 3):
        a, b, c = idx[t:t + 3]
        ux, uy, uz = (pos[b][i] - pos[a][i] for i in range(3))
        vx, vy, vz = (pos[c][i] - pos[a][i] for i in range(3))
        fn = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        for v in (a, b, c):
            for i in range(3):
                acc[v][i] += fn[i]
    for i, n in enumerate(nor):
        if n is None:
            l = max(1e-9, sum(c * c for c in acc[i]) ** 0.5)
            nor[i] = tuple(c / l for c in acc[i])


def bake_obj(path, paint, linear_kd):
    """A Wavefront OBJ with its MTL: one flat colour per material (Kd), split per face so normals stay as authored."""
    d = os.path.dirname(path)
    kd, cur = {}, None
    vs, vns = [], []
    pos, nor, col, idx = [], [], [], []
    mtl = None
    for line in open(path, encoding='utf-8', errors='replace'):
        if line.startswith('mtllib '):
            mtl = os.path.join(d, line.split(None, 1)[1].strip())
    if mtl and os.path.exists(mtl):
        name = None
        for line in open(mtl, encoding='utf-8', errors='replace'):
            t = line.split()
            if not t:
                continue
            if t[0] == 'newmtl':
                name = ' '.join(t[1:])
            elif t[0] == 'Kd' and name:
                kd[name] = tuple(float(v) for v in t[1:4])
    for line in open(path, encoding='utf-8', errors='replace'):
        t = line.split()
        if not t:
            continue
        if t[0] == 'v':
            vs.append(tuple(float(v) for v in t[1:4]))
        elif t[0] == 'vn':
            vns.append(tuple(float(v) for v in t[1:4]))
        elif t[0] == 'usemtl':
            cur = ' '.join(t[1:])
        elif t[0] == 'f':
            if cur in paint:
                c = hex_rgb(paint[cur])
            else:
                k = kd.get(cur, (0.8, 0.8, 0.8))
                c = tuple(round(lin_to_srgb(v)) if linear_kd else round(255 * v) for v in k)
            corners = []
            for f in t[1:]:
                parts = f.split('/')
                vi = int(parts[0])
                vi = vi - 1 if vi > 0 else len(vs) + vi
                ni = None
                if len(parts) > 2 and parts[2]:
                    ni = int(parts[2])
                    ni = ni - 1 if ni > 0 else len(vns) + ni
                corners.append((vi, ni))
            base = len(pos)
            for vi, ni in corners:
                pos.append(vs[vi])
                nor.append(vns[ni] if ni is not None else None)
                col.append(c)
            for k in range(1, len(corners) - 1):
                idx.extend((base, base + k, base + k + 1))
    fill_normals(pos, nor, idx)
    return pos, nor, col, idx


def bake(spec):
    if isinstance(spec, str):
        spec = {'src': spec}
    path = os.path.join(SRC, spec['src'])
    paint = spec.get('paint', {})
    if path.lower().endswith('.obj'):
        out = bake_obj(path, paint, spec.get('linear', False))
    else:
        out = bake_gltf(path, paint)
    if spec.get('hue'):
        out = (out[0], out[1], repaint(out[2], spec['hue']), out[3])
    if spec.get('flip'):
        # turn the model half way round about y, for models authored facing the other way
        p, n, c, i = out
        out = ([(-x, y, -z) for x, y, z in p], [(-x, y, -z) for x, y, z in n], c, i)
    return weld(*out)


def hsv(c):
    r, g, b = (v / 255 for v in c)
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    h = 0.0
    if d > 1e-6:
        h = ((g - b) / d) % 6 if mx == r else (b - r) / d + 2 if mx == g else (r - g) / d + 4
        h *= 60
    return h, (d / mx if mx > 0 else 0), mx


def in_band(v, band):
    lo, hi = band
    return lo <= v <= hi if lo <= hi else v >= lo or v <= hi


def repaint(col, rules):
    """Route 2 (riviera assets): repaints hue bands of a textured model at bake time (a suburban house's green roof in
    terracotta, a fruit bush's red fruit in lemon yellow), keeping each vertex's brightness relative to its band's average.
    Each rule: {h: [lo, hi] degrees (wraps), s: [lo, hi], v: [lo, hi], to: '#hex'}; the first rule that matches wins."""
    groups = [[] for _ in rules]
    for i, c in enumerate(col):
        h, s, v = hsv(c)
        for k, r in enumerate(rules):
            if in_band(h, r.get('h', [0, 360])) and in_band(s, r.get('s', [0, 1])) and in_band(v, r.get('v', [0, 1])):
                groups[k].append((i, v))
                break
    out = list(col)
    for k, r in enumerate(rules):
        if not groups[k]:
            continue
        mean = sum(v for _, v in groups[k]) / len(groups[k])
        to = hex_rgb(r['to'])
        for i, v in groups[k]:
            f = min(1.25, max(0.7, v / max(1e-4, mean)))
            out[i] = tuple(min(255, round(c * f)) for c in to)
    return out


def weld(pos, nor, col, idx):
    """Merges identical vertices (OBJ faces are split per corner)."""
    seen, remap, P, N, C = {}, [], [], [], []
    for i in range(len(pos)):
        key = (tuple(round(v, 5) for v in pos[i]), tuple(round(v, 3) for v in nor[i]), col[i])
        j = seen.get(key)
        if j is None:
            j = seen[key] = len(P)
            P.append(pos[i]); N.append(nor[i]); C.append(col[i])
        remap.append(j)
    return P, N, C, [remap[i] for i in idx]


def measure(pos):
    xs, ys, zs = zip(*pos)
    lo = [min(xs), min(ys), min(zs)]
    hi = [max(xs), max(ys), max(zs)]
    w, d = hi[0] - lo[0], hi[2] - lo[2]
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    # The top over the middle of the footprint (a mattress, a table top), not the headboard or a lamp shade.
    mid = [y for x, y, z in pos if abs(x - cx) < w * 0.25 and abs(z - cz) < d * 0.2]
    top = max(mid) if mid else hi[1]
    # Which end along z stands taller (a bed's headboard): -1 at min z, +1 at max z.
    near = max([y for x, y, z in pos if z < lo[2] + d * 0.15] or [0])
    far = max([y for x, y, z in pos if z > hi[2] - d * 0.15] or [0])
    tall = -1 if near > far + 1e-3 else 1 if far > near + 1e-3 else 0
    return lo, hi, top, tall


def main():
    positions, normals, colors, indices = [], [], [], []
    index = {}
    for mid, spec in MODELS.items():
        pos, nor, col, idx = bake(spec)
        if len(pos) > 65535:
            raise SystemExit(f'{mid}: too many vertices for uint16 indices')
        lo, hi, top, tall = measure(pos)
        index[mid] = {
            'vertex': len(positions), 'vertices': len(pos), 'index': len(indices), 'indices': len(idx),
            'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi], 'top': round(top, 4), 'tall': tall,
        }
        positions += pos
        normals += nor
        colors += col
        indices += idx
        print(f'{mid:14} {len(pos):5} verts {len(idx) // 3:5} tris  size {[round(h - l, 2) for l, h in zip(lo, hi)]} top {top:.2f} tall {tall}')
    with open(OUT_BIN, 'wb') as f:
        f.write(struct.pack(f'<{len(positions) * 3}f', *[c for p in positions for c in p]))
        f.write(struct.pack(f'<{len(normals) * 3}b', *[max(-127, min(127, round(c * 127))) for n in normals for c in n]))
        f.write(struct.pack(f'<{len(colors) * 3}B', *[c for col in colors for c in col]))
        if (len(colors) * 3 + len(normals) * 3) % 2:
            f.write(b'\0')
        f.write(struct.pack(f'<{len(indices)}H', *indices))
    os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)
    with open(OUT_TS, 'w') as f:
        f.write('// Generated by scripts/assets/bake_models.py: do not edit.\n')
        f.write('import type { ModelEntry } from \'./types\';\n\n')
        f.write(f'export const MODEL_TOTALS = {{ vertices: {len(positions)}, indices: {len(indices)} }};\n\n')
        f.write('export const MODEL_INDEX = ' + json.dumps(index, indent=2) + ' as const satisfies Record<string, ModelEntry>;\n')
    print('wrote', OUT_BIN, os.path.getsize(OUT_BIN), 'bytes;', len(positions), 'vertices', len(indices) // 3, 'triangles')


if __name__ == '__main__':
    sys.exit(main())
