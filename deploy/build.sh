#!/bin/bash
# Сглобява dist/ за Cloudflare (ffx.skoba.eu): само файловете, които играта зарежда,
# плюс лиценза и авторите. Качване: bash deploy/build.sh && npx wrangler@4 deploy
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cp -R index.html version.txt game assets dist/
cp LICENSE dist/LICENSE.txt
cp CREDITS dist/CREDITS.txt
cp deploy/og.jpg deploy/_headers deploy/robots.txt dist/
echo "dist: $(find dist -type f | wc -l | tr -d ' ') файла, $(du -sh dist | cut -f1)"
