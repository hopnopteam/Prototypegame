# Night Express

Hybrid-casual arcade idle game: run a luxury sleeper train that grows carriage by carriage as it crosses the world.
TypeScript + Three.js, built into one self-contained HTML file that plays in the Claude app and in any phone
browser, portrait, one thumb. Design and working rules live in [`CLAUDE.md`](CLAUDE.md).

## Play

- **In the Claude app:** open the published artifact (link in the latest session notes).
- **Locally:** `npm install && npm run build`, then open `dist/index.html` in a browser. It works offline from
  disk; for a phone, serve the folder (`npx serve dist`) and open it on the same Wi-Fi, or copy the file over.
- **Controls:** touch and drag anywhere for the floating joystick (mouse drag, or WASD / arrow keys on desktop).
  Everything else is walk-over: stand in a zone and it acts.

## Develop

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/` into `dist/index.html` (full page) and `dist/night-express.html` (artifact fragment) |
| `npm run dev` | Same, rebuilding on every save |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (vitest): journey phases, ad policy, economy, the generated unlock chain and carriage choice, station upgrades, save/migrations, walkable map, furniture and pad placement |
| `npm run smoke` | Headless browser run: the autopilot plays the first 13 minutes and checks the §14 beats, the walkthrough, naming and press, a refurbishment, a station upgrade, that every pickup was needed, the ad rules, save/reload, draw calls and console errors |
| `npm run audit:ui` | Stages the busiest HUD moments and every menu at seven phone sizes (320×568 to 430×932), then samples live play, and fails on any overlap, clipped text or off-screen element |
| `npm run check` | Typecheck + tests + build |

Tools in `scripts/` (need Chromium via Playwright, pre-installed in the cloud sessions):
`pacing.mjs [seconds] [shotDir]` prints the first-session timeline for tuning; `ui-shots.mjs <dir>` screenshots
every screen; `FLOORPLAN_DIR=<dir> npx vitest run tests/placement.test.ts` writes an SVG floor plan of every carriage
with its furniture, pads and tiles; `shot.mjs` and `play.mjs` are quick visual checks. For art work,
`ENTRY=src/preview.ts OUT=preview.html node scripts/build.mjs` builds `dist/preview.html`, a static diorama of every
carriage, character and prop (`?t=0.82` time of day, `&z=` camera position, `&zoom=`, `&platform=1`, `&tier=0..3` or
`&tiers=0123` refurbishment tiers, `&level=` livery, `&name=` the locomotive's nameplate, `&sleeper=0` hides the sleeper).

## Developer tools

Settings (gear) → **Developer tools** on → **Open developer tools**: skip to the next station, set the time of
day, fund the next tile, **Creative Mode** (hides the UI and grants cash for recording ad footage), camera zoom,
mock-service switches (ads no-fill, IAP failure, clear purchases) and the latest analytics events.
`window.nightExpress` exposes the game object in the browser console.

## Where to tune things

| What | File |
|---|---|
| Every number: journey timers, speeds, capacities, fares, tips, refurbishment bonuses, Rush streak window and bonus, quick-travel speed, fast-service bonus, pickup dwell, cash magnet reach, level thresholds, ad rules, offers, offline earnings, conductor upgrades | `src/config/economy.ts` |
| Content: stations, guest archetypes, the carriage catalogue (each type's tiles, limits and chooser text), coupling slots, station upgrades (exterior and marketing, with their bonuses), refurbishment tiers, stories, quests, products | `src/config/content.ts` |
| The press: rival trains, front-page headlines and rewards per trigger, Rails Tonight interviews and perks, Golden Whistle ceremonies, name suggestions | `src/config/press.ts` |
| Conductor outfits (earned and premium) and shoes by speed level | `src/config/wardrobe.ts` |
| Walkthrough steps and one-time hints | `src/config/coach.ts` |
| Carriage floor plans | `src/world/layout.ts` |
| Colours: liveries (earned and premium), each carriage's pastel identity, tier names, countryside | `src/world/palette.ts`; what each refurbishment tier looks like: `finishFor` and `buildProp` in `src/world/CarriageView.ts` |
| UI colours and type | `src/ui/styles.css` (tokens at the top; Jost is embedded from `@fontsource-variable/jost`) |
| Remote-config overrides (mock) | `src/services/remoteConfig.ts` |

## Layout

```
src/
  core/       event bus, tweens, rng, math, logging
  config/     economy.ts and content.ts: all tunables and content packs
  sim/        pure logic, unit tested: Journey, AdPolicy, UnlockChain, Wallet, Progression, Walkable, NavGraph, TrainMap, meta, press
  save/       versioned JSON save (localStorage + backup + migrations)
  services/   ads, IAP, analytics, remote config: interfaces + mocks
  world/      Three.js: stage, camera, lighting, scenery, ambient life, platform, carriages, train exterior, characters, conductor gear, particles, cash
  gameplay/   Game (composition root), player, zones, tiles, guests, staff, station, train, guidance, coach, press, rush, meta, monetization, autopilot
  audio/      WebAudio synth sfx + music, haptics
  ui/         DOM HUD, sheets, icons, styles
tests/        vitest unit tests
scripts/      build, smoke, pacing, screenshots
```

The Unity M0 skeleton this project started from is in commit `864b131` if we move to a native engine later.
