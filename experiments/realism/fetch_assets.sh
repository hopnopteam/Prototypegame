#!/usr/bin/env bash
# Fetch everything the photoreal carriage experiment uses into $ASSETS (default /tmp/claude-0).
# Sources are GitHub-hosted (the asset sites themselves are blocked on the Default environment).
set -euo pipefail
A=${ASSETS:-/tmp/claude-0}
mkdir -p "$A/tex" "$A/tex/img" "$A/assets/people"
cd "$A/tex"

# 2K PBR materials (Poly Haven / ambientCG, CC0) from the LuxCoreRender material library; zips hold .blend files
# with packed images, unpacked by unpack_textures.py.
LOL=https://media.githubusercontent.com/media/LuxCoreRender/LoL/master/material
for z in BrushedGold01_packed_2K Grass01_MR_2K PavingStones110_2K-JPG ScratchedGold01_packed_2K WoodFloor040_2K-JPG \
         WoodFloor051_2K-JPG aerial_grass_rock_2k american_walnut_1-2K blue_painted_planks_2k.blend clean_pebbles_2k \
         coast_sand_rocks_02_2k fabric_leather_02_2k.blend floor_pavement_2k.blend laminate_floor_02_2k.blend \
         large_square_pattern_01_2k.blend leather_red_02_2k.blend plank_flooring_2k.blend rock_boulder_dry_2k slab_tiles_2k \
         wood_table_001_2k.blend; do
  [ -f "$z.zip" ] || curl -sfL -o "$z.zip" "$LOL/$z.zip"
  mkdir -p "$z" && (cd "$z" && unzip -qo "../$z.zip")
done

# 1K Poly Haven fabrics and plaster (CC0)
YUR=https://media.githubusercontent.com/media/paralizovannyj-art/yuranchik_game/HEAD/assets/texture_library/polyhaven
for t in velour_velvet floral_jacquard white_plaster_02 terry_cloth okoume_veneer; do
  for k in diff nor_gl ao; do
    curl -sfL -o "img/yur__${t}_${k}_1k.jpg" "$YUR/$t/${t}_${k}_1k.jpg" || true
  done
done

# People: Ready Player Me avatars (three.js examples; AI-DOJO). Meshopt-compressed ones are decoded with
# gltf-transform (decode_avatars.mjs) before Blender can import them.
cd "$A/assets/people"
curl -sfL -o readyplayer.me.glb https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/readyplayer.me.glb
DOJO=https://media.githubusercontent.com/media/AaronFrancis05/AI-DOJO/HEAD/public/ai-avatars/models
for n in office_lady business_white_lady pink_smart_lady yellow_dress_lady black_coat_guy_cp; do
  curl -sfL -o "rpm_$n.glb" "$DOJO/$n.glb"
done
echo "now: python unpack_textures.py; python gen_textures.py $A/tex/img; node decode_avatars.mjs $A/assets/people/rpm_*.glb"
