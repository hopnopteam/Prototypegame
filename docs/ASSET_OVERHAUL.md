# Asset overhaul: from code-built art to real models (session 47)

Owner's request: keep the game and its art direction (a cosy moonlit sleeper train, a dollhouse
cut-away, warm lamplight, soft toy-like people), but replace the code-built props, characters and
scenery with the best free assets available, so the whole game looks finished. **Show the assets
first, then add them.**

## The backup
- Branch `legacy-version` on GitHub = build 68 exactly (commit `fea5e8d`), the last build before this
  change. If the overhaul does not work, work continues there. The build 68 APKs and the signed
  Google Play bundle stay on the releases page (`android-test-68`, `android-god-68`, `android-store-68`).

## Network
The original session's network could not reach any asset site. A personal environment
**"Prototypegame"** was created for this repository that allows: kenney.nl, quaternius.com,
poly.pizza, static.poly.pizza, polyhaven.com, api.polyhaven.com, dl.polyhaven.org, cdn.polyhaven.com,
ambientcg.com, opengameart.org, itch.io, img.itch.zone, kaylousberg.itch.io, quaternius.itch.io,
kenney.itch.io, drive.google.com, drive.usercontent.google.com, sketchfab.com, media.sketchfab.com,
freesound.org. raw.githubusercontent.com (KayKit's GitHub repos) is reachable everywhere.
Sketchfab downloads need the owner's login (an API token); Mixamo needs an Adobe login.

## Candidates found so far (to be verified on their own pages before use)
Licence first: CC0 only unless a CC-BY model is clearly worth an attribution line.

| Game area | Candidate | Licence | Notes |
|---|---|---|---|
| Locomotive, carriage shells | Kenney **Train Kit** (45 models: steam locomotives, passenger and freight cars, track; v1.0, July 2024) | CC0 | glTF; check scale and whether a carriage shell can take our cut-away interiors |
| Cabins, lobby, washrooms | Kenney **Furniture Kit** (140 models: beds, chairs, sofas, tables, bookcases, kitchen, bathroom) | CC0 | glTF |
| Cabins, lobby (alternative look) | KayKit **Furniture Bits** | CC0 (free tier; paid "Extra") | rounder, toy-like: closest to our figures |
| Café, dining car, galley | KayKit **Restaurant Bits** | CC0, pay what you want | kitchens, food, counters |
| Food on trays and tables | Kenney **Food Kit** (200 items and kitchen supplies) | CC0 | sandwich, croissant, tea, coffee, champagne |
| Lakeside, forests, farms | Quaternius **Stylized Nature MegaKit** (116 models: 40 trees, 35 plants and flowers, 27 rocks, grass, bushes; Ghibli-inspired) | CC0 | glTF; the strongest scenery candidate |
| Lakeside (fallback) | Kenney **Nature Kit**, Quaternius 150 Lowpoly Nature Models | CC0 | |
| Station forecourt, village | KayKit **City Builder Bits** (GitHub), Kenney **City Kit Suburban** | CC0 | |
| Platform props | KayKit **Prototype Bits** (GitHub) | CC0 | generic |
| People | Quaternius **Universal Base Characters** (6 bodies, 20 hairstyles) + **Universal Animation Library** 1 and 2 (120+ animations: walk, sit, sleep-like poses) | CC0 | glTF; would replace the code-built figures; needs outfits per archetype |
| People (alternative) | KayKit **Character Pack: Adventurers** + KayKit Character Animations | CC0 | fantasy outfits; style reference only |
| Floors, fabrics, marble, brass | Poly Haven / ambientCG PBR textures | CC0 | realistic: use as subtle detail maps under our palette, not as-is |
| Night sky | Poly Haven moonlit HDRI | CC0 | for reflections only (the camera never sees the horizon) |
| Sound | Kenney UI Audio, Interface Sounds | CC0 | compare with our synth set before swapping |

## How the showcase must be made (next step)
1. Download each candidate pack (in a session on the "Prototypegame" environment), into a scratch
   folder, never straight into the repo.
2. Render the real models **in the game's own night lighting and camera** (the preview page's stage),
   each beside the code-built object it would replace: a bed, a café counter, the locomotive, a tree,
   a passenger.
3. Publish one Artifact, "Asset Showcase": per game area, the candidates side by side with the current
   look, the licence, the pack's size and its cost in triangles and draw calls on a phone.
4. The owner picks; only then are assets added.

## Risks to weigh in the showcase
- **Performance:** today a carriage is one merged draw per material and the crowd one draw; imported
  models must be merged or instanced the same way (glTF → merged into `GeoBuilder` meshes at load), or
  phones lose 60 fps. Triangle budgets per carriage stay as in the soak test.
- **One look:** packs from different artists clash; pick one family per area (or one overall) and
  recolour to our palette (vertex colours / a palette texture), keeping the baked light map.
- **Layouts:** furniture sizes must match the floor plans (`layout.ts` footprints); the visibility,
  placement, doors and geometry audits must still pass.
- **Characters:** the reaction faces, carry stack, hats, sleep and sit poses and the pull batch all
  assume our own rig; swapping people is the biggest job of all.
- **Size:** the single HTML file is ~1.6 MB; glTF packs add megabytes (the owner allows ~300 MB in the
  app; the web Artifact is capped at 16 MB per file).
