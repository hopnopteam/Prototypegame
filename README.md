# Night Express

Hybrid-casual arcade idle game: run a luxury sleeper train that grows carriage by carriage as it crosses the world.
TypeScript + Three.js, built into one self-contained HTML file that plays in the Claude app and in any phone
browser, portrait, one thumb. Design and working rules live in [`CLAUDE.md`](CLAUDE.md).

## Play

- **In the Claude app:** open the published artifact (link in the latest session notes). It boots straight into
  play (no title screen; a brand-new player sees a short story intro first, skippable).
- **The classic version** (before the session 12 lakeside, night look and carriage classes) is kept in
  [`archive/classic-v1/`](archive/classic-v1/README.md): a playable copy and the commit to return to.
- **Graphics:** Settings has Auto / Low / Medium / High / Ultra (one look on every tier; Low and Medium render
  straight to the screen with lighter per-vertex shading, Medium with a static train shadow; High and Ultra add
  bloom, softer following shadows and lake reflections). Phones start at Medium, sharp (up to 1.5–1.75× pixels),
  held to about 60 fps; Auto trims the render scale a little (never below 80%) and otherwise drops a tier, holding
  a steady 30 fps on Low; add `?quality=low|medium|high|ultra` to the URL to force one (no dynamic resolution then).
- **Sound:** the music starts on the first tap (phones count a tap's release, not its press, as permission).
- **Android test build (APK):** every push to the working branch builds a signed test APK on GitHub Actions
  (`.github/workflows/android-apk.yml`) and publishes it as a pre-release named `android-test-N` on the
  repository's Releases page. On the phone: download the `.apk`, open it, allow "install unknown apps" for the
  browser if asked, install. Each build is signed with the same test key, so a new one installs over the old one
  and keeps the save.
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
- **The venues:** from the third carriage on you can add a **Café Car**, a **Dining Car**, a **Cinema Car**, a
  **Bar Lounge** and an **Observation Dome**. Guests resting in their cabins take outings to them: brew coffee for
  the café queue, cook and serve dinner and clear the tables, start the film at the projector when the seats have
  filled (every seat that watched pays its ticket) and bring popcorn, mix cocktails until the bar's bulbs light up
  for Happy Hour, show guests in under the dome's glass for the views. Each has its own tables, menus, staff and
  three refits (Repair, Makeover, Luxury), and every refit refurnishes the room: crates and makeshift furniture,
  then plain wood, then the venue's colours, then its grand look (the bar's green panelled counter and arched
  back-bar, the cinema's red velvet picture palace).
- **News and rivals:** big moments arrive as a strip of newsprint at the foot of the screen (it pays on the spot
  and never pauses the game). Rivals are news too: the next rival's taunt, and the moment you pass one (with what
  you win), each with a short league list (who is ahead, you, who is behind). The full table is in the menu.
- **Controls:** touch and drag anywhere for the floating joystick, read on screen: push up and the conductor walks
  straight up the screen, whatever the angle of the train (mouse drag, or WASD / arrow keys on desktop).
  Everything else is walk-over: stand in a zone and it acts.

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
| `npm run audit:audio` | Plays the built game with sound on, records the real output and fails if the theme does not decode, the next pass of the music is not queued exactly one loop apart, the output clips, goes silent once the theme is in, or audio logs an error; writes the recording to `dist/audio-check.wav` |
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

## Developer tools

Settings (gear) → **Developer tools** on → **Open developer tools**: skip to the next station, set the time of
day, fund the next tile, **Creative Mode** (hides the UI and grants cash for recording ad footage), camera zoom,
mock-service switches (ads no-fill, IAP failure, clear purchases) and the latest analytics events.
**Live stats** (in Developer tools, or `?perf=1` on the page) shows fps, frame times and hitches, draw calls, triangles, heap, GPU resources, people, pools and the seconds the conductor had nothing to do.
`window.nightExpress` exposes the game object in the browser console.

## Where to tune things

