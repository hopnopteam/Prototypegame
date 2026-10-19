# EXOFORGE: progress log

Where the build stands, milestone by milestone (SPEC A12). Newest entries at the bottom.

## Where things are

- **Code:** `exoforge/` in the `hopnopteam/Prototypegame` repository, branch `claude/new-session-c5snqn`. It is a
  separate game with its own package; the Night Express files around it are untouched. The repo could not be
  created from the session (GitHub refused it), so it lives here until it gets its own repository; `git subtree
  split --prefix=exoforge` will move it with its history.
- **Play link (phone):** https://claude.ai/artifact/Lj6VWjbBSKzCRTBymD3cbX (private to the owner; republish
  `dist-play/exoforge.html` to the same link: `npx vite build --outDir dist-play && npx tsx tools/artifact.ts dist-play`).
  The cloud build environment cannot serve a phone over Wi-Fi, so each milestone is published as one self-contained page.
- **Style references:** `art/references/` (not committed: third-party art in a public repo; see its README).

## Commands (run in `exoforge/`)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on the network (`--host`) |
| `npm run build` | Typecheck, then one self-contained `dist/index.html` |
| `npm test` | Unit tests: heat, damage, tilt response, rest and patch, crash, chunks, determinism, tunnelling |
| `npm run play` | Plays the build on a 390×844 touch phone with real touch input; fails on any broken check or console error |
| `npm run shots` | Screenshots of every screen and moment at 3× plus 8-frame motion strips, into `qa/shots/` |
| `npm run perf` | 15 s of flying with the CPU throttled 4×: CPU frame and sim cost, draw calls |
| `npm run chunks` | The chunk editor (draw and check course chunks; saves into `src/content/chunks/`) |
| `npm run art:placeholders` | Placeholders for every manifest entry, into `art/placeholders/` |
| `npm run artifact` | Build plus the page published as the play link (`dist/exoforge.html`) |

## Milestone 1: flight feel in greybox

**Built (2026-10-19):**
- Vite 8, TypeScript 5.9 strict, PixiJS 8.22, Rapier 2D 0.21 (the deterministic build), vitest, Playwright.
- `src/sim` (pure, no Pixi or DOM, runs in Node): the suit as one body (capsule torso, two box legs, mass and centre
  of mass from `balance.ts`), boot thrust in g with a 0.15 s build and 0.1 s fade, a PD gyro clamped to its torque,
  linear plus quadratic drag, heat with the 1.5 s sputter, battery, impacts from contact force events (approach
  speed along the contact normal) into plates, rest on authored ledges (cooling ×3, the drone patches one plate
  once per ledge), a get-up push for a suit lying on the ground, the ragdoll (9 jointed pieces, 3 plates flying
  off), the drone's tow, the exit, and a safety net for a suit leaving the course.
- Three World 1 chunks (Launch Shaft, The Overhang, The Squeeze), made in the chunk editor, validated and joined
  seam to seam.
- Greybox presentation from the asset manifest: terrain filled with a tiling texture plus edge strips on the
  collision line, the cutout suit rig (the same body plan as the ragdoll), three-layer flames, dust, steam, smoke,
  sparks, dents, a white impact flash, screen shake (trauma²), a critically damped camera, two parallax layers, the
  drone, an HTML HUD (rolling height, plates, callsign, course bar, heat and battery dials, pause), Results with a
  count-up and confetti on a new best, and a Workshop stub with FLY!.
- Debug panel (D, or three taps top-left): slow motion, invulnerable, infinite battery, no heat, physics vectors,
  guides and chunk bounds, chunk jumps, and a live slider for every flight number with "Copy values".

**Feel numbers measured (bare Scrap Rig, `BARE_FRAME`):**
- Full burst from the launch ledge: sputters at 2.6 s, apex 6.0 m. Ledges are about 4–4.8 m apart in chunks 1–2;
  chunk 3 has a 6.9 m climb that the bare frame cannot make: it is where the first upgrades (Milestone 3) matter.
- Tilt to the full 40°: 0.56 s with 9% overshoot on the bare frame (wobbly); 0.35 s with 7% on `MID_GYRO` (the
  spec's feel target, unit-tested).
- At full tilt the bare frame sinks (1.18 × cos 40° < 1 g), so steering costs height: small tilts climb, big tilts
  dash sideways (up to about 6 m/s).
- Armor: impacts above 7.5 m/s cost 0.3 plate per m/s over. A missed hop (falling about 6 m, 10.8 m/s) costs about
  one plate of three; falling most of a chunk crashes. (First tried 6 m/s and 0.35: two 8 m drops wrecked the suit.)

**Decisions made:**
- The bare frame (before any part is built) flies on weak built-in burners, so run 1 is playable; level 1 of a
  slot attaches the painted part.
- Rest counts only on authored ledges (the chunk JSON marks them), so rests are a designed part of each chunk.
- A crashed suit's body is disabled, not removed, so nothing reading it can fail.
- A suit tipped past 55° on the ground pushes itself back up after 0.25 s (otherwise a fallen bare frame could
  never stand again).
- Floating finger anchor: past a full tilt the touch-down point follows the finger, so easing back straightens at once.

**Checks:** `npm run build` exits 0; 34 unit tests; `npm run play` 23/23 touch checks, no console errors;
`npm run shots` (every screen at 390×844 3×, plus 360×780 and 430×932, five motion strips); `npm run perf` with the
CPU throttled 4×: about 6 ms of CPU per frame (budget 16.7), 0.3 ms per simulation step, at most 8 draw calls.
Frame rate itself cannot be judged here (a software renderer draws about 4 frames a second at 2× pixels), so 60 fps
waits for the owner's phone. Known one-off: about 90 ms (350 ms at 4× throttle) on the first frame after FLY! while
the course is built; every texture is uploaded during loading so effects never hitch the first time.

**Bugs found by the checks and fixed:** a crashed suit's removed body was still read (a wasm "unreachable" crash);
a fallen suit could never stand up; particles born late in a frame drew once at their texture's pixel size in
metres (a full-screen flash of dust at every liftoff); a texture's first use hitched (now warmed at boot); the full, cracked and lost plate icons were all drawn as the same
teal box (a placeholder rule matched the HUD icons too); the Results card and count-up were judged before they had
played on the slow test renderer.

**Open visual issues:** none scored: every screen still uses placeholders, which the spec never scores
(Part B §12.6). The Visual QA starts with the style frame in Milestone 2.

**Next:** the owner plays the flight on a phone and gives feel feedback; iterate on the feel before Milestone 2.

Ideas backlog: a rough thruster roar and overheat cough would make the feel easier to judge (audio is Milestone 6).
