# Character spec: "soft clay toys"

Measured from the reference sheets in `docs/art/refs/characters/` (`sheet_people.jpg`, 432×2000, 36 figures;
`sheet_closeup.jpg`, 1080×2000, 12 figures plus "4 Directions"). The sheets are an internal style reference only:
they never ship, and no single figure (outfit, hair and face together) is copied. Everything below is the *style*.

How it was measured: each figure was cropped from `sheet_closeup.jpg`, upscaled ×3 with a pixel grid, and its landmarks
were read off the grid (head top, chin, waist or belt, the top of the shoe, the sole). The widths were read
perpendicular to the view. Colours come from a 10-cluster k-means over the figure's pixels (floor and shadow masked
out), plus direct samples of the eyes and lips. The figures used were the bald man in "4 Directions" (the largest,
256 px from crown to sole), the girl with glasses, the boy in the cap and the blue-haired runner.

## 1. Camera of the reference

- The camera looks down about 40° through a long lens (almost no perspective: the near and far feet are the same size).
  The key light is high, behind and to the right, so a long soft shadow falls toward the lower left.
- The proof renders use the same camera: a 40° pitch, a 20° field of view and the figure turned 35° from the camera.
  In game, the camera looks down 48°, which is close enough that matching these numbers in projection holds there too.

## 2. Proportions

Fractions of the projected height, crown = 0 and sole = 1, at the reference camera:

| Landmark | Bald man | Girl | Boy (cap) | Target |
|---|---|---|---|---|
| chin | 0.35 | 0.35 | 0.37 | **0.35** |
| waist / belt | 0.55 | 0.53 | 0.52 | **0.54** |
| top of shoe (cuff or sock) | 0.90 | 0.92 | 0.91 | **0.91** |

- **Heads tall:** 2.85 in projection (1 / 0.35). The brief asked for 2.2–2.5, but the sheet measures 2.85, and matching
  the reference 1:1 takes precedence. In 3D that is a head 0.40 m tall on a 1.20 m adult, which is our current height, so
  bubble anchors, stack, seat, bed and scooter heights are unchanged.
- **Head:** width ÷ height 0.88 in projection (78 ÷ 89 px). Since part of the crown shows from above, it is about 1.05
  wide for 1 tall in 3D: a softly squared ball (superellipse exponent about 2.5), fullest at the cheeks. There is no
  neck: the head sits on the shoulders, and its chin hangs in front of the chest.
- **Torso width ÷ head width:** 1.15 for the stout man, 1.25 for the boy (a short tee over a round belly) and 0.80 for
  the slim girl. The **target is 0.95** for an adult, 1.12 for stout figures, 0.82 for slim ones and 1.15 for children.
  Our current torso is 0.76: the biggest single gap.
- **Torso length:** in projection, chin to belt is 0.20, but the chin hides the top of the chest. In 3D, shoulder to
  belt is 0.36 m, and the shoulders are round and high with no slope.
- **Arms:** forearm thickness ÷ head width is 0.26 in a sleeve and 0.23 bare (ours is 0.15). The hand hangs at belt
  to crotch height. A mitten is 0.28 of the head width across (about 0.115 m), with no fingers and a soft thumb bump.
