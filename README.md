# Night Express

Hybrid-casual arcade idle game: run a luxury sleeper train that grows carriage by carriage as it crosses the world.
TypeScript + Three.js, built into one self-contained HTML file that plays in the Claude app and in any phone
browser, portrait, one thumb. Design and working rules live in [`CLAUDE.md`](CLAUDE.md).

## Play

- **In the Claude app:** open the published artifact (link in the latest session notes). A loading screen covers the
  first few seconds (shaders compile, the sounds render and the first frames are drawn behind it, so play is smooth
  from the first second), then gives way by itself; the sound fades in quietly on the first touch (no prompt). A brand-new player then sees a short story intro, skippable.
- **The classic version** (before the session 12 lakeside, night look and carriage classes) is kept in
  [`archive/classic-v1/`](archive/classic-v1/README.md): a playable copy and the commit to return to.
- **Graphics:** Settings has Auto / Low / Medium / High / Ultra (one look on every tier; Low and Medium render
  straight to the screen with lighter per-vertex shading, Medium with a static train shadow; High and Ultra add
  bloom, softer following shadows and lake reflections). Phones start at Medium (Android phones at Low unless
  top-end: the same look with about a third fewer pixels), sharp (up to 1.5–1.75× pixels),
  held to about 60 fps; Auto trims the render scale a little (never below 80%) and otherwise drops a tier, holding
  a steady 30 fps on Low; add `?quality=low|medium|high|ultra` to the URL to force one (no dynamic resolution then).
- **Sound:** short, soft effects only (pops, clicks, marimba and bell notes, light whooshes), each on one step of a
  volume ladder with its own cooldown, rendered once at start-up and played back as recordings. No background music
  (`MUSIC_ENABLED` in `src/config/audio.ts`); a soft murmur of voices for atmosphere (fuller at stations), footsteps on
  the walk animation; the rail clack and wind are off (`AUDIO.clack`, `AUDIO.wind`). Settings has one Volume
  slider and the Sound switch as mute. On Android, vibration starts off (Settings turns it on) and the audio asks for
  larger buffers.
- **Progression (session 29):** help is earned: each helper's tile counts the work done by hand ("Tidy 5/6") before it
  takes money. Every new carriage is a surprise from a fixed order (`CARRIAGE_ORDER` in `src/config/content.ts`), rolling
  in under a tarp and unveiled once coupled.
- **Session 30:** new characters after the owner's reference sheets (`src/world/CharacterParts.ts`; preview them with
  `ENTRY=src/lineup.ts OUT=lineup.html node scripts/build.mjs`, then open `dist/lineup.html`). A slower, earned economy
  (`priceScale` in `src/config/economy.ts`), guests asking for more (`trip.again`, `extra` in `src/config/classes.ts`),
  tiny offline earnings, the Station Master's Chest (`chest`), and a refund for bags left behind (`luggage`).
- **Android test build (APK):** every push to the working branch builds a signed test APK on GitHub Actions
  (`.github/workflows/android-apk.yml`) and publishes it as a pre-release named `android-test-N` on the
  repository's Releases page. On the phone: download the `.apk`, open it, allow "install unknown apps" for the
  browser if asked, install. It is a release build (not debuggable, faster), signed with the same test key as
  every earlier build, so a new one installs over the old one and keeps the save.
- **iPhone and Android apps:** the same game, wrapped for the App Store and Google Play with Capacitor:
  `npm run app:ios` / `npm run app:android` (needs Xcode / Android Studio). Building, signing and submitting:
  [`NATIVE.md`](NATIVE.md).
- **Locally:** `npm install && npm run build`, then open `dist/index.html` in a browser. It works offline from
  disk; for a phone, serve the folder (`npx serve dist`) and open it on the same Wi-Fi, or copy the file over.
- **The opening:** a short story intro, then night on the Millbrook platform beside a train under a canvas tarp.
  Sell the travellers their tickets at the ticket stand (you serve from its outer side; they queue along the
  platform edge, so nobody gets in your way), spend the first fare on **Open carriage** (the ropes snap, the tarp
  slides off, the lights flicker on room by room, the blinds go up, the beds drop in, the doors open), and the
  guests walk in; about a minute later the train leaves. Every passenger buys a ticket at a station's stand and
  walks straight to a ready room (or waits in the lobby). Bags wait on a porter's barrow by the door.
