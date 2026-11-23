# id: (pack dir under dl, file name, extra spec, destination folder under assets/models/src)
INFM = {'inflatables': 'Textures/inflatables_Diffuse.png', 'Balls': 'Textures/Balls_Diffuse.png'}
def inf(n): return ('og-inflatables', 'inflatables.glb', {'node': 'inflatable_' + n, 'maps': INFM}, 'loafbrr-inflatables')
P, W, N, F, FU, H = ('ok-pirate-kit', 'kenney-pirate'), ('ok-watercraft-kit', 'kenney-watercraft'), ('ok-nature-kit', 'kenney-nature'), ('ok-food-kit', 'kenney-food'), ('ok-furniture-kit', 'kenney-furniture'), ('ok-holiday-kit', 'kenney-holiday')
SU, CO, D1 = ('og-city-kit-suburban', 'kenney-suburban'), ('og-city-kit-commercial', 'kenney-commercial'), ('d1-summer', 'd1mee-summer')
TP, TB, TH = ('tt-fun-playground', 'tinytreats-playground'), ("tt-bubbly-bathroom", "tinytreats-bathroom-1.1"), ('tt-house-plants', 'tinytreats-plants')
KB, KF, KM, KP = ('kk-block-bits', 'kaykit-blocks'), ('kk-furniture-bits', 'kaykit-furniture'), ('kk-mixed-bag-1', 'kaykit-mixed'), ('kk-kaykit-platformer', 'kaykit-platformer')
def m(pk, f, extra=None): return (pk[0], f, extra or {}, pk[1])
PICKS = {
 # 1. coast scenery
 'palm_bend': m(P, 'palm-bend.glb'), 'palm_straight': m(P, 'palm-straight.glb'), 'palm_lean': m(P, 'palm-detailed-bend.glb'),
 'cypress': m(N, 'tree_tall.glb'),
 'villa_a': m(SU, 'building-type-a.glb'), 'villa_b': m(SU, 'building-type-d.glb'), 'villa_c': m(SU, 'building-type-h.glb'),
 'villa_d': m(SU, 'building-type-k.glb'), 'villa_e': m(SU, 'building-type-r.glb'),
 'sea_stack_a': m(P, 'rocks-sand-a.glb'), 'sea_stack_b': m(P, 'rocks-sand-b.glb'), 'rock_tall': m(N, 'rock_tallA.glb'), 'rock_flat': m(N, 'rock_largeC.glb'),
 'jetty': m(P, 'structure-platform-dock.glb'),
 'boat_sail': m(W, 'boat-sail-a.glb'), 'boat_sail_b': m(W, 'boat-sail-b.glb'), 'boat_fishing': m(W, 'boat-fishing-small.glb'),
 'boat_row': m(W, 'boat-row-small.glb'), 'yacht': m(W, 'boat-speed-e.glb'), 'boat_speed': m(W, 'boat-speed-c.glb'), 'buoy_flag': m(W, 'buoy-flag.glb'),
 'beach_umbrella_blue': m(D1, 'Umbrella_1.gltf'), 'beach_umbrella_red': m(D1, 'Umbrella_5.gltf'), 'beach_umbrella_orange': m(D1, 'Umbrella_4.gltf'),
 'beach_umbrella_shut': m(D1, 'Closed_umbrella_1.gltf'),
 # 2. station
 'awning': m(CO, 'detail-awning-wide.glb'), 'sun_lounger': m(D1, 'Sun_lounger_1.gltf'), 'sun_lounger_bare': m(D1, 'Sun_lounger_2.gltf'),
 'surfboard_green': m(D1, 'Surfboard_1.gltf'), 'surfboard_purple': m(D1, 'Surfboard_2.gltf'), 'surfboard_teal': m(D1, 'Surfboard_3.gltf'),
 'beach_towel_orange': m(D1, 'Towel_1.gltf'), 'beach_towel_green': m(D1, 'Towel_3.gltf'), 'beach_towel_blue': m(D1, 'Towel_5.gltf'),
 'lifebuoy': m(D1, 'Lifebuoy.gltf'), 'lifeguard_tower': m(D1, 'LifeGuardTower.gltf'), 'cool_box': m(D1, 'Box_3.gltf'), 'beach_ball': m(D1, 'Ball_1.gltf'),
 'starfish': m(D1, 'Star_1.gltf'), 'string_lights': m(H, 'lights-colored.glb'),
 'pot_terracotta': m(TH, 'pot_A_large.gltf'), 'pot_round': m(TH, 'pot_C_large.gltf'), 'pot_stack': m(TH, 'pots_stacked.gltf'),
 # 3. kids' play car
 'ball_pit': inf('BallPit_A'), 'ball_pit_round': inf('BallPit_C'), 'slide_inflatable': inf('Slide_A'),
 'slide_kids': m(TP, 'slide_A.gltf'), 'rocking_horse': m(TP, 'spring_horse_A.gltf'), 'seesaw': m(TP, 'seesaw_small.gltf'),
 'sandcastle': m(TP, 'sandcastle_A.gltf'), 'sand_bucket': m(TP, 'bucket_A.gltf'), 'sand_spade': m(TP, 'shovel_A.gltf'), 'soft_arch': m(TP, 'tire_pink.gltf'),
 'toy_block_red': m(KB, 'colored_block_red.gltf'), 'toy_block_blue': m(KB, 'colored_block_blue.gltf'), 'toy_block_green': m(KB, 'striped_block_green.gltf'),
 'plush_chick': m(KM, 'chicken_plushie_A.gltf'), 'puzzle_cube': m(KM, 'puzzlecube_complete.gltf'),
 'kids_table': m(KF, 'table_small.gltf'), 'kids_chair': m(KF, 'chair_A.gltf'), 'play_mat': m(KF, 'rug_rectangle_stripes_A.gltf'), 'play_mat_round': m(KF, 'rug_oval_B.gltf'),
 'play_ball_red': m(KP, 'ball_red.gltf'), 'play_ball_blue': m(KP, 'ball_blue.gltf'),
 # 4. spa car
 'spa_bench': m(FU, 'benchCushionLow.obj'), 'spa_towel_blue': m(TB, 'towel_blue.gltf'), 'spa_towel_pink': m(TB, 'towel_pink.gltf'), 'spa_towel_yellow': m(TB, 'towel_yellow.gltf'),
 'candle': m(TB, 'candle.gltf'), 'slippers': m(TB, 'slippers.gltf'), 'soap_dish': m(TB, 'soap_dish_pink.gltf'), 'lotion': m(TB, 'container_bathroom_A_pink.gltf'),
 'rubber_duck': m(TB, 'ducky.gltf'), 'spa_plant': m(TB, 'plant.gltf'), 'spa_stone': m(N, 'stone_smallFlatA.glb'), 'spa_stone_b': m(N, 'stone_smallFlatB.glb'),
 # 5. pool car
 'pool_ladder': ('og-pool-ladder', 'PoolLadder.obj', {}, 'plaggy-pool-ladder'),
 'ring_duck': inf('Tube_Duck_A'), 'ring_float': inf('Tube_A'), 'ring_lifesaver': inf('Tube_lifesaver'), 'ring_horseshoe': inf('Floater_A'),
 'pool_float': inf('Lounger_A'), 'float_dolphin': inf('Dolphin'),
 # 6. food
 'fish': m(F, 'fish.glb'), 'mussel': m(F, 'mussel.glb'), 'mussel_open': m(F, 'mussel-open.glb'),
 'lemon': m(F, 'lemon.glb'), 'lemon_half': m(F, 'lemon-half.glb'), 'orange': m(F, 'orange.glb'), 'pineapple': m(F, 'pineapple.glb'),
 'coconut_half': m(F, 'coconut-half.glb'), 'banana': m(F, 'banana.glb'), 'strawberry': m(F, 'strawberry.glb'),
 'smoothie': m(F, 'frappe.glb'), 'soda_glass': m(F, 'soda-glass.glb'), 'cone': m(F, 'ice-cream-cne.glb'), 'scoop_mint': m(F, 'ice-cream-scoop-mint.glb'),
 'scoop_choc': m(F, 'ice-cream-scoop-chocolate.glb'), 'ice_cup': m(F, 'ice-cream-cup.glb'), 'popsicle_choc': m(F, 'popsicle-chocolate.glb'),
 # 7. honeymoon suite
 'heart': m(KP, 'heart_red.gltf'), 'rose': m(N, 'flower_redA.glb'),
}
