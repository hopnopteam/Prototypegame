# Fresh-eyes check 2 (after De-Slop Stage A), unedited

A new reviewer that knew nothing of the project saw only the 31 after-stills (same seed, same capture, cards answered after 3 s as a player would). Its report, verbatim:

ART REVIEW: first 3 minutes, 31 frames (t000–t180), portrait

T01. t000, t006, t072, t102: lower half of the frame. The conductor and all the action sit in the top 40% of the screen. The bottom half is empty brick paving with one stray lamp post, so the eye has nowhere to land. Composition, P1. Fix: frame the hero at about 55–60% of screen height, or pull the camera in on the platform, and put stalls, benches, travellers or a planter band in the near foreground so the lower half carries content.

T02. t066, t090, t132, t138, t156: the lobby. The room is huge and almost bare: a desk, a sideboard, a small cabinet and a featureless cream block on the front wall, around a wide field of plain planks. It reads as a level-blockout room. Composition/placeholder, P1. Fix: shrink the room or fill it with a rug under the queue, plants, a luggage rack with cases, wall art, a bench with cushions and a ceiling-light pool, so no empty floor run is longer than about 1.5 character heights.

T03. t066, t090, t132, t156: top right. The locomotive and tender are a near-black stack of boxes with almost no readable detail, only stepped silhouettes. At night this is the darkest and most "untextured" object on screen. Material/lighting/placeholder, P1. Fix: give the loco a lit livery (brass bands, a red buffer beam, a lit cab window, a lamp glow), add rim light from the platform side, and keep the top surfaces at least 25% value so the shapes read.

T04. t132, t138, t156: top right. The "THE NIGHT OWL" gold nameplate floats on its own beside the tender, tilted, with a blue job badge stacked over it. It is not attached to anything. Floating-clipping, P1. Fix: mount it on the cab side or on brackets with visible fixings, and move the badge so the two never overlap.

T05. t162, t168, t174, t180: left edge and top. The "BASIC" class pill floats over the lakeside grass, is cut off by the screen edge ("ASIC", "SIC"), and in t180 sits under the HUD bar. Floating-clipping/UI, P1. Fix: clamp world labels inside a safe rect with an edge arrow, or anchor the class chip to the carriage roof line and hide it while it is off-screen.

T06. t162, t180: top right. Tile markers ("Attend… Tidy r…") are sliced by the screen edge. UI, P2. Fix: the same edge-clamp rule for every world label.

T07. t042, t162, t174: blue badges over the corridor. The brown elongated icon reads as a chocolate éclair or a hot dog. Nobody would guess it is a broom or "tidy". Placeholder/UI, P1. Fix: redraw it as an unmistakable broom or dustpan with a sparkle, and test it at 40 px with five strangers.

T08. t180, lower left: the "Lamps" upgrade uses a heart icon, so the label and the picture disagree. Copy/consistency, P2. Fix: use a lamp icon, or rename the upgrade to the benefit it gives.

T09. t012, t084, t090, t150: job badges and bubbles come in at least four visual languages: gold shield pins, blue circle pins, grey circle pins and white speech bubbles. A gold key and a blue key are even stacked in t012. Consistency, P1. Fix: one badge family with colour meaning only one thing (for example blue = do this, white bubble = guest wants), the same shape and outline weight, and never two badges for one action.

T10. t006, t030, t054, t150, t168: guest bubbles. A stock yellow smiley face sits beside the item icon. It looks like a system emoji pasted in and clashes with the rendered 3D item icons. Consistency/placeholder, P2. Fix: drop the face for the neutral state (show only the item), or draw custom faces in the game's outline and shading style.

T11. t030, t150: the requested blanket and pillow are pink and blue gingham cubes. In the conductor's hands the blanket reads as a gift box. Proportion/placeholder, P2. Fix: model folded fabric with a soft drape and a visible fold line, and make the carried size match the bubble icon.

T12. t036, t060, t084, t108, t138, t144: grey translucent circles trail behind and around the conductor. They read as render artefacts or bubbles, not dust. Motion/placeholder, P2. Fix: use small, short-lived, warm-tinted dust puffs at the feet only, under 0.4 s, with soft edges, or remove them on interiors.

