# Riviera picks (Route 2 assets)

The tools behind `docs/riviera-assets/`. No game code is changed.

1. Download the packs into `<scratch>/dl/<pack dir>/` (itch.io: `python3 -I itch.py <page> <dir>`; OpenGameArt: the zip on each page). The d1mee pack is a RAR5 archive with file references, which `unar` and old p7zip cannot extract; `node-unrar-js` can.
2. `python3 -I prevbake.py <scratch> <repo> [category …]` bakes every candidate in `cands.py` exactly as the game does, into `<scratch>/prev/<category>/*.json`.
3. Serve `<scratch>/www` on port 8765, holding `stage.html`, a `three` link to the repo's `node_modules/three`, and links to `prev` and `final`. Then `S=<scratch> node shoot.mjs prev/<category> <tiles dir>` renders one midday tile per model, and `python3 -I sheet.py <tiles dir> <out.png> <title> [cols]` lays out the sheet.
4. `picks.py` was this pass's own selection (102 models) before it met the first pass; only the models in `adds.py` were kept.

5. Second pass, merged onto the first pass (commit 9a8ce27): `adds.py` lists the models added, `bring.py` copied their sources from the local branch and appended the `MODELS` entries, `frombin.py` dumps them from the baked binary for the sheets.
