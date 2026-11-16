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

## Session 48: the showcase (done)
Published: **Asset Showcase**, https://claude.ai/artifact/XtkRvN957Hq6BNo3tqG4Rh (private until shared). Every candidate
was downloaded and rendered in the game's own `Stage` (moonlit night, tone map, grade, the 30°/48°/33° camera) at phone
resolution, beside today's code-built look (shot from `dist/preview.html`). Models shown untouched, with a warm point
light per room standing in for the baked lamplight.

### Where the packs came from (all licences read in the packs: every one CC0)
- itch.io free downloads (the page's own $0 download flow; files served from an `itchio-mirror…r2.cloudflarestorage.com`
  host, which the proxy allowed): Quaternius Universal Base Characters, Universal Animation Library 1 and 2, Stylized
  Nature MegaKit, Medieval Village MegaKit (Standard = free subsets); KayKit Furniture Bits, Restaurant Bits, City
  Builder Bits, Forest Nature Pack, Holiday Bits, Adventurers 2.0, Character Animations 1.1 (free editions).
- OpenGameArt: Kenney Train Kit 1.1, Food Kit 2.0, Holiday Kit 2.0, City Kit Suburban 2.0, Nature Kit 2.1, Furniture
  Pack 1.0 (the older Furniture Kit); Quaternius Ultimate House Interior (June 2020), Ultimate Food Pack (Oct 2019).
- Not reachable: kenney.nl (403 from the site itself), Poly Pizza (bot check), Quaternius's Google Drive-only packs
  (Modular Train, Ultimate Furniture, Textured Buildings: "quota exceeded"), api.sketchfab.com (not allowed here).

### Recommendation (the owner decides)
- **KayKit as the house style** for furniture, venues, the platform and the lakeside: the only family whose soft,
  chunky shapes match our figures; one 1024² palette texture per pack, so models bake to vertex colours and merge into
  the carriage meshes (one draw per material stays). A furnished room ≈ 2,500–4,800 triangles; ~20–60 KB a model.
- **Kenney Food Kit** for every food and drink item (tea, coffee, sandwich, croissant, cake, cocktail, wine, dinners);
  **Kenney City Kit Suburban** for village cottages (KayKit's city is urban).
- **Quaternius House Interior** for what KayKit lacks (bath, toilet, sink, mirror, houseplants, chandelier), recoloured.
- **Keep ours**: locomotive and carriage shells (cut-away, liveries, classes, light bake), the people, the cinema seats.
- Shortfalls: the free KayKit editions are small (Furniture Bits 53 models, no plants, no reception desk, espresso
  machine or bar counter); each has a CC0 EXTRA edition for a few dollars (Furniture Bits $3.95+). No pack has cinema
  seats. Quaternius Stylized Nature is the prettiest scenery but 24 MB of textures and alpha leaves: too heavy.
- People: KayKit figures are fantasy outfits at 6–9k triangles each (~300k for 40 guests); Quaternius base characters
  are realistic bodies in underwear, 14k triangles and 4K textures. Neither fits; both ship the animations we would
  need (sit, lie down, wave, carry, walk), so Mixamo is not needed.

### Tooling (scratch, not in the repo)
A stage page built from `src/world/Stage` + `Scenery` with GLTF/OBJ/FBX loaders and a JSON scene spec per shot;
Quaternius OBJ colours need converting (their MTL Kd is linear); the game camera's near plane (8 m) means close-ups
need a lower near plane. Rebuild it the same way for the integration step's comparison shots.

## Session 49: integration, step 1 (done)
- Pipeline: `scripts/assets/bake_models.py` → `assets/models/models.bin` + `src/world/models/modelIndex.ts`;
  `GeoBuilder.model(id, x, y, z, rotY, sx, sy, sz, { recolor, tone, shade, surface })`; recolour by hue band.
- In the game: KayKit beds, sofas, armchairs; KayKit round trees, bushes, rocks. Pines, grand beds, iron cots stay ours.
- Textures: Poly Haven detail layers (wood grain, herringbone, linen, grass) in one texture array; `PartStyle.detail`.
- ambientCG's file host (acg-download.struffelproductions.com) is not allowed here; Poly Haven covered every need.
- Next: venues (KayKit Restaurant Bits tables, chairs, counters), platform props (KayKit City), village (Kenney City Kit
  Suburban), food items (Kenney Food Kit), then Quaternius washroom pieces.
