# Riviera Coast Line: assets (Route 2)

77 free models baked into `assets/models/models.bin` for Route 2. Every one is **CC0** (each pack's licence is beside its
sources in `assets/models/src/<pack>/License.txt`; credits in `assets/models/CREDITS.md`). No game code uses them yet:
the game session places them. Size: `models.bin` 1.79 → 2.70 MB (**+0.90 MB** binary, about +1.2 MB once base64'd into
the HTML), about 38,000 triangles in all.

## Contact sheets

Rendered from the real bake through the game's own `GeoBuilder.model`, lit material and camera angles, in a bright
golden-hour midday (`t` 0.62, exposure 0.8; the game's day keys at `t` < 0.5 wash out under the current grade, worth
knowing when Route 2's midday lighting is tuned). Each model is shown at its own size on a limestone slab; sizes below are
in the source's units (metres before the game's own fitting, as with every model).

| Sheet | |
|---|---|
| [1-coast.png](1-coast.png) | palms, cypress, lemon tree, villas, lighthouse, rocks, boats |
| [2-station.png](2-station.png) | awning, string lights, lantern, fountain, pots, column, crab, beach things, menu board |
| [3-kids.png](3-kids.png) | Kids' Play Car |
| [4-spa-pool.png](4-spa-pool.png) | Spa Car and Pool Car |
| [5-food.png](5-food.png) | Seafood Diner, smoothie and ice-cream bar |
| [6-honeymoon.png](6-honeymoon.png) | Honeymoon suite |

Re-render: `ENTRY=scripts/assets/riviera-sheet/stage.ts OUT=riviera-sheet.html node scripts/build.mjs`, then
`node scripts/assets/riviera-sheet/shoot.mjs <dir> <id,id,…>` and
`python3 -I scripts/assets/riviera-sheet/sheet.py <dir> <bake log> docs/riviera-assets`
(the bake log is the output of `python3 -I scripts/assets/bake_models.py`).

## Baker changes

- **`hue`** (new option on a `MODELS` entry): repaints hue bands of a textured model at bake time, keeping each vertex's
  brightness relative to its band (`repaint` in `bake_models.py`). Used for the villas' terracotta roofs (Kenney's
  suburban houses have green roofs), the flat-roofed cube house's dark cladding (cream), the lighthouse (white tower,
  red lantern), the lemon tree's fruit (red → yellow) and the rose petal (red).
