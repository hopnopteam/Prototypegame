# Build "EXOFORGE: Scrap to Sky" — a physics-based exo-suit building and flight game

You are building a playable, premium-looking prototype of a portrait mobile game. This document has two parts:

- **Part A — Game spec:** what to build and how it plays.
- **Part B — Art bible:** how it must look. **Visual quality is the top priority of this project.** It ranks above feature count.

Read the whole document before writing any code. Before any visual work, open and look at every image in `art/references/` (use your Read tool on each file); the owner places their style references there. Work through the milestones in order. Verify each one in a real browser at phone size, commit after each, and keep a short log in `PROGRESS.md`.

**The feeling we want, with an original design.** The game delivers a classic power fantasy: you, trapped in a cave with nothing but scrap, build a crude powered suit to escape, and over time it evolves into a sleek, gleaming, high-tech flying suit. The suit's look comes only from Part B §14.2. It must not resemble any existing film, comic or game armor or character, and nothing in the game may reference existing superheroes, companies, names or story lines. When in doubt, push the design further toward Part B §14.2.

**The player is the hero.** There are no named or pre-made protagonists. The person in the suit is the player: never shown, never named by the game, never given a face or a voice. The player chooses a callsign and an accent color at the start, and both appear on the suit.

---

# PART A — GAME SPEC

## A1. The game in one paragraph

A cave-in traps you deep underground with nothing but a pile of scrap. You build a crude flying rig from junk to climb your way out. Each run, you fly the suit up a winding vertical course using real thrust physics: hold to fire the boot thrusters, drag to tilt, manage heat and battery, and avoid crashes. Scrap collected and height reached pay for upgrades that you build onto the suit with your own hands, part by part. Reaching the world's exit **evolves** the suit and opens the next world: mine → junkyard canyon → cliffside test range → harbor city rooftops → hurricane coast → stratosphere → orbit. The fantasy: building a flying suit from nothing, and feeling it get better every run.

**Story is a light frame, not a plot.** This is an incremental upgrade game. The only story is one intro card and a short one-line title card per world (section A8). There is no dialogue, no cutscene sequence and nothing to follow. The worlds themselves tell the journey.

## A2. Non-negotiables

1. **Physics-based skill, never tap-mashing.** Controls are hold, release and drag. Skill means throttle feathering, tilt control, heat management and line choice through a course. No mechanic rewards tapping fast.
2. **Upgrades are physical.** Every upgrade changes a real parameter (thrust, battery capacity, heat dissipation, torque authority, impact tolerance). No abstract multiplier buttons.
3. **No monetization of any kind.** No ads, no ad placeholders, no in-app purchases, no premium currency, no energy, timers or wait times, no "double rewards" offers. Everything is earned by playing.
4. **Organic, fair balance.** Every run earns something; progress never stalls behind a grind wall; skill is rewarded, never required (section A9).
5. **Visuals follow Part B exactly.** Real painted art from the asset pipeline, never shapes drawn by code.
6. **Portrait, mobile-first, one thumb.**

## A3. Tech stack and constraints

- **Vite + TypeScript** (strict mode).
- **PixiJS v8** for rendering (WebGL, 2D layered painted sprites). **pixi-filters** (v8-compatible release) for glow, bloom, color grading and heat shimmer.
- **Rapier 2D** (`@dimforge/rapier2d-compat`) for physics: rigid bodies, joints (for the crash ragdoll), polygon colliders (terrain), sensors, contact force events.
- **HTML/CSS overlay** for UI (crisp text, painted 9-slice frames via CSS `border-image`).
- **Node tools:** `sharp` and `@imgly/background-removal-node` for art processing, `@assetpack/core` (or `free-tex-packer-core`) for atlases, **Playwright** for screenshots and automated play.
- **Viewport:** design for 390×844 logical px; must also look right at 360×780 and 430×932. Lock to portrait; on desktop, center a 9:19.5 frame with letterboxing. Pixi `resolution = min(devicePixelRatio, 3)`, `autoDensity: true`.
- **Fixed-timestep simulation** at 120 Hz with render interpolation. Same inputs + same seed = same result.
- **Separation:** physics, course data, economy and game state are pure TypeScript modules with no Pixi or DOM imports, so they run headless in Node and can later be ported to Unity or wrapped with Capacitor.
- **Performance:** 60 fps on a mid-range Android phone. Fewer than 150 draw calls. Texture atlases at most 2048×2048. Pool spawned objects. Only build terrain meshes for course chunks near the camera.
- **Disable web-page behaviors:** no text selection, no long-press callout, no tap highlight, no pinch zoom, no pull-to-refresh, no focus rings.

## A4. Folder structure

```
src/
  main.ts
  game/        Game.ts (state machine), states/ (FirstLaunch, Workshop, Flight, Crash, Results, TitleCard, Evolve, Gallery, Settings)
  sim/         SuitSim.ts, Heat.ts, Damage.ts, Ragdoll.ts, Course.ts, Bots.ts   (pure logic, Rapier, no rendering)
  econ/        Economy.ts (pure functions), balance.ts (every tunable number)
  content/     worlds.ts, rigs.ts (suits & parts), chunks/ (authored course chunks as JSON), titles.ts (intro and world title lines)
  render/      Stage.ts, CameraRig.ts, Parallax.ts, TerrainView.ts, SuitView.ts, CharacterRig.ts, Effects.ts, Particles.ts
  ui/          workshop/, hud/, results/, gallery/, firstlaunch/, common/
  services/    Save.ts, Audio.ts, Input.ts, Debug.ts
art/
  references/  style references from the owner (read-only)
  incoming/    raw images dropped here by the owner or a generator
  final/       processed assets
  ASSET_MANIFEST.json, PROMPTS.md, PROCESS_REPORT.md
tools/
  sim.ts, chunk-editor/ (a tiny browser tool to draw course chunk polygons), art-process.ts, art-placeholders.ts, shots.ts, compare.ts
qa/
  shots/, sheets/, compare-map.json, VISUAL_REVIEW.md
```

npm scripts: `dev` (with `--host`), `build`, `sim`, `chunks` (opens the chunk editor), `art:placeholders`, `art:process`, `shots`, `compare`.

## A5. Screens and the core loop

State machine: `Workshop → Flight → (Crash) → Results → Workshop`. `FirstLaunch` runs once (intro card, callsign, accent color). `TitleCard` shows a world's one-line title card when the world opens. `Evolve` plays after reaching a world's exit. `Gallery` and `Settings` open from the Workshop.