| What | File |
|---|---|
| Every number: journey timers, how much mess a guest leaves, the train's lean, stick response, braking and doorway assist, speeds, capacities, fares, tips, refurbishment and comfort bonuses, Rush streak window and bonus, stride and quick-travel speed, camera framing, soft-cue thresholds and chatter rate, fast-service bonus, pickup dwell, cash magnet reach, level thresholds, ad rules, offers, offline earnings, conductor upgrades | `src/config/economy.ts` |
| The camera (train angle, tilt, lens, framing, stick snapping), the graphics tiers and dynamic resolution, and the night look (moon, sky, the baked lamp and window light (`night.light`), window glass, glow, fog, bloom, grade) | `src/config/visuals.ts` |
| Carriage classes (Basic to Royal Suite): liveries, chip colours, fare/tip/star multipliers, what each class asks for | `src/config/classes.ts` (class refit prices and level gates in `CARRIAGE_CATALOGUE`, aspirants and turndown in `economy.ts`, rooms per class in `LOBBY_ROOMS`/`SLEEPER_ROOMS` in `src/world/layout.ts`) |
| The objective chain (goals, rewards) | `src/config/objectives.ts` |
| The flow: the opening's purchases in order (`flow.openingTiles`: one on show at a time), the boarding at Millbrook that opens the game (`flow.prologue`: travellers waiting on the platform, how soon they step aboard, the last call), when each later feature joins (`flow.features`: bags, the platform crowd, reactions, Rush, class badges, the next-carriage plate, offers, the station workshop, a second tile, the goal chain) and the camera glide to something new (`flow.reveal`); the gap between coach lessons | `src/config/economy.ts` (`flow`), `src/config/coach.ts` (`COACH_LESSON_GAP_SECONDS`) |
| Frame pacing (`maxFps`), dynamic resolution, the tier drop and 30 fps hold, lite shading and shadow mode per tier | `src/config/visuals.ts` (`quality`) |
| The app shell (app id, colours, launch screen, status bar) | `capacitor.config.ts`; native code in `ios/` and `android/` |
| The sound mix: bus levels (music, effects, ambience), the safety limiter, overlap limits, how celebrations ring out and keep the stage, the music's night filter | `src/config/audio.ts` |
| The music (score: chords, melody, bass, drums) | `scripts/audio/build_music.py` renders `assets/audio/music_theme.mp3` from real piano, bass, guitar and drum recordings (credits in `assets/audio/CREDITS.md`); to use another track, replace the MP3 and set `loopSeconds` in `src/audio/music.ts` |
| Floors by tier: broken planks and repairs, parquet, rugs | `src/world/Floors.ts` |
| The venue carriages: what each sells and for how much, how long it takes to make and to enjoy, the staff, refit price steps, menu multipliers, how often guests take outings, the café queue, the party meter and Happy Hour, scenic views and blankets, the cinema's films (length, ticket, popcorn, when the projectionist starts one) | `src/config/venues.ts` (their tiles and prices in `CARRIAGE_CATALOGUE`, `src/config/content.ts`; floor plans per refit tier in `buildCafe`/`buildDining`/`buildCinema`/`buildBar`/`buildDome`, `src/world/layout.ts`; furniture by tier in `src/world/VenueProps.ts`; wall colours in `VENUE_WALLS`, `src/world/CarriageView.ts`; carpets in `venueCarpets`, `src/world/Floors.ts`) |
| How passengers react (an icon per situation) | `src/config/chatter.ts` |
| Content: stations, guest archetypes (with what each leaves behind), the carriage catalogue (each type's tiles incl. comforts, prices, limits and chooser text), coupling slots, station upgrades (exterior and marketing, with their bonuses), refurbishment tiers, stories, quests, products | `src/config/content.ts` |
| The press: how it is paced (`PRESS_PACING`: one card per breather, the gap between cards, which news goes first), rival trains and their villainous owners (taunts, grumbles, portraits, the spoils each pays when overtaken), front-page headlines and rewards per trigger, the Gazette debut interview and Rails Tonight interviews with perks, Golden Whistle ceremonies, name suggestions | `src/config/press.ts` |
| Conductor outfits (earned and premium) and shoes by speed level | `src/config/wardrobe.ts` |
| Walkthrough steps and one-time hints | `src/config/coach.ts` |
| Pads: the colour for each kind of job (work, pick up, drop off) | `src/world/palette.ts` (`zoneWork`, `zonePickup`, `zoneDrop`) |
| The station result card and the perfect streak (`money.perfectStreakStep`/`perfectStreakMax`), the camera's glance at missed travellers (`feedback.missedGlide`) | `src/config/economy.ts` |
| The desk: check-in time (`zones.checkInSeconds`) and the evening table booking (`desk`) | `src/config/economy.ts` |
| The night shift: shoes (`night`: polish time, tip), night owls (`trip.owl`), how spread out bedtimes are (`trip.jitter`), when the Attendant starts serving guests (`staff.attendantServesFromLevel`) | `src/config/economy.ts` |
| The rival's dare: the dares (what is counted, target, stations), the prize, the win headline, each owner's gloat | `src/config/press.ts` (`RIVAL_DARES`, `DARE_REWARD`, `DARE_WON_HEADLINE`, `RIVALS[].owner.gloat`) |
| One trip, one sleep: when the evening ends and the morning starts, the shortest night, request delay, outing and washroom chances, the wake-up call; each class's evening and morning requests | `src/config/economy.ts` (`trip`), `src/config/classes.ts` (`evening`, `morning`) |
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
