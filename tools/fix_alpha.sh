#!/bin/bash
# Blender конверсията е изнесла текстурите като плътни PNG-та и е изгубила
# алфа каналите на оригиналните TGA/TIF файлове. Затова силуетите на
# хоризонта се виждаха като черна ивица, а дърветата и оградите — като
# правоъгълници. Тук същите текстури се вадят наново от original_files,
# със запазена прозрачност, в tools/alpha/.
set -euo pipefail
cd "$(dirname "$0")/.."
maps=source/original_files/3dmax/Maps
images=source/blender_conversion/images
mkdir -p tools/alpha

fixed=0
for src in "$maps"/*.tga "$maps"/*.TGA "$maps"/*.tif "$maps"/*.TIF; do
  [ -e "$src" ] || continue
  base=$(basename "$src"); name="${base%.*}"
  [ -e "$images/$name.png" ] || continue          # има ли изобщо такава текстура
  spp=$(sips --getProperty samplesPerPixel "$src" 2>/dev/null | awk '/samplesPerPixel/{print $2}')
  [ "${spp:-3}" -ge 4 ] 2>/dev/null || continue   # само тези с алфа канал
  sips -s format png "$src" --out "tools/alpha/$name.png" >/dev/null
  echo "  $name"
  fixed=$((fixed+1))
done
echo "текстури с върната прозрачност: $fixed"