### A5.0 First launch (once, under 20 s, everything skippable)
1. **Intro card:** one painted full-screen image (a dark cave, a dusty work lamp, a pile of scrap, the faint shape of a suit frame) with one line: *"A cave-in. No way out. Just you and a pile of scrap. Build."*
2. **Callsign:** "What's your callsign?" A text field (max 10 characters, letters and numbers), default "PILOT", with a big CONTINUE. The callsign is stenciled on the suit's chest plate and shown in the Gallery.
3. **Accent color:** pick 1 of 6 accent colors (shown as painted paint cans). The color tints the suit's accent stripes, thruster rims and Workshop pennant. Both can be changed later in Settings.
4. Straight into the Workshop with the bare suit frame and a pulsing BUILD hint on the first part.

### A5.1 Workshop (home screen)
The emotional center of the game (mood: `ref-03.jpg`, warm light, tools, sparks, the joy of building). It is framed as **your** point of view standing at the workbench: the suit on its stand in front of you, your tools and workbench edge in the foreground. You never see yourself, only your gloved hands when you build. It changes per world:
1. Lantern-lit cave nook with a scrap pile
2. A junkyard shed
3. A garage workshop
4. Rooftop lab
5. Lighthouse storm shelter
6. High-altitude balloon hangar
7. Orbital launch hangar

