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

## 12. Session 62: clothes that move, details, and the Stage A gaps closed

**Clothes that move** (owner: "make sure their clothing actually genuinely behaves somewhat like clothing"). Skirts,
coat tails, an apron's skirt, long hair and ponytails are their own pieces, each hung from a pivot (the waist at
0.47 m, the coat's at 0.5 m, the back of the head) and swung by a damped spring (`CLOTH_SPRING` in
`world/CharacterView.ts`, about 1.5–2 Hz, lightly damped so it overshoots and settles). Each piece's angle is simulated
in the world's frame and shown relative to its parent, so:

| What the figure does | What the cloth does |
|---|---|
| sets off | trails back (inertia), then hangs a little back at speed (air) |
| stops | swings forward past the legs and settles |
| turns | flicks out to the outside of the turn |
| each footfall | a small bounce back and a sway toward the landing foot; a skirt's hem flares and settles |
| leans, sways, twists (the walk) | lags behind the body and catches up |
| walks in a long coat | each half (open at the front, vented at the back) is pushed by its own leg |
| walks in an apron | the apron's skirt is pushed by whichever leg leads |
| sits | the skirt drapes forward over the lap; coat halves follow the thighs |

Hems carry soft vertical folds (a lathe whose radius ripples round it toward the hem) and a coloured lining, which
shows as the cloth swings. No game randomness, no gameplay effect: the pacing simulator stays byte-identical.

**Details** (owner: "too flat… add some important details"): eyebrows in the hair's colour, a blush painted into the
cheeks, lapels, a placket, pocket flaps (jackets, coats; a breast pocket on shirts), a ribbed tee neckline, a dress's
sash with a bow at the back and a round collar, a coat's self belt and double row of buttons, trouser side seams, laces
on the shoes.

**The gaps, closed:**

| Gap | Fix |
|---|---|
| no long cast shadow | each figure lays a soft stretched shadow from its feet away from the key light (the moon, or the low sun), as long as the light is low (0.35–1.5 m); one more fan in the shadows' batch |
| flat hat crowns | soft felt hats from Blender (`ch_hat_conductor`, `bowler`, `boater`, `pillbox`, `beanie`, `tophat`, `toque`, `cap`): bevelled, rolled edges, knit ribs on the beanie, panels on the cap, pleats on the toque |
| hair has no gloss | hair takes a smoother surface (per-key surfaces on a recoloured model) and the figure shading adds a broad highlight, gentler on light hair (per pixel on High/Ultra, per vertex on Low/Medium) |
| smaller noses | 0.043 m (men) and 0.035 m (was 0.036 and 0.028) |
| pale skin | every skin warmed toward the reference's peach (hue toward 28°, a little more saturation, same lightness: `warmSkin`) |
| no children | a figure drawn under 0.8 scale is a child: its head ×1.25, so 2.4 heads tall |

**Measured** (the full Riviera train at a stop, Low tier, the same autopilot run): 8,112 triangles a person (Stage A
6,546 in this scene; the figures before the overhaul 9,772), sync 3.0 ms (3.0), draw calls 78 (77). The LOD sets of §11
were not needed to stay under the old figures' cost; they remain the next step if a phone needs it.

## 13. Session 63: cloth you can feel, nothing clips, a move for every item

Owner: "very plasticy… no realism to their clothes, or their props… none of the clothing is actually clipping in any
place… individual detailed animation… when he picks up the bags, when he is holding the bags… zero clip ins".

**Cloth you can see.** Every garment carries a weave from the detail texture sheet, sampled in the figure's own space
(a blended three-way projection under `NX_FIGURE`, so a texture never smears down a tube or a lathe) and multiplied over
its colour: twill on jackets and trousers, tweed (a soft herringbone) on long coats, oxford on shirts, dresses and
aprons, knit on tees and socks, denim on blue trousers worn with a tee or shirt, felt on gowns and hats, leather on
belts, smart shoes and bags, straw on boaters, fine strands on hair. Nine drawn layers (`build_stylized.py`: `twill`,
`knit`, `denim`, `tweed`, `oxford`, `felt`, `leather`, `straw`, `hair`; strengths and repeats in `VISUALS.detail`).
Silhouettes are rounder (limb tubes and joints 16 sides), the mitten hands are one remeshed Blender piece (palm, thumb
and wrist joined, no seam at the cuff).

**Nothing clips** (`tests/clip.test.ts`, `tests/clipkit.ts`; `npm run audit:clip` runs everything, about 5 minutes).
The test measures every body part, garment, hat and held item as a volume (the torso exactly, lathes as radial
outlines with their rings interpolated, items as boxes) and samples every frame: every guest look walking, running,
stopping and turning from three stride starts; every gesture standing and seated; every carrier (conductor and each
helper) taking and handing over every load (a tray stack, bags, linen, towels, a crate, a surfboard); the supply box on
the shoulder with a tray in front. Fixes it drove:

