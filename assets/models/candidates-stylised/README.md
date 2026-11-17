# Royal Suite and First Class candidates, stylised (second hunt)

Shortlist for the owner's picks page "Royal Suite Picks — Stylised" (https://claude.ai/artifact/2jgRKpkNRb5dPEjppoqTDG).
The first hunt (`../candidates/`, mostly Poly Haven scans) was rejected as out of place; everything here comes from
the same packs, or the same authors, as the models already in the game. Nothing here is in the game yet: once the
owner picks, the chosen pieces go through `scripts/assets/bake_models.py` like the session 49–54 models.

| Folder | Source | Licence | Options |
|---|---|---|---|
| `kaykit-furniture-bits/` | KayKit Furniture Bits 1.0 (free), Kay Lousberg — https://kaylousberg.itch.io/furniture-bits | CC0 (License.txt) | R1 bed_double_B, R2 armchair, R3 armchair_pillows, R4 couch_pillows, R5 cabinet_medium_decorated, R6 cabinet_small_decorated, R7 stand cabinet_small, R8 table_low, R9 table_small, R11 lamp_standing, R12 lamp_table, R17 book_set and pictureframe_standing_A, R18 pillow_A/B, F1 bed_double_A, F2 couch, F3 armchair, F5 chair_C, F6 shelf_B_large_decorated, F10 lamp_standing, G2 rug_oval_A, G3 rug_rectangle_B |
| `tinytreats-bubbly-bathroom/` | Tiny Treats Bubbly Bathroom 1.1 (free), Isa Lousberg — https://tinytreats.itch.io/bubbly-bathroom | CC0 | R7 mirror, R13 candle |
| `tinytreats-bakery-interior/` | Tiny Treats Bakery Interior 1.1 (free) — https://tinytreats.itch.io/bakery-interior | CC0 | R14 pastry_stand_B_decorated, F7 table_round_A, G7 rug |
| `tinytreats-pleasant-picnic/` | Tiny Treats Pleasant Picnic 1.0 (free) — https://tinytreats.itch.io/pleasant-picnic | CC0 | R15 serving_tray_round and wine_glass, R20 radio, F9 serving_tray_square_A |
| `quaternius-house-interior/` | Quaternius Ultimate House Interior (June 2020) — https://opengameart.org/content/lowpoly-house-interior-pack | CC0 | R10 Table_RoundSmall2, R21 Houseplant_6, G4 Carpet_1, G5 Carpet_Round |
| `kenney-furniture-kit/` | Kenney Furniture Kit 1.0 — https://opengameart.org/content/furniture-kit | CC0 | F4 loungeChair, F8 lampSquareTable, G6 rugRound |

Painted rugs G8–G15 (`assets/textures/candidates-stylised/*.png`) were drawn for the game this session by
`scripts/assets/royal-picks-stylised/rugs.py` (flat colours, no photo source).

Paid packs shown on the page only (not bought): Tiny Treats Lovely Living Room ($7.95, recommended: grandfather clock,
fireplaces, wingback chair), Playful Bedroom ($7.95), Collection 1 ($19.95), KayKit Furniture Bits EXTRA ($3.95).

Rendering: `scripts/assets/picks-stage.ts` now bakes every candidate to vertex colours and recolours it with the
game's own `recolor` (hue bands in `royal-picks-stylised/catalog.py`); `picks-shoot.mjs` takes `DSF` for sharper
crops. The scene specs, layouts, crops and page come from `scripts/assets/royal-picks-stylised/*.py`, which use the
scratch paths of the session that made them (`/tmp/claude-0/hunt2`).