T13. t120, t126, t138, t144, t174: a yellow "⚡×2"/"×3" pill floats on the floor under the conductor with no explanation, and t126 adds a bare "7" floating over a tile. Unexplained numbers look like debug output. UI/copy, P1. Fix: give the streak chip a label or icon tied to the HUD, attach it to the character's head, and remove or label the stray "7".

T14. t108–t180: top bar. The gem counter shows 0 for the whole session, the "★ 3.8" chip is unexplained, the route bar has no labels, and a teal ticket chip with a number (t066–t102) sits at the bar's end. Four unexplained readouts in the first minutes. UI, P2. Fix: hide gems until the first is earned, put a station name or "Next: X" on the route bar, and introduce the rating and the chip with a one-time tooltip or hide them until they matter.

T15. t132–t180: bottom bar. A full-width navy strip holds two small tiles hugging the left edge, so 75% of it is empty, and corner badges cover the tile art. UI/composition, P2. Fix: hide the strip until there are 3+ carriages, or centre the tiles and size the bar to its content; move the badges outside the icon area.

T16. t150, t174: the Attendant tooltip is a dark rectangle in a different style from the cream price pills elsewhere, and its line ends with a dangling "·" separator. UI/typography, P2. Fix: use the price-pill language, put one requirement per line with progress bars, and no trailing separators.

T17. t126: the next-carriage teaser. A grey corrugated-looking tarp has a flat painted red stripe for a ribbon, a bow loop that cuts into the roofline, and a giant flat gold "?" coin standing upright. It reads as a sticker on a shed. Placeholder/material, P2. Fix: model the ribbon with thickness and a draped bow on top, make the tarp soft canvas with folds and ropes, and make the "?" a small dimensional medallion or drop it.

T18. t018, t024, t036, t048: floor damage. The holes are flat dark rectangles with jagged painted edges, repeating the same shape. They read as decals, not holes. Material, P2. Fix: model a few distinct broken-plank holes with depth (the joists visible below, splintered board ends), rotate and vary them, and use no more than one or two per room.

T19. t018, t024, t042: corridor windows. The cobwebs are white scribbles on flat pale-blue rectangles and look like scratches or UI noise. At night (t078, t108, t120) the windows become flat navy slabs with no glass, frame depth or reflection. Material/lighting, P2. Fix: inset glass with a frame bevel and a faint sky reflection, a warm interior spill at night, and webs as fine radial shapes in the corners only.

T20. t048, t096, t108, t144, t180: three to four identical cabins in a row: the same bed, bedspread, door and empty floor. Repetition, P2. Fix: vary each cabin (rug colour, a bedside item, luggage, a picture, a lamp) while keeping the furniture footprint.

T21. t072, t102: night arrival at the platform. The whole platform takes a flat lavender-grey cast, and the lamp posts are black silhouettes with no light pools or glow, so night looks like desaturation, not lighting. Lighting/colour, P1. Fix: add warm lamp pools on the paving under every post, emissive lamp heads, and a cool ambient light that keeps the material hues (brick stays brick); cap the colour shift.

T22. t120, t132, t138, t156: the lobby. The floor carries a strong warm radial hot spot in the middle that falls off to murky corners, with no visible lamp causing it. Lighting, P2. Fix: tie every light pool to a visible fixture (a ceiling lamp or desk lamp), or flatten the interior fill and add contact shadows instead.

T23. t006, t012, t066 right side: the carriage exterior is a flat dark-green box with cream window strips, no bogies, wheels or underframe, and it sits straight on the ground. Placeholder/proportion, P2. Fix: add an underframe, bogies, steps, door handles, a roof edge cornice and lining on the body side.

T24. t000, t024, t030: scale. The outdoor bench by the lake is as long as a cabin, the locomotive wheels in t000 are taller than a person, the jetty planks are huge, and the ticket stand reads as a garden picnic table. Proportion, P2. Fix: build one scale sheet (person 1.0, bench 1.6–1.8 m, loco driving wheel 1.5–2.0× a chibi) and make the ticket stand a booth or a counter with a canopy.

