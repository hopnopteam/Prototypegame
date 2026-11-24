# Night Express: art bible (visual overhaul)

The target: a **premium cozy miniature**, a high-end diorama under warm lamps. Stylized, chunky, soft and warm. Not
photoreal, not flat low-poly. The three references in `docs/art/refs/` are our own game re-rendered better: same layout,
same camera. Match them shot for shot from the game camera.

| Ref | What it shows | Our matching shot |
|---|---|---|
| `ref_station_night.png` | Millbrook platform at night: ticket stand, two lamps, wet flags, the locomotive top left | a new game's first seconds (`art-shots.mjs slice`, `slice-station`) |
| `ref_sleeper_night.png` | a sleeper at night: blue runner, cabins with blue beds, porter with boxes, THE NIGHT OWL plate | the Sleeper at tier 1–2 (`slice-sleeper-t*`) |
| `ref_riviera_golden.png` | golden hour: red runner, brass bed, clawfoot tub, sea and grass outside | the Riviera's **lobby car at tier 3** (Royal Suite) matches it exactly; the Honeymoon Suites are the same light on another carriage (`slice-riviera-lobby-t3`, `slice-honeymoon-t3`) |

## 1. Shapes
- **No razor edges.** Every box at least 4.5 cm on all sides gets rounded edges (radius 16% of its smallest side, at most
  2.5 cm; `BEVEL` in `config/look.ts`, `GeoBuilder.box`). Rounded edges catch the key light and read as a model, not CG.
- **Chunky proportions.** Furniture is a touch oversized for the room; nothing spindly (legs ≥ 4 cm, rails ≥ 3 cm).
- **Walls have thickness and a cap.** Every cut-away partition ends in a rounded cap 6.5 cm tall that overhangs each face
  by 3 cm, in the carriage's trim colour (wood or brass): the dollhouse edge of refs 2 and 3.
- Thin things stay sharp only where they lie flat (floors, rugs, decals), so nothing new overlaps (geo audit stays 0/0).

## 2. Materials
Real variety in what things are made of. Colour comes from the vertex colour (the palette below); the material's look
comes from a **detail layer** (512² seamless, multiplied over the colour, `world/detail.ts`) and a **surface**
(`world/surfaces.ts`: roughness, metalness, sheen).

| Material | Detail layer | Surface | Notes |
|---|---|---|---|
| Wood planks | `wood`, `woodWorn`, `woodPolished` (photo grain) + per-plank tone from the floor builder | `wood` / `varnish` | three close tones per tier, never a patchwork |
| Parquet | `herringbone` | `varnish` | First Class and up |
| Fabric: runners, bedding, carpets | `wool` (photo), `carpet` (drawn twill and mottle) | `fabric` / `velvet` (sheen) | soft rim from the sheen term |
| Brass and gold trim | none | `brass` (metal 1, rough 0.3) | the night sky and the lamps glint in it; capped under the bloom threshold so it gleams, never smears |
| Painted panels | `panel` (drawn: raised frame, shadow line, faint brush) | `matte` / `varnish` | the lower band of every wall |
| Stone flags | `flagstone` (drawn: running bond, per-flag tone, bevelled edges lit top-left, dark joints) | `wet stone` (rough 0.22) | the platform; lamps streak in it (below) |
| Glass | none | `glass` | windows lamplit from inside at night |

Rule: **clean and stylized, never noisy.** Photo layers are kept at low strength; drawn layers carry the structure.
New layers are drawn by `art/textures/build_stylized.py` (photo ones by `scripts/assets/build_textures.py`).

## 3. Lighting (the main tool)
- **One key light**: the moon (Countryside) or the low sun (Riviera), with soft shadows from the train's static shadow
  map (Medium) or a following map (High, Ultra). People never receive it (it made them look murky, session 38b); they
  stand on soft blob shadows.
- **Warm practicals make pools.** Every lamp, sconce and lantern is a pool on the floor and the walls' lower half in the
  light bake (`world/lightBake.ts`, recomputed whenever the train changes, so every upgrade state is correct), and its
  bulb blooms (Medium and up).