- **Legs:** trousers measure 0.45–0.49 of the head width across (they are cut generous); bare legs under a skirt or
  shorts measure 0.19–0.20 (thin, like a doll's). Trousers end in a **rolled cuff** 0.05 m tall, 10% wider than the
  leg, with a grey-white sock band (0.02–0.03 m) showing above the shoe.
- **Shoes:** length ÷ head width is 0.75 for men and the boy, 0.48 for the girl. They are chunky and rounded, with a
  domed toe, a clearly paler sole about 0.025 m thick, and a heel as tall as the toe.
- **Children:** about 0.62 of an adult's height, with a head 1.1× an adult's, so 2.4 heads tall.

## 3. Face

All values are in 3D, as fractions of the head width (0.42 m):

| Feature | Measured | Target |
|---|---|---|
| eyes | vertical ovals 12 × 7 px in a 78 px head (3/4 view) | 0.075 tall, 0.05 wide, nearly flush with the face |
| eye spacing (centres) | 22 px in 3/4 view → about 0.38 of the width face on | **0.38** (wide-set) |
| eye height | 0.57 down the projected head → the head's centre in 3D | at the head's centre, or 1% below it |
| eye colour | #26376A blurred average, #1F2152 core | **#24348E**, no white, no catchlight |
| nose | a round bulb, 0.14–0.18 of the width on men, smaller on women and children | sphere r 0.036 (men: 0.17 of the width across), 0.028 otherwise, 0.024 for children; mostly proud of the face |
| ears | round knobs at eye height, 0.17 of the head height | r 0.045 discs, 0.6 deep, set slightly behind centre |
| mouth | a small red oval (#C0392B region, mostly blurred) | 0.07 wide, 0.025 tall, under the nose |
| moustache | a dark soft bar under the nose | a two-lobed pill |

## 4. Hair

- **A helmet, never strands:** one smooth shell standing 0.035–0.05 m off the skull. Its edge is a **rounded rim**
  (the shell's thickness is visible, as in clay), and its surface is slightly glossier than the skin.
- **Volume:** short hair adds about 8% to the head's width. A bob reaches the jaw. Long hair is one slab down the back
  to mid-back (girl, 0.45 of her height), 0.1 m thick. A balding head has a thick horseshoe round the back and over
  the ears, with the crown bare.
- **Hats** sit on the hair: the hair is flattened under them, but its sides still show below the brim.

## 5. Clothes

- **Soft tubes:** every garment is a smooth lathe-round form with no folds modelled.
- **Edges are rolls:** sleeves end in a rolled cuff, trousers in a turned-up hem, and a tee in a hem band at the hips.
  Collars are a soft rolled band round the neck hole, with a shirt's points as two soft tabs.
- **Belts:** 0.03 m tall, dark brown (#3A2418), with a pale metal buckle (#D8D2C0) front and centre.
- **Skirts and dresses** flare from the waist to the knee in one smooth bell; the hem is a soft roll.

## 6. Material and light

- **Matte clay:** diffuse that wraps round the form (light reaches a quarter of the way past the terminator), a broad,
  soft specular sheen (roughness 0.55, very low intensity), and a warm, slightly saturated band in the shadow side
  (subsurface warmth).
- **Shadow side:** the skin shade ÷ lit ratio is 0.73 (#A27F61 against #DEB385), and the cloth ratio is 0.75
  (#A7A195 against #DED8BB). The shadow is soft, never black, warmer on skin and slightly cooler on cloth.
- **Creases:** contact occlusion under the head on the shoulders, in the armpits, under the hems and cuffs, and
  between the legs. It darkens to about 0.7 at the deepest point.
- **Contact shadow:** a large soft blob, cool grey-blue (#BBC3C7 on white, so 0.76 of the floor's brightness at its
  core). It is offset away from the key light and feathered over about the figure's own width.

## 7. Sampled colours

These are the reference's palette, used as targets for the style's saturation and value. They are not copied 1:1 to
any one figure.

| Swatch | Lit | Shade |
|---|---|---|
| skin | #DEB385 | #A27F61 |
| cream shirt | #DED8BB | #A7A195 |
| navy trousers | #0F1F2F | |
| dark hair, shoes | #302D28 | #101315 |
| cap | #D57D63 | |
| red tee | #750101 (deep shade) | |
| blue-grey dress | #597C88 | |
| sock | #D8DBDD | |

Saturations are moderate: clothes are mid-saturated primaries (red, blue, mustard, teal) next to neutrals (cream,
navy, charcoal). The skin is a warm peach.

## 8. Motion

Read from the walking poses on the sheets (the stride and the swing are frozen mid-step in each figure):

| Parameter | Walk | Run |
|---|---|---|
| stride (thigh swing, each way) | ±0.45 rad | ±0.8 rad |
| knee bend on the passing leg | 0.6 rad | 1.1 rad |
| arm swing (from the shoulder) | ±0.35 rad, elbow bent 0.4 | ±0.7 rad, elbow bent 1.2 |
| bob (twice per cycle) | 0.035 m, up at the passing pose | 0.07 m |
| sway (roll, once per cycle) | ±0.06 rad toward the stance foot | ±0.04 rad |
| hip twist (yaw) | ±0.10 rad, the shoulders counter at half | ±0.14 rad |
| forward lean | 0.06 rad | 0.16 rad |

- **Idle:** breathing at about 0.25 Hz (±1.5% chest scale), with a weight shift every few seconds.
- **Turns:** eased (critically damped at 14 rad/s), never snapped.

## 9. Our build (how the numbers are met)

- **Joints:** we chose (b), rigid parts with sculpted joint caps. A limb is two segments of equal radius where they
  meet, and the joint is a sphere of that radius at the pivot, so the outline stays continuous at any bend with no
  stretching. The reasons:
  - It costs nothing on a phone: no second matrix fetch per vertex, and no extra attributes.
  - It keeps the pull batch's swap-safe path (one matrix per part, no `gl_DrawID`) exactly as it is.
  - The reference's tubes are uniform, so a sphere joint is what a clay toy would have anyway.
  - Skinning in the pull shader (a) would double the matrix reads for every limb vertex, and needs a second
    instance index per vertex.
- **Parts:**
  - Built in Blender (`art/blender/characters/char_kit.py`): the head with its ears and hair helmet (one model per
    hairdo), the mitten hands and the chunky shoe.
  - Built in code: the garments (`world/CharacterParts.ts`), as lathe tubes with rolled hems, so any outfit, build and
    colour comes from data.
- **AO:** Cycles bakes it into the Blender parts. For the assembled figure, code adds sphere-proxy occlusion at build
  time (head over shoulders, arms over the sides, the hems), cached per look.
- **Material:** the character pull material gains wrap lighting, the subsurface warmth band, the sheen and a
  hemispheric fill, on every tier (per vertex on Low and Medium, per pixel on High and Ultra).

## 10. What Stage A measured (busy scene: the full Riviera train at a stop, Low tier, the same autopilot run)

| | Old figures | Clay figures |
|---|---|---|
| triangles per person (all parts) | 9,772 | 7,168 |
| vertices in the crowd's batch (70–73 people) | 425,812 | 282,108 |
| CPU to pose and batch the crowd, per frame | 2.0 ms | 2.1 ms |
| draw calls | 75 | 76 |

The pacing simulator is byte-identical (fast profile, seeds 1 and 2, 15 minutes, logs and CSVs compared). The heads
are 900–1,550 triangles, the mitten 284 and the clay shoe 416.

## 11. LOD triangle budgets (proposed)

| Tier | Per adult figure | 40 people | Notes |
|---|---|---|---|
| Ultra / High | ≤ 4,500 | 180k | full head and hands |
| Medium | ≤ 3,000 | 120k | head 26 × 18, limbs 12-sided |
| Low | ≤ 2,000 | 80k | head 20 × 14, limbs 10-sided, no ear backs |

Figures beyond 12 m from the camera use the Low set on every tier. Stage A measures the High set; the LODs land in
Stage B.
