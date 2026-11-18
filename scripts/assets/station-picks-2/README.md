# Station Picks 2

The tools behind the "Station Picks 2" page (https://claude.ai/artifact/RtX12Ryuyp5MPcRF7t5DWL). No game code is changed.

1. Download the packs into `<scratch>/x/` (itch.io: `python3 -I ../station-picks/itch.py <page> <dir>`; Kenney kits from opengameart.org).
2. Build the stage: `ENTRY=scripts/assets/station-picks-stage.ts OUT=station-picks-stage.html node scripts/build.mjs`, copy it to `<scratch>/www/`, link `<scratch>/www/x` to `<scratch>/x`, serve `<scratch>/www` on port 8765.
3. `python3 -I catalog.py <scratch>` writes the specs and `catalog.json`; `node scripts/assets/station-picks-shoot.mjs http://localhost:8765 <scratch>/www/specs <scratch>/shots` renders them.
4. `crop.py`, then `page.py`, build `<scratch>/page/`; `collect.py <scratch> <repo>` copies the shown models and licences into `assets/models/candidates-station-2/` (textures at most 512 px).

The stage gained `on: '<name>'` (stand on a named model), `stretch` and `exterior` (today's train dressing) for this round.