- glTF buffers and images embedded as **data URIs** are read (Quaternius' packs ship that way).
- Kenney Nature Kit material factors are effectively sRGB, so those models are painted by material name (`paint`).

The game can still recolour any of them at run time with `recolor`/`KEY` as before (e.g. the villas' white walls through
the `linen` band for pastel houses, the awning's green through a hue band).

## The models

| id | source pack | licence | tris | size (x, y, z) | in models.bin | for |
|---|---|---|---|---|---|---|
| `palm_straight` | Kenney Pirate Kit 2.1 | CC0 | 338 | 2.49, 4.21, 2.49 | 7.9 KB | coast and station palm, upright |
| `palm_bend` | Kenney Pirate Kit 2.1 | CC0 | 338 | 2.88, 4.25, 3.22 | 7.9 KB | coast palm, leaning over the shore |
| `palm_lush` | Kenney Pirate Kit 2.1 | CC0 | 482 | 2.88, 4.25, 3.22 | 12.1 KB | coast palm, fuller crown (hero shots) |
| `palm_slim` | Kenney Nature Kit 2.1 | CC0 | 190 | 1.03, 1.36, 1.03 | 13.6 KB | slender far-distance palm, cheap (repainted) |
| `cypress` | Kenney Nature Kit 2.1 | CC0 | 72 | 0.4, 1.69, 0.46 | 5.1 KB | Italian cypress on hillsides and villa gardens (repainted) |
| `lemon_tree` | Quaternius Ultimate Platformer Pack | CC0 | 1680 | 3.52, 2.23, 3.53 | 30.0 KB | lemon tree / potted lemon bush (fruit repainted yellow) (repainted) |
| `villa_a` | Kenney City Kit Suburban 2.0 | CC0 | 1616 | 1.43, 1.14, 1.41 | 40.3 KB | cliff villa, hipped terracotta roof (repainted) |
| `villa_b` | Kenney City Kit Suburban 2.0 | CC0 | 1024 | 0.92, 1.15, 1.02 | 25.3 KB | tall narrow town house (repainted) |
| `villa_c` | Kenney City Kit Suburban 2.0 | CC0 | 1112 | 1.43, 0.74, 1.43 | 27.3 KB | low villa (repainted) |
| `villa_d` | Kenney City Kit Suburban 2.0 | CC0 | 1030 | 1.03, 1.14, 1.02 | 25.6 KB | villa with a planter terrace (repainted) |
| `villa_e` | Kenney City Kit Suburban 2.0 | CC0 | 1196 | 1.29, 1.03, 1.03 | 29.5 KB | villa with gabled wings (repainted) |
| `villa_cube` | Kenney City Kit Suburban 2.0 | CC0 | 1282 | 1.24, 0.92, 0.99 | 31.2 KB | flat-roofed white cube house (Amalfi style) (repainted) |
| `lighthouse` | Kenney Pirate Kit 2.1 | CC0 | 604 | 3.63, 10.22, 3.63 | 15.7 KB | lighthouse on the headland (white tower, red lantern) (repainted) |
| `sea_stack` | Kenney Nature Kit 2.1 | CC0 | 136 | 0.98, 1.0, 0.68 | 12.8 KB | sea stack / headland rock with green top (repainted) |
| `coast_rock` | Kenney Nature Kit 2.1 | CC0 | 136 | 0.98, 1.0, 0.68 | 8.8 KB | limestone rocks along the shore (repainted) |
| `boulder` | Quaternius 150+ LowPoly Nature | CC0 | 128 | 0.74, 0.78, 1.25 | 5.4 KB | grey beach boulder |
| `sailboat` | Kenney Watercraft Kit | CC0 | 386 | 1.78, 4.74, 3.77 | 11.0 KB | sailboat on the sea |
| `sailboat_b` | Kenney Watercraft Kit | CC0 | 426 | 1.78, 4.48, 4.07 | 12.0 KB | second sailboat (grey hull) |
| `fishing_boat` | Kenney Watercraft Kit | CC0 | 237 | 1.78, 2.6, 3.87 | 6.9 KB | small fishing boat |
| `rowboat` | Kenney Watercraft Kit | CC0 | 168 | 2.75, 0.85, 2.37 | 4.8 KB | rowing boat at the jetty |
| `yacht` | Kenney Watercraft Kit | CC0 | 265 | 2.0, 1.46, 2.87 | 7.7 KB | motor yacht / launch |
| `awning` | Kenney City Kit Commercial 2.1 | CC0 | 40 | 0.8, 0.4, 0.15 | 1.4 KB | shop awning (plain: repaint or stripe in the game) |
| `string_lights` | Kenney Holiday Kit | CC0 | 760 | 1.01, 0.32, 0.06 | 15.1 KB | festoon lights between posts |
| `lantern_hang` | Kenney Holiday Kit | CC0 | 152 | 0.43, 0.67, 0.42 | 3.9 KB | hanging wall lantern |
| `fountain` | Tiny Treats Pretty Park | CC0 | 1646 | 4.0, 1.6, 4.0 | 35.4 KB | piazza fountain on the station forecourt |
| `pot_terracotta` | Tiny Treats House Plants | CC0 | 288 | 1.5, 1.0, 1.5 | 6.8 KB | terracotta planter |
| `pot_white` | Tiny Treats House Plants | CC0 | 368 | 1.5, 1.0, 1.46 | 9.9 KB | white glazed planter |
| `pots_stack` | Tiny Treats House Plants | CC0 | 588 | 0.53, 0.78, 0.5 | 13.2 KB | stacked terracotta pots (shop dressing) |
| `column` | Kenney Nature Kit 2.1 | CC0 | 122 | 0.3, 1.0, 0.3 | 11.7 KB | limestone column / pergola post (repainted) |
| `crab` | Quaternius Ultimate Platformer Pack | CC0 | 3624 | 2.54, 1.51, 1.39 | 60.0 KB | cute beach crab (station life, ad shots) |
| `sandcastle` | Tiny Treats Fun Playground | CC0 | 120 | 0.5, 0.4, 0.5 | 2.6 KB | sandcastle (beach, kids car) |
| `beach_bucket` | Tiny Treats Fun Playground | CC0 | 520 | 0.7, 1.14, 0.84 | 10.2 KB | beach bucket and spade |
| `cool_box` | Tiny Treats Pleasant Picnic | CC0 | 834 | 1.63, 0.9, 1.08 | 17.3 KB | cool box (beach, pool deck) |
| `radio` | Tiny Treats Pleasant Picnic | CC0 | 830 | 1.1, 0.81, 0.66 | 18.3 KB | retro radio (pool deck, kiosk) |
| `beach_ball` | KayKit Platformer Pack 1.0 | CC0 | 528 | 2.0, 2.0, 2.0 | 9.2 KB | beach ball; ball-pit balls when scaled down and tinted |
| `menu_board` | KayKit Restaurant Bits | CC0 | 108 | 0.5, 0.8, 0.3 | 3.3 KB | diner menu stand / chalk board |
| `slide` | Tiny Treats Fun Playground | CC0 | 1574 | 2.76, 4.0, 5.91 | 35.8 KB | kids slide |
| `spring_horse` | Tiny Treats Fun Playground | CC0 | 1590 | 1.0, 2.3, 2.35 | 31.3 KB | spring rocking horse |
| `seesaw` | Tiny Treats Fun Playground | CC0 | 452 | 1.54, 0.95, 4.0 | 10.6 KB | small seesaw |
| `toy_block` | KayKit Block Bits | CC0 | 108 | 2.0, 2.0, 2.0 | 2.3 KB | toy block (scale ~0.2, tint per block) |
| `toy_block_stripe` | KayKit Block Bits | CC0 | 156 | 2.0, 2.0, 2.0 | 3.7 KB | striped toy block |
| `play_rug` | KayKit Furniture Bits | CC0 | 176 | 3.0, 0.1, 2.0 | 4.1 KB | oval play mat |
| `rug_stripes` | KayKit Furniture Bits | CC0 | 68 | 3.0, 0.1, 2.0 | 1.7 KB | striped play mat |
| `kids_table` | KayKit Furniture Bits | CC0 | 168 | 1.0, 1.0, 1.0 | 5.3 KB | small play table |
| `kids_chair` | KayKit Furniture Bits | CC0 | 288 | 0.75, 1.2, 0.94 | 7.5 KB | small chair |
| `floor_cushion` | KayKit Furniture Bits | CC0 | 86 | 0.65, 0.2, 0.5 | 1.7 KB | floor cushion / beanbag |
| `plushie` | KayKit Mixed Bag 1 | CC0 | 1818 | 0.83, 0.91, 0.92 | 28.9 KB | soft toy (stand-in for a teddy) |
| `candle` | Tiny Treats Bubbly Bathroom | CC0 | 312 | 0.29, 0.37, 0.29 | 6.6 KB | spa candle |
| `slippers` | Tiny Treats Bubbly Bathroom | CC0 | 360 | 0.74, 0.21, 0.59 | 7.8 KB | spa slippers |
| `towel_folded` | Tiny Treats Bubbly Bathroom | CC0 | 60 | 0.63, 0.2, 0.63 | 1.7 KB | folded towel (stack them for towel piles) |
| `spa_bottle` | Tiny Treats Bubbly Bathroom | CC0 | 320 | 0.31, 0.31, 0.31 | 7.0 KB | spa oil / lotion jar |
| `spa_plant` | Tiny Treats Bubbly Bathroom | CC0 | 624 | 0.82, 0.64, 0.82 | 15.5 KB | spa succulent in a pot |
| `spa_cabinet` | KayKit Furniture Bits | CC0 | 464 | 1.05, 1.62, 1.1 | 15.8 KB | spa cabinet with mirror and drawers |
| `rubber_duck` | Tiny Treats Bubbly Bathroom | CC0 | 604 | 0.3, 0.4, 0.42 | 11.4 KB | rubber duck (pool, kids car) |
| `pool_shower` | Tiny Treats Bubbly Bathroom | CC0 | 924 | 1.14, 2.0, 1.18 | 22.7 KB | poolside shower |
| `fish` | Kenney Food Kit | CC0 | 233 | 0.2, 0.32, 0.62 | 5.6 KB | grilled fish (on the existing plate) |
| `mussel` | Kenney Food Kit | CC0 | 90 | 0.1, 0.08, 0.16 | 2.2 KB | mussel (seafood platter) |
| `skewer` | Kenney Food Kit | CC0 | 116 | 0.6, 0.09, 0.11 | 2.2 KB | seafood / grill skewer |
| `lemon` | Kenney Food Kit | CC0 | 104 | 0.17, 0.22, 0.2 | 1.8 KB | lemon (stand, garnish, lemonade) |
| `lemon_half` | Kenney Food Kit | CC0 | 116 | 0.17, 0.11, 0.2 | 2.5 KB | half lemon garnish |
| `orange` | Kenney Food Kit | CC0 | 120 | 0.17, 0.17, 0.17 | 2.6 KB | orange (smoothie bar) |
| `pineapple` | Kenney Food Kit | CC0 | 196 | 0.24, 0.47, 0.24 | 4.9 KB | pineapple (smoothie bar) |
| `coconut_half` | Kenney Food Kit | CC0 | 92 | 0.25, 0.12, 0.25 | 1.9 KB | coconut cup drink |
| `banana` | Kenney Food Kit | CC0 | 104 | 0.14, 0.2, 0.63 | 2.0 KB | banana (smoothie bar) |
| `strawberry` | Kenney Food Kit | CC0 | 156 | 0.12, 0.18, 0.12 | 3.2 KB | strawberry (smoothie bar, honeymoon) |
| `cherries` | Kenney Food Kit | CC0 | 134 | 0.09, 0.17, 0.16 | 2.9 KB | cherries (sundae topping) |
| `ice_cone` | Kenney Food Kit | CC0 | 44 | 0.18, 0.3, 0.21 | 1.1 KB | ice-cream cone (empty: top with ice_scoop) |
| `ice_cup` | Kenney Food Kit | CC0 | 68 | 0.2, 0.18, 0.23 | 1.7 KB | ice-cream cup |
| `ice_scoop` | Kenney Food Kit | CC0 | 56 | 0.24, 0.17, 0.27 | 1.0 KB | mint ice-cream scoop |
| `smoothie` | Kenney Food Kit | CC0 | 320 | 0.25, 0.5, 0.25 | 7.9 KB | smoothie with straw |
| `soda_glass` | Kenney Food Kit | CC0 | 124 | 0.26, 0.41, 0.3 | 3.2 KB | fruit soda / lemonade glass |
| `cake` | Kenney Food Kit | CC0 | 1146 | 0.64, 0.36, 0.64 | 28.3 KB | celebration cake (honeymoon) |
| `chocolate` | Kenney Food Kit | CC0 | 140 | 0.29, 0.03, 0.15 | 3.4 KB | chocolate bar (honeymoon pillow treat) |
| `heart` | KayKit Platformer Pack 1.0 | CC0 | 242 | 1.08, 0.85, 0.53 | 3.7 KB | heart (honeymoon decor, balloons) |
| `petal` | Quaternius Stylized Nature MegaKit (free) | CC0 | 13 | 0.46, 0.24, 0.45 | 0.3 KB | rose petal (scatter on the bed, repainted red) (repainted) |
| `rose` | Kenney Nature Kit 2.1 | CC0 | 76 | 0.16, 0.29, 0.18 | 5.2 KB | single red flower (vase of roses) (repainted) |
| `present` | KayKit Holiday Bits | CC0 | 678 | 0.56, 0.66, 0.56 | 17.6 KB | gift box (honeymoon) |

## Looked for, not found (free, stylised, reachable from here)

None of these exist as CC0 (or clearly-better CC-BY) stylised low-poly models in the packs this environment can reach
(itch.io for Kay and Isa Lousberg and Quaternius, OpenGameArt for Kenney's kits; kenney.nl, Poly Pizza, Sketchfab's API and
itch.io's browse pages are blocked from this network). Most are simple shapes the game already builds well from
primitives (`GeoBuilder` boxes, cylinders and tori), which is the suggestion for each:

| wanted | why not | suggestion |
|---|---|---|
| sun loungers | no CC0 stylised lounger anywhere; the paid/RF ones are not allowed | build from boxes (frame, slatted back, cushion in a stripe colour) |
| surfboards (several colours) | none CC0 | a flattened, tapered capsule with a stripe; one geometry, tinted |
| surfboard rack | none | two posts and rails from boxes |
| lifeguard chair | none CC0 | tall A-frame of boxes, a seat, a red-and-white parasol (`parasol`) on top |
| pool ladder | OpenGameArt's CC0 one is 6,144 triangles and plain tubes | two bent tubes and three treads (cylinders), ~200 triangles |
| swim rings / inflatables | the CC0 "inflatables" pack is one realistic, textured blob | a torus in red and white segments |
| massage / treatment bed | none | `bed_single`/`dining_table` frame with a padded top, or boxes |
| robes on hooks | none | a hook rail and a draped-cone robe |
| folded-towel stacks | `towel_folded` stacked, or the existing `towels` | — |
| stones (spa) | use `boulder` scaled small and darkened, or `rock_round` | — |
| screen / divider | none | three hinged panels (boxes) |
| gulls (a flying bird) | the only CC0 gull (BlendSwap) needs a login; the Tiny Treats `bird` repainted still reads as a chick | two wing quads and a body, flapped in the vertex shader like the fireflies |
| beach huts | none | box hut with a striped door and a gable (KayKit-style) |
| chapel / campanile | only medieval churches (owner: none) | a white box tower with arched openings and a terracotta cap, or `villa_cube` + a bell tower of boxes |
| beach umbrellas | the game has `parasol` and three KayKit `umbrella_*`; no striped beach umbrella CC0 | a cone of alternating-colour segments on a pole |
| striped awnings | `awning` is plain green | stripe it with the shader's `PATTERN.stripes`, or alternate boxes |
| lemonade stand, ice-cream cart | none as one model | the station's `wagon` (fruit barrow) + `freezer`, `lemon`, `ice_cone`, `parasol` |
| rope posts | none modern | brass post (cylinder + sphere) and a sagging rope (tube) |
| shells | none CC0 low-poly | small scaled `mussel`, or a fan-ribbed half-disc |
| prawns, lobster, a seafood platter | Kenney Food Kit has fish, mussels and a skewer only | platter = `plate` + `fish` + `mussel` + `lemon_half`; prawn as a curled tapered tube in coral |
| watermelon slice | only a whole watermelon (1,376 triangles) | a wedge prism, green rind, red flesh, black seeds |
| teddy bear | Kenney's old Furniture Pack bear is broken; Tiny Treats' Playful Bedroom is paid | `plushie` (KayKit chicken plushie) as the soft toy |
| ball pit | no pit model | `beach_ball` scaled to ~0.15 m and tinted per ball, in a padded box |
| canopy bed | none CC0 stylised; KayKit/Quaternius beds have no canopy | `bed_double` + four posts and a draped top (the Royal four-poster in `CarriageView` already does this) |
| pool water | not wanted (a shader) | — |
