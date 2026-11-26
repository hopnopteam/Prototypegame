# Slop audit: the first three minutes (De-Slop Stage A, session 66)

**How it was made.** A brand-new game was played by the autopilot for 3 minutes of game time on a phone-portrait view
(390×844, Medium), one still every 6 s and a video at 2 frames a second (`scratchpad` capture, `simulate` stepped,
dusk pinned to the simulated clock). The 31 stills went to a reviewer who knew nothing about the project (a fresh
agent told to judge the images only, never the code or the docs). Its list is below, unedited in substance; my own
pass found nothing it had missed. Each tell has a crop in `docs/art/slop/`, its code source, a fix, a cost
(S under an hour, M a day, L several days) and a priority (P1 a stranger notices in the first minute, P2 on a second
look, P3 polish). The rules the tells break are `ART_BIBLE.md` §9.

**Two caveats about the capture.** (1) The autopilot never answers a card, so "Name your train" stayed up for the
last minute of the recording, and the capture drove the simulation directly, so the game moved under it; in play a
card pauses the game and a player answers it in seconds. T01's "the game keeps playing" is that artifact; its light dim
and T02 are real. The "after" capture presses a card's main button 3 s after it opens, as a player would. (2) Stills
6 s apart make camera moves look like cuts (T34); the video shows them as glides.

**Stage A scope.** The first three minutes: the opening platform, the lobby, the sleeper and café at their early tiers,
the first ride's scenery, the HUD, bubbles, arrows, the first pop-ups and all their copy. Fixed in Stage A are marked
**A**; partly fixed **A½**; the rest is Stage B (after approval) or needs the owner's decision (**Owner**).

## Tells