| Was clipping | Fix |
|---|---|
| legs through skirts, gowns and coats | the cloth keeps an outline the legs cannot leave: each frame the hem's swing is searched for a pose clear of both legs (the eased swing first) and the flare opens up to ×1.3 where it must; strides shorten in long clothes (gown walk ×0.58, dress ×0.82, coat ×0.9, apron ×0.95) |
| arms through hips, skirts and coats | the shoulder sits 4.6 cm further out; each figure's resting arm angle is measured from its own body, thighs, cloth and sleeve width; arms follow a flaring skirt |
| arms-up gestures through the head | cheer, wave, yawn and the ticket wave lift the arms wide of the head |
| long hair into the back | hair is pushed out of the torso and its swing follows the head's tilt |
| a cup or phone in the face | sipping and phoning are reached by the arm to a point clear of the face, with the free hand |

**A move for every item** (`world/CarryPose.ts`, `CharacterView.setLoad`/`startMotion`/`applyHold`,
`gameplay/CarryStack.ts`). The arms are solved, not posed: a two-bone solve puts each hand exactly on its grip (under a
tray's back corners, round a suitcase handle, against the box on the shoulder) and turns the palm to face it.

| Item | Take (s) | Hold | Hand over (s) |
|---|---|---|---|
| tray of food and drink | 0.42: the tray offered forward and a touch lower to meet the cup, a small knee give | on a walnut tray just clear of the belly, chin and hat (measured from the figure); a tall stack is lifted and the head peeks round it | 0.44: carried out and up to the guest with a small bow, then back in |
| linen, towels, pillows, blankets | 0.44: a reach for the folded pile, then hugged in with a little squeeze | in front, against the chest | 0.42: held out and a touch lower |
| one or two bags | 0.52: a bend at the knees toward that side, the hand down and out for the handle | one in each hand at the side, clear of the hips and coat, swinging with the walk | 0.46: swung forward and down |
| more bags, crates | 0.54/0.62: a real squat, the back tipping forward, the load brought up close (a crate lower and slower) | stacked in front like the tray | 0.5/0.56: set down the same way |
| surfboard | 0.45: a small dip, under the arm | under the arm, clear of the hair | 0.4 |
| supply box | a lift to the shoulder | on the shoulder, one hand steadying it; the tray still works in front | swung down |
Items fly in and out on a short arc (0.28 s); the game's timing (the 0.3 s hand-over) is unchanged, and none of it uses
game randomness: the pacing simulator stays byte-identical.

**Measured** (the full Riviera train at a stop, Low tier): 10,398 triangles a person (8,108 before this session; the
new hands, rounder limbs and weave details), draw calls 78 (78), 253k triangles drawn (240k).

## 14. Session 64: limbs in one piece

The owner: "the limbs of the players are far too disconnected… why are there so many circular round things in
character that connects these? I need human anatomy naturally to flow without so many interruptions".

A rigid part per bone needed a ball at every joint to hide the gap when it bent: the shoulder, elbow, hip and knee
balls read as beads on a string. They are gone. Each sleeve is now one surface from the shoulder to the cuff, and each
trouser leg (or bare leg) one surface from the hip to its hem, bent by **two-bone linear blend skinning** in the
character pull batch (`world/Skin.ts`):

- every vertex of a limb carries a code and a weight (`aSkin`) as a function of its height along the limb: near the
  elbow or knee it blends toward the child bone (the forearm, the shin) over ±4.5 cm and ±5 cm; at the top it blends a
  little (35% for the arm, 40% for the leg) toward the body, so the shoulder rolls and the hip eases into the trousers;
- the batch turns that into a second matrix and a weight per vertex (`aNxInst2`, `aNxSkin`; `NX_SKIN` on the lit
  character material only) and blends the two matrices in the vertex shader: still one draw per material, no new
  texture reads beyond the second matrix;
- the hand twists at the wrist, a group of its own under the elbow (`wrists`), and the sleeve follows an untwisted
  elbow "bone" (a mesh of one degenerate triangle, `BONE_GEOMETRY`), so turning the palm never wraps the sleeve;
- the profiles are dense (a ring every 1.2 cm, 16 sides) and their radii ease from station to station, so the bend is
  a curve, not a crease; a short sleeve ends in its rolled hem with the bare arm running on to the wrist.

The CPU tools read the same numbers (`skinPoint`, `skinnedWorld`): the cloth's leg containment, the clip test. The clip
test passes with zero clips. Visual only: the pacing simulator is unchanged by it.

Walking speed (session 64, owner: "no running animations until we get the upgrade for movement"): the conductor walks
at every speed until a pair of shoes or a Rail Miles speed level is bought (`CharacterView.runGait`, the stride rate
capped at `WALK_MAX_PACE`).