- **One trip, one sleep:** each guest's ride is one night: one request in the evening, lights out once (the room
  dims, the blind comes down), one request in the morning, then off at their stop. Their room is tidied in one
  visit: you sweep up the litter, pick up what they left, and the bed is made.
- **Locked rooms** are covered with a padlocked lid and shut until bought; buying one plays a reveal (the padlock
  springs off, the lid lifts away, the lights come on, the furniture drops in).
- **Upgrades always in view:** every tile on show wears a floating label (icon, name, price); the ones you can
  afford, or that the guide points at, are the biggest.
- **People:** each kind of guest comes in a few looks and heights, and while they wait they check the time, look
  about, take a call, read or chat with whoever stands next to them; townsfolk on the platform wave the train off.
- **The venues:** from the first coupling you can add a **Café Car**, and as the train grows a **Dining Car**, a **Cinema Car**, a
  **Bar Lounge** and an **Observation Dome**. Guests resting in their cabins take outings to them: brew coffee for
  the café queue, cook and serve dinner and clear the tables, start the film at the projector when the seats have
  filled (every seat that watched pays its ticket) and bring popcorn, mix cocktails until the bar's bulbs light up
  for Happy Hour, show guests in under the dome's glass for the views. Each has its own tables, menus, staff and
  three refits (Repair, Makeover, Luxury), and every refit refurnishes the room: crates and makeshift furniture,
  then plain wood, then the venue's colours, then its grand look (the bar's green panelled counter and arched
  back-bar, the cinema's red velvet picture palace).
- **News:** the train's big moments (a new carriage, a venue opening, a refit, a new livery) arrive as a strip of
  newsprint, the Rail Gazette, at the foot of the screen; it pays on the spot and never pauses the game. The rivals
  (Rival Watch, their taunts and the league) are switched off for now (`RIVALS_ENABLED` in `src/config/press.ts`).
- **A clear screen:** one top row (the level star with the level in it, cash, gems, the conductor's upgrades, the
  menu), a slim route line with the Train Rating, a light train map down the left, and nothing else unless it
  matters now. No joystick is drawn: drag anywhere and the conductor walks.
- **Jobs like My Perfect Hotel:** nothing is drawn on the floor. While a job wants you, a blue badge with its icon
  floats over the thing it is about (the espresso machine, the urn, the desk, the shoes by a door, the bed of a room
  to tidy); stand close to it (no wall in between) and a green ring round the badge fills as you do it. A room's own
  jobs (tidy it, bring the guest their request, restock a washroom) work from anywhere in the room.
- **Everyone gets off at their stop:** whatever a guest is doing (a café queue, a table, a washroom), they leave the
  train at their stop. Anything they asked for and never got halves the tip they leave, and they go with a frown; a
  guest kept waiting at a venue for a minute gives up and goes back to their room.
- **Luggage:** the lobby's luggage rack holds the bags; its two upgrades (Bigger Rack, Grand Rack) lengthen it
  along the wall and make it brass, three more bags each.
- **Train Rating:** a star and a number at the head of the route line. Each stop is scored (everyone with a bed boarded, the bags
  loaded, guests served in time) and the rating is the average of the last five, so it always recovers. A high
  rating brings more and richer travellers and bigger tips; a low one fewer and thinner. Travellers who had a bed
  but missed the train storm off and their fares are lost (shown on the result card).
- **The station clock:** big in the middle of the route line, yellow under 20 s and red under 10 s, ticking the
  last ten seconds, with a warning whistle at ten.
- **Golden Whistle:** keep the rating high for long enough (4.3★ over 8 stops, 4.6★ over 12, 4.8★ over 16) and you
  win an award at a ceremony of its own: spotlights, a trophy, a cheering crowd, confetti and its own music.
- **No ads, no purchases (for now):** one switch (`MONETIZATION_ENABLED` in `src/config/economy.ts`) turns every
  ad, offer and shop purchase off; the boosts are earned instead (hold the train at last call from level 3, roller
  skates and double fares for runs of clean stops, the scooter at level 6). Flip it back on to restore them.
- **Controls:** touch and drag anywhere (no joystick is drawn), read on screen: push up and the conductor walks
  straight up the screen, whatever the angle of the train (mouse drag, or WASD / arrow keys on desktop).
  Everything else is walk-over: come to a job and it acts.

