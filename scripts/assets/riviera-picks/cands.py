# category: [(pack dir, file name, extra spec)]
N, PI, WC, FD, FU, HO = 'ok-nature-kit', 'ok-pirate-kit', 'ok-watercraft-kit', 'ok-food-kit', 'ok-furniture-kit', 'ok-holiday-kit'
SUB, COM = 'og-city-kit-suburban', 'og-city-kit-commercial'
Q, D1, INF = 'q-150-lowpoly-nature-models', 'd1-summer', 'og-inflatables'
TTP, TTB, TTH, TTK, TTR = 'tt-fun-playground', 'tt-bubbly-bathroom', 'tt-house-plants', 'tt-pleasant-picnic', 'tt-pretty-park'
KKB, KKF, KKH, KKM, KKP, KKC, KKR, KKG = 'kk-block-bits', 'kk-furniture-bits', 'kk-holiday-bits', 'kk-mixed-bag-1', 'kk-kaykit-platformer', 'kk-city-builder-bits', 'kk-restaurant-bits', 'kk-board-game-bits'
QP = 'q-ultimate-platformer-pack'
def inf(n): return (INF, 'inflatables.glb', {'node': 'inflatable_' + n, 'label': 'inf_' + n, 'maps': {'inflatables': '../Textures/inflatables/inflatables_Diffuse_1K.png', 'Balls': '../Textures/balls/Balls_Diffuse_1K.png'}})
CANDS = {
 'palms_trees': [(N, f + '.glb', {}) for f in ['tree_palm', 'tree_palmBend', 'tree_palmShort', 'tree_palmTall', 'tree_palmDetailedShort', 'tree_palmDetailedTall', 'tree_cone', 'tree_cone_dark', 'tree_thin', 'tree_tall', 'tree_oak', 'tree_default']]
   + [(PI, f + '.glb', {}) for f in ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight']]
   + [(Q, f'PalmTree_{i}.obj', {'linear': True}) for i in range(1, 5)] + [(D1, 'Palm_1.gltf', {}), (D1, 'Palm_2.gltf', {}), (D1, 'Bush.gltf', {}), (D1, 'Leaf_1.gltf', {})]
   + [(TTR, 'tree.gltf', {}), (QP, 'Tree_Fruit.gltf', {}), (QP, 'Bush_Fruit.gltf', {})],
 'houses': [(SUB, f'building-type-{c}.glb', {}) for c in 'abcdefghijklmnopqrstu'] + [(KKC, f'building_{c}.gltf', {}) for c in 'ABCDEFGH'] + [(COM, f'building-{c}.glb', {}) for c in 'abcdefghijklmn'] + [(TTR, 'fountain.gltf', {})],
 'coast': [(N, f + '.glb', {}) for f in ['cliff_large_rock', 'cliff_block_rock', 'cliff_top_rock', 'cliff_cornerLarge_rock', 'rock_largeA', 'rock_largeC', 'rock_tallA', 'rock_tallE', 'stone_largeA', 'stone_tallA', 'statue_column', 'statue_obelisk', 'platform_beach']]
   + [(PI, f + '.glb', {}) for f in ['rocks-sand-a', 'rocks-sand-b', 'tower-complete-small', 'tower-complete-large', 'tower-watch', 'structure-platform-dock', 'patch-sand', 'flag-high-pennant']]
   + [(D1, f'Rock_{i}.gltf', {}) for i in (1, 4, 6)],
 'boats': [(WC, f + '.glb', {}) for f in ['boat-sail-a', 'boat-sail-b', 'boat-fishing-small', 'boat-row-small', 'boat-row-large', 'boat-speed-a', 'boat-speed-c', 'boat-speed-e', 'boat-speed-g', 'boat-speed-i', 'boat-tug-a', 'ship-small', 'ship-ocean-liner-small', 'buoy', 'buoy-flag', 'boat-house-a']]
   + [(PI, f + '.glb', {}) for f in ['boat-row-small', 'ship-small', 'ship-medium']] + [(N, 'canoe.glb', {})],
 'beach': [(D1, f + '.gltf', {}) for f in ['Sun_lounger_1', 'Sun_lounger_2', 'Umbrella_1', 'Umbrella_2', 'Umbrella_3', 'Umbrella_4', 'Umbrella_5', 'Umbrella_6', 'Closed_umbrella_1', 'Closed_umbrella_4', 'Surfboard_1', 'Surfboard_2', 'Surfboard_3', 'Towel_1', 'Towel_2', 'Towel_3', 'Towel_5', 'Lifebuoy', 'LifeGuardTower', 'Ball_1', 'Ball_2', 'Bucket_1', 'Box_1', 'Box_3', 'Star_1', 'Star_3']]
   + [(COM, f + '.glb', {}) for f in ['detail-awning', 'detail-awning-wide', 'detail-overhang', 'detail-parasol-a']] + [(HO, f + '.glb', {}) for f in ['lights-colored', 'lights-red', 'lantern-hanging', 'lantern']]
   + [(FU, 'loungeChairRelax.obj', {}), (FU, 'loungeChair.obj', {})] + [(KKH, 'lantern_decorated.gltf', {})],
 'pool_spa': [inf(n) for n in ['Tube_A', 'Tube_B', 'Tube_C', 'Tube_D', 'Tube_Duck_A', 'Tube_Duck_C', 'Tube_lifesaver', 'Ring_A', 'Ring_C', 'Floater_A', 'Floater_B', 'Flaoter_F', 'Lounger_A', 'Lounger_C', 'Dolphin', 'Duck_A', 'Ball_Beach_A', 'Ball_Beach_B', 'Pool_Slide_A', 'Octopuse_A']]
   + [('og-pool-ladder', 'PoolLadder.obj', {})] + [(TTB, f + '.gltf', {}) for f in ['candle', 'towel_blue', 'towel_pink', 'towel_yellow', 'towel_stacked', 'slippers', 'ducky', 'shower', 'container_bathroom_A_pink', 'container_bathroom_C_blue', 'plant', 'wall_shelf', 'soap_dish_pink']]
   + [(FU, f + '.obj', {}) for f in ['bathtub', 'shower', 'benchCushion', 'benchCushionLow', 'bedSingle', 'pottedPlant', 'plantSmall1', 'sideTableDrawers']] + [(N, f + '.glb', {}) for f in ['stone_smallFlatA', 'stone_smallFlatB', 'pot_large', 'pot_small']]
   + [(TTH, f + '.gltf', {}) for f in ['pot_A_large', 'pot_B_medium', 'pot_C_large', 'yucca_plant_large_potted', 'zzplant_plant_large_potted', 'succulent_plant_pot_large', 'pots_stacked']],
 'kids': [inf(n) for n in ['BallPit_A', 'BallPit_B', 'BallPit_C', 'BallPit_Empty_A', 'Slide_A', 'Slide_B', 'BounceHouse_A', 'Pig_A', 'BowlingPIn', 'Ball_Big_A']]
   + [(TTP, f + '.gltf', {}) for f in ['slide_A', 'slide_B', 'spring_horse_A', 'spring_horse_B', 'seesaw_small', 'merry_go_round', 'sandbox_round_decorated', 'sandcastle_A', 'bucket_A', 'shovel_A', 'tire_pink', 'stepping_stumps_A_yellow', 'swing_A_small', 'picnic_table']]
   + [(KKB, f + '.gltf', {}) for f in ['colored_block_red', 'colored_block_blue', 'decorative_block_yellow', 'striped_block_green']] + [(KKM, f + '.gltf', {}) for f in ['chicken_plushie_A', 'chicken_plushie_B', 'puzzlecube_complete', 'rollerskate_pair']]
   + [(FU, 'bear.obj', {}), (FU, 'rugRound.obj', {}), (FU, 'rugRectangle.obj', {})] + [(KKF, f + '.gltf', {}) for f in ['table_small', 'chair_A', 'chair_C', 'rug_rectangle_stripes_A', 'rug_oval_B', 'pillow_A', 'cabinet_small_decorated']]
   + [(KKP, f + '.gltf', {}) for f in ['ball_red', 'ball_blue', 'ball_yellow', 'heart_red', 'cone_yellow', 'arch_red']] + [(KKG, f + '.gltf', {}) for f in ['container_A', 'D6_A_red', 'meeple_blue', 'pawn_A_yellow']]
   + [(KKH, f + '.gltf', {}) for f in ['present_A_red', 'present_C_blue', 'football', 'basketball']],
 'food': [(FD, f + '.glb', {}) for f in ['fish', 'fish-bones', 'mussel', 'mussel-open', 'sushi-salmon', 'maki-salmon', 'plate-dinner', 'plate-rectangle', 'lemon', 'lemon-half', 'orange', 'watermelon', 'pineapple', 'coconut', 'coconut-half', 'banana', 'strawberry', 'cherries', 'grapes', 'apple', 'pear', 'frappe', 'soda-glass', 'cocktail', 'glass', 'ice-cream-cne', 'ice-cream-cup', 'ice-cream-scoop-mint', 'ice-cream-scoop-chocolate', 'popsicle-chocolate', 'cupcake', 'whipped-cream', 'wine-white', 'glass-wine', 'skewer', 'taco', 'salad', 'bowl-broth', 'pot-stew', 'cake', 'donut-sprinkles']]
   + [(KKR, f + '.gltf', {}) for f in ['food_dinner', 'plate', 'jar_A_large', 'menu']] + [(TTK, f + '.gltf', {}) for f in ['wine_bottle', 'cooler', 'drink_can', 'picnic_basket_round', 'grapes_bowl']],
 'romance': [(QP, 'Heart.gltf', {}), (KKP, 'heart_red.gltf', {}), (TTR, 'flower_A.gltf', {}), (TTR, 'flower_B.gltf', {}), (N, 'flower_redA.glb', {}), (N, 'flower_redC.glb', {}), (N, 'flower_purpleA.glb', {}), (FU, 'bedDouble.obj', {}), (KKF, 'bed_double_A.gltf', {}), (KKF, 'bed_double_B.gltf', {}), (KKH, 'bell_decorated.gltf', {}), (TTB, 'bath.gltf', {}), (KKH, 'carpet_round_large.gltf', {}), (KKF, 'pillow_B.gltf', {})],
}
