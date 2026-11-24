# Asset inventory (visual overhaul, Phase V1)

One row per visual element. **Built**: how it is made today: *proc* = built in TypeScript from primitives at runtime
(`GeoBuilder` boxes, cylinders, extrusions; merged into one mesh per material), *model* = a CC0 model baked into
`assets/models/models.bin` (vertex colours, merged like a primitive), *sprite* = a canvas texture drawn at start-up,
*CSS* = DOM. **Tris** are per instance (models: exact, from `modelIndex.ts`; procedural: estimated from the builders, not yet
measured one by one; the per-scene totals in REPORT.md are measured). **Tex**: textures it reads (every lit surface also reads the shared light map and, if it names one, a layer of
the 512² detail array). **Prio**: A = on screen almost always, B = often, C = rare.

Totals today: 205 baked models (112k vertices, 113k triangles, 2.7 MB); 11 detail layers (512², 5.6 MB as an RGBA
array on the GPU with mips); every carriage is 1–5 draws per material whatever its furniture; the whole crowd is one draw
per material (the pull batch).

## Characters (all procedural, `world/CharacterParts.ts` + `CharacterView.ts`, one pull-batched draw for everyone)

| id | where | built | states / tiers | tris, tex | prio |
|---|---|---|---|---|---|
| conductor (player) | everywhere | proc: rounded head with hair grown in, lathe torso, mitten hands, sneakers; cap with red band; rim light | outfits (wardrobe), shoes ×4 by speed, charm gear, tray, skates, scooter; walk, stride, carry, sit, sleep, sweep, wave… | ~2.6k, none | A |
| attendant | carriages | proc, lilac dress, pillbox hat, apron | Expert look (plum jacket, gold, cap) | ~2.5k | A |
| porter | platform, desk | proc, red jacket, pillbox | Expert look | ~2.4k | A |
| runner | stores (off route 1) | proc, mustard | | ~2.4k | C |
| barista, chef (toque), waiter, bartender, host, projectionist (usher red) | venues | proc, role uniforms | Expert looks | ~2.4–2.7k | B |
| entertainer, masseur, lifeguard | Riviera venues | proc | | ~2.5k | B |
| guests: student, backpacker, tourist, grandma, family (+child), businessman, newlyweds/honeymooners (+partner), VIP, celebrity, royal, sunbather, surfer | platform, rooms, venues | proc; `figure` outfit per archetype; 4 looks each (skin, hair, coat, glasses); heights 0.93–1.06 | walk, sit, sleep (in bed, under a blanket), read, sip, wave, phone, chat, stomp, mood bubbles | 2.2–3k | A |
| Route 1 looks: farmer, grandpa, rambler, choir | Countryside guests | proc, `routeLook` | | ~2.5k | A |
| critic (Gazette / Riviera Traveller) | special stops | proc, tweed, glasses, notebook | | ~2.6k | C |
| strollers, townsfolk, band, station master, shopkeepers, painter | platform | proc, `TOWNSFOLK`, `STROLLERS` | idle habits, instruments | ~2.4k each | B |
| lobby cat, pigeons, sheep, swans | lobby desk, platform, scenery | proc / model (bird, sheep) | breathe, peck, graze | 0.6–1k | B |

## Carriage shells (procedural, `world/CarriageView.ts`, `Floors.ts`, `layout.ts`)

| id | where | built | states / tiers | tris, tex | prio |
|---|---|---|---|---|---|
| shell: floor slab, outer walls (two skins, framed windows, curtains), interior partitions with caps, end sills, gangway bellows, doors (hinged leaves), cut-away roof edge | every carriage | proc, merged per material | Broken (wear, cracked pane, peeling paint, flicker), Repaired, tiers 1–3; passenger classes Basic → Royal with their own floor plans and liveries | 15–40k per carriage, light map + detail | A |
| floors: broken planks with holes and joists, patched, polished boards, herringbone, chevron, fitted carpets, suede, marble, venue carpets (trellis, harlequin, theatre…) | every room | proc (real planks) + pattern shader + detail layers | per tier and class | 2–12k per carriage | A |
| locked-room lid + padlock, tarp (carriage cover), teaser carriage behind the deck | locked rooms, opening, next carriage | proc | reveal animations | <1k each | B |
| liveries, letterboard name plate, window boxes, lamps, gold lining, red carpet (exterior upgrades) | outside of the train | proc (`ExteriorView`) | per route level / class / station upgrade | ~8k for the train | A |
| class chips | over passenger carriages | sprite | per class | 2 | B |

## Props and furniture