| # | Tell (crop) | Category | Code source | Fix | Cost | Pri | Stage |
|---|---|---|---|---|---|---|---|
| T01 | A card sits over the game with a light dim ([crop](slop/T01-T02-modal.jpg)) | UI | `.scrim` in `ui/styles.css` | Dim to ~62% (was 50%); the "game plays under it" part is a capture artifact (above) | S | P1 | **A** |
| T02 | Pins, chips, tile labels and bubbles peek out round the card ([crop](slop/T01-T02-modal.jpg)) | UI | world UI layer, `CameraRig.showWorldUi` | Hidden while any sheet is up (`Game.present`) | S | P1 | **A** |
| T03 | Half the frame is empty floor; the action is a small cluster ([crop](slop/T03-empty-floor.jpg)) | Composition | `econ.camera` (session 38b: the ad playable's camera, the owner's choice) | Frame the action lower-middle, closer on the platform | M | P1 | **Owner** (the camera was set to match the playable exactly) |
| T04 | Dark blotches all over the paving ([crop](slop/T04-paving-stains.jpg)) | Lighting/material | `flagstone` layer, `art/textures/build_stylized.py` ("wet patches" for the rainy night ref) | Removed (the random sequence kept, so no other layer changes) | S | P1 | **A** |
| T05 | Paving and planks oversized and visibly tiled ([crop](slop/T04-paving-stains.jpg)) | Proportion/repetition | `VISUALS.detail.flagstone.tile` | Platform flags 1.8 m a repeat (were 2.7, flags now 0.6 m); planks in Stage B | S | P2 | **A½** |
| T06 | Floor holes read as black rendering bugs ([crop](slop/T06-floor-holes.jpg)) | Placeholder/edges | `SUBFLOOR`, `JOIST` in `world/Floors.ts` | Mid timber below and pale joists (was near black); Stage B: splintered ends with depth, a lighter rim | S / M | P1 | **A½** |
| T07 | Window cracks are thin white scribbles | Placeholder | `buildWear` (`CRACK_PROUD`) in `CarriageView.ts` | A proper cracked pane or boards nailed over | M | P2 | B |
| T08 | Cabins are copy-pasted boxes ([crop](slop/T08-T09-cabins-beds.jpg)) | Repetition | `rooms()` in `layout.ts`, `buildClassDressing` | Per-cabin variation from data (bedding colour, a rug, a lamp, a picture, luggage) | L | P1 | B |
| T09 | Run-down beds are grey slabs ([crop](slop/T08-T09-cabins-beds.jpg)) | Placeholder | the tier-0 cot in `buildProp` (`CarriageView.ts`) | A faded russet wool blanket, rounded, with a turned-down fold (was a grey box on a grey mattress) | S | P1 | **A** |
| T10 | Interior walls flat and untextured | Material | `sideWall`, partition walls in `CarriageView.ts` | Skirting, a dado rail, a subtle paint pattern, grime at the base in the run-down tier | M | P2 | B |
| T11 | The engine and tender are kit lavender/indigo ([crop](slop/T11-tender.jpg)) | Consistency/colour | `LocomotiveView` (Kenney's train, unpainted) | Repainted deep railway green (`LOCO_PAINT`), red buffers and gold trim kept | S | P1 | **A** |
| T12 | Night drops the palette to a lilac filter ([crop](slop/T12-lavender-night.jpg)) | Lighting/colour | `NEW_LOOK_NIGHT` in `config/look.ts` | Moon and sky fill a moonlit blue, the ground bounce neutral (were violet and purple); Stage B: local contrast on people | S / M | P1 | **A½** |
| T13 | Five marker languages; a key in two styles in one frame ([crop](slop/T13-marker-styles.jpg)) | UI | `JobMarker` (`ZoneViews.ts`), `bubbleTexture`, `moodBubbleTexture` (`sprites.ts`), the coach | One pin family: one shape, colour for meaning (want / pick up / reward) | L | P1 | B |
| T14 | A stock emoji face in every bubble | Consistency | `moodBubbleTexture` (session 38b: the ad playable's faces, the owner's choice) | Draw the face in the icons' rendered style, or only when the mood changes | M | P2 | **Owner** |
| T15 | Bubbles and pins clipped at the screen edge | UI | `world/screenMask.ts` | Clamp to a safe margin; an edge arrow when off screen | M | P2 | B |
| T16 | Grey dots floating round the conductor ([crop](slop/T16-grey-dots.jpg)) | Placeholder | particle `mote` (`Particles.ts`, the Broken tier) | Small, warm, faint dust in the lamplight (were 5–9 cm grey at 55%) | S | P2 | **A** |
| T17 | The locked room's lid is a grey slab with two stripes ([crop](slop/T17-slab-lid.jpg)) | Placeholder | `buildCover` (`CarriageView.ts`) | A woven canvas dust sheet tied with two ropes, a bigger padlock | S | P1 | **A** |
| T18 | Price shown twice: on the marker and on the plate ([crop](slop/T18-price-twice.jpg)) | UI/copy | `TileView` face (`sprites.ts`) | The plate shows only its icon at rest; the price counts down on it only while it is paid into (when the marker steps aside) | S | P2 | **A** |
| T19 | Cash piles too big for the room | Proportion | `money.bills`, `CashView` (session 42: the owner asked for MPH-sized piles) | Smaller bills, taller stacks | S | P2 | **Owner** |
| T20 | Figures similar; the conductor does not stand out ([crop](slop/T20-same-figures.jpg)) | Consistency | characters (their own pass) | A unique hero silhouette and colour; more varied guest silhouettes | M | P1 | listed only (characters have their own pass) |
| T21 | A big saturated umbrella steals the focus ([crop](slop/T21-umbrella.jpg)) | Composition/colour | market umbrellas and the parasol (`StationShops.ts`) | Smaller (1.6 m) and muted (cream, sage, dusty rose) | S | P2 | **A** |
| T22 | The shore reads as a gradient smear | Material/edges | `Water.ts` shoreline, `terrain.ts` | A defined wet band, a foam line, reeds at the waterline | M | P2 | B |
| T23 | Floating primitive rocks and a lone bench | Placeholder | `Lakeside` fill kinds | Sculpted rocks sunk into the ground, props grouped with a reason | M | P2 | B |
| T24 | Grass is evenly sprinkled blade cards | Repetition | `Lakeside` fill | Clumping, height and tint variation, ground colour patches | M | P2 | B |
| T25 | Three or four typefaces in one card ([crop](slop/T25-T26-naming-card.jpg)) | Typography | `styles.css` | One display face for titles and buttons, one text face; the chips as game buttons | M | P2 | **A½** (the spaced capitals gone) |
| T26 | "What is she called?" and "PAINT IT ON" ([crop](slop/T25-T26-naming-card.jpg)) | Copy | `PressScreens.ts` | "Every great train has a name. What will yours be called?" and "Name her" | S | P2 | **A** |
| T27 | HUD pieces pop in; the route bar changes colour | UI | `Ui` progressive reveal (sessions 15–16, by design) | A short reveal for each new piece; one colour per bar meaning | M | P2 | B |
| T28 | The bottom strip is mostly empty early on | UI | `TrainMapUi` | Size to its content, bigger tiles | S | P2 | B |
| T29 | The barrow reads as a bench on wheels; a stray sign; a green quad | Placeholder | `PlatformView` | A recognisable porter's trolley; the sign on its building | M | P2 | B |
| T30 | The cat is an orange blob | Proportion | `TrainCat.ts` | Bigger, ears and tail that read | S | P3 | B |
| T31 | Zzz is plain flat text | Typography | the sleep bubble in `CharacterView` | Outlined, in the bubble style | S | P3 | B |
| T32 | Outlines on the HUD only | Consistency | rule 6 | Keep (rule 6: outlines are for UI); soften the HUD's slightly | S | P3 | B |
| T33 | Key props too small to read | Proportion | props | Hero props ×1.3–1.5 | M | P3 | B |
| T34 | The camera "cuts" (inferred from stills) | Motion | `Game.frameCamera` | Mostly the 6 s stills; check in the video | S | P2 | B |

## Copy audit (every player-facing line in the first three minutes)

Rules: sentence case, at most one exclamation mark on screen at a time, a word or two for praise, name the thing or the
action (`ART_BIBLE.md` §9 rules 8–9).

| Where | Before | After | Why |
|---|---|---|---|
| Coach steps | Drag to walk · Issue ticket · Collect cash · Open carriage · Check in · Take to room · Bring blanket · Collect cash | unchanged | already sentence case, an action each |
| Guide lines | Hand keys · Grab it · Tidy up · Shine shoes · All aboard! · Pick up · Deliver · Load bags · Restock | unchanged | "All aboard!" is the one exclamation on that screen |
| First passenger done | Nice! | unchanged | alone on screen |
| Praise (passengers) | Speedy! · Super fast! · Lightning! · Wow, quick! · Lovely! · Perfect! · Thank you! · Cheers! · Ta! · Perfect cuppa! · So cosy! · Spotless! … | Speedy · Super fast · Lightning · So quick · Lovely · Perfect · Thank you · Cheers · Ta · Perfect cuppa · So cosy · Spotless … | several guests at once had the screen shouting |
| Staff service floats | Speedy! · Thanks! · Too slow! | Speedy · Thanks · Too slow | same |
| Naming card title | NAME YOUR TRAIN (spaced capitals) | Name your train | sentence case |
| Naming card line | The Rail Gazette wants to write about you. What is she called? | Every great train has a name. What will yours be called? | "she" had nothing to refer to |
| Naming card button | PAINT IT ON | Name her | says what happens |
| Buttons, card titles, result card, level card, tile labels | spaced capitals (CSS `text-transform: uppercase`) | the words' own case | rule 8 |
| Tile markers | REPAIR · CABIN 2 · NEW CARRIAGE · COMFY SHOES · TIDY ROOMS 3/4 | Repair · Cabin 2 · New carriage · Comfy shoes · Tidy rooms 3/4 | rule 8 (`sentenceCase` in `sprites.ts`) |
| Station banner | MILLBROOK, HOLLOW CREEK… | unchanged | a sign: the one place capitals stay |
| Painted signs | TICKETS · TRAIN WORKS · the train's name on the carriages | unchanged | real signs are lettered in capitals |
| Loading screen | The luxury sleeper · Night Express · Loading · BONESTOCK | unchanged | brand marks |
| Result card headlines | Off we go! · All aboard! · Great stop! · Perfect stop! | unchanged | one card, one exclamation |

## What Stage A leaves (the honest list)

The biggest remaining tells are structural: copy-paste cabins (T08), five marker languages (T13), the camera's
framing (T03, the owner's playable camera), the characters' sameness (T20, their own pass) and the emoji faces (T14,
the owner's choice from the playable). They are Stage B or the owner's call, with the costs above.

## After Stage A: the second fresh-eyes check

A new reviewer saw only the after stills (same seed and capture; cards answered after 3 s). Its report is in
[`SLOP_CHECK2.md`](SLOP_CHECK2.md), unedited. Before and after pairs are in `slop/compare/` (and `naming-card.jpg`).

**Gone from its list** (all flagged by the first reviewer): a card over a live game with world labels peeking round
it (T01, T02), the stained paving (T04), the grey slab lid (T17), the price shown twice (T18), the saturated umbrella
stealing the focus (T21), the grey run-down beds (T09), the lavender engine (T11), black holes in the floor (T06:
now "decals, not holes", a smaller complaint), the spaced capitals (T25).

**Still on its list, as expected for Stage B:** the empty lower half of the frame (T03, the camera), the lobby's bare
floor, the five marker languages and the emoji face (T13, T14), copy-paste cabins (T08), labels clipped at the screen
edge (T15), the bottom strip (T28), the lakeside rocks, grass and shore (T22–T24), the motes (T16: smaller and warm
now, still read as circles), the teaser's ribbon and medallion, the night platform without lamp pools.

**New in its list** (not raised the first time):
- the broom icon reads as an éclair or a hot dog (P1);
- unexplained "×2" Rush chips and a stray number on a tile (P1);
- the locomotive near-black at night: the green paint was too dark, so it was lifted a step (#2F4D3F → #3F6E53) after
  this check;
- the name plate standing loose beside the tender;
- "Lamps" shown with a heart;
- a dangling separator in the hire label;
- doors painting over passers-by;
- the naming card's copy called generic ("Name her" twee).

Each goes on the Stage B list.

**Its verdict:** "a strong systems prototype dressed with mismatched kit parts, not a single-author visual identity".
The first reviewer's was "competent greybox wearing store-bought assets". Stage A removed the cheapest-looking
stand-ins. The identity problems are structural:
- world UI in one language;
- night lit by lamps rather than by a colour grade;
- dressed rooms;
- the camera.

That is Stage B, and a decision on the camera and the faces, which were the owner's choices.