- **AO everywhere things meet**: walls and floor (the bake's contact shading, `ao.wall`/`ao.prop`), and every model's own
  Cycles-baked occlusion (`art/blender/bake_prop_ao.py`).
- **Warm highlights, cool shadows**: the grade pushes the shadows toward `#14204A` and the highlights toward `#FFD09A`.
- **Route 1, Countryside: deep night.** Held at the night key (`LOOK_ROUTE_TIME`): blue-violet ambient (hemisphere
  `#57538A` over `#2A2132`, 0.85), a cool moon `#9FB0FF`, amber lamps `#FFAA58`.
- **Route 2, Riviera: golden hour.** Held at a low warm sun `#FFB36A` from over the sea (offset −15, 6.2, −5.5: about
  20° up), long shadows across the floors, a warm sky fill, a turquoise sea with sparkle.

## 4. Palette (sampled from the references: k-means on each image, share of the frame in brackets)

**Countryside night (ref 1, the station):** `#3E416A` far flags in shadow (17%), `#98726F` flags in lamplight (14%),
`#7A5D66` mid flags (12%), `#25283F` deep shadow (12%), `#5B4C66` (11%), `#4E483A` track bed (11%), `#B68C7A` pool
highlight (10%), `#171318` darkest (7%), `#5F5F87` cool fill (4%), `#E2CBA6` lamp-lit cream (3%).

**Countryside night (ref 3, the sleeper):** `#261F17` / `#423324` dark wood (27%), `#080B0A` outside (12%), `#8A735E`
lit boards (12%), `#664F3D` wood (11%), `#1E2E3F` navy runner in shadow (10%), `#B69F81` cream wall (9%), `#5A7E98` /
`#38576F` blue bedding (14%), `#DFDCCF` linen (3%).

**Riviera golden hour (ref 2):** `#3A1E1D` / `#5F3228` dark red wood (35%), `#B86A3E` sunlit floor (12%), `#A1AAA5`
platform stone (9%), `#89572E` wood (9%), `#B69E3F` sunlit grass (8%), `#DBB974` gold (7%), `#E2D6BF` cream (7%),
`#992421` red runner and bed (5%); the sea `#4FB7C8`→`#9EE3E0` (sampled by eye).

**Gameplay colours (always brighter and more saturated than the scene):** request pin waiting `#A3AE94` (grey-green),
active `#F2C14E` (gold), job badge `#3F8FD9` (blue), money green `#4FB36B`, the conductor's navy `#1F2C4E` with a red
band `#C8453A`.

## 5. Characters
- Big-head chunky proportions, about **2.6 heads tall** (today's figures: head 0.32 of the height); mitten hands, chunky
  shoes, soft smooth shading, a faint own-colour lift so they never melt into a dark floor.
- **Colour identity per role** (unchanged, the refs agree): conductor navy with a red-banded cap; porter red with gold;
  attendant lilac `#7B5AA6`; barista coffee-brown with a green cap; chef white with a toque; waiter black and white;
  bartender burgundy `#8E2F45` with gold; host steel blue `#2E5A7A`; projectionist usher red `#A3283A` with gold;
  entertainer yellow and sky blue; masseur mint; lifeguard red `#D9363E` with a yellow sun cap (`STAFF_LOOKS`).
- **Guests** keep their archetype outfits (the student's tee and cap, grandma's lilac gown and spectacles, the
  businessman's coat and bowler…), four looks each; Route 1 adds farmers, grandpas, ramblers, the choir.

## 6. Post-processing
- **Tone mapping: ACES** (three.js's fit) with our grade on top, installed as the renderer's tone mapping so Low (no
  post) and Ultra share colours. Chosen over AgX because the refs' lamps are *saturated* amber in the highlights; AgX
  desaturates bright warm colours toward white and would need a stronger grade to win them back.
- **Bloom** on lamps and emissives only (threshold 1.0, strength 0.45 Medium, 0.6 High): specular is capped below the
  threshold, so only bulbs and glowing glass bloom.
- **Vignette** 0.36, a light grade (contrast 1.16, saturation 1.22), grain 0.02. **No depth of field.**

## 7. UI
- Counters: **dark navy glass pills** (`#33507E` → `#131F3A`) with a soft bevel, a thin gold inner rim and white
  numbers; buttons pearl enamel; the quick-travel strip's tabs **yellow rounded enamel** (`#FFE58A` → `#E3A52C`) on a
  navy rail; the level a gold star badge.
- **Request bubbles are map pins**: grey-green while waiting, gold when active, blue for jobs; each now a soft enamel
  button (a lit top, a shaded bottom, a gloss highlight).
- **Fonts**: **Fredoka 600** (OFL) for numbers and titles: round, chunky and friendly, readable at 12 px on a phone,
  the same soft language as the pins; **Jost** (OFL, already embedded) for everything else: a clean geometric sans that
  stays legible in long sheet text. Playfair Display stays for the postcards only.
- **Icons**: one style, soft and slightly 3D (the rendered item set, `assets/icons/items.png`, already is).

## 8. Readability (non-negotiable)
- Interactables, requests, dirty rooms and upgrade tiles stay instantly readable: world UI is drawn unlit, over walls,
  at a constant size; pins and badges are brighter and more saturated than anything in the scene.
- Lighting never hides a task: pools are added light (they never darken), and the night ambient is set so a dark floor
  still reads its contents (judged on the comparison shots in `docs/art/compare/`; an automatic contrast check of
  pins against the scene behind them is on the gap list).
- World UI is unlit and bloom's threshold sits above its brightest white, so pins never smear.
