#!/bin/bash
# Превръща екраните на оригинала от BMP/TIF в PNG и слага нужните в assets/ui.
# Оригиналите са в original_files/GFX и не се променят.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tools/gfx assets/ui
for f in source/original_files/GFX/*.bmp source/original_files/GFX/*.tif; do
  [ -e "$f" ] || continue
  n=$(basename "$f"); sips -s format png "$f" --out "tools/gfx/${n%.*}.png" >/dev/null
done
for n in splash punteggio1 DisplayRicarica DisplayDanni3 ffx; do
  cp "tools/gfx/$n.png" assets/ui/
done
echo "в assets/ui: $(ls assets/ui | tr '\n' ' ')"
