# Royal Suite and First Class candidates (session 54)

Shortlisted sources for the owner's picks page "Royal Suite Picks". Nothing here is in the game yet: once the owner
picks, the chosen pieces go through `scripts/assets/bake_models.py` like the session 49–51 models.

| Folder | Source | Licence | Pieces |
|---|---|---|---|
| `polyhaven/` | Poly Haven models, glTF with 1k textures — https://polyhaven.com/models | CC0 (https://polyhaven.com/license) | GothicBed_01 (R1), vintage_day_bed (R2), ArmChair_01 (R3), sofa_03 (R4), Ottoman_01 (R6), ClassicConsole_01 (R7), GothicCabinet_01 (R9), chinese_screen_panels (R10), vintage_grandfather_clock_01 (R11), coffee_table_round_01 (R14), vintage_oil_lamp (R19), marble_bust_01 (R22), potted_plant_04 (R26), mid_century_lounge_chair (F2), GreenChair_01 (F3), sofa_02 (F8), vintage_wooden_drawer_01 (F9), round_wooden_table_02 (F10), side_table_01 (F11), ClassicNightstand_01 (F12), chinese_armchair (F16) |
| `quaternius-fantasy-props/` | Quaternius Fantasy Props MegaKit (Standard) — https://quaternius.itch.io/fantasy-props-megakit | CC0 (License.txt) | CandleStick_Stand (R16), CandleStick_Triple (R17), Chest_Wood (R23), BookStand (R28); trim textures downscaled to 512 px |
| `quaternius-house/` | Quaternius Ultimate House Interior (June 2020) — https://opengameart.org/content/lowpoly-house-interior-pack | CC0 (License.txt) | Fireplace (R15), Couch_Large2 (F5), Light_Floor3 (R27); MTL colours are linear |
| `kaykit-furniture/` | KayKit Furniture Bits 1.0 (free) — https://kaylousberg.itch.io/furniture-bits | CC0 (License.txt) | bed_double_A (F1), couch_pillows (F6), armchair_pillows (F7), lamp_standing (F13), lamp_table, rug_oval_A, rug_rectangle_stripes_A (G17) |

Textures in `assets/textures/candidates/`: Poly Haven diffuse scans (CC0) in `polyhaven/`, and the recoloured rug
fields made from them in `rugs/` (`scripts/assets/royal-picks/rug_duotones.py`).

Not downloaded (shown on the page only): candidates for which the triangle count or size was too high, the rest of
each pack, and the paid Tiny Treats Lovely Living Room (X1).

Rendering: `scripts/assets/picks-stage.ts` (the game's stage with candidates placed in an emptied suite) and
`scripts/assets/picks-shoot.mjs`; the scene specs and the page come from `scripts/assets/royal-picks/*.py`, which use
scratch paths of the session that made them.
