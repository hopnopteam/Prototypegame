# The models of the second Riviera pass that the first pass (commit 9a8ce27) does not already have.
# id: (source under assets/models/src, extra spec or None, category)
ROOF = [{"h": [90, 170], "s": [0.25, 1], "to": "#A65640"}]   # the first pass's terracotta repaint of the green roofs
INFM = {'inflatables': 'Textures/inflatables_Diffuse.png', 'Balls': 'Textures/Balls_Diffuse.png'}
def inf(n): return ('loafbrr-inflatables/inflatables.glb', {'node': 'inflatable_' + n, 'maps': INFM})
ADDS = {
 '1-coast': {
  'villa_f': ('kenney-suburban/building-type-a.glb', {'hue': ROOF}), 'villa_h': ('kenney-suburban/building-type-h.glb', {'hue': ROOF}),
  'rock_islet': ('kenney-pirate/rocks-sand-a.glb', None), 'rock_islet_b': ('kenney-pirate/rocks-sand-b.glb', None),
  'rock_flat': ('kenney-nature/rock_largeC.glb', None), 'jetty': ('kenney-pirate/structure-platform-dock.glb', None),
  'speedboat': ('kenney-watercraft/boat-speed-c.glb', None), 'buoy': ('kenney-watercraft/buoy-flag.glb', None),
  'beach_umbrella_blue': ('d1mee-summer/Umbrella_1.gltf', None), 'beach_umbrella_red': ('d1mee-summer/Umbrella_5.gltf', None),
  'beach_umbrella_orange': ('d1mee-summer/Umbrella_4.gltf', None), 'beach_umbrella_shut': ('d1mee-summer/Closed_umbrella_1.gltf', None)},
 '2-station': {
  'sun_lounger': ('d1mee-summer/Sun_lounger_1.gltf', None), 'surfboard_green': ('d1mee-summer/Surfboard_1.gltf', None), 'surfboard_purple': ('d1mee-summer/Surfboard_2.gltf', None),
  'surfboard_teal': ('d1mee-summer/Surfboard_3.gltf', None),
  'beach_towel_orange': ('d1mee-summer/Towel_1.gltf', None), 'beach_towel_green': ('d1mee-summer/Towel_3.gltf', None),
  'beach_towel_blue': ('d1mee-summer/Towel_5.gltf', None),
  'lifebuoy': ('d1mee-summer/Lifebuoy.gltf', None), 'lifeguard_tower': ('d1mee-summer/LifeGuardTower.gltf', None),
  'cooler_red': ('d1mee-summer/Box_3.gltf', None), 'beach_ball_stripes': ('d1mee-summer/Ball_1.gltf', None),
  'starfish': ('d1mee-summer/Star_1.gltf', None), 'pot_ridged': ('tinytreats-plants/pot_C_large.gltf', None)},
 '3-kids': {
  'ball_pit': inf('BallPit_A'), 'slide_inflatable': inf('Slide_A'),
  'sand_spade': ('tinytreats-playground/shovel_A.gltf', None), 'soft_arch': ('tinytreats-playground/tire_pink.gltf', None),
  'toy_block_blue': ('kaykit-blocks/colored_block_blue.gltf', None), 'toy_block_green': ('kaykit-blocks/striped_block_green.gltf', None),
  'puzzle_cube': ('kaykit-mixed/puzzlecube_complete.gltf', None),
  'play_ball_red': ('kaykit-platformer/ball_red.gltf', None), 'play_ball_blue': ('kaykit-platformer/ball_blue.gltf', None)},
 '4-spa': {
  'spa_bench': ('kenney-furniture/benchCushionLow.obj', None), 'spa_towel_blue': ('tinytreats-bathroom-1.1/towel_blue.gltf', None),
  'spa_towel_yellow': ('tinytreats-bathroom-1.1/towel_yellow.gltf', None), 'soap_dish': ('tinytreats-bathroom-1.1/soap_dish_pink.gltf', None),
  'spa_stone': ('kenney-nature/stone_smallFlatA.glb', None), 'spa_stone_b': ('kenney-nature/stone_smallFlatB.glb', None)},
 '5-pool': {
  'pool_ladder': ('plaggy-pool-ladder/PoolLadder.obj', None), 'ring_duck': inf('Tube_Duck_A'), 'ring_float': inf('Tube_A'),
  'ring_lifesaver': inf('Tube_lifesaver'), 'ring_horseshoe': inf('Floater_A'), 'pool_float': inf('Lounger_A'),
  'float_dolphin': inf('Dolphin')},
 '6-food': {
  'ice_scoop_choc': ('kenney-food/ice-cream-scoop-chocolate.glb', None), 'popsicle_choc': ('kenney-food/popsicle-chocolate.glb', None)},
}
