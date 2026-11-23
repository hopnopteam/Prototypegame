# Photoreal carriage experiment (branch `graphics-experiment`)

The owner asked for the initial carriage rebuilt to match three reference images (photoreal, My Perfect Hotel-like
cut-away, daylight by the sea), with no compromise on quality. This is that carriage as a Blender scene, built
from code and path traced with Cycles. It is offline rendering: the step to the game is listed at the end.

## What is in it
- **The carriage** (`scene.py`): an 18 m × 5 m lobby carriage cut away at waist height. Crimson-lacquered panelled
  sides with brass lining, a brass cap rail, framed windows with glass, a dark skirt, bogies and wheels; cream
  partitions with gold-framed panels and crimson skirting; oak plank floors, a red corridor carpet with gold borders.
- **The lobby** (`props.py`): a walnut reception desk with a green leather top, brass edging, a service bell, an open
  ledger and pen, croissants on a china plate, a coffee cup, a banker's lamp; a Persian rug (drawn by
  `gen_textures.py`); a slatted luggage rack with strapped leather cases; a velvet sofa and armchairs, a side table,
  potted plants.
- **The suite** (cabin 1): a walnut bed with brass finials, a mattress, pillows and velvet cushions, a red satin
  quilt dropped onto it by a cloth simulation, nightstands with lamps that light the room, a clawfoot tub on
  brass feet with a brass mixer. Cabins 2 and 3 have single beds.
- **Outside**: geranium window boxes, a platform of stone flags with a kerb and a yellow safety line, a luggage
  barrow with cases and a hatbox, a striped coffee cart with urns and cups, Victorian lamp posts; on the sea side a
  lawn of real grass blades with daisies, buttercups and clover, a bench, a beach with boulders and an ocean.
- **People** (`people.py`): rigged Ready Player Me avatars posed in Blender (arms down from the A/T pose, relaxed
  fingers, a turn of the head), re-dressed: the conductor in navy with a modelled peaked cap, the attendant in an
  aubergine uniform with a pillbox hat and a tray (bottle and glass), a guest in a bowler, three more guests.
- **Light**: Blender's physical sky (multiple scattering) with a 3° sun from the sea side, AgX tone mapping,
  OpenImageDenoise.

## Running it
```
pip install bpy pillow numpy           # Blender 5.3 as a Python module (CPU Cycles)
./fetch_assets.sh                      # textures and avatars from GitHub mirrors
python unpack_textures.py && python gen_textures.py /tmp/claude-0/tex/img
(cd <dir with @gltf-transform installed> && node decode_avatars.mjs /tmp/claude-0/assets/people/rpm_*.glb)
python scene.py preview hero           # 432×768, 48 samples, ~1 min
python scene.py final hero             # 1080×1920, 192 samples
```
Shots: `hero` (lobby), `suite`, `platform`, `overview`. Switches: `GRASS=0`, `PEOPLE_ON=0`, `ALL_CABINS=0`,
`SUN_ROT=<deg>`, `SKY=<strength>`, `SAMPLES=<n>`, `SAVE_BLEND=1` (writes `carriage.blend`).

## Licences
Textures: Poly Haven and ambientCG (CC0), from GitHub mirrors. Avatars: Ready Player Me (three.js examples, and
the AI-DOJO repository); they are fine for this experiment, but their licence must be checked before any of them
ships in the game. Everything else is modelled here.

## Toward the game
Path tracing this on a phone is out of reach. The route that keeps the look is to bake it: Cycles bakes each
surface's lighting (sun, sky, bounce, contact shadow) into lightmaps on a second UV set, the scene is exported to
glTF, and three.js draws it with the baked light, plus a real-time sun shadow and soft blob shadows for moving
people, which is the technique top mobile games use for this look.