| id | where | built | states / tiers | tris | prio |
|---|---|---|---|---|---|
| beds (single, double), nightstand, dresser, lamps (desk, floor, table), armchair, couch, wing chair, TV | cabins, lobby | model (KayKit, Quaternius, Kenney) recoloured per class | Repaired → Business; iron cot (Broken), bunk (Family Sleeper), grand bed / four-poster (First, Royal) proc | 170–1,460 | A |
| reception desk, bell, ledger, tea urn counter with cake stand, papers, sandwiches | lobby | proc + models (thermos, cake stand, mug stack…) | by tier | 2–5k | A |
| luggage rack and bags (3 rack levels) | lobby | proc | rack_1/rack_2 | 1–3k | A |
| washroom: toilet, cubicle, shower, vanity, bath, towel rails, soap trays, mats | Washroom Car | model + proc | Soaps, Towel Rails comforts | 400–1.7k each | B |
| venue furniture: café tables/chairs/counter/espresso/display cases; dining tables, stove, pass; bar counter, stools, armchairs, banquette, jukebox; cinema seats, screen (animated film), projector, popcorn machine; dome seats; Riviera kids/spa/pool/honeymoon props | venues | model (KayKit Restaurant, Tiny Treats, Quaternius) + proc (`VenueProps.ts`, `RivieraProps.ts`) | 4 tiers each, seats bought one at a time | 100–3.6k each | B |
| carried items: tea, coffee, sandwich, croissant, dinner, cocktail, towels, blanket, pillow, paper, snack, crate, surfboard… and the tray | in hands, on counters | model + proc (`ItemMeshes.ts`) | | 24–1.2k | A |
| mess: unmade bed parts, litter, guests' left items (17 pieces) | used rooms | proc (`Mess.ts`) | arrival and tidy animations | 50–400 each | A |
| shoes by the door | corridors at night | proc (`Shoes.ts`) | dirty / shined | ~300 | B |

## Station pieces (`world/PlatformView.ts`, `StationShops.ts`, `platformLayout.ts`)

| id | where | built | states | tris | prio |
|---|---|---|---|---|---|
| deck (stone flags), coping, yellow line, railing, lamp posts, benches, tubs, planters | every stop | proc + models (bench, street lamp, planter) | | ~20k | A |
| ticket stand / booking office, barrow, supply cart, bell post | work lane | proc + models (till, parcels, hand bell) | Ticket Office upgrade | 2–5k | A |
| station house (cottage), water tower, newsstand, six shops with keepers, Train Works, fruit barrow, advertising bay (posters, billboards, band) | back lane | models (Tiny Treats, Kenney, KayKit, Quaternius) + proc | station upgrades | 3–25k | B |
| forecourt: hedges, cobbled lane, gardens, bicycles, postbox | past the railing | proc + models | | ~10k | B |
| Riviera station dress: surf rack, ice-cream cart, bougainvillea, lanterns | Riviera stops | proc + models | | | B |
| station sign, headline board, posters | platform | sprite | per station | 2 each | B |

## The locomotive and scenery

| id | where | built | states | tris | prio |
|---|---|---|---|---|---|
| steam locomotive + tender (Route 1) | front of the train | model (Kenney Train Kit) + proc chimney smoke, headlamp beam, name plate, pennants | | 2.9k | A |
| streamliner (Riviera) | front | proc (`LocomotiveView.buildStreamliner`) | livery by level | ~6k | A |
| countryside: terrain strips, lake (shader), shore pieces (reeds, jetty, boathouse, lighthouse…), land pieces (forest, village, farm, wheat, bridge…) | both sides, scrolling | proc + instanced models (trees, bushes, rocks, sheep) | 24 m chunks dealt from decks | 30–60k on screen | A |
| Riviera: sea, coves, headland, marina, villas, lemon groves, palms, sailboats | both sides | proc + models | | 30–60k | A |
| fireflies, chimney smoke, birds, lantern boats, swans, onlookers | scenery | Points / proc | night only (fireflies) | small | B |

## VFX (`world/Particles.ts`, one Points draw, pool of 900)

| id | where | built | prio |
|---|---|---|---|
| dust, sparkle, confetti, smoke, steam, star, cash, heart, chimney, mote | everywhere | Points + canvas sprite | A |
| cash bills (stacks, flying arcs) | floor, wallet | instanced (`CashView`, pool 1,600) | A |
| job badges with fill ring, tile markers, guide arrow, mood bubbles (faces) | world UI | sprite (`sprites.ts`), drawn at 2× | A |
| lamp pools, window spill, headlamp pool, film beam | floors, platform | light map bake + additive decals | A |

## UI (`src/ui/`, DOM + canvas icons)

| id | built | prio |
|---|---|---|
| HUD top row (level star, cash, gems, conductor, menu), route line with rating and clock | CSS (session 37 3D block) | A |
| quick-travel strip (carriage tabs) | CSS + canvas icons | A |
| request bubbles / pins, job badges | canvas sprites | A |
| icons: 3D rendered item set (`assets/icons/items.png`, `ui/iconModels.ts`) + canvas-drawn set (`ui/icons.ts`, 2.2k lines) | PNG atlas + canvas | A |
| sheets: menu, settings, level up, offline return, shop/paint, route map, next line, album (postcards), daily, goal, progress | CSS | B |
| title cards, station banners, result card, news strip, toasts | CSS | B |
| fonts: Jost (body, variable), Playfair Display (postcards), Fredoka 600 (new look's display) | embedded woff2 | A |