- **Center stage:** the suit on a build stand (chains, clamps, a work lamp), lit like a hero (`ref-04.jpg`'s stage lighting). Idle: lights blink, a fan spins, small steam puffs.
- **Your helper drone** (a small repair drone you built from scrap; no name, no dialogue) hovers near the suit. It gives hints with icon bubbles only (a heat icon, an arrow to the best build, a wrench), beeps, and reacts with its single lens light. It's a tool and a bit of charm, not a character with a story.
- **Ambient life** fills the scene: dust in the lamp light, flickering bulbs, dripping water, sparks from a loose wire; later, an unnamed junkyard dog dozing, gulls, city lights.
- **Top bar:** scrap (big number, bolt icon) on the left; world and chapter name in the center ("Chapter 1 · The Collapsed Mine"); settings on the right.
- **Right edge:** a tall, thin **course bar**: start, best height (flag labelled BEST), checkpoints and landmarks as ticks, the exit at the top.
- **Bottom:** the **build tray**, five part cards (Thrusters, Core, Cooling, Gyro, Armor). Each card: painted part icon, name, level pips (5), the physical stat change (`Thrust 1.10 g → 1.24 g ↑`, in the style of `ref-04.jpg`), cost. Tapping a card expands a detail panel with a big glossy BUILD button. Affordable cards glow; the single best-value build gets a bouncing arrow.
- **FLY! button:** big, green, above the tray; pulses gently.
- **Gallery button** (hangar icon) top-left under the scrap counter.

### A5.2 Flight (the run, 20–60 s)
The suit starts on a launch ledge at the bottom of the course. The course is a vertical, winding passage that fits the portrait screen: shafts, ledges, overhangs, narrow gaps, open caverns, later open sky with structures.

**Controls (one thumb):**
- **Hold anywhere:** boot thrusters fire along the suit's "up" axis. Thrust ramps up over 0.15 s (no instant on/off) and ramps down over 0.1 s on release.
- **While holding, drag horizontally:** sets a target tilt (up to ±40° from upright) proportional to the finger's offset from the touch-down point. Gyro torque rotates the suit toward the target with limited authority, so heavy suits turn slowly.
- **Release:** thrust stops; the suit falls with momentum. Gyro pulls it back toward upright when not holding (strength depends on the Gyro level). From World 3 on, releasing while moving fast deploys **glide flaps**: a gentle lift and slower fall, steered by tilting.
- No other buttons during flight except a small pause button.

**Heat:** thrust adds heat; cooling removes heat continuously, faster while not thrusting and much faster while resting on a ledge.
- Above 80%, the heat gauge flashes and steam vents.
- At 100%, the thrusters **sputter** for 1.5 s (thrust drops to 15% and coughs smoke) while the suit cools to 60%.
- Feathering the throttle and planning rest stops is the core skill.

**Battery (Core):** drains while thrusting. At 0 the thrusters stop for good; the run ends when the suit comes to rest.

**Collisions and armor:**
- Contacts with terrain or hazards are read from Rapier contact force events.
- Below the armor threshold impact speed: a bump with sparks and a scrape sound, no damage.
- Above it: damage = (impact speed − threshold) × k, with a hit flash, a dent decal and a shake.
- Integrity is shown as a row of armor-plate icons, not a bar.

**Resting:** touching down gently on a flat ledge (slope under 25°, speed under the landing threshold) shows a "REST" puff. Heat cools 3× faster, and **your helper drone patches one armor plate** if any were lost (once per ledge per run). This rewards controlled, careful flight.

**Pickups (sensors):**
- **Scrap pieces:** bolts, gears, springs, circuit boards. Each type is worth more and sits in a harder spot; the best are in side pockets that need precise flying.
- **Battery cells:** +15% battery.
- **Coolant canisters:** −30% heat.

**Hazards, by world:**
1. Falling rocks triggered by noise, stalactites, bats (bump), dripping water (cools you), unstable ledges that crumble
2. Dust devils (rotating wind), tumbleweeds, swinging junk on cranes, a magnet crane that pulls the suit
3. Cliff updrafts and downdrafts, gulls, wind turbines (avoid the blades)
4. Steam vents, swinging signs, laundry lines, window cleaners' platforms, pigeons
5. Rain gusts, lightning, flying debris, crashing waves at the bottom
6. Thin air (less glide lift, thrusters slightly weaker), jet streams, ice build-up (adds mass)
7. Near-zero gravity, drifting space debris, solar panels, tumbling satellites

**Checkpoint lamps:** passing a lamp lights it; it's a landmark and a progress tick. Every run still starts from the bottom, so progress comes from upgrades and skill.

**HUD:** height (large, rolling digits) at top center; the course bar on the right; heat gauge and battery gauge as two chunky painted dials at the lower left; armor plates in a row at the top left; the callsign in small stencil letters under the plates. The suit's state shows through its body: steam at high heat, sparks and dents on hits, a confident thruster roar on a new best.

**Best line:** a dashed line at the best height in this world. Crossing it triggers "NEW BEST!" with a flash and a chime, without pausing.

### A5.3 Crash
When integrity reaches 0 or the battery dies and the suit comes to rest:
- **Integrity 0:** the suit switches to a **ragdoll**. Body pieces (torso, upper and lower arms, legs) become separate Rapier bodies joined with revolute joints with angle limits; 2–3 armor plates break off as loose bodies.
- The suit tumbles down the shaft for at most 2 s (the camera follows, slightly slowed), comic and never violent.
- Then your helper drone zips in with a tow cable, hooks the suit and drags it off-screen with a determined little beep, and the screen transitions to Results.

### A5.4 Results
- Height reached, "NEW BEST!" with confetti if applicable.
- Scrap breakdown, each line counting up: height scrap, pickups, **Clean Flight bonus** (+% for armor plates remaining), **Rest bonus** (for each ledge rested on).
- One **CONTINUE** button. No other buttons, no offers.
- Back on the Workshop, the best affordable build's card bounces once.

## A6. Physics model (`sim/SuitSim.ts`, `sim/Heat.ts`, `sim/Damage.ts`)

Simulate in a vertical 2D plane at 120 Hz with Rapier.

**During normal flight the suit is one dynamic rigid body:** a capsule torso plus two box legs as a compound collider. Mass, CoM (low, near the hips) and inertia are recomputed from the installed parts.

Forces each step:
- **Gravity:** `g × worldGravityScale` (World 7 ≈ 0.08).
- **Thrust:** `throttle(t) × maxThrust` applied at the boots along the body's up axis. Express `maxThrust` in "g" so it's readable (a 1.1 g suit barely climbs; a 2.5 g suit rockets up).
- **Gyro torque:** a PD controller toward the target tilt, clamped to `maxGyroTorque`. When not holding, the target is upright, at reduced strength.
- **Air drag:** linear plus quadratic, with world air density (World 6 thin, World 7 none).
- **Glide (World 3+):** when not holding and speed is above a threshold, lift is perpendicular to velocity, proportional to flap area and `|v|²`, so tilting steers the glide.
- **Wind fields:** dust devils, updrafts, jet streams are force fields sampled per step (smooth vector noise or authored zones).

Heat: `heat += thrustHeat × throttle × dt − (cooling + restCoolingBonus) × dt`, clamped to [0, 1], with the sputter state machine.

Battery: `battery −= drain × throttle × dt`.

Damage: from contact force events, using the impact speed along the contact normal, as in A5.2.

**Feel targets (tune until true):**
- The World 1 Scrap Rig feels heavy, wobbly and barely able to climb. It overheats in about 2.5 s of continuous thrust. Hops between ledges are the natural rhythm.
- By World 4 the suit feels agile and powerful; by World 7 it feels like effortless mastery, with the new challenge of momentum in near-zero gravity.
- Releasing and re-holding to adjust height should feel like feathering a throttle: smooth, responsive, never twitchy.
- A full tilt with a mid-level gyro takes about 0.35 s to reach and overshoots slightly before settling.

## A7. Courses (`sim/Course.ts`, `content/chunks/`)

- Each world's course is a fixed sequence of **authored chunks** (each about one screen tall). The layout is the same every run so players learn it.
- Each chunk is JSON: terrain polygons (static colliders), ledges, pickup positions, hazard spawns, wind zones, a **guide path** (polyline used by bots and by the debug overlay), and decoration anchor points.
- Build `tools/chunk-editor`: a minimal browser tool to draw and edit polygons and markers over a grid and save the JSON. It doesn't need to be pretty.

Course lengths, starting values (tune with the simulator):

| World | Height | Chunks |
|---|---|---|
| 1 | 300 m | 14 |
| 2 | 520 m | 20 |
| 3 | 800 m | 26 |
| 4 | 1.1 km | 30 |
| 5 | 1.4 km | 34 |
| 6 | 1.8 km | 38 |
| 7 | 2.4 km | 40 |

Difficulty within a world:
- Wide, forgiving passages early on.
- Tighter gaps, longer climbs without ledges and more hazards higher up.
- One signature setpiece per world (a collapsing shaft, a crane gauntlet, a turbine canyon, a skyscraper atrium, a lightning tower, a jet-stream river, a debris field).

The **exit** is a big painted moment: daylight pouring into the mine shaft (World 1), the canyon rim at sunset, a skyscraper antenna, a research balloon, the station's docking port.

## A8. Suits, parts and world titles

Five part slots, **5 levels per world** each:
- **Level 1** makes the slot's part appear on the suit (painted tier-A part).
- **Levels 2–4** improve the stat. Each shows a small visual change (welds, bolts, paint, rivets, tape).
- **Level 5** swaps to the painted tier-B version with a bigger stat jump.

| Slot | Physical effect | Trade-off |
|---|---|---|
| Thrusters | max thrust (g) | more heat per second |
| Core | battery capacity | adds mass |
| Cooling | heat dissipation, sputter recovery time | small mass |
| Gyro | tilt torque, auto-upright strength, glide control | none |
| Armor | impact threshold, plates (integrity) | adds mass |

**Build moment** (every purchase):
1. **First person:** your gloved hands reach in from the bottom of the screen with a tool and work on the suit: welding (sparks, a blue-white arc glow), hammering (impact rings) or bolting (wrench spin), 0.6–0.9 s. The gloves evolve with the tiers (Part B §14.1).
2. On level 1 and level 5, the painted part flies in and snaps on with a 0 → 1.2 → 1.0 elastic scale, sparks and a heavy clunk; the camera pushes in for 300 ms.
3. A banner states the change plainly: "Bike-Wheel Gyro: steadier tilting!"
4. The helper drone does a happy little loop.

| # | World / Workshop | Suit | Thrusters (A → B) | Core (A → B) | Cooling (A → B) | Gyro (A → B) | Armor (A → B) |
|---|---|---|---|---|---|---|---|
| 1 | The Collapsed Mine / cave nook | Scrap Rig | twin propane-tank boot burners → welded triple burners | car battery strapped to the back → stacked mining-lamp batteries | tin-can heat fins → salvaged radiator fan | bicycle-wheel gyroscope → mine-cart flywheel | hammered sheet-metal chest plate → mine-cart plating |
| 2 | Junkyard Canyon / junkyard shed | Junk Rig | motorbike exhaust jets → nitro canisters | tractor battery → generator pack | car radiator → twin radiators | steering-wheel stabilizers → wrist fans | car-door plates → hubcap shoulder plates |
| 3 | Cliffside Test Range / garage workshop | Prototype | ducted-fan boots → turbo-fan boots | custom battery pack → amber forge core on the back | copper coil cooler → liquid-cooling lines | wrist stabilizer jets → gyro rings + calf glide flaps | painted panels → riveted teal-and-copper armor |
| 4 | Harbor City Rooftops / rooftop lab | City Suit | jet boots → afterburner boots | forge core II → forge core III | vent louvers → active vents | back flaps → full flight surfaces | composite shell → reinforced shell |
| 5 | Hurricane Coast / lighthouse shelter | Storm Suit | storm thrusters → hurricane thrusters | sealed core → double-sealed core | sea-water intakes → twin intakes | heavy gyro → storm stabilizers | waterproof plating → lightning-grounded plating |
| 6 | The Stratosphere / balloon hangar | Sky Suit | high-altitude jets → ramjet boots | high-capacity core → cryo core | radiator wings → long radiator wings | long glide wings → morphing wings | pressurized shell → thermal shell |
| 7 | Orbit / launch hangar | Star Suit | RCS thruster pods → plasma pods | fusion cell → twin fusion cells | radiator panels → deployable radiators | reaction wheels → magnetic stabilizers | micrometeor plating → full star armor |

**World title cards (the whole story):** one painted card per world with a title and one line, shown when the world opens. No dialogue, no characters.

| World | Title | Line |
|---|---|---|
| 1 | The Collapsed Mine | "Climb out." |
| 2 | Junkyard Canyon | "Better junk. Bigger sky." |
| 3 | Cliffside Test Range | "Time to really fly." |
| 4 | Harbor City | "The whole city is watching." |
| 5 | Hurricane Coast | "Fly into the storm." |
| 6 | The Stratosphere | "Above the clouds." |
| 7 | Orbit | "Leave the sky behind." |
| Finale | — | "From scrap to stars." (after World 7, then free play continues) |

**Evolve (world exit reached):**
1. Exit moment: freeze frame, "CHAPTER COMPLETE!" fanfare.
2. Results, then the next world's **title card** (2 s, tap to skip).
3. **Evolve cinematic** (about 4 s, skippable after 1 s): on the build stand, the old suit glows and disassembles into flying parts that swirl and reassemble into the new suit's base form, with sparks and a light pillar.
4. The player picks **one of three Forge Perks** (permanent, small, from a pool of 10 in `balance.ts`): for example "+5% thrust on all suits", "+10% scrap from pickups", "sputter recovery 25% faster", "+1 armor plate", "rest cooling ×1.5".
5. Part levels reset for the new suit; scrap carries over. The old suit goes to the Gallery.

**Gallery:** the hangar shows every suit at every part stage collected, with best heights and your callsign. Each world hides **3 Blueprint Scraps** in very hard spots; collecting all 3 unlocks a cosmetic paint scheme for that suit.

## A9. Economy and balance (no monetization)

All numbers live in `src/econ/balance.ts`; formulas live in `src/econ/Economy.ts` as pure functions.

**Earnings per run:**
`scrap = round((displayHeight × heightRate(world) + pickupScrap) × (1 + cleanFlightBonus + restBonus) × perkMultipliers)`, with a floor of `minRunScrap(world)`.

**Costs:** `cost(slot, level, world) = slotBase[slot] × levelGrowth^(level-1) × worldScale^(world-1)`. Starting values: `slotBase` 20–40, `levelGrowth` 1.55, `worldScale` 3.0. The simulator tunes them.

**Fairness rules:**
- An average player reaches the exit with about 70% of part levels bought; an expert with about 50%.
- No more than 2 runs in a row end with nothing affordable (average bot).
- Clean, rested flights earn roughly 1.5–2× a sloppy run, never 5×.
- Hazards and tight sections are soft walls: weak suits get bounced, overheat or need more rests, but every section is physically passable at the upgrade level the curve expects.

**Balance simulator (`npm run sim`):** runs the real Rapier simulation headless on the real course data, with three bots:
- **Novice:** late reactions, overheats often, rarely rests.
- **Average.**
- **Expert:** feathers heat, uses rests, takes pickup pockets.

Bots follow the chunk guide paths with a lookahead point, a PD controller for tilt, and a throttle policy that keeps heat under a skill-dependent ceiling, plus skill-dependent reaction delay and noise. After each run they buy the build with the best "expected height gain per scrap", computed by simulating a few test runs.

Print per world and per bot: runs, minutes (assume 40 s per run including menus), runs to first part, longest streak with nothing affordable, % of part levels bought at exit, height-per-run curve, and the chunks where bots most often crash (difficulty spikes to smooth out).

**Pacing targets:**
- **World 1:** 12–16 minutes for the average bot. First build affordable after run 1; first part on the suit by run 2.
- **World 2:** 16–20 min. **World 3:** 20–26 min. Each later world about 15% longer than the one before.
- **Novice** finishes World 1 in under 25 minutes. **Expert** is 30–40% faster than average.
- No single chunk causes more than 35% of average-bot run endings in a world.

Paste the simulator output into `PROGRESS.md` when tuning is done.

## A10. Audio

Procedural Web Audio placeholders behind a `SoundBank` interface with named events: thruster roar layered with throttle, sputter cough, overheat steam hiss, metal impacts by speed, scrapes, rest puff, scrap pickup chimes rising in pitch on streaks, welding crackle, hammer clank, helper-drone beeps, wind, fanfare. Real sound files can be dropped in later. Master, SFX and music volume in Settings.

## A11. Save, settings, debug

- **Save:** versioned JSON in `localStorage`, autosaved after every build, run and chapter change; all storage calls wrapped in try/catch.
- **Settings:** volumes, vibration on/off, control sensitivity (tilt range), reset progress (with confirm).
- **Debug panel** (press D, or triple-tap the top-left corner): add scrap, jump to any world or chunk, set part levels, show physics vectors (thrust, velocity, CoM, contact normals), show guide paths and chunk bounds, slow motion, invulnerability, infinite battery and no heat, toggle placeholder vs final art.
- **Local telemetry only:** counters in the save for balancing. Nothing is sent anywhere.

## A12. Milestones (commit and verify after each)

1. **Flight feel in greybox.** Project setup, portrait shell, fixed-timestep loop, Rapier suit, hold/drag controls, heat, battery, damage, rest, ragdoll crash, three World 1 chunks built with the chunk editor, results. Debug overlay. Placeholders from the manifest. **Stop and ask the owner to play it on their phone before continuing.** Flight feel is everything; iterate on it with the owner.
2. **Art foundation and style frame.** Write `art/ASSET_MANIFEST.json` and `art/PROMPTS.md` for everything in Worlds 1–2 plus UI, the intro card and title cards, following Part B. Build `art:placeholders` and `art:process`. Then **stop and ask the owner to produce the style frame assets** (Part B §14.5) and drop them in `art/incoming/`. When they arrive, process them, build the Workshop screen with real art, and run the full Visual QA (Part B §13). Ask the owner to approve the look before producing anything else.
3. **Building and economy.** All five slots, economy functions, save, build moment, build tray and detail panel in the `ref-04.jpg` UI language.
4. **World 1 complete.** All 14 chunks, hazards, pickups, checkpoint lamps, best line, painted terrain (texture fill + edge strips + decorations), the mine-exit moment, the first-launch flow (intro card, callsign, accent color), title cards.
5. **Evolution and World 2.** Evolve cinematic, Forge Perks, Gallery, Blueprint Scraps, World 2 complete with the junkyard workshop and its hazards.
6. **Balance and juice.** `tools/sim.ts` with three bots; tune `balance.ts` and the chunks to every target; paste the output. Full juice pass (Part B §11) and audio.
7. **Content.** Worlds 3–7 with their twists (glide, wind fields, lightning, thin air, near-zero gravity). Performance pass. Final Visual QA on every screen.

**Verification after every milestone:**
- Run `npm run build` (must exit 0).
- Run a Playwright script that plays the new feature with scripted touch input at 390×844 (hold, release, drag) and checks for console errors.
- Run `npm run shots` and `npm run compare`, then do the Visual QA of Part B §13 whenever visuals changed.
- Then summarize what was built, show the key screenshots, list open visual issues and anything you're unsure about.

## A13. Definition of done

- A new player is flying within 5 seconds of opening the game, without a text tutorial. Only an animated hand shows "hold" and "drag" on the first run, and the helper drone shows a heat icon bubble the first time heat passes 80%.
- The first run is fun on its own: the heavy scrappy hop, the overheat cough, the comic ragdoll and the drone's tow.
- Every run pays. Every build changes how the suit flies, and the player can feel the difference.
- All pacing targets in A9 hold in the simulator.
- Every screen passes Visual QA with all criteria ≥ 4, plus the independent reviewer pass and owner approval.
- 60 fps in Chrome mobile emulation with 4× CPU throttling; no console errors.

## A14. Out of scope

Monetization of any kind, accounts, online features, leaderboards, cloud saves, localization, store builds, voice acting.

---

# PART B — ART BIBLE

Visual quality is the most important requirement of this project. It ranks above feature count. A smaller game that looks premium is the goal; a big game that looks like programmer art is a failure. Every visual decision is checked against this document and against the images in `art/references/`.

**Open and look at every image in `art/references/` before starting any visual work** (use your Read tool on each file). Re-open them at the start of every visual milestone.

---

## 1. The target look in one paragraph

Premium casual mobile game art in the "painted 3D" style used by top casual studios: assets look like soft, high-quality 3D renders with a hand-painted finish. Chunky, rounded, appealing shapes. Warm, soft lighting with gentle rim light. Saturated but harmonious color. Expressive characters with big readable faces. Cozy, lived-in environments. UI made of chunky framed panels, glossy bevelled buttons and bold outlined numbers. Everything feels tactile, warm and expensive. Nothing looks flat, vector, low-poly, pixel-art, photoreal or "default".

## 2. What to take from each reference

These images are **style references only**. Never reproduce their characters, costumes, logos, text or compositions. Our characters, objects and UI are original; they just share the same visual language.

| File | Take this | Don't take this |
|---|---|---|
| `ref-01.jpg` (two characters with a pig) | Character rendering: soft painted 3D skin, big expressive eyes and brows, large appealing noses, relaxed confident poses, soft shadows, clean silhouette on a plain background | The characters themselves, their outfits |
| `ref-02.jpg` (three villager portraits) | Costume materials (cloth folds, rope, leather, worn fabric), muted earthy palette against dark backdrops, character portrait framing, chunky title lettering with dark outline | The characters, the title, the logo |
| `ref-03.jpg` (craftsman at a workbench) | **The mood for every workshop / home screen:** warm golden window light, soft-focus background, pegboard of tools, wood shavings and small props, the satisfaction of making something by hand | The character |
| `ref-04.jpg` (hero upgrade screen) | **The UI language:** framed panel with gold trim, stat rows with icon + old value → new value + green up-arrow, blue progress bar with percentage, big glossy yellow upgrade button with cost icons, round portrait carousel at the bottom, hero standing on a lit stage | The hero, the text |
| `ref-05.jpg` (squad battle) | **In-game readability:** clear separation of foreground characters from a painterly but quieter background, team-colored rings and bars, cards with star ratings, a gameplay hint arrow | The soldiers, the setting |

If something is not covered by a reference, extrapolate in the same spirit: "what would this studio's artists have painted?"

## 3. The ten rules

1. **Real painted art, never code-drawn art.** Every visible character, vehicle, part, prop, background, UI frame and icon is a painted bitmap asset from the asset pipeline (section 12). Code never draws final visuals out of primitives, gradients or vector shapes. Code is for placement, animation, lighting effects, particles and UI layout.
2. **One light.** Key light comes from the **upper left**, warm (soft gold). Fill is cool (soft blue-violet). A thin rim light on the right edge. Every asset in the game uses this setup, without exception. Mixed light directions are the #1 reason assets look "pasted together".
3. **Shadows are colored, never grey or black.** Shadows shift toward blue/violet/warm brown, never toward neutral grey.
4. **Chunky and rounded.** Thick forms, bevelled and rounded edges, slightly oversized parts, no thin fiddly details that disappear at phone size.
5. **Silhouette first.** Every gameplay object must be identifiable from its silhouette alone at 25% size.
6. **Foreground pops, background recedes.** Backgrounds have lower contrast, lower saturation and softer detail, shifted toward the sky color (atmospheric perspective). Interactive things have the highest contrast and the rim light.
7. **Everything has a material.** Wood shows grain, metal shows soft speculars and worn edges, plastic is glossy, cloth folds, rope is twisted. No untextured flat-filled shapes.
8. **Tiers tell a story.** Early tiers are scrappy (tape, rust, mismatched colors, dents). Later tiers are polished (clean paint, trim, glow). The player should be able to rank two parts by quality without reading anything.
9. **Juice is part of the art.** Every interaction has motion: squash and stretch, overshoot, particles, a sound. A static screen is an unfinished screen.
10. **Less but better.** If the screen is busy, remove things. One focal point per screen.

## 4. Rendering approach (technical)

- The game is **2.5D**: physics in 2D, presentation as layered painted sprites (PixiJS v8, WebGL). This is the approach that can actually match the references. Do not use procedural 3D meshes or primitives for anything the player sees.
- Depth comes from: parallax layers (4–6 per environment), atmospheric perspective baked into the far layers, soft contact shadows under objects, blur on the farthest layer (pre-baked into the art, not a runtime blur), a subtle vignette.
- Runtime lighting effects are **additions** on top of the painted art, never a replacement for it: additive glow sprites for engines/energy, a bloom pass limited to the brightest emissive elements (pixi-filters `AdvancedBloomFilter`, threshold high), a light color-grade per world (`ColorMatrixFilter`, subtle), heat shimmer behind flames (`DisplacementFilter`, subtle).
- Keep filters cheap: apply bloom to one dedicated FX layer only, never to the whole stage.

## 5. Shape language and proportions

- **Characters:** heads about 1/4 of body height (stylized, not chibi). Big eyes with clear whites and strong eyebrows; a large, soft nose; expressive mouth. Hands slightly oversized. Poses with clear weight shift and attitude (like the hand-on-hip and leaning poses in the references).
- **Vehicles, suits, parts:** pill shapes, bevelled boxes, rounded cylinders. Bolts and rivets are big and few. Proportions slightly squat and cute, not realistic.
- **Props and environments:** rounded rocks, puffy foliage clumps, thick planks, chunky machinery. Straight lines are slightly hand-wobbly.

## 6. Color and light

- Saturation: medium-high on interactive objects, medium on midground, low on far background.
- Value structure: the focal object is the highest-contrast thing on screen. Check this by viewing a screenshot in greyscale; the focal object must still stand out.
- Each world has a 5-color palette defined in that game's SPEC (sky top, sky bottom, environment main, environment accent, highlight). Generate all world assets with those colors named in the prompt.
- Warm/cool: lit sides warm, shadow sides cool. Emissive elements (flames, energy, screens) are the only pure bright colors.

## 7. Materials and tier progression

| Tier | Materials | Surface | Color |
|---|---|---|---|
| Scrap (early) | cardboard, tape, rope, rusty tin, old wood, plastic bottles | dents, scratches, stains, uneven edges | mismatched, faded, dirty |
| Built (mid) | painted metal, rivets, rubber, canvas, brass | clean but worn edges, decals | coordinated 2–3 colors |
| Pro (late) | polished alloys, composite panels, glass, glowing elements | crisp bevels, trim lines, emissive accents | signature palette, gold or energy accents |

## 8. Characters and animation

- Characters are **cutout rigs**: separate painted pieces (head, torso, upper/lower arms, hands, legs, plus face pieces: eyes, brows, mouths as swappable sprites) assembled with pivots and animated by code (springs, tweens, procedural idles). No frame-by-frame animation needed.
- Every character has an **expression set**: neutral, happy, determined, straining, surprised, worried, dizzy, proud. Expressions swap with a quick 80 ms squash so they read as alive.
- Idle animation is mandatory on every screen where a character appears: breathing (1–2% vertical scale), blinking every 2–5 s at random, small weight shifts, an occasional personality action (scratch head, wipe brow, tap tool).
- When a single-image character is all that exists (before cutout pieces are available), animate it with breathing, squash/stretch and tilt only. Never leave it static.

## 9. Environments

- 4–6 parallax layers per environment: far sky, far scenery, mid scenery, near scenery, gameplay layer, foreground framing elements (darker, slightly blurred, at the screen edges).
- Vertically scrolling worlds use **seamlessly tiling** vertical strips per layer plus unique "landmark" sprites placed at set heights.
- Terrain and walls that the player collides with are drawn as: a polygon filled with a tiling painted texture, plus a painted edge strip following the polygon outline (textured strip mesh), plus decoration sprites placed along it (crystals, plants, lamps, beams). The collision shape and the painted edge must match within 4 px.
- Ambient life on every screen: drifting dust motes, swaying plants, flickering lamps, birds, clouds sliding slowly.

## 10. UI language

Modelled on `ref-04.jpg`.

- **Panels:** painted 9-slice frames (wood or metal body with a gold or brass trim, rounded corners, soft inner shadow, a subtle top highlight). A darker header strip for titles. Applied in HTML with CSS `border-image`, or in Pixi with `NineSliceSprite`. Never plain CSS boxes with borders.
- **Buttons:** painted 9-slice, glossy, with a lighter top half and a highlight band, a thick darker bottom edge (bevel) and a soft drop shadow. Colors: primary action yellow/gold, positive green, secondary blue, disabled desaturated grey-blue. States: idle (gentle 2% scale pulse when it's the suggested action), pressed (moves down 4 px, bottom edge shrinks, darker), disabled.
- **Typography:** display font "Lilita One" (Google Fonts) for titles, numbers and buttons; "Nunito" ExtraBold for small text. Display text is cream or white with a thick dark outline (dark brown on warm panels, navy on cool panels) and a 2–3 px drop shadow. Implement outlines with layered text-shadow or `paint-order: stroke fill` with `-webkit-text-stroke`, and verify they look clean at 1×, 2× and 3× device pixel ratio.
- **Numbers are heroes:** currency and key stats are large. Stat changes use the `old → new ↑` pattern in green, as in `ref-04.jpg`.
- **Icons:** painted, chunky, with the same light setup, each on a small circular or rounded-square badge.
- **Layout:** 8 px grid; 16 px outer margins; respect `env(safe-area-inset-*)`; minimum touch target 56 px for primary buttons and 44 px for everything else; maximum 2 type sizes per panel.
- **Progress bars:** a recessed dark track, a glossy colored fill with a highlight stripe, a value label centered with an outline.
- **Portrait carousel:** round portraits with a thick colored ring for the selected one, slightly larger and raised, as in `ref-04.jpg`.

## 11. VFX and motion

- **Painted VFX sprites:** smoke puffs, dust clouds, sparks, flame layers, coin glints, star bursts, splinters. Generate them as assets like everything else; tint and scale them in code.
- **Flames:** 3 layered sprites (outer orange, mid yellow, white-hot core) flickering independently, plus an additive glow, plus heat shimmer.
- **Impacts:** 2-frame "impact flash" (white silhouette of the object for 40 ms), a dust ring, debris, a short screen shake.
- **Reward moments:** coins fly from the source to the counter on a curved path, the counter bounces on arrival, the digits roll up.

Timing reference:

| Motion | Duration | Easing |
|---|---|---|
| Button press | 80 ms down, 140 ms up | ease-out, overshoot on release |
| Panel open | 220 ms | back-out (slight overshoot) |
| Part snapping on | 350 ms | 0 → 1.2 → 1.0 scale, elastic |
| Number count-up | 400–900 ms | ease-out |
| Screen shake | 150–400 ms | decaying "trauma" model (shake = trauma²) |
| Camera follow | continuous | critically damped spring, never linear lerp jitter |

## 12. Asset pipeline

The art is produced outside the code: by an image generator, an artist, or both. The code project owns the **specification, processing, integration and quality control** of the art.

### 12.1 The manifest
`art/ASSET_MANIFEST.json` lists every asset the game uses. One entry per asset:

```json
{
  "id": "rocket.w1.base",
  "file": "art/final/rocket/w1_base.png",
  "category": "vehicle | part | character_piece | face | background_layer | prop | terrain_texture | edge_strip | ui_frame | ui_button | icon | vfx | title_card",
  "targetSizePx": [360, 900],
  "pivot": [0.5, 0.95],
  "attachPoints": { "fins": [0.5, 0.82], "nose": [0.5, 0.05] },
  "tiles": "none | horizontal | vertical",
  "nineSlice": null,
  "status": "placeholder | generated | approved",
  "prompt": "the full image-generation prompt (section 12.3)",
  "notes": "anything an artist needs to know"
}
```

`art/PROMPTS.md` is the human-friendly to-do list generated from the manifest, for the owner to work through with their image tool. Group it in batches (style frame first). For each image give: the **exact file name to save into `art/incoming/`** (the asset id + `.png`, e.g. `rocket.w1.base.png`), what it is in one plain sentence, the full prompt in a copyable code block, and a checklist of what a good result must show. Keep it in sync with the manifest whenever assets are added.

### 12.2 Specs for every asset
- Design resolution is 390×844 logical pixels; **assets are produced at 3×** (so a 120 px wide on-screen object is 360 px in the file). Generate at the largest size the tool allows, then downscale. Never upscale more than 1.2×.
- PNG with transparency for everything except opaque background layers. Trimmed to content with a 4 px transparent margin.
- **Camera:** gameplay objects are drawn in pure side view (0° tilt) unless the asset entry says otherwise. Characters on menu screens are in 3/4 view.
- **Scale consistency:** every vehicle and character prompt states its size relative to a reference object (for example "a 2-litre bottle, same scale as the previous image").
- **Parts that attach** (fins, boots, plates…) are produced twice: inside the full assembled image of that stage (so the assembled look is always right) and as an isolated piece (for the fly-in "snap on" animation).

### 12.3 Prompt template
Every prompt is assembled from three parts, so all assets share one style:

1. **Style preamble (identical for every asset):**
   "Stylized 3D-rendered casual mobile game asset, premium painted 3D look, soft hand-painted textures, chunky rounded shapes with bevelled edges, warm soft key light from the upper left, cool fill light, thin rim light on the right edge, soft ambient occlusion, colored shadows, saturated harmonious colors, clean readable silhouette, appealing and tactile, high detail but uncluttered."
2. **Subject:** what it is, its materials, its tier, its colors (from the world palette), its view angle, its scale reference.
3. **Output constraints:** "Single object, centered, fully visible, isolated on a plain flat white background, no ground shadow, no text, no watermark, no border, no other objects." (Use a plain dark grey background instead of white for objects that are mostly white.)

**Negative / avoid list (add if the tool supports it):** "flat vector, cel shading, black outlines, pixel art, low poly, photorealistic, gritty, horror, text, logo, watermark, frame, multiple objects, cropped."

### 12.4 Consistency method
1. First produce a **style frame**: one hero asset (the main vehicle or character) and one full mock screen. Iterate until the human owner approves it.
2. From then on, use **our own approved assets** (never the reference images) as the style/image reference input for every new generation, if the tool supports image or style references.
3. Generate a family of assets in one session with the same settings and seed strategy.
4. Characters: produce one approved **character sheet** (front, 3/4, side, plus an expression row) before producing any cutout pieces.

### 12.5 Processing (`npm run art:process`)
Takes images dropped into `art/incoming/` and produces `art/final/`:
1. Background removal for images that came with a background (use `@imgly/background-removal-node`, or `rembg` if Python is available). Skip if the image already has alpha.
2. Trim, pad 4 px, resize to `targetSizePx` with a high-quality filter (`sharp`, lanczos3).
3. **Alpha bleed:** extend edge colors into fully transparent pixels to prevent white/dark halos when the sprite is scaled or filtered.
4. Validate: correct size, has transparency where required, no near-white or near-black fringe pixels on the alpha edge, vertical tiles tile seamlessly (compare top and bottom rows), file under size budget.
5. Write a report `art/PROCESS_REPORT.md` with pass/fail per asset.
6. Pack atlases for the build (`@assetpack/core` or `free-tex-packer-core`), max 2048×2048 per atlas, WebP output with PNG fallback.

### 12.6 Placeholder policy
Until real art exists, generate placeholders automatically from the manifest: clean flat silhouettes in the correct size, pivot and world palette color, with the asset id written on them. They make layout and gameplay testable. They are **never** judged for style and never shipped. The visual QA (section 13) only scores screens whose assets are `generated` or `approved`.

## 13. Visual QA — mandatory after every milestone that changes visuals

### 13.1 Capture
`npm run shots` (Playwright, Chromium, viewport 390×844, `deviceScaleFactor: 3`, touch enabled) captures:
- every screen in every important state (empty, affordable upgrade, part unlock, results with new best, etc.);
- the key gameplay moments (launch, mid-flight, collision, best-line crossing, landing/exit, evolve);
- **motion strips** for every animation that matters: 8 frames across the animation, composed into one horizontal strip image, so motion can be reviewed.

### 13.2 Compare
`npm run compare` composes, for each screenshot, a review sheet: our screenshot on the left, the 1–2 most relevant reference images on the right (mapping defined in `qa/compare-map.json`), plus a greyscale version of our screenshot (to check value structure).

### 13.3 Review
Open every review sheet (Read tool) and score it in `qa/VISUAL_REVIEW.md`, 1–5 per criterion:

1. **Style match:** looks like it belongs next to the references.
2. **Consistency:** every asset on screen shares the same rendering, light direction and detail level.
3. **Readability:** at phone size and arm's length, the focal object, numbers and buttons read instantly; greyscale still shows the focal object first.
4. **Hierarchy:** one clear focal point; the suggested next action is obvious.
5. **Color:** palette is harmonious; foreground pops; background recedes; shadows are colored.
6. **UI craft:** 8 px grid alignment, consistent spacing, no overlaps or clipping, safe areas respected, text outlines clean.
7. **Polish:** no halos, seams, visible tile edges, stretched or blurry textures, aliasing, z-order mistakes, popping.
8. **Charm and life:** characters have personality; the screen has idle motion; interactions have juice.

**Pass bar:** every criterion ≥ 4 on every screen. Anything below 4 becomes a numbered fix item with a concrete action ("halo on fin edges: re-run alpha bleed; fins too saturated vs body: reduce saturation 15%"). Fix, re-capture, re-score. Repeat until the bar is met.

### 13.4 Independent review
After your own review passes, run a **fresh-context subagent** as reviewer. Give it only `ART_BIBLE.md`, the references and the review sheets (not your reasoning) and ask it to score with the same rubric and list only issues that would make a player or art director notice. Fix what it finds that is real.

### 13.5 Human gate
At the end of every visual milestone, stop and ask the owner to look at the game on a real phone. Their feedback overrides any score.

### 13.6 Failure modes to actively hunt for
- assets from different "styles" side by side (most common problem);
- inconsistent light direction between assets;
- white or dark fringes around sprites;
- blurry art from upscaling or from rendering at the wrong device pixel ratio (set Pixi `resolution` to `devicePixelRatio`, capped at 3, and `autoDensity: true`);
- visible seams in tiling backgrounds;
- default system fonts, thin text, text without outline over busy art;
- UI that looks like a web page (flat rectangles, default buttons, browser focus rings, text selection on long-press, tap highlight color);
- static screens with no idle motion;
- elements under the notch or home indicator;
- too many things competing for attention.

## 14. Game-specific art direction: EXOFORGE

### 14.1 The player and the helper drone (no named characters)
- **The player is never shown.** No face, no body, no name except the callsign they choose. In the Workshop the player exists only as **gloved hands** entering from the bottom of the screen during build moments, holding tools (welder, hammer, wrench, screwdriver).
- **Gloves evolve with the tiers:** World 1–2 cracked leather work gloves with tape on the fingers; World 3–4 padded mechanic gloves with copper knuckle plates; World 5–7 armored tech gloves with the player's accent color and a soft amber glow at the wrist. The player feels their own progress in their hands.
- **Helper drone** (no name): a small round hovering repair drone the size of a melon, built from scrap. A dented copper shell, a single round lens that shows its mood through light shape and color (happy arc, worried flicker, alert blink), a tiny propeller held on with tape in World 1, two little grabber arms. It speaks only in beeps and icon bubbles. It gets slightly better each world (new paint, better propeller), always in the player's accent color.
- **Ambient creatures** are unnamed scenery: bats in the mine, a junkyard dog asleep in a tire, gulls on the cliffs, pigeons on rooftops.

### 14.2 Suit design language (original)
- **Helmet:** a rounded, closed helmet with one wide wraparound visor (pilot style), tinted warm amber, with a soft reflection of the environment. No face is ever visible, so the player imagines themselves inside.
- **The feeling:** the suit is the hero. Early rigs are lovable, scrappy and barely holding together; by the last worlds the suit is sleek, gleaming, powerful high-tech armor with heroic proportions. The player should feel like a genius inventor who built a flying suit with their own hands.
- **Silhouette:** broad rounded shoulders, a compact torso, big boots (the thrusters live there), strong gauntlets. Early tiers are chunky and lumpy; late tiers are streamlined and athletic, but still bulky and friendly enough to fit the painted casual style. Never menacing.
- **Power core:** mounted on the **back** as a backpack unit with an **amber "forge" glow** that leaks through vents and seams. This amber glow is the game's signature light. Thruster flames are warm orange in early tiers, shifting to amber-white and then blue-white at the end.
- **Signature palette (from World 3 on):** deep teal panels, copper and brass trim, cream accents, amber glow, plus the **player's accent color** on stripes, thruster rims and the callsign stencil (painted as a separate greyscale accent-mask layer per part, tinted in code). Before World 3, the rigs are mismatched scrap (rusty tin, faded paint, tape, rope, mismatched bolts) with only hints of the palette (a teal-painted gas tank, a copper pipe).
- **Tier logic** (§7): World 1–2 = Scrap, World 3–4 = Built, World 5–7 = Pro. Each suit must look clearly better than the last at a glance.
- **Side view in flight**, helmet turned slightly toward the camera so the visor catches the light; 3/4 view on the Workshop stand.
- **Cutout pieces per suit:** torso (with backpack core), helmet (with visor), upper arm ×2, forearm/gauntlet ×2, thigh ×2, boot/thruster ×2, plus 3 breakable armor plates. Pieces overlap at the joints so rotation never shows gaps.

### 14.3 World palettes (sky or ambient top / bottom / environment main / environment accent / highlight)
| World | Palette |
|---|---|
| 1 The Collapsed Mine | `#14121F` / `#2B2236` / `#5A4A42` (rock) / `#4FD1C5` (glowing crystals) / `#FFB547` (lantern light) |
| 2 Junkyard Canyon | `#F2A65A` (dusk) / `#F7D9A8` / `#B5653B` (canyon rock) / `#4A7C8C` (rusty teal junk) / `#FFE29A` |
| 3 Cliffside Test Range | `#6CB7E8` / `#E0F3FF` / `#7A8B5C` (cliff grass) / `#E86A3A` (test markers) / `#FFFFFF` (sea foam) |
| 4 Harbor City Rooftops | `#FF9E6B` (sunset) / `#FFD3B0` / `#4D5A73` (buildings) / `#2EC4B6` (neon) / `#FFE66D` (windows) |
| 5 Hurricane Coast | `#26323F` / `#5C6F7E` / `#3D4A55` (rocks and sea) / `#F2C14E` (lighthouse) / `#E8F7FF` (lightning) |
| 6 The Stratosphere | `#1E3A8A` / `#93C5FD` / `#F8FAFC` (cloud tops) / `#F59E0B` (balloon) / `#FFFFFF` |
| 7 Orbit | `#02030A` / `#0B1026` / `#1E5AA8` (Earth below) / `#FFB547` (forge glow) / `#E8F1FF` (starlight) |

### 14.4 Terrain look
- **World 1 rock walls:** layered warm-brown rock with cool shadowy recesses, glowing teal crystal clusters (the scrap-rich pockets glitter), old wooden support beams, rails, hanging lanterns, dripping water, dust motes in lantern light.
- **Edge strips:** a thick, rounded, painted rim along every collidable edge, with a lighter top edge (key light from the upper left) and a darker underside, so collision surfaces always read clearly.
- Each later world defines the same three things: fill texture, edge strip and 8–12 decoration sprites.

### 14.5 Style frame (first art the owner produces in Milestone 2)
1. The World 1 Scrap Rig: base, plus each of the 5 parts at tier A and tier B, assembled stage by stage, plus each part isolated, plus the cutout pieces of the fully built rig.
2. The player's gloved hands with 4 tools (welder, hammer, wrench, screwdriver), World 1 glove tier, in the first-person angle used for build moments.
3. The helper drone (5 lens moods, 3 poses), plus the intro card painting.
4. The World 1 Workshop (cave nook) background in 4 parallax layers.
5. World 1 terrain set: rock fill texture (tiling), edge strip, 10 decorations (crystals, beams, lantern, rails, rubble).
6. One panel frame, one button in 3 colors (yellow, green, blue) with pressed state, the scrap/bolt icon, the heat and battery dials.

### 14.6 Signature moments to make look spectacular (capture motion strips of each)
1. **First liftoff of the Scrap Rig:** a sputtering, wobbly hop with smoke.
2. **Overheat sputter:** steam jets, a coughing flame, the suit shaking.
3. **Hard impact:** hit flash, sparks, a dent decal, a plate flying off.
4. **Rest on a ledge:** steam puff, the helper drone patching a plate.
5. **Ragdoll crash and the drone's tow.**
6. **Build moment** in the Workshop (your gloved hands, weld sparks, part snap).
7. **Bursting out of the mine into sunrise** (god rays, dust, lens glow). This is the single most important shot of the game.
8. **Evolve cinematic.**
9. **Intro card and world title cards:** painted full-screen illustrations in the same style, with the title in the chunky display font.