## Develop

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/` into `dist/index.html` (full page) and `dist/night-express.html` (artifact fragment) |
| `npm run dev` | Same, rebuilding on every save |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (vitest): journey phases, ad policy, economy, the generated unlock chain and carriage choice, carriage classes (each class earns more per carriage), the flow (the opening buyable in order, when each feature joins), room doors (every leaf swings clear of furniture in every plan), the rides' lengths, comforts, station upgrades, the objective chain, chatter, save/migrations, walkable map and routes in every class floor plan, furniture and pad placement, the light bake, the lakeside terrain (a continuous shoreline, nothing in the track bed or the boat lane) |
| `npm run smoke` | Headless browser run: the autopilot plays the first 13 minutes and checks the §14 beats, the walkthrough, naming, the Gazette debut interview, a rival's taunt on the news strip and the press, a refurbishment, a station upgrade, the objective chain and comforts, that every pickup was needed, the ad rules, that a doorway shutting never traps the conductor, save/reload (unlocks and open cabins), draw calls and console errors |
| `npm run audit:ui` | Checks the boot (no title screen, no sheet over the intro; once it is skipped, no caption left and the game playing), stages the busiest HUD moments and every menu at seven phone sizes (320×568 to 430×932), then samples live play, and fails on any overlap, clipped text or off-screen element, or on too much text in play (more than 3 words on screen on average or 8 at once, cards excluded) |
| `npm run audit:geo` | Builds every carriage at every tier (passenger carriages in each class's own floor plan through the Royal Suite, with their class furniture; all comforts, full stock, every guest type's mess and unmade bed), the locomotive, rear deck, exterior and platform, and fails on (1) any visible coplanar overlap of different surfaces (flicker) and (2) any two objects, or an object and a wall, passing through each other (clipping). Both must report 0 |
| `npm run audit:audio` | Plays the built game with sound on, records the real output and fails if a reward cue does not ring out whole, a second reward plays over the first, the output clips, or audio logs an error; with the music on, also if the theme does not decode, the next pass is not queued exactly one loop apart or it goes silent once the theme is in (with it off, that no music plays and the effects carry on alone); writes the recording to `dist/audio-check.wav` |
| `npm run soak` | Plays a long accelerated session on the autopilot (`npm run soak -- 40 120`: minutes, seconds between samples) and fails on anything that grows without the train (heap, geometries, textures), a shader compiled mid-game, a material re-flagged every frame, or a broken budget (heap, draw calls, triangles, simulation time, page elements); writes `dist/soak.json` |
| `npm run check` | Typecheck + tests + build (the tests include the camera-visibility check for every tile and pad, and walking into every room) |
| `npm run app:sync` | Builds and copies the game into the iOS and Android projects (`app:ios` / `app:android` also open Xcode / Android Studio; `app:assets` redraws the app icon and launch screens) |

Tools in `scripts/` (need Chromium via Playwright, pre-installed in the cloud sessions):
`pacing.mjs [seconds] [shotDir]` prints the timeline, every purchase with the gap before it and the longest dry spells (try 3600 for a whole route); `ui-shots.mjs <dir>` screenshots
every screen; `FLOORPLAN_DIR=<dir> npx vitest run tests/placement.test.ts` writes an SVG floor plan of every carriage
with its furniture, pads and tiles; `shot.mjs` and `play.mjs` are quick visual checks. For art work,
`ENTRY=src/preview.ts OUT=preview.html node scripts/build.mjs` builds `dist/preview.html`, a static diorama of every
carriage, character and prop (`?t=0.82` time of day, `&z=` camera position, `&zoom=`, `&platform=1`, `&tier=0..5` or
`&tiers=0123` refurbishment tiers (passenger carriages 4 First Class, 5 Royal Suite), `&quality=` the graphics tier, `&level=` livery, `&name=` the locomotive's nameplate, `&sleeper=0` hides the sleeper, `&comforts=lamp,flowers,radio,soap,rail` dresses the rooms).

## Analytics (GameAnalytics)

The game reports to [GameAnalytics](https://www.gameanalytics.com/) through the official JS SDK (`gameanalytics` on npm).
Nothing is sent until the game's keys are set:

1. In GameAnalytics, open the game → Settings → Game information and copy the **Game key** and **Secret key**.
2. Either paste them into `GAME_KEY` / `SECRET_KEY` in `src/config/analytics.ts`, or (better, they stay out of the code)
   add them as GitHub repository secrets `GA_GAME_KEY` and `GA_SECRET_KEY` (the APK workflow passes them to the build),
   or set the same names as environment variables before `npm run build`.

What is sent: sessions (retention, session length, new and returning users are computed by GameAnalytics), the
first-session funnel as design events `FTUE:01_first_ticket`, `FTUE:02_first_cash`, … with the second each happened,
progression events for every route level and every carriage, every station result (stars, boarded, missed, earned,
the Train Rating), unlocks, hires, objectives, the daily chest, calendar and quests, settings changes, frame rate every
5 minutes, uncaught errors, and every source and sink of Fares, Gems and Rail Miles as resource events. Every event
carries three custom dimensions: route level (L1–L8), carriages (C1–C9) and graphics tier. The mapping is
`src/services/gaMapping.ts` (pure, tested by `tests/gameanalytics.test.ts`); the build string is `ANALYTICS.build`
(raise it with each release). Automated test browsers never send (`?ga=1` forces, `?ga=0` stops). The claude.ai
Artifact may block the requests; the Android app and phone browsers send.

## Developer tools

Open the game with `?dev=1` in the address, then Settings (gear) → **Open developer tools** (session 30: there is no switch for them in Settings any more): skip to the next station, set the time of
day, fund the next tile, **Creative Mode** (hides the UI and grants cash for recording ad footage), camera zoom,
mock-service switches (ads no-fill, IAP failure, clear purchases) and the latest analytics events.
**Live stats** (in Developer tools, or `?perf=1` on the page) shows fps, frame times and hitches, draw calls, triangles, heap, GPU resources, people, pools and the seconds the conductor had nothing to do.
`window.nightExpress` exposes the game object in the browser console.

## Where to tune things

| What | File |
|---|---|
| Every number: journey timers, how much mess a guest leaves, the train's lean, stick response, braking and doorway assist, speeds, capacities, fares, tips, refurbishment and comfort bonuses, Rush streak window and bonus, stride and quick-travel speed, camera framing, soft-cue thresholds and chatter rate, fast-service bonus, pickup dwell, cash magnet reach, level thresholds, ad rules, offers, offline earnings, conductor upgrades | `src/config/economy.ts` |
| The camera (train angle, tilt, lens, framing, stick snapping), the graphics tiers and dynamic resolution, and the night look (moon, sky, the baked lamp and window light (`night.light`), window glass, glow, fog, bloom, grade) | `src/config/visuals.ts` |
| The order carriages join the train (a surprise each time), the coupling prices; what each helper asks to have done by hand first (`work`), the station bell (`bell` in `economy.ts`) | `CARRIAGE_ORDER`, `COUPLE_SLOTS` and the hire tiles' `work` in `src/config/content.ts`; `bell` and `flow.features.bell` in `src/config/economy.ts` |
| Carriage classes (Basic to Royal Suite): liveries, chip colours, fare/tip/star multipliers, what each class asks for | `src/config/classes.ts` (class refit prices and level gates in `CARRIAGE_CATALOGUE`, aspirants and turndown in `economy.ts`, rooms per class in `LOBBY_ROOMS`/`SLEEPER_ROOMS` in `src/world/layout.ts`) |
| The objective chain (goals, rewards) | `src/config/objectives.ts` |
| The flow: the opening's purchases in order (`flow.openingTiles`: one on show at a time), the boarding at Millbrook that opens the game (`flow.prologue`: travellers waiting on the platform, how soon they step aboard, the last call), when each later feature joins (`flow.features`: bags, the platform crowd, reactions, Rush, class badges, the next-carriage plate, offers, the station workshop, a second tile, the goal chain) and the camera glide to something new (`flow.reveal`); the gap between coach lessons | `src/config/economy.ts` (`flow`), `src/config/coach.ts` (`COACH_LESSON_GAP_SECONDS`) |
| Frame pacing (`maxFps`), dynamic resolution, the tier drop and 30 fps hold, lite shading and shadow mode per tier | `src/config/visuals.ts` (`quality`) |
| The app shell (app id, colours, launch screen, status bar) | `capacitor.config.ts`; native code in `ios/` and `android/` |
| Music on or off (`MUSIC_ENABLED`), each sound's step on the volume ladder, cooldown and voices (`cues`, `ladder`), pitch and level variation, the cash streak, footsteps, wind and clack levels, the first-touch fade, Android's audio buffers (`latency`); the sound mix: bus levels (music, effects, ambience), the safety limiter, overlap limits, how celebrations and rewards ring out and keep the stage (the theme ducks under them; never two at once), the music's night filter | `src/config/audio.ts` |
| The music (score: chords, melody, bass, drums) | `scripts/audio/build_music.py` renders `assets/audio/music_theme.mp3` from real piano, bass, guitar and drum recordings (credits in `assets/audio/CREDITS.md`); to use another track, replace the MP3 and set `loopSeconds` in `src/audio/music.ts` |
| Floors by tier: broken planks and repairs, parquet, rugs | `src/world/Floors.ts` |
| The venue carriages: what each sells and for how much, how long it takes to make and to enjoy, the staff, refit price steps, menu multipliers, how often guests take outings, the café queue, the party meter and Happy Hour, scenic views and blankets, the cinema's films (length, ticket, popcorn, when the projectionist starts one) | `src/config/venues.ts` (their tiles and prices in `CARRIAGE_CATALOGUE`, `src/config/content.ts`; floor plans per refit tier in `buildCafe`/`buildDining`/`buildCinema`/`buildBar`/`buildDome`, `src/world/layout.ts`; furniture by tier in `src/world/VenueProps.ts`; wall colours in `VENUE_WALLS`, `src/world/CarriageView.ts`; carpets in `venueCarpets`, `src/world/Floors.ts`) |
| How passengers react (an icon per situation) | `src/config/chatter.ts` |
| Content: stations, guest archetypes (with what each leaves behind), the carriage catalogue (each type's tiles incl. comforts, prices, limits and chooser text), coupling slots, station upgrades (exterior and marketing, with their bonuses), refurbishment tiers, stories, quests, products | `src/config/content.ts` |
| The press: how it is paced (`PRESS_PACING`: one card per breather, the gap between cards, which news goes first), rival trains and their villainous owners (taunts, grumbles, portraits, the spoils each pays when overtaken), front-page headlines and rewards per trigger, the Gazette debut interview and Rails Tonight interviews with perks, Golden Whistle ceremonies, name suggestions | `src/config/press.ts` |
| Conductor outfits (earned and premium) and shoes by speed level | `src/config/wardrobe.ts` |
| Walkthrough steps and one-time hints | `src/config/coach.ts` |
| Jobs: how far from a job's spot, and from the thing its badge hangs over, you can do it | `src/config/economy.ts` (`zones.reach`, `zones.badgeReach`) |
| The furniture a job's badge hangs over, and its height | `src/world/layout.ts` (`SERVICE_PROP_HEIGHT`) |
| A guest who gets off short of something: the tip cut, and how long they must have waited to mind | `src/config/economy.ts` (`guests.unmetTipCut`, `unmetAfterSeconds`) |
| How long a guest waits at a venue before giving up | `src/config/venues.ts` (`VENUE_TUNING.patience`) |
| The lobby rack's upgrades (bags each adds) | `src/config/economy.ts` (`facilities.rackUpgradeCapacity`), tiles in `src/config/content.ts` (`rack_1`, `rack_2`) |
| Rivals on or off | `src/config/press.ts` (`RIVALS_ENABLED`) |
| The loading screen (how long it draws unseen frames, how long it waits for the sounds) | `src/main.ts` (`SETTLE_*`, `AUDIO_WAIT_MS`) |
| The station result card and the perfect streak (`money.perfectStreakStep`/`perfectStreakMax`), the camera's glance at missed travellers (`feedback.missedGlide`) | `src/config/economy.ts` |
| The desk: check-in time (`zones.checkInSeconds`) and the evening table booking (`desk`) | `src/config/economy.ts` |
| The night shift: shoes (`night`: polish time, tip), night owls (`trip.owl`), how spread out bedtimes are (`trip.jitter`), when the Attendant starts serving guests (`staff.attendantServesFromLevel`) | `src/config/economy.ts` |
| Monetization on or off (one switch), and the boosts earned while it is off | `src/config/economy.ts` (`MONETIZATION_ENABLED`, `perks`) |
| The Train Rating: how a stop is scored, how many stops it averages, what a low or high rating does to travellers, classes and tips | `src/config/economy.ts` (`rating`) |
| The station clock's yellow and red points, the ticking and the warning whistle | `src/config/economy.ts` (`journey.timer`) |
| Golden Whistle awards (rating needed, over how many stops, rewards) | `src/config/press.ts` (`GOLDEN_WHISTLES`) |
| Rival Watch (rivals' reputations, the spoils each pays), and the dares (off: `RIVAL_DARES_ENABLED`) | `src/config/press.ts` |
| The minibar comfort (stock per room, how often a guest buys a snack, its price) | `src/config/economy.ts` (`minibar`) |
| Job badge size and height | `src/config/visuals.ts` (`pads`) |
| How far the theme ducks under a reward jingle and how fast it comes back; how long a second jingle may wait | `src/config/audio.ts` (`musicDuck`, `celebration.queueWithin`) |
| The venues' own light (the café bright, the dining car low and warm, pooled on its tables) | `src/config/visuals.ts` (`night.light.venues`) |
| One trip, one sleep: when the evening ends and the morning starts, the shortest night, request delay, outing and washroom chances; each class's evening and morning requests | `src/config/economy.ts` (`trip`), `src/config/classes.ts` (`evening`, `morning`) |
| How guests differ (looks per type, skin tones, hair colours, heights) and what they do while waiting | `src/config/crowd.ts` |
| Where everything stands on a platform (ticket stand, queue, door, barrow, walkway, benches) | `src/world/platformLayout.ts` |
| The reveal of a covered room (lengths, lid lift, the lights' flicker, camera zoom) and of the first carriage (`reveal.carriage`: the tarp, the ropes, lights, blinds, furniture); the station start's arrivals, clock and hold cap | `src/config/economy.ts` (`reveal`, `flow.prologue`) |
| Carriage floor plans (passenger carriages: one per class, from six beds to one Royal Suite) | `src/world/layout.ts` |
| The lakeside: shoreline, ground height and colour (continuous functions, mirrored in the water shader), which set pieces pass and how they are dressed | `src/world/terrain.ts`, `src/world/Lakeside.ts` |
| Colours: liveries (earned and premium), each carriage's pastel identity and the class themes (`CLASS_THEMES`), tier names | `src/world/palette.ts`; the lakeside set pieces: `src/world/Lakeside.ts`; material recipes: `src/world/surfaces.ts`; what each refurbishment tier looks like: `finishFor` and `buildProp` in `src/world/CarriageView.ts` |
| UI colours and type | `src/ui/styles.css` (tokens at the top; Jost is embedded from `@fontsource-variable/jost`) |
| Remote-config overrides (mock) | `src/services/remoteConfig.ts` |

## Layout

```
src/
  core/       event bus, tweens, rng, math, logging, background work (rebuilds spread over frames, one shared per-frame budget)
  config/     economy.ts, content.ts, classes.ts, visuals.ts: all tunables and content packs
  sim/        pure logic, unit tested: Journey, AdPolicy, UnlockChain, Wallet, Progression, Walkable, NavGraph, TrainMap, meta, press
  save/       versioned JSON save (localStorage + backup + migrations)
  services/   ads, IAP, analytics, remote config: interfaces + mocks; native.ts (the iOS/Android app layer: saves, haptics, lifecycle)
  world/      Three.js: stage with quality tiers, dynamic resolution, shader warm-up and post-processing, the character batch (one draw for everyone), camera, lighting, the baked light map (lamp pools, window spill, contact shading), the lakeside (terrain, set pieces, water, reflections), ambient life, platform, carriages and class chips, train exterior, characters, conductor gear, particles, fireflies, the lobby cat, cash
  gameplay/   Game (composition root), player, zones, tiles, guests, staff, venues, station, train, guidance, coach, objectives, feedback, press, rush, meta, monetization, autopilot
  audio/      WebAudio: synthesised effects, the music loop, haptics
  ui/         DOM HUD, sheets, icons, styles
assets/audio/ the music (MP3) and its credits
tests/        vitest unit tests
scripts/      build, smoke, pacing, UI, geometry and audio audits, screenshots, the music renderer, native/assets.py (app icon, launch screens)
ios/ android/ the App Store and Google Play projects (Capacitor; see NATIVE.md)
```

The Unity M0 skeleton this project started from is in commit `864b131` if we move to a native engine later.