T25. t000, t102, t006: lamp posts. Two unrelated designs share the platform: a tall black lantern and a short crooked hook lamp that reads as a coat hanger. Consistency, P3. Fix: one Victorian post family with two heights.

T26. t024, t048, t078: lakeside. Flat grey pentagon rocks sit on the grass like untextured primitives, grass is a uniform green plane with sparse card blades, the shoreline is a ruler-straight gradient band, and lily pads are flat discs. Placeholder/material, P2. Fix: rounded, sculpted rocks in clusters, a ground texture with tonal variation and edge clumps, an irregular shoreline with reeds breaking it, and lily pads with a notch and a flower.

T27. t078, lower centre: the cash in the cabin. A grid of flat green tiles lies on the floor, more bills hover mid-air at the door frame, and white cup litter is scattered evenly like confetti. Floating-clipping/placeholder, P2. Fix: stack cash as a small 3D pile with stagger, bills fly only along an arc to the player and never rest mid-air, and place litter in 2–3 clusters near the bed.

T28. t168, t054: door leaves overlap the conductor and guests as they pass; in t168 the red door paints over the conductor's body. Floating-clipping, P2. Fix: open doors earlier and fully against the wall, or depth-sort and offset them so characters never intersect them.

T29. t000, t102: the beige market parasol at the lower right reads as a mushroom or cabbage, turns flat grey at night, and is clipped by the frame. Material, P3. Fix: give it panel seams, a scalloped edge and a pole; keep the fabric hue at night.

T30. t180, t150: bedspreads have a smeared pink-to-red gradient with banding, like an unfinished vertex-colour blend. Material, P3. Fix: a flat fabric colour with a stitched hem and a folded top sheet, and a subtle texture rather than a gradient.

T31. t114: the "Name your train" card. Its header carries an unrelated newspaper icon, the outlined title stroke is thick and soft, the copy "Every great train has a name. What will yours be called?" is generic template text, "Name her" is twee, and the suggestion chips look like default form pills. Typography/copy/UI, P3. Fix: a train or nameplate header icon, punchier copy ("Paint her name on the engine"), a nameplate-styled input showing the gold plate, and a single typeface treatment.

T32. t000, t006: tiny signage. The "TICKETS" and "TRAIN WORKS" boards are thin black plates with miniature caps that cannot be read on a phone. Typography, P2. Fix: double the letter size, use cream on green or navy with a gold border, and angle the boards to face the camera.

T33. t030, t036, t042: a flat yellow 2D arrow with a heavy outline lies over the 3D scene and points diagonally at walls. It is generic tutorial clip-art in a different style from the rendered badges. Consistency, P3. Fix: match the badge family (a rendered, slightly bevelled arrow with a soft bounce) or use a floor glow instead.

T34. t000 top right, t102 top right: NPCs walk under the menu button and the progress bar, with no safe margin between the HUD and the play area. UI/composition, P3. Fix: push the camera's framing down or add a soft HUD backing gradient.

VERDICT
The underlying scene is competent toy-diorama 3D: the chibi characters, the wood floors and the cut-away rooms all hold up. What gives it away as unfinished or templated is everything around them. Big rooms and platforms are mostly empty. Night is done as a colour cast, not as lighting: dark slab windows, unlit lamps and a black-box locomotive. World UI floats and clips with no rules: class pills off-screen, a nameplate in mid-air, stray numbers on the floor. Badges come in four styles plus a stock emoji. Several hero objects (the teaser carriage, the floor holes, the rocks, the blanket) are still stand-ins. A publisher's art lead would see a strong systems prototype dressed with mismatched kit parts, not a single-author visual identity.

Fix first:
1. T21/T03/T22, the night lighting pass: lamp pools, lit fixtures, a readable locomotive and no colour-cast "night".
2. T09/T10/T07/T13, one world-UI language: one badge family, no stock emoji, a readable broom icon, no unexplained floating numbers or chips.
3. T01/T02/T05, composition and dressing: hero lower in frame, the lobby and platform filled to density, and every world label clamped to a safe area.