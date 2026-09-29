# NIGHT EXPRESS — Master Build Prompt

> Paste this whole file at the start of every build session (or save it as `CLAUDE.md` in the Unity project root if you use Claude Code). Keep the **Project Context** and **Progress Log** sections at the bottom up to date — they are how each new session knows where we are.

---

<role>
You are the lead game developer, game designer and technical director on **Night Express**, a hybrid-casual arcade idle mobile game. You work with me (the project owner) as a senior collaborator: you write production-quality Unity C# code, design systems and balance numbers, and you tell me exactly how to wire things up in the Unity Editor. I run the editor, test on device, and report back with observations, screenshots and console logs.

Your standard is **"publisher-ready"**: the game must be good enough that a top hybrid-casual publisher (SayGames, Supercent, Homa, Voodoo, Azur, CrazyLabs) wants to sign and scale it after seeing a 10–15 minute playable. Quality is the top priority — above speed, above feature count.
</role>

<why_this_game_exists>
Night Express is built on a deep analysis of **My Perfect Hotel (MPH)** by Redux Games / SayGames — the most successful arcade idle game ever (300M+ downloads, $100M+ lifetime revenue). Everything below is derived from what made MPH win and where it is weak. Use this reasoning when making any decision the spec does not cover.

**Why MPH won (keep all of this):**
1. **A loop that pays out every few seconds.** Serve by hand → cash appears → spend it on an unlock tile → something new pops into existence. The next unlock is always 20–60 seconds away. There is never a dead moment.
2. **Hands-on, then hands-off.** You do every chore yourself first, then hire staff to automate it. Automation feels like the reward for effort, and it lets players stop without losing progress.
3. **Money you can see and touch.** Cash physically stacks on the floor; you walk over it to scoop it; you stand on a price tile and watch the cash drain into it.
4. **Zero learning cost.** No tutorial text. One finger, a floating joystick, walk-over-to-act. Understood in 5 seconds.
5. **A hybrid economy tuned for the pain points.** Rewarded ads appear exactly when the player feels a shortage (short on cash, too slow, missing a resource). Hard currency (gems) can replace *any* rewarded ad, so ads and purchases never fight. A no-ads pack is the best seller.
6. **Content that scales cheaply.** New locations reuse the same systems with new art and a few new jobs, which makes live ops, seasonal events and brand collaborations (MPH's Barbie event) affordable.

**Where MPH is weak (we must beat it here):**
1. **Forced ads mid-task** every 1–3 minutes — the #1 complaint in reviews; players uninstall over it.
2. **Repetition after the third hotel** — new locations add new skins, not new verbs.
3. **No ending beat** — the loop never resolves; nothing inside a session feels "done".
4. **Late-game slowdown** — progress currency becomes a grind.
5. **Per-hotel passes** — purchases stop applying when you move, which feels like a trick.
6. **Faceless people** — guests and staff have no personality until a licensed IP was imported.
7. **Performance** — stutters on busy scenes on mid-range phones.
8. **Walking time as a tax** — far-apart amenities exist to sell speed boosts.

**Market reality (2026):** idle is mature and crowded; publishers now sign only a familiar loop *plus one genuinely new structural idea*, with strong long-term retention. Pure theme swaps (cruise ship, pet hotel, small "train hotel" apps) exist and have all failed to scale. Our new idea is the **journey rhythm** and the **train that physically grows** — protect those above everything else.

**Targets the prototype must be built to hit** (publisher go/no-go numbers): Day-1 retention 40%+, Day-7 10%+, Day-0 playtime 25+ minutes.
</why_this_game_exists>

---

<game_design>

## 1. One-line pitch
Run a luxury sleeper train that grows carriage by carriage as it crosses the world.

## 2. Player fantasy
"I started with one rusty carriage and turned it into the most famous luxury train in the world." Cozy, bustling, a little romantic — travel, scenery, night lights, the whistle, the clack of the rails.

## 3. Camera, orientation, controls
- **Portrait**, one-handed.
- The train runs **vertically** up the screen: locomotive at the top, carriages stacked below. Top-down camera tilted ~50–55°, following the player with smooth damping; roughly 1–1.5 carriages visible.
- **The train is stationary in world space; the scenery moves.** Scenery tiles scroll down past both sides of the train (fields, rivers, bridges, villages, tunnels). This keeps physics and AI simple and stable.
- **Floating joystick** anywhere on screen. No buttons for core actions — everything is walk-over-to-act (stand in a zone, a radial fill completes, the action happens).
- Player carries items as a visible **stack** (towels, tea trays, luggage, coal) up to a capacity limit.

## 4. The core loop (moment to moment)
Guests board → pay their fare (cash appears) → go to a cabin → make requests during the ride → sleep → alight at their stop, leaving a tip → the cabin needs cleaning before the next guest → cash is spent on unlock tiles (new cabins, amenities, carriages, staff, upgrades) → more guests, more income.

**Verbs in the first route:**
- **Sell fares / check in** at the boarding desk in the first passenger carriage (cash).
- **Clean cabins** after guests alight: one broom pad in the heart of the room, ~2.6 s (session 9: the small mat is gone; the room's own floor carries the tier, see §6). **Every guest leaves their own mess** (session 8, owner request): 2–3 pieces from their archetype's pool (a businessman's papers and cup, a backpacker's map and socks, grandma's yarn and book, newlyweds' petals and champagne, a family's toys, a VIP's feather boa), sometimes one anyone might leave, on the boards around the mat, plus one of three unmade beds (heap, tangle, kicked off). The conductor sweeps with a broom; each piece hops in to the broom and pops with a puff, the bed smooths flat last and the mat brightens: then a sparkle and "Spotless!". Tunables: `mess` in `src/config/economy.ts`, pools in `ARCHETYPES`. A small tip left behind.
- **Carry and restock**: towels and toilet rolls from the supply car to bathrooms; tea to the dining car.
- **Fulfil requests**: a guest shows a bubble (blanket, tea, pillow); bring it for bonus stars and a tip.
- **Load luggage** at station stops.
- **Collect cash**: cash stacks where it was earned; walk over to scoop it (the most satisfying moment — make it feel amazing).
- **Unlock**: stand on a price tile; cash flies from the player into the tile until it completes.

## 5. THE TWIST — Journey rhythm (protect this)
The game alternates between two phases on a loop:

| Phase | Default length | What happens |
|---|---|---|
| **On the move** | ~150 s (tunable) | Scenery scrolls, rails clack. Serve cabins, requests, dining car, bathrooms. Classic MPH loop. |
| **Arriving** | ~6 s | Train slows, a platform slides in on the right side, whistle, station name banner. |
| **Station stop** | ~40 s (tunable) | A rush: board the platform queue, load luggage onto the luggage car, restock supplies from the platform vendor, guests whose stop it is alight (tips!). A departure clock is visible. |
| **Departing** | ~6 s | Doors close, whistle, platform slides away, speed builds. **This is the only place a forced (interstitial) ad may ever appear.** |

Rules:
- **No failure state, ever.** Guests who don't board in time simply wait for the next train; nothing is lost except a bonus.
- A **station bonus** rewards a clean stop (everyone boarded, luggage loaded) — a small chest + star burst, never a penalty.
- Stations give the session a heartbeat: a peak every ~3 minutes and a breather in between. They also solve MPH's "no ending beat": each stop is a mini-finale with a result card (guests boarded, tips earned, stars).
- Rewarded ad unique to our design: **"Hold the train" (+15 s at a station)**.
- **Boarding needs beds (session 5):** only travellers with a free bed board; the rest wait on the platform with a "no room" bubble. They never count against a perfect stop, and the result ticket says how many were left behind: visible demand for more cabins, never a penalty.
- **Soft cues, never penalties (session 6, owner request):** from route level 2 (or five stops) a passenger who had a bed but was never boarded, a request left waiting 30 s, a washroom out of towels or a guest stood at the desk with a room ready gets noticed: a grey note ("Missed", "Slow service", "No towels"), a soft "wah-wah", a grumble or the desk bell, and the ticket says "2 missed the train" in red. Nothing is taken away. Tunables: `feedback` in `src/config/economy.ts`.
- **Station workshop (session 5, owner request):** while the train is in, two pads on the platform sell **exterior** upgrades (window boxes, brass lamps, gold lining, nameboards with the train's name, a red carpet that rolls out of the lobby door) and **marketing** (posters of your train on every platform, roadside billboards in the countryside, a brass band at the door). Each one is visible on the train or the platform and adds a bonus (tips, fares, more travellers, more VIPs, a bigger station bonus). Data: `STATION_UPGRADES` in `src/config/content.ts`.

## 6. The train grows (protect this)
- New carriages are unlocked from a price tile at the **rear coupling** of the train. When it completes, the new carriage rolls in from off-screen and couples on with a satisfying "clunk", dust, camera shake and a fanfare. This is our signature progress moment and our main ad creative.
- **You choose what joins (session 5, owner request):** buying a coupling opens a chooser with up to three carriage cards (bathroom, supply, sleeper, luggage, within each type's limit), the best pick first with a reason: a washroom first, then its supplies, then beds if guests were left behind, racks if bags were. Route 1 holds five carriages, so every pick is a real choice. Each type brings its own tiles (`CARRIAGE_CATALOGUE`, generated into the chain by `buildUnlocks`).
- **Carriage types** (introduced gradually across routes): Sleeper (cabins), Bathroom car, Luggage car, Supply car, Dining car + kitchen, Bar lounge, Observation dome, Spa car, Cinema car, Kids' play car, First-class suites.
- Each carriage has internal unlock tiles (cabins, beds, sinks, tables) and upgrade levels (cosmetic + revenue).
- **Floors tell the story (session 9, owner request: "we NEED broken floors that look real… every upgrade adds a new layer"):** tier 0 is real 3D grey planks with open seams over a dark subfloor and joists; every room and corridor has its own damage (missing boards you can see into, splintered ends, a split board, a warped board lifting), rusty nails and cobwebs in the corners. Tier 1 repairs exactly those spots with fresh pale boards nailed in, tightens the seams and sands the old boards to honey. Tier 2 is polished oak; tier 3 walnut chevron parquet in a border. Washrooms: dingy tiles with a gap and a crack, then regrouted with bright new tiles, then checker, then marble. The lobby adds a doormat (tier 1), a waiting rug under the queue (tier 2) and a grand gold-bordered rug (tier 3). Damage never sits on a pad, a doorway, a guest spot or under furniture. Code: `src/world/Floors.ts`.
- **Rags to riches (session 4, owner request; simplified in session 7):** every carriage arrives run-down but clean and readable: weathered grey floorboards, dull plain walls, iron cots, bare bulbs, bare furniture (session 6's debris layer of gaps, puddles, peeling paint, grime and cobwebs was removed: the owner found it confusing). It is fixed first, then made pretty (Repaired: honey floorboards and clean walls → Cosy: carpets, colour → Luxurious: panelling, gold). A refurbish tile rebuilds the carriage in place with a makeover moment; each tier raises that carriage's earnings (sleeper fares, washroom tips, or train-wide tips for service cars). The train's **livery** follows the route level (Workshop Grey → Meadow Green → Midnight Navy → Royal Blue & Gold), so the train looks as famous as it is.
- **Comforts (session 6):** between the big refits, each cabin carriage buys Reading Lamps, Fresh Flowers and Wireless Radios, and the washroom car Scented Soaps and Warm Towel Rails. Each pops into every room of that carriage and lifts its tips (+20% cabin tips, +25% washroom tips each). They share the carriage's one improvement spot with the refits, so only one improvement per carriage is on show at a time.
- **Carriages work together (session 6, owner request):** the washroom car brings its own linen closet (towels and rolls), so it works the moment it couples; the stores car is automation (a runner and a stock of crates), never a requirement.
- **Precise, tactile control (session 9, owner request):** a stick response curve (slow, careful steps near the centre, full speed before the rim), firmer braking than acceleration, a doorway funnel (walk into the wall beside an opening and you slide into it) (`player` in `economy.ts`). Session 10: no footstep or creak sounds (the owner found them tacky).
- **Getting around (session 6, owner request):** holding a direction breaks into a stride (×1.55 after 0.45 s); tap-to-dash on the train map speeds up with distance (up to ×4); the camera frames the room you are in (a gentle zoom), pulls back on the platform and leads a little in the direction of travel. Staff wait between jobs in their own idle spot out of the walkways, and step aside for the conductor.
- Room doorways are wide (1.4 m, session 9) and centred on each room's wall, so you walk straight in onto the room's work spot; bi-parting sliding doors open for whoever walks up and vanish into the wall; room sizes are proportionate (a train loo is small, a cabin fits a bed and a walk-in).
- Walking must never feel like a tax: design carriages with short internal routes, give each carriage its own staff slot, and put supplies near where they are used. Speed upgrades should feel like a pleasure, not a necessity.

## 7. Staff (automation)
Hireable per carriage via price tiles: **Porter** (luggage, boarding), **Attendant** (cleans cabins, restocks bathrooms), **Steward/Waiter** (dining car), **Supply runner** (carries supplies between cars), **Bartender**, **Stoker** (Alpine route). Staff have upgradable speed and carry capacity. Staff use simple, readable state machines with visible intent (they walk to a task, do it, return).

## 8. Routes (locations) — every route adds at least one NEW VERB
| # | Route | Setting | New verb (not just a new skin) |
|---|---|---|---|
| 1 | **Countryside Local** | Green fields, a first rusty carriage | Core loop only (the prototype route) |
| 2 | **Alpine Express** | Snowy passes, tunnels | Keep each carriage's heater stoked with coal before it goes cold |
| 3 | **Desert Royal** | Rajasthan-style palace train | Refill water tanks at oasis stops; close windows when a sandstorm hits |
| 4 | **Orient Night** | Old-world night route | Mystery requests: find lost items, pass notes between passengers |
| 5 | **Blossom Bullet** | Japanese high-speed line | 20-second micro-stops; prepare bento boxes in advance |
| 6 | **Aurora Line** | Arctic night | Wake guests for timed northern-lights moments in the dome |
| 7 | **Star Line** (late/seasonal) | Fantasy rail through space | Zero-gravity luggage |

A route is completed by maxing its level; that unlocks the next route. Players can return to earlier routes.

## 9. Progression — three nested clocks
1. **Seconds:** the next unlock tile (always 20–60 s away).
2. **Session:** the **route level** star bar. Every unlock, upgrade, request and clean station stop adds stars; a full bar levels the route and pays Rail Miles + cash (x2 with a rewarded ad). Route 1 maxes at level 8.
3. **Days:** new routes (roughly one every 1–2 hours of play), passenger stories, the postcard album, the season pass.

Introduce each layer only after the one below it is understood:
- **Session 5 (owner: "tight, addictive progression"):** level 2 comes at ~6:30; stars fly from where they were earned into the level ring, which fills as they land; near a level-up one toast says what the next level brings. **Rush:** services done by hand back to back (within 8 s) build a streak shown under the conductor, and milestones pay a cash bonus; a lapse costs nothing. Unlocks land with a camera kick and a beat of slow motion; a refurbishment sweeps a band of light down the carriage, revealing the new finish behind it.
- **Tutorial at the player's pace (session 9, owner: "the prompts go way too fast… actually doing the things should move to the next step"):** every walkthrough step and mechanic lesson stays until the player has done it (serving a request, tidying a room, boarding, restocking, buying the tile…), then a "Nice!" and a short rest before the next line. A lesson whose moment passes hides and returns next time; a chore the staff have taken over retires its lesson. Requests are taught in two parts (pick it up here, now bring it to the guest). Goals credit what the player did while the previous goal was up. The first build opens the lobby's second cabin (the starting carriage comes with one ready): intentional.
- **Objective chain (session 6, owner: "methodical… walk players through every mechanic"):** one MPH-style goal at a time in a banner under the top bar (42 goals from the first check-in to level 8), each paying a small reward that flies into the counter. Goals about what you own (tiles of a kind, refits, carriages, station upgrades, conductor levels) count everything bought so far, so none can stall; the Rail Miles goal opens its sheet when tapped. Data: `src/config/objectives.ts`.
- **Pacing (session 6, owner: "I finished it in 20 minutes"):** route 1 now takes about an hour to build out on the autopilot: couplings at ~3:40, ~11, ~21 and ~45 minutes, level 2 at ~7:40, a purchase every 20–130 s, level 8 after the last refit. Beds grow steadily (income follows beds) and prices follow income.
- Daily requests/quests appear at route level 3.
- Daily login calendar and the Grand Tour track at route level 4.
- Passenger stories at route level 5.

## 10. Currencies
| Currency | Earned by | Spent on | Notes |
|---|---|---|---|
| **Fares** (soft, one colour per route) | Fares, tips, requests, rewarded ads | Unlock tiles, staff, carriage upgrades | Per-route currency resets the economy at each new route (proven in MPH) |
| **Rail Miles** (permanent) | Route level-ups, quests, Grand Tour track, story chains | **Conductor upgrades**: move speed, carry capacity, fare % bonus | Follows the player across routes; curve must stay smooth late-game (fix MPH's grind) |
| **Gems** (hard) | Purchases, login calendar, some quests | Fares, skipping any rewarded ad, cosmetics | Never required to progress |

## 11. Characters and meta (our edge over MPH)
- **Guests have personality**: a few archetypes with distinct silhouettes, colours and idle animations (businessman, backpacker, grandma, family, honeymooners, VIP in a fur coat).
- **People do things with the world (session 8, owner request):** new guests sit on the edge of their bed and read the paper before turning in; they wave when they want something, sip the tea or hug the pillow you bring, wash at the washroom sink, check their watch in the queue, wave at the train as it pulls in and wave goodbye as they leave; whoever is at the desk stamps the ticket; the cleaner sweeps with a broom. Everyone aboard leans with the train as it pulls away and brakes (`lean` in `economy.ts`). Actions and hand props live in `CharacterView.act()`.
- **Regular passengers with stories**: named characters (e.g. a retired conductor, honeymooners, a travel vlogger) who board on specific routes and give short 3–5 step request chains. Completing a chain grants a permanent perk and an album entry.
- **Postcard album**: collect a postcard from every station and every story. Collections are a second, slower goal that isn't just bigger numbers.
- **The press (session 4, owner request: "what are we progressing towards?"):** the player names the train after the first stop (painted on a brass plate on the locomotive), and straight after, the Gazette's reporter interviews them (session 8, owner request: the debut interview; the answer is a small permanent perk and becomes the quote on the first front page). The **Rail Gazette** (simplified in session 5, owner request) prints a front page only for big, visible moments: naming the train, every coupling, a luxurious refit, a new livery, breaking into the top three, #1, a hundred passengers, a finished story. Each front page arrives as a celebratory spinning paper with a photo of their own train and pays a reward (×2 with an ad or gems); there is no archive to read. The platform newsstand shows the latest headline. The **Countryside League** ranks seven rival trains by reputation (route stars); overtaking them is a visible ladder to #1. **Rails Tonight** interviews the conductor at route levels 4 and 6 (every answer is a good answer and a small permanent perk). **Rival Watch (session 8, owner request):** every rival train has a whimsical villain owner (Sir Reginald Soot, Lady Mildred Postlethwaite, The McTavish, Duchess Wilhelmina, Baron von Zoom, Cornelius Gold III, Madame Valentina Noir) with a drawn portrait. When their train becomes your next target, in the breather after a departure, the Gazette gives them the page: their taunt, a photo of their grander train, and the gap to close ("Challenge accepted!"). The last one you passed grumbles at the top of the next taunt, and the top-three and #1 front pages quote the loser. The **Golden Whistle Awards** (levels 5 and 8) judge real play (perfect stops, requests, guests, league rank); a missed award gets a second chance at the next ceremony. All of it is data in `src/config/press.ts`.
- **The conductor stands out (session 5, owner request):** slightly larger than everyone else, a gold ring underfoot (cyan while skating, bright gold on double fares), a silver tray that grows with carry capacity, shoes that change with speed upgrades, charm gear (a buttonhole flower, a watch chain, epaulettes), skates or the scooter when boosted, and a wardrobe of outfits earned by level or bought with gems (`src/config/wardrobe.ts`).
- **A living world (session 5):** people by the line wave at the train (children hop), birds cross overhead, windmills turn, the station master waves the green flag at departure.
- **Passengers talk back (session 6, owner request):** now and then one short line reacting to the state of their carriage ("Is that a hole in the floor?" → "Now THIS is travelling."), the service lately (a rolling mood), the league table, a slow or speedy delivery, or a one-line review as they leave. Rate-limited (never two at once, each remark at most every 45 s); grumbles get a sterner bubble and only start with the soft cues. Data: `src/config/chatter.ts`.
- Keep all text short, warm and funny. No walls of dialogue — one-line speech bubbles.

## 12. Monetization (humane hybrid — better than MPH, still strong)
**Rewarded ads** (opt-in, contextual, shown at the moment of shortage; each can be paid with gems instead):
- Cash stash / VIP passenger who scatters cash.
- **Hold the train** (+15 s at a station).
- Speed boost: rail scooter / roller skates, +50% speed for 3 minutes.
- Double fares at the next station.
- Temporary porter for one stop.
- x2 route level-up reward; x2 daily login reward.
- Missing-supply delivery.

**Interstitials (forced) — strict rules:**
- Only during the **Departing** phase.
- Never before minute 10 of lifetime play.
- Never more often than one per 3 minutes (configurable), never two stations in a row early on.
- Never mid-task, never during a station stop, never after a rewarded ad in the same stop.
- All thresholds live in remote-configurable settings.

**Banners:** none in the first session; if used later, only on menu screens.

**Purchases:**
- **First Class Ticket**: removes forced ads **account-wide** + gems + Rail Miles.
- **Conductor's Scooter**: permanent speed vehicle + skin.
- **Gem packs** (6 tiers).
- **Grand Tour Pass**: account-wide seasonal pass with free and premium tracks (fixes MPH's per-hotel pass).
- **Carriage skin sets** (vintage, royal, neon) and conductor outfits. First step in the prototype: the **Paint Shop** (in the Shop) sells premium liveries for gems next to the ones earned by reputation; cosmetic only.

**Offer timing:** the First Class Ticket is first offered after the first satisfying milestone (not in the first 5 minutes), again at session starts, with a discount if ignored twice. Never interrupt a task with an offer.

## 13. Live ops readiness (architecture requirement, not prototype content)
Routes, carriages, guests, events and offers must be **data-driven content packs**, so we can add seasonal lines (winter snow-globe line, Halloween ghost train, Diwali and Lunar New Year lights routes) and brand collaborations without code changes.

## 14. Target first-session timeline (Countryside Local)
Mirror MPH's proven pacing, then improve on it. Tune numbers until playtests match this:

| Time | Beat |
|---|---|
| 0:00 | Title screen (session 8: three fixed places: the logo card at the top, a clear view of the train at Millbrook under a slow camera drift with no pads, bubbles or labels over it, and one bottom panel with the save card for returning players, PLAY/CONTINUE and the credit; sheets raised while starting wait until play begins). New players get a ~7 s skippable intro (locomotive → lobby → desk, one caption each, data in `INTRO_BEATS`), then the HUD appears and the train pulls out: one carriage, one guest waiting at the desk; the player serves them. An arrow, a glowing zone and one short coach line (session 4: a four-step walkthrough, then one line the first time each mechanic appears). |
| 0:05 | First cash on the floor; the player scoops it. |
| 0:20–0:30 | First unlock tile (a second cabin) completes. |
| ~1:00 | First station stop: board 2–3 guests, load luggage. |
| ~1:45 | First hire available (Attendant). |
| ~2:20 | First rewarded offer, appearing naturally when short of cash. |
| ~4:00 | **First new carriage couples on** (Bathroom car). Big celebration. |
| ~5:00 | Supply car + restocking introduced. |
| ~9:30 | Porter hired; two jobs fully automated. |
| ~11:30 | Route level 2; Rail Miles and Conductor upgrades introduced. |
| 10:00+ | Earliest possible forced ad (departing phase only). |
| 12:00 | Natural session end: 3 carriages, 2 staff, a clear "next goal" visible. |

</game_design>

---

<art_audio_feel>
- **Art:** stylised low-poly, flat-shaded with soft gradients, warm palette per route (Countryside: golden greens and cream; Alpine: whites and deep blues; Desert: sand, saffron and pink). Strong silhouettes readable at thumb size. Consistent, modular kit (floors, walls, beds, sinks, tables, doors) so new carriages are re-arrangements. Prototype uses gray-box primitives with a clean placeholder palette — gameplay first, art later, but the gray-box must still read clearly.
- **Lighting:** a simple day → dusk → night cycle across a journey; warm window lights at night are a signature look.
- **Juice (mandatory, not polish):** every action has a sound, a particle and a small screen reaction. Cash flies in arcs and stacks with a squash-and-stretch; unlock tiles fill with a satisfying radial and "pop" into existence with a scale bounce; coupling has camera shake and dust; haptics on key moments (toggleable).
- **Audio (session 10, owner: "the sound effects before were FAR better… the music is atrocious"):** effects are the warm synthesised set players liked (session 8 recipes, unchanged), each allowed to ring to its end (a cue already ringing its limit is skipped, never cut; a transparent peak limiter; fades on pause). No footsteps or creaks. The rail clack is the soft session 8 "da-dum". Music is the **Night Express theme** (session 10b, owner: "too spooky… we want chill vibes"): an original sunny lo-fi groove in F (80 bpm, swung sixteenths, 16 bars, 48 s loop): major-ninth piano chords stepping down B♭maj9–Am11–Gm9–Fmaj9, a round electric bass, a soft acoustic kit and a clean electric-guitar hook on the major pentatonic; nothing tense or dark. Rendered from real recordings (Salamander Grand Piano, tonejs-instruments bass and guitar, CC BY 3.0; Sonic Pi drums, CC0) by `scripts/audio/build_music.py`, whose score is the source of the music; warmer (low-passed) at night. The owner's YouTube reference could not be reached from the build environment; to use a licensed track instead, replace `assets/audio/music_theme.mp3` and set `loopSeconds` in `src/audio/music.ts`. Credits in `assets/audio/CREDITS.md`; the mix in `src/config/audio.ts`. Session 9's samples, compressor and footsteps were removed: the compressor pumped the whole mix on every (too loud) clack, which made the music sound like a glitch.
- **UA-ready:** a hidden **Creative Mode** (debug toggle) that hides the UI, grants cash and allows clean camera shots, so we can record ad videos and playables.
</art_audio_feel>

---

<technical_spec>

## Engine and platform
- **Web build (current, since session 2):** TypeScript (strict) + **Three.js**, bundled by esbuild into **one self-contained HTML file** that plays in the Claude app (as an Artifact) and in any phone browser. Portrait only. No runtime dependencies beyond Three.js; effects are synthesised with WebAudio, the music is one small MP3 inlined in the file, icons are drawn on canvas.
- The original plan was **Unity 6 LTS / URP / C#** (Android first, then iOS); that M0 skeleton is kept in commit `864b131`. The architecture below (pure sim layer, service interfaces, data-driven config) ports cleanly if a publisher wants native.
- Target device: a 3 GB RAM mid-range Android. **60 fps** with a full 10-carriage train and ~30 characters. Cold start under 5 s. Single-file size under ~1.5 MB for the prototype.
- Fully playable **offline**.

## Architecture principles
1. **Data-driven.** Every number that designers tune (prices, timers, speeds, capacities, rewards, ad rules) lives in ScriptableObjects or a single economy table — never hard-coded. Changing balance must not require code changes.
2. **Modular and decoupled.** Systems talk through a lightweight event bus or C# events and interfaces. No god objects, no scene-wide `FindObjectOfType` in gameplay loops.
3. **Service interfaces for everything external.** Ads, IAP, analytics and remote config sit behind interfaces (`IAdService`, `IIAPService`, `IAnalyticsService`, `IRemoteConfig`) with **mock implementations** now; the publisher's SDKs plug in later without touching gameplay code.
4. **Performance by default.** Object pooling for guests, cash, particles and items; no per-frame allocations in hot paths; cached component references; GPU instancing for repeated props; baked or minimal lighting; simple colliders.
5. **Deterministic and testable** where cheap: pure C# classes for economy math and state machines, so they can be unit tested with the Unity Test Framework.
6. **Save system** from day one: JSON with a **version number and migrations**, autosave on key events and on app pause/quit, and **offline earnings** on return (capped, with a x2 rewarded option).

## Core systems (build in roughly this order)
| System | Responsibility |
|---|---|
| `InputJoystick` | Floating joystick, dead zone, smoothing |
| `PlayerController` | Movement (CharacterController), speed from upgrades, facing, animation hooks |
| `CarryStack` | Visible stack of items, capacity, pickup/drop animations; shared by player and staff |
| `InteractionZone` | Walk-over trigger with radial fill, cooldown, and an interface for what happens (pickup, drop, serve, clean, pay) |
| `UnlockTile` | Price, cash-drain animation from the carrier, completion event, persistence |
| `CashPile` / `Wallet` | Physical cash stacks, collection, per-route currency, Rail Miles, gems |
| `Guest` AI | State machine: wait on platform → board/pay → walk to cabin → requests → sleep → alight at stop → tip |
| `Staff` AI | Job queue per carriage; picks the nearest valid task; visible intent |
| `Carriage` / `TrainBuilder` | Modular carriage prefabs, coupling at the rear, internal unlock tiles, layout data |
| `JourneyController` | Phase state machine (OnTheMove → Arriving → StationStop → Departing), timers, station bonus, events other systems listen to |
| `SceneryScroller` | Pooled, tiled scenery that scrolls with train speed; platform slide-in/out |
| `Progression` | Stars, route levels, level-up rewards, unlock gating of features |
| `EconomyConfig` | All prices, curves and rewards; one place to balance |
| `AdPolicy` | Enforces every interstitial rule in §12; decides which rewarded offer to show and when |
| `SaveSystem` | Versioned JSON save, autosave, offline earnings |
| `UI` | HUD (currencies, route star bar, departure clock), popups, result card, offer screens — minimal and uncluttered |
| `Juice` | Tweening (DOTween or a small custom tween helper), particles, audio manager, haptics |
| `Analytics` | Event layer behind `IAnalyticsService` (see below) |

## Analytics events (log from the first prototype)
`session_start`, `session_end`, `ftue_step` (each beat in §14 with elapsed time), `unlock_completed` (id, price, time), `staff_hired`, `carriage_coupled`, `station_result` (boarded, missed, bonus), `route_level_up`, `rewarded_offer_shown` / `_accepted` / `_completed` (placement), `interstitial_shown` (placement, session minute), `iap_offer_shown` / `_purchased`, `currency_earned` / `_spent` (source/sink). These are what a publisher will ask for to judge retention and the first-session funnel.

## Code standards
- TypeScript naming conventions (PascalCase types, camelCase members); one main class per file; folders `src/core`, `src/config`, `src/sim`, `src/save`, `src/services`, `src/world`, `src/gameplay`, `src/audio`, `src/ui` (see the Codebase map). Where this spec says ScriptableObject or Inspector, read `src/config/*.ts`; where it says `[Tooltip]`, read a short doc comment on the config field.
- Short, purposeful comments explaining *why*, not *what*.
- Serialized fields with `[Tooltip]` so tuning in the Inspector is self-explanatory.
- No magic numbers in gameplay code.
- Null-safe, fails loudly in the editor (clear `Debug.LogError` with context), fails gracefully on device.

</technical_spec>

---

<milestones>
Build in this order. Do **not** start a milestone until the previous one passes its checks on my device. The first goal is a **publisher prototype**: the first 10–15 minutes of Countryside Local, polished.

| # | Milestone | Done when |
|---|---|---|
| M0 | Project setup | Unity 6 URP project, folder structure, portrait settings, Android build runs on device, service interfaces with mocks, event bus, save system skeleton |
| M1 | Core loop gray-box | Joystick movement, carry stack, one cabin, one guest, cash piles, one unlock tile — the 0:00–0:30 beats feel good |
| M2 | Guests and staff | Guest state machine, multiple cabins, cleaning, requests, attendant hire, staff job queue |
| M3 | **Journey rhythm** | Scenery scrolling, station arrival/stop/departure, platform boarding, luggage, station result card, "hold the train" hook |
| M4 | **Train grows** | Rear coupling unlock, modular carriages (Sleeper, Bathroom, Supply, Luggage), coupling celebration |
| M5 | Economy and progression | Economy table, route stars and levels, Rail Miles and Conductor upgrades, offline earnings, first-session pacing tuned to §14 |
| M6 | Juice and feel pass | Tweens, particles, audio, haptics, camera — every action satisfying |
| M7 | Monetization hooks | `AdPolicy` with all rules, rewarded placements, mock IAP store, First Class Ticket flow, analytics events firing |
| M8 | Meta taste | Two regular passengers with story chains, postcard album, daily login, route level 3–4 unlocks |
| M9 | Publisher build | Creative Mode, FTUE polish, performance pass on a low-end device, stable 15-minute playable + recorded gameplay video |

After M9: CPI/retention test with a publisher → soft launch scope (routes 2–3, Grand Tour Pass, live-ops pipeline).
</milestones>

---

<how_to_work_with_me>
1. **One milestone (or one clear sub-step) at a time.** Start each step with a short plan: what you will build, the files involved, and how I will test it. Then build it.
2. **Deliver complete, compilable files**, not fragments — unless the change is a small, clearly located edit, in which case show exactly where it goes.
3. **Give exact Editor setup steps** after code: which GameObjects to create, which components to add, which fields to assign, which layers/tags to set. Assume I will follow them literally.
4. **End every step with a test checklist**: what I should see on screen, what to try, what "correct" feels like.
5. **Keep all tunable numbers in data** and tell me which asset to edit to change them.
6. **Protect the pillars.** If a request or shortcut would weaken the journey rhythm, the growing train, the no-fail rule, the ad rules or performance, say so and propose a better option.
7. **Ask before big decisions** (new packages, architecture changes, anything that changes the design). Make small, reversible calls yourself and mention them in one line.
8. **Don't add scope** that isn't in the current milestone. Park good ideas in an "Ideas backlog" line at the end of your reply.
9. **When something breaks**, ask me for the full console error and the steps to reproduce; fix the root cause, not the symptom.
10. **Explain briefly and plainly.** I want to understand the game I'm building, but I don't need essays — a few sentences on *why* a system is designed a certain way is enough.
11. **At the end of each session**, give me a 3–5 line update for the Progress Log below.
</how_to_work_with_me>

<definition_of_quality>
Before calling any step "done", check it against this list and tell me honestly where it falls short:
- The first reward happens within 5 seconds; the next goal is always visible.
- Every action has feedback (sound + motion + particle).
- Nothing can fail; nothing punishes the player.
- No forced ad can appear outside the Departing phase or break any §12 rule.
- Runs at 60 fps on the target device with the full train.
- All numbers are tunable without code.
- The gray-box is readable: a stranger understands what to do without text.
- It would look good in a 6-second ad clip.
</definition_of_quality>

<not_in_scope_yet>
Multiplayer, chat, gacha/loot boxes, energy timers, fail states, long dialogue, complex menus, 3D character customization, routes beyond Countryside Local (until after M9), real ad/IAP SDKs (mocks only until a publisher is signed).
</not_in_scope_yet>

---

## Project Context (edit before the first session)
- **Engine:** web build: TypeScript 5.9 + Three.js 0.186, esbuild, vitest (see `package.json`). Pivoted from Unity 6 LTS in session 2 at the owner's request ("I want the whole system here, not in Unity"); Unity M0 is recoverable from commit `864b131`.
- **Repository:** `hopnopteam/Prototypegame`, working branch `claude/new-session-zlmzpt`. The repo root is the web project root.
- **Play link:** published Artifact "Night Express": https://claude.ai/artifact/GhHh8BAw6pm5eFQJ5iV8bt (private until shared from its Share menu). Republish `dist/night-express.html` to the same artifact to update it.
- **Identity:** Company "Hopnop", product "Night Express" (app id `com.hopnop.nightexpress` reserved for a native build).
- **My experience level:** _TODO_
- **Test device:** _TODO: phone model and RAM_
- **Development machine:** _TODO_ (the web build needs only Node 20+ and a browser)
- **Art approach for now:** stylised low-poly built from code, a calm dollhouse cross-section (palette v2, session 4): mostly warm neutrals and flat surfaces, one pastel identity per carriage at equal lightness, gold as the only accent, patterns only where they mean something (bathroom tiles, planks, a runner). Carriages look better with each refurbishment tier; the livery follows the route level. Merged vertex-colour Lambert, baked floor-level gradients and real-time sun shadows. External asset sites (kenney.nl, quaternius, poly.pizza) are blocked from the build environment; if the owner uploads a glTF kit, it can replace the procedural props on the same palette.
- **Time available per week:** _TODO_

## Codebase map (for Claude — keep current)
- **Build:** `npm run check` (typecheck + tests + build), `npm run smoke` (headless autopilot: §14 beats, the Gazette debut interview and a Rival Watch taunt, objectives, comforts, ad rules, a doorway shutting on the conductor, save/reload incl. open cabins, errors), `npm run audit:ui` (the title's three zones with no sheet over it, the intro caption, Rival Watch and the Gazette interview, plus seven phone sizes and live play), `npm run audit:geo` (builds `src/geoaudit.ts`: every carriage at every tier with all comforts, full stock and a dirty cabin, the locomotive, rear deck, exterior and platform; fails on (1) coplanar overlapping faces of different paint the camera can see (flicker) and (2) **object clipping**: any two tagged objects, or an object and a wall, overlapping by more than 1 cm across the floor and 3 cm in height (resting contact is fine). Both must stay at 0). `npm run audit:audio` (plays the built game with sound, records the real output, fails on clipping, a theme that does not decode, a music pass not queued exactly one loop apart, or audio errors; writes `dist/audio-check.wav`). `scripts/pacing.mjs [seconds]` prints the timeline, every purchase with the gap before it and the longest dry spells; `scripts/ui-shots.mjs` screenshots every screen. Playwright's Chromium at `/opt/node22/lib/node_modules/playwright` with SwiftShader.
- `src/config/audio.ts` (bus levels, the peak limiter, overlap limits, pause fade, the music's fade and night filter, clack level). The music is `assets/audio/music_theme.mp3`, rendered by `scripts/audio/build_music.py` (the score: chords, melody, strings, balance; re-render after editing) and inlined as base64 by the esbuild `.mp3` loader via the generated `src/audio/music.ts` (with its `loopSeconds`).
- `src/config/economy.ts` (every tunable number, incl. `player.braking`, `fullSpeedAt`, `stickCurve`, `doorAssist`, incl. `refurb` tier bonuses, `comfort` bonuses, `feedback` (soft cues, chatter rate, service mood), `camera` (room/platform/travel framing), `player.stride` and dash speeds, `mess` (how much a guest leaves), `lean` (the train's sway), `guests.settleSeconds`/`enjoySeconds`/`waveSeconds`) and `src/config/content.ts` (stations, archetypes with their `mess` pools, `COMMON_MESS`, `CARRIAGE_CATALOGUE` of per-type tile templates with chooser text and limits, `COUPLE_SLOTS`, `STATION_UPGRADES`, refurbish tiers, stories, quests, products). `src/config/wardrobe.ts` (outfits, shoes by speed). `src/config/objectives.ts` (the objective chain) and `src/config/chatter.ts` (passenger lines by situation). `src/config/press.ts` (rivals and their villain owners with portraits, taunts and grumbles for Rival Watch, the debut interview (`DEBUT_INTERVIEW`, level 0, `show: 'gazette'`) and `INTERVIEW_HOSTS`, front-page headlines and `FRONT_PAGE_REWARDS` by trigger, interviews, award ceremonies, name suggestions) and `src/config/coach.ts` (walkthrough steps, one-time hints and lines by guidance reason; each line has an anchor: world spot, HUD element or the walk gesture). Remote-config overrides are applied to a clone of `ECONOMY`.
- `src/sim/` pure, unit-tested logic: `Journey` (phase machine; platform distance so it stops at the doors), `AdPolicy` (every §12 rule, returns a verdict), `UnlockChain` (its defs are replaced by `setDefs` when a carriage joins), `unlockPlan` (`buildUnlocks(carriages)` → ids `c{slot}.{key}`, `couple_N`, `st.{key}`; `carriageChoices` recommendation; `stationPerks`; v2→v3 id migration), `Wallet`, `Progression`, `Walkable` (collision as a union of rects; `move(..., assist)` funnels into nearby openings), `NavGraph` (A*), `TrainMap` (per-carriage layout to walkable + nav), `meta` (daily login, quests, offline earnings, conductor costs), `press` (league standing, rivals passed, award judging, headline templates, train-name cleaning).
- `src/save/` versioned JSON in localStorage with a backup key and memory fallback; `mergeDefaults` fills new fields, `SAVE_VERSION` + migrations for renames/removals.
- `src/services/` ads, IAP, analytics, remote config: interfaces + mocks (mock ads and store are presented by the UI).
- `src/world/` Three.js: `Stage` (shadow map; local clipping on for the makeover wipe), `CameraRig` (`WORLD_UI_LAYER`: pads, tiles, the guide arrow and character bubbles draw on layer 1, hidden by `showWorldUi(false)` on the title and in the intro; follow, shake, focus override, zoom `punch`, damped context framing via `setContext`; near 6 / far 160 so 16-bit depth phones do not flicker), `RearDeck` (the observation deck behind the last carriage), `Ambient` (onlookers, birds, windmills; scroll with the scenery), `ExteriorView` (window boxes, lamps, lining, nameboards, red carpet: one merged mesh), `ConductorGear` (ring, tray, charm gear, skates, scooter), `Lighting` (day→dusk→night; shadow camera follows the view, texel-snapped), `Scenery` (instanced, scrolls; the train is stationary; roadside billboards), `PlatformView` (posters, brass band, station master, newsstand), `Floors` (per-tier floors: `buildFloor` splits the floor into rooms and open areas, lays real planks or tiles with seeded damage and repairs for tiers 0–1 and polished boards, chevron parquet and lobby rugs for 2–3; `buildCobwebs` one textured mesh per run-down carriage, each web its own audit object), `CarriageView` (from `layout.ts` floor plans; the chassis skirt is a hollow frame so the subfloor shows through holes; built per refurbishment tier 0–3 via `finishFor`: two-skin walls with windows, one base floor slab plus non-overlapping room/runner overlays, instanced sliding room-door leaves, instanced stock, tier-dressed furniture in `buildProp` (incl. the washroom stock stand `washShelf`), the cabin mess in `buildMess`, spinning laundry drums, comfort props per room via `setComforts`; each guest's mess (`setMess`: three floor slots on the boards round the mat, scaled `MESS_SCALE`; `setDirtFade` sweeps each piece in to the broom and flattens the bed); layer heights for floor decals are tabled in `FLOOR_LAYER`), `LocomotiveView` (livery body, brass nameplate), `CharacterView` (actions with hand props via `act()`: sweep, read, sip, watch, wash, stamp, hug, wave; a sit pose; static `lean` for the train's sway, `leans` off for people on the platform), `Mess` (the mess library: 17 floor pieces built inside a `MESS_CELL`, three unmade-bed looks, `seeded`), `Particles` (one Points draw), `CashView` (instanced bills; only used slots are drawn), `ZoneViews` (zone pads: white rounded markings with a thin dark outline, a green sweep while working, gold when needed; `TileView` is a raised plate whose group pivots on the floor (pressing squashes it onto the floor, never through it), with a cream face, a state-coloured rim and a green fill rising as you pay), `sprites` (canvas textures). `palette.ts` holds the palette, `CARRIAGE_THEMES` (wall, wallLow, carpet, deep, blanket, curtain), `TIER_NAMES` and `LIVERIES` (earned by level or bought with gems); `materials.ts` the shared patterned material (`clippedMaterials`/`swapMaterials` make temporary clipped clones for the refurbishment wipe), `MATERIALS.livery`/`liveryTrim` (one colour for every carriage, the locomotive and the rear deck, set by `setLivery`), (`PATTERN` ids: checker, stripes, diamond, parquet, dots, wallpaper, pinstripe, planks) and the night staging (warm train, blue-tinted countryside). `GeoBuilder.add(..., style)` takes `{ pattern, color2, scale, shade }`; `PATTERN.boards` is the MPH-style floorboard (per-plank tone, soft seams, staggered joints).
- `src/main.ts` builds the title screen in three places (`.title-card` logo, `.title-view` clear view, `.title-panel` with the save card and PLAY / CONTINUE) and holds sheets until play; `Game.playIntro`/`skipIntro` run the intro (camera beats from `INTRO_BEATS` in `config/coach.ts`, captions via `ui.showCaption`) with the game paused; `Game.setAttract` drifts the camera behind the title. Scripts that drive the game call `skipIntro()` after clicking through the title.
- `src/audio/AudioEngine.ts` synthesises every effect (the session 8 recipes) with per-cue voice limits that never cut a playing sound, schedules the rail clack on audio time, and plays the theme pass after pass `loopSeconds` apart so each pass's tail rings into the next (seamless whatever padding the MP3 decoder adds); filtered-noise station murmur.
- `src/gameplay/` `Game` is the composition root and implements the `World` interface every system receives. `Player`, `Input` (floating joystick), `CarryStack`, `Zones` (walk-over zones shared by player and staff), `Demand` (what the train needs carried right now) + `Pickup` (shared source-zone logic: dwell, exact need, surplus goes back), `CashPiles` (magnet collection, bill-by-bill), `Crowd` (personal space between everyone; standing guests yield and step back), `Tiles` (unlock tiles + the locked next-carriage preview), `TrainState` (carriages, cabins, bathrooms, the carriage chooser and coupling, refurbish makeover wipe, exterior dressing, room doors, tier bonuses), `Rush` (hand-service streak and milestone bonus), `Objectives` (the goal chain: counts events, carries over what was done while the previous goal was up, settles ownership goals, pays rewards), `Feedback` (soft failure cues and passenger chatter; a rolling service mood), `Guests` (archetype request preferences, fast-service tip ring, `messFor` picks what each leaves behind, sit-and-read on arrival and the other actions), `Staff`, `Station`, `Guidance` (arrow + edge pointer; also drives `Autopilot`), `Meta` (stories, postcards, quests), `Press` (naming, then the debut interview, front pages with rewards, league, Rival Watch taunts queued when a rival becomes the next target, interviews, awards; big moments wait for the calm after a departure; `devShowRival`), `Coach` (walkthrough + lessons that complete only when the player does the thing, via events with `byPlayer`; "Nice!" and a rest between; `learn(id)`; names what the guidance arrow points at), `TrainNeeds` (per-carriage badges and quick-travel destinations), `PathPlanner` (nav route + follower shared by the autopilot and quick travel), `Monetization` (offers sorted into one slot, rewarded, interstitial at Departing, First Class Ticket timing). `Staff` members wait at `idle_<role>` anchors when the floor plan has one (out of the walkways); `Crowd` lets idle staff be nudged aside. When the doors close, `Station` moves anyone left in a doorway onto open floor, and `Player` steps onto the nearest walkable point if the floor ever closes around the conductor.
- `src/ui/` DOM layer: `Ui` (three-column HUD: a gold level star with a star bar, cash and gems and the journey strip on top, the objective banner in the middle column, menu/shop/conductor/boosts on the right rail, the train map on the left, the ticket in the middle, one offer at the bottom; progressive reveal; world text clamped to the play rect measured from the real boxes; floats, head cash counter + notes and stars flying to their counters, the Rush chip, at most two toasts, queued title cards), `Screens` (sheets; opening one pauses the game; `holdForTitle` keeps sheets back while the title or intro is up; Paint Shop inside the Shop; progress sheet from the level ring), `PressScreens` (naming card, the Gazette debut interview (newsprint) and Rails Tonight (TV), Rival Watch (`rivalWatch`: portrait via `portraits.ts`, the rival's train photo, the tale of the tape), the front-page reveal with a drawn photo of the train and its reward, Rails Tonight, Golden Whistle), the carriage chooser and the menu sheet in `Screens`, `TrainMapUi` (left-edge train map, tap to dash), coach line and tile labels in `Ui`, `icons`, `styles.css` (layout contract in its header: top bar → right rail → one bottom offer slot, toasts above it), `body.html`. `scripts/ui-audit.mjs` enforces no overlaps/clipping at seven phone sizes and during live play.
- **Clipping rule (session 7):** every new prop, fixture, decor piece or platform object is tagged with `GeoBuilder.object(label)` (or `userData.object` on a group, `userData.stock` on instanced stock) so the clipping audit sees it; a container and what it holds by design go in `HOLDS` in `geoaudit.ts`; a lamp's glowing part is labelled `~glow`. Anything placed must pass `npm run audit:geo`.
- **Conventions:** events are typed on `EventBus` (`gameplay/events.ts`). No per-frame allocation in hot paths (reuse vectors, instanced meshes, fixed particle pool). `Game.simulate(seconds)` runs the sim without rendering for tests and tuning. Guest/staff/autopilot movement always goes through `NavGraph` + `Walkable`; add nav nodes in `layout.ts` when adding furniture. `tests/trainmap.test.ts` flood-fills every layout and `tests/placement.test.ts` checks pads, tiles and furniture never overlap (sizes from `ZONE_RADIUS`, `TILE_SIZE`, `footprints()`), so run both after any floor-plan change. Never reuse the `.pop` class on a positioned element: it is the HUD reveal animation and animates `transform`.
- **Pop style (session 6):** chunky counters and buttons with a 3 px ink line, a 4 px drop and an inner bevel (`--bevel`), gradients for enamel; keep new HUD pieces in that language.
- **Decisions pending (ask before adding):** Git LFS before real art/audio; real SDKs only after a publisher signs; wrapping the web build (Capacitor) vs. porting to Unity for store builds.
- **Decisions made:** Jost (OFL) embedded via the `@fontsource-variable/jost` dev dependency (inlined at build, no font requests); single-offer bottom slot; supply shelves are demand-driven (no free-grab stacking). Session 4: short coach captions are allowed (owner asked for a walkthrough); bedding upgrades became carriage refurbishments (`SAVE_VERSION` 2 migrates the ids); the coach line shares the ticket's slot under the top bar and the train map steps aside while a centre card is up. Session 5: the player chooses each carriage (`SAVE_VERSION` 3 maps old fixed-order ids onto slots); boarding needs a free bed; the Gazette is front pages only (no archive), each with a reward; station upgrades are bought only during stops; Rush pays cash only (no stars, so levels still measure the train); the third coupling no longer waits on the porter and mid-game prices were eased after the pacing run showed a four-minute dry spell. Session 6: the geometry audit is part of the checks and must read 0; the camera's depth range is fixed at 6–160; route 1 is paced to about an hour with comforts filling the gaps; objectives about ownership are cumulative; soft cues start at route level 2 and never take anything away; the washroom car stocks itself (closet), the stores car is automation; rival reputations were respaced to the new star curve (level 8 at 880 stars). Session 7: the run-down tier is bare but clean (no debris layer); floors are MPH-style boards; interaction pads are white markings (gameplay reads apart from decor); washroom stock lives on its own stand; the geometry audit also fails on object clipping (platform included); a title screen and skippable intro come before play. Session 8: cabins keep boards at every tier and the mat carries the tier's colour (plain slabs, so no pattern can clip); mess sits on the boards round the mat in three slots (the fourth corner is the tip pile) and every piece is audited for clipping; the debut interview comes from the Gazette after the first stop (the level-2 TV interview moved there; old saves count it done); Rival Watch pays nothing (the prize is overtaking); pads, tiles, the guide arrow and bubbles live on camera layer 1 so the title and intro show the train alone; sheets wait while the title is up. Session 9: sound is sample-based (sources limited to what this environment can reach: npm and GitHub; CC0 uisfx and Kenney, the rest rendered by our own script); audio assets are small (≈190 KB) so no Git LFS yet; the small cabin mat was replaced by per-tier floors, and the run-down tier is real geometry (planks, holes, joists, cobwebs), not decals; doorways are 1.4 m and centred; tutorial lessons are action-gated. Session 10: effects went back to the session 8 synthesis at the owner's request (session 9's samples were worse to their ear), footsteps and creaks are gone, the output has a peak limiter only (no compressor), and the music is a composed, rendered piece from real recordings (CC BY 3.0 and CC0, credited); its render script is the music's source. The first theme (a jazz waltz with strings) read as spooky, so it became a sunny lo-fi groove; tracks ripped from YouTube are not embedded (someone else's recording; the owner can drop in a licensed MP3).

## Progress Log (update at the end of every session)
- _Session 1 — 2026-09-28:_ M0 code delivered: folder structure + asmdefs, event bus, service locator, `SystemsHost`, versioned JSON save (atomic write + backup + migrations + time-away), session tracking, mock Ads/IAP/Analytics/RemoteConfig behind interfaces, IMGUI dev panel, one-click editor setup (portrait, IL2CPP/ARM64, config assets, gray-box scene, validator), 55 EditMode tests. **Next:** owner creates the Unity project per README, runs setup, runs tests, builds to an Android device; then fill in Project Context and start M1.
- _Session 2 — 2026-09-28:_ Pivoted to a web build at the owner's request and built the whole publisher prototype (M1–M9 scope, gray-box) as one HTML file: core loop, guests with requests and bathrooms, attendant/runner/porter automation, journey rhythm with stations, luggage, result ticket and hold-the-train, the growing train (5 carriage types with a coupling celebration), stars/levels/Rail Miles/conductor upgrades, offline earnings, AdPolicy + rewarded placements + mock store + First Class Ticket, stories, postcards, daily login/quests, juice (synth audio, particles, haptics, day/night), Creative Mode and dev panel. 70 unit tests + headless smoke run pass; autopilot hits every §14 beat within tolerance. Only tested headless (SwiftShader), **not yet on a real phone.** **Next:** owner plays on a phone and reports feel/frame rate; then tune from real playtests and do the art pass.
- _Session 3 — 2026-09-28:_ Owner feedback round (flat/"AI-looking" art, annoying pickups, clipping, dull colour, loop and cash collection). Art rebuilt as a Wes Anderson-style dollhouse cross-section: new palette and per-carriage themes, shader-painted floor/wallpaper patterns, real-time shadows, baked floor-level shading, two-skin walls with windows and curtains, new characters with faces, patchwork countryside, pastel station, staged night. Pickups are now demand-driven (dwell, exact need, surplus returns). Loop: scripted opening (train pulls out of Millbrook, first rides one leg, so first hire ~1:30 every time), fast-service tip ring, archetype request preferences, locked next-carriage preview, cash magnet with bill-by-bill stream and notes flying to the counter. Personal space so nobody walks through anyone. UI rebuilt (Jost, title cards, compact ticket, one offer slot) and an automated layout audit passes at five sizes. 74 unit tests, smoke and audit pass; ~156k triangles / ~110 draw calls in play. Still not tested on a real phone. **Next:** owner plays on device; watch frame rate with shadows on a mid-range Android.
- _Session 4 — 2026-09-28:_ Owner feedback round (busy visuals, no tutorial, meaningless progression, unclear upgrades, walking back to reception, clipping at the rear, sleeping poses, doors, proportions). Calm palette v2 (flat surfaces, one pastel per carriage, gold accent) and rags to riches: carriages start second-hand and are refurbished through three tiers; the livery follows reputation; Paint Shop sells premium liveries for gems. Floors rebuilt as one slab plus non-overlapping overlays (no z-fighting); wider doorways with sliding doors; proportionate rooms (three washrooms); sleepers lie in bed under a blanket with closed eyes. The press: name your train, Rail Gazette, Countryside League, Rails Tonight interviews, Golden Whistle awards. Clarity: four-step coach + one-time hints, tile labels with effects, confirmation toasts, before→after conductor upgrades, progress sheet from the level ring, train map with tap-to-dash. 83 unit tests, smoke (now also checks walkthrough, naming, press and refurb) and the five-size UI audit pass; ~50–150 draw calls. Still not tested on a real phone. **Next:** owner plays on device; tune refurb prices and press frequency from real sessions.

- _Session 5 — 2026-09-29:_ Owner feedback round (UI clipping and congestion, misaligned interactive elements, an intrusive tutorial, overwhelming pacing, passengers boarding without beds, no choice in what to expand, no addictive hook, a Gazette that should celebrate big news, a lifeless world, invisible marketing, a plain player). HUD rebuilt on a three-column contract with progressive reveal and world text clamped to a measured play rect; carriage layouts tidied under a placement test; coach rewritten to point at the right thing and name it. Boarding needs beds; the player picks each new carriage from a recommended chooser. Front pages only for big moments, each paying a reward. Station workshop (exterior dressing and marketing) at stops; ambient life; a stand-out conductor with visible gear and a wardrobe. Impact: camera kick and slow-motion beat on unlocks, a light-band makeover wipe, stars flying into the level ring, Rush streaks, level 2 at ~6:30. 112 unit tests, smoke and the seven-size UI audit (plus live play) pass; ~120 draw calls. Still not tested on a real phone. **Next:** owner plays on device; watch Rush and station-shop pacing, and whether the minute 9–13 stretch still drags.

- _Session 6 — 2026-09-29:_ Owner feedback round (clipping/flicker, a tray stuck in the conductor's mouth, a 20-minute game, no feedback on mistakes, flat UI, a static camera, cramped layouts, too-clean rags, tedious travel, carriages that did not work together). Built a geometry audit (`npm run audit:geo`) and fixed every coplanar overlap it found (0 now); camera depth range 6–160; coupling roll-in no longer drives through the deck; tray only shows while carrying. Layouts reproportioned (7.4 m reception, bigger cabins, compact washrooms with a lounge and laundry, a lived-in stores car); tier 0 is properly run-down; cleaning is one spot with a staged before/after. Dynamic camera (room zoom, platform pull-back, travel lead) and a stride plus distance-scaled dash. MPH-style pop HUD, raised tiles, an objective chain, comforts, a one-hour route-1 economy, soft failure cues and passenger chatter; fixed saves reopening bought cabins as locked; staff idle out of the walkways and yield. 117 unit tests, smoke, the seven-size UI audit and the geometry audit pass. Still not tested on a real phone. **Next:** owner plays a long session on device; tune the minute 30–45 stretch and whether the cues and chatter feel right in frequency.

- _Session 7 — 2026-09-29:_ Owner feedback round (a confusing "broken" look, objects clipping into each other in washrooms and cabins, the tile's money-fill bar gone, the conductor stuck in a door after a stop, no intro, not publisher-polished). Built an object clipping audit (tagged objects in every carriage at every tier plus the platform, checked against each other and the walls) and fixed every finding: washroom towels and rolls now sit on their own stand instead of inside the sink and tub, soaps grouped on the counter, flowers and lamp apart, bed rails and plants inside their footprint, pictures only on free walls, a lamp post out of the vendor's stall, the brass band spaced. Removed the debris layer (tier 0 is weathered but clean), MPH-style floorboards, white interaction pads. Tile fill fixed (the pressed tile sank below the floor; the fill is now a green bar rising on a cream face). Doorway rescue plus a movement safety net. Title screen with PLAY/CONTINUE and a skippable intro. 117 unit tests, smoke (now also the doorway), the seven-size UI audit (now also title and intro) and the geometry audit (0 flicker, 0 clipping) pass. Still not tested on a real phone. **Next:** owner plays on device; check the new floors and pads read well at phone size, and whether the intro length feels right.

- _Session 8 — 2026-09-29:_ Owner feedback round (a mat in every room, a cheap-looking identical cleaning effect, the interview after the first stop, rival owners, a messy title screen, lifeless NPCs). Cabins get a plain layered mat that improves with each refit; every guest leaves their own mess (17 pieces across six archetype pools, three unmade beds) that the conductor sweeps up with a broom, piece by piece, for a clear before/after. The Gazette interviews you right after the first stop and quotes your answer on the front page; seven villain rival owners with drawn portraits taunt you in Rival Watch as their train becomes your target and grumble when passed. Title rebuilt in three fixed places with no world UI or sheets over it. NPCs sit and read, wave, sip, hug, wash, check watches, stamp tickets, sweep, and everyone leans with the train. 119 unit tests, smoke, the seven-size UI audit (now with the new title rules, Rival Watch and the Gazette interview) and the geometry audit (every mess piece and bed look staged; 0 flicker, 0 clipping) pass. Still not tested on a real phone. **Next:** owner plays on device; judge whether the Rival Watch frequency and the three-card debut (name, interview, front page) feel right.

- _Session 9 — 2026-09-29:_ Owner feedback round (a rushed tutorial, narrow off-centre doorways, a small unappealing mat, no visible rags-to-riches, imprecise movement, sounds cut off mid-way, quality first). Sound rebuilt on real samples (CC0 uisfx and Kenney from npm/GitHub, the train sounds rendered by our own script) through a compressor, voice limits that never cut a sound, fades on pause. Floors now carry the story: real broken planks, holes into the joists, splinters, warped boards and cobwebs at tier 0; the same spots patched with fresh boards at tier 1; polished oak, then walnut chevron; lobby doormat and rugs; the mat is gone. Doorways 1.4 m and centred with bi-parting doors. Tutorial lessons wait for the player to do each thing, praise it and rest; goals credit recent actions. Movement: stick curve, firmer braking, doorway funnel, footsteps and creaks. 120 unit tests, smoke, the seven-size UI audit and the geometry audit (0/0) pass. Still not tested on a real phone. **Next:** owner plays on device; judge the new sounds (never heard by me: checked by spectrogram only), the tier-0 floor on a small screen, and the tutorial pace.

- _Session 10 — 2026-09-29:_ Owner feedback round ("atrocious" music that felt like a glitch; session 9's effects, train sounds and footsteps tacky; the old effects far better). Cause: session 9 added a compressor and 3× louder sample clacks, so the whole mix, music included, pumped with every clack; its own rendered train/foot sounds replaced ones the owner liked. Effects restored to the exact session 8 synthesis (with voice limits that skip rather than cut, a peak limiter, fades on pause); footsteps and creaks removed. New music: an original jazz waltz for piano and strings rendered from real recordings (Salamander Grand Piano, tonejs-instruments, CC BY 3.0), 48 s seamless loop, checked for pitch, clashes, balance and the seam; `npm run audit:audio` records the real output. 120 unit tests, smoke, UI, geometry and audio audits pass; build 1484 KB. Follow-up the same day: the owner approved the effects but found the waltz spooky and asked for chill vibes like a YouTube track (unreachable from here, and not ours to embed), so the theme became an original sunny lo-fi groove (80 bpm, major-ninth piano chords, electric bass, soft acoustic kit, clean-guitar hook; CC BY 3.0 / CC0 recordings). **Next:** owner listens: judge the groove and its level; if they have a licensed track they prefer, drop it in (`assets/audio/music_theme.mp3` + `loopSeconds`).

**Start of each session:** read the Progress Log and Codebase map, confirm in a few lines where we are, then continue with the next step (one milestone or sub-step at a time).
