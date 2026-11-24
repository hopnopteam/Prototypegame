# Visual overhaul, Phase V1: report

Branch `visual-overhaul` (from `claude/new-session-zlmzpt` 98facde, main merged in since). Switch: `?look=new`, or
Settings → five taps on the build line → Debug → "New look". The classic look is the default.
Play link (opens in the new look): https://claude.ai/artifact/9YoKmNwJmHWG5UsYgJrpdY · Android: release
`android-look-N` ("Night Express Look", `com.hopnop.nightexpress.look`).

**Status (24 Nov, second pass):** the owner's five priorities are done (§8), Route 1 is still byte-identical in the
pacing simulator, and the Riviera revamp has begun (docs/art/RIVIERA_REVAMP.md: stage 1 and the start of stage 2).

## 1. Audit

### A. Screenshot harness
`scripts/art-shots.mjs` (built on the store-shot helpers and the carriage tour's idea): fixed-camera phone-portrait
shots (1080×2340) of the real game via the debug jump: every carriage of both routes at lifecycle tiers 0–3 (wide and
close), every station on both routes with travellers, the locomotive, the HUD and 13 panels (level up, offline return,
shop, settings, menu, route map, next line, upgrades, daily, album, progress, goal, a station stop). 165 shots in
`docs/art/before/`. `slice` shots match the references' framing and size (768×1376) and go into before/after/reference
triptychs (`scripts/art-compare.py` → `docs/art/compare/`).
Limits: the debug jump cannot separate "Repaired" from tier 1 on passenger carriages; upgrade tiles that change a
carriage show in the tier shots (every tile on a jumped train is bought), not one by one.

### B. Asset inventory
`docs/art/ASSET_INVENTORY.md`: characters, carriage shells, props, station, locomotive, scenery, VFX, UI, with how
each is built, its states, triangles (exact for the 205 baked models) and priority.

### C. Render audit (classic look, measured by `scripts/art-perf.mjs`, 360×780 CSS px)
- Colour: sRGB output; one tone map on every tier (three's ACES fit plus our grade, installed as the renderer's custom
  tone mapping, so Low with no post matches High). Lights: hemisphere, one directional key (moon or sun), a shadowless
  fill; lamplight, window spill and contact shading baked into a top-down light texture (`lightBake.ts`, re-baked
  when the train changes). Shadows: off on every tier since session 38b (people have blob shadows). Materials: one
  shared PBR material per kind (vertex colours, a pattern shader, detail layers); Low and Medium shade per vertex
  ("lite"). Post: none on Low/Medium; bloom on High/Ultra; no MSAA, no SSAO.

| Scene | Tier | Draws | Triangles | Textures (MB) | Geometry (MB) | JS heap (MB) |
|---|---|---|---|---|---|---|
| Millbrook station | Low / Med / High | 44 / 45 / 74 | 151k / 151k / 164k | 7.2 / 7.2 / 8.6 | 39 | 93 |
| Sleeper train, 3 cars | Low / Med / High | 42 / 42 / 70 | 178k / 178k / 187k | 15 / 15 / 16 | 72 | 133–141 |
| Riviera, 8 cars | Low / Med / High | 51 / 51 / 80 | 345k / 345k / 360k | 18 / 18 / 20 | 127 | 202 |

Frame rate: not measurable here. Headless Chromium renders on the CPU (SwiftShader, 1–5 s a frame under load), so frame
times only rank looks against each other on the same machine. The phone's own numbers come from the Look APK
(`?perf=1` overlay in a browser).

### D. Why the classic look reads flat (specific causes)
1. **Golden hour, not night, in the opening:** Route 1 opens at golden hour and fades to night over 150 s, so first
   impressions (and refs 1 and 3's setting) are a beige daylight wash with no lamp pools at all.
2. **Ambient too strong for the lamps:** hemisphere 1.55 + fill 0.95 against lamps at 1.7: every surface sits at one
   mid-tone, so a pool is a few percent brighter than the floor around it.
3. **Bloom only on High/Ultra:** phones never see a lamp glow; the bulbs are flat dots.
4. **Vertex colour with weak detail:** walls, caps and most furniture are flat colours; floors carry photo grain at low
   strength; nothing has a bevel, so no edge catches light.
5. **Shadow maps off everywhere and the static train shadow's redraw hook missing** (`CarriageView.shadowEpoch` had no
   reader since session 38b), so even when shadows are enabled the map is stale or empty.
6. **Platform deck:** a pale sandstone photo layer with uniform tone; no joints, no wet sheen.

## 2. Art bible
`docs/art/ART_BIBLE.md` (palette sampled from the refs by k-means, materials, lighting, characters, post, UI, fonts).

## 3. What V1 built (all behind `?look=new`)
- Renderer: route presets (Countryside held at night, Riviera held at golden hour with a low sun), darker blue-violet
  ambient, stronger lamp pools and contact shading in the bake, bloom from Medium, a firmer grade, ACES kept (why: bible).
- Static sun/moon shadow from Medium (the missing redraw hook restored); following shadow on High.
- Bevelled boxes (≥ 12 cm sides now; it was 4.5 cm, see §5), chunky wall caps, painted-panel lower walls.
- Station: slate flagstones with bevelled joints (a drawn texture), polished wet stone, each lamp's reflection streak.
- Every model's own Cycles-baked AO (`art/blender/bake_prop_ao.py`, Blender 5.0.1 as `bpy`, 205 models in about 10 s).
- Figures: a soft warm rim and a little more own light. UI: enamel gloss on the pins, navy-glass pills with a gold
  rim, yellow enamel tabs, Fredoka for numbers and titles.

## 4. Proof: gameplay identical
The pacing simulator (deterministic since Phase 4b), 2 average seeds per route, baseline on 98facde vs the new look
(`LOOK=new`, frozen build): **all eight files byte-identical** (`docs/art/baseline/` vs `docs/art/after-pacing/`:
countryside s1/s2 log+csv, riviera s1/s2 log+csv). Route complete: Countryside 161.8 min (159.2/164.4), Riviera 228.6
(222.7/234.5); same purchase order, same stop lengths. Tests: 595 pass. Geometry audit: 0 coplanar, 0 clipping in both
looks (one bunk valance moved 1 cm in the new look only).

## 5. Performance of the new look (same scenes; measured before the bevel was narrowed)

| Scene | Tier | Draws | Triangles | Textures (MB) |
|---|---|---|---|---|
| Station | Low / Med / High | 47 / 60 / 93 | 239k / 239k / 355k | 7.3 / 7.3 / 8.6 |
| Sleeper | Low / Med / High | 44 / 58 / 97 | 295k / 307k / 523k | 18 / 19 / 16 |
| Riviera | Low / Med / High | 52 / 66 / 108 | 462k / 473k / 831k | 18 / 20 / 20 |

- Draw calls stay well under 150 on every tier (+3 Low, +15 Medium for bloom and the shadow pass).
- **Triangles were over budget**: the bevel on every box ≥ 4.5 cm multiplied small boxes ×9. Now only boxes ≥ 12 cm get
  it; to be re-measured. High's following shadow draws the train twice (the 523k–831k), which is why it stays High-only.
- Texture memory +0.1–2.7 MB (the three drawn detail layers, the prop AO bytes are in geometry).
- Download: +292 KB (8.43 → 8.72 MB: detail layers 0.6 MB, prop AO 0.11 MB, Fredoka 0.03 MB as base64).
- Budget proposal: Low ≤ 150 draws, ≤ 250k triangles in view, ≤ 64 MB textures; Medium ≤ 150 / 350k / 96 MB; High ≤
  200 / 700k / 128 MB. Enforced by extending `npm run soak` (not done yet).

## 6. Gap list (against the refs) and what closing each costs

| Gap | Fix | Cost |
|---|---|---|
| Floors: planks lack strong grain and per-plank tone; carpets read flat | drawn plank and runner layers like the flagstone one; per-plank tone from the floor builder at higher contrast | 1 session |
| Lamp pools weak (the bake is a texture, but it fades by height and the night ambient still fills) | stronger, tighter pools + additive pool decals per lamp; the ticket stand's lamp into the bake | 0.5 session |
| Value contrast: the station too blue-violet, the Riviera an orange tint | regrade: neutral darks, warm only in light; Riviera whites and deep wood | 0.5 session |
| Riviera sun streaks through windows; blob shadow under everyone on every tier | window-shaped light decals from the sun direction; check blob shadows on every tier | 0.5 session |
| Outside: lush grass and flowers, sparkling sea (Riviera); darker night countryside | instanced grass tufts and flowers, sea sparkle; darker night terrain | 1 session |
| Characters: same figures (rim light only) | sculpted heads and hands, retargeted rig (graphics-experiment's Blender conductor as a start) | 2–3 sessions |
| Static shadow inside carriages on Medium reads faint | tune strength and bias | small |
| Pins/background contrast check | automatic contrast test on the compare shots | small |

## 7. Estimate for the full overhaul (after the look is approved)
- A (always on screen): the 9 carriage types × 4 tiers per route (shared kit), station, locomotive, characters, HUD:
  6–8 sessions.
- B (often): venue props, station shops, scenery kits, panels: 4–5 sessions.
- C (rare): events, critic, ceremonies, postcards: 1–2 sessions.
- The Riviera revamp the owner asked for (new carriage line-up and upgrade lines, tropical kit, station): 4–6 sessions
  on its own, plus a new pacing pass (it changes Route 2's gameplay on purpose).

## 8. Second pass (owner's review, 24 Nov)
1. **Floors:** drawn wood grain with knots along every board (`plank`, `plankWorn` layers, art/textures/build_stylized.py)
   and five board tones a tier; plush runners and carpets (`fabric`); station flags with a wide tone spread, a stone
   speckle and dark wet patches. The new look swaps the layers centrally (`LOOK_DETAIL_SWAP`).
2. **Lamp pools:** a warm pool decal under every platform lamp (additive, can only add light) on top of the bake, and a
   brass desk lamp with its own pool on the ticket counter.
3. **Value contrast:** a darker, less blue night (moon 0.95, hemisphere 0.62), warm lamps stronger, saturation 1.08.
4. **Riviera sun:** every window on the sun's side throws a slanted warm patch on the floor, stopped by the first wall.
   People keep their blob shadow on every tier.
5. **Outside:** long-grass tufts and more flowers over every stretch, greener grass; the Riviera's sea sparkles in the sun.
- **The end of the train:** the rear deck stays on a finished train, with deck chairs and plants (palms on the coast).
- **Phone glitch (Look APK):** phones in the new look draw no post-processing and no per-frame shadow (bloom and the
  following shadow were the only things the Look APK did differently); to confirm on the device.
- **Proof:** Route 1 pacing, 2 seeds, log and csv byte-identical to the baseline. 595 tests; geometry audit 0/0 on
  Route 1 in both looks; on the Riviera 0 clipping and **3 coplanar faces in the Seafood Diner (a chair seat, tiers 1–3),
  new with the revamp's carriage order: to fix next.**
- **Riviera revamp so far:** the owner's line-up (Lobby, Smoothie Bar, Pool, Beach Lounge, Sleeper, Diner, Spa, Kids,
  Honeymoon), Driftwood → Bamboo → Tiki Paradise on every carriage (no Royal Suites), upgrades shifted with each
  carriage's new place; a Blender-modelled tropical kit of 15 pieces (art/blender/tropical_kit.py); thatched eaves,
  leis over the windows and tiki torches on the platforms. Next: furnish each carriage per tier with the kit (the
  Beach Lounge's loungers and big windows first), the station, back rooms, then a Route 2 pacing pass.
